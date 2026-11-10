# inbox — Входящата кутия

## Overview
Екранът „Входяща кутия“ (`/inbox`) и камбанката с бройката на непрочетените (GLOSSARY: Входяща кутия, ADR-0015). Само на телефона и в браузъра, на действащия човек; kiosk и TV нямат нито екрана, нито камбанката.

## Interface
- `queries.ts:inboxKeys`, `useInbox`, `useInboxUnreadCount` — записите и бройката, под `['inbox', userId, …]`
- `queries.ts:useReadInboxItem`, `useReadAllInbox` — прочитане на един и „Всички прочетени“
- `queries.ts:useInboxAction` — бутон на известие („Извадих“, „Аз“) от реда
- `InboxScreen.tsx:InboxScreen` — екранът: групи „Днес“, „Вчера“, „По-рано“ (`inboxGroups` от shared), „Всички прочетени“ вдясно на реда под заглавието (до него заглавието не се събира на телефона), „Няма известия“
- `InboxRow.tsx:InboxRow` — един ред (`<li>`): глава-линк с точка, заглавие, текст и час; под нея бутоните или кой е отговорил
- `InboxBell.tsx:InboxBell`, `bellLabel` — камбанката в `ScreenHeader` и в `TopBar` на дашборда, преди аватара
- `queries.ts:useAppBadge` — бройката върху иконата на приложението (Badging API), монтирана веднъж в `App`

## Invariants
- `InboxBell.tsx:InboxBell` — без действащ човек (`useWritingUserId()` е `null`) не се рендира и не пита api-то; бройката се скрива при 0, над 9 е „9+“; името на линка казва бройката
- `InboxScreen.tsx:InboxScreen` — извън `phone`/`browser` пренасочва към `/`
- `InboxRow.tsx:InboxRow` — натискането на главата прочита само непрочетен запис и води към `url` с `router.navigate({ href })`; Ctrl/Cmd/Shift клик оставя браузъра
- `InboxRow.tsx:InboxActions` — бутонът вика `post` на действието (същият път като на push-а) с действащия човек и след отговора прочита записа; при 409 `cook_taken` вместо бутона е „<име> вече готви“; `answered` от api-то заменя бутоните
- `queries.ts:useReadMutation` — прочитането е оптимистично върху записите и бройката на действащия човек; `onSettled` инвалидира `inboxKeys.all`; мутацията довършва и след смяната на екрана
- `queries.ts:useAppBadge` — следва `useInboxUnreadCount`: `setAppBadge(n)`, при 0 `clearAppBadge()`; без действащ човек иконата не се пипа; без Badging API нищо
- Бройката и екранът се обновяват сами от SSE `inbox.changed` (`api/events.ts`)

## Side Effects
- `queries.ts:useInbox` — GET `/api/inbox`
- `queries.ts:useInboxUnreadCount` — GET `/api/inbox/unread-count`
- `queries.ts:useReadInboxItem`, `useReadAllInbox` — POST `/api/inbox/:id/read`, POST `/api/inbox/read-all`
- `queries.ts:useInboxAction` — POST на `action.post` (напр. `/api/menu/meals/:id/thawed`); `onSettled` инвалидира кутията, дашборда и менюто
- `queries.ts:useAppBadge` — `navigator.setAppBadge` / `clearAppBadge` (през `app/app-badge.ts`)

## Verification
- Run: `pnpm --filter web test src/features/inbox`
