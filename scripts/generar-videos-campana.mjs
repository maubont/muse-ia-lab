// Genera los 5 videos de campaña desde la MASTER C:
//   chat      -> OmniHuman v1.5 (still-chat + saludo)        ~10s
//   fb-talk   -> OmniHuman v1.5 (musa-master + gancho sobrio) ~9s
//   ig-talk   -> OmniHuman v1.5 (still-ig + gancho sensual)   ~8s
//   fb-cine   -> Kling 2.5 i2v (musa-master, movimiento sobrio) 5s + overlay
//   ig-cine   -> Kling 2.5 i2v (still-ig, movimiento sensual)   5s + overlay
// Overlays con ffmpeg drawtext (gancho + "Creado con IA" + 9 USD + CTA). Comprime >10MB.
// Self-test de ffmpeg ANTES de gastar en fal. Guarda en creativos-revisar/videos/ y sube a test/videos/.
// Requiere FAL_KEY y OPENAI_API_KEY. fal: OmniHuman $0.16/s, Kling $0.35/5s.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { comprimirSiPesado } from "./lib/comprimir-video.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");
const FAL_KEY = process.env.FAL_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!FAL_KEY) { console.error("FALTA FAL_KEY"); process.exit(1); }
if (!OPENAI_API_KEY) { console.error("FALTA OPENAI_API_KEY"); process.exit(1); }

const proyecto = JSON.parse(readFileSync(join(RAIZ, ".insforge", "project.json"), "utf8"));
const HOST = proyecto.oss_host, IK = proyecto.api_key, BUCKET = "musa-avatares";
const OUT = join(RAIZ, "creativos-revisar", "videos"); mkdirSync(OUT, { recursive: true });
const objUrl = (key) => `${HOST}/api/storage/buckets/${BUCKET}/objects/${key}`;
const HFAL = { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" };

const URL_MASTER   = objUrl("base/musa-master.png");
const URL_STILLCHAT= objUrl("test/stills/still-chat.png");
const URL_STILLIG  = objUrl("test/stills/still-ig.png");
const URL_AUDIOCHAT= objUrl("base/audio-base-v2.mp3"); // saludo ya grabado (voz latino-neutro)

// ---------- ffmpeg ----------
async function ffbin(){ if(process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN; try{ const m=await import("ffmpeg-static"); if(m?.default) return m.default; }catch{} return "ffmpeg"; }
function correr(bin,args){ const r=spawnSync(bin,args,{encoding:"buffer",maxBuffer:256*1024*1024}); return { code:r.status, error:r.error, stderr:(r.stderr||Buffer.alloc(0)).toString("utf8") }; }
// Rutas RELATIVAS al cwd (sin ':' de unidad): "C:/" rompe el parser de drawtext y cae a serif.
const FONT_BLACK = "creativos-revisar/_fonts/ariblk.ttf";   // Arial Black
const FONT_BOLD  = "creativos-revisar/_fonts/arialbd.ttf";  // Arial Bold

function dims(bin, path){ const r=correr(bin,["-i",path]); const m=r.stderr.match(/, (\d{2,5})x(\d{2,5})[ ,]/); if(!m) throw new Error("NO_DIMS "+r.stderr.slice(-300)); return { w:+m[1], h:+m[2] }; }

// fontsize auto-ajustado para que el texto centrado no exceda MARGIN*W
const MARGIN = 0.86;
function autoFs(W,H,e){
  const desired = Math.round(H/e.div);
  if (e.align === "left") return desired;
  const factor = e.black ? 0.74 : 0.585;
  const maxByW = Math.floor((MARGIN*W) / (e.text.length * factor));
  return Math.max(Math.round(H/46), Math.min(desired, maxByW));
}
// elementos -> filtro drawtext encadenado
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
  if (enc.code!==0) throw new Error(`OVERLAY_FAIL code=${enc.code} ${enc.stderr.slice(-500)}`);
}

// ---------- io ----------
async function subir(key, buf, ct){ const fd=new FormData(); fd.append("file", new Blob([buf],{type:ct}), key.split("/").pop()); const r=await fetch(objUrl(key),{method:"PUT",headers:{Authorization:`Bearer ${IK}`},body:fd}); if(!r.ok) throw new Error(`UPLOAD ${key} ${r.status} ${(await r.text()).slice(0,200)}`); return objUrl(key); }
async function descargar(u){ const r=await fetch(u); if(!r.ok) throw new Error(`DL ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
async function tts(texto){ const r=await fetch("https://api.openai.com/v1/audio/speech",{method:"POST",headers:{Authorization:`Bearer ${OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini-tts",voice:"sage",input:texto,instructions:"Voz femenina latina de acento neutro, joven, sensual, cariñosa y delicada, cálida y cercana, ritmo pausado e íntimo de nota de voz, profesional",response_format:"mp3"})}); if(!r.ok) throw new Error(`TTS ${r.status} ${(await r.text()).slice(0,200)}`); return Buffer.from(await r.arrayBuffer()); }

async function falQueue(modelo, input, label, timeoutMs=12*60*1000){
  const submit=await fetch(`https://queue.fal.run/${modelo}`,{method:"POST",headers:HFAL,body:JSON.stringify(input)});
  const stx=await submit.text(); if(!submit.ok) throw new Error(`SUBMIT ${modelo} ${submit.status} ${stx.slice(0,300)}`);
  const job=JSON.parse(stx); const statusUrl=job.status_url||`https://queue.fal.run/${modelo}/requests/${job.request_id}/status`; const respUrl=job.response_url||`https://queue.fal.run/${modelo}/requests/${job.request_id}`;
  const lim=Date.now()+timeoutMs; let estado="";
  while(Date.now()<lim){ await new Promise(r=>setTimeout(r,8000)); const s=await fetch(`${statusUrl}?logs=0`,{headers:HFAL}); const sb=await s.json().catch(()=>({})); estado=sb.status||""; console.error(`[${label}] ${estado} ${sb.queue_position??""}`); if(estado==="COMPLETED")break; if(estado==="FAILED"||s.status===402||s.status===403) throw new Error(`JOB_FAIL ${label} http=${s.status} ${JSON.stringify(sb).slice(0,300)}`); }
  if(estado!=="COMPLETED") throw new Error(`TIMEOUT ${label}`);
  const rr=await fetch(respUrl,{headers:HFAL}); const out=JSON.parse(await rr.text()); return out;
}
const videoUrl=(o)=>o.video?.url||o.output?.video?.url||o.videos?.[0]?.url||null;

// ---------- self-test ffmpeg (sin gastar fal) ----------
async function selfTest(bin){
  const dir=mkdtempSync(join(tmpdir(),"vtest-")); const src=join(dir,"s.mp4"), dst=join(dir,"d.mp4");
  const gen=correr(bin,["-y","-f","lavfi","-i","color=c=gray:s=540x960:d=1","-pix_fmt","yuv420p",src]);
  if(gen.code!==0) throw new Error(`SELFTEST_GEN ${gen.stderr.slice(-300)}`);
  await overlay(bin, src, dst, OVL_FB);
  const v=correr(bin,["-v","error","-i",dst,"-f","null","-"]);
  rmSync(dir,{recursive:true,force:true});
  if(v.code!==0||v.stderr.trim()) throw new Error(`SELFTEST_DECODE ${v.stderr.slice(-300)}`);
  console.error("SELFTEST ffmpeg/drawtext OK");
}

// ---------- contenido ----------
const TXT_FB = "Te confieso algo... yo no soy real. Me crearon con inteligencia artificial, y tú puedes aprender a hacer lo mismo. Te espero en el chat.";
const TXT_IG = "¿Crees que soy real? No lo soy. Soy cien por ciento inteligencia artificial. Aprende a crear modelos como yo y empieza hoy. Escríbeme.";

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

// ---------- jobs ----------
// OmniHuman v1.5 limita la imagen a 5MB -> convertir el PNG 2K a JPEG 1080-ancho (<1MB) primero.
async function asJpgUrl(imageUrl, srcKey){
  const bin = await ffbin();
  const png = await descargar(imageUrl);
  const dir = mkdtempSync(join(tmpdir(),"ojpg-")); const inP=join(dir,"in.png"), outP=join(dir,"out.jpg");
  writeFileSync(inP, png);
  const r = correr(bin, ["-y","-i",inP,"-vf","scale=1080:-2","-q:v","3",outP]);
  if (r.code!==0) throw new Error(`JPG_FAIL ${r.stderr.slice(-300)}`);
  const jbuf = readFileSync(outP); rmSync(dir,{recursive:true,force:true});
  return subir(srcKey, jbuf, "image/jpeg");
}
async function jobOmni(label, imageUrl, audioUrl, outName){
  const jpgUrl = await asJpgUrl(imageUrl, `test/videos/src-${label}.jpg`);
  const out = await falQueue("fal-ai/bytedance/omnihuman/v1.5", { image_url:jpgUrl, audio_url:audioUrl }, label);
  const vurl = videoUrl(out); if(!vurl) throw new Error(`SIN_VIDEO ${label} ${JSON.stringify(out).slice(0,200)}`);
  let buf = await descargar(vurl);
  const comp = await comprimirSiPesado(buf,{maxBytes:10*1024*1024,etiqueta:label});
  buf = comp.buffer;
  writeFileSync(join(OUT, outName), buf);
  const url = await subir(`test/videos/${outName}`, buf, "video/mp4");
  return { label, outName, url, mb:+(buf.length/1048576).toFixed(2), comprimido:comp.comprimido };
}
async function jobKlingCine(label, imageUrl, prompt, outName, ovl){
  const bin = await ffbin();
  const out = await falQueue("fal-ai/kling-video/v2.5-turbo/pro/image-to-video", { prompt, image_url:imageUrl, duration:"5", negative_prompt:KLING_NEG, cfg_scale:0.5 }, label);
  const vurl = videoUrl(out); if(!vurl) throw new Error(`SIN_VIDEO ${label} ${JSON.stringify(out).slice(0,200)}`);
  const raw = await descargar(vurl);
  const dir = mkdtempSync(join(tmpdir(),"cine-")); const inP=join(dir,"in.mp4"), outP=join(dir,"out.mp4");
  writeFileSync(inP, raw);
  await overlay(bin, inP, outP, ovl);
  let buf = readFileSync(outP); rmSync(dir,{recursive:true,force:true});
  const comp = await comprimirSiPesado(buf,{maxBytes:10*1024*1024,etiqueta:label}); buf=comp.buffer;
  writeFileSync(join(OUT, outName), buf);
  const url = await subir(`test/videos/${outName}`, buf, "video/mp4");
  return { label, outName, url, mb:+(buf.length/1048576).toFixed(2), conOverlay:true };
}

const fase = process.argv.includes("--fase") ? process.argv[process.argv.indexOf("--fase")+1] : "all";

// 0) self-test ffmpeg
const bin = await ffbin();
await selfTest(bin);
if (fase === "selftest") { console.log(JSON.stringify({selftest:"ok"})); process.exit(0); }

// 1) TTS de los ganchos hablados (chat reutiliza audio-base-v2)
console.error("=== TTS ganchos ===");
const [fbMp3, igMp3] = await Promise.all([tts(TXT_FB), tts(TXT_IG)]);
const URL_FB_AUDIO = await subir("test/videos/audio-fb.mp3", fbMp3, "audio/mpeg");
const URL_IG_AUDIO = await subir("test/videos/audio-ig.mp3", igMp3, "audio/mpeg");

// 2) los 5 videos en paralelo
console.error("=== 5 videos en paralelo ===");
const settled = await Promise.allSettled([
  jobOmni("chat",     URL_STILLCHAT, URL_AUDIOCHAT,  "video-chat-musa.mp4"),
  jobOmni("fb-talk",  URL_MASTER,    URL_FB_AUDIO,   "ad-fb-talk.mp4"),
  jobOmni("ig-talk",  URL_STILLIG,   URL_IG_AUDIO,   "ad-ig-talk.mp4"),
  jobKlingCine("fb-cine", URL_MASTER, KLING_FB, "ad-fb-cine.mp4", OVL_FB),
  jobKlingCine("ig-cine", URL_STILLIG, KLING_IG, "ad-ig-cine.mp4", OVL_IG),
]);
const labels=["chat","fb-talk","ig-talk","fb-cine","ig-cine"];
const resultados = settled.map((s,i)=> s.status==="fulfilled" ? s.value : { label:labels[i], error:String(s.reason).slice(0,300) });
console.log(JSON.stringify({ RESUMEN: resultados }, null, 2));
