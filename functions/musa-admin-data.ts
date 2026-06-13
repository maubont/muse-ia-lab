// musa-admin-data — Edge function ADMIN (solo el dueño).
// GET ?view=inicio  -> KPIs del tablero (hoy en America/Caracas).
// GET ?view=pagos   -> cola de revisión + resueltos_hoy, con imagen como data:base64.
//
// AUTH (innegociable): exige Bearer token del usuario; createClient con
// edgeFunctionToken verifica getCurrentUser(); su email DEBE == MUSA_OWNER_EMAIL.
// Sin token -> 401. Email distinto -> 403. La API key admin vive SOLO server-side.
import { createClient, createAdminClient } from "npm:@insforge/sdk";

const TZ = "America/Caracas";
const BUCKET_CAPTURAS = "musa-capturas";

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

/** Verifica el Bearer del usuario y exige email == MUSA_OWNER_EMAIL.
 *  Devuelve {error:Response} si no autorizado, o {ok:true} si pasa. */
async function exigirDueno(req: Request): Promise<{ error?: Response }> {
  const authHeader = req.headers.get("Authorization") || "";
  const userToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!userToken) {
    return { error: json({ error: "no_autenticado" }, 401) };
  }
  const ownerEmail = (Deno.env.get("MUSA_OWNER_EMAIL") || "").trim().toLowerCase();
  if (!ownerEmail) {
    return { error: json({ error: "owner_no_configurado" }, 500) };
  }
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
  if (!email) {
    return { error: json({ error: "token_invalido" }, 401) };
  }
  if (email !== ownerEmail) {
    return { error: json({ error: "no_autorizado" }, 403) };
  }
  return {};
}

function adminClient(): Any {
  return createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY") ?? Deno.env.get("MUSA_INSFORGE_API_KEY"),
  });
}

function caracasHoyISO(): string {
  // "YYYY-MM-DD" en America/Caracas
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // en-CA da YYYY-MM-DD
}

/** Nº de "stage" a partir de "S08_ESPERA_CAPTURA" -> 8 (o null). */
function stageNum(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/^S(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function enmascararTel(phone: string | null): string {
  const p = (phone || "").trim();
  if (p.length <= 6) return p;
  return p.slice(0, 4) + "***" + p.slice(-3);
}

// ============================== view=inicio ==============================

async function vistaInicio(admin: Any): Promise<Response> {
  const hoy = caracasHoyISO();
  const ahora = Date.now();

  // Cargamos en paralelo los conjuntos que necesitamos (volúmenes pequeños).
  const [
    pagosRes,
    leadsRes,
    eventosEstadoRes,
    settingsRes,
  ] = await Promise.all([
    admin.database.from("musa_payments")
      .select("status, monto, moneda, resolved_at, created_at, lead_phone, motivo_flag"),
    admin.database.from("musa_leads")
      .select("phone, estado_funnel, escalado_humano, opt_out, last_in_at"),
    admin.database.from("musa_funnel_events")
      .select("lead_phone, evento, detalle, created_at")
      .eq("evento", "cambio_estado"),
    admin.database.from("musa_settings")
      .select("key, value")
      .in("key", ["precio", "precio_bs_hoy", "cuentas_ve"]),
  ]);

  const pagos: Any[] = pagosRes.data ?? [];
  const leads: Any[] = leadsRes.data ?? [];
  const eventosEstado: Any[] = eventosEstadoRes.data ?? [];
  const settingsMap: Record<string, Any> = {};
  for (const r of settingsRes.data ?? []) settingsMap[r.key] = r.value;

  const precio = settingsMap["precio"] ?? { usd: 9 };
  const precioBs = settingsMap["precio_bs_hoy"] ?? {};
  const cuentasVe = settingsMap["cuentas_ve"] ?? {};

  const esHoyCaracas = (iso: string | null): boolean => {
    if (!iso) return false;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return false;
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    });
    return fmt.format(d) === hoy;
  };

  // --- pagos en cola (revisión) ---
  const enCola = pagos.filter((p) => p.status === "revision");
  let masViejoMin = 0;
  if (enCola.length) {
    const masViejo = enCola.reduce((acc, p) => {
      const t = new Date(p.created_at).getTime();
      return t < acc ? t : acc;
    }, Infinity);
    masViejoMin = Math.round((ahora - masViejo) / 60000);
  }

  // --- escalados (leads marcados) ---
  const escaladosN = leads.filter((l) => l.escalado_humano === true).length;

  // --- chats vivos hoy (last_in hoy, no opt_out) ---
  const chatsVivos = leads.filter(
    (l) => l.opt_out !== true && esHoyCaracas(l.last_in_at),
  ).length;

  // --- ventas hoy (aprobados resueltos hoy) ---
  const ventasHoy = pagos.filter(
    (p) => p.status === "aprobado" && esHoyCaracas(p.resolved_at),
  );
  const ventasHoyN = ventasHoy.length;
  // usd_aprox: cada curso = precio.usd; robusto frente a monedas/tasas.
  const usdAprox = Math.round(ventasHoyN * (Number(precio.usd) || 9) * 100) / 100;

  // --- métrica reina: DISTINCT que alcanzaron S08+ / DISTINCT que alcanzaron S06+ ---
  const maxStage: Record<string, number> = {};
  const acum = (phone: string, n: number | null) => {
    if (n == null) return;
    if (maxStage[phone] == null || n > maxStage[phone]) maxStage[phone] = n;
  };
  for (const e of eventosEstado) {
    acum(e.lead_phone, stageNum(e.detalle?.a));
  }
  for (const l of leads) acum(l.phone, stageNum(l.estado_funnel));
  let s06 = 0, s08 = 0;
  for (const phone of Object.keys(maxStage)) {
    if (maxStage[phone] >= 6) s06++;
    if (maxStage[phone] >= 8) s08++;
  }
  const metricaReina = s06 > 0 ? Math.round((s08 / s06) * 1000) / 10 : 0;

  // --- salud ---
  // tasa_fresca: precio_bs_hoy.fecha es hoy o ayer (Caracas) y tiene bs/tasa.
  let tasaFresca = false;
  {
    const fechaTasa = String(precioBs.fecha || "");
    const tieneBs = Number(precioBs.bs) > 0;
    if (fechaTasa && tieneBs) {
      const d = new Date(fechaTasa + "T12:00:00Z");
      const diffDias = (ahora - d.getTime()) / 86400000;
      tasaFresca = diffDias <= 1.6; // hoy o ayer
    }
  }
  // cuentas_ve_ok: no provisional y con datos de pago_movil o cuenta.
  const pm = cuentasVe.pago_movil ?? {};
  const cu = cuentasVe.cuenta ?? {};
  const tieneDatosVe = Boolean((pm.telefono && pm.banco) || (cu.numero));
  const cuentasVeOk = cuentasVe.provisional !== true && tieneDatosVe;
  // antifraude_ok: no hay pagos en revisión por señales de manipulación
  // esperando >60 min (el pipeline atrapó algo y quedó sin atender).
  const antifraudePend = enCola.filter((p) => {
    const motivo = String(p.motivo_flag || "");
    const esFraude = /manipulacion|ajeno|destino|monto|fraude|sospech/i.test(motivo);
    const edadMin = (ahora - new Date(p.created_at).getTime()) / 60000;
    return esFraude && edadMin > 60;
  }).length;
  const antifraudeOk = antifraudePend === 0;

  // --- reconciliación: aprobados sin evento entrega_realizada ---
  const entregados = new Set<string>();
  {
    const { data: ev } = await admin.database.from("musa_funnel_events")
      .select("lead_phone").eq("evento", "entrega_realizada");
    for (const r of ev ?? []) entregados.add(r.lead_phone);
  }
  const aprobados = pagos.filter((p) => p.status === "aprobado");
  const reconciliacion = aprobados.filter(
    (p) => !entregados.has(p.lead_phone),
  ).length;

  return json({
    pagos_en_cola: { n: enCola.length, mas_viejo_min: masViejoMin },
    escalados: { n: escaladosN },
    chats_vivos: { n: chatsVivos },
    ventas_hoy: { n: ventasHoyN, usd_aprox: usdAprox },
    metrica_reina_pct: metricaReina,
    salud: {
      tasa_fresca: tasaFresca,
      cuentas_ve_ok: cuentasVeOk,
      antifraude_ok: antifraudeOk,
    },
    reconciliacion_aprobado_sin_entregar: reconciliacion,
    _tz: TZ,
    _hoy: hoy,
  });
}

// ============================== view=pagos ==============================

/** Descarga el comprobante y lo devuelve como data:URL base64 (o null). */
async function imagenComoData(
  admin: Any,
  storageKey: string | null,
): Promise<string | null> {
  if (!storageKey) return null;
  try {
    // Caso A: storage_key es una URL vieja de Twilio -> Basic auth Twilio.
    if (/^https?:\/\//i.test(storageKey)) {
      if (/api\.twilio\.com/i.test(storageKey)) {
        const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const tok = Deno.env.get("TWILIO_AUTH_TOKEN");
        const headers: Record<string, string> = {};
        if (sid && tok) headers["Authorization"] = "Basic " + btoa(`${sid}:${tok}`);
        const r = await fetch(storageKey, { headers });
        if (!r.ok) return null;
        const ct = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
        const buf = await r.arrayBuffer();
        return `data:${ct};base64,${bytesABase64(buf)}`;
      }
      // Otra URL http directa (modo prueba): fetch directo.
      const r = await fetch(storageKey);
      if (!r.ok) return null;
      const ct = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
      const buf = await r.arrayBuffer();
      return `data:${ct};base64,${bytesABase64(buf)}`;
    }
    // Caso B: key del bucket privado musa-capturas -> SDK admin download.
    const { data: blob, error } = await admin.storage
      .from(BUCKET_CAPTURAS)
      .download(storageKey);
    if (error || !blob) return null;
    const buf = await blob.arrayBuffer();
    const ct = (blob.type || "image/jpeg").split(";")[0] || "image/jpeg";
    return `data:${ct};base64,${bytesABase64(buf)}`;
  } catch (_e) {
    return null;
  }
}

function bytesABase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function precioEsperado(moneda: string | null, precio: Any, precioBs: Any): number | null {
  const m = (moneda || "").toUpperCase();
  if (m === "USD") return Number(precio?.usd) || null;
  if (m === "COP") return Number(precio?.cop) || null;
  if (m === "VES" || m === "BS") return Number(precioBs?.bs) || null;
  return null;
}

function resumenDatos(d: Any): Any {
  if (!d || typeof d !== "object") return null;
  return {
    metodo: d.metodo ?? null,
    monto: d.monto ?? null,
    moneda: d.moneda ?? null,
    numero_referencia: d.numero_referencia ?? null,
    destino: d.destino ?? null,
    banco_o_app: d.banco_o_app ?? null,
    estado_operacion: d.estado_operacion ?? null,
    fecha: d.fecha ?? null,
    es_captura_completa: d.es_captura_completa ?? null,
    senales_manipulacion: Array.isArray(d.senales_manipulacion) ? d.senales_manipulacion : [],
  };
}

async function vistaPagos(admin: Any): Promise<Response> {
  const ahora = Date.now();
  const hoy = caracasHoyISO();

  const [revisionRes, settingsRes, leadsRes] = await Promise.all([
    admin.database.from("musa_payments")
      .select("*").eq("status", "revision").order("created_at", { ascending: true }),
    admin.database.from("musa_settings")
      .select("key, value").in("key", ["precio", "precio_bs_hoy"]),
    admin.database.from("musa_leads").select("phone, nombre, profile_name"),
  ]);

  const settingsMap: Record<string, Any> = {};
  for (const r of settingsRes.data ?? []) settingsMap[r.key] = r.value;
  const precio = settingsMap["precio"] ?? {};
  const precioBs = settingsMap["precio_bs_hoy"] ?? {};

  const leadMap: Record<string, Any> = {};
  for (const l of leadsRes.data ?? []) leadMap[l.phone] = l;

  const revision: Any[] = revisionRes.data ?? [];
  const lista = [];
  for (const p of revision) {
    const d = p.datos_extraidos ?? {};
    const lead = leadMap[p.lead_phone] ?? {};
    const moneda = p.moneda ?? d.moneda ?? null;
    const imagen = await imagenComoData(admin, p.storage_key ?? null);
    lista.push({
      short_id: p.short_id,
      lead: {
        nombre: lead.nombre ?? lead.profile_name ?? null,
        phone: enmascararTel(p.lead_phone),
      },
      metodo: p.metodo ?? d.metodo ?? null,
      monto: p.monto != null ? Number(p.monto) : (d.monto ?? null),
      moneda,
      precio_esperado: precioEsperado(moneda, precio, precioBs),
      motivo_flag: p.motivo_flag ?? null,
      datos_extraidos: resumenDatos(d),
      antiguedad_min: Math.round((ahora - new Date(p.created_at).getTime()) / 60000),
      imagen,
    });
  }

  // resueltos_hoy: últimos 10 aprobados/rechazados resueltos hoy.
  const { data: resueltosRaw } = await admin.database.from("musa_payments")
    .select("short_id, lead_phone, status, monto, moneda, motivo_flag, resolved_at")
    .in("status", ["aprobado", "rechazado"])
    .order("resolved_at", { ascending: false })
    .limit(40);
  const resueltosHoy = (resueltosRaw ?? [])
    .filter((p: Any) => {
      if (!p.resolved_at) return false;
      const d = new Date(p.resolved_at);
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      });
      return fmt.format(d) === hoy;
    })
    .slice(0, 10)
    .map((p: Any) => ({
      short_id: p.short_id,
      lead_phone: enmascararTel(p.lead_phone),
      status: p.status,
      monto: p.monto != null ? Number(p.monto) : null,
      moneda: p.moneda ?? null,
      motivo_flag: p.motivo_flag ?? null,
      resolved_at: p.resolved_at,
    }));

  return json({ pagos: lista, resueltos_hoy: resueltosHoy, _tz: TZ, _hoy: hoy });
}

// ============================== handler ==============================

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Guard de auth PRIMERO: cualquier request sin token válido del dueño -> 401/403.
  const guard = await exigirDueno(req);
  if (guard.error) return guard.error;

  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const admin = adminClient();
  const url = new URL(req.url);
  const view = (url.searchParams.get("view") || "inicio").toLowerCase();

  try {
    if (view === "pagos") return await vistaPagos(admin);
    return await vistaInicio(admin);
  } catch (e) {
    console.error("musa-admin-data error", String(e).slice(0, 300));
    return json({ error: "error_interno", detalle: String(e).slice(0, 200) }, 500);
  }
}
