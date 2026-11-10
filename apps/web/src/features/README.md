# features — функционалностите по екрани

## Overview
Всяка поддиректория е една функционалност на клиента: екран (или част от екран), куките към api-то и чистата логика ѝ. Функционалностите стъпват на общите `../api`, `../app`, `../components` и `../lib`, а някои ползват една друга (например Готвене ползва таймери, глас и подготовка; Пазаруване ползва Килер). Кодът е в подпапките; директно в `features/` няма файлове.

## Subdirectories & Boundaries
- appliances: [./appliances/README.md](./appliances/README.md) - Слой за данни на уредите на домакинството (`/api/appliances`), оптимистични превключване и махане.
- calendar: [./calendar/README.md](./calendar/README.md) - Екранът „Календар“ с 14 дни, общият `DayEventList` и офлайн кеш `family.calendarCache`.
- cooking: [./cooking/README.md](./cooking/README.md) - Екранът „Готвене“: стъпки, продукти, подготовка, въпрос към AI с промени за готвенето, глас; напредък за деня в localStorage.
- dashboard: [./dashboard/README.md](./dashboard/README.md) - Дашбордът: ядро с пръстен на деня, бюджет, следващи дни, „Днес се готви“; kiosk/TV решетка с фокус от дистанционно.
- dev: [./dev/README.md](./dev/README.md) - Витрина на дизайн системата, само в dev (`/dev/glass`).
- device: [./device/README.md](./device/README.md) - Изборът на режим на устройството (`/device`).
- inbox: [./inbox/README.md](./inbox/README.md) - Входящата кутия (`/inbox`) и камбанката с бройката на непрочетените.
- menu: [./menu/README.md](./menu/README.md) - Менюто на седмицата: план, предложение на AI, гласове, разговор, замяна, размяна (`/api/menu/*`).
- pantry: [./pantry/README.md](./pantry/README.md) - Килерът: постоянни и временни продукти, оптимистични промени, отложено изтриване.
- preparation: [./preparation/README.md](./preparation/README.md) - „Подготовка“ на рецептата: поле във формата, изглед и преобразуване към `preparationSchema`.
- recipe-import: [./recipe-import/README.md](./recipe-import/README.md) - Внасяне на рецепта от текст, линк, снимка и споделяне (share target, Cache API).
- recipes: [./recipes/README.md](./recipes/README.md) - Регистърът на рецептите, формата и AI потоците „Подобри“, „Поправи с AI“, „Как мина?“.
- settings: [./settings/README.md](./settings/README.md) - „Настройки“ и Web Push абонаментът на устройството.
- shopping: [./shopping/README.md](./shopping/README.md) - Списъкът за пазаруване с офлайн кеш и опашка от отметки в IndexedDB.
- step-photos: [./step-photos/README.md](./step-photos/README.md) - Качване, миниатюра и преглед на снимки на стъпките.
- suggestions: [./suggestions/README.md](./suggestions/README.md) - Заявки за предложения на рецепти и общият преглед/одобрение на предложение.
- timers: [./timers/README.md](./timers/README.md) - Таймерите в Готвене: store в localStorage, звук, вибрация, блокер при излизане.
- voice: [./voice/README.md](./voice/README.md) - Четене на глас и гласови команди в браузъра.
- who: [./who/README.md](./who/README.md) - „Кой си?“ и стъпката за напомняния.
