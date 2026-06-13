// musa-admin-data — Edge function ADMIN (solo el dueño).
// GET ?view=inicio         -> KPIs del tablero (hoy en America/Caracas).
// GET ?view=pagos          -> cola de revisión + resueltos_hoy, con imagen como data:base64.
//                             AÑADE numeros_detectados + coincidencia vs nuestras cuentas.
// GET ?view=conversaciones -> leads activos (48h) con etiqueta humana, a quién le toca y flags.
// GET ?view=conversacion&phone=<phone> -> hilo completo + timeline de eventos.
// GET ?view=analitica      -> embudo (máx estado), finanzas (costos medidos/estimados), riesgo.
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

function soloDigitos(s: unknown): string {
  return String(s ?? "").replace(/\D+/g, "");
}

/** Etiqueta humana de un estado_funnel para el operador. */
function etiquetaEstado(estado: string | null | undefined): string {
  const s = String(estado || "").toUpperCase();
  if (s.startsWith("S04")) return "confirmando edad";
  if (s.startsWith("S06")) return "en cierre";
  if (s.startsWith("S07") || s.startsWith("S08")) return "esperando pago/captura";
  if (s.startsWith("S09")) return "pago en revisión";
  if (s.startsWith("S10") || s.startsWith("S11")) return "ya compró";
  if (s.startsWith("S00")) return "llegada";
  if (s.startsWith("S01") || s.startsWith("S02") || s.startsWith("S03")) return "saludo/avatar";
  if (s.startsWith("S05")) return "interés";
  return estado ? String(estado) : "sin estado";
}

/** Recorta un texto largo para vistas de lista. */
function recortar(s: string | null | undefined, n = 90): string | null {
  if (s == null) return null;
  const t = String(s).replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + "…";
}

/** "hace X" relativo humano a partir de un ISO (o null). */
function haceCuanto(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

// Precios por 1M de tokens (USD). gpt-5.4-mini: 0.75 in / 4.50 out.
const PRECIO_MODELO: Record<string, { in: number; out: number }> = {
  "gpt-5.4-mini": { in: 0.75, out: 4.5 },
  "gpt-5-mini": { in: 0.75, out: 4.5 },
};
const PRECIO_MODELO_DEFAULT = { in: 0.75, out: 4.5 };
// gpt-4o-mini-transcribe ~ $0.003/min (estimado). Sin duración, usamos tokens audio.
const COSTO_TRANSCRIBE_POR_MIN = 0.003;

/** Normaliza el nombre del modelo a una clave de PRECIO_MODELO. */
function claveModelo(model: unknown): string {
  const m = String(model || "").toLowerCase();
  if (m.includes("5.4-mini") || m.includes("5-4-mini")) return "gpt-5.4-mini";
  if (m.includes("5-mini")) return "gpt-5-mini";
  return "default";
}

/** Costo USD de un objeto usage de chat (prompt/completion tokens). */
function costoUsageChat(usage: Any, model: unknown): number {
  if (!usage || typeof usage !== "object") return 0;
  const inTok = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0;
  const outTok = Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0;
  const k = claveModelo(model);
  const p = PRECIO_MODELO[k] ?? PRECIO_MODELO_DEFAULT;
  return (inTok / 1e6) * p.in + (outTok / 1e6) * p.out;
}

/** Costo USD de una transcripción. Estimado por minutos si hay duración;
 *  si solo hay tokens de audio, los valora como input del modelo de chat. */
function costoUsageTranscribe(usage: Any): number {
  if (!usage || typeof usage !== "object") return 0;
  const segundos = Number(usage.seconds ?? usage.duration ?? 0) || 0;
  if (segundos > 0) return (segundos / 60) * COSTO_TRANSCRIBE_POR_MIN;
  // Fallback: gpt-4o-mini-transcribe reporta input_tokens (texto+audio).
  const inTok = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0;
  // Valuación conservadora a la tarifa input del mini (~$0.75/1M aprox.).
  return (inTok / 1e6) * PRECIO_MODELO_DEFAULT.in;
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

/** Reúne los dígitos de TODAS nuestras cuentas (VE+CO) para detectar coincidencias.
 *  Devuelve un Set de strings de dígitos (cada número de cuenta/teléfono/llave). */
function digitosNuestrasCuentas(cuentasVe: Any, cuentasCo: Any): Set<string> {
  const set = new Set<string>();
  const add = (v: unknown) => {
    const d = soloDigitos(v);
    if (d.length >= 4) set.add(d);
  };
  const ve = cuentasVe ?? {};
  add(ve?.pago_movil?.telefono);
  add(ve?.cuenta?.numero);
  const co = cuentasCo ?? {};
  add(co?.nequi?.numero);
  add(co?.bancolombia?.numero);
  add(co?.breb?.llave);
  return set;
}

/** Compara los numeros_detectados (normalizados) contra nuestras cuentas.
 *  coincide=true si algún número detectado contiene/coincide con uno nuestro. */
function calcularCoincidencia(
  numerosDetectados: unknown,
  nuestras: Set<string>,
): { coincide: boolean; numero: string | null } {
  const arr = Array.isArray(numerosDetectados) ? numerosDetectados : [];
  for (const raw of arr) {
    const d = soloDigitos(raw);
    if (d.length < 4) continue;
    for (const mio of nuestras) {
      // coincide si uno contiene al otro (capturas a veces truncan o prefijan).
      if (d === mio || d.includes(mio) || mio.includes(d)) {
        return { coincide: true, numero: mio };
      }
    }
  }
  return { coincide: false, numero: null };
}

async function vistaPagos(admin: Any): Promise<Response> {
  const ahora = Date.now();
  const hoy = caracasHoyISO();

  const [revisionRes, settingsRes, leadsRes] = await Promise.all([
    admin.database.from("musa_payments")
      .select("*").eq("status", "revision").order("created_at", { ascending: true }),
    admin.database.from("musa_settings")
      .select("key, value").in("key", ["precio", "precio_bs_hoy", "cuentas_ve", "cuentas_co"]),
    admin.database.from("musa_leads").select("phone, nombre, profile_name"),
  ]);

  const settingsMap: Record<string, Any> = {};
  for (const r of settingsRes.data ?? []) settingsMap[r.key] = r.value;
  const precio = settingsMap["precio"] ?? {};
  const precioBs = settingsMap["precio_bs_hoy"] ?? {};
  const nuestrasCuentas = digitosNuestrasCuentas(
    settingsMap["cuentas_ve"], settingsMap["cuentas_co"],
  );

  const leadMap: Record<string, Any> = {};
  for (const l of leadsRes.data ?? []) leadMap[l.phone] = l;

  const revision: Any[] = revisionRes.data ?? [];
  const lista = [];
  for (const p of revision) {
    const d = p.datos_extraidos ?? {};
    const lead = leadMap[p.lead_phone] ?? {};
    const moneda = p.moneda ?? d.moneda ?? null;
    const imagen = await imagenComoData(admin, p.storage_key ?? null);
    const numerosDetectados = Array.isArray(d.numeros_detectados) ? d.numeros_detectados : [];
    const coincidencia = calcularCoincidencia(numerosDetectados, nuestrasCuentas);
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
      numeros_detectados: numerosDetectados,
      coincidencia,
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

// ============================== view=conversaciones ==============================

async function vistaConversaciones(admin: Any): Promise<Response> {
  const ahora = Date.now();
  const limite48h = new Date(ahora - 48 * 3600 * 1000).toISOString();

  // Activos: últimas 48h por updated_at. Si hay pocos (<5), traemos los más
  // recientes igual para no dejar el panel vacío.
  const { data: recientes } = await admin.database.from("musa_leads")
    .select("phone, nombre, profile_name, pais, estado_funnel, escalado_humano, opt_out, pagado, last_in_at, last_out_at, updated_at")
    .gte("updated_at", limite48h)
    .order("updated_at", { ascending: false })
    .limit(200);

  let leads: Any[] = recientes ?? [];
  if (leads.length < 5) {
    const { data: top } = await admin.database.from("musa_leads")
      .select("phone, nombre, profile_name, pais, estado_funnel, escalado_humano, opt_out, pagado, last_in_at, last_out_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);
    leads = top ?? leads;
  }

  // Último mensaje por lead: traemos los mensajes recientes y nos quedamos con el
  // primero (más nuevo) de cada lead.
  const phones = leads.map((l) => l.phone);
  const ultimoMsg: Record<string, Any> = {};
  if (phones.length) {
    const { data: msgs } = await admin.database.from("musa_messages")
      .select("lead_phone, direction, body, media_type, created_at")
      .in("lead_phone", phones)
      .order("id", { ascending: false })
      .limit(600);
    for (const m of msgs ?? []) {
      if (!ultimoMsg[m.lead_phone]) ultimoMsg[m.lead_phone] = m;
    }
  }

  const lista = leads.map((l) => {
    const um = ultimoMsg[l.phone];
    const inT = l.last_in_at ? new Date(l.last_in_at).getTime() : 0;
    const outT = l.last_out_at ? new Date(l.last_out_at).getTime() : 0;
    const leToca = inT > outT ? "lead" : "musa";
    let textoUltimo: string | null = null;
    if (um) {
      textoUltimo = um.body && um.body.trim()
        ? recortar(um.body, 90)
        : (um.media_type ? `[${um.media_type}]` : null);
    }
    return {
      phone: enmascararTel(l.phone),
      phone_raw: l.phone, // necesario para abrir el hilo / acciones
      nombre: l.nombre ?? l.profile_name ?? null,
      pais: l.pais ?? null,
      estado_funnel: l.estado_funnel ?? null,
      etiqueta: etiquetaEstado(l.estado_funnel),
      le_toca: leToca,
      flags: {
        escalado_humano: l.escalado_humano === true,
        opt_out: l.opt_out === true,
        pagado: l.pagado === true,
      },
      ultimo_mensaje: um
        ? { texto: textoUltimo, direction: um.direction, cuando: haceCuanto(um.created_at), created_at: um.created_at }
        : null,
      updated_at: l.updated_at,
    };
  });

  return json({ conversaciones: lista, total: lista.length, _tz: TZ });
}

// ============================== view=conversacion ==============================

const EVENTOS_TIMELINE = new Set<string>([
  "cambio_estado", "objecion", "comprobante_vision", "nota_voz_transcrita",
  "pago_aprobado_auto", "pago_aprobado_manual", "entrega_realizada", "optout",
  "escalado", "circuit_breaker", "firma_invalida", "respuesta_manual_operador",
  "control_humano_tomado", "control_humano_devuelto", "comando_operador",
  "operador_notificado",
]);

async function vistaConversacion(admin: Any, phone: string): Promise<Response> {
  if (!/^\+\d{6,15}$/.test(phone)) {
    return json({ error: "phone_invalido" }, 400);
  }

  const [leadRes, msgsRes, evRes] = await Promise.all([
    admin.database.from("musa_leads")
      .select("phone, nombre, profile_name, pais, estado_funnel, mayor_18, escalado_humano, opt_out, pagado, last_in_at, last_out_at, created_at")
      .eq("phone", phone).maybeSingle(),
    admin.database.from("musa_messages")
      .select("id, direction, body, media_type, media_url, created_at")
      .eq("lead_phone", phone)
      .order("id", { ascending: true })
      .limit(500),
    admin.database.from("musa_funnel_events")
      .select("evento, detalle, created_at")
      .eq("lead_phone", phone)
      .order("created_at", { ascending: true })
      .limit(300),
  ]);

  const lead = leadRes.data;
  if (!lead) return json({ error: "lead_no_encontrado", phone }, 404);

  const mensajes = (msgsRes.data ?? []).map((m: Any) => ({
    id: m.id,
    direction: m.direction,
    body: m.body ?? null,
    media_type: m.media_type ?? null,
    tiene_media: !!m.media_url,
    created_at: m.created_at,
  }));

  const timeline = (evRes.data ?? [])
    .filter((e: Any) => EVENTOS_TIMELINE.has(e.evento))
    .map((e: Any) => {
      const d = e.detalle ?? {};
      let resumen: string | null = null;
      if (e.evento === "cambio_estado") resumen = `${d.de ?? "?"} → ${d.a ?? "?"}`;
      else if (e.evento === "objecion") resumen = d.tipo ?? d.motivo ?? null;
      else if (e.evento === "escalado") resumen = d.motivo ?? null;
      else if (e.evento === "comando_operador") resumen = d.comando ?? d.body ?? null;
      return {
        evento: e.evento,
        resumen,
        cuando: haceCuanto(e.created_at),
        created_at: e.created_at,
      };
    });

  const inT = lead.last_in_at ? new Date(lead.last_in_at).getTime() : 0;
  const outT = lead.last_out_at ? new Date(lead.last_out_at).getTime() : 0;

  return json({
    lead: {
      phone: enmascararTel(lead.phone),
      phone_raw: lead.phone,
      nombre: lead.nombre ?? lead.profile_name ?? null,
      pais: lead.pais ?? null,
      estado_funnel: lead.estado_funnel ?? null,
      etiqueta: etiquetaEstado(lead.estado_funnel),
      mayor_18: lead.mayor_18 === true,
      le_toca: inT > outT ? "lead" : "musa",
      flags: {
        escalado_humano: lead.escalado_humano === true,
        opt_out: lead.opt_out === true,
        pagado: lead.pagado === true,
      },
      created_at: lead.created_at,
    },
    mensajes,
    timeline,
    _tz: TZ,
  });
}

// ============================== view=analitica ==============================

async function vistaAnalitica(admin: Any): Promise<Response> {
  const ahora = Date.now();
  const hoy = caracasHoyISO();
  const limite14d = new Date(ahora - 14 * 86400 * 1000).toISOString();

  const [leadsRes, eventosEstadoRes, eventosUsageRes, pagosRes, settingsRes, optoutRes, cbRes, entregaRes, msgsOutRes] =
    await Promise.all([
      admin.database.from("musa_leads").select("phone, estado_funnel"),
      admin.database.from("musa_funnel_events")
        .select("lead_phone, detalle").eq("evento", "cambio_estado"),
      admin.database.from("musa_funnel_events")
        .select("evento, detalle")
        .in("evento", ["fallback_gpt", "comprobante_vision", "nota_voz_transcrita"]),
      admin.database.from("musa_payments")
        .select("short_id, status, monto, moneda, resolved_at, lead_phone, image_phash"),
      admin.database.from("musa_settings").select("key, value").in("key", ["precio", "precio_bs_hoy"]),
      admin.database.from("musa_funnel_events").select("id").eq("evento", "optout"),
      admin.database.from("musa_funnel_events").select("id").eq("evento", "circuit_breaker"),
      admin.database.from("musa_funnel_events").select("lead_phone").eq("evento", "entrega_realizada"),
      admin.database.from("musa_messages")
        .select("lead_phone, created_at").eq("direction", "out"),
    ]);

  const leads: Any[] = leadsRes.data ?? [];
  const eventosEstado: Any[] = eventosEstadoRes.data ?? [];
  const eventosUsage: Any[] = eventosUsageRes.data ?? [];
  const pagos: Any[] = pagosRes.data ?? [];
  const msgsOut: Any[] = msgsOutRes.data ?? [];

  const settingsMap: Record<string, Any> = {};
  for (const r of settingsRes.data ?? []) settingsMap[r.key] = r.value;
  const precio = settingsMap["precio"] ?? { usd: 9 };

  // ---- EMBUDO: por MÁXIMO estado alcanzado (leads únicos). ----
  const maxStage: Record<string, number> = {};
  const acum = (phone: string, n: number | null) => {
    if (n == null || !phone) return;
    if (maxStage[phone] == null || n > maxStage[phone]) maxStage[phone] = n;
  };
  for (const e of eventosEstado) acum(e.lead_phone, stageNum(e.detalle?.a));
  for (const l of leads) acum(l.phone, stageNum(l.estado_funnel));

  // Umbrales de etapa para los hitos del embudo.
  const cont = (min: number) =>
    Object.values(maxStage).filter((n) => n >= min).length;
  const embudoNiveles = [
    { clave: "saludo", label: "saludo (S01+)", min: 1, n: cont(1) },
    { clave: "avatar", label: "avatar (S03+)", min: 3, n: cont(3) },
    { clave: "gate", label: "gate 18 (S04+)", min: 4, n: cont(4) },
    { clave: "precio", label: "precio/cierre (S06+)", min: 6, n: cont(6) },
    { clave: "pago", label: "pago/captura (S08+)", min: 8, n: cont(8) },
    { clave: "entrega", label: "entrega (S10+)", min: 10, n: cont(10) },
  ];
  // Mayor fuga: caída absoluta más grande entre niveles consecutivos.
  let mayorFuga: Any = null;
  for (let i = 1; i < embudoNiveles.length; i++) {
    const de = embudoNiveles[i - 1];
    const a = embudoNiveles[i];
    const caen = de.n - a.n;
    if (mayorFuga == null || caen > mayorFuga.pierden) {
      mayorFuga = {
        de: de.clave, a: a.clave, pierden: caen,
        pct: de.n > 0 ? Math.round((caen / de.n) * 1000) / 10 : 0,
      };
    }
  }

  // ---- FINANZAS ----
  const esHoyCaracas = (iso: string | null): boolean => {
    if (!iso) return false;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return false;
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    });
    return fmt.format(d) === hoy;
  };

  const aprobados = pagos.filter((p) => p.status === "aprobado");
  const ventasN = aprobados.length;

  const sumarPorMoneda = (filas: Any[]): Record<string, number> => {
    const acc: Record<string, number> = {};
    for (const p of filas) {
      const m = String(p.moneda || "USD").toUpperCase();
      const v = Number(p.monto) || 0;
      acc[m] = Math.round(((acc[m] || 0) + v) * 100) / 100;
    }
    return acc;
  };

  const ingresosHoy = sumarPorMoneda(
    aprobados.filter((p) => esHoyCaracas(p.resolved_at)),
  );
  const ingresos14d = sumarPorMoneda(
    aprobados.filter((p) => p.resolved_at && p.resolved_at >= limite14d),
  );

  // Costo OpenAI MEDIDO de funnel_events.detalle.usage.
  let costoOpenai = 0;
  for (const e of eventosUsage) {
    const d = e.detalle ?? {};
    const usage = d.usage ?? null;
    if (!usage) continue;
    if (e.evento === "nota_voz_transcrita") costoOpenai += costoUsageTranscribe(usage);
    else costoOpenai += costoUsageChat(usage, d.modelo);
  }
  costoOpenai = Math.round(costoOpenai * 10000) / 10000;

  // Costo Twilio ESTIMADO: mensajes out a phone NO +9999 × $0.005.
  const msgsTwilio = msgsOut.filter((m) => !String(m.lead_phone).startsWith("+9999")).length;
  const costoTwilio = Math.round(msgsTwilio * 0.005 * 100) / 100;

  // Margen ESTIMADO: ingresos USD aprox (ventas × precio.usd) − costos USD.
  const ingresoUsdAprox = Math.round(ventasN * (Number(precio.usd) || 9) * 100) / 100;
  const margenEstimado = Math.round((ingresoUsdAprox - costoOpenai - costoTwilio) * 100) / 100;

  // ---- RIESGO ----
  // duplicados_phash: grupos image_phash con >1 pago de leads DISTINTOS.
  const porPhash: Record<string, Set<string>> = {};
  for (const p of pagos) {
    const ph = String(p.image_phash || "").trim();
    if (!ph) continue;
    (porPhash[ph] ??= new Set()).add(p.lead_phone);
  }
  const duplicadosPhash = Object.entries(porPhash)
    .filter(([, leadsSet]) => leadsSet.size > 1)
    .map(([ph, leadsSet]) => ({ phash: ph.slice(0, 12), leads_distintos: leadsSet.size }));

  const entregados = new Set<string>();
  for (const r of entregaRes.data ?? []) entregados.add(r.lead_phone);
  const reconciliacion = aprobados.filter((p) => !entregados.has(p.lead_phone)).length;

  return json({
    embudo: {
      niveles: embudoNiveles.map((n) => ({ clave: n.clave, label: n.label, n: n.n })),
      mayor_fuga: mayorFuga,
    },
    finanzas: {
      ingresos_hoy: ingresosHoy,
      ingresos_14d: ingresos14d,
      ventas_n: ventasN,
      costo_openai_medido_usd: costoOpenai,
      costo_twilio_estimado_usd: costoTwilio,
      ingreso_usd_aprox: ingresoUsdAprox,
      margen_estimado_usd: margenEstimado,
      _nota: "costo_twilio, ingreso_usd_aprox y margen son ESTIMADOS; costo_openai es medido por tokens registrados.",
    },
    riesgo: {
      duplicados_phash: duplicadosPhash,
      optouts_total: (optoutRes.data ?? []).length,
      circuit_breaker_eventos: (cbRes.data ?? []).length,
      reconciliacion_aprobado_sin_entregar: reconciliacion,
    },
    _tz: TZ,
    _hoy: hoy,
  });
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
    if (view === "conversaciones") return await vistaConversaciones(admin);
    if (view === "conversacion") {
      const phone = (url.searchParams.get("phone") || "").trim();
      return await vistaConversacion(admin, phone);
    }
    if (view === "analitica") return await vistaAnalitica(admin);
    return await vistaInicio(admin);
  } catch (e) {
    console.error("musa-admin-data error", String(e).slice(0, 300));
    return json({ error: "error_interno", detalle: String(e).slice(0, 200) }, 500);
  }
}
