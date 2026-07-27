// LA ÚNICA PUERTA (§2 del plano).
//
// Un solo endpoint con un campo `modo`. Es la única pieza que tiene la credencial.
// Hace tres cosas: firma un token con la cuenta de servicio, reenvía la petición, y
// censura la respuesta.
//
// El censor se instala en la PRIMERA LÍNEA del manejador, sobreescribiendo
// `res.json` una sola vez. A partir de ahí no hay forma de saltárselo por olvido:
// todo `res.json(...)` de este archivo —y de cualquier cosa que lo llame— sale
// censurado y con el tamaño comprobado.
//
// §1: el usuario no lee registros de la nube desde el teléfono. Cualquier fallo
// tiene que explicarse en pantalla, con palabras. Por eso todo error que sale de
// aquí es una frase, no un código.

import { instalarCensor } from './_lib/censor.js';
import { probarCadena } from './_lib/salud.js';
import * as entorno from './_lib/entorno.js';
import * as almacen from './_lib/almacen.js';
import * as proveedor from './_lib/proveedor.js';
import * as montador from './_lib/montador.js';

const TOPE_PETICION = 4.5 * 1024 * 1024;

export default async function handler(req, res) {
  // ── Primera línea. No mover. ────────────────────────────────────────────────
  instalarCensor(res);

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Esta puerta solo acepta POST.' });
  }

  let cuerpo = req.body;
  if (typeof cuerpo === 'string') {
    try {
      cuerpo = JSON.parse(cuerpo);
    } catch {
      return res.status(400).json({ ok: false, error: 'El cuerpo de la petición no es JSON válido.' });
    }
  }
  if (!cuerpo || typeof cuerpo !== 'object') {
    return res.status(400).json({ ok: false, error: 'Falta el cuerpo de la petición.' });
  }

  const { modo } = cuerpo;
  if (!modo) {
    return res.status(400).json({ ok: false, error: 'Falta el campo «modo».' });
  }

  // El modo «salud» es el único que no pide clave: es el que te dice, desde el
  // teléfono, qué falta por configurar.
  if (modo !== 'salud') {
    const esperada = process.env.CLAVE_ACCESO;
    if (!esperada) {
      return res.status(500).json({
        ok: false,
        error: 'Falta CLAVE_ACCESO en el entorno. Sin ella la herramienta queda abierta a cualquiera.',
      });
    }
    if (cuerpo.clave !== esperada) {
      return res.status(401).json({ ok: false, error: 'Clave de acceso incorrecta.' });
    }
  }

  try {
    const salida = await despachar(modo, cuerpo);
    return res.status(200).json({ ok: true, ...salida });
  } catch (err) {
    // §7.1: cuando un fallo no cuadra, sospecha del tamaño antes que del reloj.
    const msg = String(err?.message || err);
    const esTamano = /413|too large|payload|entity too large/i.test(msg);
    return res.status(esTamano ? 413 : 500).json({
      ok: false,
      error: esTamano
        ? `${msg} — probablemente sea el tope de 4,5 MB, no un tiempo agotado.`
        : msg,
    });
  }
}

async function despachar(modo, c) {
  switch (modo) {
    // ── Diagnóstico ───────────────────────────────────────────────────────────
    case 'salud': {
      const configuracion = revisarConfiguracion();
      // Comprobar que una variable EXISTE no comprueba nada. Cuando la
      // configuración está completa se prueba la cadena de verdad: firma, almacén,
      // modelos y montador. Es lo único que distingue «lo pegué» de «funciona».
      if (!configuracion.lista) return { configuracion };
      return { configuracion, prueba: await probarCadena() };
    }

    // ── Modelos ───────────────────────────────────────────────────────────────
    case 'texto':
      return await proveedor.texto({
        instruccion: exigir(c, 'instruccion'),
        sistema: c.sistema,
        esquema: c.esquema,
        temperatura: c.temperatura,
        maxTokens: c.maxTokens,
        // Busca en internet de verdad y devuelve además las fuentes consultadas.
        buscarEnInternet: !!c.buscarEnInternet,
        modelo: c.modelo,
      });

    case 'imagen': {
      const img = await proveedor.imagen({
        instruccion: exigir(c, 'instruccion'),
        referencias: c.referencias || [],
        aspecto: c.aspecto,
      });
      // Se sube en el mismo viaje: así el navegador nunca es dueño del original
      // (§1: el almacén es la única fuente de verdad) y no hay una imagen que
      // «se generó» pero no está en ningún sitio (§7.12).
      if (c.guardarEn) {
        const r = await almacen.subir(c.guardarEn, Buffer.from(img.datos, 'base64'), img.tipo);
        return { guardado: r, referencia: almacen.referenciaDe(c.guardarEn), ...(c.devolver ? img : {}) };
      }
      return img;
    }

    case 'video.iniciar':
      return await proveedor.videoIniciar({
        instruccion: exigir(c, 'instruccion'),
        fotograma: c.fotograma,
        segundos: c.segundos,
        aspecto: c.aspecto,
      });

    case 'video.consultar': {
      const r = await proveedor.videoConsultar(exigir(c, 'operacion'));
      if (r.listo && c.guardarEn) {
        const g = await almacen.subir(c.guardarEn, Buffer.from(r.datos, 'base64'), r.tipo);
        return { listo: true, guardado: g, referencia: almacen.referenciaDe(c.guardarEn) };
      }
      return r;
    }

    case 'voz': {
      // Dos caminos, un solo resultado: WAV PCM. Quién lo genera lo decide la voz
      // elegida, y aguas abajo nadie tiene que enterarse.
      const a = proveedor.esVozGemini(c.nombreVoz)
        ? await proveedor.vozGemini({
            texto: exigir(c, 'texto'),
            nombreVoz: c.nombreVoz,
            estilo: c.estilo,
          })
        : await proveedor.voz({
            texto: exigir(c, 'texto'),
            nombreVoz: c.nombreVoz,
            velocidad: c.velocidad,
            tono: c.tono,
          });
      // La narración se devuelve al navegador porque ahí se mide su duración real y
      // se corta por los silencios (§4.5). Un bloque de 45 s en PCM a 24 kHz son
      // ~2,1 MB: cabe en la respuesta. Bloques más largos no, y por eso son de 45 s.
      return a;
    }

    case 'modelos.catalogo':
    {
      const cat = await proveedor.modelosDisponibles();
      // `porSondeo` e `intentos` se sacan a la raíz: estaban dentro de `disponibles`
      // y la pantalla los leía de la raíz, así que el aviso no salía nunca y parecía
      // que el catálogo iba bien cuando estaba cayendo al respaldo.
      const { porSondeo, intentos, ...disponibles } = cat;
      return { disponibles, porSondeo: !!porSondeo, intentos: intentos || [], enUso: proveedor.modelosEnUso() };
    }

    case 'voz.catalogo':
      return {
        voces: await proveedor.vocesDisponibles(
          c.idioma || 'es',
          !!c.expresivas,
          c.genero === undefined ? 'MALE' : c.genero,
        ),
      };

    case 'musica': {
      const m = await proveedor.musica({
        instruccion: exigir(c, 'instruccion'),
        segundos: c.segundos,
      });
      if (c.guardarEn) {
        const g = await almacen.subir(c.guardarEn, Buffer.from(m.datos, 'base64'), m.tipo);
        return { guardado: g, referencia: almacen.referenciaDe(c.guardarEn) };
      }
      return m;
    }

    // ── Almacén ───────────────────────────────────────────────────────────────
    case 'subir': {
      const datos = Buffer.from(exigir(c, 'datos'), 'base64');
      if (datos.byteLength > TOPE_PETICION) {
        throw new Error('Lo que intentas subir pasa de 4,5 MB. Súbelo por trozos.');
      }
      const r = await almacen.subir(exigir(c, 'clave'), datos, c.tipo || 'application/octet-stream');
      return { guardado: r, referencia: almacen.referenciaDe(r.clave) };
    }

    case 'bajar': {
      const r = await almacen.bajarTrozo(exigir(c, 'clave'), c.desde, c.hasta);
      if (!r) return { existe: false };
      return {
        existe: true,
        datos: r.datos.toString('base64'),
        desde: r.desde,
        hasta: r.hasta,
        total: r.total,
      };
    }

    case 'ficha':
      return { ficha: await almacen.ficha(exigir(c, 'clave')) };

    case 'fichas':
      return { fichas: await almacen.fichas(exigir(c, 'claves')) };

    case 'listar':
      return { materiales: await almacen.listar(c.prefijo || '') };

    case 'borrar':
      return { borrado: await almacen.borrar(exigir(c, 'clave')) };

    // ── Proyecto ──────────────────────────────────────────────────────────────
    case 'proyecto.guardar': {
      const json = JSON.stringify(exigir(c, 'proyecto'));
      const r = await almacen.subir(
        `${exigir(c, 'id')}/proyecto`,
        Buffer.from(json),
        'application/json',
      );
      return { guardado: r };
    }

    case 'proyecto.cargar': {
      const buf = await almacen.bajar(`${exigir(c, 'id')}/proyecto`);
      if (!buf) return { existe: false };
      return { existe: true, proyecto: JSON.parse(buf.toString('utf8')) };
    }

    case 'proyecto.listar': {
      const todo = await almacen.listar('');
      const ids = [...new Set(todo.filter((m) => m.clave.endsWith('/proyecto')).map((m) => m.clave.split('/')[0]))];
      return { proyectos: ids };
    }

    // ── Montaje ───────────────────────────────────────────────────────────────
    case 'montar.comprobar':
      return await montador.comprobarMaterial(exigir(c, 'hoja'));

    case 'montar.lanzar': {
      // Comprobación previa OBLIGATORIA (§7.6). No se lanza el trabajo pesado sin
      // saber que está todo, y si falta algo se dice qué falta por su nombre.
      const previa = await montador.comprobarMaterial(exigir(c, 'hoja'));
      if (!previa.completo) {
        throw new Error(
          `Faltan ${previa.faltan.length} de ${previa.total} materiales y el montaje ` +
            `fallaría sin decir por qué. Falta: ${previa.faltan.slice(0, 12).join(', ')}` +
            (previa.faltan.length > 12 ? ` y ${previa.faltan.length - 12} más.` : '.'),
        );
      }
      return await montador.lanzar({
        pieza: exigir(c, 'pieza'),
        hoja: c.hoja,
        guionFfmpeg: exigir(c, 'guionFfmpeg'),
      });
    }

    case 'montar.estado':
      return await montador.estado(exigir(c, 'ejecucion'));

    case 'montar.registro':
      return await montador.registro(exigir(c, 'ejecucion'), c.lineas);

    default:
      throw new Error(`Modo desconocido: «${modo}».`);
  }
}

function exigir(c, campo) {
  const v = c[campo];
  if (v === undefined || v === null || v === '') {
    throw new Error(`Falta el campo «${campo}» para el modo «${c.modo}».`);
  }
  return v;
}

/**
 * Qué falta por configurar, dicho con palabras (§1).
 * El usuario no abre paneles de la nube desde el teléfono para averiguar por qué no
 * funciona: se lo decimos aquí.
 */
function revisarConfiguracion() {
  // TRES variables. Ni una más.
  //
  // El JSON de la cuenta de servicio ya trae dentro el proyecto, el correo y la
  // clave: pedir esos tres por separado era hacer copiar tres veces lo que ya está
  // en un archivo. Y todo lo que tiene un valor por defecto sensato —regiones,
  // prefijo, nombre del contenedor— no es configuración, es una opción.
  const faltan = [];
  const usando = {};

  // Cada una acepta varios nombres (§ api/_lib/entorno.js). Se dice CUÁL se
  // encontró: con dos puestas, saber cuál está leyendo evita media hora de dudas.
  const exigir = (cual, es) => {
    const { valor, nombre } = entorno.leer(cual);
    if (valor) {
      usando[cual] = nombre;
      return true;
    }
    faltan.push({ variable: entorno.nombrePrincipal(cual), es, tambien: entorno.NOMBRES[cual].slice(1) });
    return false;
  };

  const hayJson = exigir(
    'cuenta',
    'el archivo JSON de la cuenta de servicio, entero. Trae dentro el proyecto, el correo y la clave',
  );
  // Las tres piezas por separado también valen: si están, la cuenta no falta.
  if (!hayJson && entorno.leer('clave').valor && entorno.leer('correo').valor) {
    faltan.pop();
    usando.cuenta = 'variables sueltas';
  }

  exigir('bucket', 'el nombre del bucket donde vive todo lo generado');
  exigir('acceso', 'la contraseña para entrar a la herramienta');

  return {
    lista: faltan.length === 0,
    faltan,
    usando,
    // Lo demás tiene valor por defecto. Se enseña para que se sepa qué se está
    // usando, no como algo pendiente de hacer.
    porDefecto: {
      prefijo: almacen.prefijoActual(),
      regionIA: entorno.valor('regionIA', 'us-central1'),
      regionJob: entorno.valor('regionJob', 'us-central1'),
      montador: entorno.valor('job', 'prisma-negro-montador'),
      referencias: entorno.valor('referencias') ? 'fijada a mano' : 'derivada de la cuenta',
    },
    modelos: {
      texto: process.env.MODELO_TEXTO || 'gemini-2.5-pro',
      imagen: process.env.MODELO_IMAGEN || 'gemini-2.5-flash-image',
      video: process.env.MODELO_VIDEO || 'veo-3.1-generate-preview',
      musica: process.env.MODELO_MUSICA || 'lyria-002',
    },
  };
}
