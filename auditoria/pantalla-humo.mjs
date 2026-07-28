// La prueba de humo de LA PANTALLA.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ EXISTE ESTE ARCHIVO
//
// «Ahora salen todas las opciones de los generadores vacías y no puedo
//  seleccionar ninguno.»
//
// El catálogo estaba bien, el servidor lo devolvía entero, y los desplegables
// estaban vacíos. Porque quien los llena —`cargarModelos()`— es LO ÚLTIMO que se
// ejecuta al arrancar, y si algo revienta antes, no llega nunca. La pantalla se
// pinta a medias y parece entera: los estilos están, los deslizadores están, y
// solo falta lo que se llenaba al final.
//
// Eso no lo ve ninguna invariante que MIRE el código, igual que no veía
// `parts is not defined`. Lo único que lo caza es ARRANCAR LA APLICACIÓN. Así que
// eso hace esto: monta un navegador de mentira —con los identificadores de verdad,
// sacados del HTML— y una nube de mentira, y arranca `app/main.js` de principio a
// fin.
//
// Luego comprueba lo que tiene que ser cierto DESPUÉS de arrancar: que no reventó
// nada, y que los desplegables que se llenan al final están llenos.
//
// No gasta nada: no sale ni un byte a internet.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Los identificadores que existen de verdad en el HTML. */
function idsDelHtml() {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

/**
 * Un elemento de mentira.
 *
 * Guarda de verdad lo que hace falta para comprobar algo después —los hijos, el
 * texto, el valor— y no se queja de lo demás. Lo que NO hace es fingir que existe
 * cuando no existe: eso lo decide `getElementById`, y es la mitad de la gracia.
 */
class Elemento {
  constructor(etiqueta = 'div', id = '') {
    this.tagName = String(etiqueta).toUpperCase();
    this.id = id;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.value = '';
    this.textContent = '';
    this.title = '';
    this.disabled = false;
    this.checked = false;
    this.className = '';
    this._html = '';
    this._ev = new Map();
    const clases = new Set();
    this.classList = {
      add: (...c) => c.forEach((x) => clases.add(x)),
      remove: (...c) => c.forEach((x) => clases.delete(x)),
      toggle: (c, f) => (f === undefined ? (clases.has(c) ? clases.delete(c) : clases.add(c)) : f ? clases.add(c) : clases.delete(c)),
      contains: (c) => clases.has(c),
    };
  }

  set innerHTML(v) {
    this._html = String(v ?? '');
    this.children = [];
  }
  get innerHTML() {
    return this._html;
  }
  get options() {
    return this.children;
  }
  get firstChild() {
    return this.children[0] || null;
  }

  appendChild(c) {
    this.children.push(c);
    return c;
  }
  append(...cs) {
    this.children.push(...cs);
  }
  removeChild(c) {
    this.children = this.children.filter((x) => x !== c);
    return c;
  }
  remove() {}
  insertAdjacentHTML() {}
  setAttribute(k, v) {
    this[k] = v;
  }
  getAttribute(k) {
    return this[k] ?? null;
  }
  removeAttribute(k) {
    delete this[k];
  }
  addEventListener(t, f) {
    if (!this._ev.has(t)) this._ev.set(t, []);
    this._ev.get(t).push(f);
  }
  removeEventListener() {}
  // Devuelve las promesas de los manejadores para poder ESPERARLAS: si el arranque
  // se dispara con un `click` y no se espera, la prueba termina antes que la
  // aplicación y no habría comprobado nada.
  disparar(t) {
    const ev = { preventDefault() {}, stopPropagation() {}, target: this };
    const salida = [];
    for (const f of this._ev.get(t) || []) salida.push(f.call(this, ev));
    if (typeof this[`on${t}`] === 'function') salida.push(this[`on${t}`](ev));
    return Promise.all(salida.map((x) => Promise.resolve(x)));
  }
  click() {
    return this.disparar('click');
  }
  focus() {}
  blur() {}
  scrollIntoView() {}
  querySelector() {
    return new Elemento();
  }
  querySelectorAll() {
    return [];
  }
  closest() {
    return null;
  }
}

/** Lo que contesta la nube de mentira a cada modo. */
function respuestaDe(modo, cuerpo) {
  switch (modo) {
    case 'salud':
      return {
        configuracion: { lista: true, faltan: [] },
        prueba: [
          { paso: 'cuenta', ok: true, dice: 'bien' },
          { paso: 'almacén', ok: true, dice: 'bien' },
          { paso: 'montador', ok: false, dice: 'no configurado' },
        ],
      };
    case 'proyecto.listar':
      return { proyectos: [] };
    case 'modelos.catalogo':
      return {
        disponibles: {
          texto: [{ id: 'gemini-3.1-pro', etiqueta: 'Gemini 3.1 Pro' }],
          imagen: [{ id: 'nano-banana', etiqueta: 'Nano Banana' }, { id: 'nano-banana-pro', etiqueta: 'Nano Banana Pro' }],
          video: [{ id: 'veo-3.1-fast', etiqueta: 'Veo 3.1 Fast' }],
        },
        enUso: { texto: 'gemini-3.1-pro', imagen: 'nano-banana', video: 'veo-3.1-fast' },
      };
    case 'voz.catalogo':
      return { voces: [{ nombre: 'es-US-Neural2-B', etiqueta: 'Voz grave' }] };
    case 'bajar':
      return { existe: false };
    default:
      return {};
  }
}

/**
 * Un proyecto ya empezado, como el que tiene cualquiera que lleve un rato usando
 * esto: con caso, fichas, guion, tratamiento y tomas en varios estados.
 *
 * Arrancar con el proyecto VACÍO no prueba casi nada: la pantalla vacía no pinta
 * fichas, ni tratamiento, ni tomas, ni historial. Los arranques que se rompen son
 * los que tienen datos dentro, y encima datos GUARDADOS ANTES — con la forma que
 * tenía el proyecto la semana pasada, no la de hoy.
 */
export function proyectoYaEmpezado() {
  const plano = {
    encuadre: 'plano general',
    movimientoCamara: 'fijo',
    lugar: 'la comisaría',
    luz: 'noche',
    sujetos: ['un agente de uniforme'],
    descripcion: 'La fachada de la comisaría de noche.',
  };
  const tomas = Array.from({ length: 12 }, (_, i) => ({
    i,
    escena: i < 5 ? 0 : 1,
    texto: `Texto de la toma ${i}, con su frase larga para darle cuerpo.`,
    segundos: 8 + (i % 4),
    medida: i < 8,
    plano,
    audio: i < 8 ? 'ok' : null,
    imagen: i < 6 ? 'ok' : null,
    video: i === 2 ? 'ok' : null,
    movimiento: i === 2,
    reusa: i === 9 ? 3 : null,
    tipoImagen: 'reconstruccion',
    fichas: [0],
  }));

  return {
    id: 'proy-humo',
    titulo: 'Un caso cualquiera',
    piezaActiva: 'p01',
    modificado: 1,
    piezas: [
      {
        id: 'p01',
        titulo: 'Un caso cualquiera',
        creado: 1,
        tema: 'desapariciones',
        caso: { titulo: 'Un caso cualquiera', sinopsis: 's', cuando: '2024', donde: 'x' },
        fichas: [{ afirmacion: 'a', fuente: 'f', tipoFuente: 'judicial' }],
        guion: '## Escena uno\n\nEmpieza aquí.\n\nY sigue.\n\n## Escena dos\n\nTermina.',
        escenas: [{ n: 0, titulo: 'Escena uno', musica: 'ok' }, { n: 1, titulo: 'Escena dos' }],
        tomas,
        // EL TRATAMIENTO VIEJO, a propósito: sin `musica.enIngles` y sin nada de lo
        // que se ha añadido después. Es exactamente lo que hay guardado en el
        // navegador de quien lleva semanas usando esto, y es donde se rompe.
        tratamiento: {
          premisa: 'p',
          hilo: 'h',
          tono: 't',
          aperturaEnFrio: 'a',
          cierre: 'c',
          estructura: [{ acto: 1, titulo: 'Uno', funcion: 'f', contenido: 'c', minutos: 4 }],
          identidadVisual: { paleta: 'x', luz: 'y', textura: 'z', encuadrePreferido: 'w', queEvitar: 'v' },
          musica: { atmosfera: 'cuerdas graves', instrumentacion: 'violonchelo', queEvitar: 'percusión' },
          ritmo: { segundosPorToma: 11, proporcionMovimiento: 0.15 },
          cuidado: ['no se puede afirmar x'],
          hecho: 1,
        },
      },
    ],
  };
}

/** Un almacén de mentira en memoria, con la forma que espera `app/local.js`. */
export function indexedDbDeMentira(semilla = null) {
  const bases = new Map();
  if (semilla) {
    bases.set('prisma-negro', new Map([['proyectos', new Map([[semilla.id, semilla]])]]));
  }
  const pedir = (fn) => {
    const p = { onsuccess: null, onerror: null, result: undefined };
    queueMicrotask(() => {
      try {
        p.result = fn();
      } catch (e) {
        p.error = e;
        p.onerror?.({ target: p });
        return;
      }
      p.onsuccess?.({ target: p });
    });
    return p;
  };

  return {
    open(nombre) {
      const almacenes = bases.get(nombre) || new Map();
      bases.set(nombre, almacenes);
      const db = {
        objectStoreNames: { contains: (n) => almacenes.has(n) },
        createObjectStore(n) {
          almacenes.set(n, new Map());
          return {};
        },
        transaction(n, modo) {
          const datos = almacenes.get(n) || new Map();
          almacenes.set(n, datos);
          const tx = { oncomplete: null, onerror: null, onabort: null, abort() {} };
          // `oncomplete` va en un turno POSTERIOR al de las peticiones, porque en
          // IndexedDB de verdad la transacción termina cuando ya no queda ninguna
          // pendiente. Con las dos en microtareas, «completa» llegaba antes que el
          // resultado y el lector recibía `undefined` — un fallo del banco de
          // pruebas que se leía exactamente igual que un fallo de la aplicación, y
          // eso es lo peor que puede hacer un banco de pruebas.
          setTimeout(() => tx.oncomplete?.(), 0);
          return {
            ...tx,
            set oncomplete(f) {
              tx.oncomplete = f;
            },
            set onerror(f) {
              tx.onerror = f;
            },
            set onabort(f) {
              tx.onabort = f;
            },
            objectStore: () => ({
              put: (v, k) => pedir(() => datos.set(k ?? v.id, v)),
              get: (k) => pedir(() => datos.get(k)),
              getAll: () => pedir(() => [...datos.values()]),
              getAllKeys: () => pedir(() => [...datos.keys()]),
              delete: (k) => pedir(() => datos.delete(k)),
              clear: () => pedir(() => datos.clear()),
            }),
          };
        },
      };
      const pet = { onupgradeneeded: null, onsuccess: null, onerror: null, result: db };
      queueMicrotask(() => {
        pet.onupgradeneeded?.({ target: { result: db } });
        pet.onsuccess?.({ target: { result: db } });
      });
      return pet;
    },
  };
}

/**
 * Arranca `app/main.js` entero y devuelve qué reventó y cómo quedó la pantalla.
 *
 * Con `parche` se arranca una versión AVERIADA, que es como se demuestra que esta
 * prueba sirve para algo.
 */
export async function humoDeLaPantalla({
  parche = null,
  proyecto = proyectoYaEmpezado(),
  // Modos a los que la nube de mentira contesta con un error, para comprobar qué
  // queda en pie cuando algo no llega. Con `['*']`, ninguno contesta.
  fallan = [],
} = {}) {
  const antes = {
    fetch: globalThis.fetch,
    document: globalThis.document,
    window: globalThis.window,
    indexedDB: globalThis.indexedDB,
    sessionStorage: globalThis.sessionStorage,
    localStorage: globalThis.localStorage,
    URL_createObjectURL: URL.createObjectURL,
  };

  const ids = idsDelHtml();
  const elementos = new Map();
  const fallos = [];
  const pedidos = [];
  // Los identificadores que se pidieron y NO existen: son el fallo que dejó la
  // previa sin contador y la pantalla a medias.
  const inexistentes = new Set();

  const doc = {
    getElementById(id) {
      if (!ids.has(id)) {
        inexistentes.add(id);
        return null;
      }
      if (!elementos.has(id)) elementos.set(id, new Elemento('div', id));
      return elementos.get(id);
    },
    createElement: (t) => new Elemento(t),
    createTextNode: (t) => new Elemento('#text', String(t)),
    querySelector: () => new Elemento(),
    querySelectorAll: () => [],
    addEventListener() {},
    body: new Elemento('body'),
    documentElement: new Elemento('html'),
    hidden: false,
  };

  const almacenSesion = new Map();
  const comoAlmacen = (m) => ({
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  });

  globalThis.document = doc;
  globalThis.window = {
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    location: { hash: '', href: 'http://x/', reload() {} },
    scrollTo() {},
    innerWidth: 430,
  };
  // `navigator` en Node es de solo lectura y ya existe: no hay que tocarlo.
  globalThis.indexedDB = indexedDbDeMentira(proyecto);
  // La conexión cacheada de `local.js` es del arnés ANTERIOR: si otro arnés tocó
  // la base en este proceso, sin esto el arranque leería aquella —vacía— y el
  // proyecto sembrado no aparecería. Costó una tarde encontrarlo.
  (await import('../app/local.js')).olvidarBase();
  globalThis.sessionStorage = comoAlmacen(almacenSesion);
  globalThis.localStorage = comoAlmacen(new Map());
  globalThis.confirm = () => true;
  globalThis.alert = () => {};
  globalThis.requestAnimationFrame = (f) => queueMicrotask(f);
  URL.createObjectURL = () => 'blob:humo';
  URL.revokeObjectURL = () => {};

  globalThis.fetch = async (url, opciones = {}) => {
    let cuerpo = null;
    try {
      cuerpo = opciones.body ? JSON.parse(opciones.body) : null;
    } catch {
      cuerpo = null;
    }
    const modo = cuerpo?.modo || String(url);
    pedidos.push(modo);
    if (fallan.includes('*') || fallan.includes(modo)) {
      return new Response(JSON.stringify({ ok: false, error: 'la nube no contesta' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, ...respuestaDe(modo, cuerpo) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  // La contraseña en la sesión es lo que hace que `main.js` se arranque solo al
  // cargarse: pulsa «entrar» y de ahí sale todo el arranque.
  almacenSesion.set('clave', 'humo');

  const cazar = (e) => fallos.push(`REVIENTA: ${e?.message || e}`);
  process.on('unhandledRejection', cazar);
  process.on('uncaughtException', cazar);

  try {
    let ruta = '../app/main.js';
    if (parche) {
      // La copia va AL LADO del original para que sus importaciones relativas
      // —las fases, el estado, la api— sigan resolviendo.
      const { writeFileSync } = await import('node:fs');
      writeFileSync(join(RAIZ, 'app', '_humo-main.js'), parche(readFileSync(join(RAIZ, 'app', 'main.js'), 'utf8')));
      ruta = '../app/_humo-main.js';
    }
    await import(`${ruta}?humo=${Date.now()}`);
    // El arranque se dispara solo, pero es asíncrono: hay que esperarlo. El botón
    // guarda la promesa de su manejador, así que se vuelve a disparar y se espera.
    await doc.getElementById('b-entrar')?.disparar('click');
    // Y una vuelta más de cola para lo que quedó suelto —`cargarModelos()` y
    // `cargarVoces()` no se esperan a propósito: son de adorno hasta que llegan—.
    for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 5));
  } catch (e) {
    fallos.push(`no se pudo ni arrancar: ${e.message}`);
  } finally {
    process.off('unhandledRejection', cazar);
    process.off('uncaughtException', cazar);
    if (parche) {
      const { rmSync } = await import('node:fs');
      rmSync(join(RAIZ, 'app', '_humo-main.js'), { force: true });
    }
    globalThis.fetch = antes.fetch;
    globalThis.document = antes.document;
    globalThis.window = antes.window;
    globalThis.indexedDB = antes.indexedDB;
    globalThis.sessionStorage = antes.sessionStorage;
    globalThis.localStorage = antes.localStorage;
    URL.createObjectURL = antes.URL_createObjectURL;
    // Y no se le deja al siguiente arnés la conexión a ESTA base de mentira.
    (await import('../app/local.js')).olvidarBase();
  }

  return {
    fallos,
    pedidos,
    inexistentes: [...inexistentes],
    /** Cuántas opciones tiene un desplegable después de arrancar. */
    opcionesDe: (id) => elementos.get(id)?.children.length || 0,
    texto: (id) => elementos.get(id)?.textContent || '',
    /**
     * Lo que la pantalla ESTÁ DICIENDO en rojo después de arrancar.
     *
     * Hace falta porque los manejadores atrapan sus errores y los enseñan en vez
     * de dejarlos subir: sin mirar aquí, un arranque que falló entero se ve
     * exactamente igual que uno que salió bien.
     */
    quejas: () =>
      [...elementos.entries()]
        .filter(([id]) => id.startsWith('aviso-'))
        .map(([id, el]) => [id, el.innerHTML])
        .filter(([, h]) => /class="aviso malo"/.test(h))
        .map(([id, h]) => `${id}: ${h.replace(/<[^>]+>/g, '').trim()}`),
  };
}
