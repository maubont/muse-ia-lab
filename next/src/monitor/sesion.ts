// next/src/monitor/sesion.ts — VIGILAR LA SESIÓN DE WHATSAPP.
//
// El fallo más caro y más silencioso de todo el sistema: la sesión de WhatsApp se
// cierra y el bot sigue diciendo «ok» en /salud. Las ventas mueren y nadie se
// entera hasta la noche.
//
// LA TRAMPA: si WhatsApp está caído, NO puedes avisar por WhatsApp. Por eso la
// alerta sale por un webhook externo (Slack, Discord, Telegram, n8n, correo
// transaccional…) o, si no hay webhook, por el log del proceso.
//
// Aquí solo vive la LÓGICA de decisión (cuándo alertar), separada del envío, para
// poder probarla sin red ni relojes.

export type EstadoSesion = "open" | "connecting" | "close" | "desconocido";

export interface LecturaSesion {
  estado: EstadoSesion;
  /** detalle libre para el mensaje, ej. el código de cierre de Baileys */
  detalle?: string;
}

export interface OpcionesVigilancia {
  /** cada cuántos ms se repite la alerta mientras siga caída (por defecto 30 min) */
  repetirCadaMs?: number;
  /** no alertar hasta que lleve caída este tiempo (evita el parpadeo de reconexión) */
  graciaMs?: number;
}

export interface DecisionVigilancia {
  /** hay que avisar al operador */
  alertar: boolean;
  /** texto del aviso, si toca */
  mensaje?: string;
  /** estado nuevo que queda registrado */
  estado: EstadoSesion;
  /** transición: abrió, se cayó, sigue caída, sigue bien */
  tipo: "abrio" | "se_cayo" | "sigue_caida" | "sigue_bien" | "en_gracia";
}

/**
 * Decide si hay que alertar, con memoria del estado anterior.
 * `previo` es el estado de la lectura anterior (null en la primera).
 */
export function decidirVigilancia(
  lectura: LecturaSesion,
  previo: { estado: EstadoSesion; desde: number; ultimoAviso: number | null } | null,
  ahoraMs: number,
  opciones: OpcionesVigilancia = {},
): DecisionVigilancia {
  const repetir = opciones.repetirCadaMs ?? 30 * 60_000;
  const gracia = opciones.graciaMs ?? 60_000;
  const sano = lectura.estado === "open";

  // Primera lectura.
  if (!previo) {
    if (sano) return { alertar: false, estado: "open", tipo: "abrio" };
    // Sin historial no se puede saber cuánto lleva caída: se avisa.
    return {
      alertar: true,
      mensaje: `⚠️ La sesión de WhatsApp no está abierta: ${lectura.estado}${lectura.detalle ? " · " + lectura.detalle : ""}. Los mensajes no van a salir.`,
      estado: lectura.estado,
      tipo: "se_cayo",
    };
  }

  // Sigue sana.
  if (sano) {
    if (previo.estado === "open") return { alertar: false, estado: "open", tipo: "sigue_bien" };
    return {
      alertar: true,
      mensaje: `✅ La sesión de WhatsApp volvió a estar abierta.`,
      estado: "open",
      tipo: "abrio",
    };
  }

  // Está caída. ¿Cambió el estado o sigue igual?
  const cambio = previo.estado !== lectura.estado;
  const desde = cambio ? ahoraMs : previo.desde;
  const llevaba = ahoraMs - desde;

  if (llevaba < gracia) {
    return { alertar: false, estado: lectura.estado, tipo: "en_gracia" };
  }

  const necesitaAviso = previo.ultimoAviso === null || ahoraMs - previo.ultimoAviso >= repetir;
  if (!necesitaAviso) return { alertar: false, estado: lectura.estado, tipo: "sigue_caida" };

  return {
    alertar: true,
    mensaje: `🚨 La sesión de WhatsApp lleva ${Math.round(llevaba / 60_000)} min sin abrir (${lectura.estado}${lectura.detalle ? " · " + lectura.detalle : ""}). Los mensajes no están saliendo.`,
    estado: lectura.estado,
    tipo: "se_cayo",
  };
}

/** Texto corto para el log, siempre útil aunque no haya webhook. */
export function lineaDeLog(lectura: LecturaSesion): string {
  return `[monitor] sesión WhatsApp: ${lectura.estado}${lectura.detalle ? " · " + lectura.detalle : ""}`;
}
