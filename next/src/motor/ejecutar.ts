// next/src/motor/ejecutar.ts — EJECUTOR DE EFECTOS.
//
// El motor decide (devuelve efectos). Este módulo los ejecuta contra un
// `Repositorio` inyectable. Separar las dos cosas es lo que permite probar el
// funnel entero con un repositorio falso, sin base de datos.
//
// Dos reglas que NO son negociables y viven aquí:
//
//   1. `reclamar_entrega` es una BARRERA. Si el repositorio no gana el claim
//      atómico (otra captura u operador llegó primero), se descarta todo lo que
//      venga después. Entregar dos veces es peor que no entregar.
//   2. `registrar_pago` puede chocar con UNIQUE(metodo, ref). Cuando pasa, se
//      devuelve `dupeRef: true` y el llamador vuelve a pedir la decisión con
//      `refDuplicada: true`. Aquí no se adivina.

import type { Efecto } from "./efectos.ts";
import type { DatosComprobante } from "../../../functions/motor/comprobante.ts";

/** Lo que el ejecutor necesita del mundo exterior. Todo inyectable. */
export interface Repositorio {
  actualizarLead(phone: string, patch: Record<string, unknown>): Promise<void>;
  cambiarEstado(phone: string, estado: string): Promise<void>;
  registrarEvento(phone: string, nombre: string, detalle: Record<string, unknown>): Promise<void>;
  /** Inserta en `musa_payments`. Si choca el UNIQUE de la referencia, `dupeRef`. */
  registrarPago(
    phone: string,
    pago: { estado: "aprobado" | "revision"; motivo: string | null; datos: DatosComprobante | null },
  ): Promise<{ shortId: string } | { dupeRef: true }>;
  /** Claim atómico `pagado: false -> true`. false = no se ganó la carrera. */
  reclamarEntrega(phone: string): Promise<boolean>;
  notificarOperador(texto: string): Promise<void>;
  /** Devuelve si TODOS los mensajes salieron. Un fallo parcial se reintenta. */
  enviar(phone: string, textos: string[]): Promise<{ ok: boolean }>;
  /** Adjunto con pie de texto (video del avatar). */
  enviarMedia(phone: string, media: { url: string; tipo: "video" | "imagen"; texto: string }): Promise<void>;
  /**
   * Entrega del curso: crea el acceso personal y manda el enlace.
   * Si no hay dominio público configurado, cae al respaldo con los enlaces sueltos
   * — nunca deja al cliente sin nada.
   */
  entregarCurso(phone: string, entrega: { bienvenida: string; respaldo: string[] }): Promise<void>;
  gptResponder(args: { instruccion: string; abortarSiEscala: boolean }): Promise<{ escalo: boolean }>;
  gptFallback(phone: string): Promise<void>;
  responderObjecion(phone: string, args: { id: number; conRecierre: boolean }): Promise<void>;
  reaskGate(phone: string, motivo: string): Promise<void>;
}

export interface ResumenEjecucion {
  ejecutados: number;
  /** true si la barrera de entrega no se ganó: no se hizo nada después */
  entregaOmitida: boolean;
  /** true si el pago chocó con la referencia única: repetir con `refDuplicada` */
  dupeRef: boolean;
  /** id corto del pago, si se registró */
  shortId: string | null;
  /** true si un `gpt_responder` escaló y había que abortar */
  abortadoPorEscalado: boolean;
}

export async function ejecutar(
  efectos: Efecto[],
  deps: { repo: Repositorio; phone: string },
): Promise<ResumenEjecucion> {
  const { repo, phone } = deps;
  const resumen: ResumenEjecucion = {
    ejecutados: 0,
    entregaOmitida: false,
    dupeRef: false,
    shortId: null,
    abortadoPorEscalado: false,
  };

  for (const efecto of efectos) {
    switch (efecto.tipo) {
      case "lead":
        await repo.actualizarLead(phone, efecto.patch);
        break;

      case "estado":
        await repo.cambiarEstado(phone, efecto.nuevo);
        break;

      case "evento":
        await repo.registrarEvento(phone, efecto.nombre, efecto.detalle);
        break;

      case "enviar":
        // `[]` significa "no decir nada": no se llama al canal.
        if (efecto.textos.length > 0) await repo.enviar(phone, efecto.textos);
        break;

      case "gpt_responder": {
        const r = await repo.gptResponder({
          instruccion: efecto.instruccion,
          abortarSiEscala: efecto.abortar_si_escala,
        });
        if (r.escalo && efecto.abortar_si_escala) {
          resumen.abortadoPorEscalado = true;
          resumen.ejecutados++;
          return resumen; // el resto de la lista ya no aplica
        }
        break;
      }

      case "gpt_fallback":
        await repo.gptFallback(phone);
        break;

      case "responder_objecion":
        await repo.responderObjecion(phone, { id: efecto.id, conRecierre: efecto.conRecierre ?? false });
        break;

      case "reask_gate":
        await repo.reaskGate(phone, efecto.motivo);
        break;

      case "entregar_curso":
        await repo.entregarCurso(phone, { bienvenida: efecto.bienvenida, respaldo: efecto.respaldo });
        break;

      case "enviar_media":
        await repo.enviarMedia(phone, {
          url: efecto.url,
          tipo: efecto.mediaTipo,
          texto: efecto.texto,
        });
        break;

      case "reclamar_entrega": {
        const ganada = await repo.reclamarEntrega(phone);
        if (!ganada) {
          // Otra vía ya entregó. Se registra y se corta: lo de después entregaría
          // por segunda vez.
          await repo.registrarEvento(phone, "entrega_omitida_ya_pagado", {});
          resumen.entregaOmitida = true;
          resumen.ejecutados++;
          return resumen;
        }
        break;
      }

      case "registrar_pago": {
        const r = await repo.registrarPago(phone, {
          estado: efecto.estado,
          motivo: efecto.motivo,
          datos: efecto.datos,
        });
        if ("dupeRef" in r) {
          resumen.dupeRef = true;
          resumen.ejecutados++;
          return resumen; // el llamador vuelve a decidir con refDuplicada
        }
        resumen.shortId = r.shortId;
        break;
      }

      case "notificar_operador": {
        const texto = efecto.texto.replaceAll("{{short_id}}", resumen.shortId ?? "?");
        await repo.notificarOperador(texto);
        break;
      }
    }
    resumen.ejecutados++;
  }

  return resumen;
}
