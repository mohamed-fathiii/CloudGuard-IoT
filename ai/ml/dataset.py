"""Reproducible synthetic dataset for unsupervised IoT anomaly detection.

Training uses normal windows only. Evaluation uses separately generated held-out
normal and anomalous windows. Synthetic data does not prove production performance.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .feature_schema import FEATURE_NAMES, ordered_vector

NORMAL = 0
ANOMALOUS = 1
ANOMALY_TYPES = (
    "mqtt_flood",
    "abnormal_connection_frequency",
    "abnormal_payload_size",
    "abnormal_authentication",
    "unauthorized_access",
    "combined",
)


@dataclass(frozen=True)
class Dataset:
    x_train: np.ndarray
    y_train: np.ndarray
    x_val: np.ndarray
    y_val: np.ndarray
    x_test: np.ndarray
    y_test: np.ndarray
    test_labels: tuple[str, ...]


def _normal_window(rng: np.random.Generator) -> np.ndarray:
    mqtt = max(0.0, float(rng.poisson(8)))
    connections = max(0.0, float(rng.poisson(2)))
    payload = max(0.0, float(rng.normal(180, 40)))
    failed = max(0.0, float(rng.poisson(0.3)))
    return ordered_vector(
        {
            "mqtt_messages_per_minute": mqtt,
            "failed_auth_attempts": failed,
            "connection_attempts_per_minute": connections,
            "average_payload_size": payload,
            "max_payload_size": payload + abs(float(rng.normal(40, 12))),
            "unique_topics_accessed": float(rng.integers(1, 5)),
            "unauthorized_access_attempts": max(0.0, float(rng.poisson(0.1))),
            "event_frequency": mqtt + connections + max(0.0, float(rng.poisson(1))),
            "connection_failure_ratio": (
                min(1.0, failed / connections) if connections > 0 else 0.0
            ),
        }
    )


def _anomalous_window(
    rng: np.random.Generator, anomaly_type: str
) -> np.ndarray:
    values = {
        "mqtt_messages_per_minute": float(rng.poisson(8)),
        "failed_auth_attempts": float(rng.poisson(0.3)),
        "connection_attempts_per_minute": float(rng.poisson(2)),
        "average_payload_size": float(rng.normal(180, 40)),
        "max_payload_size": float(rng.normal(220, 50)),
        "unique_topics_accessed": float(rng.integers(1, 5)),
        "unauthorized_access_attempts": 0.0,
        "event_frequency": 10.0,
        "connection_failure_ratio": 0.0,
    }

    if anomaly_type == "mqtt_flood":
        values["mqtt_messages_per_minute"] = float(rng.uniform(150, 400))
        values["event_frequency"] = values["mqtt_messages_per_minute"] * 1.1
    elif anomaly_type == "abnormal_connection_frequency":
        values["connection_attempts_per_minute"] = float(rng.uniform(30, 80))
        values["failed_auth_attempts"] = float(rng.uniform(5, 20))
        values["connection_failure_ratio"] = float(rng.uniform(0.7, 1.0))
        values["event_frequency"] += values["connection_attempts_per_minute"]
    elif anomaly_type == "abnormal_payload_size":
        values["average_payload_size"] = float(rng.uniform(6000, 12000))
        values["max_payload_size"] = values["average_payload_size"] * float(
            rng.uniform(1.1, 2.0)
        )
    elif anomaly_type == "abnormal_authentication":
        values["failed_auth_attempts"] = float(rng.uniform(8, 30))
        values["connection_failure_ratio"] = float(rng.uniform(0.7, 1.0))
        values["connection_attempts_per_minute"] = float(rng.uniform(8, 25))
    elif anomaly_type == "unauthorized_access":
        values["unauthorized_access_attempts"] = float(rng.uniform(5, 20))
        values["unique_topics_accessed"] = float(rng.uniform(10, 40))
    elif anomaly_type == "combined":
        values["mqtt_messages_per_minute"] = float(rng.uniform(150, 350))
        values["connection_attempts_per_minute"] = float(rng.uniform(30, 70))
        values["average_payload_size"] = float(rng.uniform(5000, 11000))
        values["max_payload_size"] = values["average_payload_size"] * 1.5
        values["failed_auth_attempts"] = float(rng.uniform(10, 25))
        values["connection_failure_ratio"] = 0.9
        values["unauthorized_access_attempts"] = float(rng.uniform(5, 15))
        values["event_frequency"] = 400.0
    else:
        raise ValueError(f"Unknown anomaly type: {anomaly_type}")

    return ordered_vector(values)


def _labelled_windows(
    rng: np.random.Generator, n_normal: int, n_per_anomaly: int
) -> tuple[np.ndarray, np.ndarray]:
    x = np.array([_normal_window(rng) for _ in range(n_normal)])
    y = np.zeros(n_normal, dtype=int)
    for anomaly_type in ANOMALY_TYPES:
        for _ in range(n_per_anomaly):
            x = np.vstack([x, _anomalous_window(rng, anomaly_type)])
            y = np.append(y, ANOMALOUS)
    return x, y


def generate_dataset(
    n_train_normal: int = 600,
    n_val_normal: int = 100,
    n_test_normal: int = 150,
    n_val_per_anomaly: int = 20,
    n_test_per_anomaly: int = 30,
    seed: int = 20261121,
) -> Dataset:
    """Generate train/validation/test data with independent RNG streams."""
    if min(
        n_train_normal, n_val_normal, n_test_normal, n_val_per_anomaly, n_test_per_anomaly
    ) < 1:
        raise ValueError("Dataset sizes must be positive")

    train_rng = np.random.default_rng(seed)
    val_rng = np.random.default_rng(seed + 1)
    test_rng = np.random.default_rng(seed + 2)

    x_train = np.array([_normal_window(train_rng) for _ in range(n_train_normal)])
    y_train = np.zeros(n_train_normal, dtype=int)
    x_val, y_val = _labelled_windows(val_rng, n_val_normal, n_val_per_anomaly)
    x_test, y_test = _labelled_windows(test_rng, n_test_normal, n_test_per_anomaly)
    test_labels = ("normal",) * n_test_normal + tuple(
        name for name in ANOMALY_TYPES for _ in range(n_test_per_anomaly)
    )

    return Dataset(x_train, y_train, x_val, y_val, x_test, y_test, test_labels)


def validate_dataset(dataset: Dataset) -> None:
    """Fail fast on malformed or leaking datasets."""
    for name, matrix in (
        ("Training", dataset.x_train),
        ("Validation", dataset.x_val),
        ("Test", dataset.x_test),
    ):
        if matrix.ndim != 2 or matrix.shape[1] != len(FEATURE_NAMES):
            raise ValueError(f"{name} feature count does not match schema")
        if not np.all(np.isfinite(matrix)) or np.any(matrix < 0):
            raise ValueError(f"{name} contains invalid feature values")
    if len(dataset.y_train) != len(dataset.x_train):
        raise ValueError("Training labels and features differ in length")
    if len(dataset.y_val) != len(dataset.x_val):
        raise ValueError("Validation labels and features differ in length")
    if len(dataset.y_test) != len(dataset.x_test) or len(dataset.test_labels) != len(
        dataset.x_test
    ):
        raise ValueError("Test labels and features differ in length")
    if not np.all(dataset.y_train == NORMAL):
        raise ValueError("Training set must contain normal observations only")
    for name, labels in (("Validation", dataset.y_val), ("Test", dataset.y_test)):
        if not np.any(labels == NORMAL) or not np.any(labels == ANOMALOUS):
            raise ValueError(f"{name} must contain both normal and anomalous windows")

    train_rows = {row.tobytes() for row in dataset.x_train}
    if any(row.tobytes() in train_rows for row in dataset.x_val) or any(
        row.tobytes() in train_rows for row in dataset.x_test
    ):
        raise ValueError("Train/validation/test overlap detected")
