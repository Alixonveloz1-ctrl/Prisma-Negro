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
      //
      // Y se mira DENTRO de `revisar`, no en el archivo entero: hay más de una
      // función que pregunta qué falta, y con `indexOf` a pelo la comprobación
      // empezó a fijarse en la primera que apareciera —que no es esta—. Mismo
      // fallo de ventana de siempre; por eso se exige que la ventana exista.
      const iRevisar = mon.indexOf('export async function revisar(');
      const cuerpo = iRevisar < 0 ? '' : mon.slice(iRevisar);
      const iSube = cuerpo.indexOf('subirMarca(');
      const iPregunta = cuerpo.indexOf("llamar('montar.comprobar'");
      if (!cuerpo) {
        fallos.push('No encuentro la revisión: esta comprobación estaría mirando al vacío.');
      } else if (iSube < 0 || iPregunta < 0 || iSube > iPregunta) {
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
    nombre: 'faltar-material-y-faltar-el-almacen-no-se-dicen-igual',
    dice: 'En pantalla: «Faltan 238 de 250 materiales», con el episodio entero generado y visible en el teléfono. Las dos cosas eran verdad: el material existía y estaba pagado, y el almacén no tenía ni uno —se había cambiado de cuenta de Google Cloud y el cubo nuevo empezaba vacío—. Una lista de claves que faltan no distingue eso de una generación a medias, y lo que hay que hacer es lo contrario en cada caso: generar, o traer lo que ya está pagado. Sin distinguirlo, la salida natural es darle otra vez a generar y pagar dos veces un episodio entero.',
    comprobar(ctx) {
      const fallos = [];
      const { loQueDiceElAlmacen } = ctx.fn;
      const pieza = { id: 'p07' };

      // Una hoja como las de verdad: lo suyo, la firma que sube la propia
      // comprobación, y material heredado que vive bajo el prefijo de otra pieza.
      const suyas = [];
      for (let i = 0; i < 20; i++) suyas.push(`p07/t${String(i).padStart(3, '0')}/audio`);
      for (let i = 0; i < 14; i++) suyas.push(`p07/t${String(i).padStart(3, '0')}/img`);
      for (let i = 0; i < 3; i++) suyas.push(`p07/mus/${String(i).padStart(3, '0')}`);
      const ajenas = ['biblioteca/t004/vid', 'biblioteca/t009/img', 'p07/firma'];
      const claves = [...suyas, ...ajenas];

      // 1 · EL ALMACÉN VACÍO. Lo heredado y la firma están, y aun así el veredicto
      //     tiene que decir que ahí abajo no hay nada — y decirlo con el número.
      const otras = ['p03/t000/img', 'p03/t001/img', 'biblioteca/t007/vid'];
      const vacio = loQueDiceElAlmacen(pieza, claves, suyas, ['p07/firma'], otras);
      if (!vacio) {
        fallos.push('Con NADA del episodio en el almacén, el montaje no dice nada: solo lista claves.');
      } else {
        if (!/NI UNO/.test(vacio)) {
          fallos.push('No dice que no hay ni un archivo: la lista de claves sola manda a generar de nuevo.');
        }
        if (!new RegExp(`\\b${suyas.length}\\b`).test(vacio)) {
          fallos.push('No dice los números: una afirmación sin número no se puede comprobar desde el teléfono.');
        }
        // Y NO puede decir «no se subió»: nada se marca en verde sin que el almacén
        // confirme el archivo. Decirlo manda a generar otra vez lo ya pagado.
        if (/no llegó a subirse|no se subió|no se generó/i.test(vacio)) {
          fallos.push('Dice que no se subió, y eso no puede saberlo: lo verde solo se pone con la confirmación del almacén.');
        }
        // Con el episodio a cero, lo único que orienta es QUÉ hay en este almacén.
        if (!/p03 \(2\)/.test(vacio) || !/biblioteca \(1\)/.test(vacio)) {
          fallos.push('No enseña qué carpetas SÍ tiene el almacén: sin eso no se distingue un cubo equivocado de un cubo vacío.');
        }
      }
      // Y un almacén vacío del todo se dice con esas palabras, no con una lista vacía.
      const nada = loQueDiceElAlmacen(pieza, claves, suyas, [], []);
      if (!/VAC[IÍ]O del todo/i.test(nada || '')) {
        fallos.push('Un almacén sin un solo archivo no se dice: es el caso que separa «el cubo es otro» de «el cubo es nuevo».');
      }

      // 2 · CON TODO EN SU SITIO, callado. Un aviso que sale siempre no se lee.
      if (loQueDiceElAlmacen(pieza, claves, ['biblioteca/t004/vid'], suyas)) {
        fallos.push('Avisa aunque no falte nada del episodio: un aviso permanente deja de leerse.');
      }

      // 3 · EL CASO QUE DE VERDAD DECIDE: están, pero con otro nombre. Un archivo
      //     que está y que el montaje no pide solo puede ser material subido con un
      //     número que ya no vale, y eso NO se arregla generando.
      const conOtroNombre = suyas.map((k) => k.replace(/\/t(\d{3})\//, (_, n) => `/t${String(+n + 40).padStart(3, '0')}/`));
      const movidas = loQueDiceElAlmacen(pieza, claves, suyas, conOtroNombre);
      if (!movidas) {
        fallos.push('Con el material subido con otros números, no dice nada.');
      } else {
        if (!/ESTÁN y el montaje no pide/.test(movidas)) {
          fallos.push('No dice que hay archivos que están y nadie pide: es lo único que distingue «se movió el nombre» de «no se generó».');
        }
        if (!/no hay que volver a generarlo/.test(movidas)) {
          fallos.push('No dice que no hay que volver a generarlo: sin eso, lo pagado se paga dos veces.');
        }
      }

      // 4 · Y NADA DE TEORÍAS. Adivinar aquí costó un episodio: el veredicto se
      //     ciñe a los números y a los nombres que ha visto.
      for (const inventado of [/cuenta de Google/i, /cambiar de cuenta/i]) {
        if (inventado.test(vacio || '') || inventado.test(movidas || '')) {
          fallos.push('El veredicto explica la causa en vez de decir lo que ve: eso es adivinar, y adivinar aquí manda a rehacer un episodio entero.');
        }
      }

      // 5 · Y EL MONTAJE TIENE QUE USARLO. Las dos salidas: el aviso que se lee
      //     antes de montar, y el error que impide montar. Con una sola, la mitad de
      //     las veces sale la lista de claves a secas.
      //
      //     Los dos trozos se recortan por sus dos extremos y se comprueba que el
      //     recorte EXISTE antes de mirar dentro: un `indexOf` que devuelve -1 deja
      //     una ventana que empieza al principio del archivo, y entonces la
      //     comprobación pasa siempre mirando lo que no es. Ese fallo ya se pagó dos
      //     veces en esta misma auditoría.
      const mon = fuente(ctx, 'app/fases/montaje.js');
      const trozo = (desde, hasta) => {
        const a = mon.indexOf(desde);
        const b = a < 0 ? -1 : mon.indexOf(hasta, a);
        return a < 0 || b < 0 ? null : mon.slice(a, b);
      };
      const avisos = trozo('avisos: [', '].filter(Boolean)');
      const impedir = trozo('if (!completo) {', 'aviso?.(');
      if (!avisos || !/\bdondeEsta\b/.test(avisos)) {
        fallos.push('La revisión no mete el veredicto en los avisos: en pantalla no saldría.');
      }
      if (!impedir || !/\bdondeEsta\b/.test(impedir)) {
        fallos.push('El error que impide montar no lleva el veredicto: quien le dé a Montar solo verá la lista de claves.');
      }

      // 6 · Y EN PANTALLA, ANTES DE LA LISTA. Doscientas treinta y ocho claves
      //     delante del aviso lo dejan fuera de la pantalla de un teléfono, y en la
      //     caja de otro paso ni siquiera se busca ahí.
      //
      //     El corte se ancla en la ACCIÓN, no en el nombre del botón: «b-revisar»
      //     aparece antes en un `bloquear(…)`, y una ventana que empieza ahí y acaba
      //     en el siguiente «b-montar» —otro `bloquear`— no contiene ni una línea de
      //     lo que se quiere comprobar. Es el mismo fallo de ventana que ya se pagó
      //     dos veces: por eso se comprueba también que el corte existe.
      const pan = fuente(ctx, 'app/main.js');
      const a = pan.indexOf("'b-revisar',\n  async ()");
      // Hasta el botón SIGUIENTE, no hasta el de montar: entre medias hay más
      // código, y una ventana de más se lleva por delante lo que comprueba esto.
      const b = a < 0 ? -1 : pan.indexOf("'b-buscar-material',", a);
      const revisar = a < 0 || b < 0 ? '' : pan.slice(a, b);
      const iAvisos = revisar.indexOf('r.avisos');
      const iFaltan = revisar.indexOf('r.faltan.length > 20');
      if (!revisar) {
        fallos.push('No encuentro el botón de revisar en la pantalla: esta comprobación estaría mirando al vacío.');
      } else if (iAvisos < 0 || iFaltan < 0 || iAvisos > iFaltan) {
        fallos.push('La lista de lo que falta se pinta antes del aviso, o sin recortar: el aviso se queda fuera de pantalla.');
      } else if (/registro\('paso4'/.test(revisar)) {
        fallos.push('El detalle se pinta en la caja de otro paso, encima de lo que dejó la generación.');
      }
      return fallos;
    },
    // Se rompe como estaba: el montaje sabe cuántas faltan y no dice qué hay.
    romper: (ctx) => conFuncion(ctx, 'loQueDiceElAlmacen', () => null),
  },

  {
    nombre: 'el-material-que-esta-en-el-almacen-se-encuentra-y-no-se-vuelve-a-pagar',
    dice: '«No me importa el mensaje que diga la aplicación. Yo lo que necesito es solucionar.» Y tenía razón: un mensaje que explica muy bien por qué no se puede montar sigue sin montar. El material estaba en el almacén, pagado y entero, guardado bajo el id con el que se subió —y el montaje pedía el de la pieza de ahora. Desde la pantalla no había ninguna salida que no fuera volver a generarlo todo. Ahora se busca cada archivo que falta por su cola —`t017/img`, `mus/003`—, se elige LA carpeta que más cubra, y cada toma queda apuntada a su archivo real. Sin copiar, sin generar y sin borrar.',
    comprobar(ctx) {
      const fallos = [];
      const { apuntarAlMaterialQueHay, construirHojaDe, clavesDeLaHoja } = ctx.fn;

      const pieza = () => ({
        id: 'p2929',
        tomas: [
          { i: 0, imagen: 'ok', audio: 'ok', video: null, reusa: null },
          { i: 1, imagen: 'ok', audio: 'ok', video: 'ok', movimiento: true, reusa: null },
        ],
        escenas: [{ n: 0, musica: 'ok' }],
      });
      const faltan = [
        'p2929/t000/img', 'p2929/t000/audio',
        'p2929/t001/img', 'p2929/t001/vid', 'p2929/t001/audio',
        'p2929/mus/000',
      ];
      const almacen = [
        'p2925/t000/img', 'p2925/t000/audio',
        'p2925/t001/img', 'p2925/t001/vid', 'p2925/t001/audio',
        'p2925/mus/000',
        // Ruido: otra carpeta con UNA coincidencia, y la firma que sube la revisión.
        'biblioteca/t000/img', 'p2929/firma',
      ];

      // 1 · LOS ENCUENTRA TODOS, en la carpeta que más cubre.
      const z = pieza();
      const r = apuntarAlMaterialQueHay(z, faltan, almacen);
      if (r.encontrados !== faltan.length || r.carpeta !== 'p2925') {
        fallos.push(
          `Con el material entero en «p2925», encuentra ${r.encontrados} de ${faltan.length} ` +
            `en «${r.carpeta}»: lo que no encuentre aquí hay que pagarlo otra vez.`,
        );
      }

      // 2 · Y LO DEJA APUNTADO DONDE EL MONTAJE LO MIRA. Escribirlo en un campo
      //     que la hoja no lee sería exactamente el mismo callejón de antes.
      const claves = clavesDeLaHoja(construirHojaDe(z, ctx.config));
      const sigueFuera = claves.filter((k) => k.startsWith('p2929/') && !k.endsWith('/firma'));
      if (sigueFuera.length) {
        fallos.push(`Después de apuntarlo, la hoja sigue pidiendo: ${sigueFuera.join(', ')}.`);
      }

      // 3 · NO MEZCLA CARPETAS. Coger de cada una lo que encaje monta este episodio
      //     con trozos de otro, y eso es peor que no montar.
      const partido = pieza();
      apuntarAlMaterialQueHay(partido, faltan, [
        'p2925/t000/img', 'p2925/t000/audio', 'p2925/t001/img', 'p2925/t001/audio',
        'p0007/t001/vid', 'p0007/mus/000',
      ]);
      const apuntado = [
        partido.tomas[1].heredadoVid || '',
        String(partido.escenas[0].musica || ''),
      ].filter((k) => k.includes('/'));
      if (apuntado.some((k) => !k.startsWith('p2925/'))) {
        fallos.push(`Mezcla carpetas: apuntó a ${apuntado.join(', ')} teniendo el grueso en «p2925».`);
      }

      // 4 · Y SI NO ESTÁ, NO SE INVENTA UN SITIO.
      const vacio = pieza();
      const nada = apuntarAlMaterialQueHay(vacio, faltan, ['p2929/firma']);
      if (nada.encontrados || vacio.tomas[0].heredado) {
        fallos.push('Sin material en el almacén, apunta a algo igualmente: eso es un archivo que no existe.');
      }
      return fallos;
    },
    // Se rompe como estaba: no hay dónde buscar y la única salida es generar.
    romper: (ctx) => conFuncion(ctx, 'apuntarAlMaterialQueHay', () => ({ encontrados: 0, carpeta: '' })),
  },

  {
    nombre: 'el-numero-de-materiales-dice-de-que-son',
    dice: '«Todo el tiempo dice doscientos cincuenta. Si son ciento y algo de tomas, no entiendo.» Y no hay por qué entenderlo: un número solo no dice de qué es. Cada toma son dos archivos —su voz y su visual—, el visual se comparte entre tomas del mismo plano, y encima están la música de cada escena y la marca. Dicho por tipos, la cuenta se sigue con los dedos.',
    comprobar(ctx) {
      const fallos = [];
      const { porTipo } = ctx.fn;
      const claves = [];
      for (let i = 0; i < 133; i++) claves.push(`p07/t${String(i).padStart(3, '0')}/audio`);
      for (let i = 0; i < 68; i++) claves.push(`p07/t${String(i).padStart(3, '0')}/img`);
      for (let i = 0; i < 41; i++) claves.push(`p07/t${String(i).padStart(3, '0')}/vid`);
      for (let i = 0; i < 8; i++) claves.push(`p07/mus/${String(i).padStart(3, '0')}`);
      claves.push('p07/firma');

      const dicho = porTipo(claves);
      for (const [cuantos, que] of [[133, 'voces'], [68, 'imágenes'], [41, 'clips'], [8, 'músicas']]) {
        if (!dicho.includes(`${cuantos} ${que}`)) {
          fallos.push(`El desglose no dice «${cuantos} ${que}»: «${dicho}»`);
        }
      }
      if (!/marca/.test(dicho)) fallos.push(`El desglose se come la marca: «${dicho}»`);

      // Y la pantalla tiene que enseñarlo, en las dos frases: la de todo listo y
      // la de faltan. Un desglose que no sale a pantalla no ha explicado nada.
      const pan = fuente(ctx, 'app/main.js');
      const a = pan.indexOf("'b-revisar',\n  async ()");
      const b = a < 0 ? -1 : pan.indexOf("'b-buscar-material',", a);
      const revisar = a < 0 || b < 0 ? '' : pan.slice(a, b);
      if (!revisar) {
        fallos.push('No encuentro el botón de revisar: esta comprobación estaría mirando al vacío.');
      } else if ((revisar.match(/r\.deQueSon/g) || []).length < 2) {
        fallos.push('El desglose no sale en las dos frases —todo listo y faltan—: en una de las dos vuelve a ser un número solo.');
      }
      return fallos;
    },
    // Se rompe como estaba: el número, a secas.
    romper: (ctx) => conFuncion(ctx, 'porTipo', () => ''),
  },

  {
    nombre: 'el-tono-de-la-voz-no-se-toca',
    dice: 'La voz sale COMO LA GENERÓ EL SERVICIO. Aquí vivieron dos cosas —un mando de gravedad y un igualador de tono entre tomas— y las dos hicieron más daño que bien: el mando iba al revés y sonaba fina y acelerada; el agravador granular doblaba la voz; frenar la reproducción cortaba la última palabra; y el igualador, con el medidor yéndose de octava, dejaba «una toma grave, una normal, una grave, una normal» — hasta en el video ya descargado. Cada arreglo trajo un defecto nuevo, así que se quitó de raíz. Esta invariante existe para que no vuelva a entrar sin que alguien la borre a propósito.',
    comprobar(ctx) {
      const fallos = [];

      // 1 · Ni una cadena de tono en el guion de montaje. Es lo único que de
      // verdad decide qué sale en el archivo final.
      for (const [re, que] of [
        [/asetrate=/, 'un asetrate (cambio de tono)'],
        [/atempo=/, 'un atempo (el compañero del asetrate)'],
        [/rubberband|pitch=/, 'un cambiador de tono'],
      ]) {
        if (re.test(ctx.guion)) fallos.push(`El guion de montaje lleva ${que}: la voz tiene que salir tal cual.`);
      }
      // Y la hoja no puede volver a llevar el ajuste, ni general ni por toma.
      if ('gravedadVoz' in (ctx.hoja.ajustes || {})) fallos.push('La hoja vuelve a llevar gravedad de voz.');
      if (ctx.hoja.tomas.some((t) => 'ajusteTono' in t)) fallos.push('Las tomas vuelven a llevar ajuste de tono.');

      // 2 · Ni en el navegador. La previa tiene que sonar lo mismo que el archivo:
      // un agravador solo en la previa es peor que ninguno, porque se elige con un
      // sonido que después no sale.
      for (const ruta of ['app/previa.js', 'comun/audio.mjs', 'comun/hoja.mjs', 'app/main.js', 'app/config.js']) {
        const t = fuente(ctx, ruta);
        for (const [re, que] of [
          [/agravarMuestras|agravarBuffer/, 'el agravador'],
          [/gravedadVoz/, 'el mando de gravedad'],
          [/ajusteTono|correccionDeTono|referenciaDeTono/, 'el igualador de tono'],
          [/tonoDeVoz|periodoDeVoz/, 'el medidor de tono'],
        ]) {
          if (re.test(t)) fallos.push(`${ruta} vuelve a traer ${que}.`);
        }
      }
      // Ni el modelo de datos guarda tonos medidos: sin dato no hay tentación.
      if (/\bhzV?\b:/.test(fuente(ctx, 'app/estado.js'))) {
        fallos.push('El modelo de toma vuelve a guardar el tono medido.');
      }

      // 3 · Y LO QUE SÍ SE QUEDA, porque son los dos mandos que pidió quien monta
      // y los dos funcionan: el volumen de la música y la velocidad de la voz.
      const html = ctx.fuentes.get('index.html') || '';
      if (!/id="musica-volumen"/.test(html)) fallos.push('Se fue también el volumen de la música, que sí sirve.');
      if (!/id="velocidad"/.test(html)) fallos.push('Se fue también la velocidad de la voz, que sí sirve.');
      return fallos;
    },
    // Se rompe metiendo el asetrate otra vez, que es por donde volvería.
    romper: (ctx) => ({
      ...ctx,
      guion: ctx.guion.replace(/-af 'aresample=(\d+)/, "-af 'aresample=$1,asetrate=40363,atempo=1.19"),
    }),
  },

  {
    nombre: 'lo-que-se-baja-es-el-paquete-de-publicar',
    dice: '«Estamos descargando solamente el MP4. Debería descargar un ZIP donde venga ya el video, un archivo de texto con la descripción que va al publicarlo más los hashtags, toda la música continua sola, y aparte toda la voz en un solo audio.» Las dos pistas sueltas ya las fabrica el montaje para poder mezclarlas y las tiraba al terminar; el texto ya lo escribe la fase de metadatos y había que recomponerlo a mano en el teléfono.',
    comprobar(ctx) {
      const { armarZip, crc32, cabeEnZip, guionEntrega, construirHoja, textoDePublicacion, hashtagsDe } = ctx.fn;
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
      // crudas: publicar desde el teléfono es copiar y pegar. Y van DENTRO de la
      // descripción, que es donde YouTube los lee — no en un apartado suelto que
      // hay que pegar a mano en su sitio cada vez.
      const tags = hashtagsDe(['crimen sin resolver', 'misterio médico']);
      if (!tags.includes('#crimensinresolver')) fallos.push('Las etiquetas no salen como hashtag: sin espacios ni tildes.');
      if (!tags.includes('#misteriomedico')) fallos.push('Un hashtag conserva la tilde: no funciona así.');
      const t = textoDePublicacion(
        { titulos: ['Uno'], descripcion: `Va de esto.\n\n${tags.join(' ')}`, etiquetas: ['crimen sin resolver'] },
        'x',
      );
      if (!/#crimensinresolver/.test(t)) fallos.push('El documento no lleva los hashtags.');
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
        .replace(/(crop=\d+:\d+),(setpts)/g, '$1,tpad=stop_mode=clone:stop_duration=9,$2'),
    }),
  },

  {
    nombre: 'un-clip-corto-se-estira-en-vez-de-repetirse',
    dice: '«El director decidió que una escena tiene once segundos, pero hay que recordar que Veo solo genera videos de máximo ocho. No quiero que se repita el video, porque eso va a dañar la continuidad: lo que hay que ajustar es la velocidad, no importa que esté un poco más lento para que alcance a llenar esos once segundos.» Y tiene razón: a los ocho segundos la persona vuelve a hacer el mismo gesto y se ve que es un bucle. Un plano documental al 70 % de velocidad se lee como una decisión de montaje; un bucle se lee como un error. Y la duración del clip SE MIDE sobre el archivo, no se supone: el generador entrega lo que quiere dentro de su lista cerrada y un clip heredado de la biblioteca dura lo suyo, no lo de esta toma.',
    comprobar(ctx) {
      const g = ctx.guion;
      const conMovimiento = ctx.hoja.tomas.filter((t) => t.movimiento);
      const fallos = [];
      if (!conMovimiento.length) return ['El proyecto de prueba no trae ninguna toma con clip.'];

      // 1 · SE MIDE EL ARCHIVO. Una duración supuesta deja el segmento corto sin
      // avisar el día que el generador entregue otra cosa.
      const sondas = [...g.matchAll(/D=\$\(ffprobe [^\n]*format=duration[^\n]*\)/g)].length;
      if (sondas !== conMovimiento.length) {
        fallos.push(`${sondas} clips se miden con ffprobe, para ${conMovimiento.length} con movimiento.`);
      }

      // 2 · Y SE ESTIRA EL TIEMPO con lo medido.
      const factores = [...g.matchAll(/L=\$\(LC_ALL=C awk [^\n]*\)/g)];
      if (factores.length !== conMovimiento.length) {
        fallos.push(`${factores.length} clips calculan su factor, para ${conMovimiento.length} con movimiento.`);
      }
      for (const [linea] of factores) {
        // El factor es toma ÷ clip. Al revés sería cámara rápida.
        // Toma ÷ clip, y ahora también ÷ el número de vueltas. Al revés sería
        // cámara rápida; sin las vueltas, un plano largo pediría un estiramiento
        // que no cabe en el tope y se caía al bucle a velocidad normal.
        if (!/f\s*=\s*t\s*\/\s*\(?\s*n?\s*\*?\s*\(?d/.test(linea)) {
          fallos.push('El factor no se calcula como duración de la toma entre la del clip.');
        }
        // VUELTAS ENTERAS Y UNA SOLA VELOCIDAD.
        //
        // «No puedes alargar uno que va a ir superlento y después repetir a
        //  velocidad normal. Tendría que repetirse los tres.»
        //
        // Antes: se estiraba hasta el tope y, si no llegaba, factor 1 y a repetir a
        // velocidad normal, cortando a media vuelta. Ahora se busca el MENOR número
        // de vueltas que quepa dentro del tope: misma velocidad de principio a fin
        // y la última acaba justo en el corte.
        if (!/while \([^)]*t \/ \(n \* \(d\+0\)\) > m\)/.test(linea)) {
          fallos.push('No se buscan vueltas enteras: la última se cortaría a media y a otra velocidad.');
        }
        // Y hay un tope: más allá, cámara lenta evidente. Sin tope, un clip de dos
        // segundos en una toma de veinte saldría a un décimo de velocidad.
        const tope = Number(/-v m=([\d.]+)/.exec(linea)?.[1] || 0);
        if (!(tope >= 1.5 && tope <= 3)) {
          fallos.push(`El tope de estirado es ${tope}: por encima de tres es cámara lenta evidente y por debajo de 1,5 no cubre nada.`);
        }
        // El punto muerto: un clip que ya llega no se toca.
        if (!/f <= 1\.0\d/.test(linea)) fallos.push('Un clip que ya cubre la toma se estiraría igual.');
        break;
      }

      // 3 · `setpts` VA ANTES DE `fps`. Después, el remuestreo a fotogramas fijos ya
      // habría fijado los tiempos y estirarlos luego descuadra la duración.
      for (const linea of g.split('\n')) {
        if (!/setpts=\$\{L\}\*PTS/.test(linea)) continue;
        const a = linea.indexOf('setpts=${L}*PTS');
        const b = linea.indexOf(`fps=`, a);
        if (b < 0) fallos.push('El clip estirado no se remuestrea a fotogramas fijos: la duración quedaría a la deriva.');
        // Y el filtro tiene que ir entre comillas DOBLES o el shell no expande el
        // factor y ffmpeg se encuentra un `${L}` donde espera un número.
        if (!/-filter_complex "/.test(linea)) {
          fallos.push('El filtro del clip va entre comillas simples: el factor llegaría literal a ffmpeg.');
        }
      }

      // 4 · TOMAS SEGUIDAS CON EL MISMO MATERIAL SON UN SOLO PLANO.
      //
      // «Hay imágenes que se están reutilizando, pero continuas.» Compartir estaba
      // bien —tres tomas del mismo testimonio son la misma cara— pero el montaje
      // hacía un segmento por toma: el mismo clip arrancando de cero tres veces y
      // con tres factores distintos. Un bucle, y encima con cambios de velocidad.
      const plano = { encuadre: 'x', movimientoCamara: 'fijo', lugar: 'y', luz: 'z', sujetos: [], descripcion: 'd' };
      const seguidas = [0, 1, 2].map((i) => ({
        i, escena: 0, texto: 't', segundos: 8 + i, medida: true, plano, audio: 'ok',
        imagen: 'ok', movimiento: true, heredado: 'biblioteca/t041/img', heredadoVid: 'biblioteca/t041/vid',
      }));
      const hj = ctx.fn.construirHoja({ pieza: 'p01', tomas: seguidas, escenas: [{ n: 0 }] });
      const planos = ctx.fn.planosDeLaHoja(hj, 30);
      if (planos.length !== 1) {
        fallos.push(`Tres tomas seguidas con el mismo clip dan ${planos.length} planos: el video arranca de cero en cada una.`);
      } else {
        // Y DURA LO MISMO: fundir no puede descuadrar la pieza ni un fotograma.
        const suelto = seguidas.reduce((n, t) => n + Math.round(hj.tomas.find((x) => x.i === t.i).duracion * 30), 0);
        if (planos[0].frames !== suelto) {
          fallos.push(`El plano fundido dura ${planos[0].frames} fotogramas y las tomas sueltas ${suelto}.`);
        }
      }
      // Y lo que NO comparte material no se funde: serían dos planos distintos
      // pegados en uno.
      const distintas = seguidas.map((t, i) => ({ ...t, heredadoVid: `biblioteca/t0${41 + i}/vid` }));
      const hj2 = ctx.fn.construirHoja({ pieza: 'p01', tomas: distintas, escenas: [{ n: 0 }] });
      if (ctx.fn.planosDeLaHoja(hj2, 30).length !== 3) {
        fallos.push('Se funden tomas con material distinto: se perdería el corte entre planos.');
      }

      // 5 · Y EL BUCLE SE QUEDA de red de seguridad, para lo que no cabe en el tope.
      if (!/-stream_loop -1 -i '[^']*_vid\.mp4'/.test(g)) {
        fallos.push('Se quitó el bucle: un clip demasiado corto para estirarlo dejaría el segmento sin cubrir.');
      }
      return fallos;
    },
    // Se rompe como estaba: sin estirar, solo con el bucle.
    romper: (ctx) => ({
      ...ctx,
      guion: ctx.guion
        .replace(/^\s*D=\$\(ffprobe[^\n]*\n/gm, '')
        .replace(/^\s*L=\$\(LC_ALL=C awk[^\n]*\n/gm, '')
        .replace(/,setpts=\$\{L\}\*PTS/g, ''),
    }),
  },
];
