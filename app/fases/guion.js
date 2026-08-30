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
// Las fichas se escriben en UN solo sitio: hay dos clases —documentadas y
// construidas— y componer la lista aquí acabaría con dos formatos distintos y una
// fase leyendo «fuente: undefined».
import { comoLista } from './investigacion.js';

// ─────────────────────────────────────────────────────────────────────────────
// «No es un noticiero, es un documental, pero tiene que ser entretenido.»
//
// Y tenía razón. Esto solo decía lo que NO hacer —nada de preguntas retóricas,
// nada de «lo que nadie te contó», frases cortas— y con puras prohibiciones sale
// exactamente un noticiero: datos correctos, bien atribuidos, uno detrás de otro,
// y nadie llega al minuto tres.
//
// Lo que engancha en un documental de plataforma no es el misterio del caso: es
// CÓMO SE ADMINISTRA LO QUE SE SABE. Se da un hecho y se retiene su significado.
// Se nombra el objeto concreto en vez de resumir la situación. Se cierra la escena
// con una puerta abierta. Nada de eso obliga a inventar ni una coma — y por eso el
// rigor de abajo se queda entero: son dos cosas distintas y las dos caben.
// ─────────────────────────────────────────────────────────────────────────────
const SISTEMA = `Escribes narración de documental para voz en off. No escribes un
artículo leído en voz alta: escribes para el oído, y para alguien que puede irse
en cualquier momento y no se va.

CÓMO SE CUENTA
- LO CONCRETO, SIEMPRE. Nombra el objeto, la hora exacta, la marca, la distancia,
  la palabra textual. "Señales de que se fue con prisa" no vale; "la cena servida
  y sin tocar, y las llaves puestas en la cerradura por dentro" sí. El detalle es
  lo que se queda; el resumen se olvida mientras se oye.
- ADMINISTRA LO QUE SABES. Da el hecho antes que su explicación. Deja que el que
  escucha se haga la pregunta y respóndela dos párrafos después, no en la misma
  frase. Un documental avanza por lo que todavía no ha dicho.
- NO CIERRES LA ESCENA RESUMIENDO. Ciérrala con el dato que abre la siguiente:
  algo que ahora no encaja, un nombre que aún no significa nada, una hora que no
  cuadra. Cada bloque termina empujando al siguiente.
- RITMO. Frase larga, frase larga, frase corta. La corta es la que pega. Si las
  quince frases de un párrafo miden lo mismo, no se oye ninguna.
- EL PRESENTE PARA LA ESCENA, el pasado para la investigación. Cuando reconstruyes
  un momento, ponlo delante: "son las diez y veinte y la puerta está abierta".
  Cuando cuentas lo que se averiguó después, en pasado.
- LAS PALABRAS DE LOS DEMÁS VALEN MÁS QUE LAS TUYAS. Una línea literal de un
  atestado, de una llamada o de una declaración pesa más que tres frases tuyas
  explicando lo mismo. Úsalas cuando la ficha las traiga.

EL PULSO — de esto vive el documental, y es lo que separa quedarse de irse
- PERSONAS, NO EXPEDIENTES. Cada acto se ancla en alguien concreto: un nombre,
  una edad, lo que hacía esa mañana, lo que perdió. El dato frío va SIEMPRE
  pegado a su costo humano: primero la cifra, después quién cabe en ella. «714
  pacientes» no duele; «714 personas que nunca firmaron nada» sí.
- LA POLÉMICA LEGÍTIMA SE ENCIENDE SOLA enfrentando las versiones ATRIBUIDAS en
  frases contiguas: «La empresa sostiene que el protocolo era seguro. Las
  familias preguntan por qué nadie les avisó.» Ese choque, seco y sin comentario
  tuyo, ES la chispa — no le añadas ni una palabra de opinión.
- LA PREGUNTA INCÓMODA se formula si el material la sostiene, y como pregunta
  abierta con base: «la ley lo permitía; la pregunta que quedó en el aire es si
  debía permitirlo». Nunca como acusación tuya.
- La indignación y la duda las produce EL ORDEN DE LOS HECHOS que eliges, no tus
  adjetivos. Si un dato indigna, ponlo desnudo y déjalo caer con su respiro: el
  espectador llega solo, y llegar solo es lo que lo deja inmerso.

CÓMO NO SE CUENTA — y esto es lo que lo convierte en noticiero
- SIN ADJETIVOS DE OPINIÓN. Nada de escalofriante, impactante, misterioso,
  perturbador, insólito, brutal, macabro. Decir que algo es escalofriante es la
  forma más segura de que no lo sea: los hechos hacen el trabajo o no lo hace
  nadie. Cuenta lo que pasó y calla.
- SIN EXPLICAR LO QUE YA SE ENTENDIÓ. Si el dato anterior lo dice, no lo repitas
  con otras palabras "para que quede claro". Se nota y aburre.
- UN HECHO SE CUENTA UNA VEZ EN TODO EL DOCUMENTAL. Esto vale sobre todo entre
  actos: cuando te den lo ya escrito, léelo como lo que es —ya dicho— y sigue
  desde ahí. Nada de recapitular al empezar un acto, nada de volver a presentar
  a quien ya salió, nada de repetir la cifra o la fecha "por si se olvidó". Si
  un hecho anterior hace falta para entender el nuevo, se le alude en media
  frase y se avanza; no se vuelve a contar.
- SIN CÓDIGOS NI SIGLAS LEÍDOS EN VOZ ALTA. «El expediente NCT00076648» no se
  narra: se dice "el expediente del registro federal". Un identificador largo
  leído entero rompe el hechizo — es dato de ficha, no de boca de narrador. Las
  siglas solo si se pronuncian como palabra conocida (FBI sí; NHTSA no).
- Nada de "en este video vamos a ver". Empieza por el hecho.
- Nada de preguntas retóricas de relleno, ni de "lo que nadie te contó".
- Sin moraleja: no cierres explicándole al espectador qué tiene que sentir.`;

// ─────────────────────────────────────────────────────────────────────────────
// LA LICENCIA DE INVENTAR, CON SU LÍMITE.
//
// Aquí hubo dos bloques: este y un `RIGOR` que decía «no inventes datos, fechas,
// cifras ni nombres que no estén en las fichas», para los episodios de casos
// reales. Se fue con el modo que lo pedía.
//
// No era una regla de más: era la contraria de esta. Con las dos en el mismo
// sistema el guion recibía «inventa el detalle concreto que la escena pida» y «no
// inventes datos» a la vez, y hacía lo que le parecía. El canal es de ficción; el
// límite no es la verdad, es la COHERENCIA.
// ─────────────────────────────────────────────────────────────────────────────

const MATERIAL_CONSTRUIDO = `
EL MATERIAL
Trabajas sobre fichas construidas: el caso es una obra de ficción, declarada como
tal en la cabecera del episodio. Eso cambia una cosa y solo una: el detalle
concreto que la escena necesite lo pones tú. La hora exacta, la temperatura de
esa mañana, la marca de las botas, la edad del capataz, el número estampado en
la ficha de latón. Nada de eso tiene que estar en el material.
El límite es la coherencia: no puedes contradecir una ficha, y un nombre, una
fecha o una edad se escriben una vez y no cambian en todo el episodio. Un
detalle inventado que choca con otro anterior no es color, es lo único que
destruye la pieza entera.
Cada ficha viene con su ROL entre paréntesis —victima, sospechoso, testigo,
objeto, lugar, fecha, pistafalsa, revelacion—: eso te dice qué papel juega en el
caso y en qué bloque toca sacarla. La revelación no se adelanta.

EL GANCHO — solo el primer acto, y son cuarenta segundos
Empieza EN SEGUNDA PERSONA y dentro de la acción, antes de contextualizar nada.
«Imagina esta escena. Te han contratado para talar unos robles viejos… retiras
la madera podrida con las manos.» El espectador hace, no mira.
Termina EXACTAMENTE en el instante del hallazgo y corta. No expliques todavía
qué es, ni de qué año, ni dónde. Eso viene después de la cabecera.

LOS TESTIMONIOS
Cada dos o tres minutos entra alguien: quien encontró el cuerpo, el perito, el
detective, un familiar. Habla en primera persona, en presente, con voz de
persona y no de informe: frases que empiezan a medias, un detalle que no venía
a cuento, una duda.
Se marcan así, en su propio párrafo, y la línea de arriba dice quién es:
    > Marcos Elizalde, capataz de la cuadrilla
    Habíamos revisado el árbol desde afuera. Tenía humedad y la corteza
    levantada, pero eso es normal en árboles viejos.
El narrador lo presenta antes por su nombre y su cargo. No lo repitas después.
Esa línea que empieza por «> » NO SE NARRA: es la ficha del que habla.

EL CIERRE
Resuelve el caso, devuelve el nombre, cierra con la familia. Y deja UNA cosa sin
explicar —una sola, y que sea concreta: cómo llegó el cuerpo hasta ahí, qué
significaba una palabra del papel, por qué nadie denunció. Formúlala como
pregunta y no la contestes. Es lo que se discute en los comentarios.`;

const FORMATO = `
FORMATO
- Estructura con "## " los cambios de escena. El título de escena NO se narra.
- Una línea que empieza por "> " declara quién habla en el testimonio que viene
  debajo, y tampoco se narra.
- Separa con una línea en blanco los bloques que deben ir en tomas distintas. Esa
  línea en blanco es una PAUSA: úsala después de un dato duro, para dejarlo caer.`;

/** Las reglas del guion: el oficio, la licencia con su límite, y el formato. */
export const sistemaDelGuion = () => SISTEMA + MATERIAL_CONSTRUIDO + '\n' + FORMATO;

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
  // El género, del catálogo. De él sale la estructura de bloques cuando el
  // director no dejó una suya.
  genero = null,
  anteriores = [],
  // Los actos que YA SE ESCRIBIERON en un intento anterior que se cayó a mitad, y
  // el aviso de que un acto nuevo acaba de salir. Juntos son lo que hace que un
  // fallo en el acto tres no tire los dos ya pagados: el que llama guarda cada
  // acto al recibirlo, y al reintentar los pasa de vuelta para no reescribirlos.
  yaEscritos = [],
  alActo = null,
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
  const actos = actosDe(tratamiento, minutos, genero);

  // Las fichas, ordenadas y escritas por la puerta común. Documentadas: por
  // solidez de la fuente, porque el modelo se apoya en lo primero que lee.
  // Construidas: en el orden en que se levantó el caso, que es el orden en que se
  // cuenta.
  const listaFichas = comoLista(fichas, { tope: 120 });

  const partes = [];
  for (const [n, acto] of actos.entries()) {
    if (senal?.aborted) throw new Error('Detenido.');

    // Un acto ya escrito no se vuelve a pedir ni a pagar: se recoge y se sigue.
    if (n < yaEscritos.length && String(yaEscritos[n] || '').trim()) {
      partes.push(yaEscritos[n]);
      alAvanzar?.(n + 1, actos.length);
      continue;
    }
    const objetivo = Math.round(acto.minutos * 145);

    const r = await llamar(
      'texto',
      {
        sistema: sistemaDelGuion(),
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
          // LO QUE YA SE ESCRIBIÓ, ENTERO.
          //
          // ───────────────────────────────────────────────────────────────────
          // «Me parece que la historia se está repitiendo: en las tomas más
          //  adelante se repite lo que ya se dijo en las tomas anteriores.»
          //
          // Aquí iban los ÚLTIMOS 600 CARACTERES del acto anterior — unas cien
          // palabras—. Con eso, el acto cuarto sabía cómo terminaba el tercero y
          // nada de lo que dijeron el primero y el segundo: volvía a contar el
          // dato duro «para que se entienda», y el espectador lo oía por segunda
          // vez a los diez minutos.
          //
          // Ahora ve los actos anteriores COMPLETOS. Es el mismo razonamiento que
          // ya se aplicaba a las partes anteriores de una serie —«un resumen
          // pierde qué frases están dichas, y eso es lo único que importa aquí»—
          // y aquí importa más todavía, porque es el mismo documental. Un guion
          // entero son unas dos mil palabras: cabe de sobra, y sale mucho más
          // barato que un documental que se repite.
          // ───────────────────────────────────────────────────────────────────
          (partes.length
            ? `LO QUE YA LLEVAS ESCRITO DE ESTE MISMO DOCUMENTAL. Está dicho: no ` +
              `vuelvas a contar estos hechos, ni a presentar a quien ya presentaste, ` +
              `ni a explicar lo ya explicado. Este acto CONTINÚA desde aquí:\n\n` +
              partes.map((p, k) => `── acto ${k + 1} ──\n${p}`).join('\n\n') +
              `\n\n`
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
    // El acto pagado se guarda ANTES de pedir el siguiente (§4), igual que una
    // toma de voz o una imagen: si el siguiente falla, este ya no se pierde.
    if (alActo) await alActo(partes[partes.length - 1], n, actos.length);
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
 * La huella de la estructura de actos: con qué actos se escribió un guion parcial.
 *
 * Sirve para saber si unos actos guardados a medias siguen valiendo: si el
 * director cambió la estructura —otros títulos, otros minutos—, reanudar sobre
 * los viejos pegaría dos documentales distintos, y eso es peor que reescribir.
 */
export const huellaDeActos = (tratamiento, minutos, genero = null) =>
  actosDe(tratamiento, minutos, genero)
    .map((a) => `${a.titulo}·${a.minutos}`)
    .join(' | ');

/**
 * Los actos en los que se parte el guion.
 *
 * Si el director dejó una estructura, manda la suya: ya decidió cuántos actos,
 * qué hace cada uno y cuánto dura. Si no la hay, se parte en tres —planteamiento,
 * desarrollo, cierre— para no escribirlo todo de una llamada de todas formas.
 */
export function actosDe(tratamiento, minutos, genero = null) {
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

  // LA ESTRUCTURA DEL GÉNERO, cuando no hay tratamiento.
  //
  // Los pesos del catálogo suman 1 y reparten los minutos pedidos. Antes de esto
  // había tres actos genéricos —caso, investigación, cierre— para cualquier
  // episodio de cualquier clase, que es lo mismo que no tener estructura: un
  // crimen frío no se cuenta igual que una supervivencia, y la diferencia son
  // exactamente los bloques y sus proporciones.
  //
  // El mínimo de un minuto por bloque no es decorativo: el gancho pesa 0.03, y en
  // un episodio corto eso da cero. Un acto de cero minutos se le pide al modelo
  // igual y sale un acto entero, descuadrando todo lo demás.
  const bloques = genero?.bloques || [];
  if (bloques.length) {
    return bloques.map((b) => ({
      titulo: b.nombre,
      funcion: b.funcion || 'avanzar el relato',
      contenido: '',
      minutos: Math.max(1, +(minutos * (Number(b.peso) || 0)).toFixed(1)),
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
      // El MISMO sistema que escribió el guion, con la misma licencia. Reescribir
      // una escena con otras reglas mete en el episodio un párrafo que juega a
      // otra cosa que el resto.
      sistema: sistemaDelGuion(),
      instruccion:
        `GUION COMPLETO (para contexto):\n${guion}\n\n` +
        `Reescribe ÚNICAMENTE la escena «${tituloEscena}».\n` +
        `Indicación: ${indicacion}\n\n` +
        (fichas?.length ? `FICHAS:\n${comoLista(fichas, { tope: 80 })}\n\n` : '') +
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
