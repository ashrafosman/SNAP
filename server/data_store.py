"""In-memory data store loaded from processed synthetic SNAP QC data."""
import json
import os
from typing import Optional

_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "snap_qc_enriched.json")

_cases: list[dict] = []
_status_overrides: dict[int, str] = {}  # case_id -> status


def _load():
    global _cases
    with open(_DATA_PATH) as f:
        _cases = json.load(f)


_load()


def get_all_cases(
    severity: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "risk_score",
    page: int = 1,
    page_size: int = 50,
) -> dict:
    results = [
        {**c, "status": _status_overrides.get(c["id"], c["status"])}
        for c in _cases
    ]

    if severity:
        results = [c for c in results if c["severity"] == severity.upper()]
    if status:
        results = [c for c in results if c["status"] == status]
    if search:
        q = search.lower()
        results = [
            c for c in results
            if q in c["name"].lower()
            or q in c["city"].lower()
            or q in (c["error_type"] or "").lower()
            or q in (c["employer"] or "").lower()
        ]

    results.sort(key=lambda c: c.get(sort_by, 0), reverse=True)

    total = len(results)
    start = (page - 1) * page_size
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
        "cases": results[start : start + page_size],
    }


def get_case(case_id: int) -> Optional[dict]:
    for c in _cases:
        if c["id"] == case_id:
            return {**c, "status": _status_overrides.get(c["id"], c["status"])}
    return None


def update_case_status(case_id: int, status: str) -> bool:
    for c in _cases:
        if c["id"] == case_id:
            _status_overrides[case_id] = status
            return True
    return False


def get_summary_metrics() -> dict:
    all_cases = [
        {**c, "status": _status_overrides.get(c["id"], c["status"])}
        for c in _cases
    ]
    total = len(all_cases)
    high = sum(1 for c in all_cases if c["severity"] == "HIGH")
    medium = sum(1 for c in all_cases if c["severity"] == "MEDIUM")
    low = sum(1 for c in all_cases if c["severity"] == "LOW")
    total_exposure = sum(c["error_amount"] for c in all_cases)
    avg_error = total_exposure / total if total else 0
    flagged = sum(1 for c in all_cases if c["warning_1"] or c["warning_2"])
    reviewed = sum(1 for c in all_cases if c["status"] in ("reviewed", "resolved"))
    error_rate = round((len([c for c in all_cases if c["error_amount"] > 0]) / total) * 100, 1) if total else 0

    # Penalty avoidance: post-Oct 2026, Michigan pays 75% of each QC error dollar
    # If HIGH+MEDIUM cases are corrected before QC, the state avoids that cost share
    hm_exposure = sum(c["error_amount"] for c in all_cases if c["severity"] in ("HIGH", "MEDIUM"))
    penalty_savings_potential = round(hm_exposure * 0.75, 2)
    # Current rate (pre-Oct 2026) for comparison
    penalty_current_rate = round(hm_exposure * 0.50, 2)
    penalty_additional_risk = round(hm_exposure * 0.25, 2)  # the extra 25% from cost-share shift

    return {
        "total_cases": total,
        "high_risk": high,
        "medium_risk": medium,
        "low_risk": low,
        "total_exposure_dollars": round(total_exposure, 2),
        "avg_error_dollars": round(avg_error, 2),
        "flagged_cases": flagged,
        "reviewed_cases": reviewed,
        "error_rate_pct": error_rate,
        "cases_needing_review": high + medium,
        "hm_exposure_dollars": round(hm_exposure, 2),
        "penalty_savings_potential": penalty_savings_potential,
        "penalty_additional_risk": penalty_additional_risk,
    }


def get_error_type_breakdown() -> list[dict]:
    from collections import Counter
    counts: Counter = Counter()
    exposure: dict[str, float] = {}
    for c in _cases:
        et = c["error_type"]
        counts[et] += 1
        exposure[et] = exposure.get(et, 0) + c["error_amount"]

    return [
        {"error_type": et, "count": cnt, "total_exposure": round(exposure[et], 2)}
        for et, cnt in counts.most_common()
    ]


def get_severity_trend() -> list[dict]:
    """Simulated monthly trend data based on cert months distribution."""
    from collections import defaultdict
    monthly: dict[int, dict] = defaultdict(lambda: {"HIGH": 0, "MEDIUM": 0, "LOW": 0, "exposure": 0.0})

    for c in _cases:
        bucket = min(12, max(1, c.get("cert_months", 12)))
        monthly[bucket][c["severity"]] += 1
        monthly[bucket]["exposure"] += c["error_amount"]

    return [
        {
            "month": f"Month {m}",
            "high": monthly[m]["HIGH"],
            "medium": monthly[m]["MEDIUM"],
            "low": monthly[m]["LOW"],
            "exposure": round(monthly[m]["exposure"], 2),
        }
        for m in sorted(monthly)
    ]


def get_city_breakdown() -> list[dict]:
    from collections import defaultdict
    cities: dict[str, dict] = defaultdict(lambda: {"count": 0, "high": 0, "exposure": 0.0})

    for c in _cases:
        city = c.get("city") or "Unknown"
        cities[city]["count"] += 1
        if c["severity"] == "HIGH":
            cities[city]["high"] += 1
        cities[city]["exposure"] += c["error_amount"]

    top = sorted(cities.items(), key=lambda x: x[1]["count"], reverse=True)[:12]
    return [{"city": k, **v, "exposure": round(v["exposure"], 2)} for k, v in top]
