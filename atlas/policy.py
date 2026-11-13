from dataclasses import dataclass, replace
from datetime import datetime

from .models import Domain, Outcome, ReviewDecision, Scenario


ALLOWED_SCOPES = {
    Domain.INVOICE: {"validate_invoice", "match_purchase_order"},
    Domain.TELECOM: {"validate_service_order", "create_service_order"},
}
KNOWN_INTENTS = {
    "validate_invoice",
    "match_purchase_order",
    "update_bank_details",
    "execute_payment",
    "validate_service_order",
    "create_service_order",
    "alter_network_policy",
    "provision_network_change",
    "disable_atlas_controls",
    "rewrite_atlas_controls",
}
FINANCIAL_INTENTS = {"update_bank_details", "execute_payment"}
TELECOM_PROTECTED_INTENTS = {
    "alter_network_policy",
    "provision_network_change",
}
CONTROL_INTENTS = {
    "disable_atlas_controls",
    "rewrite_atlas_controls",
}


@dataclass(frozen=True)
class Evaluation:
    decision: Outcome
    risk_score: int
    triggered_rules: tuple[str, ...]
    allowed_action_scope: tuple[str, ...]
    normalized_action: dict[str, object]
    review_decision: ReviewDecision | None = None
    request_id: str = ""


def _permitted_scope(action: dict[str, object]) -> tuple[str, ...]:
    permitted = ALLOWED_SCOPES[Domain(action["domain"])]
    declared = action["declared_scope"]
    intent = action["intent"]
    if intent not in permitted or intent not in declared or not set(declared).issubset(permitted):
        return ()
    return tuple(sorted(set(declared)))


def _normalized_action(scenario: Scenario) -> dict[str, object]:
    action = scenario.proposed_action
    return {
        "domain": action.domain.value,
        "intent": action.intent,
        "target": action.target,
        "declared_scope": list(action.declared_scope),
    }


def evaluate(scenario: Scenario) -> Evaluation:
    source = scenario.source
    action = scenario.proposed_action
    rules: list[str] = []
    score = 10
    normalized_action = _normalized_action(scenario)
    permitted = _permitted_scope(normalized_action)
    verified = source.confidence.value == "verified" and source.integrity == "verified"
    trusted = source.actor.value == "trusted_system"
    if verified:
        rules.append("R-VERIFIED-PROVENANCE")
        score -= 10
    else:
        rules.append("R-INSUFFICIENT-EVIDENCE")
        score += 35
    if trusted:
        rules.append("R-TRUSTED-ACTOR")
        score -= 10
    elif source.actor.value == "untrusted_external":
        rules.append("R-UNTRUSTED-EXTERNAL")
        score += 25
    known = action.intent in KNOWN_INTENTS
    if not known:
        rules.append("R-UNKNOWN-ACTION")
        score += 25
    scope_safe = bool(permitted)
    if scope_safe:
        rules.append("R-SAFE-SCOPE")
    else:
        rules.append("R-OUT-OF-SCOPE")
        score += 40
    financial = action.intent in FINANCIAL_INTENTS
    telecom = action.intent in TELECOM_PROTECTED_INTENTS
    controls = action.intent in CONTROL_INTENTS
    protected = financial or telecom or controls
    if protected:
        rules.append("R-FINANCIAL-CHANGE" if financial else
                     "R-TELECOM-POLICY-CHANGE" if telecom else "R-ATLAS-CONTROL-CHANGE")
        score += 50
    if protected and source.actor.value == "untrusted_external":
        decision = Outcome.BLOCK
    elif not verified or not trusted or not known or not scope_safe or protected:
        decision = Outcome.QUARANTINE
    else:
        decision = Outcome.ALLOW
    if decision is Outcome.QUARANTINE:
        rules.append("R-REQUIRES-REVIEW")
    return Evaluation(
        decision=decision,
        risk_score=max(score, 0),
        triggered_rules=tuple(rules),
        allowed_action_scope=permitted if decision is Outcome.ALLOW else (),
        normalized_action=normalized_action,
        request_id=action.request_id,
    )


def apply_review(evaluation: Evaluation, review: ReviewDecision) -> Evaluation:
    for name in ("review_id", "reviewer", "request_id", "recorded_at"):
        value = getattr(review, name)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"review {name} is required")
    if review.request_id != evaluation.request_id:
        raise ValueError("review request_id must match the evaluated request")
    if not isinstance(review.approved, bool):
        raise ValueError("review approved must be a boolean")
    try:
        recorded_at = datetime.fromisoformat(review.recorded_at)
    except ValueError as exc:
        raise ValueError("review recorded_at must be an ISO 8601 timestamp") from exc
    if recorded_at.tzinfo is None:
        raise ValueError("review recorded_at must include a timezone")
    if evaluation.decision is Outcome.BLOCK:
        rules = tuple(dict.fromkeys((*evaluation.triggered_rules, "R-BLOCK-IMMUTABLE")))
        return replace(evaluation, triggered_rules=rules, review_decision=review)
    if evaluation.decision is not Outcome.QUARANTINE:
        raise ValueError("only a quarantined request can be reviewed")
    if review.approved:
        permitted = _permitted_scope(evaluation.normalized_action)
        if not permitted:
            raise ValueError("review cannot authorize an unsupported action or unsafe scope")
        return replace(evaluation, decision=Outcome.ALLOW, allowed_action_scope=permitted,
                       review_decision=review)
    return replace(evaluation, review_decision=review)
