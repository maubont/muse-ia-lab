# Propuesta — «Consola Musa»: dashboard administrativo

**Fecha:** 13 de junio de 2026
**Investigación de respaldo:** 8 agentes (6 perspectivas paralelas/laterales + arquitecto + crítico exigente)
**Estado:** Propuesta para aprobación — se construiría como Fase 5 (antes de la landing/campaña, por decisión del dueño)

---

## 1. Visión

**«Consola Musa»** es un centro de mando **móvil-first** que convierte a Musa de una caja negra que se opera por comandos de WhatsApp en un negocio que ves y controlas desde el celular. Tres promesas:

1. **OPERAR sin WhatsApp** — aprobar/rechazar pagos con dos toques (viendo la captura y lo que la visión leyó), tomar el control de un chat, editar tasa y cuentas. Todo **reusando exactamente la lógica del bot** (`procesarComandoOperador`, `entregarCurso`) para que el panel nunca diverja.
2. **ENTENDER el negocio** — embudo real reconstruido desde los eventos, la métrica reina (precio → pidió pagar), margen neto medido al centavo y costo por anuncio.
3. **PROTEGER los activos** — antifraude de comprobantes, salud del número de WhatsApp (es un activo desechable: un reporte puede banearlo) y reconciliación pago→entrega (cero compradores sin producto).

**Principio rector:** el bot entrega producto digital irreversible al instante, así que un falso positivo cuesta dinero real y un solo reporte puede tumbar el número. El panel existe para **detectar y resolver antes de que escale**. Y en lo crítico, el panel no se mira: te busca por el mismo WhatsApp que ya usa `notificarOperador`.

---

## 2. Las 7 pantallas

### 🏠 Inicio / Pendientes (aterrizaje móvil)
Responder en 2 segundos: *¿hay algo que exige mi mano ahora?* Si todo está en 0, el día va solo.
- **Pagos en cola** (`musa_payments` status='revision') con badge rojo si el más viejo supera el umbral.
- **Leads esperando humano** (`escalado_humano=true AND pagado=false`).
- **Chats vivos sin responder** (último mensaje entrante en 24 h).
- **Semáforo de salud**: tasa del día fresca · cuentas VE reales (no provisional) · sin disparos de circuit breaker.

### 💳 Bandeja de pagos (el corazón operativo)
- **Tarjeta de comprobante**: imagen + datos que extrajo la visión + `motivo_flag` traducido a español ("el número que recibió no es el nuestro", "pagó de menos"…) + monto vs precio del día + antigüedad con color.
- **Botones Aprobar / Rechazar / Aprobar igual** → ejecutan el MISMO camino que `ok/no <id>` (entrega automática de los 17 enlaces), idempotente.
- **Tira de resueltos hoy** con opción de deshacer un rechazo.

### 💬 Conversaciones en vivo + tomar el control
- Lista de leads activos con su etapa (en español), país y a quién le toca responder.
- Filtro "requieren mi atención" (escalados + atascados).
- Abrir el chat completo + timeline de eventos + **Tomar / Devolver el control** + responder manual.

### 📊 Embudo y Growth
- Embudo por **máximo estado alcanzado** (dónde está la mayor fuga).
- **Métrica reina**: % que pidió pagar tras ver el precio.
- A/B avatar **personalizado vs genérico** (% que responde tras el video).
- CPA real por anuncio (vía `ctwa_clid`/`source_id`).

### 💰 Finanzas (caja, costo y margen)
- Ingresos del día / 14 días por moneda y método.
- Costo Twilio medido + OpenAI/fal (medido tras instrumentar `response.usage`).
- **Margen neto real por venta** y antes de publicidad.

### 🛡️ Riesgo y salud
- **Reconciliación aprobado-vs-entregado** (debe dar 0).
- Detector de comprobantes duplicados (por `image_phash`).
- Señales de manipulación, gate 18+, opt-outs, salud del número.

### ⚙️ Configuración
- Editar tasa y **cuentas de pago** desde el móvil (activar las de Venezuela desbloquea el auto-aprobado del mercado principal — hoy bloquea ventas en silencio).
- Costos vivos (para recalcular margen sin redeploy).

---

## 3. Las joyas innovadoras (lo que un panel ordinario NO tiene)

Factibles desde ya:
- **Consola de turno en tiempo real**: la cola vibra/suena cuando entra un pago o un escalado (InsForge Realtime).
- **Comprobante con resaltado de coincidencia**: muestra los números que la visión extrajo y resalta cuál coincidió (o no) con tus cuentas — decisión en un vistazo.
- **Sugeridor de respuesta para escalados**: precarga un borrador (con el mismo `gpt_system` del bot) para que solo edites y envíes.
- **Alerta proactiva a tu WhatsApp**: te avisa de un "aprobado-sin-entregar", costo de OpenAI disparado o tasa vencida — reusando el canal que ya existe.
- **Instrumentar `response.usage` de OpenAI** (1 cambio, máximo ROI): convierte el margen de "estimado" a "medido al centavo".

Para más adelante (el crítico recomienda posponer):
- Sankey del flujo real del funnel, "detector del mensaje asesino" (copy que mata la conversión), cierre estadístico del A/B a 30 días, detector de fuga cambiaria. *Son gemas, pero necesitan volumen de leads para no ser ruido.*

---

## 4. Veredicto del crítico (lo que ajusta el plan)

> «Diseño FUERTE en dominio y arquitectura; la intuición de negocio es correcta (la cola de pagos y la reconciliación son el centro, no las métricas de vanidad). PERO no es construible "tal cual": el MVP real es más pequeño.»

**2 prerrequisitos obligatorios antes de cualquier pantalla:**

1. ⚠️ **Bug latente que hay que arreglar igual**: hoy la imagen del comprobante se guarda como la **URL de Twilio (que expira)**, no en el bucket. El navegador no podría cargarla → rompería la bandeja de pagos, y además las capturas viejas ya no se pueden ver. Fix pequeño: subir al bucket privado `musa-capturas` los bytes que ya se descargan y guardar ese `storage_key`. **Recomiendo hacerlo ya, sea que construyamos el panel o no.**
2. **Refactor a librería compartida**: extraer `procesarComandoOperador`, `entregarCurso`, etc. del webhook (monolito de ~2.500 líneas) a un módulo común, para que el panel reuse la lógica sin duplicarla. Riesgo controlado (re-corremos las pruebas del bot).

**Riesgo de plataforma a decidir antes:** el plan gratis de InsForge está **compartido con tu CV** (`valentina-chat`). Sumar 5 edge functions + Realtime + hosting + auth podría chocar con los límites y forzar un upgrade de pago. Hay que confirmarlo — puede cambiar el caso de negocio del panel.

**Seguridad:** el panel usa un patrón de auth nuevo (JWT del dueño) distinto del `x-cron-key` actual. Como las funciones admin usan la API key total (se salta RLS), un bug de validación expondría todas las tablas. Necesita una revisión de seguridad dedicada.

---

## 5. MVP recomendado (lo que usarías a diario, construible rápido)

**Semana 0 (prerrequisitos):** arreglar la persistencia de la imagen del comprobante + refactor a `musa-core.ts`.

**Núcleo del MVP:**
- Edge function `musa-admin-data` (vistas Inicio + Pagos, con JWT del dueño y admin key server-side).
- Edge function `musa-admin-resolver-pago` (Aprobar/Rechazar reusando la lógica del bot, idempotente con `UPDATE … WHERE status='revision'`).
- **Pantalla Inicio** (4 contadores + semáforo de salud).
- **Pantalla Bandeja de pagos** (tarjeta con imagen + visión + motivo traducido + botones).
- **Editor de tasa y cuentas** (activar las de Venezuela = desbloquear ventas).
- Auth de un solo usuario (InsForge Auth) sobre el static hosting.

**Quick wins baratos y de alto valor** (se pueden colar en el MVP):
- Reconciliación aprobado-vs-entregado como primer widget de riesgo (un `LEFT JOIN`, debe dar 0).
- Instrumentar `response.usage` de OpenAI (guardar tokens en eventos que ya se escriben).
- Diccionario de `motivo_flag` → español en el front.
- Detector de duplicados por `image_phash` (el índice ya existe).
- Alerta proactiva "aprobado-sin-entregar" al WhatsApp del dueño (cron + canal existente).

**Fuera del MVP** (Fase 2+): Realtime (un solo usuario, basta polling), conversaciones-en-vivo completas, y toda la analítica de Growth/Finanzas.

---

## 6. Roadmap

| Fase | Semanas | Entregables |
|---|---|---|
| **0 · Cimientos** | previa | Fix imagen comprobante + refactor `musa-core.ts` + confirmar límites del plan InsForge |
| **1 · Operar (MVP)** | 1–2 | Inicio, Bandeja de pagos, Config (tasa/cuentas), auth, resolver-pago, reconciliación, motivo en español |
| **2 · Entender** | 3–4 | Embudo + métrica reina, A/B avatar, Finanzas (caja + costo Twilio medido) |
| **3 · Medir al centavo y proteger** | 5–6 | `response.usage` → margen medido, pantalla Riesgo completa, CPA por anuncio (tabla `musa_ad_spend`) |
| **4 · El panel te busca** | 7+ | Alertas proactivas, sugeridor de respuesta, resaltado de coincidencia, Realtime, modo guardia |

---

## 7. Stack técnico

- **Hosting:** InsForge static hosting sirve una SPA. Framework: **Preact o Svelte** (bundle mínimo, ideal para móvil con datos celulares) o React+Vite. UI ligera optimizada para una mano.
- **Datos:** patrón BFF — una edge function `musa-admin-data` que pre-agrega cada vista y devuelve JSON. La admin key **nunca** llega al navegador.
- **Escrituras:** funciones `musa-admin-*` que reusan la lógica del bot, con `UPDATE` atómico condicional para evitar choques con un comando simultáneo por WhatsApp.
- **Auth:** InsForge Auth, una sola cuenta (el dueño); el hosting redirige a login sin sesión válida.
- **Tiempo real:** polling cada 30–60 s en el MVP (un solo usuario); Realtime en Fase 4.

---

## 8. Métricas norte (lo que mirar siempre)

1. **Pagos en cola** y antigüedad del más viejo — el cuello de botella nº 1.
2. **Ventas de hoy = entregas** y caja en USD-equivalente — el pulso.
3. **Métrica reina:** % que pidió pagar tras ver el precio — el termómetro de persuasión.
4. **Margen antes de ads por lead** y conversión global (umbral crítico ≥5%) — vida o muerte.
5. **Reconciliación aprobado-sin-entregar (= 0)** + salud del número — los riesgos que matan el negocio entero.
