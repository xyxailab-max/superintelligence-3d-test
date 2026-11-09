// Checks the Cloudflare Access login pass (a signed JWT) on EVERY request.
// Checks: signature (RS256, Cloudflare's published keys), issuer, audience, expiry, not-before,
// and that the email is on the exact allowlist. Missing settings = locked (fail closed).

const enc = new TextEncoder();
const LEEWAY = 30;                 // seconds of clock tolerance
const KEYS_TTL = 60 * 60 * 1000;   // re-download Cloudflare's keys at most hourly
const FORCE_GAP = 60 * 1000;       // and on an unknown key id at most once a minute

let cache = { url: "", keys: null, at: 0, forcedAt: 0 };
export function _resetCache() { cache = { url: "", keys: null, at: 0, forcedAt: 0 }; }

export function teamOrigin(value) {
  let v = String(value || "").trim().replace(/\/+$/, "");
  if (!v) return "";
  if (!/^https:\/\//i.test(v)) v = "https://" + v.replace(/^http:\/\//i, "");
  try {
    const u = new URL(v);
    if (!u.hostname.endsWith(".cloudflareaccess.com")) return "";   // only real Access team domains
    return "https://" + u.hostname;
  } catch { return ""; }
}

function b64urlBytes(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("bad base64");
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

async function getKeys(origin, fetchFn, force) {
  const url = origin + "/cdn-cgi/access/certs";
  const now = Date.now();
  const fresh = cache.url === url && cache.keys && now - cache.at < KEYS_TTL;
  if (fresh && !(force && now - cache.forcedAt > FORCE_GAP)) return cache.keys;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error("could not load Access keys");
  const body = await res.json();
  cache = { url, keys: Array.isArray(body.keys) ? body.keys : [], at: now, forcedAt: force ? now : cache.forcedAt };
  return cache.keys;
}

const no = (status, reason) => ({ ok: false, status, reason });

export async function verifyAccess(request, env, opts = {}) {
  const fetchFn = opts.fetch || fetch;
  const now = opts.now ? opts.now() : Math.floor(Date.now() / 1000);

  const origin = teamOrigin(env.TEAM_DOMAIN);
  const aud = String(env.POLICY_AUD || "").trim();
  const allow = String(env.ALLOWED_EMAIL || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!origin || !aud || !allow.length) return no(503, "locked: login settings missing");

  const token = request.headers.get("Cf-Access-Jwt-Assertion") || "";
  const parts = token.split(".");
  if (parts.length !== 3) return no(403, "no valid login pass");

  let header, payload;
  try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]); } catch { return no(403, "unreadable login pass"); }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return no(403, "wrong signing method");

  let keys = await getKeys(origin, fetchFn, false);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) { keys = await getKeys(origin, fetchFn, true); jwk = keys.find((k) => k.kid === header.kid); }
  if (!jwk || jwk.kty !== "RSA") return no(403, "unknown signing key");

  let good = false;
  try {
    const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    good = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]), enc.encode(parts[0] + "." + parts[1]));
  } catch { good = false; }
  if (!good) return no(403, "bad signature");

  if (payload.iss !== origin) return no(403, "wrong issuer");
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return no(403, "wrong audience");
  if (typeof payload.exp !== "number" || payload.exp + LEEWAY < now) return no(403, "login expired");
  if (typeof payload.nbf === "number" && payload.nbf - LEEWAY > now) return no(403, "login not valid yet");
  if (typeof payload.iat === "number" && payload.iat - LEEWAY > now) return no(403, "login from the future");

  const email = String(payload.email || "").trim().toLowerCase();
  if (!email || !allow.includes(email)) return no(403, "email not allowed");
  return { ok: true, email };
}
