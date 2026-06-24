"""Cross-dataset anomaly signals derived deterministically from case data."""
from __future__ import annotations

from datetime import date, timedelta
from math import ceil
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..data_store import get_all_cases

router = APIRouter(prefix="/signals")

# ---------------------------------------------------------------------------
# Module-level status overrides  (signal_id -> status)
# ---------------------------------------------------------------------------
_status_overrides: dict[str, str] = {}

# ---------------------------------------------------------------------------
# Signal-type metadata
# ---------------------------------------------------------------------------
_SIGNAL_TYPES = [
    "death_match",
    "medicaid_gap",
    "unreported_birth",
    "adt_trigger",
    "missed_deduction",
]

_SOURCE_DATASETS: dict[str, list[str]] = {
    "death_match":       ["vital_records_births_deaths", "snap_eligibility_extract"],
    "medicaid_gap":      ["medicaid_enrollment", "snap_eligibility_extract"],
    "unreported_birth":  ["vital_records_births_deaths", "snap_eligibility_extract"],
    "adt_trigger":       ["adt_encounters", "snap_eligibility_extract"],
    "missed_deduction":  ["ehr_clinical_diagnoses", "medicaid_enrollment", "snap_eligibility_extract"],
}

_DESCRIPTIONS: dict[str, str] = {
    "death_match":      "A death record was found matching the case holder or a household member.",
    "medicaid_gap":     "The SNAP recipient appears not to have been enrolled in Medicaid during the benefit period.",
    "unreported_birth": "A birth record was found that would increase the reported household size.",
    "adt_trigger":      "A recent hospital discharge was detected that may affect income or household eligibility.",
    "missed_deduction": "Medical expenses were flagged in clinical records but the corresponding deduction was not applied.",
}

_BASE_DATE = date(2025, 4, 1)

# ---------------------------------------------------------------------------
# Deterministic signal generation
# ---------------------------------------------------------------------------

def _build_signal(case: dict, n: int) -> dict:
    """Return one signal dict for the given case and ordinal index n (0-based)."""
    case_id: int = case["id"]

    # Signal type — rotate through list using case_id offset by n so two
    # signals from the same case get different types.
    type_index = (case_id + n) % len(_SIGNAL_TYPES)
    signal_type = _SIGNAL_TYPES[type_index]

    # Severity mirrors the case severity; for HIGH cases with two signals,
    # the second one is downgraded to MEDIUM to add variety.
    severity = case["severity"]
    if severity == "HIGH" and n == 1:
        severity = "MEDIUM"

    # Status
    if case_id % 5 == 0:
        status = "reviewed"
    elif case_id % 7 == 0:
        status = "dismissed"
    else:
        status = "open"

    sig_id = f"SIG-{case_id:04d}-{n}"
    # Apply any user override
    status = _status_overrides.get(sig_id, status)

    detected_at = (_BASE_DATE + timedelta(days=(case_id * 7) % 90)).isoformat()

    return {
        "id": sig_id,
        "case_id": case_id,
        "case_name": case["name"],
        "city": case["city"],
        "state": case["state"],
        "signal_type": signal_type,
        "severity": severity,
        "source_datasets": _SOURCE_DATASETS[signal_type],
        "description": _DESCRIPTIONS[signal_type],
        "detected_at": detected_at,
        "status": status,
        "error_amount": case["error_amount"],
    }


def _generate_all_signals() -> list[dict]:
    """Generate the full deterministic signal list from all cases."""
    all_cases_resp = get_all_cases(page=1, page_size=10_000)
    cases = all_cases_resp["cases"]

    signals: list[dict] = []
    for case in cases:
        sev = case.get("severity", "")
        if sev not in ("HIGH", "MEDIUM"):
            continue

        if sev == "HIGH":
            count = 1 if case["id"] % 3 != 0 else 2
        else:  # MEDIUM
            count = 1 if case["id"] % 2 == 0 else 0

        for n in range(count):
            signals.append(_build_signal(case, n))

    return signals


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class SignalStatusUpdate(BaseModel):
    status: str  # "open" | "reviewed" | "dismissed"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
def list_signals(
    signal_type: Optional[str] = Query(None, description="Filter by signal type"),
    severity: Optional[str] = Query(None, description="HIGH | MEDIUM | LOW"),
    status: Optional[str] = Query(None, description="open | reviewed | dismissed"),
    case_id: Optional[int] = Query(None, description="Filter to a specific case"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
):
    signals = _generate_all_signals()

    # Apply filters
    if case_id is not None:
        signals = [s for s in signals if s["case_id"] == case_id]
    if signal_type:
        signals = [s for s in signals if s["signal_type"] == signal_type]
    if severity:
        signals = [s for s in signals if s["severity"] == severity.upper()]
    if status:
        signals = [s for s in signals if s["status"] == status.lower()]

    total = len(signals)
    pages = max(1, ceil(total / page_size))
    start = (page - 1) * page_size
    page_signals = signals[start : start + page_size]

    # Summary over the full (filtered) result set
    open_count     = sum(1 for s in signals if s["status"] == "open")
    reviewed_count = sum(1 for s in signals if s["status"] == "reviewed")
    dismissed_count = sum(1 for s in signals if s["status"] == "dismissed")

    by_type = {t: 0 for t in _SIGNAL_TYPES}
    by_severity = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for s in signals:
        by_type[s["signal_type"]] = by_type.get(s["signal_type"], 0) + 1
        by_severity[s["severity"]] = by_severity.get(s["severity"], 0) + 1

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "signals": page_signals,
        "summary": {
            "open": open_count,
            "reviewed": reviewed_count,
            "dismissed": dismissed_count,
            "by_type": by_type,
            "by_severity": by_severity,
        },
    }


@router.patch("/{signal_id}/status")
def update_signal_status(signal_id: str, body: SignalStatusUpdate):
    valid = {"open", "reviewed", "dismissed"}
    if body.status not in valid:
        raise HTTPException(status_code=400, detail=f"status must be one of {valid}")

    # Verify the signal_id actually exists in the generated set
    all_signals = _generate_all_signals()
    ids = {s["id"] for s in all_signals}
    if signal_id not in ids:
        raise HTTPException(status_code=404, detail="Signal not found")

    _status_overrides[signal_id] = body.status
    return {"success": True, "signal_id": signal_id, "status": body.status}
