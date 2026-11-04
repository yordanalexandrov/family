# dev — витрина на дизайн системата

## Overview
Само за разработка: витрина на дизайн системата „Стъкло“ с карти, аурора, горна лента, лента с действия и toast в двете теми и двете нива на ефектите. Монтира се като `/dev/glass` само в dev (`app/router.tsx`).

## Interface
- `GlassScreen.tsx:GlassScreen` — демо страницата; приема `?theme=`, `?effects=`, `?sync=` за снимки без кликове

## Invariants
- `GlassScreen.tsx:useEffect` — параметрите се прилагат само при валидни стойности (`light|dark`, `full|lite`, ключ от `SYNC_SAMPLES`)
- `GlassScreen.tsx:applyTheme` — `auto` маха `dataset.theme`

## Side Effects
- `GlassScreen.tsx:applyTheme` — пише `document.documentElement.dataset.theme`
- `GlassScreen.tsx:useEffect` — чете `window.location.search` и вика `setEffects`, което трайно записва `family.effects` в localStorage (`../../app/effects.ts:useEffectsLevel`); също и изборът „Ефекти“ във витрината — `/dev/glass?effects=lite` сменя нивото на цялото устройство

## Verification
- Run: `pnpm --filter web test` (директорията няма собствени `*.spec.*`)
- Типове: `pnpm --filter web typecheck`
