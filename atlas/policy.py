from dataclasses import dataclass, replace

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
    permitted = tuple(sorted(ALLOWED_SCOPES[action.domain]))
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
    scope_safe = set(action.declared_scope).issubset(set(permitted))
    if scope_safe:
        rules.append("R-SAFE-SCOPE")
    else:
        rules.append("R-OUT-OF-SCOPE")
        score += 40
    financial = action.domain is Domain.INVOICE and action.intent in FINANCIAL_INTENTS
    telecom = action.domain is Domain.TELECOM and action.intent in TELECOM_PROTECTED_INTENTS
    protected = financial or telecom
    if protected:
        rules.append("R-FINANCIAL-CHANGE" if financial else "R-TELECOM-POLICY-CHANGE")
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
        allowed_action_scope=permitted if decision is not Outcome.BLOCK else (),
        normalized_action=_normalized_action(scenario),
    )


def apply_review(evaluation: Evaluation, review: ReviewDecision) -> Evaluation:
    if evaluation.decision is Outcome.BLOCK:
        rules = tuple(dict.fromkeys((*evaluation.triggered_rules, "R-BLOCK-IMMUTABLE")))
        return replace(evaluation, triggered_rules=rules, review_decision=review)
    if not review.reviewer.strip():
        raise ValueError("a named human reviewer is required")
    if not review.request_id:
        raise ValueError("review request_id is required")
    if review.approved:
        return replace(evaluation, decision=Outcome.ALLOW, review_decision=review)
    return replace(evaluation, review_decision=review)
