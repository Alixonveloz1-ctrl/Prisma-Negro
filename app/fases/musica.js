// Fase 8 — Música (§4.8 del plano, corregido por el uso).
//
// El plano decía «una pieza por escena». Se hizo así, y sonaba a ocho músicas
// distintas en un video: ahora es UNA pista para el episodio entero, la más
// larga que da el generador, y el montaje la repite debajo de la pieza
// (`comun/hoja.mjs`). Aquí solo se genera el material y se dice cuál es.

import { llamar } from '../api.js';
import { claveMusica } from '../../comun/claves.mjs';
import { musicaDeLaPista } from '../../comun/hoja.mjs';

/**
 * ¿ESTA ESCENA TIENE SU MÚSICA? Sí también cuando está guardada con otro nombre.
 *
 * `escena.musica` vale «ok» cuando la música vive bajo el nombre del episodio, y
 * vale LA CLAVE ENTERA cuando vive en otro sitio —material rescatado, o de otra
 * pieza—. La hoja de montaje ya entiende las dos formas. Aquí solo se entendía la
 * primera, y eso ponía el contador a «0/8» con las ocho pagadas y en su sitio: el
 * botón de Montar se quedaba bloqueado y el de Música se ofrecía a generarlas
 * otra vez.
 */
export const tieneMusica = (e) => typeof e?.musica === 'string' && e.musica.length > 0;

/**
 * UNA SOLA PISTA PARA TODO EL EPISODIO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Es ilógico tener ocho pistas diferentes en un solo video, porque ni siquiera
 *  se parecen: unas bien fuertes, otras bajitas. Una pista es más que
 *  suficiente: hacerla lo más larga posible, lo más larga que permita el
 *  generador, y repetirla de fondo.»
 *
 * Había una pieza por escena, con un arco por posición. Ocho generaciones
 * distintas son ocho atmósferas distintas, y ocho relevos que se notan por mucho
 * fundido que lleven. Un lecho no es una banda sonora: es un fondo que no se
 * mira. Una pista, la más larga que da el generador, en bucle.
 *
 * La escena sigue existiendo para todo lo demás —los capítulos, el guion, la
 * dirección—; solo la música deja de ir por escena. Se pide bajo el número 0.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const PISTA_UNICA = 0;

export function planificar(escenas, tomas, config, { soloLasQueFaltan = true } = {}) {
  if (!config?.musica?.activa) return [];
  const total = tomas.reduce((s, t) => s + (t.segundos || 0), 0);
  if (!(total > 0)) return [];
  const e = escenas.find((x) => x.n === PISTA_UNICA) || { n: PISTA_UNICA };
  const unica = { ...e, n: PISTA_UNICA, segundos: total, estado: e.musica, hecha: tieneMusica(e) };
  return soloLasQueFaltan && unica.hecha ? [] : [unica];
}

/**
 * La instrucción de música, EN INGLÉS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Audio generation failed: Unsupported language detected. Please use one of the
 *  supported languages: en.»
 *
 * Lyria solo entiende inglés. La instrucción iba en español —como todo lo demás
 * de esta herramienta— y por eso la música fallaba SIEMPRE, las tres de tres. No
 * era cuota ni era red: era el idioma, y reintentar no podía arreglarlo.
 *
 * El director escribe ahora la ficha de música también en inglés (`enIngles`), y
 * es lo único que viaja aquí. Lo español se queda para la pantalla.
 *
 * Traducir a medias sería peor que no traducir: «strings low sostenidas» sigue
 * siendo español para el detector. Así que si no hay ficha en inglés no se
 * inventa nada — se manda un lecho genérico bueno, todo en inglés, y ya está.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/**
 * LA PALETA ES DEL CANAL, NO DEL CASO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Se supone que es una música de fondo suave que tiene que ir con el estilo del
 *  video, y me está generando una música tecno que no tiene nada que ver.»
 *
 * Los instrumentos los escribía el director caso por caso, y para un caso de
 * internet escribió electrónica: la ficha viajaba tal cual al generador. Pero el
 * lecho no es del caso, es del canal —como el aspecto de las imágenes—. El
 * director elige el ÁNIMO; los instrumentos, el tempo y lo prohibido son fijos.
 * Y si el ánimo trae un estilo de fuera —beat, synth, techno—, se descarta
 * entero y va el del canal.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const PALETA_DEL_CANAL = {
  instruments: 'low sustained strings, a solo cello, sparse piano notes, faint ambient texture',
  // LO QUE SE EVITA VA POR SU PROPIA LISTA al generador, nunca dentro de la
  // instrucción: nombrarlo ahí —«no drums, no techno»— es pedirlo, porque el
  // generador oye las palabras y no el «no». Así salía tecno pidiendo lo
  // contrario.
  avoid:
    'vocals, lyrics, singing, spoken word, electronic dance music, techno, EDM, synthesizers, ' +
    'drum machines, drums, percussion, beat, pulsing rhythm, groove, upbeat, lead melody, ' +
    'catchy hook, swells, crescendos, drops, sudden silences, intro, outro',
};
/** Palabras que delatan un estilo que no es el del canal. */
export const FUERA_DEL_CANAL =
  /\b(techno|edm|electro\w*|synth\w*|beat\w*|drum\w*|club|dance|trap|hip.?hop|glitch\w*|808|bass|pulsing|pulse|groove|dubstep|house|trance|lo-?fi|upbeat|energetic|driving|rhythmic)\b/i;

export function atmosferaDe(escena, tomas, tratamiento = null) {
  const en = tratamiento?.musica?.enIngles;
  const mood = limpiar(en?.mood);

  // SOLO LO QUE SE QUIERE. Ni una palabra de lo que no: eso va en `evitarDe`.
  return [
    'Cinematic true-crime documentary underscore, acoustic and orchestral, instrumental.',
    `Mood: ${mood && !FUERA_DEL_CANAL.test(mood) ? mood : 'restrained tension, unresolved, cold, somber'}.`,
    `Instruments: ${PALETA_DEL_CANAL.instruments}.`,
    'Very slow, still and sustained: long held notes that drift.',
    // Una sola pista para todo el episodio, repetida: tiene que poder empezar
    // donde acaba sin que se note, y no puede ir a ningún sitio. Sin la palabra
    // «loop», que al generador le suena a electrónica.
    'It plays on repeat under the whole film: one slow, even texture from the first second to the last, the same at the end as at the beginning.',
    // La música va DEBAJO de la narración: si tiene melodía marcada, compite con la
    // voz y no hay compresión lateral que lo arregle (§5.6).
    'A quiet bed under a spoken voice-over: soft, sparse, in the background, flat and constant.',
  ].join(' ');
}

/** La lista de lo que se evita, para el generador: la del canal, siempre la misma. */
export const evitarDe = () => PALETA_DEL_CANAL.avoid;

/**
 * La pista del episodio: su clave y si está hecha.
 *
 * La clave es la que usa la hoja de montaje —la que apunte la escena 0, o la de
 * este episodio bajo el número 0—, para que la Previa, el inventario y el montaje
 * hablen del MISMO archivo. Si la escena 0 tiene la música apagada, se devuelve
 * igualmente la clave propia: así el inventario puede reencontrarla.
 */
export function pistaDe(escenas, pieza) {
  const cero = (escenas || []).find((e) => e.n === PISTA_UNICA);
  return {
    n: PISTA_UNICA,
    clave: musicaDeLaPista(escenas || [], pieza) || claveMusica(pieza, PISTA_UNICA),
    hecha: tieneMusica(cero),
  };
}

/**
 * Deja pasar solo lo que es inglés de verdad.
 *
 * Si el texto trae tildes, eñes o signos de apertura, es español y se descarta
 * entero: mandarlo a medias es lo que hace saltar al detector de idioma. Más vale
 * un lecho genérico que una llamada rechazada.
 */
export function limpiar(texto) {
  const s = String(texto || '').trim();
  if (!s) return '';
  if (/[^\x20-\x7e]/.test(s)) return '';
  return s.replace(/\s+/g, ' ').slice(0, 200);
}

/**
 * Lo que da el generador POR LLAMADA.
 *
 * Lyria 2 devuelve clips de unos 30 s, fijos, y no admite pedir más: se pedían
 * 120 y volvían 30, y la pantalla anunciaba dos minutos que no existían. La
 * pista se hace repetible y se repite en el montaje (ver `comun/hoja.mjs`).
 */
export const DURACION_MAXIMA = 30;

export async function generarMusicaDeEscena({ escena, tomas, pieza, tratamiento = null, senal, alEsperar }) {
  const clave = claveMusica(pieza, escena.n);

  const r = await llamar(
    'musica',
    {
      instruccion: atmosferaDe(escena, tomas, tratamiento),
      // Lo que NO se quiere, por su propia lista. Ver `PALETA_DEL_CANAL`.
      evitar: evitarDe(),
      guardarEn: clave,
    },
    { senal, alEsperar },
  );

  // §7.12: ningún valor de retorno de una escritura se ignora.
  if (!r.guardado?.bytes) {
    throw new Error('La pista de fondo no quedó confirmada en el almacén.');
  }

  return { n: escena.n, musica: 'ok', clave, bytes: r.guardado.bytes };
}
