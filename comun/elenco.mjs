// El elenco fijo del canal y sus versiones.
//
// ─────────────────────────────────────────────────────────────────────────────
// «Hay que tener por lo menos cinco policías, cinco doctores, cinco peritos, al
//  menos unos veinte testigos. Y la aplicación debe recordar: si en un documental
//  utilizó un policía, por lo menos en los dos siguientes no debe utilizar el
//  mismo. Lo mismo con la patrulla llegando a la casa: de todo lo que se va a
//  reutilizar debemos tener por lo menos tres versiones.»
//
// Un canal con UN perito es un canal donde el mismo señor aparece en el episodio
// 3, en el 4 y en el 5 diciendo cosas distintas de casos distintos, y eso se nota
// a la primera: deja de parecer un canal de documentales y parece lo que es —una
// plantilla—. La biblioteca resolvía el problema del coste y creaba este.
//
// Así que cada papel tiene VARIAS PERSONAS y cada recurso VARIAS VERSIONES, y la
// elección de cuál toca no es al azar ni la primera: se lleva un registro de qué
// usó cada episodio y se rota. Ver `elegirVariante` en `app/fases/biblioteca.js`.
//
// CÓMO ESTÁ MONTADO, y por qué así:
//
//   · El elenco es DEL CANAL, no de un género. Un perito forense es el mismo
//     papel en un crimen frío que en un terror real, y tenerlo declarado dos
//     veces sería pagarlo dos veces y tener dos peritos donde hay uno. Cada
//     género dice qué papeles usa, por su clave.
//
//   · El PLANO es del papel —dónde está, qué hace, cómo se rueda— y la PERSONA es
//     de la variante. Así los cinco peritos comparten laboratorio y encuadre, que
//     es lo que hace que el canal se reconozca, y se distinguen por quiénes son.
//     Escribir cinco planos completos por papel sería copiar y pegar cuatro veces
//     y equivocarse en la quinta.
//
//   · Los recursos igual: la descripción es del sitio y el MATIZ es de la versión
//     —otra hora, otro ángulo, otro tiempo—. Tres versiones de la carretera de
//     noche no son tres carreteras: son la misma carretera tres veces, que es lo
//     que las hace intercambiables sin romper la unidad visual.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cuántos episodios seguidos NO puede repetirse una persona o una versión.
 *
 * Dos: si el episodio 7 usó al perito Salgado, el 8 y el 9 usan a otro. Con uno
 * solo, la alternancia se ve —A, B, A, B— y es casi tan mala como no rotar.
 */
export const EPISODIOS_SIN_REPETIR = 2;

/** Lo mínimo que tiene que tener cualquier papel o recurso para poder rotar. */
export const VERSIONES_MINIMAS = 3;

// ── El reparto ────────────────────────────────────────────────────────────────
//
// `plano` es el papel; `variantes[].persona` es quién lo hace. La descripción
// final que ve el generador de imágenes es la suma de los dos.

export const ELENCO = [
  {
    id: 'perito',
    nombre: 'perito forense',
    plano: {
      encuadre: 'plano medio',
      lugar: 'el laboratorio forense',
      luz: 'fluorescente fría de techo, mesa de acero devolviendo la luz',
      descripcion:
        'Sentada frente a una mesa de acero, con bata sobre ropa de calle, hablando ' +
        'hacia un lado de la cámara. Se la ve a través del marco de una puerta de ' +
        'vidrio esmerilado que ocupa el primer término y la deja descentrada.',
    },
    variantes: [
      { id: 'v1', persona: 'una mujer de unos cincuenta, pelo gris muy corto, gafas de montura fina' },
      { id: 'v2', persona: 'un hombre de unos cuarenta, barba recortada, calvo, camisa azul bajo la bata' },
      { id: 'v3', persona: 'una mujer de unos treinta y cinco, pelo negro recogido en moño, sin gafas' },
      { id: 'v4', persona: 'un hombre de unos sesenta, pelo blanco peinado atrás, corbata bajo la bata' },
      { id: 'v5', persona: 'una mujer de unos cuarenta y cinco, pelirroja, coleta baja, pendientes pequeños' },
    ],
  },
  {
    id: 'policia',
    nombre: 'agente que llevó el caso',
    plano: {
      encuadre: 'plano medio',
      lugar: 'una sala de reuniones de comisaría',
      luz: 'fluorescente de techo, ventana alta al fondo con persiana medio bajada',
      descripcion:
        'Sentado a una mesa larga vacía, de uniforme, hablando hacia un lado de la ' +
        'cámara. En primer término y desenfocada, la esquina del respaldo de una silla.',
    },
    variantes: [
      { id: 'v1', persona: 'una mujer de unos cuarenta, pelo castaño recogido, mandíbula marcada' },
      { id: 'v2', persona: 'un hombre de unos cincuenta y cinco, corpulento, bigote cano' },
      { id: 'v3', persona: 'un hombre de unos treinta, delgado, rapado, cuello tatuado apenas visible' },
      { id: 'v4', persona: 'una mujer de unos sesenta, pelo corto blanco, gafas de leer colgando' },
      { id: 'v5', persona: 'un hombre de unos cuarenta y cinco, piel morena, cicatriz fina en la ceja' },
    ],
  },
  {
    id: 'detective',
    nombre: 'detective veterano',
    plano: {
      encuadre: 'plano medio',
      lugar: 'el despacho del detective',
      luz: 'persiana veneciana con sol bajo, franjas sobre la pared, el resto en penumbra',
      descripcion:
        'Sentado de lado en una silla de oficina vieja, con camisa arremangada, ' +
        'hablando hacia un lado de la cámara. Rodado por encima del hombro de otra ' +
        'persona, desenfocada en primer término.',
    },
    variantes: [
      { id: 'v1', persona: 'un hombre de unos sesenta y cinco, pelo blanco ralo, papada, tirantes' },
      { id: 'v2', persona: 'una mujer de unos cincuenta y cinco, pelo gris a los hombros, sin maquillaje' },
      { id: 'v3', persona: 'un hombre de unos cincuenta, moreno, entradas pronunciadas, reloj grande' },
      { id: 'v4', persona: 'una mujer de unos sesenta, muy delgada, pelo teñido de rubio ceniza' },
      { id: 'v5', persona: 'un hombre de unos setenta, jubilado, jersey de pico, manos con manchas de edad' },
    ],
  },
  {
    id: 'medico',
    nombre: 'médico que los atendió',
    plano: {
      encuadre: 'plano medio',
      lugar: 'un pasillo de hospital comarcal',
      luz: 'fluorescente frío, suelo brillante que devuelve la luz',
      descripcion:
        'De pie contra la pared del pasillo, con bata blanca sobre el pijama de ' +
        'quirófano, hablando hacia un lado de la cámara. Una camilla desenfocada ' +
        'cruza el primer término.',
    },
    variantes: [
      { id: 'v1', persona: 'un hombre de unos cincuenta, gafas cuadradas, pelo canoso muy corto' },
      { id: 'v2', persona: 'una mujer de unos treinta y cinco, pelo oscuro recogido, ojeras marcadas' },
      { id: 'v3', persona: 'una mujer de unos sesenta, pelo corto blanco, collar sencillo' },
      { id: 'v4', persona: 'un hombre de unos cuarenta, piel oscura, barba corta, fonendo al cuello' },
      { id: 'v5', persona: 'un hombre de unos sesenta y cinco, alto, encorvado, gafas de media luna' },
    ],
  },
  {
    id: 'testigo',
    nombre: 'testigo',
    plano: {
      encuadre: 'plano medio',
      lugar: 'la cocina de una casa de pueblo',
      luz: 'ventana lateral de mañana gris, sin lámparas encendidas',
      descripcion:
        'Sentado a la mesa de la cocina con las manos juntas, con ropa de calle ' +
        'corriente, hablando hacia un lado de la cámara. Se ve a través del vano de ' +
        'la puerta, con la jamba tapando parte del cuadro.',
    },
    // VEINTE. Es el papel que más entra —cada dos o tres minutos habla alguien— y
    // el que más canta si se repite: un vecino que aparece en cuatro casos
    // distintos convierte el canal entero en un decorado.
    variantes: [
      { id: 'v1', persona: 'un hombre de unos sesenta, con gorra de tela y chaqueta de faena' },
      { id: 'v2', persona: 'una mujer de unos setenta, bata de casa, pelo corto rizado' },
      { id: 'v3', persona: 'un hombre de unos treinta, sudadera, barba descuidada' },
      { id: 'v4', persona: 'una mujer de unos cuarenta, jersey de punto, pelo liso a los hombros' },
      { id: 'v5', persona: 'un hombre de unos cincuenta, camisa de cuadros, manos grandes y agrietadas' },
      { id: 'v6', persona: 'una mujer de unos veinticinco, pelo teñido, aro en la nariz' },
      { id: 'v7', persona: 'un hombre de unos setenta y cinco, boina, bastón apoyado en la silla' },
      { id: 'v8', persona: 'una mujer de unos cincuenta y cinco, delantal, gafas colgadas del cuello' },
      { id: 'v9', persona: 'un hombre de unos cuarenta y cinco, polo de trabajo, gorra en la mesa' },
      { id: 'v10', persona: 'una mujer de unos treinta y cinco, coleta alta, sudadera con cremallera' },
      { id: 'v11', persona: 'un hombre de unos veinte, muy delgado, pelo largo recogido' },
      { id: 'v12', persona: 'una mujer de unos sesenta y cinco, pelo blanco cardado, broche en la chaqueta' },
      { id: 'v13', persona: 'un hombre de unos cincuenta y cinco, piel morena, camisa blanca remangada' },
      { id: 'v14', persona: 'una mujer de unos cuarenta y cinco, mono de trabajo, uñas cortas' },
      { id: 'v15', persona: 'un hombre de unos treinta y cinco, gafas, jersey de cuello alto' },
      { id: 'v16', persona: 'una mujer de unos ochenta, muy menuda, rebeca abotonada hasta arriba' },
      { id: 'v17', persona: 'un hombre de unos sesenta y cinco, calvo, gafas de sol en la cabeza' },
      { id: 'v18', persona: 'una mujer de unos veintiocho, pelo corto oscuro, camiseta lisa' },
      { id: 'v19', persona: 'un hombre de unos cuarenta, barba poblada, chaleco acolchado' },
      { id: 'v20', persona: 'una mujer de unos cincuenta, pelo recogido con pinza, camisa vaquera' },
    ],
  },
  {
    id: 'familiar',
    nombre: 'familiar de la víctima',
    plano: {
      encuadre: 'primer plano',
      lugar: 'el salón de una casa con muebles viejos',
      luz: 'lámpara de pie cálida a un lado, el resto de la habitación en negro',
      descripcion:
        'Sentado en un sillón, con las manos en el regazo, hablando hacia un lado de ' +
        'la cámara. Un marco de fotos desenfocado en primer término, a un lado del cuadro.',
    },
    variantes: [
      { id: 'v1', persona: 'una mujer mayor de unos setenta y cinco, pelo blanco, rebeca gris' },
      { id: 'v2', persona: 'un hombre de unos cincuenta, hermano, jersey oscuro, ojos enrojecidos' },
      { id: 'v3', persona: 'una mujer de unos cuarenta, hija, pelo recogido, camisa lisa' },
      { id: 'v4', persona: 'un hombre de unos ochenta, padre, muy delgado, camisa abotonada' },
      { id: 'v5', persona: 'una mujer de unos treinta, sobrina, sudadera, mira poco a cámara' },
      { id: 'v6', persona: 'un hombre de unos sesenta, viudo, chaqueta de punto, alianza en la mano' },
    ],
  },
  {
    id: 'periodista',
    nombre: 'periodista que lo destapó',
    plano: {
      encuadre: 'plano medio',
      lugar: 'una redacción medio vacía',
      luz: 'pantallas encendidas y una ventana lejana al fondo',
      descripcion:
        'De pie junto a una mesa con papeles, hablando hacia un lado de la cámara. ' +
        'Rodado por encima del hombro de otra persona, desenfocada.',
    },
    variantes: [
      { id: 'v1', persona: 'una mujer de unos cuarenta, gafas grandes, pelo corto oscuro' },
      { id: 'v2', persona: 'un hombre de unos cincuenta y cinco, camisa sin corbata, canas en las sienes' },
      { id: 'v3', persona: 'un hombre de unos treinta, delgado, jersey fino, libreta en la mano' },
      { id: 'v4', persona: 'una mujer de unos sesenta, pelo blanco liso, chaqueta de tweed' },
    ],
  },
  {
    id: 'abogado',
    nombre: 'abogado de las víctimas',
    plano: {
      encuadre: 'plano medio',
      lugar: 'un despacho con estanterías de tomos',
      luz: 'ventana lateral grande, contraluz suave',
      descripcion:
        'Sentado tras una mesa despejada, trajeado, hablando hacia un lado de la ' +
        'cámara. Una estantería desenfocada en primer término, a un lado.',
    },
    variantes: [
      { id: 'v1', persona: 'un hombre de unos cincuenta, traje gris, gafas de pasta' },
      { id: 'v2', persona: 'una mujer de unos cuarenta y cinco, traje oscuro, pelo liso hasta el hombro' },
      { id: 'v3', persona: 'un hombre de unos sesenta y cinco, pajarita, pelo blanco abundante' },
      { id: 'v4', persona: 'una mujer de unos treinta y cinco, blusa clara, moño bajo' },
    ],
  },
  {
    id: 'fiscal',
    nombre: 'fiscal del caso',
    plano: {
      encuadre: 'plano medio',
      lugar: 'una sala de vistas vacía',
      luz: 'ventanal alto, luz dura y plana',
      descripcion:
        'De pie junto a un estrado vacío, trajeado, hablando hacia un lado de la ' +
        'cámara. El respaldo de un banco de madera cruza el primer término.',
    },
    variantes: [
      { id: 'v1', persona: 'un hombre de unos cincuenta y cinco, traje azul marino, entradas' },
      { id: 'v2', persona: 'una mujer de unos cincuenta, pelo gris corto, gafas sin montura' },
      { id: 'v3', persona: 'un hombre de unos cuarenta, moreno, barba de tres días' },
    ],
  },
  {
    id: 'coordinador',
    nombre: 'coordinador de la búsqueda',
    plano: {
      encuadre: 'plano medio',
      lugar: 'el puesto de mando de la batida',
      luz: 'mañana gris bajo una carpa, luz plana',
      descripcion:
        'De pie junto a una mesa plegable con mapas, con chaleco reflectante, ' +
        'hablando hacia un lado de la cámara. Rodado a través de la lona de la carpa, ' +
        'que tapa una esquina del cuadro.',
    },
    variantes: [
      { id: 'v1', persona: 'un hombre de unos cuarenta y cinco, barba corta, gorro de lana' },
      { id: 'v2', persona: 'una mujer de unos treinta y ocho, coleta, walkie en la mano' },
      { id: 'v3', persona: 'un hombre de unos sesenta, curtido, gafas de sol en la frente' },
    ],
  },
  {
    id: 'rescatador',
    nombre: 'jefe del equipo de rescate',
    plano: {
      encuadre: 'plano medio',
      lugar: 'la nave del equipo de montaña',
      luz: 'portón abierto al fondo, interior en penumbra',
      descripcion:
        'De pie junto a material colgado en la pared, con forro polar, hablando ' +
        'hacia un lado de la cámara. Cuerdas colgadas desenfocadas en primer término.',
    },
    variantes: [
      { id: 'v1', persona: 'una mujer de unos cuarenta, pelo corto, piel curtida por el sol' },
      { id: 'v2', persona: 'un hombre de unos cincuenta, barba espesa, gorro polar' },
      { id: 'v3', persona: 'un hombre de unos treinta y cinco, atlético, tatuaje en el antebrazo' },
    ],
  },
  {
    id: 'enfermera',
    nombre: 'personal que trabajó allí',
    plano: {
      encuadre: 'plano medio',
      lugar: 'una sala de descanso con taquillas',
      luz: 'fluorescente frío, sin ventanas',
      descripcion:
        'Sentado en un banco junto a unas taquillas metálicas, con uniforme sanitario, ' +
        'hablando hacia un lado de la cámara. El borde de una taquilla abierta tapa ' +
        'parte del cuadro.',
    },
    variantes: [
      { id: 'v1', persona: 'una mujer de unos cincuenta y cinco, pelo teñido, gafas colgando' },
      { id: 'v2', persona: 'un hombre de unos cuarenta, calvo, brazos gruesos' },
      { id: 'v3', persona: 'una mujer de unos sesenta y cinco, jubilada, rebeca sobre el uniforme' },
      { id: 'v4', persona: 'una mujer de unos treinta, trenza, mira poco a cámara' },
    ],
  },
  {
    id: 'interno',
    nombre: 'quien estuvo dentro',
    plano: {
      encuadre: 'primer plano',
      lugar: 'el salón de un piso pequeño',
      luz: 'lámpara de mesa cálida, resto en penumbra',
      descripcion:
        'Sentado en el borde de un sofá, con las manos entrelazadas, hablando hacia ' +
        'un lado de la cámara. Un visillo desenfocado cruza el primer término.',
    },
    variantes: [
      { id: 'v1', persona: 'un hombre de unos sesenta, delgado, camisa abotonada hasta arriba' },
      { id: 'v2', persona: 'una mujer de unos cincuenta y cinco, pelo corto gris, manos inquietas' },
      { id: 'v3', persona: 'un hombre de unos setenta, barba blanca, mirada baja' },
      { id: 'v4', persona: 'una mujer de unos cuarenta y cinco, pelo largo liso, jersey ancho' },
    ],
  },
  {
    id: 'exmiembro',
    nombre: 'quien salió de la comunidad',
    plano: {
      encuadre: 'primer plano',
      lugar: 'una habitación alquilada con poca cosa',
      luz: 'ventana lateral de tarde, sin cortinas',
      descripcion:
        'Sentado al borde de una cama, con las manos en el regazo, hablando hacia un ' +
        'lado de la cámara. El marco de la puerta ocupa el primer término.',
    },
    variantes: [
      { id: 'v1', persona: 'una mujer de unos cuarenta, pelo recogido, camiseta lisa' },
      { id: 'v2', persona: 'un hombre de unos treinta y cinco, barba, jersey gastado' },
      { id: 'v3', persona: 'una mujer de unos veintiocho, pelo muy corto, pendientes pequeños' },
      { id: 'v4', persona: 'un hombre de unos cincuenta, canoso, camisa de cuadros' },
    ],
  },
  {
    id: 'superviviente',
    nombre: 'quien volvió',
    plano: {
      encuadre: 'primer plano',
      lugar: 'un salón sencillo con ventana al monte',
      luz: 'luz de día nublado desde un lado',
      descripcion:
        'Sentado en una butaca, con las manos quietas, hablando hacia un lado de la ' +
        'cámara. El alféizar de la ventana desenfocado en primer término.',
    },
    variantes: [
      { id: 'v1', persona: 'un hombre de unos cincuenta, marcas de congelación en la cara' },
      { id: 'v2', persona: 'una mujer de unos treinta y cinco, pelo corto, cicatriz en la mano' },
      { id: 'v3', persona: 'un hombre de unos sesenta, barba blanca, camisa de franela' },
    ],
  },
  {
    id: 'investigador',
    nombre: 'quien investigó el asunto',
    plano: {
      encuadre: 'plano medio',
      lugar: 'un despacho universitario con papeles',
      luz: 'flexo y una ventana pequeña al fondo',
      descripcion:
        'Sentado entre pilas de carpetas, hablando hacia un lado de la cámara. Una ' +
        'pila de papeles desenfocada tapa la esquina inferior del cuadro.',
    },
    variantes: [
      { id: 'v1', persona: 'una mujer de unos cuarenta y cinco, gafas, pelo rizado suelto' },
      { id: 'v2', persona: 'un hombre de unos sesenta, chaqueta de pana, barba corta' },
      { id: 'v3', persona: 'un hombre de unos treinta y cinco, camisa lisa, pelo muy corto' },
    ],
  },
];

export const arquetipoPorId = (id) => ELENCO.find((a) => a.id === String(id || '').toLowerCase()) || null;

/**
 * La descripción completa de una variante: el papel más quién lo hace.
 *
 * Se compone aquí y en ningún otro sitio: si la biblioteca la compusiera por su
 * cuenta y la fase de imagen por la suya, un cambio en el formato daría dos
 * personas distintas para la misma clave y habría que pagar la biblioteca otra vez.
 */
export function planoDeVariante(arquetipo, variante) {
  if (!arquetipo || !variante) return null;
  return {
    encuadre: arquetipo.plano.encuadre,
    movimientoCamara: 'fijo',
    lugar: arquetipo.plano.lugar,
    luz: arquetipo.plano.luz,
    sujetos: [`${arquetipo.nombre} — ${variante.persona}`],
    descripcion: `${variante.persona}. ${arquetipo.plano.descripcion}`,
  };
}

// ── Los recursos transversales ────────────────────────────────────────────────
//
// Planos que no son de ningún caso ni de ningún género: la carretera de noche, el
// precinto, el archivador, las manos pasando hojas de un expediente. Se generan
// una vez y cualquier episodio los hereda sin pagar nada.
//
// Y CADA UNO CON TRES VERSIONES. Un recurso que vuelve en todos los episodios es
// justo el que más canta: la misma carretera exacta en ocho documentales seguidos
// se reconoce enseguida. Las tres versiones no son tres sitios distintos —eso
// rompería la unidad visual del canal— sino el mismo sitio en otro momento, desde
// otro sitio o con otro tiempo.

export const RECURSOS = [
  {
    id: 'carretera-noche', lugar: 'una carretera comarcal de noche', encuadre: 'plano general',
    luz: 'faros de un coche y nada más, negro a los lados',
    descripcion: 'Asfalto mojado y la línea blanca perdiéndose, vista desde el arcén a la altura de la rodilla; hierba alta desenfocada tapando el borde inferior del cuadro.',
    variantes: [
      { id: 'v1', matiz: 'con llovizna fina cruzando el haz de los faros' },
      { id: 'v2', matiz: 'con niebla baja que se come el fondo a los treinta metros' },
      { id: 'v3', matiz: 'ya de madrugada, el asfalto secándose y el cielo aclarando por un lado' },
    ],
  },
  {
    id: 'precinto', lugar: 'el precinto policial', encuadre: 'detalle',
    luz: 'luz azul intermitente por un lado, resto en penumbra',
    descripcion: 'Cinta de precinto tensada cruzando el cuadro, movida por el viento, muy cerca y fuera de foco por un extremo; detrás, formas humanas irreconocibles.',
    variantes: [
      { id: 'v1', matiz: 'de noche cerrada, con la niebla devolviendo el azul' },
      { id: 'v2', matiz: 'a primera hora, luz gris y la cinta floja' },
      { id: 'v3', matiz: 'contra un seto, con la cinta ya descolgada por un lado' },
    ],
  },
  {
    id: 'archivador', lugar: 'el archivo de expedientes', encuadre: 'plano general',
    luz: 'fluorescente parpadeante al fondo del pasillo',
    descripcion: 'Un pasillo estrecho entre estanterías metálicas cargadas de cajas, visto desde la entrada; polvo suspendido en el haz; el fondo se pierde en negro.',
    variantes: [
      { id: 'v1', matiz: 'con un tubo fundido y medio pasillo a oscuras' },
      { id: 'v2', matiz: 'desde el fondo, mirando hacia la puerta iluminada' },
      { id: 'v3', matiz: 'con cajas apiladas en el suelo estrechando el paso' },
    ],
  },
  {
    id: 'manos-expediente', lugar: 'la mesa del expediente', encuadre: 'detalle',
    luz: 'flexo de mesa desde un lado, el resto de la habitación en negro',
    descripcion: 'Unas manos pasando hojas de una carpeta abierta, vistas casi cenitalmente y en escorzo muy inclinado; el papel se ve pero no se lee.',
    variantes: [
      { id: 'v1', matiz: 'con un dedo deteniéndose en una línea' },
      { id: 'v2', matiz: 'con las manos separando dos carpetas a la vez' },
      { id: 'v3', matiz: 'con guantes de látex y una bolsa de pruebas al lado' },
    ],
  },
  {
    id: 'bosque-amanecer', lugar: 'el bosque al amanecer', encuadre: 'gran plano general',
    luz: 'primera luz gris azulada entre los troncos',
    descripcion: 'Troncos altos y niebla baja entre ellos, rodado a través de unas ramas en primer término que tapan medio cuadro; suelo cubierto de hojarasca húmeda.',
    variantes: [
      { id: 'v1', matiz: 'con la niebla espesa a media altura' },
      { id: 'v2', matiz: 'con el sol ya entrando en haces entre los troncos' },
      { id: 'v3', matiz: 'después de la lluvia, todo goteando y el suelo encharcado' },
    ],
  },
  {
    id: 'pasillo-juzgado', lugar: 'el pasillo del juzgado', encuadre: 'plano general',
    luz: 'ventanal lateral, luz dura y plana, suelo brillante',
    descripcion: 'Un pasillo largo con bancos de madera vacíos, visto desde una esquina y descentrado; una figura pequeña al fondo, de espaldas y desenfocada.',
    variantes: [
      { id: 'v1', matiz: 'completamente vacío, a primera hora' },
      { id: 'v2', matiz: 'con dos figuras esperando de pie, muy al fondo' },
      { id: 'v3', matiz: 'a contraluz, con el ventanal quemado y los bancos en silueta' },
    ],
  },
  {
    id: 'lapida', lugar: 'el cementerio', encuadre: 'plano medio',
    luz: 'tarde encapotada, sin sombras marcadas',
    descripcion: 'Una lápida modesta de piedra sin inscripción legible, vista en escorzo desde muy cerca del suelo; hierba y una maceta volcada en primer término, desenfocadas.',
    variantes: [
      { id: 'v1', matiz: 'con la hierba crecida tapando la base' },
      { id: 'v2', matiz: 'con flores recientes apoyadas y el suelo removido' },
      { id: 'v3', matiz: 'bajo lluvia fina, la piedra oscurecida por el agua' },
    ],
  },
  {
    id: 'laboratorio', lugar: 'el laboratorio forense', encuadre: 'detalle',
    luz: 'lámpara de trabajo blanca desde arriba, fondo oscuro',
    descripcion: 'Una bandeja de acero con instrumental y una bolsa de pruebas, vista muy de cerca y en diagonal; unas manos enguantadas entrando por el borde del cuadro.',
    variantes: [
      { id: 'v1', matiz: 'con unas pinzas levantando algo pequeño' },
      { id: 'v2', matiz: 'con la bandeja vacía salvo por una bolsa cerrada' },
      { id: 'v3', matiz: 'bajo luz ultravioleta, todo virado a azul' },
    ],
  },
  {
    id: 'comisaria-noche', lugar: 'la comisaría de noche', encuadre: 'plano general',
    luz: 'interiores encendidos vistos desde fuera, calle a oscuras',
    descripcion: 'La fachada de un edificio bajo con las ventanas iluminadas, rodada desde la acera de enfrente a través de la luna mojada de un coche.',
    variantes: [
      { id: 'v1', matiz: 'con lluvia en el cristal deformando las luces' },
      { id: 'v2', matiz: 'sin lluvia, con una sola ventana encendida' },
      { id: 'v3', matiz: 'al amanecer, con las luces todavía puestas y el cielo gris' },
    ],
  },
  {
    id: 'casa-precintada', lugar: 'la casa precintada', encuadre: 'plano general',
    luz: 'mediodía plano de invierno, cielo blanco',
    descripcion: 'La fachada de una casa de dos plantas con las persianas bajadas y una cinta cruzando la puerta, vista desde el otro lado de una valla que ocupa el primer término.',
    variantes: [
      { id: 'v1', matiz: 'con el jardín delantero descuidado y alto' },
      { id: 'v2', matiz: 'de noche, iluminada solo por una farola de la calle' },
      { id: 'v3', matiz: 'meses después, con la cinta rota y el buzón lleno' },
    ],
  },
  {
    id: 'sala-espera', lugar: 'la sala de espera', encuadre: 'plano general',
    luz: 'fluorescente frío, sin ventanas',
    descripcion: 'Sillas de plástico unidas en fila, vacías, vistas desde el rincón y muy descentradas; una máquina expendedora apagada al fondo, fuera de foco.',
    variantes: [
      { id: 'v1', matiz: 'completamente vacía, con un vaso olvidado en el suelo' },
      { id: 'v2', matiz: 'con un abrigo colgado del respaldo de una silla' },
      { id: 'v3', matiz: 'con media luz, como de noche o fuera de horario' },
    ],
  },
  {
    id: 'rio-turbio', lugar: 'la orilla del río', encuadre: 'plano general',
    luz: 'atardecer sin sol, agua gris',
    descripcion: 'Agua turbia moviéndose despacio contra un talud de barro, rodada desde muy cerca de la superficie; cañas desenfocadas cruzando el primer término.',
    variantes: [
      { id: 'v1', matiz: 'con el nivel bajo y el barro de la orilla agrietado' },
      { id: 'v2', matiz: 'crecido y rápido, arrastrando ramas' },
      { id: 'v3', matiz: 'con niebla en la superficie a primera hora' },
    ],
  },
  {
    id: 'nave-abandonada', lugar: 'la nave abandonada', encuadre: 'gran plano general',
    luz: 'huecos de claraboya rota, haces polvorientos sobre el suelo',
    descripcion: 'Una nave industrial vacía con el suelo cubierto de escombro, vista desde el interior de un portón; el marco del portón tapa los bordes del cuadro.',
    variantes: [
      { id: 'v1', matiz: 'con palomas levantando el vuelo al fondo' },
      { id: 'v2', matiz: 'con el suelo encharcado devolviendo la luz de las claraboyas' },
      { id: 'v3', matiz: 'casi a oscuras, con una sola franja de luz cruzando' },
    ],
  },
  {
    id: 'telefono-fijo', lugar: 'la mesa del teléfono', encuadre: 'detalle',
    luz: 'lámpara baja, alrededor en penumbra',
    descripcion: 'Un teléfono fijo antiguo sobre un mueble, con el cable colgando, visto muy de cerca y en escorzo; el resto de la habitación cae en negro.',
    variantes: [
      { id: 'v1', matiz: 'con el auricular descolgado sobre la mesa' },
      { id: 'v2', matiz: 'con una libreta abierta al lado y un bolígrafo encima' },
      { id: 'v3', matiz: 'con polvo acumulado, como si llevara años sin usarse' },
    ],
  },
  {
    id: 'ropa-tendida', lugar: 'un patio trasero', encuadre: 'plano medio',
    luz: 'viento y cielo cubierto, luz difusa',
    descripcion: 'Ropa tendida moviéndose en una cuerda, rodada a través de las propias telas que tapan parte del cuadro; al fondo, una pared con humedades.',
    variantes: [
      { id: 'v1', matiz: 'con viento fuerte que levanta las sábanas' },
      { id: 'v2', matiz: 'con la ropa empapada y goteando, sin viento' },
      { id: 'v3', matiz: 'con la cuerda medio vacía y dos pinzas sueltas' },
    ],
  },
  {
    id: 'coche-parado', lugar: 'un coche parado en el arcén', encuadre: 'plano general',
    luz: 'noche cerrada, intermitentes ámbar',
    descripcion: 'Un coche detenido con la puerta abierta y la luz interior encendida, visto desde lejos y desde abajo; hierba alta en primer término tapando las ruedas.',
    variantes: [
      { id: 'v1', matiz: 'con los intermitentes puestos y nadie alrededor' },
      { id: 'v2', matiz: 'de día, con el coche cubierto de polvo y las puertas cerradas' },
      { id: 'v3', matiz: 'bajo lluvia, con los faros aún encendidos' },
    ],
  },
  {
    id: 'cinta-casete', lugar: 'la grabadora del interrogatorio', encuadre: 'detalle',
    luz: 'una sola bombilla desnuda encima de la mesa',
    descripcion: 'Una grabadora de casete sobre una mesa metálica, con las bobinas girando, vista casi a ras de mesa y con el borde de la mesa desenfocado delante.',
    variantes: [
      { id: 'v1', matiz: 'con las bobinas girando y el piloto rojo encendido' },
      { id: 'v2', matiz: 'parada, con la cinta a medias y la tapa abierta' },
      { id: 'v3', matiz: 'con una mano entrando en el cuadro para pulsar una tecla' },
    ],
  },
  {
    id: 'escalera-sotano', lugar: 'la escalera del sótano', encuadre: 'plano general',
    luz: 'luz que baja desde arriba, el fondo en negro absoluto',
    descripcion: 'Unos peldaños de hormigón bajando hacia la oscuridad, vistos desde arriba y en diagonal; la barandilla oxidada cruza el primer término.',
    variantes: [
      { id: 'v1', matiz: 'con una bombilla encendida a media altura' },
      { id: 'v2', matiz: 'con el suelo del fondo encharcado y brillando apenas' },
      { id: 'v3', matiz: 'desde abajo, mirando hacia el rectángulo de luz de arriba' },
    ],
  },
  {
    id: 'mapa-chinchetas', lugar: 'el mapa de la investigación', encuadre: 'plano medio',
    luz: 'flexo lateral, papel amarillento',
    descripcion: 'Un mapa clavado en un corcho con chinchetas y cordel entre ellas, visto muy en escorzo desde un lado; ninguna palabra legible, solo el trazado.',
    variantes: [
      { id: 'v1', matiz: 'con pocas chinchetas, al principio de todo' },
      { id: 'v2', matiz: 'lleno de cordeles cruzados y papeles superpuestos' },
      { id: 'v3', matiz: 'con una mano clavando una chincheta nueva' },
    ],
  },
  {
    id: 'lluvia-ventana', lugar: 'una ventana con lluvia', encuadre: 'detalle',
    luz: 'gris de tarde, luces de calle desenfocadas detrás',
    descripcion: 'Gotas resbalando por un cristal, muy cerca y enfocadas, con la calle detrás convertida en manchas de luz.',
    variantes: [
      { id: 'v1', matiz: 'de noche, con las manchas de luz ámbar de las farolas' },
      { id: 'v2', matiz: 'de día, con el gris del cielo y ninguna luz encendida' },
      { id: 'v3', matiz: 'con vaho por dentro y un trazo hecho con el dedo' },
    ],
  },
];

export const recursoPorId = (id) => RECURSOS.find((r) => r.id === String(id || '').toLowerCase()) || null;

/** El plano completo de una versión de un recurso: el sitio más su matiz. */
export function planoDeRecurso(recurso, variante) {
  if (!recurso || !variante) return null;
  return {
    encuadre: recurso.encuadre,
    movimientoCamara: 'fijo',
    lugar: recurso.lugar,
    luz: recurso.luz,
    sujetos: [],
    descripcion: `${recurso.descripcion} ${variante.matiz}.`,
  };
}
