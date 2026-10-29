// next/src/vision/proveedor.ts — UN SOLO ADAPTADOR PARA VARIOS PROVEEDORES.
//
// Los tres grandes hablan el dialecto «OpenAI-compatible» en su endpoint de chat:
//
//   OpenAI      https://api.openai.com/v1
//   Gemini      https://generativelanguage.googleapis.com/v1beta/openai
//   OpenRouter  https://openrouter.ai/api/v1
//
// Con un adaptador y tres variables de entorno se cambia de proveedor sin tocar
// código. Eso importa cuando el objetivo es «empezar gratis y pagar solo si
// funciona»: la decisión deja de ser técnica.
//
// La respuesta del modelo NO es de fiar: se valida campo por campo. Un JSON mal
// formado no puede convertirse en una aprobación.

import type { DatosComprobante } from "../../../functions/motor/comprobante.ts";

export interface ConfigProveedor {
  /** base URL, sin barra final */
  baseUrl: string;
  apiKey: string;
  modelo: string;
  /** tope de tokens de salida: una respuesta larga se paga y no aporta */
  maxTokensSalida?: number;
  timeoutMs?: number;
  /** precio por millón de tokens, para el registro de gasto */
  precioEntrada: number;
  precioSalida: number;
  /**
   * Esfuerzo de razonamiento. `none` para leer un comprobante: no hace falta
   * razonar, y el valor por defecto de los modelos nuevos (`medium`) genera
   * tokens de razonamiento que se pagan como salida.
   */
  razonamiento?: "none" | "low" | "medium" | "high";
  /**
   * Si el proveedor soporta salida estructurada, se envía el esquema y el modelo
   * no puede devolver algo que no cuadre. Los que no lo soportan ignoran el campo.
   */
  salidaEstructurada?: boolean;
}

export interface RespuestaProveedor {
  datos: DatosComprobante | null;
  tokensEntrada: number;
  tokensSalida: number;
  motivoFallo?: string;
}

/** Instrucción del lector. Corta a propósito: cada token se paga. */
export const INSTRUCCION_LECTURA = `Eres un lector de comprobantes de pago colombianos (Nequi, Bancolombia, Bre-B) y venezolanos (Pago Móvil, BDV).
Devuelve SOLO un objeto JSON, sin texto alrededor, con estas claves:
{"metodo":string|null,"monto":number|null,"moneda":"COP"|"VES"|"USD"|null,"fecha":"YYYY-MM-DD"|null,"hora":string|null,"numero_referencia":string|null,"destino":string|null,"numeros_detectados":string[],"nombre_destinatario":string|null,"banco_o_app":string|null,"estado_operacion":"exitosa"|"fallida"|"programada"|"en_proceso"|"ilegible", "es_captura_completa":boolean,"senales_manipulacion":string[],"confidence":{"monto":number,"referencia":number,"destino":number,"fecha":number}}
Reglas: si un dato no se ve con claridad, pon null y baja su confidence. Si la imagen no es un comprobante, estado_operacion="ilegible". No inventes números.`;

const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const esTexto = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/**
 * Convierte la respuesta del modelo en datos usables, descartando lo que no cuadre.
 * Devuelve null si no hay forma de salvarla.
 */
export function validarDatos(crudo: unknown): DatosComprobante | null {
  if (!crudo || typeof crudo !== "object") return null;
  const o = crudo as Record<string, unknown>;

  const monto = esNumero(o.monto) ? o.monto : null;
  const moneda = esTexto(o.moneda) ? o.moneda.toUpperCase() : null;
  const fecha = esTexto(o.fecha) && /^\d{4}-\d{2}-\d{2}$/.test(o.fecha) ? o.fecha : null;
  const estado = esTexto(o.estado_operacion) ? o.estado_operacion : "ilegible";

  const numeros = Array.isArray(o.numeros_detectados)
    ? o.numeros_detectados.filter((x): x is string => typeof x === "string").slice(0, 20)
    : [];

  const conf = (o.confidence ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (esNumero(v) ? Math.max(0, Math.min(1, v)) : 0);

  return {
    metodo: esTexto(o.metodo) ? o.metodo : null,
    monto,
    moneda,
    fecha,
    hora: esTexto(o.hora) ? o.hora : null,
    numero_referencia: esTexto(o.numero_referencia) ? o.numero_referencia : null,
    destino: esTexto(o.destino) ? o.destino : null,
    numeros_detectados: numeros,
    nombre_destinatario: esTexto(o.nombre_destinatario) ? o.nombre_destinatario : null,
    banco_o_app: esTexto(o.banco_o_app) ? o.banco_o_app : null,
    estado_operacion: estado,
    es_captura_completa: o.es_captura_completa === true,
    senales_manipulacion: Array.isArray(o.senales_manipulacion)
      ? o.senales_manipulacion.filter((x): x is string => typeof x === "string").slice(0, 10)
      : [],
    confidence: {
      monto: num(conf.monto),
      referencia: num(conf.referencia),
      destino: num(conf.destino),
      fecha: num(conf.fecha),
    },
  };
}

/** Extrae el JSON de una respuesta que puede venir con markdown alrededor. */
export function extraerJson(texto: string): unknown {
  const limpio = (texto ?? "").trim();
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return null;
  try {
    return JSON.parse(limpio.slice(inicio, fin + 1));
  } catch {
    return null;
  }
}

/**
 * Llama al proveedor y devuelve datos validados. NUNCA lanza: cualquier fallo
 * se convierte en `datos: null`, que el flujo trata como «va a un humano».
 */
export async function leerConProveedor(
  cfg: ConfigProveedor,
  imagenDataUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RespuestaProveedor> {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 30000);

  try {
    const res = await fetchImpl(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.modelo,
        max_tokens: cfg.maxTokensSalida ?? 400,
        temperature: 0,
        // Sin esto, los modelos nuevos razonan por defecto y la factura sube.
        ...(cfg.razonamiento ? { reasoning_effort: cfg.razonamiento } : {}),
        ...(cfg.salidaEstructurada ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: INSTRUCCION_LECTURA },
          {
            role: "user",
            content: [
              { type: "text", text: "Lee este comprobante y devuelve el JSON." },
              { type: "image_url", image_url: { url: imagenDataUrl } },
            ],
          },
        ],
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const cuerpo = await res.text().catch(() => "");
      return { datos: null, tokensEntrada: 0, tokensSalida: 0, motivoFallo: `http_${res.status}:${cuerpo.slice(0, 80)}` };
    }

    const j = (await res.json()) as Record<string, unknown>;
    const uso = (j.usage ?? {}) as Record<string, unknown>;
    const tokensEntrada = esNumero(uso.prompt_tokens) ? uso.prompt_tokens : 0;
    const tokensSalida = esNumero(uso.completion_tokens) ? uso.completion_tokens : 0;

    const elecciones = Array.isArray(j.choices) ? j.choices : [];
    const primera = elecciones[0] as Record<string, unknown> | undefined;
    const mensaje = (primera?.message ?? {}) as Record<string, unknown>;
    const contenido = typeof mensaje.content === "string" ? mensaje.content : "";

    const datos = validarDatos(extraerJson(contenido));
    if (!datos) {
      return { datos: null, tokensEntrada, tokensSalida, motivoFallo: "json_invalido" };
    }
    return { datos, tokensEntrada, tokensSalida };
  } catch (e) {
    const nombre = (e as { name?: string })?.name ?? "";
    return { datos: null, tokensEntrada: 0, tokensSalida: 0, motivoFallo: nombre === "AbortError" ? "timeout" : String(e).slice(0, 80) };
  } finally {
    clearTimeout(reloj);
  }
}

/** Lee la configuración del entorno. null = no hay proveedor: todo va a humano. */
export function configDesdeEntorno(env: Record<string, string | undefined>): ConfigProveedor | null {
  const baseUrl = (env.MUSA_IA_URL ?? "").trim();
  const apiKey = (env.MUSA_IA_KEY ?? "").trim();
  const modelo = (env.MUSA_IA_MODELO ?? "").trim();
  if (!baseUrl || !apiKey || !modelo) return null;
  return {
    baseUrl,
    apiKey,
    modelo,
    maxTokensSalida: Number(env.MUSA_IA_MAX_TOKENS ?? 400),
    timeoutMs: Number(env.MUSA_IA_TIMEOUT_MS ?? 30000),
    // Precios verificados de gpt-6-luna (developers.openai.com, oct-2026).
    precioEntrada: Number(env.MUSA_IA_PRECIO_ENTRADA ?? 0.1),
    precioSalida: Number(env.MUSA_IA_PRECIO_SALIDA ?? 0.5),
    razonamiento: (env.MUSA_IA_RAZONAMIENTO ?? "none") as "none" | "low" | "medium" | "high",
    salidaEstructurada: (env.MUSA_IA_JSON ?? "si") !== "no",
  };
}
/**
 * PRUEBA MÍNIMA DEL PROVEEDOR: una llamada de texto, 5 tokens de salida.
 * Sirve para distinguir «la configuración está puesta» de «la clave funciona».
 * Cuesta del orden de una cienmilésima de dólar.
 */
export async function probarProveedor(
  cfg: ConfigProveedor,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; motivo?: string; ms: number; muestra?: string }> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 30000);
  try {
    const res = await fetchImpl(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.modelo,
        max_tokens: 5,
        temperature: 0,
        ...(cfg.razonamiento ? { reasoning_effort: cfg.razonamiento } : {}),
        messages: [{ role: "user", content: "Responde solo: ok" }],
      }),
      signal: ctrl.signal,
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => "");
      return { ok: false, motivo: `http_${res.status}:${cuerpo.slice(0, 120)}`, ms };
    }
    const j = (await res.json()) as Record<string, unknown>;
    const elecciones = Array.isArray(j.choices) ? j.choices : [];
    const msg = ((elecciones[0] as Record<string, unknown> | undefined)?.message ?? {}) as Record<string, unknown>;
    const muestra = typeof msg.content === "string" ? msg.content.slice(0, 40) : "";
    return { ok: true, ms, muestra };
  } catch (e) {
    const nombre = (e as { name?: string })?.name ?? "";
    return { ok: false, motivo: nombre === "AbortError" ? "timeout" : String(e).slice(0, 100), ms: Date.now() - t0 };
  } finally {
    clearTimeout(reloj);
  }
}