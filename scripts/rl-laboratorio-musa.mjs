// scripts/rl-laboratorio-musa.mjs — Laboratorio de Aprendizaje por Refuerzo con 20 Agentes Leads
import { ejecutarTurnoAgenteMusa } from "../next/src/ia/agente-cognitivo.ts";

/**
 * 20 Arquetipos de Leads representativos del tráfico real de Meta Ads en Colombia / LATAM
 */
export const ARQUETIPOS_LEADS = [
  // 1-4: Compradores Fluidos (Diferentes pasarelas locales)
  {
    id: "lead_01",
    nombre: "Santiago Gómez",
    telefono: "+573001000001",
    perfil: "COMPRADOR_NEQUI_FLUIDO",
    descripcion: "Joven emprendedor, busca comprar de una por Nequi. Confirma edad rápido y pide cuentas.",
    turnos: [
      { entrada: "Hola, vi el anuncio en Instagram de los modelos virtuales y quiero información" },
      { entrada: "Tengo 23 años, ¿por dónde puedo pagar los 9.000?" },
      {
        entrada: "Listo, ya te transferí por Nequi, aquí va el comprobante",
        comprobante: { metodo: "Nequi", monto: 9000, ref: "M9918231", estado: "exitosa", destino: "3223565761" }
      }
    ]
  },
  {
    id: "lead_02",
    nombre: "Camila Restrepo",
    telefono: "+573001000002",
    perfil: "COMPRADOR_BANCOLOMBIA_FLUIDO",
    descripcion: "Diseñadora de moda, quiere aprender a monetizar en Fanvue. Usa Bancolombia.",
    turnos: [
      { entrada: "Buenas tardes, información del curso por favor" },
      { entrada: "Sí, tengo 26 años" },
      { entrada: "Me gustó el temario del aula. Pásame la cuenta de Bancolombia" },
      {
        entrada: "Ya quedó lista la transferencia de los 9 mil",
        comprobante: { metodo: "Bancolombia", monto: 9000, ref: "BC881726", estado: "exitosa", destino: "82061072256" }
      }
    ]
  },
  {
    id: "lead_03",
    nombre: "Andrés Felipe Marín",
    telefono: "+573001000003",
    perfil: "COMPRADOR_BREB_TRANSFIYA",
    descripcion: "Usuario de Daviplata/Transfiya (Bre-B). Paga exacto.",
    turnos: [
      { entrada: "Hola, me interesa el taller de modelos IA" },
      { entrada: "Tengo 31 años" },
      { entrada: "¿Tienes llave Bre-B o Transfiya para transferir ya mismo?" },
      {
        entrada: "Ahí te mandé los 9.000 por la llave @GBT382",
        comprobante: { metodo: "Bre-B", monto: 9000, ref: "TR551928", estado: "exitosa", destino: "@GBT382" }
      }
    ]
  },
  {
    id: "lead_04",
    nombre: "Valeria Duque",
    telefono: "+573001000004",
    perfil: "COMPRADOR_DECIDIDO_ONE_SHOT",
    descripcion: "Vio la landing, confirma edad en el primer mensaje y pide cuentas directo.",
    turnos: [
      { entrada: "Hola corazón, tengo 24 años y quiero arrancar ya. ¿A qué Nequi te transfiero los 9.000?" },
      {
        entrada: "Ya te envié los 9.000 por Nequi, confírmame el acceso",
        comprobante: { metodo: "Nequi", monto: 9000, ref: "NQ119283", estado: "exitosa", destino: "3223565761" }
      }
    ]
  },

  // 5-7: Comprobantes Problemáticos / Defectuosos
  {
    id: "lead_05",
    nombre: "Carlos Pardo",
    telefono: "+573001000005",
    perfil: "COMPROBANTE_BORROSO_MOCHO",
    descripcion: "Manda una foto mocha donde no se ve la referencia ni el monto.",
    turnos: [
      { entrada: "Hola info" },
      { entrada: "28 años" },
      {
        entrada: "Ya pagué mira",
        comprobante: { incompleto: true, motivo: "sin_referencia_visible" }
      },
      {
        entrada: "Qué pena, aquí está la captura completa con la referencia",
        comprobante: { metodo: "Nequi", monto: 9000, ref: "NQ772819", estado: "exitosa", destino: "3223565761" }
      }
    ]
  },
  {
    id: "lead_06",
    nombre: "Daniela Ortiz",
    telefono: "+573001000006",
    perfil: "COMPROBANTE_VALOR_INFERIOR",
    descripcion: "Transfiere solo 5.000 COP en vez de 9.000 COP.",
    turnos: [
      { entrada: "Hola, me das información" },
      { entrada: "Tengo 22" },
      {
        entrada: "Te transferí 5.000 que era lo que tenía en la cuenta",
        comprobante: { metodo: "Nequi", monto: 5000, ref: "NQ338192", estado: "exitosa", destino: "3223565761", valorInferior: true }
      }
    ]
  },
  {
    id: "lead_07",
    nombre: "Esteban Morales",
    telefono: "+573001000007",
    perfil: "COMPROBANTE_MONTO_ALTO_FLAG",
    descripcion: "Paga 30.000 COP (error o generosidad). Debe ir a cola de revisión humana.",
    turnos: [
      { entrada: "Hola quiero información del taller completo" },
      { entrada: "Tengo 45 años" },
      {
        entrada: "Te transferí 30.000 por Nequi",
        comprobante: { metodo: "Nequi", monto: 30000, ref: "M9928172", estado: "exitosa", destino: "3223565761", flag: "monto_excesivo" }
      }
    ]
  },

  // 8-9: Intentos de Fraude / Spoofing
  {
    id: "lead_08",
    nombre: "Javier 'Hacker' Rojas",
    telefono: "+573001000008",
    perfil: "FRAUDE_REFERENCIA_DUPLICADA",
    descripcion: "Intenta reutilizar el comprobante M15422364 que ya fue usado.",
    turnos: [
      { entrada: "Hola" },
      { entrada: "25 años" },
      {
        entrada: "Aquí está mi comprobante de pago de hoy",
        comprobante: { metodo: "Nequi", monto: 9000, ref: "M15422364", estado: "exitosa", repetido: true }
      }
    ]
  },
  {
    id: "lead_09",
    nombre: "Brayan Silva",
    telefono: "+573001000009",
    perfil: "FRAUDE_VOUCHER_FALSO_OCR",
    descripcion: "Comprobante falso con fuente tipográfica alterada.",
    turnos: [
      { entrada: "Hola info del curso" },
      { entrada: "Tengo 20 años" },
      {
        entrada: "Listo ya te pagué, dame el acceso de una",
        comprobante: { falso: true, tipografiaAlterada: true, motivo: "fraude_tipografia" }
      }
    ]
  },

  // 10-12: Objeciones Psicológicas y Comerciales
  {
    id: "lead_10",
    nombre: "Mariana Vélez",
    telefono: "+573001000010",
    perfil: "ESCEPTICA_ESTAFA",
    descripcion: "Teme que sea una estafa por internet. Exige pruebas y garantías.",
    turnos: [
      { entrada: "Hola, ¿esto es de verdad o es una estafa como tantas que hay en internet?" },
      { entrada: "Tengo 29 años, pero me da miedo transferir y que no me manden nada" },
      { entrada: "Bueno, vi el temario en la plataforma y se ve profesional. Pásame el Nequi pues" }
    ]
  },
  {
    id: "lead_11",
    nombre: "Alejandro Castro",
    telefono: "+573001000011",
    perfil: "OBJECCION_SIN_PC",
    descripcion: "No tiene computador ni tarjeta de video potente.",
    turnos: [
      { entrada: "Hola, me interesa pero no tengo computador gamer ni tarjeta gráfica. ¿Puedo hacerlo?" },
      { entrada: "Tengo 27 años" },
      { entrada: "Ah excelente que todo corra en la nube. Pásame la cuenta para pagar los 9.000" }
    ]
  },
  {
    id: "lead_12",
    nombre: "Sofía Navarro",
    telefono: "+573001000012",
    perfil: "OBJECCION_SIN_EXPERIENCIA",
    descripcion: "Ama de casa, no sabe nada de tecnología ni de prompts.",
    turnos: [
      { entrada: "Buenas noches, me llama la atención pero yo no sé nada de inteligencia artificial ni sistemas" },
      { entrada: "Sí, soy mayor de edad, tengo 35 años" },
      { entrada: "Si es copiar y pegar plantillas me animo. ¿Cómo hago para pagar?" }
    ]
  },

  // 13-14: Duda de Autenticidad (Bot vs Humano)
  {
    id: "lead_13",
    nombre: "Mateo Rincón",
    telefono: "+573001000013",
    perfil: "DUDA_BOT_EXIGE_AUDIO",
    descripcion: "Pregunta si Musa es un bot y pide escuchar su voz.",
    turnos: [
      { entrada: "¿Eres un robot o eres una persona de verdad?" },
      { entrada: "Mándame una nota de voz para creerte" },
      { entrada: "Wao, qué linda voz. Tengo 24 años, ¿cuánto cuesta entrar?" }
    ]
  },
  {
    id: "lead_14",
    nombre: "Laura Medina",
    telefono: "+573001000014",
    perfil: "DUDA_AUTORIDAD_PRODUCCION",
    descripcion: "Pregunta qué herramientas se enseñan (Midjourney, Flux, etc.).",
    turnos: [
      { entrada: "Hola Musa, ¿en el curso enseñan Flux o Stable Diffusion? ¿Y cómo logran que el rostro no cambie?" },
      { entrada: "Tengo 26 años" },
      { entrada: "Totalmente de acuerdo. Pásame los datos de pago para entrar al aula" }
    ]
  },

  // 15-16: Leads Silenciosos / Fantasmas (Prueba de Reactor)
  {
    id: "lead_15",
    nombre: "Felipe Caicedo",
    telefono: "+573001000015",
    perfil: "FANTASMA_POST_AUDIO",
    descripcion: "Saluda, recibe el Turno 1 con audio y no vuelve a responder. Evalúa el toque a los 60s.",
    turnos: [
      { entrada: "Hola quiero información" }
      // Turno 2 ausente: Evalúa si el reactor de continuidad a los 60 segundos entra con suavidad
    ]
  },
  {
    id: "lead_16",
    nombre: "Natalia Benítez",
    telefono: "+573001000016",
    perfil: "FANTASMA_POST_LINK",
    descripcion: "Confirma edad, recibe el enlace al aula y se queda explorando sin hablar. Evalúa el toque de 45-60s.",
    turnos: [
      { entrada: "Hola, me interesa el curso" },
      { entrada: "Tengo 21 años" }
      // Se queda explorando el aula. Evalúa si entra el audio/mensaje de cierre con cuentas a los 45-60s
    ]
  },

  // 17-18: Casos Especiales de Pago (Efectivo / Internacional)
  {
    id: "lead_17",
    nombre: "Sebastián Hoyos",
    telefono: "+573001000017",
    perfil: "PAGO_EFECTIVO_EFECTY",
    descripcion: "No tiene cuentas bancarias, pregunta si puede pagar en efectivo.",
    turnos: [
      { entrada: "Hola, no tengo Nequi ni cuenta de banco. ¿Puedo pagar en efectivo en un Efecty o Gana?" },
      { entrada: "Tengo 30 años" }
    ]
  },
  {
    id: "lead_18",
    nombre: "Diego Arismendi",
    telefono: "+5215512345678",
    perfil: "CLIENTE_INTERNACIONAL_MEXICO",
    descripcion: "Escribe desde México (+52). Pregunta el precio en dólares y si aceptan tarjeta.",
    turnos: [
      { entrada: "Hola, te escribo desde México. ¿Cuánto cuesta en pesos mexicanos o dólares y cómo puedo pagar?" },
      { entrada: "Sí, tengo 28 años" }
    ]
  },

  // 19: Regateador / Pide Gratis
  {
    id: "lead_19",
    nombre: "Paula Serrano",
    telefono: "+573001000019",
    perfil: "REGATEADOR_PIDE_GRATIS",
    descripcion: "Pide el taller gratis o rebaja de precio.",
    turnos: [
      { entrada: "Hola, ¿el curso es gratis o cuánto vale?" },
      { entrada: "Tengo 19 años. ¿No me lo dejas en 5.000 que es lo único que me queda?" }
    ]
  },

  // 20: Intento de Farol / Bypass
  {
    id: "lead_20",
    nombre: "David 'Bypass' Méndez",
    telefono: "+573001000020",
    perfil: "FAROLERO_REPORTA_BYPASS",
    descripcion: "Dice que ya vio todos los videos gratis sin pagar.",
    turnos: [
      { entrada: "Hola" },
      { entrada: "Tengo 22" },
      { entrada: "Oye dejaste la plataforma abierta y ya alcancé a ver todos los videos gratis sin pagar nada jaja" }
    ]
  }
];

/**
 * Motor de Simulación del Laboratorio Musa
 */
export async function simularRondaAgentes(opts = {}) {
  const { ronda = 1, leads = ARQUETIPOS_LEADS, urlPublica = "https://server-production-3709.up.railway.app" } = opts;

  console.log(`\n═════════════════════════════════════════════════════════════════════════`);
  console.log(`   INICIANDO RONDA ${ronda} DE APRENDIZAJE POR REFUERZO (20 AGENTES LEADS)`);
  console.log(`═════════════════════════════════════════════════════════════════════════\n`);

  const resultados = [];

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const registroLead = {
      phone: lead.telefono,
      nombre: lead.nombre,
      pagado: false,
      mayor_18: null,
      estado_funnel: "S00_LLEGADA",
      opt_out: false,
      escalado_humano: false
    };

    const mensajesLead = [];
    const mensajesSalientes = [];
    const timersSeguimiento = [];

    const canalMock = {
      enviar: async (tel, msg) => {
        mensajesSalientes.push({
          tel,
          tipo: msg.tipo || (msg.media ? msg.media.tipo : "texto"),
          texto: msg.texto || "",
          mime: msg.media?.mime,
          url: msg.media?.url ? (msg.media.url.startsWith("data:") ? "[BASE64_MEDIA]" : msg.media.url) : null,
          ts: Date.now()
        });
        return { ok: true, status: 200 };
      },
      marcarEscribiendo: async () => {},
      marcarGrabando: async () => {}
    };

    const consultarMock = async (sql, params = []) => {
      const sqlNorm = sql.toLowerCase();
      if (sqlNorm.includes("from public.musa_leads")) {
        return { rows: [{ ...registroLead }] };
      }
      if (sqlNorm.includes("update public.musa_leads")) {
        if (sqlNorm.includes("mayor_18 = true") || (sqlNorm.includes("mayor_18") && params[1] === true)) {
          registroLead.mayor_18 = true;
        } else if (sqlNorm.includes("mayor_18 = false") || (sqlNorm.includes("mayor_18") && params[1] === false)) {
          registroLead.mayor_18 = false;
        }
        if (sqlNorm.includes("s08_espera_captura")) {
          registroLead.estado_funnel = "S08_ESPERA_CAPTURA";
        }
        if (sqlNorm.includes("pagado = true")) {
          registroLead.pagado = true;
          registroLead.estado_funnel = "S10_CLIENTE";
        }
        if (sqlNorm.includes("escalado_humano = true")) {
          registroLead.escalado_humano = true;
        }
        return { rows: [{ ...registroLead }] };
      }
      if (sqlNorm.includes("from public.musa_messages")) {
        return { rows: mensajesLead };
      }
      if (sqlNorm.includes("insert into public.musa_messages")) {
        mensajesLead.push({
          id: mensajesLead.length + 1,
          lead_phone: params[0],
          direction: params[1],
          body: params[2],
          media_type: params[3]
        });
        return { rows: [{ id: mensajesLead.length }] };
      }
      return { rows: [] };
    };

    const deps = {
      consultar: consultarMock,
      canal: canalMock,
      urlPublica,
      telefonoOperador: "+573223565761",
      esperar: async (ms) => {
        // Registrar el pacing real entre burbujas
      }
    };

    // Ejecutar cada turno del lead
    let fricciones = [];
    let rafagasDetectadas = 0;
    let mencionesExplorar = 0;
    let audioTurno1Limpio = true;
    let cuentasDespachadas = false;
    let enlaceAulaDespachado = false;
    let tiempoEntreBurbujasMs = [];

    for (let t = 0; t < lead.turnos.length; t++) {
      const turno = lead.turnos[t];
      const countAntes = mensajesSalientes.length;
      const tStart = Date.now();

      await ejecutarTurnoAgenteMusa(deps, {
        phone: lead.telefono,
        nombrePerfil: lead.nombre,
        texto: turno.entrada,
        esAudioEntrante: false
      });

      const nuevosMensajes = mensajesSalientes.slice(countAntes);

      // Evaluación Turno 1 (Audio protagonista)
      if (t === 0) {
        const tieneAudio = nuevosMensajes.some(m => m.tipo === "audio");
        const textosPosteriores = nuevosMensajes.filter(m => m.tipo === "texto" && m.texto.includes("academia.html"));
        if (tieneAudio && textosPosteriores.length > 0) {
          audioTurno1Limpio = false;
          fricciones.push("Turno 1: Se despachó enlace posterior al audio (salto de pantalla).");
        }
      }

      // Evaluación de ráfagas (más de 2 burbujas simultáneas en el mismo turno)
      if (nuevosMensajes.length > 2) {
        rafagasDetectadas += (nuevosMensajes.length - 2);
        fricciones.push(`Turno ${t + 1}: Ráfaga detectada (${nuevosMensajes.length} mensajes en un solo turno).`);
      }

      // Chequeo de vocabulario dubitativo ("explorar")
      nuevosMensajes.forEach(m => {
        if (/explorar|vamos a explorar|ensayar/i.test(m.texto || "")) {
          mencionesExplorar++;
          fricciones.push(`Turno ${t + 1}: Uso prohibido de la palabra 'explorar'.`);
        }
        if ((m.texto || "").includes("academia.html")) enlaceAulaDespachado = true;
        if ((m.texto || "").includes("Medios de pago oficiales") || (m.texto || "").includes("3223565761") || (m.texto || "").includes("82061072256") || (m.texto || "").includes("@GBT382")) cuentasDespachadas = true;
      });
    }

    // Evaluación crítica y cálculo del Score de Recompensa (RL)
    let score = 100;
    if (!audioTurno1Limpio) score -= 25;
    if (rafagasDetectadas > 0) score -= (rafagasDetectadas * 10);
    if (mencionesExplorar > 0) score -= (mencionesExplorar * 15);

    // Ajuste por arquetipo
    if (lead.perfil.startsWith("COMPRADOR") && !cuentasDespachadas) {
      score -= 30;
      fricciones.push("Comprador viable no recibió cuentas oficiales ni llamado al pago.");
    }
    if (lead.perfil === "FAROLERO_REPORTA_BYPASS" && !registroLead.escalado_humano) {
      score -= 20;
      fricciones.push("Reporte de bypass no activó alerta de seguridad.");
    }

    score = Math.max(0, Math.min(100, score));

    resultados.push({
      leadId: lead.id,
      nombre: lead.nombre,
      perfil: lead.perfil,
      score,
      mensajesTotales: mensajesSalientes.length,
      fricciones,
      cuentasDespachadas,
      enlaceAulaDespachado,
      mensajesSalientes
    });
  }

  // Métricas agregadas de la ronda
  const scorePromedio = (resultados.reduce((acc, r) => acc + r.score, 0) / resultados.length).toFixed(1);
  const leadsConFriccion = resultados.filter(r => r.fricciones.length > 0).length;
  const tasaExito = (((resultados.length - leadsConFriccion) / resultados.length) * 100).toFixed(1);

  console.log(`\n📊 ═══════ RESULTADOS CONSOLIDADOS RONDA ${ronda} ═══════`);
  console.log(`⭐ Score de Recompensa Promedio (RL): ${scorePromedio} / 100`);
  console.log(`🎯 Tasa de Éxito Limpio: ${tasaExito}% (${resultados.length - leadsConFriccion} / ${resultados.length} sin fricciones)`);
  console.log(`⚠️ Leads con Fricciones Detectadas: ${leadsConFriccion}`);
  if (leadsConFriccion > 0) {
    console.log(`\n🔍 DETALLE DE LEADS CON FRICCIÓN EN RONDA ${ronda}:`);
    resultados.filter(r => r.fricciones.length > 0).forEach(r => {
      console.log(`  • [${r.leadId}] ${r.nombre} (${r.perfil}) - Score: ${r.score}`);
      r.fricciones.forEach(f => console.log(`      ⚠️ ${f}`));
    });
  }
  console.log(`═══════════════════════════════════════════════════════════\n`);

  // Guardar archivo JSON con los resultados de la ronda para trazabilidad
  try {
    const fs = await import("fs");
    if (!fs.existsSync("tmp")) fs.mkdirSync("tmp");
    fs.writeFileSync(`tmp/rl_ronda_${ronda}.json`, JSON.stringify({ ronda, scorePromedio, tasaExito, leadsConFriccion, resultados }, null, 2));
  } catch (e) {
    /* ignore */
  }

  return {
    ronda,
    scorePromedio: Number(scorePromedio),
    tasaExito: Number(tasaExito),
    leadsConFriccion,
    resultados
  };
}

export async function correrLaboratorioCompleto5Rondas() {
  const resumenes = [];
  for (let r = 1; r <= 5; r++) {
    const res = await simularRondaAgentes({ ronda: r });
    resumenes.push(res);
  }
  console.log("\n🏁 ═════════════════════════════════════════════════════════════════");
  console.log("   LABORATORIO DE APRENDIZAJE POR REFUERZO: 5 RONDAS COMPLETADAS");
  console.log("═════════════════════════════════════════════════════════════════");
  resumenes.forEach(r => {
    console.log(`  Ronda ${r.ronda}: Score ${r.scorePromedio}/100 | Éxito: ${r.tasaExito}% | Fricciones: ${r.leadsConFriccion}`);
  });
  console.log("═════════════════════════════════════════════════════════════════\n");
  return resumenes;
}

if (process.argv[1] && process.argv[1].endsWith("rl-laboratorio-musa.mjs")) {
  const argRonda = process.argv[2] ? parseInt(process.argv[2], 10) : 1;
  const promesa = argRonda === 55 ? correrLaboratorioCompleto5Rondas() : simularRondaAgentes({ ronda: argRonda });
  promesa
    .then(() => process.exit(0))
    .catch(err => {
      console.error("Error en laboratorio RL:", err);
      process.exit(1);
    });
}
