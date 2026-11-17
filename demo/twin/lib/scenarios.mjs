// Twin mode: run an agent's decisions over the whole synthetic customer base under a rule set, on a branch (the base world and
// the base policy are never changed), then compare "today's rules" with "proposed rules" and certify or reject.
// Agents here are pure functions standing in for the real agents' proposals; the gate is the same decision code the skills cite.
import { creditDecision, retentionDecision } from "../../seed/lib/skills.mjs";
import { rateMonth, money, toCents } from "./rating.mjs";
import { PLANS, MONTHS } from "./data.mjs";

// ---- branch: a copy of the policy with overrides; the original is untouched ----
export function branch(policy, o = {}) {
  const p = structuredClone(policy);
  if (o.cap_override != null) for (const seg of Object.values(p.goodwill_credit.cap_table)) for (const band of Object.keys(seg)) seg[band] = money(Math.max(toCents(seg[band]), toCents(o.cap_override)));   // "raise every cap to at least X"
  if (o.max_discount_percent != null) {
    const m = Number(o.max_discount_percent);
    p.retention.max_discount_percent = m; p.retention.needs_approval_above_percent = m;
    p.retention.ladder = p.retention.ladder.map((s, i, a) => ({ ...s, max_discount_percent: i === a.length - 1 ? m : Math.min(s.max_discount_percent, m) }));
  }
  return p;
}

const usualCents = (plan, months) => Math.round(months.slice(0, MONTHS - 1).reduce((a, u) => a + rateMonth(plan, u).total_cents, 0) / (MONTHS - 1));

export function billShockPopulation(world) {
  const out = [];
  world.subscribers.forEach((s, i) => {
    if (s.segment === "prepaid") return;
    const plan = PLANS[s.plan], bill = rateMonth(plan, world.usage[i][MONTHS - 1]);
    const roam = bill.lines.find((l) => l.kind === "roaming");
    if (roam && bill.total_cents >= usualCents(plan, world.usage[i]) * 1.8) out.push({ s, bill, roam });
  });
  return out;
}
const capOf = (policy, s) => { const b = s.tenure_months < 12 ? "0-11" : s.tenure_months < 36 ? "12-35" : "36+"; return policy.goodwill_credit.cap_table[s.segment][b]; };

function runBillShock(world, policy, { gate = true, proposal_share = 50 } = {}) {
  const rows = [];
  let granted = 0, queued = 0, refused = 0, human = 0, paid = 0, violations = 0;
  for (const { s, bill, roam } of billShockPopulation(world)) {
    const requested = Math.round((roam.cents * proposal_share) / 100);   // the agent's proposal: a share of the surprise line
    const ctx = { segment: s.segment, tenure_months: s.tenure_months, requested: money(requested), credits_last_12m: s.credits_last_12m, identity_verified: s.identity_verified, vulnerable: s.vulnerable };
    const rule = creditDecision(policy, ctx);
    const decision = gate ? rule.decision : "grant";
    const credit = decision === "grant" ? requested : 0;
    if (decision === "grant") { granted++; paid += credit; if (rule.decision !== "grant") violations++; }
    else if (decision === "needs-approval") { queued++; }
    else if (decision === "hand-to-human") { human++; }
    else refused++;
    rows.push({ id: s.id, name: s.name, segment: s.segment, tenure_months: s.tenure_months, cap: capOf(policy, s), requested_cents: requested, decision, clause: gate ? rule.clause : "no gate", before_cents: bill.total_cents, credit_cents: credit, after_cents: bill.total_cents - credit });
  }
  const population = rows.length;
  return { agent: "bill-shock", gate, population, metrics: { population, granted, queued_for_approval: queued, handed_to_human: human, refused, paid_cents: paid, violations, human_queue_percent: population ? Math.round(((queued + human) * 1000) / population) / 10 : 0 }, rows };
}

const acceptPercent = (policy, pct) => { const t = policy.twin.retention_accept_percent; const k = Object.keys(t).map(Number).filter((n) => n <= pct).sort((a, b) => b - a)[0] ?? 0; return t[String(k)]; };

function runRetention(world, policy, { gate = true, proposal_percent = 10 } = {}) {
  const rows = [];
  let released = 0, queued = 0, noOffer = 0, violations = 0, saved = 0, kept = 0, cost = 0;
  world.subscribers.forEach((s) => {
    if (s.segment === "prepaid" || s.churn_risk < 0.5) return;
    const price = PLANS[s.plan].fee_cents;
    const rule = retentionDecision(policy, { churn_risk: s.churn_risk, discount_percent: proposal_percent });
    const decision = gate ? rule.decision : "release";
    let after = price, didSave = false;
    if (decision === "release") {
      released++; if (rule.decision !== "release") violations++;
      after = Math.round((price * (100 - proposal_percent)) / 100);
      if (s.accept_draw * 100 < acceptPercent(policy, proposal_percent)) { didSave = true; saved++; kept += after * 12; cost += (price - after) * 12; }
    } else if (decision === "needs-approval") queued++; else noOffer++;
    rows.push({ id: s.id, name: s.name, segment: s.segment, churn_risk: s.churn_risk, decision, clause: gate ? rule.clause : "no gate", before_cents: price, after_cents: decision === "release" ? after : price, credit_cents: decision === "release" ? price - after : 0, saved: didSave });
  });
  const population = rows.length;
  return { agent: "retention", gate, population, metrics: { population, released, queued_for_approval: queued, no_offer: noOffer, violations, saved, revenue_kept_cents: kept, discount_cost_cents: cost, human_queue_percent: population ? Math.round((queued * 1000) / population) / 10 : 0 }, rows };
}

export function runScenario(world, policy, { agent, ...params }) {
  if (agent === "bill-shock") return runBillShock(world, policy, params);
  if (agent === "retention") return runRetention(world, policy, params);
  throw new Error(`unknown agent ${agent}`);
}

export function certify(run, policy) {
  const c = policy.twin.certify, m = run.metrics;
  const budget = run.agent === "bill-shock" ? c.bill_shock_credit_budget_eur : c.retention_discount_budget_eur;
  const spend = run.agent === "bill-shock" ? m.paid_cents : m.discount_cost_cents;
  const checks = [
    { name: "No action outside the mandate", ok: m.violations <= c.max_violations, value: String(m.violations), limit: `at most ${c.max_violations}` },
    { name: "People are not flooded with approvals", ok: m.human_queue_percent <= c.max_human_queue_percent, value: `${m.human_queue_percent}%`, limit: `at most ${c.max_human_queue_percent}%` },
    { name: run.agent === "bill-shock" ? "Credits stay inside the budget" : "Discount cost stays inside the budget", ok: spend <= toCents(budget), value: `EUR ${money(spend)}`, limit: `at most EUR ${budget}` }
  ];
  return { verdict: checks.every((x) => x.ok) ? "CERTIFIED" : "REJECTED", checks };
}

// Baseline (today's rules) versus a candidate (overrides on a branch). Returns summaries and the biggest bill or price changes.
export function compare(world, policy, req) {
  const { agent, gate = true, proposal_share, proposal_percent, cap_override, max_discount_percent, top = 12 } = req;
  const params = { agent, ...(proposal_share != null && { proposal_share }), ...(proposal_percent != null && { proposal_percent }) };
  const base = runScenario(world, policy, { agent, gate: true });   // today: the production agent setup, today's rules, gate on
  const candPolicy = branch(policy, { cap_override, max_discount_percent });
  const cand = runScenario(world, candPolicy, { ...params, gate });
  const baseById = new Map(base.rows.map((r) => [r.id, r]));
  const changes = cand.rows.filter((r) => r.after_cents !== (baseById.get(r.id)?.after_cents ?? r.before_cents))
    .map((r) => ({ id: r.id, name: r.name, segment: r.segment, before_cents: r.before_cents, baseline_after_cents: baseById.get(r.id)?.after_cents ?? r.before_cents, candidate_after_cents: r.after_cents, candidate_decision: r.decision, clause: r.clause }))
    .sort((a, b) => Math.abs(b.baseline_after_cents - b.candidate_after_cents) - Math.abs(a.baseline_after_cents - a.candidate_after_cents)).slice(0, top);
  const fmt = (r) => ({ ...r, rows: undefined });
  return { agent, baseline: { ...fmt(base), certificate: certify(base, policy) }, candidate: { ...fmt(cand), certificate: certify(cand, candPolicy) }, changes, changed_total: cand.rows.filter((r) => r.after_cents !== (baseById.get(r.id)?.after_cents ?? r.before_cents)).length };
}
