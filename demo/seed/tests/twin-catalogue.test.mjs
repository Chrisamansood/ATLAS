import { test } from "node:test";
import assert from "node:assert/strict";
import { createCatalogue, SEED_OFFERS, CUSTOMERS, churnScore, isSimilar } from "../../twin/lib/catalogue.mjs";

const today = () => "2026-10-28";
const cat = () => createCatalogue({ today });

test("offers are ATLAS_ named, unique and well formed", () => {
  assert.equal(new Set(SEED_OFFERS.map((o) => o.id)).size, SEED_OFFERS.length);
  assert.ok(SEED_OFFERS.length >= 25);
  for (const o of SEED_OFFERS) {
    assert.match(o.id, /^ATL-OFF-\d{3}$/);
    if (o.id !== "ATL-OFF-029") assert.match(o.name, /^ATLAS_/);   // ATL-OFF-029 is the planted naming mismatch
    assert.ok(Number.isInteger(o.price_cents) && o.price_cents > 0);
  }
});

test("similarity rule: 15% price, 25% data, same segment, payment and technology", () => {
  const a = { id: "a", segment: "consumer", payment: "prepaid", technology: "5G", price_cents: 1000, data_gb: 40 };
  assert.ok(isSimilar(a, { ...a, id: "b", price_cents: 1150, data_gb: 50 }));
  assert.ok(!isSimilar(a, { ...a, id: "b", price_cents: 1200 }));
  assert.ok(!isSimilar(a, { ...a, id: "b", data_gb: 55 }));
  assert.ok(!isSimilar(a, { ...a, id: "b", technology: "4G" }));
  assert.ok(isSimilar({ ...a, data_gb: null }, { ...a, id: "b", data_gb: null }));
});

test("find_similar labels MATCH, NEAR and GAP", () => {
  const c = cat();
  assert.equal(c.findSimilar({ segment: "consumer", payment: "prepaid", technology: "5G", price: "9.99", data_gb: 50 }).label, "MATCH");
  assert.equal(c.findSimilar({ segment: "consumer", payment: "prepaid", technology: "5G", price: "10.99", data_gb: 45 }).label, "NEAR");
  assert.equal(c.findSimilar({ segment: "consumer", payment: "prepaid", technology: "5G", price: "9.99", data_gb: 100 }).label, "GAP");
});

test("the planted drafts give PASS, BLOCK, FIX and a duplicate BLOCK", () => {
  const c = cat(), v = (id) => c.validateOffer({ offer: id });
  assert.equal(v("ATL-OFF-026").verdict, "PASS");
  assert.equal(v("ATL-OFF-027").verdict, "BLOCK");
  assert.ok(v("ATL-OFF-027").findings.some((f) => f.field === "currency"));
  assert.equal(v("ATL-OFF-028").verdict, "FIX");
  assert.ok(v("ATL-OFF-028").findings.some((f) => f.check === "compliance" && f.field === "validity"));
  const spring = v("ATL-OFF-029");
  assert.equal(spring.verdict, "BLOCK");
  assert.ok(spring.findings.some((f) => f.check === "duplication" && /ATL-OFF-013/.test(f.issue)));
  assert.ok(spring.findings.some((f) => f.field === "name"));
});

test("roaming add-on without roaming terms blocks; wrong add-on technology blocks", () => {
  const c = cat(), base = { name: "ATLAS_4G_Postpaid_60GB_Travel", description: "x", segment: "consumer", payment: "postpaid", technology: "4G", price: "16.99", currency: "EUR", validity: "monthly", data_gb: 60, minutes: "unlimited", sms: "unlimited", activation_fee: "0", start_date: "2026-12-01" };
  assert.equal(c.validateOffer(base).verdict, "PASS");
  assert.ok(c.validateOffer({ ...base, addons: ["ATL-ADD-03"] }).findings.some((f) => f.field === "roaming_terms"));
  assert.ok(c.validateOffer({ ...base, addons: ["ATL-ADD-07"] }).findings.some((f) => f.check === "compatibility"));
});

test("create_draft_offer saves a DRAFT, refuses BLOCK, is idempotent, and the Governor sees it", () => {
  const c = cat();
  const spec = { name: "ATLAS_5G_Prepaid_100GB", description: "100 GB 5G prepaid", segment: "consumer", payment: "prepaid", technology: "5G", price: "7.99", currency: "EUR", validity: "monthly", data_gb: 100, minutes: "unlimited", sms: "unlimited", activation_fee: "0", start_date: "2026-12-01", key: "k1" };
  const r = c.createDraftOffer(spec, "product-configurator");
  assert.equal(r.created, true); assert.equal(r.status, "draft"); assert.equal(r.approval, "pending");
  assert.equal(c.createDraftOffer(spec).id, r.id);
  assert.equal(c.createDraftOffer({ ...spec, key: "k2", currency: null }).created, false);
  assert.ok(c.listOffers({ status: "draft" }).some((o) => o.id === r.id));
  const rel = c.requestRelease({ offer: r.id }, "catalog-governor");
  assert.equal(rel.released, true); assert.match(rel.ticket, /^REL-20261028-\d{3}$/);
  assert.equal(c.requestRelease({ offer: "ATL-OFF-027" }).released, false);
  c.reset(); assert.equal(c.listOffers({ status: "draft" }).length, 4);
});

test("portfolio analysis finds the planted duplicates, dead offers and outliers", () => {
  const p = cat().analysePortfolio(), by = Object.fromEntries(p.offers.map((o) => [o.id, o]));
  assert.ok(by["ATL-OFF-005"].duplicate_of.includes("ATL-OFF-002"));
  assert.ok(by["ATL-OFF-006"].duplicate_of.includes("ATL-OFF-002"));
  assert.ok(by["ATL-OFF-007"].worse_value_than.includes("ATL-OFF-002"));
  assert.ok(by["ATL-OFF-017"].worse_value_than.includes("ATL-OFF-018"));
  for (const id of ["ATL-OFF-010", "ATL-OFF-011", "ATL-OFF-021"]) assert.equal(by[id].dead, true);
  assert.ok(!p.offers.some((o) => o.status === "draft"));
  const m = cat().migrationImpact({ moves: [{ from: "ATL-OFF-005", to: "ATL-OFF-002" }, { from: "ATL-OFF-009", to: "ATL-OFF-001" }] });
  assert.equal(m.subscribers_migrated, 18000 + 9800);
  assert.equal(m.monthly_revenue_delta, "-18800.00");   // 18,000 x -0.50 + 9,800 x -1.00
});

test("price scenarios use the spec formulas and pick a qualifying price", () => {
  const r = cat().priceScenarios({ offer: "ATL-OFF-002" });
  assert.deepEqual(r.scenarios.map((s) => s.label), ["LOW", "BASE", "HIGH"]);
  const base = r.scenarios[1];
  // cost per sub = 2.00 + min(50 x 40%, 50) x 0.25 = 7.00; margin 9.99 - 7.00 = 2.99
  assert.equal(r.working.cost_per_sub, "7.00");
  assert.equal(base.margin_per_sub, "2.99");
  assert.equal(base.subscribers, 148000);
  assert.ok(r.assumed.includes("price elasticity -1.2"));
  assert.ok(!r.assumed.some((a) => a.startsWith("base subscribers")));   // the twin knows the subscriber count
  const n = cat().priceScenarios({ price: "9.99", data_gb: "100GB", segment: "consumer", payment: "prepaid", technology: "5G" });
  assert.equal(n.current, "new"); assert.ok(n.assumed.includes("base subscribers 100,000"));
});

test("Retainer answer key holds on the customer base", () => {
  const high = CUSTOMERS.filter((c) => churnScore(c).band === "HIGH").map((c) => c.id);
  assert.deepEqual(high, ["C02", "C05", "C09", "C14", "C17"]);
  const ins = cat().customerInsights();
  assert.equal(ins.subscribers, 100000);
  const up = Object.fromEntries(ins.upsell.map((u) => [u.id, u.moves.map((m) => m.target)]));
  assert.deepEqual(Object.keys(up).sort(), ["C01", "C03", "C04", "C06", "C08", "C12", "C15", "C16", "C20"]);
  assert.deepEqual(up.C20, ["ATLAS_5G_Prepaid_Unlimited"]);
  assert.deepEqual(up.C03, ["ATLAS_Addon_Roam_Europe_Unlimited"]);
  assert.equal(cat().explainCustomer({ customer: "C02" }).score, 120);
});

test("market scan: filed by the Supervisor, unsourced prices stored as unverified, latest per market", () => {
  const c = cat();
  assert.equal(c.getMarketScan().found, false);
  const r = c.saveMarketScan({ market: "United Kingdom", segment: "consumer prepaid", competitors: [
    { operator: "BrandA", country: "United Kingdom", plan: "5G 100GB", price: "10.00", currency: "GBP", source: "https://example.org/a", date: "2026-10-28" },
    { operator: "BrandB", country: "United Kingdom", plan: "5G 50GB", price: "8.00", currency: "GBP" }] }, "competitor-supervisor");
  assert.equal(r.saved, true); assert.equal(r.unverified, 1);
  const s = c.getMarketScan({ market: "kingdom" });
  assert.equal(s.competitors[1].price, "unverified");
  assert.equal(s.by, "competitor-supervisor");
  assert.throws(() => c.saveMarketScan({ market: "X", competitors: [] }));
  c.reset(); assert.equal(c.getMarketScan().found, false);
});

test("the Product Catalogue view (P0-31) carries lifecycle, verdicts and agent drafts", () => {
  const c = createCatalogue({ today: () => "2026-10-28" });
  let v = c.view();
  assert.equal(v.summary.drafts, 4); assert.equal(v.summary.retired, 3);
  const by = Object.fromEntries(v.offers.map((o) => [o.id, o]));
  assert.equal(by["ATL-OFF-010"].lifecycle, "retired");   // still "active" but end-dated
  assert.equal(by["ATL-OFF-026"].verdict, "PASS"); assert.equal(by["ATL-OFF-027"].verdict, "BLOCK");
  const d = c.createDraftOffer({ name: "ATLAS_5G_Prepaid_100GB", description: "x", segment: "consumer", payment: "prepaid", technology: "5G", price: "7.99", currency: "EUR", validity: "monthly", data_gb: 100, minutes: "unlimited", sms: "unlimited", activation_fee: "0", start_date: "2026-12-01" }, "product-configurator");
  c.requestRelease({ offer: d.id }, "catalog-governor");
  v = c.view();
  const mine = v.offers.find((o) => o.id === d.id);
  assert.equal(mine.agent_created, true); assert.equal(mine.lifecycle, "draft"); assert.match(mine.release_ticket, /^REL-/);
  assert.equal(v.releases.length, 1);
});
