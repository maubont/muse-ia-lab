// Generador multi-modelo de CANDIDATOS de video con extracción de frames para evaluar deriva/identidad.
// Modelos: wan (fal-ai/wan-25-preview/image-to-video), seedance (fal-ai/bytedance/seedance/v1/pro/image-to-video),
//          omnihuman (fal-ai/bytedance/omnihuman/v1.5), kling-avatar (fal-ai/kling-video/v1/pro/ai-avatar).
// Lee los jobs de un archivo JSON (arg --jobs <ruta>) o usa ROUND inline. Por cada job:
//   genera -> descarga mp4 -> extrae frame inicial y final -> guarda en creativos-revisar/videos/cand/ -> sube a test/cand/.
// Requiere FAL_KEY. Las imágenes/audios se referencian por KEY del bucket musa-avatares.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");
const FAL_KEY = process.env.FAL_KEY; if(!FAL_KEY){ console.error("FALTA FAL_KEY"); process.exit(1); }
const proyecto = JSON.parse(readFileSync(join(RAIZ, ".insforge", "project.json"), "utf8"));
const HOST = proyecto.oss_host, IK = proyecto.api_key, BUCKET = "musa-avatares";
const OUT = join(RAIZ, "creativos-revisar", "videos", "cand"); mkdirSync(OUT, { recursive: true });
const objUrl = (key) => `${HOST}/api/storage/buckets/${BUCKET}/objects/${key}`;
const HFAL = { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" };
const cap = (s,n)=> (s && s.length>n) ? s.slice(0,n) : s;

async function ffbin(){ if(process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN; try{ const m=await import("ffmpeg-static"); if(m?.default) return m.default; }catch{} return "ffmpeg"; }
function correr(bin,args){ const r=spawnSync(bin,args,{encoding:"buffer",maxBuffer:256*1024*1024}); return { code:r.status, stderr:(r.stderr||Buffer.alloc(0)).toString("utf8") }; }
async function subir(key, buf, ct){ const fd=new FormData(); fd.append("file", new Blob([buf],{type:ct}), key.split("/").pop()); const r=await fetch(objUrl(key),{method:"PUT",headers:{Authorization:`Bearer ${IK}`},body:fd}); if(!r.ok) throw new Error(`UPLOAD ${key} ${r.status}`); return objUrl(key); }
async function descargar(u){ const r=await fetch(u); if(!r.ok) throw new Error(`DL ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
async function falQueue(modelo, input, label, timeoutMs=15*60*1000){
  const submit=await fetch(`https://queue.fal.run/${modelo}`,{method:"POST",headers:HFAL,body:JSON.stringify(input)});
  const stx=await submit.text(); if(!submit.ok) throw new Error(`SUBMIT ${modelo} ${submit.status} ${stx.slice(0,300)}`);
  const job=JSON.parse(stx); const statusUrl=job.status_url||`https://queue.fal.run/${modelo}/requests/${job.request_id}/status`; const respUrl=job.response_url||`https://queue.fal.run/${modelo}/requests/${job.request_id}`;
  const lim=Date.now()+timeoutMs; let estado="";
  while(Date.now()<lim){ await new Promise(r=>setTimeout(r,8000)); const s=await fetch(`${statusUrl}?logs=0`,{headers:HFAL}); const sb=await s.json().catch(()=>({})); estado=sb.status||""; console.error(`[${label}] ${estado}`); if(estado==="COMPLETED")break; if(estado==="FAILED"||s.status===402||s.status===403)throw new Error(`JOB_FAIL ${label} http=${s.status} ${JSON.stringify(sb).slice(0,300)}`); }
  if(estado!=="COMPLETED") throw new Error(`TIMEOUT ${label}`);
  const rr=await fetch(respUrl,{headers:HFAL}); return JSON.parse(await rr.text());
}
const videoUrl=(o)=>o.video?.url||o.output?.video?.url||o.videos?.[0]?.url||null;

function construirInput(j){
  if (j.model==="wan") return ["fal-ai/wan-25-preview/image-to-video", {
    prompt: cap(j.prompt,800), negative_prompt: cap(j.negative_prompt,500), image_url: objUrl(j.image_key),
    resolution:"1080p", duration:"5", enable_prompt_expansion:false, enable_safety_checker:true, seed:j.seed }];
  if (j.model==="seedance") return ["fal-ai/bytedance/seedance/v1/pro/image-to-video", {
    prompt: j.prompt, image_url: objUrl(j.image_key), end_image_url: objUrl(j.end_image_key||j.image_key),
    resolution:"1080p", duration:"5", aspect_ratio:"9:16", camera_fixed:true, seed:j.seed }];
  if (j.model==="omnihuman") return ["fal-ai/bytedance/omnihuman/v1.5", {
    image_url: objUrl(j.image_key), audio_url: objUrl(j.audio_key), prompt:j.prompt, resolution:"1080p", turbo_mode:false }];
  if (j.model==="kling-avatar") return ["fal-ai/kling-video/v1/pro/ai-avatar", {
    image_url: objUrl(j.image_key), audio_url: objUrl(j.audio_key), prompt:j.prompt||"." }];
  throw new Error("modelo desconocido "+j.model);
}

async function correrJob(j){
  const bin = await ffbin();
  const [modelo, input] = construirInput(j);
  const out = await falQueue(modelo, input, j.label, j.timeoutMs);
  const vurl = videoUrl(out); if(!vurl) throw new Error(`SIN_VIDEO ${j.label} ${JSON.stringify(out).slice(0,200)}`);
  const mp4 = await descargar(vurl);
  const mp4Path = join(OUT, `${j.label}.mp4`); writeFileSync(mp4Path, mp4);
  // frames inicial + final para evaluar deriva
  const f0 = join(OUT, `${j.label}_f0.png`), fE = join(OUT, `${j.label}_fE.png`);
  correr(bin, ["-y","-ss","0.1","-i",mp4Path,"-frames:v","1",f0]);
  correr(bin, ["-y","-sseof","-0.25","-i",mp4Path,"-frames:v","1",fE]);
  const url = await subir(`test/cand/${j.label}.mp4`, mp4, "video/mp4");
  return { label:j.label, model:j.model, url, mb:+(mp4.length/1048576).toFixed(2), frame0:`creativos-revisar/videos/cand/${j.label}_f0.png`, frameE:`creativos-revisar/videos/cand/${j.label}_fE.png` };
}

// ---- jobs ----
const argi = process.argv.indexOf("--jobs");
let JOBS;
if (argi>=0) { JOBS = JSON.parse(readFileSync(process.argv[argi+1], "utf8")); }
else {
  const ID_FB = "face morph, identity change, different face, different woman, deformed face, deformed eyes, eye color change, eyes turning brown, iris recolor, eye area resynthesis, blinking artifacts, color shift, color grading change, dress color change, neckline change, cleavage exposure, undressing, plastic skin, glossy oily nose highlight, oversmooth, beauty filter, waxy, doll-like, CGI, head turn, walking, pose change, expression change, fast camera move, warping, flicker, extra fingers, distorted hands";
  const P_IG = "The exact same woman from the reference image, identical face and identity, same facial geometry and proportions. Light green eyes keeping the same light green iris in every frame, long dark wavy hair, fitted emerald-green V-neck dress, photorealistic skin with visible pores and freckles, matte finish, no glossy nose highlight. Night city street, warm streetlamp bokeh, shallow depth of field, cinematic. Minimal motion only: she stays in the exact same place, same pose, same head angle and framing as the first frame; a faint breeze barely moves a few strands of hair while her face stays still and forward-facing; calm breathing; subtle confident expression; very slow micro camera push-in. Fully clothed and elegant. The eyes, iris color, features, dress and neckline stay constant and are never resynthesized.";
  const P_SEED_IG = "Same woman, preserve exact face and identity, light green eyes, long dark wavy hair, emerald-green V-neck dress, photorealistic matte skin with pores and freckles, no plastic skin. Night city street with warm bokeh. Minimal motion: face still and forward-facing, only a faint breeze in the hair, very slow camera push-in. No head turn, no pose change.";
  const P_CHAT = "Same woman as in the source photo, warm friendly greeting to camera, subtle genuine smile, gentle natural lip movement synced to the audio, soft blinks, calm breathing, head facing forward and centered. Preserve exact identity: light green eyes, long dark wavy hair, emerald-green V-neck dress, photorealistic skin with pores and freckles, matte skin, no glossy nose highlight, warm streetlight bokeh, close-up shoulders-up, fully clothed. Minimal motion: no head turns, no head tilt, no pose change.";
  JOBS = [
    { label:"ABig-cine-wan-a", model:"wan", image_key:"test/stills/still-ig.png", prompt:P_IG, negative_prompt:ID_FB, seed:778431 },
    { label:"ABig-cine-wan-b", model:"wan", image_key:"test/stills/still-ig.png", prompt:P_IG, negative_prompt:ID_FB, seed:778432 },
    { label:"ABig-cine-seedance", model:"seedance", image_key:"test/stills/still-ig.png", end_image_key:"test/stills/still-ig.png", prompt:P_SEED_IG, seed:778431 },
    { label:"ABchat-omni", model:"omnihuman", image_key:"test/videos/src-chat.jpg", audio_key:"base/audio-base-v2.mp3", prompt:P_CHAT },
    { label:"ABchat-kling", model:"kling-avatar", image_key:"test/videos/src-chat.jpg", audio_key:"base/audio-base-v2.mp3", prompt:P_CHAT },
  ];
}

const settled = await Promise.allSettled(JOBS.map(correrJob));
console.log(JSON.stringify({ RESUMEN: settled.map((s,i)=> s.status==="fulfilled"?s.value:{label:JOBS[i].label,model:JOBS[i].model,error:String(s.reason).slice(0,300)}) }, null, 2));
