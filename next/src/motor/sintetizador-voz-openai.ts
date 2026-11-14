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
  /** Evita volver a normalizar un texto ya preparado por el orquestador */
  saltarPreparacion?: boolean;
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
    .replace(/\bBre-?B\b/gi, "Bre Be")
    .replace(/\bprompts?\b/gi, "instrucciones")
    // Suavizar aproximaciones y números con lookbehind (?<!\d) para no corromper "15 USD" ni "120.000"
    .replace(/\(\s*≈\s*5(?:[.,]00?)?\s*(?:USD|dolares|dólares)\s*\)/gi, ", unos cinco dólares,")
    .replace(/[\u2248]/g, "unos ")
    .replace(/\+\s*600[.,]?000(?:\s*(?:COP|pesos))?\b/gi, "más de seiscientos mil pesos")
    .replace(/\baprox\.?\s*/gi, "aproximadamente ")
    .replace(/(^|\s)\$?\s*(?<!\d)20[.,]?000\s*(?:COP|pesos\s*colombianos|pesos)?\b/gi, "$1veinte mil pesos")
    .replace(/(^|\s)(?<!\d)20\s*mil\s*(?:COP|pesos\s*colombianos|pesos)?\b/gi, "$1veinte mil pesos")
    .replace(/(^|\s)\$?\s*(?<!\d)600[.,]?000\s*(?:COP|pesos\s*colombianos|pesos)?\b/gi, "$1seiscientos mil pesos")
    .replace(/(^|\s)\$?\s*(?<!\d)33[.,]?000\s*(?:COP|pesos\s*colombianos|pesos)?\b/gi, "$1treinta y tres mil pesos")
    .replace(/(^|\s)\$?\s*(?<!\d)30[.,]?000\s*(?:COP|pesos\s*colombianos|pesos)?\b/gi, "$1treinta mil pesos")
    .replace(/(^|\s)\$?\s*(?<!\d)9[.,]?000\s*(?:COP|pesos\s*colombianos|pesos)?\b/gi, "$1nueve mil pesos")
    .replace(/(^|\s)(?<!\d)9\s*mil\s*(?:COP|pesos\s*colombianos|pesos)?\b/gi, "$1nueve mil pesos")
    .replace(
      /(?<!\d)1[.,]5\s*(?:a|[–—-])\s*2[.,]5\s*(?:millones(?:\s+de)?\s*(?:COP|pesos)?|M\b(?:\s*(?:de\s*)?(?:COP|pesos))?)/gi,
      "uno punto cinco a dos punto cinco millones de pesos",
    )
    .replace(/(^|\s)\$?\s*(?<!\d)5(?:[.,]00?)?\s*(?:USD|dolares|dólares)\b/gi, "$1cinco dólares")
    .replace(/(^|\s)\$?\s*(?<!\d)2[.,]50?\s*(?:USD|dolares|dólares)\b/gi, "$1dos dólares con cincuenta")
    .replace(/(^|\s)(?<!\d)9\s*(?:USD|dolares|dólares)\b/gi, "$1nueve dólares")
    .replace(/(?<!\d)(\d+)\s*x\s*(?:a|[–—-])\s*(\d+)\s*x\b/gi, "$1 a $2 veces")
    .replace(/(?<!\d)(\d+)\s*x\b/gi, "$1 veces")
    .replace(/(?<!\d)(\d+)\s*[–—-]\s*(\d+)(?=\s|$|[.,!?;:])/g, "$1 a $2")
    .replace(/(?<!\d)(\d+)\s*(?:USD|dolares|dólares)\b/gi, "$1 dólares")
    .replace(/(?<!\d)(\d{1,2})[.,](\d{1,2})(?!\d)/g, "$1 punto $2")
    .replace(/\+18\b/g, "mayores de dieciocho")
    .replace(/\bmillon(es)?\s+(?:de\s+)?pesos\b/gi, "millón$1 de pesos")
    .replace(/\bmillónes\b/gi, "millones")
    .replace(/\bCOP\b/g, "pesos")
    .replace(/(?<!\d)13\s*clases\b/gi, "trece clases")
    .replace(/(?<!\d)13\s*módulos\b/gi, "trece módulos")
    .replace(/(?<!\d)4\s*bonos\b/gi, "cuatro bonos")
    .replace(/(?<!\d)18\s*años\b/gi, "dieciocho años")
    .replace(/(?<!\d)30\s*días\b/gi, "treinta días")
    // Pausas conversacionales orgánicas (puntos suspensivos a pausa suave con coma)
    .replace(/\.{2,}/g, ", ")
    // Erradicar emojis, pictogramas y selectores Unicode huérfanos
    .replace(
      /[\p{Extended_Pictographic}\u2600-\u27BF\u2300-\u23FF\uFE0E\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}]/gu,
      "",
    )
    // Limpiar signos sueltos y espacios repetidos
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/,\s*,+/g, ",")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, ". ")
    .replace(/\.\s*\./g, ".")
    .trim();

  // Limitar longitud para notas de voz de WhatsApp (máximo 650 caracteres sin truncar en 500)
  if (limpio.length > 650) {
    const punto = limpio.lastIndexOf(".", 650);
    limpio = punto > 320 ? limpio.slice(0, punto + 1) : limpio.slice(0, 650);
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

  const textoParaAudio = cfg.saltarPreparacion ? texto : prepararTextoParaVoz(texto);
  if (!textoParaAudio || textoParaAudio.length < 3) return null;

  const baseUrl = (cfg.baseUrl ?? process.env.MUSA_IA_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const modelo = cfg.modelo ?? "tts-1-hd";
  // Voz por defecto: 'nova' (joven, sensual, inteligente, espontánea; reemplaza a 'coral' que sonaba madura/señora)
  const voz = cfg.voz ?? (process.env.MUSA_IA_VOZ ?? "nova");
  const velocidad = cfg.velocidad ?? 1.02;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);

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
