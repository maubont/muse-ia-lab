// next/scripts/generar-esquema.mjs
//
// Genera el DDL inicial del repo nuevo a partir de la REALIDAD de producción
// (seed/esquema-musa.json + seed/restricciones.json), no de la memoria de nadie.
//
//   node next/scripts/generar-esquema.mjs
//
// Salida: next/migrations/0001_esquema_inicial.sql
//
// El DDL generado NO se edita a mano: se regenera. Si el esquema cambia, cambia
// el seed y se vuelve a generar (o se añade una migración 0002 a mano).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Rutas relativas a la RAÍZ del repo, no al directorio desde donde se invoca.
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");

const SEED_ESQUEMA = join(RAIZ, "seed", "esquema-musa.json");
const SEED_RESTRICCIONES = join(RAIZ, "seed", "restricciones.json");
const SALIDA = join(RAIZ, "next", "migrations", "0001_esquema_inicial.sql");

const esquema = JSON.parse(readFileSync(SEED_ESQUEMA, "utf8")).data.tables;
const meta = JSON.parse(readFileSync(SEED_RESTRICCIONES, "utf8"));

const identidad = meta.identity ?? {};
const porTabla = new Map();
for (const c of meta.constraints) {
  if (!porTabla.has(c.tabla)) porTabla.set(c.tabla, []);
  porTabla.get(c.tabla).push(c);
}

/** Orden de creación: primero las tablas que no dependen de nadie. */
function ordenarTablas(tablas) {
  const pendientes = [...tablas];
  const hechas = [];
  while (pendientes.length) {
    const idx = pendientes.findIndex((t) =>
      (porTabla.get(t) ?? [])
        .filter((c) => c.tipo === "f")
        .every((c) => {
          const destino = c.definicion.match(/references\s+(\w+)/i)?.[1];
          return !destino || destino === t || hechas.includes(destino);
        }),
    );
    if (idx === -1) throw new Error("dependencia circular entre tablas: " + pendientes.join(", "));
    hechas.push(pendientes.splice(idx, 1)[0]);
  }
  return hechas;
}

function tipo(c) {
  const t = c.dataType;
  const len = c.characterMaximumLength;
  return len ? `${t}(${len})` : t;
}

function columna(c, tabla) {
  const esIdentidad = (identidad[tabla] ?? []).includes(c.columnName);
  const partes = [`  ${c.columnName} ${tipo(c)}`];
  if (esIdentidad) {
    partes.push("generated always as identity");
  } else {
    if (c.isNullable === "NO") partes.push("not null");
    if (c.columnDefault != null) partes.push(`default ${c.columnDefault}`);
  }
  return partes.join(" ");
}

const nombresDeRestriccion = new Set(meta.constraints.map((c) => c.nombre));

const lineas = [];
lineas.push("-- 0001_esquema_inicial.sql — GENERADO, no editar a mano.");
lineas.push("-- Fuente: seed/esquema-musa.json + seed/restricciones.json (exportados de producción).");
lineas.push("-- Regenerar con: node next/scripts/generar-esquema.mjs");
lineas.push("-- Verificar con: node next/scripts/verificar-esquema.mjs");
lineas.push("");
lineas.push("-- Extensión necesaria para pHash/dedupe (sin uso aún, disponible desde el día 1).");
lineas.push("create extension if not exists pg_trgm;");
lineas.push("");

for (const tabla of ordenarTablas(Object.keys(esquema))) {
  const t = esquema[tabla];
  const cols = t.schema.map((c) => columna(c, tabla));
  const cons = (porTabla.get(tabla) ?? [])
    .sort((a, b) => "pucf".indexOf(a.tipo) - "pucf".indexOf(b.tipo))
    .map((c) => `  constraint ${c.nombre} ${c.definicion}`);

  lineas.push(`create table public.${tabla} (`);
  lineas.push(cols.concat(cons).join(",\n"));
  lineas.push(");");
  lineas.push("");

  // Índices que NO son el reflejo de una restricción (los demás ya existen por constraint).
  for (const ix of t.indexes ?? []) {
    if (ix.isPrimary) continue;
    if (nombresDeRestriccion.has(ix.indexname)) continue;
    lineas.push(`${ix.indexdef};`);
  }
  if ((t.indexes ?? []).some((ix) => !ix.isPrimary && !nombresDeRestriccion.has(ix.indexname))) lineas.push("");

  if (t.rlsEnabled) {
    lineas.push(`alter table public.${tabla} enable row level security;`);
  }
  for (const p of t.policies ?? []) {
    const roles = Array.isArray(p.roles) ? p.roles.join(", ") : (p.roles ?? "public");
    lineas.push(
      `create policy ${p.policyname ?? p.name ?? "sin_nombre"} on public.${tabla} for ${(p.cmd ?? "all").toLowerCase()} to ${roles}` +
        (p.qual ? ` using (${p.qual})` : "") +
        (p.with_check ? ` with check (${p.with_check})` : "") +
        ";",
    );
  }
  lineas.push("");
}

lineas.push("-- Fin del esquema. Las reglas de negocio (funnel, copy, precios) viven en seed/musa_settings.json.");

mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, lineas.join("\n") + "\n", "utf8");

const totalColumnas = Object.values(esquema).reduce((n, t) => n + t.schema.length, 0);
console.log(`generado ${SALIDA}`);
console.log(`  tablas: ${Object.keys(esquema).length} · columnas: ${totalColumnas} · restricciones: ${meta.constraints.length}`);
