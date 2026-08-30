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
//   REPARTO  — un plano por arquetipo de personaje y por género. El perito en su
//              laboratorio, el detective en su despacho, el testigo en su cocina,
//              la familiar en su salón. Declarando, mudos: la voz es siempre la
//              del narrador, así que en pantalla se ve a alguien hablando y se
//              oye al narrador — que es como funciona la referencia.
//   RECURSOS — los planos transversales que sirven a todos los géneros: la
//              carretera de noche, el precinto, el archivador, las manos pasando
//              hojas de un expediente.
//
// Lo que cuesta: se paga UNA VEZ, para todos los episodios que vengan. Un
// episodio de treinta minutos con 165 tomas pasa de unas 144 imágenes a unas 45
// cuando los motivos van a 15–20 × 5–8 y la biblioteca cubre un cuarto.
// ─────────────────────────────────────────────────────────────────────────────

import { GENEROS, RECURSOS } from '../../comun/generos.mjs';

/** La pieza de la biblioteca se llama así y no cambia nunca. */
export const ID_BIBLIOTECA = 'biblioteca';

/**
 * Las tomas de la biblioteca, compuestas desde el catálogo.
 *
 * DETERMINISTA sobre el catálogo, y eso es lo que la hace utilizable: añadir un
 * género añade sus arquetipos al final y no mueve ni un índice de los que ya
 * están. Si los índices se movieran, las claves de todo lo ya generado apuntarían
 * a otro plano y habría que volver a pagar la biblioteca entera.
 *
 * Por eso el orden es: primero los recursos —que son fijos y no dependen de
 * cuántos géneros haya— y después los arquetipos, género por género en el orden
 * del catálogo.
 */
export function tomasDeBiblioteca({ generos = GENEROS, recursos = RECURSOS } = {}) {
  const salida = [];

  for (const r of recursos) {
    salida.push({
      i: salida.length,
      escena: 0,
      texto: '',
      segundos: 6,
      medida: false,
      clave: `recurso:${r.id}`,
      recurso: r.id,
      personaje: '',
      plano: {
        encuadre: r.encuadre,
        movimientoCamara: 'fijo',
        lugar: r.lugar,
        luz: r.luz,
        sujetos: [],
        descripcion: r.descripcion,
        personaje: '',
      },
      // Un recurso es un plano de recurso: paisaje, objeto, textura. Sin gente.
      tipoImagen: 'reconstruccion',
      claseVisual: 'recurso',
      // LOS RECURSOS NO LLEVAN CLIP. Son fondos y objetos: un archivador quieto
      // con un recorrido de cámara se ve igual de bien y cuesta cero.
      movimiento: false,
      reusa: null,
      audio: null,
      imagen: null,
      video: null,
    });
  }

  for (const g of generos) {
    for (const p of g.personajes || []) {
      salida.push({
        i: salida.length,
        escena: 1,
        texto: '',
        segundos: 6,
        medida: false,
        clave: `personaje:${g.id}:${p.id}`,
        recurso: '',
        // La clave por la que un episodio lo encuentra. Se guarda en minúsculas
        // porque es lo que escribe el director y lo que compara la herencia: dos
        // grafías del mismo arquetipo son dos planos pagados donde bastaba uno.
        personaje: String(p.id).toLowerCase(),
        genero: g.id,
        plano: {
          encuadre: p.plano.encuadre,
          movimientoCamara: 'fijo',
          lugar: p.plano.lugar,
          luz: p.plano.luz,
          sujetos: [p.nombre],
          descripcion: p.plano.descripcion,
          personaje: String(p.id).toLowerCase(),
        },
        tipoImagen: 'reconstruccion',
        claseVisual: 'dramatizacion',
        // LOS ARQUETIPOS SÍ LLEVAN CLIP, y es la inversión que da sentido a todo
        // esto: un plano de alguien declarando tiene que MOVERSE o se nota que es
        // una foto. Se paga una vez y sirve para todos sus testimonios de todos
        // los episodios — el montaje repite la entrada con `-stream_loop -1`, así
        // que un clip de seis segundos cubre una toma de veinticinco.
        movimiento: true,
        reusa: null,
        audio: null,
        imagen: null,
        video: null,
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
  return {
    total: lista.length,
    recursos: lista.filter((t) => t.recurso).length,
    personajes: lista.filter((t) => t.personaje).length,
    imagenesFaltan: lista.filter((t) => t.imagen !== 'ok').length,
    clips: conClip.length,
    clipsFaltan: conClip.filter((t) => t.video !== 'ok').length,
  };
}

/**
 * La pieza de biblioteca, creada o puesta al día.
 *
 * Se llama al abrirla y cada vez que crece el catálogo. NO PISA lo ya generado:
 * las tomas que existen conservan su estado —`imagen: 'ok'`, `video: 'ok'`— y
 * solo se añaden las que faltan. Volver a abrir la biblioteca después de añadir
 * un género no puede costar dinero por sí solo.
 */
export function sincronizarBiblioteca(pieza) {
  const previas = new Map((pieza?.tomas || []).map((t) => [t.clave, t]));
  const tomas = tomasDeBiblioteca().map((nueva) => {
    const vieja = previas.get(nueva.clave);
    if (!vieja) return nueva;
    // Se conserva LO GENERADO y lo heredado; el plano vuelve a salir del
    // catálogo, que es la fuente de verdad de cómo se ve cada arquetipo.
    return {
      ...nueva,
      imagen: vieja.imagen || null,
      video: vieja.video || null,
      heredado: vieja.heredado || null,
      heredadoVid: vieja.heredadoVid || null,
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
    tomas,
  };
}
