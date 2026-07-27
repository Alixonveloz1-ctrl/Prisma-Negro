// Fase 8 — Música (§4.8 del plano).
//
//   «Una pieza por escena. Se genera con un modelo de música a partir de una
//    descripción de atmósfera derivada de la ficha de escena.»
//
// El montaje la arma como un LECHO CONTINUO del largo de la pieza, escena por
// escena, con fundidos largos entre piezas de 1,5 a 3,5 s (§5.4). Con fundidos
// cortos el relevo se oye como un tajo. Eso vive en `comun/hoja.mjs`; aquí solo se
// genera el material.

import { llamar } from '../api.js';
import { comoInstruccion } from './director.js';
import { claveMusica } from '../../comun/claves.mjs';

export function planificar(escenas, tomas, config, { soloLasQueFaltan = true } = {}) {
  if (!config?.musica?.activa) return [];
  return escenas
    .map((e) => {
      const suyas = tomas.filter((t) => t.escena === e.n);
      return {
        ...e,
        segundos: suyas.reduce((s, t) => s + (t.segundos || 0), 0),
        estado: e.musica,
      };
    })
    .filter((e) => e.segundos > 0)
    .filter((e) => (soloLasQueFaltan ? e.estado !== 'ok' : true));
}

/**
 * Deriva la atmósfera de una escena a partir de sus planos y su texto.
 *
 * Se hace aquí, con lo que ya hay, en vez de con otra llamada a un modelo de texto:
 * la ficha de escena ya lleva el lugar, la luz y el tono. Una llamada más costaría
 * dinero para decir lo mismo.
 */
export function atmosferaDe(escena, tomas, tratamiento = null) {
  const suyas = tomas.filter((t) => t.escena === escena.n && t.plano);
  const lugares = [...new Set(suyas.map((t) => t.plano.lugar).filter(Boolean))].slice(0, 2);
  const luces = [...new Set(suyas.map((t) => t.plano.luz).filter(Boolean))].slice(0, 2);

  return [
    'Música instrumental de documental, sin voces, sin percusión marcada.',
    // Lo que pidió el director para toda la pieza. Sin esto cada escena suena a un
    // documental distinto.
    tratamiento ? comoInstruccion(tratamiento, { para: 'musica' }) : '',
    escena.titulo ? `Escena: ${escena.titulo}.` : '',
    lugares.length ? `Ambiente: ${lugares.join(', ')}.` : '',
    luces.length ? `Luz: ${luces.join(', ')}.` : '',
    'Tensión contenida, cuerdas graves largas, textura tenue.',
    // La música va DEBAJO de la narración: si tiene melodía marcada, compite con la
    // voz y no hay compresión lateral que lo arregle (§5.6).
    'Sin melodía protagonista: es un lecho que va por debajo de una voz en off.',
    'Dinámica plana y constante, sin clímax ni silencios bruscos.',
  ]
    .filter(Boolean)
    .join(' ');
}

export async function generarMusicaDeEscena({ escena, tomas, pieza, tratamiento = null, senal, alEsperar }) {
  const clave = claveMusica(pieza, escena.n);

  const r = await llamar(
    'musica',
    {
      instruccion: atmosferaDe(escena, tomas, tratamiento),
      // Se genera algo más corta que la escena a propósito: el montaje la repite si
      // hace falta (`-stream_loop`). Un lecho sin melodía protagonista se repite sin
      // que se note, y pagar dos minutos de música para una escena de dos minutos es
      // tirar dinero.
      segundos: Math.min(90, Math.max(20, Math.round(escena.segundos * 0.5))),
      guardarEn: clave,
    },
    { senal, alEsperar },
  );

  // §7.12: ningún valor de retorno de una escritura se ignora.
  if (!r.guardado?.bytes) {
    throw new Error(`La música de la escena ${escena.n} no quedó confirmada en el almacén.`);
  }

  return { n: escena.n, musica: 'ok', clave, bytes: r.guardado.bytes };
}
