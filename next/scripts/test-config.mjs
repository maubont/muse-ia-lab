// next/scripts/test-config.mjs — el contrato de configuración por nombres.
//
//   node --experimental-strip-types next/scripts/test-config.mjs

import { leerConfigCanal, describirConfig, VARIABLES, CREDENCIAL_WEBHOOK } from "../src/config.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

const COMPLETO = {
  EVOLUTION_URL: "https://musa-production.up.railway.app/",
  EVOLUTION_APIKEY: "clave-de-prueba-que-no-debe-salir",
  EVOLUTION_INSTANCE: "musa",
  EVOLUTION_JWT_KEY: "secreto-de-firma-de-prueba",
};

// ---------- camino feliz ----------
{
  const r = leerConfigCanal(COMPLETO);
  t("completo: ok", r.ok, true);
  t("completo: quita la barra final", r.config.baseUrl, "https://musa-production.up.railway.app");
  t("completo: instancia", r.config.instancia, "musa");
}

// ---------- faltantes ----------
{
  const r = leerConfigCanal({});
  t("vacío: no ok", r.ok, false);
  t("vacío: nombra las obligatorias", r.faltan,
    [VARIABLES.url, VARIABLES.apiKey, VARIABLES.instancia, CREDENCIAL_WEBHOOK]);
}

// ---------- credencial del webhook: JWT o secreto compartido ----------
{
  // Solo secreto compartido (el mecanismo de v2.3.7): debe valer.
  const sinJwt = { ...COMPLETO, EVOLUTION_WEBHOOK_SECRET: "secreto-compartido" };
  delete sinJwt.EVOLUTION_JWT_KEY;
  const r = leerConfigCanal(sinJwt);
  t("solo secreto compartido: ok", r.ok, true);
  t("solo secreto compartido: se propaga", r.config.secretoWebhook, "secreto-compartido");
}

{
  // Ninguna de las dos: falta.
  const sinNinguna = { ...COMPLETO };
  delete sinNinguna.EVOLUTION_JWT_KEY;
  t("sin credencial: falta", leerConfigCanal(sinNinguna).faltan, [CREDENCIAL_WEBHOOK]);
}

{
  // Nombre de cabecera configurable.
  const r = leerConfigCanal({ ...COMPLETO, EVOLUTION_WEBHOOK_SECRET: "s", EVOLUTION_WEBHOOK_HEADER: "x-musa-secret" });
  t("cabecera configurable", r.config.nombreCabeceraSecreto, "x-musa-secret");
}

{
  const r = leerConfigCanal({ ...COMPLETO, EVOLUTION_INSTANCE: "" });
  t("instancia vacía: falta", r.faltan, ["EVOLUTION_INSTANCE"]);
}

{
  // Los espacios no cuentan como valor.
  const r = leerConfigCanal({ ...COMPLETO, EVOLUTION_APIKEY: "   " });
  t("clave en blanco: falta", r.faltan, ["EVOLUTION_APIKEY"]);
}

// ---------- inválidas ----------
{
  const r = leerConfigCanal({ ...COMPLETO, EVOLUTION_URL: "up.railway.app" });
  t("URL sin esquema: inválida", r.invalidas, ["EVOLUTION_URL"]);
}

{
  const r = leerConfigCanal({ ...COMPLETO, EVOLUTION_URL: "ftp://x" });
  t("URL no http(s): inválida", r.invalidas, ["EVOLUTION_URL"]);
}

{
  const r = leerConfigCanal({ ...COMPLETO, EVOLUTION_INSTANCE: "mu sa" });
  t("instancia con espacios: inválida", r.invalidas, ["EVOLUTION_INSTANCE"]);
}

// ---------- los secretos no se filtran ----------
{
  const salidas = [
    describirConfig(leerConfigCanal(COMPLETO)),
    describirConfig(leerConfigCanal({})),
    describirConfig(leerConfigCanal({ ...COMPLETO, EVOLUTION_URL: "mal" })),
  ].join("\n");

  t("el mensaje nombra la instancia", salidas.includes("musa"), true);
  t("el mensaje NO contiene la api key", salidas.includes(COMPLETO.EVOLUTION_APIKEY), false);
  t("el mensaje NO contiene el jwt key", salidas.includes(COMPLETO.EVOLUTION_JWT_KEY), false);
}

{
  const r = leerConfigCanal(COMPLETO);
  t("la config devuelta NO se imprime en describir", describirConfig(r).includes(r.config.apiKey), false);
}

console.log(`config: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
