// next/src/motor/router.ts — EL ENRUTADOR: las guardas globales y el despacho.
//
// Es la pieza que decide QUÉ estado atiende el mensaje. El orden está copiado de
// musa-webhook-twilio.ts:2688-2812 y **no es negociable**:
//
//   1. `opt_out`            -> silencio total, para siempre.
//   2. STOP/SALIR/CANCELAR  -> opt-out. Funciona SIEMPRE, incluso en pausa.
//   3. «¿eres un bot?»      -> respuesta de la objeción + retomar la etapa.
//   4. pide humano          -> escalar y avisar (salvo que sea la pregunta de bot).
//   5. despacho por estado.
//
// El punto 2 es una obligación legal, no una preferencia: si el enrutador se
// equivoca y sigue escribiendo a quien pidió salir, el número se cae.

import {
  esStopTotal,
  preguntaPorBot,
  pideHumano,
  preguntaPrecio,
  normalizar,
} from "../../../functions/motor/guardarrailes.ts";
import { etapa, resolverPlaceholders } from "../../../functions/motor/copy.ts";
import type { CfgCopy, LeadNombre } from "../../../functions/motor/copy.ts";
import type { CfgComprobante } from "../../../functions/motor/comprobante.ts";
import type { ClasificacionGPT, Efecto, LeadMotor } from "./efectos.ts";
import { decidirS04 } from "./s04.ts";
import { decidirS06 } from "./s06.ts";
import { decidirS08 } from "./s08.ts";
import type { EntradaS08 } from "./s08.ts";
import { decidirLeadNuevo } from "./s01.ts";
import type { AvatarListo } from "./s01.ts";
import { detectarIntencionEscalado, generarMensajeHandoffCliente } from "./deteccion-escalado.ts";

/** «Listo, quedas fuera»: el único mensaje que se manda tras un STOP. */
export const MSG_OPTOUT =
  "Listo 👍 Quedas fuera de la lista y no te volveré a escribir. ¡Gracias por tu tiempo y que te vaya bonito! ✨";

/**
 * En S09 el lead YA PAGÓ y espera verificación humana. Escribir y no recibir
 * nada es lo que más desespera a alguien que acaba de pagar: siempre se acusa.
 * Copiado literal del original (L1563-1564).
 */
export const MSG_VERIFICANDO =
  "Seguimos verificando tu pago ✅ Tu acceso queda asegurado; te confirmo por aquí mismo apenas esté listo ✨";

/** Pregunta de retorno por etapa. El original tiene un mapa; aquí lo esencial. */
export const PREGUNTA_PENDIENTE: Record<string, string> = {
  S04_GATE18: "¿Me confirmas que ya tienes 18 años o más?",
  S08_ESPERA_CAPTURA: "¿Pudiste hacer el pago? Te leo por aquí 😊",
};
const PREGUNTA_GENERICA = "¿En qué te puedo ayudar? 😊";

export type CfgRouter = CfgCopy &
  CfgComprobante & {
    funnelCopy?: { etapas: Array<{ id: string; mensajes: string[] }>; objeciones?: Array<{ objecion: string; respuesta: string }> };
  };

export type LeadRouter = LeadMotor & {
  opt_out?: boolean;
  escalado_humano?: boolean;
  pagado?: boolean;
};

export interface EntradaRuta {
  lead: LeadRouter;
  cfg: CfgRouter;
  body: string;
  norm: string;
  clasificacion?: ClasificacionGPT;
  /** Solo se usa si el estado es S08 y llega un comprobante. */
  comprobante?: Omit<EntradaS08, "lead" | "cfg">;
  /** Video del avatar listo para enviar, si el pipeline lo tiene. */
  avatar?: AvatarListo | null;
}

export function preguntaDeEtapa(estado: string): string {
  return PREGUNTA_PENDIENTE[estado] ?? PREGUNTA_GENERICA;
}

export function decidirRuta(e: EntradaRuta): Efecto[] {
  const { lead, cfg, body } = e;
  const norm = e.norm ?? normalizar(body ?? "");

  // 1. Ya pidió salir: silencio absoluto. Ni acuse, ni seguimiento.
  if (lead.opt_out === true) return [];

  // 2. STOP: funciona siempre, incluso con el bot en pausa por escalado.
  if (esStopTotal(norm)) {
    return [
      { tipo: "lead", patch: { opt_out: true } },
      { tipo: "evento", nombre: "optout", detalle: {} },
      { tipo: "enviar", textos: [MSG_OPTOUT] },
    ];
  }

  // 2.b RESET / REINICIAR: permite reiniciar la prueba del funnel desde cero.
  if (norm === "reset" || norm === "reiniciar" || norm === "recomenzar") {
    return [
      {
        tipo: "lead",
        patch: {
          estado_funnel: "S00_LLEGADA",
          pagado: false,
          mayor_18: false,
          escalado_humano: false,
        },
      },
      { tipo: "evento", nombre: "lead_reiniciado", detalle: {} },
      {
        tipo: "enviar",
        textos: [
          "¡Listo! He restablecido nuestra conversación. ¿En qué te puedo ayudar hoy? ✨",
        ],
      },
    ];
  }

  // 2.c GUARDA DE ESCALADO A HUMANO ACTIVO:
  // Si el lead ya está en atención humana, el bot NO interfiere con automatizaciones de venta.
  if (lead.escalado_humano === true) {
    const numLimpio = lead.phone.replace(/[^\d]/g, "");
    return [
      { tipo: "evento", nombre: "mensaje_durante_escalado", detalle: { body } },
      {
        tipo: "notificar_operador",
        texto: `💬 Mensaje de ${lead.phone} mientras espera asesor humano:\n"${body.slice(0, 160)}"\n👉 Responder: https://wa.me/${numLimpio}`,
      },
    ];
  }

  // 3. «¿Eres un bot?»: se responde con la objeción del copy, sin mentir.
  if (norm && preguntaPorBot(norm)) {
    const objeciones = cfg.funnelCopy?.objeciones ?? [];
    const idx = objeciones.findIndex((o) => /bot/i.test(o.objecion));
    const efectos: Efecto[] = [];
    if (idx >= 0) {
      efectos.push({ tipo: "responder_objecion", id: idx + 1, conRecierre: false });
      if (lead.estado_funnel !== "S00_LLEGADA") {
        efectos.push({ tipo: "enviar", textos: [preguntaDeEtapa(lead.estado_funnel)] });
        return efectos;
      }
      return efectos;
    }
    // Sin objeción de bot en el copy: no se inventa una respuesta.
  }

  // 4. Detección multicapa de escalado a humano (solicitud explícita, frustración, incertidumbre, reclamos)
  const deteccionEscalado = detectarIntencionEscalado(body);
  if ((deteccionEscalado.debeEscalar || (norm && pideHumano(norm))) && !preguntaPorBot(norm)) {
    const nombreLead = (lead as LeadNombre).nombre || (lead as { profile_name?: string }).profile_name || null;
    const textoConfirmacion = generarMensajeHandoffCliente(nombreLead);
    const numLimpio = lead.phone.replace(/[^\d]/g, "");
    const motivo = deteccionEscalado.motivo ?? "solicitud_explicita";

    return [
      { tipo: "lead", patch: { escalado_humano: true } },
      { tipo: "evento", nombre: "escalado", detalle: { motivo, detalle: deteccionEscalado.detalle } },
      {
        tipo: "notificar_operador",
        texto:
          `🚨 ATENCIÓN REQUERIDA — ESCALADO A HUMANO 🚨\n\n` +
          `👤 *Lead:* ${nombreLead || lead.phone}\n` +
          `📱 *Teléfono:* ${lead.phone}\n` +
          `📍 *Etapa:* ${lead.estado_funnel}\n` +
          `⚠️ *Motivo:* ${motivo}\n` +
          `📝 *Mensaje:* "${body.slice(0, 160)}"\n\n` +
          `👉 *Responder en 1 clic:* https://wa.me/${numLimpio}\n` +
          `⚡ *Para reactivar el bot cuando termines, responde:* reanudar ${lead.phone}`,
      },
      { tipo: "enviar", textos: [textoConfirmacion] },
    ];
  }

  // 5. Despacho por estado.
  switch (lead.estado_funnel) {
    case "S00_LLEGADA":
    case "S01_SALUDO":
    case "S02_AVATAR":
      return decidirLeadNuevo({
        lead,
        cfg,
        pidePrecio: !!norm && preguntaPrecio(norm),
        // Sin avatar disponible se usa el puente del copy, que no promete video.
        avatar: e.avatar ?? null,
        body: e.body,
        norm,
      });

    case "S04_GATE18":
      return decidirS04({ lead, cfg, body, norm, clasificacion: e.clasificacion });

    case "S06_CIERRE":
      return decidirS06({ lead, cfg, body, norm, clasificacion: e.clasificacion });

    case "S08_ESPERA_CAPTURA":
      if (!e.comprobante) {
        // A) Si el usuario expresa confusión por la captura o pide información:
        // romper el bucle, pedir disculpas con gracia colombiana y volver a S06_CIERRE
        const pideInfoOConfundido =
          /\b(cual|que|donde|de que)\s+(es\s+la\s+|captura|comprobante|pantallazo)\b/i.test(norm) ||
          /\b(no he pagado|apenas estoy preguntando|solo pedi info|solo pedi informacion|de que hablas|que comprobante|cual captura|que captura)\b/i.test(norm) ||
          /\b(informacion del curso|informacion sobre el curso|de que trata|como funciona el curso|que es el curso)\b/i.test(norm);

        if (norm && pideInfoOConfundido) {
          return [
            { tipo: "lead", patch: { estado_funnel: "S06_CIERRE" } },
            { tipo: "estado", nuevo: "S06_CIERRE" },
            { tipo: "evento", nombre: "desescalada_captura_s08", detalle: { motivo: "confundido_captura" } },
            {
              tipo: "enviar",
              textos: [
                "¡Tienes toda la razón, qué pena contigo! Me adelanté de la emoción 😅 Olvida lo de la captura por un momento.",
                "En *Modelos IA* aprendes paso a paso a crear modelos virtuales hiperrealistas con inteligencia artificial y monetizarlas desde tu celular o computador, 100% en el anonimato ✨\n\n¿Ya tienes algo de experiencia con herramientas de IA o estás empezando totalmente desde cero? 😊",
              ],
            },
          ];
        }

        // B) Si pide que le repitan los datos de pago en S08:
        if (norm && /(pasa|pasame|mandame|dame|cual es|me das|me repites|no vi|donde estan)\s+(los\s+)?(datos|cuentas?|numero|nequi|bancolombia|llave)/i.test(norm)) {
          return [
            { tipo: "evento", nombre: "reemision_cuentas_s08", detalle: {} },
            {
              tipo: "enviar",
              textos: [
                "¡Claro que sí! Aquí tienes de nuevo las cuentas para tu pago único de *33.000 COP* 👇",
                resolverPlaceholders("{{cuentas_colombia}}", lead as LeadNombre, cfg),
                "Apenas hagas la transferencia, me mandas la fotico del comprobante por aquí 📸 y te activo el acceso enseguida 🚀",
              ],
            },
          ];
        }

        // C) Mensaje sin comprobante en S08: si es un saludo, recordar con amabilidad que esperamos el comprobante
        if (norm && /^(hola|buen|buenas|buenas tardes|buenas noches|buenos dias|que mas)\b/i.test(norm)) {
          return [
            {
              tipo: "enviar",
              textos: [
                "¡Hola! 😄 Quedo super pendiente de tu captura del comprobante por aquí 📸 para confirmarte y darte acceso inmediato a Modelos IA 🚀\n\nSi necesitas que te recuerde los datos de pago o tienes alguna duda antes de transferir, solo avísame ✨",
              ],
            },
          ];
        }
        return [{ tipo: "gpt_fallback" }];
      }
      return decidirS08({ lead, cfg, ...e.comprobante });

    case "S09_VERIFICACION":
      // Ya pagó y espera revisión humana: nunca dejarlo en silencio.
      return [{ tipo: "enviar", textos: [MSG_VERIFICANDO] }];

    default:
      // Estados aún no portados (S00, S01, S02, S09, S11, S90…).
      return [{ tipo: "gpt_fallback" }];
  }
}
