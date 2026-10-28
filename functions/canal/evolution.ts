// canal/evolution.ts — adaptador de CANAL para Evolution API (Baileys).
//
// Traduce el webhook de Evolution al contrato `MensajeEntrante` y envía mensajes
// por su REST API. El motor del funnel NO conoce Evolution: solo ve el contrato.
//
// ── HECHOS VERIFICADOS EN EL CÓDIGO FUENTE DE EVOLUTION (27-oct-2026) ──────────
// Fuente: evolution-foundation/evolution-api · src/api/integrations/event/webhook/
// webhook.controller.ts y src/api/types/wa.types.ts.
//
// 1) El POST del webhook tiene esta forma:
//      { event, instance, data, destination, date_time, sender, server_url, apikey }
//    y lleva LA API KEY EN CLARO en el campo `apikey` de cada evento.
//    => Ese campo es un secreto en tránsito: NUNCA debe loguearse ni persistirse.
//
// 2) Firma: si al configurar el webhook se envía el header `jwt_key`, Evolution
//    firma un JWT HS256 (10 min de vida, payload {iat, exp, app:"evolution",
//    action:"webhook"}) y lo manda como `Authorization: Bearer <jwt>`. El secreto
//    del HMAC es ese mismo `jwt_key`. ESO es lo que valida este adaptador.
//    Si `jwt_key` no está configurado, NO hay firma: se falla cerrado.
//
// 3) Nombres de evento: en la CONFIGURACIÓN se usan en MAYÚSCULAS_CON_GUION_BAJO
//    (MESSAGES_UPSERT) y en el PAYLOAD llegan en minúsculas con punto
//    (messages.upsert). Aquí se aceptan ambas formas.
//
// 4) Reintentos: Evolution reintenta hasta 10 veces con backoff exponencial,
//    salvo 400/401/403/404/422. Devolver 403 corta la reintentadera.
//
// ── ENDURECIDO CONTRA FALLOS REALES (patrón validado en producción) ───────────
//   · LIDs: WhatsApp migró parte de los chats a `123456@lid`, que NO son teléfonos.
//     El número real viaja en `remoteJidAlt`/`participantAlt`. Sin esto, clientes
//     reales se descartan en silencio.
//   · `send.message`: Evolution también emite los mensajes SALIENTES por webhook;
//     se aceptan y se filtran con `fromMe` (si no, el bot se responde a sí mismo).
//   · Timeouts: con la sesión caída, `sendText` no falla rápido: CUELGA (~25 s).
//     Toda llamada de red va con AbortController.
//   · `data` puede llegar como array: se toma el primer objeto.
//   · El pie de foto/video/documento ES el texto del mensaje del cliente.

import type { Canal, MensajeEntrante, MensajeSaliente, ResultadoEnvio, ResultadoVerificacion } from "./tipos.ts";
import { jidATelefono } from "./tipos.ts";

// ============================== configuración ==============================

export interface ConfigEvolution {
  /** ej. https://evolution-production.up.railway.app (sin barra final) */
  baseUrl: string;
  /** nombre de la instancia en Evolution */
  instancia: string;
  /** API key global o token de instancia (header `apikey`) */
  apiKey: string;
  /** secreto con el que se firmó el webhook (webhook.headers.jwt_key) */
  jwtKey: string;
  /**
   * Alternativa al JWT: secreto compartido en una cabecera estática.
   * Necesario porque `jwt_key` se verificó en el código de `main`, NO en v2.3.7:
   * si la versión desplegada no firma, el header estático es el único mecanismo.
   */
  secretoWebhook?: string;
  /** nombre de la cabecera del secreto estático. Por defecto `x-evolution-secret`. */
  nombreCabeceraSecreto?: string;
  /** inyectable para pruebas; por defecto el fetch global */
  fetchImpl?: typeof fetch;
  /** tope para enviar un mensaje (ms). Por defecto 10 s. */
  timeoutEnvioMs?: number;
  /** tope para pedir el binario de un adjunto (ms). Por defecto 20 s. */
  timeoutMediaMs?: number;
}

const TIMEOUT_ENVIO = 10_000;
const TIMEOUT_MEDIA = 20_000;
const CABECERA_SECRETO_DEFECTO = "x-evolution-secret";

/** Comparación en tiempo constante: no filtra la longitud del prefijo correcto. */
function igualConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ============================== utilidades ==============================

function b64urlABytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlATexto(s: string): string {
  return new TextDecoder().decode(b64urlABytes(s));
}

function base64ABuffer(base64: string): ArrayBuffer {
  const limpio = base64.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(limpio);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function esRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `data` puede venir como objeto o como array; se toma el primer objeto. */
function primerRecord(v: unknown): Record<string, unknown> | null {
  if (Array.isArray(v)) {
    for (const item of v) if (esRecord(item)) return item;
    return null;
  }
  return esRecord(v) ? v : null;
}

/** true si el evento trae un mensaje del cliente (o un eco propio que se filtra). */
function esEventoDeMensaje(evento: string): boolean {
  const e = (evento || "").toLowerCase();
  return e === "messages.upsert" || e === "messages_upsert" || e === "send.message" || e === "send_message";
}

/** Desenvuelve los sobres que Baileys usa para mensajes efímeros / de una sola vista. */
function desenvolver(msg: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  const sobres = [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
    "editedMessage",
  ];
  let actual = msg ?? null;
  for (let i = 0; i < 5 && actual; i++) {
    let avanzo = false;
    for (const sobre of sobres) {
      const nodo = actual[sobre];
      if (esRecord(nodo) && esRecord(nodo.message)) {
        actual = nodo.message;
        avanzo = true;
        break;
      }
    }
    if (!avanzo) return actual;
  }
  return actual;
}

type MensajeBaileys = {
  key?: Record<string, unknown>;
  pushName?: string;
  message?: Record<string, unknown>;
  messageType?: string;
  messageTimestamp?: number | string | { low?: number };
};

/**
 * Devuelve el JID que SÍ contiene un teléfono.
 * WhatsApp migró parte de los chats a LIDs (`123456@lid`) que no son números:
 * el número real viaja en `remoteJidAlt` o `participantAlt`. Si no hay forma de
 * correlacionarlo, se devuelve null en vez de inventar una identidad.
 */
function resolverJidTelefono(remoteJid: string, key: Record<string, unknown>): string | null {
  const alternos = [
    typeof key.remoteJidAlt === "string" ? key.remoteJidAlt : null,
    typeof key.participantAlt === "string" ? key.participantAlt : null,
  ];
  for (const candidato of [remoteJid, ...alternos]) {
    if (!candidato) continue;
    if (/@s\.whatsapp\.net$/i.test(candidato)) return candidato;
  }
  // JID sin sufijo conocido pero con pinta de número.
  if (!remoteJid.includes("@")) return remoteJid;
  return null;
}

function aEpochMs(v: unknown): number {
  let crudo: number | null = null;
  if (typeof v === "number") crudo = v;
  else if (typeof v === "string" && v.trim()) crudo = Number(v);
  else if (esRecord(v) && typeof v.low === "number") crudo = v.low;
  if (crudo === null || !Number.isFinite(crudo) || crudo <= 0) return Date.now();
  // Baileys entrega segundos; el resto del sistema usa milisegundos.
  return crudo > 1e12 ? crudo : crudo * 1000;
}

const MIMES_AUDIO = /audio|ogg/i;

/** Texto del mensaje: conversación, extendido, pie de media, respuestas de botón/lista. */
function extraerTexto(m: Record<string, unknown>): string {
  const lit = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const directo = lit(m.conversation);
  if (directo) return directo;

  const extendido = esRecord(m.extendedTextMessage) ? lit(m.extendedTextMessage.text) : "";
  if (extendido) return extendido;

  // El pie de foto/video/documento ES lo que escribió el cliente.
  for (const nodo of ["imageMessage", "videoMessage", "documentMessage"]) {
    const item = m[nodo];
    if (esRecord(item)) {
      const pie = lit(item.caption);
      if (pie) return pie;
    }
  }

  const boton = esRecord(m.buttonsResponseMessage) ? m.buttonsResponseMessage : null;
  if (boton) {
    const t = lit(boton.selectedDisplayText) || lit(boton.selectedButtonId);
    if (t) return t;
  }

  const lista = esRecord(m.listResponseMessage) ? m.listResponseMessage : null;
  if (lista) {
    const reply = esRecord(lista.singleSelectReply) ? lista.singleSelectReply : null;
    const t = lit(lista.title) || (reply ? lit(reply.selectedRowId) : "") || lit(lista.description);
    if (t) return t;
  }

  const plantilla = esRecord(m.templateButtonReplyMessage) ? m.templateButtonReplyMessage : null;
  if (plantilla) {
    const t = lit(plantilla.selectedDisplayText);
    if (t) return t;
  }

  if (esRecord(m.locationMessage)) return "[Ubicación compartida]";
  if (esRecord(m.contactMessage)) return "[Contacto compartido]";

  return "";
}

/**
 * Extrae el adjunto del mensaje. Devuelve null si no hay media.
 * `obtenerBytes` se resuelve de forma perezosa: si el webhook viene con
 * `webhookBase64: true`, Evolution ya embebió `base64` y no hay llamada extra.
 */
function extraerMedia(
  m: Record<string, unknown>,
  data: MensajeBaileys,
  cfg: ConfigEvolution,
  base: string,
): MensajeEntrante["media"] {
  const img = m.imageMessage as { mimetype?: string; caption?: string; base64?: string } | undefined;
  // ptvMessage es una "nota de video" (video redondo): es video, no audio.
  const vid = (m.videoMessage ?? m.ptvMessage) as
    | { mimetype?: string; caption?: string; base64?: string }
    | undefined;
  const aud = m.audioMessage as { mimetype?: string; base64?: string } | undefined;
  const doc = m.documentMessage as { mimetype?: string; fileName?: string; base64?: string } | undefined;
  const sticker = m.stickerMessage as { mimetype?: string; base64?: string } | undefined;

  const crudo = img ?? vid ?? aud ?? doc ?? sticker;
  if (!crudo) return null;

  const mime = crudo.mimetype ?? (aud ? "audio/ogg" : "application/octet-stream");
  let tipo: "audio" | "imagen" | "video" | "documento" = "documento";
  if (img) tipo = "imagen";
  else if (vid) tipo = "video";
  else if (aud) tipo = MIMES_AUDIO.test(mime) ? "audio" : "documento";
  else if (sticker) tipo = "imagen";

  const base64 = (crudo as { base64?: string }).base64;
  const limite = cfg.timeoutMediaMs ?? TIMEOUT_MEDIA;

  const obtenerBytes = async (): Promise<ArrayBuffer | null> => {
    if (base64) return base64ABuffer(base64);

    // Sin base64 en el webhook: pedir los bytes a Evolution por la clave del mensaje.
    const f = cfg.fetchImpl ?? fetch;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), limite);
    try {
      const res = await f(`${base}/chat/getBase64FromMediaMessage/${encodeURIComponent(cfg.instancia)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
        body: JSON.stringify({ message: { key: data.key }, convertToMp4: false }),
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { base64?: string };
      if (!j.base64) return null;
      return base64ABuffer(j.base64);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    tipo,
    mime,
    nombre: doc?.fileName,
    obtenerBytes,
  };
}

// ============================== canal ==============================

/** Verifica firma HS256 + `action === "webhook"` + `exp` vigente. */
async function verificarJwt(token: string, jwtKey: string): Promise<ResultadoVerificacion> {
  const partes = token.split(".");
  if (partes.length !== 3) return { valido: false, motivo: "jwt_mal_formado" };
  const [h, p, s] = partes;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    // `subtle.verify` compara en tiempo constante.
    const firmaOk = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlABytes(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    if (!firmaOk) return { valido: false, motivo: "firma_no_coincide" };

    const payload = JSON.parse(b64urlATexto(p)) as { exp?: number; action?: string; app?: string };
    if (payload.action !== "webhook") return { valido: false, motivo: "accion_inesperada" };
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
      return { valido: false, motivo: "jwt_expirado" };
    }
    return { valido: true, motivo: "ok" };
  } catch (e) {
    return { valido: false, motivo: "error_jwt:" + String(e).slice(0, 60) };
  }
}

export function crearCanalEvolution(cfg: ConfigEvolution): Canal {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const f = cfg.fetchImpl ?? fetch;
  const limiteEnvio = cfg.timeoutEnvioMs ?? TIMEOUT_ENVIO;

  const cabeceras = (): Record<string, string> => ({
    "Content-Type": "application/json",
    apikey: cfg.apiKey,
  });

  /** POST con tope de tiempo. Devuelve la respuesta o un error nombrado. */
  const post = async (
    ruta: string,
    cuerpo: unknown,
  ): Promise<{ ok: true; res: Response } | { ok: false; status?: number; motivo: string }> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), limiteEnvio);
    try {
      const res = await f(`${base}${ruta}`, {
        method: "POST",
        headers: cabeceras(),
        body: JSON.stringify(cuerpo),
        signal: ctrl.signal,
      });
      return { ok: true, res };
    } catch (e) {
      const nombre = esRecord(e) ? String(e.name ?? "") : "";
      const motivo = nombre === "AbortError" ? "timeout" : "excepcion:" + String(e).slice(0, 120);
      return { ok: false, motivo };
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    id: "evolution",

    /**
     * Estado real de la conexión de la instancia con WhatsApp.
     * Es la diferencia entre «el servidor responde» y «los mensajes salen».
     * Fail-open hacia "desconocido": si no se puede saber, se dice, no se finge.
     */
    async estadoSesion(): Promise<{ estado: string; detalle?: string }> {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), limiteEnvio);
      try {
        const res = await f(`${base}/instance/connectionState/${encodeURIComponent(cfg.instancia)}`, {
          method: "GET",
          headers: { apikey: cfg.apiKey },
          signal: ctrl.signal,
        });
        if (!res.ok) return { estado: "desconocido", detalle: `http_${res.status}` };
        const j = (await res.json()) as unknown;
        const inst = esRecord(j) && esRecord(j.instance) ? j.instance : null;
        const estado = inst && typeof inst.state === "string" ? inst.state : "desconocido";
        return { estado, detalle: estado === "open" ? undefined : "instance.connectionState" };
      } catch (e) {
        const nombre = esRecord(e) ? String(e.name ?? "") : "";
        return { estado: "desconocido", detalle: nombre === "AbortError" ? "timeout" : String(e).slice(0, 80) };
      } finally {
        clearTimeout(timer);
      }
    },

    /**
     * FAIL-CLOSED. Sin credencial válida no hay mensaje, ni siquiera para un lead.
     * Acepta DOS mecanismos, porque no todas las versiones de Evolution firman:
     *   1. JWT HS256 en `Authorization: Bearer` (si hay `jwtKey`).
     *   2. Secreto compartido en cabecera estática (si hay `secretoWebhook`).
     * Si los dos están configurados, vale cualquiera de los dos.
     */
    async verificar(req: Request, _cuerpoCrudo: string): Promise<ResultadoVerificacion> {
      if (!cfg.jwtKey && !cfg.secretoWebhook) {
        return { valido: false, motivo: "sin_credencial_configurada" };
      }

      let ultimo: ResultadoVerificacion | null = null;

      if (cfg.jwtKey) {
        const auth = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
        const m = auth.match(/^Bearer\s+(.+)$/i);
        if (!m) {
          ultimo = { valido: false, motivo: "sin_bearer" };
        } else {
          const r = await verificarJwt(m[1].trim(), cfg.jwtKey);
          if (r.valido) return r;
          ultimo = r;
        }
      }

      if (cfg.secretoWebhook) {
        const cabecera = cfg.nombreCabeceraSecreto ?? CABECERA_SECRETO_DEFECTO;
        const recibido = req.headers.get(cabecera) ?? "";
        if (recibido && igualConstante(recibido, cfg.secretoWebhook)) {
          return { valido: true, motivo: "secreto_compartido" };
        }
        return { valido: false, motivo: ultimo?.motivo ?? "secreto_no_coincide" };
      }

      return ultimo ?? { valido: false, motivo: "sin_credencial_configurada" };
    },

    /**
     * Traduce el webhook a mensajes procesables. Devuelve [] para todo lo que no
     * sea un mensaje de usuario: eventos que no son mensaje, ecos del propio bot
     * (`fromMe`), grupos, canales, broadcast y LIDs sin teléfono correlacionable.
     */
    async parsear(_req: Request, cuerpoCrudo: string): Promise<MensajeEntrante[]> {
      let body: { event?: string; type?: string; data?: unknown };
      try {
        body = JSON.parse(cuerpoCrudo);
      } catch {
        // Cuerpo firmado pero ilegible: es una anomalía, no "no hay mensajes".
        // Se lanza para que el servidor responda 400 (Evolution no reintenta 400)
        // y quede visible en sus logs, en vez de un 200 que lo esconde.
        throw new Error("payload_no_json");
      }
      if (!esEventoDeMensaje(body.event ?? body.type ?? "")) return [];

      const data = primerRecord(body.data) as MensajeBaileys | null;
      if (!data) return [];

      const key = esRecord(data.key) ? data.key : null;
      if (!key) return [];

      // Ecos: sin esto, el bot se responde a sí mismo en bucle.
      if (key.fromMe === true) return [];

      const remoteJid = typeof key.remoteJid === "string" ? key.remoteJid : "";
      if (!remoteJid) return [];
      if (/@(g\.us|broadcast|newsletter)$/i.test(remoteJid)) return [];

      const jid = resolverJidTelefono(remoteJid, key);
      if (!jid) return []; // LID sin número: no se inventa una identidad
      const telefono = jidATelefono(jid);
      if (!telefono) return [];

      const m = desenvolver(data.message);
      if (!m) return [];

      // Reacciones y protocolo (revocar/editar) no son mensajes del cliente.
      if (m.reactionMessage || m.protocolMessage) return [];

      const texto = extraerTexto(m);
      const media = extraerMedia(m, data, cfg, base);
      if (!texto && !media) return [];

      return [{
        canal: "evolution",
        id_externo: typeof key.id === "string" ? key.id : "",
        telefono,
        nombre_perfil: typeof data.pushName === "string" && data.pushName.trim() ? data.pushName.trim() : null,
        texto,
        media,
        // Baileys no entrega ReferralCtwaClid: la atribución de anuncio es nula.
        atribucion: { ctwa_clid: null, source_id: null },
        enviado_en: aEpochMs(data.messageTimestamp),
      }];
    },

    async enviar(telefono: string, mensaje: MensajeSaliente): Promise<ResultadoEnvio> {
      const number = telefono.replace(/^\+/, "");
      const ruta = mensaje.media
        ? `/message/sendMedia/${encodeURIComponent(cfg.instancia)}`
        : `/message/sendText/${encodeURIComponent(cfg.instancia)}`;
      const cuerpo = mensaje.media
        ? {
          number,
          mediatype: mensaje.media.tipo,
          mimetype: mensaje.media.mime ?? "video/mp4",
          caption: mensaje.texto,
          media: mensaje.media.url,
          fileName: mensaje.media.nombre ?? "musa",
        }
        : { number, text: mensaje.texto };

      const r = await post(ruta, cuerpo);
      if (!r.ok) return { ok: false, id_externo: null, motivo: r.motivo };

      if (!r.res.ok) {
        let detalle = "";
        try {
          detalle = (await r.res.text()).slice(0, 160);
        } catch {
          /* ignorar */
        }
        return { ok: false, id_externo: null, status: r.res.status, motivo: detalle };
      }

      let id: string | null = null;
      try {
        const j = (await r.res.json()) as { key?: { id?: string }; messageId?: string; id?: string };
        id = j.key?.id ?? j.messageId ?? j.id ?? null;
      } catch {
        /* respuesta sin cuerpo JSON: el mensaje ya salió */
      }
      return { ok: true, id_externo: id, status: r.res.status };
    },

    /** Best-effort: un fallo aquí nunca debe romper el flujo. */
    async marcarEscribiendo(telefono: string): Promise<void> {
      try {
        await post(`/chat/sendPresence/${encodeURIComponent(cfg.instancia)}`, {
          number: telefono.replace(/^\+/, ""),
          delay: 1200,
          presence: "composing",
        });
      } catch {
        /* ignorar */
      }
    },
  };
}
