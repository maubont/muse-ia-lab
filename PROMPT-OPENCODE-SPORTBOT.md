# Prompt para OpenCode — Monitoreo y alertas de SportBot

Cópialo entero en OpenCode como instrucción inicial. Está escrito para que el
agente **investigue primero** y no asuma la arquitectura: SportBot no es igual
que el otro proyecto de referencia.

---

## Rol

Eres un ingeniero de confiabilidad trabajando sobre **SportBot**, un bot de ventas
por WhatsApp que ya está en producción y con clientes. Tu tarea es que **una caída
deje de ser invisible**.

Trabaja con evidencia: lee el código antes de escribir, y no cambies
comportamiento existente sin decirlo.

## El problema que vas a resolver

SportBot puede estar **muerto sin dar ningún error**. La sesión de WhatsApp se
desconecta, el gateway sigue respondiendo "ok", y nadie se entera hasta que un
cliente se queja —o hasta que se pierde un día entero de ventas.

Hoy no existe:

1. Una forma de preguntar **"¿pueden salir mensajes ahora mismo?"** (distinto de
   "¿el proceso vive?").
2. Un aviso que llegue a una persona cuando la respuesta es "no".

Y el detalle que hace esto delicado: **si WhatsApp está caído, no puedes avisar
por WhatsApp.** El aviso tiene que salir por otro canal.

## Contexto verificado (confírmalo, no lo asumas)

- El gateway de WhatsApp corre en **Railway**: Evolution API + Postgres + volumen
  persistente. El webhook apunta a una **función de Supabase**.
- La autenticación del webhook es una cabecera estática (`x-evolution-secret`).
- El chatbot y los mensajes viven en **Supabase**.
- Redis está desactivado a propósito (`CACHE_REDIS_ENABLED=false`,
  `CACHE_LOCAL_ENABLED=true`). No lo actives.

**Lo primero que debes averiguar**, porque cambia el diseño:

| Pregunta | Por qué importa |
|---|---|
| ¿El proceso que atiende el webhook es un **contenedor persistente** o una **función serverless**? | Un `setInterval` no sobrevive en serverless |
| ¿Existe ya algún endpoint de salud? ¿Qué devuelve, y devuelve 200 aunque la sesión esté caída? | Es exactamente el fallo que hay que corregir |
| ¿Dónde están la URL del gateway y la API key? ¿Secreto de Supabase, variable de Railway, ambas? | Determinan dónde vive la configuración |
| ¿Hay algún cron o tarea programada ya configurada? | Reutilizar antes que crear |

Presenta estas respuestas **antes** de tocar nada.

## Prohibiciones duras

- **No** pongas tokens, API keys ni secretos en el código, en el repositorio ni en
  los logs. Solo en variables de entorno o secretos.
- **No** envíes la alerta por WhatsApp: es el canal que puede estar roto.
- **No** reinicies ni reconfigures el contenedor de Evolution ni su volumen. El
  volumen es un activo frágil: si se pierde, hay que volver a escanear el QR.
- **No** ejecutes operaciones destructivas en la base de datos de producción.
- **No** cambies el comportamiento del bot ni el flujo de ventas. Esto es
  observabilidad: se añade, no se reemplaza.
- **No** instales servicios de pago. Todo debe funcionar con planes gratuitos.

## Fase 1 — El endpoint que dice la verdad

Crea una ruta de salud **de sesión**, separada de la de proceso:

```
GET /salud/sesion
  → 200 { ok: true,  estado: "open" }
  → 503 { ok: false, estado: "close" | "connecting" | "desconocido", detalle?: "..." }
```

Reglas:

- **200 solo si el estado es `open`**. Cualquier otra cosa es 503, para que un
  monitor externo lo detecte sin leer el cuerpo.
- Si no se puede leer el estado, responde **503 con `desconocido`**: no poder
  mirar es un síntoma, no un "todo bien".
- No expongas la API key ni la URL interna en la respuesta.
- Tope de tiempo en la consulta (≤10 s). Si el gateway no responde, 503.

Cómo se consulta el estado real en Evolution API:

```
GET {EVOLUTION_URL}/instance/connectionState/{instancia}
Cabecera: apikey: {EVOLUTION_APIKEY}
Respuesta útil: { "instance": { "state": "open" | "connecting" | "close" } }
```

## Fase 2 — El canal de aviso

Implementa un **adaptador de alertas** que hable el formato de cada servicio.
Mandar el cuerpo equivocado falla en silencio, y una alerta que no llega es peor
que no tener alertas, porque crees que estás cubierto.

| Servicio | Detección por URL | Cuerpo |
|---|---|---|
| Telegram | `api.telegram.org` | `{ chat_id, text, disable_web_page_preview: true }` |
| Discord | `discord.com/api/webhooks` | `{ content }` (máx. 1900 caracteres) |
| Slack | `hooks.slack.com` | `{ text }` |
| Genérico (n8n, Make) | cualquier otra | `{ text, fuente, cuando }` |

- **Telegram no usa número de teléfono**: usa `chat_id`. Se obtiene escribiéndole
  al bot (`/start`) y leyendo `.../bot<TOKEN>/getUpdates` → `result[0].message.chat.id`.
- Recorta el texto al límite de cada servicio; no dejes que un mensaje largo se
  pierda por excederlo.
- Si el servicio responde 4xx, **no lo silencies**: registra el motivo (sin el
  token) y deja que la vigilancia lo sepa.

Variables de entorno necesarias:

```
MUSA_ALERTA_WEBHOOK=      # URL completa del webhook
MUSA_ALERTA_CHAT_ID=      # solo Telegram
```

**Valida esa configuración al arrancar** y escribe una línea clara:
`alertas: configuradas` o `alertas: <qué falta>`. Mejor saber hoy que no vas a
recibir avisos, que descubrirlo el día de la caída.

## Fase 3 — La vigilancia, según el runtime que encontraste

**Si el webhook corre en un contenedor persistente** (Railway, VPS, Node):

Un bucle cada 5 minutos con esta política, que es la parte que hay que copiar bien:

```
estado nuevo "open" y antes "close"   → avisar "✅ volvió"
estado nuevo distinto de "open", primera vez → avisar "⚠️ caída"
lleva < 60 s caído                    → NO avisar (gracia: evita el parpadeo de reconexión)
sigue caído                           → repetir como máximo cada 30 min, no cada 5
cada aviso enviado                    → registrar la hora (para no machacar)
el envío de la alerta falla           → una vez, sin bucle; no romper la vigilancia
```

**Si es serverless** (Supabase Edge Functions, Vercel Functions), **no uses
`setInterval`**: no sobrevive entre invocaciones. En su lugar:

- Programa una función con el cron de Supabase cada 5 minutos, que consulte el
  estado y aplique la misma política guardando el último estado y la hora del
  último aviso **en una tabla** (o en el mismo Postgres).
- Añade además un monitor externo gratuito (UptimeRobot, BetterStack) apuntando a
  la ruta pública de salud: cubre el caso en que **todo** el backend esté caído,
  donde ninguna función puede avisar porque no hay quién ejecute.

**Las dos capas cubren fallos distintos.** No son redundantes:

| Falla | Vigilancia interna | Monitor externo |
|---|---|---|
| WhatsApp se desconecta | ✅ | ✅ |
| El proceso muere | ❌ no hay quién avise | ✅ |
| El proveedor entero cae | ❌ | ✅ |
| Un deploy rompe la app | ❌ | ✅ |

## Fase 4 — Pruebas obligatorias

Escribe pruebas automatizadas, ejecutables sin red:

1. `open` → 200 · `close` → 503 · `connecting` → 503 · lectura que lanza → 503 `desconocido`.
2. Detección de formato por URL: telegram, discord, slack, genérico.
3. Cuerpo correcto por formato (Telegram con `chat_id` y `text`; Discord con `content`).
4. Recorte de textos largos al límite de cada servicio.
5. Política de avisos:
   - caída → avisa; caída de 5 s → **no** avisa (gracia);
   - caída ya avisada hace 10 min → **no** repite;
   - caída avisada hace 31 min → **sí** repite;
   - recuperación → avisa una vez;
   - alerta que falla → no entra en bucle.
6. Configuración incompleta → arranca igual, pero **dice qué falta**.

## Criterios de aceptación

- [ ] `/salud/sesion` devuelve 503 con la sesión caída y 200 con la sesión abierta.
- [ ] El endpoint responde en menos de 10 s aunque el gateway esté colgado.
- [ ] Una caída real produce **un** aviso en Telegram (o el canal configurado).
- [ ] No hay ningún secreto en el repositorio (`git grep` del token: cero resultados).
- [ ] El bot sigue vendiendo igual: el flujo no cambió.
- [ ] Las pruebas nuevas pasan y las existentes siguen pasando.
- [ ] Hay una línea de log al arrancar que dice si las alertas están configuradas.

## Informe final que debes entregar

1. Qué encontraste: runtime, endpoint de salud previo, dónde vive la configuración.
2. Qué implementaste y **por qué así** (contenedor o serverless).
3. Qué pruebas añadiste y el resultado de la suite completa.
4. Qué queda pendiente y qué necesita una decisión humana (por ejemplo, crear el
   bot de Telegram y pegar `chat_id`).
5. Cualquier cosa que hayas descubierto que no cuadre con lo que dice este prompt.

## Una advertencia

Si algo de este prompt no encaja con lo que encuentres en el código, **dilo y
explica por qué** en vez de forzarlo. Este documento describe un diseño probado en
otro proyecto; SportBot puede tener razones legítimas para ser distinto.
