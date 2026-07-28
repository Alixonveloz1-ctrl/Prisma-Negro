#!/usr/bin/env node
// El banco de pruebas (§10 del plano).
//
//   «Un consejo que ahorra días: monta un banco de pruebas local que genere el guion
//    de montaje CON DATOS SINTÉTICOS y lo ejecute DE VERDAD con ffmpeg. Casi todos
//    los fallos difíciles de este proyecto se reprodujeron ahí en menos de un
//    minuto, después de horas de mirar la nube.»
//
// Y §10.6: «Móntalo con material de mentira antes de generar nada de verdad: se
// prueba entero en minutos y ahí salen los fallos de estructura.»
//
// Fabrica imágenes, voz y música falsas, compone la hoja, saca el guion de ffmpeg y
// lo ejecuta. Sin tocar la nube, sin gastar un céntimo y sin esperar.
//
//   node banco/banco.mjs             fabrica, monta y comprueba
//   node banco/banco.mjs --limpiar   borra lo fabricado

import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { construirHoja, guionFfmpeg, clavesDeLaHoja, componerManifiesto } from '../comun/hoja.mjs';
import { nombreLocal } from '../comun/claves.mjs';
import { escribirWav } from '../comun/audio.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const TALLER = join(AQUI, 'salida');

const VERDE = '\x1b[32m';
const ROJO = '\x1b[31m';
const AMBAR = '\x1b[33m';
const GRIS = '\x1b[90m';
const FIN = '\x1b[0m';

if (process.argv.includes('--limpiar')) {
  rmSync(TALLER, { recursive: true, force: true });
  console.log('Taller limpio.');
  process.exit(0);
}

// ── Material de mentira ───────────────────────────────────────────────────────

const crcTabla = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTabla[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function trozoPng(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** Un PNG de verdad, sin dependencias. Con un degradado para que el zoom se note. */
function fabricarPng(ancho, alto, tono) {
  const filas = [];
  for (let y = 0; y < alto; y++) {
    const fila = Buffer.alloc(1 + ancho * 3);
    fila[0] = 0;
    for (let x = 0; x < ancho; x++) {
      const o = 1 + x * 3;
      // Un tablero de ajedrez sobre un degradado: si el recorrido de cámara pixela,
      // se ve a simple vista en el resultado.
      const cuadro = ((x >> 5) + (y >> 5)) % 2 ? 40 : 0;
      fila[o] = Math.min(255, ((x / ancho) * 200 + tono + cuadro) | 0);
      fila[o + 1] = Math.min(255, ((y / alto) * 160 + cuadro) | 0);
      fila[o + 2] = Math.min(255, (180 - tono + cuadro) | 0);
    }
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // color verdadero
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozoPng('IHDR', ihdr),
    trozoPng('IDAT', deflateSync(Buffer.concat(filas))),
    trozoPng('IEND', Buffer.alloc(0)),
  ]);
}

/** Voz falsa: ráfagas separadas por silencios, como una locución de verdad. */
function fabricarVoz(segundos, frecuencia = 24000) {
  const n = Math.round(segundos * frecuencia);
  const m = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / frecuencia;
    // Silencio en los últimos 250 ms: da al repartidor por silencios dónde cortar.
    const hablando = t < segundos - 0.25;
    m[i] = hablando ? Math.round(Math.sin(t * 2 * Math.PI * 180) * 6000 * (0.6 + 0.4 * Math.sin(t * 9))) : 0;
  }
  return Buffer.from(escribirWav({ muestras: m, frecuencia, canales: 1 }));
}

function fabricarMusica(segundos, frecuencia = 24000) {
  const n = Math.round(segundos * frecuencia);
  const m = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / frecuencia;
    m[i] = Math.round((Math.sin(t * 2 * Math.PI * 110) + Math.sin(t * 2 * Math.PI * 164)) * 2200);
  }
  return Buffer.from(escribirWav({ muestras: m, frecuencia, canales: 1 }));
}

// ── El proyecto de mentira ────────────────────────────────────────────────────

function proyectoSintetico() {
  const tomas = [];
  for (let i = 0; i < 8; i++) {
    tomas.push({
      i,
      escena: i < 3 ? 0 : i < 6 ? 1 : 2,
      texto: `Toma ${i}.`,
      // Duraciones con decimales feos a propósito: es donde aparece la deriva entre
      // video y audio si el cuadrado a la rejilla de fotogramas está mal.
      segundos: 2.37 + (i % 3) * 0.61,
      medida: true,
      plano: {
        movimientoCamara: ['fijo', 'acercamiento lento', 'paneo derecha', 'alejamiento lento'][i % 4],
        lugar: 'sitio',
        luz: 'luz',
        sujetos: [],
        descripcion: 'x',
      },
      // Reutilización de fotograma: el guion tiene que apuntar al de la toma 1.
      reusa: i === 4 ? 1 : null,
      movimiento: i === 2,
      // El silencio, que también se monta: la apertura en frío retrasa la voz de
      // la primera toma, y el respiro deja la imagen sola tras la última palabra.
      // Sin esto aquí, el camino de ffmpeg que los ejecuta (`adelay`, el relleno
      // largo de `apad`) no se habría ejecutado NUNCA antes de un montaje real.
      entrada: i === 0 ? 1.4 : 0,
      respiro: i === 3 ? 2.5 : i === 6 ? 4 : 0,
    });
  }
  return { id: 'p01', tomas, escenas: [{ n: 0 }, { n: 1 }, { n: 2 }] };
}

// ── El banco ──────────────────────────────────────────────────────────────────

let fallos = 0;
const bien = (m) => console.log(`${VERDE}✓${FIN} ${m}`);
const mal = (m) => {
  fallos++;
  console.log(`${ROJO}✗${FIN} ${m}`);
};

rmSync(TALLER, { recursive: true, force: true });
mkdirSync(TALLER, { recursive: true });

const p = proyectoSintetico();
const hoja = construirHoja({ pieza: p.id, tomas: p.tomas, escenas: p.escenas });
const guion = guionFfmpeg(hoja);
const claves = clavesDeLaHoja(hoja);
// El nombre del almacén se escribe en mayúsculas y diciendo lo que es: la invariante
// «sin secretos en el código» busca la FORMA de un nombre de almacén, no un valor
// concreto, y tiene razón en no fiarse de que este sea de mentira.
const manifiesto = componerManifiesto(hoja, (c) => `gs://ALMACEN-DE-MENTIRA/${c}`);

writeFileSync(join(TALLER, 'hoja.json'), JSON.stringify(hoja, null, 2));
writeFileSync(join(TALLER, 'guion.sh'), guion);
writeFileSync(join(TALLER, 'manifiesto.tsv'), manifiesto);

console.log(
  `${GRIS}${hoja.tomas.length} tomas · ${hoja.total.toFixed(2)} s · ${claves.length} materiales${FIN}\n`,
);

// 1. Fabricar el material con los nombres que el guion espera.
for (const clave of claves) {
  const destino = join(TALLER, nombreLocal(clave));
  if (clave.endsWith('/img') || clave.endsWith('/firma')) {
    writeFileSync(destino, fabricarPng(1280, 720, (clave.length * 17) % 120));
  } else if (clave.endsWith('/audio')) {
    const i = Number(clave.match(/t(\d+)/)[1]);
    writeFileSync(destino, fabricarVoz(hoja.tomas.find((t) => t.i === i).duracion));
  } else if (clave.includes('/mus/')) {
    writeFileSync(destino, fabricarMusica(40));
  } else if (clave.endsWith('/vid')) {
    // Un clip corto A PROPÓSITO: el montaje tiene que alargarlo congelando el
    // último fotograma (§6). Si esa parte falta, el video sale más corto que el
    // audio y aquí se ve.
    if (hayFfmpeg()) {
      execSync(
        `ffmpeg -y -v error -f lavfi -i testsrc=size=1280x720:rate=30 -t 2 -pix_fmt yuv420p ${JSON.stringify(destino)}`,
      );
    } else {
      writeFileSync(destino, Buffer.alloc(0));
    }
  }
}
bien(`material sintético fabricado (${claves.length} archivos)`);

// 2. El lector de manifiesto del montador, tal cual, contra un manifiesto SIN salto
//    final: es el §7.5 reproducido en un segundo en vez de en horas.
try {
  const sinSalto = manifiesto.replace(/\n$/, '');
  writeFileSync(join(TALLER, 'manifiesto_sin_salto.tsv'), sinSalto);
  const lector = `
    n=0
    while IFS="$(printf '\\t')" read -r origen destino || [ -n "$origen" ]; do
      [ -n "$origen" ] || continue
      n=$((n+1))
    done < ${JSON.stringify(join(TALLER, 'manifiesto_sin_salto.tsv'))}
    echo $n
  `;
  const leidas = Number(execFileSync('sh', ['-c', lector]).toString().trim());
  if (leidas === claves.length) {
    bien(`el lector recoge las ${leidas} líneas aunque falte el salto final (§7.5)`);
  } else {
    mal(`el lector recogió ${leidas} de ${claves.length} líneas sin el salto final (§7.5)`);
  }
} catch (e) {
  mal(`no se pudo probar el lector de manifiesto: ${e.message}`);
}

// 3. El montaje de verdad.
function hayFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!hayFfmpeg()) {
  console.log(
    `\n${AMBAR}⚠ No hay ffmpeg en esta máquina.${FIN}\n` +
      `${GRIS}  Se ha comprobado la estructura (hoja, guion, manifiesto, lector), pero NO\n` +
      `  se ha ejecutado el montaje. Instala ffmpeg y vuelve a pasarlo: es donde se\n` +
      `  reproducen en un minuto los fallos que cuestan horas en la nube (§10).${FIN}`,
  );
} else {
  try {
    execFileSync('sh', ['guion.sh'], { cwd: TALLER, stdio: ['ignore', 'ignore', 'pipe'] });
    bien('el guion de ffmpeg se ejecuta entero');
  } catch (e) {
    mal(`el montaje falló:\n${String(e.stderr || e.message).slice(0, 1500)}`);
  }

  const salida = join(TALLER, 'salida.mp4');
  if (!existsSync(salida) || statSync(salida).size === 0) {
    mal('el montaje no dejó un archivo de salida con contenido');
  } else {
    const sonda = (flujo, campo) =>
      execFileSync('ffprobe', [
        '-v', 'error', '-select_streams', flujo, '-show_entries', campo,
        '-of', 'default=nw=1:nk=1', salida,
      ])
        .toString()
        .trim()
        .split('\n')[0];

    const dur = Number(sonda('v:0', 'format=duration'));
    const desvio = Math.abs(dur - hoja.total);
    if (desvio < 0.15) bien(`el video dura ${dur.toFixed(2)} s, lo que dice la hoja (±${desvio.toFixed(3)})`);
    else mal(`el video dura ${dur.toFixed(2)} s y la hoja dice ${hoja.total.toFixed(2)} s`);

    const durAudio = Number(
      execFileSync('ffprobe', [
        '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration',
        '-of', 'default=nw=1:nk=1', salida,
      ]).toString().trim(),
    );
    if (Math.abs(durAudio - dur) < 0.2) bien('el audio y el video están alineados');
    else mal(`el audio dura ${durAudio.toFixed(2)} s y el video ${dur.toFixed(2)} s: hay deriva`);

    // Una sola generación de compresión de video: los segmentos se pegan por copia.
    const cuenta = execFileSync('sh', [
      '-c',
      `ls ${JSON.stringify(TALLER)}/seg_*.mp4 2>/dev/null | wc -l`,
    ]).toString().trim();
    if (Number(cuenta) === hoja.tomas.length) bien(`${cuenta} segmentos, uno por toma, codificados una vez`);
    else mal(`${cuenta} segmentos para ${hoja.tomas.length} tomas`);
  }
}

console.log(
  `\n${fallos ? ROJO : VERDE}${fallos ? `${fallos} fallos en el banco` : 'el banco pasa'}${FIN}` +
    `\n${GRIS}Lo fabricado está en banco/salida/ por si quieres mirarlo.${FIN}`,
);
process.exit(fallos ? 1 : 0);
