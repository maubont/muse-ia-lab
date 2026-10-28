// next/src/config.ts — el contrato de configuración, por NOMBRES de variable.
//
// Un solo lugar donde se decide qué variables hacen falta para que el canal
// funcione. Si falta alguna, el arranque lo dice por su nombre y no por su valor.
//
// REGLA: este módulo NUNCA devuelve ni imprime el valor de un secreto. Solo dice
// qué variable falta.

import type { ConfigEvolution } from "../../functions/canal/evolution.ts";

export const VARIABLES = {
  url: "EVOLUTION_URL",
  apiKey: "EVOLUTION_APIKEY",
  instancia: "EVOLUTION_INSTANCE",
  jwtKey: "EVOLUTION_JWT_KEY",
  webhookSecret: "EVOLUTION_WEBHOOK_SECRET",
  webhookHeader: "EVOLUTION_WEBHOOK_HEADER",
} as const;

/**
 * Al menos UNA de estas dos debe existir. `jwt_key` se verificó en el código de
 * `main` de Evolution, no en v2.3.7: si la versión desplegada no firma, el
 * secreto compartido es el único mecanismo disponible.
 */
export const CREDENCIAL_WEBHOOK = "EVOLUTION_JWT_KEY o EVOLUTION_WEBHOOK_SECRET";

export type Entorno = Record<string, string | undefined>;

export type ResultadoConfig =
  | { ok: true; config: ConfigEvolution }
  | { ok: false; faltan: string[]; invalidas: string[] };

function limpio(env: Entorno, nombre: string): string {
  return (env[nombre] ?? "").trim();
}

/**
 * Construye la configuración del canal a partir del entorno.
 * - `faltan`: variables ausentes o vacías (por nombre).
 * - `invalidas`: variables presentes pero con forma incorrecta (por nombre).
 */
export function leerConfigCanal(env: Entorno = process.env): ResultadoConfig {
  const url = limpio(env, VARIABLES.url);
  const apiKey = limpio(env, VARIABLES.apiKey);
  const instancia = limpio(env, VARIABLES.instancia);
  const jwtKey = limpio(env, VARIABLES.jwtKey);
  const secretoWebhook = limpio(env, VARIABLES.webhookSecret);
  const cabecera = limpio(env, VARIABLES.webhookHeader) || undefined;

  const faltan: string[] = [];
  const invalidas: string[] = [];

  if (!url) faltan.push(VARIABLES.url);
  if (!apiKey) faltan.push(VARIABLES.apiKey);
  if (!instancia) faltan.push(VARIABLES.instancia);
  if (!jwtKey && !secretoWebhook) faltan.push(CREDENCIAL_WEBHOOK);

  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) invalidas.push(VARIABLES.url);
  if (instancia && /\s/.test(instancia)) invalidas.push(VARIABLES.instancia);

  if (faltan.length || invalidas.length) return { ok: false, faltan, invalidas };

  return {
    ok: true,
    config: {
      baseUrl: url.replace(/\/+$/, ""), // sin barra final: las rutas la añaden
      apiKey,
      instancia,
      jwtKey,
      ...(secretoWebhook ? { secretoWebhook } : {}),
      ...(cabecera ? { nombreCabeceraSecreto: cabecera } : {}),
    },
  };
}

/** Mensaje de arranque, sin valores. Seguro para logs. */
export function describirConfig(r: ResultadoConfig): string {
  if (r.ok) return `canal evolution listo · instancia=${r.config.instancia}`;
  const partes: string[] = [];
  if (r.faltan.length) partes.push(`faltan: ${r.faltan.join(", ")}`);
  if (r.invalidas.length) partes.push(`inválidas: ${r.invalidas.join(", ")}`);
  return `configuración incompleta — ${partes.join(" · ")}`;
}
