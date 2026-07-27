// Invariantes del modelo de datos (§3 y §4.3 del plano).

import { editando, conFuncion } from '../contexto.mjs';
import { claveFotograma, nombreLocal, tipoDe } from '../../comun/claves.mjs';

const fuente = (ctx, ruta) => ctx.fuentes.get(ruta) || '';

const GUIONES_DE_PRUEBA = [
  'Hola. Esto es una prueba corta.',
  '## Escena uno\n\nEn 1923 ardió el puerto. Nadie supo por qué.\nEl Sr. Gómez lo vio. Dijo que fue el viento.\n\n## Escena dos\n\nEl juicio duró tres años.',
  '   Sangría rara.   Doble espacio.\n\n\nTres saltos.\n\t\tTabulador. Final sin punto',
  'Dijo que sí… Luego calló. ¿Y qué? ¡Nada! De verdad.',
  '',
  '   \n\n  ',
];

export const invariantes = [
  // ── §4.3: la segmentación ─────────────────────────────────────────────────
  {
    nombre: 'la-segmentacion-cubre-el-guion-caracter-por-caracter',
    dice: 'La concatenación de los tramos reproduce el guion exactamente. Ni una frase perdida, ni una duplicada (§4.3).',
    comprobar(ctx) {
      const fallos = [];
      for (const g of GUIONES_DE_PRUEBA) {
        const r = ctx.fn.segmentar(g);
        const c = ctx.fn.verificarCobertura(g, r);
        if (!c.ok) fallos.push(`${JSON.stringify(g.slice(0, 30))}…: ${c.detalle}`);
      }
      return fallos;
    },
    // Un segmentador que se come el último tramo: es la avería que esta invariante
    // existe para cazar, y la que de verdad pasó en el primer arranque.
    romper: (ctx) =>
      conFuncion(ctx, 'segmentar', (g) => {
        const r = ctx.fn.segmentar(g);
        return { ...r, tramos: r.tramos.slice(0, -1) };
      }),
  },

  {
    nombre: 'la-segmentacion-es-determinista',
    dice: 'Mismo texto → mismas tomas, siempre. Nada de que el modelo decida los cortes (§4.3).',
    comprobar(ctx) {
      const fallos = [];
      for (const g of GUIONES_DE_PRUEBA) {
        const a = JSON.stringify(ctx.fn.segmentar(g).tomas);
        const b = JSON.stringify(ctx.fn.segmentar(g).tomas);
        if (a !== b) fallos.push(`La segmentación de ${JSON.stringify(g.slice(0, 30))}… no es estable.`);
      }
      // Y no puede haber ni una llamada a un modelo dentro del segmentador.
      const seg = fuente(ctx, 'comun/segmentar.mjs');
      if (/llamar\(|fetch\(|api\./.test(seg)) {
        fallos.push('El segmentador llama a algo de fuera: deja de ser determinista.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'comun/segmentar.mjs', (t) => t + '\nasync function x(){ await fetch("/api/ia"); }\n'),
  },

  {
    nombre: 'segmentar-sin-comprobar-no-es-una-puerta-publica',
    dice: 'Existe una puerta que segmenta Y comprueba, porque segmentar sin comprobar es como no haber comprobado nunca.',
    comprobar(ctx) {
      const t = fuente(ctx, 'comun/segmentar.mjs');
      return /export function segmentarVerificado/.test(t)
        ? []
        : ['No existe segmentarVerificado: nada obliga a comprobar la cobertura.'];
    },
    romper: (ctx) =>
      editando(ctx, 'comun/segmentar.mjs', (t) =>
        t.replace('export function segmentarVerificado', 'function segmentarVerificado'),
      ),
  },

  // ── §3: las claves y la reutilización ─────────────────────────────────────
  {
    nombre: 'una-sola-funcion-traduce-clave-a-ruta',
    dice: 'Solo un sitio convierte una clave de material en una ruta del almacén (§3).',
    comprobar(ctx) {
      const fallos = [];
      for (const [ruta, texto] of ctx.fuentes) {
        // El almacén es quien traduce; claves.mjs tiene la gramática; .env.example
        // documenta las variables y la auditoría las nombra para comprobarlas.
        // Ninguno de los cuatro compone rutas.
        if (ruta === 'api/_lib/almacen.js' || ruta === 'comun/claves.mjs') continue;
        if (ruta === '.env.example' || ruta.startsWith('auditoria/')) continue;
        if (/ALMACEN_PREFIJO|storage\.googleapis\.com\/upload/.test(texto)) {
          fallos.push(`${ruta} compone rutas del almacén por su cuenta.`);
        }
      }
      const alm = fuente(ctx, 'api/_lib/almacen.js');
      if ([...alm.matchAll(/export function rutaDe/g)].length !== 1) {
        fallos.push('No hay exactamente una función rutaDe.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/fases/imagen.js', (t) => t + '\nconst r = process.env.ALMACEN_PREFIJO;\n'),
  },

  {
    nombre: 'las-claves-son-deterministas-y-validas',
    dice: 'Cada archivo generado tiene una clave determinista, no un nombre inventado (§3).',
    comprobar(ctx) {
      const fallos = [];
      for (const c of ctx.claves) {
        try {
          tipoDe(c);
          nombreLocal(c);
        } catch (e) {
          fallos.push(`${c}: ${e.message}`);
        }
      }
      // El nombre local tiene que ser único: dos claves distintas que colapsen en el
      // mismo nombre se pisarían dentro del contenedor.
      const locales = ctx.claves.map(nombreLocal);
      if (new Set(locales).size !== locales.length) {
        fallos.push('Dos claves distintas dan el mismo nombre local: se pisarían al bajarlas.');
      }
      return fallos;
    },
    romper: (ctx) => ({ ...ctx, claves: [...ctx.claves, 'p01/t000/img', 'p01-t000-img'] }),
  },

  {
    nombre: 'la-reutilizacion-de-fotogramas-se-resuelve-siempre',
    dice: 'Todo el que lee un fotograma pasa por el ayudante que resuelve `reusa`, o vería un hueco donde hay una imagen compartida (§3).',
    comprobar(ctx) {
      const fallos = [];
      const tomas = ctx.proyecto.tomas;

      // La hoja tiene que apuntar al fotograma de la dueña, nunca al de la toma que
      // reusa —esa imagen no existe—.
      for (const fila of ctx.hoja.tomas) {
        if (fila.movimiento) continue;
        const toma = tomas.find((t) => t.i === fila.i);
        const esperada = claveFotograma(ctx.hoja.pieza, toma, tomas);
        if (fila.archivo !== esperada) {
          fallos.push(`La toma ${fila.i} apunta a ${fila.archivo} y su fotograma es ${esperada}.`);
        }
      }

      // Y ninguna clave del montaje puede ser la de una toma que reusa.
      for (const t of tomas.filter((x) => x.reusa !== null)) {
        const suya = `${ctx.hoja.pieza}/t${String(t.i).padStart(3, '0')}/img`;
        if (ctx.claves.includes(suya)) {
          fallos.push(`Se baja ${suya}, pero la toma ${t.i} reusa el fotograma de la ${t.reusa}.`);
        }
      }
      return fallos;
    },
    romper(ctx) {
      const hoja = structuredClone(ctx.hoja);
      const conReusa = ctx.proyecto.tomas.find((t) => t.reusa !== null);
      const fila = hoja.tomas.find((f) => f.i === conReusa.i);
      fila.archivo = `${hoja.pieza}/t${String(conReusa.i).padStart(3, '0')}/img`;
      return { ...ctx, hoja };
    },
  },

  {
    nombre: 'la-reutilizacion-no-da-vueltas-en-circulo',
    dice: 'Resolver `reusa` siempre termina: una cadena circular colgaría la aplicación entera.',
    comprobar(ctx) {
      const circulares = [
        { i: 0, reusa: 1 },
        { i: 1, reusa: 0 },
      ];
      try {
        ctx.fn.tomaDelFotograma(circulares[0], circulares);
        return ['Una cadena de reutilización circular no da error: colgaría la aplicación.'];
      } catch {
        return [];
      }
    },
    // Un resolutor sin detección de ciclos devolvería algo en vez de quejarse.
    romper: (ctx) => conFuncion(ctx, 'tomaDelFotograma', (t) => t),
  },

  // ── §3 y §5: la hoja de montaje ───────────────────────────────────────────
  {
    nombre: 'la-hoja-no-deja-huecos-ni-solapes',
    dice: 'Las tomas de la hoja son contiguas: `inicio` es la suma acumulada de duraciones, sin deriva a lo largo de la pieza.',
    comprobar(ctx) {
      const fallos = [];
      let reloj = 0;
      for (const t of ctx.hoja.tomas) {
        if (Math.abs(t.inicio - reloj) > 1e-9) {
          fallos.push(`La toma ${t.i} empieza en ${t.inicio} y debería empezar en ${reloj}.`);
        }
        reloj += t.duracion;
      }
      if (Math.abs(reloj - ctx.hoja.total) > 1e-9) {
        fallos.push(`El total de la hoja (${ctx.hoja.total}) no es la suma de las duraciones (${reloj}).`);
      }
      return fallos;
    },
    romper(ctx) {
      const hoja = structuredClone(ctx.hoja);
      hoja.tomas[3].inicio += 0.5;
      return { ...ctx, hoja };
    },
  },

  {
    nombre: 'las-duraciones-caen-en-la-rejilla-de-fotogramas',
    dice: 'Cada duración es un número entero de fotogramas: si no, video y audio derivan el uno del otro a lo largo de las tomas.',
    comprobar(ctx) {
      const fps = ctx.hoja.fps;
      return ctx.hoja.tomas
        .filter((t) => Math.abs(t.duracion * fps - Math.round(t.duracion * fps)) > 1e-6)
        .map((t) => `La toma ${t.i} dura ${t.duracion}s, que no son fotogramas enteros a ${fps} fps.`);
    },
    romper(ctx) {
      const hoja = structuredClone(ctx.hoja);
      hoja.tomas[2].duracion += 0.007;
      return { ...ctx, hoja };
    },
  },

  {
    nombre: 'la-duracion-se-cuadra-hacia-arriba',
    dice: 'La duración se redondea hacia arriba: así el audio se rellena con silencio en vez de recortarse. Un relleno no se oye; un recorte se come la última sílaba.',
    comprobar(ctx) {
      const tomas = [{ i: 0, escena: 0, segundos: 4.001, plano: null, reusa: null }];
      const hoja = ctx.fn.construirHoja({ pieza: 'p01', tomas, escenas: [] });
      return hoja.tomas[0].duracion >= 4.001
        ? []
        : [`4,001 s se cuadró a ${hoja.tomas[0].duracion} s: eso recorta audio.`];
    },
    // Cuadrar al fotograma MÁS CERCANO en vez de hacia arriba es el cambio que
    // parece inocente y se come la última sílaba de una de cada dos tomas.
    romper: (ctx) =>
      conFuncion(ctx, 'construirHoja', (args) => {
        const h = ctx.fn.construirHoja(args);
        h.tomas = h.tomas.map((t) => ({ ...t, duracion: Math.round(t.duracion * h.fps - 1) / h.fps }));
        return h;
      }),
  },

  {
    nombre: 'la-duracion-real-manda-en-el-montaje',
    dice: 'La duración que llega a la hoja es la MEDIDA sobre el audio, no la estimada (§4.5).',
    comprobar(ctx) {
      const fallos = [];
      const nar = fuente(ctx, 'app/fases/narracion.js');
      if (!/medida: true/.test(nar)) {
        fallos.push('La narración no marca las duraciones como medidas.');
      }
      if (!/segundos: \+trozo\.segundos/.test(nar)) {
        fallos.push('La narración no devuelve la duración real del trozo al modelo de datos.');
      }
      const mont = fuente(ctx, 'app/fases/montaje.js');
      if (!/medida/.test(mont)) {
        fallos.push('El montaje no avisa cuando hay tomas sin duración medida.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/fases/narracion.js', (t) =>
        t.replace('segundos: +trozo.segundos.toFixed(4),', 'segundos: toma.segundos,'),
      ),
  },

  // ── §8.2: la decisión documental ──────────────────────────────────────────
  {
    nombre: 'cada-toma-sabe-de-que-tipo-es-su-imagen',
    dice: 'El modelo de datos distingue imagen generada, de archivo y reconstrucción, y eso puede salir en pantalla (§8.2).',
    comprobar(ctx) {
      const fallos = [];
      if (!ctx.hoja.tomas.every((t) => t.tipoImagen)) {
        fallos.push('Hay tomas en la hoja sin tipo de imagen.');
      }
      const est = fuente(ctx, 'app/estado.js');
      if (!/'generada', 'archivo', 'reconstruccion'/.test(est)) {
        fallos.push('El modelo de datos no acota el tipo de imagen a los tres válidos.');
      }
      const img = fuente(ctx, 'app/fases/imagen.js');
      if (!/prohibirFotorrealismoDePersonasReales/.test(img)) {
        fallos.push('La fase de imagen no aplica la barrera de fotorrealismo de personas reales.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/fases/imagen.js', (t) =>
        t.replaceAll('prohibirFotorrealismoDePersonasReales', 'nada'),
      ),
  },

  {
    nombre: 'cada-toma-conserva-su-respaldo-documental',
    dice: 'Cada toma conserva la referencia a la ficha que la respalda: así, cuando alguien discuta un dato, se sabe de dónde salió sin releer nada (§8.1).',
    comprobar(ctx) {
      const est = fuente(ctx, 'app/estado.js');
      const fallos = [];
      if (!/fichas: Array\.isArray\(t\.fichas\)/.test(est)) {
        fallos.push('La toma no guarda a qué fichas apunta.');
      }
      if (!/afirmacion|cita/.test(est)) fallos.push('El modelo de ficha no guarda afirmación ni cita.');
      const seg = fuente(ctx, 'comun/segmentar.mjs');
      if (!/fichas: \[\]/.test(seg)) fallos.push('La segmentación no reserva el campo de fichas.');
      return fallos;
    },
    romper: (ctx) => editando(ctx, 'app/estado.js', (t) => t.replace(/fichas: Array\.isArray\(t\.fichas\)[^,]*,/, '')),
  },

  {
    nombre: 'los-tiempos-de-los-capitulos-salen-de-lo-medido',
    dice: 'Las marcas de tiempo de la descripción salen de `inicio` de cada escena, no de un modelo estimando minutos (§4.10, §8.4).',
    comprobar(ctx) {
      const t = fuente(ctx, 'app/fases/metadatos.js');
      const fallos = [];
      if (!/tiemposDeEscenas/.test(t)) fallos.push('Los tiempos no se calculan sobre las tomas.');
      if (!/sinMedir/.test(t)) {
        fallos.push('No se avisa cuando los tiempos son estimados: la lista de capítulos no caería donde dice.');
      }
      if (/NO escribas tú las marcas de tiempo/.test(t) === false) {
        fallos.push('No se le prohíbe al modelo inventar las marcas de tiempo.');
      }
      return fallos;
    },
    romper: (ctx) => editando(ctx, 'app/fases/metadatos.js', (t) => t.replaceAll('sinMedir', 'cero')),
  },
];
