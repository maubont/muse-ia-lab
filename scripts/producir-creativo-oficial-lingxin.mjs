// scripts/producir-creativo-oficial-lingxin.mjs
// Creativo Publicitario Oficial 9:16 EN MOVIMIENTO NEURONAL REAL (LivePortrait A10G + Voz Lingxin)
// Voz Oficial: 🇨🇴 Lingxin (Qwen 3.1 TTS Plus / Alibaba Cloud ModelStudio) — Oferta $9.000 COP
// Escenas en Movimiento Real: escena1.mp4 (Penthouse Sunset Lip-Bite Viva) y escena2.mp4 (Penthouse Golden Hour Viva)

import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

console.log("=== PRODUCCIÓN OFICIAL DEL CREATIVO 9:16 EN VIDEO HIPERREALISTA VIVO (VOZ LINGXIN $9.000 COP) ===");

const FONT_BLACK = "creativos-revisar/_fonts/ariblk.ttf";
const FONT_BOLD = "creativos-revisar/_fonts/arialbd.ttf";

const vid1 = "creativos-revisar/videos/escenas-vivas/escena1.mp4";
const vid2 = "creativos-revisar/videos/escenas-vivas/escena2.mp4";
const audioPath = "next/landing/audio/voz-creativo-sensual.mp3";

const salidaLocal = "creativos-revisar/videos/creativo-musa-master-916.mp4";
const salidaLanding1 = "next/landing/videos/creativo-musa-master-916.mp4";
const salidaLandingOficial = "next/landing/videos/creativo-musa-oficial-2026.mp4";

function esc(t) {
  return t.replace(/%/g, "%%").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

// Duración total sincronizada con voz Lingxin ($9.000 COP): 25.2s (4 planos en movimiento real de 6.3s cada uno)
// Escena 1 (0.0 a 6.3s): Plano Medio Penthouse Sunset (escena1.mp4 en movimiento neuronal real)
// Escena 2 (6.3 a 12.6s): Plano Frontal Suite Golden Hour (escena2.mp4 en movimiento neuronal real)
// Escena 3 (12.6 a 18.9s): Close-Up Macro 85mm Piel & Mirada Viva (escena1.mp4 macro en movimiento neuronal real)
// Escena 4 (18.9 a 25.2s): Medium Close-Up Golden Hour CTA $9.000 COP (escena2.mp4 close-up en movimiento neuronal real)

const filterComplex = [
  // 1. Escena 1 (0.0 - 6.3s): Plano Medio Penthouse Sunset en movimiento neuronal continuo
  "[0:v]split[e1f][e1r];[e1r]reverse[e1rev];[e1f][e1rev]concat=n=2:v=1:a=0,setpts=1.05*PTS,scale=1180:1920:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2 + sin(n/22)*8':y='(in_h-out_h)/2 + cos(n/28)*6',trim=duration=6.3,setsar=1,fps=30[sc1]",

  // 2. Escena 2 (6.3 - 12.6s): Plano Frontal Suite Golden Hour en movimiento neuronal continuo
  "[1:v]split[e2f][e2r];[e2r]reverse[e2rev];[e2f][e2rev]concat=n=2:v=1:a=0,setpts=1.05*PTS,scale=1120:1998:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2 + cos(n/24)*6':y='(in_h-out_h)*0.35 + sin(n/26)*6',trim=duration=6.3,setsar=1,fps=30[sc2]",

  // 3. Escena 3 (12.6 - 18.9s): Close-Up Macro 85mm Rostro, Piel Real y Mirada Viva
  "[0:v]trim=start=0.5:end=4.4,setpts=PTS-STARTPTS,split[e3f][e3r];[e3r]reverse[e3rev];[e3rev][e3f]concat=n=2:v=1:a=0,setpts=1.05*PTS,scale=1560:2089:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)*0.54 + sin(n/20)*8':y='(in_h-out_h)*0.18 + (n/189)*28',trim=duration=6.3,setsar=1,fps=30[sc3]",

  // 4. Escena 4 (18.9 - 25.2s): Medium Close-Up Golden Hour CTA $9.000 COP
  "[1:v]trim=start=0.4:end=4.4,setpts=PTS-STARTPTS,split[e4f][e4r];[e4r]reverse[e4rev];[e4rev][e4f]concat=n=2:v=1:a=0,setpts=1.05*PTS,scale=1340:2390:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2 + sin(n/18)*8':y='(in_h-out_h)*0.22 - (n/189)*26',trim=duration=6.3,setsar=1,fps=30[sc4]",

  // 5. Concatenar los 4 planos de video neuronal real
  "[sc1][sc2][sc3][sc4]concat=n=4:v=1:a=0[vraw]",

  // 6. Post-procesado cinematográfico de textura orgánica (grano fino + micro-contraste de poros)
  "[vraw]noise=alls=3:allf=t+u,unsharp=5:5:0.35:5:5:0.0,eq=contrast=1.03:brightness=0.01:saturation=1.03[vgraded]",

  // 7. Audio oficial Lingxin (Alibaba DashScope) estéreo 48kHz con cola suave
  "[2:a]apad=pad_dur=0.6,atrim=duration=25.2,aformat=channel_layouts=stereo:sample_rates=48000,volume=1.4,afade=t=out:st=24.6:d=0.6[aout]",

  // 8. Overlays Gráficos Seguros
  // 8.1 Header Superior (Y: 75 - 139)
  "[vgraded]drawbox=x=50:y=75:w=980:h=64:color=#080C14@0.85:t=fill[h0]",
  "[h0]drawbox=x=50:y=75:w=980:h=2:color=#C8A97E@0.9:t=fill[h1]",
  "[h1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("MUSA ESTUDIO  ·  MODELOS IA HIPERREALISTAS") + "':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=94[vheader]",

  // 8.2 Dock Inferior Permanente (Y: 1440 - 1860)
  "[vheader]drawbox=x=40:y=1440:w=1000:h=420:color=#080C14@0.92:t=fill[dock0]",
  "[dock0]drawbox=x=40:y=1440:w=1000:h=2:color=#C8A97E@0.8:t=fill[dock1]",

  // 8.3 Textos Fase 1 (0.0 a 6.3s): Hook Anti-Plástico en Movimiento Real
  "[dock1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("¿LA IA PARECE PLÁSTICO?  ·  MÍRAME EN VIDEO") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1485:enable='between(t,0,6.3)'[d1_1]",
  "[d1_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("CREA TU CHICA VIRTUAL") + "':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=1535:enable='between(t,0,6.3)'[d1_2]",
  "[d1_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Consistencia de rostro idéntico y movimiento vivo") + "':fontcolor=#CBD5E1:fontsize=30:x=(w-text_w)/2:y=1615:enable='between(t,0,6.3)'[d1_3]",
  "[d1_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL INTENSIVO  ·  SOLO $9.000 COP") + "':fontcolor=#10B981:fontsize=32:x=(w-text_w)/2:y=1700:enable='between(t,0,6.3)'[s1_done]",

  // 8.4 Textos Fase 2 (6.3 a 12.6s): Monetización Fanvue & Instagram
  "[s1_done]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("MONETIZACIÓN ANÓNIMA  ·  FANVUE & INSTAGRAM") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1485:enable='between(t,6.3,12.6)'[d2_1]",
  "[d2_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("MISMO ROSTRO EN CADA TOMA") + "':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=1535:enable='between(t,6.3,12.6)'[d2_2]",
  "[d2_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Gestualidad viva, parpadeo natural y cero muñecas de cera") + "':fontcolor=#CBD5E1:fontsize=28:x=(w-text_w)/2:y=1615:enable='between(t,6.3,12.6)'[d2_3]",
  "[d2_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL INTENSIVO  ·  SOLO $9.000 COP") + "':fontcolor=#10B981:fontsize=32:x=(w-text_w)/2:y=1700:enable='between(t,6.3,12.6)'[s2_done]",

  // 8.5 Textos Fase 3 (12.6 a 18.9s): Textura de Piel Real y Método Celular
  "[s2_done]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("REALISMO EXTREMO  ·  DESDE TU CELULAR") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1485:enable='between(t,12.6,18.9)'[d3_1]",
  "[d3_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PIEL HUMANA CON POROS") + "':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=1535:enable='between(t,12.6,18.9)'[d3_2]",
  "[d3_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Aprende mi método paso a paso hoy mismo sin programar") + "':fontcolor=#CBD5E1:fontsize=29:x=(w-text_w)/2:y=1615:enable='between(t,12.6,18.9)'[d3_3]",
  "[d3_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL INTENSIVO  ·  SOLO $9.000 COP") + "':fontcolor=#10B981:fontsize=32:x=(w-text_w)/2:y=1700:enable='between(t,12.6,18.9)'[s3_done]",

  // 8.6 Textos Fase 4 (18.9 a 25.2s): CTA Final y Cierre $9.000 COP
  "[s3_done]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("ACCESO INMEDIATO  ·  13 CLASES + 4 BONOS") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1470:enable='between(t,18.9,25.2)'[d4_1]",
  "[d4_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("SOLO $9.000 COP") + "':fontcolor=#10B981:fontsize=52:x=(w-text_w)/2:y=1525:enable='between(t,18.9,25.2)'[d4_2]",
  "[d4_2]drawbox=x=90:y=1625:w=900:h=90:color=#25D366@0.95:t=fill:enable='between(t,18.9,25.2)'[cta_box]",
  "[cta_box]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("ENVIAR MENSAJE A WHATSAPP  >>") + "':fontcolor=#041008:fontsize=34:x=(w-text_w)/2:y=1655:enable='between(t,18.9,25.2)'[d4_3]",
  "[d4_3]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Habla conmigo por chat y entra a mi estudio hoy mismo") + "':fontcolor=#94A3B8:fontsize=24:x=(w-text_w)/2:y=1750:enable='between(t,18.9,25.2)'[vout]"
].join(";");

const args = [
  "-y",
  "-i", vid1,
  "-i", vid2,
  "-i", audioPath,
  "-filter_complex", filterComplex,
  "-map", "[vout]",
  "-map", "[aout]",
  "-c:v", "libx264",
  "-preset", "fast",
  "-crf", "18",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  "-b:a", "256k",
  "-ar", "48000",
  "-ac", "2",
  "-movflags", "+faststart",
  "-t", "25.2",
  salidaLocal
];

console.log("Renderizando nuevo video master 9:16 oficial en movimiento neuronal vivo...");
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
