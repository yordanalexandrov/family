# Prompt-ите на агентите в OpenClaw

Всеки AI контракт има свой агент в OpenClaw на `homesrv` ([ADR-0004](../adr/0004-openclaw-isolated-agent-per-contract.md)). Prompt-ът му живее тук и deploy-ът го копира като `AGENTS.md` в workspace-а на агента:

| Агент | Контракт | Prompt | Workspace на `homesrv` |
|---|---|---|---|
| `family-recipe` | `recipe.suggest` | [family-recipe.md](family-recipe.md) | `~/.openclaw/workspace-family-recipe/` |
| `family-menu` | `menu.propose` | [family-menu.md](family-menu.md) | `~/.openclaw/workspace-family-menu/` |

## Обновяване на prompt-а

Промяна в prompt-а = PR тук. Deploy-ът на `master` ([deploy.yml](../../.github/workflows/deploy.yml), стъпка „Sync agent prompts“) копира всеки `docs/openclaw/family-*.md` в `~/.openclaw/workspace-<име на файла>/AGENTS.md`, след като новото api отговаря на smoke теста. Затова prompt-ът и api-то винаги са от един commit, дори когато се сменя входът или изходът на контракта. Копира се само текстът под първата линия `---`, защото горната част на файла е бележка за хората.

- Агент се добавя с Provisioning (workspace на `homesrv`) и файл `family-<агент>.md` тук. Deploy-ът не създава workspace: ако липсва, стъпката спира с грешка.
- Ако prompt-ът не е променен, файлът на сървъра не се пипа. Ако е променен, старият остава до него като `AGENTS.md.bak`.
- Revert на PR-а връща и prompt-а със следващия deploy.

После smoke срещу реалния агент ([README → smoke](../../README.md)): `pnpm --filter api suggest:smoke -- …` за `family-recipe`, `menu:smoke` за `family-menu`. Ако отговорът не следва новия prompt, рестартирай OpenClaw на `homesrv` и пробвай пак (не е проверено дали агентът чете `AGENTS.md` наново при всяка заявка).

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
