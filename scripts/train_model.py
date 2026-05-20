from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.training import train


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train alien signal classifier")
    parser.add_argument("--data", default="Data.npz", help="Path to train/valid npz file")
    parser.add_argument("--artifacts", default="artifacts", help="Directory to store model and logs")
    parser.add_argument("--epochs", type=int, default=30, help="Number of epochs")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    result = train(
        data_path=args.data,
        artifacts_dir=args.artifacts,
        epochs=args.epochs,
        batch_size=args.batch_size,
        seed=args.seed,
    )

    print("Training completed")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
