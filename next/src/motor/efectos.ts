// next/src/motor/efectos.ts — el MOTOR devuelve efectos, no los ejecuta.
//
// Esta es la costura que hace testeable el funnel: una función pura decide QUÉ
// hacer (una lista ordenada de efectos) y el runtime decide CÓMO hacerlo (Postgres,
// canal, GPT). Sin esto, probar el funnel exigiría base de datos, red y tokens.
//
// El orden de la lista ES parte del comportamiento: «marcar menor» antes de
// «enviar el mensaje suave» no es lo mismo que al revés.

import type { LeadNombre } from "../../../functions/motor/copy.ts";
import type { DatosComprobante } from "../../../functions/motor/comprobante.ts";

export type LeadMotor = LeadNombre & {
  phone: string;
  estado_funnel: string;
  mayor_18?: boolean | null;
};

/** Salida del clasificador GPT. null = no se llamó o no concluyó. */
export type ClasificacionGPT = {
  tipo: "edad_si" | "edad_menor" | "afirmativo" | "negativo" | "objecion" | string;
  objecion_id?: number | null;
} | null;

export type Efecto =
  /** actualiza columnas del lead */
  | { tipo: "lead"; patch: Record<string, unknown> }
  /** cambia el estado del funnel */
  | { tipo: "estado"; nuevo: string }
  /** telemetría: va a musa_funnel_events */
  | { tipo: "evento"; nombre: string; detalle: Record<string, unknown> }
  /** envía estos textos, en orden; [] significa "no decir nada" */
  | { tipo: "enviar"; textos: string[] }
  /** deja que el GPT responda; si escala a humano, NO seguir con lo que venga después */
  | { tipo: "gpt_responder"; instruccion: string; abortar_si_escala: boolean }
  /** respuesta libre de fallback */
  | { tipo: "gpt_fallback" }
  /** respuesta de la objeción con ese id (1-based del copy) */
  | { tipo: "responder_objecion"; id: number; conRecierre?: boolean }
  /** re-pregunta del gate, alternando redacción según el último mensaje enviado */
  | { tipo: "reask_gate"; motivo: string }
  /**
   * BARRERA de entrega: el runtime debe reclamar el paso `pagado: false -> true`
   * de forma atómica. Si no lo gana (otra captura u operador llegó primero), se
   * descartan todos los efectos posteriores y se registra
   * `entrega_omitida_ya_pagado`. El motor no puede decidirlo: depende de la BD.
   */
  | { tipo: "reclamar_entrega" }
  /**
   * Persiste el comprobante en `musa_payments`. El runtime decide el `short_id`,
   * aplica el dedupe por `UNIQUE (metodo, ref_normalizada)` y, si choca, vuelve a
   * llamar al estado con `refDuplicada: true`.
   */
  | { tipo: "registrar_pago"; estado: "aprobado" | "revision"; motivo: string | null; datos: DatosComprobante | null }
  /** Avisa al operador (dueño). El texto puede llevar `{{short_id}}`. */
  | { tipo: "notificar_operador"; texto: string }
  /** Envía un adjunto (video del avatar) con su pie de texto. */
  | { tipo: "enviar_media"; url: string; mediaTipo: "video" | "imagen"; texto: string }
  /**
   * Entrega el curso. El token de acceso se crea en el momento, así que esto NO
   * puede decidirse aquí: necesita la base. `respaldo` son los bloques con los
   * enlaces sueltos, para cuando no hay dominio público configurado.
   */
  | { tipo: "entregar_curso"; bienvenida: string; respaldo: string[] };

/** Saca los efectos de un tipo (ayuda en pruebas y en el runtime). */
export function deTipo<T extends Efecto["tipo"]>(efectos: Efecto[], tipo: T): Extract<Efecto, { tipo: T }>[] {
  return efectos.filter((e): e is Extract<Efecto, { tipo: T }> => e.tipo === tipo);
}
