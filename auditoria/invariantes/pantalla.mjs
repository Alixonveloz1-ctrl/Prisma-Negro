// Invariantes de la hoja de estilo (§7.13 del plano, y dos que se pagaron aquí).
//
// §7.13 dice que si la herramienta se usa en un móvil, la anchura es una invariante
// que se comprueba, no un detalle de estilo. Estas dos van en la misma dirección:
// hay fallos de CSS que no se ven leyendo el código y son evidentes en pantalla,
// y los dos que siguen aparecieron la primera vez que se miró el resultado
// renderizado en vez de suponerlo.

import { editando } from '../contexto.mjs';

const fuente = (ctx, ruta) => ctx.fuentes.get(ruta) || '';

const hoja = (ctx) => {
  const html = ctx.fuentes.get('index.html') || '';
  // Fuera los comentarios ANTES de nada. La primera versión de esto los dejaba, y
  // como casi toda regla va precedida de un comentario de sección, no reconocía las
  // clases sueltas y la comprobación pasaba siempre. Lo cazó `--romper`.
  return html.slice(html.indexOf('<style>'), html.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
};

/** Los pares selector/cuerpo de una hoja, ya sin comentarios ni @media. */
function reglas(css) {
  const salida = [];
  for (const m of sinMedia(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const sel of m[1].split(',')) {
      const s = sel.trim();
      if (s && !s.startsWith('@')) salida.push({ selector: s, cuerpo: m[2] });
    }
  }
  return salida;
}

/** Quita los bloques @media para poder mirar las reglas de base por separado. */
function sinMedia(css) {
  let salida = '';
  let i = 0;
  while (i < css.length) {
    const m = css.indexOf('@media', i);
    if (m < 0) {
      salida += css.slice(i);
      break;
    }
    salida += css.slice(i, m);
    // Saltar el bloque equilibrado del @media.
    let llaves = 0;
    let k = css.indexOf('{', m);
    for (; k < css.length; k++) {
      if (css[k] === '{') llaves++;
      else if (css[k] === '}' && --llaves === 0) break;
    }
    i = k + 1;
  }
  return salida;
}

export const invariantes = [
  {
    nombre: 'sin-colisiones-de-clases-css',
    dice: 'Un modificador que se usa en compuesto (.pastilla.aviso) no puede llamarse igual que un bloque suelto (.aviso): misma especificidad, gana el que esté después, y el resultado solo se ve renderizando.',
    comprobar(ctx) {
      const fallos = [];
      const modificadores = new Map();
      const sueltas = new Set();

      for (const { selector } of reglas(hoja(ctx))) {
        // .base.modificador — el modificador es el segundo.
        const compuesto = selector.match(/^\.([a-z][\w-]*)\.([a-z][\w-]*)$/i);
        if (compuesto) modificadores.set(compuesto[2], compuesto[1]);
        // .clase a secas — un bloque suelto.
        const suelto = selector.match(/^\.([a-z][\w-]*)$/i);
        if (suelto) sueltas.add(suelto[1]);
      }

      for (const [mod, base] of modificadores) {
        if (sueltas.has(mod)) {
          fallos.push(
            `«.${base}.${mod}» choca con la clase suelta «.${mod}»: la de después gana ` +
              `y el modificador no hace lo que dice.`,
          );
        }
      }
      return fallos;
    },
    // Volver a poner el nombre que chocaba: era `.pastilla.aviso` contra `.aviso`,
    // y hacía que una pastilla de 11 px saliera a 13,5 px y 45 px de alto.
    romper: (ctx) => editando(ctx, 'index.html', (t) => t.replace(/\.pastilla\.p-aviso/g, '.pastilla.aviso')),
  },

  {
    nombre: 'las-anulaciones-de-pantalla-ancha-van-al-final',
    dice: 'Lo que anula un @media no puede volver a definirse después: misma especificidad, gana la última, y la anulación se pierde sin avisar.',
    comprobar(ctx) {
      const css = hoja(ctx);
      const fallos = [];

      for (const m of css.matchAll(/@media[^{]*\(min-width[^{]*\{/g)) {
        const inicio = m.index;
        let llaves = 0;
        let fin = css.indexOf('{', inicio);
        for (; fin < css.length; fin++) {
          if (css[fin] === '{') llaves++;
          else if (css[fin] === '}' && --llaves === 0) break;
        }
        const dentro = css.slice(inicio, fin);
        const despues = css.slice(fin);

        // Los selectores que el @media anula.
        for (const s of dentro.matchAll(/(?:^|[{}])\s*([a-z][\w.\-> ]*?)\s*\{/gi)) {
          const sel = s[1].trim();
          if (!sel || sel.startsWith('@') || sel.length > 40) continue;
          // ¿Se vuelve a definir tal cual después del bloque?
          const re = new RegExp(`(^|[}\\n])\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'm');
          if (re.test(despues)) {
            fallos.push(
              `«${sel}» se anula dentro de un @media y se vuelve a definir después: ` +
                `la anulación no llega a aplicarse.`,
            );
          }
        }
      }
      return fallos;
    },
    // El fallo real: el bloque de escritorio estaba a media hoja y
    // `nav.abajo{display:flex}` venía después, así que la barra inferior salía
    // también en escritorio, encima del contenido.
    romper(ctx) {
      return editando(ctx, 'index.html', (t) =>
        t.replace(
          '/* ── Pantalla ancha ',
          '@media (min-width:900px){ nav.abajo{display:none} }\nnav.abajo{display:flex}\n/* ── Pantalla ancha ',
        ),
      );
    },
  },

  {
    nombre: 'las-pestanas-caben-en-la-barra-de-abajo',
    dice: 'Con seis pestañas en 390 px cada una tiene ~65 px. Un nombre largo se sale y pisa al de al lado: se leía «INICIOINVESTIGACIÓNGUION» (§7.13).',
    async comprobar(ctx) {
      const js = ctx.fuentes.get('app/main.js') || '';
      const fallos = [];

      // Cada vista necesita nombre corto además del largo.
      const bloque = js.slice(js.indexOf('const VISTAS'), js.indexOf('];', js.indexOf('const VISTAS')));
      const filas = [...bloque.matchAll(/\['([\w-]+)',\s*'([^']+)'(?:,\s*'([^']+)')?\]/g)];
      if (!filas.length) return ['No se encuentra la lista de vistas.'];

      const ANCHO_MOVIL = 390;
      const porPestana = ANCHO_MOVIL / filas.length;
      // A 9,5 px en versalitas con espaciado, un carácter ronda los 7 px.
      const TOPE = Math.floor((porPestana - 6) / 7);

      for (const [, id, largo, corto] of filas) {
        if (!corto) fallos.push(`La vista «${id}» no tiene nombre corto para la barra de abajo.`);
        else if (corto.length > TOPE) {
          fallos.push(`«${corto}» (${corto.length}) no cabe en ${Math.round(porPestana)} px: máximo ${TOPE} caracteres.`);
        }
      }

      // Y la salvaguarda de CSS, por si un día se añade una pestaña más.
      const html = ctx.fuentes.get('index.html') || '';
      if (!/nav\.abajo button span\{[^}]*text-overflow:ellipsis/.test(html.replace(/\s+/g, ''))
        && !/nav\.abajo button span\{[\s\S]{0,200}?text-overflow:ellipsis/.test(html)) {
        fallos.push('Las etiquetas de la barra de abajo no se recortan si crecen.');
      }
      return fallos;
    },
    romper(ctx) {
      const js = ctx.fuentes.get('app/main.js');
      return {
        ...ctx,
        fuentes: new Map(ctx.fuentes).set(
          'app/main.js',
          js.replace("['investigacion', 'Investigación', 'Fichas']", "['investigacion', 'Investigación', 'Investigación']"),
        ),
      };
    },
  },

  {
    nombre: 'la-navegacion-se-define-una-sola-vez',
    dice: 'La barra lateral y la de abajo salen de la misma lista. Con dos listas, una acaba teniendo una pestaña que la otra no.',
    comprobar(ctx) {
      const js = ctx.fuentes.get('app/main.js') || '';
      const html = ctx.fuentes.get('index.html') || '';
      const fallos = [];
      if (!/const VISTAS\s*=/.test(js)) fallos.push('No hay una lista única de vistas.');
      // Ni la lateral ni la de abajo pueden traer botones escritos a mano en el HTML.
      const lateral = html.match(/<div id="lateral">([\s\S]*?)<\/div>/);
      const movil = html.match(/<nav class="abajo" id="nav-movil">([\s\S]*?)<\/nav>/);
      for (const [donde, m] of [['la barra lateral', lateral], ['la barra inferior', movil]]) {
        if (m && /<button/.test(m[1])) {
          fallos.push(`${donde} trae botones escritos a mano en vez de salir de la lista.`);
        }
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'index.html', (t) =>
        t.replace('<div id="lateral">', '<div id="lateral"><button>Extra</button>'),
      ),
  },

  {
    nombre: 'toda-id-que-la-pantalla-escribe-existe-en-el-html',
    dice: 'Si el código escribe en un elemento que no está en el HTML, revienta a mitad de la operación y lo que iba después no se hace. «cuenta-previa» no existía y tumbaba la Previa entera después de haber bajado todo el material.',
    comprobar(ctx) {
      const html = fuente(ctx, 'index.html');
      const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
      const fallos = [];
      for (const [ruta, texto] of ctx.fuentes) {
        if (!ruta.startsWith('app/') || !ruta.endsWith('.js')) continue;
        for (const m of texto.matchAll(/\$\('([a-z][a-z0-9-]*)'\)/gi)) {
          if (!ids.has(m[1])) fallos.push(`${ruta} escribe en «${m[1]}», que no existe en el HTML.`);
        }
      }
      return fallos;
    },
    romper: (ctx) => editando(ctx, 'index.html', (t) => t.replace(' id="cuenta-previa"', '')),
  },

  {
    nombre: 'se-puede-rehacer-lo-que-ya-esta-hecho',
    dice: 'Cambiar de voz o de estilo no sirve de nada si no hay forma de rehacer lo generado. Las cuatro fases saben distinguir «lo que falta» de «todo»; la pantalla tiene que poder pedírselo.',
    comprobar(ctx) {
      const main = fuente(ctx, 'app/main.js');
      const html = fuente(ctx, 'index.html');
      const fallos = [];
      if (!/id="rehacer-todo"/.test(html)) fallos.push('No hay forma de pedir que se rehaga lo ya hecho.');
      for (const [boton, corte] of [
        ['b-narrar', 'narracion.planificar'],
        ['b-imagenes', 'imagenFase.planificar'],
        ['b-movimiento', 'movimiento.planificar'],
        ['b-musica', 'musica.planificar'],
      ]) {
        const i = main.indexOf(`accion('${boton}'`);
        if (i < 0) { fallos.push(`No existe ${boton}.`); continue; }
        const cuerpo = main.slice(i, i + 900);
        const j = cuerpo.indexOf(corte);
        if (j < 0) { fallos.push(`${boton} no planifica con ${corte}.`); continue; }
        // Se mira LA LLAMADA, no el bloque entero: alrededor hay una variable y un
        // aviso que también nombran `soloLasQueFaltan`, y con eso la comprobación
        // pasaba aunque la llamada hubiera dejado de recibirlo.
        const llamada = cuerpo.slice(j, cuerpo.indexOf(';', j));
        if (!/soloLasQueFaltan/.test(llamada)) {
          fallos.push(`${boton} planifica sin decir si rehace: siempre saltará lo ya hecho.`);
        }
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace(
          'const bloques = narracion.planificar(pieza().tomas, P.config, { soloLasQueFaltan });',
          'const bloques = narracion.planificar(pieza().tomas, P.config);',
        ),
      ),
  },

  {
    nombre: 'escribir-un-material-tira-su-copia-local',
    dice: 'La copia local de una clave que se acaba de reescribir ya no vale. Estaba solo en los «rehacer» de uno en uno: rehacer una fase entera actualizaba la nube y la Previa seguía tocando la voz vieja.',
    comprobar(ctx) {
      const api = fuente(ctx, 'app/api.js');
      const i = api.indexOf('if (r.ok && cuerpo.ok)');
      // El corte va hasta el FINAL del bloque, no hasta un número de caracteres.
      // Con un tope fijo, añadir un comentario empujaba la línea que se busca fuera
      // de la ventana y la invariante fallaba sin que nada estuviera roto.
      const fin = api.indexOf('return cuerpo;', i);
      const cuerpo = i < 0 || fin < 0 ? '' : api.slice(i, fin);
      const fallos = [];
      if (!/borrarMaterial/.test(cuerpo)) {
        fallos.push('Una llamada que escribe material no tira la copia local: la Previa enseñaría lo viejo.');
      }
      if (!/guardarEn/.test(cuerpo)) fallos.push('No se mira si la llamada escribió un material.');
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/api.js', (t) =>
        t.replace('if (escrita) await local.borrarMaterial(escrita).catch(() => {});', ''),
      ),
  },
];
