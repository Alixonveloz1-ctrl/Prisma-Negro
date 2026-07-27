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
