// Fase 11 — Montaje (§4.11 y §5 del plano).
//
// Esta fase no genera nada: compone la HOJA DE MONTAJE, saca de ella el guion de
// ffmpeg y la lista de descargas, comprueba que está todo, y arranca el contenedor.
//
// Las reglas de cómo se une el video sin perder calidad están en `comun/hoja.mjs`,
// junto al generador del guion, porque de la MISMA hoja salen el guion y la lista de
// descargas y así no pueden discrepar (§3).
//
// §7.6 — «Un código de salida no es un mensaje de error.» Por eso aquí hay tres
// cosas y no una: se comprueba antes de lanzar y se dice qué falta por su nombre; el
// contenedor escribe su queja donde la aplicación puede leerla; y la aplicación lee
// el registro de la nube por su cuenta, porque el usuario no puede.

import { llamar } from '../api.js';
import { construirHoja, guionFfmpeg, clavesDeLaHoja } from '../../comun/hoja.mjs';
import { claveFinal } from '../../comun/claves.mjs';
import { deBase64 } from '../imagenes.js';

/** Compone la hoja de montaje de una pieza. */
export function hojaDe(pieza, config) {
  return construirHoja({
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
}

/**
 * Qué se va a montar y con qué. Se enseña ANTES de arrancar nada.
 *
 * Incluye la comprobación previa contra el almacén: si falta material, aquí sale
 * dicho por su nombre, en pantalla, en vez de convertirse en un código de salida
 * media hora después (§7.6).
 */
export async function revisar({ pieza, config, senal }) {
  const hoja = hojaDe(pieza, config);
  const guion = guionFfmpeg(hoja);
  const claves = clavesDeLaHoja(hoja);

  const previa = await llamar('montar.comprobar', { hoja }, { senal });

  const sinMedir = pieza.tomas.filter((t) => !t.medida);
  const forzados = pieza.tomas.filter((t) => t.corteForzado);

  return {
    hoja,
    guion,
    claves,
    completo: previa.completo,
    faltan: previa.faltan || [],
    total: previa.total,
    duracion: hoja.total,
    avisos: [
      sinMedir.length
        ? `${sinMedir.length} tomas no tienen duración medida: el montaje usaría la ` +
          `estimada y la voz no cuadraría con la imagen. Genera la narración primero.`
        : null,
      forzados.length
        ? `${forzados.length} tomas se cortaron sin un silencio cerca. Escúchalas antes ` +
          `de montar: puede haber una palabra partida.`
        : null,
      !hoja.firma && config.marca.activa
        ? 'La marca del canal está activa pero no tiene texto: se montará sin marca.'
        : null,
    ].filter(Boolean),
  };
}

/**
 * Lanza el montaje.
 *
 * La comprobación previa se hace TAMBIÉN en el servidor antes de arrancar el
 * contenedor: es lo que impide gastar un job entero para descubrir que faltaba una
 * imagen.
 */
export async function montar({ pieza, config, senal, aviso }) {
  const { hoja, guion, completo, faltan } = await revisar({ pieza, config, senal });

  if (!completo) {
    throw new Error(
      `Faltan ${faltan.length} materiales. No se lanza el montaje: fallaría sin decir ` +
        `por qué. Falta: ${faltan.slice(0, 10).join(', ')}` +
        (faltan.length > 10 ? ` y ${faltan.length - 10} más.` : '.'),
    );
  }

  aviso?.('Arrancando el montador en la nube…');
  const r = await llamar(
    'montar.lanzar',
    { pieza: pieza.id, hoja, guionFfmpeg: guion },
    { senal },
  );

  return r.ejecucion;
}

/**
 * Espera a que termine el montaje y, si falla, LEE EL REGISTRO DE LA NUBE.
 *
 * §7.6, tercera lección: «Y que la aplicación lea el registro de la nube por su
 * cuenta, porque el usuario no puede.» Trabaja desde un teléfono y no abre consolas.
 */
export async function esperarMontaje({ ejecucion, senal, aviso }) {
  const desde = Date.now();

  while (Date.now() - desde < 3600000) {
    if (senal?.aborted) throw new Error('Detenido.');

    const r = await llamar('montar.estado', { ejecucion }, { senal });
    if (r.listo) {
      if (r.ok) return { ok: true, minutos: +((Date.now() - desde) / 60000).toFixed(1) };

      // Falló. La queja está en el registro; se trae y se enseña con palabras.
      const reg = await llamar('montar.registro', { ejecucion, lineas: 40 }, { senal }).catch(() => null);
      const lineas = reg?.lineas || [];
      const utiles = lineas.filter((l) => /falta|error|no se pudo|rendirse|Invalid|No such/i.test(l));

      return {
        ok: false,
        error: r.error || 'El montaje falló.',
        // Lo que de verdad explica el fallo, primero.
        registro: (utiles.length ? utiles : lineas).slice(-12),
      };
    }

    aviso?.(`Montando… ${Math.round((Date.now() - desde) / 60000)} min.`);
    await new Promise((res) => setTimeout(res, 15000));
  }

  throw new Error('El montaje lleva más de una hora. Se deja de esperar.');
}

/**
 * Baja el video montado.
 *
 * §6: una pieza completa son casi dos gigas y el tope de respuesta son 4,5 MB. Baja
 * POR TROZOS y se va pegando en un Blob respaldado en disco. Si se materializara en
 * memoria de JavaScript, el navegador del teléfono recargaría la página a media
 * descarga.
 */
export async function bajarFinal({ pieza, senal, alAvanzar }) {
  const clave = claveFinal(pieza.id);
  const partes = [];
  let desde = 0;
  let total = null;

  do {
    if (senal?.aborted) throw new Error('Detenido.');
    const r = await llamar('bajar', { clave, desde }, { senal });
    if (!r.existe) return null;

    // Cada trozo va directo a un Blob: nunca se acumula el video entero en memoria.
    partes.push(deBase64(r.datos, 'video/mp4'));
    total = r.total;
    desde = r.hasta + 1;
    alAvanzar?.(desde, total);
  } while (total && desde < total);

  return new Blob(partes, { type: 'video/mp4' });
}
