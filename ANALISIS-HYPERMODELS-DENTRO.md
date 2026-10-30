# HyperModels por dentro — teardown del área de alumnos

Acceso real a `hypermodelsacademy.com/dashboard`, 30-oct-2026. No es una landing: es
la plataforma que ven sus compradores. Esto es lo que hay detrás.

---

## Cómo se ve el catálogo

```
┌────────────────────────┬─────────────────────────────────────────────┐
│  HyperModels           │  [banner rosa: presentación privada]  ×     │
│                        │  [banner azul: canal de Telegram]  Unirme × │
│  ⌂ Home                │                                             │
│                        │  Presentación                               │
│  ┌ Canal de Telegram ┐ │  ┌──────────────┐  ┌──────────────┐        │
│  │ Únete al canal... │ │  │   [portada]  │  │   [portada]  │        │
│  └───────────────────┘ │  │ ✓ Completado │  │ ✓ Completado │        │
│  ┌ ¿Preguntas? ──────┐ │  │  Módulo 1    │  │  Módulo 2    │        │
│  │ hola@...          │ │  │ Introducción │  │ El Modelo... │        │
│  └───────────────────┘ │  └──────────────┘  └──────────────┘        │
│  ┌ Gana 50% ─────────┐ │                                             │
│  │ Ver mi enlace →   │ │  ┌──────────────┐  ┌──────────────┐        │
│  └───────────────────┘ │  │ ( 0% )       │  │ ( 0% )       │        │
│                        │  │  Módulo 5    │  │  Módulo 6    │        │
│  Módulos               │  │ La Herram.   │  │ Face Card    │        │
│  ├ Introducción        │  └──────────────┘  └──────────────┘        │
│  └ ...                 │                                             │
│  José                  │                                             │
└────────────────────────┴─────────────────────────────────────────────┘
```

**Cada módulo es una tarjeta con cuatro datos:** portada generada, número, título y
**una línea que dice qué se logra** («Crea tu cuenta y da el primer paso», «Domina la
herramienta principal»).

**Y un quinto dato que es el que manda: el progreso.**
- `✓ Completado` cuando terminó.
- `( 0% )` en un anillo cuando no ha empezado.
- Los módulos sin empezar se ven **desenfocados**, como si estuvieran detrás de un
  cristal. No están bloqueados: están apagados. Es una diferencia importante.

---

## Cómo se ve una lección

```
Módulos / Introducción          ‹ Anterior   Finalizar ›   [✓ Completado]
──────────────────────────────────────────────────┬───────────────────
                                                   │  Lecciones        │
              ┌─────────────────────┐              │  ┌─────────────┐  │
              │                     │              │  │ ▶ Introducc.│  │
              │        ▶            │              │  │          ✓  │  │
              │      (video)        │              │  └─────────────┘  │
              └─────────────────────┘              │                   │
                                                   │                   │
                                            [ Completar → ]            │
──────────────────────────────────────────────────┴───────────────────
```

- **Un video a la vez**, grande, sin distracciones.
- **Rail de lecciones** a la derecha, con la actual resaltada.
- **Navegación**: `Anterior`, `Finalizar`, y un botón `Completar →` al pie.
- La barra lateral **nunca desaparece**: canal, soporte y afiliados están en todas
  las pantallas.

---

## Las tres cosas que hacen que esto funcione

### 1. Convertir una lista en un recorrido

Nuestros 60 archivos se ven como **una lista de 60 enlaces**. Los suyos se ven como
**un recorrido con principio y final**, donde cada módulo promete un resultado
concreto y el sistema te dice cuánto llevas.

La diferencia no es cosmética: un enlace sugiere «descarga esto». Un módulo con
progreso sugiere «termínalo».

### 2. El soporte está en TODAS las pantallas

Una tarjeta fija con el correo, en el catálogo y dentro de la lección. No hay que
buscar ayuda: está al lado.

Nosotros tenemos `MUSA_SOPORTE_WA` preparado y **sin usar**. Hoy, si un alumno se
atasca, la página no le ofrece nada.

### 3. El programa de afiliados al 50 %

> «Nos repartimos el beneficio de cada venta al 50 %. Consigue tu enlace.»

Está en la barra lateral de cada pantalla. Convierte a cada alumno en vendedor y no
cuesta nada hasta que vende.

**Su precio es 27 USD; el 50 % son 13,50.** El nuestro es 9 USD: un 40 % serían 3,60.
Parece poco, pero para quien ya compró y solo tiene que compartir un enlace, es
dinero gratis. Y para nosotros es adquisición a coste cero hasta que hay venta.

---

## Lo que NO copiaría

| Su decisión | Por qué no |
|---|---|
| Dos banners fijos arriba | Ocupan un tercio de la primera pantalla y empujan el curso hacia abajo. Uno basta |
| Portadas generadas por módulo | Bonitas, pero son 13 imágenes que hay que producir. Se puede empezar con un color y el número |
| Desenfoque en módulos sin empezar | Sugiere bloqueo donde no lo hay. Confunde |
| Cursiva rosada en el logo | Cuestión de marca, no de estructura |

---

## Lo que sí falta en Musa, por orden de impacto

| # | Qué | Coste | Efecto |
|---|---|---|---|
| 1 | **Una línea de resultado por módulo** | 30 min | El módulo deja de ser una carpeta y pasa a ser un objetivo |
| 2 | **Tarjeta de soporte** en la página del curso | 15 min | Hoy el alumno no tiene a quién escribir |
| 3 | **Vista de lección** con video grande, anterior/siguiente y rail | 4–6 h | El salto de calidad más grande |
| 4 | **Progreso por módulo** (`completado`) | 3–4 h + migración | Es lo que hace que se termine el curso |
| 5 | **Afiliados** | 1–2 días | Decisión de negocio antes que técnica |

Los puntos 1 y 2 se pueden hacer hoy. El 3 y el 4 son el mismo trabajo: no tiene
sentido la vista de lección sin poder marcar completado, ni al revés.

---

## La comparación honesta

| | HyperModels | Musa |
|---|---|---|
| Precio | 27 USD | 9 USD |
| Acceso | Clerk + verificación | Cookie con token |
| Catálogo | Tarjetas con progreso | Lista de enlaces |
| Lección | Vista enfocada | Nada: se abre el archivo |
| Soporte | Visible siempre | Ninguno |
| Afiliados | 50 % | No existe |
| Venta | Landing + checkout | **Bot de WhatsApp que verifica el pago solo** |
| Verificación de pago | Pasarela | **Visión artificial sobre la captura** |

Tenemos dos cosas que ellos no tienen: **la venta automatizada por WhatsApp** y **la
verificación de comprobantes con IA**. Lo demás es presentación, y la presentación se
construye.
