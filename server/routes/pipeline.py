"""Data pipeline and quality control metrics for the Data Engineer view.

Reads real DQ metrics from Delta tables and real job status from Databricks API.
Falls back to in-memory stats when Databricks is unavailable (local dev without auth).
"""
from fastapi import APIRouter
from ..data_store import _cases
from ..config import get_workspace_client, get_workspace_host, get_oauth_token
import logging
import os
import requests

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pipeline")

CATALOG = "serverless_stable_rek03f_catalog"
SCHEMA = "snap_qc"
DQ_TABLE = f"{CATALOG}.{SCHEMA}.pipeline_dq_metrics"
RUN_LOG_TABLE = f"{CATALOG}.{SCHEMA}.gold_pipeline_run_log"
WAREHOUSE_ID = "6f231e2a4a3662a7"

# Job IDs in the fevm workspace
PIPELINE_JOBS = {
    "bronze": {"job_id": 329427485947503, "name": "snap-qc-bronze-ingest", "layer": "bronze", "label": "Bronze Ingest"},
    "silver": {"job_id": 33563797685271, "name": "snap-qc-silver-validate", "layer": "silver", "label": "Silver Validate"},
    "gold": {"job_id": 277702895169008, "name": "snap-qc-gold-enrich", "layer": "gold", "label": "Gold Enrich"},
}


def _sql_query(statement: str) -> list[dict] | None:
    """Execute SQL via Databricks SQL Statements API and return rows as dicts."""
    try:
        host = get_workspace_host()
        token = get_oauth_token()
        resp = requests.post(
            f"{host}/api/2.0/sql/statements",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "warehouse_id": WAREHOUSE_ID,
                "statement": statement,
                "wait_timeout": "30s",
            },
            timeout=35,
        )
        data = resp.json()
        if data.get("status", {}).get("state") != "SUCCEEDED":
            logger.warning(f"SQL query failed: {data.get('status', {})}")
            return None
        columns = [c["name"] for c in data.get("manifest", {}).get("schema", {}).get("columns", [])]
        rows = data.get("result", {}).get("data_array", [])
        return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        logger.warning(f"SQL query error: {e}")
        return None


def _safe_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _safe_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


# ── Job Status ────────────────────────────────────────────────────────────────


@router.get("/jobs")
def pipeline_jobs():
    """Return real Databricks job run status for each pipeline layer."""
    try:
        ws = get_workspace_client()
        result = {}
        for key, info in PIPELINE_JOBS.items():
            job_info = {
                "job_id": info["job_id"],
                "name": info["name"],
                "layer": info["layer"],
                "label": info["label"],
            }
            try:
                runs = list(ws.jobs.list_runs(job_id=info["job_id"], limit=1))
                if runs:
                    run = runs[0]
                    state = run.state
                    job_info["last_run_id"] = run.run_id
                    job_info["status"] = state.life_cycle_state.value if state and state.life_cycle_state else "UNKNOWN"
                    job_info["result_state"] = state.result_state.value if state and state.result_state else None
                    job_info["start_time_ms"] = run.start_time
                    job_info["end_time_ms"] = run.end_time
                    duration_ms = (run.end_time or 0) - (run.start_time or 0)
                    job_info["duration_s"] = round(duration_ms / 1000) if duration_ms > 0 else None
                    job_info["run_url"] = run.run_page_url
                else:
                    job_info["status"] = "NEVER_RUN"
            except Exception as e:
                logger.warning(f"Could not fetch runs for job {info['job_id']}: {e}")
                job_info["status"] = "UNKNOWN"
                job_info["error"] = str(e)
            result[key] = job_info
        return result
    except Exception as e:
        logger.error(f"pipeline_jobs error: {e}")
        return {k: {**v, "status": "UNAVAILABLE"} for k, v in PIPELINE_JOBS.items()}


@router.post("/trigger/{layer}")
def trigger_job(layer: str):
    """Trigger a real Databricks pipeline job run."""
    if layer not in PIPELINE_JOBS:
        return {"error": f"Unknown layer: {layer}"}
    try:
        ws = get_workspace_client()
        job_id = PIPELINE_JOBS[layer]["job_id"]
        run = ws.jobs.run_now(job_id=job_id)
        return {"run_id": run.run_id, "job_id": job_id, "layer": layer}
    except Exception as e:
        logger.error(f"trigger_job error for {layer}: {e}")
        return {"error": str(e)}


@router.get("/history/{layer}")
def pipeline_history(layer: str):
    """Return last 10 run history for a pipeline layer from Databricks."""
    if layer not in PIPELINE_JOBS:
        return {"error": f"Unknown layer: {layer}"}
    try:
        ws = get_workspace_client()
        job_id = PIPELINE_JOBS[layer]["job_id"]
        runs = list(ws.jobs.list_runs(job_id=job_id, limit=10))
        history = []
        for run in runs:
            state = run.state
            duration_ms = (run.end_time or 0) - (run.start_time or 0)
            history.append({
                "run_id": run.run_id,
                "status": state.life_cycle_state.value if state and state.life_cycle_state else "UNKNOWN",
                "result_state": state.result_state.value if state and state.result_state else None,
                "start_time_ms": run.start_time,
                "end_time_ms": run.end_time,
                "duration_s": round(duration_ms / 1000, 1) if duration_ms > 0 else None,
                "run_url": run.run_page_url,
            })
        return {"layer": layer, "runs": history}
    except Exception as e:
        logger.warning(f"pipeline_history error for {layer}: {e}")
        return {"layer": layer, "runs": [], "error": str(e)}


# ── DQ Metrics (from Delta table) ────────────────────────────────────────────


@router.get("/dq-metrics")
def get_dq_metrics():
    """Return the latest DQ check results from the pipeline_dq_metrics Delta table."""
    # Get the most recent run_id per layer
    query = f"""
    WITH latest_runs AS (
        SELECT layer, MAX(run_time) as max_run_time
        FROM {DQ_TABLE}
        GROUP BY layer
    )
    SELECT m.run_id, m.run_time, m.layer, m.check_name, m.description,
           m.passed, m.failed, m.total, m.pass_rate, m.severity,
           m.error_type, m.exposure_at_risk, m.impact
    FROM {DQ_TABLE} m
    JOIN latest_runs lr ON m.layer = lr.layer AND m.run_time = lr.max_run_time
    ORDER BY m.layer, m.severity DESC, m.check_name
    """
    rows = _sql_query(query)
    if rows is None:
        return {"checks": [], "source": "unavailable"}

    checks = []
    for r in rows:
        checks.append({
            "run_id": r["run_id"],
            "run_time": r["run_time"],
            "layer": r["layer"],
            "name": r["check_name"],
            "description": r["description"],
            "passed": _safe_int(r["passed"]),
            "failed": _safe_int(r["failed"]),
            "total": _safe_int(r["total"]),
            "pass_rate": _safe_float(r["pass_rate"]),
            "severity": r["severity"],
            "error_type": r.get("error_type"),
            "exposure_at_risk": _safe_float(r.get("exposure_at_risk", 0)),
            "impact": r["impact"],
        })
    return {"checks": checks, "source": "delta_table"}


@router.get("/run-log")
def get_run_log():
    """Return pipeline run history from gold_pipeline_run_log."""
    query = f"""
    SELECT run_time, total_cases, high_risk, medium_risk, low_risk,
           total_exposure, penalty_savings
    FROM {RUN_LOG_TABLE}
    ORDER BY run_time DESC
    LIMIT 10
    """
    rows = _sql_query(query)
    if rows is None:
        return {"runs": [], "source": "unavailable"}

    runs = []
    for r in rows:
        runs.append({
            "run_time": r["run_time"],
            "total_cases": _safe_int(r["total_cases"]),
            "high_risk": _safe_int(r["high_risk"]),
            "medium_risk": _safe_int(r["medium_risk"]),
            "low_risk": _safe_int(r["low_risk"]),
            "total_exposure": _safe_float(r["total_exposure"]),
            "penalty_savings": _safe_float(r["penalty_savings"]),
        })
    return {"runs": runs, "source": "delta_table"}


# ── Pipeline Stats (hybrid: Delta table DQ metrics + fallback to in-memory) ──


@router.get("/stats")
def pipeline_stats():
    """Return pipeline stats. Tries Delta table DQ metrics first, falls back to in-memory."""

    # Try to get real DQ metrics from Delta table
    dq_response = get_dq_metrics()
    dq_checks = dq_response.get("checks", [])

    if dq_checks:
        return _stats_from_delta(dq_checks)

    # Fallback: compute from in-memory data
    logger.info("Falling back to in-memory pipeline stats")
    return _stats_from_memory()


def _stats_from_delta(dq_checks: list[dict]) -> dict:
    """Build pipeline stats response from real Delta table DQ metrics."""
    bronze_checks = [c for c in dq_checks if c["layer"] == "bronze"]
    silver_checks = [c for c in dq_checks if c["layer"] == "silver"]
    gold_checks = [c for c in dq_checks if c["layer"] == "gold"]

    # Get record count and run log for gold layer summary
    run_log = get_run_log()
    latest_run = run_log["runs"][0] if run_log["runs"] else {}

    # Bronze stats
    bronze_total = bronze_checks[0]["total"] if bronze_checks else len(_cases)
    bronze_pass_sum = sum(c["passed"] for c in bronze_checks)
    bronze_total_checks = sum(c["total"] for c in bronze_checks)
    bronze_pass_rate = round((bronze_pass_sum / bronze_total_checks) * 100, 1) if bronze_total_checks > 0 else 100

    # Silver stats
    silver_total = silver_checks[0]["total"] if silver_checks else len(_cases)
    silver_pass_sum = sum(c["passed"] for c in silver_checks)
    silver_total_checks = sum(c["total"] for c in silver_checks)
    silver_pass_rate = round((silver_pass_sum / silver_total_checks) * 100, 1) if silver_total_checks > 0 else 100
    silver_exposure = sum(c.get("exposure_at_risk", 0) for c in silver_checks)

    # Gold stats
    gold_total = gold_checks[0]["total"] if gold_checks else len(_cases)
    gold_pass_sum = sum(c["passed"] for c in gold_checks)
    gold_total_checks = sum(c["total"] for c in gold_checks)
    gold_pass_rate = round((gold_pass_sum / gold_total_checks) * 100, 1) if gold_total_checks > 0 else 100

    high_risk = _safe_int(latest_run.get("high_risk", 0))
    medium_risk = _safe_int(latest_run.get("medium_risk", 0))
    low_risk = _safe_int(latest_run.get("low_risk", 0))
    total_exposure = _safe_float(latest_run.get("total_exposure", 0))
    penalty_savings = _safe_float(latest_run.get("penalty_savings", 0))

    # Calculate hm_exposure from the proportion of H+M risk
    hm_pct = (high_risk + medium_risk) / gold_total if gold_total > 0 else 0
    hm_exposure = total_exposure * hm_pct

    def _format_checks(checks):
        return [{
            "name": c["name"],
            "description": c["description"],
            "passed": c["passed"],
            "failed": c["failed"],
            "severity": c["severity"],
            "layer": c["layer"],
            "impact": c["impact"],
            "error_type": c.get("error_type"),
            "exposure_at_risk": c.get("exposure_at_risk", 0),
        } for c in checks]

    return {
        "total_cases": gold_total,
        "source": "delta_table",
        "last_run_time": latest_run.get("run_time"),
        "bronze": {
            "record_count": bronze_total,
            "checks": _format_checks(bronze_checks),
            "pass_rate": bronze_pass_rate,
        },
        "silver": {
            "record_count": silver_total,
            "checks": _format_checks(silver_checks),
            "pass_rate": silver_pass_rate,
            "total_exposure_at_risk": round(silver_exposure, 2),
        },
        "gold": {
            "record_count": gold_total,
            "checks": _format_checks(gold_checks),
            "high_risk": high_risk,
            "medium_risk": medium_risk,
            "low_risk": low_risk,
            "total_exposure": round(total_exposure, 2),
            "hm_exposure": round(hm_exposure, 2),
            "penalty_savings_potential": round(penalty_savings, 2),
        },
    }


def _stats_from_memory() -> dict:
    """Fallback: compute pipeline stats from in-memory case data."""
    cases = _cases
    total = len(cases)

    def _sf(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0

    # ── BRONZE ────────────────────────────────────────────────────────────────
    required_fields = ["id", "name", "household_size", "reported_benefit", "qc_benefit", "gross_income", "cert_months"]
    schema_failures = sum(1 for c in cases if any(c.get(f) in (None, "", "NA") for f in required_fields))
    type_failures = sum(1 for c in cases if not isinstance(c.get("gross_income"), (int, float)))
    ids = [c["id"] for c in cases]
    dup_ids = total - len(set(ids))
    missing_employer = sum(1 for c in cases if not (c.get("employer") or "").strip())

    bronze_checks = [
        {"name": "Schema completeness", "description": "All required fields present and non-null",
         "passed": total - schema_failures, "failed": schema_failures, "severity": "CRITICAL",
         "layer": "bronze", "impact": "Downstream risk scoring fails without complete records"},
        {"name": "Numeric field validity", "description": "Income and benefit fields are parseable numbers",
         "passed": total - type_failures, "failed": type_failures, "severity": "CRITICAL",
         "layer": "bronze", "impact": "NA/string values cause silent $0 income calculations"},
        {"name": "Household ID uniqueness", "description": "No duplicate HHLDNO across sample",
         "passed": total - dup_ids, "failed": dup_ids, "severity": "HIGH",
         "layer": "bronze", "impact": "Duplicate records double-count error exposure"},
        {"name": "Employer name coverage", "description": "Employer name present for wage-earning cases",
         "passed": total - missing_employer, "failed": missing_employer, "severity": "MEDIUM",
         "layer": "bronze", "impact": "Missing employer blocks wage-record cross-reference"},
    ]

    # ── SILVER ────────────────────────────────────────────────────────────────
    income_period_cases = [c for c in cases if "bi-" in str(c.get("warning_1") or "").lower() or "bi-" in str(c.get("warning_2") or "").lower()]
    utility_cases = [c for c in cases if "utility" in str(c.get("warning_1") or "").lower() or "utility" in str(c.get("warning_2") or "").lower()]
    benefit_ceiling_failures = [c for c in cases if _sf(c.get("reported_benefit")) > _sf(c.get("max_benefit")) > 0]
    gross_test_failures = [c for c in cases if _sf(c.get("poverty_pct")) > 130]
    fpl_boundary = [c for c in cases if 120 < _sf(c.get("poverty_pct")) <= 130]
    deduction_missed = [c for c in cases if "deduction missed" in str(c.get("error_type") or "").lower()]
    zero_income_with_benefit = [c for c in cases if _sf(c.get("gross_income")) == 0 and _sf(c.get("reported_benefit")) > 0]

    silver_checks = [
        {"name": "Gross income eligibility pre-screen", "description": "Gross income <= 130% FPL",
         "passed": total - len(gross_test_failures), "failed": len(gross_test_failures), "severity": "CRITICAL",
         "layer": "silver", "error_type": "Gross Income Test Failure",
         "exposure_at_risk": round(sum(c.get("error_amount", 0) for c in gross_test_failures), 2),
         "impact": "Cases exceeding 130% FPL are categorically ineligible"},
        {"name": "Income period consistency", "description": "Bi-weekly pay not misclassified as semi-monthly",
         "passed": total - len(income_period_cases), "failed": len(income_period_cases), "severity": "HIGH",
         "layer": "silver", "error_type": "Income Period Mismatch",
         "exposure_at_risk": round(sum(c.get("error_amount", 0) for c in income_period_cases), 2),
         "impact": "Bi-weekly x 26 / 12 != semi-monthly x 24 / 12"},
        {"name": "Benefit ceiling validation", "description": "Reported benefit does not exceed max allotment",
         "passed": total - len(benefit_ceiling_failures), "failed": len(benefit_ceiling_failures), "severity": "HIGH",
         "layer": "silver", "error_type": "Overpayment - Income Understated",
         "exposure_at_risk": round(sum(c.get("error_amount", 0) for c in benefit_ceiling_failures), 2),
         "impact": "Benefits above household max are automatic overpayments"},
        {"name": "Utility allowance deduplication", "description": "No dual SUA claims at same address",
         "passed": total - len(utility_cases), "failed": len(utility_cases), "severity": "HIGH",
         "layer": "silver", "error_type": "Utility Allowance Conflict",
         "exposure_at_risk": round(sum(c.get("error_amount", 0) for c in utility_cases), 2),
         "impact": "Dual SUA claims inflate shelter deduction"},
        {"name": "FPL boundary monitoring (120-130%)", "description": "Flag cases near 130% gross income limit",
         "passed": total - len(fpl_boundary), "failed": len(fpl_boundary), "severity": "MEDIUM",
         "layer": "silver", "error_type": "Borderline eligibility", "exposure_at_risk": 0,
         "impact": "Boundary cases require enhanced income verification"},
        {"name": "Deduction coverage check", "description": "All allowable deductions captured",
         "passed": total - len(deduction_missed), "failed": len(deduction_missed), "severity": "MEDIUM",
         "layer": "silver", "error_type": "Underpayment - Deduction Missed",
         "exposure_at_risk": round(sum(c.get("error_amount", 0) for c in deduction_missed), 2),
         "impact": "Missed deductions reduce net income artificially"},
        {"name": "Zero-income sanity check", "description": "Cases with $0 income but active benefit",
         "passed": total - len(zero_income_with_benefit), "failed": len(zero_income_with_benefit), "severity": "MEDIUM",
         "layer": "silver", "error_type": "Overpayment - Income Understated", "exposure_at_risk": 0,
         "impact": "Zero income with active benefit warrants verification"},
    ]

    # ── GOLD ──────────────────────────────────────────────────────────────────
    high = sum(1 for c in cases if c.get("severity") == "HIGH")
    medium = sum(1 for c in cases if c.get("severity") == "MEDIUM")
    low = sum(1 for c in cases if c.get("severity") == "LOW")
    with_risk_factors = sum(1 for c in cases if c.get("risk_factors"))
    total_exposure = sum(c.get("error_amount", 0) for c in cases)
    hm_exposure = sum(c.get("error_amount", 0) for c in cases if c.get("severity") in ("HIGH", "MEDIUM"))

    gold_checks = [
        {"name": "Risk score coverage", "description": "All cases have a computed risk score",
         "passed": with_risk_factors, "failed": total - with_risk_factors, "severity": "CRITICAL",
         "layer": "gold", "impact": "Risk-unscored cases cannot be prioritized"},
        {"name": "Error classification completeness", "description": "All cases have an assigned error type",
         "passed": sum(1 for c in cases if c.get("error_type")),
         "failed": sum(1 for c in cases if not c.get("error_type")), "severity": "HIGH",
         "layer": "gold", "impact": "Unclassified errors cannot be tracked by type"},
    ]

    return {
        "total_cases": total,
        "source": "in_memory",
        "bronze": {
            "record_count": total,
            "checks": bronze_checks,
            "pass_rate": round((sum(c["passed"] for c in bronze_checks) / (total * len(bronze_checks))) * 100, 1),
        },
        "silver": {
            "record_count": total,
            "checks": silver_checks,
            "pass_rate": round((sum(c["passed"] for c in silver_checks) / (total * len(silver_checks))) * 100, 1),
            "total_exposure_at_risk": round(sum(c.get("exposure_at_risk", 0) for c in silver_checks), 2),
        },
        "gold": {
            "record_count": total,
            "checks": gold_checks,
            "high_risk": high,
            "medium_risk": medium,
            "low_risk": low,
            "total_exposure": round(total_exposure, 2),
            "hm_exposure": round(hm_exposure, 2),
            "penalty_savings_potential": round(hm_exposure * 0.75, 2),
        },
    }
