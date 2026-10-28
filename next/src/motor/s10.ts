// next/src/motor/s10.ts — ESTADO S10_ENTREGA: el momento en que el cliente recibe
// lo que pagó.
//
// Es el punto más caro de fallar: un pago cobrado sin entrega es un reclamo, y los
// reclamos por no-entrega son la vía nº 1 de reportes que tumban un número de
// WhatsApp (plan maestro §9).
//
// ── MÉTODO DE ESTE PORT ───────────────────────────────────────────────────────
// Portado POR LECTURA de musa-webhook-twilio.ts:1144-1202. Sin prueba diferencial.
//
// LA PIEZA CRÍTICA: el original hace un «claim» atómico
//     update musa_leads set pagado=true where phone=$1 and pagado=false
// y solo entrega quien gana esa carrera. Aquí eso es el efecto `reclamar_entrega`:
// el motor NO puede decidirlo (depende de la BD), pero sí puede exigir que sea lo
// primero y que, si falla, se descarte todo lo demás. Eso evita la doble entrega
// cuando una captura y el operador llegan a la vez.
//
// OJO DEL ORIGINAL (L1178): existe una copia gemela de esta entrega en
// functions/musa-wompi-events.ts. En el repo nuevo hay UNA sola.

import { resolverPlaceholders } from "../../../functions/motor/copy.ts";
import type { CfgCopy, LeadNombre } from "../../../functions/motor/copy.ts";
import type { Efecto } from "./efectos.ts";

/** Nombres legibles de los bonos. El orden del copy manda; esto solo etiqueta. */
export const ETIQUETAS_BONOS: Record<string, string> = {
  coleccion_modelos: "Colección de Modelos",
  megapack_master_ia: "Megapack Master IA",
  youtube_money_machine: "YouTube Money Machine",
  audios_fempro: "Audios FemPro",
};

export const MENSAJE_BIENVENIDA =
  "¡Bienvenida oficialmente, {{nombre}}! 💜 Ya tienes acceso de por vida a todo. " +
  "Mi consejo: empieza HOY por el *Módulo 1* (el primer enlace de arriba) y avanza a tu ritmo. " +
  "Cualquier duda me escribes por aquí 😊";

export interface Entrega {
  bloqueModulos: string;
  bloqueBonos: string;
  bienvenida: string;
  modulos: number;
  bonos: number;
  tienePlan: boolean;
}

/** Compone la entrega sin efectos secundarios: sirve para revisarla y para probarla. */
export function componerEntrega(lead: LeadNombre, cfg: CfgCopy): Entrega {
  const modulos = cfg.entrega?.modulos ?? [];
  const bonos = cfg.entrega?.bonos ?? {};
  const plan = cfg.entrega?.plan_accion_7dias ?? "";

  const bloque1 = ["📚 *Tu curso (13 módulos):*"];
  modulos.forEach((url, i) => bloque1.push(`${i + 1}. ${url}`));

  const bloque2 = ["🎁 *Tus 4 bonos + regalo:*"];
  let n = 1;
  for (const [clave, url] of Object.entries(bonos)) {
    if (!url) continue;
    bloque2.push(`${n}. ${ETIQUETAS_BONOS[clave] ?? clave}: ${url}`);
    n++;
  }
  if (plan) bloque2.push(`🎁 *Regalo — Plan de Acción 7 Días:* ${plan}`);

  return {
    bloqueModulos: bloque1.join("\n"),
    bloqueBonos: bloque2.join("\n"),
    bienvenida: resolverPlaceholders(MENSAJE_BIENVENIDA, lead, cfg),
    modulos: modulos.length,
    bonos: n - 1,
    tienePlan: !!plan,
  };
}

/**
 * Efectos de la entrega, EN ESTE ORDEN:
 *   1. reclamar_entrega   (barrera: si no se gana, nada de lo demás ocurre)
 *   2. estado -> S10_ENTREGA
 *   3. enviar los 2 bloques + bienvenida (3 mensajes, nunca 17 sueltos)
 *   4. evento entrega_realizada con las cifras
 */
export function efectosEntrega(lead: LeadNombre, cfg: CfgCopy): Efecto[] {
  const e = componerEntrega(lead, cfg);
  return [
    { tipo: "reclamar_entrega" },
    { tipo: "estado", nuevo: "S10_ENTREGA" },
    { tipo: "enviar", textos: [e.bloqueModulos, e.bloqueBonos, e.bienvenida] },
    {
      tipo: "evento",
      nombre: "entrega_realizada",
      detalle: { modulos: e.modulos, bonos: e.bonos, tiene_plan: e.tienePlan },
    },
  ];
}
