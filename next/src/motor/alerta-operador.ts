// next/src/motor/alerta-operador.ts — GENERACIÓN Y ENVÍO DE ALERTAS ESTRUCTURADAS AL OPERADOR.
//
// Despacha alertas enriquecidas por WhatsApp con contexto (últimos 4 mensajes),
// enlace de respuesta directa en 1 clic (wa.me) e instrucciones de reanudación.
// Incluye guarda estricta anti-auto-notificación cuando el operador es el propio lead testeador.

import type { Canal } from "../../../functions/canal/tipos.ts";
import type { Consultar } from "../db/repositorio.ts";
import type { MotivoEscalado } from "./deteccion-escalado.ts";

export interface ContextoLeadAlerta {
  phone: string;
  nombre?: string | null;
  profileName?: string | null;
  estadoFunnel: string;
  motivo: MotivoEscalado;
  detalle?: string;
  ultimoMensajeCliente: string;
}

/** Normaliza teléfonos para comparación segura (solo dígitos). */
function normalizarTel(t: string): string {
  return (t || "").replace(/\D/g, "");
}

/** Construye el enlace wa.me prellenado para respuesta en 1 solo clic. */
export function construirEnlaceRespuestaDirecta(phone: string, nombre?: string | null, icebreaker?: string | null): string {
  const numeroLimpio = normalizarTel(phone);
  const nombreLimpio = (nombre || "").trim();
  const saludo = nombreLimpio && !/^(usuario|amigo)$/i.test(nombreLimpio)
    ? `¡Hola ${nombreLimpio}!`
    : "¡Hola!";

  const textoPrefijado = icebreaker && icebreaker.trim()
    ? icebreaker.trim()
    : `${saludo} Te escribe el asesor de Muse IA Lab. He revisado tu consulta y aquí estoy para atenderte personalmente 🙌`;
  return `https://wa.me/${numeroLimpio}?text=${encodeURIComponent(textoPrefijado)}`;
}

/** Obtiene los últimos turnos de la base de datos para contexto del operador. */
export async function obtenerResumenUltimosMensajes(
  consultar: Consultar,
  phone: string,
  limite = 4,
): Promise<string[]> {
  try {
    const { rows } = await consultar(
      `select direction, body
         from public.musa_messages
        where lead_phone = $1 and body is not null and trim(body) != ''
        order by created_at desc, id desc limit $2`,
      [phone, limite],
    );
    const cronologico = rows.reverse();
    return cronologico.map((r: any) => {
      const remitente = r.direction === "in" ? "👤 Lead" : "✨ Musa";
      const texto = String(r.body || "").replace(/\s+/g, " ").trim();
      const acotado = texto.length > 120 ? `${texto.slice(0, 117)}...` : texto;
      return `[${remitente}]: "${acotado}"`;
    });
  } catch {
    return [];
  }
}

/** Diagnostica temperatura, presupuesto y dilema comercial a partir del historial. */
function diagnosticarLead(
  estadoFunnel: string,
  ultimoMensaje: string,
  historial: string[],
): {
  temperatura: string;
  presupuesto: string | null;
  dilema: string;
  icebreaker: string;
} {
  const textoCompleto = `${historial.join(" ")} ${ultimoMensaje}`.toLowerCase();
  
  // Detección de presupuesto / dinero
  let presupuesto: string | null = null;
  const mPresupuesto = /\b(\d{1,3}(?:\.\d{3})*|\d+)\s*(mil|cop|pesos|usd|dolar|dolares|dólar|dólares|\$)\b/i.exec(textoCompleto);
  if (mPresupuesto) {
    presupuesto = `Mencionó ${mPresupuesto[0].toUpperCase()}`;
  }

  // Detección de temperatura comercial
  let temperatura = "🟡 *TIBIO* (Indecisión / Consulta técnica)";
  if (/nequi|bancolombia|pago|pagar|transferir|cuenta|comprobante|plata en mano/i.test(textoCompleto) || estadoFunnel === "S06_CIERRE" || estadoFunnel === "S08_ESPERA_CAPTURA") {
    temperatura = "🔥 *CALIENTE* (Dinero en mano / Listo para cierre)";
  } else if (/estafa|esperando|dos minutos|2 minutos|robot|plastico|plástico|adios|adiós|pésimo|pesimo|bucle/i.test(textoCompleto)) {
    temperatura = "❄️ *IRRITADO / FRUSTRADO* (Atención urgente requerida)";
  }

  // Detección de dilema medular
  let dilema = "Requiere orientación directa de un asesor humano.";
  let icebreaker = "¡Hola! Te escribe el asesor de Muse IA Lab. He revisado tu chat y aquí estoy para resolver tu duda y orientarte al instante 🙌";

  if (/audio|voz|escuchar|nota de voz|habla|hablar/i.test(textoCompleto)) {
    dilema = "Pide escuchar nota de voz o validar realismo acústico de Musa.";
    icebreaker = "¡Hola! Te escribe el asesor de Muse IA Lab. Vi tu inquietud sobre la voz y consistencia de las modelos: en el curso enseñamos a clonar voces y sincronizar labios para que se escuchen 100% humanas. ¿Te paso los datos para que arranques hoy?";
  } else if (/descuento|rebaja|28 mil|29 mil|30 mil|alcanza/i.test(textoCompleto)) {
    dilema = "Negociación de micro-brecha de precio frente a los 33.000 COP.";
    icebreaker = "¡Hola! Te escribe el asesor de Muse IA Lab. Vi que estabas revisando el valor para transferir. Para que no te quedes por fuera, cuéntame con cuánto cuentas hoy y te ayudo a activar tu acceso de inmediato 🚀";
  } else if (/plastico|plástico|realismo|fanvue|onlyfans|\+18|adulto|anonimo|anónimo/i.test(textoCompleto)) {
    dilema = "Dudas sobre hiperrealismo en plataformas de suscripción (+18) o anonimato.";
    icebreaker = "¡Hola! Te escribe el asesor de Muse IA Lab. Estaba revisando tu consulta sobre el hiperrealismo para plataformas de suscripción y anonimato: te confirmo que en el taller enseñamos texturizado de piel real y flujos 100% anónimos. ¿Tienes alguna pregunta puntual?";
  } else if (/comprobante|pague|transferi|transferí|captura/i.test(textoCompleto)) {
    dilema = "Validación y activación de pago / comprobante bancario.";
    icebreaker = "¡Hola! Te escribe el asesor de Muse IA Lab. Aquí tengo tu chat abierto para validar tu comprobante y darte acceso inmediato a tu aula virtual 📲";
  } else if (/viendo.*video|puedo ver|alcanc|videos gratis|sin pagar|plataforma abierta/i.test(textoCompleto)) {
    temperatura = "🚨 *ALERTA ROJA* (Posible brecha / Reporte de videos abiertos sin pago)";
    dilema = "El usuario afirma estar reproduciendo los videos del LMS sin haber pagado. Requiere verificación inmediata de academia.html.";
    icebreaker = "¡Hola! Te escribe el asesor de Muse IA Lab. Vi tu comentario sobre los videos en el aula. Te confirmo que las lecciones maestras están bajo llave: ¿te ayudo a activar tu acceso oficial?";
  }

  return { temperatura, presupuesto, dilema, icebreaker };
}

/** Construye la alerta estructurada completa para el operador. */
export async function construirAlertaEstructurada(
  consultar: Consultar,
  ctx: ContextoLeadAlerta,
): Promise<string> {
  const nombreMostrar = ctx.nombre || ctx.profileName || "(Sin nombre registrado)";
  const historialTurnos = await obtenerResumenUltimosMensajes(consultar, ctx.phone, 4);
  const { temperatura, presupuesto, dilema, icebreaker } = diagnosticarLead(
    ctx.estadoFunnel,
    ctx.ultimoMensajeCliente,
    historialTurnos,
  );
  const enlaceWa = construirEnlaceRespuestaDirecta(ctx.phone, ctx.nombre || ctx.profileName, icebreaker);

  const etiquetasMotivo: Record<MotivoEscalado, string> = {
    solicitud_explicita: "Petición directa de hablar con humano",
    frustracion_incertidumbre: "Frustración / Incertidumbre sobre atención",
    reclamo_operativo: "Reclamo operativo / Problema de pago o acceso",
    fuera_de_alcance_legal: "Tema legal / Facturación empresarial fuera de alcance",
    alerta_seguridad_bypass: "🚨 POSIBLE BRECHA DE PLATAFORMA / REPORTE DE VIDEOS ABIERTOS",
    fatiga_bucle: "Bucle conversacional detectado",
  };

  const bloqueHistorial = historialTurnos.length > 0
    ? historialTurnos.join("\n")
    : `[👤 Lead]: "${ctx.ultimoMensajeCliente.slice(0, 140)}"`;

  return [
    `*🚨 ATENCIÓN REQUERIDA: ESCALADO INTELIGENTE — MUSA v2 🚨*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 *Lead:* ${nombreMostrar}`,
    `📱 *Teléfono:* ${ctx.phone}`,
    `📍 *Etapa actual:* ${ctx.estadoFunnel}`,
    `🌡️ *Temperatura:* ${temperatura}`,
    presupuesto ? `💰 *Presupuesto:* ${presupuesto}` : "",
    `⚠️ *Motivo:* ${etiquetasMotivo[ctx.motivo] ?? ctx.motivo}`,
    ctx.detalle ? `ℹ️ *Detalle:* ${ctx.detalle}` : "",
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📌 *DILEMA DETECTADO:*`,
    dilema,
    ``,
    `📋 *Últimos turnos del chat:*`,
    bloqueHistorial,
    ``,
    `🎯 *Icebreaker sugerido (prellenado):*`,
    `_"${icebreaker}"_`,
    ``,
    `👉 *Atender con 1 clic en WhatsApp:*`,
    enlaceWa,
    ``,
    `⚡ *Para reactivar el bot cuando termines, responde a este chat:*`,
    `*reanudar ${ctx.phone}*`,
  ].filter(Boolean).join("\n");
}

/**
 * Despacha la alerta al número del operador vía WhatsApp.
 * Si el operador es el mismo lead que está testeando, omite el envío para no contaminar su chat.
 */
export async function enviarAlertaOperador(
  canal: Canal,
  telefonoOperador: string,
  consultar: Consultar,
  ctx: ContextoLeadAlerta,
): Promise<boolean> {
  if (!telefonoOperador || !telefonoOperador.trim()) {
    console.warn(`[alerta-operador] No se pudo enviar alerta: teléfono de operador no configurado.`);
    return false;
  }

  const esAutoNotificacion = normalizarTel(telefonoOperador) === normalizarTel(ctx.phone);
  if (esAutoNotificacion) {
    console.log(`[alerta-operador] Operador es el mismo lead (${ctx.phone}). Se omite alerta para evitar bucle/auto-notificación.`);
    return true;
  }
  try {
    const textoAlerta = await construirAlertaEstructurada(consultar, ctx);
    const res = await canal.enviar(telefonoOperador, { texto: textoAlerta });
    return res.ok;
  } catch (err) {
    console.error(`[alerta-operador] Error despachando alerta a operador:`, err);
    return false;
  }
}
