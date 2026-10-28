// next/scripts/ensayo-e2e.mjs — ensayo de punta a punta CONTRA EL SERVIDOR REAL.
//
//   $env:MUSA_URL="https://server-production-xxxx.up.railway.app"
//   $env:EVOLUTION_WEBHOOK_SECRET="<secreto>"
//   node next/scripts/ensayo-e2e.mjs
//
// Manda un webhook con la MISMA forma que envía Evolution v2.3.7, firmado, y
// comprueba el recorrido completo: firma → parseo → dedupe → motor → envío.
//
// NO manda mensajes a ningún cliente: el envío falla porque la instancia aún no
// está vinculada, y eso es justamente lo que se verifica (que falla limpio).
//
// Opcional: --jwt <secreto> para probar el otro mecanismo de firma.

const url = (process.env.MUSA_URL ?? "").replace(/\/+$/, "");
if (!url) {
  console.error("falta MUSA_URL (la URL del servidor desplegado)");
  process.exit(2);
}

const args = process.argv.slice(2);
const jwtArg = args.includes("--jwt") ? args[args.indexOf("--jwt") + 1] : null;
const secreto = process.env.EVOLUTION_WEBHOOK_SECRET ?? "";
const cabecera = process.env.EVOLUTION_WEBHOOK_HEADER ?? "x-evolution-secret";

if (!jwtArg && !secreto) {
  console.error("falta EVOLUTION_WEBHOOK_SECRET o --jwt <secreto>");
  process.exit(2);
}

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}: esperado ${JSON.stringify(esperado)}, real ${JSON.stringify(real)}`);
}

const id = "ENSAYO-" + Date.now();

/** Payload con la forma real de Evolution v2.3.7 (incluye `apikey`, como en producción). */
const payload = (messageId) => JSON.stringify({
  event: "messages.upsert",
  instance: "musa",
  data: {
    key: { id: messageId, remoteJid: "573001112233@s.whatsapp.net", fromMe: false },
    pushName: "Ensayo",
    message: { conversation: "hola desde el ensayo, sin número real" },
    messageType: "conversation",
    messageTimestamp: Math.floor(Date.now() / 1000),
  },
  destination: url + "/webhook/evolution",
  date_time: new Date().toISOString(),
  sender: "573001112233@s.whatsapp.net",
  server_url: "https://evolution-production-1418.up.railway.app",
  apikey: "no-debe-usarse-para-autenticar",
});

const cabeceras = jwtArg ? { Authorization: `Bearer ${jwtArg}` } : { [cabecera]: secreto };

const enviar = async (cuerpo, headers) => {
  const r = await fetch(`${url}/webhook/evolution`, { method: "POST", headers, body: cuerpo, signal: AbortSignal.timeout(30000) });
  const texto = await r.text();
  let j = null;
  try { j = JSON.parse(texto); } catch { j = texto; }
  return { status: r.status, cuerpo: j };
};

console.log(`ensayo contra ${url}`);

// 1. salud
{
  const r = await fetch(`${url}/salud`, { signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  t("salud: 200", r.status, 200);
  t("salud: canal", j.canal, "evolution");
}

// 2. sin firma
{
  const r = await enviar(payload(id + "-x"), {});
  t("sin firma: 403", r.status, 403);
}

// 3. firmado
{
  const r = await enviar(payload(id), cabeceras);
  t("firmado: 200", r.status, 200);
  t("firmado: procesó uno", r.cuerpo?.procesados, 1);
}

// 4. reintento del mismo id
{
  const r = await enviar(payload(id), cabeceras);
  t("reintento: 200", r.status, 200);
  t("reintento: no reprocesa", r.cuerpo?.procesados, 0);
}

// 5. evento que no es mensaje
{
  const cuerpo = JSON.parse(payload(id + "-ev"));
  cuerpo.event = "connection.update";
  const r = await enviar(JSON.stringify(cuerpo), cabeceras);
  t("otro evento: 200", r.status, 200);
  t("otro evento: cero procesados", r.cuerpo?.procesados, 0);
}

console.log(`ensayo: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
