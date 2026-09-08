import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CliTests(unittest.TestCase):
    def test_fraud_scenario_writes_trace_and_returns_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "atlas",
                    "run",
                    "scenarios/invoice-payment-fraud.yaml",
                    "--output",
                    directory,
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("BLOCK", result.stdout)
            self.assertTrue((Path(directory) / "trace.json").exists())
            self.assertTrue((Path(directory) / "trace.md").exists())

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
