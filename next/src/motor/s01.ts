// next/src/motor/s01.ts — ENTRADA DE UN LEAD NUEVO (S00 → S01 → S02 → S04).
//
// Es lo PRIMERO que ve un cliente. Portado POR LECTURA de
// musa-webhook-twilio.ts:1775-1827 (`flujoLeadNuevo`).
//
// El orden del original, que se respeta:
//   1. dos mensajes de saludo (S01)
//   2. si preguntó el precio, respuesta inmediata (no se hace esperar)
//   3. momento avatar: si hay video, va con su caption y una segunda frase
//   4. stack + gate 18+ (S04) — se manda aquí, no al entrar a S04
//   5. el lead queda en S04_GATE18
//
// SIN AVATAR disponible se usa el «puente» del copy, que NUNCA promete un video
// que no se va a enviar (regla 1 del plan: no inventar pruebas).

import { etapa, resolverPlaceholders, sinPrefijo, formatMiles } from "../../../functions/motor/copy.ts";
import type { CfgCopy, LeadNombre } from "../../../functions/motor/copy.ts";
import type { Efecto, LeadMotor } from "./efectos.ts";

/** Video del avatar ya resuelto (caché de nombres o genérico). */
export interface AvatarListo {
  rama: string;
  url: string;
}

export interface EntradaLeadNuevo {
  lead: LeadMotor;
  cfg: CfgCopy;
  /** ¿el primer mensaje preguntaba por el precio? Se responde de inmediato. */
  pidePrecio: boolean;
  /** null = no hay video (pipeline apagado, ya enviado o sin caché) */
  avatar: AvatarListo | null;
}

/** Solo Colombia: precio fijo en COP con el USD como ancla. */
export function mensajePrecioRapido(cfg: CfgCopy): string {
  const cop = formatMiles(Number(cfg.precio?.cop ?? 33000));
  const usd = Number(cfg.precio?.usd ?? 9);
  return `El curso completo cuesta *${cop} COP* (≈ *${usd} USD*), pago único 💥 Incluye 13 módulos prácticos + 4 bonos + la Guía Rápida de Implementación, con acceso de por vida.`;
}

/** Stack S04 + pregunta 18+, listos para enviar tras el saludo. */
export function mensajesStackYGate(lead: LeadNombre, cfg: CfgCopy): string[] {
  const s04 = etapa(cfg, "S04_STACK_18");
  return [
    resolverPlaceholders(s04.mensajes[0], lead, cfg),
    resolverPlaceholders(s04.mensajes[1], lead, cfg),
  ];
}

export function decidirLeadNuevo(e: EntradaLeadNuevo): Efecto[] {
  const { lead, cfg, avatar } = e;
  const efectos: Efecto[] = [];

  // 1. saludo (S01): dos mensajes, con efecto tecleo en el canal
  const s01 = etapa(cfg, "S01_SALUDO");
  const saludo: string[] = [
    resolverPlaceholders(s01.mensajes[0], lead, cfg),
    resolverPlaceholders(s01.mensajes[1], lead, cfg),
  ];
  // 2. si preguntó el precio, no se le hace esperar
  if (e.pidePrecio) saludo.push(mensajePrecioRapido(cfg));
  efectos.push({ tipo: "enviar", textos: saludo });

  const soporte = mensajesStackYGate(lead, cfg);

  const urlAcademia = "https://server-production-3709.up.railway.app/academia.html";
  const textoDegustacion = `✨ *Degusta la plataforma antes de decidir:*\nPuedes explorar el estudio y ver la *Clase 1 gratis* aquí 👇\n${urlAcademia}`;

  // 3-4. momento avatar + stack/gate
  if (avatar) {
    const rama = (cfg.funnelCopy?.etapas ?? [])
      .find((x) => x.id === "S02_AVATAR")?.ramas?.[avatar.rama];
    const mensajes = rama?.mensajes ?? [];
    const caption = resolverPlaceholders(sinPrefijo(mensajes[0] ?? ""), lead, cfg) ||
      "¡Hola! Soy Musa, anfitriona oficial de Muse IA Lab y modelo virtual creada 100% con IA 🎬";

    efectos.push({ tipo: "enviar_media", url: avatar.url, mediaTipo: "video", texto: caption });
    if (mensajes[1]) {
      efectos.push({ tipo: "enviar", textos: [resolverPlaceholders(sinPrefijo(mensajes[1]), lead, cfg)] });
    }
    efectos.push({ tipo: "enviar", textos: [textoDegustacion, ...soporte] });
    efectos.push({ tipo: "lead", patch: { avatar_enviado: true } });
    efectos.push({ tipo: "evento", nombre: "avatar_enviado", detalle: { rama: avatar.rama, media_url: avatar.url } });
    efectos.push({ tipo: "estado", nuevo: "S04_GATE18" });
    return efectos;
  }

  // Sin avatar: puente que no promete nada que no se envíe.
  const puente = (cfg.funnelCopy?.etapas ?? [])
    .find((x) => x.id === "S02_AVATAR")?.ramas?.A?.sin_video ??
    "Te cuento todo en un momento 😉 Pero primero lo importante:";

  efectos.push({ tipo: "enviar", textos: [resolverPlaceholders(puente, lead, cfg), textoDegustacion, ...soporte] });
  efectos.push({ tipo: "lead", patch: { avatar_enviado: false } });
  efectos.push({ tipo: "estado", nuevo: "S04_GATE18" });
  return efectos;
}
