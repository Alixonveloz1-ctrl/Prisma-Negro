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
  // ── Los catálogos ─────────────────────────────────────────────────────────
  {
    nombre: 'cada-genero-del-catalogo-se-sostiene-solo',
    dice: 'La regla del catálogo de géneros es que uno nuevo se añade a la tabla y no se toca nada más —la misma que el README le aplica al montador—. Eso solo se sostiene si CADA fila está completa: unos pesos que no sumen 1 reparten mal los minutos sin dar error, un bloque sin función manda a escribir «avanzar el relato», y un estilo por defecto que no existe en el catálogo de estilos se cae en silencio al primer episodio. Nada de eso se ve leyendo la tabla, y el que añada el séptimo género no va a acordarse de las cuatro cosas.',
    comprobar(ctx) {
      const {
        GENEROS, GENERO_POR_DEFECTO, generoPorId,
        ELENCO, RECURSOS, VERSIONES_MINIMAS, EPISODIOS_SIN_REPETIR,
        arquetipoPorId, personajesDe, planoDeVariante, planoDeRecurso,
      } = ctx.fn;
      const fallos = [];
      if (!GENEROS?.length) return ['El catálogo de géneros está vacío.'];

      const vistos = new Set();
      for (const g of GENEROS) {
        const quién = g?.id || '(sin id)';
        if (!g?.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(g.id)) {
          fallos.push(`El género «${quién}» no tiene una clave estable: la configuración guarda esto.`);
        }
        if (vistos.has(g?.id)) fallos.push(`La clave «${quién}» está dos veces: una de las dos es inalcanzable.`);
        vistos.add(g?.id);
        for (const campo of ['nombre', 'resumen']) {
          if (!String(g?.[campo] || '').trim()) fallos.push(`El género «${quién}» no tiene ${campo}: no se puede elegir a ciegas.`);
        }

        // Los bloques: la estructura del episodio.
        const bloques = g?.bloques || [];
        if (bloques.length < 3) {
          fallos.push(`El género «${quién}» tiene ${bloques.length} bloques: eso no es una estructura.`);
        }
        const suma = bloques.reduce((s, b) => s + (Number(b?.peso) || 0), 0);
        if (Math.abs(suma - 1) > 0.001) {
          fallos.push(
            `Los pesos de «${quién}» suman ${suma.toFixed(3)} y no 1: los minutos pedidos se reparten mal ` +
              'y el episodio no dura lo que dice durar.',
          );
        }
        const idsBloque = new Set();
        for (const b of bloques) {
          if (!b?.id || idsBloque.has(b.id)) fallos.push(`Bloque sin clave propia en «${quién}»: ${b?.id || '(sin id)'}.`);
          idsBloque.add(b?.id);
          if (!(Number(b?.peso) > 0)) fallos.push(`El bloque «${b?.id}» de «${quién}» pesa cero: no se escribiría nunca.`);
          for (const campo of ['nombre', 'funcion']) {
            if (!String(b?.[campo] || '').trim()) {
              fallos.push(`El bloque «${b?.id}» de «${quién}» no dice su ${campo}: se escribiría a ciegas.`);
            }
          }
        }

        // Los motivos, que son de donde sale el ahorro dentro del episodio.
        const motivos = g?.motivos || [];
        if (motivos.length < 4) {
          fallos.push(`El género «${quién}» declara ${motivos.length} motivos y hacen falta 4 como mínimo.`);
        }
        if (motivos.some((x) => !String(x || '').trim())) fallos.push(`Hay un motivo en blanco en «${quién}».`);

        // Y LOS PAPELES: claves del elenco del canal, que tienen que EXISTIR.
        // Una clave mal escrita aquí no da error en ninguna parte: el género se
        // queda sin ese papel, el director nunca lo propone, y los testimonios
        // salen como planos genéricos que se pagan uno a uno.
        const personajes = g?.personajes || [];
        if (personajes.length < 3) {
          fallos.push(`El género «${quién}» declara ${personajes.length} papeles y hacen falta 3 como mínimo.`);
        }
        for (const id of personajes) {
          if (!arquetipoPorId(id)) {
            fallos.push(`El género «${quién}» pide el papel «${id}», que no está en el elenco del canal.`);
          }
        }
        if (personajesDe(g).length !== personajes.length) {
          fallos.push(`El género «${quién}» pierde papeles al resolverlos contra el elenco.`);
        }
      }

      // ── El elenco del canal ────────────────────────────────────────────────
      //
      // Aquí está lo que el usuario pidió con números: «por lo menos cinco
      // policías, cinco doctores, cinco peritos, al menos unos veinte testigos».
      // Un papel con una sola persona hace que el mismo señor salga en tres
      // episodios seguidos, que es exactamente el problema que la biblioteca creó
      // al resolver el del coste.
      if (!(EPISODIOS_SIN_REPETIR >= 2)) {
        fallos.push(`Con ${EPISODIOS_SIN_REPETIR} episodio(s) de margen la alternancia se ve: A, B, A, B.`);
      }
      // Una versión menos que el margen y la rotación es imposible: habría que
      // repetir por fuerza en el episodio siguiente.
      if (!(VERSIONES_MINIMAS > EPISODIOS_SIN_REPETIR)) {
        fallos.push('El mínimo de versiones no supera al margen: la rotación no podría cumplirse nunca.');
      }

      const CUANTOS = { perito: 5, policia: 5, medico: 5, testigo: 20 };
      const idsPapel = new Set();
      for (const a of ELENCO || []) {
        if (!a?.id || idsPapel.has(a.id)) fallos.push(`Papel sin clave propia en el elenco: ${a?.id || '(sin id)'}.`);
        idsPapel.add(a?.id);
        if (!String(a?.nombre || '').trim()) fallos.push(`El papel «${a?.id}» no tiene nombre.`);
        for (const campo of ['encuadre', 'lugar', 'luz', 'descripcion']) {
          if (!String(a?.plano?.[campo] || '').trim()) {
            fallos.push(
              `El papel «${a?.id}» no dice su ${campo}: la biblioteca no podría generarlo sin que la ` +
                'fase se sepa la descripción de memoria.',
            );
          }
        }
        const v = a?.variantes || [];
        const pedidas = CUANTOS[a?.id] || VERSIONES_MINIMAS;
        if (v.length < pedidas) {
          fallos.push(
            `El papel «${a?.id}» tiene ${v.length} persona(s) y hacen falta ${pedidas}: ` +
              'la misma cara saldría en episodios seguidos.',
          );
        }
        const idsV = new Set();
        for (const x of v) {
          if (!x?.id || idsV.has(x.id)) fallos.push(`Persona sin clave propia en «${a?.id}»: ${x?.id || '(sin id)'}.`);
          idsV.add(x?.id);
          if (!String(x?.persona || '').trim()) fallos.push(`Una persona de «${a?.id}» no se describe.`);
        }
        // Y las personas tienen que ser DISTINGUIBLES entre sí: cinco descripciones
        // iguales son un papel con una sola cara y un registro de rotación que
        // miente.
        if (new Set(v.map((x) => x?.persona)).size !== v.length) {
          fallos.push(`El papel «${a?.id}» repite la misma descripción de persona: rotaría entre caras idénticas.`);
        }
        // La descripción final tiene que llevar a la persona dentro; si no, las
        // cinco variantes generarían la misma imagen.
        const plano = planoDeVariante(a, v[0]);
        if (v[0] && !String(plano?.descripcion || '').includes(v[0].persona)) {
          fallos.push(`El plano de «${a?.id}» no incorpora a la persona: las cinco variantes saldrían iguales.`);
        }
      }

      // Los recursos transversales: no son de ningún género y por eso van sueltos.
      if (!RECURSOS?.length || RECURSOS.length < 10) {
        fallos.push(`Hay ${RECURSOS?.length || 0} recursos transversales; con menos de diez la biblioteca no cubre nada.`);
      }
      const idsRecurso = new Set();
      for (const r of RECURSOS || []) {
        if (!r?.id || idsRecurso.has(r.id)) fallos.push(`Recurso sin clave propia: ${r?.id || '(sin id)'}.`);
        idsRecurso.add(r?.id);
        for (const campo of ['lugar', 'encuadre', 'luz', 'descripcion']) {
          if (!String(r?.[campo] || '').trim()) fallos.push(`El recurso «${r?.id}» no dice su ${campo}.`);
        }
        // TRES VERSIONES DE CADA UNO, como mínimo: un recurso vuelve en todos los
        // episodios y es justo el que más canta si es siempre idéntico.
        const v = r?.variantes || [];
        if (v.length < VERSIONES_MINIMAS) {
          fallos.push(
            `El recurso «${r?.id}» tiene ${v.length} versión(es) y hacen falta ${VERSIONES_MINIMAS}: ` +
              'el mismo plano exacto en todos los episodios se reconoce enseguida.',
          );
        }
        if (new Set(v.map((x) => x?.matiz)).size !== v.length) {
          fallos.push(`El recurso «${r?.id}» repite el mismo matiz: sus versiones saldrían iguales.`);
        }
        const plano = planoDeRecurso(r, v[0]);
        if (v[0] && !String(plano?.descripcion || '').includes(v[0].matiz)) {
          fallos.push(`El plano del recurso «${r?.id}» no incorpora el matiz: sus versiones saldrían iguales.`);
        }
      }

      // Y el predeterminado tiene que existir: si no, `generoPorId` devuelve
      // `undefined` y el fallo aparece a tres fases de distancia.
      if (!GENEROS.some((g) => g.id === GENERO_POR_DEFECTO)) {
        fallos.push(`El género por defecto «${GENERO_POR_DEFECTO}» no está en la tabla.`);
      }
      if (generoPorId('no-existe-este-genero')?.id !== GENERO_POR_DEFECTO) {
        fallos.push('Una clave desconocida no cae en el género por defecto: un proyecto viejo se quedaría sin género.');
      }
      return fallos;
    },
    // Se rompe por donde se va a romper de verdad: alguien copia un género para
    // hacer el siguiente, cambia un peso y no recuenta. Va por el contexto porque
    // la comprobación LEE la tabla de ahí, no del texto fuente.
    romper: (ctx) =>
      conFuncion(
        ctx,
        'GENEROS',
        ctx.fn.GENEROS.map((g, k) =>
          k === 0 ? { ...g, bloques: g.bloques.map((b, j) => (j === 0 ? { ...b, peso: b.peso + 0.2 } : b)) } : g,
        ),
      ),
  },

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

  {
    nombre: 'la-linea-en-blanco-y-el-testimonio-parten-la-toma',
    dice: 'Dos fronteras duras del texto plano, y una llevaba rota desde el principio. La línea en blanco está documentada como PAUSA —«úsala después de un dato duro, para dejarlo caer»— y tres párrafos separados por líneas en blanco salían en UNA sola toma: se buscaba «\\n\\s*\\n» dentro de un tramo de hueco y esos dos saltos nunca caen en el mismo tramo. Así que el guion podía pedir la pausa donde quisiera y el segmentador la ignoraba siempre. La otra es la línea «> », que declara quién habla y NO se narra: si se narrara, el documental leería en voz alta «Marcos Elizalde, capataz de la cuadrilla» como si fuera una frase del guion.',
    comprobar(ctx) {
      const { segmentar, verificarCobertura } = ctx.fn;
      const fallos = [];

      // 1 · La línea en blanco parte, y el salto simple no.
      const parrafos = segmentar('Frase corta una.\n\nFrase corta dos.\n\nFrase corta tres.');
      if (parrafos.tomas.length !== 3) {
        fallos.push(
          `Tres párrafos separados por líneas en blanco salen en ${parrafos.tomas.length} toma(s): ` +
            'la pausa que pide el guion se pierde.',
        );
      }
      const seguido = segmentar('Una frase que sigue\nen la línea de abajo, sin línea en blanco.');
      if (seguido.tomas.length !== 1) {
        fallos.push(`Un salto de línea suelto parte la toma en ${seguido.tomas.length}: partiría cualquier frase larga.`);
      }

      // 2 · El testimonio: la línea no se narra, y marca las tomas que la siguen.
      const guion =
        '## El hallazgo\n\nLa denuncia entró a las nueve y diez.\n\n' +
        '> Marcos Elizalde, capataz de la cuadrilla\n' +
        'No toqué madera. Metí la mano y no había nada.\n\n' +
        'El roble se taló esa misma tarde.';
      const r = segmentar(guion);
      const c = verificarCobertura(guion, r);
      // La cobertura es lo que impide que una convención nueva se coma texto: cada
      // carácter tiene que seguir perteneciendo a exactamente un tramo.
      if (!c.ok) fallos.push(`La convención de testimonio rompe la cobertura: ${c.detalle}`);

      if (r.tomas.some((t) => /Marcos Elizalde/.test(t.texto))) {
        fallos.push('La línea del hablante se narra: el documental leería en voz alta la ficha del testigo.');
      }
      const declara = r.tomas.find((t) => /No toqué madera/.test(t.texto));
      if (declara?.testimonio !== 'Marcos Elizalde, capataz de la cuadrilla') {
        fallos.push(
          `La toma del testimonio no sabe quién habla (${JSON.stringify(declara?.testimonio)}): ` +
            'el director no podría poner el plano de quien declara.',
        );
      }
      // Y lo de después de la línea en blanco YA NO es del testigo.
      const despues = r.tomas.find((t) => /se taló/.test(t.texto));
      if (despues?.testimonio) {
        fallos.push('El testimonio se derrama sobre la toma siguiente: saldría el testigo donde habla el narrador.');
      }
      // Ni lo de antes.
      if (r.tomas.find((t) => /La denuncia/.test(t.texto))?.testimonio) {
        fallos.push('La marca de testimonio alcanza hacia atrás, a una toma del narrador.');
      }
      return fallos;
    },
    // Se rompe como estaba: ni la línea en blanco separaba —los dos saltos se
    // buscaban dentro de un solo tramo de hueco, que es donde nunca están— ni la
    // línea «> » significaba nada.
    //
    // VA POR EL CONTEXTO, y esta invariante nació ciega por hacerlo al revés: la
    // comprobación EJECUTA `segmentar`, así que un sabotaje sobre el texto fuente
    // no la alcanza. Lo cazó `--romper` a la primera.
    romper: (ctx) =>
      conFuncion(ctx, 'segmentar', (guion, config) => {
        const r = ctx.fn.segmentar(guion, config);
        const texto = String(guion ?? '');
        const tomas = [];
        for (const t of r.tomas) {
          const previa = tomas[tomas.length - 1];
          const hueco = previa ? texto.slice(previa.finEnGuion, t.inicioEnGuion) : 'x';
          if (previa && !hueco.trim()) {
            previa.finEnGuion = t.finEnGuion;
            previa.texto = texto.slice(previa.inicioEnGuion, t.finEnGuion);
            continue;
          }
          tomas.push({ ...t, testimonio: '' });
        }
        return { ...r, tomas: tomas.map((t, i) => ({ ...t, i })) };
      }),
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
        // Se caza LEER la variable, no nombrarla. El diagnóstico enseña el prefijo
        // que está en uso y para eso se lo pide al almacén; que la etiqueta se
        // llame igual que la variable no es componer una ruta.
        if (/process\.env\.ALMACEN_PREFIJO|storage\.googleapis\.com\/upload/.test(texto)) {
          fallos.push(`${ruta} lee la configuración del almacén por su cuenta.`);
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
    nombre: 'la-busqueda-de-casos-va-acotada-en-tema-y-epoca',
    dice: 'La época por defecto NO es «cualquiera», y el filtro se aplica también sobre lo que vuelve. Sin acotar, la búsqueda devuelve lo más publicado, que es lo más viejo: salían casos del XIX una y otra vez.',
    async comprobar(ctx) {
      const { EPOCAS, EPOCA_POR_DEFECTO, TEMAS } = await import('../../comun/temas.mjs');
      const inv = ctx.fuentes.get('app/fases/investigacion.js') || '';
      const fallos = [];

      const porDefecto = EPOCAS.find((e) => e.id === EPOCA_POR_DEFECTO);
      if (!porDefecto) fallos.push('La época por defecto no existe en el catálogo.');
      else if (porDefecto.desde() === null) {
        fallos.push('La época por defecto es «cualquiera»: volverán los casos del XIX.');
      }

      // Decírselo al modelo no basta: cuela casos viejos igual. El filtro tiene que
      // aplicarse TAMBIÉN en el código, sobre lo que vuelve.
      if (!/casos\.filter\(/.test(inv) || !/>= desde/.test(inv)) {
        fallos.push('El filtro de época no se aplica sobre los casos devueltos, solo se pide en el prompt.');
      }
      if (TEMAS.flatMap((g) => g.temas).length < 20) {
        fallos.push('El catálogo de temas es demasiado corto para elegir de verdad.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/fases/investigacion.js', (t) =>
        t.replace(/const dentro = casos\.filter\(/, 'const dentro = [].concat(').replace(/>= desde/, '>= 0'),
      ),
  },

  {
    nombre: 'la-investigacion-a-fondo-busca-por-varios-angulos',
    dice: 'La investigación del caso elegido son VARIAS búsquedas distintas, con fuentes oficiales entre ellas. Una sola pregunta trae una sola versión, y con eso sale un resumen con voz grave, no un documental.',
    async comprobar(ctx) {
      const { ANGULOS_DE_INVESTIGACION } = ctx.fn;
      const fallos = [];
      if (!Array.isArray(ANGULOS_DE_INVESTIGACION) || ANGULOS_DE_INVESTIGACION.length < 4) {
        fallos.push('La investigación a fondo no tiene suficientes ángulos distintos.');
      }
      const ids = (ANGULOS_DE_INVESTIGACION || []).map((a) => a.id);
      for (const imprescindible of ['oficial', 'cronologia', 'discutido']) {
        if (!ids.includes(imprescindible)) {
          fallos.push(`Falta el ángulo «${imprescindible}», que es de los que sostienen el documental.`);
        }
      }
      const inv = ctx.fuentes.get('app/fases/investigacion.js') || '';
      if (!/tipoFuente/.test(inv)) {
        fallos.push('Las fichas no guardan de qué tipo es su fuente: un blog y una sentencia valdrían lo mismo.');
      }
      return fallos;
    },
    // Se rompe por el contexto: la lista de ángulos entra por ahí justamente para
    // que un sabotaje la alcance.
    romper: (ctx) =>
      conFuncion(ctx, 'ANGULOS_DE_INVESTIGACION', ctx.fn.ANGULOS_DE_INVESTIGACION.slice(0, 1)),
  },

  {
    nombre: 'cada-clase-de-ficha-se-escribe-como-lo-que-es',
    dice: 'Hay dos clases de ficha —documentada y construida— y se escriben distinto: la primera lleva su fuente entre corchetes, que es lo que le dice al guion CÓMO ATRIBUIR; la segunda lleva su rol, que es lo que le dice qué papel juega en el caso. Componer esa lista dentro de cada fase acabó con el guion y el director escribiéndolas de dos maneras, y con una ficha construida saliendo como «fuente:  [otra]» — una fuente vacía que el guion habría atribuido igual, afirmando por un expediente que no existe.',
    comprobar(ctx) {
      const { comoLista, ordenarFichas } = ctx.fn;
      const fallos = [];

      const documentadas = [
        { afirmacion: 'Ardió el puerto.', fuente: 'Sentencia 44/1991', tipoFuente: 'judicial', fecha: '1991', cita: 'quedó probado' },
        { afirmacion: 'Se dijo que fue el viento.', fuente: 'Blog', tipoFuente: 'otra', fecha: '', cita: '', incierto: true },
      ];
      const escritas = comoLista(documentadas);
      if (!/\[judicial\]/.test(escritas)) {
        fallos.push('Una ficha documentada se escribe sin su tipo de fuente: el guion no sabría cómo atribuirla.');
      }
      if (!/DISPUTADO/.test(escritas)) fallos.push('Una ficha disputada no se marca como tal.');
      // Y lo más sólido va PRIMERO: el modelo se apoya en lo primero que lee.
      if (escritas.indexOf('Ardió el puerto') > escritas.indexOf('Se dijo que fue')) {
        fallos.push('Las fichas documentadas no van de más a menos sólida.');
      }

      const construidas = [
        { afirmacion: 'La ficha de latón número 4417.', rol: 'revelacion', fecha: '2022', cita: '', construida: true, orden: 2 },
        { afirmacion: 'Amparo Iriarte, 34 años, tejedora.', rol: 'victima', fecha: '1981', cita: 'no volvió', construida: true, orden: 0 },
      ];
      const fabricadas = comoLista(construidas);
      if (!/\(victima\)/.test(fabricadas) || !/\(revelacion\)/.test(fabricadas)) {
        fallos.push('Una ficha construida se escribe sin su rol: se pierde qué papel juega en el caso.');
      }
      // Y NO puede insinuar una fuente que no existe.
      if (/fuente:/.test(fabricadas) || /\[otra\]/.test(fabricadas)) {
        fallos.push('Una ficha construida se escribe con una fuente vacía: el guion la atribuiría a un expediente inventado.');
      }
      // Se leen EN EL ORDEN EN QUE SE LEVANTÓ EL CASO, no barajadas por una
      // «solidez» en la que todas empatan.
      if (fabricadas.indexOf('Amparo') > fabricadas.indexOf('4417')) {
        fallos.push('Las fichas construidas se reordenan: se pierde el orden en que se construyó el caso.');
      }
      if (ordenarFichas(construidas)[0]?.rol !== 'victima') {
        fallos.push('El orden de un expediente construido no respeta cómo se levantó.');
      }
      return fallos;
    },
    // Se rompe como estaba antes de tener una sola puerta: cada fase componiendo
    // la lista a su manera, con el formato de las documentadas para todo.
    romper: (ctx) =>
      conFuncion(ctx, 'comoLista', (fichas, opciones) =>
        ctx.fn
          .ordenarFichas(fichas)
          .slice(0, opciones?.tope ?? 60)
          .map((f, i) => `[${i}] ${f.afirmacion}\n    fuente: ${f.fuente || ''} [${f.tipoFuente || 'otra'}]`)
          .join('\n'),
      ),
  },

  {
    nombre: 'un-caso-construido-se-publica-declarado-como-ficcion',
    dice: 'El episodio construido se ve EXACTAMENTE igual que un documental: el mismo tono, los mismos planos, los mismos testimonios, la misma voz sobria. Esa es la gracia del formato y es justo lo que lo hace indistinguible de uno real si nadie lo dice. Un caso inventado presentado como caso real es una mentira —da igual que la víctima no exista: lo que se falsea es la naturaleza de la pieza— y hunde el canal el día que alguien lo descubra. Y no puede depender de que el modelo se acuerde de decirlo, ni de un pie que nadie despliega: va compuesta en el código y va la primera.',
    comprobar(ctx) {
      const { esFiccion, componerPieDeFuentes, DECLARACION_DE_FICCION, textoDePublicacion } = ctx.fn;
      const fallos = [];

      const construidas = [{ afirmacion: 'a', rol: 'victima', construida: true, fuente: '' }];
      const documentadas = [{ afirmacion: 'b', fuente: 'Sentencia 44/1991', fecha: '1991', tipoFuente: 'judicial' }];

      if (!esFiccion(construidas)) fallos.push('Un expediente construido no se reconoce como ficción.');
      if (esFiccion(documentadas)) fallos.push('Un expediente documentado se marca como ficción: diría que es falso lo que es real.');

      // La declaración tiene que decir las tres cosas que importan.
      for (const [qué, re] of [
        ['que es ficción', /ficci[oó]n/i],
        ['que el caso y las personas están inventados', /inventad/i],
        ['que las imágenes están generadas', /generad/i],
      ]) {
        if (!re.test(DECLARACION_DE_FICCION || '')) fallos.push(`La declaración no dice ${qué}.`);
      }

      // Un expediente construido NO lleva pie de fuentes: no las tiene, y un pie
      // de fuentes vacío o inventado es peor que ninguno.
      if (componerPieDeFuentes(construidas)) {
        fallos.push('Un episodio de ficción sale con pie de fuentes: insinúa un respaldo que no existe.');
      }
      if (!componerPieDeFuentes(documentadas)) {
        fallos.push('Un episodio documentado pierde su pie de fuentes: §8.4 no es opcional.');
      }

      // Y en el texto que se pega al publicar, la declaración va LA PRIMERA de la
      // descripción — no al final, donde no la lee nadie.
      const texto = textoDePublicacion(
        { titulos: ['Un caso'], etiquetas: ['crimen'], descripcion: `${DECLARACION_DE_FICCION}\n\nLo que pasó.` },
        'Un caso',
      );
      const i = texto.indexOf('DESCRIPCIÓN');
      if (i < 0 || !texto.slice(i, i + 140).includes('FICCIÓN DOCUMENTAL')) {
        fallos.push('La declaración no encabeza la descripción: quedaría enterrada donde no la ve nadie.');
      }
      return fallos;
    },
    // Se rompe como estaría sin la distinción: todo pasa por documental, con su
    // pie de fuentes y sin declarar nada.
    romper: (ctx) => conFuncion(ctx, 'esFiccion', () => false),
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

  {
    nombre: 'la-direccion-va-por-lotes-y-se-completa-sola',
    dice: 'Pedir las fichas de plano de todas las tomas en una llamada devuelve una respuesta CORTADA, y una respuesta cortada no da error: da menos fichas. Un guion de 48 tomas devolvía 5, y al reintentar 6.',
    comprobar(ctx) {
      const d = fuente(ctx, 'app/fases/direccion.js');
      const fallos = [];

      if (!/POR_LOTE\s*=\s*(\d+)/.test(d)) fallos.push('La dirección no va por lotes.');
      const porLote = Number(/POR_LOTE\s*=\s*(\d+)/.exec(d)?.[1] || 0);
      if (porLote < 6 || porLote > 24) {
        fallos.push(`El lote es de ${porLote}: de uno en uno sale carísimo y sin coherencia; de más de veinte no cabe.`);
      }
      // Y el bucle tiene que avanzar DE LOTE EN LOTE, no mandarlas todas.
      if (!/desde \+= POR_LOTE/.test(d)) fallos.push('El bucle no avanza por lotes.');
      // Una respuesta corta se parte y se reintenta: pedir otra vez lo mismo da lo mismo.
      if (!/particiones/.test(d)) {
        fallos.push('Un lote que vuelve incompleto no se parte: reintentar igual devuelve igual.');
      }
      // Y entre lotes se pasa de dónde venimos, o se nota la costura.
      if (!/Venimos de/.test(d)) fallos.push('Los lotes no se encadenan: cada uno empezaría de cero.');
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/fases/direccion.js', (t) =>
        t.replace('export const POR_LOTE = 18;', 'export const POR_LOTE = 500;'),
      ),
  },

  {
    nombre: 'el-movimiento-se-reparte-por-toda-la-pieza',
    dice: 'El cupo de clips no puede llenarse con las tomas del principio: el último tercio del documental se quedaría sin una sola toma animada y se vería como diapositivas.',
    comprobar(ctx) {
      const { repartirPorTramos } = ctx.fn;
      const fallos = [];

      // Candidatos por toda la pieza, cupo pequeño: tiene que coger de todas partes.
      const todos = Array.from({ length: 40 }, (_, k) => k + 4);
      const salen = repartirPorTramos(todos, 6, 48);
      if (salen.length !== 6) fallos.push(`Con cupo 6 salen ${salen.length}.`);
      if (Math.max(...salen) < 32) {
        fallos.push(`El último tramo se queda sin clips: el más alto es ${Math.max(...salen)} de 48.`);
      }
      if (new Set(salen).size !== salen.length) fallos.push('Repite alguna toma.');

      // Y no puede inventarse candidatos que nadie propuso.
      const pocos = repartirPorTramos([5, 30], 6, 48);
      if (pocos.length !== 2 || !pocos.every((i) => [5, 30].includes(i))) {
        fallos.push('Se inventa tomas con movimiento que el director no propuso.');
      }
      if (repartirPorTramos([1, 2, 3], 0, 48).length) fallos.push('Con cupo cero anima algo.');
      return fallos;
    },
    // Se rompe como estaba: cogiendo los primeros del cupo por orden de índice,
    // que es lo que dejaba el último tercio sin una sola toma animada.
    romper: (ctx) => conFuncion(ctx, 'repartirPorTramos', (cands, cupo) => cands.slice(0, cupo)),
  },

  {
    nombre: 'el-guion-se-escribe-por-actos-y-se-mide',
    dice: 'Pedir los diez minutos en una llamada devolvía UNA escena y UNA toma, y la pantalla decía «guion escrito». Los modelos que razonan gastan el presupuesto de salida pensando, y cortarse no da error: da menos guion.',
    comprobar(ctx) {
      const g = fuente(ctx, 'app/fases/guion.js');
      const { actosDe, contarPalabras } = ctx.fn;
      const fallos = [];

      // Se escribe por actos, no de una vez.
      if (!/for \(const \[n, acto\] of actos/.test(g)) fallos.push('El guion no se escribe acto por acto.');
      // Con un tope apretado, el razonamiento se come el texto.
      const tope = Number(/maxTokens: (\d+)/.exec(g)?.[1] || 0);
      if (tope < 16384) fallos.push(`El tope de salida del guion es ${tope}: se corta antes de escribir.`);
      if (/palabras \* 3/.test(g)) fallos.push('El tope se calcula de las palabras: no deja sitio al razonamiento.');
      // Y lo que sale se MIDE: «escrito» a secas fue lo que dijo la pantalla.
      if (!/salieron < palabras/.test(g)) fallos.push('Un guion demasiado corto se da por bueno.');

      // Siempre hay actos, con o sin tratamiento, y suman los minutos pedidos.
      for (const [caso, tr] of [
        ['sin tratamiento', null],
        ['con estructura', { estructura: [{ titulo: 'A', minutos: 6 }, { titulo: 'B', minutos: 6 }] }],
      ]) {
        const actos = actosDe(tr, 8);
        if (actos.length < 2) fallos.push(`${caso}: sale ${actos.length} acto, se escribiría de una vez.`);
        const suma = actos.reduce((s, a) => s + a.minutos, 0);
        if (Math.abs(suma - 8) > 1) fallos.push(`${caso}: los actos suman ${suma} min y se pidieron 8.`);
        if (actos.some((a) => !a.titulo || !(a.minutos > 0))) fallos.push(`${caso}: hay un acto sin título o sin minutos.`);
      }

      if (contarPalabras('  uno   dos \n tres ') !== 3) fallos.push('No se cuentan bien las palabras.');
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/fases/guion.js', (t) => t.replace('maxTokens: 32768,', 'maxTokens: 4096,')),
  },

  {
    nombre: 'una-respuesta-cortada-no-pasa-por-completa',
    dice: 'Cuando el modelo se queda sin espacio devuelve el texto a medias y un 200. Sin mirar `finishReason`, un fragmento pasa por documental terminado — que es lo que pasó.',
    comprobar(ctx) {
      const prov = fuente(ctx, 'api/_lib/proveedor.js');
      const fallos = [];
      if (!/MAX_TOKENS/.test(prov)) {
        fallos.push('Nadie mira si la respuesta se cortó: un texto a medias pasaría por bueno.');
      }
      // Y tiene que LANZAR, no solo mencionarlo en un mensaje de «vino vacío»:
      // el caso malo es que venga texto, pero incompleto.
      const i = prov.indexOf("finishReason === 'MAX_TOKENS'");
      if (i < 0) fallos.push('No se comprueba el motivo de fin de la respuesta.');
      else if (!/throw new Error/.test(prov.slice(i, i + 400))) {
        fallos.push('Se detecta el corte pero se devuelve el texto a medias igual.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'api/_lib/proveedor.js', (t) =>
        t.replace("if (candidato?.finishReason === 'MAX_TOKENS') {", 'if (false) {'),
      ),
  },

  {
    nombre: 'cada-caso-lleva-sus-fichas-dentro',
    dice: 'El caso, el tema y las fichas son de la pieza, no del proyecto. Estando en el proyecto, elegir un caso nuevo dejaba las fichas del anterior y la investigación se fusionaba con ellas: en pantalla salió «no mezclar este caso con los datos de la discoteca Kiss», que era el caso de antes.',
    async comprobar(ctx) {
      const estado = ctx.fn;
      const fallos = [];

      // Un proyecto de los de antes migra: lo del proyecto pasa a su pieza.
      const viejo = estado.sanear({
        id: 'p01',
        caso: { titulo: 'Caso A', sinopsis: 'x' },
        fichas: [{ afirmacion: 'a', fuente: 's' }],
        piezas: [{ id: 'p01', titulo: 'A' }],
      });
      if (viejo.piezas[0].caso?.titulo !== 'Caso A') fallos.push('El caso no baja a su pieza al migrar.');
      if (viejo.piezas[0].fichas.length !== 1) fallos.push('Las fichas no bajan a su pieza al migrar.');

      // Y abrir otro caso NO toca el anterior.
      const nuevo = estado.abrirPieza(viejo, { caso: { titulo: 'Caso B', sinopsis: 'y' } });
      if (nuevo.fichas.length) fallos.push(`El caso nuevo nace con ${nuevo.fichas.length} fichas del anterior.`);
      if (viejo.piezas[0].fichas.length !== 1) fallos.push('Abrir un caso nuevo se llevó las fichas del anterior.');
      if (viejo.piezaActiva !== nuevo.id) fallos.push('El caso nuevo no queda abierto.');

      // La continuación SÍ hereda: volver a investigar lo mismo es pagar dos veces.
      const cont = estado.abrirPieza(viejo, { vieneDe: viejo.piezas[0].id });
      if (cont.fichas.length !== 1) fallos.push('Una continuación no hereda las fichas de su caso.');
      if (estado.ascendencia(viejo, cont)[0]?.id !== viejo.piezas[0].id) {
        fallos.push('Una continuación no sabe de qué pieza viene.');
      }
      // Y la pantalla tiene que leer las fichas DE LA PIEZA.
      if (/\bP\.fichas\b/.test(fuente(ctx, 'app/main.js'))) {
        fallos.push('La pantalla sigue leyendo las fichas del proyecto.');
      }
      return fallos;
    },
    romper: (ctx) => editando(ctx, 'app/main.js', (t) => t.replace('pieza().fichas', 'P.fichas')),
  },

  {
    nombre: 'una-continuacion-no-vuelve-a-pagar-lo-que-ya-existe',
    dice: 'Una continuación del mismo caso vuelve a los mismos sitios. Regenerar esos planos es pagar dos veces por la misma imagen, y encima sale distinta —que en un documental se nota—.',
    comprobar(ctx) {
      const { heredables, planificarImagenes: planificar, claveFotograma } = ctx.fn;
      const fallos = [];
      const plano = (lugar, enc, luz) => ({ lugar, encuadre: enc, luz, descripcion: 'd', sujetos: [] });

      const padre = { id: 'p01', titulo: 'Padre', tomas: [{ i: 0, imagen: 'ok', plano: plano('la fachada', 'plano general', 'noche') }] };
      const tomas = [
        { i: 0, imagen: null, plano: plano('la fachada', 'plano general', 'noche') },
        { i: 1, imagen: null, plano: plano('la fachada', 'plano general', 'día') },
      ];
      const h = heredables(tomas, [padre]);
      if (h.length !== 1 || h[0].i !== 0) fallos.push(`Heredan ${h.length} tomas y debería heredar solo la que coincide.`);

      tomas[0].heredado = 'p01/t000/img';
      tomas[0].imagen = 'ok';
      // Ni con «rehacer todo» se vuelve a generar: es lo que la hace útil.
      if (planificar(tomas, { soloLasQueFaltan: false }).some((t) => t.i === 0)) {
        fallos.push('Una toma heredada se vuelve a generar, y a pagar.');
      }
      // Y la hoja tiene que abrir la imagen de la OTRA pieza.
      if (claveFotograma('p02', tomas[0], tomas) !== 'p01/t000/img') {
        fallos.push(`La toma heredada apunta a ${claveFotograma('p02', tomas[0], tomas)} en vez de a la del padre.`);
      }
      return fallos;
    },
    // Se rompe como si `claveFotograma` no mirara lo heredado: la continuación
    // apuntaría a una imagen de su propia pieza, que no existe, y habría que
    // generarla otra vez.
    romper: (ctx) =>
      conFuncion(ctx, 'claveFotograma', (pieza, toma) => `${pieza}/t${String(toma.i).padStart(3, '0')}/img`),
  },

  {
    nombre: 'una-continuacion-no-vuelve-a-contar-lo-contado',
    dice: 'Una continuación es otro video del mismo caso, no el mismo otra vez. El director y el que escribe tienen que ver los guiones anteriores ENTEROS: un resumen pierde qué frases están dichas, que es lo único que importa aquí.',
    async comprobar(ctx) {
      const estado = ctx.fn;
      const dir = fuente(ctx, 'app/fases/director.js');
      const gui = fuente(ctx, 'app/fases/guion.js');
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      // Las dos fases que escriben tienen que recibirlo, y usarlo.
      for (const [ruta, texto] of [['director.js', dir], ['guion.js', gui]]) {
        if (!/anteriores = \[\]/.test(texto)) fallos.push(`${ruta} no recibe las partes anteriores.`);
        if (!/anteriores\.length/.test(texto)) fallos.push(`${ruta} las recibe y no las usa.`);
        if (!/a\.guion|\$\{a\.guion\}/.test(texto)) fallos.push(`${ruta} no le pasa el guion anterior entero.`);
      }
      // Y la pantalla tiene que dárselas a las dos, desde un solo sitio.
      if ((main.match(/anteriores: /g) || []).length < 3) {
        fallos.push('Alguna de las dos fases se queda sin las partes anteriores.');
      }
      if (!/function loYaContado/.test(main)) fallos.push('«Lo ya contado» se compone en más de un sitio.');

      // Una continuación hereda el ASPECTO y no la historia: si heredara la
      // estructura, darle a «Guion» escribiría la primera parte otra vez.
      const P = estado.sanear({
        id: 'p01',
        piezas: [{
          id: 'p01', titulo: 'Uno', caso: { titulo: 'C', sinopsis: 's' }, guion: '## A\nTexto.',
          tratamiento: {
            premisa: 'P1', hilo: 'H1', aperturaEnFrio: 'A1', cierre: 'C1',
            estructura: [{ acto: 1, titulo: 'Uno', minutos: 5 }],
            identidadVisual: { paleta: 'ámbar' }, musica: { atmosfera: 'cuerdas' },
            ritmo: { segundosPorToma: 11, proporcionMovimiento: 0.15 }, cuidado: ['no afirmar X'],
          },
        }],
      });
      const c = estado.abrirPieza(P, { vieneDe: 'p01' });
      if (c.tratamiento.identidadVisual?.paleta !== 'ámbar') fallos.push('La continuación no hereda la paleta: no parecerá la misma serie.');
      if (!c.tratamiento.cuidado?.length) fallos.push('La continuación pierde las cautelas legales, que son del caso.');
      if (c.tratamiento.premisa || c.tratamiento.estructura.length) {
        fallos.push('La continuación hereda la historia del padre: escribiría la primera parte otra vez.');
      }
      if (!c.tratamiento.soloIdentidad) fallos.push('Nada marca que a la continuación le falta su propio hilo.');
      // Y la pantalla tiene que negarse a escribir hasta que se dirija.
      if (!/soloIdentidad/.test(main)) fallos.push('Se puede escribir el guion de una continuación sin dirigirla.');
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/fases/guion.js', (t) =>
        t.replace('anteriores.length\n            ?', 'false\n            ?'),
      ),
  },

  {
    nombre: 'reescribir-es-otra-pieza-no-la-misma',
    dice: 'Regenerar el guion en la misma pieza reemplaza las tomas enteras: se pierden los enlaces al material pagado y lo nuevo escribiría encima de sus archivos, porque las claves pieza/toma serían las mismas. «Reescribir» abre OTRA pieza —caso, fichas y tratamiento entero, sin vieneDe— y la vieja queda intacta, con su material listo para «Reutilizar».',
    async comprobar(ctx) {
      const estado = ctx.fn;
      const fallos = [];

      const P = estado.sanear({
        id: 'p01',
        piezas: [{
          id: 'p01', titulo: 'Uno', caso: { titulo: 'C', sinopsis: 's' },
          fichas: [{ afirmacion: 'a', fuente: 's' }],
          guion: '## A\nTexto.',
          tomas: [{ i: 0, texto: 'Texto.', imagen: 'ok', video: 'ok', audio: 'ok' }],
          tratamiento: {
            premisa: 'P1', hilo: 'H1', aperturaEnFrio: 'A1', cierre: 'C1',
            estructura: [{ acto: 1, titulo: 'Uno', minutos: 5 }],
            identidadVisual: { paleta: 'ámbar' }, musica: { atmosfera: 'cuerdas' },
            ritmo: { segundosPorToma: 11, proporcionMovimiento: 0.15 }, cuidado: ['no afirmar X'],
          },
        }],
      });
      const z = estado.reescribirPieza(P, 'p01');

      // Otra pieza, otras claves: sin esto, la primera imagen nueva pisa una pagada.
      if (z.id === 'p01') fallos.push('La reescritura vive en la misma pieza: sus archivos pisarían los pagados.');
      // Sin vieneDe: la ascendencia significa «lo ya contado, no lo repitas», y
      // aquí se quiere contar lo mismo otra vez.
      if (estado.ascendencia(P, z).length) {
        fallos.push('La reescritura queda como continuación: el director evitaría contar justo lo que hay que contar.');
      }
      // Hereda lo que costó dinero conseguir…
      if (z.fichas.length !== 1) fallos.push('La reescritura no hereda las fichas: habría que investigar de nuevo.');
      // …y el tratamiento ENTERO: se puede ir directo al guion, y quien quiera
      // otra estructura dirige primero.
      if (z.tratamiento?.premisa !== 'P1' || z.tratamiento?.estructura?.length !== 1) {
        fallos.push('La reescritura no hereda el tratamiento entero: obligaría a dirigir (y pagar) otra vez.');
      }
      if (z.tratamiento?.soloIdentidad) fallos.push('La reescritura queda bloqueada como si le faltara hilo propio.');
      // La vieja no se toca: es la garantía entera de la operación.
      const vieja = P.piezas.find((x) => x.id === 'p01');
      if (vieja.guion !== '## A\nTexto.' || vieja.tomas.length !== 1 || vieja.tomas[0].imagen !== 'ok') {
        fallos.push('Reescribir tocó la pieza vieja: justo lo que prometía no hacer.');
      }
      if (P.piezaActiva !== z.id) fallos.push('La reescritura no queda abierta.');

      // Y el tratamiento es COPIA, no referencia: dirigir la nueva no puede
      // cambiarle el aspecto a la vieja por debajo.
      if (z.tratamiento) {
        z.tratamiento.identidadVisual.paleta = 'verde ácido';
        if (vieja.tratamiento.identidadVisual.paleta !== 'ámbar') {
          fallos.push('El tratamiento se comparte por referencia: dirigir la nueva pieza cambiaría la vieja.');
        }
      }

      // La pantalla lo ofrece donde se decide —junto a la continuación— y avisa de
      // por qué no se regenera en el sitio.
      const main = fuente(ctx, 'app/main.js');
      if (!/'b-reescribir'/.test(main) || !/reescribirPieza\(/.test(main)) {
        fallos.push('El botón «Reescribir» no existe o no llama al modelo.');
      }
      if (!/id="b-reescribir"/.test(fuente(ctx, 'index.html'))) {
        fallos.push('El botón «Reescribir» no está en la pantalla.');
      }
      return fallos;
    },
    // Se rompe como la versión «ahorradora»: reescribir en la misma pieza.
    romper: (ctx) =>
      conFuncion(ctx, 'reescribirPieza', (P, id) => {
        const z = P.piezas.find((x) => x.id === id);
        P.piezaActiva = z.id;
        return z;
      }),
  },

  {
    nombre: 'el-documental-se-dramatiza-con-interpretes',
    dice: 'Salían casi solo objetos, manos y calles vacías. Dos causas: la instrucción del director ofrecía cuatro salidas sin gente de cinco, y el prompt de imagen NO LE CONTABA al generador los sujetos que el director había puesto en la ficha.',
    async comprobar(ctx) {
      const { componerInstruccion } = ctx.fn;
      const { BARRERA_DOCUMENTAL } = await import('../../comun/estilos.mjs');
      const dir = fuente(ctx, 'app/fases/direccion.js');
      const fallos = [];

      // 1 · Los sujetos de la ficha tienen que llegar a la instrucción.
      const cfg = { imagen: { estilo: 'reconstruccion' }, formato: {} };
      const conGente = {
        plano: {
          descripcion: 'Discuten en el portal.', encuadre: 'plano medio',
          lugar: 'el portal', luz: 'noche',
          sujetos: ['una mujer de unos treinta', 'un hombre mayor'],
        },
      };
      const texto = componerInstruccion(conGente, cfg);
      for (const quien of conGente.plano.sujetos) {
        if (!texto.includes(quien)) fallos.push(`«${quien}» no llega a la instrucción de imagen.`);
      }
      // Y sin sujetos no se inventa gente: un plano de detalle es un plano de detalle.
      const sinGente = { plano: { descripcion: 'El vaso.', encuadre: 'detalle', lugar: 'la mesa', luz: 'x', sujetos: [] } };
      if (/EN CUADRO HAY PERSONAS/.test(componerInstruccion(sinGente, cfg))) {
        fallos.push('Se pide gente en una toma que el director dejó sin sujetos.');
      }

      // 2 · La barrera prohíbe PARECERSE a alguien real, no que salga gente.
      if (/Sin rostros reconocibles/.test(BARRERA_DOCUMENTAL)) {
        fallos.push('La barrera se lee como «sin rostros» y devuelve el documental a los objetos.');
      }
      if (!/INTÉRPRETES|intérpretes/.test(BARRERA_DOCUMENTAL)) {
        fallos.push('La barrera no dice que las personas en cuadro son intérpretes.');
      }

      // 3 · El director tiene que poder elegir dramatización, y que sea lo normal.
      if (!/'dramatizacion'/.test(dir)) fallos.push('El director no puede marcar una toma como dramatización.');
      if (!/mitad de las tomas llevan personas/.test(dir)) {
        fallos.push('Nada le dice al director que reparta entre gente y objetos.');
      }
      return fallos;
    },
    // Se rompe como estaba: la instrucción sin los sujetos que el director puso.
    romper: (ctx) =>
      conFuncion(ctx, 'componerInstruccion', (toma, config, opciones) =>
        ctx.fn
          .componerInstruccion({ ...toma, plano: { ...toma.plano, sujetos: [] } }, config, opciones)
      ),
  },

  {
    nombre: 'un-motivo-vuelve-pero-nunca-seguido',
    dice: 'Los documentales de plataforma repiten un puñado de planos —la patrulla llegando, la calle de noche, la cámara de vigilancia— cinco o seis veces a lo largo de la hora. Da unidad visual y una imagen sirve para siete tomas. Pero dos veces en veinte segundos no es un motivo: es un error de montaje. Y esto NO se le puede pedir al modelo: con ciento sesenta y cinco tomas y veinte motivos son ciento cuarenta colocaciones, y él ve lotes de dieciocho — no puede saber que la vuelta de la toma 91 está a cuatro de la que escribió en la 87. Él dice qué planos son el mismo motivo; el reparto lo hace el código, que sí puede contar.',
    comprobar(ctx) {
      const { repartirMotivos } = ctx.fn;
      const dir = fuente(ctx, 'app/fases/direccion.js');
      const fallos = [];

      // Un motivo que vuelve seis veces, dos de ellas pegadas a la anterior.
      const dónde = [0, 3, 6, 20, 21, 40, 44, 60];
      const tomas = Array.from({ length: 70 }, (_, i) => ({ i }));
      const planos = new Map(
        tomas.map((t) => [
          t.i,
          { i: t.i, motivo: dónde.includes(t.i) ? 'la carretera comarcal de noche' : '' },
        ]),
      );
      const reparto = repartirMotivos(tomas, planos);
      const dueña = [...reparto.keys()][0];
      const vueltas = reparto.get(dueña) || [];

      if (dueña !== 0) fallos.push(`La dueña del motivo es la toma ${dueña} y debería ser la primera aparición.`);
      // NINGUNA vuelta puede caer cerca de la anterior. Es la comprobación entera:
      // se mide sobre el resultado, no sobre lo que se le pidió al modelo.
      const puestas = [dueña, ...vueltas];
      for (let k = 1; k < puestas.length; k++) {
        if (puestas[k] - puestas[k - 1] < 4) {
          fallos.push(
            `Dos vueltas del mismo motivo caen en las tomas ${puestas[k - 1]} y ${puestas[k]}: ` +
              'el mismo plano dos veces en veinte segundos se ve como un fallo de montaje.',
          );
        }
      }
      // Y las que no caben se descartan, no se fuerzan ni tiran el motivo entero.
      if (vueltas.includes(3) || vueltas.includes(21)) {
        fallos.push('Una vuelta demasiado pegada se acepta igual: se le está creyendo al modelo en vez de contar.');
      }
      if (!vueltas.includes(6) || !vueltas.includes(20) || !vueltas.includes(40)) {
        fallos.push(`Se pierden vueltas que sí caben: quedaron ${JSON.stringify(vueltas)}.`);
      }

      // Un tope de vueltas: por encima deja de leerse como motivo y se lee como
      // que no había más material.
      const muchas = Array.from({ length: 200 }, (_, i) => ({ i }));
      const todos = new Map(muchas.map((t) => [t.i, { i: t.i, motivo: t.i % 10 === 0 ? 'el precinto' : '' }]));
      const largo = repartirMotivos(muchas, todos);
      const cuantas = ([...largo.values()][0] || []).length + 1;
      if (cuantas > 8) fallos.push(`Un motivo vuelve ${cuantas} veces: deja de ser un motivo.`);

      // Una aparición suelta no es un motivo.
      const sola = repartirMotivos(tomas, new Map(tomas.map((t) => [t.i, { i: t.i, motivo: t.i === 5 ? 'x' : '' }])));
      if (sola.size) fallos.push('Un plano que sale una sola vez se registra como motivo.');

      // Y al director se le tiene que pedir que DISEÑE los motivos, no que los
      // encuentre por casualidad, y con la dosis del formato.
      if (!/MOTIVOS RECURRENTES/.test(dir)) {
        fallos.push('Nadie le pide al director que diseñe planos que vuelvan: solo cazaría coincidencias.');
      }
      if (!/QUINCE Y VEINTE/.test(dir)) {
        fallos.push('La dosis de motivos sigue siendo la de un episodio corto: con pocos motivos no hay nada que amortizar.');
      }
      return fallos;
    },
    // Se rompe como estaría si el reparto se le creyera al modelo: todas las
    // apariciones aceptadas, caigan donde caigan. Va por el contexto porque la
    // comprobación EJECUTA `repartirMotivos`.
    romper: (ctx) =>
      conFuncion(ctx, 'repartirMotivos', (tomas, planos) => {
        const porEtiqueta = new Map();
        for (const t of tomas) {
          const e = String(planos.get(t.i)?.motivo || '').trim();
          if (!e) continue;
          if (!porEtiqueta.has(e)) porEtiqueta.set(e, []);
          porEtiqueta.get(e).push(t.i);
        }
        const salida = new Map();
        for (const lista of porEtiqueta.values()) {
          if (lista.length < 2) continue;
          salida.set(lista[0], lista.slice(1));
        }
        return salida;
      }),
  },

  {
    nombre: 'el-movimiento-es-una-cuenta-y-no-toca-a-los-motivos',
    dice: 'Una proporción global —«el 15 % de las tomas lleva clip»— es minimizar el coste de CADA episodio: con 165 tomas salen 25 clips, y veinticinco clips por episodio no se amortizan nunca porque no vuelven. El modelo correcto para un canal es invertir una vez y amortizar, y eso son dos cosas: el número de escenas fuertes es una CUENTA del episodio, no un porcentaje de su longitud; y un motivo NO lleva clip, porque su valor está justo en volver cinco veces costando cero. Animar un motivo es pagar la fase más cara por lo único que ya salía gratis.',
    async comprobar(ctx) {
      const { dirigir } = ctx.fn;
      const fallos = [];

      // Un episodio largo con motivos, dirigido de verdad: se sustituye la puerta
      // para no llamar a nadie y se mira lo que sale por el otro lado.
      const N = 120;
      const tomas = Array.from({ length: N }, (_, i) => ({ i, escena: 0, texto: `t${i}`, segundos: 8 }));
      const esMotivo = (i) => i % 7 === 0;
      const puerta = globalThis.fetch;
      globalThis.fetch = async (url, opciones) => {
        const cuerpo = JSON.parse(opciones.body);
        const indices = [...String(cuerpo.instruccion).matchAll(/^\((\d+)\) \[escena/gm)].map((m) => +m[1]);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            json: {
              planos: indices.map((i) => ({
                i,
                encuadre: 'plano general',
                movimientoCamara: 'fijo',
                lugar: esMotivo(i) ? 'la carretera' : `sitio ${i}`,
                luz: 'noche',
                sujetos: [],
                descripcion: `d${i}`,
                tipoImagen: 'reconstruccion',
                // TODAS quieren movimiento: así se ve quién decide de verdad.
                merecemovimiento: true,
                motivo: esMotivo(i) ? 'la carretera comarcal de noche' : '',
                respiro: 'ninguno',
              })),
            },
          }),
        };
      };
      let salida = [];
      try {
        salida = await dirigir({
          tomas,
          escenas: [{ n: 0, titulo: 'A' }],
          tema: 'x',
          config: { movimiento: { politica: { clipsPorEpisodio: 12, motivosConVideo: false } }, montaje: {} },
        });
      } catch (e) {
        fallos.push(`La dirección no llega a terminar: ${e.message}`);
      } finally {
        globalThis.fetch = puerta;
      }
      if (!salida.length) return fallos.concat('No salió ninguna toma dirigida.');

      const conClip = salida.filter((t) => t.movimiento);
      // 1 · La cuenta manda, y NO escala con la longitud del episodio.
      if (conClip.length > 12) {
        fallos.push(
          `Con las 120 tomas pidiendo movimiento salen ${conClip.length} clips y el presupuesto decía 12: ` +
            'el modelo está decidiendo lo que cuesta dinero.',
        );
      }
      if (conClip.length < 8) {
        fallos.push(`Solo ${conClip.length} clips de los 12 presupuestados: se está dejando cupo sin usar.`);
      }

      // 2 · Ningún motivo lleva clip. Es lo que se amortiza volviendo.
      const motivos = salida.filter((t) => t.reusa !== null);
      if (!motivos.length) fallos.push('Ningún motivo se resolvió como repetición: no hay nada que amortizar.');
      if (motivos.some((t) => t.movimiento)) {
        fallos.push('Un motivo lleva clip: se paga la fase más cara por el plano que ya salía gratis al repetirse.');
      }

      // 3 · Y los clips se reparten por toda la pieza, no en el primer tercio.
      const ultimoTercio = conClip.filter((t) => t.i >= (N * 2) / 3).length;
      if (conClip.length >= 6 && ultimoTercio === 0) {
        fallos.push('El último tercio del episodio se queda sin una sola toma animada.');
      }
      return fallos;
    },
    // Se rompe como estaba: una proporción de la longitud, y los motivos entrando
    // en el sorteo como cualquier otra toma.
    romper: (ctx) =>
      conFuncion(ctx, 'dirigir', async (args) =>
        ctx.fn.dirigir({
          ...args,
          config: {
            ...args.config,
            movimiento: { politica: { clipsPorEpisodio: Math.round(args.tomas.length * 0.15), motivosConVideo: true } },
          },
        }),
      ),
  },

  {
    nombre: 'el-banco-de-planos-no-es-solo-del-mismo-caso',
    dice: 'Una comisaría, patrullas frente a una casa, un pasillo de juzgado: son planos que no son de ningún caso y sirven para el de la semana que viene. Limitar la reutilización a la ascendencia dejaba fuera justo el banco que hace viable un canal que todavía no monetiza.',
    comprobar(ctx) {
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      // Se busca en TODAS las piezas del proyecto menos esta.
      const i = main.indexOf("'b-reutilizar',");
      const cuerpo = main.slice(i, main.indexOf('\nfunction ', i));
      if (!/P\.piezas\.filter\(\(x\) => x\.id !== z\.id\)/.test(cuerpo)) {
        fallos.push('La reutilización solo mira los casos de los que este desciende.');
      }
      if (/estado\.ascendencia\(P, z\);\s*\n\s*if \(!padres\.length\)/.test(cuerpo)) {
        fallos.push('Sigue exigiendo que esta pieza sea continuación de otra.');
      }
      // Y el ahorro se enseña ANTES de gastar, que es cuando sirve.
      if (!/ahorro-tomas/.test(main)) fallos.push('No se dice cuántas imágenes se pagan de verdad.');
      if (!/x\.heredado/.test(main) || !/x\.reusa == null/.test(main)) {
        fallos.push('La cuenta de lo que se paga no descuenta lo reutilizado.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace('const otras = P.piezas.filter((x) => x.id !== z.id);', 'const otras = estado.ascendencia(P, z);'),
      ),
  },

  {
    nombre: 'los-clips-tambien-se-reutilizan',
    dice: 'El clip es la fase MÁS CARA con diferencia, y era la única que no reutilizaba nada: la hoja componía siempre la clave del clip propio de cada toma, así que un motivo animado que vuelve cinco veces se pagaba cinco veces.',
    async comprobar(ctx) {
      const { construirHoja, componerManifiesto } = ctx.fn;
      const { planificarClips: planificar } = ctx.fn;
      const fallos = [];
      const plano = {
        encuadre: 'plano general', movimientoCamara: 'acercamiento lento',
        lugar: 'la casa', luz: 'noche', sujetos: [], descripcion: 'd',
      };
      // Un motivo animado que vuelve dos veces, y un clip heredado de otra pieza.
      // La dueña (2) tiene su clip PAGADO —`video: ok`—: desde que el clip es una
      // propuesta hasta que se paga, la hoja solo abre clips que existen.
      const tomas = Array.from({ length: 24 }, (_, i) => ({
        i, escena: 0, texto: 'x', segundos: 5, medida: true, plano,
        tipoImagen: 'reconstruccion',
        movimiento: [2, 5, 10, 20].includes(i),
        video: i === 2 ? 'ok' : null,
        reusa: i === 10 ? 2 : i === 20 ? 10 : null,
        heredadoVid: i === 5 ? 'p00/t003/vid' : undefined,
      }));
      const hoja = construirHoja({ pieza: 'p01', tomas, escenas: [{ n: 0, titulo: 'A' }] });
      const archivoDe = (i) => hoja.tomas.find((f) => f.i === i)?.archivo;

      if (archivoDe(10) !== archivoDe(2)) {
        fallos.push(`La toma 10 repite el plano de la 2 y abre ${archivoDe(10)}: paga un clip de más.`);
      }
      // Y la cadena entera: 20 repite a 10, que repite a 2.
      if (archivoDe(20) !== archivoDe(2)) {
        fallos.push(`Una cadena de repeticiones no se resuelve: la toma 20 abre ${archivoDe(20)}.`);
      }
      if (archivoDe(5) !== 'p00/t003/vid') {
        fallos.push(`Un clip heredado de otra pieza no llega a la hoja: la toma 5 abre ${archivoDe(5)}.`);
      }

      // El manifiesto no baja el mismo clip cuatro veces.
      const clips = componerManifiesto(hoja, (c) => c).split('\n').filter((l) => l.includes('/vid'));
      if (clips.length !== 2) {
        fallos.push(`El manifiesto trae ${clips.length} clips para 4 tomas animadas; deberían ser 2.`);
      }

      // Y la fase no vuelve a generar lo que ya está.
      const aGenerar = planificar(tomas, { soloLasQueFaltan: false }).map((t) => t.i);
      for (const i of [5, 10, 20]) {
        if (aGenerar.includes(i)) fallos.push(`La toma ${i} reutiliza un clip y aun así se regeneraría.`);
      }
      if (!aGenerar.includes(2)) fallos.push('La toma que sí tiene clip propio no se generaría.');
      return fallos;
    },
    // Se rompe como estaba: la hoja componiendo siempre el clip propio de cada
    // toma. Va por el contexto porque la invariante usa `construirHoja` de ahí, y
    // editar la fuente no la alcanzaría.
    romper: (ctx) =>
      conFuncion(ctx, 'construirHoja', (args) => {
        const h = ctx.fn.construirHoja(args);
        return {
          ...h,
          tomas: h.tomas.map((f) =>
            f.movimiento
              ? { ...f, archivo: `${args.pieza}/t${String(f.i).padStart(3, '0')}/vid` }
              : f,
          ),
        };
      }),
  },

  {
    nombre: 'un-motivo-animado-vuelve-sin-gastar-cupo',
    dice: 'Si la toma 8 lleva clip y la 27 repite ese mismo plano, la 27 usa el MISMO clip: no cuesta nada y no gasta cupo. Sin esto, o la 27 paga otro clip o se queda como imagen fija y se pierde el motivo. Las dos mitades tienen que darse a la vez: la repetición hereda el movimiento, Y sigue marcada como repetición — si el movimiento la sacara de `reusa`, cada vuelta pagaría su propio clip, que es como estuvo y por eso ningún clip se reutilizaba nunca.',
    async comprobar(ctx) {
      const { dirigir } = ctx.fn;
      const fallos = [];

      // La 8 lleva clip; la 27 repite su plano; la 12 repite un plano fijo.
      const N = 40;
      const tomas = Array.from({ length: N }, (_, i) => ({ i, escena: 0, texto: `t${i}`, segundos: 8 }));
      const gemelas = { 27: 8, 33: 8, 12: 4 };
      const puerta = globalThis.fetch;
      globalThis.fetch = async (url, opciones) => {
        const cuerpo = JSON.parse(opciones.body);
        const indices = [...String(cuerpo.instruccion).matchAll(/^\((\d+)\) \[escena/gm)].map((m) => +m[1]);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            json: {
              planos: indices.map((i) => {
                const de = gemelas[i] ?? i;
                return {
                  i,
                  encuadre: 'plano general',
                  movimientoCamara: 'fijo',
                  lugar: `sitio ${de}`,
                  luz: 'noche',
                  sujetos: [],
                  descripcion: `d${de}`,
                  tipoImagen: 'reconstruccion',
                  // Solo la 8 y sus vueltas piden movimiento: así el cupo cabe de
                  // sobra y lo que se mide es la propagación, no el reparto.
                  merecemovimiento: de === 8,
                  igualQue: gemelas[i],
                  respiro: 'ninguno',
                };
              }),
            },
          }),
        };
      };
      let salida = [];
      try {
        salida = await dirigir({
          tomas,
          escenas: [{ n: 0, titulo: 'A' }],
          tema: 'x',
          config: { movimiento: { politica: { clipsPorEpisodio: 4 } }, montaje: {} },
        });
      } catch (e) {
        fallos.push(`La dirección no llega a terminar: ${e.message}`);
      } finally {
        globalThis.fetch = puerta;
      }
      if (!salida.length) return fallos.concat('No salió ninguna toma dirigida.');
      const de = (i) => salida.find((t) => t.i === i);

      if (!de(8)?.movimiento) return fallos.concat('La toma que pide clip no lo recibe: no hay nada que propagar.');
      // 1 · La repetición hereda el movimiento.
      for (const i of [27, 33]) {
        if (!de(i)?.movimiento) {
          fallos.push(`La toma ${i} repite un plano animado y se queda fija: se pierde el motivo.`);
        }
      }
      // 2 · Y SIGUE siendo repetición, que es lo que hace que no se pague.
      for (const i of [27, 33]) {
        if (de(i)?.reusa !== 8) {
          fallos.push(
            `La toma ${i} hereda el movimiento pero no queda como repetición (reusa=${de(i)?.reusa}): ` +
              'pagaría su propio clip, que es la fase más cara.',
          );
        }
      }
      // 3 · Y una repetición de un plano FIJO no se contagia de movimiento.
      if (de(12)?.movimiento) fallos.push('Una repetición de un plano fijo sale con clip: se paga lo que nadie pidió.');
      if (de(12)?.reusa !== 4) fallos.push('Una repetición de un plano fijo deja de ser repetición.');
      return fallos;
    },
    // Se rompe como estuvo: las tomas con movimiento excluidas de la reutilización,
    // así que cada vuelta de un motivo animado pagaba su propio clip.
    romper: (ctx) =>
      conFuncion(ctx, 'dirigir', async (args) =>
        (await ctx.fn.dirigir(args)).map((t) => (t.movimiento ? { ...t, reusa: null } : t)),
      ),
  },

  {
    nombre: 'el-corte-del-audio-lo-dice-la-voz-no-se-adivina',
    dice: 'El bloque se cortaba buscando el silencio más cercano a donde uno CALCULA que acaba cada toma. El corte caía en un silencio, así que sonaba perfecto, pero era el silencio de OTRA frase: el audio de una toma terminaba con las palabras de la siguiente y la imagen no correspondía a lo que se oía. Un fallo que no suena a fallo.',
    comprobar(ctx) {
      const { repartirPorTiempos, repartirBloque } = ctx.fn;
      const prov = fuente(ctx, 'api/_lib/proveedor.js');
      const nar = fuente(ctx, 'app/fases/narracion.js');
      const fallos = [];

      // 1 · El servicio tiene que PEDIR los tiempos, con una marca por toma.
      if (!/enableTimePointing/.test(prov)) {
        fallos.push('No se le piden los tiempos al servicio de voz: el corte se seguiría adivinando.');
      }
      if (!/<mark name=/.test(prov)) fallos.push('No se ponen marcas entre las tomas.');
      if (!/escaparSsml/.test(prov)) {
        fallos.push('El texto entra en el SSML sin escapar: un «&» rompería la petición entera.');
      }
      // Y si faltan tiempos, NO se usan a medias: cortar por marcas incompletas es
      // peor que estimar, porque estimar al menos sabe que estima.
      if (!/timepoints\?\.length === marcas\.length/.test(prov)) {
        fallos.push('Se aceptarían tiempos incompletos y el reparto saldría corrido.');
      }

      // 2 · La narración tiene que mandarlos y usarlos.
      if (!/marcas: bloque\.tomas\.map/.test(nar)) {
        fallos.push('La narración no manda los textos por toma: el servicio no puede marcar nada.');
      }
      if (!/tiempos,/.test(nar) || !/r\.tiempos \|\|/.test(nar)) {
        fallos.push('Vienen los tiempos y no se usan.');
      }
      // 2b · Sin marcas, el bloque va AL MÁXIMO (ahí es donde una voz de Gemini
      // mantiene el tono) y el reparto elige TODOS los cortes a la vez: la
      // combinación de silencios reales que mejor cuadra. Se comprueba
      // EJECUTÁNDOLO, con objetivos desviados a propósito: aun así los cortes
      // tienen que caer en los silencios de verdad, crecientes y sin pelearse.
      {
        const f = 24000;
        const m = new Int16Array(12 * f);
        for (let i = 0; i < m.length; i++) {
          const t = i / f;
          const callado = [3, 6, 9].some((x) => t > x - 0.12 && t < x + 0.12);
          m[i] = callado ? 0 : Math.round(Math.sin(t * 900) * 8000);
        }
        const partes = repartirBloque(
          { muestras: m, frecuencia: f, canales: 1 },
          [2.1, 2.9, 2.6, 3.1],
          { silencioInicialMs: 0 },
        );
        const fines = [];
        let acum = 0;
        for (const x of partes) {
          acum += x.segundos;
          fines.push(acum);
        }
        for (const [k, esperado] of [[0, 3], [1, 6], [2, 9]]) {
          if (Math.abs(fines[k] - esperado) > 0.2) {
            fallos.push(`Con silencios reales en 3, 6 y 9 s, el corte ${k + 1} cae en ${fines[k].toFixed(2)} s.`);
          }
          if (partes[k].forzado) fallos.push(`El corte ${k + 1} sale forzado con un silencio de verdad al lado.`);
        }
      }
      if (!/bloque\.tomas\.length === 1 \? \[audio\.muestras\.length \/ audio\.frecuencia\]/.test(nar)) {
        fallos.push('Una toma sola no declara su final como tiempo exacto: saldría marcada como estimada.');
      }

      // 3 · Y el reparto exacto tiene que ser exacto: sin huecos, sin solapes, y
      // la última toma llega al final del audio.
      const f = 24000;
      const audio = { muestras: new Int16Array(f * 10).fill(1000), frecuencia: f, canales: 1 };
      const t = repartirPorTiempos(audio, [2.5, 6.1, 10]);
      if (t.length !== 3) fallos.push(`Salen ${t.length} trozos para 3 tomas.`);
      if (Math.abs(t[0].segundos - 2.5) > 0.01) fallos.push(`El primer trozo dura ${t[0].segundos} y debía durar 2,5.`);
      if (t.some((x, k) => k > 0 && x.inicio !== t[k - 1].fin)) fallos.push('Los trozos dejan huecos o se solapan.');
      if (t[t.length - 1].fin !== audio.muestras.length) {
        fallos.push('El último trozo no llega al final: se perderían las últimas sílabas.');
      }
      if (!t.every((x) => x.exacto)) fallos.push('Un corte por tiempos no se marca como exacto.');

      // 3b · Un corte estimado cuenta como FALTA: el botón de siempre lo repite,
      // sin obligar a rehacerlo todo para reparar cinco bloques.
      const { planificarNarracion } = ctx.fn;
      const cfg = { narracion: { segundosPorBloque: 45, topeBytesPorLlamada: 4000 } };
      const roto = [
        { i: 0, escena: 0, texto: 'Una frase.', segundos: 5, audio: 'ok', corteExacto: false, corteForzado: true },
        { i: 1, escena: 1, texto: 'Otra frase.', segundos: 5, audio: 'ok', corteExacto: true, corteForzado: false },
        { i: 2, escena: 2, texto: 'Tercera frase.', segundos: 5, audio: 'ok', corteExacto: false, corteForzado: false },
      ];
      const pendientes = planificarNarracion(roto, cfg);
      if (!pendientes.some((b) => b.tomas.some((x) => x.i === 0))) {
        fallos.push('Un corte FORZADO (puede partir palabra) no se repara: exigiría rehacerlo todo.');
      }
      if (pendientes.some((b) => b.tomas.some((x) => x.i === 1))) {
        fallos.push('Un bloque con corte exacto se volvería a pagar sin necesidad.');
      }
      if (pendientes.some((b) => b.tomas.some((x) => x.i === 2))) {
        fallos.push('Un corte anclado a silencio real se re-pagaría: con una voz sin marcas es el corte normal, y repetirlo da otro igual.');
      }

      // 4 · Con tiempos manda el exacto; sin ellos, se estima y se dice.
      const conT = repartirBloque(audio, [1, 1, 1], { tiempos: [2.5, 6.1, 10], silencioInicialMs: 0 });
      if (!conT.every((x) => x.exacto)) fallos.push('Teniendo los tiempos, se sigue estimando.');
      const sinT = repartirBloque(audio, [3, 3, 4], { silencioInicialMs: 0 });
      if (sinT.some((x) => x.exacto)) fallos.push('Un reparto estimado se hace pasar por exacto.');
      return fallos;
    },
    // Se rompe haciendo pasar por exacto un reparto estimado.
    romper: (ctx) =>
      conFuncion(ctx, 'repartirBloque', (a, o, op) =>
        ctx.fn.repartirBloque(a, o, op).map((t) => ({ ...t, exacto: true })),
      ),
  },


  {
    nombre: 'a-cada-voz-se-le-piden-solo-los-mandos-que-admite',
    dice: '«Las de Chirp no se escuchan.» No era el reproductor: la petición se RECHAZA. Chirp y Journey no admiten SSML, ni velocidad, ni tono —documentado por Google—, y esta casa se los mandaba a todas las voces por igual: el tono va a −1 por defecto y la velocidad estaba en 1,02. Con eso el servicio devuelve un error y no hay audio. Se omite lo que la voz no entiende, y se DICE en pantalla: si no, quedan dos deslizadores que no hacen nada sin explicación.',
    async comprobar(ctx) {
      const { SIN_VELOCIDAD_NI_TONO, SIN_TONO, SIN_SSML } = await import('../../comun/modelos.mjs');
      const prov = fuente(ctx, 'api/_lib/proveedor.js');
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      // 1 · Las reglas conocen a las que no admiten, y no tocan a las que sí.
      for (const v of ['es-US-Chirp-HD-D', 'es-US-Chirp3-HD-Achernar', 'es-US-Journey-D']) {
        if (!SIN_VELOCIDAD_NI_TONO.test(v)) fallos.push(`A «${v}» se le mandaría velocidad y la rechaza.`);
        if (!SIN_TONO.test(v)) fallos.push(`A «${v}» se le mandaría tono y lo rechaza.`);
        if (!SIN_SSML.test(v)) fallos.push(`A «${v}» se le mandaría SSML y lo rechaza: se gasta la llamada para nada.`);
      }
      // Studio no admite tono, pero sí velocidad y SSML.
      if (!SIN_TONO.test('es-US-Studio-B')) fallos.push('A Studio se le manda tono y no lo admite.');
      if (SIN_VELOCIDAD_NI_TONO.test('es-US-Studio-B')) fallos.push('A Studio se le quita la velocidad, que sí admite.');
      // Y a las corrientes no se les quita nada: perderían el ajuste fino por nada.
      for (const v of ['es-US-Neural2-B', 'es-MX-Standard-A', 'es-US-Wavenet-C']) {
        if (SIN_VELOCIDAD_NI_TONO.test(v) || SIN_TONO.test(v) || SIN_SSML.test(v)) {
          fallos.push(`A «${v}» se le quitan mandos que sí admite.`);
        }
      }

      // 2 · Y la petición se arma con eso: nada de mandarlos siempre.
      const i = prov.indexOf('audioEncoding: ');
      const cuerpo = i < 0 ? '' : prov.slice(i, i + 500);
      if (/^\s*speakingRate: velocidad,/m.test(cuerpo) || /^\s*pitch: tono,/m.test(cuerpo)) {
        fallos.push('La velocidad o el tono se mandan siempre: con Chirp, la petición se rechaza entera.');
      }
      if (!/SIN_VELOCIDAD_NI_TONO\.test\(v\) \? \{\} : \{ speakingRate/.test(cuerpo)) {
        fallos.push('La velocidad no se omite en las voces que no la admiten.');
      }
      if (!/SIN_TONO\.test\(v\) \? \{\} : \{ pitch/.test(cuerpo)) {
        fallos.push('El tono no se omite en las voces que no lo admiten.');
      }
      // Ni SSML: pedírselo no es «probar», es gastar la llamada para que la
      // rechacen — y con las de Chirp, en TODAS.
      if (!/admiteSsml && Array\.isArray\(marcas\)/.test(prov)) {
        fallos.push('Se le pide SSML a voces que no lo admiten: una llamada perdida por bloque.');
      }

      // 3 · Y se dice en pantalla, junto a la voz.
      if (!/function pintarLimitesDeVoz/.test(main) || !/id="limites-voz"/.test(fuente(ctx, 'index.html'))) {
        fallos.push('No se avisa de qué mandos ignora la voz elegida: parecerían rotos.');
      }
      if (!/\$\('voz'\)\?\.addEventListener\('change'/.test(main)) {
        fallos.push('El aviso no se actualiza al cambiar de voz: diría lo de la voz anterior.');
      }
      return fallos;
    },
    // Se rompe como estaba: los mandos a todas las voces por igual.
    romper: (ctx) =>
      editando(ctx, 'api/_lib/proveedor.js', (t) =>
        t
          .replace('...(SIN_VELOCIDAD_NI_TONO.test(v) ? {} : { speakingRate: velocidad }),', 'speakingRate: velocidad,')
          .replace('...(SIN_TONO.test(v) ? {} : { pitch: tono }),', 'pitch: tono,'),
      ),
  },

  {
    nombre: 'la-voz-sale-siempre-con-la-misma-cabecera-wav',
    dice: '«Solo las de Gemini se escuchan», y el reproductor de la muestra marcando 00:08 / 00:00: duración cero. Los dos caminos de voz devolvían formatos distintos y solo uno estaba comprobado: el de Gemini llega en PCM crudo y esta casa le escribe la cabecera, el de Cloud TTS venía tal cual del servicio. Un <audio> se cree la cabecera —si el tamaño del trozo de datos no cuadra, la duración le sale cero y no suena—, y nuestro propio lector no se enteraba porque recortaba al tamaño real del archivo. Por eso el defecto solo se veía en el botón de escuchar la voz.',
    comprobar(ctx) {
      const { normalizarWav, leerWav, escribirWav } = ctx.fn;
      const fallos = [];
      const f = 24000;
      const m = new Int16Array(f * 2);
      for (let i = 0; i < m.length; i++) m[i] = Math.round(Math.sin((i / f) * 900) * 9000);
      const bueno = Buffer.from(escribirWav({ muestras: m, frecuencia: f, canales: 1 }));

      const casos = {
        'una cabecera correcta': Buffer.from(bueno),
        // El que se vio: tamaño declarado a cero.
        'un tamaño de datos declarado a cero': (() => {
          const b = Buffer.from(bueno);
          b.writeUInt32LE(0, 40);
          return b;
        })(),
        // El de quien escribe la cabecera antes de saber cuánto audio saldrá.
        'un tamaño de streaming': (() => {
          const b = Buffer.from(bueno);
          b.writeUInt32LE(0xffffffff, 40);
          b.writeUInt32LE(0xffffffff, 4);
          return b;
        })(),
        'PCM crudo sin cabecera': Buffer.from(m.buffer.slice(0)),
      };

      for (const [que, buf] of Object.entries(casos)) {
        const salida = Buffer.from(normalizarWav(buf.toString('base64')), 'base64');
        const declarado = salida.length >= 44 ? salida.readUInt32LE(40) : 0;
        const riff = salida.length >= 8 ? salida.readUInt32LE(4) : 0;
        if (declarado !== m.length * 2) {
          fallos.push(`Con ${que}, el WAV sale declarando ${declarado} bytes de audio en vez de ${m.length * 2}: el reproductor marca 00:00.`);
        }
        if (riff !== m.length * 2 + 36) fallos.push(`Con ${que}, el tamaño RIFF sale mal.`);
        // Y las muestras tienen que estar TODAS: normalizar no puede perder audio.
        try {
          if (leerWav(salida.buffer.slice(salida.byteOffset, salida.byteOffset + salida.length)).muestras.length !== m.length) {
            fallos.push(`Con ${que}, el audio normalizado pierde muestras.`);
          }
        } catch (e) {
          fallos.push(`Con ${que}, el audio normalizado ni se deja leer: ${e.message}`);
        }
      }

      // Y los DOS caminos del servidor pasan por el mismo escritor: es lo que
      // impide que vuelva a haber un formato comprobado y otro no (§3).
      const prov = fuente(ctx, 'api/_lib/proveedor.js');
      if ((prov.match(/normalizarWav\(datos\.audioContent/g) || []).length < 2) {
        fallos.push('Alguna salida del servicio de voz se devuelve sin normalizar.');
      }
      if (/datos: datos\.audioContent,/.test(prov)) {
        fallos.push('Queda una salida de voz que devuelve la cabecera tal cual venga.');
      }
      return fallos;
    },
    // Se rompe como estaba: la cabecera del servicio, tal cual.
    romper: (ctx) => conFuncion(ctx, 'normalizarWav', (b64) => b64),
  },

  {
    nombre: 'una-palabra-floja-no-cuenta-como-silencio',
    dice: '«Dice ospi, silencio, tal.» La palabra partida en dos con un silencio dentro. El umbral de silencio era el 6 % DEL PICO del bloque: en una narración con una frase enfática y otra floja, la floja entera cae por debajo de ese 6 % y se clasifica como silencio. Medido: en un bloque de seis segundos con dos y medio a plena voz y tres de palabra floja, el detector daba UN silencio de 2,50 a 6,00 — tres segundos y medio de habla dados por callados—. Y como el corte cae en «silencio de verdad», no se marca forzado y el montaje le pone el RESPIRO encima: de ahí el silencio largo dentro de la palabra.',
    comprobar(ctx) {
      const { silencios, repartir } = ctx.fn;
      const fallos = [];
      const f = 24000;
      const bloque = (tramos) => {
        const total = tramos.reduce((s, [d]) => s + d, 0);
        const m = new Int16Array(Math.round(total * f));
        let i = 0;
        for (const [dur, amp] of tramos) {
          for (let k = 0; k < Math.round(dur * f); k++, i++) {
            const t = i / f;
            m[i] = Math.round(Math.sin(t * 900) * amp * (0.6 + 0.4 * Math.sin(t * 40)));
          }
        }
        return { muestras: m, frecuencia: f, canales: 1 };
      };

      // 1 · Frase enfática, pausa de verdad, palabra floja. Solo la pausa cuenta.
      const duro = bloque([[2.5, 26000], [0.4, 60], [3.1, 1400]]);
      const h = silencios(duro);
      const dentroDeLaFloja = h.filter((x) => x.fin / f > 3.1);
      if (dentroDeLaFloja.length) {
        fallos.push(
          `La palabra floja cuenta como silencio (hasta ${(dentroDeLaFloja[0].fin / f).toFixed(2)} s): ` +
            'el corte cae dentro de la palabra Y se le pone el respiro encima.',
        );
      }
      if (!h.some((x) => x.inicio / f > 2.3 && x.inicio / f < 2.7)) {
        fallos.push('La pausa de verdad ya no se encuentra: todos los cortes saldrían forzados.');
      }

      // 2 · Y una narración normal sigue encontrando sus pausas: el arreglo no
      // puede ser «no detectar nada», que dejaría la pieza sin respiros.
      const normal = bloque([[2, 9000], [0.3, 40], [2, 9000], [0.25, 40], [2, 9000]]);
      if (silencios(normal).length !== 2) {
        fallos.push(`En una narración normal con dos pausas se encuentran ${silencios(normal).length}.`);
      }
      // Ni un bloque casi callado, donde el nivel «normal» ES el silencio.
      if (!silencios(bloque([[0.5, 9000], [5, 40]])).length) {
        fallos.push('Un bloque casi callado se queda sin ningún silencio.');
      }

      // 3 · Y el reparto del bloque duro corta en la pausa, no en la palabra.
      const trozos = repartir(duro, [3, 3]);
      const corte = trozos[0].fin / f;
      if (corte > 3.0) fallos.push(`El corte cae en ${corte.toFixed(2)} s, dentro de la palabra floja.`);
      return fallos;
    },
    // Se rompe volviendo al umbral de antes: el 6 % del pico, a secas.
    romper: (ctx) =>
      conFuncion(ctx, 'silencios', ({ muestras, frecuencia, canales = 1 }, opciones = {}) => {
        const { ventanaMs = 10, minimoMs = 130, relativo = 0.06 } = opciones;
        const porVentana = Math.max(1, Math.round((ventanaMs / 1000) * frecuencia)) * canales;
        let pico = 1;
        for (let i = 0; i < muestras.length; i++) if (Math.abs(muestras[i]) > pico) pico = Math.abs(muestras[i]);
        const umbral = pico * relativo;
        const energia = [];
        for (let i = 0; i < muestras.length; i += porVentana) {
          let suma = 0;
          const fin = Math.min(i + porVentana, muestras.length);
          for (let j = i; j < fin; j++) suma += muestras[j] * muestras[j];
          energia.push(Math.sqrt(suma / Math.max(1, fin - i)));
        }
        const minimoVentanas = Math.max(1, Math.round(minimoMs / ventanaMs));
        const salida = [];
        let ini = -1;
        for (let v = 0; v <= energia.length; v++) {
          const callado = v < energia.length && energia[v] < umbral;
          if (callado && ini < 0) ini = v;
          if (!callado && ini >= 0) {
            if (v - ini >= minimoVentanas) {
              salida.push({
                inicio: ini * porVentana,
                fin: Math.min(v * porVentana, muestras.length),
                centro: Math.min(Math.round(((ini + v) / 2) * porVentana), muestras.length),
              });
            }
            ini = -1;
          }
        }
        return salida;
      }),
  },

  {
    nombre: 'el-reparto-sin-silencios-no-tira-la-narracion-entera',
    dice: 'En pantalla: «Unidad 3 de 26: undefined is not an object (evaluating \'previo.eleccion[previo.eleccion.length - 1].marco\')». Dos tomas muy cortas seguidas —sin un silencio real cerca— dejaban a la programación dinámica sin ningún camino compatible; ese candidato se guardaba con `eleccion: []`, y el siguiente paso lo leía como si tuviera uno. El bloque entero de 26 tomas se caía por dos que decían «No.».',
    comprobar(ctx) {
      const { repartir } = ctx.fn;
      const fallos = [];

      // Un tono continuo, sin ningún hueco de silencio: cada frontera solo tiene
      // el candidato FORZADO. Y dos objetivos de 0,05 s seguidos —«No.», «No.»—
      // caen a menos de los 0,15 s mínimos entre cortes: sin silencio que los
      // separe, la frontera de después se queda sin ningún camino compatible.
      const f = 24000;
      const m = new Int16Array(Math.round(3.15 * f));
      for (let i = 0; i < m.length; i++) m[i] = Math.round(Math.sin((i / f) * 900) * 8000);
      const audio = { muestras: m, frecuencia: f, canales: 1 };

      let trozos;
      try {
        trozos = repartir(audio, [1, 1, 0.05, 0.05, 1]);
      } catch (e) {
        fallos.push(`El reparto revienta con dos tomas cortas seguidas: ${e.message}`);
        return fallos;
      }

      if (trozos.length !== 5) fallos.push(`Salen ${trozos.length} trozos para 5 objetivos.`);
      if (trozos[0]?.inicio !== 0) fallos.push('El primer trozo no empieza en cero.');
      if (trozos[trozos.length - 1]?.fin !== m.length) {
        fallos.push('El último trozo no llega al final: se perderían las últimas sílabas.');
      }
      if (trozos.some((t, k) => k > 0 && t.inicio !== trozos[k - 1].fin)) {
        fallos.push('El reparto deja huecos o solapes cuando no encuentra camino.');
      }
      // Sin un camino compatible no se inventa un corte limpio: se fuerza, y se
      // dice — igual que cuando falta un silencio cerca de una sola frontera.
      if (!trozos.slice(0, 4).every((t) => t.forzado)) {
        fallos.push('Sin ningún silencio real, algún corte no sale marcado como forzado.');
      }
      return fallos;
    },
    // La misma máquina, con la guardia quitada: cada camino que se quedó sin
    // sitio (`eleccion: []`) se sigue ofreciendo como arranque del siguiente,
    // que es justo el fallo que apareció en producción.
    romper: (ctx) =>
      conFuncion(ctx, 'repartir', (audio, objetivos) => {
        const { muestras, frecuencia, canales = 1 } = audio;
        const marcosTotales = muestras.length / canales;
        const factor = marcosTotales / frecuencia / (objetivos.reduce((a, b) => a + b, 0) || 1);
        const minimoMarcos = Math.round(0.15 * frecuencia);
        const ideales = [];
        let acumulado = 0;
        for (let k = 0; k < objetivos.length - 1; k++) {
          acumulado += objetivos[k] * factor;
          ideales.push(Math.round(acumulado * frecuencia));
        }
        // Sin silencios detectados: cada frontera trae un único candidato, el
        // forzado en su ideal — de sobra para este caso, que se construyó sin
        // ninguno de verdad.
        const candidatos = ideales.map((marco) => [{ marco, forzado: true }]);
        let camino = candidatos[0].map((c) => ({ eleccion: [c] }));
        for (let k = 1; k < candidatos.length; k++) {
          camino = candidatos[k].map((c) => {
            let mejor = null;
            for (const previo of camino) {
              const ultimo = previo.eleccion[previo.eleccion.length - 1].marco;
              if (c.marco >= ultimo + minimoMarcos) mejor = previo;
            }
            return mejor ? { eleccion: [...mejor.eleccion, c] } : { eleccion: [] };
          });
        }
        return camino; // No llega tan lejos: revienta antes, dentro del bucle.
      }),
  },

  {
    nombre: 'al-redirigir-la-imagen-vieja-no-pasa-por-buena',
    dice: 'Al volver a dirigir, la ficha de plano se sustituye pero `imagen: ok` sobrevivía. Quedaba una toma que dice tener imagen y cuya imagen es de otro plano: el documental sale con la foto equivocada y nada lo avisa.',
    comprobar(ctx) {
      const dir = fuente(ctx, 'app/fases/direccion.js');
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      if (!/huellaDeFicha/.test(dir)) {
        fallos.push('No se compara la ficha nueva con la vieja: no se sabría si cambió.');
      }
      // La huella tiene que incluir lo que hace que la imagen sea de ESTA toma.
      const i = dir.indexOf('const huellaDeFicha');
      const huella = dir.slice(i, dir.indexOf(';', dir.indexOf('join', i)));
      for (const campo of ['lugar', 'encuadre', 'luz', 'descripcion', 'sujetos']) {
        if (!huella.includes(campo)) {
          fallos.push(`La huella del plano no mira «${campo}»: un cambio ahí pasaría desapercibido.`);
        }
      }
      // Y al cambiar, la imagen se marca ausente.
      if (!/desfasada: true/.test(dir)) fallos.push('Una toma que cambió de plano no se marca.');
      // Y el «cambió» tiene que salir DE COMPARAR, no de una constante: dejarlo en
      // falso conserva toda la comprobación escrita y no comprueba nada.
      if (!/const cambio = huellaDeFicha\(t\.plano\) !== huellaDeFicha\(plano\);/.test(dir)) {
        fallos.push('El «cambió de plano» no sale de comparar las dos fichas.');
      }
      if (!/imagen: reusa !== null \|\| t\.heredado \? t\.imagen : null/.test(dir)) {
        fallos.push('La imagen desfasada sigue contando como buena y saldría en el montaje.');
      }
      // Pero volver a dirigir SIN cambios no puede costar dinero.
      if (!/: \{ desfasada: false \}/.test(dir)) {
        fallos.push('Volver a dirigir invalidaría imágenes que no cambiaron: se pagarían dos veces.');
      }
      // Y se dice en pantalla, con el número, ANTES de gastar.
      if (!/desfasada\)\.length/.test(main)) {
        fallos.push('No se dice cuántas imágenes quedaron desfasadas: se descubriría pagando.');
      }
      return fallos;
    },
    romper: (ctx) =>
      editando(ctx, 'app/fases/direccion.js', (t) =>
        t.replace('const cambio = huellaDeFicha(t.plano) !== huellaDeFicha(plano);', 'const cambio = false;'),
      ),
  },

  {
    nombre: 'lo-heredado-sobrevive-a-guardar-y-cargar',
    dice: '`sanearToma` no hace spread: devuelve una lista blanca, y todo lo que no esté en ella se borra en CADA carga. `heredado` y `heredadoVid` no estaban, pero `imagen: ok` y `video: ok` sí: al recargar quedaba una toma que dice tener material y no dice cuál. El montaje se paraba y la fase ni siquiera lo regeneraba, porque para ella ya estaba hecho.',
    comprobar(ctx) {
      const { sanear, claveClip, claveFotograma } = ctx.fn;
      const fallos = [];
      const plano = { lugar: 'x', encuadre: 'plano general', luz: 'noche', descripcion: 'd', sujetos: [] };

      const P = sanear({
        id: 'p02',
        piezas: [{
          id: 'p02',
          // Y el cuaderno de actos a medias, que también tiene que sobrevivir: si
          // muere al recargar, el fallo a mitad de guion vuelve a tirar lo pagado.
          actosEscritos: { huella: 'Uno·4 | Dos·6', partes: ['## Uno\n\nTexto.'] },
          tomas: [
            { i: 8, movimiento: true, video: 'ok', heredadoVid: 'p01/t003/vid', plano, claseVisual: 'dramatizacion' },
            { i: 9, imagen: 'ok', heredado: 'p01/t004/img', plano, respiro: 2.5 },
            { i: 10, imagen: 'ok', heredado: 'no-es-una-clave', plano, claseVisual: 'cualquier-cosa' },
          ],
        }],
      });
      const [a, b, c] = P.piezas[0].tomas;

      if (a.heredadoVid !== 'p01/t003/vid') fallos.push('El clip heredado se pierde al cargar el proyecto.');
      if (b.heredado !== 'p01/t004/img') fallos.push('La imagen heredada se pierde al cargar el proyecto.');
      if (c.heredado !== null) fallos.push('Se acepta como clave heredada algo que no tiene forma de clave.');
      // La clase fina del plano: sin ella, re-dirigir tras recargar convertía las
      // dramatizaciones en «reconstrucción» y el documental volvía a ser objetos.
      if (a.claseVisual !== 'dramatizacion') fallos.push('La clase del plano se pierde al recargar.');
      if (c.claseVisual !== null) fallos.push('Se acepta una clase de plano que no existe.');
      if (b.respiro !== 2.5) fallos.push('El respiro se pierde al recargar.');
      if (P.piezas[0].actosEscritos?.partes?.[0] !== '## Uno\n\nTexto.') {
        fallos.push('Los actos escritos a medias se pierden al recargar: el fallo a mitad vuelve a costar dinero.');
      }

      // El viaje entero: guardado → cargado → ¿sigue apuntando a la otra pieza?
      if (claveClip('p02', a, [a]) !== 'p01/t003/vid') {
        fallos.push(`Tras cargar, el clip de la toma 8 apunta a ${claveClip('p02', a, [a])}.`);
      }
      if (claveFotograma('p02', b, [b]) !== 'p01/t004/img') {
        fallos.push(`Tras cargar, la imagen de la toma 9 apunta a ${claveFotograma('p02', b, [b])}.`);
      }
      return fallos;
    },
    // Se rompe como estaba: `sanear` borrando lo heredado y dejando el «ok».
    romper: (ctx) =>
      conFuncion(ctx, 'sanear', (bruto) => {
        const p = ctx.fn.sanear(bruto);
        for (const z of p.piezas) {
          for (const t of z.tomas) delete t.heredadoVid;
        }
        return p;
      }),
  },

  {
    nombre: 'la-herencia-llega-hasta-el-archivo-de-verdad',
    dice: 'Preguntar solo por la toma de partida no basta. Si la dueña de una cadena heredó su material de otra pieza, la repetición componía una clave local de un archivo que nadie ha generado ni va a generar. Y el banco repartía como donante a quien a su vez heredaba.',
    comprobar(ctx) {
      const { claveClip, claveFotograma, heredables } = ctx.fn;
      const fallos = [];
      const plano = { lugar: 'la comisaría', encuadre: 'plano general', luz: 'día', descripcion: 'd', sujetos: [] };

      // 1 · Una repetición de una toma que heredó.
      const dueña = { i: 8, movimiento: true, video: 'ok', heredadoVid: 'p01/t003/vid', reusa: null, plano };
      const repite = { i: 27, movimiento: true, video: null, reusa: 8, plano };
      if (claveClip('p02', repite, [dueña, repite]) !== 'p01/t003/vid') {
        fallos.push(
          `Una repetición de un clip heredado pide ${claveClip('p02', repite, [dueña, repite])}, ` +
            'que no lo genera nadie.',
        );
      }
      const dueñaImg = { i: 4, imagen: 'ok', heredado: 'p01/t009/img', reusa: null, plano };
      const repiteImg = { i: 30, imagen: null, reusa: 4, plano };
      if (claveFotograma('p02', repiteImg, [dueñaImg, repiteImg]) !== 'p01/t009/img') {
        fallos.push('Una repetición de una imagen heredada pide un archivo que no existe.');
      }

      // 1b · Y quien LEE un fotograma pasa por la misma resolución: componer la
      // clave local a mano ignoraba lo heredado, y convertir a clip una imagen
      // heredada generaba una imagen nueva idéntica a la ya pagada.
      const img = fuente(ctx, 'app/fases/imagen.js');
      const j = img.indexOf('export async function fotogramaDe');
      if (j < 0 || !/const clave = claveFotograma\(pieza, toma, tomas\);/.test(img.slice(j, j + 700))) {
        fallos.push('El lector de fotogramas compone la clave a mano: lo heredado no le sirve de partida y se paga otra vez.');
      }

      // 2 · El banco no puede repartir la clave de quien a su vez heredó.
      const A = { id: 'p01', titulo: 'A', tomas: [{ i: 3, movimiento: true, video: 'ok', plano }] };
      const B = {
        id: 'p02', titulo: 'B',
        tomas: [{ i: 7, movimiento: true, video: 'ok', heredadoVid: 'p01/t003/vid', plano }],
      };
      const h = heredables([{ i: 0, movimiento: true, video: null, plano }], [B, A]);
      if (!h.length) fallos.push('El banco no encuentra nada donde sí hay material.');
      else if (h[0].de.clave !== 'p01/t003/vid') {
        fallos.push(`El banco reparte ${h[0].de.clave}, que es un archivo que nunca se generó.`);
      }
      return fallos;
    },
    // Se rompe como estaba: sin preguntarle a la dueña de la cadena.
    romper: (ctx) =>
      conFuncion(ctx, 'claveClip', (pieza, toma, tomas) => {
        if (toma.heredadoVid) return toma.heredadoVid;
        const d = ctx.fn.tomaDelFotograma(toma, tomas);
        return `${pieza}/t${String(d.i).padStart(3, '0')}/vid`;
      }),
  },

  {
    nombre: 'heredar-la-imagen-no-deja-el-clip-en-el-estante',
    dice: '«En una toma donde heredé la imagen de otra toma, que también tenía video, solo se está mostrando la imagen.» El banco elegía UNA RAMA según el movimiento propuesto para la toma: con movimiento miraba solo el estante de clips, sin movimiento solo el de imágenes. Así una toma fija cuyo plano ya tenía un clip PAGADO se llevaba el fotograma y dejaba lo caro en el estante, y una toma con movimiento a la que no le encontraba clip se quedaba sin nada —ni siquiera la imagen que sí estaba—.',
    comprobar(ctx) {
      const { heredables, construirHoja } = ctx.fn;
      const fallos = [];
      const conClip = { lugar: 'el hostal', encuadre: 'plano medio', luz: 'noche', descripcion: 'd', sujetos: [] };
      const soloImagen = { lugar: 'el juzgado', encuadre: 'plano general', luz: 'día', descripcion: 'd', sujetos: [] };

      // Un banco con las dos formas que existen de verdad: un plano del que se
      // pagó el clip —y por tanto también su imagen, porque el clip sale de ella—
      // y otro que solo llegó al fotograma.
      const banco = [
        {
          id: 'p01',
          titulo: 'A',
          tomas: [
            { i: 3, movimiento: true, video: 'ok', imagen: 'ok', plano: conClip },
            { i: 9, movimiento: false, video: null, imagen: 'ok', plano: soloImagen },
          ],
        },
      ];
      const reparto = (t) =>
        heredables([t], banco)
          .map((h) => h.tipo)
          .sort()
          .join('+') || 'nada';

      // 1 · Lo que preguntó: toma FIJA sobre un plano que ya tiene clip. Se lleva
      // las dos cosas. El clip porque está pagado, es lo caro y se ve mejor; la
      // imagen porque la previa la usa de cartel y el montaje la necesita.
      const fija = reparto({ i: 0, movimiento: false, plano: conClip });
      if (fija !== 'img+vid') {
        fallos.push(
          `Una toma fija sobre un plano con clip pagado hereda «${fija}»: ` +
            'el clip se queda en el estante aunque ya esté pagado.',
        );
      }
      // 2 · Y al revés: toma CON MOVIMIENTO sobre un plano del que solo hay
      // imagen. Antes se quedaba sin nada y se volvía a pagar el fotograma.
      const animada = reparto({ i: 0, movimiento: true, plano: soloImagen });
      if (animada !== 'img') {
        fallos.push(
          `Una toma con movimiento sobre un plano que solo tiene imagen hereda «${animada}»: ` +
            'se paga otra vez un fotograma que ya existe.',
        );
      }
      // 3 · Lo ya resuelto no se vuelve a repartir, ni por un lado ni por el otro.
      const yaTiene = reparto({ i: 0, movimiento: false, video: 'ok', imagen: 'ok', plano: conClip });
      if (yaTiene !== 'nada') {
        fallos.push(`Una toma que ya tiene su material recibe «${yaTiene}»: se pisaría lo pagado.`);
      }

      // 4 · Y el clip heredado tiene que LLEGAR AL MONTAJE. La hoja solo abre el
      // clip de una toma con movimiento, así que heredarlo sin marcar movimiento
      // deja el archivo comprado y sin usar: se montaría la imagen fija.
      const tomas = [
        { i: 0, escena: 0, texto: 'x', segundos: 5, medida: true, plano: conClip,
          tipoImagen: 'reconstruccion', movimiento: true, heredadoVid: 'p01/t003/vid',
          heredado: 'p01/t003/img', video: 'ok', imagen: 'ok', reusa: null },
      ];
      const hoja = construirHoja({ pieza: 'p02', tomas, escenas: [{ n: 0, titulo: 'A' }] });
      if (hoja.tomas[0]?.archivo !== 'p01/t003/vid') {
        fallos.push(
          `El clip heredado no llega al montaje: la hoja abre ${hoja.tomas[0]?.archivo}.`,
        );
      }
      // Y el que aplica la herencia tiene que marcar ese movimiento. Vive en UN
      // solo sitio a propósito: hay dos caminos que heredan —el botón de
      // reutilizar y la resolución automática contra la biblioteca al dirigir— y
      // con dos implementaciones ya pasó una vez que una de ellas se olvidaba de
      // marcar `movimiento` y montaba la imagen fija con el clip comprado al lado.
      const main = fuente(ctx, 'app/main.js');
      const i = main.indexOf('function aplicarHerencia(');
      const cuerpo = i < 0 ? '' : main.slice(i, main.indexOf('\n}', i));
      if (!/t\.heredadoVid = de\.clave;[\s\S]{0,400}?t\.movimiento = true;/.test(cuerpo)) {
        fallos.push('Al heredar un clip no se marca la toma como animada: la hoja no lo pediría.');
      }
      for (const [quién, ancla] of [
        ['el botón de reutilizar', "accion(\n  'b-reutilizar',"],
        ['la resolución contra la biblioteca', 'async function resolverContraBiblioteca('],
      ]) {
        const j = main.indexOf(ancla);
        if (j < 0 || !/aplicarHerencia\(/.test(main.slice(j, j + 2500))) {
          fallos.push(`${quién} hereda por su cuenta: dos sitios donde olvidarse de marcar el movimiento.`);
        }
      }
      return fallos;
    },
    // Se rompe como estaba: una rama u otra según el movimiento propuesto, nunca
    // las dos. Va por el contexto —no editando la fuente— porque la comprobación
    // EJECUTA `heredables`, y un sabotaje sobre el texto no la alcanzaría.
    romper: (ctx) =>
      conFuncion(ctx, 'heredables', (tomas, anteriores) => {
        const porI = new Map(tomas.map((t) => [t.i, t]));
        return ctx.fn
          .heredables(tomas, anteriores)
          .filter((h) => (porI.get(h.i)?.movimiento ? h.tipo === 'vid' : h.tipo === 'img'));
      }),
  },

  {
    nombre: 'la-biblioteca-se-resuelve-por-arquetipo-y-no-por-parecido',
    dice: 'El banco entre casos busca por la huella del plano —lugar, encuadre, luz—, y eso solo encuentra lo que coincide POR CASUALIDAD: el perito de este episodio no coincide con el del anterior salvo que el director escriba las tres cosas letra por letra igual, y no lo hace —escribe «el laboratorio» una vez y «la sala del laboratorio» la siguiente—. El arquetipo sí es una clave estable, porque sale del catálogo y no de la redacción. Sin esta resolución, la biblioteca se paga entera y no la usa nadie: cada episodio genera su propio perito.',
    comprobar(ctx) {
      const { heredables, tomasDeBiblioteca, sincronizarBiblioteca, resumenBiblioteca, ID_BIBLIOTECA } = ctx.fn;
      const fallos = [];

      // La biblioteca, con el perito ya pagado —imagen y clip—.
      const biblioteca = {
        id: ID_BIBLIOTECA,
        titulo: 'Biblioteca del canal',
        esBiblioteca: true,
        tomas: tomasDeBiblioteca().map((t) =>
          t.personaje === 'perito' ? { ...t, imagen: 'ok', video: 'ok' } : t,
        ),
      };
      const dueña = biblioteca.tomas.find((t) => t.personaje === 'perito');
      if (!dueña) return ['La biblioteca no trae ningún arquetipo de perito: no hay nada que resolver.'];

      // Un episodio con el testimonio del perito, REDACTADO DISTINTO. Es el caso
      // real: nadie escribe dos veces la misma frase.
      const episodio = [
        {
          i: 4,
          personaje: 'perito',
          plano: {
            lugar: 'la sala de análisis del instituto',
            encuadre: 'primer plano',
            luz: 'luz de tubo',
            descripcion: 'otra cosa',
            sujetos: [],
            personaje: 'perito',
          },
        },
      ];
      const puede = heredables(episodio, [biblioteca]);
      const clave = (tipo) => puede.find((x) => x.tipo === tipo)?.de?.clave;

      if (clave('vid') !== `${ID_BIBLIOTECA}/t${String(dueña.i).padStart(3, '0')}/vid`) {
        fallos.push(
          `El testimonio del perito no encuentra su clip en la biblioteca (${clave('vid')}): ` +
            'se generaría un perito nuevo con el de la biblioteca pagado al lado.',
        );
      }
      if (clave('img') !== `${ID_BIBLIOTECA}/t${String(dueña.i).padStart(3, '0')}/img`) {
        fallos.push(`El testimonio del perito no encuentra su imagen en la biblioteca (${clave('img')}).`);
      }

      // Y un arquetipo que la biblioteca NO tiene no inventa nada.
      const otro = heredables(
        [{ i: 9, personaje: 'buzo-de-rescate', plano: { lugar: 'x', encuadre: 'y', luz: 'z', sujetos: [], personaje: 'buzo-de-rescate' } }],
        [biblioteca],
      );
      if (otro.length) fallos.push('Un arquetipo que no está en la biblioteca hereda algo igualmente.');

      // La biblioteca se sincroniza SIN PISAR lo pagado: volver a abrirla después
      // de añadir un género no puede costar dinero por sí solo.
      const puesta = sincronizarBiblioteca(biblioteca);
      const despues = puesta.tomas.find((t) => t.personaje === 'perito');
      if (despues?.imagen !== 'ok' || despues?.video !== 'ok') {
        fallos.push('Sincronizar la biblioteca borra lo ya generado: se volvería a pagar entera.');
      }
      if (!puesta.esBiblioteca || puesta.id !== ID_BIBLIOTECA) {
        fallos.push('La pieza de biblioteca pierde su identidad al sincronizarse: se montaría como un episodio.');
      }
      if (puesta.guion) fallos.push('La biblioteca tiene guion: no se monta nunca y no debería tenerlo.');

      // LAS CLAVES SON ESTABLES. Si al añadir un género se movieran los índices,
      // todo lo ya generado apuntaría a otro plano y habría que pagarlo otra vez.
      const soloUno = tomasDeBiblioteca({ generos: ctx.fn.GENEROS.slice(0, 1) });
      const todos = tomasDeBiblioteca();
      for (const t of soloUno) {
        const igual = todos.find((x) => x.clave === t.clave);
        if (!igual || igual.i !== t.i) {
          fallos.push(
            `Añadir géneros mueve el índice de «${t.clave}» (de ${t.i} a ${igual?.i}): ` +
              'la biblioteca ya pagada apuntaría a otro plano.',
          );
          break;
        }
      }

      // Y los arquetipos llevan clip mientras los recursos no: un plano de alguien
      // declarando tiene que moverse; un archivador quieto se ve igual de bien.
      const r = resumenBiblioteca(todos);
      if (r.clips !== r.personajes) {
        fallos.push(`La biblioteca pide ${r.clips} clips para ${r.personajes} arquetipos: alguien paga de más o de menos.`);
      }
      if (todos.filter((t) => t.recurso).some((t) => t.movimiento)) {
        fallos.push('Un recurso transversal lleva clip: es la fase más cara pagada por un fondo quieto.');
      }
      return fallos;
    },
    // Se rompe como estaba antes del tercer banco: solo por la huella del plano,
    // que es lo que no encuentra nunca al mismo perito escrito de dos maneras.
    romper: (ctx) =>
      conFuncion(ctx, 'heredables', (tomas, anteriores) =>
        ctx.fn.heredables(
          tomas.map((t) => ({ ...t, personaje: '', plano: { ...(t.plano || {}), personaje: '' } })),
          anteriores,
        ),
      ),
  },

  {
    nombre: 'el-reparto-rota-y-el-canal-se-acuerda-de-a-quien-uso',
    dice: '«Si en un documental utilizó un policía, por lo menos en los dos siguientes no debe utilizar el mismo, debe utilizar otro. Y así.» Una biblioteca con un perito resuelve el coste y crea un problema peor: el mismo señor aparece en el episodio 3, en el 4 y en el 5 hablando de casos distintos, y eso se ve a la primera — deja de parecer un canal de documentales y parece lo que es, una plantilla. Y no basta con tener cinco: hay que ACORDARSE de a quién se usó, porque sin memoria cada episodio elige el primero de la lista y los otros cuatro no salen nunca.',
    comprobar(ctx) {
      const { elegirVariante, EPISODIOS_SIN_REPETIR, heredables, tomasDeBiblioteca, ID_BIBLIOTECA } = ctx.fn;
      const fallos = [];
      const cinco = ['v1', 'v2', 'v3', 'v4', 'v5'].map((id) => ({ id }));

      // 1 · Diez episodios seguidos: nadie repite dentro del margen, y salen todos.
      const historial = {};
      const orden = [];
      const salidas = [];
      for (let n = 1; n <= 10; n++) {
        const pieza = `p${String(n).padStart(2, '0')}`;
        orden.push(pieza);
        const v = elegirVariante({ clave: 'personaje:policia', disponibles: cinco, historial, orden, pieza });
        historial[pieza] = { 'personaje:policia': v.id };
        salidas.push(v.id);
      }
      for (let n = 1; n < salidas.length; n++) {
        const ventana = salidas.slice(Math.max(0, n - EPISODIOS_SIN_REPETIR), n);
        if (ventana.includes(salidas[n])) {
          fallos.push(
            `El policía ${salidas[n]} vuelve en el episodio ${n + 1} habiendo salido en los ` +
              `${EPISODIOS_SIN_REPETIR} anteriores: ${salidas.join(', ')}.`,
          );
          break;
        }
      }
      // Y NO SE QUEDA NADIE FUERA. Con memoria pero sin repartir por uso, saldrían
      // tres en rotación y los otros dos no aparecerían jamás.
      if (new Set(salidas).size < cinco.length) {
        fallos.push(
          `En diez episodios solo salen ${new Set(salidas).size} de los ${cinco.length} policías: ` +
            `${salidas.join(', ')}. Se pagaron cinco caras para usar tres.`,
        );
      }

      // 2 · SIN MEMORIA NO HAY ROTACIÓN. Es la mitad de la invariante: con el
      // historial vacío en cada episodio, siempre sale el mismo.
      const sinMemoria = [1, 2, 3].map((n) =>
        elegirVariante({ clave: 'personaje:policia', disponibles: cinco, historial: {}, orden: [], pieza: `p0${n}` }).id,
      );
      if (new Set(sinMemoria).size !== 1) {
        fallos.push('La elección no es determinista sin historial: el mismo proyecto daría repartos distintos.');
      }

      // 3 · Dentro de UN episodio la persona es la misma. Si se eligiera toma a
      // toma, un episodio con cuatro testimonios del perito tendría cuatro peritos.
      const biblioteca = {
        id: ID_BIBLIOTECA,
        titulo: 'Biblioteca',
        esBiblioteca: true,
        tomas: tomasDeBiblioteca().map((t) => ({ ...t, imagen: 'ok', video: t.movimiento ? 'ok' : null })),
      };
      const conPerito = [0, 1, 2, 3].map((i) => ({
        i,
        personaje: 'perito',
        plano: { lugar: `sitio ${i}`, encuadre: 'x', luz: 'y', sujetos: [], personaje: 'perito' },
      }));
      const r1 = heredables(conPerito, [biblioteca], { historial: {}, orden: ['p01'], pieza: 'p01' });
      const claves = new Set(r1.filter((x) => x.tipo === 'img').map((x) => x.de.clave));
      if (claves.size !== 1) {
        fallos.push(`Cuatro testimonios del perito en un mismo episodio dan ${claves.size} caras distintas.`);
      }
      if (!r1.reparto || !r1.reparto['personaje:perito']) {
        fallos.push('La herencia no dice a quién eligió: el episodio siguiente no sabría a quién no repetir.');
      }

      // 4 · Y entre DOS episodios, con el primero ya anotado, no se repite.
      const hist = { p01: r1.reparto };
      const r2 = heredables(conPerito, [biblioteca], { historial: hist, orden: ['p01', 'p02'], pieza: 'p02' });
      if (r2.reparto['personaje:perito'] === hist.p01['personaje:perito']) {
        fallos.push('El episodio siguiente repite al mismo perito: la memoria no se está usando.');
      }
      // Y volver a resolver el MISMO episodio no cambia la cara a mitad.
      const otraVez = heredables(conPerito, [biblioteca], { historial: hist, orden: ['p01', 'p02'], pieza: 'p01' });
      if (otraVez.reparto['personaje:perito'] !== hist.p01['personaje:perito']) {
        fallos.push('Volver a dirigir un episodio le cambia el perito: el material ya generado no cuadraría.');
      }

      // 5 · Y si un papel tuviera menos personas que el margen, se afloja en vez
      // de quedarse sin plano: perder el plano rompe el episodio, repetir no.
      const uno = elegirVariante({
        clave: 'personaje:x',
        disponibles: [{ id: 'v1' }],
        historial: { p01: { 'personaje:x': 'v1' }, p02: { 'personaje:x': 'v1' } },
        orden: ['p01', 'p02', 'p03'],
        pieza: 'p03',
      });
      if (uno?.id !== 'v1') fallos.push('Un papel con una sola persona se queda sin plano en vez de repetirla.');
      return fallos;
    },
    // Se rompe como estaría sin memoria: la primera versión disponible, siempre.
    // Es exactamente lo que hacía antes de esto, y lo que ponía al mismo perito en
    // todos los episodios del canal.
    romper: (ctx) => conFuncion(ctx, 'elegirVariante', ({ disponibles }) => (disponibles || [])[0] || null),
  },

  {
    nombre: 'la-musica-se-pide-en-ingles-porque-es-lo-unico-que-entiende',
    dice: 'La música falló SIEMPRE, no a veces: «Unsupported language detected. Please use one of the supported languages: en.» La instrucción iba en español como todo lo demás, y el generador rechaza la petición entera antes de generar nada. Reintentar no podía arreglarlo nunca.',
    comprobar(ctx) {
      const { atmosferaDe } = ctx.fn;
      const fallos = [];
      const tomas = [
        { i: 0, escena: 1, plano: { lugar: 'el puerto', luz: 'noche' } },
        { i: 1, escena: 2, plano: { lugar: 'la comisaría', luz: 'fluorescente' } },
        { i: 2, escena: 3, plano: { lugar: 'el juzgado', luz: 'día' } },
      ];

      // Tres situaciones, y en las tres tiene que salir inglés: con ficha en inglés,
      // con un tratamiento viejo que solo trae español, y sin tratamiento ninguno.
      const casos = [
        [
          'con ficha en inglés',
          { musica: { atmosfera: 'Tensión contenida', enIngles: { mood: 'cold dread', instruments: 'low cello', avoid: 'drums' } } },
        ],
        ['con tratamiento viejo, solo español', { musica: { atmosfera: 'Cuerdas graves sostenidas', instrumentacion: 'violonchelo', queEvitar: 'percusión' } }],
        ['sin tratamiento', null],
      ];

      for (const [qué, tr] of casos) {
        for (const escena of [{ n: 1, titulo: 'El puerto' }, { n: 3, titulo: 'El juicio' }]) {
          const p = atmosferaDe(escena, tomas, tr);
          // Nada fuera del ASCII imprimible: una sola tilde delata el idioma.
          const raro = /[^\x20-\x7e]/.exec(p);
          if (raro) {
            fallos.push(`${qué}, escena ${escena.n}: la instrucción lleva «${raro[0]}» — eso no es inglés.`);
          }
          // Y tampoco palabras españolas sin tilde, que pasarían el filtro de arriba.
          // Ojo con la lista: «tension» es española Y inglesa, y meterla marcaba
          // como español un texto que estaba bien. Solo van las que no son ambas.
          const español = /\b(de|la|el|los|las|sin|con|una|voz|graves|musica|escena|luz|cuerdas)\b/i.exec(p);
          if (español) {
            fallos.push(`${qué}, escena ${escena.n}: aparece «${español[0]}», que es español.`);
          }
          if (!/[a-z]/i.test(p)) fallos.push(`${qué}, escena ${escena.n}: la instrucción quedó vacía.`);
        }
      }

      // Y no puede salir lo mismo para todas las escenas: se pagaría una pieza por
      // escena para que todas sonaran idénticas, y el documental sale plano.
      const tr = { musica: { enIngles: { mood: 'cold dread', instruments: 'low cello', avoid: 'drums' } } };
      const arranque = atmosferaDe({ n: 1 }, tomas, tr);
      const cierre = atmosferaDe({ n: 3 }, tomas, tr);
      if (arranque === cierre) {
        fallos.push('La apertura y el cierre piden exactamente lo mismo: se paga dos veces la misma música.');
      }

      // El director tiene que estar OBLIGADO a escribirla en inglés; si el esquema
      // no la exige, vuelve el español por la puerta de atrás.
      const dir = fuente(ctx, 'app/fases/director.js');
      if (!/enIngles/.test(dir)) {
        fallos.push('El director no escribe la ficha de música en inglés: no habría de dónde sacarla.');
      }
      if (!/required:\s*\[[^\]]*'enIngles'/.test(dir)) {
        fallos.push('La ficha en inglés es opcional para el director: se la va a saltar.');
      }
      return fallos;
    },
    // Se rompe como estaba: pasando el español del director tal cual.
    romper: (ctx) =>
      conFuncion(ctx, 'atmosferaDe', (escena, tomas, tratamiento) =>
        `Música instrumental de documental. ${tratamiento?.musica?.atmosfera || 'Tensión contenida.'}`,
      ),
  },

  {
    nombre: 'un-clip-sale-de-su-imagen-y-si-falta-se-genera',
    dice: 'Darle a Clips fallaba con «genera la imagen primero» y ahí se acababa. Pero un clip SIEMPRE parte de un fotograma —animar sin imagen de partida daría otra escena, no la de este documental—, así que en vez de mandar a nadie a otra pantalla se genera la imagen y se sigue.',
    comprobar(ctx) {
      const mov = fuente(ctx, 'app/fases/movimiento.js');
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      const i = mov.indexOf('export async function generarClip');
      if (i < 0) return ['No se encuentra la generación de clips.'];
      const cuerpo = mov.slice(i, i + 2500);

      if (!/generarImagen/.test(mov)) {
        fallos.push('El clip no sabe generar su imagen de partida: sigue dependiendo de que alguien la haya hecho antes.');
      }
      if (!/await generarImagen\(/.test(cuerpo)) {
        fallos.push('Falta el fotograma y no se genera: el clip vuelve a fallar sin más.');
      }
      // Y el fotograma hay que volver a pedirlo: generarlo y seguir con el `fot`
      // vacío de antes dejaría la petición sin imagen de partida.
      const tras = cuerpo.indexOf('await generarImagen(');
      if (tras > 0 && !/fot = await fotogramaDe/.test(cuerpo.slice(tras, tras + 400))) {
        fallos.push('Se genera la imagen pero no se vuelve a leer: el clip saldría igualmente sin fotograma.');
      }
      // La imagen que se genere tiene que llevar el tratamiento, o sale con otra
      // paleta y se nota justo en el plano que además lleva movimiento.
      if (!/generarClip\([^)]*tratamiento/s.test(mov)) {
        fallos.push('La generación de clips no recibe el tratamiento: la imagen saldría con otra paleta.');
      }
      const j = main.indexOf('movimiento.generarClip({');
      if (j < 0) fallos.push('La pantalla no llama a la generación de clips.');
      else if (!/tratamiento:/.test(main.slice(j, j + 700))) {
        fallos.push('La pantalla no le pasa el tratamiento al clip.');
      }
      return fallos;
    },
    // Se rompe como estaba: fallando en vez de generar el fotograma.
    romper: (ctx) =>
      editando(ctx, 'app/fases/movimiento.js', (t) =>
        t.replace(
          /await generarImagen\(\{[^}]*\}\);/s,
          "throw new Error('Genera la imagen primero.');",
        ),
      ),
  },

  {
    nombre: 'ninguna-imagen-pide-letras-y-ninguna-sale-de-catalogo',
    dice: 'Los expedientes y los titulares salían con garabatos —el generador no sabe escribir— y un texto ilegible en primer plano delata que la imagen es falsa. Y el resto salía «básico»: sujeto centrado, todo enfocado, todo iluminado, el sitio recién ordenado. Eso es una foto de banco de imágenes, no un fotograma.',
    comprobar(ctx) {
      const { componerInstruccion } = ctx.fn;
      const fallos = [];
      const toma = {
        i: 0,
        plano: {
          encuadre: 'detalle',
          lugar: 'el archivo judicial',
          luz: 'un flexo',
          sujetos: ['un archivero de unos sesenta'],
          descripcion: 'Una carpeta abierta sobre la mesa.',
        },
      };

      // El aspecto es del canal y hay uno solo, así que esto se comprueba una vez.
      //
      // La prohibición de texto legible va SUELTA y no dentro del aspecto: es una
      // regla del generador —no sabe escribir— y no una decisión de cómo se ve el
      // canal, así que tiene que sobrevivir a cualquier cambio de aspecto.
      {
        const estilo = { id: 'canal' };
        const p = componerInstruccion(toma, ctx.config, { tratamiento: null });

        if (!/NADA DE TEXTO LEGIBLE/.test(p)) {
          fallos.push(`Estilo «${estilo.id}»: no se prohíbe el texto legible; los documentos saldrían con garabatos.`);
        }
        // Y no basta con prohibirlo: hay que decir CÓMO se resuelve un documento,
        // o el generador se limita a quitar el documento.
        if (!/escorzo|fuera de foco|cortad/i.test(p)) {
          fallos.push(`Estilo «${estilo.id}»: se prohíbe el texto sin decir cómo encuadrar un documento.`);
        }
        if (!/FOTOGRAMA de una serie documental|no una foto de banco de im[aá]genes/.test(p)) {
          fallos.push(`Estilo «${estilo.id}»: no se pide un fotograma, así que sale una foto de catálogo.`);
        }
        // Los puntos CONCRETOS que separan un fotograma de una foto de stock.
        // «Que sea cinematográfico» no significa nada para un generador: si no le
        // dices otra cosa te da la foto media de internet —sujeto centrado, todo
        // enfocado, todo iluminado por igual, el sitio recién ordenado—, y cada uno
        // de estos es lo contrario de uno de esos puntos.
        for (const [qué, re] of [
          ['un primer término que tape parte del cuadro', /primer t[eé]rmino/i],
          ['el sujeto descentrado', /descentrado/i],
          ['una sola fuente de luz con dirección', /una sola fuente de luz|UNA sola fuente/i],
          ['que lo que no alcanza la luz se quede en negro', /se queda en negro|sin relleno/i],
          ['textura en el aire', /polvo|vaho|llovizna/i],
          ['foco selectivo', /foco selectivo|profundidad de campo corta/i],
          ['grano de película y negros densos', /grano de pel[ií]cula/i],
          ['que el sitio esté vivido', /vivido|marcas de uso/i],
          ['una imperfección de cámara', /destello en el objetivo|vi[ñn]eta/i],
          ['que no parezca un render', /no de render|nunca de render/i],
        ]) {
          if (!re.test(p)) fallos.push(`Estilo «${estilo.id}»: no se pide ${qué}.`);
        }
      }

      // Y el director no puede pedir texto por su cuenta: si la descripción dice
      // «el titular reza DESAPARECIDA», el generador lo intenta igual.
      const dir = fuente(ctx, 'app/fases/direccion.js');
      if (!/NADA DE TEXTO LEGIBLE/.test(dir)) {
        fallos.push('El director puede describir lo que pone un papel, y entonces el generador lo intenta.');
      }
      if (!/fotograma/i.test(dir)) {
        fallos.push('Al director no se le pide que describa fotogramas: seguirá describiendo fotos de archivo.');
      }
      return fallos;
    },
    // Se rompe como estaba: la instrucción sin los dos bloques.
    //
    // Se sabotea LA FUNCIÓN y no el archivo, que es la lección de siempre: esta
    // invariante COMPONE instrucciones de verdad, así que tocar el texto del
    // fuente no la alcanza y salía «ciega».
    romper: (ctx) =>
      conFuncion(ctx, 'componerInstruccion', (...a) =>
        ctx.fn
          .componerInstruccion(...a)
          .replace(/Esto es un FOTOGRAMA[\s\S]*?iluminación de estudio\./, '')
          .replace(/NADA DE TEXTO LEGIBLE[\s\S]*?página escrita\./, ''),
      ),
  },

  {
    nombre: 'una-imagen-convertida-en-clip-sigue-estando-en-el-banco',
    dice: 'El banco decía «es donante de imagen solo si NO lleva movimiento», y eso tiraba media reserva: una toma con clip TAMBIÉN tiene su imagen —el clip sale de ella, siempre—. Convertías una imagen en video y la imagen desaparecía del banco. Y al revés: una toma que hereda su clip seguía pagando una imagen que no se ve nunca, porque en el montaje manda el clip.',
    comprobar(ctx) {
      const { heredables, planificarImagenes } = ctx.fn;
      const fallos = [];
      const plano = { lugar: 'la comisaría', encuadre: 'plano general', luz: 'noche', descripcion: 'd', sujetos: [] };

      // 1 · Una toma convertida a clip conserva su imagen y suma su clip: las dos
      // cosas quedan disponibles para las demás producciones.
      const anterior = {
        id: 'p01',
        titulo: 'Caso A',
        tomas: [{ i: 5, movimiento: true, imagen: 'ok', video: 'ok', plano }],
      };
      const pideImagen = { i: 0, movimiento: false, imagen: null, plano };
      const pideClip = { i: 1, movimiento: true, video: null, plano };
      const h = heredables([pideImagen, pideClip], [anterior]);

      const img = h.find((x) => x.tipo === 'img');
      const vid = h.find((x) => x.tipo === 'vid');
      if (!img) fallos.push('La imagen de una toma convertida en clip ya no se ofrece: media reserva perdida.');
      else if (img.de.clave !== 'p01/t005/img') fallos.push(`Se ofrece ${img.de.clave} como imagen.`);
      if (!vid) fallos.push('El clip no se ofrece.');
      else if (vid.de.clave !== 'p01/t005/vid') fallos.push(`Se ofrece ${vid.de.clave} como clip.`);

      // 2 · Una toma con el clip heredado NO paga imagen: no se vería jamás.
      const conClipHeredado = { i: 2, movimiento: true, heredadoVid: 'p01/t005/vid', video: null, imagen: null, plano };
      const normal = { i: 3, movimiento: false, imagen: null, plano };
      // Y una con movimiento pero SIN clip resuelto sí la paga: es su fotograma
      // de partida, sin él no hay clip que generar.
      const sinResolver = { i: 4, movimiento: true, video: null, imagen: null, plano };
      const plan = planificarImagenes([conClipHeredado, normal, sinResolver]).map((t) => t.i);
      if (plan.includes(2)) {
        fallos.push('Se paga la imagen de una toma cuyo clip viene heredado: no se ve nunca.');
      }
      if (!plan.includes(3)) fallos.push('Se deja sin imagen una toma que la necesita.');
      if (!plan.includes(4)) {
        fallos.push('Se deja sin imagen una toma con movimiento y sin clip: no habría fotograma de partida.');
      }
      return fallos;
    },
    // Se rompe como estaba: quien lleva clip deja de ofrecer su imagen. Se sabotea
    // LA FUNCIÓN, no el archivo: esta invariante consulta el banco de verdad, así
    // que editar el fuente no la alcanzaba y salía «ciega».
    romper: (ctx) =>
      conFuncion(ctx, 'heredables', (tomas, anteriores) =>
        ctx.fn.heredables(
          tomas,
          (anteriores || []).map((z) => ({
            ...z,
            tomas: (z.tomas || []).map((t) => (t.movimiento ? { ...t, imagen: null, heredado: null } : t)),
          })),
        ),
      ),
  },

  {
    nombre: 'cualquier-imagen-se-puede-convertir-en-clip',
    dice: 'El cupo de movimiento lo reparte el director a ciegas, leyendo descripciones. Pero cuál merece moverse se ve mirando la imagen, y eso solo pasa en la previa. Sin un botón ahí, la única forma de animar una toma que el director no marcó era no tenerla.',
    comprobar(ctx) {
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      const i = main.indexOf('async function convertirEnClip');
      if (i < 0) return ['No hay forma de convertir una imagen en clip.'];
      const cuerpo = main.slice(i, main.indexOf('\nasync function bombearFilaDeClips', i));
      const bomba = main.slice(main.indexOf('async function bombearFilaDeClips'), main.indexOf('async function bombearFilaDeClips') + 2600);

      // LA FILA. Cada botón disparaba su llamada al instante, en paralelo, directo
      // contra el rate limit: había que esperar pegado al teléfono a que terminara
      // un clip para poder pedir el siguiente. Tocar el botón ENCOLA, y una sola
      // bomba los genera de uno en uno.
      if (!/filaClips\.some\(\(x\) => x\.i === i\)/.test(cuerpo)) {
        fallos.push('Tocar dos veces el mismo botón encolaría el clip dos veces: se pagaría doble.');
      }
      if (!/filaClips\.push\(/.test(cuerpo)) {
        fallos.push('El botón no encola: dispara la llamada al instante y en paralelo, contra el rate limit.');
      }
      if (!/if \(bombeandoClips\) return;/.test(bomba)) {
        fallos.push('Puede arrancar más de una bomba a la vez: la fila deja de ser de uno en uno.');
      }
      if (!/while \(filaClips\.length\)/.test(bomba)) {
        fallos.push('La bomba no vacía la fila: genera uno y se para.');
      }
      if (!/catch \(e\)/.test(bomba)) {
        fallos.push('Un clip que falle tumba la fila entera: los demás encolados se pierden.');
      }
      if (!/estadoEnFila\(x\.i\)/.test(main)) {
        fallos.push('El repintado pierde el estado de la fila: un clip en cola volvería a ofrecerse.');
      }

      // La galería dice el estado del clip en cada tarjeta —con 83 imágenes no se
      // puede cruzar de pestaña llevando la cuenta— y con el clip pagado no se
      // vuelve a ofrecer convertir: apretarlo lo pagaría otra vez.
      if (!/clip listo/.test(main) || !/clip pendiente/.test(main)) {
        fallos.push('La galería no dice qué imagen tiene ya su clip: toca cruzar a la otra pestaña contando.');
      }
      if (!/hay && !clipListo/.test(main)) {
        fallos.push('Se ofrece convertir una imagen cuyo clip ya está pagado: apretarlo lo paga otra vez.');
      }

      if (!/Convertir en clip/.test(main)) fallos.push('No hay botón: la función existe y no la llama nadie.');
      if (!/\bconvertirEnClip\([tx]\.i/.test(main)) {
        fallos.push('El botón no dice de qué toma es: convertiría otra.');
      }
      if (!/movimiento\.generarClip\(/.test(bomba)) fallos.push('No se genera el clip.');
      if (!/movimiento = true/.test(cuerpo)) {
        fallos.push('La toma no queda marcada con movimiento: el montaje seguiría poniendo la imagen fija.');
      }
      // Marcarla DESPUÉS de generar pierde la decisión si se cierra la pestaña a
      // mitad: un clip tarda minutos y al volver la toma no sabría que lo lleva.
      const marca = cuerpo.indexOf('movimiento = true');
      const guardaAntes = cuerpo.indexOf('await guardar()');
      const encola = cuerpo.indexOf('filaClips.push(');
      if (!(marca >= 0 && marca < guardaAntes && guardaAntes < encola)) {
        fallos.push('La decisión no se guarda antes de encolar: si se cierra a mitad, se pierde.');
      }
      // Cuesta dinero, y es la fase más cara: no puede irse en un toque sin avisar.
      if (!/confirm\(/.test(cuerpo)) fallos.push('Se gasta en un clip sin preguntar.');
      return fallos;
    },
    // Se rompe como estaba: sin marcar la toma, así que el montaje la dejaba fija.
    // Anclado con el `guardar` que le sigue: la misma línea existe también en el
    // emparejador de gemelos, y sin ancla el sabotaje borraba AQUELLA y esta
    // invariante salía ciega.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace('pieza().tomas[k].movimiento = true;\n  await guardar();', 'await guardar();'),
      ),
  },

  {
    nombre: 'el-guion-tiene-oficio-y-cada-modo-su-limite',
    dice: 'Dos cosas a la vez, y las dos se rompen solas. Las reglas del guion eran todas negativas y con puras prohibiciones sale un noticiero: datos correctos, uno detrás de otro, y nadie llega al minuto tres — falta decirle QUÉ HACER. Y desde que hay dos clases de episodio, el límite de cada uno es distinto y no se pueden mezclar: en un documental inventar un detalle es mentir sobre personas reales, y en ficción declarada prohibirlo deja al guion sin la mitad de su oficio. Si el sistema del modo construir se colara en un proyecto documental, ese documental empezaría a inventar sin que nadie lo pidiera.',
    comprobar(ctx) {
      const { sistemaDelGuion } = ctx.fn;
      const fallos = [];
      const construir = sistemaDelGuion('construir');
      const documentar = sistemaDelGuion('documentar');

      // 1 · EL OFICIO, en los dos. Es lo que de verdad separa un documental de un
      // noticiero, punto por punto, y no depende de si el caso es real.
      for (const [qué, re] of [
        ['contar con detalles concretos en vez de resúmenes', /LO CONCRETO|detalle/i],
        ['retener el significado y responder después', /ADMINISTRA LO QUE SABES|todav[ií]a no ha dicho/i],
        ['cerrar cada bloque abriendo el siguiente', /NO CIERRES LA ESCENA RESUMIENDO|empuj/i],
        ['variar la medida de las frases', /Frase larga, frase larga, frase corta|RITMO/],
        ['usar las palabras literales de las fuentes', /literal|palabras de los dem[aá]s/i],
        ['anclar cada acto en alguien concreto', /PERSONAS, NO EXPEDIENTES/],
        ['no contar dos veces el mismo hecho', /UNA VEZ EN TODO EL DOCUMENTAL/],
      ]) {
        for (const [modo, texto] of [['construir', construir], ['documentar', documentar]]) {
          if (!re.test(texto)) fallos.push(`En modo ${modo} no se le pide ${qué}.`);
        }
      }
      // Y los adjetivos de opinión, que son lo que convierte un documental en un
      // canal de contenido: decir que algo es escalofriante es garantizar que no lo sea.
      for (const [modo, texto] of [['construir', construir], ['documentar', documentar]]) {
        if (!/escalofriante/i.test(texto) || !/impactante/i.test(texto)) {
          fallos.push(`En modo ${modo} no se prohíben los adjetivos de opinión.`);
        }
        // El formato del texto plano es lo que la segmentación entiende. Sin esto
        // el guion sale sin escenas y todo el episodio es una sola.
        if (!/"## "/.test(texto)) fallos.push(`En modo ${modo} no se pide marcar las escenas con «## ».`);
        if (!/"> "/.test(texto)) fallos.push(`En modo ${modo} no se explica la línea de testimonio «> ».`);
      }

      // 2 · EL RIGOR, solo en documentar y ENTERO. Si aflojar el tono aflojó las
      // fuentes, esto no vale nada.
      for (const [qué, re] of [
        ['que cada afirmación salga de una ficha', /sale de una ficha/i],
        ['que no se inventen datos', /No inventes datos/i],
        ['que se atribuya según el tipo de fuente', /\[judicial\]|\[testimonio\]/],
        ['que la tensión no salga de insinuar lo que no consta', /nunca de sugerir lo que no consta|no consta/i],
      ]) {
        if (!re.test(documentar)) fallos.push(`El modo documentar perdió el rigor: ${qué}.`);
      }

      // 3 · Y ESE RIGOR NO PUEDE ESTAR EN CONSTRUIR, ni al revés. Son dos límites
      // incompatibles: con los dos puestos, el guion recibe «inventa el detalle» y
      // «no inventes datos» en el mismo sistema y hace lo que le parece.
      if (/No inventes datos/i.test(construir)) {
        fallos.push('El modo construir arrastra la prohibición de inventar: la licencia y su contraria a la vez.');
      }
      if (/el detalle\s+concreto que la escena necesite lo pones t[uú]/i.test(documentar)) {
        fallos.push(
          'El modo documentar trae la licencia de inventar detalle: un documental sobre personas reales ' +
            'se pondría a inventar la hora y la marca de las botas.',
        );
      }

      // 4 · LA LICENCIA VIENE CON SU LÍMITE. Sin la coherencia, «invéntate el
      // detalle» es exactamente el fallo que este modo existe para evitar.
      for (const [qué, re] of [
        ['que el caso es ficción declarada', /ficci[oó]n, declarada|obra de ficci[oó]n/i],
        ['que el límite es la coherencia', /El l[ií]mite es la coherencia/],
        ['que un nombre o una fecha no cambian', /se escriben una vez y no cambian/],
        ['el gancho en segunda persona del primer acto', /EL GANCHO/],
        ['los testimonios con su convención', /LOS TESTIMONIOS/],
        ['el cierre con una duda concreta sin contestar', /EL CIERRE/],
      ]) {
        if (!re.test(construir)) fallos.push(`El modo construir no dice ${qué}.`);
      }
      return fallos;
    },
    // Se rompe como estaba: un solo sistema, sin el bloque que pone el límite de
    // cada modo. Va por el contexto porque la comprobación EJECUTA
    // `sistemaDelGuion`, y editar la fuente no la alcanzaría.
    romper: (ctx) => conFuncion(ctx, 'sistemaDelGuion', () => ctx.fn.sistemaDelGuion('construir')),
  },

  {
    nombre: 'la-imagen-se-queda-cuando-la-voz-calla',
    dice: 'Cada toma duraba EXACTAMENTE lo que su locución, al fotograma. La última sílaba caía y venía el corte, ciento treinta y cuatro veces seguidas. No había suspense en ninguna parte porque no había SITIO donde ponerlo: al director se le pedía «silencio después del dato duro» y no existía ningún campo donde escribir esa decisión.',
    comprobar(ctx) {
      const { construirHoja, guionFfmpeg, repartirRespiros, RESPIROS, segundosDeClip, duracionMasCercana, sanear } = ctx.fn;
      const fallos = [];
      const plano = { encuadre: 'plano medio', movimientoCamara: 'fijo', lugar: 'x', luz: 'y', sujetos: [], descripcion: 'd' };
      const fps = 30;

      // 1 · La toma dura la locución MÁS el respiro, y el silencio queda dentro.
      const tomas = [
        { i: 0, escena: 0, segundos: 6, medida: true, plano, entrada: 2, respiro: 0 },
        { i: 1, escena: 0, segundos: 6, medida: true, plano, respiro: 2.5, audio: 'ok', corteExacto: true },
        { i: 2, escena: 0, segundos: 6, medida: true, plano, respiro: 0 },
        // El corte de esta vino FORZADO —sin silencio cerca—: puede partir una
        // palabra, y plantarle un respiro encima es una pausa dramática dentro
        // de una palabra. Sin corte fiable, no hay respiro.
        { i: 3, escena: 0, segundos: 6, medida: true, plano, respiro: 4, audio: 'ok', corteExacto: false, corteForzado: true },
        // Y esta vino estimada pero ANCLADA a un silencio real: alargar una
        // pausa de verdad suena natural, y su respiro se conserva.
        { i: 4, escena: 0, segundos: 6, medida: true, plano, respiro: 2.5, audio: 'ok', corteExacto: false, corteForzado: false },
      ];
      const hoja = construirHoja({ pieza: 'p01', tomas, escenas: [{ n: 0 }], config: { fps } });
      const [a, b, c, d, e] = hoja.tomas;

      if (Math.abs(a.duracion - 8) > 1 / fps) fallos.push(`La toma de apertura dura ${a.duracion}, y con su entrada debía durar 8.`);
      if (Math.abs(b.duracion - 8.5) > 1 / fps) fallos.push(`La toma con respiro dura ${b.duracion}, y debía durar 8,5.`);
      if (Math.abs(c.duracion - 6) > 1 / fps) fallos.push(`Una toma sin respiro dura ${c.duracion} en vez de 6: se está alargando todo.`);
      if (Math.abs(d.duracion - 6) > 1 / fps) {
        fallos.push('El respiro se apoya en un corte FORZADO: el silencio caería a mitad de una palabra.');
      }
      if (Math.abs(e.duracion - 8.5) > 1 / fps) {
        fallos.push('Un corte anclado a silencio real pierde su respiro: la pieza queda plana sin motivo.');
      }
      // Y el reloj sigue siendo la suma: si el respiro no entrara en `inicio`, la
      // voz de la toma siguiente se adelantaría y volvería el desfase de siempre.
      if (Math.abs(b.inicio - a.duracion) > 1e-6) fallos.push('El respiro no entra en el reloj: la toma siguiente empezaría antes de tiempo.');
      if (Math.abs(c.inicio - (a.duracion + b.duracion)) > 1e-6) fallos.push('El reloj se desfasa después de un respiro.');

      // 2 · El guion de montaje tiene que EJECUTARLO: la voz rellena con silencio
      // hasta la duración de la toma, y la apertura retrasa la voz.
      const guion = guionFfmpeg(hoja);
      if (!/adelay=2000/.test(guion)) {
        fallos.push('La apertura en frío no retrasa la voz: la primera palabra entraría con el primer fotograma.');
      }
      if (!new RegExp(`-t ${b.duracion.toFixed(4)}`).test(guion)) {
        fallos.push('La voz no se rellena hasta la duración con respiro: el silencio no llegaría a existir.');
      }
      if (!/apad/.test(guion)) fallos.push('Sin relleno de silencio, el trozo de voz sale más corto que su hueco.');
      // La música tiene que VOLVER en el silencio, que es de lo que se trata. Con
      // un release largo el lecho no sube a tiempo y el respiro suena a nada.
      const rel = /release=(\d+)/.exec(guion);
      if (!/sidechaincompress/.test(guion)) fallos.push('La música no cede por compresión lateral: no podría volver sola al callar la voz.');
      else if (!rel || Number(rel[1]) > 600) {
        fallos.push(`La música tarda ${rel ? rel[1] : '?'} ms en volver: en un respiro de 1,5 s no da tiempo a oírla.`);
      }

      // 3 · El presupuesto. Ni ninguno ni todos: el error contrario es el mismo error.
      // Veinte tomas de 10 s son 200 s hablados; el tope es un décimo, o sea 20 s.
      // El director pide 8 largos SEGUIDOS y 12 cortos: mucho más de lo que cabe, y
      // encima amontonado, que son los dos fallos que hay que atajar.
      const muchas = Array.from({ length: 20 }, (_, n) => ({ i: n, segundos: 10, plano }));
      const planos = new Map(
        muchas.map((t) => [t.i, { i: t.i, respiro: t.i < 8 ? 'largo' : 'corto' }]),
      );
      const rep = repartirRespiros(muchas, planos, { montaje: { respiroMaximo: 0.1 } });
      const gastado = [...rep.values()].reduce((s, x) => s + x, 0);
      if (gastado > 200 * 0.1 + 1e-6) fallos.push(`Se reparten ${gastado} s de silencio sobre un tope de 20: la pieza se arrastraría.`);
      if (gastado <= 0) fallos.push('No se reparte ni un respiro habiendo presupuesto: se queda como estaba.');
      // Al no caber todo se caen los CORTOS, no los largos: los largos son los
      // deliberados —el final de acto, el segundo antes del giro—.
      const largos = [...rep.values()].filter((x) => x >= RESPIROS.largo).length;
      if (!largos) fallos.push('Al recortar se han perdido todos los respiros largos, que son los que llevan el peso.');
      // Dos largos pegados paran la pieza.
      for (const [k, v] of rep) {
        if (v >= RESPIROS.largo && (rep.get(k - 1) || 0) >= RESPIROS.largo) {
          fallos.push(`Las tomas ${k - 1} y ${k} llevan respiro largo seguidas: eso no es ritmo, es que se paró.`);
          break;
        }
      }

      // 4 · El clip tiene que cubrir su propio silencio, o el montaje lo tapa
      // congelando el último fotograma justo donde se está mirando.
      const conRespiro = { i: 0, segundos: 6, respiro: 2.5, entrada: 0 };
      if (segundosDeClip(conRespiro) !== 8.5) fallos.push(`Se pediría un clip de ${segundosDeClip(conRespiro)} s para 8,5 s de toma.`);
      if (duracionMasCercana(segundosDeClip(conRespiro)) < 8) {
        fallos.push('El clip se pide más corto que la toma: se congelaría dentro del respiro.');
      }

      // 5 · Y sobrevive a guardar y cargar. Es la avería que ya costó un proyecto
      // entero: `sanear` devuelve lista blanca y lo que no esté se borra.
      const vuelta = sanear({ piezas: [{ id: 'p01', tomas: [{ i: 0, respiro: 2.5, entrada: 2 }] }] });
      const t0 = vuelta.piezas[0].tomas[0];
      if (t0.respiro !== 2.5) fallos.push('El respiro no sobrevive a recargar: el ritmo se pierde al volver.');
      if (t0.entrada !== 2) fallos.push('La apertura en frío no sobrevive a recargar.');
      return fallos;
    },
    // Se rompe como estaba: la toma dura lo que dura la voz y nada más.
    romper: (ctx) =>
      conFuncion(ctx, 'construirHoja', ({ tomas, ...resto }) =>
        ctx.fn.construirHoja({
          ...resto,
          tomas: (tomas || []).map((t) => ({ ...t, respiro: 0, entrada: 0 })),
        }),
      ),
  },

  {
    nombre: 'un-corte-por-tiempo-parte-el-lote-en-dos',
    dice: 'Un lote de dieciocho fichas con un modelo que razona no cabe siempre en el minuto de la plataforma: HTTP 504, lote tras lote, y la dirección nunca terminaba. Reintentar el MISMO lote igual de grande son otros sesenta segundos contra el mismo muro. La respuesta correcta ya existía para la respuesta incompleta —partir en dos— y el corte por tiempo no la usaba.',
    comprobar(ctx) {
      const dir = fuente(ctx, 'app/fases/direccion.js');
      const api = fuente(ctx, 'app/api.js');
      const fallos = [];

      // 1 · La dirección parte el lote al recibir un corte por tiempo.
      if (!/cortePorTiempo/.test(dir)) {
        fallos.push('La dirección no distingue un corte por tiempo: el 504 la tumba entera.');
      }
      const i = dir.indexOf('const completar');
      const cuerpo = i < 0 ? '' : dir.slice(i, i + 1200);
      if (!/catch \(e\)/.test(cuerpo) || !/cortePorTiempo\(e\)/.test(cuerpo)) {
        fallos.push('El corte por tiempo no se atrapa donde se puede partir el lote.');
      }
      if (!/grupo\.slice\(0, mitad\)/.test(cuerpo)) {
        fallos.push('Atrapado el corte, no se parte el lote: se reintentaría igual de grande.');
      }

      // 2 · El presupuesto de pensar es proporcional al lote. Con 32768 fijos, un
      // lote de cuatro fichas tenía licencia para pensar el minuto entero.
      if (!/4000 \+ 1600 \* grupo\.length/.test(dir)) {
        fallos.push('El presupuesto de salida no acompaña al tamaño del lote: partir no acorta nada.');
      }

      // 3 · Y la puerta devuelve el corte YA cuando la llamada no escribe nada:
      // sin esto, cada mitad esperaría tres muros de sesenta segundos antes de
      // llegar a partirse. (Que de verdad corta en seco lo ejecuta api-humo.)
      if (!/CORTES_POR_TIEMPO\.has\(r\.status\)/.test(api)) {
        fallos.push('La puerta reintenta el corte por tiempo aunque no haya nada que recuperar.');
      }
      // Y el consejo del mensaje depende de QUÉ se estaba generando: recomendar
      // otro generador de imagen cuando el que se pasó fue el director manda a
      // mirar el sitio equivocado.
      if (!/modo === 'texto'/.test(api)) {
        fallos.push('El mensaje del corte aconseja lo mismo para el director que para la imagen.');
      }
      return fallos;
    },
    // Se rompe como estaba: el corte por tiempo tumba la dirección sin partir.
    romper: (ctx) =>
      editando(ctx, 'app/fases/direccion.js', (t) =>
        t.replace('if (!cortePorTiempo(e) || particiones >= 3 || grupo.length <= 2) throw e;', 'throw e;'),
      ),
  },

  {
    nombre: 'un-fallo-a-mitad-no-tira-los-actos-ni-los-lotes-ya-pagados',
    dice: 'El guion se escribía acto a acto y la dirección lote a lote, pero TODO vivía en memoria hasta el final: si el acto tres fallaba, los dos ya pagados se tiraban; si el sexto lote fallaba, los cinco pagados también. La voz y las imágenes ya cumplían la regla de §4 —cada unidad terminada se escribe antes de pasar a la siguiente— y las dos fases de texto no.',
    comprobar(ctx) {
      const gui = fuente(ctx, 'app/fases/guion.js');
      const dir = fuente(ctx, 'app/fases/direccion.js');
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      // 1 · El guion recoge lo escrito y avisa de cada acto nuevo.
      if (!/yaEscritos/.test(gui)) fallos.push('El guion no puede recibir los actos ya escritos: reanudar reescribe.');
      if (!/n < yaEscritos\.length/.test(gui)) {
        fallos.push('Los actos ya escritos no se saltan: se volverían a pagar.');
      }
      if (!/await alActo\(/.test(gui)) {
        fallos.push('Un acto terminado no se entrega al llegar: un fallo después lo tira.');
      }

      // 2 · La dirección entrega cada lote, y entrega un estado COHERENTE (el
      // resuelto), no las fichas a medias.
      if (!/await alLote\(resolver\(/.test(dir)) {
        fallos.push('La dirección no entrega el lote al terminarlo, o entrega fichas sin resolver.');
      }
      if (!/return resolver\(tomas, planos, config\);/.test(dir)) {
        fallos.push('El final de dirigir no sale del mismo resolutor que los parciales: reanudar daría otra cosa.');
      }

      // 3 · Y la pantalla GUARDA en los cuatro sitios. Recibir sin guardar es lo
      // mismo que no recibir.
      const vecesGuion = (main.match(/alActo: async \(parte, n\) => \{/g) || []).length;
      if (vecesGuion < 2) fallos.push(`Solo ${vecesGuion} de las 2 escrituras de guion guardan cada acto.`);
      const vecesLote = (main.match(/alLote: async \(parciales\) => \{/g) || []).length;
      if (vecesLote < 2) fallos.push(`Solo ${vecesLote} de las 2 direcciones guardan cada lote.`);
      // El parcial de guion caduca con la estructura: reanudar sobre actos de otra
      // estructura pegaría dos documentales distintos.
      if (!/parcial\?\.huella === huella/.test(main)) {
        fallos.push('El guion parcial se reanudaría aunque la estructura hubiera cambiado.');
      }

      // 4 · La huella distingue estructuras de verdad (comportamiento, no texto).
      const { huellaDeActos } = ctx.fn;
      const tr = { estructura: [{ acto: 1, titulo: 'Uno', funcion: 'f', contenido: '', minutos: 4 }, { acto: 2, titulo: 'Dos', funcion: 'f', contenido: '', minutos: 6 }] };
      const otra = { estructura: [{ acto: 1, titulo: 'Otro arranque', funcion: 'f', contenido: '', minutos: 4 }, { acto: 2, titulo: 'Dos', funcion: 'f', contenido: '', minutos: 6 }] };
      if (huellaDeActos(tr, 10) !== huellaDeActos(tr, 10)) fallos.push('La huella de actos no es estable.');
      if (huellaDeActos(tr, 10) === huellaDeActos(otra, 10)) {
        fallos.push('Dos estructuras distintas dan la misma huella: se pegarían dos documentales.');
      }
      if (huellaDeActos(tr, 10) === huellaDeActos(tr, 14)) {
        fallos.push('Cambiar los minutos no cambia la huella, y los actos se reescalan con ellos.');
      }
      return fallos;
    },
    // Se rompe como estaba: el acto terminado no se entrega a nadie.
    romper: (ctx) =>
      editando(ctx, 'app/fases/guion.js', (t) =>
        t.replace('if (alActo) await alActo(partes[partes.length - 1], n, actos.length);', ''),
      ),
  },

  {
    nombre: 'los-planos-gemelos-comparten-material-dentro-del-caso',
    dice: '«La toma 18 y la 50 usan la misma imagen; el video de la 50 se generó, pero la 18 no lo agarró automático.» El emparejamiento por plano existía ENTRE casos (el banco) y no dentro del mismo caso: dos tomas gemelas del mismo documental pagaban cada una lo suyo sin enterarse de que su material ya existía.',
    comprobar(ctx) {
      const { emparejarDentroDelCaso } = ctx.fn;
      const fallos = [];
      const plano = { lugar: 'la comisaría', encuadre: 'plano general', luz: 'noche', descripcion: 'd', sujetos: [] };
      const otra = { ...plano, luz: 'día' };

      // Mismo sitio, otra escena: el cuarto del hospital con el paciente ya
      // mejorado. La huella suelta (lugar+encuadre+luz) sería idéntica, y AHÍ VAN
      // DOS IMÁGENES: el emparejado automático solo puede actuar cuando la ficha
      // entera es idéntica, descripción y sujetos incluidos.
      const mismoSitioOtraEscena = { ...plano, descripcion: 'el paciente ya mejoró, la cama recogida' };

      const tomas = [
        { i: 18, plano, reusa: null, movimiento: false, imagen: 'ok', video: null },
        { i: 30, plano: otra, reusa: null, movimiento: false, imagen: null, video: null },
        { i: 44, plano, reusa: null, movimiento: false, imagen: null, video: null },
        { i: 50, plano, reusa: null, movimiento: true, imagen: 'ok', video: 'ok' },
        { i: 60, plano: mismoSitioOtraEscena, reusa: null, movimiento: false, imagen: null, video: null },
      ];
      const cambios = emparejarDentroDelCaso('p01', tomas);

      // 0 · El caso del paciente: mismo lugar, misma luz, OTRA descripción. Si se
      // emparejara, el documental enseñaría al paciente grave donde el guion dice
      // que mejoró — con la imagen «ahorrada» costando la credibilidad entera.
      if (cambios.some((c) => c.i === 60)) {
        fallos.push('Se emparejó el mismo sitio con OTRA escena: el paciente mejorado saldría grave.');
      }

      // 1 · La 18 agarra el clip de la 50, automática.
      const c18 = cambios.find((c) => c.i === 18);
      if (!c18 || c18.heredadoVid !== 'p01/t050/vid' || c18.movimiento !== true) {
        fallos.push('La toma 18 no agarra el clip de su gemela 50: se pagaría otro clip del mismo plano.');
      }
      // 2 · La 44, sin imagen, agarra la imagen del plano gemelo.
      const c44 = cambios.find((c) => c.i === 44 && c.heredado);
      if (!c44 || !/img$/.test(c44.heredado)) {
        fallos.push('Una toma sin imagen no agarra la de su gemela: la pagaría otra vez.');
      }
      // 3 · Y NADIE agarra lo que no es gemelo: la luz distinta es OTRO plano.
      if (cambios.some((c) => c.i === 30)) {
        fallos.push('Se emparejó un plano con la luz distinta: la misma fachada de noche y de día es otro plano.');
      }
      // 4 · El que ya tiene material propio no se toca.
      if (cambios.some((c) => c.i === 50)) fallos.push('Se tocó a la dueña del material.');

      // 5 · Y la pantalla lo aplica en los tres momentos en que aparece material.
      const main = ctx.fuentes.get('app/main.js') || '';
      const veces = (main.match(/await emparejarGemelos\(/g) || []).length;
      if (veces < 3) {
        fallos.push(`El emparejador se aplica en ${veces} sitios y son 3: tras los clips, tras convertir y al revisar.`);
      }

      // 6 · Y las gemelas que la huella NO caza —dos fichas con palabras
      // distintas y casi la misma imagen— se emparejan A MANO desde la galería:
      // los ojos de quien mira son el detector, la herramienta pone el botón.
      const m = main.indexOf('async function emparejarAMano');
      if (m < 0) return [...fallos, 'No hay forma de emparejar a mano dos tomas que la huella no caza.'];
      const cuerpoMano = main.slice(m, m + 2600);
      if (!/Gemela de…/.test(main) || !/emparejarAMano\(x\.i/.test(main)) {
        fallos.push('El emparejado a mano existe y la galería no lo ofrece.');
      }
      if (!/claveFotograma\(P\.id, dueña, tomas\)/.test(cuerpoMano) || !/claveClip\(P\.id, dueña, tomas\)/.test(cuerpoMano)) {
        fallos.push('El emparejado a mano no resuelve las claves por la cadena: apuntaría a archivos que no existen.');
      }
      if (!/no tiene material que prestar/.test(cuerpoMano)) {
        fallos.push('Se puede emparejar con una toma sin material: quedaría apuntando al vacío.');
      }
      if (!/Mejor al revés/.test(cuerpoMano)) {
        fallos.push('Emparejar al revés tiraría un clip pagado sin avisar.');
      }
      return fallos;
    },
    // Se rompe como estaba: nadie empareja nada.
    romper: (ctx) => conFuncion(ctx, 'emparejarDentroDelCaso', () => []),
  },

  {
    nombre: 'el-clip-es-una-propuesta-y-la-musica-generada-suena',
    dice: 'Dos averías de la misma hoja. Una: `movimiento: true` es una PROPUESTA del director, pero la hoja exigía el clip en cuanto la toma lo llevara marcado — sin generarlo salía «sin imagen» con la imagen YA PAGADA al lado; gastar en video lo decide quien paga. Y dos: `escena.musica` guarda el ESTADO («ok») y la hoja lo leía como CLAVE de archivo: pedía bajar un archivo llamado «ok» y el lecho salía mudo, en la previa y en el montaje, con la música generada y cobrada.',
    comprobar(ctx) {
      const { construirHoja } = ctx.fn;
      const fallos = [];
      const plano = { encuadre: 'plano general', movimientoCamara: 'paneo derecha', lugar: 'x', luz: 'y', sujetos: [], descripcion: 'd' };
      const base = { escena: 0, segundos: 6, medida: true, plano, audio: 'ok', imagen: 'ok' };

      const hoja = construirHoja({
        pieza: 'p01',
        tomas: [
          { ...base, i: 0, movimiento: true, video: 'ok' },
          { ...base, i: 1, movimiento: true, video: null },
          { ...base, i: 2, movimiento: true, heredadoVid: 'p09/t004/vid' },
        ],
        escenas: [{ n: 0, musica: 'ok' }],
      });
      const [pagado, propuesto, heredado] = hoja.tomas;

      // 1 · Clip pagado: se usa. Clip solo propuesto: la imagen, con su cámara.
      if (pagado.archivo !== 'p01/t000/vid') fallos.push(`El clip pagado no se usa: sale ${pagado.archivo}.`);
      if (propuesto.archivo !== 'p01/t001/img') {
        fallos.push(`Un clip solo propuesto exige ${propuesto.archivo}: la previa dice «sin imagen» con la imagen pagada al lado.`);
      }
      if (propuesto.movimiento !== false || !propuesto.camara) {
        fallos.push('La toma sin clip no baja a imagen con recorrido de cámara: saldría congelada o rompería el montaje.');
      }
      if (heredado.archivo !== 'p09/t004/vid') fallos.push('Un clip heredado de otra pieza dejó de usarse.');

      // 2 · El estado «ok» de la música no es una clave de archivo.
      const [esc] = hoja.escenas;
      if (esc.musica !== 'p01/mus/000') {
        fallos.push(`La música de la escena apunta a «${esc.musica}»: el lecho sale mudo con la música pagada.`);
      }
      const apagada = construirHoja({
        pieza: 'p01',
        tomas: [{ ...base, i: 0 }],
        escenas: [{ n: 0, musica: null }],
      });
      if (apagada.escenas[0].musica !== null) fallos.push('Apagar la música de una escena a propósito dejó de funcionar.');
      const conClave = construirHoja({
        pieza: 'p01',
        tomas: [{ ...base, i: 0 }],
        escenas: [{ n: 0, musica: 'p07/mus/002' }],
      });
      if (conClave.escenas[0].musica !== 'p07/mus/002') {
        fallos.push('Una música heredada de otra pieza, con su clave, dejó de respetarse.');
      }
      return fallos;
    },
    // Se rompe como estaba: todo clip marcado se exige aunque nadie lo pagara.
    romper: (ctx) =>
      conFuncion(ctx, 'construirHoja', ({ tomas, ...resto }) =>
        ctx.fn.construirHoja({
          ...resto,
          tomas: (tomas || []).map((t) => (t.movimiento ? { ...t, video: 'ok' } : t)),
        }),
      ),
  },
];
