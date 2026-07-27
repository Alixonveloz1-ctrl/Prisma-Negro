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

export class Cola {
  constructor({ alProgresar, alAviso } = {}) {
    this.alProgresar = alProgresar || (() => {});
    this.alAviso = alAviso || (() => {});
    this.control = null;
    this.corriendo = false;
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
  async ejecutar(nombre, unidades, hacerUno, { alTerminarUno, reintentosPorUnidad = 1 } = {}) {
    if (this.corriendo) throw new Error('Ya hay una tanda en marcha.');
    this.corriendo = true;
    this.control = new AbortController();

    const total = unidades.length;
    const fallos = [];
    let hechas = 0;

    this.alProgresar({ fase: nombre, hechas: 0, total, estado: 'empieza' });

    try {
      for (let i = 0; i < total; i++) {
        if (this.senal.aborted) break;

        let resultado = null;
        let ultimoError = null;

        for (let intento = 0; intento <= reintentosPorUnidad; intento++) {
          try {
            resultado = await hacerUno(unidades[i], i, this.senal, (ms, por) =>
              this.alAviso(
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
            // Una cuota agotada ya se esperó abajo, todo lo que se podía esperar.
            // Insistir aquí encima solo alarga la agonía.
            if (e?.estado === 429) break;
          }
        }

        if (ultimoError) {
          fallos.push({ i, unidad: unidades[i], error: String(ultimoError.message || ultimoError) });
          this.alAviso(`Unidad ${i + 1} de ${total}: ${ultimoError.message}`);
        } else if (alTerminarUno) {
          // Se escribe ANTES de pasar a la siguiente. Esto es lo que hace que
          // detener a mitad no pierda nada.
          await alTerminarUno(resultado, unidades[i], i);
        }

        hechas++;
        this.alProgresar({ fase: nombre, hechas, total, estado: 'avanza', fallos: fallos.length });
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
    });

    return { hechas, total, fallos, detenida };
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
