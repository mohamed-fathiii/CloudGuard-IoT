"""Ordered numerical feature schema shared with src/lib/risk/ml-features.ts."""

from __future__ import annotations

import numpy as np

FEATURE_SCHEMA_VERSION = "1.0.0"

FEATURE_NAMES = (
    "mqtt_messages_per_minute",
    "failed_auth_attempts",
    "connection_attempts_per_minute",
    "average_payload_size",
    "max_payload_size",
    "unique_topics_accessed",
    "unauthorized_access_attempts",
    "event_frequency",
    "connection_failure_ratio",
)


def ordered_vector(values: dict[str, float] | np.ndarray) -> np.ndarray:
    """Return a 1-D float array in the exact training/inference order."""
    if isinstance(values, dict):
        missing = [name for name in FEATURE_NAMES if name not in values]
        if missing:
            raise ValueError(f"Missing features: {missing}")
        vector = np.array([values[name] for name in FEATURE_NAMES], dtype=float)
    else:
        vector = np.asarray(values, dtype=float).reshape(-1)

    if vector.shape != (len(FEATURE_NAMES),):
        raise ValueError(
            f"Expected {len(FEATURE_NAMES)} features, got {vector.shape[0]}"
        )
    if not np.all(np.isfinite(vector)) or np.any(vector < 0):
        raise ValueError("Features must be finite and non-negative")
    return vector


def as_feature_dict(vector: np.ndarray) -> dict[str, float]:
    array = ordered_vector(vector)
    return {name: float(value) for name, value in zip(FEATURE_NAMES, array)}
