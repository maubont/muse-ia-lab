// next/src/motor/sintetizador-voz-musa.ts — SINTETIZADOR OFICIAL DE MUSA (QWEN 3.1 TTS PLUS / LINGXIN)
//
// Voz oficial de Musa: 'longanlingxin_v3.1' (🇨🇴 Acento Colombiano Seductor)
// Motor: Alibaba Cloud ModelStudio DashScope (qwen-audio-3.1-tts-plus / flash)
// Fallback transparente: OpenAI TTS-1-HD ('nova') si la red o API de Alibaba reporta error.

import { prepararTextoParaVoz, sintetizarAudioOpenAI } from "./sintetizador-voz-openai.ts";

export interface ResultadoSintesisMusa {
  ok: boolean;
  buffer?: Buffer;
  mime: string;
  proveedor: "qwen_dashscope" | "openai_fallback";
  duracionEstimadaSegundos: number;
  error?: string;
}

export interface OptsSintesisMusa {
  instruccion?: string;
  vozQwen?: string;
  apiKeyQwen?: string;
  apiKeyOpenAI?: string;
  modeloQwen?: string;
}

const INSTRUCCION_LINGXIN_DEFAULT =
  "Hablar en español con acento colombiano suave y natural, tono íntimo de nota de voz de WhatsApp, voz dulce, cálida, cercana, sensual y cómplice, con respiración suave y ritmo conversacional espontáneo.";

// Semáforo / rate-limiter en proceso y circuit-breaker para proteger DashScope ante ráfagas (429)
let colaQwen: Promise<void> = Promise.resolve();
let ultimoLlamadoQwenMs = 0;
let inFlightQwen = 0;
let fallosConsecutivosQwen = 0;
let cooldownQwenHastaMs = 0;

async function esperarTurnoQwen(): Promise<void> {
  let liberar!: () => void;
  const turno = new Promise<void>((r) => {
    liberar = r;
  });
  const previo = colaQwen;
  colaQwen = turno;
  await previo;
  try {
    while (inFlightQwen >= 2) {
      await new Promise((r) => setTimeout(r, 150));
    }
    const ahora = Date.now();
    const waitMs = Math.max(0, ultimoLlamadoQwenMs + 400 - ahora);
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    ultimoLlamadoQwenMs = Date.now();
    inFlightQwen++;
  } finally {
    liberar();
  }
}

/**
 * Sintetiza la voz oficial de Musa con el acento colombiano de Lingxin (Qwen 3.1 TTS Plus).
 * Diseñado con semáforo anti-429, timeout global y fallback transparente a OpenAI.
 */
export async function sintetizarVozOficialMusa(
  texto: string,
  opts: OptsSintesisMusa = {},
): Promise<ResultadoSintesisMusa> {
  const textoLimpio = prepararTextoParaVoz(texto);
  if (!textoLimpio || textoLimpio.length < 3) {
    return {
      ok: false,
      mime: "audio/mp3",
      proveedor: "qwen_dashscope",
      duracionEstimadaSegundos: 0,
      error: "texto_demasiado_corto",
    };
  }

  const qwenKey = (
    opts.apiKeyQwen ||
    process.env.DASHSCOPE_API_KEY ||
    process.env.ALIBABA_API_KEY ||
    ""
  ).trim();

  const vozQwen = opts.vozQwen || process.env.MUSA_VOZ_QWEN || "longanlingxin_v3.1";
  const modeloQwen = opts.modeloQwen || process.env.MUSA_MODELO_TTS || "qwen-audio-3.1-tts-plus";
  const instruccion = opts.instruccion || INSTRUCCION_LINGXIN_DEFAULT;

  // 1. Intentar primero con Alibaba Qwen 3.1 TTS Plus (Lingxin Colombiana), respetando circuit-breaker
  if (qwenKey && Date.now() >= cooldownQwenHastaMs) {
    const intentosMax = 2;
    const timeoutMs = Math.max(18000, textoLimpio.length * 45);
    for (let intento = 1; intento <= intentosMax; intento++) {
      await esperarTurnoQwen();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);

      try {
        const resp = await fetch(
          "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${qwenKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: modeloQwen,
              input: { text: textoLimpio },
              parameters: {
                voice: vozQwen,
                format: "mp3",
                sample_rate: 24000,
                instruction: instruccion,
              },
            }),
            signal: ctrl.signal,
          },
        );

        if (resp.ok) {
          const data: any = await resp.json();
          const audioUrl = data.output?.audio?.url || data.output?.audio_url;
          if (!audioUrl) {
            clearTimeout(timer);
            console.warn("[sintetizador-musa] Respuesta Qwen OK pero sin output.audio.url");
            break;
          }
          const fetchAudio = await fetch(audioUrl, { signal: ctrl.signal });
          clearTimeout(timer);
          if (fetchAudio.ok) {
            const arrayBuf = await fetchAudio.arrayBuffer();
            const buffer = Buffer.from(arrayBuf);
            if (buffer.length > 1024) {
              fallosConsecutivosQwen = 0;
              return {
                ok: true,
                buffer,
                mime: "audio/mp3",
                proveedor: "qwen_dashscope",
                duracionEstimadaSegundos: Math.max(2, Math.round(textoLimpio.length / 15)),
              };
            }
            console.warn("[sintetizador-musa] Buffer de Qwen TTS demasiado pequeño:", buffer.length);
            break;
          } else {
            console.warn("[sintetizador-musa] Fallo descargando MP3 Qwen:", fetchAudio.status);
            break;
          }
        } else {
          clearTimeout(timer);
          const errTxt = await resp.text().catch(() => "");
          console.warn(`[sintetizador-musa] Error HTTP ${resp.status} en Qwen TTS: ${errTxt.slice(0, 120)}`);
          if (resp.status === 429 || resp.status === 503) {
            fallosConsecutivosQwen++;
            if (fallosConsecutivosQwen >= 3) {
              cooldownQwenHastaMs = Date.now() + 60_000;
              break;
            }
            if (intento < intentosMax) {
              await new Promise((r) => setTimeout(r, 550 + Math.floor(Math.random() * 350)));
              continue;
            }
          }
          break;
        }
      } catch (err: any) {
        clearTimeout(timer);
        fallosConsecutivosQwen++;
        console.warn(`[sintetizador-musa] Excepción en Qwen TTS:`, err?.message || String(err).slice(0, 80));
        if (fallosConsecutivosQwen >= 3) {
          cooldownQwenHastaMs = Date.now() + 60_000;
          break;
        }
        if (intento < intentosMax) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        break;
      } finally {
        inFlightQwen = Math.max(0, inFlightQwen - 1);
      }
    }
  }

  // 2. Fallback transparente a OpenAI TTS si DashScope no respondió
  console.info(`[sintetizador-musa] Activando fallback transparente con OpenAI TTS ('nova')...`);
  try {
    const bufOpenAI = await sintetizarAudioOpenAI(textoLimpio, {
      apiKey: opts.apiKeyOpenAI || process.env.MUSA_IA_KEY || process.env.OPENAI_API_KEY,
      modelo: "tts-1-hd",
      voz: "nova",
      velocidad: 1.04,
      saltarPreparacion: true,
    });

    if (bufOpenAI && bufOpenAI.length > 512) {
      return {
        ok: true,
        buffer: bufOpenAI,
        mime: "audio/ogg; codecs=opus",
        proveedor: "openai_fallback",
        duracionEstimadaSegundos: Math.max(2, Math.round(textoLimpio.length / 15)),
      };
    }
  } catch (errOpenAI: any) {
    console.warn(`[sintetizador-musa] Fallo también en fallback OpenAI:`, errOpenAI?.message);
  }

  return {
    ok: false,
    mime: "audio/mp3",
    proveedor: "qwen_dashscope",
    duracionEstimadaSegundos: 0,
    error: "fallo_en_sintesis_de_audio",
  };
}
