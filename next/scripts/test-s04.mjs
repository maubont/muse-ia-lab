// next/scripts/test-s04.mjs — pruebas del gate 18+ portado.
//
//   node --experimental-strip-types next/scripts/test-s04.mjs
//
// Usa el copy REAL de producción (seed/), así que también comprueba que los
// mensajes que salen existen y se renderizan.

import { readFileSync } from "node:fs";
import {
  decidirS04,
  mensajesPrecioYCierre,
  MSG_GATE18_REASK,
  PREGUNTA_S04,
} from "../src/motor/s04.ts";

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
const cfg = {
  funnelCopy: crudo.funnel_copy,
  precio: crudo.precio ?? { usd: 2.5, cop: 9000 },
  precioBsHoy: crudo.precio_bs_hoy ?? { bs: 7400 },
  cuentasVe: crudo.cuentas_ve ?? {},
  cuentasCo: crudo.cuentas_co ?? {},
  entrega: crudo.entrega ?? {},
};

const LEAD = { phone: "+573001112233", nombre: "Carlos", profile_name: "Carlos", estado_funnel: "S04_GATE18" };
const decidir = (body, norm, clasificacion = null) =>
  decidirS04({ lead: LEAD, cfg, body, norm, clasificacion });

const tipos = (efectos) => efectos.map((e) => e.tipo);
const primero = (efectos, tipo) => efectos.filter((e) => e.tipo === tipo)[0];

// ============================== MAYOR DE EDAD ==============================

{
  const e = decidir("si tengo 25", "si tengo 25");
  t("mayor: actualiza el lead", primero(e, "lead"), { tipo: "lead", patch: { mayor_18: true } });
  t("mayor: avanza a S06", primero(e, "estado"), { tipo: "estado", nuevo: "S06_CIERRE" });
  t("mayor: envía precio y cierre", tipos(e).includes("enviar"), true);
  t("mayor: NO pasa por GPT", tipos(e).includes("gpt_responder") || tipos(e).includes("gpt_fallback"), false);

  const textos = primero(e, "enviar").textos;
  t("mayor: dos mensajes", textos.length, 2);
  t("mayor: el cierre usa el nombre", textos[1].includes("Carlos"), true);
  t("mayor: precio en COP", textos[0].includes("9.000") || textos[0].includes("33.000"), true);
  t("mayor: sin placeholders", textos.join(" ").includes("{{"), false);
  t("mayor: sin tokens internos", /\[[A-Z0-9_]{3,}/.test(textos.join(" ")), false);
}

{
  // Confirmó edad pero preguntó algo: se responde antes de cobrar.
  const e = decidir("si tengo 25, y cuánto cuesta?", "si tengo 25, y cuanto cuesta?");
  t("mayor + pregunta: evento", primero(e, "evento"), {
    tipo: "evento", nombre: "fallback_gpt",
    detalle: { etapa: "S04_GATE18", motivo: "pregunta_junto_a_confirmacion" },
  });
  t("mayor + pregunta: pasa por GPT", tipos(e).includes("gpt_responder"), true);
  t("mayor + pregunta: el GPT puede abortar", primero(e, "gpt_responder").abortar_si_escala, true);
  t("mayor + pregunta: igual envía precio", tipos(e).includes("enviar"), true);
  t("mayor + pregunta: orden", tipos(e), ["lead", "estado", "evento", "gpt_responder", "enviar"]);
}

// ============================== MENOR DE EDAD ==============================

{
  const e = decidir("tengo 16", "tengo 16");
  t("menor: marca mayor_18=false", primero(e, "lead"), { tipo: "lead", patch: { mayor_18: false } });
  t("menor: pasa a S92", primero(e, "estado"), { tipo: "estado", nuevo: "S92_MENOR" });
  t("menor: registra el bloqueo", primero(e, "evento").nombre, "menor_bloqueado");
  t("menor: NO envía precio", tipos(e).includes("gpt_responder"), false);
  t("menor: NO avanza a cierre", e.some((x) => x.tipo === "estado" && x.nuevo === "S06_CIERRE"), false);

  const enviar = primero(e, "enviar");
  t("menor: envía el mensaje de cierre suave", enviar.textos.length, 1);
  t("menor: el mensaje existe y no tiene placeholders", enviar.textos[0].includes("{{") === false && enviar.textos[0].length > 20, true);
}

{
  // El bug histórico: "el año que viene cumplo los 18" NO es mayor.
  const e = decidir("nah todavia no, el ano que viene cumplo los 18", "nah todavia no, el ano que viene cumplo los 18");
  t("bug Carlitos: se trata como menor", primero(e, "estado").nuevo, "S92_MENOR");
}

{
  // Nota de voz transcrita: edad deletreada.
  const e = decidir("tengo diecisiete", "tengo diecisiete");
  t("edad deletreada menor", primero(e, "estado").nuevo, "S92_MENOR");
}

// ============================== AMBIGÜEDAD ==============================

{
  const e = decidir("jaja ok", "jaja ok");
  t("ambiguo sin pregunta: re-pregunta", primero(e, "reask_gate"), { tipo: "reask_gate", motivo: "ambiguo_sin_pregunta" });
  t("ambiguo sin pregunta: no avanza", tipos(e).includes("estado"), false);
  t("ambiguo sin pregunta: no envía precio", tipos(e).includes("enviar"), false);
}

{
  const e = decidir("ok", "ok", { tipo: "afirmativo" });
  t("afirmativo ambiguo del GPT: re-pregunta", primero(e, "reask_gate").motivo, "afirmativo_ambiguo");
  t("afirmativo ambiguo: el gate NO se abre", tipos(e).includes("estado"), false);
}

{
  // Pregunta real sin clasificación: al GPT libre, sin abrir el gate.
  const e = decidir("y qué incluye el curso?", "y que incluye el curso?");
  t("pregunta sin clasificar: fallback", tipos(e), ["gpt_fallback"]);
}

{
  // El GPT dice "mayor" pero la heurística ya había decidido menor: manda la heurística.
  const e = decidir("tengo 16", "tengo 16", { tipo: "edad_si" });
  t("la heurística manda sobre el GPT", primero(e, "estado").nuevo, "S92_MENOR");
}

{
  // El clasificador confirma mayoría cuando la heurística no decide.
  const e = decidir("claro que si", "claro que si", { tipo: "edad_si" });
  t("GPT confirma mayoría", primero(e, "estado").nuevo, "S06_CIERRE");
}

// ============================== OBJECIÓN ==============================

{
  const e = decidir("es que me parece caro", "es que me parece caro", { tipo: "objecion", objecion_id: 2 });
  t("objeción: responde la objeción", primero(e, "responder_objecion"), { tipo: "responder_objecion", id: 2 });
  t("objeción: re-pregunta el gate", primero(e, "enviar").textos, [PREGUNTA_S04]);
  t("objeción: NO abre el gate", tipos(e).includes("estado"), false);

  const sinId = decidir("mmm", "mmm", { tipo: "objecion", objecion_id: null });
  t("objeción sin id: cae a re-pregunta", primero(sinId, "reask_gate").motivo, "ambiguo_sin_pregunta");
}

// ============================== textos ==============================

{
  const textos = mensajesPrecioYCierre(LEAD, cfg);
  t("mensajesPrecioYCierre: dos textos", textos.length, 2);
  t("mensajesPrecioYCierre: sin tokens", /\[[A-Z0-9_]{3,}/.test(textos.join(" ")), false);
  t("MSG_GATE18_REASK pide confirmación explícita", MSG_GATE18_REASK.includes("18 años"), true);
}

console.log(`s04 gate 18+: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
