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
| **P0-3** | Landing con número placeholder y legales sin completar | 🔄 **en curso** — con datos provisionales |
| **P0-4** | Categoría «adult» frente a la política de WhatsApp | 🟡 **documentado** — mal citado por el auditor; con Baileys el bloqueo es por app no oficial |
| **P1-1** | Entrega fallida sin reintento: el cliente paga y no recibe acceso | 🔄 **en curso — el más grave** |
| **P1-2** | Deduplicación en RAM: se pierden mensajes al reiniciar | ⬜ pendiente |
| **P1-3** | Cron duplicaba envíos y no respetaba `escalado_humano` | ✅ **cerrado** |
| **P1-4** | Horario de seguimientos vs. normativa publicitaria | ⬜ pendiente de verificar la norma |
| **P1-5** | El gate de edad es autodeclaración | 🟡 **no tiene arreglo técnico** — es de negocio |
| **P1-6** | El diagnóstico de IA gastaba fuera del presupuesto | ✅ **cerrado** |
| **P1-7** | «Acceso de por vida» con token que vencía al año | ✅ **cerrado** — renovación al usarse |
| **P1-8** | RLS no acreditable desde el repo | 🟡 **informativo** — se verifica en la base |
| **P1-9** | Su verificación no fue verde en su entorno | 🟡 **era `EACCES` de su sandbox**, no un fallo nuestro |
| **P1-10** | La promesa de «17 enlaces» no coincide con la entrega (60 archivos) | ⬜ pendiente |

### Del registro interno

| Hallazgo | Estado |
|---|---|
| Sin email en el flujo: un baneo deja al negocio sin contactar a nadie | ⬜ pendiente |
| El bump necesita dos montos válidos o cae todo a cola humana | ⬜ pendiente |
| Titular de Nequi y Bre-B dice `PENDIENTE` | ⬜ pendiente |

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
