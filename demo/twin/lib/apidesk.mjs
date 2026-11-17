// API desk metadata: what each twin TM Forum endpoint means in plain words, who uses it, how to try it and how to show its answer.
// Pure data plus a small ring buffer of recent calls. The endpoints themselves stay in tmf.mjs and records.mjs.
import { SPECS } from "./tmf.mjs";
import { SPEC_676 } from "./records.mjs";

const SHAPE = "TM Forum v4-style shape, field subset";
export const DESK = [
  { id: "629", name: "Customer Management", resource: "customer", says: "Who the customer is: name, segment, language, tenure.", used_by: ["All care agents"], mcp: ["find_customer"],
    endpoints: [{ path: "customer/{customer}", label: "One customer" }, { path: "customer?limit=5", label: "First five customers" }],
    columns: [["Customer", "id"], ["Name", "name"], ["Status", "status"], ["Segment", "characteristic.0.value"], ["Tenure (months)", "characteristic.2.value"]] },
  { id: "620", name: "Product Catalog", resource: "productOffering", says: "The offers and their prices: plans, roaming passes, add-ons, retention offers.", used_by: ["Plan Fit Agent", "Retention Agent"], mcp: [],
    endpoints: [{ path: "productOffering", label: "All offers" }, { path: "productOffering?category.name=plan", label: "Plans only" }],
    columns: [["Offer", "name"], ["Category", "category.0.name"], ["Price (EUR)", "productOfferingPrice.0.price.taxIncludedAmount.value"]] },
  { id: "637", name: "Product Inventory", resource: "product", says: "Which plan the customer holds right now.", used_by: ["Retention Agent", "Plan Fit Agent"], mcp: [],
    endpoints: [{ path: "product?relatedParty.id={customer}", label: "Products of the customer" }],
    columns: [["Product", "name"], ["Status", "status"], ["Offer", "productOffering.id"]] },
  { id: "635", name: "Usage Management", resource: "usage", says: "How much data, roaming and premium SMS the customer used each month.", used_by: ["Bill Shock Agent", "Roaming Guard"], mcp: ["get_usage"],
    endpoints: [{ path: "usage?relatedParty.id={customer}", label: "Monthly usage" }],
    columns: [["Month", "period"], ["Data (MB)", "usageCharacteristic.0.value"], ["Roaming (MB)", "usageCharacteristic.1.value"], ["Zone", "usageCharacteristic.2.value"], ["Premium SMS", "usageCharacteristic.3.value"]],
    note: "Our path is /usage, the older v4 name. Version 5 of the standard is reported to rename it to /productUsage (not checked against the spec)." },
  { id: "678", name: "Customer Bill Management", resource: "customerBill", says: "The invoice, line by line, as the rating engine computed it. Credits are not netted into invoices.", used_by: ["Bill Shock Agent", "Credit Guard Agent"], mcp: ["get_bill", "explain_bill_line"],
    endpoints: [{ path: "customerBill?relatedParty.id={customer}", label: "All 12 bills" }, { path: "customerBill/{customer}-2026-09", label: "September bill" }],
    columns: [["Bill", "id"], ["Bill date", "billDate"], ["Amount due (EUR)", "amountDue.value"], ["State", "state"], ["Lines", "appliedCharge.length"]] },
  { id: "676", name: "Payment Management", resource: "payment", says: "Payments made and failed attempts, matched to the invoice they pay.", used_by: ["Payment Reminder Agent"], mcp: [],
    endpoints: [{ path: "payment?relatedParty.id={customer}", label: "Payments of the customer" }],
    columns: [["Payment", "id"], ["Date", "statusDate"], ["Amount (EUR)", "amount.value"], ["Status", "status"], ["Invoice", "correlatorId"]] },
  { id: "622", name: "Product Ordering", resource: "productOrder", says: "Orders the customer has placed (new subscription, plan change, device, SIM swap).", used_by: ["Order agents"], mcp: [],
    endpoints: [{ path: "productOrder?relatedParty.id={customer}", label: "Orders of the customer" }],
    columns: [["Order", "id"], ["State", "state"], ["Category", "category"], ["Offer", "productOrderItem.0.productOffering.id"]] },
];

export function deskCatalog() {
  return DESK.map((a) => ({ ...a, shape: SHAPE, read_only: true, simulated: true, spec: `/twin/tmf/openapi/${a.id}.json`, base: `/twin/tmf/${a.id}/`, contract: (a.id === "676" ? SPEC_676 : SPECS[a.id]) ? "available" : "missing" }));
}

// Ring buffer of recent twin TM Forum calls (in memory). Agents may identify themselves with the x-agent-name header.
export function createTraffic(max = 200, now = () => new Date().toISOString()) {
  const hits = [];
  return {
    record(path, agent) { const m = String(path).match(/\/twin\/tmf\/(\d{3})\//); if (!m) return; hits.push({ at: now(), api: m[1], path: String(path).slice(0, 200), agent: String(agent || "anonymous").slice(0, 60) }); if (hits.length > max) hits.shift(); },
    summary() { const by = {}; for (const h of hits) { const s = (by[h.api] ??= { calls: 0, recent: [] }); s.calls++; s.recent.push(h); } for (const s of Object.values(by)) s.recent = s.recent.slice(-5).reverse(); return by; },
    clear() { hits.length = 0; },
  };
}
