# menu — менюто на седмицата

## Overview
Екранът „Меню“ (`/menu`): план на седмицата, предложение на AI, преработка на менюто, гласове, разговор за ястието, замяна, размяна и влачене на ястия, добавяне в списъка за пазаруване и „Как мина?“. `queries.ts` и `replacements.ts` държат заявките към `/api/menu/*`, а `unseen-proposals.ts` помни невидените предложения за всеки действащ потребител.

## Interface
- `queries.ts:menuKeys` — ключове `all`, `plan`, `thread`, `proposal`, `weekProposal`, `plans`
- `queries.ts:usePlan`, `useCreatePlan`, `useDeletePlan` — план на седмицата (`null` при `no_plan`)
- `queries.ts:useUpdateMeal`, `useRestoreMeal`, `useVote`, `VoteChange`, `useSwapMeals`, `MealSwap`, `swapDates` — ястие, „Върни“, глас, размяна
- `queries.ts:useThread`, `useAddComment`, `useDeleteComment` — разговор на ястието
- `queries.ts:useProposeMenu`, `useMenuProposal`, `useWeekProposal`, `weekProposalQuery` — предложение за меню
- `reworks.ts:useRequestRework`, `useRework`, `reworkKey` — „✨ Преработи менюто“
- `ReworkSheet.tsx:ReworkSheet` — диалогът на преработката: подсказка, преглед и чакане
- `replacements.ts:useRequestReplacement`, `useLatestReplacement`, `changedSince` — „Предложи друго“
- `unseen-proposals.ts:noteProposalChange`, `useUnseenProposalWeek`, `useSeeWeek`, `UNSEEN_PROPOSALS_KEY` — невидени предложения
- `MenuWeek.tsx:MenuWeek`, `MenuWeek.tsx:parseMenuSearch`, `MenuWeek.tsx:MenuSearch` — екранът и `?week=`, `?proposal=`, `?meal=`
- `MealRow.tsx:MealRow`, `MealRow.tsx:RowVoting`, `MealRow.tsx:mealRowId`, `MealSheet.tsx:MealSheet`, `MealSheet.tsx:RemovedRecipeToast`, `MealSheet.tsx:RemovedRecipe`, `MealReplace.tsx:MealReplace`, `MealDrag.tsx:MealDrag`, `MealDrag.tsx:DraggableMeal`, `MoveMeal.tsx:MoveMeal`, `MealShopping.tsx:MealShopping`, `MealFeedback.tsx:MealFeedbackSheet`, `Thread.tsx:Thread` — редове, лист на ястието и действията му
- `Votes.tsx:OUTCOME_LABELS`, `voteOf`, `OutcomeLabel`, `PersonVote`, `MyVote` — гласове и изход

## Invariants
- `queries.ts:menuKeys.thread` — разговорът е под ключа на плана, за да го стигне `menu.changed`; `menuKeys.plans` хваща само ключове с дължина 3
- `queries.ts:useVote`, `queries.ts:useSwapMeals` — оптимистични, с връщане при грешка; повторен глас със същата стойност се праща като `null` (`Votes.tsx:MyVote`)
- `queries.ts:useMenuProposal`, `queries.ts:useWeekProposal`, `replacements.ts:useLatestReplacement` — проверяват на `POLL_INTERVAL_MS` само докато са `pending`; `useWeekProposal` при `done` инвалидира плана веднъж, ако кешираният не е `planId`
- `reworks.ts:useRework` — проверява на `POLL_INTERVAL_MS` само докато е `pending`
- `MenuWeek.tsx:PlanView` — „✨ Преработи менюто“ е само с действащ потребител, в седмица за редакция и при `replace + fill > 0` от `reworkCounts(classifyRework(...))`; `ReworkSheet` показва същото класифициране като api
- `replacements.ts:changedSince` — заявката за замяна е остаряла, ако след нея има системен ред, различен от преместване
- `unseen-proposals.ts:noteProposalChange` — предложението е невидено, ако е `done` и `requestedBy` не е действащият човек (и на крона); ключът е `family.menu.unseenProposals.<actingUserId>`, а без действащ човек (kiosk) — голият `family.menu.unseenProposals`
- `MenuWeek.tsx:MenuWeek` — редакция само на лично устройство; минала седмица е само за четене; изтриване само преди началото на седмицата
- `MenuWeek.tsx:PlanView` — филтрите `FILTERS` (`pending`/`discuss`/`replace`) са само докато менюто не е съгласувано (`isAgreed` → „Менюто е съгласувано“); миналите дни се сгъват в `PastFold` само с действащ потребител; „Как мина?“ е на интерактивно устройство, за ястие с рецепта и `date <= today`
- `MealSheet.tsx:MealSheet` — на минал ден рецептата и бележката не се сменят, а готвачът и порциите се сменят; в `readOnly` седмица не се сменят и те
- `MoveMeal.tsx:MoveMeal` — целите са ястия от същия `slot` от днес нататък; без цели не се показва
- `MealDrag.tsx:DraggableMeal` — минал ден не се влачи и не е цел; `MealDrag` — задържане `TOUCH_HOLD_MS` = 200 ms при докосване
- `Thread.tsx:Thread` — изтрива се само собствен коментар; `maxLength` е `MEAL_COMMENT_MAX`
- `MealShopping.tsx:MealShopping` — изключен без връзка

## Side Effects
- `queries.ts:usePlan`, `useCreatePlan`, `useDeletePlan` — GET/POST `/api/menu/plans`, DELETE `/api/menu/plans/:id`; създаване и триене пишат направо в кеша
- `queries.ts:useUpdateMeal`, `useRestoreMeal`, `useVote`, `useSwapMeals` — PATCH `/api/menu/meals/:id`, POST `.../restore`, PUT/DELETE `.../vote`, POST `.../swap`; всички освен `useVote` инвалидират разговора и `queryKeys.dashboard`
- `queries.ts:useThread`, `useAddComment`, `useDeleteComment` — GET/POST `/api/menu/meals/:id/comments`, DELETE `/api/menu/comments/:id`; коментарите инвалидират плана
- `queries.ts:useProposeMenu`, `useMenuProposal`, `weekProposalQuery` — POST `/api/menu/proposals`, GET `/api/menu/proposals/:id`, GET `/api/menu/proposals?weekStart=`; `useMenuProposal` при `done` инвалидира плана и `queryKeys.dashboard`; `useProposeMenu` при 409 без `not_enough_recipes` инвалидира `weekProposal` и плана
- `reworks.ts:useRequestRework`, `useRework` — POST `/api/menu/reworks`, GET `/api/menu/reworks/:id`; `useRework` при `done` инвалидира плана, списъка за пазаруване и `queryKeys.dashboard`
- `replacements.ts:useRequestReplacement`, `useLatestReplacement` — POST/GET `/api/menu/meals/:id/replacements`
- `unseen-proposals.ts:unseenOf` — localStorage през `storedSetting`; `noteProposalChange` вика `fetchQuery`
- `MenuWeek.tsx:MenuWeek` — navigate с replace за `?meal=` и `?proposal=`; `scrollIntoView` към ястието от адреса
- `MealShopping.tsx:MealShopping` — `useShoppingWeek` и `useSetMealListed` от `features/shopping`; `MealDrag.tsx:MealDrag` — сензори на dnd-kit
- `MenuWeek.tsx:PlanView` — `useRateRecipe` от `features/recipes` за „Как беше?“ и `useShoppingWeek` за маркера 🛒
- `MealSheet.tsx:RecipePicker` — `useRecipes` (вечерни, debounce `SEARCH_DEBOUNCE_MS` = 300 ms); `useRecentRecipeIds` чете плановете на двете предходни седмици

## Verification
- Run: `pnpm --filter web test src/features/menu`
