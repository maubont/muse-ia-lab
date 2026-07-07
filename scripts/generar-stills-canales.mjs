// Stills por canal derivados de la MASTER C (base/musa-master.png) con nano-banana-pro/edit, 2K.
// chat = primer plano cálido para animar con OmniHuman; ig = un punto más sensual ad-safe.
// FB reutiliza la master C tal cual (no se regenera).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");
const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) { console.error("FALTA FAL_KEY"); process.exit(1); }
const proyecto = JSON.parse(readFileSync(join(RAIZ, ".insforge", "project.json"), "utf8"));
const HOST = proyecto.oss_host, IK = proyecto.api_key, BUCKET = "musa-avatares";
const REV = join(RAIZ, "creativos-revisar"); mkdirSync(REV, { recursive: true });
const objUrl = (key) => `${HOST}/api/storage/buckets/${BUCKET}/objects/${key}`;
const HFAL = { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" };
const MASTER_URL = objUrl("base/musa-master.png");

async function subir(key, buf, ct){ const fd=new FormData(); fd.append("file", new Blob([buf],{type:ct}), key.split("/").pop()); const r=await fetch(objUrl(key),{method:"PUT",headers:{Authorization:`Bearer ${IK}`},body:fd}); if(!r.ok) throw new Error(`UPLOAD ${key} ${r.status}`); return objUrl(key); }
async function descargar(u){ const r=await fetch(u); if(!r.ok) throw new Error(`DL ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
async function falQueue(modelo, input, label, timeoutMs=6*60*1000){
  const submit=await fetch(`https://queue.fal.run/${modelo}`,{method:"POST",headers:HFAL,body:JSON.stringify(input)});
  const stx=await submit.text(); if(!submit.ok) throw new Error(`SUBMIT ${submit.status} ${stx.slice(0,300)}`);
  const job=JSON.parse(stx); const statusUrl=job.status_url||`https://queue.fal.run/${modelo}/requests/${job.request_id}/status`; const respUrl=job.response_url||`https://queue.fal.run/${modelo}/requests/${job.request_id}`;
  const lim=Date.now()+timeoutMs; let estado="";
  while(Date.now()<lim){ await new Promise(r=>setTimeout(r,6000)); const s=await fetch(`${statusUrl}?logs=0`,{headers:HFAL}); const sb=await s.json().catch(()=>({})); estado=sb.status||""; console.error(`[${label}] ${estado}`); if(estado==="COMPLETED")break; if(estado==="FAILED")throw new Error(`FAIL ${label} ${JSON.stringify(sb).slice(0,300)}`);}
  if(estado!=="COMPLETED") throw new Error(`TIMEOUT ${label}`);
  const rr=await fetch(respUrl,{headers:HFAL}); const out=JSON.parse(await rr.text()); return out;
}
const imgUrls=(o)=>(o.images||[]).map(i=>i.url).filter(Boolean);
async function editRetry(input,label,n=4){ let seed=input.seed; for(let i=1;i<=n;i++){ try{ const o=await falQueue("fal-ai/nano-banana-pro/edit",{...input,seed},`${label}#${i}`); const u=imgUrls(o); if(u.length) return u[0]; }catch(e){ console.error(`[${label}#${i}] ${String(e).slice(0,150)}`);} seed=(seed||100000)+137; } throw new Error(`SIN_RESULTADO ${label}`); }

const AVOID="Avoid: airbrushed, plastic skin, doll-like, waxy, porcelain, smooth poreless skin, glossy/oily skin, harsh lightbulb specular highlight on the nose or forehead, overexposed highlights, CGI, 3D render, beauty/instagram filter, uniform skin tone, mannequin, uncanny, changing the face structure or identity or body shape, changing the green dress color, nudity, lingerie, explicit content, text, watermark, logo.";

const P_CHAT=`Using the woman in the reference image, keep her EXACT same face, identity, light green eyes, long dark wavy hair and the same green V-neck dress. Re-frame as a warm head-and-shoulders portrait (from the upper chest up, face large and clearly centered, facing the camera). She leans very slightly toward the camera with a genuine soft welcoming smile and warm friendly direct eye contact, relaxed natural mouth, as if she is about to greet someone personally and kindly. Same upscale night-city street softly blurred with warm bokeh lights behind her. Hyperrealistic raw unretouched photograph, natural skin texture with clearly visible pores, subtle freckles across nose and cheeks, fine vellus facial hair (peach fuzz), realistic subsurface scattering, slight imperfections, matte-to-natural finish with NO harsh lightbulb shine on the nose, soft diffused warm light, shot on Canon EOS R5 85mm f/1.4, fine film grain. Fully clothed, tasteful, approachable and trustworthy. ${AVOID}`;

const P_IG=`Using the woman in the reference image, keep her EXACT same face, identity, light green eyes, long dark wavy hair and the same green V-neck dress. Editorial fashion photograph, three-quarter body shot, a confident magnetic pose with subtle alluring attitude: chin slightly lifted, one hand relaxed near her hair, body turned slightly with a graceful elegant posture, captivating direct gaze into the camera, self-assured and seductive yet refined, tasteful and fully clothed. Stylish modern night-city street with warm neon and bokeh, fashion-editorial mood, cinematic. Hyperrealistic raw unretouched photograph, natural skin texture with clearly visible pores, subtle freckles across nose and cheeks, fine vellus facial hair (peach fuzz), realistic subsurface scattering, slight imperfections, matte-to-natural finish with NO harsh lightbulb shine on the nose, soft directional cinematic light, shot on Canon EOS R5 85mm f/1.4, shallow depth of field, fine film grain. Sensual but elegant, NOT explicit. ${AVOID}`;

const SEED=905311;
const jobs=[
  { id:"chat", file:"still-chat.png", key:"test/stills/still-chat.png", input:{ prompt:P_CHAT, image_urls:[MASTER_URL], aspect_ratio:"4:5", resolution:"2K", num_images:1, output_format:"png", safety_tolerance:4, seed:SEED } },
  { id:"ig",   file:"still-ig.png",   key:"test/stills/still-ig.png",   input:{ prompt:P_IG,   image_urls:[MASTER_URL], aspect_ratio:"9:16", resolution:"2K", num_images:1, output_format:"png", safety_tolerance:4, seed:SEED+11 } },
];

const settled=await Promise.allSettled(jobs.map(async j=>{
  const u=await editRetry(j.input, `still-${j.id}`);
  const buf=await descargar(u);
  writeFileSync(join(REV, j.file), buf);
  const url=await subir(j.key, buf, "image/png");
  return { id:j.id, archivo_local:`creativos-revisar/${j.file}`, key:j.key, url, mb:+(buf.length/1024/1024).toFixed(1) };
}));
console.log(JSON.stringify({ RESUMEN: settled.map((s,i)=> s.status==="fulfilled"?s.value:{id:jobs[i].id,error:String(s.reason).slice(0,200)}) }, null, 2));
