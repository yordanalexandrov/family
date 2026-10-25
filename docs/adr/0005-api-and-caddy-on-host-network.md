---
status: accepted
date: 2026-10-25
---

# `api` и `caddy` вървят на host мрежата на Docker, само на loopback

OpenClaw gateway на `homesrv` слуша само на `127.0.0.1:18789`, а `api` трябва да го вика за AI контрактите. От bridge мрежа на Docker loopback-ът на хоста е недостижим, затова `api` и `caddy` се пускат с `network_mode: host` и слушат само на `127.0.0.1` (`caddy` на `18090`, `api` на `18091`); `postgres` остава в bridge мрежа и публикува `127.0.0.1:5432`. cloudflared (също на host мрежата) стига до Caddy по loopback, нищо не се вижда от LAN и конфигурацията на OpenClaw не се пипа. Алтернативата, gateway-ът да слуша на адреса на `docker0`, би дала чист compose с вътрешна мрежа, но пренастройва OpenClaw и маршрута на `ai.yo-po.eu` и разширява достъпа до credential с operator права. Цената на избора: `api` и `caddy` губят изолацията и DNS имената на compose мрежата и говорят помежду си по фиксирани loopback портове от env.
