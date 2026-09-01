// La hoja de montaje y el guion de ffmpeg (§3 y §5 del plano).
//
// La hoja es EL CONTRATO entre lo generado y el montaje: la lista de tomas con
// `inicio`, `duracion` y `archivo`, más las escenas con su música.
//
// De esta MISMA hoja salen el guion de ffmpeg Y la lista de descargas, para que no
// puedan discrepar (§3). Están los dos en este archivo justamente por eso: no es
// una buena intención, es que no hay dos sitios donde equivocarse.
//
// Cada regla del §5 viene de un defecto AUDIBLE. Las anotaciones dicen cuál.

import { claveFotograma, claveClip, claveToma, nombreLocal, tomaDelFotograma, clipVigente } from './claves.mjs';

export const PREDETERMINADO = {
  fps: 30,
  ancho: 1920,
  alto: 1080,
  // §5.4: con fundidos cortos el relevo de la música se oye como un tajo.
  fundidoMusica: 2.5,
  // El nivel del lecho de música ANTES de que la voz lo agache. Estaba escrito a
  // mano aquí y otra vez en la previa, y el ajuste del proyecto no lo leía nadie:
  // «la música ni se escucha, apenas se medio escucha a lo lejos», y subirla era
  // imposible desde la pantalla.
  volumenMusica: 0.55,
  // §4.7: se amplía la imagen antes de recorrerla para que no pixele.
  ampliacionCamara: 2,
  crf: 18,
  bitrateAudio: '192k',
  muestreo: 48000,
};

const q = (n, fps) => Math.round(n * fps) / fps;

/**
 * Construye la hoja de montaje.
 *
 * Las duraciones se cuadran a la rejilla de fotogramas SIEMPRE HACIA ARRIBA. Así el
 * audio de cada toma se rellena con un pelo de silencio en vez de recortarse: un
 * relleno no se oye, un recorte se come la última sílaba. Y como `inicio` es la
 * suma acumulada de duraciones ya cuadradas, video y audio no pueden derivar el uno
 * del otro a lo largo de las 134 tomas.
 */
export function construirHoja({ pieza, tomas, escenas = [], config = {} }) {
  const c = { ...PREDETERMINADO, ...config };
  if (!pieza) throw new Error('La hoja de montaje necesita saber de qué pieza es.');
  if (!tomas?.length) throw new Error('La hoja de montaje necesita al menos una toma.');

  let reloj = 0;
  const filas = tomas.map((t, n) => {
    // EL RESPIRO: la imagen se queda después de la última palabra.
    //
    // ─────────────────────────────────────────────────────────────────────────
    // Antes esto era `duracion = lo que dura la locución`, y punto. Así que cada
    // toma cortaba en seco en la última sílaba y entraba la siguiente. Ciento
    // treinta y cuatro veces seguidas. No había suspense en ninguna parte porque
    // NO HABÍA SITIO donde ponerlo: el modelo de datos no tenía un hueco para el
    // silencio, y al director se le pedía «silencio después del dato duro»
    // sabiendo que no había dónde escribirlo.
    //
    // Un documental respira al revés: la frase cae, el corte NO llega, la música
    // sube sola —la compresión lateral la devuelve en cuanto calla la voz— y te
    // quedas con la imagen dos o tres segundos. Ahí es donde el espectador siente
    // lo que acaba de oír. Sin ese hueco, se lo cuentas y no le da tiempo.
    //
    // `entrada` es lo mismo al principio: la imagen antes de la primera palabra.
    // Es la apertura en frío, y solo tiene sentido en la primera toma de la pieza.
    // ─────────────────────────────────────────────────────────────────────────
    // EL RESPIRO NO SE APOYA EN UN CORTE DUDOSO. Si el audio de esta toma se
    // cortó estimando —narración anterior a las marcas exactas—, su final puede
    // caer a mitad de una frase, y plantar ahí segundos de silencio convierte un
    // corte malo en una «pausa dramática» a mitad de palabra. Sin corte fiable no
    // hay respiro; al rehacer la narración, todos los cortes salen exactos y los
    // respiros vuelven solos.
    // Fiable = exacto (lo dijo el servicio) o anclado a un silencio real (el
    // reparto lo puso en una pausa de verdad: alargarla suena natural). Solo el
    // corte FORZADO —sin silencio cerca, puede partir palabra— pierde su respiro.
    const corteFiable = t.audio !== 'ok' || t.corteExacto === true || t.corteForzado === false;
    const respiro = corteFiable ? Math.max(0, Math.min(8, Number(t.respiro) || 0)) : 0;
    const entrada = n === 0 ? Math.max(0, Math.min(8, Number(t.entrada) || 0)) : 0;
    const dur = Math.ceil((Math.max(t.segundos || 0, 0.2) + respiro + entrada) * c.fps) / c.fps;
    const fila = {
      i: t.i,
      escena: t.escena ?? 0,
      inicio: q(reloj, c.fps),
      duracion: dur,
      // Van a la hoja porque el montaje los necesita: la voz se retrasa `entrada` y
      // se rellena con silencio hasta `duracion`, que es lo que deja el respiro.
      respiro,
      entrada,
      // El origen visual, CON LA REUTILIZACIÓN YA RESUELTA en los dos casos —
      // nadie mira `reusa` aguas abajo, ni debe.
      //
      // El clip también se reutiliza. Antes esta línea componía siempre
      // `claveToma(pieza, t.i, 'vid')`: cada toma con movimiento pagaba su propio
      // clip aunque fuera el mismo plano que otra. Y el clip es la fase más cara
      // con diferencia, así que era justo donde más dolía.
      //
      // Y EL CLIP ES OPCIONAL. `movimiento: true` es una PROPUESTA del director;
      // gastarlo o no lo decide quien paga. Antes la hoja exigía el clip en
      // cuanto la toma lo llevara marcado: sin generarlo salía «sin imagen» en la
      // previa y material ausente en el montaje, con la imagen YA PAGADA ahí al
      // lado. Ahora el clip se usa si EXISTE, y si no, la imagen con su recorrido
      // de cámara — que es exactamente lo que pasa con las tomas fijas.
      ...(function () {
        const dueña = tomaDelFotograma(t, tomas);
        // Y el clip tiene que SALIR DE LA IMAGEN QUE HAY AHORA. Antes bastaba con
        // que existiera: rehacer una imagen dejaba el montaje usando el clip de
        // la que se había descartado. Ver `clipVigente`.
        const hayClip = !!t.movimiento && clipVigente(t, tomas);
        return {
          archivo: hayClip ? claveClip(pieza, t, tomas) : claveFotograma(pieza, t, tomas),
          movimiento: hayClip,
          camara: hayClip ? null : camaraDe(t),
        };
      })(),
      audio: claveToma(pieza, t.i, 'audio'),
      // §8.2: cada toma sabe de qué tipo es su imagen, y eso puede salir en
      // pantalla.
      tipoImagen: t.tipoImagen || 'generada',
    };
    reloj = q(reloj + dur, c.fps);
    return fila;
  });

  const porEscena = new Map();
  for (const f of filas) {
    const e = porEscena.get(f.escena) || { n: f.escena, inicio: f.inicio, fin: f.inicio };
    e.inicio = Math.min(e.inicio, f.inicio);
    e.fin = Math.max(e.fin, q(f.inicio + f.duracion, c.fps));
    porEscena.set(f.escena, e);
  }

  const filasEscena = [...porEscena.values()]
    .sort((a, b) => a.inicio - b.inicio)
    .map((e) => {
      const decl = escenas.find((x) => x.n === e.n) || {};
      // DOS SIGNIFICADOS SE PISABAN EN EL MISMO CAMPO, y por eso la música
      // generada no sonaba nunca. `escena.musica` guarda el ESTADO («ok», puesto
      // por la fase de música) y esta línea lo leía como CLAVE de archivo: la
      // hoja pedía bajar un archivo llamado literalmente «ok», que no existe, y
      // el lecho salía mudo — en la previa y en el montaje. Solo cuenta como
      // clave lo que tiene forma de clave; «null» sigue siendo apagar la música
      // de la escena a propósito.
      const propia = typeof decl.musica === 'string' && decl.musica.includes('/') ? decl.musica : null;
      return {
        n: e.n,
        inicio: e.inicio,
        duracion: q(e.fin - e.inicio, c.fps),
        musica: decl.musica === null ? null : propia || `${pieza}/mus/${String(e.n).padStart(3, '0')}`,
      };
    });

  return {
    version: 1,
    pieza,
    fps: c.fps,
    ancho: c.ancho,
    alto: c.alto,
    total: reloj,
    firma: config.firma === null ? null : `${pieza}/firma`,
    ajustes: {
      fundidoMusica: c.fundidoMusica,
      volumenMusica: c.volumenMusica,
      ampliacionCamara: c.ampliacionCamara,
      crf: c.crf,
      bitrateAudio: c.bitrateAudio,
      muestreo: c.muestreo,
    },
    tomas: filas,
    escenas: filasEscena,
  };
}

function camaraDe(t) {
  const p = t.plano || {};
  const bruto = String(p.movimientoCamara || p.camara || '').toLowerCase();
  if (/acerc|zoom in|hacia dentro|push/.test(bruto)) return 'acercar';
  if (/alej|zoom out|hacia fuera|pull/.test(bruto)) return 'alejar';
  if (/izquierd|left/.test(bruto)) return 'izquierda';
  if (/derech|right/.test(bruto)) return 'derecha';
  if (/arriba|up|tilt up/.test(bruto)) return 'arriba';
  if (/abajo|down|tilt down/.test(bruto)) return 'abajo';
  // Sin instrucción, un acercamiento lento: quieto del todo parece un error.
  return 'acercar';
}

// ── La lista de descargas ─────────────────────────────────────────────────────

/**
 * Todas las claves que el montaje va a ABRIR.
 *
 * Sale de la hoja, igual que el guion. La auditoría comprueba que esta lista cubre
 * todos los archivos que el guion nombra: si alguna vez discrepan, el montaje falla
 * con un código de salida y ningún mensaje (§7.6), que es exactamente lo que no
 * queremos volver a ver.
 */
export function clavesDeLaHoja(hoja) {
  const vistas = new Set();
  for (const t of hoja.tomas || []) {
    if (t.archivo) vistas.add(t.archivo);
    if (t.audio) vistas.add(t.audio);
  }
  for (const e of hoja.escenas || []) {
    if (e.musica) vistas.add(e.musica);
  }
  if (hoja.firma) vistas.add(hoja.firma);
  return [...vistas];
}

/**
 * El manifiesto `origen → destino` (§7.4).
 *
 * Es lo que permite que el contenedor de montaje no conozca ningún archivo por su
 * nombre. `aRutaGs` la pone quien tenga el nombre del almacén —la función— porque
 * ese nombre no puede vivir en el código (§1).
 *
 * §7.5: termina en salto de línea. El bucle `read` del shell descarta la última
 * línea sin decir nada si no lo lleva. El lector del contenedor, además, no depende
 * de él: cinturón y tirantes, porque esto costó horas.
 */
export function componerManifiesto(hoja, aRutaGs) {
  return (
    clavesDeLaHoja(hoja)
      .map((clave) => `${aRutaGs(clave)}\t${nombreLocal(clave)}`)
      .join('\n') + '\n'
  );
}

// ── El guion de ffmpeg ────────────────────────────────────────────────────────

const sh = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/**
 * Hasta cuánto se puede estirar un clip para que llene la toma.
 *
 * Dos y medio: un plano documental a un 40 % de velocidad todavía se lee como una
 * decisión de montaje —los documentales lo hacen a propósito continuamente—. Más
 * allá, una persona hablando se convierte en cámara lenta evidente, y eso se ve
 * peor que la repetición que veníamos a evitar. Por encima del tope manda el bucle.
 *
 * El sitio de verdad para no llegar aquí es pedir los clips largos: un clip de ocho
 * segundos cubre una toma de veinte estirando 2,5, y uno de cuatro no.
 */
const TOPE_LENTO = 2.5;

/**
 * Compone el guion de montaje.
 *
 * El orden de las operaciones NO es negociable; cada paso está donde está por un
 * defecto que se oyó:
 *
 *   1. Cada toma se codifica UNA vez, muda, con su movimiento de cámara y la marca
 *      ya incrustada (§5.1, §5.7).
 *   2. Los segmentos se pegan POR COPIA (§5.2). Una sola generación de compresión
 *      de video en toda la pieza.
 *   3. La voz va en PCM de principio a fin (§5.3). Pegar audio comprimido mete un
 *      chasquido en cada unión: cada trozo lleva muestras de precarga y relleno, y
 *      al concatenar por copia esos bordes quedan dentro.
 *   4. La música se arma como un lecho continuo con fundidos largos (§5.4).
 *   5. Una sola codificación de audio, al final (§5.5).
 *   6. La música cede paso por compresión lateral, no por volumen fijo (§5.6).
 */
/**
 * Los PLANOS de una hoja: tomas seguidas con el mismo material, fundidas en una.
 *
 * Fuera de `guionFfmpeg` para poder ejecutarla suelta en la auditoría: la fusión
 * no se ve leyendo el guion de ffmpeg, y una comprobación que solo mira texto no
 * habría cazado que dejara de fundir.
 *
 * Los fotogramas se SUMAN ya redondeados, no se redondea la suma: la pieza tiene
 * que durar exactamente lo mismo que antes y el banco lo mide al fotograma.
 */
export function planosDeLaHoja(hoja, fps) {
  const planos = [];
  for (const t of hoja?.tomas || []) {
    const ultimo = planos[planos.length - 1];
    const mismo = ultimo && ultimo.movimiento && t.movimiento && ultimo.archivo === t.archivo;
    if (mismo) {
      ultimo.frames += Math.round(t.duracion * fps);
      ultimo.duracion = ultimo.frames / fps;
      ultimo.tomas.push(t.i);
    } else {
      planos.push({ ...t, frames: Math.round(t.duracion * fps), tomas: [t.i] });
    }
  }
  return planos;
}

export function guionFfmpeg(hoja) {
  const a = { ...PREDETERMINADO, ...(hoja.ajustes || {}) };
  const { ancho: W, alto: H, fps } = hoja;
  const L = [];
  const p = (s) => L.push(s);

  p('#!/bin/sh');
  p('# Guion de montaje generado desde la hoja. No editar a mano.');
  p('# Llega al contenedor como DATO, no como algo que el contenedor componga (§7.4).');
  p('set -eu');
  p('');
  p('avisa() { printf "%s\\n" "$*" >&2; }');
  p('');
  p(`avisa "Montando ${hoja.pieza}: ${hoja.tomas.length} tomas, ${hoja.total.toFixed(2)} s."`);
  p('');

  const firma = hoja.firma ? nombreLocal(hoja.firma) : null;

  // Las listas se acumulan con «>>»: si el contenedor reintenta sobre el mismo
  // directorio, una lista vieja duplicaría la pieza entera sin decir nada.
  p('rm -f lista_video.txt lista_voz.txt');
  p('');

  // ── 1. Un segmento mudo por PLANO ───────────────────────────────────────────
  //
  // ───────────────────────────────────────────────────────────────────────────
  // TOMAS SEGUIDAS CON EL MISMO MATERIAL SON UN SOLO PLANO.
  //
  // «Hay imágenes que se están reutilizando, pero continuas. No sé si está bien o
  //  hay un error.»
  //
  // Compartir estaba bien —tres tomas del mismo testimonio son la misma cara, y se
  // paga una vez—. Lo que estaba mal era el montaje: un segmento por toma, cada uno
  // arrancando el mismo clip desde cero y con SU PROPIO factor de estiramiento. Tres
  // tomas de 8, 9 y 10 segundos daban el mismo video tres veces, a ×1,0, ×1,125 y
  // ×1,25. Un bucle y encima con cambios de velocidad dentro.
  //
  // «No puedes alargar uno que va a ir superlento y después repetir a velocidad
  //  normal. Tendría que repetirse los tres.»
  //
  // Eso: se funden en UN plano de veintisiete segundos, con UNA velocidad para todo
  // y un número ENTERO de vueltas, que es lo que hace que la última acabe justo en
  // el corte en vez de quedarse a medias. Ver el cálculo de `L`.
  //
  // La voz NO se toca: va toma a toma, en su propia sección. Aquí solo se une la
  // imagen. Y los fotogramas se SUMAN ya redondeados, no se redondea la suma: la
  // pieza tiene que durar exactamente lo mismo que antes, y el banco lo mide.
  // ───────────────────────────────────────────────────────────────────────────
  const planos = planosDeLaHoja(hoja, fps);

  p('# ── 1. Un segmento por plano, codificado UNA vez, mudo, con la marca dentro ──');
  planos.forEach((t, n) => {
    const seg = `seg_${String(n).padStart(4, '0')}.mp4`;
    const frames = t.frames;
    if (t.tomas.length > 1) {
      p(`# tomas ${t.tomas.map((i) => i + 1).join(', ')}: mismo material, un solo plano continuo`);
    }
    const cadenas = [];

    if (t.movimiento) {
      // §6: los generadores de video tienen listas CERRADAS de duración, así que el
      // clip casi nunca dura lo que dura la locución. Si la toma pide once segundos
      // y el clip trae ocho, hay que cubrir tres.
      //
      // ─────────────────────────────────────────────────────────────────────────
      // PRIMERO SE CONGELABA EL ÚLTIMO FOTOGRAMA: «se queda tieso hasta que termina
      // el audio. Eso se ve horrible». Cuatro segundos de imagen muerta en medio de
      // un plano que se estaba moviendo se leen como un fallo de reproducción.
      //
      // DESPUÉS SE REPETÍA EL CLIP. Y también estaba mal, por otro sitio: «no
      // quiero que se repita el video, porque eso va a dañar la continuidad». Es
      // verdad — a los ocho segundos la persona vuelve a hacer el mismo gesto y se
      // ve que es un bucle.
      //
      // AHORA SE ESTIRA EL TIEMPO. «Lo que tienes que ajustar es la velocidad del
      // video; no importa que esté un poco más lento para que alcance a llenar esos
      // once segundos.» Un plano documental al 70 % de velocidad se lee como una
      // decisión de montaje; un bucle se lee como un error.
      //
      // Y LA DURACIÓN SE MIDE, NO SE SUPONE. El factor sale de `ffprobe` sobre el
      // archivo de verdad, no de lo que creemos que pedimos: el generador entrega
      // lo que quiere dentro de su lista cerrada, un clip heredado de la biblioteca
      // dura lo suyo y no lo de esta toma, y una duración supuesta que no cuadra
      // deja el segmento corto sin avisar.
      //
      // EL BUCLE SE QUEDA, de red de seguridad. `setpts` estira hasta `TOPE_LENTO`;
      // más allá de ahí, cámara lenta de verdad —una persona hablando a un tercio
      // de velocidad— se ve peor que un bucle, así que el factor se queda en 1 y
      // manda el bucle. Va en la ENTRADA (`-stream_loop -1`) y no en el filtro:
      // el filtro `loop` guarda los fotogramas en memoria y un clip de ocho
      // segundos en 1080p son setecientos megas.
      //
      // `setpts` va ANTES de `fps`: estira los tiempos y luego el remuestreo a
      // fotogramas fijos rellena repitiendo, que es lo que lo deja parejo.
      // ─────────────────────────────────────────────────────────────────────────
      p(
        `D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 ` +
          `${sh(nombreLocal(t.archivo))} 2>/dev/null || true)`,
      );
      // UNA SOLA VELOCIDAD Y VUELTAS ENTERAS.
      //
      // Antes: se estiraba hasta el tope y, si no llegaba, factor 1 y a repetir a
      // velocidad normal cortando a media vuelta. Con tomas fundidas eso es justo
      // lo que él descartó —«no puedes alargar uno que va superlento y después
      // repetir a velocidad normal»— y a media vuelta el corte cae en cualquier
      // parte del movimiento.
      //
      // Ahora se busca el MENOR número de vueltas `n` cuyo estiramiento quepa
      // dentro del tope, y se estira a `t/(n*d)`: la misma velocidad de principio a
      // fin y la última vuelta acaba justo en el corte. Con 27 s y un clip de 8:
      // una vuelta pediría ×3,375, que pasa del tope; dos dan ×1,687 y cuadran
      // exacto. Menos vueltas es mejor —repetir es lo que no se quiere— así que se
      // gasta todo el estiramiento permitido antes de añadir una.
      p(
        `L=$(LC_ALL=C awk -v d="$D" -v t=${t.duracion.toFixed(3)} -v m=${TOPE_LENTO} ` +
          `'BEGIN{ if (d+0 <= 0.1) { print "1"; exit } n = 1; ` +
          `while (n < 200 && t / (n * (d+0)) > m) { n++ } f = t / (n * (d+0)); ` +
          `if (f <= 1.02) { print "1" } else { printf "%.5f", f } }')`,
      );
      cadenas.push(
        `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,` +
          `crop=${W}:${H},setpts=\${L}*PTS,fps=${fps},setsar=1[v]`,
      );
    } else {
      // §4.7: se amplía la imagen ANTES de recorrerla para que no pixele.
      const A = Math.round(W * a.ampliacionCamara);
      cadenas.push(
        `[0:v]scale=${A}:-2,${zoompan(t.camara, frames, W, H, fps)},setsar=1[v]`,
      );
    }

    let mapa = '[v]';
    let entradas = `-i ${sh(nombreLocal(t.archivo))}`;
    if (firma) {
      entradas += ` -i ${sh(firma)}`;
      // §5.7: la marca se incrusta DENTRO de la codificación de cada toma. Si se
      // pone al final sobre la pieza montada, hay que recodificarla entera: una
      // segunda generación de compresión sobre todo el material.
      cadenas.push(`[1:v]scale=${Math.round(W * 0.14)}:-1[marca]`);
      cadenas.push(
        `[v][marca]overlay=W-w-${Math.round(W * 0.028)}:H-h-${Math.round(H * 0.045)}[vo]`,
      );
      mapa = '[vo]';
    }

    // La imagen fija se repite sola para durar lo que pida la toma; el clip se
    // estira y, si no llega, se repite. `-frames:v` es lo que corta los dos.
    const bucle = t.movimiento ? '-stream_loop -1 ' : '-loop 1 ';
    // El filtro del clip lleva DENTRO `${L}`, el factor que calculó `awk` arriba, y
    // por eso va entre comillas dobles: entre comillas simples el shell lo pasaría
    // literal y ffmpeg se encontraría un `${L}` donde espera un número. El resto de
    // las tomas sigue con comillas simples porque `zoompan` lleva `$` de ffmpeg que
    // NO se puede expandir.
    const filtro = t.movimiento ? `"${cadenas.join(';')}"` : sh(cadenas.join(';'));
    p(
      `ffmpeg -y -v error ${bucle}${entradas} ` +
        `-filter_complex ${filtro} ` +
        `-map ${sh(mapa)} -frames:v ${frames} -an ` +
        `-c:v libx264 -preset medium -crf ${a.crf} -pix_fmt yuv420p -r ${fps} ` +
        `-video_track_timescale ${fps * 1000} ${seg}`,
    );
    p(`printf "file '%s'\\n" ${sh(seg)} >> lista_video.txt`);
  });
  p('');

  // ── 2. Pegado por copia ─────────────────────────────────────────────────────
  p('# ── 2. Pegado POR COPIA: una sola generación de compresión de video (§5.2) ──');
  p('ffmpeg -y -v error -f concat -safe 0 -i lista_video.txt -c copy -an mudo.mp4');
  p('');

  // ── 3. La voz, en PCM de principio a fin ────────────────────────────────────
  p('# ── 3. La voz NUNCA se corta ni se pega comprimida (§5.3) ──');
  hoja.tomas.forEach((t, n) => {
    const voz = `voz_${String(n).padStart(4, '0')}.wav`;
    // `apad` rellena con silencio hasta la duración exacta y `-t` la fija. Como la
    // duración se cuadró hacia arriba, esto siempre rellena y nunca recorta.
    //
    // Y ES LO QUE HACE EL RESPIRO: la duración de la toma ya lleva dentro los
    // segundos de más, así que `apad` los rellena de silencio y la imagen se queda
    // sola con la música. No hace falta nada más aquí —el silencio del respiro y
    // el relleno de cuadre son el mismo mecanismo—.
    const filtros = [`aresample=${a.muestreo}`];
    // La apertura en frío: la imagen entra antes que la voz. Solo la primera toma
    // la lleva, y desplaza SU audio dentro de SU hueco, no el de las demás: cada
    // trozo se rellena a su duración exacta antes de pegarse.
    if (t.entrada > 0) filtros.push(`adelay=${Math.round(t.entrada * 1000)}:all=1`);
    filtros.push('apad');
    p(
      `ffmpeg -y -v error -i ${sh(nombreLocal(t.audio))} ` +
        `-af ${sh(filtros.join(','))} -t ${t.duracion.toFixed(4)} ` +
        `-ac 2 -ar ${a.muestreo} -c:a pcm_s16le ${voz}`,
    );
    p(`printf "file '%s'\\n" ${sh(voz)} >> lista_voz.txt`);
  });
  // Concatenar PCM a PCM es copiar muestras: no hay compresión, luego no hay bordes
  // con precarga ni relleno, luego no hay chasquido (§7.7).
  p(`ffmpeg -y -v error -f concat -safe 0 -i lista_voz.txt -ac 2 -ar ${a.muestreo} -c:a pcm_s16le voz.wav`);
  p('');

  // ── 4. El lecho de música ───────────────────────────────────────────────────
  const conMusica = (hoja.escenas || []).filter((e) => e.musica);
  if (conMusica.length) {
    p('# ── 4. La música, un lecho continuo con fundidos largos (§5.4) ──');
    const d = a.fundidoMusica;
    conMusica.forEach((e, n) => {
      const largo = (e.duracion + d).toFixed(3);
      // Si la pieza generada es más corta que la escena, se repite. Mejor eso que un
      // silencio a mitad de escena.
      p(
        `ffmpeg -y -v error -stream_loop -1 -i ${sh(nombreLocal(e.musica))} ` +
          `-t ${largo} -ac 2 -ar ${a.muestreo} -c:a pcm_s16le mus_${String(n).padStart(3, '0')}.wav`,
      );
    });

    if (conMusica.length === 1) {
      p('cp mus_000.wav musica_cruda.wav');
    } else {
      const ent = conMusica.map((_, n) => `-i mus_${String(n).padStart(3, '0')}.wav`).join(' ');
      const pasos = [];
      let previo = '[0:a]';
      for (let n = 1; n < conMusica.length; n++) {
        const salida = n === conMusica.length - 1 ? '[lecho]' : `[x${n}]`;
        pasos.push(`${previo}[${n}:a]acrossfade=d=${d}:c1=tri:c2=tri${salida}`);
        previo = salida;
      }
      p(
        `ffmpeg -y -v error ${ent} -filter_complex ${sh(pasos.join(';'))} ` +
          `-map ${sh('[lecho]')} -ac 2 -ar ${a.muestreo} -c:a pcm_s16le musica_cruda.wav`,
      );
    }
    p(
      `ffmpeg -y -v error -i musica_cruda.wav -t ${hoja.total.toFixed(4)} ` +
        `-af ${sh('apad')} -ac 2 -ar ${a.muestreo} -c:a pcm_s16le musica.wav`,
    );
    p('');

    // ── 5 y 6. Compresión lateral y UNA sola codificación de audio ────────────
    p('# ── 5+6. La música cede paso por compresión lateral, y se comprime UNA vez ──');
    p(
      `ffmpeg -y -v error -i voz.wav -i musica.wav -filter_complex ` +
        sh(
          // EL NIVEL DEL LECHO LO ELIGE EL USUARIO. Estaba clavado a 0,55 aquí y
          // otra vez en la previa, y `config.musica.volumen` no lo leía nadie.
          `[1:a]volume=${a.volumenMusica}[m];` +
            // La voz abre el paso: la música baja cuando hay narración y vuelve
            // cuando no. Un volumen fijo o ahoga la voz o deja la música inaudible.
            //
            // Con ratio 12 y umbral 0,03 el agachado eran más de VEINTE decibelios:
            // la música desaparecía en cuanto alguien respiraba y subir el nivel no
            // servía de nada, porque lo que sobraba era la compresión, no el
            // volumen. Doce decibelios es un agachado de documental: la voz manda y
            // la música sigue estando ahí.
            '[m][0:a]sidechaincompress=threshold=0.08:ratio=3:attack=20:release=300[duck];' +
            '[0:a][duck]amix=inputs=2:normalize=0:dropout_transition=0[mezcla];' +
            // Y un limitador al final. Voz al 0,9 más música agachada al 0,2 pasa
            // de uno: sumar dos pistas sin techo es distorsión en los picos, y con
            // el nivel de música en manos del usuario deja de ser hipotético.
            '[mezcla]alimiter=limit=0.97:level=0[techo]',
        ) +
        ` -map ${sh('[techo]')} -c:a aac -b:a ${a.bitrateAudio} -ar ${a.muestreo} audio.m4a`,
    );
  } else {
    p('# ── 5. Sin música: una sola codificación de audio igualmente (§5.5) ──');
    p(`ffmpeg -y -v error -i voz.wav -c:a aac -b:a ${a.bitrateAudio} -ar ${a.muestreo} audio.m4a`);
  }
  p('');

  // ── 7. Unión final, sin recodificar nada ────────────────────────────────────
  p('# ── 7. Unión final: el video se COPIA, el audio ya está comprimido ──');
  p('ffmpeg -y -v error -i mudo.mp4 -i audio.m4a -c:v copy -c:a copy -movflags +faststart salida.mp4');
  p('');
  p('avisa "Montaje terminado."');

  return L.join('\n') + '\n';
}

/**
 * El recorrido de cámara de una toma fija (§4.7).
 *
 * Las expresiones van en función de `on` (el número de fotograma de salida): son
 * deterministas y no dependen del estado interno de zoompan, que es donde este
 * filtro se vuelve caprichoso.
 */
function zoompan(camara, frames, W, H, fps) {
  const n = Math.max(frames, 1);
  const Z = 1.18; // recorrido de zoom: más que esto se nota como un tirón
  const centro = { x: `iw/2-(iw/zoom/2)`, y: `ih/2-(ih/zoom/2)` };
  let z = '1';
  let x = centro.x;
  let y = centro.y;

  switch (camara) {
    case 'acercar':
      z = `1+${(Z - 1).toFixed(4)}*on/${n}`;
      break;
    case 'alejar':
      z = `${Z}-${(Z - 1).toFixed(4)}*on/${n}`;
      break;
    case 'izquierda':
      z = `${Z}`;
      x = `(iw-iw/zoom)*(1-on/${n})`;
      break;
    case 'derecha':
      z = `${Z}`;
      x = `(iw-iw/zoom)*on/${n}`;
      break;
    case 'arriba':
      z = `${Z}`;
      y = `(ih-ih/zoom)*(1-on/${n})`;
      break;
    case 'abajo':
      z = `${Z}`;
      y = `(ih-ih/zoom)*on/${n}`;
      break;
    default:
      z = `1+${(Z - 1).toFixed(4)}*on/${n}`;
  }

  return `zoompan=z='${z}':x='${x}':y='${y}':d=${n}:s=${W}x${H}:fps=${fps}`;
}

/**
 * El guion de ENTREGA. Aparte del de montaje, y no por orden: por honradez.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El montaje tiene una regla que se comprueba contando: UNA codificación de
 * video y UNA de audio en todo el episodio (§5.5). Es la diferencia entre un
 * archivo limpio y uno con dos generaciones de compresión encima.
 *
 * Las pistas sueltas que pide la entrega —la voz entera y el lecho de música,
 * para poder retocar el sonido sin volver a montar— también son codificaciones
 * de audio. Metidas en el guion de montaje, la cuenta pasaba de una a tres y la
 * comprobación dejaba de significar nada: cualquiera podría colar mañana una
 * recodificación de verdad y nadie se enteraría.
 *
 * Así que van en su propio guion, que corre DESPUÉS y no toca el video. La
 * cuenta del montaje sigue siendo uno y uno, y sigue siendo cierta.
 *
 * No fabrican nada nuevo: `voz.wav` y `musica.wav` ya existen —hacen falta para
 * la mezcla— y hasta ahora se tiraban al terminar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function guionEntrega(hoja) {
  const a = { ...PREDETERMINADO, ...(hoja.ajustes || {}) };
  const L = ['#!/bin/sh', '# Las pistas sueltas del paquete de entrega. No tocan el video.', ''];
  L.push(`ffmpeg -y -v error -i voz.wav -c:a aac -b:a ${a.bitrateAudio} voz.m4a`);
  if ((hoja.escenas || []).some((e) => e.musica)) {
    L.push(`ffmpeg -y -v error -i musica.wav -c:a aac -b:a ${a.bitrateAudio} musica.m4a`);
  }
  return L.join('\n') + '\n';
}
