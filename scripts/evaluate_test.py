from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.evaluation import evaluate_test_file


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Evaluate trained model on test npz")
    parser.add_argument("--test", required=True, help="Path to test npz")
    parser.add_argument(
        "--artifacts",
        default="artifacts",
        help="Artifacts dir (used for auto-selecting best_model.keras/model.keras)",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Optional explicit path to model. If omitted, best model is selected automatically.",
    )
    parser.add_argument("--metadata", default=None, help="Path to metadata json")
    parser.add_argument(
        "--output",
        default=None,
        help="Path to output evaluation json",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    artifacts_dir = Path(args.artifacts)
    result = evaluate_test_file(
        test_npz_path=args.test,
        model_path=args.model,
        artifacts_dir=artifacts_dir,
        metadata_path=args.metadata or (artifacts_dir / "metadata.json"),
        output_path=args.output or (artifacts_dir / "latest_test_eval.json"),
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
