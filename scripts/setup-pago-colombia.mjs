// setup-pago-colombia.mjs — configura el backend para "solo Colombia + Wompi":
//   1) siembra musa_settings.pago (toggle Wompi + monto + redirect)
//   2) apaga Venezuela dejándola LATENTE (cuentas_ve.provisional=true; datos conservados)
// NO toca los secrets (esos van por `npx @insforge/cli secrets add ...`, ver abajo).
//
// Uso:
//   node scripts/setup-pago-colombia.mjs                   -> dry-run (muestra qué haría)
//   node scripts/setup-pago-colombia.mjs --apply           -> aplica (proveedor MANUAL = línea base de lanzamiento)
//   node scripts/setup-pago-colombia.mjs --apply --wompi   -> aplica con Wompi activo (post-lanzamiento, requiere secrets)
//
// Pasos que NO hace este script (hazlos cuando recuperes la contraseña de Wompi):
//   # 1. Secrets (sandbox primero; rota a pub_prod_* / prod en producción):
//   npx @insforge/cli secrets add WOMPI_PUBLIC_KEY      "pub_test_REEMPLAZAR"
//   npx @insforge/cli secrets add WOMPI_INTEGRITY_SECRET "test_integrity_REEMPLAZAR"
//   npx @insforge/cli secrets add WOMPI_EVENT_SECRET    "test_events_REEMPLAZAR"
//   # 2. Desplegar la función de eventos:
//   npx @insforge/cli functions deploy musa-wompi-events --file functions/musa-wompi-events.ts
//   # 3. Registrar en el panel de Wompi (URL de eventos):
//   #    https://m2gnzrj8.functions.insforge.app/musa-wompi-events

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const proyecto = JSON.parse(readFileSync(join(__dirname, "..", ".insforge", "project.json"), "utf8"));
const HOST = proyecto.oss_host;
const IK = proyecto.api_key;
const headers = {
  Authorization: `Bearer ${IK}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

// Toggle de pago. LÍNEA BASE de lanzamiento = "manual" (captura+visión, ya validado).
// Con --wompi cambia a la pasarela (requiere los 3 secrets y la función de eventos
// desplegada). Se puede alternar en caliente re-ejecutando este script, sin redeploy.
const PAGO = {
  proveedor: process.argv.includes("--wompi") ? "wompi" : "manual",
  moneda: "COP",
  monto_cents: 3300000, // 33.000 COP
  redirect_url: "",
  fallback_manual: true,
  wompi: { checkout_base: "https://checkout.wompi.co/p/", env: "sandbox", ref_prefix: "MUSA" },
};

async function getValue(key) {
  const r = await fetch(`${HOST}/api/database/records/musa_settings?key=eq.${encodeURIComponent(key)}`, { headers });
  if (!r.ok) throw new Error(`GET ${key} ${r.status}`);
  const arr = await r.json();
  return Array.isArray(arr) && arr.length ? arr[0].value : null;
}

async function upsert(key, value) {
  const patch = await fetch(
    `${HOST}/api/database/records/musa_settings?key=eq.${encodeURIComponent(key)}`,
    { method: "PATCH", headers, body: JSON.stringify({ value }) },
  );
  const txt = await patch.text();
  if (!patch.ok) throw new Error(`PATCH ${key} ${patch.status}: ${txt.slice(0, 300)}`);
  const arr = JSON.parse(txt || "[]");
  if (Array.isArray(arr) && arr.length > 0) {
    console.log(`PATCH ${key} OK`);
    return;
  }
  const post = await fetch(`${HOST}/api/database/records/musa_settings`, {
    method: "POST",
    headers,
    body: JSON.stringify([{ key, value }]),
  });
  if (!post.ok) throw new Error(`POST ${key} ${post.status}: ${(await post.text()).slice(0, 300)}`);
  console.log(`POST ${key} OK`);
}

const apply = process.argv.includes("--apply");

console.log("musa_settings.pago =", JSON.stringify(PAGO));
console.log("cuentas_ve.provisional -> true (apagar VE; datos conservados, reactivable)");

if (!apply) {
  console.log("\n(dry-run) Nada escrito. Re-ejecuta con --apply para aplicar.");
  process.exit(0);
}

const ve = (await getValue("cuentas_ve")) ?? {};
const veNuevo = { ...ve, provisional: true };

await upsert("pago", PAGO);
await upsert("cuentas_ve", veNuevo);
console.log("\nSETUP OK (solo Colombia + Wompi sandbox). Recuerda: secrets + deploy + panel Wompi.");
