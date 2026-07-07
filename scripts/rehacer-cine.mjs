// Re-hace los 2 anuncios cinemáticos con overlay AUTO-AJUSTADO al ancho (no se sale del marco).
// Guarda el RAW de Kling (sin texto) para poder retocar el overlay GRATIS después.
// Si ya existe el raw local y no se pasa --regen, NO vuelve a llamar a Kling (overlay gratis).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync, } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { comprimirSiPesado } from "./lib/comprimir-video.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");
const FAL_KEY = process.env.FAL_KEY;
const proyecto = JSON.parse(readFileSync(join(RAIZ, ".insforge", "project.json"), "utf8"));
const HOST = proyecto.oss_host, IK = proyecto.api_key, BUCKET = "musa-avatares";
const OUT = join(RAIZ, "creativos-revisar", "videos"); mkdirSync(OUT,{recursive:true});
const objUrl = (key) => `${HOST}/api/storage/buckets/${BUCKET}/objects/${key}`;
const HFAL = { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" };
const REGEN = process.argv.includes("--regen");

const URL_MASTER = objUrl("base/musa-master.png");
const URL_STILLIG = objUrl("test/stills/still-ig.png");

async function ffbin(){ if(process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN; try{ const m=await import("ffmpeg-static"); if(m?.default) return m.default; }catch{} return "ffmpeg"; }
function correr(bin,args){ const r=spawnSync(bin,args,{encoding:"buffer",maxBuffer:256*1024*1024}); return { code:r.status, error:r.error, stderr:(r.stderr||Buffer.alloc(0)).toString("utf8") }; }
// Rutas RELATIVAS al cwd (sin ':' de unidad) — el ':' de "C:/" rompe el parser de drawtext
// y cae a fontconfig (fuente serif por defecto). Copiadas en creativos-revisar/_fonts/.
const FONT_BLACK = "creativos-revisar/_fonts/ariblk.ttf";
const FONT_BOLD  = "creativos-revisar/_fonts/arialbd.ttf";
function dims(bin, path){ const r=correr(bin,["-i",path]); const m=r.stderr.match(/, (\d{2,5})x(\d{2,5})[ ,]/); if(!m) throw new Error("NO_DIMS "+r.stderr.slice(-300)); return { w:+m[1], h:+m[2] }; }

// fontsize auto-ajustado: el ancho estimado del texto cabe en MARGIN*W
const MARGIN = 0.86;
function autoFs(W,H,e){
  const desired = Math.round(H/e.div);
  if (e.align === "left") return desired; // textos cortos a la izquierda
  const factor = e.black ? 0.74 : 0.585;  // ancho medio de carácter / fontsize
  const maxByW = Math.floor((MARGIN*W) / (e.text.length * factor));
  return Math.max(Math.round(H/46), Math.min(desired, maxByW));
}
function buildVf(W,H,els){
  return els.map(e=>{
    const fs = autoFs(W,H,e);
    const y  = Math.round(H*e.yf);
    const bb = Math.max(6, Math.round(fs*0.28));
    const x  = e.align==="left" ? Math.round(W*0.045) : "(w-text_w)/2";
    const font = e.black ? FONT_BLACK : FONT_BOLD;
    const t = e.text.replace(/:/g,"\\:").replace(/'/g,"\\'");
    return `drawtext=fontfile=${font}:text='${t}':fontcolor=${e.color||"white"}:fontsize=${fs}:box=1:boxcolor=black@${e.box??0.45}:boxborderw=${bb}:x=${x}:y=${y}`;
  }).join(",");
}
async function overlay(bin, inPath, outPath, els){
  const { w, h } = dims(bin, inPath);
  const vf = buildVf(w, h, els);
  const enc = correr(bin, ["-y","-i",inPath,"-vf",vf,"-c:v","libx264","-crf","20","-preset","medium","-pix_fmt","yuv420p","-movflags","+faststart","-an",outPath]);
  if (enc.code!==0) throw new Error(`OVERLAY_FAIL ${enc.stderr.slice(-500)}`);
}

async function subir(key, buf, ct){ const fd=new FormData(); fd.append("file", new Blob([buf],{type:ct}), key.split("/").pop()); const r=await fetch(objUrl(key),{method:"PUT",headers:{Authorization:`Bearer ${IK}`},body:fd}); if(!r.ok) throw new Error(`UPLOAD ${key} ${r.status}`); return objUrl(key); }
async function descargar(u){ const r=await fetch(u); if(!r.ok) throw new Error(`DL ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
async function falQueue(modelo, input, label, timeoutMs=12*60*1000){
  const submit=await fetch(`https://queue.fal.run/${modelo}`,{method:"POST",headers:HFAL,body:JSON.stringify(input)});
  const stx=await submit.text(); if(!submit.ok) throw new Error(`SUBMIT ${submit.status} ${stx.slice(0,300)}`);
  const job=JSON.parse(stx); const statusUrl=job.status_url||`https://queue.fal.run/${modelo}/requests/${job.request_id}/status`; const respUrl=job.response_url||`https://queue.fal.run/${modelo}/requests/${job.request_id}`;
  const lim=Date.now()+timeoutMs; let estado="";
  while(Date.now()<lim){ await new Promise(r=>setTimeout(r,8000)); const s=await fetch(`${statusUrl}?logs=0`,{headers:HFAL}); const sb=await s.json().catch(()=>({})); estado=sb.status||""; console.error(`[${label}] ${estado}`); if(estado==="COMPLETED")break; if(estado==="FAILED")throw new Error(`JOB_FAIL ${label} ${JSON.stringify(sb).slice(0,300)}`); }
  if(estado!=="COMPLETED") throw new Error(`TIMEOUT ${label}`);
  const rr=await fetch(respUrl,{headers:HFAL}); return JSON.parse(await rr.text());
}
const videoUrl=(o)=>o.video?.url||o.output?.video?.url||o.videos?.[0]?.url||null;

const KLING_FB = "Subtle cinematic motion: the elegant woman in the green dress stands confidently on a softly blurred night city street, very gentle natural sway, soft hair movement in the breeze, she gives a calm confident look toward the camera with a faint warm smile, slow subtle camera push-in, shallow depth of field, warm bokeh city lights twinkling softly, photorealistic natural skin, classy sober cinematic film look, minimal motion.";
const KLING_IG = "Cinematic fashion motion: the confident woman in the green dress on a stylish neon night street, graceful elegant movement, she slowly turns her head toward the camera with a captivating alluring gaze and a subtle smile, gentle hair flip, soft body sway, slow dynamic camera move, warm neon bokeh, photorealistic natural skin, fashion-editorial cinematic look, tasteful and elegant.";
const KLING_NEG = "explicit, nudity, lingerie, fast jitter, distortion, warping face, morphing, extra limbs, deformed hands, plastic skin, blur, low quality, text, watermark";

const OVL_FB = [
  { text:"CREADO CON IA", div:46, yf:0.035, align:"left", box:0.42 },
  { text:"ESTA MUJER NO EXISTE", div:17, yf:0.085, box:0.5, black:true },
  { text:"la creó alguien común con su teléfono", div:30, yf:0.165, box:0.45 },
  { text:"Curso completo + 4 bonos", div:38, yf:0.715, box:0.5 },
  { text:"SOLO 9 USD", div:13, yf:0.765, box:0.55, black:true },
  { text:"Escríbele a Musa por WhatsApp", div:30, yf:0.885, box:0.48 },
];
const OVL_IG = [
  { text:"CREADO CON IA", div:46, yf:0.035, align:"left", box:0.42 },
  { text:"YO NO SOY REAL", div:15, yf:0.085, box:0.5, black:true },
  { text:"aprende a crear modelos con IA", div:30, yf:0.165, box:0.45 },
  { text:"Curso completo + 4 bonos", div:38, yf:0.715, box:0.5 },
  { text:"SOLO 9 USD", div:13, yf:0.765, box:0.55, black:true },
  { text:"Escríbele a Musa por WhatsApp", div:30, yf:0.885, box:0.48 },
];

async function hacerCine(label, imageUrl, prompt, rawName, outName, ovl){
  const bin = await ffbin();
  const rawLocal = join(OUT, rawName);
  let raw;
  if (existsSync(rawLocal) && !REGEN) {
    raw = readFileSync(rawLocal);
    console.error(`[${label}] reuso raw local (${(raw.length/1048576).toFixed(2)}MB), overlay gratis`);
  } else {
    const out = await falQueue("fal-ai/kling-video/v2.5-turbo/pro/image-to-video", { prompt, image_url:imageUrl, duration:"5", negative_prompt:KLING_NEG, cfg_scale:0.5 }, label);
    const vurl = videoUrl(out); if(!vurl) throw new Error(`SIN_VIDEO ${label} ${JSON.stringify(out).slice(0,200)}`);
    raw = await descargar(vurl);
    writeFileSync(rawLocal, raw);
    await subir(`test/videos/${rawName}`, raw, "video/mp4");
    console.error(`[${label}] raw guardado ${(raw.length/1048576).toFixed(2)}MB`);
  }
  const dir = mkdtempSync(join(tmpdir(),"cine-")); const inP=join(dir,"in.mp4"), outP=join(dir,"out.mp4");
  writeFileSync(inP, raw);
  await overlay(bin, inP, outP, ovl);
  let buf = readFileSync(outP); rmSync(dir,{recursive:true,force:true});
  const comp = await comprimirSiPesado(buf,{maxBytes:10*1024*1024,etiqueta:label}); buf=comp.buffer;
  writeFileSync(join(OUT, outName), buf);
  const url = await subir(`test/videos/${outName}`, buf, "video/mp4");
  return { label, outName, url, mb:+(buf.length/1048576).toFixed(2) };
}

const settled = await Promise.allSettled([
  hacerCine("fb-cine", URL_MASTER, KLING_FB, "raw-fb-cine.mp4", "ad-fb-cine.mp4", OVL_FB),
  hacerCine("ig-cine", URL_STILLIG, KLING_IG, "raw-ig-cine.mp4", "ad-ig-cine.mp4", OVL_IG),
]);
console.log(JSON.stringify({ RESUMEN: settled.map((s,i)=> s.status==="fulfilled"?s.value:{label:["fb-cine","ig-cine"][i],error:String(s.reason).slice(0,300)}) }, null, 2));
