// next/scripts/test-router.mjs — guardas globales y despacho por estado.
//
//   node --experimental-strip-types next/scripts/test-router.mjs
//
// La prueba que más importa: que un STOP no llegue nunca a la máquina de estados
// y que quien ya pidió salir no reciba ni un mensaje más.

import { readFileSync } from "node:fs";
import { decidirRuta, MSG_OPTOUT, preguntaDeEtapa } from "../src/motor/router.ts";

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
  precioBsHoy: crudo.precio_bs_hoy ?? { bs: 7800 },
  cuentasVe: crudo.cuentas_ve ?? {},
  cuentasCo: crudo.cuentas_co ?? {},
  entrega: crudo.entrega ?? {},
};

const lead = (extra = {}) => ({ phone: "+573001112233", nombre: "Carlos", profile_name: "Carlos", estado_funnel: "S04_GATE18", ...extra });
const tipos = (e) => e.map((x) => x.tipo);
const de = (e, tipo) => e.filter((x) => x.tipo === tipo);
const ruta = (body, norm, extra = {}) => decidirRuta({ lead: lead(extra.lead), cfg: CFG, body, norm, clasificacion: extra.clasificacion });

// ============================== 1-2. opt-out ==============================
{
  const e = ruta("hola", "hola", { lead: { opt_out: true } });
  t("ya dio de baja: no recibe NADA", e, []);
}

for (const palabra of ["stop", "salir", "cancelar", "baja", "mejor no, salir"]) {
  const e = ruta(palabra, palabra);
  t(`«${palabra}»: marca opt_out`, de(e, "lead")[0].patch.opt_out, true);
  t(`«${palabra}»: registra el evento`, de(e, "evento")[0].nombre, "optout");
  t(`«${palabra}»: despide una vez`, de(e, "enviar")[0].textos, [MSG_OPTOUT]);
  t(`«${palabra}»: NO llega a la máquina de estados`, tipos(e).includes("reask_gate") || tipos(e).includes("gpt_fallback"), false);
}

{
  // STOP con el bot en pausa por escalado: sigue funcionando.
  const e = ruta("stop", "stop", { lead: { escalado_humano: true } });
  t("STOP con escalado activo: también funciona", de(e, "lead")[0].patch.opt_out, true);
}

// ============================== 3. ¿eres un bot? ==============================
{
  const e = ruta("eres un bot?", "eres un bot?");
  t("pregunta de bot: responde la objeción", de(e, "responder_objecion").length, 1);
  t("pregunta de bot: retoma la etapa", de(e, "enviar")[0].textos, [preguntaDeEtapa("S04_GATE18")]);
  t("pregunta de bot: NO delega al GPT", tipos(e).includes("gpt_fallback"), false);
}

{
  // Lead nuevo que abre preguntando: no se le manda la pregunta de etapa.
  const e = ruta("eres un bot?", "eres un bot?", { lead: { estado_funnel: "S00_LLEGADA" } });
  t("bot en S00: solo la objeción", tipos(e), ["responder_objecion"]);
}

// ============================== 4. pide humano ==============================
{
  const e = ruta("quiero hablar con una persona", "quiero hablar con una persona");
  t("pide humano: marca escalado", de(e, "lead")[0].patch.escalado_humano, true);
  t("pide humano: motivo", de(e, "evento")[0].detalle.motivo, "pidio_humano");
  t("pide humano: avisa al lead", de(e, "enviar")[0].textos.length, 1);
  t("pide humano: NO delega al GPT", tipos(e).includes("gpt_fallback"), false);
}

// ============================== 5. despacho ==============================
{
  const e = ruta("tengo 25", "tengo 25");
  t("S04: decide el gate", de(e, "estado")[0].nuevo, "S06_CIERRE");
}

{
  const e = ruta("dale", "dale", { lead: { estado_funnel: "S06_CIERRE" } });
  t("S06: entrega datos de pago", de(e, "estado")[0].nuevo, "S08_ESPERA_CAPTURA");
}

{
  const e = ruta("aquí va mi captura", "aqui va mi captura", { lead: { estado_funnel: "S08_ESPERA_CAPTURA" } });
  t("S08 sin comprobante: no decide dinero", tipos(e), ["gpt_fallback"]);
}

{
  const e = ruta("tengo 16", "tengo 16", { lead: { estado_funnel: "S04_GATE18" } });
  t("S04 menor: bloquea", de(e, "estado")[0].nuevo, "S92_MENOR");
}

{
  const e = ruta("hola", "hola", { lead: { estado_funnel: "S11_POSTVENTA" } });
  t("estado no portado: fallback", tipos(e), ["gpt_fallback"]);
}

{
  // Quien ya pagó y escribe mientras se verifica NO puede quedarse en silencio.
  const e = ruta("ya me lo activas?", "ya me lo activas?", { lead: { estado_funnel: "S09_VERIFICACION" } });
  t("S09: siempre acusa", tipos(e), ["enviar"]);
  t("S09: el mensaje tranquiliza", de(e, "enviar")[0].textos[0].includes("acceso queda asegurado"), true);
  t("S09: NO delega al GPT", tipos(e).includes("gpt_fallback"), false);
}

{
  // Pero un STOP en S09 sigue mandando a callar: la baja manda sobre todo.
  const e = ruta("stop", "stop", { lead: { estado_funnel: "S09_VERIFICACION" } });
  t("S09 + STOP: da de baja", de(e, "lead")[0].patch.opt_out, true);
  t("S09 + STOP: no acusa", de(e, "enviar")[0].textos[0].includes("verificando"), false);
}

// ============================== preguntas de etapa ==============================
{
  t("pregunta de etapa conocida", preguntaDeEtapa("S04_GATE18").includes("18"), true);
  t("pregunta de etapa desconocida: genérica", preguntaDeEtapa("S99"), "¿En qué te puedo ayudar? 😊");
}

console.log(`router: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
