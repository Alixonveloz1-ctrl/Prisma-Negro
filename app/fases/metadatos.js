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
    etiquetas: { type: 'array', items: { type: 'string' } },
    tituloEscenas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { n: { type: 'integer' }, titulo: { type: 'string' } },
        required: ['n', 'titulo'],
      },
    },
  },
  required: ['titulos', 'descripcion', 'etiquetas', 'tituloEscenas'],
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
  const etiquetas = (m.etiquetas || []).map(comoHashtag).filter(Boolean);
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
    'HASHTAGS',
    etiquetas.join(' '),
    '',
    'ETIQUETAS (para el campo de tags, separadas por coma)',
    (m.etiquetas || []).join(', '),
  ]
    .filter((x) => x !== '' || true)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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

  const r = await llamar(
    'texto',
    {
      sistema:
        'Escribes los metadatos de publicación de un documental para YouTube y ' +
        'Facebook. Títulos concretos y honestos: nada de cebo, nada de "lo que nadie ' +
        'te contó", nada de MAYÚSCULAS de más. La descripción empieza por dos frases ' +
        'que dicen de qué va, sin rodeos. NO escribas tú las marcas de tiempo: se ' +
        'añaden después con los tiempos reales.',
      instruccion:
        `Tema: ${tema}\n\nGUION:\n${guion.slice(0, 12000)}\n\n` +
        `Escenas: ${tiempos.marcas.map((m) => `[${m.n}] ${m.titulo}`).join(', ')}\n\n` +
        `Devuelve: 4 títulos alternativos (máx. 70 caracteres), una descripción de ` +
        `2 o 3 párrafos, 15 etiquetas, y un título corto para cada escena (para la ` +
        `lista de capítulos).`,
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
    etiquetas: j.etiquetas || [],
    descripcion: [
      j.descripcion || '',
      '',
      'Capítulos:',
      ...capitulos.map((c) => `${c.marca} ${c.titulo}`),
      pieDeFuentes ? '\nFuentes:\n' + pieDeFuentes : '',
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
 * El pie de fuentes (§8.4).
 *
 * Sale del almacén de fichas, no de la memoria del modelo. Es lo que permite que,
 * cuando alguien discuta un dato, se sepa de dónde salió sin releer nada (§8.1).
 */
export function componerPieDeFuentes(fichas) {
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
