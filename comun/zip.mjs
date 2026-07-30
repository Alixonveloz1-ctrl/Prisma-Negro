// El paquete de entrega: un ZIP que se arma SIN CARGAR NADA EN MEMORIA.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ ESTO NO USA UNA BIBLIOTECA
//
// El video de un documental de quince minutos pesa más de un giga. Cualquier
// empaquetador que reciba los archivos como bytes los materializa en memoria de
// JavaScript, y el navegador de un teléfono recarga la página a media descarga —
// que es exactamente el motivo por el que el video ya se baja por trozos.
//
// Un ZIP sin compresión es un formato de pegar: por cada archivo, una cabecera y
// sus bytes tal cual; al final, un índice. Las cabeceras son las únicas que hay
// que calcular, y son bytes contados. Todo lo demás son los Blob que ya están en
// disco, y un Blob de Blobs no copia nada.
//
// Y sin compresión es lo correcto además de lo barato: un MP4 y un M4A ya vienen
// comprimidos. Comprimirlos otra vez cuesta minutos de teléfono para no ahorrar
// ni un uno por ciento.
// ─────────────────────────────────────────────────────────────────────────────

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/**
 * CRC32 acumulable. Se le van dando trozos según llegan, y así el archivo entero
 * no tiene que estar nunca en memoria a la vez.
 */
export function crc32(bytes, previo = 0) {
  let c = (previo ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = (TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

const codificar = (s) => new TextEncoder().encode(s);

function escribir(vista, pos, valor, bytes) {
  for (let i = 0; i < bytes; i++) vista[pos + i] = (valor >>> (i * 8)) & 0xff;
}

/**
 * Fecha en formato MS-DOS, que es lo que el ZIP guarda. Sin esto, los archivos
 * salen con fecha 1980 y algunos gestores los marcan como sospechosos.
 */
function fechaDos(cuando) {
  const d = cuando instanceof Date ? cuando : new Date(cuando || 0);
  const año = Math.max(1980, d.getFullYear());
  return {
    fecha: (((año - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f),
    hora: ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f),
  };
}

/**
 * Arma el ZIP.
 *
 * `entradas` son `{ nombre, partes, bytes, crc }`, donde `partes` es la lista de
 * Blob del archivo —los mismos trozos con los que se bajó— y `crc` el CRC32 que
 * se fue acumulando al bajarlos. Se pide hecho a propósito: calcularlo aquí
 * obligaría a releer más de un giga.
 *
 * Devuelve la lista de piezas para un Blob. Quien llame hace `new Blob(piezas)`,
 * que en el navegador es una referencia, no una copia.
 */
export function armarZip(entradas, { cuando = 0 } = {}) {
  const piezas = [];
  const indice = [];
  let desplazamiento = 0;
  const { fecha, hora } = fechaDos(cuando);

  for (const e of entradas) {
    const nombre = codificar(e.nombre);
    const cabecera = new Uint8Array(30 + nombre.length);
    escribir(cabecera, 0, 0x04034b50, 4); // firma de cabecera local
    escribir(cabecera, 4, 20, 2); // versión necesaria
    escribir(cabecera, 6, 0x0800, 2); // el nombre va en UTF-8
    escribir(cabecera, 8, 0, 2); // método 0: guardado, sin comprimir
    escribir(cabecera, 10, hora, 2);
    escribir(cabecera, 12, fecha, 2);
    escribir(cabecera, 14, e.crc >>> 0, 4);
    escribir(cabecera, 18, e.bytes, 4);
    escribir(cabecera, 22, e.bytes, 4);
    escribir(cabecera, 26, nombre.length, 2);
    escribir(cabecera, 28, 0, 2);
    cabecera.set(nombre, 30);

    piezas.push(cabecera, ...e.partes);
    indice.push({ nombre, e, desplazamiento });
    desplazamiento += cabecera.length + e.bytes;
  }

  const inicioIndice = desplazamiento;
  let largoIndice = 0;
  for (const { nombre, e, desplazamiento: d } of indice) {
    const c = new Uint8Array(46 + nombre.length);
    escribir(c, 0, 0x02014b50, 4); // firma de entrada del índice
    escribir(c, 4, 20, 2);
    escribir(c, 6, 20, 2);
    escribir(c, 8, 0x0800, 2);
    escribir(c, 10, 0, 2);
    escribir(c, 12, hora, 2);
    escribir(c, 14, fecha, 2);
    escribir(c, 16, e.crc >>> 0, 4);
    escribir(c, 20, e.bytes, 4);
    escribir(c, 24, e.bytes, 4);
    escribir(c, 28, nombre.length, 2);
    escribir(c, 42, d, 4);
    c.set(nombre, 46);
    piezas.push(c);
    largoIndice += c.length;
  }

  const fin = new Uint8Array(22);
  escribir(fin, 0, 0x06054b50, 4); // firma del final del índice
  escribir(fin, 8, indice.length, 2);
  escribir(fin, 10, indice.length, 2);
  escribir(fin, 12, largoIndice, 4);
  escribir(fin, 16, inicioIndice, 4);
  piezas.push(fin);

  return piezas;
}

/**
 * El tope del ZIP clásico: cuatro gigas por archivo y en total. Por encima hace
 * falta ZIP64, y un ZIP que dice un tamaño y trae otro no se abre — así que si
 * se llega ahí, se dice antes de empezar en vez de entregar un archivo roto.
 */
export const TOPE_ZIP = 0xffffffff;

export function cabeEnZip(entradas) {
  let total = 0;
  for (const e of entradas) {
    if (e.bytes > TOPE_ZIP) return false;
    total += e.bytes + 30 + 46 + e.nombre.length * 2;
  }
  return total <= TOPE_ZIP;
}
