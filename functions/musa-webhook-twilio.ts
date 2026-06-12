// musa-webhook-twilio — Fase 2: motor de ventas de Musa.
// Recibe mensajes WhatsApp (Twilio), persiste lead/mensaje/evento, ejecuta la
// máquina de estados del funnel y responde vía Twilio REST (no por TwiML).
// El copy vive en musa_settings.funnel_copy; el system prompt GPT en musa_settings.gpt_system.
import { createAdminClient } from "npm:@insforge/sdk";

// ============================== utilidades base ==============================

function emptyTwiml(): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { status: 200, headers: { "Content-Type": "text/xml" } },
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** minúsculas, sin acentos, sin espacios extremos */
function normalizar(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** 7400 -> "7.400" */
function formatMiles(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** quita prefijos de guion tipo "[SI RESPONDE OTRO PAÍS] " */
function sinPrefijo(t: string): string {
  return (t || "").replace(/^\[[^\]]*\]\s*/, "");
}

/** limpia tokens de fases futuras que no deben llegar al cliente */
function limpiarTokens(t: string): string {
  return (t || "")
    .replace(
      /\s*Y mira, te dejo una muestra real de lo que hay adentro 👇 \[PROMPT_MUESTRA\] Pruébalo tú mismo\.\s*/g,
      " ",
    )
    .replace(/\[(VIDEO_AVATAR[^\]]*|PROMPT_MUESTRA|ENTREGA_LINKS:[^\]]*)\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const PALABRAS_NEGOCIO =
  /(venta|shop|store|tienda|negocio|inversion|oficial|marketing|online|grupo|empresa|publicidad|agencia|import|export|cursos|modelos|servicio|disponible|whatsapp)/i;

/** nombre de pila usable a partir de lead.nombre o profile_name */
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

// ============================== tipos ==============================

type Lead = {
  phone: string;
  profile_name: string | null;
  nombre: string | null;
  pais: string | null;
  estado_funnel: string;
  mayor_18: boolean | null;
  opt_out: boolean;
  escalado_humano: boolean;
  last_in_at: string | null;
  ctwa_clid?: string | null;
  source_id?: string | null;
  [k: string]: unknown;
};

type Cfg = {
  funnelCopy: Record<string, unknown> & {
    etapas: Array<{ id: string; mensajes: string[]; ramas?: Record<string, { sin_video?: string }> }>;
    objeciones: Array<{ objecion: string; respuesta: string }>;
  };
  gptSystem: { prompt: string };
  precio: { usd: number; cop: number };
  precioBsHoy: { bs: number };
  cuentasVe: Record<string, Record<string, string>>;
  cuentasCo: Record<string, Record<string, string>>;
  marca: { asesora?: string; firma?: string };
  entrega: { link_grupo?: string };
  horario: { tz?: string; inicio?: number; fin?: number };
  modelos: { conversacion?: string; clasificador?: string };
};

// deno-lint-ignore no-explicit-any
type Admin = any;

// ============================== configuración ==============================

async function cargarSettings(admin: Admin): Promise<Cfg> {
  const claves = [
    "funnel_copy",
    "gpt_system",
    "precio",
    "precio_bs_hoy",
    "cuentas_ve",
    "cuentas_co",
    "marca",
    "entrega",
    "horario_verificacion",
    "modelos",
  ];
  const { data, error } = await admin.database
    .from("musa_settings")
    .select("key, value")
    .in("key", claves);
  if (error) throw new Error("settings: " + JSON.stringify(error));
  const map: Record<string, unknown> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return {
    funnelCopy: map["funnel_copy"] as Cfg["funnelCopy"],
    gptSystem: (map["gpt_system"] ?? { prompt: "" }) as Cfg["gptSystem"],
    precio: (map["precio"] ?? { usd: 9, cop: 33000 }) as Cfg["precio"],
    precioBsHoy: (map["precio_bs_hoy"] ?? { bs: 7400 }) as Cfg["precioBsHoy"],
    cuentasVe: (map["cuentas_ve"] ?? {}) as Cfg["cuentasVe"],
    cuentasCo: (map["cuentas_co"] ?? {}) as Cfg["cuentasCo"],
    marca: (map["marca"] ?? {}) as Cfg["marca"],
    entrega: (map["entrega"] ?? {}) as Cfg["entrega"],
    horario: (map["horario_verificacion"] ?? { inicio: 8, fin: 22 }) as Cfg["horario"],
    modelos: (map["modelos"] ?? {}) as Cfg["modelos"],
  };
}

function etapa(cfg: Cfg, id: string) {
  const e = (cfg.funnelCopy?.etapas ?? []).find((x) => x.id === id);
  if (!e) throw new Error("funnel_copy sin etapa " + id);
  return e;
}

function bloqueCuentasVE(cfg: Cfg): string {
  const pm = cfg.cuentasVe?.pago_movil ?? {};
  const cu = cfg.cuentasVe?.cuenta ?? {};
  return [
    "📲 *Pago Móvil*",
    `Banco: ${pm.banco ?? ""}`,
    `Teléfono: ${pm.telefono ?? ""}`,
    `Cédula: ${pm.cedula ?? ""}`,
    `Titular: ${pm.titular ?? ""}`,
    "",
    "🏦 *Transferencia (Banco de Venezuela)*",
    `Cuenta ${cu.tipo ?? ""}: ${cu.numero ?? ""}`,
    `Cédula: ${cu.cedula ?? ""}`,
    `Titular: ${cu.titular ?? ""}`,
  ].join("\n");
}

function bloqueCuentasCO(cfg: Cfg): string {
  const c = cfg.cuentasCo ?? {};
  return [
    `📲 *Nequi*: ${c.nequi?.numero ?? ""}`,
    `🏦 *Bancolombia* (${c.bancolombia?.tipo ?? "ahorros"}): ${c.bancolombia?.numero ?? ""} — Titular: ${c.bancolombia?.titular ?? ""}`,
    `🔑 *Llave Bre-B*: ${c.breb?.llave ?? ""}`,
  ].join("\n");
}

function resolverPlaceholders(texto: string, lead: Lead, cfg: Cfg): string {
  let t = texto ?? "";
  const nombre = nombreUsable(lead);
  if (nombre) {
    t = t.replace(/\{\{nombre\}\}/g, nombre);
  } else {
    // sin nombre usable: quitar la coma y el nombre con gracia
    t = t
      .replace(/,\s*\{\{nombre\}\}/g, "")
      .replace(/\{\{nombre\}\},\s*/g, "")
      .replace(/\s*\{\{nombre\}\}\s*/g, " ");
  }
  t = t
    .replace(/\{\{precio_bs\}\}/g, formatMiles(Number(cfg.precioBsHoy?.bs ?? 7400)))
    .replace(/\{\{precio_cop\}\}/g, formatMiles(Number(cfg.precio?.cop ?? 33000)))
    .replace(/\{\{cuentas_venezuela\}\}/g, bloqueCuentasVE(cfg))
    .replace(/\{\{cuentas_colombia\}\}/g, bloqueCuentasCO(cfg))
    .replace(/\{\{link_grupo\}\}/g, cfg.entrega?.link_grupo ?? "");
  return limpiarTokens(t).replace(/ {2,}/g, " ");
}

/** filtra líneas [VE]/[CO] según el país del lead; OTRO elimina ambas */
function filtrarLineasPais(texto: string, pais: string | null): string {
  const lineas = (texto ?? "").split("\n").map((l) => {
    if (l.startsWith("[VE]")) return pais === "VE" ? l.slice(4).trim() : null;
    if (l.startsWith("[CO]")) return pais === "CO" ? l.slice(4).trim() : null;
    return l;
  }).filter((l) => l !== null) as string[];
  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ============================== heurísticas ==============================

function esStopTotal(norm: string): boolean {
  const limpio = norm.replace(/[^a-z]/g, "");
  return limpio === "stop" || limpio === "salir";
}

function preguntaPorBot(norm: string): boolean {
  return /\b(eres|sos|seras|sera que eres)\b.{0,30}\b(bot|robot|maquina|ia|inteligencia artificial|humana?|persona real|de verdad)\b/.test(norm) ||
    /\bun bot\b.{0,5}\?/.test(norm) ||
    /\b(bot|robot) o (persona|humana?)\b/.test(norm);
}

function pideHumano(norm: string): boolean {
  return /\b(humano|asesor(a|es)?|agente)\b/.test(norm) ||
    /(hablar|comunicar|atienda|pasame|quiero)\s+(con\s+)?(una?\s+)?persona/.test(norm) ||
    /persona\s+real/.test(norm);
}

function preguntaPrecio(norm: string): boolean {
  return /(cuanto (cuesta|vale|es|sale)|precio|costo|valor|que vale|cuanto hay que pagar)/.test(norm);
}

function detectarPaisHeuristico(norm: string, original: string): string | null {
  // Abreviaturas y variantes como PALABRA exacta (\b), nunca como subcadena:
  // "col" no debe dispararse dentro de "escolar" ni "ven" dentro de "vender".
  const ve = /venez|vzla|vnzla|🇻🇪/.test(norm) || /🇻🇪/.test(original) ||
    /\b(ven|vene|vzla|vnzla|venezuela)\b/.test(norm) || norm === "ve";
  const co = /colomb|🇨🇴/.test(norm) || /🇨🇴/.test(original) ||
    /\b(col|colombia)\b/.test(norm) || norm === "co";
  if (ve && !co) return "VE";
  if (co && !ve) return "CO";
  return null;
}

/** S04: devuelve "mayor" | "menor" | null (ambiguo) */
function clasificarEdadHeuristico(norm: string): string | null {
  if (/(soy menor|menor de edad|no tengo 18|no soy mayor|aun no (cumplo|tengo|los)|todavia no (cumplo|tengo|los))/.test(norm)) {
    return "menor";
  }
  const num = norm.match(/\b(\d{1,2})\b/);
  if (num) {
    const n = parseInt(num[1], 10);
    if (n >= 10 && n <= 17) return "menor";
    if (n >= 18 && n <= 99) return "mayor";
  }
  if (/^(no|nop|nel)\b/.test(norm)) return "menor";
  if (
    /^(si+|sip|claro|por supuesto|obvio|asi es|correcto|confirmo|afirmativo|yes|dale)\b/.test(norm) ||
    /(soy mayor|mayor de edad|tengo mas de 18|ya los (tengo|cumpli)|si tengo|si los tengo|si soy mayor)/.test(norm)
  ) return "mayor";
  return null;
}

function esAfirmativoCierre(norm: string): boolean {
  return /^(si+|sip|dale|de una|ok|okey|okay|va|vale|listo|claro|perfecto|por supuesto|obvio|bueno|hagamoslo|quiero|me animo|empecemos|comencemos|arranquemos)\b/.test(norm) ||
    /(como pago|donde pago|los datos|datos de pago|pasame|quiero pagar|quiero empezar|quiero comprar|si quiero|paso los datos)/.test(norm);
}

function esNegativoCierre(norm: string): boolean {
  return /^(no|nop|nel|no gracias|no quiero|ahorita no|ahora no|hoy no|despues|luego|mas tarde|otro dia)\b/.test(norm);
}

function esYaPague(norm: string): boolean {
  return /(ya pague|ya pag|ya transfer|ya hice el pago|ya esta el pago|listo el pago|pago hecho|ya realice|acabo de pagar|hice la transferencia|hice el pago movil)/.test(norm);
}

/** mensaje mixto: además de afirmar, trae una pregunta que NO debe ignorarse */
function contienePregunta(body: string, norm: string): boolean {
  if (/[?¿]/.test(body || "")) return true;
  const sinArranque = norm.replace(
    /^(si+|sip|dale|de una|ok(ey|ay)?|va|vale|listo|claro|perfecto|bueno)\b[\s,]*(y|pero)?\s*/,
    "",
  );
  return /\b(cuant[oa]s?|como|cual(es)?|donde|cuando|por ?que|sirve|funciona|se puede|puedo|necesito|hay que|incluye)\b/
    .test(sinArranque);
}

/** el mensaje ya es en sí una petición de los datos de pago */
function pideDatosDirecto(norm: string): boolean {
  return /(como pago|donde pago|los datos|datos de pago|pasame|quiero pagar|quiero comprar|paso los datos)/.test(norm);
}

// ============================== OpenAI ==============================

// Los modelos se leen de musa_settings clave "modelos"
// ({"conversacion": ..., "clasificador": ...}); estos son solo el fallback
// si la clave faltara o viniera incompleta.
const MODELO_CONVERSACION_DEFAULT = "gpt-5.1";
const MODELO_CLASIFICADOR_DEFAULT = "gpt-5-mini";

async function openaiChat(
  // deno-lint-ignore no-explicit-any
  payload: Record<string, any>,
  timeoutMs: number,
): Promise<string | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let body = { ...payload };
    for (let intento = 0; intento < 2; intento++) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.ok) {
        const j = await res.json();
        return j?.choices?.[0]?.message?.content ?? null;
      }
      const errTxt = await res.text();
      console.error("openai", res.status, errTxt.slice(0, 300));
      if (res.status === 400 && intento === 0) {
        // reintento quitando SOLO el parámetro que el modelo rechazó
        let param: string | null = null;
        try {
          param = JSON.parse(errTxt)?.error?.param ?? null;
        } catch { /* sin param */ }
        if (param && param in body) {
          if (param === "max_tokens") {
            body.max_completion_tokens = body.max_tokens;
          }
          delete body[param];
          continue;
        }
        const { temperature: _t, response_format: _rf, ...resto } = body;
        body = resto;
        continue;
      }
      return null;
    }
    return null;
  } catch (e) {
    console.error("openai err", String(e).slice(0, 200));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type Clasificacion = {
  tipo: string;
  objecion_id?: number;
  pais?: string;
};

async function clasificarGPT(
  mensaje: string,
  estado: string,
  cfg: Cfg,
): Promise<Clasificacion | null> {
  const lista = (cfg.funnelCopy?.objeciones ?? [])
    .map((o, i) => `${i + 1}. ${o.objecion}`)
    .join("\n");
  const system =
    `Clasificas mensajes de un chat de ventas por WhatsApp (curso "Modelos IA", 9 USD). ` +
    `Responde SOLO un JSON valido, sin texto extra, con esta forma: ` +
    `{"tipo":"afirmativo"|"negativo"|"objecion"|"pregunta"|"pais"|"edad_si"|"edad_menor"|"otro","objecion_id":numero opcional 1-13,"pais":"VE"|"CO"|"OTRO" opcional}. ` +
    `"pais": usalo si el mensaje indica un pais (Venezuela=VE, Colombia=CO, cualquier otro pais real=OTRO). ` +
    `Abreviaturas o variantes cortas TAMBIEN son pais: "ven", "vene", "vzla", "vnzla" => VE; "col" => CO. ` +
    `"edad_si": SOLO si confirma de forma inequivoca tener 18 anos o mas (ej: "si", "si, tengo 25", "soy mayor de edad"). ` +
    `Risas ("jaja"), un "ok" suelto o respuestas ambiguas NUNCA son edad_si: clasificalas como "otro" o "afirmativo". ` +
    `"edad_menor": dice o implica tener menos de 18. ` +
    `"objecion": si coincide con alguna de estas objeciones (devuelve objecion_id):\n${lista}`;
  const user = `ETAPA ACTUAL: ${estado}\nMENSAJE DEL USUARIO: "${mensaje.slice(0, 400)}"`;
  const contenido = await openaiChat({
    model: cfg.modelos?.clasificador || MODELO_CLASIFICADOR_DEFAULT,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    // los gpt-5* mini solo aceptan temperature por defecto (1); determinismo via prompt.
    max_completion_tokens: 60,
    reasoning_effort: "minimal",
  }, 6000);
  if (!contenido) return null;
  try {
    const limpio = contenido.replace(/```json|```/g, "").trim();
    const m = limpio.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]) as Clasificacion;
  } catch {
    return null;
  }
}

async function fallbackGPT(
  admin: Admin,
  lead: Lead,
  cfg: Cfg,
  preguntaPendiente: string,
): Promise<string> {
  const enlatada = `Buena pregunta 😊 Déjame confirmarlo con el equipo y te cuento. Mientras tanto: ${preguntaPendiente}`;
  try {
    const { data: historial } = await admin.database
      .from("musa_messages")
      .select("direction, body")
      .eq("lead_phone", lead.phone)
      .order("created_at", { ascending: false })
      .limit(10);
    const mensajes = (historial ?? [])
      .reverse()
      .filter((m: { body: string | null }) => m.body)
      .map((m: { direction: string; body: string }) => ({
        role: m.direction === "in" ? "user" : "assistant",
        content: m.body.slice(0, 1000),
      }));
    // Guardia dura pre-gate (regla 4): mientras el lead NO haya confirmado ser
    // mayor de 18, el GPT libre JAMÁS puede dar el gate por pasado ni acercar el
    // cierre ("jaja ok" NO es una confirmación de edad).
    const preGate = lead.mayor_18 !== true &&
      ["S00_LLEGADA", "S03_PAIS", "S04_GATE18"].includes(lead.estado_funnel);
    const guardiaGate = preGate
      ? "\nREGLA DURA EN ESTE MENSAJE: este lead AÚN NO ha confirmado ser mayor de 18. " +
        'Un "ok", "dale", "jaja" o cualquier respuesta ambigua NO cuenta como confirmación. ' +
        "PROHIBIDO darle la edad por confirmada, decir que \"seguimos\" con la venta, ofrecer métodos o datos de pago, o avanzar al cierre. " +
        "Responde su duda solo con los HECHOS CERRADOS y cierra SIEMPRE volviendo a preguntar si ya tiene 18 años o más."
      : "";
    const system = resolverPlaceholders(cfg.gptSystem?.prompt ?? "", lead, cfg) +
      `\n\nETAPA ACTUAL: ${lead.estado_funnel} | PREGUNTA PENDIENTE QUE DEBES RETOMAR AL FINAL: ${preguntaPendiente}` +
      guardiaGate;
    const contenido = await openaiChat({
      model: cfg.modelos?.conversacion || MODELO_CONVERSACION_DEFAULT,
      messages: [{ role: "system", content: system }, ...mensajes],
      max_completion_tokens: 350,
    }, 8000);
    if (!contenido || !contenido.trim()) return enlatada;
    return resolverPlaceholders(contenido.trim(), lead, cfg);
  } catch (e) {
    console.error("fallbackGPT err", String(e).slice(0, 200));
    return enlatada;
  }
}

// ============================== persistencia y envío ==============================

async function registrarEvento(
  admin: Admin,
  phone: string,
  evento: string,
  detalle: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await admin.database
    .from("musa_funnel_events")
    .insert([{ lead_phone: phone, evento, detalle }]);
  if (error) console.error("evento " + evento, JSON.stringify(error));
}

async function transicion(admin: Admin, lead: Lead, nuevo: string): Promise<void> {
  if (lead.estado_funnel === nuevo) return;
  const anterior = lead.estado_funnel;
  const { error } = await admin.database
    .from("musa_leads")
    .update({ estado_funnel: nuevo })
    .eq("phone", lead.phone);
  if (error) throw new Error("transicion: " + JSON.stringify(error));
  lead.estado_funnel = nuevo;
  await registrarEvento(admin, lead.phone, "cambio_estado", { de: anterior, a: nuevo });
}

async function actualizarLead(
  admin: Admin,
  lead: Lead,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.database
    .from("musa_leads")
    .update(patch)
    .eq("phone", lead.phone);
  if (error) throw new Error("update lead: " + JSON.stringify(error));
  Object.assign(lead, patch);
}

/**
 * Envía mensajes del bot: SIEMPRE persiste en musa_messages y actualiza last_out_at;
 * solo llama a Twilio para números reales (no +9999*) con credenciales presentes.
 */
async function enviarMensajes(admin: Admin, lead: Lead, textos: string[]): Promise<void> {
  const limpios = textos.map((t) => (t ?? "").trim()).filter((t) => t.length > 0);
  if (limpios.length === 0) return;
  const esPrueba = lead.phone.startsWith("+9999");
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886";
  const enviarReal = !esPrueba && !!sid && !!token;

  for (let i = 0; i < limpios.length; i++) {
    const body = limpios[i];
    const { error } = await admin.database.from("musa_messages").insert([{
      lead_phone: lead.phone,
      direction: "out",
      body,
      estado_funnel: lead.estado_funnel,
    }]);
    if (error) console.error("insert out", JSON.stringify(error));

    if (enviarReal) {
      if (i > 0) await sleep(1500); // límite del sandbox de Twilio
      try {
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
          {
            method: "POST",
            headers: {
              "Authorization": "Basic " + btoa(`${sid}:${token}`),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              From: from,
              To: `whatsapp:${lead.phone}`,
              Body: body,
            }),
          },
        );
        if (!res.ok) {
          console.error("twilio send", res.status, (await res.text()).slice(0, 200));
        }
      } catch (e) {
        console.error("twilio err", String(e).slice(0, 200));
      }
    }
  }
  await admin.database
    .from("musa_leads")
    .update({ last_out_at: new Date().toISOString() })
    .eq("phone", lead.phone);
}

async function crearPagoRevision(
  admin: Admin,
  phone: string,
  mediaUrl: string | null,
): Promise<string | null> {
  for (let intento = 0; intento < 6; intento++) {
    const shortId = String(Math.floor(1000 + Math.random() * 9000));
    const { error } = await admin.database.from("musa_payments").insert([{
      lead_phone: phone,
      metodo: "por_clasificar",
      status: "revision",
      storage_key: mediaUrl,
      short_id: shortId,
    }]);
    if (!error) return shortId;
    if (!JSON.stringify(error).includes("23505")) {
      throw new Error("insert musa_payments: " + JSON.stringify(error));
    }
  }
  console.error("crearPagoRevision: short_id agotado tras 6 intentos");
  return null;
}

// ============================== piezas de copy ==============================

const PREGUNTA_PENDIENTE: Record<string, string> = {
  S03_PAIS: "¿Me escribes desde *Venezuela* 🇻🇪 o desde *Colombia* 🇨🇴?",
  S04_GATE18: "¿Me confirmas que ya tienes 18 años o más?",
  S06_CIERRE: "¿Te paso los datos de pago? 😊",
  S08_ESPERA_CAPTURA: "Cuando tengas la captura del comprobante, envíamela por aquí 📸",
  S09_VERIFICACION: "Seguimos verificando tu pago, tu acceso queda asegurado ✅",
};

function preguntaDeEtapa(estado: string): string {
  return PREGUNTA_PENDIENTE[estado] ?? "¿En qué te puedo ayudar? 😊";
}

function mensajePrecioRapido(lead: Lead, cfg: Cfg): string {
  const bs = formatMiles(Number(cfg.precioBsHoy?.bs ?? 7400));
  const cop = formatMiles(Number(cfg.precio?.cop ?? 33000));
  if (lead.pais === "VE") {
    return `El curso completo cuesta *9 USD*, pago único: en bolívares son *${bs} Bs* a la tasa de hoy 🇻🇪 Incluye los 13 módulos, los 4 bonos y el grupo de alumnos, con acceso de por vida.`;
  }
  if (lead.pais === "CO") {
    return `El curso completo cuesta *9 USD*, pago único: en pesos son *${cop} COP* 🇨🇴 Incluye los 13 módulos, los 4 bonos y el grupo de alumnos, con acceso de por vida.`;
  }
  return `El curso completo cuesta *9 USD*, pago único: en Venezuela son *${bs} Bs* a la tasa de hoy 🇻🇪 y en Colombia *${cop} COP* 🇨🇴 Incluye 13 módulos + 4 bonos + grupo de alumnos, acceso de por vida.`;
}

/** S05 (línea de moneda del país) + S06 cierre, listos para enviar */
function mensajesPrecioYCierre(lead: Lead, cfg: Cfg): string[] {
  const s05 = etapa(cfg, "S05_PRECIO");
  const s06 = etapa(cfg, "S06_CIERRE");
  let precio = filtrarLineasPais(s05.mensajes[0], lead.pais);
  if (lead.pais !== "VE" && lead.pais !== "CO") {
    precio += "\n\nTu pago sería de *9 USD*; el método de pago disponible para tu zona te lo confirmo en un momento 🌎";
  }
  const cierre = `${s05.mensajes[1]}\n\n${s06.mensajes[0]}`;
  return [
    resolverPlaceholders(precio, lead, cfg),
    resolverPlaceholders(cierre, lead, cfg),
  ];
}

/** stack S04 + pregunta 18+ */
function mensajesStackYGate(lead: Lead, cfg: Cfg): string[] {
  const s04 = etapa(cfg, "S04_STACK_18");
  return [
    resolverPlaceholders(s04.mensajes[0], lead, cfg),
    resolverPlaceholders(s04.mensajes[1], lead, cfg),
  ];
}

function dentroDeHorario(cfg: Cfg): boolean {
  const tz = cfg.horario?.tz || "America/Caracas";
  const inicio = Number(cfg.horario?.inicio ?? 8);
  const fin = Number(cfg.horario?.fin ?? 22);
  try {
    const h = parseInt(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false })
        .format(new Date()),
      10,
    ) % 24;
    return h >= inicio && h < fin;
  } catch {
    return true;
  }
}

const RECIERRE_SUAVE = "¿Te animas? ¿Te paso los datos de pago? 😊";
const MSG_OPTOUT =
  "Listo 👍 Quedas fuera de la lista y no te volveré a escribir. ¡Gracias por tu tiempo y que te vaya bonito! 💜";
const MSG_MENOR_REITERACION =
  "Gracias por escribirme 🙏 Recuerda que este programa es solo para mayores de 18 años, así que no puedo venderte el acceso. ¡Cuídate mucho! 💜";
const MSG_VERIFICANDO =
  "Seguimos verificando tu pago ✅ Tu acceso queda asegurado; te confirmo por aquí mismo apenas esté listo 💜";
const MSG_GATE18_REASK =
  "Solo para estar segura antes de seguir 😊 ¿Ya tienes *18 años o más*? Respóndeme con un *sí* o dime tu edad, porfa 🙏";
const MSG_GATE18_REASK2 =
  "Jeje va 😊 pero necesito que me lo confirmes clarito: ¿ya tienes *18 años o más*? Apenas me digas que sí, seguimos con todos los detalles 🙏";
const MSG_NEGATIVO_SUAVE =
  "Todo bien, sin presión 😊 Aquí quedo por si te animas más adelante; cualquier duda me la escribes con confianza 💜";
const MSG_ESCALADO_ACK =
  "El equipo ya está revisando tu consulta 🙏 Te escribo por aquí apenas tengan la respuesta";
const MSG_ESCALADO_ACK2 =
  "Sigo pendiente de tu caso con el equipo 💜 Apenas tenga novedad te aviso";

/**
 * Cuántos acuses de escalado se han enviado DESPUÉS del último evento
 * 'escalado' de este lead (si no hay 'escalado', cuenta todos los acuses).
 */
async function contarAcusesEscalado(admin: Admin, phone: string): Promise<number> {
  const { data: esc } = await admin.database
    .from("musa_funnel_events")
    .select("id")
    .eq("lead_phone", phone)
    .eq("evento", "escalado")
    .order("id", { ascending: false })
    .limit(1);
  let q = admin.database
    .from("musa_funnel_events")
    .select("id")
    .eq("lead_phone", phone)
    .eq("evento", "acuse_escalado");
  const escaladoId = esc?.[0]?.id;
  if (escaladoId != null) q = q.gt("id", escaladoId);
  const { data: acuses } = await q;
  return (acuses ?? []).length;
}

/** último mensaje enviado por el bot a este lead (para no repetirnos nunca dos veces seguidas) */
async function ultimoMensajeOut(admin: Admin, phone: string): Promise<string | null> {
  const { data } = await admin.database
    .from("musa_messages")
    .select("body")
    .eq("lead_phone", phone)
    .eq("direction", "out")
    .order("id", { ascending: false })
    .limit(1);
  return data?.[0]?.body ?? null;
}

/** re-pregunta del gate 18+ alternando redacción para no repetir el mismo mensaje seguido */
async function gateReask(admin: Admin, lead: Lead): Promise<string> {
  const ultimo = await ultimoMensajeOut(admin, lead.phone);
  return ultimo === MSG_GATE18_REASK ? MSG_GATE18_REASK2 : MSG_GATE18_REASK;
}

// ============================== máquina de estados ==============================

async function responderObjecion(
  admin: Admin,
  lead: Lead,
  cfg: Cfg,
  objecionId: number,
  conRecierre: boolean,
): Promise<void> {
  const obj = (cfg.funnelCopy?.objeciones ?? [])[objecionId - 1];
  if (!obj) return;
  await registrarEvento(admin, lead.phone, "objecion", { id: objecionId, objecion: obj.objecion });
  const respuesta = resolverPlaceholders(obj.respuesta, lead, cfg);
  const msgs = [respuesta];
  // recierre solo si la respuesta no cierra ya con pregunta propia ni acaba de
  // ofrecer tiempo para pensar (repetir el CTA ahí contradice lo dicho).
  const necesitaRecierre = conRecierre &&
    !/te paso los datos/i.test(respuesta) &&
    !/\?\s*[^\w\s]*\s*$/.test(respuesta.trim()) &&
    !/t[oó]mate tu tiempo/i.test(respuesta);
  if (necesitaRecierre) msgs.push(RECIERRE_SUAVE);
  await enviarMensajes(admin, lead, msgs);
}

/** frases tipo "déjame confirmarlo con el equipo": si el bot lo promete, debe escalar de verdad */
const PROMESA_EQUIPO =
  /(confirm|consult|pregunt|verific|revis|chequ|valid)\w*[^.!?\n]{0,40}\bequipo\b/i;

/**
 * Envía una respuesta GPT y, si esta promete consultar algo con el equipo,
 * escala DE VERDAD (escalado_humano=true + evento) para que la promesa nunca
 * quede vacía. Devuelve true si escaló (el bot queda en pausa en ese chat).
 */
async function responderConGPT(
  admin: Admin,
  lead: Lead,
  cfg: Cfg,
  pregunta: string,
): Promise<boolean> {
  const respuesta = await fallbackGPT(admin, lead, cfg, pregunta);
  await enviarMensajes(admin, lead, [respuesta]);
  if (PROMESA_EQUIPO.test(respuesta)) {
    await actualizarLead(admin, lead, { escalado_humano: true });
    await registrarEvento(admin, lead.phone, "escalado", {
      motivo: "fallback_consulta_equipo",
      etapa: lead.estado_funnel,
    });
    return true;
  }
  return false;
}

async function responderFallback(
  admin: Admin,
  lead: Lead,
  cfg: Cfg,
  pregunta?: string,
): Promise<void> {
  const p = pregunta ?? preguntaDeEtapa(lead.estado_funnel);
  await registrarEvento(admin, lead.phone, "fallback_gpt", { etapa: lead.estado_funnel });
  await responderConGPT(admin, lead, cfg, p);
}

/** Flujo de lead nuevo: S01 (2 msgs) + puente sin_video + pregunta de país */
async function flujoLeadNuevo(
  admin: Admin,
  lead: Lead,
  cfg: Cfg,
  pidePrecio: boolean,
): Promise<void> {
  const s01 = etapa(cfg, "S01_SALUDO");
  const s02 = etapa(cfg, "S02_AVATAR");
  const s03 = etapa(cfg, "S03_PAIS");
  // OJO: el puente NUNCA debe prometer un video/"sorpresa" que esta fase no envía
  // (regla 1: no inventar pruebas). El copy real vive en funnel_copy.
  const puente = s02.ramas?.A?.sin_video ??
    "Te cuento todo en un momento 😉 Pero primero lo importante:";
  const msgs = [
    resolverPlaceholders(s01.mensajes[0], lead, cfg),
    resolverPlaceholders(s01.mensajes[1], lead, cfg),
  ];
  if (pidePrecio) msgs.push(mensajePrecioRapido(lead, cfg));
  msgs.push(resolverPlaceholders(`${puente}\n\n${s03.mensajes[0]}`, lead, cfg));
  await actualizarLead(admin, lead, { avatar_enviado: false });
  await transicion(admin, lead, "S03_PAIS");
  await enviarMensajes(admin, lead, msgs);
}

async function manejarS03(admin: Admin, lead: Lead, cfg: Cfg, body: string, norm: string): Promise<void> {
  let pais = detectarPaisHeuristico(norm, body);
  let cls: Clasificacion | null = null;
  if (!pais) {
    cls = await clasificarGPT(body, lead.estado_funnel, cfg);
    if (cls?.tipo === "pais" && cls.pais && ["VE", "CO", "OTRO"].includes(cls.pais)) {
      pais = cls.pais;
    }
  }
  if (pais === "VE" || pais === "CO") {
    await actualizarLead(admin, lead, { pais });
    await transicion(admin, lead, "S04_GATE18");
    await enviarMensajes(admin, lead, mensajesStackYGate(lead, cfg));
    return;
  }
  if (pais === "OTRO") {
    const s03 = etapa(cfg, "S03_PAIS");
    await actualizarLead(admin, lead, { pais: "OTRO" });
    await transicion(admin, lead, "S04_GATE18");
    await enviarMensajes(admin, lead, [
      resolverPlaceholders(sinPrefijo(s03.mensajes[1]), lead, cfg),
      ...mensajesStackYGate(lead, cfg),
    ]);
    return;
  }
  if (cls?.tipo === "objecion" && cls.objecion_id) {
    await responderObjecion(admin, lead, cfg, cls.objecion_id, false);
    await enviarMensajes(admin, lead, [preguntaDeEtapa("S03_PAIS")]);
    return;
  }
  await responderFallback(admin, lead, cfg);
}

async function manejarS04(admin: Admin, lead: Lead, cfg: Cfg, body: string, norm: string): Promise<void> {
  let edad = clasificarEdadHeuristico(norm);
  let cls: Clasificacion | null = null;
  if (!edad) {
    cls = await clasificarGPT(body, lead.estado_funnel, cfg);
    if (cls?.tipo === "edad_si") edad = "mayor";
    else if (cls?.tipo === "edad_menor") edad = "menor";
    // OJO: "afirmativo" genérico ("ok", "jaja ok") NO cuenta como confirmación
    // de edad: el gate exige un sí inequívoco (edad_si o heurístico).
  }
  if (edad === "mayor") {
    await actualizarLead(admin, lead, { mayor_18: true });
    await transicion(admin, lead, "S06_CIERRE");
    if (contienePregunta(body, norm)) {
      // confirmó edad pero también preguntó algo: responderlo antes de seguir
      await registrarEvento(admin, lead.phone, "fallback_gpt", {
        etapa: lead.estado_funnel,
        motivo: "pregunta_junto_a_confirmacion",
      });
      const escalo = await responderConGPT(
        admin,
        lead,
        cfg,
        "Si su duda se responde con los HECHOS CERRADOS, respóndela y avísale que ya mismo le pasas el precio y los detalles. " +
          "Si el dato NO está en los HECHOS CERRADOS, NO lo afirmes (ni con un sí inicial): di SOLO que lo confirmas con el equipo y que le escriben enseguida por aquí, sin prometer pasar el precio en este mismo mensaje.",
      );
      if (escalo) return;
    }
    await enviarMensajes(admin, lead, mensajesPrecioYCierre(lead, cfg));
    return;
  }
  if (edad === "menor") {
    const s04 = etapa(cfg, "S04_STACK_18");
    await actualizarLead(admin, lead, { mayor_18: false });
    await transicion(admin, lead, "S92_MENOR");
    await registrarEvento(admin, lead.phone, "menor_bloqueado", {});
    await enviarMensajes(admin, lead, [
      resolverPlaceholders(sinPrefijo(s04.mensajes[2]), lead, cfg),
    ]);
    return;
  }
  if (cls?.tipo === "objecion" && cls.objecion_id) {
    await responderObjecion(admin, lead, cfg, cls.objecion_id, false);
    await enviarMensajes(admin, lead, [preguntaDeEtapa("S04_GATE18")]);
    return;
  }
  if (cls?.tipo === "afirmativo") {
    // afirmación ambigua: re-preguntar explícito, sin avanzar el gate
    await registrarEvento(admin, lead.phone, "gate18_reask", {});
    await enviarMensajes(admin, lead, [await gateReask(admin, lead)]);
    return;
  }
  if (!contienePregunta(body, norm)) {
    // Mensaje ambiguo SIN pregunta real ("jaja ok", "mmm", emojis): el gate
    // NUNCA se da por pasado ni se delega al GPT libre (regla 4). Se
    // re-pregunta la edad de forma determinista.
    await registrarEvento(admin, lead.phone, "gate18_reask", { motivo: "ambiguo_sin_pregunta" });
    await enviarMensajes(admin, lead, [await gateReask(admin, lead)]);
    return;
  }
  await responderFallback(admin, lead, cfg);
}

/** true si el bloque de cuentas es enviable (sin PENDIENTE, campos vacíos ni números placeholder) */
function textoCuentasValido(texto: string): boolean {
  if (/pendiente/i.test(texto)) return false;
  if (/:\s*(\n|$)/.test(texto)) return false; // campo vacío tras los dos puntos
  if (/0{7,}/.test(texto.replace(/[\s.\-]/g, ""))) return false; // teléfonos/cédulas de ceros
  return true;
}

async function enviarDatosPago(admin: Admin, lead: Lead, cfg: Cfg): Promise<void> {
  const s07 = etapa(cfg, "S07_DATOS_PAGO");
  if (lead.pais === "VE" || lead.pais === "CO") {
    const raw = lead.pais === "VE" ? cfg.cuentasVe : cfg.cuentasCo;
    const bloque = lead.pais === "VE" ? bloqueCuentasVE(cfg) : bloqueCuentasCO(cfg);
    // deno-lint-ignore no-explicit-any
    const provisional = (raw as any)?.provisional === true;
    if (provisional || !textoCuentasValido(bloque)) {
      // cuentas incompletas o placeholder: JAMÁS enviarlas; escalar a humano
      await actualizarLead(admin, lead, { escalado_humano: true });
      await registrarEvento(admin, lead.phone, "escalado", {
        motivo: "datos_pago_incompletos",
        pais: lead.pais,
      });
      await enviarMensajes(admin, lead, [
        resolverPlaceholders(
          "¡Excelente decisión, {{nombre}}! 🙌 Déjame confirmar con el equipo los datos de pago actualizados para tu zona y te escribo en un ratico por aquí mismo 💜",
          lead,
          cfg,
        ),
      ]);
      return;
    }
    const msg = lead.pais === "VE" ? s07.mensajes[0] : s07.mensajes[1];
    await transicion(admin, lead, "S08_ESPERA_CAPTURA");
    await enviarMensajes(admin, lead, [resolverPlaceholders(sinPrefijo(msg), lead, cfg)]);
    return;
  }
  // país OTRO: el método de pago lo define un humano (tag #otro_pais)
  await actualizarLead(admin, lead, { escalado_humano: true });
  await registrarEvento(admin, lead.phone, "escalado", { motivo: "otro_pais_metodo_pago" });
  await enviarMensajes(admin, lead, [
    resolverPlaceholders(
      "¡Excelente! 🙌 Tu acceso queda en *9 USD*. Déjame confirmar con el equipo el método de pago disponible para tu zona y te escribo en un ratico por aquí mismo 💜",
      lead,
      cfg,
    ),
  ]);
}

/**
 * Cierre aceptado: si el mensaje además trae una pregunta ("ok y sirve en
 * iPhone?"), responderla ANTES de los datos de pago — nunca descartarla.
 */
async function cerrarConDatos(
  admin: Admin,
  lead: Lead,
  cfg: Cfg,
  body: string,
  norm: string,
): Promise<void> {
  if (!pideDatosDirecto(norm) && contienePregunta(body, norm)) {
    await registrarEvento(admin, lead.phone, "fallback_gpt", {
      etapa: lead.estado_funnel,
      motivo: "pregunta_junto_a_cierre",
    });
    const escalo = await responderConGPT(
      admin,
      lead,
      cfg,
      "Si su duda se responde con los HECHOS CERRADOS, respóndela y avísale que ya mismo le pasas los datos de pago. " +
        "Si el dato NO está en los HECHOS CERRADOS, NO lo afirmes (ni con un sí inicial): di SOLO que lo confirmas con el equipo y que le escriben enseguida por aquí, sin ofrecer enviar los datos de pago todavía.",
    );
    if (escalo) return; // la duda quedó con el equipo: no enviar datos aún
  }
  await enviarDatosPago(admin, lead, cfg);
}

async function manejarS06(admin: Admin, lead: Lead, cfg: Cfg, body: string, norm: string): Promise<void> {
  if (esAfirmativoCierre(norm)) {
    await cerrarConDatos(admin, lead, cfg, body, norm);
    return;
  }
  if (esNegativoCierre(norm)) {
    await enviarMensajes(admin, lead, [MSG_NEGATIVO_SUAVE]);
    return;
  }
  const cls = await clasificarGPT(body, lead.estado_funnel, cfg);
  if (cls?.tipo === "afirmativo") {
    await cerrarConDatos(admin, lead, cfg, body, norm);
    return;
  }
  if (cls?.tipo === "objecion" && cls.objecion_id) {
    await responderObjecion(admin, lead, cfg, cls.objecion_id, true);
    return;
  }
  if (cls?.tipo === "negativo") {
    await enviarMensajes(admin, lead, [MSG_NEGATIVO_SUAVE]);
    return;
  }
  await responderFallback(admin, lead, cfg);
}

async function manejarS08(
  admin: Admin,
  lead: Lead,
  cfg: Cfg,
  body: string,
  norm: string,
  esImagen: boolean,
  mediaUrl: string | null,
): Promise<void> {
  if (esImagen) {
    const shortId = await crearPagoRevision(admin, lead.phone, mediaUrl);
    await registrarEvento(admin, lead.phone, "captura_recibida", {
      short_id: shortId,
      media_url: mediaUrl,
    });
    const s09 = etapa(cfg, "S09_VERIFICACION");
    const acuse = dentroDeHorario(cfg) ? s09.mensajes[0] : sinPrefijo(s09.mensajes[1]);
    await transicion(admin, lead, "S09_VERIFICACION");
    await enviarMensajes(admin, lead, [resolverPlaceholders(acuse, lead, cfg)]);
    return;
  }
  if (esYaPague(norm)) {
    const s08 = etapa(cfg, "S08_ESPERA_CAPTURA");
    await enviarMensajes(admin, lead, [
      resolverPlaceholders(sinPrefijo(s08.mensajes[1]), lead, cfg),
    ]);
    return;
  }
  await responderFallback(admin, lead, cfg, PREGUNTA_PENDIENTE.S08_ESPERA_CAPTURA);
}

// ============================== handler principal ==============================

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const form = await req.formData();
    const f = (k: string): string => {
      const v = form.get(k);
      return typeof v === "string" ? v : "";
    };

    const from = f("From");
    const waId = f("WaId");
    const profileName = f("ProfileName");
    const body = f("Body");
    const numMedia = parseInt(f("NumMedia") || "0", 10) || 0;
    const mediaUrl0 = f("MediaUrl0");
    const mediaContentType0 = f("MediaContentType0");
    const messageSid = f("MessageSid");
    const referralCtwaClid = f("ReferralCtwaClid");
    const referralSourceId = f("ReferralSourceId");

    // phone = "+" + WaId; si falta WaId, derivar de From quitando "whatsapp:"
    let phone = "";
    if (waId) phone = "+" + waId.replace(/^\+/, "");
    else if (from) phone = from.replace(/^whatsapp:/, "").trim();
    if (!phone || phone === "+") return new Response("Missing phone", { status: 400 });

    const admin = createAdminClient({
      baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
      apiKey: Deno.env.get("API_KEY") ?? Deno.env.get("MUSA_INSFORGE_API_KEY"),
    });

    // Idempotencia: Twilio reintenta webhooks; mismo MessageSid => no reprocesar.
    if (messageSid) {
      const { data: dup } = await admin.database
        .from("musa_messages")
        .select("id")
        .eq("twilio_sid", messageSid)
        .maybeSingle();
      if (dup) return emptyTwiml();
    }

    const ahora = new Date().toISOString();

    // --- UPSERT del lead (con last_in_at) ---
    const { data: existing, error: selErr } = await admin.database
      .from("musa_leads")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();
    if (selErr) throw new Error("select musa_leads: " + JSON.stringify(selErr));

    let lead: Lead;
    let esNuevo = false;
    let lastInPrevio: string | null = null;

    if (!existing) {
      esNuevo = true;
      const nuevo: Record<string, unknown> = {
        phone,
        profile_name: profileName || null,
        estado_funnel: "S00_LLEGADA",
        avatar_enviado: false,
        last_in_at: ahora,
        bono_rapido_hasta: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      if (referralCtwaClid) nuevo.ctwa_clid = referralCtwaClid;
      if (referralSourceId) nuevo.source_id = referralSourceId;
      const { error: insErr } = await admin.database.from("musa_leads").insert([nuevo]);
      if (insErr) throw new Error("insert musa_leads: " + JSON.stringify(insErr));
      lead = {
        ...nuevo,
        nombre: null,
        pais: null,
        mayor_18: null,
        opt_out: false,
        escalado_humano: false,
      } as Lead;
    } else {
      lead = existing as Lead;
      lastInPrevio = lead.last_in_at;
      const patch: Record<string, unknown> = { last_in_at: ahora };
      if (profileName && profileName !== lead.profile_name) patch.profile_name = profileName;
      if (referralCtwaClid && lead.ctwa_clid == null) patch.ctwa_clid = referralCtwaClid;
      if (referralSourceId && lead.source_id == null) patch.source_id = referralSourceId;
      const { error: updErr } = await admin.database
        .from("musa_leads")
        .update(patch)
        .eq("phone", phone);
      if (updErr) throw new Error("update musa_leads: " + JSON.stringify(updErr));
      Object.assign(lead, patch);
    }

    // --- Check temprano de silencio: opt-out y escalado a humano ---
    // (antes de persistir el mensaje igual lo registramos para auditoría)
    const esImagen = numMedia > 0 && !!mediaContentType0 &&
      mediaContentType0.toLowerCase().startsWith("image");

    const { error: msgErr } = await admin.database.from("musa_messages").insert([{
      lead_phone: phone,
      direction: "in",
      body: body || null,
      media_url: numMedia > 0 && mediaUrl0 ? mediaUrl0 : null,
      media_type: numMedia > 0 && mediaContentType0 ? mediaContentType0 : null,
      twilio_sid: messageSid || null,
      estado_funnel: lead.estado_funnel,
    }]);
    if (msgErr) {
      // Carrera con un reintento simultáneo: índice único 23505 = ya procesado.
      if (JSON.stringify(msgErr).includes("23505")) return emptyTwiml();
      throw new Error("insert musa_messages: " + JSON.stringify(msgErr));
    }

    await registrarEvento(admin, phone, "mensaje_recibido", {
      tiene_media: numMedia > 0,
      referral: referralCtwaClid || null,
    });

    if (lead.opt_out) return emptyTwiml(); // silencio total permanente

    const norm = normalizar(body);

    // --- Comandos globales ---
    // STOP/SALIR funciona SIEMPRE, incluso con el bot en pausa por escalado.
    if (esStopTotal(norm)) {
      await actualizarLead(admin, lead, { opt_out: true });
      await registrarEvento(admin, phone, "optout", {});
      await enviarMensajes(admin, lead, [MSG_OPTOUT]);
      return emptyTwiml();
    }

    if (lead.escalado_humano) {
      // Bot en pausa: lo atiende un humano, pero no silencio inmediato — el lead
      // debe saber que su mensaje no se perdió. UN acuse por mensaje entrante,
      // rotando entre 2 variantes, con LÍMITE de 2 acuses por escalación
      // (después sí silencio, anti-spam). Se cuentan eventos 'acuse_escalado'
      // posteriores al último evento 'escalado'.
      const nAcuses = await contarAcusesEscalado(admin, phone);
      if (nAcuses >= 2) return emptyTwiml();
      const ack = nAcuses === 0 ? MSG_ESCALADO_ACK : MSG_ESCALADO_ACK2;
      await registrarEvento(admin, phone, "acuse_escalado", { n: nAcuses + 1 });
      await enviarMensajes(admin, lead, [ack]);
      return emptyTwiml();
    }

    const cfg = await cargarSettings(admin);

    if (lead.estado_funnel === "S92_MENOR") {
      // terminal: una sola línea amable, sin venta, sin reintentos
      await enviarMensajes(admin, lead, [MSG_MENOR_REITERACION]);
      return emptyTwiml();
    }

    if (norm && preguntaPorBot(norm)) {
      // respuesta exacta de la objeción "¿Eres un bot?" (la última de la lista)
      const idx = (cfg.funnelCopy?.objeciones ?? [])
        .findIndex((o) => /bot/i.test(o.objecion));
      if (idx >= 0) {
        await responderObjecion(admin, lead, cfg, idx + 1, false);
        if (lead.estado_funnel !== "S00_LLEGADA") {
          await enviarMensajes(admin, lead, [preguntaDeEtapa(lead.estado_funnel)]);
          return emptyTwiml();
        }
        // lead nuevo que abre preguntando si es bot: seguir con el saludo
      }
    }

    if (norm && pideHumano(norm) && !preguntaPorBot(norm)) {
      const s91 = etapa(cfg, "S91_HUMANO");
      await actualizarLead(admin, lead, { escalado_humano: true });
      await registrarEvento(admin, phone, "escalado", { motivo: "pidio_humano" });
      await enviarMensajes(admin, lead, [resolverPlaceholders(s91.mensajes[0], lead, cfg)]);
      return emptyTwiml();
    }

    const pidePrecio = !!norm && preguntaPrecio(norm);
    // Pregunta de precio antes de S05: responder de inmediato y retomar la etapa.
    if (
      pidePrecio && !esNuevo &&
      (lead.estado_funnel === "S03_PAIS" || lead.estado_funnel === "S04_GATE18")
    ) {
      await enviarMensajes(admin, lead, [
        mensajePrecioRapido(lead, cfg),
        preguntaDeEtapa(lead.estado_funnel),
      ]);
      return emptyTwiml();
    }

    // Re-bienvenida: vuelve después de >24h en una etapa intermedia.
    if (
      !esNuevo && lastInPrevio &&
      (Date.now() - new Date(lastInPrevio).getTime()) > 24 * 60 * 60 * 1000 &&
      ["S03_PAIS", "S04_GATE18", "S06_CIERRE"].includes(lead.estado_funnel)
    ) {
      await enviarMensajes(admin, lead, [
        resolverPlaceholders(
          "¡Qué bueno verte de nuevo por aquí, {{nombre}}! 😊 Retomemos donde quedamos 👇",
          lead,
          cfg,
        ),
      ]);
    }

    // --- Máquina de estados ---
    switch (lead.estado_funnel) {
      case "S00_LLEGADA":
        await flujoLeadNuevo(admin, lead, cfg, pidePrecio);
        break;
      case "S03_PAIS":
        await manejarS03(admin, lead, cfg, body, norm);
        break;
      case "S04_GATE18":
        await manejarS04(admin, lead, cfg, body, norm);
        break;
      case "S06_CIERRE":
        await manejarS06(admin, lead, cfg, body, norm);
        break;
      case "S08_ESPERA_CAPTURA":
        await manejarS08(admin, lead, cfg, body, norm, esImagen, mediaUrl0 || null);
        break;
      case "S09_VERIFICACION":
        await enviarMensajes(admin, lead, [MSG_VERIFICANDO]);
        break;
      default:
        // estado desconocido o de fases futuras: fallback conservador
        await responderFallback(admin, lead, cfg);
        break;
    }

    return emptyTwiml();
  } catch (err) {
    // NUNCA romper: Twilio reintenta en 5xx; respondemos 200 con TwiML vacío.
    console.error("musa-webhook-twilio error:", err);
    return emptyTwiml();
  }
}
