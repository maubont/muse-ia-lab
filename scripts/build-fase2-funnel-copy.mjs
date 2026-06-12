// ⚠️ ADVERTENCIA (12-jun-2026): la FUENTE DE VERDAD del gpt_system es la fila
// 'gpt_system' en musa_settings (BD) — fue parcheada en vivo con bloques nuevos
// (REGISTRO DE PAIS, DETALLE DEL PRODUCTO, acuses de escalado). Este script tiene
// una versión VIEJA: NO re-ejecutar ni aplicar su SQL sin antes sincronizarlo con
// la BD (select value->>'prompt' from musa_settings where key='gpt_system').
//
// Genera la migración fase2-funnel-copy a partir del copy transformado.
// Transformaciones vs investigacion/funnel-ventas.json:
//  - Valentina/Vale -> Musa (firma "— Musa 💜 | Modelos IA")
//  - S04: stack sin 🔞 ni "para adultos"; gate 18+ DESPUÉS del stack con texto aprobado
//  - S02: reestructurado en ramas A/B/C, cada una con campo "sin_video" (Fase 2 sin video)
//  - Se elimina "Daviplata" (no existe cuenta configurada en cuentas_co)
//  - Placeholders {{nombre}}, {{precio_bs}}, {{precio_cop}}, {{cuentas_venezuela}},
//    {{cuentas_colombia}}, {{link_grupo}}, {{hora_limite}} se conservan tal cual.
import { writeFileSync } from "node:fs";

const BRIDGE = "Te tengo una sorpresa preparada para más adelante 😉 Pero primero lo importante:";

const funnelCopy = {
  version: "fase2-2026-06-12",
  etapas: [
    {
      id: "S00_LLEGADA",
      objetivo: "Registrar el lead, capturar metadatos (nombre de perfil de WhatsApp, ad_id/referral del anuncio CTWA, timestamp para la ventana del bono de acción rápida) y disparar el saludo en menos de 60 segundos.",
      disparador: "Primer mensaje entrante de un número sin estado previo (típicamente el prellenado '¡Hola! Quiero más información.').",
      mensajes: [],
      notas: "Sin mensaje propio: es un estado interno. Acciones: crear lead en Postgres (InsForge), guardar profile_name crudo, evaluar usabilidad del nombre con regex + lista de nombres de pila LATAM (rechazar: emojis, números, palabras de negocio, frases, >2 palabras raras), setear flags avatar_enviado=false, bono_rapido_hasta=now+24h. Transición inmediata a S01_SALUDO."
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
      notas: "Los 3 mensajes salen seguidos con 1-2s de separación (efecto tecleo). Transición automática a S02_AVATAR sin esperar respuesta. Fase 2 (sin video): el motor puede omitir el tercer mensaje y encadenar directo con el puente sin_video de S02 para no prometer una revelación inmediata."
    },
    {
      id: "S02_AVATAR",
      objetivo: "MOMENTO AVATAR (solo UNA vez por lead, flag avatar_enviado): demostrar el producto en vivo con el video de ~6s del avatar saludando por nombre, y conectarlo con 'esto lo vas a saber crear tú'. En Fase 2 (sin video) cada rama usa su mensaje sin_video como puente S01→S03.",
      disparador: "Transición automática desde S01_SALUDO. Rama A: nombre de perfil usable → enviar video personalizado. Rama B: nombre no usable → preguntar el nombre primero. Rama C: hay nombre pero no existe video para ese nombre → video genérico.",
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
      notas: "Regla dura: una sola vez por lead (si el lead vuelve días después, NO se reenvía). El backend mantiene una biblioteca de videos pre-renderizados por nombre frecuente (top ~200 nombres VE/CO) + 1 genérico; cron de InsForge puede encolar la generación de nombres nuevos para futuros leads. Tras el mensaje puente, transición automática a S03_PAIS. Fase 2: el video llega en Fase 3; usar sin_video (no promete video) y pasar directo a S03_PAIS."
    },
    {
      id: "S03_PAIS",
      objetivo: "Calificación ligera: identificar país (Venezuela/Colombia/otro) para elegir moneda, monto y cuentas de pago. Una sola pregunta, cero interrogatorio.",
      disparador: "Transición automática desde S02_AVATAR (3-4s después del mensaje puente).",
      mensajes: [
        "Cuéntame algo rapidito para darte la info exacta de tu zona: ¿me escribes desde *Venezuela* 🇻🇪 o desde *Colombia* 🇨🇴?",
        "[SI RESPONDE OTRO PAÍS] ¡Qué chévere, también te puedo atender! 🙌 El curso funciona desde cualquier país (todo es online). Para el pago te confirmo en un momento las opciones disponibles para tu zona, ¿vale? Mientras, déjame contarte qué incluye 👇"
      ],
      notas: "Usar botones/quick-reply de WhatsApp si la línea los soporta ('Venezuela 🇻🇪' / 'Colombia 🇨🇴'). Guardar flag pais. 'Otro país' → tag #otro_pais y escalar a humano SOLO el tema método de pago (el dueño define si habilita Binance/PayPal); el funnel continúa normal con precio en USD. Respuesta → S04_STACK_18."
    },
    {
      id: "S04_STACK_18",
      objetivo: "Stack de valor compacto (13 módulos + 4 bonos + comunidad) y confirmación de mayoría de edad DESPUÉS del stack y ANTES de cualquier detalle del material para adultos.",
      disparador: "Respuesta de país recibida en S03_PAIS.",
      mensajes: [
        "Mira TODO lo que incluye *Modelos IA* 👇\n\n🤖 *13 módulos paso a paso:*\n• Cómo funciona el mercado de modelos IA 📊\n• Crear tu modelo hiperrealista desde cero\n• Generar contenido ilimitado con su rostro y estilo\n• Prompts avanzados de imagen y video\n• Automatizar respuestas y atención (como esta 😉)\n• Monetizar packs, suscripciones y contenido exclusivo\n• Atraer tráfico desde TikTok e Instagram\n\n🎁 *Y además 4 bonos:*\n1️⃣ Colección de +20 modelos IA premium\n2️⃣ Audios FemPro\n3️⃣ YouTube Money Machine\n4️⃣ MegaPack Master IA\n\n👥 Más acceso al *grupo privado de alumnos* para resolver dudas y compartir avances.",
        "Eso sí, importante ⚠️: parte del material es exclusivo para mayores de edad. ¿Me confirmas que ya tienes 18 años o más?",
        "[SI RESPONDE QUE ES MENOR] Te agradezco un montón la sinceridad 🙏 Este programa incluye material exclusivo para mayores de edad, así que solo puedo venderlo a partir de los 18. Cuando los cumplas, aquí estaré. ¡Cuídate mucho! 💜"
      ],
      notas: "Si confirma 18+ → flag mayor_18=true → S05_PRECIO. Si dice ser menor → estado terminal S92_MENOR (tag #menor, bloquear venta TOTAL, NO insistir, NO seguimientos). Si evade la pregunta, GPT responde lo que haya preguntado y re-pregunta la confirmación: sin confirmación explícita no se avanza. El copy del chat jamás menciona contenido adulto antes de mayor_18=true: el bono 1 se lista solo como 'Colección de +20 modelos IA premium' y cualquier detalle del material para adultos existe únicamente después de la confirmación."
    },
    {
      id: "S05_PRECIO",
      objetivo: "Revelar el precio único de 9 USD con el anclaje honesto (antes se vendía por partes, hoy todo junto) y el equivalente en moneda local.",
      disparador: "Confirmación 18+ recibida en S04_STACK_18.",
      mensajes: [
        "¿Y sabes qué es lo mejor? Antes el curso y los bonos se vendían por separado. Hoy TODO va junto en un único pago de *9 USD* 💥\n\n✅ 13 módulos completos\n✅ Los 4 bonos\n✅ Grupo privado de alumnos\n✅ Acceso de por vida, sin mensualidades\n\n[VE] En bolívares son *{{precio_bs}} Bs* a la tasa de hoy 🇻🇪\n[CO] En pesos son *{{precio_cop}} COP* 🇨🇴",
        "Y apenas confirme tu pago, te entrego TODO por aquí mismo: enlaces directos de Google Drive, sin esperas ni trámites 🚀"
      ],
      notas: "Mostrar solo la línea de moneda del país del lead. La tasa en Bs se actualiza a diario vía cron (InsForge) — esto habilita la urgencia REAL del seguimiento de 20h. Transición automática a S06_CIERRE."
    },
    {
      id: "S06_CIERRE",
      objetivo: "Pedir la venta de forma directa y sin presión falsa: una pregunta de cierre clara.",
      disparador: "Transición automática desde S05_PRECIO (2-3s después).",
      mensajes: [
        "¿Te animas a empezar hoy, {{nombre}}? 😊 ¿Te paso los datos de pago?"
      ],
      notas: "SÍ/dale/ok → S07_DATOS_PAGO. Objeción → matriz de objeciones (respuesta exacta) y re-cierre suave. Pregunta fuera de guion → S90_FALLBACK_GPT. Silencio → S93_FRIO (seguimientos 30min/4h/20h). NUNCA repetir la pregunta de cierre más de 2 veces seguidas sin aportar algo nuevo (muestra, beneficio, respuesta)."
    },
    {
      id: "S07_DATOS_PAGO",
      objetivo: "Entregar los datos de pago del país correcto, el monto exacto y la instrucción clara de enviar la captura.",
      disparador: "Aceptación del cierre ('sí', 'dale', 'cómo pago', 'pásame los datos') en cualquier etapa posterior al precio.",
      mensajes: [
        "[VE] ¡De una, {{nombre}}! 🙌 Estos son los datos para tu pago de *{{precio_bs}} Bs* (9 USD a tasa del día):\n\n{{cuentas_venezuela}}\n\nCuando hagas el Pago Móvil o la transferencia, envíame la *captura del comprobante* por aquí 📸 y lo verifico enseguida.",
        "[CO] ¡De una, {{nombre}}! 🙌 Estos son los datos para tu pago de *{{precio_cop}} COP*:\n\n{{cuentas_colombia}}\n\nCuando hagas la transferencia (Nequi, Bancolombia o llave Bre-B), envíame la *captura del comprobante* por aquí 📸 y lo verifico enseguida."
      ],
      notas: "Transición a S08_ESPERA_CAPTURA. Las cuentas viven en musa_settings (cuentas_ve/cuentas_co) para rotarlas sin tocar código. El bot JAMÁS pide datos de tarjeta, claves ni códigos OTP: solo la captura."
    },
    {
      id: "S08_ESPERA_CAPTURA",
      objetivo: "Sostener al lead durante el pago, resolver dudas operativas de la transferencia y recibir la imagen del comprobante.",
      disparador: "Entrada automática tras S07_DATOS_PAGO. Sub-disparador de recordatorio: 15 minutos sin imagen recibida.",
      mensajes: [
        "[RECORDATORIO 15 MIN] ¿Cómo vas con el pago, {{nombre}}? 😊 Si te surgió algún detalle con la transferencia (banco caído, datos, monto), dime y lo resolvemos juntos.",
        "[SI ENVÍA TEXTO EN VEZ DE IMAGEN, ej. 'ya pagué'] ¡Buenísimo! 🙌 Envíame la captura del comprobante por aquí mismo para verificarlo y entregarte todo de una vez 📸"
      ],
      notas: "Imagen recibida → S09_VERIFICACION. Texto/duda → GPT con contexto de pagos (puede explicar cómo hacer un Pago Móvil o usar llave Bre-B en pasos genéricos) y re-pedir la captura. 45 min sin nada → pasa al circuito S93_FRIO con copy adaptado ('quedó pendiente tu pago')."
    },
    {
      id: "S09_VERIFICACION",
      objetivo: "Acusar recibo de la captura al instante, fijar expectativa REAL de tiempo y validar el pago (humano u OCR asistido) antes de entregar.",
      disparador: "Mensaje entrante con imagen estando en S08_ESPERA_CAPTURA (o en cualquier estado posterior al precio).",
      mensajes: [
        "¡Recibido, {{nombre}}! 🙌 Dame unos minutos mientras verifico tu pago ✅ Normalmente tarda menos de 15 minutos (en horario de 8am a 10pm).",
        "[FUERA DE HORARIO] ¡Recibido, {{nombre}}! 🙌 Tu comprobante quedó en cola. Nuestro horario de verificación es de 8am a 10pm, así que apenas abramos mañana lo confirmo y te entrego TODO de inmediato. Tu acceso está asegurado, tranqui 💜",
        "[COMPROBANTE ILEGIBLE O NO CUADRA] Mmm, no logro validar este comprobante 🤔 ¿Me confirmas el *número de referencia*, el *banco desde el que pagaste* y la *hora* de la operación? Con eso lo reviso de nuevo.",
        "[PAGO INCOMPLETO] {{nombre}}, veo que el monto no coincide con el total ({{precio_bs}} Bs / {{precio_cop}} COP). ¿Me ayudas completando la diferencia y me envías esa captura? Apenas cuadre, te entrego todo 🙌"
      ],
      notas: "Flujo operativo: la captura se sube a Storage (InsForge), edge function notifica al verificador humano (o corre OCR para pre-validar referencia/monto/fecha) y el humano aprueba con un toque. Aprobado → S10_ENTREGA. Sospecha de captura falsa/editada → tag #fraude y escalar a S91_HUMANO sin acusar al cliente ('necesito validar un detalle adicional con el equipo, ya te confirmo'). Prometer SOLO tiempos que se cumplen: la promesa de 15 min exige cobertura real en ese horario."
    },
    {
      id: "S10_ENTREGA",
      objetivo: "Confirmar el pago, entregar los 17 enlaces ordenados en 3 bloques (sin parecer spam), invitar al grupo y dejar al alumno con un primer paso concreto.",
      disparador: "Verificación aprobada en S09_VERIFICACION.",
      mensajes: [
        "✅ ¡Pago confirmado! Bienvenido oficialmente a *Modelos IA*, {{nombre}} 🎉 Hiciste una gran inversión en ti.",
        "Te entrego todo organizado en *3 bloques* para que no se te pierda nada. Tip: fija este chat o guarda los enlaces en tus mensajes destacados 📌",
        "📚 *BLOQUE 1 — Curso completo (13 módulos):*\n[ENTREGA_LINKS:modulos_1_13]",
        "🎁 *BLOQUE 2 — Tus 4 bonos:*\n[ENTREGA_LINKS:bonos_1_4]\n\n(Recuerda: el material 🔞 es de uso personal y solo para adultos)",
        "👥 *BLOQUE 3 — Tu comunidad:*\nÚnete al grupo privado de alumnos aquí: {{link_grupo}}\nAhí compartimos avances, resolvemos dudas y los alumnos se enteran PRIMERO de todo lo nuevo.",
        "Mi consejo para arrancar 💪: empieza HOY por el *Módulo 1* (te toma ~20 minutos) y mañana ya estarás creando tu primer modelo. Cualquier duda, me escribes por aquí. ¡Nos vemos adentro! — Musa 💜 | Modelos IA"
      ],
      notas: "Los enlaces se agrupan en 2 mensajes (módulos / bonos) usando listas dentro del mensaje, NUNCA 17 mensajes separados (parece spam y degrada la calidad del número ante Meta). Verificar que mayor_18=true antes de soltar el Bloque 2 (si por algún camino raro no está confirmado, confirmar antes de entregar bonos). Marcar pagado=true, programar tarea a 48h para testimonio. Transición a S11_POSTVENTA."
    },
    {
      id: "S11_POSTVENTA",
      objetivo: "Retener, generar testimonios reales y sembrar futuras ofertas sin quemar el canal.",
      disparador: "48h después de la entrega (tarea programada con cron de InsForge). Si la ventana de 24h está cerrada, usar template aprobado de seguimiento post-compra.",
      mensajes: [
        "[48H — DENTRO DE VENTANA] Hola {{nombre}} 😊 ¿Cómo vas con el curso? ¿Ya creaste tu primer modelo? Cuéntame, me encanta ver los avances 👀",
        "[SI RESPONDE POSITIVO] ¡Qué nota! 🙌 ¿Me regalas una mini-reseña por aquí (texto o audio)? Con tu permiso la compartimos para que más personas se animen. Y si la subes al grupo, mejor todavía 💜",
        "[SI RESPONDE CON PROBLEMA] Gracias por contarme 🙏 Vamos a resolverlo: dime exactamente en qué módulo o enlace tuviste el detalle y lo arreglo de una."
      ],
      notas: "Los testimonios recibidos se guardan (texto + permiso explícito) en Postgres: SOLO estos se pueden citar en ventas futuras, siempre reales y con permiso. Siembra de ofertas: tag #comprador + mensaje ocasional en el grupo ('los alumnos se enteran primero'); pedir en la entrega permiso explícito para avisar de novedades (opt-in para futuros templates de marketing)."
    },
    {
      id: "S90_FALLBACK_GPT",
      objetivo: "Responder CUALQUIER pregunta fuera de guion con el modelo GPT y devolver la conversación al riel del estado pendiente.",
      disparador: "Mensaje entrante que el clasificador de la etapa actual no reconoce (no es respuesta esperada, ni objeción mapeada, ni captura).",
      mensajes: [
        "[PLANTILLA DE COMPORTAMIENTO, NO COPY FIJO] GPT responde en máximo 3 líneas, tono Musa, usando SOLO el contexto del producto (qué es, qué incluye, precio 9 USD, métodos de pago, entrega por Drive, garantía de entrega, comunidad) + lista negra de cumplimiento. Cierra SIEMPRE reconectando con la pregunta pendiente de la etapa actual. Ejemplo de remate: 'Bueno {{nombre}}, ¿en qué quedamos? ¿Te paso los datos de pago? 😊'"
      ],
      notas: "El system prompt del fallback vive en musa_settings clave gpt_system: identidad (asistente virtual llamada Musa, NO finge ser humana si le preguntan directo, NO es la modelo del video), hechos cerrados del producto, precios/cuentas como variables, lista negra completa, instrucción de NUNCA inventar datos del curso ni prometer ingresos. Si la confianza es baja o el tema es delicado (reembolsos, amenazas, fraude, prensa) → S91_HUMANO."
    },
    {
      id: "S91_HUMANO",
      objetivo: "Escalar a un humano del equipo sin romper la experiencia.",
      disparador: "Tag #fraude, #otro_pais (definir método de pago), solicitud explícita de hablar con una persona, queja fuerte, o baja confianza del fallback.",
      mensajes: [
        "Dame un momentico, {{nombre}} 🙏 Voy a consultar esto con el equipo para darte una respuesta exacta. Te escribo en un ratico por aquí mismo."
      ],
      notas: "Notificación push al operador (edge function → WhatsApp del dueño o panel). El bot pausa la automatización en ese chat hasta que el humano marque 'resuelto'."
    }
  ],
  objeciones: [
    {
      objecion: "¿Es estafa? / no confío",
      respuesta: "Te entiendo perfecto, {{nombre}}, en internet hay que cuidarse 🙏 Por eso mismo empezamos mostrándote el video: esa modelo la creamos con las mismas técnicas del curso, no es un truco. Y mira, te dejo una muestra real de lo que hay adentro 👇 [PROMPT_MUESTRA] Pruébalo tú mismo. Además la entrega es inmediata: pagas, verifico tu comprobante y recibes TODOS los enlaces por este mismo chat, así que puedes comprobarlo todo al instante. ¿Qué otra duda te queda?"
    },
    {
      objecion: "Está caro / no tengo plata",
      respuesta: "Tranquilo, te entiendo 🙏 Por eso el precio es el que es: 9 USD una sola vez ({{precio_bs}} Bs / {{precio_cop}} COP), menos de lo que cuesta una pizza 🍕, por 13 módulos + 4 bonos + comunidad, con acceso de por vida. No hay mensualidades ni cobros escondidos. Si hoy no puedes, no pasa nada: dime cuándo te queda mejor y te guardo la info actualizada. ¿Te parece?"
    },
    {
      objecion: "¿Me llega de inmediato?",
      respuesta: "¡Sí! 🚀 Apenas verifico tu comprobante (normalmente menos de 15 minutos en horario de 8am a 10pm), te entrego TODO por este mismo chat: los 13 módulos y los 4 bonos como enlaces directos de Google Drive, más el acceso al grupo de alumnos. Nada de esperar correos ni plataformas raras."
    },
    {
      objecion: "¿Sirve para principiantes?",
      respuesta: "Totalmente 💪 El curso arranca desde CERO: el módulo 1 te explica cómo funciona este mercado y de ahí vas paso a paso hasta crear tu primer modelo. No necesitas saber de diseño ni de programación, solo un celular o compu con internet. De hecho, la mayoría de los alumnos empiezan sin experiencia."
    },
    {
      objecion: "¿Funciona en mi país?",
      respuesta: "Sí 🌎 Todo el curso es online y las herramientas de IA que se enseñan funcionan desde cualquier país. La monetización también: las plataformas para vender contenido y atraer tráfico (TikTok, Instagram, etc.) están disponibles en Venezuela, Colombia y prácticamente toda LATAM. Lo único que cambia según tu país es el método de pago, y de eso me encargo yo 😉"
    },
    {
      objecion: "¿Puedo pagar en bolívares / en pesos?",
      respuesta: "¡Claro que sí! 🙌 En Venezuela 🇻🇪 pagas {{precio_bs}} Bs (el equivalente a 9 USD a la tasa de hoy) por Pago Móvil o transferencia Banco de Venezuela. En Colombia 🇨🇴 pagas {{precio_cop}} COP por Nequi, Bancolombia o llave Bre-B. ¿Te paso los datos?"
    },
    {
      objecion: "¿Qué incluye exactamente?",
      respuesta: "Te lo resumo completico 👇 *13 módulos*: mercado de modelos IA, creación de tu modelo hiperrealista desde cero, contenido ilimitado, prompts avanzados de imagen y video, automatización de respuestas, monetización de packs y suscripciones, y tráfico desde TikTok e Instagram. *4 bonos*: Colección de +20 modelos IA premium, Audios FemPro, YouTube Money Machine y MegaPack Master IA. Más el *grupo privado de alumnos*. Todo con acceso de por vida por un único pago de 9 USD."
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
      respuesta: "Buena pregunta 😄 Antes esto se vendía por partes (el curso por un lado, los bonos por otro). Decidimos juntarlo TODO a un precio que cualquiera en Venezuela o Colombia pueda pagar, porque el negocio crece con una comunidad grande de alumnos activos, no exprimiendo a cada uno. 9 USD, una vez, todo incluido. Sin letra pequeña."
    },
    {
      objecion: "Déjame pensarlo",
      respuesta: "¡Claro, {{nombre}}, tómate tu tiempo! 😊 Solo dos cositas para que las tengas en cuenta: el monto en bolívares se ajusta con la tasa del día, así que hoy queda en {{precio_bs}} Bs; y a quienes deciden el mismo día de su primer contacto les incluimos el *Plan de Acción 7 Días* de regalo (una guía extra que solo damos por decisión rápida, de verdad). Cualquier duda que te esté frenando, dímela con confianza, para eso estoy 💜"
    },
    {
      objecion: "¿Eres un bot?",
      respuesta: "Sí 😄 Soy Musa, la asistente virtual del equipo de Modelos IA. Y te cuento un secreto: automatizar la atención así, con IA, es UNA de las cosas que enseña el curso (módulo de automatización 😉). Detrás hay un equipo humano real que verifica cada pago y te apoya si algo se complica. ¿Seguimos? ¿Qué más quieres saber?"
    }
  ],
  seguimientos: [
    {
      retraso: "30 minutos sin respuesta (post-precio o post-cierre)",
      mensaje: "{{nombre}}, ¿quedaste con alguna duda? 😊 Pregúntame con confianza, para eso estoy. Te lo resumo en una línea: curso completo (13 módulos) + 4 bonos + comunidad, pago único de 9 USD, entrega inmediata por este chat. ¿Te paso los datos de pago?"
    },
    {
      retraso: "4 horas sin respuesta",
      mensaje: "Hola {{nombre}} 👋 Te dejo una muestra REAL de lo que hay dentro del curso para que lo veas con tus propios ojos 👇\n\n[PROMPT_MUESTRA]\n\nEse es solo UNO de los prompts del módulo de creación de modelos. Pruébalo gratis en cualquier IA de imágenes y me cuentas qué tal 😏 Imagínate con los 13 módulos completos. ¿Retomamos?"
    },
    {
      retraso: "20 horas sin respuesta (última ventana antes de las 24h)",
      mensaje: "{{nombre}}, paso a contarte dos cosas reales antes de cerrar tu chat de hoy 😊\n\n1️⃣ [SOLO VE] La tasa cambia cada día: hoy tu acceso queda en *{{precio_bs}} Bs*; mañana el monto se recalcula. / [SOLO CO] Tu acceso sigue disponible en *{{precio_cop}} COP*.\n2️⃣ A quienes confirman su pago dentro de las primeras 24 horas les incluimos de regalo el *Plan de Acción 7 Días* 🎁: una guía extra con el paso a paso exacto de tu primera semana. Es real y solo se entrega por decisión rápida (tu plazo vence hoy a las {{hora_limite}}).\n\nSi te animas, te paso los datos en 10 segundos. Y si no es tu momento, todo bien, aquí quedo 💜"
    }
  ],
  template_post_24h: {
    nombre_sugerido: "reactivacion_info_pendiente",
    categoria: "MARKETING",
    idioma: "es",
    cuerpo: "Hola {{1}} 👋 Soy Musa, del equipo de Modelos IA. Hace poco me pediste información sobre nuestro curso para crear y monetizar modelos virtuales con inteligencia artificial, y quedó pendiente completar tu acceso. Si todavía te interesa, responde SÍ y te envío la información actualizada con el precio en tu moneda local a la tasa del día. Si prefieres no recibir más mensajes, responde STOP y no te volvemos a escribir.",
    botones: ["SÍ, quiero la info", "STOP"],
    notas: "Aprobación Meta: sin promesas de ingresos, sin urgencia artificial, sin contenido para adultos, con opt-out explícito (obligatorio en marketing), variable {{1}} = nombre. Enviar máximo 1 vez por lead frío, entre 24 y 72h después del último mensaje; respetar STOP de forma permanente (flag opt_out en Postgres)."
  },
  post_venta: [
    "CONFIRMACIÓN: mensaje inmediato '✅ ¡Pago confirmado! Bienvenido oficialmente a Modelos IA, {{nombre}} 🎉' + registro de venta (monto, país, método, timestamp) en Postgres y marca pagado=true.",
    "ENTREGA ORDENADA DE LOS 17 ENLACES (anti-spam): agrupar en exactamente 3 mensajes de contenido: (1) BLOQUE 1 'Curso completo — 13 módulos' con los 13 enlaces numerados en UNA sola lista dentro de un mensaje; (2) BLOQUE 2 'Tus 4 bonos' con los 4 enlaces (verificar flag mayor_18 antes de enviar; recordatorio de uso personal del material 🔞 sin describirlo); (3) BLOQUE 3 'Comunidad' con {{link_grupo}}. Nunca 17 mensajes separados: degrada la calidad del número ante Meta y abruma al cliente. Precedido por el tip de fijar el chat/guardar enlaces.",
    "INVITACIÓN AL GRUPO: el grupo privado de WhatsApp es POST-venta (comunidad de alumnos). Copy: 'Únete aquí: {{link_grupo}} — ahí compartimos avances, resolvemos dudas y los alumnos se enteran PRIMERO de todo lo nuevo.' Registrar union_grupo cuando sea verificable.",
    "PRIMER PASO CONCRETO: cerrar la entrega con dirección ('empieza HOY por el Módulo 1, ~20 minutos, y mañana creas tu primer modelo'). Reduce arrepentimiento de compra y aumenta la probabilidad de testimonio.",
    "TESTIMONIO A LAS 48H: tarea programada (cron InsForge). Si la ventana de 24h sigue abierta, mensaje de sesión: '¿Cómo vas con el curso? ¿Ya creaste tu primer modelo?' y si responde positivo, pedir mini-reseña en texto o audio CON permiso explícito para compartirla. Si la ventana está cerrada, usar template UTILITY aprobado tipo seguimiento_alumno: 'Hola {{1}}, soy Musa de Modelos IA. Han pasado 2 días desde tu compra y quiero saber cómo vas con el curso y si necesitas ayuda con tu acceso. Responde y te leo.' Solo testimonios reales y con permiso se citan en ventas futuras.",
    "SOPORTE POST-VENTA: cualquier reporte de enlace caído o acceso fallido tiene prioridad máxima → escalar a humano si el bot no resuelve en 1 intercambio; un comprador frustrado en VE/CO se convierte en denuncia pública de estafa muy rápido.",
    "SEMILLA DE FUTURAS OFERTAS: (1) en la entrega, pedir opt-in explícito: '¿Quieres que te avise cuando saquemos material nuevo o mejoras del curso? Responde SÍ y quedas en la lista VIP' (habilita templates de marketing futuros con consentimiento); (2) tag #comprador + fecha en Postgres como base segmentada; (3) cultura en el grupo de que 'los alumnos se enteran primero', de modo que un futuro lanzamiento (curso avanzado, packs nuevos, servicio done-for-you) tenga canal caliente sin quemar el 1:1."
  ]
};

const gptSystemPrompt = `Eres Musa, la asistente virtual del equipo de *Modelos IA* en WhatsApp. Firma de marca: "— Musa 💜 | Modelos IA".

IDENTIDAD
- Eres una asistente virtual (bot) del equipo de Modelos IA. Si te preguntan directamente si eres un bot o una persona, lo admites SIEMPRE con gracia y lo conviertes en demo del producto: automatizar la atención así es justo lo que enseña el módulo de automatización del curso. Detrás hay un equipo humano real que verifica cada pago.
- NUNCA finges ser humana ante una pregunta directa y NUNCA dices ser la modelo de los videos o imágenes, ni afirmas que esa modelo sea una persona real.

HECHOS CERRADOS DEL PRODUCTO (tu ÚNICA fuente de verdad; si algo no está aquí, NO lo inventes: responde "déjame confirmarlo con el equipo" y se escala a un humano)
- Producto: curso "Modelos IA" — 13 módulos paso a paso + 4 bonos + grupo privado de alumnos. Acceso de por vida, sin mensualidades.
- Precio: pago ÚNICO de 9 USD. Venezuela: {{precio_bs}} Bs a la tasa del día. Colombia: 33.000 COP.
- Entrega: inmediata por este mismo chat con enlaces de Google Drive, tras verificar el pago (normalmente menos de 15 minutos en horario de 8am a 10pm; fuera de horario se confirma al abrir).
- Métodos de pago — Venezuela: Pago Móvil y transferencia Banco de Venezuela. Colombia: Nequi, Bancolombia o llave Bre-B.
- Garantía: entrega completa y verificable de todo lo descrito, con soporte por este chat para cualquier problema de acceso.
- Bono por decisión rápida: "Plan de Acción 7 Días", solo para quien paga dentro de las primeras 24 horas de su primer contacto (plazo real, controlado con timestamp).

LISTA NEGRA INNEGOCIABLE (cualquier violación es falla grave)
1. NUNCA inventes cifras de compradores, contadores, "X personas compraron", precios "antes" falsos ni testimonios.
2. NUNCA prometas ingresos ("ganarás X", "recuperas la inversión"). Marco obligatorio: "es formación, los resultados dependen de aplicarlo".
3. NUNCA uses urgencia falsa. Urgencias REALES permitidas: la tasa del bolívar cambia a diario; el bono "Plan de Acción 7 Días" solo si paga dentro de las primeras 24h de su contacto.
4. Gate 18+: NUNCA menciones contenido adulto/🔞 ni detalles el bono 1 antes de la confirmación de mayoría de edad. Si declara ser menor: venta bloqueada TOTAL, sin reintentos ni seguimientos.
5. NUNCA finjas ser humana ante pregunta directa: admite ser asistente virtual (y conviértelo en demo del módulo de automatización). NUNCA digas ser la modelo.
6. NUNCA pidas claves, PIN, OTP ni tarjetas. Solo se recibe la captura del comprobante.
7. NUNCA entregues los enlaces del producto sin pago verificado.
8. Precio: 9 USD = {{precio_bs}} Bs para Venezuela, 33.000 COP para Colombia. NUNCA otro precio ni descuentos inventados.
9. Si escribe "SALIR" o "STOP": opt-out permanente, se confirma una sola vez y silencio total.
10. Tono: cálido latino, de "tú", emojis moderados, mensajes cortos.

FORMATO Y CIERRE
- Responde en MÁXIMO 3 líneas, tono cálido latino, tuteo, emojis moderados.
- Cierra SIEMPRE reconectando con la pregunta pendiente de la etapa actual del funnel, que se te pasa como contexto. Ejemplo de remate: "Bueno {{nombre}}, ¿en qué quedamos? ¿Te paso los datos de pago? 😊"
- Ante temas delicados (reembolsos disputados, amenazas, fraude, prensa, legal fino) o datos que no tienes: di que lo consultas con el equipo y se escala a humano.`;

const gptSystem = { prompt: gptSystemPrompt };

// Validaciones antes de escribir
const fcStr = JSON.stringify(funnelCopy);
const gsStr = JSON.stringify(gptSystem);
JSON.parse(fcStr); JSON.parse(gsStr);
if (/Valentina|(?<![A-Za-zÁ-ú])Vale(?![A-Za-zÁ-ú])/i.test(fcStr.replace(/¿vale\?/g, ""))) {
  // "¿vale?" coloquial permitido; cualquier otro Vale/Valentina es error
  throw new Error("Queda una mención de Valentina/Vale en funnel_copy");
}
if (/Valentina/i.test(gsStr)) throw new Error("Valentina en gpt_system");
const s04 = funnelCopy.etapas.find(e => e.id === "S04_STACK_18");
if (JSON.stringify(s04).includes("🔞")) throw new Error("Emoji 🔞 en S04 (antes del gate)");
if (/adultos|\+18/.test(s04.mensajes[0])) throw new Error("Mención adulta en el stack de S04");

const esc = (s) => s.replace(/'/g, "''");

const sql = `-- Fase 2: copy completo del funnel en musa_settings + columnas de actividad en musa_leads.
-- El motor de conversación lee el copy de la BD para iterarlo sin redeploy.
-- Transformaciones vs investigacion/funnel-ventas.json:
--   * Valentina/Vale -> Musa (firma "— Musa 💜 | Modelos IA").
--   * S04: stack de bonos sin 🔞 ni "para adultos"; gate 18+ después del stack.
--   * S02: ramas A/B/C con campo sin_video (puente S01->S03 mientras no hay video, Fase 3).
--   * Sin "Daviplata" (no hay cuenta configurada en cuentas_co).

alter table public.musa_leads
  add column last_in_at timestamptz,
  add column last_out_at timestamptz,
  add column seguimientos_enviados int not null default 0;

insert into public.musa_settings (key, value) values
('funnel_copy', '${esc(fcStr)}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

insert into public.musa_settings (key, value) values
('gpt_system', '${esc(gsStr)}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();
`;

const out = process.argv[2];
if (!out) throw new Error("Falta ruta de salida");
writeFileSync(out, sql, "utf8");
console.log("OK ->", out, "| funnel_copy:", fcStr.length, "chars | gpt_system:", gsStr.length, "chars");
