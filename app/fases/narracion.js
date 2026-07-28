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
  //
  // Y UN CORTE ESTIMADO CUENTA COMO FALTA. Es audio defectuoso: su final puede
  // caer a mitad de palabra y su texto va corrido respecto a la voz. Sin esto,
  // arreglar esos bloques exigía «rehacer todo» —volver a pagar las ochenta y
  // tres tomas para reparar cinco—. Así, el mismo botón de siempre repite solo
  // los bloques rotos, y lo exacto no se toca ni se vuelve a pagar.
  const bloques = bloquesDeNarracion(tomas, config);
  if (!soloLasQueFaltan) return bloques;
  return bloques.filter((b) =>
    b.tomas.some((t) => t.audio !== 'ok' || t.corteExacto === false),
  );
}

/**
 * Genera un bloque: una llamada de voz, un corte por silencios, y una subida por
 * toma.
 *
 * Devuelve las tomas actualizadas con su duración REAL. No escribe en el proyecto:
 * de eso se encarga quien llama, y por eso puede escribir cada unidad antes de
 * pasar a la siguiente (§4).
 */
/**
 * Voces que NUNCA devuelven marcas: las expresivas de Cloud (Chirp, Studio,
 * Journey) no admiten SSML, y las de Gemini van por otra puerta sin marcas.
 * Pedirles el bloque entero es pagar ese audio para tirarlo: se va directo
 * toma a toma, que con ellas es el único corte exacto posible.
 */
const VOZ_SIN_MARCAS = /chirp|studio|journey|^gemini:/i;

/** Narra un bloque toma a toma: cada llamada es una toma, exacta por construcción. */
async function narrarTomaAToma({ bloque, pieza, config, senal, alEsperar }) {
  const salida = [];
  for (const toma of bloque.tomas) {
    if (senal?.aborted) throw new Error('Detenido.');
    const solo = {
      ...bloque,
      tomas: [toma],
      texto: (toma.texto || '').trim(),
      segundos: toma.segundos || 1,
    };
    salida.push(...(await narrarBloque({ bloque: solo, pieza, config, senal, alEsperar })));
  }
  return salida;
}

export async function narrarBloque({ bloque, pieza, config, senal, alEsperar }) {
  const n = config.narracion;

  // Con una voz que no da marcas, el bloque entero no se pide: su audio se
  // tiraría. Toma a toma desde el principio.
  if (bloque.tomas.length > 1 && VOZ_SIN_MARCAS.test(n.nombreVoz || '')) {
    return narrarTomaAToma({ bloque, pieza, config, senal, alEsperar });
  }

  const r = await llamar(
    'voz',
    {
      texto: bloque.texto,
      // Los textos toma a toma. Con ellos el servicio de voz devuelve el segundo
      // exacto en que acaba cada uno, y el reparto deja de adivinarse.
      // `.trim()` igual que al componer `bloque.texto`: lo que se marca tiene que
      // ser EXACTAMENTE lo que se narra, o las marcas caerían corridas.
      marcas: bloque.tomas.map((t) => (t.texto || '').trim()),
      nombreVoz: n.nombreVoz,
      velocidad: n.velocidad,
      tono: n.tono,
      // El mismo brief en TODAS las llamadas: es lo que mantiene parejo al narrador
      // a lo largo de quince minutos con las voces que interpretan (§7.9).
      estilo: n.estilo,
    },
    { senal, alEsperar },
  );

  const audio = leerWav(await (await fetch(`data:audio/wav;base64,${r.datos}`)).arrayBuffer());

  // SIN MARCAS NO SE ADIVINA: SE NARRA TOMA A TOMA.
  //
  // ─────────────────────────────────────────────────────────────────────────────
  // Cuando el servicio no devolvía sus tiempos —voces sin SSML, o una respuesta
  // con las marcas incompletas—, esto caía EN SILENCIO a estimar el corte. El
  // corte estimado cae donde sea: a mitad de palabra, a mitad de frase. Y desde
  // que existe el respiro, encima se le plantaban ahí unos segundos de silencio
  // «de tensión»: una pausa dramática en mitad de una palabra.
  //
  // La salida no es estimar mejor: es NO CORTAR. Un bloque de UNA toma no se
  // corta —el audio entero es la toma, exacto por construcción—, así que cuando
  // no hay tiempos se repite la narración toma a toma. Cuesta más llamadas una
  // vez; adivinar costaba el documental entero cada vez.
  // ─────────────────────────────────────────────────────────────────────────────
  if (!r.tiempos && bloque.tomas.length > 1) {
    return narrarTomaAToma({ bloque, pieza, config, senal, alEsperar });
  }

  // Con una sola toma no hay nada que cortar: el final del audio ES el final de
  // la toma, y ese tiempo se declara para que el trozo salga marcado EXACTO.
  const tiempos =
    r.tiempos || (bloque.tomas.length === 1 ? [audio.muestras.length / audio.frecuencia] : null);

  const objetivos = bloque.tomas.map((t) => t.segundos || 1);
  const trozos = repartirBloque(audio, objetivos, {
    tiempos,
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
      { senal, alEsperar },
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
      // Si el corte lo dijo el servicio de voz. Cuando NO es exacto, el audio de
      // esta toma puede llevar dentro palabras de la siguiente —el corte suena
      // bien y el texto no corresponde—, y eso tiene que poder verse en pantalla.
      corteExacto: !!trozo.exacto,
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
