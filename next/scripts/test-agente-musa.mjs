// next/scripts/test-agente-musa.mjs — SUITE DE VERIFICACIÓN DE LA ARQUITECTURA AGÉNTICA COGNITIVA MUSA V2
import assert from "node:assert/strict";
import { validarAntiRepeticion, sanitizarRespuesta, calcularSimilitud } from "../src/ia/anti-repeticion.ts";
import { detectarIntencionEscalado, generarMensajeHandoffCliente } from "../src/motor/deteccion-escalado.ts";
import { interpretarComando } from "../src/motor/comandos-operador.ts";
import { enviarAlertaOperador, construirEnlaceRespuestaDirecta } from "../src/motor/alerta-operador.ts";

console.log("=== INICIANDO SUITE DE PRUEBAS AGÉNTICAS COGNITIVAS MUSA V2 ===");

// 1. Verificación de Guardarraíl Anti-Repetición
console.log("1. Verificando Guardarraíl Anti-Repetición determinista...");
{
  const salientePrevio = "Dame un momentico, Mauricio. Voy a consultar esto con el equipo para darte una respuesta exacta. Te escribo en un ratico por aquí mismo.";
  const intentoRepetido = "Dame un momentico, Mauricio! Voy a consultar esto con el equipo para darte una respuesta exacta. Te escribo en un ratico por aquí mismo.";
  const res = validarAntiRepeticion(intentoRepetido, [salientePrevio], 0.65);
  assert.equal(res.repetido, true, "Debe rechazar turnos con alta similitud");
  assert.ok(res.maxSimilitud > 0.90, "Similitud debe superar el 90%");

  const respuestaFresca = "Mauricio, ya le pasé tu consulta puntual a nuestro asesor humano para que te responda directamente por este chat.";
  const resFresca = validarAntiRepeticion(respuestaFresca, [salientePrevio], 0.65);
  assert.equal(resFresca.repetido, false, "Debe aceptar respuestas variadas y frescas");
  assert.ok(resFresca.maxSimilitud < 0.65, "Similitud debe estar por debajo del umbral");
  console.log("   ✓ Guardarraíl Anti-Repetición validado exitosamente.");
}

// 2. Verificación de Sanitización y Erradicación de Emojis Problemáticos
console.log("2. Verificando Sanitización y Erradicación de Emojis...");
{
  const textoConManitosYCorazon = "¡Gracias! 🙏 La captura quedó incompleta 💜 Te activo el acceso enseguida 💜";
  const textoSanitizado = sanitizarRespuesta(textoConManitosYCorazon, false);
  assert.ok(!textoSanitizado.includes("🙏"), "Prohibido emoji de manitos de rogar (🙏)");
  assert.ok(!textoSanitizado.includes("💜"), "Prohibidos corazones morados (💜)");

  const textoMolesto = "¡Oye pero qué te pasa! 🤔 Déjame ver 🚀";
  const textoSinEmojis = sanitizarRespuesta(textoMolesto, true); // usuarioMolesto = true
  assert.equal(/[\p{Extended_Pictographic}]/u.test(textoSinEmojis), false, "Debe remover 100% de emojis cuando el cliente está molesto");
  console.log("   ✓ Sanitización y filtro ético de emojis validado exitosamente.");
}

// 3. Verificación de Detección Multicapa de Escalado a Humano
console.log("3. Verificando Detección Multicapa de Escalado...");
{
  // Caso real del incidente: Incertidumbre de atención
  const casoIncertidumbre = "ok entonces voy a esperar a que un humano me responda pero quiero saber si si el humano ya sabe o no sabe porque no me envió un mensaje y me dice oye te atenderé... no me puedo quedar ahí con la incertidumbre";
  const d1 = detectarIntencionEscalado(casoIncertidumbre);
  assert.equal(d1.debeEscalar, true, "Debe escalar ante incertidumbre de espera");
  assert.equal(d1.motivo, "frustracion_incertidumbre");

  // Reclamo de robotización y repetición
  const casoRobot = "deja de repetir exactamente lo mismo pareces una grabadora";
  const d2 = detectarIntencionEscalado(casoRobot);
  assert.equal(d2.debeEscalar, true, "Debe escalar ante reclamo de grabadora/repetición");

  // Petición explícita
  const casoExplicito = "Por favor quiero hablar con un asesor de carne y hueso";
  const d3 = detectarIntencionEscalado(casoExplicito);
  assert.equal(d3.debeEscalar, true, "Debe escalar ante solicitud explícita");

  // Curiosidad normal (NO debe escalar)
  const casoBotCurioso = "¿Eres un bot?";
  const d4 = detectarIntencionEscalado(casoBotCurioso);
  assert.equal(d4.debeEscalar, false, "Curiosidad por bot NO debe escalar");
  console.log("   ✓ Detección multicapa de escalado validada exitosamente.");
}

// 4. Verificación de Comandos del Operador (Reanudar / Pausar / Pagos)
console.log("4. Verificando Comandos del Operador...");
{
  const c1 = interpretarComando("reanudar +573223565761");
  assert.deepEqual(c1, { tipo: "reanudar", telefono: "+573223565761" });

  const c2 = interpretarComando("desescalar 573223565761");
  assert.deepEqual(c2, { tipo: "reanudar", telefono: "+573223565761" });

  const c3 = interpretarComando("pausar +573001234567");
  assert.deepEqual(c3, { tipo: "pausar", telefono: "+573001234567" });

  const c4 = interpretarComando("ok 4821");
  assert.deepEqual(c4, { tipo: "aprobar", shortId: "4821" });
  console.log("   ✓ Intérprete bidireccional de comandos validado exitosamente.");
}

// 5. Verificación de Alerta al Operador y Guarda Anti-Auto-Notificación
console.log("5. Verificando Alerta Push y Guarda Anti-Auto-Notificación...");
{
  const linkWa = construirEnlaceRespuestaDirecta("+573223565761", "Mauricio");
  assert.ok(linkWa.startsWith("https://wa.me/573223565761"), "Enlace wa.me bien formado");
  assert.ok(linkWa.includes("Mauricio"), "Enlace wa.me con saludo personalizado");

  let mensajeEnviado = false;
  const canalMock = {
    enviar: async () => {
      mensajeEnviado = true;
      return { ok: true };
    },
  };

  const dummyConsultar = async () => ({ rows: [] });

  // Si operador === lead (como cuando Mauricio prueba desde su propio número):
  const resOmitida = await enviarAlertaOperador(
    canalMock,
    "+573223565761", // Operador
    dummyConsultar,
    {
      phone: "+573223565761", // Mismo teléfono
      nombre: "Mauricio",
      estadoFunnel: "S06_CIERRE",
      motivo: "solicitud_explicita",
      ultimoMensajeCliente: "quiero un humano",
    }
  );

  assert.equal(resOmitida, true, "Debe resolver ok");
  assert.equal(mensajeEnviado, false, "NUNCA debe enviar la alerta al propio chat del lead");
  console.log("   ✓ Guarda Anti-Auto-Notificación validada exitosamente.");
}

console.log("\n=======================================================");
console.log("TODAS LAS VERIFICACIONES DE AGENTE MUSA V2 PASARON (100%)");
console.log("=======================================================");
