"""Evaluate proxy-label agreement using disjoint source identifier groups.

This is not project-outcome validation. It does not alter model artifacts.
"""
import json
import random

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import GroupShuffleSplit, StratifiedGroupKFold

from ml.train_real import (
    FEATURE_COLS, LABEL_MAP, RANDOM_SEED, build_ward_features, derive_labels,
    generate_samples_from_ward, load_grievances, load_work_orders,
)


def build_samples(groups: pd.DataFrame) -> pd.DataFrame:
    if "ward" not in groups or groups["ward"].duplicated().any():
        raise ValueError("Expected distinct source identifier groups")
    np.random.seed(RANDOM_SEED)
    random.seed(RANDOM_SEED)
    rows = []
    for _, group in groups.iterrows():
        rows.extend({**sample, "source_group": str(group["ward"])}
                    for sample in generate_samples_from_ward(group, n_per_ward=20))
    return pd.DataFrame(rows)


def evaluate(samples: pd.DataFrame) -> dict:
    X = samples[FEATURE_COLS].to_numpy()
    y = samples["risk_label"].map(LABEL_MAP).to_numpy()
    groups = samples["source_group"].to_numpy()
    if len(set(groups)) < 5 or set(y) != set(LABEL_MAP.values()):
        raise ValueError("Evaluation requires at least five groups and all three labels")
    model = RandomForestClassifier(
        n_estimators=200, max_depth=6, min_samples_leaf=3,
        random_state=RANDOM_SEED, n_jobs=-1,
    )
    train, test = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=RANDOM_SEED).split(X, y, groups))
    if set(groups[train]) & set(groups[test]):
        raise RuntimeError("Training and test groups overlap")
    model.fit(X[train], y[train])
    predictions = model.predict(X[test])
    folds = []
    for train_idx, test_idx in StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=RANDOM_SEED).split(X, y, groups):
        if set(groups[train_idx]) & set(groups[test_idx]):
            raise RuntimeError("Cross-validation groups overlap")
        model.fit(X[train_idx], y[train_idx])
        folds.append(float(accuracy_score(y[test_idx], model.predict(X[test_idx]))))
    return {
        "evaluation": "group-disjoint synthetic proxy-label agreement; not observed outcomes",
        "source_groups": len(set(groups)),
        "train_groups": len(set(groups[train])),
        "test_groups": len(set(groups[test])),
        "train_samples": len(train),
        "test_samples": len(test),
        "holdout_accuracy": float(accuracy_score(y[test], predictions)),
        "holdout_report": classification_report(
            y[test], predictions, labels=[0, 1, 2], target_names=["LOW", "MEDIUM", "HIGH"],
            output_dict=True, zero_division=0,
        ),
        "cv_accuracy": folds,
        "cv_mean": float(np.mean(folds)),
        "cv_std": float(np.std(folds)),
        "limitations": [
            "Source identifiers are not a verified ward crosswalk.",
            "Samples and labels are generated proxies, not observed project outcomes.",
            "Label percentile thresholds use all source groups, including evaluation groups.",
            "Results evaluate the fixed random-forest baseline, not the deployed model.",
        ],
    }


def main() -> None:
    groups = derive_labels(build_ward_features(load_work_orders(), load_grievances()))
    print(json.dumps(evaluate(build_samples(groups)), indent=2))


if __name__ == "__main__":
    main()
