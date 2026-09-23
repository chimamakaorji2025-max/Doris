// Cloudflare Pages Function: POST /api/draft
// Receives {prompt, tier} from the page, asks Claude, and returns {data: <parsed JSON>}.
// Your Anthropic API key lives ONLY here, as the secret ANTHROPIC_API_KEY. It never reaches the browser.

const DEFAULT_MODELS = {
  quick: "claude-haiku-4-5-20251001",
  default: "claude-sonnet-5",
  complex: "claude-sonnet-5",
};
const MAX_BODY_BYTES = 60000;
const MAX_PROMPT_CHARS = 24000;
const SYSTEM =
  "You are the drafting engine inside a business invoice-reminder tool. " +
  "Follow the user's output-format instructions exactly and return only the requested JSON, with no commentary.";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const fail = (status, error) => json({ error }, status);

function originAllowed(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  const list = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length) return list.includes(origin);
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function extractJSON(text) {
  const t = String(text || "").trim();
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch {} }
  const start = t.search(/[\[{]/);
  const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (start > -1 && end > start) { try { return JSON.parse(t.slice(start, end + 1)); } catch {} }
  return undefined;
}

async function overLimit(request, env) {
  if (!env.RATE) return false;
  const limit = parseInt(env.DAILY_LIMIT || "40", 10);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = "rl:" + ip + ":" + new Date().toISOString().slice(0, 10);
  const n = parseInt((await env.RATE.get(key)) || "0", 10);
  if (n >= limit) return true;
  await env.RATE.put(key, String(n + 1), { expirationTtl: 172800 });
  return false;
}

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return fail(500, "sampling_disabled");
  if (!originAllowed(request, env)) return fail(403, "not_granted");

  let raw;
  try { raw = await request.text(); } catch { return fail(400, "invalid_request"); }
  if (raw.length > MAX_BODY_BYTES) return fail(413, "prompt_too_large");
  let body;
  try { body = JSON.parse(raw); } catch { return fail(400, "invalid_request"); }
  const prompt = body && body.prompt;
  if (typeof prompt !== "string" || !prompt.trim()) return fail(400, "invalid_request");
  if (prompt.length > MAX_PROMPT_CHARS) return fail(413, "prompt_too_large");

  const tier = body.tier === "quick" || body.tier === "complex" ? body.tier : "default";
  const model =
    (tier === "quick" ? env.MODEL_QUICK : env.MODEL_DEFAULT) || DEFAULT_MODELS[tier];
  const maxTokens = tier === "quick" ? 1200 : 3500;

  if (await overLimit(request, env)) return fail(429, "rate_limited");

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 55000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: ctl.signal,
    });
    if (res.status === 429) return fail(429, "rate_limited");
    if (!res.ok) {
      console.error("Anthropic API status", res.status);
      return fail(502, "upstream_error");
    }
    const data = await res.json();
    if (data.stop_reason === "max_tokens") return fail(502, "invalid_json");
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = extractJSON(text);
    if (parsed === undefined) return fail(502, "invalid_json");
    return json({ data: parsed });
  } catch (e) {
    return fail(502, "upstream_error");
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequest() {
  return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
}functions/api/draft.js
