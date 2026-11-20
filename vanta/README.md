# VANTA AI — personal hybrid AI

## VANTA VISUALS 04 — кастомная визуализация

На главной установлена оригинальная космическая сцена VANTA: трёхмерно выглядящее ядро, вращающиеся орбиты, световые частицы и тонкие связи, кинематографические панели и мягкие цветовые переходы.

**Настройки → Внешний вид:** три профиля оформления — NEBULA (фиолетовый), ARCTIC (бирюзовый), EMBER (золотой). Выбор хранится только в браузере. Анимации отключаются переключателем либо автоматически при системной настройке «Уменьшить движение».

Для Android оптимизировано число точек и частота обновления анимации. Если вкладка скрыта или открыт чат, фоновая анимация останавливается. Не используются внешние шрифты, рекламные скрипты или тяжёлые графические библиотеки.

Добавлены персональный VANTA SVG-значок, mobile manifest и стиль под браузер на Android. Это улучшает отображение сайта при добавлении на главный экран; полноценная установка PWA зависит от браузера и его требований.

**Важно:** визуальная оболочка не активирует бесплатный облачный ИИ автоматически. Для генерации ответов и изображений нужен настроенный бесплатный Cloudflare Worker. [Инструкция для Android с бюджетом 0 ₽](free-worker/README.md).

---

## Новый вариант: VANTA Sovereign — модель и поиск на собственном сервере

Если не хочешь зависеть от OpenRouter или суточных лимитов Cloudflare Workers AI, используй независимый backend на **Ollama + SearXNG**. Он запускает скачанные веса модели на твоём ПК или арендованном GPU, сам делает поиск и добавляет источники в ответы. Квоты сообщений/день нет, но скорость и доступность зависят от оборудования и внешних поисковых систем.

**[Инструкция и исходники самостоятельного режима](selfhost/README.md)**

Запуск: Docker Desktop → selfhost/.env со случайными секретами → docker compose up -d --build → docker compose exec ollama ollama pull qwen3:4b → личный сайт http://127.0.0.1:8765. С телефона можно зайти по приватному HTTPS через Tailscale Serve. Настоящий облачный мощный сервер требует отдельного GPU-хостинга.

В самостоятельном режиме живой поиск доступен через кнопку «🌐 Поиск». Генерация картинок локально пока не реализована: Visual Lab требует отдельный облачный шлюз или будущий diffusion-backend.

---


Owner: GitHub account anime-void-app.

Frontend (when GitHub Pages is enabled): https://anime-void-app.github.io/vanta/

Source: https://github.com/anime-void-app/anime-void-app.github.io/tree/main/vanta

VANTA is a personally owned AI chat interface with access to local and cloud models. It is NOT a newly trained foundation model. GitHub Pages hosts only static HTML/CSS/JS — it cannot run large language models.

## Available features

- Responsive dark interface with animated eclipse, conversations, model switching and custom personality.
- Local browser chat history, export, delete and optional session-only conversations.
- Cloud OpenRouter Auto, selected cloud models, and custom model IDs.
- Streaming output from the Cloudflare Worker gateway.
- No API keys or credentials checked into GitHub.
- External provider processing is explicitly disclosed. No external fonts or analytics scripts.

## VANTA 0.3 — Image Studio and intelligence modes

The public interface now has a full-screen **Image Studio** and an animated bottom navigation bar for smartphones. Images are not faked: after you deploy the Cloudflare Worker, clicking Generate sends a paid request to OpenRouter's actual `POST /api/v1/images` endpoint.

Image presets in the dropdown:

| Preset | Model ID | Design goal |
|---|---|---|
| FAST | `google/gemini-3.1-flash-lite-image` | Quick experiments |
| PRO | `google/gemini-3.1-flash-image` | Balanced quality |
| ULTRA | `openai/gpt-image-2.6-sunburst` | Detailed rendering |

You can choose 1:1, 9:16, 16:9, 3:4 or 4:3. Only one image is requested at a time, and the image is shown in a private browser preview with a Download button. It is **not saved in the server or a cloud gallery**. The site displays actual USD API cost if OpenRouter provides it. Different model providers may support different ratios, and a request can fail if unsupported. Each request costs money; the code does not promise free generation.

Text intelligence presets:

| Mode | Model | Notes |
|---|---|---|
| FAST | `openai/gpt-5.6-luna` | Quick low-cost tasks |
| SMART | `openrouter/auto` | General-purpose automatic routing |
| DEEP | `openai/gpt-5.6-sol` | Deep reasoning effort |
| MAX | `anthropic/claude-opus-5.5` | High reasoning effort, larger response budget and higher possible cost |

No model is the strongest at every task. Models and provider availability can change; check https://openrouter.ai/models and https://openrouter.ai/collections/image-models/ for current model support.

The gateway has **separate image rate limiting (3 image requests/min)** alongside the chat limit. Image generation is **cloud-only in this version**: local Ollama text models cannot make pictures. Cloud mode still requires your own OpenRouter balance and Cloudflare Worker deployment (see instructions below).

**Privacy note:** The image prompt is sent through Cloudflare and OpenRouter to the image model provider. The images are transmitted to your browser as encoded bytes in the HTTPS API response; none are logged or persisted by our Worker code. This is not anonymous or fully offline image generation. To avoid cost surprises, set spending limits at OpenRouter.

## 1. Publish the website

Go to https://github.com/anime-void-app/anime-void-app.github.io/settings/pages

If Pages is not enabled, select **Deploy from a branch**, branch **main**, folder **/ (root)** and Save. Once GitHub completes its build, visit https://anime-void-app.github.io/vanta/.

The existing root redirect for Anime Void is unchanged. All VANTA files are inside the vanta directory. If the repository already uses other Pages settings, inspect them carefully before changing them.

## 2. Activate powerful cloud AI

Create your own accounts at https://dash.cloudflare.com and https://openrouter.ai/.

- Cloudflare Workers hosts the API gateway. Your Cloudflare account owns it.
- OpenRouter routes your prompt to models; model API use can cost money.
- You must deploy this gateway and configure its private secrets. No secret is stored in public GitHub.

On a computer with Node.js, download/clone the repository. In a terminal enter:

~~~powershell
cd vanta\gateway
npx wrangler login
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put VANTA_ACCESS_TOKEN
npx wrangler deploy
~~~

For VANTA_ACCESS_TOKEN use a NEW random secret of 32+ characters; it is not your OpenRouter key and not your GitHub password. You can generate one using:

~~~powershell
python -c "import secrets; print(secrets.token_urlsafe(36))"
~~~

Do not share either secret in a chat, commit, GitHub issue or screenshot.

The gateway includes Cloudflare rate limiting of around 12 chat requests per minute per Cloudflare location, plus a mandatory access token and strict CORS restrictions. For production, also configure spending caps and optionally Cloudflare Access/WAF. Rate limiting is approximate and does not guarantee a fixed spending cap.

Once deployment completes, Wrangler prints the new HTTPS address, typically:

~~~text
https://vanta-ai-gateway.<your-cloudflare-id>.workers.dev
~~~

Go to the VANTA website, open **Settings**, paste that URL into the server URL field, and enter **VANTA_ACCESS_TOKEN** (not OPENROUTER_API_KEY). Save and send a test question.

## 3. Local model mode + phone access

Install Ollama on Windows, then pull a model:

~~~powershell
ollama pull qwen3:4b
~~~

The local Python VANTA bundle (separate from this GitHub Pages frontend) has a server.py and a browser UI that can be opened on localhost. You can replace the local bundle's index.html with the new VANTA page to reuse this design. The Python backend expects /api/chat and /api/status.

For your own phone, run the local site through Tailscale **Serve**, not **Funnel**. Tailscale Serve keeps it inside your private Tailnet; Funnel exposes an internet-accessible address. Configure password authentication before exposing the Python service, and do not port-forward ports 8765 or 11434.

Public GitHub Pages is NOT a relay into your home computer. To use an Ollama model from your phone, open the private Tailscale-hosted website, or set up a separate authenticated private API.

## Privacy and reality check

- Chat histories are stored unencrypted in the browser's localStorage unless session-only mode is on. This is NOT end-to-end encryption. Do not use saved-history mode on a shared device.
- The app access token stays in memory in the frontend and is cleared when the page reloads.
- In cloud mode: browser -> your Cloudflare Worker -> OpenRouter -> chosen model provider. Those services can process content and metadata and may enforce their own policies.
- GitHub may see website requests. Cloudflare, OpenRouter and their providers may have logs. No hosted website can promise perfect anonymity.
- In local mode, Ollama can operate without routing prompts to a remote model provider.
- The VANTA Worker does not add an extra topic filter, but cannot remove provider-specific model restrictions.
- Strongest models evolve constantly. OpenRouter Auto is convenient but is not guaranteed to choose the objectively strongest model for every task.
- No model training is happening here; pre-trained models are selected and run or rented.

## Troubleshooting

No AI responses: deploy the Worker first, add both secrets, configure the URL and token in Settings.
401: wrong VANTA_ACCESS_TOKEN.
429: approximate rate limit reached.
502: upstream unavailable, model unsupported, credit exhausted or API key wrong.
GitHub 404: enable Pages or check publishing source.
Local mode on public Pages: use the dedicated localhost/Tailscale interface.
