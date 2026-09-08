import argparse
import sys
from pathlib import Path

from .policy import evaluate
from .scenario import ScenarioValidationError, load_scenario
from .trace import build_trace, write_trace


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m atlas", description="ATLAS deterministic trust-boundary reference CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)
    run = subparsers.add_parser("run", help="evaluate one synthetic YAML scenario")
    run.add_argument("scenario", help="path to a scenario YAML fixture")
    run.add_argument("--output", required=True, type=Path, help="directory for trace.json and trace.md")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "run":
        try:
            scenario = load_scenario(Path(args.scenario))
            evaluation = evaluate(scenario)
            write_trace(build_trace(scenario, evaluation, run_id=scenario.scenario_id), args.output)
        except (OSError, ScenarioValidationError, ValueError) as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        print(f"{scenario.scenario_id}: {evaluation.decision.value.upper()} (score={evaluation.risk_score})")
        print(f"trace: {args.output / 'trace.json'}")
        return 0
    return 2
