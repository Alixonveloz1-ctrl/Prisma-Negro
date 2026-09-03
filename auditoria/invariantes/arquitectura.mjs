// Invariantes de arquitectura (§1, §2, §6, §7 del plano).
//
// No son pruebas unitarias: son AFIRMACIONES SOBRE CÓMO TIENE QUE ESTAR CONSTRUIDO
// EL SISTEMA. Cada una viene de un error que se pagó con tiempo.
//
// Cada invariante trae su `romper`: la forma de sabotear el sistema que TIENE que
// hacerla fallar. Sin eso, una comprobación que nunca ha fallado no está
// comprobando nada (§9) — en el proyecto de origen una de ellas medía el bloque de
// código equivocado durante semanas y siempre pasaba.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { editando, conFuente, conConfig, conCatalogo, conFuncion } from '../contexto.mjs';

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
      //
      // Menos las que pone LA PLATAFORMA. `.env.example` es la lista de lo que hay
      // que PEGAR para que esto funcione, y meter ahí `VERCEL_GIT_COMMIT_SHA` haría
      // creer que hay que ponerla a mano: la pone Vercel en cada despliegue, y
      // escribirla a mano sería peor que no tenerla —diría la versión equivocada—.
      // Se distinguen por el prefijo, que es de la plataforma y no del proyecto.
      const DE_LA_PLATAFORMA = /^VERCEL_/;
      for (const [ruta, texto] of ctx.fuentes) {
        if (!ruta.startsWith('api/')) continue;
        for (const m of texto.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
          if (!DE_LA_PLATAFORMA.test(m[1])) usadas.add(m[1]);
        }
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

  {
    nombre: 'ningun-modulo-vivo-se-sirve-de-la-cache-del-navegador',
    dice: '«¿Todo eso está en main? Porque no veo ningún cambio.» Estaba en main y estaba desplegado. Lo que fallaba era el reparto: `vercel.json` mandaba `no-cache` a `/app/` y al índice, pero NO a `/comun/`. Y `comun/` lo importan los módulos de `app/`, así que el teléfono se traía `main.js` recién horneado y `comun/estilos.mjs` de la caché. Cuando el fresco importa un nombre que el cacheado ya no exporta, el enlace de módulos falla ENTERO y no arranca nada: un despliegue correcto que en pantalla se ve como que no ha cambiado nada, y sin un solo error que lo diga. Desde un teléfono no hay forma de vaciar la caché de un archivo suelto.',
    comprobar(ctx) {
      const fallos = [];
      let vercel;
      try {
        vercel = JSON.parse(fuente(ctx, 'vercel.json'));
      } catch {
        return ['vercel.json no se puede leer: sin él no hay cabeceras de caché.'];
      }
      const cabeceras = vercel.headers || [];
      const sinCache = (ruta) =>
        cabeceras.some(
          (h) =>
            new RegExp(`^${String(h.source).replace('(.*)', '.*')}$`).test(ruta) &&
            (h.headers || []).some((x) => /cache-control/i.test(x.key) && /no-cache|no-store|max-age=0/i.test(x.value)),
        );

      // TODA carpeta de la que salga un módulo que el navegador importa. No solo
      // las que hay hoy: se descubren mirando de dónde importa el código vivo, para
      // que crear una carpeta nueva mañana no se quede fuera en silencio.
      const carpetas = new Set(['app', 'comun']);
      for (const [ruta, texto] of ctx.fuentes) {
        if (!ruta.startsWith('app/')) continue;
        // Solo lo que SALE de `app/`: un `./fases/` es una subcarpeta suya y ya
        // queda cubierta por `/app/(.*)`. Contarla daría un fallo por una carpeta
        // que no existe en la raíz.
        for (const m of texto.matchAll(/from '\.\.\/(?:\.\.\/)*([a-z]+)\//g)) carpetas.add(m[1]);
      }
      for (const c of carpetas) {
        if (!sinCache(`/${c}/x.js`)) {
          fallos.push(
            `«/${c}/» se sirve con la caché por defecto y de ahí salen módulos que el navegador importa: ` +
              'una versión vieja de uno solo tumba el arranque entero.',
          );
        }
      }
      // Y la página, por sus dos direcciones: se entra por «/», no por «/index.html».
      for (const ruta of ['/', '/index.html']) {
        if (!sinCache(ruta)) fallos.push(`«${ruta}» se sirve con la caché por defecto: se abriría la página de antes.`);
      }
      return fallos;
    },
    // Se rompe como estaba: `/comun/` sin cabecera, que es el agujero que hubo.
    romper: (ctx) =>
      editando(ctx, 'vercel.json', (t) =>
        t.replace(/\s*\{\s*"source": "\/comun\/\(\.\*\)"[\s\S]*?\]\s*\},/, ''),
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
    nombre: 'cada-modelo-se-pide-en-su-region',
    dice: 'Los gemini-3* se sirven en «global» y el resto en su región. Equivocarse NO da «región equivocada»: da 404, que se lee como «no tienes ese modelo». Es lo que hizo creer que solo había un generador de imagen habiendo tres.',
    async comprobar(ctx) {
      const { regionDe, hostDe, REGION_GLOBAL } = await import('../../comun/modelos.mjs');
      const fallos = [];

      const casos = [
        ['gemini-3-pro-image', REGION_GLOBAL],
        ['gemini-3.1-flash-image', REGION_GLOBAL],
        ['gemini-3.1-pro-preview', REGION_GLOBAL],
        ['gemini-2.5-flash-image', 'us-central1'],
        ['gemini-2.5-pro', 'us-central1'],
        ['veo-3.1-fast-generate-001', 'us-central1'],
        ['lyria-002', 'us-central1'],
      ];
      for (const [id, esperada] of casos) {
        const sale = regionDe(id, 'us-central1');
        if (sale !== esperada) fallos.push(`«${id}» se pide en ${sale} y va en ${esperada}.`);
      }
      // Y el host de «global» NO lleva prefijo de región.
      if (hostDe(REGION_GLOBAL) !== 'aiplatform.googleapis.com') {
        fallos.push(`El host de global es ${hostDe(REGION_GLOBAL)} y debería ir sin prefijo.`);
      }
      if (!/^us-central1-/.test(hostDe('us-central1'))) {
        fallos.push('El host de una región concreta va sin prefijo.');
      }

      // Y ninguna llamada puede seguir usando una sola región para todo.
      const prov = fuente(ctx, 'api/_lib/proveedor.js');
      if (/\$\{base\(\)\}/.test(prov)) {
        fallos.push('Queda una llamada con la región fija para todos los modelos.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'api/_lib/proveedor.js', (t) =>
        t.replace(/rutaDe\(id\)/g, '`${base()}/${id}`'),
      ),
  },

  {
    nombre: 'ninguna-imagen-vuelve-dentro-de-la-respuesta',
    dice: 'Una imagen de 2K en base64 ocupa nueve megas y el tope de la respuesta es 4,5. Pedirla de vuelta en la misma llamada la tiraba con «la respuesta ocupa 9.14 MB» DESPUÉS de haberla generado y pagado. Se baja del almacén, por trozos.',
    comprobar(ctx) {
      const fallos = [];

      // Ni el navegador la pide, ni la puerta sabe devolverla.
      for (const [ruta, texto] of ctx.fuentes) {
        if (ruta.startsWith('auditoria/') || ruta === 'app/material.js') continue;
        if (/devolver:\s*true/.test(texto)) fallos.push(`${ruta} pide la imagen de vuelta en la respuesta.`);
        if (ruta === 'api/ia.js' && /c\.devolver/.test(texto)) {
          fallos.push('La puerta todavía sabe devolver la imagen: alguien volverá a pedirla.');
        }
      }

      // Y hay UN solo descargador por trozos, que es el que todos usan.
      const mat = fuente(ctx, 'app/material.js');
      if (!/export async function material/.test(mat)) fallos.push('No hay descargador común.');
      if (!/r\.hasta \+ 1|desde = r\.hasta/.test(mat)) fallos.push('El descargador no va por trozos.');
      for (const ruta of ['app/fases/imagen.js', 'app/fases/miniatura.js', 'app/previa.js']) {
        if (!/from '\.\.?\/(\.\.\/)?material\.js'|from '\.\/material\.js'/.test(fuente(ctx, ruta))) {
          fallos.push(`${ruta} no usa el descargador común.`);
        }
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/fases/imagen.js', (t) =>
        t.replace('guardarEn: clave,\n    },', 'guardarEn: clave,\n      devolver: true,\n    },'),
      ),
  },

  {
    nombre: 'el-censor-no-se-atraganta-con-un-trozo-grande',
    dice: 'El censor era CUADRÁTICO: 8 KB en 64 ms, 128 KB en 16 s, y cada doblada cuatro veces más lento. Un trozo de descarga de 3 MB habría tardado horas, así que ninguna imagen ni ningún video se podían bajar —la función se agotaba a los 60 s y parecía un fallo de red—.',
    async comprobar(ctx) {
      const { censurarTexto } = await import('../../api/_lib/censor.js?t=' + Date.now());
      const fallos = [];

      // Un trozo del tamaño real de descarga, del tipo que provocaba el atasco:
      // una tirada larga de caracteres de palabra, como es un base64.
      const trozo = JSON.stringify({ ok: true, datos: 'A'.repeat(3 * 1024 * 1024) });
      const t0 = Date.now();
      censurarTexto(trozo);
      const ms = Date.now() - t0;
      if (ms > 1000) {
        fallos.push(`Censurar 3 MB tarda ${ms} ms. A ese ritmo una descarga se agota antes de llegar.`);
      }

      // Y sigue censurando, que es para lo que está.
      const limpio = censurarTexto('cuenta a.b+c@mi-proy.iam.gserviceaccount.com y gs://cubo/x.png');
      if (/gserviceaccount|gs:\/\//.test(limpio)) fallos.push('Ha dejado de censurar lo que tenía que ocultar.');

      // Ningún patrón puede llevar un cuantificador sin cota sobre caracteres de
      // palabra: es exactamente la forma que se atragantaba.
      const src = fuente(ctx, 'api/_lib/censor.js');
      // Sin los comentarios: el que explica este mismo fallo LLEVA DENTRO el patrón
      // malo como ejemplo, así que buscarlo a pelo se encontraba a sí mismo.
      const zona = src
        .slice(src.indexOf('const PATRONES'), src.indexOf('function escapar'))
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      if (/\[\\w[^\]]*\]\+@/.test(zona)) {
        fallos.push('Vuelve a haber un cuantificador sin cota antes de una arroba.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'api/_lib/censor.js', (t) =>
        t.replace(
          '/\\b[\\w.+-]{1,128}@[\\w-]{1,64}\\.iam\\.gserviceaccount\\.com/g,',
          '/[\\w.+-]+@[\\w-]+\\.iam\\.gserviceaccount\\.com/g,',
        ),
      ),
  },

  {
    nombre: 'ninguna-respuesta-pasa-del-tope-con-material-de-verdad',
    dice: 'Se mide, no se razona. Cada modo pasa por la puerta con material del tamaño que tiene el de verdad —imagen de 2K, clip de 8 s, bloque de voz de 45 s— y se pesa lo que sale. Así se ve el «la respuesta ocupa 9.14 MB» ANTES de pagarlo.',
    async comprobar(ctx) {
      const { medirRespuestas, TOPE } = await import('../tamanos.mjs');
      // Si la auditoría trae la puerta saboteada, se mide ESA.
      const enContexto = ctx.fuentes.get('api/ia.js');
      const enDisco = readFileSync(join(ctx.raiz, 'api/ia.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;

      const fallos = [];
      for (const f of await medirRespuestas(null, { parche })) {
        if (f.estado !== 200) {
          fallos.push(`«${f.modo}» contestó ${f.estado}: ${f.error}`);
        } else if (!f.cabe) {
          fallos.push(
            `«${f.modo}» devuelve ${(f.bytes / 1048576).toFixed(2)} MB y el tope es ` +
              `${(TOPE / 1048576).toFixed(1)} MB. Tiene que bajarse por trozos.`,
          );
        }
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'api/ia.js', (t) =>
        t.replace(
          'return { guardado: r, referencia: almacen.referenciaDe(c.guardarEn) };',
          'return { guardado: r, referencia: almacen.referenciaDe(c.guardarEn), ...img };',
        ),
      ),
  },

  {
    nombre: 'el-ritmo-de-la-cuota-se-puede-fijar-y-no-se-reaprende-a-golpes',
    dice: 'El diagnóstico dijo lo que había: «la cuota del generador de imágenes está agotada». Con una cuota baja, el freno que aprende chocando cuesta una llamada fallida y minutos de espera cada vez que descubre el límite — y lo aprendido vivía en una variable suelta, así que CADA RECARGA volvía a descubrirlo a golpes. Dos cosas lo arreglan: poder DECIR el límite, y que lo aprendido se guarde con el proyecto. Un freno que solo aprende chocando condena a chocar siempre.',
    async comprobar(ctx) {
      const { normalizar } = ctx.fn;
      const fallos = [];

      // 1 · EL AJUSTE EXISTE, SE GUARDA Y SE SANEA.
      const c = normalizar({});
      if (c.ritmo?.porMinuto !== 0 || c.ritmo?.aprendido !== 0) {
        fallos.push('El ritmo no arranca en automático: hay que poder no decir nada y que funcione.');
      }
      if (normalizar({ ritmo: { porMinuto: 999 } }).ritmo.porMinuto !== 60) {
        fallos.push('Un ritmo absurdo no se acota: sesenta por minuto ya no es la cuota lo que manda.');
      }
      if (normalizar({ ritmo: { porMinuto: 2 } }).ritmo.porMinuto !== 2) {
        fallos.push('Un ritmo elegido a mano no sobrevive a normalizar.');
      }
      // Y lo aprendido se guarda EN EL PROYECTO. En una variable suelta se pierde
      // al recargar, que es el fallo entero.
      if (normalizar({ ritmo: { aprendido: 30000 } }).ritmo.aprendido !== 30000) {
        fallos.push('Lo que el freno aprendió no se conserva: la sesión siguiente vuelve a chocar.');
      }

      // 2 · Y EL SUELO MANDA DE VERDAD. Se comprueba EJECUTANDO la puerta: que el
      // freno no baje por debajo de lo que se le dijo, por muchos aciertos que
      // encadene. Sin esto, `aflojar` lo devolvería a cero en cinco llamadas y se
      // volvería a chocar por decisión propia.
      const { humoDeLaPuerta } = await import('../api-humo.mjs');
      const enContexto = ctx.fuentes.get('app/api.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/api.js'), 'utf8');
      const r = await humoDeLaPuerta({
        parche: enContexto !== enDisco ? () => enContexto : null,
        suelo: 12000,
      });
      fallos.push(...r.fallos.filter((f) => /suelo|ritmo/i.test(f)));

      // 3 · Y LA PANTALLA lo aplica y lo recuerda: un ajuste que no llega a la
      // puerta es un ajuste decorativo.
      const main = ctx.fuentes.get('app/main.js') || '';
      if (!/ponerRitmoMinimo\(/.test(main)) fallos.push('El ritmo elegido no llega a la puerta.');
      if (!/60000 \/ porMinuto/.test(main)) fallos.push('«Imágenes por minuto» no se traduce a espera entre llamadas.');
      if (!/P\.config\.ritmo\.aprendido = ahora/.test(main)) {
        fallos.push('Lo que el freno descubre en una tanda no se guarda al terminar.');
      }
      if (!/id="por-minuto"/.test(ctx.fuentes.get('index.html') || '')) {
        fallos.push('No hay dónde decir la cuota: solo queda descubrirla chocando.');
      }
      return fallos;
    },
    // Se rompe como estaba: sin suelo, el freno se afloja hasta cero y se vuelve a
    // chocar aunque se le haya dicho el límite.
    romper: (ctx) =>
      editando(ctx, 'app/api.js', (t) =>
        t.replace('if (pausaEntreLlamadas <= sueloDelRitmo) return;', 'if (!pausaEntreLlamadas) return;')
          .replace(
            'pausaEntreLlamadas = Math.max(sueloDelRitmo, siguiente < PAUSA_MINIMA ? 0 : siguiente);',
            'pausaEntreLlamadas = siguiente < PAUSA_MINIMA ? 0 : siguiente;',
          ),
      ),
  },

  {
    nombre: 'esperar-por-la-cuota-se-abandona-cuando-no-sirve-y-se-dice-por-que',
    dice: '«Lleva media hora ahí y no avanza. Ni genera nada.» Esperar por la cuota está bien para una ventana POR MINUTO —se abre a la primera espera— y es una trampa para cualquier otra: una cuota diaria, o un modelo que el proyecto no tiene habilitado y contesta «límite 0», no se abren nunca, y la herramienta daba vueltas horas sin generar nada ni decir por qué. La señal que las distingue no hay que adivinarla: si la ventana es por minuto, algo sale bien en cuanto pasa el minuto. Dos esperas seguidas sin generar NADA significan que no es eso, y entonces lo único útil es parar y enseñar lo que contestó el proveedor.',
    async comprobar(ctx) {
      const { Cola } = ctx.fn;
      const fallos = [];

      const conCuota = async (siempreFalla) => {
        const cola = new Cola();
        let esperas = 0;
        cola.esperarConCuenta = async () => {
          esperas++;
        };
        let n = 0;
        const r = await cola.ejecutar(
          'prueba',
          [0, 1, 2],
          async () => {
            n++;
            // `siempreFalla` = la cuota no se abre nunca. Si no, se abre al tercer
            // intento, como una ventana por minuto de verdad.
            if (siempreFalla || n <= 2) {
              const e = new Error('Quota exceeded for quota metric ... limit: 0 per day');
              e.estado = 429;
              throw e;
            }
            return 'ok';
          },
          { alTerminarUno: () => {} },
        );
        return { r, esperas, intentos: n };
      };

      // 1 · LA CUOTA QUE NO SE ABRE: se para, y pronto.
      const dura = await conCuota(true);
      if (!dura.r.sinCuota) {
        fallos.push('Con la cuota cerrada para siempre, la tanda no se rinde: sigue esperando sin generar nada.');
      }
      if (dura.esperas > 3) {
        fallos.push(`Espera ${dura.esperas} veces sin generar nada antes de rendirse: eso es media hora mirando una barra parada.`);
      }
      // Y LO QUE DICE EL PROVEEDOR VIAJA ENTERO hasta quien lo tiene que leer: es
      // lo único que dice si hay que pedir cuota, activar facturación o esperar.
      if (!/limit: 0 per day/.test(String(dura.r.sinCuota || ''))) {
        fallos.push('Al rendirse no se conserva lo que contestó el proveedor: no hay con qué arreglarlo.');
      }
      if (dura.r.hechas !== 0) fallos.push(`Dice que hizo ${dura.r.hechas} y no generó ninguna.`);

      // 2 · Y LA VENTANA QUE SÍ SE ABRE sigue funcionando como antes: se espera lo
      // que haga falta y no se pierde ni una unidad.
      const blanda = await conCuota(false);
      if (blanda.r.sinCuota) fallos.push('Una cuota que sí se abre se trata como si no fuera a abrirse nunca.');
      if (blanda.r.hechas !== 3 || blanda.r.fallos.length) {
        fallos.push(`Con la cuota abriéndose, se generaron ${blanda.r.hechas} de 3 con ${blanda.r.fallos.length} fallos.`);
      }

      // 3 · Y EL MENSAJE DEL PROVEEDOR NO SE BORRA EN EL CAMINO. Aquí había un
      // `err.message = '...'` que tiraba lo que decía Google y lo sustituía por una
      // suposición —«es el límite por minuto»— que podía ser falsa.
      const api = ctx.fuentes.get('app/api.js') || '';
      if (/err\.message =\s*\n?\s*'Se agotó la cuota/.test(api)) {
        fallos.push('El mensaje del proveedor se sustituye por una suposición: media hora esperando no enseña nada.');
      }
      if (!/err\.message =\s*\n?\s*`\$\{err\.message\}/.test(api)) {
        fallos.push('El mensaje del proveedor no se conserva al rendirse por cuota.');
      }
      // Y la puerta del servidor conserva el CÓDIGO del proveedor: devolver 500
      // para un 429 es llamar avería a un «espera».
      const ia = ctx.fuentes.get('api/ia.js') || '';
      if (!/const estado = Number\(err\?\.estado\)/.test(ia) || !/estado >= 400 && estado < 600 \? estado : 500/.test(ia)) {
        fallos.push('La puerta devuelve 500 para cualquier fallo: un 429 del proveedor llega como avería.');
      }

      // 4 · Y EL DIAGNÓSTICO PRUEBA LA IMAGEN, no solo el texto. El de texto iba
      // bien mientras la imagen estaba muerta, y la pantalla decía que todo bien.
      const salud = ctx.fuentes.get('api/_lib/salud.js') || '';
      if (!/paso\('imagen'/.test(salud)) {
        fallos.push('El diagnóstico no prueba el generador de imágenes: da luz verde con la fase más usada muerta.');
      }
      if (!/r\.status === 429/.test(salud)) {
        fallos.push('El diagnóstico no distingue la cuota agotada del resto: es lo que hay que poder ver en tres segundos.');
      }
      // Y SIN GENERAR NADA: un diagnóstico que cuesta dinero no se pulsa.
      if (!/body: JSON\.stringify\(\{\}\)/.test(salud)) {
        fallos.push('La prueba del generador de imágenes genera una imagen de verdad: un diagnóstico que cobra no se usa.');
      }
      return fallos;
    },
    // Se rompe como estaba: se espera siempre, pase lo que pase.
    romper: (ctx) => {
      const Original = ctx.fn.Cola;
      class ColaTerca extends Original {
        async ejecutar(nombre, unidades, hacerUno, opciones = {}) {
          const r = await super.ejecutar(nombre, unidades, hacerUno, opciones);
          // Lo de antes: nunca se rinde, así que nunca hay nada que enseñar.
          return { ...r, sinCuota: null };
        }
      }
      return conFuncion(ctx, 'Cola', ColaTerca);
    },
  },

  {
    nombre: 'la-cuota-agotada-para-la-tanda-pero-no-pierde-la-unidad',
    dice: '«Llega el momento en que el mensaje dice que se está generando pero no se genera nada. Media hora y no se generó nada. Debería ponerse en cola para que cuando ya se quite el límite continúe la generación; si no, de nada me sirve dar el botón de generar todo.» La llamada esperaba sus ocho minutos a que se abriera la ventana de cuota y, si seguía cerrada, lanzaba. La cola daba esa unidad POR PERDIDA y pasaba a la siguiente, que se estrellaba contra la misma pared, esperaba otros ocho minutos y también se perdía. Ciento cuarenta veces. La cuota no es un fallo: es un «ahora no», y lo que tiene que parar es la TANDA, no la unidad.',
    async comprobar(ctx) {
      const { Cola } = ctx.fn;
      const fallos = [];

      // Una tanda de tres en la que la primera unidad choca dos veces con la cuota
      // antes de salir. Se sustituye la espera —son minutos— por nada: lo que se
      // comprueba es QUÉ HACE con la unidad, no cuánto duerme.
      const cola = new Cola();
      let esperas = 0;
      cola.esperarConCuenta = async () => {
        esperas++;
      };

      const intentos = new Map();
      const escritas = [];
      const r = await cola.ejecutar(
        'prueba',
        [0, 1, 2],
        async (u) => {
          const n = (intentos.get(u) || 0) + 1;
          intentos.set(u, n);
          if (u === 0 && n <= 2) {
            const e = new Error('Resource has been exhausted');
            e.estado = 429;
            throw e;
          }
          return `hecha ${u}`;
        },
        { alTerminarUno: (res) => escritas.push(res) },
      );

      if (!esperas) fallos.push('La cuota agotada no para la tanda: se pasa a la siguiente y choca igual.');
      if (r.fallos.length) {
        fallos.push(`La unidad que topó con la cuota se dio por perdida: ${r.fallos[0].error}`);
      }
      if (escritas.length !== 3) {
        fallos.push(`Se guardaron ${escritas.length} de 3: la unidad que esperó no llegó a generarse.`);
      }
      if (intentos.get(0) !== 3) {
        fallos.push(`La unidad de la cuota se intentó ${intentos.get(0)} veces: no se reintenta la MISMA.`);
      }
      if (r.hechas !== 3) fallos.push(`La cuenta dice ${r.hechas} de 3: las esperas se cuentan como avance.`);

      // Y un fallo que NO es cuota sigue sin parar la tanda: cuarenta tomas buenas
      // no se tiran porque la treinta y uno diera error.
      const cola2 = new Cola();
      cola2.esperarConCuenta = async () => {};
      const r2 = await cola2.ejecutar(
        'prueba',
        [0, 1],
        async (u) => {
          if (u === 0) throw Object.assign(new Error('descripción inaceptable'), { estado: 400 });
          return 'ok';
        },
        { alTerminarUno: () => {} },
      );
      if (r2.fallos.length !== 1 || r2.hechas !== 2) {
        fallos.push('Un fallo que no es de cuota ya no se anota y se sigue: o tumba la tanda o se traga el error.');
      }

      // Y hay un final: una cuota DIARIA no se abre hoy, y esperar para siempre con
      // la pantalla encendida no ayuda a nadie.
      const texto = ctx.fuentes.get('app/cola.js') || '';
      if (!/TOPE_DE_ESPERA_TOTAL/.test(texto)) {
        fallos.push('No hay tope de espera total: con una cuota diaria esperaría para siempre.');
      }
      // La cuenta atrás a la vista. Sin ella, media hora esperando se ve EXACTAMENTE
      // igual que la aplicación colgada, que es de lo que se quejaba.
      if (!/esperarConCuenta/.test(texto) || !/min /.test(texto)) {
        fallos.push('La espera no lleva cuenta atrás: una espera larga y muda parece que se colgó.');
      }
      return fallos;
    },
    // Se rompe como estaba: la cuota se traga la unidad y la tanda pasa a la
    // siguiente.
    romper: (ctx) => {
      const Original = ctx.fn.Cola;
      class ColaVieja extends Original {
        async ejecutar(nombre, unidades, hacerUno, opciones = {}) {
          // El comportamiento de antes: cada unidad que topa con la cuota se anota
          // como fallo y se sigue.
          const fallos = [];
          let hechas = 0;
          for (let i = 0; i < unidades.length; i++) {
            try {
              const res = await hacerUno(unidades[i], i, undefined, () => {});
              await opciones.alTerminarUno?.(res, unidades[i], i);
            } catch (e) {
              fallos.push({ i, unidad: unidades[i], error: String(e.message || e) });
            }
            hechas++;
          }
          return { hechas, total: unidades.length, fallos, detenida: false };
        }
      }
      return conFuncion(ctx, 'Cola', ColaVieja);
    },
  },

  {
    nombre: 'la-cuota-agotada-se-espera-no-se-descarta',
    dice: 'Vertex limita POR MINUTO, y cuando se pasa contesta 429 «Resource has been exhausted». Eso es un «espera», no un «no». Tratarlo como 4xx definitivo dejó 33 de 59 imágenes sin generar tras una hora, con un mensaje que ni siquiera dice que sea cuestión de esperar.',
    comprobar(ctx) {
      const api = fuente(ctx, 'app/api.js');
      const cola = fuente(ctx, 'app/cola.js');
      const fallos = [];

      // 429 tiene que salir de la regla de «los 4xx no se reintentan».
      const i = api.indexOf('// 413 = tamaño.');
      const antes = api.slice(0, i);
      if (!/esEspera\(r\.status/.test(antes)) {
        fallos.push('El 429 cae en la regla de los 4xx y se descarta al instante.');
      }
      if (!/RESOURCE_EXHAUSTED|has been exhausted/.test(api)) {
        fallos.push('No se reconoce el texto con el que el proveedor dice que la cuota se agotó.');
      }
      // ── Y CON PACIENCIA DE VENTANA DE CUOTA, NO DE CUATRO SEGUNDOS ──────────
      //
      // «¿Cómo le vas a poner un tiempo de cuatro segundos de espera? Eso no es
      //  nada para Vercel ni para Google Cloud.»
      //
      // La cuota de Vertex se mide POR MINUTO: cuando se agota, la ventana no se
      // abre hasta que pasa el minuto. Una primera espera de cinco segundos tira un
      // intento seguro —la ventana sigue cerrada— y las dos siguientes, otros dos.
      const esperas = /const ESPERAS = \[([^\]]+)\]/.exec(api);
      if (!esperas) fallos.push('No hay una escala de esperas para la cuota.');
      else {
        const lista = esperas[1].split(',').map((x) => Number(x.trim()));
        const total = lista.reduce((s, x) => s + x, 0);
        if (total < 120000) {
          fallos.push(`Esperando ${Math.round(total / 1000)} s en total no se sale de una ventana de cuota.`);
        }
        if (lista[0] < 20000) {
          fallos.push(
            `La primera espera de cuota son ${lista[0] / 1000} s. La ventana se mide en minutos: ` +
              'preguntar antes es tirar un intento con la respuesta ya sabida.',
          );
        }
      }
      // El freno que se ajusta solo: sin él, las 59 siguientes chocan igual.
      if (!/pausaEntreLlamadas/.test(api)) fallos.push('No baja el ritmo tras chocar con la cuota.');
      if (!/function aflojar/.test(api)) fallos.push('Baja el ritmo y no lo vuelve a subir nunca.');

      // Y EL PRIMER FRENAZO TIENE QUE BAJAR DEL LÍMITE, NO ROZARLO. Cuatro
      // segundos son quince llamadas por minuto: con una cuota de diez imágenes por
      // minuto —lo normal en un proyecto nuevo— se vuelve a chocar a la tercera.
      const inicial = Number(/const PAUSA_INICIAL = (\d+)/.exec(api)?.[1] || 0);
      if (!(inicial >= 6000)) {
        fallos.push(`El primer frenazo son ${inicial / 1000} s entre llamadas: no baja de ninguna cuota por minuto.`);
      }
      // Y SE AFLOJA POCO A POCO. Bajar de golpe a cero tras cinco aciertos es
      // volver derecho a la pared: el ritmo oscila entre el límite y nada en vez de
      // posarse donde el proveedor aguanta.
      if (/pausaEntreLlamadas <= \d+ \? 0 :/.test(api)) {
        fallos.push('El freno se quita de un salto tras unos aciertos: eso no regula, oscila.');
      }
      // Y se dice en pantalla: una espera larga y muda parece que se colgó.
      // La cola le pasa a cada unidad un cuarto argumento con el que avisar, y
      // distingue la espera por cuota del freno de ritmo. Se mira eso, no el
      // nombre del parámetro: el aviso va en una función anónima.
      if (!/hacerUno\(unidades\[i\], i, this\.senal, \(ms, por\)/.test(cola)) {
        fallos.push('La cola no le da a cada unidad forma de avisar de que está esperando.');
      }
      if (!/'cuota'/.test(cola)) {
        fallos.push('La espera no se cuenta en pantalla: una espera larga y muda parece colgada.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/api.js', (t) =>
        t.replace('if (esEspera(r.status, cuerpo.error)) {', 'if (false) {'),
      ),
  },

  {
    nombre: 'una-invariante-no-importa-lo-que-vigila',
    dice: 'Seis veces ha pasado lo mismo: una invariante importa directamente la función que vigila, el sabotaje cambia la FUENTE, la función importada sigue siendo la buena, y la invariante sale «ciega». El mensaje culpa a la comprobación cuando lo roto era la forma de romperla. Lo que se vigila entra por el contexto.',
    comprobar(ctx) {
      const fallos = [];
      for (const [ruta, texto] of ctx.fuentes) {
        if (!ruta.startsWith('auditoria/invariantes/')) continue;
        // Las importaciones de código VIVO —lo que la auditoría vigila— tienen que
        // entrar por `ctx.fn`, no por `import`. Se permiten las de `comun/` que son
        // tablas de datos: no se sabotean cambiando una función, se sabotean con
        // `conCatalogo` y compañía, y esas sí llegan.
        const TABLAS = ['estilos.mjs', 'modelos.mjs', 'temas.mjs', 'segmentar.mjs'];
        // Un import DE VERDAD frente a uno que vive dentro de un sabotaje: los
        // sabotajes llevan el patrón malo dentro de una cadena, porque su trabajo
        // es escribirlo. Se distinguen contando las comillas dobles que hay antes
        // en la misma línea: número impar significa que estamos dentro de una.
        //
        // Quitar todas las cadenas antes de mirar no vale: la ruta del import ES
        // una cadena, y borrándola se deja de ver el import entero. Lo comprobé
        // haciéndolo mal: la invariante pasó a no detectar nada.
        for (const m of texto.matchAll(/await import\('\.\.\/\.\.\/((?:app|comun)\/[^']+)'\)/g)) {
          const linea = texto.slice(texto.lastIndexOf('\n', m.index) + 1, m.index);
          if ((linea.match(/"/g) || []).length % 2 === 1) continue;
          const archivo = m[1].split('/').pop().split('?')[0];
          if (TABLAS.includes(archivo)) continue;
          fallos.push(
            `${ruta} importa «${m[1]}» directamente. Lo que se vigila entra por ctx.fn, ` +
              'o el sabotaje no lo alcanza y la invariante sale ciega.',
          );
        }
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'auditoria/invariantes/datos.mjs', (t) =>
        t.replace(
          'const { sanear, claveClip, claveFotograma } = ctx.fn;',
          "const { sanear } = await import('../../app/estado.js');",
        ),
      ),
  },

  {
    nombre: 'un-tropiezo-de-red-no-se-lleva-por-delante-lo-que-se-estaba-generando',
    dice: '«Can\'t find variable: esperar». La función que espera entre reintentos se llamaba en dos sitios y no estaba escrita en ninguno, y esos dos sitios eran justo el corte de red y la respuesta que no es JSON. Así que cada tropiezo de red, en vez de esperar medio segundo y reintentar, reventaba con un mensaje que no quiere decir nada y se llevaba la tanda por delante. Desde un móvil eso no es raro: es lo normal.',
    async comprobar(ctx) {
      const { humoDeLaPuerta } = await import('../api-humo.mjs');
      // Si la auditoría trae la puerta saboteada, se recorre ESA. Sin esto la
      // prueba se haría siempre sobre el archivo bueno y saldría «ciega».
      const enContexto = ctx.fuentes.get('app/api.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/api.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;

      const { fallos } = await humoDeLaPuerta({ parche });
      return fallos;
    },
    // Se rompe como estaba: sin la función que espera entre reintentos.
    romper: (ctx) =>
      editando(ctx, 'app/api.js', (t) =>
        t.replace(/^const esperar = .*$/m, '// (quitada a propósito)'),
      ),
  },

  {
    nombre: 'una-peticion-que-no-vuelve-se-corta-en-vez-de-colgar-la-tanda',
    dice: '«De repente el mensaje dice como que se está generando, pero no se genera nada. Pasa media hora y no se generó nada.» `fetch` NO TIENE TIEMPO DE ESPERA. Si la petición sale y la respuesta no vuelve nunca —red móvil que cambia de celda, una conexión a medias, un socket que nadie cierra—, el `await` se queda ahí para siempre: no lanza, no reintenta, no avisa. La cola se para en esa unidad y el cartel dice «generando» hasta que alguien recarga la página. Con un tope, eso es un tropiezo de red más y el reintento de siempre lo arregla.',
    async comprobar(ctx) {
      const { humoDeLaPuerta } = await import('../api-humo.mjs');
      const enContexto = ctx.fuentes.get('app/api.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/api.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;
      const fallos = [];

      // El arnés recorre dos caminos con una petición QUE NO VUELVE NUNCA: uno que
      // luego sí contesta —tiene que salir bien, reintentando— y otro que no
      // contesta jamás —tiene que rendirse con una frase—. Sin tope, los dos se
      // quedan colgados y el arnés lo dice.
      const r = await humoDeLaPuerta({ parche });
      fallos.push(...r.fallos.filter((f) => /cuelga|colgad/i.test(f)));

      // ── Y EL TOPE SALE DE LO QUE AGUANTA LA PLATAFORMA, no de un número suelto.
      //
      // `maxDuration` en `vercel.json` es lo que la función puede durar antes de
      // que Vercel la mate — 60 s es el techo del plan gratuito; el de pago llega a
      // 300. El tope del navegador tiene que ir POR ENCIMA de eso con margen: por
      // debajo cortaría llamadas buenas que la plataforma todavía está sirviendo, y
      // si `maxDuration` sube y este número se queda atrás, se cortarían en
      // silencio justo las generaciones más largas.
      const api = ctx.fuentes.get('app/api.js') || '';
      const declarado = Number(/const MAX_DURACION_FUNCION = (\d+)/.exec(api)?.[1] || 0);
      const conf = JSON.parse(ctx.fuentes.get('vercel.json') || '{}');
      const real = Number(conf?.functions?.['api/ia.js']?.maxDuration || 0) * 1000;
      if (!real) fallos.push('`vercel.json` no declara cuánto puede durar la función: la plataforma la mataría a los diez segundos.');
      else if (declarado !== real) {
        fallos.push(
          `La puerta cree que la función dura ${declarado / 1000} s y \`vercel.json\` dice ${real / 1000} s. ` +
            'Con el número desfasado se cortan llamadas buenas o se espera de más.',
        );
      }
      const tope = Number(/const TOPE_DE_PETICION = MAX_DURACION_FUNCION \* (\d+)/.exec(api)?.[1] || 0) * declarado;
      if (!(tope > real)) {
        fallos.push(`El tope de una petición (${tope} ms) no supera lo que dura la función (${real} ms): se cortarían llamadas buenas.`);
      }
      // El reloj se suelta SIEMPRE. Sin esto, una tanda de 141 imágenes deja 141
      // temporizadores vivos esperando para abortar peticiones que ya terminaron.
      if (!/finally \{\s*reloj\.soltar\(\);/.test(api)) {
        fallos.push('El temporizador del tope no se suelta al terminar la petición: se acumulan uno por llamada.');
      }

      // ── NINGUNA PUERTA SE QUEDA SIN TOPE, Y ESTA ES LA REGLA QUE FALTABA ────
      //
      // Le puse tope a la petición grande y me dejé la consulta al almacén, que
      // corre JUSTO DESPUÉS y por el mismo cable. Media hora colgado. Un tope que
      // cubre una de las dos puertas no es un tope, así que se cuentan: cada
      // `fetch` a la puerta tiene que llevar una señal con reloj, no la de fuera.
      const conSenalPelada = [...api.matchAll(/fetch\(PUERTA[\s\S]{0,600}?signal:\s*([\w.]+)/g)]
        .map((m) => m[1])
        .filter((x) => x !== 'reloj.signal');
      if (conSenalPelada.length) {
        fallos.push(
          `Hay ${conSenalPelada.length} llamada(s) a la puerta con la señal pelada (${conSenalPelada.join(', ')}): ` +
            'sin reloj propio, si esa se cuelga se cuelga todo y sin decir nada.',
        );
      }

      // Y EL TOPE CUBRE LA CONVERSACIÓN ENTERA, no solo las cabeceras. Leer el
      // cuerpo iba después del `finally`, o sea con el reloj ya soltado: una
      // respuesta cuyo cuerpo no termina —lo normal en una red móvil que cambia de
      // celda— se colgaba igual, con el tope puesto y sin servir de nada.
      const fin = api.indexOf('finally {\n      reloj.soltar();');
      const inicio = api.indexOf('const reloj = conTope(senal, tope);');
      const leeCuerpo = api.indexOf('cuerpo = await r.json();');
      if (!(inicio >= 0 && leeCuerpo > inicio && fin > leeCuerpo)) {
        fallos.push('El cuerpo de la respuesta se lee con el reloj ya soltado: un cuerpo que no termina cuelga igual.');
      }
      // Y abortar leyendo el cuerpo NO puede confundirse con «esto no era JSON»:
      // sería tratar un cuelgue como una respuesta rara y seguir adelante.
      if (!/if \(e\?\.name === 'AbortError'\) throw e;/.test(api)) {
        fallos.push('Un cuelgue leyendo el cuerpo se toma por una respuesta que no es JSON.');
      }

      // Y NINGUNA ESPERA DE UNA SENTADA PUEDE SER ETERNA: una cuota diaria puede
      // contestar «vuelve dentro de 40.000 segundos», y eso es once horas quieto
      // con un cartel puesto.
      const techo = Number(/const TECHO_DE_ESPERA = (\d+)/.exec(api)?.[1] || 0);
      if (!(techo > 0 && techo <= 300000)) {
        fallos.push(`Una sola espera puede durar ${techo || 'lo que diga el proveedor'}: sin techo, «retry-after» duerme la tanda horas.`);
      }
      if (!/Math\.min\(Number\(r\.headers\.get\('retry-after'\)\) \* 1000 \|\| 0, TECHO_DE_ESPERA\)/.test(api)) {
        fallos.push('El «retry-after» del proveedor se obedece sin techo.');
      }
      // Y detenerse a mano tiene que seguir distinguiéndose de agotarse el tiempo:
      // los dos abortan, pero uno es una decisión y el otro una avería.
      if (!/if \(senal\?\.aborted\) throw new ErrorPuerta\('Detenido\.'\)/.test(api)) {
        fallos.push('Un tiempo agotado se confundiría con haber pulsado Detener.');
      }
      return fallos;
    },
    // Se rompe como estaba: sin tope, la señal de fuera y punto.
    romper: (ctx) =>
      editando(ctx, 'app/api.js', (t) =>
        t.replace('const reloj = conTope(senal, tope);', 'const reloj = { signal: senal, soltar: () => {} };'),
      ),
  },

  {
    nombre: 'todas-las-puertas-del-proveedor-se-pueden-llamar',
    dice: 'La generación de imágenes nunca funcionó: la variable se llamaba «partes» y la petición decía «parts». Setenta y seis invariantes no lo cazaron porque todas MIRAN el código, y un identificador mal escrito se ve igual de bien que uno correcto. Lo único que lo caza es llamar a la función.',
    async comprobar(ctx) {
      const { humoDelProveedor } = await import('../humo.mjs');
      // Si la auditoría trae el proveedor saboteado, se prueba ESE. Sin esto la
      // prueba de humo se llamaba siempre sobre el archivo bueno y salía «ciega»:
      // una prueba que no puede fallar no está probando nada (§9).
      const enElContexto = ctx.fuentes.get('api/_lib/proveedor.js');
      const enDisco = readFileSync(join(ctx.raiz, 'api/_lib/proveedor.js'), 'utf8');
      const parche = enElContexto !== enDisco ? () => enElContexto : null;

      const { fallos, salidas } = await humoDelProveedor({ parche });
      const problemas = [...fallos];

      // Y ya que se llama, se mira QUÉ se pidió: que no reviente no basta si lo
      // que sale es una petición vacía.
      const imagen = salidas.find((s) => /IMAGE/.test(JSON.stringify(s.cuerpo?.generationConfig || {})));
      if (!imagen) problemas.push('La llamada de imagen no llegó a componerse.');
      else {
        const partes = imagen.cuerpo?.contents?.[0]?.parts || [];
        if (!partes.length) problemas.push('La petición de imagen sale sin contenido.');
        if (!partes.some((p) => p.text)) problemas.push('La petición de imagen sale sin instrucción.');
      }
      const conRef = salidas.find((s) =>
        (s.cuerpo?.contents?.[0]?.parts || []).some((p) => p.inlineData),
      );
      if (!conRef) problemas.push('Las imágenes de referencia no llegan a la petición.');

      const clip = salidas.find((s) => s.url.includes('predictLongRunning'));
      if (!clip) problemas.push('La llamada de clip no llegó a componerse.');
      else if (!clip.cuerpo?.parameters?.storageUri) {
        problemas.push('El clip se pide sin storageUri: volvería en base64 y no cabría.');
      }
      return problemas;
    },
    romper: (ctx) =>
      editando(ctx, 'api/_lib/proveedor.js', (t) => t.replace('parts: partes', 'parts')),
  },

  {
    nombre: 'una-sola-funcion-compone-la-direccion-de-un-modelo',
    dice: 'Solo un sitio compone la URL de un modelo. Había dos —el proveedor y el diagnóstico—, se arregló la región en uno, y el diagnóstico salió en rojo diciendo que el modelo no existía mientras el proveedor ya lo pedía bien.',
    comprobar(ctx) {
      const fallos = [];
      for (const [ruta, texto] of ctx.fuentes) {
        // El único que puede nombrar el host es quien decide la región. Y el único
        // que puede montar la ruta `/publishers/google/models/` es el proveedor.
        if (ruta.startsWith('auditoria/')) continue;
        if (/aiplatform\.googleapis\.com/.test(texto) && ruta !== 'comun/modelos.mjs') {
          fallos.push(`${ruta} nombra el host de Vertex: la región tiene que salir de un solo sitio.`);
        }
        if (/publishers\/google\/models/.test(texto) && ruta !== 'api/_lib/proveedor.js') {
          fallos.push(`${ruta} compone la ruta de un modelo por su cuenta.`);
        }
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'api/_lib/salud.js', (t) =>
        t.replace(
          '`${rutaDeModelo(id)}:generateContent`',
          '`https://us-central1-aiplatform.googleapis.com/v1/publishers/google/models/${id}:generateContent`',
        ),
      ),
  },

  {
    nombre: 'el-clip-no-vuelve-dentro-de-la-respuesta',
    dice: 'Veo tiene que escribir el clip en el almacén, no devolverlo en base64: un clip de ocho segundos a 1080p no cabe en los 4,5 MB de la función (§7.1). Sin storageUri, la fase de clips no funciona.',
    comprobar(ctx) {
      const prov = fuente(ctx, 'api/_lib/proveedor.js');
      const ia = fuente(ctx, 'api/ia.js');
      const mov = fuente(ctx, 'app/fases/movimiento.js');
      const fallos = [];

      // Se busca la ASIGNACIÓN, no la palabra: el comentario que explica por qué
      // hace falta storageUri contiene «storageUri», así que buscar la palabra
      // daba por bueno un archivo al que se le había quitado la línea.
      if (!/storageUri: carpetaGs/.test(prov)) {
        fallos.push('El arranque de video no pide storageUri: el clip volvería en base64.');
      }
      if (!/carpetaGs: c\.guardarEn/.test(ia)) {
        fallos.push('La puerta no le dice a Veo dónde escribir.');
      }
      // Y la carpeta sale de la clave, así que el navegador tiene que mandarla YA
      // al arrancar, no solo al consultar.
      const i = mov.indexOf("'video.iniciar'");
      if (i < 0 || !/guardarEn/.test(mov.slice(i, i + 700))) {
        fallos.push('El arranque del clip no manda la clave: sin ella no hay carpeta donde escribir.');
      }
      // Y al terminar, el clip se copia a su clave sin pasar por la función.
      if (!/copiarDesdeGs/.test(ia)) fallos.push('El clip no se lleva a su clave definitiva.');
      if (!/rewriteTo/.test(fuente(ctx, 'api/_lib/almacen.js'))) {
        fallos.push('La copia atraviesa la función en vez de hacerla el almacén.');
      }
      return fallos;
    },
    // Se rompe quitando storageUri: es exactamente el estado en el que el clip
    // vuelve en base64 y no cabe en la respuesta.
    romper: (ctx) =>
      editando(ctx, 'api/_lib/proveedor.js', (t) =>
        t.replace('...(carpetaGs ? { storageUri: carpetaGs } : {}),', ''),
      ),
  },

  {
    nombre: 'la-peticion-de-imagen-encaja-con-su-familia',
    dice: 'La familia 3 exige responseModalities ["TEXT","IMAGE"] y acepta imageSize; el 2.5 solo acepta ["IMAGE"] y rechaza imageSize. Con el valor equivocado la petición falla y el error no dice por qué.',
    comprobar(ctx) {
      const { modalidadesDe, admiteTamanoImagen } = ctx.fn;
      const fallos = [];

      // Y la petición tiene que PREGUNTARLO, no llevar un valor fijo: con un
      // literal, media familia de generadores falla y el error no dice por qué.
      const src = fuente(ctx, 'api/_lib/proveedor.js');
      if (!/responseModalities: modalidadesDe\(id\)/.test(src)) {
        fallos.push('Las modalidades de la petición de imagen están fijas en vez de salir del modelo.');
      }
      if (!/admiteTamanoImagen\(id\)/.test(src)) {
        fallos.push('El tamaño de imagen se manda sin mirar si el modelo lo acepta.');
      }

      if (modalidadesDe('gemini-3-pro-image').join() !== 'TEXT,IMAGE') {
        fallos.push('A la familia 3 no se le piden las dos modalidades.');
      }
      if (modalidadesDe('gemini-2.5-flash-image').join() !== 'IMAGE') {
        fallos.push('Al 2.5 se le piden modalidades que no acepta.');
      }
      if (!admiteTamanoImagen('gemini-3.1-flash-image') || admiteTamanoImagen('gemini-2.5-flash-image')) {
        fallos.push('El tamaño de imagen se manda a quien no lo acepta, o no a quien sí.');
      }

      // Y el texto va ANTES que las referencias.
      const prov = fuente(ctx, 'api/_lib/proveedor.js');
      const i = prov.indexOf('const partes = [');
      const bloque = prov.slice(i, prov.indexOf('];', i));
      if (bloque.indexOf('text: instruccion') > bloque.indexOf('inlineData')) {
        fallos.push('Las referencias van antes que la instrucción: es al revés.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'api/_lib/proveedor.js', (t) =>
        t.replace('responseModalities: modalidadesDe(id),', "responseModalities: ['IMAGE'],"),
      ),
  },

  {
    nombre: 'la-duracion-del-clip-es-de-las-que-el-modelo-acepta',
    dice: 'Las duraciones son listas CERRADAS y distintas por generador —Veo 2 admite 5 y 7, los 3.1 no—. Pedir una que no está no se redondea solo: se rechaza la petición. Y en un empate se coge la mayor, porque sobrar se recorta y faltar se ve congelado.',
    comprobar(ctx) {
      const { duracionValida } = ctx.fn;
      const fallos = [];
      const casos = [
        ['veo-3.1-fast', 5, 6],
        ['veo-3.1-fast', 6, 6],
        ['veo-3.1-lite', 7, 8],
        ['veo-3.1', 20, 8],
        ['veo-2', 5, 5],
        ['veo-2', 7, 7],
      ];
      for (const [clave, pide, esperado] of casos) {
        const sale = duracionValida(clave, pide);
        if (sale !== esperado) fallos.push(`Para ${pide} s en ${clave} sale ${sale} y debería ser ${esperado}.`);
      }
      return fallos;
    },
    // Se rompe como se rompería de verdad: olvidando que cada generador tiene su
    // lista y usando la de los 3.1 para todos.
    romper: (ctx) =>
      conFuncion(ctx, 'duracionValida', (_clave, segundos) =>
        [4, 6, 8].reduce((a, b) => (Math.abs(b - segundos) < Math.abs(a - segundos) ? b : a)),
      ),
  },

  {
    nombre: 'cada-generador-sale-una-sola-vez',
    dice: 'Dos filas del catálogo no pueden llamarse igual ni compartir un identificador. El desplegable de clips enseñaba «Veo 3.1 Fast» dos veces porque Vertex publica el mismo modelo con dos grafías y las dos entraban como opciones distintas.',
    comprobar(ctx) {
      const fallos = [];
      const idsVistos = new Map();

      for (const [familia, filas] of Object.entries(ctx.catalogo)) {
        const claves = new Set();
        const etiquetas = new Set();
        for (const f of filas) {
          if (claves.has(f.clave)) fallos.push(`En «${familia}» la clave «${f.clave}» sale dos veces.`);
          claves.add(f.clave);
          if (etiquetas.has(f.etiqueta)) {
            fallos.push(`En «${familia}» la etiqueta «${f.etiqueta}» sale dos veces: son dos filas indistinguibles en pantalla.`);
          }
          etiquetas.add(f.etiqueta);
          if (!f.ids?.length) fallos.push(`«${f.clave}» no tiene ninguna grafía con la que llamarlo.`);
          for (const id of f.ids || []) {
            // La misma grafía en dos filas significa que una de las dos cobra lo
            // que no es: el usuario cree elegir Lite y paga la cara.
            if (idsVistos.has(id)) {
              fallos.push(`El identificador «${id}» está en «${idsVistos.get(id)}» y en «${f.clave}».`);
            }
            idsVistos.set(id, f.clave);
          }
        }
      }
      return fallos;
    },
    // Se rompe duplicando una grafía entre dos filas: es exactamente el fallo que
    // hizo salir «Veo 3.1 Fast» dos veces en el desplegable.
    romper: (ctx) =>
      conCatalogo(ctx, (c) => {
        c.video[2].ids = [...c.video[1].ids];
      }),
  },

  {
    nombre: 'el-catalogo-no-se-sondea',
    dice: 'Los generadores salen de la tabla, no de preguntarle a la nube. Sondear enseñaba grafías en vez de generadores: salía UN generador de imagen habiendo tres, y los de video salían repetidos.',
    comprobar(ctx) {
      const prov = fuente(ctx, 'api/_lib/proveedor.js');
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      if (/probarCandidatos|const CANDIDATOS\s*=/.test(prov)) {
        fallos.push('Ha vuelto el sondeo de modelos.');
      }
      // Y el catálogo tiene que entregarse sin pedir un token: si vuelve a haber
      // una llamada a la nube, los ajustes vuelven a tardar y a fallar solos.
      const i = prov.indexOf('export function modelosDisponibles');
      if (i < 0) fallos.push('No se entrega el catálogo.');
      else {
        const cuerpo = prov.slice(i, prov.indexOf('\n}', i));
        if (/await|fetch\(/.test(cuerpo)) fallos.push('Entregar el catálogo llama a la nube.');
        if (!/CATALOGO/.test(cuerpo)) fallos.push('El catálogo entregado no sale de la tabla.');
      }
      // La pantalla tampoco puede reordenar ni filtrar: el orden de la tabla es el
      // orden en que se decide, de más barato a más caro.
      if (/ordenarFamilia|equilibradoDe|mejorModeloTexto/.test(main)) {
        fallos.push('La pantalla reordena el catálogo en vez de enseñarlo tal cual.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'api/_lib/proveedor.js', (t) =>
        t.replace('export function modelosDisponibles() {', 'export function modelosDisponibles() {\n  await fetch(base());'),
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
        // CON LOS DOS PUNTOS, igual que el contador de abajo: es el PARÁMETRO lo
        // que marca una subida. Con la palabra suelta, un comentario que cita
        // `guardarEnArchivo` metía en la lista un archivo que no sube nada, y la
        // invariante fallaba señalando a quien no era.
        if (!/guardarEn:|'subir',/.test(texto)) continue;
        // Se exige que LANCE cuando el almacén no confirma. Que el texto mencione
        // `guardado.bytes` en algún sitio no prueba nada: la fase de imagen lo
        // nombraba en el valor de retorno y la comprobación pasaba con la guarda
        // borrada. Lo cazó `--romper`.
        // Y se cuentan: UNA guarda para tres subidas deja dos sin mirar. Con solo
        // «hay al menos una», borrar la primera dejaba pasar el archivo entero
        // porque las otras seguían ahí. Lo cazó `--romper`, otra vez.
        // `guardarEn` en un arranque de video NO es una subida: le dice a Veo dónde
        // escribir, y quien confirma es la consulta posterior. Contarlo pedía una
        // guarda para algo que todavía no ha escrito nada.
        const subidas =
          (texto.match(/guardarEn:|'subir',/g) || []).length -
          (texto.match(/'video\.iniciar'/g) || []).length;
        const guardas = (texto.match(/if \(!\w+\.guardado\?\.bytes\)/g) || []).length;
        if (!guardas) {
          fallos.push(`${ruta} sube material y no lanza si el almacén no lo confirma.`);
        } else if (guardas < subidas) {
          fallos.push(`${ruta} tiene ${subidas} subidas y solo ${guardas} comprobadas.`);
        }
        if (!/if \(!\w+\.guardado\?\.bytes\)[\s\S]{0,200}?throw new Error/.test(texto)) {
          fallos.push(`${ruta} mira si el almacén confirmó, pero no lanza cuando no.`);
        }
      }
      return fallos;
    },
    // Se anulan TODAS las guardas, no solo la primera: borrar una sola dejaba el
    // archivo pasando por las otras.
    romper: (ctx) =>
      editando(ctx, 'app/fases/imagen.js', (t) =>
        t.replace(/if \(!\w+\.guardado\?\.bytes\)/g, 'if (false)'),
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
      // Que filtra y que deduplica se comprueba EJECUTÁNDOLO, más abajo: mirar si
      // el texto dice `.filter(` daba por buena cualquier forma de escribirlo y se
      // rompía al cambiar el bucle, sin que el comportamiento cambiara en nada.
      // La región tiene que estar DENTRO de la etiqueta, no solo declarada en algún
      // sitio del archivo: dos voces distintas se ven idénticas en el desplegable si
      // la etiqueta es solo el nombre (§7.10).
      // §7.10: dos voces distintas no pueden verse idénticas en el desplegable. Lo
      // que hace falta es que CADA etiqueta lleve algo que la distinga además del
      // nombre —la región en las de Cloud, la familia en las de Gemini, que no
      // tienen región porque hablan el idioma del texto—. Antes esto exigía la
      // región en todas y saltaba en falso al añadir la segunda familia.
      // SOLO LAS LÍNEAS DE CÓDIGO, no la prosa. El comentario que explica este
      // mismo fallo contiene «en la etiqueta:», y la comprobación se cazaba a sí
      // misma: para que pasara habría que borrar la explicación. Es la tercera vez
      // que un `matchAll` sobre una palabra suelta hace esto.
      const etiquetas = [...t.matchAll(/^\s+etiqueta:/gm)].map((m) => t.slice(m.index, m.index + 170));
      if (!etiquetas.length) fallos.push('No se encontró ninguna etiqueta de voz.');
      for (const e of etiquetas) {
        if (!/REGIONES\w*\[|\$\{region\}|Gemini/.test(e)) {
          fallos.push(`Una etiqueta de voz no lleva nada que la distinga: ${e.split('\n')[0].slice(0, 50)}`);
        }
      }
      // TODAS LAS DE ESPAÑOL, latinas y de España. «Ahora sí quiero que dejes
      // voces latinas y voces de español de España también.» España estuvo fuera
      // con un argumento que sonaba técnico y no lo era: dentro de un episodio
      // narra UNA voz, siempre, así que mezclar acentos nunca fue el riesgo.
      if (!/REGIONES_DE_VOZ/.test(t)) {
        fallos.push('No hay una lista explícita de las regiones que valen.');
      }
      for (const [qué, re] of [
        ['España', /'es-ES'/],
        ['México', /'es-MX'/],
        ['el latino general', /'es-419'/],
      ]) {
        if (!re.test(t)) fallos.push(`El catálogo de voces deja fuera ${qué}: se ofrecen menos voces de las que hay.`);
      }
      // Y la región tiene que seguir SALIENDO en la etiqueta: ahora más que antes,
      // porque con España dentro hay dos acentos en la misma lista y elegir a
      // ciegas sería elegir el acento por accidente.
      if (!/España/.test(t)) {
        fallos.push('La región de España no tiene nombre legible: en el desplegable no se sabría cuál es cuál.');
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
      if (!/ssmlGender !== genero/.test(t) && !/ssmlGender === genero/.test(t)) {
        fallos.push('El filtro de género no se aplica a las voces de Cloud TTS.');
      }
      // Y las de Gemini tienen que traer su género: la API no lo devuelve para
      // ellas, así que si la tabla no lo lleva, el filtro no las toca.
      if (!/'MALE'\]/.test(t) || !/'FEMALE'\]/.test(t)) {
        fallos.push('La tabla de voces de Gemini no declara el género de cada voz.');
      }
      // ── Y AHORA EJECUTÁNDOLO ──────────────────────────────────────────────
      //
      // «Sale una lista grande de un montón de voces y la mayoría están repetidas,
      //  tanto en las españolas como en las latinas.»
      //
      // Era verdad y no se veía leyendo el código: `es-US` y `es-419` se rotulaban
      // los dos «Latino», el servicio publica casi el mismo elenco bajo ambos, y el
      // género iba en todas las filas siendo el mismo en todas. Cada voz salía dos
      // veces con una etiqueta idéntica.
      const catalogo = ctx.fn.catalogoDeVoces;
      if (typeof catalogo !== 'function') fallos.push('El catálogo de voces no se puede ejecutar.');
      else {
        const crudas = [];
        for (const [loc, caras] of [
          ['es-US', ['Standard-B', 'Neural2-B', 'Wavenet-B', 'News-D']],
          ['es-419', ['Standard-B', 'Neural2-B', 'Wavenet-B']],
          ['es-MX', ['Standard-B', 'Neural2-B']],
          ['es-ES', ['Standard-B', 'Neural2-B', 'Polyglot-1']],
        ]) {
          for (const c of caras) crudas.push({ name: `${loc}-${c}`, languageCodes: [loc], ssmlGender: 'MALE' });
        }
        const lista = catalogo(crudas, {});

        // NINGUNA ETIQUETA REPETIDA. Es la regla entera: dos filas que dicen lo
        // mismo son una lista en la que no se puede elegir.
        const etiquetas = lista.map((v) => v.etiqueta);
        if (new Set(etiquetas).size !== etiquetas.length) {
          const rep = etiquetas.filter((e, i) => etiquetas.indexOf(e) !== i);
          fallos.push(`Hay ${rep.length} etiquetas repetidas en el catálogo de voces: «${rep[0]}».`);
        }
        // NI DOS VECES LA MISMA CARA EN LA MISMA REGIÓN: `es-US-Neural2-B` y
        // `es-419-Neural2-B` son «Latino» las dos, o sea la misma voz para quien elige.
        if (lista.filter((v) => /Latino/.test(v.etiqueta)).length !== 4) {
          fallos.push(`Las latinas salen ${lista.filter((v) => /Latino/.test(v.etiqueta)).length} veces en vez de 4: es-US y es-419 se duplican.`);
        }
        // Y NO SE PIERDE NINGUNA REGIÓN por deduplicar de más.
        for (const donde of ['España', 'México', 'Latino']) {
          if (!etiquetas.some((e) => e.includes(donde))) fallos.push(`Deduplicar se ha llevado por delante ${donde}.`);
        }
        // El género constante NO va en la etiqueta: con el catálogo filtrado a
        // masculina, ponerlo en todas las filas no distinguía nada.
        if (etiquetas.some((e) => /masculina/.test(e))) {
          fallos.push('La etiqueta repite el género en todas las filas: alarga y no distingue.');
        }
        // Sin filtro de género sí, porque entonces sí distingue.
        const mixto = catalogo(
          [
            { name: 'es-ES-Standard-A', languageCodes: ['es-ES'], ssmlGender: 'FEMALE' },
            { name: 'es-ES-Standard-B', languageCodes: ['es-ES'], ssmlGender: 'MALE' },
          ],
          { genero: '' },
        );
        if (!mixto.every((v) => /masculina|femenina/.test(v.etiqueta))) {
          fallos.push('Con voces de los dos géneros, la etiqueta no dice cuál es cuál.');
        }
      }
      return fallos;
    },
    // El sabotaje quita la región de la etiqueta, que es justo lo que esta
    // invariante guarda. El de antes buscaba una plantilla en una sola línea y dejó
    // de encajar al reformatear: lo marcó `--romper` como ciega.
    romper: (ctx) =>
      conFuncion(ctx, 'catalogoDeVoces', (voces, o) =>
        // Como estaba: una fila por voz, con la región fuera de la etiqueta. Las
        // latinas vuelven a salir dos veces diciendo exactamente lo mismo.
        (voces || [])
          .filter((v) => v.name.startsWith('es-'))
          .map((v) => ({
            nombre: v.name,
            region: v.languageCodes?.[0] || '',
            genero: 'masculina',
            expresiva: false,
            etiqueta: v.name.split('-').slice(2).join('-'),
          })),
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

      // UN 429 EN EL DIAGNÓSTICO NO ES «SIN CUOTA».
      //
      // «¿Cómo se supone que la cuota va a ser cero si ya generó un capítulo
      //  entero?» La petición de prueba va VACÍA a propósito —no genera ni una
      //  imagen— así que no puede gastar cuota de imágenes: un 429 ahí es el
      //  limitador de ritmo, que es justo lo que salta después de generar noventa
      //  y siete seguidas. El diagnóstico decía «la cuota está agotada» y mandaba a
      //  pedir cuota, o sea, a arreglar lo que no estaba roto. Ahora lee lo que
      //  dice Google en vez de suponerlo.
      // Desde el 429 HACIA DELANTE: buscar el 403 desde el principio del archivo
      // devolvía una posición anterior y la ventana salía vacía, así que las tres
      // comprobaciones de abajo fallaban con el texto delante.
      const i429 = s.indexOf('r.status === 429');
      const cuota = i429 < 0 ? '' : s.slice(i429, s.indexOf('r.status === 403', i429));
      for (const [que, senal] of [
        ['distinguir el tope por minuto del diario', /per minute/],
        ['que el tope por minuto se pasa solo', /se abre solo|se pasa solo/],
        ['que haber generado ya demuestra que hay cuota', /si ya has generado/i],
      ]) {
        if (!senal.test(cuota)) fallos.push(`El diagnóstico del generador de imágenes no dice ${que}.`);
      }
      // Y no puede seguir afirmando que la cuota está agotada sin mirar el mensaje.
      if (/`La cuota del generador de im[aá]genes est[aá] agotada/.test(cuota)) {
        fallos.push('El diagnóstico afirma que la cuota está agotada sin leer lo que dice Google.');
      }

      // Y UN NOMBRE QUE NO SE ENCUENTRA SE DICE ENTERO.
      //
      // «¿Cómo va a saber mi cuenta lo del montador, si ese montador era de otra
      //  cuenta de Google diferente?» El diagnóstico decía «no está desplegado con
      //  ese nombre» y «revisa CLOUD_RUN_JOB», sin decir NUNCA qué nombre buscaba
      //  ni en qué proyecto. Desde un teléfono eso no se puede comprobar: hay que
      //  poder leer el job, el proyecto y la región de un vistazo, y que se puede
      //  cambiar el nombre. Un diagnóstico que no dice qué buscó obliga a leer el
      //  código, y el código no se lee desde un móvil.
      // Desde el rótulo de su sección: anclarlo en la URL empezaba DESPUÉS de la
      // línea que compone el mensaje, así que la comprobación miraba donde no era.
      const bloque = s.slice(s.indexOf('5. El montador'));
      for (const [que, senal] of [
        ['el nombre del job que busca', /\$\{job\}/],
        // Y DE DÓNDE SALE ESE NOMBRE. El censor borra el id del proyecto de toda
        // respuesta, y el nombre por defecto lo lleva dentro: en pantalla se leía
        // «[oculto]-montador» y con eso no se sabe qué job crear. Decir si es el
        // de por defecto o el de una variable sí sobrevive al censor.
        ['de dónde sale el nombre', /de por defecto|pusiste en/],
        // Y NO LO ESCRIBE PARA QUE EL CENSOR LO TAPE. El nombre por defecto empieza
        // por el id del proyecto, así que citarlo da «[oculto]-montador» y no
        // informa de nada: se dice dónde está escrito, no cuál es.
        ['dónde está escrito el nombre por defecto', /escrito en el README/],
        ['que el hueco lo pone el censor y no es un fallo', /tapado a prop[oó]sito/],
        ['en qué región lo busca', /regi[oó]n \$\{region\}|regi[oó]n \$\{regionJob|\$\{region\}`/],
        ['que el montador vive en la nube del usuario', /vive en TU Google Cloud/],
        ['cómo cambiar el nombre', /nombrePrincipal\('job'\)/],
      ]) {
        if (!senal.test(bloque)) fallos.push(`El diagnóstico del montador no dice ${que}.`);
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
    nombre: 'una-eleccion-automatica-vieja-no-clava-el-modelo',
    dice: 'Una elección que hizo la herramienta —no la persona— no puede sobrevivir a un catálogo nuevo. El director se quedó clavado en Gemini 2.5 Pro con el 3.1 Pro ya en la lista: §7.2, el arreglo tapado por un valor guardado.',
    async comprobar(ctx) {
      // `normalizar` entra por el contexto para poder sustituirla por una averiada:
      // importándola aquí, el sabotaje no la tocaba y la invariante salía ciega.
      const { normalizar } = ctx.fn;
      const { PREDETERMINADO } = await import('../../comun/modelos.mjs');
      const fallos = [];

      // Lo que había guardado de verdad antes del catálogo.
      const viejo = normalizar({
        texto: { modelo: 'gemini-2.5-pro', aMano: false },
        imagenModelo: { modelo: 'gemini-2.5-flash-image', aMano: false },
        videoModelo: { modelo: 'veo-3.1-fast-generate-preview', aMano: false },
      });
      for (const [campo, familia] of [
        ['texto', 'texto'],
        ['imagenModelo', 'imagen'],
        ['videoModelo', 'video'],
      ]) {
        if (viejo[campo].modelo !== PREDETERMINADO[familia]) {
          fallos.push(
            `Una elección automática vieja de «${familia}» sobrevive: queda ${viejo[campo].modelo}.`,
          );
        }
      }

      // Pero una elección DE LA PERSONA se respeta, aunque sea vieja y aunque
      // estuviera guardada como identificador de Vertex.
      const suyo = normalizar({
        texto: { modelo: 'gemini-2.5-pro', aMano: true },
        imagenModelo: { modelo: 'gemini-3-pro-image-preview', aMano: true },
      });
      if (suyo.texto.modelo !== 'gemini-2.5-pro') {
        fallos.push('Una elección hecha a mano se pierde al actualizar.');
      }
      if (suyo.imagenModelo.modelo !== 'nano-banana-pro') {
        fallos.push(
          `Una elección guardada como identificador de Vertex no se traduce: queda ${suyo.imagenModelo.modelo}.`,
        );
      }

      // Y las referencias de imagen se miran contra las grafías, no contra la
      // clave: si se miran contra la clave, se apagan solas y con ellas la
      // coherencia de personas y lugares entre tomas (§4.6).
      if (!viejo.imagen.aceptaReferencias) {
        fallos.push('Con un Nano Banana elegido, la imagen dice que no acepta referencias.');
      }
      return fallos;
    },
    // Se rompe como estaba roto: sin mirar `aMano`, la elección automática vieja
    // sobrevive y tapa el catálogo nuevo.
    romper: (ctx) =>
      conFuncion(ctx, 'normalizar', (cruda) => {
        const c = ctx.fn.normalizar(cruda);
        if (cruda?.texto?.modelo) c.texto = { modelo: cruda.texto.modelo };
        return c;
      }),
  },

  {
    nombre: 'un-ajuste-viejo-no-puede-secuestrar-la-herramienta-de-hoy',
    dice: 'Hubo un modo «documentar» que investigaba casos reales, y la mudanza dejaba a propósito a los proyectos viejos dentro de él «para no estropear un documental terminado». El único proyecto que existía era viejo: la herramienta entera se quedó meses buscando casos en internet, escribiendo con la prohibición de inventar y pidiendo fuentes, sin manera de salir desde la pantalla. La lección no es que aquella mudanza estuviera mal escrita, es que un valor guardado no puede decidir qué hace la herramienta hoy. Todo resto de aquel modo se BORRA al cargar, y lo que ya no se elige se fuerza.',
    comprobar(ctx) {
      const { normalizar, GENERO_POR_DEFECTO } = ctx.fn;
      const fallos = [];

      // 1 · El proyecto que estuvo secuestrado: versión 3, en modo documentar y
      // con la barrera de §8.2 puesta. Al cargarlo hoy no queda ni rastro.
      const viejo = normalizar({
        version: 3,
        narracion: { velocidad: 0.96 },
        investigacion: { modo: 'documentar' },
        imagen: { prohibirFotorrealismoDePersonasReales: true },
      });
      if (viejo.investigacion.modo !== undefined) {
        fallos.push(
          `Un proyecto viejo sigue guardando el modo «${viejo.investigacion.modo}»: ` +
            'un ajuste muerto que ya secuestró la herramienta una vez.',
        );
      }
      if (viejo.imagen.prohibirFotorrealismoDePersonasReales !== false) {
        fallos.push(
          'Un proyecto viejo conserva la barrera de §8.2 encendida: rodaría de espaldas ' +
            'y en penumbra para proteger a personas reales que no existen.',
        );
      }

      // 2 · Y el proyecto nuevo trae lo de hoy.
      const nuevo = normalizar({});
      if (nuevo.investigacion.modo !== undefined) fallos.push('El modo de investigación ha vuelto a los valores de fábrica.');
      if (nuevo.imagen.prohibirFotorrealismoDePersonasReales !== false) {
        fallos.push('Un proyecto nuevo nace con la barrera de §8.2 puesta.');
      }
      if (nuevo.guion.minutos !== 30) fallos.push(`La duración objetivo por defecto es ${nuevo.guion.minutos} y no 30.`);

      // 3 · Idempotente. Normalizar dos veces tiene que dar lo mismo, o la limpieza
      // se aplicaría otra vez sobre lo ya limpio en cada carga.
      const dosVeces = normalizar(viejo);
      if (dosVeces.investigacion.modo !== undefined || dosVeces.version !== 4) {
        fallos.push('Normalizar dos veces no da lo mismo: la limpieza no es idempotente.');
      }

      // 4 · Y NORMALIZAR NO PUEDE ESCRIBIR EN LOS VALORES DE FÁBRICA.
      //
      // La mezcla era una copia superficial: una rama que el proyecto guardado no
      // mencionaba salía siendo el MISMO objeto que el de `PREDETERMINADA`, y
      // escribir ahí dentro mudaba la tabla de fábrica para toda la sesión. No se
      // veía porque hasta entonces todas las líneas escribían el mismo valor que ya
      // había. Se comprueba cargando un proyecto viejo y mirando qué le pasa al
      // siguiente proyecto NUEVO, que es exactamente como se manifestaba.
      normalizar({ version: 3, investigacion: { modo: 'documentar', exigirFichas: false } });
      const despues = normalizar({});
      if (despues.investigacion.exigirFichas !== true) {
        fallos.push(
          'Cargar un proyecto viejo deja sus ajustes clavados en los valores de fábrica: ' +
            'el siguiente proyecto nuevo nace con la configuración del anterior.',
        );
      }

      // 5 · El género se valida contra el catálogo y la proporción vieja se borra.
      if (normalizar({ genero: 'no-existe' }).genero !== GENERO_POR_DEFECTO) {
        fallos.push('Un género que ya no está en el catálogo no cae al predeterminado.');
      }
      if (normalizar({ version: 3, movimiento: { proporcion: 0.15 } }).movimiento.proporcion !== undefined) {
        fallos.push('La proporción de movimiento vieja sobrevive: un ajuste guardado que ya no lee nadie.');
      }
      return fallos;
    },
    // Se rompe como estaba: lo guardado manda, y el modo viejo sobrevive a la
    // carga con la barrera puesta detrás.
    romper: (ctx) =>
      conFuncion(ctx, 'normalizar', (cruda) => {
        const c = ctx.fn.normalizar(cruda);
        if (cruda?.investigacion?.modo) {
          c.investigacion = { ...c.investigacion, modo: cruda.investigacion.modo };
          c.imagen = { ...c.imagen, prohibirFotorrealismoDePersonasReales: true };
        }
        return c;
      }),
  },

  {
    nombre: 'la-eleccion-de-generador-manda',
    dice: 'El generador que elige la persona es el que se usa, y no se lo cambia nadie. La aplicación llegó a re-elegirlo en cada carga «para subirlo sola», y eso es cambiarle el precio a alguien por debajo sin avisar.',
    async comprobar(ctx) {
      const { CATALOGO, PREDETERMINADO, grafiasDe } = await import('../../comun/modelos.mjs');
      const fallos = [];

      // Toda familia que se elige tiene fila, y su predeterminado existe.
      for (const f of ['texto', 'imagen', 'video', 'voz']) {
        const filas = CATALOGO[f] || [];
        if (!filas.length) fallos.push(`El catálogo no tiene ningún generador de «${f}».`);
        else if (!filas.some((x) => x.clave === PREDETERMINADO[f])) {
          fallos.push(`El predeterminado de «${f}» («${PREDETERMINADO[f]}») no está en el catálogo.`);
        }
      }

      // Una elección válida se respeta exactamente.
      const suyo = grafiasDe('video', 'veo-3.1-lite');
      if (!suyo.every((g) => /lite/.test(g))) {
        fallos.push(`Elegir Veo 3.1 Lite acaba llamando a ${suyo.join(', ')}.`);
      }
      // Y una guardada de una versión anterior —un identificador crudo— también.
      const viejo = grafiasDe('imagen', 'gemini-2.5-flash-image');
      if (!viejo.includes('gemini-2.5-flash-image')) {
        fallos.push('Una elección guardada como identificador de Vertex deja de respetarse.');
      }

      // Y la pantalla no puede re-elegir por encima de lo guardado. Quien pinta los
      // desplegables es `pintarModelos`: `cargarModelos` solo decide cuándo.
      const main = fuente(ctx, 'app/main.js');
      const i = main.indexOf('async function pintarModelos');
      const fin = main.indexOf('async function cargarModelos', i);
      const cuerpo = i < 0 ? '' : main.slice(i, fin > i ? fin : i + 3000);
      if (!/!cfg\.modelo \|\| !filas\.some/.test(cuerpo)) {
        fallos.push('La pantalla pisa la elección guardada en vez de respetarla.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace('if (!cfg.modelo || !filas.some((f) => f.id === cfg.modelo)) {', 'if (true) {'),
      ),
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
      //
      // Se busca DENTRO de `llamar` y no en el primer `body:` del archivo: en
      // cuanto apareció una segunda petición más arriba —la que pregunta si el
      // material llegó a pesar del corte—, esto miraba ESA, que no lleva carga
      // útil, y la comprobación pasaba siempre. Salió «ciega» en el mismo paso en
      // que se añadió, que es exactamente para lo que sirve `--romper`.
      const enLlamar = cliente.indexOf('export async function llamar');
      const desde = cliente.indexOf('body: JSON.stringify(', enLlamar);
      const cuerpo = cliente.slice(desde, cliente.indexOf('signal: senal', desde));
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

  {
    nombre: 'el-material-se-nombra-con-el-id-del-episodio-no-con-el-del-proyecto',
    dice: 'En pantalla: «Faltan 238 de 250 materiales», con el episodio entero generado, el cubo correcto y los archivos comprobados uno a uno en la consola de Google. El montaje pedía `p2929/t000/img` y en el almacén estaba `p2925/t000/img`: `p2925` es el PROYECTO y `p2929` el episodio abierto, el quinto. Las fases componían la clave con el id del proyecto y la hoja con el de la pieza. Con un solo episodio los dos números coinciden —la primera pieza hereda el id del proyecto— y no se notaba; del segundo en adelante, todo lo generado se guardaba bajo el nombre del proyecto, el montaje no encontraba nada, y cada episodio nuevo escribía encima del material del primero.',
    comprobar(ctx) {
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      // 1 · El id del material sale de la PIEZA. Si esto vuelve a ser el del
      //     proyecto, todo lo de abajo sigue pasando y no comprueba nada.
      if (!/const idMaterial = \(\) => pieza\(\)\.id;/.test(main)) {
        fallos.push('`idMaterial` ya no sale de la pieza abierta: si vuelve a ser el del proyecto, del segundo episodio en adelante nada se encuentra.');
      }

      // 2 · Y NADIE compone una clave con el del proyecto. Se mira línea a línea
      //     para poder decir cuál: `P.idea` y el id con el que el proyecto se
      //     guarda en la nube son otra cosa y tienen que seguir existiendo.
      const componen = [
        /clave(?:Toma|Fotograma|Clip|Voz|Musica|Firma|Miniatura)\(P\.id\b/,
        /\bpieza: P\.id\b/,
        /`\$\{P\.id\}\//,
        /prefijo: `\$\{P\.id\}/,
      ];
      main.split('\n').forEach((linea, n) => {
        if (linea.trimStart().startsWith('//') || linea.trimStart().startsWith('*')) return;
        for (const re of componen) {
          if (re.test(linea)) {
            fallos.push(`Línea ${n + 1}: se compone una clave de material con el id del proyecto — «${linea.trim().slice(0, 70)}»`);
          }
        }
      });
      return fallos;
    },
    // Se rompe como estaba: el material se nombra con el id del proyecto.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) => {
        const antes = 'const idMaterial = () => pieza().id;';
        if (!t.includes(antes)) {
          throw new Error('El sabotaje de `idMaterial` ya no encuentra su sitio: apúntalo otra vez o se está demostrando el aire.');
        }
        return t.replace(antes, 'const idMaterial = () => P.id;');
      }),
  },

  {
    nombre: 'un-almacen-que-no-contesta-no-es-un-material-que-falta',
    dice: '«Ahí está el bucket, está correcto, ahí está todo guardado, ya revisé los archivos.» Y la pantalla, a la vez: «Faltan 238 de 250 materiales.» Las dos cosas cabían porque la consulta en tanda llevaba un `.catch(() => ({ existe: false }))`: cualquier fallo —un permiso denegado, un corte, un 500, un tiempo agotado, o directamente el almacén sin configurar— se convertía en «ese archivo no está». Doscientos treinta y ocho permisos denegados y doscientos treinta y ocho archivos inexistentes se leen igual en pantalla y llevan a hacer lo contrario: mirar la cuenta, o pagar otra vez la generación entera. Un 404 sí es «no está», y eso lo dice `ficha` con `existe: false`; todo lo demás es que el almacén no ha contestado.',
    async comprobar(ctx) {
      const fallos = [];
      const { fichasDelAlmacen } = ctx.fn;

      // Una clave que el almacén no puede ni traducir a una ruta: `ficha` revienta
      // antes de tocar la red, así que esto no sale a internet ni depende de que
      // haya credenciales puestas. Es el fallo más benigno que existe — y aun así
      // no puede contarse como «este material falta».
      let salio = null;
      let dijo = '';
      try {
        salio = await fichasDelAlmacen(['p01/t000/estonoesuntipo']);
      } catch (e) {
        dijo = String(e?.message || '');
      }

      if (salio) {
        fallos.push(
          'Con el almacén fallando, la consulta en tanda devuelve fichas igualmente: ' +
            `${JSON.stringify(salio).slice(0, 120)}. Eso es un error contado como «no existe», ` +
            'y en pantalla sale «faltan N materiales» con el material en su sitio.',
        );
      } else if (!/no contest|no se puede decir que falten/i.test(dijo)) {
        fallos.push(`El almacén falla y la queja no dice que no se puede saber si falta: «${dijo.slice(0, 120)}»`);
      }
      return fallos;
    },
    // Se rompe como estaba: cada fallo, una ficha que dice que no está.
    romper: (ctx) =>
      conFuncion(ctx, 'fichasDelAlmacen', async (claves) =>
        Object.fromEntries(claves.map((c) => [c, { existe: false, bytes: 0 }])),
      ),
  },
];
