// Invariantes de arquitectura (§1, §2, §6, §7 del plano).
//
// No son pruebas unitarias: son AFIRMACIONES SOBRE CÓMO TIENE QUE ESTAR CONSTRUIDO
// EL SISTEMA. Cada una viene de un error que se pagó con tiempo.
//
// Cada invariante trae su `romper`: la forma de sabotear el sistema que TIENE que
// hacerla fallar. Sin eso, una comprobación que nunca ha fallado no está
// comprobando nada (§9) — en el proyecto de origen una de ellas medía el bloque de
// código equivocado durante semanas y siempre pasaba.

import { editando, conFuente, conConfig } from '../contexto.mjs';

const fuente = (ctx, ruta) => ctx.fuentes.get(ruta) || '';
const archivosDe = (ctx, prefijo) =>
  [...ctx.fuentes.entries()].filter(([r]) => r.startsWith(prefijo));

export const invariantes = [
  // ── §1: el repositorio es público ─────────────────────────────────────────
  {
    nombre: 'sin-secretos-en-el-codigo',
    dice: 'Ni un identificador de proyecto, ni un correo de cuenta de servicio, ni un nombre de almacén dentro del código.',
    comprobar(ctx) {
      const patrones = [
        [/[\w.+-]+@[\w-]+\.iam\.gserviceaccount\.com/, 'un correo de cuenta de servicio'],
        // Se exige la cabecera SEGUIDA DE MATERIAL: hablar de la cabecera no es
        // llevarla dentro, y el diagnóstico necesita nombrarla para poder decirle al
        // usuario que se dejó media clave sin pegar.
        [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\\n]*[A-Za-z0-9+/]{40,}/, 'una clave privada'],
        [/\bgs:\/\/(?!ALMACEN)[a-z0-9][-a-z0-9._]{2,}/, 'un nombre de almacén literal'],
        [/"project_id"\s*:\s*"[^"]+"/, 'un identificador de proyecto'],
      ];
      const fallos = [];
      for (const [ruta, texto] of ctx.fuentes) {
        // .env.example documenta las variables sin traer valores, y la auditoría
        // guarda a propósito cadenas con esta pinta: son los sabotajes con los que
        // se demuestra que ESTA misma comprobación funciona.
        if (ruta === '.env.example' || ruta.startsWith('auditoria/')) continue;
        for (const [re, que] of patrones) {
          const m = texto.match(re);
          if (m) fallos.push(`${ruta}: ${que} (${m[0].slice(0, 40)})`);
        }
      }
      return fallos;
    },
    // El sabotaje trae las dos formas: el correo y una clave CON cuerpo, para que
    // quede demostrado que el patrón afinado sigue cazando una clave de verdad.
    romper: (ctx) =>
      conFuente(
        ctx,
        'app/config.js',
        'const cuenta = "montador@mi-proyecto.iam.gserviceaccount.com";\n' +
          'const k = "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ";\n',
      ),
  },

  {
    nombre: 'toda-configuracion-por-entorno',
    dice: 'Toda variable que la función lee está documentada en .env.example — tanto las leídas por su nombre literal como todos los alias de la tabla de entorno.',
    comprobar(ctx) {
      const ejemplo = fuente(ctx, '.env.example');
      const usadas = new Set();

      // Las leídas con `process.env.X` a pelo.
      for (const [ruta, texto] of ctx.fuentes) {
        if (!ruta.startsWith('api/')) continue;
        for (const m of texto.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) usadas.add(m[1]);
      }
      // Y TODAS las de la tabla de alias. Un alias que la función acepta pero que no
      // está documentado es una variable que nadie sabe que puede poner —o peor, que
      // alguien pone creyendo que hace algo y no la lee nadie.
      for (const lista of Object.values(ctx.nombresEntorno || {})) {
        for (const n of lista) usadas.add(n);
      }

      return [...usadas]
        .filter((v) => !ejemplo.includes(v))
        .map((v) => `${v} se lee en la función pero no está en .env.example`);
    },
    romper: (ctx) => ({
      ...ctx,
      nombresEntorno: { ...ctx.nombresEntorno, bucket: [...ctx.nombresEntorno.bucket, 'BUCKET_SIN_DOCUMENTAR'] },
    }),
  },

  // ── §2: la única puerta y el censor ───────────────────────────────────────
  {
    nombre: 'una-sola-puerta',
    dice: 'Hay exactamente un endpoint. Toda credencial vive detrás de él.',
    comprobar(ctx) {
      const endpoints = [...ctx.fuentes.keys()].filter(
        (r) => r.startsWith('api/') && !r.includes('/_lib/'),
      );
      return endpoints.length === 1 ? [] : [`Hay ${endpoints.length} endpoints: ${endpoints.join(', ')}`];
    },
    romper: (ctx) => conFuente(ctx, 'api/otra.js', 'export default function () {}'),
  },

  {
    nombre: 'censor-en-la-primera-linea',
    dice: 'El censor se instala antes que nada en el manejador, para que no haya forma de saltárselo por olvido.',
    comprobar(ctx) {
      const t = fuente(ctx, 'api/ia.js');
      const cuerpo = t.slice(t.indexOf('export default'));
      const posCensor = cuerpo.indexOf('instalarCensor(res)');
      if (posCensor < 0) return ['api/ia.js no instala el censor.'];
      const primerJson = cuerpo.indexOf('res.json(');
      const primerStatus = cuerpo.indexOf('res.status(');
      const primerUso = Math.min(
        primerJson < 0 ? Infinity : primerJson,
        primerStatus < 0 ? Infinity : primerStatus,
      );
      return posCensor < primerUso
        ? []
        : ['api/ia.js usa la respuesta antes de instalar el censor.'];
    },
    romper: (ctx) =>
      editando(ctx, 'api/ia.js', (t) =>
        t.replace(
          '  instalarCensor(res);',
          '  if (!req.body) return res.status(400).json({});\n  instalarCensor(res);',
        ),
      ),
  },

  {
    nombre: 'el-censor-mira-el-tamano',
    dice: 'El censor detecta que la respuesta pasa de 4,5 MB y lo dice con esas palabras, en vez de dejar que parezca un tiempo agotado (§7.1).',
    comprobar(ctx) {
      const t = fuente(ctx, 'api/_lib/censor.js');
      const fallos = [];
      if (!/TOPE_RESPUESTA/.test(t)) fallos.push('El censor no conoce el tope de respuesta.');
      if (!/4,5 MB/.test(t)) fallos.push('El mensaje de exceso no nombra el tope en palabras.');
      if (!/no es un tiempo agotado|No es un tiempo agotado/i.test(t)) {
        fallos.push('El mensaje no desmiente el tiempo agotado, que es como se confunde (§7.1).');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'api/_lib/censor.js', (t) => t.replace(/No es un tiempo agotado/g, 'Fallo')),
  },

  {
    nombre: 'referencias-cifradas-no-censuradas',
    dice: 'Los identificadores de operación se CIFRAN. Censurarlos borra el identificador de proyecto que llevan dentro y la consulta siguiente falla con un error incomprensible (§6).',
    comprobar(ctx) {
      const prov = fuente(ctx, 'api/_lib/proveedor.js');
      const mont = fuente(ctx, 'api/_lib/montador.js');
      const fallos = [];
      if (!/cifrar\(datos\.name\)/.test(prov)) {
        fallos.push('El identificador de operación de video no se cifra al devolverlo.');
      }
      if (!/descifrar\(/.test(prov)) fallos.push('La consulta de video no descifra el identificador.');
      if (!/cifrar\(/.test(mont)) fallos.push('El identificador de ejecución del montaje no se cifra.');
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'api/_lib/proveedor.js', (t) =>
        t.replace('cifrar(datos.name)', 'datos.name'),
      ),
  },

  // ── §6: ninguna imagen viaja sin reducir ──────────────────────────────────
  {
    nombre: 'ninguna-imagen-viaja-sin-reducir',
    dice: 'Toda imagen que se manda pasa por el reductor. Nunca una excepción «porque este caso es especial»: esa excepción es el bug (§6).',
    // Se comprueba de forma ESTRUCTURAL —quién puede convertir una imagen en bytes—
    // y no buscando formas concretas de escribirlo mal. Una comprobación por
    // expresión regular sobre la sintaxis del payload daba falsos positivos con una
    // bandera del catálogo de modelos llamada `referencias`, y un falso positivo
    // repetido acaba en que alguien apaga la comprobación.
    comprobar(ctx) {
      const fallos = [];
      const PUERTA = 'imagenes.js';

      for (const [ruta, texto] of archivosDe(ctx, 'app/')) {
        if (ruta.endsWith(PUERTA) || ruta.endsWith('marca.js')) continue;

        // Convertir una imagen en bytes fuera del reductor es exactamente la
        // excepción «porque este caso es especial» que el plano prohíbe.
        if (/readAsDataURL|toDataURL\(|\.toBlob\(/.test(texto)) {
          fallos.push(`${ruta} convierte imágenes en bytes sin pasar por app/${PUERTA}.`);
        }

        // Quien manda imágenes al proveedor tiene que importarlas del reductor.
        const mandaImagenes = /referencias\s*[,:]|fotograma\s*[,:]/.test(texto) && /llamar\(/.test(texto);
        if (mandaImagenes && !new RegExp(`from '[^']*${PUERTA}'`).test(texto)) {
          fallos.push(`${ruta} manda imágenes al proveedor sin importar el reductor.`);
        }
      }
      return fallos;
    },
    // El sabotaje que de verdad corresponde: dejar de importar el reductor y mandar
    // los blobs tal cual. (El primer sabotaje que escribí cambiaba solo la llamada y
    // dejaba el import puesto, así que la invariante seguía pasando: la marcó
    // `--romper` como ciega.)
    romper: (ctx) =>
      editando(ctx, 'app/fases/imagen.js', (t) =>
        t
          .replace(/import \{[^}]*\} from '\.\.\/imagenes\.js';/, '')
          .replace(/await reducirReferencias\([^)]*\)/, 'blobs'),
      ),
  },

  {
    nombre: 'el-backend-rechaza-imagenes-sin-reducir',
    dice: 'Si una referencia llega grande, la función lo dice en vez de reenviarla. Es la red de seguridad de la invariante anterior.',
    comprobar(ctx) {
      const t = fuente(ctx, 'api/_lib/proveedor.js');
      const fallos = [];
      // Se exige la COMPARACIÓN, no que la constante esté mencionada: mencionarla y
      // no usarla es justo el estado en el que la comprobación no comprueba nada.
      if (!/bytes\s*>\s*TOPE_REFERENCIA_BYTES/.test(t)) {
        fallos.push('api/_lib/proveedor.js no compara el tamaño de las referencias con el tope.');
      }
      if (!/throw new Error\(\s*\n?\s*`?La imagen de referencia/.test(t)) {
        fallos.push('El exceso de tamaño no lanza: se reenviaría igual.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'api/_lib/proveedor.js', (t) =>
        t.replace(/if \(bytes > TOPE_REFERENCIA_BYTES\)/, 'if (false)'),
      ),
  },

  // ── §7.2: todos los caminos de carga normalizan ───────────────────────────
  {
    nombre: 'todos-los-caminos-de-carga-normalizan',
    dice: 'Un solo sitio llama a normalizar(), y los tres caminos de carga —nuevo, local y REMOTO— pasan por él (§7.2).',
    comprobar(ctx) {
      const est = fuente(ctx, 'app/estado.js');
      const fallos = [];

      const llamadas = [...est.matchAll(/normalizar\(/g)].length;
      if (llamadas !== 1) {
        fallos.push(`app/estado.js llama a normalizar() ${llamadas} veces; debe ser exactamente 1.`);
      }

      for (const camino of ['nuevoProyecto', 'cargarLocal', 'cargarRemoto']) {
        const i = est.indexOf(`function ${camino}`) >= 0
          ? est.indexOf(`function ${camino}`)
          : est.indexOf(camino);
        if (i < 0) {
          fallos.push(`No existe el camino de carga ${camino}.`);
          continue;
        }
        const cuerpo = est.slice(i, est.indexOf('\n}', i));
        if (!/sanear\(/.test(cuerpo)) {
          fallos.push(`El camino ${camino} no pasa por sanear() — y sanear() es quien normaliza.`);
        }
      }

      // Nadie fuera de estado.js puede normalizar por su cuenta: sería un cuarto
      // camino, que es justo lo que falló.
      for (const [ruta, texto] of archivosDe(ctx, 'app/')) {
        if (ruta === 'app/estado.js' || ruta === 'app/config.js') continue;
        if (/\bnormalizar\(/.test(texto)) {
          fallos.push(`${ruta} normaliza por su cuenta: es un cuarto camino de carga.`);
        }
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/estado.js', (t) =>
        t.replace(
          '  if (!r.existe) return null;\n  return sanear(r.proyecto);',
          '  if (!r.existe) return null;\n  return r.proyecto;',
        ),
      ),
  },

  {
    nombre: 'el-selector-devuelve-lo-que-eligio',
    dice: 'La función que repinta un control devuelve el valor con el que se quedó, para que quien la llama lo escriba en el estado (§7.3).',
    comprobar(ctx) {
      const t = fuente(ctx, 'app/config.js');
      const i = t.indexOf('export function pintarSelector');
      if (i < 0) return ['No existe la función que repinta un selector.'];
      const cuerpo = t.slice(i, t.indexOf('\n}', i));
      return /return elegido;/.test(cuerpo)
        ? []
        : ['pintarSelectorModelo no devuelve el valor elegido: vuelve el §7.3.'];
    },
    romper: (ctx) =>
      editando(ctx, 'app/config.js', (t) => t.replace('  // Quien llama DEBE escribir esto en la configuración.\n  return elegido;\n}', '}')),
  },

  {
    nombre: 'ningun-modelo-escrito-a-mano',
    dice: 'Ninguna familia de modelos se lista a mano. Una lista escrita dice lo que se creía el día que se escribió: dejó al director dos generaciones atrás y ofrecía dos generadores de imagen sin decir qué hacían ni cuánto costaban.',
    async comprobar(ctx) {
      const cfg = fuente(ctx, 'app/config.js');
      const fallos = [];

      // Ni catálogo, ni valores por defecto de modelo escritos en la configuración.
      if (/export const MODELOS\s*=/.test(cfg)) {
        fallos.push('Vuelve a haber un catálogo de modelos escrito a mano en la configuración.');
      }
      for (const m of cfg.matchAll(/modelo:\s*'([a-z][\w.-]{6,})'/gi)) {
        fallos.push(`La configuración fija el modelo «${m[1]}» a mano: envejece solo.`);
      }

      // Y el sondeo tiene que cubrir las cuatro familias que se eligen.
      const prov = fuente(ctx, 'api/_lib/proveedor.js');
      for (const f of ['texto', 'imagen', 'video', 'voz']) {
        if (!new RegExp(`\\b${f}:\\s*\\[`).test(prov)) {
          fallos.push(`El sondeo de modelos no tiene candidatos de «${f}».`);
        }
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/config.js', (t) => t.replace('imagenModelo: { modelo:', "imagenModelo: { modelo: 'gemini-2.5-flash-image'")),
  },

  {
    nombre: 'el-sondeo-de-modelos-no-genera-nada',
    dice: 'Preguntar qué modelos hay no puede costar dinero. Una imagen de prueba por candidato se pagaría cada vez que alguien abre los ajustes, y un video mucho más.',
    comprobar(ctx) {
      const prov = fuente(ctx, 'api/_lib/proveedor.js');
      const i = prov.indexOf('async function probarCandidatos');
      if (i < 0) return ['No existe el sondeo de modelos.'];
      const cuerpo = prov.slice(i, prov.indexOf('\n}', i));
      const fallos = [];

      // El cuerpo de la petición tiene que ser inválido a propósito.
      if (!/contents: \[\]|instances: \[\]/.test(cuerpo)) {
        fallos.push('El sondeo manda una petición que podría generar de verdad.');
      }
      if (/parts: \[\{ text/.test(cuerpo)) {
        fallos.push('El sondeo manda contenido real: eso genera y se paga.');
      }
      // Y tiene que distinguir «no existe» de «existe pero la petición está mal».
      if (!/404/.test(cuerpo)) {
        fallos.push('El sondeo no distingue el 404 del resto: no sabe si el modelo existe.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'api/_lib/proveedor.js', (t) =>
        t.replace(
          "const cuerpo = ruta === 'generateContent' ? { contents: [] } : { instances: [] };",
          "const cuerpo = { contents: [{ role: 'user', parts: [{ text: 'ok' }] }] };",
        ),
      ),
  },

  {
    nombre: 'ninguna-escritura-se-ignora',
    dice: 'Ningún valor de retorno de una escritura se ignora: las imágenes «se generaban» pero no estaban en ningún sitio (§7.12).',
    comprobar(ctx) {
      const fallos = [];
      const alm = fuente(ctx, 'api/_lib/almacen.js');
      if (!/return false/.test(alm) === false) {
        fallos.push('almacen.js devuelve false en vez de lanzar: alguien se olvidará de mirarlo.');
      }
      if (!/se subió con cero bytes/.test(alm)) {
        fallos.push('almacen.js no comprueba que lo subido tenga bytes (§7.6: cero bytes es ausente).');
      }
      for (const [ruta, texto] of archivosDe(ctx, 'app/fases/')) {
        if (!/guardarEn|'subir'/.test(texto)) continue;
        // Se exige que LANCE cuando el almacén no confirma. Que el texto mencione
        // `guardado.bytes` en algún sitio no prueba nada: la fase de imagen lo
        // nombraba en el valor de retorno y la comprobación pasaba con la guarda
        // borrada. Lo cazó `--romper`.
        if (!/if \(!\w+\.guardado\?\.bytes\)[\s\S]{0,200}?throw new Error/.test(texto)) {
          fallos.push(`${ruta} sube material y no lanza si el almacén no lo confirma.`);
        }
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/fases/imagen.js', (t) =>
        t.replace(/if \(!r\.guardado\?\.bytes\) \{[\s\S]*?\n  \}/, ''),
      ),
  },

  // ── §7.9 y §7.10: la voz ──────────────────────────────────────────────────
  {
    nombre: 'voces-filtradas-y-con-region-visible',
    dice: 'El catálogo de voces se filtra y la etiqueta MUESTRA la región: sin filtrar salían cien, la mayoría del idioma equivocado y con nombres idénticos a las buenas (§7.10).',
    comprobar(ctx) {
      const t = fuente(ctx, 'api/_lib/proveedor.js');
      const i = t.indexOf('export async function vocesDisponibles');
      if (i < 0) return ['No existe el catálogo de voces.'];
      // Acotado a ESTA función. Sin acotar llegaba hasta el final del archivo y
      // recogía la etiqueta del catálogo de modelos, que no es una voz.
      const resto = t.slice(i + 10);
      const fin = resto.search(/\nexport /);
      const cuerpo = fin > 0 ? resto.slice(0, fin) : resto;
      const fallos = [];
      if (!/\.filter\(/.test(cuerpo)) fallos.push('El catálogo no filtra nada.');
      // La región tiene que estar DENTRO de la etiqueta, no solo declarada en algún
      // sitio del archivo: dos voces distintas se ven idénticas en el desplegable si
      // la etiqueta es solo el nombre (§7.10).
      // §7.10: dos voces distintas no pueden verse idénticas en el desplegable. Lo
      // que hace falta es que CADA etiqueta lleve algo que la distinga además del
      // nombre —la región en las de Cloud, la familia en las de Gemini, que no
      // tienen región porque hablan el idioma del texto—. Antes esto exigía la
      // región en todas y saltaba en falso al añadir la segunda familia.
      const etiquetas = [...cuerpo.matchAll(/etiqueta:/g)].map((m) =>
        cuerpo.slice(m.index, m.index + 170),
      );
      if (!etiquetas.length) fallos.push('No se encontró ninguna etiqueta de voz.');
      for (const e of etiquetas) {
        if (!/REGIONES\w*\[|Gemini/.test(e)) {
          fallos.push(`Una etiqueta de voz no lleva nada que la distinga: ${e.split('\n')[0].slice(0, 50)}`);
        }
      }
      // El canal narra en español LATINO. Una voz peninsular en medio de una
      // narración latina se oye como otro narrador, igual que el §7.9 con los
      // modelos expresivos.
      if (/'es-ES'/.test(cuerpo)) {
        fallos.push('El catálogo de voces deja pasar España: el canal narra en latino.');
      }
      if (!/REGIONES_LATINAS/.test(t)) {
        fallos.push('No hay una lista explícita de las regiones que valen.');
      }
      // §7.9: las de entrega variable pueden ofrecerse, pero NUNCA por defecto. La
      // decisión es de quien narra; el valor por defecto es el que no arruina una
      // narración de quince minutos.
      if (!/expresivas\s*=\s*false/.test(t)) {
        fallos.push('Las voces expresivas no vienen apagadas por defecto (§7.9).');
      }
      if (!/expresiva/.test(cuerpo)) {
        fallos.push('Una voz expresiva no viaja marcada: no se puede avisar en pantalla.');
      }
      // El canal narra con voz masculina. El filtro va en el catálogo, no en la
      // pantalla: filtrar al pintar deja voces descartadas seleccionables por un
      // descuido, y la que manda es la que está guardada en la configuración.
      if (!/genero\s*=\s*'MALE'/.test(t)) {
        fallos.push('El catálogo de voces no filtra por género masculino por defecto.');
      }
      if (!/ssmlGender === genero/.test(cuerpo)) {
        fallos.push('El filtro de género no se aplica a las voces de Cloud TTS.');
      }
      // Y las de Gemini tienen que traer su género: la API no lo devuelve para
      // ellas, así que si la tabla no lo lleva, el filtro no las toca.
      if (!/'MALE'\]/.test(t) || !/'FEMALE'\]/.test(t)) {
        fallos.push('La tabla de voces de Gemini no declara el género de cada voz.');
      }
      return fallos;
    },
    // El sabotaje quita la región de la etiqueta, que es justo lo que esta
    // invariante guarda. El de antes buscaba una plantilla en una sola línea y dejó
    // de encajar al reformatear: lo marcó `--romper` como ciega.
    romper: (ctx) =>
      editando(ctx, 'api/_lib/proveedor.js', (t) =>
        t.replace(/\$\{REGIONES_LATINAS\[reg\]\}/g, ''),
      ),
  },

  {
    nombre: 'voz-consistente-por-defecto',
    dice: 'Para narración larga se elige consistencia sobre expresividad: los modelos expresivos cambian de tono cada cuarenta y cinco segundos (§7.9).',
    comprobar(ctx) {
      const v = ctx.config.narracion.nombreVoz;
      return /chirp|studio|journey/i.test(v)
        ? [`La voz por defecto (${v}) es de las expresivas: cambiará de tono entre llamadas.`]
        : [];
    },
    romper: (ctx) => conConfig(ctx, (c) => (c.narracion.nombreVoz = 'es-US-Chirp3-HD-Aoede')),
  },

  {
    nombre: 'dedal-de-silencio-en-la-narracion',
    dice: 'Hay un silencio de unos 120 ms delante de la primera toma de cada llamada, o el reproductor se come el ataque del primer fonema (§7.8).',
    comprobar(ctx) {
      const ms = ctx.config.narracion.silencioInicialMs;
      const fallos = [];
      if (!(ms >= 60 && ms <= 250)) fallos.push(`El dedal de silencio es de ${ms} ms; debería rondar los 120.`);
      if (!/silencioInicialMs/.test(fuente(ctx, 'comun/audio.mjs'))) {
        fallos.push('El repartidor de audio no aplica el dedal de silencio.');
      }
      if (!/silencioInicialMs/.test(fuente(ctx, 'app/fases/narracion.js'))) {
        fallos.push('La fase de narración no pasa el dedal de silencio.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'comun/audio.mjs', (t) => t.replaceAll('silencioInicialMs', 'silencioNoUsado')),
  },

  {
    nombre: 'bloques-de-narracion-que-caben-en-la-respuesta',
    dice: 'Un bloque de narración cabe en los 4,5 MB de la respuesta. Con bloques de escena entera no cabe, y el error dice «tiempo agotado», que es mentira (§7.1, §4.5).',
    comprobar(ctx) {
      const s = ctx.config.narracion.segundosPorBloque;
      // PCM 16 bits, 24 kHz, mono → 48.000 bytes/s. En base64 crece un tercio.
      const bytes = s * 24000 * 2 * (4 / 3);
      const tope = 4.5 * 1024 * 1024;
      const fallos = [];
      if (bytes > tope * 0.8) {
        fallos.push(
          `Bloques de ${s} s dan ~${(bytes / 1024 / 1024).toFixed(1)} MB en base64 y el tope es 4,5 MB.`,
        );
      }
      if (ctx.config.narracion.topeBytesPorLlamada > 4000) {
        fallos.push('El tope de bytes por llamada de voz pasa de 4.000.');
      }
      return fallos;
    },
    // Es exactamente el cambio que alguien haría «para que haya menos llamadas», y
    // que devuelve el §7.1 con su mensaje engañoso.
    romper: (ctx) => conConfig(ctx, (c) => (c.narracion.segundosPorBloque = 150)),
  },

  // ── §7.13: la anchura es una invariante, no un detalle de estilo ──────────
  {
    nombre: 'nada-se-sale-de-la-pantalla',
    dice: 'Si la herramienta se usa en un móvil, la anchura es una invariante que se comprueba (§7.13).',
    comprobar(ctx) {
      const html = fuente(ctx, 'index.html');
      if (!html) return ['No hay index.html.'];
      const fallos = [];
      if (!/max-width:\s*100%/.test(html)) fallos.push('No hay ninguna regla de anchura máxima.');
      if (!/overflow-x:\s*hidden/.test(html)) fallos.push('El cuerpo puede desplazarse a los lados.');
      if (!/<meta name="viewport"[^>]*width=device-width/.test(html)) {
        fallos.push('Falta el viewport de anchura de dispositivo.');
      }
      if (!/select[^{]*\{[^}]*max-width/s.test(html)) {
        fallos.push('Los selectores no tienen anchura máxima: fue exactamente el §7.13.');
      }
      return fallos;
    },
    romper: (ctx) => editando(ctx, 'index.html', (t) => t.replace(/overflow-x:\s*hidden;?/g, '')),
  },

  {
    nombre: 'la-salud-prueba-la-cadena-no-la-presencia',
    dice: 'El diagnóstico prueba que la credencial FIRMA, que el almacén RESPONDE y que el modelo CONTESTA. Que una variable exista no comprueba nada (§1).',
    comprobar(ctx) {
      const s = fuente(ctx, 'api/_lib/salud.js');
      const api = fuente(ctx, 'api/ia.js');
      const fallos = [];

      if (!/probarCadena/.test(api)) fallos.push('El modo «salud» no prueba la cadena.');

      // Cada eslabón tiene que hacer una llamada de verdad, no mirar el entorno.
      for (const [eslabon, senal] of [
        ['credencial', /tokenDeAcceso\(\)/],
        ['almacén', /storage\.googleapis\.com/],
        ['modelos', /generateContent/],
        ['montador', /run\.googleapis\.com/],
      ]) {
        if (!senal.test(s)) fallos.push(`El diagnóstico no prueba de verdad el eslabón «${eslabon}».`);
      }

      // Un fallo sin qué-hacer es un código de salida con otro nombre (§7.6).
      if (!/arregla/.test(s)) {
        fallos.push('Los eslabones rotos no dicen qué hacer para arreglarlos.');
      }
      // El pegado incompleto de la clave PEM es EL fallo de configurar desde un
      // teléfono: tiene que cazarse por su nombre, no como «error de firma».
      if (!/-----BEGIN/.test(s) || !/-----END/.test(s)) {
        fallos.push('No se comprueba que la clave privada esté completa antes de usarla.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'api/_lib/salud.js', (t) => t.replace(/generateContent/g, 'noSeLlamaAsi')),
  },

  {
    nombre: 'el-director-usa-el-mejor-modelo-disponible',
    dice: 'El modelo de texto —«el director»— se elige automáticamente como el mejor que el proyecto tenga. Un identificador fijo envejece: el que había se quedó dos generaciones atrás sin que nadie lo notara.',
    async comprobar(ctx) {
      const { mejorModeloTexto, puntuarModelo } = await import('../../app/config.js');
      const fallos = [];

      // Un Pro nuevo gana a un Pro viejo; un Pro gana a un Flash de su generación;
      // y una versión de dos cifras no se lee como menor que una de una.
      const casos = [
        [['gemini-2.5-pro', 'gemini-3.1-pro'], 'gemini-3.1-pro'],
        [['gemini-3.1-flash', 'gemini-3.1-pro'], 'gemini-3.1-pro'],
        [['gemini-3.1-pro', 'gemini-3.10-pro'], 'gemini-3.10-pro'],
        [['gemini-4.0-flash', 'gemini-3.1-pro'], 'gemini-4.0-flash'],
        [['gemini-3.1-pro-preview', 'gemini-3.1-pro'], 'gemini-3.1-pro'],
      ];
      for (const [lista, esperado] of casos) {
        const sale = mejorModeloTexto(lista);
        if (sale !== esperado) {
          fallos.push(`De [${lista.join(', ')}] elige ${sale} y debería elegir ${esperado}.`);
        }
      }
      if (puntuarModelo('') !== 0) fallos.push('Un identificador vacío no puntúa cero.');

      // Y la pantalla tiene que ESCRIBIR esa elección, no solo enseñarla (§7.3).
      const main = fuente(ctx, 'app/main.js');
      if (!/P\.config\.texto\.modelo = mejor/.test(main)) {
        fallos.push('La elección automática no se guarda en la configuración.');
      }
      // Y tiene que REVISARSE en cada carga mientras sea automática. Con la
      // condición «solo si está vacío», un proyecto guardado ayer se queda con el
      // mejor modelo de ayer para siempre: §7.2, un arreglo que no llega porque el
      // valor guardado lo tapa.
      if (/if \(!P\.config\.texto\.modelo &&/.test(main)) {
        fallos.push('El modelo solo se elige si está vacío: un proyecto viejo nunca subiría.');
      }
      if (!/aMano/.test(main) || !/aMano/.test(fuente(ctx, 'app/config.js'))) {
        fallos.push('No se distingue la elección automática de la elección a mano.');
      }

      // El respaldo del catálogo tiene que PREGUNTAR, no traer una lista escrita.
      const prov = fuente(ctx, 'api/_lib/proveedor.js');
      if (!/probarCandidatos/.test(prov)) {
        fallos.push('Sin listado, el catálogo no pregunta a los modelos uno a uno.');
      }
      if (/const RESERVA\s*=/.test(prov)) {
        fallos.push('Queda una lista de modelos escrita a mano: envejece sola y nadie se entera.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) => t.replace('P.config.texto.modelo = mejor;', '')),
  },

  {
    nombre: 'la-instruccion-del-director-es-del-genero',
    dice: 'El director trae una instrucción escrita para ESTE canal —misterio, crimen real, polémicas— y con la línea ética dentro. Una instrucción genérica devuelve documentales genéricos.',
    comprobar(ctx) {
      const d = fuente(ctx, 'app/fases/director.js');
      const fallos = [];
      const debeCubrir = [
        [/crimen real|polémicas/i, 'el género del canal'],
        // \s+ y no un espacio: el texto va justificado a 80 columnas y cualquier
        // frase puede quedar partida por un salto. La primera versión de esto
        // buscaba «DETALLE CONCRETO» literal y falló por eso.
        [/DETALLE\s+CONCRETO|apertura\s*en\s*frío|aperturaEnFrio/i, 'cómo abre'],
        [/TODAVÍA\s+NO|retiene/i, 'el motor: lo que se retiene'],
        [/GIRO/i, 'el giro'],
        [/sentencia|absolutoria|probado/i, 'la línea de lo probado'],
        [/moraleja/i, 'cómo cierra'],
        [/DEBAJO de una voz|lecho/i, 'la música por debajo'],
      ];
      for (const [re, que] of debeCubrir) {
        if (!re.test(d)) fallos.push(`La instrucción del director no dice nada sobre ${que}.`);
      }
      // Una instrucción corta es una instrucción genérica.
      const i = d.indexOf('const SISTEMA');
      const largo = d.slice(i, d.indexOf('`;', i)).length;
      if (largo < 1500) fallos.push(`La instrucción del director son ${largo} caracteres: demasiado corta para dirigir.`);
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/fases/director.js', (t) =>
        t.replace(/const SISTEMA = `[\s\S]*?`;/, 'const SISTEMA = `Eres director. Haz un documental.`;'),
      ),
  },

  {
    nombre: 'la-contrasena-no-comparte-nombre-con-ningun-campo',
    dice: 'El campo de la contraseña no puede llamarse igual que ningún campo de carga útil, y va el último al componer el cuerpo: si no, un dato lo pisa y el error dice «contraseña incorrecta», que es lo que menos ayuda a encontrarlo.',
    comprobar(ctx) {
      const api = fuente(ctx, 'api/ia.js');
      const cliente = fuente(ctx, 'app/api.js');
      const fallos = [];

      // Cómo se llama el campo de autenticación en el servidor.
      const campo = api.match(/cuerpo\.(\w+)\s*!==\s*esperada/)?.[1];
      if (!campo) return ['No se encuentra la comprobación de contraseña en la puerta.'];

      // Ningún modo puede exigir un campo que se llame igual.
      if (new RegExp(`exigir\\(c, '${campo}'\\)`).test(api)) {
        fallos.push(`Un modo exige el campo «${campo}», que es el de la contraseña: uno pisa al otro.`);
      }
      // Y el cliente tiene que ponerlo DESPUÉS de la carga útil.
      const cuerpo = cliente.slice(cliente.indexOf('body: JSON.stringify('), cliente.indexOf('signal: senal'));
      const posDatos = cuerpo.indexOf('...datos');
      const posCampo = cuerpo.indexOf(`${campo}:`);
      if (posCampo < 0) fallos.push(`El cliente no manda el campo «${campo}».`);
      else if (posDatos >= 0 && posCampo < posDatos) {
        fallos.push(`El cliente pone «${campo}» antes de la carga útil: cualquier campo homónimo lo pisa.`);
      }
      return fallos;
    },
    // El sabotaje es el bug tal cual pasó: la contraseña antes de los datos.
    romper: (ctx) =>
      editando(ctx, 'app/api.js', (t) =>
        t
          .replace(/\.\.\.datos,\n\s*\/\/ Va la ÚLTIMA[^\n]*\n\s*acceso: claveAcceso,/, 'acceso: claveAcceso,\n          ...datos,'),
      ),
  },

  {
    nombre: 'los-fallos-se-explican-con-palabras',
    dice: 'El usuario no lee registros de la nube desde el teléfono: cualquier fallo se explica en pantalla, con palabras (§1).',
    comprobar(ctx) {
      const t = fuente(ctx, 'api/ia.js');
      const fallos = [];
      if (!/revisarConfiguracion/.test(t)) {
        fallos.push('No hay forma de saber desde el teléfono qué falta por configurar.');
      }
      // Un error sin frase es un código de salida con otro nombre (§7.6).
      for (const m of t.matchAll(/error:\s*`?['"]?([^'"`,\n]{0,20})/g)) {
        if (/^HTTP \d+$|^\d+$/.test(m[1].trim())) fallos.push(`Se devuelve un código pelado: ${m[1]}`);
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'api/ia.js', (t) => t.replace(/revisarConfiguracion/g, 'noExiste')),
  },
];
