// El lanzador del trabajo pesado (§2 punto 4, §5, §7.4, §7.6 del plano).
//
// El montaje final con ffmpeg no cabe en 60 segundos ni en un teléfono. Corre en un
// contenedor efímero en la nube del usuario, con memoria y una hora de margen.
//
// LA INVARIANTE MÁS IMPORTANTE DE TODA LA ARQUITECTURA (§7.4):
//   el contenedor NO CONOCE NINGÚN ARCHIVO POR SU NOMBRE.
// Recibe tres rutas por variables de entorno —dónde está el encargo, dónde está el
// material, dónde dejar el resultado— y una lista `origen → destino` que compone
// esta función. Así el generador puede pedir material nuevo sin que nadie vuelva a
// tocar el contenedor, que se despliega a mano y siempre va por detrás.

import { tokenDeAcceso, olvidarToken } from './token.js';
import { cifrar, descifrar } from './cifrado.js';
import { subir, fichas, rutaGs, rutaGsCarpeta } from './almacen.js';
// La lista de descargas y el guion de ffmpeg salen de la MISMA hoja y del MISMO
// módulo (§3). Que este archivo importe en vez de reimplementar es justamente lo
// que impide que discrepen.
import { clavesDeLaHoja, componerManifiesto as componerDesdeHoja } from '../../comun/hoja.mjs';

export { clavesDeLaHoja };

const RUN = 'https://run.googleapis.com/v2';
const LOGGING = 'https://logging.googleapis.com/v2';

function proyecto() {
  const p = process.env.GCP_PROYECTO;
  if (!p) throw new Error('Falta GCP_PROYECTO en el entorno.');
  return p;
}

function regionJob() {
  return process.env.GCP_REGION_JOB || 'us-central1';
}

function nombreJob() {
  const j = process.env.MONTADOR_JOB;
  if (!j) throw new Error('Falta MONTADOR_JOB en el entorno.');
  return j;
}

async function pedirRun(url, opciones = {}) {
  let token = await tokenDeAcceso();
  const hacer = (t) =>
    fetch(url, {
      ...opciones,
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
        ...(opciones.headers || {}),
      },
    });

  let r = await hacer(token);
  if (r.status === 401) {
    olvidarToken();
    token = await tokenDeAcceso();
    r = await hacer(token);
  }

  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`El montador no arrancó: ${datos?.error?.message || `HTTP ${r.status}`}`);
  }
  return datos;
}

/**
 * Comprobación previa (§7.6, primera lección).
 *
 * Antes de lanzar el trabajo pesado se comprueba que está TODO el material, y si
 * falta algo se dice QUÉ falta POR SU NOMBRE. Un archivo de cero bytes cuenta como
 * ausente.
 *
 * Sin esto, lo que ve el usuario es «exit code 254» y horas perdidas: un generador
 * de video devuelve 254 cuando no encuentra un archivo de entrada, y 183 cuando el
 * archivo existe pero está corrupto. Un código de salida no es un mensaje de error.
 */
export async function comprobarMaterial(hoja) {
  const claves = clavesDeLaHoja(hoja);
  const estado = await fichas(claves);
  const faltan = claves.filter((c) => !estado[c]?.existe);
  return {
    completo: faltan.length === 0,
    faltan,
    total: claves.length,
  };
}

/**
 * El manifiesto `origen → destino`, que es lo que hace innecesario que el
 * contenedor conozca un solo nombre de archivo (§7.4).
 *
 * La composición vive en `comun/hoja.mjs`; aquí solo se le presta la traducción a
 * `gs://`, porque el nombre del almacén no puede vivir en el código (§1) y este es
 * el único sitio del sistema que lo tiene.
 */
export function componerManifiesto(hoja) {
  return componerDesdeHoja(hoja, rutaGs);
}

/**
 * Lanza el montaje.
 *
 * Sube el encargo (hoja + guion de ffmpeg + manifiesto) al almacén y arranca el
 * contenedor con TRES variables: dónde está el encargo, dónde está el material,
 * dónde dejar el resultado. Nada más.
 */
export async function lanzar({ pieza, hoja, guionFfmpeg }) {
  // El guion de ffmpeg Y el manifiesto viajan DENTRO del encargo, como datos. Así el
  // contenedor conoce UN protocolo —la forma de este objeto— y CERO nombres de
  // archivo: puede montar material que no existía cuando se desplegó (§7.4).
  const encargo = {
    version: 1,
    pieza,
    hoja,
    guion: guionFfmpeg,
    manifiesto: componerManifiesto(hoja),
    // §7.6: dónde escribir la queja para que la aplicación pueda leerla, porque el
    // usuario no lee registros de la nube desde el teléfono.
    registro: rutaGs(`${pieza}/registro`),
  };

  await subir(`${pieza}/encargo`, Buffer.from(JSON.stringify(encargo)), 'application/json');

  const url = `${RUN}/projects/${proyecto()}/locations/${regionJob()}/jobs/${nombreJob()}:run`;
  const datos = await pedirRun(url, {
    method: 'POST',
    body: JSON.stringify({
      overrides: {
        containerOverrides: [
          {
            env: [
              { name: 'ENCARGO', value: rutaGs(`${pieza}/encargo`) },
              { name: 'MATERIAL', value: rutaGsCarpeta(`${pieza}/`) },
              { name: 'SALIDA', value: rutaGs(`${pieza}/final`) },
            ],
          },
        ],
        timeout: '3600s',
      },
    }),
  });

  if (!datos.metadata?.name && !datos.name) {
    throw new Error('El montador arrancó pero no devolvió un identificador de ejecución.');
  }
  return { ejecucion: cifrar(datos.metadata?.name || datos.name) };
}

/** Estado de una ejecución. El identificador viaja cifrado (§6). */
export async function estado(referencia) {
  const nombre = descifrar(referencia);
  const datos = await pedirRun(`${RUN}/${nombre}`, { method: 'GET' });

  const terminado = Number(datos.succeededCount || 0);
  const fallado = Number(datos.failedCount || 0);
  const cancelado = Number(datos.cancelledCount || 0);

  if (terminado > 0) return { listo: true, ok: true };
  if (fallado > 0 || cancelado > 0) {
    return {
      listo: true,
      ok: false,
      // El mensaje de verdad está en el registro; el navegador lo pedirá aparte.
      error: datos.conditions?.find((c) => c.state === 'CONDITION_FAILED')?.message || 'El montaje falló.',
    };
  }
  return { listo: false };
}

/**
 * Lee el registro de la nube (§7.6, tercera lección).
 *
 * «Y que la aplicación lea el registro de la nube por su cuenta, porque el usuario
 * no puede.» El usuario trabaja desde un teléfono y no abre consolas. Si el montaje
 * se queja, la queja tiene que llegar a la pantalla con palabras.
 */
export async function registro(referencia, lineas = 60) {
  const nombre = descifrar(referencia);
  const ejecucion = nombre.split('/').pop();

  let token = await tokenDeAcceso();
  const hacer = (t) =>
    fetch(`${LOGGING}/entries:list`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resourceNames: [`projects/${proyecto()}`],
        filter:
          `resource.type="cloud_run_job" ` +
          `labels."run.googleapis.com/execution_name"="${ejecucion}"`,
        orderBy: 'timestamp desc',
        pageSize: lineas,
      }),
    });

  let r = await hacer(token);
  if (r.status === 401) {
    olvidarToken();
    token = await tokenDeAcceso();
    r = await hacer(token);
  }

  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    return { lineas: [`No se pudo leer el registro: ${datos?.error?.message || r.status}`] };
  }

  const entradas = (datos.entries || [])
    .map((e) => e.textPayload || e.jsonPayload?.message || '')
    .filter(Boolean)
    .reverse();

  return { lineas: entradas };
}
