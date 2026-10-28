# Despliegue del gateway de WhatsApp de Musa

Evolution API v2 sobre Railway, con Postgres y **volumen persistente** para la
sesión de WhatsApp. Webhook firmado. Sin secretos en este documento: solo
nombres de variables y placeholders.

> Ruta recomendada para un primer MVP: `docker-compose.local.yml` para validar el
> canal en tu máquina, y después el mismo stack en Railway.

---

## 1. Local

```powershell
cd next/deploy
copy .env.example .env     # rellenar AUTHENTICATION_API_KEY / EVOLUTION_JWT_KEY
docker compose up -d --build
```

`--build` es obligatorio la primera vez: la imagen oficial **no puede vincular**
(ver `evolution/Dockerfile`).

Crear la instancia y ver el QR:

```powershell
$key  = $env:AUTHENTICATION_API_KEY
$body = @{ instanceName="musa"; qrcode=$true; integration="WHATSAPP-BAILEYS" } | ConvertTo-Json

Invoke-RestMethod "http://localhost:8080/instance/create" -Method POST `
  -Headers @{apikey=$key} -ContentType "application/json" -Body $body

Invoke-RestMethod "http://localhost:8080/instance/connect/musa" -Headers @{apikey=$key} |
  Select-Object -ExpandProperty base64
```

El QR se renueva cada ~20 s: un PNG guardado se vence antes de escanearlo. Abre
`http://localhost:8080/manager` con la API key, o pide el base64 en bucle.

Cuando vincula, `connectionState` pasa a `open` y `ownerJid` trae el número.

**Los mensajes propios (`fromMe`) se ignoran.** Escribirte a ti mismo no prueba
nada: la prueba real necesita **un segundo número**.

---

## 2. Railway

| Paso | Qué |
|---|---|
| 1 | **New Project** → *Empty Project* |
| 2 | **Create → Database → PostgreSQL** |
| 3 | **Create → Docker Image** → la imagen construida desde `evolution/` |
| 4 | Servicio del gateway → **Settings → Volumes → Add Volume** → mount `/evolution/instances` |
| 5 | **Settings → Networking → Generate Domain** (puerto `8080`) |

### Variables del gateway (solo nombres)

```
SERVER_URL                    https://${{RAILWAY_PUBLIC_DOMAIN}}
AUTHENTICATION_API_KEY        <generar>
DATABASE_PROVIDER             postgresql
DATABASE_CONNECTION_URI       ${{Postgres.DATABASE_URL}}
DATABASE_SAVE_DATA_INSTANCE   true
DATABASE_SAVE_DATA_NEW_MESSAGE true
DATABASE_SAVE_MESSAGE_UPDATE  true
DATABASE_SAVE_DATA_CONTACTS   false
DATABASE_SAVE_DATA_CHATS      false
DATABASE_SAVE_DATA_HISTORIC   false
CACHE_REDIS_ENABLED           false
CACHE_LOCAL_ENABLED           true
TELEMETRY_ENABLED             false
CONFIG_SESSION_PHONE_CLIENT   Muse IA Lab
LANGUAGE                      es
WEBHOOK_GLOBAL_ENABLED        false
```

Si Prisma se queja del esquema, añadir `?schema=public` a `DATABASE_CONNECTION_URI`.

### Variables del servidor de Musa

Las lee `next/src/config.ts` (contrato probado en `test-config.mjs`):

```
EVOLUTION_URL       https://<servicio>-<proyecto>.up.railway.app
EVOLUTION_APIKEY    <la misma AUTHENTICATION_API_KEY>
EVOLUTION_INSTANCE  musa
EVOLUTION_JWT_KEY   <secreto de firma del webhook>
```

Si falta alguna, el arranque lo dice **por nombre** y nunca imprime el valor.

---

## 3. Webhook (una sola vez, por instancia)

Con el CLI de Musa:

```powershell
node next/scripts/evo.mjs webhook-set `
  --url https://<servidor-musa>/webhook/evolution `
  --jwt <EVOLUTION_JWT_KEY>
```

### Dos mecanismos de autenticación (el adaptador acepta ambos)

| Mecanismo | Cómo viaja | Cuándo usarlo |
|---|---|---|
| **JWT HS256** | `Authorization: Bearer …`, 10 min de vida | Preferido. Verificado en el código de `main` de Evolution |
| **Secreto compartido** | cabecera estática (`x-evolution-secret` por defecto) | **Obligatorio como respaldo**: v2.3.7 no está confirmado que firme |

Si solo configuras el JWT y la versión desplegada no firma, **el servidor rechaza
el 100 % de los eventos con 403**. Configura también el secreto compartido hasta
verificar en producción cuál llega:

```
EVOLUTION_WEBHOOK_SECRET=<secreto>
EVOLUTION_WEBHOOK_HEADER=x-evolution-secret
```

Verificar: `node next/scripts/evo.mjs webhook-ver` debe mostrar `jwt_key: configurado`.
Y en los logs del servidor, el motivo `ok` o `secreto_compartido` dice cuál está
funcionando.

**Un solo webhook: el de instancia.** Con el global y el de instancia activos,
cada evento se entrega dos veces.

---

## 4. Recuperación

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| La instancia pasa a `close` sola | Reinicio del contenedor, red, o el teléfono cerró la sesión | `evo.mjs qr` y reescanear. Si se repite en cada redeploy: **falta el volumen** |
| `connectionState` en `connecting` y el teléfono dice "no se pudo vincular" | Imagen sin el parche de Baileys | Construir desde `evolution/Dockerfile`; el build falla si el parche no aplica |
| Webhook responde 403 | `jwt_key` distinto entre gateway y servidor, o reloj desfasado | Comparar nombres de variable, no valores; el JWT dura 10 min |
| Cada evento llega dos veces | Webhook global **y** de instancia activos | Dejar solo el de instancia (`WEBHOOK_GLOBAL_ENABLED=false`) |
| El envío "no falla pero no llega" | `sendText` cuelga con la sesión caída | El adaptador corta a 10 s y reporta `timeout`; la alerta real debe mirar `connectionState` |

### El activo más frágil

`/evolution/instances` guarda el `authState` de Baileys. **Si se pierde, hay que
reescanear el QR** y hasta que alguien lo haga el negocio no vende. Respaldar ese
volumen vale más que respaldar la base.

---

## 5. Reglas que no se negocian

- El payload del webhook trae **`apikey` en claro**: no loguear cuerpos crudos.
- Un solo webhook: el de instancia.
- Ningún secreto en el repositorio, en un issue o en el chat.
- Número **dedicado** de Musa: distinto del personal y del de cualquier otro
  proyecto. Nunca compartido.
