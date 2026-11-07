"""
ML Risk Model — Training Script.

Generates synthetic training data based on domain rules,
trains an XGBoost classifier (+ Random Forest baseline),
evaluates both, saves the best model as a joblib artifact.

Usage (from backend/):
    python -m ml.train

Output:
    ml/models/risk_model.joblib
    ml/models/model_metadata.json
"""
from __future__ import annotations

import json
import random
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import label_binarize
from sklearn.metrics import (
    classification_report, accuracy_score, roc_auc_score
)
import xgboost as xgb

MODEL_DIR = Path(__file__).parent / "models"
MODEL_DIR.mkdir(exist_ok=True)

MODEL_VERSION = "1.0.0"
RANDOM_SEED = 42
N_SAMPLES = 5000

# ── Synthetic data generation ─────────────────────────────────────────────────

def _risk_label(row: dict) -> str:
    """
    Domain-rule-based labelling for synthetic training data.
    Mirrors the conflict engine scoring logic.
    """
    score = 0.0

    # Road characteristics
    if row["road_width"] < 6:
        score += 15
    elif row["road_width"] < 9:
        score += 8

    if row["road_type_enc"] >= 5:  # primary+
        score += 10

    # Historical burden
    score += min(row["historical_work_orders"] / 50 * 20, 20)
    score += min(row["historical_road_repairs"] / 30 * 10, 10)
    score += min(row["pothole_count"] / 20 * 8, 8)
    score += min(row["grievance_count"] / 30 * 5, 5)

    # Current project load
    score += min(row["nearby_projects"] * 8, 24)
    score += min(row["existing_projects"] * 10, 20)
    score += min(row["number_of_overlapping_utilities"] * 5, 15)

    # Project characteristics
    if row["lane_closure"] == 1:
        score += 12
    score += min(row["project_duration"] / 30 * 10, 10)
    score += min(row["project_length"] / 500 * 5, 5)

    score = min(score, 100)

    if score >= 60:
        return "HIGH"
    elif score >= 30:
        return "MEDIUM"
    return "LOW"


# Feature ranges per risk tier — ensures balanced class distribution
_TIER_RANGES = {
    "LOW": {
        "road_width": (9.0, 16.0), "road_type_enc": (0, 3),
        "historical_work_orders": (0, 15), "historical_road_repairs": (0, 10),
        "pothole_count": (0, 5), "grievance_count": (0, 8),
        "existing_projects": (0, 1), "nearby_projects": (0, 1),
        "project_duration": (1, 10), "lane_closure": (0, 0),
        "project_length": (10, 150), "number_of_overlapping_utilities": (0, 1),
    },
    "MEDIUM": {
        "road_width": (6.0, 10.0), "road_type_enc": (2, 5),
        "historical_work_orders": (10, 50), "historical_road_repairs": (8, 30),
        "pothole_count": (4, 20), "grievance_count": (6, 25),
        "existing_projects": (1, 3), "nearby_projects": (1, 4),
        "project_duration": (7, 30), "lane_closure": (0, 1),
        "project_length": (100, 500), "number_of_overlapping_utilities": (1, 3),
    },
    "HIGH": {
        "road_width": (3.5, 7.0), "road_type_enc": (4, 7),
        "historical_work_orders": (40, 120), "historical_road_repairs": (25, 80),
        "pothole_count": (15, 50), "grievance_count": (20, 60),
        "existing_projects": (2, 5), "nearby_projects": (3, 8),
        "project_duration": (20, 60), "lane_closure": (1, 1),
        "project_length": (300, 1000), "number_of_overlapping_utilities": (2, 5),
    },
}


def generate_training_data(n: int = N_SAMPLES) -> pd.DataFrame:
    random.seed(RANDOM_SEED)
    np.random.seed(RANDOM_SEED)

    rows = []
    # Equal split across three tiers for balanced training
    per_tier = n // 3
    counts = {"LOW": per_tier, "MEDIUM": per_tier, "HIGH": n - 2 * per_tier}

    for label, count in counts.items():
        ranges = _TIER_RANGES[label]
        for _ in range(count):
            row = {
                feat: (
                    round(random.uniform(*r), 1) if isinstance(r[0], float)
                    else random.randint(*r)
                )
                for feat, r in ranges.items()
            }
            row["risk_label"] = label
            rows.append(row)

    random.shuffle(rows)
    return pd.DataFrame(rows)


# ── Training ──────────────────────────────────────────────────────────────────

FEATURE_COLS = [
    "road_width", "road_type_enc", "historical_work_orders",
    "historical_road_repairs", "pothole_count", "grievance_count",
    "existing_projects", "nearby_projects", "project_duration",
    "lane_closure", "project_length", "number_of_overlapping_utilities",
]
LABEL_MAP = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
LABEL_INV = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}


def train():
    print(f"Generating {N_SAMPLES} synthetic training samples…")
    df = generate_training_data(N_SAMPLES)

    label_dist = df["risk_label"].value_counts().to_dict()
    print(f"Label distribution: {label_dist}")

    X = df[FEATURE_COLS].values
    y = df["risk_label"].map(LABEL_MAP).values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_SEED, stratify=y
    )

    # ── XGBoost ───────────────────────────────────────────────────────────────
    print("\nTraining XGBoost…")
    xgb_model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        use_label_encoder=False,
        eval_metric="mlogloss",
        random_state=RANDOM_SEED,
        verbosity=0,
    )
    xgb_model.fit(X_train, y_train)
    xgb_preds = xgb_model.predict(X_test)
    xgb_acc = accuracy_score(y_test, xgb_preds)
    print(f"XGBoost accuracy: {xgb_acc:.4f}")
    print(classification_report(y_test, xgb_preds, target_names=["LOW", "MEDIUM", "HIGH"]))

    # ── Random Forest baseline ────────────────────────────────────────────────
    print("Training Random Forest baseline…")
    rf_model = RandomForestClassifier(
        n_estimators=100, max_depth=8, random_state=RANDOM_SEED, n_jobs=-1
    )
    rf_model.fit(X_train, y_train)
    rf_preds = rf_model.predict(X_test)
    rf_acc = accuracy_score(y_test, rf_preds)
    print(f"Random Forest accuracy: {rf_acc:.4f}")

    # ── Choose best ───────────────────────────────────────────────────────────
    best_model = xgb_model if xgb_acc >= rf_acc else rf_model
    best_name = "XGBoost" if xgb_acc >= rf_acc else "RandomForest"
    best_acc = max(xgb_acc, rf_acc)
    print(f"\nBest model: {best_name} (accuracy={best_acc:.4f})")

    # ── Cross-validation ──────────────────────────────────────────────────────
    cv_scores = cross_val_score(best_model, X, y, cv=5, scoring="accuracy")
    print(f"5-fold CV accuracy: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    # ── Feature importance ────────────────────────────────────────────────────
    importances = dict(zip(FEATURE_COLS, best_model.feature_importances_.tolist()))
    print("\nFeature importances:")
    for feat, imp in sorted(importances.items(), key=lambda x: -x[1]):
        print(f"  {feat:40s} {imp:.4f}")

    # ── Save model ────────────────────────────────────────────────────────────
    model_path = MODEL_DIR / "risk_model.joblib"
    joblib.dump(best_model, model_path)
    print(f"\nModel saved: {model_path}")

    # ── Save metadata ─────────────────────────────────────────────────────────
    metadata = {
        "model_version": MODEL_VERSION,
        "model_type": best_name,
        "trained_at": datetime.utcnow().isoformat(),
        "n_samples": N_SAMPLES,
        "feature_columns": FEATURE_COLS,
        "label_map": LABEL_MAP,
        "label_inv": LABEL_INV,
        "accuracy": round(best_acc, 4),
        "cv_mean": round(float(cv_scores.mean()), 4),
        "cv_std": round(float(cv_scores.std()), 4),
        "label_distribution": label_dist,
        "feature_importances": {k: round(v, 4) for k, v in importances.items()},
        "known_limitations": [
            "Trained on synthetic data — accuracy will improve with real BBMP data",
            "Does not account for seasonal traffic patterns",
            "Road_type encoding is ordinal — assumes linear relationship",
        ],
    }
    meta_path = MODEL_DIR / "model_metadata.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"Metadata saved: {meta_path}")

    return best_model, metadata


if __name__ == "__main__":
    train()
