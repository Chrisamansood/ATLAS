# ATLAS v0.1.1

## A trust boundary for agent actions in regulated systems

ATLAS (Agent Trust Layers and Autonomous Security) is a small, dependency-free
reference implementation of a Semantic Trust Gateway. It evaluates the
transition from source content to a proposed consequential action and emits a
reviewable decision trace.

This repository is a reference implementation and synthetic-policy
demonstration. Its tests show conformance to the policy implemented here; they
are not evidence of proven prevention of real attacks, fraud, prompt
injection, or telecom incidents. There are no LLM calls, hosted services,
agent-framework integrations, payment connections, or network integrations.

The current patch tightens action scope and human-review validation. See
[project status and next steps](docs/STATUS.md) and the [changelog](CHANGELOG.md).

## Quick start

Python 3.11 or newer is required. From the repository root:

```text
python -m atlas --help
python -m atlas run scenarios/invoice-payment-fraud.yaml --output /tmp/atlas-demo
```

The command returns zero for a valid policy decision, including `block` and
`quarantine`. It writes `trace.json` and `trace.md` to the requested output
directory. The fraud fixture is synthetic and should produce `BLOCK`.

Run the tests with:

```text
python -m unittest discover -s tests -v
```

## Outcomes

- `allow`: verified provenance, a known low-risk action, and a permitted scope.
- `quarantine`: the default for suspicious, unknown, or insufficiently
  evidenced requests. Only a named human reviewer can release it, and that
  decision must be recorded as structured trace evidence.
- `block`: only an untrusted instruction attempting to change bank details,
  execute a payment, alter telecom network policy, or disable/rewrite ATLAS
  controls. A block cannot be released.

Traces include provenance, normalized action, triggered rules, score, decision,
permitted action scope, and review evidence when present. An allowed scope is
limited to the requested, supported operations; quarantine and block emit an
empty scope. A review can release only a supported low-risk action with a valid
scope, and must include a matching request ID, named reviewer, review ID, boolean
approval, and timezone-aware ISO 8601 timestamp. Review evidence appears in both
trace formats. They do not include
hidden model reasoning or raw source content by default.

Human review is available through the Python `apply_review` API; the CLI only
evaluates scenarios. Reviewer identity and provenance remain caller-declared.
There is no authentication service or action executor in this reference.

## Scenario pack

The four synthetic fixtures demonstrate safe and malicious invoice and
telecom requests:

- `scenarios/safe-invoice.yaml` -> `allow`
- `scenarios/invoice-payment-fraud.yaml` -> `block`
- `scenarios/safe-telecom-request.yaml` -> `allow`
- `scenarios/telecom-provisioning-attack.yaml` -> `block`

The framework overview is in [spec/ATLAS-v0.1.md](spec/ATLAS-v0.1.md), with
non-endorsement mappings in `mappings/` and an evidence-oriented checklist in
`assessment/`.

## Licensing

Source code is Apache-2.0. The specification, mappings, scenario material,
assessment material, and other documentation are CC-BY-4.0. See [LICENSE](LICENSE)
and [LICENSE-DOCS](LICENSE-DOCS).
