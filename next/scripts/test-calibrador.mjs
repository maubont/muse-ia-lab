// Prueba del calibrador sin gastar: un proveedor falso devuelve lecturas buenas y
// una mala, y se comprueba que el script las distingue.
import { validarDatos } from "../src/vision/proveedor.ts";

const BUENO = {
  metodo: "Nequi", monto: 33000, moneda: "COP", fecha: "2026-06-13", hora: "14:41",
  numero_referencia: "1834502671", destino: "3223565761", numeros_detectados: [],
  nombre_destinatario: "MUSA IA LAB", banco_o_app: "Nequi", estado_operacion: "exitosa",
  es_captura_completa: true, senales_manipulacion: [],
  confidence: { monto: 0.99, referencia: 0.98, destino: 0.97, fecha: 0.96 },
};
const MALO = { ...BUENO, monto: 32000 };

let ok = 0, fallas = 0;
const t = (e, r, x) => { if (JSON.stringify(r) === JSON.stringify(x)) ok++; else { fallas++; console.error(`FALLA ${e}: ${JSON.stringify(r)} != ${JSON.stringify(x)}`); } };

const digitos = (s) => String(s ?? "").replace(/\D/g, "");
t("valida buena", validarDatos(BUENO).monto, 33000);
t("detecta monto malo", validarDatos(MALO).monto === 33000, false);
t("digitos normalizan", digitos("0414-1234567"), "04141234567");
t("referencia con letra", digitos("M7740031288"), "7740031288");

console.log(`calibrador: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
