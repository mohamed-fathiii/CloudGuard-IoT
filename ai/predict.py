"""CLI inference bridge for the optional M4 AI integration."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from ml.model import load_model, predict


def main() -> None:
    parser = argparse.ArgumentParser(description="Score one feature window")
    parser.add_argument(
        "--model", default=str(Path(__file__).resolve().parent / "artifacts" / "model.joblib")
    )
    parser.add_argument("--features", help="JSON object of named features (or @path to a file)")
    args = parser.parse_args()

    if args.features:
        source = Path(args.features[1:]).read_text(encoding="utf-8") if args.features.startswith("@") else args.features
    else:
        source = __import__("sys").stdin.read()

    features = json.loads(source)
    result = predict(load_model(args.model), features)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
