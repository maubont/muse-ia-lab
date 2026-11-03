# Muse IA Lab — Plataforma & Sistema de Modelos IA (v9.0)

Ecosistema digital de alta conversión y academia interactiva para aprender a crear, operar y monetizar **modelos virtuales hiperrealistas con Inteligencia Artificial**, sin depender de sesiones de fotos, cámaras ni personas reales.

> ⚠️ **Repositorio PRIVADO**: Contiene lógica de negocio, arquitectura del funnel, pasarelas y activos de entrega. No hacer público.

---

## ✦ Filosofía Visual y de Producto (2026)

- **Cero Efecto Plástico (Hiperrealismo Cotidiano):** Frente a los prompts genéricos con piel planchada y aspecto de cera 3D, el método enseña fotografía espontánea con óptica de smartphone actual (iPhone 24mm, selfies de espejo con flash real, luz natural de ventana, fondos en foco y textura dérmica sin retocar).
- **Consistencia de Personaje (Musa):** **Musa** actúa como la anfitriona oficial consistente en todo el sistema (avatar de cabecera, agente conversacional de WhatsApp, asistente del estudio y caso de estudio de consistencia facial 100%).
- **Diversidad de Perfiles:** En la academia (`academia.html`), las 13 clases cuentan con portadas hiperrealistas multi-modelo únicas (lifestyle, café europeo, fitness/pilates, cozy gamer, golden hour en auto, contenido nocturno VIP).
- **Salida Comercial Directa:** El foco no es generar una imagen suelta, sino estructurar un sistema que monetiza en **Fanvue, Telegram, Instagram, TikTok y ManyChat**, con videos en movimiento y notas de voz realistas.
- **Cero Carga de Estudio:** Sin tareas rígidas ni horarios. El alumno avanza a su propio ritmo con plantillas listas de copiar y pegar (eliminado cualquier concepto de "reto de 7 días").
- **Estética Haute-Couture Luminosa (v9.0 Zero-Purple):** Paleta no oscura basada en **Marfil Sedoso (`#FAF7F5`)**, **Oro Champaña (`#C8A97E`)**, **Rosa Pastel Embaldosado (`#F9EBEE` / `#D89AA2`)** y **Tinta Espresso (`#181415`)**. Cero morados ni degradados clichés de IA.

---

## 🏛️ Arquitectura del Sistema

```
                      ┌───────────────────────────────────────────┐
                      │          PROSPECTO / ALUMNO               │
                      └─────────────────────┬─────────────────────┘
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
          [Landing Page v9.0]                           [WhatsApp Directo]
        https://.../ (?v=90)                             +57 322 746 2629
                     │                                             │
                     └──────────────────────┬──────────────────────┘
                                            ▼
                           ┌─────────────────────────────────┐
                           │   Railway (Evolution API v2)    │
                           │     Instancia WhatsApp: musa    │
                           └────────────────┬────────────────┘
                                            │ Webhook POST
                                            ▼
                           ┌─────────────────────────────────┐
                           │    Railway (Node.js Server)     │
                           │   next/src/api/servidor.ts      │
                           │   next/src/motor/ (Agente IA)   │
                           └────────────────┬────────────────┘
                                            │
                     ┌──────────────────────┼──────────────────────┐
                     ▼                      ▼                      ▼
           [Calificación y Venta]   [Musa Studio (LMS)]   [Consola Operativa]
            Nequi / Bancolombia /      /academia.html        /consola.html
               Bre-B ($9 USD)       (13 Clases + 4 Bonos)   (Telemetría en Vivo)
                                            │
                                            ▼
                           ┌─────────────────────────────────┐
                           │   InsForge Backend (Postgres)   │
                           │    Edge Functions & Storage     │
                           └─────────────────────────────────┘
```

---

## 📂 Estructura del Repositorio

| Directorio / Archivo | Función y Contenido |
|---|---|
| **`next/`** | **Núcleo operativo del servidor en producción** (Node.js 22 + TypeScript). |
| ├── `next/landing/index.html` | **Landing Page oficial v9.0**: Visor interactivo de Musa, comparativa de realismo ("IA de plástico vs Óptica iPhone"), lookbook multi-modelo, pipeline de 4 pasos y modal +18. |
| ├── `next/landing/academia.html` | **Musa Studio**: Plataforma interactiva de estudio con 13 clases, 13 portadas hiperrealistas independientes, reproductor 16:9 con modo enfoque (`T`), auto-guardado de notas en `localStorage`, índice rápido y visor de 4 packs de bonos. |
| ├── `next/landing/consola.html` | **Consola Administrativa**: Monitor en tiempo real de conversaciones, estados de prospectos, comprobantes de pago y telemetría de WhatsApp. |
| ├── `next/landing/assets/` | Activos optimizados (fotos hiperrealistas de Musa y modelos, video demo MP4). |
| ├── `next/src/api/servidor.ts` | Servidor HTTP nativo de alto rendimiento: enrutamiento de páginas, APIs de academia, webhook de Evolution API y telemetría. |
| ├── `next/src/motor/` | Máquina de estados del chatbot Musa: guión de ventas, guardarraíles, validación de comprobantes y entrega de tokens. |
| ├── `next/scripts/` | Batería de pruebas y verificación automatizada (`verificar-todo.mjs`, `test-landing.mjs`, etc.). |
| **`DESIGN.md`** | Especificación del Design System v9.0 (paleta luminosa champaña/rosa pastel, tipografía, componentes y tokens). |
| **`functions/`** | Edge functions TypeScript desplegadas en InsForge. |
| **`migrations/`** | Migraciones SQL versionadas para la base de datos PostgreSQL en InsForge (`musa_*`). |
| **`.github/workflows/`** | CI/CD en GitHub Actions para despliegue automatizado de base de datos y funciones backend (`deploy-backend.yml`). |

---

## 🚀 Despliegue e Infraestructura

### 1. Aplicación Principal en Railway
La aplicación productiva se ejecuta de forma continua en Railway bajo dos servicios conectados:
- **`musa - server`** (`https://server-production-3709.up.railway.app`):
  - Ejecuta `next/src/main.ts`.
  - Expone la Landing (`/`), Musa Studio (`/academia.html`), la Consola (`/consola.html`) y los endpoints de API.
- **`musa - evolution`** (`https://evolution-production-1418.up.railway.app`):
  - Instancia dedicada de Evolution API conectada al número oficial de WhatsApp.
  - Envía webhooks hacia `/webhook/evolution` en el servidor principal.

### 2. Backend en InsForge
- **Base de datos:** PostgreSQL en la nube con tablas bajo el prefijo `musa_` (`musa_conversaciones`, `musa_mensajes`, `musa_comprobantes`, `musa_alumnos`, etc.).
- **Almacenamiento:** Buckets para avatares públicos y capturas de comprobantes.
- **CI/CD Automático:** Cada push a `main` que modifique `migrations/` o `functions/` ejecuta el workflow de GitHub Actions para aplicar migraciones y actualizar edge functions.

---

## 🧪 Verificación y Pruebas Automatizadas

El proyecto cuenta con un arnés de pruebas estricto que asegura que ningún cambio rompa el embudo de ventas, la entrega de enlaces ni las rutas del servidor.

Para ejecutar la suite completa (40 suites de prueba):

```powershell
node next/scripts/verificar-todo.mjs
```

Para verificar exclusivamente la landing page, sus activos multi-modelo y seguridad contra path traversal:

```powershell
node next/scripts/test-landing.mjs
```

> **Estándar de calidad:** Todo despliegue a producción requiere un resultado de `✓ todo verde` (1.970+ aserciones correctas y 0 fallas).

---

## 💳 Modelo Comercial y Entrega

- **Oferta:** $9 USD (o 33.000 COP) en pago único de por vida (descuento del 80% sobre precio base de $47 USD).
- **Métodos de pago en Colombia:** Nequi, Bancolombia, Bre-B y transferencias directas validadas por el bot de WhatsApp.
- **Entrega Inmediata:** Tras confirmar el comprobante, el motor genera un token criptográfico único (`/a/<token>` o `/academia.html?t=<token>`) que otorga acceso permanente a los 13 módulos del estudio y a los 4 bonos de producción.
- **Atención al Cliente:** Conversación automatizada guiada por Musa con escalamiento transparente a operador humano cuando es requerido.
