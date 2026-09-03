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
import { claveFinal, claveVozEntera, claveLecho, tipoDe } from '../../comun/claves.mjs';
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
 * QUÉ TIENE EL ALMACÉN DE ESTE EPISODIO. No qué debería tener: qué tiene.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Todo está generado, pero aún así el montador dice que algo falta.»
 *
 * Y las dos cosas eran verdad a la vez: el episodio generado y pagado, y el
 * montaje sin encontrarlo. Lo único que salía en pantalla era una lista de
 * doscientas treinta y ocho claves que faltan, y esa lista no distingue entre las
 * tres cosas que la producen —no se generó, no se subió, o está subido con otro
 * nombre—, que se arreglan de tres maneras distintas. Con la lista a secas, la
 * salida natural es darle otra vez a generar: pagar dos veces algo que a lo mejor
 * ya está ahí.
 *
 * Así que se le pregunta al almacén qué hay bajo el episodio y se pone al lado de
 * lo que el montaje pide. Salen hechos, no teorías: cuántos archivos hay, y —lo
 * que de verdad decide— si hay archivos que ESTÁN y que el montaje no pide. Eso
 * último solo puede significar una cosa: el nombre cambió después de generarlos,
 * y el nombre lleva dentro el número de la toma.
 *
 * NO se diagnostica más de lo que se ve. Adivinar aquí cuesta un episodio entero.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function queTieneElAlmacen(pieza, claves, faltan, senal) {
  if (!faltan.length) return null;
  if (!claves.some((k) => k.startsWith(`${pieza.id}/`))) return null;
  try {
    const r = await llamar('listar', { prefijo: `${pieza.id}/` }, { senal });
    const tiene = (r.materiales || []).filter((m) => m.bytes > 0).map((m) => m.clave);

    // SI NO HAY NADA DEL EPISODIO, ¿QUÉ HAY?
    //
    // «Si la configuración estaba correcta, debió haberse guardado todo. No
    //  entiendo por qué dice que no se guardó, si todo está generado ahí.»
    //
    // Y tiene razón en la extrañeza: nada se marca como generado sin que el
    // almacén confirme el tamaño —una subida sin confirmar LANZA (§7.12)—, así que
    // esos archivos existen y algún almacén los confirmó uno a uno. Decir «no se
    // subió» sería falso. La pregunta buena es OTRA: qué hay aquí dentro. Un
    // almacén con carpetas llenas de otro episodio dice una cosa; un almacén
    // vacío del todo dice otra, y la segunda no se puede arreglar generando.
    const todo = tiene.length ? null : await llamar('listar', { prefijo: '' }, { senal });
    return loQueDiceElAlmacen(
      pieza,
      claves,
      faltan,
      tiene,
      todo ? (todo.materiales || []).filter((m) => m.bytes > 0).map((m) => m.clave) : null,
    );
  } catch {
    // Sin respuesta del almacén no se dice nada: un diagnóstico inventado manda a
    // rehacer un episodio entero.
    return null;
  }
}

/** `p07/t003/img` → `p07`. La carpeta de primer nivel, que es lo que se enseña. */
const carpetaDe = (clave) => String(clave).split('/')[0];

/** La lectura, sin nube: lo que pide el montaje contra lo que hay. Ver arriba. */
export function loQueDiceElAlmacen(pieza, claves, faltan, tiene, todo = null) {
  // Solo lo de ESTE episodio: lo heredado y lo de la biblioteca vive bajo otro
  // prefijo. Y la firma se descuenta porque la sube esta misma comprobación un
  // segundo antes: contarla sería contar lo que acabamos de poner nosotros.
  const bajo = `${pieza.id}/`;
  const pide = claves.filter((k) => k.startsWith(bajo) && k !== `${pieza.id}/firma`);
  if (!pide.length || !faltan.length) return null;

  // La firma no cuenta: la sube esta misma comprobación un segundo antes, así que
  // contarla sería contar lo que acabamos de poner nosotros y «no hay nada» nunca
  // saldría.
  const hay = tiene.filter((k) => k !== `${pieza.id}/firma`);
  const pedidas = new Set(pide);
  const sobran = hay.filter((k) => !pedidas.has(k));
  const noEstan = pide.filter((k) => faltan.includes(k));
  // Lo que falta es de la biblioteca o heredado de otra pieza: eso no se explica
  // mirando bajo este episodio.
  if (!noEstan.length) return null;

  const lineas = [
    `El almacén tiene ${hay.length} ${hay.length === 1 ? 'archivo' : 'archivos'} de este ` +
      `episodio. El montaje pide ${pide.length} y no encuentra ${noEstan.length}.`,
  ];

  if (!hay.length) {
    // NI «no se generó» NI «no se subió»: nada se marca como generado sin que el
    // almacén confirme el tamaño (§7.12). Lo que queda es que el almacén que lo
    // confirmó no es este. Así que en vez de explicarlo, se enseña qué hay aquí.
    lineas.push(
      `No hay NI UNO bajo «${bajo}», y eso no significa que no se generara: nada se ` +
        `pone en verde sin que el almacén confirme el archivo, uno a uno. O sea que ` +
        `estos ${pide.length} los confirmó un almacén — y no es este.`,
    );
    if (Array.isArray(todo)) {
      const porCarpeta = new Map();
      for (const k of todo) porCarpeta.set(carpetaDe(k), (porCarpeta.get(carpetaDe(k)) || 0) + 1);
      const orden = [...porCarpeta.entries()].sort((a, b) => b[1] - a[1]);
      lineas.push(
        orden.length
          ? `Este almacén tiene ${todo.length} archivos en total, en estas carpetas: ` +
            `${orden.slice(0, 8).map(([c, n]) => `${c} (${n})`).join(', ')}` +
            `${orden.length > 8 ? ` y ${orden.length - 8} más` : ''}.`
          : 'Este almacén está VACÍO del todo: ni un archivo, de ningún episodio ni de la biblioteca.',
      );
    }
  } else if (sobran.length) {
    // Lo que de verdad decide. Un archivo que está y que nadie pide se generó con
    // un nombre que ya no vale, y el nombre lleva dentro el número de la toma.
    lineas.push(
      `Hay ${sobran.length} que ESTÁN y el montaje no pide. Pide: ${noEstan.slice(0, 3).join(', ')}. ` +
        `Tiene: ${sobran.slice(0, 3).join(', ')}. El nombre lleva dentro el número de la toma, ` +
        `así que esto es material subido con números que ya no son los de ahora: está pagado y ` +
        `no hay que volver a generarlo.`,
    );
  }

  return lineas.join(' ');
}

/**
 * BUSCA EL MATERIAL DONDE ESTÉ Y APUNTA CADA TOMA A SU ARCHIVO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Ahí está el bucket, está correcto, ahí está todo guardado, ya revisé los
 *  archivos.» Y la pantalla: «Faltan 238 de 250 materiales.»
 *
 * «No me importa el mensaje que diga la aplicación. Yo lo que necesito es
 *  solucionar.»
 *
 * Un mensaje que explica muy bien por qué no se puede montar sigue siendo un
 * mensaje que no monta. El material está en el almacén, pagado y entero, guardado
 * bajo un nombre que el montaje ya no pide — porque la carpeta lleva el id de la
 * pieza y ese id no es el mismo con el que se subió. Eso NO se arregla generando.
 *
 * Esto lo arregla: mira el almacén ENTERO, busca cada archivo que falta por su
 * cola —`t017/img`, `mus/003`—, se queda con la carpeta que más cubra, y apunta
 * cada toma a su archivo real con el mecanismo que ya existía para heredar
 * material de otra pieza. No copia nada, no genera nada, no borra nada: solo deja
 * escrito dónde está lo que ya está.
 *
 * Una sola carpeta, la que más cubra: mezclar dos sería montar este episodio con
 * trozos de otro, y eso es peor que no montar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function buscarElMaterial({ pieza, config, senal, aviso }) {
  const hoja = hojaDe(pieza, config);
  const previa = await llamar('montar.comprobar', { hoja }, { senal });
  // La firma no se busca: la vuelve a subir la propia revisión.
  const faltan = (previa.faltan || []).filter((k) => !k.endsWith('/firma'));
  if (!faltan.length) return { faltaban: 0, encontrados: 0, carpeta: '' };

  aviso?.('Mirando el almacén entero…');
  const r = await llamar('listar', { prefijo: '' }, { senal });
  const enElAlmacen = (r.materiales || []).filter((m) => m.bytes > 0).map((m) => String(m.clave));
  return { faltaban: faltan.length, ...apuntarAlMaterialQueHay(pieza, faltan, enElAlmacen) };
}

/** La parte sin nube: elige carpeta y escribe los punteros. Ver arriba. */
export function apuntarAlMaterialQueHay(pieza, faltan, enElAlmacen) {
  const hay = new Set(enElAlmacen);
  const cola = (k) => k.slice(k.indexOf('/') + 1);
  const carpeta = (k) => k.slice(0, k.indexOf('/'));
  const colas = faltan.map(cola);

  // UNA sola carpeta, la que más cubra. Ir cogiendo de cada una lo que encaje
  // montaría este episodio con trozos de otro, y eso es peor que no montar.
  let ganadora = '';
  let mejor = 0;
  for (const c of new Set([...hay].map(carpeta).filter(Boolean))) {
    if (c === pieza.id) continue;
    const n = colas.filter((x) => hay.has(`${c}/${x}`)).length;
    if (n > mejor) {
      mejor = n;
      ganadora = c;
    }
  }
  if (!ganadora) return { encontrados: 0, carpeta: '' };

  let encontrados = 0;
  for (const k of faltan) {
    const destino = `${ganadora}/${cola(k)}`;
    if (!hay.has(destino)) continue;

    const deToma = /^t(\d{3})\/(img|vid|audio)$/.exec(cola(k));
    if (deToma) {
      const t = (pieza.tomas || []).find((x) => x.i === Number(deToma[1]));
      if (!t) continue;
      if (deToma[2] === 'img') t.heredado = destino;
      if (deToma[2] === 'vid') t.heredadoVid = destino;
      if (deToma[2] === 'audio') t.heredadoAudio = destino;
      encontrados++;
      continue;
    }

    const deEscena = /^mus\/(\d{3})$/.exec(cola(k));
    if (deEscena) {
      const e = (pieza.escenas || []).find((x) => x.n === Number(deEscena[1]));
      if (!e) continue;
      // La hoja ya acepta una clave entera aquí: si `escena.musica` lleva una
      // barra, la usa tal cual en vez de componerla. No hace falta campo nuevo.
      e.musica = destino;
      encontrados++;
    }
  }

  return { encontrados, carpeta: ganadora };
}

/**
 * DE QUÉ SON LOS 250 MATERIALES.
 *
 * «Además, todo el tiempo dice doscientos cincuenta. Si son ciento y algo de
 *  tomas, no entiendo.»
 *
 * Y no hay por qué entenderlo: un número solo no dice de qué es. Cada toma son
 * DOS archivos —su voz y su visual— y encima el visual se comparte: dos tomas del
 * mismo plano usan la misma imagen y no se paga dos veces. Sumadas la música de
 * cada escena y la marca, salen los doscientos cincuenta.
 *
 * Dicho por tipos, la cuenta se puede seguir con los dedos y además se ve dónde
 * está lo caro.
 */
export function porTipo(claves) {
  const nombres = { audio: 'voces', img: 'imágenes', vid: 'clips', mus: 'músicas', firma: 'la marca' };
  const cuenta = new Map();
  for (const k of claves) {
    let t;
    try {
      t = tipoDe(k);
    } catch {
      continue;
    }
    cuenta.set(t, (cuenta.get(t) || 0) + 1);
  }
  return ['audio', 'img', 'vid', 'mus', 'firma']
    .filter((t) => cuenta.get(t))
    .map((t) => (t === 'firma' ? 'la marca' : `${cuenta.get(t)} ${nombres[t]}`))
    .join(' · ');
}

/**
 * ¿EL LIENZO ES DEL FORMATO EN EL QUE SE GENERÓ EL EPISODIO?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Montó el video, pero utilizó las imágenes dieciséis nueve y lo montó en nueve
 *  dieciséis, y solamente hizo un zoom horrible que dañó todo.»
 *
 * El episodio lleva sellado el formato en el que generó su primera imagen
 * (`aspecto`, ver `sellarFormato`). El lienzo del montaje sale de la
 * configuración. Son dos cosas y pueden no cuadrar — cuadraron mal una vez y
 * costó media hora de montaje—. Aquí se comparan ANTES de arrancar, que es el
 * único momento en que decirlo sirve de algo.
 *
 * Un episodio sin formato sellado no ha generado nada todavía: no hay nada que
 * comparar y no se inventa.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function formatoQueNoCuadra(pieza, config) {
  const sellado = pieza?.aspecto === '16:9' || pieza?.aspecto === '9:16' ? pieza.aspecto : '';
  if (!sellado) return null;
  const ancho = Number(config?.formato?.ancho) || 0;
  const alto = Number(config?.formato?.alto) || 0;
  if (!ancho || !alto) return null;
  const lienzo = ancho >= alto ? '16:9' : '9:16';
  if (lienzo === sellado) return null;
  return (
    `El episodio se generó en ${sellado} y el montaje saldría en ${lienzo} (${ancho}×${alto}): ` +
    `cada imagen se recortaría al centro. No se monta así. Pon el canal en ${sellado} en ` +
    `Ajustes, o vuelve a generar las imágenes en ${lienzo}.`
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
  const dondeEsta = await queTieneElAlmacen(pieza, claves, faltan, senal);
  const formatoMal = formatoQueNoCuadra(pieza, config);
  // Cuántas tomas NO tienen visual propio: la hoja les puso el mismo archivo que
  // a otra. Es la diferencia entre las tomas y los visuales de la lista.
  const repiten = hoja.tomas.length - new Set(hoja.tomas.map((t) => t.archivo)).size;

  return {
    hoja,
    guion,
    claves,
    completo: previa.completo,
    faltan,
    total: previa.total,
    duracion: hoja.total,
    // «Ahí dice ochenta y ocho imágenes y veinte clips. Se supone que son ciento
    //  treinta y tres, ¿o no?» Sí: las que faltan para llegar repiten el visual de
    //  otra toma —mismo plano, misma imagen, no se paga dos veces (§3)—. Sin
    //  decirlo, la cuenta no cierra y parece que se perdió material.
    deQueSon:
      porTipo(claves) +
      (repiten ? ` · y ${repiten} tomas repiten el visual de otra` : ''),
    dondeEsta,
    formatoMal,
    avisos: [
      // Antes que nada: un lienzo del formato equivocado tira media hora de
      // montaje entera, y se sabe ANTES de arrancar.
      formatoMal,
      // Después: cuando falta material, lo que decide qué hacer es DÓNDE está, no
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
  const { hoja, guion, completo, faltan, dondeEsta, formatoMal } = await revisar({ pieza, config, senal });

  // No se lanza un montaje que va a salir mal. Media hora y un trabajo pagado
  // para un video que hay que tirar: eso ya pasó una vez.
  if (formatoMal) throw new Error(formatoMal);

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
