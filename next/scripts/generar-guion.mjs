// next/scripts/generar-guion.mjs — genera el GUION real que Musa le dice a un
// lead colombiano, a partir del copy que HOY está en producción.
//
//   node next/scripts/generar-guion.mjs
//   Salida: GUION-COLOMBIA.md
//
// Para qué sirve:
//   · que el dueño lea de corrido lo que su bot dice, sin abrir código
//   · detectar copy repetido, huérfano o que promete algo que no está
//   · que quien porte el motor tenga la especificación exacta de qué decir
//
// No inventa nada: renderiza el copy de `seed/musa_settings.json` con el MISMO
// renderizador que usa el bot (`functions/motor/copy.ts`).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  sinPrefijo,
  filtrarLineasPais,
  resolverPlaceholders,
  limpiarTokens,
} from "../../functions/motor/copy.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SALIDA = join(RAIZ, "GUION-COLOMBIA.md");

const filas = JSON.parse(readFileSync(join(RAIZ, "seed", "musa_settings.json"), "utf8"))
  .data.tables.musa_settings.rows;
const crudo = Object.fromEntries(filas.map((f) => [f.key, f.value]));

const cfg = {
  funnelCopy: crudo.funnel_copy,
  precio: crudo.precio ?? { usd: 9, cop: 33000 },
  precioBsHoy: crudo.precio_bs_hoy ?? { bs: 7400 },
  cuentasVe: crudo.cuentas_ve ?? {},
  cuentasCo: crudo.cuentas_co ?? {},
  entrega: crudo.entrega ?? {},
};

const LEAD = { nombre: "María", profile_name: "María" };
const LEAD_SIN = { nombre: null, profile_name: "💜" };
const PAIS = "CO";

const TOKEN = /\[[A-Z0-9_]{3,}(?::[^\]]*)?\]/;

const lineas = [];
const tokens = new Set();
let totalMensajes = 0;
let descartadosPorPais = 0;

lineas.push("# Guion de Musa — Colombia");
lineas.push("");
lineas.push("> **GENERADO, no editar a mano.** `node next/scripts/generar-guion.mjs`");
lineas.push(">");
lineas.push("> Es el copy que hoy está en producción, renderizado con el mismo código");
lineas.push("> que usa el bot para un lead de Colombia llamado «María». Sirve para revisar");
lineas.push("> el guion de corrido y para portar el motor sin adivinar qué dice cada etapa.");
lineas.push("");
lineas.push(`**Fecha:** ${new Date().toISOString().slice(0, 10)} · ` +
  `**Precio:** ${(cfg.precio?.cop ?? 0).toLocaleString("es-CO")} COP · ` +
  `**Etapas:** ${(cfg.funnelCopy?.etapas ?? []).length}`);
lineas.push("");
lineas.push("---");
lineas.push("");

for (const e of cfg.funnelCopy?.etapas ?? []) {
  lineas.push(`## ${e.id}`);
  if (e.notas) lineas.push("");
  if (e.notas) lineas.push(`*${e.notas.split("\n")[0]}*`);
  lineas.push("");

  const bloques = [];
  for (const crudoMsg of e.mensajes ?? []) {
    if (typeof crudoMsg !== "string" || !crudoMsg.trim()) continue;
    const filtrado = filtrarLineasPais(sinPrefijo(crudoMsg), PAIS);
    if (!filtrado.trim()) { descartadosPorPais++; continue; }
    const render = resolverPlaceholders(filtrado, LEAD, cfg);
    for (const m of render.matchAll(new RegExp(TOKEN, "g"))) tokens.add(m[0]);
    if (!render.trim()) { descartadosPorPais++; continue; }
    bloques.push(render);
    totalMensajes++;
  }

  // Las ramas son ALTERNATIVAS entre sí, no mensajes consecutivos: mezclarlas en
  // la numeración haría creer que el lead recibe todas.
  const ramas = [];
  for (const [rama, def] of Object.entries(e.ramas ?? {})) {
    const textos = [...(def?.mensajes ?? [])];
    if (def?.sin_video) textos.push(def.sin_video);
    const renderizados = [];
    for (const crudoMsg of textos) {
      if (typeof crudoMsg !== "string" || !crudoMsg.trim()) continue;
      const filtrado = filtrarLineasPais(sinPrefijo(crudoMsg), PAIS);
      if (!filtrado.trim()) { descartadosPorPais++; continue; }
      const render = resolverPlaceholders(filtrado, LEAD, cfg);
      if (!render.trim()) { descartadosPorPais++; continue; }
      renderizados.push(render);
      totalMensajes++;
    }
    if (renderizados.length) ramas.push({ rama, mensajes: renderizados });
  }

  if (bloques.length === 0 && ramas.length === 0) {
    lineas.push("_(etapa sin mensajes propios)_");
  } else {
    bloques.forEach((b, i) => {
      lineas.push(`**Mensaje ${i + 1}**`);
      lineas.push("");
      lineas.push("```text");
      lineas.push(b);
      lineas.push("```");
      lineas.push("");
    });
    if (ramas.length) {
      lineas.push(`> El lead recibe **una** de estas ${ramas.length} ramas, no todas.`);
      lineas.push(">");
      lineas.push("> Están renderizadas con nombre «María». Cuál se usa depende de si el");
      lineas.push("> perfil de WhatsApp da un nombre de pila usable (ver las notas de la etapa).");
      lineas.push("");
      for (const r of ramas) {
        lineas.push(`**Rama «${r.rama}»**`);
        lineas.push("");
        for (const m of r.mensajes) {
          lineas.push("```text");
          lineas.push(m);
          lineas.push("```");
          lineas.push("");
        }
      }
    }
  }
  lineas.push("");
}

// --- variante sin nombre, solo si difiere en algo más que el nombre ---
lineas.push("---");
lineas.push("");
lineas.push("## Variante sin nombre usable");
lineas.push("");
lineas.push("Cuando el perfil de WhatsApp no da un nombre de pila (apodos, emojis,");
lineas.push("negocios), el bot no puede saludar por nombre. Estas son las frases cuyo");
lineas.push("texto cambia, para revisar que no queden comas huérfanas:");
lineas.push("");

let cambiosSinNombre = 0;
for (const e of cfg.funnelCopy?.etapas ?? []) {
  for (const crudoMsg of e.mensajes ?? []) {
    if (typeof crudoMsg !== "string" || !crudoMsg.includes("{{nombre}}")) continue;
    const con = resolverPlaceholders(filtrarLineasPais(sinPrefijo(crudoMsg), PAIS), LEAD, cfg);
    const sin = resolverPlaceholders(filtrarLineasPais(sinPrefijo(crudoMsg), PAIS), LEAD_SIN, cfg);
    if (con === sin) continue;
    cambiosSinNombre++;
    lineas.push(`- **${e.id}**`);
    lineas.push(`  - con nombre: \`${con.split("\n")[0].slice(0, 140)}\``);
    lineas.push(`  - sin nombre: \`${sin.split("\n")[0].slice(0, 140)}\``);
  }
}

if (cambiosSinNombre === 0) lineas.push("_(ninguna)_");
lineas.push("");
lineas.push("---");
lineas.push("");
lineas.push("## Cifras");
lineas.push("");
lineas.push(`- Mensajes que recibe un lead colombiano: **${totalMensajes}**`);
lineas.push(`- Mensajes descartados por filtro de país: ${descartadosPorPais}`);
lineas.push(`- Frases con nombre: ${cambiosSinNombre}`);
lineas.push(`- Tokens internos encontrados: ${[...tokens].sort().map((t) => "`" + t + "`").join(" ") || "ninguno"}`);
lineas.push("");
lineas.push("Los tokens internos los elimina `limpiarTokens` antes de enviar: nunca salen al cliente.");

writeFileSync(SALIDA, lineas.join("\n") + "\n", "utf8");

const texto = lineas.join("\n");
const fugados = [...texto.matchAll(new RegExp(TOKEN, "g"))].map((m) => m[0]);
console.log(`generado ${SALIDA}`);
console.log(`  etapas: ${(cfg.funnelCopy?.etapas ?? []).length} · mensajes: ${totalMensajes} · descartados por país: ${descartadosPorPais}`);
console.log(`  tokens internos vistos: ${[...tokens].join(" ") || "ninguno"}`);
if (fugados.length) {
  console.error(`  ⚠ ${fugados.length} token(s) aparecen en el guion generado`);
  process.exit(1);
}
