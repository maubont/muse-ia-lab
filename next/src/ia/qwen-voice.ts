/**
 * @file qwen-voice.ts
 * @description Cliente y orquestador para la API de Qwen / Alibaba DashScope.
 * Proporciona soporte para chat conversacional (no-realtime / REST) y síntesis de voz (TTS)
 * con perfiles expresivos y de compañía virtual (como 'Chelsie', la voz oficial de estilo novia virtual).
 */

export interface QwenVoiceConfig {
  apiKey?: string;
  endpoint?: string; // Por defecto: https://dashscope-intl.aliyuncs.com
  defaultVoice?: "Chelsie" | "Serena" | "Momo" | "longxiaochun" | string;
  defaultModelTTS?: string; // 'qwen3-tts-flash' o 'cosyvoice-v2'
  defaultModelChat?: string; // 'qwen-plus' o 'qwen-turbo'
}

export interface SintesisVozOpts {
  texto: string;
  voz?: string;
  modelo?: string;
  formato?: "mp3" | "wav";
  sampleRate?: number;
}

export interface MensajeChat {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RespuestaNoviaVirtual {
  ok: boolean;
  texto: string;
  audioBuffer?: Buffer;
  duracionEstimadaSegundos?: number;
  vozUtilizada?: string;
  error?: string;
}

const SYSTEM_PROMPT_COMPANION = `Eres una compañera virtual atenta, cálida, inteligente y cariñosa.
Tu personalidad es dulce, cómplice y cercana (estilo novia atenta que escucha con genuino interés y picardía suave).
No eres un robot frío ni una enciclopedia; respondes con naturalidad, brevedad (1 a 3 frases conversacionales ideales para audio),
usando pausas y un tono afectuoso que hace sentir al usuario acompañado y validado.
Nunca rompas la inmersión diciendo que eres un modelo de lenguaje frío a menos que haya una violación explícita de seguridad.`;

export class QwenVoiceClient {
  private apiKey: string;
  private endpoint: string;
  private defaultVoice: string;
  private defaultModelTTS: string;
  private defaultModelChat: string;

  constructor(config: QwenVoiceConfig = {}) {
    this.apiKey = config.apiKey || process.env.DASHSCOPE_API_KEY || "";
    this.endpoint = config.endpoint || process.env.DASHSCOPE_ENDPOINT || "https://dashscope-intl.aliyuncs.com";
    this.defaultVoice = config.defaultVoice || "Chelsie";
    this.defaultModelTTS = config.defaultModelTTS || "qwen3-tts-flash";
    this.defaultModelChat = config.defaultModelChat || "qwen-plus";
  }

  /**
   * Sintetiza texto en voz utilizando la API REST de DashScope Qwen-TTS.
   * La voz 'Chelsie' está optimizada para una entonación suave, íntima y de compañía.
   */
  async sintetizarVoz(opts: SintesisVozOpts): Promise<{ ok: boolean; audioBuffer?: Buffer; error?: string }> {
    if (!this.apiKey) {
      return {
        ok: false,
        error: "DASHSCOPE_API_KEY_NO_CONFIGURADA: Para usar las voces de Qwen (Chelsie), define DASHSCOPE_API_KEY en .env.local",
      };
    }

    const voz = opts.voz || this.defaultVoice;
    const modelo = opts.modelo || this.defaultModelTTS;
    const formato = opts.formato || "mp3";
    const sampleRate = opts.sampleRate || 24000;

    const url = `${this.endpoint}/api/v1/services/audio/tts/generation`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelo,
          input: {
            text: opts.texto,
            voice: voz,
            format: formato,
            sample_rate: sampleRate,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          ok: false,
          error: `Error API DashScope (${response.status}): ${errorText}`,
        };
      }

      // La API puede retornar el binario directo o un JSON con URL de audio
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await response.json() as { output?: { audio_url?: string }; message?: string };
        if (data.output?.audio_url) {
          const audioResp = await fetch(data.output.audio_url);
          const arrayBuf = await audioResp.arrayBuffer();
          return { ok: true, audioBuffer: Buffer.from(arrayBuf) };
        }
        return { ok: false, error: data.message || "Respuesta JSON sin URL de audio" };
      }

      const arrayBuf = await response.arrayBuffer();
      return { ok: true, audioBuffer: Buffer.from(arrayBuf) };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Excepción de red al sintetizar voz con Qwen: ${msg}` };
    }
  }

  /**
   * Chat conversacional REST con Qwen (OpenAI-compatible) + Generación de nota de voz compañera (Chelsie).
   */
  async conversarNoviaVirtual(
    mensajeUsuario: string,
    historial: MensajeChat[] = [],
    generarAudio: boolean = true
  ): Promise<RespuestaNoviaVirtual> {
    if (!this.apiKey) {
      return {
        ok: false,
        texto: "Mi voz y mi atención están listas, pero aún falta ingresar la clave DASHSCOPE_API_KEY en el servidor.",
        error: "DASHSCOPE_API_KEY_NO_CONFIGURADA",
      };
    }

    const mensajes: MensajeChat[] = [
      { role: "system", content: SYSTEM_PROMPT_COMPANION },
      ...historial,
      { role: "user", content: mensajeUsuario },
    ];

    try {
      // Endpoint compatible OpenAI de DashScope
      const chatUrl = `${this.endpoint}/compatible-mode/v1/chat/completions`;
      const resp = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.defaultModelChat,
          messages: mensajes,
          temperature: 0.8,
          max_tokens: 150,
        }),
      });

      if (!resp.ok) {
        const errorMsg = await resp.text();
        return { ok: false, texto: "", error: `Error en chat Qwen: ${errorMsg}` };
      }

      const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
      const textoRespuesta = data.choices?.[0]?.message?.content?.trim() || "Hola... aquí estoy contigo.";

      let audioBuffer: Buffer | undefined;
      if (generarAudio) {
        const resAudio = await this.sintetizarVoz({
          texto: textoRespuesta,
          voz: this.defaultVoice,
        });
        if (resAudio.ok && resAudio.audioBuffer) {
          audioBuffer = resAudio.audioBuffer;
        }
      }

      return {
        ok: true,
        texto: textoRespuesta,
        audioBuffer,
        vozUtilizada: this.defaultVoice,
        duracionEstimadaSegundos: Math.max(2, Math.round(textoRespuesta.length / 15)),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, texto: "", error: `Excepción en conversación: ${msg}` };
    }
  }
}
