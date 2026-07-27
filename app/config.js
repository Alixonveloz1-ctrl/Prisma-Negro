// La configuración y su normalizador (§7.2 y §7.3 del plano).
//
// §7.2 — El error: se arreglaba un valor por defecto, pero al recuperar el proyecto
// de la nube se cargaba el guardado sin pasar por la reparación. El arreglo nunca
// llegaba al usuario.
//
// La lección, y aquí está aplicada: UNA SOLA función normaliza la configuración, y
// TODOS los caminos de carga pasan por ella. Incluida la recuperación remota.
//
// Los caminos de carga son exactamente tres, y los tres llaman a `normalizar`:
//   1. proyecto nuevo            → app/estado.js  (nuevoProyecto)
//   2. recuperado de IndexedDB   → app/estado.js  (cargarLocal)
//   3. recuperado de la nube     → app/estado.js  (cargarRemoto)   ← el que se olvidó
//
// La auditoría comprueba que no hay un cuarto camino que se la salte.

import { PREDETERMINADO as SEGMENTACION } from '../comun/segmentar.mjs';

/**
 * Catálogo de modelos.
 *
 * Los retirados no se borran de la lista: se marcan, y el normalizador los
 * sustituye por su relevo. Si se borraran, un proyecto viejo cargaría con un valor
 * que no está en el desplegable y se quedaría en blanco.
 */
export const MODELOS = {
  texto: [
    { id: 'gemini-2.5-pro', etiqueta: 'Texto — cuidadoso (guion, dirección)' },
    { id: 'gemini-2.5-flash', etiqueta: 'Texto — rápido y barato' },
    { id: 'gemini-1.5-pro', etiqueta: 'Texto — anterior', retirado: 'gemini-2.5-pro' },
  ],
  imagen: [
    // §4.6: el modelo tiene que aceptar imágenes de referencia para que los sujetos
    // y los lugares se parezcan entre tomas. No todos lo hacen, y la etiqueta lo
    // dice en castellano llano: «acepta referencias» no significa nada para quien no
    // haya leído el plano.
    {
      id: 'gemini-2.5-flash-image',
      etiqueta: 'Mantiene el parecido entre tomas (recomendado)',
      referencias: true,
    },
    {
      id: 'imagen-4.0-generate-001',
      etiqueta: 'Más detalle, pero cada toma sale distinta',
      referencias: false,
    },
  ],
  video: [
    { id: 'veo-3.1-generate-preview', etiqueta: 'Clips de video — actual' },
    { id: 'veo-3.0-generate-001', etiqueta: 'Clips de video — anterior', retirado: 'veo-3.1-generate-preview' },
  ],
};

export const PREDETERMINADA = {
  version: 3,

  formato: {
    ancho: 1920,
    alto: 1080,
    fps: 30,
    // El PRD pide 16:9 y 9:16. El vertical se monta desde la misma hoja.
    vertical: false,
  },

  // Vacío = el que tenga el servidor en MODELO_TEXTO. Se elige en Ajustes de una
  // lista de los que el proyecto de la nube TIENE de verdad, no de una escrita a
  // mano que envejece sola.
  texto: { modelo: '' },

  segmentacion: { ...SEGMENTACION },

  narracion: {
    // §4.5: el episodio se reparte en bloques de unos 45 segundos.
    segundosPorBloque: 45,
    // §6: la voz limita el texto por llamada. Presupuesto en BYTES: una tilde son
    // dos, y en español eso no es un detalle.
    topeBytesPorLlamada: 4000,
    // §7.9: consistencia sobre expresividad. Los modelos expresivos interpretan
    // cada llamada como una actuación nueva y la voz cambia cada cuarenta y cinco
    // segundos. En quince minutos de narración eso es inaceptable.
    nombreVoz: 'es-US-Neural2-B',
    // §7.9: apagado por defecto. Encenderlo trae las Chirp y compañía, que suenan
    // mejor en una frase y peor en quince minutos.
    vocesExpresivas: false,
    // Solo lo usan las voces de Gemini, que aceptan una indicación de entrega.
    // Mandar SIEMPRE la misma es lo que más acerca la llamada 23 a la llamada 1.
    estilo: 'Narra en tono documental, sobrio y parejo, ritmo constante, sin dramatizar.',
    velocidad: 0.96,
    tono: -1,
    // §7.8: un dedal de silencio delante de la primera toma de cada llamada. Sin
    // esto el reproductor se come el ataque del primer fonema al cambiar de trozo.
    silencioInicialMs: 120,
  },

  imagen: {
    modelo: 'gemini-2.5-flash-image',
    // §6: toda imagen que se envía se reduce antes. Las referencias, a ~1024 px de
    // lado: el codificador visual de los modelos trabaja por ahí y lo que sobra lo
    // tira él. Nunca hagas una excepción «porque este caso es especial»: esa
    // excepción es el bug.
    ladoReferencia: 1024,
    maxReferencias: 3,
    // §8.2: la decisión de diseño más importante de un proyecto documental.
    // El valor por defecto es el seguro.
    tipoPorDefecto: 'reconstruccion',
    // Con esto en `true`, la fase de imagen se niega a pedir fotorrealismo de
    // personas reales identificables. Se puede apagar, pero hay que apagarlo a
    // mano y sabiendo lo que se hace.
    prohibirFotorrealismoDePersonasReales: true,
  },

  movimiento: {
    modelo: 'veo-3.1-generate-preview',
    // §4.7: es la fase MÁS CARA CON DIFERENCIA. La palanca principal del
    // presupuesto es qué proporción de tomas lleva movimiento.
    // §8.5: en documental, esa proporción baja.
    proporcion: 0.15,
    segundosPorClip: 6,
  },

  musica: {
    activa: true,
    // §5.4: fundidos largos. Con fundidos cortos el relevo se oye como un tajo.
    fundido: 2.5,
    volumen: 0.55,
  },

  marca: {
    activa: true,
    texto: '',
    // §4.9: la marca del canal NO la dibuja el modelo: la dibuja el navegador sobre
    // un lienzo, y así sale nítida y siempre igual.
    color: '#ffffff',
    opacidad: 0.85,
  },

  investigacion: {
    // §8.1: sin fichas no hay documental, hay opinión.
    exigirFichas: true,
    minimoFichasPorEscena: 1,
  },
};

function esObjeto(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function mezclar(base, encima) {
  const salida = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(encima || {})) {
    if (esObjeto(v) && esObjeto(base?.[k])) salida[k] = mezclar(base[k], v);
    else if (v !== undefined) salida[k] = v;
  }
  return salida;
}

/**
 * EL normalizador. El único.
 *
 * Rellena lo que falte, sustituye los modelos retirados por su relevo y sanea los
 * valores que estén fuera de rango. Es idempotente: normalizar dos veces da lo
 * mismo que normalizar una.
 */
export function normalizar(cruda) {
  const c = mezclar(PREDETERMINADA, cruda || {});

  c.imagen.modelo = vigente('imagen', c.imagen.modelo);
  c.movimiento.modelo = vigente('video', c.movimiento.modelo);

  // Un modelo de imagen que no acepta referencias no puede sostener la coherencia
  // entre tomas (§4.6). Se avisa aquí, y la fase de imagen lo tiene en cuenta.
  const fichaImg = MODELOS.imagen.find((m) => m.id === c.imagen.modelo);
  c.imagen.aceptaReferencias = !!fichaImg?.referencias;

  c.formato.ancho = entero(c.formato.ancho, 640, 3840, 1920);
  c.formato.alto = entero(c.formato.alto, 360, 2160, 1080);
  c.formato.fps = [24, 25, 30, 60].includes(c.formato.fps) ? c.formato.fps : 30;
  if (c.formato.vertical && c.formato.ancho > c.formato.alto) {
    [c.formato.ancho, c.formato.alto] = [c.formato.alto, c.formato.ancho];
  }

  c.segmentacion.segundosObjetivo = numero(c.segmentacion.segundosObjetivo, 3, 30, 11);
  c.segmentacion.segundosMaximo = Math.max(
    c.segmentacion.segundosObjetivo,
    numero(c.segmentacion.segundosMaximo, 4, 40, 16),
  );
  c.segmentacion.caracteresPorSegundo = numero(c.segmentacion.caracteresPorSegundo, 8, 25, 14.5);

  c.narracion.segundosPorBloque = numero(c.narracion.segundosPorBloque, 15, 90, 45);
  // El tope no se sube nunca por encima de lo que aguanta el servicio, aunque un
  // proyecto viejo lo traiga más alto.
  c.narracion.topeBytesPorLlamada = entero(c.narracion.topeBytesPorLlamada, 500, 4000, 4000);
  c.narracion.velocidad = numero(c.narracion.velocidad, 0.5, 1.5, 0.96);
  c.narracion.tono = numero(c.narracion.tono, -10, 10, -1);
  c.narracion.silencioInicialMs = entero(c.narracion.silencioInicialMs, 0, 500, 120);

  c.imagen.ladoReferencia = entero(c.imagen.ladoReferencia, 256, 1536, 1024);
  c.imagen.maxReferencias = entero(c.imagen.maxReferencias, 0, 6, 3);
  if (!['generada', 'archivo', 'reconstruccion'].includes(c.imagen.tipoPorDefecto)) {
    c.imagen.tipoPorDefecto = 'reconstruccion';
  }

  c.movimiento.proporcion = numero(c.movimiento.proporcion, 0, 1, 0.15);
  c.movimiento.segundosPorClip = [4, 6, 8].includes(c.movimiento.segundosPorClip)
    ? c.movimiento.segundosPorClip
    : 6;

  c.musica.fundido = numero(c.musica.fundido, 1.5, 3.5, 2.5);
  c.musica.volumen = numero(c.musica.volumen, 0, 1, 0.55);
  c.marca.opacidad = numero(c.marca.opacidad, 0, 1, 0.85);

  c.version = PREDETERMINADA.version;
  return c;
}

/** Sustituye un modelo retirado por su relevo. Devuelve siempre un id vigente. */
export function vigente(familia, id) {
  const lista = MODELOS[familia] || [];
  const ficha = lista.find((m) => m.id === id);
  if (!ficha) return lista.find((m) => !m.retirado)?.id || id;
  return ficha.retirado ? vigente(familia, ficha.retirado) : ficha.id;
}

function numero(v, min, max, porDefecto) {
  const n = Number(v);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, n));
}

function entero(v, min, max, porDefecto) {
  return Math.round(numero(v, min, max, porDefecto));
}

/**
 * Repinta un desplegable de modelos (§7.3).
 *
 * El error: un modelo retirado se corregía visualmente en el selector, pero el
 * objeto de configuración conservaba el valor viejo. La pantalla decía una cosa y
 * el estado otra.
 *
 * La lección: la función que repinta un control DEVUELVE el valor con el que se
 * quedó, y quien la llama lo ESCRIBE. Esta función no puede escribir en la config
 * ella sola —no la conoce— así que devolver es la única salida.
 */
export function pintarSelectorModelo(select, familia, idActual) {
  const elegido = vigente(familia, idActual);
  select.innerHTML = '';
  for (const m of MODELOS[familia] || []) {
    if (m.retirado) continue;
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.etiqueta;
    if (m.id === elegido) o.selected = true;
    select.appendChild(o);
  }
  // Quien llama DEBE escribir esto en la configuración. Si no lo hace, vuelve el
  // §7.3 exactamente igual que la primera vez.
  return elegido;
}

// ── Elegir el mejor modelo de texto ───────────────────────────────────────────
//
// «El director» es el modelo que lee el guion y decide: es donde más se nota la
// calidad y donde menos hay que ahorrar. Fijar un identificador a mano envejece —el
// que estaba puesto se quedó dos generaciones atrás sin que nadie lo notara—, así
// que el mejor se elige AUTOMÁTICAMENTE de lo que el proyecto tiene de verdad.
//
// Se ordena por versión primero y por gama después: un Pro de la generación anterior
// pierde contra un Pro de la nueva, y un Flash pierde contra un Pro de su misma
// generación.

export function puntuarModelo(id) {
  const m = /gemini-(\d+)(?:[.-](\d+))?/i.exec(id || '');
  if (!m) return 0;
  const version = Number(m[1]) * 100 + Number(m[2] || 0);
  const gama = /flash-?lite/i.test(id) ? 1 : /flash/i.test(id) ? 2 : /pro/i.test(id) ? 3 : 0;
  // Lo experimental empata con su versión pero pierde el desempate: si hay una
  // estable de la misma generación, se prefiere la estable.
  const estable = /preview|exp/i.test(id) ? 0 : 1;
  return version * 100 + gama * 10 + estable;
}

/** El mejor de una lista de identificadores. */
export function mejorModeloTexto(ids) {
  return [...(ids || [])].sort((a, b) => puntuarModelo(b) - puntuarModelo(a))[0] || '';
}

/**
 * La etiqueta que sale en el desplegable.
 * El mejor se marca, y el barato también: son las dos decisiones que se toman ahí.
 */
export function etiquetaModelo(id, mejor) {
  const bonito = String(id)
    .replace(/^gemini-/, 'Gemini ')
    .replace(/-(pro|flash-lite|flash)/i, (_, g) => ' ' + g.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()))
    .replace(/-(preview|exp).*/i, ' (previo)');
  if (id === mejor) return `${bonito} — el mejor director`;
  if (/flash-?lite/i.test(id)) return `${bonito} — el más barato`;
  if (/flash/i.test(id)) return `${bonito} — rápido y barato`;
  return bonito;
}
