// El catálogo de temas del canal.
//
// Sin esto, «busca casos reales» sale a internet sin rumbo y devuelve lo que más
// escrito está, que casi siempre es lo más antiguo: los casos del XIX llevan cien
// años publicados y los de anteayer todavía no. Por eso hay que decirle DÓNDE
// buscar y DE CUÁNDO.
//
// El canal va de misterio, terror, crimen y polémicas de artistas. El catálogo es
// eso, no una lista genérica de «temas interesantes».

export const TEMAS = [
  {
    grupo: 'Crímenes reales',
    icono: '🔎',
    temas: [
      { id: 'crimen-sin-resolver', nombre: 'Crímenes sin resolver', busca: 'casos criminales sin resolver, investigaciones abiertas, cold cases' },
      { id: 'adn-decadas', nombre: 'Resueltos por ADN años después', busca: 'casos resueltos décadas después por ADN o genealogía genética' },
      { id: 'desapariciones', nombre: 'Desapariciones sin explicar', busca: 'personas desaparecidas sin explicación, búsquedas fallidas' },
      { id: 'secuestros', nombre: 'Secuestros y rescates', busca: 'secuestros reales, rescates, cautiverios prolongados' },
      { id: 'serie', nombre: 'Asesinos en serie', busca: 'asesinos en serie, investigaciones policiales, perfiles criminales' },
      { id: 'feminicidios', nombre: 'Casos de mujeres desaparecidas', busca: 'desapariciones de mujeres, feminicidios investigados, búsqueda de justicia' },
      { id: 'narco', nombre: 'Narcotráfico y ajustes de cuentas', busca: 'narcotráfico, operativos, capos, ajustes de cuentas documentados' },
    ],
  },
  {
    grupo: 'Misterio',
    icono: '🌑',
    temas: [
      { id: 'naturaleza', nombre: 'Desapariciones en la naturaleza', busca: 'desapariciones en parques nacionales, montañas, bosques' },
      { id: 'barcos-aviones', nombre: 'Barcos y aviones perdidos', busca: 'aeronaves y embarcaciones desaparecidas, restos hallados' },
      { id: 'lugares', nombre: 'Lugares abandonados con historia', busca: 'lugares abandonados con sucesos documentados, pueblos fantasma' },
      { id: 'cifrados', nombre: 'Mensajes y códigos sin descifrar', busca: 'mensajes cifrados sin resolver, criptogramas, cartas anónimas' },
      { id: 'desclasificado', nombre: 'Documentos desclasificados', busca: 'archivos desclasificados, informes gubernamentales liberados' },
      { id: 'hallazgos', nombre: 'Hallazgos que cambiaron un caso', busca: 'hallazgos forenses, pruebas encontradas años después' },
    ],
  },
  {
    grupo: 'Terror real',
    icono: '🕯️',
    temas: [
      { id: 'experimentos', nombre: 'Experimentos médicos reales', busca: 'experimentos médicos sin consentimiento, ensayos clínicos denunciados' },
      { id: 'psiquiatricos', nombre: 'Hospitales e instituciones', busca: 'abusos en instituciones psiquiátricas, internados, denuncias' },
      { id: 'sectas-violentas', nombre: 'Sectas y rituales', busca: 'sectas con víctimas, rituales violentos, cultos investigados' },
      { id: 'supervivencia', nombre: 'Supervivencia extrema', busca: 'supervivientes de catástrofes, casos extremos documentados' },
      { id: 'sucesos-masivos', nombre: 'Tragedias colectivas', busca: 'avalanchas humanas, incendios en locales, tragedias en eventos' },
    ],
  },
  {
    grupo: 'Polémicas de artistas',
    icono: '🎤',
    temas: [
      { id: 'muertes-musicos', nombre: 'Muertes de artistas sin aclarar', busca: 'muertes de músicos y artistas con circunstancias discutidas, investigaciones' },
      { id: 'juicios-famosos', nombre: 'Juicios mediáticos', busca: 'juicios a famosos, demandas mediáticas, sentencias contra celebridades' },
      { id: 'caidas', nombre: 'Caídas en desgracia', busca: 'caída pública de celebridades, cancelaciones, escándalos con consecuencias' },
      { id: 'industria', nombre: 'Escándalos de la industria musical', busca: 'contratos abusivos, denuncias en la industria musical, disputas por derechos' },
      { id: 'hollywood', nombre: 'Denuncias y encubrimientos', busca: 'denuncias de abuso en la industria del entretenimiento, encubrimientos' },
      { id: 'rivalidades', nombre: 'Rivalidades que acabaron mal', busca: 'enfrentamientos entre artistas con consecuencias reales, disputas públicas' },
      { id: 'fortunas', nombre: 'Fortunas perdidas', busca: 'artistas arruinados, quiebras de celebridades, malas gestiones' },
      { id: 'desapariciones-fama', nombre: 'Estrellas que desaparecieron', busca: 'artistas que se retiraron o desaparecieron de la vida pública' },
    ],
  },
  {
    grupo: 'Sectas y manipulación',
    icono: '👁️',
    temas: [
      { id: 'lideres', nombre: 'Líderes de sectas y su final', busca: 'líderes de sectas, procesos judiciales, disolución de cultos' },
      { id: 'piramidales', nombre: 'Estafas piramidales', busca: 'esquemas piramidales, multinivel con denuncias, víctimas' },
      { id: 'gurus', nombre: 'Gurús y coaching tóxico', busca: 'gurús de autoayuda denunciados, coaching con víctimas' },
    ],
  },
  {
    grupo: 'Fraudes e impostores',
    icono: '🎭',
    temas: [
      { id: 'estafas', nombre: 'Estafas millonarias', busca: 'grandes fraudes financieros, estafadores condenados' },
      { id: 'impostores', nombre: 'Impostores que engañaron a todos', busca: 'impostores, suplantaciones de identidad, falsos profesionales' },
      { id: 'arte', nombre: 'Falsificadores de arte', busca: 'falsificación de obras de arte, peritajes, subastas fraudulentas' },
      { id: 'cripto', nombre: 'Criptoestafas', busca: 'fraudes con criptomonedas, exchanges colapsados, rug pulls' },
    ],
  },
  {
    grupo: 'Catástrofes y encubrimientos',
    icono: '⚠️',
    temas: [
      { id: 'evitables', nombre: 'Accidentes que se pudieron evitar', busca: 'accidentes con negligencia probada, informes de investigación' },
      { id: 'corporativos', nombre: 'Negligencias corporativas', busca: 'negligencia empresarial con víctimas, demandas colectivas' },
      { id: 'encubrimientos', nombre: 'Encubrimientos oficiales', busca: 'encubrimientos gubernamentales destapados, filtraciones' },
      { id: 'industriales', nombre: 'Desastres industriales', busca: 'desastres industriales, vertidos, explosiones en plantas' },
    ],
  },
  {
    grupo: 'Internet y era digital',
    icono: '📱',
    temas: [
      { id: 'virales', nombre: 'Casos virales que acabaron mal', busca: 'retos virales con víctimas, casos de internet con consecuencias reales' },
      { id: 'influencers', nombre: 'Caídas de influencers', busca: 'influencers denunciados, escándalos de creadores de contenido' },
      { id: 'ciberdelito', nombre: 'Ciberdelincuencia', busca: 'hackeos, filtraciones masivas, delitos informáticos juzgados' },
      { id: 'acoso-red', nombre: 'Acoso y comunidades tóxicas', busca: 'acoso en línea con consecuencias, comunidades tóxicas investigadas' },
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
