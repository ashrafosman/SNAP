"""Read and write app config JSON from Databricks Volume or local file."""
import json
import os
import re

from server.config import IS_DATABRICKS_APP, get_workspace_client

_local_path = os.path.join(os.path.dirname(__file__), "..", "data", "app_config.json")

_BRANDING_KEYS = {"agency_name", "program_name", "state", "accent_color", "tagline", "footer_alert"}
_HEX_RE = re.compile(r"^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$")

_DEFAULTS: dict = {
    "agency_name": "Michigan SNAP",
    "program_name": "SNAP QC Guard",
    "state": "Michigan",
    "accent_color": "#ef4444",
    "tagline": "Early Warning System",
    "footer_alert": "Oct 2026: SNAP cost-share shifts to 25/75. 40K recipients at risk.",
    "data_sources": [
        {"id": "snap_eligibility", "name": "SNAP Eligibility", "domain": "Public Benefits",
         "system": "State SNAP system",
         "description": "Monthly eligibility file — household composition, benefit amounts, case status.",
         "cadence": "Monthly"},
        {"id": "adt_encounters", "name": "ADT Encounters", "domain": "Healthcare",
         "system": "Hospital ADT feed",
         "description": "Admission/Discharge/Transfer events for linked SNAP recipients.",
         "cadence": "Daily"},
        {"id": "ehr_diagnoses", "name": "EHR Clinical Diagnoses", "domain": "Healthcare",
         "system": "EHR system",
         "description": "ICD-10 diagnosis codes for chronic and acute conditions.",
         "cadence": "Weekly"},
        {"id": "medicaid", "name": "Medicaid Enrollment", "domain": "Public Benefits",
         "system": "State Medicaid",
         "description": "Current Medicaid enrollment linked to SNAP households.",
         "cadence": "Monthly"},
        {"id": "prapare", "name": "PRAPARE SDOH Assessments", "domain": "SDOH",
         "system": "Care coordination platform",
         "description": "Social determinants screenings completed at health visits.",
         "cadence": "Ongoing"},
        {"id": "vital_records", "name": "Vital Records", "domain": "Vital Records",
         "system": "State vital records",
         "description": "Birth and death records linked to SNAP households.",
         "cadence": "Monthly"},
    ],
    "use_cases": [
        {"id": "hospitalization_risk", "title": "SNAP & Hospitalization Risk",
         "description": "Identify SNAP recipients with recent ED visits or hospitalizations who may be at risk of benefit disruption.",
         "analytical_question": "Which active SNAP cases have 2+ inpatient admissions in the past 90 days?"},
        {"id": "maternal_outcomes", "title": "SNAP Coverage and Maternal Outcomes",
         "description": "Correlate prenatal SNAP enrollment with birth outcomes for program impact measurement.",
         "analytical_question": "What share of births with adverse outcomes had a gap in SNAP coverage during pregnancy?"},
        {"id": "chronic_disease", "title": "SNAP and Chronic Disease",
         "description": "Surface SNAP recipients with chronic disease diagnoses to target nutrition outreach.",
         "analytical_question": "Which SNAP households include a member with diabetes or hypertension and no recent preventive care?"},
    ],
}


def _validate(data: dict) -> None:
    for key in _BRANDING_KEYS:
        if key not in data:
            raise ValueError(f"Missing required branding key: {key}")
    if not _HEX_RE.match(data.get("accent_color", "")):
        raise ValueError("accent_color must be a valid hex color (e.g. #ef4444)")
    for ds in data.get("data_sources", []):
        if not ds.get("id") or not ds.get("name") or not ds.get("domain"):
            raise ValueError("data_sources entries must have id, name, and domain")
    for uc in data.get("use_cases", []):
        if not uc.get("id") or not uc.get("title") or not uc.get("analytical_question"):
            raise ValueError("use_cases entries must have id, title, and analytical_question")


def read_config() -> dict:
    try:
        if IS_DATABRICKS_APP:
            volume_path = os.environ.get("APP_CONFIG_VOLUME", "")
            if volume_path:
                client = get_workspace_client()
                response = client.files.download(volume_path)
                return json.loads(response.contents.read())
        else:
            if os.path.exists(_local_path):
                with open(_local_path) as f:
                    return json.load(f)
    except Exception:
        pass
    return dict(_DEFAULTS)


def write_config(data: dict) -> dict:
    _validate(data)
    payload = json.dumps(data, indent=2).encode()
    if IS_DATABRICKS_APP:
        volume_path = os.environ.get("APP_CONFIG_VOLUME", "")
        if volume_path:
            import io
            client = get_workspace_client()
            client.files.upload(volume_path, io.BytesIO(payload), overwrite=True)
    else:
        os.makedirs(os.path.dirname(os.path.abspath(_local_path)), exist_ok=True)
        with open(_local_path, "wb") as f:
            f.write(payload)
    return data
