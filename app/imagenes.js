// Reducción de imágenes (§6 del plano).
//
//   «Toda imagen que se envíe se reduce antes. Las referencias, a ~1024 px de lado
//    (el codificador visual de los modelos trabaja por ahí; lo que sobra lo tira
//    él). El fotograma de partida de un clip, al lado que el generador de video va
//    a emitir. Nada viaja entero. NUNCA hagas una excepción "porque este caso es
//    especial": esa excepción es el bug.»
//
// Por eso este módulo es el ÚNICO sitio del navegador que convierte una imagen en
// bytes para mandar. No hay una vía rápida, ni un parámetro para saltarse la
// reducción, ni una versión «sin tocar». La auditoría comprueba que ninguna fase
// componga un payload de imagen por su cuenta.
//
// Una imagen de 2K en PNG son ~4,2 MB en base64. El tope de la petición son 4,5 MB.
// No es que quepa justa: es que no cabe con nada más al lado.

const TIPO_SALIDA = 'image/jpeg';
const CALIDAD = 0.86;

/**
 * Reduce una imagen a `lado` píxeles de lado mayor y devuelve base64 sin cabecera.
 * Es la única puerta de salida de una imagen hacia la función.
 */
export async function reducir(fuente, lado, { tipo = TIPO_SALIDA, calidad = CALIDAD } = {}) {
  if (!Number.isFinite(lado) || lado < 64 || lado > 2048) {
    throw new Error(`Lado de reducción fuera de rango: ${lado}.`);
  }

  const bitmap = await aBitmap(fuente);
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));

  const lienzo = document.createElement('canvas');
  lienzo.width = w;
  lienzo.height = h;
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  const blob = await new Promise((res) => lienzo.toBlob(res, tipo, calidad));
  if (!blob) throw new Error('El navegador no pudo reducir la imagen.');

  return { datos: await aBase64(blob), tipo: blob.type, ancho: w, alto: h, bytes: blob.size };
}

/**
 * Reduce una tanda de referencias (§4.6: sujetos y lugares que se parezcan entre
 * tomas). Recorta la lista al máximo configurado: cada referencia extra es peso en
 * una petición que tiene un tope duro.
 */
export async function reducirReferencias(fuentes, lado, maximo = 3) {
  const salida = [];
  for (const f of (fuentes || []).slice(0, maximo)) {
    if (!f) continue;
    salida.push(await reducir(f, lado));
  }
  return salida;
}

/**
 * El fotograma de partida de un clip de movimiento.
 * Se reduce «al lado que el generador de video va a emitir» (§6): mandarlo más
 * grande no mejora nada y solo gasta presupuesto de petición.
 */
export async function reducirFotogramaDePartida(fuente, anchoSalida) {
  return reducir(fuente, Math.min(1280, anchoSalida || 1280), { tipo: 'image/jpeg' });
}

async function aBitmap(fuente) {
  if (typeof fuente === 'string') {
    const blob = fuente.startsWith('data:')
      ? await (await fetch(fuente)).blob()
      : await (await fetch(fuente)).blob();
    return createImageBitmap(blob);
  }
  if (fuente instanceof Blob) return createImageBitmap(fuente);
  if (fuente instanceof ArrayBuffer || ArrayBuffer.isView(fuente)) {
    return createImageBitmap(new Blob([fuente]));
  }
  if (fuente && fuente.width && fuente.height) return fuente; // ya es bitmap o canvas
  throw new Error('No sé reducir eso: no es un blob, ni un data URL, ni un bitmap.');
}

/** Blob → base64 sin la cabecera `data:...;base64,`. */
export function aBase64(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('No se pudo leer la imagen.'));
    fr.onload = () => {
      const s = String(fr.result);
      res(s.slice(s.indexOf(',') + 1));
    };
    fr.readAsDataURL(blob);
  });
}

/** base64 → Blob, por trozos para no reventar la memoria del teléfono (§6). */
export function deBase64(b64, tipo = 'application/octet-stream') {
  const bruto = atob(b64);
  const trozo = 64 * 1024;
  const partes = [];
  for (let i = 0; i < bruto.length; i += trozo) {
    const rebanada = bruto.slice(i, i + trozo);
    const bytes = new Uint8Array(rebanada.length);
    for (let j = 0; j < rebanada.length; j++) bytes[j] = rebanada.charCodeAt(j);
    partes.push(bytes);
  }
  return new Blob(partes, { type: tipo });
}
