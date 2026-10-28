// canal/tipos.ts — CONTRATO DE CANAL del funnel de Musa.
//
// Objetivo: que el motor del funnel (máquina de estados S00–S93) NO sepa si el
// mensaje viene de Twilio, de Evolution API (Baileys) o de WhatsApp Cloud API.
// Cada proveedor implementa la interfaz `Canal` y traduce a/desde estos tipos.
//
// Reglas de diseño (no negociables):
//  1. `verificar()` es OBLIGATORIO y falla CERRADO para TODO mensaje. Esto elimina
//     por construcción el fail-open de musa-webhook-twilio.ts:2600-2608.
//  2. La media es PEREZOSA: Baileys no entrega una URL descargable (entrega
//     mediaKey/fileSha256 y exige una llamada de seguimiento), Twilio sí. Con
//     `MediaRef.obtenerBytes()` el pipeline de visión y pHash no cambia.
//  3. Nada de enums ni namespaces: sintaxis 100% borrable (compatible con
//     type-stripping de Node y con Deno).
//  4. Este archivo NO importa nada. Es el punto de apoyo de todo lo demás.
//
// Estado: contrato propuesto (Etapa 0 del ADR-001). Sin lógica de negocio.

// ============================== identidad del canal ==============================

/** Proveedores de mensajería soportados. */
export type CanalId = "twilio" | "evolution";

/** Configuración persistida en musa_settings.canal */
export interface CanalConfig {
  proveedor: CanalId;
  /** Nombre de la instancia en Evolution API (ignorado por Twilio). */
  instancia?: string;
  /** Base URL de Evolution API, ej. https://evolution.up.railway.app */
  base_url?: string;
  /** Ruta del webhook ya registrada (equivale a MUSA_WEBHOOK_URL en Twilio). */
  webhook_url?: string;
  /** Twilio y Evolution pueden coexistir para hacer cutover reversible. */
  reverso?: CanalId | null;
}

// ============================== entrada ==============================

/**
 * Referencia a un adjunto. `obtenerBytes` es perezoso a propósito: solo se
 * invoca cuando el pipeline realmente necesita los bytes (comprobante de pago,
 * nota de voz). Si el proveedor ya entregó una URL estable (Evolution + S3/R2),
 * `url` viene poblada y `obtenerBytes` puede simplemente descargarla.
 */
export interface MediaRef {
  tipo: "audio" | "imagen" | "video" | "documento";
  mime: string;
  /** URL directa, si el proveedor la expone. */
  url?: string;
  /** Nombre de archivo sugerido por el proveedor, si existe. */
  nombre?: string;
  /**
   * Devuelve los bytes del adjunto, o null si no se pudieron obtener.
   * Implementaciones: descarga HTTP, o POST /chat/getBase64FromMediaMessage.
   */
  obtenerBytes: () => Promise<ArrayBuffer | null>;
}

/** Atribución de anuncio. En Baileys es SIEMPRE null (no hay ReferralCtwaClid). */
export interface AtribucionAnuncio {
  ctwa_clid: string | null;
  source_id: string | null;
}

/** Un mensaje entrante ya normalizado, listo para el motor del funnel. */
export interface MensajeEntrante {
  canal: CanalId;
  /** Id del mensaje en el proveedor. Clave de IDEMPOTENCIA (reemplaza twilio_sid). */
  id_externo: string;
  /** Teléfono en E.164 con '+', ej. "+573223565761". */
  telefono: string;
  /** Nombre de perfil del proveedor (puede ser apodo o basura: el funnel lo valida). */
  nombre_perfil: string | null;
  /** Texto tecleado o transcripción de nota de voz: el motor no distingue. */
  texto: string;
  /** Adjunto, si lo hay. */
  media: MediaRef | null;
  atribucion: AtribucionAnuncio;
  /** Epoch ms según el proveedor (ordenar, deduplicar, ventana temporal). */
  enviado_en: number;
}

// ============================== salida ==============================

/** Un mensaje a enviar. Equivale al actual MensajeOut, pero normalizado. */
export interface MensajeSaliente {
  texto: string;
  media?: {
    /** URL pública (bucket R2 o video ya subido). */
    url: string;
    tipo: "video" | "imagen" | "documento" | "audio";
    mime?: string;
    nombre?: string;
  };
}

// ============================== resultados ==============================

/**
 * Resultado de verificar la autenticidad de un POST entrante.
 * `motivo` va a telemetría (evento 'canal_no_verificado'); NUNCA al usuario.
 */
export interface ResultadoVerificacion {
  valido: boolean;
  motivo: string;
}

/** Resultado de un envío. `id_externo` permite correlacionar con musa_messages. */
export interface ResultadoEnvio {
  ok: boolean;
  id_externo: string | null;
  /** Código HTTP del proveedor, para telemetría. */
  status?: number;
  motivo?: string;
}

// ============================== contrato ==============================

export interface Canal {
  readonly id: CanalId;

  /**
   * Autentica el POST. Se evalúa ANTES de parsear y antes de tocar la BD.
   * Fail-closed: si no hay certeza, `valido: false`.
   */
  verificar(req: Request, cuerpoCrudo: string): Promise<ResultadoVerificacion>;

  /**
   * Traduce el POST del proveedor a cero o más mensajes procesables.
   * Devuelve [] cuando el evento no es un mensaje de usuario (eco propio,
   * acuse de entrega, reacción, grupo, status@broadcast).
   * LANZA si el cuerpo está malformado: eso es una anomalía, no "sin mensajes",
   * y el servidor debe responder 4xx para que quede visible.
   * Implementaciones DEBEN filtrar fromMe: si no, el bot se responde a sí mismo.
   */
  parsear(req: Request, cuerpoCrudo: string): Promise<MensajeEntrante[]>;

  /** Envía un mensaje. No persiste: eso lo hace el motor. */
  enviar(telefono: string, mensaje: MensajeSaliente): Promise<ResultadoEnvio>;

  /** "escribiendo…" best-effort. Un fallo aquí NUNCA debe romper el flujo. */
  marcarEscribiendo(telefono: string): Promise<void>;
}

// ============================== helpers puros ==============================

/** Prefijo de los números de prueba internos (convención vigente del webhook). */
export const PREFIJO_PRUEBA = "+9999";

/** true si el número es de prueba interno y por tanto no debe salir a la red. */
export function esTelefonoDePrueba(telefono: string): boolean {
  return (telefono || "").startsWith(PREFIJO_PRUEBA);
}

/**
 * Normaliza a E.164 con '+' y solo dígitos. Acepta "+57 322 356 5761",
 * "573223565761" y "whatsapp:+573223565761". Devuelve "" si no hay dígitos.
 * NO infiere código de país: eso es responsabilidad del adaptador, que sí conoce
 * el formato del proveedor.
 */
export function normalizarTelefonoE164(entrada: string): string {
  const limpio = (entrada || "")
    .trim()
    .replace(/^whatsapp:/i, "")
    .replace(/[^\d+]/g, "")
    .replace(/(?!^)\+/g, "");
  const digitos = limpio.replace(/\+/g, "");
  if (digitos.length < 6) return "";
  return "+" + digitos;
}

/**
 * Convierte un JID de Baileys a teléfono E.164.
 * "573223565761@s.whatsapp.net" -> "+573223565761"
 * Devuelve null para grupos, canales y broadcast (no son leads).
 */
export function jidATelefono(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const servidor = jid.split("@")[1] ?? "";
  if (servidor !== "s.whatsapp.net" && servidor !== "c.us") return null;
  const usuario = jid.split("@")[0].split(":")[0];
  const digitos = usuario.replace(/\D/g, "");
  if (digitos.length < 8) return null;
  return "+" + digitos;
}
