// scripts/crear-video-creativo.mjs — Ensamblador de video publicitario de alto impacto (1080x1920) para FB, IG Reels y TikTok
import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

console.log("=== INICIANDO PRODUCCIÓN DE CREATIVO DE VIDEO (9:16) ===");

const FONT_BLACK = "creativos-revisar/_fonts/ariblk.ttf";
const FONT_BOLD = "creativos-revisar/_fonts/arialbd.ttf";

const clipA = "creativos-revisar/videos/ad-ig-talk.mp4";
const clipB = "creativos-revisar/videos/cand/cineA-sensual1-wan-1.mp4";
const clipC = "creativos-revisar/videos/cand/ABig-cine-wan-a.mp4";

// Asegurar existencia de directorios destino
fs.mkdirSync("next/landing/videos", { recursive: true });
fs.mkdirSync("creativos-revisar/videos", { recursive: true });

const salida1 = "creativos-revisar/videos/creativo-musa-reels-tiktok.mp4";
const salidaLanding = "next/landing/videos/creativo-musa-reels-tiktok.mp4";

// Escapes para drawtext de ffmpeg
function esc(t) {
  return t.replace(/:/g, "\\:").replace(/'/g, "\\'");
}

const filterComplex = [
  // 1. Normalizar y cortar clips
  "[0:v]trim=start=0:end=3.4,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[v0]",
  "[1:v]trim=start=0:end=3.6,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[v1]",
  "[2:v]trim=start=0:end=3.5,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[v2]",
  "[0:v]trim=start=10.5:end=12.7,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[v3]",

  // 2. Concatenar secuencias visuales
  "[v0][v1][v2][v3]concat=n=4:v=1:a=0[vbase]",

  // 3. Audio sincronizado continuo de Musa
  "[0:a]atrim=start=0:end=12.7,asetpts=PTS-STARTPTS,volume=1.15[aout]",

  // 4. Cadena de Overlays de Alto Impacto (drawtext)
  // 4.1 Badge permanente CREADO CON IA
  "[vbase]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● CREADO 100% CON IA") + "':fontcolor=white:fontsize=34:box=1:boxcolor=black@0.65:boxborderw=10:x=(w-text_w)/2:y=110[o0]",

  // 4.2 Escena 1: Hook (0 a 3.4s)
  "[o0]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("ESTA MUJER NO EXISTE") + "':fontcolor=#FFE500:fontsize=64:box=1:boxcolor=black@0.75:boxborderw=16:x=(w-text_w)/2:y=210:enable='between(t,0,3.4)'[o1]",
  "[o1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("¿Crees que soy real?... No lo soy") + "':fontcolor=white:fontsize=44:box=1:boxcolor=black@0.65:boxborderw=12:x=(w-text_w)/2:y=300:enable='between(t,0,3.4)'[o2]",

  // 4.3 Escena 2: Demostración Hiperrealista (3.4 a 7.0s)
  "[o2]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("100% INTELIGENCIA ARTIFICIAL") + "':fontcolor=#FFE500:fontsize=58:box=1:boxcolor=black@0.75:boxborderw=15:x=(w-text_w)/2:y=210:enable='between(t,3.4,7.0)'[o3]",
  "[o3]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Consistencia de Rostro & Piel Real") + "':fontcolor=white:fontsize=42:box=1:boxcolor=black@0.65:boxborderw=12:x=(w-text_w)/2:y=295:enable='between(t,3.4,7.0)'[o4]",
  "[o4]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Movimiento, Video y Voz Latina") + "':fontcolor=white:fontsize=38:box=1:boxcolor=black@0.65:boxborderw=10:x=(w-text_w)/2:y=365:enable='between(t,3.4,7.0)'[o5]",

  // 4.4 Escena 3: Oportunidad y Oferta (7.0 a 10.5s)
  "[o5]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("MONETIZA EN FANVUE Y MARCAS") + "':fontcolor=#FFE500:fontsize=56:box=1:boxcolor=black@0.75:boxborderw=15:x=(w-text_w)/2:y=210:enable='between(t,7.0,10.5)'[o6]",
  "[o6]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Aprende a crear modelos como yo") + "':fontcolor=white:fontsize=44:box=1:boxcolor=black@0.65:boxborderw=12:x=(w-text_w)/2:y=295:enable='between(t,7.0,10.5)'[o7]",
  "[o7]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("SOLO $33.000 COP / 9 USD") + "':fontcolor=#00FF66:fontsize=48:box=1:boxcolor=black@0.8:boxborderw=14:x=(w-text_w)/2:y=375:enable='between(t,7.0,10.5)'[o8]",

  // 4.5 Escena 4: Call to Action Final (10.5 a 12.7s)
  "[o8]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("ESCRÍBELE A MUSA POR WHATSAPP") + "':fontcolor=#FFE500:fontsize=56:box=1:boxcolor=black@0.8:boxborderw=16:x=(w-text_w)/2:y=210:enable='between(t,10.5,12.7)'[o9]",
  "[o9]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Toca el botón abajo para ingresar") + "':fontcolor=white:fontsize=42:box=1:boxcolor=black@0.7:boxborderw=12:x=(w-text_w)/2:y=295:enable='between(t,10.5,12.7)'[o10]",
  "[o10]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Acceso Vitalicio · 13 Clases + 4 Bonos") + "':fontcolor=white:fontsize=36:box=1:boxcolor=black@0.65:boxborderw=10:x=(w-text_w)/2:y=365:enable='between(t,10.5,12.7)'[o11]",

  // 4.6 Lower-third banner permanente en zona segura (t=2.5s a 12.7s)
  "[o11]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER MODELOS IA · ACCESO INMEDIATO") + "':fontcolor=white:fontsize=36:box=1:boxcolor=black@0.75:boxborderw=12:x=(w-text_w)/2:y=1540:enable='between(t,2.5,12.7)'[o12]",
  "[o12]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PAGO ÚNICO $33.000 COP (9 USD)") + "':fontcolor=#00FF66:fontsize=42:box=1:boxcolor=black@0.8:boxborderw=12:x=(w-text_w)/2:y=1610:enable='between(t,2.5,12.7)'[vout]"
].join(";");

const args = [
  "-y",
  "-i", clipA,
  "-i", clipB,
  "-i", clipC,
  "-filter_complex", filterComplex,
  "-map", "[vout]",
  "-map", "[aout]",
  "-c:v", "libx264",
  "-preset", "fast",
  "-crf", "19",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  "-b:a", "192k",
  "-movflags", "+faststart",
  salida1
];

console.log("Compilando video con ffmpeg...");
const t0 = Date.now();
const res = spawnSync(ffmpeg, args, { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });

if (res.status !== 0) {
  console.error("ERROR EN FFMPEG:", res.stderr.slice(-1000));
  process.exit(1);
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
const stats = fs.statSync(salida1);
const mb = (stats.size / (1024 * 1024)).toFixed(2);
console.log(`✓ Video generado exitosamente en ${secs}s: ${salida1} (${mb} MB)`);

// Copiar a next/landing/videos para distribución web
fs.copyFileSync(salida1, salidaLanding);
console.log(`✓ Copiado a ${salidaLanding}`);

console.log("=== PRODUCCIÓN COMPLETADA AL 100% ===");
