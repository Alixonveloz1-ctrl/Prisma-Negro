// Fase 3 — El director (nueva).
//
// Faltaba la pieza más importante y no estaba en el plano porque el proyecto de
// origen era de ficción, donde el guion venía dado.
//
// El problema: el guion salía de las fichas, y la dirección de arte iba plano a
// plano. Nadie decidía EL DOCUMENTAL. Sin eso sale una enumeración de datos bien
// documentados, correcta y sin pulso: no hay hilo, no hay apertura, no hay giro, y
// la escena 9 no sabe que existe la escena 2.
//
// El director produce un TRATAMIENTO —una sola llamada— y de él beben todas las
// fases de abajo:
//
//   tratamiento ──┬─→ guion       (estructura, tono, apertura, cierre)
//                 ├─→ dirección   (identidad visual, qué evitar)
//                 ├─→ música      (atmósfera, instrumentación)
//                 └─→ miniatura   (paleta y promesa)
//
// Una llamada por pieza, como la dirección de arte (§4.4): mucho más barato y
// mucho más coherente que decidirlo trozo a trozo.

import { llamar } from '../api.js';

const ESQUEMA = {
  type: 'object',
  properties: {
    premisa: { type: 'string' },
    hilo: { type: 'string' },
    tono: { type: 'string' },
    aperturaEnFrio: { type: 'string' },
    cierre: { type: 'string' },
    estructura: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          acto: { type: 'integer' },
          titulo: { type: 'string' },
          funcion: { type: 'string' },
          contenido: { type: 'string' },
          minutos: { type: 'number' },
        },
        required: ['acto', 'titulo', 'funcion', 'contenido', 'minutos'],
      },
    },
    identidadVisual: {
      type: 'object',
      properties: {
        paleta: { type: 'string' },
        luz: { type: 'string' },
        textura: { type: 'string' },
        encuadrePreferido: { type: 'string' },
        queEvitar: { type: 'string' },
      },
      required: ['paleta', 'luz', 'textura', 'encuadrePreferido', 'queEvitar'],
    },
    musica: {
      type: 'object',
      properties: {
        atmosfera: { type: 'string' },
        instrumentacion: { type: 'string' },
        queEvitar: { type: 'string' },
      },
      required: ['atmosfera', 'instrumentacion', 'queEvitar'],
    },
    ritmo: {
      type: 'object',
      properties: { segundosPorToma: { type: 'number' }, proporcionMovimiento: { type: 'number' } },
      required: ['segundosPorToma', 'proporcionMovimiento'],
    },
    cuidado: { type: 'array', items: { type: 'string' } },
  },
  required: ['premisa', 'hilo', 'tono', 'aperturaEnFrio', 'cierre', 'estructura', 'identidadVisual', 'musica', 'ritmo', 'cuidado'],
};

const SISTEMA = `Eres director de documentales. Llevas veinte años haciendo piezas
cortas de investigación para televisión y para canales de vídeo. No escribes el
guion todavía: decides QUÉ DOCUMENTAL ES ESTE.

Cómo trabajas:

- Buscas EL HILO. Un documental no es una lista de datos ordenados por fecha: es una
  pregunta que se abre al principio y se cierra al final. Si no encuentras la
  pregunta, no hay documental.
- Abres EN FRÍO, con un momento concreto —una hora, un objeto, una frase de un
  documento—, nunca con un resumen ni con «hoy vamos a hablar de».
- Estructuras en actos con función: qué hace cada uno para que el siguiente importe.
- Decides una identidad visual COHERENTE y la sostienes: paleta, luz, textura. No
  «cinematográfico» ni «impactante»: colores, horas del día, materiales concretos.
- Sabes que la voz en off pisada por música se pierde, así que pides música que vaya
  por debajo.
- Y sabes dónde están los límites: con casos reales, lo que no está probado se cuenta
  como no probado, y a las personas reales no se las acusa desde el montaje.

Lo que NO haces: prometer más de lo que el material sostiene, usar «lo que nadie te
contó», ni cerrar con una moraleja. El material manda.`;

/**
 * Produce el tratamiento del documental.
 *
 * Una sola llamada por pieza. Recibe el caso y las fichas ya investigadas: sin las
 * fichas decidiría sobre lo que se imagina, que es exactamente lo que un documental
 * no puede permitirse.
 */
export async function dirigirPieza({ caso, fichas, minutos = 10, senal }) {
  if (!caso) throw new Error('No hay caso que dirigir. Elige uno primero.');
  if (!fichas?.length) {
    throw new Error(
      'No hay fichas. El director decide sobre lo investigado, no sobre lo que se ' +
        'imagina: investiga a fondo primero.',
    );
  }

  // Las fichas van ordenadas por solidez: el director tiene que ver primero lo que
  // de verdad se sostiene, no lo primero que salió.
  const PESO = { oficial: 6, judicial: 6, policial: 5, academica: 4, prensa: 3, testimonio: 2, otra: 1 };
  const ordenadas = [...fichas].sort(
    (a, b) => (PESO[b.tipoFuente] || 1) - (PESO[a.tipoFuente] || 1),
  );

  const r = await llamar(
    'texto',
    {
      sistema: SISTEMA,
      instruccion:
        `CASO: ${caso.titulo}\n` +
        `${caso.sinopsis}\n` +
        `Cuándo: ${caso.cuando} · Dónde: ${caso.donde}\n\n` +
        `MATERIAL INVESTIGADO (${fichas.length} fichas, de más a menos sólida):\n` +
        ordenadas
          .slice(0, 60)
          .map(
            (f, i) =>
              `[${i}] ${f.afirmacion} — ${f.fuente} [${f.tipoFuente}]` +
              `${f.incierto ? ' (DISPUTADO)' : ''}`,
          )
          .join('\n') +
        `\n\nDuración objetivo: ${minutos} minutos.\n\n` +
        `Decide el documental. Devuelve:\n` +
        `- premisa: una frase de qué es esta pieza.\n` +
        `- hilo: la pregunta que se abre al principio y se cierra al final.\n` +
        `- tono: el registro, en una frase.\n` +
        `- aperturaEnFrio: con qué momento concreto empieza. Sé específico.\n` +
        `- cierre: cómo termina, sin moraleja.\n` +
        `- estructura: 3 a 5 actos con acto, titulo, funcion, contenido y minutos.\n` +
        `- identidadVisual: paleta, luz, textura, encuadrePreferido, queEvitar.\n` +
        `- musica: atmosfera, instrumentacion, queEvitar.\n` +
        `- ritmo: segundosPorToma (8-14) y proporcionMovimiento (0-0.3).\n` +
        `- cuidado: qué NO se puede afirmar en este caso concreto, por lo que dice el ` +
        `material. Una entrada por cada cosa.\n\n` +
        `Responde ÚNICAMENTE con el objeto JSON.`,
      esquema: ESQUEMA,
      temperatura: 0.8,
      maxTokens: 8000,
    },
    { senal },
  );

  const t = r.json || {};
  return {
    premisa: t.premisa || '',
    hilo: t.hilo || '',
    tono: t.tono || '',
    aperturaEnFrio: t.aperturaEnFrio || '',
    cierre: t.cierre || '',
    estructura: Array.isArray(t.estructura) ? t.estructura : [],
    identidadVisual: t.identidadVisual || null,
    musica: t.musica || null,
    // El ritmo lo propone el director pero se acota aquí: §8.5 dice que en documental
    // los segundos por toma suben y la proporción de movimiento baja, y eso último
    // es la palanca del presupuesto (§4.7). El director no decide cuánto se gasta.
    ritmo: {
      segundosPorToma: Math.min(16, Math.max(7, Number(t.ritmo?.segundosPorToma) || 11)),
      proporcionMovimiento: Math.min(0.3, Math.max(0, Number(t.ritmo?.proporcionMovimiento) || 0.15)),
    },
    cuidado: Array.isArray(t.cuidado) ? t.cuidado : [],
    hecho: Date.now(),
  };
}

/**
 * El tratamiento en texto, para meterlo en las instrucciones de las fases de abajo.
 *
 * Existe para que todas lean LO MISMO: si cada fase compusiera su resumen del
 * tratamiento, cada una entendería una cosa distinta y volvería la incoherencia que
 * el director existe para quitar.
 */
export function comoInstruccion(tr, { para = 'guion' } = {}) {
  if (!tr) return '';

  const comun =
    `TRATAMIENTO DEL DIRECTOR\n` +
    `Premisa: ${tr.premisa}\n` +
    `Hilo: ${tr.hilo}\n` +
    `Tono: ${tr.tono}\n`;

  if (para === 'guion') {
    return (
      comun +
      `Abre así: ${tr.aperturaEnFrio}\n` +
      `Cierra así: ${tr.cierre}\n\n` +
      `ESTRUCTURA — una escena «## » por acto, respetando su función y sus minutos:\n` +
      tr.estructura
        .map((a) => `${a.acto}. ${a.titulo} (${a.minutos} min) — ${a.funcion}\n   ${a.contenido}`)
        .join('\n') +
      (tr.cuidado.length ? `\n\nCUIDADO, no se puede afirmar:\n${tr.cuidado.map((c) => `- ${c}`).join('\n')}` : '')
    );
  }

  if (para === 'direccion') {
    const v = tr.identidadVisual || {};
    return (
      comun +
      `\nIDENTIDAD VISUAL, sostenida en TODA la pieza:\n` +
      `Paleta: ${v.paleta}\nLuz: ${v.luz}\nTextura: ${v.textura}\n` +
      `Encuadre preferido: ${v.encuadrePreferido}\n` +
      `EVITAR: ${v.queEvitar}`
    );
  }

  if (para === 'musica') {
    const m = tr.musica || {};
    return `${m.atmosfera}. ${m.instrumentacion}. Evitar: ${m.queEvitar}. Tono general: ${tr.tono}.`;
  }

  return comun;
}
