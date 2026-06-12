# Muse IA Lab — Chatbot de ventas «Musa» (WhatsApp)

Bot de ventas por WhatsApp del curso **Modelos IA** (9 USD pago único), para Venezuela y Colombia.
Stack: Twilio (WhatsApp) · OpenAI GPT-5.1 · InsForge (Postgres, edge functions, storage, cron) · fal.ai (videos del avatar).

> ⚠️ **Repositorio PRIVADO**: contiene datos del negocio (enlaces de entrega, datos de pago, estrategia). No hacerlo público.

## Estructura

| Ruta | Contenido |
|---|---|
| `PLAN-CHATBOT-WHATSAPP.md` | Plan maestro (arquitectura, funnel, costos, riesgos, fases) |
| `investigacion/` | Investigación verificada (avatares, WhatsApp/Twilio, pagos, ads, GPT-5.1, funnel) |
| `migrations/` | Migraciones SQL del esquema `musa_*` (se aplican automáticamente al hacer push) |
| `functions/` | Edge functions de InsForge (se despliegan automáticamente al hacer push) |
| `bonos/` | Bono «Plan de Acción 7 Días» (fuente .md/.html + PDF) |
| `config/` | Datos de pago y marca (los valores reales viven en `musa_settings` / secrets) |
| `enlaces.txt` | Los 17 enlaces de entrega (1–13 módulos, 14–17 bonos) |

## Despliegue automático (CI/CD)

Al hacer push a `main` con cambios en `migrations/` o `functions/`, GitHub Actions
([.github/workflows/deploy-backend.yml](.github/workflows/deploy-backend.yml)):

1. Aplica las migraciones pendientes: `npx @insforge/cli db migrations up --all`
2. Redespliega cada función de `functions/*.ts`

Secretos requeridos en el repo (Settings → Secrets → Actions):
- `INSFORGE_ACCESS_TOKEN` — token del CLI de InsForge. Si caduca, regenerarlo: `npx @insforge/cli login` en local y copiar `access_token` de `~/.insforge/credentials.json`.
- `INSFORGE_PROJECT_ID` — `cbe1fd11-a22f-4017-a1a4-f0a641e0c7aa` (proyecto cv-mauricio; el bot usa prefijo `musa_`).

⚠️ El backend se comparte con el CV profesional (límite del plan gratis de InsForge): **no tocar** la función `valentina-chat` ni la tabla `contact_messages`.

## Backend en producción

- Webhook WhatsApp: `https://m2gnzrj8.functions.insforge.app/musa-webhook-twilio`
- Tasa del día: `https://m2gnzrj8.functions.insforge.app/musa-tasa-dia` (crons 11:45 y 17:45 UTC)
- Secrets en InsForge: `OPENAI_API_KEY`, `MUSA_CRON_KEY`, `MUSA_INSFORGE_API_KEY`
- Buckets: `musa-avatares` (público), `musa-capturas` (privado)
