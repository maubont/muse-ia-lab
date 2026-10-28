// scripts/test-comprobante.mjs — pruebas adversariales del núcleo antifraude de Musa.
//
// No necesita dependencias ni red: importa las funciones puras de
// functions/motor/comprobante.ts. Node 20.6+ (con --experimental-strip-types) o
// Node 22.6+/24 lo ejecuta directo:
//
//   node --experimental-strip-types scripts/test-comprobante.mjs
//
// El set replica los casos que el plan maestro (§7) y la fase 4 exigen:
// legítimo, reutilizado, editado, "programada", monto menor, destino ajeno.

import {
  decidirComprobante,
  nuestrosDestinos,
  precioEsperado,
} from "../functions/motor/comprobante.ts";

// ============================== fixtures ==============================

const hoy = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const enDias = (n) => iso(new Date(hoy.getTime() + n * 24 * 60 * 60 * 1000));

const CFG = {
  precio: { usd: 9, cop: 33000 },
  precioBsHoy: { bs: 7800 },
  cuentasCo: {
    provisional: false,
    bancolombia: { tipo: "ahorros", numero: "82061072256", titular: "Mau** Bon**" },
    nequi: { numero: "3223565761", titular: "PENDIENTE" },
    breb: { llave: "3223565761", titular: "PENDIENTE" },
  },
  cuentasVe: {
    provisional: true,
    pago_movil: { telefono: "0412-0000000" },
    cuenta: { numero: "01020000000000000000" },
  },
};

/** Comprobante COP válido y completo: el caso que SÍ debe entregar producto. */
const LEGITIMO = {
  metodo: "Nequi",
  monto: 33000,
  moneda: "COP",
  fecha: iso(hoy),
  hora: "10:32",
  numero_referencia: "M123456789",
  destino: "3223565761",
  numeros_detectados: ["3223565761"],
  nombre_destinatario: "Mau** Bon**",
  banco_o_app: "Nequi",
  estado_operacion: "exitosa",
  es_captura_completa: true,
  senales_manipulacion: [],
  confidence: { monto: 0.99, referencia: 0.98, destino: 0.97, fecha: 0.95 },
};

const con = (parche) => ({ ...LEGITIMO, ...parche });

// ============================== runner ==============================

let ok = 0;
let fallas = 0;
const avisos = [];

function caso(etiqueta, datos, accionEsperada, motivoEsperado, primerPago = true) {
  const r = decidirComprobante(CFG, datos, primerPago);
  const bien = r.accion === accionEsperada && (r.motivo ?? null) === (motivoEsperado ?? null);
  if (bien) {
    ok++;
    return;
  }
  fallas++;
  console.error(
    `FALLA ${etiqueta}\n   esperado: ${accionEsperada} / ${motivoEsperado ?? "null"}` +
      `\n   real:     ${r.accion} / ${r.motivo ?? "null"}`,
  );
}

// ============================== casos ==============================

caso("01 legítimo COP", LEGITIMO, "AUTO_APROBAR", null);
caso("02 límite inferior exacto (0,98×)", con({ monto: 32340 }), "AUTO_APROBAR", null);
caso("03 un peso bajo el límite", con({ monto: 32339 }), "COLA_HUMANA", "pago_incompleto");
caso("04 sobrepago dentro de 3×", con({ monto: 50000 }), "AUTO_APROBAR", null);
caso("05 monto excesivo (>3×)", con({ monto: 99001 }), "COLA_HUMANA", "monto_excesivo");
caso("06 estado programada (fraude nº1 Bancolombia)", con({ estado_operacion: "programada" }), "COLA_HUMANA", "estado_programada");
caso("07 estado en proceso", con({ estado_operacion: "en_proceso" }), "COLA_HUMANA", "estado_en_proceso");
caso("08 estado fallida", con({ estado_operacion: "fallida" }), "COLA_HUMANA", "estado_fallida");
caso("09 captura ilegible", con({ estado_operacion: "ilegible" }), "PEDIR_REENVIO", "captura_incompleta");
caso("10 captura incompleta", con({ es_captura_completa: false }), "PEDIR_REENVIO", "captura_incompleta");
caso("11 destino ajeno", con({ destino: "3001112233", numeros_detectados: ["3001112233"] }), "COLA_HUMANA", "destino_no_coincide");
caso("12 destino con formato y prefijo", con({ destino: "+57 322 356 5761", numeros_detectados: [] }), "AUTO_APROBAR", null);
caso("13 destino ilegible pero número presente (fix Fase 4)", con({ destino: null, numeros_detectados: ["Enviado a 3223565761"] }), "AUTO_APROBAR", null);
caso("14 sin destino ni números", con({ destino: null, numeros_detectados: [] }), "COLA_HUMANA", "destino_no_coincide");
caso("15 fecha futura (+2 días)", con({ fecha: enDias(2) }), "COLA_HUMANA", "fecha_futura");
caso("16 fecha vieja (5 días)", con({ fecha: enDias(-5) }), "COLA_HUMANA", "fecha_vieja");
caso("17 fecha ausente no bloquea", con({ fecha: null }), "AUTO_APROBAR", null);
caso("18 confianza monto baja", con({ confidence: { monto: 0.5, referencia: 0.99, destino: 0.99, fecha: 0.99 } }), "COLA_HUMANA", "baja_confianza");
caso("19 confianza referencia ausente", con({ confidence: { monto: 0.99, destino: 0.99, fecha: 0.99 } }), "COLA_HUMANA", "baja_confianza");
caso("20 señales de manipulación", con({ senales_manipulacion: ["fuente_editada"] }), "COLA_HUMANA", "senales_manipulacion");
caso("21 moneda desconocida", con({ moneda: "ARS" }), "COLA_HUMANA", "monto_o_moneda_ilegible");
caso("22 monto nulo", con({ monto: null }), "COLA_HUMANA", "monto_o_moneda_ilegible");
caso("23 lead ya tiene pago aprobado", LEGITIMO, "COLA_HUMANA", "lead_ya_tiene_pago", false);
caso("24 bolívares correctos", con({ moneda: "VES", monto: 7800 }), "AUTO_APROBAR", null);
caso("25 bolívares incompletos", con({ moneda: "VES", monto: 7000 }), "COLA_HUMANA", "pago_incompleto");
caso("26 USD (9)", con({ moneda: "USD", monto: 9 }), "AUTO_APROBAR", null);
caso("27 Bancolombia con número de 11 dígitos", con({ metodo: "Bancolombia", destino: "82061072256", numeros_detectados: ["82061072256"] }), "AUTO_APROBAR", null);

// Caso de observación: cuenta MÁS LARGA que contiene la nuestra como substring.
// El código la aprueba (regla `includes`, tolerancia a prefijos de banco del OCR).
// No es un fallo del test: es un trade-off que el dueño debe conocer.
{
  const r = decidirComprobante(
    CFG,
    con({ destino: "57322356576101", numeros_detectados: ["57322356576101"] }),
    true,
  );
  if (r.accion === "AUTO_APROBAR") {
    avisos.push(
      "OBSERVACIÓN 28: una cuenta ajena que CONTIENE el número de Musa como substring " +
        "se auto-aprueba (regla `includes`). Documentado en motor/comprobante.ts; " +
        "decisión del dueño si se endurece a igualdad exacta.",
    );
  } else {
    avisos.push(`OBSERVACIÓN 28: substring rechazado (${r.accion}/${r.motivo}).`);
  }
}

// ============================== utilidades puras ==============================

function eq(real, esperado, etiqueta) {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    ok++;
    return;
  }
  fallas++;
  console.error(`FALLA ${etiqueta}: esperado ${b}, real ${a}`);
}

eq(precioEsperado(CFG, "cop"), 33000, "precioEsperado cop minúsculas");
eq(precioEsperado(CFG, "VES"), 7800, "precioEsperado bes");
eq(precioEsperado(CFG, null), null, "precioEsperado sin moneda");
eq(precioEsperado(CFG, "GBP"), null, "precioEsperado moneda no soportada");

const destinos = nuestrosDestinos(CFG);
eq(destinos.length, 4, "nuestrosDestinos deduplica nequi/breb (4 únicos)");
if (!destinos.includes("3223565761")) {
  fallas++;
  console.error("FALLA nuestrosDestinos no incluye Nequi");
} else {
  ok++;
}

// ============================== salida ==============================

for (const a of avisos) console.log("⚠ " + a);
console.log(`comprobante: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
