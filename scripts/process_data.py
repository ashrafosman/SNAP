"""Process raw SNAP QC Excel data into enriched JSON for the app."""
import openpyxl
import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def load_snap_qc_excel(path: str) -> list[dict]:
    wb = openpyxl.load_workbook(path)
    ws = wb["snap_qc_top_500"]
    rows = list(ws.iter_rows(values_only=True))
    raw_headers = list(rows[0])

    anon_name_map = {
        41: "EMPLOYER_NAME", 42: "EMPLOYER_ADDR", 43: "EMPLOYER_CITY", 44: "EMPLOYER_ZIP",
        117: "HH_STREET", 118: "HH_CITY", 119: "HH_STATE", 120: "HH_ZIP",
        121: "HH_FNAME", 122: "HH_LNAME",
        123: "HH2_FNAME", 124: "HH2_LNAME", 125: "HH2_AGE",
        126: "HH3_FNAME", 127: "HH3_LNAME", 128: "HH3_AGE",
        129: "CH1_FNAME", 130: "CH1_LNAME", 131: "CH1_AGE",
        132: "CH2_FNAME", 133: "CH2_LNAME", 134: "CH2_AGE",
        147: "SAMPLE_WARNING_1", 148: "SAMPLE_WARNING_2",
    }
    named_headers = [anon_name_map.get(i, h) for i, h in enumerate(raw_headers)]

    cases = []
    for row in rows[2:]:
        d = {named_headers[i]: v for i, v in enumerate(row) if named_headers[i]}
        if not d.get("HHLDNO"):
            continue
        cases.append(d)
    return cases


# ── Risk scoring ──────────────────────────────────────────────────────────────

def compute_risk_score(case: dict) -> dict:
    """Return risk_score, severity, legacy flags list, and structured risk_factors."""
    factors = []

    rawben = _sf(case.get("RAWBEN"))
    benfix = _sf(case.get("BENFIX"))
    error_amt = abs(benfix - rawben)

    if error_amt > 0:
        pts = min(40, int(error_amt / 5))
        factors.append({
            "factor": "Benefit corrected by QC review",
            "points": pts,
            "detail": f"Reported ${rawben:.0f} → corrected to ${benfix:.0f}  (${error_amt:.0f} difference)",
        })

    alladj = str(case.get("ALLADJ") or "")
    amtadj = _sf(case.get("AMTADJ"))
    if alladj != "No adjustment" and amtadj > 0:
        factors.append({
            "factor": "Allotment adjustment on record",
            "points": 20,
            "detail": f"{alladj}  (${amtadj:.0f})",
        })

    w1 = case.get("SAMPLE_WARNING_1")
    w2 = case.get("SAMPLE_WARNING_2")
    if w1:
        factors.append({
            "factor": _warning_label(str(w1)),
            "points": 25,
            "detail": str(w1),
        })
    if w2:
        factors.append({
            "factor": _warning_label(str(w2)),
            "points": 15,
            "detail": str(w2),
        })

    if case.get("FSGRTEST") == 0:
        factors.append({
            "factor": "Failed gross income screen",
            "points": 10,
            "detail": "Gross income exceeded 130% FPL eligibility threshold",
        })
    if case.get("FSNETEST") == 0:
        factors.append({
            "factor": "Failed net income screen",
            "points": 10,
            "detail": "Net income exceeded 100% FPL after deductions",
        })

    if "Entitled" in str(case.get("EXPEDSER") or ""):
        factors.append({
            "factor": "Expedited service — reduced verification",
            "points": 5,
            "detail": "Fast-track approval: documentation may be incomplete at certification",
        })

    tpov = _sf(case.get("TPOV"))
    if tpov > 120:
        factors.append({
            "factor": "Borderline income eligibility",
            "points": 10,
            "detail": f"Gross income at {tpov:.0f}% of FPL — within 10 points of 130% gross income limit",
        })

    score = min(sum(f["points"] for f in factors), 100)
    severity = "HIGH" if score >= 60 else "MEDIUM" if score >= 30 else "LOW"

    # Legacy flat flags for backward compat
    flags = [f["detail"] for f in factors]

    return {
        "risk_score": score,
        "severity": severity,
        "risk_flags": flags,
        "risk_factors": factors,
        "error_amount": error_amt,
    }


def _warning_label(w: str) -> str:
    wl = w.lower()
    if "utility" in wl:
        return "Utility allowance conflict"
    if "bi-monthly" in wl or "bi-weekly" in wl:
        return "Income period mismatch"
    if "address" in wl:
        return "Address mismatch"
    return "Data consistency warning"


# ── Caseworker Copilot ────────────────────────────────────────────────────────

def generate_copilot(case: dict, error_type: str) -> dict:
    """Return structured caseworker guidance: questions, docs, and actions."""
    questions: list[str] = []
    docs: list[str] = []
    actions: list[str] = []

    w1 = str(case.get("SAMPLE_WARNING_1") or "").lower()
    w2 = str(case.get("SAMPLE_WARNING_2") or "").lower()
    expedited = "Entitled" in str(case.get("EXPEDSER") or "")
    tpov = _sf(case.get("TPOV"))
    error_amt = abs(_sf(case.get("BENFIX")) - _sf(case.get("RAWBEN")))

    # Income period mismatch
    if "bi-monthly" in w1 or "bi-weekly" in w1 or "bi-monthly" in w2 or "bi-weekly" in w2:
        questions += [
            "What is your exact pay schedule — weekly, every two weeks (bi-weekly), or twice a month (semi-monthly)?",
            "Can you show me a recent pay stub with the pay dates clearly visible?",
        ]
        docs += [
            "Two most recent pay stubs showing pay dates and gross amounts",
            "Employer letter confirming pay frequency if pay stubs are unavailable",
        ]
        actions += [
            "Recalculate monthly income: bi-weekly × 26 ÷ 12 (≠ semi-monthly × 24 ÷ 12) — a common $50–150/mo difference",
            "Update income record with corrected monthly figure before benefit issuance",
        ]

    # Utility allowance conflict
    if "utility" in w1 or "utility" in w2:
        questions += [
            "Who pays the utility bills at your current address — you, or someone else in the home?",
            "Is there another household living at the same address?",
            "Are utilities included in your rent, or do you pay them separately?",
        ]
        docs += [
            "Current utility bill in applicant's name showing service address",
            "Lease agreement showing whether utilities are included",
        ]
        actions += [
            "Check if another SNAP case at same address already claims utility standard — dual claiming triggers overpayment",
            "Verify utility posture (SUA1 field) matches shelter deduction actually claimed",
            "If utilities included in rent, downgrade to Basic Utility Allowance — recalculate shelter deduction",
        ]

    # Overpayment — income understated
    if "overpayment" in error_type.lower() or "income understated" in error_type.lower():
        questions += [
            "Have you had any new income sources, pay raises, or side jobs in the last 3 months?",
            "Do you receive tips, commissions, bonuses, or variable pay on top of your base wages?",
            "Does anyone else in the household have income they haven't reported yet?",
        ]
        docs += [
            "All income verification: 3 most recent pay stubs from all jobs",
            "Bank statements for the last 30 days if income source is unclear",
        ]
        actions += [
            "Cross-reference employer name with state wage records — verify reported income matches payroll",
            f"QC correction was ${error_amt:.0f} — flag for mandatory supervisor review if benefit reduction exceeds $50",
            "Notify household in writing of income discrepancy before correcting benefit amount (7 CFR 273.12)",
        ]

    # Underpayment — missed deduction
    if "underpayment" in error_type.lower() or "deduction missed" in error_type.lower():
        questions += [
            "Do you pay child support? If so, do you have a court order or written agreement?",
            "Do you or any household member have regular medical expenses — prescriptions, Medicare premiums, co-pays?",
            "Do you pay for child care or adult dependent care so you can work or attend training?",
        ]
        docs += [
            "Child support payment records or court-ordered support agreement",
            "Medical expense receipts for the past 30 days (for elderly/disabled households)",
            "Child care provider invoice or receipt",
        ]
        actions += [
            "Review all allowable deductions: dependent care (20%), earned income (20%), medical, excess shelter",
            "Check whether standard medical deduction demonstration applies (MED_DED_DEMO field)",
            f"Household is owed ${error_amt:.0f} — issue corrective payment within 10 days (7 CFR 273.17)",
        ]

    # Expedited service — incomplete docs
    if expedited:
        questions += [
            "You were approved under expedited service. Can you now provide full income and residence documentation?",
        ]
        docs += [
            "Proof of address (utility bill, lease, or official mail)",
            "Income documentation not collected at expedited approval",
        ]
        actions += [
            "Schedule 30-day follow-up to collect documentation deferred at expedited approval",
            "If docs not received at follow-up, initiate adverse action notice per 7 CFR 273.2(i)(3)(ii)",
        ]

    # Borderline eligibility
    if tpov > 120:
        questions += [
            "Have there been any changes to your household's income — raises, new jobs, or lost income — since your application?",
        ]
        actions += [
            f"Gross income at {tpov:.0f}% FPL — within 10 points of 130% gross limit. Re-verify all income sources before certification",
        ]

    # Always: generic safeguard if nothing triggered
    if not questions:
        questions.append("Please confirm all household members and income sources are current and accurate.")
        actions.append("Review case file for completeness before approving certification.")

    return {
        "questions_to_ask": questions,
        "documents_to_request": list(dict.fromkeys(docs)),  # deduplicate, preserve order
        "verification_actions": actions,
    }


# ── Error classification ──────────────────────────────────────────────────────

def classify_error_type(case: dict) -> str:
    w1 = str(case.get("SAMPLE_WARNING_1") or "")
    w2 = str(case.get("SAMPLE_WARNING_2") or "")
    rawben = _sf(case.get("RAWBEN"))
    benfix = _sf(case.get("BENFIX"))
    alladj = str(case.get("ALLADJ") or "No adjustment")

    if "utility" in w1.lower() or "utility" in w2.lower():
        return "Utility Allowance Conflict"
    if "bi-monthly" in w1.lower() or "bi-monthly" in w2.lower() or \
       "bi-weekly" in w1.lower() or "bi-weekly" in w2.lower():
        return "Income Period Mismatch"
    if benfix > rawben:
        return "Underpayment — Deduction Missed"
    if benfix < rawben:
        return "Overpayment — Income Understated"
    if alladj != "No adjustment":
        return "Allotment Adjustment"
    if case.get("FSGRTEST") == 0:
        return "Gross Income Test Failure"
    if case.get("FSNETEST") == 0:
        return "Net Income Test Failure"
    return "Other QC Deviation"


# ── Main enrichment ───────────────────────────────────────────────────────────

def enrich_cases(cases: list[dict]) -> list[dict]:
    enriched = []
    for c in cases:
        risk = compute_risk_score(c)
        error_type = classify_error_type(c)
        copilot = generate_copilot(c, error_type)

        fname = str(c.get("HH_FNAME") or "")
        lname = str(c.get("HH_LNAME") or "")
        name = f"{fname} {lname}".strip() or f"Household #{c['HHLDNO']}"

        enriched.append({
            "id": int(c["HHLDNO"]),
            "name": name,
            "city": str(c.get("HH_CITY") or ""),
            "state": str(c.get("HH_STATE") or "MI"),
            "zip": str(c.get("HH_ZIP") or ""),
            "household_size": _si(c.get("CTPRHH"), 1),
            "composition": str(c.get("COMPOSITION") or ""),
            "reported_benefit": _sf(c.get("RAWBEN")),
            "qc_benefit": _sf(c.get("BENFIX")),
            "max_benefit": _sf(c.get("BENMAX")),
            "gross_income": _sf(c.get("RAWGROSS")),
            "net_income": _sf(c.get("FSNETINC")),
            "cert_months": _si(c.get("CERTMTH")),
            "months_since_cert": _si(c.get("LASTCERT")),
            "employer": str(c.get("EMPLOYER_NAME") or ""),
            "race": str(c.get("HH_RACE") or ""),
            "age": _si(c.get("HH_Member__AGE1")),
            "sex": str(c.get("HH_SEX") or ""),
            "expedited": "Entitled" in str(c.get("EXPEDSER") or ""),
            "allotment_adj": str(c.get("ALLADJ") or "No adjustment"),
            "adj_amount": _sf(c.get("AMTADJ")),
            "poverty_pct": _sf(c.get("TPOV")),
            "income_source": _income_source(c),
            "work_status": str(c.get("HH_EMPSTA") or ""),
            "warning_1": c.get("SAMPLE_WARNING_1"),
            "warning_2": c.get("SAMPLE_WARNING_2"),
            "risk_score": risk["risk_score"],
            "severity": risk["severity"],
            "risk_flags": risk["risk_flags"],
            "risk_factors": risk["risk_factors"],
            "error_amount": risk["error_amount"],
            "error_type": error_type,
            "copilot": copilot,
            "status": "pending",
        })
    return enriched


# ── Helpers ───────────────────────────────────────────────────────────────────

def _si(v, default=0):
    try:
        return int(v)
    except (ValueError, TypeError):
        return default


def _sf(v, default=0.0):
    try:
        return float(v)
    except (ValueError, TypeError):
        return default


def _income_source(c: dict) -> str:
    sources = []
    if _sf(c.get("FSWAGES")) > 0:   sources.append("Wages")
    if _sf(c.get("FSSSI")) > 0:     sources.append("SSI")
    if _sf(c.get("FSSOCSEC")) > 0:  sources.append("Social Security")
    if _sf(c.get("FSTANF")) > 0:    sources.append("TANF")
    if _sf(c.get("FSUNEMP")) > 0:   sources.append("Unemployment")
    if _sf(c.get("FSSLFEMP")) > 0:  sources.append("Self-Employment")
    return ", ".join(sources) if sources else "None reported"


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    excel_src = "/tmp/snap_qc_data.xlsx"
    raw = load_snap_qc_excel(excel_src)
    enriched = enrich_cases(raw)

    out_path = os.path.join(DATA_DIR, "snap_qc_enriched.json")
    with open(out_path, "w") as f:
        json.dump(enriched, f, indent=2, default=str)

    high = sum(1 for c in enriched if c["severity"] == "HIGH")
    med  = sum(1 for c in enriched if c["severity"] == "MEDIUM")
    low  = sum(1 for c in enriched if c["severity"] == "LOW")
    total_exposure = sum(c["error_amount"] for c in enriched)
    hm_exposure = sum(c["error_amount"] for c in enriched if c["severity"] in ("HIGH","MEDIUM"))
    print(f"Processed {len(enriched)} cases")
    print(f"  HIGH: {high}  MEDIUM: {med}  LOW: {low}")
    print(f"  Total $ exposure:       ${total_exposure:,.0f}")
    print(f"  HIGH+MEDIUM exposure:   ${hm_exposure:,.0f}")
    print(f"  Penalty savings @ 75%:  ${hm_exposure*0.75:,.0f}")
    print(f"Saved to {out_path}")
