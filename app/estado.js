// El estado del proyecto y sus caminos de carga (§3 y §7.2 del plano).
//
// La jerarquía es de tres niveles:
//
//   Proyecto
//    └── Pieza (capítulo / episodio / video)
//         └── Toma  ← la unidad atómica
//
// §7.2 — LOS CAMINOS DE CARGA. Son exactamente TRES y los tres pasan por
// `normalizar`. El error original fue que la recuperación remota no pasaba, y por
// eso ninguna reparación de configuración llegaba nunca al usuario. Si alguna vez
// hace falta un cuarto camino, tiene que pasar por aquí también. La auditoría lo
// comprueba.

import { normalizar } from './config.js';
import * as local from './local.js';
import { llamar } from './api.js';
import { idPieza } from '../comun/claves.mjs';

// ── Los tres caminos ──────────────────────────────────────────────────────────

/** Camino 1: proyecto nuevo. */
export function nuevoProyecto({ titulo = 'Documental sin título', tema = '', config } = {}) {
  const ahora = Date.now();
  return sanear({
    id: idPieza(1),
    titulo,
    tema,
    creado: ahora,
    modificado: ahora,
    // Sin normalizar aquí: lo hace `sanear`, que es por donde pasa este objeto y
    // los otros dos caminos. Normalizar también aquí sería un segundo sitio, y dos
    // sitios es exactamente como empezó el §7.2.
    config: config || {},
    fichas: [],
    piezas: [piezaVacia(idPieza(1), titulo)],
  });
}

/** Camino 2: recuperado de la copia local. */
export async function cargarLocal(id) {
  const bruto = await local.leerProyecto(id);
  if (!bruto) return null;
  return sanear(bruto);
}

/**
 * Camino 3: recuperado de la nube.
 *
 * ESTE es el que se olvidó (§7.2). El proyecto guardado se cargaba tal cual y las
 * reparaciones de configuración no llegaban nunca. Ahora pasa por `sanear` igual
 * que los otros dos, porque `sanear` es el único sitio donde se llama a
 * `normalizar`.
 */
export async function cargarRemoto(id) {
  const r = await llamar('proyecto.cargar', { id });
  if (!r.existe) return null;
  return sanear(r.proyecto);
}

/**
 * La reparación. Único sitio del navegador que llama a `normalizar`.
 *
 * Que sea uno solo es lo que hace que arreglar un valor por defecto llegue de
 * verdad al usuario, venga el proyecto de donde venga.
 */
export function sanear(bruto) {
  const p = { ...(bruto || {}) };

  p.id = p.id || idPieza(1);
  p.titulo = p.titulo || 'Documental sin título';
  p.tema = p.tema || '';
  p.creado = p.creado || Date.now();
  p.modificado = p.modificado || p.creado;

  // La normalización de la configuración. Aquí y en ningún otro sitio.
  p.config = normalizar(p.config);

  // El caso elegido en el paso 1. De él cuelga todo lo demás: el tema, las fichas,
  // el guion. Se guarda entero —no solo el título— para poder enseñar de dónde
  // salió el documental sin volver a buscarlo.
  p.caso = p.caso && p.caso.titulo ? p.caso : null;
  p.casosVistos = Array.isArray(p.casosVistos) ? p.casosVistos : [];
  p.tema = String(p.tema || '');
  p.temaId = String(p.temaId || '');
  p.epocaId = String(p.epocaId || '');

  p.fichas = Array.isArray(p.fichas) ? p.fichas.map(sanearFicha) : [];
  p.piezas = Array.isArray(p.piezas) && p.piezas.length
    ? p.piezas.map((z, n) => sanearPieza(z, n, p))
    : [piezaVacia(p.id, p.titulo)];

  // Mudanza de los proyectos de antes: el caso, el tema y las fichas vivían en el
  // proyecto. Se pasan a la primera pieza, que es de donde eran. Solo si esa pieza
  // no los trae ya, para no pisar nada.
  const primera = p.piezas[0];
  if (!primera.caso && p.caso) primera.caso = p.caso;
  if (!primera.tema && p.tema) primera.tema = p.tema;
  if (!primera.fichas.length && p.fichas.length) primera.fichas = p.fichas;
  if (!primera.creado) primera.creado = p.creado;
  for (const z of p.piezas) z.fichas = z.fichas.map(sanearFicha);

  // Cuál se está mirando. Si apunta a una que ya no está, la primera.
  p.piezaActiva = p.piezas.some((z) => z.id === p.piezaActiva) ? p.piezaActiva : p.piezas[0].id;

  return p;
}

/**
 * Abre una pieza nueva y la deja activa. La anterior no se toca: queda en el
 * historial, con su caso, sus fichas y su guion intactos.
 *
 * `vieneDe` marca una continuación: hereda el tratamiento del padre —para que se
 * vea y suene igual— y le da derecho a reutilizar su material (§3).
 */
export function abrirPieza(proyecto, { caso = null, titulo = '', vieneDe = null } = {}) {
  const n = proyecto.piezas.length + 1;
  const z = piezaVacia(idPieza(n), titulo || caso?.titulo || 'Sin título');
  z.creado = Date.now();
  z.caso = caso;
  z.tema = caso ? `${caso.titulo}. ${caso.sinopsis || ''}`.trim() : '';
  z.vieneDe = vieneDe;

  if (vieneDe) {
    const padre = proyecto.piezas.find((x) => x.id === vieneDe);
    if (padre) {
      // La continuación es del MISMO caso: hereda su caso, sus fichas y su
      // tratamiento. Volver a investigar lo mismo sería pagar dos veces por lo que
      // ya se sabe, y un tratamiento nuevo haría que la segunda parte no se
      // pareciera a la primera.
      z.caso = caso || padre.caso;
      z.tema = z.tema || padre.tema;
      z.fichas = [...padre.fichas];
      z.titulo = titulo || `${padre.titulo} · continuación`;

      // Se hereda EL ASPECTO, no la historia.
      //
      // Heredar el tratamiento entero era heredar la premisa, el hilo y los actos:
      // darle a «Guion» sin más habría escrito otra vez la primera parte. Lo que
      // pasa a la continuación es lo que la hace parecer la misma serie —paleta,
      // luz, música, ritmo— y las cautelas legales, que son del caso y no de la
      // pieza. Lo narrativo se queda vacío y hay que dirigirlo.
      z.tratamiento = padre.tratamiento
        ? {
            ...padre.tratamiento,
            premisa: '',
            hilo: '',
            aperturaEnFrio: '',
            cierre: '',
            estructura: [],
            soloIdentidad: true,
          }
        : null;
    }
  }

  proyecto.piezas.push(z);
  proyecto.piezaActiva = z.id;
  return z;
}

/** La cadena de piezas de la que esta desciende, de la más cercana a la más lejana. */
export function ascendencia(proyecto, pieza) {
  const salida = [];
  const vistos = new Set();
  let actual = pieza;
  while (actual?.vieneDe && !vistos.has(actual.vieneDe)) {
    vistos.add(actual.vieneDe);
    actual = proyecto.piezas.find((z) => z.id === actual.vieneDe);
    if (actual) salida.push(actual);
  }
  return salida;
}

/**
 * Una pieza es UN CASO, entero.
 *
 * Antes el caso, las fichas y el tema vivían en el proyecto y las piezas solo
 * llevaban el guion. Con eso, elegir un caso nuevo dejaba las fichas del anterior
 * donde estaban, la investigación siguiente se FUSIONABA con ellas y el director
 * acababa leyendo dos casos a la vez. Se vio en pantalla: entre los cuidados de un
 * caso salió «no mezclar este caso con los datos sobre el incendio de la discoteca
 * Kiss», que era el caso de antes.
 *
 * Ahora cada caso trae lo suyo dentro. Elegir otro caso abre otra pieza, y la
 * anterior queda en el historial en vez de contaminar.
 */
function piezaVacia(id, titulo) {
  return {
    id,
    titulo: titulo || '',
    // Lo del caso, que antes estaba en el proyecto.
    caso: null,
    tema: '',
    fichas: [],
    creado: 0,
    // Si esta pieza continúa a otra: de ahí salen el tratamiento heredado y el
    // material que se puede reutilizar en vez de volver a pagarlo.
    vieneDe: null,
    guion: '',
    tomas: [],
    escenas: [],
    metadatos: null,
    montaje: null,
    // El tratamiento del director: de él beben el guion, la dirección de arte, la
    // música y la miniatura. Se guarda con la pieza porque es de la pieza.
    tratamiento: null,
  };
}

function sanearPieza(bruto, n, proyecto) {
  const z = { ...piezaVacia(idPieza(n + 1), ''), ...(bruto || {}) };
  z.guion = String(z.guion || '');
  z.tomas = Array.isArray(z.tomas) ? z.tomas.map((t, i) => sanearToma(t, i, proyecto)) : [];
  z.escenas = Array.isArray(z.escenas) ? z.escenas : [];
  z.fichas = Array.isArray(z.fichas) ? z.fichas : [];
  z.tema = String(z.tema || '');
  z.creado = Number(z.creado) || 0;
  return z;
}

/** La toma: la unidad atómica (§3). */
function sanearToma(bruto, i, proyecto) {
  const t = { ...(bruto || {}) };
  return {
    i: Number.isInteger(t.i) ? t.i : i,
    escena: Number.isInteger(t.escena) ? t.escena : 0,
    texto: String(t.texto || ''),
    // Duración REAL, medida sobre el audio generado. Mientras no haya audio es una
    // estimación, y el modelo de datos lo dice: `medida` es el campo que manda.
    segundos: Number(t.segundos) || 0,
    medida: t.medida === true,
    // La ficha de dirección: encuadre, movimiento de cámara, lugar, luz, quién sale.
    plano: t.plano || null,
    // Estado de cada pieza generada.
    audio: t.audio || null,
    imagen: t.imagen || null,
    video: t.video || null,
    // Clave de otra toma cuyo fotograma se aprovecha: dos tomas con el mismo plano
    // no se pagan dos veces (§3).
    reusa: Number.isInteger(t.reusa) ? t.reusa : null,
    // Material heredado de OTRA PIEZA, por su clave entera.
    //
    // Esto faltaba, y era de los caros. `sanearToma` no hace spread: devuelve una
    // lista blanca, y todo lo que no esté aquí se borra en CADA carga del
    // proyecto. `heredado` y `heredadoVid` no estaban, pero `imagen: 'ok'` y
    // `video: 'ok'` sí. Así que al recargar quedaba una toma que dice tener
    // material y no dice cuál: la clave se componía como local, el archivo no
    // existía, el montaje se paraba y la fase de imagen ni siquiera lo regeneraba
    // —porque para ella ya estaba hecho—. Callejón sin salida desde la interfaz.
    heredado: claveHeredada(t.heredado),
    heredadoVid: claveHeredada(t.heredadoVid),
    // La ficha cambió al volver a dirigir y el material anterior ya no vale.
    desfasada: t.desfasada === true,
    movimiento: t.movimiento === true,
    // §8.2: cada toma sabe de qué tipo es su imagen, y eso puede salir en pantalla.
    tipoImagen: ['generada', 'archivo', 'reconstruccion'].includes(t.tipoImagen)
      ? t.tipoImagen
      : proyecto?.config?.imagen?.tipoPorDefecto || 'reconstruccion',
    // §8.1: cada toma conserva la referencia a la ficha que la respalda.
    fichas: Array.isArray(t.fichas) ? t.fichas : [],
    corteForzado: t.corteForzado === true,
    // Si el corte del audio lo dijo el servicio de voz o se estimó.
    corteExacto: t.corteExacto === true,
  };
}

/**
 * Una clave de material heredado, o null.
 *
 * Se valida la forma —`pieza/algo/tipo`— en vez de aceptar cualquier cadena: una
 * clave inventada apuntaría a un archivo que no existe y el fallo aparecería en el
 * montaje, media hora después y lejos de aquí.
 */
const FORMA_CLAVE = /^[\w.-]+\/[\w.-]+\/(img|vid|audio|mus|firma)$/;
const claveHeredada = (v) => (typeof v === 'string' && FORMA_CLAVE.test(v) ? v : null);

/** §8.1: afirmación, fuente, fecha, cita literal, enlace. */
const TIPOS_FUENTE = ['oficial', 'judicial', 'policial', 'prensa', 'academica', 'testimonio', 'otra'];

function sanearFicha(bruto) {
  const f = { ...(bruto || {}) };
  return {
    id: f.id || `f${Math.random().toString(36).slice(2, 9)}`,
    afirmacion: String(f.afirmacion || ''),
    fuente: String(f.fuente || ''),
    // Un dato de una sentencia y un dato de un blog no valen lo mismo. Que el tipo
    // viaje en el modelo es lo que permite ordenarlos por solidez y enseñarlo.
    tipoFuente: TIPOS_FUENTE.includes(f.tipoFuente) ? f.tipoFuente : 'otra',
    angulo: String(f.angulo || ''),
    fecha: String(f.fecha || ''),
    cita: String(f.cita || ''),
    enlace: String(f.enlace || ''),
    fiabilidad: f.fiabilidad || 'sin calificar',
    incierto: f.incierto === true,
    consultadas: Array.isArray(f.consultadas) ? f.consultadas.slice(0, 6) : [],
  };
}

// ── Guardado ──────────────────────────────────────────────────────────────────

/**
 * Guarda en local siempre, y en la nube cuando se pueda.
 *
 * §4: «Cada unidad terminada se escribe antes de pasar a la siguiente: se puede
 * detener a mitad y reanudar sin perder nada.» Esta función es la que hace cierta
 * esa frase, y por eso se llama mucho.
 */
export async function guardar(proyecto, { remoto = false } = {}) {
  proyecto.modificado = Date.now();
  await local.guardarProyecto(proyecto);
  if (remoto) {
    // El almacén es la única fuente de verdad (§1): si esto falla, hay que
    // enterarse. No se traga el error.
    await llamar('proyecto.guardar', { id: proyecto.id, proyecto });
  }
  return proyecto;
}

export const listarLocales = () => local.listarProyectos();

export async function listarRemotos() {
  const r = await llamar('proyecto.listar');
  return r.proyectos || [];
}

// ── Consultas sobre el modelo ─────────────────────────────────────────────────

export function piezaDe(proyecto, idPiezaBuscada) {
  return proyecto.piezas.find((z) => z.id === idPiezaBuscada) || proyecto.piezas[0];
}

/** Cuánto dura la pieza según lo que hay medido ahora mismo. */
export function duracionDe(pieza) {
  return (pieza.tomas || []).reduce((s, t) => s + (Number(t.segundos) || 0), 0);
}

/** Qué falta por generar, por fase. Alimenta el modo «solo las que faltan» (§4). */
export function loQueFalta(pieza) {
  const t = pieza.tomas || [];
  return {
    direccion: t.filter((x) => !x.plano).length,
    narracion: t.filter((x) => x.audio !== 'ok').length,
    imagen: t.filter((x) => x.reusa === null && x.imagen !== 'ok').length,
    movimiento: t.filter((x) => x.movimiento && x.video !== 'ok').length,
    total: t.length,
  };
}
