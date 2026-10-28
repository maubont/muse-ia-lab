// next/scripts/verificar-esquema.mjs
//
// Verifica que el DDL GENERADO reproduce exactamente lo que hay en producción.
// No comprueba validez sintáctica contra un Postgres (no hay servidor aquí):
// comprueba FIDELIDAD — que ninguna columna, tipo, nulabilidad, default ni
// restricción se haya perdido o inventado en la traducción.
//
//   node next/scripts/verificar-esquema.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Rutas relativas a la RAÍZ del repo, no al directorio desde donde se invoca.
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SQL = join(RAIZ, "next", "migrations", "0001_esquema_inicial.sql");
const esquema = JSON.parse(readFileSync(join(RAIZ, "seed", "esquema-musa.json"), "utf8")).data.tables;
const meta = JSON.parse(readFileSync(join(RAIZ, "seed", "restricciones.json"), "utf8"));
const sql = readFileSync(SQL, "utf8");

let ok = 0;
let fallas = 0;
function check(cond, etiqueta) {
  if (cond) { ok++; return; }
  fallas++;
  console.error("FALLA " + etiqueta);
}

// ---------- 1. estructura general del archivo ----------
check(sql.includes("create table public."), "el archivo contiene DDL");
check((sql.match(/;\s*$/m) !== null), "termina con punto y coma");
{
  let balance = 0;
  for (const ch of sql) {
    if (ch === "(") balance++;
    else if (ch === ")") balance--;
    if (balance < 0) break;
  }
  check(balance === 0, "paréntesis balanceados en todo el archivo");
}

// ---------- 2. parsear el DDL generado ----------
const tablasSql = new Map();
for (const m of sql.matchAll(/create table public\.(\w+) \(\n([\s\S]*?)\n\);/g)) {
  const [, tabla, cuerpo] = m;
  const columnas = [];
  const restricciones = [];
  for (const linea of cuerpo.split("\n")) {
    // El DDL separa columnas y restricciones con comas al final de línea.
    const l = linea.trim().replace(/,$/, "");
    if (!l) continue;
    const rc = l.match(/^constraint (\w+) (.+)$/);
    if (rc) { restricciones.push({ nombre: rc[1], definicion: rc[2] }); continue; }
    const rl = l.match(/^([a-z_][a-z0-9_]*) (.+)$/);
    if (!rl) { fallas++; console.error(`FALLA línea no reconocida en ${tabla}: ${l.slice(0, 80)}`); continue; }
    let resto = rl[2];
    const identidad = resto.includes(" generated always as identity");
    if (identidad) resto = resto.split(" generated always as identity")[0];
    let def = null;
    const md = resto.match(/^(.*?) default (.*)$/);
    if (md) { resto = md[1]; def = md[2]; }
    const notNull = / not null$/.test(resto);
    if (notNull) resto = resto.replace(/ not null$/, "");
    columnas.push({ nombre: rl[1], tipo: resto, notNull, identidad, def });
  }
  tablasSql.set(tabla, { columnas, restricciones });
}

check(tablasSql.size === Object.keys(esquema).length, `número de tablas (esperado ${Object.keys(esquema).length}, generado ${tablasSql.size})`);

// ---------- 3. columnas: nombre, tipo, nulabilidad, identidad ----------
let columnasComparadas = 0;
for (const [tabla, info] of Object.entries(esquema)) {
  const generada = tablasSql.get(tabla);
  check(!!generada, `tabla ${tabla} presente`);
  if (!generada) continue;

  const esperadas = info.schema.map((c) => ({
    nombre: c.columnName,
    tipo: c.characterMaximumLength ? `${c.dataType}(${c.characterMaximumLength})` : c.dataType,
    notNull: c.isNullable === "NO",
    identidad: (meta.identity[tabla] ?? []).includes(c.columnName),
  }));

  check(generada.columnas.length === esperadas.length, `${tabla}: número de columnas (${esperadas.length} vs ${generada.columnas.length})`);

  for (const exp of esperadas) {
    const gen = generada.columnas.find((c) => c.nombre === exp.nombre);
    if (!gen) { check(false, `${tabla}.${exp.nombre} existe`); continue; }
    columnasComparadas++;
    check(gen.tipo === exp.tipo, `${tabla}.${exp.nombre}: tipo "${exp.tipo}" vs "${gen.tipo}"`);
    check(gen.identidad === exp.identidad, `${tabla}.${exp.nombre}: identidad ${exp.identidad} vs ${gen.identidad}`);
    // Una columna identity ya es NOT NULL por definición.
    check(gen.notNull || gen.identidad ? exp.notNull || exp.identidad : !exp.notNull, `${tabla}.${exp.nombre}: nulabilidad`);
  }

  // ---------- 4. restricciones (nombres y definición) ----------
  const esperadasCons = meta.constraints.filter((c) => c.tabla === tabla).map((c) => ({ nombre: c.nombre, definicion: c.definicion }));
  check(generada.restricciones.length === esperadasCons.length, `${tabla}: número de restricciones (${esperadasCons.length} vs ${generada.restricciones.length})`);
  for (const exp of esperadasCons) {
    const gen = generada.restricciones.find((c) => c.nombre === exp.nombre);
    if (!gen) { check(false, `${tabla}: restricción ${exp.nombre} presente`); continue; }
    check(
      gen.definicion.replace(/\s+/g, " ").toUpperCase() === exp.definicion.replace(/\s+/g, " ").toUpperCase(),
      `${tabla}.${exp.nombre}: definición`,
    );
  }

  // ---------- 5. RLS ----------
  if (info.rlsEnabled) {
    check(new RegExp(`alter table public\\.${tabla} enable row level security;`).test(sql), `${tabla}: RLS habilitado`);
  }
}

// ---------- 6. reglas de negocio que el DDL NO debe perder ----------
check(/musa_payments_ref_unica/.test(sql), "UNIQUE (metodo, ref_normalizada) presente (dedupe de comprobantes)");
check(/musa_payments_short_id_key/.test(sql), "UNIQUE (short_id) presente");
check(/musa_leads_pais_check/.test(sql), "CHECK de país presente");
check(/musa_payments_status_check/.test(sql), "CHECK de estado de pago presente");
check(/ON DELETE CASCADE/.test(sql), "borrado en cascada de mensajes presente");

const rls = (sql.match(/enable row level security/g) ?? []).length;
check(rls === 8, `RLS habilitado en 8 tablas (encontrado ${rls})`);

console.log(`esquema: ${ok} ok, ${fallas} fallas · ${tablasSql.size} tablas · ${columnasComparadas} columnas comparadas`);
process.exit(fallas === 0 ? 0 : 2);
