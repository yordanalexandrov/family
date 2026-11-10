# menu — менюто на седмицата

## Overview
Екранът „Меню“ (`/menu`): план на седмицата, предложение на AI, преработка на менюто, гласове, разговор за ястието, лист на деня като преглед от редове, замяна, размяна и влачене на ястия, добавяне в списъка за пазаруване и „Как мина?“. `queries.ts`, `reworks.ts` и `replacements.ts` държат заявките към `/api/menu/*`, а `unseen-proposals.ts` помни невидените предложения за всеки действащ потребител.

## Interface
- `queries.ts:menuKeys` — ключове `all`, `plan`, `thread`, `proposal`, `weekProposal`, `weekRework`, `weekReworks`, `plans`
- `queries.ts:usePlan`, `useCreatePlan`, `useDeletePlan` — план на седмицата (`null` при `no_plan`)
- `queries.ts:useUpdateMeal`, `useRestoreMeal`, `useVote`, `VoteChange`, `useSwapMeals`, `MealSwap`, `swapDates` — ястие, „Върни“, глас, размяна
- `queries.ts:useThread`, `useAddComment`, `useDeleteComment` — разговор на ястието
- `queries.ts:useProposeMenu`, `useMenuProposal`, `useWeekProposal`, `weekProposalQuery` — предложение за меню
- `reworks.ts:useRequestRework`, `useRework`, `reworkKey`, `useWeekRework` — „✨ Преработи менюто“ и последната преработка на седмицата за лентата
- `ReworkSheet.tsx:ReworkSheet` — диалогът на преработката: подсказка, преглед и чакане
- `replacements.ts:useRequestReplacement`, `useLatestReplacement`, `changedSince` — „Предложи друго“
- `unseen-proposals.ts:noteProposalChange`, `useUnseenProposalWeek`, `useSeeWeek`, `UNSEEN_PROPOSALS_KEY` — невидени предложения
- `MenuWeek.tsx:MenuWeek`, `MenuWeek.tsx:parseMenuSearch`, `MenuWeek.tsx:MenuSearch` — екранът и `?week=`, `?proposal=`, `?meal=`
- `MealRow.tsx:MealRow`, `MealRow.tsx:RowVoting`, `MealRow.tsx:mealRowId`, `MealSheet.tsx:MealSheet`, `MealSheet.tsx:RemovedRecipeToast`, `MealSheet.tsx:RemovedRecipe`, `MealReplace.tsx:MealReplace`, `MealDrag.tsx:MealDrag`, `MealDrag.tsx:DraggableMeal`, `MoveMeal.tsx:MoveMeal`, `MoveMeal.tsx:swapTargetsOf`, `MealShopping.tsx:MealShopping`, `MealFeedback.tsx:MealFeedbackSheet`, `Thread.tsx:Thread`, `Thread.tsx:systemLineText` — редове, лист на ястието и действията му
- `Votes.tsx:OUTCOME_LABELS`, `voteOf`, `OutcomeLabel`, `PersonVote`, `MyVote` — гласове и изход

## Invariants
- `queries.ts:menuKeys.thread` — разговорът е под ключа на плана, за да го стигне `menu.changed`; `menuKeys.plans` хваща само ключове с дължина 3
- `queries.ts:useVote`, `queries.ts:useSwapMeals` — оптимистични, с връщане при грешка; повторен глас със същата стойност се праща като `null` (`Votes.tsx:MyVote`)
- `queries.ts:useMenuProposal`, `queries.ts:useWeekProposal`, `replacements.ts:useLatestReplacement` — проверяват на `POLL_INTERVAL_MS` само докато са `pending`; `useWeekProposal` при `done` инвалидира плана веднъж, ако кешираният не е `planId`
- `reworks.ts:useRework`, `reworks.ts:useWeekRework` — проверяват на `POLL_INTERVAL_MS` само докато са `pending` и презареждат менюто само когато видяната `pending` стане `done` (общото е `pollRework`); `useWeekRework` дава `null` при `no_rework`
- `MenuWeek.tsx:PlanView` — докато последната преработка на седмицата е `pending` (`locked`), на всяко устройство има лента „AI преработва менюто…“, „✨ Преработи менюто“ и „Изтрий плана“ ги няма, гласовете са изключени, редовете не се влачат, а листът на ястието е без „Смени ястието“, разговорът се чете, гласът е изключен и има съобщението за преработка; готвачът и порциите остават. `failed` дава грешката в лентата, докато човек не я затвори
- `MenuWeek.tsx:PlanView` — „✨ Преработи менюто“ е само с действащ потребител, в седмица за редакция и при `replace + fill > 0` от `reworkCounts(classifyRework(...))`; `ReworkSheet` показва същото класифициране като api
- `replacements.ts:changedSince` — заявката за замяна е остаряла, ако след нея има системен ред, различен от преместване
- `unseen-proposals.ts:noteProposalChange` — предложението е невидено, ако е `done` и `requestedBy` не е действащият човек (и на крона); ключът е `family.menu.unseenProposals.<actingUserId>`, а без действащ човек (kiosk) — голият `family.menu.unseenProposals`
- `MenuWeek.tsx:MenuWeek` — редакция само на лично устройство; минала седмица е само за четене; изтриване само преди началото на седмицата
- `MenuWeek.tsx:PlanView` — филтрите `FILTERS` (`pending`/`discuss`/`replace`) са само докато менюто не е съгласувано (`isAgreed` → „Менюто е съгласувано“); миналите дни се сгъват в `PastFold` само с действащ потребител; „Как мина?“ е на интерактивно устройство, за ястие с рецепта и `date <= today`
- `MealSheet.tsx:MealSheet` — преглед от редове (спек #366): заглавието (връзка към рецептата; без рецепта — бележката, празен ден — „Още няма ястие“) и „защо“; „Става ли за теб?“ с големите 👎/👍, докато действащият човек не е гласувал (и денят не е минал или празен), иначе ред „Гласове“; после редовете Разговор, Готвач, Порции, превключвателят „В списъка за пазаруване“ (само за ястие с рецепта, не в `readOnly`) и „↻ Смени ястието“ (не на минал ден, празен ден и при `locked`). Без действащ потребител няма гласове и разговор. Празен ден вместо гласове и „Смени ястието“ има „Какво ще ядем?“ с „✨ Предложи ястие“ и другите три начина
- `MealSheet.tsx:MealSheet` — под-изгледите (Разговор, Готвач, Порции, Смени ястието) са в същия лист с „‹ Назад“; отвореният е запис в историята (`useSheetHistory`), затова „назад“ връща към прегледа, а второто „назад“ затваря листа. Изборът на готвач, успешната смяна на рецептата, размяната, бележката и „Махни ястието от деня“ връщат към прегледа; порциите остават отворени
- `MealSheet.tsx:mealChanged` — след смяна на рецептата (търсене, „Предложи друго“, празен ден), бележка и размяна заглавието светва (без анимация при `prefers-reduced-motion`), а под него за `CHANGED_MS` = 8 s е `status` „✓ Сменено (беше „…“)“ (без „беше“ на празен ден и когато заглавието не се е сменило: бележка към ястие с рецепта, размяна). „Върни“ (`useRestoreMeal`) има само след смяна на рецептата; отказът му е `ErrorBox` в листа. „Махни ястието от деня“ няма това потвърждение, а `RemovedRecipeToast` на екрана
- `MealSheet.tsx:MealSheet` — на минал ден рецептата и бележката не се сменят, а готвачът и порциите се сменят и разговорът се чете; в `readOnly` седмица не се сменят и те, а редовете им са без „›“
- `MoveMeal.tsx:swapTargetsOf` — целите на „Размени с друг ден“ са ястия от същия `slot` от днес нататък; без цели действието не се показва
- `MealDrag.tsx:DraggableMeal` — минал ден не се влачи и не е цел; `MealDrag` — задържане `TOUCH_HOLD_MS` = 200 ms при докосване
- `Thread.tsx:Thread` — изтрива се само собствен коментар; `maxLength` е `MEAL_COMMENT_MAX`
- `MealShopping.tsx:MealShopping` — превключвател (`role="switch"`), изключен без връзка с „Иска връзка“

## Side Effects
- `queries.ts:usePlan`, `useCreatePlan`, `useDeletePlan` — GET/POST `/api/menu/plans`, DELETE `/api/menu/plans/:id`; създаване и триене пишат направо в кеша
- `queries.ts:useUpdateMeal`, `useRestoreMeal`, `useVote`, `useSwapMeals` — PATCH `/api/menu/meals/:id`, POST `.../restore`, PUT/DELETE `.../vote`, POST `.../swap`; всички освен `useVote` инвалидират разговора и `queryKeys.dashboard`
- `queries.ts:useThread`, `useAddComment`, `useDeleteComment` — GET/POST `/api/menu/meals/:id/comments`, DELETE `/api/menu/comments/:id`; коментарите инвалидират плана
- `queries.ts:useProposeMenu`, `useMenuProposal`, `weekProposalQuery` — POST `/api/menu/proposals`, GET `/api/menu/proposals/:id`, GET `/api/menu/proposals?weekStart=`; `useMenuProposal` при `done` инвалидира плана и `queryKeys.dashboard`; `useProposeMenu` при 409 без `not_enough_recipes` инвалидира `weekProposal` и плана
- `reworks.ts:useRequestRework` (POST `/api/menu/reworks`, пише в кеша и `menuKeys.weekRework`), `useRework` (GET `/api/menu/reworks/:id`, при край инвалидира `menuKeys.weekRework`), `useWeekRework` (GET `/api/menu/reworks?weekStart=`); при `done` двете четения инвалидират плана, списъка за пазаруване и `queryKeys.dashboard`
- `replacements.ts:useRequestReplacement`, `useLatestReplacement` — POST/GET `/api/menu/meals/:id/replacements`
- `unseen-proposals.ts:unseenOf` — localStorage през `storedSetting`; `noteProposalChange` вика `fetchQuery`
- `MenuWeek.tsx:MenuWeek` — navigate с replace за `?meal=` и `?proposal=`; `scrollIntoView` към ястието от адреса
- `MealShopping.tsx:MealShopping` — `useShoppingWeek` и `useSetMealListed` от `features/shopping`; `MealDrag.tsx:MealDrag` — сензори на dnd-kit
- `MenuWeek.tsx:PlanView` — `useRateRecipe` от `features/recipes` за „Как беше?“ и `useShoppingWeek` за маркера 🛒
- `MealSheet.tsx:RecipePicker` — `useRecipes` (вечерни, debounce `SEARCH_DEBOUNCE_MS` = 300 ms); `useRecentRecipeIds` чете плановете на двете предходни седмици

## Verification
- Run: `pnpm --filter web test src/features/menu`
