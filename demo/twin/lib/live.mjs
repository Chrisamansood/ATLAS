// Live-feel helpers: a deterministic event stream over the seeded world (same n, same event) and "why this number" for a bill line.
import { mulberry32 } from "../../seed/lib/skills.mjs";
import { PLANS, MONTHS } from "./data.mjs";
import { rateMonth, money, ZONE_RATE_CENTS_PER_GB, OVERAGE_CENTS_PER_GB, PREMIUM_SMS_CENTS } from "./rating.mjs";
import { customerRecord, cdrs, dashboard } from "./records.mjs";
import { creditDecision } from "../../seed/lib/skills.mjs";

export function streamEvent(world, n) {
  const pair = Math.floor(n / 2), r = mulberry32((world.seed + pair * 104729) >>> 0);
  const i = Math.floor(r() * world.subscribers.length), s = world.subscribers[i], plan = PLANS[s.plan], u = world.usage[i][MONTHS - 1];
  const rated = rateMonth(plan, u), top = [...rated.lines].sort((a, b) => b.cents - a.cents)[0];
  const e = (kind, text, cents) => ({ id: `E-${n}`, n, kind, customer: s.id, text, ...(cents != null ? { cents } : {}) });
  if (n % 97 === 96) { const d = dashboard(world); return { id: `E-${n}`, n, kind: "bill.issued", customer: null, text: `Bill run cycle 28: ${d.customers.toLocaleString("en-US")} bills, EUR ${money(d.latest_billed_cents)}`, cents: d.latest_billed_cents }; }
  if (n % 10 === 4 || n % 10 === 7) {
    const rec = customerRecord(world, s.id), p = rec.payments[0];
    return p.status === "succeeded" ? e("payment.settled", `${s.id} EUR ${money(p.amount_cents)} ${p.method.toLowerCase()}`, p.amount_cents) : e("payment.failed", `${s.id} EUR ${money(p.amount_cents)} ${p.method.toLowerCase()}, ${p.reason.toLowerCase()}`, p.amount_cents);
  }
  if (n % 2 === 0) return e("usage.recorded", u[1] > 0 ? `${s.id} roaming ${u[1]} MB, World Zone ${u[2]}` : `${s.id} data ${u[0]} MB`);
  return e("usage.rated", `${s.id} ${top.item}: EUR ${money(top.cents)}`, top.cents);
}

export function explainLine(world, policy, customer, month, lineIdx) {
  const rec = customerRecord(world, customer);
  if (!rec) return { error: `no such customer ${customer}` };
  const bill = rec.bills.find((b) => b.period === month);
  if (!bill) return { error: `no bill for ${month}` };
  const line = bill.lines[lineIdx];
  if (!line) return { error: `bill has ${bill.lines.length} lines` };
  const i = world.subscribers.findIndex((s) => s.id === customer), m = rec.bills.indexOf(bill), [dataMb, roamMb, zone, sms] = world.usage[i][m], plan = PLANS[world.subscribers[i].plan];
  const sub = world.subscribers[i];
  const x = { customer, bill: bill.invoice_number, line: line.item, amount_cents: line.cents };
  if (lineIdx === 0) Object.assign(x, { rule: "plan.fee", formula: "fixed monthly fee from the catalogue", inputs: { offer: `plan-${plan.id}`, fee_cents: plan.fee_cents }, recomputed_cents: plan.fee_cents, source: `TMF620 productOffering plan-${plan.id}` });
  else if (line.kind === "roaming") { const rate = ZONE_RATE_CENTS_PER_GB[zone], c = cdrs(world, i, m); Object.assign(x, { rule: "roaming.zone", formula: "round(roaming MB × zone rate per GB ÷ 1024)", inputs: { roaming_mb: roamMb, zone, rate_cents_per_gb: rate, usage_records: c.rows.filter((r) => r.type === "roaming data").length, usage_records_charged_cents: c.summary.charged_cents }, recomputed_cents: Math.round((roamMb * rate) / 1024), source: "rating.mjs ZONE_RATE_CENTS_PER_GB; usage records in the back office" }); }
  else if (line.item.startsWith("Data over")) Object.assign(x, { rule: "data.overage", formula: "round((used MB − included MB) × overage rate per GB ÷ 1024)", inputs: { used_mb: dataMb, included_mb: plan.included_mb, rate_cents_per_gb: OVERAGE_CENTS_PER_GB }, recomputed_cents: Math.round(((dataMb - plan.included_mb) * OVERAGE_CENTS_PER_GB) / 1024), source: "rating.mjs OVERAGE_CENTS_PER_GB" });
  else Object.assign(x, { rule: "sms.premium", formula: "count × premium SMS price", inputs: { count: sms, price_cents: PREMIUM_SMS_CENTS }, recomputed_cents: sms * PREMIUM_SMS_CENTS, source: "rating.mjs PREMIUM_SMS_CENTS" });
  x.matches = x.recomputed_cents === line.cents;
  if (line.kind === "roaming") {
    const probe = creditDecision(policy, { segment: sub.segment, tenure_months: sub.tenure_months, requested: "0.01", credits_last_12m: sub.credits_last_12m, identity_verified: sub.identity_verified, vulnerable: sub.vulnerable });
    x.credit_rule = probe.cap ? `An agent may grant up to EUR ${probe.cap} for this customer without approval (goodwill-credit-policy §3.1); above that needs Care Lead approval (§3.2).` : `No agent credit without a person (goodwill-credit-policy ${probe.clause}).`;
  }
  return x;
}
