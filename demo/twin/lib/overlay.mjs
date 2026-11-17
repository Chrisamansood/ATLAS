// Sandbox overlay for the twin: what agents did, kept apart from the seeded world. The seed is never edited; the overlay is merged
// into a customer record on read and "reset" deletes it. Credits go through the same gate code the skills cite; no model computes money.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { creditDecision } from "../../seed/lib/skills.mjs";
import { money, toCents } from "./rating.mjs";
import { customerRecord, AS_OF } from "./records.mjs";

const blank = () => ({ seq: 0, events: [], credits: [], approvals: [], caseUpdates: {}, extraCases: [], calls: [], keys: {} });
const MAX_CENTS = 1_000_000;

export function createSandbox({ file = null, now = () => new Date().toISOString() } = {}) {
  let st = blank();
  if (file && existsSync(file)) { try { st = { ...blank(), ...JSON.parse(readFileSync(file, "utf8")) }; } catch { st = blank(); } }
  const save = () => { if (!file) return; mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(st)); };
  const emit = (kind, customer, text, extra = {}) => { const e = { seq: ++st.seq, at: now(), kind, customer, text, ...extra }; st.events.push(e); return e; };

  function log(call) { const c = { id: st.calls.length + 1, at: now(), ...call }; st.calls.push(c); if (st.calls.length > 500) st.calls.shift(); save(); return c; }

  function grantCredit(world, policy, { agent, customer, amount, reason = "Goodwill credit", key = null }) {
    if (key && st.keys[key]) return { ...st.keys[key], duplicate: true };
    const rec = customerRecord(world, customer);
    if (!rec) return { ok: false, error: `no such customer ${customer}` };
    const cents = toCents(amount);
    if (!Number.isFinite(cents) || cents <= 0 || cents > MAX_CENTS) return { ok: false, error: "amount must be a positive EUR amount up to 10000.00" };
    const s = world.subscribers.find((x) => x.id === customer);
    const mine = st.credits.filter((c) => c.customer === customer).length;
    const rule = creditDecision(policy, { segment: s.segment, tenure_months: s.tenure_months, requested: money(cents), credits_last_12m: s.credits_last_12m + mine, identity_verified: s.identity_verified, vulnerable: s.vulnerable });
    const digits = customer.slice(3);
    const base = rec.cases.find((c) => c.category === "billing" && c.status === "open");
    const caseId = base?.id ?? `CASE-${digits}-A${st.extraCases.length + 1}`;
    if (!base && !st.extraCases.some((c) => c.id === caseId)) st.extraCases.push({ id: caseId, opened: AS_OF, category: "billing", subject: "Goodwill credit request", status: "open", owner: agent, overlay: true });
    const upd = (status, note) => { st.caseUpdates[caseId] = { status, note, by: agent, at: now() }; };
    let out;
    if (rule.decision === "grant") {
      const note = { id: `CRN-${digits}-S${st.credits.length + 1}`, customer, date: AS_OF, kind: "Goodwill credit", reason, amount_cents: cents, approved_by: `${agent}, within mandate (${rule.clause})`, refunded_to: rec.account.payment_method, agent, overlay: true };
      st.credits.push(note); upd("closed", `Credited EUR ${money(cents)} by ${agent}`);
      emit("credit.granted", customer, `${customer} credit note ${note.id} EUR ${money(cents)} by ${agent} (${rule.clause})`, { cents, agent });
      emit("case.updated", customer, `${caseId} closed, credited`, { agent });
      out = { ok: true, decision: "grant", clause: rule.clause, cap: rule.cap, credit_note: note.id, amount_cents: cents, case_id: caseId };
    } else if (rule.decision === "needs-approval") {
      const ap = { id: `APR-${st.approvals.length + 1}`, customer, amount_cents: cents, clause: rule.clause, agent, status: "pending", at: now() };
      st.approvals.push(ap); upd("awaiting approval", `EUR ${money(cents)} held for Care Lead (${rule.clause})`);
      emit("credit.queued", customer, `${customer} EUR ${money(cents)} held for Care Lead approval (${rule.clause})`, { cents, agent });
      emit("case.updated", customer, `${caseId} awaiting approval`, { agent });
      out = { ok: true, decision: "needs-approval", clause: rule.clause, cap: rule.cap, approval: ap.id, amount_cents: cents, case_id: caseId };
    } else {
      upd("open", `Credit request ${rule.decision} (${rule.clause})`);
      emit("credit.refused", customer, `${customer} credit EUR ${money(cents)} ${rule.decision} (${rule.clause})`, { cents, agent });
      out = { ok: true, decision: rule.decision, clause: rule.clause, amount_cents: cents, case_id: caseId };
    }
    if (key) st.keys[key] = out;
    save();
    return out;
  }

  // A person (Care Lead) releases a credit the gate held. The only way past the cap; the credit note names the approver.
  function approve(world, { approval, by = "Care Lead" }) {
    const ap = st.approvals.find((a) => a.id === approval);
    if (!ap) return { ok: false, error: `no such approval ${approval}` };
    if (ap.status !== "pending") return { ok: false, error: `${approval} is already ${ap.status}` };
    const rec = customerRecord(world, ap.customer), digits = ap.customer.slice(3);
    const caseId = Object.keys(st.caseUpdates).find((id) => id.startsWith(`CASE-${digits}-`) && st.caseUpdates[id].status === "awaiting approval");
    const note = { id: `CRN-${digits}-S${st.credits.length + 1}`, customer: ap.customer, date: AS_OF, kind: "Goodwill credit", reason: "Approved by Care Lead", amount_cents: ap.amount_cents, approved_by: `${by}, released ${ap.id} (${ap.clause})`, refunded_to: rec.account.payment_method, agent: ap.agent, overlay: true };
    st.credits.push(note); ap.status = "approved"; ap.by = by;
    if (caseId) st.caseUpdates[caseId] = { status: "closed", note: `Credited EUR ${money(ap.amount_cents)}, approved by ${by}`, by, at: now() };
    emit("credit.granted", ap.customer, `${ap.customer} credit note ${note.id} EUR ${money(ap.amount_cents)} approved by ${by} (${ap.id})`, { cents: ap.amount_cents, agent: by });
    save();
    return { ok: true, decision: "approved", approval: ap.id, credit_note: note.id, amount_cents: ap.amount_cents, case_id: caseId ?? null };
  }

  // The customer record as the back office should see it: seed plus what agents did.
  function mergeRecord(rec) {
    const credits = st.credits.filter((c) => c.customer === rec.id), cases = st.extraCases.filter((c) => c.id.startsWith(`CASE-${rec.id.slice(3)}-`));
    const touched = rec.cases.some((c) => st.caseUpdates[c.id]);
    if (!credits.length && !cases.length && !touched) return rec;
    const out = structuredClone(rec);
    out.credits = [...out.credits, ...credits].sort((a, b) => a.date.localeCompare(b.date));
    out.account.credits_last_12m += credits.length;
    out.cases = [...out.cases, ...cases].map((c) => { const u = st.caseUpdates[c.id]; return u ? { ...c, status: u.status, note: u.note, overlay: true } : c; });
    out.overlay = true;
    return out;
  }

  return {
    grantCredit, approve, mergeRecord, log, emit,
    eventsAfter: (seq = 0) => st.events.filter((e) => e.seq > seq),
    state: () => ({ seq: st.seq, credits: st.credits.length, granted_cents: st.credits.reduce((a, c) => a + c.amount_cents, 0), approvals: st.approvals, calls: [...st.calls].reverse().slice(0, 100), events: st.events.length }),
    reset: () => { st = blank(); save(); },
  };
}
