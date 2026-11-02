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

/** «Listo, quedas fuera»: el único mensaje que se manda tras un STOP. */
export const MSG_OPTOUT =
  "Listo 👍 Quedas fuera de la lista y no te volveré a escribir. ¡Gracias por tu tiempo y que te vaya bonito! 💜";

/**
 * En S09 el lead YA PAGÓ y espera verificación humana. Escribir y no recibir
 * nada es lo que más desespera a alguien que acaba de pagar: siempre se acusa.
 * Copiado literal del original (L1563-1564).
 */
export const MSG_VERIFICANDO =
  "Seguimos verificando tu pago ✅ Tu acceso queda asegurado; te confirmo por aquí mismo apenas esté listo 💜";

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
  const { lead, cfg, body, norm } = e;

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
          "🔄 Conversación reiniciada. ¡Escribe *Hola* para probar el funnel completo desde el principio!",
        ],
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

  // 4. Pide una persona: se escala y se avisa.
  if (norm && pideHumano(norm) && !preguntaPorBot(norm)) {
    let texto: string;
    try {
      texto = resolverPlaceholders(etapa(cfg, "S91_HUMANO").mensajes[0], lead as LeadNombre, cfg);
    } catch {
      // Si el copy no trae S91, se escala igual pero sin inventar frase.
      return [
        { tipo: "lead", patch: { escalado_humano: true } },
        { tipo: "evento", nombre: "escalado", detalle: { motivo: "pidio_humano" } },
      ];
    }
    return [
      { tipo: "lead", patch: { escalado_humano: true } },
      { tipo: "evento", nombre: "escalado", detalle: { motivo: "pidio_humano" } },
      { tipo: "enviar", textos: [texto] },
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
      });

    case "S04_GATE18":
      return decidirS04({ lead, cfg, body, norm, clasificacion: e.clasificacion });

    case "S06_CIERRE":
      return decidirS06({ lead, cfg, body, norm, clasificacion: e.clasificacion });

    case "S08_ESPERA_CAPTURA":
      if (!e.comprobante) {
        // Mensaje sin comprobante en S08: si es un saludo, recordar con amabilidad que esperamos el comprobante
        if (norm && /^(hola|buen|buenas|buenas tardes|buenas noches|buenos dias|que mas)\b/i.test(norm)) {
          return [
            {
              tipo: "enviar",
              textos: [
                "¡Hola! 😄 Quedo super pendiente de tu captura del comprobante por aquí 📸 para confirmarte y darte acceso inmediato a Modelos IA 🚀\n\nSi necesitas los datos de pago nuevamente o quieres probar desde el inicio, escribe *reiniciar* 💜",
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
