// next/scripts/test-alertas.mjs — el adaptador de alertas.
//
//   node --experimental-strip-types next/scripts/test-alertas.mjs
//
// Lo que se busca: que la alerta LLEGUE. Mandar el cuerpo equivocado a Telegram
// no lanza error visible: devuelve 400 y el aviso se pierde. Y una alerta que no
// llega es peor que no tener alertas, porque crees que estás cubierto.

import { detectarFormato, prepararAlerta, revisarConfigAlerta } from "../src/monitor/alertas.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

const TG = "https://api.telegram.org/bot123456:ABC-DEF/sendMessage";
const DC = "https://discord.com/api/webhooks/123/abc";
const SLACK = "https://hooks.slack.com/services/T00/B00/xxx";
const N8N = "https://n8n.midominio.com/webhook/musa";

// ============================== detección ==============================
{
  t("detecta Telegram", detectarFormato(TG), "telegram");
  t("detecta Discord", detectarFormato(DC), "discord");
  t("detecta Discord antiguo", detectarFormato("https://discordapp.com/api/webhooks/1/a"), "discord");
  t("detecta Slack", detectarFormato(SLACK), "slack");
  t("detecta genérico", detectarFormato(N8N), "generico");
  t("url vacía: genérico", detectarFormato(""), "generico");
}

// ============================== Telegram ==============================
{
  const a = prepararAlerta(TG, "🚨 WhatsApp caído", "987654321");
  t("telegram: cuerpo con chat_id", a.cuerpo.chat_id, "987654321");
  t("telegram: usa el campo text", a.cuerpo.text, "🚨 WhatsApp caído");
  t("telegram: NO usa content", "content" in a.cuerpo, false);
  t("telegram: sin vista previa de enlaces", a.cuerpo.disable_web_page_preview, true);
  t("telegram: misma URL", a.url, TG);
}

{
  // El chat_id también puede venir en la URL: una sola variable de entorno.
  const a = prepararAlerta(TG + "?chat_id=555", "hola");
  t("telegram: chat_id desde la URL", a.cuerpo.chat_id, "555");
}

{
  // El parámetro explícito gana sobre la URL.
  const a = prepararAlerta(TG + "?chat_id=555", "hola", "999");
  t("telegram: el chat_id explícito gana", a.cuerpo.chat_id, "999");
}

{
  const largo = "x".repeat(6000);
  const a = prepararAlerta(TG, largo, "1");
  t("telegram: recorta al límite", a.cuerpo.text.length, 4000);
}

// ============================== Discord ==============================
{
  const a = prepararAlerta(DC, "🚨 WhatsApp caído");
  t("discord: usa content", a.cuerpo.content, "🚨 WhatsApp caído");
  t("discord: NO usa text", "text" in a.cuerpo, false);
  t("discord: recorta a 1900", prepararAlerta(DC, "x".repeat(5000)).cuerpo.content.length, 1900);
}

// ============================== Slack y genérico ==============================
{
  const a = prepararAlerta(SLACK, "aviso");
  t("slack: usa text", a.cuerpo.text, "aviso");
}

{
  const a = prepararAlerta(N8N, "aviso");
  t("genérico: usa text", a.cuerpo.text, "aviso");
  t("genérico: marca la fuente", a.cuerpo.fuente, "musa-monitor");
  t("genérico: lleva fecha", typeof a.cuerpo.cuando, "string");
}

// ============================== validación de la configuración ==============================
{
  t("sin URL: avisa de que no hay alertas", revisarConfigAlerta("").ok, false);
  t("sin URL: explica el motivo", revisarConfigAlerta("").motivo.includes("MUSA_ALERTA_WEBHOOK"), true);
}

{
  const r = revisarConfigAlerta(TG);
  t("telegram sin chat_id: no vale", r.ok, false);
  t("telegram sin chat_id: dice cómo arreglarlo", r.motivo.includes("chat_id"), true);
}

{
  t("telegram con chat_id en la URL: vale", revisarConfigAlerta(TG + "?chat_id=1").ok, true);
  t("telegram con chat_id aparte: vale", revisarConfigAlerta(TG, "123").ok, true);
}

{
  const r = revisarConfigAlerta("https://api.telegram.org/bot123/getMe?chat_id=1");
  t("telegram con ruta equivocada: no vale", r.ok, false);
  t("telegram ruta: dice cuál es la buena", r.motivo.includes("sendMessage"), true);
}

{
  t("slack: vale sin más", revisarConfigAlerta(SLACK).ok, true);
  t("genérico: vale sin más", revisarConfigAlerta(N8N).ok, true);
}

console.log(`alertas: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
