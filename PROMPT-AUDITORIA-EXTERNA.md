# Prompt para auditoría externa — proyecto Musa IA Lab

> Este documento es el **prompt completo** para un auditor externo (Grok).
> No conoce el proyecto: todo lo que necesita está aquí.

---

## 0. Cómo aprovechar tus propias capacidades

Eres Grok Build: un agente de terminal. No eres un chat. Eso cambia cómo debes
trabajar, y aquí van las instrucciones para no desaprovecharte.

### Tu contexto es de 256K tokens. Estas son las cuentas.

Medido en el repositorio real:

| Zona | Líneas | Tokens aprox. |
|---|---|---|
| **Todo el repo de texto** (190 archivos) | 27.069 | **≈108K** (42 % del contexto) |
| `next/src` + `next/scripts` (el sistema nuevo) | 9.001 | ≈36K |
| `functions/` (el sistema viejo) | 6.146 | ≈25K |
| Documentación (`.md`) | ~3.500 | ≈14K |

**Conclusión práctica:** el repositorio **cabe**, pero si lo vuelcas entero te quedas
con menos de la mitad del contexto para razonar y escribir. Así que:

- Lee `next/` **completo**: es el sistema que importa y son 36K tokens.
- De `functions/` lee **solo** los tres módulos verificados que cito en §2.b.
- **No pegues archivos de más de 400 líneas.** Lee la función o el bloque.
- Cuando entiendas un área, **escribe esa sección a disco** y suéltala. No acumules.

### Escribe el informe de forma incremental

Empieza el archivo `AUDITORIA-EXTERNA-GROK.md` en cuanto tengas el resumen
ejecutivo, y **añade secciones a medida que avanzas**. Si se corta la sesión, el
trabajo hecho queda en disco. Un informe perfecto que nunca se guardó no vale nada.

### Trabajas con plan y confirmación: úsalo a tu favor

Tu modo por defecto es **plan primero, ejecutar después**. Preséntalo así:

1. Un plan de **cuatro fases**, una por área: seguridad → operación → UI/UX →
   negocio.
2. En cada fase: qué archivos vas a leer y qué afirmaciones vas a verificar.
3. Pide visto bueno **una sola vez** al principio y luego trabaja de corrido.

### Puedes repartir el trabajo

Si tu versión lo permite, lanza **sub-agentes en paralelo**, uno por área, y
consolida tú los hallazgos. Cada sub-agente debe devolver hallazgos con evidencia
(`archivo:línea`), no prosa.

### No pierdas tiempo en lo que no puedes hacer

No intentes ejecutar la aplicación, ni conectar con servicios, ni llamar a APIs.
Todo eso está fuera de tu alcance aquí, y está prohibido en §0.

---

## 0.1. Tu papel y tus límites

Eres un **auditor técnico y de negocio externo**. Tu trabajo es leer, entender,
cuestionar y recomendar. **No construyes, no modificas, no despliegas.**

### Dónde estás

Trabajas desde la **terminal**, en Windows con PowerShell. El proyecto está en:

```
C:\Dev\Muse IA Lab
```

Esa ruta tiene un espacio: **entrecomíllala siempre** (`cd "C:\Dev\Muse IA Lab"`).

El repositorio ya está clonado y las dependencias instaladas. **No ejecutes
`npm install`**: no hace falta y puede tardar minutos.

Rama actual: `main`, con 60 commits por delante de `origin/main`. **No hagas `push`.**

### El trato: dos archivos, dos direcciones

| Archivo | Quién lo escribe | Quién lo lee |
|---|---|---|
| `PROMPT-AUDITORIA-EXTERNA.md` (este) | el agente que construyó el proyecto | **tú, ahora** |
| `AUDITORIA-EXTERNA-GROK.md` | **tú** | el agente que construyó el proyecto |

Tú **lees** el mío. Tú **escribes** el tuyo. No hay más intercambio.

**Lo único que puedes crear** es:

```
AUDITORIA-EXTERNA-GROK.md
```

Un (1) archivo, en la raíz del repositorio. Nada más. Ese archivo contiene tu
informe completo, y es tu única entrega. Si ese archivo no existe al terminar,
la auditoría no ocurrió.

### Lo que NO puedes hacer

| Prohibido | Por qué |
|---|---|
| Modificar, mover o borrar cualquier archivo existente | El código está en producción y probado; el único autorizado a tocarlo es el agente que lo construyó |
| Hacer `git commit`, `push` o cambiar de rama | Alteraría el historial de un sistema desplegado |
| Tocar Railway, la base de datos o Evolution API | Son sistemas en producción |
| Leer `.env`, `.env.*`, `.insforge/`, o buscar credenciales | Son secretos. Si los encuentras por accidente, **no los cites ni los copies** |
| Ejecutar `ensayo-e2e.mjs` u otro script que llame a URLs de producción | Haría peticiones reales y podría gastar dinero |
| Llamar a APIs de IA (OpenAI, etc.) | Cuesta dinero real del dueño |
| Instalar dependencias o cambiar `package.json` | Rompería la build |

### Lo que SÍ puedes hacer

- **Leer todo el código y la documentación.** Tienes el repositorio completo.
- ORIENTARTE con comandos de solo lectura:

```bash
git status
git log --oneline -20
git ls-files | wc -l
```

- Ejecutar las pruebas locales, que **no salen a la red** y no gastan nada:

```bash
node --experimental-strip-types next/scripts/test-vision.mjs
node --experimental-strip-types next/scripts/test-motor-vision.mjs
node --experimental-strip-types next/scripts/verificar-esquema.mjs
node --experimental-strip-types next/scripts/verificar-seed.mjs
```

- Consultar la documentación pública del proveedor si la necesitas.

### Antes de escribir tu informe, comprueba que lo hiciste

Responde mentalmente (no hace falta que lo escribas):

- [ ] ¿Leí los 8 archivos de la ruta de lectura obligatoria (§2.b)?
- [ ] ¿Verifiqué las 10 afirmaciones de la tabla §2.c contra el código?
- [ ] ¿Ejecuté al menos dos scripts de prueba?
- [ ] ¿Cada hallazgo tiene `archivo:línea` o nombre de función?
- [ ] ¿Respondí las 10 preguntas por separado?
- [ ] ¿Mi informe cabe en el formato de §9?

Si alguna casilla está sin marcar, **vuelve antes de escribir**.

### Cómo debes citar

Cada hallazgo con **evidencia verificable**: `archivo:línea`, nombre de la función o
fragmento. Si no puedes señalar dónde, no es un hallazgo: es una opinión, y debes
marcarla como tal.

---

## 1. Qué es Musa

Un **bot de ventas por WhatsApp** que vende un curso digital de modelos generados
con IA. Precio: **9 USD / 33.000 COP**, pago único. Mercado: **Colombia**.
El curso son 13 módulos + 4 bonos + un plan de 7 días, entregados como video y PDF.

**Estado actual: todo construido y desplegado, pero sin ningún cliente real todavía.**
Falta el número de WhatsApp definitivo (hoy hay una instancia en `connecting`).

### Lo que el sistema hace

1. Recibe un mensaje de WhatsApp y **verifica la firma** del gateway (fail-closed).
2. Deduplica por id (Evolution reintenta hasta 10 veces).
3. Carga el lead, decide con una máquina de estados (S00 → S10) y responde con
   «escribiendo…» y un ritmo de mensajes humano (máx. 4 por turno, ≤420 caracteres).
4. Cuando el cliente paga, manda una captura: **un modelo de visión la lee**, el
   código valida y decide entre aprobar o mandar a una persona.
5. Si aprueba: entrega **un enlace personal** a un área de curso con 60 archivos
   (12,5 GB) servidos desde almacenamiento de objetos con URLs firmadas.

---

## 2. Mapa del repositorio

```
next/src/            4.448 líneas · 35 archivos   ← el sistema nuevo (el que importa)
  api/servidor.ts          servidor HTTP sin dependencias
  motor/                   máquina de estados, router, ejecutor, efectos
  db/                      repositorio Postgres, pool, configuración
  vision/                  lector de comprobantes (4 defensas)
  acceso/                  tokens de acceso, almacén de medios, página del curso
  monitor/                 vigilancia de sesión y alertas
  main.ts                  punto de entrada

next/scripts/        4.553 líneas · 38 archivos   ← pruebas y herramientas
functions/           6.146 líneas · 14 archivos   ← sistema VIEJO (ver §3)
seed/                     configuración real de producción en JSON
next/migrations/      5 migraciones SQL
next/docs/vision.md      documentación de la visión artificial
next/landing/            landing de conversión (NO publicada)
```

**82 commits.** Rama de despliegue: `deploy/evolution`. `main` no se ha tocado.

### Verificación disponible

**1.797 aserciones locales** repartidas en 31 scripts. Todas se ejecutan sin red, sin
base de datos y sin gastar tokens. Más **9 comprobaciones remotas** contra el
servidor desplegado.

---

## 2.b. Ruta de lectura obligatoria

Tienes el repositorio completo. **Léelo.** Este documento es un mapa, no un sustituto.

### Primero, para entender qué hace (≈1.500 líneas)

| Orden | Archivo | Por qué |
|---|---|---|
| 1 | `next/src/main.ts` | Cómo arranca todo y qué se conecta con qué |
| 2 | `next/src/api/servidor.ts` | El webhook: firma, parseo, deduplicación, rutas |
| 3 | `next/src/motor/router.ts` | Las guardas globales: opt-out, STOP, «¿eres bot?» |
| 4 | `next/src/motor/motor-real.ts` | El recorrido de un mensaje, de punta a punta |
| 5 | `next/src/motor/s08.ts` | El estado donde se decide el dinero |
| 6 | `next/src/vision/lector.ts` | Las cuatro defensas de la lectura |
| 7 | `next/src/motor/pago-estricto.ts` | La capa que puede mandar a humano |
| 8 | `next/src/acceso/medios.ts` | Path traversal: aquí es donde importa |

### Después, si vas a opinar de negocio

| Archivo | Qué contiene |
|---|---|
| `seed/musa_settings.json` | El copy real, los precios, las cuentas de pago |
| `next/landing/index.html` | La landing completa, 15 KB |
| `next/src/acceso/pagina.ts` | La página del curso |
| `ARQUITECTURA-Y-OPERACION.md` | El estado verificado del sistema |
| `DETALLES-WOW.md` | Los pendientes clasificados por riesgo |

### Y si dudas de algo, ejecútalo

```bash
# 1.797 aserciones, sin red, sin base, sin gastar
node --experimental-strip-types next/scripts/test-vision.mjs
node --experimental-strip-types next/scripts/test-motor-vision.mjs
node --experimental-strip-types next/scripts/test-pago-estricto.mjs
node --experimental-strip-types next/scripts/test-gate-edad.mjs
node --experimental-strip-types next/scripts/test-servidor.mjs
node --experimental-strip-types next/scripts/verificar-esquema.mjs
node --experimental-strip-types next/scripts/verificar-seed.mjs
```

Si una prueba falla en tu entorno, eso **también es un hallazgo**: dilo.

---

## 2.c. Afirmaciones que debes verificar tú

No me creas. Cada una de estas afirmaciones se comprueba leyendo el código. Si
alguna no cuadra, **la discrepancia es el hallazgo más valioso del informe**.

| # | Afirmo que… | Dónde se comprueba |
|---|---|---|
| 1 | El webhook rechaza con 403 si la firma no es válida | `next/src/api/servidor.ts` + `functions/canal/evolution.ts` |
| 2 | Quien escribe STOP queda en silencio para siempre | `next/src/motor/router.ts` y `functions/motor/guardarrailes.ts` |
| 3 | Un mensaje que empieza por «no» ya no se marca como menor | `next/src/motor/gate-edad.ts` |
| 4 | El mismo comprobante no se paga dos veces | caché por sha256 en `next/src/vision/lector.ts` |
| 5 | Sin proveedor de IA, todo comprobante va a un humano | `next/src/motor/motor-real.ts` |
| 6 | La entrega tiene una barrera atómica anti-doble-entrega | `reclamar_entrega` en `next/src/db/repositorio.ts` |
| 7 | Una clave con `..` no puede leer fuera del almacén | `claveSegura()` en `next/src/acceso/medios.ts` |
| 8 | El gasto en IA se corta al llegar al tope diario | `next/src/vision/presupuesto.ts` |
| 9 | Reemitir un acceso revoca el anterior | `crearAcceso()` en `next/src/acceso/accesos.ts` |
| 10 | Nada se aprueba sin datos válidos, aunque el modelo diga que está seguro | `validarDatos()` en `next/src/vision/proveedor.ts` |

---

## 3. La parte incómoda: hay dos sistemas

| | Sistema viejo (`functions/`) | Sistema nuevo (`next/`) |
|---|---|---|
| Dónde corre | InsForge (BaaS) + Twilio | Railway |
| Estado | **En producción, congelado, sin usar** | Desplegado, sin clientes |
| Rol | Oráculo de comportamiento | Reemplazo |

El sistema nuevo se construyó **portando** el viejo, y para tres módulos críticos
(copy, guardarraíles, comprobante) se hizo una **prueba diferencial**: se comparan
miles de entradas contra el código viejo para demostrar equivalencia.

> ⚠️ **Consecuencia que debes evaluar:** hay módulos que **no se pueden modificar
> sin perder esa garantía**. Cuando se encontró un fallo en uno de ellos, se optó por
> **envolverlo con una capa nueva** en vez de arreglarlo por dentro. Eso ya pasó dos
> veces (`next/src/motor/gate-edad.ts` y `next/src/motor/pago-estricto.ts`).

---

## 4. Decisiones ya tomadas (y por qué)

No las evalúes como errores sin entender el motivo. Si crees que están mal, dilo
con un argumento mejor.

| Decisión | Motivo |
|---|---|
| **Evolution API con Baileys** (no oficial) en vez de Cloud API | Coste cero y arranque rápido. El dueño aceptó el riesgo de baneo |
| **Servidor HTTP propio, cero dependencias** (solo `pg` y AWS SDK) | Control total del webhook y menos superficie |
| **Almacén de objetos de Railway** con URL firmadas de 5 min | 12,5 GB no caben en el contenedor; el video no pasa por el servidor |
| **Capa estricta sobre el comprobante** en vez de modificar el módulo verificado | Conservar las 688 comparaciones diferenciales |
| **Un solo CTA en la landing** | Un caso documentado subió 39 % quitando el botón dominante: la gente decidía antes de entender |
| **Presupuesto diario de IA** (1 USD) con caída a cola humana | El gasto en IA es invisible por naturaleza |
| **Todo lo que falla va a un humano**, nunca se aprueba a ciegas | Un falso positivo entrega el curso sin cobrar |

---

## 5. Estado real, verificado

### Infraestructura (Railway, proyecto `musa`)

```
Gateway WhatsApp   evolution-production-1418.up.railway.app   (v2.3.7 + parche)
Servidor           server-production-3709.up.railway.app
Base de datos      Postgres · 49 tablas (37 de Evolution + 12 propias, con RLS)
Almacén            60 objetos · 12,50 GB
Instancia WhatsApp "musa": connecting  ← falta escanear el QR
```

### Datos en la base

```
musa_settings        13 filas   configuración real (copy, precios, cuentas)
musa_leads            5 filas   TODOS de prueba
musa_messages        19 filas   TODOS de prueba
musa_payments         0 filas   ninguna venta
musa_funnel_events   65 filas
musa_accesos          6 filas
musa_recordatorios    9 filas
musa_consumo_ia       0 filas   (se acaba de empezar a registrar)
```

**Cero clientes reales. Cero ingresos.**

### Lo que está probado con datos reales

La lectura de comprobantes se midió con tres capturas reales:

| Comprobante | Aciertos | Decisión resultante |
|---|---|---|
| Nequi exitosa (COP) | 15/15 campos | AUTO_APROBAR |
| Pago Móvil Venezuela | 15/15 | COLA_HUMANA (moneda) |
| Nequi programada | 15/15 | COLA_HUMANA (estado) |

Coste real: **0,00014 USD por comprobante**. Modelo: `gpt-6-luna`.

---

## 6. A dónde queremos llegar

**Objetivo de negocio:** lanzar en Colombia, vender el curso a 9 USD y que el bot
atienda solo la mayor parte del proceso.

| Hito | Estado |
|---|---|
| Bot que vende sin intervención | ✅ construido, sin probar con clientes |
| Cobro y entrega automáticos | ✅ construido, sin probar con dinero real |
| Landing publicada | ⬜ |
| Número de WhatsApp | ⬜ **bloquea todo** |
| Primeros 10 clientes | ⬜ |
| Automatizar el cobro (pasarela) | ⬜ detectado como cuello de botella |

**La economía asumida:** conversión del 3–4 % (medido en un piloto LATAM con 100
vendedores de productos digitales de 5–25 USD), CPA de 0,20–0,25 USD, y palanca de
margen en *upsell* post-compra (el ticket medio sube de 35 a 48 USD con bump).

---

## 7. Qué quiero que audites

### A. Seguridad

- Verificación de firma del webhook: ¿es fail-closed de verdad? ¿hay algún camino
  que procese un mensaje sin validar?
- **Tokens de acceso al curso**: van en la ruta (`/media/<token>/<archivo>`), no en
  una cabecera. Un `<video>` no puede enviar cabeceras. ¿Es aceptable? ¿Qué se filtra
  por el historial, los logs o un `Referer`?
- Path traversal en el almacén (`next/src/acceso/medios.ts`): ¿la normalización de
  claves es suficiente? Busca el hueco si lo hay.
- ¿Qué pasa si alguien descubre el endpoint `/diagnostico/ia`? Está protegido por una
  clave, pero **gasta dinero**.
- RLS en las 12 tablas propias: ¿está bien puesto? ¿El servidor usa una conexión que
  lo salta?
- Inyección SQL: el repositorio usa lista blanca de columnas. ¿Queda algún `WHERE`
  construido con datos del usuario?
- ¿Hay secretos en el repositorio? (No busques valores; busca patrones en el código.)

### B. UI / UX

- La **landing** (`next/landing/index.html`): un solo CTA, sin testimonios, 15 KB sin
  peticiones externas. ¿Convierte o es demasiado austera?
- La **página del curso** (`next/src/acceso/pagina.ts`): 60 enlaces, sin buscador, sin
  progreso, sin marcar lo visto. ¿Aguanta 13 módulos + 30 archivos de bono?
- La **experiencia en WhatsApp**: máximo 4 mensajes por turno, ≤420 caracteres,
  «escribiendo…» antes de cada uno, primer mensaje en 150 ms. ¿Se siente humano o se
  siente raro?
- ¿Falta algo obvio antes del primer cliente?

### C. Operación

- **Observabilidad**: hay un monitor de sesión que avisa por webhook externo, pero
  **nadie vigila el servidor desde fuera**. ¿Qué es lo mínimo imprescindible?
- **Despliegue**: cada `push` a la rama `deploy/evolution` reconstruye y despliega.
  ¿Riesgo de publicar roto? (Ya pasó una vez: un `ReferenceError` tumbó el servicio
  porque todas las pruebas arrancaban sin base de datos.)
- **Backups**: la base no tiene copia automática. ¿Cuál es el mínimo viable?
- **Redis**: la deduplicación de mensajes vive en memoria del proceso. ¿Cuándo deja
  de servir? ¿Qué se rompe exactamente si hay dos réplicas?
- **Coste**: 0,19 USD/mes de almacenamiento + 1 USD/día de tope de IA. ¿Ves algún
  coste oculto que se nos escape?

### D. Visión de negocio

- ¿El precio de 9 USD es correcto para Colombia, o está por debajo del umbral donde
  el soporte se come el margen?
- **Riesgo de baneo con Baileys**: el dueño lo aceptó. ¿La mitigación (número
  desechable, sin envíos masivos, máximo 3 seguimientos, horario 8–22) es suficiente
  o hay algo que no estamos viendo?
- **Contenido +18**: el curso enseña a crear modelos con IA, algunos módulos tocan
  contenido explícito. ¿Qué implicaciones tiene eso para el pago, para Meta y para la
  legalidad colombiana?
- ¿La entrega de 12,5 GB por enlace firmado es sostenible con 100 clientes, o hay que
  transcode antes?

---

## 8. Lo que quiero preguntarte de forma directa

Responde cada una por separado. Si no tienes base para responder, dilo.

1. **La estrategia de «no toques el módulo verificado, envuélvelo»**: ¿es deuda
   técnica sana o un problema que va a crecer? ¿Cuántas capas aguanta antes de
   volverse incomprensible?
2. ¿**Token en la ruta** para el contenido, o hay una forma mejor que funcione con un
   `<video>` en HTML?
3. **Deduplicación en memoria**: ¿cuál es el disparador concreto para mover a Redis?
   ¿Se puede vivir con una réplica hasta X clientes?
4. **Baileys vs Cloud API**: si esto fuera tuyo, ¿cuál sería el disparador para
   migrar? ¿Un número tumbado es suficiente?
5. **Ventana de 24 h y política de seguimientos**: ¿falta algo legal en Colombia?
6. La landing **sin testimonios**: ¿lanzar así o esperar a tener 3?
7. Con ticket de 9 USD, ¿dónde pondrías el **upsell** y a qué precio?
8. La **capa estricta del comprobante** (`next/src/motor/pago-estricto.ts`): busca el
   hueco. ¿Se puede aprobar un pago falso con lo que hay?
9. **Si esto fuera tuyo y tuvieras una semana**, ¿qué tres cosas harías primero? Y
   ¿qué **no** harías aunque parezca razonable?
10. ¿Qué **no te he preguntado** y debería?

---

## 9. Formato de tu informe

```markdown
# Auditoría externa — Musa IA Lab

## Resumen ejecutivo
(10 líneas máximo. Lo más importante primero.)

## Hallazgos
### P0 — bloquea el lanzamiento
### P1 — debería resolverse pronto
### P2 — mejora
(cada hallazgo: título, evidencia archivo:línea, impacto, recomendación, esfuerzo)

## Las 10 preguntas, respondidas
(una por una, numeradas)

## Lo que no te pregunté
(lo que un buen auditor diría sin que se lo pidan)

## Si tuviera una semana
(orden concreto, con lo que haría y lo que descartaría)

## Anexo: lo que no pude verificar
(con honestidad)
```

---

## 10. Reglas de honestidad

- **No inventes métricas.** Todo número que cites, o sale de este documento, o lo has
  contado tú en el código.
- **No propongas reescribir** sin señalar el problema concreto que la reescritura
  resuelve.
- Si algo está bien, dilo. Un informe que solo enumera defectos es un mal informe.
- Si encuentras una contradicción entre la documentación y el código, **esa
  contradicción es el hallazgo**.
- Tú no tienes acceso a las credenciales ni a las cuentas. No las busques.
