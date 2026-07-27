// El catálogo de generadores. FIJO, escrito a mano, y a propósito.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ ESTO NO SE SONDEA
//
// Antes esta lista se descubría preguntándole a Vertex modelo por modelo. Sonaba
// bien —«que la app se entere sola»— y salió mal de las dos maneras posibles:
//
//   · POR DEFECTO: la lista de candidatos que se sondeaba la había escrito yo
//     igual, así que no descubría nada que yo no supiera ya. Con un identificador
//     mal escrito, el modelo respondía 404 y la app concluía «no lo tienes».
//     Resultado en pantalla: UN generador de imagen, cuando había tres.
//
//   · POR EXCESO: Vertex publica el mismo modelo con varias grafías —la de
//     preview y la definitiva—. Las dos existen, las dos contestan, y las dos
//     acababan en el desplegable con la MISMA etiqueta. Resultado en pantalla:
//     «Veo 3.1 Fast» dos veces, «Veo 3.1 Lite» dos veces.
//
// Los dos fallos tienen la misma raíz: el desplegable enseñaba GRAFÍAS DE
// IDENTIFICADOR, y lo que el usuario elige no es una grafía, es un GENERADOR. Un
// generador es una fila de esta tabla: un nombre, un precio, una calidad. Que
// Google lo publique con uno o con dos identificadores es asunto nuestro, no suyo.
//
// Así que la tabla manda. Lo que está aquí sale en pantalla, en este orden,
// siempre, exista o no exista: si un día Google retira uno, es mejor que el
// usuario lo elija y lea un error claro a que desaparezca del desplegable sin
// que nadie diga por qué.
//
// `ids` son las grafías conocidas del MISMO generador, de la preferida a la de
// reserva. El servidor prueba en ese orden y se queda con la que conteste (§7.2).
// Eso NO es sondear un catálogo: es saber que un mismo modelo tiene dos nombres.
// ─────────────────────────────────────────────────────────────────────────────

export const CATALOGO = {
  // El director. Aquí sí manda la calidad: el guion se escribe una vez y de él
  // sale todo lo demás. Ahorrar aquí es ahorrar en lo único que no tiene arreglo.
  texto: [
    {
      clave: 'gemini-3.1-pro',
      etiqueta: 'Gemini 3.1 Pro — el mejor director',
      ids: ['gemini-3.1-pro-preview', 'gemini-3.1-pro'],
    },
    {
      clave: 'gemini-2.5-pro',
      etiqueta: 'Gemini 2.5 Pro — alternativa estable',
      ids: ['gemini-2.5-pro'],
    },
    {
      clave: 'gemini-2.5-flash',
      etiqueta: 'Gemini 2.5 Flash — rápido y barato',
      ids: ['gemini-2.5-flash'],
    },
  ],

  // Los tres «Nano Banana». Son los nombres con los que Google los anuncia y con
  // los que se les conoce; el identificador técnico va debajo y no hace falta
  // verlo. Este generador se llama unas ochenta veces por documental, así que la
  // diferencia de precio entre filas se nota de verdad.
  imagen: [
    {
      clave: 'nano-banana',
      etiqueta: 'Nano Banana — estable y rápido',
      ids: ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview'],
    },
    {
      clave: 'nano-banana-2',
      etiqueta: 'Nano Banana 2 — nuevo y rápido',
      ids: ['gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview'],
    },
    {
      clave: 'nano-banana-pro',
      etiqueta: 'Nano Banana Pro — máxima calidad',
      ids: ['gemini-3-pro-image', 'gemini-3-pro-image-preview'],
    },
  ],

  // Veo. Doce llamadas por documental, y entre Lite y la cara hay varias veces el
  // precio por segundo. De más barato a más caro, que es el orden en que se decide.
  video: [
    {
      clave: 'veo-3.1-lite',
      etiqueta: 'Veo 3.1 Lite — el más económico',
      ids: ['veo-3.1-lite-generate-001', 'veo-3.1-lite-generate-preview'],
      duraciones: [4, 6, 8],
    },
    {
      clave: 'veo-3.1-fast',
      etiqueta: 'Veo 3.1 Fast — equilibrado',
      ids: ['veo-3.1-fast-generate-001', 'veo-3.1-fast-generate-preview'],
      duraciones: [4, 6, 8],
    },
    {
      clave: 'veo-3.1',
      etiqueta: 'Veo 3.1 — máxima calidad',
      ids: ['veo-3.1-generate-001', 'veo-3.1-generate-preview'],
      duraciones: [4, 6, 8],
    },
    {
      clave: 'veo-2',
      etiqueta: 'Veo 2 — generación anterior',
      ids: ['veo-2.0-generate-001'],
      // Veo 2 admite duraciones que los 3.1 no. Pedir una que no está en la lista
      // no se redondea solo: la petición se rechaza.
      duraciones: [5, 6, 7, 8],
    },
  ],

  voz: [
    {
      clave: 'gemini-3.1-flash-tts',
      etiqueta: 'Gemini 3.1 Flash TTS — el más natural',
      ids: ['gemini-3.1-flash-tts-preview', 'gemini-3.1-flash-tts'],
    },
    {
      clave: 'gemini-2.5-flash-tts',
      etiqueta: 'Gemini 2.5 Flash TTS — generación anterior',
      ids: ['gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-tts'],
    },
  ],

  musica: [{ clave: 'lyria-002', etiqueta: 'Lyria 2', ids: ['lyria-002'] }],
};

/**
 * Lo que sale seleccionado la primera vez.
 *
 * En texto, el mejor. En imagen y clips, el EQUILIBRADO —ni el más caro ni el más
 * pobre—, que es lo que se pidió: son los dos que se llaman muchas veces.
 */
export const PREDETERMINADO = {
  texto: 'gemini-3.1-pro',
  imagen: 'nano-banana-2',
  video: 'veo-3.1-fast',
  voz: 'gemini-3.1-flash-tts',
  musica: 'lyria-002',
};

/** Las filas de una familia, para pintar el desplegable. */
export const familiaDe = (familia) => CATALOGO[familia] || [];

/**
 * De la clave que eligió el usuario a las grafías que hay que probar.
 *
 * Si llega una clave desconocida —una configuración guardada de una versión
 * anterior— se cae a la predeterminada en vez de romper. Y si lo que llega es
 * directamente un identificador de Vertex, se respeta tal cual: así una elección
 * vieja guardada como `veo-3.1-fast-generate-001` sigue funcionando.
 */
export function grafiasDe(familia, clave) {
  const filas = familiaDe(familia);
  const fila =
    filas.find((f) => f.clave === clave) ||
    filas.find((f) => f.ids.includes(clave)) ||
    filas.find((f) => f.clave === PREDETERMINADO[familia]) ||
    filas[0];
  return fila ? fila.ids : [];
}

/** La etiqueta de una clave, para los mensajes. */
export function etiquetaDe(familia, clave) {
  const f = familiaDe(familia).find((x) => x.clave === clave || x.ids.includes(clave));
  return f ? f.etiqueta : clave || '';
}

/**
 * La clave del catálogo a la que pertenece un valor guardado, o '' si no es de aquí.
 *
 * Sirve para traducir una configuración vieja: se guardaban identificadores de
 * Vertex («veo-3.1-fast-generate-preview») y ahora se guarda la clave. Sin esto,
 * una elección hecha a conciencia se perdería en silencio al actualizar.
 */
export function claveDe(familia, valor) {
  if (!valor) return '';
  const f = familiaDe(familia).find((x) => x.clave === valor || x.ids.includes(valor));
  return f ? f.clave : '';
}

// ── Dónde vive cada modelo ────────────────────────────────────────────────────
//
// ESTO ES LA CAUSA DE CASI TODO LO QUE PARECÍA OTRA COSA.
//
// Los modelos `gemini-3*` se sirven en la región `global`, con el host sin
// prefijo. El resto viven en una región concreta, con el host prefijado. Y
// cuando te equivocas de región, Vertex NO dice «región equivocada»: dice 404.
//
// Un 404 se lee como «ese modelo no existe en tu cuenta». Por eso el sondeo
// concluyó que solo había un generador de imagen: estaba preguntando por los tres
// en us-central1, y los dos de la familia 3 solo contestan en global. Existían,
// estaban contratados, y la herramienta los daba por ausentes.

export const REGION_GLOBAL = 'global';

/** La región en la que hay que pedir este modelo. */
export function regionDe(id, regionPorDefecto = 'us-central1') {
  return /^gemini-3/i.test(String(id)) ? REGION_GLOBAL : regionPorDefecto;
}

/** El host de esa región. `global` no lleva prefijo. */
export function hostDe(region) {
  return region === REGION_GLOBAL
    ? 'aiplatform.googleapis.com'
    : `${region}-aiplatform.googleapis.com`;
}

/**
 * Las modalidades de respuesta que acepta un generador de imagen.
 *
 * La familia 3 EXIGE ['TEXT','IMAGE']; el 2.5 solo acepta ['IMAGE']. Con el valor
 * equivocado la petición falla, y el mensaje no dice que sea por esto.
 */
export function modalidadesDe(id) {
  return /^gemini-3/i.test(String(id)) ? ['TEXT', 'IMAGE'] : ['IMAGE'];
}

/** `imageSize` solo lo acepta la familia 3. Mandárselo al 2.5 es un error. */
export const admiteTamanoImagen = (id) => /^gemini-3/i.test(String(id));

/**
 * La duración válida más cercana, para el generador de clips elegido.
 *
 * En un EMPATE se coge la MAYOR: entre 4 y 6 para una toma de 5, vale más sobrar
 * un segundo —que el montaje recorta— que faltar uno, que se ve como imagen
 * congelada. Por encima del máximo se pide el máximo.
 */
export function duracionValida(clave, segundos) {
  const fila = familiaDe('video').find((f) => f.clave === clave || f.ids.includes(clave));
  const lista = fila?.duraciones || [4, 6, 8];
  return lista.reduce((a, b) => {
    const da = Math.abs(a - segundos);
    const db = Math.abs(b - segundos);
    return db < da || (db === da && b > a) ? b : a;
  });
}
