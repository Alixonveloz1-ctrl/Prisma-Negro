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
    nombre: 'los-estilos-se-eligen-mirandolos-todos',
    dice: 'El estilo se decide ANTES de generar las ochenta imágenes del documental, y comparando. Solo se podía probar el que estuviera puesto, de uno en uno: para comparar seis había que cambiar el desplegable seis veces y fiarse de la memoria.',
    async comprobar(ctx) {
      const html = fuente(ctx, 'index.html');
      const main = fuente(ctx, 'app/main.js');
      const img = fuente(ctx, 'app/fases/imagen.js');
      const { ESTILOS } = await import('../../comun/estilos.mjs');
      const fallos = [];

      if (!/id="b-muestrario"/.test(html)) fallos.push('No hay forma de ver todos los estilos.');
      if (!/id="muestrario"/.test(html)) fallos.push('No hay dónde enseñarlos.');

      // Una muestra POR ESTILO, y con el estilo de esa muestra, no con el puesto.
      const i = img.indexOf('export async function muestrarioDeEstilos');
      if (i < 0) return [...fallos, 'No existe el muestrario.'];
      const cuerpo = img.slice(i, img.indexOf('\nexport const claveMuestra', i));
      if (!/for \(const \[n, estilo\] of ESTILOS/.test(cuerpo)) {
        fallos.push('El muestrario no recorre todos los estilos.');
      }
      if (!/estilo: estilo\.id/.test(cuerpo)) {
        fallos.push('Cada muestra se genera con el estilo puesto, no con el suyo: saldrían seis iguales.');
      }
      // Y cada una con su clave, o se pisarían entre ellas.
      if (!/claveMuestra\(pieza, estilo\.id\)/.test(cuerpo)) {
        fallos.push('Las muestras comparten clave: cada una borraría la anterior.');
      }
      // Guardadas: volver a la pantalla no puede volver a cobrar seis imágenes. Se
      // consigue bajándolas con el descargador común, que deja copia local.
      if (!/await material\(clave/.test(cuerpo)) {
        fallos.push('Las muestras no se bajan con el descargador común: no quedaría copia y se pagarían cada vez.');
      }
      if (!/muestrasGuardadas/.test(main)) fallos.push('La pantalla no enseña las muestras ya pagadas.');

      // Y elegir una tiene que ESCRIBIR la elección (§7.3).
      if (!/P\.config\.imagen\.estilo = m\.estilo\.id/.test(main)) {
        fallos.push('Tocar una muestra no cambia el estilo que se va a usar.');
      }
      if (ESTILOS.length < 2) fallos.push('No hay estilos que comparar.');
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/fases/imagen.js', (t) =>
        t.replace('estilo: estilo.id', 'estilo: config.imagen.estilo'),
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
      const v = html.indexOf('id="visor-montado"');
      const botonCine = html.indexOf('id="b-cine"');
      if (v < 0) fallos.push('El visor del montado no tiene identidad: no hay a qué ponerle el modo cine.');
      else if (botonCine < v || botonCine - v > 600) {
        fallos.push('El botón de cine no está dentro del visor.');
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
    nombre: 'la-voz-se-agrava-al-montar-sin-mover-el-reloj',
    dice: '«Poder poner la voz más grave sin tener que regenerar todo otra vez.» La gravedad se aplica AL MONTAR, sobre el audio ya generado: bajar el tono con asetrate también frena el audio, y sin el atempo recíproco cada toma saldría más larga, la sincronía se correría toma a toma y el documental entero quedaría desfasado.',
    comprobar(ctx) {
      const { construirHoja, guionFfmpeg, normalizar } = ctx.fn;
      const fallos = [];
      const plano = { encuadre: 'plano medio', movimientoCamara: 'fijo', lugar: 'x', luz: 'y', sujetos: [], descripcion: 'd' };
      const tomas = [{ i: 0, escena: 0, segundos: 6, medida: true, plano, audio: 'ok', corteExacto: true }];

      // 1 · Con gravedad: el par asetrate/atempo, y EXACTAMENTE recíproco.
      const conGrave = guionFfmpeg(construirHoja({ pieza: 'p01', tomas, escenas: [{ n: 0 }], config: { gravedadVoz: -3, muestreo: 48000 } }));
      const rate = /asetrate=(\d+)/.exec(conGrave);
      const tempo = /atempo=([\d.]+)/.exec(conGrave);
      if (!rate || !tempo) {
        fallos.push('Con gravedad puesta no aparece el par asetrate/atempo: la voz no se agrava.');
      } else {
        const producto = (Number(rate[1]) / 48000) * Number(tempo[1]);
        if (Math.abs(producto - 1) > 0.001) {
          fallos.push(`El par no es recíproco (producto ${producto.toFixed(4)}): cada toma cambiaría de duración y el documental se correría.`);
        }
      }

      // 2 · Sin gravedad, ni rastro: cero es «tal cual salió».
      const sinGrave = guionFfmpeg(construirHoja({ pieza: 'p01', tomas, escenas: [{ n: 0 }] }));
      if (/asetrate=/.test(sinGrave)) fallos.push('Con gravedad cero se recodifica el tono igualmente.');

      // 3 · El mando tiene tope y está cableado en Ajustes.
      if (normalizar({ montaje: { gravedadVoz: -99 } }).montaje.gravedadVoz !== -6) {
        fallos.push('La gravedad no tiene tope: un valor loco haría la voz un monstruo.');
      }
      const main = fuente(ctx, 'app/main.js');
      if (!/P\.config\.montaje\.gravedadVoz = Number\(\$\('gravedad'\)\.value\)/.test(main)) {
        fallos.push('El deslizador de gravedad no guarda: se ajusta y no pasa nada.');
      }

      // 4 · Y la otra mitad de la continuidad: la voz de Gemini con temperatura
      // CERO. Sin fijarla, cada una de las 83 llamadas interpreta distinto — «no
      // lo narra como una historia, narra cada clip por su cuenta».
      const prov = fuente(ctx, 'api/_lib/proveedor.js');
      const g = prov.indexOf('export async function vozGemini');
      if (g < 0 || !/temperature: 0/.test(prov.slice(g, g + 1600))) {
        fallos.push('La voz de Gemini va sin temperatura fija: cada llamada con un tono distinto.');
      }
      return fallos;
    },
    // Se rompe como estaba a punto de romperse: el asetrate sin su atempo.
    romper: (ctx) =>
      conFuncion(ctx, 'guionFfmpeg', (hoja) => ctx.fn.guionFfmpeg(hoja).replace(/,atempo=[\d.]+/g, '')),
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
