// Invariantes de la hoja de estilo (§7.13 del plano, y dos que se pagaron aquí).
//
// §7.13 dice que si la herramienta se usa en un móvil, la anchura es una invariante
// que se comprueba, no un detalle de estilo. Estas dos van en la misma dirección:
// hay fallos de CSS que no se ven leyendo el código y son evidentes en pantalla,
// y los dos que siguen aparecieron la primera vez que se miró el resultado
// renderizado en vez de suponerlo.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { editando, conFuncion } from '../contexto.mjs';

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
    dice: 'Con siete pestañas en 390 px cada una tiene ~56 px. Un nombre largo se sale y pisa al de al lado: se leía «INICIOINVESTIGACIÓNGUION» (§7.13). Y cada sección que se añade estrecha a todas las demás, así que el tope se calcula, no se recuerda.',
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
          js.replace("['biblioteca', 'Archivo del canal', 'Archivo']", "['biblioteca', 'Archivo del canal', 'Archivo del canal']"),
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

  {
    nombre: 'los-botones-de-continuacion-salen-cuando-sirven',
    dice: 'Estaban los dos sueltos en Ajustes, siempre visibles: se podía pedir «reutilizar imágenes» de un guion de continuación que aún no existía. No fallaba, es que no significaba nada. Continuar va donde está el guion que se continúa; reutilizar, donde ya hay planos que comparar.',
    comprobar(ctx) {
      const html = fuente(ctx, 'index.html');
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      // Cada botón, en su vista.
      const dentroDe = (id, vista) => {
        const i = html.indexOf(`id="v-${vista}"`);
        const fin = html.indexOf('</section>', i);
        return i >= 0 && html.slice(i, fin).includes(`id="${id}"`);
      };
      if (!dentroDe('b-continuacion', 'guion')) fallos.push('Continuar no está en la vista del guion.');
      if (!dentroDe('b-reutilizar', 'tomas')) fallos.push('Reutilizar no está en la vista de tomas.');
      if (dentroDe('b-continuacion', 'ajustes') || dentroDe('b-reutilizar', 'ajustes')) {
        fallos.push('Siguen sueltos en Ajustes, fuera del momento en que sirven.');
      }

      // Y nacen ocultos: si el HTML no los oculta, se ven antes de que la pantalla
      // decida, que es el parpadeo que hace dudar de si el botón hace algo.
      for (const id of ['panel-continuar', 'b-reutilizar']) {
        const i = html.indexOf(`id="${id}"`);
        const linea = html.slice(Math.max(0, i - 200), i);
        if (!/oculto/.test(linea)) fallos.push(`«${id}» no nace oculto.`);
      }

      // Y la condición de aparecer es la de verdad, no «siempre».
      const i = main.indexOf('function pintarContinuacion');
      if (i < 0) return [...fallos, 'Nadie decide cuándo salen.'];
      const cuerpo = main.slice(i, main.indexOf('\nfunction ', i + 10));
      if (!/z\.guion/.test(cuerpo)) fallos.push('Continuar no mira si hay guion que continuar.');
      if (!/ascendencia/.test(cuerpo)) fallos.push('Reutilizar no mira si esta pieza continúa a otra.');
      if (!/t\.plano/.test(cuerpo)) fallos.push('Reutilizar sale sin tomas dirigidas: no hay planos que comparar.');
      // Y la condición tiene que APLICARSE. Calcularla y luego enseñar el botón
      // igual es tener la comprobación escrita y no usarla.
      for (const [id, cond] of [['panel-continuar', 'hayGuion'], ['b-reutilizar', 'puede']]) {
        if (!new RegExp(`\\$\\('${id}'\\)\\.classList\\.toggle\\('oculto', !${cond}\\)`).test(cuerpo)) {
          fallos.push(`«${id}» se enseña sin mirar su condición.`);
        }
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace("$('b-reutilizar').classList.toggle('oculto', !puede);", "$('b-reutilizar').classList.remove('oculto');"),
      ),
  },

  {
    nombre: 'cada-cosa-tiene-su-seccion-y-el-inicio-es-un-inicio',
    dice: '«El inicio no es un inicio, el inicio es la biblioteca. La aplicación tiene que tener un inicio y que se vea el generador, y luego todo por sección, como si fuesen su propia página: poder entrar al catálogo de imágenes, a la sección de generar episodio, a la sección de episodios guardados, la sección de ajustes.» El Inicio se fue llenando de todo lo que iba haciendo falta —la biblioteca entera de 141 fichas, la lista de episodios, los seis pasos de producción— hasta dejar de ser una pantalla y pasar a ser el sitio donde estaba todo. Un inicio dice en qué estado estás y por dónde se entra; no es donde se hace el trabajo.',
    async comprobar(ctx) {
      const { humoDeLaPantalla } = await import('../pantalla-humo.mjs');
      const enContexto = ctx.fuentes.get('app/main.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/main.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;
      const html = fuente(ctx, 'index.html');
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      /** El trozo de HTML de una vista, de su `<section>` a la siguiente. */
      const vista = (id) => {
        const desde = html.indexOf(`id="v-${id}"`);
        if (desde < 0) return null;
        const hasta = html.indexOf('<section ', desde);
        return html.slice(desde, hasta < 0 ? html.length : hasta);
      };

      // 1 · CADA COSA EN SU SECCIÓN, y no dos veces.
      for (const [qué, panel, donde] of [
        ['el archivo del canal', 'panel-biblioteca', 'biblioteca'],
        ['la lista de episodios', 'panel-episodios', 'episodios'],
        ['qué episodio está abierto', 'panel-abierto', 'episodios'],
        ['el paso de elegir caso', 'paso1', 'guion'],
        ['el guion', 'id="guion"', 'guion'],
      ]) {
        const marca = panel.startsWith('id=') ? panel : `id="${panel}"`;
        const suya = vista(donde);
        if (!suya) {
          fallos.push(`No existe la sección «${donde}».`);
          continue;
        }
        if (!suya.includes(marca)) fallos.push(`${qué} no está en su sección («${donde}»).`);
        if ((html.split(marca).length - 1) > 1) fallos.push(`${qué} está pintado en dos sitios: uno de los dos miente.`);
      }

      // 2 · Y EL INICIO NO ES EL VERTEDERO. Si vuelve a tener dentro la biblioteca
      // o los pasos de producción, ha vuelto a ser lo que era.
      const inicio = vista('inicio') || '';
      for (const [qué, marca] of [
        ['el archivo entero', 'id="panel-biblioteca"'],
        ['la lista de episodios', 'id="panel-episodios"'],
        ['los pasos de producción', 'id="paso1"'],
        ['el editor del guion', 'id="guion"'],
      ]) {
        if (inicio.includes(marca)) fallos.push(`El Inicio vuelve a llevar dentro ${qué}: no es un inicio, es donde está todo.`);
      }

      // 3 · Pero SÍ dice en qué estado está y por dónde se entra. Un inicio vacío
      // sería igual de inútil, en la otra dirección.
      for (const [qué, marca] of [
        ['en qué estado está el canal', 'id="estado-canal"'],
        ['por dónde se entra a cada sección', 'id="entradas-inicio"'],
        ['el generador de un tirón', 'id="b-producir"'],
      ]) {
        if (!inicio.includes(marca)) fallos.push(`El Inicio no dice ${qué}.`);
      }

      // 4 · Las secciones que él nombró existen como vistas de verdad.
      const filas = [...main.matchAll(/\['([\w-]+)',\s*'([^']+)',\s*'([^']+)'\]/g)].map((m) => m[1]);
      for (const id of ['inicio', 'biblioteca', 'episodios', 'guion', 'previa', 'ajustes']) {
        if (!filas.includes(id)) fallos.push(`«${id}» no es una sección propia: no sale en la barra.`);
      }

      // 5 · Y ARRANCANDO DE VERDAD, el Inicio pinta sus entradas. Una lista vacía
      // se vería igual que una llena mirando solo el HTML.
      const r = await humoDeLaPantalla({ parche });
      fallos.push(...r.fallos);
      if (r.hijosDe('entradas-inicio') < 4) {
        fallos.push(`El Inicio pinta ${r.hijosDe('entradas-inicio')} entradas: no lleva a las secciones.`);
      }
      if (!/pastilla/.test(r.html('estado-canal'))) {
        fallos.push('El Inicio no dice cómo va el canal al arrancar.');
      }
      return fallos;
    },
    // Se rompe como estaba: el archivo entero, otra vez dentro del Inicio.
    romper: (ctx) =>
      editando(ctx, 'index.html', (t) =>
        t.replace('<div class="panel" id="panel-biblioteca">', '<div class="panel" id="panel-biblioteca" data-en-inicio>')
          .replace('<div class="panel">\n          <h2>Cómo va el canal</h2>', '<div class="panel" id="panel-biblioteca">\n          <h2>Cómo va el canal</h2>'),
      ),
  },

  {
    nombre: 'borrar-un-episodio-es-borrarlo-y-no-pide-nada-a-cambio',
    dice: '«No puedo eliminar el episodio si no genero otro primero. ¿Qué es eso? Si eliminar es eliminar, ¿por qué tengo que a juro generar otro antes?» Había un «es el único episodio, abre otro antes de borrar este», y no defendía nada suyo: defendía una comodidad del código —que `piezaActiva` siempre apuntara a algo— para no tener que aguantar el caso de cero episodios. El precio lo pagaba él: para tirar un episodio que no quería, tenía que crear otro que tampoco quería. Quien tiene que aguantar el caso raro es el código.',
    async comprobar(ctx) {
      const { borrarPieza, sanear, piezaDe, hayEpisodio } = ctx.fn;
      const { humoDeLaPantalla } = await import('../pantalla-humo.mjs');
      const enContexto = ctx.fuentes.get('app/main.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/main.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;
      const fallos = [];

      // 1 · EL ÚLTIMO SE BORRA. Sin excusas y sin pedir nada antes.
      const solo = sanear({ piezas: [{ id: 'p01' }], piezaActiva: 'p01' });
      try {
        borrarPieza(solo, 'p01');
      } catch (e) {
        fallos.push(`No se puede borrar el único episodio: «${e.message}». Borrar es borrar.`);
        return fallos;
      }
      if (solo.piezas.some((z) => !z.esBiblioteca)) fallos.push('Borrar el único episodio no lo quita.');
      if (hayEpisodio(solo)) fallos.push('Tras borrar el único episodio, la aplicación sigue creyendo que hay uno.');

      // 2 · Y EL PROYECTO SIN EPISODIOS NO SE ROMPE NI ABRE EL ARCHIVO POR ERROR.
      //
      // Esto es lo caro de verdad: `piezaDe` caía a `piezas[0]`, y desde que el
      // archivo del canal es una pieza más, `piezas[0]` PUEDE SER EL ARCHIVO. Sin
      // episodios, la pantalla habría abierto el archivo como si fuera un episodio
      // y cualquier fase habría escrito dentro de él —encima de las 141 imágenes
      // que se pagan una sola vez—.
      const conArchivo = sanear({
        piezas: [
          { id: 'biblioteca', esBiblioteca: true, tomas: [{ i: 0, clave: 'recurso:x:v1', imagen: 'ok' }] },
          { id: 'p01' },
        ],
        piezaActiva: 'p01',
      });
      borrarPieza(conArchivo, 'p01');
      const z = piezaDe(conArchivo, conArchivo.piezaActiva);
      if (z?.esBiblioteca || z?.id === 'biblioteca') {
        fallos.push('Sin episodios se abre EL ARCHIVO como si fuera uno: generar encima se llevaría la biblioteca entera.');
      }
      if (!z || !Array.isArray(z.tomas)) {
        fallos.push('Sin episodios no hay pieza que pintar: la pantalla reventaría antes de dibujar nada.');
      }
      if (z?.tomas?.length) fallos.push('La pieza vacía trae tomas de otro sitio.');

      // 3 · Y LA PANTALLA ARRANCA SIN NINGUNO Y LO DICE, en vez de enseñar los seis
      // pasos de un episodio que no existe.
      const r = await humoDeLaPantalla({ parche, proyecto: { id: 'vacio', piezaActiva: '', piezas: [] } });
      fallos.push(...r.fallos);
      if (!/[Nn]inguno|sin episodio/i.test(r.html('abierto-dice'))) {
        fallos.push('Con el proyecto sin episodios, la pantalla no dice que no hay ninguno.');
      }
      return fallos;
    },
    // Se rompe como estaba, con la condición tal cual: el último no se borra.
    romper: (ctx) =>
      conFuncion(ctx, 'borrarPieza', (proyecto, id) => {
        if (ctx.fn.episodiosDe(proyecto).length <= 1) {
          throw new Error('Es el único episodio. Abre otro antes de borrar este.');
        }
        return ctx.fn.borrarPieza(proyecto, id);
      }),
  },

  {
    nombre: 'el-inicio-se-puede-gobernar-desde-el-inicio',
    dice: '«El inicio me sale ya iniciado el último caso. No veo los casos generados para borrarlos. No tengo control de nada. No puedo sugerir yo un caso, porque no tengo nada donde escribir.» Cuatro huecos y el mismo origen: el Inicio era el flujo de UN episodio y todo lo demás —la biblioteca, la lista de episodios— estaba al final de Ajustes, donde no lo encuentra nadie. Una herramienta en la que solo se puede hacer lo que cupo en dos desplegables no es una herramienta, es un formulario.',
    async comprobar(ctx) {
      const { humoDeLaPantalla } = await import('../pantalla-humo.mjs');
      const enContexto = ctx.fuentes.get('app/main.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/main.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;
      const html = fuente(ctx, 'index.html');
      const fallos = [];

      // 1 · SE PUEDE ESCRIBIR UNA IDEA PROPIA. Con solo desplegables, la
      // herramienta únicamente sabe hacer lo que cupo en un catálogo.
      if (!/id="idea"/.test(html)) fallos.push('No hay dónde escribir una idea propia: solo se puede elegir de un menú.');
      if (!/id="b-usar-idea"/.test(html)) fallos.push('No se puede convertir la idea propia en el caso directamente.');
      const main = fuente(ctx, 'app/main.js');
      const buscarFn = main.slice(main.indexOf('async function buscar()'), main.indexOf('\naccion(', main.indexOf('async function buscar()')));
      if (!/P\.idea \|\| tema/.test(buscarFn)) {
        fallos.push('La idea escrita no manda sobre el tema del menú: se escribiría y no serviría de nada.');
      }

      // 2 · SE PUEDE BORRAR un episodio, y su id NO se reutiliza. Reutilizarlo
      // escribiría encima del material del que sigue vivo, sin un solo error.
      const { borrarPieza, abrirPieza, sanear } = ctx.fn;
      if (!/id="historial"/.test(html)) fallos.push('No hay lista de episodios donde borrar.');
      const p = sanear({ piezas: [{ id: 'p01' }, { id: 'p02' }, { id: 'p03' }] });
      borrarPieza(p, 'p02');
      if (p.piezas.some((z) => z.id === 'p02')) fallos.push('Borrar un episodio no lo quita.');
      const nueva = abrirPieza(p, { titulo: 'x' });
      if (p.piezas.filter((z) => z.id === nueva.id).length > 1 || nueva.id === 'p03') {
        fallos.push(
          `Tras borrar, el episodio nuevo se llama ${nueva.id} y ya existe: sus imágenes ` +
            'escribirían encima de las del que sigue vivo, en el almacén y sin avisar.',
        );
      }
      // Y la biblioteca no se borra: no es un episodio, es lo que hace baratos a
      // todos los demás.
      try {
        const conArchivo = sanear({ piezas: [{ id: 'p01' }, { id: 'biblioteca', esBiblioteca: true }] });
        borrarPieza(conArchivo, 'biblioteca');
        fallos.push('Se puede borrar el archivo del canal desde la lista de episodios.');
      } catch {
        /* tiene que fallar */
      }

      // 3 · Y ARRANCA. Los botones se pulsan sin reventar.
      const r = await humoDeLaPantalla({ parche, pulsa: ['b-episodio-nuevo'] });
      fallos.push(...r.fallos);
      if (!/todavía sin caso|—/.test(r.html('abierto-dice'))) {
        fallos.push('No se dice qué episodio está abierto: los pasos parecen el estado de la herramienta.');
      }
      return fallos;
    },
    // Se rompe como estaba: el id del episodio nuevo salía de contar los vivos, así
    // que borrar uno hacía que el siguiente reutilizara su número.
    romper: (ctx) =>
      conFuncion(ctx, 'abrirPieza', (proyecto, opciones) => {
        const antes = proyecto.numeroPiezas;
        proyecto.numeroPiezas = ctx.fn.episodiosDe(proyecto).length;
        const z = ctx.fn.abrirPieza(proyecto, opciones);
        proyecto.numeroPiezas = Math.max(antes, proyecto.numeroPiezas);
        return z;
      }),
  },

  {
    nombre: 'un-clip-de-la-biblioteca-sale-de-una-imagen-aprobada',
    dice: '«Se manda a generar los clips, ¿y de dónde van a salir los clips? Primero se deben generar las imágenes. Si yo veo que la imagen está correcta, pues le genero clip.» El botón de clips cogía TODA toma con movimiento, mirara o no si su imagen existía y mirara o no si alguien la había visto. Un clip es la fase más cara y sale DE la imagen: si la imagen tiene tres manos, el clip tiene tres manos moviéndose, cuesta lo mismo, y queda en la biblioteca permanente para todos los episodios que vengan. Tres condiciones, no una: que la imagen exista, que una persona la haya aprobado, y que no esté pagada ya.',
    comprobar(ctx) {
      const { clipsPosibles } = ctx.fn;
      const fallos = [];
      const base = { i: 0, movimiento: true, imagen: 'ok', aprobada: true, video: null };

      for (const [qué, toma] of [
        ['sin imagen generada', { ...base, imagen: null }],
        ['sin el visto bueno', { ...base, aprobada: false }],
        ['con el clip ya pagado', { ...base, video: 'ok' }],
      ]) {
        if (clipsPosibles([toma]).length) fallos.push(`Se ofrece pagar un clip de una imagen ${qué}.`);
      }
      if (clipsPosibles([base]).length !== 1) {
        fallos.push('Una imagen generada y aprobada no puede pasar a clip: no queda forma de gastar donde toca.');
      }
      if (clipsPosibles([base], { bibliotecaConVideo: false }).length) {
        fallos.push('Con los clips de biblioteca apagados en la política, se siguen ofreciendo.');
      }
      // Y una toma que el catálogo NO manda animar —los sitios y los objetos— no
      // entra por aprobarla: su valor está justo en costar cero.
      if (clipsPosibles([{ ...base, movimiento: false }]).length) {
        fallos.push('Un recurso sin movimiento entra en el gasto de clips solo por estar aprobado.');
      }

      // Y el resumen tiene que separar «generada» de «aprobada», o la pantalla
      // volvería a decir que la biblioteca está lista con 141 imágenes sin mirar.
      const r = ctx.fn.resumenBiblioteca([base, { ...base, i: 1, aprobada: false }]);
      if (r.aprobadas !== 1 || r.porRevisar !== 1) {
        fallos.push(`El resumen no distingue lo aprobado de lo generado: ${r.aprobadas} y ${r.porRevisar}.`);
      }
      return fallos;
    },
    // Se rompe como estaba: todo lo que lleve movimiento, mirara o no la imagen.
    romper: (ctx) => conFuncion(ctx, 'clipsPosibles', (tomas) => (tomas || []).filter((t) => t.movimiento)),
  },

  {
    nombre: 'la-biblioteca-se-mira-imagen-a-imagen-desde-la-pantalla',
    dice: '«Yo no puedo entrar a generar nada, solamente puedo darle al botón de generar todo, y genera las imágenes que le da la gana; yo no puedo ver lo que está generando. Si una imagen sale deforme, así se queda, porque no tengo control sobre eso. Cada imagen, para poder verla, con su botón de reintentar.» La biblioteca tenía dos botones de generar todo y NINGUNA manera de ver lo generado. En la biblioteca permanente eso es lo más caro que puede pasar: una cara deforme sale en todos los episodios del canal, para siempre, y de ella cuelga además el clip. Cada entrada se ve, se rehace y se aprueba desde su ficha.',
    async comprobar(ctx) {
      const { ID_BIBLIOTECA } = ctx.fn;
      const { humoDeLaPantalla, proyectoYaEmpezado } = await import('../pantalla-humo.mjs');
      const enContexto = ctx.fuentes.get('app/main.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/main.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;
      const fallos = [];

      // Se arranca la aplicación con una biblioteca a medias: una recién generada
      // sin mirar, una ya aprobada, y una sin generar.
      const conBiblioteca = (extra = {}) => {
        const p = proyectoYaEmpezado();
        p.piezas.push({
          id: ID_BIBLIOTECA,
          titulo: 'Biblioteca del canal',
          esBiblioteca: true,
          escenas: [{ n: 0, titulo: 'Recursos' }, { n: 1, titulo: 'Reparto' }],
          tomas: [
            // Un sitio ya generado y sin mirar; un perito aprobado; otro generado y
            // sin aprobar; y uno sin generar. Los cuatro estados que hay.
            { i: 0, clave: 'recurso:carretera-noche:v1', recurso: 'carretera-noche', variante: 'v1', imagen: 'ok', aprobada: false },
            { i: 1, clave: 'personaje:perito:v1', personaje: 'perito', variante: 'v1', imagen: 'ok', aprobada: true },
            { i: 2, clave: 'personaje:perito:v2', personaje: 'perito', variante: 'v2', imagen: 'ok', aprobada: false },
            { i: 3, clave: 'personaje:perito:v3', personaje: 'perito', variante: 'v3', imagen: null },
          ],
        });
        return { parche, proyecto: p, ...extra };
      };

      const r = await humoDeLaPantalla(conBiblioteca());
      fallos.push(...r.fallos);

      // La galería existe y tiene una ficha por entrada, no un resumen.
      if (r.hijosDe('galeria-biblioteca') < 4) {
        fallos.push(
          `La galería de la biblioteca pinta ${r.hijosDe('galeria-biblioteca')} fichas: ` +
            'no se puede ver lo que se está generando.',
        );
      }
      const botones = r.botonesDe('galeria-biblioteca');
      // CADA UNA CON SU BOTÓN DE REINTENTAR. Sin esto, una imagen deforme es
      // definitiva.
      if (!botones.some((b) => /Rehacer/.test(b.texto))) {
        fallos.push('Ninguna ficha tiene botón de rehacer: una imagen deforme se queda deforme.');
      }
      if (!botones.some((b) => /Generar$/.test(b.texto))) {
        fallos.push('No se puede generar una entrada suelta: o todas o ninguna.');
      }
      // Y CON SU VISTO BUENO, que es de lo que cuelga el gasto.
      if (!botones.some((b) => /Está bien/.test(b.texto))) {
        fallos.push('No hay forma de aprobar una imagen: el visto bueno no existe en pantalla.');
      }
      // La que no está aprobada no ofrece clip; la que sí, lo ofrece.
      const sinAprobar = botones.find((b) => /Apruébala para el clip/.test(b.texto));
      if (!sinAprobar || !sinAprobar.deshabilitado) {
        fallos.push('Se puede pedir el clip de una imagen que nadie ha aprobado: el gasto más caro, a ciegas.');
      }
      const listo = botones.find((b) => /Generar su clip/.test(b.texto));
      if (!listo || listo.deshabilitado) {
        fallos.push('Una imagen ya aprobada no ofrece su clip: aprobar no sirve de nada.');
      }
      // Y la que no tiene imagen, ni eso.
      if (!botones.some((b) => /Primero la imagen/.test(b.texto))) {
        fallos.push('Una entrada sin imagen ofrece clip: no hay de dónde sacarlo.');
      }

      // ── 3 · SE APRUEBA, Y CAMBIA ─────────────────────────────────────────────
      // Se pulsa «Está bien» de verdad en la ficha del perito sin aprobar, y se
      // mira si el botón de su clip se abre. Sin esto, aprobar sería un adorno.
      const tras = await humoDeLaPantalla(
        conBiblioteca({ pulsa: [{ dentro: 'galeria-biblioteca', rotulo: 'Está bien', n: 1 }] }),
      );
      fallos.push(...tras.fallos);
      const despues = tras.botonesDe('galeria-biblioteca');
      if (despues.filter((b) => /Quitar el visto bueno/.test(b.texto)).length < 2) {
        fallos.push('Aprobar una imagen no queda reflejado en su ficha: no se sabe cuáles quedan por mirar.');
      }
      if (despues.filter((b) => /Generar su clip/.test(b.texto)).length < 2) {
        fallos.push('Aprobar una imagen no abre su clip: el visto bueno no sirve para nada.');
      }

      // ── 4 · Y EL BOTÓN DE GENERAR TODO respeta lo mismo ──────────────────────
      // Sigue estando —«obviamente, debería poder mandar a generar todo»— pero
      // gasta por la misma regla que las fichas.
      const main = fuente(ctx, 'app/main.js');
      const i = main.indexOf(`'b-biblioteca-clips'`);
      const cuerpo = i < 0 ? '' : main.slice(i, i + 2000);
      if (!/clipsPosibles\(/.test(cuerpo)) {
        fallos.push('El botón de generar todos los clips no mira si las imágenes están aprobadas.');
      }
      return fallos;
    },
    // Se rompe como estaba: el botón del clip de cada ficha, sin mirar el visto
    // bueno. Va por el contexto —parchea la fuente que el arnés arranca— porque lo
    // que se mide es lo que se puede pulsar en pantalla.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t
          .replace(/c\.disabled = !!enFila \|\| !hay \|\| !x\.aprobada;/, 'c.disabled = !!enFila;')
          .replace(/x\.aprobada \? 'Generar su clip' : 'Apruébala para el clip'/, "'Generar su clip'"),
      ),
  },

  {
    nombre: 'un-clip-pagado-se-puede-ver-y-solo-uno-a-la-vez',
    dice: '«Generé treinta y ocho clips y no puedo ver ninguno.» Y era literal: la ficha del archivo solo cargaba la IMAGEN. Un clip pagado se anunciaba con una pastilla verde —«clip listo»— y no había ninguna manera de verlo. Treinta y ocho veces lo más caro que genera esta herramienta, invisible. Y se enseña DE UNO EN UNO: un clip son decenas de megas, y cargar los veinticuatro de la pantalla es exactamente lo que tumbó el navegador con imágenes de dos megas.',
    async comprobar(ctx) {
      const { humoDeLaPantalla, proyectoYaEmpezado } = await import('../pantalla-humo.mjs');
      const enContexto = ctx.fuentes.get('app/main.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/main.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      // 1 · UNA FICHA CON CLIP OFRECE VERLO. Se arranca de verdad: una entrada con
      // clip pagado y otra sin él.
      const p = proyectoYaEmpezado();
      p.piezas.push({
        id: 'biblioteca',
        esBiblioteca: true,
        titulo: 'x',
        escenas: [{ n: 0, titulo: 'R' }, { n: 1, titulo: 'E' }],
        tomas: [
          { i: 0, clave: 'personaje:perito:v1', personaje: 'perito', variante: 'v1', imagen: 'ok', aprobada: true, movimiento: true, video: 'ok' },
          { i: 1, clave: 'personaje:perito:v2', personaje: 'perito', variante: 'v2', imagen: 'ok', aprobada: true, movimiento: true },
        ],
      });
      const r = await humoDeLaPantalla({ parche, proyecto: p });
      fallos.push(...r.fallos);
      const botones = r.botonesDe('galeria-biblioteca').map((b) => b.texto);
      if (!botones.some((t) => /Ver el clip/.test(t))) {
        fallos.push('Una entrada con su clip pagado no ofrece verlo: lo más caro que se genera, invisible.');
      }
      // Y la que NO lo tiene no ofrece ver nada — ofrece generarlo.
      if (botones.filter((t) => /Ver el clip/.test(t)).length !== 1) {
        fallos.push('Se ofrece ver el clip de una entrada que no lo tiene.');
      }

      // 2 · NO SE CARGA SOLO. Veinticuatro clips de decenas de megas al abrir la
      // pantalla es el fallo de memoria otra vez, multiplicado por treinta.
      const i = main.indexOf('function tarjetaDeBiblioteca');
      const ficha = i < 0 ? '' : main.slice(i, main.indexOf('\n}\n', i));
      if (/materialLocal\([^)]*'video\/mp4'/.test(ficha)) {
        fallos.push('La ficha carga el clip al pintarse: veinticuatro videos de golpe tumban el teléfono.');
      }

      // 3 · Y SOLO UNO VIVO A LA VEZ. Abrir el segundo suelta el primero, o son
      // decenas de megas por cada clip que se mire.
      if (!/function soltarClip\(\)/.test(main) || !/URL\.revokeObjectURL\(clipEnPantalla\.url\)/.test(main)) {
        fallos.push('El clip que se deja de ver no se suelta: cada uno que abras se queda en memoria.');
      }
      const j = main.indexOf('async function verClip');
      const cuerpo = j < 0 ? '' : main.slice(j, j + 1200);
      if (!/soltarClip\(\);[\s\S]{0,120}createObjectURL/.test(cuerpo)) {
        fallos.push('Se crea la URL del clip nuevo sin soltar la del anterior.');
      }
      // Y NADIE crea la URL de un clip por su cuenta: el episodio tenía la misma
      // fuga, con archivos treinta veces más grandes que las imágenes.
      for (const suelta of main.matchAll(/URL\.createObjectURL\(blob\)/g)) {
        const alrededor = main.slice(Math.max(0, suelta.index - 400), suelta.index);
        if (/video\/mp4/.test(alrededor) && !/function verClip/.test(alrededor)) {
          fallos.push('Hay un clip que se abre fuera de `verClip`: esa URL no la suelta nadie.');
          break;
        }
      }
      return fallos;
    },
    // Se rompe como estaba: la ficha del archivo sin botón de ver.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace("  const tieneClip = x.video === 'ok' || !!x.heredadoVid;", '  const tieneClip = false;'),
      ),
  },

  {
    nombre: 'aprobar-fotos-no-tumba-el-navegador-ni-echa-fuera',
    dice: '«Cada vez que le apruebo una foto, se reinicia el navegador. Se reinicia la página y me saca de la sesión y tengo que estar cada dos minutos metiendo la contraseña.» Los dos síntomas eran un solo fallo. Aprobar repintaba la galería ENTERA y cada tarjeta hacía `URL.createObjectURL`, que MANTIENE VIVO EL BLOB hasta que se revoca — y no se revocaba ninguna: trece creadas en toda la aplicación, cuatro soltadas. Con imágenes de un par de megas, diez aprobaciones son cientos de megas retenidos; Safari en un iPhone descarga la pestaña. Y como la contraseña vivía en `sessionStorage`, la recarga te echaba fuera.',
    async comprobar(ctx) {
      const { humoDeLaPantalla, proyectoYaEmpezado } = await import('../pantalla-humo.mjs');
      const enContexto = ctx.fuentes.get('app/main.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/main.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      // 1 · LO QUE SE CREA SE SUELTA. Se cuenta sobre el código: cada
      // `createObjectURL` que no pase por el almacén de URL es una fuga.
      const sueltas = [...main.matchAll(/URL\.createObjectURL\(/g)].length;
      const porElAlmacen = /function urlDeMaterial\(/.test(main);
      if (!porElAlmacen) {
        fallos.push('No hay almacén de URL de objeto: cada repintado crea blobs nuevos y ninguno se suelta.');
      }
      if (!/URL\.revokeObjectURL\(url\);\s*urlesDeMaterial\.delete\(clave\);/.test(main.replace(/\s+/g, ' ').replace(/ /g, ' '))
        && !/URL\.revokeObjectURL\(url\)/.test(main)) {
        fallos.push('Las URL de objeto no se revocan nunca: el blob se queda vivo y la memoria solo sube.');
      }
      // Y la galería SUELTA lo que ya no se ve. Sin esta llamada, el almacén crece
      // igual que antes, solo que ordenado.
      if (!/soltarUrles\(new Set\(/.test(main)) {
        fallos.push('La galería no suelta las imágenes que salen de pantalla: la memoria crece con cada repintado.');
      }
      if (sueltas < 1) fallos.push('No se encuentra ninguna URL de objeto: la comprobación mira otra cosa.');

      // 2 · APROBAR NO REPINTA LA GALERÍA ENTERA. Veinticuatro lecturas del
      // almacén por un botón que cambia una tarjeta es lo que lo tumbaba.
      const i = main.indexOf('async function aprobarBiblioteca');
      const cuerpo = i < 0 ? '' : main.slice(i, i + 900);
      if (!cuerpo) fallos.push('No se encuentra el visto bueno.');
      else {
        if (/pintarBiblioteca\(\);/.test(cuerpo)) {
          fallos.push('Aprobar una imagen repinta la galería entera: veinticuatro lecturas por un botón.');
        }
        if (!/refrescarFichaBiblioteca\(/.test(cuerpo)) {
          fallos.push('Aprobar no refresca solo su ficha.');
        }
      }

      // 3 · LA CONTRASEÑA SOBREVIVE A LA RECARGA. En `sessionStorage` muere cuando
      // Safari descarga la pestaña, que es justo lo que pasaba.
      if (/sessionStorage\.setItem\('clave'/.test(main)) {
        fallos.push('La contraseña se guarda solo en la sesión: al recargar la pestaña te echa fuera.');
      }
      if (!/localStorage\.setItem\(CAJON_CLAVE/.test(main)) {
        fallos.push('La contraseña no se recuerda en el navegador.');
      }
      // Y SE PUEDE BORRAR. Guardar una contraseña sin forma de olvidarla es una
      // trampa, no una comodidad.
      if (!/localStorage\.removeItem\(CAJON_CLAVE\)/.test(main) || !/id="b-salir"/.test(fuente(ctx, 'index.html'))) {
        fallos.push('No hay forma de olvidar la contraseña en este teléfono.');
      }
      // Y escribir en el disco puede fallar —Safari en privado—: eso no puede
      // impedir entrar.
      if (!/} catch \{[\s\S]{0,200}?Safari en privado/.test(main)) {
        fallos.push('Si el navegador no deja guardar, entrar revienta en vez de seguir.');
      }

      // 4 · Y ARRANCA de verdad con una biblioteca llena, sin quejas.
      const p = proyectoYaEmpezado();
      p.piezas.push({
        id: 'biblioteca',
        esBiblioteca: true,
        titulo: 'x',
        escenas: [{ n: 0, titulo: 'R' }, { n: 1, titulo: 'E' }],
        tomas: [{ i: 0, clave: 'recurso:carretera-noche:v1', recurso: 'carretera-noche', variante: 'v1', imagen: 'ok', aprobada: false }],
      });
      const r = await humoDeLaPantalla({ parche, proyecto: p });
      fallos.push(...r.fallos);
      return fallos;
    },
    // Se rompe como estaba: aprobar repinta la galería entera.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace(
          '  refrescarFichaBiblioteca(i);\n  pintarResumenBiblioteca();',
          '  pintarBiblioteca();',
        ),
      ),
  },

  {
    nombre: 'tocar-el-archivo-mientras-genera-no-tira-lo-generado',
    dice: '«Dice que generó dos imágenes, pero es mentira, solo generó una.» `laBiblioteca()` SUSTITUÍA la pieza por una nueva, y se llama desde todo lo que toca el archivo: aprobar una imagen, rehacerla, pedirle un clip. Así que aprobar una imagen MIENTRAS corría la tanda dejaba a la tanda escribiendo en el objeto viejo, ya desligado del proyecto: la imagen se generaba, se pagaba, se subía al almacén, y la anotación se perdía en silencio. La cuenta seguía subiendo porque para la tanda había salido bien. Un objeto que se sustituye por debajo es una referencia colgada esperando su turno.',
    comprobar(ctx) {
      const { sanear, bibliotecaDe } = ctx.fn;
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      // ── 1 · LA IDENTIDAD DE LA PIEZA NO CAMBIA ────────────────────────────
      // Se reproduce el caso: alguien coge la pieza —como hace una tanda al
      // empezar—, y otro camino la vuelve a sincronizar. Tienen que seguir siendo
      // el mismo objeto, o lo que escriba el primero no llega al proyecto.
      const P = sanear({
        piezas: [
          { id: 'p01' },
          {
            id: 'biblioteca',
            esBiblioteca: true,
            tomas: [{ i: 0, clave: 'recurso:carretera-noche:v1', imagen: 'ok', aprobada: false }],
          },
        ],
      });
      // Se ejecuta LA FUNCIÓN DE VERDAD. Antes esta comprobación llevaba una copia
      // del cuerpo escrita aquí dentro, y por eso salió CIEGA: se comprobaba a sí
      // misma. La regla vive ahora en `sincronizarEnSitio`, donde se puede llamar.
      const laDeLaTanda = ctx.fn.sincronizarEnSitio(P.piezas); // la coge la tanda
      ctx.fn.sincronizarEnSitio(P.piezas); // y alguien aprueba una imagen a mitad
      if (laDeLaTanda !== bibliotecaDe(P)) {
        fallos.push('Sincronizar el archivo cambia el objeto: una tanda a medias escribiría en una pieza huérfana.');
      }
      // Y lo que la tanda escriba DESPUÉS tiene que llegar al proyecto.
      const k = laDeLaTanda.tomas.findIndex((t) => t.clave === 'recurso:carretera-noche:v1');
      laDeLaTanda.tomas[k] = { ...laDeLaTanda.tomas[k], imagen: 'ok', bytesImagen: 999 };
      if (bibliotecaDe(P).tomas.find((t) => t.clave === 'recurso:carretera-noche:v1')?.bytesImagen !== 999) {
        fallos.push('Lo que anota la tanda no llega al proyecto: la imagen se paga y no se apunta en ninguna parte.');
      }

      // ── 2 · Y EN EL CÓDIGO, NADIE SUSTITUYE LA PIEZA ──────────────────────
      if (/P\.piezas\[P\.piezas\.indexOf\(previa\)\] = z;/.test(main)) {
        fallos.push('`laBiblioteca` vuelve a sustituir la pieza: el fallo entero era esto.');
      }
      // Ni se traga una anotación que no encuentra sitio. Un `if` que descarta en
      // silencio el resultado de la fase más cara no es una guarda, es un agujero.
      if (/if \(k >= 0\) z\.tomas\[k\] = nueva;/.test(main)) {
        fallos.push('Una anotación que no encuentra su toma se descarta sin decir nada: la imagen se paga y se pierde.');
      }
      if (!/La imagen \$\{nueva\.i\} se generó y se pagó/.test(main)) {
        fallos.push('Perder una anotación no da un error visible.');
      }
      // Y se busca la pieza FRESCA en cada anotación, no una referencia cogida al
      // empezar: es el cinturón que sobrevive aunque alguien vuelva a sustituirla.
      if (!/const actual = estado\.bibliotecaDe\(P\);/.test(main)) {
        fallos.push('La anotación usa una referencia cogida al empezar la tanda en vez de buscar la pieza al día.');
      }
      return fallos;
    },
    // Se rompe como estaba: sustituyendo la pieza por una nueva, que es lo que
    // dejaba a la tanda escribiendo en el objeto viejo.
    romper: (ctx) =>
      conFuncion(ctx, 'sincronizarEnSitio', (piezas) => {
        const previa = (piezas || []).find((z) => z.esBiblioteca) || null;
        const z = ctx.fn.sincronizarBiblioteca(previa);
        if (previa) piezas[piezas.indexOf(previa)] = z;
        else piezas.push(z);
        return z;
      }),
  },

  {
    nombre: 'cualquier-imagen-del-archivo-puede-pasar-a-clip-y-se-ve-donde-se-genera',
    dice: '«Todas las imágenes deben tener su botón para generar el video, todas. Mientras más videos logres generar, mucho mejor para que se vea el documental; yo decidiré cuáles utilizar, y lo que no lleve video usará la imagen.» El botón salía solo donde el catálogo proponía movimiento —el reparto—, así que para animar un archivador o una carretera no había ninguna manera: era una decisión mía disfrazada de dato. Y encima el progreso de la tanda se pintaba siempre en «El episodio», así que generando el archivo no se veía ni la barra ni la cuenta atrás de la cuota: «dice que se está generando y no se genera nada».',
    async comprobar(ctx) {
      const { humoDeLaPantalla, proyectoYaEmpezado } = await import('../pantalla-humo.mjs');
      const enContexto = ctx.fuentes.get('app/main.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/main.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;
      const fallos = [];

      // Un archivo con un SITIO —que el catálogo no propone animar— ya generado y
      // aprobado. Antes esa ficha no tenía botón de clip por ninguna parte.
      const p = proyectoYaEmpezado();
      p.piezas.push({
        id: 'biblioteca',
        titulo: 'Biblioteca del canal',
        esBiblioteca: true,
        escenas: [{ n: 0, titulo: 'Recursos' }, { n: 1, titulo: 'Reparto' }],
        tomas: [
          { i: 0, clave: 'recurso:carretera-noche:v1', recurso: 'carretera-noche', variante: 'v1', imagen: 'ok', aprobada: true },
          { i: 1, clave: 'personaje:perito:v1', personaje: 'perito', variante: 'v1', imagen: 'ok', aprobada: true },
        ],
      });
      const r = await humoDeLaPantalla({ parche, proyecto: p });
      fallos.push(...r.fallos);

      const botones = r.botonesDe('galeria-biblioteca');
      const puedenClip = botones.filter((b) => /Generar su clip/.test(b.texto) && !b.deshabilitado).length;
      if (puedenClip < 2) {
        fallos.push(
          `Solo ${puedenClip} fichas aprobadas ofrecen su clip: un sitio o un objeto no se puede animar ` +
            'aunque su imagen esté lista y aprobada.',
        );
      }

      // Y LA MARCA SE CONSERVA. `sincronizarBiblioteca` vuelve a sacar `movimiento`
      // del catálogo en cada carga: sin conservar lo pedido a mano, un archivador
      // animado volvería a «sin movimiento» y el montaje pondría la foto fija
      // teniendo el clip pagado al lado.
      const { sincronizarBiblioteca } = ctx.fn;
      const z = sincronizarBiblioteca({
        tomas: [{ i: 0, clave: 'recurso:carretera-noche:v1', imagen: 'ok', video: 'ok', movimiento: true }],
      });
      const guardada = z.tomas.find((t) => t.clave === 'recurso:carretera-noche:v1');
      if (!guardada?.movimiento) {
        fallos.push('El movimiento pedido a mano se pierde al recargar: el clip pagado quedaría sin usarse.');
      }

      // ── Y LA TANDA SE VE DONDE SE GENERA ──────────────────────────────────
      const html = fuente(ctx, 'index.html');
      const main = fuente(ctx, 'app/main.js');
      const desde = html.indexOf('id="v-biblioteca"');
      const seccion = desde < 0 ? '' : html.slice(desde, html.indexOf('<section ', desde + 1));
      for (const [qué, id] of [
        ['barra de progreso', 'barra-biblioteca'],
        ['línea de estado', 'progreso-biblioteca'],
        ['botón de detener', 'b-detener-biblioteca'],
      ]) {
        if (!seccion.includes(`id="${id}"`)) {
          fallos.push(`El Archivo no tiene ${qué} propia: la tanda avisa en otra pantalla.`);
        }
      }
      // Las dos tandas de la biblioteca tienen que DECIR dónde pintan.
      const tandas = [...main.matchAll(/donde: 'biblioteca'/g)].length;
      if (tandas < 2) {
        fallos.push(`${tandas} de las 2 tandas del archivo dicen dónde pintar: la otra avisa en «El episodio».`);
      }
      if (!/\$\(`barra-\$\{donde\}`\)/.test(main) || !/\$\(`progreso-\$\{donde\}`\)/.test(main)) {
        fallos.push('El progreso no busca la barra de su sección: se pinta siempre en la misma.');
      }
      return fallos;
    },
    // Se rompe como estaba: el clip solo donde el catálogo lo proponía.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace(
          "if (x.video !== 'ok' && P.config.movimiento.politica.bibliotecaConVideo) {",
          "if (x.movimiento && x.video !== 'ok' && P.config.movimiento.politica.bibliotecaConVideo) {",
        ),
      ),
  },

  {
    nombre: 'la-pantalla-nunca-promete-un-caso-real',
    dice: '«¿Por qué está buscando en Internet los casos? Se supone que estamos hablando de casos inventados.» El motor pasó a construir casos y la pantalla se quedó entera hablando de lo de antes: «Busca en internet casos reales», «Seis búsquedas: cronología, fuentes oficiales, prensa», «De un caso real a un video terminado». Y a un caso INVENTADO le pintaba una pastilla ámbar de «poco documentado», que es al revés de lo que es. Un texto que describe lo que la herramienta hacía ANTES no es un texto viejo: es una mentira sobre lo que va a pasar cuando pulses. Y no puede depender de nada guardado: un proyecto de cuando existían dos modos sigue abierto ahí.',
    async comprobar(ctx) {
      const { humoDeLaPantalla, proyectoYaEmpezado } = await import('../pantalla-humo.mjs');
      const enContexto = ctx.fuentes.get('app/main.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/main.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;
      const fallos = [];

      // Se ARRANCA LA APLICACIÓN y se lee lo que queda escrito en pantalla. Mirar
      // el HTML no serviría: el HTML trae un texto de partida y lo que importa es
      // con cuál se queda.
      const arrancada = async (config) => {
        const p = proyectoYaEmpezado();
        p.config = { ...(p.config || {}), ...config };
        const r = await humoDeLaPantalla({ parche, proyecto: p });
        return {
          fallos: r.fallos,
          texto: [
            'titulo-inicio',
            'sub-inicio',
            'paso1-dice',
            'paso2-dice',
            'b-buscar-casos-texto',
            'b-investigar-fondo-texto',
            'paso6-dice',
          ]
            .map((id) => r.texto(id))
            .join(' · '),
        };
      };

      // Un proyecto de hoy, y EL PROYECTO SECUESTRADO: guardado cuando existían dos
      // modos, con `documentar` dentro. Es el que él tenía abierto, y es el que le
      // seguía diciendo que buscaba en internet.
      const hoy = await arrancada({ version: 4 });
      const viejo = await arrancada({ version: 3, investigacion: { modo: 'documentar' } });
      fallos.push(...hoy.fallos, ...viejo.fallos);

      for (const [dónde, { texto }] of [
        ['', hoy],
        [' con un proyecto guardado en el modo viejo', viejo],
      ]) {
        // 1 · La pantalla no puede prometer lo que no hace. No sale a internet, los
        // casos no son reales, y no son seis búsquedas sino una construcción.
        for (const [qué, re] of [
          ['que busca en internet', /busca en internet|buscando en internet/i],
          ['que los casos son reales', /casos reales|caso real/i],
          ['que hace seis búsquedas', /seis b[uú]squedas/i],
          ['que hay fuentes que citar', /pie de fuentes/i],
        ]) {
          if (re.test(texto)) {
            fallos.push(`La pantalla${dónde} dice ${qué}: no es lo que va a pasar al pulsar.`);
          }
        }
        // 2 · Y sí tiene que decir lo que SÍ hace.
        if (!/invent|construy|ficci[oó]n/i.test(texto)) {
          fallos.push(`La pantalla${dónde} no dice que el caso se inventa.`);
        }
      }

      // 3 · Y DICE LO MISMO CON LOS DOS. Aquí la igualdad es la comprobación: si un
      // ajuste guardado cambia lo que promete la pantalla, ha vuelto a haber dos
      // modos y uno de los dos textos miente.
      if (hoy.texto !== viejo.texto) {
        fallos.push('Un ajuste guardado cambia lo que promete la pantalla: hay dos modos otra vez.');
      }

      // 4 · Un caso construido NO se pinta como «poco documentado»: no le falta
      // documentación, es que no lleva.
      //
      // Se busca LO QUE SE PINTA, no la palabra suelta: la primera versión de esto
      // cazaba el propio comentario que explica el fallo y daba un falso positivo.
      const main = fuente(ctx, 'app/main.js');
      for (const m of main.matchAll(/pastilla p-aviso">poco documentado/g)) {
        const alrededor = main.slice(Math.max(0, m.index - 300), m.index);
        if (!/\bconstruido\b/.test(alrededor)) {
          fallos.push('Un caso construido puede salir marcado como «poco documentado»: es al revés de lo que es.');
          break;
        }
      }
      // Y al revés: tiene que haber una pastilla que diga que es ficción, o no se
      // distingue de un caso real mirando la lista.
      if (!/pastilla p-ok">ficci[oó]n/.test(main)) {
        fallos.push('Un caso inventado no se marca como ficción: en la lista se ve igual que uno real.');
      }
      return fallos;
    },
    // Se rompe como estaba: el texto del modo viejo, que es el que él leía. Va por
    // el contexto —parchea la fuente que el arnés arranca— porque lo que se mide es
    // lo que queda escrito en pantalla al arrancar.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t
          .replace(/titulo: '[^']*'/, "titulo: 'De un caso real a un video terminado'")
          .replace(/buscar: '[^']*'/, "buscar: 'Buscar casos reales'")
          .replace(/paso1: '[^']*'/, "paso1: 'Busca en internet casos reales del tema que elijas. Elige uno.'"),
      ),
  },

  {
    nombre: 'nada-de-lo-que-se-ve-parece-de-otro-pais',
    dice: '«Estás manejando del lado derecho de la carretera, bien, pero el volante del lado derecho. Sé que hay un par de países donde se maneja así, pero eso no es lo normal. Este canal es en español y es para Latinoamérica.» Salió un plano desde dentro de un coche con el volante a la derecha, y el fallo no era de esa descripción: era que NADIE le había dicho nunca al generador en qué mundo transcurre esto. Sin decirlo, cada imagen cae en el promedio de lo que el modelo vio más, y ese promedio no es el del público del canal. No es sobre dónde ocurre la historia —eso lo decide el guion—: es sobre que un volante en el lado que no toca saca al espectador de la pieza en medio segundo.',
    comprobar(ctx) {
      const { componerInstruccion, MUNDO_DEL_CANAL, huellaDePlano, RECURSOS, ELENCO, planoDeRecurso, planoDeVariante } = ctx.fn;
      const fallos = [];
      const toma = {
        i: 0,
        plano: { encuadre: 'plano general', lugar: 'una carretera', luz: 'faros', sujetos: [], descripcion: 'Un coche.' },
      };

      // 1 · LA REGLA DICE LO CONCRETO. «Ambientación latinoamericana» no le sirve a
      // un generador; «el volante a la izquierda» sí.
      for (const [qué, re] of [
        ['que el volante va a la izquierda', /volante a la IZQUIERDA/i],
        ['por qué carril se circula', /carril\s+DERECHO/i],
        ['que el mundo es hispanohablante', /hispanohablante/i],
        // Y la trampa del otro lado: pedir «Latinoamérica» a secas devuelve una
        // postal de agencia de viajes, que es igual de falso y encima cursi.
        ['que no es una postal turística', /no es una postal|folclore/i],
      ]) {
        if (!re.test(MUNDO_DEL_CANAL || '')) fallos.push(`La regla del mundo no dice ${qué}.`);
      }

      // 2 · Y SALE EN LA INSTRUCCIÓN, venga la configuración que venga. Si dependiera
      // de que alguien lo escriba en cada descripción, se perdería en la primera que
      // se olvide.
      for (const config of [ctx.config, { ...ctx.config, imagen: {} }, {}]) {
        if (!componerInstruccion(toma, config, { tratamiento: null }).includes(MUNDO_DEL_CANAL)) {
          fallos.push('La regla del mundo no llega a la instrucción con alguna configuración.');
          break;
        }
      }

      // 3 · Y DONDE EL CATÁLOGO ENSEÑA UN VOLANTE, LO DICE. La regla general es la
      // red de seguridad; el plano que enseña un salpicadero tiene que decirlo
      // encima, que es donde el generador mira primero.
      const planos = [
        ...(RECURSOS || []).flatMap((r) => (r.variantes || []).map((v) => [`${r.id}:${v.id}`, planoDeRecurso(r, v)])),
        ...(ELENCO || []).flatMap((a) => (a.variantes || []).map((v) => [`${a.id}:${v.id}`, planoDeVariante(a, v)])),
      ];
      for (const [quién, p] of planos) {
        const t = `${p?.lugar} ${p?.descripcion}`;
        if (/volante|salpicadero|al vol[aá]nte|conduciendo/i.test(t) && !/IZQUIERDA/.test(t)) {
          fallos.push(`«${quién}» enseña el puesto de conducción y no dice de qué lado va el volante.`);
        }
      }

      // 4 · Y LA HUELLA CUBRE EL ENCARGO ENTERO, no solo el plano.
      //
      // Aquí estaba el agujero de verdad: la regla del volante vive en el encargo
      // del canal, no en la descripción de la carretera. Con una huella que solo
      // mirase el plano, cambiar esta regla no habría marcado NADA, y las imágenes
      // generadas con el volante al revés se habrían quedado aprobadas y listas
      // para convertirse en clips caros.
      const p = { encuadre: 'a', lugar: 'b', luz: 'c', descripcion: 'd' };
      if (huellaDePlano(p, 'encargo viejo') === huellaDePlano(p, 'encargo nuevo')) {
        fallos.push('Cambiar una regla del canal no cambia la huella: lo ya generado seguiría dándose por bueno.');
      }
      if (huellaDePlano(p, 'x') !== huellaDePlano({ ...p }, 'x')) {
        fallos.push('La huella no es estable: marcaría todo como desfasado en cada carga.');
      }
      return fallos;
    },
    // Se rompe como estaba: sin la regla del mundo en la instrucción, que es
    // exactamente de donde salió el volante a la derecha.
    romper: (ctx) =>
      conFuncion(ctx, 'componerInstruccion', (t, c, o) =>
        ctx.fn.componerInstruccion(t, c, o).replace(ctx.fn.MUNDO_DEL_CANAL, ''),
      ),
  },

  {
    nombre: 'el-aspecto-es-del-canal-y-no-se-elige-por-proyecto',
    dice: 'Había seis estilos y se elegía uno por proyecto, con un muestrario para comparar. Con la biblioteca permanente eso deja de ser una preferencia y pasa a ser dinero: dos estilos son DOS bibliotecas de 141 imágenes, o una mezcla que no avisa —un perito en cine negro dentro de un episodio rodado en reconstrucción—. Y lo que se ganaba era un diez por ciento de la instrucción: el resto —el oficio cinematográfico, la prohibición de texto legible, la barrera documental y la paleta del director— era idéntico en los seis. Si alguien vuelve a meter un estilo por proyecto, la biblioteca se mezcla en silencio.',
    comprobar(ctx) {
      const { componerInstruccion, ESTILO_DEL_CANAL } = ctx.fn;
      const html = fuente(ctx, 'index.html');
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];
      const toma = {
        i: 0,
        plano: { encuadre: 'plano medio', lugar: 'el laboratorio', luz: 'fluorescente', sujetos: [], descripcion: 'Una mesa de acero.' },
      };

      // 1 · EL ASPECTO SALE EN LA INSTRUCCIÓN, venga la configuración que venga.
      // Es lo que garantiza que la biblioteca y los episodios se vean igual.
      for (const config of [
        ctx.config,
        { ...ctx.config, imagen: { ...ctx.config.imagen, estilo: 'noir' } },
        { ...ctx.config, imagen: {} },
        {},
      ]) {
        const p = componerInstruccion(toma, config, { tratamiento: null });
        if (!p.includes(ESTILO_DEL_CANAL)) {
          fallos.push('El aspecto del canal no llega a la instrucción con alguna configuración: se vería distinto.');
          break;
        }
      }
      // Y un «estilo» guardado en la configuración NO puede cambiar nada: si
      // cambiara, la biblioteca generada con uno se mezclaría con episodios del otro.
      const conEstilo = componerInstruccion(toma, { ...ctx.config, imagen: { ...ctx.config.imagen, estilo: 'noir' } }, { tratamiento: null });
      const sinEstilo = componerInstruccion(toma, ctx.config, { tratamiento: null });
      if (conEstilo !== sinEstilo) {
        fallos.push('Un estilo guardado en la configuración todavía cambia la imagen: vuelve el eje que multiplica la biblioteca.');
      }

      // 2 · Y NO HAY DÓNDE ELEGIRLO. Un selector que no hace nada es peor que
      // ninguno: haría creer que el aspecto es por proyecto.
      if (/id="estilo-imagen"/.test(html)) fallos.push('Sigue habiendo un selector de estilo en la pantalla.');
      if (/id="b-muestrario"|id="muestrario"/.test(html)) fallos.push('Sigue estando el muestrario de estilos.');
      if (/P\.config\.imagen\.estilo\s*=/.test(main)) {
        fallos.push('La pantalla todavía escribe un estilo en la configuración.');
      }

      // 3 · PERO SE TIENE QUE PODER VER ANTES DE PAGAR. Esa razón no ha cambiado:
      // son 141 imágenes de biblioteca, y mirarlas después es tarde.
      if (!/id="b-probar-estilo"/.test(html)) {
        fallos.push('No hay forma de ver cómo queda antes de pagar la biblioteca entera.');
      }
      if (!/id="b-ver-prompt"/.test(html)) {
        fallos.push('No se puede leer la instrucción que va a salir: se gastaría a ciegas.');
      }
      return fallos;
    },
    // Se rompe como estaba: el estilo saliendo de la configuración del proyecto.
    // Va por el contexto porque la comprobación EJECUTA `componerInstruccion`.
    romper: (ctx) =>
      conFuncion(ctx, 'componerInstruccion', (toma, config, opciones) =>
        `${config?.imagen?.estilo || 'reconstruccion'}. ` +
        ctx.fn.componerInstruccion(toma, config, opciones).replace(ctx.fn.ESTILO_DEL_CANAL, ''),
      ),
  },

  {
    nombre: 'la-pantalla-arranca-entera-aunque-la-nube-no-conteste',
    dice: 'Los tres desplegables de generadores salían VACÍOS y no se podía elegir ninguno. El catálogo estaba bien y el servidor lo devolvía entero: lo que fallaba era el viaje. Se estaba pidiendo por la red una TABLA FIJA que el navegador ya tiene dentro, así que cualquier tropiezo —la red del móvil, un despliegue a medias— dejaba sin poder elegir generador. Y eso no se ve leyendo el código: se ve ARRANCANDO LA APLICACIÓN.',
    async comprobar(ctx) {
      const { humoDeLaPantalla } = await import('../pantalla-humo.mjs');
      // Si la auditoría trae la pantalla saboteada, se arranca ESA. Sin esto la
      // prueba se haría siempre sobre el archivo bueno y saldría «ciega».
      const enContexto = ctx.fuentes.get('app/main.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/main.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;

      const fallos = [];
      const SELECTORES = [
        ['m-texto', 'el director'],
        ['m-imagen', 'el generador de imagen'],
        ['m-video', 'el generador de clips'],
      ];

      // Dos arranques: con la nube contestando, y sin ella. Los dos tienen que
      // dejar la pantalla usable, porque elegir generador no necesita internet.
      // Dos arranques. En el segundo se cae el catálogo y SOLO el catálogo: si se
      // cayera todo no se podría ni entrar, que es correcto y no prueba nada. Lo
      // que hay que probar es que una tabla fija no dependa de un viaje.
      for (const [qué, opciones] of [
        ['arrancando con la nube', { parche }],
        ['arrancando sin catálogo del servidor', { parche, fallan: ['modelos.catalogo'] }],
      ]) {
        const r = await humoDeLaPantalla(opciones);

        for (const f of r.fallos) fallos.push(`${qué}: ${f}`);
        for (const q of r.quejas()) fallos.push(`${qué}, la pantalla dice en rojo — ${q}`);
        // Un identificador que no está en el HTML es lo que dejó la previa sin su
        // contador: se pide, sale nulo, y lo que venía detrás no se ejecuta.
        for (const id of r.inexistentes) {
          fallos.push(`${qué}: se escribe en «${id}», que no existe en el HTML.`);
        }
        for (const [id, nombre] of SELECTORES) {
          if (r.opcionesDe(id) < 2) {
            fallos.push(`${qué}: ${nombre} sale con ${r.opcionesDe(id)} opciones. No se puede elegir.`);
          }
        }
        if (!r.texto('modelo-en-uso')) fallos.push(`${qué}: no se dice qué director está puesto.`);
      }
      return fallos;
    },
    // Se rompe como estaba: los desplegables esperando a que conteste la red.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace('async function cargarModelos() {\n  await pintarModelos();', 'async function cargarModelos() {'),
      ),
  },

  {
    nombre: 'se-puede-preguntar-al-almacen-que-hay-generado-de-verdad',
    dice: '«No sé qué está generado y qué no.» Y no había manera de saberlo: el proyecto anotaba «ok» cuando la llamada VOLVÍA, así que todo lo que se generó y se subió pero cuya respuesta se perdió —un corte de red, la plataforma cortando por tiempo— quedaba pagado, guardado en la nube, y marcado como si no existiera. Al volver a darle se pagaba otra vez.',
    comprobar(ctx) {
      const main = fuente(ctx, 'app/main.js');
      const html = ctx.fuentes.get('index.html') || '';
      const fallos = [];

      if (!/id="b-inventario"/.test(html)) return ['No hay forma de preguntar qué hay generado.'];
      const i = main.indexOf("accion('b-inventario'");
      if (i < 0) return ['El botón de revisar existe y no hace nada.'];
      const cuerpo = main.slice(i, main.indexOf('\nfunction informar', i));

      // La verdad la dice el ALMACÉN, no una llamada que a lo mejor no llegó.
      if (!/llamar\('listar'/.test(cuerpo)) {
        fallos.push('No se le pregunta al almacén: seguiría mandando la memoria de la llamada.');
      }
      if (!/bytes > 0/.test(cuerpo)) {
        fallos.push('Un archivo vacío contaría como generado.');
      }
      // Va en los DOS sentidos. Solo marcar lo que hay dejaría tomas que dicen
      // tener imagen y cuya imagen no existe, y eso para el montaje a mitad.
      if (!/quitadas/.test(cuerpo)) {
        fallos.push('Solo se marca lo que hay; lo que consta y no está seguiría constando.');
      }
      // Y lo heredado o repetido no tiene archivo propio: preguntar por él daría
      // «no está» y lo desmarcaría, que es al revés de la verdad.
      if (!/heredado/.test(cuerpo) || !/reusa/.test(cuerpo)) {
        fallos.push('Lo heredado o repetido se desmarcaría por no tener archivo propio.');
      }
      // Y se escribe (§7.3): si no se guarda, al recargar vuelve lo de antes.
      if (!/await guardar\(\)/.test(cuerpo)) fallos.push('Lo averiguado no se guarda.');
      if (!/pintarTodo\(\)/.test(cuerpo)) fallos.push('Se averigua y la pantalla no se entera.');
      return fallos;
    },
    romper: (ctx) => editando(ctx, 'app/main.js', (t) => t.replace(/\bquitadas\b/g, 'puestas')),
  },

  {
    nombre: 'el-estado-de-cada-fase-se-ve-en-su-boton',
    dice: '«¿Cómo se supone que yo voy a entender eso?» — y tenía razón: el estado de cada fase existía pero solo salía en un texto después de apretar algo, y el inventario contestaba «88 materiales en el almacén», que no dice si se puede montar. Cada botón lleva ahora su cuenta —hecho/total, verde completa, ámbar a medias— y el inventario contesta por fases.',
    async comprobar(ctx) {
      const main = fuente(ctx, 'app/main.js');
      const html = ctx.fuentes.get('index.html') || '';
      const fallos = [];

      // 1 · Las cinco cuentas existen en el HTML, DENTRO de su botón. La quinta
      // es la dirección de arte: hay dos cosas con nombre parecido —el DIRECTOR
      // (tratamiento) y la DIRECCIÓN DE ARTE (fichas de plano)— y la primera
      // salía como lista mientras la segunda faltaba entera sin decirlo nadie.
      for (const [id, boton] of [
        ['cf-voz', 'b-narrar'],
        ['cf-imagenes', 'b-imagenes'],
        ['cf-clips', 'b-movimiento'],
        ['cf-musica', 'b-musica'],
        ['cf-direccion', 'b-dirigir'],
      ]) {
        const b = html.indexOf(`id="${boton}"`);
        const c = html.indexOf(`id="${id}"`);
        if (c < 0) fallos.push(`Falta la cuenta «${id}» en el HTML.`);
        else if (b < 0 || c < b || html.indexOf('</button>', b) < c) {
          fallos.push(`La cuenta «${id}» no está dentro de su botón: se vería suelta por ahí.`);
        }
      }

      // 2 · Los totales salen de los MISMOS planificar que usan los botones, con
      // «todas» puesto. Contar tomas a pelo volvería a contar como pendiente lo
      // heredado y lo repetido, que no hay que generar nunca.
      const i = main.indexOf('function cuentasDeFases');
      if (i < 0) return [...fallos, 'No hay quien calcule las cuentas por fase.'];
      const cuerpo = main.slice(i, main.indexOf('\nfunction pintarPasos', i));
      for (const p of ['imagenFase.planificar', 'movimiento.planificar', 'musica.planificar']) {
        if (!cuerpo.includes(p)) fallos.push(`Las cuentas no salen de ${p}: contarían lo que no hay que generar.`);
      }
      if (!/soloLasQueFaltan: false/.test(cuerpo)) {
        fallos.push('Las cuentas usan «solo las que faltan»: el total saldría mal en cuanto hubiera algo hecho.');
      }
      // Y se pintan donde se pintan los pasos, que corre tras cada fase y al cargar.
      if (!/pintarCuentasFase\(\);/.test(main.slice(main.indexOf('function pintarPasos')))) {
        fallos.push('Las cuentas no se refrescan con los pasos: se quedarían viejas.');
      }

      // 3 · El inventario contesta POR FASES, no en archivos.
      const j = main.indexOf("accion('b-inventario'");
      if (j >= 0 && !/cuentasDeFases\(\)/.test(main.slice(j, j + 3500))) {
        fallos.push('El inventario no contesta por fases: vuelve «88 materiales en el almacén».');
      }

      // 4 · Y EN EJECUCIÓN: arrancada la aplicación con un proyecto a medias, las
      // cuentas están llenas y con la forma hecho/total.
      const { humoDeLaPantalla, proyectoYaEmpezado } = await import('../pantalla-humo.mjs');
      const enContexto = ctx.fuentes.get('app/main.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/main.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;
      const r = await humoDeLaPantalla({ parche });
      for (const id of ['cf-voz', 'cf-imagenes', 'cf-musica', 'cf-direccion']) {
        if (!/^\d+\/\d+$/.test(r.texto(id))) {
          fallos.push(`Arrancada la aplicación, «${id}» dice «${r.texto(id)}» en vez de hecho/total.`);
        }
      }

      // 5 · Y el caso que dolió: la dirección PERDIDA se dice en el paso 4, con
      // su cuenta, sin tener que apretar Imágenes para descubrirla.
      const perdido = proyectoYaEmpezado();
      for (const t of perdido.piezas[0].tomas) t.plano = null;
      const sin = await humoDeLaPantalla({ parche, proyecto: perdido });
      if (sin.texto('cf-direccion') !== '0/12') {
        fallos.push(`Con la dirección perdida, su cuenta dice «${sin.texto('cf-direccion')}» en vez de 0/12.`);
      }
      if (!/Dirección de arte 0\/12/.test(sin.html('estado-direccion'))) {
        fallos.push('Con la dirección perdida, el paso 4 no lo dice: se descubre al darle a Imágenes, como antes.');
      }
      return fallos;
    },
    // Se rompe como estaba: el estado existe pero nadie lo pinta.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) => t.replace('  pintarCuentasFase();\n', '')),
  },

  {
    nombre: 'la-nube-devuelve-lo-que-el-telefono-pierda',
    dice: '«Se supone que iban a quedar guardadas, pero cada vez que actualizo se borran.» El proyecto vivía SOLO en el teléfono: la copia de la nube existía pero había que subirla a mano con un botón, y Safari borra su almacén local cuando le parece. Las fichas, la dirección y el guion desaparecían «guardados» y tocaba volver a pagarlos.',
    async comprobar(ctx) {
      const estado = fuente(ctx, 'app/estado.js');
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      // 1 · La subida se mantiene sola: cada guardado la programa, con calma.
      if (!/programarSubida\(proyecto\)/.test(estado)) {
        fallos.push('Guardar no programa la copia de la nube: el teléfono vuelve a ser el único que tiene el proyecto.');
      }
      if (!/ENTRE_SUBIDAS/.test(estado)) {
        fallos.push('Las subidas no van espaciadas: una por toma generada saturaría la puerta.');
      }
      if (!/subidaPendiente\.unref\?\.\(\)/.test(estado)) {
        fallos.push('El temporizador retendría vivo el proceso de las pruebas.');
      }

      // 2 · Y EN EJECUCIÓN, los dos sentidos. El teléfono perdió todo y la nube lo
      // tiene: el arranque lo recupera solo. La nube es más vieja: no pisa.
      const { humoDeLaPantalla, proyectoYaEmpezado } = await import('../pantalla-humo.mjs');
      const enContexto = ctx.fuentes.get('app/main.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/main.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;

      const rec = await humoDeLaPantalla({ parche, proyecto: null, nube: proyectoYaEmpezado() });
      if (rec.texto('cf-voz') !== '8/12') {
        fallos.push(
          `El teléfono sin nada y la nube con el proyecto: tras arrancar, la voz dice ` +
            `«${rec.texto('cf-voz')}» en vez de «8/12». No se recuperó.`,
        );
      }

      const vieja = proyectoYaEmpezado();
      vieja.modificado = 1;
      vieja.piezas[0].tomas = [];
      const localNueva = proyectoYaEmpezado();
      localNueva.modificado = 9e15;
      const pisa = await humoDeLaPantalla({ parche, proyecto: localNueva, nube: vieja });
      if (pisa.texto('cf-voz') !== '8/12') {
        fallos.push('Una copia de nube MÁS VIEJA pisó el trabajo local más nuevo.');
      }
      return fallos;
    },
    // Se rompe como estaba: el arranque sin mirar la nube.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace('const ids = await estado.listarRemotos();', 'const ids = [];'),
      ),
  },

  {
    nombre: 'la-revision-individual-no-necesita-preparar',
    dice: '«Cada vez que refresco tengo que darle a Preparar para volver a escuchar lo que generé.» Las listas por tipo —voz, imágenes, música, clips— se llenaban de `preparada`, que vive en memoria: cada recarga las vaciaba, con todo el material pagado y guardado ahí debajo. Revisar y rehacer una pieza no puede depender de armar el montado entero.',
    async comprobar(ctx) {
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      // 1 · Las listas salen del proyecto, no de la previa preparada.
      const i = main.indexOf('function pintarPorTipo');
      // El final del cuerpo es el siguiente bloque de nivel superior, sea función
      // o acción: cortar en el primero que aparezca, no en uno fijo.
      const cortes = ['\nfunction ', '\nasync function ', '\naccion(', '\n// ── ']
        .map((m) => main.indexOf(m, i + 10))
        .filter((k) => k > 0);
      const cuerpo = i < 0 ? '' : main.slice(i, cortes.length ? Math.min(...cortes) : undefined);
      if (!cuerpo) return ['No se encuentra quien pinta las listas por tipo.'];
      if (/preparada/.test(cuerpo)) {
        fallos.push('Las listas por tipo siguen leyendo la previa preparada: al recargar quedan vacías.');
      }
      // Y lo pesado se carga AL PEDIRLO: ochenta clips de 35 MB por abrir una
      // pestaña es justo lo que un teléfono no aguanta.
      if (!/cargar: /.test(cuerpo)) fallos.push('La voz y la música se bajarían en masa al pintar la lista.');
      if (!/materialLocal\(/.test(cuerpo)) {
        fallos.push('Las listas no pasan por la caché local: cada visita volvería a bajar todo.');
      }

      // 2 · Y EN EJECUCIÓN: arrancada la aplicación SIN preparar nada, las listas
      // están llenas y con sus cuentas.
      const { humoDeLaPantalla } = await import('../pantalla-humo.mjs');
      const enContexto = ctx.fuentes.get('app/main.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/main.js'), 'utf8');
      const r = await humoDeLaPantalla({ parche: enContexto !== enDisco ? () => enContexto : null });
      for (const [id, espera] of [
        ['cuenta-voz', '8/12'],
        ['cuenta-imagenes', '6/11'],
        ['cuenta-musica', '1/2'],
        ['cuenta-clips', '1/1'],
      ]) {
        if (r.texto(id) !== espera) {
          fallos.push(`Sin preparar, «${id}» dice «${r.texto(id)}» y el proyecto sembrado tiene ${espera}.`);
        }
      }
      return fallos;
    },
    // Se rompe como estaba: las listas leyendo una previa que no existe aún.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace(
          'const mia = ++versionMateriales;\n  const t = pieza().tomas;',
          'const mia = ++versionMateriales;\n  const t = [];',
        ),
      ),
  },

  {
    nombre: 'el-texto-de-una-toma-se-edita-donde-se-escucha',
    dice: 'La toma 1 leía un código de expediente enterito —«NCT00076648»— y arreglar eso exigía irse al guion, encontrar la frase, volver a partir todo y perder el estado de las 83 tomas. El texto de una toma no sostiene nada más que su voz: cambiarlo solo obliga a volver a narrar su bloque, y todo lo demás —imagen, música, estructura— se queda como está.',
    comprobar(ctx) {
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      const i = main.indexOf('async function editarTextoDeToma');
      if (i < 0) return ['No hay forma de editar el texto de una toma.'];
      const cuerpo = main.slice(i, i + 2200);

      // 1 · La fila de voz lo ofrece: se edita donde se escucha.
      if (!/alEditar: \(nuevo\) => editarTextoDeToma\(x\.i, nuevo\)/.test(main)) {
        fallos.push('La fila de voz no ofrece editar: la función existe y no la llama nadie.');
      }
      // 2 · El guion maestro sigue al cambio cuando la frase se encuentra tal
      // cual: si no, volver a partir el guion resucitaría el texto viejo.
      if (!/guion\.includes\(viejo\)/.test(cuerpo) || !/guion\.replace\(viejo, texto\)/.test(cuerpo)) {
        fallos.push('El guion maestro no sigue al cambio: re-partirlo resucitaría el texto viejo.');
      }
      // 3 · La voz vieja no puede hacerse pasar por la nueva: se desmarca ANTES
      // de narrar, así un fallo deja la toma contada como pendiente.
      const marca = cuerpo.indexOf('t.audio = null;');
      const narra = cuerpo.indexOf('await rehacerVoz(');
      if (marca < 0 || narra < 0 || marca > narra) {
        fallos.push('La voz vieja no se desmarca antes de narrar: un fallo la dejaría haciéndose pasar por la nueva.');
      }
      // 4 · Y NO toca lo que no es suyo: ni imagen, ni plano, ni escena.
      if (/t\.imagen|t\.plano|t\.video/.test(cuerpo)) {
        fallos.push('Editar el texto toca material que no depende de él.');
      }
      return fallos;
    },
    // Se rompe como estaba: la voz vieja sobrevive al cambio de texto.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace('  t.audio = null;\n  t.corteExacto = false;\n', '')),
  },

  {
    nombre: 'el-reproductor-se-queda-quieto-y-tiene-modo-cine',
    dice: 'En cada cambio de toma, el reproductor seguía a la tira activa con scrollIntoView y BAJABA LA PÁGINA entera: el visor se iba de pantalla una vez por toma y había que subir a mano, ochenta y tres veces. Y no había pantalla completa — en el teléfono la nativa solo existe para <video>, y esto es un lienzo con WebAudio.',
    comprobar(ctx) {
      const main = fuente(ctx, 'app/main.js');
      const html = ctx.fuentes.get('index.html') || '';
      const css = hoja(ctx);
      const fallos = [];

      // La LLAMADA, no la palabra: el comentario que explica por qué se quitó
      // también dice «scrollIntoView» y no es un fallo.
      if (/\.scrollIntoView\(/.test(main)) {
        fallos.push('El reproductor sigue moviendo la página con scrollIntoView: se va de pantalla en cada toma.');
      }
      // DENTRO DEL VISOR, contando las etiquetas. Antes esto se medía por
      // distancia —«a menos de 600 caracteres del visor»— y era frágil de la peor
      // manera: añadir un comentario o un atributo dentro del visor rompía la
      // comprobación sin que nada estuviera mal. Se mide la anidación, que es lo
      // que de verdad importa: en modo cine el visor se fija a la pantalla, y un
      // botón fuera de él se queda detrás.
      const v = html.indexOf('id="visor-montado"');
      const botonCine = html.indexOf('id="b-cine"');
      if (v < 0) fallos.push('El visor del montado no tiene identidad: no hay a qué ponerle el modo cine.');
      else {
        let hondo = 1;
        let i = html.indexOf('>', v) + 1;
        let fin = -1;
        while (i < html.length && hondo > 0) {
          const abre = html.indexOf('<div', i);
          const cierra = html.indexOf('</div>', i);
          if (cierra < 0) break;
          if (abre >= 0 && abre < cierra) {
            hondo++;
            i = abre + 4;
          } else {
            hondo--;
            i = cierra + 6;
            if (hondo === 0) fin = cierra;
          }
        }
        if (fin < 0) fallos.push('El visor del montado no cierra: el HTML está mal formado.');
        else if (botonCine < v || botonCine > fin) {
          fallos.push('El botón de cine no está DENTRO del visor: en modo cine se quedaría detrás.');
        }
      }
      const regla = css.indexOf('.visor.cine{');
      if (regla < 0 || !/position:fixed/.test(css.slice(regla, css.indexOf('}', regla)))) {
        fallos.push('El modo cine no fija el visor a la pantalla: seguiría dentro del flujo, saltando.');
      }
      // Misma especificidad que la regla vertical: gana la última. La de cine va
      // DESPUÉS o el 9:16 la pisa y el cine sale a media pantalla.
      if (regla >= 0 && css.indexOf('.formato-vertical .visor{') > regla) {
        fallos.push('La regla del cine está antes que la del formato vertical: con 9:16 puesto, el cine no llena.');
      }
      if (!/\$\('b-cine'\)\?\.addEventListener\('click'/.test(main) || !/classList\.toggle\('cine'\)/.test(main)) {
        fallos.push('El botón de cine no hace nada.');
      }
      return fallos;
    },
    // Se rompe como estaba: el botón existe y nadie lo escucha.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace("$('b-cine')?.addEventListener('click', () => {", "void (() => {"),
      ),
  },


  {
    nombre: 'los-medios-se-sirven-por-blob-no-por-data',
    dice: '«Ni siquiera me deja escuchar las voces para seleccionar una voz nueva.» La muestra de voz se servía como `data:audio/wav;base64,…`, y Safari de iPhone NO reproduce medios en un data: URI —quiere poder pedir rangos de bytes—. El reproductor aparecía y no sonaba nunca. Con un blob del navegador sí; y hay que soltar el anterior, o cada prueba deja una muestra colgada en memoria.',
    comprobar(ctx) {
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      // Ni un solo medio servido por data: en toda la pantalla.
      for (const m of main.matchAll(/data:(audio|video|image)\/[^`'"]*/g)) {
        fallos.push(`Se sirve un medio por data: URI (${m[0].slice(0, 40)}…): en iPhone no suena.`);
      }
      // La muestra de voz, por blob y con su URL liberada.
      const i = main.indexOf("'b-probar-voz'");
      const cuerpo = i < 0 ? '' : main.slice(i, i + 1800);
      if (!/createObjectURL/.test(cuerpo)) fallos.push('La muestra de voz no se sirve por blob.');
      if (!/revokeObjectURL/.test(cuerpo)) fallos.push('La muestra de voz no libera la anterior: una fuga por cada prueba.');
      // Y si el navegador se niega a sonar solo tras el `await`, se dice en vez de
      // callarlo: un catch vacío es indistinguible de que no funcione.
      if (/a\.play\(\)\.catch\(\(\) => \{\}\)/.test(cuerpo)) {
        fallos.push('El fallo de reproducción se traga en silencio: parece que el botón no hace nada.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace('const url = URL.createObjectURL(deBase64(r.datos, r.tipo || ', 'const url = (`data:audio/wav;base64,${r.datos}`, ('),
      ),
  },

  {
    nombre: 'los-dos-visuales-del-visor-se-superponen',
    dice: 'El visor tiene DOS visuales —la imagen de las tomas fijas y el video de las que llevan clip— y solo uno se enseña cada vez. En flujo normal no caben: los dos son alto 100 %, así que el primero ocupa el visor entero y el segundo cae debajo, donde `overflow:hidden` lo recorta. Y ocultar el primero con `visibility` no lo saca del flujo: sigue ocupando su sitio. Resultado en pantalla: el visor NEGRO en todas las tomas con clip, con el clip bajado y las tiras enseñándolo. Van superpuestos en absoluto, y entonces da igual cuál se muestre.',
    comprobar(ctx) {
      const css = hoja(ctx);
      const js = fuente(ctx, 'app/previa.js');
      const fallos = [];

      // Los dos, colocados en absoluto sobre el visor.
      const puestos = /\.visor\s+#previa-imagen\s*,\s*\.visor\s+#previa-clip\{([^}]*)\}/.exec(css);
      if (!puestos) fallos.push('Los dos visuales del visor no se colocan juntos: uno tapará al otro o caerá fuera.');
      else if (!/position:\s*absolute/.test(puestos[1])) {
        fallos.push('Los visuales del visor no van en absoluto: el segundo cae fuera del recorte y no se ve.');
      }
      // Y el visor los recorta, que es lo que hace el fallo invisible.
      const v = /\.visor\{([^}]*)\}/.exec(css);
      if (v && !/position:\s*relative/.test(v[1])) {
        fallos.push('El visor no es el ancla de los visuales colocados en absoluto.');
      }

      // Y se alterna con `display`, no con `visibility`: lo segundo deja el hueco
      // ocupado, que es justo lo que empujaba el video fuera de la vista.
      if (/lienzo\.style\.visibility/.test(js)) {
        fallos.push('El visor se oculta con `visibility`: sigue ocupando su sitio y empuja al otro visual.');
      }
      // Uno u otro, nunca los dos: si la imagen se muestra sin apagar el video, el
      // video de la toma anterior se queda encima.
      if (!/clip\.style\.display = 'none'/.test(js)) {
        fallos.push('El video no se apaga al pintar una toma fija: se quedaría encima de la imagen.');
      }
      return fallos;
    },
    // Se rompe como estaba: los dos en flujo y ocultando con `visibility`.
    romper: (ctx) =>
      editando(ctx, 'index.html', (t) =>
        t.replace('.visor #previa-imagen,.visor #previa-clip{position:absolute;inset:0}', ''),
      ),
  },

  {
    nombre: 'los-botones-se-pulsan-y-no-revientan',
    dice: '«Can\'t find variable: dueña», en pantalla, al darle a Preparar. Lo puso una limpieza que borró la declaración y dejó el uso. `node --check` no lo ve —es sintaxis válida— y el arnés tampoco lo veía: ARRANCABA la aplicación y ahí se quedaba, y `preparar()` solo corre cuando alguien pulsa. Un fallo de programación en cualquier manejador viajaba entero hasta el teléfono. Ahora el arnés PULSA, y un error que solo puede ser un fallo de programación —una variable que no existe, algo que no es función— no pasa de aquí.',
    async comprobar(ctx) {
      const { humoDeLaPantalla } = await import('../pantalla-humo.mjs');
      const enContexto = ctx.fuentes.get('app/main.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/main.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;

      // El camino que recorre quien monta: preparar, reproducir, parar, y las
      // consultas que no gastan. Todos con el proyecto ya empezado del arnés.
      //
      // Y los que tocan catálogos y piezas nuevas —reutilizar, la biblioteca—:
      // un botón que no se pulsa aquí es un botón cuyo manejador viaja entero al
      // teléfono, que es literalmente cómo llegó «Can't find variable: dueña».
      // Los tres se paran solos antes de gastar nada: sin otros casos, sin
      // imágenes que falten, o preguntando.
      const r = await humoDeLaPantalla({
        parche,
        pulsa: [
          'b-preparar-previa',
          'b-reproducir',
          'b-parar-previa',
          'b-inventario',
          'b-comprobar',
          'b-reutilizar',
          'b-biblioteca-imagenes',
          'b-biblioteca-clips',
        ],
      });

      const fallos = [...r.fallos];
      // LO QUE SE BUSCA NO ES «UN ERROR»: es un error que SOLO puede ser un fallo
      // de programación. «Elige un caso primero» es un mensaje escrito a mano y
      // está bien que salga; «dueña is not defined» no lo escribió nadie.
      const DE_PROGRAMACION = [
        /is not defined/i,
        /Can't find variable/i,
        /is not a function/i,
        /is not a constructor/i,
        /Cannot read propert/i,
        /undefined is not an object/i,
        /is not iterable/i,
        /of undefined/i,
      ];
      for (const q of [...r.dichas(), ...r.quejas()]) {
        if (DE_PROGRAMACION.some((re) => re.test(q))) {
          fallos.push(`Un manejador revienta por un fallo de programación → ${q}`);
        }
      }
      return fallos;
    },
    // Se rompe como se rompió: un nombre que no existe dentro de un manejador.
    // Es sintaxis válida —`node --check` la da por buena— y solo estalla cuando
    // alguien pulsa, que es exactamente por lo que llegó al teléfono.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace(
          "    if (!pieza().tomas.length) throw new Error('Todavía no hay tomas.');",
          "    if (!piezaQueNadieDeclaro().tomas.length) throw new Error('Todavía no hay tomas.');",
        ),
      ),
  },

  {
    nombre: 'el-formato-elegido-manda-tambien-en-los-visores',
    dice: 'Se eligió 9:16 y la previa salía «en 16:9». El material estaba bien —las imágenes se piden en 9:16 y la hoja intercambia ancho y alto— pero los visores estaban dibujados a 16:9 FIJO en el CSS, y con object-fit:cover recortaban lo vertical para llenar el marco: un 9:16 amputado se lee como «se está generando mal».',
    async comprobar(ctx) {
      const css = hoja(ctx);
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      for (const [regla, que] of [
        ['.formato-vertical .visor', 'el visor del montado'],
        ['.formato-vertical .pieza-mat img', 'las miniaturas de la galería'],
        ['.formato-vertical .tira img', 'las tiras'],
      ]) {
        const i = css.indexOf(regla);
        if (i < 0) fallos.push(`No hay regla vertical para ${que}: seguiría clavado en 16:9.`);
        else if (!/9\/16/.test(css.slice(i, css.indexOf('}', i)))) {
          fallos.push(`La regla vertical de ${que} no dice 9/16.`);
        }
      }
      if (!/classList\.toggle\('formato-vertical', !!P\.config\.formato\.vertical\)/.test(main)) {
        fallos.push('Nadie pone la clase en el cuerpo: las reglas verticales no se aplicarían nunca.');
      }

      // Y EN EJECUCIÓN, los dos formatos: con vertical elegido la clase está; sin
      // él, no está. La configuración pasa por sanear, como en la vida real.
      const { humoDeLaPantalla, proyectoYaEmpezado } = await import('../pantalla-humo.mjs');
      const enContexto = ctx.fuentes.get('app/main.js');
      const enDisco = readFileSync(join(ctx.raiz, 'app/main.js'), 'utf8');
      const parche = enContexto !== enDisco ? () => enContexto : null;

      const vertical = proyectoYaEmpezado();
      vertical.config = { formato: { vertical: true } };
      const v = await humoDeLaPantalla({ parche, proyecto: vertical });
      if (!v.claseCuerpo('formato-vertical')) {
        fallos.push('Con 9:16 elegido, el cuerpo no lleva la clase: los visores siguen en 16:9.');
      }
      const h = await humoDeLaPantalla({ parche });
      if (h.claseCuerpo('formato-vertical')) {
        fallos.push('Sin 9:16 elegido, la clase está puesta igual: el 16:9 saldría amputado.');
      }
      return fallos;
    },
    // Se rompe como estaba: nadie pone la clase.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace("  document.body.classList.toggle('formato-vertical', !!P.config.formato.vertical);\n", ''),
      ),
  },
];
