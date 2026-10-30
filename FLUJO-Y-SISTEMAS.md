# Flujo del proceso y sistemas que lo sostienen

Levantado del código y de la infraestructura el 30-oct-2026. Todo lo que dice aquí
se puede comprobar con los comandos del final.

---

## 1. El recorrido completo, de un clic a un curso

```
  ANUNCIO                 LANDING                     WHATSAPP
  Meta Ads ──────────► index.html ──────────► wa.me/<número>?text=...
  (Facebook/IG)        15 KB, sin CDN              │
       │                                           │
       │ ctwa_clid                                 │  mensaje del cliente
       ▼                                           ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  EVOLUTION API  ·  service "evolution"                       │
  │  Baileys (WhatsApp Web emulado) · instancia "musa"           │
  └───────────────────────────┬──────────────────────────────────┘
                              │  POST /webhook/evolution  (HMAC)
                              ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  SERVIDOR  ·  service "server"  ·  Node, cero dependencias   │
  │                                                              │
  │  1. firma HMAC ──► 403 si no cuadra (fail-closed)            │
  │  2. dedupe ──────► musa_mensajes_vistos (on conflict)        │
  │  3. parsear ─────► canal.parsear()                           │
  │  4. motor ───────► máquina de estados                        │
  │  5. efectos ─────► ejecutar()                                │
  └───────┬──────────────────────────┬───────────────────────────┘
          │                          │
          │ efectos                  │ efectos de datos
          ▼                          ▼
  ┌───────────────┐        ┌─────────────────────────────────────┐
  │  MOTOR        │        │  POSTGRES · service "Postgres-STdR" │
  │  S00 → S11    │◄──────►│  13 tablas musa_* con RLS          │
  │  puro: sólo   │        │  leads, messages, payments, accesos │
  │  devuelve     │        └─────────────────────────────────────┘
  │  Efecto[]     │
  └───┬───────┬───┘
      │       │
      │       └──────────────► VISION  ·  proveedor OpenAI-compatible
      │                        gpt-6-luna · 25 s · 0,00014 USD
      │                        4 defensas: prefiltro, caché, presupuesto, validación
      ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  ENVÍO  ·  Evolution API  (texto, "escribiendo…", media)     │
  └──────────────────────────────────────────────────────────────┘
                              │
                              ▼  enlace personal
                    https://musa.tld/a/<token>   (32 caracteres base64url)
                              │
                              ▼  cookie HttpOnly
                    https://musa.tld/curso       página del alumno
                              │
                              ▼  302 a URL firmada (5 min)
                    ALMACÉN S3 · bucket musa-contenido · 60 objetos · 12,5 GB
```

---

## 2. La máquina de estados

Trece etapas. El motor es **puro**: recibe el estado y el mensaje, y devuelve una
lista de `Efecto[]`; no toca la base ni la red. Eso es lo que lo hace verificable.

| Estado | Qué ocurre | Quién lo decide |
|---|---|---|
| `S00_LLEGADA` | Se registra el lead y la atribución del anuncio | motor |
| `S01_SALUDO` | Tres mensajes de bienvenida | motor + copy verificado |
| `S02_AVATAR` | Se muestra el avatar y qué se va a recibir | motor |
| `S04_STACK_18` | El stack y el aviso de +18 | `gate-edad.ts` |
| `S04_GATE` | Puerta de edad: solo mayores | `gate-edad.ts` |
| `S05_PRECIO` | Precio, qué incluye, objeciones | motor + copy verificado |
| `S06_CIERRE` | Conexión y cierre | motor + copy verificado |
| `S07_DATOS_PAGO` | Cuentas de cobro (solo Colombia) | `s06.ts` + `paises_habilitados` |
| `S08_ESPERA_CAPTURA` | Espera la captura del pago | motor |
| `S09_VERIFICACION` | Lee, valida y decide | `vision/` + `pago-estricto.ts` |
| `S10_ENTREGA` | Crea el acceso y entrega | `repositorio.entregarCurso` |
| `S11_POSTVENTA` | Seguimiento y soporte | motor |
| `S90_FALLBACK_GPT` | Pregunta libre fuera de guion | `gpt_responder` |
| `S91_HUMANO` | Todo lo dudoso, a una persona | `escalado_humano` |

---

## 3. La decisión del dinero, en detalle

Es la parte donde un error cuesta caro, así que va aparte.

```
CAPTURA DE PAGO
      │
      ▼
  ¿es imagen? ──no──► pedir reenvío
      │sí
      ▼
  ¿ya la vi? (sha256) ──sí──► COLA_HUMANA (imagen_duplicada)
      │no
      ▼
  ¿queda presupuesto? ──no──► COLA_HUMANA (sin_presupuesto)
      │sí
      ▼
  MODELO DE VISIÓN ──► 15 campos
      │
      ▼
  ¿los campos son válidos? ──no──► COLA_HUMANA (datos_invalidos)
      │sí
      ▼
  pago-estricto:
    1. país habilitado ......... VE ──► COLA_HUMANA (pais_no_habilitado)
    2. referencia ≥ 4 caracteres ────► COLA_HUMANA (sin_referencia)
    3. destino exacto (no substring) ► COLA_HUMANA (destino_no_coincide)
    4. moneda COP (VES fuera) ───────► COLA_HUMANA (moneda_no_habilitada)
    5. fecha dentro de 24 h ─────────► COLA_HUMANA (comprobante_viejo)
    6. monto en la lista válida ─────► COLA_HUMANA (monto_no_coincide)
    7. estado "exitosa" ─────────────► COLA_HUMANA (estado_programada)
      │todas pasan
      ▼
  reclamar_entrega  ← UPDATE atómico: solo uno gana
      │
      ├──► AUTO_APROBAR ──► entregar_curso
      │                        │
      │                        ├── ok ──► acceso_creado
      │                        └── falla ──► reintento 15 min + aviso al operador
      │
      └──► COLA_HUMANA ──► notificar_operador + S09
```

**Regla de oro:** cualquier duda va a un humano. Un falso positivo entrega el curso
sin cobrar; un falso negativo solo cuesta un mensaje.

---

## 4. Los sistemas, uno por uno

### En producción (Railway)

| Servicio | Qué es | Estado | URL |
|---|---|---|---|
| **server** | El servidor: webhook, motor, visión, acceso, medios | `SUCCESS` · `/salud` 200 | `server-production-3709.up.railway.app` |
| **evolution** | Gateway de WhatsApp (Baileys v2.3.7 parcheado) | `SUCCESS` · manager 301 | `evolution-production-1418.up.railway.app` |
| **Postgres-STdR** | Base de datos: 13 tablas propias + 37 de Evolution | `SUCCESS` | interna |
| **musa-contenido** | Bucket S3: 60 objetos, 12,50 GB | operativo | `t3.storageapi.dev` |

### Variables configuradas (nombres, no valores)

```
server:     DATABASE_URL · EVOLUTION_URL · EVOLUTION_APIKEY · EVOLUTION_INSTANCE
            EVOLUTION_WEBHOOK_SECRET · EVOLUTION_WEBHOOK_HEADER · EVOLUTION_JWT_KEY
            MUSA_IA_URL · MUSA_IA_KEY · MUSA_IA_MODELO · MUSA_IA_JSON
            MUSA_IA_RAZONAMIENTO · MUSA_S3_* · MUSA_URL_PUBLICA · MUSA_CRON_KEY · PORT

evolution:  DATABASE_CONNECTION_URI · AUTHENTICATION_API_KEY · CONFIG_SESSION_PHONE_*
            CACHE_REDIS_ENABLED · DATABASE_SAVE_DATA_*
```

### En local

| Qué | Dónde | Estado |
|---|---|---|
| Código | `C:\Dev\Muse IA Lab` | 98 commits, rama `main` |
| Pruebas | `next/scripts/` (37 suites) | 1.831 aserciones, 0 fallas |
| Arranque en local | `node --experimental-strip-types next/src/main.ts` | comprobado, `/salud` 200 |
| Landing | `next/landing/index.html` | **no publicada** |
| Certificados de cobro | `comprobantes-prueba/` | local, fuera de git |

### Rutas que expone el servidor

| Ruta | Qué hace | Protección |
|---|---|---|
| `POST /webhook/evolution` | Recibe mensajes | firma HMAC + dedupe |
| `GET /salud` | Latido | pública |
| `GET /salud/sesion` | Estado de la sesión de WhatsApp | pública |
| `GET /a/<token>` | Abre el acceso, deja cookie | token de 24 bytes |
| `GET /curso` | Página del alumno (60 archivos) | cookie HttpOnly |
| `GET /media/<token>/<clave>` | Sirve el archivo | token + `claveSegura()` |
| `POST /cron/recordatorios` | Dispara los seguimientos | `MUSA_CRON_KEY` |
| `/diagnostico/ia` | Prueba el proveedor de visión | `MUSA_CRON_KEY` |

---

## 5. Dónde puede fallar, y qué lo cubre

| Falla | Qué pasa | Cobertura |
|---|---|---|
| Evolution caído | No llegan mensajes | monitor de sesión cada 5 min + `/salud/sesion` |
| Postgres caído | El webhook devuelve error y Evolution reintenta | dedupe persistente evita duplicados al reintentar |
| Firma inválida | 403, no se procesa | fail-closed |
| Visión sin presupuesto | Todo a cola humana | tope diario de 1 USD |
| Envío de la entrega falla | Reintento a 15 min + aviso al operador | `entrega_fallida` |
| Número bloqueado | **Nada lo cubre todavía** | pendiente: email de respaldo ya capturado |

---

## 6. Cómo verificarlo tú

```powershell
cd "C:\Dev\Muse IA Lab"

# 1. Todo el sistema, sin red ni base
node --experimental-strip-types next/scripts/verificar-todo.mjs

# 2. Arranque real en local
$env:EVOLUTION_URL='https://e.test'; $env:EVOLUTION_APIKEY='k'
$env:EVOLUTION_WEBHOOK_SECRET='s'; $env:EVOLUTION_INSTANCE='musa'
$env:DATABASE_URL='postgres://f:f@127.0.0.1:5432/f'
node --experimental-strip-types next/src/main.ts

# 3. Producción
curl https://server-production-3709.up.railway.app/salud
curl https://server-production-3709.up.railway.app/salud/sesion
```

---

## Lo que no está encendido

```
  ✅ servidor        encendido, sin tráfico real
  ✅ base de datos   13 tablas, sin clientes
  ✅ almacén         60 objetos, 12,5 GB
  ⚠️  sesión WhatsApp "connecting"  ← falta escanear el QR
  ⬜  landing         sin publicar
  ⬜  número real     vacío a propósito
```

**El sistema está completo y apagado en el último tramo.** Hasta que alguien escanee
el QR, el camino desde el anuncio hasta el curso no tiene primera milla.
