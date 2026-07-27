// Fase 9 — Miniatura, portada y carteles (§4.9 del plano).
//
// Imágenes fijas con EL TEXTO YA INCRUSTADO. Tres reglas que costaron varias
// vueltas, y las tres están aplicadas aquí:
//
//  1. EL TEXTO LO ESCRIBE EL PROMPT, NO LO INVENTA EL MODELO. Se le dan las líneas
//     exactas, entre comillas y contadas.
//
//  2. TIPOGRAFÍA GRANDE. Con letra pequeña el modelo la deforma. Y el logotipo hay
//     que describirlo como un DISEÑO —peso, condensación, acabado, integración— no
//     como «texto blanco»: si le pides texto, te da algo que parece hecho en
//     PowerPoint.
//
//  3. LA MARCA DEL CANAL NO LA DIBUJA EL MODELO: la dibuja el navegador sobre un
//     lienzo, y así sale nítida y siempre igual. Eso está en `app/marca.js`.
//
// Y §7.11: el prompt fija el FORMATO y deja libre la PUESTA EN ESCENA. En la
// dirección artística de las portadas se pasó de «todos los sujetos de espaldas» a
// «todos mirando a cámara», y las dos son igual de malas.

import { llamar } from '../api.js';
import { claveMiniatura, clavePortada } from '../../comun/claves.mjs';
import { reducirReferencias, deBase64 } from '../imagenes.js';
import { dibujarMarca, marcarImagen } from '../marca.js';
import * as local from '../local.js';
import { material } from '../material.js';

/**
 * Compone la instrucción de una imagen con texto incrustado.
 *
 * `lineas` son las líneas EXACTAS. No es una sugerencia de qué poner: es lo que va
 * escrito, palabra por palabra.
 */
export function componerInstruccion({ lineas, atmosfera, formato = 'miniatura' }) {
  const texto = (lineas || []).filter(Boolean);
  if (!texto.length) throw new Error('Una miniatura sin texto no es una miniatura.');

  const encaje = {
    miniatura: 'Miniatura de video horizontal 16:9, legible a tamaño de sello.',
    portada: 'Portada de serie documental, composición vertical equilibrada.',
    cartel: 'Cartel de documental, formato vertical.',
  }[formato];

  return [
    encaje,
    atmosfera,
    // Regla 1: el texto exacto, contado y entrecomillado. Sin esto el modelo se
    // inventa un titular parecido pero distinto, y distinto cada vez.
    `El diseño lleva EXACTAMENTE ${texto.length} ${texto.length === 1 ? 'línea' : 'líneas'} de texto, ` +
      `con esta ortografía literal y ninguna palabra más:`,
    ...texto.map((l, i) => `Línea ${i + 1}: «${l}»`),
    // Regla 2: tipografía grande, descrita como diseño.
    'La primera línea ocupa al menos un tercio del alto de la imagen: tipografía de ' +
      'palo seco, muy condensada, peso extra negro, bordes limpios y perfectamente ' +
      'legibles, integrada en la composición con sombra o degradado detrás para que ' +
      'destaque sobre el fondo. No es un texto superpuesto en una caja: es parte del ' +
      'diseño.',
    'Sin texto adicional, sin subtítulos inventados, sin marcas de agua, sin logotipos.',
    // Regla §7.11: formato fijado, puesta en escena libre.
    'Decide tú el encuadre, la distancia y hacia dónde miran los sujetos.',
  ].join(' ');
}

/**
 * Genera una miniatura y le pone la marca del canal por encima, dibujada por el
 * navegador (regla 3).
 */
export async function generarMiniatura({ pieza, lineas, atmosfera, config, referencias = [], senal }) {
  const r = await llamar(
    'imagen',
    {
      instruccion: componerInstruccion({ lineas, atmosfera, formato: 'miniatura' }),
      // Toda imagen que se envía se reduce antes (§6). Sin excepciones.
      referencias: await reducirReferencias(referencias, config.imagen.ladoReferencia, 2),
      aspecto: '16:9',
      guardarEn: claveMiniatura(pieza),
    },
    { senal },
  );

  if (!r.guardado?.bytes) throw new Error('La miniatura se generó pero el almacén no la confirmó.');

  // Del almacén y por trozos: pedirla de vuelta en la misma respuesta no cabe.
  let blob = await material(claveMiniatura(pieza), 'image/png', { senal });

  // La marca la dibuja el navegador, no el modelo.
  if (config.marca.activa && config.marca.texto) {
    const marca = await dibujarMarca({
      texto: config.marca.texto,
      color: config.marca.color,
      opacidad: config.marca.opacidad,
    });
    const marcada = await marcarImagen(blob, marca);
    blob = marcada.blob;
    const s = await llamar(
      'subir',
      { clave: claveMiniatura(pieza), datos: marcada.datos, tipo: 'image/png' },
      { senal },
    );
    // §7.12: el valor de retorno de una escritura no se ignora. Sin esto, la
    // miniatura con marca podía no subirse y en pantalla quedaba la de sin marca,
    // que se parece lo bastante como para no notarlo hasta publicarla.
    if (!s.guardado?.bytes) throw new Error('La miniatura con la marca no llegó al almacén.');
  }

  await local.guardarMaterial(claveMiniatura(pieza), blob);
  return { clave: claveMiniatura(pieza), blob };
}

export async function generarPortada({ pieza, lineas, atmosfera, config, senal }) {
  const r = await llamar(
    'imagen',
    {
      instruccion: componerInstruccion({ lineas, atmosfera, formato: 'portada' }),
      aspecto: '9:16',
      guardarEn: clavePortada(pieza),
    },
    { senal },
  );
  if (!r.guardado?.bytes) throw new Error('La portada se generó pero el almacén no la confirmó.');
  const blob = await material(clavePortada(pieza), 'image/png', { senal });
  return { clave: clavePortada(pieza), blob };
}

/**
 * Sube la marca del canal al almacén como material (`p03/firma`).
 *
 * El montaje la incrusta DENTRO de la codificación de cada toma (§5.7): si se
 * pusiera al final, sobre la pieza ya montada, habría que recodificarla entera —una
 * segunda generación de compresión sobre todo el material.
 */
export async function subirMarca({ pieza, config, senal }) {
  if (!config.marca.activa || !config.marca.texto) return null;
  const marca = await dibujarMarca({
    texto: config.marca.texto,
    color: config.marca.color,
    opacidad: config.marca.opacidad,
  });
  const r = await llamar(
    'subir',
    { clave: `${pieza}/firma`, datos: marca.datos, tipo: 'image/png' },
    { senal },
  );
  if (!r.guardado?.bytes) throw new Error('La marca no quedó confirmada en el almacén.');
  await local.guardarMaterial(`${pieza}/firma`, marca.blob);
  return r.guardado;
}
