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
// Las esperas van en minutos porque los segundos ya se probaron abajo. Y hay un
// final: una cuota por minuto se abre en minutos, pero una cuota DIARIA no se abre
// hoy, y esperar seis horas con la pantalla encendida no ayuda a nadie.
// ─────────────────────────────────────────────────────────────────────────────
const ESPERAS_DE_TANDA = [60, 120, 300, 600, 900, 1800];
const TOPE_DE_ESPERA_TOTAL = 6 * 3600 * 1000;

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
    // Cuántas veces seguidas ha tocado esperar por la cuota, y cuánto se lleva
    // esperado en total. Lo primero decide cuánto se espera la próxima; lo segundo
    // es lo que impide esperar para siempre por una cuota diaria.
    let esperasSeguidas = 0;
    let esperadoTotal = 0;

    const decir = (m) => this.alAviso(m, donde);
    this.alProgresar({ fase: nombre, hechas: 0, total, estado: 'empieza', donde });

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
        if (ultimoError && esCuota(ultimoError) && esperadoTotal < TOPE_DE_ESPERA_TOTAL) {
          const ms = ESPERAS_DE_TANDA[Math.min(esperasSeguidas, ESPERAS_DE_TANDA.length - 1)] * 1000;
          esperasSeguidas++;
          esperadoTotal += ms;
          this.alProgresar({ fase: nombre, hechas, total, estado: 'espera', fallos: fallos.length, donde });
          await this.esperarConCuenta(ms, (queda) =>
            decir(
              `Cuota del proveedor agotada. Esperando ${queda} y sigo por la ${i + 1} de ${total}. ` +
                `Llevas ${hechas} guardadas: no se pierde nada. Puedes dejarlo o darle a Detener.`,
            ),
          );
          i--; // LA MISMA UNIDAD otra vez. No cuenta como hecha ni como fallida.
          continue;
        }

        if (ultimoError) {
          fallos.push({ i, unidad: unidades[i], error: String(ultimoError.message || ultimoError) });
          decir(`Unidad ${i + 1} de ${total}: ${ultimoError.message}`);
        } else {
          // Una unidad buena reinicia la paciencia: la ventana se abrió.
          esperasSeguidas = 0;
          if (alTerminarUno) {
            // Se escribe ANTES de pasar a la siguiente. Esto es lo que hace que
            // detener a mitad no pierda nada.
            await alTerminarUno(resultado, unidades[i], i);
          }
        }

        hechas++;
        this.alProgresar({ fase: nombre, hechas, total, estado: 'avanza', fallos: fallos.length, donde });
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
      total,
      estado: detenida ? 'detenida' : 'termina',
      fallos: fallos.length,
      donde,
    });

    return { hechas, total, fallos, detenida, esperadoTotal };
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
