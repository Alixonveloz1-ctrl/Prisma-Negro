// Fase 7 — Movimiento (§4.7 del plano).
//
//   «Las tomas marcadas como "con movimiento" se convierten en clips cortos a partir
//    de su fotograma. Es la fase MÁS CARA CON DIFERENCIA — la palanca principal del
//    presupuesto es qué proporción de tomas lleva movimiento.»
//
// Las tomas fijas NO se quedan quietas: se les aplica un recorrido de cámara con
// ffmpeg en el montaje (§4.7, y está en `comun/hoja.mjs`). Aquí solo se generan las
// que de verdad necesitan que algo se mueva dentro del cuadro.
//
// §6: los generadores de video tienen LISTAS CERRADAS de duración (4, 6 u 8 s). Se
// pide la más cercana a lo que dura la locución y se congela el último fotograma
// para cubrir el resto — eso último lo hace el montaje con `tpad`.

import { llamar, esperarOperacion } from '../api.js';
import { claveToma } from '../../comun/claves.mjs';
import { reducirFotogramaDePartida } from '../imagenes.js';
import { fotogramaDe } from './imagen.js';
import { duracionValida, PREDETERMINADO } from '../../comun/modelos.mjs';

// Las duraciones válidas dependen del generador elegido —Veo 2 admite 5 y 7, los
// 3.1 no— y en un EMPATE se coge la MAYOR: vale más sobrar un segundo, que el
// montaje recorta, que faltar uno, que se ve como imagen congelada.
export const duracionMasCercana = (s, clave = PREDETERMINADO.video) => duracionValida(clave, s);

export function planificar(tomas, { soloLasQueFaltan = true } = {}) {
  return tomas.filter((t) => t.movimiento && (soloLasQueFaltan ? t.video !== 'ok' : true));
}

/** Cuánto va a costar esta fase, en clips. Se enseña ANTES de gastar. */
export function resumen(tomas, clave) {
  const con = tomas.filter((t) => t.movimiento);
  return {
    clips: con.length,
    faltan: planificar(tomas).length,
    proporcion: tomas.length ? +(con.length / tomas.length).toFixed(2) : 0,
    segundos: con.reduce((s, t) => s + duracionMasCercana(t.segundos || 6, clave), 0),
  };
}

/**
 * Genera el clip de una toma.
 *
 * Tarda más de 60 s, así que es una OPERACIÓN (§6): se arranca, se devuelve un
 * identificador cifrado y se consulta cada N segundos. El identificador va cifrado y
 * no censurado porque lleva dentro el del proyecto: censurarlo haría fallar la
 * consulta siguiente con un error incomprensible.
 */
export async function generarClip({ toma, tomas, pieza, config, senal, aviso, alEsperar }) {
  const fot = await fotogramaDe({ toma, tomas, pieza });
  if (!fot) {
    throw new Error(`La toma ${toma.i} no tiene fotograma todavía. Genera la imagen primero.`);
  }

  // §6: el fotograma de partida se reduce «al lado que el generador de video va a
  // emitir». Mandarlo entero no mejora nada y gasta presupuesto de petición.
  const fotograma = await reducirFotogramaDePartida(fot.blob, config.formato.ancho);

  const p = toma.plano || {};
  const instruccion = [
    p.descripcion,
    p.movimientoCamara && p.movimientoCamara !== 'fijo' ? `Cámara: ${p.movimientoCamara}.` : '',
    'Movimiento sutil y continuo dentro del cuadro. Sin cortes, sin transiciones, sin texto.',
    'Mantén exactamente la composición, la paleta y la luz de la imagen de partida.',
  ]
    .filter(Boolean)
    .join(' ');

  const inicio = await llamar(
    'video.iniciar',
    {
      instruccion,
      fotograma,
      segundos: duracionMasCercana(toma.segundos || 6, config.videoModelo?.modelo),
      aspecto: config.formato.vertical ? '9:16' : '16:9',
      // La misma clave que en la consulta: de ella sale la carpeta donde Veo
      // escribe el clip en vez de devolverlo en la respuesta.
      guardarEn: claveToma(pieza, toma.i, 'vid'),
    },
    { senal, alEsperar },
  );

  const r = await esperarOperacion(
    'video.consultar',
    { operacion: inicio.operacion, guardarEn: claveToma(pieza, toma.i, 'vid') },
    {
      senal,
      cada: 10000,
      tope: 600000,
      aviso: (s) => aviso?.(`Toma ${toma.i}: ${s} s esperando al generador de video…`),
    },
  );

  // §7.12: ningún valor de retorno de una escritura se ignora.
  if (!r.guardado?.bytes) {
    throw new Error(`El clip de la toma ${toma.i} terminó pero el almacén no lo confirmó.`);
  }

  return { ...toma, video: 'ok', bytesVideo: r.guardado.bytes };
}
