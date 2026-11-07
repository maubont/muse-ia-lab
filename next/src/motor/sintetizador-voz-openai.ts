// next/src/motor/sintetizador-voz-openai.ts — Generación de voz nativa con OpenAI (TTS-1-HD / Opus PTT).
//
// Reglas:
// 1. CERO proveedores dispersos: se utiliza exclusivamente OpenAI (misma API Key y créditos de la cuenta).
// 2. Formato nativo 'opus': OpenAI genera directamente audio OGG/Opus optimizado para notas de voz de WhatsApp (PTT).
// 3. Sanitización de texto: se limpian emojis, markdown y corchetes antes de enviar a OpenAI para evitar lecturas extrañas.
// 4. Voz por defecto: 'nova' (reconocida como la voz femenina más cálida, natural y fluida en español latinoamericano).

export interface ConfigSintetizadorOpenAI {
  apiKey?: string;
  baseUrl?: string;
  /** 'tts-1-hd' (máxima fidelidad y calidez) o 'tts-1' (menor latencia) */
  modelo?: "tts-1-hd" | "tts-1" | string;
  /** Voces disponibles en OpenAI: 'nova' (recomendada para Musa), 'shimmer', 'alloy', 'sage', 'coral' */
  voz?: "nova" | "shimmer" | "alloy" | "echo" | "fable" | "onyx" | "sage" | "coral" | "verse" | string;
  /** Velocidad de habla (1.0 = normal, 1.05 = ágil y conversacional) */
  velocidad?: number;
}

/**
 * Limpia el texto para síntesis de voz:
 * - Remueve emojis (para que el modelo no diga "cara con ojos de corazón")
 * - Remueve formato markdown (*negritas*, _cursivas_, ~tachado~)
 * - Normaliza números y monedas colombianas para dicción natural
 */
export function prepararTextoParaVoz(texto: string): string {
  if (!texto) return "";

  let limpio = texto
    // Quitar markdown
    .replace(/[*_~`#]/g, "")
    // Quitar URLs
    .replace(/https?:\/\/[^\s]+/gi, "")
    // Limpiar marcadores internos
    .replace(/\[[^\]]+\]/g, "")
    // Limpiar muletillas fonéticamente toscas en TTS
    .replace(/\b(m{2,}|h[eé]{2,}|h[aá]{2,}|u{2,}m+)\b/gi, "")
    // Fonética 100% en español: Evita que OpenAI cambie de idioma o meta acento gringo
    .replace(/\bMuse IA Lab\b/gi, "Musa Estudio")
    .replace(/\bMuse IA\b/gi, "Musa")
    .replace(/\bMuse\b/gi, "Musa")
    .replace(/\bIA\b/g, "inteligencia artificial")
    .replace(/\bAI\b/g, "inteligencia artificial")
    .replace(/\bFanvue\b/gi, "Fanviú")
    .replace(/\bOnlyFans\b/gi, "Onlifans")
    .replace(/\bprompts?\b/gi, "instrucciones")
    // Suavizar números y precios para pronunciación natural y fluida en Colombia
    .replace(/\$?\s*9\.000\s*(?:COP|pesos\s*colombianos|pesos)?/gi, "nueve mil pesos")
    .replace(/\b9\s*mil\s*(?:COP|pesos\s*colombianos|pesos)?\b/gi, "nueve mil pesos")
    .replace(/\$?\s*33\.000\s*(?:COP|pesos\s*colombianos|pesos)?/gi, "treinta y tres mil pesos")
    .replace(/\$?\s*30\.000\s*(?:COP|pesos\s*colombianos|pesos)?/gi, "treinta mil pesos")
    .replace(/\$?\s*2[.,]50?\s*(?:USD|dolares|dólares)\b/gi, "dos dólares con cincuenta")
    .replace(/\b9\s*(?:USD|dolares|dólares)\b/gi, "nueve dólares")
    .replace(/\bCOP\b/g, "pesos")
    .replace(/\b13\s*clases\b/gi, "trece clases")
    .replace(/\b13\s*módulos\b/gi, "trece módulos")
    .replace(/\b4\s*bonos\b/gi, "cuatro bonos")
    .replace(/\b18\s*años\b/gi, "dieciocho años")
    .replace(/\b30\s*días\b/gi, "treinta días")
    // Pausas conversacionales orgánicas (puntos suspensivos a pausa suave con coma)
    .replace(/\.{2,}/g, ", ")
    // Erradicar emojis y pictogramas Unicode
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}]/gu, "")
    // Espacios repetidos y saltos de línea
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, ". ")
    .trim();

  // Limitar longitud para notas de voz de WhatsApp (máximo 450 caracteres para ~25-30 segundos de audio)
  if (limpio.length > 500) {
    const punto = limpio.lastIndexOf(".", 500);
    limpio = punto > 250 ? limpio.slice(0, punto + 1) : limpio.slice(0, 500);
  }

  return limpio;
}

/**
 * Sintetiza un texto en audio Opus usando exclusivamente la API oficial de OpenAI.
 * Retorna el Buffer binario en formato Opus/OGG listo para WhatsApp PTT.
 */
export async function sintetizarAudioOpenAI(
  texto: string,
  cfg: ConfigSintetizadorOpenAI = {},
): Promise<Buffer | null> {
  const apiKey = (cfg.apiKey ?? process.env.MUSA_IA_KEY ?? process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    console.warn("[sintetizador-openai] Falta apiKey de OpenAI");
    return null;
  }

  const textoParaAudio = prepararTextoParaVoz(texto);
  if (!textoParaAudio || textoParaAudio.length < 3) return null;

  const baseUrl = (cfg.baseUrl ?? process.env.MUSA_IA_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const modelo = cfg.modelo ?? "tts-1-hd";
  // Voz por defecto: 'nova' (joven, sensual, inteligente, espontánea; reemplaza a 'coral' que sonaba madura/señora)
  const voz = cfg.voz ?? (process.env.MUSA_IA_VOZ ?? "nova");
  const velocidad = cfg.velocidad ?? 1.02;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);

  try {
    const res = await fetch(`${baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelo,
        input: textoParaAudio,
        voice: voz,
        response_format: "opus", // OpenAI genera directamente contenedor OGG con codec Opus nativo
        speed: velocidad,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.warn(`[sintetizador-openai] error HTTP ${res.status}: ${err.slice(0, 150)}`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    console.warn("[sintetizador-openai] excepción en generación de voz:", String(e).slice(0, 120));
    return null;
  } finally {
    clearTimeout(timer);
  }
}
