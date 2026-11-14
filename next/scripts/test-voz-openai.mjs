// next/scripts/test-voz-openai.mjs — Prueba de síntesis de voz nativa OpenAI (TTS-1-HD / Opus).
import assert from "node:assert/strict";
import { prepararTextoParaVoz } from "../src/motor/sintetizador-voz-openai.ts";

console.log("=== INICIANDO TEST DE VOZ NATIVA OPENAI ===");

// 1. Verificación de limpieza de texto
const textoOriginal = "¡Hola María! ✨ El curso cuesta *20.000 COP* (≈ *5 USD*) e incluye los 13 módulos prácticos 🚀 ¿Te animas a arrancar hoy? 💜";
const textoLimpio = prepararTextoParaVoz(textoOriginal);

console.log("Original:", textoOriginal);
console.log("Para Voz:", textoLimpio);

assert.ok(!textoLimpio.includes("✨"), "No debe contener emojis ✨");
assert.ok(!textoLimpio.includes("💜"), "No debe contener emojis 💜");
assert.ok(!textoLimpio.includes("🚀"), "No debe contener emojis 🚀");
assert.ok(!textoLimpio.includes("*"), "No debe contener asteriscos de markdown");
assert.ok(textoLimpio.includes("veinte mil pesos"), "Debe normalizar 20.000 COP a 'veinte mil pesos'");
assert.ok(textoLimpio.includes("cinco dólares"), "Debe normalizar 5 USD a 'cinco dólares'");
assert.ok(textoLimpio.includes("trece módulos"), "Debe normalizar 13 módulos a 'trece módulos'");

const textoUnitEconomics = prepararTextoParaVoz(
  "Con 25 a 40 suscriptores de 15 USD sumas 375 a 600 USD (1,5 a 2,5 millones COP), frente a mentorías de 150–300 USD (+600.000 COP). Con 1 suscriptor recuperas 2x–3x aprox. 🎙️",
);
assert.ok(!textoUnitEconomics.includes("1cinco"), `Jamás debe convertir '15 USD' en '1cinco': ${textoUnitEconomics}`);
assert.ok(!textoUnitEconomics.includes("\uFE0F"), `No debe dejar selector FE0F huérfano: ${textoUnitEconomics}`);
assert.ok(textoUnitEconomics.includes("15 dólares"), `Debe pronunciar '15 dólares': ${textoUnitEconomics}`);
assert.ok(textoUnitEconomics.includes("uno punto cinco a dos punto cinco millones de pesos"), `Debe pronunciar millones limpio: ${textoUnitEconomics}`);
assert.ok(textoUnitEconomics.includes("150 a 300 dólares"), `Debe suavizar rango 150-300 USD: ${textoUnitEconomics}`);
assert.ok(textoUnitEconomics.includes("más de seiscientos mil pesos"), `Debe normalizar +600.000 COP: ${textoUnitEconomics}`);
assert.ok(textoUnitEconomics.includes("2 a 3 veces"), `Debe normalizar 2x-3x a '2 a 3 veces': ${textoUnitEconomics}`);
assert.ok(textoUnitEconomics.includes("aproximadamente"), `Debe expandir aprox.: ${textoUnitEconomics}`);

const texto120k = prepararTextoParaVoz("Antes pagaban 120.000 COP.");
assert.ok(!texto120k.includes("1veinte"), `Jamás debe convertir '120.000' en '1veinte': ${texto120k}`);

console.log("✓ Limpieza y preparación de texto para dicción natural validada (incluye lookbehind numérico).");

// 2. Verificación de contrato y parámetros OpenAI
import { sintetizarAudioOpenAI } from "../src/motor/sintetizador-voz-openai.ts";

assert.equal(typeof sintetizarAudioOpenAI, "function");

console.log("✓ Función sintetizarAudioOpenAI importada correctamente.");
console.log("=========================================");
console.log("TODAS LAS PRUEBAS DE VOZ OPENAI PASARON");
console.log("=========================================");
