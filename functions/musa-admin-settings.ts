// musa-admin-settings — Edge function ADMIN (solo el dueño).
// GET  -> { precio, precio_bs_hoy, cuentas_ve, cuentas_co }
// POST {key, value} -> actualiza SOLO claves whitelisteadas con jsonb válido.
//   Claves permitidas: precio, precio_bs_hoy, cuentas_ve, cuentas_co.
//   (Rechaza gpt_system, operador, funnel_copy, etc.)
//   Al guardar cuentas_ve se permite provisional=false (salir del modo provisional).
//
// AUTH: Bearer del usuario -> getCurrentUser().email == MUSA_OWNER_EMAIL. Sin token 401, otro email 403.
import { createClient, createAdminClient } from "npm:@insforge/sdk";

const CLAVES_PERMITIDAS = ["precio", "precio_bs_hoy", "cuentas_ve", "cuentas_co"];

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

/** Valida que el value sea un objeto jsonb plausible para la clave dada. */
function validarValue(key: string, value: Any): { ok: boolean; motivo?: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, motivo: "value debe ser un objeto JSON" };
  }
  if (key === "precio") {
    if (value.usd != null && typeof value.usd !== "number") {
      return { ok: false, motivo: "precio.usd debe ser número" };
    }
    if (value.cop != null && typeof value.cop !== "number") {
      return { ok: false, motivo: "precio.cop debe ser número" };
    }
  }
  if (key === "precio_bs_hoy") {
    if (value.bs != null && typeof value.bs !== "number") {
      return { ok: false, motivo: "precio_bs_hoy.bs debe ser número" };
    }
  }
  if (key === "cuentas_ve" || key === "cuentas_co") {
    if ("provisional" in value && typeof value.provisional !== "boolean") {
      return { ok: false, motivo: `${key}.provisional debe ser booleano` };
    }
  }
  return { ok: true };
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const guard = await exigirDueno(req);
  if (guard.error) return guard.error;

  const admin = adminClient();

  try {
    if (req.method === "GET") {
      const { data } = await admin.database
        .from("musa_settings")
        .select("key, value")
        .in("key", CLAVES_PERMITIDAS);
      const out: Record<string, Any> = {
        precio: null, precio_bs_hoy: null, cuentas_ve: null, cuentas_co: null,
      };
      for (const r of data ?? []) out[r.key] = r.value;
      return json(out);
    }

    if (req.method === "POST") {
      let payload: Any = {};
      try {
        payload = await req.json();
      } catch (_e) {
        return json({ error: "json_invalido" }, 400);
      }
      const key = String(payload.key || "").trim();
      const value = payload.value;

      if (!CLAVES_PERMITIDAS.includes(key)) {
        return json({ error: "clave_no_permitida", key, permitidas: CLAVES_PERMITIDAS }, 403);
      }
      const v = validarValue(key, value);
      if (!v.ok) return json({ error: "value_invalido", motivo: v.motivo }, 400);

      // upsert idempotente sobre la clave (PK = key).
      const { data: existe } = await admin.database
        .from("musa_settings").select("key").eq("key", key).maybeSingle();

      if (existe) {
        const { error } = await admin.database
          .from("musa_settings").update({ value }).eq("key", key);
        if (error) return json({ error: "update_fallo", detalle: String(error).slice(0, 200) }, 500);
      } else {
        const { error } = await admin.database
          .from("musa_settings").insert([{ key, value }]);
        if (error) return json({ error: "insert_fallo", detalle: String(error).slice(0, 200) }, 500);
      }

      const { data: guardado } = await admin.database
        .from("musa_settings").select("key, value").eq("key", key).maybeSingle();
      return json({ ok: true, key, value: guardado?.value ?? value });
    }

    return json({ error: "method_not_allowed" }, 405);
  } catch (e) {
    console.error("musa-admin-settings error", String(e).slice(0, 300));
    return json({ error: "error_interno", detalle: String(e).slice(0, 200) }, 500);
  }
}
