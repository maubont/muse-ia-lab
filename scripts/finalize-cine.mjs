// Toma los 2 candidatos cinemáticos elegidos y les aplica el overlay corregido (Arial Black, auto-ajuste),
// comprime y guarda como finales ad-fb-cine.mp4 / ad-ig-cine.mp4. Sin fal (solo ffmpeg + subida).
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { comprimirSiPesado } from "./lib/comprimir-video.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");
const proyecto = JSON.parse(readFileSync(join(RAIZ, ".insforge", "project.json"), "utf8"));
const HOST = proyecto.oss_host, IK = proyecto.api_key, BUCKET = "musa-avatares";
const OUT = join(RAIZ, "creativos-revisar", "videos");
const CAND = join(OUT, "cand");
const objUrl = (key) => `${HOST}/api/storage/buckets/${BUCKET}/objects/${key}`;

async function ffbin(){ if(process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN; try{ const m=await import("ffmpeg-static"); if(m?.default) return m.default; }catch{} return "ffmpeg"; }
function correr(bin,args){ const r=spawnSync(bin,args,{encoding:"buffer",maxBuffer:256*1024*1024}); return { code:r.status, stderr:(r.stderr||Buffer.alloc(0)).toString("utf8") }; }
const FONT_BLACK = "creativos-revisar/_fonts/ariblk.ttf";
const FONT_BOLD  = "creativos-revisar/_fonts/arialbd.ttf";
function dims(bin, path){ const r=correr(bin,["-i",path]); const m=r.stderr.match(/, (\d{2,5})x(\d{2,5})[ ,]/); if(!m) throw new Error("NO_DIMS "+r.stderr.slice(-300)); return { w:+m[1], h:+m[2] }; }
const MARGIN=0.86;
function autoFs(W,H,e){ const desired=Math.round(H/e.div); if(e.align==="left")return desired; const factor=e.black?0.74:0.585; const maxByW=Math.floor((MARGIN*W)/(e.text.length*factor)); return Math.max(Math.round(H/46), Math.min(desired, maxByW)); }
function buildVf(W,H,els){ return els.map(e=>{ const fs=autoFs(W,H,e); const y=Math.round(H*e.yf); const bb=Math.max(6,Math.round(fs*0.28)); const x=e.align==="left"?Math.round(W*0.045):"(w-text_w)/2"; const font=e.black?FONT_BLACK:FONT_BOLD; const t=e.text.replace(/:/g,"\\:").replace(/'/g,"\\'"); return `drawtext=fontfile=${font}:text='${t}':fontcolor=${e.color||"white"}:fontsize=${fs}:box=1:boxcolor=black@${e.box??0.45}:boxborderw=${bb}:x=${x}:y=${y}`; }).join(","); }
async function subir(key, buf, ct){ const fd=new FormData(); fd.append("file", new Blob([buf],{type:ct}), key.split("/").pop()); const r=await fetch(objUrl(key),{method:"PUT",headers:{Authorization:`Bearer ${IK}`},body:fd}); if(!r.ok) throw new Error(`UPLOAD ${key} ${r.status}`); return objUrl(key); }

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

const FINALES = [
  { src: join(CAND,"cineA-sensual1-wan-1.mp4"), out:"ad-fb-cine.mp4", ovl:OVL_FB, label:"fb-cine" },
  { src: join(CAND,"cineB-sensual2-wan-2.mp4"), out:"ad-ig-cine.mp4", ovl:OVL_IG, label:"ig-cine" },
];

const bin = await ffbin();
const res = [];
for (const f of FINALES) {
  const { w, h } = dims(bin, f.src);
  const vf = buildVf(w, h, f.ovl);
  const dir = mkdtempSync(join(tmpdir(),"fin-")); const tmp=join(dir,"o.mp4");
  const enc = correr(bin, ["-y","-i",f.src,"-vf",vf,"-c:v","libx264","-crf","20","-preset","medium","-pix_fmt","yuv420p","-movflags","+faststart","-an",tmp]);
  if(enc.code!==0) throw new Error(`OVERLAY ${f.label} ${enc.stderr.slice(-400)}`);
  let buf = readFileSync(tmp); rmSync(dir,{recursive:true,force:true});
  const comp = await comprimirSiPesado(buf,{maxBytes:10*1024*1024,etiqueta:f.label}); buf=comp.buffer;
  writeFileSync(join(OUT, f.out), buf);
  const url = await subir(`test/videos/${f.out}`, buf, "video/mp4");
  // frame de verificación
  correr(bin,["-y","-i",join(OUT,f.out),"-frames:v","1",join(OUT,`_chk-${f.label}.png`)]);
  res.push({ label:f.label, out:`creativos-revisar/videos/${f.out}`, url, mb:+(buf.length/1048576).toFixed(2), dims:`${w}x${h}` });
}
console.log(JSON.stringify({ FINALES: res }, null, 2));
