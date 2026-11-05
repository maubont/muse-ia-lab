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

// 1. Verificación de Voz Nova y prosodia
console.log("1. Verificando especificaciones de Voz Nova y prosodia...");
assert.ok(prompt.includes("Nova"), "Debe especificar la voz Nova");
assert.ok(prompt.includes("doblaje profesional"), "Debe exigir calidad de doblaje");
assert.ok(prompt.includes("acento latino neutro"), "Debe exigir acento latino neutro");
assert.ok(prompt.includes("susurro cómplice") || prompt.includes("puntos suspensivos"), "Debe incluir indicaciones de prosodia y pausas");
console.log("   ✓ Voz Nova y prosodia humana validadas.");

// 2. Verificación de alternancia sensorial (No obligar audio a audio)
console.log("2. Verificando regla de alternancia sensorial...");
assert.ok(prompt.includes("NO respondas automáticamente con un audio solo porque el cliente mandó un audio"), "Debe prohibir la correspondencia rígida audio-audio");
assert.ok(prompt.includes("textoPrevio"), "Debe soportar textoPrevio antes de una nota de voz");
console.log("   ✓ Alternancia sensorial validada.");

// 3. Verificación de embudo progresivo (Prohibido video temprano)
console.log("3. Verificando embudo de revelación progresiva de video...");
assert.ok(prompt.includes("CERO VIDEOS") || prompt.includes("Prohibido enviar videos en el saludo inicial"), "Debe prohibir videos en turnos tempranos");
assert.ok(prompt.includes("Micro-fantasía auditiva"), "Debe contemplar la fase de micro-fantasía auditiva");
assert.ok(prompt.includes("video_base"), "Debe contemplar el video base para curiosidad genuina");
assert.ok(prompt.includes("muestra_latina"), "Debe contemplar muestra personalizada");
console.log("   ✓ Embudo progresivo de video validado.");

// 4. Verificación de manejo de saturación y competencia
console.log("4. Verificando analogía de concesionarios y gasolineras...");
assert.ok(prompt.includes("concesionarios"), "Debe incluir la analogía de los concesionarios");
assert.ok(prompt.includes("gasolineras"), "Debe incluir la analogía de las gasolineras");
assert.ok(prompt.includes("demanda"), "Debe fundamentar que la demanda es inagotable");
console.log("   ✓ Manejo de saturación validado.");

// 5. Verificación de plataforma protegida (Cero Clase 1 gratis)
console.log("5. Verificando estado protegido del LMS...");
assert.ok(prompt.includes("NINGUNA CLASE ESTÁ DESBLOQUEADA PÚBLICAMENTE"), "Debe prohibir prometer clases gratis");
assert.ok(prompt.includes("Video de Bienvenida"), "Debe dirigir al video de bienvenida");
assert.ok(prompt.includes("academia.html"), "Debe incluir el enlace oficial");
console.log("   ✓ Plataforma y aula protegida validadas.");

// 6. Verificación del espejo emocional post-video
console.log("6. Verificando psicología del espejo emocional post-video...");
assert.ok(prompt.includes("excitación") || prompt.includes("cosquilleo") || prompt.includes("fascinación"), "Debe contener el cierre psicológico de sensaciones naturales");
assert.ok(prompt.includes("naturaleza humana"), "Debe normalizar el deseo como condición humana sin culpas");
console.log("   ✓ Cierre psicológico del espejo emocional validado.");

console.log("\n=======================================================");
console.log("TODAS LAS 6 VERIFICACIONES PSICOLÓGICAS PASARON (100%)");
console.log("=======================================================");
