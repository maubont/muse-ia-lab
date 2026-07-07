// Muestra el avance porcentual del plan de lanzamiento (LANZAMIENTO.md).
// Lee las casillas `- [x]` / `- [ ]` con su `(peso N)` y suma por fase y total.
// Uso: node scripts/progreso-lanzamiento.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(join(__dirname, "..", "LANZAMIENTO.md"), "utf8");

const fases = [];
let faseActual = null;

for (const linea of md.split("\n")) {
  const h = linea.match(/^## (FASE [A-Z].*)$/);
  if (h) {
    faseActual = { nombre: h[1].replace(/\s*\(.*$/, ""), hecho: 0, total: 0, tareas: [] };
    fases.push(faseActual);
    continue;
  }
  if (/^## /.test(linea)) { faseActual = null; continue; } // POST-LANZAMIENTO u otras secciones
  const t = linea.match(/^- \[( |x|X)\] \*\*([A-Z]\d+)\.\*\*.*\(peso (\d+)\)/);
  if (t && faseActual) {
    const hecho = t[1].toLowerCase() === "x";
    const peso = Number(t[3]);
    faseActual.total += peso;
    if (hecho) faseActual.hecho += peso;
    faseActual.tareas.push({ id: t[2], hecho, peso });
  }
}

function barra(pct, ancho = 24) {
  const llenos = Math.round((pct / 100) * ancho);
  return "█".repeat(llenos) + "░".repeat(ancho - llenos);
}

const totalPeso = fases.reduce((s, f) => s + f.total, 0);
const totalHecho = fases.reduce((s, f) => s + f.hecho, 0);
const pctTotal = totalPeso ? Math.round((totalHecho / totalPeso) * 100) : 0;

console.log("");
console.log("🚀 PROGRESO DEL LANZAMIENTO — Modelos IA (solo Colombia, sin Wompi)");
console.log("═".repeat(66));
for (const f of fases) {
  const pct = f.total ? Math.round((f.hecho / f.total) * 100) : 0;
  const pendientes = f.tareas.filter((t) => !t.hecho).map((t) => t.id).join(", ");
  console.log(`${f.nombre.padEnd(28)} ${barra(pct)} ${String(pct).padStart(3)}%  (${f.hecho}/${f.total} pts)`);
  if (pendientes) console.log(`${" ".repeat(28)} pendiente: ${pendientes}`);
}
console.log("─".repeat(66));
console.log(`${"TOTAL".padEnd(28)} ${barra(pctTotal)} ${String(pctTotal).padStart(3)}%  (${totalHecho}/${totalPeso} pts)`);
console.log("");
const siguiente = fases.flatMap((f) => f.tareas).find((t) => !t.hecho);
if (siguiente) console.log(`👉 Siguiente tarea: ${siguiente.id} (ver LANZAMIENTO.md)`);
else console.log("🎉 ¡100%! Anuncios activos. A vender.");
console.log("");
