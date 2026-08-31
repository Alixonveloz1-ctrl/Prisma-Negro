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
// La rotación del reparto vive en la biblioteca: es quien sabe qué usó cada
// episodio y qué no puede repetirse en los dos siguientes.
import { elegirVariante } from './biblioteca.js';
import { reducirReferencias, deBase64 } from '../imagenes.js';
import { ESTILO_DEL_CANAL, BARRERA_DOCUMENTAL, SIN_TEXTO_LEGIBLE, MUNDO_NEUTRO } from '../../comun/estilos.mjs';
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
export function heredables(tomas, piezasAnteriores, reparto = null) {
  // Dos bancos separados: uno de fotogramas y otro de CLIPS. Un clip no sirve
  // como imagen fija ni al revés, así que se buscan por su lado. Y el de clips es
  // el que más ahorra: un clip cuesta muchas veces lo que una imagen.
  const imagenes = new Map();
  const clips = new Map();
  // Y UN TERCER BANCO: EL DE ARQUETIPOS.
  //
  // Los dos de arriba buscan por la huella del plano —lugar, encuadre, luz— y eso
  // solo encuentra lo que coincide por casualidad. El perito forense de este
  // episodio no coincide con el del anterior salvo que el director escriba las
  // tres cosas letra por letra igual, y no lo hace: escribe «el laboratorio» una
  // vez y «la sala del laboratorio» la siguiente.
  //
  // El arquetipo sí es una clave estable —sale del catálogo, no de la redacción—,
  // así que una toma marcada con `personaje: 'perito'` encuentra el plano del
  // perito de la biblioteca aunque el texto no se parezca en nada. Es lo que
  // convierte la biblioteca en algo que se usa solo, en vez de en un banco que
  // hay que acertar.
  // Y OTRO POR RECURSO, por lo mismo: «la carretera comarcal de noche» es una
  // clave del catálogo y «una carretera de noche con lluvia» es una redacción.
  //
  // Los dos guardan TODAS las versiones que hay de cada clave, no la primera: de
  // ahí sale la rotación, que es lo que impide que el mismo perito salga en tres
  // episodios seguidos.
  const porArquetipo = new Map();
  const porRecurso = new Map();
  const guardar = (mapa, clave, z, t) => {
    if (!clave) return;
    const conVid = t.video === 'ok' || !!t.heredadoVid;
    const conImg = t.imagen === 'ok' || !!t.heredado;
    if (!conVid && !conImg) return;
    if (!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave).push({
      // La versión concreta —`v3`—, que es lo que se anota en el reparto para no
      // repetirla en los dos episodios siguientes.
      id: t.variante || `t${t.i}`,
      pieza: z.id,
      i: t.i,
      titulo: z.titulo,
      vid: conVid ? t.heredadoVid || claveToma(z.id, t.i, 'vid') : null,
      img: conImg ? t.heredado || claveToma(z.id, t.i, 'img') : null,
    });
  };

  for (const z of piezasAnteriores) {
    for (const t of z.tomas || []) {
      if (!t.plano) continue;
      guardar(porArquetipo, String(t.personaje || t.plano?.personaje || '').trim().toLowerCase(), z, t);
      guardar(porRecurso, String(t.recurso || t.plano?.recurso || '').trim().toLowerCase(), z, t);
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

  // EL MOVIMIENTO DE LA TOMA NO DECIDE QUÉ PUEDE HEREDAR.
  //
  // ─────────────────────────────────────────────────────────────────────────────
  // «En una toma donde heredé la imagen de otra toma, que también tenía video,
  //  solo se está mostrando la imagen, no se está mostrando el video.»
  //
  // Esto miraba `t.movimiento` y ELEGÍA UNA RAMA: con movimiento, solo clips; sin
  // movimiento, solo imágenes. Una toma fija cuyo plano ya tenía un clip pagado
  // heredaba la imagen y dejaba el clip en el estante — y una toma con movimiento
  // a la que no le encontraba clip se quedaba sin nada, ni siquiera la imagen que
  // sí estaba.
  //
  // `movimiento` es una PROPUESTA del director sobre esta toma, no una regla sobre
  // qué material sirve. Si el plano ya tiene clip, el clip vale: está pagado, es lo
  // caro, y se ve mejor. Es lo mismo que hace el emparejador de planos gemelos
  // dentro del caso, que sí heredaba las dos cosas.
  //
  // Y cuando hereda el clip, hereda TAMBIÉN su imagen si la hay: el clip salió de
  // ella, la previa la usa de cartel, y sin ella la toma apuntaría a un fotograma
  // local que nadie generó.
  // ─────────────────────────────────────────────────────────────────────────────
  // EL REPARTO DE ESTE EPISODIO, decidido UNA VEZ para toda la pieza.
  //
  // Se elige aquí arriba y no dentro del bucle a propósito: si el perito se
  // eligiera toma a toma, un episodio con cuatro testimonios del perito tendría
  // cuatro peritos distintos. Dentro de un episodio la persona es la misma; lo
  // que rota es de un episodio al siguiente.
  const elegidas = new Map();
  const elegir = (mapa, clave) => {
    if (!clave || !mapa.has(clave)) return null;
    const marca = `${mapa === porArquetipo ? 'personaje' : 'recurso'}:${clave}`;
    if (elegidas.has(marca)) return elegidas.get(marca);
    const v = elegirVariante({
      clave: marca,
      disponibles: mapa.get(clave),
      historial: reparto?.historial || {},
      orden: reparto?.orden || [],
      pieza: reparto?.pieza || '',
    });
    elegidas.set(marca, v);
    return v;
  };

  const salida = [];
  for (const t of tomas) {
    if (!t.plano) continue;
    const k = huellaDePlano(t);

    // LA CLAVE DE CATÁLOGO MANDA SOBRE LA HUELLA. Si esta toma es el testimonio
    // del perito y la biblioteca tiene peritos, ese es el plano — da igual cómo se
    // haya redactado el lugar en este episodio. Es la resolución que de verdad
    // ahorra, porque no depende de que dos textos coincidan.
    const dela =
      elegir(porArquetipo, String(t.personaje || t.plano?.personaje || '').trim().toLowerCase()) ||
      elegir(porRecurso, String(t.recurso || t.plano?.recurso || '').trim().toLowerCase());

    if (!t.heredadoVid && t.video !== 'ok') {
      const c = dela?.vid ? { ...dela, clave: dela.vid } : clips.get(k);
      if (c) salida.push({ i: t.i, de: c, tipo: 'vid' });
    }
    if (!t.heredado && t.imagen !== 'ok') {
      const g = dela?.img ? { ...dela, clave: dela.img } : imagenes.get(k);
      if (g) salida.push({ i: t.i, de: g, tipo: 'img' });
    }
  }

  // Lo elegido se devuelve aparte para que quien llama lo ANOTE en el registro:
  // sin anotarlo, el episodio siguiente no sabría a quién no puede repetir.
  salida.reparto = Object.fromEntries([...elegidas].filter(([, v]) => v).map(([m, v]) => [m, v.id]));
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
/**
 * La huella ESTRICTA: la ficha entera, letra por letra.
 *
 * El emparejado automático dentro del caso no puede usar la huella suelta del
 * banco (lugar + encuadre + luz): el cuarto del hospital con el paciente grave
 * y el mismo cuarto con el paciente mejorado dan la misma huella suelta, y ahí
 * van DOS imágenes — el sitio se repite, la escena no. Solo si la descripción y
 * los sujetos también son idénticos es de verdad la misma imagen. Lo que se
 * parece sin ser idéntico lo decide una persona, con «Gemela de…».
 */
const huellaEstricta = (t) =>
  [
    t.plano?.lugar,
    t.plano?.encuadre,
    t.plano?.luz,
    (t.plano?.sujetos || []).join('|'),
    t.plano?.descripcion,
  ]
    .map((x) => String(x || '').trim().toLowerCase().replace(/\s+/g, ' '))
    .join(' · ');

export function emparejarDentroDelCaso(idPieza, tomas) {
  const clips = new Map();
  const imagenes = new Map();
  for (const t of tomas) {
    if (!t.plano) continue;
    const k = huellaEstricta(t);
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
    const k = huellaEstricta(t);

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
export function componerInstruccion(
  toma,
  config,
  { conReferencias = false, tratamiento = null, mundo = MUNDO_NEUTRO } = {},
) {
  const p = toma.plano;
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
    // El estilo del canal dice de qué CLASE es la imagen; el tratamiento del
    // director dice cómo es la de ESTA pieza. Los dos, en ese orden — y la
    // variedad entre episodios sale del segundo, que no cuesta nada.
    ESTILO_DEL_CANAL,
    v ? `Paleta: ${v.paleta}. Luz general: ${v.luz}. Textura: ${v.textura}.` : '',
    v?.queEvitar ? `Evitar: ${v.queEvitar}.` : '',
    // Y lo que impide los garabatos donde debería haber un expediente. Va aparte
    // del aspecto a propósito: es una regla del generador —no sabe escribir—, no
    // una decisión de cómo se ve el canal, y tiene que sobrevivir a cualquier
    // cambio de aspecto.
    SIN_TEXTO_LEGIBLE,
    BARRERA_DOCUMENTAL,
    // EN QUÉ MUNDO PASA. Esto SÍ es del caso —el episodio ocurre en un país real
    // y concreto—, pero no se escribe en cada descripción de plano: se pasa una
    // vez y llega a todas, porque si dependiera de que alguien lo escriba plano a
    // plano se perdería en el primero que se olvide. Sin `mundo`, el neutro: una
    // imagen que no sabe dónde pasa no puede inventárselo.
    mundo,
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
export async function generarImagen({
  toma,
  tomas,
  pieza,
  config,
  tratamiento = null,
  // EN QUÉ PAÍS PASA ESTE EPISODIO. Sin él, el mundo neutro: una imagen de
  // archivo —o una toma de un caso sin país— no puede inventarse un sitio, y una
  // del episodio tiene que llevar el suyo. Ver `mundoDelCaso`.
  mundo = MUNDO_NEUTRO,
  senal,
  alEsperar,
}) {
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
        mundo,
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

  // CADA IMAGEN GENERADA SUBE LA VERSIÓN, y de ahí sale que un clip sepa si
  // todavía le corresponde. Ver `clipVigente` en `comun/claves.mjs`.
  return {
    ...toma,
    imagen: 'ok',
    bytesImagen: r.guardado.bytes,
    versionImagen: (Number(toma.versionImagen) || 0) + 1,
  };
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
  // Por `claveFotograma`, NO componiendo la clave local a mano: si la imagen es
  // heredada —de otro caso o de un plano gemelo de este—, la clave local no
  // existe, esto devolvía «no hay fotograma», y convertir a clip GENERABA una
  // imagen nueva idéntica a la ya pagada. La herencia también vale de partida.
  const clave = claveFotograma(pieza, toma, tomas);
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
