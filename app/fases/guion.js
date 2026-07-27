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
import { comoInstruccion } from './director.js';

// Cuánto pesa cada tipo de fuente. Un dato de una sentencia y uno de un blog no
// valen lo mismo, y el guion tiene que apoyarse antes en el primero.
const PESO = { oficial: 6, judicial: 6, policial: 5, academica: 4, prensa: 3, testimonio: 2, otra: 1 };
const PESO_FUENTE = (f) => (PESO[f.tipoFuente] || 1) - (f.incierto ? 2 : 0);

const SISTEMA = `Escribes narración de documental para voz en off. No escribes un
artículo leído en voz alta: escribes para el oído.

- Frases cortas. Sujeto y verbo pronto. Sin subordinadas encadenadas.
- Nada de "en este video vamos a ver". Empieza por el hecho.
- Nada de preguntas retóricas de relleno ni de "pero lo que nadie te contó".
- Cada afirmación factual sale de una ficha. Si una ficha marca algo como
  discutido, el guion lo dice discutido: "según el expediente...", "la versión
  oficial sostiene...".
- No inventes datos, fechas, cifras ni nombres que no estén en las fichas.
- Atribuye según el tipo de fuente que lleva cada ficha entre corchetes: lo que
  viene de [oficial], [judicial] o [policial] se puede afirmar ("consta en el
  atestado", "la sentencia declaró probado"); lo de [prensa] se atribuye al medio;
  lo de [testimonio] u [otra] se cuenta como lo que es ("según relató", "se ha
  dicho, sin que conste probado").
- Estructura con "## " los cambios de escena. El título de escena NO se narra.
- Separa con una línea en blanco los bloques que deben ir en tomas distintas.`;

/**
 * Genera el guion a partir de las fichas (§8.1: el guion se genera A PARTIR DE las
 * fichas, no al revés).
 */
/**
 * Escribe el guion, ACTO POR ACTO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO EN UNA LLAMADA
 *
 * Pedir los diez minutos de una vez devolvía UNA escena y UNA toma, y la pantalla
 * decía «guion escrito». Dos cosas se juntaban:
 *
 *   · El tope de salida era `palabras × 3` —unos 4.300 para diez minutos—, y los
 *     modelos que razonan gastan parte de ese presupuesto PENSANDO antes de
 *     escribir. Lo que quedaba para el texto era una fracción.
 *
 *   · Cortarse no da error. Da menos guion. Sin nadie mirando `finishReason`, un
 *     fragmento pasa por documental terminado.
 *
 * Escribir acto por acto arregla las dos: cada llamada tiene un objetivo pequeño
 * que cabe de sobra, y la longitud total deja de depender de que quepa —sale de
 * sumar actos—. Además la estructura ya la decidió el director, así que no hay
 * que inventarse por dónde cortar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function escribirGuion({
  tema,
  angulo = '',
  fichas,
  minutos = 10,
  tratamiento = null,
  anteriores = [],
  senal,
  alAvanzar,
}) {
  if (!fichas?.length) {
    throw new Error(
      'No hay fichas. El guion se escribe a partir de la investigación: sin fichas ' +
        'sería opinión, no documental. Genera fichas primero.',
    );
  }

  // Unas 145 palabras por minuto de narración documental pausada.
  const palabras = Math.round(minutos * 145);
  const actos = actosDe(tratamiento, minutos);

  // Las fichas van ORDENADAS por solidez de la fuente. El modelo se apoya en lo
  // primero que lee, así que lo primero tiene que ser lo mejor sostenido: una
  // sentencia antes que un blog.
  const listaFichas = [...fichas]
    .sort((a, b) => PESO_FUENTE(b) - PESO_FUENTE(a))
    .map(
      (f, i) =>
        `[${i}] ${f.afirmacion}\n` +
        `    fuente: ${f.fuente}${f.fecha ? ` (${f.fecha})` : ''} [${f.tipoFuente || 'otra'}]` +
        `${f.incierto ? ' — DISPUTADO, dilo como discutido' : ''}\n` +
        (f.cita ? `    cita: «${f.cita}»\n` : ''),
    )
    .join('\n');

  const partes = [];
  for (const [n, acto] of actos.entries()) {
    if (senal?.aborted) throw new Error('Detenido.');
    const objetivo = Math.round(acto.minutos * 145);

    const r = await llamar(
      'texto',
      {
        sistema: SISTEMA,
        instruccion:
          `Tema: ${tema}\n` +
          (angulo ? `Ángulo: ${angulo}\n` : '') +
          `Documental de ${minutos} minutos en ${actos.length} actos. ` +
          `Ahora escribes SOLO el acto ${n + 1}: «${acto.titulo}».\n` +
          `Función de este acto: ${acto.funcion}\n` +
          (acto.contenido ? `Contenido: ${acto.contenido}\n` : '') +
          `Extensión de este acto: ${acto.minutos} minutos, unas ${objetivo} palabras. ` +
          `Es un mínimo, no un techo: si te quedas corto, el documental no dura.\n\n` +
          (tratamiento ? comoInstruccion(tratamiento, { para: 'guion' }) + '\n\n' : '') +
          // El director ya buscó un ángulo nuevo, pero el que ESCRIBE también tiene
          // que saber qué frases están dichas: si no, vuelve a explicar el caso
          // desde el principio «para situar al espectador» y la continuación acaba
          // siendo la primera parte con otras palabras.
          (anteriores.length
            ? `LO QUE YA SE CONTÓ EN LAS PARTES ANTERIORES —dalo por sabido, no lo ` +
              `vuelvas a contar:\n` +
              anteriores.map((a) => `── ${a.titulo} ──\n${a.guion}`).join('\n\n') +
              `\n\nComo mucho, una frase de recordatorio al principio de todo el ` +
              `documental. Ni una escena entera de resumen.\n\n`
            : '') +
          // La costura entre actos: sin esto, cada acto vuelve a presentar el caso.
          (partes.length
            ? `EL ACTO ANTERIOR TERMINABA ASÍ (no lo repitas, sigue de ahí):\n` +
              `…${partes[partes.length - 1].slice(-600)}\n\n`
            : '') +
          `FICHAS DISPONIBLES:\n${listaFichas}\n\n` +
          `Escribe SOLO este acto, en texto plano, empezando por «## ${acto.titulo}». ` +
          `Nada de preámbulos, de notas al final, ni de los otros actos.`,
        temperatura: 0.75,
        // Holgado a propósito: lo que se pide cabe muchas veces aquí dentro, y el
        // razonamiento del modelo también sale de este presupuesto.
        maxTokens: 32768,
      },
      { senal },
    );

    partes.push(limpiar(r.texto));
    alAvanzar?.(n + 1, actos.length);
  }

  const guion = partes.join('\n\n');
  const salieron = contarPalabras(guion);

  // Un guion que no llega ni de lejos a lo pedido no es «un guion corto»: es un
  // guion que salió mal. Se dice, con números, en vez de dejar que se descubra al
  // ver que el documental dura un minuto.
  if (salieron < palabras * 0.5) {
    throw new Error(
      `El guion salió con ${salieron} palabras y se pedían unas ${palabras} ` +
        `(${minutos} min). Está a menos de la mitad: no se da por bueno. ` +
        'Vuelve a escribirlo, o baja los minutos objetivo.',
    );
  }
  return guion;
}

export const contarPalabras = (t) => (String(t).trim().match(/\S+/g) || []).length;

/**
 * Los actos en los que se parte el guion.
 *
 * Si el director dejó una estructura, manda la suya: ya decidió cuántos actos,
 * qué hace cada uno y cuánto dura. Si no la hay, se parte en tres —planteamiento,
 * desarrollo, cierre— para no escribirlo todo de una llamada de todas formas.
 */
export function actosDe(tratamiento, minutos) {
  const suya = (tratamiento?.estructura || []).filter((a) => a && a.titulo);
  if (suya.length) {
    const total = suya.reduce((s, a) => s + (Number(a.minutos) || 0), 0) || minutos;
    // Los minutos del director se reescalan a los minutos pedidos: si él repartió
    // 12 y se piden 8, cada acto encoge en proporción en vez de sobrar cuatro.
    return suya.map((a) => ({
      titulo: a.titulo,
      funcion: a.funcion || 'avanzar el relato',
      contenido: a.contenido || '',
      minutos: Math.max(1, +((Number(a.minutos) || total / suya.length) * (minutos / total)).toFixed(1)),
    }));
  }
  return [
    { titulo: 'El caso', funcion: 'plantear qué pasó y por qué importa', contenido: '', minutos: minutos * 0.3 },
    { titulo: 'La investigación', funcion: 'lo que se supo y cómo', contenido: '', minutos: minutos * 0.45 },
    { titulo: 'Lo que queda', funcion: 'cerrar sin inventar', contenido: '', minutos: minutos * 0.25 },
  ];
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
