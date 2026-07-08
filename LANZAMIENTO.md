# 🚀 LANZAMIENTO — Línea base (26-jun-2026)

> **LA LÍNEA:** lanzar la campaña CTWA en **Colombia**, cobrando con el **flujo manual ya
> validado** (captura + visión + auto-aprobación, Fase 4). **Wompi queda POST-lanzamiento**
> (el código ya está construido y dormido tras el toggle `pago.proveedor`).
> **100% = anuncios activos + capacidad real de cobrar y entregar.**
> Todo lo que no esté en este archivo NO bloquea el lanzamiento. No se agrega alcance.

**Seguimiento:** marca `[x]` la casilla al completar y corre
`node scripts/progreso-lanzamiento.mjs` para ver el % por fase y total.
Responsable: **TÚ** = solo Mauricio puede hacerlo · **CLAUDE** = pídemelo y lo ejecuto · **AMBOS** = juntos.

---

## FASE A — Cimientos técnicos (hoy, ~1 día)

- [x] **A1.** Decisión de línea base: lanzar sin Wompi, solo Colombia, flujo manual. (peso 2) — AMBOS
- [x] **A2.** Commit + push de TODO el trabajo pendiente (webhook editado, función Wompi dormida, scripts, este plan). CI verde. ✅ 26-jun (commit 1dbad96, push autorizado por el dueño). (peso 5) — CLAUDE
- [x] **A3.** Aplicar copy Colombia-only en BD (`node scripts/build-copy-colombia.mjs --apply`) + apagar Venezuela y fijar proveedor manual (`node scripts/setup-pago-colombia.mjs --apply`). ✅ 26-jun. (peso 5) — CLAUDE
- [ ] **A4.** Rotar el Auth Token de Twilio (consola Twilio) y actualizar el secret `TWILIO_AUTH_TOKEN` en InsForge. Quedó expuesto en un chat; obligatorio antes de dinero real. (peso 3) — TÚ (te guío)
- [x] **A5.** Verificación e2e en sandbox tras A2+A3: conversación completa (saludo→precio COP→cierre→datos CO→captura) confirmando que NO aparece Venezuela/Bs por ningún lado. ✅ 26-jun 8/8 checks (`node scripts/verificar-funnel-colombia.mjs`, re-usable tras cada deploy). (peso 5) — CLAUDE

**Subtotal: 20**

## FASE B — Canal de producción: número WhatsApp real (CRÍTICO — empezar HOY)

> El sandbox de Twilio (+1 415…) exige que el usuario mande un código para entrar:
> **no sirve para tráfico frío de anuncios.** Este es el camino crítico del lanzamiento.
> Nota: Twilio registra el número en la plataforma de Meta por ti (embedded signup).
> NO se necesita verificación completa del negocio para lanzar: solo Meta Business
> Manager (gratis, ~10 min) + revisión del display name (minutos–48h, normalmente
> automática). El nivel sin verificar sobra: en CTWA el lead escribe PRIMERO y
> responder en la ventana de 24h es ilimitado; el tope de 250/día solo aplica a
> plantillas que iniciamos nosotros (post-24h). Verificación completa = post-lanzamiento si escala.

- [ ] **B1.** Conseguir el número para WhatsApp Business (comprar número en Twilio o usar uno propio dedicado — NO el personal). (peso 3) — TÚ (te guío)
- [ ] **B2.** Registrar el WhatsApp Sender en Twilio (embedded signup con Meta Business Manager): display name **«Modelos IA»** (respaldo: «Muse IA Lab»). Espera realista: minutos–48h. (peso 10) — TÚ (te guío paso a paso)
- [ ] **B3.** Aprobado el sender: apuntar el webhook al número nuevo y actualizar secrets `TWILIO_WHATSAPP_FROM` y `MUSA_WEBHOOK_URL`. Smoke test de eco. (peso 7) — AMBOS
- [ ] **B4.** Prueba de fuego con dinero real: compra completa desde otro número (pago Nequi real de ~33.000 COP a tu propia cuenta) → captura → auto-aprobación → entrega de 17 enlaces. De paso se confirma la firma Twilio con imagen → endurecer a 403 los mensajes de lead. (peso 8) — AMBOS
- [ ] **B5.** Confirmar operativa del operador: comandos `ok/no/ver` desde tu WhatsApp real y panel Consola accesible desde el celular. (peso 2) — TÚ

**Subtotal: 30**

## FASE C — Coherencia de marca (en paralelo con la espera de Meta)

- [ ] **C1.** Cablear la Musa definitiva (Fusión C) al saludo del bot: nuevo video base + genéricos en el bucket + actualizar `musa_videos_cache` (el video del anuncio y el del chat deben ser LA MISMA mujer). (peso 8) — CLAUDE (gasto fal ~$1–2; confirmar saldo)
- [ ] **C2.** Verificar que los 17 enlaces de entrega (Drive) están vivos y correctos. (peso 4) — CLAUDE
- [ ] **C3.** Completar titular parcial visible de Nequi y Bre-B en `cuentas_co` (hoy dice "PENDIENTE"). (peso 3) — TÚ (1 mensaje) + CLAUDE aplica

**Subtotal: 15**

## FASE D — Campaña CTWA (cuando B esté ≥ B3)

- [ ] **D1.** Meta Business Manager listo: página de Facebook (+ IG opcional) del negocio, cuenta publicitaria activa y método de pago de anuncios cargado. (peso 5) — TÚ (te guío)
- [ ] **D2.** Subir creativos finales (ad-fb-cine, ad-ig-cine, ad-ig-talk + stills) con los copys de `PROPUESTA-CTWA.md`. (peso 6) — AMBOS
- [ ] **D3.** Configurar la campaña CTWA: objetivo mensajes a WhatsApp, público Colombia, presupuesto inicial definido (sugerido: 30–60k COP/día para validar), texto prellenado por ángulo. (peso 9) — AMBOS
- [ ] **D4.** 🚀 **LANZAR: anuncios ACTIVOS.** (peso 12) — TÚ
- [ ] **D5.** Primer día de monitoreo: leads entrando, embudo en la Consola, primer pago real o diagnóstico de fuga. Ajustar, no perfeccionar. (peso 3) — AMBOS

**Subtotal: 35**

---

## 📦 POST-LANZAMIENTO (backlog — NO cuenta para el %, NO tocar antes de D4)

1. **Wompi** (código listo): recuperar contraseña → 3 secrets → deploy `musa-wompi-events` → `setup-pago-colombia.mjs --apply --wompi` → registrar URL de eventos → prueba sandbox.
2. Video personalizado por nombre vía Kling en el seguimiento del indeciso.
3. Landing + retargeting (solo si CTWA escala).
4. Refactor `functions/lib/musa-core.ts` (unificar `entregarCurso` duplicado).
5. Kill-switch pHash real, verificación de titular en comprobantes.
6. Número de operador separado del personal.
7. Reactivar Venezuela (rellenar `cuentas_ve` reales + `provisional=false`).
