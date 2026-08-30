// El catálogo de géneros.
//
// Una estructura de bloques —gancho, hallazgo, peritaje, muro, pista falsa,
// archivo, tecnología, cierre— es LO QUE HACE QUE UN EPISODIO FUNCIONE, y por eso
// mismo no puede vivir dentro del director. Escrita ahí dentro sería invisible: no
// habría forma de saber con qué estructura se escribió un episodio sin releer el
// código, ni de cambiarla sin tocar una fase, ni de tener dos géneros a la vez.
// Es exactamente el error que ya se pagó con los estilos visuales, y el comentario
// de `estilos.mjs` lo dice con todas las letras: «no había forma de saber cuál era
// sin generar ochenta imágenes. Eso es pagar para enterarte».
//
// Así que el género es una entrada de catálogo, igual que el estilo, el tema y el
// generador: una tabla fija de la que la configuración guarda SOLO LA CLAVE. La
// clave no cambia nunca; la tabla se puede reescribir entera sin tocar un proyecto
// guardado.
//
// LA REGLA, y es la misma que el README le aplica al montador: un género se añade a
// esta tabla y NO SE TOCA NADA MÁS. Si añadir un género obliga a editar una fase,
// el diseño está mal y hay que arreglar el diseño, no el género.
//
// Cada género declara cuatro cosas:
//
//   bloques      — la estructura del episodio, en proporciones que suman 1. Los
//                  minutos que pida el usuario se reparten con esos pesos.
//   motivos      — los planos que en este género VUELVEN. No es una lista de
//                  ahorro: es cómo se monta el género.
//   personajes   — los arquetipos que declaran. De aquí sale la biblioteca
//                  permanente del canal, que se genera una vez y sirve siempre.
//   estiloPorDefecto — con qué estilo visual de `estilos.mjs` se ve este género.

export const GENEROS = [
  {
    id: 'crimen-frio',
    nombre: 'Crimen frío',
    resumen: 'Cuerpo oculto, décadas, reapertura por tecnología nueva.',
    estiloPorDefecto: 'noir',

    // LOS PESOS SUMAN 1, Y NO ES DECORATIVO: son la proporción con la que se
    // reparten los minutos pedidos. Un episodio de treinta minutos y otro de diez
    // tienen la misma forma, con los bloques encogidos.
    //
    // El reparto no es plano a propósito. La pista falsa se lleva un cuarto del
    // episodio porque es donde se pierde o se gana al espectador: hay que levantar
    // entero a un sospechoso al que todo señala para poder derribarlo, y eso no
    // cabe en dos minutos. El gancho se lleva un 3 % —cuarenta segundos de treinta
    // minutos— porque es un gancho, no un prólogo.
    //
    // `funcion` no es documentación: es lo que se le dice al que escribe cada
    // bloque. Sin ella todos los bloques recibirían «avanzar el relato», que es lo
    // mismo que no decir nada.
    bloques: [
      {
        id: 'gancho',
        nombre: 'Gancho en segunda persona',
        peso: 0.03,
        funcion:
          'meter al espectador DENTRO de la acción, en segunda persona, antes de ' +
          'contextualizar nada, y cortar exactamente en el instante del hallazgo',
      },
      {
        id: 'hallazgo',
        nombre: 'Reconstrucción del hallazgo',
        peso: 0.16,
        funcion:
          'quién encuentra el cuerpo, qué estaba haciendo esa mañana, y en qué ' +
          'sitio imposible estuvo todos estos años sin que nadie lo viera',
      },
      {
        id: 'peritaje',
        nombre: 'Autoridades y primer peritaje',
        peso: 0.16,
        funcion:
          'lo que las autoridades pueden establecer y lo que NO: qué dice el ' +
          'cuerpo, qué dicen los objetos, y dónde se acaba lo que la técnica de ' +
          'entonces sabía leer',
      },
      {
        id: 'muro',
        nombre: 'El muro: nada coincide',
        peso: 0.1,
        funcion:
          'enseñar que ninguna denuncia encaja y que el caso se queda parado; el ' +
          'espectador tiene que sentir el muro, no oír que lo hubo',
      },
      {
        id: 'pistafalsa',
        nombre: 'La pista falsa',
        peso: 0.25,
        funcion:
          'levantar ENTERO al sospechoso al que todo señala —oficio, fechas, ' +
          'lugar, un rasgo que encaja demasiado bien— y derribarlo después. Es el ' +
          'bloque más largo porque es donde se gana o se pierde al espectador',
      },
      {
        id: 'archivo',
        nombre: 'Archivo y salto temporal',
        peso: 0.08,
        funcion:
          'el caso se archiva y pasan los años: el salto en el tiempo, qué fue de ' +
          'los que quedaron esperando, y el expediente cogiendo polvo',
      },
      {
        id: 'tecnologia',
        nombre: 'La tecnología nueva resuelve',
        peso: 0.14,
        funcion:
          'la técnica que no existía lee lo que en su momento no se pudo leer, y ' +
          'devuelve el nombre. Nombrada con precisión, no «tecnología moderna»',
      },
      {
        id: 'cierre',
        nombre: 'Cierre y duda abierta',
        peso: 0.08,
        funcion:
          'resolver, devolver el nombre, cerrar con la familia, y dejar UNA sola ' +
          'cosa concreta sin explicar, formulada como pregunta y sin contestar',
      },
    ],

    // Los planos que en este género vuelven. El contenedor donde apareció el
    // cuerpo, la carretera de noche, el precinto: se ven cinco o seis veces a lo
    // largo del episodio y eso es lo que le da unidad visual. Que de paso una
    // imagen sirva para siete tomas es la consecuencia, no el motivo.
    motivos: [
      'el contenedor donde apareció el cuerpo',
      'la carretera comarcal de noche',
      'el precinto policial',
      'el archivador de expedientes',
      'la lápida sin nombre',
      'el laboratorio forense',
    ],

    // Los arquetipos que declaran en este género. Cada dos o tres minutos entra
    // uno; sus planos se generan UNA VEZ para todo el canal y vuelven episodio
    // tras episodio, que es lo que hace viable un canal que todavía no monetiza.
    //
    // Cada uno trae su PLANO ENTERO —dónde está, qué hace, cómo se ve— y no solo
    // su nombre. Es lo que permite que la biblioteca se genere sola desde el
    // catálogo: si aquí hubiera solo la etiqueta «perito forense», la fase de
    // biblioteca tendría que saberse la descripción de cada arquetipo, y añadir un
    // género obligaría a editar una fase — justo lo que la regla de arriba
    // prohíbe.
    personajes: [
      {
        id: 'perito',
        nombre: 'perito forense',
        plano: {
          encuadre: 'plano medio',
          lugar: 'el laboratorio forense',
          luz: 'fluorescente fría de techo, mesa de acero devolviendo la luz',
          descripcion:
            'Una perito de bata sobre ropa de calle, sentada frente a una mesa de acero, ' +
            'hablando hacia un lado de la cámara. Se la ve a través del marco de una ' +
            'puerta de vidrio esmerilado que ocupa el primer término y la deja descentrada.',
        },
      },
      {
        id: 'detective',
        nombre: 'detective veterano',
        plano: {
          encuadre: 'plano medio',
          lugar: 'el despacho del detective',
          luz: 'persiana veneciana con sol bajo, franjas sobre la pared, el resto en penumbra',
          descripcion:
            'Un hombre mayor con camisa arremangada, sentado de lado en una silla de ' +
            'oficina vieja, hablando hacia un lado de la cámara. Rodado por encima del ' +
            'hombro de otra persona, desenfocada en primer término.',
        },
      },
      {
        id: 'testigo',
        nombre: 'testigo del hallazgo',
        plano: {
          encuadre: 'plano medio',
          lugar: 'la cocina de una casa de pueblo',
          luz: 'ventana lateral de mañana gris, sin lámparas encendidas',
          descripcion:
            'Un hombre de mediana edad con ropa de trabajo, sentado a la mesa de la ' +
            'cocina con las manos juntas, hablando hacia un lado de la cámara. Se ve a ' +
            'través del vano de la puerta, con la jamba tapando parte del cuadro.',
        },
      },
      {
        id: 'familiar',
        nombre: 'familiar de la víctima',
        plano: {
          encuadre: 'primer plano',
          lugar: 'el salón de una casa con muebles viejos',
          luz: 'lámpara de pie cálida a un lado, el resto de la habitación en negro',
          descripcion:
            'Una mujer mayor sentada en un sillón, con las manos en el regazo, hablando ' +
            'hacia un lado de la cámara. Un marco de fotos desenfocado en primer término, ' +
            'a un lado del cuadro.',
        },
      },
    ],
  },

  {
    id: 'desaparicion',
    nombre: 'Desaparición',
    resumen: 'Alguien sale de casa y no llega. La búsqueda, y lo que la búsqueda destapa.',
    estiloPorDefecto: 'reconstruccion',
    // Aquí el peso se va a la BÚSQUEDA, no a la pista falsa: lo que engancha en
    // una desaparición no es quién fue, es el tiempo pasando mientras se rastrea.
    bloques: [
      { id: 'gancho', nombre: 'Gancho en segunda persona', peso: 0.03, funcion: 'meter al espectador en el último trayecto conocido, en segunda persona, y cortar donde se pierde el rastro' },
      { id: 'ultimadia', nombre: 'El último día', peso: 0.17, funcion: 'reconstruir hora por hora la última jornada: qué hizo, a quién vio, qué dejó a medias' },
      { id: 'alarma', nombre: 'Cuando salta la alarma', peso: 0.12, funcion: 'quién se da cuenta y cuánto tarda: las horas que se pierden antes de que alguien denuncie' },
      { id: 'busqueda', nombre: 'La búsqueda', peso: 0.22, funcion: 'los rastreos, el terreno, los voluntarios y lo que no aparece; el tiempo pasando' },
      { id: 'pistafalsa', nombre: 'La pista que no era', peso: 0.18, funcion: 'la llamada, el avistamiento o el sospechoso que reorienta todo y resulta no ser nada' },
      { id: 'silencio', nombre: 'Los años de silencio', peso: 0.12, funcion: 'el caso se enfría: qué fue de los que siguieron esperando, y qué cambió en su vida' },
      { id: 'vuelta', nombre: 'Lo que apareció después', peso: 0.1, funcion: 'lo que se supo años más tarde, y si cierra o abre más' },
      { id: 'cierre', nombre: 'Cierre y duda abierta', peso: 0.06, funcion: 'cerrar con quien sigue esperando, y dejar una sola pregunta concreta sin contestar' },
    ],
    motivos: [
      'el sendero por el que se la vio por última vez',
      'la parada de autobús vacía',
      'los carteles de búsqueda pegados en una farola',
      'la batida de voluntarios entre la maleza',
      'la habitación intacta',
      'el coche aparcado donde lo dejó',
    ],
    personajes: [
      { id: 'coordinador', nombre: 'coordinador de la búsqueda', plano: { encuadre: 'plano medio', lugar: 'el puesto de mando de la batida', luz: 'mañana gris bajo una carpa, luz plana', descripcion: 'Un hombre con chaleco reflectante junto a una mesa plegable con mapas, hablando hacia un lado de la cámara. Rodado a través de la lona de la carpa, que tapa una esquina del cuadro.' } },
      { id: 'guardia', nombre: 'agente que llevó el caso', plano: { encuadre: 'plano medio', lugar: 'una sala de reuniones de comisaría', luz: 'fluorescente de techo, ventana alta al fondo', descripcion: 'Una agente de uniforme sentada a una mesa larga vacía, hablando hacia un lado de la cámara. En primer término, desenfocada, la esquina de una silla.' } },
      { id: 'amiga', nombre: 'amiga de la desaparecida', plano: { encuadre: 'primer plano', lugar: 'un bar de barrio a media tarde', luz: 'ventana lateral, interior en penumbra', descripcion: 'Una mujer joven sentada junto a la ventana, con una taza delante, hablando hacia un lado de la cámara. El cristal de la ventana con reflejos ocupa el primer término.' } },
      { id: 'madre', nombre: 'madre que sigue esperando', plano: { encuadre: 'primer plano', lugar: 'la cocina de la casa familiar', luz: 'luz de tarde entrando de lado, sin lámparas', descripcion: 'Una mujer mayor de pie apoyada en la encimera, con los brazos cruzados, hablando hacia un lado de la cámara. El marco de la puerta tapa parte del cuadro.' } },
    ],
  },

  {
    id: 'terror-real',
    nombre: 'Terror real',
    resumen: 'Una institución, un experimento, un lugar. Lo que se hizo con permiso.',
    estiloPorDefecto: 'archivo',
    // El giro aquí no es «quién fue» sino «esto era legal»: el peso está en el
    // destape y en el papeleo que lo autorizó.
    bloques: [
      { id: 'gancho', nombre: 'Gancho en segunda persona', peso: 0.03, funcion: 'meter al espectador dentro del sitio, en segunda persona, y cortar en el primer detalle que no encaja' },
      { id: 'lugar', nombre: 'El lugar y lo que prometía', peso: 0.15, funcion: 'qué era la institución, para qué se creó y qué decía de sí misma' },
      { id: 'dentro', nombre: 'Lo que pasaba dentro', peso: 0.2, funcion: 'la rutina real, contada por quien estuvo: los detalles concretos, sin adjetivos' },
      { id: 'permiso', nombre: 'Quién lo autorizó', peso: 0.16, funcion: 'el papeleo, las firmas y el marco legal que lo permitía; el giro es que era legal' },
      { id: 'grieta', nombre: 'La primera grieta', peso: 0.14, funcion: 'quién habla primero y qué le pasa por hablar' },
      { id: 'destape', nombre: 'El destape', peso: 0.16, funcion: 'la investigación, la publicación o la inspección que lo saca a la luz' },
      { id: 'despues', nombre: 'Lo que cambió y lo que no', peso: 0.1, funcion: 'condenas, reformas, indemnizaciones; y qué sigue igual' },
      { id: 'cierre', nombre: 'Cierre y duda abierta', peso: 0.06, funcion: 'cerrar con quien lo vivió, y dejar una pregunta concreta sin contestar' },
    ],
    motivos: [
      'el pasillo de la institución',
      'las camas alineadas del dormitorio común',
      'la verja de entrada vista desde fuera',
      'el sello de un formulario de consentimiento',
      'el patio vacío al amanecer',
      'la escalera de servicio',
    ],
    personajes: [
      { id: 'interno', nombre: 'quien estuvo dentro', plano: { encuadre: 'primer plano', lugar: 'el salón de un piso pequeño', luz: 'lámpara de mesa cálida, resto en penumbra', descripcion: 'Un hombre de unos sesenta sentado en el borde de un sofá, con las manos entrelazadas, hablando hacia un lado de la cámara. Un visillo desenfocado cruza el primer término.' } },
      { id: 'enfermera', nombre: 'personal que trabajó allí', plano: { encuadre: 'plano medio', lugar: 'una sala de descanso con taquillas', luz: 'fluorescente frío, sin ventanas', descripcion: 'Una mujer de mediana edad sentada en un banco junto a unas taquillas metálicas, hablando hacia un lado de la cámara. El borde de una taquilla abierta tapa parte del cuadro.' } },
      { id: 'periodista', nombre: 'periodista que lo destapó', plano: { encuadre: 'plano medio', lugar: 'una redacción medio vacía', luz: 'pantallas encendidas y una ventana lejana al fondo', descripcion: 'Una periodista de pie junto a una mesa con papeles, hablando hacia un lado de la cámara. Rodada por encima del hombro de otra persona, desenfocada.' } },
      { id: 'abogado', nombre: 'abogado de las víctimas', plano: { encuadre: 'plano medio', lugar: 'un despacho con estanterías de tomos', luz: 'ventana lateral grande, contraluz suave', descripcion: 'Un hombre trajeado sentado tras una mesa despejada, hablando hacia un lado de la cámara. Una estantería desenfocada en primer término, a un lado.' } },
    ],
  },

  {
    id: 'secta',
    nombre: 'Secta',
    resumen: 'Un líder, una comunidad y la puerta que deja de abrirse por dentro.',
    estiloPorDefecto: 'reconstruccion',
    // El peso va a la SEDUCCIÓN, no al final: si no se entiende por qué alguien
    // entró, el desenlace no significa nada y el espectador se pone por encima.
    bloques: [
      { id: 'gancho', nombre: 'Gancho en segunda persona', peso: 0.03, funcion: 'meter al espectador en la primera reunión, en segunda persona, y cortar en el momento en que decide volver' },
      { id: 'lider', nombre: 'Quién era él', peso: 0.14, funcion: 'de dónde sale el líder y qué prometía, sin ironía y sin adjetivos: lo que se le veía' },
      { id: 'seduccion', nombre: 'Por qué se entra', peso: 0.2, funcion: 'lo que la comunidad daba de verdad —compañía, sentido, orden— contado desde dentro' },
      { id: 'cierre-puerta', nombre: 'La puerta se cierra', peso: 0.17, funcion: 'las reglas nuevas, el dinero, el aislamiento; cada paso razonable por sí solo' },
      { id: 'quiebra', nombre: 'La primera que se va', peso: 0.16, funcion: 'quién rompe, cómo lo hace y qué le cuesta' },
      { id: 'final', nombre: 'El final de la comunidad', peso: 0.15, funcion: 'la redada, el juicio o la disolución; los hechos, no el morbo' },
      { id: 'despues', nombre: 'Los que quedaron', peso: 0.09, funcion: 'qué fue de ellos y qué siguen defendiendo' },
      { id: 'cierre', nombre: 'Cierre y duda abierta', peso: 0.06, funcion: 'cerrar sin lección, y dejar una pregunta concreta sin contestar' },
    ],
    motivos: [
      'la casa comunal vista desde el camino',
      'el círculo de sillas en la sala de reuniones',
      'las manos recogiendo sobres de donativos',
      'la carretera de tierra que lleva al recinto',
      'la puerta cerrada por dentro',
      'la mesa larga del comedor común',
    ],
    personajes: [
      { id: 'exmiembro', nombre: 'quien salió de la comunidad', plano: { encuadre: 'primer plano', lugar: 'una habitación alquilada con poca cosa', luz: 'ventana lateral de tarde, sin cortinas', descripcion: 'Una mujer de unos cuarenta sentada al borde de una cama, con las manos en el regazo, hablando hacia un lado de la cámara. El marco de la puerta ocupa el primer término.' } },
      { id: 'familiar', nombre: 'familiar que intentó sacarlo', plano: { encuadre: 'plano medio', lugar: 'el porche de una casa de campo', luz: 'atardecer sin sol directo, cielo cubierto', descripcion: 'Un hombre mayor sentado en una silla de plástico, con un vaso al lado, hablando hacia un lado de la cámara. Una barandilla desenfocada cruza el primer término.' } },
      { id: 'investigador', nombre: 'quien investigó al grupo', plano: { encuadre: 'plano medio', lugar: 'un despacho universitario con papeles', luz: 'flexo y una ventana pequeña al fondo', descripcion: 'Una mujer sentada entre pilas de carpetas, hablando hacia un lado de la cámara. Una pila de papeles desenfocada tapa la esquina inferior del cuadro.' } },
      { id: 'fiscal', nombre: 'fiscal del caso', plano: { encuadre: 'plano medio', lugar: 'una sala de vistas vacía', luz: 'ventanal alto, luz dura y plana', descripcion: 'Un hombre trajeado de pie junto a un estrado vacío, hablando hacia un lado de la cámara. El respaldo de un banco de madera cruza el primer término.' } },
    ],
  },

  {
    id: 'supervivencia',
    nombre: 'Supervivencia',
    resumen: 'Se sale de casa por la mañana y a mediodía todo ha dejado de funcionar.',
    estiloPorDefecto: 'reconstruccion',
    // No hay pista falsa ni culpable: el peso está en la resistencia y en las
    // decisiones. Un género que se sostiene por acumulación, no por giro.
    bloques: [
      { id: 'gancho', nombre: 'Gancho en segunda persona', peso: 0.03, funcion: 'meter al espectador en el instante en que algo va mal, en segunda persona, y cortar ahí' },
      { id: 'antes', nombre: 'La mañana normal', peso: 0.12, funcion: 'quiénes eran y qué iban a hacer ese día: lo cotidiano, con nombres y horas' },
      { id: 'ruptura', nombre: 'Lo que salió mal', peso: 0.15, funcion: 'el accidente o el error, reconstruido minuto a minuto y sin dramatizar' },
      { id: 'primeras', nombre: 'Las primeras horas', peso: 0.16, funcion: 'el inventario de lo que hay y lo que no; las primeras decisiones' },
      { id: 'resistencia', nombre: 'Los días', peso: 0.22, funcion: 'el frío, el agua, el hambre y el tiempo; lo concreto de aguantar, un detalle por día' },
      { id: 'decision', nombre: 'La decisión imposible', peso: 0.15, funcion: 'la elección que cambia el desenlace, contada sin juzgar a nadie' },
      { id: 'rescate', nombre: 'El rescate', peso: 0.11, funcion: 'cómo los encuentran, y qué encuentran' },
      { id: 'cierre', nombre: 'Cierre y duda abierta', peso: 0.06, funcion: 'cerrar con quien volvió, y dejar una pregunta concreta sin contestar' },
    ],
    motivos: [
      'la ladera nevada vista desde abajo',
      'el refugio improvisado',
      'las huellas que la nieve va borrando',
      'el helicóptero de rescate contra el cielo',
      'la radio muda',
      'la mochila abierta con lo que quedaba',
    ],
    personajes: [
      { id: 'superviviente', nombre: 'quien volvió', plano: { encuadre: 'primer plano', lugar: 'un salón sencillo con ventana al monte', luz: 'luz de día nublado desde un lado', descripcion: 'Un hombre de unos cincuenta sentado en una butaca, con las manos quietas, hablando hacia un lado de la cámara. El alféizar de la ventana desenfocado en primer término.' } },
      { id: 'rescatador', nombre: 'jefe del equipo de rescate', plano: { encuadre: 'plano medio', lugar: 'la nave del equipo de montaña', luz: 'portón abierto al fondo, interior en penumbra', descripcion: 'Una mujer con forro polar de pie junto a material colgado en la pared, hablando hacia un lado de la cámara. Cuerdas colgadas desenfocadas en primer término.' } },
      { id: 'medico', nombre: 'médico que los atendió', plano: { encuadre: 'plano medio', lugar: 'un pasillo de hospital comarcal', luz: 'fluorescente frío, suelo brillante', descripcion: 'Un médico con bata de pie contra la pared del pasillo, hablando hacia un lado de la cámara. Una camilla desenfocada cruza el primer término.' } },
      { id: 'familiar', nombre: 'familiar que esperó abajo', plano: { encuadre: 'primer plano', lugar: 'la cocina de una casa de montaña', luz: 'ventana pequeña, luz gris de invierno', descripcion: 'Una mujer sentada a la mesa con las manos rodeando una taza, hablando hacia un lado de la cámara. El marco de la puerta tapa un lado del cuadro.' } },
    ],
  },
];

/**
 * LOS RECURSOS DEL CANAL: planos transversales que sirven a todos los géneros.
 *
 * Una carretera de noche, un precinto policial, un archivador, unas manos pasando
 * hojas de un expediente. No son de ningún caso y por eso no viven dentro de
 * ningún género: se generan una vez, viven en la biblioteca, y cualquier episodio
 * de cualquier género los hereda sin pagar nada.
 *
 * Es exactamente el mismo mecanismo que ya usa el «Reutilizar» entre casos —una
 * toma con `heredado` apunta a la imagen de otra pieza, con la clave entera
 * dentro—, solo que en vez de esperar a que dos casos coincidan por casualidad, se
 * construye a propósito el banco que van a compartir todos.
 */
export const RECURSOS = [
  { id: 'carretera-noche', lugar: 'una carretera comarcal de noche', encuadre: 'plano general', luz: 'faros de un coche y nada más, negro a los lados', descripcion: 'Asfalto mojado y la línea blanca perdiéndose, vista desde el arcén a la altura de la rodilla; hierba alta desenfocada tapando el borde inferior del cuadro; llovizna en el haz de los faros.' },
  { id: 'precinto', lugar: 'el precinto policial', encuadre: 'detalle', luz: 'luz azul intermitente por un lado, resto en penumbra', descripcion: 'Cinta de precinto tensada cruzando el cuadro, movida por el viento, muy cerca y fuera de foco por un extremo; detrás, formas humanas irreconocibles en la niebla.' },
  { id: 'archivador', lugar: 'el archivo de expedientes', encuadre: 'plano general', luz: 'fluorescente parpadeante al fondo del pasillo', descripcion: 'Un pasillo estrecho entre estanterías metálicas cargadas de cajas, visto desde la entrada; polvo suspendido en el haz; el fondo se pierde en negro.' },
  { id: 'manos-expediente', lugar: 'la mesa del expediente', encuadre: 'detalle', luz: 'flexo de mesa desde un lado, el resto de la habitación en negro', descripcion: 'Unas manos pasando hojas de una carpeta abierta, vistas casi cenitalmente y en escorzo muy inclinado; el papel se ve pero no se lee; un dedo señalando una línea.' },
  { id: 'bosque-amanecer', lugar: 'el bosque al amanecer', encuadre: 'gran plano general', luz: 'primera luz gris azulada entre los troncos', descripcion: 'Troncos altos y niebla baja entre ellos, rodado a través de unas ramas en primer término que tapan medio cuadro; suelo cubierto de hojarasca húmeda.' },
  { id: 'pasillo-juzgado', lugar: 'el pasillo del juzgado', encuadre: 'plano general', luz: 'ventanal lateral, luz dura y plana, suelo brillante', descripcion: 'Un pasillo largo con bancos de madera vacíos, visto desde una esquina y descentrado; una figura pequeña al fondo, de espaldas y desenfocada.' },
  { id: 'lapida', lugar: 'el cementerio', encuadre: 'plano medio', luz: 'tarde encapotada, sin sombras marcadas', descripcion: 'Una lápida modesta de piedra sin inscripción legible, vista en escorzo desde muy cerca del suelo; hierba y una maceta volcada en primer término, desenfocadas.' },
  { id: 'laboratorio', lugar: 'el laboratorio forense', encuadre: 'detalle', luz: 'lámpara de trabajo blanca desde arriba, fondo oscuro', descripcion: 'Una bandeja de acero con instrumental y una bolsa de pruebas, vista muy de cerca y en diagonal; unas manos enguantadas entrando por el borde del cuadro.' },
  { id: 'comisaria-noche', lugar: 'la comisaría de noche', encuadre: 'plano general', luz: 'interiores encendidos vistos desde fuera, calle a oscuras', descripcion: 'La fachada de un edificio bajo con las ventanas iluminadas, rodada desde la acera de enfrente a través de la luna mojada de un coche.' },
  { id: 'casa-precintada', lugar: 'la casa precintada', encuadre: 'plano general', luz: 'mediodía plano de invierno, cielo blanco', descripcion: 'La fachada de una casa de dos plantas con las persianas bajadas y una cinta cruzando la puerta, vista desde el otro lado de una valla que ocupa el primer término.' },
  { id: 'sala-espera', lugar: 'la sala de espera', encuadre: 'plano general', luz: 'fluorescente frío, sin ventanas', descripcion: 'Sillas de plástico unidas en fila, vacías, vistas desde el rincón y muy descentradas; una máquina expendedora apagada al fondo, fuera de foco.' },
  { id: 'rio-turbio', lugar: 'la orilla del río', encuadre: 'plano general', luz: 'atardecer sin sol, agua gris', descripcion: 'Agua turbia moviéndose despacio contra un talud de barro, rodada desde muy cerca de la superficie; cañas desenfocadas cruzando el primer término.' },
  { id: 'nave-abandonada', lugar: 'la nave abandonada', encuadre: 'gran plano general', luz: 'huecos de claraboya rota, haces polvorientos sobre el suelo', descripcion: 'Una nave industrial vacía con el suelo cubierto de escombro, vista desde el interior de un portón; el marco del portón tapa los bordes del cuadro.' },
  { id: 'telefono-fijo', lugar: 'la mesa del teléfono', encuadre: 'detalle', luz: 'lámpara baja, alrededor en penumbra', descripcion: 'Un teléfono fijo antiguo sobre un mueble, con el cable colgando, visto muy de cerca y en escorzo; el resto de la habitación cae en negro.' },
  { id: 'ropa-tendida', lugar: 'un patio trasero', encuadre: 'plano medio', luz: 'viento y cielo cubierto, luz difusa', descripcion: 'Ropa tendida moviéndose en una cuerda, rodada a través de las propias telas que tapan parte del cuadro; al fondo, una pared con humedades.' },
  { id: 'coche-parado', lugar: 'un coche parado en el arcén', encuadre: 'plano general', luz: 'noche cerrada, intermitentes ámbar', descripcion: 'Un coche detenido con la puerta abierta y la luz interior encendida, visto desde lejos y desde abajo; hierba alta en primer término tapando las ruedas.' },
  { id: 'cinta-casete', lugar: 'la grabadora del interrogatorio', encuadre: 'detalle', luz: 'una sola bombilla desnuda encima de la mesa', descripcion: 'Una grabadora de casete sobre una mesa metálica, con las bobinas girando, vista casi a ras de mesa y con el borde de la mesa desenfocado delante.' },
  { id: 'escalera-sotano', lugar: 'la escalera del sótano', encuadre: 'plano general', luz: 'luz que baja desde arriba, el fondo en negro absoluto', descripcion: 'Unos peldaños de hormigón bajando hacia la oscuridad, vistos desde arriba y en diagonal; la barandilla oxidada cruza el primer término.' },
  { id: 'mapa-chinchetas', lugar: 'el mapa de la investigación', encuadre: 'plano medio', luz: 'flexo lateral, papel amarillento', descripcion: 'Un mapa clavado en un corcho con chinchetas y cordel entre ellas, visto muy en escorzo desde un lado; ninguna palabra legible, solo el trazado.' },
  { id: 'lluvia-ventana', lugar: 'una ventana con lluvia', encuadre: 'detalle', luz: 'gris de tarde, luces de calle desenfocadas detrás', descripcion: 'Gotas resbalando por un cristal, muy cerca y enfocadas, con la calle detrás convertida en manchas de luz.' },
];

export const GENERO_POR_DEFECTO = 'crimen-frio';

export const generoPorId = (id) =>
  GENEROS.find((g) => g.id === id) || GENEROS.find((g) => g.id === GENERO_POR_DEFECTO);
