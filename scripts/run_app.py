from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.gui import run_gui


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run GUI for alien signal classifier")
    parser.add_argument("--db", default="artifacts/users.db", help="Path to sqlite db")
    parser.add_argument("--artifacts", default="artifacts", help="Artifacts directory")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    run_gui(db_path=args.db, artifacts_dir=args.artifacts)


if __name__ == "__main__":
    main()
