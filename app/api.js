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
//
// ─────────────────────────────────────────────────────────────────────────────
// LAS CIFRAS ESTABAN MAL, Y ESTABAN MAL EN LOS DOS SENTIDOS.
//
// «¿Cómo le vas a poner un tiempo de cuatro segundos de espera? Eso no es nada
//  para Vercel ni para Google Cloud.»
//
// El primer frenazo eran CUATRO SEGUNDOS, o sea quince llamadas por minuto. Si la
// cuota del proyecto son diez imágenes por minuto —que es lo normal en un proyecto
// nuevo—, cuatro segundos no evitan nada: se vuelve a chocar a la tercera. Frenar
// tiene que llevar el ritmo POR DEBAJO del límite, no rozarlo.
//
// Y peor era el otro lado: al aflojar, `<= 4000 → 0` bajaba de cuatro segundos a
// CERO de un salto, así que a las cinco imágenes buenas el freno desaparecía
// entero y se volvía derecho a la pared. Subir multiplicando y bajar de golpe es
// un oscilador, no un regulador: el ritmo se pasaba la tanda entre el límite y
// nada, chocando cada pocas imágenes.
//
// Ahora sube fuerte y baja poco a poco —el freno busca el ritmo que el proveedor
// aguanta y se queda ahí—, que es como se regula cualquier cosa que no conoce su
// propio límite.
// ─────────────────────────────────────────────────────────────────────────────

// Un minuto de pausa entre llamadas es una imagen por minuto: por debajo de eso ya
// no es la cuota lo que estorba, es otra cosa, y seguir frenando no arregla nada.
const PAUSA_MAX = 60000;
// El primer frenazo. Ocho segundos son siete llamadas por minuto, que cabe en la
// cuota más apretada que reparte Vertex a un proyecto nuevo.
const PAUSA_INICIAL = 8000;
// Por debajo de esto el freno ya no sirve de nada y se quita del todo.
const PAUSA_MINIMA = 1500;

let pausaEntreLlamadas = 0;
let aciertosSeguidos = 0;

/** Cuánto se está esperando ahora entre llamadas. Para poder enseñarlo. */
export const ritmoActual = () => pausaEntreLlamadas;

function frenar() {
  aciertosSeguidos = 0;
  pausaEntreLlamadas = Math.min(PAUSA_MAX, pausaEntreLlamadas ? pausaEntreLlamadas * 2 : PAUSA_INICIAL);
}

function aflojar() {
  if (!pausaEntreLlamadas) return;
  // Hacen falta varios aciertos seguidos para aflojar: uno solo puede ser suerte,
  // y volver al ritmo alto en cuanto sale bien una es volver a chocar enseguida.
  if (++aciertosSeguidos < 5) return;
  aciertosSeguidos = 0;
  // Y SE AFLOJA UN CUARTO, no a la mitad ni de golpe a cero. Bajar despacio es lo
  // que hace que el ritmo se pose donde el proveedor aguanta en vez de saltar
  // entre el límite y nada.
  const siguiente = Math.round(pausaEntreLlamadas * 0.75);
  pausaEntreLlamadas = siguiente < PAUSA_MINIMA ? 0 : siguiente;
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
 * EL TOPE DE TIEMPO DE UNA PETICIÓN. Sin esto, una llamada colgada cuelga TODO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «De repente el mensaje dice como que se está generando, pero no se genera nada.
 *  Pasa media hora y no se generó nada.»
 *
 * `fetch` NO TIENE TIEMPO DE ESPERA. Si la petición sale y la respuesta no vuelve
 * nunca —red móvil que cambia de celda, una conexión que se queda a medias, la
 * plataforma que no cierra el socket—, el `await` se queda ahí para siempre. No
 * lanza, no reintenta, no avisa: la cola se para en esa unidad y el cartel se
 * queda diciendo «generando» hasta que alguien recarga la página. Media hora, o
 * las que sean.
 *
 * Con un tope, una petición que no vuelve se corta, se cuenta como fallo de red y
 * el reintento de siempre la vuelve a lanzar. Que es lo que ya hacía con los
 * cortes de red que SÍ dan error.
 *
 * Y EL NÚMERO NO ES ARBITRARIO: sale de `maxDuration` en `vercel.json`, que es lo
 * que aguanta la función antes de que la plataforma la mate. Está en 60 s, que es
 * el techo del plan gratuito de Vercel. Cualquier petición que pase de ahí con
 * mucho margen es una petición colgada, no una petición lenta: la plataforma ya la
 * habría cortado con un 504.
 *
 * El margen es para lo que NO cuenta como duración de la función: subir la carga
 * —una imagen de referencia por una red móvil lenta— y bajar la respuesta. Se pone
 * el doble, que sobra.
 *
 * Si algún día `maxDuration` sube —el plan de pago llega a 300 s—, este número
 * tiene que subir con él o se cortarían llamadas buenas. Hay una invariante que
 * comprueba justo eso, para que no se quede atrás en silencio.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const MAX_DURACION_FUNCION = 60000;
const TOPE_DE_PETICION = MAX_DURACION_FUNCION * 2;

function conTope(senal, ms) {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), ms);
  const propagar = () => {
    clearTimeout(t);
    control.abort();
  };
  senal?.addEventListener('abort', propagar, { once: true });
  return {
    signal: control.signal,
    // Se llama SIEMPRE al terminar la petición: si no, cada llamada deja un
    // temporizador vivo y en una tanda de 141 imágenes eso son 141 relojes.
    soltar: () => {
      clearTimeout(t);
      senal?.removeEventListener('abort', propagar);
    },
  };
}

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

/** Los códigos con los que la plataforma corta una petición POR TIEMPO. */
const CORTES_POR_TIEMPO = new Set([502, 504, 524]);

/**
 * Qué decir cuando el servidor contesta algo que no es JSON.
 *
 * Que no sea JSON significa que la respuesta no la escribió la herramienta: la
 * escribió la plataforma, y por eso hay que traducirla. Y hay que traducirla BIEN,
 * porque cada una manda a arreglar una cosa distinta — el consejo depende de QUÉ
 * se estaba generando: recomendar otro generador de imagen cuando el que se pasó
 * de tiempo fue el director manda a mirar el sitio equivocado.
 */
function mensajeDeRespuestaCruda(estado, modo = '') {
  if (CORTES_POR_TIEMPO.has(estado)) {
    const consejo =
      modo === 'texto'
        ? 'La herramienta parte el trabajo en trozos más pequeños y reintenta sola; ' +
          'si pasa a menudo, en Ajustes hay directores más rápidos (Gemini 2.5 Flash).'
        : 'Si pasa a menudo, en Ajustes hay generadores más rápidos — Nano Banana 2 ' +
          'para imagen tarda menos de la mitad que Nano Banana Pro.';
    return (
      'La generación tardó más de lo que la plataforma permite y la cortó a mitad ' +
      `(HTTP ${estado}). No es tamaño: es tiempo. ${consejo} Lo que llegara a ` +
      'terminar se guarda igual, así que volver a darle no lo paga otra vez.'
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
export async function llamar(modo, datos = {}, { reintentos = 2, senal, alEsperar, tope = TOPE_DE_PETICION } = {}) {
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
    // `tope` se puede bajar desde fuera. Existe para poder COMPROBAR que una
    // petición colgada se corta: con dos minutos fijos, la comprobación tardaría
    // dos minutos y nadie la ejecutaría nunca.
    const reloj = conTope(senal, tope);
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
        signal: reloj.signal,
      });
    } catch (e) {
      // Detenerse a mano y agotarse el tiempo abortan igual, así que hay que
      // distinguirlos por QUIÉN abortó: si la señal de fuera está abortada, lo
      // pidió la persona. Si no, la petición se colgó y hay que reintentarla.
      if (senal?.aborted) throw new ErrorPuerta('Detenido.');
      ultimo =
        e?.name === 'AbortError'
          ? new ErrorPuerta(
              'La petición se quedó colgada sin respuesta y se cortó a los dos minutos. Se reintenta sola.',
              { estado: 408, motivo: 'colgada' },
            )
          : new ErrorPuerta('No se pudo hablar con el servidor. ¿Hay conexión?');
      await esperar(intento, senal);
      continue;
    } finally {
      reloj.soltar();
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
      ultimo = new ErrorPuerta(mensajeDeRespuestaCruda(r.status, modo), { estado: r.status });
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
      } else if (CORTES_POR_TIEMPO.has(r.status)) {
        // Un corte por tiempo en una llamada que NO escribe nada no mejora
        // repitiéndola igual de grande: son otros sesenta segundos contra el
        // mismo muro. Se devuelve YA, para que la fase parta el trabajo en dos
        // — que es lo único que sí lo arregla.
        throw ultimo;
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

// Las esperas de cuota de UNA LLAMADA, en milisegundos.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA PRIMERA ERAN CINCO SEGUNDOS, y es el mismo error que los cuatro de arriba.
//
// La cuota de Vertex se mide POR MINUTO: cuando se agota, la ventana no se abre
// hasta que pasa el minuto. Esperar cinco segundos y volver a preguntar es tirar
// un intento —la ventana sigue cerrada seguro—, y quince y treinta son otros dos.
// Se gastaban tres de siete intentos antes de esperar lo único que podía servir.
//
// Ahora empieza en medio minuto y da dos oportunidades completas a la ventana. Y
// ya no hacen falta ocho minutos aquí: si tras tres minutos sigue cerrada, no es
// la ventana del minuto, es una cuota mayor — y de esa se encarga la cola, que
// para la tanda entera y espera en escala de minutos sin perder la unidad
// (`ESPERAS_DE_TANDA`, en `app/cola.js`). Dos capas, cada una con su trabajo, en
// vez de las dos haciendo lo mismo.
// ─────────────────────────────────────────────────────────────────────────────
const ESPERAS = [30000, 60000, 90000];
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
