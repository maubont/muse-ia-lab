// next/src/motor/comandos-operador.ts — COMANDOS DEL OPERADOR (PAGOS, ESCALADO Y DESESCALADO).
//
// Permite al operador aprobar/rechazar pagos y pausar/reanudar la atención automática
// de leads directamente desde su WhatsApp o consola.

export type ComandoOperador =
  | { tipo: "aprobar"; shortId: string }
  | { tipo: "rechazar"; shortId: string; motivo: string }
  | { tipo: "ver"; shortId: string }
  | { tipo: "reanudar"; telefono: string }
  | { tipo: "pausar"; telefono: string };

/**
 * Reconoce un comando del operador.
 *
 * Soporta:
 * 1. Pagos estrictos: `ok 4821`, `no 4821 comprobante falso`, `ver 4821` (un ID de pago siempre contiene dígitos)
 * 2. Desescalado (reanudar bot): `reanudar +573001234567`, `desescalar 57300...`, `bot on 57300...`
 * 3. Pausa (escalar a humano): `pausar +573001234567`, `escalar 57300...`, `bot off 57300...`
 */
export function interpretarComando(texto: string): ComandoOperador | null {
  const limpio = String(texto ?? "").trim();
  if (!limpio) return null;

  // Los comandos del operador pueden venir limpios o con prefijo / o cmd:
  // Jamás frases conversacionales cotidianas ("no gracias", "ok amor", "veremos", etc.)
  const textoSinPrefijo = limpio.replace(/^(?:\/|cmd:\s*)/i, "").trim();

  // 1. Comandos de pago (ok / no / ver) con sintaxis estricta.
  // Un shortId de pago SIEMPRE contiene al menos un dígito (ej: 4821, 4A2B).
  const mOkVer = /^(ok|ver)\s+((?=.*\d)[A-Za-z0-9]{3,10})$/i.exec(textoSinPrefijo);
  if (mOkVer) {
    const verbo = mOkVer[1].toLowerCase();
    const shortId = mOkVer[2].toUpperCase();
    if (verbo === "ok") return { tipo: "aprobar", shortId };
    if (verbo === "ver") return { tipo: "ver", shortId };
  }

  const mNo = /^no\s+((?=.*\d)[A-Za-z0-9]{3,10})(?:\s+(.+))?$/i.exec(textoSinPrefijo);
  if (mNo) {
    const shortId = mNo[1].toUpperCase();
    const motivo = (mNo[2] ?? "").trim();
    return { tipo: "rechazar", shortId, motivo: motivo || "sin_motivo" };
  }

  // 2. Comandos de reanudación / desescalado del bot
  const mReanudar = /^(?:reanudar|desescalar|boton|bot\s+on|atendido|reactivar)\s+(\+?\d[\d\s-]{7,16})$/i.exec(textoSinPrefijo);
  if (mReanudar) {
    const telefono = "+" + mReanudar[1].replace(/\D/g, "");
    return { tipo: "reanudar", telefono };
  }

  // 3. Comandos de pausa manual del bot
  const mPausar = /^(?:pausar|escalar|botoff|bot\s+off|frenar)\s+(\+?\d[\d\s-]{7,16})$/i.exec(textoSinPrefijo);
  if (mPausar) {
    const telefono = "+" + mPausar[1].replace(/\D/g, "");
    return { tipo: "pausar", telefono };
  }

  return null;
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
