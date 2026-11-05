// next/src/motor/transcriptor-audio.ts — Transcripción nativa de notas de voz de WhatsApp con IA (Whisper / OpenAI / Gemini).
export interface ConfigTranscriptor {
  apiKey?: string;
  baseUrl?: string;
  modelo?: string;
}

/**
 * Transcribe un búfer de audio (ogg/opus/mp3/m4a de WhatsApp) a texto.
 * Utiliza el endpoint estándar compatible con OpenAI (/v1/audio/transcriptions).
 */
export async function transcribirAudio(
  audioBuffer: Buffer,
  mimeType: string = "audio/ogg",
  cfg: ConfigTranscriptor = {},
): Promise<string | null> {
  const apiKey = (cfg.apiKey ?? process.env.OPENAI_API_KEY ?? process.env.MUSA_IA_KEY ?? "").trim();
  if (!apiKey || audioBuffer.length === 0) return null;

  const baseUrl = (cfg.baseUrl ?? process.env.MUSA_IA_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const modelo = cfg.modelo ?? "whisper-1";

  // Determinar extensión adecuada para la API de Whisper
  let ext = "ogg";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) ext = "m4a";
  else if (mimeType.includes("mpeg") || mimeType.includes("mp3")) ext = "mp3";
  else if (mimeType.includes("wav")) ext = "wav";

  const blob = new Blob([audioBuffer], { type: mimeType });
  const form = new FormData();
  form.append("file", blob, `nota_voz.${ext}`);
  form.append("model", modelo);
  form.append("language", "es");
  form.append("response_format", "json");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);

  try {
    const res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.warn(`[transcriptor] error ${res.status}: ${err.slice(0, 150)}`);
      return null;
    }

    const data = (await res.json()) as { text?: string };
    const texto = (data.text ?? "").trim();
    return texto.length > 0 ? texto : null;
  } catch (e) {
    console.warn("[transcriptor] excepción:", String(e).slice(0, 120));
    return null;
  } finally {
    clearTimeout(timer);
  }
}
