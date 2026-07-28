// El director de orquesta (§2 del plano).
//
// El navegador tiene el proyecto entero en memoria y en la base local, decide qué
// generar y en qué orden, lleva la cola, la barra de progreso, el botón de detener y
// los reintentos. NUNCA ve una credencial.
//
// §1: el usuario no lee registros de la nube desde el teléfono. Cualquier fallo se
// explica AQUÍ, en pantalla, con palabras.
//
// El flujo son cinco pasos y se ven los cinco a la vez, en orden, con su estado:
//   1 investigar y ELEGIR UN CASO → 2 guion → 3 generar → 4 montar → 5 exportar
// Los pasos que todavía no tocan salen apagados, para que no haya que adivinar cuál
// es el siguiente.

import { llamar, ponerClave, ponerModeloTexto, ponerModelos } from './api.js';
import * as estado from './estado.js';
import { Cola } from './cola.js';
import { etiquetaDe, CATALOGO, PREDETERMINADO } from '../comun/modelos.mjs';
import { segmentarVerificado } from '../comun/segmentar.mjs';
import { TEMAS, EPOCAS, EPOCA_POR_DEFECTO, temaPorId, epocaPorId } from '../comun/temas.mjs';
import { ESTILOS, estiloPorId } from '../comun/estilos.mjs';
import * as investigacion from './fases/investigacion.js';
import * as guionFase from './fases/guion.js';
import * as direccion from './fases/direccion.js';
import * as director from './fases/director.js';
import * as narracion from './fases/narracion.js';
import * as imagenFase from './fases/imagen.js';
import * as movimiento from './fases/movimiento.js';
import * as musica from './fases/musica.js';
import * as miniatura from './fases/miniatura.js';
import * as metadatos from './fases/metadatos.js';
import * as montajeFase from './fases/montaje.js';
import * as previa from './previa.js';
import * as local from './local.js';
import { claveToma } from '../comun/claves.mjs';

const $ = (id) => document.getElementById(id);

const escapar = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Una sola definición de la navegación: la barra lateral y la de abajo salen de
// aquí. Con dos listas, una acaba teniendo una pestaña que la otra no.
const ICONO = {
  inicio: '<path d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z"/>',
  investigacion: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  guion: '<path d="M4 4h11l5 5v11H4z"/><path d="M8 13h8M8 17h5"/>',
  tomas: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>',
  previa: '<path d="M2 6a2 2 0 012-2h11a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2z"/><path d="M17 9l5-3v12l-5-3"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2"/>',
};
// Nombre largo para la barra lateral, corto para la de abajo.
//
// Con seis pestañas en 390 px, «Investigación» no cabe: las etiquetas se pisaban
// unas con otras y se leía «INICIOINVESTIGACIÓNGUION». La anchura es una invariante,
// no un detalle de estilo (§7.13), así que el nombre corto es parte de la definición
// de la vista y no un apaño de CSS.
const VISTAS = [
  ['inicio', 'Inicio', 'Inicio'],
  ['investigacion', 'Investigación', 'Fichas'],
  ['guion', 'Guion', 'Guion'],
  ['tomas', 'Tomas', 'Tomas'],
  ['previa', 'Previa', 'Previa'],
  ['ajustes', 'Ajustes', 'Ajustes'],
];

let P = null;
let casos = [];
const cola = new Cola({ alProgresar: pintarProgreso, alAviso: (m) => avisar('paso4', m) });
// Una cola aparte para la investigación: su progreso va en el paso 2 y puede
// solaparse con una generación en marcha sin pisarle la barra.
const colaInvestiga = new Cola({
  alProgresar: ({ hechas, total, estado: e }) => {
    $('barra2').style.width = total ? `${Math.round((hechas / total) * 100)}%` : '0';
    $('progreso2').textContent =
      e === 'termina' ? '' : `Buscando… ${hechas} de ${total} ángulos`;
  },
});

// ── Pantalla ──────────────────────────────────────────────────────────────────

function avisar(donde, mensaje, clase = '') {
  const caja = $(`aviso-${donde}`);
  if (!caja) return;
  caja.innerHTML = mensaje
    ? `<div class="aviso ${clase}">${escapar(mensaje)}</div>`
    : '';
}

function registro(donde, lineas) {
  const caja = $(`aviso-${donde}`);
  if (!caja || !lineas?.length) return;
  const d = document.createElement('div');
  d.className = 'registro';
  d.textContent = lineas.join('\n');
  caja.appendChild(d);
}

function pintarProgreso({ fase, hechas, total, estado: e, fallos }) {
  $('barra').style.width = total ? `${Math.round((hechas / total) * 100)}%` : '0';
  const cierre = e === 'detenida' ? ' · detenido' : e === 'termina' ? ' · listo' : '';
  $('progreso').textContent = `${fase}: ${hechas} de ${total}${fallos ? ` · ${fallos} con fallo` : ''}${cierre}`;
  $('b-detener').disabled = e === 'termina' || e === 'detenida';
}

function accion(boton, hacer, donde = 'paso4') {
  const b = $(boton);
  b?.addEventListener('click', async () => {
    b.disabled = true;
    avisar(donde, '');
    try {
      await hacer();
    } catch (e) {
      avisar(donde, e?.message || String(e), 'malo');
    } finally {
      b.disabled = false;
    }
  });
}

const guardar = () => estado.guardar(P);
const pieza = () => estado.piezaDe(P, P.piezaActiva);

/**
 * Las fichas, el caso y el tema son DE LA PIEZA, no del proyecto.
 *
 * Estaban en el proyecto, y por eso elegir un caso nuevo dejaba las fichas del
 * anterior en su sitio: la investigación siguiente se fusionaba con ellas y el
 * director leía dos casos a la vez.
 */
const fichas = () => pieza().fichas;

// ── Acceso ────────────────────────────────────────────────────────────────────

/**
 * El diagnóstico, eslabón por eslabón (§1).
 *
 * Vive en UNA función y la usan los dos sitios que lo enseñan: la pantalla de
 * entrada y el botón de Ajustes. Escribir esto dos veces es cómo el propio
 * diagnóstico acabó comprobando algo distinto de lo que hace la herramienta.
 */
async function comprobarConexion(donde) {
  const caja = $(donde);
  caja.innerHTML = '<div class="aviso">Comprobando…</div>';

  const salud = await llamar('salud');
  const cfg = salud.configuracion;
  if (!cfg.lista) {
    caja.innerHTML =
      '<div class="aviso malo"><b>Falta configurar esto:</b>' +
      cfg.faltan
        .map((f) => `<span class="comoarreglar"><b>${escapar(f.variable)}</b> — ${escapar(f.es)}</span>`)
        .join('') +
      '</div>';
    throw new Error('La herramienta no está configurada del todo todavía.');
  }

  const prueba = salud.prueba || [];
  caja.innerHTML = prueba
    .map(
      (p) =>
        `<div class="aviso ${p.ok ? 'bueno' : 'malo'}">${p.ok ? '✓' : '✗'} <b>${escapar(p.paso)}</b> — ` +
        `${escapar(p.dice)}` +
        (p.arregla ? `<span class="comoarreglar">${escapar(p.arregla)}</span>` : '') +
        `</div>`,
    )
    .join('');
  return prueba;
}

accion('b-comprobar', () => comprobarConexion('salud-ajustes'));

accion(
  'b-entrar',
  async () => {
    const c = $('clave').value.trim();
    if (!c) throw new Error('Escribe la contraseña.');
    ponerClave(c);

    const prueba = await comprobarConexion('salud');

    // El montador solo hace falta para montar: no impide entrar ni generar.
    if (prueba.filter((p) => !p.ok && p.paso !== 'montador').length) {
      throw new Error('Hay algo que todavía no funciona. Mira arriba: dice cuál y qué hacer.');
    }

    await llamar('proyecto.listar');
    sessionStorage.setItem('clave', c);
    $('acceso').classList.add('oculto');
    $('app').classList.remove('oculto');
    await arrancar();
  },
  'proyecto',
);

// ── Arranque y navegación ─────────────────────────────────────────────────────

async function arrancar() {
  pintarNavegacion();
  const locales = await estado.listarLocales();
  P = locales.length
    ? await estado.cargarLocal(locales.sort((a, b) => b.modificado - a.modificado)[0].id)
    : estado.nuevoProyecto();
  ponerModeloTexto(P.config.texto.modelo);
  ponerModelos({ imagen: P.config.imagenModelo.modelo, video: P.config.videoModelo.modelo });
  await guardar();
  pintarTodo();
  cargarVoces();
  cargarModelos();
}

/**
 * Pinta los tres desplegables de generadores desde el catálogo.
 *
 * El catálogo es una tabla fija (`comun/modelos.mjs`), así que esto no descubre
 * nada: enseña lo que hay, en el orden en que está escrito, y respeta lo que el
 * usuario eligió. Lo que él elige es lo que se usa; la aplicación no lo corrige
 * ni lo sube sola por su cuenta.
 */
const FAMILIAS_DE_MODELO = [
  ['texto', 'm-texto', 'texto'],
  ['imagen', 'm-imagen', 'imagenModelo'],
  ['video', 'm-video', 'videoModelo'],
];

/**
 * Llena los desplegables desde la tabla que el navegador YA TIENE DENTRO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Ahora salen todas las opciones de los generadores vacías y no puedo
 *  seleccionar ninguno.»
 *
 * Esto se llenaba pidiéndole al servidor `modelos.catalogo`. Y el catálogo es una
 * TABLA FIJA escrita en `comun/modelos.mjs`, que este mismo archivo importa: se
 * estaba yendo por la red a buscar algo que ya estaba aquí. Con eso, cualquier
 * tropiezo —la red del móvil, un despliegue a medias, una respuesta que no llega—
 * dejaba los tres desplegables vacíos y sin poder elegir nada. Un punto único de
 * fallo a cambio de nada.
 *
 * Ahora se pintan de la tabla local, sin red y sin poder fallar. Al servidor se le
 * sigue preguntando, pero solo por una cosa que él sí sabe y el navegador no: cuál
 * es el predeterminado de SU entorno. Y si no contesta, no pasa nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function pintarModelos(enUso = null) {
  let cambio = false;

  for (const [familia, selector, guardado] of FAMILIAS_DE_MODELO) {
    const filas = (CATALOGO[familia] || []).map((f) => ({ id: f.clave, etiqueta: f.etiqueta }));
    if (!filas.length) continue;

    const cfg = P.config[guardado] || (P.config[guardado] = { modelo: '' });
    // Sin elección guardada se coge la que el catálogo trae por defecto. Con
    // elección guardada NO SE TOCA: es lo que se pidió —que la aplicación
    // obligue el generador elegido— y además evita el §7.2 al revés, que la
    // pantalla te cambie el modelo por debajo cada vez que abres los ajustes.
    if (!cfg.modelo || !filas.some((f) => f.id === cfg.modelo)) {
      cfg.modelo = enUso?.[familia] || PREDETERMINADO[familia] || filas[0].id;
      cambio = true;
    }

    const s = $(selector);
    if (!s) continue;
    s.innerHTML = '';
    for (const f of filas) {
      const o = document.createElement('option');
      o.value = f.id;
      o.textContent = f.etiqueta;
      if (f.id === cfg.modelo) o.selected = true;
      s.appendChild(o);
    }
  }

  $('modelo-en-uso').textContent = etiquetaDe('texto', P.config.texto.modelo);
  ponerModeloTexto(P.config.texto.modelo);
  ponerModelos({ imagen: P.config.imagenModelo.modelo, video: P.config.videoModelo.modelo });
  P.config.imagen.modelo = P.config.imagenModelo.modelo || P.config.imagen.modelo;
  P.config.movimiento.modelo = P.config.videoModelo.modelo || P.config.movimiento.modelo;
  if (cambio) await guardar();
}

/**
 * Pinta los desplegables de generadores.
 *
 * Primero con lo que hay aquí —eso no puede fallar— y luego, si el servidor
 * contesta, se afina con el predeterminado de su entorno. El orden importa: si se
 * esperara a la respuesta para pintar, un fallo de red te dejaría sin poder elegir
 * generador, que es justo lo que pasaba.
 */
async function cargarModelos() {
  await pintarModelos();
  try {
    const r = await llamar('modelos.catalogo');
    await pintarModelos(r.enUso);
  } catch {
    // El servidor no contestó. Los desplegables ya están llenos y se puede
    // trabajar: no hay nada que decir aquí.
  }
}

function pintarNavegacion() {
  const lat = $('lateral');
  const mov = $('nav-movil');
  lat.innerHTML = '';
  mov.innerHTML = '';

  for (const [id, nombre, corto] of VISTAS) {
    const svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONO[id]}</svg>`;
    for (const [caja, contenido] of [
      [lat, `${svg}<span>${nombre}</span>`],
      [mov, `${svg}<span>${corto}</span>`],
    ]) {
      const b = document.createElement('button');
      b.innerHTML = contenido;
      b.dataset.vista = id;
      b.onclick = () => ir(id);
      caja.appendChild(b);
    }
  }
  ir('inicio');
}

function ir(id) {
  document.querySelectorAll('.vista').forEach((v) => v.classList.add('oculto'));
  $(`v-${id}`)?.classList.remove('oculto');
  document.querySelectorAll('[data-vista]').forEach((b) => b.classList.toggle('on', b.dataset.vista === id));
  window.scrollTo(0, 0);
}

/**
 * El selector de temas.
 *
 * Sin acotar el tema, «busca casos reales» sale a internet sin rumbo. Y sin acotar
 * la época devuelve lo más publicado, que es lo más viejo: por eso salían casos del
 * XIX una y otra vez.
 */
function pintarFiltros() {
  const st = $('tema');
  if (!st.options.length) {
    st.innerHTML = '<option value="">Cualquier tema del canal</option>';
    for (const g of TEMAS) {
      const og = document.createElement('optgroup');
      og.label = `${g.icono} ${g.grupo}`;
      for (const x of g.temas) {
        const o = document.createElement('option');
        o.value = x.id;
        o.textContent = x.nombre;
        og.appendChild(o);
      }
      st.appendChild(og);
    }
    const se = $('epoca');
    se.innerHTML = '';
    for (const e of EPOCAS) {
      const o = document.createElement('option');
      o.value = e.id;
      o.textContent = e.nombre;
      se.appendChild(o);
    }
  }
  st.value = P.temaId || '';
  $('epoca').value = P.epocaId || EPOCA_POR_DEFECTO;
}

function pintarTodo() {
  pintarFiltros();
  $('titulo').value = P.titulo;
  $('guion').value = pieza().guion;
  $('nombre-proyecto').textContent = pieza().caso?.titulo || P.titulo;
  $('cabecera-movil').textContent = `${pieza().tomas.length} tomas`;
  pintarCasoElegido();
  pintarFichas();
  pintarReparto();
  pintarTratamiento();
  pintarTomas();
  pintarAjustes();
  pintarPasos();
  pintarPestanas();
  pintarHistorial();
  pintarContinuacion();
  cargarMuestrario();
  // La previa preparada es de la pieza que estaba abierta: al cambiar de caso ya no
  // vale, y dejarla puesta enseñaría el documental anterior como si fuera este.
  if (preparada && preparada.hoja?.pieza !== pieza().id) {
    preparada = null;
    pintarPorTipo();
    pintarTiras();
  }
}

/**
 * El estado de los cinco pasos.
 *
 * Un paso apagado no es decoración: es la respuesta a «¿y ahora qué?». Sin esto hay
 * que acordarse de en qué orden va todo, y el orden es justamente lo que la
 * herramienta debería saber por ti.
 */
function pintarPasos() {
  const t = pieza().tomas;
  const hay = {
    caso: !!pieza().caso,
    guion: !!pieza().guion.trim() && t.length > 0,
    generado: t.length > 0 && t.every((x) => x.audio === 'ok') && t.every((x) => x.reusa !== null || x.imagen === 'ok'),
    montado: !!pieza().montaje,
  };

  hay.fichas = pieza().fichas.length > 0;
  hay.tratamiento = !!pieza().tratamiento;

  const marcar = (n, hecho, listo) => {
    const el = $(`paso${n}`);
    if (!el) return;
    el.classList.toggle('hecho', hecho);
    el.classList.toggle('espera', !listo && !hecho);
  };
  marcar(1, hay.caso, true);
  marcar(2, hay.fichas, hay.caso);
  marcar(3, hay.guion, hay.fichas);
  marcar(4, hay.generado, hay.guion);
  marcar(5, hay.montado, hay.generado);
  marcar(6, false, hay.montado);

  // Un botón apagado sin explicación es una pared. Cada uno dice QUÉ FALTA para
  // poder pulsarlo, en el propio paso, con palabras (§1).
  const bloquear = (boton, falta) => {
    const b = $(boton);
    if (!b) return;
    b.disabled = !!falta;
    b.title = falta || '';
  };

  bloquear('b-investigar-fondo', hay.caso ? '' : 'Elige un caso en el paso 1.');
  bloquear('b-dirigir-pieza', hay.fichas ? '' : 'Falta investigar el caso (paso 2).');
  bloquear('b-generar-guion', hay.tratamiento ? '' : 'Falta dirigir la pieza: el guion sale del tratamiento.');
  for (const b of ['b-narrar', 'b-imagenes', 'b-movimiento', 'b-musica']) {
    bloquear(b, hay.guion ? '' : 'Falta el guion partido en tomas (paso 3).');
  }
  bloquear('b-montar', hay.generado ? '' : 'Faltan narración o imágenes por generar.');
  bloquear('b-revisar', hay.guion ? '' : 'Falta el guion.');
  bloquear('b-producir', hay.caso ? '' : 'Elige un caso primero.');
}

// ── Paso 1: buscar casos y elegir uno ─────────────────────────────────────────

async function buscar() {
  P.temaId = $('tema').value;
  P.epocaId = $('epoca').value;
  const tema = temaPorId(P.temaId);
  const epoca = epocaPorId(P.epocaId);

  $('zona-casos').innerHTML =
    `<p class="nota" style="margin-top:14px">Buscando en internet` +
    `${tema ? ` · ${escapar(tema.nombre)}` : ''} · ${escapar(epoca.nombre.toLowerCase())}…</p>`;

  const r = await investigacion.buscarCasos({
    tema,
    epoca,
    // No repetir lo ya descartado: buscar dos veces y que salgan los mismos cinco es
    // la forma más rápida de que la herramienta parezca rota.
    evitar: P.casosVistos,
  });
  casos = r.casos;
  P.casosVistos = [...new Set([...P.casosVistos, ...casos.map((c) => c.titulo)])].slice(-60);
  await guardar();
  pintarCasos();

  if (!casos.length) {
    throw new Error(
      `No salió ningún caso de ${epoca.nombre.toLowerCase()} para ese tema. ` +
        `Prueba con una época más amplia o con otro tema.`,
    );
  }
  // Si se cayeron casos por fecha, se dice: si no, parece que la búsqueda vino floja.
  if (r.descartados) {
    avisar(
      'paso1',
      `Se descartaron ${r.descartados} casos anteriores a ${r.desde}. Quedan ${casos.length}. ` +
        `Dale a «Otros cinco» si quieres más.`,
    );
  }
}

accion('b-buscar-casos', buscar, 'paso1');
accion('b-otros-casos', buscar, 'paso1');

function pintarCasos() {
  // Sin resultados hay que LIMPIAR: si no, se queda colgado el «Buscando en
  // internet…» de antes y parece que sigue trabajando mientras el error dice otra
  // cosa. Lo vio la prueba con la época filtrando todo.
  if (!casos.length) {
    $('zona-casos').innerHTML = '';
    return;
  }
  $('zona-casos').innerHTML =
    `<p class="nota chica" style="margin-top:15px;display:flex;align-items:center;gap:8px">` +
    `<b style="color:var(--violeta-2)">${casos.length} casos encontrados</b>` +
    `<span style="margin-left:auto">Elige uno para continuar</span></p>` +
    `<div class="casos">` +
    casos
      .map(
        (c, i) =>
          `<button class="caso${pieza().caso?.titulo === c.titulo ? ' elegido' : ''}" data-caso="${i}">` +
          `<div class="cq"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:13px;height:13px"><path d="M20 6L9 17l-5-5"/></svg></div>` +
          `<div class="lam">${escapar(c.imagenSugerida.slice(0, 110))}</div>` +
          `<div class="cb"><b>${escapar(c.titulo)}</b><p>${escapar(c.gancho)}</p>` +
          `<div class="meta">${c.cuando ? `<span>${escapar(c.cuando)}</span>` : ''}` +
          `${c.donde ? `<span>· ${escapar(c.donde)}</span>` : ''}` +
          `${c.documentado ? '' : '<span class="pastilla p-aviso">poco documentado</span>'}</div></div></button>`,
      )
      .join('') +
    `</div>`;

  document.querySelectorAll('[data-caso]').forEach((b) => {
    b.onclick = async () => {
      const c = casos[Number(b.dataset.caso)];
      const z = pieza();

      // Elegir un caso ABRE UNA PIEZA NUEVA, salvo que la de ahora esté sin
      // estrenar. Antes se escribía encima: quedaban las fichas del caso anterior
      // y la investigación siguiente se fusionaba con ellas, así que el director
      // acababa leyendo dos casos a la vez. La pieza anterior se queda en el
      // historial, entera, por si se quiere volver.
      const virgen = !z.caso && !z.fichas.length && !z.guion;
      if (virgen) {
        z.caso = c;
        z.tema = `${c.titulo}. ${c.sinopsis}`;
        z.titulo = c.titulo;
        if (!z.creado) z.creado = Date.now();
      } else {
        estado.abrirPieza(P, { caso: c });
      }
      P.titulo = c.titulo;
      await guardar();
      pintarCasos();
      pintarTodo();
      avisar(
        'paso2',
        virgen
          ? `Caso elegido: ${c.titulo}. Ya puedes investigarlo.`
          : `Caso nuevo: ${c.titulo}. El anterior queda guardado en el historial.`,
        'bueno',
      );
    };
  });
}

function pintarCasoElegido() {
  const c = pieza().caso;
  $('caso-elegido').innerHTML = c
    ? `<div class="ficha"><div class="cab">${escapar(c.cuando)} · ${escapar(c.donde)}` +
      `${c.documentado ? '<span class="pastilla p-ok">documentado</span>' : '<span class="pastilla p-aviso">poco documentado</span>'}</div>` +
      `<p><b>${escapar(c.titulo)}</b></p><p style="margin-top:6px;color:var(--tinta-2)">${escapar(c.sinopsis)}</p>` +
      (c.fuentes?.length
        ? `<div class="cita">Fuentes consultadas: ${c.fuentes.slice(0, 4).map((f) => escapar(f.titulo || f.enlace)).join(' · ')}</div>`
        : '') +
      `</div>`
    : '<p class="nota">Todavía no has elegido un caso. Ve a Inicio y busca casos.</p>';
  $('cuenta-fichas').textContent = pieza().fichas.length ? `${pieza().fichas.length} fichas` : '';
}

// ── Paso 2: fichas y guion ────────────────────────────────────────────────────

async function buscarFichas(mas) {
  if (!pieza().caso) throw new Error('Elige un caso primero, en Inicio.');
  const nuevas = await investigacion.investigar({
    tema: pieza().tema,
    cuantas: 12,
    yaTengo: mas ? pieza().fichas : [],
  });
  pieza().fichas = mas ? [...pieza().fichas, ...nuevas] : nuevas;
  await guardar();
  pintarFichas();
  pintarReparto();
  pintarCasoElegido();
}

accion('b-fichas', () => buscarFichas(false), 'investigacion');
accion('b-mas-fichas', () => buscarFichas(true), 'investigacion');

function pintarFichas() {
  $('fichas').innerHTML = pieza().fichas.length
    ? pieza().fichas
        .map(
          (f) =>
            `<div class="ficha"><div class="cab">` +
            `<span class="pastilla ${f.incierto ? 'p-aviso' : 'p-ok'}">${f.incierto ? 'disputado' : escapar(f.fiabilidad)}</span>` +
            `<span class="pastilla p-tipo">${escapar(f.tipoFuente)}</span>` +
            `<span>${escapar(f.fuente)}${f.fecha ? ' · ' + escapar(f.fecha) : ''}</span></div>` +
            `<p>${escapar(f.afirmacion)}</p>` +
            (f.cita ? `<div class="cita">«${escapar(f.cita)}»</div>` : '') +
            `</div>`,
        )
        .join('')
    : '<p class="nota">Todavía no hay fichas. Sin ellas el guion sería opinión, no documental.</p>';
}

/**
 * La investigación a fondo del caso elegido.
 *
 * Seis ángulos, cada uno una búsqueda distinta. Una sola pregunta trae una sola
 * versión —la del primer resultado— y con eso sale un resumen de Wikipedia con voz
 * grave, no un documental.
 */
accion(
  'b-investigar-fondo',
  async () => {
    if (!pieza().caso) throw new Error('Elige un caso primero, en el paso 1.');

    const r = await colaInvestiga.ejecutar(
      'investigación',
      investigacion.ANGULOS_DE_INVESTIGACION,
      (angulo, _i, senal) => investigacion.investigarAngulo({ caso: pieza().caso, angulo, senal }),
      {
        // Cada ángulo se guarda al terminar: se puede detener a mitad y lo buscado
        // no se pierde ni se vuelve a pagar (§4).
        alTerminarUno: async (fichas) => {
          pieza().fichas = investigacion.fusionarFichas([pieza().fichas, fichas]);
          await guardar();
          pintarFichas();
          pintarReparto();
        },
      },
    );

    pintarCasoElegido();
    pintarPasos();
    if (r.fallos.length) {
      avisar('paso2', `${pieza().fichas.length} fichas. ${r.fallos.length} ángulos fallaron; vuelve a darle.`, 'malo');
      return registro('paso2', r.fallos.map((f) => `· ${f.error}`));
    }
    avisar('paso2', `${pieza().fichas.length} fichas de ${r.total} ángulos. Ya puedes generar el guion.`, 'bueno');
  },
  'paso2',
);

/** De qué tipo son las fuentes que sostienen el documental. */
function pintarReparto() {
  const r = investigacion.reparto(pieza().fichas);
  const NOMBRE = {
    oficial: 'oficiales', judicial: 'judiciales', policial: 'policiales',
    prensa: 'prensa', academica: 'académicas', testimonio: 'testimonios', otra: 'otras',
  };
  const SOLIDA = ['oficial', 'judicial', 'policial', 'academica'];
  const caja = $('reparto-fuentes');
  if (!caja) return;
  caja.innerHTML = Object.keys(r).length
    ? '<div class="reparto">' +
      Object.entries(r)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([k, n]) =>
            `<span class="pastilla ${SOLIDA.includes(k) ? 'p-ok' : ''}">${n} ${escapar(NOMBRE[k] || k)}</span>`,
        )
        .join('') +
      '</div>'
    : '';
}

/**
 * El director decide la pieza. Una sola llamada, y de ella beben el guion, la
 * dirección de arte, la música y la miniatura.
 */
accion(
  'b-dirigir-pieza',
  async () => {
    const yaContado = loYaContado();
    if (yaContado.length) {
      avisar('paso3', `Dirigiendo la continuación. El director lee las ${yaContado.length} partes anteriores…`);
    }
    const tr = await director.dirigirPieza({
      caso: pieza().caso,
      fichas: pieza().fichas,
      minutos: Number($('minutos').value) || 10,
      anteriores: yaContado,
    });
    // En una continuación, el ASPECTO lo pone la primera parte, no el director:
    // dos partes de la misma serie que no se parecen no son una serie.
    const heredado = pieza().tratamiento?.soloIdentidad ? pieza().tratamiento : null;
    pieza().tratamiento = heredado
      ? { ...tr, identidadVisual: heredado.identidadVisual, musica: heredado.musica, soloIdentidad: false }
      : tr;

    // El ritmo que pide el director entra en la configuración: es él quien sabe si
    // esta pieza va lenta o va nerviosa. El tope de gasto sigue siendo del usuario.
    P.config.segmentacion.segundosObjetivo = tr.ritmo.segundosPorToma;
    P.config.movimiento.proporcion = tr.ritmo.proporcionMovimiento;
    P = estado.sanear(P);

    await guardar();
    pintarTratamiento();
    pintarAjustes();
    pintarPasos();
    avisar('paso3', `Dirigido: ${tr.estructura.length} actos. Ya puedes generar el guion.`, 'bueno');
  },
  'paso3',
);

function pintarTratamiento() {
  const tr = pieza().tratamiento;
  const caja = $('tratamiento');
  if (!caja) return;
  caja.innerHTML = tr
    ? `<div class="ficha" style="margin-top:13px">` +
      `<p><b>${escapar(tr.premisa)}</b></p>` +
      `<p style="margin-top:6px;color:var(--tinta-2)">${escapar(tr.hilo)}</p>` +
      `<div class="cita">Abre: ${escapar(tr.aperturaEnFrio)}</div>` +
      `<div class="reparto">` +
      tr.estructura.map((a) => `<span class="pastilla">${a.acto}. ${escapar(a.titulo)}</span>`).join('') +
      `</div>` +
      (tr.identidadVisual
        ? `<p class="nota chica" style="margin-top:9px">${escapar(tr.identidadVisual.paleta)} · ${escapar(tr.identidadVisual.luz)}</p>`
        : '') +
      (tr.cuidado?.length
        ? `<div class="aviso" style="margin-top:10px"><b>Cuidado en este caso:</b>` +
          tr.cuidado.map((c) => `<span class="comoarreglar">· ${escapar(c)}</span>`).join('') +
          `</div>`
        : '') +
      `</div>`
    : '';
}

/** El guion, ya con el tratamiento del director dentro. */
accion(
  'b-generar-guion',
  async () => {
    if (!pieza().caso) throw new Error('Elige un caso primero.');
    if (!pieza().fichas.length) {
      throw new Error(
        'Todavía no hay fichas. Dale a «Investigar a fondo» primero: el guion se ' +
          'escribe a partir de ellas, y sin fichas sería opinión, no documental.',
      );
    }
    if (!pieza().tratamiento) throw new Error('Dirige la pieza primero: el guion sale del tratamiento.');
    // Una continuación nace con el ASPECTO del padre y sin su historia. Escribir
    // ahora sería escribir la primera parte otra vez, que es justo lo que no se
    // quiere de una continuación.
    if (pieza().tratamiento.soloIdentidad) {
      throw new Error(
        'Esta continuación hereda la paleta, la música y las cautelas del caso, pero ' +
          'todavía no tiene hilo propio. Dale a «Dirigir»: el director leerá lo ya ' +
          'contado y buscará lo que quedó fuera.',
      );
    }
    avisar('paso3', `${pieza().fichas.length} fichas. Escribiendo el guion…`);
    const minutos = Number($('minutos').value) || 10;

    // CADA ACTO PAGADO SE GUARDA AL LLEGAR, y si el intento anterior se cayó a
    // mitad, sus actos se recogen en vez de reescribirse — solo si la estructura
    // no cambió desde entonces: reanudar sobre actos de otra estructura pegaría
    // dos documentales distintos.
    const huella = guionFase.huellaDeActos(pieza().tratamiento, minutos);
    const parcial = pieza().actosEscritos;
    const texto = await guionFase.escribirGuion({
      tema: pieza().tema,
      fichas: pieza().fichas,
      minutos,
      tratamiento: pieza().tratamiento,
      anteriores: loYaContado(),
      yaEscritos: parcial?.huella === huella && Array.isArray(parcial.partes) ? parcial.partes : [],
      alActo: async (parte, n) => {
        const p = pieza();
        if (p.actosEscritos?.huella !== huella) p.actosEscritos = { huella, partes: [] };
        p.actosEscritos.partes[n] = parte;
        await guardar();
      },
      alAvanzar: (n, total) => avisar('paso3', `Escribiendo el acto ${n} de ${total}…`),
    });
    // El guion completo manda; el parcial ya hizo su trabajo.
    pieza().actosEscritos = null;
    pieza().guion = texto;
    $('guion').value = texto;

    const r = segmentarVerificado(texto, P.config.segmentacion);
    pieza().tomas = r.tomas;
    pieza().escenas = r.escenas;
    await guardar();
    pintarTodo();
    // La conclusión va DONDE FUE EL PROGRESO.
    //
    // Iba a la caja del paso 2 mientras el progreso escribía en la del 3, así que
    // arriba ponía «terminado» y abajo seguía poniendo «escribiendo el acto 4 de
    // 4…» para siempre. Un aviso que no se limpia solo es un aviso que miente.
    avisar(
      'paso3',
      `Guion listo: ${guionFase.contarPalabras(texto)} palabras (~${Math.round(guionFase.contarPalabras(texto) / 145)} min), ` +
        `${r.tomas.length} tomas y ${r.escenas.length} escenas. ` +
        `Léelo en Guion antes de generar: es el insumo del que sale todo.`,
      'bueno',
    );
  },
  'paso3',
);

accion(
  'b-escribir',
  async () => {
    const minutos = Number($('minutos').value) || 10;
    // El mismo cuaderno de actos que en el paso 3: un intento caído a mitad se
    // reanuda desde el acto que faltaba, se escriba desde donde se escriba.
    const huella = guionFase.huellaDeActos(pieza().tratamiento, minutos);
    const parcial = pieza().actosEscritos;
    const texto = await guionFase.escribirGuion({
      tema: pieza().tema,
      fichas: pieza().fichas,
      minutos,
      tratamiento: pieza().tratamiento,
      anteriores: loYaContado(),
      yaEscritos: parcial?.huella === huella && Array.isArray(parcial.partes) ? parcial.partes : [],
      alActo: async (parte, n) => {
        const p = pieza();
        if (p.actosEscritos?.huella !== huella) p.actosEscritos = { huella, partes: [] };
        p.actosEscritos.partes[n] = parte;
        await guardar();
      },
      alAvanzar: (n, total) => avisar('guion', `Escribiendo el acto ${n} de ${total}…`),
    });
    pieza().actosEscritos = null;
    pieza().guion = texto;
    $('guion').value = texto;
    await guardar();
    // Con números: «escrito» a secas fue justo lo que dijo la pantalla cuando el
    // guion venía con una escena y una toma.
    avisar(
      'guion',
      `Guion escrito: ${guionFase.contarPalabras(texto)} palabras, ` +
        `~${Math.round(guionFase.contarPalabras(texto) / 145)} min. Léelo antes de seguir.`,
      'bueno',
    );
  },
  'guion',
);

accion(
  'b-segmentar',
  async () => {
    pieza().guion = $('guion').value;
    if (!pieza().guion.trim()) throw new Error('No hay guion que partir.');

    // §4.3: segmentar SIN comprobar la cobertura es como no haber comprobado nunca.
    const r = segmentarVerificado(pieza().guion, P.config.segmentacion);

    // Se conserva lo ya generado de las tomas cuyo texto no cambió: repartir otra
    // vez el guion no debería obligar a pagar la narración otra vez.
    const antes = new Map(pieza().tomas.map((t) => [t.texto, t]));
    pieza().tomas = r.tomas.map((t) => {
      const viejo = antes.get(t.texto);
      return viejo ? { ...t, ...viejo, i: t.i, escena: t.escena } : t;
    });
    pieza().escenas = r.escenas;
    await guardar();
    pintarTodo();
    avisar(
      'guion',
      `${r.tomas.length} tomas en ${r.escenas.length} escenas. Cobertura exacta: ` +
        `${r.cobertura.caracteres} caracteres, sin perder ni duplicar nada.`,
      'bueno',
    );
  },
  'guion',
);

accion(
  'b-guardar',
  async () => {
    pieza().guion = $('guion').value;
    P.titulo = $('titulo').value.trim() || P.titulo;
    await guardar();
    avisar('guion', 'Guardado en este teléfono.', 'bueno');
  },
  'guion',
);

accion(
  'b-subir',
  async () => {
    pieza().guion = $('guion').value;
    await estado.guardar(P, { remoto: true });
    avisar('guion', 'Guardado en tu nube. Esta es la copia buena.', 'bueno');
  },
  'guion',
);

// ── Tomas y dirección ─────────────────────────────────────────────────────────

function pintarTomas() {
  const t = pieza().tomas;
  const falta = estado.loQueFalta(pieza());
  $('cuenta-tomas').textContent = t.length ? `${t.length}` : '';
  $('cabecera-movil').textContent = `${t.length} tomas`;

  // Lo que se PAGA frente a lo que se ve. Es la cifra que importa cuando el canal
  // todavía no monetiza: un documental de 63 tomas puede costar 39 imágenes si el
  // director ha repetido bien sus motivos y hay banco de otros casos.
  const repiteDentro = t.filter((x) => x.reusa !== null && x.reusa !== undefined).length;
  const delBanco = t.filter((x) => x.heredado || x.heredadoVid).length;
  const seGeneran = t.filter((x) => !x.movimiento && x.reusa == null && !x.heredado).length;
  const clipsQueSePagan = t.filter(
    (x) => x.movimiento && x.reusa == null && !x.heredadoVid,
  ).length;

  $('cifras-tomas').innerHTML = [
    ['tomas', t.length],
    ['escenas', pieza().escenas.length],
    ['minutos', (estado.duracionDe(pieza()) / 60).toFixed(1)],
    ['imágenes que se pagan', seGeneran],
    ['repiten un motivo', repiteDentro],
    ['vienen del banco', delBanco],
    ['clips que se pagan', clipsQueSePagan],
    ['tomas con clip', t.filter((x) => x.movimiento).length],
    ['falta narrar', falta.narracion],
    ['faltan imágenes', falta.imagen],
    ['llamadas de voz', narracion.resumen(t, P.config).llamadas],
  ]
    .map(([k, v]) => `<div class="cifra"><b>${v}</b><span>${k}</span></div>`)
    .join('');

  const ahorradas = repiteDentro + delBanco;
  $('ahorro-tomas').textContent = ahorradas
    ? `De ${t.length} tomas se pagan ${seGeneran} imágenes y ${clipsQueSePagan} clips: ` +
      `${repiteDentro} tomas repiten un motivo del propio documental y ${delBanco} salen ` +
      `del banco de otros casos. ${Math.round((ahorradas / t.length) * 100)}% del material ` +
      `no se vuelve a pagar.`
    : t.length
      ? `Ninguna toma reutiliza nada todavía: se pagarían ${seGeneran} imágenes para ${t.length} tomas.`
      : '';

  $('lista-tomas').innerHTML = t.length
    ? t
        .slice(0, 80)
        .map(
          (x) =>
            `<div class="toma"><div class="cab"><span class="n">#${x.i} · esc ${x.escena} · ${(x.segundos || 0).toFixed(1)}s${x.medida ? '' : ' est.'}</span>` +
            `<span class="pastilla ${x.audio === 'ok' ? 'p-ok' : 'p-falta'}">voz</span>` +
            `<span class="pastilla ${x.reusa !== null || x.imagen === 'ok' ? 'p-ok' : 'p-falta'}">${x.reusa !== null ? `reusa #${x.reusa}` : 'imagen'}</span>` +
            (x.movimiento ? `<span class="pastilla ${x.video === 'ok' ? 'p-ok' : 'p-falta'}">clip</span>` : '') +
            `<span class="pastilla p-tipo">${escapar(x.tipoImagen)}</span>` +
            (x.corteForzado ? '<span class="pastilla p-aviso">corte forzado</span>' : '') +
            `</div><p>${escapar(x.texto)}</p></div>`,
        )
        .join('')
    : '<p class="nota">Todavía no hay tomas. Genera el guion primero.</p>';
}

accion(
  'b-dirigir',
  async () => {
    if (!pieza().tomas.length) throw new Error('Parte el guion en tomas primero.');
    const tomas = await direccion.dirigir({
      tomas: pieza().tomas,
      escenas: pieza().escenas,
      tema: pieza().tema,
      config: P.config,
      tratamiento: pieza().tratamiento,
      // Son varias llamadas y algunas tardan: sin esto parece que se ha colgado.
      alAvanzar: (hechas, total) =>
        avisar('tomas', `Dirigiendo… ${hechas} de ${total} tomas.`),
      // Cada lote pagado se guarda al llegar: un fallo en el sexto ya no tira los
      // cinco anteriores, y volver a dirigir pide solo lo que falta.
      alLote: async (parciales) => {
        pieza().tomas = parciales;
        await guardar();
      },
    });
    pieza().tomas = tomas;
    await guardar();
    pintarTomas();
    const sin = direccion.sinDirigir(tomas);
    avisar(
      'tomas',
      sin.length
        ? `${sin.length} de ${tomas.length} tomas se quedaron sin plano (${sin.slice(0, 8).join(', ')}…). Vuelve a dirigir: solo se rehacen esas.`
        : `Dirigidas ${tomas.length} tomas. ${tomas.filter((x) => x.movimiento).length} llevan clip. ` +
          (tomas.filter((x) => x.desfasada).length
            ? `${tomas.filter((x) => x.desfasada).length} cambiaron de plano, así que su imagen anterior ya no vale y hay que rehacerla.`
            : 'Ninguna imagen anterior queda desfasada.'),
      sin.length ? 'malo' : 'bueno',
    );
  },
  'tomas',
);

// ── Paso 3: las fases que gastan ──────────────────────────────────────────────

$('b-detener').addEventListener('click', () => {
  cola.detener();
  colaInvestiga.detener();
});

/** Dirige si hace falta: sin ficha de plano no hay ni imagen ni clip. */
async function asegurarDireccion() {
  if (pieza().tomas.every((t) => t.plano)) return;
  avisar('paso4', 'Falta la dirección de arte. Se hace sola…');
  pieza().tomas = await direccion.dirigir({
    tomas: pieza().tomas,
    escenas: pieza().escenas,
    tema: pieza().tema,
    config: P.config,
    tratamiento: pieza().tratamiento,
    alAvanzar: (hechas, total) => avisar('paso4', `Dirigiendo… ${hechas} de ${total} tomas.`),
    alLote: async (parciales) => {
      pieza().tomas = parciales;
      await guardar();
    },
  });
  await guardar();
  pintarTomas();
}

const guardaToma = async (nueva) => {
  const k = pieza().tomas.findIndex((x) => x.i === nueva.i);
  if (k >= 0) pieza().tomas[k] = nueva;
  await guardar();
  pintarTomas();
  pintarPasos();
};

/**
 * El interruptor «rehacer lo que ya está hecho».
 *
 * Las cuatro fases saben desde siempre distinguir «lo que falta» de «todo»; lo
 * que faltaba era la forma de pedírselo. Sin esto, cambiar de voz o de estilo no
 * servía de nada: se pulsaba generar y contestaba «ya está toda la narración»,
 * con la voz vieja dentro y sin manera de rehacerla.
 */
const rehacerTodo = () => !!$('rehacer-todo')?.checked;

accion('b-narrar', async () => {
  const soloLasQueFaltan = !rehacerTodo();
  const bloques = narracion.planificar(pieza().tomas, P.config, { soloLasQueFaltan });
  if (!bloques.length) return avisar('paso4', 'Ya está toda la narración.', 'bueno');
  if (!soloLasQueFaltan && !confirm(`Se rehacen las ${bloques.length} llamadas de voz, incluidas las que ya estaban. ¿Sigo?`)) return;

  // §4.5: el progreso se cuenta en LLAMADAS, no en tomas.
  const r = await cola.ejecutar(
    'narración',
    bloques,
    (bloque, _i, senal, alEsperar) =>
      narracion.narrarBloque({ bloque, pieza: P.id, config: P.config, senal, alEsperar }),
    {
      alTerminarUno: async (tomasNuevas) => {
        for (const t of tomasNuevas) await guardaToma(t);
      },
    },
  );
  informar(r, 'narración');
});

accion('b-imagenes', async () => {
  await asegurarDireccion();
  const soloLasQueFaltan = !rehacerTodo();
  const pendientes = imagenFase.planificar(pieza().tomas, { soloLasQueFaltan });
  if (!pendientes.length) return avisar('paso4', 'Ya están todas las imágenes.', 'bueno');
  if (!soloLasQueFaltan && !confirm(`Se rehacen las ${pendientes.length} imágenes, incluidas las que ya estaban. ¿Sigo?`)) return;

  const r = await cola.ejecutar(
    'imágenes',
    pendientes,
    (toma, _i, senal, alEsperar) =>
      imagenFase.generarImagen({
        toma,
        tomas: pieza().tomas,
        pieza: P.id,
        config: P.config,
        tratamiento: pieza().tratamiento,
        senal,
        alEsperar,
      }),
    { alTerminarUno: guardaToma },
  );
  informar(r, 'imágenes');
});

accion('b-movimiento', async () => {
  await asegurarDireccion();
  const pendientes = movimiento.planificar(pieza().tomas, { soloLasQueFaltan: !rehacerTodo() });
  if (!pendientes.length) return avisar('paso4', 'No falta ningún clip.', 'bueno');
  if (!confirm(`Son ${pendientes.length} clips y es la fase más cara con diferencia. ¿Sigo?`)) return;

  const r = await cola.ejecutar(
    'movimiento',
    pendientes,
    (toma, _i, senal, alEsperar) =>
      movimiento.generarClip({
        toma,
        tomas: pieza().tomas,
        pieza: P.id,
        config: P.config,
        // El clip parte de la imagen, y si falta se genera aquí: hace falta el
        // tratamiento para que salga con la misma paleta que las demás.
        tratamiento: pieza().tratamiento,
        senal,
        alEsperar,
        aviso: (m) => ($('progreso').textContent = m),
      }),
    { alTerminarUno: guardaToma },
  );
  informar(r, 'movimiento');
});

accion('b-musica', async () => {
  const soloLasQueFaltan = !rehacerTodo();
  const pendientes = musica.planificar(pieza().escenas, pieza().tomas, P.config, { soloLasQueFaltan });
  if (!pendientes.length) return avisar('paso4', 'La música ya está, o está apagada.', 'bueno');
  if (!soloLasQueFaltan && !confirm(`Se rehacen las ${pendientes.length} piezas de música. ¿Sigo?`)) return;

  const r = await cola.ejecutar(
    'música',
    pendientes,
    (escena, _i, senal, alEsperar) =>
      musica.generarMusicaDeEscena({
        escena, tomas: pieza().tomas, pieza: P.id,
        tratamiento: pieza().tratamiento, senal, alEsperar,
      }),
    {
      alTerminarUno: async (res) => {
        const e = pieza().escenas.find((x) => x.n === res.n);
        if (e) e.musica = 'ok';
        await guardar();
      },
    },
  );
  informar(r, 'música');
});

/**
 * Le pregunta al almacén qué hay generado de verdad, y lo apunta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «No sé qué está generado y qué no.»
 *
 * Y no había manera de saberlo. El proyecto anotaba «imagen: ok» cuando la llamada
 * VOLVÍA, así que todo lo que se generó y se subió pero cuya respuesta se perdió
 * —un corte de red, la plataforma cortando por tiempo— quedaba pagado, guardado en
 * la nube, y marcado como si no existiera. Al volver a darle se pagaba otra vez.
 *
 * Con esto la verdad la dice el almacén, que es donde está el material, y no la
 * memoria de una llamada que a lo mejor no llegó. Cuesta una consulta y no genera
 * nada.
 *
 * Va en los dos sentidos, y el segundo importa igual: lo que el proyecto da por
 * hecho y NO está arriba se desmarca. Si no, quedaría una toma que dice tener
 * imagen y cuya imagen no existe, y eso para el montaje a mitad.
 * ─────────────────────────────────────────────────────────────────────────────
 */
accion('b-inventario', async () => {
  avisar('paso4', 'Preguntando al almacén qué hay generado…');
  const r = await llamar('listar', { prefijo: `${P.id}/` });
  const hay = new Map((r.materiales || []).filter((m) => m.bytes > 0).map((m) => [m.clave, m]));

  const cambios = { puestas: [], quitadas: [] };
  const mirar = (etiqueta, tiene, poner) => {
    const esta = hay.has(etiqueta.clave);
    if (esta && !tiene) {
      poner('ok');
      cambios.puestas.push(etiqueta.dice);
    } else if (!esta && tiene) {
      poner(null);
      cambios.quitadas.push(etiqueta.dice);
    }
  };

  for (const t of pieza().tomas) {
    // Lo heredado y lo que repite otra toma no tiene archivo propio: preguntar por
    // él daría «no está» y lo desmarcaría, que es justo al revés de la verdad.
    const propia = t.reusa === null || t.reusa === undefined;
    mirar({ clave: claveToma(P.id, t.i, 'audio'), dice: `voz ${t.i + 1}` }, t.audio === 'ok', (v) => (t.audio = v));
    if (propia && !t.heredado) {
      mirar({ clave: claveToma(P.id, t.i, 'img'), dice: `imagen ${t.i + 1}` }, t.imagen === 'ok', (v) => (t.imagen = v));
    }
    if (propia && t.movimiento && !t.heredadoVid) {
      mirar({ clave: claveToma(P.id, t.i, 'vid'), dice: `clip ${t.i + 1}` }, t.video === 'ok', (v) => (t.video = v));
    }
  }
  for (const e of pieza().escenas) {
    const clave = `${P.id}/mus/${String(e.n).padStart(3, '0')}`;
    mirar({ clave, dice: `música ${e.n}` }, e.musica === 'ok', (v) => (e.musica = v));
  }

  await guardar();
  pintarTodo();

  const partes = [];
  if (cambios.puestas.length) {
    partes.push(`${cambios.puestas.length} estaban generadas y no constaban (${cambios.puestas.slice(0, 6).join(', ')}${cambios.puestas.length > 6 ? '…' : ''})`);
  }
  if (cambios.quitadas.length) {
    partes.push(`${cambios.quitadas.length} constaban y no están (${cambios.quitadas.slice(0, 6).join(', ')}${cambios.quitadas.length > 6 ? '…' : ''})`);
  }
  avisar(
    'paso4',
    partes.length
      ? `${hay.size} materiales en el almacén. ${partes.join('. ')}.`
      : `${hay.size} materiales en el almacén, y el proyecto ya decía exactamente eso.`,
    partes.length ? 'bueno' : '',
  );
});

function informar(r, que) {
  pintarPasos();
  if (r.detenida) {
    return avisar('paso4', `${que}: detenido en ${r.hechas} de ${r.total}. Lo hecho está guardado.`);
  }
  if (r.fallos.length) {
    avisar('paso4', `${que}: ${r.fallos.length} de ${r.total} fallaron. Vuelve a darle: solo repite lo que falta.`, 'malo');
    return registro('paso4', r.fallos.map((f) => `· ${f.error}`));
  }
  avisar('paso4', `${que}: ${r.hechas} de ${r.total}, sin fallos.`, 'bueno');
}

// ── Vista previa ──────────────────────────────────────────────────────────────
//
// Reconstruye lo que va a salir del montaje: recorrido de cámara, marca, lecho de
// música y el agachado de la música cuando entra la voz. Sale de la MISMA hoja que
// usa ffmpeg, no de una línea de tiempo propia.

let preparada = null;
let reproductor = null;

function asegurarReproductor() {
  if (reproductor) return reproductor;
  reproductor = previa.reproductor({
    lienzo: $('previa-imagen'),
    marca: $('previa-marca'),
    alCambiar: (t, k, total, segundo) => {
      $('previa-vacio').style.display = 'none';
      $('previa-pie').textContent =
        `${reloj(segundo)} / ${reloj(preparada?.hoja.total || 0)} · toma ${t.i + 1} de ${total}` +
        ` · escena ${t.escena}${t.movimiento ? ' · clip' : ` · cámara ${t.camara}`}` +
        (t.falta.length ? ` · FALTA ${t.falta.join(' y ')}` : '') +
        `\n${t.texto}`;
      document.querySelectorAll('.tira').forEach((e, n) => e.classList.toggle('activa', n === k));
      document.querySelectorAll('.tira')[k]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    alTerminar: () => avisar('previa', 'Fin de la pieza.', 'bueno'),
  });
  return reproductor;
}

const reloj = (s) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

accion(
  'b-preparar-previa',
  async () => {
    if (!pieza().tomas.length) throw new Error('Todavía no hay tomas.');
    preparada = await previa.preparar({
      pieza: pieza(),
      config: P.config,
      alAvanzar: (n, de) => avisar('previa', `Bajando material… ${n} de ${de} tomas`),
    });

    asegurarReproductor().cargar(preparada);
    pintarTiras();
    pintarPorTipo();

    const faltan = preparada.tomas.filter((t) => t.falta.length);
    const sinMusica = preparada.hoja.escenas.filter((e) => e.musica && !preparada.musica[e.n]);
    avisar(
      'previa',
      [
        `${preparada.tomas.length} tomas · ${reloj(preparada.hoja.total)}`,
        faltan.length
          ? `A ${faltan.length} les falta algo: ${faltan.slice(0, 6).map((t) => `#${t.i + 1} (${t.falta.join('+')})`).join(', ')}`
          : 'Todas completas',
        sinMusica.length ? `${sinMusica.length} escenas sin música` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      faltan.length ? 'malo' : 'bueno',
    );
  },
  'previa',
);

accion(
  'b-reproducir',
  async () => {
    if (!preparada) throw new Error('Prepara la previa primero.');
    // El navegador solo deja sonar tras un toque: esto ES el toque.
    await asegurarReproductor().reproducir(desdeSegundo);
  },
  'previa',
);

let desdeSegundo = 0;
$('b-parar-previa').addEventListener('click', () => {
  reproductor?.parar();
  desdeSegundo = 0;
});

// ── Las pestañas de la previa ─────────────────────────────────────────────────
//
// Antes solo estaba el montaje entero, y para saber si una música servía había que
// verse el documental completo. Cada material se oye y se ve por separado, y se
// regenera desde donde se está mirando.

const HOJAS_PREVIA = [
  ['montado', 'Montado'],
  ['voz', 'Voz'],
  ['imagenes', 'Imágenes'],
  ['musica', 'Música'],
  ['clips', 'Clips'],
];

function pintarPestanas() {
  const nav = $('pestanas-previa');
  if (nav.children.length) return;
  for (const [id, nombre] of HOJAS_PREVIA) {
    const b = document.createElement('button');
    b.textContent = nombre;
    b.dataset.hojaBoton = id;
    b.onclick = () => abrirHoja(id);
    nav.appendChild(b);
  }
  abrirHoja('montado');
}

function abrirHoja(id) {
  document.querySelectorAll('.hoja-previa').forEach((e) => e.classList.toggle('oculto', e.dataset.hoja !== id));
  document.querySelectorAll('[data-hoja-boton]').forEach((b) => b.classList.toggle('on', b.dataset.hojaBoton === id));
  // Al salir del montaje se para: dos audios sonando a la vez no dejan juzgar
  // ninguno de los dos.
  if (id !== 'montado') reproductor?.parar();
}

/** Una fila con reproductor y botón de rehacer. */
function filaAudio({ titulo, texto, blob, alRehacer, etiqueta = 'Rehacer' }) {
  const d = document.createElement('div');
  d.className = 'fila-mat';
  d.innerHTML =
    `<div class="txt"><b>${escapar(titulo)}</b>${escapar(texto || '')}</div>` +
    `<div class="acc"></div>`;
  const acc = d.querySelector('.acc');

  if (blob) {
    const a = document.createElement('audio');
    a.controls = true;
    a.preload = 'none';
    a.src = URL.createObjectURL(blob);
    d.querySelector('.txt').appendChild(a);
  } else {
    d.querySelector('.txt').insertAdjacentHTML('beforeend', '<span class="pastilla p-falta">falta</span>');
  }

  const b = document.createElement('button');
  b.className = 'btn chico fantasma';
  b.textContent = etiqueta;
  b.onclick = async () => {
    b.disabled = true;
    b.textContent = '…';
    try {
      await alRehacer();
    } catch (e) {
      avisar('previa', e.message, 'malo');
    }
    b.disabled = false;
    b.textContent = etiqueta;
  };
  acc.appendChild(b);
  return d;
}

function pintarPorTipo() {
  const tomas = preparada?.tomas || [];

  // ── Voz, toma a toma ──
  $('cuenta-voz').textContent = tomas.length ? `${tomas.filter((t) => t.voz).length}/${tomas.length}` : '';
  const cajaVoz = $('lista-voz');
  cajaVoz.innerHTML = '';
  if (!tomas.length) cajaVoz.innerHTML = '<p class="nota">Prepara la previa primero.</p>';
  for (const t of tomas) {
    cajaVoz.appendChild(
      filaAudio({
        titulo: `Toma ${t.i + 1} · ${t.duracion.toFixed(1)}s`,
        texto: t.texto,
        blob: t.voz,
        alRehacer: () => rehacerVoz(t.i),
      }),
    );
  }

  // ── Imágenes ──
  const conImagen = tomas.filter((t) => !t.movimiento);
  $('cuenta-imagenes').textContent = conImagen.length ? `${conImagen.filter((t) => t.visual).length}/${conImagen.length}` : '';
  const g = $('galeria');
  g.innerHTML = conImagen.length ? '' : '<p class="nota">Prepara la previa primero.</p>';
  for (const t of conImagen) {
    const d = document.createElement('div');
    d.className = 'pieza-mat';
    d.innerHTML =
      (t.visual ? `<img src="${URL.createObjectURL(t.visual)}" alt="">` : '<div class="sin">sin imagen</div>') +
      `<div class="cuerpo"><p>#${t.i + 1} · ${escapar((t.texto || '').slice(0, 70))}…</p></div>`;
    const b = document.createElement('button');
    b.className = 'btn chico fantasma';
    b.textContent = 'Rehacer';
    b.onclick = async () => {
      b.disabled = true;
      b.textContent = '…';
      try {
        await rehacerImagen(t.i);
      } catch (e) {
        avisar('previa', e.message, 'malo');
      }
      b.disabled = false;
      b.textContent = 'Rehacer';
    };
    d.querySelector('.cuerpo').appendChild(b);

    // Cualquier imagen se puede animar, la marcara el director o no. Mirando la
    // imagen es cuando se ve si merece moverse; decidirlo antes, a ciegas, era
    // decidirlo por una descripción.
    if (t.visual) {
      const c = document.createElement('button');
      c.className = 'btn chico fantasma';
      c.textContent = 'Convertir en clip';
      c.onclick = async () => {
        c.disabled = true;
        c.textContent = '…';
        try {
          await convertirEnClip(t.i, (m) => (c.textContent = m));
        } catch (e) {
          avisar('previa', e.message, 'malo');
        }
        c.disabled = false;
        c.textContent = 'Convertir en clip';
      };
      d.querySelector('.cuerpo').appendChild(c);
    }
    g.appendChild(d);
  }

  // ── Música, escena a escena ──
  const escenas = preparada?.hoja.escenas || [];
  $('cuenta-musica').textContent = escenas.length ? `${Object.values(preparada.musica).filter(Boolean).length}/${escenas.length}` : '';
  const cajaMus = $('lista-musica');
  cajaMus.innerHTML = escenas.length ? '' : '<p class="nota">Prepara la previa primero.</p>';
  for (const e of escenas) {
    cajaMus.appendChild(
      filaAudio({
        titulo: `Escena ${e.n} · ${reloj(e.duracion)}`,
        texto: pieza().escenas.find((x) => x.n === e.n)?.titulo || '',
        blob: preparada.musica[e.n],
        alRehacer: () => rehacerMusica(e.n),
      }),
    );
  }

  // ── Clips ──
  const clips = tomas.filter((t) => t.movimiento);
  $('cuenta-clips').textContent = clips.length ? `${clips.filter((t) => t.visual).length}/${clips.length}` : '';
  const cajaClips = $('lista-clips');
  cajaClips.innerHTML = clips.length ? '' : '<p class="nota">Ninguna toma lleva clip de video.</p>';
  for (const t of clips) {
    const d = document.createElement('div');
    d.className = 'pieza-mat';
    d.innerHTML =
      (t.visual
        ? `<video src="${URL.createObjectURL(t.visual)}" controls playsinline preload="metadata"></video>`
        : '<div class="sin">sin clip</div>') +
      `<div class="cuerpo"><p>#${t.i + 1} · ${t.duracion.toFixed(1)}s</p></div>`;
    cajaClips.appendChild(d);
  }
}

// ── Rehacer una sola pieza, desde donde se está mirando ───────────────────────

async function refrescar(clave) {
  await local.borrarMaterial(clave);
}

async function rehacerVoz(i) {
  const bloques = narracion.planificar(pieza().tomas, P.config, { soloLasQueFaltan: false });
  const bloque = bloques.find((b) => b.tomas.some((t) => t.i === i));
  if (!bloque) throw new Error('No encuentro el bloque de esa toma.');

  avisar('previa', `Rehaciendo la voz del bloque de la toma ${i + 1}…`);
  const nuevas = await narracion.narrarBloque({ bloque, pieza: P.id, config: P.config });
  for (const t of nuevas) {
    const k = pieza().tomas.findIndex((x) => x.i === t.i);
    if (k >= 0) pieza().tomas[k] = t;
    await refrescar(`${P.id}/t${String(t.i).padStart(3, '0')}/audio`);
  }
  await guardar();
  avisar('previa', `Voz rehecha. Vuelve a preparar para oírla.`, 'bueno');
}

async function rehacerImagen(i) {
  const toma = pieza().tomas.find((t) => t.i === i);
  avisar('previa', `Rehaciendo la imagen de la toma ${i + 1}…`);
  const nueva = await imagenFase.generarImagen({
    toma,
    tomas: pieza().tomas,
    pieza: P.id,
    config: P.config,
    tratamiento: pieza().tratamiento,
  });
  const k = pieza().tomas.findIndex((t) => t.i === i);
  pieza().tomas[k] = nueva;
  await refrescar(`${P.id}/t${String(i).padStart(3, '0')}/img`);
  await guardar();
  avisar('previa', 'Imagen rehecha. Vuelve a preparar para verla.', 'bueno');
}

/**
 * Convierte en clip la imagen de una toma, la haya marcado el director o no.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El director decide el cupo de movimiento por presupuesto y a ciegas: reparte
 * clips por la pieza leyendo descripciones. Pero cuál merece moverse se ve
 * MIRANDO LA IMAGEN, y eso solo pasa aquí, en la previa, con la imagen delante.
 *
 * Así que se puede animar cualquiera. No gasta imagen —ya está pagada, el clip
 * parte de ella— y la imagen NO se pierde: sigue en el banco, junto al clip, y
 * las dos quedan disponibles para las demás producciones.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function convertirEnClip(i, decir = () => {}) {
  const k = pieza().tomas.findIndex((t) => t.i === i);
  if (k < 0) throw new Error('No encuentro esa toma.');

  const segundos = movimiento.duracionMasCercana(
    pieza().tomas[k].segundos || 6,
    P.config.videoModelo?.modelo,
  );
  if (!confirm(`Se va a generar un clip de ${segundos} s a partir de esta imagen.\n\nEs la fase más cara. ¿Sigo?`)) {
    return;
  }

  // Se marca ANTES de generar y se guarda: si el clip tarda diez minutos y se
  // cierra la pestaña, al volver la toma ya sabe que lleva movimiento y solo falta
  // el clip. Marcarla después habría perdido la decisión.
  pieza().tomas[k].movimiento = true;
  await guardar();

  avisar('previa', `Generando el clip de la toma ${i + 1}…`);
  const nueva = await movimiento.generarClip({
    toma: pieza().tomas[k],
    tomas: pieza().tomas,
    pieza: P.id,
    config: P.config,
    tratamiento: pieza().tratamiento,
    aviso: (m) => decir(m.length > 24 ? `${m.slice(0, 22)}…` : m),
  });
  pieza().tomas[k] = nueva;
  await refrescar(claveToma(P.id, i, 'vid'));
  await guardar();
  avisar('previa', `Clip listo. Vuelve a preparar para verlo montado.`, 'bueno');
}

async function rehacerMusica(n) {
  const escena = { n, segundos: preparada.hoja.escenas.find((e) => e.n === n)?.duracion || 30 };
  avisar('previa', `Rehaciendo la música de la escena ${n}…`);
  await musica.generarMusicaDeEscena({
    escena,
    tomas: pieza().tomas,
    pieza: P.id,
    tratamiento: pieza().tratamiento,
  });
  await refrescar(`${P.id}/mus/${String(n).padStart(3, '0')}`);
  avisar('previa', 'Música rehecha. Vuelve a preparar para oírla.', 'bueno');
}

/**
 * El historial de casos.
 *
 * Cada caso es una pieza y todas se quedan. Elegir un caso nuevo ya no pisa el
 * anterior: se puede volver a él, mirarlo, o pedirle una continuación.
 */
/**
 * Lo que ya se contó de este caso, para no repetirlo.
 *
 * Sale de la ascendencia de la pieza: las partes anteriores, de la más reciente a
 * la más antigua, con su guion ENTERO. No un resumen —lo que importa es qué
 * frases están dichas, y eso un resumen lo pierde—. Solo las que tienen guion:
 * una pieza sin escribir no ha contado nada.
 */
function loYaContado() {
  return estado
    .ascendencia(P, pieza())
    .filter((z) => (z.guion || '').trim())
    .map((z) => ({
      titulo: z.titulo,
      guion: z.guion,
      premisa: z.tratamiento?.premisa || '',
      hilo: z.tratamiento?.hilo || '',
    }));
}

/**
 * Los dos botones de continuación aparecen CUANDO SIRVEN, no antes.
 *
 * Estaban los dos sueltos en Ajustes, siempre visibles. Así se podía pedir
 * «reutilizar imágenes» de un guion de continuación que todavía no existía, que no
 * es que fallara: es que no significaba nada. Cada uno tiene un momento:
 *
 *   · continuar  → cuando ESTE caso ya tiene guion. Se continúa lo escrito.
 *   · reutilizar → cuando la continuación ya tiene sus tomas dirigidas, porque lo
 *                  que se compara son los planos, y sin dirigir no hay planos.
 */
function pintarContinuacion() {
  const z = pieza();
  const hayGuion = !!(z.guion || '').trim();
  const padres = estado.ascendencia(P, z);

  $('panel-continuar').classList.toggle('oculto', !hayGuion);
  if (hayGuion) {
    $('nota-continuar').textContent =
      `Otro video del mismo caso. Hereda las ${z.fichas.length} fichas, la paleta y la música ` +
      `de «${z.titulo}», y el director buscará lo que quedó fuera de este guion.`;
  }

  // Dirigidas y sin imagen: es lo único que se puede reutilizar. Y sirve
  // cualquier otro caso del proyecto, no solo el que esta pieza continúa: el banco
  // de planos genéricos —una comisaría, patrullas, un pasillo de juzgado— no es de
  // ningún caso en particular.
  const otras = P.piezas.filter((x) => x.id !== z.id && (x.tomas || []).some((t) => t.imagen === 'ok'));
  const candidatas = z.tomas.filter(
    (t) =>
      t.plano &&
      (t.movimiento ? !t.heredadoVid && t.video !== 'ok' : !t.heredado && t.imagen !== 'ok'),
  ).length;
  const puede = otras.length > 0 && candidatas > 0;
  $('b-reutilizar').classList.toggle('oculto', !puede);
  if (puede) {
    $('b-reutilizar').textContent =
      padres.length
        ? `Reutilizar imágenes de «${padres[0].titulo}» y de los demás casos`
        : `Buscar imágenes reutilizables en los otros ${otras.length === 1 ? 'casos' : `${otras.length} casos`}`;
  }
}

function pintarHistorial() {
  const caja = $('historial');
  if (!caja) return;
  const piezas = [...P.piezas].sort((a, b) => (b.creado || 0) - (a.creado || 0));
  $('cuenta-historial').textContent = piezas.length > 1 ? `${piezas.length}` : '';

  caja.className = 'hist';
  caja.innerHTML = '';
  for (const z of piezas) {
    const padres = estado.ascendencia(P, z);
    const palabras = (z.guion || '').trim() ? guionFase.contarPalabras(z.guion) : 0;
    const partes = [
      z.fichas.length ? `${z.fichas.length} fichas` : 'sin investigar',
      palabras ? `${palabras} palabras` : 'sin guion',
      z.tomas.length ? `${z.tomas.length} tomas` : '',
      z.tomas.filter((t) => t.imagen === 'ok').length ? `${z.tomas.filter((t) => t.imagen === 'ok').length} imágenes` : '',
    ].filter(Boolean);

    const b = document.createElement('button');
    if (z.id === P.piezaActiva) b.className = 'on';
    b.innerHTML =
      `<b>${escapar(z.titulo || z.caso?.titulo || 'Sin título')}</b>` +
      `<span>${padres.length ? `continuación de «${escapar(padres[0].titulo)}» · ` : ''}${partes.join(' · ')}</span>`;
    b.onclick = async () => {
      P.piezaActiva = z.id;
      P.titulo = z.titulo || P.titulo;
      await guardar();
      pintarTodo();
      avisar('historial', `Abierto: ${z.titulo}.`, 'bueno');
    };
    caja.appendChild(b);
  }
}

/**
 * Una continuación: otro video del MISMO caso.
 *
 * Hereda el caso, las fichas y el tratamiento del padre. Lo primero porque volver
 * a investigar lo mismo es pagar dos veces por lo que ya se sabe; lo último para
 * que la segunda parte se vea y suene como la primera.
 *
 * Y el material del padre queda a mano para reutilizarlo: la imagen de un lugar
 * que ya salió no se paga otra vez (§3).
 */
accion(
  'b-continuacion',
  async () => {
    const padre = pieza();
    if (!padre.caso) throw new Error('Este caso todavía no tiene nada. Elige un caso primero.');
    if (!padre.guion.trim()) {
      throw new Error('Escribe el guion de este caso antes de pedirle una continuación.');
    }
    const z = estado.abrirPieza(P, { vieneDe: padre.id });
    await guardar();
    pintarTodo();
    avisar(
      'continuar',
      `Abierta la continuación de «${padre.titulo}»: hereda sus ${z.fichas.length} fichas, ` +
        `su paleta, su música y las cautelas del caso. Dale a «Dirigir» en el paso 3: ` +
        `el director leerá lo ya contado y buscará lo que quedó fuera.`,
      'bueno',
    );
  },
  'continuar',
);

/**
 * Marca las tomas cuyo plano ya existe en una pieza anterior.
 *
 * No genera nada ni gasta: solo apunta a lo que ya está en el almacén. Se hace a
 * mano y con el número delante porque es una decisión —dos planos «parecidos» no
 * siempre valen— y porque enseñar cuántas imágenes te ahorras es lo que hace que
 * merezca la pena mirarlo.
 */
accion(
  'b-reutilizar',
  async () => {
    const z = pieza();
    if (!z.tomas.length) throw new Error('Este caso todavía no tiene tomas dirigidas.');
    // TODAS las piezas del proyecto, no solo las de este caso.
    //
    // Hay planos que no son de nadie —una comisaría, patrullas frente a una casa,
    // un pasillo de juzgado— y sirven para el caso de la semana que viene igual
    // que para el de hoy. Limitar esto a la ascendencia dejaba fuera justo el
    // banco que hace viable un canal que todavía no monetiza.
    const otras = P.piezas.filter((x) => x.id !== z.id);
    if (!otras.length) {
      throw new Error('Todavía no hay otros casos de los que reutilizar nada.');
    }

    const puede = imagenFase.heredables(z.tomas, otras);
    if (!puede.length) {
      return avisar(
        'tomas',
        `Ningún plano de este guion coincide con los ${otras.length === 1 ? 'del otro caso' : `de los otros ${otras.length} casos`}.`,
        'bueno',
      );
    }
    for (const { i, de, tipo } of puede) {
      const t = z.tomas.find((x) => x.i === i);
      if (!t) continue;
      // `de.clave` es la del archivo DE VERDAD: si el donante a su vez heredaba,
      // apunta al original y no a un archivo que nunca se generó.
      if (tipo === 'vid') {
        t.heredadoVid = de.clave;
        t.video = 'ok';
      } else {
        t.heredado = de.clave;
        t.imagen = 'ok';
      }
    }
    await guardar();
    pintarTodo();
    avisar(
      'tomas',
      `${puede.length} tomas reutilizan material ya generado: ` +
        `${puede.filter((x) => x.tipo === 'vid').length} clips y ` +
        `${puede.filter((x) => x.tipo !== 'vid').length} imágenes ` +
        `(${[...new Set(puede.map((x) => x.de.titulo))].join(', ')}). Esas ya no se pagan.`,
      'bueno',
    );
  },
  'tomas',
);

function pintarTiras() {
  const tomas = preparada?.tomas || [];
  $('cuenta-previa').textContent = tomas.length ? `${tomas.length}` : '';
  const caja = $('tiras');
  caja.innerHTML = '';
  tomas.forEach((t, k) => {
    const b = document.createElement('button');
    b.className = 'tira';
    b.innerHTML =
      (t.visual && !t.movimiento
        ? `<img src="${URL.createObjectURL(t.visual)}" alt="">`
        : t.visual
          ? `<div class="sin" style="color:var(--violeta-2)">clip</div>`
          : `<div class="sin">sin imagen</div>`) +
      `<div class="pie">#${t.i + 1}` +
      (t.voz ? '' : ' <span class="pastilla p-falta">sin voz</span>') +
      `</div>`;
    // Tocar una tira deja la reproducción lista DESDE ahí: revisar es saltar a lo
    // que sospechas, no verlo entero otra vez.
    b.onclick = () => {
      desdeSegundo = reproductor.segundoDe(k);
      reproductor.irA(k);
    };
    caja.appendChild(b);
  });
}

// ── Producción automática ─────────────────────────────────────────────────────
//
// Encadena todo desde el caso ya elegido hasta el video montado.
//
// NO se salta ninguna regla del §4: cada fase sigue generando por separado, sigue
// cobrando solo lo que genera, sigue teniendo modo «solo las que faltan» y sigue
// escribiendo cada unidad antes de pasar a la siguiente. Detener a mitad deja el
// trabajo hecho guardado, y volver a darle retoma donde se quedó en vez de repetir
// —y volver a pagar— lo que ya está.
//
// Lo único que añade es no tener que estar delante tocando botones en orden.

const PASOS_AUTO = [
  {
    nombre: 'investigación',
    hace_falta: () => !pieza().fichas.length,
    hacer: () => $('b-investigar-fondo').click(),
  },
  { nombre: 'dirección', hace_falta: () => !pieza().tratamiento, hacer: () => $('b-dirigir-pieza').click() },
  { nombre: 'guion', hace_falta: () => !pieza().tomas.length, hacer: () => $('b-generar-guion').click() },
  { nombre: 'narración', hace_falta: () => narracion.planificar(pieza().tomas, P.config).length, hacer: () => $('b-narrar').click() },
  { nombre: 'imágenes', hace_falta: () => imagenFase.planificar(pieza().tomas).length, hacer: () => $('b-imagenes').click() },
  { nombre: 'música', hace_falta: () => musica.planificar(pieza().escenas, pieza().tomas, P.config).length, hacer: () => $('b-musica').click() },
  { nombre: 'montaje', hace_falta: () => !pieza().montaje, hacer: () => $('b-montar').click() },
];

accion(
  'b-producir',
  async () => {
    if (!pieza().caso) throw new Error('Elige un caso primero, en el paso 1.');

    // Los clips de movimiento NO entran aquí a propósito: son la fase más cara con
    // diferencia (§4.7) y arrancarlos sin preguntar es la forma de despertarse con
    // la cuota gastada. Se lanzan a mano desde el paso 4.
    const pendientes = PASOS_AUTO.filter((s) => s.hace_falta());
    if (!pendientes.length) {
      return avisar('auto', 'Ya está todo hecho. Solo queda bajarlo en el paso 6.', 'bueno');
    }
    if (!confirm(`Se van a hacer ${pendientes.length} fases: ${pendientes.map((s) => s.nombre).join(', ')}.\n\nLos clips de movimiento no entran: esos se lanzan a mano.\n\n¿Sigo?`)) return;

    for (const [i, paso] of pendientes.entries()) {
      if (cola.senal?.aborted || colaInvestiga.senal?.aborted) break;
      avisar('auto', `${i + 1} de ${pendientes.length} · ${paso.nombre}…`);

      // Se pulsa el mismo botón que pulsaría una persona: así la fase automática y
      // la manual no pueden divergir. Si un día una de las dos se arregla, la otra
      // se arregla con ella.
      paso.hacer();
      await esperarAQueTermine(paso);

      // Si la fase no dejó lo que tenía que dejar, se para y se dice cuál: seguir
      // encadenando sobre un hueco produce un fallo mucho más adelante y sin pista.
      if (paso.hace_falta() && paso.nombre !== 'montaje') {
        return avisar('auto', `Se paró en «${paso.nombre}»: no quedó terminado. Mira ese paso y vuelve a darle.`, 'malo');
      }
    }
    pintarPasos();
    avisar('auto', 'Producción terminada. Baja el video en el paso 6.', 'bueno');
  },
  'auto',
);

/** Espera a que la fase deje de trabajar. Sondea el estado, no adivina el tiempo. */
function esperarAQueTermine(paso) {
  return new Promise((res) => {
    let quieto = 0;
    const t = setInterval(() => {
      const trabajando = cola.corriendo || colaInvestiga.corriendo || $('b-montar').disabled;
      if (trabajando) {
        quieto = 0;
        return;
      }
      // Dos vueltas quieto: una sola podría caer en el hueco entre dos llamadas.
      if (++quieto >= 2) {
        clearInterval(t);
        res();
      }
    }, 700);
  });
}

// ── Paso 5: montaje ───────────────────────────────────────────────────────────

accion(
  'b-revisar',
  async () => {
    const r = await montajeFase.revisar({ pieza: pieza(), config: P.config });
    avisar(
      'paso5',
      r.completo
        ? `Todo listo: ${r.total} materiales, ${(r.duracion / 60).toFixed(1)} minutos.`
        : `Faltan ${r.faltan.length} de ${r.total} materiales.`,
      r.completo ? 'bueno' : 'malo',
    );
    if (!r.completo) registro('paso4', r.faltan);
    if (r.avisos.length) registro('paso4', r.avisos);
  },
  'paso5',
);

accion(
  'b-montar',
  async () => {
    avisar('paso4', 'Comprobando el material…');
    const ejecucion = await montajeFase.montar({
      pieza: pieza(),
      config: P.config,
      aviso: (m) => avisar('paso4', m),
    });
    pieza().montaje = ejecucion;
    await guardar();
    pintarPasos();

    const r = await montajeFase.esperarMontaje({ ejecucion, aviso: (m) => avisar('paso4', m) });
    if (r.ok) {
      avisar('paso4', `Montado en ${r.minutos} minutos. Ya puedes bajarlo en el paso 5.`, 'bueno');
      $('b-bajar').disabled = false;
      $('paso5').classList.remove('espera');
    } else {
      // §7.6: la aplicación lee el registro de la nube por su cuenta.
      avisar('paso4', r.error, 'malo');
      registro('paso4', r.registro);
    }
  },
  'paso5',
);

// ── Paso 5: exportar ──────────────────────────────────────────────────────────

accion(
  'b-metadatos',
  async () => {
    const m = await metadatos.generarMetadatos({
      tema: pieza().tema,
      guion: pieza().guion,
      tomas: pieza().tomas,
      escenas: pieza().escenas,
      fichas: pieza().fichas,
    });
    pieza().metadatos = m;
    await guardar();

    $('aviso-paso5').innerHTML =
      (m.aviso ? `<div class="aviso malo">${escapar(m.aviso)}</div>` : '') +
      `<label>Títulos</label>` +
      m.titulos.map((t) => `<div class="ficha"><p>${escapar(t)}</p></div>`).join('') +
      `<label>Descripción · ${escapar(m.duracion)}</label>` +
      `<textarea readonly style="min-height:200px">${escapar(m.descripcion)}</textarea>` +
      `<label>Etiquetas</label>` +
      `<textarea readonly style="min-height:70px">${escapar(m.etiquetas.join(', '))}</textarea>`;
  },
  'paso5',
);

accion(
  'b-bajar',
  async () => {
    avisar('paso5', 'Bajando por trozos…');
    const blob = await montajeFase.bajarFinal({
      pieza: pieza(),
      alAvanzar: (hecho, total) =>
        avisar('paso5', `Bajando… ${(hecho / 1048576).toFixed(0)} de ${(total / 1048576).toFixed(0)} MB`),
    });
    if (!blob) throw new Error('El video montado no está en el almacén todavía.');

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${P.titulo.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/gi, '').trim() || 'documental'}.mp4`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    avisar('paso5', 'Descargado.', 'bueno');
  },
  'paso5',
);

// ── Ajustes ───────────────────────────────────────────────────────────────────

/**
 * El estilo visual, con una prueba de UNA imagen antes de pagar ochenta.
 *
 * «Tengo que gastar primero para saber el estilo» era cierto y era el problema.
 */
function pintarEstilos() {
  const sel = $('estilo-imagen');
  if (!sel.options.length) {
    for (const e of ESTILOS) {
      const o = document.createElement('option');
      o.value = e.id;
      o.textContent = e.nombre;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      $('estilo-resumen').textContent = estiloPorId(sel.value).resumen;
    });
  }
  sel.value = P.config.imagen.estilo;
  $('estilo-resumen').textContent = estiloPorId(sel.value).resumen;
}

/**
 * El muestrario: una imagen por estilo, para elegir mirando.
 *
 * Es el orden en que se decide y antes estaba al revés: solo se podía probar el
 * estilo que estuviera puesto, de uno en uno, así que para comparar seis había que
 * cambiar el desplegable seis veces y fiarse de lo que uno recordara de la
 * anterior. Y el estilo se elige ANTES de generar las ochenta imágenes del
 * documental, no después.
 *
 * Cada muestra se guarda: volver aquí las enseña sin volver a pagarlas.
 */
function pintarMuestrario(muestras) {
  const caja = $('muestrario');
  caja.innerHTML = '';
  for (const m of muestras) {
    const elegido = m.estilo.id === P.config.imagen.estilo;
    const d = document.createElement('div');
    d.className = 'pieza-mat' + (elegido ? ' elegido' : '');
    d.innerHTML =
      (m.blob ? `<img src="${URL.createObjectURL(m.blob)}" alt="">` : '<div class="sin">sin imagen</div>') +
      `<div class="cuerpo"><p><b>${escapar(m.estilo.nombre)}</b>${elegido ? ' · elegido' : ''}</p></div>`;

    const b = document.createElement('button');
    b.className = 'btn chico' + (elegido ? ' primario' : ' fantasma');
    b.textContent = elegido ? 'En uso' : 'Usar este';
    b.onclick = async () => {
      P.config.imagen.estilo = m.estilo.id;
      $('estilo-imagen').value = m.estilo.id;
      $('estilo-resumen').textContent = m.estilo.resumen;
      await guardar();
      pintarMuestrario(muestras);
      avisar('estilos', `Estilo elegido: ${m.estilo.nombre}. Las imágenes del documental saldrán así.`, 'bueno');
    };
    d.querySelector('.cuerpo').appendChild(b);
    caja.appendChild(d);
  }
}

/** Enseña las muestras que ya estén guardadas, sin generar ni pagar nada. */
async function cargarMuestrario() {
  try {
    const ya = await imagenFase.muestrasGuardadas(P.id);
    if (ya.length) pintarMuestrario(ya);
  } catch {
    /* si la copia local falla, el botón sigue estando */
  }
}

accion(
  'b-muestrario',
  async () => {
    const faltan = 6 - (await imagenFase.muestrasGuardadas(P.id)).length;
    if (faltan > 0 && !confirm(`Se generan ${faltan} ${faltan === 1 ? 'imagen' : 'imágenes'}, una por estilo. ¿Sigo?`)) {
      return;
    }
    const muestras = await imagenFase.muestrarioDeEstilos({
      tomas: pieza().tomas,
      config: { ...P.config, __pieza: P.id },
      caso: pieza().caso,
      tratamiento: pieza().tratamiento,
      pieza: P.id,
      alAvanzar: (n, total) => avisar('estilos', `Generando el estilo ${n} de ${total}…`),
    });
    pintarMuestrario(muestras);
    const conToma = muestras.some((m) => m.deLaToma !== null && m.deLaToma !== undefined);
    avisar(
      'estilos',
      `${muestras.length} estilos, ${conToma ? 'con una toma de tu documental' : 'con una escena de ejemplo'}. ` +
        'Toca «Usar este» en el que te guste: las imágenes del documental saldrán así.',
      'bueno',
    );
  },
  'estilos',
);

accion(
  'b-probar-estilo',
  async () => {
    // Se guarda el estilo elegido ANTES de probar: si no, se probaría el anterior y
    // la muestra no sería de lo que se está mirando.
    P.config.imagen.estilo = $('estilo-imagen').value;
    await guardar();

    avisar('estilo', 'Generando una imagen de muestra…');
    const r = await imagenFase.probarEstilo({
      tomas: pieza().tomas,
      config: { ...P.config, __pieza: P.id },
      tratamiento: pieza().tratamiento,
    });
    if (r.blob) {
      $('muestra-estilo').src = URL.createObjectURL(r.blob);
      $('visor-estilo').classList.remove('oculto');
    }
    avisar(
      'estilo',
      r.deLaToma !== null
        ? `Muestra con la toma ${r.deLaToma + 1} de tu documental.`
        : 'Muestra con una escena de ejemplo: dirige la pieza y vuelve a probar para verla con tu material.',
      'bueno',
    );
  },
  'estilo',
);

accion(
  'b-ver-prompt',
  async () => {
    const toma = pieza().tomas.find((t) => t.plano);
    if (!toma) throw new Error('Dirige la pieza primero: sin ficha de plano no hay instrucción que enseñar.');
    const txt = imagenFase.componerInstruccion(
      toma,
      { ...P.config, imagen: { ...P.config.imagen, estilo: $('estilo-imagen').value } },
      { tratamiento: pieza().tratamiento },
    );
    registro('estilo', [txt]);
  },
  'estilo',
);

function pintarAjustes() {
  pintarEstilos();
  // Los selectores de imagen y clips los llena `cargarModelos` con lo que el
  // proyecto tiene de verdad; aquí solo se refleja lo guardado.
  P.config.imagen.modelo = P.config.imagenModelo.modelo || P.config.imagen.modelo;
  P.config.movimiento.modelo = P.config.videoModelo.modelo || P.config.movimiento.modelo;

  const pon = (id, v, txt) => {
    $(id).value = v;
    if (txt) $(txt).textContent = v;
  };
  pon('proporcion', Math.round(P.config.movimiento.proporcion * 100));
  $('v-proporcion').textContent = `${Math.round(P.config.movimiento.proporcion * 100)}%`;
  pon('objetivo', P.config.segmentacion.segundosObjetivo, 'v-objetivo');
  pon('velocidad', Math.round(P.config.narracion.velocidad * 100));
  $('v-velocidad').textContent = P.config.narracion.velocidad.toFixed(2);
  $('expresivas').checked = !!P.config.narracion.vocesExpresivas;
  $('estilo').value = P.config.narracion.estilo || '';
  $('marca-texto').value = P.config.marca.texto;
  $('vertical').value = P.config.formato.vertical ? '1' : '0';
}

$('proporcion').addEventListener('input', (e) => ($('v-proporcion').textContent = `${e.target.value}%`));
$('objetivo').addEventListener('input', (e) => ($('v-objetivo').textContent = e.target.value));
$('velocidad').addEventListener('input', (e) => ($('v-velocidad').textContent = (e.target.value / 100).toFixed(2)));
// Recargar el catálogo al momento: si hubiera que guardar ajustes primero, parecería
// que el interruptor no hace nada.
$('expresivas').addEventListener('change', async (e) => {
  P.config.narracion.vocesExpresivas = e.target.checked;
  await guardar();
  cargarVoces();
});

accion(
  'b-ajustes',
  async () => {
    for (const [selector, guardado] of [['m-imagen', 'imagenModelo'], ['m-video', 'videoModelo']]) {
      const v = $(selector).value;
      if (v && v !== P.config[guardado].modelo) P.config[guardado].aMano = true;
      if (v) P.config[guardado].modelo = v;
    }
    // Los campos viejos siguen alimentando a las fases hasta que todas lean el nuevo.
    P.config.imagen.modelo = P.config.imagenModelo.modelo || P.config.imagen.modelo;
    P.config.movimiento.modelo = P.config.videoModelo.modelo || P.config.movimiento.modelo;
    P.config.movimiento.proporcion = Number($('proporcion').value) / 100;
    P.config.segmentacion.segundosObjetivo = Number($('objetivo').value);
    P.config.narracion.velocidad = Number($('velocidad').value) / 100;
    P.config.imagen.estilo = $('estilo-imagen').value;
    P.config.marca.texto = $('marca-texto').value.trim();
    P.config.formato.vertical = $('vertical').value === '1';
    if ($('voz').value) P.config.narracion.nombreVoz = $('voz').value;
    P.config.narracion.vocesExpresivas = $('expresivas').checked;
    P.config.narracion.estilo = $('estilo').value.trim();
    // Tocar el desplegable es elegir a mano: a partir de aquí manda la persona y la
    // herramienta deja de subirlo sola.
    if ($('m-texto').value !== P.config.texto.modelo) P.config.texto.aMano = true;
    P.config.texto.modelo = $('m-texto').value;
    P.titulo = $('titulo').value.trim() || P.titulo;

    // Se vuelve a sanear para que los valores nuevos pasen por el normalizador: el
    // mismo camino que usan las tres cargas, así un valor fuera de rango se corrige
    // aquí y no dentro de una fase a medio generar.
    P = estado.sanear(P);
    ponerModeloTexto(P.config.texto.modelo);
    ponerModelos({ imagen: P.config.imagenModelo.modelo, video: P.config.videoModelo.modelo });
    await guardar();
    pintarAjustes();
    cargarModelos();
    avisar('proyecto', 'Ajustes guardados.', 'bueno');
  },
  'proyecto',
);

accion(
  'b-marca',
  async () => {
    if (!P.config.marca.texto) throw new Error('Escribe el texto de la marca primero.');
    await miniatura.subirMarca({ pieza: P.id, config: P.config });
    avisar('proyecto', 'Marca subida. Se incrusta dentro de cada toma al montar.', 'bueno');
  },
  'proyecto',
);

accion(
  'b-abrir',
  async () => {
    const ids = await estado.listarRemotos();
    if (!ids.length) throw new Error('No hay ningún proyecto guardado en tu nube.');
    const id = ids.length === 1 ? ids[0] : prompt(`¿Cuál?\n${ids.join('\n')}`, ids[0]);
    if (!id) return;
    // Camino de carga 3 (remoto). Pasa por sanear → normalizar igual que los otros
    // dos: es el que se olvidaba y por eso las reparaciones no llegaban (§7.2).
    P = await estado.cargarRemoto(id);
    await guardar();
    pintarTodo();
    avisar('proyecto', `Abierto ${id}.`, 'bueno');
  },
  'proyecto',
);

accion(
  'b-nuevo',
  async () => {
    if (!confirm('¿Empezar un proyecto nuevo? Lo de ahora sigue guardado.')) return;
    P = estado.nuevoProyecto({ titulo: 'Documental sin título' });
    P.id = 'p' + String(Date.now()).slice(-4);
    P.piezas[0].id = P.id;
    casos = [];
    $('zona-casos').innerHTML = '';
    await guardar();
    pintarTodo();
    ir('inicio');
  },
  'proyecto',
);

/** Una muestra corta con la voz elegida, para poder oírla antes de pagar quince minutos. */
accion(
  'b-probar-voz',
  async () => {
    const voz = $('voz').value || P.config.narracion.nombreVoz;
    const r = await llamar('voz', {
      texto:
        'La noche del catorce de marzo, el expediente registra una llamada a las once y cuarenta. ' +
        'Nadie la atendió.',
      nombreVoz: voz,
      velocidad: Number($('velocidad').value) / 100,
      tono: P.config.narracion.tono,
      // La muestra se genera igual que la narración de verdad: si el estilo no
      // entrara aquí, lo que se oye al probar no sería lo que se va a generar.
      estilo: $('estilo').value.trim(),
    });
    const a = $('muestra-voz');
    a.src = `data:audio/wav;base64,${r.datos}`;
    a.style.display = 'block';
    a.play().catch(() => {});
  },
  'proyecto',
);

/** §7.10: el catálogo de voces llega filtrado y con la región en la etiqueta. */
async function cargarVoces() {
  try {
    const r = await llamar('voz.catalogo', {
      idioma: 'es',
      expresivas: !!P.config.narracion.vocesExpresivas,
    });
    const sel = $('voz');
    sel.innerHTML = '';
    for (const v of r.voces) {
      const o = document.createElement('option');
      o.value = v.nombre;
      o.textContent = v.etiqueta;
      if (v.nombre === P.config.narracion.nombreVoz) o.selected = true;
      sel.appendChild(o);
    }
  } catch {
    // Sin catálogo se sigue con la voz por defecto: no es motivo para no trabajar.
  }
}

// Reentrada rápida: la contraseña vive en la sesión, no en el disco.
const guardada = sessionStorage.getItem('clave');
if (guardada) {
  $('clave').value = guardada;
  $('b-entrar').click();
}
