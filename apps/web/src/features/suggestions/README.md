# suggestions — предложения за рецепти

## Overview
„Поискай предложения“: форма за заявка (слотове, време, тагове, подсказка, по избор ястие от менюто, чийто разговор чете агентът), изчакване и резултат с карти и преглед на едно предложение с редакция, одобрение или отхвърляне през `RecipeForm`. Прегледът (`ReviewSuggestion`, `Decided`, `DecisionToast`) е общ с `features/recipe-import`.

## Interface
- `SuggestScreen.tsx:SuggestScreen`, `SuggestScreen.tsx:parseSuggestSearch`, `SuggestSearch` — `/recipes/suggest`
- `SuggestionRequestView.tsx:SuggestionRequestView` — `/recipes/suggest/$requestId`
- `SuggestionReview.tsx:SuggestionReview`, `ReviewSuggestion`, `Decided` — `/recipes/suggest/$requestId/$suggestionId` и общият преглед
- `SuggestForm.tsx:SuggestForm`, `SuggestionCard.tsx:SuggestionCard`, `RecentRequests.tsx:RecentRequests`, `DecisionToast.tsx:DecisionToast` — форма, карта, последни заявки, toast след решение
- `queries.ts:suggestionKeys`, `paramsOf`, `useRecentRequests`, `useRequestSuggestions`, `useSuggestionRequest`, `useApproveSuggestion`, `useRejectSuggestion`, `useRestoreSuggestion` — слой за данни
- `request-search.ts:parseRequestSearch`, `searchId`, `RequestSearch`; `messages.ts:requestLabel`, `slotLabel`, `searchedLabel`, `REQUEST_STATUS_LABELS`; `suggestion-form-values.ts:suggestionToFormValues`, `importToFormValues` — search, надписи, стойности на формата

## Invariants
- `queries.ts:useSuggestionRequest` — проверява на `POLL_INTERVAL_MS` само докато е `pending`
- `queries.ts:requestKeyOf` — след решение се инвалидира `importKeys.all` при произход `import`, иначе заявката
- `SuggestForm.tsx:submit` — без слот не се праща; празните полета не се включват
- `SuggestScreen.tsx:parseSuggestSearch` — ястие (`mealId`) има само с деня си (`mealDate`); формата праща `mealId`, докато редът „За ястието от …“ не е махнат с „Махни“
- `SuggestionReview.tsx:SuggestionReview` — преглед само при статус `proposed`, иначе `Decided`
- `SuggestionReview.tsx:ReviewSuggestion` — „Одобри“ е изключен само докато тече търсенето на продуктите (`useResolvedIngredients`); при несвързан ред `RecipeForm` (`requireResolvedIngredients`) отваря листа му вместо да праща; при рецепта със същото заглавие основното действие е „Отвори“; `revisionId` се праща само при приета поправка; „Без уред“ се праща изрично като `appliance: null`, иначе api-то взима уреда на предложението
- `SuggestionReview.tsx:ReviewSuggestion` — „✏️ Поправи с AI“ снима формата (`toRevisableRecipe` → `revisionBaseOf`) и отваря `ReviseSheet` с цел `suggestionId`; приетата поправка влиза във формата през `revisionReplacement`
- `DecisionToast.tsx:DecisionToast` — след „Отвори“ (`leaving` ref) не чисти search-а
- `SuggestionCard.tsx:DINNER_AHEAD_MINUTES` — вечеря над 6 часа показва „иска подготовка от предния ден“

## Side Effects
- `queries.ts:useRecentRequests` — GET `/api/recipe-suggestions/requests?limit=10`
- `queries.ts:useRequestSuggestions`, `useSuggestionRequest` — POST `/api/recipe-suggestions/requests`, GET `/api/recipe-suggestions/requests/:id`
- `queries.ts:useApproveSuggestion`, `useRejectSuggestion`, `useRestoreSuggestion` — POST `/api/recipe-suggestions/:id/approve`, `.../reject`, `.../restore`
- `SuggestionReview.tsx:useResolvedIngredients` — търсене на продукти през `features/recipes`
- `SuggestionReview.tsx:ReviewSuggestion` — GET `/api/recipes` (`useRecipes({})`) за рецепта със същото заглавие; POST `/api/recipe-suggestions/:id/revisions` през `ReviseSheet`
- `SuggestionRequestView.tsx:RequestDecisionToast` — navigate с replace, който чисти `?rejected`/`?approved`

## Verification
- Run: `pnpm --filter web test src/features/suggestions`
