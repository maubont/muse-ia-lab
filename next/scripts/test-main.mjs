// next/scripts/test-main.mjs — el punto de entrada, de verdad.
//
//   node --experimental-strip-types next/scripts/test-main.mjs
//
// Arranca el servidor en el mismo proceso (puerto efímero), le habla por HTTP y
// comprueba que la cadena completa —configuración, canal, servidor— responde como
// debe. Es el ensayo que se puede hacer SIN número de WhatsApp.

import { arrancar } from "../src/main.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

const ENV = {
  EVOLUTION_URL: "https://evolution.test",
  EVOLUTION_APIKEY: "clave-de-prueba",
  EVOLUTION_INSTANCE: "musa",
  EVOLUTION_JWT_KEY: "secreto-de-firma",
  EVOLUTION_WEBHOOK_SECRET: "secreto-compartido",
};

const enc = new TextEncoder();
const b64u = (b) => Buffer.from(b).toString("base64url");

async function firmar(payload, secreto = ENV.EVOLUTION_JWT_KEY) {
  const h = b64u(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const p = b64u(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}
const jwt = () => firmar({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, app: "evolution", action: "webhook" });

const upsert = (id) => JSON.stringify({
  event: "messages.upsert",
  instance: "musa",
  data: {
    key: { id, remoteJid: "573001112233@s.whatsapp.net", fromMe: false },
    pushName: "Prueba",
    message: { conversation: "hola desde el ensayo" },
    messageTimestamp: 1700000000,
  },
});

// ---------- arranque ----------
const srv = await arrancar({ env: ENV, puerto: 0 });
const base = `http://127.0.0.1:${srv.puerto}`;

t("arranca en un puerto real", srv.puerto > 0, true);

// ---------- salud ----------
{
  const r = await fetch(`${base}/salud`);
  const j = await r.json();
  t("salud: 200", r.status, 200);
  t("salud: canal", j.canal, "evolution");
}

// ---------- rechazo sin firma ----------
{
  const r = await fetch(`${base}/webhook/evolution`, { method: "POST", body: upsert("M1") });
  t("sin firma: 403", r.status, 403);
}

// ---------- firma válida ----------
{
  const r = await fetch(`${base}/webhook/evolution`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await jwt()}` },
    body: upsert("M2"),
  });
  const j = await r.json();
  t("firma válida: 200", r.status, 200);
  t("firma válida: se procesó", j.procesados, 1);
}

// ---------- secreto compartido (el mecanismo de v2.3.7) ----------
{
  const r = await fetch(`${base}/webhook/evolution`, {
    method: "POST",
    headers: { "x-evolution-secret": ENV.EVOLUTION_WEBHOOK_SECRET },
    body: upsert("M3"),
  });
  const j = await r.json();
  t("secreto compartido: 200", r.status, 200);
  t("secreto compartido: se procesó", j.procesados, 1);
}

// ---------- dedupe ----------
{
  const r = await fetch(`${base}/webhook/evolution`, {
    method: "POST",
    headers: { "x-evolution-secret": ENV.EVOLUTION_WEBHOOK_SECRET },
    body: upsert("M3"),
  });
  const j = await r.json();
  t("reintento: 200", r.status, 200);
  t("reintento: no se reprocesa", j.procesados, 0);
}

await srv.cerrar();

// ---------- configuración incompleta: no arranca ----------
{
  let error = null;
  try {
    await arrancar({ env: { EVOLUTION_URL: "https://x.test" }, puerto: 0 });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  t("config incompleta: lanza", error !== null, true);
  t("config incompleta: nombra lo que falta", /faltan:.*EVOLUTION_APIKEY/.test(error ?? ""), true);
  t("config incompleta: no filtra valores", (error ?? "").includes("clave-de-prueba"), false);
}

console.log(`main: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
