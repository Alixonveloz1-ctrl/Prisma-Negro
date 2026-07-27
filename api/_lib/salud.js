// La prueba de la cadena (§1 del plano).
//
//   «El usuario no lee registros de la nube desde el teléfono. Cualquier fallo tiene
//    que explicarse en pantalla, con palabras. Un código de salida no es un mensaje.»
//
// Comprobar que una variable de entorno EXISTE no comprueba nada: pegando una clave
// PEM de varias líneas desde un teléfono, lo normal es que exista y esté mal. Esto
// prueba los cuatro eslabones de verdad, en orden, y cuando uno falla dice cuál es y
// QUÉ HACER — que es la diferencia entre arreglarlo en un minuto y pasar la tarde
// mirando una pantalla que dice «error».
//
// Se para en el primer eslabón roto a propósito: sin token, los tres siguientes
// fallarían todos y darían cuatro mensajes para un solo problema.

import { tokenDeAcceso, olvidarToken } from './token.js';
import { clavePrivada, proyecto, olvidarCuenta } from './cuenta.js';
import { valor as valorEntorno, nombrePrincipal } from './entorno.js';

const RAIZ_ALMACEN = 'https://storage.googleapis.com/storage/v1';

const paso = (nombre, ok, dice, arregla) => ({ paso: nombre, ok, dice, ...(arregla ? { arregla } : {}) });

export async function probarCadena() {
  const pasos = [];

  // Lo primero de todo: olvidar lo leído antes. Una instancia serverless caliente
  // guarda la cuenta y el token de la petición anterior, y justo después de cambiar
  // una variable eso haría que el diagnóstico dijera que todo va bien sobre la
  // configuración VIEJA — que es la peor forma posible de fallar.
  olvidarCuenta();
  olvidarToken();

  // ── 1. La forma de la clave ────────────────────────────────────────────────
  // Antes de gastar una llamada: la mayoría de los fallos de aquí son un pegado
  // incompleto, y eso se ve sin salir del proceso.
  const forma = revisarFormaDeLaClave();
  pasos.push(forma);
  if (!forma.ok) return pasos;

  // ── 2. La credencial ───────────────────────────────────────────────────────
  let token;
  try {
    token = await tokenDeAcceso();
    pasos.push(paso('credencial', true, 'La cuenta de servicio firma y obtiene un token.'));
  } catch (e) {
    return [
      ...pasos,
      paso(
        'credencial',
        false,
        `La cuenta de servicio no consigue token: ${e.message}`,
        'Si la clave se creó hace un momento, espera un minuto: tarda en propagarse. ' +
          'Si no, crea una clave nueva para la misma cuenta de servicio y vuelve a pegarla ' +
          'entera, desde -----BEGIN hasta -----END-----.',
      ),
    ];
  }

  // ── 3. El almacén ──────────────────────────────────────────────────────────
  // Pregunta por el bucket: comprueba de una vez que existe Y que esta cuenta
  // tiene permiso sobre él.
  try {
    const b = valorEntorno('bucket');
    const r = await fetch(`${RAIZ_ALMACEN}/b/${encodeURIComponent(b)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      const meta = await r.json();
      pasos.push(
        paso('almacen', true, `El almacén responde y la cuenta tiene acceso (${meta.location || 'ubicación desconocida'}).`),
      );
    } else if (r.status === 404) {
      pasos.push(
        paso('almacen', false, 'El almacén no existe con ese nombre.', `Revisa ${nombrePrincipal('bucket')} letra por letra.`),
      );
    } else if (r.status === 403) {
      pasos.push(
        paso(
          'almacen',
          false,
          'El almacén existe pero esta cuenta de servicio no tiene permiso.',
          'Dale a la cuenta el rol de administrador de objetos sobre ese bucket.',
        ),
      );
    } else {
      const d = await r.json().catch(() => ({}));
      pasos.push(paso('almacen', false, `El almacén respondió ${r.status}: ${d?.error?.message || 'sin detalle'}.`));
    }
  } catch (e) {
    pasos.push(paso('almacen', false, `No se pudo hablar con el almacén: ${e.message}`));
  }

  // ── 4. El proveedor de IA ──────────────────────────────────────────────────
  // Una llamada mínima de verdad. Preguntar por el catálogo no prueba que el
  // modelo configurado exista ni que esta cuenta pueda usarlo.
  try {
    const region = valorEntorno('regionIA', 'us-central1');
    const modelo = process.env.MODELO_TEXTO || 'gemini-2.5-pro';
    const url =
      `https://${region}-aiplatform.googleapis.com/v1/projects/${proyecto()}` +
      `/locations/${region}/publishers/google/models/${modelo}:generateContent`;

    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'ok' }] }],
        generationConfig: { maxOutputTokens: 1, temperature: 0 },
      }),
    });

    if (r.ok) {
      pasos.push(paso('modelos', true, `El modelo de texto responde (${modelo}).`));
    } else {
      const d = await r.json().catch(() => ({}));
      const msg = d?.error?.message || `HTTP ${r.status}`;
      pasos.push(
        paso(
          'modelos',
          false,
          `El proveedor de IA rechazó la llamada: ${msg}`,
          r.status === 403
            ? 'Falta el rol de usuario de Vertex AI en la cuenta de servicio, o la API no está activada.'
            : r.status === 404
              ? `El modelo «${modelo}» no existe en la región ${region}. Cambia MODELO_TEXTO o la región.`
              : undefined,
        ),
      );
    }
  } catch (e) {
    pasos.push(paso('modelos', false, `No se pudo hablar con el proveedor de IA: ${e.message}`));
  }

  // ── 5. El montador ─────────────────────────────────────────────────────────
  // Ya no hace falta configurarlo: tiene nombre por defecto. Se comprueba si está
  // desplegado con ese nombre. No hace falta para generar, solo para montar, así
  // que se informa sin dramatizar.
  {
    try {
      const region = valorEntorno('regionJob', 'us-central1');
      const url =
        `https://run.googleapis.com/v2/projects/${proyecto()}` +
        `/locations/${region}/jobs/${valorEntorno('job', 'prisma-negro-montador')}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        pasos.push(paso('montador', true, 'El contenedor de montaje está desplegado y visible.'));
      } else if (r.status === 404) {
        pasos.push(
          paso('montador', false, 'El contenedor de montaje no está desplegado con ese nombre.', `Revisa ${nombrePrincipal('job')} y que el job esté en la región ${region}.`),
        );
      } else {
        const d = await r.json().catch(() => ({}));
        pasos.push(paso('montador', false, `Cloud Run respondió ${r.status}: ${d?.error?.message || 'sin detalle'}.`));
      }
    } catch (e) {
      pasos.push(paso('montador', false, `No se pudo consultar el montador: ${e.message}`));
    }
  }

  return pasos;
}

/**
 * La forma de la clave privada, sin salir del proceso.
 *
 * Es el fallo más común al configurar desde un teléfono: se pega media clave, o se
 * pega con las comillas del JSON, o se pierde el final. Todos esos casos dan un
 * error de firma críptico más adelante; aquí se dicen por su nombre.
 */
function revisarFormaDeLaClave() {
  let pem;
  try {
    // Sale del JSON entero si se subió así, o de la variable suelta si no.
    pem = clavePrivada();
  } catch (e) {
    return paso('clave', false, e.message, 'Sube el archivo JSON de la cuenta de servicio en GCP_CUENTA_JSON.');
  }
  if (!pem) {
    return paso('clave', false, 'No hay clave privada configurada.', 'Sube el JSON de la cuenta de servicio en GCP_CUENTA_JSON.');
  }

  if (!pem.includes('-----BEGIN')) {
    return paso(
      'clave',
      false,
      'La clave no empieza por -----BEGIN PRIVATE KEY-----.',
      'Copia el valor de private_key ENTERO, incluidas las líneas BEGIN y END.',
    );
  }
  if (!pem.includes('-----END')) {
    return paso(
      'clave',
      false,
      'La clave está cortada: falta la línea -----END PRIVATE KEY-----.',
      'Al pegar desde el móvil es fácil dejarse el final. Pégala otra vez completa.',
    );
  }
  if (pem.trim().startsWith('"') || pem.trim().endsWith('"')) {
    return paso(
      'clave',
      false,
      'La clave lleva las comillas del JSON pegadas.',
      'Quita la comilla del principio y la del final: solo va el contenido.',
    );
  }
  // Una clave RSA de 2048 bits en PEM ronda los 1.700 caracteres. Bastante menos
  // que eso significa que se pegó un trozo.
  if (pem.replace(/\s/g, '').length < 800) {
    return paso(
      'clave',
      false,
      'La clave es demasiado corta: parece un trozo, no la clave entera.',
      'Vuelve a pegar el valor completo de private_key.',
    );
  }

  return paso('clave', true, 'La clave privada tiene la forma correcta.');
}
