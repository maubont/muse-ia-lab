# LÍNEA BASE — Musa v2 (Evolution API · Railway)

**Cortada el:** 27-oct-2026, 19:35 (America/Bogota)
**Propósito:** fijar el punto de partida verificable antes de arrancar la siguiente
etapa. Todo lo de abajo es un hecho comprobado en esta sesión, no una memoria.

---

## 1. Repositorio

| Dato | Valor |
|---|---|
| Rama de trabajo | `main` |
| HEAD local | `7c3e2b2` |
| `origin/main` | `1dbad96` — **4 commits por detrás** |
| Ramas remotas | `origin/main`, `origin/deploy/evolution` |
| Archivos sin commitear | 24 |
| Funciones desplegables (`functions/*.ts`) | 8 — intactas |

**Nada se ha pusheado a `main`.** Los dos commits de despliegue que hice
(`deploy/evolution`) existen en local y se publicaron **solo** en la rama
`deploy/evolution`, para no disparar el CI de InsForge.

---

## 2. Infraestructura desplegada (Railway, proyecto `musa`)

Cuenta: `inge.bonillajm@gmail.com` · proyecto `3cb907d7-22bb-4fb5-9e51-1ba4af634ad3`
· entorno `production` · **separado de SportBot**.

| Recurso | Estado |
|---|---|
| Servicio `evolution` | ✅ corriendo — Evolution **v2.3.7 + parche de Baileys** aplicado y verificado en el build |
| Servicio `Postgres-STdR` | ✅ corriendo; **8 tablas `musa_*` y 13 claves cargadas**, RLS activo en las 8 |
| Volumen `evolution-volume` | ✅ montado en `/evolution/instances` |
| Dominio del gateway | ✅ `https://evolution-production-1418.up.railway.app` — **HTTP 200** |
| Servicio `server` | ✅ corriendo — `https://server-production-3709.up.railway.app` — `/salud` **200** |
| Webhook | ✅ configurado con **JWT + cabecera estática**, evento `MESSAGES_UPSERT` |
| Instancia `musa` | 🟡 creada, en **`connecting`**: falta escanear el QR (requiere número) |

**Ensayo de punta a punta verificado sin número:** `next/scripts/ensayo-e2e.mjs` → **9/9**
contra el servidor real. Un webhook firmado recorre firma → parseo → dedupe →
motor → envío; el envío falla limpio (`Connection Closed`) porque la instancia no
está vinculada, y eso es lo esperado.

Despliegue configurado como: rama `deploy/evolution` → `rootDirectory:
next/deploy/evolution` → `railway.json` con `builder: DOCKERFILE`.

---

## 3. Producción actual (InsForge) — no se ha tocado

| Elemento | Estado |
|---|---|
| Funciones `musa-*` | 8 desplegadas, sin cambios en esta sesión |
| Funciones `valentina-*` | 3, intactas (otra aplicación) |
| Datos | 4 leads · 78 mensajes · 1 pago aprobado — todo de prueba |
| Cron de tasa del día | 🔴 muerto desde el 30-jul-2026 |

---

## 4. Verificación: 1.117 aserciones, todas verdes

Ejecutables **sin red, sin base de datos y sin gastar tokens**:

| Suite | Aserciones | Qué garantiza |
|---|---|---|
| `test-comprobante` | 33 | Núcleo antifraude |
| `test-guardarrailes` | 68 | Gate 18+, opt-out, honestidad, país |
| `test-canal-evolution` | 73 | Firma, parseo, LID, media, envío, timeouts |
| `test-copy` | 460 | Todo el copy real, 3 países, sin fugas |
| `verificar-esquema` | 262 | DDL del repo nuevo vs. producción |
| `verificar-seed` | 36 | Las 13 claves de configuración |
| `test-servidor` | 22 | Webhook: 403 sin firma, dedupe, orden |
| `test-evo` | 40 | CLI de operación |
| `test-config` | 18 | Contrato de variables de entorno |
| `test-s04` | 38 | Gate 18+ (portado) |
| `test-s06` | 35 | Cierre y datos de pago (portado) |
| `test-s10` | 32 | Entrega (portado) |

**Tres niveles de garantía, que no se deben confundir:**

| Nivel | Módulos |
|---|---|
| Equivalencia **demostrada** contra producción | comprobante, guardarraíles, copy |
| Fidelidad **demostrada** por round-trip | esquema, seed |
| Revisión **por lectura** (no demostrada) | s04, s06, s10 |

---

## 5. Dónde estamos, por área

| Área | Avance | Qué falta |
|---|---|---|
| Gateway de WhatsApp (Railway) | **95 %** | Escanear el QR (necesita número) |
| Adaptador de canal | **95 %** | Confirmar en producción cuál mecanismo de firma llega |
| Servidor / backend | **95 %** | Desplegado con motor real contra Postgres |
| Base de datos | **100 %** | 8 tablas + 13 claves cargadas |
| Motor del funnel | **80 %** | Falta S11 y S90; S01/S02/S04/S06/S07/S08/S09/S10 hechos |
| Cobro y entrega | **90 %** | Decisiones completas; falta visión real y entrega por canal |
| Observabilidad | **35 %** | Hay eventos de envío fallido; faltan alertas y *dead-man's switch* |
| Comercial (número, Meta, anuncios) | **0 %** | Número dedicado, Business Manager, creativos, campaña |

**El camino completo de un cliente existe y corre**: saludo → gate 18+ → cierre →
datos de pago → comprobante → verificación → entrega, con la telemetría de envíos
fallidos. Lo que no existe todavía es la visión real del comprobante (necesita
OpenAI) y el avatar por nombre.

---

## 6. Decisiones tomadas

| # | Decisión |
|---|---|
| D1 | Canal: **Evolution API (Baileys)**, no Twilio |
| D2 | Backend: **consolidar en Railway**; InsForge se retira en el cutover |
| D3 | Infra de Musa **separada de SportBot** (proyecto propio) |
| D4 | Webhook protegido por **JWT o cabecera estática** (se aceptan ambos) |
| D5 | Imagen propia de Evolution con el **parche de vinculación** de Baileys |

## 7. Decisiones abiertas (dueño)

| # | Tema | Efecto si no se decide |
|---|---|---|
| P1 | Gate 18+: `"no sé"` se clasifica como **menor** | Adultos bloqueados sin seguimientos |
| P2 | Comprobantes por **subcadena** | Un destino ajeno que contenga el número se auto-aprueba |
| P3 | Storage de medios: **R2** vs volumen local | Los videos del avatar no tienen dónde vivir |
| P4 | `cuentas_ve` son simulación que **parece real**; el código no lee `es_simulacion` | Si alguien quita `provisional`, se envían cuentas falsas |

---

## 8. Deuda conocida

1. **1.117 aserciones, pero `evo.mjs crear` no tiene prueba** (se añadió para crear la instancia).
2. **6 URLs de InsForge dentro de la configuración** (avatar y 2 enlaces de entrega) — se rompen al mudar a R2.
3. **Sin observabilidad**: ni alertas ni *dead-man's switch* para crons o desconexiones.
4. **El repo nuevo no tiene migraciones aplicadas en ningún sitio**: `next/migrations/*.sql` aún no se ha cargado en el Postgres de Railway.

---

## 9. Reglas vigentes

- No push a `main` sin autorización (dispara el despliegue de InsForge).
- No tocar `valentina-chat` ni `contact_messages`.
- Sin gasto en OpenAI / Twilio / fal.ai sin presupuesto acordado.
- Ningún secreto en el repo, en issues ni en el chat. `.env` está ignorado.
- El repo viejo queda congelado como oráculo hasta pasar la puerta de paridad.
