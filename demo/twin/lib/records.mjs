// Back-office records for the twin: everything a billing back office shows about a customer, derived on demand and
// deterministically from the seeded world. Nothing is stored and nothing here changes the world, so every earlier number holds.
// Consistency rules (tested): invoice lines sum to the rated bill; payments equal the bills they pay; CDRs sum to the usage totals.
import { mulberry32 } from "../../seed/lib/skills.mjs";
import { PLANS, CATALOGUE, MONTHS } from "./data.mjs";
import { rateMonth, money, ZONE_RATE_CENTS_PER_GB, PREMIUM_SMS_CENTS } from "./rating.mjs";
import { MONTH_LABELS, spec } from "./tmf.mjs";
import { billShockPopulation } from "./scenarios.mjs";

export const AS_OF = "2026-10-19";
const DAY = 86400000;
const dt = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => fmt(new Date(dt(s).getTime() + n * DAY));
const addMonths = (s, n) => { const d = dt(s); d.setUTCMonth(d.getUTCMonth() + n); return fmt(d); };
const hash = (str) => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = (world, i, salt) => mulberry32((world.seed + (i + 1) * 7919 + hash(salt)) >>> 0);
const pick = (r, a) => a[Math.floor(r() * a.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const pad = (n, w) => String(n).padStart(w, "0");
const idx = (world) => (world._ix ??= new Map(world.subscribers.map((s, i) => [s.id, i])));

// ---- phone numbers: invented range, reversible so search by number needs no index ----
export const msisdn = (i) => { const d = String(1000000 + i * 3); return `+358 40 ${d.slice(0, 3)} ${d.slice(3)}`; };
export const parseMsisdn = (s, count) => { const d = String(s).replace(/\D/g, "").slice(-7); const n = Number(d) - 1000000; return d.length === 7 && n >= 0 && n % 3 === 0 && n / 3 < count ? n / 3 : null; };

// allocate an integer total over weights so the parts add up exactly
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (total * w) / sum), base = raw.map(Math.floor);
  let left = total - base.reduce((a, b) => a + b, 0);
  raw.map((x, k) => [x - Math.floor(x), k]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, k]) => { if (left-- > 0) base[k]++; });
  return base;
}

const STREETS = ["Aurora Street", "Harbour Road", "Birch Lane", "Mill Way", "Lakeside Drive", "Station Square", "Pine Avenue", "Fjord Road", "Market Street", "Linden Close"];
const CITIES = [["Helsinki", "00100"], ["Espoo", "02100"], ["Tampere", "33100"], ["Turku", "20100"], ["Oulu", "90100"], ["Stockholm", "11120"], ["Gothenburg", "41101"], ["Oslo", "0150"], ["Bergen", "5003"], ["Copenhagen", "1050"]];
const DEVICES = [["Nordic X 256 GB", "Nordic"], ["Nordic Lite 128 GB", "Nordic"], ["Nordic Pro 512 GB", "Nordic"], ["Aalto A5 128 GB", "Aalto"], ["Fjord F2 256 GB", "Fjord"]];
const COUNTRY = { 2: "United States", 3: "Thailand" };
const METHOD = { prepaid: "Prepaid balance", postpaid: "Direct debit", business: "Invoice (30 days)" };

// ---- bills and payments ----
function billInfo(world, i, m) {
  const s = world.subscribers[i], r = rng(world, i, `pay${m}`), roll = r(), label = MONTH_LABELS[m];
  const issued = `${label}-28`, due = addDays(issued, 15), latest = m === MONTHS - 1;
  if (s.segment === "prepaid") return { issued, due, status: "paid", attempts: [{ date: issued, ok: true }], paid: issued };
  if (latest) return roll < 0.1 ? { issued, due, status: "overdue", attempts: [], paid: null } : { issued, due, status: "paid", attempts: [{ date: addDays(due, -int(r, 1, 8)), ok: true }], paid: null };
  if (roll < 0.07) { const d = addDays(due, int(r, 1, 9)); return { issued, due, status: "paid late", attempts: [{ date: d, ok: true }] }; }
  if (roll < 0.1) { const d = addDays(due, -int(r, 0, 5)); return { issued, due, status: "paid", attempts: [{ date: d, ok: false }, { date: addDays(d, int(r, 2, 4)), ok: true }] }; }
  return { issued, due, status: "paid", attempts: [{ date: addDays(due, -int(r, 1, 8)), ok: true }] };
}

function buildBills(world, i) {
  const s = world.subscribers[i], plan = PLANS[s.plan], digits = s.id.slice(3);
  const bills = [], payments = [];
  for (let m = 0; m < MONTHS; m++) {
    const rated = rateMonth(plan, world.usage[i][m]), b = billInfo(world, i, m);
    const bill = { id: `${s.id}-${MONTH_LABELS[m]}`, invoice_number: `INV-${digits}-${MONTH_LABELS[m].replace("-", "")}`, period: MONTH_LABELS[m], issued: b.issued, due: b.due, status: b.status, lines: rated.lines, total_cents: rated.total_cents };
    b.attempts.forEach((a, k) => {
      const p = { id: `PAY-${digits}-${MONTH_LABELS[m].replace("-", "")}-${k + 1}`, bill_id: bill.id, invoice_number: bill.invoice_number, date: a.date, method: METHOD[s.segment], amount_cents: rated.total_cents, status: a.ok ? "succeeded" : "failed", reason: a.ok ? null : "Insufficient funds" };
      payments.push(p); if (a.ok) { bill.paid_date = a.date; bill.payment_id = p.id; }
    });
    bills.push(bill);
  }
  return { bills, payments };
}

// ---- credits, orders, cases ----
function buildCredits(world, i) {
  const s = world.subscribers[i], r = rng(world, i, "credits"), months = [...Array(MONTHS - 1).keys()];
  const out = [];
  for (let k = 0; k < s.credits_last_12m; k++) {
    const m = months.splice(int(r, 0, months.length - 1), 1)[0], cents = pick(r, [500, 1000, 1500, 2000, 2500]);
    out.push({ id: `CRN-${s.id.slice(3)}-${k + 1}`, date: addDays(`${MONTH_LABELS[m]}-28`, int(r, 3, 12)), kind: "Goodwill credit", reason: pick(r, ["Roaming charge on previous bill", "Network outage in the area", "Premium SMS charged in error"]), amount_cents: cents, approved_by: "Care agent, within mandate", refunded_to: METHOD[s.segment] });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
function buildOrders(world, i) {
  const s = world.subscribers[i], r = rng(world, i, "orders"), plan = PLANS[s.plan], digits = s.id.slice(3);
  const o = [{ id: `ORD-${digits}-1`, date: addMonths(AS_OF, -s.tenure_months), type: "New subscription", state: "completed", items: [plan.name] }];
  if (r() < 0.3 && s.tenure_months > 6) o.push({ id: `ORD-${digits}-2`, date: addMonths(AS_OF, -int(r, 2, Math.min(s.tenure_months - 1, 30))), type: "Plan change", state: "completed", items: [plan.name] });
  if (r() < 0.2) o.push({ id: `ORD-${digits}-3`, date: addMonths(AS_OF, -int(r, 1, Math.min(s.tenure_months, 24))), type: "Device purchase", state: "completed", items: [pick(r, DEVICES)[0], "24-month instalments"] });
  if (r() < 0.1) o.push({ id: `ORD-${digits}-4`, date: addMonths(AS_OF, -int(r, 1, Math.min(s.tenure_months, 12))), type: "SIM swap", state: "completed", items: ["eSIM activation"] });
  return o.sort((a, b) => a.date.localeCompare(b.date));
}
function buildCases(world, i, shock) {
  const s = world.subscribers[i], r = rng(world, i, "cases"), digits = s.id.slice(3), c = [];
  if (shock) c.push({ id: `CASE-${digits}-1`, opened: addDays(AS_OF, -int(r, 1, 6)), category: "billing", subject: "My bill is much higher than usual", status: "open", owner: "Bill Shock Agent" });
  if (s.churn_risk >= 0.7) c.push({ id: `CASE-${digits}-2`, opened: addDays(AS_OF, -int(r, 3, 20)), category: "contract", subject: "Asked about contract end date", status: "open", owner: "Retention Agent" });
  if (r() < 0.1) c.push({ id: `CASE-${digits}-3`, opened: addDays(AS_OF, -int(r, 40, 300)), category: "network", subject: "Data is slow in the evenings", status: "closed", owner: "Fault Triage Agent" });
  return c;
}

// ---- usage detail (CDRs) for one month; sums equal the monthly usage tuple and the rated roaming line ----
export function cdrs(world, i, m) {
  const s = world.subscribers[i], plan = PLANS[s.plan], [dataMb, roamMb, zone, sms] = world.usage[i][m], r = rng(world, i, `cdr${m}`), label = MONTH_LABELS[m];
  const when = () => `${label}-${pad(int(r, 1, 28), 2)} ${pad(int(r, 6, 23), 2)}:${pad(int(r, 0, 59), 2)}`;
  const rows = [];
  const kd = Math.max(8, Math.min(60, Math.round(dataMb / 250)));
  allocate(dataMb, Array.from({ length: kd }, () => 0.2 + r())).forEach((mb) => rows.push({ time: when(), type: "data", network: "Nordwave", detail: `internet, ${pick(r, ["FI-HEL", "FI-ESP", "FI-TKU", "SE-STO", "NO-OSL"])}-${int(r, 10, 99)}`, volume_mb: mb, charge_cents: 0 }));
  const rated = rateMonth(plan, world.usage[i][m]), roam = rated.lines.find((l) => l.kind === "roaming");
  if (roamMb > 0 && roam) {
    const kr = Math.max(3, Math.min(20, Math.round(roamMb / 160))), parts = allocate(roamMb, Array.from({ length: kr }, () => 0.2 + r()));
    const charges = allocate(roam.cents, parts);
    parts.forEach((mb, k) => rows.push({ time: when(), type: "roaming data", network: `${COUNTRY[zone] ?? "Abroad"} (World Zone ${zone})`, detail: `${money(ZONE_RATE_CENTS_PER_GB[zone])} EUR/GB`, volume_mb: mb, charge_cents: charges[k] }));
  }
  for (let k = 0; k < sms; k++) rows.push({ time: when(), type: "premium sms", network: "Nordwave", detail: `short code ${int(r, 71000, 79999)}`, volume_mb: 0, charge_cents: PREMIUM_SMS_CENTS });
  for (let k = 0, n = int(r, 15, 70); k < n; k++) rows.push({ time: when(), type: r() < 0.5 ? "voice out" : "voice in", network: "Nordwave", detail: `${int(r, 20, 3600)} s, included`, volume_mb: 0, charge_cents: 0 });
  rows.sort((a, b) => a.time.localeCompare(b.time));
  const sum = (t) => rows.filter((x) => x.type === t).reduce((a, x) => a + x.volume_mb, 0);
  return { month: label, rows, summary: { data_mb: sum("data"), roaming_mb: sum("roaming data"), premium_sms: rows.filter((x) => x.type === "premium sms").length, calls: rows.filter((x) => x.type.startsWith("voice")).length, charged_cents: rows.reduce((a, x) => a + x.charge_cents, 0) } };
}

// ---- the customer record ----
export function customerRecord(world, id) {
  const i = idx(world).get(id);
  if (i == null) return null;
  const s = world.subscribers[i], plan = PLANS[s.plan], r = rng(world, i, "profile"), digits = id.slice(3), [city, post] = pick(r, CITIES);
  const { bills, payments } = buildBills(world, i);
  const shock = office(world).shockIds.has(id);
  const latest = bills[MONTHS - 1];
  const device = pick(r, DEVICES);
  const overdueCents = bills.filter((b) => b.status === "overdue").reduce((a, b) => a + b.total_cents, 0);
  const credits = buildCredits(world, i);
  return {
    id, name: s.name, segment: s.segment, language: s.language, status: "active", tenure_months: s.tenure_months,
    flags: { bill_shock: shock, churn_risk: s.churn_risk, vulnerable: s.vulnerable, overdue: latest.status === "overdue", identity_verified: s.identity_verified, marketing_consent: s.marketing_consent },
    contact: { email: `${s.name.toLowerCase().replace(/[^a-z]+/g, ".")}.${digits}@example.invalid`, phone: msisdn(i), address: `${int(r, 1, 98)} ${pick(r, STREETS)}, ${post} ${city}` },
    account: { id: `ACC-${digits}`, payment_method: METHOD[s.segment], bill_cycle_day: 28, payment_terms_days: 15, balance_due_cents: overdueCents, credits_last_12m: s.credits_last_12m, credit_class: pick(r, ["A", "A", "B", "B", "C"]) },
    subscription: { id: `${id}-sub`, plan_id: s.plan, plan: plan.name, monthly_fee_cents: plan.fee_cents, included_data: plan.included_mb == null ? "Unlimited" : `${plan.included_mb / 1024} GB`, since: addMonths(AS_OF, -s.tenure_months) },
    line: { msisdn: msisdn(i), iccid: `8935800${pad(int(r, 0, 99999), 5)}${digits}`.slice(0, 19), imsi: `00101${pad(i * 7 + 1000, 10)}`, device: device[0], imei: `35${pad(int(r, 0, 99999999), 8)}${pad(i % 100000, 5)}`.slice(0, 15), status: "active", network: "Nordwave 5G" },
    bills, payments: payments.sort((a, b) => b.date.localeCompare(a.date)), credits, orders: buildOrders(world, i), cases: buildCases(world, i, shock)
  };
}

// ---- portfolio numbers and the customer list (cached once per world) ----
function office(world) {
  if (world._office) return world._office;
  const n = world.subscribers.length, latest = new Array(n), monthly = new Array(MONTHS).fill(0), overdue = new Array(n).fill(false);
  const bySegment = {};
  for (let i = 0; i < n; i++) {
    const s = world.subscribers[i], plan = PLANS[s.plan];
    for (let m = 0; m < MONTHS; m++) { const t = rateMonth(plan, world.usage[i][m]).total_cents; monthly[m] += t; if (m === MONTHS - 1) latest[i] = t; }
    overdue[i] = s.segment !== "prepaid" && billInfo(world, i, MONTHS - 1).status === "overdue";
    const g = (bySegment[s.segment] ??= { customers: 0, mrr_cents: 0, billed_cents: 0 }); g.customers++; g.mrr_cents += plan.fee_cents; g.billed_cents += latest[i];
  }
  const shockIds = new Set(billShockPopulation(world).map((x) => x.s.id));
  return (world._office = { latest, monthly, overdue, bySegment, shockIds });
}

export function dashboard(world) {
  const o = office(world), n = world.subscribers.length;
  const od = o.overdue.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const top = [...o.latest.keys()].sort((a, b) => o.latest[b] - o.latest[a] || a - b).slice(0, 5).map((i) => ({ id: world.subscribers[i].id, name: world.subscribers[i].name, segment: world.subscribers[i].segment, total_cents: o.latest[i] }));
  return { as_of: AS_OF, customers: n, lines: n, by_segment: o.bySegment, billed_by_month: MONTH_LABELS.map((label, m) => ({ month: label, total_cents: o.monthly[m] })), latest_billed_cents: o.monthly[MONTHS - 1], mrr_cents: Object.values(o.bySegment).reduce((a, g) => a + g.mrr_cents, 0), overdue: { customers: od.length, amount_cents: od.reduce((a, i) => a + o.latest[i], 0) }, bill_shock_cases: o.shockIds.size, churn_risk_customers: world.subscribers.filter((s) => s.churn_risk >= 0.5).length, vulnerable_customers: world.subscribers.filter((s) => s.vulnerable).length, top_bills: top, catalogue_offers: CATALOGUE.length };
}

export function listCustomers(world, { q = "", segment = "", flag = "", page = 1, size = 25 } = {}) {
  const o = office(world), term = q.trim().toLowerCase(), n = world.subscribers.length;
  let ids = [...Array(n).keys()];
  if (term) {
    const byPhone = /^[+\d\s]{5,}$/.test(term) ? parseMsisdn(term, n) : null;
    ids = /^nw-\d+$/.test(term) ? ids.filter((i) => world.subscribers[i].id.toLowerCase() === term) : byPhone != null ? [byPhone] : ids.filter((i) => world.subscribers[i].name.toLowerCase().includes(term) || world.subscribers[i].id.toLowerCase().includes(term));
  }
  if (segment) ids = ids.filter((i) => world.subscribers[i].segment === segment);
  const test = { shock: (i) => o.shockIds.has(world.subscribers[i].id), risky: (i) => world.subscribers[i].churn_risk >= 0.5, overdue: (i) => o.overdue[i], vulnerable: (i) => world.subscribers[i].vulnerable }[flag];
  if (test) ids = ids.filter(test);
  const pages = Math.max(1, Math.ceil(ids.length / size)), p = Math.min(Math.max(1, page), pages);
  return { total: ids.length, page: p, pages, rows: ids.slice((p - 1) * size, p * size).map((i) => { const s = world.subscribers[i]; return { id: s.id, name: s.name, segment: s.segment, plan: PLANS[s.plan].name, msisdn: msisdn(i), tenure_months: s.tenure_months, latest_bill_cents: o.latest[i], churn_risk: s.churn_risk, flags: { bill_shock: o.shockIds.has(s.id), overdue: o.overdue[i], vulnerable: s.vulnerable } }; }) };
}

// ---- TMF676 payments (read-only), served beside the other twin TMF APIs ----
const pay = (p, id) => ({ id: p.id, href: `/twin/tmf/676/payment/${p.id}`, status: p.status === "succeeded" ? "done" : "failed", statusDate: p.date, amount: { unit: "EUR", value: money(p.amount_cents) }, paymentMethod: { name: p.method }, correlatorId: p.invoice_number, relatedParty: [{ id, role: "customer" }], "@type": "Payment" });
export const SPEC_676 = spec(676, "Payment Management", "Payment", [["payment", "Payments of a customer", ["relatedParty.id"]], ["payment/{id}", "One payment", []]], ["id", "status", "statusDate", "amount", "paymentMethod"]);
export function tmf676(world, rest, q) {
  const parts = rest.split("/").filter(Boolean);
  const nf = { status: 404, body: { code: "404", reason: "payment not found" } };
  if (parts[0] === "openapi") return { status: 200, body: SPEC_676 };
  if (parts[0] !== "676" || parts[1] !== "payment") return nf;
  const id = parts[2];
  if (id) { const m = id.match(/^PAY-(\d+)-/); const cust = m && customerRecord(world, `NW-${m[1]}`); const p = cust?.payments.find((x) => x.id === id); return p ? { status: 200, body: pay(p, cust.id) } : nf; }
  const party = q.get("relatedParty.id"), rec = party && customerRecord(world, party);
  return rec ? { status: 200, body: rec.payments.map((p) => pay(p, rec.id)) } : { status: 400, body: { code: "400", reason: "relatedParty.id is required" } };
}
