# ATLAS project status

Assessed 2026-11-13 against the initial GitHub commit `a5c145a` and this patch.

## Where the project stands

ATLAS is an executable, dependency-free Python reference implementation. It has
four synthetic invoice/telecom scenarios, a deterministic allow/quarantine/block
policy, JSON and Markdown traces, a Python human-review API, a five-layer
specification, framework mappings, and an evidence-oriented readiness checklist.
The initial implementation had 14 passing tests. This patch adds regression
coverage for scope, review identity/evidence, and all bundled CLI scenarios.

The original implementation plan is historical: its unchecked tasks and
`src/atlas/` paths do not reflect the delivered root-level `atlas/` package.
Its proposed instruction-pattern and document/action-mismatch checks are not
implemented: the evaluator operates on declared action and provenance fields,
not the content summary. Framework mappings have not been revalidated in this
update and do not establish endorsement or compliance.

## This update: policy and review hardening

The v0.1.1 patch fixes scope over-grants, permissions emitted during quarantine,
protected intents mislabeled under another domain, and acceptance of unrelated
or incomplete review evidence. Human review can release only a supported
low-risk request within its declared scope. Both trace formats expose the review.

The public CLI remains `python -m atlas run SCENARIO --output DIRECTORY`.
Allow, quarantine, and block all return zero when evaluation succeeds. Invalid
input and execution errors return nonzero.

## Next priorities

1. Harden the restricted fixture parser: validate scalar types and indentation,
   reject malformed optional fields, and specify the supported YAML subset.
2. Add GitHub Actions checks for supported Python versions and fixture outcomes.
3. Add a documented quarantine fixture and review walkthrough, then decide
   whether a review CLI is useful.
4. Define an adapter contract before connecting a real agent or tool executor:
   authenticated provenance/reviewer identity, unique immutable request binding,
   target/parameter constraints, replay protection, and durable audit history.
5. Validate the framework mappings against primary sources and collect external
   review before expanding security claims.

## Evidence limits

Tests demonstrate synthetic reference-policy conformance only. ATLAS does not
execute actions, authenticate callers, inspect raw documents, detect arbitrary
prompt injection, or provide a tamper-proof audit log. Request IDs are supplied
by callers; matching IDs alone do not authenticate or cryptographically bind an
action. There are no live integrations or independently validated prevention
claims. The local research cache and generated architecture files are not part
of this patch.
