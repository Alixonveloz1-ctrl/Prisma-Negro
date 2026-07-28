// El almacén del usuario (§2, §3 del plano).
//
// Todo lo generado vive aquí y esta es la única fuente de verdad. El navegador
// tiene una copia, no el original.
//
// El navegador nunca ve una URL del almacén ni el nombre del bucket: manda CLAVES
// de material (`p03/t017/img`) y recibe referencias opacas cifradas.
//
// §7.12: ningún valor de retorno de una escritura se ignora. Aquí eso se traduce en
// que `subir` LANZA si el almacén no confirma. No devuelve `false` para que alguien
// se olvide de mirarlo.

import { tokenDeAcceso, olvidarToken } from './token.js';
import { cifrar, descifrar, esReferencia } from './cifrado.js';
import { extensionDe } from '../../comun/claves.mjs';
import { leer as leerEntorno, nombrePrincipal } from './entorno.js';

const RAIZ = 'https://storage.googleapis.com';

function bucket() {
  const b = leerEntorno('bucket').valor;
  if (!b) throw new Error(`Falta ${nombrePrincipal('bucket')} en el entorno: el nombre del bucket.`);
  return b;
}

function prefijo() {
  const p = (leerEntorno('prefijo').valor || 'prisma-negro').replace(/^\/+|\/+$/g, '');
  return p ? p + '/' : '';
}

/**
 * El prefijo que se está usando, para enseñarlo en el diagnóstico.
 *
 * Existe para que nadie más tenga que leer ALMACEN_PREFIJO: el almacén es el único
 * que sabe cómo se compone una ruta, y eso incluye saber dónde empieza.
 */
export const prefijoActual = () => prefijo().replace(/\/$/, '');

// ── El traductor ──────────────────────────────────────────────────────────────
// ÚNICA función que convierte una clave de material en una ruta del almacén (§3).
// Si algún día cambia el esquema de rutas, cambia aquí y en ningún otro sitio.
//
// La GRAMÁTICA de las claves (qué es válido, qué extensión le toca a cada tipo)
// vive en `comun/claves.mjs`, que comparten el navegador, esta función y la
// auditoría. Aquí solo se le añade delante el sitio donde vive todo, que es lo
// único que esta pieza sabe y las otras dos no.

export function rutaDe(clave) {
  return prefijo() + String(clave).trim() + extensionDe(clave);
}

/** Referencia opaca para el navegador: la clave cifrada, nunca la ruta. */
export function referenciaDe(clave) {
  rutaDe(clave); // valida antes de cifrar: una referencia siempre traduce
  return cifrar(clave);
}

/** Del lado de acá: referencia opaca (o clave directa) → clave. */
export function claveDe(referenciaOClave) {
  return esReferencia(referenciaOClave) ? descifrar(referenciaOClave) : String(referenciaOClave);
}

// ── Operaciones ───────────────────────────────────────────────────────────────

async function conToken(hacer) {
  let token = await tokenDeAcceso();
  let r = await hacer(token);
  if (r.status === 401) {
    olvidarToken();
    token = await tokenDeAcceso();
    r = await hacer(token);
  }
  return r;
}

async function fallo(r, quehacia) {
  const cuerpo = await r.text().catch(() => '');
  let detalle = cuerpo.slice(0, 400);
  try {
    const j = JSON.parse(cuerpo);
    detalle = j?.error?.message || detalle;
  } catch {
    /* el cuerpo no era JSON; nos quedamos con el recorte */
  }
  return new Error(`El almacén rechazó ${quehacia} (HTTP ${r.status}): ${detalle}`);
}

/**
 * Sube un material. `datos` es un Buffer.
 * Devuelve { clave, ruta, bytes }. Lanza si el almacén no confirma (§7.12).
 */
export async function subir(clave, datos, tipoMime = 'application/octet-stream') {
  const ruta = rutaDe(clave);
  const url =
    `${RAIZ}/upload/storage/v1/b/${encodeURIComponent(bucket())}/o` +
    `?uploadType=media&name=${encodeURIComponent(ruta)}`;

  const r = await conToken((token) =>
    fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': tipoMime },
      body: datos,
    }),
  );

  if (!r.ok) throw await fallo(r, `subir «${clave}»`);
  const meta = await r.json();

  // El almacén acaba de decir que existe y cuánto pesa. Si pesa cero, no existe:
  // un archivo de cero bytes cuenta como ausente (§7.6).
  const bytes = Number(meta.size || 0);
  if (!bytes) {
    throw new Error(`«${clave}» se subió con cero bytes. Eso es un fallo, no un archivo.`);
  }
  return { clave, ruta, bytes };
}

/** Baja un material completo como Buffer. */
export async function bajar(clave) {
  const ruta = rutaDe(clave);
  const url =
    `${RAIZ}/storage/v1/b/${encodeURIComponent(bucket())}/o/` +
    `${encodeURIComponent(ruta)}?alt=media`;

  const r = await conToken((token) => fetch(url, { headers: { Authorization: `Bearer ${token}` } }));
  if (r.status === 404) return null;
  if (!r.ok) throw await fallo(r, `bajar «${clave}»`);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * Baja un TROZO de un material.
 *
 * §6: un empaquetado de una pieza completa son casi dos gigas, y el tope de la
 * respuesta son 4,5 MB. Todo lo grande baja por trozos y el navegador los va
 * pegando en un blob respaldado en disco, sin materializarlo en memoria de
 * JavaScript —que es lo que hace que el navegador del teléfono recargue la página
 * a media descarga.
 */
export async function bajarTrozo(clave, desde = 0, hasta = null) {
  const ruta = rutaDe(clave);
  const url =
    `${RAIZ}/storage/v1/b/${encodeURIComponent(bucket())}/o/` +
    `${encodeURIComponent(ruta)}?alt=media`;

  const ini = Math.max(0, Number(desde) || 0);
  // 3 MB por trozo: deja sitio de sobra para el base64 (que crece un tercio) dentro
  // de los 4,5 MB de la respuesta.
  const fin = hasta == null ? ini + 3 * 1024 * 1024 - 1 : Number(hasta);

  const r = await conToken((token) =>
    fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Range: `bytes=${ini}-${fin}` },
    }),
  );

  if (r.status === 404) return null;
  if (!r.ok && r.status !== 206) throw await fallo(r, `bajar un trozo de «${clave}»`);

  const rango = r.headers.get('content-range') || '';
  const total = Number(rango.split('/')[1]) || null;
  const datos = Buffer.from(await r.arrayBuffer());

  return { datos, desde: ini, hasta: ini + datos.byteLength - 1, total };
}

/** Ficha de un material sin bajarlo: { existe, bytes }. Cero bytes = no existe. */
export async function ficha(clave) {
  const ruta = rutaDe(clave);
  const url = `${RAIZ}/storage/v1/b/${encodeURIComponent(bucket())}/o/${encodeURIComponent(ruta)}`;
  const r = await conToken((token) => fetch(url, { headers: { Authorization: `Bearer ${token}` } }));
  if (r.status === 404) return { existe: false, bytes: 0, actualizado: null };
  if (!r.ok) throw await fallo(r, `consultar «${clave}»`);
  const meta = await r.json();
  const bytes = Number(meta.size || 0);
  // CUÁNDO se escribió, no solo si está. Con eso, el navegador puede distinguir
  // «esto se acaba de generar y la respuesta se perdió por el camino» de «esto es
  // de la semana pasada». Sin la fecha, un tiempo agotado al REHACER daría por
  // buena la imagen vieja.
  return { existe: bytes > 0, bytes, actualizado: meta.updated || null };
}

/** Fichas de muchos materiales de una vez. El navegador pregunta «qué falta». */
export async function fichas(claves) {
  const salida = {};
  const tanda = 12;
  for (let i = 0; i < claves.length; i += tanda) {
    const trozo = claves.slice(i, i + tanda);
    const res = await Promise.all(
      trozo.map((c) => ficha(c).catch(() => ({ existe: false, bytes: 0 }))),
    );
    trozo.forEach((c, j) => {
      salida[c] = res[j];
    });
  }
  return salida;
}

/** Lista claves bajo un prefijo de clave (no de ruta). */
export async function listar(prefijoClave = '') {
  const base = prefijo() + String(prefijoClave || '');
  const salida = [];
  let pagina = '';

  do {
    const url =
      `${RAIZ}/storage/v1/b/${encodeURIComponent(bucket())}/o` +
      `?prefix=${encodeURIComponent(base)}&maxResults=1000` +
      (pagina ? `&pageToken=${encodeURIComponent(pagina)}` : '');
    const r = await conToken((token) =>
      fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
    );
    if (!r.ok) throw await fallo(r, `listar «${prefijoClave}»`);
    const datos = await r.json();
    for (const o of datos.items || []) {
      const sinPrefijo = o.name.slice(prefijo().length);
      salida.push({
        clave: sinPrefijo.replace(/\.[a-z0-9]+$/i, ''),
        bytes: Number(o.size || 0),
        actualizado: o.updated,
      });
    }
    pagina = datos.nextPageToken || '';
  } while (pagina);

  return salida;
}

export async function borrar(clave) {
  const ruta = rutaDe(clave);
  const url = `${RAIZ}/storage/v1/b/${encodeURIComponent(bucket())}/o/${encodeURIComponent(ruta)}`;
  const r = await conToken((token) =>
    fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }),
  );
  if (!r.ok && r.status !== 404) throw await fallo(r, `borrar «${clave}»`);
  return true;
}

/**
 * Ruta `gs://` para el contenedor de montaje. NO baja al navegador: solo se compone
 * dentro de la función y viaja al contenedor por variable de entorno (§2, punto 4).
 */
export function rutaGs(clave) {
  return `gs://${bucket()}/${rutaDe(clave)}`;
}

export function rutaGsCarpeta(prefijoClave) {
  return `gs://${bucket()}/${prefijo()}${prefijoClave}`;
}

/**
 * Trae a su clave definitiva un objeto que otro escribió en el almacén.
 *
 * Veo no escribe donde uno le dice: escribe DENTRO de la carpeta que se le da, y
 * el nombre del archivo lo pone él. Así que el clip aparece en un sitio que la
 * herramienta no eligió, y hay que moverlo a su clave para que el resto del
 * sistema —la hoja, el manifiesto, el montador— lo encuentre donde siempre.
 *
 * Se copia con `rewriteTo`, que es una operación del propio almacén: el archivo
 * no pasa por esta función. Un clip de varios megas atravesando una función
 * serverless con 4,5 MB de tope es justo lo que `storageUri` vino a evitar.
 */
export async function copiarDesdeGs(uriGs, clave) {
  const m = /^gs:\/\/([^/]+)\/(.+)$/.exec(String(uriGs || ''));
  if (!m) throw new Error(`No es una ruta del almacén: ${uriGs}`);
  const [, origenBucket, origenObjeto] = m;
  const destino = rutaDe(clave);

  const url =
    `${RAIZ}/storage/v1/b/${encodeURIComponent(origenBucket)}/o/${encodeURIComponent(origenObjeto)}` +
    `/rewriteTo/b/${encodeURIComponent(bucket())}/o/${encodeURIComponent(destino)}`;

  // `rewrite` puede necesitar varias vueltas con archivos grandes: mientras
  // devuelve un testigo, no ha terminado. Ignorarlo deja el clip a medias y el
  // montaje falla luego con un archivo corrupto, lejos de aquí.
  let testigo = '';
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const r = await fetch(testigo ? `${url}?rewriteToken=${encodeURIComponent(testigo)}` : url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenDeAcceso()}`, 'Content-Length': '0' },
    });
    if (!r.ok) throw await fallo(r, `copiar «${origenObjeto}» a «${clave}»`);
    const d = await r.json().catch(() => ({}));
    if (d.done !== false) return { clave, ruta: destino, bytes: Number(d.resource?.size || 0) };
    testigo = d.rewriteToken;
  }
  throw new Error(`La copia de «${clave}» no terminó tras 20 vueltas.`);
}
