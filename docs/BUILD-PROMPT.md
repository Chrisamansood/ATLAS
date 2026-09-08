# Build Prompt

Copy the prompt below into a new Codex task opened in the root of this
repository.

```text
Build ATLAS v0.1 from the approved design and implementation plan in:

- docs/superpowers/specs/atlas-v0.1-design.md
- docs/superpowers/plans/atlas-v0.1-implementation.md

Read both documents completely before changing files. Implement the plan in
order, keeping the repository public-facing, compact, and technically honest.

Non-negotiable constraints:
- Python 3.11 standard library only; no runtime dependencies.
- Build a CLI: python -m atlas run SCENARIO --output DIRECTORY.
- Use deterministic rules only. Do not add an LLM, hosted service, agent
  framework integration, or real financial/telecom integration.
- Support exactly these outcomes: allow, quarantine, block.
- Quarantine is the default for suspicious or insufficiently evidenced input.
- Block only an untrusted instruction attempting to change bank details,
  execute a payment, alter telecom network policy, or disable/rewrite ATLAS
  controls.
- Only a named human reviewer can release a quarantine, and the approval must
  be recorded as structured trace evidence. A block cannot be released.
- Traces must include provenance, normalized action, triggered rules, score,
  decision, permitted action scope, and review decision where present.
- Never log hidden model reasoning or raw sensitive source content by default.
- Use synthetic fixtures only.
- Create and test four scenarios: safe invoice, invoice/payment fraud,
  safe telecom request, and malicious telecom provisioning request.
- State clearly in the README that this is a reference implementation and
  synthetic-policy demonstration, not proven prevention of real attacks.
- License code under Apache-2.0 and documentation/specification under CC-BY-4.0.

Use test-driven development for each component. Run the full test suite and
the documented fraud scenario before reporting completion. Preserve unrelated
working-tree changes. Do not publish, push, or create a GitHub remote unless I
explicitly ask.
```
