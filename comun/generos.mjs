// El catálogo de géneros.
//
// (El estilo visual NO está aquí: es del canal entero y vive en `comun/estilos.mjs`
// como `ESTILO_DEL_CANAL`. Cada género traía un `estiloPorDefecto` que no leía
// ninguna fase —una declaración que parecía conectada y no lo estaba— y se quitó al
// fijar el estilo del canal.)
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
// Cada género declara tres cosas:
//
//   bloques      — la estructura del episodio, en proporciones que suman 1. Los
//                  minutos que pida el usuario se reparten con esos pesos.
//   motivos      — los planos que en este género VUELVEN. No es una lista de
//                  ahorro: es cómo se monta el género.
//   personajes   — QUÉ PAPELES del elenco del canal declaran en este género, por
//                  su clave. El elenco vive en `comun/elenco.mjs` porque es del
//                  canal y no de un género: un perito forense es el mismo papel
//                  en un crimen frío que en un terror real, y declararlo dos
//                  veces sería tener dos peritos donde hay uno —y pagarlos—.

import { arquetipoPorId as arquetipo } from './elenco.mjs';

export const GENEROS = [
  {
    id: 'crimen-frio',
    nombre: 'Crimen frío',
    resumen: 'Cuerpo oculto, décadas, reapertura por tecnología nueva.',

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

    // Los papeles del elenco que declaran en este género, por su clave. Cada dos
    // o tres minutos entra uno, y cada papel tiene VARIAS PERSONAS: la biblioteca
    // las genera todas una vez y el reparto rota entre ellas para que el mismo
    // perito no salga en tres episodios seguidos.
    personajes: ['perito', 'detective', 'testigo', 'familiar', 'policia', 'medico'],
  },

  {
    id: 'desaparicion',
    nombre: 'Desaparición',
    resumen: 'Alguien sale de casa y no llega. La búsqueda, y lo que la búsqueda destapa.',
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
    personajes: ['coordinador', 'policia', 'testigo', 'familiar', 'perito', 'periodista'],
  },

  {
    id: 'terror-real',
    nombre: 'Terror real',
    resumen: 'Una institución, un experimento, un lugar. Lo que se hizo con permiso.',
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
    personajes: ['interno', 'enfermera', 'periodista', 'abogado', 'medico', 'testigo'],
  },

  {
    id: 'secta',
    nombre: 'Secta',
    resumen: 'Un líder, una comunidad y la puerta que deja de abrirse por dentro.',
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
    personajes: ['exmiembro', 'familiar', 'investigador', 'fiscal', 'periodista', 'testigo'],
  },

  {
    id: 'supervivencia',
    nombre: 'Supervivencia',
    resumen: 'Se sale de casa por la mañana y a mediodía todo ha dejado de funcionar.',
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
    personajes: ['superviviente', 'rescatador', 'medico', 'familiar', 'testigo', 'coordinador'],
  },
];

// Los recursos y el elenco viven en `comun/elenco.mjs` y se reexportan aquí para
// que quien ya importaba el catálogo no tenga que saber que se partió en dos.
export { ELENCO, RECURSOS, arquetipoPorId, recursoPorId, planoDeVariante, planoDeRecurso,
  sitioDeVariante, EPISODIOS_SIN_REPETIR, VERSIONES_MINIMAS, SITIOS_MINIMOS } from './elenco.mjs';

/** Los papeles del elenco que usa un género, resueltos ya a sus entradas. */
export function personajesDe(genero) {
  return (genero?.personajes || []).map((id) => arquetipo(id)).filter(Boolean);
}

export const GENERO_POR_DEFECTO = 'crimen-frio';

export const generoPorId = (id) =>
  GENEROS.find((g) => g.id === id) || GENEROS.find((g) => g.id === GENERO_POR_DEFECTO);
