# VANTA 24/7 на GPU-сервере: телефон без включённого ПК

Эта инструкция для самостоятельной модели VANTA Sovereign (Ollama + SearXNG). Подходит для GPU VM с Ubuntu, SSH, NVIDIA-драйвером, Docker Compose и достаточным диском. Это не инструкция для обычного контейнерного GPU Pod без VM: обычный Pod не гарантирует возможность запускать Docker Compose внутри.

## 1. Аренда GPU VM

Для первой 24/7-версии выбирай VM c RTX 3090/4090 (24 GB VRAM), 24-32 GB системной RAM и ~80 GB диска. Для действительно крупных моделей нужна ещё большая VRAM. На Vast.ai выбирай именно Linux VM / Ubuntu VM с Docker Compose (не обычный Docker instance). Проверь стоимость хранения и интернета.

Официальная документация Vast.ai о VM: https://docs.vast.ai/ ; https://github.com/vast-ai/docs/blob/main/docs/linux-virtual-machines.mdx

Калькуляция: 24 часа × 30 дней = примерно 720 часов в месяц. Например, 0.15 USD/час ≈ 108 USD/месяц за саму VM. Это пример, не гарантированная цена. Годовой договор не нужен для первых тестов. Нужен платёжный аккаунт GPU-хостинга.

После аренды открой SSH-консоль GPU VM и убедись, что работают docker, docker compose и nvidia-smi.

## 2. Запуск VANTA на VM

Клонируй свой GitHub репозиторий в свою VM, перейди в каталог vanta/selfhost.

~~~bash
git clone https://github.com/anime-void-app/anime-void-app.github.io.git
cd anime-void-app.github.io/vanta/selfhost
cp .env.example .env
python3 -c 'import secrets; print(secrets.token_urlsafe(40)); print(secrets.token_urlsafe(40))'
~~~

Вставь ДВА РАЗНЫХ случайных секрета в VANTA_ACCESS_TOKEN и SEARXNG_SECRET внутри .env. Не размещай секреты в GitHub или переписке.

~~~bash
docker compose -f compose.yaml -f compose.gpu.yaml up -d --build
docker compose exec ollama ollama pull qwen3:4b
docker compose ps
~~~

В этой сборке Qwen3 4B — стартовая модель для теста; затем можно настроить MODEL_FAST, MODEL_SMART, MODEL_DEEP, MODEL_MAX на более сильные скачанные модели и выделить им достаточно GPU памяти. Предусмотрено SearXNG для поиска по интернету и ссылок на источники. Он не заменяет собственный индекс всего интернета.

Проверить backend на VM: `curl http://127.0.0.1:8765/api/health`. Порт 8765 слушает только localhost, Ollama и SearXNG не публикуются напрямую. Не открывай порты в интернет.

## 3А. Доступ с Android без собственного домена — Tailscale Serve

Это самый простой приватный вариант для первого теста. Установи Tailscale на GPU VM и Android. Войди в один Tailnet, включи на VM приватный HTTPS доступ:

~~~bash
sudo tailscale up
tailscale serve --bg 8765
tailscale serve status
~~~

Команда покажет HTTPS адрес `*.ts.net`, который будет доступен на телефоне с включённым Tailscale. Открой ссылку на телефоне, в настройках сайта введи только личный VANTA_ACCESS_TOKEN. Других аккаунтов API для текста не требуется. Когда VM выключена, чат недоступен.

## 3Б. Постоянный красивый URL через Cloudflare Tunnel (требует домен в Cloudflare)

Одна регистрация Cloudflare не даёт домен. У тебя должен быть домен, добавленный в Cloudflare с настроенным DNS. Не меняй DNS существующего сайта без предварительного плана миграции.

В Cloudflare Zero Trust создай remotely-managed Tunnel и Public hostname, например `vanta.yourdomain.com`, укажи сервис `http://app:8765` внутри Docker сети. Cloudflare Tunnel использует исходящее соединение и не требует публичного IP VM.

В приватном .env добавь (подставь СОБСТВЕННЫЕ значения локально, никуда не публикуй):

~~~dotenv
TUNNEL_TOKEN=long_secret_from_cloudflare_tunnel_settings
VANTA_ALLOWED_ORIGIN=https://vanta.yourdomain.com
~~~

Затем на VM:

~~~bash
docker compose -f compose.yaml -f compose.gpu.yaml -f compose.cloud.yaml up -d --build
docker compose ps
~~~

Открой созданный адрес с телефона. Сайт автоматически использует собственный HTTPS origin; для отправки запросов введи личный VANTA_ACCESS_TOKEN. Можно включить Cloudflare Access в качестве дополнительной защиты (предварительно проверить работу входа и API).

⚠️ Не включай открытый IP/порт Ollama, не публикуй SSH-ключ, .env, Tunnel Token и секреты в репозитории. Токен VANTA — отдельный секрет, не пароль Cloudflare.

## 4. Платёжный контроль и ограничения

- Нет лимита запросов/день, установленного кодом. Есть ограничения производительности GPU и одновременной нагрузки.
- Арендный GPU оплачивается за время включения VM, даже когда никто не пишет в чат; остановка может не остановить плату за диск.
- Выбери постоянный (on-demand), а не прерываемый Spot хостинг, если нужен 24/7. Рассчитывай бюджет до аренды.
- Модель изображения пока отсутствует в независимом режиме; Visual Lab сейчас требует отдельного сервиса картинок.
- Для более сильного ИИ необходима более мощная загруженная модель, а не просто переключение кнопки MAX.

Cloudflare Tunnel: https://developers.cloudflare.com/tunnel/get-started/ 
Tailscale Serve: https://tailscale.com/docs/features/tailscale-serve 
Vast.ai VM support: https://github.com/vast-ai/docs/blob/main/docs/linux-virtual-machines.mdx 