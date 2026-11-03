# Design System: Muse IA Lab — Editorial Haute-Couture & Swiss Minimalist Studio (v8.0 Zero-Purple)
**Project ID:** `muse-ia-lab-v8-zero-purple`
**Skills Applied:** `design-md`, `frontend-app-builder`, `stitch-loop`

## 1. Visual Theme & Atmosphere
- **Aesthetic Philosophy:** *Post-2025 Zero-Purple Editorial Luxury & Swiss Architectural Minimalism*. Inspired by **Saint Laurent Digital, Bottega Veneta, Leica Camera, Apple Editorial, and Linear 2026 Monochrome**.
- **Anti-Cliché Mandate (0% AI Purple):** Complete elimination of 2024–2025 generic AI SaaS purple/violet (`#8b5cf6`, `#6D28D9`, `#c4b5fd`, `#a078ff`, `#7c3aed`). Instead of neon purple glows, the system uses **tactile architectural materials**: Obsidian Carbon, Warm Alabaster Paper, Raw Linen, Brushed Champagne Bronze, and Analog 85mm Studio Photography of **Musa** (our unified hyperrealistic character).
- **Dual-Surface Harmony:**
  1. **Editorial Gallery & Command Surfaces (`index.html`, `consola.html`, `/a/<token>`):** Deep Obsidian Carbon (`#0A0A0B`) and Warm Espresso Graphite (`#121211`) paired with Warm Alabaster typography (`#F5F2EB`) and Brushed Champagne Bronze (`#C8A97E` / `#E2C799`) accents.
  2. **Daylight Architectural Atelier (`academia.html` — Musa Studio):** Warm Alabaster Canvas (`#F6F4F0`) and Pure Gallery Paper (`#FFFFFF`) paired with Deep Espresso Ink (`#141413`), Architectural Stone hairlines (`#E4E0D8`), and Warm Editorial Bronze (`#9A7240` / `#C8A97E`).

## 2. Color Palette & Roles

### A. Editorial Obsidian Mode (`index.html`, `consola.html`, `/a/<token>`, Legal Pages)
- **Obsidian Carbon (`#0A0A0B`):** Primary canvas background; deep, matte, zero blue/violet cast.
- **Espresso Graphite (`#121211`):** Elevated bento cards, editorial containers, and modal surfaces.
- **Warm Charcoal Surface (`#191816`):** Interactive hover states and secondary panels.
- **Warm Alabaster (`#F5F2EB`):** Primary headline and high-contrast editorial text.
- **Muted Stone (`#A39E93`):** Secondary body copy and captions; warm neutral grey with zero purple undertone.
- **Brushed Champagne Bronze (`#C8A97E`):** Primary luxury accent, editorial rules, active borders, and tactile CTA highlights.
- **Luminous Champagne Gold (`#E5CCA4`):** Specular highlights, price typography gradients, and active indicators.
- **Studio Emerald (`#10B981`):** Live status indicators, verified checkmarks, and WhatsApp operational telemetry.
- **Architectural Hairline Dark (`rgba(245, 242, 235, 0.09)`):** Crisp 1px structural borders.

### B. Daylight Architectural Atelier (`academia.html` — Musa Studio)
- **Warm Alabaster (`#F6F4F0`):** Main studio background; calm, anti-fatigue daylight gallery tone.
- **Gallery Paper White (`#FFFFFF`):** Elevated lesson cards, player frame dock, and active pills.
- **Raw Linen (`#EFECE6`):** Secondary containers, search inputs, and subtle tags.
- **Espresso Ink (`#141413`):** Primary typography, primary action buttons, and active state pills.
- **Warm Slate (`#57534E`):** Secondary body text and lesson descriptions.
- **Editorial Bronze (`#9A7240`):** Station kickers, active metadata tags, and subtle luxury accents (replaces all `#6D28D9` violet).
- **Architectural Hairline Light (`#E4E0D8`):** 1px structural dividers and card strokes.

## 3. Typography Rules
- **Display & Editorial Serif (`'Playfair Display', Georgia, serif`):** Used selectively for editorial headlines, italic emphasis (*hiperrealistas*, *Musa Studio*), and high-contrast luxury storytelling.
- **Primary Geometric Sans (`'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif`):** Clean, modern, high-legibility UI and body typography with tight tracking (`-0.025em` on headings).
- **Technical Camera & Telemetry Mono (`'JetBrains Mono', ui-monospace, monospace`):** Used for camera lens metadata (`85mm f/1.4 · ISO 100 · RAW`), module numbering (`01`–`13`), pricing badges, and live telemetry in `consola.html`.
- **Fluid Sizing & Numeric Discipline:** `clamp()` fluid typography across viewports and `font-variant-numeric: tabular-nums` on all prices, counters, and indices.

## 4. Component Stylings
- **Buttons (Tactile Champagne & Obsidian Pills):**
  - Primary CTA on dark surfaces: Warm Champagne-to-Bronze gradient (`linear-gradient(180deg, #E5CCA4 0%, #C8A97E 55%, #A88453 100%)`) with `#0A0A0B` Obsidian bold text, top specular hairline (`inset 0 1px 0 rgba(255,255,255,0.45)`), and subtle warm ambient elevation (`0 14px 34px -12px rgba(200, 169, 126, 0.45)`).
  - Primary CTA on daylight surfaces: Solid Espresso Ink (`#141413`) with `#F6F4F0` text and warm bronze hover accent.
- **Cards & Containers:**
  - Architectural bento containers with `16px–18px` radius, `1px solid` hairline borders, subtle top-edge light reflection, and zero neon glow.
- **Interactive Musa Lookbook Frame:**
  - Camera viewfinder HUD aesthetic with `85mm f/1.4` metadata bar, instant angle switcher (`01 · Estudio 85mm`, `02 · Textura Dérmica 3/4`, `03 · Exterior Hora Azul`), and smooth opacity/scale transitions.

## 5. Layout Principles
- **Swiss Architectural Grid:** Exposed 1px hairlines, asymmetric 12-column bento proportions in the Studio and Console, and a high-focus editorial column (`max-width: 820px`) on the Landing Page for maximum mobile & desktop conversion.
- **Motion Physics:** `cubic-bezier(0.22, 1, 0.36, 1)` easing on all hover, tab, and modal transitions; full support for `prefers-reduced-motion`.
