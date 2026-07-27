// Fase 5 — Narración (§4.5 del plano). La fase con más trampas.
//
// Resumen de las cuatro cosas que hay que hacer bien, y por qué:
//
//  1. El servicio de voz limita el texto por llamada (~4.000 bytes). El episodio se
//     reparte en BLOQUES de unos 45 segundos.
//
//     Los 45 segundos no son un número redondo cualquiera: 45 s de PCM a 24 kHz en
//     mono son ~2,1 MB, que en base64 son ~2,9 MB, que caben en los 4,5 MB de la
//     respuesta. Con bloques de escena entera NO caben — y el error que devuelve la
//     plataforma dice «tiempo agotado», que es mentira (§7.1). Si alguna vez alguien
//     sube este número «porque así hay menos llamadas», vuelve el mismo bug con el
//     mismo mensaje engañoso.
//
//  2. El progreso se cuenta en LLAMADAS, no en tomas. Una barra que avanza por
//     tomas da saltos de siete en siete y parece rota.
//
//  3. Cada bloque se genera entero y luego SE CORTA POR LOS SILENCIOS para
//     repartirlo entre sus tomas.
//
//  4. La duración REAL medida vuelve al modelo de datos: es la que manda en el
//     montaje. La estimada solo servía para agrupar.
//
// Y dos más, de §7:
//  - §7.8: un dedal de silencio (~120 ms) delante de la primera toma de cada
//    llamada, o el reproductor se come el ataque del primer fonema.
//  - §7.9: para narración larga, CONSISTENCIA sobre expresividad. Un modelo de
//    entrega fija suena más plano pero es el mismo narrador de principio a fin.

import { llamar } from '../api.js';
import { bloquesDeNarracion } from '../cola.js';
import { leerWav, escribirWav, repartirBloque } from '../../comun/audio.mjs';
import { claveToma } from '../../comun/claves.mjs';
import { deBase64, aBase64 } from '../imagenes.js';

/**
 * Prepara las llamadas. Se expone aparte para que la pantalla pueda decir «esto son
 * 23 llamadas» ANTES de empezar a gastar.
 */
export function planificar(tomas, config, { soloLasQueFaltan = true } = {}) {
  // §4: todas las fases tienen modo «solo las que faltan». Un bloque se rehace
  // entero si le falta el audio a alguna de sus tomas: el corte por silencios es
  // solidario entre las tomas del bloque y no se puede rehacer media.
  const bloques = bloquesDeNarracion(tomas, config);
  if (!soloLasQueFaltan) return bloques;
  return bloques.filter((b) => b.tomas.some((t) => t.audio !== 'ok'));
}

/**
 * Genera un bloque: una llamada de voz, un corte por silencios, y una subida por
 * toma.
 *
 * Devuelve las tomas actualizadas con su duración REAL. No escribe en el proyecto:
 * de eso se encarga quien llama, y por eso puede escribir cada unidad antes de
 * pasar a la siguiente (§4).
 */
export async function narrarBloque({ bloque, pieza, config, senal }) {
  const n = config.narracion;

  const r = await llamar(
    'voz',
    {
      texto: bloque.texto,
      nombreVoz: n.nombreVoz,
      velocidad: n.velocidad,
      tono: n.tono,
      // El mismo brief en TODAS las llamadas: es lo que mantiene parejo al narrador
      // a lo largo de quince minutos con las voces que interpretan (§7.9).
      estilo: n.estilo,
    },
    { senal },
  );

  const audio = leerWav(await (await fetch(`data:audio/wav;base64,${r.datos}`)).arrayBuffer());

  // Los objetivos son las duraciones ESTIMADAS de la segmentación. `repartirBloque`
  // las escala a lo que el audio dura de verdad y busca el silencio más cercano a
  // cada frontera.
  const objetivos = bloque.tomas.map((t) => t.segundos || 1);
  const trozos = repartirBloque(audio, objetivos, {
    // §7.8: el dedal va DENTRO del primer trozo, así que forma parte de su duración
    // medida y llega al montaje sin que nadie tenga que acordarse de sumarlo.
    silencioInicialMs: n.silencioInicialMs,
  });

  const salida = [];
  for (let k = 0; k < bloque.tomas.length; k++) {
    if (senal?.aborted) throw new Error('Detenido.');
    const toma = bloque.tomas[k];
    const trozo = trozos[k];
    if (!trozo) {
      salida.push({ ...toma, audio: 'falta' });
      continue;
    }

    const wav = escribirWav(trozo);
    const clave = claveToma(pieza, toma.i, 'audio');
    const subida = await llamar(
      'subir',
      { clave, datos: await aBase64(new Blob([wav])), tipo: 'audio/wav' },
      { senal },
    );

    // §7.12: ningún valor de retorno de una escritura se ignora. Una toma cuyo audio
    // «se generó» pero no está en el almacén rompe el montaje media hora después,
    // con un código de salida y ningún mensaje.
    if (!subida.guardado?.bytes) {
      throw new Error(`El audio de la toma ${toma.i} no quedó confirmado en el almacén.`);
    }

    salida.push({
      ...toma,
      audio: 'ok',
      // LA DURACIÓN REAL. A partir de aquí manda esta, no la estimada.
      segundos: +trozo.segundos.toFixed(4),
      medida: true,
      // Un corte sin silencio cerca cae en mitad de lo que sea. Que viaje en el
      // modelo es lo que permite enseñarlo en pantalla en vez de que el usuario lo
      // descubra oyendo el video montado.
      corteForzado: !!trozo.forzado,
    });
  }

  return salida;
}

/**
 * Devuelve el audio de una toma como Blob, para escucharlo antes de montar.
 * Baja por trozos: el tope de la respuesta son 4,5 MB (§6).
 */
export async function oirToma({ pieza, i, senal }) {
  const clave = claveToma(pieza, i, 'audio');
  const partes = [];
  let desde = 0;
  let total = null;

  do {
    const r = await llamar('bajar', { clave, desde }, { senal });
    if (!r.existe) return null;
    partes.push(deBase64(r.datos, 'audio/wav'));
    total = r.total;
    desde = r.hasta + 1;
  } while (total && desde < total);

  return new Blob(partes, { type: 'audio/wav' });
}

/** Cuántas llamadas y cuántos minutos van a salir. Para enseñarlo antes de gastar. */
export function resumen(tomas, config) {
  const bloques = bloquesDeNarracion(tomas, config);
  const segundos = tomas.reduce((s, t) => s + (t.segundos || 0), 0);
  return {
    llamadas: bloques.length,
    tomas: tomas.length,
    minutos: +(segundos / 60).toFixed(1),
    faltan: planificar(tomas, config).length,
  };
}
