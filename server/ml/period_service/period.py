import os
import warnings
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

import joblib
import pandas as pd
from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from sklearn.exceptions import InconsistentVersionWarning  # type: ignore

    warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
except Exception:
    # Keep startup robust even if sklearn exception class changes.
    pass

try:
    from .period_model_utils import (
        FEATURES as DEFAULT_FEATURE_ORDER,
        build_features_for_user,
        features_to_dataframe,
    )
except Exception:  # noqa: BLE001
    try:
        from ml.period_service.period_model_utils import (  # type: ignore
            FEATURES as DEFAULT_FEATURE_ORDER,
            build_features_for_user,
            features_to_dataframe,
        )
    except Exception:  # noqa: BLE001
        try:
            from period_service.period_model_utils import (  # type: ignore
                FEATURES as DEFAULT_FEATURE_ORDER,
                build_features_for_user,
                features_to_dataframe,
            )
        except Exception:  # noqa: BLE001
            from period_model_utils import (  # type: ignore
                FEATURES as DEFAULT_FEATURE_ORDER,
                build_features_for_user,
                features_to_dataframe,
            )

try:
    from .exercise_utils import calories_from_met
except Exception:  # noqa: BLE001
    try:
        from ml.period_service.exercise_utils import calories_from_met  # type: ignore
    except Exception:  # noqa: BLE001
        try:
            from period_service.exercise_utils import calories_from_met  # type: ignore
        except Exception:  # noqa: BLE001
            from exercise_utils import calories_from_met  # type: ignore

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_BUNDLE_PATH = os.path.join(HERE, "next_period_predictor_bundle_sklearn161.pkl")
BUNDLE_PATH = os.environ.get("NEXT_PERIOD_MODEL_PATH", DEFAULT_BUNDLE_PATH)
MODEL_PATH = os.path.join(HERE, "model.pkl")
IMPUTER_PATH = os.path.join(HERE, "imputer.pkl")

NEXT_PERIOD_MIN_LEN = int(os.environ.get("NEXT_PERIOD_MIN_LEN", 15))
NEXT_PERIOD_MAX_LEN = int(os.environ.get("NEXT_PERIOD_MAX_LEN", 60))
DEFAULT_MENSTRUATION_DAYS = int(os.environ.get("DEFAULT_MENSTRUATION_DAYS", 5))

PERIOD_MODEL = None
PERIOD_IMPUTER = None
PERIOD_FEATURE_ORDER = list(DEFAULT_FEATURE_ORDER)
PERIOD_LOAD_ERROR = None


def _load_period_model() -> None:
    global PERIOD_MODEL
    global PERIOD_IMPUTER
    global PERIOD_FEATURE_ORDER
    global PERIOD_LOAD_ERROR

    try:
        loaded = None
        if os.path.exists(BUNDLE_PATH):
            loaded = joblib.load(BUNDLE_PATH)
        elif os.path.exists(MODEL_PATH):
            loaded = joblib.load(MODEL_PATH)
        else:
            raise FileNotFoundError(
                f"No next-period model artifact found. Checked: {BUNDLE_PATH}, {MODEL_PATH}"
            )

        model = loaded
        imputer = None
        feature_order = list(DEFAULT_FEATURE_ORDER)

        if isinstance(loaded, dict):
            model = loaded.get("model", loaded)
            imputer = loaded.get("imputer")
            loaded_features = loaded.get("features")
            if isinstance(loaded_features, list) and loaded_features:
                feature_order = [str(x) for x in loaded_features]
        else:
            inferred = list(getattr(model, "feature_names_in_", []))
            if inferred:
                feature_order = inferred
            if os.path.exists(IMPUTER_PATH):
                try:
                    imputer = joblib.load(IMPUTER_PATH)
                except Exception:  # noqa: BLE001
                    imputer = None

        if model is None or not hasattr(model, "predict"):
            raise RuntimeError("Loaded artifact does not expose a predict() method.")

        PERIOD_MODEL = model
        PERIOD_IMPUTER = imputer
        PERIOD_FEATURE_ORDER = feature_order or list(DEFAULT_FEATURE_ORDER)
        PERIOD_LOAD_ERROR = None
    except Exception as exc:  # noqa: BLE001
        PERIOD_MODEL = None
        PERIOD_IMPUTER = None
        PERIOD_FEATURE_ORDER = list(DEFAULT_FEATURE_ORDER)
        PERIOD_LOAD_ERROR = str(exc)


def _is_ymd(value: Optional[str]) -> bool:
    if not isinstance(value, str):
        return False
    try:
        date.fromisoformat(value)
        return True
    except ValueError:
        return False


def _round_cycle_len(x: float) -> int:
    v = int(round(float(x)))
    return max(NEXT_PERIOD_MIN_LEN, min(NEXT_PERIOD_MAX_LEN, v))


def _mean_or_zero(values: List[float]) -> float:
    if not values:
        return 0.0
    return float(sum(values) / len(values))


def _heuristic_cycle_length_from_user_data(req: "PredictRequest", df: pd.DataFrame) -> int:
    base = 28.0

    age = req.age if req.age is not None else None
    bmi = req.bmi if req.bmi is not None else None
    menarche_age = req.menarche_age if req.menarche_age is not None else None

    if age is not None:
        if age < 20:
            base += 1
        if age >= 35:
            base += 1
        if age >= 45:
            base += 1

    if bmi is not None:
        if bmi < 18.5:
            base += 1
        if bmi >= 30:
            base += 1

    if age is not None and menarche_age is not None and age - menarche_age <= 5:
        base += 1

    recent = df.tail(14).copy() if len(df.index) else df

    stress_values = (
        pd.to_numeric(recent.get("stress_score", pd.Series(dtype=float)), errors="coerce")
        .dropna()
        .astype(float)
        .tolist()
    )
    sleep_values = (
        pd.to_numeric(recent.get("efficiency", pd.Series(dtype=float)), errors="coerce")
        .dropna()
        .astype(float)
        .tolist()
    )
    pain_values = (
        pd.to_numeric(recent.get("cramps", pd.Series(dtype=float)), errors="coerce")
        .dropna()
        .astype(float)
        .tolist()
    )
    exercise_values = (
        pd.to_numeric(recent.get("duration_minutes", pd.Series(dtype=float)), errors="coerce")
        .dropna()
        .astype(float)
        .tolist()
    )

    avg_stress = _mean_or_zero(stress_values)
    avg_sleep = _mean_or_zero(sleep_values)
    avg_pain = _mean_or_zero(pain_values)
    avg_exercise = _mean_or_zero(exercise_values)

    if avg_stress >= 7:
        base += 1
    if avg_sleep > 0 and avg_sleep < 6:
        base += 1
    if avg_sleep >= 8.5:
        base -= 1
    if avg_pain >= 7:
        base += 1
    if avg_exercise >= 60:
        base -= 1

    return _round_cycle_len(base)


def _predict_cycle_length_from_frame(df: pd.DataFrame) -> float:
    if PERIOD_MODEL is None:
        raise RuntimeError("Next-period model is not loaded.")

    try:
        pred = PERIOD_MODEL.predict(df)
        return float(pred[0])
    except Exception as direct_exc:  # noqa: BLE001
        if PERIOD_IMPUTER is None:
            raise direct_exc
        arr = PERIOD_IMPUTER.transform(df[PERIOD_FEATURE_ORDER])
        pred = PERIOD_MODEL.predict(arr)
        return float(pred[0])


def _predict_cycle_length_from_features(features: Dict[str, float]) -> float:
    ordered_row = {name: features.get(name) for name in PERIOD_FEATURE_ORDER}
    df = pd.DataFrame([ordered_row])
    return _predict_cycle_length_from_frame(df)


def _compute_phase_dates(
    current_cycle_start: str, cycle_length_days: int, menstruation_days: int
) -> Tuple[str, Dict[str, Optional[Dict[str, str]]]]:
    cycle_start = date.fromisoformat(current_cycle_start)
    next_period_start = cycle_start + timedelta(days=cycle_length_days)

    menstruation_len = max(1, min(14, menstruation_days))
    menstruation_end = cycle_start + timedelta(days=menstruation_len - 1)
    ovulation_day = next_period_start - timedelta(days=14)
    follicular_start = menstruation_end + timedelta(days=1)
    follicular_end = ovulation_day - timedelta(days=1)
    luteal_start = ovulation_day + timedelta(days=1)
    luteal_end = next_period_start - timedelta(days=1)

    phase_dates: Dict[str, Optional[Dict[str, str]]] = {
        "menstruation": {
            "start": cycle_start.isoformat(),
            "end": menstruation_end.isoformat(),
        },
        "follicular": None,
        "ovulation": {"date": ovulation_day.isoformat()},
        "luteal": None,
    }

    if follicular_start <= follicular_end:
        phase_dates["follicular"] = {
            "start": follicular_start.isoformat(),
            "end": follicular_end.isoformat(),
        }

    if luteal_start <= luteal_end:
        phase_dates["luteal"] = {
            "start": luteal_start.isoformat(),
            "end": luteal_end.isoformat(),
        }

    return next_period_start.isoformat(), phase_dates


class DailyLog(BaseModel):
    id: str
    day_in_study: int
    flow_volume: Optional[str] = None

    efficiency: Optional[float] = None
    stress_score: Optional[float] = None
    calories: Optional[float] = 0.0

    met: Optional[float] = None
    duration_minutes: Optional[float] = None
    duration_hours: Optional[float] = None

    sleep_missing: int = 0
    stress_missing: int = 0
    exercise_missing: int = 0

    cramps: Optional[float] = 0.0
    sorebreasts: Optional[float] = 0.0
    fatigue: Optional[float] = 0.0
    moodswing: Optional[float] = 0.0


class PredictRequest(BaseModel):
    user_id: str
    last_period_start: date
    daily_logs: List[DailyLog]

    bmi: Optional[float] = None
    age: Optional[float] = None
    menarche_age: Optional[float] = None
    weight_kg: Optional[float] = None

    n_future_starts: int = Field(default=4, ge=1, le=12)


class PredictResponse(BaseModel):
    predicted_cycle_length_days: int
    next_period_start: date
    future_period_starts: List[date]
    used_features: Dict[str, float]


class NextPeriodPredictRequest(BaseModel):
    features: Dict[str, float]
    current_cycle_start: Optional[str] = None
    menstruation_days: Optional[int] = Field(default=None, ge=1, le=14)


router = APIRouter()

_load_period_model()


@router.get("/health/period-service")
def period_service_health():
    return {
        "ok": PERIOD_MODEL is not None,
        "model_path": BUNDLE_PATH if os.path.exists(BUNDLE_PATH) else MODEL_PATH,
        "feature_order": PERIOD_FEATURE_ORDER,
        "load_error": PERIOD_LOAD_ERROR,
    }


@router.get("/health/next-period")
def next_period_health():
    return period_service_health()


@router.post("/period-predict", response_model=PredictResponse)
def predict_period(req: PredictRequest):
    if PERIOD_MODEL is None:
        raise HTTPException(
            status_code=503,
            detail=f"Next-period model unavailable: {PERIOD_LOAD_ERROR or 'not loaded'}",
        )

    df = pd.DataFrame([x.model_dump() for x in req.daily_logs])

    for col in [
        "efficiency",
        "stress_score",
        "calories",
        "cramps",
        "sorebreasts",
        "fatigue",
        "moodswing",
        "flow_volume",
    ]:
        if col not in df.columns:
            df[col] = None

    if "calories" not in df.columns:
        df["calories"] = 0.0

    weight_kg = req.weight_kg
    cal_values = []
    ex_missing_values = []
    for _, row in df.iterrows():
        cals = row.get("calories")
        duration_minutes = row.get("duration_minutes")
        duration_hours = row.get("duration_hours")
        met = row.get("met")

        if pd.notna(cals) and float(cals) > 0:
            cal_values.append(float(cals))
            has_duration = (
                pd.notna(duration_minutes) and float(duration_minutes) > 0
            ) or (pd.notna(duration_hours) and float(duration_hours) > 0)
            ex_missing_values.append(
                0 if has_duration else int(row.get("exercise_missing", 0))
            )
            continue

        derived_cals = calories_from_met(
            met=met,
            weight_kg=weight_kg,
            duration_minutes=duration_minutes,
            duration_hours=duration_hours,
        )
        cal_values.append(float(derived_cals))

        has_duration = (
            (duration_minutes is not None and pd.notna(duration_minutes) and float(duration_minutes) > 0)
            or (duration_hours is not None and pd.notna(duration_hours) and float(duration_hours) > 0)
        )
        ex_missing_values.append(0 if has_duration else 1)

    df["calories"] = cal_values
    df["exercise_missing"] = ex_missing_values

    try:
        res = build_features_for_user(
            df,
            user_id=req.user_id,
            bmi=req.bmi,
            age=req.age,
            menarche_age=req.menarche_age,
        )
    except Exception as exc:  # noqa: BLE001
        cycle_len_days = _heuristic_cycle_length_from_user_data(req, df)
        next_start = req.last_period_start + timedelta(days=cycle_len_days)

        future_starts = []
        cur = req.last_period_start
        for _ in range(req.n_future_starts):
            cur = cur + timedelta(days=cycle_len_days)
            future_starts.append(cur)

        return PredictResponse(
            predicted_cycle_length_days=cycle_len_days,
            next_period_start=next_start,
            future_period_starts=future_starts,
            used_features={
                "fallback_used": 1.0,
                "fallback_cycle_length_days": float(cycle_len_days),
                "fallback_reason_code": 1.0,
            },
        )

    X_one = features_to_dataframe(res.features)

    try:
        pred_len = _predict_cycle_length_from_frame(X_one)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Model inference failed: {exc}") from exc

    cycle_len_days = _round_cycle_len(pred_len)
    next_start = req.last_period_start + timedelta(days=cycle_len_days)

    future_starts = []
    cur = req.last_period_start
    for _ in range(req.n_future_starts):
        cur = cur + timedelta(days=cycle_len_days)
        future_starts.append(cur)

    return PredictResponse(
        predicted_cycle_length_days=cycle_len_days,
        next_period_start=next_start,
        future_period_starts=future_starts,
        used_features=res.features,
    )


@router.post("/predict-next-period")
def predict_next_period(req: NextPeriodPredictRequest):
    if PERIOD_MODEL is None:
        raise HTTPException(
            status_code=503,
            detail=f"Next-period model unavailable: {PERIOD_LOAD_ERROR or 'not loaded'}",
        )

    if req.current_cycle_start is not None and not _is_ymd(req.current_cycle_start):
        raise HTTPException(
            status_code=400, detail="current_cycle_start must be YYYY-MM-DD"
        )

    try:
        raw_length = _predict_cycle_length_from_features(req.features)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500, detail=f"Next-period inference failed: {exc}"
        ) from exc

    cycle_length_days = _round_cycle_len(raw_length)
    menstruation_days = req.menstruation_days or DEFAULT_MENSTRUATION_DAYS

    predicted_next_period_date = None
    phase_dates = None
    if req.current_cycle_start:
        predicted_next_period_date, phase_dates = _compute_phase_dates(
            req.current_cycle_start, cycle_length_days, menstruation_days
        )

    return {
        "predicted_cycle_length_raw": round(raw_length, 2),
        "predicted_cycle_length_days": cycle_length_days,
        "current_cycle_start_used": req.current_cycle_start,
        "predicted_next_period_date": predicted_next_period_date,
        "phase_dates": phase_dates,
        "feature_order": PERIOD_FEATURE_ORDER,
    }


app = FastAPI(title="Period Prediction Service", version="1.0.0")
app.include_router(router)


@app.get("/health")
def standalone_health():
    return {
        "status": "ok",
        "ok": PERIOD_MODEL is not None,
        "load_error": PERIOD_LOAD_ERROR,
    }


@app.post("/predict", response_model=PredictResponse)
def standalone_predict(req: PredictRequest):
    return predict_period(req)
