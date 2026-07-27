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
export async function buscarCasos({ tema = '', evitar = [], cuantos = 5, senal } = {}) {
  const yaVistos = evitar.length
    ? `\n\nNO propongas ninguno de estos, ya se descartaron:\n${evitar.map((t) => `- ${t}`).join('\n')}`
    : '';

  const r = await llamar(
    'texto',
    {
      // La búsqueda de verdad. Sin esto el modelo tira de memoria y se inventa las
      // fechas con una seguridad que engaña.
      buscarEnInternet: true,
      sistema:
        'Eres documentalista de investigación. Buscas casos REALES, comprobables y ya ' +
        'documentados en fuentes públicas, que den para un documental corto de 8 a 15 ' +
        'minutos.\n\n' +
        'Reglas:\n' +
        '- Solo casos REALES. Nada de leyendas urbanas presentadas como hechos, ni ' +
        'creepypastas, ni casos inventados. Si algo es folclore, no lo propongas.\n' +
        '- Que estén documentados: prensa, expedientes, archivos, investigaciones.\n' +
        '- Evita casos donde la única fuente sea un vídeo viral o un foro.\n' +
        '- No propongas crímenes recientes con víctimas identificables vivas ni casos ' +
        'con menores implicados.\n' +
        '- Variedad: que los cinco no sean del mismo tipo ni de la misma época.',
      instruccion:
        (tema
          ? `Busca casos reales relacionados con: ${tema}\n\n`
          : 'Busca casos reales llamativos y bien documentados, de cualquier terreno: ' +
            'desapariciones, fraudes, catástrofes evitables, experimentos, misterios ' +
            'históricos resueltos, hallazgos.\n\n') +
        `Devuelve ${cuantos} casos.\n\n` +
        'Para cada uno:\n' +
        '- titulo: título del documental, corto y concreto. Sin signos de exclamación.\n' +
        '- gancho: una frase de lo que engancha, sin exagerar ni prometer de más.\n' +
        '- sinopsis: 2 o 3 frases de qué pasó.\n' +
        '- cuando / donde: fecha y lugar reales.\n' +
        '- porQueFunciona: por qué da para documental visual.\n' +
        '- imagenSugerida: descripción visual para la portada, SIN rostros de personas ' +
        'reales identificables.\n' +
        '- documentado: true solo si de verdad hay fuentes públicas sólidas.\n\n' +
        'Responde ÚNICAMENTE con un objeto JSON así:\n' +
        '{"casos":[{"titulo":"","gancho":"","sinopsis":"","cuando":"","donde":"",' +
        '"porQueFunciona":"","imagenSugerida":"","documentado":true}]}' +
        yaVistos,
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
  return casos;
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
