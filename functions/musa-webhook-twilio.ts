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

// ============================== seguridad: firma Twilio ==============================

/** comparación en tiempo constante de dos strings ASCII (anti timing-attack) */
function igualConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Valida el header X-Twilio-Signature de un webhook entrante.
 * Twilio firma así: base64( HMAC-SHA1( authToken, URL + concat(clave+valor) de
 * TODOS los params del POST, ORDENADOS alfabéticamente por clave ) ).
 * - URL: se toma de MUSA_WEBHOOK_URL (la URL EXACTA configurada en Twilio); NO se
 *   usa req.url porque en el runtime interno puede diferir y rompería la firma.
 * - params: TODOS los campos del form (ya parseados en el handler).
 * Devuelve { valida, motivo } para telemetría.
 */
async function validarFirmaTwilio(
  form: FormData,
  firmaHeader: string | null,
): Promise<{ valida: boolean; motivo: string }> {
  if (!firmaHeader) return { valida: false, motivo: "sin_header" };
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  const url = Deno.env.get("MUSA_WEBHOOK_URL") ?? "";
  if (!authToken || !url) return { valida: false, motivo: "config_faltante" };

  // Concatenar URL + (clave+valor) de cada par, ordenado alfabéticamente por clave.
  const claves: string[] = [];
  for (const k of form.keys()) claves.push(k);
  claves.sort();
  let data = url;
  for (const k of claves) {
    const v = form.get(k);
    data += k + (typeof v === "string" ? v : "");
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(authToken),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(data),
    );
    // base64 estándar del digest.
    const esperado = btoa(String.fromCharCode(...new Uint8Array(sig)));
    return igualConstante(esperado, firmaHeader)
      ? { valida: true, motivo: "ok" }
      : { valida: false, motivo: "no_coincide" };
  } catch (e) {
    return { valida: false, motivo: "error_crypto:" + String(e).slice(0, 80) };
  }
}

/**
 * CAMBIO 5 — retardo natural antes de enviar un mensaje (sensación humana):
 * base de 350 ms + ~35 ms por carácter del texto a enviar, con tope de 4500 ms.
 */
function calcularRetardoMs(texto: string): number {
  const base = 350;
  const porCaracter = 35;
  const tope = 4500;
  const largo = (texto || "").length;
  return Math.min(tope, base + largo * porCaracter);
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
  /** SID del mensaje ENTRANTE actual (transitorio, para el typing indicator) */
  _inbound_sid?: string | null;
  [k: string]: unknown;
};

type Cfg = {
  funnelCopy: Record<string, unknown> & {
    etapas: Array<{
      id: string;
      mensajes: string[];
      ramas?: Record<string, { mensajes?: string[]; sin_video?: string }>;
    }>;
    objeciones: Array<{ objecion: string; respuesta: string }>;
  };
  avatar: {
    personalizado_activo?: boolean;
    video_base_url?: string;
    video_base_key?: string;
    [k: string]: unknown;
  };
  gptSystem: { prompt: string };
  precio: { usd: number; cop: number };
  precioBsHoy: { bs: number };
  cuentasVe: Record<string, Record<string, string>>;
  cuentasCo: Record<string, Record<string, string>>;
  marca: { asesora?: string; firma?: string };
  entrega: {
    link_grupo?: string;
    modulos?: string[];
    bonos?: Record<string, string>;
    plan_accion_7dias?: string;
  };
  horario: { tz?: string; inicio?: number; fin?: number };
  modelos: { conversacion?: string; clasificador?: string; vision?: string };
  operador: { whatsapp?: string; horario_inicio?: number; horario_fin?: number };
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
    "avatar",
    "operador",
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
    avatar: (map["avatar"] ?? {}) as Cfg["avatar"],
    operador: (map["operador"] ?? { whatsapp: "", horario_inicio: 8, horario_fin: 22 }) as Cfg["operador"],
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
  // El opt-out debe dispararse aunque la palabra clave vaya acompañada de otro
  // texto ("mejor no, SALIR", "ya no, stop"). Detectamos STOP/SALIR/BAJA/
  // CANCELAR como TOKEN AISLADO (separado por límites no alfabéticos), no como
  // subcadena (para no confundir "salir" dentro de "salirme"/"asalariado" ni
  // "stop" dentro de otra palabra). Si el mensaje SOLO contiene esa palabra
  // (con o sin signos) también cuenta.
  const limpio = norm.replace(/[^a-z]/g, "");
  if (limpio === "stop" || limpio === "salir" || limpio === "baja" || limpio === "cancelar") {
    return true;
  }
  return /(^|[^a-z])(stop|salir|baja|cancelar)([^a-z]|$)/.test(norm);
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

/**
 * CAMBIO 4 (Fase 4) — números deletreados en español → dígitos.
 * Las notas de voz transcritas escriben la edad con palabras ("veinticinco"),
 * no con dígitos, así que el extractor numérico del gate no la veía. Esta función
 * inyecta el dígito equivalente (10–99) detrás de la palabra para que el resto de
 * la heurística de edad lo lea igual que "25". Solo cubre el rango de edades
 * plausibles; no toca el texto si no hay un número en palabras.
 */
function inyectarEdadDeletreada(norm: string): string {
  const unidades: Record<string, number> = {
    cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
    seis: 6, siete: 7, ocho: 8, nueve: 9,
  };
  const especiales: Record<string, number> = {
    diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
    dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
    veinte: 20, veintiuno: 21, veintiun: 21, veintiuna: 21, veintidos: 22,
    veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
    veintisiete: 27, veintiocho: 28, veintinueve: 29,
  };
  const decenas: Record<string, number> = {
    treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70,
    ochenta: 80, noventa: 90,
  };
  // 1) palabras 10–29 directas.
  for (const [w, n] of Object.entries(especiales)) {
    if (new RegExp(`\\b${w}\\b`).test(norm)) return `${norm} ${n}`;
  }
  // 2) "treinta y cinco", "cuarenta y dos", etc.
  for (const [dw, dn] of Object.entries(decenas)) {
    const m = norm.match(new RegExp(`\\b${dw}(\\s+y\\s+(\\w+))?`));
    if (m) {
      let n = dn;
      if (m[2] && unidades[m[2]] != null) n += unidades[m[2]];
      return `${norm} ${n}`;
    }
  }
  return norm;
}

/**
 * CAMBIO 2 — gate de edad inferido. Atajo heurístico para los casos obvios; si
 * NO decide (null = ambiguo) el llamador cae al clasificador GPT. Devuelve
 * "mayor" | "menor" | null (ambiguo).
 */
function clasificarEdadHeuristico(normRaw: string): string | null {
  // Inyecta el dígito si la edad viene deletreada (notas de voz transcritas).
  const norm = inyectarEdadDeletreada(normRaw);
  // --- SEÑALES DE MENOR (prioridad máxima: van ANTES del extractor de número) ---
  //
  // CAUSA RAÍZ RONDA 1 (Carlitos, 17): "nah todavia no, el ano que viene cumplo
  // los 18" no matcheaba ninguna señal de menor y el extractor de número capturaba
  // el "18" de "cumplo los 18" devolviendo "mayor". Fix:
  //   a) Detectar el FUTURO de "cumplir" como menor de forma robusta: cualquier
  //      forma conjugada de cumplir (cumplo/cumplire/cumpla/voy a cumplir/falta
  //      para cumplir...) acompañada de un horizonte futuro o de la negación
  //      "todavia/aun no" es MENOR, sin importar el número que venga después.
  //   b) Si hay contexto de "cumplir N años" en futuro/negado, NO dejar que el
  //      extractor numérico lo lea como edad actual.
  const negacionPrevia = /(todavia|aun|aún|aun no|todavia no)\b/.test(norm) ||
    /^(no|nah|nop|nel|que va|qué va|aun no|todavia no)\b/.test(norm);
  const cumplirFuturo =
    // "cumplo/cumplire/cumpla/cumpliendo (los) 18", "voy a cumplir", "falta para cumplir"
    /\b(voy a cumplir|falta(n)? .* (para )?cumplir|cuando (los )?cumpla|los cumplo|los cumplire|cumplire|cumplo los|cumplire los|cumpla los)\b/.test(norm) ||
    // horizontes futuros explícitos
    /\b(el (otro|proximo|que viene) (ano|anio|año)|el ano que viene|el año que viene|proximo ano|el ano entrante|en (un|dos|tres) (ano|anos|año|años)|el mes que viene|en \w+ cumplo)\b/.test(norm);
  if (
    /(soy menor|menor de edad|no tengo 18|no soy mayor|no soy mayor de edad|aun soy menor|todavia soy menor)/.test(norm)
  ) {
    return "menor";
  }
  if (
    /(aun no (cumplo|tengo|los|soy|llego)|todavia no (cumplo|tengo|los|soy|llego))/.test(norm)
  ) {
    return "menor";
  }
  // negación + intención de cumplir años (futuro) => MENOR. Cubre el caso de
  // Carlitos aunque el "18" venga inmediatamente después de "cumplo los".
  if (cumplirFuturo && (negacionPrevia || /\bcumpl/.test(norm))) {
    // Sólo lo consideramos MENOR cuando el verbo cumplir está en CONTEXTO futuro
    // (no cuando ya cumplió: "ya cumpli 18" lo maneja la rama de mayor abajo).
    if (!/\bya (cumpli|los cumpli|tengo)\b/.test(norm)) return "menor";
  }
  // "+18", "mas de 18", "ya soy mayor" → mayor inequívoco.
  if (/(\+\s*18|mas de 18|ya soy mayor|soy mayor de edad|ya cumpli (los )?18|ya los cumpli)/.test(norm)) {
    return "mayor";
  }
  // Extractor de número: SOLO si NO hay contexto de "cumplir en el futuro" (para
  // no leer el "18" de "el año que viene cumplo los 18" como edad actual).
  if (!cumplirFuturo) {
    const num = norm.match(/\b(\d{1,2})\b/);
    if (num) {
      const n = parseInt(num[1], 10);
      if (n >= 10 && n <= 17) return "menor";
      if (n >= 18 && n <= 99) return "mayor";
    }
  } else {
    // Hay "cumplir futuro" + un número en rango de edad menor (p.ej. "cumplo 17"):
    // tratarlo como menor; si el número fuese >=18 con negación previa ya salió
    // arriba como menor, así que aquí cualquier número adolescente confirma menor.
    const num = norm.match(/\b(\d{1,2})\b/);
    if (num) {
      const n = parseInt(num[1], 10);
      if (n >= 10 && n <= 17) return "menor";
    }
  }
  if (/^(no|nop|nel|nah|que va)\b/.test(norm)) return "menor";
  if (
    /^(si+|sip|claro|por supuesto|obvio|asi es|correcto|confirmo|afirmativo|yes|dale|aja|ajadale|de una)\b/.test(norm) ||
    /(soy mayor|mayor de edad|tengo mas de 18|ya los (tengo|cumpli)|si tengo|si los tengo|si soy mayor|claro que si|por su puesto)/.test(norm)
  ) return "mayor";
  return null;
}

function esAfirmativoCierre(norm: string): boolean {
  return /^(si+|sip|dale|de una|ok|okey|okay|va|vale|listo|claro|perfecto|por supuesto|obvio|bueno|hagamoslo|quiero|me animo|empecemos|comencemos|arranquemos)\b/.test(norm) ||
    /(como pago|donde pago|como hago (el|para|con el) ?pago|como hago para pagar|como hago el pago|como realizo el pago|como puedo pagar|como se paga|por donde pago|los datos|datos de pago|pasame|quiero pagar|quiero empezar|quiero comprar|si quiero|paso los datos)/.test(norm);
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
  return /(como pago|donde pago|como hago (el|para|con el) ?pago|como hago para pagar|como hago el pago|como realizo el pago|como puedo pagar|como se paga|por donde pago|los datos|datos de pago|pasame|quiero pagar|quiero comprar|paso los datos)/.test(norm);
}

// ============================== OpenAI ==============================

// Los modelos se leen de musa_settings clave "modelos"
// ({"conversacion": ..., "clasificador": ...}); estos son solo el fallback
// si la clave faltara o viniera incompleta.
const MODELO_CONVERSACION_DEFAULT = "gpt-5.1";
const MODELO_CLASIFICADOR_DEFAULT = "gpt-5-mini";

/**
 * Recipiente opcional para instrumentar el consumo de tokens de OpenAI. openaiChat
 * (y las llamadas de visión/transcripción) lo rellenan en cada éxito; el llamador
 * decide si lo persiste en el detalle de un evento que YA escribe. Es best-effort:
 * si la respuesta no trae usage, queda como null y no se rompe nada.
 */
type UsageOut = {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    [k: string]: unknown;
  } | null;
  model?: string | null;
};

async function openaiChat(
  // deno-lint-ignore no-explicit-any
  payload: Record<string, any>,
  timeoutMs: number,
  usageOut?: UsageOut,
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
        if (usageOut) {
          usageOut.usage = j?.usage ?? null;
          usageOut.model = j?.model ?? body?.model ?? null;
        }
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

/**
 * CAMBIO 4 (Fase 4) — transcripción de notas de voz.
 * Descarga el audio de la nota (MediaUrl0) y lo transcribe con OpenAI.
 *  a) Descarga: si la URL es de api.twilio.com usa Basic auth con las credenciales
 *     de Twilio; si no (p.ej. una URL del bucket en modo prueba) hace fetch directo.
 *  b) Transcribe: POST multipart a /v1/audio/transcriptions con gpt-4o-mini-transcribe,
 *     idioma es. Timeout de 15 s vía AbortController.
 * Devuelve el texto transcrito (trim, no vacío) o null si algo falla / queda vacío.
 */
async function transcribirNotaVoz(
  mediaUrl: string,
  contentType: string,
  usageOut?: UsageOut,
): Promise<string | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey || !mediaUrl) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    // a) Descargar los bytes del audio.
    const dlHeaders: Record<string, string> = {};
    if (/api\.twilio\.com/i.test(mediaUrl)) {
      const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const token = Deno.env.get("TWILIO_AUTH_TOKEN");
      if (sid && token) {
        dlHeaders["Authorization"] = "Basic " + btoa(`${sid}:${token}`);
      }
    }
    const dl = await fetch(mediaUrl, { headers: dlHeaders, signal: ctrl.signal });
    if (!dl.ok) {
      console.error("transcribir descarga", dl.status, (await dl.text()).slice(0, 200));
      return null;
    }
    const bytes = await dl.arrayBuffer();
    if (!bytes || bytes.byteLength === 0) return null;

    // OpenAI usa la EXTENSIÓN del filename y el MIME del blob para decidir el
    // formato: deben coincidir con los bytes reales. WhatsApp/Twilio mandan
    // audio/ogg; en pruebas mandamos audio/mpeg. Derivamos ambos del content-type
    // que reportó Twilio (con fallback al header de la descarga y, por último, ogg).
    const ct = (contentType || dl.headers.get("content-type") || "audio/ogg")
      .split(";")[0].trim().toLowerCase();
    const EXT_POR_MIME: Record<string, string> = {
      "audio/ogg": "ogg",
      "audio/opus": "ogg",
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/mp4": "mp4",
      "audio/m4a": "m4a",
      "audio/x-m4a": "m4a",
      "audio/aac": "m4a",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/webm": "webm",
      "audio/amr": "amr",
    };
    const ext = EXT_POR_MIME[ct] ?? "ogg";
    const blobType = ct.startsWith("audio/") ? ct : "audio/ogg";
    const blob = new Blob([bytes], { type: blobType });

    // b) Transcribir con OpenAI.
    const modeloTranscripcion = "gpt-4o-mini-transcribe";
    const fd = new FormData();
    fd.append("file", blob, `nota.${ext}`);
    fd.append("model", modeloTranscripcion);
    fd.append("language", "es");
    // response_format=json hace que los modelos gpt-4o-*-transcribe devuelvan el
    // campo usage (input/output/total tokens). Best-effort: si no llega, null.
    fd.append("response_format", "json");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: fd,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error("transcribir openai", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const j = await res.json();
    if (usageOut) {
      usageOut.usage = j?.usage ?? null;
      usageOut.model = modeloTranscripcion;
    }
    const texto = (j?.text ?? "").trim();
    return texto.length > 0 ? texto : null;
  } catch (e) {
    console.error("transcribir err", String(e).slice(0, 200));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ============================== verificación de pagos ==============================

/**
 * Descarga los bytes de una media. Si la URL es de api.twilio.com usa Basic auth
 * con las credenciales de Twilio; si no (p.ej. una URL del bucket en modo prueba)
 * hace fetch directo. Devuelve {bytes, contentType} o null si falla.
 */
async function descargarMedia(
  mediaUrl: string,
  timeoutMs = 20000,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  if (!mediaUrl) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {};
    if (/api\.twilio\.com/i.test(mediaUrl)) {
      const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const token = Deno.env.get("TWILIO_AUTH_TOKEN");
      if (sid && token) headers["Authorization"] = "Basic " + btoa(`${sid}:${token}`);
    }
    const dl = await fetch(mediaUrl, { headers, signal: ctrl.signal });
    if (!dl.ok) {
      console.error("descargarMedia", dl.status, (await dl.text()).slice(0, 160));
      return null;
    }
    const bytes = await dl.arrayBuffer();
    if (!bytes || bytes.byteLength === 0) return null;
    const contentType = (dl.headers.get("content-type") || "image/jpeg")
      .split(";")[0].trim().toLowerCase();
    return { bytes, contentType };
  } catch (e) {
    console.error("descargarMedia err", String(e).slice(0, 160));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** sha256 hex de unos bytes (huella de la imagen para dedupe). */
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** ArrayBuffer -> base64 (para el data: URL que se manda al modelo de visión). */
function bytesABase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(bin);
}

const BUCKET_CAPTURAS = "musa-capturas";

/** extensión de archivo a partir del content-type de la imagen (fallback jpg). */
function extDeContentType(ct: string): string {
  const m = (ct || "").split(";")[0].trim().toLowerCase();
  const TABLA: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  return TABLA[m] ?? "jpg";
}

/**
 * Sube los bytes del comprobante al bucket PRIVADO musa-capturas y devuelve el
 * storage_key estable (no expira, requiere auth admin para leerse). Key:
 *   comprobantes/<telefono sin +>/<short_id|fase>-<phash corto>.<ext>
 * Best-effort: si la subida falla, loguea y devuelve null (el llamador conserva
 * al menos el phash y nunca rompe el flujo del lead).
 */
async function subirComprobante(
  admin: Admin,
  leadPhone: string,
  prefijo: string,
  phash: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<string | null> {
  try {
    const telSeguro = (leadPhone || "").replace(/[^\d]/g, "") || "desconocido";
    const ext = extDeContentType(contentType);
    const phashCorto = (phash || "").slice(0, 16) || "sinhash";
    const key = `comprobantes/${telSeguro}/${prefijo}-${phashCorto}.${ext}`;
    const ct = contentType.startsWith("image/") ? contentType : "image/jpeg";
    const blob = new Blob([bytes], { type: ct });
    const { data, error } = await admin.storage
      .from(BUCKET_CAPTURAS)
      .upload(key, blob);
    if (error) {
      console.error("subirComprobante", JSON.stringify(error).slice(0, 200));
      return null;
    }
    return (data?.key as string) ?? key;
  } catch (e) {
    console.error("subirComprobante err", String(e).slice(0, 200));
    return null;
  }
}

/**
 * URL del objeto del bucket PRIVADO musa-capturas (para que el operador abra la
 * captura). Es la ruta REST estándar; requiere auth admin para descargarse.
 */
function urlComprobante(storageKey: string | null): string | null {
  const base = (Deno.env.get("INSFORGE_BASE_URL") ?? "").replace(/\/+$/, "");
  if (!base || !storageKey) return null;
  if (/^https?:\/\//i.test(storageKey)) return storageKey;
  const encKey = storageKey.split("/").map(encodeURIComponent).join("/");
  return `${base}/api/storage/buckets/${BUCKET_CAPTURAS}/objects/${encKey}`;
}

type DatosComprobante = {
  metodo: string | null;
  monto: number | null;
  moneda: string | null;
  fecha: string | null;
  hora: string | null;
  numero_referencia: string | null;
  destino: string | null;
  // TODOS los números/cuentas/teléfonos/llaves visibles en el comprobante, en
  // crudo (incluye enmascarados y completos). Sirve para reconocer NUESTRO número
  // aunque la visión elija otro como 'destino' principal.
  numeros_detectados: string[];
  nombre_destinatario: string | null;
  banco_o_app: string | null;
  estado_operacion: string | null;
  es_captura_completa: boolean;
  senales_manipulacion: string[];
  confidence: { monto?: number; referencia?: number; destino?: number; fecha?: number };
};

/**
 * VISIÓN: extrae los datos del comprobante con el modelo 'modelos'.vision.
 * La imagen va como data: URL base64. Devuelve el JSON estricto parseado o null.
 */
async function extraerComprobanteVision(
  cfg: Cfg,
  dataUrl: string,
  usageOut?: UsageOut,
): Promise<DatosComprobante | null> {
  const sistema =
    "Eres un verificador de comprobantes de pago (capturas de pantalla de apps bancarias / Pago Móvil / Nequi / Bancolombia / Bre-B / transferencias). " +
    "Analiza la imagen y responde SOLO un JSON valido, sin texto extra ni markdown, con EXACTAMENTE esta forma:\n" +
    '{"metodo":string|null,"monto":number|null,"moneda":"VES"|"COP"|"USD"|null,"fecha":"YYYY-MM-DD"|null,"hora":string|null,' +
    '"numero_referencia":string|null,"destino":string|null,"numeros_detectados":string[],"nombre_destinatario":string|null,"banco_o_app":string|null,' +
    '"estado_operacion":"exitosa"|"en_proceso"|"programada"|"fallida"|"ilegible",' +
    '"es_captura_completa":boolean,"senales_manipulacion":string[],' +
    '"confidence":{"monto":number,"referencia":number,"destino":number,"fecha":number}}\n' +
    "Reglas: 'destino' = el telefono, numero de cuenta o llave que RECIBE el dinero (no el emisor). " +
    "'numeros_detectados' = TODOS los numeros, cuentas bancarias, telefonos y llaves visibles en el comprobante, copiados TAL CUAL aparecen (en crudo), incluyendo tanto los enmascarados (ej: '313 *** 5761') como los completos (ej: 'Numero Nequi 3223565761'). Incluye emisor, receptor, numero de cuenta, telefono, cedula, llaves. No omitas ninguno y no inventes; si no hay numeros, devuelve []. " +
    "'monto' es solo el numero (sin simbolos ni separadores de miles). " +
    "moneda: VES si es bolivares/Bs, COP si es pesos colombianos, USD si dolares. " +
    "estado_operacion='exitosa' solo si dice claramente exitosa/aprobada/completada/realizada. " +
    "es_captura_completa=false si esta recortada, borrosa o faltan datos clave. " +
    "senales_manipulacion: lista cualquier indicio de edicion/photoshop/fuentes desalineadas/montaje (vacio si no hay). " +
    "confidence: 0..1 que tan seguro estas de cada campo (0 si no lo ves).";
  const modelo = cfg.modelos?.vision || "gpt-5.4-mini-2026-03-17";
  const contenido = await openaiChat({
    model: modelo,
    messages: [
      { role: "system", content: sistema },
      {
        role: "user",
        content: [
          { type: "text", text: "Extrae los datos de este comprobante." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 500,
  }, 20000, usageOut);
  if (!contenido) return null;
  try {
    const limpio = contenido.replace(/```json|```/g, "").trim();
    const m = limpio.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    return {
      metodo: j.metodo ?? null,
      monto: typeof j.monto === "number" ? j.monto : (j.monto ? Number(String(j.monto).replace(/[^\d.]/g, "")) || null : null),
      moneda: j.moneda ?? null,
      fecha: j.fecha ?? null,
      hora: j.hora ?? null,
      numero_referencia: j.numero_referencia != null ? String(j.numero_referencia) : null,
      destino: j.destino != null ? String(j.destino) : null,
      numeros_detectados: Array.isArray(j.numeros_detectados)
        ? j.numeros_detectados.map((x: unknown) => String(x)).filter((s: string) => s.trim().length > 0)
        : [],
      nombre_destinatario: j.nombre_destinatario ?? null,
      banco_o_app: j.banco_o_app ?? null,
      estado_operacion: j.estado_operacion ?? null,
      es_captura_completa: j.es_captura_completa === true,
      senales_manipulacion: Array.isArray(j.senales_manipulacion) ? j.senales_manipulacion.filter(Boolean) : [],
      confidence: typeof j.confidence === "object" && j.confidence ? j.confidence : {},
    };
  } catch (e) {
    console.error("vision parse", String(e).slice(0, 160));
    return null;
  }
}

/** solo dígitos (para comparar referencias y destinos sin formato). */
function soloDigitos(s: string | null): string {
  return (s || "").replace(/\D/g, "");
}

/**
 * Lista de NUESTROS destinos (solo dígitos) según las cuentas de settings:
 * Pago Móvil + cuenta BDV (VE) y Nequi + Bancolombia + Bre-B (CO).
 */
function nuestrosDestinos(cfg: Cfg): string[] {
  const set = new Set<string>();
  const add = (v?: string) => { const d = soloDigitos(v ?? null); if (d.length >= 6) set.add(d); };
  const ve = cfg.cuentasVe ?? {};
  add(ve.pago_movil?.telefono);
  add(ve.cuenta?.numero);
  const co = cfg.cuentasCo ?? {};
  // deno-lint-ignore no-explicit-any
  const c = co as any;
  add(c.nequi?.numero);
  add(c.bancolombia?.numero);
  add(c.breb?.llave);
  return Array.from(set);
}

/** precio esperado para la moneda del comprobante. */
function precioEsperado(cfg: Cfg, moneda: string | null): number | null {
  switch ((moneda || "").toUpperCase()) {
    case "COP": return Number(cfg.precio?.cop ?? 33000);
    case "VES": return Number(cfg.precioBsHoy?.bs ?? 7400);
    case "USD": return Number(cfg.precio?.usd ?? 9);
    default: return null;
  }
}

type Decision = {
  accion: "AUTO_APROBAR" | "COLA_HUMANA" | "PEDIR_REENVIO";
  motivo: string | null;
};

/**
 * VALIDACIONES EN CÓDIGO (no en el LLM). Recibe los datos extraídos + el estado
 * del lead (primer pago) y decide la acción. NO toca la BD: solo decide. El dedupe
 * por referencia/phash y el circuit breaker se evalúan aparte (necesitan la BD).
 */
function decidirComprobante(
  cfg: Cfg,
  d: DatosComprobante,
  esPrimerPagoAprobado: boolean,
): Decision {
  // 1) captura incompleta / ilegible -> pedir reenvío (suave, no notifica aún)
  if (!d.es_captura_completa || d.estado_operacion === "ilegible") {
    return { accion: "PEDIR_REENVIO", motivo: "captura_incompleta" };
  }
  // 2) estado no exitoso -> cola humana
  if (d.estado_operacion && ["programada", "en_proceso", "fallida"].includes(d.estado_operacion)) {
    return { accion: "COLA_HUMANA", motivo: "estado_" + d.estado_operacion };
  }
  // 3) monto / moneda
  const esperado = precioEsperado(cfg, d.moneda);
  if (esperado == null || d.monto == null) {
    return { accion: "COLA_HUMANA", motivo: "monto_o_moneda_ilegible" };
  }
  if (d.monto < esperado * 0.98) {
    return { accion: "COLA_HUMANA", motivo: "pago_incompleto" };
  }
  if (d.monto > esperado * 3) {
    return { accion: "COLA_HUMANA", motivo: "monto_excesivo" };
  }
  // 4) destino debe coincidir con uno de los nuestros.
  // Candidatos = el campo 'destino' principal + TODOS los numeros_detectados,
  // cada uno normalizado a solo dígitos. Coincide si NUESTRO número completo
  // (su longitud real: 10 Nequi/Bre-B, 11 Pago Móvil/Bancolombia, 20 BDV)
  // aparece como coincidencia EXACTA o como substring completo dentro de algún
  // candidato. NO se usa coincidencia por sufijo corto laxo: exigimos que el
  // número entero aparezca literalmente. Si ninguno de nuestros números
  // completos está presente -> destino_no_coincide -> cola.
  const destinos = nuestrosDestinos(cfg);
  const candidatos = [d.destino, ...(d.numeros_detectados ?? [])]
    .map((s) => soloDigitos(s))
    .filter((s) => s.length >= 6);
  const coincide = destinos.length > 0 &&
    candidatos.some((cand) => destinos.some((n) => cand === n || cand.includes(n)));
  if (!coincide) {
    return { accion: "COLA_HUMANA", motivo: "destino_no_coincide" };
  }
  // 5) fecha: futura o > 3 días atrás -> cola (null no bloquea)
  if (d.fecha) {
    const f = new Date(d.fecha + "T00:00:00Z").getTime();
    if (!Number.isNaN(f)) {
      const hoy = Date.now();
      if (f > hoy + 24 * 60 * 60 * 1000) return { accion: "COLA_HUMANA", motivo: "fecha_futura" };
      if (hoy - f > 3 * 24 * 60 * 60 * 1000) return { accion: "COLA_HUMANA", motivo: "fecha_vieja" };
    }
  }
  // 6) confidence
  const c = d.confidence ?? {};
  if ((c.monto ?? 0) < 0.85 || (c.referencia ?? 0) < 0.85 || (c.destino ?? 0) < 0.85) {
    return { accion: "COLA_HUMANA", motivo: "baja_confianza" };
  }
  // 7) señales de manipulación
  if (d.senales_manipulacion && d.senales_manipulacion.length > 0) {
    return { accion: "COLA_HUMANA", motivo: "senales_manipulacion" };
  }
  // 8) solo si es el PRIMER pago aprobado de ese lead
  if (!esPrimerPagoAprobado) {
    return { accion: "COLA_HUMANA", motivo: "lead_ya_tiene_pago" };
  }
  return { accion: "AUTO_APROBAR", motivo: null };
}

/**
 * CIRCUIT BREAKER: si en la última hora hubo >=10 auto-aprobaciones, o >=3 del
 * mismo banco_o_app en 10 min -> forzar cola. Devuelve true si debe forzarse.
 */
async function circuitBreakerActivo(admin: Admin, bancoApp: string | null): Promise<boolean> {
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: aprob } = await admin.database
    .from("musa_payments")
    .select("id, datos_extraidos, resolved_at")
    .eq("status", "aprobado")
    .gte("resolved_at", haceUnaHora);
  const lista = aprob ?? [];
  if (lista.length >= 10) return true;
  if (bancoApp) {
    const hace10 = Date.now() - 10 * 60 * 1000;
    const mismoBanco = lista.filter((p: { datos_extraidos?: { banco_o_app?: string }; resolved_at?: string }) => {
      const t = p.resolved_at ? new Date(p.resolved_at).getTime() : 0;
      const b = p.datos_extraidos?.banco_o_app ?? null;
      return t >= hace10 && b && String(b).toLowerCase() === bancoApp.toLowerCase();
    });
    if (mismoBanco.length >= 3) return true;
  }
  return false;
}

/**
 * NOTIFICAR AL DUEÑO. Para +9999 (operador de prueba) NO llama a Twilio: registra
 * evento 'operador_notificado' con el payload. Para real: Twilio REST (texto +,
 * si hay imagen, un segundo mensaje con MediaUrl). El número del lead a notificar
 * NO recibe nada aquí (esto va al operador).
 */
async function notificarOperador(
  admin: Admin,
  cfg: Cfg,
  texto: string,
  imagenUrl: string | null,
): Promise<void> {
  const operador = (cfg.operador?.whatsapp || "").trim();
  if (!operador) {
    console.error("notificarOperador: sin operador.whatsapp configurado");
    return;
  }
  const esPrueba = operador.startsWith("+9999");
  if (esPrueba) {
    await registrarEvento(admin, operador, "operador_notificado", {
      texto,
      imagen_url: imagenUrl,
    });
    return;
  }
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886";
  if (!sid || !token) {
    console.error("notificarOperador: faltan credenciales Twilio");
    await registrarEvento(admin, operador, "operador_notificado", { texto, imagen_url: imagenUrl, sin_twilio: true });
    return;
  }
  const enviar = async (params: Record<string, string>) => {
    try {
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
      if (!res.ok) console.error("notificarOperador twilio", res.status, (await res.text()).slice(0, 160));
    } catch (e) {
      console.error("notificarOperador err", String(e).slice(0, 160));
    }
  };
  await enviar({ From: from, To: `whatsapp:${operador}`, Body: texto });
  if (imagenUrl) {
    await enviar({ From: from, To: `whatsapp:${operador}`, MediaUrl: imagenUrl });
  }
  await registrarEvento(admin, operador, "operador_notificado", { texto, imagen_url: imagenUrl });
}

/**
 * ENTREGA (S10): marca pagado=true, estado_funnel='S10_ENTREGA' y envía en 2-3
 * mensajes (NO sueltos): BLOQUE 1 (13 módulos), BLOQUE 2 (4 bonos + PDF Plan de
 * Acción 7 Días), y un mensaje de bienvenida + primer paso. Evento 'entrega_realizada'.
 */
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

  await actualizarLead(admin, lead, { pagado: true });
  await transicion(admin, lead, "S10_ENTREGA");
  await enviarMensajes(admin, lead, [
    bloque1.join("\n"),
    bloque2.join("\n"),
    bienvenida,
  ]);
  await registrarEvento(admin, lead.phone, "entrega_realizada", {
    modulos: modulos.length,
    bonos: n - 1,
    tiene_plan: !!plan,
  });
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
      ["S00_LLEGADA", "S04_GATE18"].includes(lead.estado_funnel);
    const guardiaGate = preGate
      ? "\nREGLA DURA EN ESTE MENSAJE: este lead AÚN NO ha confirmado ser mayor de 18. " +
        'Un "ok", "dale", "jaja" o cualquier respuesta ambigua NO cuenta como confirmación. ' +
        "PROHIBIDO darle la edad por confirmada, decir que \"seguimos\" con la venta, ofrecer métodos o datos de pago, o avanzar al cierre. " +
        "Responde su duda solo con los HECHOS CERRADOS y cierra SIEMPRE volviendo a preguntar si ya tiene 18 años o más."
      : "";
    // Guardia de DISPONIBILIDAD de pago: los HECHOS CERRADOS listan métodos VE y CO,
    // pero alguno puede no estar operativo hoy (cuentas provisional/placeholder). El
    // GPT JAMÁS debe prometer "te paso los datos" de un método que el sistema no
    // puede entregar. Si el lead pide un método no disponible => decir que lo
    // confirmas con el equipo (eso dispara escalado real en responderConGPT).
    const disp = metodosPagoDisponibles(cfg);
    const noDisp: string[] = [];
    if (!disp.ve) noDisp.push("Venezuela (Pago Móvil / transferencia Banco de Venezuela)");
    if (!disp.co) noDisp.push("Colombia (Nequi / Bancolombia / Bre-B)");
    const guardiaPago = noDisp.length
      ? `\nREGLA DURA DE PAGO EN ESTE MENSAJE: hoy NO hay datos de pago operativos para: ${noDisp.join("; ")}. ` +
        "Para esos métodos está TERMINANTEMENTE PROHIBIDO decir \"te paso los datos\", \"están disponibles\", dar números/cédula/titular o pedir el comprobante. " +
        "Si el lead pide uno de esos métodos, NO improvises: dile con calidez que confirmas con el equipo los datos actualizados de esa vía y que le escribes enseguida por aquí (no menciones la palabra placeholder ni nada interno)."
      : "";
    const system = resolverPlaceholders(cfg.gptSystem?.prompt ?? "", lead, cfg) +
      `\n\nETAPA ACTUAL: ${lead.estado_funnel} | PREGUNTA PENDIENTE QUE DEBES RETOMAR AL FINAL: ${preguntaPendiente}` +
      guardiaGate + guardiaPago;
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

/** mensaje saliente: texto plano o texto+media (video del avatar) */
type MensajeOut = string | { body?: string; mediaUrl?: string; mediaType?: string };

/**
 * CAMBIO 5 — typing indicator de WhatsApp (beta). Marca "escribiendo…" para el
 * lead antes de cada mensaje saliente. Usa el SID del mensaje ENTRANTE actual.
 * Devuelve {success:true}; cualquier error se ignora (es beta).
 */
async function enviarTyping(
  sid: string,
  token: string,
  inboundSid: string,
): Promise<void> {
  if (!inboundSid) return;
  try {
    await fetch("https://messaging.twilio.com/v2/Indicators/Typing.json", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${sid}:${token}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ messageId: inboundSid, channel: "whatsapp" }),
    });
  } catch (e) {
    console.error("typing err", String(e).slice(0, 120));
  }
}

/**
 * Envía mensajes del bot: SIEMPRE persiste en musa_messages (incluido media_url/
 * media_type, también en modo prueba +9999*) y actualiza last_out_at; solo llama
 * a Twilio para números reales (no +9999*) con credenciales presentes. Cuando el
 * mensaje lleva media, agrega MediaUrl al POST de Twilio.
 *
 * CAMBIO 5 — sensación humana: antes de CADA mensaje saliente dispara el typing
 * indicator (solo números reales) y espera calcularRetardoMs(texto). Para +9999
 * NO llama a Twilio ni duerme, pero registra el retardo_ms que se HABRÍA aplicado
 * en el evento 'mensaje_enviado' para poder verificar la lógica.
 */
async function enviarMensajes(admin: Admin, lead: Lead, textos: MensajeOut[]): Promise<void> {
  const limpios = textos
    .map((t) =>
      typeof t === "string"
        ? { body: t.trim(), mediaUrl: undefined as string | undefined, mediaType: undefined as string | undefined }
        : { body: (t.body ?? "").trim(), mediaUrl: t.mediaUrl, mediaType: t.mediaType }
    )
    .filter((t) => t.body.length > 0 || !!t.mediaUrl);
  if (limpios.length === 0) return;
  const esPrueba = lead.phone.startsWith("+9999");
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886";
  const enviarReal = !esPrueba && !!sid && !!token;
  const inboundSid = (lead._inbound_sid as string | null) ?? "";

  for (let i = 0; i < limpios.length; i++) {
    const item = limpios[i];
    // CAMBIO 5 — retardo natural proporcional al texto (typing antes de CADA msg).
    const retardoMs = calcularRetardoMs(item.body || "");

    if (enviarReal) {
      await enviarTyping(sid!, token!, inboundSid);
      await sleep(retardoMs);
    } else {
      // modo prueba: sleep simbólico para no alargar las pruebas
      await sleep(0);
      await registrarEvento(admin, lead.phone, "mensaje_enviado", {
        retardo_ms: retardoMs,
        len: (item.body || "").length,
        tiene_media: !!item.mediaUrl,
        estado_funnel: lead.estado_funnel,
      });
    }

    const { error } = await admin.database.from("musa_messages").insert([{
      lead_phone: lead.phone,
      direction: "out",
      body: item.body || null,
      media_url: item.mediaUrl ?? null,
      media_type: item.mediaUrl ? (item.mediaType ?? "video/mp4") : null,
      estado_funnel: lead.estado_funnel,
    }]);
    if (error) console.error("insert out", JSON.stringify(error));

    if (enviarReal) {
      try {
        const params: Record<string, string> = {
          From: from,
          To: `whatsapp:${lead.phone}`,
        };
        if (item.body) params.Body = item.body;
        if (item.mediaUrl) params.MediaUrl = item.mediaUrl;
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

/**
 * Inserta una fila musa_payments con un short_id único (reintenta ante choque del
 * UNIQUE de short_id). Devuelve {id, shortId} o null si se agotaron los intentos.
 * `fila` trae el resto de columnas (status, metodo, monto, etc.); short_id y
 * lead_phone se fijan aquí. Si choca otro UNIQUE (metodo+ref) lo propaga al caller.
 */
async function insertarPago(
  admin: Admin,
  phone: string,
  fila: Record<string, unknown>,
): Promise<{ id: number; shortId: string } | { dupeRef: true } | null> {
  for (let intento = 0; intento < 6; intento++) {
    const shortId = String(Math.floor(1000 + Math.random() * 9000));
    const { data, error } = await admin.database.from("musa_payments")
      .insert([{ lead_phone: phone, short_id: shortId, ...fila }])
      .select("id")
      .maybeSingle();
    if (!error) return { id: data?.id, shortId };
    const err = JSON.stringify(error);
    if (err.includes("23505")) {
      // ¿choque de short_id o de la ref única (metodo+ref)?
      if (err.includes("ref_unica") || err.includes("ref_normalizada")) return { dupeRef: true };
      // short_id duplicado: reintentar con otro
      continue;
    }
    throw new Error("insert musa_payments: " + err);
  }
  console.error("insertarPago: short_id agotado tras 6 intentos");
  return null;
}

// ============================== piezas de copy ==============================

const PREGUNTA_PENDIENTE: Record<string, string> = {
  S04_GATE18: "¿Me confirmas que ya tienes 18 años o más?",
  S06_CIERRE: "¿Te paso los datos de pago? 😊",
  S08_ESPERA_CAPTURA: "Cuando tengas la captura del comprobante, envíamela por aquí 📸",
  S09_VERIFICACION: "Seguimos verificando tu pago, tu acceso queda asegurado ✅",
  S10_ENTREGA: "¿En qué te puedo ayudar con tu acceso? 😊",
};

function preguntaDeEtapa(estado: string): string {
  return PREGUNTA_PENDIENTE[estado] ?? "¿En qué te puedo ayudar? 😊";
}

/** CAMBIO 1 — sin país: el precio rápido SIEMPRE muestra ambas referencias. */
function mensajePrecioRapido(lead: Lead, cfg: Cfg): string {
  const bs = formatMiles(Number(cfg.precioBsHoy?.bs ?? 7400));
  const cop = formatMiles(Number(cfg.precio?.cop ?? 33000));
  return `El curso completo cuesta *9 USD* (equivalente a *${bs} Bs* o *${cop} COP* a la tasa de hoy), pago único 💥 Incluye 13 módulos + 4 bonos + el bono Plan de Acción 7 Días, con acceso de por vida.`;
}

/** CAMBIO 1 — S05 (precio con AMBAS monedas) + S06 cierre, listos para enviar */
function mensajesPrecioYCierre(lead: Lead, cfg: Cfg): string[] {
  const s05 = etapa(cfg, "S05_PRECIO");
  const s06 = etapa(cfg, "S06_CIERRE");
  // El copy de S05 ya trae las dos monedas juntas; no se filtra por país.
  const precio = s05.mensajes[0];
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
// CAMBIO 4 — respuesta cálida a una nota de voz (no avanza ni clasifica).
const MSG_NOTA_VOZ =
  "¡Ay, gracias por tu nota de voz! 🙈 Por ahora solo puedo leer mensajes de texto. ¿Me escribes tu mensajito y seguimos? 💜";
// FASE 4 (pagos) — acuses al lead tras recibir el comprobante.
const MSG_PAGO_REENVIO =
  "¡Gracias! 🙏 La captura me quedó un poquito incompleta o no se ve clara. ¿Me reenvías el comprobante completo (que se vean el monto, la fecha y el número de referencia)? Así te confirmo el acceso enseguida 💜";
const MSG_PAGO_VERIFICANDO_DENTRO =
  "¡Recibido! 🙌 Estoy verificando tu pago ahora mismo y te confirmo el acceso por aquí en unos minutos 💜";
const MSG_PAGO_VERIFICANDO_FUERA =
  "¡Recibido! 🙌 Estoy verificando tu pago; en cuanto el equipo lo confirme (a primera hora) te llega aquí mismo todo el acceso 💜";
const MSG_PAGO_EN_PROCESO =
  "¡Gracias! 🙏 Veo que tu operación aún aparece como en proceso o programada. Apenas tu banco la muestre como *exitosa*, reenvíamela y te activo el acceso al toque 💜";
const MSG_PAGO_RECHAZO_SUAVE =
  "¡Hola! 🙏 Revisamos tu comprobante y no pudimos confirmarlo de momento (puede ser un tema técnico de la imagen o que aún no se refleja). ¿Me reenvías el comprobante completo o me cuentas más para ayudarte? Quiero asegurarme de activarte el acceso 💜";
// Lead que YA pagó (pagado=true) y reenvía otro comprobante: no re-entregamos.
const MSG_PAGO_YA_TIENE_ACCESO =
  "¡Ya tienes tu acceso activo, no te preocupes! 💜 Tu pago ya quedó confirmado y tienes acceso de por vida a todo. Si no encuentras los enlaces o necesitas algo, me escribes con confianza 😊";

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

// ============================== momento avatar ==============================

async function buscarVideoCache(admin: Admin, slug: string): Promise<string | null> {
  const { data, error } = await admin.database
    .from("musa_videos_cache")
    .select("storage_key")
    .eq("nombre_normalizado", slug)
    .maybeSingle();
  if (error) {
    console.error("videos_cache", JSON.stringify(error));
    return null;
  }
  return data?.storage_key ?? null;
}

async function videoGenericoAzar(admin: Admin): Promise<string | null> {
  const { data, error } = await admin.database
    .from("musa_videos_cache")
    .select("storage_key")
    .in("nombre_normalizado", ["generico-1", "generico-2", "generico-3"]);
  if (error || !data?.length) {
    if (error) console.error("videos_cache genericos", JSON.stringify(error));
    return null;
  }
  return data[Math.floor(Math.random() * data.length)].storage_key;
}

/** URL pública de un objeto del bucket musa-avatares (bucket público) */
function urlPublicaVideo(cfg: Cfg, storageKey: string): string | null {
  const base = (Deno.env.get("INSFORGE_BASE_URL") ?? "").replace(/\/+$/, "");
  if (base) return `${base}/api/storage/buckets/musa-avatares/objects/${storageKey}`;
  // fallback: derivar el host de video_base_url quitando video_base_key al final
  const vb = cfg.avatar?.video_base_url;
  const vk = cfg.avatar?.video_base_key;
  if (typeof vb === "string" && typeof vk === "string" && vb.endsWith(vk)) {
    return vb.slice(0, vb.length - vk.length) + storageKey;
  }
  return null;
}

/**
 * MOMENTO AVATAR: decide qué video enviar tras S01 (UNA sola vez por lead).
 * HIT en musa_videos_cache por el slug del nombre usable → rama A (personalizado);
 * MISS con nombre usable → genérico al azar + evento 'video_pendiente' (cron
 * nocturno futuro lo generará); sin nombre usable → genérico, rama C.
 * Devuelve null si el flag está apagado, ya se envió, o no hay video disponible
 * (en ese caso se usa el puente sin_video de siempre).
 */
async function resolverMomentoAvatar(
  admin: Admin,
  lead: Lead,
  cfg: Cfg,
): Promise<{ rama: "A" | "C"; mediaUrl: string } | null> {
  if (cfg.avatar?.personalizado_activo !== true) return null;
  if (lead.avatar_enviado === true) return null; // regla dura: una sola vez por lead
  const nombre = nombreUsable(lead);
  const slug = nombre ? normalizar(nombre) : null;
  let key = slug ? await buscarVideoCache(admin, slug) : null;
  let rama: "A" | "C" = "A";
  if (!key) {
    rama = "C";
    if (slug) {
      await registrarEvento(admin, lead.phone, "video_pendiente", { nombre: slug });
    }
    key = await videoGenericoAzar(admin);
  }
  if (!key) return null;
  const mediaUrl = urlPublicaVideo(cfg, key);
  if (!mediaUrl) return null;
  return { rama, mediaUrl };
}

/**
 * CAMBIO 1 — sin filtro de país: el flujo de lead nuevo ya no pregunta país.
 * Flujo: S01 (2 msgs) + MOMENTO AVATAR (video como mensaje propio + copy de la
 * rama) o, si no aplica, el puente sin_video; y SIEMPRE al final el stack + gate
 * 18+ (antes salía la pregunta de país). Transición directa a S04_GATE18.
 */
async function flujoLeadNuevo(
  admin: Admin,
  lead: Lead,
  cfg: Cfg,
  pidePrecio: boolean,
): Promise<void> {
  const s01 = etapa(cfg, "S01_SALUDO");
  const s02 = etapa(cfg, "S02_AVATAR");
  const msgs: MensajeOut[] = [
    resolverPlaceholders(s01.mensajes[0], lead, cfg),
    resolverPlaceholders(s01.mensajes[1], lead, cfg),
  ];
  if (pidePrecio) msgs.push(mensajePrecioRapido(lead, cfg));

  // stack + gate 18+ que reemplaza la antigua pregunta de país al final
  const stackGate = mensajesStackYGate(lead, cfg);

  const avatar = await resolverMomentoAvatar(admin, lead, cfg);
  if (avatar) {
    const rama = s02.ramas?.[avatar.rama];
    const mr = rama?.mensajes ?? [];
    // mensaje propio con el video; el caption sale de mensajes[0] de la rama
    // (rama A: "[VIDEO_AVATAR]" → caption vacío; rama C: "Mira esto 👇 …")
    msgs.push({
      body: resolverPlaceholders(sinPrefijo(mr[0] ?? ""), lead, cfg),
      mediaUrl: avatar.mediaUrl,
      mediaType: "video/mp4",
    });
    msgs.push(resolverPlaceholders(sinPrefijo(mr[1] ?? ""), lead, cfg));
    // CAMBIO 1: tras el momento avatar va DIRECTO el stack + gate 18+ (sin país)
    msgs.push(...stackGate);
    await actualizarLead(admin, lead, { avatar_enviado: true });
    await registrarEvento(admin, lead.phone, "avatar_enviado", {
      rama: avatar.rama,
      media_url: avatar.mediaUrl,
    });
    await transicion(admin, lead, "S04_GATE18");
    await enviarMensajes(admin, lead, msgs);
    return;
  }

  // Sin momento avatar (flag apagado, ya enviado o sin video disponible):
  // comportamiento puente de siempre. OJO: el puente NUNCA debe prometer un
  // video/"sorpresa" que no se envía (regla 1: no inventar pruebas).
  const puente = s02.ramas?.A?.sin_video ??
    "Te cuento todo en un momento 😉 Pero primero lo importante:";
  msgs.push(resolverPlaceholders(puente, lead, cfg));
  // CAMBIO 1: directo al stack + gate 18+, sin pregunta de país
  msgs.push(...stackGate);
  await actualizarLead(admin, lead, { avatar_enviado: false });
  await transicion(admin, lead, "S04_GATE18");
  await enviarMensajes(admin, lead, msgs);
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

/**
 * Qué bloques de pago están REALMENTE disponibles hoy (cuentas no provisional y
 * sin placeholders). Lo usan el GPT libre (para no prometer un método inexistente)
 * y el guard de S08 (para escalar cuando piden un método no disponible).
 */
function metodosPagoDisponibles(cfg: Cfg): { ve: boolean; co: boolean } {
  // deno-lint-ignore no-explicit-any
  const veProvisional = (cfg.cuentasVe as any)?.provisional === true;
  // deno-lint-ignore no-explicit-any
  const coProvisional = (cfg.cuentasCo as any)?.provisional === true;
  return {
    ve: !veProvisional && textoCuentasValido(bloqueCuentasVE(cfg)),
    co: !coProvisional && textoCuentasValido(bloqueCuentasCO(cfg)),
  };
}

/**
 * El lead pide explícitamente un método/zona de pago VENEZUELA (Pago Móvil,
 * transferencia BDV, "datos de Venezuela", "en bolívares cómo pago", etc.).
 */
function pideMetodoVE(norm: string): boolean {
  return /\b(pago movil|pagomovil|movil|banco de venezuela|bdv|en bolivares|datos de venezuela|venezuela|metodo de venezuela)\b/.test(norm) &&
    /(pago|paga|pagar|transfer|datos|cuenta|movil|bolivares|metodo|deposito)/.test(norm);
}

/**
 * El lead pide explícitamente un método/zona de pago COLOMBIA (Nequi,
 * Bancolombia, Bre-B, "datos de Colombia", "en pesos cómo pago", etc.).
 */
function pideMetodoCO(norm: string): boolean {
  return /\b(nequi|bancolombia|bre-?b|breb|en pesos|datos de colombia|colombia|metodo de colombia)\b/.test(norm) &&
    /(pago|paga|pagar|transfer|datos|cuenta|pesos|metodo|deposito|nequi|bancolombia|breb|bre-b)/.test(norm);
}

/**
 * CAMBIO 1 — sin país: los datos de pago muestran TODOS los métodos juntos
 * (bloque Venezuela + bloque Colombia) bajo un encabezado tipo "paga por el medio
 * que más te sirva". Solo se incluyen los bloques cuyas cuentas sean VÁLIDAS
 * (no provisional, sin PENDIENTE/placeholders): la lista negra prohíbe entregar
 * cuentas placeholder. Si NINGÚN bloque es enviable, se escala a humano.
 */
async function enviarDatosPago(admin: Admin, lead: Lead, cfg: Cfg): Promise<void> {
  const s07 = etapa(cfg, "S07_DATOS_PAGO");
  // deno-lint-ignore no-explicit-any
  const veProvisional = (cfg.cuentasVe as any)?.provisional === true;
  // deno-lint-ignore no-explicit-any
  const coProvisional = (cfg.cuentasCo as any)?.provisional === true;
  const bloqueVe = bloqueCuentasVE(cfg);
  const bloqueCo = bloqueCuentasCO(cfg);
  const veOk = !veProvisional && textoCuentasValido(bloqueVe);
  const coOk = !coProvisional && textoCuentasValido(bloqueCo);

  if (!veOk && !coOk) {
    // ningún bloque enviable: JAMÁS enviar placeholders; escalar a humano
    await actualizarLead(admin, lead, { escalado_humano: true });
    await registrarEvento(admin, lead.phone, "escalado", { motivo: "datos_pago_incompletos" });
    await enviarMensajes(admin, lead, [
      resolverPlaceholders(
        "¡Excelente decisión, {{nombre}}! 🙌 Déjame confirmar con el equipo los datos de pago actualizados y te escribo en un ratico por aquí mismo 💜",
        lead,
        cfg,
      ),
    ]);
    return;
  }

  // Encabezado + bloques válidos (VE primero, luego CO) en UN solo mensaje.
  const partes: string[] = [resolverPlaceholders(sinPrefijo(s07.mensajes[0]), lead, cfg)];
  if (veOk) {
    partes.push("\n🇻🇪 *Venezuela*\n" + resolverPlaceholders("{{cuentas_venezuela}}", lead, cfg));
  }
  if (coOk) {
    partes.push("\n🇨🇴 *Colombia*\n" + resolverPlaceholders("{{cuentas_colombia}}", lead, cfg));
  }
  partes.push(resolverPlaceholders(sinPrefijo(s07.mensajes[1]), lead, cfg));
  await transicion(admin, lead, "S08_ESPERA_CAPTURA");
  await enviarMensajes(admin, lead, [partes.join("\n").trim()]);
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

/**
 * FASE 4 — procesa un comprobante (imagen) recibido en S08: descarga + hash +
 * visión + validaciones + dedupe + circuit breaker, y según la decisión:
 * AUTO_APROBAR (aprobar + entregar), COLA_HUMANA (revision + notificar al dueño +
 * acuse de "verificando") o PEDIR_REENVIO (revision sin notificar + pedir captura).
 * NUNCA rompe el chat: ante cualquier fallo técnico cae a COLA_HUMANA.
 */
async function procesarComprobante(
  admin: Admin,
  lead: Lead,
  cfg: Cfg,
  mediaUrl: string | null,
): Promise<void> {
  // GUARD anti-doble-entrega: si el lead YA pagó (pagado=true), no reprocesamos
  // ni re-entregamos. Solo le recordamos que su acceso está activo.
  if (lead.pagado === true) {
    await registrarEvento(admin, lead.phone, "comprobante_ignorado_ya_pagado", { phone: lead.phone });
    await enviarMensajes(admin, lead, [MSG_PAGO_YA_TIENE_ACCESO]);
    return;
  }

  // Acuse de "verificando" según horario (promesa de tiempo realista).
  const dentro = dentroDeHorario(cfg);
  const acuseVerificando = dentro ? MSG_PAGO_VERIFICANDO_DENTRO : MSG_PAGO_VERIFICANDO_FUERA;

  // storage_key DEFINITIVO del comprobante en el bucket privado musa-capturas.
  // Se rellena tras subir los bytes (ya descargados para la visión). Si la subida
  // falla, queda null: NUNCA guardamos la MediaUrl de Twilio (expira y requiere
  // auth), solo el phash. Lo usan tanto el insert como la URL para el operador.
  let storageKey: string | null = null;

  // Helper: cola humana => status revision, notificar al dueño, acuse al lead.
  const aColaHumana = async (
    motivo: string,
    datos: DatosComprobante | null,
    phash: string | null,
    acuseLead: string,
  ) => {
    const fila: Record<string, unknown> = {
      metodo: datos?.metodo ? String(datos.metodo).slice(0, 60) : "por_clasificar",
      status: "revision",
      storage_key: storageKey,
      image_phash: phash,
      motivo_flag: motivo,
      datos_extraidos: datos ?? null,
      monto: datos?.monto ?? null,
      moneda: datos?.moneda ?? null,
      fecha_pago: datos?.fecha ?? null,
    };
    const ins = await insertarPago(admin, lead.phone, fila);
    const shortId = ins && "shortId" in ins ? ins.shortId : null;
    await registrarEvento(admin, lead.phone, "pago_a_revision", { short_id: shortId, motivo });
    // Notificar al dueño con los datos + la imagen (bucket privado musa-capturas).
    const imagenUrl = urlComprobante(storageKey);
    const texto =
      `🔔 Pago para revisar #${shortId ?? "?"}\n` +
      `Lead: ${lead.phone}\n` +
      `Método: ${datos?.metodo ?? "?"} | Monto: ${datos?.monto ?? "?"} ${datos?.moneda ?? ""}\n` +
      `Ref: ${datos?.numero_referencia ?? "?"} | Estado: ${datos?.estado_operacion ?? "?"}\n` +
      `Motivo: ${motivo}\n` +
      `Responde: ok ${shortId ?? "<id>"} / no ${shortId ?? "<id>"} <motivo> / ver ${shortId ?? "<id>"}`;
    await notificarOperador(admin, cfg, texto, imagenUrl);
    await transicion(admin, lead, "S09_VERIFICACION");
    await enviarMensajes(admin, lead, [acuseLead]);
  };

  try {
    // 1) descargar + hash
    const media = await descargarMedia(mediaUrl ?? "");
    if (!media) {
      // No pudimos bajar la imagen: cola humana sin datos (no rompemos).
      await aColaHumana("descarga_fallida", null, null, acuseVerificando);
      return;
    }
    const phash = await sha256Hex(media.bytes);

    // 1b) PERSISTIR la imagen: subimos los bytes ya descargados al bucket privado
    // musa-capturas con una key estable. Reemplaza guardar la MediaUrl de Twilio
    // (que expira y requiere auth). Best-effort: si falla, storageKey queda null y
    // conservamos al menos el phash. El short_id aún no existe aquí, así que el
    // prefijo de la key es el phash corto (key estable e idempotente por imagen).
    storageKey = await subirComprobante(
      admin,
      lead.phone,
      phash.slice(0, 8),
      phash,
      media.bytes,
      media.contentType,
    );

    // 2) dedupe por imagen (phash) ANTES de gastar visión
    const { data: phashHit } = await admin.database
      .from("musa_payments")
      .select("id, lead_phone")
      .eq("image_phash", phash)
      .limit(1);
    const imagenDuplicada = (phashHit ?? []).length > 0;

    // 3) visión
    const ct = media.contentType.startsWith("image/") ? media.contentType : "image/jpeg";
    const dataUrl = `data:${ct};base64,${bytesABase64(media.bytes)}`;
    const usageVision: UsageOut = {};
    const datos = await extraerComprobanteVision(cfg, dataUrl, usageVision);
    await registrarEvento(admin, lead.phone, "comprobante_vision", {
      ok: !!datos,
      datos: datos ?? null,
      phash,
      storage_key: storageKey,
      usage: usageVision.usage ?? null,
      modelo: usageVision.model ?? null,
    });
    if (!datos) {
      await aColaHumana("vision_fallida", null, phash, acuseVerificando);
      return;
    }

    if (imagenDuplicada) {
      await aColaHumana("imagen_duplicada", datos, phash, acuseVerificando);
      return;
    }

    // 4) ¿puede auto-aprobarse? Solo bloquea un pago ya APROBADO o lead.pagado=true.
    // Una fila previa en 'revision'/'rechazado' NO bloquea: una nueva captura
    // legítima sí puede auto-aprobarse mientras el lead aún no tenga acceso.
    const { data: aprobPrevios } = await admin.database
      .from("musa_payments")
      .select("id")
      .eq("lead_phone", lead.phone)
      .eq("status", "aprobado")
      .limit(1);
    const esPrimerPago = (aprobPrevios ?? []).length === 0 && lead.pagado !== true;

    // 5) decisión por código
    const decision = decidirComprobante(cfg, datos, esPrimerPago);

    if (decision.accion === "PEDIR_REENVIO") {
      // status revision pero SIN notificar aún; pedir captura completa.
      const fila: Record<string, unknown> = {
        metodo: datos.metodo ? String(datos.metodo).slice(0, 60) : "por_clasificar",
        status: "revision",
        storage_key: storageKey,
        image_phash: phash,
        motivo_flag: decision.motivo,
        datos_extraidos: datos,
        monto: datos.monto ?? null,
        moneda: datos.moneda ?? null,
        fecha_pago: datos.fecha ?? null,
      };
      const ins = await insertarPago(admin, lead.phone, fila);
      const shortId = ins && "shortId" in ins ? ins.shortId : null;
      await registrarEvento(admin, lead.phone, "pago_pedir_reenvio", { short_id: shortId, motivo: decision.motivo });
      // nos quedamos en S08 a la espera de la nueva captura
      await enviarMensajes(admin, lead, [MSG_PAGO_REENVIO]);
      return;
    }

    if (decision.accion === "AUTO_APROBAR") {
      // Circuit breaker (necesita BD) — última barrera antes de aprobar.
      if (await circuitBreakerActivo(admin, datos.banco_o_app)) {
        await registrarEvento(admin, lead.phone, "circuit_breaker", { banco: datos.banco_o_app });
        await aColaHumana("circuit_breaker", datos, phash, acuseVerificando);
        return;
      }
      // Insertar como aprobado registrando la ref única (dedupe atómico).
      const refNorm = soloDigitos(datos.numero_referencia);
      const fila: Record<string, unknown> = {
        metodo: datos.metodo ? String(datos.metodo).slice(0, 60) : "por_clasificar",
        ref_normalizada: refNorm || null,
        monto: datos.monto ?? null,
        moneda: datos.moneda ?? null,
        fecha_pago: datos.fecha ?? null,
        image_phash: phash,
        storage_key: storageKey,
        status: "aprobado",
        datos_extraidos: datos,
        resolved_at: new Date().toISOString(),
      };
      const ins = await insertarPago(admin, lead.phone, fila);
      if (ins && "dupeRef" in ins) {
        // La referencia ya existía (metodo+ref UNIQUE): no auto-aprobar, a cola.
        await aColaHumana("referencia_duplicada", datos, phash, acuseVerificando);
        return;
      }
      const shortId = ins && "shortId" in ins ? ins.shortId : null;
      await registrarEvento(admin, lead.phone, "pago_aprobado_auto", {
        short_id: shortId,
        monto: datos.monto,
        moneda: datos.moneda,
        ref: refNorm,
      });
      await entregarCurso(admin, lead, cfg);
      return;
    }

    // COLA_HUMANA: intentar registrar la ref para detectar duplicado; si choca,
    // el motivo pasa a 'referencia_duplicada'. El acuse depende del motivo.
    const refNorm = soloDigitos(datos.numero_referencia);
    const fila: Record<string, unknown> = {
      metodo: datos.metodo ? String(datos.metodo).slice(0, 60) : "por_clasificar",
      ref_normalizada: refNorm || null,
      monto: datos.monto ?? null,
      moneda: datos.moneda ?? null,
      fecha_pago: datos.fecha ?? null,
      image_phash: phash,
      storage_key: storageKey,
      status: "revision",
      motivo_flag: decision.motivo,
      datos_extraidos: datos,
    };
    const ins = await insertarPago(admin, lead.phone, fila);
    let motivo = decision.motivo ?? "revision";
    let shortId: string | null = null;
    if (ins && "dupeRef" in ins) {
      // Reintentar el insert sin ref para conservar la fila + marcar duplicado.
      motivo = "referencia_duplicada";
      const ins2 = await insertarPago(admin, lead.phone, { ...fila, ref_normalizada: null, motivo_flag: motivo });
      shortId = ins2 && "shortId" in ins2 ? ins2.shortId : null;
    } else {
      shortId = ins && "shortId" in ins ? ins.shortId : null;
    }
    // Acuse según el motivo (estado en proceso => mensaje específico).
    const acuseLead = ["estado_en_proceso", "estado_programada", "estado_fallida"].includes(motivo)
      ? MSG_PAGO_EN_PROCESO
      : acuseVerificando;
    await registrarEvento(admin, lead.phone, "pago_a_revision", { short_id: shortId, motivo });
    const imagenUrl = urlComprobante(storageKey);
    const texto =
      `🔔 Pago para revisar #${shortId ?? "?"}\n` +
      `Lead: ${lead.phone}\n` +
      `Método: ${datos.metodo ?? "?"} | Monto: ${datos.monto ?? "?"} ${datos.moneda ?? ""}\n` +
      `Ref: ${datos.numero_referencia ?? "?"} | Estado: ${datos.estado_operacion ?? "?"}\n` +
      `Motivo: ${motivo}\n` +
      `Responde: ok ${shortId ?? "<id>"} / no ${shortId ?? "<id>"} <motivo> / ver ${shortId ?? "<id>"}`;
    await notificarOperador(admin, cfg, texto, imagenUrl);
    await transicion(admin, lead, "S09_VERIFICACION");
    await enviarMensajes(admin, lead, [acuseLead]);
  } catch (e) {
    console.error("procesarComprobante err", String(e).slice(0, 300));
    // Fallo técnico: nunca dejar al lead sin respuesta ni perder el comprobante.
    try {
      await aColaHumana("error_tecnico", null, null, acuseVerificando);
    } catch (e2) {
      console.error("procesarComprobante fallback err", String(e2).slice(0, 200));
    }
  }
}

// ============================== comandos del dueño ==============================

/** normaliza un teléfono a solo dígitos con prefijo "+" para comparar operador vs lead. */
function normTel(s: string | null): string {
  const d = soloDigitos(s);
  return d ? "+" + d : "";
}

/**
 * COMANDOS DEL DUEÑO. Si el body matchea "ok|no|ver <short_id> [motivo]", procesa
 * como ADMIN (NO como lead). Confirma al dueño por su mismo canal (notificarOperador).
 * - ok <id>  -> si status revision: aprobar + entregar al lead + confirmar.
 * - no <id> <motivo> -> rechazar + acuse suave al lead + confirmar.
 * - ver <id> -> reenviar al dueño datos extraídos + imagen.
 * short_id inexistente -> "No encuentro el pago #<id>".
 */
async function procesarComandoOperador(
  admin: Admin,
  cfg: Cfg,
  cmd: "ok" | "no" | "ver",
  shortId: string,
  resto: string,
): Promise<void> {
  const { data: pago } = await admin.database
    .from("musa_payments")
    .select("*")
    .eq("short_id", shortId)
    .maybeSingle();
  if (!pago) {
    await notificarOperador(admin, cfg, `No encuentro el pago #${shortId}`, null);
    return;
  }

  if (cmd === "ver") {
    const d = pago.datos_extraidos ?? {};
    const texto =
      `📄 Pago #${shortId} (status: ${pago.status})\n` +
      `Lead: ${pago.lead_phone}\n` +
      `Método: ${pago.metodo ?? d.metodo ?? "?"} | Monto: ${pago.monto ?? d.monto ?? "?"} ${pago.moneda ?? d.moneda ?? ""}\n` +
      `Ref: ${d.numero_referencia ?? pago.ref_normalizada ?? "?"} | Estado op.: ${d.estado_operacion ?? "?"}\n` +
      `Destino: ${d.destino ?? "?"} | Banco/app: ${d.banco_o_app ?? "?"}\n` +
      `Fecha: ${pago.fecha_pago ?? d.fecha ?? "?"} | Motivo flag: ${pago.motivo_flag ?? "-"}\n` +
      `Señales: ${(d.senales_manipulacion ?? []).join(", ") || "ninguna"}\n` +
      `Confianza: ${JSON.stringify(d.confidence ?? {})}`;
    const imagenUrl = urlComprobante(pago.storage_key ?? null);
    await notificarOperador(admin, cfg, texto, imagenUrl);
    return;
  }

  if (cmd === "ok") {
    if (pago.status !== "revision") {
      await notificarOperador(admin, cfg, `El pago #${shortId} ya está en estado "${pago.status}", no lo vuelvo a procesar.`, null);
      return;
    }
    await admin.database.from("musa_payments")
      .update({ status: "aprobado", resolved_at: new Date().toISOString() })
      .eq("short_id", shortId);
    await registrarEvento(admin, pago.lead_phone, "pago_aprobado_manual", { short_id: shortId });
    // Cargar el lead para entregar.
    const { data: leadRow } = await admin.database
      .from("musa_leads").select("*").eq("phone", pago.lead_phone).maybeSingle();
    if (!leadRow) {
      await notificarOperador(admin, cfg, `Aprobé #${shortId} pero no encuentro al lead ${pago.lead_phone} para entregarle.`, null);
      return;
    }
    await entregarCurso(admin, leadRow as Lead, cfg);
    await notificarOperador(admin, cfg, `✅ Entregado a ${pago.lead_phone}`, null);
    return;
  }

  // cmd === "no"
  const motivo = (resto || "").trim() || "sin_motivo";
  await admin.database.from("musa_payments")
    .update({ status: "rechazado", motivo_flag: motivo, resolved_at: new Date().toISOString() })
    .eq("short_id", shortId);
  await registrarEvento(admin, pago.lead_phone, "pago_rechazado_manual", { short_id: shortId, motivo });
  // Acuse suave al lead (sin acusar de fraude).
  const { data: leadRow } = await admin.database
    .from("musa_leads").select("*").eq("phone", pago.lead_phone).maybeSingle();
  if (leadRow) {
    await enviarMensajes(admin, leadRow as Lead, [MSG_PAGO_RECHAZO_SUAVE]);
  }
  await notificarOperador(admin, cfg, `Marcado #${shortId} como no validado. Avisé al lead ${pago.lead_phone}.`, null);
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
    await procesarComprobante(admin, lead, cfg, mediaUrl);
    return;
  }
  if (esYaPague(norm)) {
    const s08 = etapa(cfg, "S08_ESPERA_CAPTURA");
    await enviarMensajes(admin, lead, [
      resolverPlaceholders(sinPrefijo(s08.mensajes[1]), lead, cfg),
    ]);
    return;
  }
  // GUARD de DISPONIBILIDAD (caso Yorgelis): si el lead pide explícitamente un
  // método/zona de pago que HOY no está operativo (cuentas provisional/placeholder),
  // NUNCA se delega al GPT libre (que improvisaría "te paso los datos de Venezuela"
  // sin tener cómo entregarlos): se escala a humano de verdad, con acuse cálido.
  if (norm) {
    const disp = metodosPagoDisponibles(cfg);
    const pideVE = pideMetodoVE(norm);
    const pideCO = pideMetodoCO(norm);
    if ((pideVE && !disp.ve) || (pideCO && !disp.co)) {
      await actualizarLead(admin, lead, { escalado_humano: true });
      await registrarEvento(admin, lead.phone, "escalado", {
        motivo: "metodo_pago_no_disponible",
        pide_ve: pideVE,
        pide_co: pideCO,
        disp_ve: disp.ve,
        disp_co: disp.co,
        estado_funnel: lead.estado_funnel,
      });
      await enviarMensajes(admin, lead, [
        resolverPlaceholders(
          "¡Claro, {{nombre}}! 🙌 Déjame confirmar con el equipo los datos actualizados de ese método y te los paso enseguida por aquí mismo 💜",
          lead,
          cfg,
        ),
      ]);
      return;
    }
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
    // body es mutable: si llega una nota de voz, lo reemplazamos por el texto
    // transcrito y el resto del handler lo procesa como si lo hubiera tecleado.
    let body = f("Body");
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

    // ============================== SEGURIDAD (X-Twilio-Signature) ==============================
    // X-Twilio-Signature: IMPLEMENTADO. Twilio firma cada webhook con el authToken;
    // validamos esa firma para distinguir POSTs reales de Twilio de POSTs falsificados.
    //  - BYPASS confiable: si el header X-Musa-Internal == MUSA_INTERNAL_KEY, el POST
    //    proviene de nuestro propio dashboard (musa-admin-accion) o de una prueba
    //    nuestra; se confía sin exigir firma.
    //  - Sin bypass: se calcula la validez de la firma una sola vez y se reusa abajo.
    //    · Comando de operador (dinero/entrega): se EXIGE firma válida -> 403 si falta/no coincide.
    //    · Lead normal: por ahora fail-open con telemetría (evento 'firma_invalida'),
    //      TRANSITORIO hasta confirmar con un mensaje real que la URL firmada coincide;
    //      luego se endurece a 403 también.
    const internalKey = Deno.env.get("MUSA_INTERNAL_KEY") ?? "";
    const headerInternal = req.headers.get("X-Musa-Internal") ?? "";
    const bypassInterno = !!internalKey && headerInternal === internalKey;
    let firma: { valida: boolean; motivo: string } = { valida: false, motivo: "no_calculada" };
    if (!bypassInterno) {
      firma = await validarFirmaTwilio(form, req.headers.get("X-Twilio-Signature"));
    }

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

    // --- INTERCEPT ADMIN (E): comandos del dueño ---
    // Si el mensaje viene del número operador.whatsapp Y el body matchea
    // "ok|no|ver <short_id> [motivo]", se procesa como ADMIN (NO como lead),
    // ANTES de tocar el funnel. Se registra el mensaje para auditoría y se sale.
    {
      const cfgOp = await cargarSettings(admin);
      const operador = normTel(cfgOp.operador?.whatsapp ?? "");
      if (operador && normTel(phone) === operador && body) {
        const m = body.trim().match(/^(ok|no|ver)\s+(\d{3,6})(?:\s+(.*))?$/i);
        if (m) {
          // CAMINO SENSIBLE (dinero/entrega): exigir firma Twilio válida salvo
          // bypass interno (dashboard/prueba nuestra). Un POST falsificado del
          // operador sin firma -> 403 y NO se procesa NI se persiste nada.
          if (!bypassInterno && !firma.valida) {
            await registrarEvento(admin, phone, "comando_operador_rechazado", {
              motivo: firma.motivo,
              short_id: m[2],
            });
            return new Response("Forbidden", { status: 403 });
          }
          // Persistir el mensaje del operador para trazabilidad (best-effort).
          try {
            await admin.database.from("musa_messages").insert([{
              lead_phone: phone,
              direction: "in",
              body: body || null,
              twilio_sid: messageSid || null,
              estado_funnel: "ADMIN",
            }]);
          } catch (_e) { /* duplicado o carrera: ignorar */ }
          const cmd = m[1].toLowerCase() as "ok" | "no" | "ver";
          await registrarEvento(admin, phone, "comando_operador", { cmd, short_id: m[2] });
          await procesarComandoOperador(admin, cfgOp, cmd, m[2], m[3] ?? "");
          return emptyTwiml();
        }
      }
    }

    // MENSAJE DE LEAD NORMAL: si la firma no es válida (y no hubo bypass interno),
    // registrar telemetría y CONTINUAR procesando (fail-open). TRANSITORIO: una vez
    // confirmado con un mensaje real que la firma coincide, esto se endurece a 403.
    if (!bypassInterno && !firma.valida) {
      await registrarEvento(admin, phone, "firma_invalida", {
        from,
        motivo: firma.motivo,
      });
    }

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

    // SID del mensaje entrante para el typing indicator (CAMBIO 5).
    lead._inbound_sid = messageSid || null;

    // --- Check temprano de silencio: opt-out y escalado a humano ---
    // (antes de persistir el mensaje igual lo registramos para auditoría)
    const esImagen = numMedia > 0 && !!mediaContentType0 &&
      mediaContentType0.toLowerCase().startsWith("image");
    // CAMBIO 4 — nota de voz: audio entrante (NumMedia>0 y content-type audio/*)
    const esAudio = numMedia > 0 && !!mediaContentType0 &&
      mediaContentType0.toLowerCase().startsWith("audio");

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

    let norm = normalizar(body);

    // --- Comandos globales ---
    // STOP/SALIR funciona SIEMPRE, incluso con el bot en pausa por escalado.
    if (esStopTotal(norm)) {
      await actualizarLead(admin, lead, { opt_out: true });
      await registrarEvento(admin, phone, "optout", {});
      await enviarMensajes(admin, lead, [MSG_OPTOUT]);
      return emptyTwiml();
    }

    // CAMBIO 4 (Fase 4) — nota de voz: ahora se TRANSCRIBE y se procesa como si el
    // lead hubiera escrito ese texto. Descargamos el audio (MediaUrl0), lo
    // transcribimos con OpenAI y, si hay texto, lo inyectamos en body/norm para que
    // siga por la MISMA máquina de estados que un mensaje de texto. Si la
    // transcripción falla / queda vacía / tarda, caemos al mensaje cálido de
    // siempre (no rompemos el chat). Las IMÁGENES (S08) NO entran aquí.
    // (Si el lead está escalado, ya salió antes por el acuse.)
    if (esAudio && !lead.escalado_humano) {
      await registrarEvento(admin, phone, "nota_voz_recibida", {
        media_type: mediaContentType0,
        estado_funnel: lead.estado_funnel,
      });
      const usageTranscripcion: UsageOut = {};
      const transcrito = mediaUrl0
        ? await transcribirNotaVoz(mediaUrl0, mediaContentType0, usageTranscripcion)
        : null;
      if (transcrito) {
        // Reemplaza el texto efectivo: el resto del handler lo trata como tecleado.
        body = transcrito;
        norm = normalizar(body);
        await registrarEvento(admin, phone, "nota_voz_transcrita", {
          texto: transcrito,
          chars: transcrito.length,
          estado_funnel: lead.estado_funnel,
          usage: usageTranscripcion.usage ?? null,
          modelo: usageTranscripcion.model ?? null,
        });
        // Trazabilidad: guardamos el texto transcrito en el body del mensaje
        // entrante (que se insertó vacío por ser media). media_type/media_url ya
        // delatan que vino de una nota de voz.
        if (messageSid) {
          try {
            await admin.database
              .from("musa_messages")
              .update({ body: transcrito })
              .eq("twilio_sid", messageSid);
          } catch (e) {
            console.error("update body transcrito", String(e).slice(0, 160));
          }
        }
        // NO retornamos: dejamos que el flujo siga con el texto efectivo.
      } else {
        // Transcripción fallida/vacía: mensaje cálido pidiendo texto (no rompe).
        await enviarMensajes(admin, lead, [MSG_NOTA_VOZ]);
        return emptyTwiml();
      }
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

    // CAMBIO 6 — entrada desde anuncio: para un lead NUEVO (sin estado o S00), el
    // CONTENIDO del primer mensaje se ignora para clasificar (el anuncio precarga
    // un texto que NO es "hola", ej. "Me interesa, quiero más información"). Solo
    // se guarda (ya persistido arriba) y dispara el flujo de bienvenida. Así un
    // "Hola, vi su anuncio y quiero información" arranca el saludo y NO se intenta
    // interpretar como pregunta/objeción/petición de humano.
    if (lead.estado_funnel === "S00_LLEGADA") {
      const pidePrecioNuevo = !!norm && preguntaPrecio(norm);
      await flujoLeadNuevo(admin, lead, cfg, pidePrecioNuevo);
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
      lead.estado_funnel === "S04_GATE18"
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
      ["S04_GATE18", "S06_CIERRE"].includes(lead.estado_funnel)
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
        // CAMBIO 1: etapa de país eliminada. Leads legados aún en S03 saltan al
        // gate 18+: se les reenvía stack + gate y a partir de ahí siguen normal.
        await transicion(admin, lead, "S04_GATE18");
        await enviarMensajes(admin, lead, mensajesStackYGate(lead, cfg));
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
        // Si reenvía una imagen (p.ej. una captura más clara), la reprocesamos;
        // si es texto, mantenemos el acuse de "verificando".
        if (esImagen) {
          await procesarComprobante(admin, lead, cfg, mediaUrl0 || null);
        } else {
          await enviarMensajes(admin, lead, [MSG_VERIFICANDO]);
        }
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
