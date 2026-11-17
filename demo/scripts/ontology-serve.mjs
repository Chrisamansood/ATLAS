#!/usr/bin/env node
// Serves the Ontology Explorer (ontology/index.html) and its data. Zero dependencies, loopback only.
// Usage: node scripts/ontology-serve.mjs        Port: PORT (default 3500). Data is re-read on every request.
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { linkOntology, validateOntology, mergeGeneral, lookupLive, validatePack } from "../seed/lib/ontology.mjs";
import { mockBss } from "../seed/lib/mock-bss.mjs";
import { generate } from "../twin/lib/data.mjs";
import { compare, billShockPopulation } from "../twin/lib/scenarios.mjs";
import { tmfHandle } from "../twin/lib/tmf.mjs";
import { customerRecord, cdrs, dashboard, listCustomers, tmf676 } from "../twin/lib/records.mjs";
import { createSandbox } from "../twin/lib/overlay.mjs";
import { streamEvent, explainLine } from "../twin/lib/live.mjs";
import { createMcp, loadAgentTokens } from "../twin/lib/mcp.mjs";
import { createCatalogue } from "../twin/lib/catalogue.mjs";
import { deskCatalog, createTraffic } from "../twin/lib/apidesk.mjs";
import { CATALOGUE } from "../twin/lib/data.mjs";
import { generateCells } from "../twin/lib/network.mjs";
import { MONTH_LABELS } from "../twin/lib/tmf.mjs";
import { decisionsPayload, loadPredictions } from "../decision/lib/results.mjs";
import { mergeCalls } from "../hive/lib/stats.mjs";
import { standaloneHive } from "../hive/lib/standalone.mjs";
import { pickTheme, renderTheme } from "../hive/lib/themes.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT ?? 3500);
const RUNTIME = process.env.ATLAS_DEMO_DATA_DIR ?? fileURLToPath(new URL("../.runtime/", import.meta.url));
mkdirSync(RUNTIME, { recursive: true });
const read = (p) => JSON.parse(readFileSync(new URL(p, new URL("../", import.meta.url)), "utf8"));

// Industry ontologies (P0-33): the same Explorer for another industry and another agent organization. Files in seed/ontology/industries/.
const INDUSTRIES = ["banking", "healthcare"];
function industryData(id) {
  const x = read(`seed/ontology/industries/${id}.json`), { roster, ...ontology } = x;
  const linked = linkOntology(ontology, roster);
  linked.validationErrors = validateOntology(ontology, roster);
  linked.roster = roster;
  return linked;
}
async function data(industry = null) {
  if (INDUSTRIES.includes(industry)) return industryData(industry);
  const roster = read("seed/nordwave-roster.json");
  const ontology = mergeGeneral(read("seed/ontology/nordwave-ontology.json"), read("seed/ontology/telco-general.json"));
  const errors = validateOntology(ontology, roster);
  const linked = linkOntology(ontology, roster);
  linked.agents = linked.agents.map((a) => ({ ...a, url: `/organization#${a.key ?? a.id}` }));
  linked.links = { paperclip: null, sim: null };
  linked.pack = null;
  linked.validationErrors = errors;
  return linked;
}

// The BSS twin: one seeded world per process (about 100 ms to build), read-only.
let twinWorld = null;
const world = () => (twinWorld ??= generate());
// Sandbox overlay (what agents did) lives in .runtime, never in the seed; agent tokens are created on first start and never committed.
const sandbox = createSandbox({ file: `${RUNTIME}/twin-overlay.json` });
const policyValues = () => read("skills/policy-values.json");
const traffic = createTraffic();
let mcp = null;
const catalogue = createCatalogue({ file: `${RUNTIME}/twin-catalogue.json` });   // P0-30: drafts persist across agents and restarts; reset with the sandbox
const twinMcp = () => (mcp ??= createMcp({ world: world(), policy: policyValues(), sandbox, catalogue, tokens: loadAgentTokens(`${RUNTIME}/secrets/twin-agent-tokens.json`) }));
const readBody = (req) => new Promise((resolve, reject) => { let raw = ""; req.on("data", (d) => { raw += d; if (raw.length > 100000) { reject(new Error("body too large")); req.destroy(); } }); req.on("end", () => resolve(raw)); });
const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
const num = (v, d) => (v == null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));

function hiveLocal() {
  const s = catalogue.view().summary;
  return {
    twin: { customers: dashboard(world()).customers, offers: s.active, drafts: s.drafts, addons: s.addons },
    kits: [], sections: read("shared/atlas-sections.json").sections,
    calls: mergeCalls(sandbox.state().calls, traffic.summary()),
    counts: { engines: 0, industries: 1 + INDUSTRIES.length },
  };
}

const merged = () => mergeGeneral(read("seed/ontology/nordwave-ontology.json"), read("seed/ontology/telco-general.json"));

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const path = url.pathname;
  const hosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
  if (!hosts.has(req.headers.host)) return json(res, 403, { error: "Loopback host required" });
  if (req.method !== "GET" && req.method !== "HEAD" && req.headers.origin &&
      ![...hosts].some((host) => req.headers.origin === `http://${host}`)) {
    return json(res, 403, { error: "Cross-origin writes are disabled" });
  }
  try {
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(readFileSync(`${root}ontology/index.html`));
    } else if (path === "/shared/atlas-sections.json") {
      // Sidebar sections; Paperclip's sidebar (another origin) reads it too, so it is open to any origin. Read-only, no secrets.
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" });
      res.end(readFileSync(`${root}shared/atlas-sections.json`));
    } else if (path === "/shared/platform-nav.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      res.end(readFileSync(`${root}shared/platform-nav.js`));
    } else if (path === "/data/platform.json") {
      json(res, 200, { paperclip: null, sim: null, langflow: null });
    } else if (path === "/organization" || path === "/organization/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(readFileSync(`${root}hive/ui/organization.html`));
    } else if (path === "/data/roster.json") {
      json(res, 200, read("seed/nordwave-roster.json"));
    } else if (path === "/hive" || path === "/hive/") {
      // P0-39: every HIVE design, picked by ?theme= or the hive_theme cookie (Sphere by default); same origin, so Explorer links stay relative.
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(renderTheme(`${root}hive/ui/`, pickTheme(url.search, req.headers.cookie)));
    } else if (path === "/hive/v3" || path === "/hive/v3/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(renderTheme(`${root}hive/ui/`, "globe"));
    } else if (path === "/data/hive.json") {
      json(res, 200, standaloneHive(read("seed/nordwave-roster.json"), hiveLocal(), sandbox.state()));
    } else if (path === "/data/ontology.json") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(await data(url.searchParams.get("industry"))));
    } else if (path === "/data/industries.json") {
      json(res, 200, [{ id: "telco", label: "Telecom", operator: "ATLAS AI Labs", standard: "TMF Open API" }, ...INDUSTRIES.map((id) => { const x = read(`seed/ontology/industries/${id}.json`); return { id, label: x.industryLabel, operator: x.operator, standard: x.standard, source: x.source }; })]);
    } else if (path === "/decisions" || path === "/decisions/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(readFileSync(`${root}decision/ui/index.html`));
    } else if (path === "/decisions/replay.mjs") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      res.end(readFileSync(`${root}decision/lib/replay.mjs`));
    } else if (path === "/data/decisions.json") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(decisionsPayload(`${RUNTIME}/decision/results`)));
    } else if (path === "/data/decisions/predictions") {
      const rows = loadPredictions(`${RUNTIME}/decision/results`, url.searchParams.get("engine"), url.searchParams.get("use"));
      res.writeHead(rows ? 200 : 404, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(rows ?? { error: "no predictions for that engine and use" }));
    } else if (path === "/api/resolve") {
      // Live ontology lookup for Sim workflows: ?text=...&workflow=<id>. Read-only; the answer is built from the ontology files on every call.
      const o = merged();
      const wf = (o.workflows ?? []).find((w) => w.id === url.searchParams.get("workflow"));
      const result = lookupLive(o, { text: (url.searchParams.get("text") ?? "").slice(0, 2000), ids: wf?.terms ?? [] });
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ ...result, workflow: wf?.id ?? null, ontologyTerms: o.terms.length }));
    } else if (/^\/mock\/[a-z0-9-]+\/[a-z0-9-]+$/.test(path)) {
      // Mock BSS for Sim's API blocks: /mock/<workflow>/<system>. Read-only fixtures from seed/mock-bss/<workflow>.json.
      const [, , wfId, system] = path.split("/");
      let fixtures = null;
      try { fixtures = read(`seed/mock-bss/${wfId}.json`); } catch { /* no such workflow */ }
      const body = mockBss(fixtures, system);
      res.writeHead(body ? 200 : 404, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body ?? { error: "unknown mock system" }));
    } else if (path === "/twin" || path === "/twin/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(readFileSync(`${root}twin/ui/index.html`));
    } else if (path === "/twin/api/network/cells" || path.startsWith("/twin/api/network/cells/")) {
      const all = generateCells(), id = decodeURIComponent(path.slice("/twin/api/network/cells".length).replace(/^\//, ""));
      if (!id) json(res, 200, { synthetic: true, cells: all });
      else { const c = all.find((x) => x.id === id.toUpperCase()); json(res, c ? 200 : 404, c ?? { error: `unknown cell ${id}` }); }
    } else if (path === "/twin/api/world") {
      const w = world();
      const shock = billShockPopulation(w).length;
      json(res, 200, { seed: w.seed, subscribers: w.subscribers.length, bills: w.subscribers.length * 12, offers: 30, shock, risky: w.subscribers.filter((s) => s.churn_risk >= 0.5).length });
    } else if (path === "/twin/api/replay") {
      const q = url.searchParams, agent = q.get("agent");
      if (agent !== "bill-shock" && agent !== "retention") return json(res, 400, { error: "agent must be bill-shock or retention" });
      const policy = read("skills/policy-values.json");
      json(res, 200, compare(world(), policy, { agent, gate: q.get("gate") !== "false", proposal_share: num(q.get("proposal_share")), proposal_percent: num(q.get("proposal_percent")), cap_override: q.get("cap_override") || undefined, max_discount_percent: num(q.get("max_discount_percent")) }));
    } else if (path === "/twin/live" || path === "/twin/live/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(readFileSync(`${root}twin/ui/live.html`));
    } else if (path === "/twin/mcp" || /^\/twin\/mcp\/[a-z-]+$/.test(path)) {   // /twin/mcp/<agent>: one URL per agent, so Sim keeps one MCP server per agent token (P0-30)
      if (req.method !== "POST") return json(res, 405, { error: "POST JSON-RPC to this endpoint" });
      let body; try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
      const r = twinMcp().handle(body, req.headers.authorization ?? "");
      if (r.body === null) { res.writeHead(r.status); return res.end(); }
      json(res, r.status, r.body);
    } else if (path === "/twin/api/live/stream") {
      const from = Math.max(0, num(url.searchParams.get("from"), 0)), count = Math.min(num(url.searchParams.get("count"), 1), 50);
      json(res, 200, Array.from({ length: count }, (_, k) => streamEvent(world(), from + k)));
    } else if (path === "/twin/api/live/state") {
      json(res, 200, { ...sandbox.state(), events_after: sandbox.eventsAfter(num(url.searchParams.get("after"), 0)), agents: twinMcp().agents(), mcp: { url: "/twin/mcp", protocol: "JSON-RPC 2.0 over HTTP POST (MCP tools)" } });
    } else if (path === "/twin/api/live/explain") {
      const q = url.searchParams, x = explainLine(world(), policyValues(), q.get("customer") ?? "", q.get("month") ?? "", num(q.get("line"), -1));
      json(res, x.error ? 404 : 200, x);
    } else if (path === "/twin/api/live/demo" && req.method === "POST") {
      // Sandbox demo button: acts as an agent through the same MCP door. The agent's token never leaves the server.
      let b; try { b = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: "body is not JSON" }); }
      if (b.as === "unknown") { const r = twinMcp().handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "grant_credit", arguments: { customer: String(b.customer ?? ""), amount: String(b.amount ?? "") } } }, "Bearer not-a-real-token"); return json(res, 200, { refused: r.status === 401, status: r.status }); }
      const r = twinMcp().asAgent("credit-guard-agent", "grant_credit", { customer: String(b.customer ?? ""), amount: String(b.amount ?? ""), reason: "Demo button (sandbox)" });
      json(res, 200, r.body.result?.structuredContent ?? r.body);
    } else if (path === "/twin/api/live/approve" && req.method === "POST") {
      // A person releases a held credit (the CRM's Approve button). Sandbox only.
      let b; try { b = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: "body is not JSON" }); }
      const r = sandbox.approve(world(), { approval: String(b.approval ?? ""), by: String(b.by ?? "Care Lead").slice(0, 60) });
      json(res, r.ok ? 200 : 409, r);
    } else if (path === "/twin/api/live/reset" && req.method === "POST") {
      const sandboxOnly = url.searchParams.get("scope") === "sandbox";   // P0-29 demo reset: keep the catalogue agents' drafts
      sandbox.reset(); if (!sandboxOnly) catalogue.reset(); json(res, 200, { ok: true, catalogue: sandboxOnly ? "kept" : "reset" });
    } else if (path === "/twin/crm" || path === "/twin/crm/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(readFileSync(`${root}twin/ui/crm.html`));
    } else if (path === "/twin/office" || path === "/twin/office/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(readFileSync(`${root}twin/ui/office.html`));
    } else if (path === "/twin/api/office/dashboard") {
      json(res, 200, dashboard(world()));
    } else if (path === "/twin/api/office/customers") {
      const q = url.searchParams;
      json(res, 200, listCustomers(world(), { q: (q.get("q") ?? "").slice(0, 80), segment: q.get("segment") ?? "", flag: q.get("flag") ?? "", page: num(q.get("page"), 1), size: Math.min(num(q.get("size"), 25), 100) }));
    } else if (/^\/twin\/api\/office\/customer\/NW-\d+(\/usage)?$/.test(path)) {
      const [, , , , , id, usage] = path.split("/");
      const rec = customerRecord(world(), id);
      if (!rec) return json(res, 404, { error: "no such customer" });
      if (usage) {
        const month = url.searchParams.get("month") ?? MONTH_LABELS[11], m = MONTH_LABELS.indexOf(month);
        return m < 0 ? json(res, 400, { error: "month must be one of the last 12, like 2026-09" }) : json(res, 200, cdrs(world(), world().subscribers.findIndex((s) => s.id === id), m));
      }
      json(res, 200, sandbox.mergeRecord(rec));
    } else if (path === "/twin/catalogue" || path === "/twin/catalogue/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(readFileSync(`${root}twin/ui/catalogue.html`));
    } else if (path === "/twin/api/catalogue/view") {
      json(res, 200, catalogue.view());   // P0-31: the Product Catalogue page
    } else if (/^\/twin\/api\/catalogue\/[a-z_]+$/.test(path) && req.method === "POST") {
      // P0-30: the same catalogue tools over plain HTTP (for Sim API blocks or custom tools); same per-agent token and grants as the MCP door.
      let args; try { args = JSON.parse((await readBody(req)) || "{}"); } catch { return json(res, 400, { error: "body must be JSON" }); }
      const r = twinMcp().handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: path.split("/").pop(), arguments: args } }, req.headers.authorization ?? "");
      if (r.body?.error) return json(res, r.status === 200 ? 400 : r.status, { error: r.body.error.message });
      json(res, r.body.result.isError ? 400 : 200, r.body.result.structuredContent?.items ?? r.body.result.structuredContent);
    } else if (path === "/twin/api/catalogue/drafts") {
      json(res, 200, catalogue.drafts());
    } else if (path === "/twin/api/office/catalogue") {
      json(res, 200, CATALOGUE);
    } else if (path === "/twin/api/live/apis") {
      json(res, 200, { apis: deskCatalog(), traffic: traffic.summary(), mcp_tools: twinMcp().tools() });
    } else if (path.startsWith("/twin/tmf/676") || path === "/twin/tmf/openapi/676.json") {
      traffic.record(path, req.headers["x-agent-name"]);
      const r = tmf676(world(), path.slice("/twin/tmf/".length), url.searchParams);
      json(res, r.status, r.body);
    } else if (path.startsWith("/twin/tmf/")) {
      traffic.record(path, req.headers["x-agent-name"]);
      const r = tmfHandle(world(), path.slice("/twin/tmf/".length), url.searchParams);
      json(res, r.status, r.body);
    } else if (path === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    } else {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    }
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(`error: ${e.message}`);
  }
});
server.listen(PORT, "127.0.0.1", () => { twinMcp(); console.log(`ATLAS demo: http://localhost:${PORT}/hive`); });   // twinMcp() creates the agent tokens at start so the bridge can read them
