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

  // 8. Overlays Gráficos Seguros (Personaje 100% Despejado)
  // 8.1 Header Superior Permanente (Y: 75 - 135)
  "[vgraded]drawbox=x=80:y=75:w=920:h=60:color=black@0.7:t=fill[h0]",
  "[h0]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● MUSA IA LAB  |  MODELOS VIRTUALES +18") + "':fontcolor=white:fontsize=30:x=(w-text_w)/2:y=90[vheader]",

  // 8.2 Dock Inferior Permanente (Y: 1460 - 1870, libre de rostro y cuerpo)
  "[vheader]drawbox=x=50:y=1460:w=980:h=410:color=#060910@0.88:t=fill[dock0]",
  "[dock0]drawbox=x=50:y=1460:w=980:h=4:color=#00FF88@0.85:t=fill[dock1]",

  // 8.3 Textos Fase 1 (0 a 8.5s): Hook Fanvue
  "[dock1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("MONETIZA MODELOS EN FANVUE") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1510:enable='between(t,0,8.5)'[d1_1]",
  "[d1_1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("El mercado de contenido exclusivo más rentable") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1580:enable='between(t,0,8.5)'[d1_2]",
  "[d1_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● Facturación mensual en dólares reales") + "':fontcolor=#00FF88:fontsize=34:x=(w-text_w)/2:y=1660:enable='between(t,0,8.5)'[d1_3]",
  "[d1_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PAGO ÚNICO $33.000 COP") + "':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=1750:enable='between(t,0,8.5)'[s1_done]",

  // 8.4 Textos Fase 2 (8.5 a 17.5s): Anti-Plástico & Consistencia Real
  "[s1_done]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("CERO MUÑECAS DE PLÁSTICO") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1510:enable='between(t,8.5,17.5)'[d2_1]",
  "[d2_1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("El secreto de las agencias top es la consistencia real") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1580:enable='between(t,8.5,17.5)'[d2_2]",
  "[d2_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● Mismo rostro, cuerpo y estilo en cada toma") + "':fontcolor=#00FF88:fontsize=34:x=(w-text_w)/2:y=1660:enable='between(t,8.5,17.5)'[d2_3]",
  "[d2_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PAGO ÚNICO $33.000 COP") + "':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=1750:enable='between(t,8.5,17.5)'[s2_done]",

  // 8.5 Textos Fase 3 (17.5 a 26.0s): Textura & Piel Real
  "[s2_done]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TEXTURA DE PIEL TOTALMENTE REAL") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1510:enable='between(t,17.5,26.0)'[d3_1]",
  "[d3_1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Poros reales, miradas magnéticas y presencia viva") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1580:enable='between(t,17.5,26.0)'[d3_2]",
  "[d3_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● Calidad cinematográfica lista para suscriptores") + "':fontcolor=#00FF88:fontsize=34:x=(w-text_w)/2:y=1660:enable='between(t,17.5,26.0)'[d3_3]",
  "[d3_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PAGO ÚNICO $33.000 COP") + "':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=1750:enable='between(t,17.5,26.0)'[s3_done]",

  // 8.6 Textos Fase 4 (26.0 a 30.5s): Oferta del Taller
  "[s3_done]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL INTENSIVO") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1505:enable='between(t,26.0,30.5)'[d4_1]",
  "[d4_1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Aprende el método en una tarde · Sin programar") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1575:enable='between(t,26.0,30.5)'[d4_2]",
  "[d4_2]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("SOLO $33.000 COP") + "':fontcolor=#00FF88:fontsize=58:x=(w-text_w)/2:y=1650:enable='between(t,26.0,30.5)'[d4_3]",
  "[d4_3]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Acceso Vitalicio · 13 Clases + Prompts VIP") + "':fontcolor=white:fontsize=30:x=(w-text_w)/2:y=1735:enable='between(t,26.0,30.5)'[s4_done]",

  // 8.7 Textos Fase 5 (30.5 a 34.5s): Clímax de Conversión WhatsApp
  "[s4_done]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("EMPIEZA HOY MISMO") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1495:enable='between(t,30.5,34.5)'[d5_1]",
  "[d5_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("SOLO $33.000 COP") + "':fontcolor=#00FF88:fontsize=64:x=(w-text_w)/2:y=1565:enable='between(t,30.5,34.5)'[d5_2]",
  "[d5_2]drawbox=x=130:y=1665:w=820:h=90:color=#00A859@0.92:t=fill:enable='between(t,30.5,34.5)'[cta_box]",
  "[cta_box]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TOCA AQUÍ PARA ESCRIBIR A WHATSAPP") + "':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=1695:enable='between(t,30.5,34.5)'[d5_3]",
  "[d5_3]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Cupos Limitados · Entrega Automática") + "':fontcolor=#8b949e:fontsize=28:x=(w-text_w)/2:y=1780:enable='between(t,30.5,34.5)'[vout]"
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
