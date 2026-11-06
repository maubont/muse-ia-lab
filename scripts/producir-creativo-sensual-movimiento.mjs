// scripts/producir-creativo-sensual-movimiento.mjs — Creativo 9:16 con personaje real en movimiento (Wan AI Video) + Audio Sensual
import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

console.log("=== INICIANDO PRODUCCIÓN DE CREATIVO CON PERSONAJE REAL EN MOVIMIENTO ===");

const FONT_BLACK = "creativos-revisar/_fonts/ariblk.ttf";
const FONT_BOLD = "creativos-revisar/_fonts/arialbd.ttf";

const v1 = "creativos-revisar/videos/cand/cineA-sensual1-wan-1.mp4";
const v2 = "creativos-revisar/videos/cand/cineB-sensual2-wan-1.mp4";
const v3 = "creativos-revisar/videos/cand/ABig-cine-wan-a.mp4";
const v4 = "creativos-revisar/videos/cand/cineA-sensual1-wan-2.mp4";
const v5 = "creativos-revisar/videos/cand/cineB-sensual2-wan-2.mp4";
const audioPath = "creativos-revisar/audio/voz-creativo-sensual.mp3";

const salidaLocal = "creativos-revisar/videos/creativo-musa-master-916.mp4";
const salidaLanding = "next/landing/videos/creativo-musa-master-916.mp4";

function esc(t) {
  return t.replace(/:/g, "\\:").replace(/'/g, "\\'");
}

// 5 tomas de video real (Wan Video Model) con movimiento sensual, respiración y cabello
// Duraciones totales: 31.0s (sincronizadas exactamente con el audio)
// Clip 1: 0 a 6.0s (sensual 1 - mirada frontal cámara)
// Clip 2: 6.0 a 12.5s (sensual 2 - tres cuartos perfil)
// Clip 3: 12.5 a 18.5s (glamour - pose de estudio nocturno)
// Clip 4: 18.5 a 25.0s (sensual 1 v2 - push-in rostro)
// Clip 5: 25.0 a 31.0s (sensual 2 v2 - clímax y CTA)

const filterComplex = [
  // 1. Normalizar y escalar clips a 1080x1920 vertical a 30fps con movimiento ralentizado sedoso
  "[0:v]trim=start=0:end=5.0,setpts=1.2*PTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30[c1]",
  "[1:v]trim=start=0:end=5.0,setpts=1.3*PTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30[c2]",
  "[2:v]trim=start=0:end=5.0,setpts=1.2*PTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30[c3]",
  "[3:v]trim=start=0:end=5.0,setpts=1.3*PTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30[c4]",
  "[4:v]trim=start=0:end=5.0,setpts=1.2*PTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30[c5]",

  // 2. Concatenar secuencias de video real continuo
  "[c1][c2][c3][c4][c5]concat=n=5:v=1:a=0[vbase]",

  // 3. Audio de voz en alta fidelidad
  "[5:a]atrim=start=0:end=31.0,asetpts=PTS-STARTPTS,volume=1.4[aout]",

  // 4. Overlays Gráficos Seguros (Personaje 100% Despejado)
  // 4.1 Header Superior Permanente (Y: 75 - 135)
  "[vbase]drawbox=x=100:y=75:w=880:h=60:color=black@0.7:t=fill[h0]",
  "[h0]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● MUSA IA LAB  |  CREACIÓN DE MODELOS +18") + "':fontcolor=white:fontsize=30:x=(w-text_w)/2:y=90[vheader]",

  // 4.2 Dock Inferior Permanente (Y: 1460 - 1870, libre del cuerpo y rostro)
  "[vheader]drawbox=x=50:y=1460:w=980:h=410:color=#060910@0.88:t=fill[dock0]",
  "[dock0]drawbox=x=50:y=1460:w=980:h=4:color=#00FF88@0.85:t=fill[dock1]",

  // 4.3 Textos Fase 1 (0 a 6.0s): Hook Fanvue
  "[dock1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("MONETIZA MODELOS EN FANVUE") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1510:enable='between(t,0,6.0)'[d1_1]",
  "[d1_1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("El mercado de contenido exclusivo más rentable") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1580:enable='between(t,0,6.0)'[d1_2]",
  "[d1_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● Personajes hiperrealistas en video real") + "':fontcolor=#00FF88:fontsize=34:x=(w-text_w)/2:y=1660:enable='between(t,0,6.0)'[d1_3]",
  "[d1_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PAGO ÚNICO $33.000 COP") + "':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=1750:enable='between(t,0,6.0)'[s1_done]",

  // 4.4 Textos Fase 2 (6.0 a 12.5s): Anti-Plástico & Consistencia
  "[s1_done]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("CERO FILTROS DE PLÁSTICO") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1510:enable='between(t,6.0,12.5)'[d2_1]",
  "[d2_1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("El secreto de las agencias top es la consistencia real") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1580:enable='between(t,6.0,12.5)'[d2_2]",
  "[d2_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● Mismo rostro, cuerpo y estilo en cada toma") + "':fontcolor=#00FF88:fontsize=34:x=(w-text_w)/2:y=1660:enable='between(t,6.0,12.5)'[d2_3]",
  "[d2_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PAGO ÚNICO $33.000 COP") + "':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=1750:enable='between(t,6.0,12.5)'[s2_done]",

  // 4.5 Textos Fase 3 (12.5 a 18.5s): Textura & Movimiento
  "[s2_done]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TEXTURA REAL Y MOVIMIENTO") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1510:enable='between(t,12.5,18.5)'[d3_1]",
  "[d3_1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Piel con poros, miradas magnéticas y video sensual") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1580:enable='between(t,12.5,18.5)'[d3_2]",
  "[d3_2]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("● Calidad cinematográfica lista para suscriptores") + "':fontcolor=#00FF88:fontsize=34:x=(w-text_w)/2:y=1660:enable='between(t,12.5,18.5)'[d3_3]",
  "[d3_3]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("PAGO ÚNICO $33.000 COP") + "':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=1750:enable='between(t,12.5,18.5)'[s3_done]",

  // 4.6 Textos Fase 4 (18.5 a 25.0s): Oferta del Taller
  "[s3_done]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TALLER VIRTUAL INTENSIVO") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1505:enable='between(t,18.5,25.0)'[d4_1]",
  "[d4_1]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Aprende el método en una tarde · Sin programar") + "':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=1575:enable='between(t,18.5,25.0)'[d4_2]",
  "[d4_2]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("SOLO $33.000 COP") + "':fontcolor=#00FF88:fontsize=58:x=(w-text_w)/2:y=1650:enable='between(t,18.5,25.0)'[d4_3]",
  "[d4_3]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Acceso Vitalicio · 13 Clases + Prompts VIP") + "':fontcolor=white:fontsize=30:x=(w-text_w)/2:y=1735:enable='between(t,18.5,25.0)'[s4_done]",

  // 4.7 Textos Fase 5 (25.0 a 31.0s): Clímax de Conversión WhatsApp
  "[s4_done]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("ACCESO INMEDIATO HOY") + "':fontcolor=#FFE500:fontsize=44:x=(w-text_w)/2:y=1495:enable='between(t,25.0,31.0)'[d5_1]",
  "[d5_1]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("SOLO $33.000 COP") + "':fontcolor=#00FF88:fontsize=64:x=(w-text_w)/2:y=1565:enable='between(t,25.0,31.0)'[d5_2]",
  "[d5_2]drawbox=x=130:y=1665:w=820:h=90:color=#00A859@0.92:t=fill:enable='between(t,25.0,31.0)'[cta_box]",
  "[cta_box]drawtext=fontfile=" + FONT_BLACK + ":text='" + esc("TOCA AQUÍ PARA ESCRIBIR A WHATSAPP") + "':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=1695:enable='between(t,25.0,31.0)'[d5_3]",
  "[d5_3]drawtext=fontfile=" + FONT_BOLD + ":text='" + esc("Cupos Limitados · Entrega Automática") + "':fontcolor=#8b949e:fontsize=28:x=(w-text_w)/2:y=1780:enable='between(t,25.0,31.0)'[vout]"
].join(";");

const args = [
  "-y",
  "-i", v1,
  "-i", v2,
  "-i", v3,
  "-i", v4,
  "-i", v5,
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

console.log("Compilando video con secuencias de video real...");
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

// Publicar en landing
fs.copyFileSync(salidaLocal, salidaLanding);
console.log(`✓ Video publicado en landing: ${salidaLanding}`);
