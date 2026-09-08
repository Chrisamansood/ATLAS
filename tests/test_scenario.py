import tempfile
import unittest
from pathlib import Path

from atlas.scenario import ScenarioValidationError, load_scenario


class ScenarioLoaderTests(unittest.TestCase):
    def test_loads_minimal_valid_fixture(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "scenario.yaml"
            path.write_text(
                """id: demo
source:
  source_id: source-1
  source_type: invoice
  actor: trusted_system
  confidence: verified
  integrity: verified
content_summary: Synthetic invoice summary
proposed_action:
  domain: invoice
  intent: validate_invoice
  target: invoice-1
  declared_scope: validate_invoice
expected:
  decision: allow
""",
                encoding="utf-8",
            )
            scenario = load_scenario(path)

        self.assertEqual(scenario.scenario_id, "demo")
        self.assertEqual(scenario.source.source_id, "source-1")
        self.assertEqual(scenario.proposed_action.intent, "validate_invoice")
        self.assertEqual(scenario.expected_decision, "allow")

    def test_missing_proposed_action_is_actionable(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "scenario.yaml"
            path.write_text("id: demo\n", encoding="utf-8")
            with self.assertRaisesRegex(ScenarioValidationError, "proposed_action"):
                load_scenario(path)

    def test_rejects_list_syntax(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "scenario.yaml"
            path.write_text("id: demo\ntags:\n  - unsafe\n", encoding="utf-8")
            with self.assertRaisesRegex(ScenarioValidationError, "list"):
                load_scenario(path)


if __name__ == "__main__":
    unittest.main()
