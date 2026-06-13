// Genera los 3 genéricos (veed/lipsync sobre video base v2) y 2 pruebas Kling.
// Reutiliza el video base v2 ya subido. TTS sage para todos los audios.
// Fases: --fase genericos | kling | all
// Requiere FAL_KEY y OPENAI_API_KEY.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { comprimirSiPesado } from "./lib/comprimir-video.mjs";

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
const DIR = join(RAIZ, "avatar", "generados");
mkdirSync(DIR, { recursive: true });

const TTS_VOICE = "sage";
const TTS_INSTR = "Voz femenina latina de acento neutro, joven, sensual, cariñosa y delicada, cálida y cercana, ritmo pausado e íntimo de nota de voz, profesional";
const VIDEO_BASE_URL = `${HOST}/api/storage/buckets/${BUCKET}/objects/base/video-base-v2.mp4`;

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
  return { ok: res.ok, status: res.status, contentType: ct, bytes: res.headers.get("content-length"), matchTipo: esperaTipo ? ct.includes(esperaTipo) : true };
}
async function tts(texto) {
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: TTS_VOICE, input: texto, instructions: TTS_INSTR, response_format: "mp3" }),
  });
  if (!r.ok) throw new Error(`TTS_FAIL ${r.status} ${(await r.text()).slice(0,300)}`);
  return Buffer.from(await r.arrayBuffer());
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
  return { out: JSON.parse(rtx), latencia: Math.round((Date.now() - t0) / 1000) };
}
function extraerVideoUrl(out) { return out.video?.url || out.output?.video?.url || out.videos?.[0]?.url || null; }
async function descargar(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`DOWNLOAD_FAIL ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const HDB = { Authorization: `Bearer ${IK}`, "Content-Type": "application/json" };
async function upsertCache(slug, key, proveedor) {
  await fetch(`${HOST}/api/database/records/musa_videos_cache?nombre_normalizado=eq.${encodeURIComponent(slug)}`, { method: "DELETE", headers: HDB });
  const ins = await fetch(`${HOST}/api/database/records/musa_videos_cache`, {
    method: "POST", headers: { ...HDB, Prefer: "return=representation" },
    body: JSON.stringify([{ nombre_normalizado: slug, storage_key: key, proveedor }]),
  });
  if (!ins.ok) throw new Error(`CACHE_INSERT_FAIL ${ins.status} ${(await ins.text()).slice(0,300)}`);
}

const CIERRE = "y tú vas a aprender a crear esto. Te leo en el chat.";
const GENERICOS = {
  1: `¡Hola! Soy una modelo creada cien por ciento con inteligencia artificial, ${CIERRE}`,
  2: `¡Hey! ¿Sabías que no soy una persona real? Estoy creada cien por ciento con inteligencia artificial, ${CIERRE}`,
  3: `¡Hola! Esto que estás viendo está creado cien por ciento con inteligencia artificial, ${CIERRE}`,
};

const fase = process.argv.includes("--fase") ? process.argv[process.argv.indexOf("--fase") + 1] : "all";
const resultados = [];

async function hacerVideoVeed(slug, texto) {
  const mp3 = await tts(texto);
  const audioUrl = await subir(`audios/${slug}.mp3`, mp3, "audio/mpeg");
  const { out, latencia } = await falQueue("veed/lipsync", { video_url: VIDEO_BASE_URL, audio_url: audioUrl }, 8 * 60 * 1000, slug);
  const vurl = extraerVideoUrl(out);
  if (!vurl) throw new Error(`SIN_VIDEO_URL ${slug} ${JSON.stringify(out).slice(0,300)}`);
  const mp4 = await descargar(vurl);
  writeFileSync(join(DIR, `${slug}.mp4`), mp4);
  const key = `videos/${slug}.mp4`;
  const url = await subir(key, mp4, "video/mp4");
  await upsertCache(slug, key, "veed-lipsync");
  const v = await verificar(key, "video");
  resultados.push({ paso: slug, url, bytes: mp4.length, latencia_s: latencia, verif: v });
  console.error(`[${slug}] LISTO ${mp4.length}b ${latencia}s`);
}

async function faseGenericos() {
  for (const n of [1, 2, 3]) await hacerVideoVeed(`generico-${n}`, GENERICOS[n]);
}

async function hacerKling(nombre, texto, key) {
  const mp3 = await tts(texto);
  const audioUrl = await subir(`test/audio-kling-${nombre}.mp3`, mp3, "audio/mpeg");
  const { out, latencia } = await falQueue("fal-ai/kling-video/lipsync/audio-to-video", { video_url: VIDEO_BASE_URL, audio_url: audioUrl }, 18 * 60 * 1000, `kling-${nombre}`);
  const vurl = extraerVideoUrl(out);
  if (!vurl) throw new Error(`SIN_VIDEO_URL kling-${nombre} ${JSON.stringify(out).slice(0,400)}`);
  const mp4 = await descargar(vurl);
  writeFileSync(join(DIR, `kling-${nombre}.mp4`), mp4);
  // Kling sale ~15 MB por ~12 s y rebasa el límite de WhatsApp/Twilio: comprimir
  // a <=10 MB antes de subir. (Si por algún motivo ya viene liviano, es no-op.)
  const comp = await comprimirSiPesado(mp4, { maxBytes: 10 * 1024 * 1024, etiqueta: `kling-${nombre}` });
  if (comp.comprimido) {
    writeFileSync(join(DIR, `kling-${nombre}-comprimido.mp4`), comp.buffer);
    console.error(`[kling-${nombre}] comprimido crf=${comp.crf} ${comp.bytesOriginal}b -> ${comp.bytesFinal}b dentroObjetivo=${comp.dentroObjetivo}`);
  }
  const url = await subir(key, comp.buffer, "video/mp4");
  const v = await verificar(key, "video");
  resultados.push({ paso: `kling-${nombre}`, url, bytes: comp.bytesFinal, bytesOriginal: comp.bytesOriginal, comprimido: comp.comprimido, crf: comp.crf, latencia_s: latencia, verif: v });
  console.error(`[kling-${nombre}] LISTO ${comp.bytesFinal}b ${latencia}s`);
}

async function faseKling() {
  await hacerKling("carlos", `¡Hola Carlos! Soy una modelo creada cien por ciento con inteligencia artificial, ${CIERRE}`, "test/kling-carlos.mp4");
  await hacerKling("maria", `¡Hola María! Soy una modelo creada cien por ciento con inteligencia artificial, ${CIERRE}`, "test/kling-maria.mp4");
}

if (fase === "genericos" || fase === "all") await faseGenericos();
if (fase === "kling" || fase === "all") await faseKling();
console.log(JSON.stringify({ fase, resultados }));
console.error("FASE_OK", fase);
