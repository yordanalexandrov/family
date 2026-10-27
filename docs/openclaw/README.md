# Prompt-ите на агентите в OpenClaw

Всеки AI контракт има свой агент в OpenClaw на `homesrv` ([ADR-0004](../adr/0004-openclaw-isolated-agent-per-contract.md)). Prompt-ът му живее тук и deploy-ът го копира като `AGENTS.md` в workspace-а на агента:

| Агент | Контракт | Prompt | Workspace на `homesrv` | Копие за smoke преди merge |
|---|---|---|---|---|
| `family-recipe` | `recipe.suggest` | [family-recipe.md](family-recipe.md) | `~/.openclaw/workspace-family-recipe/` | `family-recipe-next` |
| `family-menu` | `menu.propose` | [family-menu.md](family-menu.md) | `~/.openclaw/workspace-family-menu/` | `family-menu-next` |
| `family-meal` | `meal.replace` | [family-meal.md](family-meal.md) | `~/.openclaw/workspace-family-meal/` | `family-meal-next` |

## Обновяване на prompt-а

Промяна в prompt-а = PR тук. Deploy-ът на `master` ([deploy.yml](../../.github/workflows/deploy.yml), стъпка „Sync agent prompts“) копира всеки `docs/openclaw/family-*.md` в `~/.openclaw/workspace-<име на файла>/AGENTS.md`, след като новото api отговаря на smoke теста. Затова prompt-ът и api-то винаги са от един commit, дори когато се сменя входът или изходът на контракта. Копира се само текстът под първата линия `---`, защото горната част на файла е бележка за хората.

- Агент се добавя с Provisioning (workspace на `homesrv`) и файл `family-<агент>.md` тук. Deploy-ът не създава workspace: ако липсва, стъпката спира с грешка.
- Ако prompt-ът не е променен, файлът на сървъра не се пипа. Ако е променен, старият остава до него като `AGENTS.md.bak`.
- Revert на PR-а връща и prompt-а със следващия deploy.

После smoke срещу реалния агент ([README → smoke](../../README.md)): `pnpm --filter api suggest:smoke -- …` за `family-recipe`, `menu:smoke` за `family-menu`, `meal:smoke` за `family-meal`. Ако отговорът не следва новия prompt, рестартирай OpenClaw на `homesrv` и пробвай пак (не е проверено дали агентът чете `AGENTS.md` наново при всяка заявка).

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

## Smoke преди merge

Prompt или контракт се проверява срещу реалния агент **преди** merge, без да се пипа production. За всеки агент на `homesrv` има копие `<агент>-next` със същия модел, `thinkingDefault`, `skills`, `subagents` и `tools`, но със собствен workspace `~/.openclaw/workspace-<агент>-next/`. Deploy-ът не го пипа: там стои prompt-ът, пробван последно.

Self-hosted runner-ът не върви за PR-и (AGENTS.md → Public repo), затова този smoke е ръчен: пуска го човекът или агентът в главната сесия (не агент в worktree, виж [worktrees.md](../agents/worktrees.md)). На клона на PR-а, от корена на repo-то, с `OPENCLAW_GATEWAY_PASSWORD` в `.env` или в средата:

```bash
AGENT=family-recipe                                    # или family-menu, family-meal
awk 'f; /^---$/ && !f {f=1}' "docs/openclaw/$AGENT.md" | ssh homesrv "umask 077; cat > ~/.openclaw/workspace-$AGENT-next/AGENTS.md"
ssh -N -o ExitOnForwardFailure=yes -L 18789:127.0.0.1:18789 homesrv &    # тунел; спира се накрая
OPENCLAW_RECIPE_AGENT=family-recipe-next pnpm --filter api suggest:smoke -- --slots dinner --hint "нещо с пиле"
OPENCLAW_MENU_AGENT=family-menu-next pnpm --filter api menu:smoke
OPENCLAW_MEAL_AGENT=family-meal-next pnpm --filter api meal:smoke
```

Така се проверяват заедно кодът на контракта от клона (скриптът го ползва локално) и prompt-ът от клона, срещу същия модел и инструменти като в production. Резултатът отива като коментар в PR-а, без нищо от средата. Gateway-ът поема ново `AGENTS.md` без рестарт (проверено на 2026-10-27).

Агентът в главната сесия ssh-ва до `homesrv` само за тунела и за запис в `~/.openclaw/workspace-*-next/`. Production workspace-ите пише само deploy-ът, а `openclaw.json` се пипа само по изрично решение на човека.

### Как са създадени копията

Еднократно, при нов агент (2026-10-27 за двата сегашни). На `homesrv`, след резервно копие на `~/.openclaw/openclaw.json`:

```bash
openclaw agents add <агент>-next --workspace ~/.openclaw/workspace-<агент>-next --model <моделът на агента> --non-interactive
# настройките на production агента, без name/workspace/agentDir
C=~/.openclaw/openclaw.json
jq --arg a <агент> '.agents.entries[$a+"-next"] += (.agents.entries[$a] | {thinkingDefault, skills, subagents, tools})
  | .agents.entries[$a+"-next"].identity = {name: ($a+"-next")}' $C > $C.tmp && chmod --reference=$C $C.tmp && mv $C.tmp $C
# workspace-ът като на production агента
W=~/.openclaw/workspace-<агент>-next
rm $W/BOOTSTRAP.md
cp -p ~/.openclaw/workspace-<агент>/{SOUL,USER,IDENTITY}.md $W/
```

`AGENTS.md` идва от командата за smoke отгоре. Проверка, че настройките са същите: `jq '(.agents.entries["<агент>"] | del(.name,.workspace,.agentDir,.identity)) == (.agents.entries["<агент>-next"] | del(.name,.workspace,.agentDir,.identity))' ~/.openclaw/openclaw.json` → `true`. При смяна на модела или инструментите на production агента се сменят и в копието.
