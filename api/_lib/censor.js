// El censor (§2 del plano).
//
// Toda salida de la única función pasa por aquí antes de bajar al navegador. Borra
// identificadores de proyecto, correos de cuenta de servicio y nombres de almacén.
//
// Se instala sobreescribiendo `res.json` UNA sola vez, en la primera línea del
// manejador, para que no haya forma de saltárselo por olvido: quien escriba
// `res.json(...)` más abajo está censurado quiera o no.

import { cuenta } from './cuenta.js';

const OCULTO = '[oculto]';

// Tope de la plataforma serverless para el cuerpo de la RESPUESTA (§1, §6).
// Es el límite traicionero: se descubre tarde y se confunde con un tiempo agotado
// (§7.1). Por eso lo detectamos aquí y lo decimos con esas palabras.
export const TOPE_RESPUESTA = 4.5 * 1024 * 1024;

// Margen: la plataforma cuenta cabeceras además del cuerpo.
const MARGEN = 64 * 1024;

function valoresSecretos() {
  // El proyecto y el correo salen del JSON de la cuenta de servicio cuando se sube
  // así. Si el censor solo mirara las variables sueltas, dejaría pasar justo los
  // valores del camino recomendado.
  let deLaCuenta = {};
  try {
    deLaCuenta = cuenta();
  } catch {
    // Sin configurar todavía: no hay nada que censurar de ahí.
  }

  return [
    deLaCuenta.proyecto,
    deLaCuenta.correo,
    process.env.GCP_PROYECTO,
    process.env.GCP_NUMERO_PROYECTO,
    process.env.GCP_CUENTA_SERVICIO,
    process.env.ALMACEN_NOMBRE,
    process.env.MONTADOR_JOB,
  ].filter((v) => typeof v === 'string' && v.length >= 4);
}

// Formas que delatan la cuenta aunque el valor exacto no esté en el entorno.
const PATRONES = [
  /\bprojects\/[0-9]+\b/g,
  /\bprojects\/[a-z][-a-z0-9]{4,28}[a-z0-9]\b/g,
  /[\w.+-]+@[\w-]+\.iam\.gserviceaccount\.com/g,
  /gs:\/\/[^\s"'\\]+/g,
  /https:\/\/storage\.googleapis\.com\/[^\s"'\\]+/g,
  /https:\/\/[a-z0-9-]+-[0-9]{12}\.[a-z0-9-]+\.run\.app[^\s"'\\]*/g,
  // Por si alguna vez un error del proveedor devolviera de vuelta lo que se le
  // mandó. La clave privada no debería llegar nunca aquí; que no llegue nunca es
  // exactamente el motivo de tener una red debajo.
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

function escapar(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Censura un texto ya serializado. Trabaja sobre la cadena JSON completa —no sobre
 * el objeto— para alcanzar también lo anidado, lo que va dentro de arrays y lo que
 * viaja incrustado en mensajes de error del proveedor.
 *
 * El reemplazo `[oculto]` no lleva comillas ni barras, así que la cadena resultante
 * sigue siendo JSON válido.
 */
export function censurarTexto(texto) {
  let salida = texto;
  for (const secreto of valoresSecretos()) {
    salida = salida.replace(new RegExp(escapar(secreto), 'g'), OCULTO);
  }
  for (const patron of PATRONES) {
    salida = salida.replace(patron, OCULTO);
  }
  return salida;
}

/**
 * Instala el censor sobre `res.json`. Idempotente: llamarla dos veces no encadena
 * dos censores.
 *
 * Además del borrado hace de guardia de tamaño (§7.1): si la respuesta pasa del
 * tope, no la manda —eso da un tiempo agotado engañoso— sino que devuelve un error
 * que dice exactamente qué pasó y cuánto ocupaba.
 */
export function instalarCensor(res) {
  if (res.__censurado) return res;
  res.__censurado = true;

  const original = res.json.bind(res);

  res.json = (cuerpo) => {
    let crudo;
    try {
      crudo = JSON.stringify(cuerpo);
    } catch (err) {
      return original({ ok: false, error: 'No se pudo serializar la respuesta: ' + err.message });
    }

    const limpio = censurarTexto(crudo);
    const bytes = Buffer.byteLength(limpio, 'utf8');

    if (bytes > TOPE_RESPUESTA - MARGEN) {
      const mb = (bytes / 1024 / 1024).toFixed(2);
      res.status(413);
      return original({
        ok: false,
        error:
          `La respuesta ocupa ${mb} MB y el tope de la plataforma es 4,5 MB. ` +
          'No es un tiempo agotado: es el tamaño. Pide menos material en esta ' +
          'llamada (menos tomas por bloque, o una imagen más pequeña).',
        motivo: 'respuesta_demasiado_grande',
        bytes,
      });
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(limpio);
  };

  return res;
}
