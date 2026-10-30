# Auditoría interna — 29 de octubre de 2026

Registro de la auditoría hecha con cuatro agentes independientes y de lo que se
corrigió después de verificarla. **Se guarda para no repetirla y para contrastarla
con la auditoría externa.**

---

## Cómo se hizo

Se lanzaron cuatro auditores con contexto limpio —sin memoria de las decisiones de
construcción—, uno por área: seguridad del cobro, operación, UI/UX y negocio.

**Tres se cayeron sin entregar.** Solo el de negocio devolvió informe.

| Auditor | Resultado |
|---|---|
| Seguridad del cobro | ❌ se cayó sin mensaje |
| Operación y despliegue | ❌ se cayó sin mensaje |
| UI/UX | ❌ se cayó sin mensaje |
| **Negocio** | ✅ informe completo |

Antes se intentó con **Grok Build** (ventana gratuita): leyó 24 archivos, consumió
68K de contexto y la cuota se agotó **sin crear el archivo**. Nada de eso se
recuperó.

**Lección que quedó en el prompt externo:** escribir a disco de forma incremental.
Un análisis nunca materializado no existe.

---

## Lo que dijo el auditor de negocio, verificado uno a uno

No se dio nada por bueno sin comprobarlo en el código. **Los cuatro hallazgos eran
ciertos:**

| # | Hallazgo | Verificación | Acción |
|---|---|---|---|
| 1 | `$29` tachado en la landing sin venta comprobable | líneas 154 y 222 de `next/landing/index.html` | **Eliminado** |
| 2 | `tz: "America/Caracas"` con negocio en Colombia | `horario_verificacion` en la configuración | **Corregido a `America/Bogota`** |
| 3 | El copy afirma «¿Es legal? Sí» de forma general | objeción del `funnel_copy` | **Reescrito** con el límite de las personas ficticias |
| 4 | No hay email en el flujo | el esquema no tiene la columna | **Confirmado, pendiente** |

### Por qué el hallazgo 2 era grave

Caracas va **una hora adelante** de Bogotá. El horario «hasta las 22:00» cerraba a
las **21:00** de Colombia: un cliente que escribía a las 21:30 recibía el acuse
«verificamos en horario» y silencio hasta el día siguiente, mientras el copy
prometía 22:00.

### Por qué el hallazgo 1 era grave

Un precio de referencia que nunca existió es publicidad engañosa bajo la Ley 1480
de 2011. Además de la sanción, es el tipo de detalle que un comprador detecta y
convierte en desconfianza.

---

## Lo que el auditor propuso y NO se hizo

| Propuesta | Por qué no |
|---|---|
| Bump de 39.900 en S07 | Decisión de precio del dueño, no mía. Y la capa estricta rechaza montos que no cuadren: implementarlo sin aceptar dos montos mandaría al 100 % a cola humana |
| Recortar los módulos de nudify | Decisión de producto y legal del dueño. Se documenta como riesgo, no se recorta por cuenta propia |
| Comprar dos chips y calentar uno | Depende de él |
| Escalar anuncios a 15 USD/día | Dinero real |

---

## Fallos propios que aparecieron al verificar

**1. Mi verificación mentía.** El bucle que se usó durante toda la sesión leía la
línea «N ok» de cada suite e **ignoraba «M fallas»**. Se reportaron 1.797
aserciones correctas mientras **nueve fallaban en silencio**.

Corregido con `next/scripts/verificar-todo.mjs`: recorre las 35 suites, falla si
alguna tiene fallas, si no imprime resumen o si no puede ejecutar.

**2. Una prueba dependía del día real.** `test-pago-estricto` usaba la fecha fija
`2026-10-27` contra `Date.now()`: pasaba un día y fallaba al siguiente.

**3. Defecto real en la entrega.** `componerEntrega` imprimía `${módulo}` a secas.
Con la configuración nueva (módulos como objetos), el respaldo habría enviado:

```
1. [object Object]
2. [object Object]
```

Si faltara la URL pública, el cliente recibiría basura en lugar del curso.
Corregido: lista títulos con su número de archivos y nunca expone claves internas.

---

## Lo que se corrigió en esta ronda

| Cambio | Archivo |
|---|---|
| Precio de referencia falso eliminado | `next/landing/index.html` |
| Zona horaria a Bogotá | `seed/musa_settings.json` + base |
| Copy de legalidad preciso | `seed/musa_settings.json` + base |
| **Venezuela deshabilitada** (`paises_habilitados: ["CO"]`) | `s06.ts`, `config-funnel.ts`, configuración |
| Respaldo de entrega sin `[object Object]` | `s10.ts` |
| Verificador honesto | `next/scripts/verificar-todo.mjs` |
| Fecha determinista en la prueba | `next/scripts/test-pago-estricto.mjs` |

---

## Estado al cerrar esta auditoría

```
35 suites · 1.811 aserciones · 0 fallas
14 claves de configuración en producción
```

## Lo que queda pendiente, por orden de impacto

1. **Email en el flujo.** Sin él, un baneo deja al negocio sin forma de contactar a
   un solo comprador. Es la diferencia entre una base de datos y un activo.
2. **Dos montos válidos** si se implanta el bump.
3. **Titular de Nequi y Bre-B dice `PENDIENTE`.** Hoy no se imprime; si el copy
   cambia, saldría a la vista del cliente.
4. **Auditorías de seguridad, operación y UX**: no se hicieron. Es exactamente lo
   que debe cubrir la auditoría externa.
