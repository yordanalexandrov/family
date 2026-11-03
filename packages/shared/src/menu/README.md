# menu

## Overview

Чистата логика на Седмичното меню: седмицата от понеделник до неделя, гласовете за ястие и съгласието по менюто, порциите и системните редове в Разговора на ястието. Схемите на API-то за менюто са в [../schemas/README.md](../schemas/README.md).

## Interface

- `week.ts:MENU_SLOTS`, `MenuSlot` — слотовете на деня.
- `week.ts:weekdayOf`, `weekdayName`, `isWeekStart`, `weekStartOf`, `daysOfWeek`, `hasWeekStarted` — помощни функции за седмицата.
- `meal.ts:mealTitle`, `MealContent`, `isEmptyMeal` — заглавие на ястие (рецептата, иначе бележката) и проверка за празно ястие.
- `meal.ts:oneServingEach`, `isOneServingEach`, `totalServings` — порциите по подразбиране (по една на човек), проверка за тях и сбор.
- `votes.ts:voteValueSchema`, `VoteValue`, `voteSchema`, `Vote` — глас `up` или `down` на потребител.
- `votes.ts:MEAL_OUTCOMES`, `MealOutcome`, `VotedMeal`, `mealOutcome`, `isPastMeal`, `mealsToAgree`, `isAgreed` — изходът от гласуването и съгласието по менюто.
- `thread.ts:ThreadEvent`, `systemLine`, `isMovedLine` — събитията `replaced` и `swapped`, текстът на системния ред и разпознаване на ред за размяна.

## Invariants

- `week.ts:weekdayOf` — 0 е понеделник, 6 е неделя; `isWeekStart` е вярно само за понеделник.
- `week.ts:weekStartOf` — понеделникът на календарната дата в София; `daysOfWeek` връща 7 дати от `weekStart`.
- `week.ts:MENU_SLOTS` — само `['dinner']`, затова планът има 7 ястия.
- `week.ts:hasWeekStarted` — `dateKeyInSofia(now) >= weekStart` (сравнение на низове).
- `votes.ts:mealOutcome` — празно ястие дава `null`; ако някой от `userIds` не е гласувал — `pending`; всички `up` — `keep`; всички `down` — `replace`; смесено — `discuss`; гласове на хора извън `userIds` се пренебрегват.
- `votes.ts:isAgreed` — вярно, когато `mealsToAgree` е празно, тоест всяко непразно ястие от днес нататък е `keep`; минали и празни дни не се броят.
- `meal.ts:isOneServingEach` — точно `userIds.length` ключа и всеки от тези хора има 1 порция.
- `thread.ts:systemLine` — размяната започва с „размени “, смяната със „смени “, изборът с „избра “, махането с „махна “; `isMovedLine` разпознава префикса „размени “ и стария „премести “.

## Side Effects

- None. `week.ts:hasWeekStarted` приема `now: Date`, а функциите в `votes.ts` приемат `today: DateKey`; нищо не чете часовника само.

## Verification

- Run: `pnpm --filter @family/shared test src/menu`
