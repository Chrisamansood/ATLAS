import { test } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../../twin/lib/data.mjs";
import { tmfHandle } from "../../twin/lib/tmf.mjs";
import { tmf676 } from "../../twin/lib/records.mjs";
import { DESK, deskCatalog, createTraffic } from "../../twin/lib/apidesk.mjs";

const world = generate(), cust = world.subscribers[7].id;
const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const call = (api, rest) => { const [p, qs] = rest.replace("{customer}", cust).split("?"); const q = new URLSearchParams(qs ?? ""); return api.id === "676" ? tmf676(world, `676/${p}`, q) : tmfHandle(world, `${api.id}/${p}`, q); };

test("every desk API has a contract and every example call answers 200", () => {
  for (const c of deskCatalog()) assert.equal(c.contract, "available", c.id);
  for (const api of DESK) for (const e of api.endpoints) { const r = call(api, `${e.path}`); assert.equal(r.status, 200, `${api.id} ${e.path}`); }
});

test("every column path resolves on the real answer (so the desk table is never blank)", () => {
  for (const api of DESK) {
    const r = call(api, api.endpoints[0].path), row = Array.isArray(r.body) ? r.body[0] : r.body;
    for (const [label, path] of api.columns) assert.notEqual(get(row, path), undefined, `${api.id} ${label} ${path}`);
  }
});

test("traffic keeps the newest calls per API and stays bounded", () => {
  const t = createTraffic(5);
  for (let i = 0; i < 8; i++) t.record(`/twin/tmf/629/customer/NW-${i}`, i % 2 ? "bill-shock-agent" : "");
  t.record("/twin/api/live/state", "x");
  const s = t.summary();
  assert.equal(s["629"].calls, 5); assert.equal(s["629"].recent.length, 5); assert.equal(s["629"].recent[0].path.endsWith("NW-7"), true); assert.equal(s["629"].recent[0].agent, "bill-shock-agent");
  assert.equal(Object.keys(s).length, 1);
});
