// La cuenta de servicio, resuelta en un solo sitio.
//
// El JSON que descarga Google YA TRAE dentro el identificador del proyecto, el
// correo de la cuenta y la clave privada. Pedir esos tres por separado es hacerle
// copiar tres veces lo que ya tiene en un archivo, y en un teléfono cada copiado a
// mano es una oportunidad de pegar media clave.
//
// Así que se sube el JSON entero en UNA variable y de ahí sale todo.
//
// Se admiten también las variables sueltas, por si alguien prefiere separarlas o
// viene de una configuración antigua. Pero el camino recomendado —y el que sale en
// la documentación— es el JSON.
//
// Este módulo es el ÚNICO que decide de dónde salen esos tres valores. Si mañana hay
// una tercera forma, se añade aquí y en ningún otro sitio.

import { leer as leerEntorno } from './entorno.js';

let cache = null;

function leer() {
  if (cache) return cache;

  const { valor: bruto, nombre } = leerEntorno('cuenta');
  if (bruto) {
    let j;
    try {
      j = JSON.parse(bruto);
    } catch {
      throw new Error(
        `${nombre} no es JSON válido. Pega el contenido completo del archivo de la ` +
          'cuenta de servicio, desde la primera llave hasta la última.',
      );
    }
    if (!j.private_key || !j.client_email) {
      throw new Error(
        `${nombre} no parece el archivo de una cuenta de servicio: le faltan ` +
          '«private_key» o «client_email».',
      );
    }
    cache = {
      proyecto: j.project_id || leerEntorno('proyecto').valor,
      correo: j.client_email,
      clave: j.private_key,
      origen: nombre,
    };
    return cache;
  }

  // Las tres piezas por separado. Sigue funcionando.
  cache = {
    proyecto: leerEntorno('proyecto').valor,
    correo: leerEntorno('correo').valor,
    clave: leerEntorno('clave').valor,
    origen: 'variables sueltas',
  };
  return cache;
}

export const cuenta = () => leer();

export function proyecto() {
  const p = leer().proyecto;
  if (!p) {
    throw new Error(
      'No sé en qué proyecto de la nube trabajar. Sube el JSON de la cuenta de ' +
        'servicio en GCP_CUENTA_JSON (trae el proyecto dentro).',
    );
  }
  return p;
}

export function correo() {
  const c = leer().correo;
  if (!c) throw new Error('Falta el correo de la cuenta de servicio. Sube el JSON en GCP_CUENTA_JSON.');
  return c;
}

/**
 * La clave privada en PEM.
 *
 * Cuando viene del JSON ya trae los saltos de línea escapados como \n, igual que
 * cuando se pega a mano en el panel. Se deshace el escape en los dos casos.
 */
export function clavePrivada() {
  const pem = leer().clave;
  if (!pem) throw new Error('Falta la clave privada. Sube el JSON en GCP_CUENTA_JSON.');
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
}

/** Para las pruebas y para que el censor sepa qué borrar. */
export function olvidarCuenta() {
  cache = null;
}
