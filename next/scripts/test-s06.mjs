// next/scripts/test-s06.mjs — pruebas del cierre y de los datos de pago.
//
//   node --experimental-strip-types next/scripts/test-s06.mjs
//
// Contra el copy REAL de producción. Lo que se busca: que NUNCA salga un dato de
// pago incompleto, y que la pregunta del cliente no se pierda cuando dice «dale».

import { readFileSync } from "node:fs";
import { decidirS06, cerrarConDatos, efectosDatosPago, MSG_NEGATIVO_SUAVE } from "../src/motor/s06.ts";

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
  precio: crudo.precio ?? { usd: 9, cop: 33000 },
  precioBsHoy: crudo.precio_bs_hoy ?? { bs: 7400 },
  cuentasVe: crudo.cuentas_ve ?? {},
  cuentasCo: crudo.cuentas_co ?? {},
  entrega: crudo.entrega ?? {},
};

const LEAD = { phone: "+573001112233", nombre: "Carlos", profile_name: "Carlos", estado_funnel: "S06_CIERRE" };
const tipos = (e) => e.map((x) => x.tipo);
const de = (e, tipo) => e.filter((x) => x.tipo === tipo);

// ============================== S06 · afirmativo ==============================

{
  const e = decidirS06({ lead: LEAD, cfg: CFG, body: "dale", norm: "dale" });
  t("«dale»: pasa a espera de captura", de(e, "estado")[0], { tipo: "estado", nuevo: "S08_ESPERA_CAPTURA" });
  t("«dale»: envía UN mensaje con todo", de(e, "enviar")[0].textos.length, 1);
  t("«dale»: sin GPT", tipos(e).includes("gpt_fallback"), false);

  const texto = de(e, "enviar")[0].textos[0];
  t("«dale»: trae los datos de Colombia", texto.includes("Nequi"), true);
  t("«dale»: NO trae Venezuela (no es cobrable)", texto.includes("Venezuela"), false);
  t("«dale»: sin placeholders", texto.includes("{{"), false);
  t("«dale»: sin PENDIENTE", /pendiente/i.test(texto), false);
}

{
  const e = decidirS06({ lead: LEAD, cfg: CFG, body: "como pago", norm: "como pago" });
  t("«como pago»: abre el cierre directo", de(e, "estado")[0].nuevo, "S08_ESPERA_CAPTURA");
  t("«como pago»: no pasa por GPT", tipos(e).includes("gpt_responder"), false);
}

{
  const e = decidirS06({ lead: LEAD, cfg: CFG, body: "dale, y sirve en iPhone?", norm: "dale, y sirve en iphone?" });
  t("«dale» + pregunta: registra el motivo", de(e, "evento")[0].detalle.motivo, "pregunta_junto_a_cierre");
  t("«dale» + pregunta: responde antes", tipos(e)[0], "evento");
  t("«dale» + pregunta: el GPT puede abortar", de(e, "gpt_responder")[0].abortar_si_escala, true);
  t("«dale» + pregunta: luego entrega datos", tipos(e).includes("estado"), true);
  t("«dale» + pregunta: orden", tipos(e), ["evento", "gpt_responder", "estado", "enviar"]);
}

// ============================== S06 · negativo y otros ==============================

{
  const e = decidirS06({ lead: LEAD, cfg: CFG, body: "no gracias", norm: "no gracias" });
  t("«no»: mensaje suave", de(e, "enviar")[0].textos, [MSG_NEGATIVO_SUAVE]);
  t("«no»: no entrega datos", tipos(e).includes("estado"), false);
}

{
  const e = decidirS06({ lead: LEAD, cfg: CFG, body: "mmm", norm: "mmm", clasificacion: { tipo: "afirmativo" } });
  t("GPT dice afirmativo: cierra", de(e, "estado")[0].nuevo, "S08_ESPERA_CAPTURA");
}

{
  const e = decidirS06({ lead: LEAD, cfg: CFG, body: "es caro", norm: "es caro", clasificacion: { tipo: "objecion", objecion_id: 2 } });
  t("objeción en el cierre: se responde con recierre", de(e, "responder_objecion")[0], { tipo: "responder_objecion", id: 2, conRecierre: true });
  t("objeción en el cierre: no entrega datos todavía", tipos(e).includes("estado"), false);
}

{
  const e = decidirS06({ lead: LEAD, cfg: CFG, body: "no me interesa", norm: "no me interesa", clasificacion: { tipo: "negativo" } });
  t("GPT negativo: mensaje suave", de(e, "enviar")[0].textos, [MSG_NEGATIVO_SUAVE]);
}

{
  const e = decidirS06({ lead: LEAD, cfg: CFG, body: "hola?", norm: "hola?" });
  t("sin clasificar: fallback GPT", tipos(e), ["gpt_fallback"]);
}

// ============================== S07 · ninguna cuenta válida ==============================

{
  // Si nadie puede cobrar, se escala. JAMÁS se envían placeholders.
  const cfgSinDatos = { ...CFG, cuentasCo: { ...CFG.cuentasCo, provisional: true } };
  const e = efectosDatosPago(LEAD, cfgSinDatos);
  t("sin cuentas válidas: escala a humano", de(e, "lead")[0].patch.escalado_humano, true);
  t("sin cuentas válidas: registra el motivo", de(e, "evento")[0].detalle.motivo, "datos_pago_incompletos");
  t("sin cuentas válidas: NO cambia de estado", tipos(e).includes("estado"), false);
  const texto = de(e, "enviar")[0].textos[0];
  t("sin cuentas válidas: no filtra cuentas", /nequi|bancolombia/i.test(texto), false);
}

// ============================== S07 · solo Colombia ==============================

{
  const e = efectosDatosPago(LEAD, CFG);
  const texto = de(e, "enviar")[0].textos[0];
  t("CO: un solo mensaje", de(e, "enviar")[0].textos.length, 1);
  t("CO: encabezado y pie en el mismo mensaje", texto.split("\n").length > 6, true);
  t("CO: incluye la llave Bre-B", texto.includes(String(CFG.cuentasCo.breb.llave)), true);
  t("CO: no incluye cuentas de Venezuela", texto.includes("Pago Móvil"), false);
  // Dobles espacios HORIZONTALES sí serían un defecto; los \n\n de párrafo no.
  t("CO: sin dobles espacios horizontales", /[ \t]{2,}/.test(texto), false);
}

// ============================== S07 · ambas disponibles ==============================

{
  // Simulación de que Venezuela ya tiene cuentas reales: se envían las dos.
  const cfgAmbas = {
    ...CFG,
    cuentasVe: {
      provisional: false,
      pago_movil: { banco: "0102 Banco de Venezuela", telefono: "04141234567", cedula: "V-12345678", titular: "Mauricio Bonilla" },
      cuenta: { tipo: "corriente", numero: "01020123456789012345", cedula: "V-12345678", titular: "Mauricio Bonilla" },
    },
  };
  const e = efectosDatosPago(LEAD, cfgAmbas);
  const texto = de(e, "enviar")[0].textos[0];
  t("ambas: incluye Venezuela", texto.includes("Pago Móvil"), true);
  t("ambas: incluye Colombia", texto.includes("Nequi"), true);
  t("ambas: Venezuela va primero", texto.indexOf("Pago Móvil") < texto.indexOf("Nequi"), true);
}

// ============================== cerrarConDatos directo ==============================

{
  const e = cerrarConDatos(LEAD, CFG, "pasame los datos", "pasame los datos");
  t("pide datos directo: no llama al GPT", tipos(e).includes("gpt_responder"), false);
  t("pide datos directo: entrega", tipos(e).includes("enviar"), true);
}

console.log(`s06/s07: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
