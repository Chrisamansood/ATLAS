// The ATLAS Twin catalogue workspace (P0-30): ATLAS_ offers and add-ons for the catalogue family of agents under Catalogue Team.
// Invented offers with planted problems (duplicates, dead offers, a value outlier, faulty drafts) so each agent has something real to find.
// Every number an agent shows comes from here: similarity, checks, price scenarios, churn scores. No model computes money.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { money } from "./rating.mjs";

export const CURRENCY = "EUR";
const U = "unlimited";
// [id, name, segment, payment, tech, price_cents, data_gb (null = unlimited), status, start, end, subscribers, extra]
const O = (id, name, segment, payment, technology, price_cents, data_gb, status, start_date, end_date, subscribers, extra = {}) => ({
  id, name, description: extra.description ?? describe(name, data_gb, technology, payment), segment, payment, technology, price_cents, currency: CURRENCY,
  validity: "monthly", data_gb, minutes: U, sms: U, activation_fee_cents: 0, addons: [], roaming_terms: null, status, start_date, end_date, subscribers, ...extra
});
const describe = (name, gb, tech, pay) => `${gb === null ? "Unlimited" : `${gb} GB`} ${tech} ${pay} plan with unlimited minutes and SMS, renews monthly.`;

export const ADDONS = [
  ["ATL-ADD-01", "ATLAS_Addon_Extra_10GB", 300, "any", "any", "any"], ["ATL-ADD-02", "ATLAS_Addon_Extra_50GB", 800, "any", "any", "any"],
  ["ATL-ADD-03", "ATLAS_Addon_Roam_World_5GB", 500, "any", "any", "any"], ["ATL-ADD-04", "ATLAS_Addon_Roam_Europe_Unlimited", 400, "any", "any", "postpaid"],
  ["ATL-ADD-05", "ATLAS_Addon_Video_Streaming", 590, "consumer", "any", "any"], ["ATL-ADD-06", "ATLAS_Addon_Music_Streaming", 399, "consumer", "any", "any"],
  ["ATL-ADD-07", "ATLAS_Addon_5G_Gaming_Boost", 299, "consumer", "5G", "any"], ["ATL-ADD-08", "ATLAS_Addon_Loyalty_Data_10GB", 0, "any", "any", "any"],
  ["ATL-ADD-09", "ATLAS_Addon_Cloud_200GB", 290, "any", "any", "any"], ["ATL-ADD-10", "ATLAS_Addon_Scam_Shield", 190, "consumer", "any", "any"]
].map(([id, name, price_cents, segment, technology, payment]) => ({ id, name, price_cents, currency: CURRENCY, segment, technology, payment, status: "active", roaming: name.includes("Roam") }));

const ROAM_TERMS = "Roaming in the listed zone at home prices, fair use 30 GB per month.";
export const SEED_OFFERS = [
  // consumer prepaid, the customer base's S / M / L tiers and the unlimited top
  O("ATL-OFF-001", "ATLAS_4G_Prepaid_10GB", "consumer", "prepaid", "4G", 799, 10, "active", "2025-06-01", null, 92000),
  O("ATL-OFF-002", "ATLAS_5G_Prepaid_50GB", "consumer", "prepaid", "5G", 999, 50, "active", "2026-03-01", null, 148000),
  O("ATL-OFF-003", "ATLAS_5G_Prepaid_150GB", "consumer", "prepaid", "5G", 1299, 150, "active", "2026-02-01", null, 71000),
  O("ATL-OFF-004", "ATLAS_5G_Prepaid_Unlimited", "consumer", "prepaid", "5G", 1999, null, "active", "2026-04-01", null, 26000),
  // planted duplicates of the 50 GB hero and a value outlier next to it
  O("ATL-OFF-005", "ATLAS_5G_Prepaid_55GB_Promo", "consumer", "prepaid", "5G", 1049, 55, "active", "2025-11-01", null, 18000),
  O("ATL-OFF-006", "ATLAS_5G_Prepaid_45GB_Web", "consumer", "prepaid", "5G", 949, 45, "active", "2025-09-15", null, 12500),
  O("ATL-OFF-007", "ATLAS_5G_Prepaid_40GB_Plus", "consumer", "prepaid", "5G", 1149, 40, "active", "2025-05-01", null, 6400),
  // 4G prepaid small: a duplicate, an outlier, two dead offers
  O("ATL-OFF-008", "ATLAS_4G_Prepaid_12GB_Online", "consumer", "prepaid", "4G", 849, 12, "active", "2025-08-01", null, 21000),
  O("ATL-OFF-009", "ATLAS_4G_Prepaid_8GB_Classic", "consumer", "prepaid", "4G", 899, 8, "active", "2024-02-01", null, 9800),
  O("ATL-OFF-010", "ATLAS_4G_Prepaid_5GB_Legacy", "consumer", "prepaid", "4G", 599, 5, "active", "2023-01-01", "2025-12-31", 3100),
  O("ATL-OFF-011", "ATLAS_4G_Prepaid_Summer_2025", "consumer", "prepaid", "4G", 699, 20, "retired", "2025-06-01", "2025-09-30", 0),
  // consumer postpaid
  O("ATL-OFF-012", "ATLAS_5G_Postpaid_80GB", "consumer", "postpaid", "5G", 1199, 80, "active", "2026-01-15", null, 64000),
  O("ATL-OFF-013", "ATLAS_5G_Postpaid_150GB", "consumer", "postpaid", "5G", 1499, 150, "active", "2026-01-15", null, 52000),
  O("ATL-OFF-014", "ATLAS_5G_Postpaid_Unlimited", "consumer", "postpaid", "5G", 1999, null, "active", "2026-01-15", null, 31000),
  O("ATL-OFF-015", "ATLAS_5G_Postpaid_75GB_Loyalty", "consumer", "postpaid", "5G", 1149, 75, "active", "2025-04-01", null, 8700),
  O("ATL-OFF-016", "ATLAS_5G_Postpaid_100GB_Roam_World", "consumer", "postpaid", "5G", 1899, 100, "active", "2026-02-01", null, 7400, { addons: ["ATL-ADD-03"], roaming_terms: ROAM_TERMS }),
  O("ATL-OFF-017", "ATLAS_4G_Postpaid_20GB_Legacy", "consumer", "postpaid", "4G", 1299, 20, "active", "2022-03-01", null, 4200),
  O("ATL-OFF-018", "ATLAS_4G_Postpaid_30GB", "consumer", "postpaid", "4G", 1299, 30, "active", "2024-09-01", null, 15800),
  // family, youth, data-only
  O("ATL-OFF-019", "ATLAS_5G_Family_Share_200GB", "family", "postpaid", "5G", 3999, 200, "active", "2026-01-01", null, 22000),
  O("ATL-OFF-020", "ATLAS_5G_Family_Share_220GB_Promo", "family", "postpaid", "5G", 4199, 220, "active", "2025-10-01", null, 3900),
  O("ATL-OFF-021", "ATLAS_4G_Family_Share_100GB_Legacy", "family", "postpaid", "4G", 3499, 100, "inactive", "2022-01-01", "2026-06-30", 0),
  O("ATL-OFF-022", "ATLAS_5G_Youth_Prepaid_60GB", "youth", "prepaid", "5G", 899, 60, "active", "2026-05-01", null, 17500),
  O("ATL-OFF-023", "ATLAS_5G_Data_Only_200GB", "consumer", "postpaid", "5G", 1999, 200, "active", "2025-12-01", null, 5600, { minutes: "0", sms: "0", description: "200 GB 5G data-only plan for tablets and routers, renews monthly." }),
  // SME (the Configurator handles B2C only; the Simplifier and Governor see everything)
  O("ATL-OFF-024", "ATLAS_SME_5G_Postpaid_100GB", "sme", "postpaid", "5G", 2299, 100, "active", "2026-01-01", null, 9100),
  O("ATL-OFF-025", "ATLAS_SME_5G_Postpaid_Unlimited", "sme", "postpaid", "5G", 3499, null, "active", "2026-01-01", null, 4300),
  // drafts waiting for the Catalog Governor: one PASS, three with findings
  O("ATL-OFF-026", "ATLAS_5G_Prepaid_70GB_Gaming", "consumer", "prepaid", "5G", 1149, 70, "draft", "2026-11-15", null, 0, { addons: ["ATL-ADD-07"], description: "70 GB 5G prepaid plan with the 5G Gaming Boost, unlimited minutes and SMS, renews monthly." }),
  O("ATL-OFF-027", "ATLAS_4G_Prepaid_15GB", "consumer", "prepaid", "4G", 649, 15, "draft", "2026-11-15", null, 0, { currency: null }),
  O("ATL-OFF-028", "ATLAS_5G_Prepaid_30GB_28Day", "consumer", "prepaid", "5G", 799, 30, "draft", "2026-11-15", null, 0, { validity: "28-day", description: "30 GB 5G prepaid plan, renews every 28 days." }),
  O("ATL-OFF-029", "Spring Deal 5G", "consumer", "postpaid", "5G", 1449, 140, "draft", null, null, 0, { description: "" })
];

// ---- similarity (shared convention: same segment and payment type, price within 15%, data within 25%, same technology)
const within = (a, b, pct) => Math.abs(a - b) <= (b * pct) / 100;
const dataWithin = (a, b, pct) => (a === null || b === null ? a === b : within(a, b, pct));
export function isSimilar(x, y) {
  return x.id !== y.id && x.segment === y.segment && x.payment === y.payment && x.technology === y.technology && within(x.price_cents, y.price_cents, 15) && dataWithin(x.data_gb, y.data_gb, 25);
}
// y gives at least as much for no more money, and is better on one of them
const dominates = (y, x) => y.id !== x.id && y.segment === x.segment && y.payment === x.payment && y.technology === x.technology &&
  y.price_cents <= x.price_cents && (y.data_gb === null || (x.data_gb !== null && y.data_gb >= x.data_gb)) && (y.price_cents < x.price_cents || y.data_gb !== x.data_gb);

const pub = (o) => ({ ...o, price: o.price_cents === null ? null : money(o.price_cents), activation_fee: money(o.activation_fee_cents ?? 0), data: o.data_gb === null ? U : `${o.data_gb} GB` });
const isActive = (o, today) => o.status === "active" && !(o.end_date && o.end_date < today);

export function createCatalogue({ file = null, today = () => new Date().toISOString().slice(0, 10) } = {}) {
  let created = [], releases = [], scans = [], seq = 0;
  if (file && existsSync(file)) { try { ({ created = [], releases = [], scans = [], seq = 0 } = JSON.parse(readFileSync(file, "utf8"))); } catch { /* start clean */ } }
  const save = () => { if (!file) return; mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ created, releases, scans, seq })); };
  const all = () => [...SEED_OFFERS, ...created];
  const active = () => all().filter((o) => isActive(o, today()));
  const find = (ref) => { const k = String(ref ?? "").trim().toLowerCase(); return all().find((o) => o.id.toLowerCase() === k || o.name.toLowerCase() === k) ?? null; };
  const need = (ref) => { const o = find(ref); if (!o) throw new Error(`no offer ${ref}`); return o; };

  function listOffers({ status, segment, payment, technology } = {}) {
    return all().filter((o) => (!status || o.status === status) && (!segment || o.segment === segment) && (!payment || o.payment === payment) && (!technology || o.technology === technology))
      .map((o) => { const p = pub(o); return { id: p.id, name: p.name, segment: p.segment, payment: p.payment, technology: p.technology, price: p.price, currency: p.currency, validity: p.validity, data: p.data, status: p.status, end_date: p.end_date, subscribers: p.subscribers }; });
  }
  const getOffer = ({ offer }) => { const o = need(offer); return { ...pub(o), addons: o.addons.map((id) => ADDONS.find((a) => a.id === id)).filter(Boolean).map((a) => ({ id: a.id, name: a.name, price: money(a.price_cents) })) }; };
  const listAddons = () => ADDONS.map((a) => ({ id: a.id, name: a.name, price: money(a.price_cents), currency: a.currency, segment: a.segment, technology: a.technology, payment: a.payment }));

  // MATCH = reuse (price within 5%, data within 10%); NEAR = tweak (the similarity rule); GAP = a new plan is needed.
  function findSimilar(spec) {
    const x = normalise(spec);
    const hits = active().filter((y) => isSimilar(x, y)).map((y) => ({ y, match: within(x.price_cents, y.price_cents, 5) && dataWithin(x.data_gb, y.data_gb, 10) }));
    const label = hits.some((h) => h.match) ? "MATCH" : hits.length ? "NEAR" : "GAP";
    return { label, rule: "same segment and payment type, price within 15%, data within 25%, same technology", similar: hits.map(({ y, match }) => ({ id: y.id, name: y.name, price: money(y.price_cents), data: pub(y).data, label: match ? "MATCH" : "NEAR" })) };
  }

  function validateOffer(spec) {
    const x = spec.offer ? need(spec.offer) : normalise(spec), f = [];
    const add = (severity, check, field, issue, fix) => f.push({ severity, check, field, issue, fix });
    for (const k of ["name", "description", "segment", "payment", "technology", "start_date"]) if (!x[k]) add(k === "description" || k === "start_date" ? "FIX" : "BLOCK", "completeness", k, `${k} is missing`, `set ${k}`);
    if (!(x.price_cents > 0)) add("BLOCK", "completeness", "price", "price is missing or zero", "set a price above 0");
    if (!x.currency) add("BLOCK", "completeness", "currency", "currency is missing", `set currency ${CURRENCY}`);
    if (!x.validity) add("BLOCK", "completeness", "validity", "renewal period is missing", "set validity, for example monthly");
    if (x.data_gb === undefined || x.minutes === undefined || x.sms === undefined) add("BLOCK", "completeness", "allowances", "allowances are missing", "set data, minutes and SMS");
    if (x.name && !/^ATLAS_[A-Za-z0-9]+(_[A-Za-z0-9]+)+$/.test(x.name)) add("FIX", "consistency", "name", `name "${x.name}" does not follow the ATLAS_<Tech>_<Payment>_<Size> pattern`, "rename to the catalogue pattern");
    if (x.start_date && x.end_date && x.end_date <= x.start_date) add("FIX", "consistency", "end_date", "end date is not after the start date", "correct the dates");
    if (x.status === "draft" && x.end_date && x.end_date < today()) add("FIX", "consistency", "end_date", "draft has an end date in the past", "remove or move the end date");
    const dup = active().find((y) => isSimilar(x, y));
    if (dup) add("BLOCK", "duplication", "price/data", `duplicates active offer ${dup.name} (${dup.id})`, `reuse ${dup.name} or change price or data`);
    if (x.validity && x.validity !== "monthly") add("FIX", "compliance", "validity", `renewal every ${x.validity.replace("-day", " days")}: not allowed in markets that require monthly billing`, "use monthly renewal or confirm the target market allows it");
    if (x.activation_fee_cents === null || x.activation_fee_cents === undefined) add("FIX", "compliance", "activation_fee", "activation fee is not stated", "state the activation fee, even if 0");
    const roams = (x.addons ?? []).some((id) => ADDONS.find((a) => a.id === id)?.roaming);
    if (roams && !x.roaming_terms) add("BLOCK", "compliance", "roaming_terms", "roaming is included but roaming terms are not stated", "add the roaming terms and fair-use limit");
    for (const id of x.addons ?? []) { const a = ADDONS.find((z) => z.id === id); if (!a) add("BLOCK", "compatibility", "addons", `add-on ${id} is not in the catalogue`, "use a catalogue add-on"); else if (!compatible(a, x)) add("BLOCK", "compatibility", "addons", `${a.name} does not fit a ${x.technology} ${x.payment} ${x.segment} plan`, `remove ${a.name}`); }
    const better = active().find((y) => dominates(y, x));
    if (!dup && better) add("FIX", "commercial", "price", `worse value than ${better.name}: ${money(better.price_cents)} for ${pub(better).data}`, "lower the price or add data");
    const rank = { BLOCK: 2, FIX: 1 }, verdict = f.reduce((v, z) => (rank[z.severity] > (rank[v] ?? 0) ? z.severity : v), "PASS");
    return { offer: x.id ?? null, name: x.name, verdict, findings: f.sort((a, b) => rank[b.severity] - rank[a.severity]) };
  }

  function createDraftOffer(spec, agent = "unknown") {
    const x = normalise(spec), v = validateOffer(x);
    if (v.verdict === "BLOCK") return { created: false, verdict: "BLOCK", findings: v.findings, note: "Not created. Fix the BLOCK findings first." };
    if (spec.key) { const prev = created.find((o) => o.key === spec.key); if (prev) return { created: true, duplicate: true, id: prev.id, name: prev.name, status: "draft", approval: "pending" }; }
    const id = `ATL-OFF-${String(SEED_OFFERS.length + created.length + 1).padStart(3, "0")}`;
    const o = { ...x, id, status: "draft", subscribers: 0, created_by: agent, created_at: new Date().toISOString(), approval: "pending", key: spec.key ?? null };
    created.push(o); save();
    return { created: true, id, name: o.name, status: "draft", approval: "pending", verdict: v.verdict, findings: v.findings, note: "Saved as DRAFT, awaiting approval. Ready for Catalog Governor review." };
  }

  function requestRelease({ offer }, agent = "unknown") {
    const v = validateOffer({ offer });
    if (v.verdict !== "PASS") return { released: false, verdict: v.verdict, note: "Only PASS offers can be handed to release." };
    const prev = releases.find((r) => r.offer === v.offer); if (prev) return { released: true, duplicate: true, ...prev };
    const r = { ticket: `REL-${today().replaceAll("-", "")}-${String(++seq).padStart(3, "0")}`, offer: v.offer, name: v.name, by: agent, state: "handed to release and versioning control", publish: "a person publishes" };
    releases.push(r); save(); return { released: true, ...r };
  }

  // Market scans (P0-30): the Competitor Supervisor files what it found on the web; Marketing and Pricing read it, so only one agent searches.
  // Competitor prices are facts from a source, kept as written, in their own currency. A price without a source and date is stored as unverified.
  function saveMarketScan(a = {}, agent = "unknown") {
    const competitors = (Array.isArray(a.competitors) ? a.competitors : []).slice(0, 12).map((c) => {
      const verified = Boolean(c.source && c.date && c.price && !/unverified/i.test(String(c.price)));
      return { operator: String(c.operator ?? ""), country: String(c.country ?? ""), plan: String(c.plan ?? ""), price: verified ? String(c.price) : "unverified", currency: String(c.currency ?? ""), data: String(c.data ?? ""), technology: String(c.technology ?? ""), hook: String(c.hook ?? ""), source: String(c.source ?? ""), date: String(c.date ?? ""), verified };
    }).filter((c) => c.operator && c.plan);
    if (!a.market || !competitors.length) throw new Error("give a market and at least one competitor with operator and plan");
    const s = { id: `MS-${String(scans.length + 1).padStart(3, "0")}`, market: String(a.market), segment: String(a.segment ?? ""), goal: String(a.goal ?? ""), competitors, catalogue_check: String(a.catalogue_check ?? ""), recommended: String(a.recommended ?? ""), by: agent, saved_at: new Date().toISOString() };
    scans.push(s); save();
    return { saved: true, id: s.id, competitors: competitors.length, unverified: competitors.filter((c) => !c.verified).length };
  }
  function getMarketScan({ market } = {}) {
    const k = String(market ?? "").trim().toLowerCase();
    const hit = [...scans].reverse().find((s) => !k || s.market.toLowerCase().includes(k) || s.competitors.some((c) => c.country.toLowerCase().includes(k)));
    return hit ?? { found: false, note: "No market scan yet. Ask the Competitor Supervisor for one." };
  }

  // P0-31: everything the Product Catalogue page shows, in one read. Each offer carries the Governor's verdict, so the page and the agent agree.
  function view() {
    const t = today(), rel = new Map(releases.map((r) => [r.offer, r.ticket]));
    const offers = all().map((o) => {
      const v = validateOffer({ offer: o.id }), p = pub(o);
      return { ...p, addons: o.addons.map((id) => ADDONS.find((a) => a.id === id)).filter(Boolean).map((a) => ({ id: a.id, name: a.name, price: money(a.price_cents) })),
        lifecycle: o.status === "draft" ? "draft" : isActive(o, t) ? "active" : "retired", verdict: v.verdict, findings: v.findings, release_ticket: rel.get(o.id) ?? null, agent_created: Boolean(o.created_by) };
    });
    return { as_of: t, currency: CURRENCY, offers, addons: listAddons(), releases: [...releases], scans: [...scans],
      summary: { active: offers.filter((o) => o.lifecycle === "active").length, drafts: offers.filter((o) => o.lifecycle === "draft").length, retired: offers.filter((o) => o.lifecycle === "retired").length,
        addons: ADDONS.length, subscribers: offers.reduce((s, o) => s + (o.subscribers ?? 0), 0), mrr_cents: offers.filter((o) => o.lifecycle === "active").reduce((s, o) => s + o.price_cents * o.subscribers, 0) } };
  }

  // Product Simplifier: flags per offer; the agent picks heroes and asks migrationImpact for the numbers.
  function analysePortfolio({ segment, payment } = {}) {
    const t = today(), scope = all().filter((o) => o.status !== "draft" && (!segment || o.segment === segment) && (!payment || o.payment === payment));
    const live = scope.filter((o) => isActive(o, t));
    return { scanned: scope.length, offers: scope.map((o) => {
      const dead = !isActive(o, t) || o.subscribers === 0;
      return { id: o.id, name: o.name, segment: o.segment, payment: o.payment, technology: o.technology, price: money(o.price_cents), data: pub(o).data, start_date: o.start_date, end_date: o.end_date, status: o.status, subscribers: o.subscribers,
        dead, duplicate_of: dead ? [] : live.filter((y) => isSimilar(o, y)).map((y) => y.id), worse_value_than: dead ? [] : live.filter((y) => dominates(y, o)).map((y) => y.id) };
    }) };
  }
  function migrationImpact({ moves = [] } = {}) {
    let subs = 0, delta = 0; const rows = [];
    for (const m of moves) {
      const a = need(m.from), b = need(m.to), d = b.price_cents - a.price_cents, crossSegment = a.segment !== b.segment || a.payment !== b.payment;
      const allowance = a.data_gb === null || b.data_gb === null ? (a.data_gb === b.data_gb ? "same" : b.data_gb === null ? "more" : "less") : b.data_gb === a.data_gb ? "same" : b.data_gb > a.data_gb ? `+${b.data_gb - a.data_gb} GB` : `-${a.data_gb - b.data_gb} GB`;
      subs += a.subscribers; delta += d * a.subscribers;
      rows.push({ from: a.name, to: b.name, subscribers: a.subscribers, price_delta: money(d), allowance_delta: allowance, price_up: d > 0, cross_segment: crossSegment });
    }
    return { moves: rows, subscribers_migrated: subs, monthly_revenue_delta: money(delta), currency: CURRENCY, notice: "Tariff changes need advance customer notice and a right to withdraw (30 days in many markets)." };
  }

  // Pricing and Monetisation Strategist: the spec's formulas, run here. Inputs the caller does not give are defaults and come back in `assumed`.
  function priceScenarios(a = {}) {
    const o = a.offer ? need(a.offer) : null, assumed = [];
    const pick = (k, def, label) => { if (a[k] !== undefined && a[k] !== null && a[k] !== "") return Number(a[k]); assumed.push(label); return def; };
    const base_price_cents = a.price !== undefined ? Math.round(Number(a.price) * 100) : o?.price_cents;
    if (!(base_price_cents > 0)) throw new Error("give an offer or a price");
    const data_gb = a.data_gb !== undefined ? (a.data_gb === null || /^unlimited$/i.test(String(a.data_gb)) ? null : Number(String(a.data_gb).replace(/\s*GB$/i, ""))) : o ? o.data_gb : null;
    const subsBase = a.base_subscribers !== undefined ? Number(a.base_subscribers) : o?.subscribers > 0 ? o.subscribers : (assumed.push("base subscribers 100,000"), 100000);
    const elasticity = pick("elasticity", -1.2, "price elasticity -1.2");
    const costPerGb = pick("cost_per_gb", 0.25, "network cost EUR 0.25 per GB used");
    const fixed = pick("fixed_cost", 2.0, "fixed cost EUR 2.00 per subscriber per month");
    const cac = pick("acquisition_cost", 15, "acquisition cost EUR 15 per new subscriber");
    const usedPct = pick("data_used_pct", 40, "data used 40% of allowance, cap 50 GB");
    const addonPrice = (a.addons ?? o?.addons ?? []).reduce((s, id) => s + (ADDONS.find((z) => z.id === id)?.price_cents ?? 0), 0) / 100;
    if (addonPrice > 0) assumed.push("add-on cost 50% of add-on price");
    const gbUsed = Math.min(((data_gb ?? 50) * usedPct) / 100, 50);
    const costPerSub = fixed + gbUsed * costPerGb + addonPrice * 0.5;
    const seg = o?.segment ?? a.segment ?? "consumer", pay = o?.payment ?? a.payment ?? "prepaid", tech = o?.technology ?? a.technology ?? "5G";
    const scenario = (label, pct) => {
      const price = Math.round(base_price_cents * (1 + pct / 100)) / 100;
      const subs = Math.round((subsBase * (1 + (elasticity * pct) / 100)) / 100) * 100;
      const margin = price - costPerSub, marginPct = margin / price;
      const probe = { id: o?.id ?? "new", segment: seg, payment: pay, technology: tech, price_cents: Math.round(price * 100), data_gb };
      const cann = active().filter((y) => y.id !== probe.id && isSimilar(probe, y));
      const cannRevenue = cann.reduce((s, y) => s + Math.round(y.subscribers * 0.2) * (price - y.price_cents / 100), 0);
      return { label, price: price.toFixed(2), subscribers: subs, margin_per_sub: margin.toFixed(2), margin_pct: Math.round(marginPct * 1000) / 10, monthly_revenue: (subs * price).toFixed(2), monthly_margin: (subs * margin).toFixed(2),
        payback_months: margin > 0 ? Math.round((cac / margin) * 10) / 10 : null, cannibalisation: cann.map((y) => ({ offer: y.name, subscribers_moving: Math.round(y.subscribers * 0.2) })), cannibalisation_revenue_effect: cannRevenue.toFixed(2) };
    };
    const rows = [scenario("LOW", -15), scenario("BASE", 0), scenario("HIGH", 15)];
    const ok = rows.filter((r) => r.margin_pct >= 30 && r.payback_months !== null && r.payback_months <= 6).sort((x, y) => Number(y.monthly_margin) - Number(x.monthly_margin));
    return { offer: o?.name ?? a.name ?? "new plan idea", allowance: data_gb === null ? U : `${data_gb} GB`, current: o ? money(o.price_cents) : "new", currency: CURRENCY, scenarios: rows,
      recommended: ok[0]?.label ?? null, rule: "best monthly margin with margin >= 30% and payback <= 6 months", lever: ok.length ? null : "no scenario qualifies: lower cost per subscriber, trim the allowance or drop the add-on",
      working: { gb_used: gbUsed, cost_per_sub: costPerSub.toFixed(2), elasticity, base_subscribers: subsBase }, assumed };
  }

  return { listOffers, getOffer, listAddons, findSimilar, validateOffer, createDraftOffer, requestRelease, analysePortfolio, migrationImpact, priceScenarios, saveMarketScan, getMarketScan,
    customerInsights, explainCustomer, drafts: () => created.map(pub), scans: () => scans, view, reset() { created = []; releases = []; scans = []; seq = 0; save(); } };
}

const compatible = (a, x) => (a.technology === "any" || a.technology === x.technology) && (a.payment === "any" || a.payment === x.payment) && (a.segment === "any" || a.segment === x.segment || (a.segment === "consumer" && x.segment === "youth"));

function normalise(s) {
  const gb = s.data_gb === undefined ? s.data : s.data_gb, cents = s.price_cents ?? (s.price !== undefined && s.price !== null && s.price !== "" ? Math.round(Number(s.price) * 100) : null);
  return { id: s.id, name: s.name ?? null, description: s.description ?? null, segment: s.segment ?? null, payment: s.payment ?? null, technology: s.technology ?? null, price_cents: cents,
    currency: s.currency === undefined ? null : s.currency, validity: s.validity ?? null, data_gb: gb === undefined ? undefined : gb === null || /^unlimited$/i.test(String(gb)) ? null : Number(String(gb).replace(/\s*GB$/i, "")),
    minutes: s.minutes ?? undefined, sms: s.sms ?? undefined, activation_fee_cents: s.activation_fee_cents ?? (s.activation_fee !== undefined ? Math.round(Number(s.activation_fee) * 100) : undefined), addons: s.addons ?? [], roaming_terms: s.roaming_terms ?? null,
    status: s.status ?? "draft", start_date: s.start_date ?? null, end_date: s.end_date ?? null };
}

// ---- Retainer and Upseller: the customer base cohort. Each row stands for 5,000 similar subscribers. Invented names.
export const SCALE = 5000;
//  id, name, tenure_mo, offer, used_pct, topups_3m, care_30d, net_complaint, days_since_recharge, migration_code, roaming
export const CUSTOMERS = [
  ["C01", "Amara Okafor", 8, "ATL-OFF-001", 98, 3, 0, 0, 5, 0, 0], ["C02", "Lucas Meyer", 3, "ATL-OFF-002", 22, 0, 3, 1, 28, 1, 0],
  ["C03", "Priya Nair", 26, "ATL-OFF-013", 35, 0, 1, 0, 0, 0, 1], ["C04", "Daniel Kim", 14, "ATL-OFF-002", 95, 2, 0, 0, 10, 0, 0],
  ["C05", "Sofia Alvarez", 5, "ATL-OFF-001", 40, 0, 2, 1, 30, 0, 0], ["C06", "Ethan Brooks", 40, "ATL-OFF-012", 60, 0, 0, 0, 0, 0, 1],
  ["C07", "Mei Tanaka", 2, "ATL-OFF-003", 18, 0, 1, 0, 26, 0, 0], ["C08", "Omar Haddad", 18, "ATL-OFF-002", 92, 3, 0, 0, 7, 0, 0],
  ["C09", "Hannah Schmidt", 9, "ATL-OFF-013", 25, 0, 2, 1, 0, 1, 0], ["C10", "Rafael Costa", 30, "ATL-OFF-001", 70, 1, 0, 0, 12, 0, 0],
  ["C11", "Aisha Rahman", 12, "ATL-OFF-002", 55, 0, 1, 1, 20, 0, 0], ["C12", "Noah Williams", 4, "ATL-OFF-001", 100, 4, 1, 0, 3, 0, 0],
  ["C13", "Elena Petrova", 22, "ATL-OFF-012", 28, 0, 3, 0, 0, 0, 0], ["C14", "Kwame Mensah", 7, "ATL-OFF-002", 45, 0, 0, 1, 27, 1, 0],
  ["C15", "Chloe Martin", 36, "ATL-OFF-013", 88, 0, 0, 0, 0, 0, 1], ["C16", "Arjun Mehta", 11, "ATL-OFF-001", 91, 2, 0, 0, 9, 0, 0],
  ["C17", "Lena Novak", 1, "ATL-OFF-002", 12, 0, 2, 1, 29, 0, 0], ["C18", "Mateo Silva", 28, "ATL-OFF-002", 65, 0, 0, 0, 14, 0, 0],
  ["C19", "Grace Lee", 16, "ATL-OFF-012", 33, 0, 2, 1, 0, 0, 0], ["C20", "Yusuf Demir", 6, "ATL-OFF-003", 96, 1, 0, 0, 6, 0, 0]
].map(([id, name, tenure_mo, offer, used_pct, topups_3m, care_30d, net_complaint, days_since_recharge, migration_code, roaming]) =>
  ({ id, name, tenure_mo, offer, used_pct, topups_3m, care_30d, net_complaint: Boolean(net_complaint), days_since_recharge, migration_code: Boolean(migration_code), roaming: Boolean(roaming) }));

const offerOf = (c) => SEED_OFFERS.find((o) => o.id === c.offer);
export function churnScore(c) {
  const o = offerOf(c), d = [];
  if (c.migration_code) d.push(["migration code requested", 40]);
  if (c.care_30d >= 2) d.push([`${c.care_30d} care calls in 30 days`, 20]);
  if (c.net_complaint) d.push(["network complaint", 20]);
  if (c.used_pct < 30) d.push([`low data use (${c.used_pct}%)`, 15]);
  if (o.payment === "prepaid" && c.days_since_recharge > 25) d.push([`${c.days_since_recharge} days since recharge`, 15]);
  if (c.tenure_mo < 6) d.push([`new customer (${c.tenure_mo} months)`, 10]);
  const score = d.reduce((s, [, p]) => s + p, 0);
  return { score, band: score >= 60 ? "HIGH" : score >= 35 ? "MEDIUM" : "LOW", drivers: d.sort((a, b) => b[1] - a[1]).map(([t, p]) => ({ driver: t, points: p })) };
}
// tiers within one segment and payment type, smallest data first (unlimited last)
const ladder = (o) => SEED_OFFERS.filter((y) => y.status === "active" && !y.end_date && y.segment === o.segment && y.payment === o.payment && y.subscribers >= 25000)
  .sort((a, b) => (a.data_gb ?? 1e9) - (b.data_gb ?? 1e9));
function actionFor(c, s) {
  const o = offerOf(c), l = ladder(o), i = l.findIndex((y) => y.id === o.id), loyalty = ADDONS.find((a) => a.id === "ATL-ADD-08");
  if (s.band === "HIGH") {
    if (c.used_pct < 30 && i > 0) { const down = l[i - 1]; return { kind: "retain: right-size", target: down.name, monthly_change: money(down.price_cents - o.price_cents) }; }
    return { kind: "retain: loyalty add-on", target: `${loyalty.name} (6 months free)`, monthly_change: money(0) };
  }
  if (s.band === "MEDIUM") return { kind: "proactive care contact plus small add-on", target: loyalty.name, monthly_change: money(0) };
  return null;
}
function upsellFor(c, s) {
  if (s.band === "HIGH") return [];
  const o = offerOf(c), l = ladder(o), i = l.findIndex((y) => y.id === o.id), out = [];
  if (c.used_pct >= 90 || c.topups_3m >= 2) {
    const up = i >= 0 && i < l.length - 1 ? l[i + 1] : null, extra = ADDONS.find((a) => a.id === "ATL-ADD-02");
    out.push(up ? { signal: c.used_pct >= 90 ? `data use ${c.used_pct}%` : `${c.topups_3m} top-ups in 3 months`, target: up.name, uplift: money(up.price_cents - o.price_cents) }
      : { signal: `data use ${c.used_pct}% on the top tier`, target: extra.name, uplift: money(extra.price_cents) });
  }
  if (c.roaming) { const r = ADDONS.find((a) => a.id === (o.payment === "postpaid" ? "ATL-ADD-04" : "ATL-ADD-03")); out.push({ signal: "roams abroad", target: r.name, uplift: money(r.price_cents) }); }
  return out;
}
function customerInsights() {
  const rows = CUSTOMERS.map((c) => { const s = churnScore(c), o = offerOf(c); return { id: c.id, name: c.name, offer: o.name, price: money(o.price_cents), ...s, action: actionFor(c, s), upsell: upsellFor(c, s), _price: o.price_cents }; });
  const high = rows.filter((r) => r.band === "HIGH"), up = rows.filter((r) => r.upsell.length);
  const atRiskCents = high.reduce((s, r) => s + r._price, 0) * SCALE;
  const upsideCents = up.reduce((s, r) => s + r.upsell.reduce((t, u) => t + Math.round(Number(u.uplift) * 100), 0), 0) * SCALE;
  return { customers: rows.length, subscribers: rows.length * SCALE, high: high.length, medium: rows.filter((r) => r.band === "MEDIUM").length, upsell_ready: up.length,
    at_risk: high.sort((a, b) => b.score - a.score).map(({ _price, upsell, ...r }) => r), upsell: up.map((r) => ({ id: r.id, name: r.name, offer: r.offer, moves: r.upsell })),
    revenue_at_risk_per_month: money(atRiskCents), upsell_upside_per_month: money(upsideCents), currency: CURRENCY, scale: `each customer stands for ${SCALE.toLocaleString("en")} similar subscribers` };
}
function explainCustomer({ customer }) {
  const k = String(customer ?? "").trim().toLowerCase(), c = CUSTOMERS.find((x) => x.id.toLowerCase() === k || x.name.toLowerCase().includes(k));
  if (!c) throw new Error(`no customer ${customer}`);
  const s = churnScore(c), o = offerOf(c);
  return { id: c.id, name: c.name, offer: o.name, price: money(o.price_cents), data: o.data_gb === null ? U : `${o.data_gb} GB`, tenure_months: c.tenure_mo, ...s, action: actionFor(c, s), upsell: upsellFor(c, s) };
}
