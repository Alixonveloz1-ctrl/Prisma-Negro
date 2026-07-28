// La vista previa.
//
// Reconstruye en el navegador lo que va a salir del montaje: el recorrido de cámara
// de cada toma, la marca del canal, el lecho de música con sus fundidos, y la música
// AGACHÁNDOSE cuando entra la voz. Sin eso no se puede decidir nada: una previa que
// no suena como el resultado solo sirve para comprobar que los archivos existen.
//
// LA REGLA QUE LA SOSTIENE: la previa se construye desde LA MISMA HOJA DE MONTAJE
// que usa ffmpeg. Los mismos `inicio`, las mismas duraciones, el mismo reparto de
// música por escena y el mismo movimiento de cámara. Si compusiera su propia línea
// de tiempo, estaría enseñando un documental parecido al que se va a montar, que es
// justo lo que no vale.
//
// Lo que NO reproduce, y conviene saberlo: la compresión de video, el congelado del
// último fotograma de los clips cortos y los fundidos exactos de ffmpeg. Todo eso
// solo se ve en el archivo final.
//
// No cuesta nada: el material ya está pagado y en el almacén.

import { material, tipoDeClave } from './material.js';
import { construirHoja } from '../comun/hoja.mjs';
import { nombreLocal } from '../comun/claves.mjs';

/**
 * Prepara la previa de una pieza.
 *
 * Sale de la hoja, así que baja EXACTAMENTE lo que el montaje va a abrir: ni un
 * archivo de más —no se baja la imagen de una toma que reusa la de otra— ni uno de
 * menos.
 */
export async function preparar({ pieza, config, senal, alAvanzar }) {
  const hoja = construirHoja({
    pieza: pieza.id,
    tomas: pieza.tomas,
    escenas: pieza.escenas,
    config: {
      fps: config.formato.fps,
      ancho: config.formato.ancho,
      alto: config.formato.alto,
      fundidoMusica: config.musica.fundido,
      firma: config.marca.activa && config.marca.texto ? undefined : null,
    },
  });

  const cargar = async (clave) => {
    try {
      return await material(clave, tipoDeClave(clave), { senal });
    } catch {
      return null;
    }
  };

  const tomas = [];
  for (const [n, fila] of hoja.tomas.entries()) {
    if (senal?.aborted) break;
    const [visual, voz] = await Promise.all([cargar(fila.archivo), cargar(fila.audio)]);
    tomas.push({
      ...fila,
      texto: pieza.tomas.find((t) => t.i === fila.i)?.texto || '',
      visual,
      voz,
      falta: [!visual && (fila.movimiento ? 'clip' : 'imagen'), !voz && 'voz'].filter(Boolean),
    });
    alAvanzar?.(n + 1, hoja.tomas.length);
  }

  const musica = {};
  for (const e of hoja.escenas) {
    if (e.musica) musica[e.n] = await cargar(e.musica);
  }
  const firma = hoja.firma ? await cargar(hoja.firma) : null;

  return { hoja, tomas, musica, firma };
}

// ── El reproductor ────────────────────────────────────────────────────────────

const CAMARA = {
  // Los mismos recorridos que pide el guion de ffmpeg (§4.7), en transformaciones
  // del navegador. Z coincide con el del zoompan para que se vea igual de rápido.
  acercar: [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }],
  alejar: [{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
  izquierda: [{ transform: 'scale(1.18) translateX(4%)' }, { transform: 'scale(1.18) translateX(-4%)' }],
  derecha: [{ transform: 'scale(1.18) translateX(-4%)' }, { transform: 'scale(1.18) translateX(4%)' }],
  arriba: [{ transform: 'scale(1.18) translateY(4%)' }, { transform: 'scale(1.18) translateY(-4%)' }],
  abajo: [{ transform: 'scale(1.18) translateY(-4%)' }, { transform: 'scale(1.18) translateY(4%)' }],
};

/**
 * Reproduce la pieza como sonaría montada.
 *
 * El audio va por Web Audio y programado por TIEMPO ABSOLUTO desde la hoja, no
 * encadenando «cuando acabe este, el siguiente»: encadenar acumula el retraso de
 * cada arranque y al final del documental la imagen va por delante de la voz.
 */
export function reproductor({ lienzo, marca, alCambiar, alTerminar }) {
  let ctx = null;
  let material = null;
  let fuentes = [];
  let animacion = null;
  let reloj = null;
  let urlActual = null;
  let inicioContexto = 0;
  let corriendo = false;

  const buffers = new Map();

  async function decodificar(blob) {
    if (!blob) return null;
    if (buffers.has(blob)) return buffers.get(blob);
    try {
      const b = await ctx.decodeAudioData(await blob.arrayBuffer());
      buffers.set(blob, b);
      return b;
    } catch {
      return null;
    }
  }

  function pintarToma(t) {
    if (urlActual) URL.revokeObjectURL(urlActual);
    urlActual = null;
    animacion?.cancel();

    if (!t.visual) {
      lienzo.removeAttribute('src');
      lienzo.style.visibility = 'hidden';
      return;
    }
    urlActual = URL.createObjectURL(t.visual);
    lienzo.src = urlActual;
    lienzo.style.visibility = 'visible';

    // §4.7: las tomas fijas NO se quedan quietas. Se les aplica el mismo recorrido
    // que les va a poner el montaje.
    const pasos = t.movimiento ? null : CAMARA[t.camara] || CAMARA.acercar;
    if (pasos) {
      animacion = lienzo.animate(pasos, {
        duration: t.duracion * 1000,
        easing: 'linear',
        fill: 'forwards',
      });
    }
  }

  return {
    cargar(m) {
      material = m;
      if (marca) {
        // §5.7: la marca va incrustada dentro de cada toma. Aquí va encima del
        // visor, que es lo mismo que se verá.
        marca.style.display = m.firma ? 'block' : 'none';
        if (m.firma) marca.src = URL.createObjectURL(m.firma);
      }
      if (m.tomas[0]) pintarToma(m.tomas[0]);
    },

    async reproducir(desdeSegundos = 0) {
      if (!material) throw new Error('No hay nada preparado.');
      this.parar();
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      await ctx.resume();
      corriendo = true;

      const salida = ctx.destination;

      // ── La voz ────────────────────────────────────────────────────────────
      // Un nodo por toma, programado en su `inicio` de la hoja. Sample-exacto y sin
      // deriva acumulada.
      const vozGanancia = ctx.createGain();
      vozGanancia.connect(salida);

      // El seguidor de envolvente: mide el nivel de la voz para agachar la música.
      const medidor = ctx.createAnalyser();
      medidor.fftSize = 512;
      vozGanancia.connect(medidor);
      const muestras = new Float32Array(medidor.fftSize);

      inicioContexto = ctx.currentTime + 0.08;
      for (const t of material.tomas) {
        if (t.inicio + t.duracion < desdeSegundos) continue;
        const buf = await decodificar(t.voz);
        if (!buf) continue;
        const f = ctx.createBufferSource();
        f.buffer = buf;
        f.connect(vozGanancia);
        // La voz arranca DESPUÉS de la entrada en frío, igual que en el montaje. Si
        // aquí empezara en `inicio`, la previa enseñaría un documental que no es el
        // que se va a montar — y la previa existe justamente para no descubrirlo
        // después de pagarlo.
        const arranque = t.inicio + (t.entrada || 0);
        const cuando = inicioContexto + Math.max(0, arranque - desdeSegundos);
        const salto = Math.max(0, desdeSegundos - arranque);
        f.start(cuando, salto);
        fuentes.push(f);
      }

      // ── La música ─────────────────────────────────────────────────────────
      // §5.4: un lecho continuo, escena por escena, con fundidos largos.
      const musicaGanancia = ctx.createGain();
      musicaGanancia.gain.value = 0;
      musicaGanancia.connect(salida);
      const nivelBase = 0.55;
      const FUNDIDO = material.hoja.ajustes?.fundidoMusica ?? 2.5;

      for (const e of material.hoja.escenas) {
        const buf = await decodificar(material.musica[e.n]);
        if (!buf) continue;
        const f = ctx.createBufferSource();
        f.buffer = buf;
        f.loop = true; // la pieza suele ser más corta que la escena
        const g = ctx.createGain();
        f.connect(g).connect(musicaGanancia);

        const desde = inicioContexto + Math.max(0, e.inicio - desdeSegundos);
        const hasta = desde + e.duracion;
        if (hasta <= ctx.currentTime) continue;

        g.gain.setValueAtTime(0, Math.max(desde - FUNDIDO / 2, ctx.currentTime));
        g.gain.linearRampToValueAtTime(1, desde + FUNDIDO / 2);
        g.gain.setValueAtTime(1, Math.max(hasta - FUNDIDO / 2, desde + FUNDIDO / 2));
        g.gain.linearRampToValueAtTime(0, hasta + FUNDIDO / 2);
        f.start(Math.max(desde - FUNDIDO / 2, ctx.currentTime));
        f.stop(hasta + FUNDIDO / 2 + 0.1);
        fuentes.push(f);
      }

      // ── El agachado ───────────────────────────────────────────────────────
      // §5.6: la música cede paso por COMPRESIÓN LATERAL —la voz abre el paso—, no
      // por un volumen fijo. Web Audio no tiene cadena lateral, así que se hace un
      // seguidor de envolvente: se mide la voz y se baja la música en proporción.
      // El resultado se oye igual que lo que va a hacer ffmpeg.
      let ultimo = nivelBase;
      const seguir = () => {
        if (!corriendo) return;
        medidor.getFloatTimeDomainData(muestras);
        let pico = 0;
        for (let i = 0; i < muestras.length; i++) {
          const v = Math.abs(muestras[i]);
          if (v > pico) pico = v;
        }
        // Con voz, la música baja a un quinto. Ataque rápido, vuelta lenta: si
        // vuelve rápido, se oye bombear entre palabra y palabra.
        const objetivo = pico > 0.03 ? nivelBase * 0.2 : nivelBase;
        const velocidad = objetivo < ultimo ? 0.25 : 0.03;
        ultimo += (objetivo - ultimo) * velocidad;
        musicaGanancia.gain.setTargetAtTime(ultimo, ctx.currentTime, 0.02);
        requestAnimationFrame(seguir);
      };
      requestAnimationFrame(seguir);

      // ── La imagen ─────────────────────────────────────────────────────────
      // Se pinta según el reloj del audio, que es el que manda: si se encadenara
      // por temporizadores, la imagen se separaría de la voz según avanza la pieza.
      let actual = -1;
      const pintarSegunReloj = () => {
        if (!corriendo) return;
        const t = ctx.currentTime - inicioContexto + desdeSegundos;
        if (t >= material.hoja.total) {
          this.parar();
          alTerminar?.();
          return;
        }
        const k = material.tomas.findIndex((x) => t >= x.inicio && t < x.inicio + x.duracion);
        if (k >= 0 && k !== actual) {
          actual = k;
          pintarToma(material.tomas[k]);
          alCambiar?.(material.tomas[k], k, material.tomas.length, t);
        }
        reloj = requestAnimationFrame(pintarSegunReloj);
      };
      pintarSegunReloj();
    },

    parar() {
      corriendo = false;
      cancelAnimationFrame(reloj);
      animacion?.cancel();
      for (const f of fuentes) {
        try {
          f.stop();
        } catch {
          /* ya había terminado */
        }
      }
      fuentes = [];
    },

    irA(k) {
      this.parar();
      if (material?.tomas[k]) {
        pintarToma(material.tomas[k]);
        alCambiar?.(material.tomas[k], k, material.tomas.length, material.tomas[k].inicio);
      }
    },

    /** Desde qué segundo empezar para caer en una toma concreta. */
    segundoDe(k) {
      return material?.tomas[k]?.inicio || 0;
    },
  };
}
