// scripts/producir-creativo-master.mjs — Productor del creativo de video hiperrealista 9:16
import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

console.log("=== INICIANDO PRODUCCIÓN DE CREATIVO MAESTRO 9:16 (HIPERREALISTA & ORIGINAL) ===");

const FONT_BLACK = "creativos-revisar/_fonts/ariblk.ttf";
const FONT_BOLD = "creativos-revisar/_fonts/arialbd.ttf";

const img1 = "creativos-revisar/originales/escena-1.jpg";
const img2 = "creativos-revisar/originales/escena-2.jpg";
const img3 = "creativos-revisar/originales/escena-3.jpg";
const audioPath = "creativos-revisar/audio/voz-creativo-original.mp3";

// Salidas
fs.mkdirSync("creativos-revisar/videos", { recursive: true });
fs.mkdirSync("next/landing/videos", { recursive: true });

const salidaLocal = "creativos-revisar/videos/creativo-musa-master-916.mp4";
const salidaLanding = "next/landing/videos/creativo-musa-master-916.mp4";

// Escapar texto para drawtext de ffmpeg
function esc(t) {
  return t.replace(/:/g, "\\:").replace(/'/g, "\\'");
}

// Duraciones exactas:
// Escena 1: 0 a 7.5s (225 frames)
// Escena 2: 7.5 a 16.5s (270 frames)
// Escena 3: 16.5 a 25.5s (270 frames)
// Total: 25.5s (765 frames a 30fps)
const filterComplex = [
  // 1. Escena 1: Animación de cámara Ken Burns (Slow smooth zoom in sobre 1080x1920)
  "[0:v]scale=1620:2880,zoompan=z='min(zoom+0.00035,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=225:s=1080x1920:fps=30[v1]",

  // 2. Escena 2: Animación de cámara Ken Burns (Slow upward drift editorial)
  "[1:v]scale=1620:2880,zoompan=z=1.06:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(0.25+0.5*(on/270))':d=270:s=1080x1920:fps=30[v2]",

  // 3. Escena 3: Animación de cámara Ken Burns (Slow panoramic pull twilight)
  "[2:v]scale=1620:2880,zoompan=z='max(1.07-0.00025*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=270:s=1080x1920:fps=30[v3]",

  // 4. Concatenación de video continuo
  "[v1][v2][v3]concat=n=3:v=1:a=0[vbase]",

  // 5. Normalización y realce del audio de voz
  "[3:a]atrim=start=0:end=25.5,asetpts=PTS-STARTPTS,volume=1.45[aout]",

  // 6. OVERLAYS GRÁFICOS (Arquitectura de Franjas Seguras: Personaje 100% Despejado)
  // 6.1 HEADER SUPERIOR PERMANENTE (Y: 75 - 135, zona libre sobre la cabeza)
  "[vbase]drawbox=x=120:y=75:w=840:h=60:color=black@0.65:t=fill[h0]",
  "[h0]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● MUSA IA LAB  |  TALLER VIRTUAL") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=90[vheader]",

  // 6.2 DOCK INFERIOR PERMANENTE DE CONVERSIÓN (Y: 1460 a 1870, zona inferior bajo el cuerpo)
  "[vheader]drawbox=x=50:y=1460:w=980:h=410:color=#080d16@0.85:t=fill[dock0]",
  // Borde sutil verde neón en la parte superior del dock
  "[dock0]drawbox=x=50:y=1460:w=980:h=4:color=#00FF88@0.8:t=fill[dock1]",

  // 6.3 TEXTOS DE ESCENA 1 (0 a 7.5s)
  "[dock1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("NUEVA ECONOMÍA DE MODELOS IA") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1510:enable='between(t,0,7.5)'[d1_1]",
  "[d1_1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Las agencias ya no pagan sesiones de fotos tradicionales") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1580:enable='between(t,0,7.5)'[d1_2]",
  "[d1_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● Aprende el método exacto en una tarde") + "':fontcolor=#00FF88:fontsize=34:x=(w-text_w)/2:y=1660:enable='between(t,0,7.5)'[d1_3]",
  "[d1_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PAGO ÚNICO $33.000 COP") + "':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=1750:enable='between(t,0,7.5)'[s1_done]",

  // 6.4 TEXTOS DE ESCENA 2 (7.5 a 16.5s)
  "[s1_done]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("CONSISTENCIA FOTOGRÁFICA REAL") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1510:enable='between(t,7.5,16.5)'[d2_1]",
  "[d2_1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Piel con textura y poros reales · Cero filtros plásticos") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1580:enable='between(t,7.5,16.5)'[d2_2]",
  "[d2_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● Monetiza en Fanvue y marcas internacionales") + "':fontcolor=#00FF88:fontsize=34:x=(w-text_w)/2:y=1660:enable='between(t,7.5,16.5)'[d2_3]",
  "[d2_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PAGO ÚNICO $33.000 COP") + "':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=1750:enable='between(t,7.5,16.5)'[s2_done]",

  // 6.5 TEXTOS DE ESCENA 3 (16.5 a 25.5s) — CLÍMAX DE CONVERSIÓN
  "[s2_done]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("ACCESO INMEDIATO AL TALLER") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1500:enable='between(t,16.5,25.5)'[d3_1]",
  "[d3_1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("13 Clases Prácticas + Prompts + 4 Bonos VIP") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1565:enable='between(t,16.5,25.5)'[d3_2]",
  // PRECIO GIGANTE DESTACADO: $33.000 COP (CERO DÓLARES)
  "[d3_2]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("SOLO $33.000 COP") + "':fontcolor=#00FF88:fontsize=60:x=(w-text_w)/2:y=1640:enable='between(t,16.5,25.5)'[d3_3]",
  // CTA FINAL WHATSAPP
  "[d3_3]drawbox=x=140:y=1740:w=800:h=85:color=#00A859@0.9:t=fill:enable='between(t,16.5,25.5)'[cta_box]",
  "[cta_box]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TOCA AQUÍ PARA ENVIAR WHATSAPP") + "':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=1765:enable='between(t,16.5,25.5)'[vout]"
].join(";");

const args = [
  "-y",
  "-i", img1,
  "-i", img2,
  "-i", img3,
  "-i", audioPath,
  "-filter_complex", filterComplex,
  "-map", "[vout]",
  "-map", "[aout]",
  "-c:v", "libx264",
  "-preset", "fast",
  "-crf", "18",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  "-b:a", "192k",
  "-movflags", "+faststart",
  salidaLocal
];

console.log("Compilando video con ffmpeg...");
const t0 = Date.now();
const res = spawnSync(ffmpeg, args, { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });

if (res.status !== 0) {
  console.error("ERROR EN FFMPEG:", res.stderr.slice(-1500));
  process.exit(1);
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
const stats = fs.statSync(salidaLocal);
const mb = (stats.size / (1024 * 1024)).toFixed(2);
console.log(`✓ Video generado exitosamente en ${secs}s: ${salidaLocal} (${mb} MB)`);

// Copiar a landing pública
fs.copyFileSync(salidaLocal, salidaLanding);
console.log(`✓ Video publicado en landing: ${salidaLanding}`);
