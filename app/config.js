// La configuración y su normalizador (§7.2 y §7.3 del plano).
//
// §7.2 — El error: se arreglaba un valor por defecto, pero al recuperar el proyecto
// de la nube se cargaba el guardado sin pasar por la reparación. El arreglo nunca
// llegaba al usuario.
//
// La lección, y aquí está aplicada: UNA SOLA función normaliza la configuración, y
// TODOS los caminos de carga pasan por ella. Incluida la recuperación remota.
//
// Los caminos de carga son exactamente tres, y los tres llaman a `normalizar`:
//   1. proyecto nuevo            → app/estado.js  (nuevoProyecto)
//   2. recuperado de IndexedDB   → app/estado.js  (cargarLocal)
//   3. recuperado de la nube     → app/estado.js  (cargarRemoto)   ← el que se olvidó
//
// La auditoría comprueba que no hay un cuarto camino que se la salte.

import { PREDETERMINADO as SEGMENTACION } from '../comun/segmentar.mjs';
import { GENEROS, GENERO_POR_DEFECTO } from '../comun/generos.mjs';
import { PREDETERMINADO as MODELO, claveDe, grafiasDe } from '../comun/modelos.mjs';

// Los generadores viven en `comun/modelos.mjs`, en una tabla fija.
//
// Aquí solo se guarda CUÁL eligió el usuario, con la clave del catálogo —
// `nano-banana-2`, `veo-3.1-fast`— y no con el identificador técnico de Vertex.
// Esa diferencia importa: los identificadores cambian de grafía cuando un modelo
// sale de preview, y guardar la grafía dejaría la elección apuntando a un nombre
// muerto. La clave no cambia nunca.

export const PREDETERMINADA = {
  version: 4,

  // EL GÉNERO, del catálogo de `comun/generos.mjs`.
  //
  // Se guarda solo la clave, igual que el generador: la tabla se puede reescribir
  // entera sin tocar un proyecto guardado. De él salen la estructura de bloques
  // del episodio, los motivos que vuelven y los papeles del elenco que declaran.
  genero: GENERO_POR_DEFECTO,

  formato: {
    ancho: 1920,
    alto: 1080,
    fps: 30,
    // El PRD pide 16:9 y 9:16. El vertical se monta desde la misma hoja.
    vertical: false,
  },

  // El generador elegido en cada familia, por su clave del catálogo. Vacío = la
  // primera carga pone el predeterminado. A partir de ahí manda lo que se eligió:
  // la aplicación no lo cambia sola nunca.
  imagenModelo: { modelo: MODELO.imagen },
  videoModelo: { modelo: MODELO.video },
  vozModelo: { modelo: MODELO.voz },

  texto: { modelo: MODELO.texto },

  segmentacion: { ...SEGMENTACION },

  guion: {
    // LA DURACIÓN OBJETIVO, y vive AQUÍ y no en el campo de la pantalla.
    //
    // Estaba escrita en el `value="10"` del `<input>`, así que no se guardaba con
    // el proyecto: cada recarga volvía a diez minutos y había que acordarse de
    // subirlo antes de escribir. Un ajuste que se olvida solo no es un ajuste.
    //
    // Treinta minutos es el formato del canal. Un episodio de treinta con la
    // estructura del género y la biblioteca puesta cuesta menos que dos de quince.
    minutos: 30,
  },

  narracion: {
    // §4.5: el episodio se reparte en bloques de unos 45 segundos.
    segundosPorBloque: 45,
    // §6: la voz limita el texto por llamada. Presupuesto en BYTES: una tilde son
    // dos, y en español eso no es un detalle.
    topeBytesPorLlamada: 4000,
    // §7.9: consistencia sobre expresividad. Los modelos expresivos interpretan
    // cada llamada como una actuación nueva y la voz cambia cada cuarenta y cinco
    // segundos. En quince minutos de narración eso es inaceptable.
    nombreVoz: 'es-US-Neural2-B',
    // §7.9: apagado por defecto. Encenderlo trae las Chirp y compañía, que suenan
    // mejor en una frase y peor en quince minutos.
    vocesExpresivas: false,
    // Solo lo usan las voces de Gemini, que aceptan una indicación de entrega.
    // Mandar SIEMPRE la misma es lo que más acerca la llamada 23 a la llamada 1.
    estilo: 'Narra en tono documental, sobrio y parejo, ritmo constante, sin dramatizar.',
    velocidad: 0.96,
    tono: -1,
    // §7.8: un dedal de silencio delante de la primera toma de cada llamada. Sin
    // esto el reproductor se come el ataque del primer fonema al cambiar de trozo.
    silencioInicialMs: 120,
  },

  imagen: {
    // Vacío: lo pone el sondeo al proyecto. Escrito a mano envejece solo.
    modelo: '',
    // §6: toda imagen que se envía se reduce antes. Las referencias, a ~1024 px de
    // lado: el codificador visual de los modelos trabaja por ahí y lo que sobra lo
    // tira él. Nunca hagas una excepción «porque este caso es especial»: esa
    // excepción es el bug.
    ladoReferencia: 1024,
    maxReferencias: 3,
    // §8.2: la decisión de diseño más importante de un proyecto documental.
    // El valor por defecto es el seguro.
    tipoPorDefecto: 'reconstruccion',
    // EL ESTILO YA NO SE ELIGE POR PROYECTO. Es del canal, y vive en
    // `comun/estilos.mjs` como `ESTILO_DEL_CANAL`. La razón está escrita allí y es
    // económica: con biblioteca permanente, dos estilos son dos bibliotecas.
    //
    // LA BARRERA DE §8.2, APAGADA — y esto es una decisión, no un descuido.
    //
    // Existía para no generar fotorrealismo de personas REALES identificables, que
    // es el fallo que hunde un canal documental. Con casos construidos no hay
    // ninguna persona real que proteger: la víctima, el sospechoso y el perito no
    // existen. Encenderla aquí solo conseguiría que todo se resolviera de espaldas
    // y en penumbra, que es exactamente el salvapantallas con voz en off.
    //
    // Lo que NO se apaga y sigue en todas las imágenes: que las personas son
    // intérpretes anónimos y que nada imita material de archivo auténtico
    // (`BARRERA_DOCUMENTAL`, en `comun/estilos.mjs`). Un proyecto que siga en modo
    // documentar puede volver a encender esto a mano.
    prohibirFotorrealismoDePersonasReales: false,
  },

  movimiento: {
    // Vacío: lo pone el sondeo al proyecto.
    modelo: '',
    // §4.7: sigue siendo la fase MÁS CARA CON DIFERENCIA. Lo que cambia es el
    // MODELO DE GASTO.
    //
    // ─────────────────────────────────────────────────────────────────────────
    // Una proporción global —«el 15 % de las tomas lleva movimiento»— es
    // minimizar el coste de CADA episodio: con 165 tomas salen 25 clips, y
    // veinticinco clips por episodio, episodio tras episodio, no se amortizan
    // nunca porque no vuelven.
    //
    // El modelo correcto para un canal es invertir una vez y amortizar, y para
    // eso el movimiento se decide POR CATEGORÍA:
    //
    //   biblioteca  — los arquetipos permanentes. Video SIEMPRE, y se paga una
    //                 sola vez para todos los episodios que vengan.
    //   episodio    — las escenas fuertes de ESTE episodio. Una cuenta, no un
    //                 porcentaje: un episodio no necesita 25 clips, necesita los
    //                 doce que importan.
    //   motivos     — los planos que vuelven, y el relleno. Imagen fija con
    //                 recorrido de cámara. Cuesta cero.
    //
    // Y lo que lo hace viable ya está resuelto en el montaje: la entrada va con
    // `-stream_loop -1`, así que un clip de seis segundos cubre una toma de
    // veinticinco repitiéndose. Un plano del perito declarando sirve para todos
    // sus testimonios sin generar nada más.
    // ─────────────────────────────────────────────────────────────────────────
    politica: {
      // Las escenas fuertes del episodio. Diez a quince es el rango del canal.
      clipsPorEpisodio: 12,
      // Los arquetipos de la biblioteca: video siempre.
      bibliotecaConVideo: true,
      // Los motivos que vuelven: nunca. Son la imagen fija que se amortiza.
      motivosConVideo: false,
    },
    segundosPorClip: 6,
  },

  musica: {
    activa: true,
    // §5.4: fundidos largos. Con fundidos cortos el relevo se oye como un tajo.
    fundido: 2.5,
    volumen: 0.55,
  },

  montaje: {
    // EL SILENCIO, en dos cifras.
    //
    // `respiroMaximo` es cuánto puede alargarse la pieza en segundos de imagen sin
    // voz, en proporción a lo hablado. Un décimo es un documental que respira; a
    // partir de un quinto empieza a arrastrarse. El director reparte dentro de ese
    // tope y lo que no cabe se cae, empezando por los respiros más cortos.
    respiroMaximo: 0.1,
    // La apertura en frío: los segundos de imagen antes de la primera palabra de
    // toda la pieza. Es lo que hace que un documental empiece y no que arranque.
    entradaEnFrio: 2,
  },

  marca: {
    activa: true,
    texto: '',
    // §4.9: la marca del canal NO la dibuja el modelo: la dibuja el navegador sobre
    // un lienzo, y así sale nítida y siempre igual.
    color: '#ffffff',
    opacidad: 0.85,
  },

  investigacion: {
    // DOS MODOS, y la fase tiene la misma forma en los dos: devuelve fichas.
    //
    //   documentar — sale a internet y trae hechos comprobables con su fuente.
    //                Es lo que había, y sigue entero.
    //   construir  — no busca nada: fabrica el expediente de un caso que no
    //                ocurrió, ficha a ficha, ANTES de escribir. Es lo que evita
    //                que el detective se llame Roger en el minuto 12 y Robert en
    //                el 32: si el caso se construye entero primero, el guion no
    //                puede contradecirse.
    modo: 'construir',
    // §8.1: sin fichas no hay episodio. Sigue en pie con las construidas — de
    // hecho con más motivo, porque son lo ÚNICO que garantiza la coherencia.
    exigirFichas: true,
    minimoFichasPorEscena: 1,
  },
};

/** Los dos modos de la fase de investigación. */
export const MODOS_INVESTIGACION = ['documentar', 'construir'];

function esObjeto(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Mezcla lo guardado encima de los valores por defecto.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA COPIA ES PROFUNDA, Y NO ES UN LUJO.
 *
 * Esto hacía `{ ...base }` —una copia SUPERFICIAL— y solo clonaba de verdad las
 * ramas que venían en `encima`. Una rama que el proyecto guardado no mencionaba
 * —`investigacion`, pongamos— salía siendo EL MISMO OBJETO que el de
 * `PREDETERMINADA`. Así que en cuanto `normalizar` escribía ahí dentro un valor
 * distinto del de fábrica, se lo escribía A LOS VALORES DE FÁBRICA: a partir de
 * ese momento, en esa misma sesión, TODOS los proyectos que se cargaran nacían
 * con el valor mudado.
 *
 * Llevaba tiempo así y no se veía porque todas las líneas de `normalizar`
 * asignaban el mismo valor que ya tenía el predeterminado —acotar 0.96 entre 0.5
 * y 1.5 devuelve 0.96—, así que la escritura era invisible. La mudanza de modo de
 * investigación fue la primera que escribió algo DISTINTO, y se cazó al instante:
 * un proyecto nuevo salía en «documentar» porque un proyecto viejo cargado antes
 * había dejado ese valor clavado en la tabla de fábrica.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function mezclar(base, encima) {
  if (Array.isArray(base)) {
    const salida = [...base];
    for (const [k, v] of Object.entries(encima || {})) if (v !== undefined) salida[k] = v;
    return salida;
  }
  const salida = {};
  for (const [k, v] of Object.entries(base || {})) {
    salida[k] = esObjeto(v) ? mezclar(v, {}) : Array.isArray(v) ? [...v] : v;
  }
  for (const [k, v] of Object.entries(encima || {})) {
    if (esObjeto(v) && esObjeto(base?.[k])) salida[k] = mezclar(base[k], v);
    else if (v !== undefined) salida[k] = v;
  }
  return salida;
}

/**
 * EL normalizador. El único.
 *
 * Rellena lo que falte, sustituye los modelos retirados por su relevo y sanea los
 * valores que estén fuera de rango. Es idempotente: normalizar dos veces da lo
 * mismo que normalizar una.
 */
/**
 * Qué generador queda elegido tras actualizar.
 *
 * Aquí vive un §7.2 de manual y por eso está explicado entero.
 *
 * Antes la herramienta elegía el modelo sola y anotaba `aMano: false` para decir
 * «esto lo puse yo, no la persona». Al llegar el catálogo nuevo, esa elección
 * automática —hecha con la información de entonces— seguía guardada y el
 * desplegable la respetaba: el director se quedaba clavado en Gemini 2.5 Pro
 * aunque el catálogo ya ofreciera el 3.1 Pro. El arreglo estaba puesto y no
 * llegaba, tapado por un valor guardado. Exactamente el error del plano.
 *
 * La regla que lo resuelve: `aMano: false` significa que la persona nunca eligió
 * eso, así que no hay nada que conservar y manda el predeterminado de hoy. Una
 * elección de verdad se conserva siempre, y si estaba guardada como identificador
 * de Vertex se traduce a su clave en vez de perderse.
 */
function eleccionDeGenerador(familia, guardado) {
  if (guardado && guardado.aMano === false) return MODELO[familia];
  return claveDe(familia, guardado?.modelo) || MODELO[familia];
}

export function normalizar(cruda) {
  const c = mezclar(PREDETERMINADA, cruda || {});

  // LA VERSIÓN GUARDADA, ANTES DE PISARLA. Es lo único que distingue un proyecto
  // viejo de uno nuevo, y de eso depende que un documental de antes no se
  // convierta solo en ficción.
  const versionGuardada = Number(cruda?.version) || 0;

  // Las elecciones de generador, traducidas al catálogo actual.
  for (const [familia, campo] of [
    ['texto', 'texto'],
    ['imagen', 'imagenModelo'],
    ['video', 'videoModelo'],
    ['voz', 'vozModelo'],
  ]) {
    c[campo] = { modelo: eleccionDeGenerador(familia, cruda?.[campo]) };
  }

  c.imagen.modelo = c.imagenModelo.modelo;
  c.movimiento.modelo = c.videoModelo.modelo;

  // Un modelo de imagen que no acepta referencias no puede sostener la coherencia
  // entre tomas (§4.6). Se mira contra las GRAFÍAS de la fila, no contra la clave:
  // desde que se guarda «nano-banana-2» en vez de «gemini-3.1-flash-image», una
  // comprobación sobre el texto de la clave decía que no acepta referencias y
  // apagaba en silencio lo que mantiene iguales a las personas entre tomas.
  c.imagen.aceptaReferencias = grafiasDe('imagen', c.imagen.modelo).some((id) =>
    /gemini.*image/i.test(id),
  );

  c.formato.ancho = entero(c.formato.ancho, 640, 3840, 1920);
  c.formato.alto = entero(c.formato.alto, 360, 2160, 1080);
  c.formato.fps = [24, 25, 30, 60].includes(c.formato.fps) ? c.formato.fps : 30;
  if (c.formato.vertical && c.formato.ancho > c.formato.alto) {
    [c.formato.ancho, c.formato.alto] = [c.formato.alto, c.formato.ancho];
  }

  c.segmentacion.segundosObjetivo = numero(c.segmentacion.segundosObjetivo, 3, 30, 11);
  c.segmentacion.segundosMaximo = Math.max(
    c.segmentacion.segundosObjetivo,
    numero(c.segmentacion.segundosMaximo, 4, 40, 16),
  );
  c.segmentacion.caracteresPorSegundo = numero(c.segmentacion.caracteresPorSegundo, 8, 25, 14.5);

  c.narracion.segundosPorBloque = numero(c.narracion.segundosPorBloque, 15, 90, 45);
  // El tope no se sube nunca por encima de lo que aguanta el servicio, aunque un
  // proyecto viejo lo traiga más alto.
  c.narracion.topeBytesPorLlamada = entero(c.narracion.topeBytesPorLlamada, 500, 4000, 4000);
  c.narracion.velocidad = numero(c.narracion.velocidad, 0.5, 1.5, 0.96);
  c.narracion.tono = numero(c.narracion.tono, -10, 10, -1);
  c.narracion.silencioInicialMs = entero(c.narracion.silencioInicialMs, 0, 500, 120);

  c.imagen.ladoReferencia = entero(c.imagen.ladoReferencia, 256, 1536, 1024);
  c.imagen.maxReferencias = entero(c.imagen.maxReferencias, 0, 6, 3);
  if (!['generada', 'archivo', 'reconstruccion'].includes(c.imagen.tipoPorDefecto)) {
    c.imagen.tipoPorDefecto = 'reconstruccion';
  }
  // El estilo guardado de los proyectos viejos se borra: ya no lo lee nadie, y un
  // ajuste que sigue ahí sin efecto es la peor clase de configuración.
  delete c.imagen.estilo;

  // EL GÉNERO, contra el catálogo. Igual que el estilo: una clave que ya no está
  // en la tabla cae al predeterminado en vez de arrastrar un `undefined` hasta la
  // fase de guion, tres pantallas más allá.
  if (!GENEROS.some((g) => g.id === c.genero)) c.genero = GENERO_POR_DEFECTO;

  c.guion.minutos = entero(c.guion.minutos, 3, 40, 30);

  // EL MODO DE INVESTIGACIÓN, Y LA MUDANZA QUE IMPORTA.
  //
  // Un proyecto guardado con la versión 3 se investigó documentando: sus fichas
  // llevan fuente, fecha y cita, y su guion se escribió con la prohibición de
  // inventar. Dejar que herede el nuevo predeterminado —`construir`— lo
  // convertiría solo en ficción: la siguiente tanda de fichas se inventaría el
  // caso y se mezclaría con las reales. Eso no es un cambio de ajuste, es
  // estropear un documental terminado.
  //
  // Así que un proyecto anterior a la versión 4 que no eligió modo se queda en
  // `documentar`. Uno nuevo, o uno que eligió, manda él.
  if (!MODOS_INVESTIGACION.includes(c.investigacion.modo)) {
    c.investigacion.modo = PREDETERMINADA.investigacion.modo;
  }
  if (versionGuardada > 0 && versionGuardada < 4 && !cruda?.investigacion?.modo) {
    c.investigacion.modo = 'documentar';
  }
  // Y la barrera de §8.2 iba encendida en aquellos proyectos: se respeta lo que
  // tuvieran guardado, y si no guardaron nada, lo de entonces.
  if (versionGuardada > 0 && versionGuardada < 4 && cruda?.imagen?.prohibirFotorrealismoDePersonasReales === undefined) {
    c.imagen.prohibirFotorrealismoDePersonasReales = true;
  }

  // La política de movimiento. `clipsPorEpisodio` es una CUENTA, no una
  // proporción: ver la cabecera de arriba.
  // La proporción vieja se BORRA, no se conserva. Un proyecto de la versión 3 la
  // trae guardada y ya no la lee nadie: dejarla ahí sería un ajuste que dice una
  // cosa mientras el sistema hace otra, que es la peor clase de configuración.
  delete c.movimiento.proporcion;
  c.movimiento.politica.clipsPorEpisodio = entero(c.movimiento.politica.clipsPorEpisodio, 0, 60, 12);
  c.movimiento.politica.bibliotecaConVideo = c.movimiento.politica.bibliotecaConVideo !== false;
  c.movimiento.politica.motivosConVideo = c.movimiento.politica.motivosConVideo === true;
  c.movimiento.segundosPorClip = [4, 6, 8].includes(c.movimiento.segundosPorClip)
    ? c.movimiento.segundosPorClip
    : 6;

  c.musica.fundido = numero(c.musica.fundido, 1.5, 3.5, 2.5);
  c.musica.volumen = numero(c.musica.volumen, 0, 1, 0.55);
  c.marca.opacidad = numero(c.marca.opacidad, 0, 1, 0.85);

  c.version = PREDETERMINADA.version;
  return c;
}

function numero(v, min, max, porDefecto) {
  const n = Number(v);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, n));
}

function entero(v, min, max, porDefecto) {
  return Math.round(numero(v, min, max, porDefecto));
}

/**
 * §7.3 sigue vivo aunque el selector de modelos ya no lo use: la función que repinta
 * un control DEVUELVE el valor con el que se quedó, y quien la llama lo ESCRIBE.
 * Un modelo retirado se corregía en el selector y el objeto de configuración
 * conservaba el valor viejo — la pantalla decía una cosa y el estado otra.
 *
 * Quien pinte un desplegable de estos tiene que seguir haciéndolo así.
 */
export function pintarSelector(select, opciones, idActual) {
  const elegido = opciones.some((o) => o.id === idActual) ? idActual : opciones[0]?.id || '';
  select.innerHTML = '';
  for (const o of opciones) {
    const el = document.createElement('option');
    el.value = o.id;
    el.textContent = o.etiqueta;
    if (o.id === elegido) el.selected = true;
    select.appendChild(el);
  }
  // Quien llama DEBE escribir esto en la configuración.
  return elegido;
}
