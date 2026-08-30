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
    personajes: [
      'perito forense',
      'detective veterano',
      'testigo del hallazgo',
      'familiar de la víctima',
    ],
  },
];

export const GENERO_POR_DEFECTO = 'crimen-frio';

export const generoPorId = (id) =>
  GENEROS.find((g) => g.id === id) || GENEROS.find((g) => g.id === GENERO_POR_DEFECTO);
