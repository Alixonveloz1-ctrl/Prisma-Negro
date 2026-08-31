// Fase 1 — El expediente del caso (§4.1 y §8.1 del plano, releídos).
//
//   «Produce FICHAS. El guion se escribe después, y cada afirmación del guion
//    apunta a una ficha.»
//
// ─────────────────────────────────────────────────────────────────────────────
// AQUÍ NO SE BUSCA NADA. EL CASO SE INVENTA, Y ESO ES EL PRODUCTO.
//
// Esto tuvo dos modos: uno que salía a internet a por casos reales y otro que
// construía el caso. Tener los dos fue un error caro —el proyecto se quedó
// semanas en el equivocado, buscando casos reales mientras se pedía ficción— y
// sobre todo era tener media herramienta tirando en contra de la otra media: un
// modo cuya regla central es «no inventes datos, fechas, cifras ni nombres» y
// otro cuyo producto ES inventarlos.
//
// El canal es de FICCIÓN DOCUMENTAL: el caso no ocurrió, suena como si hubiera
// ocurrido, y se publica declarado. Así que la búsqueda en internet, los seis
// ángulos, la fusión de fichas por solidez de fuente y el repaso de respaldo se
// fueron enteros. Lo que queda es lo único que hace falta: proponer casos y
// construir el expediente.
//
// Sigue habiendo fichas, y con MÁS motivo que antes: son lo único que garantiza
// que el detective no se llame Roger en el minuto 12 y Robert en el 32.
// ─────────────────────────────────────────────────────────────────────────────

import { llamar } from '../api.js';

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
          // EL PAÍS Y LA CIUDAD VAN APARTE, y son reales. No es un adorno del
          // texto: de aquí sale el mundo de TODAS las imágenes del episodio —por
          // qué lado va el volante, cómo son las matrículas, los uniformes y la
          // arquitectura—. Metidos dentro de `donde` no se podrían leer. Ver
          // `mundoDelCaso` en `comun/estilos.mjs`.
          pais: { type: 'string' },
          ciudad: { type: 'string' },
          donde: { type: 'string' },
          porQueFunciona: { type: 'string' },
          imagenSugerida: { type: 'string' },
          documentado: { type: 'boolean' },
        },
        required: ['titulo', 'gancho', 'sinopsis', 'cuando', 'pais', 'ciudad', 'donde', 'porQueFunciona', 'imagenSugerida', 'documentado'],
      },
    },
  },
  required: ['casos'],
};

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
- EL PAÍS Y LA CIUDAD SON REALES. Existen y se escriben bien, y todo lo que digas
  de ellos encaja: el clima, el paisaje, la moneda, los oficios, y cómo se llaman
  ALLÍ las divisiones del territorio —condado, municipio, partido, provincia,
  comuna, parroquia, óblast—. Usa la palabra de ese país, nunca la de otro.
- LO PEQUEÑO SE INVENTA, y es donde pasa el caso: el pueblo, el barrio, la calle,
  el kilómetro de carretera, la comisaría, el juzgado, el laboratorio, la empresa.
- Ni una persona real ni una empresa real. La comisaría, el forense y el juzgado
  CONCRETOS del caso son inventados: ahí es donde habría alguien real señalado.
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
        // EL MUNDO ES EL MUNDO. Esto estuvo clavado en un solo sitio y era una
        // decisión mía disfrazada de regla: «pueblos, condados y organismos
        // inventados» con el canal entero atado a un mundo hispanohablante.
        '- EL MUNDO ENTERO VALE: Estados Unidos, Inglaterra, Rusia, Japón, Panamá, ' +
        'Colombia, Perú, Argentina, Marruecos, el que sea. No lo centres en una ' +
        'región ni repitas país entre las propuestas: cinco casos, cinco sitios ' +
        'distintos del mundo.\n' +
        // LO GRANDE ES REAL. Es lo que hace que suene a expediente y no a fantasía.
        '- EL PAÍS Y LA CIUDAD SON REALES Y CORRECTOS. Existen, se escriben bien, y ' +
        'todo lo que digas de ellos encaja: el clima, el paisaje, la moneda, el ' +
        'idioma, y cómo se llaman ALLÍ las divisiones del territorio —condado, ' +
        'municipio, partido, provincia, comuna, parroquia, óblast, prefectura—. Usa ' +
        'la palabra que se usa en ese país, nunca la traducida de otro.\n' +
        // Y LO PEQUEÑO SE INVENTA. Ahí es donde pasa el caso y donde habría alguien
        // real a quien señalar.
        '- LO PEQUEÑO SE INVENTA: el pueblo, el barrio, la vereda, la calle, el ' +
        'kilómetro de carretera, la comisaría, el juzgado, el laboratorio, la ' +
        'empresa. El caso ocurre ahí, y ahí no puede haber nada real.\n' +
        '- Ni una persona real ni una empresa real. Una institución nacional grande ' +
        'puede nombrarse de pasada; la comisaría, el forense o el juzgado CONCRETOS ' +
        'del caso —los que se equivocan, los que tapan, los que lo reabren— son ' +
        'inventados: ahí es donde habría una persona real señalada.\n' +
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
        '- pais: el país REAL, escrito como se escribe. «Estados Unidos», «Rusia».\n' +
        '- ciudad: la ciudad REAL más cercana, la que existe y se puede buscar.\n' +
        '- donde: el sitio del caso en una línea, con lo inventado dentro. «El ' +
        'caserío de Las Tunitas, a 40 km de Barquisimeto».\n' +
        '- porQueFunciona: por qué da para episodio visual.\n' +
        '- imagenSugerida: descripción visual para la portada.\n' +
        '- documentado: false SIEMPRE. Esto es ficción declarada.\n\n' +
        'Responde ÚNICAMENTE con un objeto JSON así:\n' +
        '{"casos":[{"titulo":"","gancho":"","sinopsis":"","cuando":"","pais":"",' +
        '"ciudad":"","donde":"",' +
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
            `Cuándo: ${caso.cuando || 'lo decides tú'} · Dónde: ${caso.donde || 'lo decides tú'}\n` +
            // EL PAÍS Y LA CIUDAD, APARTE Y POR SU NOMBRE. Metidos solo dentro de
            // `donde` se perdían: el expediente salía con nombres, oficios y
            // divisiones territoriales de otro sitio que el de la historia.
            (caso.pais
              ? `País: ${caso.pais}${caso.ciudad ? ` · Ciudad: ${caso.ciudad}` : ''} — REALES. ` +
                `Los nombres de las personas, los oficios, los cuerpos que ` +
                `investigan y las divisiones del territorio son los que se usan ` +
                `en ${caso.pais}, no los de otro país.\n`
              : '') +
            `\n` +
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
