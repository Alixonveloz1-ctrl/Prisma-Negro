// La biblioteca permanente del canal.
//
// ─────────────────────────────────────────────────────────────────────────────
// EL MECANISMO YA EXISTÍA Y NO LO USABA NADIE.
//
// En `claves.mjs`, una toma con `heredado` apunta a la imagen de OTRA PIEZA, con
// la clave entera dentro, y se mira ANTES que `reusa` «porque la imagen ya existe
// y ya está pagada». Eso es, literalmente, una biblioteca entre episodios. Lo
// único que faltaba era que alguien la llenara a propósito en vez de esperar a
// que dos casos coincidieran por casualidad.
//
// Esto la llena. La biblioteca es una PIEZA como las demás —sus tomas se dirigen
// solas desde el catálogo, sus imágenes y sus clips se generan con las fases de
// siempre— con dos diferencias:
//
//   · No se monta nunca. No tiene guion, no tiene voz, no tiene música. Genera
//     material y ya.
//   · Sus claves viven bajo `biblioteca/`, no bajo `pNN/`, así que no chocan con
//     ninguna pieza y no se pierden al reescribir un caso.
//
// Dos secciones:
//
//   REPARTO  — CADA PERSONA del elenco del canal. No un perito: los cinco. No un
//              testigo: los veinte. Declarando, mudos: la voz es siempre la del
//              narrador, así que en pantalla se ve a alguien hablando y se oye al
//              narrador — que es como funciona la referencia.
//   RECURSOS — cada VERSIÓN de cada plano transversal: la carretera de noche con
//              llovizna, con niebla y de madrugada. Tres de cada uno.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ VARIAS VERSIONES, Y NO UNA
//
// «Hay que tener por lo menos cinco policías, cinco doctores, cinco peritos, al
//  menos unos veinte testigos… si en un documental utilizó un policía, por lo
//  menos en los dos siguientes no debe utilizar el mismo.»
//
// Una biblioteca con un perito resuelve el coste y crea un problema peor: el
// mismo señor aparece en el episodio 3, en el 4 y en el 5 hablando de casos
// distintos. Eso se ve a la primera y convierte el canal en una plantilla.
//
// Por eso el elenco tiene varias personas por papel y cada recurso varias
// versiones, y la elección de cuál toca NO ES LA PRIMERA NI AL AZAR: se lleva un
// registro de qué usó cada episodio y se rota (ver `elegirVariante`).
// ─────────────────────────────────────────────────────────────────────────────

import {
  ELENCO,
  RECURSOS,
  EPISODIOS_SIN_REPETIR,
  planoDeVariante,
  planoDeRecurso,
} from '../../comun/elenco.mjs';

/** La pieza de la biblioteca se llama así y no cambia nunca. */
export const ID_BIBLIOTECA = 'biblioteca';

/** `perito` + `v3` → `personaje:perito:v3`. La clave que ata una toma a su entrada. */
export const claveDePersona = (arquetipo, variante) => `personaje:${arquetipo}:${variante}`;
export const claveDeRecurso = (recurso, variante) => `recurso:${recurso}:${variante}`;

/**
 * Las tomas de la biblioteca, compuestas desde el catálogo.
 *
 * El orden es solo el de partida: quien manda sobre el índice de cada toma es
 * `sincronizarBiblioteca`, que conserva el de las claves que ya existen. Sin eso,
 * añadir una persona a un papel movería el índice de todas las de después y todo
 * lo ya pagado apuntaría a otra cara.
 */
export function tomasDeBiblioteca({ elenco = ELENCO, recursos = RECURSOS } = {}) {
  const salida = [];

  for (const r of recursos) {
    for (const v of r.variantes || []) {
      salida.push({
        i: salida.length,
        escena: 0,
        texto: '',
        segundos: 6,
        medida: false,
        clave: claveDeRecurso(r.id, v.id),
        recurso: r.id,
        variante: v.id,
        personaje: '',
        plano: planoDeRecurso(r, v),
        tipoImagen: 'reconstruccion',
        claseVisual: 'recurso',
        // LOS RECURSOS NO LLEVAN CLIP. Son fondos y objetos: un archivador quieto
        // con un recorrido de cámara se ve igual de bien y cuesta cero.
        movimiento: false,
        reusa: null,
        audio: null,
        imagen: null,
        video: null,
        // El visto bueno. Ver `clipsPosibles`: sin esto, un archivador deforme se
        // queda deforme para siempre en todos los episodios del canal.
        aprobada: false,
      });
    }
  }

  for (const a of elenco) {
    for (const v of a.variantes || []) {
      salida.push({
        i: salida.length,
        escena: 1,
        texto: '',
        segundos: 6,
        medida: false,
        clave: claveDePersona(a.id, v.id),
        recurso: '',
        variante: v.id,
        // La clave por la que un episodio lo encuentra. En minúsculas porque es lo
        // que escribe el director y lo que compara la herencia: dos grafías del
        // mismo papel son dos planos pagados donde bastaba uno.
        personaje: String(a.id).toLowerCase(),
        plano: { ...planoDeVariante(a, v), personaje: String(a.id).toLowerCase() },
        tipoImagen: 'reconstruccion',
        claseVisual: 'dramatizacion',
        // EL REPARTO SÍ LLEVA CLIP, y es la inversión que da sentido a todo esto:
        // un plano de alguien declarando tiene que MOVERSE o se nota que es una
        // foto. Se paga una vez y sirve para todos sus testimonios de todos los
        // episodios — el montaje repite la entrada con `-stream_loop -1`, así que
        // un clip de seis segundos cubre una toma de veinticinco.
        movimiento: true,
        reusa: null,
        audio: null,
        imagen: null,
        video: null,
        aprobada: false,
      });
    }
  }

  return salida;
}

/**
 * Cuánto queda por generar de la biblioteca, y cuánto cuesta.
 *
 * Se enseña ANTES de gastar, como todas las fases: es la inversión más grande de
 * una sola vez que hace este proyecto, y hay que poder mirarla antes de decidir.
 */
export function resumenBiblioteca(tomas, { bibliotecaConVideo = true } = {}) {
  const lista = tomas || [];
  const conClip = lista.filter((t) => t.movimiento && bibliotecaConVideo);
  const hechas = lista.filter((t) => t.imagen === 'ok');
  return {
    total: lista.length,
    recursos: lista.filter((t) => t.recurso).length,
    personajes: lista.filter((t) => t.personaje).length,
    papeles: new Set(lista.filter((t) => t.personaje).map((t) => t.personaje)).size,
    sitios: new Set(lista.filter((t) => t.recurso).map((t) => t.recurso)).size,
    imagenesFaltan: lista.filter((t) => t.imagen !== 'ok').length,
    // Generada NO es lo mismo que buena. Estas dos cifras separan «la máquina
    // contestó» de «la miré y vale», que es justo lo que faltaba.
    aprobadas: hechas.filter((t) => t.aprobada).length,
    porRevisar: hechas.filter((t) => !t.aprobada).length,
    clips: conClip.length,
    clipsFaltan: conClip.filter((t) => t.video !== 'ok').length,
    clipsPosibles: clipsPosibles(lista, { bibliotecaConVideo }).length,
  };
}

/**
 * De qué se puede generar clip AHORA MISMO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Se manda a generar los clips, ¿y de dónde van a salir los clips? Primero se
 *  deben generar las imágenes. Si yo veo que la imagen está correcta, pues le
 *  genero clip.»
 *
 * Tenía toda la razón, y era peor de lo que parecía. El botón de clips cogía toda
 * toma con `movimiento`, mirara o no si su imagen existía y mirara o no si la
 * imagen era buena. Un clip es la fase MÁS CARA de todas y sale DE la imagen: si
 * la imagen tiene tres manos, el clip tiene tres manos moviéndose, se paga igual,
 * y encima queda en la biblioteca permanente del canal para todos los episodios
 * que vengan.
 *
 * Así que hacen falta las tres condiciones, y no una:
 *   1. La imagen EXISTE. Sin imagen no hay clip: no hay de dónde sacarlo.
 *   2. La imagen está APROBADA — vista por una persona, con el pulgar arriba.
 *   3. No tiene clip ya. Volver a pedirlo es pagarlo dos veces.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function clipsPosibles(tomas, { bibliotecaConVideo = true } = {}) {
  if (!bibliotecaConVideo) return [];
  return (tomas || []).filter(
    (t) => t.movimiento && t.imagen === 'ok' && t.aprobada && t.video !== 'ok',
  );
}

/**
 * La pieza de biblioteca, creada o puesta al día.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL ÍNDICE DE UNA TOMA YA GENERADA NO SE MUEVE NUNCA.
 *
 * La clave de un archivo es `biblioteca/tNNN/img`, y NNN es el índice de la toma.
 * Si al añadir una persona al elenco los índices se recolocaran, la toma que
 * antes era el perito Salgado pasaría a ser otra cara y todo lo pagado apuntaría
 * al sitio equivocado — sin dar ningún error, que es lo peor: saldría el episodio
 * con el perito cambiado a mitad.
 *
 * Así que quien manda es lo GUARDADO: cada clave conserva el índice que ya tenía,
 * y las claves nuevas se numeran a partir del mayor. El catálogo se puede
 * reordenar entero sin que pase nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/**
 * La huella del plano de una toma: un resumen corto de lo que se le pidió al
 * generador.
 *
 * Sirve para una sola cosa, y es la que faltaba: SABER QUE EL CATÁLOGO CAMBIÓ
 * DEBAJO DE UNA IMAGEN YA PAGADA. `sincronizarBiblioteca` vuelve a sacar el plano
 * del catálogo en cada carga y conserva lo generado, así que reescribir una
 * variante dejaba una imagen diciendo «carretera con niebla» donde el catálogo ya
 * pedía otra cosa —y con su visto bueno puesto, lista para convertirse en un clip
 * caro de algo que ya nadie pide—. Sin la huella eso no se ve: la toma sigue
 * marcada como `ok` y no hay con qué comparar.
 *
 * No es criptografía y no lo necesita: solo tiene que cambiar cuando cambia el
 * plano.
 */
export function huellaDePlano(plano) {
  const texto = [plano?.encuadre, plano?.lugar, plano?.luz, plano?.descripcion].join('|');
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function sincronizarBiblioteca(pieza) {
  const previas = new Map((pieza?.tomas || []).filter((t) => t.clave).map((t) => [t.clave, t]));
  let siguiente = Math.max(-1, ...[...previas.values()].map((t) => Number(t.i) || 0)) + 1;

  const tomas = tomasDeBiblioteca().map((nueva) => {
    const huella = huellaDePlano(nueva.plano);
    const vieja = previas.get(nueva.clave);
    if (!vieja) return { ...nueva, huella, i: siguiente++ };

    // ¿SIGUE PIDIENDO EL CATÁLOGO LO QUE SE GENERÓ? Una toma sin huella guardada es
    // de antes de que esto existiera: se le pone la de ahora y se la da por buena,
    // porque suponer que todo lo pagado está desfasado sería peor que no mirar.
    const desfasada = !!vieja.huella && vieja.huella !== huella && vieja.imagen === 'ok';
    // Se conserva EL ÍNDICE y LO GENERADO; el plano vuelve a salir del catálogo,
    // que es la fuente de verdad de cómo se ve cada persona.
    return {
      ...nueva,
      i: vieja.i,
      huella,
      imagen: vieja.imagen || null,
      video: vieja.video || null,
      heredado: vieja.heredado || null,
      heredadoVid: vieja.heredadoVid || null,
      desfasada,
      // El visto bueno se conserva, pero SOLO mientras haya imagen que avale y el
      // catálogo siga pidiendo lo mismo. Un «aprobada» sobre una imagen que ya no
      // está —o que ya no es lo que se pide— diría que alguien miró algo que no
      // existe, y con eso se podría pagar un clip a ciegas.
      aprobada: vieja.imagen === 'ok' && vieja.aprobada === true && !desfasada,
    };
  });

  return {
    ...(pieza || {}),
    id: ID_BIBLIOTECA,
    titulo: 'Biblioteca del canal',
    esBiblioteca: true,
    // Sin guion, sin voz, sin música: no se monta nunca.
    guion: '',
    escenas: [
      { n: 0, titulo: 'Recursos' },
      { n: 1, titulo: 'Reparto' },
    ],
    tomas: tomas.sort((a, b) => a.i - b.i),
  };
}

/**
 * Cuál de las versiones toca en este episodio.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Si en un documental utilizó un policía, por lo menos en los dos siguientes no
 *  debe utilizar el mismo, debe utilizar otro. Y así.»
 *
 * Dos reglas, en este orden:
 *
 *   1. NO SE REPITE lo que se usó en los últimos `EPISODIOS_SIN_REPETIR`
 *      episodios. Es una prohibición dura, no una preferencia.
 *   2. Entre las que quedan, la MENOS USADA en toda la historia del canal, y a
 *      igualdad la que lleva más tiempo sin salir. Sin esto, la número 1 saldría
 *      siempre que estuviera permitida y las últimas del elenco no saldrían nunca.
 *
 * Y si la prohibición no deja ninguna —porque el papel tiene menos personas que
 * episodios de margen—, se afloja en vez de fallar: se coge la que lleva más
 * tiempo sin salir. Quedarse sin plano por una regla de reparto sería cambiar un
 * problema estético por uno que rompe el episodio.
 *
 * DETERMINISTA sobre `(disponibles, historial, pieza)`: el mismo proyecto da
 * siempre el mismo reparto, así que volver a dirigir no cambia quién sale.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `historial` es `{ [idPieza]: { [clave]: idVariante } }` y `orden` la lista de
 * episodios del más viejo al más nuevo.
 */
export function elegirVariante({
  clave,
  disponibles,
  historial = {},
  orden = [],
  pieza = '',
  sinRepetir = EPISODIOS_SIN_REPETIR,
}) {
  const lista = (disponibles || []).filter(Boolean);
  if (!lista.length) return null;

  // Si este episodio ya eligió, MANDA LO ELEGIDO. Volver a dirigir no puede
  // cambiar la cara del perito a mitad de un episodio ya generado.
  const yaElegida = historial?.[pieza]?.[clave];
  const anterior = lista.find((v) => v.id === yaElegida);
  if (anterior) return anterior;

  // Los episodios anteriores a este, del más nuevo al más viejo.
  const previos = orden.filter((z) => z !== pieza);
  const recientes = previos.slice(-sinRepetir);
  const prohibidas = new Set(recientes.map((z) => historial?.[z]?.[clave]).filter(Boolean));

  const usos = new Map(lista.map((v) => [v.id, 0]));
  const ultimoUso = new Map(lista.map((v) => [v.id, -1]));
  previos.forEach((z, n) => {
    const v = historial?.[z]?.[clave];
    if (v === undefined || !usos.has(v)) return;
    usos.set(v, usos.get(v) + 1);
    ultimoUso.set(v, n);
  });

  const mejor = (candidatas) =>
    [...candidatas].sort(
      (a, b) =>
        usos.get(a.id) - usos.get(b.id) ||
        ultimoUso.get(a.id) - ultimoUso.get(b.id) ||
        lista.indexOf(a) - lista.indexOf(b),
    )[0];

  const permitidas = lista.filter((v) => !prohibidas.has(v.id));
  return mejor(permitidas.length ? permitidas : lista);
}

/** El reparto de un episodio, en texto, para poder enseñarlo. */
export function repartoDe(historial, pieza) {
  return Object.entries(historial?.[pieza] || {}).map(([clave, variante]) => `${clave} → ${variante}`);
}
