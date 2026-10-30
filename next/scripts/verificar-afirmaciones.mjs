// next/scripts/verificar-afirmaciones.mjs — MIS 10 AFIRMACIONES, COMPROBADAS.
//
//   node --experimental-strip-types next/scripts/verificar-afirmaciones.mjs
//
// El prompt de auditoría externa incluye una tabla de 10 cosas que afirmo sobre el
// sistema, y le pide al auditor que las verifique en el código. Esto es lo mismo,
// pero ejecutable: cada afirmación se apoya en pruebas que corren aquí, sin red ni
// base de datos.
//
// Si una afirmación depende de una prueba que falla, la afirmación es falsa por
// mucho que el código parezca correcto.
//
// Y si una afirmación NO se puede comprobar con pruebas, se dice — no se finge.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = new URL("../../", import.meta.url);

/** Cada afirmación: qué se comprueba y con qué evidencia. */
const AFIRMACIONES = [
  {
    id: 1,
    texto: "El webhook rechaza con 403 si la firma no es válida",
    pruebas: ["next/scripts/test-servidor.mjs"],
    evidencia: ["next/src/api/servidor.ts", "functions/canal/evolution.ts"],
  },
  {
    id: 2,
    texto: "Quien escribe STOP queda en silencio para siempre",
    pruebas: ["next/scripts/test-router.mjs"],
    evidencia: ["next/src/motor/router.ts", "functions/motor/guardarrailes.ts"],
  },
  {
    id: 3,
    texto: "Un mensaje que empieza por «no» ya no se marca como menor",
    pruebas: ["next/scripts/test-gate-edad.mjs"],
    evidencia: ["next/src/motor/gate-edad.ts"],
  },
  {
    id: 4,
    texto: "El mismo comprobante no se paga dos veces (caché por huella)",
    pruebas: ["next/scripts/test-vision.mjs"],
    evidencia: ["next/src/vision/lector.ts"],
  },
  {
    id: 5,
    texto: "Sin proveedor de IA, todo comprobante va a un humano",
    pruebas: ["next/scripts/test-motor-vision.mjs"],
    evidencia: ["next/src/motor/motor-real.ts"],
  },
  {
    id: 6,
    texto: "La entrega tiene una barrera atómica anti-doble-entrega",
    pruebas: ["next/scripts/test-s10.mjs", "next/scripts/test-ejecutar.mjs", "next/scripts/test-repositorio.mjs"],
    evidencia: ["next/src/db/repositorio.ts", "next/src/motor/s10.ts"],
  },
  {
    id: 7,
    texto: "Una clave con `..` no puede leer fuera del almacén",
    pruebas: ["next/scripts/test-medios.mjs"],
    evidencia: ["next/src/acceso/medios.ts"],
  },
  {
    id: 8,
    texto: "El gasto en IA se corta al llegar al tope diario",
    pruebas: ["next/scripts/test-vision.mjs"],
    evidencia: ["next/src/vision/presupuesto.ts"],
  },
  {
    id: 9,
    texto: "Reemitir un acceso revoca el anterior",
    pruebas: ["next/scripts/test-acceso.mjs"],
    evidencia: ["next/src/acceso/accesos.ts"],
  },
  {
    id: 10,
    texto: "Nada se aprueba sin datos válidos, aunque el modelo diga que está seguro",
    pruebas: ["next/scripts/test-vision.mjs", "next/scripts/test-pago-estricto.mjs"],
    evidencia: ["next/src/vision/proveedor.ts", "next/src/motor/pago-estricto.ts"],
  },
];

const ejecutar = (ruta) => {
  const r = spawnSync(
    process.execPath,
    ["--experimental-strip-types", fileURLToPath(new URL(ruta, RAIZ))],
    { encoding: "utf8", timeout: 180000 },
  );
  const salida = (r.stdout ?? "") + (r.stderr ?? "");
  const m = /(\d+) ok, (\d+) fallas/.exec(salida);
  return {
    ruta,
    codigo: r.status,
    ok: m ? Number(m[1]) : 0,
    fallas: m ? Number(m[2]) : -1,
    crudo: salida,
  };
};

let verificadas = 0;
let falsas = 0;
const detalle = [];

console.log("  Afirmación                                                  Pruebas  Estado");

for (const a of AFIRMACIONES) {
  const resultados = a.pruebas.map(ejecutar);
  const totalOk = resultados.reduce((x, r) => x + r.ok, 0);
  const totalFallas = resultados.reduce((x, r) => x + r.fallas, 0);
  const sinConteo = resultados.some((r) => r.fallas === -1);
  const bien = !sinConteo && totalFallas === 0 && totalOk > 0;

  if (bien) verificadas++;
  else falsas++;

  const estado = bien ? "✓ verificada" : sinConteo ? "✗ no se pudo ejecutar" : `✗ ${totalFallas} fallas`;
  console.log(`  ${String(a.id).padStart(2)}. ${a.texto.slice(0, 56).padEnd(56)} ${String(totalOk).padStart(7)}  ${estado}`);

  detalle.push({ ...a, bien, totalOk, totalFallas, resultados });
}

// ── Lo que NO se puede verificar con pruebas automáticas ─────────────────────
const NO_VERIFICABLE = [
  "Que la firma del webhook llegue de verdad desde Evolution en producción (depende del gateway)",
  "Que el modelo de visión no alucine con capturas manipuladas que nunca hemos visto",
  "Que la sesión de WhatsApp no se caiga con carga real",
  "Que el copy del funnel convierta",
];

console.log(`\n  ${verificadas}/${AFIRMACIONES.length} afirmaciones verificadas por prueba`);

if (falsas > 0) {
  console.log("\n  Afirmaciones NO sostenidas:");
  for (const d of detalle.filter((x) => !x.bien)) {
    console.log(`    ${d.id}. ${d.texto}`);
    for (const r of d.resultados) if (r.fallas !== 0) console.log(`       ${r.ruta}: ${r.fallas === -1 ? "no ejecutó" : r.fallas + " fallas"}`);
  }
}

console.log("\n  Lo que ninguna prueba automática puede afirmar:");
for (const n of NO_VERIFICABLE) console.log(`    · ${n}`);

process.exit(falsas === 0 ? 0 : 1);
