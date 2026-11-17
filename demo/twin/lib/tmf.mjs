// Read-only TM Forum-shaped APIs over the twin world (TMF620, 622, 629, 635, 637, 678) plus a compact OpenAPI spec for each.
// Shapes follow the TMF resource names; fields are a deliberate subset. Nothing here writes.
import { CATALOGUE, PLANS, MONTHS } from "./data.mjs";
import { rateMonth, money } from "./rating.mjs";

const BASE = "/twin/tmf";
export const MONTH_LABELS = Array.from({ length: MONTHS }, (_, i) => { const m = (9 + i) % 12; const y = 2025 + Math.floor((9 + i) / 12); return `${y}-${String(m + 1).padStart(2, "0")}`; });
const amt = (c) => ({ unit: "EUR", value: money(c) });
const index = (world) => (world._ix ??= new Map(world.subscribers.map((s, i) => [s.id, i])));
const ok = (body) => ({ status: 200, body });
const nf = (what) => ({ status: 404, body: { code: "404", reason: `${what} not found` } });

const offering = (o) => ({ id: o.id, href: `${BASE}/620/productOffering/${o.id}`, name: o.name, category: [{ name: o.category }], isSellable: true, productOfferingPrice: [{ priceType: "recurring", price: { taxIncludedAmount: amt(o.price_cents) } }], "@type": "ProductOffering" });
const customer = (s) => ({ id: s.id, href: `${BASE}/629/customer/${s.id}`, name: s.name, status: "active", engagedParty: { role: "customer", name: s.name }, characteristic: [{ name: "segment", value: s.segment }, { name: "language", value: s.language }, { name: "tenureMonths", value: s.tenure_months }], "@type": "Customer" });
const product = (s) => ({ id: `${s.id}-sub`, href: `${BASE}/637/product/${s.id}-sub`, name: PLANS[s.plan].name, status: "active", relatedParty: [{ id: s.id, role: "customer" }], productOffering: { id: `plan-${s.plan}` }, "@type": "Product" });
const bill = (world, s, i, m) => { const r = rateMonth(PLANS[s.plan], world.usage[i][m]); return { id: `${s.id}-${MONTH_LABELS[m]}`, href: `${BASE}/678/customerBill/${s.id}-${MONTH_LABELS[m]}`, billDate: `${MONTH_LABELS[m]}-28`, state: "sent", amountDue: amt(r.total_cents), relatedParty: [{ id: s.id, role: "customer" }], appliedCharge: r.lines.map((l) => ({ description: l.item, taxIncludedAmount: amt(l.cents) })), "@type": "CustomerBill" }; };
const usageRecs = (world, s, i) => world.usage[i].map((u, m) => ({ id: `${s.id}-u-${MONTH_LABELS[m]}`, period: MONTH_LABELS[m], relatedParty: [{ id: s.id }], usageCharacteristic: [{ name: "dataMb", value: u[0] }, { name: "roamingMb", value: u[1] }, { name: "roamingZone", value: u[2] }, { name: "premiumSms", value: u[3] }], "@type": "UsageRecord" }));
const order = (s) => ({ id: `${s.id}-ord`, href: `${BASE}/622/productOrder/${s.id}-ord`, state: "completed", category: "new-subscription", relatedParty: [{ id: s.id, role: "customer" }], productOrderItem: [{ id: "1", action: "add", productOffering: { id: `plan-${s.plan}` } }], "@type": "ProductOrder" });

export function tmfHandle(world, rest, q) {
  const parts = rest.split("/").filter(Boolean);
  const [api, res, id] = parts;
  const ix = index(world);
  const party = q.get("relatedParty.id");
  const limit = Math.min(Number(q.get("limit") ?? 20), 200);
  if (api === "openapi") return SPECS[(res ?? "").replace(/\.json$/, "")] ? ok(SPECS[(res ?? "").replace(/\.json$/, "")]) : nf("spec");
  const sub = () => { const i = ix.get(party); return i == null ? null : [world.subscribers[i], i]; };
  switch (`${api}/${res}`) {
    case "620/productOffering": {
      if (id) { const o = CATALOGUE.find((x) => x.id === id); return o ? ok(offering(o)) : nf("productOffering"); }
      const cat = q.get("category.name");
      return ok(CATALOGUE.filter((o) => !cat || o.category === cat).map(offering));
    }
    case "629/customer": {
      if (id) { const i = ix.get(id); return i == null ? nf("customer") : ok(customer(world.subscribers[i])); }
      return ok(world.subscribers.slice(0, limit).map(customer));
    }
    case "637/product": {
      if (id) { const i = ix.get(id.replace(/-sub$/, "")); return i == null ? nf("product") : ok(product(world.subscribers[i])); }
      const t = sub(); return t ? ok([product(t[0])]) : { status: 400, body: { code: "400", reason: "relatedParty.id is required" } };
    }
    case "622/productOrder": {
      if (id) { const i = ix.get(id.replace(/-ord$/, "")); return i == null ? nf("productOrder") : ok(order(world.subscribers[i])); }
      const t = sub(); return t ? ok([order(t[0])]) : { status: 400, body: { code: "400", reason: "relatedParty.id is required" } };
    }
    case "635/usage": {
      const t = sub(); return t ? ok(usageRecs(world, t[0], t[1])) : { status: 400, body: { code: "400", reason: "relatedParty.id is required" } };
    }
    case "678/customerBill": {
      if (id) { const m = id.match(/^(NW-\d+)-(\d{4}-\d{2})$/); const i = m && ix.get(m[1]); const mi = m && MONTH_LABELS.indexOf(m[2]); return i == null || mi < 0 ? nf("customerBill") : ok(bill(world, world.subscribers[i], i, mi)); }
      const t = sub(); return t ? ok(MONTH_LABELS.map((_, m) => bill(world, t[0], t[1], m))) : { status: 400, body: { code: "400", reason: "relatedParty.id is required" } };
    }
    default: return nf("resource");
  }
}

export const spec = (n, title, resource, paths, schema) => ({ openapi: "3.0.3", info: { title: `${title} (ATLAS Twin, read-only subset)`, version: "0.1.0", description: `TMF${n}-shaped, synthetic data.` }, servers: [{ url: BASE }],
  paths: Object.fromEntries(paths.map(([p, summary, params]) => [`/${n}/${p}`, { get: { summary, parameters: params.map((x) => ({ name: x, in: "query", schema: { type: "string" } })), responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: `#/components/schemas/${resource}` } } } } } } } }])),
  components: { schemas: { [resource]: { type: "object", properties: Object.fromEntries(schema.map((k) => [k, { type: "string" }])) } } } });
export const SPECS = {
  620: spec(620, "Product Catalog", "ProductOffering", [["productOffering", "List offerings", ["category.name"]], ["productOffering/{id}", "One offering", []]], ["id", "name", "category", "productOfferingPrice"]),
  622: spec(622, "Product Ordering", "ProductOrder", [["productOrder", "Orders of a customer", ["relatedParty.id"]]], ["id", "state", "productOrderItem"]),
  629: spec(629, "Customer Management", "Customer", [["customer", "List customers", ["limit"]], ["customer/{id}", "One customer", []]], ["id", "name", "status", "characteristic"]),
  635: spec(635, "Usage Management", "UsageRecord", [["usage", "Usage of a customer", ["relatedParty.id"]]], ["id", "period", "usageCharacteristic"]),
  637: spec(637, "Product Inventory", "Product", [["product", "Products of a customer", ["relatedParty.id"]]], ["id", "name", "status", "productOffering"]),
  678: spec(678, "Customer Bill Management", "CustomerBill", [["customerBill", "Bills of a customer", ["relatedParty.id"]], ["customerBill/{id}", "One bill", []]], ["id", "billDate", "amountDue", "appliedCharge"])
};
