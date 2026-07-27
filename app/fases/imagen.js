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
import { claveToma, tomaDelFotograma } from '../../comun/claves.mjs';
import { reducirReferencias, deBase64 } from '../imagenes.js';
import { estiloPorId, BARRERA_DOCUMENTAL } from '../../comun/estilos.mjs';
import * as local from '../local.js';

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
    return soloLasQueFaltan ? t.imagen !== 'ok' : true;
  });
}

/**
 * Qué planos de las piezas anteriores sirven para esta.
 *
 * Una continuación del mismo caso vuelve a los mismos sitios: la fachada, el
 * pasillo, la carretera. Volver a generarlos es pagar dos veces por la misma
 * imagen —y encima sale distinta, que en un documental se nota—.
 *
 * Se compara el LUGAR y el ENCUADRE, que es lo que hace que dos planos se vean
 * iguales. La luz no: la misma fachada de noche y de día es otro plano.
 */
export function heredables(tomas, piezasAnteriores) {
  const antes = new Map();
  for (const z of piezasAnteriores) {
    for (const t of z.tomas || []) {
      if (t.imagen !== 'ok' || !t.plano) continue;
      const k = huellaDePlano(t);
      if (k && !antes.has(k)) antes.set(k, { pieza: z.id, i: t.i, titulo: z.titulo });
    }
  }
  const salida = [];
  for (const t of tomas) {
    if (t.heredado || t.imagen === 'ok' || !t.plano) continue;
    const c = antes.get(huellaDePlano(t));
    if (c) salida.push({ i: t.i, de: c });
  }
  return salida;
}

const huellaDePlano = (t) =>
  [t.plano?.lugar, t.plano?.encuadre, t.plano?.luz]
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' · ');

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

  const partes = [
    p.descripcion,
    `Encuadre: ${p.encuadre}.`,
    p.lugar ? `Lugar: ${p.lugar}.` : '',
    p.luz ? `Luz: ${p.luz}.` : '',
    // El estilo dice de qué CLASE es la imagen; el tratamiento del director dice
    // cómo es la de ESTA pieza. Los dos, en ese orden.
    estilo.prompt,
    v ? `Paleta: ${v.paleta}. Luz general: ${v.luz}. Textura: ${v.textura}.` : '',
    v?.queEvitar ? `Evitar: ${v.queEvitar}.` : '',
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
export async function generarImagen({ toma, tomas, pieza, config, tratamiento = null, senal }) {
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
      devolver: true,
    },
    { senal },
  );

  // §7.12: ningún valor de retorno de una escritura se ignora. Si el almacén no
  // confirmó, esto NO cuenta como generado.
  if (!r.guardado?.bytes) {
    throw new Error(`La imagen de la toma ${toma.i} se generó pero el almacén no la confirmó.`);
  }

  // La copia local sirve de referencia para las tomas siguientes sin volver a
  // bajarla (§1: el navegador tiene una copia, no el original).
  if (r.datos) {
    await local.guardarMaterial(clave, deBase64(r.datos, r.tipo || 'image/png'));
  }

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
  const r = await llamar(
    'imagen',
    {
      instruccion,
      aspecto: config.formato.vertical ? '9:16' : '16:9',
      // A una clave de prueba, para no pisar la imagen de ninguna toma.
      guardarEn: `${config.__pieza || 'p01'}/prueba/img`,
      devolver: true,
    },
    { senal },
  );

  return {
    instruccion,
    blob: r.datos ? deBase64(r.datos, r.tipo || 'image/png') : null,
    deLaToma: conPlano ? conPlano.i : null,
  };
}
