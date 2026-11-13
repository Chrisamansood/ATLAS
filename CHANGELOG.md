# Changelog

## 0.1.1 — 2026-11-13

- Restrict allowed scope to supported operations actually requested, with the
  proposed intent included; quarantine empty or inconsistent scope.
- Emit no permitted scope while quarantined or blocked.
- Apply protected-action checks independently of caller-declared domain.
- Bind human reviews and trace construction to the evaluated request ID.
- Require complete review evidence and timezone-aware timestamps; prevent review
  from granting unsupported or protected actions.
- Include human-review evidence in Markdown as well as JSON traces.
- Expand regression coverage and exercise all bundled scenarios through the CLI.

This patch changes policy outputs for previously accepted invalid combinations.
`Evaluation` now carries `request_id`; callers should obtain it from `evaluate`
and use `dataclasses.replace` if needed rather than reconstructing it without
request identity. Trace schema version remains `0.1`.

## 0.1.0 — 2026-09-08

- Initial deterministic reference implementation, four synthetic scenarios,
  JSON/Markdown traces, framework specification, mappings, and readiness checklist.
