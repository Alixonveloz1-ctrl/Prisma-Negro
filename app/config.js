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
import { PREDETERMINADO as MODELO, claveDe, grafiasDe } from '../comun/modelos.mjs';

// Los generadores viven en `comun/modelos.mjs`, en una tabla fija.
//
// Aquí solo se guarda CUÁL eligió el usuario, con la clave del catálogo —
// `nano-banana-2`, `veo-3.1-fast`— y no con el identificador técnico de Vertex.
// Esa diferencia importa: los identificadores cambian de grafía cuando un modelo
// sale de preview, y guardar la grafía dejaría la elección apuntando a un nombre
// muerto. La clave no cambia nunca.

export const PREDETERMINADA = {
  version: 3,

  formato: {
    ancho: 1920,
    alto: 1080,
    fps: 30,
    // El PRD pide 16:9 y 9:16. El vertical se monta desde la misma hoja.
    vertical: false,
  },

  // El generador elegido en cada familia, por su clave del catálogo. Vacío = la
  // primera carga pone el predeterminado. A partir de ahí manda lo que se eligió:
  // la aplicación no lo cambia sola nunca.
  imagenModelo: { modelo: MODELO.imagen },
  videoModelo: { modelo: MODELO.video },
  vozModelo: { modelo: MODELO.voz },

  texto: { modelo: MODELO.texto },

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
/**
 * Qué generador queda elegido tras actualizar.
 *
 * Aquí vive un §7.2 de manual y por eso está explicado entero.
 *
 * Antes la herramienta elegía el modelo sola y anotaba `aMano: false` para decir
 * «esto lo puse yo, no la persona». Al llegar el catálogo nuevo, esa elección
 * automática —hecha con la información de entonces— seguía guardada y el
 * desplegable la respetaba: el director se quedaba clavado en Gemini 2.5 Pro
 * aunque el catálogo ya ofreciera el 3.1 Pro. El arreglo estaba puesto y no
 * llegaba, tapado por un valor guardado. Exactamente el error del plano.
 *
 * La regla que lo resuelve: `aMano: false` significa que la persona nunca eligió
 * eso, así que no hay nada que conservar y manda el predeterminado de hoy. Una
 * elección de verdad se conserva siempre, y si estaba guardada como identificador
 * de Vertex se traduce a su clave en vez de perderse.
 */
function eleccionDeGenerador(familia, guardado) {
  if (guardado && guardado.aMano === false) return MODELO[familia];
  return claveDe(familia, guardado?.modelo) || MODELO[familia];
}

export function normalizar(cruda) {
  const c = mezclar(PREDETERMINADA, cruda || {});

  // Las elecciones de generador, traducidas al catálogo actual.
  for (const [familia, campo] of [
    ['texto', 'texto'],
    ['imagen', 'imagenModelo'],
    ['video', 'videoModelo'],
    ['voz', 'vozModelo'],
  ]) {
    c[campo] = { modelo: eleccionDeGenerador(familia, cruda?.[campo]) };
  }

  c.imagen.modelo = c.imagenModelo.modelo;
  c.movimiento.modelo = c.videoModelo.modelo;

  // Un modelo de imagen que no acepta referencias no puede sostener la coherencia
  // entre tomas (§4.6). Se mira contra las GRAFÍAS de la fila, no contra la clave:
  // desde que se guarda «nano-banana-2» en vez de «gemini-3.1-flash-image», una
  // comprobación sobre el texto de la clave decía que no acepta referencias y
  // apagaba en silencio lo que mantiene iguales a las personas entre tomas.
  c.imagen.aceptaReferencias = grafiasDe('imagen', c.imagen.modelo).some((id) =>
    /gemini.*image/i.test(id),
  );

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
