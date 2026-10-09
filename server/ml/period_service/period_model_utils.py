"""
period_model_utils.py
---------------------
Feature engineering utilities that match the training logic in your notebook.

Target the model was trained on:
- Predict next cycle length in days: t_next_period

Expected DAILY LOG columns (per user, per day):
- id (int/str user id)
- day_in_study (int day index, increasing by 1 each day)  OR you can map dates -> day_in_study
- flow_volume (str)  # used to detect period days
- efficiency (float) # sleep efficiency (imputed)
- stress_score (float) # imputed
- calories (float)     # exercise calories (0 if none)
- cramps, sorebreasts, fatigue, moodswing (float; 0 if missing)

Expected PROFILE fields:
- bmi (float or None)
- age (float or None)
- menarche_age (float or None)

This module produces the exact feature vector your model expects.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union

import numpy as np
import pandas as pd

RANDOM_STATE = 42
MIN_CYCLE_LEN = 21
MAX_CYCLE_LEN = 38

FEATURES: List[str] = [
    "prev_cycle_len", "avg_3_cycles",
    "prev_avg_stress", "prev_avg_sleep", "prev_total_cals",
    "prev_avg_cramps", "prev_avg_sorebreasts", "prev_avg_fatigue", "prev_avg_moodswing",
    "bmi", "age", "menarche_age"
]


def safe_lower_str(x: Any) -> str:
    if pd.isna(x):
        return ""
    return str(x).strip().lower()


def is_period_flow(flow_volume: Any) -> bool:
    """
    Notebook logic: treat anything except explicit 'none / not at all / 0' as bleeding.
    """
    s = safe_lower_str(flow_volume)
    if s == "":
        return False
    no_bleed = {"not at all", "none", "no", "0", "0.0", "nan"}
    return s not in no_bleed


@dataclass
class FeatureBuildResult:
    features: Dict[str, float]
    # Helpful context for debugging / UI display
    period_starts: np.ndarray
    cycle_lengths: np.ndarray
    prev_cycle_start: int
    prev_cycle_end: int
    prev_cycle_len: int


def _require_cols(df: pd.DataFrame, cols: Iterable[str]) -> None:
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ValueError(f"Daily logs dataframe missing required columns: {missing}")


def build_features_for_user(
    daily_df: pd.DataFrame,
    user_id: Union[int, str],
    *,
    bmi: Optional[float] = None,
    age: Optional[float] = None,
    menarche_age: Optional[float] = None,
    min_cycle_len: int = MIN_CYCLE_LEN,
    max_cycle_len: int = MAX_CYCLE_LEN,
) -> FeatureBuildResult:
    """
    Build ONE feature row for inference for a given user.
    It uses the most recent COMPLETED cycle as "prev_*" aggregates,
    and uses the last known cycle length(s) for cycle history features.

    IMPORTANT:
    - You need at least 2 cycle starts (=> 1 completed cycle) to build features.
    - For best results, have at least 3 cycle starts so avg_3_cycles becomes meaningful.

    Returns FeatureBuildResult with:
    - features dict matching FEATURES list
    - context info like detected cycle lengths
    """
    required = [
        "id", "day_in_study", "flow_volume",
        "efficiency", "stress_score", "calories",
        "cramps", "sorebreasts", "fatigue", "moodswing",
    ]
    _require_cols(daily_df, required)

    u = daily_df[daily_df["id"] == user_id].copy()
    if u.empty:
        raise ValueError(f"No daily data found for user_id={user_id!r}")

    u = u.sort_values("day_in_study").reset_index(drop=True)

    # Detect period starts (same as notebook)
    u["is_period"] = u["flow_volume"].apply(is_period_flow)
    u["prev_is_period"] = u["is_period"].shift(1, fill_value=False)

    period_starts = u.loc[u["is_period"] & (~u["prev_is_period"]), "day_in_study"].to_numpy()

    if len(period_starts) < 2:
        raise ValueError(
            "Not enough period history. Need at least 2 detected period starts "
            "(i.e., one completed cycle) to build features."
        )

    cycle_lengths = np.diff(period_starts)  # length between consecutive starts

    # Choose the most recent completed cycle as "prev"
    # If we have starts [s0, s1, s2, ...], last completed cycle is between s[-2] and s[-1]
    prev_start = int(period_starts[-2])
    prev_end = int(period_starts[-1])
    prev_len = int(prev_end - prev_start)

    # Filter out unrealistic cycle lengths (notebook filters during training)
    if not (min_cycle_len <= prev_len <= max_cycle_len):
        raise ValueError(
            f"Most recent completed cycle length={prev_len} is outside "
            f"[{min_cycle_len}, {max_cycle_len}]. Can't build reliable features."
        )

    prev_data = u[(u["day_in_study"] >= prev_start) & (u["day_in_study"] < prev_end)].copy()
    if prev_data.empty:
        raise ValueError("Prev-cycle slice is empty. Check day_in_study continuity.")

    # Aggregates (match notebook)
    prev_avg_stress = float(prev_data["stress_score"].mean())
    prev_avg_sleep = float(prev_data["efficiency"].mean())
    prev_total_cals = float(prev_data["calories"].sum())

    prev_avg_cramps = float(prev_data["cramps"].mean())
    prev_avg_sorebreasts = float(prev_data["sorebreasts"].mean())
    prev_avg_fatigue = float(prev_data["fatigue"].mean())
    prev_avg_moodswing = float(prev_data["moodswing"].mean())

    # Cycle history features (match notebook intent):
    # - prev_cycle_len is the length of the previous cycle (the most recent completed)
    # - avg_3_cycles is mean of up to last 3 cycles BEFORE the predicted one.
    #   In training they used: past = cycle_lengths[max(0, i-3):i]
    #   For inference, we use the last up to 3 known cycle lengths.
    if len(cycle_lengths) >= 3:
        avg_3 = float(np.mean(cycle_lengths[-3:]))
    else:
        avg_3 = float(prev_len)

    # Demographics (match notebook's imputation intent)
    bmi_is_missing = bmi is None or (isinstance(bmi, float) and np.isnan(bmi))
    bmi_val = float(bmi) if not bmi_is_missing else np.nan
    age_val = float(age) if age is not None and not (isinstance(age, float) and np.isnan(age)) else np.nan
    menarche_val = float(menarche_age) if menarche_age is not None and not (isinstance(menarche_age, float) and np.isnan(menarche_age)) else np.nan

    # Keep raw NaNs; your trained imputer will handle them.
    feats = {
        "prev_cycle_len": float(prev_len),
        "avg_3_cycles": float(avg_3),
        "prev_avg_stress": float(prev_avg_stress),
        "prev_avg_sleep": float(prev_avg_sleep),
        "prev_total_cals": float(prev_total_cals),
        "prev_avg_cramps": float(prev_avg_cramps),
        "prev_avg_sorebreasts": float(prev_avg_sorebreasts),
        "prev_avg_fatigue": float(prev_avg_fatigue),
        "prev_avg_moodswing": float(prev_avg_moodswing),
        "bmi": bmi_val,
        "age": age_val,
        "menarche_age": menarche_val,
    }

    # Final sanity: ensure all features exist
    for k in FEATURES:
        if k not in feats:
            raise RuntimeError(f"Internal error: missing feature {k}")

    return FeatureBuildResult(
        features=feats,
        period_starts=period_starts,
        cycle_lengths=cycle_lengths,
        prev_cycle_start=prev_start,
        prev_cycle_end=prev_end,
        prev_cycle_len=prev_len,
    )


def features_to_dataframe(feats: Dict[str, float]) -> pd.DataFrame:
    """
    Convert features dict to a 1-row dataframe in correct column order.
    """
    return pd.DataFrame([[feats[c] for c in FEATURES]], columns=FEATURES)
