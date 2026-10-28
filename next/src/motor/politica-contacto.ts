// next/src/motor/politica-contacto.ts — CUÁNDO SE PUEDE ESCRIBIR.
//
// La política del negocio, escrita como código para que no dependa de la memoria
// de nadie:
//
//   · A quien YA ESCRIBIÓ se le responde siempre, a cualquier hora. Contesta
//     rápido: es lo que más valora el cliente y lo que menos reportes genera.
//   · A quien NO ha escrito no se le escribe fuera de la ventana de 24 h de
//     WhatsApp (BSP) ni fuera del horario razonable.
//   · Nunca más de 3 seguimientos por lead.
//
// POR QUÉ IMPORTA: los baneos de WhatsApp llegan por reportes de usuarios y por
// patrones de envío masivo. Un seguimiento a las 3 a.m. es la definición de
// mensaje no deseado. El canal es no oficial (Baileys), así que el margen de
// error es menor que con la API oficial: aquí la política se cumple por
// construcción, no por buena voluntad.

export const VENTANA_SERVICIO_MS = 24 * 3600 * 1000;
export const MAX_SEGUIMIENTOS = 3;
/** Umbrales del original: 30 min, 4 h y 20 h desde el último mensaje saliente. */
export const UMBRALES_MIN = [30, 4 * 60, 20 * 60] as const;

export type Permiso = { permitido: true } | { permitido: false; motivo: string };

export interface ContextoContacto {
  ahora: Date;
  /** `last_in_at`: última vez que el lead escribió. */
  ultimoEntrante: Date | null;
  /** `last_out_at`: último mensaje nuestro. */
  ultimoSaliente: Date | null;
  seguimientosEnviados: number;
  /** Zona del negocio y horas razonables (por defecto 8–22). */
  tz?: string;
  horaInicio?: number;
  horaFin?: number;
}

/** Hora local (0-23) en la zona del negocio. */
export function horaLocal(ahora: Date, tz: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
  }).format(ahora);
  const h = parseInt(partes, 10);
  return Number.isNaN(h) ? 0 : h % 24;
}

/** ¿estamos dentro del horario razonable? (inicio inclusive, fin exclusive) */
export function dentroDeHorarioRazonable(
  ahora: Date,
  tz = "America/Bogota",
  horaInicio = 8,
  horaFin = 22,
): boolean {
  const h = horaLocal(ahora, tz);
  // Si el horario cruza medianoche (ej. 20–2), se maneja como dos tramos.
  if (horaInicio <= horaFin) return h >= horaInicio && h < horaFin;
  return h >= horaInicio || h < horaFin;
}

/**
 * Responder a un mensaje entrante: SIEMPRE permitido, a cualquier hora.
 * Se deja como función explícita para que el llamador no tenga que recordarlo.
 */
export function puedeResponder(): Permiso {
  return { permitido: true };
}

/**
 * Iniciar un mensaje que el cliente NO pidió (seguimiento).
 * Todas las reglas se comprueban en orden; el primer motivo que falla es el que
 * se reporta, porque es el que explica la decisión.
 */
export function puedeSeguir(ctx: ContextoContacto): Permiso {
  const tz = ctx.tz ?? "America/Bogota";
  const inicio = ctx.horaInicio ?? 8;
  const fin = ctx.horaFin ?? 22;

  if (!ctx.ultimoEntrante) return { permitido: false, motivo: "sin_mensaje_del_lead" };

  const msDesdeEntrante = ctx.ahora.getTime() - ctx.ultimoEntrante.getTime();
  if (msDesdeEntrante < 0) return { permitido: false, motivo: "reloj_inconsistente" };
  if (msDesdeEntrante > VENTANA_SERVICIO_MS) return { permitido: false, motivo: "fuera_de_ventana_24h" };

  if ((ctx.seguimientosEnviados ?? 0) >= MAX_SEGUIMIENTOS) {
    return { permitido: false, motivo: "limite_alcanzado" };
  }

  if (!dentroDeHorarioRazonable(ctx.ahora, tz, inicio, fin)) {
    return { permitido: false, motivo: "fuera_de_horario" };
  }

  return { permitido: true };
}

/**
 * ¿Toca enviar el siguiente seguimiento por tiempo transcurrido?
 * Devuelve el número de seguimiento a enviar (1..3) o null.
 */
export function siguienteSeguimientoPorTiempo(ctx: ContextoContacto): number | null {
  if (!ctx.ultimoSaliente) return null;
  const n = ctx.seguimientosEnviados ?? 0;
  if (n >= MAX_SEGUIMIENTOS) return null;

  const transcurridosMin = (ctx.ahora.getTime() - ctx.ultimoSaliente.getTime()) / 60_000;
  if (transcurridosMin < UMBRALES_MIN[n]) return null;
  return n + 1;
}
