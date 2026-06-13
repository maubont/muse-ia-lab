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
    "avatar",
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
    const fd = new FormData();
    fd.append("file", blob, `nota.${ext}`);
    fd.append("model", "gpt-4o-mini-transcribe");
    fd.append("language", "es");
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
    const texto = (j?.text ?? "").trim();
    return texto.length > 0 ? texto : null;
  } catch (e) {
    console.error("transcribir err", String(e).slice(0, 200));
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
  S04_GATE18: "¿Me confirmas que ya tienes 18 años o más?",
  S06_CIERRE: "¿Te paso los datos de pago? 😊",
  S08_ESPERA_CAPTURA: "Cuando tengas la captura del comprobante, envíamela por aquí 📸",
  S09_VERIFICACION: "Seguimos verificando tu pago, tu acceso queda asegurado ✅",
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
      const transcrito = mediaUrl0
        ? await transcribirNotaVoz(mediaUrl0, mediaContentType0)
        : null;
      if (transcrito) {
        // Reemplaza el texto efectivo: el resto del handler lo trata como tecleado.
        body = transcrito;
        norm = normalizar(body);
        await registrarEvento(admin, phone, "nota_voz_transcrita", {
          texto: transcrito,
          chars: transcrito.length,
          estado_funnel: lead.estado_funnel,
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
