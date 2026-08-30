// Fase 1 — Investigación (§4.1 y §8.1 del plano).
//
//   «Produce FICHAS: hecho + fuente + fecha + cita textual. El guion se escribe
//    después, y cada afirmación del guion apunta a una ficha. Sin esto no hay
//    documental, hay opinión.»
//
// Es la fase que NO existe en el proyecto de origen y hay que construir. También es
// la que distingue esta herramienta de un generador de videos bonitos: sin el
// almacén de fichas, cuando alguien discuta un dato hay que releerlo todo.

import { llamar } from '../api.js';

// ── Paso 1: buscar casos reales ───────────────────────────────────────────────
//
// Antes de que haya tema, hay una BÚSQUEDA. La herramienta sale a internet, trae
// cinco casos reales que dan para documental, y la persona elige uno. De ahí en
// adelante todo lo demás cuelga de esa elección.
//
// Se busca de verdad —con la herramienta de búsqueda del modelo—, no de memoria: un
// modelo recordando casos inventa fechas y nombres con total aplomo, y en un
// documental eso es el fallo que hunde el canal (§8.2).

const ESQUEMA_CASOS = {
  type: 'object',
  properties: {
    casos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          gancho: { type: 'string' },
          sinopsis: { type: 'string' },
          cuando: { type: 'string' },
          donde: { type: 'string' },
          porQueFunciona: { type: 'string' },
          imagenSugerida: { type: 'string' },
          documentado: { type: 'boolean' },
        },
        required: ['titulo', 'gancho', 'sinopsis', 'cuando', 'donde', 'porQueFunciona', 'imagenSugerida', 'documentado'],
      },
    },
  },
  required: ['casos'],
};

/**
 * Trae cinco casos reales entre los que elegir.
 *
 * `tema` es opcional: sin él busca casos abiertos; con él, casos de ese terreno.
 */
export async function buscarCasos({ tema = null, epoca = null, evitar = [], cuantos = 5, senal } = {}) {
  const yaVistos = evitar.length
    ? `\n\nNO propongas ninguno de estos, ya se descartaron:\n${evitar.slice(-25).map((t) => `- ${t}`).join('\n')}`
    : '';

  // La época va DURA en la instrucción y repetida al final.
  //
  // Sin acotarla, la búsqueda devuelve lo más publicado, y lo más publicado es lo
  // más viejo: un caso de 1888 lleva siglo y medio escribiéndose y uno de hace dos
  // años todavía no. Salían casos del XIX una y otra vez por esto.
  const desde = epoca?.desde?.() ?? null;
  const corte = desde
    ? `\n\nLÍMITE DE FECHA, y es obligatorio: los hechos tienen que haber ocurrido ` +
      `DE ${desde} EN ADELANTE. Un caso anterior a ${desde} no vale aunque sea bueno. ` +
      `Si no encuentras cinco de ese periodo, devuelve menos, pero NINGUNO anterior.`
    : '';

  const r = await llamar(
    'texto',
    {
      // La búsqueda de verdad. Sin esto el modelo tira de memoria y se inventa las
      // fechas con una seguridad que engaña.
      buscarEnInternet: true,
      sistema:
        'Eres documentalista de investigación de un canal de documentales de misterio, ' +
        'crimen real y polémicas del mundo del espectáculo. Buscas casos REALES, ' +
        'comprobables y documentados en fuentes públicas, que den para un documental ' +
        'corto de 8 a 15 minutos.\n\n' +
        'Reglas:\n' +
        '- Solo casos REALES. Nada de leyendas urbanas presentadas como hechos, ni ' +
        'creepypastas, ni casos inventados. Si algo es folclore, no lo propongas.\n' +
        '- Que estén documentados: prensa, expedientes judiciales, informes policiales, ' +
        'archivos oficiales, investigaciones periodísticas.\n' +
        '- Evita casos cuya única fuente sea un vídeo viral o un foro.\n' +
        '- No propongas casos con menores identificables implicados.\n' +
        '- Con personas vivas, cíñete a lo que consta en resoluciones públicas o en ' +
        'prensa de referencia; nada de acusaciones no probadas.\n' +
        '- Variedad: que no sean todos del mismo tipo ni del mismo país.',
      instruccion:
        (tema
          ? `Busca casos reales de este terreno: ${tema.nombre}.\n` +
            `Términos por los que buscar: ${tema.busca}.\n\n`
          : 'Busca casos reales llamativos y bien documentados de misterio, crimen real ' +
            'o polémicas de figuras públicas.\n\n') +
        corte +
        `\n\nDevuelve ${cuantos} casos.\n\n` +
        'Para cada uno:\n' +
        '- titulo: título del documental, corto y concreto. Sin signos de exclamación.\n' +
        '- gancho: una frase de lo que engancha, sin exagerar ni prometer de más.\n' +
        '- sinopsis: 2 o 3 frases de qué pasó.\n' +
        '- cuando: el AÑO en que ocurrió. Obligatorio y real.\n' +
        '- donde: lugar real.\n' +
        '- porQueFunciona: por qué da para documental visual.\n' +
        '- imagenSugerida: descripción visual para la portada, SIN rostros de personas ' +
        'reales identificables.\n' +
        '- documentado: true solo si de verdad hay fuentes públicas sólidas.\n\n' +
        'Responde ÚNICAMENTE con un objeto JSON así:\n' +
        '{"casos":[{"titulo":"","gancho":"","sinopsis":"","cuando":"","donde":"",' +
        '"porQueFunciona":"","imagenSugerida":"","documentado":true}]}' +
        yaVistos +
        (desde ? `\n\nRECUERDA: nada anterior a ${desde}.` : ''),
      esquema: ESQUEMA_CASOS,
      temperatura: 0.85,
      maxTokens: 6000,
    },
    { senal, reintentos: 1 },
  );

  const casos = (r.json?.casos || []).slice(0, cuantos).map((c, i) => ({
    id: `c${Date.now().toString(36)}${i}`,
    titulo: c.titulo || 'Sin título',
    gancho: c.gancho || '',
    sinopsis: c.sinopsis || '',
    cuando: c.cuando || '',
    donde: c.donde || '',
    porQueFunciona: c.porQueFunciona || '',
    imagenSugerida: c.imagenSugerida || '',
    documentado: c.documentado !== false,
    // Las fuentes que el modelo consultó de verdad, para poder volver a ellas.
    fuentes: r.fuentes || [],
  }));

  if (!casos.length) {
    throw new Error('La búsqueda no devolvió ningún caso. Prueba otra vez, o acota el tema.');
  }

  // El filtro de época se aplica TAMBIÉN aquí, sobre lo que vuelve.
  //
  // Decírselo al modelo ayuda pero no obliga: cuela casos viejos igual, sobre todo
  // si son famosos. Comprobarlo en el código es lo único que de verdad lo impide, y
  // se dice cuántos se cayeron para que no parezca que la búsqueda vino floja.
  if (!desde) return { casos, descartados: 0 };

  const dentro = casos.filter((c) => {
    const anio = Number(String(c.cuando).match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1]);
    return !anio || anio >= desde;
  });
  return { casos: dentro, descartados: casos.length - dentro.length, desde };
}

// ── Paso 2: la investigación exhaustiva del caso elegido ──────────────────────
//
// La búsqueda del paso 1 es de reconocimiento: mira por encima y trae cinco
// opciones. Esta es otra cosa. Sobre el caso ya elegido se buscan SEIS ÁNGULOS
// distintos, cada uno por separado, porque una sola pregunta trae una sola versión
// —normalmente la del primer resultado— y un documental que se apoya en una sola
// versión es un resumen de Wikipedia con voz grave.
//
// Cada ficha guarda de qué TIPO es su fuente. Un dato de una sentencia y un dato de
// un blog no valen lo mismo, y el guion tiene que poder distinguirlos.

const ANGULOS = [
  {
    id: 'cronologia',
    nombre: 'Cronología',
    pide:
      'La secuencia exacta de los hechos: fechas, horas, lugares y nombres. ' +
      'Qué pasó primero y qué después. Datos duros, no interpretación.',
  },
  {
    id: 'oficial',
    nombre: 'Fuentes oficiales',
    pide:
      'Lo que consta en documentación OFICIAL: informes policiales, atestados, ' +
      'expedientes judiciales, sentencias, autopsias, informes forenses, actas, ' +
      'comisiones de investigación, registros públicos. Cita el documento concreto.',
  },
  {
    id: 'prensa',
    nombre: 'Prensa e investigación periodística',
    pide:
      'Lo publicado por medios de referencia e investigaciones periodísticas serias. ' +
      'Distingue lo que el medio verificó de lo que solo recogió de terceros.',
  },
  {
    id: 'discutido',
    nombre: 'Lo que se discute',
    pide:
      'Las versiones EN CONFLICTO: qué se afirma sin haberse probado, qué desmintió ' +
      'quién, qué quedó sin aclarar, qué teorías circulan sin respaldo. Marca todo ' +
      'esto como incierto.',
  },
  {
    id: 'cifras',
    nombre: 'Datos y cifras',
    pide:
      'Cifras concretas y comprobables: cantidades, importes, duraciones, distancias, ' +
      'número de personas, resultados de pruebas. Con su unidad y su fuente.',
  },
  {
    id: 'despues',
    nombre: 'Qué pasó después',
    pide:
      'El estado ACTUAL: condenas, absoluciones, recursos, indemnizaciones, reformas ' +
      'legales, reapertura del caso, dónde está hoy cada implicado. Lo más reciente.',
  },
];

const ESQUEMA_FICHAS = {
  type: 'object',
  properties: {
    fichas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          afirmacion: { type: 'string' },
          fuente: { type: 'string' },
          tipoFuente: {
            type: 'string',
            enum: ['oficial', 'judicial', 'policial', 'prensa', 'academica', 'testimonio', 'otra'],
          },
          fecha: { type: 'string' },
          cita: { type: 'string' },
          enlace: { type: 'string' },
          fiabilidad: { type: 'string', enum: ['alta', 'media', 'baja', 'sin calificar'] },
          incierto: { type: 'boolean' },
        },
        required: ['afirmacion', 'fuente', 'tipoFuente', 'fecha', 'cita', 'fiabilidad', 'incierto'],
      },
    },
  },
  required: ['fichas'],
};

/** Un ángulo. Se expone suelto para que la cola cuente el progreso por ángulos. */
export async function investigarAngulo({ caso, angulo, senal }) {
  const r = await llamar(
    'texto',
    {
      buscarEnInternet: true,
      sistema:
        'Eres el documentalista de un equipo de investigación. Tu trabajo NO es ' +
        'escribir, es DOCUMENTAR con fuentes verificables.\n\n' +
        'Reglas que no se negocian:\n' +
        '- Cada ficha es UN hecho comprobable, no una valoración ni un resumen.\n' +
        '- La cita es TEXTUAL de la fuente. Si no puedes citar, la ficha no vale.\n' +
        '- La fuente se nombra con precisión: medio y fecha, número de expediente, ' +
        'órgano judicial, título del informe. «Varios medios» no es una fuente.\n' +
        '- tipoFuente dice de qué clase es: oficial, judicial, policial, prensa, ' +
        'academica, testimonio, otra. Sé honesto: un blog es «otra».\n' +
        '- Si un dato es disputado o no lo puedes sostener, incierto=true y dilo en la ' +
        'propia afirmación.\n' +
        '- NO inventes enlaces ni números de expediente. Si no lo tienes, deja vacío.\n' +
        '- Si de este ángulo hay poco, devuelve MENOS fichas. Nadie te pide llenar un cupo.',
      instruccion:
        `CASO: ${caso.titulo}\n` +
        `${caso.sinopsis}\n` +
        `Cuándo: ${caso.cuando} · Dónde: ${caso.donde}\n\n` +
        `ÁNGULO DE ESTA BÚSQUEDA — ${angulo.nombre}:\n${angulo.pide}\n\n` +
        'Busca en internet y devuelve las fichas de ESTE ángulo, hasta 8.\n\n' +
        'Responde ÚNICAMENTE con un objeto JSON así:\n' +
        '{"fichas":[{"afirmacion":"","fuente":"","tipoFuente":"prensa","fecha":"",' +
        '"cita":"","enlace":"","fiabilidad":"alta","incierto":false}]}',
      esquema: ESQUEMA_FICHAS,
      temperatura: 0.25,
      maxTokens: 7000,
    },
    { senal, reintentos: 1 },
  );

  return (r.json?.fichas || []).map((f) => ({
    id: `f${Math.random().toString(36).slice(2, 9)}`,
    angulo: angulo.id,
    afirmacion: f.afirmacion || '',
    fuente: f.fuente || '',
    tipoFuente: f.tipoFuente || 'otra',
    fecha: f.fecha || '',
    cita: f.cita || '',
    // Los enlaces que el modelo consultó de verdad valen más que los que escribe:
    // los primeros existen, los segundos a veces no.
    enlace: f.enlace || '',
    fiabilidad: f.fiabilidad || 'sin calificar',
    incierto: !!f.incierto,
    consultadas: r.fuentes || [],
  }));
}

export const ANGULOS_DE_INVESTIGACION = ANGULOS;

// ── Paso 2 bis: el modo CONSTRUIR ─────────────────────────────────────────────
//
// La fase conserva su forma —devuelve fichas— y gana un modo. En `construir` no
// busca nada: fabrica el expediente de un caso que no ocurrió y lo entrega como
// fichas, para que el guion se apoye en ellas exactamente igual que antes.
//
// ─────────────────────────────────────────────────────────────────────────────
// Y ES UNA SOLA LLAMADA, A PROPÓSITO.
//
// La investigación documental va por seis ángulos separados porque una sola
// pregunta trae una sola versión. Aquí es al revés: seis llamadas construirían
// seis casos que se contradicen entre sí, y ese es EXACTAMENTE el fallo que esto
// existe para evitar —el detective que se llama Roger en el minuto doce y Robert
// en el treinta y dos—. El caso se inventa entero de una vez o no se sostiene.
//
// La temperatura sube a 0.9. Con 0.25, que es la de documentar, salen casos
// genéricos: el cuerpo en el bosque, la mujer que desapareció volviendo a casa.
// Lo que engancha es el contenedor imposible y la ficha de latón con su número.
// ─────────────────────────────────────────────────────────────────────────────

/** Los papeles que juega una ficha construida dentro del caso. */
export const ROLES_DE_FICHA = [
  'victima', 'sospechoso', 'testigo', 'objeto', 'lugar', 'fecha', 'pistafalsa', 'revelacion',
];

const ESQUEMA_CONSTRUIDO = {
  type: 'object',
  properties: {
    fichas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          afirmacion: { type: 'string' },
          rol: { type: 'string', enum: ROLES_DE_FICHA },
          // La fecha se queda: un expediente sin fechas concretas no es un
          // expediente, y el lapso largo es medio género.
          fecha: { type: 'string' },
          // Y la cita también, pero cambia de significado: aquí no es la línea
          // literal de una fuente, es la línea literal que alguien DIJO dentro
          // del caso. Es de donde salen los testimonios del guion.
          cita: { type: 'string' },
        },
        required: ['afirmacion', 'rol', 'fecha', 'cita'],
      },
    },
  },
  required: ['fichas'],
};

const SISTEMA_CONSTRUIR = `Construyes el expediente de un caso que no ocurrió, para un
episodio de ficción documental declarada. No escribes el guion: construyes el
MATERIAL del que saldrá.

Devuelves fichas. Cada ficha es un elemento del caso, y entre todas tienen que
formar un caso que se sostenga solo.

LO QUE TIENE QUE HABER, SIEMPRE:
- Una víctima con nombre, edad, oficio y una razón por la que nadie la buscó.
- Un contenedor imposible: dónde estuvo el cuerpo y por qué nadie lo encontró.
  Un árbol, una pared, un pozo, un cilindro, un ascensor, un tanque.
- Un lapso largo y concreto. Entre veinte y cien años, con las dos fechas.
- Quien lo encuentra: nombre, edad, qué estaba haciendo esa mañana.
- Un objeto que guarda el secreto y que en su momento NO SE PUDO LEER: un papel
  apelmazado, una ficha corroída, un diente. Es lo que resolverá el caso al final.
- Un sospechoso de la pista falsa: alguien a quien todo señala y que el ADN
  descarta. Tiene que encajar de verdad — oficio, fecha, lugar, un rasgo físico.
- El culpable real, vinculado al objeto.
- La tecnología que lo resuelve décadas después, nombrada con precisión.

REGLAS
- Nombres, lugares y organismos COMPLETAMENTE INVENTADOS. Ni una persona real,
  ni una empresa real, ni un cuerpo policial real. El condado, el pueblo y el
  laboratorio se los inventa uno.
- Coherencia absoluta: un nombre, una fecha o una edad se escriben una vez y no
  cambian. Antes de cerrar, relee y comprueba que nada se contradice.
- Concreción de expediente. «Un objeto metálico» no vale; «una ficha de latón de
  la maderera, con el número 4417 estampado» sí.
- Nada de sobrenatural salvo que el género lo pida. Lo que engancha es que
  pudo pasar.

EL ROL de cada ficha dice qué papel juega: victima, sospechoso, testigo, objeto,
lugar, fecha, pistafalsa (lo que señala al inocente), revelacion (lo que resuelve).
La cita, cuando la pongas, es lo que alguien DIJO —una frase de persona, no de
informe—: de ahí salen los testimonios del episodio.`;

/**
 * Propone casos INVENTADOS entre los que elegir.
 *
 * Es el equivalente de `buscarCasos` para el modo construir, y devuelve la misma
 * forma para que la pantalla que los pinta no tenga que saber de dónde salieron.
 * No sale a internet: buscar casos reales para después inventarse otro sería pagar
 * una búsqueda que no se usa.
 */
export async function proponerCasos({ genero = null, tema = null, epoca = null, evitar = [], cuantos = 5, senal } = {}) {
  const yaVistos = evitar.length
    ? `\n\nNO propongas ninguno parecido a estos, ya se descartaron:\n${evitar.slice(-25).map((t) => `- ${t}`).join('\n')}`
    : '';

  const r = await llamar(
    'texto',
    {
      sistema:
        'Inventas premisas de episodio para un canal de ficción documental declarada. ' +
        'No son casos reales y no lo pretenden: son casos que PUDIERON pasar.\n\n' +
        'Reglas:\n' +
        '- Nombres, pueblos, condados y organismos completamente inventados. Ni una ' +
        'persona real, ni una empresa real, ni un cuerpo policial real.\n' +
        '- Que no se parezca a un caso real conocido: si suena a uno que existe, ' +
        'cámbialo. Se inventa, no se disfraza.\n' +
        '- Lo que engancha es que pudo pasar. Nada de sobrenatural salvo que el ' +
        'género lo pida.\n' +
        '- Concreción de expediente ya desde la sinopsis: el sitio imposible, el ' +
        'objeto, el lapso de años. «Un cuerpo aparece años después» no es una ' +
        'premisa; «un cuerpo dentro del tronco hueco de un roble, cuarenta y un ' +
        'años» sí.\n' +
        '- Variedad: cinco premisas distintas entre sí, no cinco versiones de una.',
      instruccion:
        (genero
          ? `GÉNERO: ${genero.nombre}. ${genero.resumen}\n` +
            `Motivos visuales del género: ${genero.motivos.join('; ')}.\n\n`
          : '') +
        (tema ? `Terreno: ${tema}\n\n` : '') +
        // LA ÉPOCA AQUÍ NO FILTRA NADA: no hay búsqueda que filtrar. Dice CUÁNDO
        // TRANSCURRE el caso que se inventa, y en un crimen frío eso es medio
        // género — el lapso entre los hechos y la reapertura es lo que hace que la
        // historia funcione. Sin decirlo, todos los casos salen ambientados ahora.
        (epoca?.desde?.()
          ? `ÉPOCA: los hechos arrancan DE ${epoca.desde()} EN ADELANTE. Si el género ` +
            `pide un lapso largo hasta la resolución, cuenta ese lapso desde ahí.\n\n`
          : '') +
        `Inventa ${cuantos} casos.\n\n` +
        'Para cada uno:\n' +
        '- titulo: título del episodio, corto y concreto. Sin signos de exclamación.\n' +
        '- gancho: una frase de lo que engancha, sin exagerar ni prometer de más.\n' +
        '- sinopsis: 2 o 3 frases de qué pasó, ya con el detalle concreto.\n' +
        '- cuando: los años, con el lapso. «1981, resuelto en 2022».\n' +
        '- donde: el lugar inventado.\n' +
        '- porQueFunciona: por qué da para episodio visual.\n' +
        '- imagenSugerida: descripción visual para la portada.\n' +
        '- documentado: false SIEMPRE. Esto es ficción declarada.\n\n' +
        'Responde ÚNICAMENTE con un objeto JSON así:\n' +
        '{"casos":[{"titulo":"","gancho":"","sinopsis":"","cuando":"","donde":"",' +
        '"porQueFunciona":"","imagenSugerida":"","documentado":false}]}' +
        yaVistos,
      esquema: ESQUEMA_CASOS,
      temperatura: 0.95,
      maxTokens: 6000,
    },
    { senal, reintentos: 1 },
  );

  const casos = (r.json?.casos || []).slice(0, cuantos).map((c, i) => ({
    id: `c${Date.now().toString(36)}${i}`,
    titulo: c.titulo || 'Sin título',
    gancho: c.gancho || '',
    sinopsis: c.sinopsis || '',
    cuando: c.cuando || '',
    donde: c.donde || '',
    porQueFunciona: c.porQueFunciona || '',
    imagenSugerida: c.imagenSugerida || '',
    // Un caso construido NO se marca como documentado, pase lo que pase: esa
    // pastilla verde en pantalla significa «hay fuentes públicas sólidas» y aquí
    // no las hay. Es ficción, y se dice.
    documentado: false,
    construido: true,
    fuentes: [],
  }));

  if (!casos.length) throw new Error('No salió ninguna premisa. Vuelve a darle.');
  return { casos, descartados: 0 };
}

/**
 * Construye el expediente completo de un caso inventado.
 *
 * `caso` es opcional: con él, se construye el expediente de ESE caso —el título y
 * la sinopsis que se eligieron—; sin él, se inventa entero desde el género y el
 * tema. `genero` viene del catálogo y decide qué tiene que haber.
 */
export async function construirCaso({ caso = null, genero = null, tema = null, cuantas = 30, senal }) {
  const r = await llamar(
    'texto',
    {
      sistema: SISTEMA_CONSTRUIR,
      instruccion:
        (genero
          ? `GÉNERO: ${genero.nombre}. ${genero.resumen}\n` +
            `La estructura del episodio será esta, y el expediente tiene que dar ` +
            `material para todos los bloques:\n` +
            genero.bloques.map((b) => `- ${b.nombre}: ${b.funcion}`).join('\n') +
            `\n\n`
          : '') +
        (caso
          ? `EL CASO QUE SE VA A CONTAR:\n${caso.titulo}\n${caso.sinopsis || ''}\n` +
            `Cuándo: ${caso.cuando || 'lo decides tú'} · Dónde: ${caso.donde || 'lo decides tú'}\n\n` +
            `Construye el expediente COMPLETO de este caso. Lo de arriba es el ` +
            `punto de partida; todo lo demás —los nombres, las fechas exactas, el ` +
            `objeto, el sospechoso falso, el culpable— lo decides tú y no puede ` +
            `contradecirlo.\n\n`
          : `Inventa el caso entero${tema ? `, dentro de este terreno: ${tema}` : ''}.\n\n`) +
        `Devuelve hasta ${cuantas} fichas. Empieza por la víctima, el lugar y las ` +
        `fechas; sigue por el hallazgo, el peritaje y la pista falsa; termina por ` +
        `el objeto, la revelación y el culpable. Ese orden importa: es el orden en ` +
        `que se va a contar.\n\n` +
        `Responde ÚNICAMENTE con un objeto JSON así:\n` +
        `{"fichas":[{"afirmacion":"","rol":"victima","fecha":"","cita":""}]}`,
      esquema: ESQUEMA_CONSTRUIDO,
      // Con 0.3 salen casos genéricos. Ver la cabecera.
      temperatura: 0.9,
      maxTokens: 16000,
    },
    { senal, reintentos: 1 },
  );

  return (r.json?.fichas || []).map((f, i) => ({
    id: `f${Math.random().toString(36).slice(2, 9)}`,
    afirmacion: f.afirmacion || '',
    rol: ROLES_DE_FICHA.includes(f.rol) ? f.rol : 'objeto',
    fecha: f.fecha || '',
    cita: f.cita || '',
    // El ORDEN en que se construyó es información: el modelo levantó el caso de
    // la víctima a la revelación, y ese es el orden en que se cuenta. Sin esto,
    // cualquier ordenación posterior lo perdería.
    orden: i,
    // Una ficha construida no tiene fuente ni fiabilidad, y decir que sí la tiene
    // sería la mentira que este proyecto no se puede permitir: se marca como lo
    // que es, y el pie de fuentes del episodio dice que el caso es ficción.
    construida: true,
    fuente: '',
    tipoFuente: 'otra',
    enlace: '',
    fiabilidad: 'sin calificar',
    incierto: false,
  }));
}

/**
 * Las fichas escritas para meterlas en una instrucción.
 *
 * Está aquí —y no repetido en el guion y en el director— porque las dos clases de
 * ficha se escriben distinto y hay que escribirlas igual en los dos sitios. Una
 * documentada lleva su fuente entre corchetes, que es lo que le dice al guion cómo
 * atribuir; una construida lleva su ROL, que es lo que le dice qué papel juega en
 * el caso. Componerlo en cada fase acabaría con dos formatos y una fase leyendo
 * «fuente: undefined».
 */
export function comoLista(fichas, { tope = 60 } = {}) {
  return ordenarFichas(fichas)
    .slice(0, tope)
    .map((f, i) =>
      f.construida
        ? `[${i}] (${f.rol}) ${f.afirmacion}` +
          `${f.fecha ? ` — ${f.fecha}` : ''}` +
          `${f.cita ? `\n    dijo: «${f.cita}»` : ''}`
        : `[${i}] ${f.afirmacion}\n` +
          `    fuente: ${f.fuente}${f.fecha ? ` (${f.fecha})` : ''} [${f.tipoFuente || 'otra'}]` +
          `${f.incierto ? ' — DISPUTADO, dilo como discutido' : ''}` +
          `${f.cita ? `\n    cita: «${f.cita}»` : ''}`,
    )
    .join('\n');
}

/**
 * El orden en que se le enseñan las fichas a un modelo.
 *
 * Documentadas: por solidez de la fuente. El modelo se apoya en lo primero que
 * lee, así que lo primero tiene que ser lo mejor sostenido —una sentencia antes
 * que un blog—.
 *
 * Construidas: EN EL ORDEN EN QUE SE CONSTRUYERON. No hay solidez que comparar
 * —se inventaron todas a la vez— y ese orden es el del caso: víctima, lugar,
 * fechas, hallazgo, pista falsa, revelación. Ordenarlas por «solidez» las barajaba
 * al azar, porque todas empatan.
 */
export function ordenarFichas(fichas) {
  const lista = [...(fichas || [])];
  if (lista.some((f) => f.construida)) {
    return lista.sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999));
  }
  const PESO = { oficial: 6, judicial: 6, policial: 5, academica: 4, prensa: 3, testimonio: 2, otra: 1 };
  const peso = (f) => (PESO[f.tipoFuente] || 1) - (f.incierto ? 2 : 0);
  return lista.sort((a, b) => peso(b) - peso(a));
}

/**
 * Junta fichas quitando las repetidas.
 *
 * Seis ángulos sobre el mismo caso repiten los hechos centrales —la fecha, el
 * lugar— y sin esto la lista sale con la misma afirmación cinco veces. Se quedan la
 * que tenga mejor fuente.
 */
export function fusionarFichas(listas) {
  const PESO = { oficial: 6, judicial: 6, policial: 5, academica: 4, prensa: 3, testimonio: 2, otra: 1 };
  const porClave = new Map();

  for (const f of listas.flat()) {
    if (!f.afirmacion.trim()) continue;
    const clave = f.afirmacion
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, '')
      .split(/\s+/)
      .slice(0, 12)
      .join(' ');
    const previa = porClave.get(clave);
    if (!previa || (PESO[f.tipoFuente] || 1) > (PESO[previa.tipoFuente] || 1)) {
      porClave.set(clave, f);
    }
  }
  return [...porClave.values()];
}

/**
 * Cuántas fichas hay de cada clase. Para poder enseñarlo en pantalla.
 *
 * Documentadas: por tipo de fuente, que es lo que dice cuánto se sostiene el
 * episodio. Construidas: por ROL, que es lo que dice si el expediente está
 * completo —si no hay ninguna ficha de rol «revelacion», el caso no se resuelve—.
 */
export function reparto(fichas) {
  const r = {};
  const porRol = (fichas || []).some((f) => f.construida);
  for (const f of fichas || []) {
    const k = porRol ? f.rol || 'objeto' : f.tipoFuente || 'otra';
    r[k] = (r[k] || 0) + 1;
  }
  return r;
}

const ESQUEMA = {
  type: 'object',
  properties: {
    fichas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          afirmacion: { type: 'string' },
          fuente: { type: 'string' },
          fecha: { type: 'string' },
          cita: { type: 'string' },
          enlace: { type: 'string' },
          fiabilidad: { type: 'string', enum: ['alta', 'media', 'baja', 'sin calificar'] },
          incierto: { type: 'boolean' },
        },
        required: ['afirmacion', 'fuente', 'fecha', 'cita', 'fiabilidad', 'incierto'],
      },
    },
  },
  required: ['fichas'],
};

const SISTEMA = `Eres el documentalista de un equipo de investigación. Tu trabajo NO es
escribir, es DOCUMENTAR.

Reglas que no se negocian:
- Cada ficha es UN hecho comprobable, no una valoración ni un resumen.
- La cita es TEXTUAL. Si no puedes citar, la ficha no vale.
- La fuente se nombra con precisión: obra, medio, archivo, expediente, autor.
- Si un dato es disputado o no lo puedes sostener, márcalo con incierto=true y
  dilo en la afirmación. Es infinitamente mejor una ficha que dice "se discute
  si..." que una que afirma de más.
- NO inventes enlaces. Si no tienes uno fiable, deja el campo vacío.
- Si sabes poco de un asunto, devuelve MENOS fichas. Nadie te pide llenar un cupo.`;

/**
 * Genera fichas sobre un tema.
 *
 * Es una llamada por tanda, no por ficha: mucho más barato y las fichas salen
 * coherentes entre sí en vez de repetirse.
 */
export async function investigar({ tema, angulo = '', cuantas = 12, yaTengo = [], senal }) {
  if (!tema?.trim()) throw new Error('Hace falta un tema para investigar.');

  const conocidas = yaTengo.length
    ? `\n\nYA TENGO ESTAS AFIRMACIONES (no las repitas, busca otras):\n` +
      yaTengo.slice(0, 40).map((f) => `- ${f.afirmacion}`).join('\n')
    : '';

  const r = await llamar(
    'texto',
    {
      sistema: SISTEMA,
      instruccion:
        `Tema del documental: ${tema}\n` +
        (angulo ? `Ángulo: ${angulo}\n` : '') +
        `\nDevuelve hasta ${cuantas} fichas documentales sobre este tema. ` +
        `Prioriza hechos con fecha, lugar y fuente identificable: son los que sostienen ` +
        `una narración. Incluye al menos una ficha que recoja la versión discutida o ` +
        `contraria si la hay.` +
        conocidas,
      esquema: ESQUEMA,
      temperatura: 0.3,
    },
    { senal },
  );

  return (r.json?.fichas || []).map((f) => ({
    id: `f${Math.random().toString(36).slice(2, 9)}`,
    afirmacion: f.afirmacion || '',
    fuente: f.fuente || '',
    fecha: f.fecha || '',
    cita: f.cita || '',
    enlace: f.enlace || '',
    fiabilidad: f.fiabilidad || 'sin calificar',
    incierto: !!f.incierto,
  }));
}

/**
 * Comprueba que el guion se apoya en las fichas (§8.1).
 *
 * No bloquea —hay frases de transición que no necesitan respaldo— pero SEÑALA las
 * afirmaciones fuertes que no apuntan a ninguna ficha. Que salga en pantalla es el
 * punto: así, cuando alguien discuta un dato, se sabe de dónde salió sin releer
 * nada.
 */
export async function revisarRespaldo({ tomas, fichas, senal }) {
  if (!fichas?.length) {
    return { sinRespaldo: [], aviso: 'No hay fichas: el guion no está respaldado por nada.' };
  }

  const r = await llamar(
    'texto',
    {
      sistema:
        'Comparas un guion documental con su almacén de fichas. Señalas qué frases ' +
        'hacen una afirmación factual fuerte (dato, fecha, cifra, atribución) que ' +
        'NINGUNA ficha respalda. Las frases de transición, ambiente o interpretación ' +
        'declarada no cuentan como afirmaciones factuales.',
      instruccion:
        `FICHAS:\n${fichas.map((f, i) => `[${i}] ${f.afirmacion} — ${f.fuente}`).join('\n')}\n\n` +
        `TOMAS DEL GUION:\n${tomas.map((t) => `(${t.i}) ${t.texto}`).join('\n')}\n\n` +
        `Devuelve, por cada toma, los índices de las fichas que la respaldan y si hace ` +
        `alguna afirmación factual sin respaldo.`,
      esquema: {
        type: 'object',
        properties: {
          tomas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                i: { type: 'integer' },
                fichas: { type: 'array', items: { type: 'integer' } },
                sinRespaldo: { type: 'boolean' },
                motivo: { type: 'string' },
              },
              required: ['i', 'fichas', 'sinRespaldo'],
            },
          },
        },
        required: ['tomas'],
      },
      temperatura: 0.1,
    },
    { senal },
  );

  const porToma = r.json?.tomas || [];
  return {
    porToma,
    sinRespaldo: porToma.filter((t) => t.sinRespaldo),
  };
}
