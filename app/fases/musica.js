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

export function planificar(escenas, tomas, config, { soloLasQueFaltan = true } = {}) {
  if (!config?.musica?.activa) return [];
  return escenas
    .map((e) => {
      const suyas = tomas.filter((t) => t.escena === e.n);
      return {
        ...e,
        segundos: suyas.reduce((s, t) => s + (t.segundos || 0), 0),
        estado: e.musica,
      };
    })
    .filter((e) => e.segundos > 0)
    .filter((e) => (soloLasQueFaltan ? e.estado !== 'ok' : true));
}

/**
 * Dónde cae esta escena dentro de la pieza, dicho en inglés.
 *
 * Sin esto todas las escenas pedían exactamente lo mismo y el documental sonaba
 * plano de principio a fin: el mismo lecho debajo de la apertura, del giro y del
 * cierre. La posición no la inventa nadie —sale de contar escenas—, así que no
 * cuesta una llamada y no se contamina de español.
 */
function arcoDe(escena, tomas) {
  const total = Math.max(1, ...tomas.map((t) => Number(t.escena) || 0));
  const donde = (Number(escena.n) || 1) / total;

  if (donde <= 0.2) return 'Opening section: sparse and almost empty, one sustained note, a lot of air.';
  if (donde <= 0.55) return 'Middle section: steady and unchanged, patient, no development.';
  if (donde <= 0.85) return 'Late section: a little denser and lower, tension held but never released.';
  return 'Closing section: thinning out, receding, ending unresolved.';
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
    arcoDe(escena, tomas),
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

export async function generarMusicaDeEscena({ escena, tomas, pieza, tratamiento = null, senal, alEsperar }) {
  const clave = claveMusica(pieza, escena.n);

  const r = await llamar(
    'musica',
    {
      instruccion: atmosferaDe(escena, tomas, tratamiento),
      // Se genera algo más corta que la escena a propósito: el montaje la repite si
      // hace falta (`-stream_loop`). Un lecho sin melodía protagonista se repite sin
      // que se note, y pagar dos minutos de música para una escena de dos minutos es
      // tirar dinero.
      segundos: Math.min(90, Math.max(20, Math.round(escena.segundos * 0.5))),
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
