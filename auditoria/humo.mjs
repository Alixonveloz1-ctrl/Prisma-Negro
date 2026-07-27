// La prueba de humo del proveedor.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ EXISTE ESTE ARCHIVO
//
// La generación de imágenes NUNCA funcionó. Ni una vez. La variable se llamaba
// `partes` y la petición decía `parts`, así que la función reventaba con
// «parts is not defined» en cuanto se la llamaba.
//
// Setenta y seis invariantes no lo cazaron, y no podían: todas MIRAN el código,
// y un identificador mal escrito dentro de una función se ve igual de bien que
// uno correcto. `node --check` tampoco lo ve: es sintaxis válida.
//
// Lo único que lo caza es LLAMAR A LA FUNCIÓN. Así que eso hace esto: llama a
// todas las puertas del proveedor, con una credencial de mentira y una red de
// mentira, y comprueba dos cosas —que no revientan, y que lo que ponen en la
// petición es lo que tiene que ir—.
//
// No gasta nada: no sale ni un byte a internet.
// ─────────────────────────────────────────────────────────────────────────────

import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'api', '_lib');

/** Una cuenta de servicio de mentira, con una clave que firma de verdad. */
function cuentaFalsa() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return JSON.stringify({
    type: 'service_account',
    project_id: 'proyecto-de-humo',
    client_email: 'humo@proyecto-de-humo.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  });
}

/** Lo que contesta cada dirección, para que cada función llegue hasta el final. */
function respuestaDe(url, cuerpo) {
  if (url.includes('oauth2')) return { access_token: 'token-de-humo', expires_in: 3600 };

  const pide = (cuerpo?.generationConfig?.responseModalities || []).join();
  if (pide.includes('IMAGE')) {
    return { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] };
  }
  if (pide.includes('AUDIO')) {
    return {
      candidates: [
        { content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: 'AAAA' } }] } },
      ],
    };
  }
  if (url.includes('predictLongRunning')) {
    return { name: 'projects/p/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/1' };
  }
  if (url.includes('fetchPredictOperation')) {
    return { done: true, response: { videos: [{ gcsUri: 'gs://b/o.mp4' }] } };
  }
  if (url.includes(':predict')) return { predictions: [{ bytesBase64Encoded: 'AAAA', mimeType: 'audio/wav' }] };
  if (url.includes('texttospeech')) return { audioContent: 'AAAA' };
  return { candidates: [{ content: { parts: [{ text: 'texto de humo' }] }, finishReason: 'STOP' }] };
}

/**
 * Llama a todas las puertas del proveedor y devuelve los fallos.
 *
 * Devuelve también las peticiones que salieron, para poder comprobar QUÉ se pidió
 * —que la imagen lleve su instrucción dentro, que el clip pida `storageUri`— y no
 * solo que no se rompió.
 */
export async function humoDelProveedor({ parche = null } = {}) {
  const antesFetch = globalThis.fetch;
  const antesEnv = { ...process.env };
  const salidas = [];
  const fallos = [];

  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = cuentaFalsa();
  process.env.GCS_BUCKET = 'almacen-de-humo';
  process.env.CLAVE_REFERENCIAS = '0'.repeat(64);

  globalThis.fetch = async (url, opciones = {}) => {
    let cuerpo = null;
    try {
      cuerpo = opciones.body ? JSON.parse(opciones.body) : null;
    } catch {
      cuerpo = { crudo: String(opciones.body).slice(0, 200) };
    }
    salidas.push({ url: String(url), cuerpo });
    return new Response(JSON.stringify(respuestaDe(String(url), cuerpo)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  // La cuenta y el token se guardan en memoria entre llamadas —para eso están—.
  // Con dos pruebas en el mismo proceso, la segunda heredaba la cuenta de la
  // primera y el error salía como «no sé en qué proyecto trabajar», que no tenía
  // nada que ver con lo que se estaba probando.
  const { olvidarCuenta } = await import('../api/_lib/cuenta.js');
  const { olvidarToken } = await import('../api/_lib/token.js');
  olvidarCuenta();
  olvidarToken();

  // Con `parche` se prueba una versión AVERIADA del proveedor, que es como se
  // demuestra que esta prueba sirve para algo. La copia va al lado del original
  // para que sus importaciones relativas —el token, la cuenta— sigan resolviendo.
  let copia = null;
  try {
    let ruta = '../api/_lib/proveedor.js';
    if (parche) {
      copia = join(LIB, '_humo-proveedor.js');
      writeFileSync(copia, parche(readFileSync(join(LIB, 'proveedor.js'), 'utf8')));
      ruta = '../api/_lib/_humo-proveedor.js';
    }
    // Se importa DESPUÉS de poner el entorno: el proveedor lee la cuenta al usarla.
    const prov = await import(`${ruta}?humo=${Date.now()}`);

    const puertas = [
      ['texto', () => prov.texto({ instruccion: 'hola' })],
      ['imagen', () => prov.imagen({ instruccion: 'una calle de noche' })],
      [
        'imagen con referencia',
        () => prov.imagen({ instruccion: 'la misma calle', referencias: [{ tipo: 'image/jpeg', datos: 'AAAA' }] }),
      ],
      ['video.iniciar', () => prov.videoIniciar({ instruccion: 'anima esto', carpetaGs: 'gs://b/c/' })],
      ['voz de Gemini', () => prov.vozGemini({ texto: 'hola', nombreVoz: 'gemini:Kore' })],
      ['voz de Cloud', () => prov.voz({ texto: 'hola', nombreVoz: 'es-US-Neural2-B' })],
      ['musica', () => prov.musica({ instruccion: 'cuerdas graves' })],
    ];

    for (const [nombre, llamar] of puertas) {
      try {
        await llamar();
      } catch (e) {
        // Un fallo de red simulada no cuenta; un fallo del CÓDIGO sí. Y son
        // distinguibles: los del código son ReferenceError y TypeError.
        const roto = e instanceof ReferenceError || e instanceof TypeError;
        fallos.push(`${nombre}: ${roto ? 'REVIENTA — ' : ''}${e.message}`);
      }
    }

    // Y la consulta del clip, que necesita el identificador cifrado de la anterior.
    try {
      const op = await prov.videoIniciar({ instruccion: 'x', carpetaGs: 'gs://b/c/' });
      await prov.videoConsultar(op.operacion);
    } catch (e) {
      fallos.push(`video.consultar: ${e.message}`);
    }
  } catch (e) {
    fallos.push(`no se pudo ni cargar el proveedor: ${e.message}`);
  } finally {
    if (copia) rmSync(copia, { force: true });
    olvidarCuenta();
    olvidarToken();
    globalThis.fetch = antesFetch;
    for (const k of Object.keys(process.env)) if (!(k in antesEnv)) delete process.env[k];
    Object.assign(process.env, antesEnv);
  }

  return { fallos, salidas };
}
