// scripts/test-copy.mjs — el copy REAL de producción, renderizado y revisado.
//
//   node --experimental-strip-types scripts/test-copy.mjs
//
// No usa texto inventado: carga `seed/musa_settings.json` (las 13 claves reales
// exportadas de la base) y recorre TODAS las etapas del funnel con tres escenarios
// de país. Lo que se busca es la basura que quema ventas:
//
//   · un `{{placeholder}}` sin resolver
//   · un token interno filtrado: [PROMPT_MUESTRA], [VIDEO_AVATAR…], [ENTREGA_LINKS:…]
//   · un marcador de país que se escapó: [VE]/[CO] visibles al cliente
//
// Si mañana alguien edita el copy e inventa un token nuevo que `limpiarTokens` no
// conoce, esta prueba falla y dice cuál.

import { readFileSync } from "node:fs";
import {
  etapa,
  sinPrefijo,
  filtrarLineasPais,
  resolverPlaceholders,
  limpiarTokens,
  nombreUsable,
  formatMiles,
  textoCuentasValido,
  metodosPagoDisponibles,
  bloqueCuentasCO,
  bloqueCuentasVE,
  pideMetodoVE,
  pideMetodoCO,
} from "../functions/motor/copy.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}: esperado ${JSON.stringify(esperado)}, real ${JSON.stringify(real)}`);
}

// ============================== el copy real ==============================
const filas = JSON.parse(readFileSync(new URL("../seed/musa_settings.json", import.meta.url), "utf8"))
  .data.tables.musa_settings.rows;
// La base guarda snake_case; `cargarSettings` lo mapea a camelCase para el motor.
// Se replica el MISMO mapeo (musa-webhook-twilio.ts:264-302) para no probar una
// configuración que el código nunca vería.
const crudo = Object.fromEntries(filas.map((f) => [f.key, f.value]));
const cfg = {
  funnelCopy: crudo.funnel_copy,
  precio: crudo.precio ?? { usd: 9, cop: 33000 },
  precioBsHoy: crudo.precio_bs_hoy ?? { bs: 7400 },
  cuentasVe: crudo.cuentas_ve ?? {},
  cuentasCo: crudo.cuentas_co ?? {},
  entrega: crudo.entrega ?? {},
  pago: crudo.pago ?? { proveedor: "manual" },
};

const etapas = cfg.funnelCopy?.etapas ?? [];
t("el copy tiene etapas", etapas.length > 0, true);

// Las etapas REALES del copy en producción. Nótese que NO existe S03_PAIS: el
// plan maestro la contemplaba, pero el copy vivo la resolvió sin etapa propia.
// Si alguien agrega o quita una etapa, esta aserción lo dice.
const ESPERADAS = [
  "S00_LLEGADA", "S01_SALUDO", "S02_AVATAR", "S04_STACK_18", "S05_PRECIO",
  "S06_CIERRE", "S07_DATOS_PAGO", "S08_ESPERA_CAPTURA", "S09_VERIFICACION",
  "S10_ENTREGA", "S11_POSTVENTA", "S90_FALLBACK_GPT", "S91_HUMANO",
];
t("las etapas del copy son exactamente las esperadas", etapas.map((e) => e.id), ESPERADAS);

const LEAD_CON = { nombre: "Yusneidi", profile_name: "Yusneidi" };
const LEAD_SIN = { nombre: null, profile_name: "💜💜" }; // perfil inservible

// Tokens internos que nunca deben llegar al cliente.
const TOKEN = /\[[A-Z0-9_]{3,}(?::[^\]]*)?\]/;

let mensajesRevisados = 0;
let vacios = 0;
const tokensVistos = new Set();

for (const pais of ["CO", "VE", null]) {
  for (const e of etapas) {
    const textos = [...(e.mensajes ?? [])];
    for (const rama of Object.values(e.ramas ?? {})) {
      textos.push(...(rama?.mensajes ?? []));
      if (rama?.sin_video) textos.push(rama.sin_video);
    }

    for (const crudo of textos) {
      if (typeof crudo !== "string" || crudo.trim() === "") continue;
      for (const m of crudo.matchAll(new RegExp(TOKEN, "g"))) tokensVistos.add(m[0].replace(/:\d+$/, ""));

      const render = resolverPlaceholders(filtrarLineasPais(sinPrefijo(crudo), pais), LEAD_CON, cfg);
      mensajesRevisados++;

      if (render === "") { vacios++; continue; }

      if (render.includes("{{")) {
        fallas++;
        console.error(`FALLA placeholder sin resolver [${e.id}/${pais}]: ${render.slice(0, 120)}`);
      } else ok++;

      const fugado = render.match(TOKEN);
      if (fugado) {
        fallas++;
        console.error(`FALLA token filtrado [${e.id}/${pais}]: ${fugado[0]} en "${render.slice(0, 100)}"`);
      } else ok++;

      if (/^\[(VE|CO)\]/m.test(render)) {
        fallas++;
        console.error(`FALLA marcador de país visible [${e.id}/${pais}]`);
      } else ok++;

      // Sin nombre usable no debe quedar la coma huérfana.
      // Sin nombre usable no deben quedar comas huérfanas: el defecto real es un
      // espacio ANTES de la coma o el punto ("Hola ,"). Ojo: "cierto, ¿cómo…" es
      // español correcto y no debe marcarse.
      const sinNombre = resolverPlaceholders(filtrarLineasPais(sinPrefijo(crudo), pais), LEAD_SIN, cfg);
      if (/\s[,.]/.test(sinNombre) || /[ \t]{2,}/.test(sinNombre.trim())) {
        fallas++;
        console.error(`FALLA puntuación sin nombre [${e.id}/${pais}]: "${sinNombre.slice(0, 100)}"`);
      } else ok++;
    }
  }
}

t("se revisaron mensajes", mensajesRevisados > 20, true);

// ============================== cuentas de pago (estado REAL) ==============================

const disp = metodosPagoDisponibles(cfg);
t("Colombia es cobrable hoy", disp.co, true);
t("Venezuela NO es cobrable hoy (provisional)", disp.ve, false);

t("bloque CO pasa la validación", textoCuentasValido(bloqueCuentasCO(cfg)), true);

// ⚠ HALLAZGO: las cuentas de Venezuela que hay hoy en la base NO son placeholders
// evidentes: titular "Carmen Rodriguez", teléfono 0414-1234567, cuenta de 20
// dígitos. `textoCuentasValido` las APRUEBA. Lo único que impide enviarlas es el
// flag `provisional: true`. Y el dato trae además `es_simulacion: true`, que el
// código NO lee en ninguna parte.
t("el bloque VE parece válido (dato de simulación verosímil)", textoCuentasValido(bloqueCuentasVE(cfg)), true);
t("solo el flag `provisional` bloquea Venezuela", disp.ve, false);
t("el bloque CO muestra la llave Bre-B", bloqueCuentasCO(cfg).includes(String(cfg.cuentasCo.breb.llave)), true);
t("bloque VE no filtra el número placeholder como válido", textoCuentasValido("Titular: PENDIENTE"), false);
t("bloque con ceros rechazado", textoCuentasValido("Cuenta: 0000000000"), false);
t("bloque con campo vacío rechazado", textoCuentasValido("Banco:\nTeléfono: 300"), false);

// ============================== piezas sueltas ==============================

t("formatMiles 7400", formatMiles(7400), "7.400");
t("formatMiles 33000", formatMiles(33000), "33.000");
t("nombreUsable normal", nombreUsable({ nombre: "  carlos " }), "Carlos");
t("nombreUsable de perfil", nombreUsable({ nombre: null, profile_name: "andrea" }), "Andrea");
t("nombreUsable rechaza emojis", nombreUsable({ nombre: null, profile_name: "💜💜" }), null);
t("nombreUsable rechaza negocio", nombreUsable({ nombre: "Tienda Oficial" }), null);
t("nombreUsable rechaza 3 palabras", nombreUsable({ nombre: "Ana Maria Gomez" }), null);

t("pideMetodoVE", pideMetodoVE("como pago con pago movil"), true);
t("pideMetodoVE no falsea", pideMetodoVE("hola que tal"), false);
t("pideMetodoCO", pideMetodoCO("datos de nequi porfa"), true);
t("pideMetodoCO no falsea", pideMetodoCO("buenas tardes"), false);

t("limpiarTokens quita PROMPT_MUESTRA", limpiarTokens("hola [PROMPT_MUESTRA] chao").includes("PROMPT"), false);
t("sinPrefijo", sinPrefijo("[SI RESPONDE OTRO PAÍS] hola"), "hola");
t("filtrarLineasPais CO", filtrarLineasPais("[VE]b\r\n[CO]a\r\nx", "CO").includes("[VE]"), false);
t("filtrarLineasPais CO quita la línea VE", filtrarLineasPais("[VE]b\n[CO]a\nx", "CO"), "a\nx".replace(/\n/g, "\n"));
t("filtrarLineasPais OTRO quita ambas", filtrarLineasPais("[VE]b\n[CO]a\nx", null), "x");

// ============================== salida ==============================
console.log(`tokens internos vistos en el copy: ${[...tokensVistos].sort().join(" ") || "(ninguno)"}`);
console.log(`mensajes renderizados: ${mensajesRevisados} (vacíos tras filtrar país: ${vacios})`);
console.log(`copy: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
