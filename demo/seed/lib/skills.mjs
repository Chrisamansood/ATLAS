// Skill-pack generator (P0-21 step 2). Pure: no network, no file writes here (scripts/gen-skills.mjs writes).
// Every number comes from skills/policy-values.json; every decision in a golden case comes from a rule function below,
// never from a model. Same seed -> same bytes.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const sid = (r) => `NW-${String(int(r, 100000, 999999))}`;
const cents = (s) => Math.round(parseFloat(s) * 100);
const eur = (s) => `EUR ${s}`;

// ---------- rule functions (exported so tests and the Sim gate can reuse them) ----------
export const tenureBand = (m) => (m < 12 ? "0-11" : m < 36 ? "12-35" : "36+");

export function creditDecision(p, c) {
  const g = p.goodwill_credit;
  if (!c.identity_verified) return { decision: "refuse", clause: "§2.1" };
  if (c.vulnerable) return { decision: "hand-to-human", clause: "§2.2" };
  if (c.credits_last_12m >= g.max_credits_per_12_months) return { decision: "needs-approval", clause: "§4.1" };
  const cap = g.cap_table[c.segment][tenureBand(c.tenure_months)];
  return cents(c.requested) <= cents(cap) ? { decision: "grant", clause: "§3.1", cap } : { decision: "needs-approval", clause: "§3.2", cap };
}

export function retentionDecision(p, c) {
  const r = p.retention;
  if (c.discount_percent > r.max_discount_percent) return { decision: "needs-approval", clause: "§3.1", allowed: r.max_discount_percent };
  const allowed = [...r.ladder].reverse().find((s) => c.churn_risk >= s.min_risk).max_discount_percent;
  if (allowed === 0) return { decision: "no-offer", clause: "§2.1", allowed };
  return c.discount_percent <= allowed ? { decision: "release", clause: "§2.2", allowed } : { decision: "needs-approval", clause: "§2.3", allowed };
}

export function outageDecision(p, c) {
  const comp = p.outage.compensation[c.severity];
  const channels = p.outage.channels[c.severity];
  if (!comp) return { channels, compensation: "none", clause: "§2.3" };
  return c.duration_hours >= comp.min_hours ? { channels, compensation: comp.credit, clause: "§2.1" } : { channels, compensation: "none", clause: "§2.2" };
}

export const inQuiet = (p, h) => h >= p.consent.quiet_hours_start || h < p.consent.quiet_hours_end;
export function consentDecision(p, c) {
  const timed = c.channel === "sms" || c.channel === "call";
  if (c.purpose === "marketing" && !c.consent[c.channel]) return { decision: "block-no-consent", clause: "§2.1" };
  if (timed && inQuiet(p, c.local_hour)) return { decision: "defer-quiet-hours", clause: "§3.1" };
  return { decision: "allow", clause: c.purpose === "service" ? "§2.2" : "§2.3" };
}

export function costDecision(p, c) {
  const base = p.cost.tiers[c.task];
  if (c.spend_percent > p.cost.block_above_percent) return { action: "block", tier: "none", clause: "§3.2" };
  const order = ["small", "medium", "large"];
  if (c.spend_percent > p.cost.downgrade_above_percent) return { action: "downgrade", tier: order[Math.max(0, order.indexOf(base) - 1)], clause: "§3.1" };
  return { action: "route", tier: base, clause: "§2.1" };
}

const STEPS = ["payment", "number", "esim", "activation"];
const STEP_OWNER = { payment: "collections", number: "number-porting", esim: "esim-provisioning", activation: "order-activation" };
export function orderDecision(p, c) {
  const done = c.events.length; // events completed in STEPS order
  if (done >= STEPS.length) return { status: "complete", stuck_at: "none", owner: "none", clause: "§2.1" };
  const step = STEPS[done];
  return c.hours_since_last_event >= p.orders.stuck_after_hours[step]
    ? { status: "stuck", stuck_at: step, owner: STEP_OWNER[step], clause: "§2.2" }
    : { status: "in-progress", stuck_at: "none", owner: "none", clause: "§2.3" };
}

const SEVERITY = { high: { high: "critical", medium: "high", low: "medium" }, medium: { high: "high", medium: "medium", low: "low" }, low: { high: "medium", medium: "low", low: "info" } };
export const auditSeverity = (c) => ({ severity: SEVERITY[c.impact][c.likelihood], clause: "§2.1" });

// complaint triage: category by keyword, priority by rule, owner by category
const CATEGORIES = {
  billing: { owner: "dispute-resolver", phrases: ["my bill is much higher than usual", "I was charged twice this month", "there is a roaming charge I did not expect", "the credit you promised is missing", "an extra fee appeared on my invoice"] },
  network: { owner: "fault-triage", phrases: ["I have had no signal at home for two days", "data is very slow in the evenings", "calls keep dropping on my street", "I cannot get any service since this morning", "the 5G icon shows but nothing loads"] },
  device: { owner: "plan-advisor", phrases: ["my new phone will not activate", "the eSIM profile will not install", "the handset I received is the wrong colour", "my instalment plan shows the wrong phone", "the replacement SIM never arrived"] },
  contract: { owner: "retention", phrases: ["I want to leave and the exit fee seems wrong", "nobody told me about the price rise", "my contract end date is not what I was told", "I want to change my plan without a new commitment", "a rival offered me a better deal"] }
};
export function complaintDecision(c) {
  const t = c.text.toLowerCase();
  const category = Object.entries(CATEGORIES).find(([, v]) => v.phrases.some((ph) => t.includes(ph.toLowerCase())))?.[0] ?? "other";
  const urgent = /no signal|no service|cannot get any service|vulnerab/.test(t) || c.vulnerable;
  const priority = urgent ? "P1" : category === "billing" || category === "network" ? "P2" : "P3";
  return { category, priority, owner: category === "other" ? "complaints-triage" : CATEGORIES[category].owner, clause: urgent ? "§2.1" : "§2.2" };
}

// ---------- clause rendering ----------
const clauseMd = (title, intro, sections) => {
  const out = [`# ${title}`, "", intro, ""];
  for (const s of sections) { out.push(`## §${s.n} ${s.title}`, ""); s.clauses.forEach((t, i) => out.push(`§${s.n}.${i + 1} ${t}`, "")); }
  return out.join("\n");
};
const csv = (header, rows) => [header.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n";
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
export const clauseIds = (md) => new Set([...md.matchAll(/^§(\d+\.\d+) /gm)].map((m) => `§${m[1]}`));

// ---------- the skills ----------
