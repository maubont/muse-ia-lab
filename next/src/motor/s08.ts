// next/src/motor/s08.ts — ESTADO S08_ESPERA_CAPTURA: el comprobante de pago.
//
// Es el estado donde se decide si alguien recibe el producto gratis o si se
// rechaza un pago legítimo. Los dos errores cuestan dinero real.
//
// ── MÉTODO DE ESTE PORT ───────────────────────────────────────────────────────
// Portado POR LECTURA de musa-webhook-twilio.ts:2106-2344. Sin prueba diferencial.
// Se conserva el ORDEN de las guardas, que es lo que hace segura la función:
//
//   1. ¿ya pagó?            -> recordatorio, nunca re-entregar
//   2. ¿la visión falló?    -> cola humana (jamás auto-validar a ciegas)
//   3. ¿imagen repetida?    -> cola humana (el fraude nº1 es reutilizar captura)
//   4. decisión por código  -> `decidirComprobante` (antifraude, ya probado)
//   5. circuit breaker      -> cola humana (patrón de ataque con generador)
//   6. referencia repetida  -> cola humana (UNIQUE metodo+ref)
//   7. solo entonces       -> aprobar y entregar
//
// Las llamadas a visión, descarga, subida y base de datos NO viven aquí: entran
// como datos y salen como efectos. Así el estado se prueba sin red ni gastar tokens.

// La decisión pasa por la capa estricta (next/src/motor/pago-estricto.ts): no se
// toca el módulo verificado, se envuelve. Ver EVALUACION-P2-P3.md.
import { evaluarPago } from "./pago-estricto.ts";
import type { CfgComprobante, DatosComprobante } from "../../../functions/motor/comprobante.ts";
import type { CfgCopy } from "../../../functions/motor/copy.ts";
import type { Efecto, LeadMotor } from "./efectos.ts";
import { efectosEntrega } from "./s10.ts";

// ============================== textos fijos ==============================

export const MSG_PAGO_REENVIO =
  "¡Gracias! 🙏 La captura me quedó un poquito incompleta o no se ve clara. ¿Me reenvías el comprobante completo (que se vean el monto, la fecha y el número de referencia)? Así te confirmo el acceso enseguida ✨";

export const MSG_PAGO_VERIFICANDO_DENTRO =
  "¡Recibido! 🙌 Estoy verificando tu pago ahora mismo y te confirmo el acceso por aquí en unos minutos ✨";

export const MSG_PAGO_VERIFICANDO_FUERA =
  "¡Recibido! 🙌 Estoy verificando tu pago; en cuanto el equipo lo confirme (a primera hora) te llega aquí mismo todo el acceso ✨";

export const MSG_PAGO_EN_PROCESO =
  "¡Gracias! 🙏 Veo que tu operación aún aparece como en proceso o programada. Apenas tu banco la muestre como *exitosa*, reenvíamela y te activo el acceso al toque ✨";

export const MSG_PAGO_YA_TIENE_ACCESO =
  "¡Ya tienes tu acceso activo, no te preocupes! ✨ Tu pago ya quedó confirmado y tienes acceso de por vida a todo. Si no encuentras los enlaces o necesitas algo, me escribes con confianza 😊";

/** Motivos que reciben el acuse de «en proceso» en vez del genérico. */
export const MOTIVOS_EN_PROCESO = ["estado_en_proceso", "estado_programada", "estado_fallida"];

// ============================== tipos ==============================

export type LeadS08 = LeadMotor & { pagado?: boolean };

export interface EntradaS08 {
  lead: LeadS08;
  cfg: CfgCopy & CfgComprobante;
  /** Salida de la visión. null = no se pudo leer el comprobante. */
  datos: DatosComprobante | null;
  /** `image_phash` ya existe en otro pago: captura reutilizada. */
  imagenDuplicada?: boolean;
  /** UNIQUE (metodo, ref_normalizada) chocó al insertar. */
  refDuplicada?: boolean;
  /** El circuit breaker está disparado. */
  breakerActivo?: boolean;
  /** ¿estamos dentro del horario de verificación? (cambia el acuse) */
  dentroDeHorario: boolean;
  /** ¿es el primer pago aprobado de este lead? */
  esPrimerPago: boolean;
}

// ============================== decisión ==============================

export function decidirS08(e: EntradaS08): Efecto[] {
  const { lead, cfg, datos, dentroDeHorario } = e;
  const acuse = dentroDeHorario ? MSG_PAGO_VERIFICANDO_DENTRO : MSG_PAGO_VERIFICANDO_FUERA;

  // ── 1. Ya pagó: nunca re-entregar ────────────────────────────────────────
  if (lead.pagado === true) {
    return [
      { tipo: "evento", nombre: "comprobante_ignorado_ya_pagado", detalle: { phone: lead.phone } },
      { tipo: "enviar", textos: [MSG_PAGO_YA_TIENE_ACCESO] },
    ];
  }

  // ── 2. Sin datos de visión: a humano, jamás auto-validar ─────────────────
  if (!datos) return colaHumana("vision_fallida", null, acuse);

  // ── 3. Imagen reutilizada: a humano ──────────────────────────────────────
  if (e.imagenDuplicada) return colaHumana("imagen_duplicada", datos, acuse);

  // ── 4. Decisión por CÓDIGO (no por el LLM) ───────────────────────────────
  // Pasa por la capa estricta: destino exacto, Venezuela fuera, ventana de 24 h,
  // monto que cuadre y cuentas de simulación descartadas. Solo endurece.
  const decision = evaluarPago(cfg, datos, e.esPrimerPago);

  // ── 5. Captura incompleta: se pide otra, sin molestar al dueño ───────────
  if (decision.accion === "PEDIR_REENVIO") {
    return [
      { tipo: "registrar_pago", estado: "revision", motivo: decision.motivo, datos },
      { tipo: "evento", nombre: "pago_pedir_reenvio", detalle: { motivo: decision.motivo } },
      { tipo: "enviar", textos: [MSG_PAGO_REENVIO] },
    ];
  }

  // ── 6. Aprobación automática, con dos barreras más ───────────────────────
  if (decision.accion === "AUTO_APROBAR") {
    if (e.breakerActivo) {
      return [
        { tipo: "evento", nombre: "circuit_breaker", detalle: { banco: datos.banco_o_app } },
        ...colaHumana("circuit_breaker", datos, acuse),
      ];
    }
    if (e.refDuplicada) return colaHumana("referencia_duplicada", datos, acuse);

    return [
      { tipo: "registrar_pago", estado: "aprobado", motivo: null, datos },
      {
        tipo: "evento",
        nombre: "pago_aprobado_auto",
        detalle: { monto: datos.monto, moneda: datos.moneda, ref: datos.numero_referencia },
      },
      ...efectosEntrega(lead, cfg),
    ];
  }

  // ── 7. Cola humana por el motivo que dio el código ───────────────────────
  const motivo = e.refDuplicada ? "referencia_duplicada" : (decision.motivo ?? "revision");
  return colaHumana(motivo, datos, acuse);
}

/**
 * Cola humana: registrar en `revision`, avisar al dueño y dar un acuse al lead.
 * El `{{short_id}}` lo sustituye el runtime cuando ya conoce el id de la fila.
 */
function colaHumana(motivo: string, datos: DatosComprobante | null, acuse: string): Efecto[] {
  const acuseLead = MOTIVOS_EN_PROCESO.includes(motivo) ? MSG_PAGO_EN_PROCESO : acuse;
  const texto =
    `🔔 Pago para revisar #{{short_id}}\n` +
    `Método: ${datos?.metodo ?? "?"} | Monto: ${datos?.monto ?? "?"} ${datos?.moneda ?? ""}\n` +
    `Ref: ${datos?.numero_referencia ?? "?"} | Estado: ${datos?.estado_operacion ?? "?"}\n` +
    `Motivo: ${motivo}\n` +
    `Responde: ok {{short_id}} / no {{short_id}} <motivo> / ver {{short_id}}`;

  return [
    { tipo: "registrar_pago", estado: "revision", motivo, datos },
    { tipo: "evento", nombre: "pago_a_revision", detalle: { motivo } },
    { tipo: "notificar_operador", texto },
    { tipo: "estado", nuevo: "S09_VERIFICACION" },
    { tipo: "enviar", textos: [acuseLead] },
  ];
}
