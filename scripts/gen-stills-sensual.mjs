// Stills fuente SENSUALES (voluptuosa, curvas, caderas, escote) ad-safe, editadas desde base/musa-master.png
// con nano-banana-pro/edit (2K, 9:16). Preservan identidad+ojos verdes+vestido verde; suben el factor sensual VESTIDA.
// El cuerpo/curvas del video i2v se heredan de estos stills (frame 0), por eso se generan aparte.
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
const MASTER_URL = objUrl("base/musa-master.png");

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

const AVOID="Avoid: nudity, lingerie, underwear, explicit, sexual content, exposed nipples, see-through, bikini, changing the face or identity, eye color change, plastic skin, doll-like, waxy, smooth poreless skin, glossy oily nose highlight, beauty filter, CGI, 3D render, deformed body, extra limbs, text, watermark.";
const COMUN = `Using the woman in the reference image, keep her EXACT same face and identity, light green eyes, long dark wavy hair and the same emerald-green V-neck dress. Editorial fashion photograph emphasizing a voluptuous hourglass figure with curvy hips and a tasteful V-neckline with cleavage, the fitted emerald dress hugging her curves. Night city street with warm neon and bokeh, cinematic mood. Hyperrealistic raw unretouched skin with visible pores and freckles, matte finish with NO glossy highlight on the nose, soft directional light, shot on 85mm f/1.4, film grain. Sensual, alluring and magnetic but tasteful, elegant and FULLY CLOTHED, not explicit.`;

const POSES = [
  { id:"sensual-1", pose:"Three-quarter body, one hand resting on her hip in a confident contrapposto that accentuates her waist-to-hip curve, chin slightly lifted, captivating direct gaze.", seed:912001 },
  { id:"sensual-2", pose:"Full body, body turned to a graceful three-quarter angle that shows her hourglass silhouette and hips, one hand near her hair, a slow sultry confident gaze into the camera.", seed:912045 },
  { id:"sensual-3", pose:"Three-quarter body, standing tall and poised with a subtle S-curve to the pose emphasizing bust and hips, alluring half-smile, elegant and powerful.", seed:912090 },
];

const settled = await Promise.allSettled(POSES.map(async p=>{
  const prompt = `${COMUN} ${p.pose} ${AVOID}`;
  const url = await editRetry({ prompt, image_urls:[MASTER_URL], aspect_ratio:"9:16", resolution:"2K", num_images:1, output_format:"png", safety_tolerance:4, seed:p.seed }, p.id);
  const buf = await descargar(url);
  const fname = `${p.id}.png`;
  writeFileSync(join(REV, fname), buf);
  const key = `test/stills/${p.id}.png`;
  const k = await subir(key, buf, "image/png");
  return { id:p.id, archivo:`creativos-revisar/${fname}`, key, url:k, mb:+(buf.length/1048576).toFixed(1) };
}));
console.log(JSON.stringify({ RESUMEN: settled.map((s,i)=> s.status==="fulfilled"?s.value:{id:POSES[i].id,error:String(s.reason).slice(0,200)}) }, null, 2));
