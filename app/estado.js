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
  // La idea escrita a mano y las propuestas pagadas. Sin guardarlas, cinco
  // propuestas desaparecen por recargar la pestaña — y se pagaron.
  p.idea = String(p.idea || '');
  p.casosPropuestos = Array.isArray(p.casosPropuestos) ? p.casosPropuestos : [];

  // EL NÚMERO MÁS ALTO DE EPISODIO QUE SE HA LLEGADO A DAR. NUNCA BAJA.
  //
  // Sin esto, borrar un episodio es destruir material pagado sin avisar. El id se
  // daba contando los episodios que hay: con p01, p02 y p03, borrar el p02 deja
  // dos, y el siguiente se llamaría p03 — el mismo id que el que sigue vivo. Sus
  // claves de material son `p03/tNNN/img`, así que la primera imagen del episodio
  // nuevo ESCRIBE ENCIMA de la del viejo, en el almacén, sin un solo error.
  //
  // Se guarda el mayor jamás dado y se sigue desde ahí. Un hueco en la numeración
  // no molesta a nadie; una colisión se lleva por delante horas de generación.
  p.numeroPiezas = Math.max(
    Number(p.numeroPiezas) || 0,
    ...(Array.isArray(p.piezas) ? p.piezas : []).map((z) => Number(String(z?.id || '').match(/^p(\d+)$/)?.[1]) || 0),
  );

  // EL REGISTRO DE REPARTO: qué persona y qué versión usó cada episodio.
  //
  // `{ p03: { 'personaje:perito': 'v2', 'recurso:carretera-noche': 'v1' } }`.
  //
  // Es LA MEMORIA del canal, y por eso vive en el proyecto y no en la pieza: la
  // pregunta que hay que poder contestar es «¿qué se usó en los dos episodios
  // ANTERIORES?», y eso no cabe dentro de una pieza. Sin esto, cada episodio
  // elegiría el primero de la lista y el mismo perito saldría en todos.
  p.reparto = p.reparto && typeof p.reparto === 'object' && !Array.isArray(p.reparto) ? p.reparto : {};

  p.fichas = Array.isArray(p.fichas) ? p.fichas.map(sanearFicha) : [];
  // SIN EPISODIOS ES UN ESTADO VÁLIDO, y esto no puede rellenarlo.
  //
  // Aquí había un `: [piezaVacia(...)]` para la lista vacía, y desde que borrar el
  // último episodio está permitido eso sería deshacerlo: se borra, se recarga y
  // vuelve a aparecer un episodio en blanco. Un proyecto NUEVO sigue naciendo con
  // su pieza porque se la pone `nuevoProyecto`; lo que no se hace es resucitar lo
  // que alguien borró a propósito.
  p.piezas = Array.isArray(p.piezas) ? p.piezas.map((z, n) => sanearPieza(z, n, p)) : [];

  // Mudanza de los proyectos de antes: el caso, el tema y las fichas vivían en el
  // proyecto. Se pasan a la primera pieza, que es de donde eran. Solo si esa pieza
  // no los trae ya, para no pisar nada.
  const primera = p.piezas.find((z) => !z.esBiblioteca);
  if (primera) {
    if (!primera.caso && p.caso) primera.caso = p.caso;
    if (!primera.tema && p.tema) primera.tema = p.tema;
    if (!primera.fichas.length && p.fichas.length) primera.fichas = p.fichas;
    if (!primera.creado) primera.creado = p.creado;
  }
  for (const z of p.piezas) z.fichas = z.fichas.map(sanearFicha);

  // Cuál se está mirando. Si apunta a uno que ya no está, el primero.
  //
  // Y NUNCA LA BIBLIOTECA: no tiene guion ni voz ni montaje, así que dejarla
  // activa deja la pantalla entera en un estado que no lleva a ningún sitio —y
  // peor: cualquier fase escribiría dentro de ella, encima de las 141 imágenes que
  // se pagan una sola vez—. Sin ningún episodio, vacío: es lo que dice la verdad.
  const montables = p.piezas.filter((z) => !z.esBiblioteca);
  p.piezaActiva = montables.some((z) => z.id === p.piezaActiva) ? p.piezaActiva : montables[0]?.id || '';

  return p;
}

/** La pieza de la biblioteca, si el proyecto ya la tiene. */
export const bibliotecaDe = (proyecto) => (proyecto?.piezas || []).find((z) => z.esBiblioteca) || null;

/** Las piezas que son episodios de verdad: todas menos la biblioteca. */
export const episodiosDe = (proyecto) => (proyecto?.piezas || []).filter((z) => !z.esBiblioteca);

/**
 * Abre una pieza nueva y la deja activa. La anterior no se toca: queda en el
 * historial, con su caso, sus fichas y su guion intactos.
 *
 * `vieneDe` marca una continuación: hereda el tratamiento del padre —para que se
 * vea y suene igual— y le da derecho a reutilizar su material (§3).
 */
export function abrirPieza(proyecto, { caso = null, titulo = '', vieneDe = null } = {}) {
  // DEL CONTADOR QUE NUNCA BAJA, no de cuántos hay ahora. Ver `numeroPiezas` en
  // `sanear`: contando los vivos, borrar uno haría que el siguiente reutilizara su
  // id y escribiera encima de su material en el almacén.
  const n = (proyecto.numeroPiezas || episodiosDe(proyecto).length) + 1;
  proyecto.numeroPiezas = n;
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
      // luz, música, ritmo— y lo que el caso deja abierto, que es del caso y no de
      // la pieza. Lo narrativo se queda vacío y hay que dirigirlo.
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

/**
 * Reescribir un caso: OTRA pieza del mismo caso, para escribir el guion de nuevo
 * sin tocar la vieja.
 *
 * Regenerar el guion EN LA MISMA pieza pisa las tomas enteras: se pierden los
 * enlaces a las imágenes, clips y voces ya pagados, y lo que se generara después
 * escribiría encima de los mismos archivos que ese material ocupa, porque las
 * claves (pieza/toma) serían las mismas. Una pieza nueva estrena numeración —sus
 * claves no chocan con nada— y la vieja queda entera en el historial, con su
 * material listo para «Reutilizar».
 *
 * NO es una continuación: no lleva `vieneDe`, porque la ascendencia significa «lo
 * ya contado, no lo repitas», y aquí se quiere contar LO MISMO otra vez, mejor.
 * El tratamiento pasa ENTERO —premisa, hilo, actos, paleta, música—: con él se
 * puede generar el guion directamente, y quien quiera otra estructura le da a
 * «Dirigir» primero, que lo reemplaza.
 */
export function reescribirPieza(proyecto, idVieja) {
  const vieja = proyecto.piezas.find((x) => x.id === idVieja);
  if (!vieja) throw new Error('No encuentro la pieza que quieres reescribir.');
  const z = abrirPieza(proyecto, {
    caso: vieja.caso,
    titulo: `${vieja.titulo || 'Sin título'} · reescrito`,
  });
  z.tema = vieja.tema;
  z.fichas = [...vieja.fichas];
  z.tratamiento = vieja.tratamiento ? structuredClone(vieja.tratamiento) : null;
  return z;
}

/**
 * Borra un episodio del proyecto.
 *
 * NO borra el material del almacén, y es a propósito: lo generado está pagado y
 * puede seguir sirviendo —la reutilización entre casos mira TODAS las piezas—, y
 * un borrado en la nube no se puede deshacer desde un teléfono. Lo que se quita es
 * el episodio de la lista.
 *
 * Y su id NO se reutiliza nunca: `numeroPiezas` solo sube. Ver `sanear`.
 *
 * Lo que sí se limpia es lo que dejaría de tener sentido: las continuaciones que
 * colgaban de él se quedan sin padre —mejor huérfanas que apuntando a algo que no
 * está—, y su entrada en el registro de reparto se va con él, porque preguntar
 * «¿qué usó el episodio que ya no existe?» solo puede confundir a la rotación.
 */
export function borrarPieza(proyecto, id) {
  const z = proyecto.piezas.find((x) => x.id === id);
  if (!z) throw new Error('Ese episodio ya no está.');
  if (z.esBiblioteca) throw new Error('La biblioteca no se borra: es lo que hace baratos a los demás.');

  // ───────────────────────────────────────────────────────────────────────────
  // BORRAR ES BORRAR, Y NO HAY QUE HACER NADA ANTES.
  //
  // «No puedo eliminar el episodio si no genero otro primero. ¿Qué es eso? Si
  //  eliminar es eliminar, ¿por qué tengo que a juro generar otro antes?»
  //
  // Aquí había un `if (episodiosDe(proyecto).length <= 1) throw`, y no estaba
  // defendiendo nada suyo: estaba defendiendo una comodidad MÍA —que
  // `piezaActiva` siempre apuntara a algo, para no tener que pensar en el caso de
  // cero episodios—. El precio lo pagaba él: para tirar un episodio que no
  // quería, tenía que crear otro que tampoco quería.
  //
  // Ahora el proyecto puede quedarse sin ningún episodio y la pantalla lo dice.
  // Quien tenía que aguantar el caso de cero era el código, no la persona.
  // ───────────────────────────────────────────────────────────────────────────
  proyecto.piezas = proyecto.piezas.filter((x) => x.id !== id);
  for (const otra of proyecto.piezas) if (otra.vieneDe === id) otra.vieneDe = null;
  if (proyecto.reparto) delete proyecto.reparto[id];
  if (proyecto.piezaActiva === id) proyecto.piezaActiva = episodiosDe(proyecto)[0]?.id || '';
  return proyecto;
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
  // La biblioteca es una pieza, pero no se monta nunca y su id no es `pNN`.
  z.esBiblioteca = z.esBiblioteca === true;
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
    // Los segundos que la imagen se queda DESPUÉS de la última palabra, y los que
    // entra ANTES de la primera —esto último, solo la primera toma de la pieza—.
    // Es donde vive el silencio; sin estos dos campos el montaje corta en seco en
    // cada sílaba final y no hay suspense posible.
    respiro: Math.max(0, Math.min(8, Number(t.respiro) || 0)),
    entrada: Math.max(0, Math.min(8, Number(t.entrada) || 0)),
    // §8.2: cada toma sabe de qué tipo es su imagen, y eso puede salir en pantalla.
    tipoImagen: ['generada', 'archivo', 'reconstruccion'].includes(t.tipoImagen)
      ? t.tipoImagen
      : proyecto?.config?.imagen?.tipoPorDefecto || 'reconstruccion',
    // La clase FINA del plano (dramatización, mapa, esquema…), que decide el
    // director. No estaba en esta lista, así que moría en cada recarga —la misma
    // avería que mató a `heredado`—: al volver a dirigir, las tomas ya dirigidas
    // se re-sembraban como «reconstrucción» y las dramatizaciones se perdían.
    claseVisual: ['dramatizacion', 'reconstruccion', 'mapa', 'esquema', 'recurso', 'archivo'].includes(t.claseVisual)
      ? t.claseVisual
      : null,
    // LO DE LA BIBLIOTECA. Una toma de la biblioteca no sale de un guion: sale
    // del catálogo, y `clave` es lo que la ata a su entrada —`recurso:precinto`,
    // `personaje:crimen-frio:perito`—. Sin ella, sincronizar la biblioteca después
    // de añadir un género no sabría cuál es cuál y volvería a pagarlo todo.
    clave: String(t.clave || ''),
    recurso: String(t.recurso || ''),
    // QUÉ VERSIÓN es esta: `v3` del perito, `v1` de la carretera de noche. Es lo
    // que se anota en el registro de reparto para no repetirla en los dos
    // episodios siguientes; sin ella, la rotación no sabría qué se usó.
    variante: String(t.variante || ''),
    genero: String(t.genero || ''),
    // EL ARQUETIPO que sale en esta toma. Va también aquí arriba, y no solo dentro
    // del plano, porque es por donde la herencia busca en la biblioteca: leerlo de
    // dentro del plano obligaría a que el plano existiera, y una toma sin dirigir
    // todavía no lo tiene.
    personaje: String(t.personaje || t.plano?.personaje || '').toLowerCase(),
    // QUIÉN HABLA, si esta toma es parte de un testimonio. Lo pone la
    // segmentación al ver una línea «> ». Tiene que estar en esta lista blanca o
    // muere en cada carga —la avería de `heredado` otra vez— y con él se perdería
    // el plano del que declara y su resolución contra la biblioteca.
    testimonio: String(t.testimonio || ''),
    // EL VISTO BUENO de la biblioteca: alguien miró esta imagen y dijo que vale.
    // Tiene que estar en esta lista blanca —la avería de `heredado` otra vez— o
    // cada recarga borraría la revisión de las 141 imágenes y habría que volver a
    // mirarlas una por una. Y va atado a que la imagen exista: un visto bueno sin
    // imagen detrás avalaría algo que no está, y de él cuelga pagar clips.
    aprobada: t.aprobada === true && t.imagen === 'ok',
    // La huella del plano con el que se generó. En la lista blanca por lo mismo
    // que todo lo de aquí: sin ella, cada recarga la borraría y la biblioteca
    // dejaría de saber que el catálogo cambió debajo de una imagen ya pagada.
    huella: String(t.huella || ''),
    // ── DE QUÉ IMAGEN SALIÓ EL CLIP ────────────────────────────────────────
    // `versionImagen` sube con cada imagen generada; `versionClip` guarda la que
    // había cuando se generó el clip. Iguales = el clip le corresponde. En la
    // lista blanca o mueren en cada carga —la avería de `heredado` otra vez— y
    // con ellas volvería el clip de la imagen descartada dándose por bueno.
    versionImagen: Math.max(0, Number(t.versionImagen) || 0),
    versionClip: Math.max(0, Number(t.versionClip) || 0),
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

/**
 * Los papeles de una ficha CONSTRUIDA. Una ficha documentada no tiene rol: tiene
 * fuente. Son las dos clases de material y se distinguen por `construida`.
 */
const ROLES = ['victima', 'sospechoso', 'testigo', 'objeto', 'lugar', 'fecha', 'pistafalsa', 'revelacion'];

function sanearFicha(bruto) {
  const f = { ...(bruto || {}) };
  return {
    id: f.id || `f${Math.random().toString(36).slice(2, 9)}`,
    afirmacion: String(f.afirmacion || ''),
    // ESTOS TRES TIENEN QUE ESTAR EN LA LISTA, y es la misma lección que costó
    // `heredado`: esto no hace spread, devuelve una lista blanca, y todo lo que no
    // esté aquí se borra en CADA carga del proyecto. Sin `construida` una ficha
    // inventada volvería a leerse como documentada —con fuente vacía— y el guion
    // le pediría al modelo que atribuyera a una fuente que no existe. Sin `orden`
    // se perdería el orden en que se levantó el caso, que es el orden en que se
    // cuenta. Sin `rol`, el papel de cada pieza del expediente.
    construida: f.construida === true,
    rol: ROLES.includes(f.rol) ? f.rol : '',
    orden: Number.isInteger(f.orden) ? f.orden : null,
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
    ultimaSubida = Date.now();
    proyectoASubir = null;
    return proyecto;
  }
  // Y la copia de la nube se mantiene SOLA. Antes solo se subía al darle a un
  // botón, así que el teléfono era el único que tenía el proyecto — y Safari
  // borra su almacén local cuando le parece. Las fichas, la dirección y el guion
  // desaparecían «guardados».
  programarSubida(proyecto);
  return proyecto;
}

// ── La copia de la nube, que se mantiene sola ─────────────────────────────────
//
// Sin aspavientos: como mucho una subida cada veinte segundos, en silencio, y si
// falla no pasa nada — la local ya está, y el siguiente guardado lo vuelve a
// intentar. Las fases guardan constantemente, así que la nube va siempre a menos
// de un minuto del teléfono.

const ENTRE_SUBIDAS = 20000;
let subidaPendiente = null;
let proyectoASubir = null;
let ultimaSubida = 0;

function programarSubida(proyecto) {
  proyectoASubir = proyecto;
  if (subidaPendiente) return;
  const espera = Math.max(500, ENTRE_SUBIDAS - (Date.now() - ultimaSubida));
  subidaPendiente = setTimeout(async () => {
    subidaPendiente = null;
    const p = proyectoASubir;
    if (!p) return;
    try {
      await llamar('proyecto.guardar', { id: p.id, proyecto: p });
      ultimaSubida = Date.now();
      proyectoASubir = null;
    } catch {
      // La local ya está. El próximo guardado vuelve a programar esta.
    }
  }, espera);
  // En Node (las pruebas), un temporizador vivo retendría el proceso entero.
  subidaPendiente.unref?.();
}

/** Cancela la subida pendiente. Lo usan las pruebas al recoger sus globales. */
export function cancelarSubida() {
  if (subidaPendiente) clearTimeout(subidaPendiente);
  subidaPendiente = null;
  proyectoASubir = null;
}

export const listarLocales = () => local.listarProyectos();

export async function listarRemotos() {
  const r = await llamar('proyecto.listar');
  return r.proyectos || [];
}

// ── Consultas sobre el modelo ─────────────────────────────────────────────────

/**
 * La pieza abierta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS CUIDADOS, Y LOS DOS SE PAGARON.
 *
 * 1. SOLO EPISODIOS. Esto caía a `proyecto.piezas[0]`, y desde que la biblioteca
 *    es una pieza más, `piezas[0]` puede SER LA BIBLIOTECA. Con el proyecto sin
 *    episodios, la pantalla habría abierto la biblioteca como si fuera un
 *    episodio y cualquier fase habría escrito dentro de ella.
 *
 * 2. SIN NINGUNO, UNA PIEZA VACÍA SUELTA. Desde que se puede borrar el último
 *    episodio, «no hay ninguno» es un estado normal, y la pantalla lee
 *    `pieza().tomas` en veinte sitios antes de pintar nada. Devolver una pieza
 *    vacía —que NO está en el proyecto, así que nada de lo que se escriba en ella
 *    se guarda— deja que todo se pinte a cero en vez de reventar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function piezaDe(proyecto, idPiezaBuscada) {
  const episodios = episodiosDe(proyecto);
  return episodios.find((z) => z.id === idPiezaBuscada) || episodios[0] || piezaVacia('', 'Sin episodio');
}

/** ¿Hay algún episodio abierto? Lo que separa pintar a cero de poder generar. */
export const hayEpisodio = (proyecto) => episodiosDe(proyecto).length > 0;

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
