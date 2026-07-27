// El descargador de material, por trozos.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ ESTO ES EL ÚNICO CAMINO PARA TRAERSE UNA IMAGEN
//
// La respuesta de la función tiene un tope de 4,5 MB. Una imagen de 2K en base64
// ocupa NUEVE. Cuando la generación pedía la imagen de vuelta en la misma
// respuesta —«devolver: true»—, el resultado era:
//
//   «La respuesta ocupa 9.14 MB y el tope de la plataforma es 4,5 MB.»
//
// La imagen se había generado bien y estaba en el almacén. Lo que no cabía era el
// viaje de vuelta. Así que no se pide de vuelta: se genera, se guarda en el
// almacén, y se baja de ahí POR TROZOS, que es para lo que existe esto.
//
// Vivía dentro de `previa.js` y solo lo usaba la previa. Estar ahí escondido es
// parte de por qué la generación de imágenes se inventó su propio camino.
// ─────────────────────────────────────────────────────────────────────────────

import { llamar } from './api.js';
import * as local from './local.js';
import { deBase64 } from './imagenes.js';

/**
 * Baja un material completo, por trozos, con la copia local por delante.
 *
 * §6: por trozos porque el tope de la respuesta son 4,5 MB. Y con copia local
 * porque sin ella revisar dos veces un documental de ochenta tomas son ciento
 * sesenta descargas.
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

const TIPOS = { img: 'image/png', vid: 'video/mp4', audio: 'audio/wav', mus: 'audio/wav', firma: 'image/png' };
export const tipoDeClave = (c) => TIPOS[c.split('/').pop()] || TIPOS[c.split('/').slice(-2)[0]] || 'application/octet-stream';
