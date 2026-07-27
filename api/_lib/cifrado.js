// Referencias opacas cifradas (§2, §6 del plano).
//
// Dos cosas distintas usan esto, por la misma razón:
//
//  - Las rutas del almacén. El navegador nunca ve una URL del almacén: recibe una
//    referencia opaca que solo la función sabe traducir.
//  - Los identificadores de operación larga. Llevan dentro el identificador del
//    proyecto; el censor los borraría y la consulta siguiente fallaría con un error
//    incomprensible (§6). Cifrarlos en vez de censurarlos es la solución: el texto
//    cifrado no contiene el secreto, así que el censor lo deja pasar intacto.
//
// AES-256-GCM: además de ocultar, autentica. Una referencia manipulada no descifra,
// no se convierte en otra ruta.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIJO = 'ref_';

function clave() {
  const hex = process.env.CLAVE_REFERENCIAS;
  if (!hex) {
    throw new Error(
      'Falta CLAVE_REFERENCIAS en el entorno. Genérala con: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  const buf = Buffer.from(hex.trim(), 'hex');
  if (buf.length !== 32) {
    throw new Error('CLAVE_REFERENCIAS debe ser de 32 bytes en hexadecimal (64 caracteres).');
  }
  return buf;
}

export function cifrar(texto) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave(), iv);
  const cuerpo = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return PREFIJO + Buffer.concat([iv, tag, cuerpo]).toString('base64url');
}

export function descifrar(referencia) {
  const s = String(referencia || '');
  if (!s.startsWith(PREFIJO)) {
    throw new Error('Esto no es una referencia de las nuestras.');
  }
  const bruto = Buffer.from(s.slice(PREFIJO.length), 'base64url');
  if (bruto.length < 28) throw new Error('Referencia truncada.');
  const iv = bruto.subarray(0, 12);
  const tag = bruto.subarray(12, 28);
  const cuerpo = bruto.subarray(28);
  const d = createDecipheriv('aes-256-gcm', clave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(cuerpo), d.final()]).toString('utf8');
}

export function esReferencia(v) {
  return typeof v === 'string' && v.startsWith(PREFIJO);
}
