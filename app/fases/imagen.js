// Fase 6 — Imagen (§4.6 del plano), con las decisiones de §8.2.
//
//   «Un fotograma por toma, con IMÁGENES DE REFERENCIA adjuntas para que los
//    sujetos y los lugares se parezcan entre tomas. El modelo que se use tiene que
//    aceptar imágenes de referencia; no todos lo hacen.»
//
// §6, y esto no admite excepción: toda imagen que se envía se reduce antes, a ~1024
// px de lado. El codificador visual de los modelos trabaja por ahí y lo que sobra lo
// tira él. Aquí no se compone ni un solo payload de imagen a mano: todo pasa por
// `imagenes.js`, que es la única puerta de salida.
//
// §8.2 — LA DECISIÓN DE DISEÑO MÁS IMPORTANTE DE UN PROYECTO DOCUMENTAL:
//   - No se generan imágenes fotorrealistas de personas reales identificables.
//   - No se presenta material generado como si fuera de archivo.
//   - Lo que sí funciona: reconstrucciones DECLARADAS, mapas y esquemas, planos de
//     recurso, y archivo con licencia clara.
// El modelo de datos sabe de qué tipo es la imagen de cada toma y eso puede salir en
// pantalla.

import { llamar } from '../api.js';
import { claveToma, tomaDelFotograma, claveClip, claveFotograma } from '../../comun/claves.mjs';
import { reducirReferencias, deBase64 } from '../imagenes.js';
import {
  estiloPorId,
  ESTILOS,
  BARRERA_DOCUMENTAL,
  SIN_TEXTO_LEGIBLE,
  OFICIO_CINEMATOGRAFICO,
} from '../../comun/estilos.mjs';
import * as local from '../local.js';
import { material } from '../material.js';

// El estilo ya no vive aquí: sale del catálogo y se elige en Ajustes. Escrito
// dentro de la fase, no había forma de saber cuál era sin generar ochenta imágenes.

/**
 * Qué tomas hay que generar.
 *
 * Las que reusan el fotograma de otra NO se generan: dos tomas con el mismo plano no
 * se pagan dos veces (§3). Con «solo las que faltan», tampoco las que ya están.
 */
export function planificar(tomas, { soloLasQueFaltan = true } = {}) {
  return tomas.filter((t) => {
    // Heredada de otra pieza: la imagen ya existe y ya está pagada. Ni con
    // «rehacer todo» se vuelve a generar, que es justo lo que la hace útil.
    if (t.heredado) return false;
    if (t.reusa !== null && t.reusa !== undefined) return false;
    if (!t.plano) return false;
    // Y si su clip viene heredado, su imagen NO SE VE NUNCA: en el montaje una toma
    // con movimiento se monta con el clip, no con el fotograma. Se estaba pagando
    // una imagen por cada clip reutilizado para no enseñarla jamás.
    if (t.movimiento && t.heredadoVid) return false;
    return soloLasQueFaltan ? t.imagen !== 'ok' : true;
  });
}

/**
 * Qué planos ya generados —en cualquier caso de este proyecto— sirven para este.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL BANCO DE PLANOS
 *
 * Dos clases de reutilización, y las dos valen dinero:
 *
 *   · DEL MISMO CASO. Una continuación vuelve a los mismos sitios: la fachada, el
 *     pasillo, la carretera. Regenerarlos es pagar dos veces por la misma imagen,
 *     y encima sale distinta, que en un documental se nota.
 *
 *   · DE CUALQUIER CASO. Hay planos que no son de nadie: la fachada de una
 *     comisaría, patrullas y una ambulancia frente a una casa, un pasillo de
 *     juzgado, una carretera de noche. Sirven para el caso de la semana que viene
 *     igual que para el de hoy. Un canal que lleva diez documentales tiene un
 *     banco de esos planos pagados hace meses.
 *
 * Se compara el LUGAR y el ENCUADRE, que es lo que hace que dos planos se vean
 * iguales. La luz también: la misma fachada de noche y de día es otro plano, y
 * darte la de noche cuando el guion pide de día es peor que pagar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function heredables(tomas, piezasAnteriores) {
  // Dos bancos separados: uno de fotogramas y otro de CLIPS. Un clip no sirve
  // como imagen fija ni al revés, así que se buscan por su lado. Y el de clips es
  // el que más ahorra: un clip cuesta muchas veces lo que una imagen.
  const imagenes = new Map();
  const clips = new Map();
  for (const z of piezasAnteriores) {
    for (const t of z.tomas || []) {
      if (!t.plano) continue;
      const k = huellaDePlano(t);
      if (!k) continue;

      // LA CLAVE DEL ARCHIVO DE VERDAD, no la que le tocaría por su sitio.
      //
      // Una toma que a su vez HEREDÓ su material entraba en el estante con su
      // pieza y su índice, y quien la eligiera como donante recibía la clave de un
      // archivo que nunca se generó: el material está en una tercera pieza. La
      // herencia no es transitiva por sí sola, y aquí se la hace transitiva
      // apuntando siempre al original.
      //
      // Y una toma que repite un plano dentro de su pieza tampoco es donante por
      // su índice: su archivo es el de su dueña.
      // LOS DOS ESTANTES SON INDEPENDIENTES, y antes no lo eran.
      //
      // Decía «es donante de imagen solo si NO lleva movimiento», y eso tiraba a la
      // basura la mitad del banco: una toma con clip TAMBIÉN tiene su imagen —el
      // clip sale de ella, siempre—, y esa imagen sirve igual de bien para otro
      // documental. Con la conversión a clip a mano se notaba el doble: convertías
      // una imagen en video y la imagen desaparecía del banco.
      const conClip = t.video === 'ok' || !!t.heredadoVid;
      const conImagen = t.imagen === 'ok' || !!t.heredado;
      if (!conClip && !conImagen) continue;

      const propia = t.reusa !== null && t.reusa !== undefined
        ? (z.tomas || []).find((x) => x.i === t.reusa)
        : t;
      const de = { pieza: z.id, i: t.i, titulo: z.titulo };
      if (conClip && !clips.has(k)) {
        clips.set(k, {
          ...de,
          clave: t.heredadoVid || propia?.heredadoVid || claveToma(z.id, (propia || t).i, 'vid'),
        });
      }
      if (conImagen && !imagenes.has(k)) {
        imagenes.set(k, {
          ...de,
          clave: t.heredado || propia?.heredado || claveToma(z.id, (propia || t).i, 'img'),
        });
      }
    }
  }

  const salida = [];
  for (const t of tomas) {
    if (!t.plano) continue;
    const k = huellaDePlano(t);
    if (t.movimiento) {
      if (t.heredadoVid || t.video === 'ok') continue;
      const c = clips.get(k);
      if (c) salida.push({ i: t.i, de: c, tipo: 'vid' });
    } else {
      if (t.heredado || t.imagen === 'ok') continue;
      const c = imagenes.get(k);
      if (c) salida.push({ i: t.i, de: c, tipo: 'img' });
    }
  }
  return salida;
}

const huellaDePlano = (t) =>
  [t.plano?.lugar, t.plano?.encuadre, t.plano?.luz]
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' · ');

/**
 * Empareja los planos gemelos DENTRO del mismo caso.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «La toma 18 y la 50 usan la misma imagen; el video de la 50 se generó, pero
 *  la 18 no lo agarró automático.»
 *
 * El emparejamiento por plano existía ENTRE casos (el banco) y no dentro del
 * mismo caso: ahí solo compartían material las tomas que el director enlazó con
 * `igualQue` al dirigir. Dos tomas con el mismo lugar, encuadre y luz que no
 * quedaron enlazadas —porque el enlace se cayó por la clase, porque se
 * re-dirigió, porque el clip llegó después a mano— pagaban cada una lo suyo y
 * ni se enteraban de que su gemela ya tenía el material.
 *
 * Esto los busca por la misma huella que el banco y devuelve los CAMBIOS: quién
 * debe heredar qué clave. No genera nada, no borra nada, no toca al que ya
 * tiene material propio. Quien llama los aplica y guarda.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function emparejarDentroDelCaso(idPieza, tomas) {
  const clips = new Map();
  const imagenes = new Map();
  for (const t of tomas) {
    if (!t.plano) continue;
    const k = huellaDePlano(t);
    if (!k) continue;
    const dueña = t.reusa !== null && t.reusa !== undefined ? tomas.find((y) => y.i === t.reusa) || t : t;
    if (!clips.has(k) && (t.heredadoVid || dueña.heredadoVid || dueña.video === 'ok')) {
      clips.set(k, claveClip(idPieza, t, tomas));
    }
    if (!imagenes.has(k) && (t.heredado || dueña.heredado || dueña.imagen === 'ok')) {
      imagenes.set(k, claveFotograma(idPieza, t, tomas));
    }
  }

  const cambios = [];
  for (const t of tomas) {
    if (!t.plano || t.reusa !== null) continue;
    const k = huellaDePlano(t);

    const clip = clips.get(k);
    const sinClip = !t.heredadoVid && t.video !== 'ok';
    if (clip && sinClip && clip !== claveToma(idPieza, t.i, 'vid')) {
      // Hereda el clip Y pasa a ser toma con movimiento: el montaje lo usa ya.
      cambios.push({ i: t.i, heredadoVid: clip, movimiento: true, dice: `la toma ${t.i + 1} usa el clip de su plano gemelo` });
    }

    const img = imagenes.get(k);
    const sinImagen = !t.heredado && t.imagen !== 'ok';
    if (img && sinImagen && img !== claveToma(idPieza, t.i, 'img')) {
      cambios.push({ i: t.i, heredado: img, dice: `la toma ${t.i + 1} usa la imagen de su plano gemelo` });
    }
  }
  return cambios;
}

/**
 * Elige las referencias de una toma (§4.6).
 *
 * Se buscan entre las tomas YA generadas las que comparten lugar o sujetos: son las
 * que tienen que parecerse. Sin esto, cada toma inventa su propio protagonista y su
 * propio pueblo, y se nota en cuanto hay dos tomas seguidas del mismo sitio.
 */
export function elegirReferencias(toma, tomas, maximo = 3) {
  const p = toma.plano;
  if (!p) return [];
  const sujetos = new Set((p.sujetos || []).map((s) => s.toLowerCase().trim()));

  const puntuar = (otra) => {
    if (otra.i === toma.i || otra.imagen !== 'ok' || !otra.plano) return 0;
    let n = 0;
    if (otra.plano.lugar && p.lugar && otra.plano.lugar.toLowerCase() === p.lugar.toLowerCase()) n += 3;
    for (const s of otra.plano.sujetos || []) {
      if (sujetos.has(s.toLowerCase().trim())) n += 2;
    }
    if (otra.escena === toma.escena) n += 1;
    return n;
  };

  return tomas
    .map((o) => ({ o, n: puntuar(o) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.o.i - b.o.i)
    .slice(0, maximo)
    .map((x) => x.o);
}

/**
 * Compone la instrucción de imagen.
 *
 * §7.11 — Extremo a extremo, sin término medio: se pasó de «todos los sujetos de
 * espaldas» a «todos mirando a cámara», y las dos son igual de malas. La lección:
 * el prompt fija el FORMATO y deja libre la PUESTA EN ESCENA. Por eso aquí se dice
 * explícitamente «decide tú el encuadre y la distancia».
 */
export function componerInstruccion(toma, config, { conReferencias = false, tratamiento = null } = {}) {
  const p = toma.plano;
  const estilo = estiloPorId(config?.imagen?.estilo);
  const v = tratamiento?.identidadVisual;

  // Quién sale en cuadro. NO ESTABA, y el director sí lo decidía: la ficha traía
  // `sujetos` y nadie se lo contaba al generador de imágenes, así que aunque
  // dijera «dos personas discutiendo en el portal», la instrucción solo llevaba la
  // descripción y salía el portal vacío. Por eso casi todo eran objetos.
  const gente = (p.sujetos || []).filter(Boolean);

  const partes = [
    p.descripcion,
    gente.length
      ? `EN CUADRO HAY PERSONAS: ${gente.join(', ')}. Se ven, hacen algo y ocupan el ` +
        `plano; no es un lugar vacío. Son intérpretes de una dramatización.`
      : '',
    `Encuadre: ${p.encuadre}.`,
    p.lugar ? `Lugar: ${p.lugar}.` : '',
    p.luz ? `Luz: ${p.luz}.` : '',
    // El estilo dice de qué CLASE es la imagen; el tratamiento del director dice
    // cómo es la de ESTA pieza. Los dos, en ese orden.
    estilo.prompt,
    v ? `Paleta: ${v.paleta}. Luz general: ${v.luz}. Textura: ${v.textura}.` : '',
    v?.queEvitar ? `Evitar: ${v.queEvitar}.` : '',
    // Lo que hace que sea un fotograma y no una foto de catálogo, y lo que impide
    // los garabatos donde debería haber un expediente. Van en todas las imágenes,
    // sea cual sea el estilo: son las dos cosas que el usuario vio mal de un
    // vistazo, y ninguna de las dos la arregla el estilo por su cuenta.
    OFICIO_CINEMATOGRAFICO,
    SIN_TEXTO_LEGIBLE,
    BARRERA_DOCUMENTAL,
    'Decide tú la puesta en escena: la distancia exacta, la posición de los sujetos y hacia dónde miran.',
  ];

  if (conReferencias) {
    partes.push(
      'Las imágenes adjuntas son referencia de los mismos sujetos y el mismo lugar: ' +
        'mantén su aspecto, su ropa y su arquitectura. No las copies: es otra toma.',
    );
  }

  // §8.2: la barrera se aplica en el prompt, no solo en la conciencia de quien lo
  // escribió. Se puede apagar en la configuración, pero hay que apagarla a mano.
  if (config?.imagen?.prohibirFotorrealismoDePersonasReales) {
    partes.push(
      'IMPORTANTE: no representes el rostro reconocible de ninguna persona real. ' +
        'Si la escena la requiere, resuélvela de espaldas, en penumbra, a contraluz, ' +
        'por un detalle (manos, objetos, documentos) o con el lugar vacío.',
    );
  }

  return partes.filter(Boolean).join(' ');
}

/** Genera el fotograma de una toma. */
export async function generarImagen({ toma, tomas, pieza, config, tratamiento = null, senal, alEsperar }) {
  if (!toma.plano) throw new Error(`La toma ${toma.i} no tiene ficha de plano. Dirige primero.`);

  const usaReferencias = !!config.imagen.aceptaReferencias && config.imagen.maxReferencias > 0;
  let referencias = [];

  if (usaReferencias) {
    const vecinas = elegirReferencias(toma, tomas, config.imagen.maxReferencias);
    const blobs = [];
    for (const v of vecinas) {
      const blob = await local.leerMaterial(claveToma(pieza, v.i, 'img'));
      if (blob) blobs.push(blob);
    }
    // La única puerta de salida de una imagen. Reduce a ~1024 px de lado (§6).
    referencias = await reducirReferencias(blobs, config.imagen.ladoReferencia, config.imagen.maxReferencias);
  }

  const clave = claveToma(pieza, toma.i, 'img');
  const r = await llamar(
    'imagen',
    {
      instruccion: componerInstruccion(toma, config, {
        conReferencias: referencias.length > 0,
        tratamiento,
      }),
      referencias,
      aspecto: config.formato.vertical ? '9:16' : '16:9',
      // Se sube en el mismo viaje: así no hay imágenes que «se generaron» pero no
      // están en ningún sitio (§7.12).
      guardarEn: clave,
    },
    { senal, alEsperar },
  );

  // §7.12: ningún valor de retorno de una escritura se ignora. Si el almacén no
  // confirmó, esto NO cuenta como generado.
  if (!r.guardado?.bytes) {
    throw new Error(`La imagen de la toma ${toma.i} se generó pero el almacén no la confirmó.`);
  }

  // Y AHORA se baja, del almacén y por trozos. NO se pide de vuelta en la misma
  // respuesta: una imagen de 2K en base64 ocupa nueve megas y el tope es 4,5.
  await material(clave, 'image/png', { senal });

  return { ...toma, imagen: 'ok', bytesImagen: r.guardado.bytes };
}

/**
 * El fotograma que le toca a una toma, CON LA REUTILIZACIÓN RESUELTA.
 *
 * §3: «todo el que lee un fotograma pasa por un ayudante que resuelve la
 * reutilización — o vería un hueco donde en realidad hay una imagen compartida».
 * Este es el ayudante del lado del navegador; nadie debe leer `t.imagen` a pelo
 * para decidir si hay fotograma.
 */
export async function fotogramaDe({ toma, tomas, pieza }) {
  const dueña = tomaDelFotograma(toma, tomas);
  const clave = claveToma(pieza, dueña.i, 'img');
  const copia = await local.leerMaterial(clave);
  if (copia) return { clave, blob: copia, de: dueña.i };

  const r = await llamar('bajar', { clave });
  if (!r.existe) return null;
  const blob = deBase64(r.datos, 'image/png');
  await local.guardarMaterial(clave, blob);
  return { clave, blob, de: dueña.i };
}

/**
 * Genera UNA imagen de prueba para ver el estilo antes de pagar ochenta.
 *
 * «Tengo que gastar primero para saber el estilo» era cierto y era el problema. Esto
 * cuesta una imagen.
 *
 * Usa la primera toma con ficha de plano si la hay —así la prueba es del documental
 * de verdad y no de un ejemplo abstracto— y si no, una escena inventada del mismo
 * género.
 */
/**
 * El plano con el que se prueba un estilo.
 *
 * Se usa uno DEL CASO si ya hay tomas dirigidas —comparar estilos sobre una
 * carretera genérica no dice si te sirve para TU documental— y uno de reserva
 * cuando todavía no hay nada, para poder elegir el estilo antes de gastar en
 * imágenes de verdad. Que es el orden en que se decide.
 */
export function planoDePrueba(tomas = [], caso = null) {
  const conPlano = tomas.find((t) => t.plano);
  if (conPlano) return { toma: conPlano, deLaToma: conPlano.i };

  return {
    deLaToma: null,
    toma: {
      i: 0,
      plano: {
        encuadre: 'plano general',
        lugar: caso?.donde || 'una carretera secundaria de noche',
        luz: 'faros y una farola lejana',
        sujetos: [],
        descripcion:
          caso?.imagenSugerida ||
          'Una carretera secundaria vacía de noche, vista desde el arcén.',
      },
    },
  };
}

/**
 * Una imagen POR CADA ESTILO, para poder compararlos y elegir.
 *
 * Antes solo se podía probar el estilo que estuviera puesto, de uno en uno: para
 * comparar seis había que cambiar el desplegable seis veces y quedarse con lo que
 * uno recordara de la anterior. Y elegir el estilo DESPUÉS de generar las imágenes
 * del documental es al revés de como se decide.
 *
 * Cada muestra se guarda con su propia clave, así que volver a esta pantalla las
 * enseña sin volver a pagarlas.
 */
export async function muestrarioDeEstilos({
  tomas = [],
  config,
  caso = null,
  tratamiento = null,
  pieza = 'p01',
  soloLasQueFaltan = true,
  senal,
  alAvanzar,
}) {
  const { toma, deLaToma } = planoDePrueba(tomas, caso);
  const salida = [];

  for (const [n, estilo] of ESTILOS.entries()) {
    if (senal?.aborted) throw new Error('Detenido.');
    const clave = claveMuestra(pieza, estilo.id);

    if (soloLasQueFaltan) {
      const ya = await local.leerMaterial(clave);
      if (ya) {
        salida.push({ estilo, blob: ya, clave, deLaToma, reusada: true });
        alAvanzar?.(n + 1, ESTILOS.length);
        continue;
      }
    }

    // El estilo de ESTA muestra, no el que esté puesto en la configuración.
    const suyo = { ...config, imagen: { ...config.imagen, estilo: estilo.id } };
    const instruccion = componerInstruccion(toma, suyo, { tratamiento });

    const r = await llamar(
      'imagen',
      {
        instruccion,
        aspecto: config.formato.vertical ? '9:16' : '16:9',
        guardarEn: clave,
      },
      { senal },
    );
    if (!r.guardado?.bytes) throw new Error(`La muestra de «${estilo.nombre}» no llegó al almacén.`);
    const blob = await material(clave, 'image/png', { senal });
    salida.push({ estilo, blob, clave, deLaToma, instruccion, reusada: false });
    alAvanzar?.(n + 1, ESTILOS.length);
  }
  return salida;
}

export const claveMuestra = (pieza, estiloId) => `${pieza}/muestra-${estiloId}/img`;

/** Las muestras que ya están guardadas, sin generar ni pagar nada. */
export async function muestrasGuardadas(pieza) {
  const salida = [];
  for (const estilo of ESTILOS) {
    const clave = claveMuestra(pieza, estilo.id);
    const blob = await local.leerMaterial(clave);
    if (blob) salida.push({ estilo, blob, clave, reusada: true });
  }
  return salida;
}

export async function probarEstilo({ tomas = [], config, tratamiento = null, senal }) {
  const conPlano = tomas.find((t) => t.plano);
  const toma = conPlano || {
    i: 0,
    plano: {
      encuadre: 'plano general',
      lugar: 'una carretera secundaria de noche',
      luz: 'faros y una farola lejana',
      sujetos: [],
      descripcion: 'Una carretera secundaria vacía de noche, vista desde el arcén.',
    },
  };

  const instruccion = componerInstruccion(toma, config, { tratamiento });
  const clave = `${config.__pieza || 'p01'}/prueba/img`;
  const r = await llamar(
    'imagen',
    {
      instruccion,
      aspecto: config.formato.vertical ? '9:16' : '16:9',
      // A una clave de prueba, para no pisar la imagen de ninguna toma.
      guardarEn: clave,
    },
    { senal },
  );
  if (!r.guardado?.bytes) throw new Error('La imagen de prueba no llegó al almacén.');

  return {
    instruccion,
    blob: await material(clave, 'image/png', { senal }),
    deLaToma: conPlano ? conPlano.i : null,
  };
}
