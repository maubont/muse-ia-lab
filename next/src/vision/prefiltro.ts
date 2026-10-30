// next/src/vision/prefiltro.ts — LO QUE NO MERECE UNA LLAMADA.
//
// Antes de gastar un solo token, se descarta lo que no puede aprobarse de todas
// formas. Cada rechazo aquí es dinero que no se gasta y un riesgo que no se corre.
//
// Orden de descarte (primero lo más barato de comprobar):
//   1. no hay imagen                    -> pedir el comprobante
//   2. tipo no soportado (pdf, video)   -> pedir captura
//   3. demasiado grande                 -> rechazar sin leer
//   4. ya tenemos un pago aprobado      -> cola humana (no se cobra dos veces)
//   5. ya se leyó ese mismo archivo     -> se reutiliza la lectura (cache)

export interface MediaEntrante {
  /** url o base64; solo se usa como referencia */
  url: string;
  /** mime que declara el canal */
  tipo: string;
  /** bytes, si el canal lo da */
  tamano?: number;
}

export type ResultadoPrefiltro =
  | { leer: true; motivo?: undefined }
  | { leer: false; accion: "pedir_reenvio" | "cola_humana"; motivo: string };

/** Tipos que un modelo de visión puede leer bien. */
export const TIPOS_ACEPTADOS = ["image/jpeg", "image/jpg", "image/png", "image/webp"] as const;

/** 8 MB: por encima de esto el coste y el tiempo no compensan. */
export const TAMANO_MAXIMO_BYTES = 8 * 1024 * 1024;

export interface ContextoPrefiltro {
  /** el lead ya tiene un pago aprobado */
  yaPago: boolean;
  /** ¿hay un media adjunto? */
  media: MediaEntrante | null;
  /**
   * ¿ya tenemos los bytes en la mano?
   *
   * IMPRESCINDIBLE: el adaptador de Evolution entrega `obtenerBytes()`, NO una
   * `url`. Exigir `url` hacía que toda imagen real de WhatsApp se clasificara como
   * «sin_imagen» y el cliente entrara en un bucle de reenvíos.
   */
  tieneBytes?: boolean;
}

export function prefiltrar(ctx: ContextoPrefiltro): ResultadoPrefiltro {
  if (!ctx.media || (!ctx.media.url && !ctx.tieneBytes)) {
    return { leer: false, accion: "pedir_reenvio", motivo: "sin_imagen" };
  }

  const tipo = (ctx.media.tipo ?? "").toLowerCase().split(";")[0].trim();
  if (!TIPOS_ACEPTADOS.includes(tipo as (typeof TIPOS_ACEPTADOS)[number])) {
    // Un PDF o un video no se leen: se pide una captura. No es un rechazo del
    // cliente, es una petición clara.
    return { leer: false, accion: "pedir_reenvio", motivo: "tipo_no_soportado" };
  }

  if (ctx.media.tamano !== undefined && ctx.media.tamano <= 0) {
    return { leer: false, accion: "pedir_reenvio", motivo: "archivo_vacio" };
  }

  if (ctx.media.tamano !== undefined && ctx.media.tamano > TAMANO_MAXIMO_BYTES) {
    return { leer: false, accion: "pedir_reenvio", motivo: "archivo_demasiado_grande" };
  }

  if (ctx.yaPago) {
    // Si ya pagó una vez, un segundo comprobante no se lee solo: lo mira una
    // persona. Evita el doble cobro y el doble gasto.
    return { leer: false, accion: "cola_humana", motivo: "lead_ya_tiene_pago" };
  }

  return { leer: true };
}
