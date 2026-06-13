# Paquete de campaña CTWA — Modelos IA (Venezuela-first)

**Fecha:** 13 de junio de 2026 · Generado por investigación multi-agente. Complementa PROPUESTA-LANDING.md e investigacion/landing-ads.json.

PLAYBOOK CTWA «Modelos IA» (Venezuela-first, 9 USD), listo para ejecutar. Complementa investigacion/landing-ads.json y PROPUESTA-LANDING.md sin repetir su estrategia (esos archivos ya fijaron: 80/20 CTWA vs landing, objetivo Interacción→WhatsApp, precio visible en todas partes, modelo vestida, ctwa_clid + CAPI business_messaging, corte día 14 por CPA real). Este documento aterriza lo que falta: estructura exacta de cuenta/campaña/ad sets con presupuesto y rampa, 3 conceptos de creativo con guion plano por plano y formato, los textos prellenados wa.me con Ref por ángulo, el plan de tracking concreto, el checklist de cumplimiento por creativo, y los A/B con su corte de decisión. BLOQUEO previo (heredado, no resuelto aquí): faltan datos de pago reales de Venezuela (config/datos-pago.md) y el número WhatsApp de producción — sin eso no se pauta a VE porque cada dólar de ad es pérdida total. Activo de creativo ya disponible: avatar/video-base-v2.mp4 (cara v2-4 aprobada, voz sage). GAP técnico heredado: el bot lee ctwa_clid pero NO lee el código Ref del texto prellenado (falta regex + columna ref_code en musa_leads) — necesario antes de usar los wa.me con Ref.

## 0. Pre-flight (bloqueos duros antes de gastar un solo dólar)

No pautar hasta cerrar estos 6 puntos. Heredados de PROPUESTA-LANDING.md §8 y datos-pago.md — se repiten aquí solo como gate operativo, no se reabren.

1. DATOS DE PAGO VE REALES cargados en settings de InsForge: Pago Móvil (banco 0102 BDV + teléfono + cédula + titular) y cuenta BDV de 20 dígitos + titular. Hoy todos son PROVISIONAL → VE NO se puede cobrar → no pautar VE. CO ya está listo (Bancolombia 82061072256 / Nequi/Bre-B 3223565761, 33.000 COP).
2. NÚMERO WhatsApp de producción registrado (no el sandbox de Twilio) con display name «Modelos IA» (respaldo «Muse IA Lab» si Meta lo rechaza por genérico).
3. GAP TÉCNICO: añadir al bot el regex de lectura del Ref del primer mensaje (regex sugerido: /ref[:\s-]*([A-Z]{2,3}-?[A-Z0-9]{2,6})/i) + columna ref_code en musa_leads. Sin esto los wa.me con Ref de abajo no atribuyen nada (el ctwa_clid sí llega solo). Criterio de salida Fase 1: confirmar también que Twilio expone ReferralCtwaClid en el webhook entrante; si no, plan B = matching por ventana temporal ±3 min.
4. PÁGINAS LEGALES vivas (Privacidad + Términos) en hosting antes de pautar — requisito duro de Meta de destino funcional, aplica aunque la mayoría del tráfico sea CTWA directo (Meta puede pedir URL de negocio en la verificación).
5. BUSINESS MANAGER con dominio verificado, negocio verificado (o en proceso), método de pago estable, y NO usar la cuenta personal del dueño como único admin. Dataset de Events Manager creado y vinculado al WABA (para CAPI).
6. CALENTAMIENTO: la cuenta es nueva → arrancar 3-5 días a presupuesto bajo antes de escalar; rampa +20-30% cada 2-3 días, nunca duplicar de golpe (el risk-AI de Meta flaggea saltos bruscos en cuentas nuevas).

## 1. Estructura de campaña (CTWA directo, Venezuela-first)

JERARQUÍA Meta Ads Manager.

NIVEL CAMPAÑA — Campaña A «MIA-CTWA-Interaccion» (esta se lleva el 80% del presupuesto; la landing/Campaña B 20% ya está definida en landing-ads.json, no se reabre aquí).
- Objetivo: Interacción (Engagement). Confirmado vigente jun-2026: para cuenta nueva sin datos de conversión, Interacción optimizando por conversaciones de mensajería es lo correcto; Ventas optimizado por Purchase se desbloquea recién cuando el CAPI envíe ≥25-50 Purchase/semana (ese upgrade es la migración más importante del sistema — ver §4 y A/B).
- Tipo de presupuesto: a nivel ad set (ABO), NO Advantage+ Campaign Budget al inicio. Razón: con presupuesto chico y cuenta nueva queremos controlar manualmente cuánto va a VE vs CO y forzar salida estable en cada ad set; CBO/Advantage+ budget reparte solo y suele ahogar al ad set caro (CO) o al barato según le convenga al algoritmo, no al CPA real por país.
- Ubicación de la conversión: Apps de mensajería → WhatsApp. Sitio del anuncio: el número WABA de producción.

NIVEL AD SET — dos ad sets separados por país (NO un solo ad set mezclando VE+CO: tienen moneda, cuentas de pago y mensaje de bienvenida distintos, y CPM/poder de pago muy diferentes; mezclarlos contamina la optimización).
- AD SET 1 «AS-VE-Amplia-1844» (el principal): país Venezuela; edad 18-44; género todos; SIN intereses (audiencia amplia, Advantage+ Audience activado para que el algoritmo expanda — VE tiene >2-10M alcanzable y el optimizador de mensajería necesita audiencia grande; interés <500k + optimización CTWA da entrega inestable); ubicaciones Advantage+ (automáticas). Optimización por conversaciones de mensajería. Idioma: español. wa.me con saludo VE.
- AD SET 2 «AS-CO-Amplia-1844» (secundario, arranque pequeño): país Colombia; mismo esquema 18-44, amplio, Advantage+. Existe porque CO YA puede cobrar (datos reales) mientras VE está bloqueado — sirve para empezar a generar datos de Purchase para el CAPI sin esperar a desbloquear VE, y porque el poder de pago CO es mayor (candidato a mercado principal si su CPA gana, ver landing-ads.json planAB punto 5).

PRESUPUESTO DE ARRANQUE Y RAMPA (USD/día, ABO).
- Arranque (días 1-3, calentamiento): AS-VE 8 USD/día + AS-CO 4 USD/día = 12 USD/día total Campaña A (~80% del gasto; el 20% landing/B suma ~3 USD/día aparte). Si VE sigue bloqueado por datos de pago, todo el arranque va a AS-CO (12 USD/día) hasta desbloquear VE.
- Rampa: +20-30% cada 2-3 días SOLO en el ad set cuyo CPA por pago verificado sea sano. Ejemplo de senda para AS-VE: 8 → 10 → 13 → 16 → 20 USD/día. No tocar el ad set en las primeras 48-72h (deja salir el aprendizaje; editar resetea el learning).
- Regla de escalado dura (de PROPUESTA-LANDING §6): escalar solo ad sets con ROAS ≥2,5 sobre el precio (9 USD). Pausar un ad set si tras ~50 conversaciones su CPA por pago verificado > 6 USD (margen negativo estructural).
- Horario: para arrancar, todo el día (el optimizador de mensajería rinde mejor sin dayparting al inicio); evaluar dayparting recién en semana 3 si los datos muestran ventana clara (noche LATAM suele convertir mejor en chat).

NOMENCLATURA (para que el tracking sea legible en Ads Manager): Campaña MIA-CTWA-Interaccion / Ad set AS-{PAIS}-Amplia-1844 / Anuncio AD-{CONCEPTO}-{FORMATO}-{vN}, p.ej. AD-DEMO-916-v1, AD-INCREDULIDAD-45-v2.

## 2. Concepto 1 — «¿Adivinas cuál no es real?» (incredulidad/demo, el de mayor volumen)

ÁNGULO: asombro puro. No promete nada, solo demuestra el hiperrealismo y revela que es IA. Es el que mejor pasa revisión (cero dinero, cero +18) y el que mejor califica al lead curioso por tecnología. Activo base disponible: avatar/video-base-v2.mp4 (cara v2-4 aprobada).

FORMATO PRINCIPAL: 9:16 vertical (1080x1920) para Reels/Stories/TikTok. Variante feed: 4:5 (1080x1350) con el mismo metraje recortado al centro y subtítulos más grandes. Duración 18-25s. Música trend suave sin copyright. SUBTÍTULOS quemados (85% lo ve sin audio). Badge «Creado con IA» visible desde el frame 1 + etiqueta de divulgación de IA de Meta activada en el ad.

GUION (plano por plano):
- 0-2s (HOOK): primer frame = cara hiperrealista de Musa mirando a cámara, sonriendo natural. Texto en pantalla grande: «¿Esta mujer es real o IA?». Voz/silencio: solo música.
- 2-7s: cortes rápidos de Musa en 2-3 escenas lifestyle vestida (café en la mano, calle de ciudad, luz natural) — TODA VESTIDA, casual-elegante. Texto: «Mírala bien…». Se ven poros/pecas/textura (el realismo es el producto).
- 7-12s (REVEAL): glitch/transición + el frame se ‘pixela’ medio segundo y vuelve. Texto grande: «No existe. La creó una persona común con su teléfono.» Aquí entra el video-base-v2 hablando (lipsync) 1 línea: «Hola, soy 100% inteligencia artificial.»
- 12-18s (PROCESO): screen-recording de 3-4 segundos del flujo real (generar imagen → resultado) — la demo de que SÍ se aprende. Texto: «Esto se enseña paso a paso. 13 módulos + 4 bonos.»
- 18-22s (CTA): card final con precio. Texto: «Curso completo · Pago único 9 USD · Escríbenos por WhatsApp». Botón nativo del ad: «Enviar mensaje».

COPY DEL ANUNCIO (primary text): «¿Notaste que no es real? 😮 Esta modelo la creó una persona común con IA, sin cámara y sin mostrar su cara. En el curso aprendes a crear las tuyas, paso a paso: 13 módulos + 4 bonos. Pago único de 9 USD. Escríbenos y te mostramos cómo. (Contenido generado con IA.)»
HEADLINE: «Crea modelos virtuales hiperrealistas con IA — 9 USD»
BOTÓN: Enviar mensaje (CTA nativo CTWA, NO ‘Comprar’).

DÓNDE: es el concepto base tanto para Facebook como para IG/TikTok. Para FACEBOOK feed usar la variante 4:5 con foco en el rostro y la cara de incredulidad (el más conservador). Para IG/TikTok usar el 9:16 con más ritmo.

## 3. Concepto 2 — «Cómo se hace» (proceso/educación, el más conservador → Facebook)

ÁNGULO: habilidad/educación pura, foco en el PROCESO de creación más que en la modelo. Es el creativo más a prueba de rechazo (casi todo es pantalla de software + voz en off; la modelo aparece poco y siempre vestida, de rostro). Ideal como creativo principal de FACEBOOK feed y como repuesto pre-aprobado si Meta tumba al Concepto 1.

FORMATO PRINCIPAL: 1:1 (1080x1080) y 4:5 para feed de Facebook/Instagram. Variante 9:16 para Reels. Duración 20-30s. Estilo UGC/screencast, no publicitario pulido (el contenido tipo tutorial rinde y baja el perfil de ‘anuncio agresivo’). Subtítulos quemados + divulgación de IA activada + badge «Creado con IA».

GUION (plano por plano):
- 0-3s (HOOK): pantalla del proceso ya en marcha (interfaz de generación) con el resultado emergiendo. Texto: «Así se crea una modelo IA hiperrealista 👇». Voz en off cálida (puede ser la voz sage del avatar).
- 3-10s: screen-recording real: prompt → imagen generada → ajuste de rostro consistente. Texto que va nombrando los pasos sin jerga: «1. Defines su rostro · 2. Lo mantienes idéntico · 3. Generas fotos y videos».
- 10-16s: aparece Musa (video-base-v2, vestida, rostro) 2-3s como ‘resultado final’. Texto: «Y queda así de real. Sin cámara, sin mostrar tu cara.»
- 16-24s (STACK + ANCLAJE): tarjeta con el contenido: «13 módulos + 4 bonos + Plan de Acción 7 días + acceso de por vida». Texto: «Todo explicado desde cero, aunque nunca hayas usado IA.»
- 24-30s (CTA): «Pago único 9 USD · Escríbenos por WhatsApp y empieza hoy». Botón: Enviar mensaje.

COPY DEL ANUNCIO: «Las marcas ya usan modelos virtuales creados con IA. Aprende a hacerlo tú, paso a paso, aunque empieces de cero: 13 módulos + 4 bonos por un pago único de 9 USD. Sin cámara, sin experiencia previa. Escríbenos y te enseñamos cómo. (Contenido generado con IA.)»
HEADLINE: «Aprende a crear modelos con IA — 13 módulos, 9 USD»
NOTA DE CUMPLIMIENTO: habla del MERCADO («las marcas ya usan…»), NUNCA de tu ganancia personal — esto esquiva la política de Unrealistic Outcomes (prohibido ‘gana $X’). Es el truco (c) de landing-ads.json: oportunidad de industria sin promesa de ingresos.

## 4. Concepto 3 — «Sensual-lifestyle con actitud» (techo permitido → IG/TikTok)

ÁNGULO: el más atrevido que PASA revisión. Estética de influencer/fashion, confianza y mirada, NO cuerpo. Techo duro = SENSUAL-LIFESTYLE elegante: modelo siempre vestida (ropa atractiva pero normal: vestido casual, top + jeans, look de salida), pose con actitud, luz cálida. PROHIBIDO y motivo de rechazo/baneo: bikini, lencería, ropa interior, poses sexuales, encuadre al escote/glúteos como foco, gestos sugerentes. El gancho sigue siendo «¿no es real?», no la sensualidad. Solo para IG Reels/Stories y TikTok (Facebook feed = Concepto 2, más conservador).

FORMATO: 9:16 (1080x1920) exclusivo Reels/TikTok. Duración 12-18s, ritmo alto, música trend. Subtítulos + badge IA + divulgación activada.

GUION (plano por plano):
- 0-2s (HOOK): Musa entra en cuadro con actitud, look fashion vestida, mirada a cámara. Texto: «POV: tu modelo no necesita salir de casa 💅». Música con beat.
- 2-6s: 3 cortes rápidos estilo ‘outfit/lifestyle’ (vestida) — ciudad, café, espejo — con transiciones al beat. Foco en rostro y estilo, NUNCA encuadre corporal.
- 6-9s (REVEAL): glitch breve → texto grande «100% IA. No existe.» El realismo del rostro (poros, pecas) hace el trabajo.
- 9-13s: micro screen-recording (1-2s) del proceso + texto «Tú puedes crear la tuya. 13 módulos + 4 bonos.»
- 13-17s (CTA): card «Pago único 9 USD · Escríbenos» + botón Enviar mensaje.

COPY DEL ANUNCIO: «Esta modelo no existe — es 100% IA. ✨ Aprende a crear modelos virtuales hiperrealistas con estilo, paso a paso: 13 módulos + 4 bonos, pago único de 9 USD. Escríbenos por WhatsApp. (Contenido generado con IA.)»
HEADLINE: «Modelos virtuales con IA — 9 USD, paso a paso»
GUARDARRAÍL TIKTOK: TikTok es aún más estricto con IA-humanos y ‘synthetic media’ → divulgación obligatoria visible; si TikTok rechaza, no re-subir igual (suma a strikes), recortar el plano más ‘fashion’ y dejar más proceso (acercarse al Concepto 2).

## 5. Texto prellenado wa.me exacto por ángulo (con Ref)

REGLA TÉCNICA (de landing-ads.json trucoPrefillWame): en CTWA directo el ctwa_clid llega solo y es la atribución fiable; el Ref dentro del texto es la capa secundaria que distingue CONCEPTO/CANAL cuando se quiere granularidad por creativo más allá de lo que da el source_id. El Ref viaja DENTRO de text= (WhatsApp ignora cualquier UTM colgado al wa.me). Codificar espacio=%20, dos puntos=%3A, coma=%2C. Número placeholder 58XXXXXXXXXX (poner el WABA real de producción).

MENSAJE NATURAL que ve el usuario y URL lista para pegar:

- Concepto 1 (incredulidad/demo) — VE:
  Visible: «Hola, vi el video y no creo que no sea real 😮 quiero info del curso Modelos IA - Ref: AD-DEMO»
  URL: https://wa.me/58XXXXXXXXXX?text=Hola%2C%20vi%20el%20video%20y%20no%20creo%20que%20no%20sea%20real%20%F0%9F%98%AE%20quiero%20info%20del%20curso%20Modelos%20IA%20-%20Ref%3A%20AD-DEMO

- Concepto 2 (proceso/educación) — VE:
  Visible: «Hola, quiero aprender a crear modelos con IA. Info del curso Modelos IA - Ref: AD-PROCESO»
  URL: https://wa.me/58XXXXXXXXXX?text=Hola%2C%20quiero%20aprender%20a%20crear%20modelos%20con%20IA.%20Info%20del%20curso%20Modelos%20IA%20-%20Ref%3A%20AD-PROCESO

- Concepto 3 (lifestyle/IG-TikTok) — VE:
  Visible: «Hola, vi el reel y quiero info del curso Modelos IA - Ref: AD-STYLE»
  URL: https://wa.me/58XXXXXXXXXX?text=Hola%2C%20vi%20el%20reel%20y%20quiero%20info%20del%20curso%20Modelos%20IA%20-%20Ref%3A%20AD-STYLE

- Variante COLOMBIA (mismos conceptos, Ref con sufijo -CO para separar país en lectura del bot, p.ej. el saludo CO cambia moneda a 33.000 COP y cuentas Nequi/Bancolombia/Bre-B):
  Concepto 1 CO: Ref: AD-DEMO-CO · Concepto 2 CO: Ref: AD-PROCESO-CO · Concepto 3 CO: Ref: AD-STYLE-CO (misma sintaxis, cambiar el texto del Ref).

- Tráfico ORGÁNICO (bio IG / TikTok), códigos estáticos por canal: Ref: BIO-IG, Ref: BIO-TT. URL ejemplo IG: https://wa.me/58XXXXXXXXXX?text=Hola%2C%20quiero%20info%20del%20curso%20Modelos%20IA%20-%20Ref%3A%20BIO-IG

NOTA: en los ads CTWA nativos basta poner el texto prellenado en el campo ‘mensaje’ del anuncio (Meta lo carga sin URL). El Ref se escribe ahí literal: «Hola, vi el video y quiero info del curso Modelos IA - Ref: AD-DEMO». El bot debe leerlo con el regex del §0 punto 3. Esperar 10-25% de usuarios que borran/editan el texto → la atribución real se ancla en ctwa_clid, el Ref es bonus.

## 6. Tracking (la única métrica que decide: CPA por pago verificado)

Construye sobre landing-ads.json (mecanismo CAPI for Business Messaging) — aquí va el plan operativo concreto, no la teoría.

FLUJO ctwa_clid NATIVO (canal A, el fiable):
1. Primer mensaje del lead trae el objeto referral → Twilio lo expone como ReferralCtwaClid / ReferralSourceId (ad id) / ReferralSourceUrl (CONFIRMAR nombre exacto en Fase 1; plan B matching temporal ±3 min). Persistir en musa_leads: phone, ctwa_clid, source_id, ref_code, pais, estado, timestamps.
2. Dataset en Events Manager vinculado al WABA. Edge function capi-events hace POST a graph.facebook.com/v23.0/{dataset_id}/events.
3. EVENTOS a enviar (campos obligatorios o no atribuye): action_source: 'business_messaging' (DURO), messaging_channel: 'whatsapp', ctwa_clid, whatsapp_business_account_id, event_time.
   - Lead → cuando el bot CALIFICA (país confirmado + gate 18+ superado). Sin value.
   - Purchase → cuando la VISIÓN VERIFICA el pago (no antes, no en ‘pago enviado’). value: 9, currency: 'USD' (mandar siempre 9 USD aunque cobre en Bs/COP — la métrica norte se lee en USD para comparar ad sets de distinto país).
4. ANTI-DUPLICADO: Meta NO deduplica este flujo → flag capi_sent en musa_leads; nunca reenviar Purchase del mismo lead.
5. ATRIBUCIÓN: last-click, ventana 7 días. Con ticket 9 USD el cierre es casi siempre <72h → cae dentro, sin problema.

FLUJO LANDING (canal B, 20%, ya definido en landing-ads.json): Pixel PageView+ViewContent al cargar, Contact (NO Lead) al tap del botón; el Ref de sesión une web↔chat; Purchase por CAPI web (action_source:'website') con fbc/fbp + event_id para deduplicar contra el pixel. No se reabre aquí.

MÉTRICA NORTE: CPA = gasto del ad set / pagos VERIFICADOS en Postgres (no CPL, no costo por conversación). Objetivo CPA ≤ 3-4 USD para margen sano sobre 9 USD; breakeven 9 USD.
DASHBOARD diario por ad set: Gasto → Conversaciones iniciadas → Leads 18+ calificados → Pagos verificados → CPA → ROAS. Benchmarks esperados VE (estimado, validar con datos propios): costo por conversación 0,10-0,50 USD; conversión chat→venta 3-8% → CPA esperado 1,5-8 USD.
SALUD del canal (vigilar a diario, no solo CPA): quality rating del WABA, % bloqueos/reportes, evento GateFail18 (si sube, el creativo está atrayendo menores → revisar el ad). Un número quemado mata todo el canal, pesa más que un CPA puntual.

UPGRADE CLAVE (el que casi nadie hace, de landing-ads.json): cuando el CAPI acumule ≥25-50 Purchase/semana, MIGRAR Campaña A de Interacción a objetivo Ventas optimizado por Purchase. Meta deja de buscar ‘gente que chatea’ y busca ‘gente que paga’ → este salto baja el CPA más que cualquier cambio de creativo.

## 7. Checklist de cumplimiento por creativo (revisar ANTES de subir cada uno)

Pasar TODOS los ítems por CADA creativo (video, copy, headline, texto sobre imagen, thumbnail Y la landing de destino — Meta revisa el destino igual que el ad). De landing-ads.json riesgos #1-#5 + PROPUESTA-LANDING §7.

[ ] CERO +18: ninguna mención, palabra o insinuación de los bonos +18. En ningún activo que Meta/TikTok revise. Los bonos +18 NO EXISTEN para el ad; se revelan solo dentro del chat tras gate de edad. (Riesgo crítico: rechazo >80% y escalada a inhabilitación de cuenta.)
[ ] MODELO VESTIDA: sin bikini, lencería, ropa interior, poses sexuales ni encuadre a escote/glúteos como foco. Vestida casual/fashion. Gancho = realismo, no cuerpo.
[ ] CERO promesa de ingresos: nada de ‘gana/rico/sueldo/ROI/$X al día/reemplaza tu trabajo’, ni screenshots de dinero. Hablar del mercado («las marcas ya usan…»), nunca de TU ganancia. (Combinación dinero+IA+cuenta nueva = patrón que caza el enforcement anti-scam de Meta.)
[ ] DIVULGACIÓN DE IA activada: etiqueta de contenido IA de Meta ON + badge/aviso visible «Creado con IA» / «Contenido generado con inteligencia artificial» (sujeto fotorrealista generado por IA = exactamente el caso que Meta exige divulgar en 2026; ‘Undisclosed AI’ es categoría top de rechazos). En TikTok igual, es más estricto.
[ ] PRECIO 9 USD visible (anuncio + landing + lo confirma el chat). Precio bajo y claro REDUCE el perfil anti-scam.
[ ] UN SOLO CTA: Enviar mensaje (NO ‘Comprar’/checkout; no hay checkout web). Sin otros links salientes en la landing.
[ ] DESTINO FUNCIONAL: si el ad apunta a landing, que cargue <2s en 3G, tenga footer legal (Privacidad + Términos + descargo de resultados ‘dependen del esfuerzo individual’).
[ ] HIGIENE: tener este creativo como uno de 1-2 repuestos pre-aprobados; ante rechazo apelar UNA vez, NO re-subir el mismo creativo en loop (cada rechazo suma al score de la cuenta).

RECORDATORIO datos-pago: la barra/menciones de métodos de pago muestra SOLO lo que el bot cobra de verdad — VE: Pago Móvil + transferencia BDV; CO: Bancolombia + Nequi + Bre-B. NO mostrar Binance/Zelle/Daviplata (descartados) — ofrecer un método que luego no se acepta genera fricción y reportes.

## 8. A/B prioritarios y corte de decisión

Disciplina: una sola variable por test, decidir por CPA por pago verificado (no CPL, no CTR, no ‘sensación’), mínimo ~30 ventas totales / ~50 conversaciones por brazo para señal. No tocar nada en las primeras 48-72h de cada test (learning).

TEST 1 — UBICACIÓN / CANAL (el que define el 80/20): CTWA directo (Campaña A) vs Landing (Campaña B), misma creatividad ganadora. CORTE día 14: si CPA_CTWA ≤ 0,6 × CPA_landing → matar la landing como adquisición, dejarla solo para retargeting/pixel. Sesgo esperado: consolidar 90/10 o apagar la landing.

TEST 2 — ÁNGULO DE CREATIVO (3 brazos): Concepto 1 (incredulidad) vs Concepto 2 (proceso) vs Concepto 3 (lifestyle). Correr los 3 en el ad set VE amplio. CORTE día 7-10: pausar el de peor CPA; quedarse con los 2 mejores y producir 1-2 variaciones del ganador. Hipótesis: Concepto 1 da más volumen barato; Concepto 2 da el lead más calificado/menor riesgo de rechazo; Concepto 3 da CTR alto pero ojo a rechazos/age-gating.

TEST 3 — FORMATO del ganador: 9:16 (Reels/TikTok) vs 4:5 (feed). Decide dónde concentrar presupuesto de placement.

TEST 4 (semana 3+) — PRECIO EN AD vs SIN PRECIO: medir CPA final, no CPL. La evidencia low-ticket LATAM favorece precio visible (pre-califica), pero a veces sin-precio trae volumen barato que compensa peor cierre. Solo correr cuando ya haya baseline estable.

TEST 5 (semana 3-6) — PAÍS PRINCIPAL: VE vs CO por CPA real. CPM VE es más barato pero poder de pago CO mayor; si CPA_CO < CPA_VE de forma sostenida, mover presupuesto a CO como mercado principal.

CORTE GLOBAL día 14 (decisión de seguir/escalar/matar): con ≥30 ventas, si el mejor ad set tiene CPA ≤ 4 USD y ROAS ≥ 2,5 → escalar +20-30% c/2-3 días y disparar el upgrade a objetivo Ventas cuando llegue a ≥25-50 Purchase/semana. Si el mejor ad set queda con CPA > 9 USD (margen negativo) tras agotar los 3 conceptos → no es problema de creativo, es de oferta/canal: pausar, revisar el funnel del chat (¿dónde caen los leads?) antes de seguir gastando.


---

# Modelos y prompts para los creativos hiperrealistas

**Imagen:** fal-ai/nano-banana-pro (mismo motor Gemini del ejemplo aprobado; mejor piel anti-plástico). Alterno barato: seedream v4.5. **Video:** fal-ai/bytedance/omnihuman/v1.5 (1080p).

**Consistencia de cara:** CÓMO MANTENER LA MISMA CARA (Musa) ENTRE LAS 4 PIEZAS — flujo en 2 fases:

FASE 1 (crear el rostro maestro): Genera la pieza 1 (CHAT-BASE) con el endpoint texto-a-imagen `fal-ai/nano-banana-pro`, num_images=2, resolution=2K, SEED FIJO = 778412 (anota el seed real que devuelva la API; si pasas seed tú mismo, úsalo). Escoge la mejor cara: ese archivo es el ROSTRO MAESTRO de Musa. Súbelo al bucket: `npx @insforge/cli storage upload musa-master.png --bucket musa-avatares --key musa-master.png` -> URL pública https://m2gnzrj8.us-east.insforge.app/api/storage/buckets/musa-avatares/objects/musa-master.png

FASE 2 (las otras 3 piezas heredan esa cara): Genera FB-AD, IG/TIKTOK-AD y RESPALDO con el endpoint de EDICIÓN `fal-ai/nano-banana-pro/edit` pasando `image_urls: ["<URL del rostro maestro>"]` (OJO: es un ARRAY llamado image_urls, NO image_url; verificado en la API de fal jun-2026). En cada prompt de edición agrega al inicio: "Using the woman in the reference image, preserve her exact same face and identity (same eye shape, nose, lips, freckle pattern, skin tone and hair color), only change the outfit, pose, framing and background as described:". Así cambias ropa/pose/encuadre pero la CARA es idéntica.

TRES PILARES DE CONSISTENCIA:
1) SEED: reusar el mismo seed (778412) ayuda en texto-a-imagen; en /edit el rostro lo fija la referencia, no el seed.
2) REFERENCIA: image_urls con el rostro maestro es el método más fuerte (el ejemplo del dueño/Gemini funciona así).
3) DESCRIPTORES FIJOS (copiar TEXTUAL en los 4 prompts, es el "ADN" de Musa): "a 24-year-old Latina woman, long wavy chestnut-brown hair with subtly grown-out dyed roots, warm brown almond-shaped eyes, light freckles scattered across the nose and cheeks, two small natural moles (one near the left jaw, one above the right eyebrow), full natural lips, softly defined eyebrows, oval face with slightly asymmetric features, warm medium-tan skin".

REGLA: NO cambies edad, color de ojos, color de pelo ni el patrón de pecas/lunares entre piezas; solo cambian outfit, pose, encuadre, fondo y luz. Genera num_images=2 por pieza para escoger. resolution=2K en todas; usa 4K solo en la hero del chat si quieres el máximo. output_format="png". safety_tolerance: deja el default 4 en chat; para FB/IG ad-safe puedes usar 3 (más estricto) — el contenido ya es no-explícito por diseño.

### 1. CHAT-BASE — rostro maestro de Musa (video de saludo). Endpoint texto-a-imagen fal-ai/nano-banana-pro. Params: aspect_ratio='4:5', resolution='2K' (o '4K' para la hero), num_images=2, seed=778412, output_format='png', safety_tolerance=4.

```
Candid lifestyle photograph, photorealistic, raw unretouched photo of a 24-year-old Latina woman, long wavy chestnut-brown hair with subtly grown-out dyed roots and loose flyaway strands framing her face, warm brown almond-shaped eyes, light freckles scattered across the nose and cheeks, two small natural moles (one near the left jaw, one above the right eyebrow), full natural lips, softly defined eyebrows, oval face with slightly asymmetric features and natural human asymmetry, warm medium-tan skin. Medium shot from the chest up, she wears a simple discreet black top, relaxed shoulders, leaning slightly toward the camera in a warm welcoming way, genuine soft greeting smile, candid relaxed expression, looking directly into the camera with friendly eye contact. Blurred urban street background at golden hour, warm bokeh city lights, shallow depth of field. Natural skin texture with visible pores and detailed pore structure on the T-zone, fine vellus facial hair (peach fuzz), subtle skin imperfections, uneven skin tone with slight natural redness around the nose, realistic under-eye area, natural skin subsurface scattering, matte skin finish with NO harsh specular highlights on the nose, soft diffused warm natural light, overcast-soft key light. Shot on a Canon EOS R5, 85mm f/1.4 lens, photographic film grain, realistic ambient occlusion.
```
**Evitar:** airbrushed, plastic skin, doll-like, smooth flawless skin, glossy skin, shiny skin, oily highlights, harsh specular highlight on nose, overexposed highlights, CGI, 3D render, render, waxy, porcelain skin, overly symmetric face, perfect skin, retouched, beauty filter, instagram filter, uniform skin tone, no pores, mannequin, uncanny, video game character, blurry, low detail skin, AI look, deformed hands, extra fingers, text, watermark, logo

Busca: cara cálida, cercana, de bienvenida, mirando a cámara — base para el lipsync del video de saludo. El '4:5' encuadra plano medio para que el rostro domine pero quede cuello/hombros para animar. La luz difusa dorada + 'matte skin finish' + 'no harsh specular highlight on nose' ataca DIRECTO el brillo plástico de nariz del avatar v2. Pecas/poros/moles/peach fuzz + 'Canon 85mm + film grain' rompen el look de render. ESTE es el rostro maestro: súbelo al bucket y úsalo como referencia para las otras 3.

### 2. FACEBOOK-AD (conservador, 'no parece IA'). Endpoint de EDICIÓN fal-ai/nano-banana-pro/edit con image_urls=['<URL rostro maestro>']. Params: aspect_ratio='4:5', resolution='2K', num_images=2, output_format='png', safety_tolerance=3.

```
Using the woman in the reference image, preserve her exact same face and identity (same eye shape, nose, lips, freckle pattern, two natural moles, skin tone and chestnut hair color), only change the outfit, pose, framing and background as described. Candid lifestyle photograph, photorealistic, raw unretouched photo of the same 24-year-old Latina woman with long wavy chestnut-brown hair with subtly grown-out dyed roots, warm brown eyes, light freckles across nose and cheeks. Tight flattering head-and-shoulders portrait with the face as the clear focus, she wears a casual everyday cream knit sweater, relaxed natural posture, a soft genuine half-smile with a subtly surprised, intrigued expression as if she can't believe what she's seeing, candid not posed, looking just past the camera. Bright airy home interior softly blurred in the background, plants and warm daylight. Natural skin texture with visible pores, fine vellus facial hair, subtle imperfections, uneven skin tone with slight redness around the nose, realistic under-eye area, fine lines, natural skin subsurface scattering, matte skin finish, soft diffused natural window light with NO harsh specular highlights on the nose. Shot on Kodak Portra 400 film, 85mm lens, fine film grain, shallow depth of field.
```
**Evitar:** airbrushed, plastic skin, doll-like, smooth flawless skin, glossy skin, shiny skin, oily highlights, harsh specular highlight on nose, CGI, 3D render, render, waxy, porcelain skin, overly symmetric face, perfect skin, retouched, beauty filter, instagram filter, uniform skin tone, no pores, mannequin, uncanny, video game character, overexposed highlights, blurry, low detail skin, AI look, cleavage, low-cut, revealing, lingerie, suggestive pose, text, watermark, logo

El más SOBRIO de los tres: foco total en rostro hiperrealista para vender el ángulo 'no parece IA / incredulidad'. Ropa de calle tapada (suéter), sin escote, expresión de asombro genuino = perfecto para hook de Facebook. Ad-safe garantizado: cuerpo cubierto, cero insinuación, encuadre al rostro (no al escote). Hereda la cara via image_urls. Recuerda exigir divulgación de IA visible en el copy/creativo del ad.

### 3. INSTAGRAM/TIKTOK-AD (sensual con estilo, ad-safe — lo más atrevido que PASA revisión). Endpoint de EDICIÓN fal-ai/nano-banana-pro/edit con image_urls=['<URL rostro maestro>']. Params: aspect_ratio='9:16', resolution='2K', num_images=2, output_format='png', safety_tolerance=3.

```
Using the woman in the reference image, preserve her exact same face and identity (same eye shape, nose, lips, freckle pattern, two natural moles, skin tone and chestnut hair color), only change the outfit, pose, framing and background as described. Editorial candid fashion photograph, photorealistic, raw unretouched photo of the same 24-year-old Latina woman with long wavy chestnut-brown hair with grown-out dyed roots and loose strands, warm brown eyes, light freckles across nose and cheeks. Full upper-body fashion shot, she wears a stylish well-fitted tailored blazer over a high-neck top and high-waisted trousers, modern elegant streetwear, confident attitude, one hand adjusting her hair, chin slightly lifted, a self-assured subtle smile, direct confident gaze into the camera. Trendy modern city setting at blue-golden hour, soft neon and warm bokeh, fashion-editorial mood. Natural skin texture with visible pores, fine vellus facial hair, subtle imperfections, uneven skin tone, realistic under-eye area, natural skin subsurface scattering, matte skin finish, soft diffused cinematic light with NO harsh specular highlights on the nose. Shot on a Sony A7 IV, 50mm f/1.2 lens, subtle film grain, shallow depth of field.
```
**Evitar:** nudity, lingerie, underwear, cleavage, low-cut top, exposed chest, bikini, swimsuit, revealing clothing, sexual pose, provocative, bare skin focus, airbrushed, plastic skin, doll-like, smooth flawless skin, glossy skin, shiny skin, oily highlights, harsh specular highlight on nose, CGI, 3D render, render, waxy, porcelain skin, overly symmetric face, perfect skin, retouched, beauty filter, instagram filter, uniform skin tone, no pores, mannequin, uncanny, overexposed highlights, blurry, AI look, text, watermark, logo

Sensual-lifestyle ELEGANTE = el techo permitido: actitud, confianza, moda, mirada — NADA explícito. Outfit deliberadamente cubierto (blazer + cuello alto + pantalón de tiro alto) para máxima sensualidad por ESTILO y porte, no por piel. 9:16 para Reels/TikTok. La sensualidad viene de pose/confianza/mood editorial, no de revelar -> pasa revisión Meta/TikTok sin quemar el número. Negativo refuerza la barrera anti-explícito por si el prompt deriva. Hereda la cara via image_urls.

### 4. RESPALDO (otra pose/outfit para elegir, sensual-lifestyle ad-safe, vibe más cálida/casual que la #3). Endpoint de EDICIÓN fal-ai/nano-banana-pro/edit con image_urls=['<URL rostro maestro>']. Params: aspect_ratio='4:5', resolution='2K', num_images=2, output_format='png', safety_tolerance=3.

```
Using the woman in the reference image, preserve her exact same face and identity (same eye shape, nose, lips, freckle pattern, two natural moles, skin tone and chestnut hair color), only change the outfit, pose, framing and background as described. Candid lifestyle fashion photograph, photorealistic, raw unretouched photo of the same 24-year-old Latina woman with long wavy chestnut-brown hair with grown-out dyed roots, warm brown eyes, light freckles across nose and cheeks. Three-quarter body shot, she sits relaxed on a cafe terrace wearing an elegant fitted long-sleeve ribbed knit dress in warm terracotta (modest neckline, covered), legs crossed, leaning on one hand, a warm confident candid smile, glancing toward the camera with relaxed charm. Sunny outdoor cafe with greenery and warm bokeh, soft golden afternoon light. Natural skin texture with visible pores, fine vellus facial hair, subtle imperfections, uneven skin tone with slight redness around the nose, realistic under-eye area, natural skin subsurface scattering, matte skin finish, soft diffused natural light with NO harsh specular highlights on the nose. Shot on a Fujifilm X-T5, 56mm f/1.2 lens, fine film grain, shallow depth of field.
```
**Evitar:** nudity, lingerie, underwear, cleavage, low-cut, exposed chest, bikini, swimsuit, revealing clothing, sexual pose, provocative, airbrushed, plastic skin, doll-like, smooth flawless skin, glossy skin, shiny skin, oily highlights, harsh specular highlight on nose, CGI, 3D render, render, waxy, porcelain skin, overly symmetric face, perfect skin, retouched, beauty filter, instagram filter, uniform skin tone, no pores, mannequin, uncanny, overexposed highlights, blurry, AI look, text, watermark, logo

Alternativa para dar a elegir: vibe cálida/cotidiana y accesible (cafe, vestido tejido cubierto color terracota) en lugar del filo fashion-urbano de la #3. Igual de ad-safe: cuello modesto, cuerpo cubierto, sensualidad por porte y calidez, no por piel. Sirve tanto como segunda opción de IG/TikTok como de variante de FB más relajada. 4:5 versátil para feed. Hereda la cara via image_urls.


