# types

## Overview

Ambient TypeScript декларации за зависимости без собствени типове.

## Interface

- `heic-decode.d.ts` – `declare module 'heic-decode'`: default `decode` и изображенията на HEIC/HEIF файл като RGBA пиксели (libheif в WebAssembly); едно изображение се декодира едва при `decode()`. Използва се от `src/services/step-photos.ts`.

## Invariants

- None

## Side Effects

- None

## Verification

- Run: `pnpm --filter api typecheck`
