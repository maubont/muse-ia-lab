# Propuesta — Landing «Modelos IA» (Venezuela-first, click-to-WhatsApp)

**Fecha:** 13 de junio de 2026
**Investigación:** 7 agentes (5 lentes: copy, UX, performance, cumplimiento, innovación + estratega + crítico) sobre `investigacion/landing-ads.json` y el sistema ya construido.
**Estado:** Propuesta para decisión.

---

## 0. La verdad primero (lo que dijo el crítico, y tiene razón)

Pediste la mejor landing sin escatimar. Pero el esfuerzo honesto incluye decirte esto: **para un ticket de impulso de 9 USD en Venezuela con pago manual que SIEMPRE se cierra en el chat, la landing NO es lo que desbloquea ventas.** El click-to-WhatsApp directo (CTWA) convierte estructuralmente mejor (1 tap, abre la ventana gratis de 72 h, pierde menos gente). Una landing intermedia pierde 30–60% del tráfico en el salto en móviles lentos.

**El cuello de botella real no es la landing — son tus datos de pago de Venezuela.** Siguen siendo de simulación (`config/datos-pago.md`: Pago Móvil y cuenta BDV provisionales). Sin eso, ni la landing ni el CTWA pueden cobrar en VE: cada dólar de publicidad sería pérdida total.

**Por eso el plan es:** (1) conseguir los datos VE reales, (2) lanzar **CTWA puro** primero, (3) usar la landing como pieza **mínima y opcional** para habilitar pixel/retargeting, y decidir su futuro por datos al día 14. La propuesta de landing completa existe abajo — pero priorizada con realismo, no construida entera "por si acaso".

---

## 1. Rol en el embudo

```
Anuncio FB/IG (frío)
   ├─ 80% → CTWA directo ──────────────┐
   └─ 20% → Landing (1 pantalla) → wa.me┤→ WhatsApp → Musa (califica, cobra, verifica, entrega)
                                         ┘
```

La landing **no vende ni cobra**: su único trabajo en 30–60 s es (1) probar en 3 segundos que esto es real (Musa = avatar IA = prueba viva), (2) anclar los 9 USD como decisión sin riesgo, (3) demoler las 4 objeciones del ticket bajo, (4) disparar **un solo tap** al chat con el código `Ref` intacto. Métrica a la que se subordina todo: **tap en el botón con Ref legible**.

**Recomendación: arrancar 80% CTWA / 20% landing.** Corte al **día 14** (con ≥30 ventas): si `CPA_CTWA ≤ 0,6 × CPA_landing`, se mata la landing como canal de adquisición y queda solo como destino de retargeting. Sesgo esperado: consolidar **90/10** o apagarla. Se decide por **CPA por pago verificado**, nunca por CPL ni sensación.

---

## 2. Estructura (versión mínima recomendada: 4 secciones, no 9)

El crítico recortó la propuesta de 9 secciones + 6 "joyas" a lo que de verdad mueve el único tap que importa:

1. **HERO** (todo sin scroll en 360×640): video loop mudo de Musa (poster WebP, MP4 <800 KB) + headline + sub-headline del mecanismo + micro-línea de precio + **botón verde de WhatsApp**. Badge **"Creado con IA"** desde el primer frame.
2. **Cómo funciona la compra (3 pasos)**: mata el miedo #1 del pago manual en VE ("pago y me dejan en visto"). Esta sección convierte más que cualquier testimonio.
3. **Stack de valor + anclaje de 9 USD**: 13 módulos + 4 bonos + Plan de Acción 7 Días + acceso de por vida. Los bonos +18 NO se nombran ni insinúan — solo una línea legal neutra ("bonos para mayores de 18 años, se detallan dentro del chat").
4. **FAQ acordeón** (las 4 objeciones reales: estafa, principiantes, por qué tan barato, legalidad).
5. **CTA final + sticky** verde fijo durante todo el scroll. **Footer legal** (descargo + Privacidad + Términos).

La **barra de métodos de pago locales** va como franja dentro del hero o tras los 3 pasos (señal de confianza #1 en pago manual VE).

---

## 3. Copy listo (español venezolano/neutro, marco formativo)

- **H1:** *La mujer de este video no existe. La creó una persona común con su teléfono.*
- **Sub:** *Aprende a crear modelos virtuales hiperrealistas con inteligencia artificial — sin mostrar tu cara, sin cámara, sin experiencia previa. Curso completo paso a paso.*
- **Micro-línea sobre el botón:** *Curso completo + 4 bonos · Pago único de 9 USD · Acceso de por vida*
- **CTA:** *💬 Escríbele a Musa por WhatsApp*
- **Aviso bajo el video (gris):** *Contenido generado con inteligencia artificial.*

**3 pasos:** 1️⃣ Escríbele a Musa (responde al instante). 2️⃣ Pagas los 9 USD por Pago Móvil o transferencia y le envías la captura. 3️⃣ Verifica tu pago y te entrega TODO el curso + bonos al momento. *Todo queda en tu WhatsApp. Acceso de por vida.*

**Qué vas a poder hacer** (habilidad, cero dólares): crear tu primera modelo y publicarla en tu primera semana · generar fotos y videos indistinguibles de una persona real · mantener su rostro idéntico en cada foto · usar las mismas herramientas con que se creó a Musa.

**FAQ — ¿por qué tan barato?** (la más peligrosa): *Porque preferimos que entre mucha gente a 9 USD que poca gente a un precio alto. Es un solo pago, sin mensualidades, y te queda de por vida.*

---

## 4. Las "joyas" innovadoras (Fase 2, NO lanzamiento)

Hubo ideas audaces (demo "escribe tu nombre y mira a la modelo saludarte", reto "¿Real o IA?", hero como burbuja de WhatsApp con typing, banda de tasa del Bs en vivo, botón "Musa está en línea"). **El crítico las recortó del lanzamiento — con razón:**
- El saludo por nombre con video real **ya pasa en el chat un tap después**; replicarlo en la landing es un simulacro que puede decepcionar.
- Los juegos ("¿Real o IA?") suben tiempo-en-página de **curiosos sin intención** → leads de baja calidad → riesgo de quemar el número de WhatsApp.
- La banda de tasa en vivo duplica infra que ya tiene el bot y añade un punto de fallo visible en la primera pantalla.

Veredicto: van a Fase 2 **solo si la landing sobrevive al corte del día 14**. El asombro del video del hero ya prueba el producto.

---

## 5. Técnico

- **Hosting:** InsForge static hosting (mismo bundle que comparte el CV y el panel — ⚠️ recordar el acoplamiento de deploy). Página única, HTML + CSS crítico inline <50 KB, JS vanilla, **<2 s en 3G**, mobile-first.
- **Video del hero:** reusar `avatar/video-base-v2.mp4` (la cara v2-4 ya aprobada), mudo + poster WebP.
- **Salida única:** `wa.me` con texto prellenado natural (`"Hola, quiero el curso Modelos IA - Ref: LP-7F3K"`) que dispara el saludo de Musa y transporta el `Ref` (WhatsApp ignora UTM; el Ref viaja DENTRO del `text=`).
- **Tracking:** Meta Pixel (PageView + ViewContent al cargar, **Contact** —no Lead— al tap); captura `fbclid/_fbp/_fbc`; edge function que genera el `Ref` por sesión e **inyecta el `wa.me` ya resuelto en el render** (fallback estático `Ref: LP`). `Lead` y `Purchase` los envía el backend por CAPI cuando Musa califica y cuando la visión verifica el pago.
- **⚠️ Gap técnico no construido:** el bot YA captura `ctwa_clid`/`source_id`, pero **NO existe la lectura del código `Ref`** del texto prellenado. Hay que añadir el regex + la columna `ref_code` en `musa_leads`. Sin las dos puntas (inyección web + lectura en el bot) la landing no atribuye nada.
- **Páginas legales** (Privacidad + Términos) en el mismo hosting **antes de pautar** — requisito duro de Meta (destino funcional) o rechazo.

---

## 6. Medición (la única métrica que decide)

- **MÉTRICA NORTE:** CPA real por **pago verificado** = gasto del ad set / pagos verificados en Postgres. Objetivo: CPA ≤ 3–4 USD para margen sano sobre 9 USD.
- Embudo diario por ad set: Gasto → Conversaciones → Leads 18+ → Pagos verificados → CPA → ROAS. Escalar solo ad sets con ROAS ≥ 2,5, +20–30% cada 2–3 días (subir de golpe en cuenta nueva la marca Meta).
- Del canal landing: % que abre WhatsApp, % que escribe con Ref legible, Contact/PageView.
- Señal de pago manual: `Purchase` limpio solo cuando la visión verifica (no contaminar el algoritmo con falsos positivos).
- Salud: quality rating del WABA, % bloqueos/reportes, evento `GateFail18` (si sube, el creativo atrae menores).

**A/B prioritarios:** Test 1 (ubicación: CTWA vs landing, define el 80/20) · Test 3 (headline del anuncio: 3 ángulos de incredulidad). Lo demás, después del día 14.

---

## 7. Cumplimiento (anti-rechazo de Meta + anti-miedo-a-estafa)

Checklist pre-deploy (de la landing y de **cada creativo**): precio 9 USD visible sin scroll · aviso de IA legible · **CERO** imágenes o palabras +18 (bonos solo como "mayores de 18 años") · **CERO** "gana/rico/sueldo/ROI/$X al día" ni capturas de dinero · un solo CTA · sticky en móvil · <2 s en 3G · footer legal presente. El riesgo top de rechazo está en el **creativo del video**, no en la landing — ahí va el esfuerzo de divulgación de IA.

⚠️ **Corrección de datos:** la barra de pagos debe mostrar SOLO lo que el bot cobra de verdad — VE: **Pago Móvil + transferencia BDV**; CO: **Bancolombia + Nequi + Bre-B**. NO mostrar Binance/Zinli/Daviplata (descartados en `config/datos-pago.md`): ofrecer un método que luego no se acepta genera fricción y desconfianza.

---

## 8. Plan de acción (priorizado con realismo)

| # | Acción | Bloquea a |
|---|---|---|
| **0** | 🚫 **Datos de pago REALES de Venezuela** (Pago Móvil + cuenta BDV + titular) y número WhatsApp de producción | TODO — ni CTWA ni landing cobran sin esto |
| **1** | Lanzar **CTWA puro** (Campaña A): objetivo Interacción→WhatsApp, audiencia amplia 18–44 VE, creativo con aviso IA + 9 USD visible. Ya tiene tracking nativo (`ctwa_clid`) | — |
| **2** | Backend del `Ref`: regex de lectura en el bot + columna `ref_code` | landing atribuible |
| **3** | **Landing mínima** (hero + 3 pasos + stack + FAQ + sticky) + Pixel/CAPI + páginas legales | canal B / retargeting |
| **4** | Correr 14 días, decidir por CPA. Si la landing pierde → solo retargeting | escalar |
| **5** | (Fase 2, condicional) joyas interactivas, galería, A/B de hero | — |

---

## 9. Recomendación final

La landing está diseñada y lista para construir en su **versión mínima** cuando toque. Pero el siguiente paso de mayor impacto **no es construir la landing** — es **conseguir tus datos de pago reales de Venezuela** y **lanzar CTWA puro**. Eso es lo que vende esta semana. La landing es el canal del 20% que probablemente termine en 10% o apagado; construirla entera antes de poder cobrar sería sobre-ingeniería. Mi consejo: aprobar la estrategia, cerrar el insumo VE, lanzar CTWA, y construir la landing mínima en paralelo solo para encender el pixel.
