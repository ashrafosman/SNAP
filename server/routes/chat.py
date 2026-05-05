"""AI assistant routes for SNAP QC case analysis."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import json
import os
import re as _re
import logging

from ..config import get_workspace_host, get_oauth_token, IS_DATABRICKS_APP
from ..data_store import get_case, get_all_cases, get_summary_metrics, get_error_type_breakdown
from ..hr1_store import search_hr1

router = APIRouter(prefix="/chat")
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a SNAP Quality Control analyst assistant for a state SNAP agency.
You help caseworkers understand QC errors, interpret risk flags, and take corrective action.

When analyzing a specific case, be concise and actionable:
1. Explain what the error/risk flag means in plain language
2. What information the caseworker should verify
3. What corrective action to take
4. Relevant federal regulations (7 CFR 273) if applicable

Use markdown formatting: headers, bullet points, bold for emphasis, and code blocks for references.
Be specific about dollar amounts and policy rules."""

HR1_SUPPLEMENT = """

You also have access to the HR1 bill (One Big Beautiful Bill Act, 119th Congress, 2025) sections below.
This bill contains major changes to SNAP, Medicaid, tax policy, immigration, defense, and more.
When answering policy or legislative questions:
- Cite the specific section of HR1 if available in the provided context
- Explain how provisions affect SNAP eligibility, benefits, work requirements, or utility allowances
- Cross-reference with current case data and 7 CFR 273 where relevant
- Note effective dates and implementation timelines
- Use markdown formatting for clarity
"""

# --- Intent classification (keyword-based, no LLM call) ---

_HR1_KEYWORDS = {
    "hr1", "hr 1", "h.r.1", "h.r. 1", "house resolution", "bill", "legislation",
    "act", "congress", "reconciliation", "beautiful", "one big",
    "work requirement", "abawd", "able-bodied", "snap reform", "snap cut",
    "snap change", "snap reduction", "benefit reduction", "eligibility",
    "categorical eligibility", "medicaid", "redetermination",
    "utility allowance", "cost sharing", "cost-share", "federal match", "fmap",
    "provision", "amendment", "title", "subtitle", "division",
    "policy change", "new rule", "proposed", "reform", "food and nutrition",
    "immigration", "defense", "tax", "reconciliation",
}

_CASE_KEYWORDS = {
    "case", "household", "applicant", "client", "claimant",
    "risk score", "error", "flag", "warning", "benefit", "income",
    "employer", "pay", "overpayment", "underpayment",
}

_DATA_KEYWORDS = {
    "cases", "caseload", "high risk", "top", "worst", "priority",
    "queue", "dashboard", "metrics", "summary", "overview", "exposure",
    "how many", "total", "count", "list", "show", "my cases",
    "error rate", "pending", "reviewed", "resolved", "breakdown",
    "trend", "city", "cities", "risk", "severe", "critical",
}


def _classify_intent(message: str, has_case: bool) -> str:
    """Return 'hr1', 'data', 'case', 'both', or 'general'."""
    text = message.lower()
    tokens = set(_re.findall(r'\b\w+\b', text))
    # Also check bigrams for multi-word keywords
    words = text.split()
    bigrams = {f"{words[i]} {words[i+1]}" for i in range(len(words) - 1)}

    hr1_hit = bool(tokens & _HR1_KEYWORDS)
    data_hit = bool((tokens & _DATA_KEYWORDS) or (bigrams & _DATA_KEYWORDS))
    case_hit = has_case

    if hr1_hit and (case_hit or data_hit):
        return "both"
    if hr1_hit:
        return "hr1"
    if data_hit:
        return "data"
    if case_hit:
        return "case"
    return "general"


class ChatRequest(BaseModel):
    message: str
    case_id: Optional[int] = None
    history: list[dict] = []


def _build_data_context() -> str:
    """Build context with summary metrics and top high-risk cases."""
    metrics = get_summary_metrics()
    errors = get_error_type_breakdown()
    top_cases_resp = get_all_cases(severity="HIGH", sort_by="risk_score", page=1, page_size=10)
    top_cases = top_cases_resp["cases"]

    ctx = f"""
Current SNAP QC Caseload Data:

Summary Metrics:
- Total Cases: {metrics['total_cases']}
- High Risk: {metrics['high_risk']} | Medium Risk: {metrics['medium_risk']} | Low Risk: {metrics['low_risk']}
- Error Rate: {metrics['error_rate_pct']:.1f}%
- Total QC Exposure: ${metrics['total_exposure_dollars']:,.0f}
- Avg Error Amount: ${metrics['avg_error_dollars']:,.0f}
- Cases Needing Review: {metrics['cases_needing_review']}
- Penalty Savings Potential (if resolved before QC): ${metrics['penalty_savings_potential']:,.0f}

Error Type Breakdown:
"""
    for e in errors[:6]:
        ctx += f"- {e['error_type']}: {e['count']} cases, ${e['total_exposure']:,.0f} exposure\n"

    ctx += f"\nTop {len(top_cases)} High-Risk Cases:\n"
    ctx += "| ID | Name | Risk Score | Error Type | Error $ | Status |\n"
    ctx += "|---|---|---|---|---|---|\n"
    for c in top_cases:
        ctx += f"| {c['id']} | {c['name']} | {c['risk_score']} | {c['error_type']} | ${c['error_amount']:,.0f} | {c['status']} |\n"

    return ctx


def _get_llm_client():
    try:
        from openai import OpenAI
        host = get_workspace_host()
        token = get_oauth_token()
        return OpenAI(api_key=token, base_url=f"{host}/serving-endpoints")
    except Exception as e:
        logger.warning(f"Could not init LLM client: {e}")
        return None


@router.post("/")
async def chat(req: ChatRequest):
    case_context = ""
    if req.case_id:
        case = get_case(req.case_id)
        if case:
            flags_str = "\n".join(f"  - {f}" for f in case.get("risk_flags", []))
            case_context = f"""
Current case context (HH #{case['id']} — {case['name']}):
- Risk Score: {case['risk_score']}/100 ({case['severity']})
- Error Type: {case['error_type']}
- Reported Benefit: ${case['reported_benefit']:.0f} | QC Benefit: ${case['qc_benefit']:.0f} | Difference: ${case['error_amount']:.0f}
- Household: {case['household_size']} person(s), {case['composition']}
- Gross Income: ${case['gross_income']:.0f}/month | Poverty %: {case['poverty_pct']:.0f}%
- Income Source: {case['income_source']}
- Employer: {case.get('employer', 'N/A')}
- Risk Flags:
{flags_str}
"""

    # Classify intent and build context
    intent = _classify_intent(req.message, has_case=bool(req.case_id and case_context))
    hr1_context = ""
    data_context = ""

    if intent in ("hr1", "both"):
        chunks = search_hr1(req.message, top_n=5)
        if chunks:
            hr1_context = "\n\nRelevant HR1 Bill Sections:\n"
            for chunk in chunks:
                hr1_context += f"\n--- {chunk['title']} ---\n{chunk['text'][:1500]}\n"

    if intent in ("data", "both"):
        data_context = _build_data_context()

    # Build system prompt with relevant context
    system = SYSTEM_PROMPT
    if hr1_context:
        system += HR1_SUPPLEMENT + hr1_context
    if data_context:
        system += data_context
    if case_context:
        system += case_context

    endpoint = os.environ.get("SERVING_ENDPOINT", "databricks-claude-sonnet-4-6")

    messages = [{"role": "system", "content": system}]
    for h in req.history[-6:]:  # keep last 6 exchanges
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": req.message})

    client = _get_llm_client()
    if not client:
        return {"content": "AI assistant unavailable. Please check Databricks connection.", "role": "assistant"}

    def stream():
        try:
            with client.chat.completions.create(
                model=endpoint,
                messages=messages,
                max_tokens=1000,
                temperature=0.3,
                stream=True,
            ) as stream_resp:
                for chunk in stream_resp:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        yield f"data: {json.dumps({'content': delta.content})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Chat stream error: {e}")
            yield f"data: {json.dumps({'content': f'Error: {str(e)}'})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
