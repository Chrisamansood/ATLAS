import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { generate } from "../../twin/lib/data.mjs";
import { customerRecord } from "../../twin/lib/records.mjs";
import { createSandbox } from "../../twin/lib/overlay.mjs";
import { streamEvent, explainLine } from "../../twin/lib/live.mjs";
import { createMcp, loadAgentTokens, TOOLS } from "../../twin/lib/mcp.mjs";
import { creditDecision } from "../../seed/lib/skills.mjs";

const world = generate(), policy = JSON.parse(readFileSync(new URL("../../skills/policy-values.json", import.meta.url), "utf8"));
const shock = (() => { for (const s of world.subscribers) { const r = customerRecord(world, s.id); if (r.flags.bill_shock && !r.flags.vulnerable && r.flags.identity_verified && s.credits_last_12m === 0 && r.segment === "postpaid") return s.id; } })();
const rpc = (m, method, params, token) => m.handle({ jsonrpc: "2.0", id: 1, method, params }, token ? `Bearer ${token}` : "");

test("a credit within the gate is granted, shows as an overlay credit note and closes the billing case; the seed record is unchanged", () => {
  const sb = createSandbox(), before = JSON.stringify(customerRecord(world, shock));
  const r = sb.grantCredit(world, policy, { agent: "credit-guard-agent", customer: shock, amount: "20.00" });
  assert.equal(r.decision, "grant"); assert.equal(r.clause, "§3.1");
  const rec = sb.mergeRecord(customerRecord(world, shock));
  assert.equal(rec.overlay, true);
  assert.equal(rec.credits.filter((c) => c.overlay).length, 1);
  assert.equal(rec.credits.find((c) => c.overlay).amount_cents, 2000);
  assert.equal(rec.cases.find((c) => c.category === "billing").status, "closed");
  assert.equal(rec.account.credits_last_12m, customerRecord(world, shock).account.credits_last_12m + 1);
  assert.equal(JSON.stringify(customerRecord(world, shock)), before);
});

test("a credit above the cap is queued for approval: no credit note, case awaiting approval", () => {
  const sb = createSandbox();
  const r = sb.grantCredit(world, policy, { agent: "credit-guard-agent", customer: shock, amount: "200.00" });
  assert.equal(r.decision, "needs-approval"); assert.equal(r.clause, "§3.2");
  const rec = sb.mergeRecord(customerRecord(world, shock));
  assert.equal(rec.credits.filter((c) => c.overlay).length, 0);
  assert.equal(rec.cases.find((c) => c.category === "billing").status, "awaiting approval");
  assert.equal(sb.state().approvals.length, 1);
});

test("the sandbox decision always equals the gate code for the same customer", () => {
  const sb = createSandbox();
  for (const id of [world.subscribers[3].id, world.subscribers[77].id, world.subscribers[1500].id, shock]) for (const amt of ["5.00", "25.00", "60.00"]) {
    const s = world.subscribers.find((x) => x.id === id), rule = creditDecision(policy, { segment: s.segment, tenure_months: s.tenure_months, requested: amt, credits_last_12m: s.credits_last_12m, identity_verified: s.identity_verified, vulnerable: s.vulnerable });
    const fresh = createSandbox(), r = fresh.grantCredit(world, policy, { agent: "a", customer: id, amount: amt });
    assert.equal(r.decision, rule.decision); assert.equal(r.clause, rule.clause);
  }
  assert.ok(sb);
});

test("idempotency key, bad input and reset", () => {
  const sb = createSandbox();
  const a = sb.grantCredit(world, policy, { agent: "x", customer: shock, amount: "10.00", key: "job-1" }), b = sb.grantCredit(world, policy, { agent: "x", customer: shock, amount: "10.00", key: "job-1" });
  assert.equal(b.duplicate, true); assert.equal(sb.state().credits, 1); assert.equal(a.credit_note, b.credit_note);
  assert.equal(sb.grantCredit(world, policy, { agent: "x", customer: "NW-1", amount: "1" }).ok, false);
  for (const bad of ["-5", "abc", "0", "999999"]) assert.equal(sb.grantCredit(world, policy, { agent: "x", customer: shock, amount: bad }).ok, false);
  sb.reset(); assert.equal(sb.state().credits, 0); assert.equal(sb.mergeRecord(customerRecord(world, shock)).overlay, undefined);
});

test("the overlay persists to a file and loads back", () => {
  const file = `${mkdtempSync(`${tmpdir()}/twin-`)}/overlay.json`;
  const a = createSandbox({ file }); a.grantCredit(world, policy, { agent: "x", customer: shock, amount: "10.00" });
  assert.ok(existsSync(file)); assert.equal(createSandbox({ file }).state().credits, 1);
});

test("the event stream is deterministic and complete", () => {
  for (const n of [0, 1, 4, 7, 96, 193, 500]) { const e = streamEvent(world, n); assert.deepEqual(e, streamEvent(generate(), n)); assert.ok(e.kind && e.text); }
  assert.equal(streamEvent(world, 96).kind, "bill.issued");
  assert.equal(streamEvent(world, 0).customer, streamEvent(world, 1).customer);
});

test("explain: every line of sampled bills recomputes to its amount", () => {
  for (const id of [world.subscribers[0].id, world.subscribers[500].id, shock]) {
    const rec = customerRecord(world, id);
    for (const b of rec.bills) b.lines.forEach((l, i) => { const x = explainLine(world, policy, id, b.period, i); assert.equal(x.matches, true, `${id} ${b.period} ${l.item}`); assert.equal(x.amount_cents, l.cents); });
  }
  const roam = customerRecord(world, shock).bills[11].lines.findIndex((l) => l.kind === "roaming");
  assert.match(explainLine(world, policy, shock, "2026-09", roam).credit_rule, /goodwill-credit-policy/);
  assert.ok(explainLine(world, policy, shock, "2026-09", 99).error);
});

test("MCP: initialize, list, call with identity; unknown token refused and logged", () => {
  const sb = createSandbox(), tokens = { "credit-guard-agent": "tw_a", "bill-shock-agent": "tw_b" }, m = createMcp({ world, policy, sandbox: sb, tokens });
  assert.equal(rpc(m, "initialize", { protocolVersion: "2025-06-18" }).body.result.serverInfo.name, "atlas-twin");
  assert.equal(rpc(m, "tools/list", {}, "").status, 401);
  assert.equal(rpc(m, "tools/list", {}, "nope").status, 401);
  assert.deepEqual(rpc(m, "tools/list", {}, "tw_a").body.result.tools.map((t) => t.name), TOOLS.map((t) => t.name));
  const r = rpc(m, "tools/call", { name: "grant_credit", arguments: { customer: shock, amount: "20.00", key: "k" } }, "tw_a").body.result;
  assert.equal(r.isError, false); assert.equal(r.structuredContent.decision, "grant");
  const dry = rpc(m, "tools/call", { name: "propose_credit", arguments: { customer: shock, amount: "200" } }, "tw_b").body.result.structuredContent;
  assert.equal(dry.dry_run, true); assert.equal(dry.decision, "needs-approval"); assert.equal(sb.state().credits, 1);
  const bad = rpc(m, "tools/call", { name: "grant_credit", arguments: { customer: shock, amount: "5" } }, "stolen");
  assert.equal(bad.status, 401);
  const calls = sb.state().calls;
  assert.equal(calls[0].agent, "unknown"); assert.equal(calls[0].ok, false);
  assert.ok(calls.some((c) => c.agent === "credit-guard-agent" && c.tool === "grant_credit" && c.clause === "§3.1"));
  assert.equal(rpc(m, "tools/call", { name: "nope", arguments: {} }, "tw_a").body.error.code, -32602);
  assert.equal(rpc(m, "tools/call", { name: "get_bill", arguments: { customer: "NW-1" } }, "tw_a").body.result.isError, true);
});

test("agent tokens are created once and reused", () => {
  const file = `${mkdtempSync(`${tmpdir()}/twin-`)}/t.json`;
  const a = loadAgentTokens(file), b = loadAgentTokens(file);
  assert.deepEqual(a, b); assert.match(a["credit-guard-agent"], /^tw_[0-9a-f]{36}$/);
});

test("a person can release a held credit: credit note names the approver, case closes, a second approval is refused", () => {
  const sb = createSandbox();
  const held = sb.grantCredit(world, policy, { agent: "credit-guard-agent", customer: shock, amount: "200.00" });
  assert.equal(held.decision, "needs-approval");
  const r = sb.approve(world, { approval: held.approval, by: "Care Lead" });
  assert.equal(r.ok, true); assert.equal(r.amount_cents, 20000);
  const rec = sb.mergeRecord(customerRecord(world, shock));
  assert.match(rec.credits.find((c) => c.overlay).approved_by, /Care Lead/);
  assert.equal(rec.cases.find((c) => c.category === "billing").status, "closed");
  assert.equal(sb.approve(world, { approval: held.approval }).ok, false);
  assert.equal(sb.approve(world, { approval: "APR-99" }).ok, false);
});
