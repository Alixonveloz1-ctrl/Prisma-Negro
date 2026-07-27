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
        [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'una clave privada'],
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
    romper: (ctx) =>
      conFuente(ctx, 'app/config.js', 'const cuenta = "montador@mi-proyecto.iam.gserviceaccount.com";'),
  },

  {
    nombre: 'toda-configuracion-por-entorno',
    dice: 'Todo lo que identifica la cuenta se lee de variables de entorno, y .env.example las documenta todas.',
    comprobar(ctx) {
      const ejemplo = fuente(ctx, '.env.example');
      const usadas = new Set();
      for (const [ruta, texto] of ctx.fuentes) {
        if (!ruta.startsWith('api/')) continue;
        for (const m of texto.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) usadas.add(m[1]);
      }
      return [...usadas]
        .filter((v) => !ejemplo.includes(v))
        .map((v) => `${v} se usa en la función pero no está en .env.example`);
    },
    romper: (ctx) =>
      editando(ctx, 'api/_lib/almacen.js', (t) =>
        t.replace('process.env.ALMACEN_NOMBRE', 'process.env.ALMACEN_SECRETO_NUEVO'),
      ),
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
      const i = t.indexOf('export function pintarSelectorModelo');
      if (i < 0) return ['No existe pintarSelectorModelo.'];
      const cuerpo = t.slice(i, t.indexOf('\n}', i));
      return /return elegido;/.test(cuerpo)
        ? []
        : ['pintarSelectorModelo no devuelve el valor elegido: vuelve el §7.3.'];
    },
    romper: (ctx) =>
      editando(ctx, 'app/config.js', (t) => t.replace('  return elegido;\n}', '}')),
  },

  {
    nombre: 'los-modelos-retirados-tienen-relevo',
    dice: 'Un modelo retirado no se borra del catálogo: se marca y se sustituye. Si se borrara, un proyecto viejo cargaría un valor que no está en el desplegable.',
    comprobar(ctx) {
      const fallos = [];
      for (const [familia, lista] of Object.entries(ctx.modelos)) {
        for (const m of lista) {
          if (!m.retirado) continue;
          if (!lista.some((x) => x.id === m.retirado)) {
            fallos.push(`${familia}: ${m.id} apunta a un relevo que no existe (${m.retirado}).`);
          }
          if (lista.find((x) => x.id === m.retirado)?.retirado) {
            fallos.push(`${familia}: ${m.id} se releva por otro modelo retirado.`);
          }
        }
        if (!lista.some((m) => !m.retirado)) {
          fallos.push(`${familia}: no queda ni un modelo vigente al que caer.`);
        }
      }
      return fallos;
    },
    romper: (ctx) => ({
      ...ctx,
      modelos: { ...ctx.modelos, imagen: [{ id: 'viejo', retirado: 'uno-que-no-existe' }] },
    }),
  },

  // ── §7.12: ninguna escritura se ignora ────────────────────────────────────
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
      const cuerpo = t.slice(i);
      const fallos = [];
      if (!/\.filter\(/.test(cuerpo)) fallos.push('El catálogo no filtra nada.');
      // La región tiene que estar DENTRO de la etiqueta, no solo declarada en algún
      // sitio del archivo: dos voces distintas se ven idénticas en el desplegable si
      // la etiqueta es solo el nombre (§7.10).
      const etiqueta = cuerpo.match(/etiqueta:\s*([^\n]+)/)?.[1] || '';
      if (!/REGIONES\[/.test(etiqueta)) {
        fallos.push(`La etiqueta de la voz no lleva la región dentro: ${etiqueta.slice(0, 60)}`);
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'api/_lib/proveedor.js', (t) =>
        t.replace(/etiqueta: `[^`]*`/, 'etiqueta: v.name'),
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
