# inbox — Входящата кутия

## Overview
Екранът „Входяща кутия“ (`/inbox`) и камбанката с бройката на непрочетените (GLOSSARY: Входяща кутия, ADR-0015). Само на телефона и в браузъра, на действащия човек; kiosk и TV нямат нито екрана, нито камбанката.

## Interface
- `queries.ts:inboxKeys`, `useInbox`, `useInboxUnreadCount` — записите и бройката, под `['inbox', userId, …]`
- `queries.ts:useReadInboxItem`, `useReadAllInbox` — прочитане на един и „Всички прочетени“
- `InboxScreen.tsx:InboxScreen` — екранът: групи „Днес“, „Вчера“, „По-рано“ (`inboxGroups` от shared), „Всички прочетени“ вдясно на реда под заглавието (до него заглавието не се събира на телефона), „Няма известия“
- `InboxRow.tsx:InboxRow` — един ред (`<li>`): глава-линк с точка, заглавие, текст и час
- `InboxBell.tsx:InboxBell`, `bellLabel` — камбанката в `ScreenHeader` и в `TopBar` на дашборда, преди аватара

## Invariants
- `InboxBell.tsx:InboxBell` — без действащ човек (`useWritingUserId()` е `null`) не се рендира и не пита api-то; бройката се скрива при 0, над 9 е „9+“; името на линка казва бройката
- `InboxScreen.tsx:InboxScreen` — извън `phone`/`browser` пренасочва към `/`
- `InboxRow.tsx:InboxRow` — натискането на главата прочита само непрочетен запис и води към `url` с `router.navigate({ href })`; Ctrl/Cmd/Shift клик оставя браузъра
- `queries.ts:useReadMutation` — прочитането е оптимистично върху записите и бройката на действащия човек; `onSettled` инвалидира `inboxKeys.all`; мутацията довършва и след смяната на екрана

## Side Effects
- `queries.ts:useInbox` — GET `/api/inbox`
- `queries.ts:useInboxUnreadCount` — GET `/api/inbox/unread-count`
- `queries.ts:useReadInboxItem`, `useReadAllInbox` — POST `/api/inbox/:id/read`, POST `/api/inbox/read-all`

## Verification
- Run: `pnpm --filter web test src/features/inbox`
