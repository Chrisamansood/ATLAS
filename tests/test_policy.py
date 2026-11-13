import unittest
from dataclasses import replace

from atlas.models import ActorType, Domain, ReviewDecision
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
        scenario = get_scenario("safe-invoice")
        evaluation = evaluate(replace(scenario, source=replace(scenario.source, integrity="unverified")))
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
        self.assertEqual(released.allowed_action_scope, ("validate_invoice",))

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

    def test_allow_does_not_grant_unrequested_scope(self):
        evaluation = evaluate(get_scenario("safe-invoice"))
        self.assertEqual(evaluation.allowed_action_scope, ("validate_invoice",))

    def test_invalid_action_scope_quarantines_without_permission(self):
        scenario = get_scenario("safe-invoice")
        cases = [
            ("validate_invoice", ()),
            ("validate_invoice", ("match_purchase_order",)),
            ("create_service_order", ("validate_invoice",)),
            ("validate_invoice", ("validate_invoice", "execute_payment")),
        ]
        for intent, scope in cases:
            with self.subTest(intent=intent, scope=scope):
                action = replace(scenario.proposed_action, intent=intent, declared_scope=scope)
                evaluation = evaluate(replace(scenario, proposed_action=action))
                self.assertEqual(evaluation.decision.value, "quarantine")
                self.assertEqual(evaluation.allowed_action_scope, ())

    def test_quarantine_grants_no_scope_before_review(self):
        scenario = get_scenario("safe-invoice")
        evaluation = evaluate(replace(scenario, source=replace(scenario.source, integrity="unverified")))
        self.assertEqual(evaluation.decision.value, "quarantine")
        self.assertEqual(evaluation.allowed_action_scope, ())

    def test_untrusted_protected_intents_block_in_either_domain(self):
        scenario = get_scenario("safe-invoice")
        for domain, scope in [(Domain.INVOICE, "validate_invoice"), (Domain.TELECOM, "create_service_order")]:
            for intent in ("update_bank_details", "execute_payment", "alter_network_policy",
                           "provision_network_change", "disable_atlas_controls", "rewrite_atlas_controls"):
                with self.subTest(domain=domain, intent=intent):
                    action = replace(scenario.proposed_action, domain=domain, intent=intent, declared_scope=(scope,))
                    source = replace(scenario.source, actor=ActorType.UNTRUSTED_EXTERNAL)
                    evaluation = evaluate(replace(scenario, source=source, proposed_action=action))
                    self.assertEqual(evaluation.decision.value, "block")
                    self.assertEqual(evaluation.allowed_action_scope, ())

    def test_review_rejects_unrelated_or_incomplete_evidence(self):
        scenario = get_scenario("safe-invoice")
        evaluation = evaluate(replace(scenario, source=replace(scenario.source, integrity="unverified")))
        review = ReviewDecision("review-1", "Ada Reviewer", scenario.proposed_action.request_id,
                                True, "2026-01-01T10:00:00Z")
        cases = [
            {"request_id": "unrelated-request"}, {"request_id": ""},
            {"review_id": " "}, {"reviewer": " "}, {"recorded_at": ""},
            {"recorded_at": "not-a-date"}, {"recorded_at": "2026-01-01"},
            {"recorded_at": "2026-01-01T10:00:00"}, {"approved": "false"},
        ]
        for changes in cases:
            with self.subTest(changes=changes):
                with self.assertRaises(ValueError):
                    apply_review(evaluation, replace(review, **changes))

    def test_review_cannot_authorize_unsupported_or_protected_action(self):
        scenario = get_scenario("safe-invoice")
        for intent, scope in [("unknown_action", ("validate_invoice",)),
                              ("execute_payment", ("validate_invoice",)),
                              ("validate_invoice", ()),
                              ("validate_invoice", ("match_purchase_order",)),
                              ("create_service_order", ("validate_invoice",)),
                              ("validate_invoice", ("execute_payment",))]:
            with self.subTest(intent=intent, scope=scope):
                action = replace(scenario.proposed_action, intent=intent, declared_scope=scope)
                evaluation = evaluate(replace(scenario, proposed_action=action))
                review = ReviewDecision("review-1", "Ada Reviewer", action.request_id,
                                        True, "2026-01-01T10:00:00Z")
                with self.assertRaises(ValueError):
                    apply_review(evaluation, review)

    def test_denied_review_keeps_quarantine_and_empty_scope(self):
        scenario = get_scenario("safe-invoice")
        evaluation = evaluate(replace(scenario, source=replace(scenario.source, integrity="unverified")))
        review = ReviewDecision("review-1", "Ada Reviewer", scenario.proposed_action.request_id,
                                False, "2026-01-01T10:00:00Z")
        reviewed = apply_review(evaluation, review)
        self.assertEqual(reviewed.decision.value, "quarantine")
        self.assertEqual(reviewed.allowed_action_scope, ())
        self.assertEqual(reviewed.review_decision, review)


if __name__ == "__main__":
    unittest.main()
