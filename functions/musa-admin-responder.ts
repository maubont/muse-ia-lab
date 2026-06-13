// musa-admin-responder — Edge function ADMIN (solo el dueño).
// POST {lead_phone, texto} -> envía un mensaje manual del operador al lead.
//   1) inserta en musa_messages (direction='out', body=texto, estado_funnel actual del lead)
//   2) actualiza musa_leads.last_out_at
//   3) si el phone NO empieza por +9999, envía por Twilio REST
//      (From=TWILIO_WHATSAPP_FROM, To=whatsapp:<phone>)
//   4) registra evento 'respuesta_manual_operador'
//
// AUTH (idéntico a musa-admin-data/-accion): Bearer del usuario ->
// getCurrentUser().email == MUSA_OWNER_EMAIL. Sin token 401, otro email 403.
import { createClient, createAdminClient } from "npm:@insforge/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
type Any = any;

async function exigirDueno(req: Request): Promise<{ error?: Response }> {
  const authHeader = req.headers.get("Authorization") || "";
  const userToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!userToken) return { error: json({ error: "no_autenticado" }, 401) };
  const ownerEmail = (Deno.env.get("MUSA_OWNER_EMAIL") || "").trim().toLowerCase();
  if (!ownerEmail) return { error: json({ error: "owner_no_configurado" }, 500) };
  let email = "";
  try {
    const userClient = createClient({
      baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
      edgeFunctionToken: userToken,
    });
    const { data } = await userClient.auth.getCurrentUser();
    email = (data?.user?.email || "").trim().toLowerCase();
  } catch (_e) {
    return { error: json({ error: "token_invalido" }, 401) };
  }
  if (!email) return { error: json({ error: "token_invalido" }, 401) };
  if (email !== ownerEmail) return { error: json({ error: "no_autorizado" }, 403) };
  return {};
}

function adminClient(): Any {
  return createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY") ?? Deno.env.get("MUSA_INSFORGE_API_KEY"),
  });
}

/** Envía un WhatsApp por Twilio REST. Mismo patrón que el webhook
 *  (From=TWILIO_WHATSAPP_FROM, To=whatsapp:<phone>, Basic auth). */
async function enviarTwilio(phone: string, texto: string): Promise<{ ok: boolean; http?: number; error?: string }> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886";
  if (!sid || !token) {
    return { ok: false, error: "faltan_credenciales_twilio" };
  }
  try {
    const params: Record<string, string> = {
      From: from,
      To: `whatsapp:${phone}`,
      Body: texto,
    };
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": "Basic " + btoa(`${sid}:${token}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(params),
      },
    );
    if (!res.ok) {
      const detalle = (await res.text()).slice(0, 200);
      console.error("twilio send", res.status, detalle);
      return { ok: false, http: res.status, error: detalle };
    }
    return { ok: true, http: res.status };
  } catch (e) {
    console.error("twilio err", String(e).slice(0, 200));
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Guard de auth PRIMERO: cualquier request sin token válido del dueño -> 401/403.
  const guard = await exigirDueno(req);
  if (guard.error) return guard.error;

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: Any = {};
  try {
    payload = await req.json();
  } catch (_e) {
    return json({ error: "json_invalido" }, 400);
  }

  const leadPhone = String(payload.lead_phone || "").trim();
  const texto = String(payload.texto || "").trim();
  if (!/^\+\d{6,15}$/.test(leadPhone)) return json({ error: "lead_phone_invalido" }, 400);
  if (!texto) return json({ error: "texto_vacio" }, 400);
  if (texto.length > 1500) return json({ error: "texto_demasiado_largo" }, 400);

  const admin = adminClient();

  try {
    // Estado actual del lead (para etiquetar el mensaje out y validar que existe).
    const { data: lead } = await admin.database.from("musa_leads")
      .select("phone, estado_funnel").eq("phone", leadPhone).maybeSingle();
    if (!lead) return json({ error: "lead_no_encontrado", lead_phone: leadPhone }, 404);

    // 1) Insertar el mensaje saliente.
    const { error: insErr } = await admin.database.from("musa_messages").insert([{
      lead_phone: leadPhone,
      direction: "out",
      body: texto,
      estado_funnel: lead.estado_funnel ?? null,
    }]);
    if (insErr) {
      console.error("insert out", JSON.stringify(insErr));
      return json({ error: "no_se_pudo_insertar", detalle: JSON.stringify(insErr).slice(0, 200) }, 500);
    }

    // 2) Actualizar last_out_at.
    await admin.database.from("musa_leads")
      .update({ last_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("phone", leadPhone);

    // 3) Enviar por Twilio salvo número de prueba (+9999*).
    const esPrueba = leadPhone.startsWith("+9999");
    let envio: { ok: boolean; http?: number; error?: string } = { ok: true };
    if (!esPrueba) {
      envio = await enviarTwilio(leadPhone, texto);
    }

    // 4) Registrar el evento (siempre, también si Twilio falló: el mensaje quedó en BD).
    await admin.database.from("musa_funnel_events").insert([{
      lead_phone: leadPhone,
      evento: "respuesta_manual_operador",
      detalle: {
        por: "admin_panel",
        chars: texto.length,
        estado_funnel: lead.estado_funnel ?? null,
        twilio_enviado: esPrueba ? false : envio.ok,
        es_prueba: esPrueba,
      },
    }]);

    return json({
      ok: true,
      lead_phone: leadPhone,
      twilio_enviado: esPrueba ? false : envio.ok,
      es_prueba: esPrueba,
      twilio_http: envio.http ?? null,
      twilio_error: envio.ok ? null : (envio.error ?? null),
    });
  } catch (e) {
    console.error("musa-admin-responder error", String(e).slice(0, 300));
    return json({ error: "error_interno", detalle: String(e).slice(0, 200) }, 500);
  }
}
