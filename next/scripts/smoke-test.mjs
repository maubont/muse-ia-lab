// next/scripts/smoke-test.mjs — Comprobación de salud integral de producción.
//
//   node next/scripts/smoke-test.mjs

import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

const env = {};
const envPath = join(RAIZ, "next/deploy/.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
}

const SERVER_URL = "https://server-production-3709.up.railway.app";
const EVOLUTION_URL = env.EVOLUTION_URL ?? "https://evolution-production-1418.up.railway.app";
const API_KEY = env.EVOLUTION_APIKEY ?? "";

console.log("=================================================");
console.log("🔎 SMOKE TEST — ESTADO DE PRODUCCIÓN (MUSA)");
console.log("=================================================");

// 1. Salud del servidor
try {
  const r = await fetch(`${SERVER_URL}/salud`);
  const j = await r.json();
  console.log(`[1] Servidor App:       ${r.ok ? "✅ ACTIVO" : "❌ ERROR"} (uptime: ${Math.round(j.uptime_s / 3600)} h)`);
} catch (e) {
  console.log(`[1] Servidor App:       ❌ ERROR DE CONEXIÓN (${e.message})`);
}

// 2. Sesión de WhatsApp
try {
  const r = await fetch(`${SERVER_URL}/salud/sesion`);
  const j = await r.json();
  const icono = j.estado === "open" ? "✅ OPEN (CONECTADO)" : `⚠️ ${j.estado.toUpperCase()} (FALTA VINCULAR QR)`;
  console.log(`[2] Sesión WhatsApp:   ${icono}`);
} catch (e) {
  console.log(`[2] Sesión WhatsApp:   ❌ ERROR (${e.message})`);
}

// 3. Webhook en Evolution API
try {
  const r = await fetch(`${EVOLUTION_URL}/webhook/find/musa`, { headers: { apikey: API_KEY } });
  const j = await r.json();
  const correcto = j?.url === `${SERVER_URL}/webhook/evolution`;
  console.log(`[3] Webhook Evolution:  ${correcto ? "✅ CONECTADO AL SERVIDOR" : "⚠️ REVISAR DESTINO"}`);
} catch (e) {
  console.log(`[3] Webhook Evolution:  ❌ ERROR (${e.message})`);
}

// 4. Landing y legales
try {
  const r = await fetch(`${SERVER_URL}/`);
  const html = await r.text();
  const tieneNumero = html.includes("573227462629");
  console.log(`[4] Landing Web:        ${tieneNumero ? "✅ ACTIVA con número +57 322 746 2629" : "⚠️ PENDIENTE DE DESPLIEGUE"}`);
} catch (e) {
  console.log(`[4] Landing Web:        ❌ ERROR (${e.message})`);
}

console.log("=================================================\n");
