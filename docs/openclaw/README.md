# Prompt-ите на агентите в OpenClaw

Всеки AI контракт има свой агент в OpenClaw на `homesrv` ([ADR-0004](../adr/0004-openclaw-isolated-agent-per-contract.md)). Prompt-ът му живее тук и се копира като `AGENTS.md` в workspace-а на агента:

| Агент | Контракт | Prompt | Workspace на `homesrv` |
|---|---|---|---|
| `family-recipe` | `recipe.suggest` | [family-recipe.md](family-recipe.md) | `~/.openclaw/workspace-family-recipe/` |
| `family-menu` | `menu.propose` | [family-menu.md](family-menu.md) | `~/.openclaw/workspace-family-menu/` |

## Обновяване на prompt-а

Промяна в prompt-а = PR тук + ново копиране на сървъра. Копира се само текстът под първата линия `---`; горната част на файла е бележка за хората.

**Кога:** ако се сменя и входът или изходът на контракта, копирай веднага след като deploy-ът на `master` с новото api приключи. Иначе старото api праща вход, който новият prompt не очаква (или обратно).

От корена на repo-то, на `master` след `git pull`, с `AGENT=family-recipe` или `AGENT=family-menu` (нужен е ssh достъп до `homesrv`):

```bash
AGENT=family-recipe
WS="~/.openclaw/workspace-$AGENT"

# 1. резервно копие на сегашния prompt
ssh homesrv "cp $WS/AGENTS.md $WS/AGENTS.md.bak"

# 2. новият prompt: само текстът под първата линия ---
awk 'f; /^---$/ && !f {f=1}' "docs/openclaw/$AGENT.md" | ssh homesrv "cat > $WS/AGENTS.md"

# 3. проверка: на сървъра е същото като в repo-то (без изход = еднакви)
awk 'f; /^---$/ && !f {f=1}' "docs/openclaw/$AGENT.md" | ssh homesrv "diff - $WS/AGENTS.md"
```

После smoke срещу реалния агент ([README → smoke](../../README.md)): `pnpm --filter api suggest:smoke -- …` за `family-recipe`, `menu:smoke` за `family-menu`. Ако отговорът не следва новия prompt, рестартирай OpenClaw на `homesrv` и пробвай пак (не е проверено дали агентът чете `AGENTS.md` наново при всяка заявка).

Връщане към предишния prompt:

```bash
ssh homesrv "mv $WS/AGENTS.md.bak $WS/AGENTS.md"
```
