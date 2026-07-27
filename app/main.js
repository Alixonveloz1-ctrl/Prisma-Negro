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

import { llamar, ponerClave, ponerModeloTexto } from './api.js';
import * as estado from './estado.js';
import { Cola } from './cola.js';
import { pintarSelectorModelo, mejorModeloTexto, etiquetaModelo } from './config.js';
import { segmentarVerificado } from '../comun/segmentar.mjs';
import { TEMAS, EPOCAS, EPOCA_POR_DEFECTO, temaPorId, epocaPorId } from '../comun/temas.mjs';
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
const pieza = () => P.piezas[0];

// ── Acceso ────────────────────────────────────────────────────────────────────

accion(
  'b-entrar',
  async () => {
    const c = $('clave').value.trim();
    if (!c) throw new Error('Escribe la contraseña.');
    ponerClave(c);

    const salud = await llamar('salud');
    const cfg = salud.configuracion;
    if (!cfg.lista) {
      $('salud').innerHTML =
        '<div class="aviso malo"><b>Falta configurar esto:</b>' +
        cfg.faltan
          .map((f) => `<span class="comoarreglar"><b>${escapar(f.variable)}</b> — ${escapar(f.es)}</span>`)
          .join('') +
        '</div>';
      throw new Error('La herramienta no está configurada del todo todavía.');
    }

    // §1: eslabón por eslabón, y cada uno roto dice qué hacer.
    const prueba = salud.prueba || [];
    $('salud').innerHTML = prueba
      .map(
        (p) =>
          `<div class="aviso ${p.ok ? 'bueno' : 'malo'}">${p.ok ? '✓' : '✗'} <b>${escapar(p.paso)}</b> — ` +
          `${escapar(p.dice)}` +
          (p.arregla ? `<span class="comoarreglar">${escapar(p.arregla)}</span>` : '') +
          `</div>`,
      )
      .join('');

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
  await guardar();
  pintarTodo();
  cargarVoces();
  cargarModelos();
}

/**
 * Los modelos que este proyecto tiene DE VERDAD, preguntándoselo al proveedor.
 *
 * Una lista escrita a mano acaba ofreciendo modelos retirados y escondiendo los
 * nuevos, y desde la pantalla no hay forma de saber cuál de las dos cosas pasa.
 */
async function cargarModelos() {
  try {
    const r = await llamar('modelos.catalogo');
    const ids = (r.disponibles?.texto || []).map((m) => m.id);
    const mejor = mejorModeloTexto(ids);

    // Mientras la elección sea automática, se revisa en CADA carga y sube sola.
    //
    // No basta con «si está vacío»: un proyecto guardado ayer trae el mejor modelo
    // DE AYER, y con esa condición se quedaría ahí para siempre. Es el §7.2 —un
    // arreglo que no llega porque el valor guardado lo tapa— aplicado al modelo.
    if (!P.config.texto.aMano && mejor && P.config.texto.modelo !== mejor) {
      const antes = P.config.texto.modelo;
      P.config.texto.modelo = mejor;
      ponerModeloTexto(mejor);
      await guardar();
      if (antes) avisar('proyecto', `El director sube de ${antes} a ${mejor}.`, 'bueno');
    }

    const sel = $('m-texto');
    sel.innerHTML = '';
    for (const id of ids) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = etiquetaModelo(id, mejor);
      if (id === P.config.texto.modelo) o.selected = true;
      sel.appendChild(o);
    }
    $('modelo-en-uso').textContent =
      `Escribe con: ${P.config.texto.modelo || r.enUso?.texto || '—'}` +
      (r.porSondeo ? ` · ${ids.length} encontrados preguntando uno a uno` : '');
  } catch (e) {
    $('modelo-en-uso').textContent = `No se pudo leer el catálogo: ${e.message}`;
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
  $('nombre-proyecto').textContent = P.caso?.titulo || P.titulo;
  $('cabecera-movil').textContent = `${pieza().tomas.length} tomas`;
  pintarCasoElegido();
  pintarFichas();
  pintarReparto();
  pintarTratamiento();
  pintarTomas();
  pintarAjustes();
  pintarPasos();
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
    caso: !!P.caso,
    guion: !!pieza().guion.trim() && t.length > 0,
    generado: t.length > 0 && t.every((x) => x.audio === 'ok') && t.every((x) => x.reusa !== null || x.imagen === 'ok'),
    montado: !!pieza().montaje,
  };

  hay.fichas = P.fichas.length > 0;
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
          `<button class="caso${P.caso?.titulo === c.titulo ? ' elegido' : ''}" data-caso="${i}">` +
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
      P.caso = c;
      P.tema = `${c.titulo}. ${c.sinopsis}`;
      P.titulo = c.titulo;
      pieza().titulo = c.titulo;
      await guardar();
      pintarCasos();
      pintarTodo();
      avisar('paso2', `Caso elegido: ${c.titulo}. Ya puedes generar el guion.`, 'bueno');
    };
  });
}

function pintarCasoElegido() {
  const c = P.caso;
  $('caso-elegido').innerHTML = c
    ? `<div class="ficha"><div class="cab">${escapar(c.cuando)} · ${escapar(c.donde)}` +
      `${c.documentado ? '<span class="pastilla p-ok">documentado</span>' : '<span class="pastilla p-aviso">poco documentado</span>'}</div>` +
      `<p><b>${escapar(c.titulo)}</b></p><p style="margin-top:6px;color:var(--tinta-2)">${escapar(c.sinopsis)}</p>` +
      (c.fuentes?.length
        ? `<div class="cita">Fuentes consultadas: ${c.fuentes.slice(0, 4).map((f) => escapar(f.titulo || f.enlace)).join(' · ')}</div>`
        : '') +
      `</div>`
    : '<p class="nota">Todavía no has elegido un caso. Ve a Inicio y busca casos.</p>';
  $('cuenta-fichas').textContent = P.fichas.length ? `${P.fichas.length} fichas` : '';
}

// ── Paso 2: fichas y guion ────────────────────────────────────────────────────

async function buscarFichas(mas) {
  if (!P.caso) throw new Error('Elige un caso primero, en Inicio.');
  const nuevas = await investigacion.investigar({
    tema: P.tema,
    cuantas: 12,
    yaTengo: mas ? P.fichas : [],
  });
  P.fichas = mas ? [...P.fichas, ...nuevas] : nuevas;
  await guardar();
  pintarFichas();
  pintarReparto();
  pintarCasoElegido();
}

accion('b-fichas', () => buscarFichas(false), 'investigacion');
accion('b-mas-fichas', () => buscarFichas(true), 'investigacion');

function pintarFichas() {
  $('fichas').innerHTML = P.fichas.length
    ? P.fichas
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
    if (!P.caso) throw new Error('Elige un caso primero, en el paso 1.');

    const r = await colaInvestiga.ejecutar(
      'investigación',
      investigacion.ANGULOS_DE_INVESTIGACION,
      (angulo, _i, senal) => investigacion.investigarAngulo({ caso: P.caso, angulo, senal }),
      {
        // Cada ángulo se guarda al terminar: se puede detener a mitad y lo buscado
        // no se pierde ni se vuelve a pagar (§4).
        alTerminarUno: async (fichas) => {
          P.fichas = investigacion.fusionarFichas([P.fichas, fichas]);
          await guardar();
          pintarFichas();
          pintarReparto();
        },
      },
    );

    pintarCasoElegido();
    pintarPasos();
    if (r.fallos.length) {
      avisar('paso2', `${P.fichas.length} fichas. ${r.fallos.length} ángulos fallaron; vuelve a darle.`, 'malo');
      return registro('paso2', r.fallos.map((f) => `· ${f.error}`));
    }
    avisar('paso2', `${P.fichas.length} fichas de ${r.total} ángulos. Ya puedes generar el guion.`, 'bueno');
  },
  'paso2',
);

/** De qué tipo son las fuentes que sostienen el documental. */
function pintarReparto() {
  const r = investigacion.reparto(P.fichas);
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
    const tr = await director.dirigirPieza({
      caso: P.caso,
      fichas: P.fichas,
      minutos: Number($('minutos').value) || 10,
    });
    pieza().tratamiento = tr;

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
    if (!P.caso) throw new Error('Elige un caso primero.');
    if (!P.fichas.length) {
      throw new Error(
        'Todavía no hay fichas. Dale a «Investigar a fondo» primero: el guion se ' +
          'escribe a partir de ellas, y sin fichas sería opinión, no documental.',
      );
    }
    if (!pieza().tratamiento) throw new Error('Dirige la pieza primero: el guion sale del tratamiento.');
    avisar('paso3', `${P.fichas.length} fichas. Escribiendo el guion…`);
    const texto = await guionFase.escribirGuion({
      tema: P.tema,
      fichas: P.fichas,
      minutos: Number($('minutos').value) || 10,
      tratamiento: pieza().tratamiento,
    });
    pieza().guion = texto;
    $('guion').value = texto;

    const r = segmentarVerificado(texto, P.config.segmentacion);
    pieza().tomas = r.tomas;
    pieza().escenas = r.escenas;
    await guardar();
    pintarTodo();
    avisar(
      'paso2',
      `Guion escrito y partido en ${r.tomas.length} tomas, ${r.escenas.length} escenas. ` +
        `Léelo en Guion antes de generar: es el insumo del que sale todo.`,
      'bueno',
    );
  },
  'paso2',
);

accion(
  'b-escribir',
  async () => {
    const texto = await guionFase.escribirGuion({
      tema: P.tema,
      fichas: P.fichas,
      minutos: Number($('minutos').value) || 10,
      tratamiento: pieza().tratamiento,
    });
    pieza().guion = texto;
    $('guion').value = texto;
    await guardar();
    avisar('guion', 'Guion escrito. Léelo y edítalo antes de seguir.', 'bueno');
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

  $('cifras-tomas').innerHTML = [
    ['tomas', t.length],
    ['escenas', pieza().escenas.length],
    ['minutos', (estado.duracionDe(pieza()) / 60).toFixed(1)],
    ['con movimiento', t.filter((x) => x.movimiento).length],
    ['reutilizan', t.filter((x) => x.reusa !== null).length],
    ['falta narrar', falta.narracion],
    ['faltan imágenes', falta.imagen],
    ['llamadas de voz', narracion.resumen(t, P.config).llamadas],
  ]
    .map(([k, v]) => `<div class="cifra"><b>${v}</b><span>${k}</span></div>`)
    .join('');

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
      tema: P.tema,
      config: P.config,
      tratamiento: pieza().tratamiento,
    });
    pieza().tomas = tomas;
    await guardar();
    pintarTomas();
    const sin = direccion.sinDirigir(tomas);
    avisar(
      'tomas',
      sin.length
        ? `${sin.length} tomas se quedaron sin plano (${sin.slice(0, 8).join(', ')}). Vuelve a dirigir: es una sola llamada.`
        : `Dirigidas ${tomas.length} tomas. ${tomas.filter((x) => x.movimiento).length} llevan movimiento.`,
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
  avisar('paso4', 'Falta la dirección de arte. Se hace sola, en una llamada…');
  pieza().tomas = await direccion.dirigir({
    tomas: pieza().tomas,
    escenas: pieza().escenas,
    tema: P.tema,
    config: P.config,
    tratamiento: pieza().tratamiento,
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

accion('b-narrar', async () => {
  const bloques = narracion.planificar(pieza().tomas, P.config);
  if (!bloques.length) return avisar('paso4', 'Ya está toda la narración.', 'bueno');

  // §4.5: el progreso se cuenta en LLAMADAS, no en tomas.
  const r = await cola.ejecutar(
    'narración',
    bloques,
    (bloque, _i, senal) => narracion.narrarBloque({ bloque, pieza: P.id, config: P.config, senal }),
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
  const pendientes = imagenFase.planificar(pieza().tomas);
  if (!pendientes.length) return avisar('paso4', 'Ya están todas las imágenes.', 'bueno');

  const r = await cola.ejecutar(
    'imágenes',
    pendientes,
    (toma, _i, senal) =>
      imagenFase.generarImagen({ toma, tomas: pieza().tomas, pieza: P.id, config: P.config, senal }),
    { alTerminarUno: guardaToma },
  );
  informar(r, 'imágenes');
});

accion('b-movimiento', async () => {
  await asegurarDireccion();
  const pendientes = movimiento.planificar(pieza().tomas);
  if (!pendientes.length) return avisar('paso4', 'No falta ningún clip.', 'bueno');
  if (!confirm(`Son ${pendientes.length} clips y es la fase más cara con diferencia. ¿Sigo?`)) return;

  const r = await cola.ejecutar(
    'movimiento',
    pendientes,
    (toma, _i, senal) =>
      movimiento.generarClip({
        toma,
        tomas: pieza().tomas,
        pieza: P.id,
        config: P.config,
        senal,
        aviso: (m) => ($('progreso').textContent = m),
      }),
    { alTerminarUno: guardaToma },
  );
  informar(r, 'movimiento');
});

accion('b-musica', async () => {
  const pendientes = musica.planificar(pieza().escenas, pieza().tomas, P.config);
  if (!pendientes.length) return avisar('paso4', 'La música ya está, o está apagada.', 'bueno');

  const r = await cola.ejecutar(
    'música',
    pendientes,
    (escena, _i, senal) => musica.generarMusicaDeEscena({ escena, tomas: pieza().tomas, pieza: P.id, tratamiento: pieza().tratamiento, senal }),
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
// Antes de gastar en montaje, ver y oír lo que hay. No cuesta nada: todo el material
// está pagado y en el almacén, esto solo lo baja y lo reproduce.

let piezasPrevia = [];
let reproductor = null;

function asegurarReproductor() {
  if (reproductor) return reproductor;
  reproductor = previa.reproductor({
    lienzo: $('previa-imagen'),
    audio: $('previa-audio'),
    alCambiar: (p, k, total) => {
      $('previa-vacio').style.display = 'none';
      $('previa-pie').textContent =
        `Toma ${p.i + 1} de ${total} · escena ${p.escena} · ${(p.segundos || 0).toFixed(1)}s` +
        (p.reusaDe !== null ? ` · reusa la ${p.reusaDe + 1}` : '') +
        (p.falta.length ? ` · FALTA ${p.falta.join(' y ')}` : '') +
        `\n${p.texto}`;
      document.querySelectorAll('.tira').forEach((e, n) => e.classList.toggle('activa', n === k));
      document.querySelectorAll('.tira')[k]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  });
  return reproductor;
}

accion(
  'b-preparar-previa',
  async () => {
    const tomas = pieza().tomas;
    if (!tomas.length) throw new Error('Todavía no hay tomas.');

    // Por tandas y avisando: bajar ochenta tomas de golpe deja la pantalla parada un
    // minuto sin decir nada y parece que se colgó.
    piezasPrevia = [];
    for (let desde = 0; desde < tomas.length; desde += 12) {
      const tanda = await previa.preparar({
        tomas,
        pieza: P.id,
        desde,
        cuantas: 12,
        alAvanzar: (n, de) =>
          avisar('previa', `Bajando material… ${desde + n} de ${tomas.length}`),
      });
      piezasPrevia.push(...tanda);
      pintarTiras();
    }

    asegurarReproductor().cargar(piezasPrevia);
    const faltan = piezasPrevia.filter((p) => p.falta.length);
    avisar(
      'previa',
      faltan.length
        ? `${piezasPrevia.length} tomas. A ${faltan.length} les falta algo: ${faltan.slice(0, 6).map((p) => `#${p.i + 1} (${p.falta.join('+')})`).join(', ')}`
        : `${piezasPrevia.length} tomas, todas completas. Dale a Reproducir.`,
      faltan.length ? 'malo' : 'bueno',
    );
  },
  'previa',
);

accion(
  'b-reproducir',
  async () => {
    if (!piezasPrevia.length) throw new Error('Prepara la previa primero.');
    asegurarReproductor().reproducir(reproductor.indice);
  },
  'previa',
);

$('b-parar-previa').addEventListener('click', () => reproductor?.parar());

function pintarTiras() {
  $('cuenta-previa').textContent = piezasPrevia.length ? `${piezasPrevia.length}` : '';
  const caja = $('tiras');
  caja.innerHTML = '';
  piezasPrevia.forEach((p, k) => {
    const b = document.createElement('button');
    b.className = 'tira';
    b.innerHTML =
      (p.imagen && !p.movimiento
        ? `<img src="${URL.createObjectURL(p.imagen)}" alt="">`
        : p.imagen
          ? `<div class="sin" style="color:var(--violeta-2)">clip</div>`
          : `<div class="sin">sin imagen</div>`) +
      `<div class="pie">#${p.i + 1}` +
      (p.audio ? '' : ' <span class="pastilla p-falta">sin voz</span>') +
      (p.corteForzado ? ' <span class="pastilla p-aviso">corte</span>' : '') +
      `</div>`;
    // Tocar una tira lleva el visor a esa toma: revisar es saltar a lo que sospechas,
    // no verlo entero de nuevo.
    b.onclick = () => asegurarReproductor().irA(k);
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
    hace_falta: () => !P.fichas.length,
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
    if (!P.caso) throw new Error('Elige un caso primero, en el paso 1.');

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
      tema: P.tema,
      guion: pieza().guion,
      tomas: pieza().tomas,
      escenas: pieza().escenas,
      fichas: P.fichas,
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

function pintarAjustes() {
  // §7.3: la función que repinta un control DEVUELVE el valor con el que se quedó, y
  // quien la llama lo ESCRIBE. Si no, la pantalla dice una cosa y el estado otra.
  P.config.imagen.modelo = pintarSelectorModelo($('m-imagen'), 'imagen', P.config.imagen.modelo);
  P.config.movimiento.modelo = pintarSelectorModelo($('m-video'), 'video', P.config.movimiento.modelo);

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
    P.config.imagen.modelo = $('m-imagen').value;
    P.config.movimiento.modelo = $('m-video').value;
    P.config.movimiento.proporcion = Number($('proporcion').value) / 100;
    P.config.segmentacion.segundosObjetivo = Number($('objetivo').value);
    P.config.narracion.velocidad = Number($('velocidad').value) / 100;
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
