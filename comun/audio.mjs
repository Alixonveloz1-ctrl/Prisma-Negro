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
      // EL TAMAÑO DECLARADO NO SIEMPRE ES EL TAMAÑO. Un servicio que escribe la
      // cabecera antes de saber cuánto audio va a salir deja ahí un cero o un
      // 0xFFFFFFFF. Con el cero a rajatabla el archivo se queda sin una sola
      // muestra —y un <audio> con eso marca 00:00 y no suena—; pasado de largo,
      // se sale del archivo. En los dos casos manda lo que hay de verdad.
      const resto = dv.byteLength - cuerpo;
      const util = largo > 0 && largo <= resto ? largo : resto;
      const fin = cuerpo + Math.max(0, util);
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

/**
 * La versión del medidor de tono. Sube cuando el medidor cambia de resultado.
 *
 * La v1 cogía el máximo absoluto de la autocorrelación y se iba de octava por
 * encima de 150 Hz. Las piezas medidas con ella llevan la mitad de los valores a
 * la mitad de lo que son, y aplicarlos hunde unas tomas y deja otras. Un número
 * de tono sin su versión no se puede usar: no hay forma de saber, mirándolo, si
 * está bien o es la mitad.
 */
export const MEDIDOR_DE_TONO = 2;

function analizarPeriodo(x, sr) {
  const MIN = Math.max(2, Math.floor(sr / 300));
  const MAX = Math.floor(sr / 70);
  const ANALISIS = 2048;
  if (x.length < ANALISIS + MAX) return { periodo: 0, confianza: 0 };

  // El trozo más sonoro: un silencio no tiene periodo.
  let arranque = 0;
  let masEnergia = -1;
  const paso = Math.max(1, Math.floor((x.length - ANALISIS - MAX) / 8));
  for (let ini = 0; ini + ANALISIS + MAX <= x.length; ini += paso) {
    let e = 0;
    for (let i = ini; i < ini + ANALISIS; i += 8) e += x[i] * x[i];
    if (e > masEnergia) {
      masEnergia = e;
      arranque = ini;
    }
  }

  let e0 = 0;
  for (let i = 0; i < ANALISIS; i++) e0 += x[arranque + i] * x[arranque + i];
  if (!e0) return { periodo: 0, confianza: 0 };

  // Autocorrelación NORMALIZADA de verdad, en [-1, 1]: así el valor de la cima
  // significa algo —cuánta periodicidad hay— y se puede exigir un mínimo.
  const r = new Float64Array(MAX + 1);
  let cima = 0;
  for (let lag = MIN; lag <= MAX; lag++) {
    let num = 0;
    let e1 = 0;
    for (let i = 0; i < ANALISIS; i++) {
      const b = x[arranque + i + lag];
      num += x[arranque + i] * b;
      e1 += b * b;
    }
    r[lag] = e1 > 0 ? num / Math.sqrt(e0 * e1) : 0;
    if (r[lag] > cima) cima = r[lag];
  }
  // Sin periodicidad clara no se inventa un tono: vale más no corregir que
  // corregir con un número inventado.
  if (cima < 0.45) return { periodo: 0, confianza: cima };

  // EL PRIMER LAG QUE LLEGA AL 90 % DE LA CIMA, no el máximo absoluto.
  //
  // «Ahora se escucha una toma grave, una normal, una grave, una normal.»
  //
  // Una señal periódica correlaciona casi IGUAL en T, en 2T y en 3T —por
  // definición—, así que quedarse con el máximo absoluto es echar a suertes entre
  // ellos. Elegir 2T es medir el tono una octava por debajo, y con la mitad de las
  // tomas medidas bien y la otra mitad una octava abajo, la mediana cae en medio y
  // el igualador hunde unas y deja otras: eso es la alternancia que se oyó.
  // Medido antes de esto: a 165 y 180 Hz devolvía 82,5 y 89,9.
  for (let lag = MIN; lag <= MAX; lag++) {
    if (r[lag] < cima * 0.9) continue;
    // Y desde ahí se sube hasta la cima de ESE lóbulo. El umbral se cruza en la
    // cuesta, unos puntos antes del vértice, y quedarse en el cruce medía todos
    // los tonos un 4 % altos —da igual para igualar entre tomas, porque el sesgo
    // es el mismo en todas, pero un número que dice ser hercios tiene que serlo—.
    let cumbre = lag;
    while (cumbre + 1 <= MAX && r[cumbre + 1] > r[cumbre]) cumbre++;
    return { periodo: cumbre, confianza: r[cumbre] };
  }
  return { periodo: 0, confianza: cima };
}

/**
 * El periodo de la voz en muestras. Para el agravador, que necesita UNO siempre:
 * si no se puede medir, el de una voz masculina corriente.
 */
export function periodoDeVoz(x, sr) {
  return analizarPeriodo(x, sr).periodo || Math.round(sr / 110);
}

/**
 * El tono de la voz en hercios, o CERO si no se puede medir con confianza.
 *
 * Distinto de `periodoDeVoz` a propósito: aquí un número inventado no es
 * inofensivo. Con él se igualan las tomas entre sí, y una medida mala no
 * desafina esa toma sola — corre la referencia y desafina la pieza entera.
 */
export function tonoDeVoz(x, sr) {
  const { periodo } = analizarPeriodo(x, sr);
  return periodo > 0 ? sr / periodo : 0;
}

/**
 * Agrava unas muestras SIN MOVER SU DURACIÓN, con los granos en fase.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS DEFECTOS AUDIBLES, LOS DOS DE AQUÍ
 *
 * «Se escucha doble.» Los granos eran de 80 ms con medio solape. Dos granos que
 * se solapan leen del original a SALTO×(1−razón) de distancia: 7,6 ms a tres
 * semitonos. Dos copias de la misma voz al mismo volumen separadas por un
 * retardo arbitrario son un peine en el fundamental de una voz masculina — y se
 * oyen como dos voces. La cura no es acortar el grano: es ELEGIR EL SALTO para
 * que ese desfase valga exactamente UN PERIODO de la voz. Entonces las dos
 * capas caen en fase, la onda coincide consigo misma, y no hay peine.
 *
 * «La última palabra es sintético, pero dice sin té y se corta.» Dos causas
 * sumadas, las dos muertas aquí:
 *
 *   · La versión anterior frenaba la reproducción para bajar el tono. Limpio,
 *     pero la voz duraba más, y para no pisar la toma siguiente había que
 *     cortarla en el borde: al 12 % de una toma sin respiro, la última palabra.
 *     Esto vuelve a preservar la duración EXACTA, así que no hay nada que
 *     cortar.
 *
 *   · Y el solape se daba por hecho: al final del buffer no hay grano siguiente
 *     que complete la ventana, así que la última sílaba se iba en un desvanecido
 *     de medio grano. Ahora se divide por la SUMA REAL de las ventanas, que
 *     vale uno en el medio y menos en los bordes: los dos extremos salen a su
 *     amplitud entera, sea cual sea el salto.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function agravarMuestras(x, frecuencia, semitonos) {
  const r = Math.pow(2, Number(semitonos) / 12);
  const sr = frecuencia;
  const y = new Float32Array(x.length);
  const peso = new Float32Array(x.length);
  const T = periodoDeVoz(x, sr);

  // SALTO×(1−razón) = un periodo. Es la condición de que las capas casen.
  let salto = Math.max(T, Math.round(T / Math.abs(1 - r)));
  // Salvo en una toma tan corta que ese salto no quepa tres veces: ahí manda
  // que el grano cubra el fragmento entero antes que la fase.
  salto = Math.min(salto, Math.max(2, Math.floor(x.length / 3)));
  const grano = salto * 2;

  for (let ini = 0; ini < x.length; ini += salto) {
    for (let j = 0; j < grano; j++) {
      const o = ini + j;
      if (o >= x.length) break;
      const pos = ini + j * r;
      const p0 = Math.floor(pos);
      if (p0 >= x.length) break;
      const fr = pos - p0;
      const v = p0 + 1 < x.length ? x[p0] * (1 - fr) + x[p0 + 1] * fr : x[p0];
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / grano);
      y[o] += v * w;
      peso[o] += w;
    }
  }
  for (let i = 0; i < y.length; i++) if (peso[i] > 1e-4) y[i] /= peso[i];
  return y;
}

export function silencioDe(ms, frecuencia, canales = 1) {
  return new Int16Array(Math.round((ms / 1000) * frecuencia) * canales);
}

/**
 * Localiza los silencios.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL UMBRAL NO PUEDE SALIR SOLO DEL PICO
 *
 * «Dice ospi, silencio, tal.» La palabra partida en dos con un silencio dentro.
 *
 * El umbral era el 6 % DEL PICO del bloque. En un bloque con una frase enfática
 * y otra floja —o sea, en cualquier narración con intención— el pico lo pone la
 * frase fuerte, y la floja entera queda por debajo del 6 % de ese pico: se
 * clasifica como SILENCIO. Medido con un bloque sintético de seis segundos: dos
 * y medio a plena voz, una pausa real, y tres segundos de palabra floja. El
 * detector devolvía UN silencio de 2,50 a 6,00 — tres segundos y medio de habla
 * dados por callados—.
 *
 * Y lo que hace eso audible no es solo el corte: un corte dentro de un silencio
 * «de verdad» NO se marca como forzado, así que el montaje le pone encima el
 * RESPIRO. De ahí el silencio largo en mitad de la palabra.
 *
 * Ahora el umbral es el menor de dos: el 6 % del pico, y una fracción del nivel
 * NORMAL de habla del bloque (el percentil 60 de las ventanas, que es un nivel
 * de voz corriente y no se lo lleva un grito). Con suelo, para que un bloque
 * casi todo callado siga encontrando sus pausas.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function silencios({ muestras, frecuencia, canales = 1 }, opciones = {}) {
  const { ventanaMs = 10, minimoMs = 130, relativo = 0.06 } = opciones;
  const porVentana = Math.max(1, Math.round((ventanaMs / 1000) * frecuencia)) * canales;

  let pico = 1;
  for (let i = 0; i < muestras.length; i++) {
    const v = Math.abs(muestras[i]);
    if (v > pico) pico = v;
  }

  const energia = [];
  for (let i = 0; i < muestras.length; i += porVentana) {
    let suma = 0;
    const fin = Math.min(i + porVentana, muestras.length);
    for (let j = i; j < fin; j++) suma += muestras[j] * muestras[j];
    energia.push(Math.sqrt(suma / Math.max(1, fin - i)));
  }

  const orden = [...energia].sort((x, y) => x - y);
  const habla = orden[Math.min(orden.length - 1, Math.floor(orden.length * 0.6))] || 0;
  const umbral = Math.max(pico * 0.008, Math.min(pico * relativo, habla * 0.12));

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
 * El instante MÁS CALLADO alrededor de un marco, dentro de una holgura.
 *
 * Para los cortes que hay que forzar: no hay silencio de los que cuentan, pero
 * sí hay un punto menos malo que el punto exacto. Se mide en ventanas cortas
 * —4 ms— porque lo que se busca es el hueco entre dos sílabas, no una pausa.
 */
function masCallado({ muestras, frecuencia, canales = 1 }, marco, holgura) {
  const total = muestras.length / canales;
  const ventana = Math.max(1, Math.round(0.004 * frecuencia));
  const desde = Math.max(0, marco - holgura);
  const hasta = Math.min(total, marco + holgura);
  if (hasta - desde < ventana * 2) return marco;

  let mejor = marco;
  let menos = Infinity;
  for (let m = desde; m + ventana <= hasta; m += ventana) {
    let suma = 0;
    for (let i = m; i < m + ventana; i++) {
      const v = muestras[i * canales];
      suma += v * v;
    }
    // A igualdad de energía gana el más cercano al ideal: el reparto sigue siendo
    // el que pidió la segmentación.
    const castigo = suma * (1 + Math.abs(m + ventana / 2 - marco) / Math.max(1, holgura));
    if (castigo < menos) {
      menos = castigo;
      mejor = Math.round(m + ventana / 2);
    }
  }
  return mejor;
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
  // Un trozo nunca baja de esto: sin un mínimo, dos fronteras muy juntas pueden
  // producir un trozo de cero muestras y el montaje se queda sin audio en esa toma.
  const minimoMarcos = Math.round(0.15 * frecuencia);

  // Los puntos ideales de corte y su tolerancia, todos de una vez.
  const ideales = [];
  let acumulado = 0;
  for (let k = 0; k < objetivos.length - 1; k++) {
    acumulado += objetivos[k] * factor;
    ideales.push({
      marco: Math.round(acumulado * frecuencia),
      tolerancia: Math.round(
        Math.max(objetivos[k] * factor * toleranciaRelativa, toleranciaMinimaS) * frecuencia,
      ),
    });
  }

  // ASIGNACIÓN GLOBAL, no voraz. El reparto voraz elegía para cada frontera su
  // silencio más cercano SIN mirar a las demás: dos fronteras se peleaban el
  // mismo silencio, la perdedora salía forzada en mitad de una palabra, y en un
  // bloque largo —que es donde una voz sin marcas mantiene el tono, y por eso
  // conviene alargarlo— los errores se encadenaban. Aquí se eligen TODOS los
  // cortes a la vez: la combinación creciente de silencios que menos se desvía
  // del conjunto de ideales, con el corte forzado como candidato de castigo (su
  // costo es la tolerancia: un silencio dentro de tolerancia siempre le gana).
  const centros = huecos
    .map((h) => Math.floor(h.centro / canales))
    .filter((c) => c > minimoMarcos && c < marcosTotales - minimoMarcos)
    .sort((x, y) => x - y);

  // Candidatos por frontera: cada silencio utilizable, más el forzado —que ya no
  // cae en el punto exacto, sino EN EL INSTANTE MÁS CALLADO que tenga cerca—.
  //
  //   «La última palabra es sintético, pero dice sin té y se corta. Y así varias
  //    tomas.»
  //
  // Cuando no hay ningún silencio de los que cuentan cerca de la frontera, el
  // corte se fuerza. Forzarlo en el punto matemático parte la palabra por donde
  // caiga —a mitad de vocal, que es lo más audible—. Entre dos sílabas, en una
  // oclusiva o en la caída final de una palabra hay siempre un mínimo de energía
  // aunque no llegue a durar los 130 ms que exige contar como silencio: cortar
  // ahí deja la palabra entera a un lado o al otro. No arregla el corte forzado
  // —sigue siendo un defecto y sigue avisándose—, pero lo hace mucho menos audible.
  const candidatos = ideales.map(({ marco, tolerancia }) => {
    const lista = centros.map((c) => ({ marco: c, costo: Math.abs(c - marco), forzado: false }));
    lista.push({ marco: masCallado(audio, marco, tolerancia), costo: tolerancia, forzado: true });
    return lista;
  });

  // Programación dinámica sobre fronteras crecientes con separación mínima.
  let camino = candidatos[0].map((c) => ({ costo: c.costo, eleccion: [c] }));
  for (let k = 1; k < candidatos.length; k++) {
    camino = candidatos[k].map((c) => {
      let mejor = null;
      for (const previo of camino) {
        // Una eleccion vacía es un camino que YA se quedó sin sitio en el paso
        // anterior (el `{ eleccion: [] }` de más abajo): no puede servir de
        // arranque para el siguiente, o `.marco` revienta sobre `undefined`.
        // Sin esto, un bloque con dos tomas muy cortas seguidas —un «No.» detrás
        // de otro— tiraba la narración entera con «undefined is not an object».
        if (!previo.eleccion.length) continue;
        const ultimo = previo.eleccion[previo.eleccion.length - 1].marco;
        if (c.marco < ultimo + minimoMarcos) continue;
        if (!mejor || previo.costo < mejor.costo) mejor = previo;
      }
      // Sin camino compatible, el corte se fuerza justo después del anterior.
      if (!mejor) return { costo: Infinity, eleccion: [] };
      return { costo: mejor.costo + c.costo, eleccion: [...mejor.eleccion, c] };
    });
  }
  let ganador = camino[0];
  for (const c of camino) if (c.costo < ganador.costo) ganador = c;

  const cortes = [0];
  cortes.forzado = [];
  let previo = 0;
  for (let k = 0; k < ideales.length; k++) {
    const e = ganador?.eleccion[k];
    // Si ni la programación encontró sitio, se fuerza en el ideal acotado.
    const marco = e
      ? e.marco
      : Math.min(Math.max(ideales[k].marco, previo + minimoMarcos), marcosTotales - minimoMarcos);
    const acotado = Math.max(marco, previo + minimoMarcos);
    cortes.push(acotado * canales);
    cortes.forzado[k] = e ? e.forzado : true;
    previo = acotado;
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
/**
 * Reparte un bloque por los TIEMPOS QUE DIJO EL SERVICIO DE VOZ.
 *
 * Sin estimar y sin buscar silencios: `tiempos[k]` es el segundo exacto en el que
 * acaba la toma k, porque lo dice quien la ha pronunciado.
 *
 * Es lo que arregla el fallo que no sonaba a fallo: el corte caía en un silencio
 * —así que se oía perfecto— pero era el silencio de OTRA frase, así que el audio
 * de una toma terminaba diciendo las palabras de la siguiente y la imagen no
 * correspondía a lo que se oía.
 */
export function repartirPorTiempos(audio, tiempos) {
  const { muestras, frecuencia, canales = 1 } = audio;
  const total = muestras.length;
  const marcoDe = (s) => Math.min(total, Math.max(0, Math.round(s * frecuencia) * canales));

  const trozos = [];
  let inicio = 0;
  for (let k = 0; k < tiempos.length; k++) {
    // La última toma llega hasta el final del audio, pase lo que pase: si la marca
    // cayera un poco antes del final se perderían las últimas sílabas.
    const fin = k === tiempos.length - 1 ? total : Math.max(inicio, marcoDe(tiempos[k]));
    trozos.push({
      inicio,
      fin,
      segundos: (fin - inicio) / canales / frecuencia,
      // Nada forzado: estos cortes no se han adivinado.
      forzado: false,
      exacto: true,
    });
    inicio = fin;
  }
  return trozos;
}

export function repartirBloque(audio, objetivos, opciones = {}) {
  const { silencioInicialMs = 120, tiempos = null } = opciones;
  const { muestras, frecuencia, canales = 1 } = audio;
  // Si el servicio de voz dijo dónde acaba cada toma, se le hace caso. Estimar
  // teniendo el dato exacto delante es justo el error que hubo que arreglar.
  const trozos =
    Array.isArray(tiempos) && tiempos.length === objetivos.length
      ? repartirPorTiempos(audio, tiempos)
      : repartir(audio, objetivos, opciones);

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
      // Si el corte lo dijo el servicio de voz o lo adivinamos nosotros. Viaja
      // hasta la pantalla: un corte adivinado puede dejar el texto de una toma
      // dentro del audio de la siguiente, y eso hay que poder verlo.
      exacto: !!t.exacto,
    };
  });
}
