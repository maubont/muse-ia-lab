// next/scripts/calibrar-vision.mjs — MIDE LA VISIÓN ANTES DE CONFIAR EN ELLA.
//
//   $env:MUSA_IA_URL="https://api.openai.com/v1"
//   $env:MUSA_IA_KEY="sk-..."
//   $env:MUSA_IA_MODELO="gpt-6-luna"
//   node --experimental-strip-types next/scripts/calibrar-vision.mjs
//
// Usa los 3 comprobantes reales de `comprobantes-prueba/` y responde tres cosas:
//   1. ¿lee bien el monto, el destino, la fecha y la referencia?
//   2. ¿cuántos tokens gasta de verdad?
//   3. ¿cuál es el coste real por comprobante?
//
// No toca producción ni la base de datos: llama al proveedor y compara. Si algo
// no coincide, sale con código 1 — un calibrador que siempre dice «bien» no sirve.

import { readFileSync } from "node:fs";
import { configDesdeEntorno, leerConProveedor } from "../src/vision/proveedor.ts";
import { costeEstimado } from "../src/vision/presupuesto.ts";

const cfg = configDesdeEntorno(process.env);
if (!cfg) {
  console.error("  ✗ Falta configuración. Define:");
  console.error('      MUSA_IA_URL="https://api.openai.com/v1"');
  console.error('      MUSA_IA_KEY="sk-..."');
  console.error('      MUSA_IA_MODELO="gpt-6-luna"');
  process.exit(2);
}

console.log(`  modelo: ${cfg.modelo}`);
console.log(`  endpoint: ${cfg.baseUrl}`);
console.log(`  razonamiento: ${cfg.razonamiento} · salida estructurada: ${cfg.salidaEstructurada}`);
console.log(`  precio: ${cfg.precioEntrada} / ${cfg.salidaEstructurada === undefined ? "" : ""}${cfg.precioSalida} USD por millón\n`);

/** Lo que un humano ve en cada comprobante. Se compara contra la lectura. */
const CASOS = [
  {
    archivo: "comprobantes-prueba/1-nequi-aprueba.png",
    nombre: "Nequi · envío exitoso",
    esperado: { monto: 33000, moneda: "COP", destino: "3223565761", referencia: "1834502671", estado: "exitosa" },
  },
  {
    archivo: "comprobantes-prueba/2-pagomovil-aprueba.png",
    nombre: "Pago Móvil · exitosa (VES)",
    esperado: { monto: 7400, moneda: "VES", destino: "04141234567", referencia: "004812670933", estado: "exitosa" },
  },
  {
    archivo: "comprobantes-prueba/3-nequi-cola-humana.png",
    nombre: "Nequi · programada",
    esperado: { monto: 33000, moneda: "COP", destino: "3223565761", referencia: "M7740031288", estado: "programada" },
  },
];

/** Solo dígitos, para comparar números escritos de mil formas. */
const digitos = (s) => String(s ?? "").replace(/\D/g, "");

let fallas = 0;
let tokensEntrada = 0;
let tokensSalida = 0;

for (const caso of CASOS) {
  let bytes;
  try {
    bytes = readFileSync(caso.archivo);
  } catch {
    console.log(`  ✗ ${caso.nombre}: no se encuentra ${caso.archivo}`);
    fallas++;
    continue;
  }

  const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  const t0 = Date.now();
  const r = await leerConProveedor(cfg, dataUrl);
  const ms = Date.now() - t0;

  tokensEntrada += r.tokensEntrada;
  tokensSalida += r.tokensSalida;
  const coste = costeEstimado(r.tokensEntrada, r.tokensSalida, { entrada: cfg.precioEntrada, salida: cfg.precioSalida });

  console.log(`  ── ${caso.nombre}`);
  console.log(`     ${ms} ms · ${r.tokensEntrada}/${r.tokensSalida} tokens · $${coste.toFixed(6)}`);

  if (!r.datos) {
    console.log(`     ✗ no devolvió datos: ${r.motivoFallo}`);
    fallas++;
    continue;
  }

  const d = r.datos;
  const comprobaciones = [
    ["monto", d.monto, caso.esperado.monto, (a, b) => Number(a) === Number(b)],
    ["moneda", d.moneda, caso.esperado.moneda, (a, b) => String(a ?? "").toUpperCase() === b],
    ["destino", d.destino, caso.esperado.destino, (a, b) => digitos(a) === digitos(b)],
    ["referencia", d.numero_referencia, caso.esperado.referencia, (a, b) => digitos(a) === digitos(b)],
    ["estado", d.estado_operacion, caso.esperado.estado, (a, b) => String(a ?? "") === b],
  ];

  for (const [campo, real, esperado, igual] of comprobaciones) {
    const bien = igual(real, esperado);
    if (!bien) fallas++;
    console.log(`     ${bien ? "✓" : "✗"} ${campo.padEnd(12)} ${String(real ?? "—").padEnd(18)} ${bien ? "" : "esperado " + esperado}`);
  }
  console.log(`     fecha leída: ${d.fecha ?? "—"} · confianza monto ${d.confidence.monto}`);
}

const costeTotal = costeEstimado(tokensEntrada, tokensSalida, { entrada: cfg.precioEntrada, salida: cfg.precioSalida });
console.log(`\n  ── resumen`);
console.log(`  tokens: ${tokensEntrada} entrada · ${tokensSalida} salida`);
console.log(`  coste de las 3 pruebas: $${costeTotal.toFixed(6)}`);
console.log(`  coste medio por comprobante: $${(costeTotal / CASOS.length).toFixed(6)}`);
console.log(`  a ese precio, 1.000 comprobantes: $${((costeTotal / CASOS.length) * 1000).toFixed(2)}`);
console.log(fallas === 0 ? "\n  ✓ los 3 comprobantes se leen bien" : `\n  ✗ ${fallas} comprobaciones fallidas`);
process.exit(fallas === 0 ? 0 : 1);
