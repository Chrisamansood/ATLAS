import json
import tempfile
import unittest
from pathlib import Path

from atlas.policy import evaluate
from atlas.models import ReviewDecision
from atlas.policy import apply_review
from atlas.scenarios.fixtures import get_scenario
from atlas.trace import build_trace, render_markdown, write_trace


class TraceTests(unittest.TestCase):
    def test_trace_contains_contract_fields_without_raw_content(self):
        scenario = get_scenario("invoice-payment-fraud")
        trace = build_trace(scenario, evaluate(scenario), run_id="run-1")
        self.assertEqual(trace["decision"], "block")
        self.assertIn("provenance", trace)
        self.assertIn("normalized_action", trace)
        self.assertIn("triggered_rules", trace)
        self.assertIn("score", trace)
        self.assertIn("permitted_action_scope", trace)
        self.assertNotIn("raw_content", json.dumps(trace))
        self.assertNotIn("hidden_reasoning", json.dumps(trace))

    def test_markdown_is_readable(self):
        scenario = get_scenario("safe-invoice")
        trace = build_trace(scenario, evaluate(scenario), run_id="run-1")
        markdown = render_markdown(trace)
        self.assertIn("Decision: `allow`", markdown)
        self.assertIn("Triggered rules", markdown)

    def test_write_trace_creates_json_and_markdown(self):
        scenario = get_scenario("safe-invoice")
        trace = build_trace(scenario, evaluate(scenario), run_id="run-1")
        with tempfile.TemporaryDirectory() as directory:
            paths = write_trace(trace, Path(directory))
            self.assertTrue(paths[0].exists())
            self.assertTrue(paths[1].exists())

    def test_review_decision_is_structured_when_present(self):
        scenario = get_scenario("safe-invoice")
        evaluation = evaluate(scenario)
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
            request_id=scenario.proposed_action.request_id,
            approved=True,
            recorded_at="2026-01-01T10:00:00Z",
            reason="Synthetic evidence checked",
        )
        trace = build_trace(scenario, apply_review(evaluation, review), run_id="run-1")
        self.assertEqual(trace["review_decision"]["reviewer"], "Ada Reviewer")
        self.assertTrue(trace["review_decision"]["approved"])


if __name__ == "__main__":
    unittest.main()
