// El director de orquesta (§2 del plano).
//
// El navegador tiene el proyecto entero en memoria y en la base local, decide qué
// generar y en qué orden, lleva la cola, la barra de progreso, el botón de detener y
// los reintentos. NUNCA ve una credencial.
//
// §1: el usuario no lee registros de la nube desde el teléfono. Cualquier fallo se
// explica AQUÍ, en pantalla, con palabras.
//
// El flujo son cinco pasos y se ven los cinco a la vez, en orden, con su estado:
//   1 investigar y ELEGIR UN CASO → 2 guion → 3 generar → 4 montar → 5 exportar
// Los pasos que todavía no tocan salen apagados, para que no haya que adivinar cuál
// es el siguiente.

import { llamar, ponerClave, ponerModeloTexto, ponerModelos, ponerRitmoMinimo, ritmoActual, alEscribirMaterial } from './api.js';
import * as estado from './estado.js';
import { Cola } from './cola.js';
import {
  etiquetaDe, CATALOGO, PREDETERMINADO,
  SIN_VELOCIDAD_NI_TONO, SIN_TONO, SIN_SSML,
} from '../comun/modelos.mjs';
import { pintarSelector } from './config.js';
import { segmentarVerificado } from '../comun/segmentar.mjs';
import { TEMAS, EPOCAS, EPOCA_POR_DEFECTO, temaPorId, epocaPorId } from '../comun/temas.mjs';
import { GENEROS, generoPorId } from '../comun/generos.mjs';
import { mundoDelCaso } from '../comun/estilos.mjs';
import * as elenco from '../comun/elenco.mjs';
import * as investigacion from './fases/investigacion.js';
import * as guionFase from './fases/guion.js';
import * as direccion from './fases/direccion.js';
import * as director from './fases/director.js';
import * as narracion from './fases/narracion.js';
import * as imagenFase from './fases/imagen.js';
import * as movimiento from './fases/movimiento.js';
import * as bibliotecaFase from './fases/biblioteca.js';
import * as musica from './fases/musica.js';
import * as miniatura from './fases/miniatura.js';
import * as metadatos from './fases/metadatos.js';
import * as montajeFase from './fases/montaje.js';
import * as previa from './previa.js';
import * as local from './local.js';
import { material } from './material.js';
import { deBase64 } from './imagenes.js';
import { claveToma, claveVoz, claveFotograma, claveClip, clipVigente } from '../comun/claves.mjs';

const $ = (id) => document.getElementById(id);

const escapar = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Una sola definición de la navegación: la barra lateral y la de abajo salen de
// aquí. Con dos listas, una acaba teniendo una pestaña que la otra no.
const ICONO = {
  inicio: '<path d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z"/>',
  biblioteca: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-6 6"/>',
  episodios: '<path d="M4 5h16v14H4z"/><path d="M4 10h16M9 5v14"/>',
  guion: '<path d="M4 4h11l5 5v11H4z"/><path d="M8 13h8M8 17h5"/>',
  tomas: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>',
  previa: '<path d="M2 6a2 2 0 012-2h11a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2z"/><path d="M17 9l5-3v12l-5-3"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2"/>',
};
// Nombre largo para la barra lateral, corto para la de abajo.
//
// Con seis pestañas en 390 px, «Investigación» no cabe: las etiquetas se pisaban
// unas con otras y se leía «INICIOINVESTIGACIÓNGUION». La anchura es una invariante,
// no un detalle de estilo (§7.13), así que el nombre corto es parte de la definición
// de la vista y no un apaño de CSS.
// ─────────────────────────────────────────────────────────────────────────────
// UNA SECCIÓN POR COSA, Y EL INICIO ES UN INICIO.
//
// «El inicio no es un inicio, el inicio es la biblioteca. La aplicación tiene que
//  tener un inicio y que se vea el generador, y luego todo por sección, como si
//  fuesen su propia página: poder entrar al catálogo de imágenes, a la sección de
//  generar episodio, a la sección de episodios guardados, la sección de ajustes.»
//
// El Inicio se había ido llenando de todo lo que iba haciendo falta —la
// biblioteca entera, la lista de episodios, los seis pasos de producción— hasta
// que dejó de ser una pantalla y pasó a ser el sitio donde estaba todo. Ahora el
// Inicio dice en qué estado está el canal y por dónde se entra, y cada cosa vive
// en su sección.
//
// La vista «Investigación» desaparece y su panel se va con el episodio: buscar
// fichas y construir el expediente son la misma faena que el paso 2, y tenerla en
// dos sitios era un sitio de más.
// ─────────────────────────────────────────────────────────────────────────────
const VISTAS = [
  ['inicio', 'Inicio', 'Inicio'],
  ['biblioteca', 'Archivo del canal', 'Archivo'],
  ['episodios', 'Episodios', 'Casos'],
  ['guion', 'El episodio', 'Guion'],
  ['tomas', 'Tomas', 'Tomas'],
  ['previa', 'Previa', 'Previa'],
  ['ajustes', 'Ajustes', 'Ajustes'],
];

let P = null;
let casos = [];
const cola = new Cola({ alProgresar: pintarProgreso, alAviso: (m, donde) => avisar(donde || 'paso4', m) });
// Una cola aparte para la investigación: su progreso va en el paso 2 y puede
// solaparse con una generación en marcha sin pisarle la barra.
const colaInvestiga = new Cola({
  alProgresar: ({ hechas, total, estado: e }) => {
    $('barra2').style.width = total ? `${Math.round((hechas / total) * 100)}%` : '0';
    $('progreso2').textContent =
      e === 'termina' ? '' : `Buscando… ${hechas} de ${total} ángulos`;
  },
});

// ── Pantalla ──────────────────────────────────────────────────────────────────

/**
 * El aviso de «guion listo», con lo que haya que mirar antes de seguir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Nunca ha salido ningún aviso ámbar.»
 *
 * Y no iba a salir: HAY DOS BOTONES que escriben el guion —el paso del Inicio y
 * el de la sección Guion— y el aviso estaba puesto solo en el primero. Él usa el
 * segundo. Una comprobación que vive en uno de los dos caminos no comprueba nada
 * para quien va por el otro.
 *
 * Ahora lo compone esta función y la llaman los dos. Ver `solapesDelGuion`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/**
 * Reparte el guion en tomas SIN tirar lo que ya está pagado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Ahora dice que el audio cero de doscientos cuatro, cuando ya los había
 *  generado todos.»
 *
 * HAY DOS CAMINOS que reparten el guion —«Escribir el guion», que reparte al
 * terminar, y «Partir en tomas»— y solo el segundo conservaba lo generado. El
 * primero hacía `pieza().tomas = r.tomas` a secas: tomas nuevas, con `audio` en
 * blanco, y doscientas cuatro locuciones pagadas que dejaban de estar enlazadas
 * a nada. La protección existía, con su comentario y todo, en el camino que él no
 * usa. Es el mismo fallo que el aviso del guion: dos caminos, uno protegido.
 *
 * Se conserva por TEXTO: una toma cuyo texto no cambió se queda con su audio, su
 * imagen y su clip.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Y POR TEXTO EXACTO NO BASTABA, que es lo que dejó un episodio entero atascado.
 *
 * Cuando cambian las REGLAS de la segmentación —no el guion, las reglas— ninguna
 * toma nueva tiene el texto de ninguna vieja: donde había tres párrafos sueltos
 * ahora hay una toma que los junta. Con el emparejamiento por texto exacto, volver
 * a partir el guion tiraba el episodio entero a la basura, así que no se podía
 * volver a partir, así que las tomas de cuarenta y nueve segundos se quedaban ahí
 * por mucho que se arreglara el segmentador. Tres rondas de «arreglado» sin que
 * cambiara nada en pantalla.
 *
 * Ahora se empareja por SOLAPE en el guion: la toma nueva hereda de la vieja con
 * la que comparte más texto. Y se distingue qué se puede heredar:
 *   · Texto idéntico → todo, también la voz.
 *   · Solapa pero el texto cambió → LO VISUAL sí, la voz no. Una imagen ilustra un
 *     trozo del guion y ese trozo sigue estando ahí; la voz es un corte de onda en
 *     unos límites concretos, y esos límites ya no existen.
 * ─────────────────────────────────────────────────────────────────────────────
 */
// Lo que sobrevive a un reparto nuevo cuando el texto cambió pero se solapa. La
// lista está aquí, con nombre, para que una invariante la pueda comprobar: cada
// campo que falte es material pagado que se tira.
const LO_VISUAL_SE_HEREDA = [
  'plano', 'imagen', 'video', 'tipoImagen', 'movimiento', 'respiro',
  'heredado', 'heredadoVid', 'variante', 'personaje', 'recurso', 'motivo',
  'versionImagen', 'versionClip', 'fichas',
];

/**
 * Las tomas, con su sitio en el guion puesto aunque no lo traigan.
 *
 * Los proyectos guardados ANTES de que la lista blanca nombrara `inicioEnGuion`
 * vienen sin él, y son justo los que hay que rescatar: los partidos con las reglas
 * viejas. Se reconstruye buscando el texto de cada toma hacia delante — el reparto
 * cubre el guion en orden, así que buscar desde donde acabó la anterior no puede
 * encontrar la de otra parte.
 */
function conSitioEnElGuion(tomas, guion) {
  let cursor = 0;
  return tomas.map((t) => {
    if (Number.isInteger(t.inicioEnGuion) && Number.isInteger(t.finEnGuion)) {
      cursor = t.finEnGuion;
      return t;
    }
    const texto = String(t.texto || '');
    const inicio = texto ? guion.indexOf(texto, cursor) : -1;
    if (inicio < 0) return t;
    cursor = inicio + texto.length;
    return { ...t, inicioEnGuion: inicio, finEnGuion: cursor };
  });
}

/**
 * EL ARCHIVO NO SE MUEVE CUANDO LA TOMA CAMBIA DE NÚMERO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Todo está generado, pero aún así el montador dice que algo falta.»
 *
 * Abajo, los `reusa` se reescriben porque apuntan a un índice y los índices se
 * mueven al volver a repartir. Pues `imagen: 'ok'`, `video: 'ok'` y `audio: 'ok'`
 * son TAMBIÉN punteros por índice, solo que implícitos: la clave del archivo se
 * compone con el número de la toma —`p07/t017/img`— y el archivo, que está en el
 * almacén, no se entera de que la toma pasó a ser la 23.
 *
 * Conservar la marca sin conservar el nombre dejaba lo peor de los dos mundos:
 * en pantalla, todo verde y pagado; en el montaje, doscientas claves pedidas que
 * no existen. Y como la fase de imagen ve `imagen: 'ok'`, tampoco lo regenera:
 * callejón sin salida, igual que el que ya se pagó con `heredado` en `sanearToma`.
 *
 * Así que se conserva APUNTANDO al nombre con el que se subió. El mecanismo ya
 * estaba —`heredado` y `heredadoVid` guardan la clave entera de un material que
 * vive en otro sitio— y la voz estrena el suyo, `heredadoAudio`.
 *
 * El nombre se saca con `claveFotograma`/`claveClip` sobre la lista VIEJA: si la
 * donante repetía el fotograma de otra o lo heredaba de otra pieza, su archivo no
 * está bajo su propio número, y componerlo a mano volvería a apuntar al vacío.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function conSuArchivo(nueva, vieja, viejas) {
  if (vieja.i === nueva.i) return nueva;
  const con = { ...nueva };
  // El prefijo es el del episodio, el mismo con el que se generó. Ver `idMaterial`.
  if (con.imagen === 'ok' && !con.heredado) con.heredado = claveFotograma(idMaterial(), vieja, viejas);
  if (con.video === 'ok' && !con.heredadoVid) con.heredadoVid = claveClip(idMaterial(), vieja, viejas);
  // La voz no se comparte entre tomas: no hay cadena que resolver, solo su número.
  if (con.audio === 'ok' && !con.heredadoAudio) {
    con.heredadoAudio = claveToma(idMaterial(), vieja.i, 'audio');
  }
  return con;
}

function repartirConservando(z, r) {
  const viejas = conSitioEnElGuion(z.tomas || [], z.guion || '');
  const solape = (a, b) =>
    Math.max(0, Math.min(a.finEnGuion, b.finEnGuion) - Math.max(a.inicioEnGuion, b.inicioEnGuion));

  // De qué toma vieja viene cada toma nueva, para poder rehacer los `reusa`.
  const donante = new Map();
  let intactas = 0;
  let visuales = 0;

  const tomas = r.tomas.map((t) => {
    let mejor = null;
    let mayor = 0;
    for (const v of viejas) {
      const s = solape(t, v);
      if (s > mayor) {
        mayor = s;
        mejor = v;
      }
    }
    if (!mejor) return t;
    donante.set(mejor.i, t.i);

    if (mejor.texto === t.texto) {
      intactas++;
      // El texto es el mismo: todo vale. Pero la posición y el índice son los
      // NUEVOS — si mandara la vieja, la toma apuntaría a un trozo de guion que ya
      // no es el suyo.
      return conSuArchivo({ ...mejor, ...t, plano: mejor.plano, audio: mejor.audio }, mejor, viejas);
    }

    const heredado = {};
    for (const campo of LO_VISUAL_SE_HEREDA) {
      if (mejor[campo] !== undefined && mejor[campo] !== null) heredado[campo] = mejor[campo];
    }
    if (Object.keys(heredado).length) visuales++;
    // `audio` NO entra: se cortó en unos límites que ya no existen.
    return conSuArchivo({ ...t, ...heredado }, mejor, viejas);
  });

  // LOS `reusa` SE REESCRIBEN O SE CAEN. Apuntan a un índice de toma, y al volver
  // a partir el guion los índices se mueven: un `reusa: 12` conservado tal cual
  // apuntaría a una toma que ahora cuenta otra cosa.
  z.tomas = tomas.map((t) => {
    if (!Number.isInteger(t.reusa)) return t;
    const nuevo = donante.get(t.reusa);
    return nuevo !== undefined && nuevo !== t.i ? { ...t, reusa: nuevo } : { ...t, reusa: null };
  });
  z.escenas = r.escenas;
  return { intactas, visuales, total: z.tomas.length };
}

/** Lo que sobrevivió a un reparto, en palabras. Ver `repartirConservando`. */
function loSalvado(s) {
  if (!s || (!s.intactas && !s.visuales)) return 'No había nada generado que conservar.';
  const partes = [];
  if (s.intactas) partes.push(`${s.intactas} conservan todo lo que tenían`);
  if (s.visuales) partes.push(`${s.visuales} conservan su plano y su imagen, pero su voz hay que rehacerla`);
  return `De ${s.total} tomas, ${partes.join(' y ')}.`;
}

function avisoDeGuion(donde, texto, extra = '') {
  const n = guionFase.contarPalabras(texto);
  const repiten = guionFase.solapesDelGuion(texto);
  // Lo que el gancho adelanta y no debería. Ver `loQueAdelantaElGancho`.
  const adelanta = guionFase.loQueAdelantaElGancho(texto, pieza()?.caso);
  avisar(
    donde,
    `Guion listo: ${n} palabras (~${Math.round(n / 145)} min).${extra} ` +
      'Léelo antes de seguir: es el insumo del que sale todo.' +
      (adelanta.length
        ? `\n\nEl gancho adelanta ${adelanta.map((x) => `${x.que} («${x.dice}»)`).join(', ')}. ` +
          'Eso va después de la cabecera: el gancho es una acción, no una ficha.'
        : '') +
      (repiten.length
        ? `\n\nMíralo antes de generar nada: ${repiten
            .map((x) => `el acto ${x.n} («${x.titulo}») abre repitiendo el final del anterior`)
            .join('; ')}. Se arregla borrando su primer párrafo, o volviendo a escribir el guion.`
        : ''),
    repiten.length || adelanta.length ? 'atencion' : 'bueno',
  );
}

function avisar(donde, mensaje, clase = '') {
  const caja = $(`aviso-${donde}`);
  if (!caja) return;
  caja.innerHTML = mensaje
    ? `<div class="aviso ${clase}">${escapar(mensaje)}</div>`
    : '';
}

function registro(donde, lineas) {
  const caja = $(`aviso-${donde}`);
  if (!caja || !lineas?.length) return;
  const d = document.createElement('div');
  d.className = 'registro';
  d.textContent = lineas.join('\n');
  caja.appendChild(d);
}

/**
 * El progreso, EN LA SECCIÓN DONDE SE ESTÁ TRABAJANDO.
 *
 * «Dice como que se está generando, pero no se genera nada.» Parte de eso era
 * literal: la barra y los avisos se pintaban SIEMPRE en `paso4`, que desde que hay
 * secciones vive en «El episodio». Generando el archivo del canal desde Archivo, el
 * progreso, la cuenta atrás de la cuota y los errores salían en una pantalla que no
 * estaba mirando. La tanda dice dónde va, y si esa sección no tiene barra propia,
 * cae en la de siempre.
 */
function pintarProgreso({ fase, hechas, generadas, total, estado: e, fallos, donde = 'paso4' }) {
  const barra = $(`barra-${donde}`) || $('barra');
  const texto = $(`progreso-${donde}`) || $('progreso');
  if (barra) barra.style.width = total ? `${Math.round((hechas / total) * 100)}%` : '0';
  const cierre =
    e === 'detenida' ? ' · detenido' : e === 'termina' ? ' · listo' : e === 'espera' ? ' · esperando cuota' : '';
  // LA CIFRA QUE SE ENSEÑA ES LA DE LO GENERADO Y ANOTADO, no la de vueltas del
  // bucle: «dice que generó dos imágenes, pero es mentira, solo generó una». La
  // barra sí avanza con las despachadas —si no, se quedaría quieta con los
  // fallos— y por eso son dos cosas distintas.
  const n = generadas ?? hechas;
  if (texto) texto.textContent = `${fase}: ${n} de ${total}${fallos ? ` · ${fallos} con fallo` : ''}${cierre}`;
  const parado = e === 'termina' || e === 'detenida';
  for (const b of ['b-detener', 'b-detener-biblioteca']) {
    const el = $(b);
    if (el) el.disabled = parado;
  }
}

function accion(boton, hacer, donde = 'paso4') {
  const b = $(boton);
  b?.addEventListener('click', async () => {
    b.disabled = true;
    avisar(donde, '');
    try {
      await hacer();
    } catch (e) {
      avisar(donde, e?.message || String(e), 'malo');
    } finally {
      b.disabled = false;
    }
  });
}

const guardar = () => estado.guardar(P);
const pieza = () => estado.piezaDe(P, P.piezaActiva);

/**
 * EL ID CON EL QUE SE NOMBRA EL MATERIAL. Es el del EPISODIO, no el del proyecto.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * En pantalla: «Faltan 238 de 250 materiales», con el episodio entero generado,
 * el cubo correcto y los archivos comprobados uno a uno en la consola de Google.
 * El montaje pedía `p2929/t000/img` y en el almacén estaba `p2925/t000/img`.
 *
 * `p2925` es el PROYECTO. `p2929` es el episodio abierto —el quinto—. Todas las
 * fases componían la clave con el id del proyecto y la hoja de montaje con el de
 * la pieza, que es lo correcto: cada episodio guarda su material bajo su propio
 * nombre, y por eso `numeroPiezas` solo sube (ver `sanear`). Con un solo episodio
 * los dos números coinciden —`nuevoProyecto` le da a la primera pieza el id del
 * proyecto— y no se notaba nada. Del segundo en adelante, TODO lo generado se
 * guardaba bajo el nombre del proyecto y el montaje lo buscaba bajo el del
 * episodio: no encontraba nada, y encima cada episodio nuevo escribía encima del
 * material del primero.
 *
 * Un id, un sitio. Lo que ya está guardado con el nombre viejo no se mueve: se
 * apunta con `heredado`, que para eso está («Buscar el material que falta»).
 * ─────────────────────────────────────────────────────────────────────────────
 */
const idMaterial = () => pieza().id;

/**
 * EN QUÉ PAÍS PASA ESTE EPISODIO, para las imágenes.
 *
 * Sale del caso, que ya trae un país y una ciudad REALES. Un caso viejo —de antes
 * de que el caso llevara país— devuelve el mundo neutro: sin saber dónde pasa no
 * se puede pedir el volante de ningún lado, que es exactamente el fallo original.
 * Ver `mundoDelCaso` en `comun/estilos.mjs`.
 */
const mundoDeLaPieza = () => mundoDelCaso(pieza()?.caso || {});

/** El formato del canal ahora mismo. Manda sobre qué biblioteca se usa. */
const aspectoDelCanal = () => bibliotecaFase.aspectoDe(P.config);

/**
 * El formato en el que está hecha una pieza.
 *
 * La biblioteca lo lleva escrito. Un episodio no: se generó con el formato que
 * tuviera el canal entonces, y no se guardó en ninguna parte. Se le da el del
 * canal, que es lo único que se puede afirmar sin inventar.
 */
const aspectoDeLaPieza = (z) =>
  z?.esBiblioteca ? bibliotecaFase.aspectoPieza(z) : String(z?.aspecto || aspectoDelCanal());

/**
 * SELLA LA PIEZA CON EL FORMATO EN EL QUE SE ESTÁ GENERANDO.
 *
 * Se hace al generar la primera imagen y no antes: en ese momento el formato es un
 * HECHO —se acaba de pedir una imagen con él— y no una suposición sobre un
 * episodio que todavía no ha gastado nada. Una vez sellado no cambia: cambiar el
 * canal de formato no convierte lo ya pagado.
 */
function sellarFormato(z) {
  if (!z || z.esBiblioteca || z.aspecto) return;
  z.aspecto = aspectoDelCanal();
}

/**
 * Guarda una imagen del episodio en el archivo del canal.
 *
 * No copia ni regenera nada: la entrada APUNTA al material que ya está pagado, con
 * el mismo `heredado` que usa la herencia entre piezas. Y el clip se va con ella si
 * lo tiene. Ver `entradaDeArchivo`.
 */
async function guardarEnArchivo(i, nombre) {
  const z = pieza();
  const toma = z.tomas.find((t) => t.i === i);
  if (!toma) throw new Error('No encuentro esa toma.');
  const entrada = bibliotecaFase.entradaDeArchivo(toma, {
    nombre,
    pieza: idMaterial(),
    tomas: z.tomas,
    propios: P.archivoPropio,
    // En qué formato se generó: sin esto entraría en el archivo sin decir si es
    // vertical u horizontal y se mezclaría con las del otro formato.
    aspecto: aspectoDelCanal(),
  });
  P.archivoPropio = [...(P.archivoPropio || []), entrada];
  // Se vuelve a sincronizar para que la entrada tenga ya su sitio y su índice: sin
  // esto no aparecería en el Archivo hasta la siguiente carga.
  laBiblioteca();
  await guardar();
  pintarPorTipo();
  pintarBiblioteca();
  avisar(
    'previa',
    `«${entrada.nombre}» ya está en el archivo${entrada.heredadoVid ? ', con su clip' : ''}. ` +
      'El director la verá al dirigir los casos que vengan.',
    'bueno',
  );
}

/**
 * Las fichas, el caso y el tema son DE LA PIEZA, no del proyecto.
 *
 * Estaban en el proyecto, y por eso elegir un caso nuevo dejaba las fichas del
 * anterior en su sitio: la investigación siguiente se fusionaba con ellas y el
 * director leía dos casos a la vez.
 */
const fichas = () => pieza().fichas;

// ── Acceso ────────────────────────────────────────────────────────────────────

/**
 * El diagnóstico, eslabón por eslabón (§1).
 *
 * Vive en UNA función y la usan los dos sitios que lo enseñan: la pantalla de
 * entrada y el botón de Ajustes. Escribir esto dos veces es cómo el propio
 * diagnóstico acabó comprobando algo distinto de lo que hace la herramienta.
 */
async function comprobarConexion(donde) {
  const caja = $(donde);
  caja.innerHTML = '<div class="aviso">Comprobando…</div>';

  const salud = await llamar('salud');
  const cfg = salud.configuracion;
  if (!cfg.lista) {
    caja.innerHTML =
      '<div class="aviso malo"><b>Falta configurar esto:</b>' +
      cfg.faltan
        .map((f) => `<span class="comoarreglar"><b>${escapar(f.variable)}</b> — ${escapar(f.es)}</span>`)
        .join('') +
      '</div>';
    throw new Error('La herramienta no está configurada del todo todavía.');
  }

  const prueba = salud.prueba || [];
  caja.innerHTML =
    prueba
      .map(
        (p) =>
          `<div class="aviso ${p.ok ? 'bueno' : 'malo'}">${p.ok ? '✓' : '✗'} <b>${escapar(p.paso)}</b> — ` +
          `${escapar(p.dice)}` +
          (p.arregla ? `<span class="comoarreglar">${escapar(p.arregla)}</span>` : '') +
          `</div>`,
      )
      .join('') + versionDesplegada(salud.version);
  return prueba;
}

/**
 * Qué versión está sirviendo la web, en pantalla.
 *
 * «¿Todo eso está en main? Porque no veo ningún cambio.» Estaba en main y estaba
 * desplegado, y aun así no había forma de contestar esa pregunta MIRANDO EL
 * TELÉFONO: para saberlo había que abrir un panel de despliegues, que es
 * exactamente lo que §1 dice que no se puede pedir.
 *
 * Con esto, la duda se resuelve de un vistazo: si el commit que sale aquí es el
 * último, lo que se está usando es lo último — y si no sale ninguno, es que la
 * página viene de la caché del navegador y hay que recargarla.
 */
function versionDesplegada(v) {
  if (!v?.commit) return '';
  return (
    `<p class="nota chica" style="margin-top:10px">Versión desplegada: ` +
    `<b>${escapar(v.commit)}</b>${v.rama ? ` · rama ${escapar(v.rama)}` : ''}. ` +
    `Si esperabas un cambio reciente y este no es su commit, recarga la página.</p>`
  );
}

accion('b-comprobar', () => comprobarConexion('salud-ajustes'));

accion(
  'b-entrar',
  async () => {
    const c = $('clave').value.trim();
    if (!c) throw new Error('Escribe la contraseña.');
    ponerClave(c);

    const prueba = await comprobarConexion('salud');

    // El montador solo hace falta para montar: no impide entrar ni generar.
    if (prueba.filter((p) => !p.ok && p.paso !== 'montador').length) {
      throw new Error('Hay algo que todavía no funciona. Mira arriba: dice cuál y qué hacer.');
    }

    await llamar('proyecto.listar');
    recordarClave(c);
    $('acceso').classList.add('oculto');
    $('app').classList.remove('oculto');
    await arrancar();
  },
  'proyecto',
);

// ── Arranque y navegación ─────────────────────────────────────────────────────

async function arrancar() {
  pintarNavegacion();
  const locales = await estado.listarLocales();
  P = locales.length
    ? await estado.cargarLocal(locales.sort((a, b) => b.modificado - a.modificado)[0].id)
    : estado.nuevoProyecto();

  // LA NUBE DEVUELVE LO QUE EL TELÉFONO PIERDA.
  //
  // Safari borra su almacén local cuando le parece —presión de espacio, días sin
  // entrar— y aquí el teléfono era el único que tenía el proyecto: las fichas, la
  // dirección y el guion desaparecían «guardados» y tocaba volver a pagarlos. La
  // copia de la nube ahora se mantiene sola al guardar; esto es el otro sentido:
  // si la de la nube es más nueva que la local —o si aquí no hay nada—, manda
  // ella. Sin nube se sigue con lo local, como siempre.
  try {
    const ids = await estado.listarRemotos();
    const id = ids.includes(P.id) ? P.id : ids[0];
    if (id) {
      const nube = await estado.cargarRemoto(id);
      if (nube && (!locales.length || (nube.modificado || 0) > (P.modificado || 0))) {
        P = nube;
        avisar('proyecto', 'Recuperado de tu nube: aquí faltaba lo último.', 'bueno');
      }
    }
  } catch {
    /* sin nube se trabaja igual */
  }
  ponerModeloTexto(P.config.texto.modelo);
  ponerModelos({ imagen: P.config.imagenModelo.modelo, video: P.config.videoModelo.modelo });
  await guardar();
  pintarTodo();
  cargarVoces();
  cargarModelos();
  // Y SI SE DEJÓ UN MONTAJE EN MARCHA, se vuelve a mirar. Media hora de montaje
  // no cabe en una pestaña de teléfono sin que se recargue: ver `vigilarMontaje`.
  vigilarMontaje().catch(() => {});
}

/**
 * Pinta los tres desplegables de generadores desde el catálogo.
 *
 * El catálogo es una tabla fija (`comun/modelos.mjs`), así que esto no descubre
 * nada: enseña lo que hay, en el orden en que está escrito, y respeta lo que el
 * usuario eligió. Lo que él elige es lo que se usa; la aplicación no lo corrige
 * ni lo sube sola por su cuenta.
 */
const FAMILIAS_DE_MODELO = [
  ['texto', 'm-texto', 'texto'],
  ['imagen', 'm-imagen', 'imagenModelo'],
  ['video', 'm-video', 'videoModelo'],
];

/**
 * Llena los desplegables desde la tabla que el navegador YA TIENE DENTRO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Ahora salen todas las opciones de los generadores vacías y no puedo
 *  seleccionar ninguno.»
 *
 * Esto se llenaba pidiéndole al servidor `modelos.catalogo`. Y el catálogo es una
 * TABLA FIJA escrita en `comun/modelos.mjs`, que este mismo archivo importa: se
 * estaba yendo por la red a buscar algo que ya estaba aquí. Con eso, cualquier
 * tropiezo —la red del móvil, un despliegue a medias, una respuesta que no llega—
 * dejaba los tres desplegables vacíos y sin poder elegir nada. Un punto único de
 * fallo a cambio de nada.
 *
 * Ahora se pintan de la tabla local, sin red y sin poder fallar. Al servidor se le
 * sigue preguntando, pero solo por una cosa que él sí sabe y el navegador no: cuál
 * es el predeterminado de SU entorno. Y si no contesta, no pasa nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function pintarModelos(enUso = null) {
  let cambio = false;

  for (const [familia, selector, guardado] of FAMILIAS_DE_MODELO) {
    const filas = (CATALOGO[familia] || []).map((f) => ({ id: f.clave, etiqueta: f.etiqueta }));
    if (!filas.length) continue;

    const cfg = P.config[guardado] || (P.config[guardado] = { modelo: '' });
    // Sin elección guardada se coge la que el catálogo trae por defecto. Con
    // elección guardada NO SE TOCA: es lo que se pidió —que la aplicación
    // obligue el generador elegido— y además evita el §7.2 al revés, que la
    // pantalla te cambie el modelo por debajo cada vez que abres los ajustes.
    if (!cfg.modelo || !filas.some((f) => f.id === cfg.modelo)) {
      cfg.modelo = enUso?.[familia] || PREDETERMINADO[familia] || filas[0].id;
      cambio = true;
    }

    const s = $(selector);
    if (!s) continue;
    s.innerHTML = '';
    for (const f of filas) {
      const o = document.createElement('option');
      o.value = f.id;
      o.textContent = f.etiqueta;
      if (f.id === cfg.modelo) o.selected = true;
      s.appendChild(o);
    }
  }

  $('modelo-en-uso').textContent = etiquetaDe('texto', P.config.texto.modelo);
  ponerModeloTexto(P.config.texto.modelo);
  ponerModelos({ imagen: P.config.imagenModelo.modelo, video: P.config.videoModelo.modelo });
  P.config.imagen.modelo = P.config.imagenModelo.modelo || P.config.imagen.modelo;
  P.config.movimiento.modelo = P.config.videoModelo.modelo || P.config.movimiento.modelo;
  if (cambio) await guardar();
}

/**
 * Pinta los desplegables de generadores.
 *
 * Primero con lo que hay aquí —eso no puede fallar— y luego, si el servidor
 * contesta, se afina con el predeterminado de su entorno. El orden importa: si se
 * esperara a la respuesta para pintar, un fallo de red te dejaría sin poder elegir
 * generador, que es justo lo que pasaba.
 */
async function cargarModelos() {
  await pintarModelos();
  try {
    const r = await llamar('modelos.catalogo');
    await pintarModelos(r.enUso);
  } catch {
    // El servidor no contestó. Los desplegables ya están llenos y se puede
    // trabajar: no hay nada que decir aquí.
  }
}

function pintarNavegacion() {
  const lat = $('lateral');
  const mov = $('nav-movil');
  lat.innerHTML = '';
  mov.innerHTML = '';

  for (const [id, nombre, corto] of VISTAS) {
    const svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONO[id]}</svg>`;
    for (const [caja, contenido] of [
      [lat, `${svg}<span>${nombre}</span>`],
      [mov, `${svg}<span>${corto}</span>`],
    ]) {
      const b = document.createElement('button');
      b.innerHTML = contenido;
      b.dataset.vista = id;
      b.onclick = () => ir(id);
      caja.appendChild(b);
    }
  }
  ir('inicio');
}

function ir(id) {
  document.querySelectorAll('.vista').forEach((v) => v.classList.add('oculto'));
  $(`v-${id}`)?.classList.remove('oculto');
  document.querySelectorAll('[data-vista]').forEach((b) => b.classList.toggle('on', b.dataset.vista === id));
  window.scrollTo(0, 0);
}

/**
 * El selector de temas.
 *
 * Sin acotar el tema, «busca casos reales» sale a internet sin rumbo. Y sin acotar
 * la época devuelve lo más publicado, que es lo más viejo: por eso salían casos del
 * XIX una y otra vez.
 */
function pintarFiltros() {
  const st = $('tema');
  if (!st.options.length) {
    st.innerHTML = '<option value="">Cualquier tema del canal</option>';
    for (const g of TEMAS) {
      const og = document.createElement('optgroup');
      og.label = `${g.icono} ${g.grupo}`;
      for (const x of g.temas) {
        const o = document.createElement('option');
        o.value = x.id;
        o.textContent = x.nombre;
        og.appendChild(o);
      }
      st.appendChild(og);
    }
    const se = $('epoca');
    se.innerHTML = '';
    for (const e of EPOCAS) {
      const o = document.createElement('option');
      o.value = e.id;
      o.textContent = e.nombre;
      se.appendChild(o);
    }
    // El género. De él salen la estructura del episodio, los motivos que vuelven
    // y los arquetipos de la biblioteca, así que se elige ANTES de nada — aquí, al
    // lado del tema, y no escondido en Ajustes.
    const sg = $('genero');
    sg.innerHTML = '';
    for (const g of GENEROS) {
      const o = document.createElement('option');
      o.value = g.id;
      o.textContent = g.nombre;
      sg.appendChild(o);
    }
  }
  st.value = P.temaId || '';
  $('epoca').value = P.epocaId || EPOCA_POR_DEFECTO;
  // §7.3: el que repinta DEVUELVE el valor con el que se quedó y quien llama lo
  // ESCRIBE. Un género retirado del catálogo se corregía en el selector y la
  // configuración conservaba el viejo: la pantalla decía una cosa y el estado otra.
  P.config.genero = pintarSelector(
    $('genero'),
    GENEROS.map((g) => ({ id: g.id, etiqueta: g.nombre })),
    P.config.genero,
  );
  $('genero-dice').textContent = generoPorId(P.config.genero)?.resumen || '';
  if ($('idea') && document.activeElement !== $('idea')) $('idea').value = P.idea || '';
}

/**
 * LA PANTALLA HABLA DEL MODO EN EL QUE ESTÁ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «¿Por qué me sigue diciendo todas esas cosas, si se supone que los casos ya no
 *  son reales, son ficticios? Hay que meterle lógica al asunto.»
 *
 * Y tenía razón: el motor pasó a construir casos inventados y la pantalla se
 * quedó entera hablando del otro modo. «Busca en internet casos reales», «Seis
 * búsquedas: cronología, fuentes oficiales, prensa», «De un caso real a un video
 * terminado». Nada de eso pasaba ya, y peor: a un caso INVENTADO se le pintaba
 * una pastilla ámbar de «poco documentado», que es al revés de lo que es —no le
 * falta documentación, es que no la lleva—.
 *
 * Un texto que describe lo que la herramienta hacía antes no es un texto viejo:
 * es una mentira sobre lo que va a pasar cuando pulses, y quien lo lee toma
 * decisiones con eso.
 *
 * Así que todo lo que cambia con el modo se escribe AQUÍ, en un solo sitio, y se
 * repinta cuando el modo cambia. Un texto mode-dependiente escrito en el HTML es
 * un texto que se va a quedar viejo el día que se añada el tercer modo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const DICE_LA_PANTALLA = {
  titulo: 'Crea ficción documental',
  sub: 'De una idea a un episodio terminado, sin salir de aquí.',
  paso1Titulo: 'El caso',
  paso1: 'Inventa cinco casos del género que elijas. No sale a internet: los construye. Elige uno.',
  buscar: 'Inventar casos',
  epoca: 'Época en la que transcurre',
  paso2Titulo: 'El expediente',
  paso2:
    'Construye el caso entero antes de escribir: víctima, lugar, fechas, el objeto que lo resuelve, ' +
    'la pista falsa y el culpable. De una sola llamada, para que nada se contradiga.',
  fondo: 'Construir el expediente',
  paso6: 'Video final, miniatura, título y descripción — con la declaración de ficción delante.',
};

function pintarModo() {
  const pon = (id, texto) => {
    const el = $(id);
    if (el) el.textContent = texto;
  };
  const d = DICE_LA_PANTALLA;
  pon('titulo-inicio', d.titulo);
  pon('sub-inicio', d.sub);
  pon('paso1-titulo', d.paso1Titulo);
  pon('paso1-dice', d.paso1);
  pon('b-buscar-casos-texto', d.buscar);
  pon('epoca-etiqueta', d.epoca);
  pon('paso2-titulo', d.paso2Titulo);
  pon('paso2-dice', d.paso2);
  pon('b-investigar-fondo-texto', d.fondo);
  pon('paso6-dice', d.paso6);
}

/**
 * La duración objetivo, del campo a la configuración.
 *
 * Vivía en el `value="10"` del `<input>` y no se guardaba con el proyecto: cada
 * recarga volvía a diez minutos. Ahora el campo es la cara de `config.guion.minutos`
 * y quien lo lee lo escribe, que es §7.3 otra vez.
 */
function minutosObjetivo() {
  const n = Number($('minutos').value);
  const bueno = Number.isFinite(n) ? Math.min(40, Math.max(3, Math.round(n))) : P.config.guion.minutos;
  P.config.guion.minutos = bueno;
  $('minutos').value = bueno;
  return bueno;
}

/**
 * LO QUE LA PANTALLA DECÍA DEL EPISODIO ANTERIOR NO ES DE ESTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Esos mensajes que quedan son remanentes del episodio anterior. Se supone que
 *  este era un episodio nuevo, y sigue mostrando audios generados, mensajes del
 *  episodio anterior.»
 *
 * Al cambiar de episodio se repintaban los DATOS del nuevo —tomas, fichas, guion,
 * pasos— pero lo transitorio se quedaba puesto: la barra llena, «narración: 55 de
 * 55, sin fallos», la casilla de rehacer marcada, la lista de videos montados. Un
 * episodio recién abierto y vacío decía que tenía la narración hecha.
 *
 * Todos los caminos que cambian de episodio pasan por `pintarTodo`, así que es
 * aquí donde se nota el cambio y se olvida lo del anterior: antes de pintar nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/** Las cajas de aviso que hablan DEL EPISODIO, no del canal ni de los ajustes. */
const AVISOS_DEL_EPISODIO = [
  'paso1', 'paso2', 'paso3', 'paso4', 'paso5', 'paso6',
  'investigacion', 'guion', 'continuar', 'tomas', 'previa',
];
let piezaPintada = null;

function olvidarRastros() {
  for (const donde of AVISOS_DEL_EPISODIO) avisar(donde, '');
  for (const id of ['barra', 'barra2']) {
    const b = $(id);
    if (b) b.style.width = '0';
  }
  for (const id of ['progreso', 'progreso2']) {
    const t = $(id);
    if (t) t.textContent = '';
  }
  // Rehacer es una decisión sobre UN episodio: en el siguiente vuelve a estar
  // apagado, o el primer botón repetiría —y pagaría— lo que ya estaba.
  const rehacer = $('rehacer-todo');
  if (rehacer) rehacer.checked = false;
  const montados = $('lista-montados');
  if (montados) montados.innerHTML = '';
  $('b-buscar-material')?.classList.add('oculto');
  // La bajada se habilita cuando el montaje DE ESTE episodio está: lo mira
  // `vigilarMontaje` al cambiar.
  const bajar = $('b-bajar');
  if (bajar) bajar.disabled = true;
}

/**
 * Con una tanda en marcha no se cambia de episodio.
 *
 * Cada unidad generada se guarda en el episodio ABIERTO y con su id: cambiar a
 * mitad mandaría la voz o las imágenes —ya pagadas— al episodio equivocado, sin
 * un solo error.
 */
function exigirSinTandaEnMarcha() {
  if (cola.corriendo) {
    throw new Error(
      'Hay una tanda generando en «El episodio». Detenla o espera a que termine antes de ' +
        'cambiar de episodio: lo que salga se guardaría en el episodio equivocado.',
    );
  }
}

function pintarTodo() {
  // Si cambió el episodio, lo transitorio del anterior se olvida ANTES de pintar.
  if (piezaPintada !== null && piezaPintada !== pieza().id) {
    olvidarRastros();
    vigilarMontaje().catch(() => {});
  }
  piezaPintada = pieza().id;
  pintarModo();
  // Las propuestas pagadas vuelven a salir tras recargar: estaban en una variable
  // suelta y desaparecían al cerrar la pestaña.
  if (!casos.length && P.casosPropuestos?.length) casos = P.casosPropuestos;
  // El formato elegido manda también en los VISORES: sin esta clase, la pantalla
  // enseñaba un 9:16 recortado a 16:9 y parecía que se generaba mal.
  document.body.classList.toggle('formato-vertical', !!P.config.formato.vertical);
  pintarFiltros();
  $('titulo').value = P.titulo;
  $('guion').value = pieza().guion;
  $('nombre-proyecto').textContent = pieza().caso?.titulo || P.titulo;
  $('cabecera-movil').textContent = `${pieza().tomas.length} tomas`;
  pintarCasoElegido();
  pintarFichas();
  pintarReparto();
  pintarTratamiento();
  pintarTomas();
  pintarAjustes();
  pintarPasos();
  pintarPestanas();
  pintarHistorial();
  pintarEpisodioAbierto();
  pintarInicio();
  pintarContinuacion();
  // La previa preparada es de la pieza que estaba abierta: al cambiar de caso ya no
  // vale, y dejarla puesta enseñaría el documental anterior como si fuera este.
  if (preparada && preparada.hoja?.pieza !== pieza().id) {
    preparada = null;
    pintarTiras();
  }
  // Las listas por tipo salen del proyecto, no de la previa: se pintan SIEMPRE.
  // Cuando dependían de `preparada`, cada recarga las dejaba en «prepara primero»
  // con todo el material ya pagado y guardado ahí debajo.
  pintarPorTipo();
}

/**
 * El estado de los cinco pasos.
 *
 * Un paso apagado no es decoración: es la respuesta a «¿y ahora qué?». Sin esto hay
 * que acordarse de en qué orden va todo, y el orden es justamente lo que la
 * herramienta debería saber por ti.
 */
/**
 * Cuánto hay de cada fase, calculado sobre lo que DE VERDAD hay que generar.
 *
 * Los totales salen de los mismos `planificar` que usan los botones, con «todas»
 * puesto: así lo heredado, lo que repite un plano y lo que no lleva clip no
 * cuentan como pendiente — no hay que generarlos nunca.
 */
function cuentasDeFases() {
  const t = pieza().tomas;
  const img = imagenFase.planificar(t, { soloLasQueFaltan: false });
  const clips = movimiento.planificar(t, { soloLasQueFaltan: false });
  const mus = musica.planificar(pieza().escenas, t, P.config, { soloLasQueFaltan: false });
  return [
    // Un corte estimado no cuenta como hecho: es audio defectuoso y el botón
    // de Narración lo va a repetir. La cuenta tiene que decir lo mismo que él.
    ['cf-voz', 'Voz', t.filter((x) => x.audio === 'ok' && !(x.corteExacto === false && x.corteForzado === true)).length, t.length],
    ['cf-imagenes', 'Imágenes', img.filter((x) => x.imagen === 'ok').length, img.length],
    ['cf-clips', 'Clips', clips.filter((x) => x.video === 'ok').length, clips.length],
    // `hecha`, no `estado === 'ok'`: una música rescatada lleva su clave entera.
    ['cf-musica', 'Música', mus.filter((e) => e.hecha).length, mus.length],
  ];
}

/**
 * DE DÓNDE SALE CADA NÚMERO, Y QUÉ NO SE PAGA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «No puedo ir mirando qué está hecho, qué falta, qué se puede reutilizar. Todo
 *  es muy genérico, no hay control de nada.»
 *
 * Tenía razón, y una de las cifras que faltaba era la más importante: CUÁNTO NO
 * SE PAGA. Las tomas que heredan del archivo o que repiten un plano de este mismo
 * caso desaparecían de la cuenta —`planificar` las excluye, y hace bien: no hay
 * que generarlas— así que de 204 tomas la pantalla decía «60» y no había forma de
 * saber si las otras 144 estaban hechas, sobraban, o se habían perdido.
 *
 * Y peor: sin dirección de arte, `planificar` no puede planear nada y el total
 * salía CERO, con lo que la pastilla se quedaba VACÍA. Un botón sin estado no
 * dice «todavía no», dice «aquí no pasa nada».
 * ─────────────────────────────────────────────────────────────────────────────
 */
/**
 * ¿Las tomas de esta pieza son las que saldrían de partir el guion AHORA?
 *
 * Devuelve 0 si sí, y el número de tomas que saldrían si no. Se compara por los
 * LÍMITES en el guion, no por el texto: es la pregunta exacta —«¿este reparto
 * sigue siendo el reparto?»— y la contesta igual si lo que cambió fue el guion,
 * la configuración o las reglas del segmentador.
 *
 * Se memoriza por guion + configuración: se llama en cada repintado.
 */
let repartoMirado = { firma: '', caducadas: 0 };

function tomasCaducadas(z) {
  const guion = String(z?.guion || '');
  if (!guion.trim() || !z?.tomas?.length) return 0;
  const c = P.config.segmentacion;
  const firma = `${z.id}·${guion.length}·${z.tomas.length}·${c.segundosMinimo}·${c.segundosObjetivo}·${c.segundosMaximo}·${c.caracteresPorSegundo}`;
  if (repartoMirado.firma === firma) return repartoMirado.caducadas;

  let caducadas = 0;
  try {
    const r = segmentarVerificado(guion, c);
    // Se compara por el TEXTO de cada toma, no por sus límites: los límites pueden
    // faltar en un proyecto guardado hace tiempo y el texto no falta nunca.
    const forma = (l) => l.map((t) => String(t.texto || '')).join('\u0000');
    caducadas = forma(r.tomas) === forma(z.tomas) ? 0 : r.tomas.length;
  } catch {
    // Un guion que ni siquiera se puede partir no es un reparto caducado: es otro
    // problema, y lo dice su propio botón.
    caducadas = 0;
  }
  repartoMirado = { firma, caducadas };
  return caducadas;
}

function desgloseDeFases() {
  const t = pieza().tomas;
  const escenas = pieza().escenas;
  const dirigidas = t.filter((x) => x.plano).length;
  const [voz, imagenes, clips, musica] = cuentasDeFases();

  const heredadasImg = t.filter((x) => x.plano && x.heredado).length;
  const repitenImg = t.filter((x) => x.plano && !x.heredado && x.reusa !== null && x.reusa !== undefined).length;
  const conClip = t.filter((x) => x.movimiento).length;
  const heredadosVid = t.filter((x) => x.movimiento && x.heredadoVid).length;
  const repitenVid = t.filter((x) => x.movimiento && !x.heredadoVid && x.reusa !== null && x.reusa !== undefined).length;

  // LAS TOMAS CADUCADAS, LO PRIMERO DE TODO.
  //
  // ─────────────────────────────────────────────────────────────────────────────
  // «No entiendo qué es lo que estás arreglando, nada se arregla de lo que hace.
  //  Ya redirigí todo prácticamente, igual siguen los mismos errores.»
  //
  // Y era verdad. Volver a dirigir NO vuelve a partir el guion: sus tomas seguían
  // siendo las de antes de arreglar el segmentador, con dos párrafos dentro y
  // cuarenta y nueve segundos de duración, y en la pantalla no había ni una
  // palabra que lo dijera. Se puede arreglar el segmentador diez veces seguidas
  // sin que cambie una sola toma de un episodio ya partido.
  //
  // Una toma fuera de 8-18 segundos SIN EXCUSA es la firma de un reparto viejo, y
  // aquí sale la primera con el botón que lo arregla al lado.
  // ─────────────────────────────────────────────────────────────────────────────
  const caducadas = tomasCaducadas(pieza());

  // `porque` explica un total de cero: sin él, «0/0» y «aún no se puede» se ven
  // exactamente igual.
  return [
    ...(caducadas
      ? [{
          que: 'Tomas caducadas',
          hechas: 0,
          total: t.length,
          gratis: 0,
          detalle: `partirlo ahora daría ${caducadas} tomas, no ${t.length}`,
          ancla: 'lista-voz',
          falta: 'Volver a partir',
          hacer: 'b-segmentar',
        }]
      : []),
    { que: 'Narración', hechas: voz[2], total: voz[3], gratis: 0, ancla: 'lista-voz',
      porque: t.length ? '' : 'parte el guion en tomas primero' },
    {
      que: 'Imágenes',
      hechas: imagenes[2],
      total: imagenes[3],
      gratis: heredadasImg + repitenImg,
      detalle: [
        heredadasImg ? `${heredadasImg} del archivo` : '',
        repitenImg ? `${repitenImg} repiten plano` : '',
      ].filter(Boolean).join(' · '),
      porque: dirigidas ? '' : 'falta la dirección de arte',
      ancla: 'galeria',
      // Sin dirección de arte no hay nada que ver: se ofrece HACERLA, aquí mismo.
      falta: dirigidas ? '' : 'Dirección de arte',
      hacer: dirigidas ? '' : 'b-dirigir',
    },
    {
      que: 'Clips',
      hechas: clips[2],
      total: clips[3],
      gratis: heredadosVid + repitenVid,
      detalle: [
        heredadosVid ? `${heredadosVid} del archivo` : '',
        repitenVid ? `${repitenVid} repiten plano` : '',
      ].filter(Boolean).join(' · '),
      porque: !dirigidas ? 'falta la dirección de arte' : conClip ? '' : 'ninguna toma lleva clip',
      ancla: 'lista-clips',
      falta: dirigidas ? '' : 'Dirección de arte',
      hacer: dirigidas ? '' : 'b-dirigir',
    },
    { que: 'Música', hechas: musica[2], total: musica[3], gratis: 0, ancla: 'lista-musica',
      porque: escenas.length ? '' : 'sin escenas' },
  ];
}

function pintarDesglose() {
  const caja = $('desglose');
  if (!caja) return;
  caja.className = 'desglose';
  const filas = desgloseDeFases();
  caja.innerHTML = filas
    .map((f, n) => {
      const listo = f.total > 0 && f.hechas === f.total;
      const cifra = f.total
        ? `<span class="n ${listo ? 'ok' : f.hechas ? 'falta' : ''}">${f.hechas}/${f.total}</span>` +
          (listo ? '' : ` <span class="gratis">faltan ${f.total - f.hechas}</span>`)
        : `<span class="porque">${escapar(f.porque || 'nada que generar')}</span>`;
      const gratis = f.gratis
        ? `<span class="gratis">+${f.gratis} sin pagar${f.detalle ? ` (${escapar(f.detalle)})` : ''}</span>`
        : '';
      // CADA FILA LLEVA A DONDE SE HACE. «No puedo ver las imágenes que faltan,
      // las que ya están, no puedo escuchar los audios ni la música»: se podía,
      // pero en otra pestaña y sin nada que lo dijera. Un desglose que informa y
      // no deja actuar es media herramienta.
      const ir = f.falta
        ? `<button class="btn chico primario" data-desglose="${n}">${escapar(f.falta)}</button>`
        : `<button class="btn chico fantasma" data-desglose="${n}">${f.total ? 'Ver' : 'Abrir'}</button>`;
      return `<div class="f"><b>${f.que}</b>${cifra}${gratis}${ir}</div>`;
    })
    .join('');

  for (const boton of caja.querySelectorAll('[data-desglose]')) {
    const f = filas[Number(boton.dataset.desglose)];
    boton.onclick = () => {
      // Lo que falta de verdad se HACE aquí mismo; lo demás lleva a su lista.
      if (f.hacer) return $(f.hacer)?.click();
      ir('tomas');
      const donde = $(f.ancla);
      if (donde?.scrollIntoView) donde.scrollIntoView({ block: 'start' });
    };
  }
}

/**
 * El estado de cada fase, EN SU PROPIO BOTÓN.
 *
 * «No sé qué está generado y qué no» — y era verdad: el estado existía pero solo
 * salía en un texto después de apretar algo. Ahora cada botón lleva su cuenta,
 * en verde cuando está completa y en ámbar a medias: se ve de un vistazo, antes
 * de gastar, sin apretar nada.
 */
function pintarCuentasFase() {
  pintarDesglose();
  for (const [id, , hechas, total] of cuentasDeFases()) {
    const el = $(id);
    if (!el) continue;
    // Un total de cero NO se deja en blanco: un botón sin estado no dice
    // «todavía no», dice «aquí no pasa nada». Ver `desgloseDeFases`.
    el.textContent = total ? `${hechas}/${total}` : pieza().tomas.length ? '—' : '';
    el.classList.toggle('lista', total > 0 && hechas === total);
    el.classList.toggle('a-medias', total > 0 && hechas > 0 && hechas < total);
  }

  // LA DIRECCIÓN DE ARTE, DICHA POR SU NOMBRE Y CON SU CUENTA.
  //
  // Hay dos cosas con nombre parecido y eso confundió a quien más importa: el
  // DIRECTOR (el tratamiento: una llamada que decide el documental) y la
  // DIRECCIÓN DE ARTE (la ficha de plano de cada toma, por lotes). La primera
  // salía como lista y la segunda podía faltar entera sin que ninguna parte de
  // la pantalla lo dijera: solo se descubría al darle a Imágenes.
  const t = pieza().tomas;
  const dirigidas = t.filter((x) => x.plano).length;
  const cf = $('cf-direccion');
  if (cf) {
    cf.textContent = t.length ? `${dirigidas}/${t.length}` : '';
    cf.classList.toggle('lista', t.length > 0 && dirigidas === t.length);
    cf.classList.toggle('a-medias', dirigidas > 0 && dirigidas < t.length);
  }
  const linea = $('estado-direccion');
  if (linea) {
    linea.innerHTML = !t.length
      ? ''
      : dirigidas === t.length
        ? `<p class="nota chica" style="margin:10px 0 0;color:var(--verde)">Dirección de arte ${dirigidas}/${t.length} ✓</p>`
        : `<p class="nota chica" style="margin:10px 0 0;color:#E8B54B">Dirección de arte ${dirigidas}/${t.length} — ` +
          `las imágenes y los clips salen de ella. Se completa sola al darle a Imágenes, o en Tomas → Dirección de arte.</p>`;
  }
}

function pintarPasos() {
  pintarCuentasFase();
  const t = pieza().tomas;
  const hay = {
    caso: !!pieza().caso,
    guion: !!pieza().guion.trim() && t.length > 0,
    // UNA TOMA TIENE FOTOGRAMA de tres maneras: propio, repitiendo el de otra, o
    // heredado —su imagen vive bajo otro nombre y la toma lo lleva apuntado—. Sin
    // contar la tercera, un episodio entero rescatado dejaba el botón de Montar
    // bloqueado con la revisión diciendo «todo listo: 250 materiales».
    generado:
      t.length > 0 &&
      t.every((x) => x.audio === 'ok') &&
      // Y con clip vigente tampoco hace falta imagen propia: el montaje monta el
      // clip. Es la misma cuenta que hace la hoja, y tiene que decir lo mismo.
      t.every((x) => x.reusa !== null || x.imagen === 'ok' || !!x.heredado || clipVigente(x, t)),
    montado: !!pieza().montaje,
  };

  hay.fichas = pieza().fichas.length > 0;
  hay.tratamiento = !!pieza().tratamiento;

  const marcar = (n, hecho, listo) => {
    const el = $(`paso${n}`);
    if (!el) return;
    el.classList.toggle('hecho', hecho);
    el.classList.toggle('espera', !listo && !hecho);
  };
  marcar(1, hay.caso, true);
  marcar(2, hay.fichas, hay.caso);
  marcar(3, hay.guion, hay.fichas);
  marcar(4, hay.generado, hay.guion);
  marcar(5, hay.montado, hay.generado);
  marcar(6, false, hay.montado);

  // Un botón apagado sin explicación es una pared. Cada uno dice QUÉ FALTA para
  // poder pulsarlo, en el propio paso, con palabras (§1).
  const bloquear = (boton, falta) => {
    const b = $(boton);
    if (!b) return;
    b.disabled = !!falta;
    b.title = falta || '';
  };

  bloquear('b-investigar-fondo', hay.caso ? '' : 'Elige un caso en el paso 1.');
  bloquear('b-dirigir-pieza', hay.fichas ? '' : 'Falta investigar el caso (paso 2).');
  bloquear('b-generar-guion', hay.tratamiento ? '' : 'Falta dirigir la pieza: el guion sale del tratamiento.');
  for (const b of ['b-narrar', 'b-imagenes', 'b-movimiento', 'b-musica']) {
    bloquear(b, hay.guion ? '' : 'Falta el guion partido en tomas (paso 3).');
  }
  bloquear('b-montar', hay.generado ? '' : 'Faltan narración o imágenes por generar.');
  bloquear('b-revisar', hay.guion ? '' : 'Falta el guion.');
  bloquear('b-producir', hay.caso ? '' : 'Elige un caso primero.');
}

// ── Paso 1: buscar casos y elegir uno ─────────────────────────────────────────

async function buscar() {
  P.temaId = $('tema').value;
  P.epocaId = $('epoca').value;
  P.config.genero = $('genero').value;
  // LA IDEA ESCRITA A MANO MANDA SOBRE EL TEMA DEL MENÚ.
  //
  // «No puedo sugerir yo un caso, porque no tengo nada donde escribir: tengo que
  // elegir alguno de los temas o géneros que salen ahí.» Y era verdad: los dos
  // únicos mandos eran desplegables cerrados, así que la herramienta solo sabía
  // hacer lo que a mí se me ocurrió meter en un catálogo.
  P.idea = $('idea').value.trim();
  const tema = temaPorId(P.temaId);
  const epoca = epocaPorId(P.epocaId);
  const genero = generoPorId(P.config.genero);
  const terreno = P.idea || tema?.nombre || '';

  $('zona-casos').innerHTML =
    `<p class="nota" style="margin-top:14px">` +
    `Inventando casos de ${escapar(genero.nombre.toLowerCase())}${terreno ? ` · ${escapar(terreno)}` : ''}…` +
    `</p>`;

  const r = await investigacion.proponerCasos({
    genero,
    tema: terreno,
    // La época no filtra ninguna búsqueda —no hay búsqueda—: dice CUÁNDO
    // TRANSCURRE el caso que se inventa, y en un crimen frío eso es medio género.
    epoca,
    evitar: P.casosVistos,
  });
  casos = r.casos;
  // SE GUARDAN. Antes vivían en una variable suelta y se perdían al recargar: cinco
  // propuestas pagadas que desaparecían por cerrar la pestaña.
  P.casosPropuestos = casos;
  P.casosVistos = [...new Set([...P.casosVistos, ...casos.map((c) => c.titulo)])].slice(-60);
  await guardar();
  pintarCasos();

  if (!casos.length) {
    throw new Error('No salió ninguna premisa para ese género y ese tema. Vuelve a darle, o prueba con otro tema.');
  }
  // Si se cayeron casos por fecha, se dice: si no, parece que la búsqueda vino floja.
  if (r.descartados) {
    avisar(
      'paso1',
      `Se descartaron ${r.descartados} casos anteriores a ${r.desde}. Quedan ${casos.length}. ` +
        `Dale a «Otros cinco» si quieres más.`,
    );
  }
}

accion('b-buscar-casos', buscar, 'paso1');

/**
 * Tu idea, directamente como caso, sin proponer nada.
 *
 * «No puedo sugerir yo un caso.» Hay dos formas de sugerir y las dos hacen falta:
 * dar un TERRENO —y que la herramienta proponga cinco dentro de él, que es lo que
 * hace «Inventar casos»— o traer EL CASO YA PENSADO. Esto es lo segundo: se abre
 * el episodio con lo que escribiste y de ahí en adelante todo cuelga de eso.
 */
accion(
  'b-usar-idea',
  async () => {
    const idea = $('idea').value.trim();
    if (!idea) throw new Error('Escribe tu idea arriba y vuelve a darle.');
    exigirSinTandaEnMarcha();
    P.config.genero = $('genero').value;
    P.idea = idea;

    // El título es la primera frase, o los primeros setenta caracteres: se puede
    // cambiar en Ajustes, y pedirlo aquí sería un paso más antes de empezar.
    const titulo = (idea.split(/[.\n]/)[0] || idea).trim().slice(0, 70);
    const z = estado.abrirPieza(P, {
      caso: {
        id: `c${Date.now().toString(36)}`,
        titulo,
        gancho: '',
        sinopsis: idea,
        cuando: epocaPorId(P.epocaId)?.nombre || '',
        donde: '',
        porQueFunciona: '',
        imagenSugerida: '',
        documentado: false,
        construido: true,
        fuentes: [],
      },
      titulo,
    });
    P.titulo = z.titulo;
    casos = [];
    P.casosPropuestos = [];
    await guardar();
    pintarTodo();
    avisar(
      'paso1',
      `Episodio abierto con tu idea: «${titulo}». Ahora dale al paso 2 para construir el expediente.`,
      'bueno',
    );
  },
  'paso1',
);

/** Un episodio nuevo y vacío, sin caso: para empezar de cero. */
async function empezarEpisodioNuevo() {
  exigirSinTandaEnMarcha();
  const z = estado.abrirPieza(P, { titulo: 'Episodio nuevo' });
  P.titulo = z.titulo;
  casos = [];
  P.casosPropuestos = [];
  await guardar();
  pintarTodo();
  // Y SE VA AL EPISODIO. Abrir uno y quedarse en la lista obliga a buscar por
  // dónde se sigue, que es lo mismo que no haberlo abierto.
  ir('guion');
  avisar('paso1', `Abierto ${z.id}, vacío. Elige un caso aquí o escribe tu propia idea.`, 'bueno');
}
// Desde la lista de episodios Y desde el Inicio: «no hay una forma de iniciar un
// episodio nuevo ahí».
accion('b-episodio-nuevo', empezarEpisodioNuevo, 'historial');
accion('b-inicio-nuevo', empezarEpisodioNuevo, 'inicio');

// SEGUIR: al episodio, y al paso en el que va. Es una pulsación, así que el
// salto lo pide la persona y no la aplicación.
$('b-inicio-seguir')?.addEventListener('click', () => {
  const s = siguientePaso(pieza());
  ir('guion');
  $(`paso${s.n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
accion('b-otros-casos', buscar, 'paso1');
accion('b-ir-episodios', async () => ir('episodios'), 'paso1');

function pintarCasos() {
  // Sin resultados hay que LIMPIAR: si no, se queda colgado el «Buscando en
  // internet…» de antes y parece que sigue trabajando mientras el error dice otra
  // cosa. Lo vio la prueba con la época filtrando todo.
  if (!casos.length) {
    $('zona-casos').innerHTML = '';
    return;
  }
  $('zona-casos').innerHTML =
    `<p class="nota chica" style="margin-top:15px;display:flex;align-items:center;gap:8px">` +
    `<b style="color:var(--violeta-2)">${casos.length} casos encontrados</b>` +
    `<span style="margin-left:auto">Elige uno para continuar</span></p>` +
    `<div class="casos">` +
    casos
      .map(
        (c, i) =>
          `<button class="caso${pieza().caso?.titulo === c.titulo ? ' elegido' : ''}" data-caso="${i}">` +
          `<div class="cq"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:13px;height:13px"><path d="M20 6L9 17l-5-5"/></svg></div>` +
          `<div class="lam">${escapar(c.imagenSugerida.slice(0, 110))}</div>` +
          `<div class="cb"><b>${escapar(c.titulo)}</b><p>${escapar(c.gancho)}</p>` +
          `<div class="meta">${c.cuando ? `<span>${escapar(c.cuando)}</span>` : ''}` +
          `${c.donde ? `<span>· ${escapar(c.donde)}</span>` : ''}` +
          // EL PAÍS, A LA VISTA Y ANTES DE ELEGIR. No es un dato de adorno: de él
          // sale el mundo de TODAS las imágenes del episodio —los coches, las
          // matrículas, los uniformes, por qué lado va el volante—. Si está mal,
          // hay que verlo aquí y no ciento veintiséis imágenes después.
          `${c.pais ? `<span class="pastilla">${escapar(c.pais)}</span>` : ''}` +
          `${c.construido ? '<span class="pastilla p-ok">ficción</span>' : c.documentado ? '' : '<span class="pastilla p-aviso">poco documentado</span>'}</div></div></button>`,
      )
      .join('') +
    `</div>`;

  document.querySelectorAll('[data-caso]').forEach((b) => {
    b.onclick = async () => {
      const c = casos[Number(b.dataset.caso)];
      const z = pieza();

      // Elegir un caso ABRE UNA PIEZA NUEVA, salvo que la de ahora esté sin
      // estrenar. Antes se escribía encima: quedaban las fichas del caso anterior
      // y la investigación siguiente se fusionaba con ellas, así que el director
      // acababa leyendo dos casos a la vez. La pieza anterior se queda en el
      // historial, entera, por si se quiere volver.
      const virgen = !z.caso && !z.fichas.length && !z.guion;
      if (virgen) {
        z.caso = c;
        z.tema = `${c.titulo}. ${c.sinopsis}`;
        z.titulo = c.titulo;
        if (!z.creado) z.creado = Date.now();
      } else {
        // Abre OTRO episodio: con una tanda en marcha, no.
        try {
          exigirSinTandaEnMarcha();
        } catch (e) {
          return avisar('paso1', e.message, 'malo');
        }
        estado.abrirPieza(P, { caso: c });
      }
      P.titulo = c.titulo;
      await guardar();
      pintarCasos();
      pintarTodo();
      avisar(
        'paso2',
        virgen
          ? `Caso elegido: ${c.titulo}. Ya puedes investigarlo.`
          : `Caso nuevo: ${c.titulo}. El anterior queda guardado en el historial.`,
        'bueno',
      );
    };
  });
}

/**
 * La pastilla de un caso, según de dónde salió.
 *
 * Un caso CONSTRUIDO no es «poco documentado»: no le falta documentación, es que
 * no lleva y no debe llevar. Pintarle el aviso ámbar de un caso real flojo era
 * decirle al usuario que algo está mal justo donde todo está bien — y de paso
 * escondía lo único que sí hay que ver de un vistazo: que es ficción.
 */
const pastillaDeCaso = (c) =>
  c.construido
    ? '<span class="pastilla p-ok">ficción</span>'
    : c.documentado
      ? '<span class="pastilla p-ok">documentado</span>'
      : '<span class="pastilla p-aviso">poco documentado</span>';

function pintarCasoElegido() {
  const c = pieza().caso;
  $('caso-elegido').innerHTML = c
    ? `<div class="ficha"><div class="cab">${escapar(c.cuando)} · ${escapar(c.donde)}` +
      `${c.pais ? ` · <b>${escapar(c.pais)}</b>` : ''}` +
      `${pastillaDeCaso(c)}</div>` +
      `<p><b>${escapar(c.titulo)}</b></p><p style="margin-top:6px;color:var(--tinta-2)">${escapar(c.sinopsis)}</p>` +
      (c.fuentes?.length
        ? `<div class="cita">Fuentes consultadas: ${c.fuentes.slice(0, 4).map((f) => escapar(f.titulo || f.enlace)).join(' · ')}</div>`
        : '') +
      `</div>`
    : '<p class="nota">Todavía no has elegido un caso. Ve a Inicio y busca casos.</p>';
  $('cuenta-fichas').textContent = pieza().fichas.length ? `${pieza().fichas.length} fichas` : '';

  // DÓNDE PASA, EDITABLE. Un caso propuesto antes de que el caso llevara país no
  // lo trae, y regenerarlo para recuperarlo sería perder el caso.
  $('caso-pais').value = c?.pais || '';
  $('caso-ciudad').value = c?.ciudad || '';
  $('nota-mundo').textContent = !c
    ? ''
    : c.pais
      ? `Las imágenes de este episodio se generan como ${c.ciudad ? `${c.ciudad}, ` : ''}${c.pais}.`
      : 'Sin país, las imágenes salen de un sitio indefinido: ni los coches ni los uniformes ' +
        'sabrán de dónde son. Escríbelo y se arregla sin tocar el caso.';
}

/** Guarda el sitio escrito a mano. Toca el caso y nada más: las fichas se quedan. */
async function ponerSitioDelCaso() {
  const z = pieza();
  if (!z.caso) return;
  z.caso = {
    ...z.caso,
    pais: $('caso-pais').value.trim(),
    ciudad: $('caso-ciudad').value.trim(),
  };
  await guardar();
  pintarCasoElegido();
}

// ── Paso 2: fichas y guion ────────────────────────────────────────────────────

async function buscarFichas(mas) {
  if (!pieza().caso) throw new Error('Elige un caso primero, en Inicio.');
  const nuevas = await investigacion.investigar({
    tema: pieza().tema,
    cuantas: 12,
    yaTengo: mas ? pieza().fichas : [],
  });
  pieza().fichas = mas ? [...pieza().fichas, ...nuevas] : nuevas;
  await guardar();
  pintarFichas();
  pintarReparto();
  pintarCasoElegido();
}

accion('b-fichas', () => buscarFichas(false), 'investigacion');
accion('b-mas-fichas', () => buscarFichas(true), 'investigacion');

/** Cómo se llama cada papel de una ficha construida, para leerlo. */
const NOMBRE_ROL = {
  victima: 'víctima', sospechoso: 'sospechoso', testigo: 'testigo', objeto: 'objeto',
  lugar: 'lugar', fecha: 'fecha', pistafalsa: 'pista falsa', revelacion: 'revelación',
};

function pintarFichas() {
  $('fichas').innerHTML = pieza().fichas.length
    ? pieza().fichas
        .map((f) =>
          // Una ficha construida NO enseña fiabilidad ni fuente: no las tiene, y
          // pintar «sin calificar · otra ·» al lado de cada una es ruido que además
          // insinúa que hubo una fuente. Enseña su PAPEL en el caso, que es lo que
          // de verdad la distingue de las demás.
          f.construida
            ? `<div class="ficha"><div class="cab">` +
              `<span class="pastilla p-tipo">${escapar(NOMBRE_ROL[f.rol] || f.rol || 'pieza')}</span>` +
              `<span>${f.fecha ? escapar(f.fecha) : 'construida'}</span></div>` +
              `<p>${escapar(f.afirmacion)}</p>` +
              (f.cita ? `<div class="cita">«${escapar(f.cita)}»</div>` : '') +
              `</div>`
            : `<div class="ficha"><div class="cab">` +
              `<span class="pastilla ${f.incierto ? 'p-aviso' : 'p-ok'}">${f.incierto ? 'disputado' : escapar(f.fiabilidad)}</span>` +
              `<span class="pastilla p-tipo">${escapar(f.tipoFuente)}</span>` +
              `<span>${escapar(f.fuente)}${f.fecha ? ' · ' + escapar(f.fecha) : ''}</span></div>` +
              `<p>${escapar(f.afirmacion)}</p>` +
              (f.cita ? `<div class="cita">«${escapar(f.cita)}»</div>` : '') +
              `</div>`,
        )
        .join('')
    : '<p class="nota">Todavía no hay fichas. Sin ellas no hay episodio: son de donde sale el guion.</p>';
}

/**
 * La investigación a fondo del caso elegido.
 *
 * Seis ángulos, cada uno una búsqueda distinta. Una sola pregunta trae una sola
 * versión —la del primer resultado— y con eso sale un resumen de Wikipedia con voz
 * grave, no un documental.
 */
accion(
  'b-investigar-fondo',
  async () => {
    if (!pieza().caso) throw new Error('Elige un caso primero, en el paso 1.');

    // UNA SOLA LLAMADA, y no es por ahorrar. Seis llamadas fabricarían seis
    // casos que se contradicen —el detective que se llama Roger en el minuto doce
    // y Robert en el treinta y dos—, que es justo lo que este paso existe para
    // evitar. El expediente se levanta entero de una vez o no se sostiene.
    avisar('paso2', 'Construyendo el expediente del caso, entero y de una vez…');
    const fichas = await investigacion.construirCaso({
      caso: pieza().caso,
      genero: generoPorId(P.config.genero),
      // Lo guardado desde otros episodios, para que el director sepa que ya
      // existe una costa y no la mande a generar otra vez.
      guardados: P.archivoPropio,
    });
    if (!fichas.length) throw new Error('El expediente salió vacío. Vuelve a darle.');
    // Se REEMPLAZA, no se fusiona: fusionar dos expedientes junta dos casos
    // distintos en uno, y lo único que este paso garantiza es la coherencia.
    pieza().fichas = fichas;
    await guardar();
    pintarFichas();
    pintarReparto();
    pintarCasoElegido();
    pintarPasos();
    avisar('paso2', `Expediente construido: ${fichas.length} fichas. Ya puedes dirigir y escribir el guion.`, 'bueno');
  },
  'paso2',
);

/** De qué tipo son las fuentes que sostienen el documental. */
function pintarReparto() {
  const r = investigacion.reparto(pieza().fichas);
  const NOMBRE = {
    oficial: 'oficiales', judicial: 'judiciales', policial: 'policiales',
    prensa: 'prensa', academica: 'académicas', testimonio: 'testimonios', otra: 'otras',
    ...NOMBRE_ROL,
  };
  // En un expediente construido, lo «sólido» es que estén las piezas que resuelven
  // el caso: sin revelación no hay final, y sin pista falsa no hay tercer acto.
  const SOLIDA = ['oficial', 'judicial', 'policial', 'academica', 'revelacion', 'pistafalsa'];
  const caja = $('reparto-fuentes');
  if (!caja) return;
  caja.innerHTML = Object.keys(r).length
    ? '<div class="reparto">' +
      Object.entries(r)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([k, n]) =>
            `<span class="pastilla ${SOLIDA.includes(k) ? 'p-ok' : ''}">${n} ${escapar(NOMBRE[k] || k)}</span>`,
        )
        .join('') +
      '</div>'
    : '';
}

/**
 * El director decide la pieza. Una sola llamada, y de ella beben el guion, la
 * dirección de arte, la música y la miniatura.
 */
accion(
  'b-dirigir-pieza',
  async () => {
    const yaContado = loYaContado();
    if (yaContado.length) {
      avisar('paso3', `Dirigiendo la continuación. El director lee las ${yaContado.length} partes anteriores…`);
    }
    const tr = await director.dirigirPieza({
      caso: pieza().caso,
      fichas: pieza().fichas,
      minutos: minutosObjetivo(),
      genero: generoPorId(P.config.genero),
      // Lo guardado desde otros episodios, para que el director sepa que ya
      // existe una costa y no la mande a generar otra vez.
      guardados: P.archivoPropio,
      anteriores: yaContado,
    });
    // En una continuación, el ASPECTO lo pone la primera parte, no el director:
    // dos partes de la misma serie que no se parecen no son una serie.
    const heredado = pieza().tratamiento?.soloIdentidad ? pieza().tratamiento : null;
    pieza().tratamiento = heredado
      ? { ...tr, identidadVisual: heredado.identidadVisual, musica: heredado.musica, soloIdentidad: false }
      : tr;

    // El ritmo que pide el director entra en la configuración: es él quien sabe si
    // esta pieza va lenta o va nerviosa. El tope de gasto sigue siendo del usuario.
    P.config.segmentacion.segundosObjetivo = tr.ritmo.segundosPorToma;
    P = estado.sanear(P);

    await guardar();
    pintarTratamiento();
    pintarAjustes();
    pintarPasos();
    avisar('paso3', `Dirigido: ${tr.estructura.length} actos. Ya puedes generar el guion.`, 'bueno');
  },
  'paso3',
);

function pintarTratamiento() {
  const tr = pieza().tratamiento;
  const caja = $('tratamiento');
  if (!caja) return;
  caja.innerHTML = tr
    ? `<div class="ficha" style="margin-top:13px">` +
      `<p><b>${escapar(tr.premisa)}</b></p>` +
      `<p style="margin-top:6px;color:var(--tinta-2)">${escapar(tr.hilo)}</p>` +
      `<div class="cita">Abre: ${escapar(tr.aperturaEnFrio)}</div>` +
      `<div class="reparto">` +
      tr.estructura.map((a) => `<span class="pastilla">${a.acto}. ${escapar(a.titulo)}</span>`).join('') +
      `</div>` +
      (tr.identidadVisual
        ? `<p class="nota chica" style="margin-top:9px">${escapar(tr.identidadVisual.paleta)} · ${escapar(tr.identidadVisual.luz)}</p>`
        : '') +
      // LO QUE EL EPISODIO DEJA ABIERTO A PROPÓSITO.
      //
      // Decía «Cuidado en este caso: no se puede afirmar que Elias Vance mató a
      // nadie». Elias Vance no existe: no había a quién difamar. Era una lista de
      // cautelas legales del modo de casos reales, y encima le prohibía al guion
      // contar la revelación, que es el episodio entero.
      //
      // `cuidado` se sigue leyendo para no perder los tratamientos ya dirigidos.
      ((tr.abierto ?? tr.cuidado)?.length
        ? `<div class="aviso" style="margin-top:10px"><b>Se queda abierto a propósito:</b>` +
          (tr.abierto ?? tr.cuidado).map((c) => `<span class="comoarreglar">· ${escapar(c)}</span>`).join('') +
          `</div>`
        : '') +
      `</div>`
    : '';
}

/** El guion, ya con el tratamiento del director dentro. */
accion(
  'b-generar-guion',
  async () => {
    if (!pieza().caso) throw new Error('Elige un caso primero.');
    if (!pieza().fichas.length) {
      throw new Error(
        'Todavía no hay fichas. Dale a «Investigar a fondo» primero: el guion se ' +
          'escribe a partir de ellas, y sin fichas sería opinión, no documental.',
      );
    }
    if (!pieza().tratamiento) throw new Error('Dirige la pieza primero: el guion sale del tratamiento.');
    // Una continuación nace con el ASPECTO del padre y sin su historia. Escribir
    // ahora sería escribir la primera parte otra vez, que es justo lo que no se
    // quiere de una continuación.
    if (pieza().tratamiento.soloIdentidad) {
      throw new Error(
        'Esta continuación hereda la paleta, la música y las cautelas del caso, pero ' +
          'todavía no tiene hilo propio. Dale a «Dirigir»: el director leerá lo ya ' +
          'contado y buscará lo que quedó fuera.',
      );
    }
    avisar('paso3', `${pieza().fichas.length} fichas. Escribiendo el guion…`);
    const minutos = minutosObjetivo();

    // CADA ACTO PAGADO SE GUARDA AL LLEGAR, y si el intento anterior se cayó a
    // mitad, sus actos se recogen en vez de reescribirse — solo si la estructura
    // no cambió desde entonces: reanudar sobre actos de otra estructura pegaría
    // dos documentales distintos.
    const huella = guionFase.huellaDeActos(pieza().tratamiento, minutos, generoPorId(P.config.genero));
    const parcial = pieza().actosEscritos;
    const texto = await guionFase.escribirGuion({
      tema: pieza().tema,
      fichas: pieza().fichas,
      minutos,
      tratamiento: pieza().tratamiento,
      // El género trae la estructura de bloques del episodio.
      genero: generoPorId(P.config.genero),
      // Lo guardado desde otros episodios, para que el director sepa que ya
      // existe una costa y no la mande a generar otra vez.
      guardados: P.archivoPropio,
      anteriores: loYaContado(),
      yaEscritos: parcial?.huella === huella && Array.isArray(parcial.partes) ? parcial.partes : [],
      alActo: async (parte, n) => {
        const p = pieza();
        if (p.actosEscritos?.huella !== huella) p.actosEscritos = { huella, partes: [] };
        p.actosEscritos.partes[n] = parte;
        await guardar();
      },
      alAvanzar: (n, total) => avisar('paso3', `Escribiendo el acto ${n} de ${total}…`),
    });
    // El guion completo manda; el parcial ya hizo su trabajo.
    pieza().actosEscritos = null;
    pieza().guion = texto;
    $('guion').value = texto;

    const r = segmentarVerificado(texto, P.config.segmentacion);
    // CONSERVANDO lo pagado. Aquí se tiraba: ver `repartirConservando`.
    const salvadas = repartirConservando(pieza(), r);
    await guardar();
    pintarTodo();
    // La conclusión va DONDE FUE EL PROGRESO.
    //
    // Iba a la caja del paso 2 mientras el progreso escribía en la del 3, así que
    // arriba ponía «terminado» y abajo seguía poniendo «escribiendo el acto 4 de
    // 4…» para siempre. Un aviso que no se limpia solo es un aviso que miente.
    avisoDeGuion('paso3', texto, ` ${r.tomas.length} tomas y ${r.escenas.length} escenas. ${loSalvado(salvadas)}`);
  },
  'paso3',
);

accion(
  'b-escribir',
  async () => {
    const minutos = minutosObjetivo();
    // El mismo cuaderno de actos que en el paso 3: un intento caído a mitad se
    // reanuda desde el acto que faltaba, se escriba desde donde se escriba.
    const huella = guionFase.huellaDeActos(pieza().tratamiento, minutos, generoPorId(P.config.genero));
    const parcial = pieza().actosEscritos;
    const texto = await guionFase.escribirGuion({
      tema: pieza().tema,
      fichas: pieza().fichas,
      minutos,
      tratamiento: pieza().tratamiento,
      // El género trae la estructura de bloques del episodio.
      genero: generoPorId(P.config.genero),
      // Lo guardado desde otros episodios, para que el director sepa que ya
      // existe una costa y no la mande a generar otra vez.
      guardados: P.archivoPropio,
      anteriores: loYaContado(),
      yaEscritos: parcial?.huella === huella && Array.isArray(parcial.partes) ? parcial.partes : [],
      alActo: async (parte, n) => {
        const p = pieza();
        if (p.actosEscritos?.huella !== huella) p.actosEscritos = { huella, partes: [] };
        p.actosEscritos.partes[n] = parte;
        await guardar();
      },
      alAvanzar: (n, total) => avisar('guion', `Escribiendo el acto ${n} de ${total}…`),
    });
    pieza().actosEscritos = null;
    pieza().guion = texto;
    $('guion').value = texto;
    await guardar();
    // Con números: «escrito» a secas fue justo lo que dijo la pantalla cuando el
    // guion venía con una escena y una toma.
    avisoDeGuion('guion', texto);
  },
  'guion',
);

accion(
  'b-segmentar',
  async () => {
    pieza().guion = $('guion').value;
    if (!pieza().guion.trim()) throw new Error('No hay guion que partir.');

    // §4.3: segmentar SIN comprobar la cobertura es como no haber comprobado nunca.
    const r = segmentarVerificado(pieza().guion, P.config.segmentacion);

    // Por la misma función que el otro camino: ver `repartirConservando`.
    const salvadas = repartirConservando(pieza(), r);
    await guardar();
    pintarTodo();
    avisar(
      'guion',
      `${r.tomas.length} tomas en ${r.escenas.length} escenas. Cobertura exacta: ` +
        `${r.cobertura.caracteres} caracteres, sin perder ni duplicar nada. ${loSalvado(salvadas)}`,
      'bueno',
    );
  },
  'guion',
);

accion(
  'b-guardar',
  async () => {
    pieza().guion = $('guion').value;
    P.titulo = $('titulo').value.trim() || P.titulo;
    await guardar();
    avisar('guion', 'Guardado en este teléfono.', 'bueno');
  },
  'guion',
);

accion(
  'b-subir',
  async () => {
    pieza().guion = $('guion').value;
    await estado.guardar(P, { remoto: true });
    avisar('guion', 'Guardado en tu nube. Esta es la copia buena.', 'bueno');
  },
  'guion',
);

// ── Tomas y dirección ─────────────────────────────────────────────────────────

function pintarTomas() {
  const t = pieza().tomas;
  const falta = estado.loQueFalta(pieza());
  $('cuenta-tomas').textContent = t.length ? `${t.length}` : '';
  $('cabecera-movil').textContent = `${t.length} tomas`;

  // Lo que se PAGA frente a lo que se ve. Es la cifra que importa cuando el canal
  // todavía no monetiza: un documental de 63 tomas puede costar 39 imágenes si el
  // director ha repetido bien sus motivos y hay banco de otros casos.
  const repiteDentro = t.filter((x) => x.reusa !== null && x.reusa !== undefined).length;
  const delBanco = t.filter((x) => x.heredado || x.heredadoVid).length;
  const seGeneran = t.filter((x) => !x.movimiento && x.reusa == null && !x.heredado).length;
  const clipsQueSePagan = t.filter(
    (x) => x.movimiento && x.reusa == null && !x.heredadoVid,
  ).length;

  $('cifras-tomas').innerHTML = [
    ['tomas', t.length],
    ['escenas', pieza().escenas.length],
    ['minutos', (estado.duracionDe(pieza()) / 60).toFixed(1)],
    ['imágenes que se pagan', seGeneran],
    ['repiten un motivo', repiteDentro],
    ['vienen del banco', delBanco],
    ['clips que se pagan', clipsQueSePagan],
    ['tomas con clip', t.filter((x) => x.movimiento).length],
    ['falta narrar', falta.narracion],
    ['faltan imágenes', falta.imagen],
    ['llamadas de voz', narracion.resumen(t, P.config).llamadas],
  ]
    .map(([k, v]) => `<div class="cifra"><b>${v}</b><span>${k}</span></div>`)
    .join('');

  const ahorradas = repiteDentro + delBanco;
  $('ahorro-tomas').textContent = ahorradas
    ? `De ${t.length} tomas se pagan ${seGeneran} imágenes y ${clipsQueSePagan} clips: ` +
      `${repiteDentro} tomas repiten un motivo del propio documental y ${delBanco} salen ` +
      `del banco de otros casos. ${Math.round((ahorradas / t.length) * 100)}% del material ` +
      `no se vuelve a pagar.`
    : t.length
      ? `Ninguna toma reutiliza nada todavía: se pagarían ${seGeneran} imágenes para ${t.length} tomas.`
      : '';

  $('lista-tomas').innerHTML = t.length
    ? t
        .slice(0, 80)
        .map(
          (x) =>
            `<div class="toma"><div class="cab"><span class="n">#${x.i} · esc ${x.escena} · ${(x.segundos || 0).toFixed(1)}s${x.medida ? '' : ' est.'}</span>` +
            `<span class="pastilla ${x.audio === 'ok' ? 'p-ok' : 'p-falta'}">voz</span>` +
            `<span class="pastilla ${x.reusa !== null || x.imagen === 'ok' ? 'p-ok' : 'p-falta'}">${x.reusa !== null ? `reusa #${x.reusa}` : 'imagen'}</span>` +
            (x.movimiento ? `<span class="pastilla ${x.video === 'ok' ? 'p-ok' : 'p-falta'}">clip</span>` : '') +
            `<span class="pastilla p-tipo">${escapar(x.tipoImagen)}</span>` +
            (x.corteForzado ? '<span class="pastilla p-aviso">corte forzado</span>' : '') +
            // Dónde decidió el director que la pieza respira, A LA VISTA: son
            // pocas y graduadas, y verlas aquí es lo que permite juzgar el ritmo
            // antes de gastar en nada.
            (x.respiro > 0 ? `<span class="pastilla">respira ${x.respiro}s</span>` : '') +
            `</div><p>${escapar(x.texto)}</p></div>`,
        )
        .join('')
    : '<p class="nota">Todavía no hay tomas. Genera el guion primero.</p>';
}

accion(
  'b-dirigir',
  async () => {
    if (!pieza().tomas.length) throw new Error('Parte el guion en tomas primero.');
    const tomas = await direccion.dirigir({
      tomas: pieza().tomas,
      escenas: pieza().escenas,
      tema: pieza().tema,
      config: P.config,
      tratamiento: pieza().tratamiento,
      genero: generoPorId(P.config.genero),
      // Lo guardado desde otros episodios, para que el director sepa que ya
      // existe una costa y no la mande a generar otra vez.
      guardados: P.archivoPropio,
      // Son varias llamadas y algunas tardan: sin esto parece que se ha colgado.
      alAvanzar: (hechas, total) =>
        avisar('tomas', `Dirigiendo… ${hechas} de ${total} tomas.`),
      // Cada lote pagado se guarda al llegar: un fallo en el sexto ya no tira los
      // cinco anteriores, y volver a dirigir pide solo lo que falta.
      alLote: async (parciales) => {
        pieza().tomas = parciales;
        await guardar();
      },
    });
    pieza().tomas = tomas;
    await guardar();
    // Contra la biblioteca, AHORA: si la toma del perito no queda resuelta antes
    // de darle a «Imágenes», se genera un perito nuevo y el de la biblioteca se
    // queda en el estante. El paso caro no puede depender de acordarse de pulsar
    // algo antes.
    const dela = await resolverContraBiblioteca(pieza());
    pintarTomas();
    const sin = direccion.sinDirigir(tomas);
    avisar(
      'tomas',
      sin.length
        ? `${sin.length} de ${tomas.length} tomas se quedaron sin plano (${sin.slice(0, 8).join(', ')}…). Vuelve a dirigir: solo se rehacen esas.`
        : `Dirigidas ${tomas.length} tomas. ${tomas.filter((x) => x.movimiento).length} llevan clip. ` +
          (dela ? `${dela} salen de la biblioteca y no se pagan. ` : '') +
          (tomas.filter((x) => x.desfasada).length
            ? `${tomas.filter((x) => x.desfasada).length} cambiaron de plano, así que su imagen anterior ya no vale y hay que rehacerla.`
            : 'Ninguna imagen anterior queda desfasada.'),
      sin.length ? 'malo' : 'bueno',
    );
  },
  'tomas',
);

// ── Paso 3: las fases que gastan ──────────────────────────────────────────────

// Detener vive donde se está generando. El de Inicio para la producción entera; el
// del Archivo para la tanda de la biblioteca — y son la MISMA cola, así que da
// igual cuál se pulse: lo que no puede pasar es tener que cambiar de pantalla para
// parar algo que está corriendo delante.
for (const id of ['b-detener', 'b-detener-biblioteca']) {
  $(id)?.addEventListener('click', () => {
    cola.detener();
    colaInvestiga.detener();
  });
}

/** Dirige si hace falta: sin ficha de plano no hay ni imagen ni clip. */
async function asegurarDireccion() {
  const sin = pieza().tomas.filter((t) => !t.plano).length;
  if (!sin) return;
  // Con la cuenta: «falta la dirección» a secas no dice si es una toma o todas,
  // y quien mira acaba de ver el tratamiento del director como listo.
  avisar('paso4', `Dirección de arte: faltan las fichas de plano de ${sin} de ${pieza().tomas.length} tomas. Se hacen solas…`);
  pieza().tomas = await direccion.dirigir({
    tomas: pieza().tomas,
    escenas: pieza().escenas,
    tema: pieza().tema,
    config: P.config,
    tratamiento: pieza().tratamiento,
    genero: generoPorId(P.config.genero),
    alAvanzar: (hechas, total) => avisar('paso4', `Dirigiendo… ${hechas} de ${total} tomas.`),
    alLote: async (parciales) => {
      pieza().tomas = parciales;
      await guardar();
    },
  });
  await guardar();
  // Y contra la biblioteca antes de que la fase siguiente empiece a pagar. Este
  // es el camino automático —dirigir porque falta, justo antes de generar— y es
  // precisamente donde más importa: aquí no hay nadie mirando.
  await resolverContraBiblioteca(pieza());
  pintarTomas();
}

const guardaToma = async (nueva) => {
  const k = pieza().tomas.findIndex((x) => x.i === nueva.i);
  if (k >= 0) pieza().tomas[k] = nueva;
  if (nueva?.imagen === 'ok') sellarFormato(pieza());
  archivarSiEsGenerica(nueva);
  await guardar();
  pintarTomas();
  pintarPasos();
};

/**
 * LO GENÉRICO SE ARCHIVA SOLO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Las imágenes del episodio se deben guardar automáticamente en la biblioteca
 *  para poder reutilizarse para otros episodios. Las que deben guardarse
 *  automáticamente son las genéricas; el resto tendrá su botón y yo decidiré.»
 *
 * Genérica no es una corazonada: es que el director le puso al plano una clave
 * del catálogo —`personaje: 'perito forense'`, `recurso: 'carretera comarcal de
 * noche'`—. Esa clave significa exactamente «esto no es de este caso, es del
 * canal». Lo demás —la víctima de este caso, el rompeolas de este pueblo— NO se
 * archiva solo: se archivaría la cara de Nora Kellerman como si fuera un
 * arquetipo y saldría de perito en el episodio siguiente.
 *
 * Pasa por aquí toda imagen generada, venga del botón grande o de rehacer una
 * suelta, así que no hay un segundo camino que se olvide de archivar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function archivarSiEsGenerica(toma) {
  if (toma?.imagen !== 'ok' || toma.heredado) return false;
  const generica = String(toma.personaje || toma.plano?.personaje || toma.recurso || toma.plano?.recurso || '').trim();
  if (!generica) return false;

  const clave = claveFotograma(idMaterial(), toma, pieza().tomas);
  // Ya archivada: no se duplica. Ocuparía dos sitios en la rotación de su papel y
  // la misma cara saldría el doble de veces.
  if ((P.archivoPropio || []).some((p) => p.heredado === clave)) return false;

  try {
    P.archivoPropio = [
      ...(P.archivoPropio || []),
      bibliotecaFase.entradaDeArchivo(toma, {
        pieza: idMaterial(),
        tomas: pieza().tomas,
        propios: P.archivoPropio,
        aspecto: aspectoDelCanal(),
      }),
    ];
    laBiblioteca();
    return true;
  } catch {
    // Una toma que no se puede archivar —sin nombre, ya heredada— no puede parar
    // la generación: lo que se estaba haciendo era generar una imagen.
    return false;
  }
}

/**
 * El interruptor «rehacer lo que ya está hecho».
 *
 * Las cuatro fases saben desde siempre distinguir «lo que falta» de «todo»; lo
 * que faltaba era la forma de pedírselo. Sin esto, cambiar de voz o de estilo no
 * servía de nada: se pulsaba generar y contestaba «ya está toda la narración»,
 * con la voz vieja dentro y sin manera de rehacerla.
 */
const rehacerTodo = () => !!$('rehacer-todo')?.checked;

accion('b-narrar', async () => {
  const soloLasQueFaltan = !rehacerTodo();
  const bloques = narracion.planificar(pieza().tomas, P.config, { soloLasQueFaltan });
  if (!bloques.length) return avisar('paso4', 'Ya está toda la narración.', 'bueno');
  if (!soloLasQueFaltan && !confirm(`Se rehacen las ${bloques.length} llamadas de voz, incluidas las que ya estaban. ¿Sigo?`)) return;

  // §4.5: el progreso se cuenta en LLAMADAS, no en tomas.
  const r = await cola.ejecutar(
    'narración',
    bloques,
    (bloque, _i, senal, alEsperar) =>
      narracion.narrarBloque({ bloque, pieza: idMaterial(), config: P.config, senal, alEsperar }),
    {
      alTerminarUno: async (tomasNuevas) => {
        for (const t of tomasNuevas) await guardaToma(t);
      },
    },
  );
  informar(r, 'narración');
});

accion('b-imagenes', async () => {
  await asegurarDireccion();
  const soloLasQueFaltan = !rehacerTodo();
  const pendientes = imagenFase.planificar(pieza().tomas, { soloLasQueFaltan });
  if (!pendientes.length) return avisar('paso4', 'Ya están todas las imágenes.', 'bueno');
  if (!soloLasQueFaltan && !confirm(`Se rehacen las ${pendientes.length} imágenes, incluidas las que ya estaban. ¿Sigo?`)) return;

  const r = await cola.ejecutar(
    'imágenes',
    pendientes,
    (toma, _i, senal, alEsperar) =>
      imagenFase.generarImagen({
        toma,
        tomas: pieza().tomas,
        pieza: idMaterial(),
        config: P.config,
        tratamiento: pieza().tratamiento,
        // El país del caso, para que el coche, las matrículas y los uniformes
        // sean los de donde pasa la historia.
        mundo: mundoDeLaPieza(),
        senal,
        alEsperar,
      }),
    { alTerminarUno: guardaToma },
  );
  informar(r, 'imágenes');
});

accion('b-movimiento', async () => {
  await asegurarDireccion();
  const pendientes = movimiento.planificar(pieza().tomas, { soloLasQueFaltan: !rehacerTodo() });
  if (!pendientes.length) return avisar('paso4', 'No falta ningún clip.', 'bueno');
  if (!confirm(`Son ${pendientes.length} clips y es la fase más cara con diferencia. ¿Sigo?`)) return;

  const r = await cola.ejecutar(
    'movimiento',
    pendientes,
    (toma, _i, senal, alEsperar) =>
      movimiento.generarClip({
        toma,
        tomas: pieza().tomas,
        pieza: idMaterial(),
        config: P.config,
        // El clip parte de la imagen, y si falta se genera aquí: hace falta el
        // tratamiento para que salga con la misma paleta que las demás.
        tratamiento: pieza().tratamiento,
        senal,
        alEsperar,
        aviso: (m) => ($('progreso').textContent = m),
      }),
    { alTerminarUno: guardaToma },
  );
  informar(r, 'movimiento');
  // Un clip recién pagado puede servirle a su plano gemelo, ahora mismo.
  await emparejarGemelos('paso4');
});

// ── La biblioteca permanente del canal ────────────────────────────────────────
//
// Es la única inversión de una sola vez que hace este proyecto: los arquetipos
// que declaran y los recursos transversales se pagan aquí y NINGÚN episodio los
// vuelve a pagar. Vive en su propia pieza, con claves bajo `biblioteca/`, y no se
// monta nunca.

/** La pieza de biblioteca, creada o puesta al día desde el catálogo. */
/**
 * La pieza de biblioteca, creada o puesta al día.
 *
 * La regla que importa —NADIE cambia el objeto de la pieza— vive en
 * `sincronizarEnSitio`, junto al sincronizador. Está ahí y no aquí porque es una
 * regla del modelo de datos, y porque en la pantalla no se podía comprobar: la
 * invariante que la vigila necesita ejecutarla.
 */
function laBiblioteca() {
  // CON LO GUARDADO DESDE LOS EPISODIOS. Sin pasarlo aquí, las entradas propias
  // desaparecerían en la primera sincronización: el archivo se reconstruye desde
  // el catálogo, y lo que no esté en él no sobrevive.
  // La biblioteca DE ESTE FORMATO. Las de los otros formatos siguen en el
  // proyecto con sus imágenes pagadas y no se tocan.
  return bibliotecaFase.sincronizarEnSitio(P.piezas, P.archivoPropio, aspectoDelCanal());
}

function pintarBiblioteca() {
  pintarResumenBiblioteca();
  pintarGaleriaBiblioteca();
  // EL BOTÓN DE TRAER, encendido solo cuando hay algo que traer y huecos donde
  // ponerlo. Ver `traerDeOtroFormato`.
  const b = $('b-traer-formato');
  if (!b) return;
  const suyo = aspectoDelCanal();
  const otra = (P.piezas || []).find(
    (z) => z.esBiblioteca && bibliotecaFase.aspectoPieza(z) !== suyo && (z.tomas || []).some((t) => t.imagen === 'ok'),
  );
  const huecos = tomasParaPintar().some((t) => t.imagen !== 'ok' && !t.heredado);
  const desde = otra ? bibliotecaFase.aspectoPieza(otra) : '';
  b.classList.toggle('oculto', !(desde && huecos));
  if (desde && huecos) {
    b.textContent = `Traer las de ${desde} recortadas al centro`;
    b.onclick = () => traerBibliotecaDe(desde);
  }
}

/**
 * Trae a este formato lo que ya está generado en otro. UNA VEZ, y gratis.
 *
 * «Todas las imágenes y videoclips que ya están en nueve dieciséis, simplemente
 *  las utilicemos también en dieciséis nueve, recortándole y que se vea solo el
 *  centro, y eso ya quede como biblioteca del formato dieciséis nueve.»
 *
 * No genera ni recorta nada: la entrada nueva apunta al MISMO archivo y el
 * recorte al centro lo hace el montaje él solo. Lo que ya esté generado en este
 * formato no se toca.
 */
async function traerBibliotecaDe(desde) {
  const hacia = aspectoDelCanal();
  if (!desde || desde === hacia) return;
  const r = bibliotecaFase.traerDeOtroFormato(P.piezas, P.archivoPropio, desde, hacia);
  if (r.entradas.length) P.archivoPropio = [...(P.archivoPropio || []), ...r.entradas];
  laBiblioteca();
  await guardar();
  pintarTodo();
  const n = r.tomas + r.entradas.length;
  avisar(
    'biblioteca',
    n
      ? `${n} ${n === 1 ? 'entrada traída' : 'entradas traídas'} de ${desde} a ${hacia}. ` +
        'No se ha pagado nada: apuntan al mismo material y el montaje las recorta al centro. ' +
        'Lo que generes de ahora en adelante en este formato las va sustituyendo.'
      : `No había nada en ${desde} que traer.`,
    'bueno',
  );
}

/** Las cifras de arriba, que son HTML barato y se pueden repintar solas. */
function pintarResumenBiblioteca() {
  const caja = $('resumen-biblioteca');
  if (!caja) return;
  const tomas = tomasParaPintar();
  const r = bibliotecaFase.resumenBiblioteca(tomas, P.config.movimiento.politica);
  // EN QUÉ FORMATO ESTÁ ESTA BIBLIOTECA, LO PRIMERO.
  //
  // Hay una por formato, y la pantalla enseña la del formato en el que se está
  // trabajando. Sin decirlo, cambiar el canal de 9:16 a 16:9 parece haber borrado
  // ciento veintiséis imágenes pagadas: no se han borrado, están en la otra.
  const suyo = aspectoDelCanal();
  const otras = (P.piezas || []).filter(
    (z) => z.esBiblioteca && bibliotecaFase.aspectoPieza(z) !== suyo,
  );
  const enOtras = otras.reduce((n, z) => n + (z.tomas || []).filter((t) => t.imagen === 'ok').length, 0);

  caja.innerHTML =
    `<div class="reparto">` +
    `<span class="pastilla p-ok">${escapar(suyo)}</span>` +
    `<span class="pastilla ${r.imagenesFaltan ? '' : 'p-ok'}">${r.total - r.imagenesFaltan} de ${r.total} imágenes</span>` +
    // GENERADA NO ES BUENA, y por eso son dos cifras y no una. La de en medio es la
    // que faltaba: cuántas he mirado yo.
    `<span class="pastilla ${r.porRevisar ? 'p-aviso' : 'p-ok'}">${r.aprobadas} aprobadas</span>` +
    (r.porRevisar ? `<span class="pastilla p-aviso">${r.porRevisar} por revisar</span>` : '') +
    `<span class="pastilla ${r.clipsFaltan ? '' : 'p-ok'}">${r.clips - r.clipsFaltan} de ${r.clips} clips</span>` +
    `<span class="pastilla">${r.personajes} personas en ${r.papeles} papeles</span>` +
    `<span class="pastilla">${r.recursos} versiones de ${r.sitios} sitios</span>` +
    `</div>` +
    // Qué le tocó a este episodio, y a los anteriores: es lo que hace visible que
    // la rotación existe. Sin enseñarlo, «no repite» es un acto de fe.
    (enOtras
      ? `<p class="nota chica" style="margin-top:8px">Y ${enOtras} ` +
        `${enOtras === 1 ? 'imagen guardada' : 'imágenes guardadas'} en ${otras.length === 1 ? 'la biblioteca' : 'las bibliotecas'} de ` +
        `${otras.map((z) => escapar(bibliotecaFase.aspectoPieza(z))).join(' y ')}. ` +
        `No se han perdido: cada formato tiene la suya, y un episodio solo usa la del suyo. ` +
        `Cambia el formato en Ajustes para verlas.</p>`
      : '') +
    (Object.keys(P.reparto || {}).length
      ? `<p class="nota chica" style="margin-top:8px">Reparto por episodio: ` +
        ordenDeEpisodios()
          .filter((id) => P.reparto[id])
          .slice(-4)
          .map((id) => `<b>${escapar(id)}</b> ${Object.values(P.reparto[id]).length} elegidos`)
          .join(' · ') +
        `</p>`
      : '');
}

// ── La galería de la biblioteca ───────────────────────────────────────────────
//
// «Solamente puedo darle al botón de generar todo, y genera las imágenes que le da
//  la gana; yo no puedo ver lo que está generando. Si una imagen sale deforme, así
//  se queda, porque yo no tengo control sobre eso. Cada imagen, para poder verla,
//  con su botón de reintentar.»
//
// La biblioteca tenía dos botones de generar todo y NINGUNA manera de ver lo
// generado. Eso no es un descuido de interfaz: la biblioteca es permanente, así
// que una cara deforme sale en todos los episodios del canal, para siempre, y
// además se convierte en clip —la fase más cara— sin que nadie la haya mirado.
//
// Aquí está cada una: se ve, se rehace la que salga mal, y se le da el visto bueno
// a la que valga. Y el clip solo se ofrece sobre lo aprobado (`clipsPosibles`).

/**
 * Las tomas que se pintan: el catálogo completo, con lo guardado encima.
 *
 * SIN MUTAR NADA. Pintar no puede escribir en el proyecto —se repinta muchas veces
 * y por muchos motivos—, pero la lista tiene que estar entera: si se pintara solo
 * lo guardado, una biblioteca a medias enseñaría cuatro fichas y las 137 que faltan
 * no existirían en pantalla, que es no poder generarlas. `sincronizarBiblioteca`
 * conserva los índices de lo ya pagado, así que lo que se ve y lo que se genera
 * hablan de la misma toma.
 */
function tomasParaPintar() {
  // CON EL FORMATO, las dos veces. Sin decirlo aquí, la pantalla pintaba la
  // primera biblioteca que encontraba —la vertical— mientras el episodio resolvía
  // contra la horizontal: se veían las imágenes de 9:16 metidas en fichas de 16:9
  // y parecía que el formato no se estaba aplicando.
  const suyo = aspectoDelCanal();
  return bibliotecaFase.sincronizarBiblioteca(estado.bibliotecaDe(P, suyo), P.archivoPropio, suyo).tomas;
}

const filtroBiblioteca = { estado: 'todas', grupo: '', tope: 24 };

const FILTROS_BIBLIOTECA = [
  ['todas', 'Todas'],
  ['faltan', 'Sin generar'],
  ['porRevisar', 'Por revisar'],
  ['aprobadas', 'Aprobadas'],
  ['conClip', 'Con clip'],
];

/** Cómo se llama esta toma en pantalla: «perito forense · v3», «el precinto · v1». */
function rotuloDeBiblioteca(t) {
  const a = t.personaje ? elenco.arquetipoPorId(t.personaje) : null;
  const r = t.recurso ? elenco.recursoPorId(t.recurso) : null;
  const nombre = a?.nombre || r?.lugar || t.clave || `toma ${t.i + 1}`;
  const v = (a || r)?.variantes?.find((x) => x.id === t.variante);
  return { nombre, detalle: v?.persona || v?.matiz || '', variante: t.variante };
}

/**
 * ¿Entra esta toma en lo que se está mirando?
 *
 * Toma el filtro POR PARÁMETRO y no del estado global: el rótulo de cada pastilla
 * lleva su cuenta —«Por revisar (37)»—, y calcularlas empujando y devolviendo el
 * filtro global era dejar la pantalla en el filtro equivocado en cuanto una de
 * esas cuentas fallara a mitad.
 */
function pasaElFiltro(t, { estado = 'todas', grupo = '' } = {}) {
  if (grupo === 'recursos' ? !t.recurso : grupo && t.personaje !== grupo) return false;
  switch (estado) {
    case 'faltan':
      return t.imagen !== 'ok';
    case 'porRevisar':
      return t.imagen === 'ok' && !t.aprobada;
    case 'aprobadas':
      return !!t.aprobada;
    case 'conClip':
      return t.video === 'ok';
    default:
      return true;
  }
}

let versionBiblioteca = 0;

/**
 * LAS URL DE OBJETO SE REUTILIZAN Y SE SUELTAN. Sin esto, Safari mata la pestaña.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Cada vez que le apruebo una foto, se reinicia el navegador. No sé si es que
 *  está muy pesado, no soporta o qué.»
 *
 * Era exactamente eso, y la cuenta sale sola: aprobar una imagen repintaba la
 * galería ENTERA, y cada tarjeta hacía `URL.createObjectURL(blob)` — veinticuatro
 * URL nuevas por aprobación—. Una URL de objeto MANTIENE VIVO EL BLOB hasta que
 * se revoca, y aquí no se revocaba ninguna: se creaban trece en toda la
 * aplicación y se soltaban cuatro.
 *
 * Con imágenes de uno o dos megas, diez aprobaciones son doscientas y pico URL y
 * varios cientos de megas retenidos. Safari en un iPhone no llega ahí: descarga la
 * pestaña y la recarga. Y como la contraseña estaba en la sesión, la recarga te
 * echaba fuera. Los dos síntomas eran el mismo fallo.
 *
 * Se guarda una URL por clave y se sueltan las que ya no se ven, así que la
 * memoria queda acotada a lo que hay en pantalla en vez de crecer sin fin.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const urlesDeMaterial = new Map();

/**
 * Qué nodo pinta cada toma, para poder refrescar UNA sin repintar las demás.
 *
 * Aprobar una imagen repintaba la galería entera: veinticuatro lecturas del
 * almacén y veinticuatro tarjetas nuevas por un botón que solo cambia una. En un
 * teléfono eso se nota, y con las URL sin soltar era lo que tumbaba la pestaña.
 */
const fichasDeBiblioteca = new Map();

function urlDeMaterial(clave, blob) {
  const ya = urlesDeMaterial.get(clave);
  if (ya) return ya;
  const url = URL.createObjectURL(blob);
  urlesDeMaterial.set(clave, url);
  return url;
}

/**
 * UNA IMAGEN REHECHA SE VE REHECHA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Hay imágenes que han salido mal, las regenero, y se sigue mostrando la misma
 *  imagen primera que había salido mal.»
 *
 * La imagen nueva SÍ llegaba: se generaba, se subía, la copia local se tiraba y
 * se bajaba la nueva. Lo que no se tiraba era la URL de objeto de la galería:
 * el almacén de arriba guarda una por clave para no fugar memoria, y con la
 * clave en pantalla nadie la soltaba. La tarjeta seguía enseñando el blob viejo
 * con el nuevo ya en el teléfono.
 *
 * Se suelta aquí, avisados por la única puerta por la que pasa toda escritura.
 * No se revoca en el acto: si la tarjeta está en pantalla se quedaría en blanco
 * a mitad de una tanda. Se aparta, y el siguiente repintado —que la sustituye—
 * la revoca.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const urlesCaducadas = [];

function soltarUrl(clave) {
  const url = urlesDeMaterial.get(clave);
  if (!url) return;
  urlesDeMaterial.delete(clave);
  urlesCaducadas.push(url);
}

alEscribirMaterial((clave) => {
  soltarUrl(clave);
  // Y la previa preparada tampoco vale: tenía dentro la versión anterior.
  if (preparada) {
    preparada = null;
    pintarTiras();
  }
});

/**
 * EL CLIP QUE SE ESTÁ VIENDO, y solo uno.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Generé treinta y ocho clips y no puedo ver ninguno.»
 *
 * Era literal: la ficha del archivo solo cargaba la IMAGEN. Un clip pagado se
 * anunciaba con una pastilla verde —«clip listo»— y no había ninguna manera de
 * verlo. Treinta y ocho veces lo más caro que genera esta herramienta, invisible.
 *
 * Y se enseña DE UNO EN UNO a propósito. Un clip son decenas de megas, y cargar
 * los veinticuatro de la pantalla es exactamente lo que acaba de tumbar el
 * navegador con imágenes de dos megas. Al abrir uno se suelta el anterior: en
 * memoria hay como mucho un video, que es también como se ven.
 * ─────────────────────────────────────────────────────────────────────────────
 */
let clipEnPantalla = null;

function soltarClip() {
  if (!clipEnPantalla) return;
  URL.revokeObjectURL(clipEnPantalla.url);
  clipEnPantalla = null;
}

/**
 * Carga un clip y lo pone en el hueco de su ficha. Suelta el que hubiera antes.
 *
 * Va aparte del almacén de imágenes porque su regla es otra: las imágenes se
 * quedan mientras se vean, y los clips solo mientras se miran.
 */
async function verClip({ tarjeta, hueco, clave, boton }) {
  boton.disabled = true;
  const rotulo = boton.textContent;
  boton.textContent = '…';
  try {
    const blob = await materialLocal(clave, 'video/mp4');
    if (!blob) {
      boton.textContent = 'no se pudo cargar';
      return;
    }
    soltarClip();
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.src = url;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    tarjeta.replaceChild(video, hueco);
    clipEnPantalla = { clave, url };
    boton.remove();
  } catch (e) {
    boton.textContent = rotulo;
    boton.disabled = false;
    throw e;
  }
}

/** Suelta todo lo que ya no está en pantalla, y lo que caducó al reescribirse. */
function soltarUrles(enUso, dentroDe = '') {
  for (const url of urlesCaducadas.splice(0)) URL.revokeObjectURL(url);
  for (const [clave, url] of urlesDeMaterial) {
    if (enUso.has(clave)) continue;
    // SOLO LO DE ESTA GALERÍA. El Archivo y el episodio comparten este almacén, y
    // sin acotar, repintar uno soltaría las imágenes del otro — que las volvería a
    // crear en su siguiente repintado. Cada galería limpia lo suyo.
    if (dentroDe && !clave.startsWith(dentroDe)) continue;
    URL.revokeObjectURL(url);
    urlesDeMaterial.delete(clave);
  }
}

function pintarGaleriaBiblioteca() {
  const g = $('galeria-biblioteca');
  if (!g) return;
  const mia = ++versionBiblioteca;
  const tomas = tomasParaPintar();

  // Los filtros, y el grupo. Con 141 tarjetas, «ver las que faltan por revisar» es
  // la diferencia entre repasar la biblioteca y no repasarla nunca.
  const chips = $('filtros-biblioteca');
  if (chips) {
    chips.innerHTML = '';
    for (const [id, rotulo] of FILTROS_BIBLIOTECA) {
      const b = document.createElement('button');
      b.className = `chip${filtroBiblioteca.estado === id ? ' on' : ''}`;
      const cuantas = tomas.filter((t) => pasaElFiltro(t, { estado: id, grupo: filtroBiblioteca.grupo })).length;
      b.textContent = `${rotulo} (${cuantas})`;
      b.onclick = () => {
        filtroBiblioteca.estado = id;
        filtroBiblioteca.tope = 24;
        pintarGaleriaBiblioteca();
      };
      chips.appendChild(b);
    }
  }

  const sel = $('grupo-biblioteca');
  if (sel) {
    const papeles = [...new Set(tomas.filter((t) => t.personaje).map((t) => t.personaje))];
    const opciones = [
      { id: '', etiqueta: 'Todo el catálogo' },
      { id: 'recursos', etiqueta: 'Sitios y objetos' },
      ...papeles.map((p) => ({ id: p, etiqueta: elenco.arquetipoPorId(p)?.nombre || p })),
    ];
    // §7.3: el selector devuelve con qué se quedó y quien lo pinta lo escribe.
    filtroBiblioteca.grupo = pintarSelector(sel, opciones, filtroBiblioteca.grupo);
    sel.onchange = () => {
      filtroBiblioteca.grupo = sel.value;
      filtroBiblioteca.tope = 24;
      pintarGaleriaBiblioteca();
    };
  }

  const todas = tomas.filter((t) => pasaElFiltro(t, filtroBiblioteca));
  const visibles = todas.slice(0, filtroBiblioteca.tope);
  g.innerHTML = '';
  if (!todas.length) {
    g.innerHTML = '<p class="nota">No hay nada aquí con ese filtro.</p>';
  }

  fichasDeBiblioteca.clear();
  for (const x of visibles) {
    const ficha = tarjetaDeBiblioteca(x, tomas, mia);
    fichasDeBiblioteca.set(x.i, ficha);
    g.appendChild(ficha);
  }

  // Y SE SUELTA LO QUE YA NO SE VE. Sin esto la memoria solo sube: ver
  // `urlesDeMaterial`. Se calcula sobre lo que queda en pantalla, no sobre lo que
  // se acaba de pintar, para que cambiar de filtro también libere.
  soltarUrles(
    new Set(visibles.map((x) => claveFotograma(bibliotecaFase.ID_BIBLIOTECA, x, tomas))),
    `${bibliotecaFase.ID_BIBLIOTECA}/`,
  );

  const mas = $('b-biblioteca-mas');
  if (mas) {
    mas.style.display = todas.length > visibles.length ? '' : 'none';
    mas.textContent = `Ver más (${todas.length - visibles.length} restantes)`;
  }
}

/** Una tarjeta: la imagen, lo que es, y los tres mandos que faltaban. */
function tarjetaDeBiblioteca(x, tomas, mia) {
  const d = document.createElement('div');
  d.className = `pieza-mat${x.aprobada ? ' aprobada' : ''}`;
  const hay = x.imagen === 'ok';
  // ¿El clip que hay le corresponde a la imagen que hay? Es lo único que decide
  // si se puede ver, si se puede pedir otro y qué dice la pastilla.
  const vigente = clipVigente(x, tomas);
  const { nombre, detalle, variante } = rotuloDeBiblioteca(x);

  const visual = document.createElement('div');
  visual.className = 'sin';
  visual.textContent = hay ? 'cargando…' : 'sin generar';
  d.appendChild(visual);

  const cuerpo = document.createElement('div');
  cuerpo.className = 'cuerpo';
  cuerpo.innerHTML =
    `<p><b>${escapar(nombre)}</b> · ${escapar(variante)}<br>${escapar(detalle.slice(0, 90))}</p>` +
    // El encargo cambió debajo de esta imagen —el plano del catálogo o una regla
    // del canal—: sigue estando y sigue pagada, pero ya no es lo que se pide. Se
    // dice, y se pierde el visto bueno.
    (x.desfasada ? '<span class="pastilla p-falta">hay que rehacerla</span>' : '') +
    // TRAÍDA DE OTRO FORMATO: en el montaje se ve su tercio central, no la imagen
    // entera. Se dice, porque en la ficha se ve completa y en el video no.
    (x.recortada ? `<span class="pastilla p-aviso">recortada de ${escapar(x.recortada)}</span>` : '') +
    (x.aprobada ? '<span class="pastilla p-ok">aprobada</span>' : hay ? '<span class="pastilla p-aviso">por revisar</span>' : '') +
    // «CLIP LISTO» SOLO SI EL CLIP ES DE LA IMAGEN QUE HAY AHORA. Con la bandera
    // suelta, un clip de la imagen descartada seguía anunciándose en verde y ni
    // siquiera dejaba pedir uno nuevo. Ver `clipVigente`.
    (vigente
      ? '<span class="pastilla p-ok">clip listo</span>'
      : x.video === 'ok'
        ? '<span class="pastilla p-falta">el clip es de la imagen anterior</span>'
        : x.movimiento
          ? '<span class="pastilla">lleva clip</span>'
          : '');
  d.appendChild(cuerpo);

  // EL CLIP, SI LO TIENE. Se carga al tocarlo y no antes: son decenas de megas y
  // hay veinticuatro fichas en pantalla. Ver `verClip`.
  if (vigente) {
    const ver = document.createElement('button');
    ver.className = 'btn chico fantasma';
    ver.textContent = 'Ver el clip';
    ver.onclick = () =>
      verClip({
        tarjeta: d,
        hueco: d.firstChild,
        clave: claveClip(bibliotecaFase.ID_BIBLIOTECA, x, tomas),
        boton: ver,
      }).catch((e) => avisar('biblioteca', e.message, 'malo'));
    cuerpo.appendChild(ver);
  }

  if (hay) {
    const clave = claveFotograma(bibliotecaFase.ID_BIBLIOTECA, x, tomas);
    materialLocal(clave, 'image/png').then((blob) => {
      if (mia !== versionBiblioteca) return;
      if (!blob) {
        visual.textContent = 'no se pudo cargar';
        return;
      }
      const img = document.createElement('img');
      // Por el almacén de URL: repintar no puede crear una URL nueva de un blob
      // que ya está en pantalla. Ver `urlesDeMaterial`.
      img.src = urlDeMaterial(clave, blob);
      img.alt = '';
      img.loading = 'lazy';
      d.replaceChild(img, visual);
    });
  }

  // 1 · GENERAR / REHACER. El botón que faltaba: una imagen deforme deja de ser
  // definitiva.
  const b = document.createElement('button');
  b.className = 'btn chico fantasma';
  b.textContent = hay ? 'Rehacer' : 'Generar';
  b.onclick = async () => {
    b.disabled = true;
    const rotulo = b.textContent;
    b.textContent = '…';
    try {
      await rehacerImagenBiblioteca(x.i);
    } catch (e) {
      avisar('biblioteca', e.message, 'malo');
      b.textContent = rotulo;
      b.disabled = false;
    }
  };
  cuerpo.appendChild(b);

  // 2 · EL VISTO BUENO. De él cuelga el gasto en clips, así que es un botón y no
  // una casilla escondida.
  if (hay) {
    const v = document.createElement('button');
    v.className = 'btn chico fantasma';
    v.textContent = x.aprobada ? 'Quitar el visto bueno' : 'Está bien';
    v.onclick = async () => {
      v.disabled = true;
      try {
        await aprobarBiblioteca(x.i, !x.aprobada);
      } catch (e) {
        avisar('biblioteca', e.message, 'malo');
        v.disabled = false;
      }
    };
    cuerpo.appendChild(v);
  }

  // 3 · EL CLIP, EN TODAS, y solo sobre lo aprobado.
  //
  // «Todas las imágenes deben tener su botón para generar el video, todas. Mientras
  //  más videos logres generar, mucho mejor para que se vea el documental. Yo
  //  decidiré cuáles utilizar; lo que no lleve video usará la imagen.»
  //
  // El botón salía solo donde el catálogo proponía movimiento —el reparto— y los
  // sitios y objetos no lo tenían: para animar un archivador no había ninguna
  // manera. Y era una decisión mía disfrazada de dato: el catálogo propone dónde
  // GASTAR POR DEFECTO, no dónde se PUEDE. Ahora se puede en todas y lo decide
  // quien paga, que es como está el resto de la herramienta.
  //
  // Lo que no se toca: sigue haciendo falta la imagen y su visto bueno. El clip
  // sale de la imagen y es la fase más cara.
  if (!vigente && P.config.movimiento.politica.bibliotecaConVideo) {
    const c = document.createElement('button');
    c.className = 'btn chico fantasma';
    const enFila = estadoEnFilaBiblioteca(x.i);
    const rotulo = enFila || (hay ? (x.aprobada ? 'Generar su clip' : 'Apruébala para el clip') : 'Primero la imagen');
    c.textContent = rotulo;
    c.disabled = !!enFila || !hay || !x.aprobada;
    c.onclick = async () => {
      c.disabled = true;
      c.textContent = '…';
      try {
        await clipDeBiblioteca(x.i, (m) => (c.textContent = m.length > 22 ? `${m.slice(0, 20)}…` : m));
      } catch (e) {
        avisar('biblioteca', e.message, 'malo');
        c.textContent = rotulo;
        c.disabled = false;
      }
    };
    cuerpo.appendChild(c);
  }
  return d;
}

/**
 * Rehacer UNA imagen de la biblioteca.
 *
 * El visto bueno se cae solo: lo que se aprobó era la imagen anterior, y una
 * aprobación heredada por la siguiente sería exactamente el agujero por el que se
 * cuela un clip pagado sobre una cara deforme.
 */
async function rehacerImagenBiblioteca(i) {
  const z = laBiblioteca();
  const k = z.tomas.findIndex((t) => t.i === i);
  if (k < 0) throw new Error('No encuentro esa toma de la biblioteca.');
  // ── EL CLIP DE UNA IMAGEN QUE SE REHACE NO SOBREVIVE ──────────────────────
  //
  // «Rehíce una imagen que ya tenía clip. Obviamente ese clip tiene que quedar
  //  inutilizable, eliminado por completo, porque si rehago la imagen es porque
  //  estaba mala. Entonces me sigue usando el clip de la imagen mala.»
  //
  // Esto AVISABA y no hacía nada: dejaba `video: 'ok'` puesto. Así que el clip de
  // la cara deforme seguía dándose por bueno, el montaje lo seguía usando, y la
  // ficha ni siquiera ofrecía generar uno nuevo —porque para ella ya lo tenía—.
  // Un aviso no es una consecuencia.
  //
  // Rehacer la imagen es decir que la anterior estaba mal. Todo lo que salió de
  // ella está mal también: se marca como no generado y SE BORRA DEL ALMACÉN, para
  // que no quede un archivo de una imagen mala esperando a que alguien lo use.
  const tenia = z.tomas[k].video === 'ok' || !!z.tomas[k].heredadoVid;
  if (
    tenia &&
    !confirm(
      'Esta ya tiene su clip, y ese clip salió de la imagen que vas a rehacer.\n\n' +
        'Se BORRA con ella: no sirve para la imagen nueva. Después podrás generar uno ' +
        'nuevo desde su ficha, cuando apruebes la imagen. ¿Sigo?',
    )
  ) {
    return;
  }
  avisar('biblioteca', `Rehaciendo «${rotuloDeBiblioteca(z.tomas[k]).nombre}»…`);
  const clave = claveFotograma(bibliotecaFase.ID_BIBLIOTECA, z.tomas[k], z.tomas);
  const claveVieja = tenia ? claveClip(bibliotecaFase.ID_BIBLIOTECA, z.tomas[k], z.tomas) : '';
  const nueva = await imagenFase.generarImagen({
    toma: z.tomas[k],
    tomas: z.tomas,
    pieza: bibliotecaFase.ID_BIBLIOTECA,
    config: P.config,
    tratamiento: null,
  });
  // El visto bueno se cae —lo aprobado era la imagen anterior— y con él el clip.
  // `movimiento` se CONSERVA: sigue siendo una toma que merece moverse, solo que
  // ahora le falta el clip. Es lo que hace que la ficha vuelva a ofrecerlo.
  z.tomas[k] = { ...nueva, aprobada: false, video: null, heredadoVid: null, bytesVideo: 0 };
  await refrescar(clave);
  if (claveVieja) await tirarElClip(claveVieja);
  await guardar();
  pintarBiblioteca();
  avisar(
    'biblioteca',
    tenia
      ? 'Imagen rehecha y su clip viejo borrado. Míralas, dale «Está bien» si vale, y genérale un clip nuevo si lo quieres.'
      : 'Imagen rehecha. Míralas y dale «Está bien» si vale.',
    'bueno',
  );
}

/**
 * Tira un clip: del almacén, de la copia local y de la memoria.
 *
 * Se borra DE VERDAD y no solo se desmarca. Un archivo de video hecho a partir de
 * una imagen que se descartó no le sirve a nadie, y dejarlo ahí es dejar que
 * cualquier camino que mire el almacén en vez del proyecto lo dé por bueno — que
 * es exactamente cómo se recupera material tras un corte de red.
 */
async function tirarElClip(clave, donde = 'biblioteca') {
  soltarClip();
  await refrescar(clave);
  try {
    await llamar('borrar', { clave });
  } catch (e) {
    // Que no se pueda borrar no puede impedir rehacer la imagen: lo importante ya
    // está hecho —la toma dice que no tiene clip— y el archivo se sobrescribe
    // cuando se genere el siguiente, porque la clave es la misma.
    avisar(donde, `La imagen se rehízo. El clip viejo no se pudo borrar del almacén: ${e.message}`);
  }
}

/**
 * Refresca UNA ficha, dejando las demás donde están.
 *
 * Repintar la galería entera por un botón que cambia una tarjeta es lo que hacía
 * que aprobar fotos tumbara el navegador: veinticuatro lecturas del almacén y
 * veinticuatro URL de objeto nuevas cada vez. La imagen ni se vuelve a leer — su
 * URL ya está en `urlesDeMaterial`.
 */
function refrescarFichaBiblioteca(i) {
  const vieja = fichasDeBiblioteca.get(i);
  if (!vieja || !vieja.parentNode) return pintarGaleriaBiblioteca();
  const tomas = tomasParaPintar();
  const x = tomas.find((t) => t.i === i);
  if (!x) return pintarGaleriaBiblioteca();
  const nueva = tarjetaDeBiblioteca(x, tomas, versionBiblioteca);
  vieja.parentNode.replaceChild(nueva, vieja);
  fichasDeBiblioteca.set(i, nueva);
}

/** El visto bueno, o quitarlo. */
async function aprobarBiblioteca(i, si) {
  const z = laBiblioteca();
  const k = z.tomas.findIndex((t) => t.i === i);
  if (k < 0) throw new Error('No encuentro esa toma de la biblioteca.');
  if (si && z.tomas[k].imagen !== 'ok') throw new Error('No hay imagen que aprobar todavía.');
  z.tomas[k].aprobada = !!si;
  await guardar();
  // SOLO SU FICHA Y EL RESUMEN. Repintar las 141 por un visto bueno es lo que
  // reiniciaba el navegador.
  refrescarFichaBiblioteca(i);
  pintarResumenBiblioteca();
}

// Se enseñan de veinticuatro en veinticuatro: ciento cuarenta y una miniaturas de
// golpe son ciento cuarenta y una lecturas del almacén nada más abrir el Inicio, y
// eso en un teléfono es la pantalla en blanco durante medio minuto.
accion(
  'b-biblioteca-mas',
  async () => {
    filtroBiblioteca.tope += 24;
    pintarGaleriaBiblioteca();
  },
  'biblioteca',
);

accion(
  'b-biblioteca-imagenes',
  async () => {
    const z = laBiblioteca();
    await guardar();
    const pendientes = z.tomas.filter((t) => t.imagen !== 'ok');
    if (!pendientes.length) return avisar('biblioteca', 'La biblioteca ya tiene todas sus imágenes.', 'bueno');

    const r = await cola.ejecutar(
      'biblioteca',
      pendientes,
      (toma, _i, senal, alEsperar) =>
        imagenFase.generarImagen({
          toma,
          tomas: z.tomas,
          // LA CLAVE VA BAJO `biblioteca/`, no bajo la pieza activa: si fuera bajo
          // la pieza, reescribir ese caso se llevaría la biblioteca por delante.
          pieza: bibliotecaFase.ID_BIBLIOTECA,
          config: P.config,
          // Sin tratamiento a propósito: la biblioteca sirve a TODOS los episodios
          // y la identidad visual de uno concreto la ataría a ese caso.
          tratamiento: null,
          senal,
          alEsperar,
        }),
      {
        // EN SU SECCIÓN. Sin esto, el progreso y la cuenta atrás de la cuota se
        // pintan en «El episodio», que es otra pantalla.
        donde: 'biblioteca',
        alTerminarUno: async (nueva) => {
          // LA PIEZA SE BUSCA FRESCA, y si la toma no está SE GRITA.
          //
          // Aquí había un `if (k >= 0)` que se tragaba el caso de no encontrarla:
          // la imagen se había generado, se había pagado y se había subido, y la
          // anotación se tiraba sin una palabra. Un `if` que descarta en silencio
          // el resultado de la fase más cara no es una guarda, es un agujero.
          const actual = estado.bibliotecaDe(P, aspectoDelCanal());
          const k = actual ? actual.tomas.findIndex((t) => t.i === nueva.i) : -1;
          if (k < 0) {
            throw new Error(
              `La imagen ${nueva.i} se generó y se pagó, pero su ficha ya no está en el archivo. ` +
                'No se ha perdido: está en el almacén y al volver a darle se recupera sin pagarla otra vez.',
            );
          }
          actual.tomas[k] = nueva;
          await guardar();
          pintarBiblioteca();
        },
      },
    );
    informar(r, 'biblioteca', 'biblioteca');
  },
  'biblioteca',
);

accion(
  'b-biblioteca-clips',
  async () => {
    const z = laBiblioteca();
    await guardar();
    if (!P.config.movimiento.politica.bibliotecaConVideo) {
      return avisar('biblioteca', 'Los clips de la biblioteca están apagados en la política de movimiento.');
    }
    // SOLO LO APROBADO. Antes cogía toda toma con `movimiento` mirara o no si su
    // imagen existía, así que el botón podía ponerse a pagar clips de imágenes que
    // nadie había visto —o que no estaban—. Ver `clipsPosibles`.
    const pendientes = bibliotecaFase.clipsPosibles(z.tomas, P.config.movimiento.politica);
    if (!pendientes.length) {
      const r = bibliotecaFase.resumenBiblioteca(z.tomas, P.config.movimiento.politica);
      if (r.porRevisar) {
        return avisar(
          'biblioteca',
          `Hay ${r.porRevisar} imágenes sin revisar. Míralas abajo y dale «Está bien» a las que valgan: ` +
            'el clip sale de la imagen y es lo más caro que se genera aquí.',
        );
      }
      if (r.imagenesFaltan) {
        return avisar('biblioteca', `Faltan ${r.imagenesFaltan} imágenes por generar. El clip sale de la imagen.`);
      }
      return avisar('biblioteca', 'El reparto aprobado ya tiene todos sus clips.', 'bueno');
    }
    if (
      !confirm(
        `Son ${pendientes.length} clips, de las imágenes que ya has aprobado. Se pagan UNA VEZ y ` +
          `valen para todos los episodios que vengan, pero es la fase más cara. ¿Sigo?`,
      )
    ) {
      return;
    }

    const r = await cola.ejecutar(
      'biblioteca',
      pendientes,
      (toma, _i, senal, alEsperar) =>
        movimiento.generarClip({
          toma,
          tomas: z.tomas,
          pieza: bibliotecaFase.ID_BIBLIOTECA,
          config: P.config,
          tratamiento: null,
          senal,
          alEsperar,
          aviso: (m) => ($('progreso').textContent = m),
        }),
      {
        // EN SU SECCIÓN. Sin esto, el progreso y la cuenta atrás de la cuota se
        // pintan en «El episodio», que es otra pantalla.
        donde: 'biblioteca',
        alTerminarUno: async (nueva) => {
          // LA PIEZA SE BUSCA FRESCA, y si la toma no está SE GRITA.
          //
          // Aquí había un `if (k >= 0)` que se tragaba el caso de no encontrarla:
          // la imagen se había generado, se había pagado y se había subido, y la
          // anotación se tiraba sin una palabra. Un `if` que descarta en silencio
          // el resultado de la fase más cara no es una guarda, es un agujero.
          const actual = estado.bibliotecaDe(P, aspectoDelCanal());
          const k = actual ? actual.tomas.findIndex((t) => t.i === nueva.i) : -1;
          if (k < 0) {
            throw new Error(
              `La imagen ${nueva.i} se generó y se pagó, pero su ficha ya no está en el archivo. ` +
                'No se ha perdido: está en el almacén y al volver a darle se recupera sin pagarla otra vez.',
            );
          }
          actual.tomas[k] = nueva;
          await guardar();
          pintarBiblioteca();
        },
      },
    );
    informar(r, 'biblioteca', 'biblioteca');
  },
  'biblioteca',
);

accion('b-musica', async () => {
  const soloLasQueFaltan = !rehacerTodo();
  const pendientes = musica.planificar(pieza().escenas, pieza().tomas, P.config, { soloLasQueFaltan });
  if (!pendientes.length) return avisar('paso4', 'La música ya está, o está apagada.', 'bueno');
  if (!soloLasQueFaltan && !confirm(`Se rehacen las ${pendientes.length} piezas de música. ¿Sigo?`)) return;

  const r = await cola.ejecutar(
    'música',
    pendientes,
    (escena, _i, senal, alEsperar) =>
      musica.generarMusicaDeEscena({
        escena, tomas: pieza().tomas, pieza: idMaterial(),
        tratamiento: pieza().tratamiento, senal, alEsperar,
      }),
    {
      alTerminarUno: async (res) => {
        // La pista única se anota en la escena 0. Si el reparto no tiene una
        // escena con ese número, se crea: sin anotarla, la música pagada no
        // constaría y el botón la volvería a pedir.
        let e = pieza().escenas.find((x) => x.n === res.n);
        if (!e) {
          e = { n: res.n };
          pieza().escenas.push(e);
        }
        e.musica = 'ok';
        await guardar();
      },
    },
  );
  informar(r, 'música');
});

/**
 * Le pregunta al almacén qué hay generado de verdad, y lo apunta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «No sé qué está generado y qué no.»
 *
 * Y no había manera de saberlo. El proyecto anotaba «imagen: ok» cuando la llamada
 * VOLVÍA, así que todo lo que se generó y se subió pero cuya respuesta se perdió
 * —un corte de red, la plataforma cortando por tiempo— quedaba pagado, guardado en
 * la nube, y marcado como si no existiera. Al volver a darle se pagaba otra vez.
 *
 * Con esto la verdad la dice el almacén, que es donde está el material, y no la
 * memoria de una llamada que a lo mejor no llegó. Cuesta una consulta y no genera
 * nada.
 *
 * Va en los dos sentidos, y el segundo importa igual: lo que el proyecto da por
 * hecho y NO está arriba se desmarca. Si no, quedaría una toma que dice tener
 * imagen y cuya imagen no existe, y eso para el montaje a mitad.
 * ─────────────────────────────────────────────────────────────────────────────
 */
accion('b-inventario', async () => {
  avisar('paso4', 'Preguntando al almacén qué hay generado…');
  const z = pieza();

  // QUÉ CLAVES HAY QUE MIRAR, ANTES DE MIRAR DÓNDE.
  //
  // El material de una toma no vive siempre bajo el episodio: puede estar
  // heredado de otra pieza, o guardado con el nombre que tenía antes —el número
  // del proyecto, o el de antes de volver a repartir el guion—. Preguntando solo
  // bajo `<episodio>/`, esas claves salían «no está» y se DESMARCABAN: pagar otra
  // vez lo que ya estaba pagado, y encima borrando el apunte de dónde estaba.
  //
  // Así que primero se compone la lista de claves, y luego se le pregunta al
  // almacén por CADA carpeta que aparezca en ellas.
  const aMirar = [];
  for (const t of z.tomas) {
    // Lo que repite otra toma no tiene archivo propio: preguntar por él daría «no
    // está» y lo desmarcaría, que es justo al revés de la verdad.
    const propia = t.reusa === null || t.reusa === undefined;
    aMirar.push({
      clave: claveVoz(idMaterial(), t),
      dice: `voz ${t.i + 1}`,
      tiene: t.audio === 'ok',
      poner: (v) => (t.audio = v),
    });
    if (propia && !t.heredado) {
      aMirar.push({
        clave: claveToma(idMaterial(), t.i, 'img'),
        dice: `imagen ${t.i + 1}`,
        tiene: t.imagen === 'ok',
        poner: (v) => (t.imagen = v),
      });
    }
    if (propia && t.movimiento && !t.heredadoVid) {
      aMirar.push({
        clave: claveToma(idMaterial(), t.i, 'vid'),
        dice: `clip ${t.i + 1}`,
        tiene: t.video === 'ok',
        poner: (v) => (t.video = v),
      });
    }
  }
  // LA PISTA, UNA. La música es una sola para el episodio entero y vive bajo el
  // número 0 —o donde apunte la escena 0, si se rescató—. Preguntar por una
  // música por escena decía «faltan 8 músicas» con la pista hecha y sonando.
  // La clave la decide la hoja de montaje, no se compone aquí a mano: componerla
  // preguntaba por archivos que no existen y borraba el apunte. Y si está, NO se
  // toca: escribir «ok» encima de la clave entera la perdería.
  const pista = musica.pistaDe(z.escenas, idMaterial());
  const cero = escenaCero(z);
  aMirar.push({
    clave: pista.clave,
    dice: 'la pista de fondo',
    tiene: pista.hecha,
    poner: (v) => (cero.musica = v),
  });

  // Y APARTE, LO QUE HAY QUE COMPROBAR AUNQUE NO SE PUEDA CORREGIR.
  //
  // «Cuando le doy a revisar qué hay generado, no se marca lo que realmente hay.»
  //
  // No mentía: se callaba. El resumen salía de la cuenta de lo que HABRÍA QUE
  // GENERAR, y una toma que hereda su imagen no hay que generarla — así que
  // desaparecía de la cuenta, y con todas heredadas la fila entera no salía. La
  // pregunta era «¿qué hay generado?» y se contestaba «¿qué falta por pagar?».
  //
  // Esto mira el visual de CADA toma esté donde esté su archivo —propio, heredado
  // o el de la toma cuyo plano repite— y la voz de cada una. No cambia ninguna
  // marca: las marcas solo se tocan donde la toma es dueña de su archivo, que es
  // lo de arriba. Solo cuenta la verdad para poder decirla.
  const verificar = [];
  for (const t of z.tomas) {
    const conClip = clipVigente(t, z.tomas);
    verificar.push({
      clave: conClip ? claveClip(idMaterial(), t, z.tomas) : claveFotograma(idMaterial(), t, z.tomas),
      de: conClip ? 'Clips' : 'Imágenes',
    });
    verificar.push({ clave: claveVoz(idMaterial(), t), de: 'Voz' });
  }
  verificar.push({ clave: pista.clave, de: 'Música' });

  const hay = new Set();
  const carpetas = new Set(
    [...aMirar, ...verificar].map((x) => x.clave.slice(0, x.clave.indexOf('/') + 1)),
  );
  for (const carpeta of carpetas) {
    const r = await llamar('listar', { prefijo: carpeta });
    for (const m of r.materiales || []) if (m.bytes > 0) hay.add(m.clave);
  }

  const cambios = { puestas: [], quitadas: [] };
  for (const x of aMirar) {
    const esta = hay.has(x.clave);
    if (esta && !x.tiene) {
      x.poner('ok');
      cambios.puestas.push(x.dice);
    } else if (!esta && x.tiene) {
      x.poner(null);
      cambios.quitadas.push(x.dice);
    }
  }

  await guardar();
  // Y con la verdad del almacén puesta, los planos gemelos se emparejan.
  const emparejados = await emparejarGemelos();
  pintarTodo();

  // LA RESPUESTA ES POR FASES, no un número de archivos. «88 materiales en el
  // almacén» no le dice a nadie si puede montar ya: «Voz 34/34 ✓ · Imágenes
  // 28/34 — faltan 6» sí.
  //
  // Y la cuenta sale de lo que se acaba de mirar en el almacén, no de lo que
  // quedaría por pagar: son preguntas distintas y este botón contesta la primera.
  const porFase = new Map();
  for (const v of verificar) {
    const [ok, total] = porFase.get(v.de) || [0, 0];
    porFase.set(v.de, [ok + (hay.has(v.clave) ? 1 : 0), total + 1]);
  }
  const resumen = ['Voz', 'Imágenes', 'Clips', 'Música']
    .filter((n) => porFase.get(n)?.[1])
    .map((n) => {
      const [ok, total] = porFase.get(n);
      return ok === total ? `${n} ${ok}/${total} ✓` : `${n} ${ok}/${total} — faltan ${total - ok}`;
    })
    .join(' · ');

  const partes = [];
  if (cambios.puestas.length) {
    partes.push(`${cambios.puestas.length} estaban generadas y no constaban (${cambios.puestas.slice(0, 6).join(', ')}${cambios.puestas.length > 6 ? '…' : ''})`);
  }
  if (cambios.quitadas.length) {
    partes.push(`${cambios.quitadas.length} constaban y no están (${cambios.quitadas.slice(0, 6).join(', ')}${cambios.quitadas.length > 6 ? '…' : ''})`);
  }
  avisar(
    'paso4',
    `${resumen || 'Todavía no hay nada que generar: parte el guion en tomas primero.'}` +
      (partes.length ? ` · Corregido contra el almacén: ${partes.join('; ')}.` : '') +
      (emparejados ? ` · ${emparejados} planos gemelos emparejados.` : ''),
    'bueno',
  );
});

/**
 * Aplica los emparejamientos de planos gemelos del caso y guarda.
 *
 * Corre tras generar clips, tras convertir una imagen y al revisar el almacén:
 * los tres momentos en que aparece material nuevo que una gemela puede usar.
 */
async function emparejarGemelos(avisarDonde = null) {
  const cambios = imagenFase.emparejarDentroDelCaso(idMaterial(), pieza().tomas);
  for (const c of cambios) {
    const k = pieza().tomas.findIndex((t) => t.i === c.i);
    if (k < 0) continue;
    if (c.heredadoVid) {
      pieza().tomas[k].heredadoVid = c.heredadoVid;
      pieza().tomas[k].movimiento = true;
    }
    if (c.heredado) pieza().tomas[k].heredado = c.heredado;
  }
  if (cambios.length) {
    await guardar();
    pintarTodo();
    if (avisarDonde) {
      avisar(avisarDonde, `Planos gemelos emparejados: ${cambios.map((c) => c.dice).join('; ')}.`, 'bueno');
    }
  }
  return cambios.length;
}

/**
 * Empareja DOS TOMAS CONCRETAS, a mano: la que se toca hereda de la que se dice.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El emparejador automático va por la huella literal del plano (lugar, encuadre
 * y luz con las mismas palabras). Cuando el director escribe dos fichas con
 * palabras distintas y sale casi la misma imagen —la 7 y la 18: el mismo
 * pasillo, un ángulo de diferencia—, ninguna huella lo caza, y comparar
 * «parecido» a ciegas emparejaría falsos gemelos. El detector con cien por
 * ciento de acierto son los ojos de quien mira la galería: esto solo le da el
 * botón para decirlo. La que se toca deja de pagar; usa el material de la otra.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function emparejarAMano(iRecibe, numeroDueña) {
  const n = Number(numeroDueña);
  if (!Number.isInteger(n)) throw new Error('Escribe el número de la toma, como sale en la galería (p. ej. 18).');
  const jDueña = n - 1;
  if (jDueña === iRecibe) throw new Error('Una toma no puede ser gemela de sí misma.');
  const tomas = pieza().tomas;
  const recibe = tomas.find((t) => t.i === iRecibe);
  const dueña = tomas.find((t) => t.i === jDueña);
  if (!recibe || !dueña) throw new Error(`No encuentro la toma ${n}.`);

  const raiz = dueña.reusa !== null && dueña.reusa !== undefined ? tomas.find((y) => y.i === dueña.reusa) || dueña : dueña;
  const hayImg = !!(dueña.heredado || raiz.heredado || raiz.imagen === 'ok');
  const hayClip = !!(dueña.heredadoVid || raiz.heredadoVid || raiz.video === 'ok');
  if (!hayImg && !hayClip) throw new Error(`La toma ${n} no tiene material que prestar todavía.`);

  const recibeTieneClip = recibe.video === 'ok' || !!recibe.heredadoVid;
  if (recibeTieneClip && !hayClip) {
    throw new Error(`Mejor al revés: la toma ${iRecibe + 1} tiene clip y la ${n} no. Empareja la ${n} con la ${iRecibe + 1}.`);
  }

  const partes = [];
  if (hayImg) {
    recibe.heredado = claveFotograma(idMaterial(), dueña, tomas);
    partes.push('la imagen');
  }
  if (hayClip) {
    recibe.heredadoVid = claveClip(idMaterial(), dueña, tomas);
    recibe.movimiento = true;
    partes.push('el clip');
  }
  await guardar();
  pintarTodo();
  avisar('previa', `Toma ${iRecibe + 1}: usa ${partes.join(' y ')} de la toma ${n}. Ya no paga lo suyo.`, 'bueno');
}

function informar(r, que, donde = 'paso4') {
  pintarPasos();
  // Y las listas de la Previa, que enseñan lo que la tanda acaba de reescribir.
  // Sin esto, tras rehacer una fase entera la galería seguía con las tarjetas
  // de antes hasta el siguiente repintado grande.
  pintarPorTipo();
  // Lo que el freno descubrió en esta tanda se queda con el proyecto.
  recordarRitmo();
  if (r.detenida) {
    return avisar(donde, `${que}: detenido en ${r.hechas} de ${r.total}. Lo hecho está guardado.`);
  }
  // LA TANDA SE PARÓ PORQUE ESPERAR NO SERVÍA, y eso no es «fallaron N de M»: es
  // una sola cosa que hay que arreglar en Google Cloud. Se dice aparte y con el
  // mensaje del proveedor ENTERO, que es lo único que dice qué tocar. Enterrado
  // entre errores repetidos no lo lee nadie.
  if (r.sinCuota) {
    avisar(
      donde,
      `${que}: parado en ${r.hechas} de ${r.total}. La cuota de tu proyecto en Google Cloud no se abre, ` +
        'así que esperar más no sirve. Lo generado está guardado.',
      'malo',
    );
    return registro(donde, [
      'Esto es lo que contestó Google, tal cual:',
      ...String(r.sinCuota).split('\n').filter(Boolean),
    ]);
  }
  if (r.fallos.length) {
    avisar(
      donde,
      `${que}: ${r.generadas ?? r.hechas} generadas y ${r.fallos.length} con fallo, de ${r.total}. ` +
        'Vuelve a darle: solo repite lo que falta.',
      'malo',
    );
    return registro(donde, r.fallos.map((f) => `· ${f.error}`));
  }
  avisar(donde, `${que}: ${r.generadas ?? r.hechas} de ${r.total}, sin fallos.`, 'bueno');
}

// ── Vista previa ──────────────────────────────────────────────────────────────
//
// Reconstruye lo que va a salir del montaje: recorrido de cámara, marca, lecho de
// música y el agachado de la música cuando entra la voz. Sale de la MISMA hoja que
// usa ffmpeg, no de una línea de tiempo propia.

let preparada = null;
let reproductor = null;

function asegurarReproductor() {
  if (reproductor) return reproductor;
  reproductor = previa.reproductor({
    lienzo: $('previa-imagen'),
    clip: $('previa-clip'),
    vacio: $('previa-vacio'),
    marca: $('previa-marca'),
    alCambiar: (t, k, total, segundo) => {
      $('previa-pie').textContent =
        `${reloj(segundo)} / ${reloj(preparada?.hoja.total || 0)} · toma ${t.i + 1} de ${total}` +
        ` · escena ${t.escena}${t.movimiento ? ' · clip' : ` · cámara ${t.camara}`}` +
        (t.falta.length ? ` · FALTA ${t.falta.join(' y ')}` : '') +
        `\n${t.texto}`;
      document.querySelectorAll('.tira').forEach((e, n) => e.classList.toggle('activa', n === k));
      // Sin scrollIntoView: seguía a la tira activa BAJANDO LA PÁGINA en cada
      // cambio de toma — el reproductor se iba de pantalla una vez por toma. La
      // tira activa se ilumina; quien quiera verla, baja cuando quiera.
    },
    alTerminar: () => avisar('previa', 'Fin de la pieza.', 'bueno'),
  });
  return reproductor;
}

const reloj = (s) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

accion(
  'b-preparar-previa',
  async () => {
    if (!pieza().tomas.length) throw new Error('Todavía no hay tomas.');
    preparada = await previa.preparar({
      pieza: pieza(),
      config: P.config,
      alAvanzar: (n, de) => avisar('previa', `Bajando material… ${n} de ${de} tomas`),
    });

    asegurarReproductor().cargar(preparada);
    pintarTiras();
    pintarPorTipo();

    const faltan = preparada.tomas.filter((t) => t.falta.length);
    const sinMusica = preparada.hoja.escenas.filter((e) => e.musica && !preparada.musica[e.n]);
    // Voz cortada ADIVINANDO: es de una narración anterior al corte exacto por
    // marcas. Suena bien pero el texto de cada toma no cuadra con lo que se oye,
    // y desde fuera parece un fallo del montaje. Se dice aquí, con la salida.
    const estimadas = pieza().tomas.filter((t) => t.audio === 'ok' && t.corteExacto === false && t.corteForzado === true);
    avisar(
      'previa',
      [
        `${preparada.tomas.length} tomas · ${reloj(preparada.hoja.total)}`,
        faltan.length
          ? `A ${faltan.length} les falta algo: ${faltan.slice(0, 6).map((t) => `#${t.i + 1} (${t.falta.join('+')})`).join(', ')}`
          : 'Todas completas',
        sinMusica.length ? `${sinMusica.length} escenas sin música` : '',
        estimadas.length
          ? `${estimadas.length} tomas llevan un corte forzado (sin silencio cerca, puede partir ` +
            `palabra): dale a Narración y se reparan solas`
          : '',
      ]
        .filter(Boolean)
        .join(' · '),
      faltan.length || estimadas.length ? 'malo' : 'bueno',
    );
  },
  'previa',
);

accion(
  'b-reproducir',
  async () => {
    if (!preparada) throw new Error('Prepara la previa primero.');
    // El navegador solo deja sonar tras un toque: esto ES el toque.
    await asegurarReproductor().reproducir(desdeSegundo);
  },
  'previa',
);

let desdeSegundo = 0;
$('b-parar-previa').addEventListener('click', () => {
  reproductor?.parar();
  desdeSegundo = 0;
});

// ── Las pestañas de la previa ─────────────────────────────────────────────────
//
// Antes solo estaba el montaje entero, y para saber si una música servía había que
// verse el documental completo. Cada material se oye y se ve por separado, y se
// regenera desde donde se está mirando.

const HOJAS_PREVIA = [
  ['montado', 'Montado'],
  ['voz', 'Voz'],
  ['imagenes', 'Imágenes'],
  ['musica', 'Música'],
  ['clips', 'Clips'],
];

function pintarPestanas() {
  const nav = $('pestanas-previa');
  if (nav.children.length) return;
  for (const [id, nombre] of HOJAS_PREVIA) {
    const b = document.createElement('button');
    b.textContent = nombre;
    b.dataset.hojaBoton = id;
    b.onclick = () => abrirHoja(id);
    nav.appendChild(b);
  }
  abrirHoja('montado');
}

function abrirHoja(id) {
  document.querySelectorAll('.hoja-previa').forEach((e) => e.classList.toggle('oculto', e.dataset.hoja !== id));
  document.querySelectorAll('[data-hoja-boton]').forEach((b) => b.classList.toggle('on', b.dataset.hojaBoton === id));
  // Al salir del montaje se para: dos audios sonando a la vez no dejan juzgar
  // ninguno de los dos.
  if (id !== 'montado') reproductor?.parar();
}

/**
 * Una fila con reproductor y botón de rehacer.
 *
 * El audio se carga AL PEDIRLO (`cargar`), no al pintar la lista: ochenta y tres
 * tomas de voz bajadas de golpe por abrir una pestaña es exactamente lo que un
 * teléfono no aguanta. Con blob directo (material ya en mano) sigue funcionando
 * igual que siempre.
 */
function filaAudio({ titulo, texto, blob, cargar, alRehacer, alEditar, etiqueta = 'Rehacer' }) {
  const d = document.createElement('div');
  d.className = 'fila-mat';
  d.innerHTML =
    `<div class="txt"><b>${escapar(titulo)}</b>${escapar(texto || '')}</div>` +
    `<div class="acc"></div>`;
  const acc = d.querySelector('.acc');

  const poner = (b) => {
    const a = document.createElement('audio');
    a.controls = true;
    a.preload = 'none';
    a.src = URL.createObjectURL(b);
    d.querySelector('.txt').appendChild(a);
  };

  if (blob) {
    poner(blob);
  } else if (cargar) {
    const e = document.createElement('button');
    e.className = 'btn chico fantasma';
    e.textContent = 'Escuchar';
    e.onclick = async () => {
      e.disabled = true;
      e.textContent = '…';
      const b = await cargar();
      if (b) {
        poner(b);
        d.querySelector('.txt audio').play().catch(() => {});
        e.remove();
      } else {
        e.textContent = 'no se pudo cargar';
      }
    };
    acc.appendChild(e);
  } else {
    d.querySelector('.txt').insertAdjacentHTML('beforeend', '<span class="pastilla p-falta">falta</span>');
  }

  const b = document.createElement('button');
  b.className = 'btn chico fantasma';
  b.textContent = etiqueta;
  b.onclick = async () => {
    b.disabled = true;
    b.textContent = '…';
    try {
      await alRehacer();
    } catch (e) {
      avisar('previa', e.message, 'malo');
    }
    b.disabled = false;
    b.textContent = etiqueta;
  };
  acc.appendChild(b);

  // Editar el texto AQUÍ, donde se escucha. Un código de expediente leído en voz
  // alta se descubre oyendo la toma, y arreglarlo no puede exigir irse al guion,
  // encontrar la frase y volver a partir todo.
  if (alEditar) {
    const e = document.createElement('button');
    e.className = 'btn chico fantasma';
    e.textContent = 'Editar';
    e.onclick = () => {
      if (d.dataset.editando) return;
      d.dataset.editando = '1';
      const caja = document.createElement('div');
      caja.style.width = '100%';
      caja.style.marginTop = '8px';
      const ta = document.createElement('textarea');
      ta.value = texto || '';
      ta.style.minHeight = '90px';
      const ok = document.createElement('button');
      ok.className = 'btn chico';
      ok.textContent = 'Guardar y narrar';
      ok.style.marginRight = '7px';
      const no = document.createElement('button');
      no.className = 'btn chico fantasma';
      no.textContent = 'Cancelar';
      no.onclick = () => {
        delete d.dataset.editando;
        caja.remove();
      };
      ok.onclick = async () => {
        ok.disabled = true;
        ok.textContent = 'Narrando…';
        try {
          await alEditar(ta.value);
          delete d.dataset.editando;
          caja.remove();
        } catch (err) {
          avisar('previa', err.message, 'malo');
          ok.disabled = false;
          ok.textContent = 'Guardar y narrar';
        }
      };
      caja.append(ta, ok, no);
      d.querySelector('.txt').appendChild(caja);
    };
    acc.appendChild(e);
  }
  return d;
}

/**
 * Cambia el texto de UNA toma y vuelve a narrar solo su bloque.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Es seguro porque el texto de la toma no sostiene nada más: la imagen sale de
 * la ficha de plano, la música de la escena, y la estructura del guion ya está
 * partida. Lo único que lee ese texto es la voz — así que cambiar el texto solo
 * obliga a volver a narrar, y la duración nueva se mide y manda en la hoja como
 * siempre (§4.5). Nada que re-dirigir, nada que re-generar, nada que se corra.
 *
 * El guion maestro SE ACTUALIZA TAMBIÉN cuando la frase vieja se encuentra tal
 * cual: si no, volver a partir el guion algún día resucitaría el texto viejo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function editarTextoDeToma(i, nuevo) {
  const texto = String(nuevo || '').trim();
  if (!texto) throw new Error('El texto no puede quedar vacío.');
  const k = pieza().tomas.findIndex((t) => t.i === i);
  if (k < 0) throw new Error('No encuentro esa toma.');
  const t = pieza().tomas[k];
  const viejo = (t.texto || '').trim();
  if (texto === viejo) return;

  if (viejo && pieza().guion.includes(viejo)) {
    pieza().guion = pieza().guion.replace(viejo, texto);
    const g = $('guion');
    if (g) g.value = pieza().guion;
  }
  t.texto = texto;
  // La voz de antes lee el texto de antes: ya no vale. Si la narración de abajo
  // fallara, la toma queda contada como pendiente y el botón de Narración la
  // repara — nunca queda una voz vieja haciéndose pasar por la nueva.
  t.audio = null;
  t.corteExacto = false;
  await guardar();
  avisar('previa', `Toma ${i + 1}: texto cambiado. Narrando de nuevo su bloque…`);
  await rehacerVoz(i);
}

// ── Las listas por tipo: DE LO GENERADO, no de la previa preparada ────────────
//
// «Debería poder revisar cada cosa individualmente sin necesidad de preparar.»
// Y tenía razón dos veces. Las listas se llenaban de `preparada`, que vive en
// memoria: cada recarga las vaciaba y tocaba volver a Preparar solo para OÍR lo
// ya pagado. Ahora salen del proyecto y de la caché local directamente, así que
// están al abrir. Preparar queda para lo único que de verdad prepara: el montado.
//
// El material pesado no se baja en masa: la imagen se carga sola (es la revisión
// visual), y la voz, la música y los clips llevan su botón — un clip son ~35 MB,
// bajarlos todos por abrir una pestaña castigaría justo al teléfono.

let versionMateriales = 0;

/** Local primero; si no está, del almacén por trozos (y queda en caché). */
async function materialLocal(clave, tipo) {
  const ya = await local.leerMaterial(clave);
  if (ya) return ya;
  try {
    return await material(clave, tipo);
  } catch {
    return null;
  }
}

function pintarPorTipo() {
  const mia = ++versionMateriales;
  const t = pieza().tomas;

  // ── Voz, toma a toma ──
  const conTexto = t.filter((x) => (x.texto || '').trim());
  $('cuenta-voz').textContent = conTexto.length
    ? `${conTexto.filter((x) => x.audio === 'ok' && !(x.corteExacto === false && x.corteForzado === true)).length}/${conTexto.length}`
    : '';
  const cajaVoz = $('lista-voz');
  cajaVoz.innerHTML = conTexto.length ? '' : '<p class="nota">Todavía no hay tomas: genera el guion primero.</p>';
  for (const x of conTexto) {
    cajaVoz.appendChild(
      filaAudio({
        titulo:
          `Toma ${x.i + 1} · ${(x.segundos || 0).toFixed(1)}s` +
          (x.audio === 'ok' && x.corteExacto === false && x.corteForzado === true ? ' · corte forzado' : ''),
        texto: x.texto,
        cargar: x.audio === 'ok' ? () => materialLocal(claveVoz(idMaterial(), x), 'audio/wav') : null,
        alRehacer: () => rehacerVoz(x.i),
        alEditar: (nuevo) => editarTextoDeToma(x.i, nuevo),
      }),
    );
  }

  // ── Imágenes: toda toma con imagen propia o heredada, cargada sola ──
  // Emparejada con clip heredado pero CON imagen propia: se sigue enseñando —su
  // imagen existe y se puede rehacer—. Solo se esconde la que ni tiene ni
  // necesita imagen propia.
  const conImagen = t.filter(
    (x) => x.plano && x.reusa == null && !(x.movimiento && x.heredadoVid && x.imagen !== 'ok' && !x.heredado),
  );
  $('cuenta-imagenes').textContent = conImagen.length
    ? `${conImagen.filter((x) => x.imagen === 'ok' || x.heredado).length}/${conImagen.length}`
    : '';
  const g = $('galeria');
  g.innerHTML = conImagen.length ? '' : '<p class="nota">Dirige las tomas primero: la imagen sale de la ficha de plano.</p>';
  // Y SE SUELTA LO QUE YA NO SE VE, acotado a este episodio. Sin esto, cada
  // repintado de la galería creaba ochenta URL nuevas y no soltaba ninguna.
  soltarUrles(new Set(conImagen.map((x) => claveFotograma(idMaterial(), x, t))), `${idMaterial()}/`);
  for (const x of conImagen) {
    const d = document.createElement('div');
    d.className = 'pieza-mat';
    const hay = x.imagen === 'ok' || !!x.heredado;

    // Con nodos, no con innerHTML: el hueco del visual se sustituye cuando llega
    // el blob, y eso pide una referencia de verdad, no una posición.
    const visual = document.createElement('div');
    visual.className = 'sin';
    visual.textContent = hay ? 'cargando…' : 'sin imagen';
    d.appendChild(visual);
    const cuerpo = document.createElement('div');
    cuerpo.className = 'cuerpo';
    // El estado del clip, AQUÍ MISMO: con 83 imágenes, saber cuál tiene ya su
    // video no puede exigir cruzar a la otra pestaña llevando la cuenta de cabeza.
    const clipListo = x.video === 'ok' || !!x.heredadoVid;
    // ¿ESTÁ YA GUARDADA EN EL ARCHIVO? Se mira por la clave del material, no por
    // el número de toma: es lo único que no cambia al reescribir el caso.
    const suClave = hay ? claveFotograma(idMaterial(), x, t) : '';
    const yaEnArchivo = !!suClave && (P.archivoPropio || []).some((p) => p.heredado === suClave);
    cuerpo.innerHTML =
      `<p>#${x.i + 1}${x.heredado ? ' · heredada' : ''} · ${escapar((x.texto || '').slice(0, 70))}…</p>` +
      (clipListo
        ? '<span class="pastilla p-ok">clip listo</span>'
        : x.movimiento
          ? '<span class="pastilla p-aviso">clip pendiente</span>'
          : '') +
      // LA MARCA DEL DIRECTOR: él dice cuáles servirían en otro caso. Es una
      // sugerencia para no ir buscando entre ochenta tomas — la última palabra la
      // tienes tú, y por eso el botón sale en todas.
      (yaEnArchivo
        ? '<span class="pastilla p-ok">en el archivo</span>'
        : x.generico
          ? '<span class="pastilla">el director la ve genérica</span>'
          : '');
    d.appendChild(cuerpo);

    if (hay) {
      materialLocal(claveFotograma(idMaterial(), x, t), 'image/png').then((blob) => {
        if (mia !== versionMateriales) return;
        if (!blob) {
          visual.textContent = 'no se pudo cargar';
          return;
        }
        const img = document.createElement('img');
        // POR EL ALMACÉN DE URL, igual que el Archivo. Esta galería se quedó con la
        // fuga original: `createObjectURL` MANTIENE VIVO EL BLOB hasta que se
        // revoca, y aquí no se revocaba ninguna. Con ochenta imágenes de dos megas
        // es exactamente lo que descargó la pestaña en Safari — y ahora se recorre
        // mucho más, porque es desde aquí donde se guarda en el archivo.
        img.src = urlDeMaterial(claveFotograma(idMaterial(), x, t), blob);
        img.alt = '';
        img.loading = 'lazy';
        d.replaceChild(img, visual);
      });
    }
    const b = document.createElement('button');
    b.className = 'btn chico fantasma';
    b.textContent = hay ? 'Rehacer' : 'Generar';
    b.onclick = async () => {
      b.disabled = true;
      b.textContent = '…';
      try {
        await rehacerImagen(x.i);
      } catch (e) {
        avisar('previa', e.message, 'malo');
      }
      b.disabled = false;
      b.textContent = 'Rehacer';
    };
    cuerpo.appendChild(b);

    // ── GUARDAR EN EL ARCHIVO ─────────────────────────────────────────────
    //
    // «Todas deben tener su botón para guardar todas las imágenes que se generen
    //  en el episodio, que no son del banco de las que estamos reutilizando.»
    //
    // TODAS, no solo las que el director marca: su marca es una sugerencia y la
    // última palabra es de quien paga. Las únicas sin botón son las que YA salen
    // del archivo —guardarlas sería meter la misma imagen dos veces, ocupando dos
    // sitios en la rotación de su papel— y las que aún no tienen imagen.
    if (hay && !x.heredado && !yaEnArchivo) {
      const g = document.createElement('button');
      g.className = `btn chico ${x.generico ? 'primario' : 'fantasma'}`;
      g.textContent = 'Guardar en la biblioteca del canal';
      g.onclick = async () => {
        // El nombre VIENE ESCRITO: sale del plano, que es lo que se le pidió al
        // generador. Solo hay que corregirlo si no convence.
        const sugerido = bibliotecaFase.nombreDeArchivoPara(x);
        const nombre = prompt(
          'Nombre para el archivo. Con este nombre lo buscará el director en los ' +
            'casos que vengan:',
          sugerido,
        );
        if (nombre === null) return;
        g.disabled = true;
        g.textContent = '…';
        try {
          await guardarEnArchivo(x.i, nombre);
        } catch (e) {
          avisar('previa', e.message, 'malo');
          g.disabled = false;
          g.textContent = 'Guardar en la biblioteca del canal';
        }
      };
      cuerpo.appendChild(g);
    }

    // Cualquier imagen se puede animar, la marcara el director o no. Mirando la
    // imagen es cuando se ve si merece moverse; decidirlo antes, a ciegas, era
    // decidirlo por una descripción.
    // «Es casi la misma que la 18»: emparejar a mano, con el número que se ve.
    const gem = document.createElement('button');
    gem.className = 'btn chico fantasma';
    gem.textContent = 'Gemela de…';
    gem.onclick = async () => {
      const n = prompt(`¿De qué toma usa el material la ${x.i + 1}? Escribe el número (p. ej. 18):`);
      if (!n) return;
      try {
        await emparejarAMano(x.i, n.trim());
      } catch (e) {
        avisar('previa', e.message, 'malo');
      }
    };
    cuerpo.appendChild(gem);

    // Con el clip ya pagado no se ofrece convertir: apretarlo lo pagaría otra
    // vez. La pastilla verde ya dice que está, y se ve en su pestaña.
    if (hay && !clipListo) {
      const c = document.createElement('button');
      c.className = 'btn chico fantasma';
      const enFila = estadoEnFila(x.i);
      const rotulo = enFila || (x.movimiento ? 'Generar su clip' : 'Convertir en clip');
      c.textContent = rotulo;
      if (enFila) c.disabled = true;
      c.onclick = async () => {
        c.disabled = true;
        c.textContent = '…';
        try {
          await convertirEnClip(x.i, (m) => (c.textContent = m));
        } catch (e) {
          avisar('previa', e.message, 'malo');
        }
        c.disabled = false;
        c.textContent = rotulo;
      };
      cuerpo.appendChild(c);
    }
    g.appendChild(d);
  }

  // ── La pista de fondo: UNA para todo el episodio ──
  //
  // «Se supone que está generando solamente una música, porque sale listado ese
  //  montón de músicas.» Generaba una; la lista seguía siendo la de antes, una
  //  fila por escena con siete «falta». Aquí va la pista, y nada más.
  const pista = musica.pistaDe(pieza().escenas, idMaterial());
  const total = t.reduce((s, x) => s + (x.segundos || 0), 0);
  const filasDeMusica = t.length ? [pista] : [];
  $('cuenta-musica').textContent = filasDeMusica.length
    ? `${filasDeMusica.filter((p) => p.hecha).length}/${filasDeMusica.length}`
    : '';
  const cajaMus = $('lista-musica');
  cajaMus.innerHTML = filasDeMusica.length ? '' : '<p class="nota">Todavía no hay tomas.</p>';
  for (const p of filasDeMusica) {
    cajaMus.appendChild(
      filaAudio({
        titulo: `La pista de fondo · ${reloj(musica.DURACION_MAXIMA)}`,
        texto: `Una sola, de lo que da el generador por llamada, repetida sin costura debajo de los ${reloj(total)} del episodio.`,
        cargar: p.hecha ? () => materialLocal(p.clave, 'audio/wav') : null,
        alRehacer: () => rehacerMusica(),
      }),
    );
  }

  // ── Clips ──
  const clips = t.filter((x) => x.movimiento);
  $('cuenta-clips').textContent = clips.length
    ? `${clips.filter((x) => x.video === 'ok' || x.heredadoVid || x.reusa != null).length}/${clips.length}`
    : '';
  const cajaClips = $('lista-clips');
  cajaClips.innerHTML = clips.length ? '' : '<p class="nota">Ninguna toma lleva clip de video.</p>';
  for (const x of clips) {
    const d = document.createElement('div');
    d.className = 'pieza-mat';
    const dueña = t.find((y) => y.i === x.reusa) || x;
    const hay = !!(x.heredadoVid || dueña.heredadoVid || dueña.video === 'ok');

    const visual = document.createElement('div');
    visual.className = 'sin';
    visual.textContent = hay ? 'toca «Ver» para cargarlo' : 'sin clip · se montará su imagen con cámara';
    d.appendChild(visual);
    const cuerpo = document.createElement('div');
    cuerpo.className = 'cuerpo';
    cuerpo.innerHTML = `<p>#${x.i + 1} · ${(x.segundos || 0).toFixed(1)}s${x.reusa != null ? ` · repite la ${x.reusa + 1}` : ''}</p>`;
    d.appendChild(cuerpo);

    if (hay) {
      const v = document.createElement('button');
      v.className = 'btn chico fantasma';
      v.textContent = 'Ver';
      // Por `verClip`: uno a la vez, y el anterior se suelta. Esto creaba una URL
      // de objeto por cada clip abierto y no soltaba ninguna — la misma fuga que
      // tumbaba el navegador aprobando fotos, pero con archivos treinta veces
      // más grandes.
      v.onclick = () =>
        verClip({ tarjeta: d, hueco: visual, clave: claveClip(idMaterial(), x, t), boton: v }).catch((e) =>
          avisar('previa', e.message, 'malo'),
        );
      cuerpo.appendChild(v);
    }
    cajaClips.appendChild(d);
  }
}

// ── Rehacer una sola pieza, desde donde se está mirando ───────────────────────

async function refrescar(clave) {
  await local.borrarMaterial(clave);
  // Y LA URL DE PANTALLA Y LA PREVIA PREPARADA YA NO VALEN: tenían dentro la
  // versión anterior de ese material, y la galería y el Montado la seguirían
  // enseñando como si fuera la nueva. «No sé si es que no abre la nueva
  // generación y solo se queda con la misma.» La puerta ya avisó al escribir;
  // esto es por si alguien refresca una clave que no pasó por ella.
  soltarUrl(clave);
  if (preparada) {
    preparada = null;
    pintarTiras();
  }
}

async function rehacerVoz(i) {
  const bloques = narracion.planificar(pieza().tomas, P.config, { soloLasQueFaltan: false });
  const bloque = bloques.find((b) => b.tomas.some((t) => t.i === i));
  if (!bloque) throw new Error('No encuentro el bloque de esa toma.');

  avisar('previa', `Rehaciendo la voz del bloque de la toma ${i + 1}…`);
  const nuevas = await narracion.narrarBloque({ bloque, pieza: idMaterial(), config: P.config });
  for (const t of nuevas) {
    const k = pieza().tomas.findIndex((x) => x.i === t.i);
    if (k >= 0) pieza().tomas[k] = t;
    await refrescar(`${idMaterial()}/t${String(t.i).padStart(3, '0')}/audio`);
  }
  await guardar();
  pintarPorTipo();
  avisar('previa', 'Voz rehecha: escúchala en su fila. El montado se actualiza al preparar.', 'bueno');
}

async function rehacerImagen(i) {
  const toma = pieza().tomas.find((t) => t.i === i);
  // El mismo agujero que en el archivo: el clip salió de la imagen que se va a
  // tirar, así que no vale. Ver `tirarElClip`.
  const tenia = toma.video === 'ok' || !!toma.heredadoVid;
  if (
    tenia &&
    !confirm(
      'Esta toma ya tiene su clip, y ese clip salió de la imagen que vas a rehacer.\n\n' +
        'Se BORRA con ella: no sirve para la imagen nueva. Después podrás convertirla ' +
        'en clip otra vez desde la galería. ¿Sigo?',
    )
  ) {
    return;
  }
  const claveVieja = tenia ? claveClip(idMaterial(), toma, pieza().tomas) : '';
  avisar('previa', `Rehaciendo la imagen de la toma ${i + 1}…`);
  const nueva = await imagenFase.generarImagen({
    toma,
    tomas: pieza().tomas,
    pieza: idMaterial(),
    config: P.config,
    tratamiento: pieza().tratamiento,
    mundo: mundoDeLaPieza(),
  });
  const k = pieza().tomas.findIndex((t) => t.i === i);
  // `movimiento` se conserva: la toma sigue mereciendo moverse, solo que ahora le
  // falta el clip — y por eso la galería vuelve a ofrecerlo.
  pieza().tomas[k] = { ...nueva, video: null, heredadoVid: null, bytesVideo: 0 };
  await refrescar(`${idMaterial()}/t${String(i).padStart(3, '0')}/img`);
  if (claveVieja) await tirarElClip(claveVieja, 'previa');
  await guardar();
  pintarPorTipo();
  avisar(
    'previa',
    tenia
      ? 'Imagen rehecha y su clip viejo borrado: ya no se monta el de la imagen mala. Puedes generarle uno nuevo desde la galería.'
      : 'Imagen rehecha: ya está en la galería. El montado se actualiza al preparar.',
    'bueno',
  );
}

/**
 * Convierte en clip la imagen de una toma, la haya marcado el director o no.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El director decide el cupo de movimiento por presupuesto y a ciegas: reparte
 * clips por la pieza leyendo descripciones. Pero cuál merece moverse se ve
 * MIRANDO LA IMAGEN, y eso solo pasa aquí, en la previa, con la imagen delante.
 *
 * Así que se puede animar cualquiera. No gasta imagen —ya está pagada, el clip
 * parte de ella— y la imagen NO se pierde: sigue en el banco, junto al clip, y
 * las dos quedan disponibles para las demás producciones.
 * ─────────────────────────────────────────────────────────────────────────────
 */
// ── La fila de clips a mano ───────────────────────────────────────────────────
//
// «Solo logro generar un clip y tengo que esperar pegado al teléfono a que
// termine para mandar el otro, porque si no se salta el rate limit.»
//
// Cada botón disparaba su llamada AL INSTANTE, en paralelo. Ahora tocar el botón
// ENCOLA: se marcan todos los que se quieran, y una sola bomba los genera de uno
// en uno — el mismo ritmo en fila que ya usan las fases por lotes. El teléfono se
// puede soltar; cada clip terminado se guarda, se empareja con sus gemelas y
// repinta antes de empezar el siguiente.
//
// LA FILA ES UNA SOLA PARA TODO, episodio y biblioteca, y por eso cada entrada
// lleva de qué pieza es. Dos filas independientes volverían a disparar dos
// llamadas a la vez en cuanto alguien pidiera un clip del reparto mientras corría
// uno del episodio, que es justo el límite de peticiones que esto vino a evitar.

const filaClips = [];
let bombeandoClips = false;

/** La pieza de una entrada de la fila: el episodio abierto, o la biblioteca. */
const piezaDeFila = (zid) => (zid === bibliotecaFase.ID_BIBLIOTECA ? estado.bibliotecaDe(P, aspectoDelCanal()) : pieza());

/** En qué está una toma dentro de la fila: 'generando', 'en cola (n.º)' o nada. */
function estadoEnFila(i, zid = idMaterial()) {
  const k = filaClips.findIndex((x) => x.i === i && x.zid === zid);
  if (k < 0) return null;
  return k === 0 && bombeandoClips ? 'Generando…' : `En cola (${k + 1}º)`;
}

const estadoEnFilaBiblioteca = (i) => estadoEnFila(i, bibliotecaFase.ID_BIBLIOTECA);

async function convertirEnClip(i, decir = () => {}) {
  const k = pieza().tomas.findIndex((t) => t.i === i);
  if (k < 0) throw new Error('No encuentro esa toma.');
  if (filaClips.some((x) => x.i === i && x.zid === idMaterial())) return;

  const segundos = movimiento.duracionMasCercana(
    pieza().tomas[k].segundos || 6,
    P.config.videoModelo?.modelo,
  );
  // La pregunta va AQUÍ, al encolar: en medio de la fila no hay nadie mirando.
  if (!confirm(`Se va a generar un clip de ${segundos} s a partir de esta imagen.\n\nEs la fase más cara. Se pone en la fila y se genera solo. ¿Sigo?`)) {
    return;
  }

  // Se marca ANTES de generar y se guarda: si el clip tarda diez minutos y se
  // cierra la pestaña, al volver la toma ya sabe que lleva movimiento y solo falta
  // el clip. Marcarla después habría perdido la decisión.
  pieza().tomas[k].movimiento = true;
  await guardar();

  filaClips.push({ zid: idMaterial(), i, decir });
  decir(estadoEnFila(i) || 'En cola');
  bombearFilaDeClips();
}

/**
 * El clip de UNA entrada de la biblioteca, desde su tarjeta.
 *
 * Las tres condiciones se comprueban AQUÍ y no solo en el botón: el botón se pinta
 * una vez y el estado cambia debajo —se rehace la imagen, se quita el visto
 * bueno—, y lo que no puede pasar es que un clip de la biblioteca permanente se
 * pague sobre una imagen que nadie ha aprobado.
 */
async function clipDeBiblioteca(i, decir = () => {}) {
  const z = laBiblioteca();
  const k = z.tomas.findIndex((t) => t.i === i);
  if (k < 0) throw new Error('No encuentro esa toma de la biblioteca.');
  const t = z.tomas[k];
  if (t.imagen !== 'ok') throw new Error('Primero hay que generar su imagen: el clip sale de ella.');
  if (!t.aprobada) throw new Error('Dale antes el visto bueno a la imagen: el clip hereda lo que tenga.');
  // Por `clipVigente`, no por la bandera: un clip de la imagen anterior no cuenta
  // como «ya lo tiene». Si contara, la toma se quedaría sin poder animarse nunca.
  if (clipVigente(t, z.tomas)) throw new Error('Esta ya tiene su clip, y es de esta imagen.');
  if (filaClips.some((x) => x.i === i && x.zid === bibliotecaFase.ID_BIBLIOTECA)) return;

  const segundos = movimiento.duracionMasCercana(t.segundos || 6, P.config.videoModelo?.modelo);
  if (
    !confirm(
      `Clip de ${segundos} s de «${rotuloDeBiblioteca(t).nombre} · ${t.variante}».\n\n` +
        'Es la fase más cara, y este se paga UNA VEZ para todos los episodios que vengan. ¿Sigo?',
    )
  ) {
    return;
  }
  // Se marca ANTES de generar y se guarda, igual que en el episodio: si el clip
  // tarda diez minutos y se cierra la pestaña, al volver la toma ya sabe que lleva
  // movimiento y solo le falta el clip. Y es lo que hace que un sitio que el
  // catálogo NO proponía animar se quede animado — `sincronizarBiblioteca` conserva
  // la marca en vez de volver a ponerla a lo que dice el catálogo.
  z.tomas[k].movimiento = true;
  await guardar();
  filaClips.push({ zid: bibliotecaFase.ID_BIBLIOTECA, i, decir });
  decir(estadoEnFilaBiblioteca(i) || 'En cola');
  bombearFilaDeClips();
}

/** La bomba: una sola, de uno en uno, hasta vaciar la fila. */
async function bombearFilaDeClips() {
  if (bombeandoClips) return;
  bombeandoClips = true;
  try {
    while (filaClips.length) {
      const { zid, i, decir } = filaClips[0];
      // De la biblioteca o del episodio: cambia dónde se guarda, dónde se avisa y
      // qué se repinta. Lo demás —una llamada cada vez— es lo mismo para las dos.
      const esBiblioteca = zid === bibliotecaFase.ID_BIBLIOTECA;
      const donde = esBiblioteca ? 'biblioteca' : 'previa';
      const z = piezaDeFila(zid);
      filaClips.slice(1).forEach((x, n) => x.decir?.(`En cola (${n + 2}º)`));
      decir?.('Generando…');
      const k = z ? z.tomas.findIndex((t) => t.i === i) : -1;
      const comoSeLlama = esBiblioteca
        ? k >= 0
          ? `«${rotuloDeBiblioteca(z.tomas[k]).nombre} · ${z.tomas[k].variante}»`
          : 'esa entrada'
        : `la toma ${i + 1}`;
      avisar(donde, `Generando el clip de ${comoSeLlama}… (${filaClips.length - 1} en cola)`);
      try {
        if (k < 0) throw new Error('La toma ya no está.');
        const nueva = await movimiento.generarClip({
          toma: z.tomas[k],
          tomas: z.tomas,
          pieza: zid,
          config: P.config,
          // La biblioteca sirve a TODOS los episodios: atarla al tratamiento de uno
          // concreto la ataría a ese caso.
          tratamiento: esBiblioteca ? null : z.tratamiento,
          aviso: (m) => decir?.(m.length > 24 ? `${m.slice(0, 22)}…` : m),
        });
        z.tomas[k] = nueva;
        await refrescar(claveToma(zid, i, 'vid'));
        await guardar();
        // Emparejar gemelas es cosa del episodio: en la biblioteca cada entrada es
        // una persona distinta y no hay nada que compartir.
        if (!esBiblioteca) await emparejarGemelos();
        avisar(donde, `Clip de ${comoSeLlama} listo${filaClips.length > 1 ? `; sigue la fila (${filaClips.length - 1})` : ''}.`, 'bueno');
      } catch (e) {
        // Un clip que falla no tumba la fila: se anota y sigue el siguiente (§4).
        avisar(donde, `${comoSeLlama}: ${e.message}`, 'malo');
      }
      filaClips.shift();
      if (esBiblioteca) pintarBiblioteca();
      else pintarPorTipo();
    }
  } finally {
    bombeandoClips = false;
  }
}

async function rehacerMusica() {
  // LA PISTA ÚNICA, otra vez: un clip nuevo del generador, que el montaje
  // repite debajo del episodio entero.
  const z = pieza();
  avisar('previa', 'Rehaciendo la pista de fondo…');
  const r = await musica.generarMusicaDeEscena({
    escena: { n: musica.PISTA_UNICA },
    tomas: z.tomas,
    pieza: idMaterial(),
    tratamiento: z.tratamiento,
  });
  // Queda anotada en la escena 0 —creada si el reparto no la tiene—: la pista
  // rehecha vive bajo el nombre de este episodio, apuntara donde apuntara antes.
  escenaCero(z).musica = r.musica;
  await guardar();
  await refrescar(r.clave);
  pintarTodo();
  avisar('previa', 'Pista rehecha: escúchala en su fila. El montado se actualiza al preparar.', 'bueno');
}

/** La escena 0, donde se anota la pista única; se crea si el reparto no la tiene. */
function escenaCero(z) {
  let e = z.escenas.find((x) => x.n === musica.PISTA_UNICA);
  if (!e) {
    e = { n: musica.PISTA_UNICA };
    z.escenas.push(e);
  }
  return e;
}

/**
 * El historial de casos.
 *
 * Cada caso es una pieza y todas se quedan. Elegir un caso nuevo ya no pisa el
 * anterior: se puede volver a él, mirarlo, o pedirle una continuación.
 */
/**
 * Lo que ya se contó de este caso, para no repetirlo.
 *
 * Sale de la ascendencia de la pieza: las partes anteriores, de la más reciente a
 * la más antigua, con su guion ENTERO. No un resumen —lo que importa es qué
 * frases están dichas, y eso un resumen lo pierde—. Solo las que tienen guion:
 * una pieza sin escribir no ha contado nada.
 */
function loYaContado() {
  return estado
    .ascendencia(P, pieza())
    .filter((z) => (z.guion || '').trim())
    .map((z) => ({
      titulo: z.titulo,
      guion: z.guion,
      premisa: z.tratamiento?.premisa || '',
      hilo: z.tratamiento?.hilo || '',
    }));
}

/**
 * Los dos botones de continuación aparecen CUANDO SIRVEN, no antes.
 *
 * Estaban los dos sueltos en Ajustes, siempre visibles. Así se podía pedir
 * «reutilizar imágenes» de un guion de continuación que todavía no existía, que no
 * es que fallara: es que no significaba nada. Cada uno tiene un momento:
 *
 *   · continuar  → cuando ESTE caso ya tiene guion. Se continúa lo escrito.
 *   · reutilizar → cuando la continuación ya tiene sus tomas dirigidas, porque lo
 *                  que se compara son los planos, y sin dirigir no hay planos.
 */
function pintarContinuacion() {
  const z = pieza();
  const hayGuion = !!(z.guion || '').trim();
  const padres = estado.ascendencia(P, z);

  $('panel-continuar').classList.toggle('oculto', !hayGuion);
  if (hayGuion) {
    $('nota-continuar').textContent =
      `Otro video del mismo caso. Hereda las ${z.fichas.length} fichas, la paleta y la música ` +
      `de «${z.titulo}», y el director buscará lo que quedó fuera de este guion.`;
    $('nota-reescribir').textContent =
      `¿El guion no te convence? «Reescribir» abre otra pieza del mismo caso —fichas y tratamiento ` +
      `incluidos— para escribirlo de nuevo SIN tocar esta: sus imágenes y clips quedan a salvo y ` +
      `se recuperan con «Reutilizar». Regenerar el guion aquí mismo los perdería.`;
  }

  // Dirigidas y sin imagen: es lo único que se puede reutilizar. Y sirve
  // cualquier otro caso del proyecto, no solo el que esta pieza continúa: el banco
  // de planos genéricos —una comisaría, patrullas, un pasillo de juzgado— no es de
  // ningún caso en particular.
  const otras = P.piezas.filter((x) => x.id !== z.id && (x.tomas || []).some((t) => t.imagen === 'ok'));
  const candidatas = z.tomas.filter(
    (t) =>
      t.plano &&
      (t.movimiento ? !t.heredadoVid && t.video !== 'ok' : !t.heredado && t.imagen !== 'ok'),
  ).length;
  const puede = otras.length > 0 && candidatas > 0;
  $('b-reutilizar').classList.toggle('oculto', !puede);
  if (puede) {
    $('b-reutilizar').textContent =
      padres.length
        ? `Reutilizar imágenes de «${padres[0].titulo}» y de los demás casos`
        : `Buscar imágenes reutilizables en los otros ${otras.length === 1 ? 'casos' : `${otras.length} casos`}`;
  }
}

/**
 * Qué episodio está abierto, dicho con todas las letras.
 *
 * «El inicio me sale ya iniciado el último caso que se investigó.» La aplicación
 * abre el último episodio en el que se trabajó —que es lo correcto: se estaba a
 * medias— pero no lo decía en ninguna parte, así que los pasos de abajo parecían
 * el estado de la herramienta y no el de UN episodio concreto.
 */
/**
 * El Inicio: en qué estado está el canal y por dónde se entra.
 *
 * No genera nada y no tiene formularios. Es el mapa: cuánto archivo hay, cuántos
 * episodios, cuál está abierto, y un botón por sección que dice en qué está.
 */
function pintarInicio() {
  const caja = $('estado-canal');
  if (caja) {
    const b = bibliotecaFase.resumenBiblioteca(tomasParaPintar(), P.config.movimiento.politica);
    const eps = estado.episodiosDe(P);
    caja.innerHTML =
      `<div class="reparto">` +
      `<span class="pastilla ${b.imagenesFaltan ? '' : 'p-ok'}">${b.total - b.imagenesFaltan} de ${b.total} imágenes de archivo</span>` +
      (b.porRevisar ? `<span class="pastilla p-aviso">${b.porRevisar} por revisar</span>` : '') +
      `<span class="pastilla">${eps.length} episodio${eps.length === 1 ? '' : 's'}</span>` +
      `<span class="pastilla">${P.config.guion.minutos} min por episodio</span>` +
      `</div>`;
  }

  const entradas = $('entradas-inicio');
  if (!entradas) return;
  const z = pieza();
  const hay = estado.hayEpisodio(P);
  const b = bibliotecaFase.resumenBiblioteca(tomasParaPintar(), P.config.movimiento.politica);
  const filas = [
    ['biblioteca', 'Archivo del canal',
      b.imagenesFaltan
        ? `Faltan ${b.imagenesFaltan} imágenes por generar de ${b.total}.`
        : b.porRevisar
          ? `${b.porRevisar} imágenes generadas y sin revisar.`
          : `${b.total} imágenes listas y aprobadas.`],
    ['episodios', 'Episodios',
      hay
        ? `${estado.episodiosDe(P).length} guardados. Abierto: ${z.titulo || z.id}.`
        : 'No tienes ninguno. Empieza uno aquí.'],
    ['guion', 'El episodio',
      hay
        ? `El caso, el expediente, el guion y la generación de «${z.titulo || z.id}».`
        : 'Necesita un episodio abierto.'],
    ['previa', 'Previa', hay ? 'Escucha y mira lo generado, o el montaje entero.' : 'Necesita un episodio abierto.'],
    ['ajustes', 'Ajustes', 'Generadores, formato, voz y copia en la nube.'],
  ];
  entradas.innerHTML = '';
  for (const [vista, titulo, dice] of filas) {
    const el = document.createElement('button');
    el.innerHTML = `<b>${escapar(titulo)}</b><span>${escapar(dice)}</span>`;
    el.onclick = () => ir(vista);
    entradas.appendChild(el);
  }

  // EL EPISODIO EN MARCHA, Y POR DÓNDE SE SIGUE.
  //
  // «El inicio no es un inicio real, es un resumen de las otras secciones. No
  //  hay una forma de iniciar un episodio nuevo ahí.» Aquí se dice cuál está en
  //  marcha y en qué paso va, con un botón que lleva a ese paso y otro que abre
  //  uno nuevo.
  const marcha = $('en-marcha');
  if (marcha) {
    const titulo = $('en-marcha-titulo');
    if (hay) {
      const s = siguientePaso(z);
      if (titulo) titulo.textContent = 'El episodio en marcha';
      marcha.innerHTML = `<b>${escapar(z.titulo || z.caso?.titulo || z.id)}</b><p>${escapar(s.dice)}</p>`;
      $('b-inicio-seguir').textContent = `Seguir: ${s.accion}`;
    } else {
      if (titulo) titulo.textContent = 'Empieza';
      marcha.innerHTML =
        '<b>No hay ningún episodio empezado.</b>' +
        '<p>Empieza uno: eliges el caso, se construye el expediente, se escribe el guion y se genera todo lo demás.</p>';
    }
    $('b-inicio-seguir').classList.toggle('oculto', !hay);
    $('b-inicio-nuevo').classList.toggle('primario', !hay);
  }
}

/**
 * En qué paso va un episodio, con palabras, y qué es lo siguiente.
 *
 * Es la misma cuenta que enciende los pasos en `pintarPasos` y las pastillas de
 * las fases en `cuentasDeFases` —que miran el episodio abierto—, dicha de una vez
 * para el Inicio.
 */
function siguientePaso(z) {
  const t = z.tomas;
  if (!z.caso) return { n: 1, dice: 'Sin caso todavía. Lo primero es elegirlo, o escribir tu propia idea (paso 1).', accion: 'elegir el caso' };
  if (!z.fichas.length) return { n: 2, dice: 'Caso elegido. Falta construir el expediente (paso 2).', accion: 'construir el expediente' };
  if (!z.tratamiento) return { n: 3, dice: 'Expediente hecho. Falta dirigir la pieza y escribir el guion (paso 3).', accion: 'dirigir y escribir el guion' };
  if (!(z.guion || '').trim() || !t.length) return { n: 3, dice: 'Pieza dirigida. Falta escribir el guion y partirlo en tomas (paso 3).', accion: 'escribir el guion' };
  const faltan = cuentasDeFases()
    .filter(([, , hechas, total]) => hechas < total)
    .map(([, nombre, hechas, total]) => `${nombre.toLowerCase()} ${hechas} de ${total}`);
  if (faltan.length) {
    return { n: 4, dice: `Guion en ${t.length} tomas. Falta generar: ${faltan.join(' · ')} (paso 4).`, accion: 'generar el material' };
  }
  if (!z.montaje) return { n: 5, dice: 'Todo el material generado. Falta montar el video (paso 5).', accion: 'montar el video' };
  return { n: 6, dice: 'Montado. Queda bajar el video y el texto de publicación (paso 6).', accion: 'bajar el video' };
}

function pintarEpisodioAbierto() {
  // SIN EPISODIOS es un estado normal desde que borrar es borrar. La pantalla lo
  // dice y esconde los pasos, en vez de enseñar los seis pasos de un episodio que
  // no existe.
  const hay = estado.hayEpisodio(P);
  $('sin-episodio')?.classList.toggle('oculto', hay);
  for (const id of ['paso1', 'paso2', 'paso3', 'paso4', 'paso5', 'paso6']) {
    $(id)?.classList.toggle('oculto', !hay);
  }

  const caja = $('abierto-dice');
  if (!caja) return;
  if (!hay) {
    $('cuenta-abierto').textContent = '';
    caja.innerHTML =
      'Ninguno. Dale a <b>Empezar un episodio nuevo</b> aquí abajo. El archivo del ' +
      'canal no se toca: sigue donde estaba y no se vuelve a pagar.';
    return;
  }
  const z = pieza();
  const hechas = [
    z.caso ? 'caso elegido' : null,
    z.fichas.length ? `${z.fichas.length} fichas` : null,
    z.tratamiento?.premisa ? 'dirigido' : null,
    (z.guion || '').trim() ? `${z.tomas.length} tomas` : null,
    z.tomas.filter((t) => t.imagen === 'ok').length ? `${z.tomas.filter((t) => t.imagen === 'ok').length} imágenes` : null,
  ].filter(Boolean);
  $('cuenta-abierto').textContent = z.id;
  caja.innerHTML = z.caso
    ? `<b>${escapar(z.titulo || z.caso.titulo)}</b> — ${hechas.join(' · ') || 'recién abierto'}. ` +
      `Se trabaja en «El episodio». Para cambiar a otro, ábrelo en la lista de abajo.`
    : `<b>${escapar(z.titulo || z.id)}</b> — todavía sin caso. Elígelo en «El episodio», ` +
      `o escribe tu propia idea y dale a «Usar mi idea».`;
}

function pintarHistorial() {
  const caja = $('historial');
  if (!caja) return;
  // La biblioteca no es un episodio: no se abre desde aquí, tiene su propio panel.
  const piezas = estado.episodiosDe(P).sort((a, b) => (b.creado || 0) - (a.creado || 0));
  $('cuenta-historial').textContent = piezas.length > 1 ? `${piezas.length}` : '';

  // CADA FILA CON SU FORMA. «La sección de casos está horrible, parece una
  // página de los ochenta.» Y era una regla de estilo: la lista se vestía con
  // `.hist button`, que alcanzaba también al «Borrar» de cada fila —un botón
  // más— y lo sacaba a ancho completo, aplastando el título a una palabra por
  // línea. La fila tiene ahora sus propias clases, y el botón de borrar no crece.
  caja.className = 'episodios';
  caja.innerHTML = '';
  for (const z of piezas) {
    const padres = estado.ascendencia(P, z);
    const palabras = (z.guion || '').trim() ? guionFase.contarPalabras(z.guion) : 0;
    const partes = [
      z.fichas.length ? `${z.fichas.length} fichas` : 'sin investigar',
      palabras ? `${palabras} palabras` : 'sin guion',
      z.tomas.length ? `${z.tomas.length} tomas` : '',
      z.tomas.filter((t) => t.imagen === 'ok').length ? `${z.tomas.filter((t) => t.imagen === 'ok').length} imágenes` : '',
    ].filter(Boolean);
    const abierto = z.id === P.piezaActiva;

    const fila = document.createElement('div');
    fila.className = abierto ? 'episodio on' : 'episodio';

    const b = document.createElement('button');
    b.className = 'episodio-abrir';
    b.innerHTML =
      `<b>${escapar(z.titulo || z.caso?.titulo || 'Sin título')}${abierto ? ' · abierto' : ''}</b>` +
      `<span>${escapar(z.id)} · ${padres.length ? `continuación de «${escapar(padres[0].titulo)}» · ` : ''}${partes.join(' · ')}</span>`;
    b.onclick = async () => {
      try {
        exigirSinTandaEnMarcha();
      } catch (e) {
        return avisar('historial', e.message, 'malo');
      }
      P.piezaActiva = z.id;
      P.titulo = z.titulo || P.titulo;
      await guardar();
      pintarTodo();
      avisar('historial', `Abierto: ${z.titulo}.`, 'bueno');
    };
    fila.appendChild(b);

    // BORRAR, que no existía en ninguna parte. Se pregunta con el nombre delante:
    // un «¿seguro?» a secas se contesta que sí sin leer.
    const x = document.createElement('button');
    x.className = 'btn peligro chico episodio-borrar';
    x.textContent = 'Borrar';
    x.title = `Quitar «${z.titulo}» del proyecto`;
    x.onclick = async () => {
      if (!confirm(`¿Quitar «${z.titulo || z.id}» del proyecto?\n\nLo YA GENERADO no se borra de la nube —está pagado y otros episodios pueden reutilizarlo—, y su número no se vuelve a usar.`)) return;
      try {
        exigirSinTandaEnMarcha();
        estado.borrarPieza(P, z.id);
      } catch (e) {
        return avisar('historial', e.message, 'malo');
      }
      await guardar();
      pintarTodo();
      avisar('historial', `Quitado. Quedan ${estado.episodiosDe(P).length}.`, 'bueno');
    };
    fila.appendChild(x);
    caja.appendChild(fila);
  }
}

/**
 * Una continuación: otro video del MISMO caso.
 *
 * Hereda el caso, las fichas y el tratamiento del padre. Lo primero porque volver
 * a investigar lo mismo es pagar dos veces por lo que ya se sabe; lo último para
 * que la segunda parte se vea y suene como la primera.
 *
 * Y el material del padre queda a mano para reutilizarlo: la imagen de un lugar
 * que ya salió no se paga otra vez (§3).
 */
accion(
  'b-continuacion',
  async () => {
    const padre = pieza();
    if (!padre.caso) throw new Error('Este caso todavía no tiene nada. Elige un caso primero.');
    exigirSinTandaEnMarcha();
    if (!padre.guion.trim()) {
      throw new Error('Escribe el guion de este caso antes de pedirle una continuación.');
    }
    const z = estado.abrirPieza(P, { vieneDe: padre.id });
    await guardar();
    pintarTodo();
    avisar(
      'continuar',
      `Abierta la continuación de «${padre.titulo}»: hereda sus ${z.fichas.length} fichas, ` +
        `su paleta, su música y las cautelas del caso. Dale a «Dirigir» en el paso 3: ` +
        `el director leerá lo ya contado y buscará lo que quedó fuera.`,
      'bueno',
    );
  },
  'continuar',
);

/**
 * Reescribir: el mismo caso otra vez, en una pieza NUEVA.
 *
 * Es la respuesta a «quiero regenerar el guion sin perder lo ya pagado». En la
 * misma pieza no se puede: el guion nuevo reemplaza las tomas enteras —con ellas
 * se van los enlaces a imágenes, clips y voces— y lo que se generara después
 * escribiría encima de los archivos del material viejo, que usan las mismas
 * claves. La pieza nueva hereda caso, fichas y tratamiento, sin `vieneDe`: no es
 * una continuación, se cuenta lo mismo otra vez. El material pagado vuelve por
 * «Reutilizar» en Tomas, donde las fichas de plano coincidan.
 */
accion(
  'b-reescribir',
  async () => {
    const vieja = pieza();
    if (!vieja.guion.trim()) throw new Error('Esta pieza no tiene guion que reescribir.');
    exigirSinTandaEnMarcha();
    const z = estado.reescribirPieza(P, vieja.id);
    await guardar();
    pintarTodo();
    avisar(
      'continuar',
      `Abierta «${z.titulo}»: mismo caso, mismas ${z.fichas.length} fichas y el mismo tratamiento. ` +
        `«${vieja.titulo}» queda intacta en el historial, con todo su material. ` +
        `El camino: genera el guion (o dale a «Dirigir» antes si quieres otra estructura), luego la ` +
        `dirección de arte, y en Tomas «Reutilizar imágenes» recupera lo ya pagado donde los planos ` +
        `coincidan. La música y la voz sí se generan de nuevo.`,
      'bueno',
    );
  },
  'continuar',
);

/**
 * Marca las tomas cuyo plano ya existe en una pieza anterior.
 *
 * No genera nada ni gasta: solo apunta a lo que ya está en el almacén. Se hace a
 * mano y con el número delante porque es una decisión —dos planos «parecidos» no
 * siempre valen— y porque enseñar cuántas imágenes te ahorras es lo que hace que
 * merezca la pena mirarlo.
 */
/**
 * Aplica una lista de herencias sobre las tomas de una pieza.
 *
 * Lo usan los dos caminos —el botón de reutilizar y la resolución automática
 * contra la biblioteca al dirigir— para que no haya dos sitios donde equivocarse
 * al marcar una toma como heredada. Ya pasó una vez: el camino que heredaba un
 * clip no marcaba `movimiento`, y la hoja se montaba con la imagen fija teniendo
 * el clip comprado al lado.
 */
function ordenDeEpisodios() {
  return estado
    .episodiosDe(P)
    .slice()
    .sort((a, b) => (a.creado || 0) - (b.creado || 0))
    .map((z) => z.id);
}

/**
 * El contexto de reparto que necesita la herencia: qué usó cada episodio y en qué
 * orden salieron. Es LA MEMORIA que impide que el mismo perito salga en tres
 * episodios seguidos.
 */
function contextoDeReparto(z) {
  // Y EL FORMATO, para que `heredables` lo compruebe por su cuenta en vez de
  // fiarse de que quien la llame haya filtrado bien.
  return { historial: P.reparto, orden: ordenDeEpisodios(), pieza: z.id, aspecto: aspectoDeLaPieza(z) };
}

/** Anota qué persona y qué versión le tocaron a este episodio. */
async function anotarReparto(z, elegido) {
  if (!elegido || !Object.keys(elegido).length) return;
  P.reparto[z.id] = { ...(P.reparto[z.id] || {}), ...elegido };
  await guardar();
}

function aplicarHerencia(z, lista) {
  for (const { i, de, tipo } of lista) {
    const t = z.tomas.find((x) => x.i === i);
    if (!t) continue;
    // `de.clave` es la del archivo DE VERDAD: si el donante a su vez heredaba,
    // apunta al original y no a un archivo que nunca se generó.
    if (tipo === 'vid') {
      t.heredadoVid = de.clave;
      t.video = 'ok';
      // Y pasa a ser toma CON MOVIMIENTO: sin esto la hoja no usa el clip —exige
      // `movimiento` para pedirlo— y la toma se montaba con la imagen fija
      // teniendo el clip heredado ahí al lado.
      t.movimiento = true;
    } else {
      t.heredado = de.clave;
      t.imagen = 'ok';
    }
  }
  return lista.length;
}

/**
 * Resuelve las tomas de esta pieza contra la BIBLIOTECA, en cuanto se dirige.
 *
 * Se hace aquí y no esperando al botón porque es lo que evita pagar: si la toma
 * del perito no queda resuelta ANTES de darle a «Imágenes», se genera un perito
 * nuevo y el de la biblioteca se queda en el estante. El paso más caro no puede
 * depender de que alguien se acuerde de pulsar algo antes.
 *
 * Solo contra la biblioteca: entre casos sigue mandando el botón, porque ahí la
 * coincidencia es por parecido y la decide una persona.
 */
async function resolverContraBiblioteca(z) {
  const b = estado.bibliotecaDe(P, aspectoDelCanal());
  if (!b || !z.tomas.length) return 0;
  const puede = imagenFase.heredables(z.tomas, [b], contextoDeReparto(z));
  if (!puede.length) return 0;
  aplicarHerencia(z, puede);
  await anotarReparto(z, puede.reparto);
  await guardar();
  return puede.length;
}

accion(
  'b-reutilizar',
  async () => {
    const z = pieza();
    if (!z.tomas.length) throw new Error('Este caso todavía no tiene tomas dirigidas.');
    // TODAS las piezas del proyecto, no solo las de este caso.
    //
    // Hay planos que no son de nadie —una comisaría, patrullas frente a una casa,
    // un pasillo de juzgado— y sirven para el caso de la semana que viene igual
    // que para el de hoy. Limitar esto a la ascendencia dejaba fuera justo el
    // banco que hace viable un canal que todavía no monetiza.
    //
    // PERO SOLO LAS DE SU FORMATO. El montaje no pone barras: agranda hasta
    // llenar el ancho y recorta el centro, así que una imagen vertical en un
    // episodio horizontal pierde dos tercios del alto. Reutilizar entre formatos
    // no ahorra: estropea.
    const suAspecto = aspectoDelCanal();
    const otras = P.piezas.filter((x) => x.id !== z.id && aspectoDeLaPieza(x) === suAspecto);
    if (!otras.length) {
      throw new Error(`Todavía no hay otros casos en ${suAspecto} de los que reutilizar nada.`);
    }

    const puede = imagenFase.heredables(z.tomas, otras, contextoDeReparto(z));
    if (!puede.length) {
      return avisar(
        'tomas',
        `Ningún plano de este guion coincide con los ${otras.length === 1 ? 'del otro caso' : `de los otros ${otras.length} casos`}.`,
        'bueno',
      );
    }
    aplicarHerencia(z, puede);
    await anotarReparto(z, puede.reparto);
    await guardar();
    pintarTodo();
    avisar(
      'tomas',
      `${puede.length} tomas reutilizan material ya generado: ` +
        `${puede.filter((x) => x.tipo === 'vid').length} clips y ` +
        `${puede.filter((x) => x.tipo !== 'vid').length} imágenes ` +
        `(${[...new Set(puede.map((x) => x.de.titulo))].join(', ')}). Esas ya no se pagan.`,
      'bueno',
    );
  },
  'tomas',
);

function pintarTiras() {
  const tomas = preparada?.tomas || [];
  $('cuenta-previa').textContent = tomas.length ? `${tomas.length}` : '';
  const caja = $('tiras');
  caja.innerHTML = '';
  tomas.forEach((t, k) => {
    const b = document.createElement('button');
    b.className = 'tira';
    b.innerHTML =
      // Las tomas con clip enseñan SU FOTOGRAMA, no la palabra «clip». Con
      // ochenta y tres tomas, una tira de texto no dice nada: repasar es mirar.
      (t.movimiento && t.cartel
        ? `<img src="${URL.createObjectURL(t.cartel)}" alt="">`
        : t.visual && !t.movimiento
          ? `<img src="${URL.createObjectURL(t.visual)}" alt="">`
          : t.visual
            ? `<div class="sin" style="color:var(--violeta-2)">clip</div>`
            : `<div class="sin">sin imagen</div>`) +
      `<div class="pie">#${t.i + 1}` +
      (t.voz ? '' : ' <span class="pastilla p-falta">sin voz</span>') +
      `</div>`;
    // Tocar una tira deja la reproducción lista DESDE ahí: revisar es saltar a lo
    // que sospechas, no verlo entero otra vez.
    b.onclick = () => {
      desdeSegundo = reproductor.segundoDe(k);
      reproductor.irA(k);
    };
    caja.appendChild(b);
  });
}

// ── Producción automática ─────────────────────────────────────────────────────
//
// Encadena todo desde el caso ya elegido hasta el video montado.
//
// NO se salta ninguna regla del §4: cada fase sigue generando por separado, sigue
// cobrando solo lo que genera, sigue teniendo modo «solo las que faltan» y sigue
// escribiendo cada unidad antes de pasar a la siguiente. Detener a mitad deja el
// trabajo hecho guardado, y volver a darle retoma donde se quedó en vez de repetir
// —y volver a pagar— lo que ya está.
//
// Lo único que añade es no tener que estar delante tocando botones en orden.

const PASOS_AUTO = [
  {
    nombre: 'investigación',
    hace_falta: () => !pieza().fichas.length,
    hacer: () => $('b-investigar-fondo').click(),
  },
  { nombre: 'dirección', hace_falta: () => !pieza().tratamiento, hacer: () => $('b-dirigir-pieza').click() },
  { nombre: 'guion', hace_falta: () => !pieza().tomas.length, hacer: () => $('b-generar-guion').click() },
  { nombre: 'narración', hace_falta: () => narracion.planificar(pieza().tomas, P.config).length, hacer: () => $('b-narrar').click() },
  { nombre: 'imágenes', hace_falta: () => imagenFase.planificar(pieza().tomas).length, hacer: () => $('b-imagenes').click() },
  { nombre: 'música', hace_falta: () => musica.planificar(pieza().escenas, pieza().tomas, P.config).length, hacer: () => $('b-musica').click() },
  { nombre: 'montaje', hace_falta: () => !pieza().montaje, hacer: () => $('b-montar').click() },
];

accion(
  'b-producir',
  async () => {
    // Sin episodio abierto, `pieza()` devuelve una pieza vacía SUELTA —no está en
    // el proyecto—, así que producir escribiría en algo que no se guarda nunca. Se
    // para aquí y se dice dónde se empieza.
    if (!estado.hayEpisodio(P)) throw new Error('No hay ningún episodio abierto. Empieza uno en «Casos».');
    if (!pieza().caso) throw new Error('Elige un caso primero, en «El episodio».');

    // Los clips de movimiento NO entran aquí a propósito: son la fase más cara con
    // diferencia (§4.7) y arrancarlos sin preguntar es la forma de despertarse con
    // la cuota gastada. Se lanzan a mano desde el paso 4.
    const pendientes = PASOS_AUTO.filter((s) => s.hace_falta());
    if (!pendientes.length) {
      return avisar('auto', 'Ya está todo hecho. Solo queda bajarlo en el paso 6.', 'bueno');
    }
    if (!confirm(`Se van a hacer ${pendientes.length} fases: ${pendientes.map((s) => s.nombre).join(', ')}.\n\nLos clips de movimiento no entran: esos se lanzan a mano.\n\n¿Sigo?`)) return;

    for (const [i, paso] of pendientes.entries()) {
      if (cola.senal?.aborted || colaInvestiga.senal?.aborted) break;
      avisar('auto', `${i + 1} de ${pendientes.length} · ${paso.nombre}…`);

      // Se pulsa el mismo botón que pulsaría una persona: así la fase automática y
      // la manual no pueden divergir. Si un día una de las dos se arregla, la otra
      // se arregla con ella.
      paso.hacer();
      await esperarAQueTermine(paso);

      // Si la fase no dejó lo que tenía que dejar, se para y se dice cuál: seguir
      // encadenando sobre un hueco produce un fallo mucho más adelante y sin pista.
      if (paso.hace_falta() && paso.nombre !== 'montaje') {
        return avisar('auto', `Se paró en «${paso.nombre}»: no quedó terminado. Mira ese paso y vuelve a darle.`, 'malo');
      }
    }
    pintarPasos();
    avisar('auto', 'Producción terminada. Baja el video en el paso 6.', 'bueno');
  },
  'auto',
);

/** Espera a que la fase deje de trabajar. Sondea el estado, no adivina el tiempo. */
function esperarAQueTermine(paso) {
  return new Promise((res) => {
    let quieto = 0;
    const t = setInterval(() => {
      const trabajando = cola.corriendo || colaInvestiga.corriendo || $('b-montar').disabled;
      if (trabajando) {
        quieto = 0;
        return;
      }
      // Dos vueltas quieto: una sola podría caer en el hueco entre dos llamadas.
      if (++quieto >= 2) {
        clearInterval(t);
        res();
      }
    }, 700);
  });
}

// ── Paso 5: montaje ───────────────────────────────────────────────────────────

accion(
  'b-revisar',
  async () => {
    const r = await montajeFase.revisar({ pieza: pieza(), config: P.config });
    avisar(
      'paso5',
      r.completo
        ? `Se monta en ${r.lienzo.aspecto}, ${r.lienzo.ancho}×${r.lienzo.alto}` +
          (r.generadoEn ? `, y el episodio se generó en ${r.generadoEn}` : '') +
          `. Todo listo: ${r.total} materiales — ${r.deQueSon} — y ${(r.duracion / 60).toFixed(1)} minutos.`
        : `Faltan ${r.faltan.length} de ${r.total} materiales (${r.deQueSon}).`,
      r.completo ? 'bueno' : 'malo',
    );
    // EL PORQUÉ ANTES QUE LA LISTA, Y EN LA MISMA CAJA QUE EL TITULAR.
    //
    // Estaba al revés y en otro sitio: doscientas treinta y ocho claves —«Faltan
    // 238 de 250»— se pintaban ANTES del aviso y en el registro del paso
    // anterior, encima de lo que hubiera dejado la generación. En un teléfono eso
    // deja fuera de pantalla lo único que decide qué hacer, que es si el material
    // falta o está en otro sitio. Y la lista se recorta: veinte claves ya dicen
    // de qué van las doscientas treinta y ocho.
    if (r.avisos.length) registro('paso5', r.avisos);
    if (!r.completo) {
      registro(
        'paso5',
        r.faltan.length > 20
          ? [...r.faltan.slice(0, 20), `… y ${r.faltan.length - 20} más.`]
          : r.faltan,
      );
    }
    // Y CON MATERIAL QUE FALTA, LA SALIDA A MANO. Sale aquí porque es aquí donde
    // se descubre: un botón que solo aparece cuando sirve.
    $('b-buscar-material').classList.toggle('oculto', r.completo);
  },
  'paso5',
);

accion(
  'b-buscar-material',
  async () => {
    avisar('paso5', 'Buscando en el almacén el material que falta…');
    const r = await montajeFase.buscarElMaterial({
      pieza: pieza(),
      config: P.config,
      aviso: (m) => avisar('paso5', m),
    });
    if (!r.encontrados) {
      avisar(
        'paso5',
        r.faltaban
          ? `No encontré en el almacén ninguno de los ${r.faltaban} que faltan. Ese material no ` +
            `está subido: hay que generarlo.`
          : 'No falta nada.',
        r.faltaban ? 'malo' : 'bueno',
      );
      return;
    }
    await guardar();
    pintarTodo();
    avisar(
      'paso5',
      `Encontrados ${r.encontrados} de ${r.faltaban} en «${r.carpeta}», y apuntados a su sitio. ` +
        `No se ha generado ni pagado nada. Dale a Revisar otra vez.`,
      'bueno',
    );
  },
  'paso5',
);

/**
 * VIGILA UN MONTAJE QUE YA ESTÁ EN MARCHA. Se llama al arrancar, no solo al pulsar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El montaje de media hora de documental tarda media hora, y en ese rato el
 * teléfono se bloquea, Safari descarga la pestaña o se recarga la página. El
 * trabajo NO se entera —corre en la nube, no aquí— pero la aplicación dejaba de
 * mirarlo: al volver, la pantalla estaba como antes de empezar, y el único botón
 * que había era Montar. Darle otra vez son otros treinta minutos y otro trabajo
 * pagado, para fabricar un archivo que ya estaba hecho.
 *
 * El identificador del trabajo se guarda en la pieza ANTES de esperar, justo
 * para esto. Aquí solo se usa: se le pregunta a la nube en qué va y se vuelve a
 * mirar. Si ya terminó, se dice y se habilita la bajada, sin ruido.
 * ─────────────────────────────────────────────────────────────────────────────
 */
let vigilando = null;

async function vigilarMontaje({ recienLanzado = false } = {}) {
  const ejecucion = pieza().montaje;
  if (!ejecucion || vigilando === ejecucion) return;
  vigilando = ejecucion;
  try {
    const r = await montajeFase.esperarMontaje({ ejecucion, aviso: (m) => avisar('paso4', m) });
    if (r.ok) {
      avisar(
        'paso4',
        recienLanzado
          ? `Montado en ${r.minutos} minutos. Ya puedes bajarlo en el paso 6.`
          : 'El montaje que dejaste en marcha ya está terminado. Bájalo en el paso 6.',
        'bueno',
      );
      $('b-bajar').disabled = false;
      $('paso5').classList.remove('espera');
    } else {
      // §7.6: la aplicación lee el registro de la nube por su cuenta.
      avisar('paso4', r.error, 'malo');
      registro('paso4', r.registro);
    }
  } catch (e) {
    avisar('paso4', e.message, 'malo');
  } finally {
    vigilando = null;
  }
}

accion(
  'b-montar',
  async () => {
    // SI YA HAY UNO EN MARCHA, NO SE LANZA OTRO. Volver a lanzarlo son otros
    // treinta minutos y otro trabajo pagado por el mismo archivo.
    if (vigilando) {
      avisar('paso4', 'Ya hay un montaje en marcha. Espera a que termine.', 'malo');
      return;
    }
    avisar('paso4', 'Comprobando el material…');
    const ejecucion = await montajeFase.montar({
      pieza: pieza(),
      config: P.config,
      aviso: (m) => avisar('paso4', m),
    });
    pieza().montaje = ejecucion;
    await guardar();
    pintarPasos();
    await vigilarMontaje({ recienLanzado: true });
  },
  'paso5',
);

// ── Paso 5: exportar ──────────────────────────────────────────────────────────

accion(
  'b-metadatos',
  async () => {
    const m = await metadatos.generarMetadatos({
      tema: pieza().tema,
      guion: pieza().guion,
      tomas: pieza().tomas,
      escenas: pieza().escenas,
      fichas: pieza().fichas,
    });
    pieza().metadatos = m;
    await guardar();

    $('aviso-paso5').innerHTML =
      (m.aviso ? `<div class="aviso malo">${escapar(m.aviso)}</div>` : '') +
      `<label>Títulos</label>` +
      m.titulos.map((t) => `<div class="ficha"><p>${escapar(t)}</p></div>`).join('') +
      `<label>Descripción · ${escapar(m.duracion)}</label>` +
      `<textarea readonly style="min-height:200px">${escapar(m.descripcion)}</textarea>` +
      // LOS DOS CAMPOS DE YOUTUBE, CADA UNO EN SU FORMA, LISTOS PARA COPIAR.
      //
      // «Las etiquetas están saliendo sin hashtag. De nada me sirve, igual tengo
      //  que hacer trabajo manual poniéndole hashtag uno por uno.»
      //
      // Son dos sitios distintos y quieren formas distintas: el campo de etiquetas
      // va sin almohadilla y separado por comas, y los hashtags van dentro de la
      // descripción con ella. Estaba solo el primero, así que el segundo había que
      // escribirlo a mano, uno por uno.
      `<label>Hashtags</label>` +
      `<textarea readonly style="min-height:70px">${escapar(metadatos.hashtagsDe(m.etiquetas).join(' '))}</textarea>` +

      `<label>Etiquetas</label>` +
      `<textarea readonly style="min-height:70px">${escapar(m.etiquetas.join(', '))}</textarea>`;
  },
  'paso5',
);

/**
 * LO QUE YA ESTÁ MONTADO, PREGUNTADO AL ALMACÉN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Recuerda que utilizo mi celular, entonces no puedo dejarlo simplemente quieto
 *  allí, montando. Si fuera una computadora, es otra cosa.»
 *
 * Y es verdad: el montaje de media hora de documental tarda media hora, y un
 * teléfono no se queda media hora con la pestaña abierta y despierta. El video
 * terminado se queda en el almacén esperando, pero no había forma de RECOGERLO
 * más tarde: la única bajada era la del episodio abierto, y solo si esta misma
 * pestaña había visto terminar el montaje.
 *
 * Esto es la otra mitad de recuperar un montaje al volver: la lista de lo que
 * hay montado —de este episodio y de los demás—, con su fecha, su tamaño y su
 * bajada. Se le pregunta al almacén, que es el que lo sabe.
 * ─────────────────────────────────────────────────────────────────────────────
 */
accion(
  'b-montados',
  async () => {
    const caja = $('lista-montados');
    caja.innerHTML = '<p class="nota chica">Preguntando al almacén…</p>';
    const r = await llamar('listar', { prefijo: '' });
    const finales = (r.materiales || [])
      .filter((m) => m.bytes > 0 && String(m.clave).endsWith('/final'))
      .sort((a, b) => String(b.actualizado || '').localeCompare(String(a.actualizado || '')));

    if (!finales.length) {
      caja.innerHTML = '<p class="nota chica">Todavía no hay ningún video montado en el almacén.</p>';
      return;
    }

    caja.innerHTML = '';
    for (const m of finales) {
      const id = String(m.clave).split('/')[0];
      const z = (P.piezas || []).find((x) => x.id === id);
      const cuando = m.actualizado ? new Date(m.actualizado).toLocaleString('es') : '';
      const fila = document.createElement('div');
      fila.className = 'ficha';
      fila.innerHTML =
        `<p><b>${escapar(z?.titulo || z?.caso?.titulo || `Episodio ${id}`)}</b></p>` +
        `<p class="nota chica">${(m.bytes / 1048576).toFixed(0)} MB${cuando ? ` · ${escapar(cuando)}` : ''}</p>`;
      const b = document.createElement('button');
      b.className = 'btn chico';
      b.textContent = 'Bajar el video';
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          const video = await montajeFase.bajarFinal({
            pieza: { id },
            alAvanzar: (hecho, total) =>
              (b.textContent = `${(hecho / 1048576).toFixed(0)} de ${(total / 1048576).toFixed(0)} MB`),
          });
          if (!video) throw new Error('El video ya no está en el almacén.');
          const url = URL.createObjectURL(video);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${(z?.titulo || id).replace(/[^\w -]/g, '')}.mp4`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          b.textContent = 'Bajado';
        } catch (e) {
          b.textContent = 'Bajar el video';
          avisar('paso6', e.message, 'malo');
        } finally {
          b.disabled = false;
        }
      });
      fila.appendChild(b);
      caja.appendChild(fila);
    }
  },
  'paso6',
);

accion(
  'b-bajar',
  async () => {
    // EL PAQUETE, no solo el MP4: el video, el texto que se pega al publicar con
    // sus hashtags, y las dos pistas de audio sueltas para poder retocar el
    // sonido sin volver a montar.
    const m = pieza().metadatos;
    if (!m) {
      avisar('paso5', 'Sin metadatos: el paquete irá sin el texto de publicación. Dale a «Metadatos» si lo quieres dentro.');
    }
    const r = await montajeFase.bajarPaquete({
      pieza: pieza(),
      titulo: P.titulo,
      texto: metadatos.textoDePublicacion(m, P.titulo),
      alAvanzar: (que, hecho, total) =>
        avisar(
          'paso5',
          `Bajando ${que}… ${(hecho / 1048576).toFixed(0)} de ${(total / 1048576).toFixed(0)} MB`,
        ),
    });
    if (!r) throw new Error('El video montado no está en el almacén todavía.');

    const url = URL.createObjectURL(r.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = r.archivo;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    avisar(
      'paso5',
      r.incompleto ||
        `Descargado ${r.archivo}: ${r.lleva.length} archivos.` +
          (r.faltan
            ? ` Faltan las pistas sueltas de voz y música: las sube el montaje, así que estarán en el próximo que hagas.`
            : ''),
      r.incompleto || r.faltan ? 'malo' : 'bueno',
    );
  },
  'paso5',
);

// ── Ajustes ───────────────────────────────────────────────────────────────────

/**
 * El aspecto es DEL CANAL, no del proyecto.
 *
 * Había seis estilos, un desplegable y un muestrario que generaba una imagen por
 * estilo para elegir mirando. Con la biblioteca permanente eso deja de ser una
 * preferencia y pasa a ser dinero: dos estilos son DOS BIBLIOTECAS de 141 imágenes,
 * o una mezcla silenciosa —un perito en cine negro dentro de un episodio rodado en
 * reconstrucción, sin que nada avise—.
 *
 * Y lo que se ganaba era poco: medido sobre la instrucción que sale de verdad, el
 * estilo aportaba unos 270 caracteres de 2.660. Un diez por ciento. Lo que hace que
 * un episodio no se parezca al anterior sigue vivo y no cuesta nada: la identidad
 * visual que el director decide para cada caso, y el elenco que rota.
 *
 * Queda «Probar cómo se ve», que genera UNA imagen: eso no era para comparar
 * estilos, era para no gastar ochenta a ciegas, y esa razón sigue en pie.
 */

accion(
  'b-probar-estilo',
  async () => {
    avisar('estilo', 'Generando una imagen de muestra…');
    const r = await imagenFase.probarEstilo({
      tomas: pieza().tomas,
      config: { ...P.config, __pieza: idMaterial() },
      tratamiento: pieza().tratamiento,
    });
    if (r.blob) {
      $('muestra-estilo').src = URL.createObjectURL(r.blob);
      $('visor-estilo').classList.remove('oculto');
    }
    avisar(
      'estilo',
      r.deLaToma !== null
        ? `Muestra con la toma ${r.deLaToma + 1} de tu documental.`
        : 'Muestra con una escena de ejemplo: dirige la pieza y vuelve a probar para verla con tu material.',
      'bueno',
    );
  },
  'estilo',
);

accion(
  'b-ver-prompt',
  async () => {
    const toma = pieza().tomas.find((t) => t.plano);
    if (!toma) throw new Error('Dirige la pieza primero: sin ficha de plano no hay instrucción que enseñar.');
    // CON SU MUNDO. Enseñar la instrucción sin él enseñaría una que no es la que
    // se manda, que es peor que no enseñar nada.
    const txt = imagenFase.componerInstruccion(toma, P.config, {
      tratamiento: pieza().tratamiento,
      mundo: mundoDeLaPieza(),
    });
    registro('estilo', [txt]);
  },
  'estilo',
);

function pintarAjustes() {
  pintarBiblioteca();
  // Los selectores de imagen y clips los llena `cargarModelos` con lo que el
  // proyecto tiene de verdad; aquí solo se refleja lo guardado.
  P.config.imagen.modelo = P.config.imagenModelo.modelo || P.config.imagen.modelo;
  P.config.movimiento.modelo = P.config.videoModelo.modelo || P.config.movimiento.modelo;

  const pon = (id, v, txt) => {
    $(id).value = v;
    if (txt) $(txt).textContent = v;
  };
  pon('clips-episodio', P.config.movimiento.politica.clipsPorEpisodio, 'v-clips-episodio');
  $('minutos').value = P.config.guion.minutos;
  pon('objetivo', P.config.segmentacion.segundosObjetivo, 'v-objetivo');
  pon('velocidad', Math.round(P.config.narracion.velocidad * 100));
  $('v-velocidad').textContent = P.config.narracion.velocidad.toFixed(2);
  pon('musica-volumen', Math.round(P.config.musica.volumen * 100));
  $('v-musica-volumen').textContent = `${Math.round(P.config.musica.volumen * 100)}%`;
  $('expresivas').checked = !!P.config.narracion.vocesExpresivas;
  $('estilo').value = P.config.narracion.estilo || '';
  $('marca-texto').value = P.config.marca.texto;
  $('vertical').value = P.config.formato.vertical ? '1' : '0';
  $('por-minuto').value = P.config.ritmo.porMinuto;
  aplicarRitmo();
}

/**
 * El ritmo con el que se piden las imágenes, del proyecto a la puerta.
 *
 * Manda lo que diga la persona; si no dijo nada, lo que el freno aprendió en
 * sesiones anteriores. Sin esto, cada recarga vuelve a descubrir la cuota
 * chocando: una imagen fallida y varios minutos de espera, cada vez.
 */
function aplicarRitmo() {
  const porMinuto = Number(P.config.ritmo.porMinuto) || 0;
  ponerRitmoMinimo(porMinuto > 0 ? Math.round(60000 / porMinuto) : Number(P.config.ritmo.aprendido) || 0);
}

/** Lo que el freno acabó descubriendo se guarda: la próxima vez no se choca. */
async function recordarRitmo() {
  const ahora = ritmoActual();
  if (ahora === P.config.ritmo.aprendido) return;
  P.config.ritmo.aprendido = ahora;
  await guardar();
}

// Guardar una contraseña sin forma de borrarla no es una opción, es una trampa.
accion(
  'b-salir',
  async () => {
    olvidarClave();
    avisar('ajustes', 'Olvidada en este teléfono. La próxima vez habrá que escribirla.', 'bueno');
  },
  'ajustes',
);

$('por-minuto')?.addEventListener('change', async (e) => {
  P.config.ritmo.porMinuto = Math.max(0, Math.min(60, Math.round(Number(e.target.value) || 0)));
  e.target.value = P.config.ritmo.porMinuto;
  aplicarRitmo();
  await guardar();
  avisar(
    'ajustes',
    P.config.ritmo.porMinuto
      ? `A ${P.config.ritmo.porMinuto} imágenes por minuto: ${Math.round(60 / P.config.ritmo.porMinuto)} s entre cada una. No se choca con la cuota.`
      : 'Automático: la herramienta baja el ritmo sola cuando choca, y lo recuerda.',
    'bueno',
  );
});
$('clips-episodio').addEventListener('input', (e) => ($('v-clips-episodio').textContent = e.target.value));
$('objetivo').addEventListener('input', (e) => ($('v-objetivo').textContent = e.target.value));
$('velocidad').addEventListener('input', (e) => ($('v-velocidad').textContent = (e.target.value / 100).toFixed(2)));
$('musica-volumen').addEventListener('input', (e) => ($('v-musica-volumen').textContent = `${e.target.value}%`));
// Al cambiar de voz, se dice enseguida qué mandos ignora esa: si esperara a
// guardar, se probaría la velocidad con una voz que no la admite y parecería que
// el deslizador está roto.
$('voz')?.addEventListener('change', () => pintarLimitesDeVoz());

// El sitio del caso, escrito a mano. Al salir del campo, no en cada tecla: guardar
// por pulsación son cien escrituras del proyecto entero por «Canadá».
for (const id of ['caso-pais', 'caso-ciudad']) {
  $(id)?.addEventListener('change', () => ponerSitioDelCaso().catch((e) => avisar('investigacion', e.message, 'malo')));
}
// Recargar el catálogo al momento: si hubiera que guardar ajustes primero, parecería
// que el interruptor no hace nada.
$('expresivas').addEventListener('change', async (e) => {
  P.config.narracion.vocesExpresivas = e.target.checked;
  await guardar();
  cargarVoces();
});

accion(
  'b-ajustes',
  async () => {
    for (const [selector, guardado] of [['m-imagen', 'imagenModelo'], ['m-video', 'videoModelo']]) {
      const v = $(selector).value;
      if (v && v !== P.config[guardado].modelo) P.config[guardado].aMano = true;
      if (v) P.config[guardado].modelo = v;
    }
    // Los campos viejos siguen alimentando a las fases hasta que todas lean el nuevo.
    P.config.imagen.modelo = P.config.imagenModelo.modelo || P.config.imagen.modelo;
    P.config.movimiento.modelo = P.config.videoModelo.modelo || P.config.movimiento.modelo;
    P.config.movimiento.politica.clipsPorEpisodio = Number($('clips-episodio').value);
    P.config.segmentacion.segundosObjetivo = Number($('objetivo').value);
    P.config.narracion.velocidad = Number($('velocidad').value) / 100;
    P.config.musica.volumen = Number($('musica-volumen').value) / 100;
    // Los dos ajustes que se ELIGEN OYÉNDOLOS llegan a la previa ya preparada: si
    // hubiera que volver a preparar para oír el cambio, el mando parecería roto.
    if (preparada) preparada.hoja.ajustes.volumenMusica = P.config.musica.volumen;
    P.config.marca.texto = $('marca-texto').value.trim();
    P.config.formato.vertical = $('vertical').value === '1';
    if ($('voz').value) P.config.narracion.nombreVoz = $('voz').value;
    P.config.narracion.vocesExpresivas = $('expresivas').checked;
    P.config.narracion.estilo = $('estilo').value.trim();
    // Tocar el desplegable es elegir a mano: a partir de aquí manda la persona y la
    // herramienta deja de subirlo sola.
    if ($('m-texto').value !== P.config.texto.modelo) P.config.texto.aMano = true;
    P.config.texto.modelo = $('m-texto').value;
    P.titulo = $('titulo').value.trim() || P.titulo;

    // Se vuelve a sanear para que los valores nuevos pasen por el normalizador: el
    // mismo camino que usan las tres cargas, así un valor fuera de rango se corrige
    // aquí y no dentro de una fase a medio generar.
    P = estado.sanear(P);
    ponerModeloTexto(P.config.texto.modelo);
    ponerModelos({ imagen: P.config.imagenModelo.modelo, video: P.config.videoModelo.modelo });
    await guardar();
    pintarAjustes();
    cargarModelos();
    avisar('proyecto', 'Ajustes guardados.', 'bueno');
  },
  'proyecto',
);

accion(
  'b-marca',
  async () => {
    if (!P.config.marca.texto) throw new Error('Escribe el texto de la marca primero.');
    await miniatura.subirMarca({ pieza: idMaterial(), config: P.config });
    avisar('proyecto', 'Marca subida. Se incrusta dentro de cada toma al montar.', 'bueno');
  },
  'proyecto',
);

accion(
  'b-abrir',
  async () => {
    const ids = await estado.listarRemotos();
    if (!ids.length) throw new Error('No hay ningún proyecto guardado en tu nube.');
    const id = ids.length === 1 ? ids[0] : prompt(`¿Cuál?\n${ids.join('\n')}`, ids[0]);
    if (!id) return;
    // Camino de carga 3 (remoto). Pasa por sanear → normalizar igual que los otros
    // dos: es el que se olvidaba y por eso las reparaciones no llegaban (§7.2).
    P = await estado.cargarRemoto(id);
    await guardar();
    pintarTodo();
    avisar('proyecto', `Abierto ${id}.`, 'bueno');
  },
  'proyecto',
);

accion(
  'b-nuevo',
  async () => {
    if (!confirm('¿Empezar un proyecto nuevo? Lo de ahora sigue guardado.')) return;
    P = estado.nuevoProyecto({ titulo: 'Documental sin título' });
    P.id = 'p' + String(Date.now()).slice(-4);
    P.piezas[0].id = P.id;
    casos = [];
    $('zona-casos').innerHTML = '';
    await guardar();
    pintarTodo();
    ir('inicio');
  },
  'proyecto',
);

/** Una muestra corta con la voz elegida, para poder oírla antes de pagar quince minutos. */
accion(
  'b-probar-voz',
  async () => {
    const voz = $('voz').value || P.config.narracion.nombreVoz;
    const r = await llamar('voz', {
      texto:
        'La noche del catorce de marzo, el expediente registra una llamada a las once y cuarenta. ' +
        'Nadie la atendió.',
      nombreVoz: voz,
      velocidad: Number($('velocidad').value) / 100,
      tono: P.config.narracion.tono,
      // La muestra se genera igual que la narración de verdad: si el estilo no
      // entrara aquí, lo que se oye al probar no sería lo que se va a generar.
      estilo: $('estilo').value.trim(),
    });
    // POR BLOB, NO POR data:. Safari de iPhone no reproduce medios servidos en un
    // `data:` URI —quiere poder pedir rangos de bytes—, así que el reproductor
    // aparecía y no sonaba nunca: «ni siquiera me deja escuchar las voces para
    // seleccionar una voz nueva». Con un blob del navegador sí, y además se libera
    // el anterior en vez de dejar una muestra colgada por cada prueba.
    const a = $('muestra-voz');
    if (a.dataset.url) URL.revokeObjectURL(a.dataset.url);
    const url = URL.createObjectURL(deBase64(r.datos, r.tipo || 'audio/wav'));
    a.dataset.url = url;
    a.src = url;
    a.style.display = 'block';
    // Y si el navegador se niega a sonar solo —tras un `await` ya no cuenta como
    // gesto del usuario—, ahí están los controles: se dice, en vez de callarlo.
    a.play().catch(() => avisar('proyecto', 'Muestra lista: dale al play del reproductor.', 'bueno'));
  },
  'proyecto',
);

/** §7.10: el catálogo de voces llega filtrado y con la región en la etiqueta. */
async function cargarVoces() {
  try {
    const r = await llamar('voz.catalogo', {
      idioma: 'es',
      expresivas: !!P.config.narracion.vocesExpresivas,
    });
    const sel = $('voz');
    sel.innerHTML = '';
    for (const v of r.voces) {
      const o = document.createElement('option');
      o.value = v.nombre;
      o.textContent = v.etiqueta;
      if (v.nombre === P.config.narracion.nombreVoz) o.selected = true;
      sel.appendChild(o);
    }
    pintarLimitesDeVoz();
  } catch {
    // Sin catálogo se sigue con la voz por defecto: no es motivo para no trabajar.
  }
}

/**
 * Qué mandos ignora la voz elegida, dicho antes de tocarlos.
 *
 * «Las de Chirp no se escuchan.» No era el reproductor: Chirp y Journey NO
 * admiten velocidad, ni tono, ni SSML, y mandárselos hace que el servicio
 * rechace la petición entera. Ahora se omiten —así la voz suena—, pero callarlo
 * dejaría dos deslizadores que no hacen nada sin decir por qué.
 */
function pintarLimitesDeVoz() {
  const caja = $('limites-voz');
  if (!caja) return;
  const v = $('voz')?.value || P.config.narracion.nombreVoz || '';
  const sin = [
    SIN_VELOCIDAD_NI_TONO.test(v) && 'la velocidad',
    SIN_TONO.test(v) && 'el tono',
    SIN_SSML.test(v) && 'el corte exacto por marcas (se reparte por silencios)',
  ].filter(Boolean);
  caja.textContent = sin.length
    ? `Esta voz no admite ${sin.join(', ni ')}. Se le pide sin eso —si no, el servicio rechaza la ` +
      `petición y no hay audio—.`
    : '';
}

/**
 * LA CONTRASEÑA SE QUEDA EN ESTE NAVEGADOR, no solo en esta pestaña.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Se reinicia la página y me saca de la sesión y tengo que estar cada dos
 *  minutos metiendo la contraseña. No tiene que guardarse local, pero por lo
 *  menos en el navegador debería guardarse, porque la tengo abierta en mi
 *  celular. Yo soy el único que utiliza mi celular.»
 *
 * Estaba en `sessionStorage`, que muere cuando el navegador descarga la pestaña —y
 * Safari en un iPhone la descarga cuando le hace falta memoria, que es justo lo
 * que pasaba al aprobar fotos—. Así que los dos síntomas eran uno: la pestaña se
 * moría y volvía sin contraseña.
 *
 * Ahora va en `localStorage`, que sobrevive a la recarga y al cierre. Es SU
 * teléfono y es su decisión, y hay que decir el precio con claridad: quien tenga
 * el teléfono desbloqueado entra sin escribir nada. La credencial de Google NO
 * está aquí —esa vive en Vercel y el navegador no la ve nunca—: lo que se guarda
 * es la contraseña de la puerta.
 *
 * Y se puede deshacer: «Salir» en Ajustes la borra.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const CAJON_CLAVE = 'prisma-negro:clave';

function recordarClave(c) {
  try {
    localStorage.setItem(CAJON_CLAVE, c);
  } catch {
    // Safari en privado no deja escribir. No es motivo para no entrar: se
    // trabaja igual, solo que habrá que escribirla otra vez.
  }
}

function olvidarClave() {
  try {
    localStorage.removeItem(CAJON_CLAVE);
    sessionStorage.removeItem('clave');
  } catch {
    /* nada que hacer */
  }
}

function claveRecordada() {
  try {
    // `sessionStorage` sigue mirándose para no echar fuera a quien ya estaba
    // dentro con la versión anterior.
    return localStorage.getItem(CAJON_CLAVE) || sessionStorage.getItem('clave') || '';
  } catch {
    return '';
  }
}

// Reentrada rápida: la contraseña vive en este navegador.
// El modo cine: el visor fijo a toda pantalla, sin salir de la página — en el
// teléfono el pantalla-completa nativo solo existe para <video>, y esto es un
// lienzo con WebAudio. De paso, con el visor fijo la página no tiene ya nada
// que saltar.
$('b-cine')?.addEventListener('click', () => {
  const v = $('visor-montado');
  const dentro = v.classList.toggle('cine');
  $('b-cine').textContent = dentro ? '✕' : '⛶';
});

const guardada = claveRecordada();
if (guardada) {
  $('clave').value = guardada;
  $('b-entrar').click();
}
