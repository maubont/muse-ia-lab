// next/scripts/test-ritmo.mjs — el ritmo: tres puntitos, mensajes partidos, sin testamentos.
//
//   node --experimental-strip-types next/scripts/test-ritmo.mjs

import {
  retardoMs,
  retardoDeTurno,
  RETARDO_PRIMERO_MS,
  partirMensaje,
  limitarTurno,
  RETARDO_MAX_MS,
  RETARDO_MIN_MS,
  MAX_CARACTERES_POR_MENSAJE,
  MAX_MENSAJES_POR_TURNO,
} from "../src/motor/ritmo.ts";

let ok = 0;
let fallas = 0;
function t(etiqueta, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
  fallas++;
  console.error(`FALLA ${etiqueta}\n  esperado: ${JSON.stringify(esperado)}\n  real:     ${JSON.stringify(real)}`);
}

// ============================== retardo ==============================
{
  t("texto corto: retardo mínimo respetado", retardoMs("hola") >= RETARDO_MIN_MS, true);
  t("texto corto: no es instantáneo", retardoMs("hola") > 0, true);
  t("texto enorme: techo respetado", retardoMs("x".repeat(5000)), RETARDO_MAX_MS);
  t("más texto, más retardo", retardoMs("x".repeat(200)) > retardoMs("hola"), true);
  t("nunca supera el techo", retardoMs("x".repeat(50000)) <= RETARDO_MAX_MS, true);
  t("respuesta rápida: un mensaje normal espera menos de 2 s", retardoMs("x".repeat(60)) < 2000, true);
}

// ============================== el primero sale casi ya ==============================
{
  // La velocidad de la PRIMERA respuesta es la que más pesa en la conversión.
  t("primer mensaje del turno: casi inmediato", retardoDeTurno(0, "x".repeat(400)), RETARDO_PRIMERO_MS);
  t("primer mensaje: menos de un cuarto de segundo", RETARDO_PRIMERO_MS < 250, true);
  t("segundo mensaje: ritmo humano", retardoDeTurno(1, "hola") >= RETARDO_MIN_MS, true);
  t("el primero es siempre más rápido que el resto", retardoDeTurno(0, "x".repeat(400)) < retardoDeTurno(1, "x".repeat(400)), true);
}

// ============================== partir ==============================
{
  t("texto corto: un solo bloque", partirMensaje("Hola, ¿cómo estás?"), ["Hola, ¿cómo estás?"]);
  t("vacío: sin bloques", partirMensaje("   "), []);
  t("nulo: sin bloques", partirMensaje(null), []);
}

{
  const dosParrafos = "Primera idea explicada con algo de detalle, para que el texto pase del umbral de sección.\n\nSegunda idea también con su detalle suficiente para que se entienda que es un bloque aparte.";
  t("dos párrafos con contenido: dos bloques", partirMensaje(dosParrafos).length, 2);
  t("conserva el contenido", partirMensaje(dosParrafos).join(" ").includes("Segunda idea"), true);
}

{
  // Corto con dos párrafos: NO se parte. Dos burbujas para un saludo es ruido.
  t("corto en dos párrafos: se manda entero", partirMensaje("Hola.\n\n¿Cómo estás?").length, 1);
}

{
  const largo = "Esta es una frase de prueba que se repite. ".repeat(40); // ~1.760 chars
  const partes = partirMensaje(largo);
  t("texto largo: se parte", partes.length > 1, true);
  t("ninguna parte excede el máximo", partes.every((p) => p.length <= MAX_CARACTERES_POR_MENSAJE), true);
  t("no se pierde texto", partes.join(" ").replace(/\s+/g, " ").trim(), largo.replace(/\s+/g, " ").trim());
}

{
  // Una sola palabra gigante no puede romper el corte.
  const palabra = "x".repeat(1000);
  const partes = partirMensaje(palabra);
  t("palabra gigante: se corta igual", partes.every((p) => p.length <= MAX_CARACTERES_POR_MENSAJE), true);
  t("palabra gigante: no se pierde nada", partes.join("").length, 1000);
}

// ============================== limitar el turno ==============================
{
  t("pocos mensajes: pasa igual", limitarTurno(["a", "b"]), ["a", "b"]);
  const muchos = ["1", "2", "3", "4", "5", "6"];
  const limitado = limitarTurno(muchos);
  t("nunca más de 4 mensajes", limitado.length, MAX_MENSAJES_POR_TURNO);
  t("el sobrante se junta en el último", limitado.at(-1), "4\n\n5\n\n6");
}

// ============================== caso real: el stack de 13 módulos ==============================
{
  // El mensaje más largo del copy real es la lista de módulos de la entrega.
  const entrega = "📚 *Tu curso (13 módulos):*\n" +
    Array.from({ length: 13 }, (_, i) => `${i + 1}. https://drive.google.com/drive/folders/AAAAAAAAAAAAAAAAAAAAAA${i}`).join("\n");
  const partes = partirMensaje(entrega);
  t("la entrega se parte en bloques legibles", partes.length > 1, true);
  t("ningún bloque es un testamento", partes.every((p) => p.length <= MAX_CARACTERES_POR_MENSAJE), true);
  t("los 13 enlaces siguen ahí", partes.join("\n").match(/https:\/\//g).length, 13);
}

console.log(`ritmo: ${ok} ok, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
