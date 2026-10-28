// next/src/motor/recordatorios.ts — RECORDATORIOS POR EVENTO.
//
// El cron por tiempo (`30 min / 4 h / 20 h` desde `last_out_at`) no distingue
// «se distrajo» de «pidió los datos de pago y no pagó». La diferencia vale
// dinero: el segundo es el momento de máxima intención de compra.
//
// Aquí se decide, al CAMBIAR DE ESTADO, qué recordatorios crear y para cuándo.
// Se cancelan en cuanto el lead vuelve a escribir.
//
// REGLAS (de la política de contacto, no de este archivo):
//   · máximo 3 por lead            · dentro de la ventana de 24 h
//   · solo en horario 8–22         · el STOP los cancela todos
//
// El texto vive aquí por ahora. Cuando haya `musa_settings.recordatorios`, se
// lee de la base como el resto del copy: el motor no debe ser la fuente.

import type { CfgCopy } from "../../../functions/motor/copy.ts";

export type TipoRecordatorio = "pago_pendiente" | "verificacion_pendiente" | "chat_incompleto";

export interface RecordatorioProgramado {
  tipo: TipoRecordatorio;
  /** minutos desde ahora */
  enMinutos: number;
  texto: string;
}

/**
 * Copy por defecto. SIN urgencia falsa, sin contadores, sin «últimas plazas»:
 * la lista negra del plan prohíbe inventar escasez. Solo se recuerda y se ofrece
 * ayuda.
 */
export const TEXTOS_RECORDATORIO: Record<TipoRecordatorio, string[]> = {
  pago_pendiente: [
    "¿Te quedó alguna duda con los datos de pago? Aquí sigo 😊",
    "Tu cupo sigue disponible. Si quieres, te vuelvo a pasar los datos o te ayudo con el pago 💜",
    "Antes de cerrar: si decides empezar hoy, dime y te dejo todo listo en un minuto 😉",
  ],
  verificacion_pendiente: [
    "Sigo revisando tu pago. Apenas esté confirmado te llega el acceso por aquí 💜",
  ],
  chat_incompleto: [
    "¿Seguimos? Quedé pendiente de tu respuesta 😊",
  ],
};

/**
 * Qué recordatorios crear al entrar en un estado.
 * `S07`/`S08` significan que el lead YA tiene los datos de pago en la mano.
 */
export function recordatoriosParaEstado(estadoNuevo: string): RecordatorioProgramado[] {
  if (estadoNuevo === "S07_DATOS_PAGO" || estadoNuevo === "S08_ESPERA_CAPTURA") {
    return [
      { tipo: "pago_pendiente", enMinutos: 20, texto: TEXTOS_RECORDATORIO.pago_pendiente[0] },
      { tipo: "pago_pendiente", enMinutos: 3 * 60, texto: TEXTOS_RECORDATORIO.pago_pendiente[1] },
      { tipo: "pago_pendiente", enMinutos: 20 * 60, texto: TEXTOS_RECORDATORIO.pago_pendiente[2] },
    ];
  }
  if (estadoNuevo === "S09_VERIFICACION") {
    return [{ tipo: "verificacion_pendiente", enMinutos: 45, texto: TEXTOS_RECORDATORIO.verificacion_pendiente[0] }];
  }
  return [];
}

/** Fecha de envío propuesta. El ejecutor la ajusta al horario razonable. */
export function cuandoEnviar(ahora: Date, enMinutos: number): Date {
  return new Date(ahora.getTime() + enMinutos * 60_000);
}

/**
 * Ajusta la hora al horario razonable: si cae de madrugada, se mueve a la
 * apertura del mismo día. Un recordatorio a las 3 a.m. es un reporte.
 */
export function ajustarAHorario(propuesta: Date, tz = "America/Bogota", inicio = 8, fin = 22): Date {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", hour12: false,
  }).format(propuesta);
  const hora = parseInt(partes, 10) % 24;

  if (hora >= inicio && hora < fin) return propuesta;

  // Fuera de horario: se programa a la apertura siguiente.
  const desfaseHoras = hora < inicio ? inicio - hora : 24 - hora + inicio;
  return new Date(propuesta.getTime() + desfaseHoras * 3600_000);
}

/** Texto por defecto cuando el copy no está en la base. */
export function textoDeRecordatorio(tipo: TipoRecordatorio, indice: number, _cfg?: CfgCopy): string {
  const lista = TEXTOS_RECORDATORIO[tipo] ?? [];
  return lista[Math.min(indice, lista.length - 1)] ?? "";
}
