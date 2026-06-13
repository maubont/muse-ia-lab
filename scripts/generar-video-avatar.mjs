// Pipeline reproducible de videos del avatar por nombre (o genéricos).
// Uso: node scripts/generar-video-avatar.mjs --nombre "Carlos"
//      node scripts/generar-video-avatar.mjs --nombre "GENERICO_1"
//
// Flujo: texto → TTS OpenAI (mp3) → sube mp3 al bucket → veed/lipsync (queue API,
// video base + audio) → descarga mp4 → sube mp4 al bucket → upsert musa_videos_cache.
// Requiere en el entorno: FAL_KEY y OPENAI_API_KEY (no se imprimen nunca).
// Lee oss_host y api_key de .insforge/project.json (raíz del proyecto).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");

function morir(codigo, msg) {
  console.error(msg);
  process.exit(codigo);
}

// ---------- argumentos ----------
const args = process.argv.slice(2);
let nombre = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--nombre") nombre = args[i + 1];
}
if (!nombre) morir(1, 'Uso: node generar-video-avatar.mjs --nombre "<Nombre|GENERICO_N>"');

// ---------- credenciales ----------
const FAL_KEY = process.env.FAL_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!FAL_KEY) morir(1, "FALTA FAL_KEY en el entorno");
if (!OPENAI_API_KEY) morir(1, "FALTA OPENAI_API_KEY en el entorno");

const proyecto = JSON.parse(readFileSync(join(RAIZ, ".insforge", "project.json"), "utf8"));
const HOST = proyecto.oss_host;
const IK = proyecto.api_key;
const BUCKET = "musa-avatares";
const VIDEO_BASE_URL = `${HOST}/api/storage/buckets/${BUCKET}/objects/base/video-base-v2.mp4`;

// ---------- slug y texto ----------
function slugificar(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CIERRE = "y tú vas a aprender a crear esto. Te leo en el chat.";
const GENERICOS = {
  1: `¡Hola! Soy una modelo creada cien por ciento con inteligencia artificial, ${CIERRE}`,
  2: `¡Hey! ¿Sabías que no soy una persona real? Estoy creada cien por ciento con inteligencia artificial, ${CIERRE}`,
  3: `¡Hola! Esto que estás viendo está creado cien por ciento con inteligencia artificial, ${CIERRE}`,
};

const matchGen = /^GENERICO[_-]?(\d+)$/i.exec(nombre.trim());
let slug, texto;
if (matchGen) {
  const n = Number(matchGen[1]);
  if (!GENERICOS[n]) morir(1, `No hay variante genérica ${n} (solo 1-3)`);
  slug = `generico-${n}`;
  texto = GENERICOS[n];
} else {
  slug = slugificar(nombre.trim());
  if (!slug) morir(1, `Nombre inválido: ${nombre}`);
  texto = `¡Hola ${nombre.trim()}! Soy una modelo creada cien por ciento con inteligencia artificial, ${CIERRE}`;
}

const DIR_LOCAL = join(RAIZ, "avatar", "generados");
mkdirSync(DIR_LOCAL, { recursive: true });

console.error(`[${slug}] texto: ${texto}`);

// ---------- helpers ----------
async function subirObjeto(key, buf, contentType) {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: contentType }), key.split("/").pop());
  const res = await fetch(`${HOST}/api/storage/buckets/${BUCKET}/objects/${key}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${IK}` },
    body: fd,
  });
  const cuerpo = await res.text();
  if (!res.ok) throw new Error(`UPLOAD_FAIL key=${key} status=${res.status} body=${cuerpo.slice(0, 300)}`);
  return `${HOST}/api/storage/buckets/${BUCKET}/objects/${key}`;
}

// ---------- (b) TTS OpenAI ----------
const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
  method: "POST",
  headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gpt-4o-mini-tts",
    voice: "sage",
    input: texto,
    instructions:
      "Voz femenina latina de acento neutro, joven, sensual, cariñosa y delicada, cálida y cercana, ritmo pausado e íntimo de nota de voz, profesional",
    response_format: "mp3",
  }),
});
if (!ttsRes.ok) morir(2, `TTS_FAIL status=${ttsRes.status} body=${(await ttsRes.text()).slice(0, 300)}`);
const mp3 = Buffer.from(await ttsRes.arrayBuffer());
writeFileSync(join(DIR_LOCAL, `${slug}.mp3`), mp3);
console.error(`[${slug}] TTS ok (${mp3.length} bytes)`);

// ---------- (c) subir mp3 ----------
const audioKey = `audios/${slug}.mp3`;
const audioUrl = await subirObjeto(audioKey, mp3, "audio/mpeg");
console.error(`[${slug}] audio subido: ${audioKey}`);

// ---------- (d) veed/lipsync queue API ----------
const MODELO = "veed/lipsync";
const HEADERS_FAL = { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" };

const submit = await fetch(`https://queue.fal.run/${MODELO}`, {
  method: "POST",
  headers: HEADERS_FAL,
  body: JSON.stringify({ video_url: VIDEO_BASE_URL, audio_url: audioUrl }),
});
const submitTxt = await submit.text();
if (!submit.ok) morir(3, `SUBMIT_FAIL status=${submit.status} body=${submitTxt.slice(0, 300)}`);
const trabajo = JSON.parse(submitTxt);
console.error(`[${slug}] encolado request_id=${trabajo.request_id}`);

const statusUrl =
  trabajo.status_url || `https://queue.fal.run/${MODELO}/requests/${trabajo.request_id}/status`;
const responseUrl =
  trabajo.response_url || `https://queue.fal.run/${MODELO}/requests/${trabajo.request_id}`;

const limite = Date.now() + 8 * 60 * 1000; // timeout 8 min
let estado = "";
while (Date.now() < limite) {
  await new Promise((r) => setTimeout(r, 10000));
  const sRes = await fetch(`${statusUrl}?logs=0`, { headers: HEADERS_FAL });
  const sBody = await sRes.json().catch(() => ({}));
  estado = sBody.status || "";
  console.error(`[${slug}] ${new Date().toISOString()} status=${estado} ${sBody.queue_position ?? ""}`);
  if (estado === "COMPLETED") break;
  if (estado === "FAILED" || sRes.status === 402 || sRes.status === 403) {
    morir(4, `JOB_FAIL http=${sRes.status} body=${JSON.stringify(sBody).slice(0, 300)}`);
  }
}
if (estado !== "COMPLETED") morir(5, `TIMEOUT esperando veed/lipsync (8 min) slug=${slug}`);

const rRes = await fetch(responseUrl, { headers: HEADERS_FAL });
const rTxt = await rRes.text();
if (!rRes.ok) morir(6, `RESULT_FAIL status=${rRes.status} body=${rTxt.slice(0, 300)}`);
const resultado = JSON.parse(rTxt);
const videoUrlFal = resultado.video?.url || resultado.output?.video?.url;
if (!videoUrlFal) morir(7, `SIN_VIDEO_URL en resultado: ${rTxt.slice(0, 300)}`);

// ---------- (e) descargar y subir mp4 ----------
const vRes = await fetch(videoUrlFal);
if (!vRes.ok) morir(8, `DOWNLOAD_FAIL status=${vRes.status}`);
const mp4 = Buffer.from(await vRes.arrayBuffer());
writeFileSync(join(DIR_LOCAL, `${slug}.mp4`), mp4);

const videoKey = `videos/${slug}.mp4`;
const videoUrl = await subirObjeto(videoKey, mp4, "video/mp4");
console.error(`[${slug}] video subido: ${videoKey} (${mp4.length} bytes)`);

// ---------- (f) upsert en musa_videos_cache ----------
const HEADERS_DB = {
  Authorization: `Bearer ${IK}`,
  "Content-Type": "application/json",
};
const del = await fetch(
  `${HOST}/api/database/records/musa_videos_cache?nombre_normalizado=eq.${encodeURIComponent(slug)}`,
  { method: "DELETE", headers: HEADERS_DB },
);
if (!del.ok && del.status !== 404) {
  morir(9, `CACHE_DELETE_FAIL status=${del.status} body=${(await del.text()).slice(0, 300)}`);
}
const ins = await fetch(`${HOST}/api/database/records/musa_videos_cache`, {
  method: "POST",
  headers: { ...HEADERS_DB, Prefer: "return=representation" },
  body: JSON.stringify([
    { nombre_normalizado: slug, storage_key: videoKey, proveedor: "veed-lipsync" },
  ]),
});
if (!ins.ok) morir(9, `CACHE_INSERT_FAIL status=${ins.status} body=${(await ins.text()).slice(0, 300)}`);
console.error(`[${slug}] cache actualizada`);

// ---------- (g) salida ----------
console.log(JSON.stringify({ slug, url: videoUrl, bytes: mp4.length }));
