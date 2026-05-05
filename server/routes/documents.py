"""Document upload and AI parsing for SNAP QC case review."""
import base64
import io
import json
import logging
import os

from fastapi import APIRouter, HTTPException, UploadFile, File
from ..config import get_workspace_host, get_oauth_token
from ..data_store import get_case

router = APIRouter(prefix="/cases")
logger = logging.getLogger(__name__)

EXTRACT_PROMPT = """You are a document parser for SNAP (food stamps) quality control. Extract structured data from this document.

Return ONLY a valid JSON object with these fields (use null if not found):
{
  "document_type": "pay_stub" | "w2" | "lease" | "bank_statement" | "other",
  "employer_name": string or null,
  "employee_name": string or null,
  "pay_frequency": "weekly" | "bi-weekly" | "semi-monthly" | "monthly" | null,
  "gross_pay_per_period": number or null,
  "gross_monthly_income": number or null,
  "pay_date": string or null,
  "address": string or null,
  "city": string or null,
  "monthly_rent": number or null,
  "utilities_included": boolean or null,
  "notes": string or null
}

Important:
- If pay_frequency is bi-weekly and gross_pay_per_period is given, gross_monthly_income = gross_pay_per_period * 26 / 12
- If pay_frequency is semi-monthly, gross_monthly_income = gross_pay_per_period * 2
- Return ONLY the JSON object, no markdown, no explanation."""


def _get_llm_client():
    try:
        from openai import OpenAI
        host = get_workspace_host()
        token = get_oauth_token()
        return OpenAI(api_key=token, base_url=f"{host}/serving-endpoints")
    except Exception as e:
        logger.warning(f"Could not init LLM client: {e}")
        return None


def _extract_text_from_pdf(content: bytes) -> str:
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as e:
        logger.warning(f"PDF extraction failed: {e}")
        return content.decode("utf-8", errors="replace")


def _call_claude(messages: list) -> dict:
    client = _get_llm_client()
    if not client:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    endpoint = os.environ.get("SERVING_ENDPOINT", "databricks-claude-sonnet-4-6")
    response = client.chat.completions.create(
        model=endpoint,
        messages=messages,
        max_tokens=800,
        temperature=0,
    )
    raw = (response.choices[0].message.content or "{}").strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1].lstrip("json").strip() if len(parts) > 1 else "{}"
    return json.loads(raw)


def _build_discrepancies(extracted: dict, case: dict) -> list[dict]:
    discrepancies = []

    # Employer mismatch
    emp_doc = (extracted.get("employer_name") or "").strip().lower()
    emp_case = (case.get("employer") or "").strip().lower()
    if emp_doc and emp_case and emp_doc != emp_case:
        discrepancies.append({
            "field": "Employer Name",
            "document": extracted["employer_name"],
            "record": case["employer"],
            "severity": "HIGH",
            "detail": "Employer on document differs from case record — verify no unreported job change.",
        })

    # Gross income mismatch (>10% difference)
    gross_doc = extracted.get("gross_monthly_income")
    gross_case = case.get("gross_income", 0)
    if gross_doc and gross_case:
        diff = abs(gross_doc - gross_case)
        pct = diff / gross_case * 100 if gross_case else 0
        if pct > 10:
            discrepancies.append({
                "field": "Gross Monthly Income",
                "document": f"${gross_doc:,.0f}/mo",
                "record": f"${gross_case:,.0f}/mo",
                "severity": "HIGH" if pct > 25 else "MEDIUM",
                "detail": f"${diff:,.0f} gap ({pct:.0f}%) — case record may be understated.",
            })

    # Pay frequency / income period mismatch
    freq = extracted.get("pay_frequency")
    w1 = str(case.get("warning_1") or "").lower()
    w2 = str(case.get("warning_2") or "").lower()
    if freq and ("bi-" in w1 or "bi-" in w2):
        discrepancies.append({
            "field": "Pay Frequency",
            "document": freq,
            "record": "Mismatch flagged in QC warning",
            "severity": "HIGH",
            "detail": f"Document shows {freq} pay — confirms the existing QC income-period warning.",
        })

    # Utility posture for leases
    if extracted.get("utilities_included") is False and ("utility" in w1 or "utility" in w2):
        discrepancies.append({
            "field": "Utility Posture",
            "document": "Utilities NOT included in rent",
            "record": "QC utility allowance conflict flagged",
            "severity": "MEDIUM",
            "detail": "Lease confirms utilities are separate — verify SUA1 field matches claimed shelter deduction.",
        })

    # Address / city mismatch for leases
    city_doc = (extracted.get("city") or "").strip().lower()
    city_case = (case.get("city") or "").strip().lower()
    if city_doc and city_case and city_doc != city_case:
        discrepancies.append({
            "field": "City / Address",
            "document": extracted.get("city", ""),
            "record": case.get("city", ""),
            "severity": "MEDIUM",
            "detail": "Document address doesn't match case city — possible residency discrepancy.",
        })

    return discrepancies


@router.post("/{case_id}/analyze-document")
async def analyze_document(case_id: int, file: UploadFile = File(...)):
    case = get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    content = await file.read()
    filename = file.filename or "document"
    content_type = file.content_type or ""

    is_image = content_type.startswith("image/") or filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
    is_pdf = filename.lower().endswith(".pdf") or "pdf" in content_type

    if is_image:
        mime = content_type if content_type.startswith("image/") else "image/jpeg"
        b64 = base64.b64encode(content).decode()
        messages = [{
            "role": "user",
            "content": [
                {"type": "text", "text": EXTRACT_PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
            ],
        }]
    else:
        text = _extract_text_from_pdf(content) if is_pdf else content.decode("utf-8", errors="replace")
        messages = [{"role": "user", "content": f"{EXTRACT_PROMPT}\n\nDocument text:\n{text[:5000]}"}]

    try:
        extracted = _call_claude(messages)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Could not parse AI response: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    discrepancies = _build_discrepancies(extracted, case)

    return {
        "filename": filename,
        "document_type": extracted.get("document_type", "other"),
        "extracted": extracted,
        "discrepancies": discrepancies,
        "match_count": len(discrepancies),
    }
