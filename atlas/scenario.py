from pathlib import Path
from typing import Any

from .models import (
    ActionRequest,
    ActorType,
    Domain,
    Provenance,
    Scenario,
    SourceConfidence,
)


class ScenarioValidationError(ValueError):
    """Raised when a restricted ATLAS fixture is malformed."""


def _scalar(value: str) -> Any:
    value = value.strip()
    if not value:
        return {}
    if value.startswith(("'", '"')) and value.endswith(value[0]):
        return value[1:-1]
    if value in {"true", "True"}:
        return True
    if value in {"false", "False"}:
        return False
    if value in {"null", "None"}:
        return None
    return value


def _parse_restricted_yaml(path: Path) -> dict[str, Any]:
    root: dict[str, Any] = {}
    stack: list[tuple[int, dict[str, Any]]] = [(-1, root)]
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        if "\t" in raw_line:
            raise ScenarioValidationError(f"line {line_number}: tabs are unsupported")
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        text = raw_line.strip()
        if text.startswith("-"):
            raise ScenarioValidationError(f"line {line_number}: list syntax is unsupported")
        if ":" not in text:
            raise ScenarioValidationError(f"line {line_number}: expected key: value")
        key, raw_value = text.split(":", 1)
        key = key.strip()
        if not key:
            raise ScenarioValidationError(f"line {line_number}: empty key")
        while stack[-1][0] >= indent:
            stack.pop()
        parent = stack[-1][1]
        if key in parent:
            raise ScenarioValidationError(f"line {line_number}: duplicate key {key}")
        value = _scalar(raw_value)
        parent[key] = value
        if value == {}:
            stack.append((indent, value))
    return root


def _required(mapping: dict[str, Any], key: str, context: str) -> Any:
    if key not in mapping:
        raise ScenarioValidationError(f"missing required field: {context}.{key}")
    return mapping[key]


def _as_scope(value: Any, context: str) -> tuple[str, ...]:
    if isinstance(value, str):
        return (value,)
    if isinstance(value, dict):
        raise ScenarioValidationError(f"{context} must be a scalar scope")
    raise ScenarioValidationError(f"{context} must be a scalar scope")


def load_scenario(path: Path) -> Scenario:
    try:
        data = _parse_restricted_yaml(path)
    except FileNotFoundError as exc:
        raise ScenarioValidationError(f"scenario file not found: {path}") from exc
    scenario_id = _required(data, "id", "scenario")
    action_data = _required(data, "proposed_action", "scenario")
    source_data = _required(data, "source", "scenario")
    expected_data = _required(data, "expected", "scenario")
    if not isinstance(source_data, dict):
        raise ScenarioValidationError("source must be a mapping")
    if not isinstance(action_data, dict):
        raise ScenarioValidationError("proposed_action must be a mapping")
    if not isinstance(expected_data, dict):
        raise ScenarioValidationError("expected must be a mapping")

    try:
        source = Provenance(
            source_id=str(_required(source_data, "source_id", "source")),
            source_type=str(_required(source_data, "source_type", "source")),
            actor=ActorType(str(_required(source_data, "actor", "source"))),
            received_at=str(source_data.get("received_at", "")),
            confidence=SourceConfidence(str(source_data.get("confidence", "untrusted"))),
            integrity=str(source_data.get("integrity", "unverified")),
            raw_content_retained=bool(source_data.get("raw_content_retained", False)),
        )
        domain = Domain(str(_required(action_data, "domain", "proposed_action")))
    except (KeyError, ValueError) as exc:
        raise ScenarioValidationError(f"invalid scenario enum value: {exc}") from exc

    action = ActionRequest(
        request_id=str(action_data.get("request_id", f"{scenario_id}-request")),
        domain=domain,
        intent=str(_required(action_data, "intent", "proposed_action")),
        target=str(_required(action_data, "target", "proposed_action")),
        parameters=action_data.get("parameters", {}) if isinstance(action_data.get("parameters", {}), dict) else {},
        evidence=action_data.get("evidence", {}) if isinstance(action_data.get("evidence", {}), dict) else {},
        declared_scope=_as_scope(_required(action_data, "declared_scope", "proposed_action"), "proposed_action.declared_scope"),
    )
    expected_rules = expected_data.get("rules", ())
    if expected_rules not in ((), ""):
        raise ScenarioValidationError("expected.rules must be omitted or scalar in the restricted format")
    return Scenario(
        scenario_id=str(scenario_id),
        source=source,
        content_summary=str(_required(data, "content_summary", "scenario")),
        proposed_action=action,
        expected_decision=str(_required(expected_data, "decision", "expected")),
    )
