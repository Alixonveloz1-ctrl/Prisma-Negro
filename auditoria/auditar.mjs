#!/usr/bin/env node
// La auditoría (§9 del plano).
//
//   «Una herramienta de auditoría. Un script que se ejecuta en cada cambio y
//    comprueba invariantes del sistema. NO SON PRUEBAS UNITARIAS: son afirmaciones
//    sobre cómo tiene que estar construido el sistema.»
//
// Y la regla de oro, que aquí no es un consejo sino un modo de ejecución:
//
//   «Cada comprobación nueva se prueba ROMPIÉNDOLA A PROPÓSITO. Una comprobación
//    que nunca ha fallado no está comprobando nada. En este proyecto una de ellas
//    medía el bloque de código equivocado durante semanas y siempre pasaba.»
//
//   node auditoria/auditar.mjs            comprueba el sistema
//   node auditoria/auditar.mjs --romper   comprueba LAS COMPROBACIONES
//
// El segundo modo sabotea el sistema una vez por invariante y exige que la
// invariante correspondiente falle. Si una invariante sigue pasando con el sistema
// roto, no está midiendo lo que dice medir y la auditoría lo denuncia.

import { construirContexto } from './contexto.mjs';
import { invariantes as arquitectura } from './invariantes/arquitectura.mjs';
import { invariantes as montaje } from './invariantes/montaje.mjs';
import { invariantes as datos } from './invariantes/datos.mjs';
import { invariantes as pantalla } from './invariantes/pantalla.mjs';

const TODAS = [
  ['arquitectura', arquitectura],
  ['montaje', montaje],
  ['datos', datos],
  ['pantalla', pantalla],
];

const VERDE = '\x1b[32m';
const ROJO = '\x1b[31m';
const AMBAR = '\x1b[33m';
const GRIS = '\x1b[90m';
const FIN = '\x1b[0m';

async function comprobar(inv, ctx) {
  try {
    const r = await inv.comprobar(ctx);
    return Array.isArray(r) ? r : r ? [String(r)] : [];
  } catch (e) {
    return [`la comprobación reventó: ${e.message}`];
  }
}

async function auditar() {
  const ctx = await construirContexto();
  let fallos = 0;
  let total = 0;

  for (const [grupo, lista] of TODAS) {
    console.log(`\n${GRIS}── ${grupo} ${'─'.repeat(Math.max(0, 58 - grupo.length))}${FIN}`);
    for (const inv of lista) {
      total++;
      const quejas = await comprobar(inv, ctx);
      if (quejas.length) {
        fallos++;
        console.log(`${ROJO}✗${FIN} ${inv.nombre}`);
        console.log(`  ${GRIS}${inv.dice}${FIN}`);
        for (const q of quejas) console.log(`  ${ROJO}→${FIN} ${q}`);
      } else {
        console.log(`${VERDE}✓${FIN} ${inv.nombre}`);
      }
    }
  }

  console.log(
    `\n${fallos ? ROJO : VERDE}${total - fallos} de ${total} invariantes se cumplen.${FIN}`,
  );
  if (fallos) {
    console.log(
      `${GRIS}Y recuerda: cuando arregles algo, mira qué más estás afectando y arréglalo\n` +
        `todo de una vez. Un arreglo que deja otro camino roto es medio arreglo (§9).${FIN}`,
    );
  }
  return fallos === 0;
}

/**
 * El modo que comprueba las comprobaciones.
 *
 * Por cada invariante con `romper`, se sabotea el sistema de la forma que esa
 * invariante debería cazar y se exige que la cace. Una invariante que sobrevive al
 * sabotaje está midiendo el bloque de código equivocado.
 */
async function romper() {
  const base = await construirContexto();
  let sanas = 0;
  let ciegas = 0;
  let sinPrueba = 0;

  for (const [grupo, lista] of TODAS) {
    console.log(`\n${GRIS}── ${grupo} (rompiendo a propósito) ${'─'.repeat(Math.max(0, 34 - grupo.length))}${FIN}`);
    for (const inv of lista) {
      if (!inv.romper) {
        sinPrueba++;
        console.log(`${AMBAR}?${FIN} ${inv.nombre} ${GRIS}— sin sabotaje: no se sabe si mide algo${FIN}`);
        continue;
      }

      let roto;
      try {
        roto = inv.romper(base);
      } catch (e) {
        ciegas++;
        console.log(`${ROJO}✗${FIN} ${inv.nombre} ${GRIS}— el sabotaje no se pudo aplicar: ${e.message}${FIN}`);
        continue;
      }

      const quejas = await comprobar(inv, roto);
      if (quejas.length) {
        sanas++;
        console.log(`${VERDE}✓${FIN} ${inv.nombre} ${GRIS}— cazó el sabotaje${FIN}`);
      } else {
        ciegas++;
        console.log(`${ROJO}✗${FIN} ${inv.nombre}`);
        console.log(`  ${ROJO}→${FIN} el sistema está roto a propósito y esta invariante sigue pasando.`);
        console.log(`  ${GRIS}Está midiendo otra cosa. Arréglala antes de fiarte de ella.${FIN}`);
      }
    }
  }

  console.log(
    `\n${ciegas ? ROJO : VERDE}${sanas} invariantes demostradas${FIN}` +
      (ciegas ? `${ROJO}, ${ciegas} ciegas${FIN}` : '') +
      (sinPrueba ? `${AMBAR}, ${sinPrueba} sin sabotaje${FIN}` : ''),
  );
  return ciegas === 0;
}

const soloRomper = process.argv.includes('--romper');
const ambos = process.argv.includes('--todo');

let bien = true;
if (!soloRomper) bien = (await auditar()) && bien;
if (soloRomper || ambos) bien = (await romper()) && bien;
process.exit(bien ? 0 : 1);
