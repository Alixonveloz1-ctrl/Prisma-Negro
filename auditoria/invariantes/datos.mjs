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

  {
    nombre: 'cada-persona-del-elenco-se-rueda-en-su-sitio',
    dice: '«¿Me vas a poner los testigos siempre en el mismo cuarto? ¿El policía siempre en el mismo escenario? La intención de tener varias versiones es que VARÍE.» Tener cinco peritos no sirve de nada si los cinco declaran en el mismo laboratorio, con el mismo encuadre y la misma luz: lo que se ve entonces no es un canal con reparto, es un decorado con cinco caras. Y no era un problema de redacción sino de estructura —el sitio vivía en el papel y solo la persona en la variante—, así que ninguna descripción lo habría arreglado.',
    comprobar(ctx) {
      const { ELENCO, planoDeVariante, SITIOS_MINIMOS } = ctx.fn;
      const fallos = [];

      for (const a of ELENCO || []) {
        const v = a?.variantes || [];
        if (v.length < 2) continue;
        const planos = v.map((x) => planoDeVariante(a, x)).filter(Boolean);
        if (planos.length !== v.length) {
          fallos.push(`El papel «${a?.id}» no compone el plano de todas sus personas.`);
          continue;
        }

        // 1 · SITIOS DISTINTOS DE VERDAD. No basta con que cambie la cara: tiene
        // que cambiar dónde está y cómo se rueda.
        const sitios = planos.map((p) => `${p.lugar} · ${p.encuadre}`);
        const distintos = new Set(sitios).size;
        const pedidos = Math.min(v.length, SITIOS_MINIMOS);
        if (distintos < pedidos) {
          fallos.push(
            `Las ${v.length} personas de «${a?.id}» se ruedan en ${distintos} sitio(s) y hacen falta ` +
              `${pedidos}: cambia la cara y no cambia el cuarto, que es lo que se ve.`,
          );
        }

        // 2 · Y NINGÚN SITIO CARGA CON MEDIO PAPEL. Con veinte testigos y tres
        // cocinas, la cuenta de arriba pasaría y seguirían siendo siete vecinos
        // por cocina.
        const cuantasPorSitio = new Map();
        for (const s of sitios) cuantasPorSitio.set(s, (cuantasPorSitio.get(s) || 0) + 1);
        const tope = Math.max(2, Math.ceil(v.length / SITIOS_MINIMOS));
        for (const [s, n] of cuantasPorSitio) {
          if (n > tope) {
            fallos.push(`En «${a?.id}», ${n} personas comparten «${s}» y el tope es ${tope}: es el mismo plano repetido.`);
            break;
          }
        }

        // 3 · Y LA DESCRIPCIÓN FINAL DE CADA UNA ES SUYA. Dos personas en el mismo
        // sitio siguen valiendo si se ruedan distinto; dos descripciones idénticas,
        // no: son la misma imagen pedida dos veces.
        if (new Set(planos.map((p) => p.descripcion)).size !== planos.length) {
          fallos.push(`El papel «${a?.id}» pide dos veces la misma imagen: dos de sus personas tienen la misma descripción.`);
        }
      }
      return fallos;
    },
    // Se rompe COMO ESTABA, con la función tal cual era: el sitio del papel para
    // todo el mundo y la persona pegada delante.
    romper: (ctx) =>
      conFuncion(ctx, 'planoDeVariante', (a, v) =>
        !a || !v
          ? null
          : {
              encuadre: a.plano.encuadre,
              movimientoCamara: 'fijo',
              lugar: a.plano.lugar,
              luz: a.plano.luz,
              sujetos: [`${a.nombre} — ${v.persona}`],
              descripcion: `${v.persona}. ${a.plano.descripcion}`,
            },
      ),
  },

  {
    nombre: 'las-versiones-de-un-recurso-son-tres-planos-y-no-tres-tiempos',
    dice: '«Ahí no se nota que varía: se ve como si la persona hubiese tomado una foto desde arriba y otra desde abajo, y ya. Debería ser otra carretera, otro ángulo.» Las tres versiones de la carretera eran la misma foto exacta con llovizna, con niebla y de madrugada. Un recurso vuelve en TODOS los episodios, así que es el que más canta: tres versiones que no se distinguen puestas una al lado de la otra son una sola versión pagada tres veces. Sigue siendo el mismo sitio —eso mantiene la unidad del canal— pero otro tramo, otro ángulo y otra altura de cámara.',
    comprobar(ctx) {
      const { RECURSOS, planoDeRecurso, VERSIONES_MINIMAS } = ctx.fn;
      const fallos = [];

      for (const r of RECURSOS || []) {
        const v = r?.variantes || [];
        if (v.length < 2) continue;
        const planos = v.map((x) => planoDeRecurso(r, x)).filter(Boolean);

        // El encuadre o el sitio tienen que cambiar. Cambiar solo el tiempo es lo
        // que se veía igual.
        const marcos = planos.map((p) => `${p.lugar} · ${p.encuadre}`);
        const distintos = new Set(marcos).size;
        const pedidos = Math.min(v.length, VERSIONES_MINIMAS);
        if (distintos < pedidos) {
          fallos.push(
            `Las ${v.length} versiones de «${r?.id}» son ${distintos} plano(s): mismo sitio, mismo encuadre ` +
              'y solo cambia el tiempo. Puestas una al lado de la otra no se distinguen.',
          );
        }
        // Y la descripción de cada una tiene que ser suya, no la del recurso con
        // una coletilla.
        if (new Set(planos.map((p) => p.descripcion)).size !== planos.length) {
          fallos.push(`El recurso «${r?.id}» pide dos veces la misma imagen.`);
        }
      }
      return fallos;
    },
    // Se rompe COMO ESTABA: el plano del recurso para las tres versiones y el
    // matiz pegado al final.
    romper: (ctx) =>
      conFuncion(ctx, 'planoDeRecurso', (r, v) =>
        !r || !v
          ? null
          : {
              encuadre: r.encuadre,
              movimientoCamara: 'fijo',
              lugar: r.lugar,
              luz: r.luz,
              sujetos: [],
              descripcion: `${r.descripcion} ${v.matiz}.`,
            },
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
    nombre: 'el-encabezado-y-el-testimonio-parten-la-toma',
    dice: 'Las dos fronteras duras del texto plano son el encabezado «## » y la línea «> », y las dos existen porque su texto NO SE NARRA: una toma que cruzara cualquiera de ellas leería en voz alta «El hallazgo» o «Marcos Elizalde, capataz de la cuadrilla» como si fueran frases del guion. La línea «> » además marca las tomas que la siguen —un testimonio de tres frases sale en dos tomas y las dos son del mismo testigo— y deja de valer en la línea en blanco: lo de después lo dice otra vez el narrador.',
    comprobar(ctx) {
      const { segmentar, verificarCobertura } = ctx.fn;
      const fallos = [];

      // 1 · El salto de línea suelto no parte nada.
      const seguido = segmentar('Una frase que sigue\nen la línea de abajo, sin línea en blanco.');
      if (seguido.tomas.length !== 1) {
        fallos.push(`Un salto de línea suelto parte la toma en ${seguido.tomas.length}: partiría cualquier frase larga.`);
      }

      // 2 · El encabezado parte, aunque las dos escenas juntas cupieran de sobra en
      // una sola toma. Si no partiera, el título iría dentro del texto narrado.
      const escenas = segmentar('## El hallazgo\n\nFrase corta una.\n\n## La excavación\n\nFrase corta dos.');
      if (escenas.tomas.length !== 2) {
        fallos.push(
          `Dos escenas de una frase salen en ${escenas.tomas.length} toma(s): el encabezado dejó de ser frontera.`,
        );
      }
      if (escenas.tomas.some((t) => /##|El hallazgo|La excavación/.test(t.texto))) {
        fallos.push('El título de escena se narra: el documental leería en voz alta el encabezado.');
      }

      // 3 · El testimonio: la línea no se narra, y marca las tomas que la siguen.
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
    // Se rompe quitando las dos fronteras: las tomas seguidas de una misma escena se
    // funden aunque entre ellas haya un encabezado o una línea de testimonio, y la
    // marca de quién habla desaparece.
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
          if (previa) {
            previa.finEnGuion = t.finEnGuion;
            previa.texto = texto.slice(previa.inicioEnGuion, t.finEnGuion);
            continue;
          }
          tomas.push({ ...t, testimonio: '' });
        }
        return { ...r, tomas: tomas.map((t, i) => ({ ...t, i })) };
      }),
  },

  {
    nombre: 'ninguna-toma-baja-de-ocho-segundos-teniendo-guion',
    dice: 'La regla de los ocho a dieciocho segundos. Una toma es una imagen, y casi siempre también un clip: las dos se pagan POR UNIDAD, no por segundo, así que una toma de dos segundos cuesta lo mismo que una de dieciocho y aprovecha nueve veces menos. Salían a montones —la línea en blanco partía la toma, y un párrafo de una frase corta valía una imagen entera para verse dos segundos—, y un episodio de treinta minutos pedía doscientas tomas donde caben la mitad. Ahora el guion se parte primero en bloques y cada bloque se reparte en un número de tomas decidido ANTES de repartir: así no queda cola, que es de donde salían los dos segundos.',
    comprobar(ctx) {
      const { segmentar, verificarCobertura, tomasFueraDeRegla, SEGMENTACION } = ctx.fn;
      const fallos = [];

      // Un guion con lo que de verdad trae un guion: párrafos largos, párrafos de
      // una sola frase corta, un testimonio y dos escenas.
      const guion =
        '## El aviso\n\n' +
        'La llamada entró a las nueve y diez de la mañana. Una voz de hombre, tranquila, ' +
        'casi administrativa. Dijo que había encontrado algo en el terreno de atrás.\n\n' +
        'No dio su nombre.\n\n' +
        '> Marcos Elizalde, capataz de la cuadrilla\n' +
        'No toqué nada. Metí la mano en el hueco del roble y no había madera. Había tela. ' +
        'Eso fue todo lo que dije por teléfono, y colgué.\n\n' +
        '## La primera excavación\n\n' +
        'Los peritos llegaron al día siguiente, con una furgoneta blanca y dos palas. El ' +
        'terreno estaba blando por la lluvia de la semana anterior, y eso, dijeron después, ' +
        'fue lo que salvó las pruebas. Un suelo seco habría triturado el tejido.\n\n' +
        'A los cuarenta centímetros apareció el primer botón.\n\n' +
        'Era de nácar. Cosido con hilo azul.\n\n' +
        'El informe lo describe en dos líneas y no vuelve a mencionarlo en cuarenta páginas. ' +
        'Esa omisión es lo primero que llama la atención de cualquiera que lea el expediente ' +
        'hoy, porque el botón es la única pieza del caso que se puede fechar con exactitud. ' +
        'Los peritos lo sabían. La fecha estaba impresa en el reverso, como en toda la ' +
        'producción de aquella fábrica entre 1972 y 1978.\n\n' +
        'Nadie la anotó.';

      const r = segmentar(guion);
      const c = verificarCobertura(guion, r);
      if (!c.ok) fallos.push(`El reparto en tomas rompe la cobertura: ${c.detalle}`);

      // 1 · Ninguna toma se sale de la regla sin excusa. Las excusas son dos y están
      // en `tomasFueraDeRegla`: un bloque entero más corto que el suelo, y una frase
      // sola más larga que el techo. Nada más.
      for (const f of tomasFueraDeRegla(r)) {
        fallos.push(`La toma ${f.i} dura ${f.segundos}s: ${f.porque}.`);
      }

      // 2 · Y en concreto: los párrafos de una frase corta ya no son tomas sueltas.
      // «No dio su nombre» son 1,2 segundos y le cabe una imagen entera.
      const suelta = r.tomas.find((t) => t.texto.trim() === 'No dio su nombre.');
      if (suelta) {
        fallos.push('«No dio su nombre.» sale en su propia toma: una imagen pagada para verse 1,2 segundos.');
      }

      // 3 · El suelo manda sobre el techo, pero el techo sigue existiendo: un bloque
      // largo no puede salir en una sola toma eterna.
      const largas = r.tomas.filter((t) => t.segundos > SEGMENTACION.segundosMaximo);
      if (largas.length) {
        fallos.push(`${largas.length} toma(s) pasan del techo de ${SEGMENTACION.segundosMaximo}s en un guion que se puede repartir.`);
      }

      // 4 · Y el reparto AHORRA: menos tomas son menos imágenes y menos clips, que es
      // la razón entera de la regla. Este guion no puede pedir más de ocho.
      if (r.tomas.length > 8) {
        fallos.push(`Setenta y ocho segundos de guion salen en ${r.tomas.length} tomas: el reparto no está ahorrando nada.`);
      }
      return fallos;
    },
    // Se rompe volviendo a lo de antes: la línea en blanco parte la toma. Es
    // exactamente el código que producía las tomas de un segundo.
    //
    // VA POR EL CONTEXTO: la comprobación EJECUTA `segmentar`.
    romper: (ctx) =>
      conFuncion(ctx, 'segmentar', (guion, config) => {
        const r = ctx.fn.segmentar(guion, config);
        const texto = String(guion ?? '');
        const tomas = [];
        for (const t of r.tomas) {
          let desde = t.inicioEnGuion;
          const partes = [];
          const re = /\n[ \t]*\n/g;
          let m;
          while ((m = re.exec(t.texto)) !== null) {
            const corte = t.inicioEnGuion + m.index;
            partes.push([desde, corte]);
            desde = t.inicioEnGuion + m.index + m[0].length;
          }
          partes.push([desde, t.finEnGuion]);
          for (const [a, b] of partes) {
            const trozo = texto.slice(a, b);
            if (!trozo.trim()) continue;
            tomas.push({
              ...t,
              texto: trozo,
              inicioEnGuion: a,
              finEnGuion: b,
              segundos: Math.max(1.2, +(trozo.length / 14.5).toFixed(2)),
            });
          }
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
    nombre: 'una-ficha-construida-no-finge-tener-fuente',
    dice: 'Las fichas de un caso inventado no tienen fuente, y escribirlas con un hueco donde iba la fuente —«fuente:  [otra]»— es peor que no ponerlo: el guion lo lee como una atribución vacía y afirma por un expediente que no existe. Lo que sí llevan es su ROL, que es lo que le dice al guion qué papel juega cada pieza y en qué bloque toca sacarla.',
    comprobar(ctx) {
      const { comoLista, ordenarFichas } = ctx.fn;
      const fallos = [];
      const construidas = [
        { afirmacion: 'La ficha de latón número 4417.', rol: 'revelacion', fecha: '2022', cita: '', construida: true, orden: 2 },
        { afirmacion: 'Amparo Iriarte, 34 años, tejedora.', rol: 'victima', fecha: '1981', cita: 'no volvió', construida: true, orden: 0 },
      ];
      const escritas = comoLista(construidas);

      if (!/\(victima\)/.test(escritas) || !/\(revelacion\)/.test(escritas)) {
        fallos.push('Una ficha se escribe sin su rol: se pierde qué papel juega en el caso.');
      }
      if (/fuente:/.test(escritas) || /\[otra\]/.test(escritas)) {
        fallos.push('Una ficha construida se escribe con una fuente vacía: el guion la atribuiría a un expediente inventado.');
      }
      // Se leen EN EL ORDEN EN QUE SE LEVANTÓ EL CASO —víctima, lugar, fechas,
      // pista falsa, revelación—, que es el orden en que se va a contar.
      if (escritas.indexOf('Amparo') > escritas.indexOf('4417')) {
        fallos.push('Las fichas se reordenan: se pierde el orden en que se construyó el caso.');
      }
      if (ordenarFichas(construidas)[0]?.rol !== 'victima') {
        fallos.push('El orden del expediente no respeta cómo se levantó.');
      }
      if (/dijo:/.test(comoLista([{ afirmacion: 'a', rol: 'objeto', construida: true, orden: 0 }]))) {
        fallos.push('Se escribe una cita donde no la hay.');
      }
      return fallos;
    },
    // Se rompe como estaba cuando cada fase componía la lista a su manera: con el
    // formato de las documentadas, y la fuente vacía delante.
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
    nombre: 'todo-episodio-se-publica-declarado-como-ficcion',
    dice: 'TODOS los casos de este canal están inventados, y el episodio se ve EXACTAMENTE igual que un documental: el mismo tono, los mismos planos, los mismos testimonios, la misma voz sobria. Esa es la gracia del formato y es justo lo que lo hace indistinguible de uno real si nadie lo dice. Presentarlo como caso real es una mentira —da igual que la víctima no exista: lo que se falsea es la naturaleza de la pieza— y hunde el canal el día que alguien lo descubra. No puede depender de que el modelo se acuerde: la declaración se compone en el código y va LA PRIMERA. Y no hay pie de fuentes, porque no hay fuentes: un pie inventado insinúa un respaldo que no existe.',
    async comprobar(ctx) {
      const { esFiccion, componerPieDeFuentes, DECLARACION_DE_FICCION, textoDePublicacion, generarMetadatos } = ctx.fn;
      const fallos = [];

      // No hay dos clases de episodio. Ni siquiera unas fichas con pinta de
      // documentadas —que un proyecto viejo puede traer guardadas— convierten un
      // episodio en documental: ese modo no existe.
      const construidas = [{ afirmacion: 'a', rol: 'victima', construida: true, fuente: '' }];
      const conPintaDeReales = [{ afirmacion: 'b', fuente: 'Sentencia 44/1991', fecha: '1991', tipoFuente: 'judicial' }];

      if (!esFiccion(construidas)) fallos.push('Un expediente construido no se reconoce como ficción.');
      if (!esFiccion(conPintaDeReales)) {
        fallos.push('Unas fichas con fuente apagan la declaración: un episodio inventado saldría sin declarar.');
      }
      if (!esFiccion([])) fallos.push('Un episodio sin fichas no se declara ficción.');

      // La declaración tiene que decir las tres cosas que importan.
      for (const [qué, re] of [
        ['que es ficción', /ficci[oó]n/i],
        ['que el caso y las personas están inventados', /inventad/i],
        ['que las imágenes están generadas', /generad/i],
      ]) {
        if (!re.test(DECLARACION_DE_FICCION || '')) fallos.push(`La declaración no dice ${qué}.`);
      }

      // NUNCA hay pie de fuentes, ni siquiera con fichas que traen fuente guardada.
      if (componerPieDeFuentes(construidas) || componerPieDeFuentes(conPintaDeReales)) {
        fallos.push('Un episodio sale con pie de fuentes: insinúa un respaldo que no existe.');
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

      // ── Y AHORA DE VERDAD ──────────────────────────────────────────────────
      // Lo anterior mira las piezas. Esto genera los metadatos con la puerta
      // sustituida, devolviendo la descripción que escribe un modelo cuando lee un
      // guion que suena a documental: «un caso real que conmocionó a la comarca».
      // Es lo que sale si nadie lo corrige, y es exactamente lo que no puede
      // publicarse.
      const puerta = globalThis.fetch;
      let pedido = '';
      globalThis.fetch = async (url, opciones) => {
        pedido = String(JSON.parse(opciones.body).sistema || '');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            json: {
              titulos: ['El caso de la carretera'],
              descripcion: 'Un caso real que conmocionó a la comarca en 1991.',
              etiquetas: ['crimen'],
              tituloEscenas: [{ n: 0, titulo: 'La denuncia' }],
            },
          }),
        };
      };
      let m = null;
      try {
        m = await generarMetadatos({
          tema: 'x',
          guion: 'texto',
          tomas: [{ escena: 0, segundos: 10, medida: true }],
          escenas: [{ n: 0, titulo: 'La denuncia' }],
          fichas: conPintaDeReales,
        });
      } catch (e) {
        fallos.push(`Los metadatos no llegan a generarse: ${e.message}`);
      } finally {
        globalThis.fetch = puerta;
      }

      if (m) {
        if (!m.descripcion.startsWith('FICCIÓN DOCUMENTAL')) {
          fallos.push(
            'La descripción publicada no empieza por la declaración: ' +
              `empieza por «${m.descripcion.slice(0, 60)}…».`,
          );
        }
        if (/\bFuentes:/.test(m.descripcion)) {
          fallos.push('La descripción publicada lleva pie de fuentes de un caso que está inventado.');
        }
        // Y al modelo se le dice, en la misma llamada, que no lo cuente como real:
        // la declaración de arriba no sirve de nada si la sinopsis de debajo dice
        // «ocurrió en 1991».
        if (!/ficci[oó]n/i.test(pedido) || !/inventad/i.test(pedido)) {
          fallos.push('Al modelo no se le dice que el caso está inventado: la sinopsis lo contará como real.');
        }
      }
      return fallos;
    },
    // Se rompe como estaba cuando había dos clases de episodio: unas fichas con
    // fuente lo pasaban por documental, sin declarar nada.
    romper: (ctx) => conFuncion(ctx, 'esFiccion', (fichas) => !(fichas || []).some((f) => f.fuente)),
  },

  {
    nombre: 'las-etiquetas-son-del-genero-y-salen-con-almohadilla',
    dice: '«Esas etiquetas no sirven, porque son específicas del episodio. Tienen que ser genéricas de documentales de crimen, para que puedan realmente tener impacto. De nada me sirven etiquetas específicas cuando es un canal nuevo que nadie conoce y un episodio nuevo que nadie conoce.» Y es aritmética: «tetrápodo hueco» lo busca cero personas al mes, porque el episodio lo acaba de inventar esta herramienta. Encima salían sin almohadilla —«igual tengo que hacer trabajo manual poniéndole hashtag uno por uno»— y en una caja aparte de la descripción, que es donde van. Diez y diez: ninguna lista larga rinde más que su cabeza. Y ninguna puede decir que el caso sea real, porque el video declara que es ficción.',
    comprobar(ctx) {
      const fallos = [];
      const { hashtagsDe, ETIQUETAS_DEL_CANAL, HASHTAGS_MAXIMOS, textoDePublicacion } = ctx.fn;

      // 1 · DIEZ, Y DEL GÉNERO. Ni una del episodio: no las busca nadie.
      if (ETIQUETAS_DEL_CANAL.length !== 10) {
        fallos.push(`Las etiquetas del canal son ${ETIQUETAS_DEL_CANAL.length} y se pidieron diez.`);
      }
      if (HASHTAGS_MAXIMOS !== 10) {
        fallos.push(`Los hashtags son ${HASHTAGS_MAXIMOS} y se pidieron diez.`);
      }
      // Y el modelo ya no las escribe: si se le siguen pidiendo, vuelven las del
      // episodio por la puerta de atrás.
      const t = fuente(ctx, 'app/fases/metadatos.js');
      if (/required: \[[^\]]*'etiquetas'/.test(t)) {
        fallos.push('Al modelo se le siguen pidiendo etiquetas: leyendo el guion solo salen nombres del guion.');
      }

      // 2 · NINGUNA DICE QUE EL CASO SEA REAL. El video declara que es ficción.
      for (const e of ETIQUETAS_DEL_CANAL) {
        if (/\breal(es)?\b|hechos reales|caso real/i.test(e)) {
          fallos.push(`La etiqueta «${e}» dice que el caso es real, y el episodio declara que es ficción.`);
        }
      }

      // 3 · CON ALMOHADILLA, SIN ESPACIOS Y SIN TILDES, o no funcionan.
      const tags = hashtagsDe(ETIQUETAS_DEL_CANAL);
      if (tags.length !== ETIQUETAS_DEL_CANAL.length || tags.some((x) => !x.startsWith('#'))) {
        fallos.push(`Los hashtags no salen con almohadilla: ${tags.slice(0, 3).join(' ')}`);
      }
      if (tags.some((x) => /[áéíóúñ\s]/i.test(x))) {
        fallos.push(`Un hashtag lleva espacios o tildes y no funciona: ${tags.find((x) => /[áéíóúñ\s]/i.test(x))}`);
      }

      // 4 · Y VIENEN PUESTOS DONDE VAN. «No tengo por qué copiarlas y pegarlas
      //     individualmente»: los hashtags viven DENTRO de la descripción, así que
      //     pegar la descripción los pone en su sitio. El documento del paquete
      //     lleva las dos cosas, y no repite los hashtags fuera.
      if (!/hashtagsDe\(ETIQUETAS_DEL_CANAL\)\.join\(' '\)/.test(t)) {
        fallos.push('La descripción no termina en los hashtags: hay que pegarlos a mano en su sitio cada vez.');
      }
      const doc = textoDePublicacion(
        { titulos: ['Un título'], descripcion: `Dos frases.\n\n${tags.join(' ')}`, etiquetas: ETIQUETAS_DEL_CANAL },
        'Episodio',
      );
      for (const [que, re] of [
        ['el título', /TÍTULO/],
        ['la descripción', /DESCRIPCIÓN/],
        ['las etiquetas', /ETIQUETAS/],
        ['los hashtags', /#truecrime/],
      ]) {
        if (!re.test(doc)) fallos.push(`El documento que se baja con el video no lleva ${que}.`);
      }
      if ((doc.match(/#truecrime\b/g) || []).length > 1) {
        fallos.push('El documento repite los hashtags fuera de la descripción: dos sitios para lo mismo y uno sobra.');
      }
      return fallos;
    },
    // Se rompe como estaba: las etiquetas son las que salieron del guion, y ya.
    romper: (ctx) => conFuncion(ctx, 'ETIQUETAS_DEL_CANAL', ['tetrápodo hueco', 'misterio nueva escocia']),
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
            ritmo: { segundosPorToma: 11, proporcionMovimiento: 0.15 }, abierto: ['un hilo suelto'],
          },
        }],
      });
      const c = estado.abrirPieza(P, { vieneDe: 'p01' });
      if (c.tratamiento.identidadVisual?.paleta !== 'ámbar') fallos.push('La continuación no hereda la paleta: no parecerá la misma serie.');
      // Lo que el caso deja abierto es del CASO, así que la continuación lo hereda.
      // Esto miraba `cuidado`, el nombre viejo: al renombrarse el campo la
      // comprobación se habría quedado pasando sobre un campo muerto.
      if (!c.tratamiento.abierto?.length) fallos.push('La continuación pierde lo que el caso deja abierto.');
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
            ritmo: { segundosPorToma: 11, proporcionMovimiento: 0.15 }, abierto: ['un hilo suelto'],
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
      // Se mira que salga de TODAS las piezas y que lo único que excluya sea ella
      // misma. Antes se exigía la expresión letra por letra, y eso convertía
      // cualquier condición añadida —filtrar por formato, por ejemplo— en un fallo
      // falso. Lo que esta invariante defiende es el ALCANCE, no la redacción.
      if (!/P\.piezas\.filter\(/.test(cuerpo) || !/x\.id !== z\.id/.test(cuerpo)) {
        fallos.push('La reutilización solo mira los casos de los que este desciende.');
      }
      // Anclado a la LLAMADA, no a la palabra: el comentario que hay ahí explica
      // por qué NO se usa la ascendencia, y buscarla suelta cazaba ese comentario.
      if (/ascendencia\(/.test(cuerpo)) {
        fallos.push('La reutilización vuelve a limitarse a la ascendencia: fuera queda el banco que la hace viable.');
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
    // Se rompe volviendo a limitarlo a la ascendencia, que es como estaba.
    romper: (ctx) =>
      editando(ctx, 'app/main.js', (t) =>
        t.replace(
          'const otras = P.piezas.filter((x) => x.id !== z.id && aspectoDeLaPieza(x) === suAspecto);',
          'const otras = estado.ascendencia(P, z);',
        ),
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
      if (!/filaClips\.some\(\(x\) => x\.i === i && x\.zid === /.test(cuerpo)) {
        fallos.push('Tocar dos veces el mismo botón encolaría el clip dos veces: se pagaría doble.');
      }
      if (!/filaClips\.push\(/.test(cuerpo)) {
        fallos.push('El botón no encola: dispara la llamada al instante y en paralelo, contra el rate limit.');
      }
      // LA FILA ES UNA SOLA para el episodio y para la biblioteca, así que cada
      // entrada tiene que decir DE QUÉ PIEZA es y la bomba tiene que hacerle caso.
      // Con la pieza fija en `P.id`, un clip del reparto se guardaría bajo el
      // episodio abierto: el archivo caro acabaría donde nadie lo busca y la
      // biblioteca seguiría diciendo que le falta.
      if (!/filaClips\.push\(\{ zid:/.test(cuerpo)) {
        fallos.push('Lo encolado no dice de qué pieza es: un clip de la biblioteca se guardaría bajo el episodio.');
      }
      if (!/pieza: zid/.test(bomba)) {
        fallos.push('La bomba genera siempre contra la pieza activa: el clip de la biblioteca acabaría en el episodio.');
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
    nombre: 'el-encargo-del-guion-esta-en-el-repositorio-y-manda',
    dice: 'El documento que encarga esto —PLANPRISMANEGRO.md— NO ESTABA EN EL REPOSITORIO. Sus bloques literales del guion se copiaron al prompt una vez y después no había con qué comparar: el gancho derivó hasta abrir con «Eres Liam MacTiernan, y el 12 de octubre de 2024, en Port MacLeod…» —la fecha, el sitio y el nombre en la primera frase— y hubo que pedir el documento otra vez para verlo. Ahora el documento vive aquí y esta comprobación lee su §3 y exige que cada línea siga estando en el prompt del guion. Se puede añadir por encima; no se puede perder nada.',
    comprobar(ctx) {
      const { sistemaDelGuion } = ctx.fn;
      const fallos = [];
      const doc = ctx.fuentes.get('PLANPRISMANEGRO.md');
      if (!doc) return ['PLANPRISMANEGRO.md no está en el repositorio: el guion no tiene contra qué compararse.'];

      const bloque = doc.match(/### Bloques nuevos, texto literal\n+```\n([\s\S]*?)\n```/);
      if (!bloque) return ['El §3 del encargo ya no trae los bloques literales del guion.'];

      const lineas = bloque[1].split('\n').map((l) => l.trim()).filter(Boolean);
      // Cuatro bloques, y los cuatro tienen que estar: si el documento cambia de
      // forma y se queda con uno, la comprobación no debe adelgazar en silencio.
      const titulos = lineas.filter((l) => /^EL |^LOS /.test(l));
      if (titulos.length < 4) {
        fallos.push(`El §3 del encargo trae ${titulos.length} bloques y tiene que traer cuatro.`);
      }

      const sistema = sistemaDelGuion();
      for (const l of lineas) {
        if (!sistema.includes(l)) fallos.push(`El encargo dice «${l}» y el prompt del guion ya no lo dice.`);
      }
      return fallos;
    },
    // Se rompe con la deriva de verdad: una línea del encargo desaparece del
    // prompt. VA POR EL CONTEXTO porque la comprobación EJECUTA `sistemaDelGuion`.
    //
    // Y SE COMPRUEBA QUE EL SABOTAJE MUERDE. Este mismo sabotaje se quedó ciego el
    // día que se reescribió el bloque del gancho: quitaba una frase que ya no
    // existía, `replace` no encontraba nada, y la invariante pasaba como es lógico.
    // `editando` revienta en ese caso desde hace tiempo; `conFuncion` no puede
    // saberlo, así que lo comprueba quien lo escribe.
    romper: (ctx) =>
      conFuncion(ctx, 'sistemaDelGuion', () => {
        const entero = ctx.fn.sistemaDelGuion();
        const roto = entero.replace('El día y el mes no; el sitio por su nombre tampoco.', '');
        if (roto === entero) {
          throw new Error(
            'El sabotaje de «el-encargo-del-guion-esta-en-el-repositorio-y-manda» ya no ' +
              'encaja: la frase que quitaba no está en el prompt. Apúntalo a una línea ' +
              'que sí esté en el §3 del encargo.',
          );
        }
        return roto;
      }),
  },

  {
    nombre: 'el-guion-tiene-oficio-y-la-licencia-trae-su-limite',
    dice: 'Las reglas del guion eran todas negativas y con puras prohibiciones sale un noticiero: datos correctos, uno detrás de otro, y nadie llega al minuto tres — falta decirle QUÉ HACER. Y la licencia de inventar tiene que venir con su límite: «invéntate el detalle» a secas es el fallo que este canal existe para evitar, porque un nombre que cambia a mitad destruye la pieza entera. Aquí hubo además un bloque contrario —«no inventes datos, fechas, cifras ni nombres»— del modo documental: con los dos puestos el guion recibía una orden y su contraria en el mismo sistema y hacía lo que le parecía.',
    comprobar(ctx) {
      const { sistemaDelGuion } = ctx.fn;
      const fallos = [];
      const sistema = sistemaDelGuion();

      // 1 · EL OFICIO. Es lo que de verdad separa un documental de un noticiero.
      for (const [qué, re] of [
        ['contar con detalles concretos en vez de resúmenes', /LO CONCRETO|detalle/i],
        ['retener el significado y responder después', /ADMINISTRA LO QUE SABES|todav[ií]a no ha dicho/i],
        ['cerrar cada bloque abriendo el siguiente', /NO CIERRES LA ESCENA RESUMIENDO|empuj/i],
        ['variar la medida de las frases', /Frase larga, frase larga, frase corta|RITMO/],
        ['usar las palabras literales de las fuentes', /literal|palabras de los dem[aá]s/i],
        ['anclar cada acto en alguien concreto', /PERSONAS, NO EXPEDIENTES/],
        ['no contar dos veces el mismo hecho', /UNA VEZ EN TODO EL DOCUMENTAL/],
      ]) {
        if (!re.test(sistema)) fallos.push(`No se le pide ${qué}.`);
      }
      if (!/escalofriante/i.test(sistema) || !/impactante/i.test(sistema)) {
        fallos.push('No se prohíben los adjetivos de opinión: volverían «escalofriante» e «impactante».');
      }
      // El formato del texto plano es lo que la segmentación entiende.
      if (!/"## "/.test(sistema)) fallos.push('No se pide marcar las escenas con «## ».');
      if (!/"> "/.test(sistema)) fallos.push('No se explica la línea de testimonio «> ».');

      // 2 · LA LICENCIA, CON SU LÍMITE.
      for (const [qué, re] of [
        ['que el caso es ficción declarada', /ficci[oó]n, declarada|obra de ficci[oó]n/i],
        ['que el detalle concreto lo pone el guion', /el detalle\s+concreto que la escena necesite lo pones t[uú]/i],
        ['que el límite es la coherencia', /El l[ií]mite es la coherencia/],
        ['que un nombre o una fecha no cambian', /se escriben una vez y no cambian/],
        ['el gancho en segunda persona del primer acto', /EL GANCHO/],
        ['los testimonios con su convención', /LOS TESTIMONIOS/],
        ['el cierre con una duda concreta sin contestar', /EL CIERRE/],
      ]) {
        if (!re.test(sistema)) fallos.push(`No se dice ${qué}.`);
      }

      // 3 · Y NO PUEDE QUEDAR NI UN RASTRO DE LA ORDEN CONTRARIA. El canal es de
      // ficción: una regla que prohíbe inventar es media herramienta tirando en
      // contra de la otra media.
      for (const [qué, re] of [
        ['la prohibición de inventar datos', /No inventes datos/i],
        ['que cada afirmación salga de una ficha', /sale de una ficha/i],
        ['la atribución por tipo de fuente', /\[judicial\]|\[testimonio\]/],
      ]) {
        if (re.test(sistema)) fallos.push(`El sistema del guion arrastra ${qué}: contradice la licencia.`);
      }
      return fallos;
    },
    // Se rompe como estaba: con el bloque del modo documental pegado detrás, que
    // es la orden contraria en el mismo sistema.
    romper: (ctx) =>
      conFuncion(
        ctx,
        'sistemaDelGuion',
        () =>
          ctx.fn.sistemaDelGuion() +
          '\nLO QUE NO SE NEGOCIA\n- No inventes datos, fechas, cifras ni nombres que no estén en las fichas.',
      ),
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
      // El id es el del EPISODIO —`idMaterial()`—, no el del proyecto: bajo el del
      // proyecto, del segundo episodio en adelante la clave apunta a otro sitio.
      if (
        !/claveFotograma\(idMaterial\(\), dueña, tomas\)/.test(cuerpoMano) ||
        !/claveClip\(idMaterial\(\), dueña, tomas\)/.test(cuerpoMano)
      ) {
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

  {
    nombre: 'un-clip-solo-vale-para-la-imagen-de-la-que-salio',
    dice: '«Le sigue saliendo la opción de clip listo, cuando ese es un clip de la imagen pasada, de la imagen anterior, que ya no quiero.» `video: "ok"` era UNA BANDERA SUELTA: decía que existía un clip y no decía de qué imagen había salido. Así que mantenerla honrada consistía en acordarse de apagarla en CADA sitio que rehace una imagen; me acordé en dos y no bastó, porque el problema no era el olvido sino que la validez no estaba escrita en ninguna parte. Ahora cada imagen generada sube `versionImagen` y el clip anota en `versionClip` la que le dio origen: si los números no coinciden, el clip es de la imagen anterior y deja de valer SOLO, venga el cambio de donde venga.',
    comprobar(ctx) {
      const { clipVigente, construirHoja, clipsPosibles, sanear } = ctx.fn;
      const fallos = [];

      // ── 1 · LA TABLA DE VERDAD ────────────────────────────────────────────
      const base = { i: 0, imagen: 'ok', aprobada: true, movimiento: true };
      const casos = [
        ['el clip salió de la imagen que hay ahora', { video: 'ok', versionImagen: 2, versionClip: 2 }, true],
        ['el clip salió de la imagen ANTERIOR', { video: 'ok', versionImagen: 2, versionClip: 1 }, false],
        // El caso de verdad de arriba: rehacer sube la imagen y el clip se queda
        // en su número. Nadie tiene que apagar nada.
        ['el clip es de antes de que hubiera números', { video: 'ok', versionImagen: 1, versionClip: 0 }, false],
        ['no hay clip', { video: null, versionImagen: 3, versionClip: 3 }, false],
        // Un clip HEREDADO de otra pieza no se juzga aquí: su validez es de la
        // toma de la que salió, en su propia pieza.
        ['el clip viene heredado de otra pieza', { video: null, heredadoVid: 'p09/t004/vid', versionImagen: 5, versionClip: 1 }, true],
      ];
      for (const [qué, extra, esperado] of casos) {
        const t = { ...base, ...extra };
        if (clipVigente(t, [t]) !== esperado) {
          fallos.push(`Con «${qué}» el clip ${esperado ? 'no vale y debería' : 'vale y no debería'}.`);
        }
      }

      // Y LO QUE YA ESTABA GENERADO SE CORRIGE SOLO. Sin estos dos casos habría
      // que ir a mano por las treinta y ocho fichas ya pagadas: sin números manda
      // el visto bueno, que es lo único que se cae al rehacer una imagen.
      const viejoMalo = { ...base, aprobada: false, video: 'ok' };
      if (clipVigente(viejoMalo, [viejoMalo])) {
        fallos.push('Un clip de antes, sobre una imagen que ya nadie aprueba, sigue dándose por bueno.');
      }
      const viejoBueno = { ...base, aprobada: true, video: 'ok' };
      if (!clipVigente(viejoBueno, [viejoBueno])) {
        fallos.push('Un clip de antes, sobre su imagen aprobada, deja de valer: se tiraría lo ya pagado.');
      }

      // Y MANDA LA DUEÑA DEL FOTOGRAMA, no la toma que lo reutiliza: dos tomas con
      // el mismo plano comparten imagen Y clip, así que rehacer la imagen de la
      // dueña invalida el clip de las dos.
      const dueña = { ...base, i: 0, video: 'ok', versionImagen: 2, versionClip: 1 };
      const espejo = { ...base, i: 1, reusa: 0 };
      if (clipVigente(espejo, [dueña, espejo])) {
        fallos.push('La toma que reutiliza el fotograma da por bueno un clip que su dueña ya descartó.');
      }

      // ── 2 · Y SOBREVIVE A GUARDAR Y CARGAR ────────────────────────────────
      // `sanear` devuelve lista blanca: un número que no esté se borra al recargar,
      // y sin números la validez vuelve a ser una bandera suelta.
      const vuelta = sanear({
        piezas: [{ id: 'p01', tomas: [{ i: 0, video: 'ok', versionImagen: 3, versionClip: 2 }] }],
      });
      const t0 = vuelta.piezas[0].tomas[0];
      if (t0.versionImagen !== 3 || t0.versionClip !== 2) {
        fallos.push('Las versiones no sobreviven a recargar: al volver, el clip viejo se daría por bueno otra vez.');
      }
      // Y AL PONER LA BIBLIOTECA AL DÍA, que rehace cada toma desde el catálogo y
      // conserva solo lo que nombra. Aquí se perdían: bastaba recargar la
      // aplicación para que el clip descartado volviera a anunciarse en verde.
      const [modelo] = ctx.fn.tomasDeBiblioteca();
      const sinc = ctx.fn.sincronizarBiblioteca({
        tomas: [{ ...modelo, imagen: 'ok', aprobada: true, video: 'ok', versionImagen: 3, versionClip: 2 }],
      });
      const t1 = sinc.tomas.find((t) => t.clave === modelo.clave) || {};
      if (t1.versionImagen !== 3 || t1.versionClip !== 2) {
        fallos.push('Sincronizar el archivo con el catálogo borra las versiones: el clip viejo resucita en la siguiente carga.');
      }

      // ── 3 · EL MONTAJE NO MONTA UN CLIP DE LA IMAGEN DESCARTADA ───────────
      // Es lo que más dolía: la imagen mala se rehacía y el documental seguía
      // llevando el clip de la cara deforme.
      const plano = { encuadre: 'plano general', movimientoCamara: 'acercamiento lento', lugar: 'x', luz: 'y', sujetos: [], descripcion: 'd' };
      const paraHoja = { escena: 0, segundos: 6, medida: true, plano, audio: 'ok', imagen: 'ok', movimiento: true, video: 'ok' };
      const hoja = construirHoja({
        pieza: 'p01',
        tomas: [
          { ...paraHoja, i: 0, versionImagen: 2, versionClip: 2 },
          { ...paraHoja, i: 1, versionImagen: 2, versionClip: 1 },
        ],
        escenas: [{ n: 0 }],
      });
      const [alDia, caducado] = hoja.tomas;
      if (alDia.archivo !== 'p01/t000/vid' || alDia.movimiento !== true) {
        fallos.push('Un clip que sí corresponde a su imagen dejó de montarse: se tira lo pagado.');
      }
      if (caducado.archivo !== 'p01/t001/img' || caducado.movimiento !== false) {
        fallos.push(`El montaje usa ${caducado.archivo}: el clip de la imagen descartada acaba en el documental.`);
      }
      // Y CAE DE PIE: baja a la imagen CON su recorrido de cámara, como cualquier
      // toma sin clip. Sin esto saldría congelada.
      if (!caducado.camara) {
        fallos.push('La toma que pierde su clip caducado se queda sin recorrido de cámara: saldría congelada.');
      }

      // ── 4 · Y SE PUEDE PEDIR UNO NUEVO ────────────────────────────────────
      // «Deberías darme la opción para generar un nuevo clip de esa imagen si yo
      //  quiero.» Con la bandera suelta, la ficha creía que ya lo tenía: ni servía
      //  el que había ni dejaba pedir otro.
      const conClipViejo = { ...base, video: 'ok', versionImagen: 2, versionClip: 1 };
      if (!clipsPosibles([conClipViejo]).length) {
        fallos.push('Una imagen rehecha y aprobada no puede pedir un clip nuevo: se queda sin clip para siempre.');
      }
      const alCorriente = { ...base, video: 'ok', versionImagen: 2, versionClip: 2 };
      if (clipsPosibles([alCorriente]).length) {
        fallos.push('Se ofrece pagar otra vez el clip de una imagen que ya tiene el suyo.');
      }
      return fallos;
    },
    // Se rompe como estaba: la bandera suelta. Existe un clip, luego vale — sin
    // preguntar de qué imagen salió.
    romper: (ctx) =>
      conFuncion(ctx, 'clipVigente', (toma, tomas) => {
        const dueña = ctx.fn.tomaDelFotograma(toma, tomas);
        return dueña.video === 'ok' || !!dueña.heredadoVid || !!toma.heredadoVid;
      }),
  },

  {
    nombre: 'el-caso-pasa-en-un-pais-real-y-solo-lo-pequeno-se-inventa',
    dice: '«Debes inventar historias de cualquier parte del mundo. No tienen que ser de Latinoamérica. Que sea de Estados Unidos, de Inglaterra, de Rusia, de Panamá, de Colombia, de Perú. Cualquier país es válido, cualquier ciudad es válida. Es más: el país y la ciudad tienen que ser CORRECTOS. Ya lo que podemos inventar es el pueblo, el condado; eso es lo que hay que inventar, los lugares específicos pequeños.» El constructor pedía «nombres, pueblos, condados y organismos COMPLETAMENTE INVENTADOS», y con eso salían topónimos de fantasía: nadie siente que es real un caso ocurrido en un país que no existe. Y encima decía «condado» siempre, que es un marco anglosajón puesto por defecto — el mismo fallo del volante, pero en las palabras. Lo grande es real y verificable; lo pequeño es inventado, que es donde habría alguien real a quien señalar.',
    comprobar(ctx) {
      const inv = fuente(ctx, 'app/fases/investigacion.js');
      const fallos = [];

      // 1 · EL PAÍS Y LA CIUDAD VIAJAN APARTE. Metidos dentro de la frase de
      // `donde` no se pueden leer, y de ellos cuelga el mundo de las imágenes.
      for (const campo of ['pais', 'ciudad']) {
        if (!new RegExp(`${campo}: \\{ type: 'string' \\}`).test(inv)) {
          fallos.push(`El caso no trae «${campo}» como campo propio: el mundo de la imagen no puede leerlo.`);
        }
        if (!new RegExp(`required:[^\\]]*'${campo}'`).test(inv)) {
          fallos.push(`«${campo}» no es obligatorio: el generador puede devolverlo vacío y nadie se entera.`);
        }
      }

      // 2 · SE PIDEN REALES, Y CORRECTOS.
      for (const [qué, re] of [
        ['que el país y la ciudad son reales', /PA[IÍ]S Y LA CIUDAD SON REALES/i],
        ['que lo pequeño se inventa', /LO PEQUE[NÑ]O SE INVENTA/i],
        ['que el vocabulario del territorio es el de ese país', /se usa en ese pa[ií]s|palabra de ese pa[ií]s/i],
      ]) {
        if (!re.test(inv)) fallos.push(`El constructor de casos no dice ${qué}.`);
      }

      // 3 · Y NO SE CENTRALIZA EN NINGUNA REGIÓN. Esto es lo que había que
      // deshacer: una decisión mía disfrazada de regla.
      if (/pueblos, condados y organismos completamente inventados/i.test(inv)) {
        fallos.push('Sigue pidiendo que los lugares sean todos inventados: los topónimos salen de fantasía.');
      }
      if (!/MUNDO ENTERO VALE|cualquier pa[ií]s/i.test(inv)) {
        fallos.push('No se dice que vale cualquier país del mundo: los casos se amontonan en una sola región.');
      }
      // El aviso concreto: «condado» era la palabra por defecto para todo.
      const abanico = ['condado', 'municipio', 'provincia', 'comuna', 'parroquia'];
      const presentes = abanico.filter((x) => new RegExp(x, 'i').test(inv)).length;
      if (presentes < 4) {
        fallos.push(
          `Solo ${presentes} de ${abanico.length} formas de dividir el territorio aparecen: ` +
            'con una sola, todos los casos suenan al mismo país.',
        );
      }

      // 4 · LO QUE NO CAMBIA: ninguna persona ni empresa real. El país es un
      // contenedor; la gente es lo que se podría señalar.
      if (!/Ni una persona real ni una empresa real/i.test(inv)) {
        fallos.push('Se ha perdido la regla de que no hay personas ni empresas reales.');
      }
      if (!/documentado: false SIEMPRE|documentado":false/.test(inv)) {
        fallos.push('El caso deja de declararse como ficción.');
      }
      return fallos;
    },
    // Se rompe como estaba: todos los lugares inventados, y «condado» de oficio.
    romper: (ctx) =>
      editando(ctx, 'app/fases/investigacion.js', (t) =>
        t.replace(
          /'- EL MUNDO ENTERO VALE[\s\S]*?'- Que no se parezca a un caso real conocido/,
          "'- Nombres, pueblos, condados y organismos completamente inventados.\\n' +\n        '- Que no se parezca a un caso real conocido",
        ),
      ),
  },

  {
    nombre: 'cambiar-la-regla-del-mundo-no-tira-el-archivo-ya-pagado',
    dice: '«La biblioteca ya está construida.» La huella cubre el ENCARGO ENTERO a propósito —para que cambiar una regla del canal marque lo que se generó con la anterior—, y eso es correcto hasta que la regla que cambia es una que no invalida nada: pasar del mundo hispanohablante al neutro marcaba de golpe las ciento veintiséis imágenes del archivo, tirando el visto bueno de todas, cuando un perito con bata, un pasillo o unas manos sobre una carpeta siguen valiendo igual. El aviso habría sido correcto y el coste, absurdo. Los encargos anteriores se aceptan uno a uno y por escrito; lo que de verdad ata a un país —patrullas, matrículas, fachadas— se rehace desde su ficha.',
    comprobar(ctx) {
      const { sincronizarBiblioteca, tomasDeBiblioteca, huellaDePlano, ENCARGOS_ANTERIORES } = ctx.fn;
      const fallos = [];

      if (!Array.isArray(ENCARGOS_ANTERIORES) || !ENCARGOS_ANTERIORES.length) {
        return ['No hay lista de encargos anteriores: cambiar la regla del mundo marcaría todo el archivo.'];
      }

      const [modelo] = tomasDeBiblioteca();
      const conHuella = (huella) =>
        sincronizarBiblioteca({
          tomas: [{ ...modelo, imagen: 'ok', aprobada: true, huella }],
        }).tomas.find((t) => t.clave === modelo.clave) || {};

      // 1 · UNA IMAGEN GENERADA CON EL ENCARGO ANTERIOR SIGUE VALIENDO.
      for (const [n, encargo] of ENCARGOS_ANTERIORES.entries()) {
        const vieja = conHuella(huellaDePlano(modelo.plano, encargo));
        if (vieja.desfasada) {
          fallos.push(`El encargo anterior ${n + 1} no se acepta: el archivo entero se marca por una regla que no lo invalida.`);
        }
        if (vieja.aprobada !== true) {
          fallos.push(`Una imagen del encargo anterior ${n + 1} pierde el visto bueno: hay que volver a aprobarlas todas a mano.`);
        }
      }

      // 2 · Y AL ACEPTARLA SE LA ADOPTA: se le pone la huella de ahora, para que
      // esto no tenga que volver a preguntarse en cada carga.
      const adoptada = conHuella(huellaDePlano(modelo.plano, ENCARGOS_ANTERIORES[0]));
      if (adoptada.huella !== huellaDePlano(modelo.plano)) {
        fallos.push('La imagen aceptada no se adopta al encargo de ahora: arrastraría la huella vieja para siempre.');
      }

      // 3 · PERO UN ENCARGO DESCONOCIDO SÍ MARCA. Si no, se habría cambiado una
      // salvaguarda por un agujero: aceptar todo es no comprobar nada.
      const otra = conHuella('huella-de-un-encargo-que-nadie-reconoce');
      if (!otra.desfasada) {
        fallos.push('Una imagen de un encargo desconocido se da por buena: el aviso de «hay que rehacerla» no avisa de nada.');
      }
      if (otra.aprobada === true) {
        fallos.push('Una imagen desfasada conserva el visto bueno: se podría pagar su clip.');
      }
      return fallos;
    },
    // Se rompe como estaba antes del injerto: cualquier cambio de encargo marca
    // todo lo generado y se lleva por delante el visto bueno de todo el archivo.
    romper: (ctx) =>
      conFuncion(ctx, 'sincronizarBiblioteca', (pieza) => {
        const z = ctx.fn.sincronizarBiblioteca(pieza);
        return {
          ...z,
          tomas: z.tomas.map((t) =>
            t.huella && t.imagen === 'ok' ? { ...t, desfasada: true, aprobada: false } : t,
          ),
        };
      }),
  },

  {
    nombre: 'un-caso-no-se-resuelve-en-el-futuro-ni-se-llama-a-si-mismo-inventado',
    dice: 'Salieron cuatro premisas seguidas así: «2022, resuelto en 2051», «2021, resuelto en 2048», «2023, resuelto en 2054», «2024, resuelto en 2060». Estamos en 2026: un documental sobre un caso que se resuelve en 2060 es ciencia ficción y se cae en la primera frase. No fue un despiste del generador, fueron DOS REGLAS QUE NUNCA SE MIRARON —el expediente pedía «un lapso de entre veinte y cien años» y la época decía «los hechos arrancan de 2021 en adelante, cuenta el lapso desde ahí»—: la suma al futuro estaba escrita en el propio encargo, y faltaba lo único que las ata, que el documental SE HACE HOY. Y en la misma pantalla, «una balsa de riego en EL MUNICIPIO INVENTADO de Valdelobos»: el encargo dice que lo pequeño se inventa y el generador copió la etiqueta dentro del caso. Un expediente que se llama a sí mismo inventado deja de sonar a expediente.',
    comprobar(ctx) {
      const { enderezarFechas, sinDecirQueEsInventado } = ctx.fn;
      const inv = fuente(ctx, 'app/fases/investigacion.js');
      const fallos = [];
      const HOY = 2026;

      // ── 1 · LA RESOLUCIÓN CAE EN EL PASADO ────────────────────────────────
      // Los cuatro casos de la pantalla, tal como salieron.
      for (const [cuando, lapso] of [
        ['2022, resuelto en 2051', 29],
        ['2021, resuelto en 2048', 27],
        ['2023, resuelto en 2054', 31],
        ['2024, resuelto en 2060', 36],
      ]) {
        const r = enderezarFechas({ cuando }, HOY);
        if (r.anioResuelto > HOY) {
          fallos.push(`«${cuando}» sigue resolviéndose en ${r.anioResuelto}: eso no se puede documentar.`);
        }
        // Y EL LAPSO SE CONSERVA: es lo que menciona la sinopsis —«casi treinta
        // años»— y lo que hace que el caso sea un caso frío. Recortarlo en vez de
        // deslizar el par entero arreglaría la fecha rompiendo la historia.
        if (r.anioResuelto - r.anioHechos !== lapso) {
          fallos.push(`«${cuando}» pierde el lapso: de ${lapso} años pasa a ${r.anioResuelto - r.anioHechos}.`);
        }
        // La frase se recompone: si se dejara la que vino, la tarjeta seguiría
        // diciendo «resuelto en 2051» con el caso ya corregido por debajo.
        if (/205[0-9]|204[0-9]|206[0-9]/.test(r.cuando)) {
          fallos.push(`La frase de «${cuando}» sigue enseñando el año del futuro: ${r.cuando}`);
        }
      }
      // Un caso que ya estaba bien NO SE TOCA.
      const bueno = enderezarFechas({ cuando: '1981, resuelto en 2022' }, HOY);
      if (bueno.anioHechos !== 1981 || bueno.anioResuelto !== 2022) {
        fallos.push(`Un caso con fechas correctas se altera: ${bueno.cuando}`);
      }
      // Ni se inventan fechas donde no las hay.
      if (enderezarFechas({ cuando: '' }, HOY).cuando) {
        fallos.push('Un caso sin fechas sale con fechas inventadas.');
      }
      // Y los números mandan sobre la frase: es lo que hace que esto se pueda
      // comprobar en vez de adivinarse leyendo texto libre.
      const porNumeros = enderezarFechas({ anioHechos: 2024, anioResuelto: 2060 }, HOY);
      if (porNumeros.anioResuelto !== HOY || porNumeros.anioHechos !== 1990) {
        fallos.push(`Con los años como números tampoco se endereza: ${porNumeros.cuando}`);
      }

      // ── 2 · Y SE LE DICE EN QUÉ AÑO ESTAMOS ───────────────────────────────
      // Un modelo no lo sabe. Sin esta línea la suma se le va al futuro y nada
      // chirría: la regla del pasado no se puede cumplir sin saber cuál es el hoy.
      if (!/HOY ESTAMOS EN \$\{new Date\(\)\.getFullYear\(\)\}/.test(inv)) {
        fallos.push('No se le dice al generador en qué año estamos: no puede saber qué es futuro.');
      }
      // Sin la segunda mitad de la frase: el encargo se arma concatenando cadenas
      // y el corte de línea cae justo en medio. Un sabotaje escrito contra la
      // frase entera se quedaría ciego en cuanto alguien reformatee.
      if (!/La aritm[eé]tica manda/.test(inv)) {
        fallos.push('La época sigue mandando sobre la aritmética: vuelve la suma que se va al futuro.');
      }

      // ── 3 · EL CASO NO SE DELATA A SÍ MISMO ───────────────────────────────
      for (const [antes, despues] of [
        ['Una balsa de riego agrícola en el municipio inventado de Valdelobos.', 'el municipio de Valdelobos'],
        ['El pueblo ficticio de Santa Rosa', 'El pueblo de Santa Rosa'],
        ['la comisaría hipotética de Bell', 'la comisaría de Bell'],
      ]) {
        const r = sinDecirQueEsInventado(antes);
        if (!r.includes(despues)) fallos.push(`No se limpia la etiqueta de ficción: «${r}»`);
        if (/inventad|ficticio|hipot[eé]tic/i.test(r)) {
          fallos.push(`Sigue diciendo que es inventado: «${r}»`);
        }
      }
      // Pero NO se toca lo que no es una etiqueta: «inventó una coartada» es la
      // historia, no una confesión de ficción.
      const legitimo = 'El sospechoso se inventó una coartada y la fábrica era ficticia solo en los papeles.';
      if (sinDecirQueEsInventado(legitimo) !== legitimo) {
        fallos.push('La limpieza se come texto legítimo del caso.');
      }

      // ── 4 · Y LAS DOS REPARACIONES SE APLICAN DE VERDAD ───────────────────
      // Una función pura que nadie llama no arregla nada. Este fallo ya pasó con
      // `pais` y `ciudad`: estaban en el esquema, el generador los devolvía y la
      // lista de salida no los copiaba, así que se perdían en silencio.
      const i = inv.indexOf('const casos = (r.json?.casos');
      const salida = i < 0 ? '' : inv.slice(i, inv.indexOf('\n  });', i));
      if (!salida) fallos.push('No se encuentra dónde se arma la lista de casos propuestos.');
      else {
        if (!/enderezarFechas\(/.test(salida)) fallos.push('Las fechas no se enderezan al armar las propuestas.');
        if (!/sinDecirQueEsInventado|limpiar\(/.test(salida)) {
          fallos.push('La etiqueta de ficción no se limpia al armar las propuestas.');
        }
        for (const campo of ['pais', 'ciudad', 'anioHechos', 'anioResuelto']) {
          if (!new RegExp(`\\b${campo}:`).test(salida)) {
            fallos.push(`«${campo}» no se copia a la propuesta: el campo existe en el esquema y se pierde aquí.`);
          }
        }
      }
      return fallos;
    },
    // Se rompe como estaba: las fechas se copian tal cual, futuro incluido.
    romper: (ctx) => conFuncion(ctx, 'enderezarFechas', (caso) => ({ ...caso })),
  },

  {
    nombre: 'el-director-sabe-que-el-caso-es-inventado-y-cuenta-el-final',
    dice: '«¿Está correcto ese mensaje de que no se pueden afirmar esas cosas cuando es un caso inventado?» No lo estaba. El director arrancaba con «DÓNDE ESTÁ LA LÍNEA, y esto no se negocia: trabajas con hechos reales y personas reales» —la regla con la redacción más fuerte de todo el encargo, montada sobre una premisa falsa— y de ahí salía en pantalla «no se puede afirmar que Elias Vance mató a nadie». Elias Vance no existe: no hay a quién difamar. Y era peor que inútil, porque se peleaba con el propio diseño del caso: el expediente tiene la obligación de producir «el culpable real» y «la tecnología que lo resuelve», y el director le prohibía al guion contarlo. La herramienta construía el desenlace y luego se prohibía a sí misma decirlo. Lo que sobrevive es la CONTENCIÓN, que es el registro del género; lo que se va es la cautela legal, que no protegía a nadie.',
    comprobar(ctx) {
      const dir = fuente(ctx, 'app/fases/director.js');
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      // ── 1 · LA PREMISA FALSA NO ESTÁ ──────────────────────────────────────
      if (/Trabajas con hechos reales y personas reales/.test(dir)) {
        fallos.push('El director sigue creyendo que trabaja con hechos y personas reales.');
      }
      for (const [qué, re] of [
        ['que el caso no ocurrió', /El caso NO OCURRI[OÓ]/],
        ['que no hay cautela legal que aplicar', /no hay cautela legal|no hay a qui[eé]n difamar/i],
      ]) {
        if (!re.test(dir)) fallos.push(`El encargo del director no dice ${qué}.`);
      }
      // Y las cautelas de caso real, fuera: una sentencia absolutoria no existe en
      // un caso que nadie juzgó.
      if (/sentencia absolutoria pesa m[aá]s que veinte titulares/.test(dir)) {
        fallos.push('Sigue la regla de la sentencia absolutoria: en un caso inventado no hay sentencia.');
      }

      // ── 2 · PERO LA CONTENCIÓN SE QUEDA ───────────────────────────────────
      // Es lo que hace que suene a documental. Quitarla con la premisa falsa
      // habría cambiado un fallo por otro peor.
      if (!/CONTENCI[OÓ]N/.test(dir)) {
        fallos.push('Se ha ido también la contención: sin ella el episodio suena a novela, no a expediente.');
      }
      if (!/los hechos, no el morbo/i.test(dir)) {
        fallos.push('Se ha perdido la regla del morbo con la víctima y su familia.');
      }

      // ── 3 · Y LA REVELACIÓN SE CUENTA ─────────────────────────────────────
      // El corazón del arreglo: un caso inventado que no se resuelve no es
      // contención, es una pieza sin final.
      for (const [qué, re] of [
        ['que el caso tiene solución y se cuenta', /El caso TIENE soluci[oó]n y el documental LA CUENTA/],
        ['que la pista falsa se desmonta a la vista', /pista falsa se desmonta EXPL[IÍ]CITAMENTE/],
      ]) {
        if (!re.test(dir)) fallos.push(`El director no tiene dicho ${qué}.`);
      }
      // Lo que baja al guion dice que lo demás SÍ se cuenta. Sin esa línea, una
      // lista de «esto queda abierto» se lee como permiso para no cerrar nada.
      if (!/Todo lo dem[aá]s S[IÍ] se cuenta/.test(dir)) {
        fallos.push('Al guion no se le dice que todo lo que no está en la lista sí se cuenta.');
      }
      if (/CUIDADO, no se puede afirmar/.test(dir)) {
        fallos.push('El guion sigue recibiendo la lista como «no se puede afirmar».');
      }

      // ── 4 · EL CAMPO DICE LO QUE ES, Y LO VIEJO NO SE PIERDE ──────────────
      // Esto es lo que protege un episodio ya dirigido: su tratamiento lleva la
      // lista en `cuidado` y tiene que seguir abriéndose.
      if (!/abierto: \{ type: 'array'/.test(dir)) fallos.push('El tratamiento no declara qué deja abierto.');
      if (!/Array\.isArray\(t\.abierto\)[\s\S]{0,80}t\.cuidado/.test(dir)) {
        fallos.push('Un tratamiento ya dirigido pierde su lista al renombrarse el campo: se pierde trabajo pagado.');
      }
      // Y UN SOLO SITIO RESUELVE EL NOMBRE. Con la caída al campo viejo escrita
      // solo en un lado, un episodio ya dirigido enseñaba su lista en pantalla y
      // la perdía al bajar al guion: el mismo dato existiendo o no según quién
      // preguntara.
      const abierto = ctx.fn.abiertoDe;
      if (typeof abierto !== 'function') fallos.push('No hay un lector único de lo que se deja abierto.');
      else {
        if (abierto({ abierto: ['a'] })[0] !== 'a') fallos.push('El lector no ve el campo de ahora.');
        if (abierto({ cuidado: ['b'] })[0] !== 'b') {
          fallos.push('El lector no ve el campo de antes: un episodio ya dirigido pierde su lista.');
        }
        if (abierto({}).length || abierto().length) fallos.push('El lector inventa entradas donde no hay ninguna.');
      }
      if (!/abiertoDe\(tr\)/.test(dir)) fallos.push('El texto que baja a las fases no pasa por el lector único.');
      // Y la pantalla, igual: lee el nuevo y cae al viejo.
      if (!/tr\.abierto \?\? tr\.cuidado/.test(main)) {
        fallos.push('La pantalla no enseña la lista de un episodio dirigido antes del cambio.');
      }
      // EL RÓTULO QUE SE PINTA, no la palabra en el archivo: el comentario que
      // explica este fallo cita el rótulo viejo, y una comprobación que se caza a
      // sí misma obliga a borrar la explicación para que pase.
      if (/<b>Cuidado en este caso:<\/b>/.test(main)) {
        fallos.push('La pantalla sigue rotulándolo «Cuidado»: dice que hay un riesgo legal donde no lo hay.');
      }
      if (!/<b>Se queda abierto a prop[oó]sito:<\/b>/.test(main)) {
        fallos.push('La pantalla no dice que esa lista es lo que se deja abierto a propósito.');
      }

      // ── 5 · Y EL DIRECTOR SABE EN QUÉ PAÍS PASA ───────────────────────────
      // Veía `donde` y nada más, así que el país real del caso no llegaba a quien
      // decide el tono, los oficios y los nombres propios.
      if (!/País: \$\{caso\.pais\}/.test(dir)) {
        fallos.push('El director no ve el país del caso: decide el episodio sin saber dónde pasa.');
      }

      // ── 6 · Y EL SITIO SE PUEDE ESCRIBIR A MANO ───────────────────────────
      // «No me gustaría perder ese caso.» Un caso propuesto antes de que el caso
      // llevara país no lo trae, y la única forma de recuperarlo sería
      // regenerarlo, o sea perderlo. Se escribe, y toca el caso y nada más.
      const html = fuente(ctx, 'index.html');
      for (const id of ['caso-pais', 'caso-ciudad']) {
        if (!new RegExp(`id="${id}"`).test(html)) {
          fallos.push(`No hay dónde escribir «${id}»: un caso sin país solo se arregla regenerándolo.`);
        }
      }
      const i = main.indexOf('async function ponerSitioDelCaso');
      const cuerpo = i < 0 ? '' : main.slice(i, main.indexOf('\n}\n', i));
      if (!cuerpo) fallos.push('No hay forma de guardar el sitio escrito a mano.');
      else {
        // NO TOCA NADA MÁS. Rehacer las fichas o el tratamiento al escribir el país
        // sería perder el trabajo que se quería salvar.
        for (const qué of ['fichas', 'tratamiento', 'tomas', 'guion']) {
          if (new RegExp(`z\\.${qué}\\s*=`).test(cuerpo)) {
            fallos.push(`Escribir el país toca «${qué}»: se perdería el caso que se quería conservar.`);
          }
        }
        if (!/z\.caso = \{/.test(cuerpo) || !/pais:/.test(cuerpo) || !/ciudad:/.test(cuerpo)) {
          fallos.push('Escribir el sitio no lo guarda en el caso.');
        }
        if (!/guardar\(\)/.test(cuerpo)) fallos.push('El sitio escrito a mano no se guarda: se pierde al recargar.');
      }
      return fallos;
    },
    // Se rompe como estaba: el director creyéndose que esto es periodismo.
    romper: (ctx) =>
      editando(ctx, 'app/fases/director.js', (t) =>
        t.replace(
          'El caso NO OCURRIÓ.',
          'Trabajas con hechos reales y personas reales. No ocurrió.',
        ),
      ),
  },

  {
    nombre: 'lo-que-sale-de-un-episodio-puede-quedarse-en-el-archivo',
    dice: '«¿Ese contenido que identifica ese caso puede ir pasando a formar parte de la biblioteca para que también se pueda reutilizar en futuros casos? El caso que estoy trabajando se basa en un pueblo costero: alguna imagen o algún clip de la costa se puede reutilizar para casos futuros.» El archivo tenía SOLO los veinte sitios y el reparto escritos en el catálogo del código, y `sincronizarBiblioteca` lo reconstruye desde ese catálogo en cada carga: una entrada añadida a mano desaparecía al recargar. Así que el plano de la costa se generaba, se pagaba, se aprobaba, y moría con su episodio. Ahora el catálogo se amplía en marcha y una entrada guardada se comporta igual que las de fábrica: el director la ve, el banco la encuentra y la galería la enseña. No se copia nada —apunta al material ya pagado— y las personas también entran, porque cada cara guardada engorda el reparto y espacia las repeticiones.',
    comprobar(ctx) {
      const { entradaDeArchivo, nombreDeArchivoPara, tomasDeBiblioteca, sincronizarBiblioteca, sanear } = ctx.fn;
      const dir = fuente(ctx, 'app/fases/direccion.js');
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      const plano = { encuadre: 'plano general', lugar: 'la costa del pueblo', luz: 'gris de mañana', sujetos: [], descripcion: 'El rompiente visto desde el espigón.' };
      const sitio = { i: 7, plano, imagen: 'ok', movimiento: true, video: 'ok', versionImagen: 1, versionClip: 1 };
      const persona = { i: 9, personaje: 'testigo', plano: { ...plano, sujetos: ['Testigo — una mujer de sesenta años'] }, imagen: 'ok' };

      // ── 1 · EL NOMBRE VIENE ESCRITO ───────────────────────────────────────
      // «El nombre debe venir escrito por defecto; sale del prompt con el que se
      //  generó la imagen.» Sale del plano, que es exactamente eso.
      if (!/costa del pueblo/i.test(nombreDeArchivoPara(sitio))) {
        fallos.push(`El nombre por defecto no sale del plano: «${nombreDeArchivoPara(sitio)}».`);
      }
      if (!/testigo/i.test(nombreDeArchivoPara(persona))) {
        fallos.push('El nombre por defecto de una persona no dice de qué papel es.');
      }

      // ── 2 · SE GUARDA APUNTANDO, NO COPIANDO ──────────────────────────────
      const e = entradaDeArchivo(sitio, { nombre: 'la costa del pueblo', pieza: 'p04', tomas: [sitio] });
      if (e.heredado !== 'p04/t007/img') fallos.push(`La entrada no apunta al material pagado: ${e.heredado}`);
      // Y EL CLIP SE VA CON ELLA. Es lo más caro que hay; dejarlo atrás sería
      // guardar la imagen y volver a pagar el video en el caso siguiente.
      if (e.heredadoVid !== 'p04/t007/vid') fallos.push('El clip no se guarda con su imagen.');
      if (!e.recurso || e.personaje) fallos.push('Un sitio guardado no entra como recurso.');

      // Una persona entra como UNA VERSIÓN MÁS DE SU PAPEL: es lo que hace que
      // guardar caras espacie las repeticiones en vez de crear un papel nuevo.
      const ep = entradaDeArchivo(persona, { nombre: 'testigo · la vecina', pieza: 'p04', tomas: [persona] });
      if (ep.personaje !== 'testigo') fallos.push('Una persona guardada no se ata a su papel: no entraría en la rotación.');
      if (!/^personaje:testigo:/.test(ep.clave)) fallos.push(`La clave de una persona guardada no es la de su papel: ${ep.clave}`);
      // Y no choca con las versiones del catálogo.
      if (/:v\d+$/.test(ep.clave)) fallos.push('Una versión guardada usa la numeración del catálogo: pisaría una de fábrica.');
      // Dos del mismo papel no comparten clave, o la segunda taparía a la primera.
      const otra = entradaDeArchivo(persona, { nombre: 'x', pieza: 'p05', tomas: [persona], propios: [ep] });
      if (otra.clave === ep.clave) fallos.push('Dos caras guardadas del mismo papel comparten clave: una tapa a la otra.');

      // Lo que YA sale del archivo no se vuelve a guardar: sería la misma imagen
      // ocupando dos sitios en la rotación.
      let rebotó = false;
      try {
        entradaDeArchivo({ ...sitio, heredado: 'biblioteca/t003/img' }, { pieza: 'p04', tomas: [sitio] });
      } catch {
        rebotó = true;
      }
      if (!rebotó) fallos.push('Una imagen que ya viene del archivo se puede guardar otra vez.');

      // ── 3 · Y SOBREVIVE A LA SINCRONIZACIÓN ───────────────────────────────
      // Aquí estaba el obstáculo: el archivo se reconstruye desde el catálogo y lo
      // que no esté en él desaparece al recargar.
      const conPropia = tomasDeBiblioteca({ propios: [e] });
      const enCatalogo = conPropia.find((t) => t.clave === e.clave);
      if (!enCatalogo) fallos.push('Lo guardado no entra en el archivo: desaparece en la siguiente carga.');
      else {
        if (enCatalogo.imagen !== 'ok' || enCatalogo.heredado !== e.heredado) {
          fallos.push('La entrada guardada no llega con su material: pediría generarla otra vez.');
        }
        if (enCatalogo.aprobada !== true) fallos.push('Lo guardado entra sin visto bueno: no podría pasar a clip.');
      }
      // Con su formato: una entrada solo entra en la biblioteca de su formato.
      const z = sincronizarBiblioteca({ tomas: [] }, [e], '16:9');
      const tras = z.tomas.find((t) => t.clave === e.clave);
      if (!tras || tras.imagen !== 'ok') fallos.push('Sincronizar el archivo se lleva por delante lo guardado.');
      // Y el índice de lo de fábrica NO se mueve al añadir: si se moviera, todo lo
      // ya pagado apuntaría a otra cara.
      const sinPropia = sincronizarBiblioteca({ tomas: [] }, []);
      const primeraDe = (x) => x.tomas[0];
      if (primeraDe(z).clave !== primeraDe(sinPropia).clave || primeraDe(z).i !== primeraDe(sinPropia).i) {
        fallos.push('Guardar una entrada mueve los índices del catálogo: lo pagado apuntaría a otra imagen.');
      }

      // ── 4 · Y SOBREVIVE A GUARDAR Y CARGAR ────────────────────────────────
      const vuelta = sanear({ piezas: [], archivoPropio: [e] });
      if (vuelta.archivoPropio?.[0]?.heredado !== e.heredado) {
        fallos.push('El archivo guardado no sobrevive a recargar: se pierde en cada carga.');
      }
      // Y una entrada rota no entra: sin material no apunta a nada.
      if (sanear({ piezas: [], archivoPropio: [{ clave: 'x' }] }).archivoPropio.length) {
        fallos.push('Una entrada sin material entra igual: la galería pediría un archivo que no existe.');
      }

      // ── 5 · EL DIRECTOR LA VE, Y MARCA LAS GENÉRICAS ──────────────────────
      // Sin la lista, el director no sabe que la costa existe y la manda a generar
      // otra vez: el archivo crecería y no serviría de nada.
      if (!/guardados/.test(dir)) fallos.push('El director no recibe lo guardado: mandaría a generar lo que ya existe.');
      if (!/generico: \{ type: 'boolean' \}/.test(dir)) {
        fallos.push('El director no puede marcar qué planos servirían en otro caso.');
      }
      if (!/guardados: P\.archivoPropio/.test(main)) fallos.push('La pantalla no le pasa el archivo al director.');

      // ── 6 · Y EL BOTÓN SALE EN TODAS ──────────────────────────────────────
      // «Todas deben tener su botón para guardar.» La marca del director es una
      // sugerencia; la última palabra es de quien paga.
      const i = main.indexOf('Guardar en la biblioteca del canal');
      const cerca = i < 0 ? '' : main.slice(Math.max(0, i - 700), i + 200);
      if (!cerca) fallos.push('No hay botón para guardar una imagen del episodio en el archivo.');
      else if (!/if \(hay && !x\.heredado && !yaEnArchivo\)/.test(cerca)) {
        fallos.push('El botón de guardar no sale en todas: solo en las que marcó el director.');
      }
      if (!/nombreDeArchivoPara\(x\)/.test(main)) fallos.push('El nombre no viene escrito: hay que inventarlo cada vez.');
      return fallos;
    },
    // Se rompe como estaba: el archivo solo tiene lo que hay escrito en el
    // catálogo, y lo guardado desde un episodio se cae en la primera carga.
    romper: (ctx) => conFuncion(ctx, 'tomasDeBiblioteca', (o) => ctx.fn.tomasDeBiblioteca({ ...o, propios: [] })),
  },

  {
    nombre: 'ningun-acto-abre-repitiendo-el-final-del-anterior',
    dice: '«El hecho de que abra con el cierre del acto anterior, ¿está bien o está mal?» Mal, y lo que separa el caso bueno del malo es LA DISTANCIA: recordar algo que se oyó hace veinte minutos es oficio; repetir algo que se oyó hace veinte segundos es un tartamudeo. El guion se escribe con una llamada por acto y cada una recibe los anteriores COMPLETOS, así que no es falta de contexto: es el reflejo de «situar al espectador» al abrir una sección, y hay que prohibirlo por su nombre porque «no repitas lo ya contado» no lo cubre — quien escribe no cree estar repitiendo, cree estar enlazando. En un guion real de treinta minutos, el acto que seguía al del ADN abría con «El 20 de octubre de 2024, el informe de ADN…»: el mismo golpe, dos veces, sin nada en medio.',
    comprobar(ctx) {
      const { solapeDeApertura, solapesDelGuion } = ctx.fn;
      const gui = fuente(ctx, 'app/fases/guion.js');
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      // ── 1 · SE PROHÍBE POR SU NOMBRE ──────────────────────────────────────
      // «No repitas lo ya contado» ya estaba, y el guion seguía haciéndolo.
      if (!/NO EMPIECES ESTE ACTO CONTANDO OTRA VEZ CÓMO TERMINÓ EL ANTERIOR/.test(gui)) {
        fallos.push('No se le dice al guion que no abra un acto repitiendo el final del anterior.');
      }
      // Y SE DICE DÓNDE ESTÁ LA LÍNEA. Sin esto se cambia un fallo por otro: un
      // acto que no puede apoyarse en lo anterior empieza en el aire.
      if (!/Enlazar sí/.test(gui)) {
        fallos.push('Se prohíbe repetir sin decir que enlazar sí vale: los actos quedarían sueltos.');
      }
      // Y solo cuando hay algo escrito antes: al primer acto no se le puede pedir
      // que no repita lo que todavía no existe.
      const i = gui.indexOf('NO EMPIECES ESTE ACTO');
      if (i > 0 && !gui.slice(0, i).includes('partes.length')) {
        fallos.push('La regla se le pide también al primer acto, que no tiene anterior.');
      }

      // ── 2 · Y SE MIDE ─────────────────────────────────────────────────────
      // Una regla en el encargo es una petición, no una garantía.
      const cierre = 'El informe llegó el 20 de octubre de 2024. Las bases de datos criminales fueron rastreadas. El resultado fue inequívoco: cero coincidencias. La mujer del tetrápodo no existía en los registros.';
      const repite = 'El 20 de octubre de 2024, las bases de datos criminales fueron rastreadas y el resultado fue inequívoco: cero coincidencias, la mujer del tetrápodo no existía en los registros de nadie.';
      const enlaza = 'Con la identidad ya establecida, la policía tenía un nombre y un rostro. Pero no tenía un sospechoso, y esa fue la siguiente pregunta.';
      if (solapeDeApertura(cierre, repite).length < 3) {
        fallos.push('Un acto que abre repitiendo el final del anterior no se detecta.');
      }
      // Y LO QUE ENLAZA NO SE MARCA. Esto es la mitad del valor: una medida que
      // marca las transiciones buenas es peor que ninguna, porque enseña a
      // borrarlas.
      if (solapeDeApertura(cierre, enlaza).length >= 3) {
        fallos.push('Una transición legítima se marca como repetición: se acabaría borrando lo que enlaza.');
      }

      // ── 3 · LA PRIMERA COSTURA NO CUENTA ──────────────────────────────────
      // El acto 1 es el gancho en TODOS los géneros y el 2 lo desarrolla: ahí la
      // repetición es el diseño, no un defecto.
      const conGancho =
        `## Gancho\n${cierre}\n\n## Reconstrucción\n${repite}\n\n## Tercero\nAlgo completamente distinto que no repite nada de nada en absoluto.\n`;
      if (solapesDelGuion(conGancho).length) {
        fallos.push('Se marca la costura entre el gancho y su desarrollo, que es el diseño del género.');
      }
      // Pero de la tercera en adelante sí.
      const masTarde = `## Uno\nx\n\n## Dos\n${cierre}\n\n## Tres\n${repite}\n`;
      const marcados = solapesDelGuion(masTarde);
      if (marcados.length !== 1 || marcados[0].n !== 3) {
        fallos.push(`Un acto tardío que abre repitiendo no se marca: ${JSON.stringify(marcados.map((x) => x.n))}`);
      }

      // ── 4 · Y DOS BLOQUES SEGUIDOS NO TIENEN EL MISMO TRABAJO ─────────────
      //
      // La causa de verdad no estaba en cómo se escribía: estaba en el catálogo.
      // El peritaje terminaba en «dónde se acaba lo que la técnica sabía leer» y
      // el muro empezaba en «ninguna denuncia encaja» — el mismo momento, dos
      // veces. Prohibirlo en el encargo no podía funcionar: al acto se le pedía a
      // la vez que lo contara y que no lo repitiera.
      const frio = (ctx.fn.GENEROS || []).find((g) => g.id === 'crimen-frio');
      const bloque = (id) => (frio?.bloques || []).find((b) => b.id === id);
      const peritaje = bloque('peritaje')?.funcion || '';
      const muro = bloque('muro')?.funcion || '';
      if (!peritaje || !muro) fallos.push('No se encuentran los bloques del peritaje y el muro.');
      else {
        // El peritaje se queda en el cuerpo y DICE que ahí termina.
        if (!/TERMINA/.test(peritaje)) {
          fallos.push('El peritaje no dice dónde termina: se come el bloque siguiente.');
        }
        if (!/identidad es del bloque siguiente|NO se busca todavía/i.test(peritaje)) {
          fallos.push('El peritaje sigue pudiendo buscar la identidad, que es el trabajo del muro.');
        }
        // Y el muro EMPIEZA ahí, no lo recibe ya contado.
        if (!/EMPIEZA/.test(muro)) {
          fallos.push('El muro no dice que la búsqueda de identidad empieza en él: la daría por contada.');
        }
      }

      // Y EL ARREGLO DEL CATÁLOGO TIENE QUE LLEGAR A LO YA DIRIGIDO.
      //
      // Aquí estaba el fallo que costó cuatro regeneraciones: el director COPIA los
      // bloques del género a su estructura, y desde ahí el guion lee la copia. Así
      // que arreglar el catálogo no arreglaba nada — un episodio ya dirigido seguía
      // escribiéndose con la versión vieja y nadie podía saberlo. La función es del
      // canal y se relee del género; el contenido y los minutos son del director.
      const viejo = {
        estructura: (frio?.bloques || []).map((b, i) => ({
          acto: i + 1,
          titulo: b.nombre,
          funcion: 'LA VIEJA, con los dos bloques haciendo lo mismo',
          contenido: `contenido del episodio ${i}`,
          minutos: 4,
        })),
      };
      const actos = ctx.fn.actosDe(viejo, 30, frio);
      if (actos.some((a) => /LA VIEJA/.test(a.funcion))) {
        fallos.push('Un episodio ya dirigido sigue con la función vieja: arreglar el catálogo no le llega.');
      }
      if (!actos.some((a) => /EMPIEZA la búsqueda de identidad/.test(a.funcion))) {
        fallos.push('La función del género no llega al guion de un episodio ya dirigido.');
      }
      // Pero lo que SÍ es del director se respeta: es su episodio, no el molde.
      if (actos[2]?.contenido !== 'contenido del episodio 2') {
        fallos.push('Se pierde el contenido que el director escribió para este episodio.');
      }
      if (actos[2]?.titulo !== frio.bloques[2].nombre) fallos.push('Se pierde el título del acto.');

      // ── 5 · Y SE AVISA, SIN REESCRIBIR ────────────────────────────────────
      // Distinguir lo que repite de lo que enlaza es un juicio de guion.
      // Reescribir por error una transición buena empeoraría la pieza y la
      // cobraría, así que la herramienta enseña y decide quien escribe.
      // SE CUENTAN LOS CAMINOS. «Hay al menos una llamada» no bastaba y costó dos
      // regeneraciones enteras: hay DOS botones que escriben el guion —el paso del
      // Inicio y el de la sección Guion— y el aviso estaba puesto solo en el
      // primero. Él usaba el segundo, así que el aviso no salió NUNCA. Una
      // comprobación que vive en uno de los dos caminos no comprueba nada para
      // quien va por el otro.
      const escriben = (main.match(/guionFase\.escribirGuion\(\{/g) || []).length;
      const avisan = (main.match(/avisoDeGuion\(/g) || []).length - 1; // menos su definición
      if (!escriben) fallos.push('No se encuentra dónde escribe el guion la pantalla.');
      else if (avisan < escriben) {
        fallos.push(`${escriben} botones escriben el guion y solo ${avisan} avisan: por el otro camino no sale nada.`);
      }
      if (!/solapesDelGuion\(texto\)/.test(main)) {
        fallos.push('La pantalla no mira si algún acto abre repitiendo: el aviso no llega nunca.');
      }
      if (!/abre repitiendo el final del anterior/.test(main)) {
        fallos.push('El aviso no dice qué pasa ni en qué acto.');
      }
      // Y NO se reescribe solo.
      if (/solapesDelGuion[\s\S]{0,400}escribirGuion\(/.test(main)) {
        fallos.push('El guion se reescribe solo al detectar solape: pagaría por un juicio que no es suyo.');
      }
      return fallos;
    },
    // Se rompe como estaba: la medida cuenta cualquier palabra suelta en común,
    // así que marca también las transiciones buenas — y con todo marcado, no hay
    // nada marcado.
    romper: (ctx) =>
      conFuncion(ctx, 'solapeDeApertura', (anterior, acto) => {
        const pal = (t) => String(t || '').toLowerCase().match(/[a-záéíóúñ]+/g) || [];
        const antes = new Set(pal(anterior));
        return [...new Set(pal(acto).filter((w) => antes.has(w)))];
      }),
  },

  {
    nombre: 'un-clip-se-pide-siempre-de-lo-mas-largo-que-de-el-generador',
    dice: '«Todos los clips se deben generar de ocho segundos para aprovecharlos. En caso de que la toma sea de menos de ocho segundos, se corta el clip y ya, no importa que el resto se pierda: es un clip que se puede reutilizar para futuras generaciones en una toma que sí utilice los ocho segundos.» Y aquí se pedía la duración MÁS CERCANA a la toma: una toma de tres segundos pedía un clip de cuatro. Ese clip es un callejón sin salida —solo cubre tomas de cuatro segundos— y en cuanto el mismo plano haga falta en una toma de doce hay que pagarlo otra vez. El archivo ya lo hacía bien, con este razonamiento escrito al lado en `SEGUNDOS_DE_CLIP = 8`; la fase del episodio se había quedado atrás. Cuesta más por clip y menos por canal.',
    comprobar(ctx) {
      const { duracionQueSePide, duracionMasLarga, duracionMasCercana, segundosDeClip } = ctx.fn;
      const mov = fuente(ctx, 'app/fases/movimiento.js');
      const fallos = [];

      // 1 · SIEMPRE LO MÁS LARGO, dure lo que dure la toma.
      const pedida = duracionQueSePide();
      if (pedida !== duracionMasLarga()) {
        fallos.push(`Se pide un clip de ${pedida} s cuando el generador da hasta ${duracionMasLarga()}.`);
      }
      if (pedida < 8) fallos.push(`Se piden clips de ${pedida} s: por debajo de ocho no cubren una toma larga.`);
      // Y NO DEPENDE DE LA TOMA. Es lo que lo hace reutilizable.
      if (duracionQueSePide.length > 1) {
        fallos.push('Lo que se pide todavía depende de la toma: volvería el clip que solo sirve para la suya.');
      }

      // 2 · Y NO SE USA LA MÁS CERCANA para pedir. Una toma de tres segundos pedía
      // cuatro, y ese clip no sirve para ninguna otra.
      if (/segundos: duracionMasCercana\(/.test(mov)) {
        fallos.push('Se sigue pidiendo la duración más cercana a la toma: vuelven los clips de cuatro segundos.');
      }
      // La cuenta del gasto tiene que decir lo mismo que lo que se pide, o el
      // presupuesto que se enseña antes de gastar es mentira.
      if (!/con\.length \* duracionQueSePide\(/.test(mov)) {
        fallos.push('El presupuesto no cuenta lo que de verdad se va a pedir.');
      }

      // 3 · `duracionMasCercana` se queda: la usa el montaje para saber qué cabe,
      // que es otra pregunta. Lo que no puede es decidir lo que se PIDE.
      if (typeof duracionMasCercana !== 'function' || duracionMasCercana(11) !== 8) {
        fallos.push('Se ha perdido el cálculo de qué duración de la lista cubre una toma.');
      }
      // Y una toma corta sigue pidiendo el clip largo: se corta y lo que sobra se
      // reutiliza. Eso es lo contrario de lo que hacía.
      for (const corta of [3, 5, 7]) {
        if (duracionMasCercana(segundosDeClip({ segundos: corta })) >= pedida) continue;
        if (duracionQueSePide() !== pedida) {
          fallos.push(`Una toma de ${corta} s cambia lo que se pide: el clip dejaría de ser reutilizable.`);
        }
      }
      return fallos;
    },
    // Se rompe como estaba: la duración más cercana a la toma.
    romper: (ctx) => conFuncion(ctx, 'duracionQueSePide', () => 4),
  },

  {
    nombre: 'lo-generado-en-un-formato-se-puede-traer-al-otro-sin-pagar',
    dice: '«Todas las imágenes y videoclips que ya están en nueve dieciséis, simplemente las utilicemos también en formato dieciséis nueve, la imagen con su video, recortándole y que se vea solo el centro, y eso ya quede como biblioteca del formato dieciséis nueve.» Es lo contrario de heredar entre formatos —que no se hace y no se va a hacer—: es una decisión suya, UNA VEZ, de que la biblioteca del formato nuevo arranque con lo ya pagado en vez de vacía. Y no cuesta nada ni hay que recortar nada a mano: la entrada nueva apunta al MISMO archivo y el recorte al centro lo hace el montaje él solo. Fabricar copias recortadas daría el mismo fotograma ocupando el doble.',
    comprobar(ctx) {
      const { traerDeOtroFormato, sincronizarEnSitio, sanear } = ctx.fn;
      const fallos = [];

      const proyecto = () =>
        sanear({
          id: 'p',
          config: { formato: { vertical: false } },
          piezas: [
            { id: 'p01' },
            {
              id: 'biblioteca',
              esBiblioteca: true,
              aspecto: '9:16',
              tomas: [
                { i: 0, clave: 'recurso:carretera-noche:v1', recurso: 'carretera-noche', variante: 'v1', imagen: 'ok', video: 'ok', aprobada: true },
                { i: 1, clave: 'recurso:carretera-noche:v2', recurso: 'carretera-noche', variante: 'v2', imagen: 'ok', aprobada: true },
              ],
            },
          ],
          archivoPropio: [{ clave: 'recurso:la-costa:g1', recurso: 'la-costa', variante: 'g1', nombre: 'la costa', heredado: 'p01/t003/img', aspecto: '9:16' }],
        });

      const P = proyecto();
      const r = traerDeOtroFormato(P.piezas, P.archivoPropio, '9:16', '16:9');
      P.archivoPropio = [...P.archivoPropio, ...r.entradas];

      if (!r.tomas) fallos.push('No se trae nada del catálogo del otro formato: la biblioteca nueva arranca vacía.');
      if (!r.entradas.length) fallos.push('No se trae lo guardado desde los episodios: se quedaría solo en el formato viejo.');

      const dest = P.piezas.find((z) => z.esBiblioteca && z.aspecto === '16:9');
      const traidas = (dest?.tomas || []).filter((t) => t.imagen === 'ok');
      if (traidas.length < 2) fallos.push(`La biblioteca de 16:9 queda con ${traidas.length} imagen(es) tras traer.`);

      // 1 · APUNTA AL MISMO ARCHIVO. Si compusiera una clave suya, pediría un
      // archivo que nadie ha generado y el montaje se pararía.
      const una = traidas.find((t) => t.clave === 'recurso:carretera-noche:v1');
      if (una && !String(una.heredado || '').startsWith('biblioteca/')) {
        fallos.push(`Lo traído no apunta al material de origen (${JSON.stringify(una?.heredado)}): se pediría un archivo que no existe.`);
      }
      // Y el clip se va con su imagen: es lo más caro que hay.
      if (una && !una.heredadoVid) fallos.push('El clip no se trae con su imagen: lo más caro se quedaría sin usar.');
      // Y se dice de dónde vino, porque en la ficha se ve entera y en el vídeo no.
      if (una && una.recortada !== '9:16') {
        fallos.push(`Lo traído no dice de qué formato viene (${JSON.stringify(una?.recortada)}).`);
      }

      // 2 · LA DE ORIGEN NO SE TOCA. Traer no es mover.
      const origen = P.piezas.find((z) => z.esBiblioteca && z.aspecto === '9:16');
      if ((origen?.tomas || []).filter((t) => t.imagen === 'ok').length !== 2) {
        fallos.push('Traer se lleva por delante la biblioteca de origen: sería mover, no traer.');
      }

      // 3 · SOBREVIVE A RECARGAR. Esta lista es blanca: lo que no se nombre en
      // `sincronizarBiblioteca` desaparece en la siguiente carga, y eso ya se ha
      // pagado con `heredado` y con las versiones del clip.
      const P2 = sanear(JSON.parse(JSON.stringify(P)));
      sincronizarEnSitio(P2.piezas, P2.archivoPropio, '16:9');
      const d2 = P2.piezas.find((z) => z.esBiblioteca && z.aspecto === '16:9');
      const vivas = (d2?.tomas || []).filter((t) => t.imagen === 'ok');
      if (vivas.length < traidas.length) {
        fallos.push(`Al recargar quedan ${vivas.length} de ${traidas.length} traídas: se pierden solas.`);
      }
      if (vivas.length && !vivas.every((t) => t.recortada === '9:16')) {
        fallos.push('Al recargar se pierde la marca de recortada: la ficha dejaría de avisar.');
      }

      // 4 · LO QUE YA ESTÁ GENERADO EN ESTE FORMATO MANDA. Traer rellena huecos.
      const P3 = proyecto();
      const suyaYa = sincronizarEnSitio(P3.piezas, P3.archivoPropio, '16:9');
      const k = suyaYa.tomas.findIndex((t) => t.clave === 'recurso:carretera-noche:v1');
      suyaYa.tomas[k] = { ...suyaYa.tomas[k], imagen: 'ok', versionImagen: 3 };
      traerDeOtroFormato(P3.piezas, P3.archivoPropio, '9:16', '16:9');
      const suya = P3.piezas
        .find((z) => z.esBiblioteca && z.aspecto === '16:9')
        .tomas.find((t) => t.clave === 'recurso:carretera-noche:v1');
      if (suya?.heredado || suya?.recortada) {
        fallos.push('Traer pisa una imagen ya generada en este formato: se cambiaría la buena por una recortada.');
      }
      return fallos;
    },
    // Se rompe como estaba: no hay forma de traer, y la biblioteca del formato
    // nuevo arranca vacía teniendo ciento veintiséis imágenes pagadas al lado.
    romper: (ctx) => conFuncion(ctx, 'traerDeOtroFormato', () => ({ tomas: 0, entradas: [] })),
  },

  {
    nombre: 'un-episodio-sabe-en-que-formato-se-genero-y-no-hereda-de-otro',
    dice: '«El episodio debería saber en qué formato se generó.» No lo sabía: nadie se lo escribía nunca, así que la reutilización entre episodios daba por hecho que TODOS estaban en el formato de hoy. Hoy no molesta porque solo hay uno; el día que haya un episodio vertical y se trabaje en horizontal, el botón de reutilizar le ofrecería sus imágenes — y el montaje no pone barras, agranda y recorta, así que se perdería el tercio central. Ahora la pieza se sella con el formato AL GENERAR SU PRIMERA IMAGEN, que es cuando el formato es un hecho y no una suposición sobre un episodio que todavía no ha gastado nada. Y `heredables` comprueba el formato POR SU CUENTA en vez de fiarse de quien la llama: la protección que vive solo en quien llama se rompe el día que aparece un tercer sitio que llama, y eso ya se ha pagado cuatro veces aquí.',
    comprobar(ctx) {
      const { heredables, sanear } = ctx.fn;
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];

      // 1 · LA PIEZA GUARDA SU FORMATO, y una que no lo tiene no se lo inventa.
      const p = sanear({
        id: 'proy',
        config: { formato: { vertical: false } },
        piezas: [{ id: 'p01', aspecto: '9:16' }, { id: 'p02' }],
      });
      if (p.piezas[0].aspecto !== '9:16') {
        fallos.push(`Una pieza pierde el formato en el que se generó (${JSON.stringify(p.piezas[0].aspecto)}).`);
      }
      if (p.piezas[1].aspecto) {
        fallos.push(
          `Una pieza sin material se inventa un formato (${JSON.stringify(p.piezas[1].aspecto)}): ` +
            'todavía no ha generado nada con el que decirlo.',
        );
      }

      // 2 · Y SE SELLA AL GENERAR, no antes ni a mano.
      if (!/function sellarFormato\(/.test(main)) fallos.push('Nadie sella el formato de la pieza.');
      if (!/if \(nueva\?\.imagen === 'ok'\) sellarFormato\(pieza\(\)\);/.test(main)) {
        fallos.push('El formato no se sella al generar una imagen: la pieza nunca llega a saber en cuál se hizo.');
      }
      if (!/if \(!z \|\| z\.esBiblioteca \|\| z\.aspecto\) return;/.test(main)) {
        fallos.push('Sellar el formato pisa el que ya tuviera: cambiar de formato convertiría lo ya pagado.');
      }

      // 3 · `heredables` LO COMPRUEBA ELLA MISMA.
      const vertical = {
        id: 'p09',
        aspecto: '9:16',
        titulo: 'uno viejo, vertical',
        tomas: [{
          i: 0, recurso: 'carretera-noche', variante: 'v1', imagen: 'ok',
          plano: { lugar: 'la carretera', encuadre: 'general', luz: 'noche', recurso: 'carretera-noche' },
        }],
      };
      const toma = {
        i: 0, recurso: 'carretera-noche', imagen: null,
        plano: { lugar: 'x', encuadre: 'y', luz: 'z', recurso: 'carretera-noche', descripcion: 'd' },
      };
      if (heredables([toma], [vertical], { pieza: 'p1', aspecto: '16:9' }).length) {
        fallos.push('Un episodio horizontal hereda de uno vertical: se vería el tercio central y nada más.');
      }
      if (!heredables([toma], [vertical], { pieza: 'p1', aspecto: '9:16' }).length) {
        fallos.push('Un episodio vertical NO hereda de uno vertical: se dejaría de ahorrar donde sí se debe.');
      }
      // Sin formato pedido no se filtra: se puede seguir preguntando «¿qué hay?».
      if (!heredables([toma], [vertical], { pieza: 'p1' }).length) {
        fallos.push('Sin pedir formato ya no se puede preguntar qué material hay.');
      }

      // 4 · Y QUIEN LA LLAMA SE LO PASA. Sin esto, el filtro de dentro no se usa
      // nunca y esta invariante estaría comprobando código muerto.
      if (!/aspecto: aspectoDeLaPieza\(z\)/.test(main)) {
        fallos.push('El contexto de reparto no lleva el formato: `heredables` no tendría con qué filtrar.');
      }
      return fallos;
    },
    // Se rompe como estaba: `heredables` no mira el formato de quien dona.
    romper: (ctx) =>
      conFuncion(ctx, 'heredables', (tomas, anteriores, reparto) =>
        ctx.fn.heredables(tomas, anteriores, { ...(reparto || {}), aspecto: '' }),
      ),
  },

  {
    nombre: 'cada-formato-tiene-su-biblioteca-y-no-se-pisan',
    dice: 'La biblioteca entera —141 imágenes y sus clips— se generó en 9:16 antes de caer en que el canal es de vídeo largo y va en 16:9. El montaje NO pone barras: agranda hasta llenar el ancho y recorta el centro, así que una imagen vertical en un episodio horizontal pierde dos tercios del alto, y nada avisaba porque una entrada del archivo no guardaba en qué formato se generó. Peor: las claves del material salen del id de la pieza —`biblioteca/t000/img`—, así que generar el catálogo en 16:9 habría escrito ENCIMA de las verticales ya pagadas. Ahora hay una biblioteca por formato, con su propio id, y un episodio solo hereda de la suya.',
    comprobar(ctx) {
      const { sincronizarBiblioteca, sincronizarEnSitio, entradaDeArchivo, idBiblioteca, aspectoPieza } = ctx.fn;
      const fallos = [];

      // 1 · DOS BIBLIOTECAS, DOS SITIOS. Es lo que impide que una pise a la otra.
      const vertical = sincronizarBiblioteca({ tomas: [] }, [], '9:16');
      const ancha = sincronizarBiblioteca({ tomas: [] }, [], '16:9');
      if (vertical.id === ancha.id) {
        fallos.push(`Las dos bibliotecas comparten id (${vertical.id}): la de 16:9 escribiría encima de la de 9:16.`);
      }
      // Y la vertical conserva el id de siempre: sus imágenes ya están guardadas
      // ahí y en el almacén no hay renombrar.
      if (vertical.id !== 'biblioteca') {
        fallos.push(`La biblioteca vertical cambia de id a «${vertical.id}»: sus 141 imágenes dejarían de encontrarse.`);
      }
      if (idBiblioteca('16:9') === idBiblioteca('9:16')) {
        fallos.push('`idBiblioteca` da el mismo sitio para los dos formatos.');
      }

      // 2 · SIN FORMATO PEDIDO, NO SE CONVIERTE NADA. Sincronizar es poner al día
      // una biblioteca, no cambiarla de formato por descuido.
      if (aspectoPieza(sincronizarBiblioteca(vertical, [])) !== '9:16') {
        fallos.push('Sincronizar sin pedir formato convierte la biblioteca: la vertical pasaría a apuntar a otro sitio.');
      }

      // 3 · Y LAS DOS CONVIVEN EN EL PROYECTO. Cambiar el canal a 16:9 no puede
      // hacer desaparecer las ciento veintiséis verticales ya pagadas.
      const piezas = [];
      sincronizarEnSitio(piezas, [], '9:16');
      sincronizarEnSitio(piezas, [], '16:9');
      const bibliotecas = piezas.filter((z) => z.esBiblioteca);
      if (bibliotecas.length !== 2) {
        fallos.push(`Con los dos formatos quedan ${bibliotecas.length} biblioteca(s): una se llevó a la otra por delante.`);
      }
      // Y volver a sincronizar la de 9:16 no toca la de 16:9.
      sincronizarEnSitio(piezas, [], '9:16');
      if (piezas.filter((z) => z.esBiblioteca).length !== 2) {
        fallos.push('Sincronizar una biblioteca se lleva la del otro formato.');
      }

      // 4 · UNA ENTRADA GUARDADA SABE DE QUÉ FORMATO ES, y solo entra en la suya.
      const toma = {
        i: 0,
        imagen: 'ok',
        personaje: 'perito forense',
        plano: { lugar: 'el laboratorio', encuadre: 'medio', luz: 'fria', personaje: 'perito forense', descripcion: 'x' },
      };
      const enAncha = entradaDeArchivo(toma, { pieza: 'p01', tomas: [toma], propios: [], aspecto: '16:9' });
      if (enAncha.aspecto !== '16:9') {
        fallos.push(`Una entrada guardada no dice su formato (${JSON.stringify(enAncha.aspecto)}).`);
      }
      const dentro = (z) => (z.tomas || []).some((t) => t.clave === enAncha.clave);
      if (!dentro(sincronizarBiblioteca({ tomas: [] }, [enAncha], '16:9'))) {
        fallos.push('Una entrada de 16:9 no entra en la biblioteca de 16:9.');
      }
      if (dentro(sincronizarBiblioteca({ tomas: [] }, [enAncha], '9:16'))) {
        fallos.push('Una entrada de 16:9 entra en la biblioteca vertical: se recortaría al centro sin avisar.');
      }
      return fallos;
    },
    // Se rompe como estaba: un solo id de biblioteca para todos los formatos, que
    // es lo que habría escrito la de 16:9 encima de las 141 verticales.
    romper: (ctx) =>
      conFuncion(ctx, 'sincronizarBiblioteca', (pieza, propios, aspecto) => ({
        ...ctx.fn.sincronizarBiblioteca(pieza, propios, aspecto),
        id: 'biblioteca',
      })),
  },

  {
    nombre: 'la-misma-imagen-del-archivo-no-cae-en-dos-tomas-seguidas',
    dice: 'La misma imagen en cuatro tomas seguidas, y contando cada una otra cosa: la tarjeta micro-SD, los contactos de cobre, el escáner girando trescientos sesenta grados — las tres con la misma fotografía de una mujer con una carpeta. Las dos claves de catálogo se resolvían igual: se elegía UNA versión para todo el episodio y se le ponía a todas las tomas que pidieran esa clave. Para el perito es lo correcto —dentro de un episodio la persona es la misma— y para un sitio es exactamente el fallo, porque un sitio no es una persona. Encima había tres versiones guardadas sin usar. Ahora cada plano distinto que pide el mismo recurso se lleva una versión distinta, y ninguna imagen heredada cae en dos tomas seguidas que no sean el mismo plano.',
    comprobar(ctx) {
      const { heredables } = ctx.fn;
      const fallos = [];
      const reparto = { historial: {}, orden: [], pieza: 'ep' };

      const conVersiones = (n) => ({
        id: 'biblioteca',
        titulo: 'Archivo',
        tomas: Array.from({ length: n }, (_, k) => ({
          i: k,
          recurso: 'laboratorio forense',
          variante: `v${k + 1}`,
          imagen: 'ok',
          video: 'ok',
          plano: { lugar: `laboratorio ${k}`, encuadre: `enc ${k}`, luz: `luz ${k}`, recurso: 'laboratorio forense' },
        })),
      });

      // Seis tomas seguidas del mismo recurso, contando seis cosas distintas.
      const seis = Array.from({ length: 6 }, (_, i) => ({
        i,
        recurso: 'laboratorio forense',
        imagen: null,
        video: null,
        plano: {
          lugar: `sitio ${i}`, encuadre: `encuadre ${i}`, luz: `luz ${i}`,
          recurso: 'laboratorio forense', descripcion: `lo que se ve en la toma ${i}`,
        },
      }));

      // 1 · Con tres versiones guardadas, se usan las tres y ninguna se repite seguida.
      const tres = heredables(seis, [conVersiones(3)], reparto).filter((x) => x.tipo === 'img');
      const distintas = new Set(tres.map((x) => x.de.clave)).size;
      if (distintas < 3) {
        fallos.push(
          `Seis tomas del mismo recurso salen con ${distintas} imagen(es) distinta(s) ` +
            'teniendo tres guardadas: la biblioteca se usa a un tercio.',
        );
      }
      for (let n = 1; n < tres.length; n++) {
        if (tres[n].i === tres[n - 1].i + 1 && tres[n].de.clave === tres[n - 1].de.clave) {
          fallos.push(`Las tomas ${tres[n - 1].i} y ${tres[n].i} van seguidas con la misma imagen.`);
        }
      }

      // 2 · Con UNA sola versión, no se reparte la misma cuatro veces: se hereda una
      // y las demás se generan. Una imagen correcta pagada vale más que una gratis
      // que no tiene nada que ver con lo que se narra.
      const una = heredables(seis, [conVersiones(1)], reparto).filter((x) => x.tipo === 'img');
      const seguidas = una.filter((x, n) => n && x.i === una[n - 1].i + 1 && x.de.clave === una[n - 1].de.clave);
      if (seguidas.length) {
        fallos.push(`Con una sola versión guardada, ${seguidas.length} tomas seguidas comparten imagen.`);
      }

      // 3 · Y LO QUE SÍ SE COMPARTE SE COMPARTE. Dos tomas seguidas con el MISMO
      // plano son un plano repetido a propósito —el montaje las funde en uno— y
      // tienen que seguir heredando las dos: si no, esto ahorra dejando de ahorrar.
      const mismoPlano = { lugar: 'el mismo sitio', encuadre: 'el mismo', luz: 'la misma', recurso: 'laboratorio forense', descripcion: 'lo mismo' };
      const gemelas = [0, 1].map((i) => ({ i, recurso: 'laboratorio forense', imagen: null, video: null, plano: { ...mismoPlano } }));
      const dos = heredables(gemelas, [conVersiones(3)], reparto).filter((x) => x.tipo === 'img');
      if (dos.length !== 2) {
        fallos.push(`Dos tomas seguidas del MISMO plano heredan ${dos.length}: se deja de ahorrar donde sí se debe.`);
      } else if (dos[0].de.clave !== dos[1].de.clave) {
        fallos.push('Dos tomas seguidas del mismo plano reciben imágenes distintas: eran el mismo plano.');
      }

      // 4 · La persona SÍ es una por episodio: la cara del perito no cambia a mitad.
      const perito = Array.from({ length: 4 }, (_, i) => ({
        i: i * 2,
        personaje: 'perito forense',
        imagen: null,
        video: null,
        plano: { lugar: `sitio ${i}`, encuadre: `enc ${i}`, luz: `luz ${i}`, personaje: 'perito forense', descripcion: `declara ${i}` },
      }));
      const elenco = {
        id: 'biblioteca',
        titulo: 'Archivo',
        tomas: [0, 1, 2].map((k) => ({
          i: k, personaje: 'perito forense', variante: `p${k}`, imagen: 'ok',
          plano: { lugar: 'laboratorio', encuadre: `e${k}`, luz: 'fria', personaje: 'perito forense' },
        })),
      };
      const caras = new Set(
        heredables(perito, [elenco], reparto).filter((x) => x.tipo === 'img').map((x) => x.de.clave),
      );
      if (caras.size > 1) {
        fallos.push(`El perito cambia de cara dentro del episodio: ${caras.size} caras distintas.`);
      }
      return fallos;
    },
    // Se rompe como estaba: una sola versión por clave para todo el episodio, sin
    // mirar si dos tomas seguidas acaban con la misma imagen.
    //
    // VA POR EL CONTEXTO: la comprobación EJECUTA `heredables`.
    romper: (ctx) =>
      conFuncion(ctx, 'heredables', (tomas, anteriores, reparto) => {
        const r = ctx.fn.heredables(tomas, anteriores, reparto);
        const primera = new Map();
        const salida = r.map((x) => {
          const clave = `${x.tipo}·${tomas.find((t) => t.i === x.i)?.recurso || ''}`;
          if (!primera.has(clave)) primera.set(clave, x.de);
          return { ...x, de: primera.get(clave) };
        });
        salida.reparto = r.reparto;
        return salida;
      }),
  },

  {
    nombre: 'el-techo-no-premia-juntarlo-todo-en-una-toma',
    dice: 'Una toma de CUARENTA Y NUEVE SEGUNDOS con dos párrafos enteros dentro: una imagen fija durante casi un minuto, que es lo contrario de lo que la regla de los ocho a dieciocho existe para conseguir. El castigo de pasarse del techo tenía una parte FIJA —«1e4 + el exceso al cuadrado»— que se pagaba por cada toma pasada. Cuando ningún reparto conseguía respetar el techo, dos tomas pasadas costaban dos veces esa parte fija y una sola costaba una, así que al segmentador le salía más barato meterlo TODO en una toma. Ahora el exceso se paga al cuadrado y sin parte fija: partir siempre sale más barato que acumular.',
    comprobar(ctx) {
      const { segmentar, verificarCobertura } = ctx.fn;
      const fallos = [];

      // El bloque real que lo destapó, con el techo que traía su proyecto. La
      // primera frase no llega al suelo sin pasarse del techo, así que NINGÚN
      // reparto lo respeta: es justo el caso en que el castigo fijo se rendía.
      const guion =
        '## Autoridades\n\n' +
        'El rompeolas de la antigua procesadora SilverTide se transforma en una escena ' +
        'del crimen sellada. Bajo un cielo plomizo que amenaza con lluvia, los agentes ' +
        'establecen un perímetro de seguridad de doscientos metros y comienzan la ' +
        'extracción. El proceso es lento, meticuloso.\n\n' +
        'El ingeniero Liam MacTiernan, aún en el lugar, supervisa el trabajo de una ' +
        'cuadrilla especializada que utiliza sierras de diamante para abrir una sección ' +
        'rectangular en la parte superior del tetrápodo 402. La cámara endoscópica había ' +
        'mostrado que el cuerpo estaba en posición fetal, encajado en el espacio de apenas ' +
        'un metro cúbico. La filtración constante del agua de mar a través de las ' +
        'microfisuras del hormigón había creado un ambiente único.';

      const apretado = { segundosMinimo: 8, segundosObjetivo: 11, segundosMaximo: 16 };
      const r = segmentar(guion, apretado);
      if (!verificarCobertura(guion, r).ok) fallos.push('El reparto rompe la cobertura.');

      const larga = Math.max(...r.tomas.map((t) => t.segundos));
      // Con un techo imposible las tomas se pasan, pero POCO y repartido. Nunca
      // una sola que se lo lleve todo.
      if (larga > apretado.segundosMaximo * 1.5) {
        fallos.push(
          `Con el techo en ${apretado.segundosMaximo}s sale una toma de ${larga}s: ` +
            'al segmentador le salió más barato juntarlo todo que partirlo.',
        );
      }
      if (r.tomas.length < 3) {
        fallos.push(`Cuarenta y nueve segundos de guion salen en ${r.tomas.length} toma(s).`);
      }
      // Y con el techo de verdad, ni eso: todas dentro.
      const bien = segmentar(guion);
      if (bien.tomas.some((t) => t.segundos > ctx.fn.SEGMENTACION.segundosMaximo)) {
        fallos.push(`Con el techo normal alguna toma se pasa: ${bien.tomas.map((t) => t.segundos).join(', ')}`);
      }
      return fallos;
    },
    // Se rompe como estaba: las tomas seguidas que ya se pasan del techo se funden
    // en una, que es lo que el castigo fijo hacía preferir.
    romper: (ctx) =>
      conFuncion(ctx, 'segmentar', (guion, config) => {
        const r = ctx.fn.segmentar(guion, config);
        const techo = { ...ctx.fn.SEGMENTACION, ...config }.segundosMaximo;
        const texto = String(guion ?? '');
        const tomas = [];
        for (const t of r.tomas) {
          const previa = tomas[tomas.length - 1];
          if (previa && previa.segundos > techo && t.segundos > techo && previa.escena === t.escena) {
            previa.finEnGuion = t.finEnGuion;
            previa.texto = texto.slice(previa.inicioEnGuion, t.finEnGuion);
            previa.segundos = +(previa.texto.length / 14.5).toFixed(2);
            continue;
          }
          tomas.push({ ...t });
        }
        return { ...r, tomas: tomas.map((t, i) => ({ ...t, i })) };
      }),
  },

  {
    nombre: 'el-suelo-y-el-techo-de-la-toma-no-se-guardan-en-el-proyecto',
    dice: 'La regla de los ocho a dieciocho segundos no es una preferencia del proyecto, y se guardaba como si lo fuera. Un episodio empezado antes de la regla conservaba su techo de dieciséis —el normalizador lo respetaba porque estaba dentro del rango permitido— y con dieciséis salió una toma de cuarenta y nueve segundos. Lo que se guarda es el gusto del director, que es el objetivo; el suelo y el techo se aplican, no se leen.',
    comprobar(ctx) {
      const { normalizar, SEGMENTACION } = ctx.fn;
      const fallos = [];

      // Un proyecto de antes, con los números de antes.
      const viejo = normalizar({
        segmentacion: { segundosObjetivo: 11, segundosMaximo: 16, caracteresPorSegundo: 14.5 },
      });
      if (viejo.segmentacion.segundosMaximo !== SEGMENTACION.segundosMaximo) {
        fallos.push(`Un proyecto viejo conserva su techo de ${viejo.segmentacion.segundosMaximo}s.`);
      }
      if (viejo.segmentacion.segundosMinimo !== SEGMENTACION.segundosMinimo) {
        fallos.push(`Un proyecto viejo se queda sin suelo (${viejo.segmentacion.segundosMinimo}).`);
      }
      // Y uno saboteado a mano tampoco cuela.
      const roto = normalizar({ segmentacion: { segundosMinimo: 1, segundosMaximo: 90 } });
      if (roto.segmentacion.segundosMinimo !== SEGMENTACION.segundosMinimo) {
        fallos.push(`Un suelo de 1 segundo se acepta (${roto.segmentacion.segundosMinimo}).`);
      }
      if (roto.segmentacion.segundosMaximo !== SEGMENTACION.segundosMaximo) {
        fallos.push(`Un techo de 90 segundos se acepta (${roto.segmentacion.segundosMaximo}).`);
      }

      // El objetivo SÍ es del proyecto: es la palanca del director. Pero dentro.
      if (normalizar({ segmentacion: { segundosObjetivo: 16 } }).segmentacion.segundosObjetivo !== 16) {
        fallos.push('El objetivo deja de ser del proyecto: el director pierde la palanca de ritmo.');
      }
      const fuera = normalizar({ segmentacion: { segundosObjetivo: 29 } }).segmentacion.segundosObjetivo;
      if (fuera > SEGMENTACION.segundosMaximo) {
        fallos.push(`Un objetivo de 29s pasa entero (${fuera}): queda por encima del techo.`);
      }
      return fallos;
    },
    // Se rompe como estaba: el techo del proyecto vale si cae dentro del rango.
    romper: (ctx) =>
      conFuncion(ctx, 'normalizar', (guardado) => {
        const c = ctx.fn.normalizar(guardado);
        const suyo = Number(guardado?.segmentacion?.segundosMaximo);
        if (suyo >= 8 && suyo <= 40) c.segmentacion.segundosMaximo = suyo;
        return c;
      }),
  },

  {
    nombre: 'lo-que-dice-el-testigo-se-narra-aunque-lleve-la-marca-delante',
    dice: 'El encargo pone la marca «> » en una línea y la declaración debajo, en texto llano. El modelo escribe markdown, y en markdown una cita lleva «> » en TODAS sus líneas — que es lo que hizo, episodio entero. Con «toda línea que empieza por > es la ficha del hablante», la declaración ENTERA dejaba de narrarse: quince testimonios perdidos en un episodio sin un solo aviso, porque la cobertura seguía cuadrando —el texto estaba en un tramo, solo que en uno que no se lee—. Y encima la marca del hablante se corría al párrafo del narrador de debajo, así que el director ponía el plano del perito declarando sobre la voz del narrador. De una tanda de líneas «> » seguidas, la primera es la ficha y el resto es lo que dice.',
    comprobar(ctx) {
      const { segmentar, verificarCobertura } = ctx.fn;
      const fallos = [];
      const quien = 'El Equipo de Identificación Forense de la RCMP';
      const dice = 'La humedad del bloque preservó los huesos, pero el tejido era papilla salina por la filtración del mar.';

      // Los dos formatos: el del encargo y el que escribe el modelo.
      for (const [como, guion] of [
        ['la marca sola', `## Peritaje\n\nLos agentes acordonan la zona y esperan al forense.\n\n> ${quien}\n${dice}\n\nEl bloque se cortó esa misma tarde con sierras de diamante.`],
        ['markdown entero', `## Peritaje\n\nLos agentes acordonan la zona y esperan al forense.\n\n> ${quien}\n> ${dice}\n\nEl bloque se cortó esa misma tarde con sierras de diamante.`],
      ]) {
        const r = segmentar(guion);
        if (!verificarCobertura(guion, r).ok) fallos.push(`Con ${como} se rompe la cobertura.`);

        const narrado = r.tomas.map((t) => t.texto).join(' ');
        if (!narrado.includes('La humedad del bloque preservó')) {
          fallos.push(`Con ${como}, lo que dice el testigo NO se narra: el testimonio se pierde entero.`);
        }
        if (narrado.includes(quien)) {
          fallos.push(`Con ${como} se narra la ficha del hablante: se leería en voz alta en el documental.`);
        }
        const suya = r.tomas.find((t) => t.texto.includes('La humedad del bloque'));
        if (suya && suya.testimonio !== quien) {
          fallos.push(`Con ${como}, la toma del testimonio no sabe quién habla (${JSON.stringify(suya.testimonio)}).`);
        }
        // Y no se derrama sobre el narrador de debajo.
        const despues = r.tomas.find((t) => t.texto.includes('sierras de diamante'));
        if (despues?.testimonio) {
          fallos.push(`Con ${como}, el testimonio alcanza al narrador: saldría el perito donde habla el narrador.`);
        }
      }
      return fallos;
    },
    // Se rompe como estaba: toda línea «> » es ficha del hablante, así que lo que
    // dice el testigo no llega a ninguna toma.
    romper: (ctx) =>
      conFuncion(ctx, 'segmentar', (guion, config) => {
        const r = ctx.fn.segmentar(guion, config);
        const citadas = String(guion ?? '')
          .split('\n')
          .filter((l) => /^\s*>\s+\S/.test(l))
          .map((l) => l.replace(/^\s*>\s*/, '').trim());
        const tomas = r.tomas.filter((t) => !citadas.some((c) => c && t.texto.includes(c)));
        return { ...r, tomas: tomas.map((t, i) => ({ ...t, i })) };
      }),
  },

  {
    nombre: 'la-declaracion-de-ficcion-se-narra-y-va-la-primera',
    dice: 'La declaración de ficción vivía SOLO en la descripción del vídeo, que es donde la ve quien la busca; narrada la oye todo el mundo. Estuvo al principio —es donde la pone el canal de referencia— y duró un episodio: «¿por qué está iniciando con ese mensaje diciendo que esto es ficción? Un mensaje, más bien, al final del vídeo, no al principio». Nueve segundos de aviso legal delante del gancho es lo único que hay entre el espectador y la acción, y el gancho es donde se gana o se pierde. Al final protege igual y no se paga con la apertura. Va en su propia escena: pegada al último párrafo se metería en la toma de la duda abierta, que existe para que se discuta en los comentarios.',
    comprobar(ctx) {
      const { conDeclaracionNarrada, DECLARACION_NARRADA, segmentar } = ctx.fn;
      const fallos = [];
      const gui = fuente(ctx, 'app/fases/guion.js');

      if (!/ficci[oó]n/i.test(DECLARACION_NARRADA)) {
        fallos.push(`La declaración narrada no dice que es ficción: «${DECLARACION_NARRADA}»`);
      }

      // 1 · Se narra, va la ÚLTIMA, y no delante del gancho.
      const guion = '## Gancho\nImagina esta escena. Te han contratado para talar robles.\n\n## El cierre\nEl caso quedó cerrado. ¿Quién lo metió ahí dentro?';
      const con = conDeclaracionNarrada(guion);
      if (!con.includes(DECLARACION_NARRADA)) {
        fallos.push('El guion sale sin la declaración narrada: solo la vería quien despliegue la descripción.');
      }
      if (con.indexOf(DECLARACION_NARRADA) < con.indexOf('Imagina esta escena')) {
        fallos.push('La declaración va delante del gancho: nueve segundos de aviso legal antes de la acción.');
      }
      const r = segmentar(con);
      const suya = r.tomas.find((t) => t.texto.includes(DECLARACION_NARRADA));
      if (!suya) fallos.push('La declaración no cae en ninguna toma: no se narraría.');
      else if (suya.i !== r.tomas.length - 1) {
        fallos.push(`La declaración no es la última toma, es la ${suya.i} de ${r.tomas.length}.`);
      }
      // Y SOLA. Pegada a la duda abierta se la come: van en la misma imagen.
      else if (/¿Qui[eé]n lo metió/.test(suya.texto)) {
        fallos.push('La declaración comparte toma con la duda abierta: el aviso legal se come el cierre.');
      }

      // 2 · Y no se pone dos veces cuando se reescribe un acto y el resto venía
      // guardado.
      if (conDeclaracionNarrada(con) !== con) {
        fallos.push('Volver a pasar el guion añade la declaración otra vez.');
      }

      // 3 · La compone el código, no el modelo.
      if (!/const guion = conDeclaracionNarrada\(/.test(gui)) {
        fallos.push('El guion terminado no pasa por conDeclaracionNarrada: la declaración depende de que alguien se acuerde.');
      }
      if (new RegExp(DECLARACION_NARRADA.slice(0, 40)).test(gui.replace(/export const[\s\S]*?;\n/, ''))) {
        fallos.push('La declaración se le pide al modelo: puede salir distinta, más suave, o no salir.');
      }
      return fallos;
    },
    // Se rompe como estaba: la declaración solo en la descripción.
    romper: (ctx) => conFuncion(ctx, 'conDeclaracionNarrada', (g) => g),
  },

  {
    nombre: 'el-gancho-no-adelanta-la-fecha-el-sitio-ni-el-nombre',
    dice: '«La forma en la que se narra al principio no abre como el archivo que te compartí.» De cuatro guiones seguidos, TRES abrieron con «Eres Liam MacTiernan, y el 12 de octubre de 2024, en Port MacLeod…»: la fecha, el sitio y el nombre del protagonista en la primera frase, que es exactamente la ficha que el gancho existe para no dar. Y EL AÑO ES LA EXCEPCIÓN, que se supo leyendo el gancho real del canal —«Dentro del árbol hay una persona, un hallazgo tan inesperado como real QUE EN 2007 conmocionó a todo un condado»—: el año va, pero en el remate, porque es la escala que el remate necesita. Lo que no va nunca es el día y el mes, ni el sitio por su nombre, ni el nombre de quien hace. Así que el año se mide POR DÓNDE CAE: en la acción es ficha, en la última frase es el remate.',
    comprobar(ctx) {
      const { loQueAdelantaElGancho } = ctx.fn;
      const gui = fuente(ctx, 'app/fases/guion.js');
      const main = fuente(ctx, 'app/main.js');
      const fallos = [];
      const caso = { ciudad: 'Port MacLeod', pais: 'Canadá' };
      const con = (t) => loQueAdelantaElGancho(`## Gancho\n${t}`, caso);

      // ── 1 · CAZA LAS TRES, una por una ────────────────────────────────────
      for (const [que, texto] of [
        ['la fecha', 'Es el 12 de octubre de 2024 y el viento te azota. Retiras la madera.'],
        // Con letra, que es como lo escribe un narrador: en locución los números
        // van con letra y la fecha llegaba escrita, colándose entera.
        ['la fecha', 'Es el doce de octubre y el viento te azota. Retiras la madera.'],
        ['el año, y todavía va dentro de la acción', 'Corría el año 2024 cuando apoyaste la sonda. Retiras la madera.'],
        ['el sitio', 'El aire de Port MacLeod te azota el rostro mientras caminas.'],
        ['el nombre', 'Eres Liam MacTiernan y el viento te azota la cara.'],
      ]) {
        if (!con(texto).some((x) => x.que === que)) {
          fallos.push(`Un gancho que adelanta ${que} pasa sin más: «${texto.slice(0, 50)}…»`);
        }
      }
      // Las tres juntas, que es como salieron de verdad.
      const suyo = con('Eres Liam MacTiernan, y el 12 de octubre de 2024, el viento del Atlántico te azota la cara. Son las tres y diecisiete en Port MacLeod.');
      if (suyo.length !== 4) {
        fallos.push(`El gancho real adelantaba la fecha, el año, el sitio y el nombre, y se detectan ${suyo.length}.`);
      }

      // ── 2 · Y NO MARCA EL QUE ESTÁ BIEN ───────────────────────────────────
      // EL GANCHO REAL DEL CANAL, transcrito. Es la prueba de que la regla del
      // año está donde tiene que estar: si esto se marcara, la medida estaría
      // enseñando a escribir peor que la referencia que se copia.
      const referencia =
        'Imagina esta escena. Has sido contratado por una empresa privada para talar ' +
        'varios árboles antiguos que representan un peligro por su estado de deterioro. ' +
        'Todo parece un trabajo rutinario, hasta que al terminar de cortar uno de los ' +
        'enormes robles, notas una extraña cavidad en el tronco. Hay un trozo de madera ' +
        'podrida cubriendo el interior. Lo retiras con las manos. Y entonces llega el ' +
        'horror. Dentro del árbol hay una persona, un hallazgo tan inesperado como real ' +
        'que en 2007 conmocionó a todo un condado.';
      if (con(referencia).length) {
        fallos.push(`Se marca el gancho real del canal: ${JSON.stringify(con(referencia))}`);
      }
      // Y «3 de los trabajadores» no es una fecha. Buscar «número + de + palabra»
      // marcaba esto y se le escapaba «el doce de octubre», las dos a la vez.
      if (con('Uno de los tres trabajadores retira la madera con las manos.').length) {
        fallos.push('Se marca «uno de los tres trabajadores» como si fuera una fecha.');
      }

      // La mitad del valor: una medida que marca los ganchos buenos enseña a
      // estropearlos. Este es el cuarto, el único que cumplía.
      const bueno = 'Escuchas el pitido rítmico, monótono, de tu equipo de sónar. Es el pulso constante de tu jornada, un sonido que te ha acompañado durante los últimos doscientos bloques de hormigón.';
      if (con(bueno).length) {
        fallos.push(`Un gancho correcto se marca igual: ${JSON.stringify(con(bueno))}`);
      }
      // Ni la hora sola, que SÍ va: «son las tres y diecisiete» es acción, no ficha.
      if (con('Son las tres y diecisiete y el metal está helado.').length) {
        fallos.push('Se marca la hora del día, que es justo lo concreto que el gancho necesita.');
      }
      // Y sin caso no se inventa un sitio que nadie dijo.
      if (loQueAdelantaElGancho('## Gancho\nEl aire de Port MacLeod te azota.', null).some((x) => x.que === 'el sitio')) {
        fallos.push('Sin caso se marca un sitio: no hay con qué saber cómo se llama.');
      }

      // ── 3 · SOLO EL PRIMER ACTO ───────────────────────────────────────────
      // La fecha y el sitio SÍ van en el acto siguiente. Marcarlos ahí sería
      // pedirle al documental que no diga nunca cuándo ni dónde pasó.
      const dos = loQueAdelantaElGancho(
        '## Gancho\nEscuchas el pitido de la sonda.\n\n## Reconstrucción\nEl 12 de octubre de 2024, en Port MacLeod, Liam MacTiernan apoyó la sonda.',
        caso,
      );
      if (dos.length) fallos.push('Se mira más allá del gancho: el acto 2 tiene que poder dar la fecha y el sitio.');

      // ── 4 · Y ESTÁ ESCRITO EN EL ENCARGO, no solo comprobado ──────────────
      for (const [qué, re] of [
        ['que no van el día ni el mes', /EL DÍA Y EL MES\. Nunca/],
        ['que no va el sitio por su nombre', /EL SITIO por su nombre/],
        ['que no va el nombre de quien hace', /EL NOMBRE de quien hace/],
        ['que el año va en el remate', /El año, y solo el año, va en el remate/],
        ['que el gancho tiene acción y remate', /EL REMATE\. Llega al instante del hallazgo/],
      ]) {
        if (!re.test(gui)) fallos.push(`El encargo del gancho no dice ${qué}.`);
      }
      // Y avisa en pantalla, por el mismo sitio que lo demás.
      if (!/loQueAdelantaElGancho\(texto/.test(main)) {
        fallos.push('La pantalla no mira si el gancho adelanta nada: el aviso no llega nunca.');
      }
      return fallos;
    },
    // Se rompe como estaba: nadie mira el gancho.
    romper: (ctx) => conFuncion(ctx, 'loQueAdelantaElGancho', () => []),
  },
];
