# Datos de pago y marca (actualizado 12-jun-2026)

> Estos datos se cargarán como secrets / tabla `settings` en InsForge en la Fase 1.
> NUNCA se hardcodean en el código del bot.

## Venezuela

> 🚫 **BLOQUEO DE LANZAMIENTO:** todos los datos de Venezuela son **PROVISIONALES**, solo para
> desarrollo y pruebas en sandbox. El bot NO puede salir a producción (Fase 6) hasta
> reemplazarlos por los reales. El dueño aún no tiene el número/cuenta definitivos.

| Método | Dato | Estado |
|---|---|---|
| Pago Móvil — banco | 0102 (Banco de Venezuela) | 🚫 PROVISIONAL |
| Pago Móvil — teléfono | 0412-0000000 | 🚫 PROVISIONAL |
| Pago Móvil — cédula | V-00.000.000 | 🚫 PROVISIONAL |
| Pago Móvil — titular | PENDIENTE | 🚫 PROVISIONAL |
| Cuenta BDV (20 dígitos) | 0102 0000 00 0000000000 | 🚫 PROVISIONAL |
| Cuenta BDV — titular y cédula | PENDIENTE | 🚫 PROVISIONAL |

## Colombia

| Método | Dato | Estado |
|---|---|---|
| Bancolombia — cuenta de ahorros | 82061072256 | ✅ |
| Bancolombia — titular (visible en chat) | Mau** Bon** | ✅ |
| Nequi | 3223565761 | ✅ (falta titular parcial para mostrar) |
| Llave Bre-B (celular) | 3223565761 | ✅ (falta titular parcial para mostrar) |
| Daviplata | — | Descartado por ahora |

## Descartados por ahora

Binance Pay, Zelle, Daviplata.

## Precios

- Venezuela: 9 USD a tasa paralelo del día (cron: `ceil(9 × tasa × 1,02 / 100) × 100`)
- Colombia: **33.000 COP fijo — ✅ CONFIRMADO por el dueño (12-jun-2026)**

## Marca

- **Display name de WhatsApp: «Modelos IA»** — decisión: máxima coherencia anuncio → chat
  (el lead hace clic en un anuncio del "curso Modelos IA" y aterriza en un chat con el mismo
  nombre: menos desconfianza). Respaldo si Meta lo rechaza por genérico: **«Muse IA Lab»**
  (nombre real del negocio).
- Asesora del chat: **Musa** 💜 (firma: «— Musa 💜 | Modelos IA»)
