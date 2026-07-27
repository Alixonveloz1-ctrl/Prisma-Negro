// El proveedor de IA (§2 del plano).
//
// La función firma un token con la cuenta de servicio, reenvía la petición y
// devuelve la respuesta. Aquí vive el «reenvía»: una envoltura por familia de
// modelo, con los nombres de modelo en variables de entorno para poder cambiarlos
// sin tocar código.
//
// Nada de lo que sale de aquí baja crudo al navegador: pasa antes por el censor.

import { tokenDeAcceso, olvidarToken } from './token.js';
import { cifrar, descifrar } from './cifrado.js';
// El identificador del proyecto sale del JSON de la cuenta de servicio, que ya lo
// trae dentro. Un sitio solo lo resuelve.
import { proyecto } from './cuenta.js';
import { valor as valorEntorno } from './entorno.js';

// §6: los generadores de video tienen listas CERRADAS de duración. Se pide la más
// cercana a lo que dura la locución y se congela el último fotograma para el resto.
export const DURACIONES_VIDEO = [4, 6, 8];

// §6: la voz limita el texto por llamada. Presupuesto en bytes, no en caracteres:
// una tilde ocupa dos.
export const TOPE_BYTES_VOZ = 4000;

function region() {
  return valorEntorno('regionIA', 'us-central1');
}

function base() {
  return `https://${region()}-aiplatform.googleapis.com/v1/projects/${proyecto()}/locations/${region()}/publishers/google/models`;
}

async function pedir(url, cuerpo) {
  let token = await tokenDeAcceso();
  const hacer = (t) =>
    fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });

  let r = await hacer(token);
  if (r.status === 401) {
    olvidarToken();
    token = await tokenDeAcceso();
    r = await hacer(token);
  }

  const texto = await r.text();
  let datos;
  try {
    datos = texto ? JSON.parse(texto) : {};
  } catch {
    datos = { crudo: texto.slice(0, 600) };
  }

  if (!r.ok) {
    const msg = datos?.error?.message || datos?.crudo || `HTTP ${r.status}`;
    const e = new Error(`El proveedor de IA rechazó la petición: ${msg}`);
    e.estado = r.status;
    throw e;
  }
  return datos;
}

// ── Texto ─────────────────────────────────────────────────────────────────────
// Una llamada por pieza, no por toma (§4.4): más barato y mucho más coherente.
// Cuando se pide `esquema`, el modelo devuelve JSON estructurado y aquí se entrega
// ya parseado. Nadie aguas abajo tiene que adivinar si vino texto o JSON.

export async function texto({ instruccion, sistema, esquema, temperatura = 0.7, maxTokens = 8192 }) {
  const modelo = process.env.MODELO_TEXTO || 'gemini-2.5-pro';
  const cuerpo = {
    contents: [{ role: 'user', parts: [{ text: instruccion }] }],
    generationConfig: {
      temperature: temperatura,
      maxOutputTokens: maxTokens,
      ...(esquema
        ? { responseMimeType: 'application/json', responseSchema: esquema }
        : {}),
    },
  };
  if (sistema) cuerpo.systemInstruction = { parts: [{ text: sistema }] };

  const datos = await pedir(`${base()}/${modelo}:generateContent`, cuerpo);
  const partes = datos?.candidates?.[0]?.content?.parts || [];
  const salida = partes.map((p) => p.text || '').join('');

  if (!salida.trim()) {
    const motivo = datos?.candidates?.[0]?.finishReason || 'sin motivo declarado';
    throw new Error(`El modelo de texto no devolvió nada (${motivo}).`);
  }

  if (!esquema) return { texto: salida };
  try {
    return { texto: salida, json: JSON.parse(salida) };
  } catch {
    throw new Error('El modelo debía devolver JSON estructurado y devolvió otra cosa.');
  }
}

// ── Imagen ────────────────────────────────────────────────────────────────────
// §4.6: el modelo tiene que aceptar IMÁGENES DE REFERENCIA para que los sujetos y
// los lugares se parezcan entre tomas. No todos lo hacen.
//
// Las referencias llegan ya reducidas desde el navegador (§6). Aquí NO se reduce
// nada: si llega algo grande es un fallo aguas arriba y se dice.

const TOPE_REFERENCIA_BYTES = 1.2 * 1024 * 1024;

export async function imagen({ instruccion, referencias = [], aspecto = '16:9' }) {
  const modelo = process.env.MODELO_IMAGEN || 'gemini-2.5-flash-image';

  for (const [i, ref] of referencias.entries()) {
    const bytes = Buffer.byteLength(ref.datos || '', 'base64');
    if (bytes > TOPE_REFERENCIA_BYTES) {
      throw new Error(
        `La imagen de referencia ${i + 1} llegó sin reducir (${(bytes / 1024 / 1024).toFixed(2)} MB). ` +
          'Toda imagen que se envía se reduce antes, a ~1024 px de lado. Sin excepciones.',
      );
    }
  }

  const partes = [
    ...referencias.map((r) => ({
      inlineData: { mimeType: r.tipo || 'image/jpeg', data: r.datos },
    })),
    { text: instruccion },
  ];

  const datos = await pedir(`${base()}/${modelo}:generateContent`, {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: aspecto },
    },
  });

  const salida = (datos?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!salida) {
    const motivo = datos?.candidates?.[0]?.finishReason || 'sin motivo declarado';
    throw new Error(`El modelo de imagen no devolvió imagen (${motivo}).`);
  }
  return {
    datos: salida.inlineData.data,
    tipo: salida.inlineData.mimeType || 'image/png',
  };
}

// ── Video ─────────────────────────────────────────────────────────────────────
// Tarda más de 60 s: es una OPERACIÓN (§6). Se arranca, se devuelve un
// identificador CIFRADO y el navegador consulta cada N segundos.
//
// El identificador crudo lleva dentro el número de proyecto. Si viajara en claro,
// el censor lo borraría y la consulta siguiente fallaría con un error
// incomprensible (§6). Por eso se cifra.

export function duracionMasCercana(segundos) {
  return DURACIONES_VIDEO.reduce((a, b) =>
    Math.abs(b - segundos) < Math.abs(a - segundos) ? b : a,
  );
}

export async function videoIniciar({ instruccion, fotograma, segundos = 6, aspecto = '16:9' }) {
  const modelo = process.env.MODELO_VIDEO || 'veo-3.1-generate-preview';
  const duracion = duracionMasCercana(segundos);

  const instancia = { prompt: instruccion };
  if (fotograma) {
    instancia.image = {
      bytesBase64Encoded: fotograma.datos,
      mimeType: fotograma.tipo || 'image/png',
    };
  }

  const datos = await pedir(`${base()}/${modelo}:predictLongRunning`, {
    instances: [instancia],
    parameters: { durationSeconds: duracion, aspectRatio: aspecto, sampleCount: 1 },
  });

  if (!datos.name) throw new Error('El generador de video no devolvió un identificador de operación.');
  return { operacion: cifrar(datos.name), duracion };
}

export async function videoConsultar(referencia) {
  const nombre = descifrar(referencia);
  const modelo = process.env.MODELO_VIDEO || 'veo-3.1-generate-preview';
  const datos = await pedir(`${base()}/${modelo}:fetchPredictOperation`, { operationName: nombre });

  if (!datos.done) return { listo: false };
  if (datos.error) {
    throw new Error(`El generador de video falló: ${datos.error.message || 'sin mensaje'}`);
  }

  const muestras =
    datos?.response?.videos || datos?.response?.generatedSamples || datos?.response?.predictions || [];
  const primera = muestras[0];
  const b64 =
    primera?.bytesBase64Encoded || primera?.video?.bytesBase64Encoded || primera?.videoBytes;
  if (!b64) throw new Error('El generador de video terminó pero no devolvió video.');

  return { listo: true, datos: b64, tipo: 'video/mp4' };
}

// ── Voz ───────────────────────────────────────────────────────────────────────
// §7.9: para narración larga se elige CONSISTENCIA sobre expresividad. Los modelos
// más expresivos interpretan cada llamada como una actuación nueva y la voz cambia
// cada cuarenta y cinco segundos. Inaceptable en quince minutos de narración.
//
// Se pide LINEAR16 (PCM) a propósito: la voz nunca se corta ni se pega comprimida
// (§5, punto 3).

const VOZ_API = 'https://texttospeech.googleapis.com/v1';

export async function voz({ texto: t, nombreVoz, velocidad = 1.0, tono = 0 }) {
  const bytes = Buffer.byteLength(t, 'utf8');
  if (bytes > TOPE_BYTES_VOZ) {
    throw new Error(
      `El bloque de narración ocupa ${bytes} bytes y el tope por llamada es ${TOPE_BYTES_VOZ}. ` +
        'Repártelo en más bloques.',
    );
  }

  let token = await tokenDeAcceso();
  const hacer = (tk) =>
    fetch(`${VOZ_API}/text:synthesize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: t },
        voice: {
          languageCode: (nombreVoz || 'es-US-Neural2-B').split('-').slice(0, 2).join('-'),
          name: nombreVoz || 'es-US-Neural2-B',
        },
        audioConfig: {
          audioEncoding: 'LINEAR16',
          sampleRateHertz: 24000,
          speakingRate: velocidad,
          pitch: tono,
        },
      }),
    });

  let r = await hacer(token);
  if (r.status === 401) {
    olvidarToken();
    token = await tokenDeAcceso();
    r = await hacer(token);
  }

  const datos = await r.json().catch(() => ({}));
  if (!r.ok || !datos.audioContent) {
    throw new Error(`El servicio de voz falló: ${datos?.error?.message || `HTTP ${r.status}`}`);
  }
  return { datos: datos.audioContent, tipo: 'audio/wav' };
}

/**
 * Catálogo de voces (§7.10).
 * Se listaron todas las disponibles y aparecieron cien, la mayoría del idioma
 * equivocado y con nombres idénticos a las buenas. Aquí se filtra por región y se
 * MUESTRA la región en la etiqueta.
 */
export async function vocesDisponibles(idioma = 'es') {
  const token = await tokenDeAcceso();
  const r = await fetch(`${VOZ_API}/voices?languageCode=${encodeURIComponent(idioma)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`No se pudo leer el catálogo de voces: ${datos?.error?.message || r.status}`);

  const REGIONES = { 'es-US': 'Latino (EE. UU.)', 'es-ES': 'España', 'es-MX': 'México' };
  const GENEROS = { MALE: 'masculina', FEMALE: 'femenina', NEUTRAL: 'neutra' };

  return (datos.voices || [])
    // Fuera las expresivas de entrega variable: en narración larga cambian de tono
    // entre llamadas (§7.9).
    .filter((v) => !/chirp|studio|journey/i.test(v.name))
    .map((v) => {
      const reg = v.languageCodes?.[0] || '';
      return {
        nombre: v.name,
        region: reg,
        genero: GENEROS[v.ssmlGender] || '',
        // La etiqueta lleva la región dentro: sin eso, dos voces distintas se ven
        // idénticas en el desplegable.
        etiqueta: `${v.name.split('-').slice(2).join('-')} · ${REGIONES[reg] || reg} · ${GENEROS[v.ssmlGender] || ''}`,
      };
    })
    .sort((a, b) => a.region.localeCompare(b.region) || a.nombre.localeCompare(b.nombre));
}

// ── Música ────────────────────────────────────────────────────────────────────
// Una pieza por escena (§4.8), a partir de una descripción de atmósfera derivada de
// la ficha de escena.

export async function musica({ instruccion, segundos = 30 }) {
  const modelo = process.env.MODELO_MUSICA || 'lyria-002';
  const datos = await pedir(`${base()}/${modelo}:predict`, {
    instances: [{ prompt: instruccion }],
    parameters: { sample_count: 1, duration_seconds: Math.min(Math.max(segundos, 10), 120) },
  });

  const p = datos?.predictions?.[0];
  const b64 = p?.bytesBase64Encoded || p?.audioContent;
  if (!b64) throw new Error('El modelo de música no devolvió audio.');
  return { datos: b64, tipo: p?.mimeType || 'audio/wav' };
}
