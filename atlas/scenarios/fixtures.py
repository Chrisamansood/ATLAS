from pathlib import Path

from ..scenario import load_scenario


ROOT = Path(__file__).resolve().parents[2]
SCENARIOS = {
    "safe-invoice": ROOT / "scenarios" / "safe-invoice.yaml",
    "invoice-payment-fraud": ROOT / "scenarios" / "invoice-payment-fraud.yaml",
    "safe-telecom-request": ROOT / "scenarios" / "safe-telecom-request.yaml",
    "telecom-provisioning-attack": ROOT / "scenarios" / "telecom-provisioning-attack.yaml",
}


def get_scenario(name: str):
    try:
        return load_scenario(SCENARIOS[name])
    except KeyError as exc:
        raise ValueError(f"unknown scenario: {name}") from exc
