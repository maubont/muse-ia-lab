// next/scripts/test-servidor.mjs — prueba de integración del servidor de webhooks.
//
//   node next/scripts/test-servidor.mjs
//
// Levanta el servidor REAL en un puerto efímero y le habla por HTTP, con el
// adaptador REAL de Evolution y firmas JWT reales. Lo único falso es el `fetch`
// de salida (para no llamar a Railway) y el motor (para aislar el funnel).
//
// Lo que se demuestra aquí es lo que importa: que sin firma válida no entra nada.

import { crearServidor } from "../src/api/servidor.ts";
import { crearCanalEvolution } from "../../functions/canal/evolution.ts";

const SECRETO = "secreto-de-prueba-para-el-servidor";
const enc = new TextEncoder();
const b64u = (b) => Buffer.from(b).toString("base64url");

async function firmar(payload, secreto = SECRETO) {
  const h = b64u(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const p = b64u(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}

const jwt = () => firmar({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, app: "evolution", action: "webhook" });

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}: esperado ${JSON.stringify(esperado)}, real ${JSON.stringify(real)}`);
}

const payload = (data, event = "messages.upsert") =>
  JSON.stringify({
    event, instance: "musa", data, destination: "x",
    date_time: "2026-10-27T18:00:00Z", sender: "57300@s.whatsapp.net",
    server_url: "https://evolution.test", apikey: "api-key-de-prueba",
  });

const mensaje = (id, extra = {}) => ({
  key: { id, remoteJid: "573223565761@s.whatsapp.net", fromMe: false },
  pushName: "Juan",
  message: { conversation: "hola" },
  messageType: "conversation",
  messageTimestamp: 1700000000,
  ...extra,
});

// ---------- arranque ----------
const envios = [];
const fetchFalso = async (url, init) => {
  envios.push({ url, body: JSON.parse(init.body) });
  return new Response(JSON.stringify({ key: { id: "EVO-" + envios.length } }), {
    status: 201, headers: { "Content-Type": "application/json" },
  });
};

const motor = {
  llamadas: [],
  async procesar(m) {
    this.llamadas.push(m);
    return [{ texto: "eco: " + m.texto }];
  },
};

const canal = crearCanalEvolution({
  baseUrl: "https://evolution.test", instancia: "musa",
  apiKey: "api-key-de-prueba", jwtKey: SECRETO, fetchImpl: fetchFalso,
});

const srv = crearServidor({ canal, motor });
const puerto = await srv.escuchar(0);
const base = `http://127.0.0.1:${puerto}`;

// ---------- salud ----------
{
  const r = await fetch(`${base}/salud`);
  const j = await r.json();
  t("salud: 200", r.status, 200);
  t("salud: canal", j.canal, "evolution");
}

// ---------- rechazos (lo importante) ----------
{
  const r = await fetch(`${base}/webhook/evolution`, { method: "POST", body: payload(mensaje("A1")) });
  const j = await r.json();
  t("sin firma: 403", r.status, 403);
  t("sin firma: motivo", j.motivo, "sin_bearer");
  t("sin firma: el motor no se enteró", motor.llamadas.length, 0);
}

{
  const malo = await firmar({ exp: Math.floor(Date.now() / 1000) + 600, action: "webhook" }, "otro-secreto");
  const r = await fetch(`${base}/webhook/evolution`, {
    method: "POST", headers: { Authorization: `Bearer ${malo}` }, body: payload(mensaje("A1")),
  });
  t("firma ajena: 403", r.status, 403);
  t("firma ajena: el motor no se enteró", motor.llamadas.length, 0);
}

{
  // El `apikey` del cuerpo NO autentica: solo la firma.
  const r = await fetch(`${base}/webhook/evolution`, { method: "POST", body: payload(mensaje("A1")) });
  t("apikey en el cuerpo no basta", r.status, 403);
}

{
  const r = await fetch(`${base}/webhook/evolution`, { method: "POST", headers: { Authorization: `Bearer ${await jwt()}` }, body: "no es json" });
  t("firma válida + cuerpo basura: 400", r.status, 400);
}

// ---------- camino feliz ----------
{
  const r = await fetch(`${base}/webhook/evolution`, {
    method: "POST", headers: { Authorization: `Bearer ${await jwt()}` }, body: payload(mensaje("B1")),
  });
  const j = await r.json();
  t("válido: 200", r.status, 200);
  t("válido: procesados", j.procesados, 1);
  t("válido: el motor recibió 1", motor.llamadas.length, 1);
  t("válido: teléfono normalizado", motor.llamadas[0].telefono, "+573223565761");
  t("válido: se envió la respuesta", envios.length, 1);
  t("válido: destino del envío", envios[0].body.number, "573223565761");
  t("válido: texto enviado", envios[0].body.text, "eco: hola");
}

// ---------- idempotencia (Evolution reintenta hasta 10 veces) ----------
{
  const antes = motor.llamadas.length;
  const r = await fetch(`${base}/webhook/evolution`, {
    method: "POST", headers: { Authorization: `Bearer ${await jwt()}` }, body: payload(mensaje("B1")),
  });
  t("reintento: 200 igual", r.status, 200);
  t("reintento: NO se reprocesa", motor.llamadas.length, antes);
}

// ---------- lo que no es un mensaje de usuario ----------
{
  const antes = motor.llamadas.length;
  await fetch(`${base}/webhook/evolution`, {
    method: "POST", headers: { Authorization: `Bearer ${await jwt()}` },
    body: payload(mensaje("C1", { key: { id: "C1", remoteJid: "123-456@g.us", fromMe: false } })),
  });
  await fetch(`${base}/webhook/evolution`, {
    method: "POST", headers: { Authorization: `Bearer ${await jwt()}` },
    body: payload(mensaje("C2", { key: { id: "C2", remoteJid: "573223565761@s.whatsapp.net", fromMe: true } })),
  });
  await fetch(`${base}/webhook/evolution`, {
    method: "POST", headers: { Authorization: `Bearer ${await jwt()}` }, body: payload(mensaje("C3"), "messages.update"),
  });
  t("grupo / eco propio / otro evento: no llegan al motor", motor.llamadas.length, antes);
}

// ---------- rutas ----------
{
  t("ruta desconocida: 404", (await fetch(`${base}/otra`)).status, 404);
  t("GET al webhook: 405", (await fetch(`${base}/webhook/evolution`)).status, 405);
}

{
  // ---- /salud/sesion: la diferencia entre «vivo» y «puede enviar» ----
  const abierto = crearServidor({ canal, motor, estadoSesion: async () => ({ estado: "open" }) });
  const pa = await abierto.escuchar(0);
  const ra = await fetch(`http://127.0.0.1:${pa}/salud/sesion`);
  const ja = await ra.json();
  t("sesión abierta: 200", ra.status, 200);
  t("sesión abierta: ok", ja.ok, true);
  t("sesión abierta: estado", ja.estado, "open");
  await abierto.cerrar();

  const caido = crearServidor({ canal, motor, estadoSesion: async () => ({ estado: "close", detalle: "conflict" }) });
  const pc = await caido.escuchar(0);
  const rc = await fetch(`http://127.0.0.1:${pc}/salud/sesion`);
  const jc = await rc.json();
  t("sesión caída: 503 (lo detecta un monitor externo)", rc.status, 503);
  t("sesión caída: ok=false", jc.ok, false);
  t("sesión caída: detalle", jc.detalle, "conflict");
  await caido.cerrar();

  const sinEstado = crearServidor({ canal, motor });
  const ps = await sinEstado.escuchar(0);
  const rs = await fetch(`http://127.0.0.1:${ps}/salud/sesion`);
  t("canal sin estado: 501", rs.status, 501);
  await sinEstado.cerrar();

  const explota = crearServidor({ canal, motor, estadoSesion: async () => { throw new Error("fetch failed"); } });
  const pe = await explota.escuchar(0);
  const re = await fetch(`http://127.0.0.1:${pe}/salud/sesion`);
  t("lectura que falla: 503", re.status, 503);
  t("lectura que falla: desconocido", (await re.json()).estado, "desconocido");
  await explota.cerrar();
}

await srv.cerrar();

// ---------- límite de cuerpo ----------
{
  const srv2 = crearServidor({ canal, motor, limiteBytes: 100 });
  const p2 = await srv2.escuchar(0);
  const r = await fetch(`http://127.0.0.1:${p2}/webhook/evolution`, {
    method: "POST", headers: { Authorization: `Bearer ${await jwt()}` }, body: payload(mensaje("D1")),
  });
  t("cuerpo por encima del límite: 413", r.status, 413);
  await srv2.cerrar();
}

console.log(`servidor: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
