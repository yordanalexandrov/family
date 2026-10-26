# Проучване: сайтове и блогове с рецепти за `recipe.normalize`

Отговор на GitHub issue #61. Контекст: контрактът `recipe.normalize` (`docs/concept.md`, „AI контракти“, фаза 2) приема URL или текст на рецепта и връща рецепта с продукти от регистъра (`ingredient`), количества и единици (`unit`: `g | kg | ml | l | pcs | tbsp | tsp | pinch` — `packages/shared/src/food/units.ts`), стъпки и порции. Как `apps/api` вика OpenClaw е описано в `docs/research/openclaw-invocation.md` (клон `research/openclaw-invocation`).

Дата на достъп до всички страници: **2026-10-26**. Всяка страница е изтеглена веднъж с `curl` от домашна мрежа в България, с обикновен браузърен User-Agent (Chrome 141 на Linux) и `Accept-Language: bg,en`, без бисквитки, без JavaScript и без опити да се заобиколи защита от ботове. Анализът (JSON-LD, microdata, маркери на плъгини) е направен със скрипт върху запазения HTML. Където пише „блокиран“, това е отговорът, който получава обикновен сървърен fetch; браузър с JavaScript може да мине.

## TL;DR

1. **Големите чужди сайтове и WordPress блоговете с recipe плъгин почти винаги имат schema.org `Recipe` в JSON-LD.** От 25 успешно изтеглени чужди сайта 24 имат JSON-LD `Recipe`, а 1 (smitten kitchen) има microdata/h-recipe. Шаблонът е един и същ: `recipeIngredient` е **масив от свободни низове** („2 tablespoons (30ml) olive oil“), `recipeInstructions` е масив от `HowToStep` (понякога групирани в `HowToSection`), времена в ISO 8601, `recipeYield` в разнородна форма.
2. **Българските лични блогове почти никога нямат структурирани данни.** 0 от 10 проверени блога (8 на Blogger, 1 на WordPress.com, 1 на WordPress) имат `Recipe` в JSON-LD или microdata. Рецептата е свободен текст в тялото на публикацията с повтарящи се заглавия „Продукти:“ / „Необходими продукти:“ и „Начин на приготвяне:“ / „Приготвяне:“. За българските блогове пътят е **текст → AI**, не JSON-LD.
3. **Българските портали са смесени:** recepti.gotvach.bg, bonapeti.bg, 1001recepti.com и matekitchen.com имат JSON-LD; receptite.com и az-jenata.bg имат само microdata; kulinarno.bg, supichka.com, pepi.bg, kakvodaqm.bg нямат нищо. Общо 6 от 10 портала дават някакъв `Recipe`.
4. **Около една трета от популярните чужди сайтове блокират сървърен fetch:** 11 от 36 чужди сайта връщат Cloudflare managed challenge (`403`, `cf-mitigated: challenge`), Vercel Security Checkpoint (`429`), `406` (tasty.co) или `403` (simplyrecipes). Това са предимно големи американски WordPress блогове (Budget Bytes, Sally's Baking Addiction, Cookie and Kate, The Woks of Life, Half Baked Harvest…). Нито един български сайт не блокира.
5. **Продуктите никъде не са структурирани в JSON-LD** — дори WP Recipe Maker, който пази количество, единица и име отделно в HTML-а (`wprm-recipe-ingredient-amount/unit/name`), ги слепва в низ в JSON-LD. Детерминистичен парсър на реда („количество + единица + остатък“) покрива голямата част; AI трябва за съпоставка на името с регистъра и за единици извън нашия списък (cup, lb, oz, ч.ч., скилидка, глава, връзка, пакет, консерва).
6. **Страницата да я тегли api-то, не агентът.** `web_fetch` на OpenClaw връща Readability markdown (≤ 20 000 знака по подразбиране), не суровия HTML, така че JSON-LD-то се губи; api-то може да извлече JSON-LD детерминистично, да контролира SSRF, кодировка и размер и да подаде на агента само кратък, вече структуриран вход. Агентът за `recipe.normalize` може да е без инструменти (`llm-task`).
7. **При блокиране — не заобикаляме, а предлагаме „постави текста“.** Няколко големи сайта изрично забраняват в `robots.txt` user-triggered AI fetchers (`Claude-User`, `ChatGPT-User`, `FirecrawlAgent`), а fallback-ът на `web_fetch` към Firecrawl е точно „bot-circumvention mode“.

---

## 1. Резултати по сайт

Легенда: **LD** = schema.org `Recipe` в JSON-LD; **MD** = microdata `itemtype=schema.org/Recipe`; **—** = няма структурирани данни. „Стъпки“ е формата на `recipeInstructions`. „Хран.“ = има `nutrition`.

### 1.1 Български портали

| Сайт | Примерна страница | HTTP | Схема | Порции (`recipeYield`) | Продукти | Стъпки | Времена | Хран. | Бележки |
|---|---|---|---|---|---|---|---|---|---|
| recepti.gotvach.bg | `/r-5658-Класическа_боб_чорба` | 200 | LD | `"6"` | низове, формат „**име - количество единица**“: `"боб -  500 г"`, `"чушки -  2  -  3 броя (200 г)"` | `HowToStep[]` | prep/cook/total | не | Обратен ред спрямо всички други сайтове; двойни интервали |
| bonapeti.bg | `/recepti/tikvenik2/` | 200 | LD | `"1"` | низове: `"1 пакет  точени кори (400 г)"`, `"1–1,2 кг  тиква"` | `string[]` | `PT0H`, `PT0M` (нули) | да | Нулеви времена = „неизвестно“; порции „1“ = една тава |
| 1001recepti.com | `/recipe/?recipe_id=2439-lazania-boloneze` | 200 | LD | `"8 servings"` | низове | `HowToStep[]` | cook | да | **`windows-1251`**, обявено само в HTTP хедъра `Content-Type` (няма `<meta charset>`) |
| matekitchen.com | `/recipes/knizhen-kebap-ot-gabi/` | 200 | LD | `"1 Порции"` | низове с английски единици: `"300 gram гъби"`, `"3 bunch зелен лук"` | `HowToStep[]` | prep/cook/total | да | WordPress + собствен плъгин (`recipe-manager`) |
| receptite.com | `/рецепта/киш-лорен-quiche-lorraine` | 200 | MD | няма | 8 × `itemprop="ingredients"` (старото име на свойството) | един `recipeInstructions` блок | няма | не | Само microdata |
| az-jenata.bg | `/a/3-gotvarstvo/81987-...` | 200 | MD | да | 7 × `itemprop="recipeIngredient"` | 11 × `recipeInstructions` | total | не | Женски портал на WordPress; JSON-LD-то е само за статията |
| kulinarno.bg | `/recepta/солена-торта-...-16856` | 200 (само по `http://`) | — | „Порции 4“ в текста | „Необходими продукти:“ + редове „qty unit име“ | „Начин на приготвяне:“ с номерирани стъпки | — | — | **HTTPS не работи** (сертификатът не покрива `kulinarno.bg`/`www.kulinarno.bg`); сайтът работи по HTTP |
| supichka.com | `/рецепта/817/лютеница-в-instant-pot` | 200 | — | — | HTML `class="ingredient"`, но формат „**име** ⏎ **количество**“ („домати ⏎ 2 кг“) | „Рецептата:“ | — | — | Собствен CMS; редовете се четат детерминистично по класа |
| pepi.bg | `/оригинална-рецепта-за-тиквеник/` | 200 | — | — | свободен текст: `"500 гр. кори за баница"` | свободен текст | — | — | Общ портал (WordPress, tagDiv), рецептите са статии |
| kakvodaqm.bg | `/deserti-idei-za-sladki/tikvenik/` | 200 | — | — | „Необходими продукти:“ + `"7 бр. фини точени кори /200 г/"` | свободен текст | — | — | WordPress + Elementor + WooCommerce |

Отпаднали кандидати: `lubimiretsepti.com` няма DNS запис, `lubimirecepti.com` връща 404, `recepti.bg` и `zhenata.com` не отговарят.

### 1.2 Български лични блогове

| Блог | Платформа | Примерна страница | HTTP | Схема | Как изглежда рецептата |
|---|---|---|---|---|---|
| mish-mash.recipes | Blogger (собствен домейн) | `/2026/10/morkovi-po-marokanski.html`, `/2016/04/klasicheska-musaka.html` | 200 | — | „Необходими продукти за …“ + редове `"4 ч.л. семена от кимион"`, „Как се приготвят …“ + абзаци; има „Източник:“ с линк към оригинала |
| mycookingcreations.com | Blogger (собствен домейн) | `/2026/10/italianska-supa-s-tikva-i-bob.html` | 200 | — | „Продукти : (за 4 порции)“ + `"600-700г обелена и изчистена тиква (около 1 кг с кората и семето)"`, `"1 литър зеленчуков бульон"`, `"зехтин"` без количество |
| gladni.com | Blogger (собствен домейн) | `/2024/07/tavche-gravche.html` | 200 | — | `"1/2 ч.ч. олио"`, `"1/4 ч.ч. магданоз"`, „Начин на приготвяне:“ |
| receptivkysni.blogspot.com | Blogger | `/2019/12/blog-post.html` | 200 | — | „Продукти:“ + `"-1 пакет кори"`, `"-канела на вкус"`, `"около четвърт настъргана тиква"` — количества по желание |
| privanya.blogspot.com | Blogger | `/2024/10/blog-post.html` | 200 | — | Групи „Продукти за намазване на корите :“, „Още :“, „Приготвяне :“ |
| kitchen-miriams28.blogspot.com | Blogger | `/2012/04/blog-post_24.html` | 200 | — | Продуктите са вплетени в разказа („по желание 100 мл вино…“) |
| nia-cooking.blogspot.com | Blogger | `/2011/06/blog-post_20.html` | 200 | — | Разказ с продукти в текста |
| zi4e57.blogspot.com | Blogger | `/2010/09/blog-post_4424.html` | 200 | — | „ПРОДУКТИ:“ + `"700гр-кайма"`, `"1глава -кромид лук"`, `"1ч.ч.-олио"` (без интервали, тире вместо интервал) |
| inthebeniskitchen.com | WordPress.com (CoBlocks) | `/2020/01/21/мусака/` | 200 | — | Редове `"1200 гр. картофи"`, `"½ връзка магданоз"`; заливката е в един ред, разделен със запетаи |
| gotvim-bg.com | WordPress (тема Sahifa) | `/recepta-za-prigotvyane-na-tavche-gravche/` | 200 | — | „съставки:“ + `"1 чаша сух боб … или 2 чаши консервиран боб"`, „Инструкции:“ |

Blogger URL-ите с кирилски заглавия стават `/YYYY/MM/blog-post_NN.html` — по URL-а не се познава рецептата. Не е намерен нито един български блог с WP Recipe Maker или Tasty Recipes.

### 1.3 Чужди сайтове (редакционни)

| Сайт | Примерна страница | HTTP | Схема | `recipeYield` | Продукти (пример) | Стъпки | Времена | Хран. | `robots.txt`: блокирани AI агенти* |
|---|---|---|---|---|---|---|---|---|---|
| allrecipes.com | `/recipe/219171/classic-meatloaf/` | 200 | LD | `"10"` | `"0.5 medium onion, coarsely chopped"` | `HowToStep[]` | ISO | да | ClaudeBot, **Claude-User**, Claude-SearchBot, anthropic-ai, CCBot, Google-Extended, PerplexityBot, Perplexity-User, Bytespider, **FirecrawlAgent** |
| bbcgoodfood.com | `/recipes/healthy-beef-chow-mein` | 200 | LD | `"2"` | `"2 wholemeal noodle nests (85g)"` | `HowToStep[]` | ISO | да | GPTBot, CCBot, Bytespider; `Content-Signal: search=yes, ai-train=no` |
| seriouseats.com | `/caesar-spaghetti-recipe-8667582` | 200 | LD | `"6"` | `"1/2 cup (1 1/4 ounces; 35g) panko breadcrumbs"` | `HowToSection[HowToStep[]]` | ISO | да | като allrecipes (същият издател) |
| cooking.nytimes.com | `/recipes/1023925-...` | 200 | LD | `"4 servings"` | `"Salt and pepper"`, `"1 to 1 ½ pounds green cabbage…"` | `HowToStep[]` | ISO | да | всички изброени, вкл. **ChatGPT-User** и **Claude-User** |
| bonappetit.com | `/recipe/toasted-orzo-chicken-soup` | 200 | LD | `"4–6 servings"` | `"1½ tsp. Diamond Crystal or ¾ tsp. Morton kosher salt"` | `HowToStep[]` | **`"50 minutes"`** (не ISO) | не | Claude-User, FirecrawlAgent и др. |
| epicurious.com | `/recipes/food/views/sheet-pan-sticky-apricot-chicken` | 200 | LD | `"4 servings"` | `"4 chicken legs (thigh and drumstick; about 2 lb. total)"` | `HowToStep[]` | `"15 minutes"`, `"1 hour"` (не ISO) | не | (същият издател като Bon Appétit) |
| jamieoliver.com | `/recipes/chicken/sticky-orange-chicken/` | 200 | LD | `"2"` | `"2 x 150g skinless free-range chicken breasts"` | `HowToStep[]` | ISO | да | GPTBot, ClaudeBot, CCBot; `Content-Signal: search=yes,ai-train=no,use=reference` |
| foodnetwork.com | → пренасочва към foodnetwork.co.uk | 200 | LD | `"2"` | `"2 tablespoons olive oil"` | **един низ** | prep | не | — |
| tasteofhome.com | `/recipes/cowboy-cornbread-casserole/` | 200 | LD | `"6 servings"` | `"1 can (15 ounces) Ranch Style beans…"` | `HowToStep[]` | ISO | да | — |
| delish.com | `/cooking/recipe-ideas/a74208398/...` | 200 | LD | `"4 - 6 serving(s)"` | `"1 1/2 c. dried apricots"` | `HowToStep[]` | ISO, `cookTime: PT0S` | да | — |
| ottolenghi.co.uk | `/pages/recipes/shakshuka` | 200 | LD | няма | `"2 tbsp olive oil"` | `HowToStep[]` | няма | не | — |
| chefkoch.de | `/rezepte/493951143751463/Spaghetti-Napoli.html` | 200 | LD | `["4", "4 Portionen"]` | `"1 Zwiebel(n)"`, `"1 EL Olivenöl"` | `HowToSection[HowToStep[]]` | ISO | да | GPTBot, ClaudeBot, anthropic-ai, CCBot, PerplexityBot, Bytespider, FirecrawlAgent |
| giallozafferano.it | `Patate-al-forno-ripiene.html` | 200 | LD | `"4"` | **„име количество“**: `"Manzo macinato 120 g"` | `string[]` | ISO | да | GPTBot, ClaudeBot, anthropic-ai, CCBot, Google-Extended, PerplexityBot, Bytespider |
| marmiton.org | `recette_pot-au-feu-de-boeuf_20605.aspx` | 200 | LD | `"6 personnes"` | `"1 kg de jarrets de boeuf"` | `HowToStep[]` | ISO | да | — |
| simplyrecipes.com | `/recipes/perfect_guacamole/` | **403** | — | | | | | | страница „Simple Page“ с JS проверка |
| food52.com | `/recipes/82255-best-lentil-soup` | **429** | — | | | | | | „Vercel Security Checkpoint“ |
| tasty.co | `/recipe/one-pot-garlic-parmesan-pasta` | **406** | — | | | | | | празен отговор (Fastly) |

\* Агенти с `Disallow: /` в `robots.txt` от списъка GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-User, Claude-SearchBot, anthropic-ai, CCBot, Google-Extended, PerplexityBot, Perplexity-User, Bytespider, FirecrawlAgent. „—“ = нито един.

### 1.4 Чужди лични блогове

| Блог | Плъгин | HTTP | Схема | `recipeYield` | Продукти (пример) | Стъпки | Хран. | Бележки |
|---|---|---|---|---|---|---|---|---|
| recipetineats.com | WP Recipe Maker (+ Mediavine) | 200 | LD | `["4"]` | `"4  chicken thighs, bone-in, skin on ((~250g/8oz each) (Note 1))"` | `HowToSection[HowToStep[]]` | да | `robots.txt` блокира anthropic-ai, CCBot |
| minimalistbaker.com | WPRM | 200 | LD | `["4", "4 (Servings)"]` | `"1/2 cup raw cashews*"` | `HowToStep[]` | да | |
| cafedelites.com | WPRM | 200 | LD | `["6", "6 bowls"]` | `"1 large cauliflower (about 2 pounds or 1 kilo, cut into florets)"` | `HowToStep[]` | да | HTML-ът има `wprm-recipe-ingredient-amount/unit/name/notes` |
| skinnytaste.com | WPRM (+ Mediavine) | 200 | LD | `["6", "6 servings"]` | `"2 tablespoons all purpose flour (or gluten-free flour mix)"` | `HowToSection` + `HowToStep` | да | `cookTime: PT525M` (ненормализирано, но валидно) |
| justonecookbook.com | WPRM | 200 | LD | `["2"]` | `"¼ tsp Diamond Crystal kosher salt"` | `HowToSection` + `HowToStep` | да | исканата страница пренасочи към друга рецепта |
| loveandlemons.com | WPRM | 200 | LD | `["8"]` | `"⅓ cup smooth tahini*"` | `HowToStep[]` | не | Unicode дроби |
| hebbarskitchen.com | WPRM | 200 | LD | `["6", "6 Servings"]` | `"2 cup maida"`, `"¼ tsp ajwain"` | `HowToStep[]` | да | |
| recipesfromeurope.com | WPRM (+ Mediavine) | 200 | LD | `["6", "6 -8 slices"]` | `"9 ounces feta cheese (crumbled; or Sirene cheese)"` | `HowToStep[]` | да | рецепта за баница на английски |
| pinchofyum.com | **Tasty Recipes** | 200 | LD | `["6", "6-8 servings"]` | `"3 large carrots, peeled and cut into large chunks"` | `HowToStep[]` | да | HTML-ът има `data-amount` / `data-unit` |
| chasingthedonkey.com | **Mediavine Create** | 200 | LD | няма | `"500-600 g of all-purpose flour"` | `HowToStep[]` | не | без времена |
| smittenkitchen.com | **Jetpack Recipe** (h-recipe) | 200 | **MD** | `itemprop="recipeYield"` | 11 × `itemprop="recipeIngredient"` | един блок | — | класове `jetpack-recipe-ingredient` |
| budgetbytes.com | (WPRM) | **403** | — | | | | | Cloudflare `cf-mitigated: challenge` („Just a moment…“) |
| sallysbakingaddiction.com | | **403** | — | | | | | Cloudflare challenge |
| cookieandkate.com | | **403** | — | | | | | Cloudflare challenge |
| davidlebovitz.com | | **403** | — | | | | | Cloudflare challenge |
| halfbakedharvest.com | | **403** | — | | | | | Cloudflare challenge |
| vegrecipesofindia.com | | **403** | — | | | | | Cloudflare challenge |
| thewoksoflife.com | | **403** | — | | | | | Cloudflare „Security Verification“ |
| thekitchn.com | | **403** | — | | | | | (проверена само началната страница) |

### 1.5 Обобщение в числа

| Група | Проверени | Блокирани | JSON-LD `Recipe` | Само microdata | Нищо |
|---|---|---|---|---|---|
| Български портали | 10 | 0 | 4 | 2 | 4 |
| Български лични блогове | 10 | 0 | 0 | 0 | 10 |
| Чужди редакционни | 17 | 3 | 14 | 0 | 0 |
| Чужди лични блогове | 19 | 8 | 10 | 1 | 0 |

От изтеглените чужди страници (25) всички освен една имат JSON-LD.

## 2. Шаблони, които се повтарят

### 2.1 JSON-LD `Recipe`

Дефиницията на типа и свойствата е в https://schema.org/Recipe; Google описва изискванията за rich results в https://developers.google.com/search/docs/appearance/structured-data/recipe — оттам идва еднаквостта: плъгините и CMS-ите генерират точно това, което Google иска.

- **Къде е:** в `<script type="application/ld+json">`; често в `@graph` заедно с `WebPage`, `Article`, `Person` (Yoast + WPRM), понякога `@type` е масив. Парсърът трябва да обхожда `@graph`, масиви и `mainEntity`.
- **`recipeIngredient`:** навсякъде `string[]`. Никъде не се срещат структурирани количества. Редът е „количество единица име, бележка“, освен в recepti.gotvach.bg („име - количество единица“) и giallozafferano („Име количество единица“).
- **`recipeInstructions`:** три форми — `HowToStep[]` (преобладава), `HowToSection[]` с вложени `HowToStep[]` (chefkoch, Serious Eats, RecipeTin Eats, Just One Cookbook, Skinnytaste), `string[]` (bonapeti, giallozafferano) и един низ (Food Network). Всички се свеждат до подреден списък от текстове детерминистично.
- **`recipeYield`:** число, низ (`"6"`, `"4–6 servings"`, `"6 personnes"`, `"1 Порции"`, `"4 - 6 serving(s)"`) или масив (WPRM: `["6", "6 bowls"]`); липсва в 2 от 28. Първото цяло число дава порциите; при диапазон — долната граница или питане на човека.
- **Времена:** ISO 8601 (`PT1H40M`, `PT525M`) почти навсякъде; Condé Nast (Bon Appétit, Epicurious) пише `"50 minutes"`, `"1 hour"`; bonapeti и delish имат нули (`PT0M`, `PT0S`), които значат „няма данни“.
- **`nutrition`:** има в 21 от 28 JSON-LD рецепти, на порция (`NutritionInformation`). GLOSSARY-то говори за хранителна стойност на 100 г — превръщането изисква тегло на порцията, което сайтовете не дават.
- **`recipeCategory` / `recipeCuisine`:** свободен текст на езика на сайта; не става за слотовете ни без AI.

### 2.2 Плъгини на WordPress

- **WP Recipe Maker** (8 от 11 чужди блога с данни): в JSON-LD продуктите са низове, но HTML картата пази `wprm-recipe-ingredient-amount`, `-unit`, `-name`, `-notes` поотделно — по-надежден източник за количеството от низа.
- **Tasty Recipes** (Pinch of Yum): JSON-LD + `data-amount`/`data-unit` в HTML.
- **Mediavine Create** (Chasing the Donkey; заедно с WPRM при още 3): JSON-LD.
- **Jetpack Recipe** (smitten kitchen): само microdata/h-recipe.
- **Собствени плъгини** в България (matekitchen.com: `recipe-manager`) също генерират JSON-LD.

### 2.3 Свободен текст в българските блогове

Структурата е изненадващо еднаква и позволява евтино предварително извличане преди AI:

- Заглавие на продуктите: „Продукти:“, „Необходими продукти:“, „Необходими продукти за …“, „ПРОДУКТИ:“, „съставки:“; понякога с порции „(за 4 порции)“.
- Заглавие на стъпките: „Начин на приготвяне:“, „Приготвяне:“, „Как се приготвят …“, „Инструкции:“, „Рецептата:“.
- Подгрупи: „За заливката:“, „Още :“, „Продукти за намазване на корите :“.
- Редът: „количество единица име (бележка)“; варианти без интервал (`"700гр-кайма"`, `"1глава -кромид лук"`), с тире в началото (`"-1 пакет кори"`), без количество (`"зехтин"`, `"сол и черен пипер на вкус"`), с алтернатива (`"1 чаша сух боб … или 2 чаши консервиран боб"`).
- Порциите рядко са написани.

### 2.4 Количества и единици, които срещнахме

| Вид | Български | Чужди | Към нашия `unit` |
|---|---|---|---|
| Тегло | г, гр, гр., грама, gram, кг | g, kg, lb, lb., pound(s), oz, ounces | `g`, `kg`; lb/oz → `g` по фиксиран коефициент |
| Обем | мл, л, литър | ml, l, cup(s), c. | `ml`, `l`; cup → `ml` (240) само за течности |
| Лъжици | ч.л., ч. л., с.л., супена лъжица, чаена лъжица | tsp, Tbsp., tablespoons, EL, TL | `tsp`, `tbsp` |
| Чаши | ч.ч. (чаена чаша), чаша, 1/3 чаена чаша | cup | **няма** — за брашно/захар трябва плътност → AI оценка в `g` |
| Броими | бр., броя, глава, скилидка, връзка, стрък, палка, топка, пакет, консерва | clove, stalk, can, nest, rib, bunch, x 150g | `pcs` или превръщане в `g` (пакет кори 400 г, консерва 400 г) — AI |
| По вкус | на вкус, щипка, по желание | to taste, plus more | `pinch` |
| Числа | `1/2`, `½`, `1,5`, `1–1,2`, `500-600`, `2 - 3`, `10-тина`, „около четвърт“ | `1 1/2`, `¼`, `0.5`, `1 to 1 ½` | диапазон → долна граница или средна; „около“ → AI |

Чуждите сайтове често дават метрична стойност в скоби (`"1/2 cup (1 1/4 ounces; 35g)"`, `"1 onion (160g)"`) — тя трябва да се предпочита пред чашата.

### 2.5 Технически капани при изтеглянето

- **Кодировка:** 1001recepti.com е `windows-1251`, обявено само в HTTP хедъра. Декодиране „на сляпо“ като UTF-8 поврежда кирилицата и в JSON-LD-то.
- **Само HTTP:** kulinarno.bg няма валиден HTTPS сертификат за домейна си.
- **Гео-пренасочване:** foodnetwork.com от България отива на foodnetwork.co.uk (друга рецепта, друг URL).
- **Пренасочване към друга рецепта:** justonecookbook.com пренасочи стар slug към друга рецепта; трябва да пазим крайния URL и да показваме заглавието за потвърждение.
- **Размер:** страниците са 20–415 KB HTML (WPRM блоговете са най-тежки); JSON-LD-то е 2–10 KB от тях.
- **JS-only рендериране:** не срещнахме сайт, при който рецептата да липсва в HTML-а без JavaScript — Next.js/Nuxt сайтовете (NYT Cooking, BBC Good Food, delish, chefkoch) рендерират JSON-LD на сървъра. NYT Cooking дава пълния списък продукти и стъпки в JSON-LD-то, въпреки paywall-а.
- **Блокиране:** всички блокирания са защита от ботове на ниво CDN (Cloudflare managed challenge, Vercel Security Checkpoint, Fastly 406), а не JavaScript рендериране на съдържанието. Изискват изпълнение на JavaScript challenge — нещо, което нито `curl`, нито `web_fetch` прави.

## 3. Лиценз и ToS бележки

- **Авторско право:** Службата за авторско право на САЩ приема, че „a mere listing of ingredients or contents, or a simple set of directions, is uncopyrightable“; защитен може да е творческият текст и снимките, но не списъкът продукти и процесът (U.S. Copyright Office, Circular 33 „Works Not Protected by Copyright“, раздел „Recipes“, https://www.copyright.gov/circs/circ33.pdf). Българското право не е проверявано тук.
- **robots.txt:** големите американски издатели (Dotdash Meredith — Allrecipes, Serious Eats; Condé Nast — Bon Appétit; NYT) изрично забраняват и user-triggered агентите (`Claude-User`, `ChatGPT-User`, `Perplexity-User`) и `FirecrawlAgent`. BBC Good Food и Jamie Oliver обявяват `Content-Signal: ai-train=no` (Jamie Oliver и `use=reference`). Нито един български сайт няма правила за AI агенти. `robots.txt` не е договор, но е ясен сигнал за намерение.
- **Практическо следствие:** приложението тегли само URL, който член на семейството е подал ръчно, веднъж, за лична употреба, пази `source_url` и не публикува рецептите. Не обхожда сайтове, не кешира чужд HTML дългосрочно и не заобикаля защити. Условията за ползване на отделните сайтове не са четени изцяло.

## 4. Предложение за пайплайн

```
PWA: URL или текст ──► apps/api: job
  URL:
   1. fetch (api)          — SSRF guard, ≤ 3 redirects, ≤ 2 MB, 10 s, charset по хедър/meta
      403/429/406/challenge ──► „Сайтът не позволява автоматично четене — постави текста на рецептата“
   2. extract (api, детерминистично)
      a. JSON-LD Recipe (@graph, масиви, @type масив, HowToSection)
      b. microdata Recipe / h-recipe (itemprop recipeIngredient | ingredients, recipeInstructions, recipeYield)
      c. HTML карта на плъгин, ако има (wprm-recipe-ingredient-amount/unit/name, data-amount)
      d. иначе: основен текст на страницата (без script/style/nav), изрязан около „Продукти“/„Ingredients“
   3. pre-normalize (api, детерминистично)
      заглавие, порции (първо цяло число от recipeYield), времена (ISO 8601 + „50 minutes“, 0 = няма),
      стъпки (плосък списък), редове продукти → {quantity?, unitToken?, rest} по таблица от §2.4
  Текст: директно към 4 с целия текст.
   4. recipe.normalize (OpenClaw, без инструменти)
      вход: редовете продукти (+ pre-parse) + регистърът (име, основна единица, ~150 реда)
            или свободният текст при 2d / текст от потребителя
      изход: за всеки ред ingredient_id | предложение за нов продукт, quantity, unit ∈ unitSchema, увереност;
             при свободен текст — и заглавие, порции, стъпки
      Zod валидация, един retry
   5. PWA: преглед и одобрение преди запис в регистъра рецепти
```

**Какво остава за AI:** съпоставка на „2 стръка пресен лук“ / „scallions“ с продукта от регистъра, превръщане на единици без фиксиран коефициент (чаша брашно, пакет кори, скилидка, глава лук → `g`/`pcs`), разчитане на редове без структура и на целите текстове от българските блогове. Всичко останало (обхождане на JSON-LD, порции, стъпки, времена, числа, дроби, диапазони, единици с фиксиран коефициент) е детерминистично и тестваемо с примерите от §1.

**Защо регистърът влиза в prompt-а:** ~150 продукта с основна единица са няколко хиляди токена; това е по-евтино и по-просто от търсене, а моделът вижда всички кандидати. При растеж на регистъра — предварителен филтър в api (напр. по `pg_trgm` подобие) до 20–30 кандидата на ред.

### 4.1 Кой тегли страницата: api-то

Препоръка: **api-то**. Причини:

1. **JSON-LD-то се губи при агента.** `web_fetch` прави „plain HTTP GET and extracts readable content (HTML to markdown or text)“ чрез Readability, `maxChars` е ограничен до `tools.web.fetch.maxCharsCap` (по подразбиране 20 000) и не изпълнява JavaScript (https://docs.openclaw.ai/tools/web-fetch). Документацията не казва, че запазва `<script type="application/ld+json">`; Readability по замисъл извлича видимия текст. Детерминистичният път (§4, стъпки 2–3) изисква суровия HTML.
2. **Детерминизъм и тестове.** Извличането от JSON-LD/microdata е чиста функция `html → draft recipe`, тестваема с fixture-и от реални страници (тези в §1). Агентът би правил същото недетерминистично и по-скъпо.
3. **Цена и латентност.** Всеки tool call на агента е нов round trip към модела (`docs/research/openclaw-invocation.md`, §5). При JSON-LD сайт с api fetch моделът получава само редовете продукти — един кратък turn, без web.
4. **По-малка повърхност за атака.** Съдържанието на страницата е недоверен вход (prompt injection). Агент без инструменти (`llm-task`, който `docs/research/openclaw-invocation.md` §4.2 вече сочи като подходящ за `recipe.normalize`) не може да бъде подтикнат да тегли други URL-и или да прави нещо друго; изходът минава през Zod.
5. **Контрол върху мрежата.** api-то решава SSRF (само `http`/`https`, проверка на резолвнатия IP срещу частни мрежи при всеки redirect — api-то е в Docker на домашния сървър), лимит на размера, кодировката (`windows-1251`), HTTP-only сайтове и ясна грешка за блокиране към PWA-то.
6. **Fallback-ът на агента е проблемен.** При неуспех `web_fetch` може да мине през Firecrawl „bot-circumvention mode“ (същата страница с документация), а Allrecipes, Serious Eats, Bon Appétit и chefkoch изрично забраняват `FirecrawlAgent` в `robots.txt`.

Агентът тегли сам само в `recipe.suggest` (фаза 1), където трябва да търси и да чете много страници.

## Отворени въпроси

1. **User-Agent на api-то.** Тестът е с браузърен User-Agent. Честен идентификатор на приложението (напр. `family-app/1.0 (+https://github.com/yordanalexandrov/family)`) е по-коректен спрямо `robots.txt`, но може да увеличи блокиранията. Решение за потребителя; не е тествано.
2. **IP на сървъра.** Резултатите са от домашна мрежа; Cloudflare преценява и по репутация на IP. От домашния сървър би трябвало да е същото, но не е проверено.
3. **Дял блокирани в реалната употреба.** Ако семейството ползва основно български сайтове и блогове, блокиранията са рядкост (0 от 20); ако ползва американски блогове — около 1 на 3. Пътят „постави текста“ трябва да е удобен на телефон.
4. **Порции при диапазон** („4–6 servings“, „6-8 slices“) и **рецепти за „1 тава“** (bonapeti): долна граница, или питане при одобрението.
5. **Хранителна стойност:** JSON-LD я дава на порция, а GLOSSARY-то — на 100 г. Да вземем ли стойността на порция като отделно поле, или да я изчисляваме от продуктите?
6. **Българско авторско право** за рецепти не е проучено (виж §3).
