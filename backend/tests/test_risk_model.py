import numpy as np

from ml import predict
from ml.features import FEATURE_COLUMNS
from ml.train_real import FEATURE_COLS


def test_training_and_inference_feature_order_match():
    assert FEATURE_COLUMNS == FEATURE_COLS


def test_prediction_uses_expected_feature_order_and_weighted_indicator(monkeypatch):
    class Model:
        def predict_proba(self, values):
            assert values.tolist() == [list(range(len(FEATURE_COLUMNS)))]
            return np.array([[0.2, 0.3, 0.5]])

    monkeypatch.setattr(predict, "_load_model", lambda: Model())
    monkeypatch.setattr(predict, "_load_metadata", lambda: {"model_version": "test"})
    features = {name: index for index, name in enumerate(FEATURE_COLUMNS)}
    assert predict.predict(features) == (65.0, "HIGH", "test")
