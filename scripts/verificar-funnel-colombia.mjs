// Verificación e2e del funnel COLOMBIA-ONLY contra el webhook DESPLEGADO.
// Simula una conversación completa con un lead de prueba (+9999…, no envía Twilio real)
// y valida que NINGÚN mensaje al cliente contenga Venezuela/Bs/Pago Móvil y que el
// precio sea "33.000 COP (≈ 9 USD)".
//
// La llave MUSA_INTERNAL_KEY se obtiene EN MEMORIA vía CLI (header X-Musa-Internal
// exigido para pruebas +9999 desde el fix de firma Twilio); nunca se escribe a disco.
//
// Uso: node scripts/verificar-funnel-colombia.mjs

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");
const proyecto = JSON.parse(readFileSync(join(RAIZ, ".insforge", "project.json"), "utf8"));
const HOST = proyecto.oss_host;
const IK = proyecto.api_key;
const WEBHOOK = "https://m2gnzrj8.functions.insforge.app/musa-webhook-twilio";

// --- llave interna (en memoria, sin persistir) ---
const rawKey = execSync("npx @insforge/cli secrets get MUSA_INTERNAL_KEY", {
  cwd: RAIZ, encoding: "utf8",
}).replace(/\x1b\[[0-9;]*m/g, "").trim();
const INTERNAL_KEY = rawKey.split(/\s+/).pop();
if (!INTERNAL_KEY || INTERNAL_KEY.length < 10) {
  console.error("No pude leer MUSA_INTERNAL_KEY");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = "+9999" + String(Math.floor(1000000 + Math.random() * 9000000));
let nMsg = 0;

async function enviar(body) {
  nMsg++;
  const form = new URLSearchParams({
    MessageSid: `SMverif${Date.now()}${nMsg}`,
    AccountSid: "ACverif",
    From: `whatsapp:${PHONE}`,
    To: "whatsapp:+14155238886",
    Body: body,
    ProfileName: "Camila",
    NumMedia: "0",
  });
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Musa-Internal": INTERNAL_KEY,
    },
    body: form.toString(),
    signal: AbortSignal.timeout(90000),
  });
  console.error(`>> "${body.slice(0, 50)}" -> HTTP ${res.status}`);
  if (res.status !== 200) console.error((await res.text()).slice(0, 300));
  await sleep(2500); // margen para clasificador GPT / escrituras
}

console.error(`Lead de prueba: ${PHONE}\n`);

// Conversación completa: anuncio → gate 18+ → (pregunta precio) → precio → cierre → datos → "ya pagué"
await enviar("Hola, vi su anuncio y quiero más información");
await sleep(2000);
await enviar("cuanto cuesta?");            // mensajePrecioRapido (pre-gate, S04)
await enviar("sí, tengo 25 años");         // gate 18+ → S05 precio → S06 cierre
await enviar("sí, pásame los datos");      // → S07 datos de pago → S08
await enviar("ya pagué");                  // S08 texto sin imagen

// --- leer TODO lo que Musa respondió ---
const r = await fetch(
  `${HOST}/api/database/records/musa_messages?lead_phone=eq.${encodeURIComponent(PHONE)}&direction=eq.out&order=created_at.asc&select=body,estado_funnel`,
  { headers: { Authorization: `Bearer ${IK}` } },
);
const salientes = await r.json();
if (!Array.isArray(salientes) || salientes.length === 0) {
  console.error("FALLO: el bot no respondió nada");
  process.exit(1);
}

console.error(`\n===== ${salientes.length} mensajes de Musa =====`);
for (const m of salientes) console.error(`[${m.estado_funnel}] ${(m.body || "").slice(0, 160)}\n`);

// --- aserciones COLOMBIA-ONLY ---
const PROHIBIDO = /(\bBs\b|bol[ií]var|venezuela|pago m[oó]vil|banco de venezuela|🇻🇪|\{\{precio_bs\}\}|\{\{cuentas_venezuela\}\})/i;
let fallos = 0;
const check = (nombre, ok, extra = "") => {
  if (!ok) fallos++;
  console.log(`${ok ? "✓" : "✗ FALLA"}  ${nombre}${extra ? " — " + extra : ""}`);
};

const todo = salientes.map((m) => m.body || "").join("\n---\n");
const conBs = salientes.filter((m) => PROHIBIDO.test(m.body || ""));
check("CERO menciones de Venezuela/Bs/Pago Móvil en TODOS los mensajes", conBs.length === 0,
  conBs.length ? `${conBs.length} mensaje(s): "${(conBs[0].body || "").slice(0, 100)}"` : "");
check("El precio aparece como 33.000 COP", /33\.000 COP/.test(todo));
check("El precio menciona el ancla 9 USD", /9 USD/.test(todo));
check("Datos de pago incluyen Nequi", /nequi/i.test(todo));
check("Datos de pago incluyen Bancolombia", /bancolombia/i.test(todo));
check("Datos de pago incluyen Bre-B", /bre-?b/i.test(todo));
check("Pide captura del comprobante (flujo manual activo)", /captura/i.test(todo));
check("Sin placeholders sin resolver", !/\{\{[a-z_]+\}\}/.test(todo));

console.log(fallos === 0 ? "\nE2E COLOMBIA-ONLY: TODO OK ✅" : `\nE2E: ${fallos} FALLO(S) ❌`);
console.log(`(lead de prueba ${PHONE} queda en BD para inspección)`);
process.exit(fallos === 0 ? 0 : 1);
