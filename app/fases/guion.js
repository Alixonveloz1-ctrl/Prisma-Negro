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
//   - Una línea que empieza por «> » declara quién habla (y tampoco se narra).
//   - Una línea en blanco es una pausa. NO parte la toma: partirla dejaba tomas de
//     dos segundos, y una toma es una imagen pagada entera.

import { llamar } from '../api.js';
import { comoInstruccion } from './director.js';
// Las fichas se escriben en UN solo sitio: hay dos clases —documentadas y
// construidas— y componer la lista aquí acabaría con dos formatos distintos y una
// fase leyendo «fuente: undefined».
import { comoLista } from './investigacion.js';
// La declaración se compone en el código, no se le pide al modelo: una frase
// generada puede salir distinta, más suave, o no salir.

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
Trabajas sobre fichas construidas: el caso es una obra de ficción. Eso se declara
en la descripción del video, NUNCA en la narración: no escribas ningún aviso de
que es ficción, ni al principio ni al final ni en medio. La historia transcurre
como una historia normal, de principio a fin. Eso cambia una cosa y solo una:
el detalle concreto que la escena necesite lo pones tú. La hora exacta, la
temperatura de esa mañana, la marca de las botas, la edad del capataz, el número
estampado en la ficha de latón. Nada de eso tiene que estar en el material.
El límite es la coherencia: no puedes contradecir una ficha, y un nombre, una
fecha o una edad se escriben una vez y no cambian en todo el episodio. Un
detalle inventado que choca con otro anterior no es color, es lo único que
destruye la pieza entera.
Cada ficha viene con su ROL entre paréntesis —victima, sospechoso, testigo,
objeto, lugar, fecha, pistafalsa, revelacion—: eso te dice qué papel juega en el
caso y en qué bloque toca sacarla. La revelación no se adelanta.

EL GANCHO — solo el primer acto, y son cuarenta segundos. Tiene dos partes.
LA ACCIÓN. Empieza EN SEGUNDA PERSONA y dentro de ella, antes de contextualizar
nada. «Imagina esta escena. Te han contratado para talar unos robles viejos…
retiras la madera podrida con las manos.» El espectador hace, no mira. Aquí no
va NADA de ficha: ni el nombre de quien hace, ni el sitio por su nombre, ni la
fecha. Lo que va es lo que se toca, lo que se oye, lo que pesa.
EL REMATE. Llega al instante del hallazgo y ahí, en una o dos frases, sueltas
QUÉ es y EN QUÉ AÑO fue, sin nada más: «dentro del árbol hay una persona, un
hallazgo tan inesperado como real que en 2007 conmocionó a todo un condado».
El día y el mes no; el sitio por su nombre tampoco. Eso viene después de la
cabecera. Y cierras anunciando el título del episodio.

DE LO QUE VA EN EL REMATE, NADA SE ADELANTA A LA ACCIÓN:
  · EL NOMBRE de quien hace. Nada de «Eres Liam MacTiernan». Eres el que está
    ahí, y punto. El nombre llega cuando ya importe quién es.
  · EL SITIO por su nombre. Nada de «en Port MacLeod». Estás EN un rompeolas,
    no en un rompeolas que se llama de alguna manera. Y tampoco va en el remate:
    ahí caben «un condado», «una ciudad del norte», no el nombre.
  · EL DÍA Y EL MES. Nunca, ni en la acción ni en el remate. «El 12 de octubre
    de 2024» es ficha; «en 2024» es la escala que el remate necesita.
El año, y solo el año, va en el remate. Antes de eso el gancho es una acción, no
una ficha.

EL MOTOR — sin esto el episodio es correcto y aburrido, y aburrido se apaga
El caso es inventado, y esa es la ventaja: se puede construir para que nadie lo
suelte. Se construye así, y no es opcional:
- LA SOLUCIÓN FALSA. A mitad del episodio aparece una explicación que encaja
  con TODO lo que se sabe: un sospechoso con acceso, motivo y un rastro; o una
  familia que reconoce al muerto por la ropa, el oficio y un diente que falta.
  El espectador la da por buena. Se le dedica tiempo, se la sigue en serio, y
  entonces UNA prueba concreta la tumba —un ADN negativo, una fecha que no
  cuadra, una coartada comprobada— y todo vuelve a cero. Esa caída es el
  momento del episodio. Sin ella no hay episodio.
- EL SECRETO HUMANO. Lo que resuelve el caso nunca es solo «quién»: es un
  secreto de las personas que reordena todo lo anterior. Un informe médico que
  dice que el marido era estéril y la pareja tenía un hijo. Un recibo de
  préstamo con una firma. Un embarazo de tres semanas. Esa pieza cambia el
  motivo, y con el motivo cambia el sentido de cada escena que ya se contó.
- EL SALTO EN EL TIEMPO. El caso se archiva. Pasan años —diez, doce, treinta—.
  Se cuenta qué fue de los que esperaban. Y vuelve por algo que antes no
  existía: una técnica nueva, un papel que ahora se puede leer, alguien que
  por fin habla. Lo que lo resuelve estaba guardado desde el principio.
- LA VUELTA A INTERROGAR. Quien mintió al principio vuelve a la mesa, y esta
  vez con las pruebas delante. Se cuenta cómo se le cambia la cara: primero
  niega, luego calla, luego habla. Esa escena se escribe entera.
- CADA CUATRO O CINCO MINUTOS, ALGO QUE SE DABA POR CIERTO DEJA DE SERLO. Si en
  cinco minutos no ha cambiado nada de lo que el espectador creía, el guion
  está parado aunque avance.
- NO SE PUEDE ADIVINAR. El culpable verdadero no puede ser el primer nombre que
  suena, ni el segundo. Hasta el último tercio, quien lo hizo tiene que
  parecer secundario o descartado.
- LA PRECISIÓN ES LA CREDIBILIDAD. Hora exacta del hallazgo y de la llamada
  (9:17, 9:26, 11:05). Edad de cada persona la primera vez que aparece. Un
  objeto concreto como columna del caso —un recibo, una ficha de latón, una
  corbata, un buscapersonas— que aparece pronto, se guarda, y decide al final.
  Y los números del cierre: cuántos años de condena, cuántos cumplió, a dónde
  se fue.

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
  debajo, y tampoco se narra. Lo que dice va DEBAJO, en su propio párrafo:
      > Marcos Elizalde, capataz de la cuadrilla
      No toqué madera. Metí la mano y no había nada.
  Si pones "> " también en la declaración se entiende igual, pero la primera
  línea de la tanda es siempre la ficha del que habla, nunca lo que dice.
- Una línea en blanco es una PAUSA: úsala después de un dato duro, para dejarlo
  caer. No parte la toma, así que puedes usarla donde el oído la pida.
- Escribe en PÁRRAFOS LARGOS, de tres o cuatro frases. Cada toma del montaje es
  una imagen que se paga entera: un párrafo de una frase suelta es una imagen
  pagada para verse dos segundos.
- Y UN PÁRRAFO NO EMPIEZA REPITIENDO CÓMO ACABÓ EL ANTERIOR. Nada de «…un
  historial particularmente tenso: Elias Vance. / Elias Vance, de 52 años,
  capataz de…»: el nombre acaba de sonar, y en el montaje esos dos párrafos van
  seguidos, muchas veces en la misma toma. Se dice una vez y se sigue: «de 52
  años, era capataz de…».`;

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
              `\n\n` +
              // ─────────────────────────────────────────────────────────────
              // Y EN CONCRETO: NO ABRAS CON EL FINAL DEL ACTO ANTERIOR.
              //
              // Con los actos anteriores completos delante, el guion seguía
              // haciendo esto en las costuras: el acto anterior cerraba con el
              // resultado del ADN y el siguiente ABRÍA con el resultado del ADN.
              // El espectador lo acababa de oír hace veinte segundos.
              //
              // No era falta de contexto: lo tenía todo. Es el reflejo de
              // «situar al espectador» al empezar una sección, y hay que
              // prohibirlo por su nombre, porque «no repitas lo ya contado» no
              // lo cubre — quien lo escribe no cree estar repitiendo, cree estar
              // enlazando.
              //
              // Y se dice DÓNDE está la línea, porque enlazar sí hace falta: una
              // oración subordinada que se apoya en lo anterior y sigue —«con la
              // identidad ya establecida, faltaba el sospechoso»— es buena
              // escritura. Un párrafo que vuelve a contarlo, no.
              // ─────────────────────────────────────────────────────────────
              `NO EMPIECES ESTE ACTO CONTANDO OTRA VEZ CÓMO TERMINÓ EL ANTERIOR. ` +
              `Empieza DESPUÉS de eso. Si el acto anterior acabó con un resultado, ` +
              `una fecha o un hallazgo, ese resultado YA SE CONTÓ: no lo repitas ` +
              `para «situar», ni con otras palabras.\n` +
              `Enlazar sí: media frase que se apoya en lo anterior y sigue hacia ` +
              `delante —«con la identidad ya establecida, faltaba el sospechoso»— ` +
              `está bien. Lo que no vale es dedicar el primer párrafo a volver a ` +
              `contar lo que el espectador acaba de oír.\n\n`
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

  // SIN AVISO NARRADO, ni delante ni detrás. «El video tiene que transcurrir como
  // una historia normal, de principio a fin.» La declaración de ficción va en la
  // descripción del video, que es donde la ve quien la busca; narrada, era
  // nueve segundos de aviso legal pegados a la historia.
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
 * QUÉ ADELANTA EL GANCHO QUE NO DEBERÍA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «La forma en la que se narra al principio no abre como el archivo que te
 *  compartí.»
 *
 * Y la regla estaba escrita desde el principio: «no expliques todavía qué es, ni
 * de qué año, ni dónde». Lo que faltaba era que alguien la comprobara. De cuatro
 * guiones seguidos, tres abrieron dando la fecha, el sitio y el nombre del
 * protagonista en la primera frase — «Eres Liam MacTiernan, y el 12 de octubre de
 * 2024, en Port MacLeod…»— que es exactamente la ficha que el gancho existe para
 * NO dar.
 *
 * EL AÑO ES LA EXCEPCIÓN, y se supo leyendo el gancho real del canal:
 *
 *   «Imagina esta escena. Has sido contratado por una empresa privada para talar
 *    varios árboles antiguos… Lo retiras con las manos. Y entonces llega el
 *    horror. Dentro del árbol hay una persona, un hallazgo tan inesperado como
 *    real QUE EN 2007 conmocionó a todo un condado.»
 *
 * El año va, y el remate lo necesita: es la escala. Lo que no va es el día y el
 * mes —eso es ficha— ni el sitio por su nombre: «todo un condado», no «el condado
 * de Mercer». Así que el año se mide POR DÓNDE CAE. En la acción es la ficha que
 * el gancho existe para no dar; en la última frase es el remate.
 *
 * Una regla en el encargo es una petición, no una garantía. Esto la mide.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre',
];

// En locución los números van con letra, así que la fecha llega escrita.
const DIAS_CON_LETRA = [
  'uno', 'primero', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho',
  'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis',
  'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno',
  'veintidós', 'veintidos', 'veintitrés', 'veintitres', 'veinticuatro',
  'veinticinco', 'veintiséis', 'veintiseis', 'veintisiete', 'veintiocho',
  'veintinueve', 'treinta', 'treinta y uno',
];

export function loQueAdelantaElGancho(guion, caso = null) {
  const primero = String(guion || '').split(/^## /m).filter((x) => x.trim())[0] || '';
  const texto = primero.split('\n').slice(1).join(' ');
  const salida = [];

  // El día y el mes no van nunca: «el 12 de octubre» es ficha, esté donde esté.
  //
  // Anclado al NOMBRE DEL MES, y con los días escritos con letra. Buscar «\d+ de
  // <palabra>» marcaba «3 de los trabajadores» como si fuera una fecha, y se le
  // escapaba «el doce de octubre» — que es justo como lo escribe un narrador,
  // porque en locución los números van con letra.
  const diaYMes = texto.match(
    new RegExp(
      `\\b(?:\\d{1,2}|${DIAS_CON_LETRA.join('|')})\\s+de\\s+(?:${MESES.join('|')})\\b`,
      'i',
    ),
  );
  if (diaYMes) salida.push({ que: 'la fecha', dice: diaYMes[0] });

  // El año solo vale en el remate. Se mide dónde cae: lo que hay ANTES de la
  // última frase es la acción, y ahí un año es la ficha que no toca dar todavía.
  const frases = texto.match(/[^.?!…]+[.?!…]+/g) || [texto];
  const laAccion = frases.slice(0, -1).join(' ');
  const anio = laAccion.match(/\b(?:1[5-9]|20)\d{2}\b/);
  if (anio) salida.push({ que: 'el año, y todavía va dentro de la acción', dice: anio[0] });

  // El sitio por su nombre, con los del caso: es lo único que sabe cómo se llama.
  for (const sitio of [caso?.ciudad, caso?.pais].filter(Boolean)) {
    if (new RegExp(`\\b${sitio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(texto)) {
      salida.push({ que: 'el sitio', dice: sitio });
      break;
    }
  }

  // Y el nombre de quien hace: «Eres Fulano Mengano».
  const nombre = texto.match(/\bEres\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)+)/);
  if (nombre) salida.push({ que: 'el nombre', dice: nombre[1] });

  return salida;
}

/**
 * QUÉ ACTOS ABREN REPITIENDO EL FINAL DEL ANTERIOR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «El hecho de que abra con el cierre del acto anterior, ¿está bien o está mal?»
 *
 * Mal, salvo en una costura. Lo que separa el caso bueno del malo es LA
 * DISTANCIA: recordar algo que se oyó hace veinte minutos es oficio; repetir
 * algo que se oyó hace veinte segundos es un tartamudeo.
 *
 * Esto MIDE y AVISA. No reescribe, y es una decisión, no una dejadez: al
 * calibrarlo contra un guion real, cualquier regla lo bastante estricta para
 * cazar «El 20 de octubre de 2024, el informe de ADN…» —que abría repitiendo el
 * ADN del acto anterior— marcaba también «Con la identidad ya establecida, la
 * RCMP tenía un nombre. Pero no tenía sospechoso», que es una transición BUENA.
 * Reescribir esa automáticamente empeoraría el guion y lo cobraría. Donde el
 * juicio es editorial, la herramienta enseña y decide quien escribe.
 *
 * Se compara la APERTURA de cada acto con el CIERRE del anterior, en grupos de
 * cuatro palabras. La primera costura no cuenta: el acto 1 es el gancho de todos
 * los géneros y el 2 lo desarrolla — esa repetición es el diseño.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const PALABRAS_DE_APERTURA = 70;
const PALABRAS_DE_CIERRE = 150;
const GRUPO = 4;

const enPalabras = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const gruposDe = (palabras) => {
  const s = new Set();
  for (let i = 0; i + GRUPO <= palabras.length; i++) s.add(palabras.slice(i, i + GRUPO).join(' '));
  return s;
};

/** Lo que la apertura de un acto repite del cierre del anterior. */
export function solapeDeApertura(anterior, acto) {
  const cierre = gruposDe(enPalabras(anterior).slice(-PALABRAS_DE_CIERRE));
  const apertura = gruposDe(enPalabras(acto).slice(0, PALABRAS_DE_APERTURA));
  return [...apertura].filter((g) => cierre.has(g));
}

/**
 * Los actos de un guion ya escrito que abren repitiendo, con lo que repiten.
 *
 * Trabaja sobre el TEXTO, no sobre el proceso: sirve igual para un guion recién
 * generado, uno editado a mano o uno de hace tres meses.
 */
// Desde el TERCER acto: la costura 1→2 es el gancho y su desarrollo, y ahí la
// repetición es el diseño del género — el gancho enseña el momento sin explicarlo
// y el acto siguiente lo cuenta en serio. Empezando en el 2 se marcaba siempre.
export function solapesDelGuion(guion, { desdeElActo = 3, minimo = 3 } = {}) {
  const actos = String(guion || '')
    .split(/^## /m)
    .filter((x) => x.trim())
    .map((a) => ({ titulo: a.split('\n')[0].trim(), texto: a.split('\n').slice(1).join('\n') }));
  const salida = [];
  for (let i = Math.max(1, desdeElActo - 1); i < actos.length; i++) {
    const comunes = solapeDeApertura(actos[i - 1].texto, actos[i].texto);
    if (comunes.length >= minimo) {
      salida.push({ n: i + 1, titulo: actos[i].titulo, tras: actos[i - 1].titulo, comunes });
    }
  }
  return salida;
}

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
    // ── LA FUNCIÓN DE CADA ACTO ES DEL GÉNERO, NO DEL TRATAMIENTO ──────────
    //
    // El director COPIA los bloques del género a su estructura —se le piden
    // «EXACTAMENTE estos actos, en este orden»— y desde ese momento el guion lee
    // la copia y no el original. Así que arreglar el catálogo no arreglaba nada:
    // un episodio ya dirigido seguía escribiéndose con la versión vieja, y para
    // que le llegara había que volver a dirigir. Nadie lo sabía, y costó cuatro
    // regeneraciones enteras del guion.
    //
    // Ahora la FUNCIÓN —el trabajo del bloque, que es del canal— se vuelve a leer
    // del género en cada escritura. Lo que sí es del director y se respeta: el
    // título, el CONTENIDO de este episodio concreto y los minutos.
    const delGenero = (a, n) =>
      (genero?.bloques || []).find((b) => b.nombre === a.titulo) || (genero?.bloques || [])[n] || null;
    return suya.map((a, n) => ({
      titulo: a.titulo,
      funcion: delGenero(a, n)?.funcion || a.funcion || 'avanzar el relato',
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
