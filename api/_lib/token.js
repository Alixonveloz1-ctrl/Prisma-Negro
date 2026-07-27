// El token (§2 del plano).
//
// La función es la única pieza del sistema que tiene la credencial. Firma un JWT
// con la clave privada de la cuenta de servicio y lo canjea por un token de acceso.
//
// El token se guarda en memoria del proceso hasta poco antes de que caduque. En
// serverless eso significa "mientras dure esta instancia caliente": no es una caché
// compartida, y no hace falta que lo sea.

import { createSign } from 'node:crypto';

const OAUTH = 'https://oauth2.googleapis.com/token';
const AMBITO = 'https://www.googleapis.com/auth/cloud-platform';

let cacheToken = null;
let cacheVence = 0;

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function clavePrivada() {
  const pem = process.env.GCP_CLAVE_PRIVADA;
  if (!pem) throw new Error('Falta GCP_CLAVE_PRIVADA en el entorno.');
  // En el panel de la plataforma la clave se pega en una sola línea con \n
  // escapados. Aquí se deshace ese escape.
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
}

export async function tokenDeAcceso() {
  const ahora = Math.floor(Date.now() / 1000);
  if (cacheToken && ahora < cacheVence - 60) return cacheToken;

  const correo = process.env.GCP_CUENTA_SERVICIO;
  if (!correo) throw new Error('Falta GCP_CUENTA_SERVICIO en el entorno.');

  const cabecera = base64url({ alg: 'RS256', typ: 'JWT' });
  const cuerpo = base64url({
    iss: correo,
    scope: AMBITO,
    aud: OAUTH,
    iat: ahora,
    exp: ahora + 3600,
  });

  const firmador = createSign('RSA-SHA256');
  firmador.update(`${cabecera}.${cuerpo}`);
  const firma = firmador.sign(clavePrivada(), 'base64url');
  const jwt = `${cabecera}.${cuerpo}.${firma}`;

  const r = await fetch(OAUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const datos = await r.json().catch(() => ({}));
  if (!r.ok || !datos.access_token) {
    throw new Error(
      'La cuenta de servicio no pudo obtener un token. ' +
        'Revisa GCP_CUENTA_SERVICIO y GCP_CLAVE_PRIVADA. ' +
        (datos.error_description || datos.error || `HTTP ${r.status}`),
    );
  }

  cacheToken = datos.access_token;
  cacheVence = ahora + (datos.expires_in || 3600);
  return cacheToken;
}

/** Olvida el token guardado. Para cuando el proveedor responde 401. */
export function olvidarToken() {
  cacheToken = null;
  cacheVence = 0;
}
