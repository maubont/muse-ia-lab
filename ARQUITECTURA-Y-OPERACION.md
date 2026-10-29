# Musa — arquitectura y operación

**Última actualización:** 29-oct-2026. Todos los datos están verificados contra los
sistemas reales, no de memoria.

---

## 1. Qué está en producción y qué está en local

| Pieza | Dónde vive | Estado |
|---|---|---|
| **Gateway de WhatsApp** (Evolution API v2.3.7 + parche Baileys) | Railway · servicio `evolution` | Online, volumen persistente |
| **Servidor de Musa** (webhook, motor, API) | Railway · servicio `server` | Online |
| **Base de datos** (Postgres) | Railway · servicio `Postgres-STdR` | Online, volumen |
| **Almacén del curso** (12,5 GB) | Railway · bucket `musa-contenido` | 60 objetos, URL firmadas |
| **Página del curso** | Servida por `server` | `/a/<token>` → `/curso` |
| **Landing** | Local · `next/landing/` | **No publicada** |
| **Sistema viejo** (InsForge + Twilio) | InsForge | Congelado, sin usar |
| **Repositorio** | GitHub `maubont/muse-ia-lab` | Rama `deploy/evolution` |

### URLs

```
Gateway       https://evolution-production-1418.up.railway.app
Servidor      https://server-production-3709.up.railway.app
Bucket        musa-contenido-vnsi2hk5um.t3.storageapi.dev (S3, región iad)
```

### La base de datos tiene 49 tablas

- **37 son de Evolution** (`Chat`, `Contact`, `Message`, `Instance`, `Webhook`…). No se tocan.
- **12 son de Musa**, todas con RLS activo:

| Tabla | Filas hoy | Qué guarda |
|---|---|---|
| `musa_settings` | 13 | Configuración: copy del funnel, precios, cuentas, entrega |
| `musa_leads` | 5 | Un registro por cliente |
| `musa_messages` | 19 | Mensajes entrantes y salientes |
| `musa_payments` | 0 | Comprobantes procesados |
| `musa_funnel_events` | 65 | Todo lo que pasa (auditoría) |
| `musa_recordatorios` | 9 | Seguimientos programados |
| `musa_accesos` | 6 | Tokens de acceso al curso |
| `musa_consumo_ia` | 0 | Gasto en IA, con tokens y coste |
| `musa_lecturas_cache` | 0 | Lecturas ya pagadas, por huella |
| `musa_exchange_rates` | — | Tasas de cambio |
| `musa_testimonios` | — | Testimonios |
| `musa_videos_cache` | — | Caché de videos del avatar |

**Todo lo que hay es dato de prueba.** No hay un solo cliente real.

---

## 2. Flujo de una conversación

```
Cliente escribe en WhatsApp
        │
        ▼
┌─────────────────────┐
│ Evolution (gateway) │  firma JWT o cabecera estática
└─────────┬───────────┘
          │ POST /webhook/evolution
          ▼
┌─────────────────────┐
│ server              │  1. verifica firma   (fail-closed)
│                     │  2. parsea           ([] si no es mensaje)
│                     │  3. deduplica por id (reintentos de Evolution)
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ motor real          │  carga lead · registra mensaje · decide
│  └─ router          │  STOP → opt-out · «¿bot?» → honestidad
│      └─ S00…S10     │  · pide humano → escala · resto → estado
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ ejecutor + repo     │  efectos: lead, estado, enviar, media,
│                     │  reclamar_entrega, entregar_curso, evento
└─────────┬───────────┘
          ▼
    WhatsApp (respuesta con «escribiendo…» y ritmo humano)
```

---

## 3. Flujo del cobro (el camino que produce dinero)

```
cliente dice «dale»
        │
        ▼
S06_CIERRE → S07_DATOS_PAGO      se envían las cuentas (nunca incompletas)
        │
        ▼
S08_ESPERA_CAPTURA               cliente manda la captura
        │
        ▼
┌──────────────────────────────────────────────┐
│ lector de comprobantes                       │
│  1. prefiltro   ¿es imagen? ¿<8 MB? ¿ya pagó?│
│  2. caché       mismo archivo → no se paga   │
│  3. presupuesto gasto del día → si no, humano│
│  4. proveedor   gpt-6-luna lee la imagen     │
└──────────────┬───────────────────────────────┘
               ▼
┌──────────────────────────────────────────────┐
│ capa estricta (sin tocar el módulo verificado)│
│  · destino exacto, no subcadena              │
│  · Venezuela fuera                           │
│  · ventana de 24 h                           │
│  · monto que cuadre exacto                   │
└──────────────┬───────────────────────────────┘
               ▼
        ┌──────┴──────┐
        ▼             ▼
  AUTO_APROBAR    COLA_HUMANA
        │             │
        ▼             ▼
  S10_ENTREGA    acuse al cliente
  barrera atómica + aviso al operador
        │
        ▼
  acceso personal → /curso → 60 archivos
```

### Lo medido con comprobantes reales

| Comprobante | Lectura | Decisión |
|---|---|---|
| Nequi exitosa | 15/15 campos | AUTO_APROBAR |
| Pago Móvil VES | 15/15 | COLA_HUMANA (moneda) |
| Nequi programada | 15/15 | COLA_HUMANA (estado) |

Coste: **$0,00014 por comprobante**. 1.000 comprobantes = **$0,14**.

---

## 4. Flujo de la entrega

```
/admin … no existe: la entrega la dispara el pago
        │
        ▼
reclamar_entrega   UPDATE … WHERE pagado = false RETURNING
        │          (si no gana la carrera, no entrega: anti-doble-entrega)
        ▼
crear acceso       32 caracteres aleatorios, caduca en 365 días
        │          reemitir REVOCA el anterior
        ▼
enviar UN enlace   https://server…/a/Xk9mP2vL8nQ4rT7wB1cF6hJ3
        │
        ▼
cliente abre      302 → cookie HttpOnly → /curso
        │
        ▼
pulsa un video    /media/<token>/curso/01/clase.mp4
                  → 302 a URL firmada (5 min)
                  → el archivo baja del bucket, NO pasa por el servidor
```

**Revocación:** se marca `revocado_en` y el token deja de servir de inmediato.

---

## 5. Seguimientos y vigilancia

```
S07/S08 → se programan 3 recordatorios (20 min · 3 h · 20 h)
S09     → se programa 1 (45 min)
cliente responde → se CANCELAN todos

POST /cron/recordatorios (clave x-cron-key)
  · filtra por política: opt-out, 24 h, horario 8-22, máximo 3
  · si no se puede enviar, REPROGRAMA (no se pierde)
```

```
Monitor de sesión (cada 5 min)
  GET /salud/sesion → 200 si la sesión está abierta, 503 si no
  si cae → aviso por webhook externo (Telegram/Slack/Discord)
  si se recupera → aviso de vuelta
```

---

## 6. La documentación del número

### Lo que cambia cuando llegue

**Solo el número.** Ni una línea de código.

| Paso | Dónde | Qué |
|---|---|---|
| 1 | WhatsApp del teléfono nuevo | Nada. Solo tener el número activo |
| 2 | `https://evolution-production-1418.up.railway.app/manager` | Entrar y abrir la instancia `musa` |
| 3 | Ahí mismo | **Escanear el QR** con el WhatsApp del número nuevo |
| 4 | — | El webhook ya está configurado; no se toca |

Al escanear, la instancia pasa de `connecting` a `open` y el monitor lo refleja:

```
GET /salud/sesion → 200 {"ok":true,"estado":"open"}
```

### Lo que NO hay que cambiar

- ✗ El webhook: ya apunta a `server-production-3709…/webhook/evolution`
- ✗ La API key de Evolution: funciona igual
- ✗ Las variables de Railway: ninguna menciona el número
- ✗ La base de datos: los leads se identifican por su teléfono, no por el de Musa
- ✗ El código

### Los únicos dos sitios donde el número aparece escrito

| Sitio | Dónde | Qué hacer |
|---|---|---|
| Landing | `next/landing/index.html`, variable `NUMERO` | Poner el número real antes de publicar |
| Ninguno más | — | El resto es la instancia `musa` |

### Con un número provisional

Recomendaciones mientras sea de prueba:

1. **Calentar el número.** Primero 20-30 conversaciones al día, subiendo. Un número
   nuevo que recibe 100 el primer día es un patrón que Meta detecta.
2. **Avisar a quien escriba** que es una prueba, si va a recibir tráfico real.
3. **No dar el número en la landing** hasta tener el definitivo: un enlace `wa.me`
   publicado con un número que luego cambia deja anuncios muertos.
4. **Si el número cae**, el procedimiento es el mismo de arriba: número nuevo, QR,
   nada más. Los leads y los accesos siguen en la base.

---

## 7. Qué falta, dicho sin adornos

| Falta | Bloquea |
|---|---|
| **Un número** | Todo lo que implique hablar con alguien real |
| Publicar la landing | Necesita número + datos del titular |
| Testimonios reales | Necesita primeros clientes |
| Revocar la clave de InsForge | Higiene: ya no se usa |
| Alertas (Telegram) | `MUSA_ALERTA_WEBHOOK` sin configurar |
| Monitor externo | Nada apunta a `/salud/sesion` desde fuera |

---

## 8. Cómo comprobar que todo vive

```bash
# salud del proceso y de la sesión
curl https://server-production-3709.up.railway.app/salud
curl https://server-production-3709.up.railway.app/salud/sesion

# ensayo de punta a punta (9 comprobaciones, no gasta IA)
node next/scripts/ensayo-e2e.mjs

# ¿la IA responde? (necesita x-cron-key)
POST /diagnostico/ia

# ¿lee bien un comprobante? (envía la imagen)
POST /diagnostico/ia?imagen=1   {"base64":"…","esperado":{…}}

# estado de la instancia de WhatsApp
node next/scripts/evo.mjs instancias
```
