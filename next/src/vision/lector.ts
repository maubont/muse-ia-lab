// next/src/vision/lector.ts — EL ORQUESTADOR DE LA LECTURA.
//
// Une las cuatro defensas, en este orden y sin saltarse ninguna:
//
//   1. PREFILTRO    ¿merece la pena leer esto?          (si no, no se gasta)
//   2. CACHE        ¿ya leímos este mismo archivo?      (si sí, no se paga)
//   3. PRESUPUESTO  ¿queda margen hoy?                  (si no, a humano)
//   4. PROVEEDOR    leer, validar, registrar el gasto
//
// Y la regla que manda sobre todas: **cualquier duda termina en un humano.**
// Nunca se aprueba un pago sin datos válidos. Un falso positivo cuesta dinero y
// credibilidad; un falso negativo cuesta un minuto de una persona.

import { createHash } from "node:crypto";
import type { Consultar } from "../db/repositorio.ts";
import type { DatosComprobante } from "../../../functions/motor/comprobante.ts";
import { prefiltrar } from "./prefiltro.ts";
import type { MediaEntrante, ResultadoPrefiltro } from "./prefiltro.ts";
import { consultarPresupuesto, registrarConsumo, costeEstimado } from "./presupuesto.ts";
import type { ConfigProveedor, RespuestaProveedor } from "./proveedor.ts";
import { leerConProveedor } from "./proveedor.ts";

export type ResultadoLectura =
  | { ok: true; datos: DatosComprobante; origen: "proveedor" | "cache"; coste: number }
  | { ok: false; accion: "pedir_reenvio" | "cola_humana"; motivo: string; coste: number };

export interface DepsLector {
  consultar: Consultar;
  proveedor: ConfigProveedor | null;
  /** tope de gasto diario en USD */
  presupuestoDiario?: number;
  /** trae los bytes de la imagen y la convierte en data URL */
  descargarImagen?: (url: string) => Promise<{ bytes: Buffer; tipo: string } | null>;
  fetchImpl?: typeof fetch;
  ahora?: () => Date;
}

/** Huella estable del contenido: el mismo archivo no se paga dos veces. */
export function huellaDe(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Tokens aproximados de una imagen: se usan para estimar el coste antes de llamar. */
export const TOKENS_ESTIMADOS_IMAGEN = 1200;
export const TOKENS_ESTIMADOS_SALIDA = 400;
/** Coste que se reserva antes de llamar, con margen. */
export function costeReservado(proveedor: ConfigProveedor): number {
  return costeEstimado(TOKENS_ESTIMADOS_IMAGEN + 400, TOKENS_ESTIMADOS_SALIDA, {
    entrada: proveedor.precioEntrada,
    salida: proveedor.precioSalida,
  });
}

export async function leerComprobante(
  deps: DepsLector,
  entrada: { lead: string; media: MediaEntrante | null; yaPago: boolean },
): Promise<ResultadoLectura> {
  // 1. PREFILTRO — sin gastar nada.
  const pre: ResultadoPrefiltro = prefiltrar({ media: entrada.media, yaPago: entrada.yaPago });
  if (!pre.leer) {
    return { ok: false, accion: pre.accion, motivo: pre.motivo, coste: 0 };
  }
  const media = entrada.media as MediaEntrante;

  // Sin proveedor configurado no se puede leer: a humano, no a ciegas.
  if (!deps.proveedor) {
    return { ok: false, accion: "cola_humana", motivo: "sin_proveedor_ia", coste: 0 };
  }

  // 2. Traer la imagen. Si falla, es un reenvío (no un rechazo).
  let bytes: Buffer | null = null;
  let tipo = media.tipo;
  try {
    if (deps.descargarImagen) {
      const descargada = await deps.descargarImagen(media.url);
      if (descargada) {
        bytes = descargada.bytes;
        tipo = descargada.tipo || tipo;
      }
    }
  } catch {
    bytes = null;
  }
  if (!bytes || bytes.length === 0) {
    return { ok: false, accion: "pedir_reenvio", motivo: "no_se_pudo_descargar", coste: 0 };
  }

  const huella = huellaDe(bytes);

  // 3. CACHE — el mismo comprobante no se paga dos veces.
  try {
    const { rows } = await deps.consultar(
      "select resultado, coste_usd from public.musa_lecturas_cache where huella = $1",
      [huella],
    );
    const fila = rows[0] as { resultado?: DatosComprobante; coste_usd?: string } | undefined;
    if (fila?.resultado) {
      return { ok: true, datos: fila.resultado, origen: "cache", coste: 0 };
    }
  } catch {
    /* sin cache se sigue: solo cuesta dinero, no corrección */
  }

  // 4. PRESUPUESTO — antes de llamar, no después.
  const reservado = costeReservado(deps.proveedor);
  const estado = await consultarPresupuesto(deps.consultar, {
    tope: deps.presupuestoDiario,
    estimado: reservado,
    ahora: deps.ahora?.(),
  });
  if (!estado.permitido) {
    return { ok: false, accion: "cola_humana", motivo: estado.motivo ?? "sin_presupuesto", coste: 0 };
  }

  // 5. PROVEEDOR.
  const dataUrl = `data:${tipo};base64,${bytes.toString("base64")}`;
  let respuesta: RespuestaProveedor;
  try {
    respuesta = await leerConProveedor(deps.proveedor, dataUrl, deps.fetchImpl ?? fetch);
  } catch (e) {
    respuesta = { datos: null, tokensEntrada: 0, tokensSalida: 0, motivoFallo: String(e).slice(0, 80) };
  }

  const coste = costeEstimado(respuesta.tokensEntrada, respuesta.tokensSalida, {
    entrada: deps.proveedor.precioEntrada,
    salida: deps.proveedor.precioSalida,
  });

  await registrarConsumo(deps.consultar, {
    lead: entrada.lead,
    proveedor: deps.proveedor.baseUrl,
    modelo: deps.proveedor.modelo,
    proposito: "comprobante",
    tokensEntrada: respuesta.tokensEntrada,
    tokensSalida: respuesta.tokensSalida,
    coste,
    exito: !!respuesta.datos,
    motivoFallo: respuesta.motivoFallo,
  });

  if (!respuesta.datos) {
    // Se pagó y no sirvió: a humano. No se reintenta solo (eso es el bucle caro).
    return { ok: false, accion: "cola_humana", motivo: respuesta.motivoFallo ?? "lectura_fallida", coste };
  }

  // Guardar en cache para no volver a pagar por el mismo archivo.
  try {
    await deps.consultar(
      "insert into public.musa_lecturas_cache (huella, resultado, modelo, coste_usd) values ($1,$2,$3,$4) on conflict (huella) do nothing",
      [huella, JSON.stringify(respuesta.datos), deps.proveedor.modelo, Number(coste.toFixed(6))],
    );
  } catch {
    /* si no se puede cachear, se sigue */
  }

  return { ok: true, datos: respuesta.datos, origen: "proveedor", coste };
}
