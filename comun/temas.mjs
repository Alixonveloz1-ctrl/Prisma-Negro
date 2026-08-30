// El catálogo de temas del canal.
//
// UN TEMA ES UN TERRENO: dice de qué va el episodio que se va a inventar, no
// afirma que nada ocurriera. Los nombres decían «Crímenes reales», «Terror real»,
// «Experimentos médicos reales» y se contradecían solos — un experimento médico
// inventado no es un «experimento médico real».
//
// Cada tema llevaba además un campo `busca` con los términos por los que salir a
// internet. Se fue con la búsqueda: aquí ya no se busca nada, se inventa.

export const TEMAS = [
  {
    grupo: 'Crimen',
    icono: '🔎',
    temas: [
      { id: 'crimen-sin-resolver', nombre: 'Crímenes sin resolver' },
      { id: 'adn-decadas', nombre: 'Resueltos por ADN años después' },
      { id: 'desapariciones', nombre: 'Desapariciones sin explicar' },
      { id: 'secuestros', nombre: 'Secuestros y rescates' },
      { id: 'serie', nombre: 'Asesinos en serie' },
      { id: 'feminicidios', nombre: 'Casos de mujeres desaparecidas' },
      { id: 'narco', nombre: 'Narcotráfico y ajustes de cuentas' },
    ],
  },
  {
    grupo: 'Misterio',
    icono: '🌑',
    temas: [
      { id: 'naturaleza', nombre: 'Desapariciones en la naturaleza' },
      { id: 'barcos-aviones', nombre: 'Barcos y aviones perdidos' },
      { id: 'lugares', nombre: 'Lugares abandonados con historia' },
      { id: 'cifrados', nombre: 'Mensajes y códigos sin descifrar' },
      { id: 'desclasificado', nombre: 'Documentos desclasificados' },
      { id: 'hallazgos', nombre: 'Hallazgos que cambiaron un caso' },
    ],
  },
  {
    grupo: 'Terror',
    icono: '🕯️',
    temas: [
      { id: 'experimentos', nombre: 'Experimentos médicos' },
      { id: 'psiquiatricos', nombre: 'Hospitales e instituciones' },
      { id: 'sectas-violentas', nombre: 'Sectas y rituales' },
      { id: 'supervivencia', nombre: 'Supervivencia extrema' },
      { id: 'sucesos-masivos', nombre: 'Tragedias colectivas' },
    ],
  },
  {
    grupo: 'Polémicas de artistas',
    icono: '🎤',
    temas: [
      { id: 'muertes-musicos', nombre: 'Muertes de artistas sin aclarar' },
      { id: 'juicios-famosos', nombre: 'Juicios mediáticos' },
      { id: 'caidas', nombre: 'Caídas en desgracia' },
      { id: 'industria', nombre: 'Escándalos de la industria musical' },
      { id: 'hollywood', nombre: 'Denuncias y encubrimientos' },
      { id: 'rivalidades', nombre: 'Rivalidades que acabaron mal' },
      { id: 'fortunas', nombre: 'Fortunas perdidas' },
      { id: 'desapariciones-fama', nombre: 'Estrellas que desaparecieron' },
    ],
  },
  {
    grupo: 'Sectas y manipulación',
    icono: '👁️',
    temas: [
      { id: 'lideres', nombre: 'Líderes de sectas y su final' },
      { id: 'piramidales', nombre: 'Estafas piramidales' },
      { id: 'gurus', nombre: 'Gurús y coaching tóxico' },
    ],
  },
  {
    grupo: 'Fraudes e impostores',
    icono: '🎭',
    temas: [
      { id: 'estafas', nombre: 'Estafas millonarias' },
      { id: 'impostores', nombre: 'Impostores que engañaron a todos' },
      { id: 'arte', nombre: 'Falsificadores de arte' },
      { id: 'cripto', nombre: 'Criptoestafas' },
    ],
  },
  {
    grupo: 'Catástrofes y encubrimientos',
    icono: '⚠️',
    temas: [
      { id: 'evitables', nombre: 'Accidentes que se pudieron evitar' },
      { id: 'corporativos', nombre: 'Negligencias corporativas' },
      { id: 'encubrimientos', nombre: 'Encubrimientos oficiales' },
      { id: 'industriales', nombre: 'Desastres industriales' },
    ],
  },
  {
    grupo: 'Internet y era digital',
    icono: '📱',
    temas: [
      { id: 'virales', nombre: 'Casos virales que acabaron mal' },
      { id: 'influencers', nombre: 'Caídas de influencers' },
      { id: 'ciberdelito', nombre: 'Ciberdelincuencia' },
      { id: 'acoso-red', nombre: 'Acoso y comunidades tóxicas' },
    ],
  },
];

/**
 * Las épocas.
 *
 * Sin acotar la época, la búsqueda devuelve lo más publicado, y lo más publicado es
 * lo más viejo: un caso de 1888 lleva siglo y medio escribiéndose y uno de hace dos
 * años todavía no. Por eso el valor por defecto es reciente, no «cualquiera».
 */
export const EPOCAS = [
  { id: 'muy-reciente', nombre: 'Últimos 5 años', desde: () => new Date().getFullYear() - 5 },
  { id: 'reciente', nombre: 'Últimos 15 años', desde: () => new Date().getFullYear() - 15 },
  { id: 'moderna', nombre: 'Del año 2000 en adelante', desde: () => 2000 },
  { id: 'contemporanea', nombre: 'De 1980 en adelante', desde: () => 1980 },
  { id: 'cualquiera', nombre: 'Cualquier época', desde: () => null },
];

export const EPOCA_POR_DEFECTO = 'reciente';

export const temaPorId = (id) => TEMAS.flatMap((g) => g.temas).find((t) => t.id === id) || null;
export const epocaPorId = (id) => EPOCAS.find((e) => e.id === id) || EPOCAS.find((e) => e.id === EPOCA_POR_DEFECTO);
