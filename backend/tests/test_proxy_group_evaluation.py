import numpy as np
import pandas as pd
import pytest

from ml.evaluate_proxy_groups import build_samples, evaluate


def test_generated_samples_keep_distinct_source_groups():
    groups = pd.DataFrame([
        {"ward": group, "risk_label": label, "work_order_count": 1,
         "total_grievances": 2, "road_grievances": 1, "composite_score": 4.0}
        for group, label in (("a", "LOW"), ("b", "MEDIUM"), ("c", "HIGH"))
    ])
    samples = build_samples(groups)
    assert samples.groupby("source_group").size().to_dict() == {"a": 20, "b": 20, "c": 20}
    assert samples.groupby("source_group")["risk_label"].nunique().eq(1).all()
    assert samples.equals(build_samples(groups))
    with pytest.raises(ValueError, match="five groups"):
        evaluate(samples)
    with pytest.raises(ValueError, match="distinct"):
        build_samples(pd.concat([groups, groups.iloc[[0]]], ignore_index=True))


def test_holdout_and_cross_validation_use_disjoint_groups(monkeypatch):
    seen = []

    class Model:
        def __init__(self, **kwargs):
            pass

        def fit(self, X, y):
            self.training_groups = set(X[:, 0])
            return self

        def predict(self, X):
            assert not self.training_groups.intersection(X[:, 0])
            seen.append(True)
            return np.zeros(len(X), dtype=int)

    monkeypatch.setattr("ml.evaluate_proxy_groups.RandomForestClassifier", Model)
    from ml.train_real import FEATURE_COLS
    records = []
    for group in range(15):
        for _ in range(2):
            row = {name: 0 for name in FEATURE_COLS}
            row[FEATURE_COLS[0]] = group
            row.update(source_group=str(group), risk_label=("LOW", "MEDIUM", "HIGH")[group % 3])
            records.append(row)
    result = evaluate(pd.DataFrame(records))
    assert result["train_groups"] + result["test_groups"] == 15
    assert len(result["cv_accuracy"]) == 5
    assert len(seen) == 6
