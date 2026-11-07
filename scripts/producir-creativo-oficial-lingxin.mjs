// scripts/producir-creativo-oficial-lingxin.mjs
// Creativo Publicitario Oficial 9:16 para Meta Ads / Reels / TikTok
// Voz Oficial: 🇨🇴 Lingxin (Qwen 3.1 TTS Plus / Alibaba Cloud ModelStudio)
// Imágenes Recientes: Musa Mirror Corset, Musa Penthouse Lip-Bite, Musa Closeup, Musa Penthouse Noche

import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

console.log("=== PRODUCCIÓN OFICIAL DEL CREATIVO 9:16 (VOZ LINGXIN + FOTOS RECIENTES) ===");

const FONT_BLACK = "creativos-revisar/_fonts/ariblk.ttf";
const FONT_BOLD = "creativos-revisar/_fonts/arialbd.ttf";

const img1 = "next/landing/assets/musa-mirror-corset.jpg";
const img2 = "next/landing/assets/musa-penthouse-lipbite.jpg";
const img3 = "next/landing/assets/musa-closeup.jpg";
const img4 = "next/landing/assets/musa-sensual-penthouse.jpg";
const audioPath = "next/landing/audio/voz-creativo-sensual.mp3";

const salidaLocal = "creativos-revisar/videos/creativo-musa-master-916.mp4";
const salidaLanding1 = "next/landing/videos/creativo-musa-master-916.mp4";
const salidaLandingOficial = "next/landing/videos/creativo-musa-oficial-2026.mp4";

function esc(t) {
  return t.replace(/%/g, "%%").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

// Duración total sincronizada con voz Lingxin: 35.6s
// Escena 1 (0 a 8.8s): Mirror Selfie Corset Satén
// Escena 2 (8.8 a 17.6s): Penthouse Sunset Sensual Lip-Bite
// Escena 3 (17.6 a 26.6s): Closeup Piel Humana & Ojos
// Escena 4 (26.6 a 35.6s): Penthouse Noche / Cierre $33.000 COP

const filterComplex = [
  // 1. Escena 1 (Mirror Corset): Push-in orgánico lento con sutil respiración
  "[0:v]scale=1240:2204:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2 + sin(n/20)*10':y='(in_h-out_h)/2 - 30 + (n/264)*50',trim=duration=8.8,setsar=1,fps=30[sc1]",

  // 2. Escena 2 (Penthouse Lip-Bite): Zoom-in directo hacia sus labios y mirada de deseo
  "[1:v]scale=1260:2240:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2 + cos(n/24)*8':y='(in_h-out_h)*0.6 - (n/264)*(in_h-out_h)*0.3',trim=duration=8.8,setsar=1,fps=30[sc2]",

  // 3. Escena 3 (Closeup Piel Real): Macro push-in lento resaltando microporos
  "[2:v]scale=1240:2204:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2 + sin(n/26)*8':y='(in_h-out_h)/2 + (n/270)*40',trim=duration=9.0,setsar=1,fps=30[sc3]",

  // 4. Escena 4 (Penthouse Noche CTA): Cámara en mano suave nocturna
  "[3:v]scale=1220:2168:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2 + sin(n/18)*10':y='(in_h-out_h)/2 + cos(n/25)*10',trim=duration=9.0,setsar=1,fps=30[sc4]",

  // 5. Concatenar secuencias
  "[sc1][sc2][sc3][sc4]concat=n=4:v=1:a=0[vraw]",

  // 6. Post-procesado cinematográfico de textura
  "[vraw]noise=alls=4:allf=t+u,unsharp=5:5:0.35:5:5:0.0,eq=contrast=1.03:brightness=0.01:saturation=1.03[vgraded]",

  // 7. Audio oficial Lingxin (Alibaba DashScope) estéreo 48kHz
  "[4:a]aformat=channel_layouts=stereo:sample_rates=48000,volume=1.4,afade=t=out:st=35.0:d=0.6[aout]",

  // 8. Overlays Gráficos Seguros
  // 8.1 Header Superior (Y: 75 - 139)
  "[vgraded]drawbox=x=50:y=75:w=980:h=64:color=#080C14@0.85:t=fill[h0]",
  "[h0]drawbox=x=50:y=75:w=980:h=2:color=#C8A97E@0.9:t=fill[h1]",
  "[h1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("MUSA ESTUDIO  ·  MODELOS IA HIPERREALISTAS") + "':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=94[vheader]",

  // 8.2 Dock Inferior Permanente (Y: 1440 - 1860)
  "[vheader]drawbox=x=40:y=1440:w=1000:h=420:color=#080C14@0.92:t=fill[dock0]",
  "[dock0]drawbox=x=40:y=1440:w=1000:h=2:color=#C8A97E@0.8:t=fill[dock1]",

  // 8.3 Textos Fase 1 (0 a 8.8s): Hook Anti-Plástico
  "[dock1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("¿LA IA PARECE PLÁSTICO?  ·  MÍRAME BIEN") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1485:enable='between(t,0,8.8)'[d1_1]",
  "[d1_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("CREA TU CHICA VIRTUAL") + "':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=1535:enable='between(t,0,8.8)'[d1_2]",
  "[d1_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Consistencia de rostro idéntico y piel real sin código") + "':fontcolor=#CBD5E1:fontsize=30:x=(w-text_w)/2:y=1615:enable='between(t,0,8.8)'[d1_3]",
  "[d1_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL INTENSIVO  ·  SOLO $9.000 COP") + "':fontcolor=#10B981:fontsize=32:x=(w-text_w)/2:y=1700:enable='between(t,0,8.8)'[s1_done]",

  // 8.4 Textos Fase 2 (8.8 a 17.6s): Expresión y Deseo
  "[s1_done]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("GESTUALIDAD VIVA  ·  SENSUALIDAD REAL") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1485:enable='between(t,8.8,17.6)'[d2_1]",
  "[d2_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PIEL HUMANA CON POROS") + "':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=1535:enable='between(t,8.8,17.6)'[d2_2]",
  "[d2_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Mirada seductora y mordida de labio · Cero muñecas de cera") + "':fontcolor=#CBD5E1:fontsize=30:x=(w-text_w)/2:y=1615:enable='between(t,8.8,17.6)'[d2_3]",
  "[d2_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL INTENSIVO  ·  SOLO $9.000 COP") + "':fontcolor=#10B981:fontsize=32:x=(w-text_w)/2:y=1700:enable='between(t,8.8,17.6)'[s2_done]",

  // 8.5 Textos Fase 3 (17.6 a 26.6s): Consistencia y Monetización
  "[s2_done]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("MONETIZACIÓN ANÓNIMA  ·  COBRA EN DÓLARES") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1485:enable='between(t,17.6,26.6)'[d3_1]",
  "[d3_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("MISMO ROSTRO EN CADA FOTO") + "':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=1535:enable='between(t,17.6,26.6)'[d3_2]",
  "[d3_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Crea contenido para Fanvue e Instagram desde tu celular") + "':fontcolor=#CBD5E1:fontsize=30:x=(w-text_w)/2:y=1615:enable='between(t,17.6,26.6)'[d3_3]",
  "[d3_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL INTENSIVO  ·  SOLO $9.000 COP") + "':fontcolor=#10B981:fontsize=32:x=(w-text_w)/2:y=1700:enable='between(t,17.6,26.6)'[s3_done]",

  // 8.6 Textos Fase 4 (26.6 a 35.6s): CTA Final y Cierre
  "[s3_done]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("ACCESO INMEDIATO  ·  13 CLASES + 4 BONOS") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1470:enable='between(t,26.6,35.6)'[d4_1]",
  "[d4_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("SOLO $9.000 COP") + "':fontcolor=#10B981:fontsize=52:x=(w-text_w)/2:y=1525:enable='between(t,26.6,35.6)'[d4_2]",
  "[d4_2]drawbox=x=90:y=1625:w=900:h=90:color=#25D366@0.95:t=fill:enable='between(t,26.6,35.6)'[cta_box]",
  "[cta_box]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("▶ ENVIAR MENSAJE A WHATSAPP") + "':fontcolor=#041008:fontsize=34:x=(w-text_w)/2:y=1655:enable='between(t,26.6,35.6)'[d4_3]",
  "[d4_3]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Habla conmigo por chat y entra a mi estudio hoy mismo") + "':fontcolor=#94A3B8:fontsize=24:x=(w-text_w)/2:y=1750:enable='between(t,26.6,35.6)'[vout]"
].join(";");

const args = [
  "-y",
  "-loop", "1", "-i", img1,
  "-loop", "1", "-i", img2,
  "-loop", "1", "-i", img3,
  "-loop", "1", "-i", img4,
  "-i", audioPath,
  "-filter_complex", filterComplex,
  "-map", "[vout]",
  "-map", "[aout]",
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-pix_fmt", "yuv420p",
  "-b:v", "4500k",
  "-maxrate", "5000k",
  "-bufsize", "10000k",
  "-c:a", "aac",
  "-b:a", "256k",
  "-ar", "48000",
  "-ac", "2",
  "-t", "35.6",
  salidaLocal
];

console.log("Renderizando nuevo video master 9:16 oficial...");
const t0 = Date.now();
const res = spawnSync(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });

if (res.status !== 0) {
  console.error("Error en render FFmpeg:", res.stderr.toString().slice(-800));
  process.exit(1);
}

const duracionSeg = ((Date.now() - t0) / 1000).toFixed(1);
const stats = fs.statSync(salidaLocal);
const mb = (stats.size / (1024 * 1024)).toFixed(2);
console.log(`✓ Render finalizado con éxito en ${duracionSeg}s: ${salidaLocal} (${mb} MB)`);

// Copiar a las rutas de landing requeridas
fs.copyFileSync(salidaLocal, salidaLanding1);
fs.copyFileSync(salidaLocal, salidaLandingOficial);
console.log(`✓ Desplegado en ${salidaLanding1}`);
console.log(`✓ Desplegado en ${salidaLandingOficial}`);

// Generar thumbnails
const thumbs = [
  { t: "00:00:04", out: "creativos-revisar/thumbnails/thumb-sc1.jpg" },
  { t: "00:00:13", out: "creativos-revisar/thumbnails/thumb-sc2.jpg" },
  { t: "00:00:22", out: "creativos-revisar/thumbnails/thumb-sc3.jpg" },
  { t: "00:00:30", out: "creativos-revisar/thumbnails/thumb-sc4.jpg" },
  { t: "00:00:34", out: "creativos-revisar/thumbnails/thumb-cta.jpg" }
];

for (const th of thumbs) {
  spawnSync(ffmpeg, ["-y", "-ss", th.t, "-i", salidaLocal, "-vframes", "1", th.out]);
  fs.copyFileSync(th.out, `next/landing/creativos-thumbs/${th.out.split("/").pop()}`);
}
console.log("✓ Thumbnails generados y sincronizados.");
