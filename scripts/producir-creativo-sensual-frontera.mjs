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

const img1 = "creativos-revisar/originales/sensual-f1-hook.jpg";
const img2 = "creativos-revisar/originales/sensual-f2-cuerpo.jpg";
const img3 = "creativos-revisar/originales/sensual-f3-rostro.jpg";
const img4 = "creativos-revisar/originales/sensual-f4-cta.jpg";
const audioPath = "creativos-revisar/audio/voz-creativo-sensual.mp3";

const salidaLocal = "creativos-revisar/videos/creativo-musa-master-916.mp4";
const salidaLanding1 = "next/landing/videos/creativo-musa-master-916.mp4";
const salidaLanding2 = "next/landing/videos/creativo-musa-sensual-movimiento.mp4";

function esc(t) {
  return t.replace(/%/g, "%%").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

// 4 escenas hiperrealistas con movimiento cinemático orgánico humano (micro-drift, respiración, paneo suave)
// Duraciones sincronizadas con la locución de 26.5s:
// Escena 1: 0 a 6.2s (6.2s)
// Escena 2: 6.2 a 13.0s (6.8s)
// Escena 3: 13.0 a 19.5s (6.5s)
// Escena 4: 19.5 a 27.0s (7.5s)
// Total video: 27.0s

const filterComplex = [
  // 1. Escena 1 (Hook): Push-in orgánico hacia rostro con micro-vibración de mano
  "[0:v]scale=1240:2204:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2 + sin(n/18)*10':y='(in_h-out_h)/2 - 30 + (n/186)*50',trim=duration=6.2,setsar=1,fps=30[sc1]",

  // 2. Escena 2 (Cuerpo / Silueta): Recorrido pedestal suave subiendo por su espalda y silueta hacia el rostro
  "[1:v]scale=1240:2204:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2 + cos(n/20)*10':y='(in_h-out_h)*0.8 - (n/204)*(in_h-out_h)*0.6',trim=duration=6.8,setsar=1,fps=30[sc2]",

  // 3. Escena 3 (Textura / Rostro): Macro push-in lento resaltando microporos y ojos avellana
  "[2:v]scale=1260:2240:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2 + sin(n/22)*8':y='(in_h-out_h)/2 + (n/195)*40',trim=duration=6.5,setsar=1,fps=30[sc3]",

  // 4. Escena 4 (Candid Selfie / CTA): Respiración natural de cámara en mano estilo historia íntima
  "[3:v]scale=1220:2168:force_original_aspect_ratio=increase,crop=1080:1920:x='(in_w-out_w)/2 + sin(n/16)*12':y='(in_h-out_h)/2 + cos(n/24)*12',trim=duration=7.5,setsar=1,fps=30[sc4]",

  // 5. Concatenar las 4 secuencias de movimiento continuo (27.0s)
  "[sc1][sc2][sc3][sc4]concat=n=4:v=1:a=0[vraw]",

  // 6. Post-procesamiento cinematográfico de frontera:
  // - Grano de película 35mm (ISO 400) que destruye el plástico digital
  // - Enfoque de micro-contraste en textura de piel
  // - Ajuste de contraste y calidez de sensor Sony FX3
  "[vraw]noise=alls=5:allf=t+u,unsharp=5:5:0.4:5:5:0.0,eq=contrast=1.03:brightness=0.01:saturation=1.02[vgraded]",

  // 7. Pista de audio: voz Nova HD limpia con remate suave y cola de reverberación natural en estéreo 48kHz
  "[4:a]aformat=channel_layouts=stereo:sample_rates=48000,volume=1.8,afade=t=out:st=26.3:d=0.7[aout]",

  // 8. Overlays Gráficos Seguros (Personaje 100% Despejado)
  // 8.1 Header Superior Permanente (Y: 75 - 135)
  "[vgraded]drawbox=x=80:y=75:w=920:h=60:color=black@0.7:t=fill[h0]",
  "[h0]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● MUSA IA LAB  |  MODELOS VIRTUALES +18") + "':fontcolor=white:fontsize=30:x=(w-text_w)/2:y=90[vheader]",

  // 8.2 Dock Inferior Permanente (Y: 1460 - 1870, libre de rostro y cuerpo)
  "[vheader]drawbox=x=50:y=1460:w=980:h=410:color=#060910@0.88:t=fill[dock0]",
  "[dock0]drawbox=x=50:y=1460:w=980:h=4:color=#00FF88@0.85:t=fill[dock1]",

  // 8.3 Textos Fase 1 (0 a 6.2s): Hook Fanvue
  "[dock1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("MONETIZA MODELOS EN FANVUE") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1510:enable='between(t,0,6.2)'[d1_1]",
  "[d1_1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("El mercado de contenido exclusivo más rentable") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1580:enable='between(t,0,6.2)'[d1_2]",
  "[d1_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● Facturación mensual en dólares reales") + "':fontcolor=#00FF88:fontsize=34:x=(w-text_w)/2:y=1660:enable='between(t,0,6.2)'[d1_3]",
  "[d1_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PAGO ÚNICO $33.000 COP") + "':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=1750:enable='between(t,0,6.2)'[s1_done]",

  // 8.4 Textos Fase 2 (6.2 a 13.0s): Anti-Plástico & Consistencia Real
  "[s1_done]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("CERO MUÑECAS DE PLÁSTICO") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1510:enable='between(t,6.2,13.0)'[d2_1]",
  "[d2_1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("El secreto de las agencias top es la consistencia real") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1580:enable='between(t,6.2,13.0)'[d2_2]",
  "[d2_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● Mismo rostro, cuerpo y estilo en cada toma") + "':fontcolor=#00FF88:fontsize=34:x=(w-text_w)/2:y=1660:enable='between(t,6.2,13.0)'[d2_3]",
  "[d2_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PAGO ÚNICO $33.000 COP") + "':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=1750:enable='between(t,6.2,13.0)'[s2_done]",

  // 8.5 Textos Fase 3 (13.0 a 19.5s): Textura & Piel Real
  "[s2_done]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TEXTURA DE PIEL TOTALMENTE REAL") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1510:enable='between(t,13.0,19.5)'[d3_1]",
  "[d3_1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Poros reales, miradas magnéticas y presencia viva") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1580:enable='between(t,13.0,19.5)'[d3_2]",
  "[d3_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● Calidad cinematográfica lista para suscriptores") + "':fontcolor=#00FF88:fontsize=34:x=(w-text_w)/2:y=1660:enable='between(t,13.0,19.5)'[d3_3]",
  "[d3_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PAGO ÚNICO $33.000 COP") + "':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=1750:enable='between(t,13.0,19.5)'[s3_done]",

  // 8.6 Textos Fase 4 (19.5 a 23.5s): Oferta del Taller
  "[s3_done]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL INTENSIVO") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1505:enable='between(t,19.5,23.5)'[d4_1]",
  "[d4_1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Aprende el método en una tarde · Sin programar") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1575:enable='between(t,19.5,23.5)'[d4_2]",
  "[d4_2]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("SOLO $33.000 COP") + "':fontcolor=#00FF88:fontsize=58:x=(w-text_w)/2:y=1650:enable='between(t,19.5,23.5)'[d4_3]",
  "[d4_3]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Acceso Vitalicio · 13 Clases + Prompts VIP") + "':fontcolor=white:fontsize=30:x=(w-text_w)/2:y=1735:enable='between(t,19.5,23.5)'[s4_done]",

  // 8.7 Textos Fase 5 (23.5 a 27.0s): Clímax de Conversión WhatsApp
  "[s4_done]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("EMPIEZA HOY MISMO") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1495:enable='between(t,23.5,27.0)'[d5_1]",
  "[d5_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("SOLO $33.000 COP") + "':fontcolor=#00FF88:fontsize=64:x=(w-text_w)/2:y=1565:enable='between(t,23.5,27.0)'[d5_2]",
  "[d5_2]drawbox=x=130:y=1665:w=820:h=90:color=#00A859@0.92:t=fill:enable='between(t,23.5,27.0)'[cta_box]",
  "[cta_box]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TOCA AQUÍ PARA ESCRIBIR A WHATSAPP") + "':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=1695:enable='between(t,23.5,27.0)'[d5_3]",
  "[d5_3]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Cupos Limitados · Entrega Automática") + "':fontcolor=#8b949e:fontsize=28:x=(w-text_w)/2:y=1780:enable='between(t,23.5,27.0)'[vout]"
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
  "-t", "27.0",
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

// Copiar a las dos rutas de landing
fs.copyFileSync(salidaLocal, salidaLanding1);
fs.copyFileSync(salidaLocal, salidaLanding2);
console.log(`✓ Desplegado en ${salidaLanding1}`);
console.log(`✓ Desplegado en ${salidaLanding2}`);

// Generar thumbnails de verificación
const thumbs = [
  { t: "00:00:03", out: "creativos-revisar/thumbnails/thumb-sc1.jpg" },
  { t: "00:00:09", out: "creativos-revisar/thumbnails/thumb-sc2.jpg" },
  { t: "00:00:16", out: "creativos-revisar/thumbnails/thumb-sc3.jpg" },
  { t: "00:00:21", out: "creativos-revisar/thumbnails/thumb-sc4.jpg" },
  { t: "00:00:25", out: "creativos-revisar/thumbnails/thumb-cta.jpg" }
];

for (const th of thumbs) {
  spawnSync(ffmpeg, ["-y", "-ss", th.t, "-i", salidaLocal, "-vframes", "1", th.out]);
  fs.copyFileSync(th.out, `next/landing/creativos-thumbs/${th.out.split("/").pop()}`);
}
console.log("✓ Thumbnails generados y sincronizados.");
