// Fase 4 — Dirección (§4.4 del plano).
//
//   «Un modelo de texto lee el guion y devuelve, EN JSON ESTRUCTURADO, una ficha de
//    plano por toma. Aquí se decide encuadre, movimiento de cámara, luz, quién
//    aparece.»
//
// ─────────────────────────────────────────────────────────────────────────────
// POR LOTES DE DIECIOCHO. NI UNA A UNA NI TODAS DE GOLPE.
//
// El plano decía «una llamada por pieza» y así estaba escrito. Con un guion de
// cuarenta y ocho tomas, el modelo devolvía CINCO fichas. Al reintentar, seis.
//
// No era un error: la respuesta se corta cuando no cabe, y una respuesta cortada
// NO da error —da un JSON más corto—. Aquí eso significaba cuarenta y dos tomas
// sin plano, y ni un mensaje que dijera por qué.
//
// Una a una tampoco vale: sale carísimo y el modelo no sabe que la toma 40 pasa
// en el mismo sitio que la 12, así que cada una inventa su propio lugar y se
// pierde la reutilización de fotogramas (§3), que es de donde sale el ahorro.
//
// Dieciocho es donde cabe la respuesta y todavía se ve contexto suficiente. Y
// para que no se note la costura entre lotes, a cada uno se le pasa el último
// plano del anterior como «de dónde venimos».
// ─────────────────────────────────────────────────────────────────────────────

import { llamar } from '../api.js';
import { comoInstruccion } from './director.js';

/** Tomas por llamada. Ver la cabecera: ni una ni todas. */
export const POR_LOTE = 18;

/**
 * Cuántas tomas tienen que separar una repetición de su original.
 *
 * Seis tomas son más de un minuto de documental: suficiente para que volver a ver
 * un plano se lea como un motivo y no como un fallo. Por debajo de eso, la
 * repetición canta.
 *
 * Y desde que el reparto lo hace el código, esta separación está GARANTIZADA y no
 * pedida: ver la cabecera de `repartirMotivos`.
 */
export const SEPARACION_MINIMA = 6;

/**
 * Cuántas veces puede volver un motivo, como mucho.
 *
 * Ocho vueltas de un plano a lo largo de treinta minutos son una cada cuatro
 * minutos: eso todavía se lee como motivo. Por encima, se lee como que no había
 * más material.
 */
export const VUELTAS_MAXIMAS = 8;

const ESQUEMA = {
  type: 'object',
  properties: {
    planos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer' },
          encuadre: {
            type: 'string',
            enum: ['gran plano general', 'plano general', 'plano medio', 'primer plano', 'detalle', 'cenital'],
          },
          movimientoCamara: {
            type: 'string',
            enum: ['fijo', 'acercamiento lento', 'alejamiento lento', 'paneo izquierda', 'paneo derecha', 'inclinación arriba', 'inclinación abajo'],
          },
          lugar: { type: 'string' },
          luz: { type: 'string' },
          sujetos: { type: 'array', items: { type: 'string' } },
          descripcion: { type: 'string' },
          // §8.2: cada toma sabe de qué tipo es su imagen.
          tipoImagen: {
            type: 'string',
            enum: ['dramatizacion', 'reconstruccion', 'mapa', 'esquema', 'recurso', 'archivo'],
          },
          merecemovimiento: { type: 'boolean' },
          igualQue: { type: 'integer' },
          // EL MOTIVO al que pertenece este plano, por su etiqueta.
          //
          // `igualQue` obligaba al modelo a llevar la cuenta de índices a través
          // de lotes de dieciocho: con ciento sesenta y cinco tomas y veinte
          // motivos volviendo siete veces son ciento cuarenta colocaciones, y
          // pedírselas en el prompt tiene dos salidas malas —que viole la
          // separación, y entonces parece error de montaje, o que devuelva menos
          // motivos en silencio—. Con una ETIQUETA no hay cuenta que llevar: dos
          // tomas del mismo motivo escriben la misma etiqueta y el código hace el
          // resto.
          motivo: { type: 'string' },
          // EL ARQUETIPO que aparece en esta toma, si la toma es un testimonio.
          // Sale del catálogo del género, y es lo que permite resolver el plano
          // contra la biblioteca permanente en vez de generarlo.
          personaje: { type: 'string' },
          // Cuánto se queda la imagen DESPUÉS de la última palabra. Va en palabras
          // y no en segundos a propósito: un número libre sale disparatado, y lo
          // que se decide aquí no es una cifra, es si esta toma pesa o no pesa.
          respiro: { type: 'string', enum: ['ninguno', 'corto', 'medio', 'largo'] },
        },
        required: ['i', 'encuadre', 'movimientoCamara', 'lugar', 'luz', 'sujetos', 'descripcion', 'tipoImagen', 'merecemovimiento', 'respiro'],
      },
    },
  },
  required: ['planos'],
};

const SISTEMA = `Eres el director de fotografía de un documental. Recibes el guion ya
partido en tomas y devuelves una ficha de plano por toma.

Reglas de este documental:

- ESTE DOCUMENTAL SE DRAMATIZA. Como los de plataforma: hay intérpretes, hay
  escenas recreadas, se ve a gente haciendo cosas. La dramatización es lo NORMAL,
  no el último recurso. Un documental de sesenta tomas de objetos y calles vacías
  no es un documental: es un salvapantallas con voz en off.
- Lo prohibido es distinto y muy concreto: que el intérprete se parezca a la
  persona REAL del caso, y que la imagen pase por material de archivo auténtico.
  Un intérprete anónimo recreando lo que pasó es legítimo y es lo que se espera.
- Reparte: más o menos la mitad de las tomas llevan personas —dramatización— y la
  otra mitad son lugares, detalles y documentos, que dan aire y ritmo. Ni todo
  gente ni todo objetos.
- Cuando pongas gente, DILO EN sujetos y descríbela en la descripción: qué hace,
  cómo va vestida, dónde mira. «Una mujer joven» no basta; «una mujer joven de
  unos treinta, abrigo oscuro, mirando el móvil bajo una farola» sí.
- tipoImagen dice qué clase de plano es: "dramatizacion" (escena recreada CON
  intérpretes; es la más habitual), "reconstruccion" (escena recreada sin gente:
  el lugar de los hechos, un coche, una habitación), "mapa", "esquema" (diagrama,
  línea de tiempo, corte), "recurso" (paisaje, objeto, textura), "archivo" (solo
  si el guion dice que existe material real de archivo con licencia).
- Fija el FORMATO y deja libre la PUESTA EN ESCENA. Decide tú el encuadre y la
  distancia; no pongas a todos los sujetos de espaldas ni a todos mirando a cámara.
  Varía.
- merecemovimiento=true solo donde el movimiento APORTE de verdad: algo se mueve
  dentro del cuadro —humo, agua, una multitud, un vehículo— y ese movimiento ES
  la toma. Marca las ESCENAS FUERTES del episodio, no las de relleno: solo unas
  diez o quince de todo el episodio llevan clip, y las eligen tus «true». En
  duda, false: un plano fijo con recorrido de cámara se ve perfectamente.
- MOTIVOS RECURRENTES, y aquí está la mitad del oficio. Esto no es un truco de
  ahorro: es cómo se monta un documental. Los de plataforma tienen un puñado de
  planos que VUELVEN —la patrulla llegando a la casa, la calle de noche, el
  pasillo del juzgado, la cámara de vigilancia— y los repiten cinco o seis veces
  a lo largo de la hora, nunca seguidos. Eso da unidad visual, y de paso una
  imagen sirve para siete tomas en vez de para una.
  Elige entre QUINCE Y VEINTE planos que sean los motivos de esta pieza: los que
  mejor representan el caso y aguantan verse varias veces. Cada uno vuelve entre
  cinco y ocho veces a lo largo del episodio.
- motivo: LA ETIQUETA del motivo al que pertenece este plano. Es texto corto y
  descriptivo —«el contenedor donde apareció el cuerpo», «la carretera comarcal
  de noche»— y TODAS las tomas de ese mismo motivo llevan LA MISMA ETIQUETA,
  letra por letra. Vacío si la toma no es un motivo.
  No te preocupes por dónde caen ni por cuántas veces: escribe la etiqueta cada
  vez que esa toma sea ese plano y el reparto lo hace el montaje, que sí puede
  contar. Si dos vueltas quedan demasiado juntas, se descartan solas.
  Y las tomas de un mismo motivo tienen que verse IGUAL de verdad: mismo lugar,
  mismo encuadre, misma luz, mismos sujetos, misma descripción. Si el ESTADO
  cambió —el mismo cuarto pero el paciente ya mejoró, la misma casa pero
  precintada—, eso es OTRO motivo: otra etiqueta.
- igualQue: el índice de una toma ANTERIOR cuyo plano se ve igual. Sigue valiendo
  para coincidencias sueltas que no son un motivo del episodio.
- Y cuando dos tomas comparten el sitio SIN ser el mismo plano, escribe lugar y
  luz LETRA POR LETRA IGUAL en las dos («el pasillo del pabellón» en ambas, no
  «pasillo del pabellón» y «el corredor del hospital»): el reaprovechado de
  material compara ese texto literal, y dos maneras de decir lo mismo son dos
  imágenes pagadas donde bastaba una.
  Dos reglas y son firmes:
    · NUNCA en tomas seguidas ni casi seguidas. Ver el mismo plano dos veces en
      veinte segundos parece un error de montaje, no un motivo. Deja al menos seis
      tomas de por medio.
    · Solo si de verdad se vería igual. Un motivo repetido con la luz cambiada no
      es el mismo plano: es otro. Y si el ESTADO cambió —el mismo cuarto pero el
      paciente ya mejoró, la misma casa pero precintada—, eso son DOS imágenes:
      cambia la descripción y no marques igualQue.
- LOS TESTIMONIOS. Algunas tomas vienen marcadas con QUIÉN HABLA: es alguien
  declarando a cámara. Esas tomas llevan el plano de esa persona hablando, no una
  ilustración de lo que cuenta, y en «personaje» va el arquetipo que le
  corresponde de la lista que se te da. El plano de un arquetipo es SIEMPRE el
  mismo en todo el canal —el perito en su laboratorio, el detective en su
  despacho— así que descríbelo tal como venga en esa lista y no lo reinventes:
  esos planos ya existen y no se vuelven a pagar.
- EL RESPIRO. Es lo que separa un documental de un noticiero, y es tuyo: cuánto se
  queda la imagen DESPUÉS de que la voz calle. Ahí no hay narración, solo la música
  y lo que se está viendo. Es donde el espectador siente lo que acaba de oír; sin
  ese hueco se lo cuentas y no le da tiempo a que le importe.
    · ninguno — la voz sigue de largo en la toma siguiente. Es LO NORMAL: la
      mayoría de las tomas van así, o la pieza se arrastra.
    · corto (1,5 s) — un respiro pequeño; sirve para separar dos ideas.
    · medio (2,5 s) — después de un dato que pesa: una fecha, una cifra, lo que
      declaró alguien, el detalle que no encaja. Es el más útil de los cuatro.
    · largo (4 s) — el final de un acto, o el segundo justo antes del giro. Dos o
      tres en toda la pieza, no más.
  Tres reglas firmes:
    · UNA DE CADA CUATRO O CINCO TOMAS, como mucho. Si respira todo, no respira
      nada, y encima el documental se alarga sin contar más.
    · Se respira sobre algo que MEREZCA MIRARSE tres segundos: una cara, un lugar
      donde acaba de pasar algo, algo en movimiento. Sobre un objeto suelto en una
      mesa no es un silencio, es un hueco muerto.
    · Nunca dos largos seguidos.
- La descripción es para un generador de imágenes: concreta, visual, sin metáforas
  ni adjetivos de opinión. Nombra la luz, la hora del día, la textura, el color.
- Y descríbela COMO UN FOTOGRAMA, no como una foto de archivo. Es la diferencia
  entre que se vea bien y que se vea de banco de imágenes. En cada descripción di:
  desde dónde se mira (altura de la cámara y qué hay en primer término tapando
  parte del cuadro: un marco, una ventana, un hombro, unas ramas), de dónde viene
  la luz y qué se queda a oscuras, y qué hay en el aire (vaho, polvo, llovizna,
  humo). «Un despacho con papeles» no vale. «El despacho visto desde el pasillo,
  por el hueco de la puerta entreabierta; solo lo alumbra el flexo de la mesa y el
  resto de la habitación está en negro; polvo suspendido en el haz» sí.
- NADA DE TEXTO LEGIBLE. El generador no sabe escribir: donde pidas un titular,
  una carta o un cartel, salen garabatos, y un garabato en primer plano delata que
  la imagen es falsa. No describas nunca lo que PONE en un papel, una pantalla, un
  cartel o una matrícula. Los documentos se ven en escorzo, fuera de foco, cortados
  por el borde o tapados por una mano: se entiende que es un expediente sin que se
  lea. Si el texto de una toma habla de un documento, busca el objeto alrededor —la
  carpeta cerrada, la caja del archivo, la mano que lo sostiene, el sello— antes
  que la página escrita.`;

/**
 * Dirige todas las tomas, por lotes, y devuelve las tomas con `plano`,
 * `movimiento` y `reusa`.
 *
 * `alAvanzar(hechas, total)` permite que la pantalla diga por dónde va: son
 * varias llamadas y algunas tardan.
 */
export async function dirigir({ tomas, escenas, tema, config, tratamiento = null, genero = null, senal, alAvanzar, alLote }) {
  if (!tomas?.length) throw new Error('No hay tomas que dirigir. Segmenta el guion primero.');

  // Lo que ya está dirigido se conserva. Volver a dirigir después de que un lote
  // fallara no puede cobrar los lotes que sí salieron (§4): se saltan enteros.
  const planos = new Map();
  for (const t of tomas) if (t.plano) planos.set(t.i, fichaDe(t));
  let ultimo = null;

  /** Pide las fichas de un grupo de tomas y las guarda. */
  const pedir = async (grupo) => {
    const r = await llamar(
      'texto',
      {
        sistema: SISTEMA,
        instruccion:
          `Documental sobre: ${tema}\n` +
          // La identidad visual la decide el director UNA vez y la sostienen todas
          // las tomas. Sin esto cada lote inventa su propia paleta.
          (tratamiento ? comoInstruccion(tratamiento, { para: 'direccion' }) + '\n\n' : '') +
          `Escenas: ${escenas.map((e) => `[${e.n}] ${e.titulo || 'sin título'}`).join(', ')}\n` +
          `Este documental tiene ${tomas.length} tomas en total; ahora dirigimos de la ` +
          `${grupo[0].i} a la ${grupo[grupo.length - 1].i}.\n` +
          // La costura entre lotes: sin esto, cada dieciocho tomas cambia el sitio
          // y la luz sin motivo, y se nota al montarlo.
          (ultimo
            ? `Venimos de: ${ultimo.lugar}, ${ultimo.encuadre}, ${ultimo.luz}. ` +
              `Sigue de ahí salvo que el texto pida otra cosa.\n`
            : '') +
          // LOS MOTIVOS DEL GÉNERO Y LOS ARQUETIPOS, del catálogo.
          //
          // Sin la lista, cada lote se inventa sus propios motivos y sus propios
          // planos de perito, y ni se repiten dentro del episodio ni coinciden con
          // los del episodio anterior — que es de donde sale el ahorro de verdad.
          (genero
            ? `MOTIVOS DE ESTE GÉNERO. Úsalos como etiqueta de motivo cuando la toma ` +
              `sea uno de ellos, escritos LETRA POR LETRA IGUAL:\n` +
              genero.motivos.map((m) => `- ${m}`).join('\n') +
              `\nPuedes añadir motivos propios de este caso; escríbelos igual en todas sus vueltas.\n\n` +
              `ARQUETIPOS QUE DECLARAN. Cuando una toma sea un testimonio, «personaje» ` +
              `lleva una de estas claves y el plano se describe TAL CUAL viene aquí:\n` +
              genero.personajes
                .map(
                  (p) =>
                    `- ${p.id} (${p.nombre}): ${p.plano.encuadre} · ${p.plano.lugar} · ` +
                    `${p.plano.luz}. ${p.plano.descripcion}`,
                )
                .join('\n') +
              `\n\n`
            : '') +
          grupo
            .map(
              (t) =>
                `(${t.i}) [escena ${t.escena}]` +
                // Quién habla, si la segmentación lo marcó con «> ». Es lo que
                // convierte una toma en el plano de alguien declarando en vez de
                // en una ilustración de lo que cuenta.
                (t.testimonio ? ` [TESTIMONIO de: ${t.testimonio}]` : '') +
                ` ${t.texto}`,
            )
            .join('\n') +
          `\n\nDevuelve una ficha por cada una de estas ${grupo.length} tomas, con el ` +
          `índice i exacto tal y como aparece entre paréntesis.`,
        esquema: ESQUEMA,
        temperatura: 0.6,
        // Proporcional al lote, no fijo. Un modelo que razona gasta este
        // presupuesto PENSANDO, y con 32768 fijos un lote de cuatro fichas tenía
        // licencia para pensar un minuto entero — que es justo lo que la
        // plataforma no permite. Con dieciocho llega al tope de siempre.
        maxTokens: Math.min(32768, 4000 + 1600 * grupo.length),
      },
      { senal },
    );
    for (const p of r.json?.planos || []) {
      if (grupo.some((t) => t.i === p.i)) planos.set(p.i, p);
    }
  };

  /** ¿La plataforma cortó la llamada por tiempo? Entonces el lote no cabía. */
  const cortePorTiempo = (e) => [502, 504, 524].includes(e?.estado);

  /**
   * Pide un grupo y, si vuelve incompleto, LO PARTE EN DOS Y REINTENTA.
   *
   * Una respuesta corta no es un error del modelo: es que no cabía. La respuesta
   * correcta a «no cabe» es pedir menos, no pedir otra vez lo mismo —que fue justo
   * lo que pasó cuando el usuario reintentó a mano: cinco fichas, luego seis—.
   *
   * Se para a las dos particiones. Si a grupos de cuatro o cinco sigue sin venir,
   * el problema ya no es el tamaño y esas tomas se quedan marcadas sin plano, que
   * la pantalla cuenta y se puede repetir solo eso.
   */
  const completar = async (grupo, particiones = 0) => {
    if (!grupo.length) return;
    try {
      await pedir(grupo);
    } catch (e) {
      // UN CORTE POR TIEMPO NO ES UN «NO»: ES «NO CABE EN UN MINUTO». La
      // respuesta correcta es exactamente la misma que cuando la respuesta
      // vuelve incompleta: pedir menos. Antes esto tumbaba la dirección entera
      // con el 504 pelado en pantalla, lote tras lote, y un lote de dieciocho
      // fichas con un modelo que razona sencillamente no cabe siempre.
      if (!cortePorTiempo(e) || particiones >= 3 || grupo.length <= 2) throw e;
      const mitad = Math.ceil(grupo.length / 2);
      await completar(grupo.slice(0, mitad), particiones + 1);
      await completar(grupo.slice(mitad), particiones + 1);
      return;
    }
    const faltan = grupo.filter((t) => !planos.has(t.i));
    if (!faltan.length || particiones >= 2) return;
    const mitad = Math.ceil(faltan.length / 2);
    await completar(faltan.slice(0, mitad), particiones + 1);
    await completar(faltan.slice(mitad), particiones + 1);
  };

  for (let desde = 0; desde < tomas.length; desde += POR_LOTE) {
    if (senal?.aborted) throw new Error('Detenido.');
    const lote = tomas.slice(desde, desde + POR_LOTE);

    if (!lote.every((t) => planos.has(t.i))) await completar(lote);

    ultimo = planos.get(lote[lote.length - 1].i) || ultimo;
    alAvanzar?.(Math.min(desde + POR_LOTE, tomas.length), tomas.length);

    // EL LOTE PAGADO SE GUARDA ANTES DE PEDIR EL SIGUIENTE (§4).
    //
    // Antes las fichas vivían solo en memoria hasta terminar los ocho lotes: si el
    // sexto fallaba —o se cerraba la pestaña—, los cinco ya pagados se tiraban. Es
    // la misma regla que ya cumplían la voz y las imágenes, y la dirección no la
    // cumplía. Se entrega un estado COHERENTE, no las fichas a medias: `resolver`
    // es determinista sobre lo acumulado, así que reanudar da lo mismo que no
    // haberse caído.
    if (alLote) await alLote(resolver(tomas, planos, config));
  }

  return resolver(tomas, planos, config);
}

/**
 * Convierte las fichas acumuladas en tomas terminadas: cupo de movimiento,
 * motivos, respiros y desfase. Determinista sobre `(tomas, planos, config)`; las
 * tomas sin ficha salen con `plano: null`, que es lo que hace que volver a
 * dirigir pida solo esas.
 */
function resolver(tomas, planos, config) {
  // EL REPARTO DE MOTIVOS LO HACE EL CÓDIGO, NO EL MODELO.
  //
  // Con ciento sesenta y cinco tomas y veinte motivos volviendo siete veces son
  // ciento cuarenta colocaciones que tienen que respetar seis tomas de separación
  // cada una. El modelo no puede llevar esa cuenta —ve lotes de dieciocho—, así
  // que pedírselo tenía dos salidas y las dos malas: violar la separación, que se
  // ve como error de montaje, o devolver menos motivos en silencio. Él dice QUÉ
  // planos son el mismo motivo; aquí se decide DÓNDE caen las vueltas.
  const vueltas = repartirMotivos(tomas, planos);

  // EL MOVIMIENTO YA NO ES UN PORCENTAJE, ES UNA CUENTA.
  //
  // Una proporción global minimiza el coste de cada episodio, y eso no se
  // amortiza nunca porque esos clips no vuelven. La política dice cuántas escenas
  // fuertes lleva ESTE episodio; los motivos van con imagen fija y recorrido de
  // cámara, que cuesta cero y es lo que se amortiza al repetirse.
  const politica = config?.movimiento?.politica || {};
  const cupo = Math.max(0, Math.round(Number(politica.clipsPorEpisodio ?? 12)));

  // El modelo propuso; aquí se decide. El cupo de movimiento es del presupuesto, no
  // suyo (§4.7).
  //
  // Y se reparte POR TRAMOS, no cogiendo los primeros del cupo. Es una lección
  // pagada: ordenando por índice, el cupo se llenaba con las tomas del principio y
  // el último tercio del documental se quedaba sin una sola toma animada. Se parte
  // la pieza en tantos tramos como clips haya y se coge un candidato de cada uno.
  //
  // Los motivos quedan FUERA de los candidatos salvo que la política diga otra
  // cosa: un motivo se ve cinco o seis veces, y animarlo es pagar la fase más cara
  // por un plano cuyo valor está justamente en volver barato.
  // LA DUEÑA TAMBIÉN ES EL MOTIVO, y esto se me escapó a la primera: excluyendo
  // solo las vueltas, la dueña seguía entrando en el sorteo de clips, se lo
  // llevaba, y desde ahí el movimiento se propagaba a sus cinco vueltas — que es
  // exactamente pagar el clip más caro para el plano que existía para salir gratis.
  const conMotivo = new Set([...vueltas.entries()].flatMap(([dueña, lista]) => [dueña, ...lista]));
  const quieren = tomas
    .filter((t) => planos.get(t.i)?.merecemovimiento)
    .filter((t) => politica.motivosConVideo === true || !conMotivo.has(t.i))
    .map((t) => t.i);
  const conMovimiento = new Set(repartirPorTramos(quieren, cupo, tomas.length));

  // UN MOTIVO ANIMADO VUELVE GRATIS.
  //
  // Si la toma 8 lleva clip y la 27 repite ese mismo plano, la 27 usa EL MISMO
  // clip: no cuesta nada y no gasta cupo. Es exactamente lo que hacen los
  // documentales de plataforma con la patrulla llegando a la casa o la cámara de
  // vigilancia —la misma toma vuelve cuatro o cinco veces a lo largo de la hora—.
  //
  // Se propaga hacia delante y en orden, así que una cadena (30 repite a 20, 20
  // repite a 8) se resuelve entera en una pasada: `igualQue` siempre mira atrás.
  for (const t of tomas) {
    const dueña = dueñaDe(t.i, planos, vueltas);
    if (
      Number.isInteger(dueña) &&
      t.i - dueña >= SEPARACION_MINIMA &&
      conMovimiento.has(dueña) &&
      !conMovimiento.has(t.i)
    ) {
      conMovimiento.add(t.i);
    }
  }

  // El respiro también se acota aquí, por lo mismo que el cupo de movimiento: el
  // director propone y el presupuesto decide. Solo que este presupuesto no es de
  // dinero sino de DURACIÓN — cada segundo de silencio alarga la pieza sin contar
  // nada más—, y un modelo generoso que marque «medio» en cuarenta tomas convierte
  // diez minutos en trece de documental que se arrastra.
  const respiros = repartirRespiros(tomas, planos, config);

  return tomas.map((t) => {
    const p = planos.get(t.i);
    if (!p) {
      // Una toma sin plano no se inventa aquí en silencio: se deja marcada para que
      // la pantalla lo diga y se pueda repetir solo esa parte.
      return { ...t, plano: null };
    }

    // `igualQue` solo vale hacia atrás y hacia una toma que existe: si no, la
    // resolución de `reusa` daría vueltas o apuntaría al vacío (§3).
    //
    // Y NUNCA a una toma cercana. Un motivo que vuelve es lo que da unidad a un
    // documental; el mismo plano dos veces en veinte segundos es un error de
    // montaje. La regla está en la instrucción del director, pero pedirla no basta:
    // aquí se cumple, porque el que mira el resultado eres tú y no él.
    // Y las dos tomas tienen que ser de la misma clase: un clip no se puede
    // reutilizar como imagen fija ni al revés. Antes esto excluía del todo a las
    // tomas con movimiento —`!conMovimiento.has(t.i)`— y por eso ningún clip se
    // reutilizaba nunca.
    //
    // La dueña puede venir de dos sitios: del reparto de motivos —lo normal desde
    // que el código coloca las vueltas— o de un `igualQue` suelto del modelo. Los
    // dos pasan por la misma puerta y por las mismas dos reglas.
    const dueña = dueñaDe(t.i, planos, vueltas);
    const mismaClase =
      Number.isInteger(dueña) && conMovimiento.has(t.i) === conMovimiento.has(dueña);

    const reusa =
      Number.isInteger(dueña) && dueña >= 0 && t.i - dueña >= SEPARACION_MINIMA && mismaClase
        ? dueña
        : null;

    const plano = {
      encuadre: p.encuadre,
      movimientoCamara: p.movimientoCamara,
      lugar: p.lugar,
      luz: p.luz,
      sujetos: p.sujetos || [],
      descripcion: p.descripcion,
      // El arquetipo que sale en esta toma, si es un testimonio. Va DENTRO del
      // plano porque es parte de qué se ve, y es por donde se resuelve contra la
      // biblioteca permanente del canal.
      personaje: String(p.personaje || '').trim().toLowerCase(),
    };

    // SI EL PLANO CAMBIÓ, LA IMAGEN VIEJA YA NO ES DE ESTA TOMA.
    //
    // Al volver a dirigir, la ficha se sustituye pero `imagen: 'ok'` sobrevivía al
    // spread. Quedaba una toma que dice tener imagen y cuya imagen es de otro
    // plano: el documental sale con la foto equivocada y nada lo avisa. Se marca
    // como ausente para que la fase de imagen la rehaga y para que la pantalla
    // pueda decir cuántas quedaron desfasadas ANTES de gastar.
    //
    // Si el plano no cambió, no se toca nada: volver a dirigir no puede costar
    // dinero por sí solo.
    const movimiento = conMovimiento.has(t.i);
    const cambio = huellaDeFicha(t.plano) !== huellaDeFicha(plano);
    const cambioDeClase = !!t.movimiento !== movimiento;

    return {
      ...t,
      plano,
      tipoImagen: p.tipoImagen === 'archivo' ? 'archivo' : 'reconstruccion',
      claseVisual: p.tipoImagen,
      movimiento,
      reusa,
      // Los segundos que la imagen se queda después de la última palabra, y —solo
      // en la primera toma— los que entra antes de la primera.
      respiro: respiros.get(t.i) || 0,
      entrada: t.i === tomas[0].i ? entradaEnFrio(config) : 0,
      ...(cambio || cambioDeClase
        ? {
            imagen: reusa !== null || t.heredado ? t.imagen : null,
            video: reusa !== null || t.heredadoVid ? t.video : null,
            desfasada: true,
          }
        : { desfasada: false }),
    };
  });
}

/**
 * Reparte las vueltas de cada motivo a lo largo del episodio.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El modelo dice QUÉ tomas son el mismo motivo, escribiendo la misma etiqueta en
 * todas. Aquí se decide CUÁLES de esas vueltas se aceptan, y es lo único que
 * puede garantizar la separación: el modelo ve lotes de dieciocho tomas y no
 * puede saber que la vuelta que va a escribir en la 91 está a cuatro de la que
 * escribió en la 87.
 *
 * La regla es simple y no admite excepciones: la primera aparición es la DUEÑA
 * —esa se paga— y cada vuelta posterior se acepta solo si está a `SEPARACION_MINIMA`
 * o más de la última aceptada de ese mismo motivo. Una vuelta que no cabe NO se
 * fuerza y NO se descarta el motivo entero: se queda como toma normal y paga su
 * imagen. Devolver las que caben en vez de fingir es la diferencia entre un
 * documental con motivos y uno con el mismo plano dos veces en veinte segundos.
 *
 * Y hay un tope de vueltas por motivo: ocho en treinta minutos es una cada cuatro
 * minutos, que todavía se lee como motivo. Por encima se lee como que no había
 * más material.
 *
 * Determinista sobre `(tomas, planos)`: el mismo guion da siempre el mismo
 * reparto, que es lo que permite reanudar una dirección caída a mitad sin que
 * cambie nada de lo ya decidido.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Devuelve un mapa `dueña → [índices de sus vueltas aceptadas]`.
 */
export function repartirMotivos(tomas, planos) {
  const porEtiqueta = new Map();
  for (const t of tomas) {
    const etiqueta = String(planos.get(t.i)?.motivo || '').trim().toLowerCase();
    if (!etiqueta) continue;
    if (!porEtiqueta.has(etiqueta)) porEtiqueta.set(etiqueta, []);
    porEtiqueta.get(etiqueta).push(t.i);
  }

  const salida = new Map();
  for (const indices of porEtiqueta.values()) {
    if (indices.length < 2) continue;
    const orden = [...indices].sort((a, b) => a - b);
    const dueña = orden[0];
    let ultima = dueña;
    const aceptadas = [];
    for (const i of orden.slice(1)) {
      if (aceptadas.length >= VUELTAS_MAXIMAS - 1) break;
      if (i - ultima < SEPARACION_MINIMA) continue;
      aceptadas.push(i);
      ultima = i;
    }
    if (aceptadas.length) salida.set(dueña, aceptadas);
  }
  return salida;
}

/**
 * De qué toma anterior es repetición esta, si lo es.
 *
 * Dos caminos y una sola puerta: el reparto de motivos —lo normal— y el `igualQue`
 * suelto que el modelo marca para una coincidencia que no es motivo del episodio.
 * Que salgan por aquí los dos es lo que hace que las reglas de separación y de
 * clase se apliquen igual a los dos, en vez de una vez por camino.
 */
function dueñaDe(i, planos, vueltas) {
  for (const [dueña, lista] of vueltas) {
    if (lista.includes(i)) return dueña;
  }
  const suelto = planos.get(i)?.igualQue;
  return Number.isInteger(suelto) ? suelto : null;
}

/** Lo que dura cada clase de respiro, en segundos. */
export const RESPIROS = { ninguno: 0, corto: 1.5, medio: 2.5, largo: 4 };

/** Los segundos de imagen antes de la primera palabra de toda la pieza. */
export const entradaEnFrio = (config) =>
  Math.max(0, Math.min(8, Number(config?.montaje?.entradaEnFrio ?? 2)));

/**
 * Reparte los respiros dentro de un presupuesto de duración.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El silencio no es gratis: cada segundo alarga la pieza sin contar nada más. Un
 * modelo generoso que marque «medio» en cuarenta tomas convierte diez minutos en
 * trece de documental que se arrastra, y el problema del que veníamos era el
 * contrario —ninguno—, así que pasarse al otro extremo sería el mismo error otra
 * vez (§7.11: extremo a extremo, sin término medio).
 *
 * Cuando lo pedido pasa del presupuesto se quitan LOS MÁS CORTOS. Los largos son
 * los deliberados —el final de un acto, el segundo antes del giro— y son justo los
 * que no se pueden perder; los cortos son los que sobran cuando sobra algo.
 *
 * Y dos largos seguidos no pasan, porque eso no es ritmo: es que se paró la pieza.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function repartirRespiros(tomas, planos, config) {
  const hablado = tomas.reduce((s, t) => s + (Number(t.segundos) || 0), 0);
  const tope = hablado * Math.max(0, Math.min(0.3, Number(config?.montaje?.respiroMaximo ?? 0.1)));

  const pedidos = tomas
    .map((t) => ({ i: t.i, segundos: RESPIROS[planos.get(t.i)?.respiro] || 0 }))
    .filter((x) => x.segundos > 0);

  // De más largo a más corto; a igualdad, el que va antes en la pieza.
  pedidos.sort((a, b) => b.segundos - a.segundos || a.i - b.i);

  const salida = new Map();
  let gastado = 0;
  for (const x of pedidos) {
    if (gastado + x.segundos > tope) continue;
    // Dos largos pegados paran la pieza. El segundo baja a medio en vez de caerse:
    // el director quería peso ahí y algo de peso se le deja.
    const previo = salida.get(x.i - 1) || 0;
    const segundos = previo >= RESPIROS.largo && x.segundos >= RESPIROS.largo ? RESPIROS.medio : x.segundos;
    salida.set(x.i, segundos);
    gastado += segundos;
  }
  return salida;
}

/**
 * La huella de una ficha de plano: lo que hace que la imagen sea LA IMAGEN de
 * esta toma. Si cambia cualquiera de estas cosas, la imagen anterior ya no vale.
 */
const huellaDeFicha = (x) =>
  !x
    ? ''
    : [x.lugar, x.encuadre, x.luz, x.descripcion, (x.sujetos || []).join('|'), x.personaje]
        .map((v) => String(v || '').trim().toLowerCase())
        .join(' · ');

/** Una toma ya dirigida, en la forma que devuelve el modelo. */
function fichaDe(t) {
  // El respiro vuelve a su nombre: si no, volver a dirigir un lote que ya estaba
  // hecho lo perdería, y con él el ritmo que se había decidido.
  const s = Number(t.respiro) || 0;
  const respiro =
    Object.keys(RESPIROS).find((k) => RESPIROS[k] === s) ||
    (s >= RESPIROS.largo ? 'largo' : s >= RESPIROS.medio ? 'medio' : s > 0 ? 'corto' : 'ninguno');

  return {
    i: t.i,
    ...t.plano,
    tipoImagen: t.claseVisual || t.tipoImagen || 'reconstruccion',
    merecemovimiento: !!t.movimiento,
    igualQue: Number.isInteger(t.reusa) ? t.reusa : undefined,
    // El motivo se reconstruye desde la huella del plano: dos tomas del mismo
    // motivo tienen la misma huella, así que reanudar una dirección caída a mitad
    // vuelve a agrupar exactamente igual. Sin esto, los lotes ya pagados perderían
    // sus motivos al reanudar y el reparto saldría distinto.
    motivo: t.motivo || (t.reusa !== null && t.reusa !== undefined ? huellaDeFicha(t.plano) : ''),
    personaje: t.plano?.personaje || '',
    respiro,
  };
}

/**
 * Reparte `cupo` elecciones entre los candidatos, a lo largo de toda la pieza.
 *
 * Se divide la pieza en `cupo` tramos iguales y se coge el primer candidato de
 * cada tramo. Si un tramo no tiene ninguno, su hueco se rellena al final con los
 * que hayan sobrado, para no desperdiciar cupo.
 */
export function repartirPorTramos(candidatos, cupo, total) {
  if (cupo <= 0 || !candidatos.length) return [];
  if (candidatos.length <= cupo) return [...candidatos];

  const elegidos = [];
  const usados = new Set();
  const ancho = total / cupo;
  for (let k = 0; k < cupo; k++) {
    const desde = k * ancho;
    const hasta = (k + 1) * ancho;
    const c = candidatos.find((i) => !usados.has(i) && i >= desde && i < hasta);
    if (c !== undefined) {
      usados.add(c);
      elegidos.push(c);
    }
  }
  for (const c of candidatos) {
    if (elegidos.length >= cupo) break;
    if (!usados.has(c)) {
      usados.add(c);
      elegidos.push(c);
    }
  }
  return elegidos.sort((a, b) => a - b);
}

/**
 * Cuántas tomas quedaron sin plano. La pantalla lo enseña y se puede repetir solo
 * esa parte: cada fase se puede repetir sola y solo cobra lo que genera (§4).
 */
export function sinDirigir(tomas) {
  return tomas.filter((t) => !t.plano).map((t) => t.i);
}
