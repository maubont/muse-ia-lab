// Compresión/transcodificación de mp4 con ffmpeg para que los videos del avatar
// quepan en el límite práctico de WhatsApp/Twilio (~16 MB; degrada o rechaza por
// encima de eso). Los genéricos de veed/lipsync salen 5-6 MB y no necesitan tocarse;
// los de Kling (fal-ai/kling-video/lipsync) salen ~15 MB por ~12 s y hay que
// comprimirlos antes de subirlos al bucket. La función está pensada para colocarse
// entre la descarga del mp4 del proveedor y la subida al bucket.
//
// Es "size-gated": solo recodifica si el archivo supera `maxBytes`, así pasarla por
// el flujo de veed es inocuo (devuelve el buffer original sin tocarlo).
//
// Resuelve el binario de ffmpeg en este orden:
//   1) variable de entorno FFMPEG_BIN (ruta absoluta a un ffmpeg propio)
//   2) paquete npm ffmpeg-static (binario embebido, multiplataforma)
//   3) "ffmpeg" del PATH del sistema
//
// Verifica el resultado decodificándolo entero con `ffmpeg -v error -i out -f null -`
// (código 0 y sin stderr = el mp4 se reproduce sin errores de decodificación).

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function resolverFfmpeg() {
  if (process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN;
  try {
    const mod = await import("ffmpeg-static");
    if (mod?.default) return mod.default;
  } catch {
    /* ffmpeg-static no instalado; caemos al PATH */
  }
  return "ffmpeg";
}

function correr(bin, args) {
  const r = spawnSync(bin, args, { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 });
  return {
    code: r.status,
    error: r.error,
    stderr: (r.stderr || Buffer.alloc(0)).toString("utf8"),
  };
}

/**
 * Comprime `buf` (mp4) si supera `maxBytes`. Sube el CRF de forma escalonada hasta
 * quedar por debajo del objetivo o agotar los intentos, y verifica que el resultado
 * decodifica sin errores. Si `buf` ya está por debajo del umbral, lo devuelve intacto.
 *
 * @param {Buffer} buf  bytes del mp4 descargado del proveedor.
 * @param {object} [opts]
 * @param {number} [opts.maxBytes=10485760]  umbral/objetivo de tamaño (por defecto 10 MB).
 * @param {string} [opts.etiqueta="video"]   etiqueta para los logs.
 * @param {number[]} [opts.crfs=[28,30,32,34]] CRFs a intentar en orden (más alto = más compresión).
 * @returns {Promise<{buffer: Buffer, comprimido: boolean, bytesOriginal: number, bytesFinal: number, crf: number|null, dentroObjetivo: boolean}>}
 */
export async function comprimirSiPesado(
  buf,
  { maxBytes = 10 * 1024 * 1024, etiqueta = "video", crfs = [28, 30, 32, 34] } = {},
) {
  const bytesOriginal = buf.length;
  if (bytesOriginal <= maxBytes) {
    return {
      buffer: buf,
      comprimido: false,
      bytesOriginal,
      bytesFinal: bytesOriginal,
      crf: null,
      dentroObjetivo: true,
    };
  }

  const ffmpeg = await resolverFfmpeg();
  const dir = mkdtempSync(join(tmpdir(), "musa-vid-"));
  const inPath = join(dir, "in.mp4");
  const outPath = join(dir, "out.mp4");
  writeFileSync(inPath, buf);

  try {
    let mejor = null;
    for (const crf of crfs) {
      const enc = correr(ffmpeg, [
        "-y",
        "-i", inPath,
        "-vcodec", "libx264",
        "-crf", String(crf),
        "-preset", "fast",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        outPath,
      ]);
      if (enc.error && enc.error.code === "ENOENT") {
        throw new Error(
          `FFMPEG_NO_ENCONTRADO bin=${ffmpeg} — instala ffmpeg (npm i ffmpeg-static) o define FFMPEG_BIN`,
        );
      }
      if (enc.code !== 0) {
        throw new Error(`FFMPEG_FALLO etiqueta=${etiqueta} crf=${crf} code=${enc.code} ${enc.stderr.slice(-400)}`);
      }
      const out = readFileSync(outPath);
      mejor = { buffer: out, crf };
      if (out.length <= maxBytes) break;
    }

    // Verificar reproducción: decodificar el resultado completo sin tolerar errores.
    const verif = correr(ffmpeg, ["-v", "error", "-i", outPath, "-f", "null", "-"]);
    if (verif.code !== 0 || verif.stderr.trim()) {
      throw new Error(`VERIF_DECODE_FALLO etiqueta=${etiqueta} ${verif.stderr.slice(-400)}`);
    }

    return {
      buffer: mejor.buffer,
      comprimido: true,
      bytesOriginal,
      bytesFinal: mejor.buffer.length,
      crf: mejor.crf,
      dentroObjetivo: mejor.buffer.length <= maxBytes,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
