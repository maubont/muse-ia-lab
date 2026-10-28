# next/ — Musa v2 (semilla del repo nuevo)

Esto **no es todavía una aplicación**. Es la parte de un repo nuevo que no se
puede inventar mirando el código: el esquema real de producción y su verificación.

Vive dentro del repo viejo a propósito: el repo viejo queda congelado al lado como
**oráculo** (comportamiento de referencia) hasta que el nuevo pase la puerta de
paridad. Sacarlo a su propio repositorio es un `git subtree split` cuando llegue
el momento.

## Qué hay aquí

| Ruta | Qué es |
|---|---|
| `src/api/servidor.ts` | Servidor HTTP del webhook: **cero dependencias**, firma obligatoria antes de procesar |
| `src/motor/contrato.ts` | Contrato del motor (`procesar`) + `motorEco` para probar conectividad |
| `scripts/evo.mjs` | CLI para operar Evolution API: `estado`, `instancias`, `qr`, `webhook-ver`, `webhook-set`, `enviar` |
| `migrations/0001_esquema_inicial.sql` | DDL completo de las 8 tablas `musa_*`, **generado desde producción** |
| `migrations/0002_seed_configuracion.sql` | Las 13 claves de configuración (copy del funnel, prompt, precios, cuentas, entrega) como `insert … on conflict` idempotente |
| `scripts/generar-esquema.mjs` | Regenera el DDL desde `../seed/` |
| `scripts/generar-seed.mjs` | Regenera el SQL de configuración desde `../seed/` |
| `scripts/verificar-esquema.mjs` | Comprueba que el DDL no perdió ni inventó nada (262 aserciones) |
| `scripts/verificar-seed.mjs` | Comprueba que las 13 filas del SQL son idénticas a las de origen (36 aserciones) |

## Cómo se usa

```bash
npm run esquema      # regenera migrations/0001_esquema_inicial.sql
npm run seed         # regenera migrations/0002_seed_configuracion.sql
npm run verificar    # ambas verificaciones (298 aserciones)
```

Ambos funcionan desde `next/` o desde la raíz del repo (las rutas se resuelven
respecto al archivo, no al directorio de invocación).

## Por qué el DDL se genera y no se escribe a mano

Porque escribirlo a mano es cómo se pierde una regla de negocio. El export de
producción no incluye los `CHECK` ni marca las columnas `identity`: si se hubiera
traducido "de memoria", se habrían perdido el `CHECK` de país, el de estado de
pago, el `ON DELETE CASCADE` de los mensajes y los cinco `id` como identity.
Ahora esas piezas vienen de `seed/restricciones.json`, transcrito de consultas
verificadas al catálogo de Postgres.

Resultado verificado: **8 tablas · 68 columnas · 16 restricciones · RLS en las 8**,
con 0 diferencias frente a producción.

## Lo que NO hay aquí todavía (a propósito)

- **No hay copia de los módulos probados.** `functions/canal/*` y `functions/motor/*`
  siguen siendo la única fuente de verdad. Copiarlos ahora garantizaría que las
  dos versiones diverjan; se mueven con `git mv` en el cutover, no antes.
- **No hay motor del funnel.** Se porta después, con el corpus de conversaciones
  reales como prueba de caracterización.
- **No hay Dockerfile ni `railway.toml`.** Se escriben cuando exista un servicio
  que arrancar; un Dockerfile para nada es deuda disfrazada de progreso.

## La puerta de paridad

El repo nuevo sustituye al viejo solo cuando `scripts/verificar-funnel-colombia.mjs`
(8/8) pase contra el, y las 151 aserciones de las tres suites sigan verdes. Antes
de eso, el viejo manda.
