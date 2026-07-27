// Cliente de la única puerta (§2 del plano).
//
// El navegador es el director de orquesta: decide qué generar y en qué orden, lleva
// la cola, el progreso, el botón de detener y los reintentos. Pero NUNCA ve una
// credencial. Todo lo que sale de aquí va a `/api/ia` con un campo `modo`.
//
// §1: el usuario no lee registros de la nube desde el teléfono. Cualquier fallo
// tiene que explicarse en pantalla, con palabras. Por eso aquí no se deja escapar
// nunca un error mudo: si algo falla, sale de esta función con una frase.

const PUERTA = '/api/ia';

let claveAcceso = '';
let modeloTexto = '';

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
  modeloTexto = String(m || '');
}

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
export async function llamar(modo, datos = {}, { reintentos = 2, senal } = {}) {
  let ultimo = null;

  for (let intento = 0; intento <= reintentos; intento++) {
    if (senal?.aborted) throw new ErrorPuerta('Detenido.');

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
          ...(modo === 'texto' && modeloTexto ? { modelo: modeloTexto } : {}),
          ...datos,
          // Va la ÚLTIMA a propósito: ningún campo de carga útil puede pisarla.
          acceso: claveAcceso,
        }),
        signal: senal,
      });
    } catch (e) {
      if (senal?.aborted) throw new ErrorPuerta('Detenido.');
      ultimo = new ErrorPuerta('No se pudo hablar con el servidor. ¿Hay conexión?');
      await esperar(intento);
      continue;
    }

    let cuerpo;
    try {
      cuerpo = await r.json();
    } catch {
      ultimo = new ErrorPuerta(
        `El servidor respondió algo que no es JSON (HTTP ${r.status}). ` +
          'Si venía de una generación grande, casi seguro es el tope de 4,5 MB.',
        { estado: r.status },
      );
      if (r.status < 500) throw ultimo;
      await esperar(intento);
      continue;
    }

    if (r.ok && cuerpo.ok) return cuerpo;

    const err = new ErrorPuerta(cuerpo.error || `El servidor respondió ${r.status}.`, {
      estado: r.status,
      motivo: cuerpo.motivo,
    });

    // 413 = tamaño. 4xx = no va a cambiar. Ninguno se reintenta.
    if (r.status === 413 || (r.status >= 400 && r.status < 500)) throw err;
    ultimo = err;
    await esperar(intento);
  }

  throw ultimo || new ErrorPuerta('Falló sin decir por qué.');
}

function esperar(intento) {
  return new Promise((res) => setTimeout(res, Math.min(8000, 600 * 2 ** intento)));
}

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
