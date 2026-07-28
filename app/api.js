// Cliente de la única puerta (§2 del plano).
//
// El navegador es el director de orquesta: decide qué generar y en qué orden, lleva
// la cola, el progreso, el botón de detener y los reintentos. Pero NUNCA ve una
// credencial. Todo lo que sale de aquí va a `/api/ia` con un campo `modo`.
//
// §1: el usuario no lee registros de la nube desde el teléfono. Cualquier fallo
// tiene que explicarse en pantalla, con palabras. Por eso aquí no se deja escapar
// nunca un error mudo: si algo falla, sale de esta función con una frase.

// La copia local, para poder invalidarla cuando una llamada escribe un material.
import * as local from './local.js';

const PUERTA = '/api/ia';

// ── El ritmo, que se ajusta solo ──────────────────────────────────────────────
//
// Vertex no limita por «cuántas a la vez» sino POR MINUTO. La cola va de una en
// una, así que la concurrencia nunca fue el problema: el problema es que sesenta
// imágenes seguidas, aunque vayan en fila, se salen de la cuota del minuto.
//
// Y cuando eso pasa, Vertex contesta 429 «Resource has been exhausted». Que es un
// «espera», no un «no». Tratarlo como fallo definitivo —que es lo que hacía— dejó
// 33 de 59 imágenes sin generar tras una hora, con un error que ni siquiera dice
// que sea cuestión de esperar.
//
// Así que aquí hay un freno que se aprieta solo: cada 429 aumenta la pausa entre
// llamadas, y cada tanda de aciertos la afloja. La primera vez que se topa con el
// límite, la herramienta baja el ritmo y sigue —en vez de estrellarse sesenta
// veces contra la misma pared—.

const PAUSA_MAX = 30000;
let pausaEntreLlamadas = 0;
let aciertosSeguidos = 0;

/** Cuánto se está esperando ahora entre llamadas. Para poder enseñarlo. */
export const ritmoActual = () => pausaEntreLlamadas;

function frenar() {
  aciertosSeguidos = 0;
  pausaEntreLlamadas = Math.min(PAUSA_MAX, pausaEntreLlamadas ? pausaEntreLlamadas * 2 : 4000);
}

function aflojar() {
  if (!pausaEntreLlamadas) return;
  // Hacen falta varios aciertos seguidos para aflojar: uno solo puede ser suerte,
  // y volver al ritmo alto en cuanto sale bien una es volver a chocar enseguida.
  if (++aciertosSeguidos >= 5) {
    aciertosSeguidos = 0;
    pausaEntreLlamadas = pausaEntreLlamadas <= 4000 ? 0 : Math.round(pausaEntreLlamadas / 2);
  }
}

const dormir = (ms, senal) =>
  new Promise((res, rej) => {
    if (!ms) return res();
    const t = setTimeout(res, ms);
    senal?.addEventListener('abort', () => {
      clearTimeout(t);
      rej(new ErrorPuerta('Detenido.'));
    }, { once: true });
  });

/**
 * La espera entre reintentos: crece con cada intento y no pasa de ocho segundos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA FUNCIÓN NO EXISTÍA. Se llamaba en dos sitios y no estaba escrita en
 * ninguno, así que cada corte de red y cada 5xx —los dos únicos caminos que la
 * usaban— reventaban con «Can't find variable: esperar» en vez de reintentar.
 *
 * Es el mismo fallo que `parts is not defined`, y por lo mismo no lo veía nadie:
 * un identificador que no existe se lee exactamente igual que uno que sí, y
 * `node --check` no se queja porque la sintaxis es correcta. Solo lo caza LLAMAR
 * AL CÓDIGO por ese camino, que es lo que hace ahora `auditoria/api-humo.mjs`.
 *
 * Y explica por qué se caía a mitad tan a menudo: desde un móvil, un corte de red
 * en una tanda de sesenta imágenes no es raro, es lo normal. En vez de esperar
 * medio segundo y volver a intentarlo, la llamada moría con un mensaje que no
 * quiere decir nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const esperar = (intento, senal) => dormir(Math.min(8000, 600 * 2 ** intento), senal);

/**
 * Qué decir cuando el servidor contesta algo que no es JSON.
 *
 * Que no sea JSON significa que la respuesta no la escribió la herramienta: la
 * escribió la plataforma, y por eso hay que traducirla. Y hay que traducirla BIEN,
 * porque cada una manda a arreglar una cosa distinta.
 */
function mensajeDeRespuestaCruda(estado) {
  if (estado === 504 || estado === 502 || estado === 524) {
    return (
      'La generación tardó más de lo que la plataforma permite y la cortó a mitad ' +
      `(HTTP ${estado}). No es tamaño: es tiempo. Si pasa a menudo, en Ajustes hay ` +
      'generadores más rápidos — Nano Banana 2 para imagen tarda menos de la mitad ' +
      'que Nano Banana Pro. Lo que llegara a terminar se guarda igual, así que ' +
      'volver a darle no lo paga otra vez.'
    );
  }
  if (estado === 413) {
    return 'Lo que se mandó no cabe en una petición (HTTP 413). El tope de la plataforma es 4,5 MB.';
  }
  return `El servidor respondió algo que no es JSON (HTTP ${estado}).`;
}

/**
 * ¿Llegó el material al almacén a pesar de todo?
 *
 * Se pregunta cuando la respuesta se perdió: si el archivo está y se escribió HACE
 * NADA, es que la generación sí terminó y lo único que falló fue el viaje de
 * vuelta. Se da por buena y no se vuelve a pagar.
 *
 * Lo de «hace nada» importa: sin mirar la fecha, rehacer una imagen que ya existía
 * daría por buena la vieja en cuanto hubiera un corte. La función de la plataforma
 * no puede durar más de un minuto, así que cuatro sobran para cubrir el hueco y no
 * llegan a alcanzar nada de una sesión anterior.
 */
const FRESCO_MS = 4 * 60 * 1000;

async function llegoDeTodasFormas(clave, senal) {
  try {
    const r = await fetch(PUERTA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modo: 'ficha', clave, acceso: claveAcceso }),
      signal: senal,
    });
    if (!r.ok) return null;
    const c = await r.json();
    const f = c?.ficha;
    if (!f?.existe || !f.actualizado) return null;
    if (Date.now() - Date.parse(f.actualizado) > FRESCO_MS) return null;
    return { bytes: f.bytes };
  } catch {
    // Si ni siquiera se puede preguntar, se reintenta como siempre.
    return null;
  }
}

/** ¿Es un «espera» y no un «no»? */
const esEspera = (estado, texto) =>
  estado === 429 ||
  estado === 408 ||
  estado === 503 ||
  /RESOURCE_EXHAUSTED|has been exhausted|quota|rate limit|try again later/i.test(String(texto || ''));

let claveAcceso = '';
const modelos = { texto: '', imagen: '', video: '' };

export function ponerClave(c) {
  claveAcceso = String(c || '');
}

/**
 * El modelo de texto que quiere este proyecto.
 *
 * Se pone una vez al cargar y viaja solo en cada llamada de texto. Si cada fase
 * tuviera que acordarse de pasarlo, alguna se olvidaría y esa correría con otro
 * modelo sin que nadie lo supiera.
 */
export function ponerModeloTexto(m) {
  modelos.texto = String(m || '');
}

/** Los modelos de imagen y de clips, por la misma razón que el de texto. */
export function ponerModelos({ imagen, video }) {
  if (imagen !== undefined) modelos.imagen = String(imagen || '');
  if (video !== undefined) modelos.video = String(video || '');
}

const MODO_A_FAMILIA = { texto: 'texto', imagen: 'imagen', 'video.iniciar': 'video', voz: 'voz' };

export function hayClave() {
  return !!claveAcceso;
}

export class ErrorPuerta extends Error {
  constructor(mensaje, { estado, motivo } = {}) {
    super(mensaje);
    this.name = 'ErrorPuerta';
    this.estado = estado;
    this.motivo = motivo;
  }
}

/**
 * Una llamada a la puerta.
 *
 * `reintentos` cubre solo los fallos que tiene sentido reintentar: cortes de red y
 * saturación del proveedor. Un 4xx no se reintenta —volver a pedir lo mismo da lo
 * mismo— y un 413 menos todavía: eso es tamaño, y el tamaño no cambia por insistir.
 */
export async function llamar(modo, datos = {}, { reintentos = 2, senal, alEsperar } = {}) {
  let ultimo = null;
  // Los «espera» tienen su propia cuenta y su propia paciencia: una ventana de
  // cuota se mide en minutos, no en los tres segundos que daban los reintentos
  // normales.
  let esperas = 0;

  for (let intento = 0; intento <= reintentos; intento++) {
    if (senal?.aborted) throw new ErrorPuerta('Detenido.');

    // El freno, antes de llamar. Si la tanda anterior chocó con la cuota, esto es
    // lo que hace que la siguiente no vuelva a chocar.
    if (pausaEntreLlamadas) {
      alEsperar?.(pausaEntreLlamadas, 'ritmo');
      await dormir(pausaEntreLlamadas, senal);
    }

    let r;
    try {
      r = await fetch(PUERTA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // El campo de la contraseña se llama `acceso`, NO `clave`.
        //
        // «Clave» significa las dos cosas en español —contraseña y clave de
        // material— y los modos del almacén mandan la clave de la toma en un campo
        // llamado `clave`. Al componer el cuerpo, `...datos` pisaba la contraseña con
        // «p01/t000/audio» y el servidor contestaba «clave de acceso incorrecta»,
        // que es exactamente el mensaje que menos ayuda a encontrarlo.
        body: JSON.stringify({
          modo,
          ...(modelos[MODO_A_FAMILIA[modo]] ? { modelo: modelos[MODO_A_FAMILIA[modo]] } : {}),
          ...datos,
          // Va la ÚLTIMA a propósito: ningún campo de carga útil puede pisarla.
          acceso: claveAcceso,
        }),
        signal: senal,
      });
    } catch (e) {
      if (senal?.aborted) throw new ErrorPuerta('Detenido.');
      ultimo = new ErrorPuerta('No se pudo hablar con el servidor. ¿Hay conexión?');
      await esperar(intento, senal);
      continue;
    }

    let cuerpo;
    try {
      cuerpo = await r.json();
    } catch {
      // 504 NO ES TAMAÑO, ES TIEMPO. Y el mensaje decía lo contrario.
      //
      // Cuando la plataforma corta la función por tiempo devuelve una página de
      // error suya, no JSON, y esto contestaba «casi seguro es el tope de 4,5 MB».
      // Mandaba a mirar el sitio equivocado: no había nada que encoger, había que
      // tardar menos. Un mensaje que apunta mal cuesta más que no decir nada.
      ultimo = new ErrorPuerta(mensajeDeRespuestaCruda(r.status), { estado: r.status });
      if (r.status < 500) throw ultimo;

      // Y LO QUE SE HIZO ANTES DE QUE CORTARAN, SE HIZO.
      //
      // La imagen se genera y se sube al almacén, y solo después se contesta. Si
      // el corte llega en medio, el archivo YA ESTÁ ARRIBA y la respuesta se
      // perdió por el camino. Volver a generarlo es pagarlo dos veces por un
      // problema de fontanería.
      if (datos.guardarEn) {
        const ya = await llegoDeTodasFormas(datos.guardarEn, senal);
        if (ya) {
          aflojar();
          return { ok: true, guardado: ya, recuperado: true };
        }
      }
      await esperar(intento, senal);
      continue;
    }

    if (r.ok && cuerpo.ok) {
      // Si esta llamada ESCRIBIÓ un material, la copia local de esa clave ya no
      // vale. Se tira aquí, en la única puerta por la que pasan todas.
      //
      // Estaba puesto solo en los «rehacer» de uno en uno, así que rehacer una
      // fase entera dejaba la copia vieja en el navegador: cambiabas de voz, la
      // nube se actualizaba, y la Previa te seguía tocando la voz anterior. Un
      // fallo que no parece un fallo —parece que el cambio de voz no funciona—.
      // Puesto aquí, una fase nueva no puede olvidarse de hacerlo.
      const escrita = datos.guardarEn || (modo === 'subir' ? datos.clave : '');
      if (escrita) await local.borrarMaterial(escrita).catch(() => {});
      aflojar();
      return cuerpo;
    }

    const err = new ErrorPuerta(cuerpo.error || `El servidor respondió ${r.status}.`, {
      estado: r.status,
      motivo: cuerpo.motivo,
    });

    // Un «espera» NO es un 4xx cualquiera. Antes caía en la regla de abajo —«los
    // 4xx no se reintentan»— y se descartaba al instante, que es exactamente lo
    // que dejó 33 imágenes de 59 sin generar. Se frena y se insiste, con la
    // paciencia que pide una ventana de cuota.
    if (esEspera(r.status, cuerpo.error)) {
      frenar();
      if (esperas < REINTENTOS_DE_ESPERA) {
        // Si el proveedor dice cuánto hay que esperar, se le hace caso.
        const dice = Number(r.headers.get('retry-after')) * 1000;
        const cuanto = Math.max(dice || 0, ESPERAS[esperas] || ESPERAS[ESPERAS.length - 1]);
        esperas++;
        alEsperar?.(cuanto, 'cuota');
        await dormir(cuanto, senal);
        intento--; // un «espera» no gasta reintento: no ha fallado, no le tocaba
        ultimo = err;
        continue;
      }
      err.message =
        'Se agotó la cuota del proveedor y sigue agotada tras varios minutos esperando. ' +
        'No es un fallo de la herramienta: es el límite por minuto de tu proyecto en Google Cloud.';
      throw err;
    }

    // 413 = tamaño. El resto de 4xx = no va a cambiar. Ninguno se reintenta.
    if (r.status === 413 || (r.status >= 400 && r.status < 500)) throw err;
    ultimo = err;
    await esperar(intento, senal);
  }

  throw ultimo || new ErrorPuerta('Falló sin decir por qué.');
}

// Las esperas de cuota, en milisegundos. Suman unos ocho minutos: una ventana de
// cuota por minuto se abre mucho antes, y una diaria no se abre nunca —por eso hay
// un final, en vez de esperar para siempre—.
const ESPERAS = [5000, 15000, 30000, 60000, 90000, 120000, 180000];
const REINTENTOS_DE_ESPERA = ESPERAS.length;

/**
 * Espera a que termine una operación larga (§6).
 *
 * Cualquier cosa que pase de 60 segundos no cabe en una función: se arranca, se
 * devuelve un identificador y se consulta cada N segundos desde aquí. El
 * identificador viaja CIFRADO, no censurado, o la consulta siguiente fallaría con
 * un error incomprensible.
 */
export async function esperarOperacion(modo, datos, { senal, cada = 8000, tope = 600000, aviso } = {}) {
  const desde = Date.now();
  let vuelta = 0;

  while (Date.now() - desde < tope) {
    if (senal?.aborted) throw new ErrorPuerta('Detenido.');
    const r = await llamar(modo, datos, { senal });
    if (r.listo) return r;
    vuelta++;
    aviso?.(Math.round((Date.now() - desde) / 1000), vuelta);
    await new Promise((res) => setTimeout(res, cada));
  }

  throw new ErrorPuerta(
    `La operación lleva más de ${Math.round(tope / 60000)} minutos sin terminar. ` +
      'Se deja de esperar; el material puede aparecer más tarde en el almacén.',
  );
}
