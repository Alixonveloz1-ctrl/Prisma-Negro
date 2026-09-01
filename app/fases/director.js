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
// Las fichas se escriben en UN solo sitio: ver la cabecera de `comoLista`.
import { comoLista } from './investigacion.js';

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
    // LO QUE EL EPISODIO DEJA ABIERTO A PROPÓSITO. Se llamaba `cuidado` y era una
    // lista de cautelas legales heredada del modo de casos reales: en un caso
    // inventado no protege a nadie y bloqueaba la revelación. Ver el SISTEMA.
    abierto: { type: 'array', items: { type: 'string' } },
  },
  required: ['premisa', 'hilo', 'tono', 'aperturaEnFrio', 'cierre', 'estructura', 'identidadVisual', 'musica', 'ritmo', 'abierto'],
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

EL RITMO, Y ESTO ES LA MITAD DEL OFICIO
Un documental no se sostiene por lo que dice: se sostiene por cuándo se calla.

La unidad no es la frase, es el COMPÁS: frase, frase, y la imagen sola. La voz
suelta el dato que pesa —la hora, la cifra, lo que declaró alguien, el detalle que
no encaja— y entonces NO PASA NADA durante dos o tres segundos. La música sube sola
al quedarse sin voz encima, y el espectador se queda mirando. Ahí es donde le
importa. Si la frase siguiente entra pegada, se lo has contado y no le ha dado
tiempo a sentirlo: eso es un informativo, y la gente se va.

Los sitios donde ese silencio va, y son estos y no otros:
- Después del dato duro. El más frecuente y el más útil.
- Justo ANTES del giro, no después. Un segundo largo de nada y entonces la vuelta.
- Al final de cada acto, más largo. Es el punto y aparte.
- Al principio de todo: la imagen entra antes que la primera palabra. Un documental
  empieza, no arranca.
Y donde NO va: en todas partes. Si respira cada toma no respira ninguna, y encima
la pieza se alarga sin contar más. Una de cada cuatro o cinco, como mucho.

Lo demás del ritmo: frase corta después de frase larga; cada acto con una función
distinta que se nota al oírlo; si dos actos hacen lo mismo, sobra uno.

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
El caso NO OCURRIÓ. Ni el caso, ni las personas, ni el pueblo, ni la comisaría.
Es ficción documental declarada: suena a expediente porque está construido como un
expediente, no porque haya pasado. No hay a quién difamar y no hay nada que
desmentir, así que aquí no hay cautela legal ninguna.

Lo que sí hay es UN REGISTRO, y ese registro es medio género:
- El género es la CONTENCIÓN. «El ADN lo situaba a doscientos metros, nada más» pesa
  más que «era él». Se cuenta lo que el material sostiene y se deja ver el hueco.
- Lo que no está probado DENTRO del caso se atribuye a quien lo dijo, o se cuenta
  como lo que es: una sospecha, un rumor, una línea de investigación.
- Con la víctima y su familia: los hechos, no el morbo. Nada de recrear el daño. Esto
  no es cautela legal, es que el morbo abarata la pieza.

Y LO QUE SÍ SE AFIRMA, porque es el episodio:
- El caso TIENE solución y el documental LA CUENTA. La revelación del último acto se
  dice entera y sin escurrirse: quién fue, cómo se supo, qué lo destapó. Un caso
  inventado que no se resuelve no es contención, es una pieza sin final.
- La pista falsa se desmonta EXPLÍCITAMENTE: se dice que a ese no fue, y por qué se
  creyó que sí. Ese es el giro, y callarlo lo tira.
- Lo único que se queda abierto es lo que TÚ decidas dejar abierto, a propósito, y va
  en la lista «abierto» — un hilo suelto, un detalle que nadie explicó nunca. Uno o
  dos, no cuatro: un final abierto es un final; cuatro es no haber contado nada.

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
export async function dirigirPieza({ caso, fichas, minutos = 10, genero = null, anteriores = [], senal }) {
  if (!caso) throw new Error('No hay caso que dirigir. Elige uno primero.');
  if (!fichas?.length) {
    throw new Error(
      'No hay fichas. El director decide sobre lo investigado, no sobre lo que se ' +
        'imagina: investiga a fondo primero.',
    );
  }

  const r = await llamar(
    'texto',
    {
      sistema: SISTEMA,
      instruccion:
        `CASO: ${caso.titulo}\n` +
        `${caso.sinopsis}\n` +
        `Cuándo: ${caso.cuando} · Dónde: ${caso.donde}\n` +
        // EL PAÍS Y LA CIUDAD. El director no los veía —solo la frase de `donde`—
        // y de él cuelgan el tono, los oficios y los nombres propios de todo el
        // episodio.
        (caso.pais ? `País: ${caso.pais}${caso.ciudad ? ` · Ciudad: ${caso.ciudad}` : ''}` +
          `${caso.region ? ` · ${caso.region}` : ''} — REALES.\n` : '') +
        `\n` +
        (genero
          ? `GÉNERO: ${genero.nombre}. ${genero.resumen}\n` +
            `Motivos visuales que vuelven en este género: ${genero.motivos.join('; ')}.\n\n`
          : '') +
        `MATERIAL (${fichas.length} fichas):\n` +
        comoLista(fichas, { tope: 60 }) +
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
        // LA ESTRUCTURA LA PONE EL GÉNERO, NO EL DIRECTOR.
        //
        // Antes se le pedían «3 a 5 actos» y se los inventaba cada vez, así que
        // dos episodios del mismo género no tenían nada que ver el uno con el
        // otro: no había formato, había una estructura distinta por caso. La
        // estructura de bloques es lo que hace que un canal SE RECONOZCA, y por
        // eso vive en el catálogo y no en la cabeza del director.
        //
        // Lo que sigue siendo suyo, y es lo que importa: QUÉ va en cada bloque de
        // ESTE caso. Los títulos y los minutos vienen dados; el contenido no.
        (genero?.bloques?.length
          ? `- estructura: EXACTAMENTE estos ${genero.bloques.length} actos, en este ` +
            `orden, con estos títulos y estos minutos. No añadas, no quites, no ` +
            `renombres. Lo tuyo es el «contenido»: qué de ESTE caso va en cada uno.\n` +
            genero.bloques
              .map(
                (b, k) =>
                  `    ${k + 1}. «${b.nombre}» — ${(minutos * (Number(b.peso) || 0)).toFixed(1)} min ` +
                  `— función: ${b.funcion}`,
              )
              .join('\n') +
            `\n`
          : `- estructura: 3 a 5 actos con acto, titulo, funcion, contenido y minutos.\n`) +
        `- identidadVisual: paleta, luz, textura, encuadrePreferido, queEvitar.\n` +
        `- musica: atmosfera, instrumentacion, queEvitar. Y DENTRO, «enIngles» con ` +
        `mood, instruments y avoid ESCRITOS EN INGLÉS: el generador de música solo ` +
        `entiende inglés y rechaza la petición si ve español. Vocabulario musical ` +
        `concreto: «low sustained cello», «tape hiss», «no percussion».\n` +
        `- ritmo: segundosPorToma (8-14) y proporcionMovimiento (0-0.3).\n` +
        `- abierto: qué deja abierto este episodio A PROPÓSITO. Un hilo suelto que ` +
        `nadie explicó, un detalle que nunca cuadró. UNO O DOS, no cuatro. NO metas ` +
        `aquí la revelación ni la pista falsa: esas se cuentan enteras. Si no hay ` +
        `nada que merezca quedarse abierto, lista vacía.\n\n` +
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
    // Y LOS TRATAMIENTOS QUE YA ESTABAN GUARDADOS NO SE PIERDEN: los de antes
    // llevan la lista en `cuidado`, con la redacción vieja. Se leen igual —el
    // episodio que ya estaba dirigido sigue abriéndose— y al volver a dirigir se
    // rehace con la redacción de ahora.
    abierto: Array.isArray(t.abierto) ? t.abierto : Array.isArray(t.cuidado) ? t.cuidado : [],
    hecho: Date.now(),
  };
}

/**
 * Lo que este episodio deja abierto, venga del campo de ahora o del de antes.
 *
 * UN SOLO SITIO donde se resuelve el nombre. Estaba resuelto solo al leer la
 * respuesta del director, así que un tratamiento YA GUARDADO —con la lista en
 * `cuidado`— la enseñaba en pantalla y la perdía al bajar al guion: el mismo dato
 * existiendo o no según quién preguntara.
 */
export function abiertoDe(tr) {
  const l = Array.isArray(tr?.abierto) ? tr.abierto : Array.isArray(tr?.cuidado) ? tr.cuidado : [];
  return l.filter(Boolean);
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
      // LO QUE SE DEJA ABIERTO, no «lo que no se puede afirmar». Con la redacción
      // vieja el guion se guardaba la revelación —el desenlace del caso— por una
      // cautela legal que no protegía a nadie.
      (abiertoDe(tr).length
        ? `\n\nESTO SE QUEDA ABIERTO a propósito, no lo resuelvas:\n${abiertoDe(tr).map((c) => `- ${c}`).join('\n')}` +
          `\nTodo lo demás SÍ se cuenta, la revelación la primera.`
        : '')
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
