// Claves de material (§3 del plano).
//
// Cada archivo generado tiene una clave DETERMINISTA, no un nombre inventado:
//
//   p03/t017/img      p03/t017/audio      p03/t017/vid
//   p03/mus/002       p03/firma           portada/p03
//
// Con eso, cualquiera puede reconstruir dónde está una pieza sin consultar un
// índice.
//
// Este módulo es COMÚN a las tres piezas del sistema: lo importa el navegador para
// componer claves, la función para traducirlas a rutas, y la auditoría para
// comprobar que nadie se inventa un nombre por su cuenta. Que sea uno solo es lo
// que impide que se desincronicen.
//
// No usa nada de Node ni nada del navegador. A propósito.

export const EXTENSIONES = {
  img: '.png',
  audio: '.wav',
  vid: '.mp4',
  mus: '.wav',
  firma: '.png',
  portada: '.png',
  miniatura: '.png',
  cartel: '.png',
  hoja: '.json',
  encargo: '.json',
  manifiesto: '.txt',
  proyecto: '.json',
  fichas: '.json',
  registro: '.txt',
  final: '.mp4',
  propio: '.bin',
};

export const CLAVE_VALIDA = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/;

/** `3` → `p03`. La pieza es el capítulo / episodio / video. */
export function idPieza(n) {
  return 'p' + String(n).padStart(2, '0');
}

/** `17` → `t017`. La toma es la unidad atómica. */
export function idToma(i) {
  return 't' + String(i).padStart(3, '0');
}

export function claveToma(pieza, i, tipo) {
  if (!EXTENSIONES[tipo]) throw new Error(`Tipo de material desconocido: «${tipo}».`);
  return `${pieza}/${idToma(i)}/${tipo}`;
}

export function claveMusica(pieza, escena) {
  return `${pieza}/mus/${String(escena).padStart(3, '0')}`;
}

export const claveFirma = (pieza) => `${pieza}/firma`;
export const clavePortada = (pieza) => `portada/${pieza}`;
export const claveMiniatura = (pieza) => `${pieza}/miniatura`;
export const claveHoja = (pieza) => `${pieza}/hoja`;
export const claveFinal = (pieza) => `${pieza}/final`;

/** El tipo de material que hay detrás de una clave. */
export function tipoDe(clave) {
  const c = String(clave || '').trim();
  if (!CLAVE_VALIDA.test(c)) throw new Error(`Clave de material inválida: «${clave}».`);
  const partes = c.split('/');
  const ultima = partes[partes.length - 1];
  const penultima = partes.length > 1 ? partes[partes.length - 2] : '';
  const tipo = EXTENSIONES[ultima] ? ultima : EXTENSIONES[penultima] ? penultima : null;
  if (!tipo) throw new Error(`Clave de material de tipo desconocido: «${clave}».`);
  return tipo;
}

export function extensionDe(clave) {
  return EXTENSIONES[tipoDe(clave)];
}

/**
 * Nombre LOCAL dentro del contenedor de montaje.
 *
 * El contenedor no inventa este nombre: se lo damos hecho en la columna «destino»
 * del manifiesto (§7.4). Lo componemos aquí para que el guion de ffmpeg y el
 * manifiesto usen exactamente la misma cadena — si cada uno lo derivara por su
 * cuenta, discreparían el día que cambie el esquema.
 */
export function nombreLocal(clave) {
  return String(clave).replace(/\//g, '_') + extensionDe(clave);
}

/**
 * El ayudante que resuelve la reutilización (§3).
 *
 * Dos tomas con el mismo plano no se pagan dos veces: la segunda lleva `reusa` con
 * el índice de la primera. TODO el que lee un fotograma pasa por aquí — si no,
 * vería un hueco donde en realidad hay una imagen compartida.
 */
export function tomaDelFotograma(toma, tomas) {
  let actual = toma;
  const vistas = new Set();
  while (actual && actual.reusa !== undefined && actual.reusa !== null && actual.reusa !== '') {
    if (vistas.has(actual.i)) {
      throw new Error(`La reutilización de fotogramas da vueltas en círculo en la toma ${toma.i}.`);
    }
    vistas.add(actual.i);
    const siguiente = tomas.find((t) => t.i === actual.reusa);
    if (!siguiente) {
      throw new Error(`La toma ${actual.i} reusa la toma ${actual.reusa}, que no existe.`);
    }
    actual = siguiente;
  }
  return actual;
}

/** La clave del fotograma que le toca a una toma, con la reutilización ya resuelta. */
export function claveFotograma(pieza, toma, tomas) {
  // Una toma heredada apunta a la imagen de OTRA PIEZA: es una continuación que
  // reutiliza un plano del caso anterior. La clave ya viene entera —lleva su pieza
  // dentro— así que se usa tal cual y no se compone.
  //
  // Se mira ANTES que `reusa` a propósito: heredar es más fuerte que reusar dentro
  // de la pieza, porque la imagen ya existe y ya está pagada.
  if (toma.heredado) return toma.heredado;
  return claveToma(pieza, tomaDelFotograma(toma, tomas).i, 'img');
}
