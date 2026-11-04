# services/recipe-page

## Overview

Четенето на страница с рецепта при Внасяне на рецепта по линк и при Подобряване на рецепта. `fetch.ts` изтегля страницата или снимката с проверки срещу SSRF. `extract.ts` детерминистично вади JSON-LD Recipe или основния текст на страницата, а снимките на стъпките заменя с препратки (`s1`, `s2`, …). `index.ts` свързва двете. Агентът получава само препратките; адресите на снимките остават в API-то.

## Interface

- `index.ts:readRecipePage, RecipePage` – изтегля и извлича страницата: крайния URL и рецептата (JSON-LD или текст) със `stepImages`, или `failure`/`reason`. Страница без JSON-LD и с празен текст е `fetch_failed`/`empty_page`. Никога не хвърля.
- `index.ts` реекспортира `StepImages` от `extract.ts` и `fetchImage`, `FetchedImage` от `fetch.ts`.
- `fetch.ts:fetchPage, FetchedPage, PageFetchFailure, FetchReason` – изтегля страница; провалът е `fetch_blocked` или `fetch_failed`.
- `fetch.ts:fetchImage, FetchedImage` – изтегля снимка на стъпка по същите правила; `signal` я прекъсва заедно с изпълнението.
- `extract.ts:extractRecipe, ExtractedRecipe, StepImages` – рецептата от HTML.
- `extract.ts:decodeHtml` – байтовете като текст в charset от `Content-Type`, `<meta charset>` или UTF-8 (вкл. windows-1251).
- `extract.ts:PAGE_TEXT_MAX, STEP_IMAGES_MAX` – 12 000 знака текст и 40 препратки към снимки най-много.

## Invariants

- `fetch.ts:isPublicAddress` (коментар) – връзка се позволява само към публични адреси. Отказват се loopback, частни, link-local (cloud metadata), CGNAT, документационни, multicast и unspecified, включително IPv4-mapped/compatible IPv6. Списъкът `PRIVATE` блокира и NAT64 (`64:ff9b::/96`), discard (`100::/64`), benchmark (`198.18.0.0/15`), reserved (`240.0.0.0/4`) и `192.0.0.0/24`. API-то е в host мрежата на домашния сървър (ADR-0005).
- `fetch.ts:guardedLookup` – DNS се резолвира веднъж, всички адреси се проверяват и socket-ът получава точно проверените адреси (втори DNS отговор не може да ги подмени).
- `fetch.ts:fetchPage` – само `http`/`https`, проверка на адреса на всеки hop, най-много `MAX_REDIRECTS` (3) пренасочвания (пази се крайният URL), `MAX_PAGE_BYTES` (2 MB) след декомпресия, `TIMEOUT_MS` (10 s). Не чете robots.txt и не заобикаля bot check.
- `fetch.ts:BLOCKING_STATUSES, CHALLENGE_TITLE` – 403, 406, 429, заглавката `cf-mitigated: challenge` и страниците с bot check на CDN-ите дават `fetch_blocked` (тогава човекът поставя текста ръчно). `CHALLENGE_TITLE` се търси само в първите 4096 знака и само във `fetchPage`.
- `fetch.ts:fetchImage` – същите правила, най-много `STEP_PHOTO_MAX_BYTES` (10 MB); декларираният тип, който не е картинка, дава `not_image`.
- `fetch.ts:PAGE_USER_AGENT` – API-то се представя честно, с линк към проекта, а не като браузър.
- `extract.ts:extractRecipe` – намира schema.org `Recipe` и в `@graph`, в масив, в `mainEntity` и при `@type` масив; приема го само с `recipeIngredient` или `ingredients`, иначе минава към текста. JSON-LD със сурови контролни знаци в низовете се поправя (`parseJsonLd`). Пази само `RECIPE_FIELDS`, а `HowToSection` остават именувани групи `{ section, steps }`; адресът от `HowToStep.image` отива в `stepImages`, никога в JSON-LD.
- `extract.ts:extractRecipe` – без JSON-LD взима основния текст (`mainElement`: `<article>` с поне 300 знака четим текст, иначе `<main>`, иначе `<body>`) без скриптове, навигация, header, footer и странични колони. Текстът се изрязва до `PAGE_TEXT_MAX`, от `BEFORE_INGREDIENTS` (1000) знака преди заглавието на продуктите (`INGREDIENTS_HEADING`: „Продукти“, „Съставки“, „Ingredients“, „Zutaten“, „Ingrédients“, „Ingredienti“), а снимките стават маркери `[снимка sN]`.
- `extract.ts:PHOTO_MIN_SIZE, NOT_A_PHOTO_CLASS, NOT_A_PHOTO_NAME` – иконки, аватари, лога, звездички за рейтинг и проследяващи пиксели не са снимки на стъпки.
- След `STEP_IMAGES_MAX` (`extract.ts`) стъпката остава текст: една страница не може да накара внасянето да изтегли стотици снимки.

## Side Effects

- Мрежа: HTTP(S) `GET` към сайта на рецептата и към адресите на снимките (`fetch.ts:fetchPage, fetchImage`), включително DNS заявки.
- `extract.ts` – None (чисто парсване с `parse5`).

## Verification

- Run: `pnpm --filter api test src/services/recipe-page`
