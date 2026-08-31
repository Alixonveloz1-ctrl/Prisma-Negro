// El aspecto del canal.
//
// Antes de esto, el estilo estaba escrito dentro de la fase de imagen y no había
// forma de saber cuál era sin generar ochenta imágenes. Eso es pagar para
// enterarte, que es exactamente al revés de como tiene que ser.
//
// El aspecto es un párrafo que se antepone a la descripción de la toma. El
// tratamiento del director le añade encima la paleta, la luz y la textura de ESTA
// pieza, así que dos episodios no salen iguales: el aspecto dice CÓMO ESTÁ RODADO
// el canal, el director dice cómo es la luz de este caso.
//
// §8.2: no genera fotorrealismo de personas reales identificables y no imita
// material de archivo auténtico. Un documental que pasa una imagen generada por
// archivo real está mintiendo, y eso hunde un canal.

// ─────────────────────────────────────────────────────────────────────────────
// UN SOLO ESTILO PARA TODO EL CANAL, Y ESTA ES LA CUENTA QUE LO DECIDE.
//
// Había seis estilos y se elegía uno por proyecto. Con la biblioteca permanente
// eso deja de ser una preferencia y pasa a ser dinero: la biblioteca son 141
// imágenes, y un canal que trabaja en dos estilos necesita la biblioteca DOS
// VECES o se mezcla —un perito en cine negro dentro de un episodio rodado en
// reconstrucción, sin que nada avise—.
//
// Y lo que se ganaba era menos de lo que parecía. Medido sobre la instrucción que
// sale de verdad hacia el generador: el estilo aportaba unos 270 caracteres de
// 2.660, un DIEZ POR CIENTO. El noventa restante —el oficio cinematográfico, la
// prohibición de texto legible, la barrera documental, la descripción del plano y
// la paleta que decide el director para cada caso— era idéntico en los seis. No
// eran seis mundos distintos: eran seis acentos sobre el mismo aspecto, y el
// acento no vale una biblioteca entera.
//
// Así que el estilo deja de ser una elección por proyecto. Lo que da variedad
// entre episodios sigue vivo y no cuesta nada: la identidad visual que el director
// decide para cada caso —paleta, luz, textura— y el elenco que rota.
//
// Si algún día hace falta otro aspecto, se cambia ESTE texto y se vuelve a generar
// la biblioteca. Es una decisión de canal, no de proyecto, y así está puesta.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// UN SOLO BLOQUE, Y NO DOS.
//
// Esto eran dos textos: el «estilo» —de qué clase es la imagen— y el «oficio
// cinematográfico» —lo que separa un fotograma de una foto de banco de imágenes—.
// Estaban separados porque el oficio tenía que sobrevivir a los seis estilos: «va
// aparte para que valga para los seis y no haya que acordarse de copiarlo en el
// séptimo».
//
// Con un solo aspecto esa razón desaparece, y lo que quedaba era peor: los dos
// decían lo mismo dos veces —grano de película, profundidad de campo corta, nada
// de saturación de anuncio— y repetir una instrucción no la refuerza, la diluye.
// Ahora es un bloque solo, sin repeticiones, y se lee como lo que es: cómo está
// rodado este canal.
//
// Y son PUNTOS CONCRETOS, no adjetivos. «Que sea cinematográfico» no significa
// nada para un generador: si no le dices otra cosa te da la foto media de internet
// —sujeto centrado, todo enfocado, todo iluminado por igual, el sitio recién
// ordenado, nada delante de la cámara—. Cada frase de aquí abajo es lo contrario
// de uno de esos puntos, dicho de forma que se pueda ejecutar.
// ─────────────────────────────────────────────────────────────────────────────

export const ESTILO_DEL_CANAL =
  // QUÉ ES
  'Esto es un FOTOGRAMA de una serie documental rodada con cámara de cine, no una ' +
  'foto de banco de imágenes ni una ilustración. Aspecto de material rodado y ' +
  'etalonado, nunca de render, de 3D ni de videojuego. ' +
  // ÓPTICA Y FOCO
  'Sensor grande y óptica esférica de cine: profundidad de campo corta y foco ' +
  'selectivo, solo un plano nítido y el resto cae. Cámara en mano sutil o sobre ' +
  'trípode, nunca de dron ni de gran angular deformado. ' +
  // COMPOSICIÓN
  'Rueda a TRAVÉS de algo: un marco de puerta, una ventana con reflejos, unas ' +
  'hojas, un hombro, una rejilla — que haya un primer término desenfocado que tape ' +
  'parte del cuadro. El sujeto va descentrado y con aire vacío alrededor; nada de ' +
  'composición simétrica ni de sujeto centrado. ' +
  // LUZ
  'UNA sola fuente de luz dominante, con dirección clara y motivada por algo que se ' +
  've o se intuye —una lámpara, una farola, una ventana, unos faros—, y lo que no ' +
  'alcanza esa luz se queda en negro, sin relleno. ' +
  // AIRE
  'El aire tiene textura: polvo suspendido, vaho, llovizna, humedad, un halo en las ' +
  'luces. ' +
  // TEXTURA Y COLOR
  'Grano de película fino, contraste de cine con negros densos y no grises lavados, ' +
  'y una paleta contenida de dos o tres colores. ' +
  // ESCENOGRAFÍA
  'El sitio está vivido, con desorden real, marcas de uso y suciedad; no recién ' +
  'ordenado ni de catálogo. ' +
  // IMPERFECCIÓN
  'Y una pequeña imperfección de cámara: un destello en el objetivo, una viñeta, ' +
  'una aberración leve en las luces. ' +
  // LO QUE NO
  'Nada de saturación de anuncio, nada de brillos artificiales, nada de piel ' +
  'perfecta ni retocada, nada de iluminación plana de estudio, nada de HDR.';

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
 * DÓNDE PASA ESTO. Y no es una regla del canal: es del CASO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Estás manejando del lado derecho de la carretera, bien, pero el volante del
 *  lado derecho. Sé que hay un par de países donde se maneja así, pero eso no es
 *  lo normal.»
 *
 * y más tarde, corrigiéndome:
 *
 * «Debes inventar historias de cualquier parte del mundo. No tienen que ser de
 *  Latinoamérica. Que sea de Estados Unidos, de Inglaterra, de Rusia, de Panamá,
 *  de Colombia, de Perú. El país y la ciudad tienen que ser CORRECTOS.»
 *
 * Los dos avisos dicen lo mismo, y yo entendí mal el primero.
 *
 * El fallo del volante nunca fue «esto no es Latinoamérica». Fue que NADIE LE
 * HABÍA DICHO AL GENERADOR DÓNDE PASA LA HISTORIA, y sin decírselo cada imagen
 * cae en el promedio de lo que el modelo vio más. La respuesta que puse —clavar
 * el canal entero en un mundo hispanohablante con el volante a la izquierda—
 * tapaba el síntoma y rompía el producto: con esa regla, un caso en Liverpool
 * salía con el volante en el lado que no es. El MISMO fallo, del otro lado.
 *
 * Lo correcto es que el mundo de la imagen sea el del caso. Y como el caso ya
 * lleva un país REAL y una ciudad REAL, no hay nada que adivinar.
 *
 * Quedan dos mundos, porque hay dos clases de imagen:
 *
 *   · LA DEL EPISODIO sabe dónde pasa, y se le dice.  → `mundoDelCaso`
 *   · LA DE LA BIBLIOTECA no puede saberlo: es permanente y la misma cara sirve
 *     para un episodio en Ohio y otro en Cusco. Así que no se le pide un país:
 *     se le pide que NO DELATE NINGUNO.                → `MUNDO_NEUTRO`
 *
 * Y la trampa que sí valía para las dos: pedirle un país a un generador devuelve
 * una POSTAL —colores saturados, folclore, tópico de agencia de viajes—, que es
 * igual de falso y encima cursi. Lo que se pide es un sitio corriente.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const NI_POSTAL =
  'Y NO ES UNA POSTAL: nada de folclore, ni color turístico, ni tópicos de ' +
  'agencia de viajes. Es un sitio corriente y trabajado, de los que a cualquiera ' +
  'le suenan a su barrio.';

/**
 * El mundo de una imagen de ARCHIVO, que va a servir en episodios de países
 * distintos. No se le pide un sitio: se le pide que no delate ninguno.
 */
export const MUNDO_NEUTRO =
  'ESTA IMAGEN ES DE ARCHIVO: va a usarse en episodios que ocurren en países ' +
  'distintos, así que NADA puede atarla a un país concreto. Ni banderas, ni ' +
  'escudos, ni parches o insignias de un cuerpo identificable, ni matrículas, ni ' +
  'carteles, ni señales de tráfico, ni buzones, ni uniformes de una policía ' +
  'reconocible. La ropa es de trabajo, corriente y sin marcas. ' +
  // El volante es justo lo que fija un país en medio segundo: si no se ve, no
  // delata. Por eso los vehículos de archivo se ven por fuera.
  'Si aparece un vehículo, se ve POR FUERA: no se ve el salpicadero ni el ' +
  'volante, que es lo que ataría el plano a un lado de la carretera. ' +
  NI_POSTAL;

/**
 * El mundo de una imagen DEL EPISODIO, que sí sabe dónde pasa.
 *
 * No llevo aquí una tabla de por qué lado circula cada país: sería doscientas
 * filas que se quedan viejas y que yo no puedo mantener. Lo que se hace es
 * NOMBRAR EL PAÍS y obligar a resolver la regla para ÉL —que es un dato que el
 * generador sí tiene—, en vez de dejar que caiga en su promedio, que es lo que
 * puso el volante donde no iba.
 */
export function mundoDelCaso({ pais = '', ciudad = '' } = {}) {
  const donde = String(pais || '').trim();
  if (!donde) return MUNDO_NEUTRO;
  const sitio = String(ciudad || '').trim();
  return (
    `ESTO PASA EN ${(sitio ? `${sitio}, ${donde}` : donde).toUpperCase()}, Y SE TIENE QUE NOTAR. ` +
    `Los vehículos, las matrículas, las señales, los semáforos, los buzones, los ` +
    `enchufes, la arquitectura, la ropa y los uniformes son los de ${donde}: no los ` +
    `de otro sitio, y no una mezcla de varios. ` +
    // LO CONCRETO, que es lo que canta cuando falla.
    `EL VOLANTE Y EL CARRIL: piensa por qué lado se circula en ${donde} antes de ` +
    `dibujar ningún coche. Si en ${donde} se circula por la DERECHA, el volante va ` +
    `a la IZQUIERDA; si se circula por la IZQUIERDA, el volante va a la DERECHA. ` +
    `No lo mezcles y no lo dejes al azar. ` +
    NI_POSTAL
  );
}

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
