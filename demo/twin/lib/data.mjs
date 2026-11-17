// Seeded synthetic operator data: 10,000 subscribers x 12 months of usage. Same seed, same data, every time.
// Invented names, invented ids (NW-######). The operator is fictional.
import { mulberry32 } from "../../seed/lib/skills.mjs";

export const MONTHS = 12;
const P = (id, segment, name, fee, gb) => [id, { id, segment, name, fee_cents: fee, included_mb: gb === null ? null : gb * 1024 }];
export const PLANS = Object.fromEntries([
  P("start-5", "prepaid", "Nordwave Start 5 GB", 990, 5), P("start-10", "prepaid", "Nordwave Start 10 GB", 1490, 10),
  P("flex-5", "postpaid", "Nordwave Flex 5 GB", 1990, 5), P("flex-20", "postpaid", "Nordwave Flex 20 GB", 2990, 20),
  P("flex-50", "postpaid", "Nordwave Flex 50 GB", 3990, 50), P("flex-max", "postpaid", "Nordwave Flex Unlimited", 4990, null),
  P("biz-50", "business", "Nordwave Business 50 GB", 4490, 50), P("biz-max", "business", "Nordwave Business Unlimited", 6990, null)
]);
const PLAN_IDS_BY_SEGMENT = { prepaid: ["start-5", "start-10"], postpaid: ["flex-5", "flex-20", "flex-50", "flex-max"], business: ["biz-50", "biz-max"] };

// ~30 catalogue offers: plans, roaming passes, add-ons, retention offers (TMF620 shape is built in tmf.mjs)
export const CATALOGUE = [
  ...Object.values(PLANS).map((p) => ({ id: `plan-${p.id}`, name: p.name, category: "plan", price_cents: p.fee_cents, segment: p.segment })),
  ...[["day", "World Zone 2 day pass", 600], ["week", "World Zone 2 week pass", 2200], ["z3day", "World Zone 3 day pass", 900], ["z3week", "World Zone 3 week pass", 2900]].map(([k, n, c]) => ({ id: `pass-${k}`, name: n, category: "roaming-pass", price_cents: c, segment: "any" })),
  ...[["stream", "Streaming add-on", 590], ["cloud", "Cloud storage 200 GB", 290], ["safe", "Scam protection", 190], ["watch", "Safety watch line", 790], ["extra5", "Extra 5 GB", 490], ["extra20", "Extra 20 GB", 1290]].map(([k, n, c]) => ({ id: `addon-${k}`, name: n, category: "add-on", price_cents: c, segment: "any" })),
  ...[["ret6", "Flex 30 GB, 12 months, loyalty price", 2790], ["ret10", "Flex 20 GB, 10% loyalty discount", 2690], ["ret15", "Flex 50 GB, 15% loyalty discount", 3390], ["retfree", "Streaming free for 3 months", 0]].map(([k, n, c]) => ({ id: `retention-${k}`, name: n, category: "retention-offer", price_cents: c, segment: "postpaid" })),
  ...[["hw1", "Nordic X 256 GB, 24 months", 3300], ["hw2", "Nordic Lite 128 GB, 24 months", 1700], ["hw3", "Nordic Pro 512 GB, 36 months", 4100], ["sim", "eSIM activation", 0], ["router", "FWA router rental", 500], ["port", "Number porting service", 0]].map(([k, n, c]) => ({ id: `other-${k}`, name: n, category: "other", price_cents: c, segment: "any" }))
];

const FIRST = ["Aino", "Mikael", "Sofia", "Eero", "Helmi", "Lars", "Ingrid", "Matti", "Elsa", "Oskar", "Freja", "Jonas", "Linnea", "Anders", "Saga", "Henrik", "Maja", "Tuomas", "Alma", "Viktor"];
const LAST = ["Virtanen", "Laine", "Lindqvist", "Salonen", "Koskinen", "Nilsson", "Berg", "Korhonen", "Johansson", "Andersen", "Larsen", "Eriksson", "Heikkinen", "Hansen", "Dahl"];
const pick = (r, a) => a[Math.floor(r() * a.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

export function generate({ seed = 20261019, count = 10000 } = {}) {
  const r = mulberry32(seed);
  const subscribers = [], usage = [];
  for (let i = 0; i < count; i++) {
    const x = r();
    const segment = x < 0.25 ? "prepaid" : x < 0.8 ? "postpaid" : "business";
    const plan = PLANS[pick(r, PLAN_IDS_BY_SEGMENT[segment])];
    const w = r();
    subscribers.push({
      id: `NW-${100000 + i}`, name: `${pick(r, FIRST)} ${pick(r, LAST)}`, segment, plan: plan.id, language: pick(r, ["fi", "sv", "en", "no", "da"]),
      tenure_months: int(r, 1, 84), churn_risk: Math.round(r() ** 3.5 * 100) / 100, vulnerable: r() < 0.03, identity_verified: r() < 0.94,
      credits_last_12m: w < 0.8 ? 0 : w < 0.94 ? 1 : 2, marketing_consent: r() < 0.6, accept_draw: r()
    });
    const incl = plan.included_mb ?? 40 * 1024;
    const shock = segment !== "prepaid" && r() < 0.03;                       // seeded bill-shock situation, latest month
    const months = [];
    for (let m = 0; m < MONTHS; m++) {
      const data = Math.round(incl * (0.3 + r() * (r() < 0.12 ? 1.0 : 0.7)));
      const spike = m === MONTHS - 1 && shock;
      const roam = spike ? int(r, 600, 3200) : r() < 0.005 ? int(r, 100, 600) : 0;
      months.push([data, roam, roam > 0 ? (spike ? (r() < 0.5 ? 2 : 3) : 2) : 1, r() < 0.01 ? int(r, 1, 4) : 0]);
    }
    usage.push(months);
  }
  return { seed, subscribers, usage };
}
