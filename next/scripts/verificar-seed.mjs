// next/scripts/verificar-seed.mjs
//
// Comprueba que el SQL de configuración generado reproduce EXACTAMENTE las 13
// filas de seed/musa_settings.json: misma clave, mismo JSON (comparación
// semántica, no textual) y mismo updated_at.
//
//   node next/scripts/verificar-seed.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SQL = join(RAIZ, "next", "migrations", "0002_seed_configuracion.sql");
const FUENTE = join(RAIZ, "seed", "musa_settings.json");

const fuente = JSON.parse(readFileSync(FUENTE, "utf8")).data.tables.musa_settings.rows;
const sql = readFileSync(SQL, "utf8");

let ok = 0;
let fallas = 0;
function check(cond, etiqueta) {
  if (cond) { ok++; return; }
  fallas++;
  console.error("FALLA " + etiqueta);
}

/** JSON con claves ordenadas: compara significado, no orden de escritura. */
function canonico(v) {
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = canonico(v[k]);
    return o;
  }
  return v;
}
const igual = (a, b) => JSON.stringify(canonico(a)) === JSON.stringify(canonico(b));

// ---------- parsear el SQL generado ----------
const ETIQUETA = "$musa_json$";
const bloque = /insert into public\.musa_settings \(key, value, updated_at\) values \(\s*'([^']+)',\s*\$(musa_json)\$([\s\S]*?)\$musa_json\$::jsonb,\s*'([^']*)'::timestamptz\s*\)/g;

const enSql = new Map();
for (const m of sql.matchAll(bloque)) {
  const [, key, , json, cuando] = m;
  try {
    enSql.set(key, { valor: JSON.parse(json), cuando });
  } catch (e) {
    fallas++;
    console.error(`FALLA ${key}: el JSON del SQL no parsea (${String(e).slice(0, 80)})`);
  }
}

// ---------- comparaciones ----------
check(enSql.size === fuente.length, `número de filas (JSON ${fuente.length} vs SQL ${enSql.size})`);
check(/on conflict \(key\) do update/.test(sql), "el seed es idempotente (upsert por key)");
check(sql.includes(ETIQUETA), "usa dollar-quoting para el JSON");

let caracteresComparados = 0;
for (const fila of fuente) {
  const gen = enSql.get(fila.key);
  if (!gen) { check(false, `fila '${fila.key}' presente en el SQL`); continue; }

  caracteresComparados += JSON.stringify(fila.value).length;
  check(igual(gen.valor, fila.value), `'${fila.key}': contenido idéntico`);

  // updated_at se conserva (procedencia auditable), comparando la marca de tiempo.
  if (fila.updated_at) {
    check(
      new Date(gen.cuando).getTime() === new Date(fila.updated_at).getTime(),
      `'${fila.key}': updated_at preservado`,
    );
  }
}

// ---------- reglas de negocio que no deben perderse ----------
const porClave = (k) => fuente.find((f) => f.key === k)?.value;
check(typeof porClave("funnel_copy")?.etapas?.length === "number", "funnel_copy conserva sus etapas");
check(Array.isArray(porClave("entrega")?.modulos) && porClave("entrega").modulos.length === 13, "entrega conserva los 13 módulos");
check(Object.keys(porClave("entrega")?.bonos ?? {}).length === 4, "entrega conserva los 4 bonos");
check(porClave("gpt_system")?.prompt?.length > 1000, "gpt_system conserva el prompt completo");
check(porClave("precio")?.cop === 33000, "precio COP = 33.000");
check(porClave("pago")?.proveedor === "manual", "proveedor de pago = manual (línea de lanzamiento)");

// ---------- el SQL no debe contener la etiqueta dentro de un valor ----------
{
  let dentro = 0;
  for (const m of sql.matchAll(/\$musa_json\$([\s\S]*?)\$musa_json\$/g)) {
    if (m[1].includes(ETIQUETA)) dentro++;
  }
  check(dentro === 0, "ningún valor contiene la etiqueta de dollar-quoting");
}

// ---------- deuda de cutover: URLs atadas a la plataforma actual ----------
// No es un fallo: es una tarea. Al mudar de InsForge a R2, estas URLs mueren.
const atadas = [];
for (const f of fuente) {
  const n = (JSON.stringify(f.value).match(/m2gnzrj8|insforge/gi) ?? []).length;
  if (n) atadas.push(`${f.key} (${n})`);
}

console.log(
  `seed: ${ok} ok, ${fallas} fallas · ${enSql.size} filas · ${caracteresComparados} caracteres de JSON comparados`,
);
if (atadas.length) {
  console.log(`⚠ PENDIENTE DE CUTOVER: URLs de la plataforma actual dentro de la config -> ${atadas.join(", ")}`);
  console.log("  Al mudar a R2 hay que reescribirlas; si no, el avatar y los enlaces de entrega quedan rotos.");
}
process.exit(fallas === 0 ? 0 : 2);
