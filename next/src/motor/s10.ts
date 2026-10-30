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

  // El contenido ya no son URLs sueltas: cada módulo es un objeto con título y
  // varios archivos. Pintar `${m}` a secas producía «[object Object]» — el cliente
  // habría recibido basura en vez del curso.
  const bloque1 = ["📚 *Tu curso (13 módulos):*"];
  modulos.forEach((m, i) => {
    const titulo = (m && typeof m === "object" && "titulo" in m && (m as { titulo?: string }).titulo) || `Módulo ${i + 1}`;
    const archivos = Array.isArray(m) ? m.length : (m && typeof m === "object" && Array.isArray((m as { archivos?: unknown[] }).archivos) ? (m as { archivos: unknown[] }).archivos.length : 0);
    bloque1.push(`${i + 1}. ${titulo}${archivos ? ` (${archivos} ${archivos === 1 ? "archivo" : "archivos"})` : ""}`);
  });

  const bloque2 = ["🎁 *Tus 4 bonos + regalo:*"];
  let n = 1;
  for (const [clave, valor] of Object.entries(bonos)) {
    const archivos = Array.isArray(valor) ? valor.filter(Boolean) : valor ? [valor] : [];
    if (archivos.length === 0) continue;
    const cuantos = archivos.length === 1 ? "1 archivo" : `${archivos.length} archivos`;
    bloque2.push(`${n}. ${ETIQUETAS_BONOS[clave] ?? clave} (${cuantos})`);
    n++;
  }
  if (plan) {
    // El plan puede ser una clave interna (`media:…`). Nunca se le enseña al cliente
    // una clave del almacén: o es un enlace de verdad, o se anuncia sin enlace.
    const visible = /^https?:\/\//i.test(plan) ? ` ${plan}` : "";
    bloque2.push(`🎁 *Regalo — Plan de Acción 7 Días:*${visible || " incluido"}`);
  }

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
 *   3. entregar_curso (un enlace personal; o los bloques sueltos si no hay dominio)
 *   4. evento entrega_realizada con las cifras
 *
 * POR QUÉ UN EFECTO Y NO UN `enviar`: el enlace personal lleva un token que hay
 * que crear en la base en ese instante. La decisión no puede hacerlo, pero sí
 * puede exigir que sea después de la barrera y antes del evento.
 */
export function efectosEntrega(lead: LeadNombre, cfg: CfgCopy): Efecto[] {
  const e = componerEntrega(lead, cfg);
  return [
    { tipo: "reclamar_entrega" },
    { tipo: "estado", nuevo: "S10_ENTREGA" },
    {
      tipo: "entregar_curso",
      bienvenida: e.bienvenida,
      respaldo: [e.bloqueModulos, e.bloqueBonos],
    },
    {
      tipo: "evento",
      nombre: "entrega_realizada",
      detalle: { modulos: e.modulos, bonos: e.bonos, tiene_plan: e.tienePlan },
    },
  ];
}
