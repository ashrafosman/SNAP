"""Metrics routes for SNAP QC dashboard."""
from fastapi import APIRouter
from ..data_store import (
    get_summary_metrics,
    get_error_type_breakdown,
    get_severity_trend,
    get_city_breakdown,
)

router = APIRouter(prefix="/metrics")


@router.get("/overview")
def overview():
    return get_summary_metrics()


@router.get("/error-types")
def error_types():
    return get_error_type_breakdown()


@router.get("/trend")
def trend():
    return get_severity_trend()


@router.get("/cities")
def cities():
    return get_city_breakdown()
