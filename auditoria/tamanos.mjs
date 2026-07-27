// ¿Cabe la respuesta? La prueba que se hace midiendo, no razonando.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ EXISTE ESTE ARCHIVO
//
// «La respuesta ocupa 9.14 MB y el tope de la plataforma es 4,5 MB.» La imagen
// se generó bien, se guardó bien, y el viaje de vuelta la tiró. Se había pagado.
//
// Ese fallo no se ve leyendo el código: se ve PESANDO lo que sale. Así que esto
// llama a la puerta de verdad —`api/ia.js`, con su censor y su comprobación de
// tamaño puestos— con material del tamaño que tiene el de verdad, y mide la
// respuesta de cada modo.
//
// Los tamaños de referencia, todos reales:
//   · imagen de 2K en PNG   → ~6,8 MB  (9,1 MB en base64)
//   · clip de 8 s a 1080p   → ~35 MB
//   · bloque de voz de 45 s → ~2,1 MB en PCM
//
// Si un modo devuelve algo de ese tamaño, no cabe, y hay que bajarlo por trozos.
// ─────────────────────────────────────────────────────────────────────────────

import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'api');

const MB = 1024 * 1024;
export const TOPE = 4.5 * MB;

/** Tamaños de material real, para que la medida signifique algo. */
export const REALES = {
  imagen2K: Math.round(6.8 * MB),
  clip8s: 35 * MB,
  voz45s: Math.round(2.1 * MB),
  musica30s: Math.round(2.6 * MB),
};

function cuentaFalsa() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return JSON.stringify({
    type: 'service_account',
    project_id: 'proyecto-de-tamanos',
    client_email: 'x@proyecto-de-tamanos.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  });
}

const relleno = (bytes) => 'A'.repeat(Math.ceil((bytes * 4) / 3));

/**
 * Pasa cada modo por la puerta con material de tamaño real y mide la respuesta.
 *
 * Devuelve una fila por modo: cuánto ocupó y si cabe.
 */
export async function medirRespuestas(soloEstos = null, { parche = null } = {}) {
  const antesFetch = globalThis.fetch;
  const antesEnv = { ...process.env };

  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = cuentaFalsa();
  process.env.GCS_BUCKET = 'almacen';
  process.env.CLAVE_ACCESO = 'x';
  process.env.CLAVE_REFERENCIAS = '0'.repeat(64);

  // La nube de mentira devuelve material del tamaño del de verdad.
  globalThis.fetch = async (url, opciones = {}) => {
    const u = String(url);
    // El cuerpo del token va en formulario, no en JSON: parsear a ciegas reventaba.
    let cuerpo = null;
    try {
      cuerpo = opciones.body ? JSON.parse(String(opciones.body)) : null;
    } catch {
      cuerpo = null;
    }
    const dar = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });

    if (u.includes('oauth2')) return dar({ access_token: 't', expires_in: 3600 });
    // El almacén: subir confirma, bajar sirve el trozo que le pidan.
    if (u.includes('/upload/storage/')) return dar({ name: 'x', size: String(REALES.imagen2K) });
    if (u.includes('alt=media')) {
      const rango = /bytes=(\d+)-(\d+)/.exec(opciones.headers?.Range || '');
      const ini = rango ? Number(rango[1]) : 0;
      const fin = rango ? Number(rango[2]) : REALES.imagen2K - 1;
      const trozo = Math.min(fin, REALES.imagen2K - 1) - ini + 1;
      return new Response(Buffer.alloc(Math.max(0, trozo)), {
        status: 206,
        headers: { 'Content-Range': `bytes ${ini}-${fin}/${REALES.imagen2K}`, 'Content-Type': 'image/png' },
      });
    }
    if (u.includes('/storage/v1/b/')) return dar({ name: 'x', size: String(REALES.imagen2K) });

    const pide = (cuerpo?.generationConfig?.responseModalities || []).join();
    if (pide.includes('IMAGE')) {
      return dar({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: relleno(REALES.imagen2K) } }] } }] });
    }
    if (pide.includes('AUDIO')) {
      return dar({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: relleno(REALES.voz45s) } }] } }] });
    }
    if (u.includes('predictLongRunning')) {
      return dar({ name: 'projects/p/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/1' });
    }
    if (u.includes('fetchPredictOperation')) return dar({ done: true, response: { videos: [{ gcsUri: 'gs://b/o.mp4' }] } });
    if (u.includes(':predict')) return dar({ predictions: [{ bytesBase64Encoded: relleno(REALES.musica30s), mimeType: 'audio/wav' }] });
    if (u.includes('texttospeech')) return dar({ audioContent: relleno(REALES.voz45s) });
    return dar({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] });
  };

  // La cuenta y el token se guardan en memoria entre llamadas —para eso están—.
  // Con dos pruebas en el mismo proceso, la segunda heredaba la cuenta de la
  // primera y el error salía como «no sé en qué proyecto trabajar», que no tenía
  // nada que ver con lo que se estaba probando.
  const { olvidarCuenta } = await import('../api/_lib/cuenta.js');
  const { olvidarToken } = await import('../api/_lib/token.js');
  olvidarCuenta();
  olvidarToken();

  const filas = [];
  // Con `parche` se mide una puerta AVERIADA, que es como se demuestra que esta
  // medición sirve. La copia va dentro de `api/` para que sus importaciones
  // relativas a `_lib` sigan resolviendo.
  let copia = null;
  try {
    let ruta = '../api/ia.js';
    if (parche) {
      copia = join(API, '_tamanos-ia.js');
      writeFileSync(copia, parche(readFileSync(join(API, 'ia.js'), 'utf8')));
      ruta = '../api/_tamanos-ia.js';
    }
    const { default: handler } = await import(`${ruta}?tam=${Date.now()}`);

    const casos = [
      ['imagen', { modo: 'imagen', instruccion: 'x', guardarEn: 'p01/t000/img' }],
      ['video.iniciar', { modo: 'video.iniciar', instruccion: 'x', guardarEn: 'p01/t000/vid' }],
      ['musica', { modo: 'musica', instruccion: 'x', guardarEn: 'p01/mus/000' }],
      ['voz', { modo: 'voz', texto: 'x', nombreVoz: 'gemini:Kore' }],
      ['bajar', { modo: 'bajar', clave: 'p01/t000/img', desde: 0 }],
    ];

    for (const [nombre, cuerpo] of casos.filter((c) => !soloEstos || soloEstos.includes(c[0]))) {
      const res = respuestaDeMentira();
      await handler({ method: 'POST', body: { ...cuerpo, acceso: 'x' } }, res);
      filas.push({
        modo: nombre,
        estado: res.codigo,
        bytes: res.bytes,
        cabe: res.bytes <= TOPE,
        error: res.cuerpo?.ok === false ? String(res.cuerpo.error).slice(0, 120) : '',
      });
    }
  } finally {
    if (copia) rmSync(copia, { force: true });
    olvidarCuenta();
    olvidarToken();
    globalThis.fetch = antesFetch;
    for (const k of Object.keys(process.env)) if (!(k in antesEnv)) delete process.env[k];
    Object.assign(process.env, antesEnv);
  }
  return filas;
}

/** Lo mínimo de una respuesta de Vercel, y que además se pesa sola. */
function respuestaDeMentira() {
  return {
    codigo: 0,
    bytes: 0,
    cuerpo: null,
    cabeceras: {},
    setHeader(k, v) {
      this.cabeceras[k] = v;
    },
    status(c) {
      this.codigo = c;
      return this;
    },
    json(o) {
      // El censor reescribe `json` y acaba llamando a `send` con el texto ya
      // limpio. Se mide LO QUE SALE POR AHÍ, que es lo que viaja de verdad.
      this.cuerpo = o;
      this.bytes = Buffer.byteLength(JSON.stringify(o), 'utf8');
      return this;
    },
    send(texto) {
      this.bytes = Buffer.byteLength(String(texto), 'utf8');
      try {
        this.cuerpo = JSON.parse(String(texto));
      } catch {
        this.cuerpo = { crudo: String(texto).slice(0, 200) };
      }
      return this;
    },
    end() {
      return this;
    },
  };
}
