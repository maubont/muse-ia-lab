// next/src/acceso/accesos.ts — TOKENS DE ACCESO AL CURSO.
//
// El token ES la credencial: quien lo tiene, entra. Por eso:
//   · se genera con `crypto.randomBytes`, nunca con Math.random ni con el teléfono
//   · no se registra en logs
//   · caduca
//   · se puede revocar
//
// Regla del negocio: una persona que pagó conserva el acceso de por vida. La
// caducidad por defecto es larga a propósito (365 días) y se renueva sola al
// usarse, no al azar.

import { randomBytes } from "node:crypto";
import type { Consultar } from "../db/repositorio.ts";

export const DIAS_POR_DEFECTO = 365;
/** 24 bytes -> 32 caracteres base64url. Adivinarlo no es viable. */
export const BYTES_TOKEN = 24;

export function generarToken(): string {
  return randomBytes(BYTES_TOKEN).toString("base64url");
}

export interface AccesoCreado {
  token: string;
  expira: string;
}

export interface ResultadoValidacion {
  ok: boolean;
  phone?: string;
  motivo?: string;
  expira?: string;
}

/**
 * Crea (o reemite) el acceso de un comprador.
 * Reemitir REVOCA el anterior: si alguien compartió su enlace, el dueño pide uno
 * nuevo y el viejo deja de servir.
 */
export async function crearAcceso(
  consultar: Consultar,
  phone: string,
  dias = DIAS_POR_DEFECTO,
): Promise<AccesoCreado> {
  // Se revoca lo vigente antes de emitir: queda el rastro de ambos.
  await consultar(
    "update public.musa_accesos set revocado_en = now() where lead_phone = $1 and revocado_en is null",
    [phone],
  );

  // Reintento por si el token colisiona (probabilísimo que no, pero barato).
  for (let intento = 0; intento < 3; intento++) {
    const token = generarToken();
    try {
      const { rows } = await consultar(
        "insert into public.musa_accesos (lead_phone, token, expira_en) values ($1, $2, now() + ($3 || ' days')::interval) returning token, expira_en",
        [phone, token, String(dias)],
      );
      const fila = rows[0] as { token?: string; expira_en?: string } | undefined;
      return { token: fila?.token ?? token, expira: String(fila?.expira_en ?? "") };
    } catch (e) {
      const err = e as { code?: string; constraint?: string };
      if (err.code === "23505" && intento < 2) continue; // token repetido: reintentar
      throw e;
    }
  }
  throw new Error("no se pudo generar un token único");
}

/**
 * Valida un token. Sin efectos secundarios salvo cuando `registrarVisita` es true.
 * Devuelve el motivo exacto para poder distinguir «caducó» de «no existe» en logs
 * internos (al usuario NO se le da esa información).
 */
/**
 * Normaliza un token recibido por enlace.
 *
 * Los enlaces se comparten por WhatsApp y llegan con basura pegada: un punto final,
 * un paréntesis, un salto de línea o espacios. Y algunos teclados cambian las
 * mayúsculas. Un enlace que el cliente no puede abrir es una venta perdida.
 */
export function limpiarToken(bruto: string): string {
  return String(bruto ?? "")
    .trim()
    .replace(/^[^A-Za-z0-9_-]+/, "")
    .replace(/[^A-Za-z0-9_-]+$/, "");
}

export async function validarToken(
  consultar: Consultar,
  token: string,
  registrarVisita = false,
): Promise<ResultadoValidacion> {
  if (!token || token.length < 20 || token.length > 64) return { ok: false, motivo: "formato" };

  const { rows } = await consultar(
    // Comparación sin mayúsculas: el token tiene 24 bytes aleatorios, así que perder
    // la distinción de caja no debilita nada relevante.
    "select lead_phone, expira_en, revocado_en from public.musa_accesos where lower(token) = lower($1)",
    [limpiarToken(token)],
  );
  const fila = rows[0] as { lead_phone: string; expira_en: string; revocado_en: string | null } | undefined;
  if (!fila) return { ok: false, motivo: "no_existe" };
  if (fila.revocado_en) return { ok: false, motivo: "revocado" };

  const expira = new Date(fila.expira_en).getTime();
  if (!Number.isFinite(expira) || expira < Date.now()) return { ok: false, motivo: "caducado" };

  if (registrarVisita) {
    // RENOVACIÓN AL USARSE. El acceso se vende como «de por vida», pero antes
    // vencía a los 365 días y nadie lo extendía: quien pagó perdía el curso al año.
    // Ahora cada visita empuja la caducidad otro año hacia adelante.
    await consultar(
      "update public.musa_accesos set ultimo_acceso = now(), visitas = visitas + 1, expira_en = now() + ($2 || ' days')::interval where token = $1",
      [token, String(DIAS_POR_DEFECTO)],
    );
  }

  return { ok: true, phone: fila.lead_phone, expira: fila.expira_en };
}

/** Corta el acceso. El token deja de servir de inmediato. */
export async function revocarAcceso(consultar: Consultar, phone: string): Promise<number> {
  const { rows } = await consultar(
    "update public.musa_accesos set revocado_en = now() where lead_phone = $1 and revocado_en is null returning id",
    [phone],
  );
  return rows.length;
}

/** Enlace que se envía por WhatsApp. El dominio se configura, no se adivina. */
export function enlaceDeAcceso(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/a/${token}`;
}
