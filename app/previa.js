// La vista previa.
//
// Un animático: las imágenes en orden con su voz encima, reproducido en el propio
// navegador. No es el montaje —no lleva recorrido de cámara, ni música, ni marca—
// pero enseña lo único que de verdad hay que revisar antes de gastar: si la imagen
// pega con lo que se está diciendo, si el ritmo se sostiene, y si alguna toma quedó
// muda o con la voz cortada.
//
// No cuesta nada. Todo el material ya está pagado y en el almacén; esto solo lo baja
// y lo reproduce.
//
// §6: el material se baja POR TROZOS y se guarda como blob en la base local. Un
// documental de quince minutos son cientos de megas entre imágenes y audio; si se
// materializaran en memoria de JavaScript, el navegador del teléfono recargaría la
// página a media reproducción.

import { llamar } from './api.js';
import * as local from './local.js';
import { deBase64 } from './imagenes.js';
import { claveToma, tomaDelFotograma } from '../comun/claves.mjs';

/**
 * Baja un material completo, por trozos, con la copia local por delante.
 *
 * La copia local no es una optimización: sin ella, revisar dos veces un documental
 * de ochenta tomas son ciento sesenta descargas.
 */
export async function material(clave, tipo, { senal } = {}) {
  const guardado = await local.leerMaterial(clave);
  if (guardado) return guardado;

  const partes = [];
  let desde = 0;
  let total = null;
  do {
    if (senal?.aborted) throw new Error('Detenido.');
    const r = await llamar('bajar', { clave, desde }, { senal });
    if (!r.existe) return null;
    partes.push(deBase64(r.datos, tipo));
    total = r.total;
    desde = r.hasta + 1;
  } while (total && desde < total);

  const blob = new Blob(partes, { type: tipo });
  await local.guardarMaterial(clave, blob);
  return blob;
}

/**
 * El material de una toma: su fotograma —con la reutilización ya resuelta (§3)— y
 * su audio. Cualquiera de los dos puede faltar, y decirlo es parte del trabajo:
 * una toma muda en la previa es una toma muda en el montaje.
 */
export async function deLaToma({ toma, tomas, pieza, senal }) {
  const dueña = tomaDelFotograma(toma, tomas);
  const claveImagen = toma.movimiento
    ? claveToma(pieza, toma.i, 'vid')
    : claveToma(pieza, dueña.i, 'img');

  const [imagen, audio] = await Promise.all([
    material(claveImagen, toma.movimiento ? 'video/mp4' : 'image/png', { senal }).catch(() => null),
    material(claveToma(pieza, toma.i, 'audio'), 'audio/wav', { senal }).catch(() => null),
  ]);

  return {
    i: toma.i,
    escena: toma.escena,
    texto: toma.texto,
    segundos: toma.segundos,
    movimiento: !!toma.movimiento,
    reusaDe: dueña.i === toma.i ? null : dueña.i,
    corteForzado: !!toma.corteForzado,
    imagen,
    audio,
    // Lo que falta, dicho por su nombre: es lo que se viene a mirar aquí.
    falta: [!imagen && (toma.movimiento ? 'clip' : 'imagen'), !audio && 'voz'].filter(Boolean),
  };
}

/**
 * Prepara la previa de un tramo de tomas.
 *
 * Va por tandas pequeñas y avisa del avance: bajar ochenta tomas de golpe deja la
 * pantalla parada un minuto sin decir nada, y parece que se colgó.
 */
export async function preparar({ tomas, pieza, desde = 0, cuantas = 12, senal, alAvanzar }) {
  const tramo = tomas.slice(desde, desde + cuantas);
  const salida = [];
  for (const [n, toma] of tramo.entries()) {
    if (senal?.aborted) break;
    salida.push(await deLaToma({ toma, tomas, pieza, senal }));
    alAvanzar?.(n + 1, tramo.length);
  }
  return salida;
}

/**
 * El reproductor.
 *
 * Encadena las tomas: pinta la imagen, suena la voz, y al terminar pasa a la
 * siguiente. Si una toma no tiene audio se queda el tiempo que dice su duración, para
 * que el hueco se vea en su sitio en vez de desaparecer.
 */
export function reproductor({ lienzo, audio, alCambiar }) {
  let piezas = [];
  let k = 0;
  let temporizador = null;
  let urlActual = null;
  let corriendo = false;

  const limpiar = () => {
    clearTimeout(temporizador);
    if (urlActual) URL.revokeObjectURL(urlActual);
    urlActual = null;
  };

  function pintar(p) {
    limpiar();
    if (p.imagen) {
      urlActual = URL.createObjectURL(p.imagen);
      lienzo.src = urlActual;
      lienzo.style.visibility = 'visible';
    } else {
      lienzo.removeAttribute('src');
      lienzo.style.visibility = 'hidden';
    }
    alCambiar?.(p, k, piezas.length);
  }

  function siguiente() {
    if (!corriendo) return;
    if (k >= piezas.length) return parar();
    const p = piezas[k];
    pintar(p);

    if (p.audio) {
      audio.src = URL.createObjectURL(p.audio);
      audio.onended = () => {
        k++;
        siguiente();
      };
      audio.play().catch(() => {
        // Un navegador que bloquea la reproducción automática no puede dejar la
        // previa colgada: se sigue por tiempo.
        temporizador = setTimeout(() => {
          k++;
          siguiente();
        }, (p.segundos || 3) * 1000);
      });
    } else {
      temporizador = setTimeout(() => {
        k++;
        siguiente();
      }, (p.segundos || 3) * 1000);
    }
  }

  function parar() {
    corriendo = false;
    audio.onended = null;
    audio.pause();
    limpiar();
  }

  return {
    cargar(nuevas) {
      parar();
      piezas = nuevas;
      k = 0;
      if (piezas.length) pintar(piezas[0]);
    },
    reproducir(desde = 0) {
      k = desde;
      corriendo = true;
      siguiente();
    },
    irA(n) {
      parar();
      k = Math.max(0, Math.min(n, piezas.length - 1));
      if (piezas[k]) pintar(piezas[k]);
    },
    parar,
    get indice() {
      return k;
    },
  };
}
