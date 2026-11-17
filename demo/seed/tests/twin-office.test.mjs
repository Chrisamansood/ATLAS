import { test } from "node:test";
import assert from "node:assert/strict";
import { generate, PLANS } from "../../twin/lib/data.mjs";
import { rateMonth } from "../../twin/lib/rating.mjs";
import { customerRecord, cdrs, dashboard, listCustomers, msisdn, parseMsisdn, allocate, tmf676 } from "../../twin/lib/records.mjs";

const world = generate();
const sample = [0, 1, 7, 99, 1234, 5000, 9999].map((i) => world.subscribers[i].id);

test("allocate always adds up exactly", () => {
  for (const [t, w] of [[100, [1, 1, 1]], [7, [3, 3, 3, 3]], [54000, [0.3, 0.9, 0.5, 0.2]], [0, [1, 2]]]) assert.equal(allocate(t, w).reduce((a, b) => a + b, 0), t);
});

test("phone numbers are unique and reversible", () => {
  assert.equal(new Set(world.subscribers.map((_, i) => msisdn(i))).size, 10000);
  for (const i of [0, 1, 4321, 9999]) assert.equal(parseMsisdn(msisdn(i), 10000), i);
  assert.equal(parseMsisdn("+358 40 100 0001", 10000), null);
});

test("records are deterministic and do not change the world", () => {
  const before = JSON.stringify(world.subscribers.slice(0, 20));
  const a = customerRecord(world, sample[3]), b = customerRecord(generate(), sample[3]);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(world.subscribers.slice(0, 20)), before);
  assert.equal(customerRecord(world, "NW-1"), null);
});

test("invoice lines sum to the total, and the total is what the rating engine says", () => {
  for (const id of sample) {
    const rec = customerRecord(world, id), i = world.subscribers.findIndex((s) => s.id === id);
    assert.equal(rec.bills.length, 12);
    rec.bills.forEach((b, m) => { assert.equal(b.lines.reduce((a, l) => a + l.cents, 0), b.total_cents); assert.equal(b.total_cents, rateMonth(PLANS[rec.subscription.plan_id], world.usage[i][m]).total_cents); });
  }
});

test("payments equal the bills they pay; an overdue bill has no successful payment; balance is the overdue total", () => {
  for (const id of sample.concat(world.subscribers.slice(0, 300).map((s) => s.id))) {
    const rec = customerRecord(world, id);
    for (const b of rec.bills) {
      const pays = rec.payments.filter((p) => p.bill_id === b.id), ok = pays.filter((p) => p.status === "succeeded");
      assert.ok(pays.every((p) => p.amount_cents === b.total_cents));
      if (b.status === "overdue") assert.equal(ok.length, 0); else assert.equal(ok.length, 1, `${b.id} ${b.status}`);
      if (b.status === "paid late") assert.ok(b.paid_date > b.due);
    }
    assert.equal(rec.account.balance_due_cents, rec.bills.filter((b) => b.status === "overdue").reduce((a, b) => a + b.total_cents, 0));
    assert.equal(rec.flags.overdue, rec.bills[11].status === "overdue");
    assert.equal(rec.credits.length, rec.account.credits_last_12m);
  }
});

test("CDRs add up to the monthly usage and to the rated roaming charge", () => {
  const spike = world.subscribers.findIndex((s, i) => s.segment !== "prepaid" && world.usage[i][11][1] >= 600);
  for (const i of [0, 5, 4321, spike]) for (const m of [0, 11]) {
    const c = cdrs(world, i, m), [data, roam, , sms] = world.usage[i][m];
    assert.equal(c.summary.data_mb, data); assert.equal(c.summary.roaming_mb, roam); assert.equal(c.summary.premium_sms, sms);
    const bill = rateMonth(PLANS[world.subscribers[i].plan], world.usage[i][m]);
    const roamLine = bill.lines.find((l) => l.kind === "roaming")?.cents ?? 0;
    assert.equal(c.rows.filter((x) => x.type === "roaming data").reduce((a, x) => a + x.charge_cents, 0), roamLine);
  }
  assert.deepEqual(cdrs(world, spike, 11), cdrs(world, spike, 11));
});

test("dashboard totals agree with the rated bills and the customer list", () => {
  const d = dashboard(world);
  assert.equal(d.customers, 10000);
  assert.equal(Object.values(d.by_segment).reduce((a, g) => a + g.customers, 0), 10000);
  assert.equal(d.billed_by_month[11].total_cents, d.latest_billed_cents);
  assert.equal(d.latest_billed_cents, Object.values(d.by_segment).reduce((a, g) => a + g.billed_cents, 0));
  assert.equal(listCustomers(world, { flag: "overdue", size: 1 }).total, d.overdue.customers);
  assert.equal(listCustomers(world, { flag: "shock", size: 1 }).total, d.bill_shock_cases);
  assert.ok(d.overdue.customers > 100 && d.overdue.customers < 1500);
});

test("search by id, name and phone; filters and paging work", () => {
  const s = world.subscribers[4321];
  assert.equal(listCustomers(world, { q: s.id }).rows[0].id, s.id);
  assert.equal(listCustomers(world, { q: msisdn(4321) }).rows[0].id, s.id);
  assert.ok(listCustomers(world, { q: s.name.split(" ")[1].toLowerCase() }).rows.some((r) => r.id === s.id) || listCustomers(world, { q: s.name.split(" ")[1].toLowerCase() }).pages > 1);
  const biz = listCustomers(world, { segment: "business", size: 10 });
  assert.ok(biz.rows.every((r) => r.segment === "business") && biz.rows.length === 10);
  assert.notEqual(listCustomers(world, { page: 2 }).rows[0].id, listCustomers(world, { page: 1 }).rows[0].id);
  assert.equal(listCustomers(world, { page: 999999 }).page, listCustomers(world, {}).pages);
});

test("TMF676 payments match the record, one by one, and unknown ids are 404", () => {
  const id = sample[4], rec = customerRecord(world, id);
  const list = tmf676(world, "676/payment", new URLSearchParams(`relatedParty.id=${id}`)).body;
  assert.equal(list.length, rec.payments.length);
  const one = tmf676(world, `676/payment/${rec.payments[0].id}`, new URLSearchParams()).body;
  assert.equal(one.amount.value, (rec.payments[0].amount_cents / 100).toFixed(2));
  assert.equal(tmf676(world, "676/payment/PAY-999-x", new URLSearchParams()).status, 404);
  assert.equal(tmf676(world, "676/payment", new URLSearchParams()).status, 400);
});
