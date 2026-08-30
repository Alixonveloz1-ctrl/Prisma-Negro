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

export const PREDETERMINADO = {
  // §8.5: la narración documental es más larga por toma y con menos cortes que la
  // ficción. El objetivo de segundos por toma sube.
  segundosObjetivo: 11,
  segundosMaximo: 16,
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
    if (/^\s*>\s+\S/.test(contenido)) {
      salida.push({ clase: 'testimonio', inicio: linea.inicio, fin: linea.fin });
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
 * Segmenta el guion en tomas.
 *
 * Agrupa frases consecutivas hasta acercarse al objetivo de segundos, sin cruzar
 * nunca un encabezado de escena ni una línea en blanco: un corte de párrafo es una
 * frontera dura, y el modelo de dirección lo agradece tanto como el oído.
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
  const tomas = [];
  const escenas = [];
  let escenaActual = 0;
  let acumulado = null;

  const cerrar = () => {
    if (!acumulado) return;
    const t = texto.slice(acumulado.inicio, acumulado.fin);
    tomas.push({
      i: tomas.length,
      escena: acumulado.escena,
      texto: t,
      // Quién habla, si esta toma es parte de un testimonio. Cadena vacía si no.
      // Lo lee el director para poner el plano de quien declara, y de ahí sale la
      // resolución contra la biblioteca por arquetipo.
      testimonio: acumulado.testimonio || '',
      // Estimación, solo para dimensionar. La real la mide el audio (§4.5).
      segundos: Math.max(1.2, +(t.length / c.caracteresPorSegundo).toFixed(2)),
      inicioEnGuion: acumulado.inicio,
      finEnGuion: acumulado.fin,
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
    acumulado = null;
  };

  // Quién está hablando ahora mismo. Vale hasta la siguiente frontera dura —una
  // línea en blanco o un cambio de escena—, no solo para la primera toma: un
  // testimonio de tres frases se parte en dos tomas y las dos son del mismo
  // testigo. Marcar solo la primera dejaría media declaración con el plano del
  // narrador.
  let hablando = '';

  // SALTOS DE LÍNEA SEGUIDOS DESDE EL ÚLTIMO TEXTO NARRADO.
  //
  // ─────────────────────────────────────────────────────────────────────────────
  // La línea en blanco lleva desde el principio documentada como frontera dura
  // —«Separa con una línea en blanco los bloques que deben ir en tomas distintas.
  // Esa línea en blanco es una PAUSA»— y NO LO ERA. Tres párrafos separados por
  // líneas en blanco salían en UNA sola toma.
  //
  // El motivo: se buscaba `\n\s*\n` DENTRO de un tramo de hueco, y esos dos saltos
  // nunca caen en el mismo tramo. El salto que cierra el párrafo es la cola de la
  // línea anterior; la línea en blanco es otro tramo distinto. Cada uno traía un
  // salto y la expresión no encajaba en ninguno.
  //
  // Así que el guion podía pedir la pausa donde quisiera y el segmentador la
  // ignoraba siempre. Se contaban los saltos de todos los huecos SEGUIDOS, que es
  // lo que de verdad significa «hay una línea en blanco de por medio».
  // ─────────────────────────────────────────────────────────────────────────────
  let saltos = 0;

  for (const tr of lista) {
    if (tr.clase === 'encabezado') {
      cerrar();
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
      // declara. Juntarlos en una toma pondría dos planos distintos en una.
      cerrar();
      hablando = texto.slice(tr.inicio, tr.fin).replace(/^\s*>\s*/, '').trim();
      saltos = 0;
      continue;
    }

    if (tr.clase === 'hueco') {
      // Dos saltos SEGUIDOS son una línea en blanco, y una línea en blanco cierra
      // la toma en curso. Ver la cabecera de `saltos`.
      saltos += (texto.slice(tr.inicio, tr.fin).match(/\n/g) || []).length;
      if (saltos >= 2) {
        cerrar();
        hablando = '';
      }
      continue;
    }

    // Si no hubo ningún encabezado, hay una escena cero implícita.
    if (!escenas.length) {
      escenas.push({ n: 0, titulo: '', inicioEnGuion: 0 });
    }

    // Texto narrado: la cuenta de saltos vuelve a cero. Un salto solo —el que
    // parte una frase larga en dos líneas— no separa nada.
    saltos = 0;

    const frase = texto.slice(tr.inicio, tr.fin);
    const segFrase = frase.length / c.caracteresPorSegundo;

    if (acumulado && acumulado.escena === escenaActual && acumulado.testimonio === hablando) {
      const segActual = (acumulado.fin - acumulado.inicio) / c.caracteresPorSegundo;
      // Se añade mientras no pase del máximo Y mientras no nos alejemos del
      // objetivo más de lo que ya estamos.
      const cabe =
        segActual + segFrase <= c.segundosMaximo &&
        Math.abs(segActual + segFrase - c.segundosObjetivo) <= Math.abs(segActual - c.segundosObjetivo);
      if (cabe) {
        // El acumulado se extiende hasta el final de esta frase. Todo lo que hay en
        // medio (el espacio entre frases) queda dentro, que es lo que hace que la
        // concatenación reproduzca el guion.
        acumulado.fin = tr.fin;
        continue;
      }
      cerrar();
    }

    acumulado = { inicio: tr.inicio, fin: tr.fin, escena: escenaActual, testimonio: hablando };
  }
  cerrar();

  return { tomas, escenas, tramos: lista };
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
