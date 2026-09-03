// Fase 10 — Metadatos de publicación (§4.10 y §8.4 del plano).
//
//   «Título, descripción con marcas de tiempo, etiquetas. Salen del guion YA
//    SEGMENTADO, así que los tiempos son REALES.»
//
// Ese detalle es la fase entera. Las marcas de tiempo no se las inventa un modelo
// leyendo el guion: salen de `inicio` de cada escena, que sale de las duraciones
// medidas sobre el audio generado. Un modelo estimando minutos se equivoca siempre,
// y una descripción con capítulos que no caen donde dicen es peor que no ponerlos.
//
// §8.4 pide además pie de fuentes, y en un documental eso no es opcional: es lo que
// hace que las fichas de §8.1 sirvan de algo de cara al público.

import { llamar } from '../api.js';

const ESQUEMA = {
  type: 'object',
  properties: {
    titulos: { type: 'array', items: { type: 'string' } },
    descripcion: { type: 'string' },
    tituloEscenas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { n: { type: 'integer' }, titulo: { type: 'string' } },
        required: ['n', 'titulo'],
      },
    },
  },
  required: ['titulos', 'descripcion', 'tituloEscenas'],
};

/** `754.2` → `12:34`. Con horas cuando hace falta. */
export function marcaDeTiempo(segundos) {
  const s = Math.max(0, Math.floor(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const g = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(g).padStart(2, '0')}`
    : `${m}:${String(g).padStart(2, '0')}`;
}

/**
 * Los tiempos REALES de cada escena, calculados sobre las duraciones medidas.
 *
 * Si alguna toma no tiene audio todavía, se dice: una lista de capítulos calculada
 * a medias es una lista de capítulos equivocada.
 */
export function tiemposDeEscenas(tomas, escenas) {
  const sinMedir = tomas.filter((t) => !t.medida).length;
  let reloj = 0;
  const marcas = [];
  let escenaActual = null;

  for (const t of tomas) {
    if (t.escena !== escenaActual) {
      escenaActual = t.escena;
      marcas.push({
        n: t.escena,
        segundos: reloj,
        marca: marcaDeTiempo(reloj),
        titulo: escenas.find((e) => e.n === t.escena)?.titulo || '',
      });
    }
    reloj += t.segundos || 0;
  }

  return { marcas, total: reloj, sinMedir, fiable: sinMedir === 0 };
}

/**
 * El texto que se pega al publicar, tal cual: título, descripción con capítulos,
 * y las etiquetas ya en forma de hashtag.
 *
 * Va en el paquete de entrega como un .txt porque publicar desde un teléfono es
 * copiar y pegar, y tener que recomponer esto a mano en el móvil —con la lista
 * de capítulos y quince etiquetas— es donde se pierde la mitad del trabajo.
 *
 * Sobre los hashtags: son los que el modelo saca DEL CASO, y eso es lo honesto.
 * Esta herramienta no sabe qué es tendencia hoy, y meter etiquetas de moda que
 * no tienen que ver con el video es lo que hunde el alcance en vez de subirlo.
 */
export function textoDePublicacion(m, titulo) {
  if (!m) return '';
  // DOS COPIAS Y NO CINCO. Son dos campos distintos de YouTube y no hay forma de
  // juntarlos más: la descripción —que ya lleva los hashtags dentro— y el campo
  // de etiquetas, que va sin almohadilla.
  //
  // Y los títulos a secas: «¿Para qué les pones esa etiqueta diciendo qué es la
  // descripción y qué es las etiquetas? Yo voy a poder entenderlo.» Explicarle a
  // alguien lo que ya sabe le hace leer más para encontrar lo mismo.
  return [
    `TÍTULO`,
    (m.titulos || [])[0] || titulo || '',
    '',
    (m.titulos || []).length > 1 ? 'OTROS TÍTULOS' : '',
    ...(m.titulos || []).slice(1),
    (m.titulos || []).length > 1 ? '' : '',
    'DESCRIPCIÓN',
    m.descripcion || '',
    '',
    'ETIQUETAS',
    (m.etiquetas || []).join(', '),
  ]
    .filter((x) => x !== '' || true)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * LAS ETIQUETAS DEL CANAL, QUE SON LAS QUE BUSCA ALGUIEN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Esas etiquetas no sirven, porque son etiquetas específicas del episodio.
 *  Tienen que ser genéricas de documentales de crimen, para que puedan realmente
 *  tener impacto. De nada me sirven etiquetas específicas del episodio cuando es
 *  un canal nuevo que nadie conoce y un episodio nuevo que nadie conoce.»
 *
 * Tenía razón y es aritmética: «tetrápodo hueco» lo busca cero personas al mes,
 * porque el episodio lo acaba de inventar esta herramienta. El modelo escribía
 * quince etiquetas leyendo el guion, y leyendo el guion solo se pueden sacar
 * nombres del guion.
 *
 * Así que están escritas aquí, son las mismas para todos los episodios —un canal
 * se busca por su género, no por su capítulo— y no cuestan una llamada: el modelo
 * ya no las escribe.
 *
 * Y son DIEZ. «Diez hashtag, diez etiquetas, no quiero más, solo las esenciales
 * que sean genéricas de este tipo de contenido.» Ninguna lista larga rinde más
 * que su cabeza: las de abajo no las busca nadie y diluyen las de arriba.
 *
 * NINGUNA dice que el caso sea real. El canal es ficción documental y lo declara
 * en la descripción y al final del video; etiquetarlo como «casos reales» sería
 * decir en el buscador lo contrario de lo que dice el video. Los nombres de
 * GÉNERO —true crime, documental de crimen, misterio— son el sitio donde vive
 * esto, y eso sí es verdad.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const ETIQUETAS_DEL_CANAL = [
  'true crime',
  'true crime en español',
  'documental de crimen',
  'casos sin resolver',
  'misterios sin resolver',
  'crimen sin resolver',
  'documental de misterio',
  'historias de crimen',
  'documental completo en español',
  'suspenso',
];

/**
 * Los hashtags, listos para pegar.
 *
 * «Las etiquetas están saliendo sin hashtag. De nada me sirve, igual tengo que
 *  hacer trabajo manual poniéndole hashtag uno por uno.»
 *
 * Diez, los mismos que las etiquetas. YouTube enseña los tres primeros encima del
 * título y a partir de quince los ignora TODOS.
 */
export const HASHTAGS_MAXIMOS = 10;
export const hashtagsDe = (etiquetas = []) =>
  [...new Set((etiquetas || []).map(comoHashtag).filter(Boolean))].slice(0, HASHTAGS_MAXIMOS);

/** «crimen sin resolver» → «#crimensinresolver». Sin tildes ni signos. */
function comoHashtag(etiqueta) {
  const limpio = String(etiqueta || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .join('');
  return limpio ? `#${limpio.toLowerCase()}` : '';
}

export async function generarMetadatos({ tema, guion, tomas, escenas, fichas = [], senal }) {
  const tiempos = tiemposDeEscenas(tomas, escenas);
  // ARRIBA DEL TODO, porque lo lee la instrucción que va a salir: declarado
  // después de la llamada reventaba con «no se puede acceder antes de
  // inicializar», y justo en la fase que se ejecuta una sola vez al final.
  const ficcion = esFiccion(fichas);

  const r = await llamar(
    'texto',
    {
      sistema:
        'Escribes los metadatos de publicación de un documental para YouTube y ' +
        'Facebook. Títulos concretos y honestos: nada de cebo, nada de "lo que nadie ' +
        'te contó", nada de MAYÚSCULAS de más. La descripción empieza por dos frases ' +
        'que dicen de qué va, sin rodeos. NO escribas tú las marcas de tiempo: se ' +
        'añaden después con los tiempos reales.' +
        // Sin esto, la descripción de un episodio construido dice «un caso real
        // que conmocionó a la comarca»: el modelo lee un guion que suena a
        // documental y escribe lo que ve. La declaración de ficción va aparte y
        // se compone en el código, pero la sinopsis tampoco puede mentir.
        (ficcion
          ? '\nESTE EPISODIO ES FICCIÓN DOCUMENTAL: el caso está inventado. No lo ' +
            'presentes como un caso real, ni digas «caso real», ni «hechos reales», ' +
            'ni «ocurrió en». Habla del episodio y de la historia que cuenta.'
          : ''),
      instruccion:
        `Tema: ${tema}\n\nGUION:\n${guion.slice(0, 12000)}\n\n` +
        `Escenas: ${tiempos.marcas.map((m) => `[${m.n}] ${m.titulo}`).join(', ')}\n\n` +
        `Devuelve: 4 títulos alternativos (máx. 70 caracteres), una descripción de ` +
        `2 o 3 párrafos, y un título corto para cada escena (para la lista de ` +
        `capítulos). Las etiquetas no las escribes tú: son las del canal.`,
      esquema: ESQUEMA,
      temperatura: 0.7,
    },
    { senal },
  );

  const j = r.json || {};
  const titulosEscena = new Map((j.tituloEscenas || []).map((e) => [e.n, e.titulo]));

  // Las marcas de tiempo se componen AQUÍ, con los tiempos reales. El modelo solo
  // puso los nombres.
  const capitulos = tiempos.marcas.map((m) => ({
    ...m,
    titulo: titulosEscena.get(m.n) || m.titulo || `Parte ${m.n + 1}`,
  }));

  const pieDeFuentes = componerPieDeFuentes(fichas);

  return {
    titulos: j.titulos || [],
    // Las del canal y nada más: ver `ETIQUETAS_DEL_CANAL`.
    etiquetas: ETIQUETAS_DEL_CANAL,
    descripcion: [
      // LA DECLARACIÓN VA LA PRIMERA. Ver la cabecera de `DECLARACION_DE_FICCION`:
      // el episodio se ve igual que un documental, y eso es exactamente lo que
      // obliga a decirlo donde no se puede pasar por alto.
      ficcion ? DECLARACION_DE_FICCION + '\n' : '',
      j.descripcion || '',
      '',
      'Capítulos:',
      ...capitulos.map((c) => `${c.marca} ${c.titulo}`),
      pieDeFuentes ? '\nFuentes:\n' + pieDeFuentes : '',
      // Y LOS HASHTAGS DENTRO, AL FINAL.
      //
      // «No tengo por qué copiarlas y pegarlas individualmente.» Los hashtags van
      // en la descripción: si viven en una caja aparte, hay que pegarlos a mano
      // en su sitio cada vez. Yendo dentro, pegar la descripción los pone donde
      // van — y donde YouTube los lee.
      '\n' + hashtagsDe(ETIQUETAS_DEL_CANAL).join(' '),
    ]
      .filter((x) => x !== null)
      .join('\n')
      .trim(),
    capitulos,
    fiable: tiempos.fiable,
    // Si esto es falso, la lista de capítulos está calculada sobre duraciones
    // estimadas y no cae donde dice. La pantalla tiene que avisarlo.
    aviso: tiempos.fiable
      ? null
      : `${tiempos.sinMedir} tomas no tienen audio generado: los tiempos de los ` +
        `capítulos son estimados y no van a coincidir con el video. Genera la ` +
        `narración completa antes de publicar.`,
    duracion: marcaDeTiempo(tiempos.total),
  };
}

/**
 * La declaración de ficción, cuando el caso está construido.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO NO ES OPCIONAL Y NO DEPENDE DE QUE ALGUIEN SE ACUERDE.
 *
 * El episodio se ve exactamente igual que un documental: el mismo tono, los
 * mismos planos, los mismos testimonios, la misma voz sobria. Esa es la gracia
 * del formato, y es justamente lo que lo hace indistinguible de uno real si nadie
 * lo dice. Un caso inventado presentado como caso real es una mentira, y da igual
 * que la persona de la víctima no exista: lo que se falsea es la naturaleza de la
 * pieza, y con eso se hunde el canal el día que alguien lo descubra.
 *
 * Así que va en el sitio donde no se puede pasar por alto: LO PRIMERO de la
 * descripción, antes de la sinopsis, antes de los capítulos y antes de las
 * etiquetas. No en un pie que nadie despliega.
 *
 * Y va compuesta aquí, en el código, no pedida al modelo: una frase generada
 * puede salir distinta, más suave, o no salir.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const DECLARACION_DE_FICCION =
  'FICCIÓN DOCUMENTAL. Este episodio es una obra de ficción: el caso, las ' +
  'personas, los lugares y las instituciones que aparecen son inventados, y ' +
  'cualquier parecido con hechos o personas reales es casualidad. Las imágenes ' +
  'están generadas y las personas que se ven son intérpretes de una dramatización.';

/**
 * LA DECLARACIÓN QUE SE NARRA, y va antes que nada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * La de arriba va en la descripción, y eso es lo que se creía suficiente. El canal
 * de referencia hace algo más, y es lo PRIMERO que se oye en el vídeo, antes
 * incluso de «Imagina esta escena»:
 *
 *   «Todo el contenido de este episodio fue producido y reconstruido por
 *    Crímenes Imperfectos, Expedientes X.»
 *
 * Una descripción se despliega; una línea narrada la oye todo el mundo, incluido
 * quien llega por una recomendación y no lee nada. Es la protección más barata que
 * existe y dura nueve segundos.
 *
 * Va compuesta aquí, en el código, por el mismo motivo que la otra: una frase
 * generada puede salir distinta, más suave, o no salir.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const DECLARACION_NARRADA =
  'Todo el contenido de este episodio fue producido y reconstruido por Prisma ' +
  'Negro. El caso, las personas y los lugares son obra de ficción.';

/**
 * ¿Es ficción? SIEMPRE, y la función se queda para que la afirmación tenga un
 * sitio y una invariante que la vigile. El canal no tiene otro modo: si algún día
 * lo tuviera, esto es lo primero que habría que volver a mirar.
 */
export const esFiccion = () => true;

/**
 * El pie de fuentes (§8.4).
 *
 * Sale del almacén de fichas, no de la memoria del modelo. Es lo que permite que,
 * cuando alguien discuta un dato, se sepa de dónde salió sin releer nada (§8.1).
 *
 * Un expediente construido no tiene fuentes y no se le inventan: lo que lleva es
 * la declaración de ficción, que va arriba del todo y no aquí abajo.
 */
export function componerPieDeFuentes(fichas) {
  // NUNCA HAY PIE DE FUENTES: el caso está inventado y no tiene fuentes. Un pie
  // vacío o inventado insinúa un respaldo que no existe, que es peor que ninguno.
  return '';
  // eslint-disable-next-line no-unreachable
  const utiles = (fichas || []).filter((f) => f.fuente);
  if (!utiles.length) return '';

  const vistas = new Set();
  return utiles
    .filter((f) => {
      const k = f.fuente.toLowerCase().trim();
      if (vistas.has(k)) return false;
      vistas.add(k);
      return true;
    })
    .map((f) => `· ${f.fuente}${f.fecha ? ` (${f.fecha})` : ''}${f.enlace ? ` — ${f.enlace}` : ''}`)
    .join('\n');
}
