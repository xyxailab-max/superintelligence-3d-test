/* USI Control Room V2 (TEST) — screens. Same drawing code as V1.1; the Store now talks to the Worker API.
   No AI, no other websites. Login is handled by Cloudflare Access before this page even loads. */
(function () {
  "use strict";

  /* ---------- STORE (Worker API) ---------- */
  const Store = {
    db: null,
    async api(path, method, body) {
      let res;
      try {
        res = await fetch(path, {
          method: method || "GET",
          credentials: "same-origin",
          redirect: "manual",                       // an Access login redirect means the session ended
          headers: body ? { "Content-Type": "application/json" } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) { throw new Error("Can't reach the Control Room. Check your connection."); }
      if (res.type === "opaqueredirect" || res.status === 401 || res.status === 403) {
        throw new Error("Your login has ended. Reload the page to log in again.");
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      return data;
    },
    async load() { this.db = await this.api("/api/state"); return this.db; },
    meta() { return this.db.meta; },
    areas() { return this.db.areas; },
    areaName(id) { const a = this.db.areas.find((x) => x.id === id); return a ? a.name : (id || ""); },
    tasks(area) { return this.db.tasks.filter((t) => !area || t.area === area); },
    task(id) { return this.db.tasks.find((t) => t.id === id); },
    approvals(status) { return this.db.approvals.filter((a) => !status || a.status === status); },
    activity() { return this.db.activity; },
    async addTask(t) { await this.api("/api/tasks", "POST", t); return this.load(); },
    async editTask(id, patch) { await this.api("/api/tasks/" + encodeURIComponent(id), "PATCH", patch); return this.load(); },
    async askApproval(taskId, ask, risk) { await this.api("/api/approvals", "POST", { taskId, ask, risk }); return this.load(); },
    async decide(id, decision, confirm) {
      await this.api("/api/approvals/" + encodeURIComponent(id) + "/decision", "POST", { decision, confirm: !!confirm });
      return this.load();
    },
  };

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };
  const day = (iso) => (iso ? String(iso).slice(0, 10) : "");
  const PRI = { high: 0, medium: 1, low: 2 };
  const STATUSES = [
    { id: "todo", name: "To do" }, { id: "doing", name: "Doing" },
    { id: "waiting", name: "Waiting for you" }, { id: "done", name: "Done" },
  ];
  let filter = "", confirming = "", editing = "", busy = false;

  function say(text, ok) {
    const m = $("msg"); m.textContent = text; m.className = "msg" + (ok ? " ok" : ""); m.hidden = false;
    clearTimeout(say.t); say.t = setTimeout(() => { m.hidden = true; }, ok ? 2500 : 7000);
  }
  async function act(fn, okText) {
    if (busy) return; busy = true;
    document.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    try { await fn(); if (okText) say(okText, true); }
    catch (e) { say(e.message); }
    finally { busy = false; document.querySelectorAll("button").forEach((b) => { b.disabled = false; }); show(); }
  }

  /* ---------- VIEWS ---------- */
  function renderOverview() {
    const open = Store.tasks().filter((t) => t.status !== "done");
    const pending = Store.approvals("pending");
    $("tiles").innerHTML = [
      tile("Open tasks", open.length, "across 5 areas"),
      tile("Waiting for you", pending.length, "approvals", "hi"),
      tile("High priority", open.filter((t) => t.priority === "high").length, "open tasks"),
      tile("Done", Store.tasks().filter((t) => t.status === "done").length, "tasks finished", "money"),
    ].join("");

    $("ovApprovals").innerHTML = pending.length
      ? pending.slice(0, 3).map((a) => `<div class="row"><div><div class="t">${esc(a.ask)}</div><div class="s">${esc(Store.areaName((Store.task(a.taskId) || {}).area))}</div></div><span class="risk ${esc(a.risk)}">${esc(a.risk)}</span></div>`).join("")
      : `<p class="empty">Nothing waiting.</p>`;

    const max = Math.max(1, ...Store.areas().map((a) => Store.tasks(a.id).length));
    $("areas").innerHTML = Store.areas().map((a) => {
      const all = Store.tasks(a.id), left = all.filter((t) => t.status !== "done").length;
      return `<div><div class="row" style="border:0;padding:4px 0 0"><span class="t">${esc(a.name)}</span><span class="s">${left} open · ${all.length} total</span></div>
              <div class="meter"><i style="width:${((all.length / max) * 100).toFixed(1)}%"></i></div></div>`;
    }).join("");

    $("feed").innerHTML = Store.activity().slice(0, 8).map((e) =>
      `<li class="ev ${esc(e.kind)}"><span class="dot" aria-hidden="true"></span>
        <span class="tx">${esc(e.text)}</span>
        <span class="s">${esc(Store.areaName(e.area))} · ${esc(when(e.at))}</span></li>`).join("") || `<li class="empty">No activity yet. Add your first task.</li>`;
  }
  function tile(label, value, sub, cls) {
    return `<div class="tile ${cls || ""}"><span class="k">${esc(label)}</span><b>${esc(value)}</b><small>${esc(sub)}</small></div>`;
  }

  function renderTasks() {
    const chips = [{ id: "", name: "All" }].concat(Store.areas());
    $("chips").innerHTML = chips.map((c) =>
      `<button class="chip${c.id === filter ? " on" : ""}" data-area="${esc(c.id)}" aria-pressed="${c.id === filter}">${esc(c.name)}<span>${Store.tasks(c.id).length}</span></button>`).join("");
    const list = Store.tasks(filter);
    $("board").innerHTML = STATUSES.map((s) => {
      const items = list.filter((t) => t.status === s.id).sort((a, b) => PRI[a.priority] - PRI[b.priority]);
      return `<div class="col ${s.id}"><h3><span class="k">${esc(s.name)}</span><span class="k n">${items.length}</span></h3>
        ${items.map(taskCard).join("") || `<p class="empty">No tasks</p>`}</div>`;
    }).join("");
  }
  function taskCard(t) {
    return `<button type="button" class="task ${esc(t.priority)}" data-task="${esc(t.id)}">
      <div class="t">${esc(t.title)}</div>
      ${t.notes ? `<div class="n2">${esc(t.notes)}</div>` : ""}
      <div class="m"><span class="pill">${esc(Store.areaName(t.area))}</span><span class="pill p-${esc(t.priority)}">${esc(t.priority)}</span><span class="pill">${esc(day(t.updated))}</span></div>
    </button>`;
  }

  function renderApprovals() {
    const pending = Store.approvals("pending");
    $("inbox").innerHTML = pending.length ? pending.map((a) => {
      const t = Store.task(a.taskId) || {};
      const acts = confirming === a.id
        ? `<div class="confirm" role="alert">
             <p><b>Confirm high-risk approval?</b> This decision is saved and can't be changed later.</p>
             <div class="acts">
               <button class="btn" data-cancel="1">Cancel</button>
               <button class="btn yes" data-id="${esc(a.id)}" data-d="approved" data-ok="1">Yes, approve</button>
             </div></div>`
        : `<div class="acts">
             <button class="btn no" data-id="${esc(a.id)}" data-d="rejected">Reject</button>
             <button class="btn yes" data-id="${esc(a.id)}" data-d="approved">Approve</button>
           </div>`;
      return `<div class="card ap risk-${esc(a.risk)}${confirming === a.id ? " asking" : ""}"><div class="body">
          <div class="t">${esc(a.ask)}</div>
          <div class="s">${esc(t.title || "")} · ${esc(Store.areaName(t.area))} · asked ${esc(when(a.requested))}</div>
        </div>
        <span class="risk ${esc(a.risk)}">${esc(a.risk)} risk</span>
        ${acts}</div>`;
    }).join("") : `<div class="card"><p class="empty">Inbox empty.</p></div>`;

    const done = Store.approvals().filter((a) => a.status !== "pending");
    $("history").innerHTML = done.map((a) =>
      `<div class="card ap done"><div class="body"><div class="t">${esc(a.ask)}</div><div class="s">decided ${esc(when(a.decided))} by ${esc(a.decidedBy)}</div></div>
       <span class="res ${esc(a.status)}">${esc(a.status)}</span></div>`).join("") || `<p class="empty">Nothing decided yet.</p>`;
  }

  /* ---------- task dialog ---------- */
  const dlg = $("taskDlg"), form = $("taskForm"), F = form.elements;
  function openTask(id) {
    editing = id || "";
    const t = id ? Store.task(id) : null;
    $("dlgTitle").textContent = t ? "Edit task" : "New task";
    $("areaSel").innerHTML = Store.areas().map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("");
    F.title.value = t ? t.title : "";
    F.area.value = t ? t.area : (filter || "dev");
    F.priority.value = t ? t.priority : "medium";
    F.status.value = t ? t.status : "todo";
    F.notes.value = t ? t.notes : "";
    F.ask.value = ""; F.risk.value = "low";
    $("askBox").hidden = !t;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function closeTask() { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); editing = ""; }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = { title: F.title.value, area: F.area.value, priority: F.priority.value, status: F.status.value, notes: F.notes.value };
    const id = editing;
    closeTask();
    act(() => (id ? Store.editTask(id, data) : Store.addTask(data)), id ? "Task saved." : "Task added.");
  });
  $("cancelDlg").addEventListener("click", closeTask);
  $("askBtn").addEventListener("click", () => {
    const id = editing, ask = F.ask.value, risk = F.risk.value;
    if (!ask.trim()) { say("Type the approval question first."); return; }
    closeTask();
    act(() => Store.askApproval(id, ask, risk), "Sent to your approval inbox.");
  });

  /* ---------- routing ---------- */
  const VIEWS = { overview: renderOverview, tasks: renderTasks, approvals: renderApprovals };
  function show() {
    if (!Store.db) return;
    const name = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : "overview";
    Object.keys(VIEWS).forEach((v) => { $("view-" + v).hidden = v !== name; });
    document.querySelectorAll(".tabs a").forEach((a) => {
      const on = a.dataset.view === name;
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    VIEWS[name]();
    $("navCount").textContent = Store.approvals("pending").length || "";
  }

  /* ---------- events ---------- */
  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    filter = b.dataset.area; renderTasks();
  });
  $("board").addEventListener("click", (e) => { const b = e.target.closest("[data-task]"); if (b) openTask(b.dataset.task); });
  $("newTask").addEventListener("click", () => openTask(""));
  $("inbox").addEventListener("click", (e) => {
    if (e.target.closest("button[data-cancel]")) { confirming = ""; renderApprovals(); return; }
    const b = e.target.closest("button[data-id]"); if (!b) return;
    const a = Store.approvals().find((x) => x.id === b.dataset.id);
    if (a && a.risk === "high" && b.dataset.d === "approved" && !b.dataset.ok) { confirming = a.id; renderApprovals(); return; }
    confirming = "";
    act(() => Store.decide(b.dataset.id, b.dataset.d, !!b.dataset.ok), b.dataset.d === "approved" ? "Approved and saved." : "Rejected and saved.");
  });
  window.addEventListener("hashchange", () => { confirming = ""; show(); });

  /* ---------- start ---------- */
  Store.load().then(() => {
    $("ver").textContent = Store.meta().title + " · " + Store.meta().version + " · " + Store.db.me;
    show();
  }).catch((err) => {
    document.querySelector(".wrap").innerHTML = `<div class="card"><p class="empty">${esc(err.message)}</p></div>`;
  });
})();
