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
// ─────────────────────────────────────────────────────────────────────────────
// Y VARIAR LA CARA NO ES VARIAR EL PLANO. ESTO SE APRENDIÓ MIRÁNDOLO.
//
// «La intención de tener varias versiones es que VARÍE. Ahí no se nota que varía:
//  se ve como si la persona hubiese tomado una foto desde arriba y otra desde
//  abajo, y ya. Debería ser otra carretera, otro ángulo. ¿O me vas a poner los
//  testigos siempre en el mismo cuarto? ¿El policía siempre en el mismo
//  escenario?»
//
// Tenía razón, y el fallo estaba en la estructura, no en el texto: el sitio, el
// encuadre y la luz vivían en el PAPEL y solo la persona vivía en la variante. Por
// construcción, los cinco peritos compartían laboratorio y los veinte testigos
// compartían cocina. Cambiar las descripciones no lo habría arreglado: mientras
// `planoDeVariante` leyera el sitio del papel, todas las versiones eran el mismo
// plano con otra cara.
//
// Ahora cada papel tiene SUS SITIOS —los rincones de su mundo— y cada persona se
// rueda en uno, con su encuadre y su luz. El perito sigue siendo un perito y el
// canal se sigue reconociendo, pero uno declara tras el vidrio del laboratorio y
// otro de pie en el pasillo del depósito. Lo mismo los recursos: las tres
// versiones de la carretera no son la misma carretera con niebla, son otro tramo,
// otro ángulo y otra altura de cámara.
//
// CÓMO ESTÁ MONTADO, y por qué así:
//
//   · El elenco es DEL CANAL, no de un género. Un perito forense es el mismo
//     papel en un crimen frío que en un terror real, y tenerlo declarado dos
//     veces sería pagarlo dos veces y tener dos peritos donde hay uno. Cada
//     género dice qué papeles usa, por su clave.
//
//   · `plano` es el papel EN GENERAL —lo que lee el director para saber que un
//     perito declara en un laboratorio— y `sitios` son los rincones concretos
//     donde se rueda. Cada variante apunta a uno con `sitio`.
//
//   · La PERSONA es de la variante. Así los cinco peritos son cinco personas en
//     cinco sitios distintos del mismo mundo.
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

/**
 * Cuántos SITIOS distintos tiene que tener un papel como mínimo.
 *
 * Tres. Con uno, las cinco personas del papel salen en el mismo cuarto y la
 * variedad es solo de cara; con dos, alternan y se nota igual. Y a un papel de
 * veinte personas no le bastan tres: la regla de abajo pide uno por cada dos
 * personas hasta ese tope, que es lo que hace que los veinte testigos no vivan
 * todos en la misma cocina.
 */
export const SITIOS_MINIMOS = 3;

// ── El reparto ────────────────────────────────────────────────────────────────
//
// `plano` es el papel; `sitios` son los rincones donde se rueda; `variantes[]` es
// quién lo hace y en cuál. La descripción final que ve el generador de imágenes es
// la suma de la persona y su sitio.

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
    sitios: [
      {
        encuadre: 'plano medio',
        lugar: 'el laboratorio forense',
        luz: 'fluorescente fría de techo, mesa de acero devolviendo la luz',
        descripcion:
          'Sentada frente a una mesa de acero, con bata sobre ropa de calle, hablando ' +
          'hacia un lado de la cámara. Se la ve a través del marco de una puerta de ' +
          'vidrio esmerilado que ocupa el primer término y la deja descentrada.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'la sala de autopsias vacía',
        luz: 'azulejo blanco hasta el techo, lámpara cenital apagada, un ventanuco alto como única luz',
        descripcion:
          'De pie junto a una camilla de acero vacía, con bata y las manos apoyadas en ' +
          'el borde, hablando hacia un lado de la cámara. Rodado desde el otro extremo ' +
          'de la camilla, que cruza el primer término desenfocada.',
      },
      {
        encuadre: 'plano americano',
        lugar: 'el pasillo del depósito',
        luz: 'tubos fluorescentes cada varios metros, verde en los azulejos, el fondo perdiéndose',
        descripcion:
          'Apoyada de espaldas contra la pared del pasillo, con la bata desabrochada, ' +
          'hablando hacia un lado de la cámara. Muy descentrada, con el pasillo largo ' +
          'abriéndose detrás de ella.',
      },
      {
        encuadre: 'primer plano',
        lugar: 'el despacho del perito, con cajas de muestras etiquetadas',
        luz: 'flexo desde abajo y un monitor apagado al lado devolviendo el gris',
        descripcion:
          'Sentado tras una pila de cajas archivadoras que tapa la esquina inferior del ' +
          'cuadro, hablando hacia un lado de la cámara. Las etiquetas no se leen.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'la sala de microscopios',
        luz: 'persiana bajada rayando la pared y una pantalla encendida en azul',
        descripcion:
          'Sentada de perfil ante un microscopio, girada hacia un lado de la cámara para ' +
          'hablar. El ocular ocupa el primer término, muy cerca y fuera de foco.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'una mujer de unos cincuenta, pelo gris muy corto, gafas de montura fina' },
      { id: 'v2', sitio: 1, persona: 'un hombre de unos cuarenta, barba recortada, calvo, camisa azul bajo la bata' },
      { id: 'v3', sitio: 2, persona: 'una mujer de unos treinta y cinco, pelo negro recogido en moño, sin gafas' },
      { id: 'v4', sitio: 3, persona: 'un hombre de unos sesenta, pelo blanco peinado atrás, corbata bajo la bata' },
      { id: 'v5', sitio: 4, persona: 'una mujer de unos cuarenta y cinco, pelirroja, coleta baja, pendientes pequeños' },
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
    sitios: [
      {
        encuadre: 'plano medio',
        lugar: 'una sala de reuniones de comisaría',
        luz: 'fluorescente de techo, ventana alta al fondo con persiana medio bajada',
        descripcion:
          'Sentado a una mesa larga vacía, de uniforme, hablando hacia un lado de la ' +
          'cámara. En primer término y desenfocada, la esquina del respaldo de una silla.',
      },
      {
        encuadre: 'plano americano',
        lugar: 'el aparcamiento trasero de la comisaría',
        luz: 'sol bajo de tarde entrando de lado, sombras largas sobre el asfalto',
        descripcion:
          'De pie junto al lateral de un coche patrulla, de uniforme y sin gorra, ' +
          'hablando hacia un lado de la cámara. El retrovisor del coche entra en el ' +
          'primer término, muy cerca y fuera de foco.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'la sala de radio, de noche',
        luz: 'monitores y pilotos de los equipos como única luz, media cara en sombra',
        descripcion:
          'Sentada de lado ante la mesa de equipos, con los cascos colgados al cuello, ' +
          'hablando hacia un lado de la cámara. Un monitor desenfocado ocupa una esquina.',
      },
      {
        encuadre: 'primer plano',
        lugar: 'el pasillo de taquillas de la comisaría',
        luz: 'fluorescente de techo, metal gris devolviendo la luz',
        descripcion:
          'De pie con la camisa del uniforme por fuera, hablando hacia un lado de la ' +
          'cámara. La puerta abierta de una taquilla tapa un lado entero del cuadro.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'la entrada de la comisaría vista desde la calle',
        luz: 'farola y la luz de la puerta, la calle detrás a oscuras',
        descripcion:
          'De pie contra el muro junto a la puerta, de uniforme, hablando hacia un lado ' +
          'de la cámara. Una jardinera de hormigón desenfocada en primer término.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'una mujer de unos cuarenta, pelo castaño recogido, mandíbula marcada' },
      { id: 'v2', sitio: 1, persona: 'un hombre de unos cincuenta y cinco, corpulento, bigote cano' },
      { id: 'v3', sitio: 2, persona: 'un hombre de unos treinta, delgado, rapado, cuello tatuado apenas visible' },
      { id: 'v4', sitio: 3, persona: 'una mujer de unos sesenta, pelo corto blanco, gafas de leer colgando' },
      { id: 'v5', sitio: 4, persona: 'un hombre de unos cuarenta y cinco, piel morena, cicatriz fina en la ceja' },
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
    sitios: [
      {
        encuadre: 'plano medio',
        lugar: 'el despacho del detective',
        luz: 'persiana veneciana con sol bajo, franjas sobre la pared, el resto en penumbra',
        descripcion:
          'Sentado de lado en una silla de oficina vieja, con camisa arremangada, ' +
          'hablando hacia un lado de la cámara. Rodado por encima del hombro de otra ' +
          'persona, desenfocada en primer término.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'la cocina de su casa',
        luz: 'luz de mañana por una ventana pequeña, el resto de la cocina apagado',
        descripcion:
          'Sentada a la mesa de la cocina entre carpetas amontonadas y una taza, ' +
          'hablando hacia un lado de la cámara. Rodada desde el otro lado de la mesa, ' +
          'con las carpetas cruzando el borde inferior del cuadro.',
      },
      {
        encuadre: 'plano americano',
        lugar: 'un bar vacío a media mañana',
        luz: 'la puerta abierta a la calle como única luz, el interior en penumbra',
        descripcion:
          'De pie apoyado en la barra, con chaqueta, hablando hacia un lado de la ' +
          'cámara. Un taburete desenfocado ocupa el primer término.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'el garaje convertido en archivo',
        luz: 'un tubo fluorescente y el portón entreabierto dejando entrar una franja de día',
        descripcion:
          'Sentada en una silla plegable entre cajas apiladas hasta el techo, hablando ' +
          'hacia un lado de la cámara. Las cajas cierran el cuadro por los dos lados.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'un banco de parque en invierno',
        luz: 'luz plana de cielo cubierto, sin sombras',
        descripcion:
          'Sentado con abrigo y las manos en los bolsillos, hablando hacia un lado de la ' +
          'cámara. Una rama sin hojas cruza el cuadro por delante, desenfocada.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'un hombre de unos sesenta y cinco, pelo blanco ralo, papada, tirantes' },
      { id: 'v2', sitio: 1, persona: 'una mujer de unos cincuenta y cinco, pelo gris a los hombros, sin maquillaje' },
      { id: 'v3', sitio: 2, persona: 'un hombre de unos cincuenta, moreno, entradas pronunciadas, reloj grande' },
      { id: 'v4', sitio: 3, persona: 'una mujer de unos sesenta, muy delgada, pelo teñido de rubio ceniza' },
      { id: 'v5', sitio: 4, persona: 'un hombre de unos setenta, jubilado, jersey de pico, manos con manchas de edad' },
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
    sitios: [
      {
        encuadre: 'plano medio',
        lugar: 'un pasillo de hospital comarcal',
        luz: 'fluorescente frío, suelo brillante que devuelve la luz',
        descripcion:
          'De pie contra la pared del pasillo, con bata blanca sobre el pijama de ' +
          'quirófano, hablando hacia un lado de la cámara. Una camilla desenfocada ' +
          'cruza el primer término.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'la consulta',
        luz: 'persiana a medias y un flexo encendido sobre la mesa',
        descripcion:
          'Sentada tras la mesa de la consulta, con bata, hablando hacia un lado de la ' +
          'cámara. La camilla del fondo aparece desenfocada tras ella.',
      },
      {
        encuadre: 'plano americano',
        lugar: 'la sala de espera de urgencias, de noche',
        luz: 'fluorescente y la calle negra tras el cristal de la entrada',
        descripcion:
          'De pie entre filas de sillas vacías, con el pijama de quirófano, hablando ' +
          'hacia un lado de la cámara. Un respaldo de silla cruza el primer término.',
      },
      {
        encuadre: 'primer plano',
        lugar: 'la escalera de servicio del hospital',
        luz: 'un ventanuco arriba dejando caer la luz en vertical, el resto en sombra',
        descripcion:
          'Sentado en un escalón con las manos entre las rodillas, hablando hacia un ' +
          'lado de la cámara. La barandilla cruza el cuadro por delante, desenfocada.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'el office del control de enfermería',
        luz: 'flexo cálido sobre el mostrador, el pasillo detrás a oscuras',
        descripcion:
          'De pie tras el mostrador con carpetas y estantes detrás, hablando hacia un ' +
          'lado de la cámara. El borde del mostrador ocupa el primer término.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'un hombre de unos cincuenta, gafas cuadradas, pelo canoso muy corto' },
      { id: 'v2', sitio: 1, persona: 'una mujer de unos treinta y cinco, pelo oscuro recogido, ojeras marcadas' },
      { id: 'v3', sitio: 2, persona: 'una mujer de unos sesenta, pelo corto blanco, collar sencillo' },
      { id: 'v4', sitio: 3, persona: 'un hombre de unos cuarenta, piel oscura, barba corta, fonendo al cuello' },
      { id: 'v5', sitio: 4, persona: 'un hombre de unos sesenta y cinco, alto, encorvado, gafas de media luna' },
    ],
  },
  {
    id: 'testigo',
    nombre: 'testigo',
    plano: {
      encuadre: 'plano medio',
      lugar: 'la casa de un testigo',
      luz: 'luz de ventana, sin lámparas encendidas',
      descripcion:
        'Sentado con las manos juntas, con ropa de calle corriente, hablando hacia un ' +
        'lado de la cámara, con algo del sitio tapando parte del cuadro.',
    },
    // VEINTE PERSONAS Y VEINTE SITIOS. Es el papel que más entra —cada dos o tres
    // minutos habla alguien— y el que más canta si se repite. Con un solo sitio
    // eran veinte vecinos en la misma cocina, que es peor que veinte vecinos
    // iguales: la cara cambia y el cuarto no, así que lo que se ve es el decorado.
    sitios: [
      {
        encuadre: 'plano medio',
        lugar: 'la cocina de una casa de pueblo',
        luz: 'ventana lateral de mañana gris, sin lámparas encendidas',
        descripcion:
          'Sentado a la mesa de la cocina con las manos juntas, hablando hacia un lado ' +
          'de la cámara. Se ve a través del vano de la puerta, con la jamba tapando ' +
          'parte del cuadro.',
      },
      {
        encuadre: 'plano americano',
        lugar: 'el portal de un bloque de pisos',
        luz: 'luz amarilla de temporizador, la puerta de cristal a la calle detrás',
        descripcion:
          'De pie junto a los buzones metálicos, hablando hacia un lado de la cámara. ' +
          'El canto de la puerta abierta ocupa el borde del cuadro.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'un patio trasero con ropa tendida',
        luz: 'cielo cubierto, luz difusa sin sombras',
        descripcion:
          'De pie entre las cuerdas, hablando hacia un lado de la cámara. Una sábana ' +
          'movida por el viento cruza el primer término y tapa media imagen.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'la trastienda de un ultramarinos',
        luz: 'una bombilla desnuda, estanterías de cajas alrededor',
        descripcion:
          'Sentada en una banqueta entre cajas de mercancía, hablando hacia un lado de ' +
          'la cámara. Una pila de cajas tapa una esquina del cuadro.',
      },
      {
        encuadre: 'plano general corto',
        lugar: 'un banco de la plaza del pueblo',
        luz: 'sol bajo de tarde, sombras largas en el suelo',
        descripcion:
          'Sentado con las manos apoyadas en un bastón, hablando hacia un lado de la ' +
          'cámara. La fuente de la plaza queda desenfocada detrás.',
      },
      {
        encuadre: 'primer plano',
        lugar: 'un salón con la televisión apagada',
        luz: 'una ventana lateral, la pantalla negra devolviendo el gris',
        descripcion:
          'Sentada en el sofá, hablando hacia un lado de la cámara. El respaldo de una ' +
          'butaca cruza el primer término, muy cerca y fuera de foco.',
      },
      {
        encuadre: 'plano americano',
        lugar: 'la puerta de un taller',
        luz: 'contraluz del portón abierto, el interior en penumbra',
        descripcion:
          'De pie con el mono de trabajo puesto, limpiándose las manos con un trapo, ' +
          'hablando hacia un lado de la cámara. El marco del portón encuadra la figura.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'el rellano de una escalera',
        luz: 'luz de temporizador, los tramos de arriba y abajo en sombra',
        descripcion:
          'De pie junto a la barandilla, hablando hacia un lado de la cámara. El hueco ' +
          'de la escalera se abre detrás, perdiéndose en negro.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'la barra de un bar de carretera',
        luz: 'fluorescente sobre las botellas, la sala detrás apagada',
        descripcion:
          'Sentado de perfil en un taburete, con el codo en la barra, hablando hacia un ' +
          'lado de la cámara. El canto de la barra cruza el borde inferior del cuadro.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'el porche de una casa al atardecer',
        luz: 'luz naranja rasante entrando de lado',
        descripcion:
          'Sentada en una silla de enea, hablando hacia un lado de la cámara. La ' +
          'barandilla del porche cruza el primer término, desenfocada.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'un garaje con el coche dentro',
        luz: 'un tubo fluorescente parpadeante, esquinas en sombra',
        descripcion:
          'De pie junto al capó abierto de un coche, hablando hacia un lado de la ' +
          'cámara. El capó levantado tapa un lado del cuadro.',
      },
      {
        encuadre: 'plano americano',
        lugar: 'la escalera de entrada de un chalet',
        luz: 'mediodía plano de invierno, cielo blanco',
        descripcion:
          'De pie en los peldaños con las manos en los bolsillos, hablando hacia un lado ' +
          'de la cámara. Un seto desenfocado ocupa el borde del cuadro.',
      },
      {
        encuadre: 'primer plano',
        lugar: 'la cocina de un piso pequeño',
        luz: 'fluorescente bajo los armarios, el resto de la casa a oscuras',
        descripcion:
          'De pie apoyada en la encimera, hablando hacia un lado de la cámara. Un armario ' +
          'abierto tapa parte del cuadro por arriba.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'el descansillo de un almacén',
        luz: 'ventanal industrial de luz gris, polvo suspendido',
        descripcion:
          'Sentado en un palé apilado, hablando hacia un lado de la cámara. Una columna ' +
          'metálica cruza el cuadro por delante.',
      },
      {
        encuadre: 'primer plano',
        lugar: 'una habitación con la persiana a medias',
        luz: 'franjas de luz de la persiana cruzando la pared del fondo',
        descripcion:
          'Sentada en el borde de la cama, hablando hacia un lado de la cámara. El pie ' +
          'de la cama ocupa el primer término, desenfocado.',
      },
      {
        encuadre: 'plano general corto',
        lugar: 'la puerta de una nave agrícola',
        luz: 'sol de mediodía duro fuera, sombra profunda bajo el alero',
        descripcion:
          'De pie a la sombra del alero, con la explanada quemada de luz detrás, hablando ' +
          'hacia un lado de la cámara.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'un pasillo de casa con fotos colgadas',
        luz: 'la luz llega del fondo, el primer término casi negro',
        descripcion:
          'De pie de perfil junto a los marcos colgados, sin mirarlos, hablando hacia un ' +
          'lado de la cámara. El marco de una puerta tapa un lado del cuadro.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'el comedor de una casa con el mantel puesto',
        luz: 'lámpara de techo baja sobre la mesa, las esquinas en penumbra',
        descripcion:
          'Sentado con las manos sobre el mantel, hablando hacia un lado de la cámara. ' +
          'Una silla vacía en primer término, desenfocada.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'el mostrador de una tienda pequeña',
        luz: 'escaparate a contraluz por detrás, interior más oscuro',
        descripcion:
          'De pie tras el mostrador, hablando hacia un lado de la cámara. Una balanza ' +
          'antigua ocupa el primer término, muy cerca.',
      },
      {
        encuadre: 'plano general corto',
        lugar: 'un camino de tierra junto a unas casas',
        luz: 'tarde encapotada, luz plana',
        descripcion:
          'De pie en el borde del camino con las manos cruzadas, hablando hacia un lado ' +
          'de la cámara. El camino se pierde detrás, muy descentrado.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'un hombre de unos sesenta, con gorra de tela y chaqueta de faena' },
      { id: 'v2', sitio: 1, persona: 'una mujer de unos setenta, bata de casa, pelo corto rizado' },
      { id: 'v3', sitio: 2, persona: 'un hombre de unos treinta, sudadera, barba descuidada' },
      { id: 'v4', sitio: 3, persona: 'una mujer de unos cuarenta, jersey de punto, pelo liso a los hombros' },
      { id: 'v5', sitio: 4, persona: 'un hombre de unos cincuenta, camisa de cuadros, manos grandes y agrietadas' },
      { id: 'v6', sitio: 5, persona: 'una mujer de unos veinticinco, pelo teñido, aro en la nariz' },
      { id: 'v7', sitio: 6, persona: 'un hombre de unos setenta y cinco, boina, bastón apoyado en la silla' },
      { id: 'v8', sitio: 7, persona: 'una mujer de unos cincuenta y cinco, delantal, gafas colgadas del cuello' },
      { id: 'v9', sitio: 8, persona: 'un hombre de unos cuarenta y cinco, polo de trabajo, gorra en la mesa' },
      { id: 'v10', sitio: 9, persona: 'una mujer de unos treinta y cinco, coleta alta, sudadera con cremallera' },
      { id: 'v11', sitio: 10, persona: 'un hombre de unos veinte, muy delgado, pelo largo recogido' },
      { id: 'v12', sitio: 11, persona: 'una mujer de unos sesenta y cinco, pelo blanco cardado, broche en la chaqueta' },
      { id: 'v13', sitio: 12, persona: 'un hombre de unos cincuenta y cinco, piel morena, camisa blanca remangada' },
      { id: 'v14', sitio: 13, persona: 'una mujer de unos cuarenta y cinco, mono de trabajo, uñas cortas' },
      { id: 'v15', sitio: 14, persona: 'un hombre de unos treinta y cinco, gafas, jersey de cuello alto' },
      { id: 'v16', sitio: 15, persona: 'una mujer de unos ochenta, muy menuda, rebeca abotonada hasta arriba' },
      { id: 'v17', sitio: 16, persona: 'un hombre de unos sesenta y cinco, calvo, gafas de sol en la cabeza' },
      { id: 'v18', sitio: 17, persona: 'una mujer de unos veintiocho, pelo corto oscuro, camiseta lisa' },
      { id: 'v19', sitio: 18, persona: 'un hombre de unos cuarenta, barba poblada, chaleco acolchado' },
      { id: 'v20', sitio: 19, persona: 'una mujer de unos cincuenta, pelo recogido con pinza, camisa vaquera' },
    ],
  },
  {
    id: 'familiar',
    nombre: 'familiar de la víctima',
    plano: {
      encuadre: 'primer plano',
      lugar: 'la casa de la familia',
      luz: 'lámpara cálida a un lado, el resto de la habitación en negro',
      descripcion:
        'Sentado con las manos en el regazo, hablando hacia un lado de la cámara, con ' +
        'algo de la casa desenfocado en primer término.',
    },
    sitios: [
      {
        encuadre: 'primer plano',
        lugar: 'el salón de una casa con muebles viejos',
        luz: 'lámpara de pie cálida a un lado, el resto de la habitación en negro',
        descripcion:
          'Sentado en un sillón, con las manos en el regazo, hablando hacia un lado de ' +
          'la cámara. Un marco de fotos desenfocado en primer término, a un lado del cuadro.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'un dormitorio que nadie ha tocado',
        luz: 'luz de tarde entrando por la ventana, motas de polvo en el aire',
        descripcion:
          'Sentada al borde de una cama hecha, hablando hacia un lado de la cámara. El ' +
          'quicio de la puerta tapa un lado entero del cuadro.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'el comedor con el mantel puesto',
        luz: 'lámpara de techo baja, las esquinas en penumbra',
        descripcion:
          'Sentado con las manos juntas sobre el mantel, hablando hacia un lado de la ' +
          'cámara. Un plato vacío en primer término, desenfocado.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'el pasillo con fotografías colgadas',
        luz: 'la luz llega del fondo del pasillo, el primer término casi negro',
        descripcion:
          'De pie de perfil junto a los marcos, sin mirarlos, hablando hacia un lado de ' +
          'la cámara. Los marcos quedan desenfocados detrás.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'el banco del jardín de la casa',
        luz: 'cielo cubierto, luz plana sin sombras',
        descripcion:
          'Sentada con una rebeca sobre los hombros, hablando hacia un lado de la ' +
          'cámara. Unas ramas cruzan el cuadro por delante, fuera de foco.',
      },
      {
        encuadre: 'primer plano',
        lugar: 'la cocina de la casa',
        luz: 'ventana lateral de mañana, sin lámparas',
        descripcion:
          'De pie apoyada en la encimera con un paño en la mano, hablando hacia un lado ' +
          'de la cámara. El canto de un armario tapa un borde del cuadro.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'una mujer mayor de unos setenta y cinco, pelo blanco, rebeca gris' },
      { id: 'v2', sitio: 1, persona: 'un hombre de unos cincuenta, hermano, jersey oscuro, ojos enrojecidos' },
      { id: 'v3', sitio: 2, persona: 'una mujer de unos cuarenta, hija, pelo recogido, camisa lisa' },
      { id: 'v4', sitio: 3, persona: 'un hombre de unos ochenta, padre, muy delgado, camisa abotonada' },
      { id: 'v5', sitio: 4, persona: 'una mujer de unos treinta, sobrina, sudadera, mira poco a cámara' },
      { id: 'v6', sitio: 5, persona: 'un hombre de unos sesenta, viudo, chaqueta de punto, alianza en la mano' },
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
    sitios: [
      {
        encuadre: 'plano medio',
        lugar: 'una redacción medio vacía',
        luz: 'pantallas encendidas y una ventana lejana al fondo',
        descripcion:
          'De pie junto a una mesa con papeles, hablando hacia un lado de la cámara. ' +
          'Rodado por encima del hombro de otra persona, desenfocada.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'la hemeroteca del periódico',
        luz: 'fluorescente frío entre estanterías de tomos encuadernados',
        descripcion:
          'De pie ante un mueble de planeros con un cajón abierto, hablando hacia un ' +
          'lado de la cámara. Un lomo de tomo desenfocado ocupa el primer término.',
      },
      {
        encuadre: 'plano americano',
        lugar: 'la calle frente al edificio del periódico',
        luz: 'tarde nublada, luz plana',
        descripcion:
          'De pie en la acera, hablando hacia un lado de la cámara. Coches desenfocados ' +
          'cruzan el primer término y lo tapan a ratos.',
      },
      {
        encuadre: 'primer plano',
        lugar: 'su mesa en casa, de noche',
        luz: 'la pantalla y un flexo como única luz, el resto de la habitación negro',
        descripcion:
          'Sentado con papeles alrededor, hablando hacia un lado de la cámara. Una pila ' +
          'de recortes en primer término, fuera de foco.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'una mujer de unos cuarenta, gafas grandes, pelo corto oscuro' },
      { id: 'v2', sitio: 1, persona: 'un hombre de unos cincuenta y cinco, camisa sin corbata, canas en las sienes' },
      { id: 'v3', sitio: 2, persona: 'un hombre de unos treinta, delgado, jersey fino, libreta en la mano' },
      { id: 'v4', sitio: 3, persona: 'una mujer de unos sesenta, pelo blanco liso, chaqueta de tweed' },
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
    sitios: [
      {
        encuadre: 'plano medio',
        lugar: 'un despacho con estanterías de tomos',
        luz: 'ventana lateral grande, contraluz suave',
        descripcion:
          'Sentado tras una mesa despejada, trajeado, hablando hacia un lado de la ' +
          'cámara. Una estantería desenfocada en primer término, a un lado.',
      },
      {
        encuadre: 'plano americano',
        lugar: 'la escalinata del juzgado',
        luz: 'mediodía duro, sombras cortas y marcadas',
        descripcion:
          'De pie en los peldaños con una carpeta bajo el brazo, hablando hacia un lado ' +
          'de la cámara. Una columna de piedra tapa un lado del cuadro.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'una sala de reuniones acristalada',
        luz: 'ventanal de luz plana, reflejos del cristal cruzando el cuadro',
        descripcion:
          'Sentada a una mesa larga vacía, vista A TRAVÉS del cristal de la sala, ' +
          'hablando hacia un lado de la cámara. El reflejo del pasillo se superpone.',
      },
      {
        encuadre: 'primer plano',
        lugar: 'el pasillo entre archivadores',
        luz: 'fluorescente frío, metal gris a los dos lados',
        descripcion:
          'De pie con un archivador abierto que tapa un lado del cuadro, hablando hacia ' +
          'un lado de la cámara.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'un hombre de unos cincuenta, traje gris, gafas de pasta' },
      { id: 'v2', sitio: 1, persona: 'una mujer de unos cuarenta y cinco, traje oscuro, pelo liso hasta el hombro' },
      { id: 'v3', sitio: 2, persona: 'un hombre de unos sesenta y cinco, pajarita, pelo blanco abundante' },
      { id: 'v4', sitio: 3, persona: 'una mujer de unos treinta y cinco, blusa clara, moño bajo' },
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
    sitios: [
      {
        encuadre: 'plano medio',
        lugar: 'una sala de vistas vacía',
        luz: 'ventanal alto, luz dura y plana',
        descripcion:
          'De pie junto a un estrado vacío, trajeado, hablando hacia un lado de la ' +
          'cámara. El respaldo de un banco de madera cruza el primer término.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'el despacho con la toga colgada detrás',
        luz: 'ventana lateral y una lámpara de mesa encendida',
        descripcion:
          'Sentada tras la mesa, hablando hacia un lado de la cámara. La toga colgada de ' +
          'una percha queda desenfocada al fondo.',
      },
      {
        encuadre: 'plano americano',
        lugar: 'el pasillo de los juzgados con bancos',
        luz: 'ventanal alto a contraluz, los bancos casi en silueta',
        descripcion:
          'De pie de perfil junto a un banco vacío, hablando hacia un lado de la cámara. ' +
          'El respaldo del banco ocupa el borde inferior del cuadro.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'un hombre de unos cincuenta y cinco, traje azul marino, entradas' },
      { id: 'v2', sitio: 1, persona: 'una mujer de unos cincuenta, pelo gris corto, gafas sin montura' },
      { id: 'v3', sitio: 2, persona: 'un hombre de unos cuarenta, moreno, barba de tres días' },
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
    sitios: [
      {
        encuadre: 'plano medio',
        lugar: 'el puesto de mando de la batida',
        luz: 'mañana gris bajo una carpa, luz plana',
        descripcion:
          'De pie junto a una mesa plegable con mapas, con chaleco reflectante, ' +
          'hablando hacia un lado de la cámara. Rodado a través de la lona de la carpa, ' +
          'que tapa una esquina del cuadro.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'el maletero abierto de un todoterreno',
        luz: 'mañana con niebla, todo desaturado',
        descripcion:
          'De pie extendiendo un mapa sobre el portón abierto del maletero, hablando ' +
          'hacia un lado de la cámara. El portón levantado tapa la parte alta del cuadro.',
      },
      {
        encuadre: 'plano general corto',
        lugar: 'un camino forestal al amanecer',
        luz: 'primera luz gris, aliento visible en el aire',
        descripcion:
          'De pie en el camino con el chaleco reflectante, hablando hacia un lado de la ' +
          'cámara. Figuras desenfocadas en fila se pierden al fondo.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'un hombre de unos cuarenta y cinco, barba corta, gorro de lana' },
      { id: 'v2', sitio: 1, persona: 'una mujer de unos treinta y ocho, coleta, walkie en la mano' },
      { id: 'v3', sitio: 2, persona: 'un hombre de unos sesenta, curtido, gafas de sol en la frente' },
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
    sitios: [
      {
        encuadre: 'plano medio',
        lugar: 'la nave del equipo de montaña',
        luz: 'portón abierto al fondo, interior en penumbra',
        descripcion:
          'De pie junto a material colgado en la pared, con forro polar, hablando ' +
          'hacia un lado de la cámara. Cuerdas colgadas desenfocadas en primer término.',
      },
      {
        encuadre: 'plano americano',
        lugar: 'la pista junto al helicóptero parado',
        luz: 'cielo cubierto, luz plana y fría',
        descripcion:
          'De pie con el casco bajo el brazo, hablando hacia un lado de la cámara. La ' +
          'cola del aparato queda desenfocada detrás, ocupando medio fondo.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'la sala de mapas del refugio',
        luz: 'lámpara cálida y una ventana pequeña con nieve fuera',
        descripcion:
          'Sentado ante un mapa clavado en la pared, girado hacia un lado de la cámara. ' +
          'El respaldo de una silla cruza el primer término.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'una mujer de unos cuarenta, pelo corto, piel curtida por el sol' },
      { id: 'v2', sitio: 1, persona: 'un hombre de unos cincuenta, barba espesa, gorro polar' },
      { id: 'v3', sitio: 2, persona: 'un hombre de unos treinta y cinco, atlético, tatuaje en el antebrazo' },
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
    sitios: [
      {
        encuadre: 'plano medio',
        lugar: 'una sala de descanso con taquillas',
        luz: 'fluorescente frío, sin ventanas',
        descripcion:
          'Sentado en un banco junto a unas taquillas metálicas, con uniforme sanitario, ' +
          'hablando hacia un lado de la cámara. El borde de una taquilla abierta tapa ' +
          'parte del cuadro.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'el control de enfermería, de noche',
        luz: 'monitores y un flexo bajo, el pasillo detrás completamente negro',
        descripcion:
          'De pie tras el mostrador del control, con uniforme, hablando hacia un lado de ' +
          'la cámara. El canto del mostrador ocupa el borde inferior del cuadro.',
      },
      {
        encuadre: 'plano americano',
        lugar: 'la lavandería con carros de ropa',
        luz: 'fluorescente y vapor en el aire suavizándolo todo',
        descripcion:
          'De pie entre dos carros de ropa que tapan los bordes del cuadro, hablando ' +
          'hacia un lado de la cámara.',
      },
      {
        encuadre: 'primer plano',
        lugar: 'la puerta de servicio, fuera del edificio',
        luz: 'una lámpara sobre la puerta, la noche detrás',
        descripcion:
          'Apoyada en el quicio con una rebeca sobre el uniforme, hablando hacia un lado ' +
          'de la cámara. El marco de la puerta encuadra la figura por un lado.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'una mujer de unos cincuenta y cinco, pelo teñido, gafas colgando' },
      { id: 'v2', sitio: 1, persona: 'un hombre de unos cuarenta, calvo, brazos gruesos' },
      { id: 'v3', sitio: 2, persona: 'una mujer de unos sesenta y cinco, jubilada, rebeca sobre el uniforme' },
      { id: 'v4', sitio: 3, persona: 'una mujer de unos treinta, trenza, mira poco a cámara' },
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
    sitios: [
      {
        encuadre: 'primer plano',
        lugar: 'el salón de un piso pequeño',
        luz: 'lámpara de mesa cálida, resto en penumbra',
        descripcion:
          'Sentado en el borde de un sofá, con las manos entrelazadas, hablando hacia ' +
          'un lado de la cámara. Un visillo desenfocado cruza el primer término.',
      },
      {
        encuadre: 'primer plano',
        lugar: 'la ventana de una habitación con visillo',
        luz: 'luz de día filtrada por la tela, muy suave',
        descripcion:
          'Sentada de perfil junto al cristal, hablando hacia un lado de la cámara. El ' +
          'visillo ocupa medio cuadro, delante y fuera de foco.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'la mesa de una cafetería vacía',
        luz: 'ventanal lateral, mesas de formica devolviendo la luz',
        descripcion:
          'Sentado con una taza delante, hablando hacia un lado de la cámara. La taza y ' +
          'el borde de la mesa quedan enormes y desenfocados en primer término.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'un banco frente a un edificio antiguo',
        luz: 'tarde encapotada, luz plana',
        descripcion:
          'Sentada con las manos en el regazo, hablando hacia un lado de la cámara. La ' +
          'fachada del edificio queda desenfocada detrás, ocupando todo el fondo.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'un hombre de unos sesenta, delgado, camisa abotonada hasta arriba' },
      { id: 'v2', sitio: 1, persona: 'una mujer de unos cincuenta y cinco, pelo corto gris, manos inquietas' },
      { id: 'v3', sitio: 2, persona: 'un hombre de unos setenta, barba blanca, mirada baja' },
      { id: 'v4', sitio: 3, persona: 'una mujer de unos cuarenta y cinco, pelo largo liso, jersey ancho' },
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
    sitios: [
      {
        encuadre: 'primer plano',
        lugar: 'una habitación alquilada con poca cosa',
        luz: 'ventana lateral de tarde, sin cortinas',
        descripcion:
          'Sentado al borde de una cama, con las manos en el regazo, hablando hacia un ' +
          'lado de la cámara. El marco de la puerta ocupa el primer término.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'una cocina compartida',
        luz: 'fluorescente y armarios de melamina clara devolviendo la luz',
        descripcion:
          'De pie apoyado en la encimera, hablando hacia un lado de la cámara. Un ' +
          'escurreplatos lleno ocupa el primer término, desenfocado.',
      },
      {
        encuadre: 'plano americano',
        lugar: 'un descampado a las afueras',
        luz: 'atardecer sin sol, viento, todo desaturado',
        descripcion:
          'De pie con las manos en los bolsillos, hablando hacia un lado de la cámara. ' +
          'Hierba seca movida por el viento cruza el primer término.',
      },
      {
        encuadre: 'primer plano',
        lugar: 'la mesa de una biblioteca pública',
        luz: 'lámpara de mesa verde y ventanales altos al fondo',
        descripcion:
          'Sentado con las manos cruzadas sobre la mesa, hablando hacia un lado de la ' +
          'cámara. La pantalla de la lámpara tapa una esquina del cuadro.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'una mujer de unos cuarenta, pelo recogido, camiseta lisa' },
      { id: 'v2', sitio: 1, persona: 'un hombre de unos treinta y cinco, barba, jersey gastado' },
      { id: 'v3', sitio: 2, persona: 'una mujer de unos veintiocho, pelo muy corto, pendientes pequeños' },
      { id: 'v4', sitio: 3, persona: 'un hombre de unos cincuenta, canoso, camisa de cuadros' },
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
    sitios: [
      {
        encuadre: 'primer plano',
        lugar: 'un salón sencillo con ventana al monte',
        luz: 'luz de día nublado desde un lado',
        descripcion:
          'Sentado en una butaca, con las manos quietas, hablando hacia un lado de la ' +
          'cámara. El alféizar de la ventana desenfocado en primer término.',
      },
      {
        encuadre: 'plano medio',
        lugar: 'el porche de la casa, por la mañana',
        luz: 'mañana fría, el aliento visible, luz rasante',
        descripcion:
          'Sentada con una manta sobre las piernas, hablando hacia un lado de la cámara. ' +
          'La barandilla del porche cruza el primer término, fuera de foco.',
      },
      {
        encuadre: 'plano general corto',
        lugar: 'el camino de tierra por donde volvió',
        luz: 'cielo cubierto, luz plana, el monte al fondo desenfocado',
        descripcion:
          'De pie en mitad del camino, muy descentrado en el cuadro, hablando hacia un ' +
          'lado de la cámara. Piedras grandes en primer término, desenfocadas.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'un hombre de unos cincuenta, marcas de congelación en la cara' },
      { id: 'v2', sitio: 1, persona: 'una mujer de unos treinta y cinco, pelo corto, cicatriz en la mano' },
      { id: 'v3', sitio: 2, persona: 'un hombre de unos sesenta, barba blanca, camisa de franela' },
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
    sitios: [
      {
        encuadre: 'plano medio',
        lugar: 'un despacho universitario con papeles',
        luz: 'flexo y una ventana pequeña al fondo',
        descripcion:
          'Sentado entre pilas de carpetas, hablando hacia un lado de la cámara. Una ' +
          'pila de papeles desenfocada tapa la esquina inferior del cuadro.',
      },
      {
        encuadre: 'plano medio corto',
        lugar: 'la sala de un archivo con planeros',
        luz: 'fluorescente y polvo suspendido en el aire',
        descripcion:
          'De pie con un cajón de planero abierto delante, hablando hacia un lado de la ' +
          'cámara. El canto del cajón cruza el borde inferior del cuadro.',
      },
      {
        encuadre: 'plano americano',
        lugar: 'un aula vacía',
        luz: 'ventanales laterales de luz gris, pizarra oscura al fondo',
        descripcion:
          'Sentado en el borde de la tarima, hablando hacia un lado de la cámara. Las ' +
          'sillas vacías de la primera fila cruzan el primer término.',
      },
    ],
    variantes: [
      { id: 'v1', sitio: 0, persona: 'una mujer de unos cuarenta y cinco, gafas, pelo rizado suelto' },
      { id: 'v2', sitio: 1, persona: 'un hombre de unos sesenta, chaqueta de pana, barba corta' },
      { id: 'v3', sitio: 2, persona: 'un hombre de unos treinta y cinco, camisa lisa, pelo muy corto' },
    ],
  },
];

export const arquetipoPorId = (id) => ELENCO.find((a) => a.id === String(id || '').toLowerCase()) || null;

/**
 * En qué sitio se rueda esta variante.
 *
 * Por `sitio`, que es un índice del catálogo y no una posición en la lista: si
 * algún día se reordenan las variantes, cada persona se queda en SU sitio y no se
 * mueve. Sin `sitio` —o si apunta fuera— cae al plano general del papel, que es lo
 * que había antes y sigue siendo válido.
 */
export function sitioDeVariante(arquetipo, variante) {
  const sitios = arquetipo?.sitios || [];
  const n = Number(variante?.sitio);
  return (Number.isInteger(n) && sitios[n]) || sitios[0] || arquetipo?.plano || null;
}

/**
 * La descripción completa de una variante: SU SITIO más quién lo hace.
 *
 * Se compone aquí y en ningún otro sitio: si la biblioteca la compusiera por su
 * cuenta y la fase de imagen por la suya, un cambio en el formato daría dos
 * personas distintas para la misma clave y habría que pagar la biblioteca otra vez.
 */
export function planoDeVariante(arquetipo, variante) {
  if (!arquetipo || !variante) return null;
  const s = sitioDeVariante(arquetipo, variante);
  return {
    encuadre: s.encuadre,
    movimientoCamara: 'fijo',
    lugar: s.lugar,
    luz: s.luz,
    sujetos: [`${arquetipo.nombre} — ${variante.persona}`],
    descripcion: `${variante.persona}. ${s.descripcion}`,
  };
}

// ── Los recursos transversales ────────────────────────────────────────────────
//
// Planos que no son de ningún caso ni de ningún género: la carretera de noche, el
// precinto, el archivador, las manos pasando hojas de un expediente. Se generan
// una vez y cualquier episodio los hereda sin pagar nada.
//
// Y CADA UNO CON TRES VERSIONES QUE SON TRES PLANOS, no el mismo plano con otro
// tiempo. Las tres primeras versiones de la carretera eran la misma foto con
// llovizna, con niebla y de madrugada: puestas una al lado de la otra no se
// distinguían, y un recurso que vuelve en todos los episodios es justo el que más
// canta. Sigue siendo el mismo SITIO —eso es lo que mantiene la unidad del
// canal— pero otro tramo, otro ángulo y otra altura de cámara.
//
// El `matiz` se conserva y se sigue añadiendo al final: es lo que distingue dos
// versiones que comparten encuadre, y sin él la comprobación de que las versiones
// difieren se quedaría sin nada que mirar.

export const RECURSOS = [
  {
    id: 'carretera-noche', lugar: 'una carretera comarcal de noche', encuadre: 'plano general',
    luz: 'faros de un coche y nada más, negro a los lados',
    descripcion: 'Asfalto mojado y la línea blanca perdiéndose, vista desde el arcén a la altura de la rodilla; hierba alta desenfocada tapando el borde inferior del cuadro.',
    variantes: [
      { id: 'v1', matiz: 'con llovizna fina cruzando el haz de los faros' },
      {
        id: 'v2',
        encuadre: 'gran plano general',
        lugar: 'una curva cerrada de la comarcal, vista desde el talud',
        luz: 'niebla baja devolviendo la luz de un coche que no se ve',
        descripcion: 'La curva vista DESDE ARRIBA, en picado desde el talud, con el guardarraíl abollado dibujando el trazado y la cuneta negra por dentro; ni un solo faro de frente.',
        matiz: 'con la niebla comiéndose el fondo a los treinta metros',
      },
      {
        id: 'v3',
        encuadre: 'plano detalle',
        lugar: 'una recta de la comarcal vista desde dentro de un coche',
        luz: 'el verde del salpicadero y los faros propios abriendo el asfalto',
        descripcion: 'La carretera vista DESDE DENTRO del coche, desde el asiento del copiloto, a través del parabrisas con el limpiaparabrisas cruzando el cuadro; el salpicadero desenfocado ocupa el tercio inferior y el VOLANTE queda a la IZQUIERDA del cuadro.',
        matiz: 'ya de madrugada, con el cielo aclarando por un lado del parabrisas',
      },
    ],
  },
  {
    id: 'precinto', lugar: 'el precinto policial', encuadre: 'detalle',
    luz: 'luz azul intermitente por un lado, resto en penumbra',
    descripcion: 'Cinta de precinto tensada cruzando el cuadro, movida por el viento, muy cerca y fuera de foco por un extremo; detrás, formas humanas irreconocibles.',
    variantes: [
      { id: 'v1', matiz: 'de noche cerrada, con la niebla devolviendo el azul' },
      {
        id: 'v2',
        encuadre: 'plano general',
        lugar: 'el vano de un portal precintado, visto desde dentro',
        luz: 'la calle quemada de luz al otro lado, el portal en sombra',
        descripcion: 'La cinta cruzando el vano de una puerta de portal, vista DESDE DENTRO hacia la calle: el rectángulo de luz del exterior recorta el interior oscuro y la cinta lo parte en dos.',
        matiz: 'a primera hora, con la calle todavía vacía',
      },
      {
        id: 'v3',
        encuadre: 'detalle muy cerrado',
        lugar: 'un seto en el borde de un camino',
        luz: 'día gris, luz plana, sin ninguna sombra',
        descripcion: 'Un trozo suelto de cinta enganchado en las ramas de un seto y moviéndose, en macro, con el fondo reducido a manchas verdes; ni edificio ni calle a la vista.',
        matiz: 'ya descolorida por el sol y rota por un extremo',
      },
    ],
  },
  {
    id: 'archivador', lugar: 'el archivo de expedientes', encuadre: 'plano general',
    luz: 'fluorescente parpadeante al fondo del pasillo',
    descripcion: 'Un pasillo estrecho entre estanterías metálicas cargadas de cajas, visto desde la entrada; polvo suspendido en el haz; el fondo se pierde en negro.',
    variantes: [
      { id: 'v1', matiz: 'con un tubo fundido y medio pasillo a oscuras' },
      {
        id: 'v2',
        encuadre: 'plano cenital',
        lugar: 'la mesa de consulta del archivo',
        luz: 'un flexo desde arriba, el resto de la mesa cayendo a negro',
        descripcion: 'Una caja de archivo abierta sobre una mesa, vista DESDE ARRIBA en cenital, con las carpetas de canto llenando el cuadro; ninguna palabra legible.',
        matiz: 'con dos carpetas sacadas y apoyadas al lado',
      },
      {
        id: 'v3',
        encuadre: 'detalle',
        lugar: 'una estantería del archivo, de frente',
        luz: 'foco lateral rasante que saca el relieve del polvo',
        descripcion: 'Los lomos de las cajas de frente y muy cerca, llenando el cuadro de arriba abajo, con años escritos a mano que no llegan a leerse; sin profundidad ni pasillo.',
        matiz: 'con una caja sacada a medias rompiendo la fila',
      },
    ],
  },
  {
    id: 'manos-expediente', lugar: 'la mesa del expediente', encuadre: 'detalle',
    luz: 'flexo de mesa desde un lado, el resto de la habitación en negro',
    descripcion: 'Unas manos pasando hojas de una carpeta abierta, vistas casi cenitalmente y en escorzo muy inclinado; el papel se ve pero no se lee.',
    variantes: [
      { id: 'v1', matiz: 'con un dedo deteniéndose en una línea' },
      {
        id: 'v2',
        encuadre: 'detalle a ras de mesa',
        lugar: 'la mesa del expediente, a la altura del papel',
        luz: 'flexo de frente, la carpeta iluminada y el fondo en negro',
        descripcion: 'Las manos vistas DE PERFIL, a ras de la mesa, con la carpeta abierta llenando el fondo desenfocado y el canto de las hojas dibujando una línea que cruza el cuadro.',
        matiz: 'con las manos separando dos carpetas a la vez',
      },
      {
        id: 'v3',
        encuadre: 'plano medio',
        lugar: 'la mesa del expediente, por encima del hombro',
        luz: 'la lámpara detrás recortando el hombro en silueta',
        descripcion: 'La carpeta vista POR ENCIMA DEL HOMBRO de alguien sentado: el hombro y la nuca ocupan medio cuadro en sombra y el expediente queda pequeño al fondo, iluminado.',
        matiz: 'con guantes de látex y una bolsa de pruebas al lado',
      },
    ],
  },
  {
    id: 'bosque-amanecer', lugar: 'el bosque al amanecer', encuadre: 'gran plano general',
    luz: 'primera luz gris azulada entre los troncos',
    descripcion: 'Troncos altos y niebla baja entre ellos, rodado a través de unas ramas en primer término que tapan medio cuadro; suelo cubierto de hojarasca húmeda.',
    variantes: [
      { id: 'v1', matiz: 'con la niebla espesa a media altura' },
      {
        id: 'v2',
        encuadre: 'plano cenital',
        lugar: 'el suelo del bosque visto desde las copas',
        luz: 'el sol ya entrando en haces y manchando la hojarasca',
        descripcion: 'El suelo del bosque visto DESDE ARRIBA, en cenital, con la hojarasca y las sombras de los troncos dibujando líneas largas; ni horizonte ni cielo en el cuadro.',
        matiz: 'con las sombras de los troncos alargadas sobre las hojas',
      },
      {
        id: 'v3',
        encuadre: 'plano general',
        lugar: 'el bosque a ras de suelo, entre helechos',
        luz: 'contraluz bajo, los troncos casi en silueta',
        descripcion: 'Rodado A RAS DE SUELO entre helechos que llenan el primer término, con los troncos perdiéndose hacia arriba y saliéndose del cuadro; el punto de vista es el de alguien tumbado.',
        matiz: 'después de la lluvia, todo goteando y el suelo encharcado',
      },
    ],
  },
  {
    id: 'pasillo-juzgado', lugar: 'el pasillo del juzgado', encuadre: 'plano general',
    luz: 'ventanal lateral, luz dura y plana, suelo brillante',
    descripcion: 'Un pasillo largo con bancos de madera vacíos, visto desde una esquina y descentrado; una figura pequeña al fondo, de espaldas y desenfocada.',
    variantes: [
      { id: 'v1', matiz: 'completamente vacío, a primera hora' },
      {
        id: 'v2',
        encuadre: 'plano contrapicado',
        lugar: 'los bancos del pasillo, desde el suelo',
        luz: 'contraluz del ventanal, los bancos en silueta contra el suelo brillante',
        descripcion: 'Rodado DESDE EL SUELO, en contrapicado extremo: las patas de los bancos de madera cruzan el cuadro enormes y el techo alto se abre encima; nadie a la vista.',
        matiz: 'con una carpeta olvidada en el asiento de un banco',
      },
      {
        id: 'v3',
        encuadre: 'plano cenital',
        lugar: 'el hueco de la escalera de los juzgados',
        luz: 'claraboya arriba, los tramos hundiéndose en sombra',
        descripcion: 'El hueco de la escalera visto DESDE ARRIBA en cenital, con los tramos y las barandillas formando un rectángulo que se hunde; una figura minúscula bajando, muy abajo.',
        matiz: 'con una sola figura bajando, muy pequeña en el fondo',
      },
    ],
  },
  {
    id: 'lapida', lugar: 'el cementerio', encuadre: 'plano medio',
    luz: 'tarde encapotada, sin sombras marcadas',
    descripcion: 'Una lápida modesta de piedra sin inscripción legible, vista en escorzo desde muy cerca del suelo; hierba y una maceta volcada en primer término, desenfocadas.',
    variantes: [
      { id: 'v1', matiz: 'con la hierba crecida tapando la base' },
      {
        id: 'v2',
        encuadre: 'gran plano general',
        lugar: 'las filas de lápidas del cementerio, desde lejos',
        luz: 'cielo blanco de invierno, todo desaturado',
        descripcion: 'Las filas de lápidas vistas DESDE LEJOS y en ligero picado, alineadas hasta el fondo; ninguna destaca sobre otra y no hay ninguna en primer término.',
        matiz: 'con cipreses recortados contra el cielo blanco al fondo',
      },
      {
        id: 'v3',
        encuadre: 'detalle',
        lugar: 'la base de una lápida',
        luz: 'lluvia fina, la piedra oscurecida por el agua',
        descripcion: 'La base de la lápida en macro: la piedra mojada, el musgo del canto y una maceta volcada, llenando todo el cuadro; no se ve ni la parte de arriba ni el cementerio.',
        matiz: 'con flores recientes apoyadas y el suelo removido',
      },
    ],
  },
  {
    id: 'laboratorio', lugar: 'el laboratorio forense', encuadre: 'detalle',
    luz: 'lámpara de trabajo blanca desde arriba, fondo oscuro',
    descripcion: 'Una bandeja de acero con instrumental y una bolsa de pruebas, vista muy de cerca y en diagonal; unas manos enguantadas entrando por el borde del cuadro.',
    variantes: [
      { id: 'v1', matiz: 'con unas pinzas levantando algo pequeño' },
      {
        id: 'v2',
        encuadre: 'plano general',
        lugar: 'la sala del laboratorio, desde la puerta',
        luz: 'fluorescentes de techo encendidos, todo plano y frío',
        descripcion: 'La sala ENTERA vista desde la puerta, con las mesas de trabajo alineadas y vacías perdiéndose hacia el fondo; nadie dentro y ningún objeto en primer término.',
        matiz: 'con una sola lámpara de trabajo encendida al fondo',
      },
      {
        id: 'v3',
        encuadre: 'detalle abstracto',
        lugar: 'una superficie pulida del laboratorio',
        luz: 'ultravioleta, todo virado a azul',
        descripcion: 'El REFLEJO del instrumental en una superficie de acero pulido, del revés y deformado, llenando el cuadro; no se ve el objeto real, solo su reflejo.',
        matiz: 'con manchas fluorescentes apareciendo bajo la luz',
      },
    ],
  },
  {
    id: 'comisaria-noche', lugar: 'la comisaría de noche', encuadre: 'plano general',
    luz: 'interiores encendidos vistos desde fuera, calle a oscuras',
    descripcion: 'La fachada de un edificio bajo con las ventanas iluminadas, rodada desde la acera de enfrente a través de la luna mojada de un coche.',
    variantes: [
      { id: 'v1', matiz: 'con lluvia en el cristal deformando las luces' },
      {
        id: 'v2',
        encuadre: 'plano medio',
        lugar: 'el mostrador de entrada de la comisaría, por dentro',
        luz: 'fluorescente de techo, la puerta de la calle negra al fondo',
        descripcion: 'El mostrador de entrada visto DESDE DENTRO, vacío, con el tablero cruzando el cuadro y la puerta de la calle al fondo como un rectángulo negro.',
        matiz: 'con un teléfono descolgado sobre el mostrador',
      },
      {
        id: 'v3',
        encuadre: 'gran plano general',
        lugar: 'la calle de la comisaría, desde el otro extremo',
        luz: 'farolas ámbar y el cielo gris del amanecer',
        descripcion: 'La calle entera DESDE EL OTRO EXTREMO: el edificio queda pequeño y descentrado al fondo, y las farolas y los coches aparcados ocupan casi todo el cuadro.',
        matiz: 'al amanecer, con las luces todavía puestas',
      },
    ],
  },
  {
    id: 'casa-precintada', lugar: 'la casa precintada', encuadre: 'plano general',
    luz: 'mediodía plano de invierno, cielo blanco',
    descripcion: 'La fachada de una casa de dos plantas con las persianas bajadas y una cinta cruzando la puerta, vista desde el otro lado de una valla que ocupa el primer término.',
    variantes: [
      { id: 'v1', matiz: 'con el jardín delantero descuidado y alto' },
      {
        id: 'v2',
        encuadre: 'detalle',
        lugar: 'la rendija de una persiana bajada',
        luz: 'oscuridad dentro y una línea de día colándose por la rendija',
        descripcion: 'El interior entrevisto DESDE FUERA por la rendija de una persiana: una franja horizontal muy estrecha de habitación a oscuras, con el resto del cuadro ocupado por la lama.',
        matiz: 'con el polvo del cristal a contraluz',
      },
      {
        id: 'v3',
        encuadre: 'plano general lateral',
        lugar: 'la parte de atrás de la casa y el jardín',
        luz: 'farola de la calle por encima del tejado, el jardín en sombra',
        descripcion: 'La CARA DE ATRÁS de la casa, con la puerta de servicio y el tendedero vacío, vista desde el fondo del jardín; ni valla ni fachada principal en el cuadro.',
        matiz: 'de noche, con una sola ventana sin persiana',
      },
    ],
  },
  {
    id: 'sala-espera', lugar: 'la sala de espera', encuadre: 'plano general',
    luz: 'fluorescente frío, sin ventanas',
    descripcion: 'Sillas de plástico unidas en fila, vacías, vistas desde el rincón y muy descentradas; una máquina expendedora apagada al fondo, fuera de foco.',
    variantes: [
      { id: 'v1', matiz: 'con un vaso olvidado en el suelo' },
      {
        id: 'v2',
        encuadre: 'primer plano',
        lugar: 'una silla suelta de la sala de espera',
        luz: 'fluorescente de techo, el pasillo del fondo más oscuro',
        descripcion: 'Una SOLA silla en primer plano, muy cerca y de canto, con el pasillo abriéndose detrás completamente desenfocado; no se ve la fila ni la sala.',
        matiz: 'con un abrigo colgado del respaldo',
      },
      {
        id: 'v3',
        encuadre: 'plano cenital',
        lugar: 'la sala de espera vista desde el techo',
        luz: 'media luz, como fuera de horario',
        descripcion: 'La sala vista DESDE ARRIBA en cenital: las filas de sillas se convierten en líneas paralelas sobre el suelo y el cuadro es casi un dibujo geométrico.',
        matiz: 'con media luz, como de noche o fuera de horario',
      },
    ],
  },
  {
    id: 'rio-turbio', lugar: 'la orilla del río', encuadre: 'plano general',
    luz: 'atardecer sin sol, agua gris',
    descripcion: 'Agua turbia moviéndose despacio contra un talud de barro, rodada desde muy cerca de la superficie; cañas desenfocadas cruzando el primer término.',
    variantes: [
      { id: 'v1', matiz: 'con el nivel bajo y el barro de la orilla agrietado' },
      {
        id: 'v2',
        encuadre: 'gran plano general',
        lugar: 'el puente sobre el río, desde arriba',
        luz: 'luz plana de cielo cubierto, el agua como una lámina gris',
        descripcion: 'El cauce visto DESDE EL PUENTE, en picado: el río cruza el cuadro en diagonal como una cinta gris entre dos orillas de vegetación, sin ningún primer término.',
        matiz: 'crecido y rápido, arrastrando ramas',
      },
      {
        id: 'v3',
        encuadre: 'detalle',
        lugar: 'los guijarros de la orilla',
        luz: 'primera hora, niebla en la superficie',
        descripcion: 'Los guijarros mojados de la orilla y el borde del agua, en macro y A RAS DE SUELO, llenando el cuadro; el río se adivina solo por la línea del agua arriba.',
        matiz: 'con una bota de agua medio enterrada en el limo',
      },
    ],
  },
  {
    id: 'nave-abandonada', lugar: 'la nave abandonada', encuadre: 'gran plano general',
    luz: 'huecos de claraboya rota, haces polvorientos sobre el suelo',
    descripcion: 'Una nave industrial vacía con el suelo cubierto de escombro, vista desde el interior de un portón; el marco del portón tapa los bordes del cuadro.',
    variantes: [
      { id: 'v1', matiz: 'con palomas levantando el vuelo al fondo' },
      {
        id: 'v2',
        encuadre: 'gran plano general picado',
        lugar: 'la nave vista desde una pasarela alta',
        luz: 'las claraboyas rotas dibujando manchas de luz en el suelo',
        descripcion: 'La nave vista DESDE UNA PASARELA a media altura, en picado: el suelo entero se ve de golpe con las manchas de luz de las claraboyas repartidas, y no hay ningún portón encuadrando.',
        matiz: 'con el suelo encharcado devolviendo la luz',
      },
      {
        id: 'v3',
        encuadre: 'plano medio',
        lugar: 'un rincón de la nave con escombro',
        luz: 'una sola franja de luz cruzando, el resto en negro',
        descripcion: 'Un RINCÓN concreto: un montón de escombro y una silla volcada contra la pared, muy cerca; la nave entera queda fuera del cuadro y no se ve su tamaño.',
        matiz: 'con una silla volcada y papeles esparcidos',
      },
    ],
  },
  {
    id: 'telefono-fijo', lugar: 'la mesa del teléfono', encuadre: 'detalle',
    luz: 'lámpara baja, alrededor en penumbra',
    descripcion: 'Un teléfono fijo antiguo sobre un mueble, con el cable colgando, visto muy de cerca y en escorzo; el resto de la habitación cae en negro.',
    variantes: [
      { id: 'v1', matiz: 'con el auricular descolgado sobre la mesa' },
      {
        id: 'v2',
        encuadre: 'plano general corto',
        lugar: 'el recibidor con la mesita del teléfono',
        luz: 'luz de una ventana lejana, el recibidor en penumbra',
        descripcion: 'El RECIBIDOR entero: la mesita con el teléfono queda pequeña y descentrada al fondo, con el pasillo y el perchero ocupando el resto del cuadro.',
        matiz: 'con una libreta abierta al lado y un bolígrafo encima',
      },
      {
        id: 'v3',
        encuadre: 'detalle muy cerrado',
        lugar: 'el cable del teléfono y el zócalo de la pared',
        luz: 'luz rasante que saca el polvo del zócalo',
        descripcion: 'El cable enrollado bajando hasta el zócalo, en macro contra la pared; no se ve el teléfono, solo el cable y la roseta.',
        matiz: 'con polvo acumulado, como si llevara años sin usarse',
      },
    ],
  },
  {
    id: 'ropa-tendida', lugar: 'un patio trasero', encuadre: 'plano medio',
    luz: 'viento y cielo cubierto, luz difusa',
    descripcion: 'Ropa tendida moviéndose en una cuerda, rodada a través de las propias telas que tapan parte del cuadro; al fondo, una pared con humedades.',
    variantes: [
      { id: 'v1', matiz: 'con viento fuerte que levanta las sábanas' },
      {
        id: 'v2',
        encuadre: 'plano general picado',
        lugar: 'el patio de luces visto desde una ventana alta',
        luz: 'luz cenital del hueco, las plantas bajas en sombra',
        descripcion: 'El patio ENTERO visto DESDE ARRIBA, desde una ventana de un piso alto: las cuerdas cruzan el hueco en varias alturas y el suelo del patio queda al fondo, muy abajo.',
        matiz: 'con la ropa empapada y goteando, sin viento',
      },
      {
        id: 'v3',
        encuadre: 'detalle',
        lugar: 'la cuerda de tender contra el cielo',
        luz: 'contraluz de cielo blanco, todo casi en silueta',
        descripcion: 'Dos pinzas solas en la cuerda vacía, en macro y CONTRA EL CIELO: el fondo es una superficie blanca sin nada, sin patio ni pared.',
        matiz: 'con la cuerda medio vacía y dos pinzas sueltas',
      },
    ],
  },
  {
    id: 'coche-parado', lugar: 'un coche parado en el arcén', encuadre: 'plano general',
    luz: 'noche cerrada, intermitentes ámbar',
    descripcion: 'Un coche detenido con la puerta abierta y la luz interior encendida, visto desde lejos y desde abajo; hierba alta en primer término tapando las ruedas.',
    variantes: [
      { id: 'v1', matiz: 'con los intermitentes puestos y nadie alrededor' },
      {
        id: 'v2',
        encuadre: 'plano medio',
        lugar: 'el interior del coche, desde el asiento de atrás',
        luz: 'luz de día entrando por el parabrisas, el interior en sombra',
        descripcion: 'El interior visto DESDE EL ASIENTO DE ATRÁS: los reposacabezas delanteros ocupan el primer término en sombra y el parabrisas se abre al fondo como una ventana de luz, con el VOLANTE a la IZQUIERDA.',
        matiz: 'de día, con el salpicadero cubierto de polvo',
      },
      {
        id: 'v3',
        encuadre: 'detalle a ras de suelo',
        lugar: 'la rueda del coche y la grava del arcén',
        luz: 'lluvia, el agua corriendo por la grava',
        descripcion: 'La rueda y la grava mojada del arcén, en macro A RAS DE SUELO, llenando el cuadro; del coche solo se ve el bajo de la carrocería.',
        matiz: 'bajo lluvia, con el agua corriendo hacia la cuneta',
      },
    ],
  },
  {
    id: 'cinta-casete', lugar: 'la grabadora del interrogatorio', encuadre: 'detalle',
    luz: 'una sola bombilla desnuda encima de la mesa',
    descripcion: 'Una grabadora de casete sobre una mesa metálica, con las bobinas girando, vista casi a ras de mesa y con el borde de la mesa desenfocado delante.',
    variantes: [
      { id: 'v1', matiz: 'con las bobinas girando y el piloto rojo encendido' },
      {
        id: 'v2',
        encuadre: 'plano general',
        lugar: 'la sala de interrogatorio entera',
        luz: 'la bombilla de la mesa y las esquinas cayendo a negro',
        descripcion: 'La SALA entera desde una esquina alta: la mesa metálica en el centro con dos sillas vacías y la grabadora reducida a un objeto pequeño encima.',
        matiz: 'parada, con la cinta a medias y la tapa abierta',
      },
      {
        id: 'v3',
        encuadre: 'macro',
        lugar: 'las bobinas de la cinta',
        luz: 'luz dura lateral, el resto en negro absoluto',
        descripcion: 'Las bobinas en MACRO extremo, tan cerca que se ve el grano de la cinta pasando entre ellas; nada más entra en el cuadro.',
        matiz: 'con la cinta pasando y el contador moviéndose',
      },
    ],
  },
  {
    id: 'escalera-sotano', lugar: 'la escalera del sótano', encuadre: 'plano general',
    luz: 'luz que baja desde arriba, el fondo en negro absoluto',
    descripcion: 'Unos peldaños de hormigón bajando hacia la oscuridad, vistos desde arriba y en diagonal; la barandilla oxidada cruza el primer término.',
    variantes: [
      { id: 'v1', matiz: 'con una bombilla encendida a media altura' },
      {
        id: 'v2',
        encuadre: 'contrapicado',
        lugar: 'la escalera vista desde el fondo del sótano',
        luz: 'el rectángulo de luz de arriba como única fuente',
        descripcion: 'La escalera DESDE ABAJO, en contrapicado: los peldaños suben y el rectángulo de luz de la puerta queda arriba del todo, pequeño; el primer término es negro.',
        matiz: 'con el suelo del fondo encharcado y brillando apenas',
      },
      {
        id: 'v3',
        encuadre: 'detalle',
        lugar: 'la barandilla oxidada contra la pared de hormigón',
        luz: 'luz rasante que saca el óxido y el poro del hormigón',
        descripcion: 'El anclaje oxidado de la barandilla contra el hormigón, en macro y de lado; no se ven peldaños ni se entiende que sea una escalera.',
        matiz: 'con la pintura saltada y regueros de óxido bajando',
      },
    ],
  },
  {
    id: 'mapa-chinchetas', lugar: 'el mapa de la investigación', encuadre: 'plano medio',
    luz: 'flexo lateral, papel amarillento',
    descripcion: 'Un mapa clavado en un corcho con chinchetas y cordel entre ellas, visto muy en escorzo desde un lado; ninguna palabra legible, solo el trazado.',
    variantes: [
      { id: 'v1', matiz: 'con pocas chinchetas, al principio de todo' },
      {
        id: 'v2',
        encuadre: 'plano general corto',
        lugar: 'la pared entera del corcho',
        luz: 'luz de techo plana sobre toda la pared',
        descripcion: 'El corcho DE FRENTE y entero, con la pared y el zócalo alrededor: se ve el tamaño real del panel y la habitación que lo rodea, sin ningún escorzo.',
        matiz: 'lleno de cordeles cruzados y papeles superpuestos',
      },
      {
        id: 'v3',
        encuadre: 'macro',
        lugar: 'una chincheta del mapa',
        luz: 'flexo muy cerca, profundidad de campo mínima',
        descripcion: 'UNA chincheta y el cordel tensado saliendo de ella, en macro con casi todo desenfocado; no se ve el mapa ni se entiende de qué sitio es.',
        matiz: 'con una mano clavando una chincheta nueva',
      },
    ],
  },
  {
    id: 'lluvia-ventana', lugar: 'una ventana con lluvia', encuadre: 'detalle',
    luz: 'gris de tarde, luces de calle desenfocadas detrás',
    descripcion: 'Gotas resbalando por un cristal, muy cerca y enfocadas, con la calle detrás convertida en manchas de luz.',
    variantes: [
      { id: 'v1', matiz: 'de noche, con las manchas de luz ámbar de las farolas' },
      {
        id: 'v2',
        encuadre: 'plano general',
        lugar: 'la ventana entera desde dentro de la habitación',
        luz: 'la habitación a oscuras y la ventana como único rectángulo de luz',
        descripcion: 'La ventana ENTERA vista desde el fondo de la habitación a oscuras: el marco recorta un rectángulo gris y los muebles quedan en silueta contra él.',
        matiz: 'de día, con el gris del cielo y ninguna luz encendida',
      },
      {
        id: 'v3',
        encuadre: 'detalle a ras',
        lugar: 'el alféizar por fuera, con el agua corriendo',
        luz: 'luz plana de día lluvioso, todo desaturado',
        descripcion: 'El alféizar POR FUERA, a ras, con el agua corriendo por la piedra y desbordando el canto; el cristal queda detrás, opaco y sin nada visible.',
        matiz: 'con hojas pegadas a la piedra por el agua',
      },
    ],
  },
];

export const recursoPorId = (id) => RECURSOS.find((r) => r.id === String(id || '').toLowerCase()) || null;

/**
 * El plano completo de una versión de un recurso.
 *
 * Una versión puede quedarse con el plano del recurso —y entonces solo cambia el
 * matiz— o traer EL SUYO: otro ángulo, otra altura de cámara, otro rincón del
 * mismo sitio. Eso segundo es lo que hace que tres versiones se distingan puestas
 * una al lado de la otra; lo primero es lo que había y no se distinguía.
 */
export function planoDeRecurso(recurso, variante) {
  if (!recurso || !variante) return null;
  return {
    encuadre: variante.encuadre || recurso.encuadre,
    movimientoCamara: 'fijo',
    lugar: variante.lugar || recurso.lugar,
    luz: variante.luz || recurso.luz,
    sujetos: [],
    descripcion: `${variante.descripcion || recurso.descripcion} ${variante.matiz}.`,
  };
}
