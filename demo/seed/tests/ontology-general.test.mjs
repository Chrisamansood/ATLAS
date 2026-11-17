import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateOntology, resolveTerm, linkOntology, mergeGeneral, RELATIONS } from "../lib/ontology.mjs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const roster = read("../nordwave-roster.json");
const core = read("../ontology/nordwave-ontology.json");
const general = read("../ontology/telco-general.json");
const merged = mergeGeneral(core, general);

test("merged ontology is valid against the roster and keeps the 31 core terms", () => {
  assert.deepEqual(validateOntology(merged, roster), []);
  assert.equal(merged.terms.filter((t) => t.layer === "core").length, 31);
  assert.ok(merged.terms.filter((t) => t.layer === "general").length >= 45);
});

test("mergeGeneral does not mutate its inputs and ids stay unique", () => {
  const before = JSON.stringify(core);
  mergeGeneral(core, general);
  assert.equal(JSON.stringify(core), before);
  assert.equal(new Set(merged.terms.map((t) => t.id)).size, merged.terms.length);
});

test("every general term explains itself: label, description, why it matters, KPIs, department", () => {
  const depts = new Set(core.terms.map((t) => t.department));
  for (const t of merged.terms.filter((x) => x.layer === "general")) {
    assert.ok(t.nordwave?.label, `${t.id}: label`);
    assert.ok(t.nordwave?.description?.length > 20, `${t.id}: description`);
    assert.ok(t.telco?.why?.length > 20, `${t.id}: telco.why`);
    assert.ok(Array.isArray(t.telco?.kpis), `${t.id}: telco.kpis`);
    assert.ok(depts.has(t.department), `${t.id}: department ${t.department}`);
    assert.ok(Array.isArray(t.capabilities), `${t.id}: capabilities array`);
  }
});

test("general terms never claim a BSS API exists", () => {
  for (const t of merged.terms.filter((x) => x.layer === "general")) {
    assert.ok(!t.capabilities.some((c) => c.status === "atlas-api"), `${t.id} claims atlas-api`);
    assert.equal(t.atlas ?? null, null, `${t.id} has a atlas mapping`);
  }
});

test("relations: known predicates, known endpoints, no self loops, no duplicates", () => {
  const ids = new Set(merged.terms.map((t) => t.id));
  const seen = new Set();
  assert.ok(merged.relations.length >= 80);
  for (const [from, rel, to] of merged.relations) {
    assert.ok(RELATIONS.includes(rel), `unknown predicate ${rel}`);
    assert.ok(ids.has(from), `unknown term ${from}`);
    assert.ok(ids.has(to), `unknown term ${to}`);
    assert.notEqual(from, to);
    const key = `${from}|${rel}|${to}`;
    assert.ok(!seen.has(key), `duplicate relation ${key}`);
    seen.add(key);
  }
});

test("no orphans: every general term has a relation, and every core term is reachable from the general layer or already related", () => {
  const touched = new Set(merged.relations.flatMap(([a, , b]) => [a, b]));
  for (const t of merged.terms.filter((x) => x.layer === "general")) assert.ok(touched.has(t.id), `${t.id} has no relation`);
});

test("the general layer anchors to the core terms: at least 20 core terms gain a relation", () => {
  const coreIds = new Set(core.terms.map((t) => t.id));
  const anchored = new Set(merged.relations.flatMap(([a, , b]) => [a, b]).filter((id) => coreIds.has(id)));
  assert.ok(anchored.size >= 20, `only ${anchored.size} core terms anchored`);
});

test("everyday telco words resolve, case-insensitively", () => {
  for (const [word, id] of [["MSISDN", "msisdn"], ["ocs", "charging"], ["Phone number", "msisdn"], ["SLA", "sla"], ["ARPU", "arpu"], ["roaming", "roaming"]]) {
    assert.equal(resolveTerm(merged, word), id, word);
  }
});

test("linkOntology still works on the merged ontology and keeps layer and relations", () => {
  const linked = linkOntology(merged, roster);
  assert.equal(linked.terms.length, merged.terms.length);
  assert.equal(linked.relations.length, merged.relations.length);
  assert.ok(linked.terms.every((t) => Array.isArray(t.agents) && Array.isArray(t.workflows)));
});

test("validation rejects bad relations, bad predicates, and general terms without a why", () => {
  const bad = structuredClone(merged);
  bad.relations.push(["ghost", "causes", "roaming"]);
  bad.relations.push(["roaming", "likes", "bill-shock"]);
  bad.relations.push(["roaming", "causes", "roaming"]);
  const errs = validateOntology(bad, roster);
  assert.ok(errs.some((e) => e.includes("unknown term ghost")));
  assert.ok(errs.some((e) => e.includes('unknown predicate "likes"')));
  assert.ok(errs.some((e) => e.includes("self relation")));
  const nowhy = structuredClone(merged);
  delete nowhy.terms.find((t) => t.layer === "general").telco;
  assert.ok(validateOntology(nowhy, roster).some((e) => e.includes("telco.why")));
});

test("no customer programme or internal-system names in the general layer", () => {
  const text = readFileSync(new URL("../ontology/telco-general.json", import.meta.url), "utf8");
  assert.doesNotMatch(text, /windtre|\bwind\b|wom colombia|confluence|atlas-semantic/i);
});
