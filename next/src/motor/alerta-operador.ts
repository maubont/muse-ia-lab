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
export function construirEnlaceRespuestaDirecta(phone: string, nombre?: string | null): string {
  const numeroLimpio = normalizarTel(phone);
  const nombreLimpio = (nombre || "").trim();
  const saludo = nombreLimpio && !/^(usuario|amigo)$/i.test(nombreLimpio)
    ? `¡Hola ${nombreLimpio}!`
    : "¡Hola!";

  const textoPrefijado = `${saludo} Te escribe el asesor de Muse IA Lab. He revisado tu chat y aquí estoy para atenderte personalmente. ¿En qué te puedo colaborar?`;
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

/** Construye la alerta estructurada completa para el operador. */
export async function construirAlertaEstructurada(
  consultar: Consultar,
  ctx: ContextoLeadAlerta,
): Promise<string> {
  const nombreMostrar = ctx.nombre || ctx.profileName || "(Sin nombre registrado)";
  const historialTurnos = await obtenerResumenUltimosMensajes(consultar, ctx.phone, 4);
  const enlaceWa = construirEnlaceRespuestaDirecta(ctx.phone, ctx.nombre || ctx.profileName);

  const etiquetasMotivo: Record<MotivoEscalado, string> = {
    solicitud_explicita: "Petición directa de hablar con humano",
    frustracion_incertidumbre: "Frustración / Incertidumbre sobre atención",
    reclamo_operativo: "Reclamo operativo / Problema de pago o acceso",
    fuera_de_alcance_legal: "Tema legal / Facturación empresarial fuera de alcance",
    fatiga_bucle: "Bucle conversacional detectado",
  };

  const bloqueHistorial = historialTurnos.length > 0
    ? historialTurnos.join("\n")
    : `[👤 Lead]: "${ctx.ultimoMensajeCliente.slice(0, 140)}"`;

  return [
    `🚨 *ATENCIÓN REQUERIDA — ESCALADO A HUMANO* 🚨`,
    ``,
    `👤 *Lead:* ${nombreMostrar}`,
    `📱 *Teléfono:* ${ctx.phone}`,
    `📍 *Etapa actual:* ${ctx.estadoFunnel}`,
    `⚠️ *Motivo:* ${etiquetasMotivo[ctx.motivo] ?? ctx.motivo}`,
    ctx.detalle ? `ℹ️ *Detalle:* ${ctx.detalle}` : "",
    ``,
    `📋 *Últimos turnos del chat:*`,
    bloqueHistorial,
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

  // GUARDA CRÍTICA: Si el operador está chateando como lead, NO enviar alerta a su propio chat
  if (normalizarTel(telefonoOperador) === normalizarTel(ctx.phone)) {
    console.log(`[alerta-operador] Alerta omitida por auto-notificación (operador === lead: ${ctx.phone})`);
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
