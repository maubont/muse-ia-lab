// next/scripts/generar-seed.mjs
//
// Convierte seed/musa_settings.json en SQL reproducible.
//
//   node next/scripts/generar-seed.mjs
//   Salida: next/migrations/0002_seed_configuracion.sql
//
// Por qué importa: estas 13 filas son el negocio. `funnel_copy` (21 KB) y
// `gpt_system` (6 KB) son copy escrito y corregido conversación a conversación;
// perderlos no se arregla escribiendo código.
//
// Los valores JSON se envuelven en dollar-quoting ($musa_json$ … $musa_json$)
// para que ni las comillas simples ni los backslashes del copy puedan romper el
// SQL. Si el texto llegara a contener la etiqueta, el script falla en vez de
// generar algo ambiguo.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENTRADA = join(RAIZ, "seed", "musa_settings.json");
const SALIDA = join(RAIZ, "next", "migrations", "0002_seed_configuracion.sql");

const ETIQUETA = "$musa_json$";

const filas = JSON.parse(readFileSync(ENTRADA, "utf8")).data.tables.musa_settings.rows;

for (const f of filas) {
  if (!f.key) throw new Error("fila sin key: " + JSON.stringify(f).slice(0, 120));
  if (f.key.includes("'")) throw new Error(`key con comilla simple: ${f.key}`);
  const json = JSON.stringify(f.value);
  if (json.includes(ETIQUETA)) throw new Error(`el valor de '${f.key}' contiene la etiqueta ${ETIQUETA}`);
}

const lineas = [];
lineas.push("-- 0002_seed_configuracion.sql — GENERADO, no editar a mano.");
lineas.push("-- Fuente: seed/musa_settings.json (exportado de producción el 27-oct-2026).");
lineas.push("-- Regenerar con: node next/scripts/generar-seed.mjs");
lineas.push("-- Verificar con: node next/scripts/verificar-seed.mjs");
lineas.push("--");
lineas.push("-- Idempotente: se puede reejecutar sin duplicar ni perder cambios manuales");
lineas.push("-- posteriores (hace upsert por key).");
lineas.push("");

for (const f of [...filas].sort((a, b) => a.key.localeCompare(b.key))) {
  const json = JSON.stringify(f.value);
  const cuando = f.updated_at ?? new Date().toISOString();
  lineas.push(`-- ${f.key} (${json.length} caracteres de JSON)`);
  lineas.push("insert into public.musa_settings (key, value, updated_at) values (");
  lineas.push(`  '${f.key}',`);
  lineas.push(`  ${ETIQUETA}${json}${ETIQUETA}::jsonb,`);
  lineas.push(`  '${cuando}'::timestamptz`);
  lineas.push(")");
  lineas.push("on conflict (key) do update set");
  lineas.push("  value = excluded.value,");
  lineas.push("  updated_at = excluded.updated_at;");
  lineas.push("");
}

lineas.push("-- Fin. Las 13 claves: " + [...filas].map((f) => f.key).sort().join(", "));

writeFileSync(SALIDA, lineas.join("\n") + "\n", "utf8");

const total = filas.reduce((n, f) => n + JSON.stringify(f.value).length, 0);
console.log(`generado ${SALIDA}`);
console.log(`  filas: ${filas.length} · JSON total: ${total} caracteres`);
