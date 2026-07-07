// FUSION del master de Musa: adopta el ENCUADRE/POSE/VESTIDO de la version de OpenAI (v Images 2.0)
// pero conserva la CALIDAD de nano-banana: 2K real + piel cruda (poros, pecas, peach fuzz, sin bombillo de nariz).
// Estrategia: nano-banana-pro/edit. Candidatos en paralelo con reintento ante 422 (filtro de contenido).
//   A,B  -> edit SOLO desde openai_v2 (re-render 2K con piel cruda), seeds distintas
//   C    -> edit DUAL [openai_v2, musa_master]: 1ra=composicion, 2da=textura de piel/identidad
//   D    -> edit DUAL invertido [musa_master, openai_v2] para contraste
// Sube fuentes y resultados al bucket musa-avatares y guarda copias en creativos-revisar/.
// Requiere FAL_KEY en entorno. Host/api_key de .insforge/project.json.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");
const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) { console.error("FALTA FAL_KEY"); process.exit(1); }

const proyecto = JSON.parse(readFileSync(join(RAIZ, ".insforge", "project.json"), "utf8"));
const HOST = proyecto.oss_host;
const IK = proyecto.api_key;
const BUCKET = "musa-avatares";
const REVDIR = join(RAIZ, "creativos-revisar");
mkdirSync(REVDIR, { recursive: true });

const objUrl = (key) => `${HOST}/api/storage/buckets/${BUCKET}/objects/${key}`;
const HFAL = { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" };

async function subir(key, buf, contentType) {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: contentType }), key.split("/").pop());
  const res = await fetch(objUrl(key), { method: "PUT", headers: { Authorization: `Bearer ${IK}` }, body: fd });
  const t = await res.text();
  if (!res.ok) throw new Error(`UPLOAD_FAIL ${key} ${res.status} ${t.slice(0,300)}`);
  return objUrl(key);
}
async function descargar(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`DOWNLOAD_FAIL ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function falQueue(modelo, input, label, timeoutMs = 6 * 60 * 1000) {
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
    await new Promise((r) => setTimeout(r, 6000));
    const s = await fetch(`${statusUrl}?logs=0`, { headers: HFAL });
    const sb = await s.json().catch(() => ({}));
    estado = sb.status || "";
    console.error(`[${label}] ${estado} ${sb.queue_position ?? ""}`);
    if (estado === "COMPLETED") break;
    if (estado === "FAILED" || s.status === 402 || s.status === 403) throw new Error(`JOB_FAIL ${label} http=${s.status} ${JSON.stringify(sb).slice(0,400)}`);
  }
  if (estado !== "COMPLETED") throw new Error(`TIMEOUT ${label}`);
  const rr = await fetch(respUrl, { headers: HFAL });
  const rtx = await rr.text();
  if (!rr.ok) throw new Error(`RESULT_FAIL ${label} ${rr.status} ${rtx.slice(0,400)}`);
  return { out: JSON.parse(rtx), latencia: Math.round((Date.now() - t0) / 1000) };
}
const imgUrls = (out) => (out.images || []).map((i) => i.url).filter(Boolean);

// reintenta ante 422/no_media_generated (filtro estocastico) subiendo la seed
async function editConReintento(input, label, maxIntentos = 4) {
  let seed = input.seed;
  for (let i = 1; i <= maxIntentos; i++) {
    try {
      const r = await falQueue("fal-ai/nano-banana-pro/edit", { ...input, seed }, `${label}#${i}`);
      const u = imgUrls(r.out);
      if (u.length) return { url: u[0], latencia: r.latencia, intento: i };
      console.error(`[${label}#${i}] SIN_IMG, reintento`);
    } catch (e) {
      console.error(`[${label}#${i}] ${String(e).slice(0,200)}`);
    }
    seed = (seed || 100000) + 137;
  }
  throw new Error(`SIN_RESULTADO ${label}`);
}

const AVOID = "Avoid: airbrushed, plastic skin, doll-like, waxy, porcelain skin, smooth flawless poreless skin, glossy/oily/shiny skin, harsh specular highlight or lightbulb shine on the nose or forehead, overexposed highlights, CGI, 3D render, beauty/instagram filter, uniform skin tone, mannequin, uncanny, video game character, changing the face structure or body shape, changing the green dress, nudity, lingerie, explicit content, text, watermark, logo.";

// Prompt SOLO-referencia (openai_v2): re-render fiel a 2K con piel cruda
const P_SOLO = `Re-render this exact photograph at higher fidelity and resolution. Keep the SAME woman with identical face and identity (same facial structure and bone structure, same striking light green eyes, same long dark wavy hair, same lips), the SAME green fitted V-neck dress with the same neckline, the SAME confident sensual pose and body shape, the SAME framing and crop, and the SAME upscale night-city street background with warm bokeh lights. Change NOTHING about the composition, pose, outfit or identity — only improve photographic realism and resolution. Hyperrealistic raw unretouched editorial photograph, ultra high resolution, natural skin texture with clearly visible pores, subtle freckles scattered across the nose and cheeks, fine vellus facial hair (peach fuzz), realistic subsurface scattering, slight natural skin imperfections and uneven skin tone, matte-to-natural skin finish with soft realistic sheen but NO harsh lightbulb specular highlight on the nose or forehead, soft diffused cinematic light. Shot on Canon EOS R5, 85mm f/1.4, shallow depth of field, fine photographic film grain, true-to-life color. Fully clothed, tasteful and elegant. ${AVOID}`;

// Prompt DUAL: 1ra imagen = composicion; 2da = textura de piel / identidad
const P_DUAL = `Combine two reference photographs of the SAME woman. Use the FIRST image as the master for composition, framing, crop, pose, body shape, the green fitted V-neck dress and neckline, and the night-city bokeh background — keep all of that exactly. Use the SECOND image as the reference for skin realism and fine identity detail. Produce one hyperrealistic raw unretouched editorial photograph at ultra high resolution of this woman: identical face and identity, striking light green eyes, long dark wavy hair, the same green V-neck dress, the same sensual confident pose and framing from the first image, against the same upscale night street with warm bokeh lights. Natural skin texture with clearly visible pores, subtle freckles across the nose and cheeks, fine vellus facial hair (peach fuzz), realistic subsurface scattering, slight imperfections and uneven skin tone, matte-to-natural finish with soft realistic sheen but NO harsh lightbulb specular highlight on the nose or forehead, soft diffused cinematic light. Shot on Canon EOS R5, 85mm f/1.4, shallow depth of field, fine film grain. Fully clothed, tasteful and elegant. ${AVOID}`;

// --- subir las dos fuentes al bucket para usarlas como image_urls ---
console.error("=== Subiendo fuentes ===");
const bufOpenai = readFileSync(join(REVDIR, "v Images 2.0.png"));
const bufMaster = readFileSync(join(REVDIR, "musa-master.jpg"));
const URL_OPENAI = await subir("test/fusion/fuente-openai-v2.png", bufOpenai, "image/png");
const URL_MASTER = await subir("test/fusion/fuente-nanobanana-master.jpg", bufMaster, "image/jpeg");
console.error("openai:", URL_OPENAI);
console.error("master:", URL_MASTER);

const BASE = { aspect_ratio: "9:16", resolution: "2K", num_images: 1, output_format: "png", safety_tolerance: 4 };
const SEED = 884120;

const candidatos = [
  { id: "A", desc: "SOLO openai_v2, re-render 2K piel cruda (seed base)", input: { ...BASE, prompt: P_SOLO, image_urls: [URL_OPENAI], seed: SEED } },
  { id: "B", desc: "SOLO openai_v2, seed alterna",                         input: { ...BASE, prompt: P_SOLO, image_urls: [URL_OPENAI], seed: SEED + 50 } },
  { id: "C", desc: "DUAL [openai_v2 comp + master piel/identidad]",       input: { ...BASE, prompt: P_DUAL, image_urls: [URL_OPENAI, URL_MASTER], seed: SEED } },
  { id: "D", desc: "DUAL invertido [master + openai_v2]",                 input: { ...BASE, prompt: P_DUAL, image_urls: [URL_MASTER, URL_OPENAI], seed: SEED + 50 } },
];

console.error("=== Generando 4 candidatos en paralelo ===");
const settled = await Promise.allSettled(candidatos.map(async (c) => {
  const r = await editConReintento(c.input, `fusion-${c.id}`);
  const buf = await descargar(r.url);
  const fname = `fusion-${c.id}.png`;
  writeFileSync(join(REVDIR, fname), buf);
  const key = `test/fusion/fusion-${c.id}.png`;
  const urlBucket = await subir(key, buf, "image/png");
  return { id: c.id, desc: c.desc, archivo_local: `creativos-revisar/${fname}`, key, url: urlBucket, bytes: buf.length, intento: r.intento, latencia_s: r.latencia };
}));

const resultados = settled.map((s, i) => s.status === "fulfilled" ? s.value : { id: candidatos[i].id, error: String(s.reason).slice(0,250) });
console.error("=== RESUMEN ===");
console.log(JSON.stringify({ RESUMEN: resultados }, null, 2));
