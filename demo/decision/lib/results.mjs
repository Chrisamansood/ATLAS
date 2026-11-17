// Reads the M0-03 result files for the Decisions page. Result files are written by decision/eval (one JSON per engine,
// plus <engine>/<use>.test.jsonl with every test decision). Nothing here invents a number: no file, no data.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const USES = ["routing", "bill-shock", "terms", "tier"];
const SAFE = /^[a-z0-9][a-z0-9-]*$/;

export function decisionsPayload(dir) {
  const engines = [];
  try {
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
      try { const j = JSON.parse(readFileSync(join(dir, f), "utf8")); if (j && typeof j.engine === "string" && j.uses) engines.push(j); } catch { /* a broken file is skipped */ }
    }
  } catch { /* no results folder yet */ }
  engines.sort((a, b) => (a.kind === "baseline") - (b.kind === "baseline"));   // real engines first, the baseline last
  return { hasData: engines.length > 0, uses: USES, engines };
}

export function loadPredictions(dir, engine, use, cap = 5000) {
  if (typeof engine !== "string" || typeof use !== "string" || !SAFE.test(engine) || !USES.includes(use)) return null;
  const file = join(dir, engine, `${use}.test.jsonl`);
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8").split("\n").filter(Boolean).slice(0, cap).map((l) => JSON.parse(l));
}
