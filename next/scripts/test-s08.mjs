// next/scripts/test-s08.mjs — el estado que decide si se entrega gratis o no.
//
//   node --experimental-strip-types next/scripts/test-s08.mjs
//
// Todas las guardas del original, en orden. Lo que se busca: que NINGUNA ruta
// llegue a la entrega sin pasar por las siete comprobaciones.

import { readFileSync } from "node:fs";
import {
  decidirS08,
  MSG_PAGO_REENVIO,
  MSG_PAGO_EN_PROCESO,
  MSG_PAGO_YA_TIENE_ACCESO,
  MSG_PAGO_VERIFICANDO_DENTRO,
  MSG_PAGO_VERIFICANDO_FUERA,
} from "../src/motor/s08.ts";

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

const LEAD = { phone: "+573001112233", nombre: "Carlos", profile_name: "Carlos", estado_funnel: "S08_ESPERA_CAPTURA" };

const COMPROBANTE = {
  metodo: "Nequi", monto: 33000, moneda: "COP", fecha: new Date().toISOString().slice(0, 10),
  hora: "10:32", numero_referencia: "M123456789", destino: "3223565761",
  numeros_detectados: ["3223565761"], nombre_destinatario: "Mau** Bon**",
  banco_o_app: "Nequi", estado_operacion: "exitosa", es_captura_completa: true,
  senales_manipulacion: [], confidence: { monto: 0.99, referencia: 0.98, destino: 0.97, fecha: 0.95 },
};

const base = (extra = {}) => decidirS08({
  lead: LEAD, cfg: CFG, datos: COMPROBANTE, dentroDeHorario: true, esPrimerPago: true, ...extra,
});

const tipos = (e) => e.map((x) => x.tipo);
const de = (e, tipo) => e.filter((x) => x.tipo === tipo);
const entrega = (e) => e.some((x) => x.tipo === "reclamar_entrega");

// ============================== 1. ya pagó ==============================
{
  const e = base({ lead: { ...LEAD, pagado: true } });
  t("ya pagó: evento", de(e, "evento")[0].nombre, "comprobante_ignorado_ya_pagado");
  t("ya pagó: recordatorio", de(e, "enviar")[0].textos, [MSG_PAGO_YA_TIENE_ACCESO]);
  t("ya pagó: NO entrega", entrega(e), false);
  t("ya pagó: NO registra pago", tipos(e).includes("registrar_pago"), false);
}

// ============================== 2. visión fallida ==============================
{
  const e = base({ datos: null });
  t("visión fallida: a cola humana", de(e, "registrar_pago")[0].estado, "revision");
  t("visión fallida: motivo", de(e, "registrar_pago")[0].motivo, "vision_fallida");
  t("visión fallida: NO entrega", entrega(e), false);
  t("visión fallida: acusa al lead", de(e, "enviar")[0].textos, [MSG_PAGO_VERIFICANDO_DENTRO]);
  t("visión fallida: avisa al operador", tipos(e).includes("notificar_operador"), true);
}

// ============================== 3. imagen duplicada ==============================
{
  const e = base({ imagenDuplicada: true });
  t("imagen duplicada: motivo", de(e, "registrar_pago")[0].motivo, "imagen_duplicada");
  t("imagen duplicada: NO entrega", entrega(e), false);
}

// ============================== 4-6. aprobación ==============================
{
  const e = base();
  t("aprobado: registra como aprobado", de(e, "registrar_pago")[0].estado, "aprobado");
  t("aprobado: evento", de(e, "evento")[0].nombre, "pago_aprobado_auto");
  t("aprobado: ENTREGA", entrega(e), true);
  // La entrega dejó de ser un `enviar`: ahora es `entregar_curso`, que crea el
  // acceso y manda UN enlace. La barrera tiene que seguir yendo antes.
  t("aprobado: la barrera va antes de la entrega", tipos(e).indexOf("reclamar_entrega") < tipos(e).indexOf("entregar_curso"), true);
}
{
  const e = base({ breakerActivo: true });
  t("breaker: evento", de(e, "evento")[0].nombre, "circuit_breaker");
  t("breaker: NO entrega", entrega(e), false);
  t("breaker: a cola humana", de(e, "registrar_pago")[0].estado, "revision");
}
{
  const e = base({ refDuplicada: true });
  t("ref duplicada: NO entrega", entrega(e), false);
  t("ref duplicada: a cola humana", de(e, "registrar_pago")[0].estado, "revision");
}
{
  // Segundo pago del mismo lead: no se auto-aprueba.
  const e = base({ esPrimerPago: false });
  t("segundo pago: NO entrega", entrega(e), false);
  t("segundo pago: motivo", de(e, "registrar_pago")[0].motivo, "lead_ya_tiene_pago");
}

// ============================== 5. pedir reenvío ==============================
{
  const e = base({ datos: { ...COMPROBANTE, es_captura_completa: false } });
  t("captura incompleta: pide reenvío", de(e, "enviar")[0].textos, [MSG_PAGO_REENVIO]);
  t("captura incompleta: NO avisa al operador", tipos(e).includes("notificar_operador"), false);
  t("captura incompleta: NO entrega", entrega(e), false);
}

// ============================== 7. cola humana por estado ==============================
{
  const e = base({ datos: { ...COMPROBANTE, estado_operacion: "programada" } });
  t("programada: motivo", de(e, "registrar_pago")[0].motivo, "estado_programada");
  t("programada: acuse específico", de(e, "enviar")[0].textos, [MSG_PAGO_EN_PROCESO]);
  t("programada: NO entrega", entrega(e), false);
}

// ============================== horario ==============================
{
  // Se usa un caso que va a cola humana (visión fallida): ahí el acuse depende
  // del horario. Con datos válidos la ruta es la entrega, no un acuse.
  const dentro = base({ datos: null, dentroDeHorario: true });
  const fuera = base({ datos: null, dentroDeHorario: false });
  t("dentro de horario: acuse A", de(dentro, "enviar")[0].textos[0], MSG_PAGO_VERIFICANDO_DENTRO);
  t("fuera de horario: acuse B", de(fuera, "enviar")[0].textos[0], MSG_PAGO_VERIFICANDO_FUERA);
}

// ============================== operador ==============================
{
  const e = base({ datos: { ...COMPROBANTE, estado_operacion: "programada" } });
  const texto = de(e, "notificar_operador")[0].texto;
  t("operador: lleva el id a sustituir", texto.includes("{{short_id}}"), true);
  t("operador: lleva el motivo", texto.includes("estado_programada"), true);
  t("operador: lleva las tres órdenes", /ok .*no .*ver/.test(texto), true);
}

console.log(`s08 comprobante: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
