// HIVE entry page data (P0-34, P0-35): one payload for /data/hive.json, built in the Explorer so the page makes no cross-origin calls.
// Org numbers come live from Paperclip; when Paperclip is down they come from the last good snapshot, marked stale.
// The twin, agent calls, kits and launch deck are local to the Explorer and always present.

export const MARKER = "[preview-id: atlas-nordwave-p0]";
const TIMEOUT_MS = 2000;
const DAY = 86_400_000;

const SERVICES = [
  { key: "paperclip", label: "Org", path: "/api/health" },
  { key: "sim", label: "Builder 1", path: "/" },   // builders are shown by number, never by product name (P0-38)
  { key: "langflow", label: "Builder 2", path: "/health" },
  { key: "bridge", label: "Bridge", path: "/healthz" },
  { key: "registry", label: "Registry", path: "/healthz" },
];

const list = (x) => (Array.isArray(x) ? x : x?.items ?? []);
const words = (s) => String(s ?? "").replace(/_/g, " ");
const time = (s) => (s ? Date.parse(s) : 0);

// One Paperclip activity row -> { kind: "audit" | "work", text, human } in plain words, or null for noise (reads, leases, queues).
export function describeActivity(a, names) {
  const d = a.details ?? {};
  const who = a.actorType === "agent" ? names[a.agentId ?? a.actorId] ?? "An agent" : a.actorType === "user" ? "Board" : "System";
  const id = d.identifier ? `${d.identifier} ` : "";
  const audit = (text, human = false) => ({ kind: "audit", text, human });
  const work = (text, human = false) => ({ kind: "work", text: text.trim(), human });
  switch (a.action) {
    case "approval.created": return audit(`Approval requested: ${words(d.type)}`, true);
    case "approval.approved": return audit(`Board approved ${words(d.type)}`);
    case "approval.rejected": return audit(`Board rejected ${words(d.type)}`);
    case "agent.hire_created": return audit(`Hire filed: ${d.name ?? "agent"}`);
    case "agent.paused": return audit(`${names[a.entityId] ?? "An agent"} paused`);
    case "agent.terminated": return audit(`${names[a.entityId] ?? "An agent"} retired`);
    case "company.skill_audited": return audit(`Skill audit: ${d.verdict ?? "done"}`);
    case "budget.policy_upserted": return audit(`Budget cap set: $${(Number(d.amount ?? 0) / 100).toFixed(2)}`);
    case "issue.created": return work(`${who} opened ${id}${d.title ?? ""}`);
    case "issue.comment_added": return work(`${who} commented on ${id}${d.issueTitle ?? ""}`);
    case "issue.updated": return d.changes?.status ? work(`${id}moved to ${words(d.changes.status.to)}`) : null;
    case "issue.thread_interaction_created": return work(`${who} asked the board a question`, true);
    default: return null;
  }
}

// Twin agent calls for Agent I/O: MCP tool calls from the sandbox plus TMF API traffic, newest first.
export function mergeCalls(toolCalls = [], traffic = {}, now = new Date()) {
  const api = Object.values(traffic).flatMap((s) => s.recent ?? []).map((h) => {
    const res = String(h.path ?? "").split("/")[4] ?? "";
    return { agent: h.agent, target: `TMF${h.api}${res ? " " + res : ""}`, kind: "api", at: h.at };
  });
  const tools = toolCalls.map((c) => ({ agent: c.agent, target: c.tool, kind: "tool", at: c.at }));
  const all = [...api, ...tools].sort((a, b) => time(b.at) - time(a.at));
  const recent = all.filter((c) => now - time(c.at) <= 10 * 60_000).length;
  return { calls: all.slice(0, 4), perMin: Math.round((recent / 10) * 10) / 10 };
}

// P0-36: the organization as a tree for the hive globe. Departments are the agents that report to the lead (or to nobody
// while being a "general" with reports); a team under a department agent folds into that department. Free agents report to nobody.
export function buildTree(agents, stateOf, base) {
  const agentList = list(agents), byId = Object.fromEntries(agentList.map((a) => [a.id, a]));
  const lead = agentList.find((a) => a.role === "ceo") ?? agentList.find((a) => !a.reportsTo && agentList.some((b) => b.reportsTo === a.id)) ?? null;
  const row = (a) => ({ id: a.id, name: a.name, state: stateOf(a), href: `${base}/agents/${a.id}` });
  const deptOf = (a) => { let cur = a, hops = 0; while (cur && hops++ < 12) { if (cur.reportsTo === (lead?.id ?? null) && cur !== lead) return cur.id; cur = byId[cur.reportsTo]; } return null; };
  const depts = agentList.filter((a) => a !== lead && a.reportsTo === (lead?.id ?? null) && a.role !== "engineer");
  const departments = depts.map((d) => ({
    id: d.id, name: d.name.replace(/ Lead Agent$/i, "").replace(/ Agent$/i, ""),
    short: d.name.split(/\s+/)[0].slice(0, 4).toUpperCase(),
    lead: row(d),
    agents: agentList.filter((a) => a !== d && deptOf(a) === d.id).map(row),
  }));
  const placed = new Set([lead?.id, ...departments.flatMap((d) => [d.id, ...d.agents.map((a) => a.id)])]);
  const free = agentList.filter((a) => !placed.has(a.id)).map(row);
  return { lead: lead ? row(lead) : null, departments, free, total: agentList.length };
}

// P0-36: cost over the last 7 days by model, most expensive first.
export function spendByModel(history, now = new Date()) {
  const acc = {};
  for (const r of list(history)) {
    if (now - time(r.startedAt) > 7 * DAY) continue;
    const u = r.usageJson ?? {}, m = u.model ?? "unknown";
    const x = (acc[m] ??= { model: m, costUsd: 0, tokens: 0, runs: 0 });
    x.costUsd += u.costUsd ?? 0; x.tokens += (u.inputTokens ?? 0) + (u.outputTokens ?? 0); x.runs += 1;
  }
  const rows = Object.values(acc).sort((a, b) => b.costUsd - a.costUsd);
  const total = rows.reduce((s, r) => s + r.costUsd, 0) || 1;
  return rows.map((r) => ({ ...r, costUsd: Math.round(r.costUsd * 10000) / 10000, share: Math.round((r.costUsd / total) * 100) }));
}

const PRIORITY = { critical: 0, urgent: 0, high: 1, medium: 2, low: 3 };
const OPEN = new Set(["backlog", "todo", "in_progress", "in_review", "blocked"]);
const STATE_RANK = { working: 0, review: 1, blocked: 2, waiting: 3, idle: 4 };
const ISSUE_STATE = { blocked: "blocked", in_review: "review", in_progress: "waiting" };

// Paperclip responses -> the org block of the page. history, liveRuns, activity and issues are optional.
export function buildHive({ company, dashboard, attention, agents, history = [], liveRuns = [], activity = [], issues = [] }, paperclipUrl, now = new Date()) {
  const base = `${paperclipUrl}/${company.issuePrefix}`;
  const agentList = list(agents), issueList = list(issues), runList = list(history);
  const names = Object.fromEntries(agentList.map((a) => [a.id, a.name]));
  const runs = (dashboard.runActivity ?? []).slice(-14).map((d) => ({ date: d.date, total: d.total ?? 0 }));
  const items = list(attention.items ?? attention).slice(0, 6).map((a) => ({
    kind: a.sourceKind,
    title: a.subject?.title ?? a.sourceKind,
    href: a.subject?.href ? `${paperclipUrl}${a.subject.href}` : `${base}/inbox`,
  }));
  const attentionTotal = attention.totalCount ?? items.length;

  // KPI strip
  const act14 = (dashboard.runActivity ?? []).slice(-14);
  const total14 = act14.reduce((s, d) => s + (d.total ?? 0), 0), ok14 = act14.reduce((s, d) => s + (d.succeeded ?? 0), 0);
  const week = runList.filter((r) => now - time(r.startedAt) <= 7 * DAY);
  const kpi = {
    runsToday: act14.at(-1)?.total ?? 0,
    success14: total14 ? Math.round((ok14 / total14) * 100) : null,
    tokens7d: week.reduce((s, r) => s + (r.usageJson?.inputTokens ?? 0) + (r.usageJson?.outputTokens ?? 0), 0),
    cost7d: Math.round(week.reduce((s, r) => s + (r.usageJson?.costUsd ?? 0), 0) * 100) / 100,
    decisions: attentionTotal,
  };

  // Roster: state from the agent, sharpened by its worst open task
  const openIssues = issueList.filter((i) => OPEN.has(i.status));
  const issueState = {};
  for (const i of openIssues) {
    const s = ISSUE_STATE[i.status]; if (!s || !i.assigneeAgentId) continue;
    const cur = issueState[i.assigneeAgentId];
    if (!cur || STATE_RANK[s] < STATE_RANK[cur]) issueState[i.assigneeAgentId] = s;
  }
  const stateOf = (a) => (a.status === "running" ? "working" : a.status === "error" ? "blocked" : a.status === "paused" ? "paused" : issueState[a.id] ?? "idle");
  const roster = agentList.map((a) => ({ name: a.name, state: stateOf(a), lastSeen: a.lastHeartbeatAt ?? null }));
  const counts = {};
  for (const r of roster) counts[r.state] = (counts[r.state] ?? 0) + 1;
  const shown = roster.filter((r) => r.state !== "paused")
    .sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || time(b.lastSeen) - time(a.lastSeen)).slice(0, 6);

  // Directives and pipeline
  const directives = [...openIssues]
    .sort((a, b) => (PRIORITY[a.priority] ?? 9) - (PRIORITY[b.priority] ?? 9) || time(b.updatedAt) - time(a.updatedAt))
    .slice(0, 3)
    .map((i) => ({ id: i.identifier, title: i.title, status: i.status, agent: names[i.assigneeAgentId] ?? null, href: `${base}/issues/${i.identifier}` }));
  const by = (s) => issueList.filter((i) => s.includes(i.status)).length;
  const t = dashboard.tasks ?? {};
  const pipeline = issueList.length
    ? { queued: by(["backlog", "todo"]), inProgress: by(["in_progress"]), review: by(["in_review"]), blocked: by(["blocked"]), done: by(["done"]) }
    : { queued: t.open ?? 0, inProgress: t.inProgress ?? 0, review: 0, blocked: t.blocked ?? 0, done: t.done ?? 0 };

  // Agent I/O: live runs and the last finished run
  const lastRun = [...runList].sort((a, b) => time(b.startedAt) - time(a.startedAt))[0];
  const io = {
    live: list(liveRuns).map((r) => ({ agent: names[r.agentId] ?? "Agent", startedAt: r.startedAt })),
    last: lastRun ? {
      agent: names[lastRun.agentId] ?? "Agent", model: lastRun.usageJson?.model ?? null,
      inTokens: lastRun.usageJson?.inputTokens ?? 0, outTokens: lastRun.usageJson?.outputTokens ?? 0,
      costUsd: lastRun.usageJson?.costUsd ?? 0, status: lastRun.status, at: lastRun.finishedAt ?? lastRun.startedAt,
    } : null,
  };

  // Audit trail and wire, from activity plus finished runs
  const described = list(activity).map((a) => ({ ...describeActivity(a, names), at: a.createdAt, actor: a.action })).filter((x) => x.kind);
  const audit = described.filter((x) => x.kind === "audit").slice(0, 5).map(({ text, at, human }) => ({ text, at, human }));
  const runEvents = runList.slice(0, 10).filter((r) => r.finishedAt).map((r) => ({
    text: `${names[r.agentId] ?? "An agent"} finished a run${r.status === "succeeded" ? "" : ` (${words(r.status)})`}`,
    at: r.finishedAt, human: false, tokens: (r.usageJson?.inputTokens ?? 0) + (r.usageJson?.outputTokens ?? 0),
  }));
  const wire = [...described.filter((x) => x.kind === "work").map(({ text, at, human }) => ({ text, at, human, tokens: null })), ...runEvents]
    .sort((a, b) => time(b.at) - time(a.at)).slice(0, 6);

  const org = {
    company: company.name,
    url: base,
    agents: { total: agentList.length, active: dashboard.agents?.active ?? 0, running: dashboard.agents?.running ?? 0, paused: dashboard.agents?.paused ?? 0 },
    tasks: { open: t.open ?? 0, inProgress: t.inProgress ?? 0, blocked: t.blocked ?? 0, done: t.done ?? 0 },
    spend: { monthCents: dashboard.costs?.monthSpendCents ?? 0, budgetCents: dashboard.costs?.monthBudgetCents ?? 0 },
    runs,
    attention: { total: attentionTotal, items },
    kpi, roster: { agents: shown, counts }, directives, pipeline, io, audit, wire,
    tree: buildTree(agentList, stateOf, base), spendByModel: spendByModel(runList, now),
  };
  // Changes whenever something happens in the org; the page spins the sphere when it changes.
  org.pulse = JSON.stringify([org.tasks, org.agents.running, attentionTotal, runs.at(-1)?.total ?? 0, list(activity)[0]?.id ?? null, io.live.length]);
  return org;
}

// Launch deck: Organization first, then the shared sidebar sections. $sim / $langflow become live links, or null while that builder is down.
export function resolveSections(sections, links) {
  const org = { id: "org", label: "Organization", items: [
    { key: "org", label: "Organization", href: links.org ? `${links.org}/dashboard` : null },
    { key: "agents", label: "Agents", href: links.org ? `${links.org}/agents/all` : null },
    { key: "approvals", label: "Approvals", href: links.org ? `${links.org}/approvals` : null },
  ] };
  const fix = (href) => (href === "$sim" ? links.sim : href === "$langflow" ? links.langflow : href);
  // The shared sections link back to HIVE itself; on the HIVE page that link is dropped.
  const rest = sections.map((s) => ({ ...s, items: s.items.filter((i) => i.key !== "hive").map((i) => ({ ...i, href: fix(i.href) })) }));
  return [org, ...rest.filter((s) => s.items.length)];
}

async function get(fetchFn, url) {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual" });
  if (res.status >= 400) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

// prefix picks a company by issuePrefix or id (P0-38); without one, or when it is unknown, the preview company (MARKER).
async function readOrg(fetchFn, pc, now, prefix) {
  const companies = list(await (await get(fetchFn, `${pc}/api/companies`)).json()).filter((c) => c.status !== "archived" && c.issuePrefix);
  const preview = companies.find((c) => c.description?.includes(MARKER));
  const company = (prefix && companies.find((c) => c.issuePrefix === prefix || c.id === prefix)) || preview;
  if (!company) throw new Error("no preview company in Paperclip");
  const api = `${pc}/api/companies/${company.id}`;
  const need = async (p) => (await get(fetchFn, `${api}/${p}`)).json();
  const optional = async (p) => { try { return await need(p); } catch { return []; } };   // a missing extra empties its block, not the org
  const [dashboard, attention, agents, history, liveRuns, activity, issues] = await Promise.all([
    need("dashboard"), need("attention"), need("agents"),
    optional("heartbeat-runs?limit=50"), optional("live-runs"), optional("activity?limit=100"), optional("issues"),
  ]);
  const org = buildHive({ company, dashboard, attention, agents, history, liveRuns, activity, issues }, pc, now);
  org.prefix = company.issuePrefix;
  org.preview = company === preview;
  return { org, companies: companies.map((c) => ({ name: c.name, prefix: c.issuePrefix, preview: c === preview })) };
}

// snapshot: { read() -> {org, savedAt} | null, write(value) }. local(): { twin, kits, sections, calls?, counts? }.
export async function collectHive({ fetch: fetchFn = fetch, urls, local, snapshot, company = null, now = () => new Date() }) {
  const at = now(), stamp = at.toISOString();
  const services = await Promise.all(SERVICES.map(async (s) => {
    try { await get(fetchFn, `${urls[s.key]}${s.path}`); return { key: s.key, label: s.label, ok: true }; }
    catch { return { key: s.key, label: s.label, ok: false }; }
  }));
  const up = Object.fromEntries(services.map((s) => [s.key, s.ok]));

  let org, companies = [];
  try {
    const r = await readOrg(fetchFn, urls.paperclip, at, company);
    org = { ...r.org, stale: false }; companies = r.companies;
    // Only the preview company is snapshotted, so the fallback never shows another org.
    if (org.preview) try { snapshot?.write({ org, savedAt: stamp }); } catch { /* a snapshot we cannot write only costs the fallback */ }
  } catch {
    let snap = null;
    try { snap = snapshot?.read(); } catch { /* unreadable snapshot: treat as none */ }
    org = snap?.org ? { ...snap.org, stale: true, savedAt: snap.savedAt } : { down: true, stale: true };
  }

  const links = {
    org: org.down || !up.paperclip ? null : org.url,   // snapshot numbers can show, but links to a stopped Paperclip cannot work
    sim: up.sim ? `${urls.sim}/workspace` : null,
    langflow: up.langflow ? urls.langflow : null,
  };
  const { twin, kits, sections, calls = { calls: [], perMin: 0 }, counts = {} } = local();
  const mode = org.down ? "offline" : org.stale ? "snapshot" : services.every((s) => s.ok) ? "live" : "partial";
  return { asOf: stamp, mode, services: [...services, { key: "twin", label: "Twin", ok: true }], org, companies, twin, kits, calls, counts, links, sections: resolveSections(sections, links) };
}
