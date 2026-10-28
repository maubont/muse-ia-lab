# Estado y traspaso — Musa v2 (Evolution API · Railway)

**Última actualización:** 28-oct-2026, cierre de la sesión autónoma (28 rondas).
**Para qué sirve:** que quien retome no reconstruya contexto. Se lee en cinco minutos.

---

## 1. Dónde estamos, en una frase

**Musa corre en Railway de punta a punta con canal simulado**: webhook firmado →
verificación → parseo → lead en Postgres → enrutador → motor del funnel → envío.
Lo que falta es el **número de WhatsApp** para que ese envío llegue a una persona.

---

## 2. Verificación: 1.306 aserciones locales + 9 remotas

Todo se ejecuta **sin red, sin base de datos y sin gastar tokens** (salvo el ensayo
remoto, que habla con el servidor desplegado):

```bash
# repo viejo
node --experimental-strip-types scripts/test-comprobante.mjs      #  33
node --experimental-strip-types scripts/test-guardarrailes.mjs    #  68
node --experimental-strip-types scripts/test-canal-evolution.mjs  #  73
node --experimental-strip-types scripts/test-copy.mjs             # 460

# repo nuevo
node next/scripts/verificar-esquema.mjs                           # 262
node next/scripts/verificar-seed.mjs                              #  36
node next/scripts/test-servidor.mjs                               #  22
node next/scripts/test-evo.mjs                                    #  40
node next/scripts/test-config.mjs                                 #  18
node --experimental-strip-types next/scripts/test-s01.mjs         #  28
node --experimental-strip-types next/scripts/test-s04.mjs         #  38
node --experimental-strip-types next/scripts/test-s06.mjs         #  35
node --experimental-strip-types next/scripts/test-s08.mjs         #  33
node --experimental-strip-types next/scripts/test-s10.mjs         #  32
node --experimental-strip-types next/scripts/test-main.mjs        #  13
node --experimental-strip-types next/scripts/test-ejecutar.mjs    #  26
node --experimental-strip-types next/scripts/test-repositorio.mjs #  27
node --experimental-strip-types next/scripts/test-router.mjs      #  42
node --experimental-strip-types next/scripts/test-motor-real.mjs  #  20

# ensayo contra el servidor real (requiere MUSA_URL + secreto)
node next/scripts/ensayo-e2e.mjs                                  #   9
```

**Tres niveles de garantía, que no se deben confundir:**

| Nivel | Módulos |
|---|---|
| Equivalencia **demostrada** contra producción | comprobante, guardarraíles, copy |
| Fidelidad **demostrada** por round-trip | esquema, seed |
| Revisión **por lectura** (no demostrada) | s01, s04, s06, s08, s10, router, ejecutor, repositorio |

---

## 3. Lo desplegado

| Recurso | URL / valor |
|---|---|
| Gateway | `https://evolution-production-1418.up.railway.app` |
| Servidor de Musa | `https://server-production-3709.up.railway.app` |
| Base de datos | `Postgres-STdR` · 8 tablas · 13 claves · RLS en 8 |
| Volumen | `evolution-volume` en `/evolution/instances` |
| Instancia WhatsApp | `musa` — **`connecting`**, falta escanear el QR |
| Webhook | configurado con JWT **y** cabecera estática |

Proyecto **`musa`** (`3cb907d7…`), separado de SportBot. Rama de despliegue:
`deploy/evolution`. `main` del repo **no** se ha pusheado.

---

## 4. Qué está portado del funnel

| Estado | | Notas |
|---|---|---|
| S00 → S01 → S02 | ✅ | Saludo, precio inmediato, avatar o puente |
| S04_GATE18 | ✅ | 7 ramas; incluye el bug «Carlitos» |
| S06_CIERRE / S07_DATOS_PAGO | ✅ | Nunca envía cuentas incompletas |
| S08_ESPERA_CAPTURA | ✅ | 7 guardas en orden; nunca entrega sin pasarlas |
| S09_VERIFICACION | ✅ | Acusa siempre: quien pagó no se queda en silencio |
| S10_ENTREGA | ✅ | 13 módulos + 4 bonos en 3 mensajes, con barrera anti-doble-entrega |
| S11_POSTVENTA · S90 · S91 | ⬜ | S91 se usa si el copy lo trae |

Piezas de unión: `efectos.ts` (contrato), `ejecutar.ts` (ejecutor con barrera),
`router.ts` (guardas globales + despacho), `db/repositorio.ts` (Postgres).

---

## 5. Lo que NO existe todavía

| Falta | Por qué |
|---|---|
| **Visión real del comprobante** | Cuesta tokens de OpenAI; no hay presupuesto acordado. S08 decide sobre datos simulados |
| **Avatar por nombre** | Depende de P3 (storage R2) y del pipeline fal.ai |
| **GPT de conversación** | Igual que la visión. Sin él, `gptResponder` escala a humano y `gptFallback` registra `gpt_no_implementado` |
| **S11 y S90** | Postventa y fallback libre |
| **Puerta de paridad** | Necesita el número y el sistema viejo corriendo en paralelo |
| **Observabilidad** | Hay eventos de `envio_fallido`, pero no alertas ni *dead-man's switch* |

---

## 6. Decisiones abiertas (solo dependen del dueño)

| # | Tema | Efecto |
|---|---|---|
| **P1** | Gate 18+: `"no sé"` se clasifica como **menor** | Un adulto confundido queda bloqueado sin seguimientos |
| **P2** | Comprobantes: un destino que **contenga** el número se auto-aprueba | Falso positivo posible |
| **P3** | Storage de medios: R2 vs volumen local | Sin decidirlo no hay videos del avatar |
| **P4** | `cuentas_ve` de simulación que parecen reales; `es_simulacion` no se lee | Si se quita `provisional`, se envían cuentas falsas |

---

## 7. Cómo retomar

```bash
# 1) comprobar que todo sigue verde
node next/scripts/verificar-esquema.mjs && node next/scripts/verificar-seed.mjs

# 2) ensayo contra el servidor desplegado
$env:MUSA_URL="https://server-production-3709.up.railway.app"
$env:EVOLUTION_WEBHOOK_SECRET="<de next/deploy/.env>"
node next/scripts/ensayo-e2e.mjs

# 3) estado del gateway y de la instancia
node next/scripts/evo.mjs instancias
node next/scripts/evo.mjs estado
node next/scripts/evo.mjs webhook-ver
```

Los secretos están en `next/deploy/.env` (ignorado por git). Los nombres de las
variables, en `next/deploy/.env.example`.

**Para conectar el número:** `https://evolution-production-1418.up.railway.app/manager`
→ escanear QR con el número dedicado. Requisito: número propio, que no haya estado
registrado en otra cuenta de WhatsApp.

---

## 8. Deudas conocidas

1. `next/` construye desde la raíz del repo, así que `pg` vive en el `package.json`
   raíz. Se resuelve cuando `next/` sea su propio repositorio.
2. Seis URLs de InsForge dentro de la configuración (avatar y 2 enlaces) — se
   rompen al mudar a R2.
3. El puente sin avatar promete «una sorpresa» que nunca llega (contradice el
   comentario del código original).
4. `evo.mjs crear` no tiene prueba automatizada.

---

## 9. Reglas vigentes

- **No push a `main`**: dispara el despliegue automático de InsForge.
- No tocar `valentina-chat` ni `contact_messages`.
- Sin gasto en OpenAI / Twilio / fal.ai sin presupuesto acordado.
- Ningún secreto en el repo, en issues ni en el chat.
- El repo viejo queda congelado como oráculo hasta pasar la puerta de paridad.
