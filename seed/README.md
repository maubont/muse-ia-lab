# seed/ — datos y esquema exportados de producción

Estos dos archivos son la **memoria del negocio**: lo que no se puede reconstruir
mirando el código. Se versionan a propósito para que un repo nuevo (o una
restauración) no empiece perdiendo el copy afinado ni los datos de cobro.

> ⚠️ **Repositorio PRIVADO.** Contiene datos reales del negocio: cuentas de cobro,
> el WhatsApp del operador, los 17 enlaces de entrega y el system prompt de GPT.
> No publicar, no pegar en issues, no mandar a servicios externos.

## Contenido

| Archivo | Qué es | Tamaño |
|---|---|---|
| `musa_settings.json` | Las 13 claves de `musa_settings` (copy del funnel, prompt, precios, cuentas, entrega, modelo, operador) | ~33 KB |
| `esquema-musa.json` | Esquema de las 8 tablas `musa_*` en producción: columnas, índices, FKs, RLS, políticas y triggers | ~13 KB |

`funnel_copy` (21.470 caracteres) y `gpt_system` (5.983) son el activo principal:
son copy escrito y corregido conversación a conversación. **No se reescriben: se
migran.**

## Procedencia

| Dato | Valor |
|---|---|
| Proyecto InsForge | `cv-mauricio` (compartido con el CV profesional) |
| API base | `https://m2gnzrj8.us-east.insforge.app` |
| Fecha de exportación | 27-oct-2026 |
| Commit del repo al exportar | `0596199` + árbol de trabajo con cambios sin commitear |
| Comando | `npx @insforge/cli db export --format json --tables …` |

## Verificación hecha al exportar

El esquema de producción se comparó columna por columna contra las migraciones
del repo (`migrations/*.sql`):

```
8 tablas musa_*  ·  0 columnas en producción que el repo no declare
                 ·  0 columnas del repo que producción no tenga
```

Es decir: **el esquema `musa_*` no tiene drift.** La migración huérfana
`create-rate-limits` que existe en el proyecto pertenece a la otra aplicación
(`rate_limits` no se referencia en ninguna parte del código de Musa).

## Cómo se restauran

```bash
# 1) Recrear el esquema (repo nuevo: idealmente con migraciones versionadas)
npx @insforge/cli db import seed/esquema-musa.json

# 2) Cargar la configuración
npx @insforge/cli db import seed/musa_settings.json
```

En un Postgres propio (Railway/Neon) se cargan con el `INSERT` equivalente:
cada fila es `(key text primary key, value jsonb, updated_at timestamptz)`.

## Regla de mantenimiento

Si el copy del funnel cambia en producción, **re-exportar este archivo antes de
cualquier mudanza**. Un `seed/` desactualizado es peor que no tenerlo: da falsa
confianza.
