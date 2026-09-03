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
import { construirHoja, guionFfmpeg, guionEntrega, clavesDeLaHoja } from '../../comun/hoja.mjs';
import { claveFinal, claveVozEntera, claveLecho } from '../../comun/claves.mjs';
import { crc32, armarZip, cabeEnZip } from '../../comun/zip.mjs';
import { deBase64 } from '../imagenes.js';
import { subirMarca } from './miniatura.js';

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
      // El nivel que el usuario eligió oyéndolo en la previa es el que se exporta.
      volumenMusica: config.musica.volumen,
      firma: config.marca.activa && config.marca.texto ? undefined : null,
    },
  });
}

/**
 * ¿FALTA MATERIAL, O FALTA EL ALMACÉN?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Todo está generado, pero aún así el montador dice que algo falta.»
 *
 * Y las dos cosas eran verdad a la vez. El material estaba generado y pagado —en
 * la pantalla se ve—, y el almacén no tenía casi nada de él. Una lista de
 * doscientas treinta y ocho claves que faltan no distingue eso de una generación
 * a medias, y lo que hay que hacer es LO CONTRARIO en cada caso: generar, o traer
 * lo que ya está pagado. Sin distinguirlo, la salida natural es darle otra vez a
 * generar y pagar dos veces un episodio entero.
 *
 * Se distingue sin preguntar nada nuevo: con la misma respuesta que el almacén
 * acaba de dar, contando aparte lo que es DE ESTE EPISODIO. Sale un número, no
 * una teoría: «tiene 1 de los 250». Y cuando ese número es cero —descontando la
 * firma, que la sube esta misma comprobación un segundo antes, y lo heredado, que
 * vive bajo el prefijo de otra pieza— el problema no es el material: es el sitio
 * donde se está mirando. Cambiar de cuenta o de cubo de Google Cloud deja
 * exactamente esta huella.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function dondeEstaElMaterial(pieza, claves, faltan) {
  // Solo lo de ESTE episodio: lo heredado y lo de la biblioteca vive bajo otro
  // prefijo, existe desde antes y no dice nada de si el cubo es el correcto.
  const suyas = claves.filter((k) => k.startsWith(`${pieza.id}/`) && k !== `${pieza.id}/firma`);
  if (!suyas.length) return null;

  const seFue = new Set(faltan);
  const hay = suyas.filter((k) => !seFue.has(k)).length;
  if (hay === suyas.length) return null;
  const cuenta =
    `De este episodio el almacén tiene ${hay} ${hay === 1 ? 'material' : 'materiales'} ` +
    `de los ${suyas.length} que hacen falta.`;

  if (hay > 0) return cuenta;

  return (
    `${cuenta} NI UNO. Y eso no es que no esté generado: lo que ves en la pantalla ` +
    `es la copia del teléfono, así que el material existe y está pagado, pero en el ` +
    `cubo donde se generó. Pasa al cambiar de cuenta de Google Cloud: el cubo nuevo ` +
    `empieza vacío. Hay dos salidas y ninguna es volver a generar —eso sería pagarlo ` +
    `dos veces—: poner otra vez en Vercel la cuenta con la que se generó, o copiar el ` +
    `material del cubo de antes al de ahora.`
  );
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

  // LA MARCA SE DIBUJA AQUÍ, NO SE ESPERA A QUE ALGUIEN SE ACUERDE.
  //
  // En pantalla: «Faltan 1 materiales. No se lanza el montaje. Falta:
  // p2925/firma», con las 83 tomas, las 62 imágenes, los 35 clips y las 4
  // músicas pagadas y en su sitio. La hoja EXIGE la firma cuando la marca está
  // activa, pero la subía únicamente un botón suelto de Ajustes: un PNG gratis
  // —lo dibuja el navegador sobre un lienzo, no cuesta ni una llamada al
  // modelo— bloqueaba el montaje entero.
  //
  // Se sube cada vez y con el id de LA PIEZA (el botón de Ajustes usaba el del
  // proyecto, que solo coincide con la primera pieza). Así también entra
  // enseguida un cambio de texto o de color de la marca.
  if (hoja.firma) await subirMarca({ pieza: pieza.id, config, senal });

  const previa = await llamar('montar.comprobar', { hoja }, { senal });

  const sinMedir = pieza.tomas.filter((t) => !t.medida);
  const forzados = pieza.tomas.filter((t) => t.corteForzado);
  const faltan = previa.faltan || [];
  const dondeEsta = dondeEstaElMaterial(pieza, claves, faltan);

  return {
    hoja,
    guion,
    claves,
    completo: previa.completo,
    faltan,
    total: previa.total,
    duracion: hoja.total,
    dondeEsta,
    avisos: [
      // Primero: cuando falta material, lo que decide qué hacer es DÓNDE está, no
      // cuántos faltan.
      dondeEsta,
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
  const { hoja, guion, completo, faltan, dondeEsta } = await revisar({ pieza, config, senal });

  if (!completo) {
    throw new Error(
      // Lo primero de todo, DÓNDE ESTÁ: una lista de claves que faltan invita a
      // volver a generar, y volver a generar es pagar dos veces lo que ya existe.
      (dondeEsta ? `${dondeEsta}\n\n` : '') +
        `Faltan ${faltan.length} materiales. No se lanza el montaje: fallaría sin decir ` +
        `por qué. Falta: ${faltan.slice(0, 10).join(', ')}` +
        (faltan.length > 10 ? ` y ${faltan.length - 10} más.` : '.'),
    );
  }

  aviso?.('Arrancando el montador en la nube…');
  const r = await llamar(
    'montar.lanzar',
    { pieza: pieza.id, hoja, guionFfmpeg: guion, guionDeEntrega: guionEntrega(hoja) },
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
  const p = await bajarPista({ clave: claveFinal(pieza.id), tipo: 'video/mp4', senal, alAvanzar });
  return p && new Blob(p.partes, { type: 'video/mp4' });
}

/**
 * Baja un material por trozos y devuelve las piezas, el tamaño y su CRC32.
 *
 * Las piezas se devuelven SIN pegar y el CRC se acumula sobre la marcha, que es
 * lo que permite meterlas después en un ZIP sin que el archivo entero pase nunca
 * por la memoria de JavaScript. Un documental de quince minutos pasa del giga: si
 * se materializara, el navegador del teléfono recarga la página a media descarga.
 */
export async function bajarPista({ clave, tipo, senal, alAvanzar }) {
  const partes = [];
  let desde = 0;
  let total = null;
  let crc = 0;

  do {
    if (senal?.aborted) throw new Error('Detenido.');
    const r = await llamar('bajar', { clave, desde }, { senal });
    if (!r.existe) return null;

    const trozo = deBase64(r.datos, tipo);
    partes.push(trozo);
    crc = crc32(new Uint8Array(await trozo.arrayBuffer()), crc);
    total = r.total;
    desde = r.hasta + 1;
    alAvanzar?.(desde, total);
  } while (total && desde < total);

  return { partes, bytes: desde, crc };
}

/**
 * El paquete de entrega: todo lo que hace falta para publicar, en un archivo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Debería descargar un ZIP donde venga ya el video, un archivo de texto con la
 *  descripción que va en el video al publicarlo más los hashtags, toda la música
 *  continua sola, y aparte toda la voz en un solo audio.»
 *
 * Las dos pistas sueltas no se fabrican aquí: el montaje YA las hizo para poder
 * mezclarlas y hasta ahora las tiraba al terminar. Lo único nuevo es subirlas.
 *
 * Un aviso honesto sobre el tiempo: el paquete NO se baja más rápido que el
 * video solo — trae más cosas, así que tarda algo más. Lo que tarda es el video,
 * y eso es su tamaño, no el formato.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function bajarPaquete({ pieza, titulo, texto, senal, alAvanzar }) {
  const nombre = (titulo || 'documental').replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/gi, '').trim() || 'documental';

  const video = await bajarPista({
    clave: claveFinal(pieza.id),
    tipo: 'video/mp4',
    senal,
    alAvanzar: (h, t) => alAvanzar?.('el video', h, t),
  });
  if (!video) return null;

  // Las pistas sueltas son de un montaje reciente: una pieza montada antes de que
  // el contenedor las subiera no las tiene, y eso no es motivo para no entregar
  // el paquete — se dice cuáles faltan y se sigue.
  const sueltas = [];
  for (const [clave, archivo, comoSeLlama] of [
    [claveVozEntera(pieza.id), `${nombre} · voz.m4a`, 'la voz'],
    [claveLecho(pieza.id), `${nombre} · música.m4a`, 'la música'],
  ]) {
    const p = await bajarPista({
      clave,
      tipo: 'audio/mp4',
      senal,
      alAvanzar: (h, t) => alAvanzar?.(comoSeLlama, h, t),
    }).catch(() => null);
    if (p) sueltas.push({ nombre: archivo, ...p });
  }

  const bytesTexto = new TextEncoder().encode(texto || '');
  const entradas = [
    { nombre: `${nombre}.mp4`, ...video },
    { nombre: `${nombre} · publicar.txt`, partes: [bytesTexto], bytes: bytesTexto.length, crc: crc32(bytesTexto) },
    ...sueltas,
  ];

  // Por encima de cuatro gigas haría falta ZIP64, y un ZIP que declara un tamaño
  // y trae otro no se abre. Antes que entregar un archivo roto, se entrega el
  // video solo y se dice por qué.
  if (!cabeEnZip(entradas)) {
    return {
      blob: new Blob(video.partes, { type: 'video/mp4' }),
      archivo: `${nombre}.mp4`,
      incompleto: 'El paquete pasa de cuatro gigas y no cabe en un ZIP. Se entrega el video solo.',
    };
  }

  return {
    blob: new Blob(armarZip(entradas), { type: 'application/zip' }),
    archivo: `${nombre}.zip`,
    lleva: entradas.map((e) => e.nombre),
    faltan: 2 - sueltas.length,
  };
}
