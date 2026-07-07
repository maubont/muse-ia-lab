// Wompi (Colombia) — utilidades PURAS para el Web Checkout alojado y la verificación
// de eventos. Sin dependencias externas: solo Web Crypto (crypto.subtle), TextEncoder
// y encodeURIComponent, disponibles igual en Deno (edge functions InsForge) y en Node 18+.
//
// Modelo "Web Checkout (link)": no requiere llave privada ni tokenización de tarjeta;
// se arma una URL firmada con la *integrity secret* y Wompi confirma el resultado por
// un webhook de eventos firmado con la *event secret*. Es el patrón más simple y sin PCI.
//   - Checkout:  https://docs.wompi.co/docs/colombia/widget-checkout-web/
//   - Eventos:   https://docs.wompi.co/docs/colombia/eventos/
//
// Referencia probada: maubont/sportbot-ia (mismo runtime Deno). Aquí se endurece a
// fail-closed en la verificación de eventos (nunca dar por válido lo que no se pudo firmar).

const CHECKOUT_BASE = "https://checkout.wompi.co/p/";

/** SHA-256 en hex (minúsculas) de una cadena UTF-8. */
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

export interface FirmaIntegridadInput {
  reference: string;
  amountInCents: number;
  currency: string;
  integritySecret: string;
  /** ISO 8601 opcional; si se envía, Wompi exige incluirlo en la firma. */
  expirationTime?: string;
}

/**
 * Firma de integridad del Web Checkout:
 *   SHA256( reference + amountInCents + currency [+ expirationTime] + integritySecret )
 * El expirationTime entra en la cadena SOLO si se usa (regla de Wompi).
 */
export async function firmaIntegridad(p: FirmaIntegridadInput): Promise<string> {
  const cadena = p.expirationTime
    ? `${p.reference}${p.amountInCents}${p.currency}${p.expirationTime}${p.integritySecret}`
    : `${p.reference}${p.amountInCents}${p.currency}${p.integritySecret}`;
  return await sha256Hex(cadena);
}

export interface LinkCheckoutParams {
  publicKey: string; // pub_test_... (sandbox) o pub_prod_... (producción)
  integritySecret: string; // secret del comercio — NUNCA viaja al cliente
  reference: string; // referencia única del pago (se guarda para conciliar el evento)
  amountInCents: number; // monto en centavos (33.000 COP => 3_300_000)
  currency?: string; // "COP" por defecto
  redirectUrl?: string; // a dónde vuelve el usuario tras pagar (opcional)
  expirationTime?: string; // ISO 8601 opcional (vence el link)
}

/**
 * Construye la URL del Web Checkout firmada. La query se arma a mano (no con
 * URLSearchParams) porque la clave `signature:integrity` lleva un ':' literal que
 * URLSearchParams percent-encodearía (%3A) y Wompi no lo reconocería.
 */
export async function generarLinkCheckout(p: LinkCheckoutParams): Promise<string> {
  const currency = p.currency ?? "COP";
  if (!p.publicKey || !p.integritySecret) {
    throw new Error("WOMPI: faltan publicKey / integritySecret");
  }
  if (!Number.isInteger(p.amountInCents) || p.amountInCents <= 0) {
    throw new Error(`WOMPI: amountInCents inválido (${p.amountInCents})`);
  }
  if (!p.reference) throw new Error("WOMPI: reference vacía");

  const integrity = await firmaIntegridad({
    reference: p.reference,
    amountInCents: p.amountInCents,
    currency,
    integritySecret: p.integritySecret,
    expirationTime: p.expirationTime,
  });

  const partes = [
    `public-key=${encodeURIComponent(p.publicKey)}`,
    `currency=${encodeURIComponent(currency)}`,
    `amount-in-cents=${p.amountInCents}`,
    `reference=${encodeURIComponent(p.reference)}`,
    `signature:integrity=${integrity}`, // integrity es hex => seguro sin encode
  ];
  if (p.redirectUrl) partes.push(`redirect-url=${encodeURIComponent(p.redirectUrl)}`);
  if (p.expirationTime) partes.push(`expiration-time=${encodeURIComponent(p.expirationTime)}`);

  return `${CHECKOUT_BASE}?${partes.join("&")}`;
}

export interface ResultadoChecksum {
  valido: boolean;
  motivo: string;
}

/**
 * Verifica la firma (checksum) de un evento de Wompi. FAIL-CLOSED por diseño: si
 * falta cualquier pieza para validar (secret, header, properties o timestamp) devuelve
 * valido=false — nunca se entrega el curso con un evento que no se pudo firmar.
 *
 * Cadena = concat(valores de signature.properties leídos de `body.data`)
 *          + body.timestamp + eventSecret  → SHA-256 hex,
 * comparada contra el header `x-event-checksum` (case-insensitive).
 *
 * CLAVE: el timestamp se toma del CUERPO (body.timestamp), no de un header.
 */
export async function verificarChecksumEvento(
  // deno-lint-ignore no-explicit-any
  body: any,
  checksumHeader: string | null | undefined,
  eventSecret: string | undefined | null,
): Promise<ResultadoChecksum> {
  if (!eventSecret) return { valido: false, motivo: "sin_event_secret" };
  if (!checksumHeader) return { valido: false, motivo: "sin_header_checksum" };

  const props = body?.signature?.properties;
  const ts = body?.timestamp;
  const data = body?.data;
  if (!Array.isArray(props) || props.length === 0) {
    return { valido: false, motivo: "sin_properties" };
  }
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
