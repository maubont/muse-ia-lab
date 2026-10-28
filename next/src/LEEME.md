# src/ — vacío a propósito

Los módulos ya probados **no se copian aquí todavía**.

Hoy la única fuente de verdad de:

- `canal/tipos.ts` — contrato de canal
- `canal/evolution.ts` — adaptador Evolution API (Baileys)
- `motor/comprobante.ts` — núcleo antifraude
- `motor/guardarrailes.ts` — gate 18+, opt-out, honestidad, país

es `../../functions/…`, con 151 aserciones pasando desde `../../scripts/`.

Copiarlos ahora garantizaría que las dos versiones diverjan en la primera
corrección de un bug. Se mueven **una sola vez**, con `git mv`, en el cutover,
cuando este repo pase la puerta de paridad (ver `../README.md`).
