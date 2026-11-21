"""Isolation Forest training and inference with an explicit feature schema."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .feature_schema import (
    FEATURE_NAMES,
    FEATURE_SCHEMA_VERSION,
    as_feature_dict,
    ordered_vector,
)

MODEL_VERSION = "1.0.0"
DEFAULT_CONTAMINATION = 0.1
DEFAULT_SEED = 42
DEFAULT_MAX_SAMPLES = 512


def train_model(
    x_train: np.ndarray,
    *,
    contamination: float = DEFAULT_CONTAMINATION,
    seed: int = DEFAULT_SEED,
    n_estimators: int = 300,
    max_samples: int = DEFAULT_MAX_SAMPLES,
) -> dict[str, Any]:
    """Train only on normal observations; return a serializable model bundle."""
    matrix = np.asarray(x_train, dtype=float)
    if matrix.ndim != 2 or matrix.shape[1] != len(FEATURE_NAMES):
        raise ValueError("Invalid training matrix")
    if len(matrix) < 10:
        raise ValueError("Not enough training observations")
    if not 0.0 < contamination <= 0.5:
        raise ValueError("contamination must be in (0, 0.5]")

    pipeline = Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "isolation_forest",
                IsolationForest(
                    n_estimators=n_estimators,
                    contamination=contamination,
                    random_state=seed,
                    max_samples=max_samples,
                ),
            ),
        ]
    )
    pipeline.fit(matrix)

    return {
        "model_version": MODEL_VERSION,
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "feature_names": list(FEATURE_NAMES),
        "pipeline": pipeline,
        "training_mean": matrix.mean(axis=0),
        "training_std": np.where(matrix.std(axis=0) == 0, 1.0, matrix.std(axis=0)),
        "config": {
            "contamination": contamination,
            "random_seed": seed,
            "n_estimators": n_estimators,
            "max_samples": max_samples,
        },
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


def save_model(bundle: dict[str, Any], path: str | Path) -> Path:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, destination)
    return destination


def load_model(path: str | Path) -> dict[str, Any]:
    bundle = joblib.load(Path(path))
    if bundle.get("feature_names") != list(FEATURE_NAMES):
        raise ValueError("Model feature schema does not match this module")
    return bundle


def predict(bundle: dict[str, Any], features: dict[str, float] | np.ndarray) -> dict[str, Any]:
    """Return an anomaly decision and the raw (uncalibrated) anomaly score."""
    vector = ordered_vector(features)
    pipeline = bundle["pipeline"]
    raw_score = float(pipeline.score_samples(vector.reshape(1, -1))[0])
    label = int(pipeline.predict(vector.reshape(1, -1))[0])

    z_scores = (vector - bundle["training_mean"]) / bundle["training_std"]
    deviations = sorted(
        (
            {
                "feature": name,
                "z_score": round(float(score), 3),
            }
            for name, score in zip(FEATURE_NAMES, z_scores)
        ),
        key=lambda item: abs(item["z_score"]),
        reverse=True,
    )[:3]

    return {
        "anomaly": label == -1,
        "anomaly_score": round(raw_score, 6),
        "model_version": bundle["model_version"],
        "schema_version": bundle["feature_schema_version"],
        "predicted_at": datetime.now(timezone.utc).isoformat(),
        "features": as_feature_dict(vector),
        "feature_deviations": deviations,
        "score_note": "Raw Isolation Forest score; lower means more anomalous. Not a probability.",
    }
