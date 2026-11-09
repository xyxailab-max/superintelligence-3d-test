// USI Control Room V2 — TEST Worker entry.
// Order for every single request (pages, files and data):
//   1. Check the Cloudflare Access login pass (auth.js). No valid pass = refused. Settings missing = locked.
//   2. /api/... goes to the data API (api.js). Everything else is a screen file from ./public.

import { verifyAccess } from "./auth.js";
import { handleApi } from "./api.js";

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

function secure(res) {
  const r = new Response(res.body, res);
  const h = r.headers;
  h.set("Content-Security-Policy", CSP);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "no-referrer");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  h.set("Strict-Transport-Security", "max-age=31536000");
  h.set("X-Robots-Tag", "noindex, nofollow");
  h.set("Cache-Control", "private, no-store");
  return r;
}

function deny(result, isApi) {
  const msg = result.status === 503
    ? "Control Room is locked: login settings are not set yet."
    : "Access denied.";
  const body = isApi ? JSON.stringify({ error: msg }) : msg;
  return secure(new Response(body, {
    status: result.status,
    headers: { "Content-Type": isApi ? "application/json; charset=utf-8" : "text/plain; charset=utf-8" },
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith("/api/");

    let auth;
    try { auth = await verifyAccess(request, env); }
    catch (e) { auth = { ok: false, status: 503, reason: "login check failed" }; }
    if (!auth.ok) {
      console.log("denied", auth.status, auth.reason, url.pathname);
      return deny(auth, isApi);
    }

    if (isApi) return secure(await handleApi(request, env, auth.email, url));
    if (request.method !== "GET" && request.method !== "HEAD") return secure(new Response("Method not allowed.", { status: 405 }));
    return secure(await env.ASSETS.fetch(request));
  },
};
