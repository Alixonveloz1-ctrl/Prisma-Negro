// Fase 8 — Música (§4.8 del plano).
//
//   «Una pieza por escena. Se genera con un modelo de música a partir de una
//    descripción de atmósfera derivada de la ficha de escena.»
//
// El montaje la arma como un LECHO CONTINUO del largo de la pieza, escena por
// escena, con fundidos largos entre piezas de 1,5 a 3,5 s (§5.4). Con fundidos
// cortos el relevo se oye como un tajo. Eso vive en `comun/hoja.mjs`; aquí solo se
// genera el material.

import { llamar } from '../api.js';
import { claveMusica } from '../../comun/claves.mjs';

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
export function atmosferaDe(escena, tomas, tratamiento = null) {
  const en = tratamiento?.musica?.enIngles;

  return [
    'Instrumental documentary score. No vocals, no lyrics, no spoken word.',
    `Mood: ${limpiar(en?.mood) || 'restrained tension, unresolved, cold'}.`,
    `Instruments: ${limpiar(en?.instruments) || 'low sustained strings, soft synth pad, subtle drone'}.`,
    // Una sola pista para todo el episodio, en bucle: tiene que poder empezar
    // donde acaba sin que se note, y no puede ir a ningún sitio.
    'One continuous bed for the whole film, meant to loop seamlessly: same texture start to end, no intro, no ending, no section changes.',
    // La música va DEBAJO de la narración: si tiene melodía marcada, compite con la
    // voz y no hay compresión lateral que lo arregle (§5.6).
    'This is a bed under a voice-over: no lead melody, no prominent hook.',
    'Flat, constant dynamics. No build-ups, no drops, no sudden silences.',
    'No marked percussion, no drum beat.',
    `Avoid: ${limpiar(en?.avoid) || 'percussion, orchestral swells, anything attention-grabbing'}.`,
  ].join(' ');
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

/** El tope del generador de música. Más de esto lo recorta él. */
export const DURACION_MAXIMA = 120;

export async function generarMusicaDeEscena({ escena, tomas, pieza, tratamiento = null, senal, alEsperar }) {
  const clave = claveMusica(pieza, escena.n);

  const r = await llamar(
    'musica',
    {
      instruccion: atmosferaDe(escena, tomas, tratamiento),
      // LO MÁS LARGA QUE DA EL GENERADOR, que son dos minutos: cuanto más larga,
      // menos vueltas da en media hora y menos se nota la costura. El montaje la
      // repite (`-stream_loop`).
      segundos: DURACION_MAXIMA,
      guardarEn: clave,
    },
    { senal, alEsperar },
  );

  // §7.12: ningún valor de retorno de una escritura se ignora.
  if (!r.guardado?.bytes) {
    throw new Error(`La música de la escena ${escena.n} no quedó confirmada en el almacén.`);
  }

  return { n: escena.n, musica: 'ok', clave, bytes: r.guardado.bytes };
}
