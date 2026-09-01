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
//   RECURSOS — cada VERSIÓN de cada plano transversal: la carretera de noche
//              desde el arcén, en picado desde el talud de una curva y desde
//              dentro del coche. Tres de cada uno, y tres PLANOS distintos.
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
import { clipVigente, claveFotograma, claveClip } from '../../comun/claves.mjs';
import {
  ESTILO_DEL_CANAL,
  SIN_TEXTO_LEGIBLE,
  BARRERA_DOCUMENTAL,
  MUNDO_NEUTRO,
} from '../../comun/estilos.mjs';

/**
 * Cuánto se le pide a un clip del archivo. LO MÁS LARGO QUE DA EL GENERADOR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Estaba en seis y era una cifra puesta sin pensar. Un clip del archivo no cubre
 * UNA toma: cubre todas las tomas de ese papel en TODOS los episodios que vengan,
 * y las tomas duran hasta dieciséis segundos. Con seis segundos, el montaje tiene
 * que estirar el clip ×2,7 —cámara lenta evidente— o repetirlo, que es lo que él
 * no quiere: «no quiero que se repita el video, porque eso va a dañar la
 * continuidad».
 *
 * Ocho es el máximo de los Veo. Cuesta un tercio más POR CLIP y se paga UNA VEZ
 * para siempre; a cambio, un clip de ocho cubre una toma de veinte estirando
 * dentro del tope y sin repetir nada. `duracionMasCercana` lo baja solo si el
 * generador elegido no llega.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const SEGUNDOS_DE_CLIP = 8;

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
/**
 * EL ARCHIVO CRECE CON LO QUE SALE DE LOS EPISODIOS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Ese contenido que identifica ese caso, ¿puede ir pasando a formar parte de la
 *  biblioteca para que también se pueda reutilizar para futuros casos? El caso que
 *  estoy trabajando se basa en un pueblo costero: alguna imagen o algún clip de la
 *  costa, del pueblo en general, se puede reutilizar para casos futuros.»
 *
 * Hasta aquí el archivo tenía SOLO lo que estaba escrito en el catálogo del código:
 * veinte sitios y el reparto. Y `sincronizarBiblioteca` lo reconstruye desde ese
 * catálogo en cada carga, así que una entrada añadida a mano desaparecía al
 * recargar. Un plano de la costa se generaba, se pagaba, se aprobaba —y moría con
 * su episodio.
 *
 * Ahora el catálogo se amplía en marcha: `propios` son las entradas guardadas desde
 * un episodio, y una vez dentro se comportan igual que las que venían de fábrica.
 * El director las ve al dirigir el caso siguiente, el banco de planos las encuentra
 * por su clave, y la galería del Archivo las enseña con sus mismos botones.
 *
 * NO SE COPIA NADA. La entrada apunta al material del episodio con `heredado`, que
 * es el mecanismo de siempre y no cuesta ni un byte. Y no se queda huérfana al
 * borrar el episodio: `borrarPieza` quita la entrada del proyecto y el archivo
 * sigue en el almacén.
 *
 * Y las personas TAMBIÉN: un testigo guardado entra como una versión más de su
 * papel. Cada cara guardada engorda el reparto, y con más caras la rotación tarda
 * más en repetir — que es exactamente lo que se quiere.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const enClave = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/**
 * El nombre que sale ya escrito en el botón de guardar.
 *
 * «El nombre debe venir escrito por defecto; se supone que puede salir del prompt
 *  con el que se generó la imagen, que está describiendo qué hay en esa imagen.»
 *
 * Exacto: sale del plano, que es literalmente lo que se le pidió al generador.
 */
export function nombreDeArchivoPara(toma) {
  const p = toma?.plano || {};
  const papel = String(toma?.personaje || p.personaje || '').trim();
  if (papel) {
    // De una persona, lo que la distingue de las otras de su papel.
    const quien = String((p.sujetos || [])[0] || '').split('—').pop().trim();
    return (quien ? `${papel} · ${quien}` : papel).slice(0, 70);
  }
  return String(p.lugar || p.descripcion || '').trim().slice(0, 70);
}

/** Una entrada de archivo hecha desde una toma ya generada de un episodio. */
export function entradaDeArchivo(toma, { nombre = '', pieza, tomas, propios = [] }) {
  if (toma?.imagen !== 'ok') throw new Error('Esa toma todavía no tiene imagen que guardar.');
  // La que ya viene del archivo no se vuelve a guardar: sería la misma imagen dos
  // veces, ocupando dos sitios en la rotación de su papel.
  if (toma.heredado) throw new Error('Esa imagen ya sale del archivo.');

  const titulo = String(nombre || '').trim() || nombreDeArchivoPara(toma);
  const papel = String(toma.personaje || toma.plano?.personaje || '').trim().toLowerCase();
  const base = papel || enClave(titulo);
  if (!base) throw new Error('Ponle un nombre, o después no hay forma de encontrarla.');

  // `g` de guardada, para no chocar nunca con las `v` del catálogo.
  const variante = `g${propios.filter((p) => (p.personaje || p.recurso) === base).length + 1}`;
  return {
    clave: papel ? claveDePersona(papel, variante) : claveDeRecurso(base, variante),
    recurso: papel ? '' : base,
    personaje: papel,
    variante,
    nombre: titulo,
    // El plano CONGELADO, tal como se generó: es lo que permite rehacerla desde el
    // archivo y lo que compara el banco de planos.
    plano: toma.plano || null,
    heredado: claveFotograma(pieza, toma, tomas),
    // El clip se lleva con la imagen, si lo tiene y le corresponde.
    heredadoVid: clipVigente(toma, tomas) ? claveClip(pieza, toma, tomas) : null,
    desde: pieza,
    cuando: Date.now(),
  };
}

export function tomasDeBiblioteca({ elenco = ELENCO, recursos = RECURSOS, propios = [] } = {}) {
  const salida = [];

  for (const r of recursos) {
    for (const v of r.variantes || []) {
      salida.push({
        i: salida.length,
        escena: 0,
        texto: '',
        segundos: SEGUNDOS_DE_CLIP,
        medida: false,
        clave: claveDeRecurso(r.id, v.id),
        recurso: r.id,
        variante: v.id,
        personaje: '',
        plano: planoDeRecurso(r, v),
        tipoImagen: 'reconstruccion',
        claseVisual: 'recurso',
        // LOS RECURSOS NO LLEVAN CLIP POR DEFECTO: son fondos y objetos, y un
        // archivador quieto con un recorrido de cámara se ve bien y cuesta cero.
        // Eso es una PROPUESTA de gasto, no una prohibición: desde su ficha se le
        // puede pedir el clip a cualquiera —«todas las imágenes deben tener su
        // botón para generar el video»— y entonces esta marca se pone a mano y
        // `sincronizarBiblioteca` la conserva.
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
        segundos: SEGUNDOS_DE_CLIP,
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
        // episodios — el montaje estira el clip con `setpts` hasta cubrir la toma,
        // así que uno de ocho segundos cubre una de dieciséis sin repetirse.
        movimiento: true,
        reusa: null,
        audio: null,
        imagen: null,
        video: null,
        aprobada: false,
      });
    }
  }

  // ── Y LO GUARDADO DESDE LOS EPISODIOS ──────────────────────────────────────
  // Van al final para que las claves del catálogo conserven su orden de partida.
  // El índice de cada una lo fija `sincronizarBiblioteca` y ya no se mueve.
  for (const p of propios) {
    if (!p?.clave || !p.heredado) continue;
    salida.push({
      i: salida.length,
      escena: p.personaje ? 1 : 0,
      texto: '',
      segundos: SEGUNDOS_DE_CLIP,
      medida: false,
      clave: p.clave,
      recurso: p.recurso || '',
      variante: p.variante || 'g1',
      personaje: p.personaje || '',
      plano: p.plano || null,
      tipoImagen: 'reconstruccion',
      claseVisual: p.personaje ? 'dramatizacion' : 'recurso',
      // Lleva clip si el episodio del que salió ya lo tenía pagado. Y si no, se le
      // puede pedir desde su ficha como a cualquier otra.
      movimiento: !!p.heredadoVid,
      reusa: null,
      audio: null,
      // YA ESTÁ GENERADA Y PAGADA: viene de un episodio, y el material se apunta
      // en vez de copiarse. Y aprobada, porque para llegar aquí hubo que mirarla.
      imagen: 'ok',
      heredado: p.heredado,
      video: p.heredadoVid ? 'ok' : null,
      heredadoVid: p.heredadoVid || null,
      aprobada: true,
    });
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
    // `clipVigente` y no `video !== 'ok'`: un clip de la imagen ANTERIOR no cuenta
    // como que ya lo tiene. Con la bandera suelta, una toma cuya imagen se rehizo
    // se quedaba sin poder animarse nunca —ni desde su ficha ni desde aquí—.
    (t) => t.movimiento && t.imagen === 'ok' && t.aprobada && !clipVigente(t, tomas || []),
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
 * TODO lo que se le pide al generador para una toma de biblioteca: su plano, y el
 * encargo que llevan TODAS las imágenes del archivo.
 *
 * Lo segundo estaba fuera y era un agujero. La regla del mundo no vive en la
 * descripción de la carretera: si la huella solo mirara el plano, cambiar esa
 * regla no habría marcado nada y las imágenes generadas con el volante al revés
 * se habrían quedado ahí, aprobadas y listas para convertirse en clips. Lo que
 * hay que vigilar es el ENCARGO ENTERO.
 *
 * El archivo lleva el mundo NEUTRO, no el de ningún país: la misma cara sirve
 * para un episodio en Ohio y otro en Cusco, así que lo que se le pide es que no
 * delate ninguno. El país lo pone el episodio. Ver `mundoDelCaso`.
 */
const ENCARGO_DEL_CANAL = [ESTILO_DEL_CANAL, SIN_TEXTO_LEGIBLE, BARRERA_DOCUMENTAL, MUNDO_NEUTRO].join(' ');

/**
 * LOS ENCARGOS DE ANTES QUE SIGUEN VALIENDO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «La biblioteca ya está construida.»
 *
 * Cambiar la regla del mundo cambia el encargo, y cambiar el encargo marca como
 * desfasada TODA la biblioteca: ciento veintiséis imágenes pagadas, aprobadas
 * una a una en un teléfono, perdiendo el visto bueno de golpe por una decisión
 * mía. El aviso sería correcto y el coste, absurdo.
 *
 * Y sobre todo sería falso en la mayoría: lo que ataba un plano a un país eran
 * los uniformes, las matrículas y los carteles. Un perito con bata, un pasillo,
 * unas manos sobre una carpeta no cambian porque ahora los casos puedan pasar en
 * Rusia. Los que sí cambian —una patrulla, una fachada de comisaría— se rehacen
 * uno a uno desde su ficha, que para eso está el botón.
 *
 * Así que las huellas de los encargos anteriores se aceptan. La lista solo crece
 * y las cadenas de aquí NO SE EDITAN NUNCA: son historia, no configuración. Si se
 * toca una, la huella que reconoce deja de coincidir y vuelve el marcado masivo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const MUNDO_HISPANO_DE_ANTES =
  'EL MUNDO DE ESTE CANAL ES HISPANOHABLANTE. Los coches, las calles, los ' +
  'edificios, la ropa, los uniformes y los objetos de casa son los de una ciudad o ' +
  'un pueblo de habla hispana corriente. ' +
  'LOS VEHÍCULOS LLEVAN EL VOLANTE A LA IZQUIERDA y se circula por el carril ' +
  'DERECHO. Si se ve un salpicadero, un interior de coche o alguien al volante, el ' +
  'volante va a la IZQUIERDA. ' +
  'Nada que delate otro país: ni volante a la derecha, ni circulación por la ' +
  'izquierda, ni cabinas, buzones, autobuses escolares, señales, semáforos, ' +
  'matrículas, enchufes o furgones policiales con forma de otro sitio. ' +
  'Y NO ES UNA POSTAL: nada de folclore, ni color turístico, ni tópicos. Es un ' +
  'sitio corriente y trabajado, de los que a cualquiera le suenan a su barrio.';

export const ENCARGOS_ANTERIORES = [
  [ESTILO_DEL_CANAL, SIN_TEXTO_LEGIBLE, BARRERA_DOCUMENTAL, MUNDO_HISPANO_DE_ANTES].join(' '),
];

/**
 * La huella de lo que se le pidió al generador: un resumen corto del encargo.
 *
 * Sirve para una sola cosa, y es la que faltaba: SABER QUE EL ENCARGO CAMBIÓ
 * DEBAJO DE UNA IMAGEN YA PAGADA. `sincronizarBiblioteca` vuelve a sacar el plano
 * del catálogo en cada carga y conserva lo generado, así que reescribir una
 * variante —o una regla del canal— dejaba una imagen que ya no es lo que se pide,
 * con su visto bueno puesto y lista para convertirse en un clip caro. Sin la
 * huella eso no se ve: la toma sigue marcada como `ok` y no hay con qué comparar.
 *
 * No es criptografía y no lo necesita: solo tiene que cambiar cuando cambia el
 * encargo. `encargo` se pasa aparte para poder comprobar justo eso.
 */
export function huellaDePlano(plano, encargo = ENCARGO_DEL_CANAL) {
  const texto = [plano?.encuadre, plano?.lugar, plano?.luz, plano?.descripcion, encargo].join('|');
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Deja la biblioteca al día DENTRO de la lista de piezas, SIN CAMBIAR DE OBJETO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Dice que generó dos imágenes, pero es mentira, solo generó una.»
 *
 * Esto vivía en la pantalla y hacía `piezas[k] = z`: SUSTITUÍA la pieza por una
 * nueva. Y se llama desde todo lo que toca el archivo —aprobar una imagen,
 * rehacerla, pedirle un clip—. Así que aprobar una imagen MIENTRAS corría la
 * tanda de generación dejaba a la tanda escribiendo en el objeto viejo, ya
 * desligado del proyecto:
 *
 *   · la imagen se generaba,
 *   · se pagaba,
 *   · se subía al almacén,
 *   · y la anotación se perdía. En silencio.
 *
 * La tanda seguía contando —«2 de 126»— porque para ella habían salido bien las
 * dos, y en la pantalla aparecía una, porque solo una había llegado al proyecto.
 *
 * Se arregla por donde tiene que arreglarse: NADIE cambia el objeto. Se vuelcan
 * los campos DENTRO del que ya está —`tomas` incluido, en su sitio— así que
 * cualquier referencia cogida antes sigue apuntando a la pieza de verdad. Y vive
 * AQUÍ, junto a `sincronizarBiblioteca`, porque es una regla del modelo de datos
 * y no de la pantalla: en la pantalla no se podía ni comprobar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function sincronizarEnSitio(piezas, propios = []) {
  const previa = (piezas || []).find((z) => z.esBiblioteca) || null;
  const z = sincronizarBiblioteca(previa, propios);
  if (!previa) {
    piezas.push(z);
    return z;
  }
  for (const [k, v] of Object.entries(z)) {
    if (k !== 'tomas') previa[k] = v;
  }
  previa.tomas.length = 0;
  previa.tomas.push(...z.tomas);
  return previa;
}

export function sincronizarBiblioteca(pieza, propios = []) {
  const previas = new Map((pieza?.tomas || []).filter((t) => t.clave).map((t) => [t.clave, t]));
  let siguiente = Math.max(-1, ...[...previas.values()].map((t) => Number(t.i) || 0)) + 1;

  const tomas = tomasDeBiblioteca({ propios }).map((nueva) => {
    const huella = huellaDePlano(nueva.plano);
    const vieja = previas.get(nueva.clave);
    if (!vieja) return { ...nueva, huella, i: siguiente++ };

    // ¿SIGUE PIDIENDO EL CATÁLOGO LO QUE SE GENERÓ? Una toma sin huella guardada es
    // de antes de que esto existiera: se le pone la de ahora y se la da por buena,
    // porque suponer que todo lo pagado está desfasado sería peor que no mirar.
    //
    // Y vale también la huella de un ENCARGO ANTERIOR: cambiar la regla del mundo
    // no puede tirar el visto bueno de todo el archivo de una vez. Ver
    // `ENCARGOS_ANTERIORES`.
    const valeTambien = ENCARGOS_ANTERIORES.map((e) => huellaDePlano(nueva.plano, e));
    const reconocida = vieja.huella === huella || valeTambien.includes(vieja.huella);
    const desfasada = !!vieja.huella && !reconocida && vieja.imagen === 'ok';
    // Se conserva EL ÍNDICE y LO GENERADO; el plano vuelve a salir del catálogo,
    // que es la fuente de verdad de cómo se ve cada persona.
    return {
      ...nueva,
      i: vieja.i,
      huella,
      // EL MOVIMIENTO QUE SE PIDIÓ A MANO NO SE PIERDE. El catálogo dice dónde
      // gastar POR DEFECTO —el reparto sí, los sitios no—, pero cualquier imagen
      // puede pasar a clip desde su ficha, y eso marca la toma. Si aquí se
      // recompusiera desde el catálogo, un archivador animado a mano volvería a
      // «sin movimiento» en la siguiente carga y el montaje pondría la foto fija
      // teniendo el clip pagado al lado.
      movimiento: vieja.movimiento === true || nueva.movimiento,
      imagen: vieja.imagen || null,
      video: vieja.video || null,
      heredado: vieja.heredado || null,
      heredadoVid: vieja.heredadoVid || null,
      // Y LOS NÚMEROS QUE DICEN SI EL CLIP ES DE ESTA IMAGEN. Esta lista es
      // blanca: lo que no se nombre aquí desaparece en la siguiente carga. Sin
      // estas dos líneas, un clip de la imagen descartada volvía a darse por bueno
      // en cuanto se recargaba la aplicación —el fallo entero, resucitado por la
      // puerta de atrás—. Ver `clipVigente`.
      versionImagen: Number(vieja.versionImagen) || 0,
      versionClip: Number(vieja.versionClip) || 0,
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
