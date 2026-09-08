import unittest

from atlas.models import ReviewDecision
from atlas.policy import apply_review, evaluate
from atlas.scenarios.fixtures import get_scenario


class PolicyTests(unittest.TestCase):
    def test_safe_invoice_allows(self):
        evaluation = evaluate(get_scenario("safe-invoice"))
        self.assertEqual(evaluation.decision.value, "allow")
        self.assertIn("R-VERIFIED-PROVENANCE", evaluation.triggered_rules)

    def test_untrusted_bank_change_blocks(self):
        evaluation = evaluate(get_scenario("invoice-payment-fraud"))
        self.assertEqual(evaluation.decision.value, "block")
        self.assertIn("R-FINANCIAL-CHANGE", evaluation.triggered_rules)
        self.assertIn("R-UNTRUSTED-EXTERNAL", evaluation.triggered_rules)

    def test_unknown_action_quarantines(self):
        scenario = get_scenario("safe-invoice")
        scenario = scenario.__class__(
            scenario_id=scenario.scenario_id,
            source=scenario.source,
            content_summary=scenario.content_summary,
            proposed_action=scenario.proposed_action.__class__(
                request_id=scenario.proposed_action.request_id,
                domain=scenario.proposed_action.domain,
                intent="unknown_action",
                target=scenario.proposed_action.target,
                parameters=scenario.proposed_action.parameters,
                evidence=scenario.proposed_action.evidence,
                declared_scope=scenario.proposed_action.declared_scope,
            ),
            expected_decision=scenario.expected_decision,
        )
        evaluation = evaluate(scenario)
        self.assertEqual(evaluation.decision.value, "quarantine")

    def test_named_human_can_release_quarantine(self):
        evaluation = evaluate(get_scenario("safe-invoice"))
        evaluation = evaluation.__class__(
            decision=evaluation.decision.QUARANTINE,
            risk_score=evaluation.risk_score,
            triggered_rules=evaluation.triggered_rules,
            allowed_action_scope=evaluation.allowed_action_scope,
            normalized_action=evaluation.normalized_action,
        )
        review = ReviewDecision(
            review_id="review-1",
            reviewer="Ada Reviewer",
            request_id="safe-invoice-request",
            approved=True,
            recorded_at="2026-01-01T00:00:00Z",
            reason="Synthetic evidence checked",
        )
        released = apply_review(evaluation, review)
        self.assertEqual(released.decision.value, "allow")
        self.assertIs(released.review_decision, review)

    def test_block_cannot_be_released(self):
        evaluation = evaluate(get_scenario("invoice-payment-fraud"))
        review = ReviewDecision(
            review_id="review-2",
            reviewer="Ada Reviewer",
            request_id="invoice-payment-fraud-request",
            approved=True,
            recorded_at="2026-01-01T00:00:00Z",
            reason="Attempted override",
        )
        released = apply_review(evaluation, review)
        self.assertEqual(released.decision.value, "block")
        self.assertIn("R-BLOCK-IMMUTABLE", released.triggered_rules)


if __name__ == "__main__":
    unittest.main()
