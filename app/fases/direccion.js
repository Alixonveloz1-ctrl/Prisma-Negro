// Fase 4 — Dirección (§4.4 del plano).
//
//   «Un modelo de texto lee el guion y devuelve, EN JSON ESTRUCTURADO, una ficha de
//    plano por toma. Aquí se decide encuadre, movimiento de cámara, luz, quién
//    aparece. Es UNA LLAMADA POR PIEZA, no por toma: mucho más barato y mucho más
//    coherente.»
//
// Lo de la coherencia no es un extra: si se pide plano a plano, el modelo no sabe
// que la toma 40 pasa en el mismo sitio que la 12, y cada una sale de un lugar
// distinto. Con una sola llamada, ve el guion entero.
//
// Aquí también se decide `reusa` (§3): dos tomas con el mismo plano no se pagan dos
// veces.

import { llamar } from '../api.js';

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
          tipoImagen: { type: 'string', enum: ['reconstruccion', 'mapa', 'esquema', 'recurso', 'archivo'] },
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

- NO se generan imágenes fotorrealistas de personas reales identificables, ni se
  presenta material generado como si fuera de archivo. Es el fallo que hunde la
  credibilidad de un canal documental. Cuando una toma hable de una persona real,
  resuélvela con: reconstrucción declaradamente estilizada, detalle (manos,
  objetos, documentos), lugar sin la persona, mapa o esquema.
- tipoImagen dice qué clase de plano es: "reconstruccion" (escena recreada y
  declarada), "mapa", "esquema" (diagrama, línea de tiempo, corte), "recurso"
  (paisaje, objeto, textura), "archivo" (solo si el guion dice que existe material
  real de archivo con licencia).
- Fija el FORMATO y deja libre la PUESTA EN ESCENA. Decide tú el encuadre y la
  distancia; no pongas a todos los sujetos de espaldas ni a todos mirando a cámara.
  Varía.
- merecemovimiento=true solo donde el movimiento APORTE (algo se mueve de verdad:
  humo, agua, multitud, vehículo). Es la fase más cara con diferencia. En duda,
  false.
- igualQue: si una toma transcurre en el MISMO plano que otra anterior (mismo
  lugar, mismo encuadre, misma luz, mismos sujetos), pon el índice de aquella. Se
  reutilizará su imagen en vez de pagar otra. Úsalo solo cuando de verdad se vería
  igual.
- La descripción es para un generador de imágenes: concreta, visual, sin metáforas
  ni adjetivos de opinión. Nombra la luz, la hora del día, la textura, el color.`;

/** Una llamada por pieza. Devuelve las tomas con `plano`, `movimiento` y `reusa`. */
export async function dirigir({ tomas, escenas, tema, config, senal }) {
  if (!tomas?.length) throw new Error('No hay tomas que dirigir. Segmenta el guion primero.');

  const proporcion = config?.movimiento?.proporcion ?? 0.15;
  const cupo = Math.max(0, Math.round(tomas.length * proporcion));

  const r = await llamar(
    'texto',
    {
      sistema: SISTEMA,
      instruccion:
        `Documental sobre: ${tema}\n` +
        `Escenas: ${escenas.map((e) => `[${e.n}] ${e.titulo || 'sin título'}`).join(', ')}\n` +
        `Tomas: ${tomas.length}. Cupo de tomas con movimiento: ${cupo} como mucho.\n\n` +
        tomas.map((t) => `(${t.i}) [escena ${t.escena}] ${t.texto}`).join('\n') +
        `\n\nDevuelve una ficha de plano por cada una de las ${tomas.length} tomas, ` +
        `con el índice i exacto.`,
      esquema: ESQUEMA,
      temperatura: 0.6,
      maxTokens: Math.min(32768, 400 + tomas.length * 180),
    },
    { senal },
  );

  const planos = new Map((r.json?.planos || []).map((p) => [p.i, p]));

  // El modelo propuso; aquí se decide. El cupo de movimiento es del presupuesto, no
  // suyo: se ordenan los candidatos y se corta (§4.7).
  const candidatos = tomas
    .map((t) => ({ i: t.i, quiere: !!planos.get(t.i)?.merecemovimiento }))
    .filter((x) => x.quiere)
    .map((x) => x.i);
  const conMovimiento = new Set(candidatos.slice(0, cupo));

  return tomas.map((t) => {
    const p = planos.get(t.i);
    if (!p) {
      // Una toma sin plano no se inventa aquí en silencio: se deja marcada para que
      // la pantalla lo diga y se pueda repetir solo esa parte.
      return { ...t, plano: null };
    }

    // `igualQue` solo vale hacia atrás y hacia una toma que existe: si no, la
    // resolución de `reusa` daría vueltas o apuntaría al vacío (§3).
    const reusa =
      Number.isInteger(p.igualQue) && p.igualQue >= 0 && p.igualQue < t.i && !conMovimiento.has(t.i)
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

/**
 * Cuántas tomas quedaron sin plano. La pantalla lo enseña y se puede repetir solo
 * esa parte: cada fase se puede repetir sola y solo cobra lo que genera (§4).
 */
export function sinDirigir(tomas) {
  return tomas.filter((t) => !t.plano).map((t) => t.i);
}
