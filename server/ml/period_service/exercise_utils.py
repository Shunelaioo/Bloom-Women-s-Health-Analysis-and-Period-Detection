"""Utility helpers for exercise-derived features.

We keep this logic separate so both the FastAPI endpoint and any future
batch preprocessing can share the exact calorie computation.

Calories burned (kcal) = MET * weight_kg * duration_hours
"""

from __future__ import annotations

from typing import Optional


def calories_from_met(
    *,
    met: Optional[float],
    weight_kg: Optional[float],
    duration_minutes: Optional[float] = None,
    duration_hours: Optional[float] = None,
) -> float:
    """Compute exercise calories using the standard MET formula.

    Missing or non-positive inputs return 0.0 so downstream aggregations
    behave consistently with the model's expectations.
    """
    try:
        met_val = float(met) if met is not None else 0.0
        weight_val = float(weight_kg) if weight_kg is not None else 0.0
        hours = (
            float(duration_hours)
            if duration_hours is not None
            else (float(duration_minutes) / 60.0 if duration_minutes is not None else 0.0)
        )
    except (TypeError, ValueError):
        return 0.0

    if met_val <= 0 or weight_val <= 0 or hours <= 0:
        return 0.0

    return met_val * weight_val * hours
