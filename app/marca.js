// La marca del canal (§4.9 del plano).
//
//   «La marca del canal NO la dibuja el modelo: la dibuja el navegador sobre un
//    lienzo, y así sale nítida y siempre igual.»
//
// Un modelo de imagen al que le pides texto pequeño te lo deforma, y además te lo
// deforma DISTINTO en cada toma. Sobre un lienzo sale idéntica las 134 veces.
//
// La marca se sube al almacén como un material más (`p03/firma`) y el montaje la
// incrusta DENTRO de la codificación de cada toma (§5.7): si se pusiera al final,
// sobre la pieza ya montada, habría que recodificarla entera.

import { aBase64 } from './imagenes.js';

/**
 * Dibuja la marca y devuelve un PNG con transparencia.
 * Se dibuja a resolución generosa para que al reducirla sobre el video siga nítida.
 */
export async function dibujarMarca({ texto, color = '#ffffff', opacidad = 0.85, ancho = 720 }) {
  const t = String(texto || '').trim();
  if (!t) throw new Error('La marca necesita un texto.');

  const alto = Math.round(ancho * 0.28);
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');

  ctx.clearRect(0, 0, ancho, alto);
  ctx.globalAlpha = opacidad;

  // §4.9: tipografía GRANDE y con peso. Se ajusta hasta llenar el ancho, no al
  // revés: una marca que no se lee es una marca que no está.
  let tam = Math.round(alto * 0.62);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  do {
    ctx.font = `700 ${tam}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    if (ctx.measureText(t).width <= ancho * 0.88) break;
    tam -= 2;
  } while (tam > 10);

  // Una sombra suave: sobre una imagen clara, una marca blanca sin contorno
  // desaparece. Sobre una oscura, sin sombra queda plana.
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = Math.round(tam * 0.18);
  ctx.shadowOffsetY = Math.round(tam * 0.04);
  ctx.fillStyle = color;
  ctx.fillText(t, ancho / 2, alto / 2);

  const blob = await new Promise((res) => lienzo.toBlob(res, 'image/png'));
  if (!blob) throw new Error('El navegador no pudo dibujar la marca.');
  return { blob, datos: await aBase64(blob), tipo: 'image/png' };
}

/**
 * Superpone la marca sobre una imagen fija (miniatura, portada) y devuelve el PNG.
 * Mismo razonamiento que arriba: al modelo no se le pide que la dibuje.
 */
export async function marcarImagen(fuenteImagen, marca, { esquina = 'abajo-derecha' } = {}) {
  const [img, sello] = await Promise.all([
    createImageBitmap(fuenteImagen instanceof Blob ? fuenteImagen : await (await fetch(fuenteImagen)).blob()),
    createImageBitmap(marca.blob || marca),
  ]);

  const lienzo = document.createElement('canvas');
  lienzo.width = img.width;
  lienzo.height = img.height;
  const ctx = lienzo.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const w = Math.round(img.width * 0.18);
  const h = Math.round((sello.height / sello.width) * w);
  const m = Math.round(img.width * 0.03);
  const pos = {
    'abajo-derecha': [img.width - w - m, img.height - h - m],
    'abajo-izquierda': [m, img.height - h - m],
    'arriba-derecha': [img.width - w - m, m],
    'arriba-izquierda': [m, m],
  }[esquina] || [img.width - w - m, img.height - h - m];

  ctx.drawImage(sello, pos[0], pos[1], w, h);
  img.close?.();
  sello.close?.();

  const blob = await new Promise((res) => lienzo.toBlob(res, 'image/png'));
  return { blob, datos: await aBase64(blob), tipo: 'image/png' };
}
