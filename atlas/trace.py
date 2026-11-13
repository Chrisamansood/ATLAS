import json
from pathlib import Path

from .models import Scenario
from .policy import Evaluation


def build_trace(scenario: Scenario, evaluation: Evaluation, run_id: str = "run-1") -> dict[str, object]:
    if evaluation.request_id != scenario.proposed_action.request_id:
        raise ValueError("evaluation request_id must match the scenario request")
    trace: dict[str, object] = {
        "trace_version": "0.1",
        "run_id": run_id,
        "timestamp": scenario.source.received_at or "2026-01-01T00:00:00Z",
        "scenario_id": scenario.scenario_id,
        "request_id": scenario.proposed_action.request_id,
        "provenance": scenario.source.to_dict(),
        "normalized_action": evaluation.normalized_action,
        "triggered_rules": list(evaluation.triggered_rules),
        "score": evaluation.risk_score,
        "decision": evaluation.decision.value,
        "permitted_action_scope": list(evaluation.allowed_action_scope),
    }
    if evaluation.review_decision is not None:
        trace["review_decision"] = evaluation.review_decision.to_dict()
    return trace


def render_markdown(trace: dict[str, object]) -> str:
    rules = trace["triggered_rules"]
    rules_text = "\n".join(f"- `{rule}`" for rule in rules) or "- None"
    provenance = trace["provenance"]
    action = trace["normalized_action"]
    review = trace.get("review_decision")
    review_text = ""
    if review is not None:
        review_text = (
            f"\n## Human review\n\n"
            f"- Review: `{review['review_id']}`\n"
            f"- Reviewer: {review['reviewer']}\n"
            f"- Request: `{review['request_id']}`\n"
            f"- Approved: `{str(review['approved']).lower()}`\n"
            f"- Recorded at: `{review['recorded_at']}`\n"
            f"- Reason: {review['reason']}\n"
        )
    return (
        f"# ATLAS Decision Trace\n\n"
        f"- Scenario: `{trace['scenario_id']}`\n"
        f"- Request: `{trace['request_id']}`\n"
        f"- Decision: `{trace['decision']}`\n"
        f"- Score: `{trace['score']}`\n"
        f"- Permitted scope: `{', '.join(trace['permitted_action_scope']) or 'none'}`\n\n"
        f"## Provenance\n\n"
        f"- Source: `{provenance['source_id']}` ({provenance['source_type']})\n"
        f"- Actor: `{provenance['actor']}`\n"
        f"- Confidence: `{provenance['confidence']}`\n"
        f"- Integrity: `{provenance['integrity']}`\n\n"
        f"## Normalized Action\n\n"
        f"- Domain: `{action['domain']}`\n"
        f"- Intent: `{action['intent']}`\n"
        f"- Target: `{action['target']}`\n\n"
        f"## Triggered rules\n\n{rules_text}\n"
        f"{review_text}"
    )


def write_trace(trace: dict[str, object], output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "trace.json"
    markdown_path = output_dir / "trace.md"
    json_path.write_text(json.dumps(trace, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    markdown_path.write_text(render_markdown(trace), encoding="utf-8")
    return json_path, markdown_path
