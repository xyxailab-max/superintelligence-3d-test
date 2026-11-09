/* USI Control Room V1 — TEST prototype.
   Two parts:
   1) Store  = where data comes from. Today: data.json (sample). Later: Cloudflare D1 through a Worker API.
   2) Views  = draws the screens. Views only talk to Store, so swapping the data source won't change them.
   No AI, no network calls except loading data.json, nothing is saved. */
(function () {
  "use strict";

  /* ---------- 1) STORE ---------- */
  const Store = {
    source: "sample",          // later: "api" (D1 via Worker, behind Cloudflare Access)
    db: null,

    async load() {
      if (this.source === "sample") {
        const res = await fetch("data.json", { cache: "no-store" });
        if (!res.ok) throw new Error("Could not load sample data.");
        this.db = await res.json();
      }
      // Later: if (this.source === "api") { ... fetch("/api/tasks") etc. }
      return this.db;
    },
    meta() { return this.db.meta; },
    areas() { return this.db.areas; },
    areaName(id) { const a = this.db.areas.find((x) => x.id === id); return a ? a.name : id; },
    tasks(area) { return this.db.tasks.filter((t) => !area || t.area === area); },
    task(id) { return this.db.tasks.find((t) => t.id === id); },
    approvals(status) { return this.db.approvals.filter((a) => !status || a.status === status); },
    costs() { return this.db.costs; },

    // Demo only: changes memory, not a server. Resets on reload.
    async decide(id, decision) {
      const a = this.db.approvals.find((x) => x.id === id);
      if (!a || a.status !== "pending") return;
      a.status = decision;                       // "approved" | "rejected"
      a.decided = new Date().toISOString().slice(0, 10);
      // Later: await fetch("/api/approvals/" + id, { method: "POST", body: JSON.stringify({ decision }) });
    },
  };

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + Number(n).toFixed(2);
  const PRI = { high: 0, medium: 1, low: 2 };
  const STATUSES = [
    { id: "todo", name: "To do" },
    { id: "doing", name: "Doing" },
    { id: "waiting", name: "Waiting for you" },
    { id: "done", name: "Done" },
  ];
  let filter = "";             // "" = all areas

  /* ---------- 2) VIEWS ---------- */
  function renderOverview() {
    const open = Store.tasks().filter((t) => t.status !== "done");
    const pending = Store.approvals("pending");
    const high = open.filter((t) => t.priority === "high");
    const spent = Store.costs().reduce((s, c) => s + c.amount, 0);
    const budget = Store.meta().monthlyBudget;

    $("tiles").innerHTML = [
      tile("Open tasks", open.length, "across 5 areas"),
      tile("Waiting for you", pending.length, "approvals", "hi"),
      tile("High priority", high.length, "open tasks"),
      tile("Spent this month", money(spent), "of " + money(budget) + " budget", "money"),
    ].join("");

    $("ovApprovals").innerHTML = pending.length
      ? pending.slice(0, 3).map((a) => `<div class="row"><div><div class="t">${esc(a.ask)}</div><div class="s">${esc(Store.areaName((Store.task(a.taskId) || {}).area))}</div></div><span class="risk ${esc(a.risk)}">${esc(a.risk)}</span></div>`).join("")
      : `<p class="empty">Nothing waiting. Nice.</p>`;

    $("month").textContent = Store.meta().month;
    const pct = Math.min(100, (spent / budget) * 100);
    $("budget").innerHTML =
      `<div class="big">${money(spent)} <small>of ${money(budget)}</small></div>
       <div class="meter gold"><i style="width:${pct.toFixed(1)}%"></i></div>` +
      Store.costs().map((c) => `<div class="row"><span class="s">${esc(c.item)}</span><span class="amt">${money(c.amount)}</span></div>`).join("");

    const max = Math.max(1, ...Store.areas().map((a) => Store.tasks(a.id).length));
    $("areas").innerHTML = Store.areas().map((a) => {
      const all = Store.tasks(a.id), left = all.filter((t) => t.status !== "done").length;
      return `<div><div class="row" style="border:0;padding:4px 0 0"><span class="t">${esc(a.name)}</span><span class="s">${left} open · ${all.length} total</span></div>
              <div class="meter"><i style="width:${((all.length / max) * 100).toFixed(1)}%"></i></div></div>`;
    }).join("");
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
    return `<div class="task ${esc(t.priority)}">
      <div class="t">${esc(t.title)}</div>
      ${t.notes ? `<div class="n2">${esc(t.notes)}</div>` : ""}
      <div class="m"><span class="pill">${esc(Store.areaName(t.area))}</span><span class="pill p-${esc(t.priority)}">${esc(t.priority)}</span><span class="pill">${esc(t.updated)}</span></div>
    </div>`;
  }

  function renderApprovals() {
    const pending = Store.approvals("pending");
    $("inbox").innerHTML = pending.length ? pending.map((a) => {
      const t = Store.task(a.taskId) || {};
      return `<div class="card ap"><div class="body">
          <div class="t">${esc(a.ask)}</div>
          <div class="s">${esc(t.title || "")} · ${esc(Store.areaName(t.area))} · asked ${esc(a.requested)}</div>
        </div>
        <span class="risk ${esc(a.risk)}">${esc(a.risk)} risk</span>
        <div class="acts">
          <button class="btn no" data-id="${esc(a.id)}" data-d="rejected">Reject (demo)</button>
          <button class="btn yes" data-id="${esc(a.id)}" data-d="approved">Approve (demo)</button>
        </div></div>`;
    }).join("") : `<div class="card"><p class="empty">Inbox empty. Reload the page to bring the samples back.</p></div>`;

    const done = Store.approvals().filter((a) => a.status !== "pending");
    $("history").innerHTML = done.map((a) =>
      `<div class="card ap done"><div class="body"><div class="t">${esc(a.ask)}</div><div class="s">decided ${esc(a.decided)}</div></div>
       <span class="res ${esc(a.status)}">${esc(a.status)}</span></div>`).join("") || `<p class="empty">Nothing decided yet.</p>`;

    $("navCount").textContent = pending.length || "";
  }

  /* ---------- routing (#overview / #tasks / #approvals) ---------- */
  const VIEWS = { overview: renderOverview, tasks: renderTasks, approvals: renderApprovals };
  function show() {
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
  $("inbox").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-id]"); if (!b) return;
    await Store.decide(b.dataset.id, b.dataset.d);
    renderApprovals();
  });
  window.addEventListener("hashchange", show);

  /* ---------- start ---------- */
  Store.load().then(() => {
    $("ver").textContent = Store.meta().title + " · " + Store.meta().version + " · sample data";
    show();
  }).catch((err) => {
    document.querySelector(".wrap").innerHTML = `<div class="card"><p class="empty">${esc(err.message)}</p></div>`;
  });
})();
