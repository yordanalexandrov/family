# Prompt-ите на агентите в OpenClaw

Всеки AI контракт има свой агент в OpenClaw на `homesrv` ([ADR-0004](../adr/0004-openclaw-isolated-agent-per-contract.md)). Prompt-ът му живее тук и deploy-ът го копира като `AGENTS.md` в workspace-а на агента:

| Агент | Контракт | Prompt | Workspace на `homesrv` | Копие за smoke преди merge |
|---|---|---|---|---|
| `family-recipe` | `recipe.suggest` | [family-recipe.md](family-recipe.md) | `~/.openclaw/workspace-family-recipe/` | `family-recipe-next` |
| `family-menu` | `menu.propose` | [family-menu.md](family-menu.md) | `~/.openclaw/workspace-family-menu/` | `family-menu-next` |
| `family-meal` | `meal.replace` | [family-meal.md](family-meal.md) | `~/.openclaw/workspace-family-meal/` | `family-meal-next` |
| `family-import` | `recipe.normalize` | [family-import.md](family-import.md) | `~/.openclaw/workspace-family-import/` | `family-import-next` |
| `family-refine` | `recipe.refine` | [family-refine.md](family-refine.md) | `~/.openclaw/workspace-family-refine/` | `family-refine-next` |
| `family-cook` | `cooking.ask` | [family-cook.md](family-cook.md) | `~/.openclaw/workspace-family-cook/` | `family-cook-next` |

## Обновяване на prompt-а

Промяна в prompt-а = PR тук. Deploy-ът на `master` ([deploy.yml](../../.github/workflows/deploy.yml), стъпка „Sync agent prompts“) копира всеки `docs/openclaw/family-*.md` в `~/.openclaw/workspace-<име на файла>/AGENTS.md`, след като новото api отговаря на smoke теста. Затова prompt-ът и api-то винаги са от един commit, дори когато се сменя входът или изходът на контракта. Копира се само текстът под първата линия `---`, защото горната част на файла е бележка за хората.

- Агент се добавя с Provisioning (workspace на `homesrv`) и файл `family-<агент>.md` тук. Deploy-ът не създава workspace: ако липсва, стъпката спира с грешка.
- Ако prompt-ът не е променен, файлът на сървъра не се пипа. Ако е променен, старият остава до него като `AGENTS.md.bak`.
- Revert на PR-а връща и prompt-а със следващия deploy.

После smoke срещу реалния агент ([README → smoke](../../README.md)): `pnpm --filter api suggest:smoke -- …` за `family-recipe`, `menu:smoke` за `family-menu`, `meal:smoke` за `family-meal`, `import:smoke` за `family-import`, `refine:smoke` за `family-refine`, `ask:smoke` за `family-cook`. Ако отговорът не следва новия prompt, рестартирай OpenClaw на `homesrv` и пробвай пак (не е проверено дали агентът чете `AGENTS.md` наново при всяка заявка).

Проверка, че на сървъра е същото като в repo-то (без изход = еднакви), от корена на repo-то на `master`, с ssh достъп до `homesrv`:

```bash
AGENT=family-recipe
WS="~/.openclaw/workspace-$AGENT"
awk 'f; /^---$/ && !f {f=1}' "docs/openclaw/$AGENT.md" | ssh homesrv "diff - $WS/AGENTS.md"
```

Спешно връщане към предишния prompt, без deploy (следващият deploy пак ще копира този от `master`):

```bash
ssh homesrv "mv $WS/AGENTS.md.bak $WS/AGENTS.md"
```

## Модел и fallback

Всеки агент `family-*` и копието му `-next` имат в `~/.openclaw/openclaw.json` модел с резервен модел (от 2026-10-28):

```json5
model: { primary: "<моделът на агента>", fallbacks: ["anthropic/claude-opus-5-5"] }
```

Без `fallbacks` агентът ползва само своя модел (`docs/concepts/model-failover.md` на OpenClaw) и заявката пада, щом лимитът на доставчика свърши. С fallback OpenClaw минава на Opus 5.5 (runtime `claude-cli`) за тази заявка, а следващата пак започва от основния модел. В лога на gateway-а това личи по `model-fallback/decision`, последвано от `cli exec: provider=claude-cli model=claude-opus-5-5`. Проверено със smoke на `family-meal-next` и `family-recipe-next` при изчерпан лимит на основния модел.

Когато отговаря Opus, `usage.completion_tokens` в лога `openclaw completion` на api-то е едноцифрен и не отразява реалния брой токени.

## Търсене в интернет (`web_search`)

`family-recipe` търси рецепти с `web_search` и отваря страниците с `web_fetch`. `web_fetch` работи без настройка, а `web_search` иска доставчик на търсене в OpenClaw. **Без доставчик OpenClaw маха `web_search` от инструментите на агента**, без грешка (`docs/tools/web.md` на OpenClaw). Тогава агентът налучква адреси със `web_fetch` и обикновено връща `noResults` („търсенето е недостъпно“). Така беше до 2026-10-27 ([#69](https://github.com/yordanalexandrov/family/issues/69)).

Доставчикът е **Brave Search** (от 2026-10-27), общ за всички агенти на gateway-а:

- plugin `@openclaw/brave-plugin` (`openclaw plugins install @openclaw/brave-plugin`; не е вграден);
- в `~/.openclaw/openclaw.json`: ключът в `plugins.entries.brave.config.webSearch.apiKey`, `tools.web.search.provider: "brave"`, `maxResults: 5`, `timeoutSeconds: 30`;
- ключът е от таблото на Brave Search API (план Search) и стои само в `openclaw.json` на `homesrv`, не в repo-то и не в GitHub secrets. Gateway-ът поема промяна в `openclaw.json` сам (reload `hybrid`).

Проверка дали агентът има търсене, през тунела от „Smoke преди merge“ отдолу, с `OPENCLAW_GATEWAY_PASSWORD` в средата:

```bash
curl -s http://127.0.0.1:18789/v1/chat/completions \
  -H "authorization: Bearer $OPENCLAW_GATEWAY_PASSWORD" -H 'content-type: application/json' \
  -d '{"model":"openclaw/family-recipe-next","messages":[{"role":"user","content":"ДИАГНОСТИКА, не търси рецепти. Извикай web_search веднъж със заявка \"пиле с ориз рецепта\" и отговори с текст: наличен ли е web_search, колко резултата или каква грешка върна, наличен ли е web_fetch."}]}' \
  | jq -r '.choices[0].message.content'
```

Очаква се „web_search е наличен … 5 резултата“. „Не е наличен“ значи, че няма доставчик или plugin-ът не е зареден. Грешка 401/403 значи невалиден ключ или неактивен план. 429 значи, че квотата е свършила.

## Smoke преди merge

Prompt или контракт се проверява срещу реалния агент **преди** merge, без да се пипа production. За всеки агент на `homesrv` има копие `<агент>-next` със същия модел и fallback, `thinkingDefault`, `skills`, `subagents` и `tools`, но със собствен workspace `~/.openclaw/workspace-<агент>-next/`. Deploy-ът не го пипа: там стои prompt-ът, пробван последно.

Self-hosted runner-ът не върви за PR-и (AGENTS.md → Public repo), затова този smoke е ръчен: пуска го човекът или агентът в главната сесия (не агент в worktree, виж [worktrees.md](../agents/worktrees.md)). На клона на PR-а, от корена на repo-то, с `OPENCLAW_GATEWAY_PASSWORD` в `.env` или в средата:

```bash
AGENT=family-recipe                                    # или family-menu, family-meal, family-import, family-refine, family-cook
awk 'f; /^---$/ && !f {f=1}' "docs/openclaw/$AGENT.md" | ssh homesrv "umask 077; cat > ~/.openclaw/workspace-$AGENT-next/AGENTS.md"
ssh -N -o ExitOnForwardFailure=yes -L 18789:127.0.0.1:18789 homesrv &    # тунел; спира се накрая
OPENCLAW_RECIPE_AGENT=family-recipe-next pnpm --filter api suggest:smoke -- --slots dinner --hint "нещо с пиле"
OPENCLAW_MENU_AGENT=family-menu-next pnpm --filter api menu:smoke
OPENCLAW_MEAL_AGENT=family-meal-next pnpm --filter api meal:smoke
OPENCLAW_IMPORT_AGENT=family-import-next pnpm --filter api import:smoke
OPENCLAW_REFINE_AGENT=family-refine-next pnpm --filter api refine:smoke -- --url <линк към рецепта>
OPENCLAW_COOK_AGENT=family-cook-next pnpm --filter api ask:smoke -- --repeat 2
```

Така се проверяват заедно кодът на контракта от клона (скриптът го ползва локално) и prompt-ът от клона, срещу същия модел и инструменти като в production. Резултатът отива като коментар в PR-а, без нищо от средата, и започва с `## Smoke преди merge`: по този ред CI job-ът `smoke-gate` ([smoke-gate.yml](../../.github/workflows/smoke-gate.yml)) пропуска PR-а, щом е сменен `docs/openclaw/family-*.md` или `packages/shared/src/contracts/`. Gateway-ът поема ново `AGENTS.md` без рестарт (проверено на 2026-10-27).

Агентът в главната сесия ssh-ва до `homesrv` само за тунела и за запис в `~/.openclaw/workspace-*-next/`. Production workspace-ите пише само deploy-ът, а `openclaw.json` се пипа само по изрично решение на човека.

### Как са създадени копията

Еднократно, при нов агент (2026-10-27 за двата сегашни). На `homesrv`, след резервно копие на `~/.openclaw/openclaw.json`:

```bash
openclaw agents add <агент>-next --workspace ~/.openclaw/workspace-<агент>-next --model <моделът на агента> --non-interactive
# настройките на production агента (вкл. model с fallbacks), без name/workspace/agentDir
C=~/.openclaw/openclaw.json
jq --arg a <агент> '.agents.entries[$a+"-next"] += (.agents.entries[$a] | {model, thinkingDefault, skills, subagents, tools})
  | .agents.entries[$a+"-next"].identity = {name: ($a+"-next")}' $C > $C.tmp && chmod --reference=$C $C.tmp && mv $C.tmp $C
# workspace-ът като на production агента
W=~/.openclaw/workspace-<агент>-next
rm $W/BOOTSTRAP.md
cp -p ~/.openclaw/workspace-<агент>/{SOUL,USER,IDENTITY}.md $W/
```

`AGENTS.md` идва от командата за smoke отгоре. Проверка, че настройките са същите: `jq '(.agents.entries["<агент>"] | del(.name,.workspace,.agentDir,.identity)) == (.agents.entries["<агент>-next"] | del(.name,.workspace,.agentDir,.identity))' ~/.openclaw/openclaw.json` → `true`. При смяна на модела или инструментите на production агента се сменят и в копието.

### Нов агент без инструменти: `family-import`

Еднократно, преди първия deploy с `docs/openclaw/family-import.md` (иначе стъпката „Sync agent prompts“ спира, защото workspace-ът липсва). Агентът е без инструменти, с модел `openai/gpt-6-sol` (вижда изображения, за снимките от билет #105). На `homesrv`, след резервно копие на `~/.openclaw/openclaw.json`:

```bash
C=~/.openclaw/openclaw.json
cp -p $C $C.bak-family-import
openclaw agents add family-import --workspace ~/.openclaw/workspace-family-import --model openai/gpt-6-sol --non-interactive
# без инструменти, като family-meal: същият model (с fallback към Opus 5.5), tools, skills, subagents и thinkingDefault
jq '.agents.entries["family-import"] += (.agents.entries["family-meal"] | {model, thinkingDefault, skills, subagents, tools})
  | .agents.entries["family-import"].identity = {name: "family-import"}' $C > $C.tmp && chmod --reference=$C $C.tmp && mv $C.tmp $C
W=~/.openclaw/workspace-family-import
rm $W/BOOTSTRAP.md
cp -p ~/.openclaw/workspace-family-meal/{SOUL,USER,IDENTITY}.md $W/
```

Проверка, че няма инструменти като `family-meal`: `jq '.agents.entries["family-import"].tools == .agents.entries["family-meal"].tools' ~/.openclaw/openclaw.json` → `true`. После копието `family-import-next` по „Как са създадени копията“ отгоре (`<агент>` = `family-import`, моделът `openai/gpt-6-sol`). `AGENTS.md` на production агента го пише първият deploy; дотогава smoke-ът върви срещу `family-import-next`.

### Нов агент без инструменти: `family-refine`

Еднократно, **преди** първия deploy с `docs/openclaw/family-refine.md` (иначе стъпката „Sync agent prompts“ спира, защото workspace-ът липсва), по същия начин като `family-import`. Агентът е без инструменти (страницата я чете api-то), със същия модел, fallback и настройки като `family-meal`; снимки не вижда, защото ги закача по мястото им в текста. На `homesrv`, след резервно копие на `~/.openclaw/openclaw.json`:

```bash
C=~/.openclaw/openclaw.json
cp -p $C $C.bak-family-refine
openclaw agents add family-refine --workspace ~/.openclaw/workspace-family-refine --model "$(jq -r '.agents.entries["family-meal"].model.primary' $C)" --non-interactive
jq '.agents.entries["family-refine"] += (.agents.entries["family-meal"] | {model, thinkingDefault, skills, subagents, tools})
  | .agents.entries["family-refine"].identity = {name: "family-refine"}' $C > $C.tmp && chmod --reference=$C $C.tmp && mv $C.tmp $C
W=~/.openclaw/workspace-family-refine
rm $W/BOOTSTRAP.md
cp -p ~/.openclaw/workspace-family-meal/{SOUL,USER,IDENTITY}.md $W/
```

Проверка: `jq '.agents.entries["family-refine"].tools == .agents.entries["family-meal"].tools' ~/.openclaw/openclaw.json` → `true`. После копието `family-refine-next` по „Как са създадени копията“ отгоре (`<агент>` = `family-refine`).

### Нов агент с търсене: `family-cook`

Създаден на 2026-11-01 (#271), с настройките на `family-recipe` (модел с fallback, `thinkingDefault`, `skills`, `subagents` и `tools`, т.е. с `web_search` и `web_fetch`), по „Как са създадени копията“ и „Нов агент без инструменти“ отгоре, но с `family-recipe` вместо `family-meal`. Проверки: `jq '.agents.entries["family-cook"].tools == .agents.entries["family-recipe"].tools' ~/.openclaw/openclaw.json` → `true`, същото за `family-cook` и `family-cook-next`, и диагностиката за `web_search` отгоре срещу `family-cook-next`. `AGENTS.md` на production агента го пише първият deploy с [family-cook.md](family-cook.md).

`ask:smoke` пита рецептата от фикстурата `cooking-ask.input.json` (или `--recipe` с рецепта от `GET /api/recipes/:id`) с вградени въпроси за всеки случай от билета (замяна с pulp и с цели доматки, признак за готовност, мащабиране на порциите, въпрос с търсене, въпрос извън готвенето), след някои от тях и с допълнителни въпроси (#273: „а колко дълго да я варя тогава?“), които получават предишните въпроси и истинските отговори на агента в `history`, всяка верига `--repeat` пъти, и печата отговора, дължината и времето; `--question` пита само своя въпрос, а с `--chain` няколко `--question` са една верига. Промяната за готвенето (#276): всеки вграден случай казва дали отговорът трябва да носи `change` (замените с pulp и с цели доматки) или не трябва (готовност, порции, извън готвенето); разминаване се печата с ✗ и smoke-ът излиза с 1. Промяната от отговор се прилага за останалите въпроси от веригата, както „Промени“, затова допълнителните виждат рецептата с нея (`changed`). Новият текст на стъпките (#277): замените, които сменят и начина на приготвяне (булгур вместо ориз, лук на прах), трябва да носят и `change.steps`, а редът „Стъпки: 4 от 4 ✓“ на всеки отговор проверява, че броят стъпки, които агентът вижда, и стъпките, които промяната назовава, никога не излизат от тези на рецептата; разминаване е ✗ и exit 1. Приложените стъпки се печатат като „Приложено: стъпка 3 „…““. Промяната се печата на ред „Промяна:“ и се записва в `--save`. Таймаутът е този на api-то (120 s).
