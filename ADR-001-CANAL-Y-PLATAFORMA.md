# ADR-001 — Canal de WhatsApp y plataforma del backend

- **Estado:** propuesto (Decisión 1 aceptada por el dueño; Decisiones 2–4 requieren confirmación)
- **Fecha:** 27-oct-2026
- **Decisor:** Mauricio (dueño)
- **Contexto de negocio:** primer MVP comercial de producción de Musa (curso Modelos IA).
- **Restricciones vigentes:** no desplegar a producción sin autorización · no generar gasto en APIs pagas sin presupuesto acordado · no tocar `valentina-chat` ni `contact_messages` · una tarea por vez.

---

## 1. Contexto

El canal actual es Twilio (~$0,005/mensaje). A 81.000 mensajes/mes son **~$405/mes ≈ $0,135 por lead**, el 70% de la infraestructura estimada en el plan maestro. Ese costo es el que hace inviable el escenario de 3% de conversión.

El dueño decidió migrar a **Evolution API sobre Railway con conexión Baileys**.

Datos medidos en el repositorio el 27-oct-2026 (no estimados):

| Métrica | Valor |
|---|---|
| Funciones desplegables | 8 |
| Líneas en `functions/` | 4.957 |
| Referencias `Deno.*` | 65 |
| Llamadas `.from(...)` (SDK InsForge) | 102 |
| Usos de `.storage` | 6 |
| `fetch(...)` a APIs externas | 18 |
| Referencias a Twilio en el webhook | 54 |
| Migraciones en producción | 4 propias + 1 huérfana (`create-rate-limits`) |

---

## 2. Decisión 1 — Twilio → Evolution API (Baileys) · **ACEPTADA**

### Motivo
- Costo por mensaje → **$0**; el stack Railway (Evolution + Postgres + Redis + volumen) queda en el orden de $10–25/mes.
- Infra total: **~$570–730 → ~$170–320/mes**; costo por lead **$0,19–0,25 → $0,05–0,10**.
- Desaparece la espera de registro del sender en Meta (paso B2, peso 10) como bloqueo del camino crítico.

### Costo aceptado (explicitar para no descubrirlo después)
1. **Se pierde `ctwa_clid`.** Baileys no entrega `ReferralCtwaClid`, así que `musa_leads.ctwa_clid` / `source_id` quedan nulos y la CAPI `Purchase` no atribuye. Meta optimizará por conversaciones, no por compradores (plan maestro §8). Plan B vigente: matching por ventana temporal ±3 min.
2. **Riesgo de baneo del número.** Es una integración no oficial; combinada con producto +18 el riesgo es material. Mitigación: número dedicado y desechable, ritmo humano, sin envíos masivos.
3. **Plantillas y ventanas 24 h/72 h** dejan de tener marco oficial: se puede enviar más, pero cada envío no solicitado sube el riesgo.

### Salida de emergencia (por eso esta decisión no encierra)
Evolution API soporta también **WhatsApp Cloud API oficial** como tipo de conexión. Si más adelante se activa CTWA, se añade una instancia Cloud API bajo el mismo Evolution y **el contrato del webhook no cambia**: el funnel no se reescribe.

---

## 3. Decisión 2 — InsForge → consolidar en Railway · **ACEPTADA 27-oct-2026**

> **Nota de estado:** aceptada al confirmar el dueño que ya tiene cuenta en
> Evolution API y en Railway y que se procede con ambos. La retirada efectiva de
> InsForge ocurre **en el cutover**, no antes: hasta que el stack nuevo pase la
> puerta de paridad, el sistema que corre es el viejo. Seguimiento en
> `SEGUIMIENTO.md`.

### Diagnóstico
InsForge fue correcto en junio. Hoy es el eslabón débil por cinco hechos verificables:

1. **Proyecto y plan gratuito compartidos con el CV profesional** (`README.md`). Un negocio que cobra comparte Postgres con un portafolio, con una regla de "no tocar" como único control.
2. **"Una función = un solo archivo"**: ya obligó a duplicar `entregarCurso` en `musa-wompi-events.ts` — lógica de entrega (el punto más sensible del negocio) duplicada por una limitación del proveedor.
3. **Migración huérfana en el proyecto compartido**: `create-rate-limits` (3-jul) está aplicada en producción y no existe en `migrations/`. *Corrección honesta (27-oct):* verifiqué columna por columna y **las 8 tablas `musa_*` sí están completas en el repo, sin drift**; la tabla `rate_limits` no se referencia en el código de Musa, así que pertenece a la otra aplicación. El argumento se reduce a "el proyecto compartido acumula objetos que no son míos", no a "mi esquema no es reproducible".
4. **Sin colas, workers, Redis ni observabilidad**: un video de avatar tarda 30–90 s y hoy vive dentro del webhook; un timeout es una venta perdida.
5. **Si ya se paga Railway por Evolution**, mantener InsForge significa dos facturas, dos pipelines y dos lugares donde buscar fallas, para un operador único.

### Qué se pierde (honesto)
- **Login de la Consola** (OAuth InsForge). Se reemplaza por **Cloudflare Access** (gratis ≤50 usuarios) — menos código que el actual.
- **Storage administrado** → **Cloudflare R2** (S3-compatible, sin costo de egreso, ~$0,015/GB-mes; Evolution sube medios a S3 de forma nativa).
- La comodidad de "todo en uno".

### Qué NO se pierde
El CV sigue funcionando en InsForge sin cambios. Solo se mudan las tablas `musa_*` y las 8 funciones: la separación es limpia y en sí misma es una mejora.

### Alternativa legítima (registrada, no descartada por incapacidad)
**Mantener InsForge un mes más y lanzar antes.** Si la prioridad es facturar en 2 semanas y no en 4, es defendible. Costo: la capa de canal se reescribe dos veces (una ahora, otra en la mudanza) y el drift sigue creciendo.

### Plataformas evaluadas

| Opción | Costo/mes | A favor | En contra | Veredicto |
|---|---|---|---|---|
| **Railway** | ~$15–25 | Ya se paga; red privada; volúmenes; Postgres+Redis+app+gateway | Sin región en Sudamérica; redeploy = reinicio (Baileys lo sufre); backups propios | **Elegida** |
| **Fly.io** | ~$4–8 | Región `gru`; volúmenes estables; mejor para proceso stateful | Más operación | Upgrade del *gateway* si hay desconexiones |
| **VPS (Hetzner)** | ~€4–6 | Máxima estabilidad para Baileys | Se es sysadmin | Solo si se desea |
| **Supabase** | $0–25 | Auth y storage maduros | Otra plataforma; free tier se pausa; vuelve el split | Descartada |
| **InsForge (actual)** | plan gratis | Cero fricción inicial | Los 5 puntos de arriba | Descartada como backend definitivo |

---

## 4. Decisión 3 — Storage: Cloudflare R2 · **PROPUESTO**

Buckets: `musa-avatares` (público, videos ≤16 MB) y `musa-capturas` (privado, comprobantes).
Motivo: sin costo de egreso, S3 nativo en Evolution, y desacopla los medios del ciclo de vida de la plataforma de cómputo.

---

## 5. Decisión 4 — Auth de la Consola: Cloudflare Access · **PROPUESTO**

La Consola es de **un solo operador**. Cloudflare Access delante del host estático resuelve identidad y sesión sin código propio. Elimina la dependencia del OAuth de InsForge y reduce superficie de ataque.

---

## 6. Diseño de la migración de canal

### El principio
**El canal y la plataforma son la misma migración.** La capa de entrada/salida se reescribe de todos modos (54 referencias a Twilio). Reescribirla sobre InsForge y después mudar de plataforma implica tocar dos veces las mismas ~2.900 líneas, la segunda bajo presión de ingresos. Se hace una vez.

### La pieza que lo hace posible
Un **adaptador de canal** con contrato propio (`functions/canal/tipos.ts`) y un **motor de funnel agnóstico**. El webhook deja de saber qué proveedor lo llama.

```
POST del proveedor
   │
   ├─ canal/evolution.ts   parsear + verificar + enviar
   └─ canal/twilio.ts      parsear + verificar + enviar
   │
   ▼
MensajeEntrante  ──►  motor de funnel (S00–S93, sin cambios de lógica)
   │
   ▼
MensajeSaliente  ──►  canal.enviar()
```

### Las tres diferencias que el contrato resuelve
1. **Formato de entrada**: form-encoded (`From`/`Body`/`MediaUrl0`) → JSON (`data.key.remoteJid`, `data.message.conversation`, `data.pushName`, `data.key.id`).
2. **Media**: Twilio entrega una URL descargable; Baileys entrega `mediaKey`/`fileSha256` y exige una llamada de seguimiento. El contrato usa **`MediaRef.obtenerBytes()` perezoso**, así `procesarComprobante` no cambia.
3. **Seguridad**: `X-Twilio-Signature` (HMAC-SHA1) → `apikey` de Evolution + validación de firma de webhook + allowlist de IP.

### La seguridad se cierra aquí
El contrato **elimina el fail-open** de `musa-webhook-twilio.ts:2600-2608` por construcción: `verificar()` es obligatorio y falla cerrado para todos los mensajes, no solo para los comandos de operador. Esto cierra el P0 pendiente sin un PR aparte.

### Hechos verificados en el código fuente de Evolution API (27-oct-2026)

Fuente: `evolution-foundation/evolution-api` — `src/api/integrations/event/webhook/webhook.controller.ts`, `src/api/types/wa.types.ts`, `src/api/routes/sendMessage.router.ts`. **No son suposiciones de documentación: es el código que corre.**

| Hecho | Consecuencia para Musa |
|---|---|
| El webhook envía `{event, instance, data, destination, date_time, sender, server_url, apikey}` | **La API key viaja en claro en cada evento.** Nunca loguear ni persistir el cuerpo crudo; el adaptador no lo retiene. |
| Con `webhook.headers.jwt_key` configurado, Evolution firma un **JWT HS256** (10 min, `{app:"evolution", action:"webhook"}`) y lo manda como `Authorization: Bearer` | Ésta es la firma real. `canal/evolution.ts` la verifica con `crypto.subtle.verify` (comparación en tiempo constante) y exige `action:"webhook"` y `exp` vigente. Sin `jwt_key`, fail-closed. |
| Configuración en MAYÚSCULAS (`MESSAGES_UPSERT`), payload en minúsculas (`messages.upsert`) | El parser acepta ambas formas. |
| Reintentos: hasta 10 con backoff exponencial, salvo 400/401/403/404/422 | Un 403 por firma inválida **corta** la reintentadera. La idempotencia por `data.key.id` es obligatoria. |
| `MessageSubtype`: `ephemeralMessage`, `viewOnceMessage`, `viewOnceMessageV2`, `documentWithCaptionMessage` envuelven el mensaje real | El parser los desenvuelve; si no, se pierden mensajes de una sola vista (justo donde llegan comprobantes). |

**Pendiente de confirmar en la Etapa 2, con instancia real:** el prefijo exacto de las rutas REST (`/message/sendText/{instancia}`, `/message/sendMedia/{instancia}`, `/chat/sendPresence/{instancia}`, `/chat/getBase64FromMediaMessage/{instancia}`) y la forma de la respuesta. Están implementadas según la convención del proyecto, pero no las he visto ejecutarse contra una instancia.


### Restricción de despliegue a resolver primero
InsForge despliega **una función = un archivo** (no empaqueta `./lib`). Para tener módulos compartidos sin duplicar código hace falta un paso de **bundle con esbuild** en CI: la fuente queda modular y el artefacto sigue siendo un archivo único.

---

## 7. Plan por etapas (cada una con puerta de verificación)

| Etapa | Contenido | Puerta | Despliega |
|---|---|---|---|
| **0** | Contrato (`canal/tipos.ts`) + ADR | Revisión del dueño | No |
| **1** | Bundle esbuild en CI; fuente modular, artefacto único | El e2e actual (8/8) sigue verde | No (solo CI local) |
| **2** | Evolution en Railway: instancia Baileys, QR, volumen `/evolution/instances`, webhook a endpoint de eco | Ida y vuelta de un mensaje real | No toca producción |
| **3** | Adaptador Evolution completo (texto, media, typing) | `verificar-funnel-colombia.mjs` contra la instancia nueva | No |
| **4** | Toggle `musa_settings.canal.proveedor` + cutover | Mismo e2e; Twilio queda como reverso | **Sí, requiere autorización** |
| **5** | Mudanza de datos + runtime (si se confirma Decisión 2) | Conteos idénticos; e2e verde | **Sí, requiere autorización** |
| **6** | Retiro de InsForge del camino crítico | 72 h sin incidentes | **Sí, requiere autorización** |

---

## 8. Riesgos aceptados

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Baneo del número por integración no oficial | Media-alta | Número dedicado y desechable; ritmo humano; sin masivos |
| Sesión Baileys corrompida en redeploy | Media | Volumen en `/evolution/instances`; 1 sola réplica; apagado ordenado |
| Pérdida de atribución CTWA | **Cierta** en fase 1 | Matching temporal ±3 min; instancia Cloud API cuando se active CTWA |
| Deriva entre repo y producción | Baja (verificada el 27-oct: 0 columnas de diferencia en las 8 tablas `musa_*`) | Migraciones versionadas aplicadas al arrancar (Drizzle/Kysely); `seed/` re-exportado antes de cada mudanza |
| Falla silenciosa (cron/desconexión) | **Ya ocurrió** (tasa muerta desde 30-jul) | Dead-man's switch externo + Sentry |

---

## 9. Lo que NO cambia con este ADR

- La máquina de estados S00–S93, el copy y las reglas antifraude.
- `decidirComprobante` y el principio de que **las decisiones las toma el código, no el LLM**.
- La regla de no desplegar ni gastar sin autorización.
