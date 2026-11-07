"""
ML inference — loads the trained model and runs predictions.

Keeps the model loaded in memory after first load (module-level singleton).
Thread-safe for uvicorn's async workers.
"""
from __future__ import annotations

import json
import joblib
import numpy as np
from pathlib import Path
from functools import lru_cache

MODEL_DIR = Path(__file__).parent / "models"

LABEL_INV = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}

# Risk score mapping: convert 3-class prediction to 0–100 score
# Uses predict_proba weighted sum: LOW→0, MEDIUM→50, HIGH→100
SCORE_WEIGHTS = np.array([0.0, 50.0, 100.0])


@lru_cache(maxsize=1)
def _load_model():
    model_path = MODEL_DIR / "risk_model.joblib"
    if not model_path.exists():
        raise FileNotFoundError(
            f"Model not found at {model_path}. "
            "Run: python -m ml.train"
        )
    return joblib.load(model_path)


@lru_cache(maxsize=1)
def _load_metadata() -> dict:
    meta_path = MODEL_DIR / "model_metadata.json"
    if meta_path.exists():
        with open(meta_path) as f:
            return json.load(f)
    return {"model_version": "1.0.0"}


def predict(features: dict) -> tuple[float, str, str]:
    """
    Run inference for a single project.

    Args:
        features: dict with keys matching FEATURE_COLS from train.py

    Returns:
        (risk_score 0–100, risk_level LOW/MEDIUM/HIGH, model_version)
    """
    from ml.features import FEATURE_COLUMNS

    model = _load_model()
    metadata = _load_metadata()

    # Build feature vector in training order
    X = np.array([[features.get(col, 0.0) for col in FEATURE_COLUMNS]])

    # Class probabilities → continuous score
    try:
        proba = model.predict_proba(X)[0]  # [p_low, p_med, p_high]
        risk_score = float(np.dot(proba, SCORE_WEIGHTS))
    except AttributeError:
        # Fallback if model doesn't support predict_proba
        pred_class = int(model.predict(X)[0])
        risk_score = SCORE_WEIGHTS[pred_class]

    # Determine level from score
    if risk_score >= 60:
        risk_level = "HIGH"
    elif risk_score >= 30:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    return round(risk_score, 1), risk_level, metadata.get("model_version", "1.0.0")
