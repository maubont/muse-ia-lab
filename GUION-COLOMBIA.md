# Guion de Musa — Colombia

> **GENERADO, no editar a mano.** `node next/scripts/generar-guion.mjs`
>
> Es el copy que hoy está en producción, renderizado con el mismo código
> que usa el bot para un lead de Colombia llamado «María». Sirve para revisar
> el guion de corrido y para portar el motor sin adivinar qué dice cada etapa.

**Fecha:** 2026-10-28 · **Precio:** 33.000 COP · **Etapas:** 13

---

## S00_LLEGADA

*Sin mensaje propio: estado interno. Acciones: crear lead, guardar profile_name crudo, evaluar usabilidad del nombre, flags avatar_enviado=false, bono_rapido_hasta=now+24h. CAMBIO 6: cualquier primer mensaje (texto o vacío) dispara la bienvenida. Transición inmediata a S01_SALUDO y de ahí, tras el momento avatar, DIRECTO a S04_GATE18 (sin etapa de país).*

_(etapa sin mensajes propios)_

## S01_SALUDO

*Los mensajes salen con efecto tecleo. Transición automática a S02_AVATAR sin esperar respuesta.*

**Mensaje 1**

```text
¡Hola! 😄 Qué bueno tenerte por aquí. Soy *Musa*, asesora de *Modelos IA* 💜
```

**Mensaje 2**

```text
Aquí vas a descubrir cómo crear modelos virtuales hiperrealistas con inteligencia artificial y monetizarlas en internet 💻✨
```

**Mensaje 3**

```text
Pero antes de contarte los detalles… déjame mostrarte algo que te va a encantar 👀 Dame unos segunditos ⏳
```


## S02_AVATAR

*Regla dura: una sola vez por lead. CAMBIO 1: tras el momento avatar (o el puente sin_video) se pasa DIRECTO a S04_GATE18; ya NO hay etapa de país.*

> El lead recibe **una** de estas 3 ramas, no todas.
>
> Están renderizadas con nombre «María». Cuál se usa depende de si el
> perfil de WhatsApp da un nombre de pila usable (ver las notas de la etapa).

**Rama «A»**

```text
¿Viste eso, María? 😏 Esa chica NO existe. Es un modelo creado 100% con inteligencia artificial… y te saludó por tu nombre. Eso exactamente es lo que vas a aprender a crear tú, paso a paso, aunque hoy no sepas nada de IA.
```

```text
Te tengo una sorpresa preparada para más adelante 😉 Pero primero lo importante:
```

**Rama «B»**

```text
Por cierto, ¿cómo te llamas? 😊 Quiero mostrarte algo especial y me gustaría hacerlo bien.
```

```text
¡Listo, María! Mira esto 👇
```

```text
Esa chica NO existe 🤯 Está creada 100% con inteligencia artificial: su cara, su voz, sus gestos… todo. Y eso exactamente es lo que vas a aprender a crear tú, paso a paso, aunque hoy estés empezando de cero.
```

```text
Te tengo una sorpresa preparada para más adelante 😉 Pero primero lo importante:
```

**Rama «C»**

```text
Mira esto 👇
```

```text
Esa chica NO existe 🤯 Está creada 100% con inteligencia artificial: su cara, su voz, sus gestos… todo. Y eso exactamente es lo que vas a aprender a crear tú, paso a paso, aunque hoy estés empezando de cero.
```

```text
Te tengo una sorpresa preparada para más adelante 😉 Pero primero lo importante:
```


## S04_STACK_18

*CAMBIO 2: la confirmación se infiere con IA (heurística + clasificador), no exige la palabra 'sí'. Solo 'es_mayor' → mayor_18=true → S05_PRECIO. 'es_menor' → S92_MENOR (bloqueo total). 'ambiguo' → re-preguntar con calidez, sin avanzar. CAMBIO 3: SIN grupo/comunidad en el stack. El bono Plan de Acción 7 Días SÍ se nombra como parte del valor.*

**Mensaje 1**

```text
Mira TODO lo que incluye *Modelos IA* 👇

🤖 *13 módulos paso a paso:*
• Cómo funciona el mercado de modelos IA 📊
• Crear tu modelo hiperrealista desde cero
• Generar contenido ilimitado con su rostro y estilo
• Prompts avanzados de imagen y video
• Automatizar respuestas y atención (como esta 😉)
• Monetizar packs, suscripciones y contenido exclusivo
• Atraer tráfico desde TikTok e Instagram

🎁 *Y además 4 bonos:*
1️⃣ Colección de +20 modelos IA premium
2️⃣ Audios FemPro
3️⃣ YouTube Money Machine
4️⃣ MegaPack Master IA

🎯 Y el bono *Plan de Acción 7 Días* si decides hoy: tu paso a paso para arrancar esta misma semana.

Todo con *acceso de por vida* y soporte por este mismo chat 💜
```

**Mensaje 2**

```text
Eso sí, importante ⚠️: parte del material es exclusivo para mayores de edad. ¿Me confirmas que ya tienes 18 años o más?
```

**Mensaje 3**

```text
Te agradezco un montón la sinceridad 🙏 Este programa incluye material exclusivo para mayores de edad, así que solo puedo venderlo a partir de los 18. Cuando los cumplas, aquí estaré. ¡Cuídate mucho! 💜
```


## S05_PRECIO

*Solo Colombia: precio fijo 33.000 COP (≈ 9 USD), sin Bs ni cron de tasa. Sin grupo/comunidad. Transición automática a S06_CIERRE.*

**Mensaje 1**

```text
¿Y sabes qué es lo mejor? TODO va junto en un único pago de *33.000 COP* (≈ *9 USD*) 💥

✅ 13 módulos completos
✅ Los 4 bonos
✅ Bono Plan de Acción 7 Días (por decisión rápida)
✅ Acceso de por vida, sin mensualidades
```

**Mensaje 2**

```text
Y apenas confirme tu pago, te entrego TODO por aquí mismo: enlaces directos de Google Drive, sin esperas ni trámites 🚀
```


## S06_CIERRE

*SÍ/dale/ok → S07_DATOS_PAGO. Objeción → matriz de objeciones y re-cierre suave. Pregunta fuera de guion → fallback GPT. NUNCA repetir la pregunta de cierre más de 2 veces seguidas sin aportar algo nuevo.*

**Mensaje 1**

```text
¿Te animas a empezar hoy, María? 😊 ¿Te paso los datos de pago?
```


## S07_DATOS_PAGO

*Solo Colombia. Si Wompi está activo (settings.pago.proveedor='wompi') el motor envía un link de pago firmado y la confirmación es automática por el webhook de eventos (no se pide captura). Si no, flujo manual: el motor inserta el bloque de cuentas Colombia (Nequi/Bancolombia/Bre-B) entre mensajes[0] y mensajes[1] y pide la captura. El bot JAMÁS pide tarjeta, claves ni OTP. Transición a S08_ESPERA_CAPTURA.*

**Mensaje 1**

```text
¡De una, María! 🙌 Tu acceso es de *33.000 COP* (≈ *9 USD*), pago único. Puedes pagar por el medio que más te sirva 👇
```

**Mensaje 2**

```text
Cuando hagas el pago, envíame la *captura del comprobante* por aquí 📸 y lo verifico enseguida.
```


## S08_ESPERA_CAPTURA

*Imagen recibida → S09_VERIFICACION. Texto/duda → GPT con contexto de pagos y re-pedir la captura.*

**Mensaje 1**

```text
¿Cómo vas con el pago, María? 😊 Si te surgió algún detalle con la transferencia (banco caído, datos, monto), dime y lo resolvemos juntos.
```

**Mensaje 2**

```text
¡Buenísimo! 🙌 Envíame la captura del comprobante por aquí mismo para verificarlo y entregarte todo de una vez 📸
```


## S09_VERIFICACION

*La captura se sube a Storage, un humano (u OCR) la valida. Aprobado → S10_ENTREGA. Prometer SOLO tiempos que se cumplen.*

**Mensaje 1**

```text
¡Recibido, María! 🙌 Dame unos minutos mientras verifico tu pago ✅ Normalmente tarda menos de 15 minutos (en horario de 8am a 10pm).
```

**Mensaje 2**

```text
¡Recibido, María! 🙌 Tu comprobante quedó en cola. Nuestro horario de verificación es de 8am a 10pm, así que apenas abramos mañana lo confirmo y te entrego TODO de inmediato. Tu acceso está asegurado, tranqui 💜
```

**Mensaje 3**

```text
Mmm, no logro validar este comprobante 🤔 ¿Me confirmas el *número de referencia*, el *banco desde el que pagaste* y la *hora* de la operación? Con eso lo reviso de nuevo.
```

**Mensaje 4**

```text
María, veo que el monto no coincide con el total (*33.000 COP*). ¿Me ayudas completando la diferencia y me envías esa captura? Apenas cuadre, te entrego todo 🙌
```


## S10_ENTREGA

*CAMBIO 3: SIN bloque de comunidad/grupo. Los enlaces se agrupan en 2 mensajes (módulos / bonos), nunca 17 separados. Verificar mayor_18=true antes del Bloque 2. CAMBIO 7: marco formativo, sin promesa de ingresos. Marcar pagado=true, programar tarea a 48h. Transición a S11_POSTVENTA.*

**Mensaje 1**

```text
✅ ¡Pago confirmado! Bienvenido oficialmente a *Modelos IA*, María 🎉 Diste un gran paso.
```

**Mensaje 2**

```text
Te entrego todo organizado en *2 bloques* para que no se te pierda nada. Tip: fija este chat o guarda los enlaces en tus mensajes destacados 📌
```

**Mensaje 3**

```text
📚 *BLOQUE 1 — Curso completo (13 módulos):*
```

**Mensaje 4**

```text
🎁 *BLOQUE 2 — Tus 4 bonos:*


(Recuerda: el material 🔞 es de uso personal y solo para adultos)
```

**Mensaje 5**

```text
Mi consejo para arrancar 💪: con dedicación y aplicando el paso a paso, empieza HOY por el *Módulo 1* (te toma ~20 minutos) y en poco tiempo verás tu primer modelo creado y publicado. Cualquier duda, me escribes por aquí. ¡Nos vemos adentro! — Musa 💜 | Modelos IA
```


## S11_POSTVENTA

*CAMBIO 3: sin grupo/comunidad. Solo testimonios reales y con permiso se citan en ventas futuras.*

**Mensaje 1**

```text
Hola María 😊 ¿Cómo vas con el curso? ¿Ya creaste tu primer modelo? Cuéntame, me encanta ver los avances 👀
```

**Mensaje 2**

```text
¡Qué nota! 🙌 ¿Me regalas una mini-reseña por aquí (texto o audio)? Con tu permiso la compartimos para que más personas se animen 💜
```

**Mensaje 3**

```text
Gracias por contarme 🙏 Vamos a resolverlo: dime exactamente en qué módulo o enlace tuviste el detalle y lo arreglo de una.
```


## S90_FALLBACK_GPT

*El system prompt del fallback vive en musa_settings clave gpt_system. Si la confianza es baja o el tema es delicado → S91_HUMANO.*

**Mensaje 1**

```text
GPT responde en máximo 3 líneas, tono Musa, usando SOLO el contexto del producto (qué es, qué incluye, precio 33.000 COP, métodos de pago, entrega por Drive, garantía de entrega) + lista negra de cumplimiento. Cierra SIEMPRE reconectando con la pregunta pendiente de la etapa actual.
```


## S91_HUMANO

*El bot pausa la automatización en ese chat hasta que el humano marque 'resuelto'.*

**Mensaje 1**

```text
Dame un momentico, María 🙏 Voy a consultar esto con el equipo para darte una respuesta exacta. Te escribo en un ratico por aquí mismo.
```


---

## Variante sin nombre usable

Cuando el perfil de WhatsApp no da un nombre de pila (apodos, emojis,
negocios), el bot no puede saludar por nombre. Estas son las frases cuyo
texto cambia, para revisar que no queden comas huérfanas:

- **S06_CIERRE**
  - con nombre: `¿Te animas a empezar hoy, María? 😊 ¿Te paso los datos de pago?`
  - sin nombre: `¿Te animas a empezar hoy? 😊 ¿Te paso los datos de pago?`
- **S07_DATOS_PAGO**
  - con nombre: `¡De una, María! 🙌 Tu acceso es de *33.000 COP* (≈ *9 USD*), pago único. Puedes pagar por el medio que más te sirva 👇`
  - sin nombre: `¡De una! 🙌 Tu acceso es de *33.000 COP* (≈ *9 USD*), pago único. Puedes pagar por el medio que más te sirva 👇`
- **S08_ESPERA_CAPTURA**
  - con nombre: `¿Cómo vas con el pago, María? 😊 Si te surgió algún detalle con la transferencia (banco caído, datos, monto), dime y lo resolvemos juntos.`
  - sin nombre: `¿Cómo vas con el pago? 😊 Si te surgió algún detalle con la transferencia (banco caído, datos, monto), dime y lo resolvemos juntos.`
- **S09_VERIFICACION**
  - con nombre: `¡Recibido, María! 🙌 Dame unos minutos mientras verifico tu pago ✅ Normalmente tarda menos de 15 minutos (en horario de 8am a 10pm).`
  - sin nombre: `¡Recibido! 🙌 Dame unos minutos mientras verifico tu pago ✅ Normalmente tarda menos de 15 minutos (en horario de 8am a 10pm).`
- **S09_VERIFICACION**
  - con nombre: `¡Recibido, María! 🙌 Tu comprobante quedó en cola. Nuestro horario de verificación es de 8am a 10pm, así que apenas abramos mañana lo confir`
  - sin nombre: `¡Recibido! 🙌 Tu comprobante quedó en cola. Nuestro horario de verificación es de 8am a 10pm, así que apenas abramos mañana lo confirmo y te`
- **S09_VERIFICACION**
  - con nombre: `María, veo que el monto no coincide con el total (*33.000 COP*). ¿Me ayudas completando la diferencia y me envías esa captura? Apenas cuadre`
  - sin nombre: `veo que el monto no coincide con el total (*33.000 COP*). ¿Me ayudas completando la diferencia y me envías esa captura? Apenas cuadre, te en`
- **S10_ENTREGA**
  - con nombre: `✅ ¡Pago confirmado! Bienvenido oficialmente a *Modelos IA*, María 🎉 Diste un gran paso.`
  - sin nombre: `✅ ¡Pago confirmado! Bienvenido oficialmente a *Modelos IA* 🎉 Diste un gran paso.`
- **S11_POSTVENTA**
  - con nombre: `Hola María 😊 ¿Cómo vas con el curso? ¿Ya creaste tu primer modelo? Cuéntame, me encanta ver los avances 👀`
  - sin nombre: `Hola 😊 ¿Cómo vas con el curso? ¿Ya creaste tu primer modelo? Cuéntame, me encanta ver los avances 👀`
- **S91_HUMANO**
  - con nombre: `Dame un momentico, María 🙏 Voy a consultar esto con el equipo para darte una respuesta exacta. Te escribo en un ratico por aquí mismo.`
  - sin nombre: `Dame un momentico 🙏 Voy a consultar esto con el equipo para darte una respuesta exacta. Te escribo en un ratico por aquí mismo.`

---

## Cifras

- Mensajes que recibe un lead colombiano: **36**
- Mensajes descartados por filtro de país: 1
- Frases con nombre: 9
- Tokens internos encontrados: ninguno

Los tokens internos los elimina `limpiarTokens` antes de enviar: nunca salen al cliente.
