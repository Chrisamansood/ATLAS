// Pure ontology helpers: no network, no file I/O. Used by the Explorer server (P0-14) and, later, the ontology service (M1).
const CAPABILITY_STATUS = new Set(["atlas-api", "awaiting-api"]);
export const RELATIONS = ["part-of", "depends-on", "causes", "triggers", "mitigates", "produces", "governed-by", "precedes", "identifies", "uses", "instance-of"];
const norm = (s) => String(s).trim().toLowerCase();

function termIndex(ontology) {
  const idx = new Map();
  for (const t of ontology.terms ?? []) {
    idx.set(norm(t.id), t.id);
    for (const s of t.nordwave?.synonyms ?? []) if (!idx.has(norm(s))) idx.set(norm(s), t.id);
  }
  return idx;
}

export function resolveTerm(ontology, text) {
  return termIndex(ontology).get(norm(text)) ?? null;
}

export function validateOntology(ontology, roster) {
  const errors = [];
  const ids = new Set();
  const owner = new Map();
  for (const t of ontology.terms ?? []) {
    if (!t.id) { errors.push("term without id"); continue; }
    if (ids.has(t.id)) errors.push(`duplicate id: ${t.id}`);
    ids.add(t.id);
    if (!t.nordwave?.label) errors.push(`${t.id}: missing nordwave.label`);
    if (t.layer === "general") {
      if (!t.telco?.why) errors.push(`${t.id}: missing telco.why`);
    } else {
      if (!t.tmf?.concept) errors.push(`${t.id}: missing tmf.concept`);
      if (!(t.capabilities?.length > 0)) errors.push(`${t.id}: no capabilities`);
    }
    for (const c of t.capabilities ?? []) if (!CAPABILITY_STATUS.has(c.status)) errors.push(`${t.id}: bad capability status ${c.status}`);
    for (const s of [t.id, ...(t.nordwave?.synonyms ?? [])]) {
      const k = norm(s);
      if (owner.has(k) && owner.get(k) !== t.id) errors.push(`synonym "${s}" of ${t.id} also belongs to ${owner.get(k)}`);
      owner.set(k, t.id);
    }
  }
  const seenRel = new Set();
  for (const [from, rel, to] of ontology.relations ?? []) {
    if (!ids.has(from)) errors.push(`relation ${from} ${rel} ${to}: unknown term ${from}`);
    if (!ids.has(to)) errors.push(`relation ${from} ${rel} ${to}: unknown term ${to}`);
    if (!RELATIONS.includes(rel)) errors.push(`relation ${from} ${rel} ${to}: unknown predicate "${rel}"`);
    if (from === to) errors.push(`relation ${from} ${rel} ${to}: self relation`);
    const key = `${from}|${rel}|${to}`;
    if (seenRel.has(key)) errors.push(`duplicate relation ${key}`);
    seenRel.add(key);
  }
  for (const w of ontology.workflows ?? []) {
    for (const id of w.terms ?? []) if (!ids.has(id)) errors.push(`workflow ${w.id}: unknown term ${id}`);
  }
  for (const a of roster?.agents ?? []) {
    for (const term of a.terms ?? []) {
      if (!owner.has(norm(term))) errors.push(`roster term "${term}" (agent ${a.key}) has no ontology entry`);
    }
  }
  return errors;
}

// Adds agents (from the roster) and workflows (from the ontology file) to every term.
export function linkOntology(ontology, roster) {
  const idx = termIndex(ontology);
  const agentsByTerm = new Map();
  for (const a of roster.agents) {
    for (const term of a.terms ?? []) {
      const id = idx.get(norm(term));
      if (!id) continue;
      if (!agentsByTerm.has(id)) agentsByTerm.set(id, []);
      if (!agentsByTerm.get(id).includes(a.key)) agentsByTerm.get(id).push(a.key);
    }
  }
  const terms = ontology.terms.map((t) => ({
    ...t,
    agents: agentsByTerm.get(t.id) ?? [],
    workflows: (ontology.workflows ?? []).filter((w) => w.terms.includes(t.id)).map((w) => w.id),
  }));
  const agents = roster.agents.map(({ key, name, title, department, status, kit }) => ({ key, name, title, department, status, kit }));
  return { ...ontology, terms, agents };
}

// Adds the general telco layer (terms + relations) under the Nordwave core. Inputs are not mutated.
export function mergeGeneral(core, general) {
  return {
    ...core,
    layers: [...(core.layers ?? []), ...(general.layers ?? [])],
    terms: [
      ...(core.terms ?? []).map((t) => ({ ...t, layer: "core" })),
      ...(general.terms ?? []).map((t) => ({ ...t, layer: "general" })),
    ],
    relations: [...(core.relations ?? []), ...(general.relations ?? [])],
    workflows: [...(core.workflows ?? []), ...(general.workflows ?? [])],
  };
}

// Live lookup for the ontology service (used by the Explorer server at /api/resolve and, through it, by Sim workflows).
// Finds the terms a text mentions, adds the workflow's own terms, then up to 4 neighbours of what was mentioned.
// Short words (3 letters) only count in upper case, so "ran" the verb is not the radio network; 2 letters never count.
const CAP_TERMS = 12, CAP_DIRECT = 10, CAP_MENTIONED = 8, CAP_RELATED = 4, CAP_RELS = 6;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function findIn(text, phrase) {
  if (phrase.length < 3) return -1;
  if (phrase.length === 3) {
    const m = new RegExp(`(^|[^A-Za-z0-9])${esc(phrase.toUpperCase())}($|[^A-Za-z0-9])`).exec(text);
    return m ? m.index : -1;
  }
  const m = new RegExp(`(^|[^a-z0-9])${esc(phrase.toLowerCase()).replace(/\s+/g, "\\s+")}($|[^a-z0-9])`).exec(text.toLowerCase());
  return m ? m.index : -1;
}

export function lookupLive(ontology, { text, ids } = {}) {
  const terms = ontology.terms ?? [];
  const byId = new Map(terms.map((t) => [t.id, t]));
  const rels = ontology.relations ?? [];
  const label = (id) => byId.get(id)?.nordwave.label ?? id;
  const raw = typeof text === "string" ? text : "";

  const hits = [];
  if (raw.trim()) {
    for (const t of terms) {
      let at = -1;
      for (const p of new Set([t.id.replace(/-/g, " "), t.nordwave.label, ...(t.nordwave.synonyms ?? [])])) {
        const i = findIn(raw, String(p));
        if (i >= 0 && (at < 0 || i < at)) at = i;
      }
      if (at >= 0) hits.push([at, t.id]);
    }
  }
  const mentioned = hits.sort((a, b) => a[0] - b[0]).map((h) => h[1]).slice(0, CAP_MENTIONED);
  const workflow = (ids ?? []).filter((id) => byId.has(id) && !mentioned.includes(id));
  const direct = [...mentioned.map((id) => [id, "mentioned"]), ...workflow.map((id) => [id, "workflow"])].slice(0, CAP_DIRECT);
  const seen = new Set(direct.map(([id]) => id));

  // Neighbours of everything selected, best first: the more (and the more meaningful) links a term has to the selected set, the more relevant it is.
  // Controls (mitigates) count most, then consequences and rules (causes, triggers, governed-by), then structure.
  const WEIGHT = { mitigates: 3, causes: 2, triggers: 2, "governed-by": 2 };
  const score = new Map();
  for (const [id] of direct) {
    for (const [a, rel, b] of rels) {
      const other = a === id ? b : b === id ? a : null;
      if (other && !seen.has(other)) score.set(other, (score.get(other) ?? 0) + (WEIGHT[rel] ?? 1));
    }
  }
  const order = new Map([...score.keys()].map((id, i) => [id, i]));
  const related = [...score.keys()].sort((x, y) => score.get(y) - score.get(x) || order.get(x) - order.get(y));
  const extra = related.slice(0, Math.min(CAP_RELATED, CAP_TERMS - direct.length)).map((id) => [id, "related"]);

  const record = ([id, via]) => {
    const t = byId.get(id);
    const out = { id, via, nordwave: t.nordwave.label, means: t.nordwave.description, tmf: t.tmf?.api ?? "no TMF API assumed" };
    if (t.atlas?.term) out.atlas = t.atlas.term;
    if (t.layer === "general" && t.telco?.why) out.why = t.telco.why;
    if (via !== "related") {
      out.related = rels
        .filter(([a, , b]) => a === id || b === id)
        .slice(0, CAP_RELS)
        .map(([a, rel, b]) => (a === id ? { rel, to: b, label: label(b) } : { rel, from: a, label: label(a) }));
    }
    return out;
  };
  return { source: "live", mentioned, terms: [...direct, ...extra].map(record) };
}

// ATLAS pack (P0-19): the full atlas-semantic graph and the intelligence-platform layer, generated by
// scripts/import-atlas-semantic.py. Nodes have single-letter id prefixes that do not clash with the Explorer's own
// (d, w, t, a, x, q, c); edges are [from, relation, to, note?] and may point at existing terms ("t:<id>").
export const PACK_KINDS = ["pack-term", "resource", "relationship", "process", "recipe", "action", "persona",
  "analytics-concept", "analytics-value", "view", "view-group", "gold-table", "analytics-policy", "capability-gap"];
const RESERVED = new Set(["d", "w", "t", "a", "x", "q", "c"]);

export function validatePack(pack, ontology) {
  const errors = [];
  const ids = new Set();
  for (const n of pack?.nodes ?? []) {
    if (!n.id || !n.label) { errors.push(`pack node without id or label: ${JSON.stringify(n).slice(0, 80)}`); continue; }
    if (ids.has(n.id)) errors.push(`pack: duplicate id ${n.id}`);
    ids.add(n.id);
    if (!PACK_KINDS.includes(n.kind)) errors.push(`pack: ${n.id} has unknown kind ${n.kind}`);
    if (RESERVED.has(n.id.split(":")[0])) errors.push(`pack: ${n.id} uses a reserved prefix`);
  }
  const terms = new Set((ontology?.terms ?? []).map((t) => "t:" + t.id));
  for (const k of Object.keys(pack?.existingTerms ?? {})) if (!terms.has(k)) errors.push(`pack: existing term ${k} not in the ontology`);
  for (const [a, rel, b] of pack?.edges ?? []) {
    for (const end of [a, b]) if (!ids.has(end) && !terms.has(end)) errors.push(`pack edge ${a} ${rel} ${b}: unknown end ${end}`);
    if (!rel) errors.push(`pack edge ${a} -> ${b}: no relation`);
  }
  return errors;
}
