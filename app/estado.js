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

  p.fichas = Array.isArray(p.fichas) ? p.fichas.map(sanearFicha) : [];
  p.piezas = Array.isArray(p.piezas) && p.piezas.length
    ? p.piezas.map((z, n) => sanearPieza(z, n, p))
    : [piezaVacia(p.id, p.titulo)];

  return p;
}

function piezaVacia(id, titulo) {
  return {
    id,
    titulo: titulo || '',
    guion: '',
    tomas: [],
    escenas: [],
    metadatos: null,
    montaje: null,
  };
}

function sanearPieza(bruto, n, proyecto) {
  const z = { ...piezaVacia(idPieza(n + 1), ''), ...(bruto || {}) };
  z.guion = String(z.guion || '');
  z.tomas = Array.isArray(z.tomas) ? z.tomas.map((t, i) => sanearToma(t, i, proyecto)) : [];
  z.escenas = Array.isArray(z.escenas) ? z.escenas : [];
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
    movimiento: t.movimiento === true,
    // §8.2: cada toma sabe de qué tipo es su imagen, y eso puede salir en pantalla.
    tipoImagen: ['generada', 'archivo', 'reconstruccion'].includes(t.tipoImagen)
      ? t.tipoImagen
      : proyecto?.config?.imagen?.tipoPorDefecto || 'reconstruccion',
    // §8.1: cada toma conserva la referencia a la ficha que la respalda.
    fichas: Array.isArray(t.fichas) ? t.fichas : [],
    corteForzado: t.corteForzado === true,
  };
}

/** §8.1: afirmación, fuente, fecha, cita literal, enlace. */
function sanearFicha(bruto) {
  const f = { ...(bruto || {}) };
  return {
    id: f.id || `f${Math.random().toString(36).slice(2, 9)}`,
    afirmacion: String(f.afirmacion || ''),
    fuente: String(f.fuente || ''),
    fecha: String(f.fecha || ''),
    cita: String(f.cita || ''),
    enlace: String(f.enlace || ''),
    fiabilidad: f.fiabilidad || 'sin calificar',
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
