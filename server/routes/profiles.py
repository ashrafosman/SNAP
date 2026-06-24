"""Branding profiles CRUD — backed by Lakebase (Postgres)."""
import os
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from server.lakebase import get_connection

# Emails allowed to mutate profiles. Falls back to open when not set (local dev).
_ADMIN_EMAILS_RAW = os.environ.get("PROFILE_ADMIN_EMAILS", "")
_ADMIN_EMAILS = {e.strip().lower() for e in _ADMIN_EMAILS_RAW.split(",") if e.strip()}


def _require_admin(request: Request):
    """Raise 403 unless the caller is an allowed admin (or no list is configured)."""
    if not _ADMIN_EMAILS:
        return  # not configured — allow all (local dev)
    # Databricks Apps injects the authenticated user's email in this header
    caller = (request.headers.get("X-Forwarded-Email") or "").lower()
    if caller not in _ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Admin access required to modify profiles")

router = APIRouter(prefix="/profiles")


class ProfileIn(BaseModel):
    id: str
    name: str
    state: str
    agency_name: str
    program_name: str
    tagline: str = ""
    accent_color: str = "#2e4e84"
    footer_alert: str = ""
    icon_url: str = ""
    error_rate_pct: float = 6.06
    projected_liability: str = "~$200M"
    snap_benefits_annual_b: float = 4.0


def _row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "state": row["state"],
        "agency_name": row["agency_name"],
        "program_name": row["program_name"],
        "tagline": row["tagline"],
        "accent_color": row["accent_color"],
        "footer_alert": row["footer_alert"],
        "icon_url": row["icon_url"],
        "is_active": row["is_active"],
        "error_rate_pct": float(row["error_rate_pct"] or 6.06),
        "projected_liability": row["projected_liability"] or "~$200M",
        "snap_benefits_annual_b": float(row["snap_benefits_annual_b"] or 4.0),
    }


@router.get("")
def list_profiles():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM branding_profiles ORDER BY created_at")
            return [_row_to_dict(r) for r in cur.fetchall()]


@router.post("")
def create_profile(p: ProfileIn, request: Request):
    _require_admin(request)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO branding_profiles
                   (id, name, state, agency_name, program_name, tagline, accent_color,
                    footer_alert, icon_url, error_rate_pct, projected_liability, snap_benefits_annual_b)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (id) DO UPDATE SET
                     name=EXCLUDED.name, state=EXCLUDED.state,
                     agency_name=EXCLUDED.agency_name, program_name=EXCLUDED.program_name,
                     tagline=EXCLUDED.tagline, accent_color=EXCLUDED.accent_color,
                     footer_alert=EXCLUDED.footer_alert, icon_url=EXCLUDED.icon_url,
                     error_rate_pct=EXCLUDED.error_rate_pct,
                     projected_liability=EXCLUDED.projected_liability,
                     snap_benefits_annual_b=EXCLUDED.snap_benefits_annual_b,
                     updated_at=NOW()
                   RETURNING *""",
                (p.id, p.name, p.state, p.agency_name, p.program_name,
                 p.tagline, p.accent_color, p.footer_alert, p.icon_url,
                 p.error_rate_pct, p.projected_liability, p.snap_benefits_annual_b),
            )
            conn.commit()
            return _row_to_dict(cur.fetchone())


@router.put("/{profile_id}/activate")
def activate_profile(profile_id: str, request: Request):
    _require_admin(request)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE branding_profiles SET is_active = false")
            cur.execute(
                "UPDATE branding_profiles SET is_active = true WHERE id = %s RETURNING *",
                (profile_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Profile not found")
            conn.commit()
            return _row_to_dict(row)


@router.delete("/{profile_id}")
def delete_profile(profile_id: str, request: Request):
    _require_admin(request)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM branding_profiles WHERE id = %s", (profile_id,))
            conn.commit()
    return {"deleted": profile_id}
