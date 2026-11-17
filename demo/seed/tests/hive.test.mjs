import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHive, collectHive, resolveSections, describeActivity, mergeCalls, MARKER } from "../../hive/lib/stats.mjs";

const URLS = { paperclip: "http://pc", sim: "http://sim", langflow: "http://lf", bridge: "http://br", registry: "http://rg" };
const CID = "c1";
const DASH = {
  agents: { active: 12, running: 2, paused: 29, error: 0 },
  tasks: { open: 6, inProgress: 1, blocked: 3, done: 2 },
  costs: { monthSpendCents: 1840, monthBudgetCents: 5000 },
  runActivity: Array.from({ length: 20 }, (_, i) => ({ date: `2026-10-${String(i + 10).padStart(2, "0")}`, total: i % 4 })),
};
const ATTN = { totalCount: 2, items: [
  { sourceKind: "approval", subject: { title: "Hire Pricing Strategist", href: "/NORA/approvals/a1" } },
  { sourceKind: "review", subject: { title: "Review draft ATL-OFF-030", href: "/NORA/issues/NORA-28" } },
] };
const AGENTS = [{ status: "idle" }, { status: "running" }, { status: "paused" }];
const LOCAL = {
  twin: { customers: 10000, offers: 22, drafts: 5, addons: 10, scans: 3 },
  kits: [{ kit: "sim", count: 8 }, { kit: "claude_code", count: 2 }],
  sections: [{ id: "twin", label: "Digital twin", items: [{ key: "live", label: "Twin Live", href: "/twin/live" }] },
             { id: "builders", label: "Agent builders", items: [{ key: "builder", label: "Builder · Sim", href: "$sim" }, { key: "langflow", label: "Builder · Langflow", href: "$langflow" }] }],
};

// A fake fetch: routes map URL -> body (or a status). Anything not listed fails like a stopped service.
function fakeFetch(routes) {
  return async (url) => {
    if (!(url in routes)) throw new Error(`connect ECONNREFUSED ${url}`);
    const r = routes[url];
    const status = r?.status ?? 200;
    return { ok: status < 400, status, json: async () => r?.body ?? r };
  };
}
const allUp = () => ({
  "http://pc/api/health": { status: 200 }, "http://sim/": { status: 307 }, "http://lf/health": { status: 200 },
  "http://br/healthz": { status: 200 }, "http://rg/healthz": { status: 200 },
  "http://pc/api/companies": [{ id: "x", status: "active", description: "other" }, { id: CID, name: "ATLAS AI Labs", issuePrefix: "NORA", status: "active", description: `demo ${MARKER}` }],
  [`http://pc/api/companies/${CID}/dashboard`]: DASH,
  [`http://pc/api/companies/${CID}/attention`]: ATTN,
  [`http://pc/api/companies/${CID}/agents`]: AGENTS,
});
const memSnap = (initial = null) => { let s = initial; return { read: () => s, write: (v) => { s = v; }, get: () => s }; };
const run = (routes, snap = memSnap()) => collectHive({ fetch: fakeFetch(routes), urls: URLS, local: () => LOCAL, snapshot: snap, now: () => new Date("2026-10-29T12:00:00Z") });

test("buildHive shapes org numbers, the run sparkline and absolute attention links", () => {
  const h = buildHive({ company: { name: "ATLAS AI Labs", issuePrefix: "NORA" }, dashboard: DASH, attention: ATTN, agents: AGENTS }, URLS.paperclip);
  assert.deepEqual(h.agents, { total: 3, active: 12, running: 2, paused: 29 });
  assert.deepEqual(h.tasks, { open: 6, inProgress: 1, blocked: 3, done: 2 });
  assert.deepEqual(h.spend, { monthCents: 1840, budgetCents: 5000 });
  assert.equal(h.runs.length, 14);                                   // last 14 days only
  assert.equal(h.runs.at(-1).date, "2026-10-29");
  assert.equal(h.attention.total, 2);
  assert.equal(h.attention.items[0].href, "http://pc/NORA/approvals/a1");
  assert.equal(h.url, "http://pc/NORA");
  assert.equal(typeof h.pulse, "string");
});

test("resolveSections puts Org first and resolves $sim and $langflow; a builder that is down keeps its item without a link", () => {
  const s = resolveSections(LOCAL.sections, { org: "http://pc/NORA", sim: "http://sim/workspace", langflow: null });
  assert.equal(s[0].items[0].label, "Organization");
  assert.equal(s[0].items[0].href, "http://pc/NORA/dashboard");
  const b = s.find((x) => x.id === "builders").items;
  assert.equal(b[0].href, "http://sim/workspace");
  assert.equal(b[1].href, null);
  assert.equal(s.find((x) => x.id === "twin").items[0].href, "/twin/live");
});

test("resolveSections drops the HIVE link itself and any section left empty", () => {
  const s = resolveSections([{ id: "home", label: "Home", items: [{ key: "hive", label: "HIVE", href: "/hive" }] }, ...LOCAL.sections], { org: null, sim: null, langflow: null });
  assert.ok(!s.some((x) => x.id === "home"));
  assert.ok(!s.flatMap((x) => x.items).some((i) => i.key === "hive"));
});

test("all services up: mode live, every service ok, snapshot saved", async () => {
  const snap = memSnap();
  const h = await run(allUp(), snap);
  assert.equal(h.mode, "live");
  assert.ok(h.services.every((s) => s.ok));
  assert.equal(h.org.stale, false);
  assert.equal(h.org.attention.total, 2);
  assert.equal(h.twin.customers, 10000);
  assert.equal(snap.get().org.agents.active, 12);
  assert.equal(snap.get().savedAt, "2026-10-29T12:00:00.000Z");
});

test("Langflow down: mode partial, org still live, Langflow link removed", async () => {
  const r = allUp(); delete r["http://lf/health"];
  const h = await run(r);
  assert.equal(h.mode, "partial");
  assert.equal(h.services.find((s) => s.key === "langflow").ok, false);
  assert.equal(h.links.langflow, null);
  assert.equal(h.org.stale, false);
});

test("Paperclip down with a snapshot: org comes from the snapshot, marked stale; mode snapshot", async () => {
  const first = memSnap();
  await run(allUp(), first);
  const r = allUp(); for (const k of Object.keys(r)) if (k.startsWith("http://pc")) delete r[k];
  const h = await run(r, memSnap(first.get()));
  assert.equal(h.mode, "snapshot");
  assert.equal(h.org.stale, true);
  assert.equal(h.org.agents.active, 12);
  assert.equal(h.org.savedAt, "2026-10-29T12:00:00.000Z");
  assert.equal(h.services.find((s) => s.key === "paperclip").ok, false);
  assert.equal(h.links.org, null);
  assert.equal(h.sections[0].items[0].href, null);
});

test("everything down and no snapshot: org is down, twin and launch deck still render", async () => {
  const h = await run({});
  assert.equal(h.mode, "offline");
  assert.equal(h.org.down, true);
  assert.equal(h.twin.offers, 22);
  assert.ok(h.sections.length >= 2);
});

test("no preview company in Paperclip counts as org down, not a crash", async () => {
  const r = allUp(); r["http://pc/api/companies"] = [{ id: "x", status: "active", description: "other" }];
  const h = await run(r);
  assert.equal(h.org.down, true);
  assert.equal(h.mode, "offline");
});

// ── P0-35: the fuller layout ──
const NOW = new Date("2026-10-29T12:00:00Z");
const NAMES_AGENTS = [
  { id: "a1", name: "Competitor Supervisor", status: "idle", lastHeartbeatAt: "2026-10-29T11:00:00Z" },
  { id: "a2", name: "Care Credit Guard", status: "running", lastHeartbeatAt: "2026-10-29T11:59:00Z" },
  { id: "a3", name: "Pricing Strategist", status: "paused", lastHeartbeatAt: null },
  { id: "a4", name: "Jarvis", status: "idle", lastHeartbeatAt: "2026-10-28T09:00:00Z" },
];
const ISSUES = [
  { identifier: "NORA-28", title: "Competitor scan UK", status: "in_review", priority: "medium", assigneeAgentId: "a1", updatedAt: "2026-10-28T09:10:00Z" },
  { identifier: "NORA-26", title: "Bill shock follow-up", status: "blocked", priority: "high", assigneeAgentId: "a4", updatedAt: "2026-10-27T09:00:00Z" },
  { identifier: "NORA-30", title: "Roaming guard", status: "todo", priority: "low", assigneeAgentId: null, updatedAt: "2026-10-29T08:00:00Z" },
  { identifier: "NORA-20", title: "Old", status: "done", priority: "high", assigneeAgentId: "a1", updatedAt: "2026-10-20T08:00:00Z" },
];
const HISTORY = [
  { agentId: "a1", status: "succeeded", startedAt: "2026-10-28T09:07:00Z", finishedAt: "2026-10-28T09:10:00Z", usageJson: { model: "claude-sonnet-5", inputTokens: 124579, outputTokens: 14743, costUsd: 0.96 } },
  { agentId: "a1", status: "succeeded", startedAt: "2026-10-20T09:00:00Z", finishedAt: "2026-10-20T09:01:00Z", usageJson: { model: "claude-sonnet-5", inputTokens: 1000, outputTokens: 100, costUsd: 0.01 } },
];
const ACTIVITY = [
  { id: "e3", action: "issue.comment_added", actorType: "agent", agentId: "a1", details: { identifier: "NORA-28", issueTitle: "Competitor scan UK" }, createdAt: "2026-10-28T09:10:30Z" },
  { id: "e2", action: "approval.approved", actorType: "user", details: { type: "hire_agent" }, createdAt: "2026-10-27T10:00:00Z" },
  { id: "e1", action: "issue.read_marked", actorType: "user", details: {}, createdAt: "2026-10-27T09:00:00Z" },
];
const full = () => buildHive({ company: { name: "ATLAS AI Labs", issuePrefix: "NORA" }, dashboard: DASH, attention: ATTN, agents: NAMES_AGENTS,
  history: HISTORY, liveRuns: [{ agentId: "a2", startedAt: "2026-10-29T11:58:00Z" }], activity: ACTIVITY, issues: ISSUES }, URLS.paperclip, NOW);

test("describeActivity turns Paperclip actions into plain words and skips noise", () => {
  const names = { a1: "Competitor Supervisor" };
  assert.deepEqual(describeActivity(ACTIVITY[0], names), { kind: "work", text: "Competitor Supervisor commented on NORA-28 Competitor scan UK", human: false });
  assert.equal(describeActivity(ACTIVITY[1], names).text, "Board approved hire agent");
  assert.equal(describeActivity(ACTIVITY[1], names).kind, "audit");
  assert.equal(describeActivity({ action: "approval.created", actorType: "user", details: { type: "hire_agent" } }, names).human, true);
  assert.equal(describeActivity(ACTIVITY[2], names), null);
});

test("KPI strip: runs today, 14-day success, tokens and cost over 7 days, open decisions", () => {
  const k = full().kpi;
  assert.equal(k.runsToday, DASH.runActivity.at(-1).total);
  assert.equal(k.tokens7d, 124579 + 14743);          // the 2026-10-20 run is outside 7 days; cached tokens are not counted
  assert.equal(k.cost7d, 0.96);
  assert.equal(k.decisions, 2);
});

test("roster: working first, issue status shows review and blocked, paused counted but not listed", () => {
  const r = full().roster;
  assert.deepEqual(r.agents.map((a) => [a.name, a.state]), [["Care Credit Guard", "working"], ["Competitor Supervisor", "review"], ["Jarvis", "blocked"]]);
  assert.equal(r.counts.paused, 1);
  assert.equal(r.counts.working, 1);
});

test("directives: open tasks by priority, then newest; pipeline by stage", () => {
  const h = full();
  assert.deepEqual(h.directives.map((d) => d.id), ["NORA-26", "NORA-28", "NORA-30"]);
  assert.equal(h.directives[0].href, "http://pc/NORA/issues/NORA-26");
  assert.deepEqual(h.pipeline, { queued: 1, inProgress: 0, review: 1, blocked: 1, done: 1 });
});

test("I/O: live runs by name, the last run with model, tokens and cost; audit and wire split", () => {
  const h = full();
  assert.deepEqual(h.io.live, [{ agent: "Care Credit Guard", startedAt: "2026-10-29T11:58:00Z" }]);
  assert.deepEqual(h.io.last, { agent: "Competitor Supervisor", model: "claude-sonnet-5", inTokens: 124579, outTokens: 14743, costUsd: 0.96, status: "succeeded", at: "2026-10-28T09:10:00Z" });
  assert.equal(h.audit[0].text, "Board approved hire agent");
  assert.ok(h.wire.some((w) => w.text.startsWith("Competitor Supervisor finished a run") && w.tokens === 139322));
  assert.ok(h.wire.some((w) => w.text.includes("commented on NORA-28")));
});

test("buildHive still works when the optional Paperclip reads are missing", () => {
  const h = buildHive({ company: { name: "X", issuePrefix: "NORA" }, dashboard: DASH, attention: ATTN, agents: AGENTS }, URLS.paperclip, NOW);
  assert.deepEqual(h.directives, []);
  assert.equal(h.io.last, null);
  assert.deepEqual(h.pipeline, { queued: 6, inProgress: 1, review: 0, blocked: 3, done: 2 });   // from the dashboard counts
});

test("mergeCalls: tool calls and API traffic, newest first, with calls per minute over 10 minutes", () => {
  const tools = [{ agent: "competitor-supervisor", tool: "save_market_scan", at: "2026-10-29T11:58:00Z" }];
  const traffic = { "678": { calls: 2, recent: [{ at: "2026-10-29T11:59:00Z", api: "678", agent: "care-credit-guard", path: "/twin/tmf/678/customerBill" }, { at: "2026-10-29T10:00:00Z", api: "678", agent: "x", path: "/twin/tmf/678/customerBill" }] } };
  const m = mergeCalls(tools, traffic, NOW);
  assert.deepEqual(m.calls[0], { agent: "care-credit-guard", target: "TMF678 customerBill", kind: "api", at: "2026-10-29T11:59:00Z" });
  assert.equal(m.calls[1].target, "save_market_scan");
  assert.equal(m.perMin, 0.2);
});

// P0-36: the org tree and spend by model for the hive globe
import { buildTree, spendByModel } from "../../hive/lib/stats.mjs";

test("buildTree: lead at the root, departments from reportsTo, nested teams fold into their department, free agents listed", () => {
  const A = [
    { id: "ceo", name: "Ops Lead", role: "ceo", status: "idle", reportsTo: null },
    { id: "care", name: "Care Lead Agent", role: "general", status: "idle", reportsTo: "ceo" },
    { id: "mkt", name: "Marketing Lead Agent", role: "general", status: "idle", reportsTo: "ceo" },
    { id: "bill", name: "Bill Shock Agent", role: "engineer", status: "running", reportsTo: "care" },
    { id: "cat", name: "Catalogue Agent", role: "engineer", status: "idle", reportsTo: "mkt" },
    { id: "sup", name: "Competitor Supervisor", role: "engineer", status: "idle", reportsTo: "cat" },
    { id: "jarvis", name: "Jarvis", role: "general", status: "idle", reportsTo: null },
  ];
  const t = buildTree(A, (a) => (a.status === "running" ? "working" : "idle"), "http://pc/NORA");
  assert.equal(t.lead.name, "Ops Lead");
  assert.deepEqual(t.departments.map((d) => d.short), ["CARE", "MARK"]);
  assert.equal(t.departments[0].agents[0].name, "Bill Shock Agent");
  assert.equal(t.departments[0].agents[0].state, "working");
  assert.equal(t.departments[0].agents[0].href, "http://pc/NORA/agents/bill");
  assert.deepEqual(t.departments[1].agents.map((a) => a.name), ["Catalogue Agent", "Competitor Supervisor"]);   // nested team folds in
  assert.deepEqual(t.free.map((a) => a.name), ["Jarvis"]);
  assert.equal(t.total, 7);
});

test("spendByModel groups the last 7 days of runs by model, most expensive first, with shares", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const runs = [
    { startedAt: "2026-10-28T10:00:00Z", usageJson: { model: "claude-sonnet-5", costUsd: 0.5, inputTokens: 1000, outputTokens: 100 } },
    { startedAt: "2026-10-27T10:00:00Z", usageJson: { model: "claude-sonnet-5", costUsd: 0.25, inputTokens: 500, outputTokens: 50 } },
    { startedAt: "2026-10-26T10:00:00Z", usageJson: { model: "gpt-5.5", costUsd: 1, inputTokens: 100, outputTokens: 10 } },
    { startedAt: "2026-10-01T10:00:00Z", usageJson: { model: "old", costUsd: 9 } },               // outside the window
    { startedAt: "2026-10-28T11:00:00Z", usageJson: { costUsd: 0.1 } },                            // no model
  ];
  const m = spendByModel(runs, now);
  assert.deepEqual(m.map((x) => x.model), ["gpt-5.5", "claude-sonnet-5", "unknown"]);
  assert.equal(m[1].costUsd, 0.75);
  assert.equal(m[1].tokens, 1650);
  assert.equal(m[1].runs, 2);
  assert.equal(m[0].share, 54);
});

test("buildHive carries tree and spendByModel in the org block", () => {
  const h = buildHive({ company: { name: "X", issuePrefix: "NORA" }, dashboard: DASH, attention: ATTN,
    agents: [{ id: "ceo", name: "Lead", role: "ceo", status: "idle", reportsTo: null }, { id: "d", name: "Care Lead Agent", role: "general", status: "idle", reportsTo: "ceo" }],
    history: [{ startedAt: "2026-10-28T10:00:00Z", usageJson: { model: "m", costUsd: 0.2 } }] }, URLS.paperclip, new Date("2026-10-29T12:00:00Z"));
  assert.equal(h.tree.departments.length, 1);
  assert.equal(h.spendByModel[0].model, "m");
});

// P0-38: any active Paperclip company can be shown; the payload lists them; snapshots stay with the preview company.
test("collectHive lists active companies and reads the one asked for by prefix", async () => {
  const routes = allUp();
  routes["http://pc/api/companies"] = [...routes["http://pc/api/companies"], { id: "q1", name: "Chris AI Labs", issuePrefix: "QVA", status: "active", description: "" }, { id: "z", name: "Old", issuePrefix: "OLD", status: "archived" }];
  routes["http://pc/api/companies/q1/dashboard"] = DASH; routes["http://pc/api/companies/q1/attention"] = ATTN; routes["http://pc/api/companies/q1/agents"] = AGENTS;
  const snap = memSnap();
  const d = await collectHive({ fetch: fakeFetch(routes), urls: URLS, local: () => LOCAL, snapshot: snap, company: "QVA", now: () => new Date("2026-10-29T12:00:00Z") });
  assert.equal(d.org.company, "Chris AI Labs");
  assert.equal(d.org.prefix, "QVA");
  assert.deepEqual(d.companies, [{ name: "ATLAS AI Labs", prefix: "NORA", preview: true }, { name: "Chris AI Labs", prefix: "QVA", preview: false }]);   // active, with a prefix
  assert.equal(snap.get(), null);                                    // not the preview company: no snapshot written
  const def = await run(routes);
  assert.equal(def.org.prefix, "NORA");                              // default stays the preview company
});

test("builders are named Agent Builder 1 and 2 in the health pills", async () => {
  const d = await run(allUp());
  assert.deepEqual(d.services.filter((s) => ["sim", "langflow"].includes(s.key)).map((s) => s.label), ["Builder 1", "Builder 2"]);
});

test("collectHive also picks a company by id (the org Chris last opened in Paperclip)", async () => {
  const routes = allUp();
  routes["http://pc/api/companies"] = [...routes["http://pc/api/companies"], { id: "q1", name: "Chris AI Labs", issuePrefix: "QVA", status: "active" }];
  routes["http://pc/api/companies/q1/dashboard"] = DASH; routes["http://pc/api/companies/q1/attention"] = ATTN; routes["http://pc/api/companies/q1/agents"] = AGENTS;
  const d = await collectHive({ fetch: fakeFetch(routes), urls: URLS, local: () => LOCAL, snapshot: memSnap(), company: "q1", now: () => new Date("2026-10-29T12:00:00Z") });
  assert.equal(d.org.prefix, "QVA");
});
