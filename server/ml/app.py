import os
from typing import List, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

try:
    from ml.period_service.period import router as period_router
except Exception:  # noqa: BLE001
    from period_service.period import router as period_router

# Defaults
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODEL_PATH = os.path.join(HERE, "menstrual_multioutput_rf.joblib")
MODEL_PATH = os.environ.get("MODEL_PATH", DEFAULT_MODEL_PATH)
DEFAULT_LABELS = [
    "oligomenorrhea",
    "polymenorrhea",
    "menorrhagia",
    "amenorrhea",
    "intermenstrual_bleeding",
]
DEFAULT_THRESHOLD = float(os.environ.get("MODEL_THRESHOLD", 0.5))


def _install_sklearn_compat_shims() -> None:
    # Compatibility shim for older sklearn artifacts that reference
    # private class names removed in newer sklearn versions.
    try:
        from sklearn.compose import _column_transformer as ct  # type: ignore

        if not hasattr(ct, "_RemainderColsList"):
            class _RemainderColsList(list):
                pass

            ct._RemainderColsList = _RemainderColsList
    except Exception:
        return


_install_sklearn_compat_shims()

# Load disease model once on startup
MODEL = None
FEATURE_ORDER = []
MODEL_LOAD_ERROR = None
try:
    MODEL = joblib.load(MODEL_PATH)
    FEATURE_ORDER = list(getattr(MODEL, "feature_names_in_", []))
except Exception as exc:
    MODEL_LOAD_ERROR = str(exc)


class Features(BaseModel):
    age: float
    bmi: float
    life_stage: str
    tracking_duration_months: float
    pain_score: float
    avg_cycle_length: float
    cycle_length_variation: float
    avg_bleeding_days: float
    bleeding_volume_score: float
    intermenstrual_episodes: float
    cycle_variation_coeff: float
    pattern_disruption_score: float
    duration_abnormality_flag: float


class PredictRequest(BaseModel):
    features: Features
    labels: Optional[List[str]] = None
    threshold: Optional[float] = None


app = FastAPI(title="Cycle Companion Model Service", version="1.0.0")
app.include_router(period_router)


@app.get("/health")
def health():
    return {
        "ok": True,
        "model_path": MODEL_PATH,
        "features": FEATURE_ORDER,
        "disease_model_loaded": MODEL is not None,
        "disease_model_error": MODEL_LOAD_ERROR,
    }


def _features_to_frame(features: Features) -> pd.DataFrame:
    data = features.model_dump()
    # Ensure column order matches training
    rows = {name: data.get(name) for name in FEATURE_ORDER}
    return pd.DataFrame([rows])


@app.post("/predict")
def predict(req: PredictRequest):
    if MODEL is None:
        raise HTTPException(
            status_code=503,
            detail=f"Disease model unavailable: {MODEL_LOAD_ERROR or 'not loaded'}",
        )

    labels = req.labels or DEFAULT_LABELS
    threshold = req.threshold if req.threshold is not None else DEFAULT_THRESHOLD

    if len(labels) != len(DEFAULT_LABELS):
        # Allow shorter/longer but align by index
        labels = (labels + DEFAULT_LABELS)[0 : len(DEFAULT_LABELS)]

    try:
        df = _features_to_frame(req.features)
        prob_list = MODEL.predict_proba(df)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Model inference failed: {exc}")

    predictions = []
    # MultiOutputClassifier.predict_proba returns list per target
    for idx, label in enumerate(labels):
        try:
            probs = prob_list[idx][0]
            prob_positive = float(probs[1]) if len(probs) > 1 else float(probs[-1])
        except Exception:
            prob_positive = None

        predictions.append(
            {
                "label": label,
                "probability": prob_positive,
                "positive": None if prob_positive is None else prob_positive >= threshold,
                "threshold": threshold,
            }
        )

    return {"predictions": predictions, "feature_order": FEATURE_ORDER}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), reload=True)
