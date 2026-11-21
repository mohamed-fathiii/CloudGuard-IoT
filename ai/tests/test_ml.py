"""Unit tests for the independent M4 ML module (stdlib unittest)."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from ml.dataset import ANOMALY_TYPES, Dataset, generate_dataset, validate_dataset
from ml.evaluate import evaluate_model, select_contamination
from ml.feature_schema import FEATURE_NAMES, as_feature_dict, ordered_vector
from ml.model import MODEL_VERSION, load_model, predict, save_model, train_model


class FeatureSchemaTests(unittest.TestCase):
    def test_ordering_is_stable_and_named(self):
        values = {name: float(index) for index, name in enumerate(FEATURE_NAMES)}
        vector = ordered_vector(values)
        self.assertEqual(vector.tolist(), [float(i) for i in range(len(FEATURE_NAMES))])
        self.assertEqual(list(as_feature_dict(vector)), list(FEATURE_NAMES))

    def test_invalid_vectors_are_rejected(self):
        with self.assertRaises(ValueError):
            ordered_vector({"mqtt_messages_per_minute": 1})
        with self.assertRaises(ValueError):
            ordered_vector(np.zeros(len(FEATURE_NAMES) - 1))
        with self.assertRaises(ValueError):
            ordered_vector(np.array([-1.0] * len(FEATURE_NAMES)))
        with self.assertRaises(ValueError):
            ordered_vector(np.array([np.nan] * len(FEATURE_NAMES)))


class DatasetTests(unittest.TestCase):
    def test_dataset_is_reproducible_and_valid(self):
        first = generate_dataset(seed=123)
        second = generate_dataset(seed=123)
        validate_dataset(first)
        np.testing.assert_array_equal(first.x_train, second.x_train)
        np.testing.assert_array_equal(first.x_test, second.x_test)
        self.assertTrue(np.all(first.y_train == 0))
        self.assertIn("normal", first.test_labels)
        self.assertTrue(set(first.test_labels).issuperset(set(ANOMALY_TYPES)))

    def test_validation_rejects_leakage_and_bad_shapes(self):
        dataset = generate_dataset()
        validate_dataset(dataset)
        leaking = Dataset(
            dataset.x_train,
            dataset.y_train,
            dataset.x_val,
            dataset.y_val,
            np.vstack([dataset.x_test, dataset.x_train[0]]),
            np.append(dataset.y_test, 0),
            (*dataset.test_labels, "normal"),
        )
        with self.assertRaises(ValueError):
            validate_dataset(leaking)
        with self.assertRaises(ValueError):
            validate_dataset(
                Dataset(
                    dataset.x_train[:, :-1],
                    dataset.y_train,
                    dataset.x_val,
                    dataset.y_val,
                    dataset.x_test,
                    dataset.y_test,
                    dataset.test_labels,
                )
            )


class ModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = generate_dataset()
        validate_dataset(cls.dataset)
        cls.contamination, cls.validation_f1 = select_contamination(cls.dataset)
        cls.bundle = train_model(cls.dataset.x_train, contamination=cls.contamination)

    def test_training_produces_versioned_bundle(self):
        self.assertEqual(self.bundle["model_version"], MODEL_VERSION)
        self.assertEqual(self.bundle["feature_names"], list(FEATURE_NAMES))
        self.assertEqual(self.bundle["config"]["contamination"], self.contamination)
        self.assertIn(self.contamination, (0.01, 0.05, 0.1))

    def test_training_is_deterministic(self):
        other = train_model(self.dataset.x_train, seed=self.bundle["config"]["random_seed"])
        np.testing.assert_array_equal(
            self.bundle["pipeline"].predict(self.dataset.x_test),
            other["pipeline"].predict(self.dataset.x_test),
        )

    def test_inference_contract(self):
        features = as_feature_dict(self.dataset.x_test[0])
        result = predict(self.bundle, features)
        self.assertIn("anomaly", result)
        self.assertIsInstance(result["anomaly"], bool)
        self.assertIsInstance(result["anomaly_score"], float)
        self.assertEqual(result["model_version"], MODEL_VERSION)
        self.assertEqual(set(result["features"]), set(FEATURE_NAMES))
        self.assertNotIn("probability", result)
        self.assertLessEqual(len(result["feature_deviations"]), 3)

    def test_inference_rejects_bad_features(self):
        with self.assertRaises(ValueError):
            predict(self.bundle, {"mqtt_messages_per_minute": 1})

    def test_save_load_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            path = save_model(self.bundle, Path(directory) / "model.joblib")
            loaded = load_model(path)
            self.assertEqual(loaded["model_version"], MODEL_VERSION)
            np.testing.assert_array_equal(
                predict(self.bundle, self.dataset.x_test[0])["anomaly_score"],
                predict(loaded, self.dataset.x_test[0])["anomaly_score"],
            )

    def test_contamination_configuration_is_respected(self):
        with self.assertRaises(ValueError):
            train_model(self.dataset.x_train, contamination=0)

    def test_held_out_metrics_are_real_and_useful(self):
        metrics = evaluate_model(self.bundle, self.dataset.x_test, self.dataset.y_test)
        self.assertGreaterEqual(metrics["precision"], 0.8)
        self.assertGreaterEqual(metrics["recall"], 0.8)
        self.assertLessEqual(metrics["false_positive_rate"], 0.2)
        matrix = metrics["confusion_matrix"]
        self.assertEqual(
            sum(matrix.values()), len(self.dataset.y_test)
        )
        print("ML evaluation metrics:", metrics)


if __name__ == "__main__":
    unittest.main()
