import { test } from "node:test";
import assert from "node:assert/strict";
import { createSandbox } from "../../twin/lib/overlay.mjs";
import { createCatalogue } from "../../twin/lib/catalogue.mjs";
import { createMcp, CATALOGUE_AGENTS, ACCESS, TOOLS } from "../../twin/lib/mcp.mjs";

const tokens = Object.fromEntries(["credit-guard-agent", ...CATALOGUE_AGENTS].map((a) => [a, `tok-${a}`]));
const setup = () => { const sandbox = createSandbox(); return { sandbox, mcp: createMcp({ world: null, policy: null, sandbox, tokens, catalogue: createCatalogue({ today: () => "2026-10-28" }) }) }; };
const call = (mcp, agent, name, args = {}) => mcp.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, `Bearer tok-${agent}`).body.result;
const list = (mcp, agent) => mcp.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, `Bearer tok-${agent}`).body.result.tools.map((t) => t.name);

test("each catalogue agent sees exactly its granted tools; care agents keep the care tools", () => {
  const { mcp } = setup();
  for (const a of CATALOGUE_AGENTS) assert.deepEqual(list(mcp, a).sort(), [...ACCESS[a]].sort());
  assert.deepEqual(list(mcp, "credit-guard-agent"), TOOLS.map((t) => t.name));
});

test("list results are wrapped as an object for MCP clients", () => {
  const { mcp } = setup();
  const r = call(mcp, "marketing-agent", "list_addons");
  assert.ok(!Array.isArray(r.structuredContent) && Array.isArray(r.structuredContent.items) && r.structuredContent.items.length === 10);
});

test("only the Competitor Supervisor and the Product Configurator can create drafts", () => {
  const { mcp, sandbox } = setup();
  const card = { name: "ATLAS_5G_Prepaid_100GB", description: "x", segment: "consumer", payment: "prepaid", technology: "5G", price: "7.99", currency: "EUR", validity: "monthly", data_gb: "100", minutes: "unlimited", sms: "unlimited", activation_fee: "0", start_date: "2026-12-01" };
  for (const a of CATALOGUE_AGENTS.filter((x) => !["competitor-supervisor", "product-configurator"].includes(x))) {
    const r = call(mcp, a, "create_draft_offer", card);
    assert.equal(r.isError, true, a); assert.match(r.structuredContent.error, /not granted/);
  }
  const r = call(mcp, "product-configurator", "create_draft_offer", card).structuredContent;
  assert.equal(r.created, true);
  assert.ok(call(mcp, "catalog-governor", "list_offers", { status: "draft" }).structuredContent.items.some((o) => o.id === r.id), "the Governor sees the new draft");
  assert.ok(sandbox.state().calls.some((c) => c.agent === "marketing-agent" && c.result.includes("not granted")));
});
