// Segmentación del guion en tomas (§4.3 del plano).
//
// Reglas duras, aprendidas:
//
//   - DETERMINISTA. Mismo texto → mismas tomas, siempre. Nada de que el modelo
//     decida los cortes. Aquí no hay ni una llamada a un modelo, y no la va a
//     haber.
//   - COBERTURA EXACTA. La concatenación de las tomas reproduce el guion carácter
//     por carácter. Ni una frase perdida, ni una duplicada. Se comprueba
//     automáticamente, no a ojo.
//
// La cobertura no se consigue comparando al final: se consigue por construcción.
// Cada carácter del guion pertenece a exactamente UN tramo, y cada tramo es de una
// de tres clases —narración, encabezado de escena, o hueco—. Reconstruir el guion
// es concatenar los tramos en orden. Que salga idéntico no es una casualidad
// afortunada: es que no hay otra cosa que pueda salir. La comprobación de después
// está para cazar el día que alguien rompa esa propiedad.

// LA REGLA DE LOS OCHO A DIECIOCHO SEGUNDOS (§4.3).
//
// Una toma es una imagen, y casi siempre también un clip de vídeo. Las dos se
// pagan POR UNIDAD, no por segundo: una toma de dos segundos cuesta exactamente
// lo mismo que una de dieciocho y aprovecha nueve veces menos. Un episodio
// partido en tomas de dos y tres segundos gasta el triple, y encima parpadea.
//
// Por eso hay un SUELO, no solo un techo. Y por eso, cuando los dos no caben —una
// frase sola que dura veinte segundos no se puede partir sin partir la frase—,
// MANDA EL SUELO: una toma larga de más cuesta lo mismo que una de dieciocho; una
// toma corta es una imagen pagada entera para verla dos segundos.
export const PREDETERMINADO = {
  segundosMinimo: 8,
  segundosObjetivo: 13,
  segundosMaximo: 18,
  // Velocidad de locución en caracteres por segundo. Es una ESTIMACIÓN, solo para
  // agrupar. La duración que manda en el montaje es la real, medida sobre el audio
  // generado (§4.5).
  caracteresPorSegundo: 14.5,
};

// Abreviaturas tras las que un punto NO cierra frase. Lista corta y explícita:
// una heurística lista pero impredecible rompería el determinismo.
const ABREVIATURAS = [
  'sr', 'sra', 'srta', 'dr', 'dra', 'lic', 'ing', 'prof', 'gral', 'cap',
  'av', 'ave', 'núm', 'num', 'pág', 'pag', 'ss', 'etc', 'ej', 'aprox',
  'ee', 'uu', 'aa', 'vv', 'a.c', 'd.c', 'ca',
];

/**
 * Parte el guion en tramos con sus posiciones dentro del texto original.
 * Todo carácter cae en un tramo. Los tramos van en orden y no se solapan.
 */
function tramos(guion) {
  const salida = [];
  const lineas = [];
  let pos = 0;

  // Partir en líneas conservando el salto: así los offsets siguen siendo del
  // original y no hay que reconstruir separadores.
  const re = /[^\n]*\n|[^\n]+$/g;
  let m;
  while ((m = re.exec(guion)) !== null) {
    lineas.push({ texto: m[0], inicio: m.index, fin: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }

  for (const linea of lineas) {
    const contenido = linea.texto;
    const encabezado = /^\s*##\s+\S/.test(contenido);

    if (encabezado) {
      salida.push({ clase: 'encabezado', inicio: linea.inicio, fin: linea.fin });
      continue;
    }

    // LA TERCERA CONVENCIÓN DEL TEXTO PLANO: el hablante de un testimonio.
    //
    // Una línea que empieza por «> » declara QUIÉN habla en el párrafo que viene
    // debajo, y no se narra — igual que el encabezado de escena. Si se narrara, el
    // documental diría en voz alta «Marcos Elizalde, capataz de la cuadrilla» como
    // si fuera una frase del guion, y encima consumiría una toma.
    //
    // La voz NO cambia: sigue siendo la del narrador en todo el episodio, con las
    // voces expresivas apagadas y el razonamiento original intacto —los modelos
    // expresivos derivan y en quince minutos se nota—. Esta marca existe SOLO para
    // dirección: es lo que le dice al director que ahí va el plano del perito
    // declarando. En pantalla se ve a alguien hablando y se oye al narrador, que
    // es como funcionan los documentales de plataforma.
    // ─────────────────────────────────────────────────────────────────────────
    // SOLO LA PRIMERA LÍNEA «> » ES LA FICHA DEL QUE HABLA. LAS DEMÁS SE NARRAN.
    //
    // El encargo pone la marca en una línea y la declaración debajo, en texto
    // llano. El modelo escribe markdown, y en markdown una cita lleva «> » en
    // TODAS sus líneas — que es lo que hizo, episodio entero:
    //
    //     > El Equipo de Identificación Forense de la RCMP
    //     > La humedad del bloque preservó los huesos, pero el tejido era papilla
    //
    // Con «toda línea que empieza por > es la ficha del hablante», la declaración
    // ENTERA dejaba de narrarse. Quince testimonios perdidos en un episodio, sin
    // un solo aviso: la cobertura seguía cuadrando —el texto estaba en un tramo,
    // solo que en uno que no se lee— y encima la marca del hablante se corría al
    // párrafo del narrador que venía detrás, así que el director ponía el plano
    // del perito declarando sobre la voz del narrador.
    //
    // La regla nueva no elige entre los dos formatos: los acepta los dos. De una
    // tanda de líneas «> » seguidas, la primera es la ficha y el resto es la
    // declaración. El «> » de esas líneas es hueco, como la sangría.
    // ─────────────────────────────────────────────────────────────────────────
    if (/^\s*>\s+\S/.test(contenido)) {
      const anterior = salida[salida.length - 1];
      const siguen = anterior && (anterior.clase === 'testimonio' || anterior.clase === 'citado');
      if (!siguen) {
        salida.push({ clase: 'testimonio', inicio: linea.inicio, fin: linea.fin });
        continue;
      }
      // Es la declaración: la marca «> » no se narra, lo de detrás sí.
      const marca = contenido.match(/^\s*>\s*/)[0].length;
      salida.push({ clase: 'citado', inicio: linea.inicio, fin: linea.inicio + marca });
      const cola = contenido.match(/\s*$/)[0].length;
      const ini = linea.inicio + marca;
      const fin = linea.fin - cola;
      for (const f of frases(guion, ini, fin)) salida.push(f);
      if (cola) salida.push({ clase: 'hueco', inicio: fin, fin: linea.fin });
      continue;
    }
    if (!contenido.trim()) {
      salida.push({ clase: 'hueco', inicio: linea.inicio, fin: linea.fin });
      continue;
    }

    // Dentro de una línea con texto: sangría inicial y salto final son huecos; lo
    // de en medio se parte en frases.
    const sangria = contenido.match(/^\s*/)[0].length;
    const cola = contenido.match(/\s*$/)[0].length;
    if (sangria) {
      salida.push({ clase: 'hueco', inicio: linea.inicio, fin: linea.inicio + sangria });
    }

    const cuerpoIni = linea.inicio + sangria;
    const cuerpoFin = linea.fin - cola;
    for (const f of frases(guion, cuerpoIni, cuerpoFin)) salida.push(f);

    if (cola) {
      salida.push({ clase: 'hueco', inicio: cuerpoFin, fin: linea.fin });
    }
  }

  pos = 0;
  for (const t of salida) {
    if (t.inicio !== pos) {
      throw new Error(
        `La segmentación dejó un agujero entre ${pos} y ${t.inicio}. ` +
          'Esto es un fallo del segmentador, no del guion.',
      );
    }
    pos = t.fin;
  }
  if (pos !== guion.length) {
    throw new Error(`La segmentación no llegó al final del guion (${pos} de ${guion.length}).`);
  }

  return salida;
}

/** Parte [ini, fin) en frases. Devuelve tramos de clase «narracion» y «hueco». */
function frases(guion, ini, fin) {
  const salida = [];
  let inicioFrase = ini;
  let i = ini;

  while (i < fin) {
    const c = guion[i];
    if (c === '.' || c === '?' || c === '!' || c === '…') {
      // Comerse los cierres que van pegados detrás del punto.
      let j = i + 1;
      while (j < fin && /["»”')\]]/.test(guion[j])) j++;
      // Puntos suspensivos y signos repetidos cuentan como uno.
      while (j < fin && /[.?!…]/.test(guion[j])) j++;

      const esFin = j >= fin || /\s/.test(guion[j]);
      if (esFin && !enAbreviatura(guion, i, ini)) {
        salida.push({ clase: 'narracion', inicio: inicioFrase, fin: j });
        // El espacio que sigue a la frase es hueco: no pertenece a ninguna toma.
        let k = j;
        while (k < fin && /\s/.test(guion[k])) k++;
        if (k > j) salida.push({ clase: 'hueco', inicio: j, fin: k });
        inicioFrase = k;
        i = k;
        continue;
      }
      i = j;
      continue;
    }
    i++;
  }

  if (inicioFrase < fin) {
    salida.push({ clase: 'narracion', inicio: inicioFrase, fin });
  }
  return salida;
}

function enAbreviatura(guion, posPunto, limite) {
  let k = posPunto - 1;
  while (k >= limite && /[\p{L}.]/u.test(guion[k])) k--;
  const palabra = guion.slice(k + 1, posPunto).toLowerCase();
  return ABREVIATURAS.includes(palabra);
}

/**
 * Segundos estimados de la toma que va desde la frase `a` hasta la frase `b`.
 *
 * Se mide el TRAMO ENTERO, de principio a fin, no la suma de las frases: entre una
 * frase y la siguiente hay espacios y saltos de línea que acaban dentro del texto
 * de la toma, y por tanto dentro de lo que se narra. Sumar frases da un número
 * ligeramente menor, y ese medio segundo de diferencia era suficiente para que el
 * reparto creyera que una toma cabía en el techo y saliera pasada.
 */
const segundosEntre = (a, b, c) => (b.fin - a.inicio) / c.caracteresPorSegundo;

/** Segundos estimados de un tramo suelto. */
const segundosDe = (tr, c) => segundosEntre(tr, tr, c);

/**
 * Lo que cuesta que una toma dure `d` segundos.
 *
 * Aquí está escrita la regla entera, y por eso está en UN solo sitio:
 *   - Bajar del suelo es lo más caro que puede pasar. Una toma es una imagen —y casi
 *     siempre un clip— que se paga POR UNIDAD: una toma de dos segundos cuesta lo
 *     mismo que una de dieciocho y aprovecha nueve veces menos.
 *   - Pasarse del techo es mucho menos grave. Una toma larga de más es una imagen
 *     que se ve un rato largo; sigue costando una.
 *   - Y dentro de la regla, lo mejor es acercarse al objetivo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL CASTIGO DEL TECHO NO PUEDE TENER PARTE FIJA, y esto salió caro.
 *
 * Era `1e4 + (d - techo)²`: una cantidad fija por CADA toma pasada, más el
 * exceso. Con eso, cuando ningún reparto conseguía respetar el techo —un bloque
 * cuya primera frase no llega al suelo sin pasarse del techo—, DOS tomas pasadas
 * costaban dos veces la parte fija y UNA SOLA costaba una. Al segmentador le
 * salía más barato meterlo todo en una toma.
 *
 * Y eso es exactamente lo que se vio en pantalla: una toma de CUARENTA Y NUEVE
 * SEGUNDOS con dos párrafos enteros dentro. Una imagen fija durante casi un
 * minuto, que es justo lo contrario de lo que la regla existe para conseguir.
 *
 * Ahora el exceso se paga al cuadrado y sin parte fija, así que partir siempre
 * sale más barato que acumular: repartir 34 segundos de exceso entre tres tomas
 * cuesta la novena parte que llevarlos en una sola.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const PESO_DEL_TECHO = 100;
const PESO_DEL_SUELO = 1e6;

function castigoDeDuracion(d, c) {
  if (d < c.segundosMinimo) return PESO_DEL_SUELO + (c.segundosMinimo - d) ** 2;
  if (d > c.segundosMaximo) return PESO_DEL_TECHO * (d - c.segundosMaximo) ** 2;
  return (d - c.segundosObjetivo) ** 2;
}

/**
 * Reparte las frases de un bloque en tomas.
 *
 * NO SE VA LLENANDO Y CERRANDO. Eso —el método de toda la vida— deja siempre una
 * cola: el último trozo del bloque es lo que sobró, y lo que sobra son dos
 * segundos. De ahí salían las tomas de uno y dos segundos.
 *
 * Aquí se prueban TODOS los repartos posibles y gana el que menos castigo saca.
 * Es programación dinámica sobre las frases del bloque —`mejor[j]` es el mejor
 * reparto de las primeras `j` frases—, así que el resultado es el óptimo de verdad
 * y no una aproximación que luego hay que remendar. Un bloque tiene decenas de
 * frases, no miles: cuesta nada.
 */
function repartirEnTomas(frases, c) {
  // La duración de las frases [i, j) es la de la toma que saldría de ellas.
  const dura = (i, j) => segundosEntre(frases[i], frases[j - 1], c);
  if (frases.length < 2 || dura(0, frases.length) <= c.segundosMaximo) return [frases];

  const mejor = [0];
  const desde = [0];
  for (let j = 1; j <= frases.length; j++) {
    mejor[j] = Infinity;
    for (let i = 0; i < j; i++) {
      const coste = mejor[i] + castigoDeDuracion(dura(i, j), c);
      if (coste < mejor[j]) {
        mejor[j] = coste;
        desde[j] = i;
      }
    }
  }

  const partes = [];
  for (let j = frases.length; j > 0; j = desde[j]) partes.unshift(frases.slice(desde[j], j));
  return partes;
}

/**
 * Segmenta el guion en tomas.
 *
 * El guion se parte primero en BLOQUES —tramos de narración seguidos que comparten
 * escena y hablante— y cada bloque se reparte en tomas de entre ocho y dieciocho
 * segundos. Las fronteras duras son el encabezado de escena y la línea de
 * testimonio: cruzarlas metería texto que no se narra dentro de una toma.
 *
 * La línea en blanco NO es una frontera dura. Lo fue, y por eso salían tomas de dos
 * segundos: bastaba que el guion pusiera un párrafo de una frase corta para pagar
 * una imagen entera por dos segundos de pantalla. Sigue siendo una pausa —el texto
 * de la toma la conserva, y la locución la respeta— pero ya no obliga a cortar.
 */
export function segmentar(guion, config = {}) {
  const c = { ...PREDETERMINADO, ...config };
  const texto = String(guion ?? '');
  if (!texto.trim()) {
    // Un guion en blanco no da tomas, pero sus caracteres siguen siendo suyos: el
    // tramo de hueco tiene que estar o la cobertura falla. (Lo cazó la propia
    // comprobación de cobertura la primera vez que se ejecutó.)
    return {
      tomas: [],
      escenas: [],
      tramos: texto.length ? [{ clase: 'hueco', inicio: 0, fin: texto.length }] : [],
    };
  }

  const lista = tramos(texto);
  const escenas = [];
  // Bloques de narración seguida. Un bloque es lo que se reparte en tomas.
  const bloques = [];
  let escenaActual = 0;
  let bloque = null;

  // Quién está hablando ahora mismo. Vale hasta la siguiente frontera dura —una
  // línea en blanco o un cambio de escena—, no solo para la primera toma: un
  // testimonio de tres frases se parte en dos tomas y las dos son del mismo
  // testigo. Marcar solo la primera dejaría media declaración con el plano del
  // narrador.
  let hablando = '';

  // SALTOS DE LÍNEA SEGUIDOS DESDE EL ÚLTIMO TEXTO NARRADO.
  //
  // Dos saltos seguidos son una línea en blanco. Ya no cierra la toma —ver la
  // cabecera de `segmentar`— pero sí cierra el TESTIMONIO: lo que va después de la
  // línea en blanco lo dice otra vez el narrador, no el testigo. Y al cambiar el
  // hablante cambia el bloque, así que la frontera del testimonio sigue entera.
  //
  // Se cuentan los saltos de todos los huecos SEGUIDOS, no dentro de uno: el salto
  // que cierra el párrafo es la cola de la línea anterior y la línea en blanco es
  // otro tramo distinto, así que `\n\s*\n` no encaja nunca en un solo tramo.
  let saltos = 0;

  // Abre el bloque al que pertenece la frase que viene, o devuelve el de ahora si
  // sigue siendo el mismo. Escena y hablante forman su identidad.
  const enBloque = () => {
    if (!bloque || bloque.escena !== escenaActual || bloque.testimonio !== hablando) {
      bloque = { escena: escenaActual, testimonio: hablando, frases: [] };
      bloques.push(bloque);
    }
    return bloque;
  };

  for (const tr of lista) {
    if (tr.clase === 'encabezado') {
      // Frontera dura: el título de escena no se narra. Un bloque que la cruzara se
      // llevaría el «## El hallazgo» dentro del texto de la toma.
      bloque = null;
      hablando = '';
      saltos = 0;
      escenaActual = escenas.length;
      escenas.push({
        n: escenaActual,
        titulo: texto.slice(tr.inicio, tr.fin).replace(/^\s*##\s*/, '').trim(),
        inicioEnGuion: tr.inicio,
      });
      continue;
    }

    if (tr.clase === 'testimonio') {
      // Frontera dura: lo de antes era del narrador y lo de después es de quien
      // declara. Juntarlos en una toma pondría dos planos distintos en una, y la
      // línea «> Marcos Elizalde» acabaría narrada en voz alta.
      bloque = null;
      hablando = texto.slice(tr.inicio, tr.fin).replace(/^\s*>\s*/, '').trim();
      saltos = 0;
      continue;
    }

    // El «> » que abre cada línea de una cita no se narra, y tampoco cuenta como
    // pausa: la declaración sigue siendo del mismo testigo línea a línea.
    if (tr.clase === 'hueco' || tr.clase === 'citado') {
      saltos += (texto.slice(tr.inicio, tr.fin).match(/\n/g) || []).length;
      if (saltos >= 2) hablando = '';
      continue;
    }

    // Si no hubo ningún encabezado, hay una escena cero implícita.
    if (!escenas.length) {
      escenas.push({ n: 0, titulo: '', inicioEnGuion: 0 });
    }

    // Texto narrado: la cuenta de saltos vuelve a cero. Un salto solo —el que
    // parte una frase larga en dos líneas— no separa nada.
    saltos = 0;
    enBloque().frases.push(tr);
  }

  const tomas = [];
  for (const b of bloques) {
    if (!b.frases.length) continue;
    for (const parte of repartirEnTomas(b.frases, c)) {
      const inicio = parte[0].inicio;
      const fin = parte[parte.length - 1].fin;
      // Todo lo que hay entre la primera y la última frase —el espacio entre
      // frases, y ahora también la línea en blanco— queda dentro de la toma. Es lo
      // que hace que la concatenación reproduzca el guion, y de paso conserva la
      // pausa que el guion pidió.
      const t = texto.slice(inicio, fin);
      tomas.push({
        i: tomas.length,
        escena: b.escena,
        texto: t,
        // Quién habla, si esta toma es parte de un testimonio. Cadena vacía si no.
        // Lo lee el director para poner el plano de quien declara, y de ahí sale la
        // resolución contra la biblioteca por arquetipo.
        testimonio: b.testimonio || '',
        // Estimación, solo para dimensionar. La real la mide el audio (§4.5).
        segundos: Math.max(1.2, +(t.length / c.caracteresPorSegundo).toFixed(2)),
        inicioEnGuion: inicio,
        finEnGuion: fin,
        plano: null,
        audio: null,
        imagen: null,
        video: null,
        reusa: null,
        // §8.2: cada toma sabe de qué tipo es su imagen.
        tipoImagen: 'generada',
        // §8.1: cada toma conserva la referencia a la ficha que la respalda.
        fichas: [],
      });
    }
  }

  return { tomas, escenas, tramos: lista };
}

/**
 * Las tomas que se salen de la regla de los ocho a dieciocho segundos SIN excusa.
 *
 * Hay dos excusas legítimas, y solo dos. Las dos dicen lo mismo: que no existe un
 * reparto mejor, no que el reparto no lo haya encontrado.
 *   - Bajar del suelo cuando el bloque entero dura menos que el suelo. No hay
 *     narración con la que llenar la toma, y alargarla exigiría cruzar una frontera
 *     dura y narrar en voz alta un título de escena.
 *   - Pasar del techo cuando la toma no se puede partir en dos trozos que lleguen
 *     los dos al suelo. Partirla dejaría una toma corta, y una toma corta es peor.
 * Cualquier otra cosa es un fallo del reparto, y sale aquí.
 */
export function tomasFueraDeRegla(resultado, config = {}) {
  const c = { ...PREDETERMINADO, ...config };
  const tomas = resultado?.tomas || [];
  const narracion = (resultado?.tramos || []).filter((t) => t.clase === 'narracion');
  const fuera = [];
  // Un bloque son las tomas seguidas que comparten escena y hablante.
  const bloqueDe = new Map();
  let clave = null;
  let n = -1;
  for (const t of tomas) {
    const suya = `${t.escena} ${t.testimonio || ''}`;
    if (suya !== clave) {
      clave = suya;
      n++;
    }
    bloqueDe.set(t.i, n);
  }
  const duraBloque = new Map();
  for (const t of tomas) {
    const b = bloqueDe.get(t.i);
    duraBloque.set(b, (duraBloque.get(b) || 0) + t.segundos);
  }

  // ¿Había un reparto MEJOR que dejar esta toma como está?
  //
  // Se mide con el mismo castigo con el que reparte el segmentador, y no con «¿se
  // puede partir?». La diferencia no es teórica: una toma de 18,07 segundos se
  // puede partir en 8,1 y 9,9 —las dos dentro de la regla— y partirla sería peor,
  // porque cambia siete centésimas de exceso por una imagen entera de más, que es
  // justo el gasto que la regla existe para quitar. Preguntar «¿se puede?» marcaba
  // esas como fallo y empujaba a arreglarlas gastando.
  //
  // Los cortes se prueban sobre las frases de verdad —los tramos de narración de
  // dentro de la toma—, porque un corte solo puede ir donde acaba una frase.
  const hayRepartoMejor = (t) => {
    const dentro = narracion.filter((f) => f.inicio >= t.inicioEnGuion && f.fin <= t.finEnGuion);
    if (dentro.length < 2) return false;
    const ultimo = dentro[dentro.length - 1];
    const entera = castigoDeDuracion(segundosEntre(dentro[0], ultimo, c), c);
    for (let k = 1; k < dentro.length; k++) {
      const antes = castigoDeDuracion(segundosEntre(dentro[0], dentro[k - 1], c), c);
      const despues = castigoDeDuracion(segundosEntre(dentro[k], ultimo, c), c);
      if (antes + despues < entera) return true;
    }
    return false;
  };

  for (const t of tomas) {
    if (t.segundos < c.segundosMinimo && duraBloque.get(bloqueDe.get(t.i)) >= c.segundosMinimo) {
      fuera.push({ i: t.i, segundos: t.segundos, porque: 'por debajo del suelo teniendo bloque de sobra' });
    }
    if (t.segundos > c.segundosMaximo && hayRepartoMejor(t)) {
      fuera.push({
        i: t.i,
        segundos: t.segundos,
        porque: 'por encima del techo habiendo un reparto mejor',
      });
    }
  }
  return fuera;
}

/**
 * La comprobación de cobertura (§4.3).
 *
 * Reconstruye el guion desde los tramos y lo compara carácter por carácter. Cuando
 * falla dice DÓNDE: un «no coincide» a secas obliga a mirar quince minutos de texto
 * a ojo, que es justo lo que esta comprobación existe para evitar.
 */
export function verificarCobertura(guion, resultado) {
  const texto = String(guion ?? '');
  const reconstruido = (resultado.tramos || [])
    .map((t) => texto.slice(t.inicio, t.fin))
    .join('');

  if (reconstruido === texto) {
    const narrado = (resultado.tomas || []).reduce((n, t) => n + t.texto.length, 0);
    return {
      ok: true,
      caracteres: texto.length,
      narrados: narrado,
      tomas: (resultado.tomas || []).length,
    };
  }

  let i = 0;
  while (i < Math.min(reconstruido.length, texto.length) && reconstruido[i] === texto[i]) i++;
  return {
    ok: false,
    posicion: i,
    esperado: texto.slice(Math.max(0, i - 40), i + 40),
    obtenido: reconstruido.slice(Math.max(0, i - 40), i + 40),
    detalle:
      `La reconstrucción se separa del guion en el carácter ${i} ` +
      `(guion: ${texto.length} caracteres, reconstruido: ${reconstruido.length}).`,
  };
}

/**
 * Segmenta Y comprueba. Es la puerta que debe usar todo el mundo: segmentar sin
 * comprobar es como no haber comprobado nunca.
 */
export function segmentarVerificado(guion, config = {}) {
  const r = segmentar(guion, config);
  const cobertura = verificarCobertura(guion, r);
  if (!cobertura.ok) {
    throw new Error(`La segmentación no cubre el guion. ${cobertura.detalle}`);
  }
  return { ...r, cobertura };
}
