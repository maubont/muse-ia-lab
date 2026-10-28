// next/scripts/test-ejecutar.mjs — el ejecutor de efectos contra un repositorio falso.
//
//   node --experimental-strip-types next/scripts/test-ejecutar.mjs
//
// Lo que se busca: que las dos reglas duras se cumplan SIEMPRE, incluso cuando el
// mundo exterior dice que no (entrega ya reclamada, referencia duplicada, GPT que
// escala a humano).

import { ejecutar } from "../src/motor/ejecutar.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

/** Repositorio falso que apunta todo lo que le piden. */
function repo(extra = {}) {
  const log = [];
  const impl = {
    log,
    async actualizarLead(phone, patch) { log.push(["lead", patch]); },
    async cambiarEstado(phone, estado) { log.push(["estado", estado]); },
    async registrarEvento(phone, nombre) { log.push(["evento", nombre]); },
    async registrarPago(phone, pago) { log.push(["pago", pago.estado, pago.motivo]); return { shortId: "4821" }; },
    async reclamarEntrega(phone) { log.push(["reclamar"]); return true; },
    async notificarOperador(texto) { log.push(["operador", texto]); },
    async enviar(phone, textos) { log.push(["enviar", textos]); },
    async gptResponder({ instruccion, abortarSiEscala }) { log.push(["gpt", abortarSiEscala]); return { escalo: false }; },
    async gptFallback() { log.push(["fallback"]); },
    async responderObjecion(phone, args) { log.push(["objecion", args]); },
    async reaskGate(phone, motivo) { log.push(["reask", motivo]); },
    ...extra,
  };
  return impl;
}

const correr = (efectos, r) => ejecutar(efectos, { repo: r, phone: "+573001112233" });

// ============================== efectos simples ==============================
{
  const r = repo();
  const res = await correr([
    { tipo: "lead", patch: { mayor_18: true } },
    { tipo: "estado", nuevo: "S06_CIERRE" },
    { tipo: "evento", nombre: "prueba", detalle: { a: 1 } },
    { tipo: "enviar", textos: ["hola"] },
  ], r);
  t("simple: cuatro ejecutados", res.ejecutados, 4);
  t("simple: actualiza lead", r.log[0], ["lead", { mayor_18: true }]);
  t("simple: cambia estado", r.log[1], ["estado", "S06_CIERRE"]);
  t("simple: registra evento", r.log[2], ["evento", "prueba"]);
  t("simple: envía", r.log[3], ["enviar", ["hola"]]);
}

{
  // `[]` = no decir nada: no se toca el canal.
  const r = repo();
  await correr([{ tipo: "enviar", textos: [] }], r);
  t("enviar vacío no llama al canal", r.log.length, 0);
}

// ============================== barrera de entrega ==============================
{
  const r = repo();
  const res = await correr([
    { tipo: "reclamar_entrega" },
    { tipo: "estado", nuevo: "S10_ENTREGA" },
    { tipo: "enviar", textos: ["tus enlaces"] },
  ], r);
  t("entrega ganada: no se omite", res.entregaOmitida, false);
  t("entrega ganada: sigue el flujo", r.log.map((x) => x[0]), ["reclamar", "estado", "enviar"]);
}

{
  // El caso peligroso: otra vía ya entregó.
  const r = repo({ async reclamarEntrega() { r.log.push(["reclamar"]); return false; } });
  const res = await correr([
    { tipo: "reclamar_entrega" },
    { tipo: "estado", nuevo: "S10_ENTREGA" },
    { tipo: "enviar", textos: ["tus enlaces"] },
  ], r);
  t("entrega perdida: se marca", res.entregaOmitida, true);
  t("entrega perdida: NO cambia estado", r.log.map((x) => x[0]).includes("estado"), false);
  t("entrega perdida: NO envía", r.log.map((x) => x[0]).includes("enviar"), false);
  t("entrega perdida: registra el motivo", r.log.find((x) => x[0] === "evento")[1], "entrega_omitida_ya_pagado");
}

// ============================== pago duplicado ==============================
{
  const r = repo({ async registrarPago() { r.log.push(["pago", "dupe"]); return { dupeRef: true }; } });
  const res = await correr([
    { tipo: "registrar_pago", estado: "aprobado", motivo: null, datos: null },
    { tipo: "evento", nombre: "pago_aprobado_auto", detalle: {} },
    { tipo: "enviar", textos: ["tus enlaces"] },
  ], r);
  t("dupe: se señala", res.dupeRef, true);
  t("dupe: NO sigue el flujo", r.log.map((x) => x[0]), ["pago"]);
  t("dupe: sin shortId", res.shortId, null);
}

{
  const r = repo();
  const res = await correr([{ tipo: "registrar_pago", estado: "revision", motivo: "x", datos: null }], r);
  t("pago ok: devuelve shortId", res.shortId, "4821");
}

// ============================== operador con id ==============================
{
  const r = repo();
  await correr([
    { tipo: "registrar_pago", estado: "revision", motivo: "estado_programada", datos: null },
    { tipo: "notificar_operador", texto: "Revisar #{{short_id}} · ok {{short_id}} / no {{short_id}}" },
  ], r);
  const texto = r.log.find((x) => x[0] === "operador")[1];
  t("operador: sustituye el id", texto.includes("4821"), true);
  t("operador: no deja placeholders", texto.includes("{{"), false);
}

{
  // Sin pago registrado no hay id: se pone "?" y no se inventa.
  const r = repo();
  await correr([{ tipo: "notificar_operador", texto: "Revisar #{{short_id}}" }], r);
  t("operador sin id: marca ?", r.log.find((x) => x[0] === "operador")[1], "Revisar #?");
}

// ============================== GPT que escala ==============================
{
  const r = repo({ async gptResponder() { r.log.push(["gpt", "escalo"]); return { escalo: true }; } });
  const res = await correr([
    { tipo: "evento", nombre: "fallback_gpt", detalle: {} },
    { tipo: "gpt_responder", instruccion: "x", abortar_si_escala: true },
    { tipo: "enviar", textos: ["precio"] },
  ], r);
  t("escalado: aborta el resto", res.abortadoPorEscalado, true);
  t("escalado: NO envía el precio", r.log.map((x) => x[0]).includes("enviar"), false);
}

{
  // Si NO escala, el flujo continúa.
  const r = repo();
  const res = await correr([
    { tipo: "gpt_responder", instruccion: "x", abortar_si_escala: true },
    { tipo: "enviar", textos: ["precio"] },
  ], r);
  t("sin escalado: sigue", res.abortadoPorEscalado, false);
  t("sin escalado: envía", r.log.map((x) => x[0]).includes("enviar"), true);
}

// ============================== otros efectos ==============================
{
  const r = repo();
  await correr([
    { tipo: "gpt_fallback" },
    { tipo: "responder_objecion", id: 3, conRecierre: true },
    { tipo: "reask_gate", motivo: "ambiguo_sin_pregunta" },
  ], r);
  t("fallback", r.log[0], ["fallback"]);
  t("objeción con recierre", r.log[1], ["objecion", { id: 3, conRecierre: true }]);
  t("reask", r.log[2], ["reask", "ambiguo_sin_pregunta"]);
}

console.log(`ejecutar: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
