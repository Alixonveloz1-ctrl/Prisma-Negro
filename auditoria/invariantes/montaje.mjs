// Invariantes del montaje (§3, §5, §7.4, §7.5, §7.6 del plano).
//
// Estas son las que más caro costaron. Cada regla del §5 viene de un defecto
// AUDIBLE, y §7.4 es «la invariante más importante de toda la arquitectura».
//
// Casi todas se comprueban sobre un guion de ffmpeg generado con datos sintéticos:
// se prueba entero en milisegundos y ahí salen los fallos de estructura, en vez de
// después de horas mirando la nube (§10).

import { editando, conFuncion } from '../contexto.mjs';

const fuente = (ctx, ruta) => ctx.fuentes.get(ruta) || '';

/** Los archivos que el guion ABRE (todo `-i <algo>`). */
function entradasDelGuion(guion) {
  const salida = new Set();
  for (const m of guion.matchAll(/-i\s+'([^']+)'/g)) salida.add(m[1]);
  for (const m of guion.matchAll(/-i\s+([^\s'"]+)/g)) salida.add(m[1]);
  return salida;
}

/** Los archivos que el propio guion CREA. No vienen del manifiesto. */
function salidasDelGuion(guion) {
  const salida = new Set();
  for (const linea of guion.split('\n')) {
    const t = linea.trim();
    if (t.startsWith('ffmpeg ')) {
      const ultimo = t.split(/\s+/).pop();
      if (ultimo && !ultimo.startsWith('-')) salida.add(ultimo.replace(/^'|'$/g, ''));
    }
    const cp = t.match(/^cp\s+\S+\s+(\S+)/);
    if (cp) salida.add(cp[1]);
    const lista = t.match(/>>\s*(\S+)/);
    if (lista) salida.add(lista[1]);
  }
  // Las listas de concatenación las escribe el propio guion.
  salida.add('lista_video.txt');
  salida.add('lista_voz.txt');
  return salida;
}

const destinosDelManifiesto = (m) =>
  new Set(
    m
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\t')[1])
      .filter(Boolean),
  );

export const invariantes = [
  // ── §3: los dos productos de la hoja no pueden discrepar ──────────────────
  {
    nombre: 'la-lista-de-descargas-cubre-lo-que-abre-el-montaje',
    dice: 'Todo archivo que el guion de ffmpeg abre y no crea él mismo está en el manifiesto. De la misma hoja salen los dos, justamente para que no puedan discrepar (§3).',
    comprobar(ctx) {
      const abre = entradasDelGuion(ctx.guion);
      const crea = salidasDelGuion(ctx.guion);
      const tiene = destinosDelManifiesto(ctx.manifiesto);
      return [...abre]
        .filter((f) => !crea.has(f) && !tiene.has(f))
        .map((f) => `El montaje abre «${f}» y nadie se lo baja: sería un exit code sin mensaje.`);
    },
    // Es exactamente §7.4: se añade material al guion y el manifiesto se queda atrás.
    romper: (ctx) => ({
      ...ctx,
      manifiesto: ctx.manifiesto.split('\n').slice(1).join('\n'),
    }),
  },

  {
    nombre: 'la-previa-sale-de-la-misma-hoja-que-el-montaje',
    dice: 'La vista previa se construye desde la MISMA hoja que usa ffmpeg. Con una línea de tiempo propia enseñaría un documental parecido al que se va a montar, que es justo lo que no vale para decidir.',
    comprobar(ctx) {
      const p = fuente(ctx, 'app/previa.js');
      const fallos = [];

      if (!/construirHoja/.test(p)) {
        fallos.push('La previa no construye la hoja: compone su propia línea de tiempo.');
      }
      // Los tiempos tienen que salir de la hoja, no de encadenar «cuando acabe este».
      if (!/t\.inicio/.test(p)) fallos.push('La previa no coloca la voz por el `inicio` de la hoja.');
      if (!/hoja\.escenas/.test(p)) fallos.push('La música de la previa no sale del reparto por escena de la hoja.');

      // Y tiene que reproducir lo que el montaje hace con el sonido y la imagen: sin
      // esto es un pase de diapositivas, no una previa.
      const debeHacer = [
        [/AudioContext/, 'sonar por Web Audio y no con etiquetas sueltas'],
        [/loop = true|loop=true/, 'repetir la música si la pieza es más corta que la escena'],
        [/linearRampToValueAtTime/, 'los fundidos largos de la música (§5.4)'],
        [/getFloatTimeDomainData|createAnalyser/, 'agachar la música midiendo la voz (§5.6)'],
        [/CAMARA|animate\(/, 'el recorrido de cámara de las tomas fijas (§4.7)'],
        [/firma/, 'la marca del canal (§5.7)'],
      ];
      for (const [re, que] of debeHacer) {
        if (!re.test(p)) fallos.push(`La previa no hace: ${que}.`);
      }
      return fallos;
    },
    // Encadenar por temporizadores en vez de programar por tiempo absoluto es el
    // error que hace que la imagen se separe de la voz según avanza la pieza.
    romper: (ctx) =>
      editando(ctx, 'app/previa.js', (t) =>
        t.replace(/createAnalyser/g, 'createGain').replace(/getFloatTimeDomainData/g, 'noMide'),
      ),
  },

  {
    nombre: 'el-manifiesto-no-lleva-nada-que-no-se-use',
    dice: 'El manifiesto no baja material que el montaje no abre: bajar de más es tiempo y dinero en cada montaje.',
    comprobar(ctx) {
      const abre = entradasDelGuion(ctx.guion);
      return [...destinosDelManifiesto(ctx.manifiesto)]
        .filter((d) => !abre.has(d))
        .map((d) => `Se baja «${d}» y el montaje no lo abre nunca.`);
    },
    romper: (ctx) => ({ ...ctx, manifiesto: ctx.manifiesto + 'gs://x/sobra.png\tsobra.png\n' }),
  },

  {
    nombre: 'el-manifiesto-termina-en-salto-de-linea',
    dice: 'El manifiesto termina en salto de línea: el bucle read del shell descarta la última línea sin decir nada si no lo lleva, y faltaba siempre un archivo (§7.5).',
    comprobar(ctx) {
      return ctx.manifiesto.endsWith('\n') ? [] : ['El manifiesto no termina en salto de línea.'];
    },
    romper: (ctx) => ({ ...ctx, manifiesto: ctx.manifiesto.replace(/\n$/, '') }),
  },

  {
    nombre: 'el-lector-del-manifiesto-no-depende-del-salto-final',
    dice: 'Cinturón y tirantes: el montador recoge la última línea aunque falte el salto (§7.5).',
    comprobar(ctx) {
      const sh = fuente(ctx, 'montador/montar.sh');
      const bucles = [...sh.matchAll(/while\s+.*read\s+[^\n]*\n?/g)];
      if (!bucles.length) return ['El montador no lee el manifiesto con un bucle read.'];
      const fallos = [];
      for (const b of bucles) {
        if (!/\|\|\s*\[\s*-n\s*"\$\w+"\s*\]/.test(b[0])) {
          fallos.push(`Un bucle read no lleva la salvaguarda «|| [ -n "$var" ]»: ${b[0].trim()}`);
        }
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'montador/montar.sh', (t) => t.replaceAll('|| [ -n "$origen" ]', '')),
  },

  // ── §7.4: la invariante más importante ────────────────────────────────────
  {
    nombre: 'el-montador-no-nombra-ningun-archivo-del-guion',
    dice: 'Nada que se despliegue a mano puede conocer un archivo por su nombre. El montador recibe una lista origen → destino y copia (§7.4).',
    comprobar(ctx) {
      const sh = fuente(ctx, 'montador/montar.sh');
      const fallos = [];

      // Ni un nombre de material generado. El fallo original fue exactamente este:
      // se añadió la marca del canal y el contenedor desplegado no la conocía.
      const prohibidos = [
        /\bfirma\.png\b/,
        /\bp\d{2}_t\d{3}_/,
        /\bseg_\d/,
        /\bmus_\d/,
        /\bvoz_\d/,
        /\bmarca\.png\b/,
        /_img\.png\b/,
        /_audio\.wav\b/,
        /_vid\.mp4\b/,
      ];
      for (const re of prohibidos) {
        const m = sh.match(re);
        if (m) fallos.push(`El montador nombra «${m[0]}»: eso tiene que llegarle como dato.`);
      }

      // Las tres variables, y solo esas tres.
      for (const v of ['ENCARGO', 'MATERIAL', 'SALIDA']) {
        if (!sh.includes(`\${${v}`)) fallos.push(`El montador no usa la variable ${v}.`);
      }

      // El guion de ffmpeg no puede estar escrito dentro del contenedor: si lo
      // estuviera, cambiar el montaje obligaría a redesplegarlo a mano.
      if (/\bffmpeg\s+-/.test(sh)) {
        fallos.push('El montador ejecuta ffmpeg por su cuenta en vez de correr el guion que le llega.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'montador/montar.sh', (t) =>
        t.replace('avisa "Montando."', 'gcloud storage cp "$MATERIAL/firma.png" ./firma.png'),
      ),
  },

  {
    nombre: 'el-contenedor-no-tiene-credenciales',
    dice: 'El contenedor no sabe nada de la cuenta: recibe rutas y usa la identidad del job (§2, punto 4).',
    comprobar(ctx) {
      const df = fuente(ctx, 'montador/Dockerfile');
      const sh = fuente(ctx, 'montador/montar.sh');
      const fallos = [];
      if (/GOOGLE_APPLICATION_CREDENTIALS|COPY .*\.json|service.?account/i.test(df)) {
        fallos.push('El Dockerfile mete credenciales en la imagen.');
      }
      if (/gcloud auth activate-service-account|--key-file/.test(sh)) {
        fallos.push('El montador se autentica con una clave en vez de con la identidad del job.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'montador/Dockerfile', (t) => t + '\nCOPY cuenta.json /montador/cuenta.json\n'),
  },

  // ── §7.6: un código de salida no es un mensaje de error ───────────────────
  {
    nombre: 'se-comprueba-el-material-antes-de-lanzar',
    dice: 'Antes del trabajo pesado se comprueba que está todo, y se dice qué falta POR SU NOMBRE. Un archivo de cero bytes cuenta como ausente (§7.6).',
    comprobar(ctx) {
      const fallos = [];
      const api = fuente(ctx, 'api/ia.js');
      const mont = fuente(ctx, 'api/_lib/montador.js');
      const sh = fuente(ctx, 'montador/montar.sh');

      if (!/comprobarMaterial/.test(mont)) fallos.push('La función no comprueba el material.');
      const lanzar = api.slice(api.indexOf("case 'montar.lanzar'"));
      if (!/comprobarMaterial|montar\.comprobar|previa/.test(lanzar.slice(0, 800))) {
        fallos.push('montar.lanzar arranca el contenedor sin comprobar antes.');
      }
      if (!/faltan/.test(lanzar.slice(0, 800))) {
        fallos.push('El error de material que falta no nombra lo que falta.');
      }
      // Cero bytes es ausente: `-s` en shell y `bytes > 0` en la función.
      if (!/\[\s*!\s*-s\s/.test(sh)) {
        fallos.push('El montador no trata un archivo de cero bytes como ausente.');
      }
      if (!/bytes\s*>\s*0/.test(fuente(ctx, 'api/_lib/almacen.js'))) {
        fallos.push('El almacén no trata un archivo de cero bytes como ausente.');
      }
      return fallos;
    },
    romper: (ctx) => editando(ctx, 'montador/montar.sh', (t) => t.replace(/\[ ! -s "\.\/\$destino" \]/, 'false')),
  },

  {
    nombre: 'el-trabajo-pesado-escribe-su-queja',
    dice: 'El montador escribe su queja en un sitio que la aplicación puede leer, y la aplicación lee el registro por su cuenta: el usuario no puede (§7.6).',
    comprobar(ctx) {
      const sh = fuente(ctx, 'montador/montar.sh');
      const mont = fuente(ctx, 'api/_lib/montador.js');
      const fase = fuente(ctx, 'app/fases/montaje.js');
      const fallos = [];
      if (!/QUEJA|queja/.test(sh)) fallos.push('El montador no deja constancia de por qué falló.');
      if (!/gcloud storage cp "\$QUEJA"/.test(sh)) fallos.push('La queja no se sube a ningún sitio.');
      if (!/entries:list|registro/.test(mont)) fallos.push('La función no sabe leer el registro de la nube.');
      if (!/montar\.registro/.test(fase)) fallos.push('La aplicación no pide el registro cuando el montaje falla.');
      return fallos;
    },
    romper: (ctx) => editando(ctx, 'app/fases/montaje.js', (t) => t.replaceAll('montar.registro', 'nada')),
  },

  // ── §5: cada regla viene de un defecto audible ────────────────────────────
  {
    nombre: 'cada-toma-se-codifica-una-vez',
    dice: 'Un segmento de video por toma, y ni una recodificación más: una sola generación de compresión de video en toda la pieza (§5.1, §5.2).',
    comprobar(ctx) {
      const lineas = ctx.guion.split('\n').filter((l) => l.trim().startsWith('ffmpeg'));
      const codificanVideo = lineas.filter((l) => /-c:v\s+libx264/.test(l));
      const fallos = [];

      if (codificanVideo.length !== ctx.hoja.tomas.length) {
        fallos.push(
          `Se codifican ${codificanVideo.length} segmentos de video para ${ctx.hoja.tomas.length} tomas.`,
        );
      }
      const pegado = lineas.find((l) => /-f concat/.test(l) && /lista_video/.test(l));
      if (!pegado) fallos.push('No se pegan los segmentos con el demuxer concat.');
      else if (!/-c copy/.test(pegado)) {
        fallos.push('Los segmentos se pegan RECODIFICANDO: eso es una segunda generación de compresión.');
      }
      const union = lineas[lineas.length - 1];
      if (!/-c:v copy/.test(union)) {
        fallos.push('La unión final recodifica el video en vez de copiarlo.');
      }
      return fallos;
    },
    romper: (ctx) => ({ ...ctx, guion: ctx.guion.replace('-c copy -an mudo.mp4', '-c:v libx264 mudo.mp4') }),
  },

  {
    nombre: 'la-voz-nunca-se-pega-comprimida',
    dice: 'La voz va en PCM de principio a fin. Pegar trozos de audio comprimido mete un chasquido en cada unión (§5.3, §7.7).',
    comprobar(ctx) {
      const lineas = ctx.guion.split('\n').filter((l) => l.trim().startsWith('ffmpeg'));
      const fallos = [];
      // Los pasos que ARMAN la voz, no la mezcla final —esa comprime a propósito, y
      // es la única vez que se comprime (§5.5), lo cual comprueba otra invariante.
      // Sin esta exclusión la comprobación medía el bloque equivocado y denunciaba
      // justo lo que el plano manda hacer.
      const deVoz = lineas.filter(
        (l) => /voz_\d|lista_voz|voz\.wav/.test(l) && !/audio\.m4a/.test(l),
      );
      for (const l of deVoz) {
        if (/-c:a\s+(aac|libmp3lame|libopus|libvorbis)/.test(l)) {
          fallos.push(`Un paso de voz comprime antes de tiempo: ${l.slice(0, 80)}…`);
        }
        if (!/pcm_s16le/.test(l)) fallos.push(`Un paso de voz no sale en PCM: ${l.slice(0, 80)}…`);
      }
      const concat = deVoz.find((l) => /-f concat/.test(l));
      if (concat && /-c copy/.test(concat)) {
        fallos.push('La voz se concatena por copia: si algún día llega comprimida, chasquido en cada unión.');
      }
      return fallos;
    },
    romper: (ctx) => ({
      ...ctx,
      guion: ctx.guion.replace(/-c:a pcm_s16le (voz_\d+\.wav)/, '-c:a aac $1'),
    }),
  },

  {
    nombre: 'una-sola-codificacion-de-audio-al-final',
    dice: 'Voz PCM + música PCM se mezclan y RECIÉN ENTONCES se comprime, una vez (§5.5).',
    comprobar(ctx) {
      const lineas = ctx.guion.split('\n').filter((l) => l.trim().startsWith('ffmpeg'));
      const comprimen = lineas.filter((l) => /-c:a\s+(aac|libmp3lame|libopus)/.test(l));
      const fallos = [];
      if (comprimen.length !== 1) {
        fallos.push(`El audio se comprime ${comprimen.length} veces; debe comprimirse exactamente una.`);
      }
      const ultima = lineas[lineas.length - 1];
      if (!/-c:a copy/.test(ultima)) {
        fallos.push('La unión final recodifica el audio: sería una segunda compresión.');
      }
      return fallos;
    },
    romper: (ctx) => ({
      ...ctx,
      guion: ctx.guion.replace('-c:a pcm_s16le musica.wav', '-c:a aac musica.wav'),
    }),
  },

  {
    nombre: 'la-musica-cede-paso-por-compresion-lateral',
    dice: 'La voz abre el paso a la música por compresión lateral, no por un volumen fijo (§5.6).',
    comprobar(ctx) {
      return /sidechaincompress=/.test(ctx.guion)
        ? []
        : ['La música no cede paso por compresión lateral.'];
    },
    romper: (ctx) => ({ ...ctx, guion: ctx.guion.replace(/sidechaincompress=[^[\]]*/, 'volume=0.3') }),
  },

  {
    nombre: 'los-fundidos-de-musica-son-largos',
    dice: 'Entre piezas de música, fundidos de 1,5 a 3,5 s. Con fundidos cortos el relevo se oye como un tajo (§5.4).',
    comprobar(ctx) {
      const fallos = [];
      for (const m of ctx.guion.matchAll(/acrossfade=d=([\d.]+)/g)) {
        const d = Number(m[1]);
        if (d < 1.5 || d > 3.5) fallos.push(`Fundido de música de ${d} s: fuera del rango 1,5–3,5.`);
      }
      return fallos;
    },
    romper: (ctx) => ({ ...ctx, guion: ctx.guion.replace(/acrossfade=d=[\d.]+/g, 'acrossfade=d=0.3') }),
  },

  {
    nombre: 'la-marca-se-incrusta-dentro-de-cada-toma',
    dice: 'La marca del canal va DENTRO de la codificación de cada toma. Al final, sobre la pieza montada, obligaría a recodificarla entera (§5.7).',
    comprobar(ctx) {
      if (!ctx.hoja.firma) return [];
      const lineas = ctx.guion.split('\n').filter((l) => l.trim().startsWith('ffmpeg'));
      const conMarca = lineas.filter((l) => /overlay=/.test(l));
      const fallos = [];
      if (conMarca.length !== ctx.hoja.tomas.length) {
        fallos.push(`La marca se incrusta en ${conMarca.length} de ${ctx.hoja.tomas.length} tomas.`);
      }
      const ultima = lineas[lineas.length - 1];
      if (/overlay=/.test(ultima)) {
        fallos.push('La marca se pone sobre la pieza ya montada: recodifica todo el material.');
      }
      return fallos;
    },
    romper: (ctx) => ({
      ...ctx,
      guion: ctx.guion.replace(/\[v\]\[marca\]overlay=[^']*/g, '[v]null'),
    }),
  },

  {
    nombre: 'la-marca-la-dibuja-el-montaje-y-no-bloquea-nada',
    dice: 'En pantalla, con las 83 tomas, 62 imágenes, 35 clips y 4 músicas pagadas: «Faltan 1 materiales. No se lanza el montaje. Falta: p2925/firma». La hoja EXIGE la firma cuando la marca está activa, pero la subía solo un botón suelto de Ajustes —y con el id del PROYECTO, que únicamente coincide con la primera pieza—. Un PNG que dibuja el navegador gratis paraba el montaje entero.',
    comprobar(ctx) {
      const mon = fuente(ctx, 'app/fases/montaje.js');
      const fallos = [];

      // La revisión —por la que pasa también Montar— tiene que asegurarla ella.
      if (!/subirMarca/.test(mon)) {
        fallos.push('El montaje no sube la marca: sigue dependiendo de que alguien se acuerde.');
      }
      // Y con el id de LA PIEZA, que es el que la hoja pone en la clave.
      if (!/subirMarca\(\{ pieza: pieza\.id/.test(mon)) {
        fallos.push('La marca se sube con otro id que el de la pieza: la clave no coincidiría con la hoja.');
      }
      // ANTES de preguntar qué falta: después, seguiría faltando.
      const iSube = mon.indexOf('subirMarca(');
      const iPregunta = mon.indexOf("llamar('montar.comprobar'");
      if (iSube < 0 || iPregunta < 0 || iSube > iPregunta) {
        fallos.push('La marca se sube después de comprobar: el montaje se pararía igual.');
      }
      // Solo cuando la hoja la pide: subir una marca que el montaje no va a usar
      // es un archivo huérfano en el almacén.
      if (!/if \(hoja\.firma\) await subirMarca/.test(mon)) {
        fallos.push('La marca se sube aunque la hoja no la pida.');
      }
      return fallos;
    },
    // Se rompe como estaba: la marca la sube otro, y el montaje solo se queja.
    romper: (ctx) =>
      editando(ctx, 'app/fases/montaje.js', (t) =>
        t.replace('if (hoja.firma) await subirMarca(', 'if (false) await subirMarca('),
      ),
  },

  {
    nombre: 'lo-que-se-baja-es-el-paquete-de-publicar',
    dice: '«Estamos descargando solamente el MP4. Debería descargar un ZIP donde venga ya el video, un archivo de texto con la descripción que va al publicarlo más los hashtags, toda la música continua sola, y aparte toda la voz en un solo audio.» Las dos pistas sueltas ya las fabrica el montaje para poder mezclarlas y las tiraba al terminar; el texto ya lo escribe la fase de metadatos y había que recomponerlo a mano en el teléfono.',
    comprobar(ctx) {
      const { armarZip, crc32, cabeEnZip, guionEntrega, construirHoja, textoDePublicacion } = ctx.fn;
      const fallos = [];

      // 1 · EL ZIP SE ARMA DE VERDAD Y SE ABRE. Un ZIP mal contado no da error:
      // da un archivo que el teléfono no abre después de bajar un giga.
      const enc = new TextEncoder();
      const texto = enc.encode('TÍTULO\nEl caso\n\nHASHTAGS\n#misterio #truecrime');
      const trozos = [];
      let crc = 0;
      let bytes = 0;
      for (let k = 0; k < 4; k++) {
        const t = new Uint8Array(5000).fill(k + 1);
        trozos.push(t);
        crc = crc32(t, crc);
        bytes += t.length;
      }
      const piezas = armarZip([
        { nombre: 'doc.mp4', partes: trozos, bytes, crc },
        { nombre: 'doc · publicar.txt', partes: [texto], bytes: texto.length, crc: crc32(texto) },
      ]);
      const zip = new Uint8Array(piezas.reduce((n, p) => n + p.length, 0));
      let pos = 0;
      for (const p of piezas) {
        zip.set(p, pos);
        pos += p.length;
      }
      const leer32 = (o) => zip[o] | (zip[o + 1] << 8) | (zip[o + 2] << 16) | (zip[o + 3] << 24);
      // La firma del final del índice, y que el índice esté donde dice estar.
      const fin = zip.length - 22;
      if (leer32(fin) >>> 0 !== 0x06054b50) fallos.push('El ZIP no termina con su índice: no se abre.');
      const cuantos = zip[fin + 8] | (zip[fin + 10] << 8);
      if (zip[fin + 8] !== 2) fallos.push(`El índice del ZIP declara ${cuantos} archivos y hay 2.`);
      const inicioIndice = leer32(fin + 16) >>> 0;
      if ((leer32(inicioIndice) >>> 0) !== 0x02014b50) {
        fallos.push('El índice del ZIP no está donde el final dice que está.');
      }
      // Y el CRC del archivo grande tiene que ser el acumulado por trozos: si se
      // calculara al final habría que releer más de un giga en el teléfono.
      const entero = new Uint8Array(bytes);
      trozos.reduce((o, t) => (entero.set(t, o), o + t.length), 0);
      if (crc32(entero) !== crc) fallos.push('El CRC acumulado por trozos no coincide con el del archivo entero.');
      // Por encima de cuatro gigas se avisa en vez de entregar un ZIP roto.
      if (cabeEnZip([{ nombre: 'x', bytes: 5e9 }])) fallos.push('Un archivo de cinco gigas se da por bueno en un ZIP clásico.');

      // 2 · Las pistas sueltas salen de lo que el montaje YA fabricó, y en su
      // propio guion: metidas en el de montaje, la cuenta de codificaciones
      // pasaba de una a tres y esa comprobación dejaba de significar nada.
      const hoja = construirHoja({
        pieza: 'p01',
        tomas: [{ i: 0, escena: 0, segundos: 5, medida: true, audio: 'ok', plano: { encuadre: 'x', movimientoCamara: 'fijo', lugar: 'y', luz: 'z', sujetos: [], descripcion: 'd' } }],
        escenas: [{ n: 0, musica: 'p01/mus/000' }],
      });
      const entrega = guionEntrega(hoja);
      if (!/-i voz\.wav/.test(entrega) || !/voz\.m4a/.test(entrega)) fallos.push('La entrega no saca la voz suelta.');
      if (!/-i musica\.wav/.test(entrega) || !/musica\.m4a/.test(entrega)) fallos.push('La entrega no saca la música suelta.');
      if (/salida\.mp4|-c:v/.test(entrega)) fallos.push('El guion de entrega toca el video: eso es una segunda generación.');
      // Una pieza sin música no pide un lecho que no existe.
      const sinMus = construirHoja({
        pieza: 'p01',
        tomas: [{ i: 0, escena: 0, segundos: 5, medida: true, audio: 'ok', plano: { encuadre: 'x', movimientoCamara: 'fijo', lugar: 'y', luz: 'z', sujetos: [], descripcion: 'd' } }],
        escenas: [{ n: 0, musica: null }],
      });
      if (/musica\.m4a/.test(guionEntrega(sinMus))) fallos.push('Sin música se pide igualmente el lecho suelto.');

      // 3 · Y el contenedor sube por LISTA, sin conocer un solo nombre (§7.4).
      const sh = fuente(ctx, 'montador/montar.sh');
      if (!/salidas\.tsv/.test(sh)) fallos.push('El contenedor no tiene lista de subidas: habría que nombrarle los archivos.');
      if (/SALIDA_VOZ|SALIDA_LECHO|voz\.m4a|musica\.m4a/.test(sh)) {
        fallos.push('El contenedor nombra las pistas sueltas: se despliega a mano y siempre irá por detrás (§7.4).');
      }
      const mon = fuente(ctx, 'api/_lib/montador.js');
      if (!/salidas:/.test(mon)) fallos.push('El encargo no lleva la lista de subidas.');

      // 4 · El texto de publicar lleva los hashtags hechos, no las etiquetas
      // crudas: publicar desde el teléfono es copiar y pegar.
      const t = textoDePublicacion(
        { titulos: ['Uno'], descripcion: 'Va de esto.', etiquetas: ['crimen sin resolver', 'misterio médico'] },
        'x',
      );
      if (!/#crimensinresolver/.test(t)) fallos.push('Las etiquetas no salen como hashtag: sin espacios ni tildes.');
      if (!/#misteriomedico/.test(t)) fallos.push('Un hashtag conserva la tilde: no funciona así.');
      if (!/DESCRIPCIÓN/.test(t) || !/Va de esto\./.test(t)) fallos.push('El texto no lleva la descripción.');

      // 5 · Y la pantalla baja el paquete, no el MP4 pelado.
      if (!/bajarPaquete/.test(fuente(ctx, 'app/main.js'))) {
        fallos.push('El botón sigue bajando solo el video.');
      }
      return fallos;
    },
    // Se rompe como estaba: solo el MP4.
    romper: (ctx) =>
      conFuncion(ctx, 'guionEntrega', () => '#!/bin/sh\n'),
  },

  {
    nombre: 'las-tomas-se-igualan-al-mismo-tono',
    dice: '«Parece hasta diferentes voces.» Las voces que interpretan cada llamada por su cuenta salen con un tono distinto en cada una: con veinte llamadas para 83 tomas, el documental cambia de narrador veinte veces. Ni la temperatura a cero ni los bloques largos lo arreglan —solo lo espacian—. Se mide el tono de cada toma y se llevan TODAS al mismo, con el mismo par asetrate/atempo que la gravedad: sin mover el reloj.',
    comprobar(ctx) {
      const { construirHoja, guionFfmpeg, correccionDeTono, sanear, MEDIDOR_DE_TONO } = ctx.fn;
      const fallos = [];
      const plano = { encuadre: 'plano medio', movimientoCamara: 'fijo', lugar: 'x', luz: 'y', sujetos: [], descripcion: 'd' };
      const toma = (i, hz) => ({ i, escena: 0, segundos: 4, medida: true, plano, audio: 'ok', corteExacto: true, hz });

      // 1 · La corrección lleva cada toma a la referencia, y en la dirección buena.
      // Una toma grave respecto a la referencia hay que SUBIRLA (positivo).
      if (!(correccionDeTono(100, 112) > 0)) fallos.push('Una toma más grave que la referencia no se sube: la corrección va al revés.');
      if (!(correccionDeTono(125, 112) < 0)) fallos.push('Una toma más aguda que la referencia no se baja.');
      if (Math.abs(correccionDeTono(110, 110)) > 0.001) fallos.push('Una toma que ya está en la referencia se toca igualmente.');
      // Un error de octava —el clásico de la autocorrelación— no se «corrige»:
      // eso convertiría la toma en otra voz en vez de igualarla.
      if (correccionDeTono(55, 110) !== 0) fallos.push('Un error de octava se corrige como si fuera desafinación: haría otra voz.');
      if (Math.abs(correccionDeTono(90, 118)) > 4.001) fallos.push('La corrección no tiene tope.');
      if (correccionDeTono(0, 110) !== 0 || correccionDeTono(110, 0) !== 0) {
        fallos.push('Sin medida se inventa una corrección.');
      }

      // 2 · La referencia de la pieza es la MEDIANA de lo medido.
      const hoja = construirHoja({
        pieza: 'p01',
        tomas: [toma(0, 100), toma(1, 110), toma(2, 120)],
        escenas: [{ n: 0 }],
      });
      const ajustes = hoja.tomas.map((t) => t.ajusteTono);
      if (Math.abs(ajustes[1]) > 0.001) fallos.push('La toma que está en la mediana se desafina.');
      if (!(ajustes[0] > 0) || !(ajustes[2] < 0)) fallos.push('Las tomas no convergen hacia la referencia.');
      // Y una medida absurda se queda fuera en vez de arrastrar a las demás, que
      // es lo que haría una media.
      const conRara = construirHoja({
        pieza: 'p01',
        tomas: [toma(0, 100), toma(1, 110), toma(2, 120), toma(3, 700)],
        escenas: [{ n: 0 }],
      });
      if (conRara.tomas[3].ajusteTono !== 0) fallos.push('Una medida absurda se «corrige» en vez de dejarse fuera.');
      if (Math.abs(conRara.tomas[0].ajusteTono - ajustes[0]) > 1) {
        fallos.push('Una medida absurda mueve la referencia de las demás: la mediana no está haciendo su trabajo.');
      }

      // 3 · Y llega al guion como una cadena POR TOMA, sumada a la gravedad.
      const g = guionFfmpeg(
        construirHoja({
          pieza: 'p01',
          tomas: [toma(0, 100), toma(1, 110), toma(2, 120)],
          escenas: [{ n: 0 }],
          config: { gravedadVoz: -2, muestreo: 48000 },
        }),
      );
      const pares = [...g.matchAll(/asetrate=(\d+),aresample=(\d+),atempo=([\d.]+)/g)];
      if (pares.length !== 3) {
        fallos.push(`Salen ${pares.length} cadenas de tono para 3 tomas: no se iguala toma a toma.`);
      }
      const factores = pares.map((m) => Number(m[1]) / Number(m[2]));
      if (new Set(factores.map((f) => f.toFixed(4))).size < 3) {
        fallos.push('Las tres tomas salen con el mismo tono: la corrección por toma no llega al guion.');
      }
      // Y CADA PAR SIGUE SIENDO RECÍPROCO: igualar el tono no puede mover el reloj.
      for (const m of pares) {
        const producto = (Number(m[1]) / Number(m[2])) * Number(m[3]);
        if (Math.abs(producto - 1) > 0.001) {
          fallos.push(`Una toma igualada cambia de duración (producto ${producto.toFixed(4)}): el documental se correría.`);
        }
      }

      // 4 · Se mide donde hay muestras, se guarda, y la previa lo aplica.
      const nar = fuente(ctx, 'app/fases/narracion.js');
      const pre = fuente(ctx, 'app/previa.js');
      if (!/tonoDeVoz/.test(nar)) fallos.push('La narración no mide el tono: el material nuevo no se podría igualar.');
      if (!/tonoDeVoz/.test(pre)) fallos.push('Preparar no mide el tono: el material YA pagado nunca se igualaría.');
      // Y se mide SIEMPRE al preparar. Guardarse de volver a medir conservaría
      // para siempre las medidas del medidor viejo, que se iba de octava.
      if (/!\(Number\(dueña\.hz\) > 0\)/.test(pre)) {
        fallos.push('Preparar solo mide si falta: una medida vieja y mala se quedaría para siempre.');
      }
      // Y se puede APAGAR sin volver a preparar: un igualador que se equivoca
      // suena peor que ninguno, y probarlo no puede costar bajar 83 audios.
      if (!/igualarTono/.test(pre) || !/id="igualar-tono"/.test(fuente(ctx, 'index.html'))) {
        fallos.push('El igualador no se puede apagar: si se equivoca, no hay salida.');
      }
      const hojaApagada = construirHoja({
        pieza: 'p01',
        tomas: [toma(0, 100), toma(1, 110), toma(2, 120)],
        escenas: [{ n: 0 }],
        config: { igualarTono: false },
      });
      if (hojaApagada.tomas.some((t) => t.ajusteTono !== 0)) {
        fallos.push('Apagar el igualador no lo apaga.');
      }
      if (!/gravedad \+ \(Number\(t\.ajusteTono\) \|\| 0\)/.test(pre)) {
        fallos.push('La previa no suma el ajuste de tono: se elegiría oyendo algo distinto de lo que se exporta.');
      }
      // Y sobrevive a la recarga: medirlo exige bajar los 83 audios otra vez.
      const p = sanear({ id: 'p01', piezas: [{ id: 'p01', tomas: [{ i: 0, hz: 123.45, hzV: MEDIDOR_DE_TONO }] }] });
      if (p.piezas[0].tomas[0].hz !== 123.45) fallos.push('El tono medido se pierde al recargar: habría que volver a medirlo.');
      // PERO SOLO SI VIENE SELLADO POR EL MEDIDOR DE AHORA. El medidor v1 se iba
      // de octava, así que media pieza tiene los valores a la mitad; aplicarlos
      // hunde unas tomas y deja otras, y mirando el número no se distingue. Una
      // medida de vintage desconocido se tira: sin tono no se iguala, que es lo
      // peor que puede pasar, en vez de igualar al revés.
      const viejo = sanear({ id: 'p01', piezas: [{ id: 'p01', tomas: [{ i: 0, hz: 82.5 }] }] });
      if (viejo.piezas[0].tomas[0].hz !== 0) {
        fallos.push('Una medida sin sellar se da por buena: si la hizo el medidor viejo, desafina media pieza.');
      }
      return fallos;
    },
    // Se rompe como estaba: un solo tono para toda la pieza, el que eligió el
    // usuario, sin igualar nada.
    romper: (ctx) =>
      conFuncion(ctx, 'construirHoja', (a) => {
        const h = ctx.fn.construirHoja(a);
        return { ...h, tomas: h.tomas.map((t) => ({ ...t, ajusteTono: 0 })) };
      }),
  },

  {
    nombre: 'el-volumen-de-la-musica-se-elige-y-se-exporta',
    dice: '«La música ni se escucha, apenas se medio escucha a lo lejos.» El nivel estaba escrito a mano —0,55— en el guion de ffmpeg Y otra vez en la previa, y `config.musica.volumen` existía en el modelo sin que lo leyera NADIE: un ajuste muerto. Y el agachado era de más de veinte decibelios con un umbral que salta con una respiración, así que subir el nivel tampoco habría servido.',
    async comprobar(ctx) {
      const { construirHoja, guionFfmpeg, normalizar } = ctx.fn;
      const fallos = [];
      const plano = { encuadre: 'plano medio', movimientoCamara: 'fijo', lugar: 'x', luz: 'y', sujetos: [], descripcion: 'd' };
      const tomas = [{ i: 0, escena: 0, segundos: 6, medida: true, plano, audio: 'ok', corteExacto: true }];
      const conMusica = (v) =>
        guionFfmpeg(
          construirHoja({
            pieza: 'p01',
            tomas,
            escenas: [{ n: 0, musica: 'p01/mus/000' }],
            config: v === undefined ? {} : { volumenMusica: v },
          }),
        );

      // 1 · El nivel elegido llega al guion, tal cual.
      for (const v of [0.2, 0.8]) {
        if (!new RegExp(`volume=${v}\\[m\\]`).test(conMusica(v))) {
          fallos.push(`Con la música al ${v} el guion no la pone a ese nivel: el mando no haría nada.`);
        }
      }
      // Y no queda ningún nivel clavado en el código.
      const hoj = fuente(ctx, 'comun/hoja.mjs');
      if (/volume=0\.55/.test(hoj)) fallos.push('El nivel de música sigue escrito a mano en el guion de ffmpeg.');
      const pre = fuente(ctx, 'app/previa.js');
      if (/nivelBase = 0\.55/.test(pre)) fallos.push('La previa sigue con el nivel escrito a mano: sonaría distinto al video.');
      if (!/ajustes\?\.volumenMusica/.test(pre)) fallos.push('La previa no lee el nivel de la hoja: se elegiría sin oírlo.');
      // Y la hoja lo lleva dentro, que es lo que la previa y el montaje comparten.
      const hoja = construirHoja({ pieza: 'p01', tomas, escenas: [{ n: 0 }], config: { volumenMusica: 0.42 } });
      if (hoja.ajustes.volumenMusica !== 0.42) fallos.push('La hoja no lleva el nivel de música: previa y montaje podrían discrepar.');

      // 2 · Y las dos puntas del cable: el ajuste del proyecto y la pantalla.
      if (normalizar({ musica: { volumen: 9 } }).musica.volumen !== 1) {
        fallos.push('El nivel de música no tiene tope: un valor loco saturaría la mezcla.');
      }
      const main = fuente(ctx, 'app/main.js');
      if (!/P\.config\.musica\.volumen = Number\(\$\('musica-volumen'\)\.value\) \/ 100/.test(main)) {
        fallos.push('El deslizador de volumen no guarda: se mueve y no pasa nada.');
      }
      if (!/preparada\.hoja\.ajustes\.volumenMusica = P\.config\.musica\.volumen/.test(main)) {
        fallos.push('Cambiar el volumen exige volver a preparar para oírlo: el mando parecería roto.');
      }
      const mon = fuente(ctx, 'app/fases/montaje.js');
      if (!/volumenMusica: config\.musica\.volumen/.test(mon)) {
        fallos.push('El montaje no manda el nivel elegido: se exportaría con otro que el de la previa.');
      }

      // 3 · El agachado deja la música VIVA. Con ratio 12 sobre un umbral de 0,03
      // eran más de veinte decibelios, y saltaba con una respiración.
      const g = conMusica(0.55);
      const ratio = Number(/sidechaincompress=[^']*?ratio=([\d.]+)/.exec(g)?.[1]);
      const umbral = Number(/sidechaincompress=threshold=([\d.]+)/.exec(g)?.[1]);
      if (!(ratio > 1 && ratio <= 4)) fallos.push(`El agachado va a ratio ${ratio}: entierra la música en vez de dejarle sitio.`);
      if (!(umbral >= 0.05)) fallos.push(`El agachado salta a ${umbral} de umbral: cualquier respiración lo dispara.`);
      // 4 · Y hay techo. Voz al 0,9 más música agachada pasa de uno; sumar dos
      // pistas sin limitador es distorsión, y ahora el nivel lo pone el usuario.
      if (!/alimiter=/.test(g)) fallos.push('La mezcla no lleva limitador: con la música alta, distorsiona.');
      if (!/-map '\[techo\]'|-map \[techo\]/.test(g)) fallos.push('El limitador está en el filtro pero no es lo que se codifica.');
      if (!/salida\.threshold\.value|createDynamicsCompressor/.test(pre)) {
        fallos.push('La previa no lleva techo: distorsionaría donde el video final no.');
      }
      return fallos;
    },
    // Se rompe como estaba: el nivel clavado, sin mirar lo que eligió el usuario.
    //
    // Y se rompe SUSTITUYENDO LA FUNCIÓN, no editando el archivo: lo que estas
    // comprobaciones ejecutan es `guionFfmpeg`, así que un sabotaje sobre el texto
    // fuente solo habría probado las comprobaciones de texto y habría dejado
    // ciegas las que miden el agachado y el techo. Eso ya pasó en este proyecto
    // —una invariante midiendo el bloque equivocado durante semanas— y aquí se
    // cazó igual: con el archivo editado, estas seguían pasando.
    romper: (ctx) =>
      conFuncion(ctx, 'guionFfmpeg', (hoja) =>
        ctx.fn.guionFfmpeg({ ...hoja, ajustes: { ...hoja.ajustes, volumenMusica: 0.55 } }),
      ),
  },

  {
    nombre: 'la-imagen-se-amplia-antes-de-recorrerla',
    dice: 'Las tomas fijas llevan recorrido de cámara, y la imagen se amplía ANTES de recorrerla para que no pixele (§4.7).',
    comprobar(ctx) {
      const fijas = ctx.hoja.tomas.filter((t) => !t.movimiento);
      const conZoom = [...ctx.guion.matchAll(/zoompan=/g)].length;
      const fallos = [];
      if (conZoom !== fijas.length) {
        fallos.push(`${conZoom} recorridos de cámara para ${fijas.length} tomas fijas.`);
      }
      for (const linea of ctx.guion.split('\n')) {
        if (!/zoompan=/.test(linea)) continue;
        const escala = linea.match(/scale=(\d+):-2,zoompan/);
        if (!escala) {
          fallos.push('Hay un zoompan que no va precedido de una ampliación: va a pixelar.');
        } else if (Number(escala[1]) <= ctx.hoja.ancho) {
          fallos.push(`La ampliación (${escala[1]}px) no supera el ancho de salida (${ctx.hoja.ancho}px).`);
        }
      }
      return fallos;
    },
    romper: (ctx) => ({ ...ctx, guion: ctx.guion.replace(/scale=\d+:-2,zoompan/g, 'zoompan') }),
  },

  {
    nombre: 'el-clip-corto-se-repite-en-vez-de-congelarse',
    dice: '«Si el audio dura doce segundos pero el video dura ocho, se congela el último fotograma y se queda tieso hasta que termina el audio. Eso se ve horrible.» Y es verdad: cuatro segundos de imagen muerta en medio de un plano que se estaba moviendo se leen como un fallo de reproducción. Los generadores de video tienen listas CERRADAS de duración, así que el clip casi nunca dura lo que dura la locución — se repite, que es lo que se eligió al verlo en la previa.',
    comprobar(ctx) {
      const conMovimiento = ctx.hoja.tomas.filter((t) => t.movimiento);
      if (!conMovimiento.length) return ['El proyecto de prueba no trae ninguna toma con clip: esto no estaría comprobando nada.'];
      const fallos = [];

      // Ni un congelado: era exactamente el defecto.
      if (/tpad=stop_mode=clone/.test(ctx.guion)) {
        fallos.push('Vuelve el congelado del último fotograma: cuatro segundos de imagen muerta.');
      }
      // El bucle va en la ENTRADA. En el filtro, `loop` guarda los fotogramas en
      // memoria: un clip de ocho segundos en 1080p son setecientos megas.
      const conBucle = [...ctx.guion.matchAll(/-stream_loop -1 -i '[^']*_vid\.mp4'/g)].length;
      if (conBucle !== conMovimiento.length) {
        fallos.push(`${conBucle} clips se repiten, para ${conMovimiento.length} con movimiento.`);
      }
      if (/\bloop=(?!1\b)/.test(ctx.guion)) {
        fallos.push('El bucle se hace con el filtro `loop`: eso guarda el clip entero en memoria.');
      }
      // Y CADA SEGMENTO SIGUE DURANDO LO QUE DICE LA HOJA: repetir sin cortar es
      // un video infinito. `-frames:v` es lo que lo para.
      for (const linea of ctx.guion.split('\n')) {
        if (!/-stream_loop -1/.test(linea) || !/_vid\.mp4/.test(linea)) continue;
        if (!/-frames:v \d+/.test(linea)) {
          fallos.push('Un clip se repite sin tope de fotogramas: el segmento no terminaría nunca.');
        }
      }

      // Y la previa lo enseña IGUAL: un mp4 dentro de un <img> no se ve, así que
      // las tomas con clip salían en blanco justo en lo que más costó.
      const html = ctx.fuentes.get('index.html') || '';
      const pre = fuente(ctx, 'app/previa.js');
      if (!/<video id="previa-clip"[^>]*\bloop\b/.test(html)) {
        fallos.push('El visor de la previa no tiene video en bucle: los clips no se ven.');
      }
      if (!/t\.movimiento && clip/.test(pre)) {
        fallos.push('La previa no manda las tomas con clip al visor de video.');
      }
      return fallos;
    },
    // Se rompe volviendo al congelado.
    romper: (ctx) => ({
      ...ctx,
      guion: ctx.guion
        .replace(/-stream_loop -1 -i ('[^']*_vid\.mp4')/g, '-i $1')
        .replace(/(crop=\d+:\d+,fps=\d+),setsar=1/g, '$1,tpad=stop_mode=clone:stop_duration=9,setsar=1'),
    }),
  },
];
