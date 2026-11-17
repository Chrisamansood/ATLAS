import { test } from "node:test";
import assert from "node:assert/strict";
import { generate, PLANS, CATALOGUE } from "../../twin/lib/data.mjs";
import { rateMonth, money } from "../../twin/lib/rating.mjs";

const world = generate();

test("same seed gives the same world", () => {
  const b = generate();
  assert.deepEqual(b.subscribers.slice(0, 50), world.subscribers.slice(0, 50));
  assert.deepEqual(b.usage[9999], world.usage[9999]);
});

test("10,000 subscribers, 12 months each, unique ids, about 30 offers", () => {
  assert.equal(world.subscribers.length, 10000);
  assert.equal(new Set(world.subscribers.map((s) => s.id)).size, 10000);
  assert.ok(world.usage.every((u) => u.length === 12));
  assert.ok(CATALOGUE.length >= 28 && CATALOGUE.length <= 32, `${CATALOGUE.length} offers`);
});

test("rating is exact: plan fee, roaming line and total in cents", () => {
  const plan = PLANS["flex-20"];
  const b = rateMonth(plan, [10 * 1024, 1843, 2, 0]);          // 1.8 GB (1843 MB) in zone 2 at 30.00/GB
  assert.equal(b.lines[0].cents, 2990);
  const roam = b.lines.find((l) => l.kind === "roaming");
  assert.equal(roam.cents, Math.round((1843 * 3000) / 1024));
  assert.equal(b.total_cents, 2990 + roam.cents);
  assert.equal(money(5400), "54.00");
  assert.equal(money(5), "0.05");
  assert.equal(rateMonth(PLANS["start-5"], [9999, 0, 1, 0]).total_cents, 990, "prepaid has no data overage");
  assert.ok(rateMonth(PLANS["flex-5"], [8 * 1024, 0, 1, 0]).total_cents > 1990, "postpaid overage is charged");
});

test("seeded situations exist: bill-shock customers and churn-risk customers", () => {
  const shocks = world.subscribers.filter((s, i) => world.usage[i][11][1] >= 600 && s.segment !== "prepaid");
  assert.ok(shocks.length >= 150 && shocks.length <= 450, `shock customers ${shocks.length}`);
  const risky = world.subscribers.filter((s) => s.churn_risk >= 0.5);
  assert.ok(risky.length >= 1000 && risky.length <= 2600, `risky ${risky.length}`);
});

// ---- scenarios ----
import { readFileSync } from "node:fs";
import { branch, runScenario, compare, certify } from "../../twin/lib/scenarios.mjs";
const policy = JSON.parse(readFileSync(new URL("../../skills/policy-values.json", import.meta.url), "utf8"));

test("branching never changes the base policy or the base world", () => {
  const before = JSON.stringify(policy), w = JSON.stringify(world.subscribers.slice(0, 200));
  const p = branch(policy, { cap_override: "90.00", max_discount_percent: 30 });
  assert.equal(p.goodwill_credit.cap_table.postpaid["12-35"], "90.00");
  assert.equal(p.retention.max_discount_percent, 30);
  compare(world, policy, { agent: "bill-shock", cap_override: "90.00" });
  assert.equal(JSON.stringify(policy), before);
  assert.equal(JSON.stringify(world.subscribers.slice(0, 200)), w);
});

test("bill shock with the gate: nothing outside the mandate, and today's rules are certified", () => {
  const run = runScenario(world, policy, { agent: "bill-shock", gate: true });
  assert.ok(run.metrics.population >= 100);
  assert.equal(run.metrics.violations, 0);
  assert.ok(run.rows.every((r) => r.decision !== "grant" || r.requested_cents <= Math.round(parseFloat(r.cap) * 100)));
  assert.equal(certify(run, policy).verdict, "CERTIFIED");
});

test("bill shock without the gate is rejected: grants outside the mandate are counted", () => {
  const run = runScenario(world, policy, { agent: "bill-shock", gate: false });
  assert.ok(run.metrics.violations > 0);
  const c = certify(run, policy);
  assert.equal(c.verdict, "REJECTED");
  assert.ok(c.checks.some((x) => !x.ok && /mandate/.test(x.name)));
});

test("a higher cap pays more credit and sends fewer cases to a person; amounts stay exact cents", () => {
  const r = compare(world, policy, { agent: "bill-shock", cap_override: "60.00" });
  assert.ok(r.candidate.metrics.paid_cents > r.baseline.metrics.paid_cents);
  assert.ok(r.candidate.metrics.human_queue_percent < r.baseline.metrics.human_queue_percent);
  for (const c of r.changes) assert.ok(Number.isInteger(c.candidate_after_cents) && Number.isInteger(c.before_cents));
  assert.ok(r.changed_total > 0 && r.changes.length <= 12);
});

test("retention: the gate holds offers to the ladder; no gate lets a 20% offer break the mandate", () => {
  const gated = runScenario(world, policy, { agent: "retention", gate: true, proposal_percent: 10 });
  const open = runScenario(world, policy, { agent: "retention", gate: false, proposal_percent: 20 });
  assert.equal(gated.metrics.violations, 0);
  assert.ok(open.metrics.violations > 0);
  assert.equal(certify(open, policy).verdict, "REJECTED");
  assert.equal(certify(gated, policy).verdict, "CERTIFIED");
  assert.ok(gated.metrics.saved > 0 && gated.metrics.revenue_kept_cents > 0);
  assert.ok(Number.isInteger(gated.metrics.revenue_kept_cents));
});

test("raising the retention mandate to 30% and offering 20% costs more discount per customer kept", () => {
  const r = compare(world, policy, { agent: "retention", max_discount_percent: 30, proposal_percent: 20 });
  const per = (m) => m.discount_cost_cents / m.saved;
  assert.ok(r.candidate.metrics.saved > 0);
  assert.ok(per(r.candidate.metrics) > per(r.baseline.metrics));
  assert.equal(r.candidate.metrics.violations, 0, "inside the raised mandate");
});

test("a 15% proposal floods people with approvals and is rejected for that reason", () => {
  const run = runScenario(world, policy, { agent: "retention", gate: true, proposal_percent: 15 });
  const c = certify(run, policy);
  assert.equal(c.verdict, "REJECTED");
  assert.ok(c.checks.find((x) => /flooded/.test(x.name)).ok === false);
});

test("a cap of 60 pays more than the credit budget and is rejected for that reason", () => {
  const r = compare(world, policy, { agent: "bill-shock", cap_override: "60.00" });
  assert.equal(r.baseline.certificate.verdict, "CERTIFIED");
  assert.equal(r.candidate.certificate.verdict, "REJECTED");
  assert.ok(r.candidate.certificate.checks.some((x) => !x.ok && /budget/.test(x.name)));
});

// ---- TMF read APIs ----
import { tmfHandle, SPECS, MONTH_LABELS } from "../../twin/lib/tmf.mjs";
const get = (p, q = "") => tmfHandle(world, p, new URLSearchParams(q));

test("TMF678 bills match the rating engine to the cent, and all 12 months are served", () => {
  const i = world.usage.findIndex((u) => u[11][1] >= 600);
  const s = world.subscribers[i];
  const bills = get("678/customerBill", `relatedParty.id=${s.id}`).body;
  assert.equal(bills.length, 12);
  const last = bills[11], r = rateMonth(PLANS[s.plan], world.usage[i][11]);
  assert.equal(last.amountDue.value, money(r.total_cents));
  assert.equal(last.appliedCharge.reduce((a, c) => a + Math.round(parseFloat(c.taxIncludedAmount.value) * 100), 0), r.total_cents);
  assert.equal(get(`678/customerBill/${last.id}`).body.amountDue.value, last.amountDue.value);
});

test("TMF620, 622, 629, 635, 637 answer; unknown ids are 404; a missing party id is 400", () => {
  const id = world.subscribers[7].id;
  assert.ok(get("620/productOffering").body.length >= 28);
  assert.equal(get(`629/customer/${id}`).body.id, id);
  assert.equal(get("635/usage", `relatedParty.id=${id}`).body.length, 12);
  assert.equal(get("637/product", `relatedParty.id=${id}`).body[0].relatedParty[0].id, id);
  assert.equal(get("622/productOrder", `relatedParty.id=${id}`).body[0].state, "completed");
  assert.equal(get("629/customer/NW-1").status, 404);
  assert.equal(get("678/customerBill").status, 400);
  assert.equal(get("999/x").status, 404);
});

test("an OpenAPI spec exists for each of the six APIs", () => {
  for (const n of ["620", "622", "629", "635", "637", "678"]) { assert.ok(SPECS[n].openapi); assert.ok(Object.keys(SPECS[n].paths).length >= 1); assert.equal(get(`openapi/${n}.json`).status, 200); }
  assert.equal(MONTH_LABELS[11], "2026-09");
});

test("the bill-shock population the page reports is the one the agent replays", async () => {
  const { billShockPopulation } = await import("../../twin/lib/scenarios.mjs");
  assert.equal(billShockPopulation(world).length, runScenario(world, policy, { agent: "bill-shock" }).metrics.population);
});

test("today's rules are the same whatever the candidate asks for (so a risky proposal is compared with a healthy baseline)", () => {
  const a = compare(world, policy, { agent: "retention", proposal_percent: 20, gate: false });
  const b = compare(world, policy, { agent: "retention" });
  assert.deepEqual(a.baseline.metrics, b.baseline.metrics);
  assert.equal(a.baseline.certificate.verdict, "CERTIFIED");
  assert.equal(a.candidate.certificate.verdict, "REJECTED");
});
