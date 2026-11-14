// next/scripts/test-agente-cognitivo.mjs — Prueba del Cerebro Agéntico Puro Musa IA
import assert from "node:assert/strict";
import { construirPromptMaestroAgente, ejecutarTurnoAgenteMusa, ejecutarSeguimiento60Segundos } from "../src/ia/agente-cognitivo.ts";
import { prepararTextoParaVoz } from "../src/motor/sintetizador-voz-openai.ts";

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

assert.ok(prompt.includes("20.000 COP"), "Debe contener el precio exacto");
assert.ok(prompt.includes("SÍ (CONFIRMADO"), "mayor18=true debe marcar confirmado");
assert.ok(prompt.toLowerCase().includes("lingxin") || prompt.toLowerCase().includes("voz"), "Debe orientar a la voz de Musa");
assert.ok(!prompt.includes("💜"), "Cero corazones morados en el prompt");
assert.ok(!prompt.includes("🙏"), "Cero manitos de súplica en el prompt");
assert.ok(prompt.includes("academia.html"), "Debe incluir el enlace de demo gratis");
assert.ok(!prompt.includes("9.000 COP"), "No debe quedar el precio anterior de 9.000 COP");

const promptPendiente = construirPromptMaestroAgente({
  phone: "+573001112233",
  nombre: "",
  urlPublica: "https://server-production-3709.up.railway.app",
  mayor18: null,
  estadoFunnel: "S00_LLEGADA",
});
assert.ok(promptPendiente.includes("PENDIENTE DE CONFIRMAR"), "mayor18=null debe quedar pendiente, nunca bloqueado");
assert.ok(!promptPendiente.includes("MENOR DE EDAD BLOQUEADO"), "mayor18=null no debe tratarse como menor");

const promptMenor = construirPromptMaestroAgente({
  phone: "+573001112233",
  nombre: "",
  urlPublica: "https://server-production-3709.up.railway.app",
  mayor18: false,
  estadoFunnel: "S92_MENOR",
});
assert.ok(promptMenor.includes("MENOR DE EDAD BLOQUEADO"), "mayor18=false debe marcar bloqueo de menor");
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
assert.ok(/taller|curso|modelo/i.test(res.textoEnviado), "Debe responder sobre el taller o las modelos");
assert.ok(mensajesEnviados.length > 0, "Debe enviar mensaje al canal");
console.log("   ✓ Turno agéntico despachado con éxito.");

// 3. Verificación de fonética en español para 20.000 COP en notas de voz
console.log("3. Verificando fonética de 20.000 COP en prepararTextoParaVoz...");
const fonetica = prepararTextoParaVoz("El acceso al taller son solo 20.000 COP por las 13 clases y 4 bonos...");
assert.ok(fonetica.includes("veinte mil pesos"), `Debe pronunciar 'veinte mil pesos', obtenido: ${fonetica}`);
assert.ok(!fonetica.includes("dólares.000"), "Jamás debe corromper 20.000 COP con dólares");
console.log("   ✓ Fonética colombiana de 20.000 COP validada.");

// 4. Verificación del Reactor Inteligente de 60 Segundos (Con clic en Aula vs Sin clic)
console.log("4. Verificando Reactor Inteligente de 60 Segundos...");
const envios60s = [];
const canal60s = {
  async enviar(phone, m) {
    envios60s.push({ phone, ...m });
    return { ok: true };
  },
};

// Caso A: Prospecto SÍ hizo clic en el enlace del aula (visita_aula presente) y es +18
const resConClic = await ejecutarSeguimiento60Segundos({
  consultar: async (sql) => {
    if (sql.includes("from public.musa_leads")) return { rows: [{ pagado: false, opt_out: false, escalado_humano: false, mayor_18: true }] };
    if (sql.includes("direction = 'in'")) return { rows: [] };
    if (sql.includes("evento = 'seguimiento_60s'")) return { rows: [] };
    if (sql.includes("evento = 'visita_aula'")) return { rows: [{ id: 1 }] };
    return { rows: [] };
  },
  canal: canal60s,
  phone: "+573001112233",
  desdeTimestampIso: new Date(Date.now() - 60000).toISOString(),
});
assert.equal(resConClic.enviado, true, "Debe enviar seguimiento a los 60s si no respondió");
assert.equal(resConClic.visitoAula, true, "Debe detectar que visitó el aula");
assert.ok(resConClic.texto.includes("Vi que acabas de entrar a mirar el aula"), "Debe personalizar el mensaje reconociendo la visita al aula");
assert.ok(resConClic.texto.includes("20.000 COP"), "Debe cerrar a 20.000 COP");

// Caso B: Prospecto NO hizo clic en el enlace del aula y es +18
const resSinClic = await ejecutarSeguimiento60Segundos({
  consultar: async (sql) => {
    if (sql.includes("from public.musa_leads")) return { rows: [{ pagado: false, opt_out: false, escalado_humano: false, mayor_18: true }] };
    if (sql.includes("direction = 'in'")) return { rows: [] };
    if (sql.includes("evento = 'seguimiento_60s'")) return { rows: [] };
    if (sql.includes("evento = 'visita_aula'")) return { rows: [] };
    return { rows: [] };
  },
  canal: canal60s,
  phone: "+573009998877",
  desdeTimestampIso: new Date(Date.now() - 60000).toISOString(),
});
assert.equal(resSinClic.enviado, true, "Debe enviar seguimiento a los 60s aunque no haya abierto el link");
assert.equal(resSinClic.visitoAula, false, "Debe detectar que no visitó el aula aún");
assert.ok(resSinClic.texto.toLowerCase().includes("pudiste abrir el enlace del aula"), "Debe invitar cálidamente a abrir el enlace y dejar cuentas");

// Caso D: Prospecto visitó el aula pero NO ha confirmado +18 -> NO debe entregar cuentas
const resSinEdad = await ejecutarSeguimiento60Segundos({
  consultar: async (sql) => {
    if (sql.includes("from public.musa_leads")) return { rows: [{ pagado: false, opt_out: false, escalado_humano: false, mayor_18: false }] };
    if (sql.includes("direction = 'in'")) return { rows: [] };
    if (sql.includes("evento = 'seguimiento_60s'")) return { rows: [] };
    if (sql.includes("evento = 'visita_aula'")) return { rows: [{ id: 2 }] };
    return { rows: [] };
  },
  canal: canal60s,
  phone: "+573004445566",
  desdeTimestampIso: new Date(Date.now() - 60000).toISOString(),
});
assert.equal(resSinEdad.enviado, true, "Debe enviar seguimiento invitando a confirmar edad");
assert.equal(resSinEdad.texto.includes("82061072256"), false, "PROHIBIDO entregar cuentas si mayor_18 es false");
assert.ok(resSinEdad.texto.includes("18 años"), "Debe pedir confirmación de mayoría de edad");

// Caso C: Prospecto YA respondió antes de los 60s -> se cancela
const resYaRespondio = await ejecutarSeguimiento60Segundos({
  consultar: async (sql) => {
    if (sql.includes("from public.musa_leads")) return { rows: [{ pagado: false, opt_out: false, escalado_humano: false }] };
    if (sql.includes("direction = 'in'")) return { rows: [{ id: 99 }] };
    return { rows: [] };
  },
  canal: canal60s,
  phone: "+573005554433",
  desdeTimestampIso: new Date(Date.now() - 60000).toISOString(),
});
assert.equal(resYaRespondio.enviado, false, "No debe interrumpir si el cliente ya respondió");
assert.equal(resYaRespondio.motivo, "lead_ya_respondio");
console.log("   ✓ Reactor inteligente de 60 segundos validado (Con clic / Sin clic / Cancelación).");

// 6. Regresión: lead en S00_LLEGADA con mayor_18=false legacy (sin S92_MENOR ni bloqueo_menor_edad) NO debe bloquearse como menor
{
  const {
    construirPromptMaestroAgente: buildPrompt,
    ejecutarTurnoAgenteMusa: runTurno,
    limpiarSeguimientosPendientes: clearTimers,
  } = await import("../src/ia/agente-cognitivo.ts");

  const promptPendiente = buildPrompt({
    phone: "+573001112233",
    nombre: "Carlos",
    urlPublica: "https://ejemplo.test",
    mayor18: null,
    estadoFunnel: "S00_LLEGADA",
  });
  assert.ok(promptPendiente.includes("PENDIENTE DE CONFIRMAR"), "Prompt con mayor18=null debe indicar PENDIENTE DE CONFIRMAR");
  assert.equal(promptPendiente.includes("MENOR DE EDAD BLOQUEADO"), false, "Prompt con mayor18=null NO debe bloquear como menor");

  const fetchOriginal = globalThis.fetch;
  let promptEnviadoIa = "";
  const sqlEjecutados = [];
  const eventosInsertados = [];
  const envios = [];

  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("/chat/completions")) {
      const body = JSON.parse(String(init?.body || "{}"));
      promptEnviadoIa = body.messages?.[0]?.content || "";
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    respuesta: "Hola Carlos, qué gusto saludarte. ¿Ya conocías cómo funciona el entrenamiento o te cuento desde cero?",
                    enviarVoz: false,
                    intencion: "saludo",
                    videoAccion: "ninguno",
                    adjuntarCuentas: false,
                    confirmoMayor18: null,
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 40 },
          }),
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  respuesta: "Hola Carlos, qué gusto saludarte. ¿Ya conocías cómo funciona el entrenamiento o te cuento desde cero?",
                  enviarVoz: false,
                  intencion: "saludo",
                  videoAccion: "ninguno",
                  adjuntarCuentas: false,
                  confirmoMayor18: null,
                }),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 40 },
        }),
      };
    }
    throw new Error(`Fetch inesperado en test regresión reset: ${u}`);
  };

  try {
    const resResetLegacy = await runTurno(
      {
        consultar: async (sql, params) => {
          sqlEjecutados.push({ sql, params });
          if (sql.includes("insert into public.musa_funnel_events")) {
            eventosInsertados.push({ sql, params });
          }
          if (sql.includes("from public.musa_leads")) {
            return {
              rows: [
                {
                  nombre: null,
                  profile_name: "Carlos",
                  estado_funnel: "S00_LLEGADA",
                  mayor_18: false,
                  pagado: false,
                },
              ],
            };
          }
          return { rows: [] };
        },
        canal: {
          async enviar(_tel, payload) {
            envios.push(payload);
            return { ok: true, id: "msg-reset-1" };
          },
          async marcarEscribiendo() {},
          async marcarGrabando() {},
        },
        apiKey: "test-key-regresion",
        baseUrl: "https://api.openai.com/v1",
        modelo: "gpt-6.1-terra",
        urlPublica: "https://ejemplo.test",
        esperar: async () => {},
        seguimiento60sMs: 5000,
      },
      {
        phone: "+573001112233",
        nombrePerfil: "Carlos",
        texto: "Hola, me interesa información",
        esAudioEntrante: false,
      },
    );

    assert.equal(resResetLegacy.ok, true, "El turno con mayor_18=false legacy en S00_LLEGADA debe completar ok");
    assert.ok(promptEnviadoIa.includes("PENDIENTE DE CONFIRMAR"), "La IA debe recibir PENDIENTE DE CONFIRMAR en S00_LLEGADA con mayor_18=false legacy");
    assert.equal(promptEnviadoIa.includes("MENOR DE EDAD BLOQUEADO"), false, "PROHIBIDO inyectar MENOR DE EDAD BLOQUEADO en S00_LLEGADA con mayor_18=false legacy");
    assert.equal(
      sqlEjecutados.some((q) => q.sql.includes("S92_MENOR") || (Array.isArray(q.params) && q.params.includes("S92_MENOR"))),
      false,
      "No debe transicionar a S92_MENOR un lead en S00_LLEGADA sin señal de menor",
    );
    const evTurno = eventosInsertados.find((e) => e.sql.includes("turno_agente_cognitivo"));
    assert.ok(evTurno, "Debe registrar evento turno_agente_cognitivo");
    const detalle = JSON.parse(String(evTurno.params?.[1] || "{}"));
    assert.equal(detalle.esMenor, false, "No debe marcar esMenor=true cuando solo había mayor_18=false legacy en S00_LLEGADA");
    assert.ok(envios.length >= 1, "Debe enviar respuesta al prospecto");
    console.log("   ✓ Regresión S00_LLEGADA + mayor_18=false legacy validada (no bloquea como menor).");
  } finally {
    globalThis.fetch = fetchOriginal;
    clearTimers("+573001112233");
  }
}

console.log("\n=======================================================");
console.log("TODAS LAS PRUEBAS DEL AGENTE COGNITIVO PASARON (100%)");
console.log("=======================================================");
