// v4: el vestido EXACTO de la referencia descrito con precisión (la fusión por imagen la bloquea el filtro
// de nano-banana porque la referencia es translúcida). Silueta CLAVE: columna ceñida + falda de tul SHEER
// drapeada en DIAGONAL sobre cadera/muslo (NO A-line de novia), escote V de encaje, tirantes finos, abertura alta.
// Editado desde stills Musa (no flagged). AD=torso forrado opaco. INTERNO=encaje semi-sheer, sin desnudo.
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
async function editRetry(input,label,n=5){ let seed=input.seed; for(let i=1;i<=n;i++){ try{ const o=await falQueue("fal-ai/nano-banana-pro/edit",{...input,seed},`${label}#${i}`); const u=imgUrls(o); if(u.length) return u[0]; }catch(e){ console.error(`[${label}#${i}] ${String(e).slice(0,150)}`);} seed=(seed||100000)+137; } throw new Error(`SIN_RESULTADO ${label}`); }

const KEEP = "Using the woman in the reference image, keep her EXACT same face and identity, light green eyes, long dark wavy hair, voluptuous hourglass figure with curvy hips, the same confident standing pose and the same night city street with warm bokeh. Hyperrealistic raw skin with visible pores and freckles, matte finish, no glossy highlight on the nose, shot on 85mm f/1.4, warm cinematic night bokeh.";
const DRESS = "Change ONLY her outfit to this exact gown: a sleek FITTED floor-length COLUMN sheath in ivory-white that hugs her body from chest to ankle (NOT a poofy ball gown, NOT an A-line bridal princess dress, NOT flared), a deep plunging V neckline of fine floral lace, thin spaghetti straps with tiny crystal details at the shoulders, cinched at the waist, and a body-skimming skirt of soft white tulle wrapped and DRAPED DIAGONALLY across her hips and one thigh (asymmetric drape) with delicate lace appliqué along the drape and a HIGH thigh slit. Modern sexy red-carpet glamour.";
const ADSAFE = "For ad compliance: the lace bodice and torso are lined with OPAQUE nude fabric so the chest and midriff are NOT see-through; keep a tasteful deep neckline and cleavage; the draped skirt may be lightly sheer over the legs. Sensual but elegant and ad-safe, fully clothed. Avoid: see-through torso, exposed breasts, exposed nipples, sheer midriff, lingerie, underwear, nudity, explicit, poofy ball gown, A-line skirt, changing the face or identity, brown eyes, plastic skin, doll-like, waxy, beauty filter, CGI, text, watermark.";
const FREE = "Glamorous sensual boudoir-editorial mood, daring and alluring: the bodice is delicate semi-sheer floral lace, more revealing while the breasts and all intimate areas stay fully covered by the dense lace pattern. Avoid: full nudity, exposed nipples, exposed areola, exposed genitals, explicit pornographic content, poofy ball gown, A-line skirt, changing the face or identity, brown eyes, plastic skin, doll-like, waxy, CGI, text, watermark.";

const JOBS = [
  { id:"vbf-ad-1",  src:"test/stills/sensual-1.png", prompt:`${KEEP} ${DRESS} ${ADSAFE}`, seed:951001, st:4 },
  { id:"vbf-ad-2",  src:"test/stills/sensual-3.png", prompt:`${KEEP} ${DRESS} ${ADSAFE}`, seed:951045, st:4 },
  { id:"vbf-int-1", src:"test/stills/sensual-3.png", prompt:`${KEEP} ${DRESS} ${FREE}`,   seed:952001, st:5 },
  { id:"vbf-int-2", src:"test/stills/sensual-1.png", prompt:`${KEEP} ${DRESS} ${FREE}`,   seed:952045, st:5 },
];

const settled = await Promise.allSettled(JOBS.map(async j=>{
  const url = await editRetry({ prompt:j.prompt, image_urls:[objUrl(j.src)], aspect_ratio:"9:16", resolution:"2K", num_images:1, output_format:"png", safety_tolerance:j.st, seed:j.seed }, j.id);
  const buf = await descargar(url);
  writeFileSync(join(REV, `${j.id}.png`), buf);
  const k = await subir(`test/stills/${j.id}.png`, buf, "image/png");
  return { id:j.id, archivo:`creativos-revisar/${j.id}.png`, key:`test/stills/${j.id}.png`, url:k, mb:+(buf.length/1048576).toFixed(1) };
}));
console.log(JSON.stringify({ RESUMEN: settled.map((s,i)=> s.status==="fulfilled"?s.value:{id:JOBS[i].id,error:String(s.reason).slice(0,200)}) }, null, 2));
