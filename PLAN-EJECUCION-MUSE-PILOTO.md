# PLAN DE EJECUCIÓN OPERATIVO — MUSE PILOTO
## Rama: `release/muse-piloto` — Base Commit: `fbe4685`
**Fecha de Inicio:** 3 de Noviembre de 2026  
**Responsable Técnico:** Principal Software Architect & Tech Lead

---

## 1. ESTADO DE BLOQUES DE IMPLEMENTACIÓN

| Bloque | Descripción | Estado | Pruebas Asociadas |
| :--- | :--- | :---: | :--- |
| **Bloque A** | **Blindaje Académico:** Eliminar fallback de tokens en `panel-api.ts`. Separación estricta de catálogo público (demo) vs. privado. Protección de prompts. Aislamiento multi-estudiante. | 🟢 COMPLETADO | `next/scripts/test-blindaje-academico.mjs` (39 ok, 0 fallas) |
| **Bloque B** | **Autenticación Consola Musa:** Middleware nativo en `servidor.ts`. Autenticación basada en sesión con cookie HttpOnly/Secure/SameSite. Hash de contraseña (`ADMIN_SECRET`). Protección CSRF para comandos. Formulario de acceso en `consola.html`. | 🟢 COMPLETADO | `next/scripts/test-auth-consola.mjs` (21 ok, 0 fallas) |
| **Bloque C** | **Protección de Contenidos:** Validación estricta en `/media/:token/:clave`. Enlaces firmados temporales. Desacople de promesas comerciales (10 años / vitalicio en código). | 🟢 COMPLETADO | `next/scripts/test-proteccion-contenidos.mjs` (4 ok, 0 fallas) |
| **Bloque D** | **Integridad de Pagos y Fechas:** Calibración de zona horaria `America/Bogota` en `pago-estricto.ts`. Soporte de fecha + hora combinadas (pagos nocturnos 23:30 resueltos). Salvaguarda de cola humana antifraude. Precio oficial: 33.000 COP / 9 USD. | 🟢 COMPLETADO | `next/scripts/test-pagos-fechas.mjs` (6 ok, 0 fallas) |
| **Bloque E** | **Experiencia Académica Real:** Limpieza de datos quemados ("Mauricio Bonilla" eliminado; dinámico por token) y progreso `[]` por sesión en `academia.html`. | 🟢 COMPLETADO | Verificación en `academia.html` |
| **Bloque F** | **Academia Demostrativa y Conversión:** Modo Demo con Clase 1 libre; Clases 2 a 13 y Bonos interceptados con modal de conversión hacia WhatsApp a $33.000 COP / $9 USD. | 🟢 COMPLETADO | Modal integrado en `academia.html` |
| **Bloque G** | **Consola Operativa Confiable:** Saneamiento de telemetría y autenticación administrativa para gestión de prospectos y comprobantes. | 🟢 COMPLETADO | Blindaje en `consola.html` y `servidor.ts` |
| **Bloque H** | **Estabilidad y Mantenibilidad:** Unificación del pool de PostgreSQL en `main.ts`. Cierre limpio de recursos en `SIGINT`/`SIGTERM`. | 🟢 COMPLETADO | `next/scripts/test-main.mjs` (22 ok, 0 fallas) |
| **Bloque I** | **Comercialización y Confianza:** Coherencia de precio oficial único: $33.000 COP / 9 USD en bot, landing y academia. | 🟢 COMPLETADO | Alineación integral |

---

## 2. REGISTRO DE DECISIONES Y PENDIENTES DEL PROPIETARIO

1. **Expiración de Tokens:** El sistema actualmente asigna 365 días en base de datos (`NOW() + interval '365 days'`), mientras que la oferta comercial anuncia "Acceso Vitalicio". *Acción técnica:* Se configura el valor predeterminado sin alterar promesas, quedando pendiente si el propietario desea extender el intervalo en SQL a 10 años o perpetuo.
2. **Precios Oficiales Confirmados:** Se ratifica el precio del código: **33.000 COP** (Colombia) y **9 USD** (internacional / Venezuela a tasa del día).
