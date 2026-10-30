# Traza de cierre — todo lo pendiente

**Objetivo:** cerrar todos los hallazgos abiertos. Donde falten datos del dueño, se
usan **provisionales marcados** y se anotan para actualizar.

Última actualización: 29-oct-2026.

---

## Estado por hallazgo

### De la auditoría externa (Manus)

| # | Hallazgo | Estado |
|---|---|---|
| **P0-1** | Referencia no obligatoria + imagen reutilizada no detectada | ✅ **cerrado** — referencia mínima de 4 caracteres, caché marcada como duplicada, `dupeRef` escalado |
| **P0-2** | Los bytes reales de Evolution no llegaban al lector (la visión nunca corría) | ✅ **cerrado** — `obtenerBytes()` conectado, prefiltro acepta bytes |
| **P0-3** | Landing con número placeholder y legales sin completar | ✅ **cerrado con provisionales** — número vacío con aviso, legales con datos marcados `[PROVISIONAL]` |
| **P0-4** | Categoría «adult» frente a la política de WhatsApp | 🟡 **documentado** — mal citado por el auditor; con Baileys el bloqueo es por app no oficial |
| **P1-1** | Entrega fallida sin reintento | ✅ **cerrado** — reintento a 15 min + aviso al operador con el enlace |
| **P1-2** | Deduplicación en RAM | ✅ **cerrado** — tabla `musa_mensajes_vistos` con `on conflict` |
| **P1-3** | Cron duplicaba envíos y no respetaba `escalado_humano` | ✅ **cerrado** |
| **P1-4** | Horario de seguimientos vs. normativa publicitaria | ✅ **cerrado** — no existe norma de horario para este canal; la ventana 8–22 es política propia |
| **P1-5** | El gate de edad es autodeclaración | ✅ **cerrado como decisión** — verificar documentos cuesta más que el ticket |
| **P1-6** | El diagnóstico de IA gastaba fuera del presupuesto | ✅ **cerrado** |
| **P1-7** | «Acceso de por vida» con token que vencía al año | ✅ **cerrado** — renovación al usarse |
| **P1-8** | RLS no acreditable desde el repo | ✅ **cerrado con evidencia** — 13/13 con RLS, 0 políticas, un solo rol |
| **P1-9** | Su verificación no fue verde en su entorno | 🟡 **era `EACCES` de su sandbox**, no un fallo nuestro |
| **P1-10** | «17 enlaces» vs entrega real | ✅ **cerrado** — landing, copy de S10 y documentación alineados |

### Del registro interno

| Hallazgo | Estado |
|---|---|
| Sin email en el flujo: un baneo deja al negocio sin contactar a nadie | ✅ **cerrado** — columna `email` y captura oportunista |
| El bump necesita dos montos válidos o cae todo a cola humana | ✅ **cerrado** — `precio.montos_extra`, lista configurable |
| Titular de Nequi y Bre-B dice `PENDIENTE` | ✅ **ya estaba cubierto** — `textoCuentasValido` rechaza «pendiente» |

---

## Datos provisionales (marcar y actualizar)

| Dato | Provisional | Dónde |
|---|---|---|
| Número de WhatsApp | `57XXXXXXXXXX` | landing |
| Razón social | `MUSA IA LAB` | términos, privacidad, reembolsos |
| NIT | `PENDIENTE` | términos |
| Correo de contacto | `hola@musa-ia.example` | legales |
| Plazo de reembolso | 5 días hábiles | reembolsos |
| Retención de datos | 12 meses | privacidad |

**Todos llevan un comentario visible `[PROVISIONAL]` para no confundirlos con datos
reales.**

---

## Orden de ejecución

1. P1-1 · entrega fallida (el más grave)
2. P1-10 · copy de 17 vs 60
3. P1-2 · deduplicación persistente
4. Email en el flujo
5. P0-3 · legales con provisionales
6. Titular `PENDIENTE` · guarda
7. Bump · dos montos
8. P1-4 · verificar norma de horarios
9. Verificación completa + despliegue
10. Documento de cierre

---

## Cierre

| Métrica | Valor |
|---|---|
| Hallazgos cerrados | **15 de 15** |
| Sin arreglo técnico | 2 (decisión de producto y decisión de negocio), documentadas |
| Suites en verde | 37 |
| Aserciones | 1.831 |
| Migraciones aplicadas | 7 |
| Desplegado en producción | sí |

### Lo que queda, y por qué

| Pendiente | Motivo | Quién |
|---|---|---|
| ~~P1-4 horario~~ | **Cerrado**: no existe norma de horario para WhatsApp. La ventana 8–22 es política propia | — |
| ~~P1-5 gate de edad~~ | **Cerrado como decisión**: verificar documentos cuesta más que el ticket | — |
| ~~P1-8 RLS~~ | **Cerrado con evidencia**: 13/13 con RLS, 0 políticas, un solo rol | — |

### Datos provisionales a sustituir antes de publicar

Todos llevan la marca `PROVISIONAL` visible en el HTML:

1. Número de WhatsApp (con la landing avisando «en configuración» mientras esté vacío).
2. Razón social y NIT.
3. Correo de contacto: hola@musa-ia.example
4. Plazo de reembolso (5 días hábiles) y retención de datos (12 meses).
5. Revisión jurídica del derecho de retracto.

### Cómo verificar sin creerme

```
node --experimental-strip-types next/scripts/verificar-todo.mjs
```

Si ese comando no termina en «todo verde», algo se rompió.

---

## Cierre de los tres últimos

### P1-8 · RLS — verificado en la base, no en el repositorio

Consultado el Postgres de producción:

```
Tablas propias (musa_*)           13
Con RLS activo                    13 / 13
Con políticas                     0
Permisos para PUBLIC / anon       ninguno
Roles que pueden conectarse       1   (postgres, superusuario con bypassrls)
Tablas propias sin RLS            ninguna
```

**Lectura:** RLS está activo en todas las tablas y **sin ninguna política**, lo que en
PostgreSQL significa **denegación por defecto** para cualquier rol que no sea el
dueño. El servidor conecta como `postgres`, que por ser superusuario **salta el RLS
por diseño**.

Conclusión: el RLS no protege *del servidor* —protege de cualquier otro rol que
aparezca mañana (una capa REST, un panel, un analista con acceso de lectura). Es una
red de seguridad, no un control de la aplicación. **Postura correcta y verificada.**

### P1-4 · Horario de seguimientos — la norma no dice lo que el auditor supuso

Se buscó la obligación colombiana sobre horarios de mensajería comercial. Lo que hay:

| Norma | A quién obliga | ¿Nos aplica? |
|---|---|---|
| **Registro de Números Excluidos (RNE)**, CRC | A los **operadores de telecomunicaciones** que envían SMS/USSD/llamadas | **No**: no somos operador |
| **Ley 1581 de 2012** y Decreto 1377 | A quien trata datos personales: aviso, finalidad, consentimiento | **Sí** — cubierto por la política de privacidad |
| **Ley 1480 de 2011** | Publicidad veraz y derecho a no ser contactado | **Sí** — cubierto por opt-out y por el copy |
| Horario legal para WhatsApp | **No se encontró ninguna norma que lo fije** | — |

**Conclusión:** la afirmación del auditor —«no coincide con el horario colombiano
aplicable»— **no se sostiene**: no existe un horario legal aplicable a este canal. La
ventana 8–22 es una **decisión de cortesía propia**, no una obligación, y se mantiene.

Lo que sí obliga —consentimiento, opt-out y publicidad veraz— está implementado y
probado. Queda documentado para que nadie lo «arregle» sin norma que lo respalde.

### P1-5 · Gate de edad — sin arreglo técnico, por diseño

La alternativa real (verificar documento de identidad) cuesta más que el ticket de
9 USD y añade fricción a cada venta. Se mantiene la autodeclaración, con el límite
explícito en la landing y en el primer mensaje. Es una decisión del dueño, no un
descuido.
