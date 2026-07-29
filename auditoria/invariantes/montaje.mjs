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
    nombre: 'el-clip-corto-se-alarga-congelando-el-ultimo-fotograma',
    dice: 'Los generadores de video tienen listas cerradas de duración: lo que falte se cubre congelando el último fotograma (§6).',
    comprobar(ctx) {
      const conMovimiento = ctx.hoja.tomas.filter((t) => t.movimiento);
      if (!conMovimiento.length) return [];
      const congelan = [...ctx.guion.matchAll(/tpad=stop_mode=clone/g)].length;
      return congelan === conMovimiento.length
        ? []
        : [`${congelan} clips congelan el último fotograma, para ${conMovimiento.length} con movimiento.`];
    },
    romper: (ctx) => ({ ...ctx, guion: ctx.guion.replace(/,tpad=stop_mode=clone[^,]*/g, '') }),
  },
];
