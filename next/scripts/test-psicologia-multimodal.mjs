// next/scripts/test-psicologia-multimodal.mjs — Verificación de Psicología Multimodal y Reglas de Conversión
import assert from "node:assert/strict";
import { construirPromptMaestroAgente } from "../src/ia/agente-cognitivo.ts";

console.log("=== INICIANDO VALIDACIÓN DE PSICOLOGÍA MULTIMODAL Y REGLAS DE CONVERSIÓN ===");

const prompt = construirPromptMaestroAgente({
  phone: "+573223565761",
  nombre: "Mauricio",
  urlPublica: "https://server-production-3709.up.railway.app",
  mayor18: true,
  estadoFunnel: "S00_LLEGADA",
});

// 1. Verificación de Voz Lingxin y prosodia
console.log("1. Verificando especificaciones de Voz Lingxin y prosodia...");
assert.ok(prompt.includes("Lingxin"), "Debe especificar la voz oficial Lingxin");
assert.ok(prompt.includes("colombiano"), "Debe exigir acento colombiano natural");
assert.ok(prompt.includes("seductor") || prompt.includes("cómplice"), "Debe incluir tono seductor y cómplice");
console.log("   ✓ Voz Lingxin y prosodia colombiana validadas.");

// 2. Verificación de alternancia sensorial (Regla 70% Texto / 30% Audio)
console.log("2. Verificando regla de alternancia sensorial...");
assert.ok(prompt.includes("70% TEXTO") || prompt.includes("30% AUDIO"), "Debe incluir la regla de alternancia 70/30");
assert.ok(prompt.includes("textoPrevio"), "Debe soportar textoPrevio antes de una nota de voz");
console.log("   ✓ Alternancia sensorial validada.");

// 3. Verificación de Bóveda de Video
console.log("3. Verificando Bóveda de Video Dinámica...");
assert.ok(prompt.includes("video_base"), "Debe contemplar el video base para curiosidad genuina");
assert.ok(prompt.includes("muestra_latina"), "Debe contemplar muestra personalizada");
console.log("   ✓ Bóveda de video validada.");

// 4. Verificación de plataforma protegida y temario
console.log("4. Verificando estado protegido del LMS...");
assert.ok(prompt.includes("llave de titanio") || prompt.includes("protegida"), "Debe confirmar que las clases están bajo llave");
assert.ok(prompt.includes("academia.html"), "Debe incluir el enlace oficial");
console.log("   ✓ Plataforma y aula protegida validadas.");

// 5. Verificación de Medios de Pago y Precio ($20.000 COP)
console.log("5. Verificando hechos económicos y precio...");
assert.ok(prompt.includes("20.000 COP"), "Debe fijar el precio a 20.000 COP");
assert.ok(prompt.includes("Nequi"), "Debe incluir Nequi");
assert.ok(prompt.includes("Bancolombia"), "Debe incluir Bancolombia");
assert.ok(prompt.includes("@GBT382"), "Debe incluir llave Bre-B @GBT382");
console.log("   ✓ Hechos económicos validados.");

console.log("\n=======================================================");
console.log("TODAS LAS VERIFICACIONES PSICOLÓGICAS PASARON (100%)");
console.log("=======================================================");
