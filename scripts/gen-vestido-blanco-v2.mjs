// Vestido blanco de encaje CEÑIDO (bodycon, no falda suelta). Dos versiones:
//  AD     -> entallado, forrado/opaco, ad-safe (Meta/TikTok).
//  INTERNO-> entallado, encaje más translúcido/atrevido para el chat de WhatsApp, sin desnudo.
// nano-banana-pro/edit desde stills sensuales (identidad Musa, ojos verdes). 9:16 2K.
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

const KEEP = "Using the woman in the reference image, keep her EXACT same face and identity, light green eyes, long dark wavy hair, voluptuous hourglass figure with curvy hips, same confident frontal standing pose and the same night city street with warm bokeh. Hyperrealistic raw skin with visible pores and freckles, matte finish, no glossy highlight on the nose, 85mm f/1.4, warm cinematic night bokeh.";

const P_AD = `${KEEP} Change ONLY her outfit: dress her in a form-fitting WHITE lace evening gown with a tight body-hugging bodycon/mermaid silhouette that wraps her waist, hips and curves closely all the way down (NO loose or flowing skirt), a deep plunging V-neckline of intricate scalloped white lace, a fitted lace bodice over an OPAQUE nude lining, delicate thin straps with small crystal embellishments, refined floral lace appliqué and a tasteful side slit. Sleek, sensual and elegant, tasteful cleavage, FULLY CLOTHED and ad-safe (opaque lining, NOT see-through at the torso). Avoid: loose flowing ball-gown skirt, see-through fabric exposing the torso or breasts, sheer midriff, lingerie, underwear, nudity, explicit, changing the face or identity or eye color to brown, plastic skin, doll-like, waxy, beauty filter, CGI, extra limbs, text, watermark.`;

const P_INT = `${KEEP} Change ONLY her outfit: dress her in a form-fitting WHITE lace gown with a tight body-hugging bodycon silhouette that wraps her waist, hips and curves closely all the way down, a deep plunging neckline, made of delicate semi-sheer white lace with intricate floral lace appliqué tastefully placed to cover, a high slit. Glamorous sensual boudoir-editorial mood, daring and alluring yet refined, more revealing while keeping the breasts and all intimate areas fully and opaquely covered by the dense lace pattern. Avoid: full nudity, exposed nipples, exposed areola, exposed genitals, explicit or pornographic content, transparent over intimate areas, changing the face or identity or eye color to brown, plastic skin, doll-like, waxy, CGI, extra limbs, text, watermark.`;

const JOBS = [
  { id:"vblanco-ad-1",  src:"test/stills/sensual-1.png", prompt:P_AD,  seed:931001 },
  { id:"vblanco-ad-2",  src:"test/stills/sensual-3.png", prompt:P_AD,  seed:931045 },
  { id:"vblanco-int-1", src:"test/stills/sensual-3.png", prompt:P_INT, seed:932001 },
  { id:"vblanco-int-2", src:"test/stills/sensual-1.png", prompt:P_INT, seed:932045 },
];

const settled = await Promise.allSettled(JOBS.map(async j=>{
  const url = await editRetry({ prompt:j.prompt, image_urls:[objUrl(j.src)], aspect_ratio:"9:16", resolution:"2K", num_images:1, output_format:"png", safety_tolerance:4, seed:j.seed }, j.id);
  const buf = await descargar(url);
  writeFileSync(join(REV, `${j.id}.png`), buf);
  const k = await subir(`test/stills/${j.id}.png`, buf, "image/png");
  return { id:j.id, archivo:`creativos-revisar/${j.id}.png`, key:`test/stills/${j.id}.png`, url:k, mb:+(buf.length/1048576).toFixed(1) };
}));
console.log(JSON.stringify({ RESUMEN: settled.map((s,i)=> s.status==="fulfilled"?s.value:{id:JOBS[i].id,error:String(s.reason).slice(0,200)}) }, null, 2));
