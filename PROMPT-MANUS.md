# Prompt de auditoría externa — Manus

> Auditoría de **solo lectura** del proyecto Musa. Manus trabaja en tu equipo
> (Manus Studio · «My Computer»), sobre la carpeta del proyecto.

---

## 0. Cómo empezar (antes de pegar el prompt)

**1. Abre Manus Studio → «My computer».**

**2. Autoriza UNA sola carpeta:**

```
C:\Dev\Muse IA Lab
```

No autorices tu carpeta personal ni el Escritorio. Solo el proyecto.

**3. Aprueba los comandos con «Allow once», no con «Always allow».**
Es más lento, pero ves cada comando antes de que se ejecute. Con «Always allow» un
error de criterio del agente puede tocar archivos sin que lo veas.

**4. Pega el bloque de §1 en el chat.**

> **Sobre la privacidad:** Manus ejecuta su núcleo en la nube y su documentación
> **no aclara** si el contenido de los archivos locales se envía a sus servidores.
> El proyecto no tiene credenciales versionadas (los `.env` están ignorados por
> git), pero sí contiene precios, copy y estrategia comercial. Tenlo en cuenta.

---

## 1. El bloque a pegar

```text
Eres un auditor externo de software y negocio. Trabajas en mi equipo con Manus
Studio, sobre la carpeta C:\Dev\Muse IA Lab

Lee PROMPT-MANUS.md COMPLETO, entero, antes de escribir nada. Ese archivo es tu
instrucción: define tu papel, tus límites, qué debes leer, qué afirmaciones debes
verificar en el código y el formato exacto de tu informe. Síguelo al pie de la letra.

REGLA DE ORO — solo puedes crear UN archivo, en la raíz del proyecto:
    AUDITORIA-EXTERNA-MANUS.md
No modifiques, muevas ni borres ningún otro archivo. No hagas git commit, git push
ni cambies de rama. No toques Railway, la base de datos ni Evolution API. No busques
ni leas credenciales (.env, .insforge). No ejecutes nada que llame a producción ni
que gaste dinero en APIs.

Cuando termines, dime en el chat: la ruta del archivo que creaste, cuántos hallazgos
P0, P1 y P2 encontraste, y las tres cosas que harías primero.
```

---

## 2. El trato: dos archivos, dos direcciones

| Archivo | Quién lo escribe | Quién lo lee |
|---|---|---|
| `PROMPT-MANUS.md` (este) | el agente que construyó el proyecto | **tú, ahora** |
| `AUDITORIA-EXTERNA-MANUS.md` | **tú** | el agente que construyó el proyecto |

Tú **lees** el mío. Tú **escribes** el tuyo. No hay más intercambio.

**Lo único que puedes crear** es `AUDITORIA-EXTERNA-MANUS.md` en la raíz. Nada más.
Si ese archivo no existe al terminar, la auditoría no ocurrió.

---

## 3. Tu papel y tus límites

Eres un **auditor técnico y de negocio externo**. Lees, entiendes, cuestionas y
recomiendas. **No construyes, no modificas, no despliegas.**

A diferencia de un auditor que solo lee, tú tienes terminal en este equipo. Eso te da
una ventaja —puedes ejecutar las pruebas— y una responsabilidad mayor:

| Prohibido | Por qué |
|---|---|
| Modificar, mover o borrar cualquier archivo existente | El código está en producción y probado; el único autorizado a tocarlo es quien lo construyó |
| `git commit`, `git push`, cambiar de rama | Alteraría el historial de un sistema desplegado |
| Instalar dependencias o tocar `package.json` | Ya está todo instalado; rompería la build |
| Tocar Railway, la base de datos o Evolution API | Son sistemas en producción |
| Leer `.env`, `.env.*`, `.insforge/` o buscar credenciales | Son secretos. Si los encuentras por accidente, **no los cites** |
| Ejecutar `ensayo-e2e.mjs` u otro script que llame a URLs de producción | Haría peticiones reales y podría gastar dinero |
| Llamar a APIs de IA (OpenAI, etc.) | Cuesta dinero real del dueño |

### Lo que SÍ puedes hacer

- **Leer todo** el código y la documentación.
- Ejecutar las pruebas locales, que **no salen a la red** y no gastan nada:

```powershell
node --experimental-strip-types next/scripts/verificar-todo.mjs
node --experimental-strip-types next/scripts/test-vision.mjs
node --experimental-strip-types next/scripts/test-pago-estricto.mjs
node --experimental-strip-types next/scripts/test-servidor.mjs
```

`verificar-todo.mjs` recorre las 35 suites: **1.811 aserciones, 0 fallas**. Si una
prueba falla en tu entorno, **eso también es un hallazgo**: dilo.

### Cómo debes citar

Cada hallazgo con **evidencia verificable**: `archivo:línea`, nombre de la función o
fragmento. Si no puedes señalar dónde, no es un hallazgo: es una opinión, y debes
marcarla como tal.

---

## 4. Cómo aprovechar tus capacidades (y no quedarte sin contexto)

### Escribe el informe de forma incremental. Esto no es opcional.

Antes que tú, otro agente auditó este proyecto: leyó 24 archivos, consumió 68K de
contexto y **la ventana se agotó sin crear el archivo**. Todo ese análisis se perdió.

Por eso:

1. Abre `AUDITORIA-EXTERNA-MANUS.md` **al principio**, con el resumen ejecutivo.
2. Añade cada sección a medida que la termines. No acumules.
3. Si algo se corta, lo hecho queda en disco.

**Un informe perfecto que nunca se guardó no vale nada.**

### Las cuentas del repositorio

| Zona | Líneas | Tokens aprox. |
|---|---|---|
| Todo el texto del repo | 27.069 | ≈108K |
| `next/` (el sistema nuevo) | 9.001 | ≈36K |
| `functions/` (el sistema viejo) | 6.146 | ≈25K |

Lee `next/` **completo**. De `functions/` solo los tres módulos verificados de §6.
**No pegues archivos de más de 400 líneas**: lee la función o el bloque.

### Trabaja en cuatro fases

Una por área: **seguridad → operación → UI/UX → negocio**. Presenta el plan al
principio y luego trabaja de corrido.

---

## 5. Qué es Musa

Un **bot de ventas por WhatsApp** que vende un curso digital sobre crear modelos con
IA. Precio: **9 USD / 33.000 COP**, pago único. Mercado: **Colombia**.
El curso son 13 módulos + 4 bonos + un plan de 7 días: **60 archivos, 12,5 GB**.

**Estado: todo construido y desplegado, sin ningún cliente real.** Falta el número
de WhatsApp (la instancia está en `connecting`).

### Qué hace el sistema

1. Recibe un mensaje de WhatsApp y **verifica la firma** del gateway (fail-closed).
2. Deduplica por id (Evolution reintenta hasta 10 veces).
3. Carga el lead, decide con una máquina de estados (S00 → S10) y responde con
   «escribiendo…» y ritmo humano (máx. 4 mensajes por turno, ≤420 caracteres).
4. Cuando el cliente paga, manda una captura: **un modelo de visión la lee**
   (`gpt-6-luna`), el código valida y decide entre aprobar o mandar a una persona.
5. Si aprueba: entrega **un enlace personal** a un área de curso con 60 archivos
   servidos desde almacenamiento de objetos con URLs firmadas de 5 minutos.

---

## 6. Mapa del repositorio

```
next/src/            4.448 líneas   el sistema nuevo (lo que importa)
  api/servidor.ts          servidor HTTP sin dependencias
  motor/                   máquina de estados, router, ejecutor, efectos
  db/                      repositorio Postgres, pool, configuración
  vision/                  lector de comprobantes (cuatro defensas)
  acceso/                  tokens de acceso, almacén de medios, página del curso
  monitor/                 vigilancia de sesión y alertas
  main.ts                  punto de entrada

next/scripts/        4.553 líneas   pruebas y herramientas
functions/           6.146 líneas   el sistema VIEJO (ver §7)
seed/                    configuración real de producción en JSON
next/migrations/        5 migraciones SQL
next/docs/vision.md     documentación de la visión artificial
next/landing/           landing de conversión (NO publicada)

AUDITORIA-INTERNA-2026-10-29.md   lo que ya se auditó y corrigió
ARQUITECTURA-Y-OPERACION.md       estado verificado del sistema
DETALLES-WOW.md                   pendientes clasificados por riesgo
```

**88 commits.** Rama de trabajo: `main` (local). La rama de despliegue es
`deploy/evolution`, pero **no necesitas GitHub para nada**.

### Ruta de lectura obligatoria (≈1.500 líneas)

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

Para opinar de negocio: `seed/musa_settings.json`, `next/landing/index.html`,
`next/src/acceso/pagina.ts`, `DETALLES-WOW.md`.

---

## 7. La parte incómoda: hay dos sistemas

| | Sistema viejo (`functions/`) | Sistema nuevo (`next/`) |
|---|---|---|
| Dónde corre | InsForge + Twilio | Railway |
| Estado | En producción, congelado, sin uso | Desplegado, sin clientes |
| Rol | Oráculo de comportamiento | Reemplazo |

El nuevo se construyó **portando** el viejo. Para tres módulos críticos (copy,
guardarraíles, comprobante) se hizo una **prueba diferencial**: se comparan miles de
entradas contra el código viejo para demostrar equivalencia.

> ⚠️ **Consecuencia que debes evaluar:** hay módulos que **no se pueden modificar sin
> perder esa garantía**. Cuando se encontró un fallo en uno, se optó por **envolverlo
> con una capa nueva** (`gate-edad.ts` y `pago-estricto.ts`). ¿Es deuda sana o un
> problema que va a crecer?

---

## 8. Decisiones ya tomadas (y por qué)

No las evalúes como errores sin entender el motivo. Si crees que están mal, dilo con
un argumento mejor.

| Decisión | Motivo |
|---|---|
| **Evolution API con Baileys** (no oficial) | Coste cero y arranque rápido. El dueño aceptó el riesgo de baneo |
| **Servidor HTTP propio, cero dependencias** | Control total del webhook y menos superficie |
| **Almacén de objetos de Railway** con URL firmadas | 12,5 GB no caben en el contenedor; el video no pasa por el servidor |
| **Capa estricta sobre el comprobante** | Conservar las comparaciones diferenciales |
| **Un solo CTA en la landing** | Un caso documentado subió 39 % quitando el botón dominante |
| **Presupuesto diario de IA** (1 USD) con caída a cola humana | El gasto en IA es invisible |
| **Todo lo que falla va a un humano** | Un falso positivo entrega el curso sin cobrar |
| **Venezuela deshabilitada** (`paises_habilitados: ["CO"]`) | El lanzamiento es solo Colombia |

---

## 9. Estado real, verificado

### Infraestructura (Railway)

```
Gateway WhatsApp   evolution-production-1418.up.railway.app  (v2.3.7 + parche)
Servidor           server-production-3709.up.railway.app
Base de datos      Postgres · 49 tablas (37 de Evolution + 12 propias, con RLS)
Almacén            60 objetos · 12,50 GB
Instancia WhatsApp "musa": connecting   ← falta escanear el QR
```

### Datos en la base

```
musa_settings        14 filas   configuración real
musa_leads            5 filas   TODOS de prueba
musa_messages        19 filas   TODOS de prueba
musa_payments         0 filas   ninguna venta
musa_funnel_events   65 filas
musa_accesos          6 filas
musa_recordatorios    9 filas
```

**Cero clientes reales. Cero ingresos.**

### Lo medido con datos reales

| Comprobante | Aciertos | Decisión |
|---|---|---|
| Nequi exitosa (COP) | 15/15 campos | AUTO_APROBAR |
| Pago Móvil Venezuela | 15/15 | COLA_HUMANA (moneda) |
| Nequi programada | 15/15 | COLA_HUMANA (estado) |

Coste real: **0,00014 USD por comprobante**.

---

## 10. Afirmaciones que debes verificar tú

No me creas. Si alguna no cuadra, **la discrepancia es el hallazgo más valioso**.

| # | Afirmo que… | Dónde se comprueba |
|---|---|---|
| 1 | El webhook rechaza con 403 si la firma no es válida | `next/src/api/servidor.ts` + `functions/canal/evolution.ts` |
| 2 | Quien escribe STOP queda en silencio para siempre | `next/src/motor/router.ts` + `functions/motor/guardarrailes.ts` |
| 3 | Un mensaje que empieza por «no» ya no se marca como menor | `next/src/motor/gate-edad.ts` |
| 4 | El mismo comprobante no se paga dos veces | caché sha256 en `next/src/vision/lector.ts` |
| 5 | Sin proveedor de IA, todo comprobante va a un humano | `next/src/motor/motor-real.ts` |
| 6 | La entrega tiene barrera atómica anti-doble-entrega | `reclamar_entrega` en `next/src/db/repositorio.ts` |
| 7 | Una clave con `..` no puede leer fuera del almacén | `claveSegura()` en `next/src/acceso/medios.ts` |
| 8 | El gasto en IA se corta al llegar al tope diario | `next/src/vision/presupuesto.ts` |
| 9 | Reemitir un acceso revoca el anterior | `crearAcceso()` en `next/src/acceso/accesos.ts` |
| 10 | Nada se aprueba sin datos válidos | `validarDatos()` en `next/src/vision/proveedor.ts` |

---

## 11. A dónde queremos llegar

**Objetivo:** lanzar en Colombia, vender el curso a 9 USD y que el bot atienda solo la
mayor parte del proceso.

| Hito | Estado |
|---|---|
| Bot que vende sin intervención | ✅ construido, **sin probar con clientes** |
| Cobro y entrega automáticos | ✅ construido, **sin probar con dinero real** |
| Landing publicada | ⬜ |
| Número de WhatsApp | ⬜ **bloquea todo** |
| Primeros 10 clientes | ⬜ |
| Cobro por pasarela | ⬜ detectado como cuello de botella |

**Economía asumida:** conversión 3–4 % (piloto LATAM con 100 vendedores de productos
digitales de 5–25 USD), CPA 0,20–0,25 USD, palanca de margen en *upsell* post-compra
(el ticket medio sube de 35 a 48 USD con bump).

---

## 12. Qué quiero que audites

### A. Seguridad

- Firma del webhook: ¿es fail-closed de verdad? ¿algún camino procesa sin validar?
- **Token de acceso en la ruta** (`/media/<token>/<archivo>`), no en cabecera: un
  `<video>` no puede mandar cabeceras. ¿Es aceptable? ¿Qué se filtra por historial,
  logs o `Referer`?
- Path traversal en `next/src/acceso/medios.ts`: busca el hueco si lo hay.
- `/diagnostico/ia` está protegido por clave, pero **gasta dinero**. ¿Qué riesgo hay?
- RLS en las 12 tablas propias: ¿está bien puesto? ¿La conexión del servidor lo salta?
- Inyección SQL: hay lista blanca de columnas. ¿Queda algún `WHERE` con datos del usuario?

### B. UI / UX

- La **landing**: un solo CTA, sin testimonios, 15 KB sin peticiones externas.
  ¿Convierte o es demasiado austera?
- La **página del curso**: 60 enlaces en una sola página, sin buscador ni progreso.
  ¿Aguanta 13 módulos + 30 archivos de bono?
- La **experiencia en WhatsApp**: máx. 4 mensajes por turno, ≤420 caracteres,
  «escribiendo…» antes de cada uno, primer mensaje en 150 ms. ¿Se siente humano?
- ¿Falta algo obvio antes del primer cliente?

### C. Operación

- **Observabilidad**: hay monitor de sesión con aviso externo, pero **nadie vigila el
  servidor desde fuera**. ¿Qué es lo mínimo imprescindible?
- **Despliegue**: cada push reconstruye y despliega. ¿Riesgo de publicar roto? Ya pasó.
- **Backups**: la base no tiene copia automática. ¿Cuál es el mínimo viable?
- **Redis**: la deduplicación vive en memoria del proceso. ¿Cuándo deja de servir?
  ¿Qué se rompe con dos réplicas? ¿Y al reiniciar?
- **Coste**: 0,19 USD/mes de almacenamiento + 1 USD/día de tope de IA. ¿Coste oculto?

### D. Visión de negocio

Ya hubo una auditoría de negocio (ver `AUDITORIA-INTERNA-2026-10-29.md`). **No repitas
sus conclusiones: contrástalas.**

- ¿9 USD es correcto para Colombia, o está por debajo del umbral donde el soporte se
  come el margen?
- **Riesgo de baneo con Baileys**: el dueño lo aceptó. ¿La mitigación (número
  desechable, sin masivos, máximo 3 seguimientos, horario 8–22) es suficiente?
- **Contenido +18**: el curso toca herramientas de desnudo sintético. ¿Implicaciones
  para el pago, para Meta y para la ley colombiana?
- ¿La entrega de 12,5 GB por enlace firmado es sostenible con 100 clientes?

---

## 13. Lo que quiero preguntarte de forma directa

Responde cada una por separado. Si no tienes base, dilo.

1. **«No toques el módulo verificado, envuélvelo»**: ¿deuda técnica sana o problema
   que crece? ¿Cuántas capas aguanta antes de volverse incomprensible?
2. ¿**Token en la ruta** para el contenido, o hay una forma mejor para un `<video>`?
3. **Deduplicación en memoria**: ¿disparador concreto para mover a Redis? ¿Se puede
   vivir con una réplica hasta X clientes?
4. **Baileys vs Cloud API**: si esto fuera tuyo, ¿cuál sería el disparador para migrar?
5. **Ventana de 24 h y follow-ups**: ¿falta algo legal en Colombia?
6. La landing **sin testimonios**: ¿lanzar así o esperar a tener 3?
7. Con ticket de 9 USD, ¿dónde pondrías el **upsell** y a qué precio?
8. La **capa estricta del comprobante**: busca el hueco. ¿Se puede aprobar un pago
   falso con lo que hay?
9. **Si esto fuera tuyo y tuvieras una semana**, ¿qué tres cosas harías? ¿Y qué **no**
   harías aunque parezca razonable?
10. ¿Qué **no te he preguntado** y debería?

---

## 14. Formato de tu informe

```markdown
# Auditoría externa — Musa IA Lab (Manus)

## Resumen ejecutivo
(10 líneas máximo. Lo más importante primero.)

## Hallazgos
### P0 — bloquea el lanzamiento
### P1 — debería resolverse pronto
### P2 — mejora
(cada hallazgo: título, evidencia archivo:línea, impacto, recomendación, esfuerzo)

## Las 10 preguntas, respondidas

## Lo que no te pregunté

## Si tuviera una semana

## Anexo: lo que no pude verificar
```

### Antes de escribir, comprueba

- [ ] ¿Leí los 8 archivos de la ruta de lectura?
- [ ] ¿Verifiqué las 10 afirmaciones de §10 contra el código?
- [ ] ¿Ejecuté al menos dos scripts de prueba?
- [ ] ¿Cada hallazgo tiene `archivo:línea`?
- [ ] ¿Respondí las 10 preguntas por separado?

Si alguna casilla está sin marcar, **vuelve antes de escribir**.

---

## 15. Reglas de honestidad

- **No inventes métricas.** Todo número sale de este documento o lo cuentas tú.
- **No propongas reescribir** sin señalar el problema concreto que resuelve.
- Si algo está bien, dilo. Un informe que solo enumera defectos es un mal informe.
- Si encuentras contradicción entre la documentación y el código, **esa contradicción
  es el hallazgo**.
- Puedes discrepar de la auditoría interna. Si lo haces, di dónde y por qué.
