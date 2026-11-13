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

## v0.1.1 policy clarification

Allowed scopes are limited to the declared operations supported in the action's
domain, and must include its intent. Empty, mismatched, unknown, and unsupported
scopes quarantine. Quarantine and block emit no permitted scope. The protected
intent categories above remain protected regardless of the declared domain.

Human review must match the evaluated request ID and include a nonempty review
ID, reviewer name, boolean approval, and timezone-aware ISO 8601 timestamp.
Approval can release a quarantine only within the same supported low-risk scope;
it cannot authorize unknown or protected actions, expand scope, or override a
block. Denial retains quarantine. Both trace formats include recorded review
evidence. These are validation rules for caller-declared evidence, not reviewer
authentication or tamper-proof authorization.
