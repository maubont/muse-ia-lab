// scripts/crear-video-creativo-b.mjs — Variante B (Hook Confesión) para A/B Testing en FB, IG Reels y TikTok
import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

console.log("=== INICIANDO PRODUCCIÓN DE VARIANTE B (HOOK CONFESIÓN) ===");

const FONT_BLACK = "creativos-revisar/_fonts/ariblk.ttf";
const FONT_BOLD = "creativos-revisar/_fonts/arialbd.ttf";

const clipA = "creativos-revisar/videos/ad-fb-talk.mp4";
const clipB = "creativos-revisar/videos/cand/cineB-sensual2-wan-1.mp4";
const clipC = "creativos-revisar/videos/cand/ABig-cine-wan-a.mp4";

const salida1 = "creativos-revisar/videos/creativo-musa-confesion-ads.mp4";
const salidaLanding = "next/landing/videos/creativo-musa-confesion-ads.mp4";

function esc(t) {
  return t.replace(/:/g, "\\:").replace(/'/g, "\\'");
}

const filterComplex = [
  // 1. Normalizar y cortar clips
  "[0:v]trim=start=0:end=4.1,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[v0]",
  "[1:v]trim=start=0:end=3.5,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[v1]",
  "[2:v]trim=start=0:end=3.0,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[v2]",
  "[0:v]trim=start=10.2:end=12.8,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[v3]",

  // 2. Concatenar secuencias
  "[v0][v1][v2][v3]concat=n=4:v=1:a=0[vbase]",

  // 3. Audio sincronizado
  "[0:a]atrim=start=0:end=12.8,asetpts=PTS-STARTPTS,volume=1.15[aout]",

  // 4. Overlays
  // Badge superior
  "[vbase]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● MODELO VIRTUAL 100% IA") + "':fontcolor=white:fontsize=34:box=1:boxcolor=black@0.65:boxborderw=10:x=(w-text_w)/2:y=110[o0]",

  // Escena 1: Hook Confesión (0 a 4.1s)
  "[o0]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TE CONFIESO ALGO...") + "':fontcolor=#FFE500:fontsize=64:box=1:boxcolor=black@0.75:boxborderw=16:x=(w-text_w)/2:y=210:enable='between(t,0,2.3)'[o1a]",
  "[o1a]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("YO NO SOY REAL") + "':fontcolor=#FF3366:fontsize=70:box=1:boxcolor=black@0.8:boxborderw=18:x=(w-text_w)/2:y=210:enable='between(t,2.3,4.1)'[o1b]",
  "[o1b]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("No existo. Me crearon con IA") + "':fontcolor=white:fontsize=44:box=1:boxcolor=black@0.65:boxborderw=12:x=(w-text_w)/2:y=305:enable='between(t,0,4.1)'[o2]",

  // Escena 2: Demostración Hiperrealismo (4.1 a 7.6s)
  "[o2]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("CREA MODELOS HIPERREALISTAS") + "':fontcolor=#FFE500:fontsize=56:box=1:boxcolor=black@0.75:boxborderw=15:x=(w-text_w)/2:y=210:enable='between(t,4.1,7.6)'[o3]",
  "[o3]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Mismo Rostro en Cualquier Ángulo") + "':fontcolor=white:fontsize=42:box=1:boxcolor=black@0.65:boxborderw=12:x=(w-text_w)/2:y=295:enable='between(t,4.1,7.6)'[o4]",
  "[o4]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Piel con Poros Reales · Video y Voz") + "':fontcolor=white:fontsize=38:box=1:boxcolor=black@0.65:boxborderw=10:x=(w-text_w)/2:y=365:enable='between(t,4.1,7.6)'[o5]",

  // Escena 3: Negocio y Oferta (7.6 a 10.6s)
  "[o5]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("MONETIZA EN DÓLARES") + "':fontcolor=#FFE500:fontsize=60:box=1:boxcolor=black@0.75:boxborderw=15:x=(w-text_w)/2:y=210:enable='between(t,7.6,10.6)'[o6]",
  "[o6]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Suscripciones en Fanvue (+18) o Marcas") + "':fontcolor=white:fontsize=40:box=1:boxcolor=black@0.65:boxborderw=12:x=(w-text_w)/2:y=295:enable='between(t,7.6,10.6)'[o7]",
  "[o7]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER COMPLETO: 33.000 COP (9 USD)") + "':fontcolor=#00FF66:fontsize=44:box=1:boxcolor=black@0.8:boxborderw=14:x=(w-text_w)/2:y=370:enable='between(t,7.6,10.6)'[o8]",

  // Escena 4: CTA (10.6 a 12.8s)
  "[o8]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TE ESPERO EN EL CHAT") + "':fontcolor=#FFE500:fontsize=64:box=1:boxcolor=black@0.8:boxborderw=16:x=(w-text_w)/2:y=210:enable='between(t,10.6,12.8)'[o9]",
  "[o9]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Escríbele a Musa por WhatsApp") + "':fontcolor=white:fontsize=44:box=1:boxcolor=black@0.7:boxborderw=12:x=(w-text_w)/2:y=300:enable='between(t,10.6,12.8)'[o10]",
  "[o10]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Acceso Vitalicio · Empieza Hoy Mismo") + "':fontcolor=white:fontsize=36:box=1:boxcolor=black@0.65:boxborderw=10:x=(w-text_w)/2:y=370:enable='between(t,10.6,12.8)'[o11]",

  // Lower-third banner permanente en zona segura
  "[o11]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL MODELOS IA") + "':fontcolor=white:fontsize=36:box=1:boxcolor=black@0.75:boxborderw=12:x=(w-text_w)/2:y=1540:enable='between(t,2.0,12.8)'[o12]",
  "[o12]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PAGO ÚNICO $33.000 COP / 9 USD") + "':fontcolor=#00FF66:fontsize=42:box=1:boxcolor=black@0.8:boxborderw=12:x=(w-text_w)/2:y=1610:enable='between(t,2.0,12.8)'[vout]"
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

console.log("Compilando Variante B...");
const t0 = Date.now();
const res = spawnSync(ffmpeg, args, { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });

if (res.status !== 0) {
  console.error("ERROR EN FFMPEG:", res.stderr.slice(-1000));
  process.exit(1);
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
const stats = fs.statSync(salida1);
const mb = (stats.size / (1024 * 1024)).toFixed(2);
console.log(`✓ Variante B generada exitosamente en ${secs}s: ${salida1} (${mb} MB)`);

fs.copyFileSync(salida1, salidaLanding);
console.log(`✓ Copiado a ${salidaLanding}`);

console.log("=== VARIANTE B COMPLETADA AL 100% ===");
