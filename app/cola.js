// La cola (§2, §4 del plano).
//
// El navegador es el director de orquesta: decide qué generar y en qué orden, lleva
// la cola, la barra de progreso, el botón de detener y los reintentos.
//
// Dos reglas de §4 que esta clase hace ciertas:
//
//   - «Cada unidad terminada se escribe ANTES de pasar a la siguiente: se puede
//     detener a mitad y reanudar sin perder nada.» Por eso `alTerminarUno` se
//     espera (`await`) antes de seguir. Si se escribiera al final, detener a mitad
//     tiraría todo lo generado —y ya pagado— de esa tanda.
//
//   - Un fallo en una unidad NO tumba la tanda. Se anota, se sigue, y al final se
//     dice qué falló y por qué, con palabras (§1). Cuarenta tomas buenas no se
//     tiran porque la treinta y uno diera error.
//
// §4.5: en narración el progreso se cuenta en LLAMADAS, no en tomas. Por eso esta
// clase no sabe qué es una toma: recibe «unidades», y cada fase decide qué es una.

export class Detenida extends Error {
  constructor() {
    super('Detenido.');
    this.name = 'Detenida';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LA CUOTA AGOTADA NO PIERDE LA UNIDAD: LA TANDA ESPERA Y SIGUE.
//
// «Llega el momento en que el mensaje dice que se está generando pero no se
//  genera nada. Media hora y no se generó nada. Debería ponerse en cola para que
//  cuando ya se quite el límite continúe la generación. Si no, de nada me sirve
//  dar el botón de generar todo.»
//
// Lo que pasaba: `llamar` espera hasta unos ocho minutos a que se abra la ventana
// de cuota y, si sigue cerrada, lanza. Aquí abajo eso caía en `if (estado === 429)
// break` y la unidad se daba POR PERDIDA. La siguiente empezaba de cero contra la
// misma pared, esperaba sus ocho minutos, se perdía también, y así ciento cuarenta
// veces. Media hora sin una imagen y sin un solo error visible.
//
// Y la cuota no es un fallo: es un «ahora no». Así que la tanda se PARA —no la
// unidad—, espera con una cuenta atrás a la vista, y vuelve a intentar LA MISMA
// unidad. Nada se pierde y no hay que estar delante.
//
// ─────────────────────────────────────────────────────────────────────────────
// Y ESPERAR SOLO SIRVE SI LA TANDA AVANZA. Esto también se aprendió mirándolo.
//
// «Lleva media hora ahí y no avanza. Ni genera nada.»
//
// La primera versión de esto esperaba 1, 2, 5, 10, 15 y 30 minutos, hasta seis
// horas, reintentando siempre la misma unidad. Y eso está bien para una cuota POR
// MINUTO —se abre a la primera espera— pero es una trampa para cualquier otra:
// una cuota diaria, o un modelo que el proyecto no tiene habilitado y contesta
// «límite 0», no se abren nunca. La herramienta se pasaba media hora dando vueltas
// sin generar nada y sin decir por qué.
//
// La señal que lo distingue es simple y no hace falta adivinarla: SI LA VENTANA ES
// POR MINUTO, ALGO SALE BIEN EN CUANTO PASA EL MINUTO. Así que dos esperas
// seguidas sin que se genere ni una sola cosa —un minuto y tres— significan que no
// es la ventana del minuto, y seguir esperando es tirar el tiempo. Se para y se
// dice LO QUE CONTESTÓ EL PROVEEDOR, que es lo que permite arreglarlo.
//
// Un acierto reinicia la cuenta: una cuota que va y viene sigue funcionando como
// antes, esperando lo que haga falta.
// ─────────────────────────────────────────────────────────────────────────────
const ESPERAS_DE_TANDA = [60, 180];
/** Esperas seguidas SIN QUE SE GENERE NADA antes de darse por vencido. */
const ESPERAS_SIN_AVANZAR = ESPERAS_DE_TANDA.length;
/** Y un tope total, para la cuota intermitente que nunca deja de fallar del todo. */
const TOPE_DE_ESPERA_TOTAL = 60 * 60 * 1000;

/** ¿Es la cuota del proveedor, o sea un «ahora no» y no un «no»? */
const esCuota = (e) =>
  e?.estado === 429 ||
  e?.motivo === 'cuota' ||
  /cuota|RESOURCE_EXHAUSTED|has been exhausted|quota|rate limit/i.test(String(e?.message || ''));

export class Cola {
  constructor({ alProgresar, alAviso } = {}) {
    this.alProgresar = alProgresar || (() => {});
    this.alAviso = alAviso || (() => {});
    this.control = null;
    this.corriendo = false;
  }

  /**
   * Espera con cuenta atrás a la vista, y se corta si se pide parar.
   *
   * La cuenta atrás no es adorno: sin ella, una espera de media hora se ve
   * EXACTAMENTE IGUAL que la aplicación colgada, que es de lo que se quejaba.
   */
  async esperarConCuenta(ms, decir) {
    const hasta = Date.now() + ms;
    while (Date.now() < hasta) {
      if (this.senal?.aborted) throw new Detenida();
      const quedan = Math.max(0, Math.round((hasta - Date.now()) / 1000));
      const m = Math.floor(quedan / 60);
      decir(m ? `${m} min ${String(quedan % 60).padStart(2, '0')} s` : `${quedan} s`);
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  get senal() {
    return this.control?.signal;
  }

  detener() {
    this.control?.abort();
    this.alAviso('Deteniendo… se termina la unidad en curso y se guarda.');
  }

  /**
   * Ejecuta una tanda.
   *
   * `hacerUno(unidad, i)` genera una unidad. `alTerminarUno(resultado, unidad, i)`
   * la escribe — y se espera antes de continuar, que es lo que permite reanudar.
   */
  async ejecutar(nombre, unidades, hacerUno, { alTerminarUno, reintentosPorUnidad = 1, donde = 'paso4' } = {}) {
    if (this.corriendo) throw new Error('Ya hay una tanda en marcha.');
    this.corriendo = true;
    this.control = new AbortController();

    const total = unidades.length;
    const fallos = [];
    let hechas = 0;
    // ─────────────────────────────────────────────────────────────────────────
    // DOS CIFRAS, Y NO UNA. «Dice que generó dos imágenes, pero es mentira.»
    //
    // Había una sola cuenta, `hechas`, que subía tanto al generar como al fallar,
    // y la pantalla la enseñaba como si fueran las generadas. Así que «2 de 126»
    // podía ser una imagen y un fallo, o dos imágenes, o —como pasó— una imagen y
    // otra que se generó pero cuya anotación se perdió. Una cifra que a veces
    // miente es peor que no tenerla: se decide con ella.
    //
    // `hechas` es cuántas unidades se han despachado —lo que mueve la barra— y
    // `generadas` es cuántas salieron Y SE ANOTARON. La pantalla enseña la
    // segunda, que es la que él está contando con los ojos.
    // ─────────────────────────────────────────────────────────────────────────
    let generadas = 0;
    // Cuántas veces seguidas ha tocado esperar por la cuota, y cuánto se lleva
    // esperado en total. Lo primero decide cuánto se espera la próxima; lo segundo
    // es lo que impide esperar para siempre por una cuota diaria.
    let esperasSeguidas = 0;
    let esperadoTotal = 0;

    const decir = (m) => this.alAviso(m, donde);
    this.alProgresar({ fase: nombre, hechas: 0, generadas: 0, total, estado: 'empieza', donde });

    try {
      for (let i = 0; i < total; i++) {
        if (this.senal.aborted) break;

        let resultado = null;
        let ultimoError = null;

        for (let intento = 0; intento <= reintentosPorUnidad; intento++) {
          try {
            resultado = await hacerUno(unidades[i], i, this.senal, (ms, por) =>
              decir(
                por === 'cuota'
                  ? `Cuota del proveedor agotada. Esperando ${Math.round(ms / 1000)} s y sigo con la ${i + 1} de ${total}…`
                  : `Bajando el ritmo ${Math.round(ms / 1000)} s por unidad para no volver a agotar la cuota…`,
              ),
            );
            ultimoError = null;
            break;
          } catch (e) {
            if (e?.name === 'Detenida' || this.senal.aborted) throw new Detenida();
            ultimoError = e;
            // Un 413 no mejora por insistir: es tamaño (§7.1).
            if (e?.estado === 413) break;
            // La cuota ya se esperó abajo todo lo que se podía. Aquí se sale del
            // bucle de reintentos para que decida la tanda entera, más abajo.
            if (esCuota(e)) break;
          }
        }

        // ── LA CUOTA PARA LA TANDA, NO PIERDE LA UNIDAD ──────────────────────
        if (
          ultimoError &&
          esCuota(ultimoError) &&
          esperasSeguidas < ESPERAS_SIN_AVANZAR &&
          esperadoTotal < TOPE_DE_ESPERA_TOTAL
        ) {
          const ms = ESPERAS_DE_TANDA[Math.min(esperasSeguidas, ESPERAS_DE_TANDA.length - 1)] * 1000;
          esperasSeguidas++;
          esperadoTotal += ms;
          this.alProgresar({ fase: nombre, hechas, generadas, total, estado: 'espera', fallos: fallos.length, donde });
          await this.esperarConCuenta(ms, (queda) =>
            decir(
              `Cuota del proveedor agotada. Esperando ${queda} y sigo por la ${i + 1} de ${total}. ` +
                `Llevas ${generadas} guardadas: no se pierde nada. Puedes dejarlo o darle a Detener.`,
            ),
          );
          i--; // LA MISMA UNIDAD otra vez. No cuenta como hecha ni como fallida.
          continue;
        }

        // ── Y SI ESPERAR NO SIRVIÓ, SE PARA Y SE DICE POR QUÉ ────────────────
        //
        // Dos esperas seguidas sin generar ni una sola cosa: no es la ventana del
        // minuto. Seguir es lo que le costó media hora mirando una barra parada.
        // Se corta la tanda entera —no solo esta unidad— con el mensaje del
        // proveedor delante, que es lo único que dice qué hay que tocar.
        if (ultimoError && esCuota(ultimoError) && esperasSeguidas >= ESPERAS_SIN_AVANZAR) {
          fallos.push({ i, unidad: unidades[i], error: String(ultimoError.message || ultimoError) });
          this.sinCuota = String(ultimoError.message || ultimoError);
          decir(
            `Se para: tras esperar ${Math.round(esperadoTotal / 60000)} minutos no se generó nada. ` +
              'Esto no es la cuota por minuto —esa se abre sola—. Lo que contestó el proveedor está abajo. ' +
              `Lo generado (${generadas}) está guardado y al volver a darle solo se repite lo que falta.`,
          );
          break;
        }

        if (ultimoError) {
          fallos.push({ i, unidad: unidades[i], error: String(ultimoError.message || ultimoError) });
          decir(`Unidad ${i + 1} de ${total}: ${ultimoError.message}`);
        } else {
          // Una unidad buena reinicia la paciencia: la ventana se abrió.
          esperasSeguidas = 0;
          try {
            if (alTerminarUno) {
              // Se escribe ANTES de pasar a la siguiente. Esto es lo que hace que
              // detener a mitad no pierda nada.
              await alTerminarUno(resultado, unidades[i], i);
            }
            // GENERADA de verdad: se hizo Y se anotó. Ver abajo por qué son dos
            // cifras y no una.
            generadas++;
          } catch (e) {
            // ESCRIBIR TAMBIÉN PUEDE FALLAR, y fallaba en silencio. Un fallo al
            // anotar no puede tumbar la tanda —lo generado sigue en el almacén—
            // pero tampoco puede contarse como hecho.
            fallos.push({ i, unidad: unidades[i], error: String(e?.message || e) });
            decir(`Unidad ${i + 1} de ${total}: ${e?.message || e}`);
          }
        }

        hechas++;
        this.alProgresar({ fase: nombre, hechas, generadas, total, estado: 'avanza', fallos: fallos.length, donde });
      }
    } catch (e) {
      if (e?.name !== 'Detenida') throw e;
    } finally {
      this.corriendo = false;
    }

    const detenida = !!this.senal?.aborted;
    this.alProgresar({
      fase: nombre,
      hechas,
      generadas,
      total,
      estado: detenida ? 'detenida' : 'termina',
      fallos: fallos.length,
      donde,
    });

    // `sinCuota` lleva EL MENSAJE DEL PROVEEDOR, tal cual, cuando la tanda se paró
    // porque esperar no servía. Quien la llama lo enseña: es lo único que dice qué
    // hay que tocar en Google Cloud.
    const sinCuota = this.sinCuota || null;
    this.sinCuota = null;
    return { hechas, generadas, total, fallos, detenida, esperadoTotal, sinCuota };
  }
}

/**
 * Reparte las tomas en bloques de narración (§4.5).
 *
 *   «El servicio de voz limita el texto por llamada (unos 4.000 bytes). El episodio
 *    se reparte en bloques de unos 45 segundos. El progreso se cuenta en LLAMADAS,
 *    no en tomas.»
 *
 * Un bloque nunca cruza un cambio de escena: si lo cruzara, el corte por silencios
 * repartiría entre tomas de escenas distintas y la música de la escena siguiente
 * entraría encima de la última frase de la anterior.
 */
export function bloquesDeNarracion(tomas, config) {
  const topeSegundos = config?.narracion?.segundosPorBloque ?? 45;
  const topeBytes = config?.narracion?.topeBytesPorLlamada ?? 4000;
  const bloques = [];
  let actual = null;

  const bytes = (s) => new TextEncoder().encode(s).length;

  for (const t of tomas) {
    const texto = t.texto.trim();
    if (!texto) continue;

    const cabeEnSegundos = actual && actual.segundos + t.segundos <= topeSegundos;
    const cabeEnBytes = actual && bytes(actual.texto + ' ' + texto) <= topeBytes;
    const mismaEscena = actual && actual.escena === t.escena;

    if (actual && cabeEnSegundos && cabeEnBytes && mismaEscena) {
      actual.texto += ' ' + texto;
      actual.segundos += t.segundos;
      actual.tomas.push(t);
      continue;
    }

    // Una sola toma que ya pasa del tope de bytes no tiene arreglo aquí: se manda
    // igual y el backend lo dirá con palabras. Partirla rompería la correspondencia
    // entre toma y audio, que es peor.
    actual = { texto, segundos: t.segundos, escena: t.escena, tomas: [t] };
    bloques.push(actual);
  }

  return bloques;
}
