# Проучване: как `apps/api` вика OpenClaw за структуриран JSON отговор

Отговор на GitHub issue #2. Контекст: `docs/concept.md` („AI контракти“) и ADR-0004 (отделен изолиран OpenClaw агент за всеки контракт; API-то валидира изхода със Zod и повтаря веднъж).

Източници: инсталацията на `homesrv` (`yordan@192.168.0.69`), OpenClaw **2026.10.7 (157d8c2)**. Пътищата към документацията по-долу са относителни спрямо `~/.npm-global/lib/node_modules/openclaw/docs/`. Където твърдението идва от изпълнена команда или от bundle-а в `dist/`, това е посочено изрично. Нищо по сървъра не е променяно; не са пускани платени agent turns.

## Състояние на сървъра (прочетено, не променяно)

| Какво | Стойност | Източник |
|---|---|---|
| Gateway | systemd user service, `bind=loopback`, `127.0.0.1:18789`, версия 2026.10.7 | `openclaw gateway status` |
| Auth | `gateway.auth.mode = password` (паролата е в `~/.openclaw/openclaw.json`, тук не се цитира) | `openclaw config get gateway.auth.mode` |
| HTTP endpoints `/v1/*` | **не са включени** (`gateway.http` е unset → по подразбиране изключени) | `openclaw config get gateway.http`; `gateway/openai-http-api.md` |
| Webhooks `/hooks/*` | не са включени (`hooks.enabled` unset) | `openclaw config get hooks.enabled` |
| Агенти | `kiki` (default, Telegram, `anthropic/claude-opus-5-5` през `claude-cli` runtime), `coordinator` и `emerald-verifier` (`openai/gpt-6-sol`) | `openclaw agents list`, `openclaw config get agents` |
| `tools.profile` | глобално `full` | `openclaw config get tools` |
| Web search | `tools.web` unset; няма конфигуриран managed провайдър (Brave/Tavily/…); plugin `llm-task` е наличен, но `disabled` | `openclaw config get tools.web`, `openclaw plugins list` |
| Docker | има Docker на хоста, bridge `172.17.0.1/16`; вече работят контейнери на друг проект (`emerald-verify-3-*`) | `docker ps`, `ip addr` |

Прецедент: `emerald-verifier` е точно „изолиран агент за друг проект“ — собствен workspace, собствен `agentDir`, `tools.profile: coding`, `subagents.allowAgents: ["emerald-verifier"]`. Същият модел на конфигурация важи и за нас, само с по-тесни права.

## 1. HTTP API на gateway-а за един agent turn

### 1.1 Кандидати и кой за какво става

| Endpoint | Връща ли текста на модела | Избор на агент | Бележка | Източник |
|---|---|---|---|---|
| `POST /v1/chat/completions` | да (OpenAI Chat Completions формат) | да, чрез `model: "openclaw/<agentId>"` | изключен по подразбиране; **препоръчан** | `gateway/openai-http-api.md` |
| `POST /v1/responses` | да (OpenResponses формат) | да | изключен по подразбиране; `text.format` приема само `{type:"text"}` (виж §4) | `gateway/openresponses-http-api.md`; `dist/openresponses-http-*.mjs` |
| `POST /hooks/agent` | **не** — връща само `{ok, runId}` и евентуално `completion.status`; „The response never includes model output“ | да (`agentId`) | за събуждане на агент, не за заявка/отговор | `automation/cron-jobs/webhooks.md` |
| `POST /tools/invoke` | извиква един tool, не цял agent turn | чрез `agentId`/`sessionKey` | винаги включен; полезен само с `llm-task` (§4.2) | `gateway/tools-invoke-http-api.md` |
| WebSocket RPC `agent` + `agent.wait` | да | да | това ползва `openclaw agent`; повече код от HTTP | `gateway/protocol/rpc-talk-config-and-agents.md`, `concepts/agent-loop.md` |

### 1.2 `POST /v1/chat/completions` в детайли

Всичко по-долу е от `gateway/openai-http-api.md`, освен където е посочено друго.

**Включване** (изисква промяна в `openclaw.json` и рестарт на gateway — не е правено):

```json5
{ gateway: { http: { endpoints: { chatCompletions: { enabled: true } } } } }
```

Сервира се на същия порт като WS (`http://127.0.0.1:18789/v1/chat/completions`). „Requests run as a normal Gateway agent run (same codepath as `openclaw agent`)“.

**Auth.** При `gateway.auth.mode="password"`: `Authorization: Bearer <паролата от gateway.auth.password>`. Няма отделен „API token“ за програмен достъп в този режим — bearer-ът е самата парола, и документацията изрично казва да се третира като **пълен operator достъп** („equivalent to an owner/operator credential“; възстановява пълния scope set `operator.admin`, … независимо от `x-openclaw-scopes`). Следствие: паролата трябва да стои само в env на `api` контейнера, endpoint-ът да остане на loopback. Ако трябва по-тесен credential, единствената алтернатива е отделен gateway (`gateway/tools-invoke-http-api.md`: „If you need separation across trust boundaries, run separate gateways“). Неуспешни опити могат да върнат `429` + `Retry-After` при конфигуриран `gateway.auth.rateLimit`.

**Избор на агент.** Полето `model` е *agent target*, не модел: `openclaw/<agentId>` (или `agent:<agentId>`, или header `x-openclaw-agent-id`). Моделът на агента е този от неговата конфигурация; може да се override-не с header `x-openclaw-model: provider/model` (при bearer auth е разрешено).

**Сесии.** По подразбиране всяка заявка е **stateless** („a new session key is generated each call“). Ако се подаде OpenAI полето `user`, gateway-ът извлича стабилен session key от него и следващите заявки споделят сесия — за нашите контракти **не** подаваме `user`. `x-openclaw-session-key` е нужен само за явно рутиране; забранени са префикси `subagent:`, `cron:`, `acp:`.

**Заявка** (поддържани полета): `messages` (system/user/assistant/tool), `tools` + `tool_choice` (клиентски function tools — не ни трябват), `max_completion_tokens` (или legacy `max_tokens`), `temperature`, `top_p`, `seed`, `stop`, `stream`, `stream_options.include_usage`. Недокументирано в тази страница, но налично в bundle-а: `response_format` (виж §4.1). Лимит 20 MB на тяло.

**Отговор** (non-streaming): стандартен Chat Completions обект; текстът е в `choices[0].message.content`, `finish_reason` е `"stop"`, `"length"` при изчерпан output budget („mirrors the `finish_reason: "length"` projection“ — `gateway/openresponses-http-api.md`) или `"tool_calls"` само ако сме подали клиентски `tools`. Грешки: `{ "error": { "message", "type" } }` с `400` invalid request, `401` auth, `403` scope, `404` непознат модел при `x-openclaw-model`, `429`, `500 api_error` („agent run was cancelled“ ако gateway-ът прекрати run-а), `503` при претоварен провайдър.

**Streaming vs. final.** `stream: true` дава SSE (`data: <json>` … `data: [DONE]`); с `stream_options.include_usage=true` има финален usage chunk. За нашия случай (един JSON обект, който така или иначе парсваме целия) **non-streaming** е по-простият и правилен избор: един HTTP разговор, един JSON. Streaming има смисъл само ако искаме да покажем прогрес в UI.

**Timeouts** (`concepts/agent-loop.md`, „Timeouts“ + `gateway/openai-http-api.md`):

| Какво | Стойност | Бележка |
|---|---|---|
| Agent runtime (`agents.defaults.timeoutSeconds`) | **48 h** по подразбиране | целият run |
| Model idle timeout | 120 s за cloud провайдъри | без chunk/keepalive → abort на заявката към модела |
| HTTP клиент → gateway | **няма сървърен лимит** | заявката стои отворена до края на turn-а; „Failed agent runs, including whole-agent timeouts, return an error“ |
| Прекъсване от клиента | **отменя run-а** | „Disconnecting the HTTP client cancels … the agent run“ |

Извод: таймаутът е наша отговорност — `AbortController` в `apps/api` (ориентир §5). В JSON schema-та на `agents.entries.*` (`openclaw config schema`) няма per-agent `timeoutSeconds`; глобалният `agents.defaults.timeoutSeconds` би засегнал и `kiki`, затова не го пипаме.

**Пример** (без секрети):

```bash
curl -sS http://127.0.0.1:18789/v1/chat/completions \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "openclaw/family-recipe",
    "messages": [{"role":"user","content":"<JSON вход на контракта>"}],
    "max_completion_tokens": 4000,
    "response_format": {"type":"json_schema","json_schema":{"name":"recipe_suggest","schema":{},"strict":true}}
  }'
```

Smoke test след включване: `GET /v1/models` трябва да върне `openclaw/default` и `openclaw/<agentId>` (изисква `operator.read`, който bearer-ът има).

### 1.3 Мрежа от Docker контейнер

Gateway-ът слуша **само на 127.0.0.1** на хоста. От bridge мрежа (`172.17.0.0/16`) `host.docker.internal`/`172.17.0.1` води до `docker0`, не до loopback → недостижим. Документираните опции (`gateway/config-gateway.md`, „Docker note“): `--network host`, или `gateway.bind: "lan"`/`"custom"` + `customBindHost`. За нас:

- **Препоръка:** `network_mode: "host"` за `api` контейнера. Не променя нищо по OpenClaw, gateway-ът остава loopback-only. Цена: `api` губи изолацията на bridge мрежата (говори с postgres по `127.0.0.1:5432`, Caddy го достига на `127.0.0.1:<port>`).
- Алтернатива: `gateway.bind: "lan"` — отваря gateway-а към LAN; изисква firewall и е по-голям blast radius за operator-level credential. Не я препоръчвам.

## 2. Алтернатива през CLI: `openclaw agent … --json`

Източник: `cli/agent.md`, `openclaw agent --help`, `gateway/remote.md`.

Три режима:

| Режим | Какво му трябва | Изход | Оценка |
|---|---|---|---|
| `openclaw agent --agent <id> --message-file - --json` (през Gateway) | достъп до WS `ws://127.0.0.1:18789` (пак host network) + credential. С env `OPENCLAW_GATEWAY_URL` важи само `OPENCLAW_GATEWAY_PASSWORD` от env (`gateway/remote.md`, „Credential precedence“). **Не** изисква `~/.openclaw` в контейнера | JSON envelope: `payloads[].text`, `meta.durationMs`, `meta.agentMeta` с `usage` и `costUsd`; `ok:false` + `error.type: "cli_error"` при грешка; exit `0`/`1` | работи, но е същият gateway run като HTTP + spawn на Node процес и ~**619 MB** npm пакет в image-а (`du -sh` на инсталацията) |
| `openclaw agent --local` | ексклузивно притежание на state dir — „refuses to start while a Gateway … owns that directory“ | — | **невъзможно** докато gateway-ът работи |
| `openclaw agent exec` (embedded, temp state) | „runs against your ordinary OpenClaw config“ → трябва `~/.openclaw` (config + credentials) монтиран в контейнера; default timeout 600 s; tool profile `coding` по подразбиране | стабилен JSON envelope с `final`, `usage`, `costUsd`, `status: ok\|error\|timeout`, exit `0/1/2` | заобикаля gateway-а и неговата per-agent конфигурация; дава на контейнера достъп до всички credential-и на Дако — противоречи на ADR-0004 |

Полезен детайл за всички режими: `--json` държи stdout чист („Gateway, plugin, and `--local` diagnostics go to stderr“); `--message-file -` чете stdin (до 4 MiB); `$skill` и водещ `/skill-name` в съобщението се разширяват в инструкции (входът ни е JSON, така че няма риск, но да не започва с `/`).

Извод: CLI-ят не дава нищо, което HTTP не дава, а добавя 600 MB и process spawn на всяка заявка. Единственото му предимство е готовото поле `costUsd` в `--json` — но същото се вижда в Control UI → Usage и `/status` (`reference/api-usage-costs.md`).

## 3. Изолиран агент за контракт

Източници: `cli/agents.md`, `concepts/multi-agent.md`, `gateway/config-agents/entries-and-multi-agent.md`, `gateway/config-agents/workspace-and-bootstrap.md`, `gateway/config-tools/tool-policy.md`, `concepts/system-prompt.md`, `tools/web.md`.

### 3.1 Какво е „един агент“

Всеки агент има собствен workspace (bootstrap файлове), собствен `agentDir` (auth profiles, model registry) и **собствен session store** `<agentDir>/openclaw-agent.sqlite` (`concepts/multi-agent.md`, „What is one agent“; „Never reuse `agentDir` across agents“). Сесиите на `kiki` са в `~/.openclaw/agents/kiki/agent/`; нов агент `family-recipe` ще пише в `~/.openclaw/agents/family-recipe/agent/`. Session key на HTTP заявките ще е `agent:family-recipe:<generated>`.

Уговорка от същия документ: „each agent's workspace is the **default cwd**, not a hard sandbox … absolute paths can reach other host locations unless sandboxing is enabled“. Затова изолацията от `kiki` идва от **tool policy** (без `read`/`exec`/`sessions_*`), не от workspace-а.

### 3.2 Създаване

```bash
openclaw agents add family-recipe \
  --workspace ~/.openclaw/workspace-family-recipe \
  --model openai/gpt-6-sol \
  --non-interactive --json
```

`--non-interactive` изисква `--workspace` и не копира auth profiles (copy стъпката е само в интерактивния режим, където default-ът е „Skip copying auth profiles“). Моделът работи през `agents.defaults.authInheritance.agentId = kiki` → read-through до споделените credential-и (`concepts/multi-agent.md`, Warning блока). Един агент на контракт: `family-menu`, `family-recipe`.

### 3.3 Конфигурация (чрез `openclaw config patch`, после рестарт)

```json5
{
  agents: {
    entries: {
      "family-recipe": {
        workspace: "~/.openclaw/workspace-family-recipe",
        model: "openai/gpt-6-sol",          // string = strict, без fallback
        thinkingDefault: "low",
        skills: [],                          // без skills
        subagents: { allowAgents: [] },      // не може да spawn-ва други агенти
        tools: {
          allow: ["web_search", "web_fetch"],              // allowlist режим
          deny: [
            "group:fs", "group:runtime", "group:sessions", "group:messaging",
            "group:automation", "group:ui", "group:nodes", "group:memory",
            "group:media", "browser", "group:plugins"
          ],
        },
      },
    },
  },
}
```

Обосновка:

- `tools.allow` е allowlist („Global tool allow/deny policy (deny wins)“); `allow` и `alsoAllow` не могат да са в един scope. `group:web` = `web_search`, `x_search`, `web_fetch` — изброявам само двата, които ни трябват. `deny` е defense in depth (deny печели над allow; `group:fs` покрива `read/write/edit/apply_patch`, `group:runtime` — `exec/process/code_execution`, `group:sessions` — всички `sessions_*`/`conversations_*`, `group:messaging` — `message`). Това е същият модел като примерите „Read-only tools + workspace“ и „No filesystem access“ в `gateway/config-agents/entries-and-multi-agent.md`.
- За `recipe.suggest`: `web_search` + `web_fetch`. За `menu.propose`: `allow: []`, ако решим, че менюто се прави само от входните данни.
- `model` като string е „strict per-agent primary with no model fallback“ — предвидимо за цена и формат.
- Без `sandbox` — Docker sandbox не е нужен, щом няма файлови/exec инструменти.
- `web_search` се показва на модела само ако има конфигуриран провайдър **или** native search (`tools/web.md`, „Search settings“: „When no managed provider is configured, OpenClaw omits `web_search` from the agent tool list“). На сървъра няма managed провайдър, но за директни OpenAI Responses модели (`openai/gpt-6-sol`) се ползва **native OpenAI hosted web search** автоматично („Native OpenAI web search“). Ако предпочетем независим провайдър (напр. Brave, $5/1000 заявки с $5 безплатен кредит/месец — `reference/api-usage-costs.md`), се пина с `tools.web.search.provider`.

### 3.4 Фиксиран системен prompt

OpenClaw няма поле „system prompt“ в конфигурацията; prompt-ът се сглобява от gateway-а и workspace файловете се **инжектират** в него (`concepts/system-prompt.md`, „Workspace bootstrap injection“: `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, `BOOTSTRAP.md` само при нов workspace, `MEMORY.md` ако има). Лимити: 20 000 знака на файл, 60 000 общо (`agents.defaults.bootstrapMaxChars`/`bootstrapTotalMaxChars`).

Практически: инструкциите на контракта + JSON schema-та на изхода отиват в `~/.openclaw/workspace-family-recipe/AGENTS.md`; `SOUL.md`/`USER.md`/`IDENTITY.md` се правят минимални (по подразбиране `agents add` ги seed-ва с шаблони — `reference/templates/*.md`). `BOOTSTRAP.md` трябва да е завършен/изтрит, за да няма „identity ceremony“. Тези файлове са версионируеми: предлагам да живеят в репото (`infra/openclaw/<agentId>/AGENTS.md`) и да се копират при deploy.

Допълнително: `role: "system"` съобщение в самата HTTP заявка също се слива в prompt-а (за `/v1/responses` е документирано „`instructions` merged into the system prompt“ и „`system` and `developer` are appended to the system prompt“; за chat completions `messages` с role system са част от поддържания формат). Това позволява част от инструкциите (напр. актуалната schema) да идват от `packages/shared` при всяка заявка, вместо да се синхронизират ръчно. Препоръка: постоянната част (роля, правила, формат) в `AGENTS.md`; schema-та и входът — от API-то.

### 3.5 Избор на модел и runtime

На сървъра `anthropic/claude-opus-5-5` е конфигуриран с `agentRuntime: claude-cli` (абонаментът на Claude Code). За контрактите това е лош избор: при CLI backend „OpenClaw does not inject tool calls into the CLI backend protocol“, „Structured outputs depend on the CLI's own JSON format“ (`gateway/cli-backends.md`, „Limitations“) и „Anthropic does not expose a per-message dollar estimate, so `/usage full` cannot show cost for Claude CLI usage“ (`reference/api-usage-costs.md`). `openai/gpt-6-sol` (default на инсталацията, вграден `openclaw` runtime, API-ключ) дава tool policy, native web search, `response_format` и видима цена. Препоръка: `openai/gpt-6-sol` за `recipe.suggest`; за `menu.propose` може да се тества и по-евтин модел през `x-openclaw-model`, без да се пипа агентът.

## 4. Структуриран изход: има ли нативна поддръжка

### 4.1 `/v1/chat/completions` приема `response_format`

Документационната страница не го споменава, но bundle-ът го валидира и препраща: `dist/openai-compat-errors-*.mjs` → `resolveResponseFormat` приема `type` ∈ {`text`, `json_object`, `json_schema`} и иначе връща `400 Invalid response_format`; `dist/openai-http-*.mjs` го подава в `resolveOpenAiStreamParams({ …, responseFormat, … })`, т.е. по същия „agent stream-param channel“, по който вървят `temperature`/`max_tokens` — а за тях документацията казва „forwarded best-effort“. За OpenAI Responses транспорта плъгин SDK-то описва как raw JSON Schema се опакова в `text.format` с `type: "json_schema"` (`plugins/sdk-runtime/models.md`). За `/v1/responses` обратно: schema-та на заявката приема **само** `text: { format: { type: "text" } }` (strict object в `dist/openresponses-http-*.mjs`), т.е. `json_schema` там ще даде `400`.

Какво **не** е гарантирано: (а) че всеки провайдър/runtime го спазва (при `claude-cli` със сигурност не); (б) поведението при tool loop — структурираният формат се прилага към заявките към модела, но между тях има tool calls (web search) и финалният текст е този, който получаваме; (в) няма server-side валидация срещу schema-та — gateway-ът връща текста какъвто е.

### 4.2 Нативна schema валидация има само в два други механизма

- **`llm-task`** (`tools/llm-task.md`): bundled plugin tool, „runs a single JSON-only LLM call and returns structured output, optionally validated against a JSON Schema“; параметри `prompt`, `input`, `schema`, `model`, `maxTokens`, `timeoutMs` (default 30 s); връща `details.json`. Но е **без инструменти** („No supplied tools“) и без сесия — не може да търси в интернет. Извиква се през `POST /tools/invoke` (`{ "tool": "llm-task", "args": {...} }`), който е винаги включен. Изисква `plugins.entries.llm-task.enabled: true` + `tools.alsoAllow: ["llm-task"]`. Подходящ за `menu.propose` / `recipe.normalize` (без web), **не** за `recipe.suggest`.
- **Swarm/collector `structured_output`** (`tools/swarm.md`): синтетичен tool + „one corrective nudge“ при невалиден payload — но това е за sub-agent оркестрация от агент, не за външен HTTP клиент.

### 4.3 Заключение за §4

Налагаме формата с **prompt + `response_format: json_schema` (best-effort) + Zod в `apps/api` + 1 повторен опит** — точно както казва ADR-0004. `response_format` намалява честотата на невалиден изход, но не замества валидацията. При повторния опит добавяме в user съобщението Zod грешката и предишния изход. Ако `finish_reason === "length"`, вдигаме `max_completion_tokens`, не повтаряме сляпо.

Парсване: да се очаква и случаят, в който моделът огражда JSON в ```` ```json ```` блок; стрипваме го преди `JSON.parse`.

## 5. Цена и латентност (ориентир)

Документацията не дава цени на модели; те идват от hosted catalog-а и се виждат като *оценка* в `/status`, `/usage full`, Control UI → Usage (`reference/token-use.md`, „Cost estimation“; `reference/api-usage-costs.md`). `openclaw models list --json` на сървъра не връща `cost` полета. Затова числата по-долу са **моя оценка**, не измерване — да се валидират с 10 реални извиквания преди да се вземат решения (`openclaw agent --agent family-recipe --json` връща `meta.agentMeta.costUsd` и `meta.durationMs`, което е най-бързият начин да се измери).

| Контракт | Токени (вход / изход) | Турове | Латентност | Какво се плаща |
|---|---|---|---|---|
| `recipe.suggest` с 2–4 web search + 1–3 fetch | ~15–40k вход (prompt + резултати от търсене), ~1.5–3k изход | 3–6 заявки към модела | **20–60 s** | токени на gpt-6-sol + hosted web search на OpenAI (таксува се на извикване, по тарифата на OpenAI) или Brave ($5/1000) |
| `menu.propose` без web | ~5–12k вход, ~2–4k изход | 1–2 | **10–30 s** | само токени |

Фактори, които документацията потвърждава: всеки tool call е нов round trip към модела (`concepts/agent-loop.md`); system prompt-ът на OpenClaw + bootstrap файловете се пращат на всяка заявка (`reference/token-use.md`) — затова workspace файловете на агента трябва да са кратки (без `MEMORY.md`, без skills); резултатите от `web_search` се кешират 15 min по query (`tools/web.md`), което помага при retry. Prompt caching на провайдъра (`reference/prompt-caching.md`) намалява цената на повтарящата се част.

За таймаут в `apps/api`: 120 s за `recipe.suggest`, 90 s за `menu.propose`, с един retry → най-лош случай ~4 минути. Заявката към OpenClaw да се пуска асинхронно (job + polling или дълъг request само от сървърна задача), не в request path на PWA-то.

## Препоръка

1. **Път:** `POST http://127.0.0.1:18789/v1/chat/completions`, non-streaming, `Authorization: Bearer <gateway password from openclaw.json>`, `model: "openclaw/<agentId>"`, без `user`/`x-openclaw-session-key` (stateless), `response_format: json_schema`, `max_completion_tokens` според контракта, `AbortController` таймаут. Изисква еднократно `gateway.http.endpoints.chatCompletions.enabled: true` + рестарт на gateway-а.
2. **Мрежа:** `api` контейнерът с `network_mode: "host"`; gateway-ът остава loopback-only. Паролата идва от env (`OPENCLAW_GATEWAY_PASSWORD`), никога в репото.
3. **Агенти:** `family-menu` и `family-recipe` през `openclaw agents add … --non-interactive`, после `config patch` с `tools.allow: ["web_search","web_fetch"]` (или `[]` за menu) + широк `deny`, `skills: []`, `subagents.allowAgents: []`, `model: "openai/gpt-6-sol"`. Инструкциите на контракта в `AGENTS.md` на съответния workspace, версионирани в репото.
4. **Формат:** prompt + `response_format` + Zod от `packages/shared` + 1 retry с грешката; `llm-task` през `/tools/invoke` да се държи наум като по-евтин вариант за контрактите без търсене, ако се окаже, че chat completions дава твърде много невалиден JSON.
5. **Не ползваме:** CLI от контейнера (600 MB, без предимство), `/hooks/agent` (не връща изход), `/v1/responses` (без json_schema), `claude-cli` runtime за контрактите (без tool policy/структуриран изход/цена).
6. **Следваща стъпка:** отделен ticket за конфигурацията на сървъра (включване на endpoint-а, двата агента, workspace файловете) и измерване на реална цена/латентност с 10 извиквания преди да фиксираме таймаутите.

## Отворени въпроси

- Доколко `response_format: json_schema` реално се спазва от `openai/gpt-6-sol` през вградения runtime при наличие на tool calls — проверява се с първите реални извиквания.
- Дали non-streaming отговорът на `/v1/chat/completions` включва `usage` (документирано е само за streaming с `include_usage`). Ако не — цената се чете от Control UI → Usage по агент.
- Къде да живеят `AGENTS.md` на агентите: в това репо (`infra/openclaw/`) с copy при deploy, или само на сървъра.
