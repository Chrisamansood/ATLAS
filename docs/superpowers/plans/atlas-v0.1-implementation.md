# ATLAS v0.1 Implementation Plan

> **For agentic workers:** Execute each task in order. Keep scope limited to
> the approved ATLAS v0.1 specification.

**Goal:** Build a dependency-free Python CLI that evaluates four synthetic
agent-action scenarios and emits explainable JSON and Markdown traces.

**Architecture:** The `atlas` package separates scenario parsing, policy
evaluation, trace rendering, and command-line presentation. YAML is parsed by
a deliberately small local parser for the restricted fixture schema, avoiding
runtime dependencies. Tests exercise public functions and CLI outcomes.

**Tech Stack:** Python 3.11 standard library; `unittest`; YAML fixture files;
Markdown and JSON documentation artifacts.

## Global Constraints

- Use Python 3.11 and no runtime dependencies.
- Use synthetic scenarios only; do not include real sensitive data.
- Use deterministic rules only; no LLM calls or optional model dependency.
- Emit structured decision evidence, never hidden reasoning or raw document
  content by default.
- `allow`, `quarantine`, and `block` are valid policy outcomes, not CLI errors.
- Only an explicit human review record can release a quarantine.
- Block only untrusted requests to change bank details, execute a payment,
  alter telecom network policy, or disable ATLAS controls.

---

### Task 1: Repository Contract and Documentation

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `LICENSE-DOCS`
- Create: `pyproject.toml`
- Create: `.gitignore`

**Produces:** A documented package contract and a `python -m atlas` entry
point declaration.

- [ ] Write `pyproject.toml` with `requires-python = ">=3.11"`, project name
  `atlas-framework`, and no dependencies.
- [ ] Write `README.md` with the positioning statement, clear non-claims,
  quick-start command, outcome definitions, and links to specification,
  mappings, scenarios, and assessment.
- [ ] Add the Apache-2.0 license text to `LICENSE` and the CC-BY-4.0 license
  notice to `LICENSE-DOCS`.
- [ ] Add `.gitignore` entries for `__pycache__/`, `.pytest_cache/`, `.venv/`,
  and generated `artifacts/` directories.
- [ ] Verify `python -m atlas --help` is documented but do not add external
  package-installation instructions.
- [ ] Commit with `docs: establish ATLAS public repository contract`.

### Task 2: Scenario Model and Loader

**Files:**
- Create: `src/atlas/__init__.py`
- Create: `src/atlas/models.py`
- Create: `src/atlas/scenario.py`
- Create: `tests/test_scenario.py`

**Consumes:** YAML scenario files with `id`, `source`, `content_summary`,
`proposed_action`, and `expected` fields.

**Produces:** `Scenario`, `Source`, and `ProposedAction` dataclasses plus
`load_scenario(path: Path) -> Scenario`.

- [ ] Write a failing test for a minimal valid fixture and assert normalized
  dataclass fields.
- [ ] Write a failing test that omits `proposed_action` and expects a clear
  `ScenarioValidationError` naming that field.
- [ ] Implement the restricted YAML parser required by fixture syntax only:
  mappings, scalar strings, booleans, and indentation-based nested mappings.
- [ ] Implement required-field validation and reject unsupported list syntax
  with a clear validation message.
- [ ] Run `python -m unittest tests.test_scenario -v` and require all tests to
  pass.
- [ ] Commit with `feat: add validated ATLAS scenario loader`.

### Task 3: Deterministic Policy Engine

**Files:**
- Create: `src/atlas/policy.py`
- Create: `tests/test_policy.py`

**Consumes:** `Scenario` from `atlas.models`.

**Produces:** `evaluate(scenario: Scenario) -> Evaluation` where `Evaluation`
contains `decision`, `risk_score`, `triggered_rules`, and `allowed_action_scope`.

- [ ] Write failing tests for a trusted safe invoice returning `allow`.
- [ ] Write failing tests for an untrusted bank-detail change returning `block`
  with rule `untrusted_sensitive_action`.
- [ ] Write failing tests for a suspicious request with an unknown action type
  returning `quarantine`.
- [ ] Implement source provenance scoring, instruction-pattern detection,
  action sensitivity, and document/action mismatch as named deterministic
  rules.
- [ ] Implement the narrow block policy exactly as stated in Global
  Constraints; do not infer broader blocked categories.
- [ ] Implement quarantine as the fallback for suspicious or insufficiently
  evidenced requests.
- [ ] Run `python -m unittest tests.test_policy -v` and require all tests to
  pass.
- [ ] Commit with `feat: add deterministic semantic trust policy`.

### Task 4: Trace Contracts and Rendering

**Files:**
- Create: `src/atlas/trace.py`
- Create: `tests/test_trace.py`

**Consumes:** `Scenario` and `Evaluation`.

**Produces:** `build_trace(...) -> dict`, `render_markdown(trace: dict) -> str`,
and `write_trace(trace: dict, output_dir: Path) -> tuple[Path, Path]`.

- [ ] Write a failing JSON-trace test asserting source metadata, triggered
  rules, risk score, decision, action scope, and no `raw_content` key.
- [ ] Write a failing Markdown-trace test asserting a readable decision
  summary and rule table.
- [ ] Implement stable JSON with `trace.json` and human-readable
  `trace.md` output paths.
- [ ] Add a `review` trace event schema that requires reviewer name, decision,
  and timestamp; prohibit releases for a blocked decision.
- [ ] Run `python -m unittest tests.test_trace -v` and require all tests to
  pass.
- [ ] Commit with `feat: add structured ATLAS decision traces`.

### Task 5: CLI and Scenario Pack

**Files:**
- Create: `src/atlas/__main__.py`
- Create: `scenarios/safe-invoice.yaml`
- Create: `scenarios/invoice-payment-fraud.yaml`
- Create: `scenarios/safe-telecom-request.yaml`
- Create: `scenarios/telecom-provisioning-attack.yaml`
- Create: `tests/test_cli.py`

**Consumes:** `load_scenario`, `evaluate`, and `write_trace`.

**Produces:** `python -m atlas run SCENARIO --output DIRECTORY` and a concise
terminal summary.

- [ ] Write a failing CLI test for the payment-fraud fixture asserting exit
  code zero, `BLOCK`, and both trace files.
- [ ] Write fixtures containing synthetic summaries only and expected decisions
  for allow, block, allow, and block respectively.
- [ ] Implement `run` with required scenario path and `--output` option.
- [ ] Make invalid fixtures return a non-zero execution error while policy
  outcomes return zero.
- [ ] Run `python -m unittest tests.test_cli -v` and run all four scenarios
  manually into a temporary output directory.
- [ ] Commit with `feat: add runnable fraud and telecom scenarios`.

### Task 6: Framework Artifacts and Release Checks

**Files:**
- Create: `spec/ATLAS-v0.1.md`
- Create: `mappings/owasp-agentic-top-10.yaml`
- Create: `mappings/maestro.yaml`
- Create: `mappings/nist-ai-rmf.yaml`
- Create: `assessment/atlas-readiness-checklist.md`
- Create: `artifacts/invoice-payment-fraud/trace.json`
- Create: `artifacts/invoice-payment-fraud/trace.md`

**Produces:** Citable framework documentation and a checked-in demonstration
trace generated by the CLI.

- [ ] Write the five-layer specification with objective, required capability,
  telemetry, and maturity level for each layer.
- [ ] Write concise mappings that identify the relationship to each external
  framework without claiming formal endorsement or compliance.
- [ ] Write a readiness checklist that asks for evidence rather than awarding
  self-asserted security guarantees.
- [ ] Generate the invoice-payment-fraud sample trace using the CLI, then add
  it as a versioned demonstration artifact.
- [ ] Run `python -m unittest discover -s tests -v`, `python -m atlas run
  scenarios/invoice-payment-fraud.yaml --output /tmp/atlas-demo`, and
  `git diff --check`.
- [ ] Review README wording to ensure it claims only reference-policy
  conformance in synthetic scenarios.
- [ ] Commit with `docs: publish ATLAS v0.1 framework artifacts`.

## Plan Review

- The six tasks cover all approved v0.1 requirements: framework, mappings,
  scenarios, pure-Python CLI, decision policy, trace privacy, human release,
  tests, and licensing.
- The plan contains no implementation placeholders and preserves the narrow
  safety claims of the design.
- Public interfaces are named once and used consistently by dependent tasks.
