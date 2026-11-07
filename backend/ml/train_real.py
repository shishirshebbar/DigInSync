"""
Real data label derivation + model retraining.

Uses real BBMP data:
  - data/raw/work_orders.csv  — BBMP work orders (ward, work type, amount)
  - data/raw/grievances.csv   — BBMP grievances (ward, category, date, status)

Approach:
  For each ward, compute:
    1. work_order_count        — how many work orders exist in that ward
    2. road_grievance_count    — grievances with road/infrastructure category
    3. total_grievance_count   — all grievances in that ward
    4. avg_work_order_amount   — proxy for project scale
    5. road_work_fraction      — fraction of work orders that are road-related

  Labels are composite-score percentile categories, not observed outcomes.
  Work-order ward numbers and grievance ward names are not crosswalked.
  Project-like training features are synthetic; random sample-level evaluation
  can include samples from the same source group on both sides of the split.
  The resulting model and reported metrics are experimental.

Usage (from backend/):
    python -m ml.train_real
"""
from __future__ import annotations

import re
import json
import random
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime

from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.metrics import classification_report, accuracy_score
from sklearn.preprocessing import LabelEncoder
import xgboost as xgb

# Files can be in data/raw/ or data/raw/bbmp/ — check both
_RAW_BASE = Path(__file__).parents[2] / "data" / "raw"
RAW_DIR = _RAW_BASE / "bbmp" if (_RAW_BASE / "bbmp" / "work_orders.csv").exists() else _RAW_BASE
MODEL_DIR = Path(__file__).parent / "models"
MODEL_DIR.mkdir(exist_ok=True)

MODEL_VERSION = "2.0.0"
RANDOM_SEED = 42

# ── Road-related grievance categories ────────────────────────────────────────
ROAD_CATEGORIES = {
    "Roads", "Road", "Road Related", "Footpath", "Footpath Related",
    "Storm Water Drain", "Storm Water Drain Related", "Encroachment",
    "Road Damage", "Pothole", "Road Block",
}

# Work order description keywords indicating road/infrastructure work
ROAD_KEYWORDS = [
    "road", "drain", "footpath", "pavement", "tar", "asphalt",
    "pipeline", "water", "sewer", "cable", "electric", "street light",
    "flyover", "underpass", "junction", "signal",
]

LABEL_MAP = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
LABEL_INV = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}

FEATURE_COLS = [
    "road_width", "road_type_enc", "historical_work_orders",
    "historical_road_repairs", "pothole_count", "grievance_count",
    "existing_projects", "nearby_projects", "project_duration",
    "lane_closure", "project_length", "number_of_overlapping_utilities",
]


# ── Data loading ──────────────────────────────────────────────────────────────

def load_work_orders() -> pd.DataFrame:
    path = RAW_DIR / "work_orders.csv"
    df = pd.read_csv(path, low_memory=False)
    df.columns = [c.strip().lstrip("\ufeff") for c in df.columns]

    # Extract work type from wodetails description
    df["work_description"] = df["wodetails"].fillna("").str.lower()
    df["is_road_work"] = df["work_description"].apply(
        lambda x: any(kw in x for kw in ROAD_KEYWORDS)
    )
    df["ward"] = df["ward"].astype(str).str.strip()
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0)
    return df


def load_grievances() -> pd.DataFrame:
    path = RAW_DIR / "grievances.csv"
    df = pd.read_csv(path, low_memory=False)
    df.columns = [c.strip().lstrip("\ufeff") for c in df.columns]
    df["ward"] = df["Ward Name"].fillna("").str.strip()
    df["is_road_grievance"] = df["Category"].apply(
        lambda x: any(kw.lower() in str(x).lower() for kw in ROAD_CATEGORIES)
    )
    return df


# ── Ward-level feature engineering ───────────────────────────────────────────

def build_ward_features(wo_df: pd.DataFrame, gr_df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate real data to ward level."""

    # Work order stats per ward
    wo_stats = wo_df.groupby("ward").agg(
        work_order_count=("id", "count"),
        road_work_count=("is_road_work", "sum"),
        avg_amount=("amount", "mean"),
    ).reset_index()
    wo_stats["road_work_fraction"] = (
        wo_stats["road_work_count"] / wo_stats["work_order_count"].clip(lower=1)
    )

    # Grievance stats per ward
    gr_stats = gr_df.groupby("ward").agg(
        total_grievances=("Complaint ID", "count"),
        road_grievances=("is_road_grievance", "sum"),
    ).reset_index()

    # Merge
    ward_df = pd.merge(wo_stats, gr_stats, on="ward", how="outer").fillna(0)

    # Grievances per work order (disruption density)
    ward_df["grievance_per_wo"] = (
        ward_df["road_grievances"] / ward_df["work_order_count"].clip(lower=1)
    )

    return ward_df


def derive_labels(ward_df: pd.DataFrame) -> pd.DataFrame:
    """
    Assign disruption risk labels using a composite score
    from multiple signals, then split into terciles.
    """
    # Composite risk score per ward (normalised 0–100)
    def composite(row):
        score = 0.0
        # Grievances per work order (capped at 50)
        score += min(row["grievance_per_wo"] / 50, 1.0) * 40
        # Total grievances (capped at 2000)
        score += min(row["total_grievances"] / 2000, 1.0) * 30
        # Road grievances fraction
        total = row["total_grievances"] or 1
        score += (row["road_grievances"] / total) * 20
        # Work order count (more work = more disruption potential, capped at 20)
        score += min(row["work_order_count"] / 20, 1.0) * 10
        return round(score, 3)

    ward_df["composite_score"] = ward_df.apply(composite, axis=1)

    p33 = ward_df["composite_score"].quantile(0.33)
    p66 = ward_df["composite_score"].quantile(0.66)
    print(f"  Composite score percentiles — p33: {p33:.3f}, p66: {p66:.3f}")

    def label(row):
        if row["composite_score"] >= p66:
            return "HIGH"
        elif row["composite_score"] >= p33:
            return "MEDIUM"
        return "LOW"

    ward_df["risk_label"] = ward_df.apply(label, axis=1)
    return ward_df


# ── Training sample generation ────────────────────────────────────────────────

def generate_samples_from_ward(ward_row: pd.Series, n_per_ward: int = 15) -> list[dict]:
    """
    Generate project samples using real ward statistics as the mean,
    with heavy Gaussian noise so feature distributions overlap between
    tiers — forcing the model to learn probabilistic boundaries.
    """
    label = ward_row["risk_label"]
    wo_count = max(int(ward_row["work_order_count"]), 1)
    gr_count = max(int(ward_row["total_grievances"]), 1)
    road_gr = max(int(ward_row["road_grievances"]), 0)
    composite = float(ward_row["composite_score"])

    # Map composite score (0–100) to feature means — high noise ensures overlap
    def sample_feature(mean, std, lo, hi):
        """Sample from normal distribution, clipped to valid range."""
        v = np.random.normal(mean, std)
        return round(float(np.clip(v, lo, hi)), 1)

    samples = []
    for _ in range(n_per_ward):
        # Features derived from real ward data — std = 50% of mean for heavy overlap
        hist_wo = sample_feature(wo_count / 8, wo_count / 8 + 2, 0, 120)
        hist_rr = sample_feature(road_gr / 4, road_gr / 4 + 2, 0, 80)
        pothole = sample_feature(road_gr / 8, road_gr / 8 + 1, 0, 50)
        grievance = sample_feature(gr_count / 15, gr_count / 15 + 2, 0, 60)

        # Road characteristics: composite score maps to road type/width
        # but with enough noise that LOW/MEDIUM/HIGH overlap significantly
        road_width_mean = 12.0 - (composite / 100) * 8.0  # 12 at score=0, 4 at score=100
        road_type_mean = (composite / 100) * 6              # 0 at score=0, 6 at score=100

        sample = {
            "road_width": sample_feature(road_width_mean, 2.5, 3.5, 16.0),
            "road_type_enc": int(np.clip(np.random.normal(road_type_mean, 2), 0, 7)),
            "historical_work_orders": int(max(0, hist_wo)),
            "historical_road_repairs": int(max(0, hist_rr)),
            "pothole_count": int(max(0, pothole)),
            "grievance_count": int(max(0, grievance)),
            "existing_projects": int(np.clip(np.random.normal(composite / 25, 1.5), 0, 5)),
            "nearby_projects": int(np.clip(np.random.normal(composite / 20, 2), 0, 8)),
            "project_duration": int(np.clip(np.random.normal(5 + composite / 3, 8), 1, 60)),
            "lane_closure": 1 if random.random() < (composite / 100) * 0.8 else 0,
            "project_length": sample_feature(50 + composite * 9, 150, 10, 1000),
            "number_of_overlapping_utilities": int(np.clip(
                np.random.normal(composite / 30, 1), 0, 5
            )),
            "risk_label": label,
        }
        samples.append(sample)

    return samples


# ── Training ──────────────────────────────────────────────────────────────────

def train_real():
    print("Loading real BBMP data...")
    wo_df = load_work_orders()
    gr_df = load_grievances()
    print(f"  Work orders: {len(wo_df):,}")
    print(f"  Grievances:  {len(gr_df):,}")

    print("\nBuilding ward-level features...")
    ward_df = build_ward_features(wo_df, gr_df)
    ward_df = derive_labels(ward_df)

    label_dist = ward_df["risk_label"].value_counts().to_dict()
    print(f"  Unverified ward identifier groups processed: {len(ward_df)}")
    print(f"  Ward label distribution: {label_dist}")

    # Generate per-project training samples from ward data
    print("\nGenerating training samples from real ward data...")
    all_samples = []
    for _, row in ward_df.iterrows():
        all_samples.extend(generate_samples_from_ward(row, n_per_ward=20))

    random.shuffle(all_samples)
    df = pd.DataFrame(all_samples)

    sample_dist = df["risk_label"].value_counts().to_dict()
    print(f"  Total training samples: {len(df):,}")
    print(f"  Sample label distribution: {sample_dist}")

    X = df[FEATURE_COLS].values
    y = df["risk_label"].map(LABEL_MAP).values

    # Ensure all 3 classes present
    unique_classes = np.unique(y)
    if len(unique_classes) < 3:
        print(f"  Warning: only {len(unique_classes)} classes in data: {unique_classes}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_SEED, stratify=y
    )

    # ── XGBoost ───────────────────────────────────────────────────────────────
    print("\nTraining XGBoost on real-derived data...")
    xgb_model = xgb.XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        gamma=0.1,
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
    print("Training Random Forest baseline...")
    rf_model = RandomForestClassifier(
        n_estimators=200, max_depth=6,
        min_samples_leaf=3, random_state=RANDOM_SEED, n_jobs=-1
    )
    rf_model.fit(X_train, y_train)
    rf_preds = rf_model.predict(X_test)
    rf_acc = accuracy_score(y_test, rf_preds)
    print(f"Random Forest accuracy: {rf_acc:.4f}")

    # ── Best model ────────────────────────────────────────────────────────────
    best_model = xgb_model if xgb_acc >= rf_acc else rf_model
    best_name = "XGBoost" if xgb_acc >= rf_acc else "RandomForest"
    best_acc = max(xgb_acc, rf_acc)
    print(f"\nBest model: {best_name} (experimental sample-level accuracy={best_acc:.4f})")

    # ── Cross-validation ──────────────────────────────────────────────────────
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_SEED)
    cv_scores = cross_val_score(best_model, X, y, cv=cv, scoring="accuracy")
    print(f"5-fold CV: {cv_scores.mean():.4f} +/- {cv_scores.std():.4f}")

    # ── Feature importances ───────────────────────────────────────────────────
    importances = dict(zip(FEATURE_COLS, best_model.feature_importances_.tolist()))
    print("\nFeature importances:")
    for feat, imp in sorted(importances.items(), key=lambda x: -x[1]):
        print(f"  {feat:40s} {imp:.4f}")

    # ── Save ──────────────────────────────────────────────────────────────────
    model_path = MODEL_DIR / "risk_model.joblib"
    joblib.dump(best_model, model_path)
    print(f"\nModel saved: {model_path}")

    metadata = {
        "model_version": MODEL_VERSION,
        "model_type": best_name,
        "trained_at": datetime.utcnow().isoformat(),
        "data_source": "Real BBMP data — ward-level features from OpenCity CKAN API",
        "n_wards": len(ward_df),
        "n_wards_note": "Unverified source identifier groups; not a count of verified distinct wards",
        "experimental": True,
        "evaluation": "Random sample-level holdout and cross-validation; groups can overlap",
        "ward_label_distribution": label_dist,
        "n_samples": len(df),
        "sample_label_distribution": sample_dist,
        "feature_columns": FEATURE_COLS,
        "label_map": LABEL_MAP,
        "label_inv": LABEL_INV,
        "accuracy": round(best_acc, 4),
        "cv_mean": round(float(cv_scores.mean()), 4),
        "cv_std": round(float(cv_scores.std()), 4),
        "feature_importances": {k: round(v, 4) for k, v in importances.items()},
        "known_limitations": [
            "Experimental model: labels are composite-score percentile categories, not observed project disruption outcomes",
            "Samples and multiple project features are synthetically generated from source identifier groups",
            "Work-order ward numbers and grievance ward names have not been reconciled; group counts are not verified unique wards",
            "Random sample-level splits and cross-validation can include samples from the same group in training and evaluation",
            "Accuracy measures agreement with proxy labels on generated samples, not real-world disruption prediction",
        ],
    }
    meta_path = MODEL_DIR / "model_metadata.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"Metadata saved: {meta_path}")

    return best_model, metadata


if __name__ == "__main__":
    train_real()
