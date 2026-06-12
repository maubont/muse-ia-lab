// musa-seguimientos: re-engancha leads fríos dentro de la ventana de 24h de WhatsApp.
// Invocada por cron cada 15 min con header x-cron-key (igual que musa-tasa-dia).
//
// Reglas (lista negra): sin urgencia falsa (el bono de acción rápida solo se menciona
// si bono_rapido_hasta sigue vigente), sin precios inventados (precio_bs_hoy de settings),
// máximo 3 seguimientos, nunca a opt_out / menores / escalados / pagados.
import { createAdminClient } from "npm:@insforge/sdk";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Umbral en minutos desde last_out_at, según seguimientos_enviados (0, 1, 2).
const UMBRALES_MIN = [30, 4 * 60, 20 * 60];
const UMBRAL_S08_MIN = 15; // caso especial: recordatorio de pago en S08_ESPERA_CAPTURA
const MAX_SEGUIMIENTOS = 3;
const ESTADOS_EXCLUIDOS = new Set(["S00_LLEGADA", "S92_MENOR"]);
const VENTANA_24H_MS = 24 * 3600 * 1000;

const PROMPT_MUESTRA =
  "🎨 *Muestra real del curso:* 'Retrato hiperrealista de una mujer joven latina, fotografía profesional, luz natural dorada, piel realista con textura, 85mm f/1.4' — pruébalo gratis en cualquier IA de imágenes y me cuentas 😏";

function fmtMiles(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function reemplazarNombre(msg: string, nombre: string): string {
  if (nombre) return msg.replaceAll("{{nombre}}", nombre);
  // Sin nombre conocido: quitar el placeholder sin dejar comas ni espacios colgando.
  return msg
    .replace(/,\s*\{\{nombre\}\}/g, "")
    .replace(/\{\{nombre\}\},\s*/g, "")
    .replace(/[ \t]*\{\{nombre\}\}/g, "")
    .replace(/\{\{nombre\}\}/g, "");
}

function horaCaracas(d: Date): string {
  return new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function fechaCaracas(d: Date): string {
  // en-CA => YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(d);
}

type Lead = {
  phone: string;
  nombre: string | null;
  profile_name: string | null;
  pais: string | null;
  estado_funnel: string;
  mayor_18: boolean | null;
  bono_rapido_hasta: string | null;
  last_in_at: string | null;
  last_out_at: string | null;
  seguimientos_enviados: number | null;
};

// Mensaje de 20h: resuelve variantes [SOLO VE]/[SOLO CO] y omite el bono si ya venció
// (NUNCA urgencia falsa). Devuelve null si falta el precio del día para VE.
function construirMensaje20h(
  plantilla: string,
  lead: Lead,
  precioBsTxt: string | null,
  precioCopTxt: string,
): string | null {
  const bonoHasta = lead.bono_rapido_hasta ? new Date(lead.bono_rapido_hasta) : null;
  const bonoActivo = bonoHasta !== null &&
    Number.isFinite(bonoHasta.getTime()) && Date.now() < bonoHasta.getTime();

  const lineas = plantilla.split("\n");
  const out: string[] = [];
  for (let linea of lineas) {
    if (linea.includes("[SOLO VE]")) {
      const m = linea.match(/^(.*?)\[SOLO VE\]\s*(.*?)\s*\/\s*\[SOLO CO\]\s*(.*)$/);
      if (m) {
        const prefijo = m[1]; // p. ej. "1️⃣ "
        let cuerpo: string;
        if (lead.pais === "VE") {
          if (!precioBsTxt) return null; // sin precio del día: no inventar cifras
          cuerpo = m[2];
        } else if (lead.pais === "CO") {
          cuerpo = m[3];
        } else {
          cuerpo = "Tu acceso sigue disponible en *9 USD* (pago único).";
        }
        // Si el bono venció solo queda un punto: quitar la numeración.
        linea = (bonoActivo ? prefijo : prefijo.replace(/^\s*1️⃣\s*/, "")) + cuerpo;
      }
    }
    if (linea.includes("2️⃣") && !bonoActivo) continue; // bono vencido => sin esa parte
    out.push(linea);
  }

  let msg = out.join("\n").replace(/\n{3,}/g, "\n\n");

  if (!bonoActivo) {
    msg = msg.replace(
      "paso a contarte dos cosas reales antes de cerrar tu chat de hoy",
      "paso a contarte algo real antes de cerrar tu chat de hoy",
    );
  } else if (bonoHasta) {
    // Si el plazo real vence en otra fecha (hora Caracas), no decir "hoy".
    if (fechaCaracas(bonoHasta) !== fechaCaracas(new Date())) {
      msg = msg.replace("vence hoy a las {{hora_limite}}", "vence mañana a las {{hora_limite}}");
    }
    msg = msg.replaceAll("{{hora_limite}}", horaCaracas(bonoHasta));
  }
  return msg;
}

async function enviarTwilio(
  phone: string,
  body: string,
): Promise<{ ok: boolean; sid?: string; skipped?: boolean; error?: string }> {
  // Números de prueba: nunca tocar Twilio.
  if (phone.startsWith("+9999")) return { ok: true, skipped: true };

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_WHATSAPP_FROM");
  if (!accountSid || !authToken || !from) {
    return { ok: false, error: "twilio_env_incompleto" };
  }

  const params = new URLSearchParams({
    From: from,
    To: `whatsapp:${phone}`,
    Body: body,
  });

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );
    const data = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!res.ok) {
      return { ok: false, error: `twilio_http_${res.status}: ${data?.message ?? ""}` };
    }
    return { ok: true, sid: typeof data?.sid === "string" ? data.sid : undefined };
  } catch (e) {
    return { ok: false, error: "twilio_fetch: " + (e instanceof Error ? e.message : String(e)) };
  }
}

export default async function (req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const esperado = Deno.env.get("MUSA_CRON_KEY");
  const recibido = req.headers.get("x-cron-key");
  if (!esperado || recibido !== esperado) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL")!,
    apiKey: Deno.env.get("API_KEY")!,
  });

  // --- Settings: copys y precios reales ---
  const { data: settingsRows, error: setErr } = await admin.database
    .from("musa_settings")
    .select("key, value")
    .in("key", ["funnel_copy", "precio_bs_hoy", "precio"]);
  if (setErr || !settingsRows) {
    return json({ ok: false, error: "db_error_settings", detalle: setErr?.message ?? setErr }, 500);
  }
  const settings = new Map(settingsRows.map((r: { key: string; value: unknown }) => [r.key, r.value]));

  const funnelCopy = settings.get("funnel_copy") as
    | {
      seguimientos?: Array<{ mensaje?: string }>;
      etapas?: Array<{ id?: string; mensajes?: string[] }>;
    }
    | undefined;
  const seguimientosCopy = funnelCopy?.seguimientos;
  if (!Array.isArray(seguimientosCopy) || seguimientosCopy.length < MAX_SEGUIMIENTOS) {
    return json({ ok: false, error: "settings_sin_copy_seguimientos" }, 500);
  }

  // Recordatorio de pago de S08 (primer mensaje, sin la etiqueta [RECORDATORIO ...]).
  const etapaS08 = funnelCopy?.etapas?.find((e) => e?.id === "S08_ESPERA_CAPTURA");
  const copyS08 = (etapaS08?.mensajes?.[0] ?? "").replace(/^\[[^\]]*\]\s*/, "") ||
    "¿Cómo vas con el pago, {{nombre}}? 😊 Si te surgió algún detalle con la transferencia, dime y lo resolvemos juntos.";

  const precioBsHoy = settings.get("precio_bs_hoy") as { bs?: number } | undefined;
  const bs = Number(precioBsHoy?.bs);
  const precioBsTxt = Number.isFinite(bs) && bs > 0 ? fmtMiles(bs) : null;

  const precioCfg = settings.get("precio") as { cop?: number } | undefined;
  const cop = Number(precioCfg?.cop);
  const precioCopTxt = Number.isFinite(cop) && cop > 0 ? fmtMiles(cop) : "33.000";

  // --- Leads candidatos ---
  const ahora = Date.now();
  const desde24h = new Date(ahora - VENTANA_24H_MS).toISOString();

  const { data: leads, error: leadsErr } = await admin.database
    .from("musa_leads")
    .select(
      "phone, nombre, profile_name, pais, estado_funnel, mayor_18, bono_rapido_hasta, last_in_at, last_out_at, seguimientos_enviados",
    )
    .eq("opt_out", false)
    .eq("pagado", false)
    .eq("escalado_humano", false)
    .gte("last_in_at", desde24h)
    .limit(500);
  if (leadsErr) {
    return json({ ok: false, error: "db_error_leads", detalle: leadsErr.message ?? leadsErr }, 500);
  }

  type Candidato = { lead: Lead; n: number; esS08Inicial: boolean; umbralMin: number };
  const candidatos: Candidato[] = [];

  for (const lead of (leads ?? []) as Lead[]) {
    if (ESTADOS_EXCLUIDOS.has(lead.estado_funnel)) continue;
    if (lead.mayor_18 === false) continue; // menor declarado: jamás
    if (!lead.last_in_at || !lead.last_out_at) continue;

    const lastIn = new Date(lead.last_in_at).getTime();
    const lastOut = new Date(lead.last_out_at).getTime();
    if (!Number.isFinite(lastIn) || !Number.isFinite(lastOut)) continue;
    if (ahora - lastIn > VENTANA_24H_MS) continue; // fuera de la ventana de servicio
    if (!(lastOut > lastIn)) continue; // el lead tiene la palabra: no interrumpir

    const n = lead.seguimientos_enviados ?? 0;
    if (n >= MAX_SEGUIMIENTOS) continue;

    const esS08Inicial = n === 0 && lead.estado_funnel === "S08_ESPERA_CAPTURA";
    const umbralMin = esS08Inicial ? UMBRAL_S08_MIN : UMBRALES_MIN[n];
    if (ahora - lastOut < umbralMin * 60 * 1000) continue;

    candidatos.push({ lead, n, esS08Inicial, umbralMin });
  }

  // --- Envío ---
  let enviados = 0;
  const detalles: Array<Record<string, unknown>> = [];

  for (const { lead, n, esS08Inicial, umbralMin } of candidatos) {
    const numero = n + 1;
    try {
      const nombre = (lead.nombre ?? "").trim();

      let cuerpo: string | null;
      if (esS08Inicial) {
        cuerpo = copyS08;
      } else if (n === 0) {
        cuerpo = seguimientosCopy[0]?.mensaje ?? null;
      } else if (n === 1) {
        cuerpo = (seguimientosCopy[1]?.mensaje ?? "").replaceAll("[PROMPT_MUESTRA]", PROMPT_MUESTRA) || null;
      } else {
        cuerpo = construirMensaje20h(seguimientosCopy[2]?.mensaje ?? "", lead, precioBsTxt, precioCopTxt);
      }
      if (!cuerpo) {
        detalles.push({ phone: lead.phone, numero, error: "sin_copy_o_sin_precio_bs" });
        continue;
      }

      cuerpo = reemplazarNombre(cuerpo, nombre)
        .replaceAll("{{precio_cop}}", precioCopTxt);
      if (precioBsTxt) cuerpo = cuerpo.replaceAll("{{precio_bs}}", precioBsTxt);
      if (cuerpo.includes("{{precio_bs}}")) {
        // Sin tasa del día no se citan montos en Bs (lista negra: precios reales).
        detalles.push({ phone: lead.phone, numero, error: "sin_precio_bs" });
        continue;
      }

      // 1) Mensaje saliente persistido.
      const { error: msgErr } = await admin.database.from("musa_messages").insert([{
        lead_phone: lead.phone,
        direction: "out",
        body: cuerpo,
        estado_funnel: lead.estado_funnel,
      }]);
      if (msgErr) {
        detalles.push({ phone: lead.phone, numero, error: "insert_msg: " + JSON.stringify(msgErr) });
        continue;
      }

      // 2) Lead actualizado (guard optimista sobre el contador por si hay doble cron).
      const { error: updErr } = await admin.database
        .from("musa_leads")
        .update({ last_out_at: new Date().toISOString(), seguimientos_enviados: numero })
        .eq("phone", lead.phone)
        .eq("seguimientos_enviados", n);
      if (updErr) {
        detalles.push({ phone: lead.phone, numero, error: "update_lead: " + JSON.stringify(updErr) });
        continue;
      }

      // 3) Evento de funnel.
      const { error: evErr } = await admin.database.from("musa_funnel_events").insert([{
        lead_phone: lead.phone,
        evento: "seguimiento_enviado",
        detalle: { numero, estado_funnel: lead.estado_funnel, umbral_min: umbralMin },
      }]);
      if (evErr) {
        console.error("musa-seguimientos evento:", JSON.stringify(evErr));
      }

      // 4) Twilio REST (omitido para números de prueba +9999...).
      const twilio = await enviarTwilio(lead.phone, cuerpo);

      enviados++;
      detalles.push({
        phone: lead.phone,
        numero,
        estado_funnel: lead.estado_funnel,
        twilio: twilio.skipped ? "skipped_test" : (twilio.ok ? (twilio.sid ?? "ok") : twilio.error),
        preview: cuerpo.slice(0, 80),
      });
    } catch (e) {
      detalles.push({
        phone: lead.phone,
        numero,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return json({ ok: true, candidatos: candidatos.length, enviados, detalles });
}
