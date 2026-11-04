# cooking — екранът „Готвене“

## Overview
Екранът „Готвене“ (`/recipes/$id/cook`): стъпките една по една, продуктите с отметки и броячи на порции и компоненти, редът „Подготовка“, листът „Въпрос“ към AI с „Промени“/„Върни“ (промяна за готвенето), четене на глас и гласови команди. `CookingScreen` зарежда рецептата и държи wake lock и излизането, `CookingView` е оркестраторът, а `cooking-memory.ts` пази напредъка и настройките на устройството в localStorage.

## Interface
- `CookingScreen.tsx:CookingScreen`, `CookingScreen.tsx:parseCookingSearch` — маршрутният екран и проверката на `?servings=`
- `CookingView.tsx:CookingView` — сглобява напредък, промени, четене, слушане, въпроси и листите „Въпрос“/„Как мина?“; колона на широк екран, лист на тесен
- `CookingSteps.tsx:CookingSteps` — стъпката с навигация, размер на текста, снимка, таймери и плъзгане
- `CookingChecklist.tsx:CookingChecklist`, `productsLabel`; `CookingIngredients.tsx:CookingIngredients`, `CookingIngredientsBody` — продуктите с отметки, „Използвани (N)“ и компоненти
- `CookingPreparation.tsx:CookingPreparation`, `LOW_SCREEN_QUERY` — чипове „Подготовка“; на нисък екран един обобщен чип
- `ServingsStepper.tsx:ServingsStepper`, `AskButton.tsx:AskButton`, `CookingQuestionSheet.tsx:CookingQuestionSheet` — порции, „Питай“ и листът „Въпрос“
- `ListeningControls.tsx:ListenButton`, `ReadAloudControls.tsx:ReadStepButton`, `ReadAloudControls.tsx:ReadStepsToggle` — бутоните за слушане и четене на глас
- `cooking-memory.ts:useCookingProgress`, `rememberLastCooking`, `useRememberedQuestions`, `useAppliedChanges`, `useIngredientsOpen`, `useCookingTextSize`, `useReadSteps` — напредък и настройки на устройството
- `cooking-memory.ts:COOKING_TEXT_SIZES` (`[0.6 … 1.3]`, по подразбиране 1; A−/A+ местят с една степен), `COOKING_INGREDIENTS_OPEN_KEY`, `COOKING_TEXT_SIZE_KEY`, `COOKING_READ_STEPS_KEY` — степени на текста и ключове в localStorage
- `questions.ts:useAskCookingQuestion`, `cookingQuestionQuery`, `isLostQuestion`, `useIsLostQuestion` — питане и следене на въпрос; изгубените въпроси не се продължават и не влизат в `applied`
- `step-ingredients.ts:findStepIngredients`, `step-ingredients.ts:findStepLines` — кои продукти назовава текстът на стъпката (с българските форми на думите)
- `use-cooking-changes.ts:useCookingChanges`, `use-cooking-questions.ts:useCookingQuestions`, `use-cooking-reading.ts:useCookingReading`, `use-cooking-reading.ts:useReadNewAnswers`, `use-cooking-listening.ts:useCookingListening` — промени, въпроси, четене и гласови команди

## Invariants
- `cooking-memory.ts:readProgress` — напредъкът важи само ако пасва на рецептата (индекс на стъпка, уникални индекси на редове); отметките на подготовката и броячите на компонентите важат само при същата подготовка/компоненти
- `cooking-memory.ts:useCookingProgress.finish` — „Готово“ трие напредъка, въпросите и промените и пази само `lastApplied`
- `cooking-memory.ts:useRememberedList` — `update` смята от последния списък (`latest` ref), за да не се губят две промени подред
- `CookingScreen.tsx:CookingScreen` — wake lock само на лично устройство (kiosk го държи `RootLayout`); излизането е `history.back` или replace към `/recipes/$id`, и двете с `ignoreBlocker`, през `leave` на `useLeaveCooking`: при активен таймер „Готово“/„Затвори“ първо искат потвърждение (`confirmation`), а `onLeave` (`finish`) се вика чак при самото излизане
- `CookingView.tsx:CookingView` — порциите на екрана не се помнят; „Готово“ първо вика `rememberLastCooking`, а `finish` чак след затварянето на „Как мина?“ (`afterSheetClosed`); „Затвори“ не забравя напредъка
- `use-cooking-changes.ts:useCookingChanges` — промяната важи само за това готвене: рецептата, менюто и списъкът за пазаруване не се пипат; `revert` връща и зависимите по-късни промени; отметките на сменените от „Промени“/„Върни“ редове се махат (`onLinesChanged` → `forgetUsed`)
- `questions.ts:postKnown` — при отказ `no_applied_change` или `no_earlier_question` пита пак с по-малко данни, затова опитите свършват
- `questions.ts:cookingQuestionQuery` — проверява на `POLL_INTERVAL_MS` само докато е `pending`; 404 значи изгубен въпрос (`isLostQuestion`)
- `use-cooking-listening.ts:useCookingListening` — докато се чете, се приема само „спри“; слушането е на пауза, докато текстово поле има фокус
- `use-cooking-reading.ts:useReadNewAnswers` — чете само отговор, видян като `pending` и после `done`, и само при включено „Чети стъпките“
- `CookingSteps.tsx:SWIPE_MIN_PX` — стъпката се сменя при хоризонтално плъзгане >= 50 px
- `CookingQuestionSheet.tsx:CookingQuestionSheet` — не праща празен въпрос, офлайн, докато `POST` тече или докато въпрос на същата стъпка чака (чакащ на друга стъпка не спира нов); `maxLength` е `COOKING_QUESTION_MAX`

## Side Effects
- `questions.ts:postQuestion` — POST `/api/recipes/:id/questions`
- `questions.ts:cookingQuestionQuery` — GET `/api/recipes/questions/:id` на 3 s, докато чака
- `cooking-memory.ts` — localStorage `family.cooking.progress` (през `lib/cooking-record.ts`), `family.cooking.ingredientsOpen`, `family.cooking.textSize`, `family.cooking.readSteps`
- `CookingScreen.tsx:CookingScreen` — `useWakeLock` и мутация на историята при излизане
- `use-cooking-reading.ts:useCookingReading` — четене на глас през `features/voice` (`useReadAloud`)
- `use-cooking-listening.ts:useCookingListening` — разпознаване на реч през `features/voice` (`useListening`); `focusin`/`focusout` на `document`, `MutationObserver`, `setTimeout` (`HEARD_MS`)
- `CookingChecklist.tsx:useScrollToStep` — `scrollIntoView` към първия неотметнат ред на стъпката

## Verification
- Run: `pnpm --filter web test src/features/cooking`
