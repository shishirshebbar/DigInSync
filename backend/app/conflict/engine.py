"""
Conflict Detection Engine — Phase 3.

Fully deterministic. No LLM involvement.
Four conflict types:
  1. Spatial   — do the project geometries/road segments overlap?
  2. Temporal  — do the date ranges overlap?
  3. Impact    — do the work types cause compounding disruption?
  4. Dependency — does one work type require sequencing after another?

Scoring:
  conflict_score = weighted sum of the four components (0–100)
  severity: LOW (<30), MEDIUM (30–60), HIGH (>60)
"""
from __future__ import annotations

from datetime import date
from typing import NamedTuple


# ── Impact compatibility matrix ───────────────────────────────────────────────
# True = these two project types conflict when overlapping spatially+temporally
IMPACT_MATRIX: dict[frozenset, bool] = {
    frozenset({"water_pipeline", "telecom"}): True,
    frozenset({"water_pipeline", "electricity"}): True,
    frozenset({"water_pipeline", "road_repair"}): True,
    frozenset({"water_pipeline", "drainage"}): True,
    frozenset({"water_pipeline", "utility_maintenance"}): True,
    frozenset({"telecom", "electricity"}): True,
    frozenset({"telecom", "road_repair"}): True,
    frozenset({"telecom", "drainage"}): True,
    frozenset({"electricity", "road_repair"}): True,
    frozenset({"electricity", "drainage"}): True,
    frozenset({"road_repair", "drainage"}): True,
    frozenset({"road_repair", "utility_maintenance"}): True,
}

# Dependency pairs: key must complete before value can start
DEPENDENCY_PAIRS: list[tuple[str, str]] = [
    ("water_pipeline", "road_repair"),
    ("telecom", "road_repair"),
    ("electricity", "road_repair"),
    ("drainage", "road_repair"),
    ("utility_maintenance", "road_repair"),
]


class ConflictResult(NamedTuple):
    spatial_overlap: bool
    temporal_overlap: bool
    overlap_days: int
    impact_overlap: bool
    dependency_conflict: bool
    conflict_score: float
    severity: str  # LOW | MEDIUM | HIGH


def detect_temporal_overlap(
    start_a: date, end_a: date,
    start_b: date, end_b: date,
) -> tuple[bool, int]:
    """Return (overlaps, overlap_days)."""
    latest_start = max(start_a, start_b)
    earliest_end = min(end_a, end_b)
    delta = (earliest_end - latest_start).days
    if delta > 0:
        return True, delta
    return False, 0


def detect_impact_overlap(type_a: str, type_b: str) -> bool:
    return IMPACT_MATRIX.get(frozenset({type_a, type_b}), False)


def detect_dependency(type_a: str, type_b: str) -> bool:
    for first, second in DEPENDENCY_PAIRS:
        if {type_a, type_b} == {first, second}:
            return True
    return False


def score_conflict(
    spatial: bool,
    temporal: bool,
    overlap_days: int,
    impact: bool,
    dependency: bool,
) -> tuple[float, str]:
    """
    Weighted scoring:
      spatial:    30 pts
      temporal:   25 pts (+ up to 20 pts for overlap duration)
      impact:     15 pts
      dependency: 10 pts
    Max = 100
    """
    score = 0.0
    if spatial:
        score += 30
    if temporal:
        score += 25
        # Extra points for longer overlaps (max 20 pts for 14+ days)
        score += min(overlap_days / 14 * 20, 20)
    if impact:
        score += 15
    if dependency:
        score += 10

    score = min(score, 100)

    if score >= 60:
        severity = "HIGH"
    elif score >= 30:
        severity = "MEDIUM"
    else:
        severity = "LOW"

    return round(score, 1), severity


def analyze_pair(
    *,
    spatial_overlap: bool,
    start_a: date,
    end_a: date,
    start_b: date,
    end_b: date,
    type_a: str,
    type_b: str,
) -> ConflictResult:
    """Run all four detectors for a pair of projects."""
    temporal, overlap_days = detect_temporal_overlap(start_a, end_a, start_b, end_b)
    impact = detect_impact_overlap(type_a, type_b)
    dependency = detect_dependency(type_a, type_b)

    score, severity = score_conflict(
        spatial=spatial_overlap,
        temporal=temporal,
        overlap_days=overlap_days,
        impact=impact,
        dependency=dependency,
    )

    return ConflictResult(
        spatial_overlap=spatial_overlap,
        temporal_overlap=temporal,
        overlap_days=overlap_days,
        impact_overlap=impact,
        dependency_conflict=dependency,
        conflict_score=score,
        severity=severity,
    )
