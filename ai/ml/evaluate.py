"""Held-out evaluation and reproducible training entry point."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score

from .dataset import Dataset, generate_dataset, validate_dataset
from .model import save_model, train_model


def evaluate_model(
    bundle: dict[str, Any], x_test: np.ndarray, y_test: np.ndarray
) -> dict[str, Any]:
    labels = bundle["pipeline"].predict(x_test)
    predicted = (labels == -1).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_test, predicted, labels=[0, 1]).ravel()

    return {
        "precision": round(float(precision_score(y_test, predicted, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, predicted, zero_division=0)), 4),
        "f1_score": round(float(f1_score(y_test, predicted, zero_division=0)), 4),
        "false_positive_rate": round(float(fp / (fp + tn)) if fp + tn else 0.0, 4),
        "confusion_matrix": {
            "true_negative": int(tn),
            "false_positive": int(fp),
            "false_negative": int(fn),
            "true_positive": int(tp),
        },
        "support": {"normal": int(tn + fp), "anomalous": int(fn + tp)},
        "model_version": bundle["model_version"],
        "training_config": bundle["config"],
    }


def select_contamination(
    dataset: Dataset, candidates: tuple[float, ...] = (0.01, 0.05, 0.1)
) -> tuple[float, float]:
    """Choose the operating point on validation data; the test set stays untouched."""
    best = (candidates[0], -1.0)
    for candidate in candidates:
        trial = train_model(dataset.x_train, contamination=candidate, seed=42)
        score = evaluate_model(trial, dataset.x_val, dataset.y_val)["f1_score"]
        if score > best[1]:
            best = (candidate, score)
    return best


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and evaluate the M4 Isolation Forest")
    parser.add_argument("--seed", type=int, default=20261121)
    parser.add_argument("--contamination", type=float, default=None)
    parser.add_argument(
        "--model-out", default=str(Path(__file__).resolve().parents[1] / "artifacts" / "model.joblib")
    )
    args = parser.parse_args()

    dataset = generate_dataset(seed=args.seed)
    validate_dataset(dataset)
    chosen, validation_f1 = select_contamination(dataset)
    contamination = args.contamination if args.contamination is not None else chosen
    bundle = train_model(dataset.x_train, contamination=contamination, seed=args.seed)
    save_model(bundle, args.model_out)
    metrics = evaluate_model(bundle, dataset.x_test, dataset.y_test)
    metrics["validation_f1"] = validation_f1
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
