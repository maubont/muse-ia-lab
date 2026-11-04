// next/scripts/test-incidente-screenshot.mjs
// Simulación exacta del incidente de WhatsApp reportado en el screenshot

import assert from "node:assert/strict";
import { decidirRuta } from "../src/motor/router.ts";
import { pideHumano, esAfirmativoCierre } from "../../functions/motor/guardarrailes.ts";

console.log("--- INICIANDO TEST DE SIMULACIÓN DEL INCIDENTE REAL (SCREENSHOT) ---");

const cfgSimulada = {
  mensajes: {},
  cuentasCo: {
    nequi: { numero: "3223565761" },
    bancolombia: { numero: "82061072256" },
  },
  funnelCopy: {
    etapas: {
      S06_CIERRE: {
        id: "S06_CIERRE",
        mensajes: ["En Modelos IA aprendes a crear modelos virtuales..."],
      },
      S91_HUMANO: {
        id: "S91_HUMANO",
        mensajes: ["¡Hola! Con gusto te comunico con un asesor de nuestro equipo... ✨"],
      },
    },
    objeciones: [],
  },
};

// TEST 1: Verificar que "quiero info" o pedir información ya NO dispara falso cierre hacia captura
console.log("1. Verificando regex guardarrailes...");
assert.equal(esAfirmativoCierre("quiero info"), false, "quiero info NO debe ser cierre afirmativo");
assert.equal(esAfirmativoCierre("por favor me da informacion del curso"), false, "pedir info no debe ser cierre");
assert.equal(esAfirmativoCierre("si quiero comprar"), true, "si quiero comprar SI debe ser cierre");
console.log("   ✓ Guardarrailes de cierre verificados");

// TEST 2: Verificar detección de reclamo humano
console.log("2. Verificando detección de reclamo de atención humana...");
assert.equal(pideHumano("hola por favor alguien que me responda"), true);
assert.equal(pideHumano("alguien que me de informacion"), true);
assert.equal(pideHumano("comuniqueme con un humano"), true);
assert.equal(pideHumano("hay alguien ahi"), true);
assert.equal(pideHumano("atencion al cliente"), true);
console.log("   ✓ Guardarrailes de humano verificados");

// TEST 3: Simular Turno 2 del screenshot: Lead en S08 dice "¿Cuál captura? Estoy solicitando información del curso..."
console.log("3. Verificando Deadlock Breaker en S08 cuando el usuario está confundido...");
const leadEnS08 = {
  phone: "+573223565761",
  estado_funnel: "S08_ESPERA_CAPTURA",
  escalado_humano: false,
};

const efectosTurno2 = decidirRuta({
  lead: { ...leadEnS08 },
  body: "¿Cuál captura? Estoy solicitando información del curso, por favor.",
  comprobante: null,
  cfg: cfgSimulada,
});

// Debe regresar a S06_CIERRE, emitir disculpas cálidas y explicar el curso
const patchEstado = efectosTurno2.find(e => e.tipo === "lead")?.patch?.estado_funnel;
assert.equal(patchEstado, "S06_CIERRE", "Debe volver a S06_CIERRE");
const enviarEfecto = efectosTurno2.find(e => e.tipo === "enviar");
assert.ok(enviarEfecto, "Debe enviar respuesta");
assert.ok(
  enviarEfecto.textos.some(t => t.includes("qué pena contigo") || t.includes("Me adelanté de la emoción")),
  "Debe pedir disculpas cálidas por el malentendido"
);
assert.ok(
  !enviarEfecto.textos.some(t => t.includes("💜")),
  "NO debe contener corazón morado"
);
console.log("   ✓ Deadlock breaker superado: Musa desescaló a S06 con gracia y empatía.");

// TEST 4: Simular Turno 3 del screenshot: Lead pide humano: "Hola, por favor, alguien que me responda, me de información o comuníqueme con un humano."
console.log("4. Verificando escalado y bloqueo de scripts de venta...");
const efectosTurno3 = decidirRuta({
  lead: { ...leadEnS08, estado_funnel: "S06_CIERRE" },
  body: "Hola, por favor, alguien que me responda, me de información o comuníqueme con un humano.",
  comprobante: null,
  cfg: cfgSimulada,
});

const patchEscalado = efectosTurno3.find(e => e.tipo === "lead")?.patch?.escalado_humano;
assert.equal(patchEscalado, true, "Debe marcar escalado_humano = true");
const notifOperador = efectosTurno3.find(e => e.tipo === "notificar_operador");
assert.ok(notifOperador, "Debe notificar al operador de forma inmediata");
assert.ok(notifOperador.texto.includes("🚨 ATENCIÓN REQUERIDA"), "Notificación con alerta clara");
console.log("   ✓ Escalado a humano ejecutado con alerta a operador.");

// TEST 5: Mensaje posterior cuando el lead ya está escalado a humano
console.log("5. Verificando que el bot NO hable cuando escalado_humano === true...");
const efectosTurno4 = decidirRuta({
  lead: { ...leadEnS08, escalado_humano: true },
  body: "Sigo esperando respuesta...",
  comprobante: null,
  cfg: cfgSimulada,
});

// El bot no debe enviar textos automáticos de venta al lead
const envioEnEscalado = efectosTurno4.filter(e => e.tipo === "enviar");
assert.equal(envioEnEscalado.length, 0, "El bot NO debe enviar respuestas automáticas cuando está escalado a humano");
const notifEscalado = efectosTurno4.find(e => e.tipo === "notificar_operador");
assert.ok(notifEscalado, "Debe avisar al operador sobre el mensaje recibido mientras está en atención humana");
console.log("   ✓ Silencio del bot garantizado durante escalado humano.");

console.log("\n=======================================================");
console.log("TODAS LAS PRUEBAS DEL INCIDENTE PASARON CON 100% ÉXITO");
console.log("=======================================================");
