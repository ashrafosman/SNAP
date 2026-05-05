"""Case queue routes for SNAP QC Early Warning System."""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from pydantic import BaseModel
from ..data_store import get_all_cases, get_case, update_case_status
from ..checklist_store import get_checklist, save_checklist_item

router = APIRouter(prefix="/cases")


class StatusUpdate(BaseModel):
    status: str  # pending | reviewed | resolved


class ChecklistItemUpdate(BaseModel):
    item_key: str
    done: bool
    note: str = ""


@router.get("")
def list_cases(
    severity: Optional[str] = Query(None, description="HIGH | MEDIUM | LOW"),
    status: Optional[str] = Query(None, description="pending | reviewed | resolved"),
    search: Optional[str] = Query(None),
    sort_by: str = Query("risk_score", description="risk_score | error_amount | id"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    return get_all_cases(severity=severity, status=status, search=search, sort_by=sort_by, page=page, page_size=page_size)


@router.get("/{case_id}")
def get_case_detail(case_id: int):
    case = get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.patch("/{case_id}/status")
def update_status(case_id: int, body: StatusUpdate):
    valid = {"pending", "reviewed", "resolved"}
    if body.status not in valid:
        raise HTTPException(status_code=400, detail=f"status must be one of {valid}")
    if not update_case_status(case_id, body.status):
        raise HTTPException(status_code=404, detail="Case not found")
    return {"success": True, "case_id": case_id, "status": body.status}


@router.get("/{case_id}/checklist")
def get_case_checklist(case_id: int):
    if not get_case(case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    return {"items": get_checklist(case_id)}


@router.put("/{case_id}/checklist")
def save_case_checklist_item(case_id: int, body: ChecklistItemUpdate):
    if not get_case(case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    save_checklist_item(case_id, body.item_key, body.done, body.note)
    return {"success": True}
