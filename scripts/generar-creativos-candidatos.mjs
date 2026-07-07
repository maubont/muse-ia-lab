// Genera IMAGENES candidatas (no video) para Musa con fal-ai/nano-banana-pro.
// 1) rostro maestro (text-to-image), 2) facebook-ad, 3) instagram-tiktok-ad, 4) respaldo (edit con rostro maestro).
// nano-banana-pro NO soporta negative_prompt -> los negativos van como clausula "Avoid:" en el prompt.
// Sube cada imagen al bucket musa-avatares en test/creativos/<uso>-N.jpg y verifica URL 200.
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
const DIR = join(RAIZ, "avatar", "creativos-candidatos");
mkdirSync(DIR, { recursive: true });

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
async function verificar(key, esperaTipo) {
  const res = await fetch(objUrl(key), { method: "GET" });
  const ct = res.headers.get("content-type") || "";
  const cl = res.headers.get("content-length") || "?";
  return { ok: res.ok, status: res.status, contentType: ct, bytes: cl, matchTipo: esperaTipo ? ct.includes(esperaTipo) : true };
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
    console.error(`[${label}] ${new Date().toISOString()} ${estado} ${sb.queue_position ?? ""}`);
    if (estado === "COMPLETED") break;
    if (estado === "FAILED" || s.status === 402 || s.status === 403) throw new Error(`JOB_FAIL ${label} http=${s.status} ${JSON.stringify(sb).slice(0,500)}`);
  }
  if (estado !== "COMPLETED") throw new Error(`TIMEOUT ${label}`);
  const rr = await fetch(respUrl, { headers: HFAL });
  const rtx = await rr.text();
  if (!rr.ok) throw new Error(`RESULT_FAIL ${label} ${rr.status} ${rtx.slice(0,400)}`);
  const out = JSON.parse(rtx);
  return { out, latencia: Math.round((Date.now() - t0) / 1000) };
}
const imgUrls = (out) => (out.images || []).map((i) => i.url).filter(Boolean);

const AVOID = "Avoid: airbrushed, plastic skin, doll-like, smooth flawless skin, glossy/shiny/oily skin, harsh specular highlight on the nose, overexposed highlights, CGI, 3D render, waxy, porcelain skin, overly symmetric face, retouched, beauty/instagram filter, uniform skin tone, no pores, mannequin, uncanny, video game character, blurry, AI look, deformed hands, extra fingers, text, watermark, logo.";
const AVOID_ADSAFE = AVOID + " No cleavage, no low-cut, no revealing clothing, no lingerie, no suggestive/sexual pose.";

const P_BASE = `Candid lifestyle photograph, photorealistic, raw unretouched photo of a 24-year-old Latina woman, long wavy chestnut-brown hair with subtly grown-out dyed roots and loose flyaway strands framing her face, warm brown almond-shaped eyes, light freckles scattered across the nose and cheeks, two small natural moles (one near the left jaw, one above the right eyebrow), full natural lips, softly defined eyebrows, oval face with slightly asymmetric features and natural human asymmetry, warm medium-tan skin. Medium shot from the chest up, she wears a simple discreet black top, relaxed shoulders, leaning slightly toward the camera in a warm welcoming way, genuine soft greeting smile, candid relaxed expression, looking directly into the camera with friendly eye contact. Blurred urban street background at golden hour, warm bokeh city lights, shallow depth of field. Natural skin texture with visible pores and detailed pore structure on the T-zone, fine vellus facial hair (peach fuzz), subtle skin imperfections, uneven skin tone with slight natural redness around the nose, realistic under-eye area, natural skin subsurface scattering, matte skin finish with NO harsh specular highlights on the nose, soft diffused warm natural light, overcast-soft key light. Shot on a Canon EOS R5, 85mm f/1.4 lens, photographic film grain, realistic ambient occlusion. ${AVOID}`;

const P_FB = `Using the woman in the reference image, preserve her exact same face and identity (same eye shape, nose, lips, freckle pattern, two natural moles, skin tone and chestnut hair color), only change the outfit, pose, framing and background as described. Candid lifestyle photograph, photorealistic, raw unretouched photo of the same 24-year-old Latina woman with long wavy chestnut-brown hair with subtly grown-out dyed roots, warm brown eyes, light freckles across nose and cheeks. Tight flattering head-and-shoulders portrait with the face as the clear focus, she wears a casual everyday cream knit sweater, relaxed natural posture, a soft genuine half-smile with a subtly surprised, intrigued expression as if she can't believe what she's seeing, candid not posed, looking just past the camera. Bright airy home interior softly blurred in the background, plants and warm daylight. Natural skin texture with visible pores, fine vellus facial hair, subtle imperfections, uneven skin tone with slight redness around the nose, realistic under-eye area, fine lines, natural skin subsurface scattering, matte skin finish, soft diffused natural window light with NO harsh specular highlights on the nose. Shot on Kodak Portra 400 film, 85mm lens, fine film grain, shallow depth of field. ${AVOID_ADSAFE}`;

const P_IG = `Using the woman in the reference image, preserve her exact same face and identity (same eye shape, nose, lips, freckle pattern, two natural moles, skin tone and chestnut hair color), only change the outfit, pose, framing and background as described. Editorial candid fashion photograph, photorealistic, raw unretouched photo of the same 24-year-old Latina woman with long wavy chestnut-brown hair with grown-out dyed roots and loose strands, warm brown eyes, light freckles across nose and cheeks. Full upper-body fashion shot, she wears a stylish well-fitted tailored blazer over a high-neck top and high-waisted trousers, modern elegant streetwear, confident attitude, one hand relaxed near her hair, chin slightly lifted, a self-assured subtle smile and direct captivating gaze into the camera, poised and magnetic but tasteful and fully clothed. Stylish blurred modern city street at blue-golden hour, soft neon and bokeh, fashion-editorial mood. Natural skin texture with visible pores, fine vellus facial hair, subtle imperfections, uneven skin tone with slight redness around the nose, realistic under-eye area, natural skin subsurface scattering, matte skin finish with NO harsh specular highlights on the nose, soft directional natural light. Shot on a Canon EOS R5, 85mm f/1.4 lens, photographic film grain, shallow depth of field. ${AVOID_ADSAFE}`;

const SEED = 778412;
const MODELO_T2I = "fal-ai/nano-banana-pro";
const MODELO_EDIT = "fal-ai/nano-banana-pro/edit";

const resultados = [];

// ---- 1. ROSTRO MAESTRO (chat-base) ----
console.error("=== 1. ROSTRO MAESTRO ===");
const r1 = await falQueue(MODELO_T2I, {
  prompt: P_BASE, aspect_ratio: "4:5", resolution: "2K", num_images: 1,
  seed: SEED, output_format: "png", safety_tolerance: 4,
}, "rostro-maestro");
const u1 = imgUrls(r1.out);
if (!u1.length) throw new Error(`SIN_IMG rostro ${JSON.stringify(r1.out).slice(0,400)}`);
const buf1 = await descargar(u1[0]);
writeFileSync(join(DIR, "chat-base-1.jpg"), buf1);
const url1 = await subir("test/creativos/chat-base-1.jpg", buf1, "image/jpeg");
const v1 = await verificar("test/creativos/chat-base-1.jpg", "image");
resultados.push({ uso: "1. CHAT-BASE rostro maestro", modelo: MODELO_T2I, key: "test/creativos/chat-base-1.jpg", url: url1, verif: v1, latencia_s: r1.latencia, prompt_resumen: "Latina 24, pecas/poros/peach-fuzz/lunares, top negro discreto, sonrisa de bienvenida, plano medio 4:5, luz dorada difusa, matte skin sin brillo de nariz, Canon 85mm film grain" });
console.log(JSON.stringify(resultados[resultados.length-1]));

// El rostro maestro queda en el bucket -> se usa como referencia para los edits.
const URL_MAESTRO = url1;

// ---- 2. FACEBOOK-AD ----
console.error("=== 2. FACEBOOK-AD ===");
const r2 = await falQueue(MODELO_EDIT, {
  prompt: P_FB, image_urls: [URL_MAESTRO], aspect_ratio: "4:5", resolution: "2K",
  num_images: 1, output_format: "png", safety_tolerance: 3,
}, "facebook-ad");
const u2 = imgUrls(r2.out);
if (!u2.length) throw new Error(`SIN_IMG facebook ${JSON.stringify(r2.out).slice(0,400)}`);
const buf2 = await descargar(u2[0]);
writeFileSync(join(DIR, "facebook-ad-1.jpg"), buf2);
const url2 = await subir("test/creativos/facebook-ad-1.jpg", buf2, "image/jpeg");
const v2 = await verificar("test/creativos/facebook-ad-1.jpg", "image");
resultados.push({ uso: "2. FACEBOOK-AD conservador", modelo: MODELO_EDIT, key: "test/creativos/facebook-ad-1.jpg", url: url2, verif: v2, latencia_s: r2.latencia, prompt_resumen: "Misma identidad (edit), suéter crema tapado, retrato hombros-cabeza foco rostro, expresion de asombro/incredulidad, interior hogar luminoso, ad-safe cuerpo cubierto, Portra 400 grain" });
console.log(JSON.stringify(resultados[resultados.length-1]));

// ---- 3. INSTAGRAM/TIKTOK-AD ----
console.error("=== 3. INSTAGRAM/TIKTOK-AD ===");
const r3 = await falQueue(MODELO_EDIT, {
  prompt: P_IG, image_urls: [URL_MAESTRO], aspect_ratio: "9:16", resolution: "2K",
  num_images: 1, output_format: "png", safety_tolerance: 3,
}, "instagram-tiktok-ad");
const u3 = imgUrls(r3.out);
if (!u3.length) throw new Error(`SIN_IMG instagram ${JSON.stringify(r3.out).slice(0,400)}`);
const buf3 = await descargar(u3[0]);
writeFileSync(join(DIR, "instagram-tiktok-ad-1.jpg"), buf3);
const url3 = await subir("test/creativos/instagram-tiktok-ad-1.jpg", buf3, "image/jpeg");
const v3 = await verificar("test/creativos/instagram-tiktok-ad-1.jpg", "image");
resultados.push({ uso: "3. INSTAGRAM/TIKTOK-AD sensual-lifestyle ad-safe", modelo: MODELO_EDIT, key: "test/creativos/instagram-tiktok-ad-1.jpg", url: url3, verif: v3, latencia_s: r3.latencia, prompt_resumen: "Misma identidad (edit), 9:16, blazer entallado sobre top cuello alto + pantalon talle alto, actitud confiada elegante VESTIDA, calle moderna blue-golden hour neon bokeh, ad-safe sin escote/insinuacion explicita, Canon 85mm grain" });
console.log(JSON.stringify(resultados[resultados.length-1]));

// ---- 4. RESPALDO (variante del rostro maestro, otra semilla, para que el dueño elija look) ----
console.error("=== 4. RESPALDO chat-base v2 ===");
const r4 = await falQueue(MODELO_T2I, {
  prompt: P_BASE, aspect_ratio: "4:5", resolution: "2K", num_images: 1,
  seed: SEED + 1, output_format: "png", safety_tolerance: 4,
}, "respaldo");
const u4 = imgUrls(r4.out);
if (!u4.length) throw new Error(`SIN_IMG respaldo ${JSON.stringify(r4.out).slice(0,400)}`);
const buf4 = await descargar(u4[0]);
writeFileSync(join(DIR, "chat-base-2.jpg"), buf4);
const url4 = await subir("test/creativos/chat-base-2.jpg", buf4, "image/jpeg");
const v4 = await verificar("test/creativos/chat-base-2.jpg", "image");
resultados.push({ uso: "4. RESPALDO chat-base (seed alterna)", modelo: MODELO_T2I, key: "test/creativos/chat-base-2.jpg", url: url4, verif: v4, latencia_s: r4.latencia, prompt_resumen: "Igual que rostro maestro pero seed 778413, variante de respaldo para elegir look" });
console.log(JSON.stringify(resultados[resultados.length-1]));

console.error("=== RESUMEN ===");
console.log(JSON.stringify({ RESUMEN: resultados }, null, 0));
