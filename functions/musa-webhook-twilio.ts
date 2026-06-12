// musa-webhook-twilio — Fase 1: receptor de mensajes WhatsApp (Twilio) -> persistir + eco TwiML.
// Fase 2 traerá el motor de ventas, validación X-Twilio-Signature y respuesta asíncrona vía REST.
import { createAdminClient } from "npm:@insforge/sdk";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function twiml(text: string, status = 200): Response {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${text}</Message></Response>`;
  return new Response(xml, {
    status,
    headers: { "Content-Type": "text/xml" },
  });
}

export default async function (req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body = "";
  let numMedia = 0;

  try {
    // TODO Fase 2: validar X-Twilio-Signature y responder asíncrono vía REST.
    const form = await req.formData();
    const f = (k: string): string => {
      const v = form.get(k);
      return typeof v === "string" ? v : "";
    };

    const from = f("From");
    const waId = f("WaId");
    const profileName = f("ProfileName");
    body = f("Body");
    numMedia = parseInt(f("NumMedia") || "0", 10) || 0;
    const mediaUrl0 = f("MediaUrl0");
    const mediaContentType0 = f("MediaContentType0");
    const messageSid = f("MessageSid");
    const referralCtwaClid = f("ReferralCtwaClid");
    const referralSourceId = f("ReferralSourceId");

    // phone = "+" + WaId; si falta WaId, derivar de From quitando "whatsapp:"
    let phone = "";
    if (waId) {
      phone = "+" + waId.replace(/^\+/, "");
    } else if (from) {
      phone = from.replace(/^whatsapp:/, "").trim();
    }
    if (!phone || phone === "+") {
      return new Response("Missing phone", { status: 400 });
    }

    const admin = createAdminClient({
      baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
      apiKey: Deno.env.get("API_KEY") ?? Deno.env.get("MUSA_INSFORGE_API_KEY"),
    });

    const texto = (!body && numMedia > 0)
      ? "Recibí tu archivo 📎"
      : `✅ ¡Hola! Soy Musa 💜 Infraestructura Fase 1 funcionando. Recibí: «${
        escapeXml(body)
      }»`;

    // Idempotencia: Twilio reintenta webhooks; mismo MessageSid => repetir el eco sin insertar.
    if (messageSid) {
      const { data: dup } = await admin.database
        .from("musa_messages")
        .select("id")
        .eq("twilio_sid", messageSid)
        .maybeSingle();
      if (dup) return twiml(texto);
    }

    // --- UPSERT del lead ---
    const { data: existing, error: selErr } = await admin.database
      .from("musa_leads")
      .select("phone, profile_name, ctwa_clid, source_id, estado_funnel")
      .eq("phone", phone)
      .maybeSingle();
    if (selErr) throw new Error("select musa_leads: " + JSON.stringify(selErr));

    let estadoFunnel = "S00_LLEGADA";

    if (!existing) {
      const nuevo: Record<string, unknown> = {
        phone,
        profile_name: profileName || null,
        estado_funnel: "S00_LLEGADA",
        bono_rapido_hasta: new Date(Date.now() + 24 * 60 * 60 * 1000)
          .toISOString(),
      };
      if (referralCtwaClid) nuevo.ctwa_clid = referralCtwaClid;
      if (referralSourceId) nuevo.source_id = referralSourceId;

      const { error: insErr } = await admin.database
        .from("musa_leads")
        .insert([nuevo]);
      if (insErr) throw new Error("insert musa_leads: " + JSON.stringify(insErr));
    } else {
      estadoFunnel = existing.estado_funnel || "S00_LLEGADA";
      const patch: Record<string, unknown> = {};
      if (profileName && profileName !== existing.profile_name) {
        patch.profile_name = profileName;
      }
      if (referralCtwaClid && existing.ctwa_clid == null) {
        patch.ctwa_clid = referralCtwaClid;
      }
      if (referralSourceId && existing.source_id == null) {
        patch.source_id = referralSourceId;
      }
      if (Object.keys(patch).length > 0) {
        const { error: updErr } = await admin.database
          .from("musa_leads")
          .update(patch)
          .eq("phone", phone);
        if (updErr) {
          throw new Error("update musa_leads: " + JSON.stringify(updErr));
        }
      }
    }

    // --- Mensaje entrante ---
    const { error: msgErr } = await admin.database
      .from("musa_messages")
      .insert([{
        lead_phone: phone,
        direction: "in",
        body: body || null,
        media_url: numMedia > 0 && mediaUrl0 ? mediaUrl0 : null,
        media_type: numMedia > 0 && mediaContentType0 ? mediaContentType0 : null,
        twilio_sid: messageSid || null,
        estado_funnel: estadoFunnel,
      }]);
    if (msgErr) {
      // Carrera con un reintento simultáneo: el índice único 23505 = ya procesado.
      if (JSON.stringify(msgErr).includes("23505")) return twiml(texto);
      throw new Error("insert musa_messages: " + JSON.stringify(msgErr));
    }

    // --- Evento de funnel ---
    const { error: evErr } = await admin.database
      .from("musa_funnel_events")
      .insert([{
        lead_phone: phone,
        evento: "mensaje_recibido",
        detalle: {
          tiene_media: numMedia > 0,
          referral: referralCtwaClid || null,
        },
      }]);
    if (evErr) {
      throw new Error("insert musa_funnel_events: " + JSON.stringify(evErr));
    }

    // --- Respuesta TwiML ---
    return twiml(texto);
  } catch (err) {
    // Twilio reintenta en 5xx: devolvemos 200 con mensaje neutro para evitar dobles.
    console.error("musa-webhook-twilio error:", err);
    return twiml("Dame un momentico 🙏");
  }
}
