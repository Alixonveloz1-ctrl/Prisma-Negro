// Audio: leer, escribir, medir y CORTAR POR LOS SILENCIOS (§4.5, §7.8 del plano).
//
// Es un módulo común y sin dependencias del navegador a propósito: el corte por
// silencios es la lógica más delicada de la narración, y poder ejecutarla en el
// banco de pruebas con datos sintéticos —en un segundo, en vez de después de pagar
// una generación de voz— es lo que hace que se pueda arreglar.
//
// Todo lo que pasa por aquí es PCM. La voz nunca se corta ni se pega comprimida
// (§5.3): pegar trozos de audio comprimido mete un chasquido en cada unión, porque
// cada trozo lleva muestras de precarga y relleno al final y al concatenar por copia
// esos bordes quedan dentro.

/** Lee un WAV PCM de 16 bits. */
export function leerWav(buffer) {
  const dv = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
  const leer4 = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));

  if (leer4(0) !== 'RIFF' || leer4(8) !== 'WAVE') {
    throw new Error('Esto no es un WAV: falta la cabecera RIFF/WAVE.');
  }

  let pos = 12;
  let frecuencia = 0;
  let canales = 1;
  let bits = 16;
  let datos = null;

  while (pos + 8 <= dv.byteLength) {
    const tipo = leer4(pos);
    const largo = dv.getUint32(pos + 4, true);
    const cuerpo = pos + 8;

    if (tipo === 'fmt ') {
      canales = dv.getUint16(cuerpo + 2, true);
      frecuencia = dv.getUint32(cuerpo + 4, true);
      bits = dv.getUint16(cuerpo + 14, true);
    } else if (tipo === 'data') {
      const fin = Math.min(cuerpo + largo, dv.byteLength);
      datos = new Int16Array(dv.buffer.slice(dv.byteOffset + cuerpo, dv.byteOffset + fin));
    }
    // Los trozos van alineados a 2 bytes: sin esto, un WAV con un trozo de largo
    // impar descoloca todo lo que venga detrás.
    pos = cuerpo + largo + (largo % 2);
  }

  if (bits !== 16) throw new Error(`Solo trabajamos con PCM de 16 bits; este trae ${bits}.`);
  if (!datos) throw new Error('El WAV no trae trozo de datos.');
  if (!frecuencia) throw new Error('El WAV no declara frecuencia de muestreo.');

  return { muestras: datos, frecuencia, canales };
}

export function escribirWav({ muestras, frecuencia, canales = 1 }) {
  const bytes = muestras.length * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const dv = new DataView(buf);
  const poner = (o, s) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };

  poner(0, 'RIFF');
  dv.setUint32(4, 36 + bytes, true);
  poner(8, 'WAVE');
  poner(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, canales, true);
  dv.setUint32(24, frecuencia, true);
  dv.setUint32(28, frecuencia * canales * 2, true); // bytes por segundo
  dv.setUint16(32, canales * 2, true); // alineación de bloque
  dv.setUint16(34, 16, true);
  poner(36, 'data');
  dv.setUint32(40, bytes, true);

  new Int16Array(buf, 44).set(muestras);
  return buf;
}

/** Duración REAL en segundos. La estimada no sirve para el montaje (§4.5). */
export function duracion({ muestras, frecuencia, canales = 1 }) {
  return muestras.length / canales / frecuencia;
}

export function silencioDe(ms, frecuencia, canales = 1) {
  return new Int16Array(Math.round((ms / 1000) * frecuencia) * canales);
}

/**
 * Localiza los silencios.
 *
 * El umbral es RELATIVO al pico del bloque, no absoluto: una locución susurrada y
 * otra a plena voz tienen suelos de ruido distintos, y un umbral fijo o parte por
 * la mitad una palabra floja o no encuentra ningún silencio.
 */
export function silencios({ muestras, frecuencia, canales = 1 }, opciones = {}) {
  const { ventanaMs = 10, minimoMs = 130, relativo = 0.06 } = opciones;
  const porVentana = Math.max(1, Math.round((ventanaMs / 1000) * frecuencia)) * canales;

  let pico = 1;
  for (let i = 0; i < muestras.length; i++) {
    const v = Math.abs(muestras[i]);
    if (v > pico) pico = v;
  }
  const umbral = pico * relativo;

  const energia = [];
  for (let i = 0; i < muestras.length; i += porVentana) {
    let suma = 0;
    const fin = Math.min(i + porVentana, muestras.length);
    for (let j = i; j < fin; j++) suma += muestras[j] * muestras[j];
    energia.push(Math.sqrt(suma / Math.max(1, fin - i)));
  }

  const minimoVentanas = Math.max(1, Math.round(minimoMs / ventanaMs));
  const salida = [];
  let inicio = -1;

  for (let v = 0; v <= energia.length; v++) {
    const callado = v < energia.length && energia[v] < umbral;
    if (callado && inicio < 0) inicio = v;
    if (!callado && inicio >= 0) {
      if (v - inicio >= minimoVentanas) {
        salida.push({
          inicio: inicio * porVentana,
          fin: Math.min(v * porVentana, muestras.length),
          centro: Math.min(Math.round(((inicio + v) / 2) * porVentana), muestras.length),
        });
      }
      inicio = -1;
    }
  }

  return salida;
}

/**
 * Reparte un bloque de narración entre sus tomas (§4.5).
 *
 *   «Cada bloque se genera entero y luego se corta por los silencios para repartirlo
 *    entre sus tomas, buscando que cada trozo dure lo que su toma pide.»
 *
 * `objetivos` son los segundos que pide cada toma (la estimación de la
 * segmentación). Lo que sale de aquí son los cortes REALES, y de ellos sale la
 * duración real que vuelve al modelo de datos y manda en el montaje.
 *
 * Cuando cerca de una frontera no hay ningún silencio, se corta en el punto exacto y
 * se marca el trozo como `forzado`. No se calla: un corte forzado en mitad de una
 * palabra es algo que el usuario tiene que poder ver en pantalla.
 */
export function repartir(audio, objetivos, opciones = {}) {
  const { muestras, frecuencia, canales = 1 } = audio;
  const { toleranciaRelativa = 0.45, toleranciaMinimaS = 0.35 } = opciones;

  const marcosTotales = muestras.length / canales;
  if (!objetivos?.length) return [];
  if (objetivos.length === 1) {
    return [{ inicio: 0, fin: muestras.length, forzado: false, segundos: marcosTotales / frecuencia }];
  }

  // Los objetivos se escalan a lo que el audio dura DE VERDAD. La estimación de la
  // segmentación casi nunca acierta el total, y sin escalar los cortes se irían
  // desplazando hasta amontonarse al final.
  const sumaObjetivos = objetivos.reduce((a, b) => a + b, 0) || 1;
  const factor = marcosTotales / frecuencia / sumaObjetivos;

  const huecos = silencios(audio, opciones);
  const cortes = [0];
  // Un trozo nunca baja de esto: sin un mínimo, dos fronteras muy juntas pueden
  // producir un trozo de cero muestras y el montaje se queda sin audio en esa toma.
  const minimoMarcos = Math.round(0.15 * frecuencia);
  let acumulado = 0;

  for (let k = 0; k < objetivos.length - 1; k++) {
    acumulado += objetivos[k] * factor;
    const idealMarco = Math.round(acumulado * frecuencia);
    const tolerancia = Math.round(
      Math.max(objetivos[k] * factor * toleranciaRelativa, toleranciaMinimaS) * frecuencia,
    );

    // Deja sitio para los trozos que quedan por delante y para el que se cierra.
    const minimo = cortes[cortes.length - 1] / canales + minimoMarcos;
    const maximo = marcosTotales - minimoMarcos * (objetivos.length - 1 - k);

    let mejor = null;
    let mejorDistancia = Infinity;
    for (const h of huecos) {
      const centroMarco = Math.floor(h.centro / canales);
      if (centroMarco <= minimo || centroMarco >= maximo) continue;
      const d = Math.abs(centroMarco - idealMarco);
      if (d <= tolerancia && d < mejorDistancia) {
        mejorDistancia = d;
        mejor = centroMarco;
      }
    }

    const marco = mejor ?? Math.min(Math.max(idealMarco, minimo), Math.max(minimo, maximo));
    cortes.push(Math.round(marco) * canales);
    // Se anota AQUÍ, donde de verdad se sabe: si no hubo ningún silencio dentro de
    // la tolerancia, este corte cae en mitad de lo que sea. El usuario tiene que
    // poder verlo en pantalla, así que viaja con el trozo.
    cortes.forzado = cortes.forzado || [];
    cortes.forzado[k] = mejor === null;
  }
  cortes.push(muestras.length);

  const trozos = [];
  for (let k = 0; k < cortes.length - 1; k++) {
    const inicio = cortes[k];
    const fin = Math.max(cortes[k + 1], inicio + minimoMarcos * canales);
    trozos.push({
      inicio,
      fin: Math.min(fin, muestras.length),
      segundos: (Math.min(fin, muestras.length) - inicio) / canales / frecuencia,
      // El trozo k TERMINA en el corte k+1: el forzado es el de esa frontera.
      forzado: !!cortes.forzado?.[k],
    });
  }

  return trozos;
}

/**
 * Reparte un bloque en trozos ya listos para subir, con el dedal de silencio
 * delante del primero (§7.8).
 *
 *   «La primera toma de cada llamada empezaba en la muestra cero, pegada al primer
 *    fonema: al cambiar de archivo el reproductor pierde unos milisegundos y se come
 *    el ataque.»
 *
 * El silencio va DENTRO del primer trozo, así que forma parte de su duración medida
 * y llega al montaje sin que nadie tenga que acordarse de sumarlo.
 */
export function repartirBloque(audio, objetivos, opciones = {}) {
  const { silencioInicialMs = 120 } = opciones;
  const { muestras, frecuencia, canales = 1 } = audio;
  const trozos = repartir(audio, objetivos, opciones);

  return trozos.map((t, k) => {
    const cuerpo = muestras.subarray(t.inicio, t.fin);
    let salida = cuerpo;
    if (k === 0 && silencioInicialMs > 0) {
      const dedal = silencioDe(silencioInicialMs, frecuencia, canales);
      salida = new Int16Array(dedal.length + cuerpo.length);
      salida.set(dedal, 0);
      salida.set(cuerpo, dedal.length);
    }
    return {
      muestras: salida,
      frecuencia,
      canales,
      // Duración REAL: la que manda en el montaje (§4.5).
      segundos: salida.length / canales / frecuencia,
      forzado: t.forzado,
    };
  });
}
