/**
 * VANTA AI — Cloudflare Worker gateway.
 * No third-party API credentials or private app tokens are present in this source.
 * Secrets: OPENROUTER_API_KEY, VANTA_ACCESS_TOKEN.
 */
const MODEL_PATTERN = /^[A-Za-z0-9._:/-]{1,130}$/;
const CHAT_API = "https://openrouter.ai/api/v1/chat/completions";
function secureEqual(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let mismatch = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) mismatch |= (x[i] || 0) ^ (y[i] || 0);
  return mismatch === 0;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowedOrigin = (env.ALLOWED_ORIGIN || "https://anime-void-app.github.io").replace(/\/$/, "");
    const origin = request.headers.get("Origin");
    const cors = origin === allowedOrigin ? {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    } : { "Vary": "Origin" };
    const baseHeaders = {
      ...cors, "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer", "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
    };
    function json(status, value) {
      return new Response(JSON.stringify(value), { status, headers: { ...baseHeaders, "Content-Type": "application/json; charset=utf-8" } });
    }
    if (origin && origin !== allowedOrigin) return json(403, { error: "Этот сайт не разрешён." });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: baseHeaders });
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json(200, { ok: true, configured: !!(env.OPENROUTER_API_KEY && env.VANTA_ACCESS_TOKEN), provider: "OpenRouter" });
    }
    if (url.pathname !== "/api/chat" || request.method !== "POST") return json(404, { error: "Маршрут не найден." });
    if (!env.OPENROUTER_API_KEY || !env.VANTA_ACCESS_TOKEN) return json(503, { error: "Владелец ещё не подключил ключ API и пароль." });
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ") || !secureEqual(authorization.slice(7), env.VANTA_ACCESS_TOKEN)) {
      return json(401, { error: "Неправильный личный токен." });
    }
    const headerSize = Number(request.headers.get("Content-Length") || "0");
    if (headerSize > 250000 || !request.headers.get("Content-Type")?.startsWith("application/json")) {
      return json(413, { error: "Недопустимый формат или размер запроса." });
    }
    if (!env.CHAT_RATE_LIMITER) return json(503, { error: "Лимитер запросов не настроен на сервере." });
    const { success } = await env.CHAT_RATE_LIMITER.limit({ key: "private-owner" });
    if (!success) return json(429, { error: "Лимит запросов временно исчерпан." });
    let body;
    try {
      const input = await request.text();
      if (input.length > 250000) return json(413, { error: "Слишком большой запрос." });
      body = JSON.parse(input);
    } catch (_) { return json(400, { error: "Неверный JSON." }); }
    let model = body?.model || "openrouter/auto";
    if (typeof model !== "string") return json(400, { error: "Неверная модель." });
    model = model.replace(/^cloud:/, "");
    if (!MODEL_PATTERN.test(model)) return json(400, { error: "Недопустимый ID модели." });
    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 40) return json(400, { error: "Неверное количество сообщений." });
    const messages = [];
    if (typeof body.systemPrompt === "string" && body.systemPrompt.trim()) {
      messages.push({ role: "system", content: body.systemPrompt.slice(0, 3500) });
    }
    for (const item of body.messages) {
      if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string" || item.content.length > 12000 || !item.content.trim()) {
        return json(400, { error: "Недопустимое сообщение." });
      }
      messages.push({ role: item.role, content: item.content });
    }
    if (messages[messages.length - 1].role !== "user") return json(400, { error: "Последнее сообщение должно быть от пользователя." });
    let temperature = Number(body.temperature);
    if (!Number.isFinite(temperature)) temperature = 0.6;
    temperature = Math.max(0, Math.min(1.5, temperature));
    try {
      const upstream = await fetch(CHAT_API, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.OPENROUTER_API_KEY,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://anime-void-app.github.io/vanta/",
          "X-Title": "VANTA AI",
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens: 4096, stream: true }),
        redirect: "error",
        signal: request.signal,
      });
      if (!upstream.ok) return json(502, { error: "Провайдер вернул HTTP " + upstream.status + ". Проверь модель, ключ и баланс." });
      if (!upstream.body) return json(502, { error: "Провайдер не вернул поток." });
      return new Response(upstream.body, {
        status: 200,
        headers: { ...baseHeaders, "Content-Type": "text/event-stream; charset=utf-8", "X-Accel-Buffering": "no" },
      });
    } catch (_) { return json(503, { error: "Не удалось соединиться с провайдером модели." }); }
  }
};