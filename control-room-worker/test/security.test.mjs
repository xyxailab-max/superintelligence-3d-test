// Local safety test for Control Room V2 (not deployed; ./public is the only folder served).
// Run:  node --test control-room-worker/test/security.test.mjs
// Uses a made-up signing key, a fake Access team and an in-memory database. No network, no real data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/index.js";
import { _resetCache } from "../src/auth.js";

const TEAM = "usi-founder.cloudflareaccess.com", AUD = "test-aud-123", EMAIL = "hello@usesuperintelligence.com";
const ORIGIN = "https://usi-control-room-test.example.workers.dev";

// ---- fake Access signing key + certs endpoint ----
const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid: "k1" };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url) === `https://${TEAM}/cdn-cgi/access/certs`) return new Response(JSON.stringify({ keys: [jwk] }));
  throw new Error("unexpected network call: " + url);
};
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
async function token(claims = {}, opts = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: opts.alg || "RS256", kid: opts.kid || "k1", typ: "JWT" });
  const body = b64({ iss: `https://${TEAM}`, aud: [AUD], email: EMAIL, iat: now, exp: now + 3600, ...claims });
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", (opts.key || kp).privateKey, new TextEncoder().encode(head + "." + body));
  return head + "." + body + "." + Buffer.from(sig).toString("base64url");
}

// ---- tiny stand-in for D1 on top of SQLite ----
function fakeD1() {
  const sql = new DatabaseSync(":memory:"); sql.exec("PRAGMA foreign_keys = ON");
  const stmt = (q, args = []) => ({
    bind: (...a) => stmt(q, a),
    first: async () => sql.prepare(q).get(...args) ?? null,
    all: async () => ({ results: sql.prepare(q).all(...args) }),
    run: async () => { const r = sql.prepare(q).run(...args); return { meta: { changes: r.changes } }; },
    _exec() { const p = sql.prepare(q); return /^\s*select/i.test(q) ? { results: p.all(...args) } : { results: [], meta: { changes: p.run(...args).changes } }; },
  });
  return { prepare: (q) => stmt(q), batch: async (list) => { sql.exec("BEGIN"); try { const out = list.map((s) => s._exec()); sql.exec("COMMIT"); return out; } catch (e) { sql.exec("ROLLBACK"); throw e; } }, sql };
}

const db = fakeD1();
const env = { TEAM_DOMAIN: TEAM, POLICY_AUD: AUD, ALLOWED_EMAIL: EMAIL, DB: db,
  ASSETS: { fetch: async () => new Response("<html>dashboard</html>", { headers: { "Content-Type": "text/html" } }) } };

async function call(path, { method = "GET", body, jwt, headers = {}, e = env } = {}) {
  const h = new Headers(headers);
  if (jwt !== null) h.set("Cf-Access-Jwt-Assertion", jwt ?? (await token()));
  if (body !== undefined) { if (!h.has("Content-Type")) h.set("Content-Type", "application/json"); if (!h.has("Origin")) h.set("Origin", ORIGIN); }
  const res = await worker.fetch(new Request(ORIGIN + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), e);
  let data = null; try { data = await res.clone().json(); } catch {}
  return { status: res.status, data, res };
}

test("locked when login settings are missing", async () => {
  for (const miss of ["TEAM_DOMAIN", "POLICY_AUD", "ALLOWED_EMAIL"]) {
    const r = await call("/", { e: { ...env, [miss]: "" } });
    assert.equal(r.status, 503, miss);
  }
});

test("refuses page and API without a valid login pass", async () => {
  _resetCache();
  assert.equal((await call("/", { jwt: null })).status, 403);
  assert.equal((await call("/api/state", { jwt: null })).status, 403);
  assert.equal((await call("/api/state", { jwt: "abc.def.ghi" })).status, 403);
});

test("checks signature, issuer, audience, expiry and email", async () => {
  const now = Math.floor(Date.now() / 1000);
  const cases = {
    "signed by a different key": await token({}, { key: other }),
    "wrong algorithm": await token({}, { alg: "HS256" }),
    "unknown key id": await token({}, { kid: "nope" }),
    "wrong issuer": await token({ iss: "https://evil.cloudflareaccess.com" }),
    "wrong audience": await token({ aud: ["other-app"] }),
    expired: await token({ exp: now - 600 }),
    "not valid yet": await token({ nbf: now + 600 }),
    "email not allowed": await token({ email: "someone@gmail.com" }),
    "email look-alike": await token({ email: "hello@usesuperintelligence.com.evil.com" }),
    "no email": await token({ email: "" }),
  };
  for (const [name, jwt] of Object.entries(cases)) assert.equal((await call("/api/state", { jwt })).status, 403, name);
  // tampered body with original signature
  const good = await token(); const [h, , s] = good.split(".");
  assert.equal((await call("/api/state", { jwt: h + "." + b64({ iss: `https://${TEAM}`, aud: [AUD], email: EMAIL, exp: now + 3600 }) + "." + s })).status, 403, "tampered");
});

test("valid login opens the page with safety headers", async () => {
  const r = await call("/");
  assert.equal(r.status, 200);
  assert.match(r.res.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
  assert.equal(r.res.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await call("/", { method: "POST" })).status, 405);
});

test("blocks changes from other websites and non-JSON", async () => {
  assert.equal((await call("/api/tasks", { method: "POST", body: { title: "x", area: "dev" }, headers: { Origin: "https://evil.com" } })).status, 403);
  assert.equal((await call("/api/tasks", { method: "POST", body: { title: "x", area: "dev" }, headers: { "Content-Type": "text/plain" } })).status, 415);
});

test("tasks: create, edit, move, with activity", async () => {
  let r = await call("/api/tasks", { method: "POST", body: { title: "Test task", area: "dev", priority: "high" } });
  assert.equal(r.status, 201); const tid = r.data.id;
  assert.equal((await call("/api/tasks", { method: "POST", body: { title: "", area: "dev" } })).status, 400);
  assert.equal((await call("/api/tasks", { method: "POST", body: { title: "x", area: "hacker" } })).status, 400);
  r = await call("/api/tasks/" + tid, { method: "PATCH", body: { status: "doing", notes: "<b>hi</b>" } });
  assert.equal(r.status, 200);
  const st = (await call("/api/state")).data;
  const t = st.tasks.find((x) => x.id === tid);
  assert.equal(t.status, "doing"); assert.equal(t.notes, "<b>hi</b>");
  assert.ok(st.activity.some((e) => e.kind === "move" && e.actor === EMAIL));
});

test("approvals: decided once, high risk needs confirm, who-decided comes from login", async () => {
  const tid = (await call("/api/tasks", { method: "POST", body: { title: "Risky", area: "marketplace" } })).data.id;
  const aid = (await call("/api/approvals", { method: "POST", body: { taskId: tid, ask: "Go live?", risk: "high" } })).data.id;
  assert.equal((await call(`/api/approvals/${aid}/decision`, { method: "POST", body: { decision: "approved" } })).status, 428);
  let r = await call(`/api/approvals/${aid}/decision`, { method: "POST", body: { decision: "approved", confirm: true, decidedBy: "attacker@evil.com" } });
  assert.equal(r.status, 200);
  assert.equal((await call(`/api/approvals/${aid}/decision`, { method: "POST", body: { decision: "rejected" } })).status, 409);
  const a = (await call("/api/state")).data.approvals.find((x) => x.id === aid);
  assert.equal(a.status, "approved"); assert.equal(a.decidedBy, EMAIL);
});

test("database itself blocks edits/deletes of history and decided approvals", async () => {
  assert.throws(() => db.sql.exec("DELETE FROM activity"));
  assert.throws(() => db.sql.exec("UPDATE activity SET text = 'changed'"));
  assert.throws(() => db.sql.exec("DELETE FROM approvals"));
  assert.throws(() => db.sql.exec("UPDATE approvals SET status = 'rejected' WHERE status = 'approved'"));
  assert.ok((await call("/api/tasks/t-00000000-0000-0000-0000-000000000000", { method: "DELETE" })).status >= 400, "no delete route");
});

test.after(() => { globalThis.fetch = realFetch; });
