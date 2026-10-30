# Auditoría externa — Musa IA Lab (Manus)

## Resumen ejecutivo

No abrir el funnel a clientes ni activar publicidad todavía. Hay dos bloqueos demostrables: el adjunto real de Evolution no llega al lector de comprobantes y la capa de pago no exige una referencia presente, por lo que una captura repetida con referencia nula puede seguir la ruta de aprobación. La entrega posterior al pago tampoco tiene outbox/reintento fiable.

La landing conserva un número placeholder y documentos de privacidad, términos y reembolsos incompletos. Resolver también por escrito la clasificación del curso antes de usar WhatsApp Business: su política prohíbe promocionar “adult products and services” y el curso incluye enseñanza de desnudez sintética.

Conservar los controles buenos: firma fail-closed, STOP/opt-out, SQL parametrizado y claim atómico para evitar doble entrega. Las pruebas de visión y pago estricto pasan; el verificador completo no queda verde porque tres pruebas de integración fallan al intentar loopback en este entorno. No se inspeccionó producción.

## Hallazgos

### P0 — bloquea el lanzamiento

**P0-1. La barrera antifraude no exige referencia presente ni identifica de forma fiable imagen reutilizada.**  
**Evidencia:** `next/src/vision/proveedor.ts:58-61, 86-108` permite que `numero_referencia` sea `null`; `functions/motor/comprobante.ts:169-182` solo valida `confidence.referencia >= 0.85`, no la presencia del dato; `next/src/motor/pago-estricto.ts:153-179` endurece destino, fecha y monto, pero tampoco exige referencia. El lector devuelve una lectura cacheada como `ok` (`next/src/vision/lector.ts:90-99`) y el motor siempre asigna `imagenDuplicada: false` (`next/src/motor/motor-real.ts:158-175`). El repositorio normaliza una referencia vacía a `NULL` (`next/src/db/repositorio.ts:257-266`), no escribe el campo `image_phash` en la fila de pago (`repositorio.ts:129-154`) y una restricción UNIQUE por método/referencia no impide varias filas con `NULL` en PostgreSQL (`next/migrations/0001_esquema_inicial.sql`, definición de `musa_payments`).

**Impacto:** dos leads distintos pueden presentar la misma captura completa sin referencia legible. Si el modelo devuelve confianza alta para referencia, esa confianza basta aunque el valor sea nulo; la caché reutiliza los datos sin pasar el indicador de duplicado. No es una afirmación de que el modelo siempre vaya a aprobar, sino una ruta que el código no cierra. Si la referencia sí colisiona, `ejecutar()` devuelve `dupeRef` y se detiene (`next/src/motor/ejecutar.ts:141-151`), pero `motor-real.ts:206-214` ignora ese resultado y no redecide con `refDuplicada`, por lo que tampoco se genera la cola humana prometida.

**Recomendación:** desactivar `AUTO_APROBAR` antes de cobrar en real. Exigir referencia no vacía con validación de código; almacenar huella SHA por pago con unicidad apropiada; marcar lecturas de caché como reutilizadas; mandar referencias/huellas duplicadas a revisión humana y alertar al operador. Probar entre leads distintos: referencia nula, misma imagen con/sin referencia, fecha nula, salida cacheada y colisión del índice. La confianza que devuelve un LLM no acredita el ingreso bancario.

**Esfuerzo:** 1–2 días con pruebas; mientras tanto, cotejo humano de cada pago con el banco.

**P0-2. El adjunto real de Evolution no está conectado al lector de comprobantes.**  
**Evidencia:** `functions/canal/evolution.ts:232-295` devuelve `media` con `obtenerBytes()`, pero no `media.url`. `next/src/main.ts:67-85` configura un descargador que solo acepta URL. `next/src/motor/motor-real.ts:158-167` ignora `obtenerBytes()` y pasa `mensaje.media.url ?? ""`; `next/src/vision/prefiltro.ts:39-42` clasifica URL vacía como `sin_imagen` y pide reenvío.

**Impacto:** la imagen enviada por WhatsApp no llega a OCR aunque el adaptador ya sabe obtener sus bytes/base64. El comprador puede entrar en un ciclo de reenvío, así que el flujo anunciado de verificación automática no funciona con el contrato real de Evolution. Las pruebas que inyectan `media.url` no prueban este recorrido.

**Recomendación:** propagar al lector una función segura de bytes del contrato `MensajeEntrante` o pasar bytes obtenidos por Evolution; aplicar límites MIME/tamaño y timeout. Agregar test local de `extraerMedia()` → `motor-real` → lector usando el objeto real del adaptador, sin llamadas de red.

**Esfuerzo:** 0,5–1 día; bloquea OCR automático.

**P0-3. La ruta comercial no está lista para publicarse: CTA inválido y documentos precompra sin completar.**  
**Evidencia:** `next/landing/index.html:281` conserva `NUMERO = "57XXXXXXXXXX"`. `privacidad.html:29-31, 50-62` deja responsable, correo y plazo de retención pendientes. `terminos.html:29-32` deja nombre/razón social, domicilio y correo pendientes. `reembolsos.html:27-29, 36-59` dice que es un borrador no aprobado, deja correo/plazo sin definir y afirma que no hay reembolso tras enviar el enlace. El checkbox de `index.html:263-268` acepta términos/privacidad y edad, pero no se observa aceptación separada de inicio inmediato del contenido digital.

La Ley 1480 de 2011, arts. 47–50, regula el retracto en ventas a distancia y sus excepciones, y exige publicar identidad del proveedor —incluidos NIT, dirección de notificación, teléfono y correo—, descripción del producto, medios de pago, plazo de entrega, precio total y derecho/procedimiento de retracto. No se puede acreditar cumplimiento con los borradores locales. La landing está marcada como no publicada en `PROMPT-MANUS.md:183`; este es un bloqueo preventivo, no una afirmación de daño a compradores actuales.

**Recomendación:** no publicar hasta reemplazar el número, completar identificación/contacto, precisar entrega y producto, terminar privacidad/retención/proveedores y obtener revisión jurídica colombiana de retracto/reembolsos. No resumir la ley como “todo digital tiene/no tiene retracto”: documentar la excepción que aplique y el consentimiento requerido. No cobrar con una política autodeclarada como borrador.

**Esfuerzo:** 0,5–1 día de producto/configuración más revisión jurídica externa.

**P0-4. Riesgo de incompatibilidad de categoría con WhatsApp Business; resolver antes de vender por ese canal.**  
**Evidencia externa:** la [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/) (actualizada 23-sep-2026), sección 4, incluye “Adult products and services” entre las categorías prohibidas para comprar, vender, promover o facilitar por WhatsApp Business; también restringe mensajes con desnudez/material sexual explícito. La descripción del producto en `PROMPT-MANUS.md:146-161, 367-368` indica curso para crear modelos virtuales y que toca herramientas de desnudez sintética.

**Impacto:** la clasificación del curso no está confirmada por Meta. Si se considera producto/servicio adulto, el canal de ventas puede ser restringido. El gate 18+ no es una excepción a una categoría prohibida; cambiar de Baileys a Cloud API no resolvería esa clasificación.

**Recomendación:** obtener criterio escrito de Meta/proveedor oficial sobre el curso y los mensajes antes de operar; si no es admisible, no promocionarlo ni venderlo por WhatsApp Business y escoger canal/producto compatible. No enviar desnudez en mensajes/creativos. Excluir menores, deepfakes de personas reales sin consentimiento e imágenes sexuales no consensuadas. Revisar procesador por separado: el [reglamento de Wompi Comercios Colombia](https://wompi.com/assets/downloadble/reglamento-Comercios-Colombia.pdf), art. 14.6, prohíbe categorías sexuales ilícitas/no consensuadas, pero no basta para concluir que todo curso educativo para adultos esté admitido o prohibido.

**Esfuerzo:** 1–3 días para clasificación y decisión de canal; no es sustituible por un cambio de código.

### P1 — debería resolverse pronto

**P1-1. Los fallos de envío no crean una entrega reintentable y pueden registrar éxito sin que el cliente reciba acceso.**  
**Evidencia:** `next/src/db/repositorio.ts:197-223` registra `envio_fallido`, pero `enviar()` retorna sin propagar el fallo. `entregarCurso()` registra `acceso_creado` después de llamar a `enviar()` (`repositorio.ts:166-182`); `s10.ts:100-115` agrega luego `entrega_realizada`; el ejecutor no recibe estado durable de envío (`ejecutar.ts:116-118`).

**Impacto:** un pago puede quedar marcado y el token creado aunque Evolution no entregue el enlace; no hay reintento/outbox que garantice que el cliente lo reciba.

**Recomendación:** patrón outbox: persistir la entrega pendiente, enviar, guardar aceptación/id de Evolution, reintentar con backoff y solo marcar “entregada” al confirmarse; alertar a humano al superar el límite. Probar timeout antes/después de aceptación y reintento idempotente.

**Esfuerzo:** 1–2 días.

**P1-2. Webhook deduplica en RAM; puede perder mensajes tras error o reinicio.**  
**Evidencia:** `next/src/api/servidor.ts:135-147` mantiene un `Set` por proceso con máximo 5.000 IDs; se pierden al reiniciar y no se comparten entre réplicas. En el tramo de webhook la excepción de procesamiento se captura y se responde para evitar el bucle de reintentos, pero no queda una tarea durable que reprocesar. `/salud` devuelve `ok: true` sin validar DB/canal (`servidor.ts:152-155`); `/salud/sesion` sí informa estado de sesión (`194-204`).

**Impacto:** mensajes procesados por dos réplicas pueden duplicarse; los IDs viejos salen del set al alcanzar el límite; si falla motor/DB después de deduplicar, el ACK puede impedir reintento y perder el mensaje.

**Recomendación:** inbox PostgreSQL durable con índice único por `id_externo`, estados `recibido/procesado/error`, backoff y dead-letter visible. Redis `SET NX`/TTL puede apoyar dedupe distribuido, no reemplazar inbox. Separar liveness de readiness DB/canal.

**Esfuerzo:** 1–2 días.

**P1-3. Cron de recordatorios puede duplicar envíos concurrentes y no aplica el flag de escalado.**  
**Evidencia:** `next/src/motor/despachar.ts:55-60` selecciona filas vencidas sin `FOR UPDATE`/claim; las marca enviadas solo tras el envío (`157-171`). Lee `escalado_humano` y `estado_funnel` (`63-67`) pero no los evalúa. El contador de seguimientos se incrementa después del envío.

**Impacto:** dos cron simultáneos pueden seleccionar y enviar la misma fila; la carrera también puede superar el tope. Un lead escalado manualmente podría recibir seguimientos si conserva pendientes.

**Recomendación:** claim atómico con `UPDATE … WHERE enviado_en IS NULL AND cancelado_en IS NULL RETURNING …` o `FOR UPDATE SKIP LOCKED` en transacción; lease para fallos; comprobar escalado/estado bajo la misma operación.

**Esfuerzo:** 0,5–1 día.

**P1-4. El horario de seguimientos no coincide con el horario colombiano aplicable a publicidad comercial.**  
**Evidencia:** `next/src/motor/politica-contacto.ts:18-21, 75-94` aplica ventana 24 h, tres seguimientos y horario 08:00–22:00; `recordatorios.ts:51-60, 74-85` programa 20 min, 3 h y 20 h y ajusta hora, pero no día/feriado. La [Ley 2300 de 2023](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=213990), art. 5 y parágrafo 3, extiende a mensajes comerciales/publicitarios por mensajería los horarios del art. 3: lunes–viernes 07:00–19:00, sábados 08:00–15:00 y sin contacto domingos/festivos. WhatsApp Business requiere opt-in; dentro de 24 h permite texto libre en Business Platform y fuera requiere plantilla aprobada.

**Impacto:** 08:00–22:00 y domingos pueden contradecir el horario de publicidad. La ventana técnica de WhatsApp no anula el límite local. No se demuestra opt-in separado para promociones futuras; la primera consulta autoriza responder a lo solicitado, pero no se debe presumir como permiso ilimitado.

**Recomendación:** aplicar horario y calendario festivo por zona, intersección con la ventana de servicio y registro del alcance del consentimiento; conservar STOP global y baja sencilla. Asesoría jurídica debe determinar si cada recordatorio es transaccional o promocional; mientras tanto, usar regla conservadora.

**Esfuerzo:** 0,5–1 día más revisión jurídica.

**P1-5. La protección de edad es autodeclaración, no verificación independiente.**  
**Evidencia:** `next/landing/index.html:260-269` pide un checkbox; S04 acepta la declaración conversacional. No hay control de edad independiente. La política de WhatsApp Business pide medidas técnicas/organizacionales por edad cuando aplique a verticales restringidas; los términos dicen que el material es para mayores de 18 años (`terminos.html:53-55`).

**Impacto:** una persona menor puede marcar “sí” o escribir una edad falsa. No afirmo que una norma colombiana específica exija aquí recoger documento; la evidencia es que el control actual solo prueba autodeclaración y puede ser insuficiente para una categoría con restricción de edad.

**Recomendación:** confirmar clasificación de plataforma y legal; bloquear contradicciones, pedir mayoría antes de material sensible y diseñar verificación proporcionada minimizando datos/documentos. No solicitar cédula por WhatsApp sin base, consentimiento y retención definida.

**Esfuerzo:** 0,5–2 días según mecanismo.

**P1-6. El presupuesto IA de USD 1/día no es una reserva atómica y el diagnóstico puede gastar por fuera.**  
**Evidencia:** `next/src/vision/presupuesto.ts:46-69` lee acumulado y permite si cabe; `lector.ts:104-139` llama proveedor y registra consumo después, por lo que solicitudes concurrentes pueden ver el mismo saldo. Además, `/diagnostico/ia` se conecta directamente a `probarProveedor`/diagnóstico desde `next/src/main.ts:218-234`; la ruta protegida está en `servidor.ts:282-327`, pero el camino de diagnóstico no consulta el presupuesto del lector (`next/src/vision/diagnostico.ts:152-180`).

**Impacto:** concurrencia o abuso de la clave de cron puede superar el tope. Si se alcanza USD 1 cada día, el techo teórico sería ~USD 30/mes, no el gasto esperado.

**Recomendación:** reservar cuota atómicamente antes de cada llamada, incluir diagnóstico, rate-limit y separar credencial administrativa; alertar 50/80/100%, probar concurrencia y mantener fallback humano.

**Esfuerzo:** 0,5–1 día.

**P1-7. Se promete “de por vida”, pero el token vence en 365 días y no se renueva al usarse.**  
**Evidencia:** promesa en `next/src/motor/s10.ts:33-36` y `s08.ts:43-44`; default 365 días en `next/src/acceso/accesos.ts:9-16, 41-61`. `validarToken()` no actualiza `expira_en` (`accesos.ts:76-101`). La cookie dura 30 días (`servidor.ts:166-175`), aunque puede renovarse mientras el token siga válido.

**Impacto:** tras un año, el enlace deja de servir, contrario a la promesa y fuente de soporte/reembolso.

**Recomendación:** hacer el acceso persistente hasta revocación explícita, o cambiar la promesa antes de cobrar por un plazo concreto visible. Añadir test de día 366 y revisión de reemisión.

**Esfuerzo:** 0,5 día.

**P1-8. La postura de RLS no se acredita por el repositorio.**  
**Evidencia:** las migraciones habilitan RLS en tablas propias (`next/migrations/0001_esquema_inicial.sql:36-142`, `0003_recordatorios.sql:32-33`, `0004_accesos.sql:33`, `0005_consumo_ia.sql:39-40`) pero no declaran policies; el servidor usa conexión PostgreSQL directa (`next/src/db/pool.ts:17-33`). El rol real no se verificó.

**Impacto:** si el rol no omite RLS puede fallar el acceso; si es owner/superuser/BYPASSRLS, RLS no es barrera para el servidor. No se puede afirmar el estado efectivo sin tocar producción, cosa prohibida.

**Recomendación:** validar fuera de banda el rol desplegado y probar mínimo privilegio con rol no privilegiado; documentar qué capa protege cada tabla. No leer ni compartir credenciales.

**Esfuerzo:** 0,5–1 día de revisión/configuración.

**P1-9. La verificación de despliegue no queda verde en el entorno auditado.**  
**Evidencia:** `next/scripts/verificar-todo.mjs` ejecutó 35 suites y salió con código 1: `test-main`, `test-medios`, `test-servidor` sin resumen/código 1; los dos tests legados sin resumen son `test-wompi` y `verificar-funnel-colombia`. El test de servidor falló al conectar a `127.0.0.1` con `EACCES`. El prompt espera 1.811 aserciones; el verificador contó 1.690 y 0 fallas entre las contabilizadas. `next/package.json` no integra por sí solo el gate completo.

**Impacto:** no queda probado aquí el arranque real ni las rutas HTTP/medios. El error parece restricción del entorno local, no evidencia suficiente de fallo productivo; CI debe correr en un entorno con loopback permitido y marcar no ejecutada como falla.

**Recomendación:** configurar CI para correr `verificar-todo` antes de deploy, exigir resumen de cada suite, guardar salida y SHA probado; habilitar loopback local en runner. No llamar “todo verde” a una ejecución parcial.

**Esfuerzo:** 0,5–1 día.

**P1-10. La promesa de 17 enlaces y el formato de entrega real no están alineados.**  
**Evidencia:** `next/landing/index.html` promete 17 enlaces en una pregunta frecuente; `next/src/motor/s10.ts:89-115` compone módulos/bonos y entrega un enlace personal; `next/src/acceso/pagina.ts` sirve una página privada. S10 incluye el plan de acción si está configurado (`s10.ts:72-77`), sin plazo de 24 h.

**Impacto:** expectativa precompra distinta de experiencia y tickets por enlaces faltantes. No se debe presentar como temporal un beneficio que el código entrega siempre.

**Recomendación:** describir con precisión página privada, módulos, bonos, formatos/tamaño y método de entrega en landing, términos, copy y mensaje posterior al pago; retirar escasez temporal que no se aplica.

**Esfuerzo:** 0,5 día.

### P2 — mejora

**P2-1. Token bearer en la ruta de cada archivo.**  
**Evidencia:** `next/src/api/servidor.ts:207-224` valida `/media/<token>/<clave>`; `next/src/acceso/pagina.ts:46-53` construye el enlace con token. El token es credencial reutilizable mientras siga vigente (`accesos.ts:16-21, 81-101`). `rel="noopener noreferrer"` reduce envío de Referer desde tarjetas, no historial ni logs de proxy.

**Impacto:** riesgo de exposición por historial, logs y copia de URL.

**Recomendación:** endpoint de medios autorizado por cookie HttpOnly/SameSite y key; para objetos, URL firmada corta tras validar cookie. Añadir `Referrer-Policy: no-referrer`, excluir rutas sensibles de logs y no registrar token.

**Esfuerzo:** 1–2 días.

**P2-2. La comprobación de traversal es léxica y no detecta symlinks.**  
**Evidencia:** `next/src/acceso/medios.ts:57-108` rechaza `..` y rutas fuera de raíz por `resolve`, pero sigue enlaces simbólicos mediante `statSync`; el servidor abre luego el archivo (`servidor.ts:270-278`). No se encontró ruta de escritura remota que permita plantar el symlink.

**Impacto:** un actor con capacidad de escribir en el almacén local podría crear un symlink fuera de la raíz; no es bypass directo con una clave `..`.

**Recomendación:** comparar `realpath` con la raíz real o impedir symlinks con permisos/configuración; añadir prueba controlada en runner compatible.

**Esfuerzo:** bajo.

**P2-3. Página del curso sin búsqueda ni progreso.**  
**Evidencia:** `next/src/acceso/pagina.ts` renderiza tarjetas/listas de módulos y archivos, sin búsqueda ni marcador de avance. Con 60 archivos puede ser incómodo en móvil aunque no sea una vulnerabilidad.

**Recomendación:** índice por módulo, búsqueda simple, formato/tamaño, “continuar donde quedé”, FAQ de acceso y comprobación en móviles de gama baja. No invertir en LMS antes de medir uso/tickets.

**Esfuerzo:** 1–3 días.

**P2-4. Comentario de arranque desactualizado.**  
**Evidencia:** `next/src/main.ts:11-13` dice que hoy usa `motorEco` y que el motor real se inyectará después; `main.ts:50-96, 121-132` construye motor real si existe `DATABASE_URL`. El encabezado puede confundir a quien audite/despliegue.

**Recomendación:** actualizar el comentario y alinear README/hitos tras confirmar estado del deploy, sin inferir producción desde el código local.

**Esfuerzo:** bajo.

## Las 10 preguntas, respondidas

### 1. «No toques el módulo verificado, envuélvelo»: ¿deuda sana o problema creciente?

Es una decisión sana si las capas son pequeñas, nombradas y cubiertas por casos de frontera; no hay que modificar código portado diferencialmente solo por estética. Se vuelve deuda cuando la semántica queda repartida —como `imagenDuplicada`/`refDuplicada` que el cableado no transporta— y el autor del módulo no conoce el resultado de la capa. Mantendría una capa estricta por frontera, con contrato único, pruebas de integración y responsable. No hay un número mágico de capas; evitar encadenar más de una política que pueda cambiar el resultado sin una tabla de decisión común.

### 2. ¿Token en la ruta para contenido, o hay forma mejor para `<video>`?

Es funcional, pero el token sigue siendo bearer y puede filtrarse en historial/logs. Lo mejor es cookie HttpOnly/SameSite para autenticar `/media/<key>`; el elemento video envía cookies same-origin. Si se usa almacenamiento externo, el servidor valida cookie y redirige a URL firmada corta. No depender de un header que `<video>` no pueda establecer.

### 3. Deduplicación en memoria: disparador concreto para Redis; ¿una réplica hasta X clientes?

No depende de clientes: se pierde con el primer reinicio y deja de compartirse al tener dos réplicas; además el set expulsa al superar 5.000 IDs. Pondría inbox durable de Postgres antes del primer piloto. Redis `SET NX`/TTL se vuelve necesario al escalar horizontalmente, pero no sustituye la inbox ni el registro de errores. No lanzaría con 2 réplicas antes de dedupe compartido.

### 4. Baileys vs Cloud API: ¿cuándo migrar?

Antes de campañas pagadas o de depender de un número que soporte pagos de clientes; inmediatamente ante una restricción/aviso, desconexiones recurrentes, necesidad de plantillas fuera de ventana o más de una réplica. Cloud API mejora estabilidad/compliance técnica, pero no cambia una clasificación de producto prohibida. Si Meta clasifica la oferta como adulto no admisible, se necesita otro canal o cambiar oferta.

### 5. Ventana de 24 h y follow-ups: ¿falta algo legal en Colombia?

Sí. El código cubre 24 h y tres contactos, pero usa 08:00–22:00 y no excluye domingos/festivos. La Ley 2300 de 2023, art. 5/par. 3, aplica horarios del art. 3 a mensajes comerciales/publicitarios por mensajería: lunes–viernes 07:00–19:00, sábado 08:00–15:00, no domingos/festivos. Además, WhatsApp Business exige opt-in; 24 h habilita texto libre en Platform, no consentimiento ilimitado; fuera de ventana exige plantilla. Confirmar con abogado si cada seguimiento es transaccional o publicidad y guardar consentimiento por categoría.

### 6. Landing sin testimonios: ¿lanzar así o esperar a tener tres?

Lanzar como piloto controlado sin testimonios es mejor que inventarlos o esperar una cifra arbitraria. Usar demo real, contenido de muestra, vendedor/soporte identificable, entrega y política claras. Pedir permiso separado a beta testers para publicar comentario; no usar resultados de ingresos no demostrados.

### 7. Con ticket de 9 USD, ¿dónde pondrías upsell y a qué precio?

Dejaría USD 9/COP 33.000 como hipótesis inicial y mediría margen real antes de cambiar. Si Wompi Plan Avanzado se activa, la tarifa publicada es 2,65% + COP 700 + IVA por transacción exitosa: sobre COP 33.000 son COP 1.574,5 antes del IVA aplicable (~4,8% antes de otros costos). Plan activo no verificado. Probaría después de validar entrega un único add-on verdaderamente incremental (pack propio de plantillas/prompts) a **COP 19.900**, opcional tras la compra; es precio de experimento, no forecast. No vender como upsell un bono que ya se anuncia incluido.

Margen = cobro neto − comisión/impuestos − adquisición − minutos de soporte/verificación × costo laboral − reembolsos/contracargos − hosting/egress/backups. Si 100 compradores descargan cada uno los 12,5 GB completos una vez, son hasta 1,25 TB de transferencia potencial; el costo depende del plan/uso y no está probado por el dato de USD 0,19/mes de storage. El techo de USD 1/día puede sumar ~USD 30/mes si se consume todos los días y no es duro bajo concurrencia.

### 8. ¿La capa estricta puede aprobar pago falso?

Sí hay una ruta no cerrada: referencia nula con confianza alta, fecha opcional, SHA que no se persiste ni pasa como duplicado, y ningún cotejo bancario. La capa sí mejora destino exacto, monto y ventana de fecha, por lo que conservarla; desactivar aprobación automática hasta exigir referencia y duplicados/estado de operación por código. Incluso con validación perfecta de campos, una imagen no demuestra que el dinero esté abonado.

### 9. Si esto fuera mío y tuviera una semana, ¿qué haría y qué no?

Priorizaría (1) congelar autoaprobación y hacer funcionar canal real de medios + outbox/manual reconciliation; (2) resolver clasificación WhatsApp/Meta y completar vendedor, términos, privacidad, retracto, número CTA y horario; (3) probar el ciclo con operador, CI que pueda usar loopback, backup restaurado y alertas de servidor/sesión antes de un piloto de bajo volumen.

No publicaría con número placeholder, no pondría anuncios, no conectaría dinero real, no sumaría réplicas ni reescribiría los módulos diferencialmente verificados. Tampoco esperaría tres testimonios ni agregaría un upsell antes de validar entrega y soporte.

### 10. ¿Qué no se preguntó y debería?

Derechos y consentimiento del contenido: licencias de módulos/bonos, música/voz/plantillas, derecho de imagen y uso comercial, origen de imágenes sintéticas, likeness de personas reales, ausencia absoluta de menores y material sexual no consensuado, y permiso de redistribución. Añadir obligación fiscal, responsable del tratamiento y proceso de eliminación/retención de comprobantes. Si no puede documentarse, excluir ese material hasta resolverlo.

## Lo que no te pregunté

El riesgo más importante fuera del código es vender un producto cuya categoría no esté permitida por el canal/procesador, o redistribuir material sin derechos/consentimientos acreditables. El número de WhatsApp, la cuenta de pago, la identidad jurídica y el canal de soporte no son detalles de implementación: son dependencias de lanzamiento. La página de reembolsos aún se identifica como propuesta pendiente; no debe mostrarse ni usarse como condición definitiva.

## Si tuviera una semana

1. **Día 1–2:** desactivar `AUTO_APROBAR`; cablear bytes de Evolution al lector; guardar referencia/huella y mandar duplicados a humano; garantizar una tarea de entrega reintentable.
2. **Día 3–4:** obtener clasificación escrita de WhatsApp/Meta y del procesador; completar teléfono/identidad/privacidad/retención/retracto/reembolso con revisión legal; corregir consentimiento, horarios y gate 18+.
3. **Día 5–7:** inbox/outbox y claim de cron atómicos; CI con loopback y suites completas; prueba de restore de DB/objetos; alertas externas de liveness, readiness DB y sesión. Solo después, piloto pequeño con pagos verificados manualmente.

**No haría en esa semana:** campañas, varias réplicas, automatización de pago real, cambios innecesarios a módulos verificados ni compra de más herramientas antes de medir margen/soporte.

## Anexo: lo que no pude verificar

### Verificación de las 10 afirmaciones

1. **Webhook 403 con firma inválida — verificada.** `servidor.ts` verifica antes de parsear y contesta 403; `functions/canal/evolution.ts` falla cerrado si no hay credencial.
2. **STOP deja en opt-out — verificada con alcance local.** `router.ts` devuelve silencio si ya `opt_out`; STOP aplica patch `opt_out=true` antes del despacho. La persistencia es DB; “para siempre” depende de no reactivar manualmente el registro.
3. **Un mensaje que empieza con “no” no se marca como menor — verificada como heurística corregida.** `next/src/motor/gate-edad.ts` y sus tests consideran negaciones; no es prueba de edad real.
4. **Mismo comprobante no se paga dos veces — refutada.** La lectura cacheada vuelve como `ok`, `motor-real` fija `imagenDuplicada:false` y referencia nula no queda cubierta por UNIQUE. Ver P0-1.
5. **Sin proveedor, todo comprobante va a humano — parcialmente cierta.** Si el lector recibe medio con URL válida, falta de proveedor devuelve cola humana; el contrato real de Evolution no entrega esa URL y cae primero en `pedir_reenvio` (P0-2).
6. **Claim atómico anti-doble-entrega — verificada para reclamar.** `repositorio.ts:184-190` hace `UPDATE ... WHERE pagado=false RETURNING`; `ejecutar.ts:128-139` corta si pierde. No resuelve fallo posterior de envío (P1-1).
7. **`..` no permite leer fuera del almacén — verificada para traversal léxico; con reserva.** `medios.ts` rechaza traversal; no comprueba symlink (P2-2).
8. **Gasto IA se corta al llegar al tope — refutada como límite duro.** Hay chequeo secuencial fail-safe, pero no reserva atómica y diagnóstico fuera del presupuesto (P1-6).
9. **Reemitir acceso revoca anterior — verificada.** `accesos.ts:46-61` revoca antes de emitir. Riesgo residual: sin transacción, si falla la creación tras revocar, el usuario puede quedarse sin token vigente.
10. **Nada se aprueba sin datos válidos — refutada en referencia/estado.** `validarDatos()` sanea tipos, pero permite referencia nula; la decisión original valida confianza declarada, no presencia. Ver P0-1.

### Pruebas locales

- `node next/scripts/verificar-todo.mjs`: 35 suites; 1.690 aserciones correctas; 0 fallidas contabilizadas; código de salida 1 por `test-main.mjs`, `test-medios.mjs`, `test-servidor.mjs` sin resumen/código 1. Informa además `test-wompi.mjs` y `verificar-funnel-colombia.mjs` como legadas sin resumen.
- `node --experimental-strip-types next/scripts/test-vision.mjs`: **83 ok, 0 fallas**.
- `node --experimental-strip-types next/scripts/test-pago-estricto.mjs`: **42 ok, 0 fallas**.
- `node --experimental-strip-types next/scripts/test-servidor.mjs`: falló al conectar a `127.0.0.1` con `EACCES` en este entorno. `test-main` y `test-medios` también dependen de servidor/loopback; no se certificó su integración. Esto no prueba un defecto en producción, pero el CI debe ejecutar esas rutas en un runner con loopback habilitado.

### Fuentes externas consultadas

- [Ley 2300 de 2023, Gestor Normativo de Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=213990), arts. 1–5 y par. 3 del art. 5.
- [Ley 1480 de 2011, Gestor Normativo de Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306), arts. 47–50. La aplicación a un producto digital concreto requiere criterio jurídico.
- [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/), actualización visible 23-sep-2026, secciones 1–4 y Commerce.
- [Meta Community Standard: Adult Nudity and Sexual Activity](https://transparency.meta.com/policies/community-standards/adult-nudity-sexual-activity/). No se extrapoló como dictamen único de WhatsApp.
- [Reglamento de comercios Wompi Colombia (PDF)](https://wompi.com/assets/downloadble/reglamento-Comercios-Colombia.pdf), art. 14.6, versión V4-2026 leída.
- [Tarifas Wompi Colombia](https://wompi.com/es/co/planes-tarifas/), Plan Avanzado publicado: 2,65% + COP 700 + IVA por transacción exitosa. Elegibilidad/plan real no verificados.

### Límites de la auditoría

No se verificó Railway, Evolution desplegado, Postgres, número/QR, proveedor de pagos activo, rol efectivo/RLS, backups, alertas externas, aprobaciones de Meta/Wompi, venta, cliente ni configuración viva. No se leyeron `.env`, `.env.*` ni `.insforge`; no se ejecutó E2E, calibración o diagnóstico de proveedor, no se llamaron APIs de pago ni de IA. Los hallazgos de entorno se contrastaron solo con código/documentación local y fuentes públicas oficiales.
