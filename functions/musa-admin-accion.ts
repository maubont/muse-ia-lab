// musa-admin-accion — Edge function ADMIN (solo el dueño).
// POST {accion:'aprobar'|'rechazar'|'tomar_control'|'devolver_control', short_id?, lead_phone?, motivo?}
//
// aprobar/rechazar: NO duplica lógica. Hace un POST interno al webhook
// (musa-webhook-twilio) simulando un mensaje del OPERADOR ("ok <id>" / "no <id> <motivo>")
// para REUSAR procesarComandoOperador exacto (idempotente por status del pago).
// tomar_control/devolver_control: UPDATE musa_leads.escalado_humano.
//
// AUTH: Bearer del usuario -> getCurrentUser().email == MUSA_OWNER_EMAIL. Sin token 401, otro email 403.
import { createClient, createAdminClient } from "npm:@insforge/sdk";

const WEBHOOK_URL = "https://m2gnzrj8.functions.insforge.app/musa-webhook-twilio";

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

function soloDigitos(s: string | null): string {
  return (s || "").replace(/\D+/g, "");
}

/** Lanza el comando del operador contra el webhook (reusa procesarComandoOperador). */
async function comandoOperador(
  admin: Any,
  shortId: string,
  body: string,
  phashCorto: string,
): Promise<{ http: number; texto: string }> {
  const { data: oper } = await admin.database
    .from("musa_settings").select("value").eq("key", "operador").maybeSingle();
  const operWhats = (oper?.value?.whatsapp || "").trim();
  if (!operWhats) throw new Error("operador.whatsapp no configurado");
  const waId = soloDigitos(operWhats);

  // MessageSid único por intento: NO bloquea el dedup del webhook entre reintentos
  // del dueño; la idempotencia real la garantiza el status del pago en procesarComandoOperador.
  const messageSid = `ADMIN-${shortId}-${phashCorto}-${Date.now()}`;

  const form = new URLSearchParams();
  form.set("From", `whatsapp:${operWhats}`);
  form.set("To", `whatsapp:${waId}`);
  form.set("WaId", waId);
  form.set("Body", body);
  form.set("MessageSid", messageSid);
  form.set("NumMedia", "0");

  // X-Musa-Internal: clave compartida que el webhook reconoce como BYPASS confiable
  // de la validación X-Twilio-Signature (este POST interno no lleva firma de Twilio).
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const internalKey = Deno.env.get("MUSA_INTERNAL_KEY");
  if (internalKey) headers["X-Musa-Internal"] = internalKey;

  const r = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers,
    body: form.toString(),
  });
  const texto = await r.text();
  return { http: r.status, texto: texto.slice(0, 400) };
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

  const accion = String(payload.accion || "").trim();
  const admin = adminClient();

  try {
    if (accion === "aprobar" || accion === "rechazar") {
      const shortId = String(payload.short_id || "").trim();
      if (!/^\d{3,6}$/.test(shortId)) return json({ error: "short_id_invalido" }, 400);

      // Buscar el pago para phash y status actual (informativo / idempotencia).
      const { data: pago } = await admin.database
        .from("musa_payments")
        .select("short_id, status, image_phash, lead_phone")
        .eq("short_id", shortId)
        .maybeSingle();
      if (!pago) return json({ error: "pago_no_encontrado", short_id: shortId }, 404);

      const phashCorto = String(pago.image_phash || "x").slice(0, 6);
      const yaResuelto = pago.status !== "revision";

      let body: string;
      if (accion === "aprobar") {
        body = `ok ${shortId}`;
      } else {
        const motivo = String(payload.motivo || "").trim() || "no_validado";
        body = `no ${shortId} ${motivo}`;
      }

      const res = await comandoOperador(admin, shortId, body, phashCorto);

      // Releer status tras la acción para confirmar el efecto.
      const { data: despues } = await admin.database
        .from("musa_payments")
        .select("status").eq("short_id", shortId).maybeSingle();

      return json({
        ok: res.http >= 200 && res.http < 300,
        accion,
        short_id: shortId,
        status_antes: pago.status,
        status_despues: despues?.status ?? null,
        ya_estaba_resuelto: yaResuelto,
        webhook_http: res.http,
      });
    }

    if (accion === "tomar_control" || accion === "devolver_control") {
      const leadPhone = String(payload.lead_phone || "").trim();
      if (!/^\+\d{6,15}$/.test(leadPhone)) {
        return json({ error: "lead_phone_invalido" }, 400);
      }
      const { data: lead } = await admin.database
        .from("musa_leads").select("phone, escalado_humano")
        .eq("phone", leadPhone).maybeSingle();
      if (!lead) return json({ error: "lead_no_encontrado", lead_phone: leadPhone }, 404);

      const nuevo = accion === "tomar_control";
      // Idempotente: si ya está en el estado deseado, no rompe nada.
      await admin.database.from("musa_leads")
        .update({ escalado_humano: nuevo, updated_at: new Date().toISOString() })
        .eq("phone", leadPhone);
      await admin.database.from("musa_funnel_events").insert([{
        lead_phone: leadPhone,
        evento: nuevo ? "control_humano_tomado" : "control_humano_devuelto",
        detalle: { por: "admin_panel" },
      }]);

      return json({
        ok: true,
        accion,
        lead_phone: leadPhone,
        escalado_humano: nuevo,
        antes: lead.escalado_humano === true,
      });
    }

    return json({ error: "accion_desconocida", accion }, 400);
  } catch (e) {
    console.error("musa-admin-accion error", String(e).slice(0, 300));
    return json({ error: "error_interno", detalle: String(e).slice(0, 200) }, 500);
  }
}
