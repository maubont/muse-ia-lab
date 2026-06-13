// Genera la migración con los 7 cambios del dueño sobre el copy en BD.
// Toma como base el contenido ACTUAL de la BD (fuente de verdad) y aplica:
//  C1 sin país (precio con ambas monedas, pago con todos los métodos);
//  C3 sin grupo/comunidad en TODO el copy;
//  C7 marco formativo sin promesa de ingresos.
// (C2 edad-IA, C4 nota de voz, C5 retardo/typing, C6 entrada anuncio viven en el motor.)
//
// Uso:
//   node scripts/build-cambios-7.mjs migrations/cambios7.sql   -> escribe SQL
//   node scripts/build-cambios-7.mjs --apply                   -> aplica vía REST
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// funnel_copy NUEVO (reescrito desde el contenido actual de la BD, ya curado).
// ---------------------------------------------------------------------------
const BRIDGE = "Te tengo una sorpresa preparada para más adelante 😉 Pero primero lo importante:";

const funnelCopy = {
  version: "cambios7-2026-06-12",
  etapas: [
    {
      id: "S00_LLEGADA",
      objetivo: "Registrar el lead, capturar metadatos (nombre de perfil de WhatsApp, ad_id/referral del anuncio CTWA, timestamp para la ventana del bono de acción rápida) y disparar el saludo en menos de 60 segundos.",
      disparador: "Primer mensaje entrante de un número sin estado previo (el prellenado del anuncio NO es 'hola'; su contenido se ignora para clasificar, solo se guarda).",
      mensajes: [],
      notas: "Sin mensaje propio: estado interno. Acciones: crear lead, guardar profile_name crudo, evaluar usabilidad del nombre, flags avatar_enviado=false, bono_rapido_hasta=now+24h. CAMBIO 6: cualquier primer mensaje (texto o vacío) dispara la bienvenida. Transición inmediata a S01_SALUDO y de ahí, tras el momento avatar, DIRECTO a S04_GATE18 (sin etapa de país)."
    },
    {
      id: "S01_SALUDO",
      objetivo: "Abrir con calidez, presentar a Musa, plantar la promesa del producto y generar expectativa.",
      disparador: "Transición automática desde S00_LLEGADA.",
      mensajes: [
        "¡Hola! 😄 Qué bueno tenerte por aquí. Soy *Musa*, asesora de *Modelos IA* 💜",
        "Aquí vas a descubrir cómo crear modelos virtuales hiperrealistas con inteligencia artificial y monetizarlas en internet 💻✨",
        "Pero antes de contarte los detalles… déjame mostrarte algo que te va a encantar 👀 Dame unos segunditos ⏳"
      ],
      notas: "Los mensajes salen con efecto tecleo. Transición automática a S02_AVATAR sin esperar respuesta."
    },
    {
      id: "S02_AVATAR",
      objetivo: "MOMENTO AVATAR (solo UNA vez por lead, flag avatar_enviado): demostrar el producto en vivo con el video del avatar saludando por nombre y conectarlo con 'esto lo vas a saber crear tú'.",
      disparador: "Transición automática desde S01_SALUDO. Rama A: nombre usable y hay video. Rama C: hay nombre pero no hay video para ese nombre → genérico.",
      ramas: {
        A: {
          condicion: "Nombre de perfil usable y existe video pre-renderizado para ese nombre.",
          mensajes: [
            "[VIDEO_AVATAR]",
            "¿Viste eso, {{nombre}}? 😏 Esa chica NO existe. Es un modelo creado 100% con inteligencia artificial… y te saludó por tu nombre. Eso exactamente es lo que vas a aprender a crear tú, paso a paso, aunque hoy no sepas nada de IA."
          ],
          sin_video: BRIDGE
        },
        B: {
          condicion: "Nombre de perfil no usable: pedir el nombre antes de mostrar el video.",
          mensajes: [
            "Por cierto, ¿cómo te llamas? 😊 Quiero mostrarte algo especial y me gustaría hacerlo bien.",
            "[AL RECIBIR EL NOMBRE, SI HAY VIDEO] ¡Listo, {{nombre}}! Mira esto 👇 [VIDEO_AVATAR]",
            "[TRAS EL VIDEO] Esa chica NO existe 🤯 Está creada 100% con inteligencia artificial: su cara, su voz, sus gestos… todo. Y eso exactamente es lo que vas a aprender a crear tú, paso a paso, aunque hoy estés empezando de cero."
          ],
          sin_video: BRIDGE
        },
        C: {
          condicion: "Hay nombre pero no existe video pre-renderizado para ese nombre: usar video genérico.",
          mensajes: [
            "Mira esto 👇 [VIDEO_AVATAR_GENERICO]",
            "[TRAS EL VIDEO] Esa chica NO existe 🤯 Está creada 100% con inteligencia artificial: su cara, su voz, sus gestos… todo. Y eso exactamente es lo que vas a aprender a crear tú, paso a paso, aunque hoy estés empezando de cero."
          ],
          sin_video: BRIDGE
        }
      },
      notas: "Regla dura: una sola vez por lead. CAMBIO 1: tras el momento avatar (o el puente sin_video) se pasa DIRECTO a S04_GATE18; ya NO hay etapa de país."
    },
    {
      id: "S04_STACK_18",
      objetivo: "Stack de valor compacto (13 módulos + 4 bonos + bono Plan de Acción 7 Días) y confirmación de mayoría de edad DESPUÉS del stack y ANTES de cualquier detalle del material para adultos.",
      disparador: "Transición automática desde S02_AVATAR (tras el momento avatar).",
      mensajes: [
        "Mira TODO lo que incluye *Modelos IA* 👇\n\n🤖 *13 módulos paso a paso:*\n• Cómo funciona el mercado de modelos IA 📊\n• Crear tu modelo hiperrealista desde cero\n• Generar contenido ilimitado con su rostro y estilo\n• Prompts avanzados de imagen y video\n• Automatizar respuestas y atención (como esta 😉)\n• Monetizar packs, suscripciones y contenido exclusivo\n• Atraer tráfico desde TikTok e Instagram\n\n🎁 *Y además 4 bonos:*\n1️⃣ Colección de +20 modelos IA premium\n2️⃣ Audios FemPro\n3️⃣ YouTube Money Machine\n4️⃣ MegaPack Master IA\n\n🎯 Y el bono *Plan de Acción 7 Días* si decides hoy: tu paso a paso para arrancar esta misma semana.\n\nTodo con *acceso de por vida* y soporte por este mismo chat 💜",
        "Eso sí, importante ⚠️: parte del material es exclusivo para mayores de edad. ¿Me confirmas que ya tienes 18 años o más?",
        "[SI RESPONDE QUE ES MENOR] Te agradezco un montón la sinceridad 🙏 Este programa incluye material exclusivo para mayores de edad, así que solo puedo venderlo a partir de los 18. Cuando los cumplas, aquí estaré. ¡Cuídate mucho! 💜"
      ],
      notas: "CAMBIO 2: la confirmación se infiere con IA (heurística + clasificador), no exige la palabra 'sí'. Solo 'es_mayor' → mayor_18=true → S05_PRECIO. 'es_menor' → S92_MENOR (bloqueo total). 'ambiguo' → re-preguntar con calidez, sin avanzar. CAMBIO 3: SIN grupo/comunidad en el stack. El bono Plan de Acción 7 Días SÍ se nombra como parte del valor."
    },
    {
      id: "S05_PRECIO",
      objetivo: "Revelar el precio único de 9 USD con AMBAS referencias de moneda juntas (sin filtro de país).",
      disparador: "Confirmación 18+ recibida en S04_STACK_18.",
      mensajes: [
        "¿Y sabes qué es lo mejor? TODO va junto en un único pago de *9 USD* (equivalente a *{{precio_bs}} Bs* o *{{precio_cop}} COP* a la tasa de hoy) 💥\n\n✅ 13 módulos completos\n✅ Los 4 bonos\n✅ Bono Plan de Acción 7 Días (por decisión rápida)\n✅ Acceso de por vida, sin mensualidades",
        "Y apenas confirme tu pago, te entrego TODO por aquí mismo: enlaces directos de Google Drive, sin esperas ni trámites 🚀"
      ],
      notas: "CAMBIO 1: el precio muestra SIEMPRE las dos referencias juntas (Bs y COP), sin preguntar país. CAMBIO 3: sin grupo/comunidad. La tasa en Bs se actualiza a diario vía cron. Transición automática a S06_CIERRE."
    },
    {
      id: "S06_CIERRE",
      objetivo: "Pedir la venta de forma directa y sin presión falsa: una pregunta de cierre clara.",
      disparador: "Transición automática desde S05_PRECIO.",
      mensajes: [
        "¿Te animas a empezar hoy, {{nombre}}? 😊 ¿Te paso los datos de pago?"
      ],
      notas: "SÍ/dale/ok → S07_DATOS_PAGO. Objeción → matriz de objeciones y re-cierre suave. Pregunta fuera de guion → fallback GPT. NUNCA repetir la pregunta de cierre más de 2 veces seguidas sin aportar algo nuevo."
    },
    {
      id: "S07_DATOS_PAGO",
      objetivo: "Entregar TODOS los métodos de pago juntos (Venezuela + Colombia), el monto exacto y la instrucción de enviar la captura.",
      disparador: "Aceptación del cierre ('sí', 'dale', 'cómo pago', 'pásame los datos') en cualquier etapa posterior al precio.",
      mensajes: [
        "¡De una, {{nombre}}! 🙌 Tu acceso es de *9 USD* (*{{precio_bs}} Bs* o *{{precio_cop}} COP* a la tasa de hoy). Puedes pagar por el medio que más te sirva 👇",
        "Cuando hagas el pago, envíame la *captura del comprobante* por aquí 📸 y lo verifico enseguida."
      ],
      notas: "CAMBIO 1: se muestran TODOS los métodos juntos (bloque Venezuela: Pago Móvil + transferencia BDV; bloque Colombia: Nequi, Bancolombia, llave Bre-B). El motor inserta los bloques de cuentas VÁLIDAS entre mensajes[0] (encabezado) y mensajes[1] (cierre). Solo se envían cuentas no-placeholder; si ninguna es válida, se escala a humano. El bot JAMÁS pide tarjeta, claves ni OTP: solo la captura. Transición a S08_ESPERA_CAPTURA."
    },
    {
      id: "S08_ESPERA_CAPTURA",
      objetivo: "Sostener al lead durante el pago, resolver dudas operativas de la transferencia y recibir la imagen del comprobante.",
      disparador: "Entrada automática tras S07_DATOS_PAGO. Sub-disparador de recordatorio: 15 minutos sin imagen recibida.",
      mensajes: [
        "[RECORDATORIO 15 MIN] ¿Cómo vas con el pago, {{nombre}}? 😊 Si te surgió algún detalle con la transferencia (banco caído, datos, monto), dime y lo resolvemos juntos.",
        "[SI ENVÍA TEXTO EN VEZ DE IMAGEN, ej. 'ya pagué'] ¡Buenísimo! 🙌 Envíame la captura del comprobante por aquí mismo para verificarlo y entregarte todo de una vez 📸"
      ],
      notas: "Imagen recibida → S09_VERIFICACION. Texto/duda → GPT con contexto de pagos y re-pedir la captura."
    },
    {
      id: "S09_VERIFICACION",
      objetivo: "Acusar recibo de la captura al instante, fijar expectativa REAL de tiempo y validar el pago antes de entregar.",
      disparador: "Mensaje entrante con imagen estando en S08_ESPERA_CAPTURA (o en cualquier estado posterior al precio).",
      mensajes: [
        "¡Recibido, {{nombre}}! 🙌 Dame unos minutos mientras verifico tu pago ✅ Normalmente tarda menos de 15 minutos (en horario de 8am a 10pm).",
        "[FUERA DE HORARIO] ¡Recibido, {{nombre}}! 🙌 Tu comprobante quedó en cola. Nuestro horario de verificación es de 8am a 10pm, así que apenas abramos mañana lo confirmo y te entrego TODO de inmediato. Tu acceso está asegurado, tranqui 💜",
        "[COMPROBANTE ILEGIBLE O NO CUADRA] Mmm, no logro validar este comprobante 🤔 ¿Me confirmas el *número de referencia*, el *banco desde el que pagaste* y la *hora* de la operación? Con eso lo reviso de nuevo.",
        "[PAGO INCOMPLETO] {{nombre}}, veo que el monto no coincide con el total (*{{precio_bs}} Bs* / *{{precio_cop}} COP*). ¿Me ayudas completando la diferencia y me envías esa captura? Apenas cuadre, te entrego todo 🙌"
      ],
      notas: "La captura se sube a Storage, un humano (u OCR) la valida. Aprobado → S10_ENTREGA. Prometer SOLO tiempos que se cumplen."
    },
    {
      id: "S10_ENTREGA",
      objetivo: "Confirmar el pago, entregar los 17 enlaces ordenados en 2 bloques (sin parecer spam) y dejar al alumno con un primer paso concreto.",
      disparador: "Verificación aprobada en S09_VERIFICACION.",
      mensajes: [
        "✅ ¡Pago confirmado! Bienvenido oficialmente a *Modelos IA*, {{nombre}} 🎉 Diste un gran paso.",
        "Te entrego todo organizado en *2 bloques* para que no se te pierda nada. Tip: fija este chat o guarda los enlaces en tus mensajes destacados 📌",
        "📚 *BLOQUE 1 — Curso completo (13 módulos):*\n[ENTREGA_LINKS:modulos_1_13]",
        "🎁 *BLOQUE 2 — Tus 4 bonos:*\n[ENTREGA_LINKS:bonos_1_4]\n\n(Recuerda: el material 🔞 es de uso personal y solo para adultos)",
        "Mi consejo para arrancar 💪: con dedicación y aplicando el paso a paso, empieza HOY por el *Módulo 1* (te toma ~20 minutos) y en poco tiempo verás tu primer modelo creado y publicado. Cualquier duda, me escribes por aquí. ¡Nos vemos adentro! — Musa 💜 | Modelos IA"
      ],
      notas: "CAMBIO 3: SIN bloque de comunidad/grupo. Los enlaces se agrupan en 2 mensajes (módulos / bonos), nunca 17 separados. Verificar mayor_18=true antes del Bloque 2. CAMBIO 7: marco formativo, sin promesa de ingresos. Marcar pagado=true, programar tarea a 48h. Transición a S11_POSTVENTA."
    },
    {
      id: "S11_POSTVENTA",
      objetivo: "Retener, generar testimonios reales y sembrar futuras ofertas sin quemar el canal.",
      disparador: "48h después de la entrega (tarea programada).",
      mensajes: [
        "[48H — DENTRO DE VENTANA] Hola {{nombre}} 😊 ¿Cómo vas con el curso? ¿Ya creaste tu primer modelo? Cuéntame, me encanta ver los avances 👀",
        "[SI RESPONDE POSITIVO] ¡Qué nota! 🙌 ¿Me regalas una mini-reseña por aquí (texto o audio)? Con tu permiso la compartimos para que más personas se animen 💜",
        "[SI RESPONDE CON PROBLEMA] Gracias por contarme 🙏 Vamos a resolverlo: dime exactamente en qué módulo o enlace tuviste el detalle y lo arreglo de una."
      ],
      notas: "CAMBIO 3: sin grupo/comunidad. Solo testimonios reales y con permiso se citan en ventas futuras."
    },
    {
      id: "S90_FALLBACK_GPT",
      objetivo: "Responder CUALQUIER pregunta fuera de guion con el modelo GPT y devolver la conversación al riel del estado pendiente.",
      disparador: "Mensaje entrante que el clasificador de la etapa actual no reconoce.",
      mensajes: [
        "[PLANTILLA DE COMPORTAMIENTO, NO COPY FIJO] GPT responde en máximo 3 líneas, tono Musa, usando SOLO el contexto del producto (qué es, qué incluye, precio 9 USD, métodos de pago, entrega por Drive, garantía de entrega) + lista negra de cumplimiento. Cierra SIEMPRE reconectando con la pregunta pendiente de la etapa actual."
      ],
      notas: "El system prompt del fallback vive en musa_settings clave gpt_system. Si la confianza es baja o el tema es delicado → S91_HUMANO."
    },
    {
      id: "S91_HUMANO",
      objetivo: "Escalar a un humano del equipo sin romper la experiencia.",
      disparador: "Solicitud explícita de hablar con una persona, queja fuerte, fraude o baja confianza del fallback.",
      mensajes: [
        "Dame un momentico, {{nombre}} 🙏 Voy a consultar esto con el equipo para darte una respuesta exacta. Te escribo en un ratico por aquí mismo."
      ],
      notas: "El bot pausa la automatización en ese chat hasta que el humano marque 'resuelto'."
    }
  ],
  objeciones: [
    {
      objecion: "¿Es estafa? / no confío",
      respuesta: "Te entiendo perfecto, {{nombre}}, en internet hay que cuidarse 🙏 Por eso te dejo una muestra REAL de lo que hay adentro, para que la pruebes tú mismo gratis antes de pagar 👇\n\n🎨 *Retrato hiperrealista de una mujer joven latina, fotografía profesional, luz natural dorada, piel realista con textura, 85mm f/1.4* — pégalo en cualquier IA de imágenes y me cuentas qué tal 😏 Ese prompt es UNO de los del módulo de creación de modelos.\n\nAdemás la entrega es inmediata: pagas, verifico tu comprobante y recibes TODOS los enlaces por este mismo chat, así puedes comprobarlo todo al instante. ¿Qué otra duda te queda?"
    },
    {
      objecion: "Está caro / no tengo plata",
      respuesta: "Tranquilo, te entiendo 🙏 Por eso el precio es el que es: 9 USD una sola vez ({{precio_bs}} Bs / {{precio_cop}} COP), menos de lo que cuesta una pizza 🍕, por 13 módulos + 4 bonos, con acceso de por vida. No hay mensualidades ni cobros escondidos. Si hoy no puedes, no pasa nada: dime cuándo te queda mejor y te guardo la info actualizada. ¿Te parece?"
    },
    {
      objecion: "¿Me llega de inmediato?",
      respuesta: "¡Sí! 🚀 Apenas verifico tu comprobante (normalmente menos de 15 minutos en horario de 8am a 10pm), te entrego TODO por este mismo chat: los 13 módulos y los 4 bonos como enlaces directos de Google Drive. Nada de esperar correos ni plataformas raras."
    },
    {
      objecion: "¿Sirve para principiantes?",
      respuesta: "Totalmente 💪 El curso arranca desde CERO: el módulo 1 te explica cómo funciona este mercado y de ahí vas paso a paso hasta crear tu primer modelo. No necesitas saber de diseño ni de programación, solo un celular o compu con internet. Está pensado para empezar sin experiencia."
    },
    {
      objecion: "¿Funciona en mi país?",
      respuesta: "Sí 🌎 Todo el curso es online y las herramientas de IA que se enseñan funcionan desde cualquier país. La monetización también: las plataformas para vender contenido y atraer tráfico (TikTok, Instagram, etc.) están disponibles en Venezuela, Colombia y prácticamente toda LATAM. Para el pago tienes varios métodos y de eso me encargo yo 😉"
    },
    {
      objecion: "¿Puedo pagar en bolívares / en pesos?",
      respuesta: "¡Claro que sí! 🙌 Son 9 USD: en Venezuela 🇻🇪 pagas {{precio_bs}} Bs (a la tasa de hoy) por Pago Móvil o transferencia Banco de Venezuela; en Colombia 🇨🇴 pagas {{precio_cop}} COP por Nequi, Bancolombia o llave Bre-B. Puedes usar el medio que más te sirva. ¿Te paso los datos?"
    },
    {
      objecion: "¿Qué incluye exactamente?",
      respuesta: "Te lo resumo completico 👇 *13 módulos*: mercado de modelos IA, creación de tu modelo hiperrealista desde cero, contenido ilimitado, prompts avanzados de imagen y video, automatización de respuestas, monetización de packs y suscripciones, y tráfico desde TikTok e Instagram. *4 bonos*: Colección de +20 modelos IA premium, Audios FemPro, YouTube Money Machine y MegaPack Master IA. Y si decides hoy, el bono *Plan de Acción 7 Días*. Todo con acceso de por vida por un único pago de 9 USD."
    },
    {
      objecion: "¿Es legal?",
      respuesta: "Sí 😊 Crear modelos virtuales con IA y vender contenido digital propio es una actividad legal: es contenido generado por ti, de personas que no existen, con herramientas públicas de IA. El curso además te enseña a trabajar dentro de las normas de cada plataforma. Lo que compras es formación: videos y guías paso a paso."
    },
    {
      objecion: "Soy mujer, ¿me sirve?",
      respuesta: "¡Por supuesto! 💜 De hecho hay muchas mujeres en esto, y con ventaja: el negocio es crear y gestionar modelos VIRTUALES, tú nunca pones tu cara ni tu cuerpo, tú eres la dueña del negocio detrás. El método es exactamente el mismo: creas tu modelo con IA, generas el contenido y monetizas."
    },
    {
      objecion: "¿Hay garantía?",
      respuesta: "Te garantizo la entrega completa: pagas y recibes los 13 módulos + 4 bonos verificables al instante, por este mismo chat 📲 Y no te vendo humo: esto es formación, los resultados dependen de que apliques lo que aprendes, como en cualquier curso. Lo que sí te aseguro es que recibes exactamente todo lo que te describí, con acceso de por vida, y me tienes aquí para cualquier problema con tu acceso."
    },
    {
      objecion: "¿Por qué tan barato?",
      respuesta: "Buena pregunta 😄 El precio es así de accesible a propósito: queremos que cualquiera en Venezuela o Colombia pueda pagarlo, porque el negocio crece con muchos alumnos activos, no exprimiendo a cada uno. 9 USD, una vez, todo incluido. Sin letra pequeña."
    },
    {
      objecion: "Déjame pensarlo",
      respuesta: "¡Claro, {{nombre}}, tómate tu tiempo! 😊 Solo dos cositas para que las tengas en cuenta: el monto en bolívares se ajusta con la tasa del día, así que hoy queda en {{precio_bs}} Bs; y a quienes confirman su pago dentro de las primeras 24 horas de su primer contacto les incluimos el *Plan de Acción 7 Días* de regalo (una guía extra que solo damos por decisión rápida, de verdad). Cualquier duda que te esté frenando, dímela con confianza, para eso estoy 💜"
    },
    {
      objecion: "¿Eres un bot?",
      respuesta: "Sí 😄 Soy Musa, la asistente virtual del equipo de Modelos IA. Y te cuento un secreto: automatizar la atención así, con IA, es UNA de las cosas que enseña el curso (módulo de automatización 😉). Detrás hay un equipo humano real que verifica cada pago y te apoya si algo se complica. ¿Seguimos? ¿Qué más quieres saber?"
    }
  ],
  seguimientos: [
    {
      retraso: "30 minutos sin respuesta (post-precio o post-cierre)",
      mensaje: "{{nombre}}, ¿quedaste con alguna duda? 😊 Pregúntame con confianza, para eso estoy. Te lo resumo en una línea: curso completo (13 módulos) + 4 bonos, pago único de 9 USD ({{precio_bs}} Bs / {{precio_cop}} COP), entrega inmediata por este chat. ¿Te paso los datos de pago?"
    },
    {
      retraso: "4 horas sin respuesta",
      mensaje: "Hola {{nombre}} 👋 Te dejo una muestra REAL de lo que hay dentro del curso para que lo veas con tus propios ojos 👇\n\n🎨 *Retrato hiperrealista de una mujer joven latina, fotografía profesional, luz natural dorada, piel realista con textura, 85mm f/1.4*\n\nEse es solo UNO de los prompts del módulo de creación de modelos. Pruébalo gratis en cualquier IA de imágenes y me cuentas qué tal 😏 Imagínate con los 13 módulos completos. ¿Retomamos?"
    },
    {
      retraso: "20 horas sin respuesta (última ventana antes de las 24h)",
      mensaje: "{{nombre}}, paso a contarte dos cosas reales antes de cerrar tu chat de hoy 😊\n\n1️⃣ La tasa del bolívar cambia cada día: hoy tu acceso queda en *{{precio_bs}} Bs* (o *{{precio_cop}} COP*); mañana el monto en Bs se recalcula.\n2️⃣ A quienes confirman su pago dentro de las primeras 24 horas les incluimos de regalo el *Plan de Acción 7 Días* 🎁: una guía extra con el paso a paso exacto de tu primera semana. Es real y solo se entrega por decisión rápida (tu plazo vence hoy a las {{hora_limite}}).\n\nSi te animas, te paso los datos en 10 segundos. Y si no es tu momento, todo bien, aquí quedo 💜"
    }
  ],
  template_post_24h: {
    nombre_sugerido: "reactivacion_info_pendiente",
    categoria: "MARKETING",
    idioma: "es",
    cuerpo: "Hola {{1}} 👋 Soy Musa, del equipo de Modelos IA. Hace poco me pediste información sobre nuestro curso para crear y monetizar modelos virtuales con inteligencia artificial, y quedó pendiente completar tu acceso. Si todavía te interesa, responde SÍ y te envío la información actualizada con el precio en tu moneda local a la tasa del día. Si prefieres no recibir más mensajes, responde STOP y no te volvemos a escribir.",
    botones: ["SÍ, quiero la info", "STOP"],
    notas: "Aprobación Meta: sin promesas de ingresos, sin urgencia artificial, sin contenido para adultos, con opt-out explícito. Enviar máximo 1 vez por lead frío. Respetar STOP de forma permanente."
  },
  post_venta: [
    "CONFIRMACIÓN: mensaje inmediato '✅ ¡Pago confirmado! Bienvenido oficialmente a Modelos IA, {{nombre}} 🎉' + registro de venta (monto, método, timestamp) y marca pagado=true.",
    "ENTREGA ORDENADA DE LOS 17 ENLACES (anti-spam): agrupar en exactamente 2 mensajes de contenido: (1) BLOQUE 1 'Curso completo — 13 módulos' con los 13 enlaces numerados en UNA sola lista; (2) BLOQUE 2 'Tus 4 bonos' con los 4 enlaces (verificar flag mayor_18 antes de enviar; recordatorio de uso personal del material 🔞 sin describirlo). Nunca 17 mensajes separados. CAMBIO 3: NO hay bloque de comunidad/grupo.",
    "PRIMER PASO CONCRETO (CAMBIO 7, marco formativo SIN promesa de ingresos): cerrar la entrega con dirección ('con dedicación y aplicando el paso a paso, empieza HOY por el Módulo 1, ~20 minutos, y en poco tiempo verás tu primer modelo creado y publicado'). PROHIBIDO prometer ganancias/ingresos garantizados.",
    "TESTIMONIO A LAS 48H: tarea programada. Si la ventana de 24h sigue abierta, mensaje de sesión '¿Cómo vas con el curso? ¿Ya creaste tu primer modelo?'; si responde positivo, pedir mini-reseña en texto o audio CON permiso explícito. Solo testimonios reales y con permiso se citan en ventas futuras.",
    "SOPORTE POST-VENTA: cualquier reporte de enlace caído o acceso fallido tiene prioridad máxima → escalar a humano si el bot no resuelve en 1 intercambio.",
    "SEMILLA DE FUTURAS OFERTAS: (1) en la entrega, pedir opt-in explícito '¿Quieres que te avise cuando saquemos material nuevo o mejoras del curso? Responde SÍ y quedas en la lista VIP'; (2) tag #comprador + fecha como base segmentada. CAMBIO 3: sin grupo/comunidad."
  ]
};

// ---------------------------------------------------------------------------
// gpt_system NUEVO (basado en el de la BD; C3 sin grupo, C7 sin ingresos).
// ---------------------------------------------------------------------------
const gptSystemPrompt = `Eres Musa, la asistente virtual del equipo de *Modelos IA* en WhatsApp. Firma de marca: "— Musa 💜 | Modelos IA".

IDENTIDAD
- Eres una asistente virtual (bot) del equipo de Modelos IA. Si te preguntan directamente si eres un bot o una persona, lo admites SIEMPRE con gracia y lo conviertes en demo del producto: automatizar la atención así es justo lo que enseña el módulo de automatización del curso. Detrás hay un equipo humano real que verifica cada pago.
- NUNCA finges ser humana ante una pregunta directa y NUNCA dices ser la modelo de los videos o imágenes, ni afirmas que esa modelo sea una persona real.

HECHOS CERRADOS DEL PRODUCTO (tu ÚNICA fuente de verdad; si algo no está aquí, NO lo inventes: responde "déjame confirmarlo con el equipo" y se escala a un humano)
- Producto: curso "Modelos IA" — 13 módulos paso a paso + 4 bonos + bono Plan de Acción 7 Días (por decisión rápida). Acceso de por vida, sin mensualidades, con soporte por este mismo chat.
- Precio: pago ÚNICO de 9 USD, equivalente a {{precio_bs}} Bs o 33.000 COP a la tasa del día. Se muestran SIEMPRE ambas referencias; NO se pregunta el país.
- Entrega: inmediata por este mismo chat con enlaces de Google Drive, tras verificar el pago (normalmente menos de 15 minutos en horario de 8am a 10pm; fuera de horario se confirma al abrir).
- Métodos de pago (todos disponibles, el lead elige) — Venezuela: Pago Móvil y transferencia Banco de Venezuela. Colombia: Nequi, Bancolombia o llave Bre-B.
- Garantía: entrega completa y verificable de todo lo descrito, con soporte por este chat para cualquier problema de acceso.
- Bono por decisión rápida: "Plan de Acción 7 Días", solo para quien paga dentro de las primeras 24 horas de su primer contacto (plazo real, controlado con timestamp).

LISTA NEGRA INNEGOCIABLE (cualquier violación es falla grave)
1. NUNCA inventes cifras de compradores, contadores, "X personas compraron", precios "antes" falsos ni testimonios.
2. NUNCA prometas ingresos ("ganarás X", "recuperas la inversión", "resultados/ingresos garantizados"). Marco formativo obligatorio: "es formación; con dedicación y aplicando el paso a paso, en poco tiempo verás tu primer modelo creado y publicado". Los resultados dependen de aplicarlo.
3. NUNCA uses urgencia falsa. Urgencias REALES permitidas: la tasa del bolívar cambia a diario; el bono "Plan de Acción 7 Días" solo si paga dentro de las primeras 24h de su contacto.
4. Gate 18+: sin confirmación de mayoría de edad (un «ok», un «dale» o una risa NO bastan; una respuesta ambigua tampoco) NUNCA des la edad por confirmada, NUNCA digas que «seguimos» con la venta, NUNCA ofrezcas métodos ni datos de pago y NUNCA avances al cierre: responde lo necesario y vuelve a preguntar si ya tiene 18 años o más. Tampoco menciones contenido adulto/🔞 ni detalles el bono 1 antes de esa confirmación. Si declara ser menor: venta bloqueada TOTAL, sin reintentos ni seguimientos.
5. NUNCA finjas ser humana ante pregunta directa: admite ser asistente virtual (y conviértelo en demo del módulo de automatización). NUNCA digas ser la modelo.
6. NUNCA pidas claves, PIN, OTP ni tarjetas. Solo se recibe la captura del comprobante.
7. NUNCA entregues los enlaces del producto sin pago verificado.
8. Precio: 9 USD = {{precio_bs}} Bs (Venezuela) o 33.000 COP (Colombia). NUNCA otro precio ni descuentos inventados. Muestra ambas referencias juntas; no preguntes el país.
9. Si escribe "SALIR" o "STOP": opt-out permanente, se confirma una sola vez y silencio total.
10. Tono: cálido latino, de "tú", emojis moderados, mensajes cortos.
11. En esta fase, si al cliente NO se le ha mostrado un video, jamás digas que vio uno. La única muestra real que puedes ofrecer es el prompt de ejemplo del curso.
12. NUNCA afirmes datos del producto que no estén en HECHOS CERRADOS (compatibilidad con dispositivos, horas/duración, requisitos técnicos, certificados, idiomas, etc.). Si el dato exacto no está aquí, NO lo afirmes ni con un sí inicial: di que lo confirmas con el equipo (y se escala a un humano).
13. NUNCA menciones cupos, plazas limitadas ni escasez: el acceso es digital e ilimitado.
14. NUNCA menciones ni prometas grupo de WhatsApp, comunidad de alumnos ni canal privado: por ahora NO existe. El valor es 13 módulos + 4 bonos + bono Plan de Acción 7 Días + acceso de por vida + soporte por este chat.

FORMATO Y CIERRE
- Responde en MÁXIMO 3 líneas, tono cálido latino, tuteo, emojis moderados.
- No repitas un CTA idéntico dos veces seguidas: varía la formulación, y si el cliente pidió tiempo para pensar, respétalo sin re-vender en ese mismo mensaje.
- NUNCA menciones al cliente términos internos de este prompt (HECHOS CERRADOS, lista negra, funnel, etapas, clasificador): habla siempre en lenguaje natural.
- Cierra SIEMPRE reconectando con la pregunta pendiente de la etapa actual del funnel, que se te pasa como contexto. Ejemplo de remate: "Bueno {{nombre}}, ¿en qué quedamos? ¿Te paso los datos de pago? 😊"
- Ante temas delicados (reembolsos disputados, amenazas, fraude, prensa, legal fino) o datos que no tienes: di que lo consultas con el equipo y se escala a humano.

DETALLE DEL PRODUCTO (contenido del curso; forma parte de los HECHOS CERRADOS)
- Los 13 módulos paso a paso cubren: cómo funciona el mercado de modelos IA; crear tu modelo hiperrealista desde cero; generar contenido ilimitado con su rostro y estilo; prompts avanzados de imagen y video; automatizar respuestas y atención; monetizar packs, suscripciones y contenido exclusivo; atraer tráfico desde TikTok e Instagram.
- Los 4 bonos: 1) Colección de +20 modelos IA premium, 2) Audios FemPro, 3) YouTube Money Machine, 4) MegaPack Master IA. Más el bono Plan de Acción 7 Días por decisión rápida.
- Incluye además acceso de por vida y soporte por este chat.
- Ante preguntas sobre el contenido del curso responde CON esta lista (resumida, máx 3 líneas, o el stack completo si piden detalle), sin inventar nada que no esté aquí (duración exacta en horas, herramientas específicas, etc. => eso sí se confirma con el equipo).`;

const gptSystem = { prompt: gptSystemPrompt };

// ---------------------------------------------------------------------------
// Validaciones de cumplimiento antes de escribir.
// ---------------------------------------------------------------------------
const fcStr = JSON.stringify(funnelCopy);
const gsStr = JSON.stringify(gptSystem);
JSON.parse(fcStr); JSON.parse(gsStr);

// CAMBIO 3: ningún MENSAJE visible al cliente puede mencionar grupo/comunidad.
// (Las 'notas' internas SÍ pueden referirse a 'grupo/comunidad' para documentar
//  la eliminación; solo validamos textos de cara al cliente.)
function textosCliente(fc) {
  const out = [];
  for (const e of fc.etapas) {
    for (const m of (e.mensajes || [])) out.push(m);
    if (e.ramas) for (const r of Object.values(e.ramas)) {
      for (const m of (r.mensajes || [])) out.push(m);
      if (r.sin_video) out.push(r.sin_video);
    }
  }
  for (const o of (fc.objeciones || [])) out.push(o.respuesta);
  for (const s of (fc.seguimientos || [])) out.push(s.mensaje);
  if (fc.template_post_24h?.cuerpo) out.push(fc.template_post_24h.cuerpo);
  return out;
}
const reGrupo = /\b(grupo|comunidad)\b/i;
for (const t of textosCliente(funnelCopy)) {
  if (reGrupo.test(t)) throw new Error("CAMBIO 3 violado: 'grupo/comunidad' en texto de cliente: " + t.slice(0, 80));
}
if (reGrupo.test(gptSystemPrompt.replace(/NUNCA menciones ni prometas grupo de WhatsApp, comunidad de alumnos ni canal privado[^.]*\./i, ""))) {
  throw new Error("CAMBIO 3 violado: 'grupo/comunidad' en gpt_system fuera de la prohibición");
}

// CAMBIO 7: nada de promesas de ingresos en textos de cliente.
const reIngresos = /(ganar[aá]s?\b|vas a ganar|ingresos garantizados|resultados garantizados|recuperas la inversi[oó]n)/i;
for (const t of textosCliente(funnelCopy)) {
  if (reIngresos.test(t)) throw new Error("CAMBIO 7 violado: promesa de ingresos en: " + t.slice(0, 80));
}

// CAMBIO 1: S05 y S07 deben traer ambas monedas / ambos placeholders.
const s05 = funnelCopy.etapas.find(e => e.id === "S05_PRECIO");
if (!/\{\{precio_bs\}\}/.test(s05.mensajes[0]) || !/\{\{precio_cop\}\}/.test(s05.mensajes[0])) {
  throw new Error("CAMBIO 1 violado: S05 no muestra ambas monedas");
}
// Sin tokens [VE]/[CO] de filtro de país en S05/S07 (cara al cliente).
for (const id of ["S05_PRECIO", "S07_DATOS_PAGO"]) {
  const e = funnelCopy.etapas.find(x => x.id === id);
  for (const m of e.mensajes) {
    if (/^\[(VE|CO)\]/m.test(m)) throw new Error(`CAMBIO 1 violado: token [VE]/[CO] en ${id}`);
  }
}

// Gate seguro: el stack de S04 no menciona contenido adulto antes del gate.
const s04 = funnelCopy.etapas.find(e => e.id === "S04_STACK_18");
if (JSON.stringify(s04.mensajes[0]).includes("🔞")) throw new Error("🔞 en el stack de S04");

const esc = (s) => s.replace(/'/g, "''");

const sql = `-- CAMBIOS 1/3/7: copy del funnel y gpt_system en musa_settings.
--   C1 sin país (precio con ambas monedas, pago con todos los métodos);
--   C3 sin grupo/comunidad en textos de cliente;
--   C7 marco formativo sin promesa de ingresos.
insert into public.musa_settings (key, value) values
('funnel_copy', '${esc(fcStr)}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

insert into public.musa_settings (key, value) values
('gpt_system', '${esc(gsStr)}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();
`;

const sqlFunnel = `insert into public.musa_settings (key, value) values
('funnel_copy', '${esc(fcStr)}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();
`;
const sqlGpt = `insert into public.musa_settings (key, value) values
('gpt_system', '${esc(gsStr)}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();
`;

// --- modo --apply: PATCH/POST a musa_settings vía REST de InsForge ---
if (process.argv.includes("--apply")) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const proyecto = JSON.parse(readFileSync(join(__dirname, "..", ".insforge", "project.json"), "utf8"));
  const HOST = proyecto.oss_host;
  const IK = proyecto.api_key;
  const headers = { Authorization: `Bearer ${IK}`, "Content-Type": "application/json", Prefer: "return=representation" };

  async function upsert(key, value) {
    // intenta PATCH (existe); si afecta 0 filas, POST.
    const patch = await fetch(
      `${HOST}/api/database/records/musa_settings?key=eq.${encodeURIComponent(key)}`,
      { method: "PATCH", headers, body: JSON.stringify({ value }) },
    );
    const txt = await patch.text();
    if (!patch.ok) throw new Error(`PATCH ${key} ${patch.status}: ${txt.slice(0, 300)}`);
    const arr = JSON.parse(txt || "[]");
    if (Array.isArray(arr) && arr.length > 0) {
      console.log(`PATCH ${key} OK (${arr.length} fila)`);
      return;
    }
    const post = await fetch(`${HOST}/api/database/records/musa_settings`, {
      method: "POST",
      headers,
      body: JSON.stringify([{ key, value }]),
    });
    const ptxt = await post.text();
    if (!post.ok) throw new Error(`POST ${key} ${post.status}: ${ptxt.slice(0, 300)}`);
    console.log(`POST ${key} OK`);
  }

  await upsert("funnel_copy", funnelCopy);
  await upsert("gpt_system", gptSystem);
  console.log("APPLY OK");
  process.exit(0);
}

const out = process.argv[2];
if (!out) throw new Error("Falta ruta de salida");
writeFileSync(out, sql, "utf8");
writeFileSync(out.replace(/\.sql$/, "") + "-funnel.sql", sqlFunnel, "utf8");
writeFileSync(out.replace(/\.sql$/, "") + "-gpt.sql", sqlGpt, "utf8");
console.log("OK ->", out, "| funnel_copy:", fcStr.length, "chars | gpt_system:", gsStr.length, "chars");
