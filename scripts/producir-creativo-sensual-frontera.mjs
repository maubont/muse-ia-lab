// scripts/producir-creativo-sensual-frontera.mjs
// Master Creator: Gemini 3.8 Flash en High Thinking Mode
// Creativo 9:16 Hiperrealista de Frontera (Indistinguible de la realidad, Piel Real, Cero Plástico)
// Audio limpio sincronizado sin corte al final (Nova HD) + $33.000 COP + Zonas Seguras 100% Libres

import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

console.log("=== PRODUCCIÓN MASTER DE CREATIVO 9:16 FRONTERA HIPERREALISTA ===");

const FONT_BLACK = "creativos-revisar/_fonts/ariblk.ttf";
const FONT_BOLD = "creativos-revisar/_fonts/arialbd.ttf";

const img1 = "next/landing/assets/musa-sporty-1.jpg";
const img2 = "next/landing/assets/musa-sporty-2.jpg";
const img3 = "creativos-revisar/originales/sensual-f3-rostro.jpg";
const img4 = "next/landing/assets/musa-emerald-sensual.jpg";
const audioPath = "next/landing/audio/musa-v1-salome-limpia.mp3";

const salidaLocal = "creativos-revisar/videos/creativo-musa-master-916.mp4";
const salidaLanding1 = "next/landing/videos/creativo-musa-master-916.mp4";
const salidaLanding2 = "next/landing/videos/creativo-musa-sensual-movimiento.mp4";
const salidaLanding3 = "next/landing/videos/creativo-musa-v7-final.mp4";

function esc(t) {
  return t.replace(/%/g, "%%").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

// 4 escenas hiperrealistas con movimiento cinemático orgánico humano (micro-drift, respiración, paneo suave)
// Sincronizadas con la locución natural de Salomé Colombia (34.5s):
// Escena 1: 0 a 8.5s (8.5s) - Hook Sporty Gym 19 años
// Escena 2: 8.5 a 17.5s (9.0s) - Penthouse Sunset Silk Slip Dress Sensual
// Escena 3: 17.5 a 26.0s (8.5s) - Macro Piel Real & Ojos
// Escena 4: 26.0 a 34.5s (8.5s) - Emerald Velvet Lounge / CTA WhatsApp
// Total video: 34.5s

const filterComplex = [
  // 1. Escena 1 (Hook Sporty): Push-in orgánico hacia rostro con micro-vibración de mano
  "[0:v]scale=1240:2204:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2 + sin(n/20)*10':y='(in_h-out_h)/2 - 30 + (n/255)*50',trim=duration=8.5,setsar=1,fps=30[sc1]",

  // 2. Escena 2 (Penthouse Sunset Sensual): Recorrido suave hacia su mirada y vestido de satén
  "[1:v]scale=1240:2204:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2 + cos(n/24)*10':y='(in_h-out_h)*0.8 - (n/270)*(in_h-out_h)*0.6',trim=duration=9.0,setsar=1,fps=30[sc2]",

  // 3. Escena 3 (Textura / Rostro): Macro push-in lento resaltando microporos y ojos avellana
  "[2:v]scale=1260:2240:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2 + sin(n/26)*8':y='(in_h-out_h)/2 + (n/255)*40',trim=duration=8.5,setsar=1,fps=30[sc3]",

  // 4. Escena 4 (Emerald Velvet / CTA): Respiración natural de cámara en mano íntima
  "[3:v]scale=1220:2168:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2 + sin(n/18)*12':y='(in_h-out_h)/2 + cos(n/25)*12',trim=duration=8.5,setsar=1,fps=30[sc4]",

  // 5. Concatenar las 4 secuencias de movimiento continuo (34.5s)
  "[sc1][sc2][sc3][sc4]concat=n=4:v=1:a=0[vraw]",

  // 6. Post-procesamiento cinematográfico de frontera:
  // - Grano de película 35mm (ISO 400) que destruye el plástico digital
  // - Enfoque de micro-contraste en textura de piel
  // - Ajuste de contraste y calidez de sensor Sony FX3
  "[vraw]noise=alls=5:allf=t+u,unsharp=5:5:0.4:5:5:0.0,eq=contrast=1.03:brightness=0.01:saturation=1.02[vgraded]",

  // 7. Pista de audio: voz Salomé limpia con remate suave y estéreo 48kHz
  "[4:a]aformat=channel_layouts=stereo:sample_rates=48000,volume=1.5,afade=t=out:st=33.8:d=0.7[aout]",

  // 8. Overlays Gráficos Seguros (Atelier Musa Estudio - Elegante, Minimalista y Limpio)
  // 8.1 Header Superior Permanente (Y: 75 - 139)
  "[vgraded]drawbox=x=50:y=75:w=980:h=64:color=#080C14@0.85:t=fill[h0]",
  "[h0]drawbox=x=50:y=75:w=980:h=2:color=#C8A97E@0.9:t=fill[h1]",
  "[h1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("MUSA ESTUDIO  ·  ATELIER DE CREACIÓN HIPERREALISTA") + "':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=94[vheader]",

  // 8.2 Dock Inferior Permanente (Y: 1440 - 1860, libre de rostro y cuerpo)
  "[vheader]drawbox=x=40:y=1440:w=1000:h=420:color=#080C14@0.92:t=fill[dock0]",
  "[dock0]drawbox=x=40:y=1440:w=1000:h=2:color=#C8A97E@0.8:t=fill[dock1]",

  // 8.3 Textos Fase 1 (0 a 8.5s): Hook Atelier
  "[dock1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("ATELIER EXCLUSIVO  ·  MODELOS HIPERREALISTAS") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1485:enable='between(t,0,8.5)'[d1_1]",
  "[d1_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("CREA TU MODELO VIRTUAL") + "':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=1535:enable='between(t,0,8.5)'[d1_2]",
  "[d1_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Consistencia facial total y piel real · Facturación en dólares") + "':fontcolor=#CBD5E1:fontsize=30:x=(w-text_w)/2:y=1615:enable='between(t,0,8.5)'[d1_3]",
  "[d1_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL INTENSIVO  ·  PAGO ÚNICO $33.000 COP") + "':fontcolor=#10B981:fontsize=32:x=(w-text_w)/2:y=1700:enable='between(t,0,8.5)'[s1_done]",

  // 8.4 Textos Fase 2 (8.5 a 17.5s): Dominio de Identidad & Expresión
  "[s1_done]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("DOMINIO DE IDENTIDAD  ·  GESTUALIDAD VIVA") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1485:enable='between(t,8.5,17.5)'[d2_1]",
  "[d2_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("MISMO ROSTRO EN CADA ESCENA") + "':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=1535:enable='between(t,8.5,17.5)'[d2_2]",
  "[d2_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Cero muñecas de plástico · Expresión seductora real") + "':fontcolor=#CBD5E1:fontsize=30:x=(w-text_w)/2:y=1615:enable='between(t,8.5,17.5)'[d2_3]",
  "[d2_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL INTENSIVO  ·  PAGO ÚNICO $33.000 COP") + "':fontcolor=#10B981:fontsize=32:x=(w-text_w)/2:y=1700:enable='between(t,8.5,17.5)'[s2_done]",

  // 8.5 Textos Fase 3 (17.5 a 26.0s): Calidad Cinematográfica & Macro Piel
  "[s2_done]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("ACABADO CINEMATOGRÁFICO  ·  MACRO PIEL") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1485:enable='between(t,17.5,26.0)'[d3_1]",
  "[d3_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TEXTURA DE PIEL INDISTINGUIBLE") + "':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=1535:enable='between(t,17.5,26.0)'[d3_2]",
  "[d3_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Poros auténticos y miradas vivas de calidad editorial") + "':fontcolor=#CBD5E1:fontsize=30:x=(w-text_w)/2:y=1615:enable='between(t,17.5,26.0)'[d3_3]",
  "[d3_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL INTENSIVO  ·  PAGO ÚNICO $33.000 COP") + "':fontcolor=#10B981:fontsize=32:x=(w-text_w)/2:y=1700:enable='between(t,17.5,26.0)'[s3_done]",

  // 8.6 Textos Fase 4 (26.0 a 30.5s): Propuesta del Taller
  "[s3_done]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("METODOLOGÍA PRÁCTICA  ·  APRENDE EN UNA TARDE") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1475:enable='between(t,26.0,30.5)'[d4_1]",
  "[d4_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("13 CLASES + PROMPTS VIP DE AGENCIA") + "':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=1530:enable='between(t,26.0,30.5)'[d4_2]",
  "[d4_2]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("SOLO $33.000 COP") + "':fontcolor=#10B981:fontsize=56:x=(w-text_w)/2:y=1610:enable='between(t,26.0,30.5)'[d4_3]",
  "[d4_3]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Acceso vitalicio inmediato · Sin programar") + "':fontcolor=#CBD5E1:fontsize=28:x=(w-text_w)/2:y=1705:enable='between(t,26.0,30.5)'[s4_done]",

  // 8.7 Textos Fase 5 (30.5 a 34.5s): Clímax de Conversión WhatsApp
  "[s4_done]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("INSCRIPCIONES ABIERTAS  ·  CUPOS LIMITADOS") + "':fontcolor=#C8A97E:fontsize=26:x=(w-text_w)/2:y=1470:enable='between(t,30.5,34.5)'[d5_1]",
  "[d5_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PAGO ÚNICO $33.000 COP") + "':fontcolor=#10B981:fontsize=54:x=(w-text_w)/2:y=1525:enable='between(t,30.5,34.5)'[d5_2]",
  "[d5_2]drawbox=x=90:y=1630:w=900:h=90:color=#25D366@0.95:t=fill:enable='between(t,30.5,34.5)'[cta_box]",
  "[cta_box]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("▶ ESCRIBIR A WHATSAPP PARA ACCEDER") + "':fontcolor=#041008:fontsize=34:x=(w-text_w)/2:y=1660:enable='between(t,30.5,34.5)'[d5_3]",
  "[d5_3]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Atención personalizada · Entrega inmediata del taller") + "':fontcolor=#94A3B8:fontsize=24:x=(w-text_w)/2:y=1755:enable='between(t,30.5,34.5)'[vout]"
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
  "-t", "34.5",
  salidaLocal
];

console.log("Renderizando video master con ffmpeg-static...");
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

// Copiar a las rutas de landing
fs.copyFileSync(salidaLocal, salidaLanding1);
fs.copyFileSync(salidaLocal, salidaLanding2);
fs.copyFileSync(salidaLocal, salidaLanding3);
console.log(`✓ Desplegado en ${salidaLanding1}`);
console.log(`✓ Desplegado en ${salidaLanding2}`);
console.log(`✓ Desplegado en ${salidaLanding3}`);

// Generar thumbnails de verificación
const thumbs = [
  { t: "00:00:04", out: "creativos-revisar/thumbnails/thumb-sc1.jpg" },
  { t: "00:00:12", out: "creativos-revisar/thumbnails/thumb-sc2.jpg" },
  { t: "00:00:20", out: "creativos-revisar/thumbnails/thumb-sc3.jpg" },
  { t: "00:00:28", out: "creativos-revisar/thumbnails/thumb-sc4.jpg" },
  { t: "00:00:32", out: "creativos-revisar/thumbnails/thumb-cta.jpg" }
];

for (const th of thumbs) {
  spawnSync(ffmpeg, ["-y", "-ss", th.t, "-i", salidaLocal, "-vframes", "1", th.out]);
  fs.copyFileSync(th.out, `next/landing/creativos-thumbs/${th.out.split("/").pop()}`);
}
console.log("✓ Thumbnails generados y sincronizados.");
