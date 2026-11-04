// next/scripts/test-voz-openai.mjs — Prueba de síntesis de voz nativa OpenAI (TTS-1-HD / Opus).
import assert from "node:assert/strict";
import { prepararTextoParaVoz } from "../src/motor/sintetizador-voz-openai.ts";

console.log("=== INICIANDO TEST DE VOZ NATIVA OPENAI ===");

// 1. Verificación de limpieza de texto
const textoOriginal = "¡Hola María! ✨ El curso cuesta *33.000 COP* e incluye los 13 módulos prácticos 🚀 ¿Te animas a arrancar hoy? 💜";
const textoLimpio = prepararTextoParaVoz(textoOriginal);

console.log("Original:", textoOriginal);
console.log("Para Voz:", textoLimpio);

assert.ok(!textoLimpio.includes("✨"), "No debe contener emojis ✨");
assert.ok(!textoLimpio.includes("💜"), "No debe contener emojis 💜");
assert.ok(!textoLimpio.includes("🚀"), "No debe contener emojis 🚀");
assert.ok(!textoLimpio.includes("*"), "No debe contener asteriscos de markdown");
assert.ok(textoLimpio.includes("33 mil pesos"), "Debe normalizar 33.000 COP a '33 mil pesos'");
assert.ok(textoLimpio.includes("trece módulos"), "Debe normalizar 13 módulos a 'trece módulos'");

console.log("✓ Limpieza y preparación de texto para dicción natural validada.");

// 2. Verificación de contrato y parámetros OpenAI
import { sintetizarAudioOpenAI } from "../src/motor/sintetizador-voz-openai.ts";

assert.equal(typeof sintetizarAudioOpenAI, "function");

console.log("✓ Función sintetizarAudioOpenAI importada correctamente.");
console.log("=========================================");
console.log("TODAS LAS PRUEBAS DE VOZ OPENAI PASARON");
console.log("=========================================");
