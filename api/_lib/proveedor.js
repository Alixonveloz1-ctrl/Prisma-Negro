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
// El catálogo de generadores. Fijo y escrito a mano a propósito: ver la cabecera
// de ese archivo, que cuenta los dos fallos que tuvo sondearlo.
import {
  CATALOGO, PREDETERMINADO, grafiasDe, etiquetaDe,
  regionDe, hostDe, modalidadesDe, admiteTamanoImagen, duracionValida,
} from '../../comun/modelos.mjs';

// §6: los generadores de video tienen listas CERRADAS de duración. Se pide la más
// cercana a lo que dura la locución y se congela el último fotograma para el resto.
export const DURACIONES_VIDEO = [4, 6, 8];

// §6: la voz limita el texto por llamada. Presupuesto en bytes, no en caracteres:
// una tilde ocupa dos.
export const TOPE_BYTES_VOZ = 4000;

function region() {
  return valorEntorno('regionIA', 'us-central1');
}

/**
 * La dirección de UN modelo concreto, en SU región.
 *
 * No hay una «región del proyecto»: los `gemini-3*` se sirven en `global` y el
 * resto en la región configurada. Con una sola región para todos, la mitad del
 * catálogo contesta 404 —y un 404 se lee como «no tienes ese modelo», que es
 * exactamente la conclusión equivocada a la que llegó la herramienta—.
 */
export function rutaDeModelo(id) {
  const r = regionDe(id, region());
  return `https://${hostDe(r)}/v1/projects/${proyecto()}/locations/${r}/publishers/google/models/${id}`;
}
const rutaDe = rutaDeModelo;

/**
 * Una llamada al modelo que el usuario eligió, probando sus grafías conocidas.
 *
 * Vertex publica el mismo modelo con dos nombres —el de preview y el definitivo—
 * y cuál está vivo cambia con el tiempo sin avisar. El usuario eligió UN
 * generador, no una grafía: aquí se prueba la preferida y, solo si contesta «eso
 * no existe» (404) o «no lo tienes» (403), se prueba la siguiente.
 *
 * La que conteste se recuerda mientras viva la función, así que esto cuesta un
 * viaje de más UNA vez, y nunca genera nada de más: un 404 no cobra.
 *
 * Cualquier otro error —cuota, contenido rechazado, petición mal formada— se
 * lanza tal cual. Reintentar con otra grafía ahí solo escondería el motivo real.
 */
const GRAFIA_BUENA = new Map();

async function conGrafias(familia, clave, hacer) {
  const grafias = grafiasDe(familia, clave);
  if (!grafias.length) throw new Error(`No hay ningún generador de ${familia} en el catálogo.`);

  const recordada = GRAFIA_BUENA.get(`${familia}:${clave}`);
  const orden = recordada ? [recordada, ...grafias.filter((g) => g !== recordada)] : grafias;

  let ultimo;
  for (const id of orden) {
    try {
      const salida = await hacer(id);
      GRAFIA_BUENA.set(`${familia}:${clave}`, id);
      return salida;
    } catch (e) {
      if (e.estado !== 404 && e.estado !== 403) throw e;
      ultimo = e;
    }
  }
  // Se acabaron las grafías. El mensaje dice QUÉ eligió el usuario, no un
  // identificador que él nunca escribió.
  const e = new Error(
    `«${etiquetaDe(familia, clave)}» no está disponible en este proyecto de Google Cloud. ` +
      `Se probó como: ${grafias.join(', ')}.`,
  );
  e.estado = ultimo?.estado || 404;
  throw e;
}

async function pedir(url, cuerpo) {
  let token = await tokenDeAcceso();
  const hacer = (t) =>
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
        // A qué proyecto se le apunta la cuota. Sin esto, algunas llamadas se
        // rechazan con un error de permisos que no habla de cuotas.
        'X-Goog-User-Project': proyecto(),
      },
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
  maxTokens = 32768,
  buscarEnInternet = false,
  modelo: pedido = '',
}) {
  // Lo que eligió el usuario en la pantalla. Sin elección, el mejor director.
  const eleccion = pedido || process.env.MODELO_TEXTO || PREDETERMINADO.texto;

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

  const datos = await conGrafias('texto', eleccion, (id) =>
    pedir(`${rutaDe(id)}:generateContent`, cuerpo),
  );
  const candidato = datos?.candidates?.[0];
  const partes = candidato?.content?.parts || [];
  const salida = partes.map((p) => p.text || '').join('');

  if (!salida.trim()) {
    // Un bloqueo de los filtros llega como 200 SIN texto, con el motivo en
    // `promptFeedback`. Sin mirarlo ahí, en pantalla parece un fallo de red y uno
    // se pone a revisar la conexión en vez de la instrucción.
    const bloqueo = datos?.promptFeedback?.blockReason;
    if (bloqueo) {
      throw new Error(
        `Los filtros de seguridad bloquearon la petición (${bloqueo}). ` +
          'No es un fallo pasajero: reintentarlo da lo mismo. Hay que reformular el texto.',
      );
    }
    const motivo = candidato?.finishReason || 'sin motivo declarado';
    const cortado = motivo === 'MAX_TOKENS' ? ' — se quedó sin espacio de respuesta' : '';
    throw new Error(`El modelo de texto no devolvió nada (${motivo}${cortado}).`);
  }

  // Las fuentes que el modelo consultó de verdad. En un documental esto no es un
  // extra: es lo que permite que una afirmación apunte a algo comprobable (§8.1).
  const fuentes = (candidato?.groundingMetadata?.groundingChunks || [])
    .map((c) => ({ titulo: c.web?.title || '', enlace: c.web?.uri || '' }))
    .filter((f) => f.enlace);

  // Cortada a mitad. NO es un caso raro: los modelos que razonan gastan parte del
  // presupuesto de salida PENSANDO, así que un tope que parecía holgado para el
  // texto se agota antes de escribirlo. Y cortarse no da error: da menos texto.
  //
  // Así fue como un guion de diez minutos salió con una escena y una toma, y la
  // pantalla dijo «guion escrito». Se avisa aquí, que es donde se sabe.
  if (candidato?.finishReason === 'MAX_TOKENS') {
    throw new Error(
      'El modelo se quedó sin espacio de respuesta y devolvió el texto a medias ' +
        `(${salida.length} caracteres). Lo que llegó NO está completo, así que se ` +
        'descarta en vez de darlo por bueno. Pide menos de una vez.',
    );
  }

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

export async function imagen({ instruccion, referencias = [], aspecto = '16:9', modelo: pedido = '' }) {
  const eleccion = pedido || process.env.MODELO_IMAGEN || PREDETERMINADO.imagen;

  for (const [i, ref] of referencias.entries()) {
    const bytes = Buffer.byteLength(ref.datos || '', 'base64');
    if (bytes > TOPE_REFERENCIA_BYTES) {
      throw new Error(
        `La imagen de referencia ${i + 1} llegó sin reducir (${(bytes / 1024 / 1024).toFixed(2)} MB). ` +
          'Toda imagen que se envía se reduce antes, a ~1024 px de lado. Sin excepciones.',
      );
    }
  }

  // EL TEXTO PRIMERO Y LAS REFERENCIAS DESPUÉS. En ese orden, no al revés: es
  // como está en producción y no es indiferente —el modelo lee la instrucción y
  // luego mira las imágenes a la luz de ella—.
  const partes = [
    { text: instruccion },
    ...referencias.map((r) => ({
      inlineData: { mimeType: r.tipo || 'image/jpeg', data: r.datos },
    })),
  ];

  const datos = await conGrafias('imagen', eleccion, (id) =>
    pedir(`${rutaDe(id)}:generateContent`, {
      contents: [{ role: 'user', parts: partes }],
      generationConfig: {
        // La familia 3 EXIGE ['TEXT','IMAGE']; el 2.5 solo acepta ['IMAGE']. Con
        // el valor equivocado la petición falla y el error no dice que sea esto.
        responseModalities: modalidadesDe(id),
        imageConfig: {
          aspectRatio: aspecto,
          // `imageSize` solo lo acepta la familia 3. Mandárselo al 2.5 —que además
          // entrega siempre en torno a 1K— es un error de petición.
          ...(admiteTamanoImagen(id) ? { imageSize: '2K' } : {}),
        },
        temperature: 1.0,
      },
    }),
  );

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

export function duracionMasCercana(segundos, clave = PREDETERMINADO.video) {
  return duracionValida(clave, segundos);
}

export async function videoIniciar({
  instruccion,
  fotograma,
  segundos = 6,
  aspecto = '16:9',
  modelo: pedido = '',
  carpetaGs = '',
  conAudio = false,
  negativo = '',
}) {
  const eleccion = pedido || process.env.MODELO_VIDEO || PREDETERMINADO.video;
  // Cada generador tiene su lista CERRADA de duraciones y no son la misma: Veo 2
  // admite 5 y 7, los 3.1 no. Pedir una que no está en la lista no se redondea
  // solo, se rechaza la petición.
  const duracion = duracionValida(eleccion, segundos);

  const instancia = { prompt: instruccion };
  if (fotograma) {
    instancia.image = {
      bytesBase64Encoded: fotograma.datos,
      mimeType: fotograma.tipo || 'image/jpeg',
    };
  }

  const datos = await conGrafias('video', eleccion, (id) =>
    pedir(`${rutaDe(id)}:predictLongRunning`, {
      instances: [instancia],
      parameters: {
        durationSeconds: duracion,
        aspectRatio: aspecto,
        sampleCount: 1,
        resolution: '1080p',
        // El ambiente sonoro de Veo encarece el segundo y puede pisar la
        // narración, que es la que manda en un documental.
        generateAudio: !!conAudio,
        personGeneration: 'allow_adult',
        ...(negativo ? { negativePrompt: negativo } : {}),
        // SIN ESTO EL CLIP VUELVE EN BASE64 Y NO CABE.
        //
        // Un clip de 8 s a 1080p son varios megas; la respuesta de la función
        // tiene un tope de 4,5 MB. Con `storageUri`, Veo escribe el clip
        // directamente en el almacén y solo vuelve una referencia. No es una
        // optimización: sin esto, la fase de clips no funciona (§7.1).
        ...(carpetaGs ? { storageUri: carpetaGs } : {}),
      },
    }),
  );

  if (!datos.name) throw new Error('El generador de video no devolvió un identificador de operación.');
  return { operacion: cifrar(datos.name), duracion };
}

export async function videoConsultar(referencia) {
  const nombre = descifrar(referencia);
  // El modelo NO se adivina ni se lee de la configuración: viene dentro del propio
  // identificador de la operación, que es quien sabe con qué generador se arrancó.
  //
  // Antes esto usaba un modelo fijo. Mientras solo hubo uno, funcionó. En cuanto se
  // puede elegir Lite o Fast, preguntar por el clip de Lite en la ruta de la versión
  // cara es preguntarle a quien no lo tiene: la consulta falla y el clip se queda
  // colgado sin que nada diga por qué.
  const enLaOperacion = /\/models\/([^/]+)\//.exec(nombre);
  if (!enLaOperacion) {
    throw new Error('El identificador de la operación de video no dice con qué modelo se arrancó.');
  }
  // Y la REGIÓN también sale de ahí. El nombre de la operación trae la suya
  // dentro; consultarla en otra da 404, que se lee como «esa operación no
  // existe» cuando lo que pasa es que se está preguntando en el sitio
  // equivocado. El recurso es el nombre cortado antes de «/operations/».
  const laRegion = /\/locations\/([^/]+)\//.exec(nombre)?.[1] || regionDe(enLaOperacion[1], region());
  const recurso = nombre.split('/operations/')[0];
  const datos = await pedir(
    `https://${hostDe(laRegion)}/v1/${recurso}:fetchPredictOperation`,
    { operationName: nombre },
  );

  if (!datos.done) return { listo: false };
  if (datos.error) {
    throw new Error(`El generador de video falló: ${datos.error.message || 'sin mensaje'}`);
  }

  // El filtro de seguridad tiene su propio caso: «terminó y no hay video» y
  // «terminó y el video se filtró» son cosas distintas, y la segunda no se
  // arregla reintentando.
  const filtrado = datos?.response?.raiMediaFilteredReasons;
  if (filtrado?.length) {
    throw new Error(`El generador de video descartó el clip por sus filtros: ${filtrado.join('; ')}`);
  }

  const muestras =
    datos?.response?.videos || datos?.response?.generatedSamples || datos?.response?.predictions || [];
  const primera = muestras[0];

  // Con `storageUri` el clip ya está en el almacén y solo vuelve su ruta. Es el
  // camino normal; el base64 queda como respaldo para clips que quepan.
  const uri = primera?.gcsUri || primera?.video?.gcsUri || primera?.videoUri;
  if (uri) return { listo: true, uriGs: uri, tipo: 'video/mp4' };

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

export async function vozGemini({ texto: t, nombreVoz, estilo = '', modelo: pedido = '' }) {
  const eleccion = pedido || process.env.MODELO_VOZ_GEMINI || PREDETERMINADO.voz;
  const voz = String(nombreVoz).replace(PREFIJO_GEMINI, '') || 'Kore';

  // §7.9: estas voces interpretan cada llamada por su cuenta. Mandar SIEMPRE la
  // misma indicación de estilo es lo que más acerca la llamada 23 a la llamada 1.
  // No lo arregla del todo, pero la diferencia entre mandarla y no mandarla es
  // grande, y el usuario puede afinarla desde los ajustes.
  const brief = estilo || 'Narra en tono documental, sobrio y parejo, ritmo constante, sin dramatizar.';

  const datos = await conGrafias('voz', eleccion, (id) =>
    pedir(`${rutaDe(id)}:generateContent`, {
      contents: [{ role: 'user', parts: [{ text: `${brief}\n\n${t}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } },
      },
    }),
  );

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
  const eleccion = process.env.MODELO_MUSICA || PREDETERMINADO.musica;
  const datos = await conGrafias('musica', eleccion, (id) =>
    pedir(`${rutaDe(id)}:predict`, {
      instances: [{ prompt: instruccion }],
      parameters: { sample_count: 1, duration_seconds: Math.min(Math.max(segundos, 10), 120) },
    }),
  );

  const p = datos?.predictions?.[0];
  const b64 = p?.bytesBase64Encoded || p?.audioContent;
  if (!b64) throw new Error('El modelo de música no devolvió audio.');
  return { datos: b64, tipo: p?.mimeType || 'audio/wav' };
}

// ── Catálogo de modelos ───────────────────────────────────────────────────────
//
// Ya no se sondea nada. La lista está en `comun/modelos.mjs`, escrita a mano, y la
// cabecera de ese archivo cuenta por qué: sondear enseñaba GRAFÍAS —una por
// nombre técnico— cuando lo que se elige es un GENERADOR. Salía un generador de
// imagen habiendo tres, y Veo 3.1 Fast salía dos veces.
//
// Esto se limita a entregar la tabla tal cual, más cuál está elegido por defecto.
// No hay ninguna llamada a la nube: los ajustes abren al instante.

export function modelosDisponibles() {
  const salida = {};
  for (const [familia, filas] of Object.entries(CATALOGO)) {
    salida[familia] = filas.map((f) => ({ id: f.clave, etiqueta: f.etiqueta }));
  }
  return salida;
}

/** Cuál se usa si nadie elige. */
export const modelosEnUso = () => ({
  texto: process.env.MODELO_TEXTO || PREDETERMINADO.texto,
  imagen: process.env.MODELO_IMAGEN || PREDETERMINADO.imagen,
  video: process.env.MODELO_VIDEO || PREDETERMINADO.video,
  voz: process.env.MODELO_VOZ_GEMINI || PREDETERMINADO.voz,
  musica: process.env.MODELO_MUSICA || PREDETERMINADO.musica,
});
