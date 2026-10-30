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
| R3 | ✅ **Hecho** — acceso personal + contenido propio | Token por comprador, `/a/<token>` → cookie → `/curso`, S10 manda **un** enlace. El contenido salió de Drive: **37 archivos, 12,3 GB** en almacén de objetos, servido con URL firmada de 5 min que no pasa por el servidor. 0,18 USD/mes. **Falta**: `megapack_master_ia`, que es un curso anidado a tres niveles |
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

---

## 6. La sala de exhibición — decisión tomada el 30-oct-2026

**Estrategia del dueño:** que el prospecto vea la plataforma (sin comprar) con solo el
video de introducción habilitado, para que compruebe que el curso existe y es serio.

**Acordado:** no se construye todavía. Primero la grabación de pantalla; la sala real
solo si el embudo muestra que la objeción de confianza es la que frena.

### Por qué no se hace ahora

Lo que hace atractiva la idea es lo mismo que la vuelve peligrosa:

```
/media/<token>/<clave>   valida el token y sirve CUALQUIER clave
```

Un token de «solo introducción» abre **los 60 archivos**. Y no basta con no pintar los
enlaces en la página: las claves son predecibles (`curso/02/...`), así que basta
editarlas en la barra del navegador. **El candado quedaría decorativo y el curso
regalado a la primera persona curiosa.**

### Paso 1 · lo que se hace ahora (coste: 20 minutos, riesgo: cero)

Una **grabación de pantalla de 45 segundos** recorriendo la plataforma con los módulos
bloqueados. Se manda por el chat en `S05_PRECIO`, antes del precio.

- No hay token, no hay URL, no hay nada que filtrar.
- El prospecto no tiene que hacer nada.
- Sirve mañana, sin tocar código.

**Guion sugerido:** resultado primero (15 s), plataforma por dentro (20 s),
qué falta al desbloquear (10 s).

### Paso 2 · la sala real, cuando toque construirla

Requiere **cuatro** cambios, y el candado tiene que estar en el servidor:

1. Columna `alcance` en `musa_accesos`: `'completo'` | `'intro'`.
2. `/media` compara la clave pedida con el alcance del token y devuelve `403` si no
   está permitida, aunque el archivo exista.
3. Página de exhibición: los 13 módulos con candado y sus cifras («6 archivos»,
   «22 archivos»), **sin generar ni un enlace**.
4. Token con caducidad corta (7 días) y revocable.

### La condición que decide si funciona

**El video desbloqueado tiene que ser bueno.** Si la introducción es floja, enseñarla
convierte peor que no enseñar nada. No puede empezar con «bienvenido al curso»: tiene
que mostrar el resultado en los primeros 15 segundos y terminar con una razón para
querer el resto.

### Antes de construirla

Arreglar el desajuste de títulos y contenido (módulos 5 a 12). Una plataforma que
enseña «Escenarios y luz» y entrega un tutorial de bots de Telegram **no genera
confianza: la destruye**. Enseñar eso sería peor que no enseñar nada.

---

## 7. Lo que se descartó (y por qué) — 30-oct-2026

Se anotan aquí las ideas evaluadas y **rechazadas** para no volver a proponerlas.

### Garantía de devolución — DESCARTADA

Se propuso una garantía de 7 días para reducir el riesgo percibido. El dueño la
rechazó con un argumento que se sostiene:

> No se puede verificar si el comprador descargó, consumió o simplemente decidió no
> hacerlo. Una devolución es un coste administrativo cierto contra un beneficio
> incierto, y premia justo a quien no hizo nada.

**Decisión:** sin garantía. El curso queda disponible para siempre y cada quien lo
hace en 6 días o en 6 meses.

**Consecuencia:** hay que compensar la desconfianza con otra cosa. Ya está en marcha:
mostrar el producto, nombrar la parte difícil y decir con claridad qué no es esto.

### Reto de 7 días con el bot — DESCARTADO

Se construyó y se probó (7 tareas, una por día, cada una pidiendo una imagen o una
decisión al comprador, con el plan de 7 días convertido de PDF en conversación). El
dueño lo rechazó:

> No puedo hacer del bot un generador de spam, tampoco quiero crear estrés en el
> cliente. Una vez paga, es responsable de hacer su curso. Si hace el curso genera
> valor; si no, pues perdió, y no es mi culpa.

**Decisión:** revertido por completo. El código se borró; no quedó ni una rama muerta.

**Lo que queda de aquello:** nada en código. El plan de 7 días sigue como PDF dentro
del curso, y esa es toda la insistencia.

**Por qué importa esta decisión más de lo que parece:** un mensaje diario a quien ya
pagó convierte al bot en una máquina de molestar. Y si nadie contesta lo que el
comprador manda, el acompañamiento se vuelve una promesa incumplida — peor que el
silencio.

### Lo que esto dice del producto

El bot acompaña **mientras se vende** y se calla **cuando se cobra**. Todo lo que
ocurra después depende del comprador, no de un recordatorio.
