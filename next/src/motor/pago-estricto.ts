// next/src/motor/pago-estricto.ts — ENDURECER LA DECISIÓN DEL COMPROBANTE.
//
// ── POR QUÉ UNA CAPA Y NO UN CAMBIO ──────────────────────────────────────────
// `functions/motor/comprobante.ts` está probado DIFERENCIALMENTE contra el código
// en producción (5.032 comparaciones, 0 diferencias). Si se modifica, se pierde
// esa garantía: ya no se sabría si un cambio de comportamiento es una mejora o un
// error de port.
//
// Así que el original queda intacto y esta capa SOLO ENDURECE: nunca convierte un
// rechazo en aprobación. Si el original dice «a humano», aquí se queda en humano.
//
// ── LO QUE CIERRA (decisiones del dueño, 28-oct-2026) ───────────────────────
//   1. Venezuela fuera del lanzamiento.
//   2. Ventana de 24 horas, no 3 días.
//   3. Destino por coincidencia EXACTA, nunca por subcadena.
//   4. Monto que no cuadra -> cola humana (antes pasaba hasta 3×).
//   5. Cuentas marcadas como simulación -> nunca aprueban.

import type { CfgComprobante, DatosComprobante, Decision } from "../../../functions/motor/comprobante.ts";
import { soloDigitos, decidirComprobante as decidirComprobanteVerificado } from "../../../functions/motor/comprobante.ts";

export interface ContextoEstricto {
  /** Para las pruebas; en producción, ahora mismo. */
  ahora?: Date;
  /** Ventana de validez del comprobante. Por defecto 24 h. */
  ventanaHoras?: number;
  /** Solo Colombia en este lanzamiento. */
  permiteVenezuela?: boolean;
}

/** Un destino propio con la información necesaria para decidir con rigor. */
export interface DestinoPropio {
  /** valor tal cual está en la configuración */
  original: string;
  /** solo dígitos, si es numérico */
  digitos: string | null;
  /** normalizado (minúsculas, sin espacios) para llaves alfanuméricas como Bre-B */
  alfa: string;
  /** país de la cuenta */
  pais: "CO" | "VE";
  /** viene de cuentas marcadas como simulación */
  simulacion: boolean;
}

/** Normaliza un destino del comprobante a solo dígitos, quitando el prefijo 57. */
export function normalizarDestino(valor: string | null | undefined): { digitos: string | null; alfa: string } {
  const crudo = String(valor ?? "").trim();
  const alfa = crudo.toLowerCase().replace(/[@\s]/g, "");
  let d = soloDigitos(crudo);
  // Prefijo de país de Colombia: 57 + 10 dígitos -> 10 dígitos.
  if (d.length === 12 && d.startsWith("57")) d = d.slice(2);
  return { digitos: d.length >= 6 ? d : null, alfa };
}

/**
 * Destinos propios REALES: excluye los que están marcados como simulación.
 * Las llaves alfanuméricas (Bre-B) se conservan tal cual: destruirlas a dígitos
 * las volvería comparables con cualquier cosa.
 */
export function destinosReales(cfg: CfgComprobante): DestinoPropio[] {
  const salida: DestinoPropio[] = [];
  const agregar = (valor: string | undefined, pais: "CO" | "VE", simulacion: boolean) => {
    const v = String(valor ?? "").trim();
    if (!v) return;
    const { digitos, alfa } = normalizarDestino(v);
    if (!digitos && alfa.length < 4) return;
    salida.push({ original: v, digitos, alfa, pais, simulacion });
  };

  const co = cfg.cuentasCo ?? {};
  const ve = cfg.cuentasVe ?? {};
  const coSimulacion = (co as { es_simulacion?: boolean }).es_simulacion === true ||
    (co as { provisional?: boolean }).provisional === true;
  const veSimulacion = (ve as { es_simulacion?: boolean }).es_simulacion === true ||
    (ve as { provisional?: boolean }).provisional === true;

  agregar(co.nequi?.numero, "CO", coSimulacion);
  agregar(co.bancolombia?.numero, "CO", coSimulacion);
  agregar(co.breb?.llave, "CO", coSimulacion);
  agregar(ve.pago_movil?.telefono, "VE", veSimulacion);
  agregar(ve.cuenta?.numero, "VE", veSimulacion);

  return salida;
}

/**
 * ¿El comprobante apunta EXACTAMENTE a uno de nuestros destinos?
 * Compara solo el campo `destino` (el receptor real). Los `numeros_detectados`
 * son cualquier número que aparezca en la imagen —incluida la referencia— y por
 * eso NO sirven para aprobar.
 */
export function coincideDestinoExacto(
  d: DatosComprobante,
  destinos: DestinoPropio[],
): { coincide: boolean; motivo?: string } {
  const cand = normalizarDestino(d.destino);
  const utiles = destinos.filter((x) => !x.simulacion);

  if (utiles.length === 0) return { coincide: false, motivo: "sin_destinos_reales" };

  for (const destino of utiles) {
    if (destino.digitos && cand.digitos && destino.digitos === cand.digitos) return { coincide: true };
    if (!destino.digitos && cand.alfa === destino.alfa) return { coincide: true };
    if (cand.alfa && destino.alfa && (cand.alfa === destino.alfa || cand.alfa.includes(destino.alfa))) return { coincide: true };
  }
  return { coincide: false, motivo: "destino_no_exacto" };
}

/**
 * PUNTO DE ENTRADA ÚNICO. Es lo que el motor debe llamar en lugar de
 * `decidirComprobante` a secas.
 *
 * El orden importa y esto se aprendió en las pruebas: el módulo verificado
 * rechaza el monto ANTES de que la capa estricta pueda mirar el país, así que el
 * filtro de país tiene que ir PRIMERO. Si no, un comprobante venezolano termina en
 * la cola humana por «pago incompleto» en vez de por «moneda no habilitada» — el
 * resultado es el mismo, pero el motivo miente y quien revise no entiende qué pasa.
 */
export function evaluarPago(
  cfg: CfgComprobante,
  d: DatosComprobante,
  esPrimerPagoAprobado: boolean,
  ctx: ContextoEstricto = {},
): Decision {
  const moneda = String(d.moneda ?? "").toUpperCase();
  if (!ctx.permiteVenezuela && (moneda === "VES" || moneda === "BS")) {
    return { accion: "COLA_HUMANA", motivo: "moneda_no_habilitada" };
  }
  return endurecer(decidirComprobanteVerificado(cfg, d, esPrimerPagoAprobado), d, cfg, ctx);
}

/**
 * Envuelve la decisión del módulo verificado.
 * REGLA: solo puede empeorar el resultado (aprobar -> humano). Nunca al revés.
 */
export function endurecer(
  base: Decision,
  d: DatosComprobante,
  cfg: CfgComprobante,
  ctx: ContextoEstricto = {},
): Decision {
  // Si el original ya pidió reenvío o humano, aquí no se discute.
  if (base.accion !== "AUTO_APROBAR") return base;

  const ahora = ctx.ahora ?? new Date();
  const ventanaHoras = ctx.ventanaHoras ?? 24;

  // 1) Venezuela fuera del lanzamiento.
  const moneda = String(d.moneda ?? "").toUpperCase();
  if (!ctx.permiteVenezuela && (moneda === "VES" || moneda === "BS")) {
    return { accion: "COLA_HUMANA", motivo: "moneda_no_habilitada" };
  }

  // 2) El destino tiene que ser real (no de simulación) y exacto.
  const destinos = destinosReales(cfg);
  const verificacion = coincideDestinoExacto(d, destinos);
  if (!verificacion.coincide) {
    return { accion: "COLA_HUMANA", motivo: verificacion.motivo ?? "destino_no_exacto" };
  }

  // 2.b) REFERENCIA OBLIGATORIA.
  // Sin referencia no hay forma de comprobar que un pago es único: dos personas
  // podrían presentar la misma captura sin número legible y aprobarse las dos.
  // PostgreSQL no protege de eso: un UNIQUE con NULL permite filas repetidas.
  const referencia = String(d.numero_referencia ?? "").replace(/[^A-Za-z0-9]/g, "");
  if (referencia.length < 4) {
    return { accion: "COLA_HUMANA", motivo: "sin_referencia" };
  }

  // 3) Ventana de 24 horas calibrada en Colombia (America/Bogota, UTC-5).
  if (d.fecha) {
    let marcaTiempo: number;
    if (d.hora) {
      const horaStr = d.hora.length === 5 ? `${d.hora}:00` : d.hora;
      marcaTiempo = new Date(`${d.fecha}T${horaStr}-05:00`).getTime();
    } else {
      // Si solo viene fecha (sin hora), se toma el final del día en Colombia (23:59:59 -05:00)
      // para evitar rechazar erróneamente comprobantes pagados la noche anterior.
      marcaTiempo = new Date(`${d.fecha}T23:59:59-05:00`).getTime();
    }

    if (Number.isNaN(marcaTiempo)) {
      return { accion: "COLA_HUMANA", motivo: "fecha_ilegible" };
    }
    const horas = (ahora.getTime() - marcaTiempo) / 3600_000;
    if (horas > ventanaHoras) return { accion: "COLA_HUMANA", motivo: "comprobante_viejo" };
    if (horas < -24) return { accion: "COLA_HUMANA", motivo: "fecha_futura" };
  }

  // 4) El monto tiene que cuadrar. Cualquier diferencia, a humano.
  const esperado = d.moneda && String(d.moneda).toUpperCase() === "USD"
    ? Number(cfg.precio?.usd ?? 5)
    : Number(cfg.precio?.cop ?? 20000);
  // MONTOS VÁLIDOS, no un único monto. Con un solo valor, cualquier comprador de un
  // upsell caía irremediablemente en cola humana. La lista sale de la configuración.
  const extra = (cfg.precio as { montos_extra?: unknown })?.montos_extra;
  const adicionales = Array.isArray(extra)
    ? extra.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const validos = [esperado, ...adicionales];
  const cuadra = d.monto != null && validos.some((v) => Math.abs(d.monto! - v) <= 0.01);
  if (!cuadra) {
    return { accion: "COLA_HUMANA", motivo: "monto_no_coincide" };
  }

  return base;
}
