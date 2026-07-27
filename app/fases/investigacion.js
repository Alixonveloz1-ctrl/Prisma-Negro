// Fase 1 — Investigación (§4.1 y §8.1 del plano).
//
//   «Produce FICHAS: hecho + fuente + fecha + cita textual. El guion se escribe
//    después, y cada afirmación del guion apunta a una ficha. Sin esto no hay
//    documental, hay opinión.»
//
// Es la fase que NO existe en el proyecto de origen y hay que construir. También es
// la que distingue esta herramienta de un generador de videos bonitos: sin el
// almacén de fichas, cuando alguien discuta un dato hay que releerlo todo.

import { llamar } from '../api.js';

// ── Paso 1: buscar casos reales ───────────────────────────────────────────────
//
// Antes de que haya tema, hay una BÚSQUEDA. La herramienta sale a internet, trae
// cinco casos reales que dan para documental, y la persona elige uno. De ahí en
// adelante todo lo demás cuelga de esa elección.
//
// Se busca de verdad —con la herramienta de búsqueda del modelo—, no de memoria: un
// modelo recordando casos inventa fechas y nombres con total aplomo, y en un
// documental eso es el fallo que hunde el canal (§8.2).

const ESQUEMA_CASOS = {
  type: 'object',
  properties: {
    casos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          gancho: { type: 'string' },
          sinopsis: { type: 'string' },
          cuando: { type: 'string' },
          donde: { type: 'string' },
          porQueFunciona: { type: 'string' },
          imagenSugerida: { type: 'string' },
          documentado: { type: 'boolean' },
        },
        required: ['titulo', 'gancho', 'sinopsis', 'cuando', 'donde', 'porQueFunciona', 'imagenSugerida', 'documentado'],
      },
    },
  },
  required: ['casos'],
};

/**
 * Trae cinco casos reales entre los que elegir.
 *
 * `tema` es opcional: sin él busca casos abiertos; con él, casos de ese terreno.
 */
export async function buscarCasos({ tema = null, epoca = null, evitar = [], cuantos = 5, senal } = {}) {
  const yaVistos = evitar.length
    ? `\n\nNO propongas ninguno de estos, ya se descartaron:\n${evitar.slice(-25).map((t) => `- ${t}`).join('\n')}`
    : '';

  // La época va DURA en la instrucción y repetida al final.
  //
  // Sin acotarla, la búsqueda devuelve lo más publicado, y lo más publicado es lo
  // más viejo: un caso de 1888 lleva siglo y medio escribiéndose y uno de hace dos
  // años todavía no. Salían casos del XIX una y otra vez por esto.
  const desde = epoca?.desde?.() ?? null;
  const corte = desde
    ? `\n\nLÍMITE DE FECHA, y es obligatorio: los hechos tienen que haber ocurrido ` +
      `DE ${desde} EN ADELANTE. Un caso anterior a ${desde} no vale aunque sea bueno. ` +
      `Si no encuentras cinco de ese periodo, devuelve menos, pero NINGUNO anterior.`
    : '';

  const r = await llamar(
    'texto',
    {
      // La búsqueda de verdad. Sin esto el modelo tira de memoria y se inventa las
      // fechas con una seguridad que engaña.
      buscarEnInternet: true,
      sistema:
        'Eres documentalista de investigación de un canal de documentales de misterio, ' +
        'crimen real y polémicas del mundo del espectáculo. Buscas casos REALES, ' +
        'comprobables y documentados en fuentes públicas, que den para un documental ' +
        'corto de 8 a 15 minutos.\n\n' +
        'Reglas:\n' +
        '- Solo casos REALES. Nada de leyendas urbanas presentadas como hechos, ni ' +
        'creepypastas, ni casos inventados. Si algo es folclore, no lo propongas.\n' +
        '- Que estén documentados: prensa, expedientes judiciales, informes policiales, ' +
        'archivos oficiales, investigaciones periodísticas.\n' +
        '- Evita casos cuya única fuente sea un vídeo viral o un foro.\n' +
        '- No propongas casos con menores identificables implicados.\n' +
        '- Con personas vivas, cíñete a lo que consta en resoluciones públicas o en ' +
        'prensa de referencia; nada de acusaciones no probadas.\n' +
        '- Variedad: que no sean todos del mismo tipo ni del mismo país.',
      instruccion:
        (tema
          ? `Busca casos reales de este terreno: ${tema.nombre}.\n` +
            `Términos por los que buscar: ${tema.busca}.\n\n`
          : 'Busca casos reales llamativos y bien documentados de misterio, crimen real ' +
            'o polémicas de figuras públicas.\n\n') +
        corte +
        `\n\nDevuelve ${cuantos} casos.\n\n` +
        'Para cada uno:\n' +
        '- titulo: título del documental, corto y concreto. Sin signos de exclamación.\n' +
        '- gancho: una frase de lo que engancha, sin exagerar ni prometer de más.\n' +
        '- sinopsis: 2 o 3 frases de qué pasó.\n' +
        '- cuando: el AÑO en que ocurrió. Obligatorio y real.\n' +
        '- donde: lugar real.\n' +
        '- porQueFunciona: por qué da para documental visual.\n' +
        '- imagenSugerida: descripción visual para la portada, SIN rostros de personas ' +
        'reales identificables.\n' +
        '- documentado: true solo si de verdad hay fuentes públicas sólidas.\n\n' +
        'Responde ÚNICAMENTE con un objeto JSON así:\n' +
        '{"casos":[{"titulo":"","gancho":"","sinopsis":"","cuando":"","donde":"",' +
        '"porQueFunciona":"","imagenSugerida":"","documentado":true}]}' +
        yaVistos +
        (desde ? `\n\nRECUERDA: nada anterior a ${desde}.` : ''),
      esquema: ESQUEMA_CASOS,
      temperatura: 0.85,
      maxTokens: 6000,
    },
    { senal, reintentos: 1 },
  );

  const casos = (r.json?.casos || []).slice(0, cuantos).map((c, i) => ({
    id: `c${Date.now().toString(36)}${i}`,
    titulo: c.titulo || 'Sin título',
    gancho: c.gancho || '',
    sinopsis: c.sinopsis || '',
    cuando: c.cuando || '',
    donde: c.donde || '',
    porQueFunciona: c.porQueFunciona || '',
    imagenSugerida: c.imagenSugerida || '',
    documentado: c.documentado !== false,
    // Las fuentes que el modelo consultó de verdad, para poder volver a ellas.
    fuentes: r.fuentes || [],
  }));

  if (!casos.length) {
    throw new Error('La búsqueda no devolvió ningún caso. Prueba otra vez, o acota el tema.');
  }

  // El filtro de época se aplica TAMBIÉN aquí, sobre lo que vuelve.
  //
  // Decírselo al modelo ayuda pero no obliga: cuela casos viejos igual, sobre todo
  // si son famosos. Comprobarlo en el código es lo único que de verdad lo impide, y
  // se dice cuántos se cayeron para que no parezca que la búsqueda vino floja.
  if (!desde) return { casos, descartados: 0 };

  const dentro = casos.filter((c) => {
    const anio = Number(String(c.cuando).match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1]);
    return !anio || anio >= desde;
  });
  return { casos: dentro, descartados: casos.length - dentro.length, desde };
}

// ── Paso 2: la investigación exhaustiva del caso elegido ──────────────────────
//
// La búsqueda del paso 1 es de reconocimiento: mira por encima y trae cinco
// opciones. Esta es otra cosa. Sobre el caso ya elegido se buscan SEIS ÁNGULOS
// distintos, cada uno por separado, porque una sola pregunta trae una sola versión
// —normalmente la del primer resultado— y un documental que se apoya en una sola
// versión es un resumen de Wikipedia con voz grave.
//
// Cada ficha guarda de qué TIPO es su fuente. Un dato de una sentencia y un dato de
// un blog no valen lo mismo, y el guion tiene que poder distinguirlos.

const ANGULOS = [
  {
    id: 'cronologia',
    nombre: 'Cronología',
    pide:
      'La secuencia exacta de los hechos: fechas, horas, lugares y nombres. ' +
      'Qué pasó primero y qué después. Datos duros, no interpretación.',
  },
  {
    id: 'oficial',
    nombre: 'Fuentes oficiales',
    pide:
      'Lo que consta en documentación OFICIAL: informes policiales, atestados, ' +
      'expedientes judiciales, sentencias, autopsias, informes forenses, actas, ' +
      'comisiones de investigación, registros públicos. Cita el documento concreto.',
  },
  {
    id: 'prensa',
    nombre: 'Prensa e investigación periodística',
    pide:
      'Lo publicado por medios de referencia e investigaciones periodísticas serias. ' +
      'Distingue lo que el medio verificó de lo que solo recogió de terceros.',
  },
  {
    id: 'discutido',
    nombre: 'Lo que se discute',
    pide:
      'Las versiones EN CONFLICTO: qué se afirma sin haberse probado, qué desmintió ' +
      'quién, qué quedó sin aclarar, qué teorías circulan sin respaldo. Marca todo ' +
      'esto como incierto.',
  },
  {
    id: 'cifras',
    nombre: 'Datos y cifras',
    pide:
      'Cifras concretas y comprobables: cantidades, importes, duraciones, distancias, ' +
      'número de personas, resultados de pruebas. Con su unidad y su fuente.',
  },
  {
    id: 'despues',
    nombre: 'Qué pasó después',
    pide:
      'El estado ACTUAL: condenas, absoluciones, recursos, indemnizaciones, reformas ' +
      'legales, reapertura del caso, dónde está hoy cada implicado. Lo más reciente.',
  },
];

const ESQUEMA_FICHAS = {
  type: 'object',
  properties: {
    fichas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          afirmacion: { type: 'string' },
          fuente: { type: 'string' },
          tipoFuente: {
            type: 'string',
            enum: ['oficial', 'judicial', 'policial', 'prensa', 'academica', 'testimonio', 'otra'],
          },
          fecha: { type: 'string' },
          cita: { type: 'string' },
          enlace: { type: 'string' },
          fiabilidad: { type: 'string', enum: ['alta', 'media', 'baja', 'sin calificar'] },
          incierto: { type: 'boolean' },
        },
        required: ['afirmacion', 'fuente', 'tipoFuente', 'fecha', 'cita', 'fiabilidad', 'incierto'],
      },
    },
  },
  required: ['fichas'],
};

/** Un ángulo. Se expone suelto para que la cola cuente el progreso por ángulos. */
export async function investigarAngulo({ caso, angulo, senal }) {
  const r = await llamar(
    'texto',
    {
      buscarEnInternet: true,
      sistema:
        'Eres el documentalista de un equipo de investigación. Tu trabajo NO es ' +
        'escribir, es DOCUMENTAR con fuentes verificables.\n\n' +
        'Reglas que no se negocian:\n' +
        '- Cada ficha es UN hecho comprobable, no una valoración ni un resumen.\n' +
        '- La cita es TEXTUAL de la fuente. Si no puedes citar, la ficha no vale.\n' +
        '- La fuente se nombra con precisión: medio y fecha, número de expediente, ' +
        'órgano judicial, título del informe. «Varios medios» no es una fuente.\n' +
        '- tipoFuente dice de qué clase es: oficial, judicial, policial, prensa, ' +
        'academica, testimonio, otra. Sé honesto: un blog es «otra».\n' +
        '- Si un dato es disputado o no lo puedes sostener, incierto=true y dilo en la ' +
        'propia afirmación.\n' +
        '- NO inventes enlaces ni números de expediente. Si no lo tienes, deja vacío.\n' +
        '- Si de este ángulo hay poco, devuelve MENOS fichas. Nadie te pide llenar un cupo.',
      instruccion:
        `CASO: ${caso.titulo}\n` +
        `${caso.sinopsis}\n` +
        `Cuándo: ${caso.cuando} · Dónde: ${caso.donde}\n\n` +
        `ÁNGULO DE ESTA BÚSQUEDA — ${angulo.nombre}:\n${angulo.pide}\n\n` +
        'Busca en internet y devuelve las fichas de ESTE ángulo, hasta 8.\n\n' +
        'Responde ÚNICAMENTE con un objeto JSON así:\n' +
        '{"fichas":[{"afirmacion":"","fuente":"","tipoFuente":"prensa","fecha":"",' +
        '"cita":"","enlace":"","fiabilidad":"alta","incierto":false}]}',
      esquema: ESQUEMA_FICHAS,
      temperatura: 0.25,
      maxTokens: 7000,
    },
    { senal, reintentos: 1 },
  );

  return (r.json?.fichas || []).map((f) => ({
    id: `f${Math.random().toString(36).slice(2, 9)}`,
    angulo: angulo.id,
    afirmacion: f.afirmacion || '',
    fuente: f.fuente || '',
    tipoFuente: f.tipoFuente || 'otra',
    fecha: f.fecha || '',
    cita: f.cita || '',
    // Los enlaces que el modelo consultó de verdad valen más que los que escribe:
    // los primeros existen, los segundos a veces no.
    enlace: f.enlace || '',
    fiabilidad: f.fiabilidad || 'sin calificar',
    incierto: !!f.incierto,
    consultadas: r.fuentes || [],
  }));
}

export const ANGULOS_DE_INVESTIGACION = ANGULOS;

/**
 * Junta fichas quitando las repetidas.
 *
 * Seis ángulos sobre el mismo caso repiten los hechos centrales —la fecha, el
 * lugar— y sin esto la lista sale con la misma afirmación cinco veces. Se quedan la
 * que tenga mejor fuente.
 */
export function fusionarFichas(listas) {
  const PESO = { oficial: 6, judicial: 6, policial: 5, academica: 4, prensa: 3, testimonio: 2, otra: 1 };
  const porClave = new Map();

  for (const f of listas.flat()) {
    if (!f.afirmacion.trim()) continue;
    const clave = f.afirmacion
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, '')
      .split(/\s+/)
      .slice(0, 12)
      .join(' ');
    const previa = porClave.get(clave);
    if (!previa || (PESO[f.tipoFuente] || 1) > (PESO[previa.tipoFuente] || 1)) {
      porClave.set(clave, f);
    }
  }
  return [...porClave.values()];
}

/** Cuántas fichas hay de cada tipo de fuente. Para poder enseñarlo en pantalla. */
export function reparto(fichas) {
  const r = {};
  for (const f of fichas || []) r[f.tipoFuente || 'otra'] = (r[f.tipoFuente || 'otra'] || 0) + 1;
  return r;
}

const ESQUEMA = {
  type: 'object',
  properties: {
    fichas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          afirmacion: { type: 'string' },
          fuente: { type: 'string' },
          fecha: { type: 'string' },
          cita: { type: 'string' },
          enlace: { type: 'string' },
          fiabilidad: { type: 'string', enum: ['alta', 'media', 'baja', 'sin calificar'] },
          incierto: { type: 'boolean' },
        },
        required: ['afirmacion', 'fuente', 'fecha', 'cita', 'fiabilidad', 'incierto'],
      },
    },
  },
  required: ['fichas'],
};

const SISTEMA = `Eres el documentalista de un equipo de investigación. Tu trabajo NO es
escribir, es DOCUMENTAR.

Reglas que no se negocian:
- Cada ficha es UN hecho comprobable, no una valoración ni un resumen.
- La cita es TEXTUAL. Si no puedes citar, la ficha no vale.
- La fuente se nombra con precisión: obra, medio, archivo, expediente, autor.
- Si un dato es disputado o no lo puedes sostener, márcalo con incierto=true y
  dilo en la afirmación. Es infinitamente mejor una ficha que dice "se discute
  si..." que una que afirma de más.
- NO inventes enlaces. Si no tienes uno fiable, deja el campo vacío.
- Si sabes poco de un asunto, devuelve MENOS fichas. Nadie te pide llenar un cupo.`;

/**
 * Genera fichas sobre un tema.
 *
 * Es una llamada por tanda, no por ficha: mucho más barato y las fichas salen
 * coherentes entre sí en vez de repetirse.
 */
export async function investigar({ tema, angulo = '', cuantas = 12, yaTengo = [], senal }) {
  if (!tema?.trim()) throw new Error('Hace falta un tema para investigar.');

  const conocidas = yaTengo.length
    ? `\n\nYA TENGO ESTAS AFIRMACIONES (no las repitas, busca otras):\n` +
      yaTengo.slice(0, 40).map((f) => `- ${f.afirmacion}`).join('\n')
    : '';

  const r = await llamar(
    'texto',
    {
      sistema: SISTEMA,
      instruccion:
        `Tema del documental: ${tema}\n` +
        (angulo ? `Ángulo: ${angulo}\n` : '') +
        `\nDevuelve hasta ${cuantas} fichas documentales sobre este tema. ` +
        `Prioriza hechos con fecha, lugar y fuente identificable: son los que sostienen ` +
        `una narración. Incluye al menos una ficha que recoja la versión discutida o ` +
        `contraria si la hay.` +
        conocidas,
      esquema: ESQUEMA,
      temperatura: 0.3,
    },
    { senal },
  );

  return (r.json?.fichas || []).map((f) => ({
    id: `f${Math.random().toString(36).slice(2, 9)}`,
    afirmacion: f.afirmacion || '',
    fuente: f.fuente || '',
    fecha: f.fecha || '',
    cita: f.cita || '',
    enlace: f.enlace || '',
    fiabilidad: f.fiabilidad || 'sin calificar',
    incierto: !!f.incierto,
  }));
}

/**
 * Comprueba que el guion se apoya en las fichas (§8.1).
 *
 * No bloquea —hay frases de transición que no necesitan respaldo— pero SEÑALA las
 * afirmaciones fuertes que no apuntan a ninguna ficha. Que salga en pantalla es el
 * punto: así, cuando alguien discuta un dato, se sabe de dónde salió sin releer
 * nada.
 */
export async function revisarRespaldo({ tomas, fichas, senal }) {
  if (!fichas?.length) {
    return { sinRespaldo: [], aviso: 'No hay fichas: el guion no está respaldado por nada.' };
  }

  const r = await llamar(
    'texto',
    {
      sistema:
        'Comparas un guion documental con su almacén de fichas. Señalas qué frases ' +
        'hacen una afirmación factual fuerte (dato, fecha, cifra, atribución) que ' +
        'NINGUNA ficha respalda. Las frases de transición, ambiente o interpretación ' +
        'declarada no cuentan como afirmaciones factuales.',
      instruccion:
        `FICHAS:\n${fichas.map((f, i) => `[${i}] ${f.afirmacion} — ${f.fuente}`).join('\n')}\n\n` +
        `TOMAS DEL GUION:\n${tomas.map((t) => `(${t.i}) ${t.texto}`).join('\n')}\n\n` +
        `Devuelve, por cada toma, los índices de las fichas que la respaldan y si hace ` +
        `alguna afirmación factual sin respaldo.`,
      esquema: {
        type: 'object',
        properties: {
          tomas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                i: { type: 'integer' },
                fichas: { type: 'array', items: { type: 'integer' } },
                sinRespaldo: { type: 'boolean' },
                motivo: { type: 'string' },
              },
              required: ['i', 'fichas', 'sinRespaldo'],
            },
          },
        },
        required: ['tomas'],
      },
      temperatura: 0.1,
    },
    { senal },
  );

  const porToma = r.json?.tomas || [];
  return {
    porToma,
    sinRespaldo: porToma.filter((t) => t.sinRespaldo),
  };
}
