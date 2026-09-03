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
  // Las dos pistas sueltas del montaje. El contenedor ya las fabrica —la voz
  // entera en PCM y el lecho de música entero— y antes las tiraba al terminar:
  // subirlas cuesta un `cp` y son lo que hace falta para retocar el audio fuera
  // sin volver a montar.
  voz: '.m4a',
  lecho: '.m4a',
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
export const claveVozEntera = (pieza) => `${pieza}/voz`;
export const claveLecho = (pieza) => `${pieza}/lecho`;

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

/**
 * ¿EL CLIP DE ESTA TOMA SALIÓ DE LA IMAGEN QUE HAY AHORA?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Le sigue saliendo la opción de clip listo, cuando ese es un clip de la imagen
 *  anterior, que ya no quiero.»
 *
 * `video: 'ok'` era UNA BANDERA SUELTA: decía que existía un clip, y no decía de
 * qué imagen había salido. Así que rehacer la imagen dejaba un clip huérfano que
 * seguía dándose por bueno, y arreglarlo consistía en acordarse de apagar la
 * bandera en cada sitio que rehace una imagen. Me acordé en dos y no bastó —
 * porque el problema no era el olvido, era que la validez no estaba escrita en
 * ninguna parte.
 *
 * Ahora sí: cada imagen generada sube `versionImagen`, y el clip anota en
 * `versionClip` la versión de la que salió. Un clip vale si los dos números
 * coinciden. No hay que apagar nada: si la imagen cambia, el clip deja de valer
 * SOLO, venga el cambio de donde venga —rehacer, el catálogo, una restauración—.
 *
 * Un clip HEREDADO de otra pieza no se juzga aquí: su validez es de la toma de
 * la que salió, en su propia pieza.
 *
 * Y sin números —material de antes de que esto existiera— manda `aprobada`: la
 * única forma de que una imagen con clip haya perdido el visto bueno es que la
 * imagen se haya rehecho o que el catálogo la haya dejado desfasada, y en los dos
 * casos el clip que había ya no sirve.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function clipVigente(toma, tomas) {
  const dueña = tomaDelFotograma(toma, tomas);
  if (toma.heredadoVid || dueña.heredadoVid) return true;
  if (dueña.video !== 'ok') return false;

  const deLaImagen = Number(dueña.versionImagen) || 0;
  const delClip = Number(dueña.versionClip) || 0;
  // Con números, mandan los números.
  if (deLaImagen || delClip) return delClip === deLaImagen;
  // Sin ellos: un clip sobre una imagen que ya nadie ha aprobado es un clip de la
  // imagen anterior.
  return dueña.imagen !== 'ok' || dueña.aprobada !== false;
}

/** La clave del fotograma que le toca a una toma, con la reutilización ya resuelta. */
export function claveClip(pieza, toma, tomas) {
  // Un clip heredado de otra pieza: la clave viene entera.
  if (toma.heredadoVid) return toma.heredadoVid;
  // Y si no, la del clip de SU DUEÑA — preguntándole también a ella si heredó.
  //
  // Preguntar solo por la toma de partida no bastaba: si la dueña de la cadena
  // heredó su clip de otra pieza, el clip vive allí, y la repetición componía una
  // clave local de un archivo que nadie ha generado ni va a generar —la dueña se
  // salta por heredada y la repetición por repetir—. El montaje se paraba pidiendo
  // un archivo sin dueño.
  const dueña = tomaDelFotograma(toma, tomas);
  if (dueña.heredadoVid) return dueña.heredadoVid;
  return claveToma(pieza, dueña.i, 'vid');
}

/**
 * LA CLAVE DE LA VOZ DE UNA TOMA — respetando el nombre con el que se subió.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El nombre del archivo lleva dentro el número de la toma: `p07/t017/audio`. Al
 * volver a repartir el guion los números se mueven, y el archivo NO se mueve con
 * ellos. Una toma renumerada que compusiera su clave a mano pediría un archivo
 * que nadie ha subido —y `audio: 'ok'` seguiría diciendo que está—: en pantalla,
 * todo verde; en el montaje, la voz que falta.
 *
 * `heredadoAudio` guarda el nombre real. Es lo mismo que `heredado` hace con la
 * imagen, y por la misma razón.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function claveVoz(pieza, toma) {
  return toma?.heredadoAudio || claveToma(pieza, toma.i, 'audio');
}

export function claveFotograma(pieza, toma, tomas) {
  // Una toma heredada apunta a la imagen de OTRA PIEZA: es una continuación que
  // reutiliza un plano del caso anterior. La clave ya viene entera —lleva su pieza
  // dentro— así que se usa tal cual y no se compone.
  //
  // Se mira ANTES que `reusa` a propósito: heredar es más fuerte que reusar dentro
  // de la pieza, porque la imagen ya existe y ya está pagada.
  if (toma.heredado) return toma.heredado;
  // Y a la dueña de la cadena también: el mismo agujero que en los clips.
  const dueña = tomaDelFotograma(toma, tomas);
  if (dueña.heredado) return dueña.heredado;
  return claveToma(pieza, dueña.i, 'img');
}
