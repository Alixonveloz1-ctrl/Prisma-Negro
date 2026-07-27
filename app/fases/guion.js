// Fase 2 — Guion (§4.2 del plano).
//
//   «Texto plano, escrito por la persona o generado a partir de las fichas. ESTE ES
//    EL INSUMO DEL QUE SALE TODO LO DEMÁS.»
//
// Por eso el guion se guarda como texto plano y editable, y la segmentación es
// determinista sobre ese texto (§4.3). Si el guion fuera una estructura opaca
// generada por un modelo, cambiar una frase obligaría a regenerarlo todo.
//
// Convenciones del texto plano, que la segmentación entiende:
//   - Una línea que empieza por «## » abre una ESCENA (y su texto no se narra).
//   - Una línea en blanco es una frontera dura entre tomas.

import { llamar } from '../api.js';

const SISTEMA = `Escribes narración de documental para voz en off. No escribes un
artículo leído en voz alta: escribes para el oído.

- Frases cortas. Sujeto y verbo pronto. Sin subordinadas encadenadas.
- Nada de "en este video vamos a ver". Empieza por el hecho.
- Nada de preguntas retóricas de relleno ni de "pero lo que nadie te contó".
- Cada afirmación factual sale de una ficha. Si una ficha marca algo como
  discutido, el guion lo dice discutido: "según el expediente...", "la versión
  oficial sostiene...".
- No inventes datos, fechas, cifras ni nombres que no estén en las fichas.
- Estructura con "## " los cambios de escena. El título de escena NO se narra.
- Separa con una línea en blanco los bloques que deben ir en tomas distintas.`;

/**
 * Genera el guion a partir de las fichas (§8.1: el guion se genera A PARTIR DE las
 * fichas, no al revés).
 */
export async function escribirGuion({ tema, angulo = '', fichas, minutos = 10, senal }) {
  if (!fichas?.length) {
    throw new Error(
      'No hay fichas. El guion se escribe a partir de la investigación: sin fichas ' +
        'sería opinión, no documental. Genera fichas primero.',
    );
  }

  // Unas 145 palabras por minuto de narración documental pausada.
  const palabras = Math.round(minutos * 145);

  const r = await llamar(
    'texto',
    {
      sistema: SISTEMA,
      instruccion:
        `Tema: ${tema}\n` +
        (angulo ? `Ángulo: ${angulo}\n` : '') +
        `Duración objetivo: ${minutos} minutos (~${palabras} palabras).\n\n` +
        `FICHAS DISPONIBLES:\n` +
        fichas
          .map(
            (f, i) =>
              `[${i}] ${f.afirmacion}\n` +
              `    fuente: ${f.fuente}${f.fecha ? ` (${f.fecha})` : ''}` +
              `${f.incierto ? ' — DISPUTADO' : ''}\n` +
              (f.cita ? `    cita: «${f.cita}»\n` : ''),
          )
          .join('\n') +
        `\n\nEscribe el guion completo en texto plano, con "## " para las escenas. ` +
        `Devuelve SOLO el guion: nada de preámbulos ni de notas al final.`,
      temperatura: 0.75,
      maxTokens: Math.min(16384, Math.round(palabras * 3)),
    },
    { senal },
  );

  return limpiar(r.texto);
}

/** Reescribe una escena sin tocar el resto (§4: cada fase se puede repetir sola). */
export async function reescribirEscena({ guion, tituloEscena, indicacion, fichas, senal }) {
  const r = await llamar(
    'texto',
    {
      sistema: SISTEMA,
      instruccion:
        `GUION COMPLETO (para contexto):\n${guion}\n\n` +
        `Reescribe ÚNICAMENTE la escena «${tituloEscena}».\n` +
        `Indicación: ${indicacion}\n\n` +
        (fichas?.length
          ? `FICHAS:\n${fichas.map((f, i) => `[${i}] ${f.afirmacion} — ${f.fuente}`).join('\n')}\n\n`
          : '') +
        `Devuelve SOLO el texto nuevo de esa escena, empezando por su línea "## ".`,
      temperatura: 0.75,
    },
    { senal },
  );
  return limpiar(r.texto);
}

/**
 * Quita lo que los modelos añaden por costumbre y que rompería la segmentación:
 * vallas de código, comillas envolventes y espacios en blanco al final de línea.
 */
function limpiar(texto) {
  return String(texto || '')
    .replace(/^\s*```[a-z]*\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\r\n/g, '\n')
    .trim();
}
