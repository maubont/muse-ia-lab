# Estado y traspaso — Musa v2 (Evolution API · Railway)

**Última actualización:** 27-oct-2026, ronda 16 de la sesión autónoma.
**Para qué sirve:** que quien retome no reconstruya contexto. Se lee en cinco minutos.

---

## 1. Dónde estamos, en una frase

El canal está escrito y probado, el repo nuevo reproduce el esquema y la
configuración reales, y **cuatro estados del funnel están portados** — pero
**nada se ha desplegado**: falta conectar la instancia de Evolution y decidir
cuatro cosas.

**Nada de esto costó dinero, tocó producción ni movió datos de clientes.**

---

## 2. Verificación: 1.117 aserciones, todas verdes

```bash
# repo viejo (functions/)
node --experimental-strip-types scripts/test-comprobante.mjs      #  33
node --experimental-strip-types scripts/test-guardarrailes.mjs    #  68
node --experimental-strip-types scripts/test-canal-evolution.mjs  #  73
node --experimental-strip-types scripts/test-copy.mjs             # 460

# repo nuevo (next/)
node next/scripts/verificar-esquema.mjs                           # 262
node next/scripts/verificar-seed.mjs                              #  36
node next/scripts/test-servidor.mjs                               #  22
node next/scripts/test-evo.mjs                                    #  40
node --experimental-strip-types next/scripts/test-config.mjs      #  18
node --experimental-strip-types next/scripts/test-s04.mjs         #  38
node --experimental-strip-types next/scripts/test-s06.mjs         #  35
node --experimental-strip-types next/scripts/test-s10.mjs         #  32
```

Todo corre sin red, sin base de datos y sin gastar tokens.

**Tres niveles de garantía, y conviene no confundirlos:**

| Nivel | Módulos | Qué significa |
|---|---|---|
| **Equivalencia demostrada** | `comprobante`, `guardarraíles`, `copy` | Comparados diferencialmente contra el código en producción: 5.032 + 48.108 comparaciones y 0 diferencias |
| **Fidelidad demostrada** | esquema y seed | El DDL y el SQL se comparan por round-trip contra la base real |
| **Revisión por lectura** | `s04`, `s06`, `s10` | Portados a mano desde el original. **La equivalencia no está demostrada**; la puerta de paridad es obligatoria antes del cutover |

---

## 3. Qué existe

### Repo viejo — sigue siendo el que corre

| Archivo | Qué es |
|---|---|
| `functions/canal/tipos.ts` | Contrato de canal (`MensajeEntrante`/`MensajeSaliente`/`MediaRef`) |
| `functions/canal/evolution.ts` | Adaptador Evolution: firma JWT fail-closed, parseo, envío, typing |
| `functions/motor/comprobante.ts` | Núcleo antifraude |
| `functions/motor/guardarrailes.ts` | Gate 18+, opt-out, honestidad, país |
| `functions/motor/copy.ts` | Renderizado del copy |
| `seed/` | Configuración, esquema y restricciones exportados de producción |

### Repo nuevo — `next/`

| Archivo | Qué es |
|---|---|
| `src/api/servidor.ts` | Webhook HTTP, cero dependencias, firma obligatoria antes de procesar |
| `src/config.ts` | Contrato de configuración por NOMBRES de variable (nunca imprime valores) |
| `deploy/` | Dockerfile de Evolution con el parche de Baileys, compose local, `.env.example` y guía de despliegue/recuperación |
| `src/motor/efectos.ts` | El motor devuelve efectos, no los ejecuta |
| `src/motor/s04.ts` | Gate 18+ |
| `src/motor/s06.ts` | Cierre + datos de pago |
| `src/motor/s10.ts` | Entrega |
| `migrations/0001_esquema_inicial.sql` | DDL generado desde producción |
| `migrations/0002_seed_configuracion.sql` | Las 13 claves, idempotentes |
| `scripts/evo.mjs` | CLI para operar Evolution sin depender del agente |

Generados y regenerables: `GUION-COLOMBIA.md` (el guion completo que recibe un
lead colombiano) y los dos `.sql`.

---

## 4. El funnel: qué falta

| Estado | Situación |
|---|---|
| S00/S01/S02 (lead nuevo + avatar) | ⬜ sin portar — dependen del pipeline de video |
| S04_GATE18 | ✅ portado |
| S06_CIERRE / S07_DATOS_PAGO | ✅ portado |
| **S08_ESPERA_CAPTURA** | ⬜ **el hueco crítico**: descarga, pHash, visión, circuit breaker, cola humana |
| S09_VERIFICACION | ⬜ |
| S10_ENTREGA | ✅ portado |
| S11_POSTVENTA, S90/S91 | ⬜ |

Sin S08 no hay cobro automático. Es el siguiente bloque de trabajo, y es el más
grande: toca base de datos, visión y decisiones de dinero.

---

## 5. Lo que NO se hizo, y por qué

| No hecho | Motivo |
|---|---|
| Desplegar el backend | Regla de la sesión: sin autorización explícita |
| Llamar a OpenAI / Twilio / fal.ai | Sin presupuesto acordado |
| Instalar dependencias npm | El sandbox no permite escribir en `node_modules` ni lanzar hijos con tuberías. **Hay que hacerlo fuera del sandbox** |
| Portar Wompi | Está dormido en producción (`pago.proveedor = "manual"`); portar código muerto es cómo se pierden las cosas |

### Estado real de Railway (27-oct, tras la autorización)

Proyecto **`musa`** (`3cb907d7-22bb-4fb5-9e51-1ba4af634ad3`), entorno `production`, **separado de SportBot**:

| Recurso | Estado |
|---|---|
| `evolution` | ✅ desplegado y **corriendo** (Evolution v2.3.7 + parche de Baileys aplicado y verificado en el build) |
| `Postgres-STdR` | ✅ desplegado; el gateway ya escribe ahí |
| Volumen `evolution-volume` | ✅ montado en `/evolution/instances` |
| Dominio público | ✅ `https://evolution-production-1418.up.railway.app` (responde **HTTP 200**) |
| Instancia `musa` | ✅ creada, en `connecting`: **falta escanear el QR** |

Despliegue: rama `deploy/evolution` del repo + `rootDirectory: next/deploy/evolution` + `railway.json` con `builder: DOCKERFILE` (Railpack no detecta el Dockerfile solo).

**Hallazgo operativo:** la pila TLS de PowerShell y `curl` está bloqueada en este
sandbox, pero **Node sí sale a internet**. Por eso todas las comprobaciones HTTP se
hacen con Node, no con `Invoke-WebRequest`.

### Pendiente

1. **Escanear el QR** con el número dedicado de Musa (`/manager` del gateway o `evo.mjs qr`).
2. **Configurar el webhook** cuando exista la URL del servidor de Musa (aún no desplegado).
3. **Desplegar el servidor** de Musa (`next/`) y apuntar el webhook a él.

---

## 6. Decisiones abiertas

| # | Tema | Recomendación |
|---|---|---|
| **P1** | Gate 18+: `"no sé"` se clasifica como **menor** y bloquea al lead sin seguimientos | Que devuelva ambiguo y decida GPT (3 líneas) |
| **P2** | Comprobantes: un destino que **contenga** el número de Musa se auto-aprueba | Decidir si se endurece a igualdad exacta |
| **P3** | Storage de medios: R2 vs volumen local | R2 |
| **P4** | `cuentas_ve` son datos de simulación que **parecen reales** («Carmen Rodriguez», 0414-1234567). `textoCuentasValido` los aprueba; solo `provisional` los frena. El campo `es_simulacion: true` **el código no lo lee** | Que el motor respete `es_simulacion`, o borrar el bloque VE |

---

## 7. Cómo retomar

```bash
# 1) comprobar que todo sigue verde
node next/scripts/verificar-esquema.mjs && node next/scripts/verificar-seed.mjs

# 2) ver el estado de Evolution (necesita URL + API key)
$env:EVOLUTION_URL="https://<servicio>.up.railway.app"
$env:EVOLUTION_APIKEY="<key>"
node next/scripts/evo.mjs instancias
node next/scripts/evo.mjs estado

# 3) si hay que reconfigurar el webhook
node next/scripts/evo.mjs webhook-set --url https://<tu-dominio>/webhook/evolution --jwt <secreto>
```

**Antes de tocar WhatsApp, verifica dos cosas en Railway:** que exista **Redis** y
que haya **volumen en `/evolution/instances`**. Sin el volumen, cada redeploy borra
la sesión de Baileys y hay que reescanear el QR.

---

## 8. Reglas que siguen vigentes

- **No tocar** `valentina-chat` ni `contact_messages` (backend compartido con el CV).
- **No push a `main`** sin autorización: dispara despliegue automático.
- **Presupuesto acordado** antes de cualquier llamada pagada a OpenAI, Twilio o fal.ai.
- El repo viejo queda congelado como oráculo hasta que el nuevo pase
  `scripts/verificar-funnel-colombia.mjs` (8/8).
