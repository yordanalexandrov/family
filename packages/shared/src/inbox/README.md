# inbox

## Overview

Чистата логика на Входящата кутия (GLOSSARY: Входяща кутия), която екранът `/inbox` ползва. Схемите на API-то са в [schemas/inbox.ts](../schemas/inbox.ts).

## Interface

- `groups.ts:inboxGroups`, `InboxGroup`, `InboxGroupLabel` — записите в групи „Днес“, „Вчера“ и „По-рано“ по деня на `updatedAt` в София.

## Invariants

- `groups.ts:inboxGroups` — пази реда на записите в групата (на api-то: последно обновените отгоре) и изпуска празните групи; групите са винаги в реда „Днес“, „Вчера“, „По-рано“.

## Side Effects

- None. Моментът идва като `now`.

## Verification

- Run: `pnpm --filter @family/shared test src/inbox`
