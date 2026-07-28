// La prueba de humo de LA PUERTA DEL NAVEGADOR.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ EXISTE ESTE ARCHIVO
//
// «Can't find variable: esperar»
//
// `esperar(intento)` se llamaba en dos sitios de `app/api.js` y no estaba escrita
// en ninguno. Los dos sitios eran los mismos dos: el corte de red y la respuesta
// que no es JSON. O sea que CADA TROPIEZO DE RED, en vez de esperar medio segundo
// y volver a intentarlo, reventaba con un mensaje que no quiere decir nada — y se
// llevaba por delante la toma, la tanda, y lo que se estuviera generando.
//
// Desde un móvil eso no es un caso raro: es lo normal. Explica buena parte de «se
// cae a mitad».
//
// Y no lo veía nadie, por lo mismo que no se veía `parts is not defined`: un
// identificador que no existe se lee exactamente igual que uno que sí, y
// `node --check` no se queja porque la sintaxis es correcta. Lo único que lo caza
// es RECORRER EL CAMINO. Así que esto llama a la puerta por todos: el que va bien,
// el corte de red, el 500 mudo, el 4xx, la cuota, el tamaño y el «detener».
//
// El reloj va en falso, así que las esperas de cuota —que son de minutos— no
// cuestan ni un segundo aquí.
//
// No gasta nada: no sale ni un byte a internet.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexedDbDeMentira } from './pantalla-humo.mjs';

const APP = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'app');

/**
 * Los caminos que puede tomar una llamada. Cada uno es una avería distinta, y la
 * herramienta tiene que salir de todos ellos con una FRASE, nunca con un
 * ReferenceError.
 *
 * `respuestas` se consume en orden: así se puede pedir «falla y luego va bien»,
 * que es el caso que de verdad importa —un tropiezo de red no puede costar una
 * imagen ya pagada—.
 */
const CAMINOS = [
  {
    nombre: 'todo va bien',
    respuestas: [{ tipo: 'ok', cuerpo: { ok: true, texto: 'listo' } }],
    esperado: 'vale',
  },
  {
    nombre: 'la red se corta y luego vuelve',
    respuestas: [{ tipo: 'revienta' }, { tipo: 'ok', cuerpo: { ok: true, texto: 'listo' } }],
    // ESTE es el que importa: reintentar es la razón de ser del reintento.
    esperado: 'vale',
  },
  {
    nombre: 'la red se corta y no vuelve',
    respuestas: [{ tipo: 'revienta' }],
    esperado: 'falla',
    dice: /conexi[oó]n/i,
  },
  {
    nombre: 'el servidor contesta algo que no es JSON, con un 500',
    respuestas: [{ tipo: 'crudo', estado: 500, texto: '<html>error</html>' }],
    esperado: 'falla',
    dice: /no es JSON/i,
  },
  {
    nombre: 'el servidor contesta algo que no es JSON, con un 413',
    respuestas: [{ tipo: 'crudo', estado: 413, texto: 'demasiado grande' }],
    esperado: 'falla',
    dice: /no es JSON|4,5 MB/i,
  },
  {
    nombre: 'la cuota está agotada y luego se abre',
    respuestas: [
      { tipo: 'ok', estado: 429, cuerpo: { ok: false, error: 'Resource has been exhausted' } },
      { tipo: 'ok', cuerpo: { ok: true, texto: 'listo' } },
    ],
    esperado: 'vale',
  },
  {
    nombre: 'la cuota está agotada y no se abre nunca',
    respuestas: [{ tipo: 'ok', estado: 429, cuerpo: { ok: false, error: 'quota exceeded' } }],
    esperado: 'falla',
    dice: /cuota/i,
  },
  {
    nombre: 'la contraseña está mal',
    respuestas: [{ tipo: 'ok', estado: 401, cuerpo: { ok: false, error: 'clave de acceso incorrecta' } }],
    esperado: 'falla',
    dice: /acceso/i,
  },
  {
    nombre: 'la respuesta no cabe',
    respuestas: [{ tipo: 'ok', estado: 413, cuerpo: { ok: false, error: 'la respuesta ocupa 9.14 MB' } }],
    esperado: 'falla',
    dice: /9\.14 MB/,
  },
  {
    nombre: 'el servidor falla del todo y se rinde',
    respuestas: [{ tipo: 'ok', estado: 500, cuerpo: { ok: false, error: 'algo se rompió arriba' } }],
    esperado: 'falla',
    dice: /se rompi/i,
  },
  {
    nombre: 'una escritura confirmada tira la copia local',
    datos: { guardarEn: 'p01/t000/img' },
    respuestas: [{ tipo: 'ok', cuerpo: { ok: true, guardado: { bytes: 100 } } }],
    esperado: 'vale',
  },
  {
    nombre: 'se pulsa detener',
    respuestas: [{ tipo: 'revienta' }],
    abortar: true,
    esperado: 'falla',
    dice: /detenido/i,
  },
];

/**
 * Recorre todos los caminos de `llamar` y devuelve los fallos.
 *
 * Con `parche` se prueba una versión AVERIADA de la puerta, que es como se
 * demuestra que esta prueba sirve para algo.
 */
export async function humoDeLaPuerta({ parche = null } = {}) {
  const antes = {
    fetch: globalThis.fetch,
    indexedDB: globalThis.indexedDB,
    setTimeout: globalThis.setTimeout,
  };
  const fallos = [];
  let cola = [];
  let pedidos = 0;

  globalThis.indexedDB = indexedDbDeMentira();
  // El reloj en falso: las esperas de cuota son de minutos y aquí no pueden costar
  // ni un segundo. Se conserva el aviso —`alEsperar`— para poder comprobarlo.
  globalThis.setTimeout = (fn) => {
    queueMicrotask(fn);
    return 0;
  };

  globalThis.fetch = async () => {
    pedidos++;
    const paso = cola.length > 1 ? cola.shift() : cola[0];
    if (paso.tipo === 'revienta') throw new TypeError('Failed to fetch');
    if (paso.tipo === 'crudo') {
      return new Response(paso.texto, { status: paso.estado, headers: { 'Content-Type': 'text/html' } });
    }
    return new Response(JSON.stringify(paso.cuerpo), {
      status: paso.estado || 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  let copia = null;
  try {
    let ruta = '../app/api.js';
    if (parche) {
      // La copia va AL LADO del original para que `./local.js` siga resolviendo.
      copia = join(APP, '_humo-api.js');
      writeFileSync(copia, parche(readFileSync(join(APP, 'api.js'), 'utf8')));
      ruta = '../app/_humo-api.js';
    }
    const api = await import(`${ruta}?humo=${Date.now()}`);
    api.ponerClave('contraseña-de-humo');

    for (const c of CAMINOS) {
      cola = [...c.respuestas];
      pedidos = 0;
      const control = new AbortController();
      if (c.abortar) control.abort();

      let salida = null;
      let error = null;
      try {
        salida = await api.llamar('texto', c.datos || { instruccion: 'x' }, {
          reintentos: 2,
          senal: c.abortar ? control.signal : undefined,
          alEsperar: () => {},
        });
      } catch (e) {
        error = e;
      }

      // LO PRIMERO Y LO MÁS IMPORTANTE: un fallo del CÓDIGO nunca es aceptable.
      // Un ReferenceError o un TypeError aquí significa que el camino está roto,
      // no que la nube falló. Son distinguibles, y por eso se distinguen.
      if (error && (error instanceof ReferenceError || error instanceof TypeError)) {
        fallos.push(`«${c.nombre}»: REVIENTA — ${error.message}`);
        continue;
      }

      if (c.esperado === 'vale') {
        if (error) fallos.push(`«${c.nombre}»: tenía que salir bien y falló con «${error.message}».`);
        else if (!salida?.ok) fallos.push(`«${c.nombre}»: devolvió algo que no dice ok.`);
      } else {
        if (!error) fallos.push(`«${c.nombre}»: tenía que fallar y salió bien.`);
        else {
          // §1: ningún error sale mudo. Sale con una frase que se pueda leer.
          if (!error.message || error.message.length < 8) {
            fallos.push(`«${c.nombre}»: falla sin explicar nada («${error.message}»).`);
          } else if (c.dice && !c.dice.test(error.message)) {
            fallos.push(`«${c.nombre}»: dice «${error.message}», que no explica lo que pasó.`);
          }
        }
      }

      // Y el que tiene que reintentar, que reintente de verdad.
      if (/vuelve|se abre/.test(c.nombre) && pedidos < 2) {
        fallos.push(`«${c.nombre}»: no se reintentó ni una vez (${pedidos} petición).`);
      }
    }
  } catch (e) {
    fallos.push(`no se pudo ni cargar la puerta: ${e.message}`);
  } finally {
    if (copia) rmSync(copia, { force: true });
    globalThis.fetch = antes.fetch;
    globalThis.indexedDB = antes.indexedDB;
    globalThis.setTimeout = antes.setTimeout;
  }

  return { fallos, caminos: CAMINOS.length };
}
