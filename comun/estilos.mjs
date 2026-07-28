// Los estilos visuales.
//
// Antes de esto, el estilo estaba escrito dentro de la fase de imagen y no había
// forma de saber cuál era sin generar ochenta imágenes. Eso es pagar para
// enterarte, que es exactamente al revés de como tiene que ser.
//
// Cada estilo es un párrafo que se antepone a la descripción de la toma. El
// tratamiento del director le añade encima la paleta, la luz y la textura de ESTA
// pieza, así que dos documentales del mismo estilo no salen iguales: el estilo dice
// de qué CLASE es la imagen, el director dice cómo es la de este caso.
//
// §8.2: ninguno de estos genera fotorrealismo de personas reales identificables, y
// ninguno imita material de archivo auténtico. Un documental que pasa una imagen
// generada por archivo real está mintiendo, y eso hunde un canal.

export const ESTILOS = [
  {
    id: 'reconstruccion',
    nombre: 'Reconstrucción documental',
    resumen: 'Como si una cámara hubiera estado allí. Es el estilo por defecto.',
    prompt:
      'Fotografía de reconstrucción documental. Cámara en mano sutil, luz natural ' +
      'motivada por fuentes visibles en el cuadro, grano fino de película, ' +
      'profundidad de campo corta. Aspecto de material rodado, no de render. ' +
      'Nada de brillos artificiales ni de saturación de anuncio.',
  },
  {
    id: 'noir',
    nombre: 'Cine negro',
    resumen: 'Contraste duro, sombras largas, noche. Para crimen y desapariciones.',
    prompt:
      'Fotografía de cine negro contemporáneo. Contraste alto, negros profundos, ' +
      'luz lateral dura que deja media cara en sombra, humedad y reflejos en el ' +
      'suelo, niebla o vapor. Predominio de la noche y los interiores mal ' +
      'iluminados. Composición con mucho aire vacío alrededor del sujeto.',
  },
  {
    id: 'forense',
    nombre: 'Forense y evidencia',
    resumen: 'Objetos, documentos, detalles. Frío y clínico.',
    prompt:
      'Fotografía forense y de evidencia. Luz plana y neutra, fondos lisos, objetos ' +
      'centrados y aislados: documentos, prendas, herramientas, huellas, mapas sobre ' +
      'mesa. Paleta desaturada, casi gris. Aspecto de informe, no de fotografía ' +
      'artística. Sin personas.',
  },
  {
    id: 'archivo',
    nombre: 'Época estilizada',
    resumen: 'Sabor de otra década, pero DECLARADAMENTE recreado.',
    prompt:
      'Recreación estilizada de una época, claramente recreada y no confundible con ' +
      'material de archivo auténtico: color virado y limpio, sin rayas de película ' +
      'falsas, sin marcas de agua de agencia, sin sellos de fecha simulados. ' +
      'Vestuario y objetos de la época, encuadres de la época, acabado moderno.',
  },
  {
    id: 'ilustrado',
    nombre: 'Ilustración editorial',
    resumen: 'Dibujado. La opción más segura cuando hay personas reales.',
    prompt:
      'Ilustración editorial de prensa. Trazo visible, texturas de tinta y aguada, ' +
      'paleta reducida a tres o cuatro colores, composición gráfica y sintética. ' +
      'Claramente dibujado, nunca confundible con una fotografía.',
  },
  {
    id: 'grafico',
    nombre: 'Mapas y esquemas',
    resumen: 'Diagramas, líneas de tiempo, planos. Para explicar.',
    prompt:
      'Infografía documental sobria. Mapas, planos, cortes, líneas de tiempo y ' +
      'diagramas sobre fondo oscuro. Líneas finas, tipografía de palo seco discreta, ' +
      'un solo color de acento. Aspecto de gráfico de periódico serio, no de ' +
      'presentación corporativa.',
  },
];

export const ESTILO_POR_DEFECTO = 'reconstruccion';

export const estiloPorId = (id) =>
  ESTILOS.find((e) => e.id === id) || ESTILOS.find((e) => e.id === ESTILO_POR_DEFECTO);

/**
 * La barrera de §8.2, aparte del estilo y siempre presente.
 *
 * Va suelta y no dentro de cada estilo para que no se pueda perder al añadir uno
 * nuevo: quien escriba el séptimo estilo no tiene que acordarse de copiarla.
 */
export const BARRERA_DOCUMENTAL =
  // Lo prohibido es PARECERSE A ALGUIEN REAL, no que salga gente.
  //
  // Antes esto decía «sin rostros reconocibles de personas reales» y el generador
  // lo leía como «sin rostros»: salían objetos, manos y calles vacías, documental
  // tras documental. Un documental de plataforma está lleno de dramatizaciones con
  // intérpretes, y eso es legítimo justamente porque son intérpretes.
  'Las personas que aparecen son INTÉRPRETES de una dramatización, no las personas ' +
  'reales del caso: rostros anónimos, que no se parezcan a ninguna persona ' +
  'identificable ni a ningún personaje conocido. Sin marcas de agua, sin logotipos. ' +
  'No imites material de archivo auténtico ni fotografía de prensa real.';

/**
 * NADA DE LETRAS. Y no es una manía: es que no salen.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Los expedientes, los titulares y los carteles salían con garabatos: formas que
 * parecen letras y no dicen nada. Y en un documental eso es lo peor que puede
 * pasar, porque el documento es justo lo que el espectador va a mirar de cerca.
 * Un texto ilegible en primer plano grita «esto lo hizo una máquina».
 *
 * La salida no es quitar los documentos —son media fase forense— sino ENCUADRARLOS
 * COMO LOS ENCUADRA UN DOCUMENTAL DE VERDAD: en escorzo, desenfocados, cortados por
 * el borde, tapados por una mano, con un dedo señalando una línea que no se lee. En
 * un documental real tampoco se lee el expediente; se entiende que es un expediente.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const SIN_TEXTO_LEGIBLE =
  'NADA DE TEXTO LEGIBLE EN NINGUNA PARTE DEL CUADRO. Ni en documentos, ni en ' +
  'periódicos, ni en pantallas, ni en carteles, ni en matrículas, ni rotulado sobre ' +
  'la imagen. Ni siquiera letras sueltas o números. Si la escena pide un documento, ' +
  'un periódico o un expediente, se ve QUE lo es y no QUÉ dice: en escorzo muy ' +
  'inclinado, fuera de foco, cortado por el borde del cuadro, tapado en parte por ' +
  'una mano o por otro papel, o demasiado lejos. Los letreros y los rótulos ' +
  'luminosos son superficies de luz y color sin letras. Prefiere el detalle sin ' +
  'texto —un sello, una firma emborronada, una esquina doblada, una carpeta ' +
  'cerrada— antes que una página escrita.';

/**
 * Lo que separa un fotograma de una foto de banco de imágenes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «No me gusta, esas imágenes se ven tan básicas.»
 *
 * Y era verdad. Un generador, si no le dices otra cosa, te da la foto media de
 * internet: el sujeto centrado, todo enfocado, todo iluminado por igual, el sitio
 * limpio y ordenado, sin aire delante de la cámara. Eso es una foto de catálogo.
 *
 * Un fotograma de documental es lo contrario en cada punto, y son puntos concretos
 * —no «que sea cinematográfico», que no significa nada para un generador—: se rueda
 * A TRAVÉS de algo, la luz viene de un sitio y el resto se queda a oscuras, el aire
 * tiene textura, y el sitio está vivido. Va aparte de los estilos para que valga
 * para los seis y no haya que acordarse de copiarlo en el séptimo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const OFICIO_CINEMATOGRAFICO =
  'Esto es un FOTOGRAMA de documental, no una foto de banco de imágenes. Rueda a ' +
  'través de algo: un marco de puerta, una ventana con reflejos, unas hojas, un ' +
  'hombro, una rejilla — que haya un primer término desenfocado que tape parte del ' +
  'cuadro. El sujeto va descentrado y con aire vacío alrededor; nada de composición ' +
  'simétrica ni de sujeto centrado. UNA sola fuente de luz dominante, con dirección ' +
  'clara y motivada por algo que se ve o se intuye —una lámpara, una farola, una ' +
  'ventana, unos faros—, y lo que no alcanza esa luz se queda en negro, sin relleno. ' +
  'El aire tiene textura: polvo suspendido, vaho, llovizna, humedad, un halo en las ' +
  'luces. Foco corto y selectivo: solo un plano está nítido y el resto cae. Grano ' +
  'de película fino y contraste con negros densos, no grises lavados. El sitio está ' +
  'vivido, con desorden real, marcas de uso y suciedad; no recién ordenado. Y una ' +
  'pequeña imperfección de cámara: un destello en el objetivo, una viñeta, una ' +
  'aberración leve en las luces. Nada de saturación de anuncio, nada de piel ' +
  'perfecta, nada de iluminación de estudio.';
