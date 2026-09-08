# ATLAS v0.1 Design

## Purpose

ATLAS (Agent Trust Layers and Autonomous Security) is a public framework and
reference implementation for placing a trust boundary between an AI agent's
inputs and its consequential actions. Version 0.1 is an executable framework
artifact, not a production security product and not a claim to prevent fraud
or prompt injection in real deployments.

The repository will lead with a cross-sector invoice/payment-fraud scenario,
then demonstrate the same control pattern in a telecom provisioning scenario.
Its target readers are senior engineers and technical reviewers first, UK
Global Talent Visa assessors second, and security leaders third.

## Scope

The initial public repository is named `atlas-framework`.

It contains:

- A concise ATLAS five-layer specification with control objectives, emitted
  telemetry, and maturity levels.
- Machine-readable mappings between ATLAS and OWASP agent-security guidance,
  MAESTRO, and NIST AI RMF.
- Four readable scenario fixtures: safe invoice, malicious payment-fraud
  attempt, safe telecom request, and malicious telecom provisioning attempt.
- A dependency-free Python 3.11 command-line reference implementation of the
  Semantic Trust Gateway (STG).
- JSON and Markdown decision traces and automated fixture tests.
- An assessment checklist for applying the framework to a real environment.

Version 0.1 does not include a hosted service, an agent framework integration,
an LLM-based classifier, real payment or network-system access, performance
claims, incident-prevention claims, or automatic quarantine release.

## Product Positioning

The README headline is: "A trust boundary for agent actions in regulated
systems."

ATLAS is differentiated by its control placement: it evaluates the transition
from untrusted content to a requested agent action. It does not claim to be a
general prompt-injection detector. The framework records a structured,
reviewable decision at that boundary and narrows which action, if any, may be
performed.

Invoice/payment fraud makes the idea legible beyond telecom. Telecom
provisioning demonstrates the author's specialist domain knowledge without
making the framework telecom-only.

## Architecture

The repository has three independent surfaces:

1. Specification and mappings describe the ATLAS model and its relationship to
   established frameworks.
2. Scenario fixtures describe an input, source metadata, proposed agent
   action, and expected decision.
3. The reference CLI evaluates a scenario and writes evidence artifacts.

The CLI follows this flow:

1. Load and validate a local scenario fixture.
2. Normalize declared source provenance and the proposed action.
3. Run deterministic rules for untrusted provenance, instruction-like content,
   action sensitivity, and document/action mismatch.
4. Produce an `allow`, `quarantine`, or `block` decision.
5. Write a terminal summary, `trace.json`, and `trace.md`.

The core has no runtime dependencies beyond Python 3.11 standard library.
Future MCP, LangGraph, policy-engine, and LLM adapters must be optional and
must not alter core decision semantics without explicit configuration.

## Decision Policy

The evaluator is rules-first. It does not depend on a second LLM to decide
whether another model's behaviour is safe.

`allow` applies when the scenario has adequate provenance, no material policy
signals, and a permitted low-risk action.

`quarantine` is the default for suspicious or insufficiently evidenced cases.
It requires a named human reviewer to release it. The reviewer identity,
decision, timestamp, and optional note must be recorded as a subsequent trace
event. No automatic or LLM-based release exists in version 0.1.

`block` applies only when an untrusted instruction attempts one of these
actions:

- changing payment bank details;
- executing a payment;
- altering telecom network policy; or
- disabling or rewriting ATLAS controls.

The block list is intentionally narrow. Other suspicious requests remain
quarantined rather than being represented as conclusively malicious.

## Evidence and Privacy

Traces record only structured evidence needed to understand the decision:

- source type and declared provenance;
- normalized proposed action and sensitivity;
- rules triggered and their scores;
- final decision and allowed action scope; and
- reviewer decision where a quarantine is resolved.

Traces must not expose hidden model reasoning. They must not copy raw sensitive
source documents by default. Scenario fixtures use synthetic content only.

## Interfaces

The initial CLI contract is:

```text
python -m atlas run scenarios/invoice-payment-fraud.yaml --output artifacts/
```

It returns a non-zero exit code only for invalid input or execution failure;
the security decision itself is always represented in the trace. A block or
quarantine is therefore a valid, inspectable outcome rather than a CLI error.

The fixture schema is YAML. It includes a stable scenario identifier, source
metadata, content summary, proposed action, expected decision, and optional
expected triggered rules. The reference implementation validates only the
fields it consumes and reports clear schema errors for required fields.

## Repository Structure

```text
README.md
LICENSE
LICENSE-DOCS
spec/ATLAS-v0.1.md
mappings/
scenarios/
src/atlas/
tests/
assessment/
docs/superpowers/specs/
```

`src/atlas/` separates scenario loading, policy evaluation, trace generation,
and CLI presentation. Each module has one responsibility and can be tested
without executing the others.

## Testing and Demonstration

Automated tests assert the expected decision and triggered rules for all four
fixtures. A README example runs the invoice-payment-fraud scenario and links
to generated sample JSON and Markdown traces. The README must state that the
tests demonstrate conformance to this reference policy, not protection against
real incidents.

## Error Handling

Malformed fixtures produce an actionable validation message and no partial
trace artifact. Filesystem output errors return a non-zero exit status with a
clear path. Unknown action types are quarantined only after successful parsing;
unparseable input is an execution failure, not a security verdict.

## Licensing

Source code is licensed under Apache-2.0. The specification, mappings,
scenarios, and assessment material are licensed under CC-BY-4.0.

## Success Criteria

A technically literate reviewer can clone the repository, use Python 3.11,
run one documented command, inspect the two trace formats, and understand why
the payment-fraud case blocks while a normal invoice request allows. They can
also see how the same decision model applies to a telecom policy request and
how ATLAS complements, rather than replaces, established AI-security
frameworks.
