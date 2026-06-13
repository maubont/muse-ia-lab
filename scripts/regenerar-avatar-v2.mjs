// Regeneración del avatar v2: cara v2-candidata-4 + voz sage latino-neutro.
// Pasos: subir rostro -> TTS audio base -> OmniHuman video base -> verificar.
// Ejecutable por fases vía --fase para controlar tiempos/timeouts.
// Requiere FAL_KEY y OPENAI_API_KEY en entorno. Lee host/api_key de project.json.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");

const FAL_KEY = process.env.FAL_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!FAL_KEY) { console.error("FALTA FAL_KEY"); process.exit(1); }
if (!OPENAI_API_KEY) { console.error("FALTA OPENAI_API_KEY"); process.exit(1); }

const proyecto = JSON.parse(readFileSync(join(RAIZ, ".insforge", "project.json"), "utf8"));
const HOST = proyecto.oss_host;
const IK = proyecto.api_key;
const BUCKET = "musa-avatares";
const DIR = join(RAIZ, "avatar");
mkdirSync(DIR, { recursive: true });

const TTS_VOICE = "sage";
const TTS_INSTR = "Voz femenina latina de acento neutro, joven, sensual, cariñosa y delicada, cálida y cercana, ritmo pausado e íntimo de nota de voz, profesional";

function objUrl(key) { return `${HOST}/api/storage/buckets/${BUCKET}/objects/${key}`; }

async function subir(key, buf, contentType) {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: contentType }), key.split("/").pop());
  const res = await fetch(objUrl(key), { method: "PUT", headers: { Authorization: `Bearer ${IK}` }, body: fd });
  const t = await res.text();
  if (!res.ok) throw new Error(`UPLOAD_FAIL ${key} ${res.status} ${t.slice(0,300)}`);
  return objUrl(key);
}

async function verificar(key, esperaTipo) {
  const res = await fetch(objUrl(key), { method: "GET" });
  const ct = res.headers.get("content-type") || "";
  const cl = res.headers.get("content-length") || "?";
  return { ok: res.ok, status: res.status, contentType: ct, bytes: cl, matchTipo: esperaTipo ? ct.includes(esperaTipo) : true };
}

async function tts(texto, outPath) {
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: TTS_VOICE, input: texto, instructions: TTS_INSTR, response_format: "mp3" }),
  });
  if (!r.ok) throw new Error(`TTS_FAIL ${r.status} ${(await r.text()).slice(0,300)}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (outPath) writeFileSync(outPath, buf);
  return buf;
}

const HFAL = { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" };

async function falQueue(modelo, input, timeoutMs, label) {
  const t0 = Date.now();
  const submit = await fetch(`https://queue.fal.run/${modelo}`, { method: "POST", headers: HFAL, body: JSON.stringify(input) });
  const stx = await submit.text();
  if (!submit.ok) throw new Error(`SUBMIT_FAIL ${modelo} ${submit.status} ${stx.slice(0,400)}`);
  const job = JSON.parse(stx);
  console.error(`[${label}] encolado ${job.request_id}`);
  const statusUrl = job.status_url || `https://queue.fal.run/${modelo}/requests/${job.request_id}/status`;
  const respUrl = job.response_url || `https://queue.fal.run/${modelo}/requests/${job.request_id}`;
  const lim = Date.now() + timeoutMs;
  let estado = "";
  while (Date.now() < lim) {
    await new Promise((r) => setTimeout(r, 8000));
    const s = await fetch(`${statusUrl}?logs=0`, { headers: HFAL });
    const sb = await s.json().catch(() => ({}));
    estado = sb.status || "";
    console.error(`[${label}] ${new Date().toISOString()} ${estado} ${sb.queue_position ?? ""}`);
    if (estado === "COMPLETED") break;
    if (estado === "FAILED" || s.status === 402 || s.status === 403) throw new Error(`JOB_FAIL ${label} http=${s.status} ${JSON.stringify(sb).slice(0,400)}`);
  }
  if (estado !== "COMPLETED") throw new Error(`TIMEOUT ${label}`);
  const rr = await fetch(respUrl, { headers: HFAL });
  const rtx = await rr.text();
  if (!rr.ok) throw new Error(`RESULT_FAIL ${label} ${rr.status} ${rtx.slice(0,400)}`);
  const out = JSON.parse(rtx);
  const latencia = Math.round((Date.now() - t0) / 1000);
  return { out, latencia };
}

function extraerVideoUrl(out) {
  return out.video?.url || out.output?.video?.url || out.videos?.[0]?.url || null;
}

async function descargar(url, outPath) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`DOWNLOAD_FAIL ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (outPath) writeFileSync(outPath, buf);
  return buf;
}

// ---------------- FASES ----------------
const fase = process.argv.includes("--fase") ? process.argv[process.argv.indexOf("--fase") + 1] : "all";

const TXT_BASE = "¡Hola! Soy una modelo creada cien por ciento con inteligencia artificial... y tú vas a aprender a crear esto. Quédate, que te va a encantar.";

async function faseRostro() {
  const img = readFileSync(join(DIR, "candidatas-v2", "v2-candidata-4.jpg"));
  const url = await subir("base/rostro-v2.jpg", img, "image/jpeg");
  const v = await verificar("base/rostro-v2.jpg", "image");
  console.log(JSON.stringify({ paso: "rostro", url, verif: v }));
}

async function faseAudio() {
  const buf = await tts(TXT_BASE, join(DIR, "audio-base-v2.mp3"));
  const url = await subir("base/audio-base-v2.mp3", buf, "audio/mpeg");
  const v = await verificar("base/audio-base-v2.mp3", "audio");
  console.log(JSON.stringify({ paso: "audio", url, bytes: buf.length, verif: v }));
}

async function faseVideoBase() {
  const { out, latencia } = await falQueue(
    "fal-ai/bytedance/omnihuman",
    { image_url: objUrl("base/rostro-v2.jpg"), audio_url: objUrl("base/audio-base-v2.mp3") },
    12 * 60 * 1000,
    "video-base",
  );
  const vurl = extraerVideoUrl(out);
  if (!vurl) throw new Error(`SIN_VIDEO_URL ${JSON.stringify(out).slice(0,400)}`);
  const buf = await descargar(vurl, join(DIR, "video-base-v2.mp4"));
  const url = await subir("base/video-base-v2.mp4", buf, "video/mp4");
  const v = await verificar("base/video-base-v2.mp4", "video");
  console.log(JSON.stringify({ paso: "video-base", url, bytes: buf.length, mb: (buf.length/1048576).toFixed(2), latencia_s: latencia, falUrl: vurl, verif: v }));
}

if (fase === "rostro" || fase === "all") await faseRostro();
if (fase === "audio" || fase === "all") await faseAudio();
if (fase === "video-base" || fase === "all") await faseVideoBase();
console.error("FASE_OK", fase);
