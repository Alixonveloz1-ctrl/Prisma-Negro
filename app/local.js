// La copia local (IndexedDB).
//
// §1: «Todo lo generado es del usuario y vive en su propia nube. El almacén es la
// única fuente de verdad. El navegador tiene una COPIA, no el original.»
//
// Esto es esa copia. Sirve para que la herramienta arranque instantánea y para
// poder seguir trabajando con mala conexión. Si se pierde, no se ha perdido nada:
// se recupera del almacén.
//
// §6: los materiales se guardan como BLOBS. Un empaquetado de una pieza completa
// son casi dos gigas; si se materializan en memoria de JavaScript, el navegador del
// teléfono recarga la página a media descarga. IndexedDB los respalda en disco.

const BASE = 'prisma-negro';
const VERSION = 1;
const PROYECTOS = 'proyectos';
const MATERIALES = 'materiales';

let db = null;

function abrir() {
  if (db) return Promise.resolve(db);
  return new Promise((res, rej) => {
    const pet = indexedDB.open(BASE, VERSION);
    pet.onupgradeneeded = () => {
      const d = pet.result;
      if (!d.objectStoreNames.contains(PROYECTOS)) d.createObjectStore(PROYECTOS, { keyPath: 'id' });
      if (!d.objectStoreNames.contains(MATERIALES)) d.createObjectStore(MATERIALES);
    };
    pet.onsuccess = () => {
      db = pet.result;
      res(db);
    };
    pet.onerror = () => rej(new Error('No se pudo abrir la base local del navegador.'));
  });
}

function transaccion(almacen, modo, hacer) {
  return abrir().then(
    (d) =>
      new Promise((res, rej) => {
        const tx = d.transaction(almacen, modo);
        const st = tx.objectStore(almacen);
        let salida;
        try {
          salida = hacer(st);
        } catch (e) {
          rej(e);
          return;
        }
        tx.oncomplete = () => res(salida?.result !== undefined ? salida.result : salida);
        tx.onerror = () => rej(tx.error || new Error('Falló la base local.'));
      }),
  );
}

export const guardarProyecto = (p) => transaccion(PROYECTOS, 'readwrite', (st) => st.put(p));
export const leerProyecto = (id) => transaccion(PROYECTOS, 'readonly', (st) => st.get(id));
export const listarProyectos = () => transaccion(PROYECTOS, 'readonly', (st) => st.getAll());
export const borrarProyecto = (id) => transaccion(PROYECTOS, 'readwrite', (st) => st.delete(id));

/** Los materiales se guardan como Blob: respaldados en disco, no en memoria (§6). */
export const guardarMaterial = (clave, blob) =>
  transaccion(MATERIALES, 'readwrite', (st) => st.put(blob, clave));
export const leerMaterial = (clave) => transaccion(MATERIALES, 'readonly', (st) => st.get(clave));
export const borrarMaterial = (clave) => transaccion(MATERIALES, 'readwrite', (st) => st.delete(clave));
export const clavesMateriales = () => transaccion(MATERIALES, 'readonly', (st) => st.getAllKeys());

/** Cuánto ocupa la copia local. Útil antes de bajar una pieza entera al teléfono. */
export async function espacio() {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usado: e.usage, disponible: e.quota };
}
