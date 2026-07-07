// Re-hace SOLO los 3 videos hablados (OmniHuman v1.5) que fallaron por el límite de 5MB de imagen.
// Convierte los stills PNG (2K, >5MB) a JPEG 1080-ancho (<1MB) y reusa los audios ya subidos.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { comprimirSiPesado } from "./lib/comprimir-video.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");
const FAL_KEY = process.env.FAL_KEY; if(!FAL_KEY){ console.error("FALTA FAL_KEY"); process.exit(1); }
const proyecto = JSON.parse(readFileSync(join(RAIZ, ".insforge", "project.json"), "utf8"));
const HOST = proyecto.oss_host, IK = proyecto.api_key, BUCKET = "musa-avatares";
const REV = join(RAIZ, "creativos-revisar"), OUT = join(REV, "videos"); mkdirSync(OUT,{recursive:true});
const objUrl = (key) => `${HOST}/api/storage/buckets/${BUCKET}/objects/${key}`;
const HFAL = { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" };

async function ffbin(){ if(process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN; try{ const m=await import("ffmpeg-static"); if(m?.default) return m.default; }catch{} return "ffmpeg"; }
function correr(bin,args){ const r=spawnSync(bin,args,{encoding:"buffer",maxBuffer:256*1024*1024}); return { code:r.status, error:r.error, stderr:(r.stderr||Buffer.alloc(0)).toString("utf8") }; }
async function pngToJpg(localPng, outJpg){ const bin=await ffbin(); const r=correr(bin,["-y","-i",localPng,"-vf","scale=1080:-2","-q:v","3",outJpg]); if(r.code!==0) throw new Error(`JPG_FAIL ${r.stderr.slice(-300)}`); return readFileSync(outJpg); }
async function subir(key, buf, ct){ const fd=new FormData(); fd.append("file", new Blob([buf],{type:ct}), key.split("/").pop()); const r=await fetch(objUrl(key),{method:"PUT",headers:{Authorization:`Bearer ${IK}`},body:fd}); if(!r.ok) throw new Error(`UPLOAD ${key} ${r.status}`); return objUrl(key); }
async function descargar(u){ const r=await fetch(u); if(!r.ok) throw new Error(`DL ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
async function falQueue(modelo, input, label, timeoutMs=12*60*1000){
  const submit=await fetch(`https://queue.fal.run/${modelo}`,{method:"POST",headers:HFAL,body:JSON.stringify(input)});
  const stx=await submit.text(); if(!submit.ok) throw new Error(`SUBMIT ${modelo} ${submit.status} ${stx.slice(0,300)}`);
  const job=JSON.parse(stx); const statusUrl=job.status_url||`https://queue.fal.run/${modelo}/requests/${job.request_id}/status`; const respUrl=job.response_url||`https://queue.fal.run/${modelo}/requests/${job.request_id}`;
  const lim=Date.now()+timeoutMs; let estado="";
  while(Date.now()<lim){ await new Promise(r=>setTimeout(r,8000)); const s=await fetch(`${statusUrl}?logs=0`,{headers:HFAL}); const sb=await s.json().catch(()=>({})); estado=sb.status||""; console.error(`[${label}] ${estado}`); if(estado==="COMPLETED")break; if(estado==="FAILED")throw new Error(`JOB_FAIL ${label} ${JSON.stringify(sb).slice(0,300)}`); }
  if(estado!=="COMPLETED") throw new Error(`TIMEOUT ${label}`);
  const rr=await fetch(respUrl,{headers:HFAL}); return JSON.parse(await rr.text());
}
const videoUrl=(o)=>o.video?.url||o.output?.video?.url||o.videos?.[0]?.url||null;

const jobs = [
  { label:"chat",    png:"musa-master.png".replace("musa-master","still-chat"), audio:objUrl("base/audio-base-v2.mp3"), out:"video-chat-musa.mp4", srcKey:"test/videos/src-chat.jpg" },
  { label:"fb-talk", png:"musa-master.png",  audio:objUrl("test/videos/audio-fb.mp3"), out:"ad-fb-talk.mp4", srcKey:"test/videos/src-fbtalk.jpg" },
  { label:"ig-talk", png:"still-ig.png",     audio:objUrl("test/videos/audio-ig.mp3"), out:"ad-ig-talk.mp4", srcKey:"test/videos/src-igtalk.jpg" },
];

const settled = await Promise.allSettled(jobs.map(async j=>{
  const dir=mkdtempSync(join(tmpdir(),"jpg-")); const tmpJpg=join(dir,"s.jpg");
  const jbuf = await pngToJpg(join(REV, j.png), tmpJpg); rmSync(dir,{recursive:true,force:true});
  const imgUrl = await subir(j.srcKey, jbuf, "image/jpeg");
  console.error(`[${j.label}] jpg ${(jbuf.length/1024).toFixed(0)}KB -> ${j.srcKey}`);
  const out = await falQueue("fal-ai/bytedance/omnihuman/v1.5", { image_url:imgUrl, audio_url:j.audio }, j.label);
  const vurl = videoUrl(out); if(!vurl) throw new Error(`SIN_VIDEO ${j.label} ${JSON.stringify(out).slice(0,200)}`);
  let buf = await descargar(vurl);
  const comp = await comprimirSiPesado(buf,{maxBytes:10*1024*1024,etiqueta:j.label}); buf=comp.buffer;
  writeFileSync(join(OUT, j.out), buf);
  const url = await subir(`test/videos/${j.out}`, buf, "video/mp4");
  return { label:j.label, out:j.out, url, mb:+(buf.length/1048576).toFixed(2), comprimido:comp.comprimido };
}));
console.log(JSON.stringify({ RESUMEN: settled.map((s,i)=> s.status==="fulfilled"?s.value:{label:jobs[i].label,error:String(s.reason).slice(0,300)}) }, null, 2));
