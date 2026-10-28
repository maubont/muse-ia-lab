# SEGUIMIENTO — Musa v2 (Evolution API · Railway)

Plan de ejecución. Una casilla se marca **solo con evidencia**.
Responsable: 🧑 = solo Mauricio · 🤖 = el agente · 🤝 = juntos.
Estado: ⬜ pendiente · 🟡 en curso · ✅ hecho · 🔴 bloqueado · ⏸️ esperando decisión

> **`sportbot-gateway` no se toca.** Es otro negocio, otra aplicación y otro número.
> Musa tiene su **propio proyecto de Railway** (`musa`).

---

## Objetivo vigente

> **Ensayo completo sin número de WhatsApp.** Dejar Musa ejecutándose en Railway con
> punto de entrada real, datos cargados, webhook firmado y un ensayo de punta a
> punta con canal simulado. Después, portar los estados que faltan (S08 y
> siguientes) hasta la puerta de paridad.
>
> **Sin número dedicado se puede hacer:** servidor, base de datos, webhook, ensayo
> simulado y todo el funnel. **No se puede:** vincular WhatsApp, la prueba de eco
> real ni nada comercial.
>
> Restricciones: sin gasto en APIs pagas, sin enviar mensajes reales, sin tocar
> SportBot ni InsForge.

---

## FASE 0 — Infraestructura del gateway · ✅ hecha

| # | Paso | Quién | Estado | Evidencia |
|---|---|---|---|---|
| 0.1 | Proyecto propio de Railway para Musa | 🤖 | ✅ | `musa` · `3cb907d7…` |
| 0.2 | PostgreSQL | 🤖 | ✅ | `Postgres-STdR` desplegado |
| 0.3 | Imagen de Evolution con parche de Baileys | 🤖 | ✅ | build SUCCESS; el Dockerfile falla si el parche no aplica |
| 0.4 | Volumen `/evolution/instances` | 🤖 | ✅ | `evolution-volume` |
| 0.5 | Dominio público | 🤖 | ✅ | `evolution-production-1418.up.railway.app` → HTTP 200 |
| 0.6 | Variables del gateway | 🤖 | ✅ | 21 variables cargadas, sin imprimir valores |
| 0.7 | Servicio huérfano de Postgres | 🤖 | ✅ | borrado |

---

## FASE 1 — Instancia de WhatsApp · 🟡 en curso

| # | Paso | Quién | Estado | Criterio de terminado |
|---|---|---|---|---|
| 1.1 | Crear instancia `musa` | 🤖 | ✅ | existe y responde |
| 1.2 | **Escanear el QR con el número dedicado** | 🧑 | ⬜ | `estado` = `open` |
| 1.3 | Configurar el webhook firmado | 🤖 | ⏸️ | necesita la URL del servidor (Fase 2) |
| 1.4 | Prueba de eco con un segundo número | 🤝 | ⬜ | llega al webhook y responde |

> **Bloqueo de lanzamiento, independiente de todo lo demás: el número.** Debe ser
> dedicado, no el personal, no el de SportBot, y no haber estado registrado en
> otra cuenta de WhatsApp.

---

## FASE 2 — Servidor de Musa en Railway · ✅ hecha

| # | Paso | Quién | Estado | Criterio de terminado |
|---|---|---|---|---|
| 2.0 | **Punto de entrada del servidor** (`next/src/main.ts`) | 🤖 | ✅ | arranca, lee entorno y responde · 13 aserciones |
| 2.1 | Servicio del backend desplegado | 🤖 | ✅ | `server-production-3709.up.railway.app/salud` → 200 |
| 2.2 | Cargar `0001_esquema_inicial.sql` y `0002_seed_configuracion.sql` | 🤖 | ✅ | **8 tablas · 13 claves · RLS en 8** |
| 2.3 | Variables del servidor (`EVOLUTION_*`) | 🤖 | ✅ | 7 variables cargadas, sin imprimir valores |
| 2.4 | Webhook apuntando al servidor | 🤖 | ✅ | URL + JWT + cabecera estática configurados |
| 2.5 | Ensayo de punta a punta **con canal simulado** | 🤖 | ✅ | `ensayo-e2e.mjs` → **9/9** contra el servidor real |
| 2.6 | Sustituir las 6 URLs de InsForge por R2 | 🤖 | ⏸️ | depende de P3 |

### Evidencia del ensayo (sin número de WhatsApp)

```
/salud                     → 200  {"ok":true,"canal":"evolution"}
webhook sin firma          → 403  {"motivo":"sin_bearer"}
webhook firmado            → 200  {"procesados":1}
reintento del mismo id     → 200  {"procesados":0}
evento que no es mensaje   → 200  {"procesados":0}
```

En los logs del servidor real:

```
[musa] canal evolution listo · instancia=musa · escuchando en :8080
[motor-eco] {"telefono":"+573001112233","texto":"hola desde el ensayo…","id_externo":"ENSAYO-…"}
[servidor] envío falló: 500 {"message":"Connection Closed"}
```

El último renglón es el esperado: la instancia aún no está vinculada, así que
Evolution cierra la conexión. **Falla limpio, no rompe el webhook.**

---

## FASE 3 — Motor del funnel · 🟡 a la mitad

| Estado | Situación |
|---|---|
| S01/S02 (saludo + avatar) | ⬜ sin portar — dependen del pipeline de video |
| **S04_GATE18** | ✅ portado · 38 aserciones |
| **S06_CIERRE / S07_DATOS_PAGO** | ✅ portado · 35 aserciones |
| **S08_ESPERA_CAPTURA** | ✅ portado · 33 aserciones — siete guardas en orden, ninguna ruta entrega sin pasarlas |
| S09_VERIFICACION | ⬜ |
| **S10_ENTREGA** | ✅ portado · 32 aserciones |
| S11, S90, S91 | ⬜ |

Con S08 portado, **el camino del dinero está completo en forma de decisiones**:
gate 18+ → cierre → datos de pago → comprobante → entrega. Lo que falta es el
enrutador que las conecta y la ejecución real de los efectos contra Postgres.

---

## FASE 4 — Puerta de paridad · ⬜

| # | Paso | Quién | Criterio |
|---|---|---|---|
| 4.1 | `verificar-funnel-colombia.mjs` contra el stack nuevo | 🤝 | 8/8 |
| 4.2 | Compra de prueba real de punta a punta | 🤝 | captura → visión → aprobación → 17 enlaces |

---

## FASE 5 — Cutover y retiro de InsForge · ⬜

| # | Paso | Quién | Criterio |
|---|---|---|---|
| 5.1 | Autorización explícita de despliegue | 🧑 | por escrito |
| 5.2 | Número productivo y webhook al backend nuevo | 🤝 | tráfico real |
| 5.3 | 72 h sin incidentes | 🤝 | sin 5xx ni desconexiones |
| 5.4 | Retirar `musa_*` de InsForge (el CV se queda) | 🤖 | — |

---

## Próximos pasos, en orden

**1. Escanear el QR** (🧑 · 2 min · desbloquea la Fase 1)
`https://evolution-production-1418.up.railway.app/manager` con la
`AUTHENTICATION_API_KEY`. Comprobar con `evo.mjs estado` → `open`.

**2. Desplegar el servidor de Musa** (🤖 · Fase 2.1)
Mismo patrón que el gateway: repo → rama → servicio en Railway. El servidor ya
existe en `next/src/api/servidor.ts` con 22 aserciones.

**3. Cargar esquema y configuración** (🤖 · Fase 2.2)
`next/migrations/*.sql` en el Postgres de Musa. Ya hay script generador y
verificador; falta ejecutarlo contra la base real.

**4. Configurar el webhook** (🤖 · Fase 1.3)
`evo.mjs webhook-set --url <servidor>/webhook/evolution --jwt <secreto>`.
Aquí se sabrá cuál de los dos mecanismos de firma llega de verdad.

**5. Prueba de eco** (🤝 · Fase 1.4)
Mandar un mensaje desde un segundo número y ver el `MensajeEntrante` en los logs.

**6. Portar S08** (🤖 · Fase 3)
El bloque más grande. Sin él, Musa conversa pero no cobra solo.

---

## Decisiones que bloquean trabajo

| # | Decisión | Bloquea |
|---|---|---|
| P1 | Gate 18+ con `"no sé"` | Ajuste del motor antes de producción |
| P2 | Comprobantes por subcadena | S08 (endurecer o no la regla) |
| P3 | Storage: R2 vs volumen local | Fase 2.5 y los videos del avatar |
| P4 | `cuentas_ve` de simulación | Riesgo de enviar cuentas falsas |

---

## Registro de evidencia

| Fecha | Hecho | Evidencia |
|---|---|---|
| 27-oct | Proyecto `musa` + Postgres + gateway + volumen + dominio | `railway service list` · HTTP 200 con Node |
| 27-oct | Imagen con parche construida y corriendo | build SUCCESS · logs: Repository ON, WA Module ON |
| 27-oct | Instancia `musa` creada | `evo.mjs instancias` → `musa connecting` |
| 27-oct | 1.117 aserciones verdes | suites del repo |
| 27-oct | Línea base cortada | `LINEA-BASE.md` |
