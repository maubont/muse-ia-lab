// next/src/monitor/alertas.ts — ADAPTADOR DE ALERTAS.
//
// Cada servicio de mensajería espera un cuerpo distinto. Mandar `{ text: ... }`
// a Telegram no avisa de nada: falla en silencio, y una alerta que no llega es
// peor que no tener alertas, porque crees que estás cubierto.
//
//   Telegram  POST https://api.telegram.org/bot<TOKEN>/sendMessage
//             { chat_id, text }                    ← necesita el chat_id
//   Discord   { content }                         ← y límite de 2000 caracteres
//   Slack     { text }                            ← lo que ya mandábamos
//   Genérico  { text, fuente, cuando }            ← n8n, Make, Zapier
//
// El chat_id de Telegram NO es el número: se obtiene escribiéndole al bot.

export type FormatoAlerta = "telegram" | "discord" | "slack" | "generico";

/** Límites reales de cada servicio, para no perder el final del mensaje. */
const LIMITE_TELEGRAM = 4000; // el máximo duro es 4096
const LIMITE_DISCORD = 1900; // el máximo duro es 2000
const LIMITE_GENERICO = 2000;

export function detectarFormato(url: string): FormatoAlerta {
  const u = (url ?? "").toLowerCase();
  if (u.includes("api.telegram.org")) return "telegram";
  if (u.includes("discord.com/api/webhooks") || u.includes("discordapp.com/api/webhooks")) return "discord";
  if (u.includes("hooks.slack.com")) return "slack";
  return "generico";
}

export interface Alerta {
  url: string;
  cuerpo: unknown;
}

/**
 * Construye la petición que cada servicio entiende.
 * `chatId` es obligatorio para Telegram; se puede pasar aparte o venir en la URL
 * como `?chat_id=123` (cómodo para configurarlo en una sola variable).
 */
export function prepararAlerta(url: string, texto: string, chatId?: string): Alerta {
  const formato = detectarFormato(url);

  if (formato === "telegram") {
    let id = (chatId ?? "").trim();
    if (!id) {
      try {
        id = new URL(url).searchParams.get("chat_id") ?? "";
      } catch {
        id = "";
      }
    }
    return {
      url,
      cuerpo: {
        chat_id: id,
        text: (texto ?? "").slice(0, LIMITE_TELEGRAM),
        disable_web_page_preview: true,
      },
    };
  }

  if (formato === "discord") {
    return { url, cuerpo: { content: (texto ?? "").slice(0, LIMITE_DISCORD) } };
  }

  if (formato === "slack") {
    return { url, cuerpo: { text: (texto ?? "").slice(0, LIMITE_GENERICO) } };
  }

  return {
    url,
    cuerpo: { text: (texto ?? "").slice(0, LIMITE_GENERICO), fuente: "musa-monitor", cuando: new Date().toISOString() },
  };
}

/**
 * ¿La configuración está completa? Devuelve el motivo cuando no lo está, para
 * poder decirlo al arrancar en vez de descubrirlo el día que hay una caída.
 */
export function revisarConfigAlerta(url: string | undefined, chatId?: string): { ok: boolean; motivo?: string } {
  if (!url) return { ok: false, motivo: "MUSA_ALERTA_WEBHOOK sin configurar: las alertas solo quedan en el log" };
  const formato = detectarFormato(url);

  if (formato === "telegram") {
    let id = (chatId ?? "").trim();
    if (!id) {
      try {
        id = new URL(url).searchParams.get("chat_id") ?? "";
      } catch {
        id = "";
      }
    }
    if (!id) {
      return { ok: false, motivo: "Telegram sin chat_id: añade ?chat_id=123456 a la URL o define MUSA_ALERTA_CHAT_ID" };
    }
    if (!/api\.telegram\.org\/bot[^/]+\/sendMessage/.test(url)) {
      return { ok: false, motivo: "la URL de Telegram debe ser .../bot<TOKEN>/sendMessage" };
    }
  }

  return { ok: true };
}
