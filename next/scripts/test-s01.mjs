// next/scripts/test-s01.mjs — la entrada de un lead nuevo: lo primero que ve.
//
//   node --experimental-strip-types next/scripts/test-s01.mjs

import { readFileSync } from "node:fs";
import { decidirLeadNuevo, mensajePrecioRapido, mensajesStackYGate } from "../src/motor/s01.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

const filas = JSON.parse(readFileSync(new URL("../../seed/musa_settings.json", import.meta.url), "utf8"))
  .data.tables.musa_settings.rows;
const crudo = Object.fromEntries(filas.map((f) => [f.key, f.value]));
const CFG = {
  funnelCopy: crudo.funnel_copy,
  precio: crudo.precio ?? { usd: 2.5, cop: 9000 },
  precioBsHoy: crudo.precio_bs_hoy ?? { bs: 7800 },
  cuentasVe: crudo.cuentas_ve ?? {},
  cuentasCo: crudo.cuentas_co ?? {},
  entrega: crudo.entrega ?? {},
};

const LEAD = { phone: "+573001112233", nombre: "Carlos", profile_name: "Carlos", estado_funnel: "S00_LLEGADA" };
const tipos = (e) => e.map((x) => x.tipo);
const de = (e, tipo) => e.filter((x) => x.tipo === tipo);

const sinAvatar = (extra = {}) => decidirLeadNuevo({ lead: LEAD, cfg: CFG, pidePrecio: false, avatar: null, ...extra });
const conAvatar = (extra = {}) => decidirLeadNuevo({
  lead: LEAD, cfg: CFG, pidePrecio: false, avatar: { rama: "A", url: "https://cdn.test/maria.mp4" }, ...extra,
});

// ============================== saludo ==============================
{
  const e = sinAvatar();
  const saludo = de(e, "enviar")[0].textos;
  t("saluda con dos mensajes", saludo.length, 2);
  t("el saludo no tiene placeholders", saludo.join(" ").includes("{{"), false);
  t("el saludo no filtra tokens", /\[[A-Z0-9_]{3,}/.test(saludo.join(" ")), false);
  t("el saludo se envía ANTES del gate", tipos(e).indexOf("enviar"), 0);
}

// ============================== precio inmediato ==============================
{
  const e = sinAvatar({ pidePrecio: true });
  const saludo = de(e, "enviar")[0].textos;
  t("preguntó precio: tres mensajes", saludo.length, 3);
  t("el tercero es el precio", saludo[2].includes("9.000"), true);
  t("mensajePrecioRapido usa COP", mensajePrecioRapido(CFG).includes("9.000 COP"), true);
}

// ============================== sin avatar (puente) ==============================
{
  const e = sinAvatar();
  t("sin avatar: NO hay media", tipos(e).includes("enviar_media"), false);
  t("sin avatar: marca avatar_enviado=false", de(e, "lead")[0].patch.avatar_enviado, false);
  t("sin avatar: pasa a S04", de(e, "estado")[0].nuevo, "S04_GATE18");
  // saludo + puente + stack/gate
  t("sin avatar: tres envíos", de(e, "enviar").length, 3);

  const puente = de(e, "enviar")[1].textos[0];
  const puenteDelCopy = CFG.funnelCopy.etapas
    .find((x) => x.id === "S02_AVATAR").ramas.A.sin_video;
  t("sin avatar: usa el puente del copy", puente, puenteDelCopy);

  // ⚠ El código original dice que el puente «NUNCA debe prometer un video o
  // “sorpresa” que no se envía», pero el copy real SÍ promete una sorpresa.
  // Se deja registrado como observación, no como fallo del port.
  if (/sorpresa/i.test(puente)) {
    console.log("⚠ OBSERVACIÓN: el puente sin avatar promete «una sorpresa» que nunca llega.");
    console.log("  Contradice el comentario del código original (L1816-1818). Decisión de copy.");
  }
}

// ============================== con avatar ==============================
{
  const e = conAvatar();
  t("con avatar: envía el video", tipos(e).includes("enviar_media"), true);
  t("con avatar: url correcta", de(e, "enviar_media")[0].url, "https://cdn.test/maria.mp4");
  t("con avatar: tipo video", de(e, "enviar_media")[0].mediaTipo, "video");
  t("con avatar: marca avatar_enviado=true", de(e, "lead")[0].patch.avatar_enviado, true);
  t("con avatar: registra el evento", de(e, "evento")[0].nombre, "avatar_enviado");
  t("con avatar: rama en el evento", de(e, "evento")[0].detalle.rama, "A");
  t("con avatar: pasa a S04", de(e, "estado")[0].nuevo, "S04_GATE18");
  // En la rama A el pie del video es el token `[VIDEO_AVATAR]`, que queda vacío:
  // el nombre aparece en el MENSAJE SIGUIENTE, no en el pie.
  t("con avatar: el pie del video queda vacío", de(e, "enviar_media")[0].texto, "");
  t("con avatar: el nombre va en el mensaje siguiente", de(e, "enviar")[1].textos[0].includes("Carlos"), true);
}

// ============================== orden del flujo ==============================
{
  const e = conAvatar();
  t("orden: saludo → video → stack → lead → evento → estado",
    tipos(e), ["enviar", "enviar_media", "enviar", "enviar", "lead", "evento", "estado"]);
  t("el estado va al final", tipos(e).at(-1), "estado");
}

// ============================== stack + gate ==============================
{
  const gate = mensajesStackYGate(LEAD, CFG);
  t("stack: dos mensajes", gate.length, 2);
  t("stack: pregunta la edad", gate.join(" ").includes("18"), true);
  t("stack: sin placeholders", gate.join(" ").includes("{{"), false);
}

// ============================== sin nombre usable ==============================
{
  const e = decidirLeadNuevo({ lead: { ...LEAD, nombre: null, profile_name: "💜" }, cfg: CFG, pidePrecio: false, avatar: null });
  const saludo = de(e, "enviar")[0].textos.join(" ");
  t("sin nombre: sin placeholders", saludo.includes("{{"), false);
  t("sin nombre: sin coma huérfana", /\s[,.]/.test(saludo), false);
}

console.log(`s01 lead nuevo: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
