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

import { claveFotograma, claveClip, claveToma, nombreLocal, tomaDelFotograma } from './claves.mjs';

export const PREDETERMINADO = {
  fps: 30,
  ancho: 1920,
  alto: 1080,
  // §5.4: con fundidos cortos el relevo de la música se oye como un tajo.
  fundidoMusica: 2.5,
  // Semitonos de gravedad de la voz, aplicados al montar. Cero = tal cual.
  gravedadVoz: 0,
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
    const corteFiable = t.audio !== 'ok' || t.corteExacto !== false;
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
        const hayClip =
          !!t.movimiento &&
          !!(t.heredadoVid || dueña.heredadoVid || dueña.video === 'ok');
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
      gravedadVoz: c.gravedadVoz,
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

  // ── 1. Un segmento mudo por toma ────────────────────────────────────────────
  p('# ── 1. Un segmento por toma, codificado UNA vez, mudo, con la marca dentro ──');
  hoja.tomas.forEach((t, n) => {
    const seg = `seg_${String(n).padStart(4, '0')}.mp4`;
    const frames = Math.round(t.duracion * fps);
    const cadenas = [];

    if (t.movimiento) {
      // §6: los generadores de video tienen listas cerradas de duración. Si el clip
      // se queda corto para lo que dura la locución, se congela el último fotograma
      // para cubrir el resto.
      cadenas.push(
        `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,` +
          `crop=${W}:${H},fps=${fps},` +
          `tpad=stop_mode=clone:stop_duration=${(t.duracion + 1).toFixed(3)},` +
          `setsar=1[v]`,
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

    const bucle = t.movimiento ? '' : '-loop 1 ';
    p(
      `ffmpeg -y -v error ${bucle}${entradas} ` +
        `-filter_complex ${sh(cadenas.join(';'))} ` +
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
    // LA GRAVEDAD, SIN TOCAR EL RELOJ. Bajar el tono con `asetrate` también
    // frena el audio; el `atempo` recíproco le devuelve la velocidad exacta.
    // El producto de los dos factores es 1: la duración no se mueve NI UN
    // FOTOGRAMA, y el banco lo demuestra montando con gravedad puesta y
    // exigiendo el mismo largo al milisegundo. Así la voz se agrava sobre lo ya
    // generado —sin regenerar ni una toma— y la sincronía queda intacta.
    const g = Number(a.gravedadVoz) || 0;
    if (g) {
      const factor = Math.pow(2, g / 12);
      filtros.push(
        `asetrate=${Math.round(a.muestreo * factor)}`,
        `aresample=${a.muestreo}`,
        `atempo=${(1 / factor).toFixed(6)}`,
      );
    }
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
          '[1:a]volume=0.55[m];' +
            // La voz abre el paso: la música baja cuando hay narración y vuelve
            // cuando no. Un volumen fijo o ahoga la voz o deja la música inaudible.
            '[m][0:a]sidechaincompress=threshold=0.03:ratio=12:attack=15:release=350[duck];' +
            '[0:a][duck]amix=inputs=2:normalize=0:dropout_transition=0[mezcla]',
        ) +
        ` -map ${sh('[mezcla]')} -c:a aac -b:a ${a.bitrateAudio} -ar ${a.muestreo} audio.m4a`,
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
