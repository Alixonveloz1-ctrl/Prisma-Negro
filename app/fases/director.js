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
        // EN INGLÉS, y no por capricho: el generador de música solo entiende
        // inglés y rechaza la petición entera si detecta otro idioma —«Unsupported
        // language detected»—. Los tres de arriba son para leerlos en pantalla;
        // estos tres son los que viajan a Lyria.
        enIngles: {
          type: 'object',
          properties: {
            mood: { type: 'string' },
            instruments: { type: 'string' },
            avoid: { type: 'string' },
          },
          required: ['mood', 'instruments', 'avoid'],
        },
      },
      required: ['atmosfera', 'instrumentacion', 'queEvitar', 'enIngles'],
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

const SISTEMA = `Eres director de documentales de investigación. Misterio, crimen
real, sucesos y polémicas de figuras públicas. Piezas cortas, de ocho a quince
minutos, para un canal que vive de que la gente se quede hasta el final.

No escribes el guion todavía. Decides QUÉ DOCUMENTAL ES ESTE.

CÓMO EMPIEZA
Nunca por el principio cronológico, y nunca por un resumen. Empiezas por un DETALLE
CONCRETO y sin explicar: una hora exacta, un objeto, una línea de un atestado, algo
que alguien dijo. El espectador tiene que entrar sin saber del todo qué está mirando
y necesitar saberlo. «Hoy vamos a hablar de», «todo comenzó en», «lo que nadie te
contó» — cualquiera de esas y la pieza está muerta en el segundo cuatro.

EL MOTOR
Un documental no avanza por lo que cuenta: avanza por lo que TODAVÍA NO ha contado.
Tu trabajo es decidir qué se retiene y hasta cuándo. Encuentra la pregunta que se
abre al principio y no se cierra hasta el final. Si el material no sostiene ninguna
pregunta, dilo en la premisa en vez de fabricar misterio donde no lo hay: inflar un
caso flojo se nota y se paga con el canal.

EL GIRO
En algún punto —normalmente entre el segundo y el tercer acto— la historia deja de
ser lo que parecía. Un dato que reordena lo anterior, una versión que se cae, algo
que estaba a la vista y nadie miró. Sitúalo tú. Si el material no lo tiene, el
documental es de otra clase y hay que decirlo: hay casos que se sostienen por
acumulación y no por giro.

EL RITMO
Frase corta después de frase larga. Silencio después del dato duro. Cada acto tiene
una función distinta y se nota al oírlo. Si dos actos hacen lo mismo, sobra uno.

LA IMAGEN
Decides una identidad visual y la sostienes las ochenta tomas. Nada de
«cinematográfico», «impactante» ni «atmósfera oscura»: eso no es una decisión, es un
adjetivo. Di la hora del día, la fuente de luz, los materiales, dos o tres colores.
«Ámbar de sodio sobre azul de noche, farolas y faros, nunca sol, asfalto mojado» es
una decisión. La imagen tiene que significar algo, no decorar.

EL SONIDO
La música va DEBAJO de una voz en off, siempre. Pides lecho, no melodía: si tiene
tema reconocible compite con la narración y no hay mezcla que lo arregle.

DÓNDE ESTÁ LA LÍNEA, y esto no se negocia
Trabajas con hechos reales y personas reales.
- Lo probado se afirma. Lo denunciado se atribuye a quien lo denunció. Lo que solo
  circula se cuenta como lo que es, o no se cuenta.
- Una sentencia absolutoria pesa más que veinte titulares. Si el material dice que no
  se probó, el documental dice que no se probó, aunque sea menos jugoso.
- No insinúas por montaje lo que no puedes afirmar por texto. Poner una imagen
  siniestra debajo de un nombre es acusar sin firmar.
- Con víctimas y con familias: los hechos, no el morbo. Nada de recrear el daño.
- Si el caso está abierto o hay personas vivas señaladas, esa cautela va en la lista
  de «cuidado» y el guion la respeta.

CÓMO TERMINA
Sin moraleja, sin «y tú qué opinas», sin lección. Cierras devolviendo el detalle del
principio, ya cargado con todo lo que ahora se sabe. Si el caso sigue abierto, se
dice que sigue abierto: un final honesto pesa más que uno redondo.

Y una cosa más: prefieres un documental de ocho minutos que se sostiene entero a uno
de quince con relleno. Si el material da para menos, dilo en los minutos de cada
acto.`;

/**
 * Produce el tratamiento del documental.
 *
 * Una sola llamada por pieza. Recibe el caso y las fichas ya investigadas: sin las
 * fichas decidiría sobre lo que se imagina, que es exactamente lo que un documental
 * no puede permitirse.
 */
export async function dirigirPieza({ caso, fichas, minutos = 10, anteriores = [], senal }) {
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
        // Una continuación NO es el mismo documental otra vez. El director recibe
        // lo que ya se contó —entero, no un resumen: lo que importa es qué frases
        // ya se dijeron— y su trabajo pasa a ser encontrar lo que quedó fuera.
        (anteriores.length
          ? `ESTO ES UNA CONTINUACIÓN. Del mismo caso ya se publicaron ` +
            `${anteriores.length} ${anteriores.length === 1 ? 'parte' : 'partes'}.\n\n` +
            anteriores
              .map(
                (a, n) =>
                  `── PARTE ${n + 1}: ${a.titulo} ──\n` +
                  `Premisa: ${a.premisa || '—'}\n` +
                  `Hilo: ${a.hilo || '—'}\n` +
                  `Lo que se contó, entero:\n${a.guion}\n`,
              )
              .join('\n') +
            `\n\nTU TRABAJO AHORA: encontrar lo que quedó FUERA de esas partes y ` +
            `merece un documental propio. Otro hilo, otra pregunta, otro material de ` +
            `las mismas fichas. Reglas:\n` +
            `- NO vuelvas a contar lo ya contado. Puedes darlo por sabido en una ` +
            `frase, no más.\n` +
            `- La apertura NO puede ser la de ninguna parte anterior.\n` +
            `- Si de verdad no queda nada por contar, dilo en la premisa en vez de ` +
            `repetir la primera parte con otras palabras.\n\n`
          : '') +
        `Decide el documental. Devuelve:\n` +
        `- premisa: una frase de qué es esta pieza.\n` +
        `- hilo: la pregunta que se abre al principio y se cierra al final.\n` +
        `- tono: el registro, en una frase.\n` +
        `- aperturaEnFrio: con qué momento concreto empieza. Sé específico.\n` +
        `- cierre: cómo termina, sin moraleja.\n` +
        `- estructura: 3 a 5 actos con acto, titulo, funcion, contenido y minutos.\n` +
        `- identidadVisual: paleta, luz, textura, encuadrePreferido, queEvitar.\n` +
        `- musica: atmosfera, instrumentacion, queEvitar. Y DENTRO, «enIngles» con ` +
        `mood, instruments y avoid ESCRITOS EN INGLÉS: el generador de música solo ` +
        `entiende inglés y rechaza la petición si ve español. Vocabulario musical ` +
        `concreto: «low sustained cello», «tape hiss», «no percussion».\n` +
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
