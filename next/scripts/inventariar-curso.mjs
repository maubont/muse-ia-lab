// Inventario COMPLETO de las 13 carpetas del curso, con tamanos reales.
import { readFileSync, writeFileSync } from "node:fs";

const filas = JSON.parse(readFileSync("seed/musa_settings.json", "utf8")).data.tables.musa_settings.rows;
const entrega = filas.find((f) => f.key === "entrega").value;

function extraerBlob(html) {
  const i = html.indexOf("_DRIVE_ivd");
  if (i < 0) return null;
  const desde = html.indexOf("'", html.indexOf("=", i));
  const hasta = html.indexOf("';", desde);
  if (desde < 0 || hasta < 0) return null;
  const crudo = html.slice(desde + 1, hasta);
  const dec = crudo
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
  try { return JSON.parse(dec); } catch { return null; }
}

const esArchivo = (f) =>
  Array.isArray(f) && typeof f[0] === "string" && typeof f[2] === "string" &&
  f[3] !== "application/vnd.google-apps.folder";

function archivosDe(datos) {
  const salida = [];
  const vistos = new Set();
  const visitar = (n) => {
    if (!Array.isArray(n)) return;
    if (esArchivo(n)) {
      if (!vistos.has(n[0])) {
        vistos.add(n[0]);
        salida.push({ id: n[0], nombre: n[2], mime: n[3], bytes: Number(n[13]) || 0 });
      }
      return;
    }
    for (const hijo of n) visitar(hijo);
  };
  visitar(datos);
  return salida;
}

let granBytes = 0, granArchivos = 0;
const resumen = [];

for (const [i, url] of entrega.modulos.entries()) {
  const num = String(i + 1).padStart(2, "0");
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30000) });
    const datos = extraerBlob(await res.text());
    const items = datos ? archivosDe(datos) : [];
    const bytes = items.reduce((a, b) => a + b.bytes, 0);
    granBytes += bytes; granArchivos += items.length;
    resumen.push({ carpeta: num, archivos: items.length, bytes, items });
    console.log(`  ${num}. ${String(items.length).padStart(2)} archivos · ${(bytes / 1024 / 1024).toFixed(1).padStart(7)} MB`);
  } catch (e) {
    console.log(`  ${num}. error: ${e.cause?.code ?? e.name}`);
    resumen.push({ carpeta: num, archivos: 0, bytes: 0, items: [] });
  }
}

writeFileSync("tmp/curso-inventario.json", JSON.stringify(resumen, null, 1));
console.log(`\n  TOTAL: ${granArchivos} archivos · ${(granBytes / 1024 / 1024).toFixed(0)} MB · ${(granBytes / 1024 / 1024 / 1024).toFixed(2)} GB`);

const grandes = resumen.flatMap((r) => r.items.map((x) => ({ ...x, carpeta: r.carpeta })))
  .sort((a, b) => b.bytes - a.bytes).slice(0, 6);
console.log("\n  los 6 mas pesados:");
for (const g of grandes) console.log(`    ${(g.bytes / 1024 / 1024).toFixed(1).padStart(7)} MB  [${g.carpeta}] ${g.nombre}`);
