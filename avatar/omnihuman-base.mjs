// Genera el video base del avatar con fal-ai/bytedance/omnihuman (queue API)
import { writeFileSync } from "node:fs";

const falKey = process.env.FAL_KEY;
if (!falKey) {
  console.error("FALTA FAL_KEY en el entorno");
  process.exit(1);
}

const MODEL = "fal-ai/bytedance/omnihuman";
const HEADERS = {
  Authorization: `Key ${falKey}`,
  "Content-Type": "application/json",
};

const input = {
  image_url:
    "https://m2gnzrj8.us-east.insforge.app/api/storage/buckets/musa-avatares/objects/base/rostro.jpg",
  audio_url:
    "https://m2gnzrj8.us-east.insforge.app/api/storage/buckets/musa-avatares/objects/base/audio-base.mp3",
};

// 1. Encolar
const submit = await fetch(`https://queue.fal.run/${MODEL}`, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify(input),
});
const submitText = await submit.text();
if (!submit.ok) {
  console.error(`SUBMIT_FAIL status=${submit.status} body=${submitText}`);
  process.exit(2);
}
const job = JSON.parse(submitText);
console.log("ENCOLADO request_id=" + job.request_id);

const statusUrl =
  job.status_url || `https://queue.fal.run/${MODEL}/requests/${job.request_id}/status`;
const responseUrl =
  job.response_url || `https://queue.fal.run/${MODEL}/requests/${job.request_id}`;

// 2. Poll hasta COMPLETED (timeout 12 min)
const deadline = Date.now() + 12 * 60 * 1000;
let status = "";
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 10000));
  const sRes = await fetch(statusUrl + "?logs=0", { headers: HEADERS });
  const sBody = await sRes.json().catch(() => ({}));
  status = sBody.status || "";
  console.log(new Date().toISOString(), "status=" + status, sBody.queue_position ?? "");
  if (status === "COMPLETED") break;
  if (status === "FAILED" || sRes.status === 402 || sRes.status === 403) {
    console.error(`JOB_FAIL http=${sRes.status} body=${JSON.stringify(sBody)}`);
    process.exit(3);
  }
}
if (status !== "COMPLETED") {
  console.error("TIMEOUT esperando OmniHuman (12 min)");
  process.exit(4);
}

// 3. Resultado
const rRes = await fetch(responseUrl, { headers: HEADERS });
const rText = await rRes.text();
if (!rRes.ok) {
  console.error(`RESULT_FAIL status=${rRes.status} body=${rText}`);
  process.exit(5);
}
const result = JSON.parse(rText);
console.log("RESULTADO=" + JSON.stringify(result));

const videoUrl = result.video?.url || result.output?.video?.url;
if (!videoUrl) {
  console.error("SIN_VIDEO_URL en resultado");
  process.exit(6);
}

// 4. Descargar MP4
const vRes = await fetch(videoUrl);
if (!vRes.ok) {
  console.error(`DOWNLOAD_FAIL status=${vRes.status}`);
  process.exit(7);
}
const buf = Buffer.from(await vRes.arrayBuffer());
writeFileSync(new URL("./video-base.mp4", import.meta.url), buf);
console.log("OK video-base.mp4 bytes=" + buf.length);
