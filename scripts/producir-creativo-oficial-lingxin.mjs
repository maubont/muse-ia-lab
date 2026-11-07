// scripts/producir-creativo-oficial-lingxin.mjs
// Creativo Publicitario Oficial 9:16 EN DIFUSIÓN DE VIDEO 3D REAL (Wan 2.2 14B + ByteDance Seedance 1.5 Pro)
// Voz Oficial: 🇨🇴 Lingxin (Qwen 3.1 TTS Plus / Alibaba Cloud ModelStudio) — Oferta $9.000 COP
// 4 Escenas 3D distintas del mismo personaje hiperrealista latino (100% reproducción hacia adelante, CERO boomerang, CERO LivePortrait)

import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

console.log("=== PRODUCCIÓN OFICIAL DEL CREATIVO 9:16 EN DIFUSIÓN DE VIDEO 3D REAL (VOZ LINGXIN $9.000 COP) ===");

const FONT_BLACK = "creativos-revisar/_fonts/ariblk.ttf";
const FONT_BOLD = "creativos-revisar/_fonts/arialbd.ttf";

const vid1 = "creativos-revisar/videos/wan22-sc1-mirror-hq.mp4";
const vid2 = "creativos-revisar/videos/wan22-sc2-lipbite.mp4";
const vid3 = "creativos-revisar/videos/wan22-sc3-allure.mp4";
const vid4 = "creativos-revisar/videos/wan22-sc4-penthouse.mp4";
const audioPath = "next/landing/audio/voz-creativo-sensual.mp3";

const salidaLocal = "creativos-revisar/videos/creativo-musa-master-916.mp4";
const salidaLanding1 = "next/landing/videos/creativo-musa-master-916.mp4";
const salidaLandingOficial = "next/landing/videos/creativo-musa-oficial-2026.mp4";

function esc(t) {
  return t.replace(/%/g, "%%").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

// Duración total sincronizada con voz Lingxin ($9.000 COP): 25.0s (4 escenas 3D reales distintas, 100% forward)
// Escena 1 (0.0 a 5.0s - 5.0s): Mirror Selfie Corset en difusión 3D Wan 2.2 14B (wan22-sc1-mirror-hq.mp4)
// Escena 2 (5.0 a 11.8s - 6.8s): Penthouse Sunset Lip-Bite en difusión 3D Seedance 1.5 Pro (wan22-sc2-lipbite.mp4)
// Escena 3 (11.8 a 18.4s - 6.6s): Suite Golden Hour Corset en difusión 3D Seedance 1.5 Pro (wan22-sc3-allure.mp4)
// Escena 4 (18.4 a 25.0s - 6.6s): Penthouse Champagne Silk Slip Dress CTA $9.000 COP (wan22-sc4-penthouse.mp4)

const filterComplex = [
  // 1. Escena 1 (0.0 - 5.0s): Mirror Selfie Corset 3D Wan 2.2 14B (100% forward)
  "[0:v]trim=start=0:end=5.0,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[sc1]",

  // 2. Escena 2 (5.0 - 11.8s): Penthouse Sunset Lip-Bite 3D Seedance 1.5 Pro (100% forward)
  "[1:v]trim=start=0:end=6.8,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[sc2]",

  // 3. Escena 3 (11.8 - 18.4s): Suite Golden Hour Corset 3D Seedance 1.5 Pro (100% forward)
  "[2:v]trim=start=0:end=6.6,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[sc3]",

  // 4. Escena 4 (18.4 - 25.0s): Penthouse Silk Slip Dress 3D Seedance 1.5 Pro (100% forward)
  "[3:v]trim=start=0:end=6.6,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[sc4]",

  // 5. Concatenar las 4 escenas 3D reales en orden cronológico directo
  "[sc1][sc2][sc3][sc4]concat=n=4:v=1:a=0[vraw]",

  // 6. Post-procesado cinematográfico de textura orgánica (nitidez + contraste editorial)
  "[vraw]unsharp=5:5:0.35:5:5:0.0,eq=contrast=1.02:brightness=0.01:saturation=1.02[vgraded]",

  // 7. Audio oficial Lingxin (Alibaba DashScope) estéreo 48kHz con cola suave
  "[4:a]apad=pad_dur=0.5,atrim=duration=25.0,aformat=channel_layouts=stereo:sample_rates=48000,volume=1.4,afade=t=out:st=24.4:d=0.6[aout]",

  // 8. Overlays Gráficos Seguros
  // 8.1 Header Superior (Y: 75 - 139)
  "[vgraded]drawbox=x=50:y=75:w=980:h=64:color=#080C14@0.85:t=fill[h0]",
  "[h0]drawbox=x=50:y=75:w=980:h=2:color=#C8A97E@0.9:t=fill[h1]",
  "[h1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("MUSA ESTUDIO  ·  MODELOS IA HIPERREALISTAS") + "':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=94[vheader]",

  // 8.2 Dock Inferior Permanente (Y: 1460 - 1860)
  "[vheader]drawbox=x=40:y=1460:w=1000:h=400:color=#080C14@0.88:t=fill[dock0]",
  "[dock0]drawbox=x=40:y=1460:w=1000:h=2:color=#C8A97E@0.8:t=fill[dock1]",

  // 8.3 Textos Fase 1 (0.0 a 5.0s): Hook Anti-Plástico en Movimiento 3D Real
  "[dock1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("¿LA IA PARECE PLÁSTICO?  ·  MÍRAME EN VIDEO") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1495:enable='between(t,0,5.0)'[d1_1]",
  "[d1_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("CREA TU CHICA VIRTUAL") + "':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=1545:enable='between(t,0,5.0)'[d1_2]",
  "[d1_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Consistencia de rostro idéntico y movimiento 3D real") + "':fontcolor=#CBD5E1:fontsize=29:x=(w-text_w)/2:y=1620:enable='between(t,0,5.0)'[d1_3]",
  "[d1_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL INTENSIVO  ·  SOLO $9.000 COP") + "':fontcolor=#10B981:fontsize=32:x=(w-text_w)/2:y=1705:enable='between(t,0,5.0)'[s1_done]",

  // 8.4 Textos Fase 2 (5.0 a 11.8s): Monetización Fanvue & Instagram
  "[s1_done]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("MONETIZACIÓN ANÓNIMA  ·  FANVUE & INSTAGRAM") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1495:enable='between(t,5.0,11.8)'[d2_1]",
  "[d2_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("MISMO ROSTRO EN CADA TOMA") + "':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=1545:enable='between(t,5.0,11.8)'[d2_2]",
  "[d2_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Gestualidad viva, parpadeo natural y cero muñecas de cera") + "':fontcolor=#CBD5E1:fontsize=28:x=(w-text_w)/2:y=1620:enable='between(t,5.0,11.8)'[d2_3]",
  "[d2_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL INTENSIVO  ·  SOLO $9.000 COP") + "':fontcolor=#10B981:fontsize=32:x=(w-text_w)/2:y=1705:enable='between(t,5.0,11.8)'[s2_done]",

  // 8.5 Textos Fase 3 (11.8 a 18.4s): Textura de Piel Real y Método Celular
  "[s2_done]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("REALISMO EXTREMO  ·  DESDE TU CELULAR") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1495:enable='between(t,11.8,18.4)'[d3_1]",
  "[d3_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PIEL HUMANA CON POROS") + "':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=1545:enable='between(t,11.8,18.4)'[d3_2]",
  "[d3_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Aprende mi método paso a paso hoy mismo sin programar") + "':fontcolor=#CBD5E1:fontsize=29:x=(w-text_w)/2:y=1620:enable='between(t,11.8,18.4)'[d3_3]",
  "[d3_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL INTENSIVO  ·  SOLO $9.000 COP") + "':fontcolor=#10B981:fontsize=32:x=(w-text_w)/2:y=1705:enable='between(t,11.8,18.4)'[s3_done]",

  // 8.6 Textos Fase 4 (18.4 a 25.0s): CTA Final y Cierre $9.000 COP
  "[s3_done]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("ACCESO INMEDIATO  ·  13 CLASES + 4 BONOS") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1480:enable='between(t,18.4,25.0)'[d4_1]",
  "[d4_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("SOLO $9.000 COP") + "':fontcolor=#10B981:fontsize=52:x=(w-text_w)/2:y=1535:enable='between(t,18.4,25.0)'[d4_2]",
  "[d4_2]drawbox=x=90:y=1630:w=900:h=88:color=#25D366@0.95:t=fill:enable='between(t,18.4,25.0)'[cta_box]",
  "[cta_box]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("ENVIAR MENSAJE A WHATSAPP  >>") + "':fontcolor=#041008:fontsize=34:x=(w-text_w)/2:y=1658:enable='between(t,18.4,25.0)'[d4_3]",
  "[d4_3]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Habla conmigo por chat y entra a mi estudio hoy mismo") + "':fontcolor=#94A3B8:fontsize=24:x=(w-text_w)/2:y=1750:enable='between(t,18.4,25.0)'[vout]"
].join(";");

const args = [
  "-y",
  "-i", vid1,
  "-i", vid2,
  "-i", vid3,
  "-i", vid4,
  "-i", audioPath,
  "-filter_complex", filterComplex,
  "-map", "[vout]",
  "-map", "[aout]",
  "-c:v", "libx264",
  "-preset", "fast",
  "-crf", "21",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  "-b:a", "256k",
  "-ar", "48000",
  "-ac", "2",
  "-movflags", "+faststart",
  "-t", "25.0",
  salidaLocal
];

console.log("Renderizando nuevo video master 9:16 oficial en difusión 3D real...");
const t0 = Date.now();
const res = spawnSync(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });

if (res.status !== 0) {
  console.error("Error en render FFmpeg:", res.stderr.toString().slice(-1200));
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
fs.mkdirSync("creativos-revisar/thumbnails", { recursive: true });
fs.mkdirSync("next/landing/creativos-thumbs", { recursive: true });
const thumbs = [
  { t: "00:00:02", out: "creativos-revisar/thumbnails/thumb-sc1.jpg" },
  { t: "00:00:08", out: "creativos-revisar/thumbnails/thumb-sc2.jpg" },
  { t: "00:00:15", out: "creativos-revisar/thumbnails/thumb-sc3.jpg" },
  { t: "00:00:21", out: "creativos-revisar/thumbnails/thumb-sc4.jpg" },
  { t: "00:00:23", out: "creativos-revisar/thumbnails/thumb-cta.jpg" }
];

for (const th of thumbs) {
  spawnSync(ffmpeg, ["-y", "-ss", th.t, "-i", salidaLocal, "-vframes", "1", th.out]);
  fs.copyFileSync(th.out, `next/landing/creativos-thumbs/${th.out.split("/").pop()}`);
}
console.log("✓ Thumbnails generados y sincronizados.");
