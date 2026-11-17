// The twin's MCP door: a small hand-written JSON-RPC 2.0 handler over HTTP (no package). Every call needs a per-agent bearer token;
// the agent's name goes on the call log. Unknown tokens are refused and logged. Tools are read-only except grant_credit (sandbox overlay only).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { listCustomers, customerRecord, cdrs } from "./records.mjs";
import { explainLine } from "./live.mjs";
import { MONTH_LABELS } from "./tmf.mjs";
import { creditDecision } from "../../seed/lib/skills.mjs";
import { money, toCents } from "./rating.mjs";

// The catalogue family under Catalogue Team (P0-30) gets its own tokens and sees only catalogue tools; the care agents see only the care tools.
export const CATALOGUE_AGENTS = ["competitor-supervisor", "product-simplifier", "catalog-governor", "product-configurator", "pricing-strategist", "marketing-agent", "retainer-upseller"];
export const AGENTS = ["credit-guard-agent", "bill-shock-agent", "retention-agent", ...CATALOGUE_AGENTS];
export function loadAgentTokens(file) {
  let t = {};
  if (existsSync(file)) { try { t = JSON.parse(readFileSync(file, "utf8")); } catch { t = {}; } }
  let changed = false;
  for (const a of AGENTS) if (!t[a]) { t[a] = `tw_${randomBytes(18).toString("hex")}`; changed = true; }
  if (changed) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(t, null, 2), { mode: 0o600 }); }
  return t;   // { agentName: token }
}

const S = (props, required = []) => ({ type: "object", properties: props, required });
const str = (d) => ({ type: "string", description: d });
export const TOOLS = [
  { name: "find_customer", description: "Find customers by id, name or phone (simulated data).", inputSchema: S({ query: str("NW-###### id, name part or phone") }, ["query"]) },
  { name: "get_bill", description: "Get one bill with its lines. Default is the latest month.", inputSchema: S({ customer: str("NW-######"), month: str("YYYY-MM") }, ["customer"]) },
  { name: "explain_bill_line", description: "Explain why a bill line has its amount: rule, formula, inputs, source.", inputSchema: S({ customer: str("NW-######"), month: str("YYYY-MM"), line: { type: "integer", description: "0-based line number" } }, ["customer", "month", "line"]) },
  { name: "get_usage", description: "Usage detail summary and first records for a month.", inputSchema: S({ customer: str("NW-######"), month: str("YYYY-MM") }, ["customer"]) },
  { name: "propose_credit", description: "Dry run: ask the goodwill-credit gate what it would decide. Writes nothing.", inputSchema: S({ customer: str("NW-######"), amount: str("EUR, like 20.00") }, ["customer", "amount"]) },
  { name: "grant_credit", description: "Request a goodwill credit. The twin's gate decides: grant (credit note and case update), needs-approval (queued), or refuse. Sandbox only.", inputSchema: S({ customer: str("NW-######"), amount: str("EUR, like 20.00"), reason: str("why"), key: str("idempotency key") }, ["customer", "amount"]) },
  { name: "list_events", description: "Events written by agents in the sandbox, after a sequence number.", inputSchema: S({ after: { type: "integer" } }) },
];
const CARE_TOOLS = TOOLS.map((t) => t.name);

const num = (d) => ({ type: "number", description: d });
const offerFields = { name: str("ATLAS_<Tech>_<Payment>_<Size>, like ATLAS_5G_Prepaid_100GB"), description: str("one line"), segment: str("consumer, youth, family or sme"), payment: str("prepaid or postpaid"),
  technology: str("4G or 5G"), price: str("monthly price, like 9.99"), currency: str("EUR"), validity: str("monthly"), data_gb: str("GB as a number, or unlimited"), minutes: str("unlimited or a number"), sms: str("unlimited or a number"),
  activation_fee: str("like 0.00"), addons: { type: "array", items: { type: "string" }, description: "catalogue add-on ids, like ATL-ADD-03" }, roaming_terms: str("required when a roaming add-on is included"), start_date: str("YYYY-MM-DD") };
export const CATALOGUE_TOOLS = [
  { name: "list_offers", description: "List catalogue offers with price, data, status and subscriber count. Filters are optional.", inputSchema: S({ status: str("active, draft, retired or inactive"), segment: str("consumer, youth, family or sme"), payment: str("prepaid or postpaid"), technology: str("4G or 5G") }) },
  { name: "get_offer", description: "One offer by id (ATL-OFF-###) or exact name, with all fields and its add-ons.", inputSchema: S({ offer: str("ATL-OFF-### or name") }, ["offer"]) },
  { name: "list_addons", description: "Catalogue add-ons with price and which segment, technology and payment type they fit.", inputSchema: S({}) },
  { name: "find_similar", description: "Compare a plan idea with active offers. Similar = same segment and payment type, price within 15%, data within 25%, same technology. Returns MATCH (reuse), NEAR (tweak) or GAP (new plan needed).", inputSchema: S({ segment: str("consumer"), payment: str("prepaid or postpaid"), technology: str("4G or 5G"), price: str("like 9.99"), data_gb: str("GB or unlimited") }, ["segment", "payment", "technology", "price", "data_gb"]) },
  { name: "validate_offer", description: "Run the catalogue checks (completeness, consistency, duplication, compliance, compatibility, commercial) on an existing offer or a plan card. Returns PASS, FIX or BLOCK with findings.", inputSchema: S({ offer: str("ATL-OFF-### to check an existing offer"), ...offerFields }) },
  { name: "create_draft_offer", description: "Create a new offer as DRAFT. It waits for human approval and is never published. Refused when the checks BLOCK.", inputSchema: S({ ...offerFields, key: str("idempotency key") }, ["name", "segment", "payment", "technology", "price", "currency", "validity", "data_gb"]) },
  { name: "request_release", description: "Hand a PASS offer to release and versioning control. Returns a REL ticket. A person publishes.", inputSchema: S({ offer: str("ATL-OFF-###") }, ["offer"]) },
  { name: "analyse_portfolio", description: "Every non-draft offer with subscribers and flags: dead, duplicate_of (similarity rule) and worse_value_than. Optional scope.", inputSchema: S({ segment: str("consumer, youth, family or sme"), payment: str("prepaid or postpaid") }) },
  { name: "migration_impact", description: "Subscribers moved, price and allowance delta per move, and the monthly revenue delta for a list of migrations.", inputSchema: S({ moves: { type: "array", items: S({ from: str("ATL-OFF-###"), to: str("ATL-OFF-###") }, ["from", "to"]) } }, ["moves"]) },
  { name: "price_scenarios", description: "LOW (-15%), BASE and HIGH (+15%) price scenarios with subscribers, margin, payback and cannibalisation, and the recommended one. Inputs you do not give come back as assumed.", inputSchema: S({ offer: str("ATL-OFF-### or name, or leave out for a new idea"), price: str("base price for a new idea or a proposed price"), data_gb: str("GB or unlimited"), segment: str("consumer"), payment: str("prepaid or postpaid"), technology: str("4G or 5G"), addons: { type: "array", items: { type: "string" } }, base_subscribers: num("override"), elasticity: num("override, like -1.2"), cost_per_gb: num("EUR per GB used"), fixed_cost: num("EUR per subscriber per month"), acquisition_cost: num("EUR per new subscriber"), data_used_pct: num("share of allowance used") }) },
  { name: "save_market_scan", description: "File a competitor scan so Marketing and Pricing can use it. Prices exactly as published, in local currency, each with source URL and date; anything without both is stored as unverified.", inputSchema: S({ market: str("country or region"), segment: str("like consumer prepaid"), goal: str("one line"), catalogue_check: str("MATCH, NEAR or GAP with the offer"), recommended: str("the recommended option, one line"), competitors: { type: "array", items: S({ operator: str("operator or brand"), country: str("country"), plan: str("plan name"), price: str("as published, like 10.00"), currency: str("like GBP"), data: str("like 100 GB"), technology: str("4G or 5G"), hook: str("key hook"), source: str("URL"), date: str("YYYY-MM-DD seen") }, ["operator", "plan"]) } }, ["market", "competitors"]) },
  { name: "get_market_scan", description: "The latest competitor scan filed by the Competitor Supervisor, optionally for one market or country. Use it for competitor context and price anchors; cite its sources and dates.", inputSchema: S({ market: str("country or region, optional") }) },
  { name: "customer_insights", description: "Churn score, band and drivers for every customer in the base, retention actions, upsell moves with uplift, and revenue at risk and upsell upside (scaled).", inputSchema: S({}) },
  { name: "explain_customer", description: "Score breakdown, current offer and recommended action for one customer (id like C02, or name).", inputSchema: S({ customer: str("C## or name") }, ["customer"]) },
];
const READ = ["list_offers", "get_offer", "list_addons"];
export const ACCESS = {
  "competitor-supervisor": [...READ, "find_similar", "validate_offer", "create_draft_offer", "save_market_scan", "get_market_scan"],
  "product-simplifier": ["list_offers", "get_offer", "analyse_portfolio", "migration_impact"],
  "catalog-governor": [...READ, "find_similar", "validate_offer", "request_release"],
  "product-configurator": [...READ, "find_similar", "validate_offer", "create_draft_offer"],
  "pricing-strategist": [...READ, "find_similar", "price_scenarios", "get_market_scan"],
  "marketing-agent": [...READ, "get_market_scan"],
  "retainer-upseller": [...READ, "customer_insights", "explain_customer"],
};
const allowed = (agent) => ACCESS[agent] ?? CARE_TOOLS;

export function createMcp({ world, policy, sandbox, tokens, catalogue = null }) {
  const byToken = new Map(Object.entries(tokens).map(([a, t]) => [t, a]));
  const rpcErr = (id, code, message, status = 200) => ({ status, body: { jsonrpc: "2.0", id: id ?? null, error: { code, message } } });
  const ok = (id, result) => ({ status: 200, body: { jsonrpc: "2.0", id, result } });
  // MCP structuredContent must be an object, so a list goes out as { items } (strict clients such as Claude Code reject a bare array).
  const text = (obj, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(obj) }], structuredContent: Array.isArray(obj) ? { items: obj } : obj, isError });

  const tools = {
    find_customer: ({ query }) => listCustomers(world, { q: String(query ?? ""), size: 10 }).rows.map((r) => ({ id: r.id, name: r.name, segment: r.segment, plan: r.plan, msisdn: r.msisdn, flags: r.flags })),
    get_bill: ({ customer, month }) => { const rec = customerRecord(world, customer); if (!rec) throw new Error(`no such customer ${customer}`); const b = rec.bills.find((x) => x.period === (month ?? MONTH_LABELS[11])); if (!b) throw new Error(`no bill for ${month}`); return { customer, bill: b.invoice_number, period: b.period, status: b.status, total_cents: b.total_cents, total: money(b.total_cents), lines: b.lines.map((l, i) => ({ line: i, item: l.item, cents: l.cents })) }; },
    explain_bill_line: ({ customer, month, line }) => { const x = explainLine(world, policy, customer, month, Number(line)); if (x.error) throw new Error(x.error); return x; },
    get_usage: ({ customer, month }) => { const i = world.subscribers.findIndex((s) => s.id === customer), m = MONTH_LABELS.indexOf(month ?? MONTH_LABELS[11]); if (i < 0 || m < 0) throw new Error("unknown customer or month"); const c = cdrs(world, i, m); return { month: c.month, summary: c.summary, first_records: c.rows.slice(0, 10) }; },
    propose_credit: ({ customer, amount }) => { const s = world.subscribers.find((x) => x.id === customer); if (!s) throw new Error(`no such customer ${customer}`); const c = toCents(amount); if (!(c > 0)) throw new Error("amount must be positive"); return { dry_run: true, ...creditDecision(policy, { segment: s.segment, tenure_months: s.tenure_months, requested: money(c), credits_last_12m: s.credits_last_12m, identity_verified: s.identity_verified, vulnerable: s.vulnerable }) }; },
    grant_credit: (a, agent) => { const r = sandbox.grantCredit(world, policy, { agent, customer: a.customer, amount: a.amount, reason: a.reason, key: a.key }); if (!r.ok) throw new Error(r.error); return r; },
    list_events: ({ after }) => sandbox.eventsAfter(Number(after) || 0),
    ...(catalogue ? {
      list_offers: (a) => catalogue.listOffers(a), get_offer: (a) => catalogue.getOffer(a), list_addons: () => catalogue.listAddons(), find_similar: (a) => catalogue.findSimilar(a),
      validate_offer: (a) => catalogue.validateOffer(a), create_draft_offer: (a, agent) => catalogue.createDraftOffer(a, agent), request_release: (a, agent) => catalogue.requestRelease(a, agent),
      analyse_portfolio: (a) => catalogue.analysePortfolio(a), migration_impact: (a) => catalogue.migrationImpact(a), price_scenarios: (a) => catalogue.priceScenarios(a),
      save_market_scan: (a, agent) => catalogue.saveMarketScan(a, agent), get_market_scan: (a) => catalogue.getMarketScan(a),
      customer_insights: () => catalogue.customerInsights(), explain_customer: (a) => catalogue.explainCustomer(a),
    } : {}),
  };
  const defs = [...TOOLS, ...CATALOGUE_TOOLS];

  // One span-shaped record per call (OpenTelemetry GenAI field names; status of that convention is "Development").
  const span = (agent, tool, args, ok_, summary, clause) => sandbox.log({ "gen_ai.operation.name": "execute_tool", "gen_ai.agent.name": agent, "gen_ai.tool.name": tool, agent, tool, args: JSON.stringify(args ?? {}).slice(0, 300), ok: ok_, result: summary, clause: clause ?? "", trace_id: randomBytes(8).toString("hex") });

  function handle(body, authHeader = "") {
    if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") return rpcErr(body?.id, -32600, "invalid request", 400);
    const { id, method, params } = body;
    const agent = byToken.get(String(authHeader).replace(/^Bearer\s+/i, "").trim());
    if (method === "initialize") return ok(id, { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "atlas-twin", version: "0.1.0" }, instructions: "Simulated ATLAS Twin (invented data). Send Authorization: Bearer <agent token>." });
    if (method === "notifications/initialized") return { status: 202, body: null };
    if (!agent) { span("unknown", method === "tools/call" ? params?.name ?? "?" : method, params?.arguments, false, "refused: no valid agent token"); return rpcErr(id, -32001, "unknown or missing agent token", 401); }
    if (method === "ping") return ok(id, {});
    if (method === "tools/list") return ok(id, { tools: defs.filter((t) => allowed(agent).includes(t.name) && tools[t.name]) });
    if (method === "tools/call") {
      const fn = tools[params?.name];
      if (fn && !allowed(agent).includes(params.name)) { span(agent, params.name, params.arguments, false, "refused: tool not granted to this agent"); return ok(id, text({ error: `${params.name} is not granted to ${agent}` }, true)); }
      if (!fn) { span(agent, String(params?.name), params?.arguments, false, "unknown tool"); return rpcErr(id, -32602, `unknown tool ${params?.name}`); }
      try {
        const r = fn(params.arguments ?? {}, agent);
        span(agent, params.name, params.arguments, true, r?.decision ? `${r.decision}${r.amount_cents ? ` EUR ${money(r.amount_cents)}` : ""}` : r?.verdict ? r.verdict : r?.created ? `draft ${r.id}` : r?.ticket ?? "ok", r?.clause);
        return ok(id, text(r));
      } catch (e) { span(agent, params.name, params.arguments, false, e.message); return ok(id, text({ error: e.message }, true)); }
    }
    return rpcErr(id, -32601, `method not found: ${method}`);
  }
  return { handle, tools: () => defs.filter((t) => tools[t.name]).map((t) => ({ name: t.name, description: t.description })), agents: () => Object.keys(tokens), asAgent: (agent, tool, args) => handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }, `Bearer ${tokens[agent]}`) };
}
