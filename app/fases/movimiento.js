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
import { fotogramaDe, generarImagen } from './imagen.js';
import { duracionValida, duracionMasLarga, PREDETERMINADO } from '../../comun/modelos.mjs';

// Las duraciones válidas dependen del generador elegido —Veo 2 admite 5 y 7, los
// 3.1 no— y en un EMPATE se coge la MAYOR: vale más sobrar un segundo, que el
// montaje recorta, que faltar uno, que se ve como imagen congelada.
export const duracionMasCercana = (s, clave = PREDETERMINADO.video) => duracionValida(clave, s);

// LO QUE SE PIDE DE VERDAD: siempre lo más largo que dé el generador, dure lo que
// dure la toma. Un clip corto solo sirve para su toma; uno de ocho segundos se
// reutiliza en cualquiera. Ver `duracionMasLarga`.
export const duracionQueSePide = (clave = PREDETERMINADO.video) => duracionMasLarga(clave);

export function planificar(tomas, { soloLasQueFaltan = true } = {}) {
  return tomas.filter((t) => {
    if (!t.movimiento) return false;
    // Heredado de otra pieza o repitiendo un motivo de esta: el clip ya existe y
    // ya está pagado. Ni con «rehacer todo» se vuelve a generar —es justo lo que
    // hace que un motivo animado pueda volver cinco veces por el precio de uno—.
    if (t.heredadoVid) return false;
    if (t.reusa !== null && t.reusa !== undefined) return false;
    return soloLasQueFaltan ? t.video !== 'ok' : true;
  });
}

/**
 * Lo que tiene que durar el clip de una toma: la locución MÁS su respiro.
 *
 * Sin sumar el respiro, el clip se quedaba corto justo en el silencio —que es el
 * momento en que el espectador está mirando la imagen y nada más— y el montaje lo
 * tapaba congelando el último fotograma. Un congelado de tres segundos en medio de
 * un silencio deliberado no parece una pausa: parece que se colgó el video.
 *
 * Y no suele costar nada: las duraciones van en lista cerrada, así que muchas veces
 * el respiro cabe dentro del mismo escalón que ya se iba a pedir.
 */
export const segundosDeClip = (t) => (Number(t.segundos) || 6) + (Number(t.respiro) || 0) + (Number(t.entrada) || 0);

/** Cuánto va a costar esta fase, en clips. Se enseña ANTES de gastar. */
export function resumen(tomas, clave) {
  const con = tomas.filter((t) => t.movimiento);
  return {
    clips: con.length,
    faltan: planificar(tomas).length,
    proporcion: tomas.length ? +(con.length / tomas.length).toFixed(2) : 0,
    segundos: con.length * duracionQueSePide(clave),
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
export async function generarClip({ toma, tomas, pieza, config, tratamiento = null, senal, aviso, alEsperar }) {
  // EL CLIP SALE DE LA IMAGEN. Si no está, se genera aquí.
  //
  // Antes esto se limitaba a fallar con «genera la imagen primero», y el usuario
  // se encontraba con que darle a Clips daba error sin más. Pero es que un clip
  // SIEMPRE parte de un fotograma: animar sin imagen de partida daría otra escena,
  // no la de este documental. Así que en vez de mandar a nadie a otra pantalla, se
  // hace lo que hay que hacer, en el orden que hay que hacerlo.
  let fot = await fotogramaDe({ toma, tomas, pieza });
  if (!fot) {
    aviso?.(`Toma ${toma.i + 1}: generando primero su imagen, que es de donde sale el clip…`);
    await generarImagen({ toma, tomas, pieza, config, tratamiento, senal, alEsperar });
    fot = await fotogramaDe({ toma, tomas, pieza });
  }
  if (!fot) {
    throw new Error(`La toma ${toma.i} no tiene fotograma y no se pudo generar.`);
  }

  // §6: el fotograma de partida se reduce «al lado que el generador de video va a
  // emitir». Mandarlo entero no mejora nada y gasta presupuesto de petición.
  const fotograma = await reducirFotogramaDePartida(fot.blob, config.formato.ancho);

  // EL ASPECTO NO SE VUELVE A PEDIR AQUÍ, Y ES A PROPÓSITO.
  //
  // El clip parte del fotograma ya generado, así que la óptica, la luz, el grano y
  // la paleta vienen dentro de la imagen: repetirlos en el texto haría que el
  // generador de video los reinterpretara y el clip saldría distinto de su propio
  // fotograma. Por eso la línea que importa es «mantén exactamente lo de la imagen
  // de partida», y es también lo que hace que el aspecto del canal no multiplique
  // el coste de los clips: son los mismos con un aspecto que con seis.
  //
  // Lo que sí hay que decir es CÓMO SE MUEVE, porque eso no está en la imagen. Un
  // generador sin instrucción de cámara mete deriva de dron y aceleraciones de
  // videojuego, y eso delata la pieza más que cualquier otra cosa.
  const p = toma.plano || {};
  const instruccion = [
    p.descripcion,
    p.movimientoCamara && p.movimientoCamara !== 'fijo' ? `Cámara: ${p.movimientoCamara}.` : '',
    'Movimiento sutil y continuo dentro del cuadro. Sin cortes, sin transiciones, sin texto.',
    'La cámara se mueve como en una serie documental rodada de verdad: muy poco, a ' +
      'velocidad constante, sobre trípode o con estabilizador. Nada de deriva de ' +
      'dron, nada de zooms bruscos, nada de aceleraciones ni de movimiento de ' +
      'videojuego.',
    'Mantén exactamente la composición, la paleta, el grano y la luz de la imagen de partida.',
  ]
    .filter(Boolean)
    .join(' ');

  const inicio = await llamar(
    'video.iniciar',
    {
      instruccion,
      fotograma,
      // La locución MÁS el respiro: el silencio también hay que cubrirlo con
      // movimiento, o el clip se congela justo donde se está mirando.
      segundos: duracionQueSePide(config.videoModelo?.modelo),
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

  // EL CLIP ANOTA DE QUÉ IMAGEN SALIÓ. Sin esto, `video: 'ok'` es una bandera
  // suelta: dice que hay un clip y no dice si le corresponde a la imagen de
  // ahora. Ver `clipVigente` en `comun/claves.mjs`.
  return {
    ...toma,
    video: 'ok',
    bytesVideo: r.guardado.bytes,
    versionClip: Number(toma.versionImagen) || 0,
  };
}
