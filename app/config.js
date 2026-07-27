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
import { ESTILOS, ESTILO_POR_DEFECTO } from '../comun/estilos.mjs';

// Ya no hay catálogo de modelos escrito a mano.
//
// Lo hubo, y fue el fallo: la lista decía lo que yo creía el día que la escribí,
// así que el director se quedó dos generaciones atrás sin que nadie lo notara y los
// generadores de imagen y video ofrecían dos opciones con nombres que no decían ni
// qué hacían ni cuánto costaban.
//
// Ahora se le pregunta al proyecto qué tiene —`modelos.catalogo`— y se ordena por
// versión y por gama con `ordenarFamilia`, que está al final de este archivo.

export const PREDETERMINADA = {
  version: 3,

  formato: {
    ancho: 1920,
    alto: 1080,
    fps: 30,
    // El PRD pide 16:9 y 9:16. El vertical se monta desde la misma hoja.
    vertical: false,
  },

  // Un modelo por familia, elegido de los que el proyecto TIENE de verdad. Vacío =
  // lo elige la herramienta.
  imagenModelo: { modelo: '', aMano: false },
  videoModelo: { modelo: '', aMano: false },
  vozModelo: { modelo: '', aMano: false },

  texto: {
    // El modelo que se está usando. Se elige de los que el proyecto TIENE de verdad.
    modelo: '',
    // Si lo eligió la persona o lo eligió la herramienta.
    //
    // §7.2 en estado puro: si esto no existiera, un proyecto guardado con el mejor
    // modelo DE ENTONCES se quedaría ahí para siempre, y salir un modelo nuevo no le
    // llegaría nunca. Mientras sea automático se revisa en cada carga y sube solo;
    // en cuanto se toca el desplegable, manda la persona y no se toca más.
    aMano: false,
  },

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
    // Vacío: lo pone el sondeo al proyecto. Escrito a mano envejece solo.
    modelo: '',
    // §6: toda imagen que se envía se reduce antes. Las referencias, a ~1024 px de
    // lado: el codificador visual de los modelos trabaja por ahí y lo que sobra lo
    // tira él. Nunca hagas una excepción «porque este caso es especial»: esa
    // excepción es el bug.
    ladoReferencia: 1024,
    maxReferencias: 3,
    // §8.2: la decisión de diseño más importante de un proyecto documental.
    // El valor por defecto es el seguro.
    tipoPorDefecto: 'reconstruccion',
    // El estilo visual, del catálogo de comun/estilos.mjs.
    estilo: ESTILO_POR_DEFECTO,
    // Con esto en `true`, la fase de imagen se niega a pedir fotorrealismo de
    // personas reales identificables. Se puede apagar, pero hay que apagarlo a
    // mano y sabiendo lo que se hace.
    prohibirFotorrealismoDePersonasReales: true,
  },

  movimiento: {
    // Vacío: lo pone el sondeo al proyecto.
    modelo: '',
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

  // Los de imagen y video vienen del sondeo, así que no se corrigen contra una
  // lista: se respeta lo elegido y ya.
  c.imagen.modelo = c.imagenModelo?.modelo || c.imagen.modelo;
  c.movimiento.modelo = c.videoModelo?.modelo || c.movimiento.modelo;

  // Un modelo de imagen que no acepta referencias no puede sostener la coherencia
  // entre tomas (§4.6). Se avisa aquí, y la fase de imagen lo tiene en cuenta.
  // Los modelos «...-image» de Gemini aceptan referencias; los «imagen-...» no.
  c.imagen.aceptaReferencias = /gemini.*image/i.test(c.imagen.modelo || '');

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
  if (!ESTILOS.some((e) => e.id === c.imagen.estilo)) c.imagen.estilo = ESTILO_POR_DEFECTO;

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

function numero(v, min, max, porDefecto) {
  const n = Number(v);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, n));
}

function entero(v, min, max, porDefecto) {
  return Math.round(numero(v, min, max, porDefecto));
}

/**
 * §7.3 sigue vivo aunque el selector de modelos ya no lo use: la función que repinta
 * un control DEVUELVE el valor con el que se quedó, y quien la llama lo ESCRIBE.
 * Un modelo retirado se corregía en el selector y el objeto de configuración
 * conservaba el valor viejo — la pantalla decía una cosa y el estado otra.
 *
 * Quien pinte un desplegable de estos tiene que seguir haciéndolo así.
 */
export function pintarSelector(select, opciones, idActual) {
  const elegido = opciones.some((o) => o.id === idActual) ? idActual : opciones[0]?.id || '';
  select.innerHTML = '';
  for (const o of opciones) {
    const el = document.createElement('option');
    el.value = o.id;
    el.textContent = o.etiqueta;
    if (o.id === elegido) el.selected = true;
    select.appendChild(el);
  }
  // Quien llama DEBE escribir esto en la configuración.
  return elegido;
}

// ── El mejor modelo de texto ──────────────────────────────────────────────────

export function puntuarModelo(id) {
  const m = /gemini-(\d+)(?:[.-](\d+))?/i.exec(id || '');
  if (!m) return 0;
  const version = Number(m[1]) * 100 + Number(m[2] || 0);
  const gama = /flash-?lite/i.test(id) ? 1 : /flash/i.test(id) ? 2 : /pro/i.test(id) ? 3 : 0;
  // Lo experimental empata con su versión pero pierde el desempate.
  const estable = /preview|exp/i.test(id) ? 0 : 1;
  return version * 100 + gama * 10 + estable;
}

/** El mejor de una lista de identificadores. */
export function mejorModeloTexto(ids) {
  return [...(ids || [])].sort((a, b) => puntuarModelo(b) - puntuarModelo(a))[0] || '';
}

/** La etiqueta del desplegable de texto. */
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

// ── Gama de un modelo ─────────────────────────────────────────────────────────
//
// Entre los generadores de imagen y de video de una misma versión hay mucha
// diferencia de precio, y el identificador no lo dice: «veo-3.1-lite-generate-001»
// y «veo-3.1-generate-001» se parecen y cuestan cosas muy distintas. La etiqueta
// tiene que decirlo, porque es la decisión que se toma en ese desplegable.

export function gamaDe(id) {
  const s = String(id).toLowerCase();
  if (/-lite/.test(s)) return { nivel: 1, etiqueta: 'el más económico' };
  if (/-fast/.test(s)) return { nivel: 2, etiqueta: 'equilibrado' };
  if (/-ultra|-pro/.test(s)) return { nivel: 4, etiqueta: 'máxima calidad' };
  if (/-flash/.test(s)) return { nivel: 2, etiqueta: 'rápido y barato' };
  return { nivel: 3, etiqueta: 'calidad alta' };
}

export function versionDe(id) {
  const m = /(\d+)(?:[.-](\d+))?/.exec(String(id).replace(/^[a-z-]+/i, '')) ;
  return m ? Number(m[1]) * 100 + Number(m[2] || 0) : 0;
}

/**
 * Ordena una familia: primero la versión, después la gama.
 * Y etiqueta marcando la generación anterior, que es lo que uno quiere evitar sin
 * darse cuenta.
 */
export function ordenarFamilia(ids) {
  const maxVersion = Math.max(0, ...ids.map(versionDe));
  // La gama más alta DENTRO de la versión más nueva es «máxima calidad», se llame
  // «pro» o no lleve sufijo: en Veo la cara es la que no lleva apellido.
  const topeGama = Math.max(0, ...ids.filter((i) => versionDe(i) === maxVersion).map((i) => gamaDe(i).nivel));
  return [...ids]
    .sort((a, b) => versionDe(b) - versionDe(a) || gamaDe(b).nivel - gamaDe(a).nivel)
    .map((id) => {
      const g = gamaDe(id);
      const viejo = versionDe(id) < maxVersion;
      if (!viejo && g.nivel === topeGama && topeGama >= 3) g.etiqueta = 'máxima calidad';
      const bonito = id
        .replace(/^veo-/, 'Veo ')
        .replace(/^gemini-/, 'Gemini ')
        .replace(/^imagen-/, 'Imagen ')
        .replace(/-generate.*$|-preview$/i, '')
        .replace(/-(lite|fast|pro|ultra|flash|image|tts)/gi, (_, w) => ' ' + w.replace(/^./, (c) => c.toUpperCase()));
      return { id, etiqueta: `${bonito} — ${viejo ? 'generación anterior' : g.etiqueta}`, viejo, gama: g.nivel };
    });
}

/** El equilibrado de una familia: la gama media de la versión más nueva. */
export function equilibradoDe(ids) {
  const nuevos = ordenarFamilia(ids).filter((m) => !m.viejo);
  return (nuevos.find((m) => m.gama === 2) || nuevos[Math.floor(nuevos.length / 2)] || nuevos[0])?.id || '';
}
