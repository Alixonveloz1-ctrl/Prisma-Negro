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
import { escribirWav, leerWav } from '../../comun/audio.mjs';
// El catálogo de generadores. Fijo y escrito a mano a propósito: ver la cabecera
// de ese archivo, que cuenta los dos fallos que tuvo sondearlo.
import {
  CATALOGO, PREDETERMINADO, grafiasDe, etiquetaDe,
  regionDe, hostDe, modalidadesDe, admiteTamanoImagen, duracionValida,
  SIN_VELOCIDAD_NI_TONO, SIN_TONO, SIN_SSML,
} from '../../comun/modelos.mjs';

// §6: los generadores de video tienen listas CERRADAS de duración. Se pide la más
// cercana a lo que dura la locución y se congela el último fotograma para el resto.
export const DURACIONES_VIDEO = [4, 6, 8];

// §6: la voz limita el texto por llamada. Presupuesto en bytes, no en caracteres:
// una tilde ocupa dos.
export const TOPE_BYTES_VOZ = 4000;

// El mismo bloque en SSML ocupa más: cada marca son unos veinte bytes y con diez
// tomas eso son doscientos. El servicio admite hasta 5.000 para SSML, así que el
// tope de la envoltura es mayor que el del texto que lleva dentro. Sin esto, un
// bloque que cabía en texto plano se rechazaba al ponerle las marcas.
export const TOPE_BYTES_SSML = 5000;

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

const escaparSsml = (x) =>
  String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Narra un bloque, y si se le dan los textos por toma DICE DÓNDE ACABA CADA UNO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO NO SE PUEDE ADIVINAR
 *
 * El bloque se generaba entero y luego se cortaba buscando el silencio más
 * cercano a donde uno CALCULA que debería estar la frontera. El cálculo sale de
 * contar caracteres, y una frase con una cifra escrita en letra —«veintitrés mil
 * cuatrocientos»— dura el triple de lo estimado.
 *
 * El corte caía en un silencio, así que sonaba perfecto. Pero era el silencio de
 * OTRA frase. Resultado: el audio de una toma terminaba con las palabras de la
 * siguiente, y las imágenes no correspondían a lo que se oía. Un fallo que no
 * suena a fallo, que es la peor clase.
 *
 * El servicio de voz sabe la respuesta exacta: con SSML se ponen marcas entre las
 * tomas y devuelve el segundo en el que cae cada una. Ni estimación, ni tolerancia,
 * ni silencio más cercano: el sitio.
 *
 * No todas las voces admiten SSML. Si esta no lo admite, se narra en texto plano y
 * se devuelve `tiempos: null`, para que aguas arriba se sepa que el reparto vuelve
 * a ser una estimación y se pueda decir en pantalla.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/**
 * Deja el audio del servicio de voz en un WAV CANÓNICO: cabecera de 44 bytes con
 * los tamaños exactos, escrita por el mismo escritor que usa todo el sistema.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Solo las de Gemini se escuchan.»
 *
 * Y en pantalla, el reproductor de la muestra marcando 00:08 / 00:00: duración
 * cero. Los dos caminos de voz devolvían cosas distintas y solo uno estaba
 * comprobado. El de Gemini llega en PCM crudo y esta casa le escribe la
 * cabecera; el de Cloud TTS venía TAL CUAL de Google, con la cabecera que
 * trajera. Un elemento <audio> se cree la cabecera: si el tamaño del trozo de
 * datos no cuadra, la duración le sale cero y no reproduce nada.
 *
 * Nuestro propio lector no se enteraba —recorta el trozo al tamaño real del
 * archivo, así que la narración salía bien—, y por eso el defecto solo se veía
 * en el botón de escuchar la voz. Ahora los dos caminos salen por el mismo
 * escritor y no hay dos formatos que puedan discrepar (§3).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function normalizarWav(b64, frecuenciaSiCrudo = 24000) {
  const bytes = Buffer.from(b64, 'base64');
  // La copia es obligatoria: un Buffer de Node vive dentro de un ArrayBuffer
  // COMPARTIDO, y pasar `bytes.buffer` sin recortar leería desde el principio de
  // ese depósito —bytes de otra cosa— en vez de desde el principio del audio.
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  try {
    const esRiff =
      bytes.length > 44 &&
      bytes.toString('latin1', 0, 4) === 'RIFF' &&
      bytes.toString('latin1', 8, 12) === 'WAVE';
    const { muestras, frecuencia, canales } = esRiff
      ? leerWav(ab)
      : {
          muestras: new Int16Array(ab.slice(0, ab.byteLength & ~1)),
          frecuencia: frecuenciaSiCrudo,
          canales: 1,
        };
    if (!muestras.length) return b64;
    return Buffer.from(escribirWav({ muestras, frecuencia, canales })).toString('base64');
  } catch {
    // Si no se deja leer, vale más devolver lo que mandó el servicio que quedarse
    // sin voz: lo que llega es audio de todas formas, solo que sin normalizar.
    return b64;
  }
}

export async function voz({ texto: t, nombreVoz, velocidad = 1.0, tono = 0, marcas = null }) {
  const v = String(nombreVoz || '');
  const admiteSsml = !SIN_SSML.test(v);
  // Pedir SSML a una voz que no lo entiende no es «probar»: es gastar una llamada
  // para que la rechacen, y con las de Chirp era TODAS las llamadas.
  const conMarcas = admiteSsml && Array.isArray(marcas) && marcas.length > 1;
  const ssml = conMarcas
    ? `<speak>${marcas.map((x, k) => `${escaparSsml(x)}<mark name="m${k}"/>`).join(' ')}</speak>`
    : '';

  const bytes = Buffer.byteLength(conMarcas ? ssml : t, 'utf8');
  const tope = conMarcas ? TOPE_BYTES_SSML : TOPE_BYTES_VOZ;
  if (bytes > tope) {
    throw new Error(
      `El bloque de narración ocupa ${bytes} bytes y el tope por llamada es ${tope}. ` +
        'Repártelo en más bloques.',
    );
  }

  const cuerpo = (conSsml) => ({
    input: conSsml ? { ssml } : { text: t },
    voice: {
      languageCode: (nombreVoz || 'es-US-Neural2-B').split('-').slice(0, 2).join('-'),
      name: nombreVoz || 'es-US-Neural2-B',
    },
    audioConfig: {
      audioEncoding: 'LINEAR16',
      sampleRateHertz: 24000,
      // Solo lo que esta voz entiende. Mandarle a Chirp una velocidad o un tono
      // no lo ignora: rechaza la petición entera y te quedas sin voz.
      ...(SIN_VELOCIDAD_NI_TONO.test(v) ? {} : { speakingRate: velocidad }),
      ...(SIN_TONO.test(v) ? {} : { pitch: tono }),
    },
    ...(conSsml ? { enableTimePointing: ['SSML_MARK'] } : {}),
  });

  const pedirVoz = async (conSsml) => {
    let token = await tokenDeAcceso();
    const hacer = (tk) =>
      fetch(`${VOZ_API}/text:synthesize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo(conSsml)),
      });
    let r = await hacer(token);
    if (r.status === 401) {
      olvidarToken();
      token = await tokenDeAcceso();
      r = await hacer(token);
    }
    return { r, datos: await r.json().catch(() => ({})) };
  };

  if (conMarcas) {
    const { r, datos } = await pedirVoz(true);
    // Con marcas Y con todas: si faltan, el reparto sería peor que el estimado
    // —cortaría por donde no toca creyendo que sabe—. Mejor caer al camino de
    // siempre, que al menos sabe que está estimando.
    if (r.ok && datos.audioContent && datos.timepoints?.length === marcas.length) {
      return {
        datos: normalizarWav(datos.audioContent),
        tipo: 'audio/wav',
        tiempos: datos.timepoints.map((p) => Number(p.timeSeconds) || 0),
      };
    }
  }

  const { r, datos } = await pedirVoz(false);
  if (!r.ok || !datos.audioContent) {
    throw new Error(`El servicio de voz falló: ${datos?.error?.message || `HTTP ${r.status}`}`);
  }
  return { datos: normalizarWav(datos.audioContent), tipo: 'audio/wav', tiempos: null };
}

/**
 * Catálogo de voces (§7.10).
 * Se listaron todas las disponibles y aparecieron cien, la mayoría del idioma
 * equivocado y con nombres idénticos a las buenas. Aquí se filtra por región y se
 * MUESTRA la región en la etiqueta.
 */
/**
 * Las regiones que valen.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Ahora sí quiero que dejes voces latinas y voces de español de España también.
 *  Todas las voces en español y masculinas que estén disponibles.»
 *
 * España estaba fuera con un argumento que sonaba técnico —«una voz peninsular en
 * medio de una narración latina se oye como otro narrador»— y no lo era: dentro de
 * UN episodio narra UNA voz, siempre. Mezclar acentos nunca fue el riesgo; el
 * riesgo era mezclar voces dentro de la misma narración, y de eso se encarga que
 * la voz se elija una vez y se guarde.
 *
 * Lo que sí sigue filtrando: el idioma —cien voces del idioma equivocado no son un
 * catálogo— y el género. Y la etiqueta dice de dónde es cada una, que es lo que
 * permite elegir a sabiendas en vez de a ciegas.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const REGIONES_DE_VOZ = {
  'es-US': 'Latino',
  'es-MX': 'México',
  'es-419': 'Latino',
  'es-ES': 'España',
};

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
  return catalogoDeVoces(datos.voices, { expresivas, genero });
}

/**
 * EL CATÁLOGO, A PARTIR DE LO QUE DEVUELVE EL SERVICIO. Sin red: se puede probar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Sale una lista grande de un montón de voces y la mayoría están repetidas,
 *  tanto en las españolas como en las latinas.»
 *
 * Y era verdad, por dos motivos que estaban los dos en la etiqueta:
 *
 *   1. `es-US` y `es-419` se rotulaban IGUAL —«Latino»—, y el servicio publica
 *      casi el mismo elenco bajo los dos códigos. Así que cada voz salía dos
 *      veces con una etiqueta idéntica: `Neural2-B · Latino · masculina` y
 *      `Neural2-B · Latino · masculina`. Imposible elegir entre ellas, e
 *      imposible saber que eran dos.
 *   2. El género iba en todas y el catálogo está filtrado a masculina, así que
 *      `· masculina` no distinguía nada: era ruido en cada fila.
 *
 * La regla, que es la del §7.10 llevada hasta el final: DOS ENTRADAS CON LA MISMA
 * ETIQUETA SON UN FALLO. Si la lista dice que dos voces son la misma región y la
 * misma cara, es que son la misma voz para quien elige, y sobra una.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function catalogoDeVoces(voces, { expresivas = false, genero = 'MALE' } = {}) {
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

  // LA CARA de una voz: su nombre sin el prefijo de idioma. `es-US-Neural2-B` y
  // `es-419-Neural2-B` tienen la misma cara, y como los dos códigos son «Latino»,
  // son la misma voz para quien elige.
  const caraDe = (nombre) => String(nombre || '').split('-').slice(2).join('-');

  const vistas = new Set();
  const salida = [];
  for (const v of voces || []) {
    const reg = v?.languageCodes?.[0] || '';
    const region = REGIONES_DE_VOZ[reg];
    if (!region) continue;
    if (genero && v.ssmlGender !== genero) continue;
    const variable = ES_EXPRESIVA.test(v.name);
    if (!expresivas && variable) continue;

    // Una sola por región y cara. Y por nombre, que el servicio también repite.
    const cara = caraDe(v.name);
    const huella = `${region}|${cara}|${v.ssmlGender}`;
    if (vistas.has(huella) || vistas.has(v.name)) continue;
    vistas.add(huella);
    vistas.add(v.name);

    salida.push({
      nombre: v.name,
      region: reg,
      genero: GENEROS[v.ssmlGender] || '',
      // Que viaje marcada es lo que permite avisar en pantalla en vez de que se
      // descubra oyendo el video montado con quince narradores distintos.
      expresiva: variable,
      // La etiqueta lleva la cara y la región. El GÉNERO solo cuando hay varios:
      // con el catálogo filtrado a masculina, ponerlo en todas no distinguía nada.
      etiqueta:
        `${cara} · ${region}` +
        (genero ? '' : ` · ${GENEROS[v.ssmlGender] || ''}`) +
        (variable ? ' · expresiva' : ''),
    });
  }

  const todas = salida.concat(deGemini).sort(
    (a, b) =>
      Number(a.expresiva) - Number(b.expresiva) ||
      a.region.localeCompare(b.region) ||
      a.nombre.localeCompare(b.nombre),
  );

  // Y LA GARANTÍA, no la intención: si después de todo quedan dos etiquetas
  // iguales, se les pone el nombre técnico detrás. Una lista con dos filas que
  // dicen lo mismo es una lista en la que no se puede elegir.
  const cuenta = new Map();
  for (const v of todas) cuenta.set(v.etiqueta, (cuenta.get(v.etiqueta) || 0) + 1);
  for (const v of todas) if (cuenta.get(v.etiqueta) > 1) v.etiqueta = `${v.etiqueta} · ${v.nombre}`;
  return todas;
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
        // CERO, y es la mitad de la continuidad. Sin fijarla, cada llamada
        // interpreta con la variación por defecto: ochenta y tres llamadas,
        // ochenta y tres entregas distintas — «no lo narra como una historia,
        // narra cada clip por su cuenta». Con cero, la misma voz, el mismo
        // brief y el mismo tono en la llamada 1 y en la 83.
        temperature: 0,
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
// Una pista para el episodio, a partir de la paleta del canal y el ánimo que
// decide el director. Lyria 2 da clips de unos 30 s, fijos.

export async function musica({ instruccion, evitar = '' }) {
  const eleccion = process.env.MODELO_MUSICA || PREDETERMINADO.musica;
  const datos = await conGrafias('musica', eleccion, (id) =>
    pedir(`${rutaDe(id)}:predict`, {
      // Lyria 2: `prompt` y `negative_prompt` en la instancia, `sample_count` en
      // los parámetros. No admite duración —se le pedían 120 s y devolvía 30—.
      // Lo que NO se quiere va en `negative_prompt`, no dentro del prompt:
      // nombrarlo ahí —«no drums, no techno»— es pedirlo.
      instances: [{ prompt: instruccion, ...(evitar ? { negative_prompt: evitar } : {}) }],
      parameters: { sample_count: 1 },
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
