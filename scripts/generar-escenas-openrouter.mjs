import fs from "node:fs";
import path from "node:path";

const env = fs.readFileSync(".env.local", "utf8");
const OPENROUTER_API_KEY = (env.match(/OPENROUTER_API_KEY=([^\r\n]+)/) || [])[1]?.trim();
if (!OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY in .env.local");
  process.exit(1);
}

const project = JSON.parse(fs.readFileSync(".insforge/project.json", "utf8"));
const HOST = project.oss_host;
const IK = project.api_key;
const BUCKET = "musa-avatares";

async function uploadToInsforge(localPath, key) {
  const buf = fs.readFileSync(localPath);
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "image/jpeg" }), path.basename(localPath));
  const url = `${HOST}/api/storage/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${IK}` },
    body: fd,
  });
  if (!r.ok) {
    throw new Error(`Upload failed ${key}: ${r.status} ${await r.text()}`);
  }
  const publicUrl = `${HOST}/api/storage/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`;
  console.log(`✓ Uploaded ${localPath} -> ${publicUrl}`);
  return publicUrl;
}

const SCENES = [
  {
    id: "wan22-sc2-lipbite",
    localImg: "next/landing/assets/musa-penthouse-lipbite.jpg",
    storageKey: "creativo/musa-penthouse-lipbite.jpg",
    model: "bytedance/seedance-1-5-pro",
    duration: 7,
    resolution: "720p",
    aspect_ratio: "9:16",
    prompt:
      "The exact same young Latina woman from the first frame in a luxury high-rise penthouse at sunset. Preserve her exact facial identity, hazel-brown eyes, natural skin texture with subtle freckles, and wavy dark hair. She gently releases her playful lower-lip bite into a warm, confident, captivating smile while looking directly into the camera, blinks softly, breathes naturally, and makes a subtle, graceful shoulder and head movement as a soft breeze moves a few strands of hair. Handheld smartphone camera feel, 8k photorealistic video, natural human anatomy.",
  },
  {
    id: "wan22-sc3-allure",
    localImg: "next/landing/assets/musa-penthouse-allure.jpg",
    storageKey: "creativo/musa-penthouse-allure.jpg",
    model: "bytedance/seedance-1-5-pro",
    duration: 7,
    resolution: "720p",
    aspect_ratio: "9:16",
    prompt:
      "The exact same young Latina woman from the first frame sitting on a luxury bed in golden hour sunlight wearing a black satin corset top. Preserve her exact facial features, warm brown eyes, natural glowing skin texture with pores, and dark wavy hair. She speaks softly and naturally to the camera with a warm, alluring, genuine smile, soft natural eye blinks, calm breathing, and a gentle head tilt. 8k photorealistic cinematic video, natural human motion.",
  },
  {
    id: "wan22-sc4-penthouse",
    localImg: "next/landing/assets/musa-sensual-penthouse.jpg",
    storageKey: "creativo/musa-sensual-penthouse.jpg",
    model: "bytedance/seedance-1-5-pro",
    duration: 7,
    resolution: "720p",
    aspect_ratio: "9:16",
    prompt:
      "The exact same young Latina woman from the first frame standing by a floor-to-ceiling penthouse window at golden hour wearing a champagne silk slip dress. Preserve her exact face, eyes, and natural skin texture. She turns her shoulders slightly toward the camera, gives a warm, inviting, confident smile, blinks naturally, and breathes calmly while golden sunlight illuminates her hair. Smooth handheld camera push-in, 8k photorealistic video.",
  },
];

async function submitVideoJob(scene, imageUrl) {
  const payload = {
    model: scene.model,
    prompt: scene.prompt,
    duration: scene.duration,
    resolution: scene.resolution,
    aspect_ratio: scene.aspect_ratio,
    generate_audio: false,
    frame_images: [
      {
        type: "image_url",
        image_url: { url: imageUrl },
        frame_type: "first_frame",
      },
    ],
  };

  console.log(`Submitting ${scene.id} to OpenRouter (${scene.model})...`);
  const r = await fetch("https://openrouter.ai/api/v1/videos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await r.text();
  if (!r.ok) {
    throw new Error(`Submit ${scene.id} failed (${r.status}): ${text}`);
  }
  const job = JSON.parse(text);
  console.log(`✓ Submitted ${scene.id}: jobId=${job.id} status=${job.status}`);
  return { scene, job };
}

async function pollAndDownload({ scene, job }) {
  const pollUrl = job.polling_url || `https://openrouter.ai/api/v1/videos/${job.id}`;
  const start = Date.now();
  while (Date.now() - start < 10 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 8000));
    const r = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
    });
    const data = await r.json();
    console.log(`[${scene.id}] status=${data.status} (${Math.round((Date.now() - start) / 1000)}s)`);
    if (data.status === "completed") {
      const contentUrl =
        data.unsigned_urls?.[0] || `https://openrouter.ai/api/v1/videos/${job.id}/content?index=0`;
      const dl = await fetch(contentUrl, {
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
      });
      if (!dl.ok) {
        throw new Error(`Download failed for ${scene.id}: ${dl.status}`);
      }
      const buf = Buffer.from(await dl.arrayBuffer());
      const outPath = path.join("creativos-revisar/videos", `${scene.id}.mp4`);
      fs.writeFileSync(outPath, buf);
      console.log(
        `✓ Saved ${outPath} (${(buf.length / 1024 / 1024).toFixed(2)} MB) cost=$${data.usage?.cost || "?"}`
      );
      return outPath;
    }
    if (data.status === "failed" || data.status === "cancelled" || data.status === "expired") {
      throw new Error(`Job ${scene.id} ${data.status}: ${JSON.stringify(data.error || data)}`);
    }
  }
  throw new Error(`Timeout waiting for ${scene.id}`);
}

async function main() {
  const jobs = [];
  for (const scene of SCENES) {
    const imgUrl = await uploadToInsforge(scene.localImg, scene.storageKey);
    const submitted = await submitVideoJob(scene, imgUrl);
    jobs.push(submitted);
  }
  const results = await Promise.all(jobs.map(pollAndDownload));
  console.log("=== ALL SCENES COMPLETED ===", results);
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
