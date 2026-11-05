// TEST ONLY: chat API for the 5 featured agents, with per-visitor limits.
//   POST /api/agent { agent, messages: [{role, content}] }
// Limits (shared across all agents, counted per visitor):
//   - MINUTE_LIMIT messages per 60 seconds (default 6)
//   - DAILY_LIMIT messages per rolling 24 hours (default 30)
// To change a limit for testing: Cloudflare > this Worker > Settings > Variables > add DAILY_LIMIT (e.g. 3).

import { DurableObject } from "cloudflare:workers";
import { AGENT_BY_ID, SAFE } from "./agents.js";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8"; // same free model as live
const ALLOWED_ORIGINS = ["https://xyxailab-max.github.io"]; // the TEST site only
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

// ---------- The visitor counter (one small counter per visitor) ----------
export class VisitorLimiter extends DurableObject {
  // Records one message if allowed. Returns { ok } or { ok:false, reason, waitMs }.
  async hit(minuteLimit, dailyLimit) {
    const now = Date.now();
    const times = ((await this.ctx.storage.get("t")) || []).filter((t) => t > now - DAY);
    const lastMinute = times.filter((t) => t > now - MINUTE);
    if (lastMinute.length >= minuteLimit) {
      return { ok: false, reason: "minute", waitMs: lastMinute[lastMinute.length - minuteLimit] + MINUTE - now };
    }
    if (times.length >= dailyLimit) {
      return { ok: false, reason: "day", waitMs: times[times.length - dailyLimit] + DAY - now };
    }
    times.push(now);
    await this.ctx.storage.put("t", times.slice(-Math.max(dailyLimit, minuteLimit)));
    await this.ctx.storage.setAlarm(now + DAY + MINUTE); // tidy up after a quiet day
    return { ok: true };
  }
  // Clears a visitor's data once they have been quiet for 24 hours, so nothing piles up.
  async alarm() {
    const times = (await this.ctx.storage.get("t")) || [];
    const last = times[times.length - 1] || 0;
    if (Date.now() - last >= DAY) await this.ctx.storage.deleteAll();
    else await this.ctx.storage.setAlarm(last + DAY + MINUTE);
  }
}

// ---------- Helpers ----------
function cors(origin) {
  return ALLOWED_ORIGINS.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" }
    : {};
}
const json = (data, status, origin) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(origin) } });

// Who is the visitor? Their internet address. Newer (IPv6) addresses: count the whole home block (first 4 parts),
// so one phone can't get fresh limits by hopping between nearby addresses.
function visitorKey(ip) {
  if (!ip) return "unknown";
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [], t = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return full.slice(0, 4).map((x) => (x || "0").toLowerCase().replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

function waitText(ms) {
  const mins = Math.ceil(ms / MINUTE);
  if (mins <= 1) return "about a minute";
  if (mins < 60) return "about " + mins + " minutes";
  const hrs = Math.round(mins / 60);
  return "about " + hrs + (hrs === 1 ? " hour" : " hours");
}
function num(v, fallback) {
  const n = parseInt(v, 10);
  return n > 0 && n < 10000 ? n : fallback;
}

// ---------- Chat ----------
async function agentChat(request, env, origin) {
  if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "Not allowed." }, 403, origin);
  if (!env.AI) return json({ error: "The agents aren't connected yet." }, 503, origin);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request." }, 400, origin); }
  const agent = AGENT_BY_ID[b && b.agent];
  if (!agent) return json({ error: "Unknown agent." }, 400, origin);
  const messages = (Array.isArray(b.messages) ? b.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return json({ error: "Ask a question first." }, 400, origin);

  // Check the limits before using any AI.
  const minuteLimit = num(env.MINUTE_LIMIT, 6), dailyLimit = num(env.DAILY_LIMIT, 30);
  const visitor = visitorKey(request.headers.get("CF-Connecting-IP"));
  const stub = env.LIMITER.get(env.LIMITER.idFromName(visitor));
  let gate;
  try { gate = await stub.hit(minuteLimit, dailyLimit); }
  catch { return json({ error: "The agent couldn't answer right now. Please try again." }, 503, origin); }
  if (!gate.ok) {
    const error = gate.reason === "minute"
      ? "You're sending messages too fast. Please wait a minute."
      : "You've used your " + dailyLimit + " free messages for today. You can send more in " + waitText(gate.waitMs) + ".";
    return json({ error, limit: gate.reason }, 429, origin);
  }

  try {
    const out = await env.AI.run(MODEL, {
      messages: [{ role: "system", content: "You are " + agent.name + ", a free AI agent on Use Superintelligence. " + agent.system + SAFE }, ...messages],
      max_tokens: 600,
      temperature: 0.6,
    });
    return json({ text: String((out && out.response) || "").trim() }, 200, origin);
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (/limit|quota|429|capacity|neuron/i.test(msg)) return json({ error: "The agents are resting for today. Please come back tomorrow." }, 429, origin);
    return json({ error: "The agent couldn't answer right now. Please try again." }, 500, origin);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (url.pathname === "/api/agent") {
      if (request.method === "OPTIONS") return new Response(null, { status: ALLOWED_ORIGINS.includes(origin) ? 204 : 403, headers: cors(origin) });
      if (request.method !== "POST") return json({ error: "Use POST." }, 405, origin);
      return agentChat(request, env, origin);
    }
    if (url.pathname === "/") return new Response("TEST agents worker is running.", { headers: { "Content-Type": "text/plain" } });
    return new Response("Not found.", { status: 404 });
  },
};
