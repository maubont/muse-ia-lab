// Fusión REAL de 2 imágenes: vestido/pose/fondo de la referencia del dueño + identidad Musa (master C).
// nano-banana-pro/edit con image_urls=[referencia_vestido, musa-master]. Dos versiones:
//   AD     -> torso forrado/opaco (ad-safe).
//   INTERNO-> encaje translúcido tal cual (más libre), sin desnudo.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");
const FAL_KEY = process.env.FAL_KEY; if(!FAL_KEY){ console.error("FALTA FAL_KEY"); process.exit(1); }
const proyecto = JSON.parse(readFileSync(join(RAIZ, ".insforge", "project.json"), "utf8"));
const HOST = proyecto.oss_host, IK = proyecto.api_key, BUCKET = "musa-avatares";
const REV = join(RAIZ, "creativos-revisar"); mkdirSync(REV, { recursive: true });
const objUrl = (key) => `${HOST}/api/storage/buckets/${BUCKET}/objects/${key}`;
const HFAL = { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" };
const REF_LOCAL = join(REV, "ChatGPT Image 13 jun 2026, 21_20_39.png");

async function subir(key, buf, ct){ const fd=new FormData(); fd.append("file", new Blob([buf],{type:ct}), key.split("/").pop()); const r=await fetch(objUrl(key),{method:"PUT",headers:{Authorization:`Bearer ${IK}`},body:fd}); if(!r.ok) throw new Error(`UPLOAD ${key} ${r.status}`); return objUrl(key); }
async function descargar(u){ const r=await fetch(u); if(!r.ok) throw new Error(`DL ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
async function falQueue(modelo, input, label, timeoutMs=6*60*1000){
  const submit=await fetch(`https://queue.fal.run/${modelo}`,{method:"POST",headers:HFAL,body:JSON.stringify(input)});
  const stx=await submit.text(); if(!submit.ok) throw new Error(`SUBMIT ${submit.status} ${stx.slice(0,300)}`);
  const job=JSON.parse(stx); const statusUrl=job.status_url||`https://queue.fal.run/${modelo}/requests/${job.request_id}/status`; const respUrl=job.response_url||`https://queue.fal.run/${modelo}/requests/${job.request_id}`;
  const lim=Date.now()+timeoutMs; let estado="";
  while(Date.now()<lim){ await new Promise(r=>setTimeout(r,6000)); const s=await fetch(`${statusUrl}?logs=0`,{headers:HFAL}); const sb=await s.json().catch(()=>({})); estado=sb.status||""; console.error(`[${label}] ${estado}`); if(estado==="COMPLETED")break; if(estado==="FAILED")throw new Error(`FAIL ${label} ${JSON.stringify(sb).slice(0,300)}`); }
  if(estado!=="COMPLETED") throw new Error(`TIMEOUT ${label}`);
  const rr=await fetch(respUrl,{headers:HFAL}); return JSON.parse(await rr.text());
}
const imgUrls=(o)=>(o.images||[]).map(i=>i.url).filter(Boolean);
async function editRetry(input,label,n=5){ let seed=input.seed; for(let i=1;i<=n;i++){ try{ const o=await falQueue("fal-ai/nano-banana-pro/edit",{...input,seed},`${label}#${i}`); const u=imgUrls(o); if(u.length) return u[0]; }catch(e){ console.error(`[${label}#${i}] ${String(e).slice(0,150)}`);} seed=(seed||100000)+137; } throw new Error(`SIN_RESULTADO ${label}`); }

// subir referencia + tener master
const REF_URL = await subir("test/stills/vestido-ref.png", readFileSync(REF_LOCAL), "image/png");
const MASTER_URL = objUrl("base/musa-master.png");
console.error("ref:", REF_URL);

const P_AD = "Two photos are provided. The FIRST image is the target look: keep its EXACT white lace dress, the fitted body-hugging silhouette, the standing pose, and the night city street background with warm bokeh. The SECOND image is the identity reference: make her face and identity EXACTLY match the woman in the second image - same facial structure, light green eyes, same nose, lips and jawline, long dark wavy hair. Render one hyperrealistic photo of that same woman wearing that exact fitted white lace gown. IMPORTANT for ad compliance: make the lace bodice and the midriff OPAQUE with a nude lining so the torso is NOT see-through, keep a tasteful deep neckline and cleavage; the body-skimming sheer skirt with the high thigh slit is fine. Natural skin with visible pores and freckles, matte finish, no glossy highlight on the nose, shot on 85mm f/1.4, warm cinematic night bokeh. Sensual but elegant and ad-safe, fully clothed. Avoid: see-through torso, exposed breasts, exposed nipples, sheer midriff, lingerie, underwear, nudity, explicit, changing the face or identity, brown eyes, plastic skin, doll-like, waxy, beauty filter, CGI, text, watermark.";

const P_INT = "Two photos are provided. The FIRST image is the target look: keep its EXACT white lace dress including its delicate semi-sheer lace, the fitted body-hugging silhouette, the standing pose and the night city street background. The SECOND image is the identity reference: match her face and identity exactly - light green eyes, same facial features, long dark wavy hair. Render one hyperrealistic glamorous photo of that same woman wearing that exact sheer white lace gown, sensual and daring boudoir-editorial mood; the breasts and all intimate areas remain fully covered by the dense floral lace pattern (no exposed nipples, no exposed areola, no exposed genitals, no full nudity). Natural skin with pores and freckles, matte finish, no glossy nose highlight, 85mm f/1.4, warm night bokeh. Avoid: full nudity, exposed nipples, exposed areola, exposed genitals, explicit pornographic content, changing the face or identity, brown eyes, plastic skin, doll-like, waxy, CGI, text, watermark.";

const JOBS = [
  { id:"vb-ad-fus-1",  prompt:P_AD,  seed:941001 },
  { id:"vb-ad-fus-2",  prompt:P_AD,  seed:941045 },
  { id:"vb-int-fus-1", prompt:P_INT, seed:942001 },
  { id:"vb-int-fus-2", prompt:P_INT, seed:942045 },
];

const settled = await Promise.allSettled(JOBS.map(async j=>{
  const url = await editRetry({ prompt:j.prompt, image_urls:[REF_URL, MASTER_URL], aspect_ratio:"9:16", resolution:"2K", num_images:1, output_format:"png", safety_tolerance:4, seed:j.seed }, j.id);
  const buf = await descargar(url);
  writeFileSync(join(REV, `${j.id}.png`), buf);
  const k = await subir(`test/stills/${j.id}.png`, buf, "image/png");
  return { id:j.id, archivo:`creativos-revisar/${j.id}.png`, key:`test/stills/${j.id}.png`, url:k, mb:+(buf.length/1048576).toFixed(1) };
}));
console.log(JSON.stringify({ RESUMEN: settled.map((s,i)=> s.status==="fulfilled"?s.value:{id:JOBS[i].id,error:String(s.reason).slice(0,200)}) }, null, 2));
