// next/src/motor/comandos-operador.ts — LA SALIDA DE LA COLA DE REVISIÓN.
//
// ── EL FALLO QUE ESTO CIERRA ────────────────────────────────────────────────
// Cuando un pago no está claro, el sistema manda al dueño un mensaje que dice:
//
//     «Responde: ok {{short_id}} / no {{short_id}} <motivo> / ver {{short_id}}»
//
// Pero **no existía ningún código que entendiera esa respuesta**. El dueño escribía
// «ok 4821» desde su WhatsApp y el bot lo trataba como un lead nuevo: le mandaba el
// saludo y la puerta de edad. El cliente que había pagado se quedaba en
// «seguimos verificando» para siempre.
//
// Esto lee los tres comandos y actúa. Es la pieza que hace que el cobro manual
// termine de verdad.

export type ComandoOperador =
  | { tipo: "aprobar"; shortId: string }
  | { tipo: "rechazar"; shortId: string; motivo: string }
  | { tipo: "ver"; shortId: string };

/**
 * Reconoce un comando del operador.
 *
 * Es deliberadamente estricto: `ok 4821`, `no 4821 comprobante de otra persona`,
 * `ver 4821`. Cualquier otra cosa devuelve `null` y sigue el flujo normal, así el
 * dueño puede escribir como una persona sin que el bot interprete cualquier frase.
 */
export function interpretarComando(texto: string): ComandoOperador | null {
  const limpio = String(texto ?? "").trim();
  const m = /^(ok|no|ver)\s+([A-Za-z0-9][A-Za-z0-9-]{2,11})\b\s*(.*)$/i.exec(limpio);
  if (!m) return null;

  const verbo = m[1].toLowerCase();
  const shortId = m[2].toUpperCase();
  const resto = m[3].trim();

  if (verbo === "ok") return { tipo: "aprobar", shortId };
  if (verbo === "ver") return { tipo: "ver", shortId };
  // Rechazar sin motivo es legítimo, pero se guarda uno por defecto.
  return { tipo: "rechazar", shortId, motivo: resto || "sin_motivo" };
}

/** ¿Este mensaje viene del operador y es un comando? */
export function esComandoOperador(telefono: string, texto: string, numeroOperador?: string): boolean {
  if (!numeroOperador) return false;
  return normalizarTelefono(telefono) === normalizarTelefono(numeroOperador) && interpretarComando(texto) !== null;
}

/** Compara números con y sin prefijo, `+`, espacios o guiones. */
export function normalizarTelefono(tel: string): string {
  return String(tel ?? "").replace(/[^\d]/g, "");
}
