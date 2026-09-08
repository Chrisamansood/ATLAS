# ATLAS v0.1 Specification

ATLAS places a deterministic trust boundary between an input and a proposed
agent action. v0.1 is a reference policy, not a production security claim.

| Layer | Control objective | Required capability | Emitted telemetry | Maturity |
| --- | --- | --- | --- | --- |
| Provenance | Identify where a request came from | Record source, actor, confidence, and integrity | Provenance fields | L1 declared |
| Intent | Represent the requested action explicitly | Normalize domain, intent, target, and scope | Normalized action | L1 declared |
| Policy | Apply narrow deterministic rules | Produce allow, quarantine, or block | Rule IDs and score | L1 executable |
| Execution boundary | Limit consequential action scope | Emit permitted scope; keep protected untrusted actions blocked | Decision and scope | L1 executable |
| Evidence | Make the decision reviewable | Write JSON and Markdown traces; record human review | Trace and review event | L1 reviewable |

`quarantine` is the default for suspicious or insufficiently evidenced input.
Only a named human reviewer can release a quarantine. `block` is immutable.
It is reserved for untrusted attempts to change bank details, execute a
payment, alter telecom network policy, or disable/rewrite ATLAS controls.

This specification complements, rather than formally certifies compliance
with, other security and risk-management frameworks.
