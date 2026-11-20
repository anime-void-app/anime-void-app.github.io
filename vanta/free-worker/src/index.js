/**
 * VANTA FREE CLOUD — Cloudflare Workers AI
 * Personal serverless AI for use on Android with the PC switched off.
 * Requires Workers Free + AI binding ("AI") and a 32+ character secret.
 * No OpenRouter / external paid AI API key.
 */
const ORIGIN_DEFAULT = "https://anime-void-app.github.io";
const TEXT_MODELS = Object.freeze({
  "openai/gpt-5.6-luna": "@cf/zai-org/glm-4.7-flash",
  "openrouter/auto": "@cf/google/gemma-4-26b-a4b-it",
  "openai/gpt-5.6-sol": "@cf/qwen/qwen3.8-27b",
  "anthropic/claude-opus-5.5": "@cf/qwen/qwen3.8-27b",
});
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const IMAGE_STEPS = Object.freeze({
  "google/gemini-3.1-flash-lite-image": 4, 
  "google/gemini-3.1-flash-image": 6,
  "openai/gpt-image-2.6-sunburst": 8,
});
const MAX_BODY = 70000;
const encoder = new TextEncoder();
function responseJSON(status, value, headers) {
  return new Response(JSON.stringify(value), { status, headers: {
    ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"
  }});
}
function safeEqual(value, secret) {
  const a = encoder.encode(value);
  const b = encoder.encode(secret);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] || 0) ^ (b[i] || 0);
  return difference === 0;
}
function event(content) {
  return "data: " + JSON.stringify({ choices: [{ delta: { content } }] }) + "\n\n";
}
function convertStream(stream) {
  const decoder = new TextDecoder();
  let leftover = "";
  return stream.pipeThrough(new TransformStream({
    transform(chunk, ctrl) {
      leftover += decoder.decode(chunk, {stream:true});
      if (leftover.length > 100000) leftover = leftover.slice(-60000);
      const lines = leftover.split(/\r?\n/);
      leftover = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const packet = JSON.parse(raw);
          const delta = packet?.choices?.[0]?.delta;
          const content = typeof delta?.content === "string" ? delta.content
            : typeof packet?.response === "string" ? packet.response : "";
          if (content) ctrl.enqueue(encoder.encode(event(content)));
        } catch (_) { /* Ignore non-content native stream events. */ }
      }
    },
    flush(ctrl) {
      if (leftover.trim().startsWith("data:")) {
        try {
          const obj = JSON.parse(leftover.trim().slice(5));
          const content = obj?.choices?.[0]?.delta?.content || obj?.response;
          if (typeof content === "string" && content) ctrl.enqueue(encoder.encode(event(content)));
        } catch (_) {}
      }
      ctrl.enqueue(encoder.encode("data: [DONE]\n\n"));
    }
  }));
}
function cleanMessages(body) {
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 40)
    throw Error("Недопустимое количество сообщений.");
  const messages = [];
  for (const m of body.messages) {
    if (!m || !["user", "assistant"].includes(m.role) ||
        typeof m.content !== "string" || m.content.length > 9000 || !m.content.trim())
      throw Error("Некорректное сообщение.");
    messages.push({role:m.role, content:m.content});
  }
  if (messages.at(-1).role !== "user") throw Error("Последнее сообщение должно быть пользовательским.");
  const instruction = typeof body.systemPrompt === "string" ? body.systemPrompt.slice(0, 2500) : "";
  return [
    {role:"system",content:"Ты VANTA AI — личный интеллектуальный помощник. Отвечай точно и понятно. Не выдавай выдуманное за факт. Если нет поиска в интернете, честно говори, что у тебя нет доступа к актуальной информации. Отвечай на языке пользователя. " + instruction},
    ...messages
  ];
}
function publicError(error, isImage=false) {
  const code = Number(error?.status || error?.code || error?.cause?.status || 0);
  const text = String(error?.message || "");
  if (code === 429 || code === 3040 || /capacity|quota|neurons|rate.limit|limit.exceeded|exhausted/i.test(text))
    return {status:429,detail:"Бесплатная квота Cloudflare исчерпана или модель перегружена. Попробуй позже либо в следующий день."};
  if (code === 403 || /workers paid|plan|not.authorized|5035/i.test(text))
    return {status:403,detail:"Модель недоступна на бесплатном плане Cloudflare. Выбери FAST или SMART."};
  return {status:502,detail:isImage?"Не удалось создать изображение. Проверь AI binding и дневную квоту.":"Cloudflare AI не смог ответить. Проверь AI binding, модель и дневную квоту."};
}
export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = (env.ALLOWED_ORIGIN || ORIGIN_DEFAULT).replace(/\/+$/, "");
    const cors = {
      "Vary":"Origin", "X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer", "Cache-Control":"no-store",
      ...(origin === allowedOrigin ? {
        "Access-Control-Allow-Origin":allowedOrigin,
        "Access-Control-Allow-Headers":"Authorization,Content-Type",
        "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
        "Access-Control-Max-Age":"86400"
      }:{})
    };
    const json = (status, body) => responseJSON(status, body, cors);
    if (origin && origin !== allowedOrigin) return json(403, {error:"Источник сайта не разрешён."});
    if (request.method === "OPTIONS") return new Response(null, {status:204,headers:cors});
    const configured = !!env.AI && typeof env.VANTA_ACCESS_TOKEN === "string" && env.VANTA_ACCESS_TOKEN.length >= 32;
    if (pathname === "/api/health" && request.method === "GET") {
      return json(200, {ok:true,configured,provider:"VANTA Free",images:true,search:false,freeQuota:true,
        quotaNote:"Workers Free: 10 000 Neurons/day shared by all generations"});
    }
    const imageRequest = pathname === "/api/images";
    if (!["/api/chat","/api/images"].includes(pathname) || request.method !== "POST")
      return json(404,{error:"Маршрут не существует."});
    if (!configured) return json(503,{error:"Добавь AI binding с именем AI и секрет VANTA_ACCESS_TOKEN (32+ символа) в Cloudflare."});
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ") || !safeEqual(authorization.slice(7),env.VANTA_ACCESS_TOKEN))
      return json(401,{error:"Неверный личный токен VANTA."});
    const limiter = imageRequest ? env.IMAGE_RATE_LIMITER : env.CHAT_RATE_LIMITER;
    if (limiter) {
      const result = await limiter.limit({key:imageRequest ? "owner-image" : "owner-chat"});
      if (!result.success) return json(429,{error:"Слишком много запросов подряд. Попробуй позже."});
    }
    if (!(request.headers.get("Content-Type") || "").startsWith("application/json"))
      return json(415,{error:"Ожидается JSON."});
    const sizeHeader = Number(request.headers.get("Content-Length") || "0");
    if (sizeHeader > MAX_BODY) return json(413,{error:"Слишком большой запрос."});
    let body;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) return json(413,{error:"Слишком большой запрос."});
      body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body))
        return json(400,{error:"Неверный JSON."});
    } catch(_) { return json(400,{error:"Не удалось прочитать JSON."}); }
    if (imageRequest) {
      const steps = IMAGE_STEPS[body.model];
      if (!steps) return json(400,{error:"Выбери FAST, PRO или ULTRA в студии изображений."});
      if (body.aspect_ratio !== "1:1") return json(400,{error:"Бесплатная FLUX.1 Schnell здесь создаёт только квадратные изображения 1:1."});
      if (typeof body.prompt !== "string" || body.prompt.trim().length < 3 || body.prompt.length > 2048)
        return json(400,{error:"Описание должно содержать от 3 до 2048 символов."});
      try {
        const image = await env.AI.run(IMAGE_MODEL, {prompt:body.prompt.trim(),steps});
        if (!image || typeof image.image !== "string" || image.image.length > 15000000)
          return json(502,{error:"Модель не вернула изображение в ожидаемом формате."});
        return json(200,{model:IMAGE_MODEL,images:[{b64_json:image.image,media_type:"image/jpeg"}],cost_usd:null});
      } catch(e) {
        const err = publicError(e,true);
        return json(err.status,{error:err.detail});
      }
    }
    const model = TEXT_MODELS[body.model || "openrouter/auto"];
    if (!model) return json(400,{error:"Неизвестный режим. Выбери FAST / SMART / DEEP / MAX."});
    let messages;
    try { messages = cleanMessages(body); } catch(e) { return json(400,{error:e.message}); }
    // Keep free inference modest. Larger MAX models consume the same daily budget faster.
    const maxTokens = body.model === "anthropic/claude-opus-5.5" ? 1700 : 900;
    try {
      const native = await env.AI.run(model,{messages,max_tokens:maxTokens,stream:true});
      if (native && typeof native.pipeThrough === "function") {
        return new Response(convertStream(native),{status:200,headers:{...cors,
          "Content-Type":"text/event-stream; charset=utf-8","X-Accel-Buffering":"no"}});
      }
      const content = typeof native?.response === "string" ? native.response :
        native?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim())
        return json(502,{error:"Модель не вернула текст."});
      return new Response(event(content) + "data: [DONE]\n\n", {headers:{...cors,
        "Content-Type":"text/event-stream; charset=utf-8"}});
    } catch(e) {
      const err = publicError(e,false);
      return json(err.status,{error:err.detail});
    }
  }
};