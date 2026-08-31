// El contexto de la auditoría.
//
// Reúne todo lo que las invariantes necesitan mirar: el árbol de fuentes, y un
// montaje completo hecho con datos sintéticos. Lo segundo es lo que permite
// comprobar afirmaciones sobre el guion de ffmpeg sin generar ni un segundo de
// video de verdad (§10, el consejo que ahorra días).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const CARPETAS = ['api', 'app', 'comun', 'montador', 'auditoria', 'banco'];
const EXTENSIONES = ['.js', '.mjs', '.sh', '.html', '.json'];
// Sin extensión pero muy leídos por la auditoría. El Dockerfile faltaba, y la
// invariante que comprueba que el contenedor no lleva credenciales estaba pasando
// sobre un archivo que ni siquiera se había leído: lo cazó `--romper`.
const SUELTOS = ['Dockerfile'];
const IGNORAR = ['node_modules', '.git', '.vercel', 'salida'];

function recorrer(dir, salida) {
  for (const nombre of readdirSync(dir)) {
    if (IGNORAR.includes(nombre)) continue;
    const ruta = join(dir, nombre);
    const st = statSync(ruta);
    if (st.isDirectory()) recorrer(ruta, salida);
    else if (EXTENSIONES.some((e) => nombre.endsWith(e)) || SUELTOS.includes(nombre)) {
      salida.set(relative(RAIZ, ruta), readFileSync(ruta, 'utf8'));
    }
  }
}

export function leerFuentes() {
  const salida = new Map();
  for (const c of CARPETAS) {
    try {
      recorrer(join(RAIZ, c), salida);
    } catch {
      /* la carpeta puede no existir todavía */
    }
  }
  for (const suelto of ['index.html', 'package.json', 'vercel.json', '.env.example']) {
    try {
      salida.set(suelto, readFileSync(join(RAIZ, suelto), 'utf8'));
    } catch {
      /* opcional */
    }
  }
  return salida;
}

/**
 * Un proyecto sintético: tomas con movimiento y sin él, reutilización de
 * fotogramas, varias escenas con música. Lo bastante variado para que el guion de
 * ffmpeg ejercite todos los caminos.
 */
export function proyectoDePrueba() {
  const tomas = [];
  for (let i = 0; i < 12; i++) {
    tomas.push({
      i,
      escena: i < 5 ? 0 : i < 9 ? 1 : 2,
      texto: `Texto de la toma ${i}. Una frase más para darle cuerpo.`,
      segundos: 4 + (i % 5),
      medida: true,
      plano: {
        encuadre: 'plano general',
        movimientoCamara: ['fijo', 'acercamiento lento', 'paneo derecha', 'alejamiento lento'][i % 4],
        lugar: i < 5 ? 'el puerto' : 'la sala del archivo',
        luz: 'luz de tarde',
        sujetos: [],
        descripcion: `Descripción visual de la toma ${i}.`,
      },
      // Dos tomas comparten fotograma: dos tomas con el mismo plano no se pagan dos
      // veces (§3), y el guion tiene que apuntar al fotograma de la dueña.
      reusa: i === 3 ? 1 : i === 7 ? 5 : null,
      movimiento: i === 2 || i === 10,
      audio: 'ok',
      imagen: 'ok',
      // La 2 tiene su clip PAGADO; la 10 lo lleva solo PROPUESTO. Las dos formas
      // existen en un proyecto real y la hoja las trata distinto: la 10 se monta
      // con su imagen y su recorrido de cámara, no exigiendo un clip que nadie
      // decidió pagar.
      video: i === 2 ? 'ok' : null,
      tipoImagen: 'reconstruccion',
    });
  }
  return {
    id: 'p01',
    tomas,
    escenas: [
      { n: 0, titulo: 'El puerto' },
      { n: 1, titulo: 'El archivo' },
      { n: 2, titulo: 'La sentencia' },
    ],
  };
}

export async function construirContexto() {
  const { construirHoja, guionFfmpeg, clavesDeLaHoja, componerManifiesto } = await import(
    '../comun/hoja.mjs'
  );
  const { PREDETERMINADA } = await import('../app/config.js');
  const { NOMBRES } = await import('../api/_lib/entorno.js');
  const { CATALOGO } = await import('../comun/modelos.mjs');
  const p = proyectoDePrueba();
  const hoja = construirHoja({ pieza: p.id, tomas: p.tomas, escenas: p.escenas });

  return {
    raiz: RAIZ,
    fuentes: leerFuentes(),
    proyecto: p,
    hoja,
    guion: guionFfmpeg(hoja),
    claves: clavesDeLaHoja(hoja),
    manifiesto: componerManifiesto(hoja, (c) => `gs://ALMACEN/prefijo/${c}`),
    // Los valores vivos entran en el contexto en vez de importarse dentro de cada
    // invariante. Así una invariante que mira un valor por defecto TAMBIÉN se puede
    // romper a propósito, que es la regla de oro del §9: una comprobación que nunca
    // ha fallado no está comprobando nada.
    config: structuredClone(PREDETERMINADA),
    // La tabla de alias de variables de entorno. Entra por el contexto para que se
    // pueda sabotear: desde que la configuración se lee por tabla en vez de con
    // `process.env.X` literales, comprobar solo los literales no comprobaba nada.
    nombresEntorno: structuredClone(NOMBRES),
    // La tabla de generadores. Entra por el contexto por lo mismo: una invariante
    // que la mira importándola no puede romperse a propósito, y salía «ciega».
    catalogo: structuredClone(CATALOGO),
    // Las funciones puras entran por el contexto en vez de importarse dentro de cada
    // invariante. Así una invariante que comprueba un COMPORTAMIENTO también se
    // puede romper a propósito: se le cambia la función por una averiada y tiene que
    // cazarla. Sin esto, esas invariantes no se podían demostrar y salían marcadas
    // como ciegas — que es exactamente lo que pasó la primera vez.
    fn: await funcionesPuras(),
  };
}

async function funcionesPuras() {
  const seg = await import('../comun/segmentar.mjs');
  const cla = await import('../comun/claves.mjs');
  const hoj = await import('../comun/hoja.mjs');
  const cfg = await import('../app/config.js');
  const est = await import('../app/estado.js');
  const mod = await import('../comun/modelos.mjs');
  const dir = await import('../app/fases/direccion.js');
  const gui = await import('../app/fases/guion.js');
  const img = await import('../app/fases/imagen.js');
  const mov = await import('../app/fases/movimiento.js');
  const inv = await import('../app/fases/investigacion.js');
  const bib = await import('../app/fases/biblioteca.js');
  const aud = await import('../comun/audio.mjs');
  const mus = await import('../app/fases/musica.js');
  const nar = await import('../app/fases/narracion.js');
  const met = await import('../app/fases/metadatos.js');
  const est2 = await import('../comun/estilos.mjs');
  const gen = await import('../comun/generos.mjs');
  // El proveedor se importa entero para poder EJECUTAR lo que no llama a la nube
  // —normalizar el WAV que devuelve el servicio de voz, por ejemplo—: mirarlo en
  // el texto fuente no habría cazado que un tamaño declarado a cero deja el audio
  // sin una sola muestra.
  const prv = await import('../api/_lib/proveedor.js');
  const zip = await import('../comun/zip.mjs');
  return {
    normalizarWav: prv.normalizarWav,
    armarZip: zip.armarZip,
    crc32: zip.crc32,
    cabeEnZip: zip.cabeEnZip,
    atmosferaDe: mus.atmosferaDe,
    planificarNarracion: nar.planificar,
    // El aspecto del canal. Entra por el contexto para que una invariante pueda
    // comprobar qué sale de verdad en la instrucción sin importarlo.
    ESTILO_DEL_CANAL: est2.ESTILO_DEL_CANAL,
    // Y el catálogo de géneros, por lo mismo y con más motivo: la tabla va a
    // crecer con géneros que todavía no existen, y lo que hay que comprobar es
    // que CADA UNO se sostiene, no que el primero está bien escrito.
    GENEROS: gen.GENEROS,
    GENERO_POR_DEFECTO: gen.GENERO_POR_DEFECTO,
    RECURSOS: gen.RECURSOS,
    ELENCO: gen.ELENCO,
    arquetipoPorId: gen.arquetipoPorId,
    recursoPorId: gen.recursoPorId,
    personajesDe: gen.personajesDe,
    planoDeVariante: gen.planoDeVariante,
    planoDeRecurso: gen.planoDeRecurso,
    sitioDeVariante: gen.sitioDeVariante,
    VERSIONES_MINIMAS: gen.VERSIONES_MINIMAS,
    SITIOS_MINIMOS: gen.SITIOS_MINIMOS,
    EPISODIOS_SIN_REPETIR: gen.EPISODIOS_SIN_REPETIR,
    generoPorId: gen.generoPorId,
    repartirPorTramos: dir.repartirPorTramos,
    repartirMotivos: dir.repartirMotivos,
    SEPARACION_MINIMA: dir.SEPARACION_MINIMA,
    actosDe: gui.actosDe,
    huellaDeActos: gui.huellaDeActos,
    escribirGuion: gui.escribirGuion,
    sistemaDelGuion: gui.sistemaDelGuion,
    dirigir: dir.dirigir,
    heredables: img.heredables,
    tomasDeBiblioteca: bib.tomasDeBiblioteca,
    sincronizarBiblioteca: bib.sincronizarBiblioteca,
    resumenBiblioteca: bib.resumenBiblioteca,
    clipsPosibles: bib.clipsPosibles,
    ID_BIBLIOTECA: bib.ID_BIBLIOTECA,
    elegirVariante: bib.elegirVariante,
    claveDePersona: bib.claveDePersona,
    claveDeRecurso: bib.claveDeRecurso,
    emparejarDentroDelCaso: img.emparejarDentroDelCaso,
    componerInstruccion: img.componerInstruccion,
    planificarImagenes: img.planificar,
    planificarClips: mov.planificar,
    proponerCasos: inv.proponerCasos,
    construirCaso: inv.construirCaso,
    comoLista: inv.comoLista,
    ordenarFichas: inv.ordenarFichas,
    ROLES_DE_FICHA: inv.ROLES_DE_FICHA,
    repartirPorTiempos: aud.repartirPorTiempos,
    repartirBloque: aud.repartirBloque,
    repartir: aud.repartir,
    leerWav: aud.leerWav,
    escribirWav: aud.escribirWav,
    contarPalabras: gui.contarPalabras,
    normalizar: cfg.normalizar,
    sanear: est.sanear,
    abrirPieza: est.abrirPieza,
    borrarPieza: est.borrarPieza,
    episodiosDe: est.episodiosDe,
    reescribirPieza: est.reescribirPieza,
    ascendencia: est.ascendencia,
    duracionValida: mod.duracionValida,
    regionDe: mod.regionDe,
    modalidadesDe: mod.modalidadesDe,
    admiteTamanoImagen: mod.admiteTamanoImagen,
    segmentar: seg.segmentar,
    verificarCobertura: seg.verificarCobertura,
    tomaDelFotograma: cla.tomaDelFotograma,
    claveFotograma: cla.claveFotograma,
    claveClip: cla.claveClip,
    construirHoja: hoj.construirHoja,
    guionEntrega: hoj.guionEntrega,
    textoDePublicacion: met.textoDePublicacion,
    esFiccion: met.esFiccion,
    componerPieDeFuentes: met.componerPieDeFuentes,
    DECLARACION_DE_FICCION: met.DECLARACION_DE_FICCION,
    generarMetadatos: met.generarMetadatos,
    silencios: aud.silencios,
    componerManifiesto: hoj.componerManifiesto,
    guionFfmpeg: hoj.guionFfmpeg,
    repartirRespiros: dir.repartirRespiros,
    RESPIROS: dir.RESPIROS,
    segundosDeClip: mov.segundosDeClip,
    duracionMasCercana: mov.duracionMasCercana,
  };
}

/** Copia del contexto con una función pura sustituida, para `--romper`. */
export function conFuncion(ctx, nombre, averiada) {
  return { ...ctx, fn: { ...ctx.fn, [nombre]: averiada } };
}

/** Copia del contexto con la configuración modificada, para `--romper`. */
export function conConfig(ctx, transformar) {
  const config = structuredClone(ctx.config);
  transformar(config);
  return { ...ctx, config };
}

/** Copia superficial del contexto con las fuentes modificadas, para `--romper`. */
export function conFuente(ctx, ruta, contenido) {
  const fuentes = new Map(ctx.fuentes);
  fuentes.set(ruta, contenido);
  return { ...ctx, fuentes };
}

/**
 * Aplica una transformación al contenido de un archivo.
 *
 * Si la transformación NO CAMBIA NADA, esto revienta en vez de seguir. Es una
 * lección pagada: un sabotaje escrito con una expresión que ya no encajaba —el
 * código había cambiado de forma— dejaba el sistema intacto, la invariante pasaba
 * como es lógico, y salía marcada como «ciega». El mensaje culpaba a la
 * invariante cuando la rota era la forma de romperla. Media hora buscando en el
 * sitio equivocado, dos veces.
 */
export function editando(ctx, ruta, transformar) {
  const actual = ctx.fuentes.get(ruta);
  if (actual === undefined) throw new Error(`La auditoría no encuentra ${ruta} para romperlo.`);
  const roto = transformar(actual);
  if (roto === actual) {
    throw new Error(
      `El sabotaje sobre ${ruta} no cambió nada: la forma de romperlo ya no encaja con el código.`,
    );
  }
  return conFuente(ctx, ruta, roto);
}

/** Copia del contexto con el catálogo de generadores modificado, para `--romper`. */
export function conCatalogo(ctx, transformar) {
  const catalogo = structuredClone(ctx.catalogo);
  transformar(catalogo);
  return { ...ctx, catalogo };
}
