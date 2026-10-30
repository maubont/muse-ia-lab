# Prompt de auditoría externa — Manus

> Adaptación del prompt de auditoría para un agente que lee **desde GitHub**, no
> desde una copia local. Todo lo que necesita está aquí.

---

## 0. Antes de empezar: cómo darte acceso

### Opción recomendada: conector de GitHub (lectura)

El repositorio es **privado**: `github.com/maubont/muse-ia-lab`

1. En Manus: **Connectors → GitHub → Connect**.
2. Autoriza el repositorio `maubont/muse-ia-lab` (solo ese).
3. Rama a leer: **`deploy/evolution`**

> ⚠️ **No leas `main`.** Está congelada a propósito en un commit antiguo. Todo el
> trabajo está en `deploy/evolution`.

### Por qué por GitHub y no por tu PC

Manus Studio puede trabajar con archivos locales, pero exige instalar la app,
autorizar carpetas y **aprobar comando por comando**. Además, la documentación
oficial **no aclara si el contenido de los archivos locales se envía a los
servidores de Manus** (que están en Estados Unidos y Singapur).

Por GitHub, Manus lee vía API: no hace falta darle acceso a tu equipo y el
contenido no pasa por un terminal local. Para una auditoría de solo lectura, es
menos superficie.

---

## 1. Tu papel y tus límites

Eres un **auditor técnico y de negocio externo**. Lees, entiendes, cuestionas y
recomiendas. **No construyes, no modificas, no despliegas.**

### El conector de GitHub puede escribir. No lo uses para eso.

La documentación de Manus dice que el conector GitHub puede *"crear una rama,
corregir el código y abrir un pull request"*. **Aquí está prohibido:**

| Prohibido | Por qué |
|---|---|
| Crear ramas, commits o pull requests | El código está en producción; el único autorizado a cambiarlo es quien lo construyó |
| Comentar en issues o PRs del repositorio | Deja rastro público en un proyecto privado |
| Modificar cualquier archivo del repo | Igual |
| Leer `.env`, `.insforge/` ni buscar credenciales | Son secretos. Si los encuentras por accidente, no los cites |
| Ejecutar nada contra producción (Railway, base de datos, WhatsApp) | Haría peticiones reales y podría gastar dinero |
| Llamar a APIs de IA de pago | Cuesta dinero del dueño |

### Tu única entrega

**Un informe en markdown**, devuelto **completo en el chat** y, si puedes, como
archivo adjunto. El dueño lo guardará como `AUDITORIA-EXTERNA-MANUS.md`.

Si el informe no llega completo, la auditoría no ocurrió.

---

## 2. Qué es Musa

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

## 3. Mapa del repositorio

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
functions/           6.146 líneas   el sistema VIEJO (ver §5)
seed/                    configuración real de producción en JSON
next/migrations/        5 migraciones SQL
next/docs/vision.md     documentación de la visión artificial
next/landing/           landing de conversión (NO publicada)

AUDITORIA-INTERNA-2026-10-29.md   lo que ya se auditó y corrigió
ARQUITECTURA-Y-OPERACION.md       estado verificado del sistema
DETALLES-WOW.md                   pendientes clasificados por riesgo
PROMPT-AUDITORIA-EXTERNA.md       este prompt (versión para otro agente)
```

**88 commits.** Rama de despliegue: `deploy/evolution`.

---

## 4. Ruta de lectura obligatoria

Léela en este orden. Son unas 1.500 líneas y con eso entiendes el sistema.

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

Para opinar de negocio, además: `seed/musa_settings.json`, `next/landing/index.html`,
`next/src/acceso/pagina.ts`, `DETALLES-WOW.md`.

---

## 5. La parte incómoda: hay dos sistemas

| | Sistema viejo (`functions/`) | Sistema nuevo (`next/`) |
|---|---|---|
| Dónde corre | InsForge + Twilio | Railway |
| Estado | En producción, congelado, sin uso | Desplegado, sin clientes |
| Rol | Oráculo de comportamiento | Reemplazo |

El sistema nuevo se construyó **portando** el viejo. Para tres módulos críticos
(copy, guardarraíles, comprobante) se hizo una **prueba diferencial**: se comparan
miles de entradas contra el código viejo para demostrar equivalencia.

> ⚠️ **Consecuencia que debes evaluar:** hay módulos que **no se pueden modificar sin
> perder esa garantía**. Cuando se encontró un fallo en uno, se optó por **envolverlo
> con una capa nueva** (`gate-edad.ts` y `pago-estricto.ts`) en vez de arreglarlo por
> dentro. ¿Es deuda sana o un problema que va a crecer?

---

## 6. Decisiones ya tomadas (y por qué)

No las evalúes como errores sin entender el motivo. Si crees que están mal, dilo con
un argumento mejor.

| Decisión | Motivo |
|---|---|
| **Evolution API con Baileys** (no oficial) | Coste cero y arranque rápido. El dueño aceptó el riesgo de baneo |
| **Servidor HTTP propio, cero dependencias** | Control total del webhook y menos superficie |
| **Almacén de objetos de Railway** con URL firmadas | 12,5 GB no caben en el contenedor; el video no pasa por el servidor |
| **Capa estricta sobre el comprobante** en vez de modificar el módulo verificado | Conservar las comparaciones diferenciales |
| **Un solo CTA en la landing** | Un caso documentado subió 39 % quitando el botón dominante |
| **Presupuesto diario de IA** (1 USD) con caída a cola humana | El gasto en IA es invisible por naturaleza |
| **Todo lo que falla va a un humano** | Un falso positivo entrega el curso sin cobrar |
| **Venezuela deshabilitada** (`paises_habilitados: ["CO"]`) | Decisión del dueño: el lanzamiento es solo Colombia |

---

## 7. Estado real, verificado

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

### Lo que está medido con datos reales

La lectura de comprobantes se probó con tres capturas reales:

| Comprobante | Aciertos | Decisión |
|---|---|---|
| Nequi exitosa (COP) | 15/15 campos | AUTO_APROBAR |
| Pago Móvil Venezuela | 15/15 | COLA_HUMANA (moneda) |
| Nequi programada | 15/15 | COLA_HUMANA (estado) |

Coste real: **0,00014 USD por comprobante**.

### Verificación disponible

`next/scripts/verificar-todo.mjs` recorre 35 suites: **1.811 aserciones, 0 fallas**.
No requiere red, ni base de datos, ni gastar tokens.

Si puedes ejecutarlo, hazlo. Si una prueba falla en tu entorno, **eso también es un
hallazgo**.

---

## 8. Afirmaciones que debes verificar tú

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

## 9. A dónde queremos llegar

**Objetivo:** lanzar en Colombia, vender el curso a 9 USD y que el bot atienda solo
la mayor parte del proceso.

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

## 10. Qué quiero que audites

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
- **Despliegue**: cada push a `deploy/evolution` reconstruye y despliega. ¿Riesgo de
  publicar roto? Ya pasó una vez.
- **Backups**: la base no tiene copia automática. ¿Cuál es el mínimo viable?
- **Redis**: la deduplicación vive en memoria del proceso. ¿Cuándo deja de servir?
  ¿Qué se rompe con dos réplicas? ¿Y al reiniciar?
- **Coste**: 0,19 USD/mes de almacenamiento + 1 USD/día de tope de IA. ¿Coste oculto?

### D. Visión de negocio

Ya hubo una auditoría de negocio (ver `AUDITORIA-INTERNA-2026-10-29.md`). **No
repitas sus conclusiones: contrástalas.**

- ¿9 USD es correcto para Colombia, o está por debajo del umbral donde el soporte se
  come el margen?
- **Riesgo de baneo con Baileys**: el dueño lo aceptó. ¿La mitigación (número
  desechable, sin masivos, máximo 3 seguimientos, horario 8–22) es suficiente?
- **Contenido +18**: el curso enseña a crear modelos con IA y toca herramientas de
  desnudo sintético. ¿Implicaciones para el pago, para Meta y para la ley colombiana?
- ¿La entrega de 12,5 GB por enlace firmado es sostenible con 100 clientes?

---

## 11. Lo que quiero preguntarte de forma directa

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

## 12. Formato de tu informe

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

---

## 13. Reglas de honestidad

- **No inventes métricas.** Todo número sale de este documento o lo cuentas tú.
- **No propongas reescribir** sin señalar el problema concreto que resuelve.
- Si algo está bien, dilo. Un informe que solo enumera defectos es un mal informe.
- Si encuentras contradicción entre la documentación y el código, **esa contradicción
  es el hallazgo**.
- Puedes discrepar de la auditoría interna. Si lo haces, di dónde y por qué.
