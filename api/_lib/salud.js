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
import { PREDETERMINADO, grafiasDe, etiquetaDe, regionDe } from '../../comun/modelos.mjs';
import { rutaDeModelo } from './proveedor.js';

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
    // Se prueba EL MISMO director que va a escribir, con las mismas grafías, en el
    // mismo orden Y POR LA MISMA FUNCIÓN QUE COMPONE LA DIRECCIÓN.
    //
    // Esto último es la lección: el arreglo de la región se aplicó en el proveedor
    // y aquí quedó una dirección compuesta a mano con la región fija. El
    // diagnóstico salió en rojo diciendo que gemini-3.1-pro no existe en
    // us-central1 —cierto— cuando el proveedor ya lo pedía bien en global. Dos
    // sitios componiendo la misma dirección son dos sitios que hay que arreglar, y
    // solo se arregla el que uno recuerda.
    const eleccion = process.env.MODELO_TEXTO || PREDETERMINADO.texto;
    const grafias = grafiasDe('texto', eleccion);

    let r;
    let modelo = grafias[0];
    for (const id of grafias) {
      modelo = id;
      r = await fetch(`${rutaDeModelo(id)}:generateContent`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Goog-User-Project': proyecto(),
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'ok' }] }],
          generationConfig: { maxOutputTokens: 1, temperature: 0 },
        }),
      });
      if (r.ok || (r.status !== 404 && r.status !== 403)) break;
    }

    if (r.ok) {
      pasos.push(paso('modelos', true, `${etiquetaDe('texto', eleccion)} responde (${modelo}).`));
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
              ? `Ninguna grafía de «${etiquetaDe('texto', eleccion)}» contesta en ${regionDe(modelo, valorEntorno('regionIA', 'us-central1'))}. ` +
                'Se probaron: ' + grafias.join(', ') + '. Elige otro director en Ajustes.'
              : undefined,
        ),
      );
    }
  } catch (e) {
    pasos.push(paso('modelos', false, `No se pudo hablar con el proveedor de IA: ${e.message}`));
  }

  // ── 4b. LA CUOTA DEL GENERADOR DE IMÁGENES ─────────────────────────────────
  //
  // ───────────────────────────────────────────────────────────────────────────
  // «Lleva media hora ahí y no avanza. Ni genera nada.»
  //
  // El paso de arriba prueba el modelo de TEXTO, y el de texto iba bien: los casos
  // se escribían, el guion se escribía. Lo que estaba muerto era la IMAGEN, y este
  // diagnóstico decía que todo estaba correcto. Un diagnóstico que da luz verde
  // mientras la fase más usada no puede generar nada es peor que no tenerlo.
  //
  // Y SE PRUEBA SIN GENERAR NADA, que es lo que lo hace utilizable: se manda una
  // petición deliberadamente VACÍA al modelo de imagen. Vertex contesta antes de
  // generar, y el código dice exactamente lo que hace falta saber:
  //
  //   400  → la cuenta puede llamar al modelo y hay cuota. La petición está mal
  //          A PROPÓSITO: eso es lo que se buscaba, y no cuesta un céntimo.
  //   429  → LA CUOTA ESTÁ AGOTADA. Es esto, y en tres segundos en vez de media
  //          hora mirando una barra parada.
  //   403  → la cuenta no puede usar ese modelo, o la API no está activada.
  //   404  → ese modelo no existe en esa región.
  // ───────────────────────────────────────────────────────────────────────────
  try {
    const eleccion = process.env.MODELO_IMAGEN || PREDETERMINADO.imagen;
    const grafias = grafiasDe('imagen', eleccion);
    let r;
    let modelo = grafias[0];
    for (const id of grafias) {
      modelo = id;
      r = await fetch(`${rutaDeModelo(id)}:generateContent`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Goog-User-Project': proyecto(),
        },
        // Sin `contents`: la petición es inválida a propósito y no genera nada.
        body: JSON.stringify({}),
      });
      if (r.status !== 404 && r.status !== 403) break;
    }
    const d = await r.json().catch(() => ({}));
    const msg = d?.error?.message || `HTTP ${r.status}`;

    if (r.status === 400) {
      pasos.push(paso('imagen', true, `${etiquetaDe('imagen', eleccion)} acepta llamadas y tiene cuota (${modelo}).`));
    } else if (r.status === 429) {
      // UN 429 AQUÍ CASI NUNCA ES «NO TE QUEDA CUOTA».
      //
      // ─────────────────────────────────────────────────────────────────────────
      // «¿Cómo se supone que la cuota va a ser cero si ya generó un capítulo
      //  entero?» Exacto, y el diagnóstico lo decía igual.
      //
      // Esta petición va VACÍA a propósito: no genera ni una imagen, así que no
      // puede gastar cuota de imágenes. Si Google contesta 429 es el LIMITADOR DE
      // RITMO —peticiones por minuto—, que es justo lo que salta después de
      // generar noventa y siete imágenes seguidas. Decir «la cuota está agotada» y
      // mandar a pedir cuota es mandar a arreglar lo que no está roto.
      //
      // Así que manda lo que dice Google, no lo que suponemos: si su mensaje habla
      // de minutos, se pasa solo; si habla de día o de límite cero, entonces sí.
      // ─────────────────────────────────────────────────────────────────────────
      const porMinuto = /per minute|por minuto|per-minute/i.test(msg);
      const porDia = /per day|por d[ií]a|limit: ?0|quota_limit_value.{0,20}["']?0["']?/i.test(msg);
      pasos.push(
        paso(
          'imagen',
          false,
          porMinuto || !porDia
            ? `Google está limitando el ritmo ahora mismo (429). Dice: ${msg}`
            : `La cuota diaria del generador de imágenes está agotada. Google dice: ${msg}`,
          porMinuto || !porDia
            ? 'Es un tope POR MINUTO y se abre solo: espera un minuto y vuelve a mirar. ' +
              'Salta justo después de generar muchas imágenes seguidas, y no significa que ' +
              'te hayas quedado sin cuota — si ya has generado en este proyecto, cuota hay. ' +
              'Solo si el mensaje llega a decir «per day» o «limit: 0» hay que pedir más.'
            : 'Esta sí hay que pedirla: Google Cloud → IAM y administración → Cuotas, buscar ' +
              'el modelo, y comprobar que el proyecto tiene facturación activada. Esperar no ' +
              'lo arregla. Vuelve mañana o pide el aumento.',
        ),
      );
    } else if (r.status === 403) {
      pasos.push(
        paso('imagen', false, `La cuenta no puede usar el generador de imágenes: ${msg}`,
          'Falta el rol de usuario de Vertex AI, o la API de Vertex no está activada en ESTE proyecto.'),
      );
    } else if (r.status === 404) {
      pasos.push(
        paso('imagen', false, `Ninguna grafía de «${etiquetaDe('imagen', eleccion)}» contesta. Se probaron: ${grafias.join(', ')}.`,
          'Elige otro generador de imagen en Ajustes.'),
      );
    } else if (r.ok) {
      // No debería pasar —la petición iba vacía— pero si contesta, hay cuota.
      pasos.push(paso('imagen', true, `${etiquetaDe('imagen', eleccion)} responde (${modelo}).`));
    } else {
      pasos.push(paso('imagen', false, `El generador de imágenes respondió ${r.status}: ${msg}`));
    }
  } catch (e) {
    pasos.push(paso('imagen', false, `No se pudo probar el generador de imágenes: ${e.message}`));
  }

  // ── 5. El montador ─────────────────────────────────────────────────────────
  // Ya no hace falta configurarlo: tiene nombre por defecto. Se comprueba si está
  // desplegado con ese nombre. No hace falta para generar, solo para montar, así
  // que se informa sin dramatizar.
  {
    try {
      const region = valorEntorno('regionJob', 'us-central1');
      // EL NOMBRE QUE SE BUSCA, DICHO CON TODAS LAS LETRAS.
      //
      // Decía «no está desplegado con ese nombre» y «revisa CLOUD_RUN_JOB», sin
      // decir NUNCA qué nombre ni en qué proyecto. Con eso no se puede comprobar
      // nada desde un teléfono: «¿cómo va a saber mi cuenta lo del montador, si
      // ese montador era de otra cuenta?». Pues eso es exactamente lo que hay que
      // poder leer de un vistazo — el job que se busca, dónde se busca, y que el
      // nombre se puede cambiar.
      const job = valorEntorno('job', 'prisma-negro-montador');
      // DE DÓNDE SALE EL NOMBRE, porque el nombre sale TAPADO.
      //
      // El censor borra el id del proyecto de toda respuesta, y el nombre por
      // defecto del montador lo lleva dentro: en pantalla se lee
      // «[oculto]-montador» y con eso no se sabe qué job crear. Decir de dónde
      // viene el nombre sí sobrevive al censor y contesta la pregunta: si es el de
      // por defecto, ya se sabe cuál es; si viene de una variable, se sabe dónde
      // mirarlo. Y se avisa de que el hueco es el censor y no un fallo.
      const suyo = !!valorEntorno('job');
      const deDonde = suyo
        ? `el que pusiste en ${nombrePrincipal('job')}`
        : 'el nombre por defecto, «prisma-negro-montador»';
      const donde =
        `«${job}» (${deDonde}) en el proyecto de la cuenta de servicio que hay en ` +
        `esta aplicación, región ${region}`;
      const url =
        `https://run.googleapis.com/v2/projects/${proyecto()}` +
        `/locations/${region}/jobs/${job}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        pasos.push(paso('montador', true, `El contenedor de montaje está desplegado: ${donde}.`));
      } else if (r.status === 404) {
        pasos.push(
          paso(
            'montador',
            false,
            `No hay ningún contenedor de montaje ${donde}.`,
            `El montador vive en TU Google Cloud, no en esta aplicación: una cuenta o un ` +
              `proyecto nuevo empieza sin él y hay que instalarlo ahí, y NO se puede usar el de ` +
              `otro proyecto — el proyecto es el de la cuenta de servicio, y es uno para todo. ` +
              `Si el tuyo se llama de otra forma, pon su nombre en ${nombrePrincipal('job')}; si ` +
              `está en otra región, en ${nombrePrincipal('regionJob')}. ` +
              `Lo que salga como «[oculto]» es el id de tu proyecto, tapado a propósito: no es ` +
              `un fallo.`,
          ),
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
