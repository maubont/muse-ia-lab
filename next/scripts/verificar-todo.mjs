// next/scripts/verificar-todo.mjs — EL ÚNICO COMANDO QUE NO MIENTE.
//
//   node --experimental-strip-types next/scripts/verificar-todo.mjs
//
// ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
// Durante buena parte del proyecto se verificó con un bucle artesanal que leía la
// línea «N ok» de cada suite… e IGNORABA «M fallas». Resultado: se reportaban 1.797
// aserciones correctas mientras nueve fallaban en silencio. Un número que sube no
// es una prueba que pasa.
//
// Esto recorre TODAS las suites y falla si alguna tiene fallas, si no imprime
// resumen, o si no se puede ejecutar. Sin excepciones silenciosas: las suites del
// sistema viejo que no tienen resumen se listan aparte, explícitamente.

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

/** Suites del sistema viejo (functions/): no siguen el formato «N ok, M fallas». */
const SIN_RESUMEN_CONOCIDAS = new Set(["test-wompi.mjs", "verificar-funnel-colombia.mjs"]);
/** Este mismo archivo y el verificador de afirmaciones no se autoinvocan. */
const EXCLUIR = new Set(["verificar-todo.mjs", "verificar-afirmaciones.mjs"]);

function suites() {
  const salida = [];
  for (const dir of ["next/scripts", "scripts"]) {
    let entradas;
    try {
      entradas = readdirSync(join(RAIZ, dir));
    } catch {
      continue;
    }
    for (const nombre of entradas) {
      if (!nombre.endsWith(".mjs")) continue;
      if (!/^(test|verificar)-/.test(nombre)) continue;
      if (EXCLUIR.has(nombre)) continue;
      salida.push({ dir, nombre, ruta: join(RAIZ, dir, nombre) });
    }
  }
  return salida.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

let ok = 0;
let fallas = 0;
const rotas = [];
const sinResumen = [];

for (const s of suites()) {
  const r = spawnSync(process.execPath, ["--experimental-strip-types", s.ruta], {
    encoding: "utf8",
    timeout: 300000,
    cwd: RAIZ,
  });
  const salida = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const m = /(\d+) ok, (\d+) fallas/.exec(salida);

  if (!m) {
    if (SIN_RESUMEN_CONOCIDAS.has(s.nombre)) {
      sinResumen.push(s.nombre);
      continue;
    }
    sinResumen.push(s.nombre);
    rotas.push({ nombre: s.nombre, motivo: `sin resumen (código ${r.status})` });
    continue;
  }

  const [o, f] = [Number(m[1]), Number(m[2])];
  ok += o;
  fallas += f;
  if (f > 0) {
    // Se muestran las líneas de falla, no un contador abstracto.
    const detalle = salida
      .split("\n")
      .filter((l) => l.startsWith("FALLA"))
      .slice(0, 3)
      .map((l) => l.replace(/\s+$/, ""));
    rotas.push({ nombre: s.nombre, motivo: `${f} fallas`, detalle });
  }
}

console.log(`\n  suites ejecutadas: ${suites().length}`);
console.log(`  aserciones correctas: ${ok}`);
console.log(`  aserciones fallidas:  ${fallas}`);

if (rotas.length > 0) {
  console.log("\n  ✗ SUITES CON PROBLEMAS:");
  for (const r of rotas) {
    console.log(`    · ${r.nombre}: ${r.motivo}`);
    for (const d of r.detalle ?? []) console.log(`        ${d}`);
  }
}

if (sinResumen.length > 0) {
  console.log(`\n  Suites sin resumen (sistema viejo o incompletas): ${sinResumen.join(", ")}`);
  console.log("    No cuentan como prueba: si deberían, hay que darles formato de salida.");
}

const limpio = rotas.length === 0 && fallas === 0 && ok > 0;
console.log(limpio ? "\n  ✓ todo verde" : "\n  ✗ hay fallas: este comando NO da por buena la verificación");
process.exit(limpio ? 0 : 1);
