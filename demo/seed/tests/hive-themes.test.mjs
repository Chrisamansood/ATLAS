import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { THEMES, DEFAULT_THEME, pickTheme, renderTheme } from "../../hive/lib/themes.mjs";

const UI = fileURLToPath(new URL("../../hive/ui/", import.meta.url));

// P0-39: one drop-down switches between every HIVE design.
test("pickTheme: ?theme= wins, then the cookie, else Sphere", () => {
  assert.equal(DEFAULT_THEME, "sphere");
  assert.equal(pickTheme("?theme=hud", "hive_theme=globe"), "hud");
  assert.equal(pickTheme("", "a=1; hive_theme=globe"), "globe");
  assert.equal(pickTheme("?theme=nope", "hive_theme=bad"), "sphere");
  assert.equal(pickTheme(), "sphere");
});

test("every theme renders with the picker first in <head> and the Explorer base filled in", () => {
  for (const t of THEMES) {
    const html = renderTheme(UI, t.id, "http://ex");
    const head = html.indexOf("<head>"), picker = html.indexOf("window.HIVE_THEMES");
    assert.ok(head >= 0 && picker > head && picker < html.indexOf("<script", head + 6) + 10, `${t.id}: picker first in head`);
    assert.match(html, new RegExp(`"current":"${t.id}"`));
    assert.ok(!html.includes("__EXPLORER__"), `${t.id}: explorer filled`);
  }
});

test("no theme names the builder products", () => {
  for (const t of THEMES) {
    const src = readFileSync(`${UI}${t.file}`, "utf8");
    assert.ok(!/"Sim"|"Langflow"|Sim · Langflow/.test(src), `${t.id} names a builder product`);
  }
});
