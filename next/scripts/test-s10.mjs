// next/scripts/test-s10.mjs — pruebas de la entrega.
//
//   node --experimental-strip-types next/scripts/test-s10.mjs
//
// Contra los datos REALES de entrega (13 módulos, 4 bonos, plan de acción).
// La promesa comercial es concreta: «17 enlaces». Aquí se comprueba que están
// los 17, que van en 3 mensajes y que la barrera anti-doble-entrega va primero.

import { readFileSync } from "node:fs";
import { efectosEntrega, componerEntrega, ETIQUETAS_BONOS } from "../src/motor/s10.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

const filas = JSON.parse(readFileSync(new URL("../../seed/musa_settings.json", import.meta.url), "utf8"))
  .data.tables.musa_settings.rows;
const crudo = Object.fromEntries(filas.map((f) => [f.key, f.value]));
const CFG = { entrega: crudo.entrega ?? {}, precio: crudo.precio ?? {} };

const LEAD = { phone: "+573001112233", nombre: "Carlos", profile_name: "Carlos", estado_funnel: "S09_VERIFICACION" };

const tipos = (e) => e.map((x) => x.tipo);
const de = (e, tipo) => e.filter((x) => x.tipo === tipo);
const urls = (texto) => texto.match(/https?:\/\/[^\s]+/g) ?? [];
// El curso ya no se entrega como 17 URLs sueltas: cada módulo tiene varios
// archivos servidos con enlace firmado. Se comprueba la forma NUEVA.
const archivosDeclarados = (texto) => [...texto.matchAll(/\((\d+) archivos?\)/g)].reduce((a, m) => a + Number(m[1]), 0);

// ============================== datos reales ==============================

t("hay 13 módulos configurados", (CFG.entrega.modulos ?? []).length, 13);
t("hay 4 bonos configurados", Object.keys(CFG.entrega.bonos ?? {}).length, 4);
t("hay plan de acción 7 días", Boolean(CFG.entrega.plan_accion_7dias), true);

// ============================== composición ==============================

const e = componerEntrega(LEAD, CFG);

// OJO: el regalo «Plan de Acción 7 Días» TAMBIÉN es un enlace. La promesa
// comercial son 17 (13 módulos + 4 bonos); el plan es el 18.º, extra.
const linkPlan = CFG.entrega.plan_accion_7dias;
const linksModulos = urls(e.bloqueModulos);
const linksBonos = urls(e.bloqueBonos);
const linksBonosSinPlan = linksBonos.filter((u) => u !== linkPlan);

t("bloque de módulos: 13 líneas de módulo", (e.bloqueModulos.match(/^\d+\. /gm) ?? []).length, 13);
t("bloque de bonos: 4 bonos + el regalo", (e.bloqueBonos.match(/^\d+\. /gm) ?? []).length + (e.bloqueBonos.includes("Regalo") ? 1 : 0), 5);
t("los 13 módulos están numerados con su título", e.bloqueModulos.includes("1. Bienvenida"), true);
t("los bonos se numeran aparte", (e.bloqueBonos.match(/^\d+\. /gm) ?? []).length, 4);
t("bloque de módulos: empieza en 1", /^1\. /.test(e.bloqueModulos.split("\n")[1]), true);
t("bloque de módulos: termina en 13", /^13\. /.test(e.bloqueModulos.trim().split("\n").at(-1)), true);
t("bloque de bonos: etiquetas legibles", e.bloqueBonos.includes("Colección de Modelos"), true);
t("bloque de bonos: incluye la guía rápida", e.bloqueBonos.includes("Guía Rápida de Implementación"), true);
t("bienvenida: usa el nombre", e.bienvenida.includes("Carlos"), true);
t("bienvenida: sin placeholders", e.bienvenida.includes("{{"), false);
t("sin tokens internos", /\[[A-Z0-9_]{3,}/.test(e.bloqueModulos + e.bloqueBonos + e.bienvenida), false);
t("conteos declarados", { modulos: e.modulos, bonos: e.bonos, tienePlan: e.tienePlan }, { modulos: 13, bonos: 4, tienePlan: true });

// El total de archivos de los 13 módulos debe ser el real del curso.
t("los módulos declaran sus archivos", archivosDeclarados(e.bloqueModulos), 29);
t("ningún módulo aparece vacío", e.bloqueModulos.includes("(0 archivos)"), false);

// ============================== efectos ==============================

{
  const ef = efectosEntrega(LEAD, CFG);
  t("la barrera va PRIMERO", tipos(ef)[0], "reclamar_entrega");
  t("orden completo", tipos(ef), ["reclamar_entrega", "estado", "entregar_curso", "evento"]);
  t("estado final", de(ef, "estado")[0].nuevo, "S10_ENTREGA");
  t("la entrega lleva la bienvenida", de(ef, "entregar_curso")[0].bienvenida.includes("Bienvenida"), true);
  // El respaldo son 2 bloques (módulos y bonos), nunca 17 mensajes sueltos.
  t("respaldo de dos bloques, no diecisiete", de(ef, "entregar_curso")[0].respaldo.length, 2);
  t("evento con cifras", de(ef, "evento")[0].detalle, { modulos: 13, bonos: 4, tiene_plan: true });
  t("evento correcto", de(ef, "evento")[0].nombre, "entrega_realizada");
}

// ============================== casos incompletos ==============================

{
  // Sin plan de acción: no debe quedar la línea del regalo vacía.
  const cfg = { entrega: { ...CFG.entrega, plan_accion_7dias: "" } };
  const r = componerEntrega(LEAD, cfg);
  t("sin plan: no aparece el regalo", r.bloqueBonos.includes("Plan de Acción"), false);
  t("sin plan: no aparece «Plan de Acción»", r.bloqueBonos.includes("Plan de Acción"), false);
  t("sin plan: siguen los 4 bonos", (r.bloqueBonos.match(/^\d+\. /gm) ?? []).length, 4);
  t("sin plan: tienePlan=false", r.tienePlan, false);
}

{
  // Un bono con url vacía se omite en vez de imprimir «undefined».
  const bonos = { ...CFG.entrega.bonos, audios_fempro: "" };
  const cfg = { entrega: { ...CFG.entrega, bonos } };
  const r = componerEntrega(LEAD, cfg);
  t("bono vacío: se omite", r.bloqueBonos.includes("undefined"), false);
  t("bono vacío: quedan 3 bonos (más el regalo)", (r.bloqueBonos.match(/^\d+\. /gm) ?? []).length, 3);
  t("bono vacío: el conteo lo refleja", r.bonos, 3);
}

{
  // El orden de las etiquetas del mapa no debe romper si llega una clave nueva.
  const bonos = { ...CFG.entrega.bonos, bono_sorpresa: "https://drive.google.com/x" };
  const r = componerEntrega(LEAD, { entrega: { ...CFG.entrega, bonos } });
  t("bono desconocido: usa la clave como etiqueta", r.bloqueBonos.includes("bono_sorpresa"), true);
  t("ETIQUETAS_BONOS conserva las 4 conocidas", Object.keys(ETIQUETAS_BONOS).length, 4);
}

{
  // Lead sin nombre usable: la bienvenida no debe quedar coja.
  const r = componerEntrega({ nombre: null, profile_name: "💜" }, CFG);
  t("sin nombre: bienvenida sin placeholders", r.bienvenida.includes("{{"), false);
  t("sin nombre: sin doble espacio", /[ \t]{2,}/.test(r.bienvenida), false);
}

console.log(`s10 entrega: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
