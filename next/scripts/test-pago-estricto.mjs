// next/scripts/test-pago-estricto.mjs — la capa que endurece el comprobante.
//
//   node --experimental-strip-types next/scripts/test-pago-estricto.mjs
//
// El caso que motiva todo: un comprobante FALSO que solo mencione nuestro número
// en la referencia. Antes pasaba el filtro del destino por coincidencia parcial.
// Ahora tiene que ir a un humano.

import { readFileSync } from "node:fs";
import { decidirComprobante } from "../../functions/motor/comprobante.ts";
import { endurecer, evaluarPago, destinosReales, coincideDestinoExacto, normalizarDestino } from "../src/motor/pago-estricto.ts";

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
  precio: crudo.precio,
  cuentasCo: crudo.cuentas_co,
  cuentasVe: crudo.cuentas_ve,
  precioBsHoy: crudo.precio_bs_hoy,
};
const NEQUI = crudo.cuentas_co.nequi.numero; // 3223565761

const ahora = new Date("2026-10-28T15:00:00Z");
const hoyBogota = "2026-10-28";

const datos = (extra = {}) => ({
  metodo: "Nequi", monto: 33000, moneda: "COP", fecha: hoyBogota, hora: "10:00",
  numero_referencia: "M-123", destino: NEQUI, numeros_detectados: [],
  nombre_destinatario: null, banco_o_app: "Nequi", estado_operacion: "exitosa",
  es_captura_completa: true, senales_manipulacion: [],
  confidence: { monto: 0.99, referencia: 0.99, destino: 0.99, fecha: 0.99 },
  ...extra,
});

const decidir = (d, extra) => evaluarPago(CFG, d, true, { ahora, ...extra });

// ============================== el original sigue igual ==============================
{
  // El módulo verificado no se tocó: mismo caso, misma respuesta.
  t("el original aprueba el caso limpio", decidirComprobante(CFG, datos(), true).accion, "AUTO_APROBAR");
}

// ============================== el caso limpio pasa ==============================
{
  const r = decidir(datos());
  t("caso limpio: aprueba", r.accion, "AUTO_APROBAR");
  t("caso limpio: sin motivo", r.motivo, null);
}

// ============================== LA VULNERABILIDAD QUE SE CIERRA ==============================
{
  // Nuestro número escondido en la referencia: al extraer dígitos queda
  // 322356576101, que CONTIENE 3223565761. El original decía "coincide".
  const d = datos({ destino: "M-3223565761-01", numeros_detectados: ["M-3223565761-01"] });
  const base = decidirComprobante(CFG, d, true);
  t("el original aprobaba el ataque", base.accion, "AUTO_APROBAR");
  t("la capa estricta lo manda a humano", decidir(d).accion, "COLA_HUMANA");
  t("la capa estricta explica el motivo", decidir(d).motivo, "destino_no_exacto");
}

// ============================== normalización del destino ==============================
{
  t("con prefijo 57: se acepta", decidir(datos({ destino: "573223565761" })).accion, "AUTO_APROBAR");
  t("con separadores: se acepta", decidir(datos({ destino: "322 356 5761" })).accion, "AUTO_APROBAR");
  t("normalizar: quita el 57", normalizarDestino("573223565761").digitos, "3223565761");
  t("normalizar: separadores", normalizarDestino("322-356-5761").digitos, "3223565761");
}

{
  // Un número DISTINTO que por casualidad contiene el nuestro.
  const r = decidir(datos({ destino: "9932235657610" }));
  t("número ajeno que contiene el nuestro: humano", r.accion, "COLA_HUMANA");
}

// ============================== Venezuela fuera ==============================
{
  const d = datos({ moneda: "VES", monto: 7400, destino: "04141234567" });
  const r = decidir(d);
  t("VES: no se aprueba", r.accion, "COLA_HUMANA");
  t("VES: motivo de moneda", r.motivo, "moneda_no_habilitada");
}

{
  // Aunque el destino sea de las cuentas VE, la moneda manda.
  const d = datos({ moneda: "VES", monto: 7400, destino: crudo.cuentas_ve.pago_movil.telefono });
  t("cuenta VE: tampoco", decidir(d).motivo, "moneda_no_habilitada");
}

// ============================== cuentas de simulación ==============================
{
  const destinos = destinosReales(CFG);
  t("destinos reales: las VE son simulación", destinos.filter((d) => d.pais === "VE").every((d) => d.simulacion), true);
  t("destinos reales: las CO no", destinos.filter((d) => d.pais === "CO").every((d) => !d.simulacion), true);
  t("destinos reales: existen los de Colombia", destinos.filter((d) => d.pais === "CO").length >= 3, true);

  const verificacion = coincideDestinoExacto(datos({ destino: "04141234567" }), destinos);
  t("destino simulado: no cuenta", verificacion.coincide, false);
}

// ============================== ventana de 24 horas ==============================
{
  t("hoy: pasa", decidir(datos({ fecha: "2026-10-28" })).accion, "AUTO_APROBAR");
  t("ayer: pasa (menos de 24 h si es el mismo día hábil)", decidir(datos({ fecha: "2026-10-27" })).motivo === "comprobante_viejo", true);
  t("hace tres días: humano", decidir(datos({ fecha: "2026-10-25" })).accion, "COLA_HUMANA");
  // Entre 24 h y 3 días el verificado pasaría; la ventana estricta es la que corta.
  t("hace 30 h: humano por ventana", decidir(datos({ fecha: "2026-10-27T09:00:00Z".slice(0,10) })).accion, "COLA_HUMANA");
  t("fecha futura: humano", decidir(datos({ fecha: "2026-11-05" })).motivo, "fecha_futura");
}

// ============================== monto ==============================
{
  t("monto exacto: aprueba", decidir(datos({ monto: 33000 })).accion, "AUTO_APROBAR");
  t("monto corto: humano", decidir(datos({ monto: 32000 })).accion, "COLA_HUMANA");
  t("monto largo: humano", decidir(datos({ monto: 34000 })).accion, "COLA_HUMANA");
  t("el doble: humano (antes pasaba)", decidir(datos({ monto: 66000 })).accion, "COLA_HUMANA");
  t("monto nulo: humano", decidir(datos({ monto: null })).accion, "COLA_HUMANA");
}

// ============================== nunca relaja ==============================
{
  const rechazos = [
    datos({ estado_operacion: "fallida" }),
    datos({ monto: 1000 }),
    datos({ es_captura_completa: false }),
    datos({ senales_manipulacion: ["fuente_cambiada"] }),
  ];
  for (const d of rechazos) {
    const base = decidirComprobante(CFG, d, true);
    const estricto = decidir(d);
    t(`no relaja: ${base.motivo}`, estricto.accion, base.accion);
    t(`no cambia el motivo: ${base.motivo}`, estricto.motivo, base.motivo);
  }
}

{
  // Si el lead ya pagó antes, tampoco se aprueba dos veces.
  const d = datos();
  const base = decidirComprobante(CFG, d, false);
  t("segundo pago: humano", endurecer(base, d, CFG, { ahora }).accion, "COLA_HUMANA");
}

// ============================== llaves alfanuméricas ==============================
{
  const cfgBreb = {
    ...CFG,
    cuentasCo: { ...CFG.cuentasCo, breb: { llave: "@musa.oficial", titular: "Musa" } },
  };
  const destinos = destinosReales(cfgBreb);
  const breb = destinos.find((d) => d.alfa === "@musa.oficial");
  t("llave alfanumérica: se conserva", breb !== undefined, true);
  t("llave alfanumérica: sin dígitos", breb.digitos, null);

  const d = datos({ destino: "@musa.oficial", metodo: "Bre-B" });
  // LÍMITE HONESTO: el módulo verificado compara con `soloDigitos` y una llave
  // sin dígitos nunca coincide, así que esto va a humano ANTES de llegar aquí.
  t("llave alfanumérica: el verificado la manda a humano", decidirComprobante(cfgBreb, d, true).accion, "COLA_HUMANA");
  t("la capa estricta no puede desbloquear lo que el verificado bloquea", evaluarPago(cfgBreb, d, true, { ahora }).accion, "COLA_HUMANA");
}

console.log(`pago estricto: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
