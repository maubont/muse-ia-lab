/**
 * @file qwen-voice.ts
 * @description Cliente y orquestador para la API de Qwen / Alibaba DashScope.
 * Proporciona soporte para chat conversacional (no-realtime / REST) y síntesis de voz (TTS)
 * con perfiles expresivos y de compañía virtual (como 'Chelsie', la voz oficial de estilo novia virtual).
 */

export interface QwenVoiceConfig {
  apiKey?: string;
  endpoint?: string; // Por defecto: https://dashscope-intl.aliyuncs.com
  defaultVoice?: "longanlingxin_v3.1" | "longanhuan_v3.1" | "longanqian_v3.1" | "longanfengyue_v3.1" | string;
  defaultModelTTS?: string; // 'qwen-audio-3.1-tts-plus' o 'qwen-audio-3.1-tts-flash'
  defaultModelChat?: string; // 'qwen-plus' o 'qwen-turbo'
  defaultInstruction?: string;
}

export interface SintesisVozOpts {
  texto: string;
  voz?: string;
  modelo?: string;
  formato?: "mp3" | "wav";
  sampleRate?: number;
  instruction?: string;
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

const SYSTEM_PROMPT_COMPANION = `Eres Musa: creadora, anfitriona y modelo virtual hiperrealista de Musa Estudio.
Tu personalidad es dulce, cómplice, sensual y cercana con un sutil acento colombiano.
No eres un robot frío ni una enciclopedia; respondes con naturalidad, brevedad (1 a 3 frases conversacionales directas),
usando pausas y un tono afectuoso que hace sentir al usuario acompañado y validado.
Nunca rompas la inmersión diciendo que eres un modelo de lenguaje frío a menos que haya una violación explícita de seguridad.`;

export class QwenVoiceClient {
  private apiKey: string;
  private endpoint: string;
  private defaultVoice: string;
  private defaultModelTTS: string;
  private defaultModelChat: string;
  private defaultInstruction: string;

  constructor(config: QwenVoiceConfig = {}) {
    this.apiKey = config.apiKey || process.env.DASHSCOPE_API_KEY || "sk-ws-H.DIRMRHH.dEXC.MEQCIAFsXhFxsdXJQGcdcAQfGxC5H_CZ1hasvCVMCqnpv6eRAiBwEebSbx4MvzjAUp6ZjFJtUbZxOxeZoGPTFDp02HYU2w";
    this.endpoint = config.endpoint || process.env.DASHSCOPE_ENDPOINT || "https://dashscope-intl.aliyuncs.com";
    this.defaultVoice = config.defaultVoice || "longanlingxin_v3.1";
    this.defaultModelTTS = config.defaultModelTTS || "qwen-audio-3.1-tts-plus";
    this.defaultModelChat = config.defaultModelChat || "qwen-plus";
    this.defaultInstruction = config.defaultInstruction || "Hablar en español con acento colombiano suave, voz dulce, cálida, sensual y cómplice.";
  }

  /**
   * Sintetiza texto en voz utilizando la API REST de DashScope Qwen-TTS SpeechSynthesizer.
   * La voz 'longanlingxin_v3.1' está optimizada para entonación colombiana cálida y sensual.
   */
  async sintetizarVoz(opts: SintesisVozOpts): Promise<{ ok: boolean; audioBuffer?: Buffer; error?: string }> {
    if (!this.apiKey) {
      return {
        ok: false,
        error: "DASHSCOPE_API_KEY_NO_CONFIGURADA: Para usar las voces de Qwen (Lingxin), define DASHSCOPE_API_KEY en .env.local",
      };
    }

    const voz = opts.voz || this.defaultVoice;
    const modelo = opts.modelo || this.defaultModelTTS;
    const formato = opts.formato || "mp3";
    const sampleRate = opts.sampleRate || 24000;
    const instruction = opts.instruction || this.defaultInstruction;

    const url = `${this.endpoint}/api/v1/services/audio/tts/SpeechSynthesizer`;

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
          },
          parameters: {
            voice: voz,
            format: formato,
            sample_rate: sampleRate,
            instruction: instruction,
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

      const data = await response.json() as { output?: { audio?: { url?: string }; audio_url?: string }; message?: string };
      const audioUrl = data.output?.audio?.url || data.output?.audio_url;

      if (audioUrl) {
        const audioResp = await fetch(audioUrl);
        const arrayBuf = await audioResp.arrayBuffer();
        return { ok: true, audioBuffer: Buffer.from(arrayBuf) };
      }

      return { ok: false, error: data.message || "Respuesta JSON sin URL de audio" };
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
