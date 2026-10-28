# Detalles que hacen la diferencia

Registro de los detalles detectados durante la construcción que **no se resuelven
hoy** y que no hay que olvidar. Cada uno tiene dónde apareció y por qué importa.

Ordenados por lo que cuesta ignorarlos.

---

## 1. Riesgo que puede tumbar el negocio

| # | Detalle | Por qué importa |
|---|---|---|
| R1 | ✅ **Hecho** — monitor de sesión | `GET /salud/sesion` devuelve 503 si la sesión no está abierta (hoy lo dice: `connecting`). El vigilante avisa por webhook **externo**, porque si WhatsApp cae no sirve avisar por WhatsApp. Falta: configurar `MUSA_ALERTA_WEBHOOK` y un monitor externo que vigile la ruta |
| R2 | **Cobro manual no escala** | Visión + cola humana funciona con 5 ventas/día. Con 30, las entregas tardan y la entrega lenta es la causa nº1 de reportes |
| R3 | 🟡 **A medias** — acceso personal al curso | Hecho: token por comprador, `/a/<token>` → cookie → `/curso`, reemitir revoca el anterior, tabla con RLS en producción. **Falta lo importante**: que S10 mande ese enlace en vez de los 17 de Drive, y mudar los archivos a almacenamiento propio. Mientras el contenido viva en Drive público, esto es una puerta más bonita, **no una cerradura** |
| R4 | **Sin tope de calentamiento** | Un número nuevo que recibe 100 conversaciones el primer día es un patrón que Meta detecta |
| R5 | **Sin plan de migración de número** | Si cae, ¿cuánto tardas en tener otro funcionando? Debería ser 1 hora, no 1 semana |

---

## 2. Dinero que se está dejando sobre la mesa

| # | Detalle | Evidencia |
|---|---|---|
| D1 | **Upsell post-compra** | Quien usaba *order bump* + upsells tenía ticket **USD 48 vs 35** (+37 %) — [benchmark LATAM 2026](https://pagy.shop/informes/benchmark-checkout-productos-digitales-latam-2026) |
| D2 | **Conversión realista: 3–4 %, no 5 %** | El plan asume 5 %. Con 3,9 % la economía cambia; conviene saberlo antes de la campaña |
| D3 | **Recordatorio de pago pendiente** ✅ hecho | El momento de máxima intención. Ya está en `musa_recordatorios` |
| D4 | **Sin métrica de dónde se cae la gente** | Hay eventos, pero no embudo por etapa. Se optimiza a ciegas |
| D5 | **Tiempo de primera respuesta medido, pero sin pantalla** | `respuesta_enviada` ya guarda los ms. Nadie los mira |

---

## 3. Efecto «wow» — la diferencia entre bueno y memorable

| # | Detalle | Estado |
|---|---|---|
| W1 | **La Musa definitiva** | Hoy el chat, la landing y los creativos usan avatares de prueba distintos. **La misma mujer** en los tres sitios es lo que hace creíble el producto. Tu plan lo llama C1 / Fusión C |
| W2 | **La «sorpresa» que nunca llega** | Sin avatar, el copy dice «te tengo una sorpresa preparada» y no llega nada. Contradice el comentario del propio código original |
| W3 | **Pie de video vacío en la rama A** | `[VIDEO_AVATAR]` queda en texto vacío: el video se manda sin ninguna frase. El nombre aparece en el mensaje siguiente, un poco tarde |
| W4 | **Audio ocasional** | Dos casos, no al azar: cuando el lead manda nota de voz (simetría) y en la bienvenida personalizada. `sendWhatsAppAudio` ya existe en Evolution |
| W5 | **Imágenes por contexto** | «¿Qué incluye?» pide una imagen, no un párrafo. Igual los testimonios |
| W6 | **Testimonios reales** | La sección está ausente a propósito. El primer testimonio real vale más que cualquier copy que yo escriba |
| W7 | **La landing tiene un avatar de prueba** | `assets/demo.mp4` sale de `kling-maria-comprimido`, no de la Musa final. Funciona para lanzar, pero se nota |

---

## 4. Decisiones que solo dependen del dueño

| # | Decisión | Efecto hoy |
|---|---|---|
| P1 | **Gate 18+: `"no sé"` cuenta como menor** | Un adulto confundido queda bloqueado sin seguimientos |
| P2 | **Comprobantes: coincidencia por subcadena** | Un destino que contenga el número se auto-aprueba |
| P3 | **Storage de medios: R2 o volumen** | Sin decidirlo no hay videos del avatar ni imágenes de apoyo |
| P4 | **`cuentas_ve` de simulación** | `es_simulacion: true` no lo lee nadie. Si se quita `provisional`, se envían cuentas falsas |
| P5 | **Política de reembolsos** | Publicada como *propuesta*. Hay que aprobarla |
| P6 | **Datos del titular** | Términos y privacidad tienen `[PENDIENTE]` |

---

## 5. Deuda técnica anotada

| # | Detalle |
|---|---|
| T1 | `pg` vive en el `package.json` de la raíz porque el build usa la raíz. Se corrige cuando `next/` sea su propio repo |
| T2 | Seis URLs de InsForge dentro de la configuración (4 de avatar, 2 de entrega): se rompen al mudar a R2 |
| T3 | `evo.mjs crear` no tiene prueba automatizada |
| T4 | El cron de tasa diaria lleva muerto desde el 30-jul-2026 |
| T5 | El cron de seguimientos viejo (InsForge) **no respeta el horario**. `next/` sí, pero hay que portarlo |

---

## Cómo usar esta lista

Los **R** se atienden antes de lanzar. Los **D** en la primera semana de campaña.
Los **W** son los que hacen que el cliente diga «¿esto es real?» — y esos no se
pueden automatizar: necesitan una decisión de marca y material propio.

Lo que no está aquí: nada de lo que ya funciona. Esta lista es de lo pendiente.
