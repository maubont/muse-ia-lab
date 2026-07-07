// Fusión de vestuario: toma sensual-3 (identidad Musa, ojos verdes, pose frontal) y le cambia el vestido
// por un vestido BLANCO de encaje (estilo de la referencia del dueño), forrado/opaco (ad-safe).
// nano-banana-pro/edit desde test/stills/sensual-3.png, 3 candidatos, 9:16 2K.
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
const SRC_URL = objUrl("test/stills/sensual-3.png");

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
async function editRetry(input,label,n=4){ let seed=input.seed; for(let i=1;i<=n;i++){ try{ const o=await falQueue("fal-ai/nano-banana-pro/edit",{...input,seed},`${label}#${i}`); const u=imgUrls(o); if(u.length) return u[0]; }catch(e){ console.error(`[${label}#${i}] ${String(e).slice(0,150)}`);} seed=(seed||100000)+137; } throw new Error(`SIN_RESULTADO ${label}`); }

const PROMPT = "Using the woman in the reference image, keep her EXACT same face and identity, light green eyes, long dark wavy hair, voluptuous hourglass figure with curvy hips, same confident frontal standing pose and the same night city street with warm bokeh. Change ONLY her outfit: dress her in an elegant floor-length WHITE lace evening gown inspired by haute-couture lace — a deep plunging V-neckline with intricate scalloped white lace, a fitted lace bodice over an opaque nude lining, delicate thin straps with small crystal embellishments at the shoulders, and a softly draped sheer-tulle-over-lace skirt with refined floral lace appliqué and a graceful high slit. Fitted to her curves, tasteful cleavage, sensual and elegant, FULLY CLOTHED (opaque lining under the lace, NOT see-through at the torso). Hyperrealistic raw skin with visible pores and freckles, matte finish, no glossy highlight on the nose, shot on 85mm f/1.4, warm cinematic night bokeh. Avoid: see-through fabric exposing the torso or breasts, sheer revealing midriff, lingerie, underwear, nudity, explicit content, changing the face or identity, changing eye color to brown, plastic skin, doll-like, waxy, beauty filter, CGI, render, extra limbs, deformed hands, text, watermark, logo.";

const SEEDS = { "vblanco-1":913001, "vblanco-2":913045, "vblanco-3":913090 };
const settled = await Promise.allSettled(Object.entries(SEEDS).map(async ([id,seed])=>{
  const url = await editRetry({ prompt:PROMPT, image_urls:[SRC_URL], aspect_ratio:"9:16", resolution:"2K", num_images:1, output_format:"png", safety_tolerance:4, seed }, id);
  const buf = await descargar(url);
  writeFileSync(join(REV, `${id}.png`), buf);
  const k = await subir(`test/stills/${id}.png`, buf, "image/png");
  return { id, archivo:`creativos-revisar/${id}.png`, key:`test/stills/${id}.png`, url:k, mb:+(buf.length/1048576).toFixed(1) };
}));
console.log(JSON.stringify({ RESUMEN: settled.map(s=> s.status==="fulfilled"?s.value:{error:String(s.reason).slice(0,200)}) }, null, 2));
