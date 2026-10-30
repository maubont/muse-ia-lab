// Prueba del deduplicador PERSISTENTE (P1-2).
// Antes el id se recordaba en un Set en memoria: al reiniciar se olvidaba y
// Evolution, que reintenta hasta 10 veces, provocaba respuestas duplicadas.
// Aquí se simula el comportamiento de Postgres (insert ... on conflict).
import { crearServidor } from "../src/api/servidor.ts";
import { crearCanalEvolution } from "../../functions/canal/evolution.ts";

const SECRETO = "secreto-de-prueba-para-el-dedupe";
const enc = new TextEncoder();
async function firmar(payload, secreto = SECRETO) {
  const h = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=+$/, "");
  const p = btoa(JSON.stringify(payload)).replace(/=+$/, "");
  const key = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${h}.${p}`));
  return `${h}.${p}.${btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

let ok = 0, fallas = 0;
const t = (e, r, x) => { if (JSON.stringify(r) === JSON.stringify(x)) ok++; else { fallas++; console.error(`FALLA ${e}: ${JSON.stringify(r)} != ${JSON.stringify(x)}`); } };

const payload = (id) => JSON.stringify({
  event: "messages.upsert", instance: "musa", destination: "x",
  data: { key: { id, remoteJid: "573223565761@s.whatsapp.net", fromMe: false }, pushName: "Ana", message: { conversation: "hola" }, messageType: "conversation", messageTimestamp: 1700000000 },
  date_time: "2026-10-27T18:00:00Z", sender: "573223565761@s.whatsapp.net", server_url: "https://evolution.test", apikey: "k",
});

let procesados = 0;
const motor = { async procesar() { procesados++; return []; } };
const canal = crearCanalEvolution({ baseUrl: "https://evolution.test", instancia: "musa", apiKey: "k", jwtKey: SECRETO, fetchImpl: async () => new Response("{}", { status: 201 }) });

// Simula la tabla: la primera inserción inserta; las demás chocan con el primary key.
const tabla = new Set();
const srv = crearServidor({
  canal, motor,
  yaProcesado: async (id) => { if (tabla.has(id)) return true; tabla.add(id); return false; },
});
const puerto = await srv.escuchar(0);
const jwt = await firmar({ exp: Math.floor(Date.now() / 1000) + 600, action: "webhook" });

const post = () => fetch(`http://127.0.0.1:${puerto}/webhook/evolution`, {
  method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: payload("WAMID-UNO"),
});

const r1 = await post();
await post();
await post();
const j1 = await r1.json();

t("el primero se procesa", procesados, 1);
t("los repetidos no", procesados, 1);

// Y con un id distinto sí procesa.
await fetch(`http://127.0.0.1:${puerto}/webhook/evolution`, {
  method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: payload("WAMID-DOS"),
});
t("un id nuevo sí se procesa", procesados, 2);

await srv.cerrar();
console.log(`dedupe persistente: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
