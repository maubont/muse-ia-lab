// musa-wompi-events — webhook de EVENTOS de Wompi (Colombia).
// Wompi llama aquí (server-to-server) cuando una transacción cambia de estado.
// Verifica el checksum del evento (FAIL-CLOSED: 401 si no valida), y si la
// transacción quedó APPROVED, marca el pago y entrega el curso automáticamente.
//
// AUTOCONTENIDA a propósito: en InsForge cada edge function se despliega como UN
// solo archivo (no se empaqueta ./lib), así que se inlinean: (1) el verificador de
// checksum (copia canónica y probada de functions/lib/wompi.ts + scripts/test-wompi.mjs),
// y (2) la entrega del curso (réplica de entregarCurso de musa-webhook-twilio.ts).
// Si algún día se hace el refactor a functions/lib/musa-core.ts, unificar ambos.
//
// Secrets: WOMPI_EVENT_SECRET, INSFORGE_BASE_URL, API_KEY (o MUSA_INSFORGE_API_KEY),
//          TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM.
// Despliegue: npx @insforge/cli functions deploy musa-wompi-events --file functions/musa-wompi-events.ts
// URL de eventos a registrar en el panel de Wompi:
//   https://m2gnzrj8.functions.insforge.app/musa-wompi-events

import { createAdminClient } from "npm:@insforge/sdk";

// ============================== tipos ==============================
// deno-lint-ignore no-explicit-any
type Admin = any;
type Lead = {
  phone: string;
  profile_name: string | null;
  nombre: string | null;
  estado_funnel: string;
  pagado?: boolean;
  [k: string]: unknown;
};
type Cfg = {
  precio: { usd?: number; cop?: number };
  precioBsHoy: { bs?: number };
  // deno-lint-ignore no-explicit-any
  cuentasVe: any;
  // deno-lint-ignore no-explicit-any
  cuentasCo: any;
  marca: { asesora?: string; firma?: string };
  entrega: {
    link_grupo?: string;
    modulos?: string[];
    bonos?: Record<string, string>;
    plan_accion_7dias?: string;
  };
  pago: { proveedor?: string; monto_cents?: number; moneda?: string };
};

// ============================== Wompi: verificación de eventos (de lib/wompi.ts) ==============================

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparación de strings hex en tiempo constante (anti timing-attack). */
function igualHexConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifica la firma (checksum) de un evento de Wompi. FAIL-CLOSED: si falta cualquier
 * pieza para validar (secret, header, properties o timestamp) devuelve valido=false.
 * Cadena = concat(valores de signature.properties leídos de body.data) + body.timestamp
 *          + eventSecret  → SHA-256 hex, comparado contra x-event-checksum (case-insensitive).
 * El timestamp se toma del CUERPO (body.timestamp), no de un header.
 */
async function verificarChecksumEvento(
  // deno-lint-ignore no-explicit-any
  body: any,
  checksumHeader: string | null | undefined,
  eventSecret: string | undefined | null,
): Promise<{ valido: boolean; motivo: string }> {
  if (!eventSecret) return { valido: false, motivo: "sin_event_secret" };
  if (!checksumHeader) return { valido: false, motivo: "sin_header_checksum" };
  const props = body?.signature?.properties;
  const ts = body?.timestamp;
  const data = body?.data;
  if (!Array.isArray(props) || props.length === 0) return { valido: false, motivo: "sin_properties" };
  if (ts === undefined || ts === null) return { valido: false, motivo: "sin_timestamp" };
  let cadena = "";
  for (const prop of props) {
    // deno-lint-ignore no-explicit-any
    let valor: any = data;
    for (const parte of String(prop).split(".")) valor = valor?.[parte];
    cadena += String(valor ?? "");
  }
  cadena += String(ts) + eventSecret;
  const calc = await sha256Hex(cadena);
  return igualHexConstante(calc.toLowerCase(), String(checksumHeader).toLowerCase())
    ? { valido: true, motivo: "ok" }
    : { valido: false, motivo: "no_coincide" };
}

// ============================== settings ==============================

async function cargarSettings(admin: Admin): Promise<Cfg> {
  const claves = ["precio", "precio_bs_hoy", "cuentas_ve", "cuentas_co", "marca", "entrega", "pago"];
  const { data, error } = await admin.database
    .from("musa_settings")
    .select("key, value")
    .in("key", claves);
  if (error) throw new Error("settings: " + JSON.stringify(error));
  const map: Record<string, unknown> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return {
    precio: (map["precio"] ?? { usd: 9, cop: 33000 }) as Cfg["precio"],
    precioBsHoy: (map["precio_bs_hoy"] ?? { bs: 7400 }) as Cfg["precioBsHoy"],
    cuentasVe: map["cuentas_ve"] ?? {},
    cuentasCo: map["cuentas_co"] ?? {},
    marca: (map["marca"] ?? {}) as Cfg["marca"],
    entrega: (map["entrega"] ?? {}) as Cfg["entrega"],
    pago: (map["pago"] ?? { proveedor: "manual" }) as Cfg["pago"],
  };
}

// ============================== helpers de entrega (réplica del webhook) ==============================

function formatMiles(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const PALABRAS_NEGOCIO =
  /(venta|shop|store|tienda|negocio|inversion|oficial|marketing|online|grupo|empresa|publicidad|agencia|import|export|cursos|modelos|servicio|disponible|whatsapp)/i;

function nombreUsable(lead: Lead): string | null {
  const candidato = (lead.nombre || lead.profile_name || "").trim();
  if (!candidato) return null;
  const palabras = candidato.split(/\s+/);
  if (palabras.length > 2) return null;
  const primera = palabras[0];
  if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]{2,20}$/.test(primera)) return null;
  if (PALABRAS_NEGOCIO.test(candidato)) return null;
  return primera.charAt(0).toUpperCase() + primera.slice(1).toLowerCase();
}

function limpiarTokens(t: string): string {
  return (t || "")
    .replace(/\[(VIDEO_AVATAR[^\]]*|PROMPT_MUESTRA|ENTREGA_LINKS:[^\]]*)\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function resolverPlaceholders(texto: string, lead: Lead, cfg: Cfg): string {
  let t = texto ?? "";
  const nombre = nombreUsable(lead);
  if (nombre) {
    t = t.replace(/\{\{nombre\}\}/g, nombre);
  } else {
    t = t
      .replace(/,\s*\{\{nombre\}\}/g, "")
      .replace(/\{\{nombre\}\},\s*/g, "")
      .replace(/\s*\{\{nombre\}\}\s*/g, " ");
  }
  t = t
    .replace(/\{\{precio_cop\}\}/g, formatMiles(Number(cfg.precio?.cop ?? 33000)))
    .replace(/\{\{link_grupo\}\}/g, cfg.entrega?.link_grupo ?? "");
  return limpiarTokens(t).replace(/ {2,}/g, " ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function calcularRetardoMs(texto: string): number {
  return Math.min(4500, 350 + (texto || "").length * 35);
}

async function registrarEvento(
  admin: Admin,
  phone: string | null,
  evento: string,
  detalle: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await admin.database
    .from("musa_funnel_events")
    .insert([{ lead_phone: phone, evento, detalle }]);
  if (error) console.error("evento " + evento, JSON.stringify(error));
}

async function actualizarLead(admin: Admin, lead: Lead, patch: Record<string, unknown>): Promise<void> {
  const { error } = await admin.database.from("musa_leads").update(patch).eq("phone", lead.phone);
  if (error) throw new Error("update lead: " + JSON.stringify(error));
  Object.assign(lead, patch);
}

async function transicion(admin: Admin, lead: Lead, nuevo: string): Promise<void> {
  if (lead.estado_funnel === nuevo) return;
  const anterior = lead.estado_funnel;
  const { error } = await admin.database.from("musa_leads").update({ estado_funnel: nuevo }).eq("phone", lead.phone);
  if (error) throw new Error("transicion: " + JSON.stringify(error));
  lead.estado_funnel = nuevo;
  await registrarEvento(admin, lead.phone, "cambio_estado", { de: anterior, a: nuevo });
}

/** Envío de WhatsApp por Twilio + persistencia. Sin typing (no hay mensaje entrante). */
async function enviarMensajes(admin: Admin, lead: Lead, textos: string[]): Promise<void> {
  const limpios = textos.map((t) => (t || "").trim()).filter((b) => b.length > 0);
  if (limpios.length === 0) return;
  const esPrueba = lead.phone.startsWith("+9999");
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886";
  const enviarReal = !esPrueba && !!sid && !!token;

  for (const body of limpios) {
    if (enviarReal) await sleep(calcularRetardoMs(body));
    const { error } = await admin.database.from("musa_messages").insert([{
      lead_phone: lead.phone,
      direction: "out",
      body,
      estado_funnel: lead.estado_funnel,
    }]);
    if (error) console.error("insert out", JSON.stringify(error));
    if (enviarReal) {
      try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: {
            "Authorization": "Basic " + btoa(`${sid}:${token}`),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ From: from, To: `whatsapp:${lead.phone}`, Body: body }),
        });
        if (!res.ok) console.error("twilio send", res.status, (await res.text()).slice(0, 200));
      } catch (e) {
        console.error("twilio err", String(e).slice(0, 200));
      }
    }
  }
  await admin.database.from("musa_leads").update({ last_out_at: new Date().toISOString() }).eq("phone", lead.phone);
}

/** ENTREGA (S10): pagado=true, S10_ENTREGA y 3 mensajes (módulos / bonos+plan / bienvenida). */
async function entregarCurso(admin: Admin, lead: Lead, cfg: Cfg): Promise<void> {
  const modulos = cfg.entrega?.modulos ?? [];
  const bonos = cfg.entrega?.bonos ?? {};
  const plan = cfg.entrega?.plan_accion_7dias ?? "";

  const ETIQUETAS_BONOS: Record<string, string> = {
    coleccion_modelos: "Colección de Modelos",
    megapack_master_ia: "Megapack Master IA",
    youtube_money_machine: "YouTube Money Machine",
    audios_fempro: "Audios FemPro",
  };

  const bloque1 = ["📚 *Tu curso (13 módulos):*"];
  modulos.forEach((url, i) => bloque1.push(`${i + 1}. ${url}`));

  const bloque2 = ["🎁 *Tus 4 bonos + regalo:*"];
  let n = 1;
  for (const [k, url] of Object.entries(bonos)) {
    if (!url) continue;
    bloque2.push(`${n}. ${ETIQUETAS_BONOS[k] ?? k}: ${url}`);
    n++;
  }
  if (plan) bloque2.push(`🎁 *Regalo — Plan de Acción 7 Días:* ${plan}`);

  const bienvenida = resolverPlaceholders(
    "¡Bienvenida oficialmente, {{nombre}}! 💜 Ya tienes acceso de por vida a todo. " +
      "Mi consejo: empieza HOY por el *Módulo 1* (el primer enlace de arriba) y avanza a tu ritmo. " +
      "Cualquier duda me escribes por aquí 😊",
    lead,
    cfg,
  );

  // Claim atómico anti-doble-entrega (evento Wompi + captura/operador concurrentes):
  // solo entrega quien gana el paso pagado=false→true. Si pierde, no re-entrega.
  // OJO: existe una copia gemela de entregarCurso en functions/musa-webhook-twilio.ts;
  // si cambias la entrega, cámbiala en AMBAS.
  const { data: _claim } = await admin.database
    .from("musa_leads")
    .update({ pagado: true })
    .eq("phone", lead.phone)
    .eq("pagado", false)
    .select("phone");
  if (!(Array.isArray(_claim) && _claim.length > 0)) {
    await registrarEvento(admin, lead.phone, "entrega_omitida_ya_pagado", { via: "wompi" });
    return;
  }
  lead.pagado = true;
  await transicion(admin, lead, "S10_ENTREGA");
  await enviarMensajes(admin, lead, [bloque1.join("\n"), bloque2.join("\n"), bienvenida]);
  await registrarEvento(admin, lead.phone, "entrega_realizada", {
    modulos: modulos.length,
    bonos: n - 1,
    tiene_plan: !!plan,
    via: "wompi",
  });
}

// ============================== handler ==============================

function txt(body: string, status: number): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return txt("method_not_allowed", 405);

  // 1) Leer y parsear el cuerpo.
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return txt("bad_json", 400);
  }

  // 2) Verificar checksum — FAIL-CLOSED (única respuesta no-200 por seguridad).
  const eventSecret = Deno.env.get("WOMPI_EVENT_SECRET");
  const checksum = req.headers.get("x-event-checksum");
  const ver = await verificarChecksumEvento(body, checksum, eventSecret);
  if (!ver.valido) {
    console.error("wompi checksum invalido:", ver.motivo);
    return txt("invalid_checksum", 401);
  }

  // 3) Solo nos interesa transaction.updated.
  // deno-lint-ignore no-explicit-any
  const b = body as any;
  if (b.event !== "transaction.updated") return txt("ignored", 200);
  const tx = b.data?.transaction;
  const reference: string | undefined = tx?.reference;
  const status: string = String(tx?.status ?? "");
  if (!reference) return txt("no_reference", 200);

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL")!,
    apiKey: (Deno.env.get("API_KEY") ?? Deno.env.get("MUSA_INSFORGE_API_KEY"))!,
  });

  // 4) Buscar la fila de pago por (metodo='wompi', ref_normalizada=reference).
  const { data: pago } = await admin.database
    .from("musa_payments")
    .select("*")
    .eq("metodo", "wompi")
    .eq("ref_normalizada", reference)
    .maybeSingle();
  if (!pago) {
    await registrarEvento(admin, null, "pago_wompi_sin_fila", { reference, status });
    return txt("no_row", 200); // 200: no provocar reintentos de Wompi
  }

  const { data: lead } = await admin.database
    .from("musa_leads")
    .select("*")
    .eq("phone", pago.lead_phone)
    .maybeSingle();

  const cfg = await cargarSettings(admin);

  // 5) Ramas por estado de la transacción.
  if (status === "APPROVED") {
    // Idempotencia (fast-path): si ya estaba aprobado o el lead ya pagó, no re-entregar.
    // (El gate definitivo anti-carrera es el claim atómico dentro de entregarCurso.)
    if (pago.status === "aprobado" || lead?.pagado === true) {
      await registrarEvento(admin, pago.lead_phone, "pago_wompi_duplicado", { reference });
      return txt("ok_dup", 200);
    }
    // Anti-tampering: el monto esperado es el que se FIRMÓ en el link y quedó en la fila
    // (musa_payments), NO el settings vigente (mutable). Fallback a settings solo si la
    // fila no lo tuviera. La moneda esperada también sale de la fila.
    const firmadoCents = Number((pago?.datos_extraidos as { amount_in_cents?: number })?.amount_in_cents);
    const expectedCents = Number.isFinite(firmadoCents) && firmadoCents > 0
      ? firmadoCents
      : (Number(cfg.pago?.monto_cents) > 0
        ? Math.round(Number(cfg.pago.monto_cents))
        : Math.round(Number(cfg.precio?.cop ?? 33000) * 100));
    const expectedCurrency = (pago?.moneda as string) || cfg.pago?.moneda || "COP";
    const txCents = Number(tx?.amount_in_cents);
    const txCurrency = String(tx?.currency ?? "");
    if (!Number.isFinite(txCents) || txCents !== expectedCents || txCurrency !== expectedCurrency) {
      await admin.database.from("musa_payments")
        .update({
          status: "revision",
          motivo_flag: "wompi_monto_no_coincide",
          resolved_at: new Date().toISOString(),
          datos_extraidos: { ...(pago.datos_extraidos ?? {}), wompi_tx: tx?.id, amount_in_cents: tx?.amount_in_cents, currency: txCurrency },
        })
        .eq("id", pago.id);
      await registrarEvento(admin, pago.lead_phone, "pago_wompi_monto_no_coincide", {
        reference, esperado_cents: expectedCents, recibido_cents: txCents, moneda: txCurrency,
      });
      return txt("ok_revision", 200); // NO entregar
    }

    // Pago verificado pero SIN lead conciliable: no marcar 'aprobado' (sería irrecuperable);
    // dejar en 'revision' para que el operador lo resuelva desde el panel.
    if (!lead) {
      await admin.database.from("musa_payments")
        .update({
          status: "revision",
          motivo_flag: "wompi_sin_lead",
          resolved_at: new Date().toISOString(),
          datos_extraidos: { ...(pago.datos_extraidos ?? {}), wompi_tx: tx?.id, amount_in_cents: tx?.amount_in_cents },
        })
        .eq("id", pago.id);
      await registrarEvento(admin, pago.lead_phone, "pago_wompi_sin_lead", { reference });
      return txt("ok_revision", 200);
    }

    // Marcar aprobado de forma condicional (no pisar un aprobado de otra vía).
    await admin.database.from("musa_payments")
      .update({
        status: "aprobado",
        resolved_at: new Date().toISOString(),
        datos_extraidos: { ...(pago.datos_extraidos ?? {}), wompi_tx: tx?.id, amount_in_cents: tx?.amount_in_cents, status_wompi: status },
      })
      .eq("id", pago.id)
      .neq("status", "aprobado");
    await registrarEvento(admin, pago.lead_phone, "pago_aprobado_wompi", {
      reference, tx_id: tx?.id, amount_in_cents: tx?.amount_in_cents,
    });
    await entregarCurso(admin, lead as Lead, cfg); // entregarCurso hace el claim atómico anti-doble-entrega
    return txt("ok", 200);
  }

  if (status === "DECLINED" || status === "VOIDED" || status === "ERROR") {
    // Condicional a nivel BD: NUNCA degradar un pago ya aprobado (cierra la carrera).
    await admin.database.from("musa_payments")
      .update({
        status: "rechazado",
        motivo_flag: "wompi_" + status.toLowerCase(),
        resolved_at: new Date().toISOString(),
        datos_extraidos: { ...(pago.datos_extraidos ?? {}), wompi_tx: tx?.id, status_wompi: status },
      })
      .eq("id", pago.id)
      .neq("status", "aprobado");
    await registrarEvento(admin, pago.lead_phone, "pago_rechazado_wompi", { reference, status, tx_id: tx?.id });
    return txt("ok", 200);
  }

  // PENDING u otros: solo registrar.
  await registrarEvento(admin, pago.lead_phone, "pago_wompi_estado", { reference, status });
  return txt("ok", 200);
}
