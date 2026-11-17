import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateOntology, resolveTerm, linkOntology } from "../lib/ontology.mjs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const roster = read("../nordwave-roster.json");
const ontology = read("../ontology/nordwave-ontology.json");

test("real ontology is valid against the roster", () => {
  assert.deepEqual(validateOntology(ontology, roster), []);
  assert.equal(ontology.terms.length, 31);
});

test("every roster term resolves to a canonical term, case-insensitively", () => {
  for (const a of roster.agents) for (const t of a.terms ?? []) {
    assert.ok(resolveTerm(ontology, t), `roster term "${t}" (${a.key}) does not resolve`);
    assert.equal(resolveTerm(ontology, t.toUpperCase()), resolveTerm(ontology, t));
  }
  assert.equal(resolveTerm(ontology, "no such term"), null);
});

test("linkOntology lists the agents that use each term", () => {
  const linked = linkOntology(ontology, roster);
  const billShock = linked.terms.find(t => t.id === "bill-shock");
  assert.deepEqual(billShock.agents, ["bill-shock"]);
  const offer = linked.terms.find(t => t.id === "product-offering");
  assert.ok(offer.agents.includes("catalogue") && offer.agents.includes("plan-advisor"));
  for (const t of linked.terms) assert.ok(Array.isArray(t.workflows));
  assert.ok(linked.terms.find(t => t.id === "goodwill-credit").workflows.includes("care-bill-shock"));
});

test("rejects duplicate ids, synonym collisions, unknown workflow terms, bad capability status, empty capabilities", () => {
  const base = (over) => ({ ...ontology, ...over });
  const dupe = base({ terms: [...ontology.terms, ontology.terms[0]] });
  assert.ok(validateOntology(dupe, roster).some(e => e.includes("duplicate id")));
  const clash = structuredClone(ontology);
  clash.terms[1].nordwave.synonyms.push(clash.terms[0].nordwave.synonyms[0]);
  assert.ok(validateOntology(clash, roster).some(e => e.includes("synonym")));
  const wf = structuredClone(ontology);
  wf.workflows[0].terms.push("ghost");
  assert.ok(validateOntology(wf, roster).some(e => e.includes("unknown term ghost")));
  const cap = structuredClone(ontology);
  cap.terms[0].capabilities[0].status = "magic";
  assert.ok(validateOntology(cap, roster).some(e => e.includes("bad capability status")));
  const none = structuredClone(ontology);
  none.terms[0].capabilities = [];
  assert.ok(validateOntology(none, roster).some(e => e.includes("no capabilities")));
});

test("a roster term with no ontology entry is reported", () => {
  const r = structuredClone(roster);
  r.agents[1].terms.push("unmapped thing");
  assert.ok(validateOntology(ontology, r).some(e => e.includes('roster term "unmapped thing"')));
});

test("no customer programme or internal-system names in the ontology file", () => {
  const text = readFileSync(new URL("../ontology/nordwave-ontology.json", import.meta.url), "utf8");
  assert.doesNotMatch(text, /windtre|\bwind\b|wom colombia|confluence/i);
});

test("the Explorer shows the operator as ATLAS AI Labs", () => {
  const o = JSON.parse(readFileSync(new URL("../ontology/nordwave-ontology.json", import.meta.url)));
  assert.equal(o.operator, "ATLAS AI Labs");
});
