import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCells } from "../../twin/lib/network.mjs";

test("cells are deterministic and well formed", () => {
  const a = generateCells(), b = generateCells();
  assert.deepEqual(a, b);
  assert.equal(a.length, 24);
  assert.equal(new Set(a.map((c) => c.id)).size, 24);
  for (const c of a) {
    assert.match(c.id, /^NW-CELL-\d{3}$/);
    assert.ok(c.fwa_active > 0 && c.fwa_active <= c.fwa_capacity);
    assert.equal(c.utilisation_pct, Math.round((c.fwa_active / c.fwa_capacity) * 1000) / 10);
  }
});

test("the demo has comfortable, watched and hot cells", () => {
  const u = generateCells().map((c) => c.utilisation_pct);
  assert.ok(u.some((x) => x < 75) && u.some((x) => x >= 75 && x < 85) && u.some((x) => x >= 85));
});
