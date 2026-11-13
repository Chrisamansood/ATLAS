import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CliTests(unittest.TestCase):
    def test_all_bundled_scenarios_emit_expected_decisions_and_scopes(self):
        cases = [
            ("safe-invoice", "allow", ["validate_invoice"]),
            ("invoice-payment-fraud", "block", []),
            ("safe-telecom-request", "allow", ["create_service_order"]),
            ("telecom-provisioning-attack", "block", []),
        ]
        for name, decision, scope in cases:
            with self.subTest(scenario=name), tempfile.TemporaryDirectory() as directory:
                result = subprocess.run(
                    [sys.executable, "-m", "atlas", "run", f"scenarios/{name}.yaml", "--output", directory],
                    cwd=ROOT, capture_output=True, text=True,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(decision.upper(), result.stdout)
                trace = json.loads((Path(directory) / "trace.json").read_text())
                self.assertEqual(trace["decision"], decision)
                self.assertEqual(trace["permitted_action_scope"], scope)
                self.assertTrue((Path(directory) / "trace.md").exists())

    def test_quarantine_is_a_successful_cli_result_without_permission(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "quarantine.yaml"
            fixture.write_text((ROOT / "scenarios/safe-invoice.yaml").read_text().replace(
                "integrity: verified", "integrity: unverified"))
            output = Path(directory) / "output"
            result = subprocess.run(
                [sys.executable, "-m", "atlas", "run", str(fixture), "--output", str(output)],
                cwd=ROOT, capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("QUARANTINE", result.stdout)
            trace = json.loads((output / "trace.json").read_text())
            self.assertEqual(trace["decision"], "quarantine")
            self.assertEqual(trace["permitted_action_scope"], [])

    def test_invalid_fixture_returns_nonzero(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "atlas",
                    "run",
                    "missing.yaml",
                    "--output",
                    directory,
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("error:", result.stderr)


if __name__ == "__main__":
    unittest.main()
