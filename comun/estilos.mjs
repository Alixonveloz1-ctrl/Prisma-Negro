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
  'Sin rostros reconocibles de personas reales. Sin texto sobre la imagen, sin ' +
  'marcas de agua, sin logotipos. No imites material de archivo auténtico ni ' +
  'fotografía de prensa real.';
