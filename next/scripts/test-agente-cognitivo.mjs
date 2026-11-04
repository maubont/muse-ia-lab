// next/scripts/test-agente-cognitivo.mjs — Prueba del Cerebro Agéntico Puro Musa IA
import assert from "node:assert/strict";
import { construirPromptMaestroAgente, ejecutarTurnoAgenteMusa } from "../src/ia/agente-cognitivo.ts";

console.log("=== INICIANDO PRUEBAS DEL CEREBRO AGÉNTICO MUSA IA 2026/2027 ===");

// 1. Verificación de Prompt Maestro
console.log("1. Verificando construcción del prompt agéntico...");
const prompt = construirPromptMaestroAgente({
  phone: "+573223565761",
  nombre: "Mauricio",
  urlPublica: "https://server-production-3709.up.railway.app",
  mayor18: true,
  estadoFunnel: "S00_LLEGADA",
});

assert.ok(prompt.includes("33.000 COP"), "Debe contener el precio exacto");
assert.ok(prompt.toLowerCase().includes("sol") || prompt.toLowerCase().includes("coral") || prompt.toLowerCase().includes("voz neuronal"), "Debe orientar a la voz de Musa");
assert.ok(!prompt.includes("💜"), "Cero corazones morados en el prompt");
assert.ok(!prompt.includes("🙏"), "Cero manitos de súplica en el prompt");
assert.ok(prompt.includes("academia.html"), "Debe incluir el enlace de demo gratis");
console.log("   ✓ Prompt maestro agéntico validado.");

// 2. Simulación de Turno Cognitivo (Modo Sin API Key / Fallback Empático)
console.log("2. Verificando despacho de turno agéntico...");
const mensajesEnviados = [];
const eventosRegistrados = [];

const canalFalso = {
  async enviar(phone, m) {
    mensajesEnviados.push({ phone, ...m });
    return { ok: true };
  },
};

const consultarFalso = async (sql, params) => {
  if (sql.includes("musa_messages") && sql.includes("direction = 'in'")) {
    return { rows: [] };
  }
  if (sql.includes("musa_leads")) {
    return {
      rows: [
        {
          nombre: "Mauricio",
          profile_name: "Mauricio Bonilla",
          estado_funnel: "S00_LLEGADA",
          mayor18: true,
          pagado: false,
        },
      ],
    };
  }
  if (sql.includes("musa_funnel_events")) {
    eventosRegistrados.push(params);
    return { rows: [] };
  }
  return { rows: [] };
};

const res = await ejecutarTurnoAgenteMusa(
  {
    consultar: consultarFalso,
    canal: canalFalso,
    urlPublica: "https://server-production-3709.up.railway.app",
    presupuestoDiarioUsd: 1.0,
  },
  {
    phone: "+573223565761",
    nombrePerfil: "Mauricio Bonilla",
    texto: "Aló, ¿alguien me puede dar información del curso?",
    esAudioEntrante: false,
  },
);

assert.ok(res.ok, "Debe responder con éxito");
assert.ok(res.textoEnviado.includes("Modelos IA"), "Debe mencionar el curso");
assert.ok(mensajesEnviados.length > 0, "Debe enviar mensaje al canal");
console.log("   ✓ Turno agéntico despachado con éxito.");

console.log("\n=======================================================");
console.log("TODAS LAS PRUEBAS DEL AGENTE COGNITIVO PASARON (100%)");
console.log("=======================================================");
