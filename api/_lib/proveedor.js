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
// El mismo escritor de WAV que usa el navegador: una sola forma de audio en todo el
// sistema, venga del camino que venga.
import { escribirWav } from '../../comun/audio.mjs';

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

export async function texto({
  instruccion,
  sistema,
  esquema,
  temperatura = 0.7,
  maxTokens = 8192,
  buscarEnInternet = false,
  modelo: pedido = '',
}) {
  // El proyecto puede fijar su modelo; si no, manda el del entorno. Poder cambiarlo
  // desde la pantalla evita tener que tocar variables de entorno y redesplegar solo
  // para probar un modelo nuevo.
  const modelo = pedido || process.env.MODELO_TEXTO || 'gemini-2.5-pro';

  // Con búsqueda en internet NO se pide salida estructurada: la herramienta de
  // búsqueda y el esquema de respuesta no conviven en todas las versiones del
  // modelo, y cuando chocan el error que devuelven no dice que sea eso. Se pide el
  // JSON en el texto de la instrucción y se extrae con tolerancia, que funciona en
  // los dos casos.
  const conEsquema = esquema && !buscarEnInternet;

  const cuerpo = {
    contents: [{ role: 'user', parts: [{ text: instruccion }] }],
    generationConfig: {
      temperature: temperatura,
      maxOutputTokens: maxTokens,
      ...(conEsquema ? { responseMimeType: 'application/json', responseSchema: esquema } : {}),
    },
  };
  if (sistema) cuerpo.systemInstruction = { parts: [{ text: sistema }] };
  if (buscarEnInternet) cuerpo.tools = [{ googleSearch: {} }];

  const datos = await pedir(`${base()}/${modelo}:generateContent`, cuerpo);
  const candidato = datos?.candidates?.[0];
  const partes = candidato?.content?.parts || [];
  const salida = partes.map((p) => p.text || '').join('');

  if (!salida.trim()) {
    const motivo = candidato?.finishReason || 'sin motivo declarado';
    throw new Error(`El modelo de texto no devolvió nada (${motivo}).`);
  }

  // Las fuentes que el modelo consultó de verdad. En un documental esto no es un
  // extra: es lo que permite que una afirmación apunte a algo comprobable (§8.1).
  const fuentes = (candidato?.groundingMetadata?.groundingChunks || [])
    .map((c) => ({ titulo: c.web?.title || '', enlace: c.web?.uri || '' }))
    .filter((f) => f.enlace);

  if (!esquema) return { texto: salida, fuentes };
  return { texto: salida, fuentes, json: extraerJson(salida) };
}

/**
 * Saca el JSON de una respuesta que puede venir envuelta.
 *
 * Cuando se pide salida estructurada, el modelo devuelve JSON limpio. Cuando además
 * busca en internet, devuelve texto que CONTIENE el JSON —con vallas de código
 * delante, o una frase de cortesía—. Esto aguanta las dos formas en vez de fallar
 * con «devolvió otra cosa», que no le dice nada a nadie.
 */
function extraerJson(texto) {
  const limpio = texto
    .replace(/^[\s\S]*?```(?:json)?\s*/i, (m) => (m.includes('```') ? '' : m))
    .replace(/```[\s\S]*$/, '')
    .trim();

  for (const candidato of [limpio, texto]) {
    try {
      return JSON.parse(candidato);
    } catch {
      /* se prueba la siguiente forma */
    }
    // Último recurso: el primer objeto equilibrado que haya dentro.
    const i = candidato.indexOf('{');
    if (i >= 0) {
      let n = 0;
      for (let k = i; k < candidato.length; k++) {
        if (candidato[k] === '{') n++;
        else if (candidato[k] === '}' && --n === 0) {
          try {
            return JSON.parse(candidato.slice(i, k + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new Error('El modelo debía devolver JSON y no se pudo leer nada aprovechable.');
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
// Las regiones que valen. España NO: este canal narra en español latino, y una voz
// de España en medio de una narración latina se oye como otro narrador.
const REGIONES_LATINAS = { 'es-US': 'Latino', 'es-MX': 'México', 'es-419': 'Latino' };

// Las de entrega VARIABLE. Suenan mejor en una frase suelta y peor en quince
// minutos, porque cada llamada la interpretan de nuevo (§7.9).
const ES_EXPRESIVA = /chirp|studio|journey/i;

/**
 * @param expresivas  Incluir las voces de entrega variable (Chirp, Studio, Journey).
 *
 * §7.9 dice que en narración larga estas voces interpretan cada llamada como una
 * actuación nueva y la voz cambia cada cuarenta y cinco segundos. Por eso van
 * APAGADAS por defecto. Pero la decisión es de quien narra, no mía: quien quiera
 * oírlas las enciende, y la etiqueta le dice cuál es cuál.
 */
export async function vocesDisponibles(idioma = 'es', expresivas = false, genero = 'MALE') {
  const token = await tokenDeAcceso();
  const r = await fetch(`${VOZ_API}/voices?languageCode=${encodeURIComponent(idioma)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`No se pudo leer el catálogo de voces: ${datos?.error?.message || r.status}`);

  const GENEROS = { MALE: 'masculina', FEMALE: 'femenina', NEUTRAL: 'neutra' };

  const deGemini = expresivas
    ? VOCES_GEMINI.filter(([, , g]) => !genero || g === genero).map(([n, c]) => ({
        nombre: `${PREFIJO_GEMINI}${n}`,
        region: 'gemini',
        genero: '',
        expresiva: true,
        familia: 'Gemini TTS',
        etiqueta: `${n} · ${c} · Gemini`,
      }))
    : [];

  return (datos.voices || [])
    // §7.10: se listaron todas y salieron cien, la mayoría del idioma equivocado y
    // con nombres idénticos a las buenas. Aquí se filtra por región Y por variante.
    //
    // Fuera España: el canal narra en latino y una voz peninsular en medio suena a
    // otro narrador. Y fuera las expresivas de entrega variable, que en narración
    // larga cambian de tono entre llamadas (§7.9).
    .filter((v) => REGIONES_LATINAS[v.languageCodes?.[0]])
    // El canal narra con voz masculina. Filtrar aquí y no en la pantalla evita que
    // una voz descartada llegue a estar seleccionable por un descuido.
    .filter((v) => !genero || v.ssmlGender === genero)
    .filter((v) => expresivas || !ES_EXPRESIVA.test(v.name))
    .map((v) => {
      const reg = v.languageCodes?.[0] || '';
      const variable = ES_EXPRESIVA.test(v.name);
      return {
        nombre: v.name,
        region: reg,
        genero: GENEROS[v.ssmlGender] || '',
        // Que viaje marcada es lo que permite avisar en pantalla en vez de que se
        // descubra oyendo el video montado con quince narradores distintos.
        expresiva: variable,
        // La etiqueta lleva la región y el género dentro: sin eso, dos voces
        // distintas se ven idénticas en el desplegable.
        etiqueta:
          `${v.name.split('-').slice(2).join('-')} · ${REGIONES_LATINAS[reg]} · ` +
          `${GENEROS[v.ssmlGender] || ''}${variable ? ' · expresiva' : ''}`,
      };
    })
    .concat(deGemini)
    // Las de entrega fija primero: son las que sirven para narrar quince minutos.
    .sort(
      (a, b) =>
        Number(a.expresiva) - Number(b.expresiva) ||
        a.genero.localeCompare(b.genero) ||
        a.nombre.localeCompare(b.nombre),
    );
}

// ── Voz de Gemini (Vertex AI) ─────────────────────────────────────────────────
//
// Otro camino, no otro proveedor: sigue siendo Vertex, con la misma cuenta y la
// misma región. Lo que cambia es el endpoint —generateContent pidiendo audio en vez
// de texto— y que la voz se elige por nombre propio (Kore, Puck…) en lugar de por
// código de idioma.
//
// Devuelve PCM CRUDO, sin cabecera. Se le pone la de WAV aquí, con el mismo escritor
// que usa el resto del sistema, para que aguas abajo no haya dos clases de audio: la
// narración mide duraciones y corta por silencios, y no puede estar preguntándose de
// dónde vino cada trozo.

// Las voces que ofrece Gemini TTS. Es una lista cerrada del proveedor, no del
// idioma: cada una habla el idioma del texto que se le da.
// El género no lo devuelve la API para estas voces —solo da la lista de nombres—,
// así que va aquí, tomado de la documentación de voces del proveedor. Si alguna
// suena distinta a lo que dice esta tabla, se corrige aquí y en ningún otro sitio.
export const VOCES_GEMINI = [
  // Masculinas
  ['Charon', 'informativa', 'MALE'],
  ['Orus', 'firme', 'MALE'],
  ['Algenib', 'grave', 'MALE'],
  ['Alnilam', 'firme', 'MALE'],
  ['Rasalgethi', 'informativa', 'MALE'],
  ['Iapetus', 'clara', 'MALE'],
  ['Schedar', 'pareja', 'MALE'],
  ['Umbriel', 'tranquila', 'MALE'],
  ['Algieba', 'suave', 'MALE'],
  ['Enceladus', 'susurrada', 'MALE'],
  ['Achird', 'cercana', 'MALE'],
  ['Zubenelgenubi', 'informal', 'MALE'],
  ['Sadachbia', 'viva', 'MALE'],
  ['Sadaltager', 'entendida', 'MALE'],
  ['Puck', 'animada', 'MALE'],
  ['Fenrir', 'excitable', 'MALE'],
  // Femeninas
  ['Kore', 'firme', 'FEMALE'],
  ['Zephyr', 'brillante', 'FEMALE'],
  ['Leda', 'juvenil', 'FEMALE'],
  ['Aoede', 'ligera', 'FEMALE'],
  ['Callirrhoe', 'relajada', 'FEMALE'],
  ['Autonoe', 'brillante', 'FEMALE'],
  ['Despina', 'suave', 'FEMALE'],
  ['Erinome', 'clara', 'FEMALE'],
  ['Laomedeia', 'animada', 'FEMALE'],
  ['Achernar', 'suave', 'FEMALE'],
  ['Gacrux', 'madura', 'FEMALE'],
  ['Pulcherrima', 'directa', 'FEMALE'],
  ['Vindemiatrix', 'amable', 'FEMALE'],
  ['Sulafat', 'cálida', 'FEMALE'],
];

const PREFIJO_GEMINI = 'gemini:';
export const esVozGemini = (v) => String(v || '').startsWith(PREFIJO_GEMINI);

export async function vozGemini({ texto: t, nombreVoz, estilo = '' }) {
  const modelo = process.env.MODELO_VOZ_GEMINI || 'gemini-2.5-flash-preview-tts';
  const voz = String(nombreVoz).replace(PREFIJO_GEMINI, '') || 'Kore';

  // §7.9: estas voces interpretan cada llamada por su cuenta. Mandar SIEMPRE la
  // misma indicación de estilo es lo que más acerca la llamada 23 a la llamada 1.
  // No lo arregla del todo, pero la diferencia entre mandarla y no mandarla es
  // grande, y el usuario puede afinarla desde los ajustes.
  const brief = estilo || 'Narra en tono documental, sobrio y parejo, ritmo constante, sin dramatizar.';

  const datos = await pedir(`${base()}/${modelo}:generateContent`, {
    contents: [{ role: 'user', parts: [{ text: `${brief}\n\n${t}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } },
    },
  });

  const parte = (datos?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!parte) {
    const motivo = datos?.candidates?.[0]?.finishReason || 'sin motivo declarado';
    throw new Error(`La voz de Gemini no devolvió audio (${motivo}).`);
  }

  const crudo = Buffer.from(parte.inlineData.data, 'base64');
  const frecuencia = Number(/rate=(\d+)/.exec(parte.inlineData.mimeType || '')?.[1]) || 24000;

  // PCM crudo → WAV, con el escritor común. Un byte impar al final rompería el
  // Int16Array, así que se recorta a par.
  const muestras = new Int16Array(
    crudo.buffer.slice(crudo.byteOffset, crudo.byteOffset + (crudo.byteLength & ~1)),
  );
  const wav = escribirWav({ muestras, frecuencia, canales: 1 });
  return { datos: Buffer.from(wav).toString('base64'), tipo: 'audio/wav' };
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

// ── Catálogo de modelos ───────────────────────────────────────────────────────
//
// Qué modelos tiene DE VERDAD este proyecto, preguntándoselo al proveedor en vez de
// llevar una lista escrita a mano que envejece sola.
//
// El listado de modelos de publicador ha cambiado de forma varias veces y no todas
// las regiones responden a la misma. La primera versión de esto usaba una sola URL
// y daba 404, y el usuario se quedaba con el selector vacío sin saber por qué. Se
// prueban las formas conocidas por orden y se usa la primera que conteste; si
// ninguna lo hace, se devuelve una lista de reserva Y se dice que es de reserva, en
// vez de dejar el desplegable en blanco.

function urlsDelCatalogo() {
  const R = region();
  const P = proyecto();
  return [
    `https://${R}-aiplatform.googleapis.com/v1beta1/projects/${P}/locations/${R}/publishers/google/models`,
    `https://${R}-aiplatform.googleapis.com/v1/projects/${P}/locations/${R}/publishers/google/models`,
    `https://${R}-aiplatform.googleapis.com/v1beta1/publishers/google/models`,
    `https://${R}-aiplatform.googleapis.com/v1/publishers/google/models`,
  ];
}

// Los candidatos que se PRUEBAN uno a uno cuando el listado no contesta.
//
// Esto no es una lista de lo que hay: es una lista de lo que se pregunta. A cada uno
// se le manda una petición mínima y se queda el que responde. Preguntar es la única
// forma de saberlo de verdad —una lista escrita a mano dice lo que yo creía el día
// que la escribí, y eso fue justo lo que dejó al director dos generaciones atrás—.
//
// Que sobre un candidato no cuesta nada: un modelo que no existe contesta 404 al
// instante. Que falte, sí cuesta. Así que la lista peca de larga a propósito.
const CANDIDATOS_TEXTO = [
  'gemini-3.1-pro', 'gemini-3.1-flash',
  'gemini-3-pro', 'gemini-3-flash',
  'gemini-3.0-pro', 'gemini-3.0-flash',
  'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
  'gemini-2.0-flash', 'gemini-2.0-flash-lite',
];

export async function modelosDisponibles() {
  const token = await tokenDeAcceso();
  const intentos = [];

  for (const url of urlsDelCatalogo()) {
    let r;
    try {
      r = await fetch(`${url}?pageSize=400`, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      intentos.push(`${url.split('/v1')[1]}: ${e.message}`);
      continue;
    }
    if (!r.ok) {
      intentos.push(`…${url.slice(url.indexOf('/v1'))}: HTTP ${r.status}`);
      continue;
    }
    const datos = await r.json().catch(() => ({}));
    const lista = datos.publisherModels || datos.models || [];
    const salida = clasificar(lista.map((m) => String(m.name || m.versionId || '').split('/').pop()));
    if (salida.texto?.length) return { ...salida, deReserva: false };
    intentos.push(`…${url.slice(url.indexOf('/v1'))}: contestó sin modelos de texto`);
  }

  // El listado no contesta. Se pregunta a los modelos uno a uno: es más lento pero
  // es la verdad, no una suposición.
  const vivos = await probarCandidatos(token);
  return {
    ...clasificar(vivos),
    porSondeo: true,
    // Qué se intentó, para que el fallo se pueda arreglar en vez de solo verse.
    intentos,
  };
}

/**
 * Pregunta a cada candidato si existe, con la petición más pequeña posible.
 *
 * Un modelo que no está devuelve 404 al instante, así que sobrar candidatos no
 * cuesta. Todas van a la vez: en serie serían diez segundos y esto corre dentro de
 * una función con sesenta.
 */
async function probarCandidatos(token) {
  const uno = async (id) => {
    try {
      const r = await fetch(`${base()}/${id}:generateContent`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'ok' }] }],
          generationConfig: { maxOutputTokens: 1, temperature: 0 },
        }),
      });
      // 200 es que existe y responde. 429 es que existe y está saturado —también
      // cuenta—. 404 y 403 son que no lo tienes.
      return r.ok || r.status === 429 ? id : null;
    } catch {
      return null;
    }
  };
  return (await Promise.all(CANDIDATOS_TEXTO.map(uno))).filter(Boolean);
}

function clasificar(ids) {
  const familia = (n) =>
    /veo/i.test(n) ? 'video'
      : /image|imagen/i.test(n) ? 'imagen'
      : /lyria|music/i.test(n) ? 'musica'
      : /gemini/i.test(n) ? 'texto'
      : null;

  const salida = {};
  for (const id of ids) {
    if (!id) continue;
    // Fuera lo que no admite peticiones normales: ofrecer un modelo que va a fallar
    // es peor que no ofrecerlo.
    if (/-tuning|embedding|@\d|-it$|vision$/i.test(id)) continue;
    const f = familia(id);
    if (!f) continue;
    (salida[f] ||= []).push({ id, etiqueta: id });
  }
  for (const f of Object.keys(salida)) {
    const vistos = new Set();
    salida[f] = salida[f]
      .filter((m) => !vistos.has(m.id) && vistos.add(m.id))
      // Los más nuevos primero: es lo que casi siempre se quiere.
      .sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }));
  }
  return salida;
}

/** Cuál se está usando ahora mismo, para poder enseñarlo al lado del selector. */
export const modelosEnUso = () => ({
  texto: process.env.MODELO_TEXTO || 'gemini-2.5-pro',
  imagen: process.env.MODELO_IMAGEN || 'gemini-2.5-flash-image',
  video: process.env.MODELO_VIDEO || 'veo-3.1-generate-preview',
  musica: process.env.MODELO_MUSICA || 'lyria-002',
});
