// next/scripts/test-gate-edad.mjs — el gate de edad, sin falsos «menor».
//
//   node --experimental-strip-types next/scripts/test-gate-edad.mjs
//
// Dos cosas se protegen aquí, y la segunda es tan importante como la primera:
//   1. Que un adulto que duda NO sea tratado como menor.
//   2. Que un menor REAL siga bloqueado. Relajar la protección sería peor que el bug.

import { readFileSync } from "node:fs";
import { edadDelGate, tieneSenalDeMenor, empiezaPorNegacion } from "../src/motor/gate-edad.ts";
import { clasificarEdadHeuristico, normalizar } from "../../functions/motor/guardarrailes.ts";
import { decidirS04 } from "../src/motor/s04.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

const filas = JSON.parse(readFileSync(new URL("../../seed/musa_settings.json", import.meta.url), "utf8"))
  .data.tables.musa_settings.rows;
const crudo = Object.fromEntries(filas.map((f) => [f.key, f.value]));
const CFG = {
  funnelCopy: crudo.funnel_copy, precio: crudo.precio, precioBsHoy: crudo.precio_bs_hoy,
  cuentasVe: crudo.cuentas_ve, cuentasCo: crudo.cuentas_co, entrega: crudo.entrega,
};
const LEAD = { phone: "+573001112233", nombre: "Carlos", profile_name: "Carlos", estado_funnel: "S04_GATE18" };
const ruta = (texto) => decidirS04({ lead: LEAD, cfg: CFG, body: texto, norm: normalizar(texto) });
const tipos = (e) => e.map((x) => x.tipo);
const de = (e, tipo) => e.filter((x) => x.tipo === tipo);

// ============================== el defecto, documentado ==============================
{
  t("el módulo verificado marca «no se» como menor", clasificarEdadHeuristico("no se"), "menor");
  t("también «no entiendo»", clasificarEdadHeuristico("no entiendo"), "menor");
  t("también «no, espera»", clasificarEdadHeuristico("no, espera"), "menor");
}

// ============================== la corrección ==============================
{
  const casos = ["no se", "no entiendo", "no entiendo la pregunta", "no, espera", "no me quedo claro", "nel, no se"];
  for (const c of casos) {
    t(`«${c}»: ya no es menor`, edadDelGate(normalizar(c)), null);
  }
}

// ============================== los menores REALES siguen bloqueados ==============================
{
  const menores = ["tengo 16", "tengo 15 anos", "soy menor", "menor de edad", "no tengo 18", "aun no cumplo 18", "todavia no los cumplo", "el ano que viene cumplo 18"];
  for (const m of menores) {
    t(`«${m}»: sigue siendo menor`, edadDelGate(normalizar(m)), "menor");
    t(`«${m}»: tiene señal real`, tieneSenalDeMenor(normalizar(m)), true);
  }
}

{
  // "no tengo 18" es menor de verdad, aunque empiece por "no".
  t("«no tengo 18» no se deja pasar", edadDelGate(normalizar("no tengo 18")), "menor");
}

// ============================== los mayores siguen pasando ==============================
{
  const mayores = ["tengo 25", "si tengo 25", "+18", "soy mayor de edad", "ya cumpli 18", "tengo 30"];
  for (const m of mayores) {
    t(`«${m}»: mayor`, edadDelGate(normalizar(m)), "mayor");
  }
}

// ============================== el flujo completo ==============================
{
  // Antes: "no entiendo" -> S92_MENOR, cliente perdido.
  const e = ruta("no entiendo la pregunta");
  t("S04: «no entiendo» ya NO bloquea", de(e, "estado").length, 0);
  t("S04: re-pregunta", tipos(e).includes("reask_gate"), true);
  t("S04: no marca menor", de(e, "lead").some((x) => x.patch.mayor_18 === false), false);
}

{
  const e = ruta("no se");
  t("S04: «no se» tampoco bloquea", de(e, "estado").length, 0);
  t("S04: re-pregunta", tipos(e).includes("reask_gate"), true);
}

{
  // Un menor real sí se bloquea.
  const e = ruta("tengo 16");
  t("S04: menor real -> S92", de(e, "estado")[0].nuevo, "S92_MENOR");
  t("S04: menor real -> mayor_18 false", de(e, "lead")[0].patch.mayor_18, false);
  t("S04: menor real -> evento", de(e, "evento")[0].nombre, "menor_bloqueado");
}

{
  // Un adulto que confirma sigue avanzando.
  const e = ruta("si tengo 25");
  t("S04: adulto -> S06", de(e, "estado")[0].nuevo, "S06_CIERRE");
}

{
  // "no" rotundo a la compra (no es respuesta de edad, pero tampoco un menor).
  const e = ruta("no gracias");
  t("S04: «no gracias» no se marca menor", de(e, "lead").some((x) => x.patch.mayor_18 === false), false);
}

// ============================== la negación se reconoce ==============================
{
  t("empieza por no", empiezaPorNegacion("no se"), true);
  t("empieza por nel", empiezaPorNegacion("nel"), true);
  t("no empieza por no", empiezaPorNegacion("si tengo 25"), false);
}

console.log(`gate de edad: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
