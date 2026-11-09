// Control Room V2 data API. Every call here has ALREADY passed the Access login check (see index.js).
// "Who did it" always comes from the verified login, never from what the browser sends.
// There are no delete routes.

import { ensureSchema } from "./schema.js";

export const AREAS = [
  { id: "dev", name: "Development" },
  { id: "marketing", name: "Marketing" },
  { id: "analytics", name: "Analytics" },
  { id: "support", name: "Support" },
  { id: "marketplace", name: "Marketplace" },
];
const AREA_IDS = AREAS.map((a) => a.id);
const STATUSES = ["todo", "doing", "waiting", "done"];
const STATUS_NAMES = { todo: "To do", doing: "Doing", waiting: "Waiting for you", done: "Done" };
const PRIORITIES = ["high", "medium", "low"];
const RISKS = ["low", "medium", "high"];
const MAX_BODY = 10000;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json; charset=utf-8" },
});
const bad = (msg, status = 400) => json({ error: msg }, status);
const now = () => new Date().toISOString();
const id = (p) => p + "-" + crypto.randomUUID();

function text(v, max, min = 0) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length >= min && s.length <= max ? s : null;
}

async function readBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw Object.assign(new Error("Too much data."), { status: 413 });
  try { const b = JSON.parse(raw || "{}"); if (b && typeof b === "object" && !Array.isArray(b)) return b; } catch {}
  throw Object.assign(new Error("Send a JSON object."), { status: 400 });
}

function activity(db, actor, area, kind, refId, msg) {
  return db.prepare("INSERT INTO activity (id, at, actor, area, kind, ref_id, text) VALUES (?,?,?,?,?,?,?)")
    .bind(id("e"), now(), actor, area, kind, refId, msg.slice(0, 400));
}

export async function handleApi(request, env, email, url) {
  const m = request.method, p = url.pathname;

  // Stop other websites from sending changes on your behalf.
  if (m !== "GET" && m !== "HEAD") {
    if (request.headers.get("Origin") !== url.origin) return bad("Request blocked (wrong origin).", 403);
    if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) return bad("Send JSON.", 415);
  }

  try {
    if (!env.DB) return bad("Database not connected.", 503);
    await ensureSchema(env.DB);
    const db = env.DB;

    if (m === "GET" && p === "/api/me") return json({ email });
    if (m === "GET" && p === "/api/state") return json(await state(db, email));
    if (m === "POST" && p === "/api/tasks") return createTask(db, email, await readBody(request));
    let r = p.match(/^\/api\/tasks\/([a-z]-[0-9a-f-]{36})$/);
    if (r && m === "PATCH") return updateTask(db, email, r[1], await readBody(request));
    if (m === "POST" && p === "/api/approvals") return createApproval(db, email, await readBody(request));
    r = p.match(/^\/api\/approvals\/([a-z]-[0-9a-f-]{36})\/decision$/);
    if (r && m === "POST") return decide(db, email, r[1], await readBody(request));
    return bad("Not found.", 404);
  } catch (e) {
    if (e.status) return bad(e.message, e.status);
    console.error("api error", e && e.message);
    return bad("Server error.", 500);
  }
}

async function state(db, email) {
  const [t, a, e] = await db.batch([
    db.prepare("SELECT * FROM tasks ORDER BY updated_at DESC LIMIT 500"),
    db.prepare("SELECT * FROM approvals ORDER BY requested_at DESC LIMIT 200"),
    db.prepare("SELECT * FROM activity ORDER BY at DESC LIMIT 50"),
  ]);
  return {
    me: email,
    meta: { title: "USI Control Room", version: "V2 TEST" },
    areas: AREAS,
    tasks: t.results.map((x) => ({ id: x.id, title: x.title, area: x.area, status: x.status, priority: x.priority,
      notes: x.notes, created: x.created_at, updated: x.updated_at })),
    approvals: a.results.map((x) => ({ id: x.id, taskId: x.task_id, ask: x.ask, risk: x.risk, status: x.status,
      requested: x.requested_at, decided: x.decided_at, decidedBy: x.decided_by })),
    activity: e.results.map((x) => ({ id: x.id, at: x.at, actor: x.actor, area: x.area, kind: x.kind, text: x.text })),
  };
}

async function createTask(db, email, b) {
  const title = text(b.title, 200, 1);
  const area = AREA_IDS.includes(b.area) ? b.area : null;
  const priority = b.priority === undefined ? "medium" : PRIORITIES.includes(b.priority) ? b.priority : null;
  const status = b.status === undefined ? "todo" : STATUSES.includes(b.status) ? b.status : null;
  const notes = b.notes === undefined ? "" : text(b.notes, 2000);
  if (!title) return bad("Title must be 1–200 characters.");
  if (!area || !priority || !status || notes === null) return bad("Check area, priority, status and notes.");
  const tid = id("t"), at = now();
  await db.batch([
    db.prepare("INSERT INTO tasks (id,title,area,status,priority,notes,created_at,updated_at,created_by) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(tid, title, area, status, priority, notes, at, at, email),
    activity(db, email, area, "create", tid, "Task added: " + title),
  ]);
  return json({ id: tid }, 201);
}

async function updateTask(db, email, tid, b) {
  const cur = await db.prepare("SELECT * FROM tasks WHERE id = ?").bind(tid).first();
  if (!cur) return bad("Task not found.", 404);
  const next = { ...cur };
  if (b.title !== undefined) { const v = text(b.title, 200, 1); if (!v) return bad("Title must be 1–200 characters."); next.title = v; }
  if (b.notes !== undefined) { const v = text(b.notes, 2000); if (v === null) return bad("Notes are too long."); next.notes = v; }
  if (b.area !== undefined) { if (!AREA_IDS.includes(b.area)) return bad("Unknown area."); next.area = b.area; }
  if (b.priority !== undefined) { if (!PRIORITIES.includes(b.priority)) return bad("Unknown priority."); next.priority = b.priority; }
  if (b.status !== undefined) { if (!STATUSES.includes(b.status)) return bad("Unknown status."); next.status = b.status; }
  const changed = ["title", "notes", "area", "priority", "status"].filter((k) => next[k] !== cur[k]);
  if (!changed.length) return json({ id: tid, changed: [] });
  const msg = changed.includes("status")
    ? `“${next.title}” moved to ${STATUS_NAMES[next.status]}`
    : `“${next.title}” edited (${changed.join(", ")})`;
  await db.batch([
    db.prepare("UPDATE tasks SET title=?, notes=?, area=?, priority=?, status=?, updated_at=? WHERE id=?")
      .bind(next.title, next.notes, next.area, next.priority, next.status, now(), tid),
    activity(db, email, next.area, changed.includes("status") ? "move" : "edit", tid, msg),
  ]);
  return json({ id: tid, changed });
}

async function createApproval(db, email, b) {
  const ask = text(b.ask, 300, 1);
  const risk = RISKS.includes(b.risk) ? b.risk : null;
  if (!ask || !risk) return bad("Question (1–300 characters) and risk (low, medium, high) are needed.");
  const task = typeof b.taskId === "string" ? await db.prepare("SELECT id, area FROM tasks WHERE id = ?").bind(b.taskId).first() : null;
  if (!task) return bad("Task not found.", 404);
  const aid = id("a"), at = now();
  await db.batch([
    db.prepare("INSERT INTO approvals (id,task_id,ask,risk,status,requested_at,requested_by) VALUES (?,?,?,?, 'pending', ?,?)")
      .bind(aid, task.id, ask, risk, at, email),
    db.prepare("UPDATE tasks SET status='waiting', updated_at=? WHERE id=?").bind(at, task.id),
    activity(db, email, task.area, "approval", aid, `Approval requested (${risk} risk): ${ask}`),
  ]);
  return json({ id: aid }, 201);
}

async function decide(db, email, aid, b) {
  const decision = b.decision === "approved" || b.decision === "rejected" ? b.decision : null;
  if (!decision) return bad("Decision must be approved or rejected.");
  const a = await db.prepare("SELECT a.*, t.area AS area FROM approvals a JOIN tasks t ON t.id = a.task_id WHERE a.id = ?").bind(aid).first();
  if (!a) return bad("Approval not found.", 404);
  if (a.status !== "pending") return bad("Already decided. Decisions can't be changed.", 409);
  if (a.risk === "high" && decision === "approved" && b.confirm !== true) return bad("High-risk approval needs confirmation.", 428);
  const at = now();
  const res = await db.batch([
    db.prepare("UPDATE approvals SET status=?, decided_at=?, decided_by=? WHERE id=? AND status='pending'").bind(decision, at, email, aid),
    // Only logs if the update above really happened (same transaction).
    db.prepare(`INSERT INTO activity (id, at, actor, area, kind, ref_id, text)
                SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM approvals WHERE id=? AND decided_at=? AND decided_by=?)`)
      .bind(id("e"), at, email, a.area, decision, aid, `${decision === "approved" ? "Approved" : "Rejected"}: ${a.ask}`.slice(0, 400), aid, at, email),
  ]);
  if (!res[0].meta || res[0].meta.changes !== 1) return bad("Already decided. Decisions can't be changed.", 409);
  return json({ id: aid, status: decision });
}
