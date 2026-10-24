# Проучване: Google Calendar API със service account за семейните календари

Отговор на GitHub issue #3. Контекст: дашбордът показва „днес + 7 дни“ от Google Calendar; `apps/api` (Fastify + TypeScript) дърпа събитията сам по cron и ги презаписва в кеш таблицата `calendar_event` (`external_id, title, start, end, all_day, calendar_name`) — виж [concept.md](../concept.md). Решението за достъп е вече взето (ADR-0002): service account (SA), личните Gmail календари се споделят с имейла на SA, само за четене.

Използвани са само първични източници: референцията и ръководствата на Google Calendar API (developers.google.com), документацията на Google Cloud IAM, помощта на Google Calendar (support.google.com), README на `google-auth-library` / `googleapis` и метаданните в npm registry. Дата на проверката: 2026-10-25.

## TL;DR

1. **Без Workspace и без domain-wide delegation.** SA е обикновен Google principal със собствен имейл; споделянето на ресурс директно с този имейл не изисква admin роли или делегиране ([Create credentials][cred]). Семейството споделя календарите си със SA имейла с ниво „See event details“ ([Share your calendar][share]).
2. **Каверна:** споделянето вече *не* добавя автоматично календара в `CalendarList` на получателя; трябва `calendarList.insert` с `id` на календара ([Sharing concepts][sharing]). Затова конфигурираме списъка с календари явно (env), а не го „откриваме“.
3. **Заявка за прозореца:** `events.list` с `timeMin`/`timeMax` (RFC3339 с offset), `singleEvents=true`, `orderBy=startTime`, `timeZone=Europe/Sofia`, `maxResults=250` + пагинация ([events.list][elist]). Целодневните събития са `start.date`/`end.date` (end — изключителна дата); повтарящите се идват като инстанции с `recurringEventId` ([Event resource][eres]).
4. **Кой е календарът:** всяка заявка е към конкретен `calendarId`, така че `calendar_name` се знае от нас. Цветът е потребителска настройка на SA (`calendarList.backgroundColor`) — за дашборда е по-добре собствен цвят по `calendarId` в конфигурацията.
5. **Квоти:** 10 000 заявки/мин на проект, 600/мин на потребител ([Quota][quota]). За 3–5 календара на всеки 5 минути сме на ~3 порядъка под лимита. **Пълно презареждане на 8-дневния прозорец е достатъчно за MVP;** `syncToken` не може да се комбинира с `timeMin/timeMax/orderBy` и носи сложност без полза при този обем.
6. **npm:** `google-auth-library` (JWT клиент, ~0.8 MB) + ръчни REST заявки с `client.fetch()`; без пълния `googleapis` (~246 MB unpacked, maintenance mode). Ако искаме генерирани типове — `@googleapis/calendar` (~0.84 MB). И трите са CJS с `.d.ts`, Node ≥ 22.

---

## 1. Google Cloud и споделяне на календара

### 1.1 Проект и включване на API

- Проект: **Menu › IAM & Admin › Create a Project**, име, по желание Project ID (не се сменя после), **Create**. CLI: `gcloud projects create PROJECT_ID` ([Create a project][proj]). Billing не е задължителен за Calendar API — страницата казва само, че billing „може“ да е нужен според API-тата; квотната страница: стандартната употреба е безплатна ([Quota][quota]).
- API: **Menu › APIs & Services › Library › Google Workspace › Calendar API › Enable**. CLI: `gcloud services enable calendar-json.googleapis.com` ([Enable APIs][enable]).

### 1.2 Service account и JSON ключ

- SA: **IAM & Admin › Service Accounts › Create service account**, име → генерира се ID (неизменяем). Роли в проекта **не са нужни** — стъпката е по избор; **Done** ([Create SA][sacreate]; [Create credentials][cred]). Имейлът е `SERVICE_ACCOUNT_NAME@PROJECT_ID.iam.gserviceaccount.com`. Може да отнеме 60+ сек, преди SA да е използваем ([Create SA][sacreate]).
- Ключ: отваряме SA → таб **Keys › Add key › Create new key › JSON › Create**. Файлът се сваля веднъж и не може да се свали повторно ([Create keys][keys]). CLI: `gcloud iam service-accounts keys create KEY_FILE --iam-account=SA_NAME@PROJECT_ID.iam.gserviceaccount.com`.
- Каверни за ключа ([Create keys][keys]): ключовете по подразбиране не изтичат; макс. 10 ключа на SA; ако проектът е в организация, създадена след 3 май 2024, политиката `iam.disableServiceAccountKeyCreation` е включена по подразбиране и ключове не могат да се създават (за личен Google акаунт без организация това не важи). Google препоръчва Workload Identity Federation вместо дълготрайни ключове ([google-auth-library README][gal]); за домашен сървър JSON ключ в Docker secret / env е приемлив компромис. Пазим го извън git.

### 1.3 Споделяне на личен Gmail календар със SA

Стъпки в Google Calendar (уеб) ([Share your calendar][share]):

1. **My calendars › (hover) › More › Settings and sharing**.
2. Вляво **Shared with › Add people and groups**.
3. Въвеждаме имейла на SA (`...@...iam.gserviceaccount.com`).
4. Permission: **„See event details“** (в помощта на Google това е точното име; „See all event details“ е старото име на същото ниво). Другите нива: „See only free/busy (hide details)“, „Make changes (see private events as free/busy)“, „Make changes and see event details“, „Make changes and manage sharing“. Ние искаме само четене → „See event details“ = ACL роля `reader` ([Sharing concepts][sharing]).
5. **Send**.

Работи ли за обикновен Gmail без Workspace? Да, според първичните източници:

- SA е principal със собствен уникален имейл ([SA overview][saov]); ACL грантът на календар може да е „individual user“ ([Sharing concepts][sharing]).
- Ръководството за credentials изрично казва: за достъп до конкретен ресурс „share it directly with the service account's email address. This needs no admin roles or domain-wide delegation“ ([Create credentials][cred]). Domain-wide delegation е секция „Optional“ и важи само за Workspace организации.
- Помощната страница за споделяне не поставя ограничение за типа акаунт на получателя — само „person's email address or Google group“ ([Share your calendar][share]).

Остатъчен риск: нито една страница не казва буквално „service account + consumer Gmail“. Затова първата ръчна стъпка в checklist-а включва smoke test (`events.list` с ключа) — отнема 2 минути и премахва съмнението.

### 1.4 Каверна: `CalendarList` на SA е празен

Помощната страница казва, че получателят получава имейл и трябва да кликне на линка, за да добави календара ([Share your calendar][share]); SA няма пощенска кутия. API документацията потвърждава: „Sharing a calendar with a user no longer automatically inserts the calendar into their `CalendarList`“ и за да е видим, се вика `CalendarList: insert()` ([Sharing concepts][sharing]). `calendarList.insert` „Inserts an existing calendar into the user's calendar list“; единственото задължително поле е `id` ([calendarList.insert][clinsert]), и изисква scope `calendar` или `calendar.calendarlist` (не readonly).

Следствия за дизайна:

- **Не разчитаме на `calendarList.list` за откриване.** Списъкът с `calendarId`-та е конфигурация (`GOOGLE_CALENDARS`). За първичен календар `calendarId` обикновено е имейлът на собственика ([Events & calendars concepts][concepts]); за вторичен — ID-то от **Settings and sharing › Integrate calendar › Calendar ID**.
- `events.list` работи директно по `calendarId` дори календарът да не е в CalendarList — достатъчен е ACL `reader`. Ако все пак искаме `calendarList.list` (напр. за имена/часови зони), трябва еднократен `calendarList.insert` за всеки календар с по-широк scope. По-просто: пропускаме го; името на календара също е конфигурация (`calendar_name`).
- Scope за четене на събития: `https://www.googleapis.com/auth/calendar.events.readonly` (най-тесният, който `events.list` приема) или `calendar.readonly` ([events.list][elist]; [Auth scopes][scopes]). За SA няма consent screen, така че класификацията „sensitive scope“ не ни засяга.

## 2. `events.list` за прозорец „днес + 7 дни“

Референция: [events.list][elist].

| Параметър | Стойност за нас | Бележка от документацията |
|---|---|---|
| `calendarId` | всеки ID от конфигурацията | път: `GET /calendar/v3/calendars/{calendarId}/events` (URL-encode `@`) |
| `timeMin` | начало на днешния ден в `Europe/Sofia`, RFC3339 **с offset** | „Lower bound on an event's **end** time, exclusive“ — т.е. събитие, което е започнало вчера и още тече, влиза |
| `timeMax` | `timeMin + 8 дни` | „Upper bound on an event's **start** time, exclusive“; трябва да е след `timeMin`; милисекундите се игнорират |
| `singleEvents` | `true` | разгъва повтарящите се събития в инстанции; родителят не се връща |
| `orderBy` | `startTime` | позволено **само** при `singleEvents=true` |
| `timeZone` | `Europe/Sofia` | часова зона на отговора; по подразбиране — тази на календара |
| `maxResults` | `250` (default; макс. 2500) | страницата може да е непълна дори при по-малко резултати — винаги следваме `nextPageToken` |
| `showDeleted` | не задаваме (`false`) | при пълно презареждане отменени събития не ни трябват |
| `eventTypes` | по желание `default` (повторяем) | филтрира `birthday`, `workingLocation`, `outOfOffice`, `focusTime`, `fromGmail`; за семейния дашборд рождените дни може да са желани — оставяме всички и филтрираме в кода |

Отговор: `items[]`, `nextPageToken` (липсва на последната страница; тогава идва `nextSyncToken`), `timeZone` и `summary` (заглавието на календара) ([events.list][elist]).

### 2.1 Представяне на събитията ([Event resource][eres])

- **Целодневни:** `start.date`/`end.date` във формат `yyyy-mm-dd`; `start` е включителен, `end` — изключителен (еднодневно събитие на 3 ноември е `start.date=2026-11-03, end.date=2026-11-04`). Полето `timeZone` няма ефект при тях ([Events & calendars concepts][concepts]). → `all_day = Boolean(start.date)`; при запис пазим `end` като изключителна дата или вадим 1 ден за показване.
- **С час:** `start.dateTime`/`end.dateTime` RFC3339 с offset (в зоната от `timeZone` на заявката), плюс `start.timeZone`.
- **Повтарящи се:** при `singleEvents=true` всяка инстанция е отделен обект със собствен `id` (напр. `abc123_20261103T080000Z`), `recurringEventId` (id на серията) и `originalStartTime` ([Recurring events][recur]). Преместена инстанция (изключение) пази `originalStartTime`, но има нов `start`. За `external_id` използваме `id` на инстанцията — той е уникален в рамките на календара; за уникалност в кеша ключът е `(calendar_id, external_id)`, защото едно и също събитие с поканени може да се появи с различни id в два календара (`iCalUID` е общ между копията; виж по-долу).
- **Дублиране между календари:** покана за събитие „puts a copy of that event on their calendar“ ([Sharing concepts][sharing]). Ако мама покани тате, събитието ще дойде и от двата календара. Дедупликация по `iCalUID` (общ за всички копия и за всички инстанции на серия; при инстанции комбинираме с `originalStartTime`) е евтина и си струва за дашборда.
- **Статус:** `confirmed` (default), `tentative`, `cancelled`. Без `showDeleted` отменени не се връщат; защитно филтрираме `status !== 'cancelled'`.
- **Поверителност:** с роля `reader` виждаме детайлите; при `visibility=private` детайлите са видими само за `writer`+ ([Sharing concepts][sharing]) — такива събития ще идват без заглавие/като заети; приемливо.
- Полезни полета за дашборда: `summary` (заглавие), `location`, `htmlLink`, `updated`, `eventType`, `transparency` (`transparent` = не блокира време).

### 2.2 Кой календар и какъв цвят

- **Принадлежност:** `events.list` е винаги за един `calendarId`, затова я знаем от заявката. В самото събитие няма поле „calendarId“; `organizer.email` обикновено съвпада с календара за собствени събития, но при покани е имейлът на поканилия — не е надежден индикатор ([Event resource][eres]). → `calendar_name` се попълва от нашата конфигурация за дадения `calendarId`.
- **Цвят на календар:** `CalendarList` пази **потребителски** настройки — „different users can have different colors set for the same calendar“ ([Events & calendars concepts][concepts]). `calendarList` entry има `colorId` (индекс в `colors.calendar`) и `backgroundColor`/`foregroundColor` в hex ([CalendarList resource][clres]; [Colors resource][colors]). Това е цветът, който *SA* е задал, не този на мама в нейния телефон — няма API, с което да прочетем нейния. → **Цветът на календара е наша конфигурация** (напр. `color` в `GOOGLE_CALENDARS` или в бъдеща таблица `calendar_source`), което така или иначе трябва да пасне на дизайн-токените на дашборда.
- **Цвят на събитие:** `event.colorId` е индекс в `colors.event` (`colors.get`), задава се ръчно от потребителя за отделно събитие ([Event resource][eres]; [Colors resource][colors]). Може да го пазим за по-късно, но за MVP не е нужен.

## 3. Квоти, честота и `syncToken`

### 3.1 Квоти ([Quota][quota]; [Errors][errors])

- 10 000 заявки/мин на проект; 600 заявки/мин на потребител на проект (за SA — самият SA); sliding window. Безплатно до 1 000 000 заявки/ден на проект (праг, не квота; не може да се увеличава). Страницата отбелязва, че превишаването на лимитите „is planned to incur charges … later in 2026“ — при нашия обем е без значение.
- При превишаване: `403`/`429 usageLimits` / `rateLimitExceeded` → truncated exponential backoff `min(2^n + random(0..1000 ms), 32–64 s)`; препоръчва се и разсейване на планираните синхронизации с ±25 % ([Quota][quota]).
- Други грешки за обработка: `401` (невалиден токен — библиотеката подновява сама; при SA „confirm the setup steps“), `404 notFound` (включително когато SA **няма достъп** до календара — т.е. някой е спрял споделянето; документацията препоръчва backoff, но за нас е по-полезно да логнем и да маркираме календара като недостъпен), `410 fullSyncRequired` (само при `syncToken`), `500` → retry с backoff ([Errors][errors]).
- „Calendar usage limits exceeded“ (`403 quotaExceeded`) е отделен продуктов лимит на Calendar, не API квота ([Errors][errors]) — за read-only четене на 3–5 календара не е реалистичен.

### 3.2 Разумна честота

Бюджет: N календара × (1–2 страници) на синхронизация. При N = 5 и cron на всеки 5 минути: ≈ 10 заявки / 5 мин ≈ 2/мин ≈ 2 900/ден — ~0,3 % от безплатния дневен праг и ~0,3 % от минутния лимит на потребител. Може спокойно да е и на 1–2 минути (≈ 14 000/ден), но за кухненски дашборд **5 минути** е добър баланс; добавяме jitter (±25 %, както препоръчва Google) и ръчен endpoint `POST /sync/calendar` за „обнови сега“.

Push notifications (`events.watch`) биха елиминирали polling-а, но изискват публичен HTTPS webhook с валиден сертификат, канали, които изтичат и трябва да се подновяват, и доставката не е 100 % надеждна, така че периодичен sync пак е нужен ([Push][push]). Имаме Cloudflare Tunnel, но зад Cloudflare Access с имейл PIN ([concept.md](../concept.md)) — webhook-ът би трябвало да е изключение от Access. Не за MVP.

### 3.3 `syncToken` срещу пълно презареждане

Как работи ([Sync guide][sync]; [events.list][elist]): първоначален `list` → пазим `nextSyncToken` (от последната страница); после `list?syncToken=…` връща само промените, вкл. изтритите (`status=cancelled`); при `410 GONE` чистим локалния кеш и правим пълен sync.

Ограничения, които го правят неподходящ за нашия случай:

- `syncToken` **не може да се комбинира** с `timeMin`, `timeMax`, `orderBy`, `q`, `updatedMin` и др. ([events.list][elist]). Т.е. incremental sync е за *целия* календар (или прозорец, фиксиран при първоначалния sync, който не се движи напред с дните). Нашият прозорец е плаващ („днес + 7“), така че или трябва да държим целия календар локално и да филтрираме, или периодично да правим нов пълен sync така или иначе.
- Всички заявки трябва да са с еднакъв набор параметри; при `singleEvents=true` трябва да обработваме и `cancelled` инстанции, `recurringEventId` промени и пр. — повече състояние и повече крайни случаи.
- Ползата е по-малко трафик — нерелевантна при ~2 заявки/мин.

**Препоръка:** за MVP — пълно презареждане на прозореца на всеки sync: `DELETE … WHERE calendar_id = ? ; INSERT …` в една транзакция (или `upsert` по `(calendar_id, external_id)` + изтриване на липсващите). Това съвпада с бележката в concept.md: „кеш от Google Calendar, презаписва се при синхронизация“. `syncToken` остава опция, ако някога искаме да кешираме повече от 8 дни.

## 4. npm клиент

Данни от npm registry (2026-10-25) и README-тата на библиотеките:

| Пакет | Версия | unpacked | deps | Node | Модул |
|---|---|---|---|---|---|
| `googleapis` | 188.0.0 (2026-10-22) | **≈ 246 MB**, 2 243 файла | `googleapis-common`, `google-auth-library` | ≥ 22 | CJS (`main: build/src/index.js`, без `type: module`/`exports`), `.d.ts` включени |
| `@googleapis/calendar` | 20.1.0 | ≈ 0,84 MB, 15 файла | `googleapis-common` (→ `google-auth-library`, `gaxios`) | ≥ 22 | CJS + `.d.ts` |
| `google-auth-library` | 11.3.1 (2026-10-15) | ≈ 0,78 MB, 141 файла | `gaxios`, `jws`, `gcp-metadata`, … | ≥ 22 | CJS + `.d.ts` |

Източници: [npm googleapis][npm-gapis], [npm @googleapis/calendar][npm-cal], [npm google-auth-library][npm-gal], [googleapis README][gapis], [google-auth-library README][gal].

Факти от README на `googleapis` ([gapis]): библиотеката е „considered complete and in maintenance mode“ (само критични бъгове и security); „If you need to reduce startup times, you can alternatively install a submodule as its own dependency“ (`@googleapis/<api>`); написана е на TypeScript с типове в namespace `calendar_v3`. Поддържа текущите LTS версии на Node. Service account auth минава през `GoogleAuth({ keyFile, scopes })` или `JWT`.

Факти от README на `google-auth-library` ([gal]): JWT клиент от JSON ключа — `new JWT({ email: keys.client_email, key: keys.private_key, scopes })`, после `client.fetch(url)` (връща `res.data`, с автоматично подновяване на токена); алтернативно `GoogleAuth` чете `GOOGLE_APPLICATION_CREDENTIALS`; ключът може да се подаде и като JSON в env променлива (примерът с `$CREDS`). README предупреждава да валидираме credential JSON, идващ отвън — при нас идва от собствен secret.

**Препоръка за `apps/api`:** `google-auth-library` + тънък REST модул (локално в `apps/api/src/integrations/google-calendar/`):

- Нужни са ни **два** endpoint-а (`events.list`, евентуално `calendarList.insert` еднократно). Типовете за отговора са ~40 реда и ги пишем сами (или ги взимаме от `calendar_v3.Schema$Event` на `@googleapis/calendar` като `devDependency` само за типове, ако предпочитаме да не ги дублираме).
- Избягваме 246 MB `googleapis` в образа и неговия auth-wrapping; `@googleapis/calendar` е приемлив втори избор (малък, същите типове, но е още един слой код в maintenance mode върху същия `gaxios`).
- И двете опции са CJS без `exports` — работят от ESM Fastify чрез default/named import interop в Node 22 (`import { JWT } from 'google-auth-library'` се резолва чрез cjs-module-lexer; при проблем — `import pkg from …; const { JWT } = pkg`). Да се провери при първия build с реалната `tsconfig`/`moduleResolution` на `apps/api`.
- `gaxios` (транспортът под `client.fetch`) има вграден retry само ако го конфигурираме; за backoff при 403/429/5xx добавяме 3–4 опита с експоненциално изчакване около нашата функция `listEvents`.

## 5. Минимален код-път (TypeScript, ESM, без `googleapis`)

```ts
// apps/api/src/integrations/google-calendar/client.ts
import { JWT } from 'google-auth-library';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const BASE = 'https://www.googleapis.com/calendar/v3';

export interface GoogleEventDateTime { date?: string; dateTime?: string; timeZone?: string }
export interface GoogleEvent {
  id: string;
  iCalUID?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  location?: string;
  htmlLink?: string;
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
  recurringEventId?: string;
  originalStartTime?: GoogleEventDateTime;
  eventType?: string;
  transparency?: 'opaque' | 'transparent';
  updated?: string;
}
interface EventsPage { items?: GoogleEvent[]; nextPageToken?: string; summary?: string; timeZone?: string }

export function createCalendarClient(serviceAccountJson: string) {
  const keys = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string };
  const auth = new JWT({ email: keys.client_email, key: keys.private_key, scopes: [SCOPE] });

  async function listEvents(calendarId: string, timeMin: Date, timeMax: Date, timeZone: string) {
    const all: GoogleEvent[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        timeZone,
        maxResults: '250',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const url = `${BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
      const res = await auth.fetch<EventsPage>(url); // access token obtained/refreshed automatically
      all.push(...(res.data.items ?? []));
      pageToken = res.data.nextPageToken;
    } while (pageToken);
    return all.filter((e) => e.status !== 'cancelled');
  }

  return { listEvents };
}
```

```ts
// apps/api/src/integrations/google-calendar/sync.ts (sketch)
import type { GoogleEvent } from './client.js';

export interface CalendarSource { id: string; name: string; color: string } // from env/config

export function toCalendarEventRow(source: CalendarSource, e: GoogleEvent) {
  const allDay = Boolean(e.start.date);
  return {
    calendar_id: source.id,
    external_id: e.id,                     // unique within the calendar; recurring instances have their own id
    ical_uid: e.iCalUID ?? null,           // for de-duplicating invitation copies across calendars
    title: e.summary ?? '(без заглавие)',
    start: allDay ? e.start.date! : e.start.dateTime!,   // 'yyyy-mm-dd' or RFC3339
    end: allDay ? e.end.date! : e.end.dateTime!,         // end is exclusive in both cases
    all_day: allDay,
    calendar_name: source.name,
  };
}

export async function syncCalendars(deps: {
  sources: CalendarSource[];
  listEvents: (id: string, min: Date, max: Date, tz: string) => Promise<GoogleEvent[]>;
  replaceEvents: (calendarId: string, rows: ReturnType<typeof toCalendarEventRow>[]) => Promise<void>; // one transaction
  now?: () => Date;
}) {
  const tz = 'Europe/Sofia';
  const start = startOfDayIn(tz, deps.now?.() ?? new Date()); // Intl/Temporal helper; the container runs in UTC
  const end = new Date(start.getTime() + 8 * 24 * 60 * 60 * 1000);
  for (const source of deps.sources) {
    const events = await withBackoff(() => deps.listEvents(source.id, start, end, tz)); // 403/429/5xx -> retry
    await deps.replaceEvents(source.id, events.map((e) => toCalendarEventRow(source, e)));
  }
}
```

Бележки:

- Конфигурация: `GOOGLE_SERVICE_ACCOUNT_JSON` (цялото съдържание на ключа, като в примера с `$CREDS` в README) или `GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/google-sa.json` + `GoogleAuth`; `GOOGLE_CALENDARS='[{"id":"mama@gmail.com","name":"Мама","color":"#..."}]'`.
- `(calendar_id, external_id)` е уникалният ключ; concept.md изброява само `external_id` — предлагаме да добавим `calendar_id` (и по желание `ical_uid`) към `calendar_event`, за да не се блъскат копия на едно събитие от два календара.
- Cron: `setInterval`/`node-cron` във Fastify plugin с jitter; плюс `POST /sync/calendar` за ръчно задействане (n8n също може да го вика, ако предпочетем крон там — concept.md още споменава n8n за синхронизациите; ticket-ът казва, че API-то ще полва само).
- Еднократен helper (или `curl` в checklist-а) за `calendarList.insert`, ако решим да ползваме `calendarList.list`; за MVP не е нужен.
- Тест: unit за `toCalendarEventRow` (целодневно, с час, инстанция на серия, отменено), интеграционен с mock на `fetch` за пагинацията.

## 6. Ръчни стъпки за човека (provisioning checklist)

1. **Google Cloud проект:** console.cloud.google.com → IAM & Admin → Create a Project (напр. `family-dashboard`). Billing не е нужен.
2. **Включи Calendar API:** APIs & Services → Library → Google Workspace → Calendar API → Enable (или `gcloud services enable calendar-json.googleapis.com`).
3. **Създай service account:** IAM & Admin → Service Accounts → Create service account (напр. `family-calendar-reader`); без роли; Done. Запиши имейла `family-calendar-reader@<project-id>.iam.gserviceaccount.com`.
4. **JSON ключ:** отвори SA → Keys → Add key → Create new key → JSON → Create. Сваля се веднъж; сложи го като Docker secret / `GOOGLE_SERVICE_ACCOUNT_JSON` на сървъра; не го качвай в git.
5. **Сподели всеки семеен календар със SA имейла:** Google Calendar (уеб) → My calendars → ⋮ → Settings and sharing → Shared with → Add people and groups → имейла на SA → „See event details“ → Send. Повтори от акаунта на всеки член (всеки споделя своя календар; за вторични календари — същото от собственика им).
6. **Запиши Calendar ID-тата:** за първичен календар = Gmail адресът; за вторичен — Settings and sharing → Integrate calendar → Calendar ID. Попълни `GOOGLE_CALENDARS` (id, име за показване, цвят).
7. **Smoke test** (2 мин, потвърждава, че SA вижда consumer Gmail календар): с ключа изпълни `events.list` за един календар за следващите 7 дни (например скрипт `pnpm --filter api calendar:probe` или `curl` с токен от `gcloud auth print-access-token --impersonate-service-account=…`). Очакван резултат: `items[]` със събития; `404 notFound` означава, че календарът не е споделен със SA (или ID-то е грешно).
8. (По избор) Ако искаме `calendarList.list` да работи за SA: еднократно `POST /users/me/calendarList {"id": "<calendarId>"}` със scope `calendar.calendarlist` за всеки календар.

## Източници

- Events: list — <https://developers.google.com/workspace/calendar/api/v3/reference/events/list>
- Events resource — <https://developers.google.com/workspace/calendar/api/v3/reference/events>
- Recurring events guide — <https://developers.google.com/workspace/calendar/api/guides/recurringevents>
- Calendars & events concepts — <https://developers.google.com/workspace/calendar/api/concepts/events-calendars>
- Sharing concepts — <https://developers.google.com/workspace/calendar/api/concepts/sharing>
- CalendarList resource / list / insert — <https://developers.google.com/workspace/calendar/api/v3/reference/calendarList>, <https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list>, <https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/insert>
- Colors resource — <https://developers.google.com/workspace/calendar/api/v3/reference/colors>
- Scopes — <https://developers.google.com/workspace/calendar/api/auth>
- Quota — <https://developers.google.com/workspace/calendar/api/guides/quota>
- Errors — <https://developers.google.com/workspace/calendar/api/guides/errors>
- Sync — <https://developers.google.com/workspace/calendar/api/guides/sync>
- Push — <https://developers.google.com/workspace/calendar/api/guides/push>
- Create project / Enable APIs / Create credentials — <https://developers.google.com/workspace/guides/create-project>, <https://developers.google.com/workspace/guides/enable-apis>, <https://developers.google.com/workspace/guides/create-credentials>
- IAM: create SA / keys / overview — <https://docs.cloud.google.com/iam/docs/service-accounts-create>, <https://docs.cloud.google.com/iam/docs/keys-create-delete>, <https://docs.cloud.google.com/iam/docs/service-account-overview>
- Google Calendar Help: share — <https://support.google.com/calendar/answer/37082>
- google-auth-library README — <https://github.com/googleapis/google-auth-library-nodejs/blob/main/README.md>
- googleapis README — <https://github.com/googleapis/google-api-nodejs-client/blob/main/README.md>
- npm: googleapis 188.0.0, @googleapis/calendar 20.1.0, google-auth-library 11.3.1 — <https://registry.npmjs.org/>

[elist]: https://developers.google.com/workspace/calendar/api/v3/reference/events/list
[eres]: https://developers.google.com/workspace/calendar/api/v3/reference/events
[recur]: https://developers.google.com/workspace/calendar/api/guides/recurringevents
[concepts]: https://developers.google.com/workspace/calendar/api/concepts/events-calendars
[sharing]: https://developers.google.com/workspace/calendar/api/concepts/sharing
[clres]: https://developers.google.com/workspace/calendar/api/v3/reference/calendarList
[clinsert]: https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/insert
[colors]: https://developers.google.com/workspace/calendar/api/v3/reference/colors
[scopes]: https://developers.google.com/workspace/calendar/api/auth
[quota]: https://developers.google.com/workspace/calendar/api/guides/quota
[errors]: https://developers.google.com/workspace/calendar/api/guides/errors
[sync]: https://developers.google.com/workspace/calendar/api/guides/sync
[push]: https://developers.google.com/workspace/calendar/api/guides/push
[proj]: https://developers.google.com/workspace/guides/create-project
[enable]: https://developers.google.com/workspace/guides/enable-apis
[cred]: https://developers.google.com/workspace/guides/create-credentials
[sacreate]: https://docs.cloud.google.com/iam/docs/service-accounts-create
[keys]: https://docs.cloud.google.com/iam/docs/keys-create-delete
[saov]: https://docs.cloud.google.com/iam/docs/service-account-overview
[share]: https://support.google.com/calendar/answer/37082
[gal]: https://github.com/googleapis/google-auth-library-nodejs/blob/main/README.md
[gapis]: https://github.com/googleapis/google-api-nodejs-client/blob/main/README.md
[npm-gapis]: https://www.npmjs.com/package/googleapis
[npm-cal]: https://www.npmjs.com/package/@googleapis/calendar
[npm-gal]: https://www.npmjs.com/package/google-auth-library
