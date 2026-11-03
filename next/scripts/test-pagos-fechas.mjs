// next/scripts/test-pagos-fechas.mjs — Verificación de pagos, zona horaria y antifraude.
import assert from "node:assert/strict";
import { evaluarPago } from "../src/motor/pago-estricto.ts";

console.log("🧪 Iniciando pruebas de Integridad de Pagos y Zona Horaria (Bloque D)...");

const cfgBase = {
  precio: { cop: 33000, usd: 9 },
  cuentasCo: {
    nequi: { numero: "3227462629" },
    bancolombia: { numero: "12345678901" }
  }
};

// Caso 1: Pago nocturno en Colombia (23:30 COT del 2 de noviembre) verificado al día siguiente a las 08:30 COT (3 de noviembre).
const ahoraManana = new Date("2026-11-03T08:30:00-05:00");
const mockValidoBase = {
  es_captura_completa: true,
  estado_operacion: "exitosa",
  confidence: { monto: 0.98, referencia: 0.98, destino: 0.98 },
  senales_manipulacion: []
};

const pagoNocheConHora = {
  ...mockValidoBase,
  fecha: "2026-11-02",
  hora: "23:30",
  monto: 33000,
  moneda: "COP",
  destino: "3227462629",
  numero_referencia: "M789012"
};

const resNocheConHora = evaluarPago(cfgBase, pagoNocheConHora, true, {
  ahora: ahoraManana,
  ventanaHoras: 24,
  permiteVenezuela: false
});
assert.equal(resNocheConHora.accion, "AUTO_APROBAR", "Pago nocturno con hora debe autoaprobarse a la mañana siguiente");
console.log("✅ Pago nocturno 23:30 verificado a las 08:30 COT: AUTO_APROBAR");

// Caso 2: Pago de ayer solo con fecha (sin hora) verificado a la mañana siguiente.
const pagoAyerSinHora = {
  ...mockValidoBase,
  fecha: "2026-11-02",
  monto: 33000,
  moneda: "COP",
  destino: "3227462629",
  numero_referencia: "M789013"
};

const resAyerSinHora = evaluarPago(cfgBase, pagoAyerSinHora, true, {
  ahora: ahoraManana,
  ventanaHoras: 24,
  permiteVenezuela: false
});
assert.equal(resAyerSinHora.accion, "AUTO_APROBAR", "Pago de ayer sin hora no debe considerarse comprobante_viejo");
console.log("✅ Pago de ayer (solo fecha) verificado al día siguiente: AUTO_APROBAR");

// Caso 3: Pago viejo de hace 3 días -> COLA_HUMANA (comprobante_viejo).
const pagoViejo = {
  ...mockValidoBase,
  fecha: "2026-10-30",
  monto: 33000,
  moneda: "COP",
  destino: "3227462629",
  numero_referencia: "M789014"
};
const resViejo = evaluarPago(cfgBase, pagoViejo, true, {
  ahora: ahoraManana,
  ventanaHoras: 24,
  permiteVenezuela: false
});
assert.equal(resViejo.accion, "COLA_HUMANA");
assert.ok(["comprobante_viejo", "fecha_vieja"].includes(resViejo.motivo));
console.log("✅ Comprobante viejo (>24h): COLA_HUMANA (antigüedad detectada)");

// Caso 4: Monto incorrecto (paga 20.000 en vez de 33.000) -> COLA_HUMANA (pago_incompleto / monto_no_coincide).
const pagoIncompleto = {
  ...mockValidoBase,
  fecha: "2026-11-03",
  monto: 20000,
  moneda: "COP",
  destino: "3227462629",
  numero_referencia: "M789015"
};
const resIncompleto = evaluarPago(cfgBase, pagoIncompleto, true, {
  ahora: ahoraManana,
  ventanaHoras: 24
});
assert.equal(resIncompleto.accion, "COLA_HUMANA");
console.log("✅ Monto incorrecto (20.000 COP): COLA_HUMANA");

// Caso 5: Pago internacional en USD (9 USD) -> AUTO_APROBAR.
const pagoUsd = {
  ...mockValidoBase,
  fecha: "2026-11-03",
  monto: 9,
  moneda: "USD",
  destino: "3227462629",
  numero_referencia: "M789016"
};
const resUsd = evaluarPago(cfgBase, pagoUsd, true, { ahora: ahoraManana });
assert.equal(resUsd.accion, "AUTO_APROBAR");
console.log("✅ Pago en USD ($9): AUTO_APROBAR");

// Caso 6: Sin número de referencia -> COLA_HUMANA (sin_referencia).
const pagoSinRef = {
  ...mockValidoBase,
  fecha: "2026-11-03",
  monto: 33000,
  moneda: "COP",
  destino: "3227462629",
  numero_referencia: ""
};
const resSinRef = evaluarPago(cfgBase, pagoSinRef, true, { ahora: ahoraManana });
assert.equal(resSinRef.accion, "COLA_HUMANA");
assert.equal(resSinRef.motivo, "sin_referencia");
console.log("✅ Sin referencia de pago: COLA_HUMANA (sin_referencia)");

console.log("🎉 Todas las pruebas del Bloque D pasaron satisfactoriamente (6/6 ok)!");
console.log("6 ok, 0 fallas");
