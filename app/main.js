// El director de orquesta (§2 del plano).
//
// El navegador tiene el proyecto entero en memoria y en la base local, decide qué
// generar y en qué orden, lleva la cola, la barra de progreso, el botón de detener y
// los reintentos. NUNCA ve una credencial.
//
// §1: el usuario no lee registros de la nube desde el teléfono. Cualquier fallo se
// explica AQUÍ, en pantalla, con palabras.

import { llamar, ponerClave } from './api.js';
import * as estado from './estado.js';
import { Cola } from './cola.js';
import { pintarSelectorModelo } from './config.js';
import { segmentarVerificado } from '../comun/segmentar.mjs';
import * as investigacion from './fases/investigacion.js';
import * as guionFase from './fases/guion.js';
import * as direccion from './fases/direccion.js';
import * as narracion from './fases/narracion.js';
import * as imagenFase from './fases/imagen.js';
import * as movimiento from './fases/movimiento.js';
import * as musica from './fases/musica.js';
import * as miniatura from './fases/miniatura.js';
import * as metadatos from './fases/metadatos.js';
import * as montajeFase from './fases/montaje.js';

const $ = (id) => document.getElementById(id);
const PASOS = [
  ['p-proyecto', 'Proyecto'],
  ['p-investigacion', 'Investigación'],
  ['p-guion', 'Guion'],
  ['p-tomas', 'Tomas'],
  ['p-generar', 'Generar'],
  ['p-montaje', 'Montaje'],
  ['p-publicar', 'Publicar'],
  ['p-ajustes', 'Ajustes'],
];

let P = null; // el proyecto
const cola = new Cola({ alProgresar: pintarProgreso, alAviso: (m) => avisar('generar', m) });

// ── Utilidades de pantalla ────────────────────────────────────────────────────

function avisar(donde, mensaje, clase = '') {
  const caja = $(`aviso-${donde}`) || $('aviso-generar');
  if (!caja) return;
  caja.innerHTML = '';
  if (!mensaje) return;
  const d = document.createElement('div');
  d.className = `aviso ${clase}`;
  d.textContent = mensaje;
  caja.appendChild(d);
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
  const cola = e === 'detenida' ? ' · detenido' : e === 'termina' ? ' · listo' : '';
  $('progreso').textContent =
    `${fase}: ${hechas} de ${total}${fallos ? ` · ${fallos} con fallo` : ''}${cola}`;
  $('b-detener').disabled = e === 'termina' || e === 'detenida';
}

/** Envuelve una acción: desactiva el botón, enseña el fallo con palabras. */
function accion(boton, hacer, donde = 'generar') {
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

accion('b-entrar', async () => {
  const c = $('clave').value.trim();
  if (!c) throw new Error('Escribe la contraseña.');
  ponerClave(c);

  const salud = await llamar('salud');
  const cfg = salud.configuracion;
  if (!cfg.lista) {
    $('salud').innerHTML =
      '<div class="aviso malo">Falta configurar esto en el panel de la plataforma:<br>' +
      cfg.faltan.map((f) => `<b>${f.variable}</b> — ${f.es}`).join('<br>') +
      '</div>';
    throw new Error('La herramienta no está configurada del todo todavía.');
  }

  // §1: el fallo se explica AQUÍ, con palabras. Eslabón por eslabón, y cada uno roto
  // dice qué hacer — que es la diferencia entre arreglarlo en un minuto y pasar la
  // tarde mirando una pantalla que solo dice «error».
  const prueba = salud.prueba || [];
  const rotos = prueba.filter((p) => !p.ok);
  $('salud').innerHTML = prueba.length
    ? prueba
        .map(
          (p) =>
            `<div class="aviso ${p.ok ? 'bueno' : 'malo'}">` +
            `${p.ok ? '✓' : '✗'} <b>${p.paso}</b> — ${escapar(p.dice)}` +
            (p.arregla ? `<br><span style="opacity:.85">${escapar(p.arregla)}</span>` : '') +
            `</div>`,
        )
        .join('')
    : '';

  // El montador solo hace falta para montar: no impide entrar ni generar.
  const graves = rotos.filter((p) => p.paso !== 'montador');
  if (graves.length) throw new Error('Hay algo que todavía no funciona. Mira arriba: dice cuál y qué hacer.');

  // Una llamada real: comprueba la contraseña de verdad, no solo la configuración.
  await llamar('proyecto.listar');
  sessionStorage.setItem('clave', c);

  $('s-acceso').classList.add('oculto');
  $('app').classList.remove('oculto');
  await arrancar();
}, 'proyecto');

// ── Arranque ──────────────────────────────────────────────────────────────────

async function arrancar() {
  pintarPasos();
  const locales = await estado.listarLocales();
  // Camino de carga 2 (local) o 1 (nuevo). Los dos pasan por sanear → normalizar.
  P = locales.length
    ? await estado.cargarLocal(locales.sort((a, b) => b.modificado - a.modificado)[0].id)
    : estado.nuevoProyecto();
  await guardar();
  pintarTodo();
  cargarVoces();
}

function pintarPasos() {
  const nav = $('pasos');
  nav.innerHTML = '';
  PASOS.forEach(([id, nombre], n) => {
    const b = document.createElement('button');
    b.textContent = nombre;
    b.onclick = () => {
      document.querySelectorAll('.paso').forEach((s) => s.classList.add('oculto'));
      $(id).classList.remove('oculto');
      nav.querySelectorAll('button').forEach((x) => x.classList.remove('activo'));
      b.classList.add('activo');
    };
    if (n === 0) b.classList.add('activo');
    nav.appendChild(b);
  });
}

function pintarTodo() {
  $('titulo').value = P.titulo;
  $('tema').value = P.tema;
  $('guion').value = pieza().guion;
  $('cabecera').textContent = `${P.id} · ${pieza().tomas.length} tomas`;
  pintarFichas();
  pintarTomas();
  pintarAjustes();
}

// ── Proyecto ──────────────────────────────────────────────────────────────────

accion('b-guardar', async () => {
  P.titulo = $('titulo').value.trim() || P.titulo;
  P.tema = $('tema').value.trim();
  pieza().guion = $('guion').value;
  await guardar();
  avisar('proyecto', 'Guardado en este teléfono.', 'bueno');
}, 'proyecto');

accion('b-subir', async () => {
  P.titulo = $('titulo').value.trim() || P.titulo;
  P.tema = $('tema').value.trim();
  pieza().guion = $('guion').value;
  await estado.guardar(P, { remoto: true });
  avisar('proyecto', 'Guardado en tu nube. Esta es la copia buena.', 'bueno');
}, 'proyecto');

accion('b-abrir', async () => {
  const ids = await estado.listarRemotos();
  if (!ids.length) throw new Error('No hay ningún proyecto guardado en tu nube.');
  const id = ids.length === 1 ? ids[0] : prompt(`¿Cuál?\n${ids.join('\n')}`, ids[0]);
  if (!id) return;
  // Camino de carga 3 (remoto). Pasa por sanear → normalizar, igual que los otros
  // dos: es el que se olvidaba y por eso las reparaciones no llegaban (§7.2).
  P = await estado.cargarRemoto(id);
  await guardar();
  pintarTodo();
  avisar('proyecto', `Abierto ${id}.`, 'bueno');
}, 'proyecto');

accion('b-nuevo', async () => {
  if (!confirm('¿Empezar un proyecto nuevo? Lo de ahora sigue guardado.')) return;
  P = estado.nuevoProyecto({ titulo: 'Documental sin título' });
  P.id = 'p' + String(Date.now()).slice(-4);
  P.piezas[0].id = P.id;
  await guardar();
  pintarTodo();
}, 'proyecto');

// ── Investigación ─────────────────────────────────────────────────────────────

async function buscarFichas(mas) {
  P.tema = $('tema').value.trim();
  if (!P.tema) throw new Error('Escribe el tema en la pestaña Proyecto.');
  const nuevas = await investigacion.investigar({
    tema: P.tema,
    cuantas: 12,
    yaTengo: mas ? P.fichas : [],
  });
  P.fichas = mas ? [...P.fichas, ...nuevas] : nuevas;
  await guardar();
  pintarFichas();
}

accion('b-investigar', () => buscarFichas(false), 'proyecto');
accion('b-mas-fichas', () => buscarFichas(true), 'proyecto');

function pintarFichas() {
  const caja = $('fichas');
  if (!P.fichas.length) {
    caja.innerHTML = '<p class="porque">Todavía no hay fichas.</p>';
    return;
  }
  caja.innerHTML =
    `<div class="cifras"><div class="cifra"><b>${P.fichas.length}</b>fichas</div></div>` +
    P.fichas
      .map(
        (f) =>
          `<div class="toma"><div class="cab">` +
          `<span class="pastilla ${f.incierto ? 'falta' : 'ok'}">${f.incierto ? 'disputado' : f.fiabilidad}</span>` +
          `<span>${escapar(f.fuente)}${f.fecha ? ' · ' + escapar(f.fecha) : ''}</span></div>` +
          `<p>${escapar(f.afirmacion)}</p>` +
          (f.cita ? `<p style="color:var(--tenue);margin-top:.3rem">«${escapar(f.cita)}»</p>` : '') +
          `</div>`,
      )
      .join('');
}

const escapar = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ── Guion y segmentación ──────────────────────────────────────────────────────

accion('b-escribir', async () => {
  P.tema = $('tema').value.trim();
  const texto = await guionFase.escribirGuion({
    tema: P.tema,
    fichas: P.fichas,
    minutos: Number($('minutos').value) || 10,
  });
  pieza().guion = texto;
  $('guion').value = texto;
  await guardar();
  avisar('guion', 'Guion escrito. Léelo y edítalo antes de seguir.', 'bueno');
}, 'guion');

accion('b-segmentar', async () => {
  pieza().guion = $('guion').value;
  if (!pieza().guion.trim()) throw new Error('No hay guion que partir.');

  // §4.3: segmentar SIN comprobar la cobertura es como no haber comprobado nunca.
  // Esta puerta hace las dos cosas y lanza si el guion no queda cubierto.
  const r = segmentarVerificado(pieza().guion, P.config.segmentacion);

  // Se conserva lo ya generado de las tomas que no cambiaron de texto: repartir el
  // guion otra vez no debería obligar a pagar la narración otra vez.
  const antes = new Map(pieza().tomas.map((t) => [t.texto, t]));
  pieza().tomas = r.tomas.map((t) => {
    const viejo = antes.get(t.texto);
    return viejo ? { ...t, ...viejo, i: t.i, escena: t.escena } : t;
  });
  pieza().escenas = r.escenas;

  await guardar();
  pintarTomas();
  avisar(
    'guion',
    `${r.tomas.length} tomas en ${r.escenas.length} escenas. ` +
      `La cobertura es exacta: ${r.cobertura.caracteres} caracteres, sin perder ni duplicar nada.`,
    'bueno',
  );
}, 'guion');

// ── Tomas y dirección ─────────────────────────────────────────────────────────

function pintarTomas() {
  const t = pieza().tomas;
  const falta = estado.loQueFalta(pieza());
  $('cabecera').textContent = `${P.id} · ${t.length} tomas`;

  $('cifras-tomas').innerHTML = [
    ['tomas', t.length],
    ['escenas', pieza().escenas.length],
    ['minutos', (estado.duracionDe(pieza()) / 60).toFixed(1)],
    ['con movimiento', t.filter((x) => x.movimiento).length],
    ['reutilizan', t.filter((x) => x.reusa !== null).length],
  ]
    .map(([k, v]) => `<div class="cifra"><b>${v}</b>${k}</div>`)
    .join('');

  $('resumen-coste').innerHTML = [
    ['llamadas de voz', narracion.resumen(t, P.config).llamadas],
    ['imágenes', imagenFase.planificar(t, { soloLasQueFaltan: false }).length],
    ['clips', movimiento.resumen(t).clips],
    ['pistas de música', pieza().escenas.length],
    ['falta narrar', falta.narracion],
    ['faltan imágenes', falta.imagen],
  ]
    .map(([k, v]) => `<div class="cifra"><b>${v}</b>${k}</div>`)
    .join('');

  $('lista-tomas').innerHTML = t
    .slice(0, 60)
    .map(
      (x) =>
        `<div class="toma"><div class="cab">` +
        `<span>#${x.i} · esc ${x.escena} · ${(x.segundos || 0).toFixed(1)}s${x.medida ? '' : ' (est.)'}</span>` +
        `<span class="pastilla ${x.audio === 'ok' ? 'ok' : 'falta'}">voz</span>` +
        `<span class="pastilla ${x.reusa !== null ? 'ok' : x.imagen === 'ok' ? 'ok' : 'falta'}">` +
        `${x.reusa !== null ? `reusa #${x.reusa}` : 'imagen'}</span>` +
        (x.movimiento ? `<span class="pastilla ${x.video === 'ok' ? 'ok' : 'falta'}">movimiento</span>` : '') +
        `<span class="pastilla tipo">${x.tipoImagen}</span>` +
        (x.corteForzado ? `<span class="pastilla falta">corte forzado</span>` : '') +
        `</div><p>${escapar(x.texto)}</p></div>`,
    )
    .join('');
}

accion('b-dirigir', async () => {
  if (!pieza().tomas.length) throw new Error('Parte el guion en tomas primero.');
  const tomas = await direccion.dirigir({
    tomas: pieza().tomas,
    escenas: pieza().escenas,
    tema: P.tema,
    config: P.config,
  });
  pieza().tomas = tomas;
  await guardar();
  pintarTomas();

  const sin = direccion.sinDirigir(tomas);
  avisar(
    'tomas',
    sin.length
      ? `${sin.length} tomas se quedaron sin plano (${sin.slice(0, 8).join(', ')}). Vuelve a dirigir: solo cuesta una llamada.`
      : `Dirigidas ${tomas.length} tomas. ${tomas.filter((t) => t.movimiento).length} llevan movimiento.`,
    sin.length ? 'malo' : 'bueno',
  );
}, 'tomas');

// ── Las fases que gastan ──────────────────────────────────────────────────────

$('b-detener').addEventListener('click', () => cola.detener());

accion('b-narrar', async () => {
  const bloques = narracion.planificar(pieza().tomas, P.config);
  if (!bloques.length) return avisar('generar', 'Ya está toda la narración.', 'bueno');

  // §4.5: el progreso se cuenta en LLAMADAS, no en tomas.
  const r = await cola.ejecutar(
    'narración',
    bloques,
    (bloque, _i, senal) => narracion.narrarBloque({ bloque, pieza: P.id, config: P.config, senal }),
    {
      // Cada unidad terminada se escribe ANTES de pasar a la siguiente (§4).
      alTerminarUno: async (tomasNuevas) => {
        for (const t of tomasNuevas) {
          const k = pieza().tomas.findIndex((x) => x.i === t.i);
          if (k >= 0) pieza().tomas[k] = t;
        }
        await guardar();
        pintarTomas();
      },
    },
  );
  informar(r, 'narración');
});

accion('b-imagenes', async () => {
  const pendientes = imagenFase.planificar(pieza().tomas);
  if (!pendientes.length) return avisar('generar', 'Ya están todas las imágenes.', 'bueno');

  const r = await cola.ejecutar(
    'imágenes',
    pendientes,
    (toma, _i, senal) =>
      imagenFase.generarImagen({ toma, tomas: pieza().tomas, pieza: P.id, config: P.config, senal }),
    {
      alTerminarUno: async (nueva) => {
        const k = pieza().tomas.findIndex((x) => x.i === nueva.i);
        if (k >= 0) pieza().tomas[k] = nueva;
        await guardar();
        pintarTomas();
      },
    },
  );
  informar(r, 'imágenes');
});

accion('b-movimiento', async () => {
  const pendientes = movimiento.planificar(pieza().tomas);
  if (!pendientes.length) return avisar('generar', 'No falta ningún clip.', 'bueno');
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
    {
      alTerminarUno: async (nueva) => {
        const k = pieza().tomas.findIndex((x) => x.i === nueva.i);
        if (k >= 0) pieza().tomas[k] = nueva;
        await guardar();
        pintarTomas();
      },
    },
  );
  informar(r, 'movimiento');
});

accion('b-musica', async () => {
  const pendientes = musica.planificar(pieza().escenas, pieza().tomas, P.config);
  if (!pendientes.length) return avisar('generar', 'La música ya está, o está apagada.', 'bueno');

  const r = await cola.ejecutar(
    'música',
    pendientes,
    (escena, _i, senal) =>
      musica.generarMusicaDeEscena({ escena, tomas: pieza().tomas, pieza: P.id, senal }),
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

accion('b-marca', async () => {
  if (!P.config.marca.texto) throw new Error('Pon el texto de la marca en Ajustes.');
  await miniatura.subirMarca({ pieza: P.id, config: P.config });
  avisar('generar', 'Marca subida. Se incrusta dentro de cada toma al montar.', 'bueno');
});

function informar(r, que) {
  if (r.detenida) {
    return avisar('generar', `${que}: detenido en ${r.hechas} de ${r.total}. Lo hecho está guardado.`);
  }
  if (r.fallos.length) {
    avisar('generar', `${que}: ${r.fallos.length} de ${r.total} fallaron. Vuelve a darle: solo repite lo que falta.`, 'malo');
    registro('generar', r.fallos.map((f) => `· ${f.error}`));
    return;
  }
  avisar('generar', `${que}: ${r.hechas} de ${r.total}, sin fallos.`, 'bueno');
}

// ── Montaje ───────────────────────────────────────────────────────────────────

accion('b-revisar', async () => {
  const r = await montajeFase.revisar({ pieza: pieza(), config: P.config });
  avisar(
    'montaje',
    r.completo
      ? `Todo listo: ${r.total} materiales, ${(r.duracion / 60).toFixed(1)} minutos.`
      : `Faltan ${r.faltan.length} de ${r.total} materiales.`,
    r.completo ? 'bueno' : 'malo',
  );
  if (!r.completo) registro('montaje', r.faltan);
  for (const a of r.avisos) registro('montaje', [a]);
}, 'montaje');

accion('b-montar', async () => {
  avisar('montaje', 'Comprobando el material…');
  const ejecucion = await montajeFase.montar({
    pieza: pieza(),
    config: P.config,
    aviso: (m) => avisar('montaje', m),
  });
  pieza().montaje = ejecucion;
  await guardar();

  const r = await montajeFase.esperarMontaje({
    ejecucion,
    aviso: (m) => avisar('montaje', m),
  });

  if (r.ok) {
    avisar('montaje', `Montado en ${r.minutos} minutos. Ya puedes bajarlo.`, 'bueno');
    $('b-bajar').disabled = false;
  } else {
    // §7.6: la aplicación lee el registro de la nube por su cuenta, porque el
    // usuario no puede.
    avisar('montaje', r.error, 'malo');
    registro('montaje', r.registro);
  }
}, 'montaje');

accion('b-bajar', async () => {
  avisar('montaje', 'Bajando por trozos…');
  const blob = await montajeFase.bajarFinal({
    pieza: pieza(),
    alAvanzar: (hecho, total) =>
      avisar('montaje', `Bajando… ${(hecho / 1048576).toFixed(0)} de ${(total / 1048576).toFixed(0)} MB`),
  });
  if (!blob) throw new Error('El video montado no está en el almacén todavía.');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${P.titulo.replace(/[^\w\sáéíóúñ-]/gi, '')}.mp4`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  avisar('montaje', 'Descargado.', 'bueno');
}, 'montaje');

// ── Publicación ───────────────────────────────────────────────────────────────

accion('b-metadatos', async () => {
  const m = await metadatos.generarMetadatos({
    tema: P.tema,
    guion: pieza().guion,
    tomas: pieza().tomas,
    escenas: pieza().escenas,
    fichas: P.fichas,
  });
  pieza().metadatos = m;
  await guardar();

  $('salida-metadatos').innerHTML =
    (m.aviso ? `<div class="aviso malo">${escapar(m.aviso)}</div>` : '') +
    `<label>Títulos</label>` +
    m.titulos.map((t) => `<div class="toma"><p>${escapar(t)}</p></div>`).join('') +
    `<label>Descripción (${m.duracion})</label>` +
    `<textarea readonly style="min-height:14rem">${escapar(m.descripcion)}</textarea>` +
    `<label>Etiquetas</label>` +
    `<textarea readonly style="min-height:4rem">${escapar(m.etiquetas.join(', '))}</textarea>`;
}, 'proyecto');

accion('b-miniatura', async () => {
  const t = pieza().metadatos?.titulos?.[0] || P.titulo;
  const lineas = t.length > 24 ? [t.slice(0, t.lastIndexOf(' ', 24)), t.slice(t.lastIndexOf(' ', 24) + 1)] : [t];
  const r = await miniatura.generarMiniatura({
    pieza: P.id,
    lineas,
    atmosfera: pieza().tomas[0]?.plano?.descripcion || P.tema,
    config: P.config,
  });
  const img = document.createElement('img');
  img.src = URL.createObjectURL(r.blob);
  img.style.cssText = 'width:100%;border-radius:9px;margin-top:.7rem';
  $('salida-metadatos').prepend(img);
}, 'proyecto');

// ── Ajustes ───────────────────────────────────────────────────────────────────

function pintarAjustes() {
  // §7.3: la función que repinta un control DEVUELVE el valor con el que se quedó, y
  // quien la llama lo ESCRIBE. Si no se escribiera, la pantalla diría una cosa y el
  // objeto de configuración conservaría el valor viejo.
  P.config.imagen.modelo = pintarSelectorModelo($('m-imagen'), 'imagen', P.config.imagen.modelo);
  P.config.movimiento.modelo = pintarSelectorModelo($('m-video'), 'video', P.config.movimiento.modelo);

  $('proporcion').value = Math.round(P.config.movimiento.proporcion * 100);
  $('v-proporcion').textContent = `${Math.round(P.config.movimiento.proporcion * 100)}%`;
  $('objetivo').value = P.config.segmentacion.segundosObjetivo;
  $('v-objetivo').textContent = P.config.segmentacion.segundosObjetivo;
  $('marca-texto').value = P.config.marca.texto;
  $('vertical').value = P.config.formato.vertical ? '1' : '0';
}

$('proporcion').addEventListener('input', (e) => ($('v-proporcion').textContent = `${e.target.value}%`));
$('objetivo').addEventListener('input', (e) => ($('v-objetivo').textContent = e.target.value));

accion('b-ajustes', async () => {
  P.config.imagen.modelo = $('m-imagen').value;
  P.config.movimiento.modelo = $('m-video').value;
  P.config.movimiento.proporcion = Number($('proporcion').value) / 100;
  P.config.segmentacion.segundosObjetivo = Number($('objetivo').value);
  P.config.marca.texto = $('marca-texto').value.trim();
  P.config.formato.vertical = $('vertical').value === '1';
  if ($('voz').value) P.config.narracion.nombreVoz = $('voz').value;

  // Se vuelve a sanear para que los valores nuevos pasen por el normalizador: es el
  // mismo camino que usan las tres cargas, y así un valor fuera de rango se corrige
  // aquí y no dentro de una fase a medio generar.
  P = estado.sanear(P);
  await guardar();
  pintarAjustes();
  avisar('proyecto', 'Ajustes guardados.', 'bueno');
}, 'proyecto');

/** §7.10: el catálogo de voces llega ya filtrado y con la región en la etiqueta. */
async function cargarVoces() {
  try {
    const r = await llamar('voz.catalogo', { idioma: 'es' });
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
