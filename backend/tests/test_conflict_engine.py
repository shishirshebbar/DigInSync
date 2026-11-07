"""
Unit tests for the conflict detection engine.
Pure Python — no database required.

Run from backend/:
    python -m pytest tests/test_conflict_engine.py -v
"""
import pytest
from datetime import date
from app.conflict.engine import (
    detect_temporal_overlap,
    detect_impact_overlap,
    detect_dependency,
    score_conflict,
    analyze_pair,
)


# ── Temporal overlap ──────────────────────────────────────────────────────────

def test_temporal_overlap_exact():
    overlaps, days = detect_temporal_overlap(
        date(2026, 11, 10), date(2026, 11, 15),
        date(2026, 11, 12), date(2026, 11, 17),
    )
    assert overlaps is True
    assert days == 3  # 12,13,14


def test_temporal_no_overlap():
    overlaps, days = detect_temporal_overlap(
        date(2026, 11, 1), date(2026, 11, 5),
        date(2026, 11, 6), date(2026, 11, 10),
    )
    assert overlaps is False
    assert days == 0


def test_temporal_adjacent_no_overlap():
    # End date of A == start date of B → no overlap (0 days)
    overlaps, days = detect_temporal_overlap(
        date(2026, 11, 1), date(2026, 11, 5),
        date(2026, 11, 5), date(2026, 11, 10),
    )
    assert overlaps is False
    assert days == 0


def test_temporal_full_containment():
    overlaps, days = detect_temporal_overlap(
        date(2026, 11, 1), date(2026, 11, 30),
        date(2026, 11, 10), date(2026, 11, 15),
    )
    assert overlaps is True
    assert days == 5


# ── Impact overlap ────────────────────────────────────────────────────────────

def test_impact_water_telecom():
    assert detect_impact_overlap("water_pipeline", "telecom") is True


def test_impact_water_road_repair():
    assert detect_impact_overlap("water_pipeline", "road_repair") is True


def test_impact_order_independent():
    assert detect_impact_overlap("road_repair", "water_pipeline") is True


def test_impact_no_conflict():
    # Two street_light projects — not in matrix
    assert detect_impact_overlap("street_light", "street_light") is False


# ── Dependency detection ──────────────────────────────────────────────────────

def test_dependency_water_then_road():
    assert detect_dependency("water_pipeline", "road_repair") is True


def test_dependency_order_independent():
    assert detect_dependency("road_repair", "water_pipeline") is True


def test_dependency_no_relation():
    assert detect_dependency("telecom", "street_light") is False


# ── Scoring ───────────────────────────────────────────────────────────────────

def test_score_high_all_factors():
    score, severity = score_conflict(
        spatial=True, temporal=True, overlap_days=14,
        impact=True, dependency=True,
    )
    assert score == 100.0
    assert severity == "HIGH"


def test_score_spatial_only():
    score, severity = score_conflict(
        spatial=True, temporal=False, overlap_days=0,
        impact=False, dependency=False,
    )
    assert score == 30.0
    assert severity == "MEDIUM"


def test_score_temporal_only_short():
    score, severity = score_conflict(
        spatial=False, temporal=True, overlap_days=2,
        impact=False, dependency=False,
    )
    # 25 base + (2/14 * 20) ≈ 25 + 2.86 = 27.86
    assert score < 30
    assert severity == "LOW"


def test_score_capped_at_100():
    score, _ = score_conflict(
        spatial=True, temporal=True, overlap_days=100,
        impact=True, dependency=True,
    )
    assert score == 100.0


# ── Full analyze_pair ─────────────────────────────────────────────────────────

def test_analyze_pair_high_conflict():
    result = analyze_pair(
        spatial_overlap=True,
        start_a=date(2026, 11, 10), end_a=date(2026, 11, 18),
        start_b=date(2026, 11, 12), end_b=date(2026, 11, 20),
        type_a="water_pipeline",
        type_b="telecom",
    )
    assert result.spatial_overlap is True
    assert result.temporal_overlap is True
    assert result.overlap_days == 6
    assert result.impact_overlap is True
    assert result.severity == "HIGH"


def test_analyze_pair_no_temporal():
    result = analyze_pair(
        spatial_overlap=True,
        start_a=date(2026, 11, 1), end_a=date(2026, 11, 5),
        start_b=date(2026, 11, 10), end_b=date(2026, 11, 15),
        type_a="water_pipeline",
        type_b="telecom",
    )
    assert result.temporal_overlap is False
    assert result.overlap_days == 0
    assert result.severity == "MEDIUM"  # spatial only = 30 = MEDIUM


def test_analyze_pair_no_conflict():
    """No spatial, no temporal → only impact type contributes (15pts) → LOW."""
    result = analyze_pair(
        spatial_overlap=False,
        start_a=date(2026, 11, 1), end_a=date(2026, 11, 5),
        start_b=date(2026, 11, 10), end_b=date(2026, 11, 15),
        type_a="water_pipeline",
        type_b="telecom",
    )
    assert result.spatial_overlap is False
    assert result.temporal_overlap is False
    assert result.conflict_score == 15.0  # impact type recorded even without overlap
    assert result.severity == "LOW"
