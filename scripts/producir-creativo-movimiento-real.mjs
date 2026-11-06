import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpeg from "ffmpeg-static";

console.log("=== PRODUCIENDO MASTER V8: VIDEO CON MOVIMIENTO REAL (WAN / KLING) + VOZ COLOMBIANA ===");

const outDir = "next/landing/videos";
fs.mkdirSync(outDir, { recursive: true });
const salidaMaster = path.join(outDir, "creativo-musa-v8-motion.mp4");

// 1. Clips de video de movimiento real de Musa
const clip1 = "creativos-revisar/videos/cand/cineA-sensual1-wan-1.mp4"; // 5.04s
const clip2 = "creativos-revisar/videos/cand/cineB-sensual2-wan-1.mp4"; // 5.04s
const clip3 = "creativos-revisar/videos/cand/ABig-cine-wan-a.mp4";     // 5.04s
const vozAudio = "next/landing/audio/musa-colombiana-salome.mp3";      // 15.6s

if (!fs.existsSync(clip1) || !fs.existsSync(clip2) || !fs.existsSync(clip3)) {
  console.error("No se encontraron los clips de movimiento en cand/");
  process.exit(1);
}

// 2. Concatenar los 3 clips de video en un stream de ~15.2s
// Escala uniforme a 1080x1920, 30fps
// Overlay superior e inferior dejando el personaje 100% libre
const fontBold = "creativos-revisar/_fonts/arialbd.ttf";
const fontBlack = "creativos-revisar/_fonts/ariblk.ttf";

// Configuración de filtro complejo
const filterComplex = [
  // Clip 1: Escalar a 1080x1920, fps=30
  `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setpts=PTS-STARTPTS[v0]`,
  // Clip 2: Escalar a 1080x1920, fps=30
  `[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setpts=PTS-STARTPTS[v1]`,
  // Clip 3: Escalar a 1080x1920, fps=30
  `[2:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setpts=PTS-STARTPTS[v2]`,
  // Concatenar los 3 videos
  `[v0][v1][v2]concat=n=3:v=1:a=0[vbase]`,
  // Overlay de gráficos publicitarios:
  // Franja superior (Y: 0 a 140)
  // Franja inferior (Y: 1740 a 1920)
  // Zona de personaje (Y: 140 a 1740) TOTALMENTE LIMPIA
  `[vbase]` +
  // Top Header Banner
  `drawbox=x=0:y=0:w=1080:h=130:color=black@0.65:t=fill,` +
  `drawtext=fontfile=${fontBlack}:text='MUSA IA LAB · TALLER EXCLUSIVO':fontcolor=#00ff88:fontsize=36:x=(w-text_w)/2:y=28,` +
  `drawtext=fontfile=${fontBold}:text='CREA TU PROPIA MODELO VIRTUAL':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=76,` +
  // Bottom Dock CTA
  `drawbox=x=0:y=1730:w=1080:h=190:color=black@0.75:t=fill,` +
  `drawbox=x=60:y=1750:w=960:h=150:color=#00ff88@0.15:t=fill,` +
  `drawtext=fontfile=${fontBlack}:text='ACCESO COMPLETO POR SOLO':fontcolor=#c9d1d9:fontsize=28:x=(w-text_w)/2:y=1768,` +
  `drawtext=fontfile=${fontBlack}:text='$33.000 COP':fontcolor=#ffe500:fontsize=52:x=(w-text_w)/2:y=1808,` +
  `drawtext=fontfile=${fontBold}:text='TOCA EL BOTON O ESCRIBENOS AL WHATSAPP':fontcolor=#00ff88:fontsize=26:x=(w-text_w)/2:y=1872[vout]`,
  // Audio: Voz de Salomé amplificada con fade out al final
  `[3:a]aformat=channel_layouts=stereo:sample_rates=48000,volume=1.4,afade=t=out:st=14.8:d=0.4[aout]`
].join(";");

const args = [
  "-y",
  "-i", clip1,
  "-i", clip2,
  "-i", clip3,
  "-i", vozAudio,
  "-filter_complex", filterComplex,
  "-map", "[vout]",
  "-map", "[aout]",
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "20",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  "-b:a", "256k",
  "-t", "15.2",
  "-movflags", "+faststart",
  salidaMaster
];

console.log("Renderizando V8 con ffmpeg...");
const t0 = Date.now();
const res = spawnSync(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });

if (res.status !== 0) {
  console.error("Error renderizando:", res.stderr.toString().slice(-800));
  process.exit(1);
}

const stats = fs.statSync(salidaMaster);
console.log(`✓ Master V8 renderizado en ${( (Date.now()-t0)/1000 ).toFixed(1)}s!`);
console.log(`✓ Tamaño: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
console.log(`✓ Ruta: ${salidaMaster}`);
