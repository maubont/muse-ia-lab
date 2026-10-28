// next/src/monitor/vigilante.ts — EL BUCLE QUE VIGILA, con las dependencias fuera.
//
// Separado del anterior a propósito: `sesion.ts` decide, esto ejecuta. Así la
// decisión se prueba sin red y el cableado se prueba sin relojes.

import { decidirVigilancia, lineaDeLog } from "./sesion.ts";
import type { LecturaSesion, EstadoSesion } from "./sesion.ts";

export interface DepsVigilante {
  /** lee el estado real del canal */
  leerEstado: () => Promise<LecturaSesion>;
  /** envía la alerta por FUERA de WhatsApp (webhook, log…) */
  alertar: (texto: string) => Promise<void>;
  ahora?: () => number;
  repetirCadaMs?: number;
  graciaMs?: number;
}

export interface Vigilante {
  /** una pasada: útil para probar y para el endpoint */
  revisar: () => Promise<{ estado: EstadoSesion; alertado: boolean }>;
  arrancar: (cadaMs?: number) => void;
  detener: () => void;
  estadoActual: () => EstadoSesion;
}

export function crearVigilante(deps: DepsVigilante): Vigilante {
  const ahora = deps.ahora ?? (() => Date.now());
  let previo: { estado: EstadoSesion; desde: number; ultimoAviso: number | null } | null = null;
  let temporizador: ReturnType<typeof setInterval> | null = null;

  async function revisar() {
    let lectura: LecturaSesion;
    try {
      lectura = await deps.leerEstado();
    } catch (e) {
      // No poder leer el estado ES un estado: cuenta como caído.
      lectura = { estado: "desconocido", detalle: String(e).slice(0, 80) };
    }

    const decision = decidirVigilancia(lectura, previo, ahora(), {
      repetirCadaMs: deps.repetirCadaMs,
      graciaMs: deps.graciaMs,
    });

    // La memoria se actualiza ANTES de alertar: si el envío de la alerta falla,
    // no se entra en un bucle de reintentos que machaque al operador.
    previo = {
      estado: decision.estado,
      desde: previo && previo.estado === decision.estado ? previo.desde : ahora(),
      ultimoAviso: decision.alertar ? ahora() : (previo?.ultimoAviso ?? null),
    };

    if (decision.alertar && decision.mensaje) {
      console.log(decision.mensaje);
      try {
        await deps.alertar(decision.mensaje);
      } catch (e) {
        console.error("[monitor] no se pudo enviar la alerta:", String(e).slice(0, 120));
      }
    } else if (decision.tipo === "sigue_caida") {
      console.log(lineaDeLog(lectura));
    }

    return { estado: decision.estado, alertado: decision.alertar };
  }

  return {
    revisar,
    arrancar(cadaMs = 5 * 60_000) {
      if (temporizador) return;
      void revisar();
      temporizador = setInterval(() => void revisar(), cadaMs);
      // No mantener el proceso vivo solo por el vigilante.
      if (typeof temporizador.unref === "function") temporizador.unref();
    },
    detener() {
      if (temporizador) clearInterval(temporizador);
      temporizador = null;
    },
    estadoActual: () => previo?.estado ?? "desconocido",
  };
}

/**
 * Alerta por webhook externo. Sin URL configurada, solo deja constancia en el log:
 * es honesto — no prometemos un aviso que no va a llegar.
 */
export async function alertarPorWebhook(url: string | undefined, texto: string): Promise<void> {
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: texto, fuente: "musa-monitor", cuando: new Date().toISOString() }),
    signal: AbortSignal.timeout(10_000),
  });
}
