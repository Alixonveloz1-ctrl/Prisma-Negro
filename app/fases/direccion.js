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
 */
export const SEPARACION_MINIMA = 6;

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
        },
        required: ['i', 'encuadre', 'movimientoCamara', 'lugar', 'luz', 'sujetos', 'descripcion', 'tipoImagen', 'merecemovimiento'],
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
- merecemovimiento=true solo donde el movimiento APORTE (algo se mueve de verdad:
  humo, agua, multitud, vehículo). Es la fase más cara con diferencia. En duda,
  false.
- MOTIVOS RECURRENTES. Esto no es un truco de ahorro: es cómo se monta un
  documental. Los de plataforma tienen un puñado de planos que VUELVEN —la
  patrulla llegando a la casa, la calle de noche, el pasillo del juzgado, la
  cámara de vigilancia— y los repiten cuatro o cinco veces a lo largo de la hora,
  nunca seguidos. Eso da unidad visual, y de paso una imagen sirve para cinco
  tomas en vez de para una.
  Elige entre CUATRO Y OCHO planos que sean los motivos de esta pieza: los que
  mejor representan el caso y aguantan verse varias veces. Cada uno vuelve entre
  dos y cinco veces, repartido a lo largo del documental.
- igualQue: el índice de una toma ANTERIOR cuyo plano se ve igual —mismo lugar,
  mismo encuadre, misma luz, mismos sujetos—. Es con lo que se marcan las vueltas
  de un motivo, y con lo que se aprovecha cualquier otra coincidencia real.
  Dos reglas y son firmes:
    · NUNCA en tomas seguidas ni casi seguidas. Ver el mismo plano dos veces en
      veinte segundos parece un error de montaje, no un motivo. Deja al menos seis
      tomas de por medio.
    · Solo si de verdad se vería igual. Un motivo repetido con la luz cambiada no
      es el mismo plano: es otro.
- La descripción es para un generador de imágenes: concreta, visual, sin metáforas
  ni adjetivos de opinión. Nombra la luz, la hora del día, la textura, el color.`;

/**
 * Dirige todas las tomas, por lotes, y devuelve las tomas con `plano`,
 * `movimiento` y `reusa`.
 *
 * `alAvanzar(hechas, total)` permite que la pantalla diga por dónde va: son
 * varias llamadas y algunas tardan.
 */
export async function dirigir({ tomas, escenas, tema, config, tratamiento = null, senal, alAvanzar }) {
  if (!tomas?.length) throw new Error('No hay tomas que dirigir. Segmenta el guion primero.');

  const proporcion = config?.movimiento?.proporcion ?? 0.15;
  const cupo = Math.max(0, Math.round(tomas.length * proporcion));

  // Lo que ya está dirigido se conserva. Volver a dirigir después de que un lote
  // fallara no puede cobrar los lotes que sí salieron (§4): se saltan enteros.
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
          `\n` +
          grupo.map((t) => `(${t.i}) [escena ${t.escena}] ${t.texto}`).join('\n') +
          `\n\nDevuelve una ficha por cada una de estas ${grupo.length} tomas, con el ` +
          `índice i exacto tal y como aparece entre paréntesis.`,
        esquema: ESQUEMA,
        temperatura: 0.6,
        maxTokens: 32768,
      },
      { senal },
    );
    for (const p of r.json?.planos || []) {
      if (grupo.some((t) => t.i === p.i)) planos.set(p.i, p);
    }
  };

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
    await pedir(grupo);
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
  }

  // El modelo propuso; aquí se decide. El cupo de movimiento es del presupuesto, no
  // suyo (§4.7).
  //
  // Y se reparte POR TRAMOS, no cogiendo los primeros del cupo. Es una lección
  // pagada: ordenando por índice, el cupo se llenaba con las tomas del principio y
  // el último tercio del documental se quedaba sin una sola toma animada. Se parte
  // la pieza en tantos tramos como clips haya y se coge un candidato de cada uno.
  const quieren = tomas.filter((t) => planos.get(t.i)?.merecemovimiento).map((t) => t.i);
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
    const dueña = planos.get(t.i)?.igualQue;
    if (
      Number.isInteger(dueña) &&
      t.i - dueña >= SEPARACION_MINIMA &&
      conMovimiento.has(dueña) &&
      !conMovimiento.has(t.i)
    ) {
      conMovimiento.add(t.i);
    }
  }

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
    const mismaClase =
      Number.isInteger(p.igualQue) && conMovimiento.has(t.i) === conMovimiento.has(p.igualQue);

    const reusa =
      Number.isInteger(p.igualQue) &&
      p.igualQue >= 0 &&
      t.i - p.igualQue >= SEPARACION_MINIMA &&
      mismaClase
        ? p.igualQue
        : null;

    return {
      ...t,
      plano: {
        encuadre: p.encuadre,
        movimientoCamara: p.movimientoCamara,
        lugar: p.lugar,
        luz: p.luz,
        sujetos: p.sujetos || [],
        descripcion: p.descripcion,
      },
      tipoImagen: p.tipoImagen === 'archivo' ? 'archivo' : 'reconstruccion',
      claseVisual: p.tipoImagen,
      movimiento: conMovimiento.has(t.i),
      reusa,
    };
  });
}

/** Una toma ya dirigida, en la forma que devuelve el modelo. */
function fichaDe(t) {
  return {
    i: t.i,
    ...t.plano,
    tipoImagen: t.claseVisual || t.tipoImagen || 'reconstruccion',
    merecemovimiento: !!t.movimiento,
    igualQue: Number.isInteger(t.reusa) ? t.reusa : undefined,
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
