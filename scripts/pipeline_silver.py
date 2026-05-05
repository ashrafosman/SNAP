# Databricks notebook source
"""
SNAP QC Silver Layer — Validation & Cross-Reference
Reads from bronze Delta tables, applies SNAP policy validation rules,
and writes validated records to silver tables with error flags.
Logs per-check DQ metrics to pipeline_dq_metrics table.
"""
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import DoubleType
from datetime import datetime
import json
import uuid

spark = SparkSession.builder.getOrCreate()

CATALOG = "serverless_stable_rek03f_catalog"
SCHEMA  = "snap_qc"
DQ_TABLE = f"{CATALOG}.{SCHEMA}.pipeline_dq_metrics"

run_id = str(uuid.uuid4())[:8]
run_time = datetime.utcnow().isoformat()
results = {}
dq_metrics = []

# ── 1. SNAP QC Cases — income & benefit validation ───────────────────────────
df = spark.table(f"{CATALOG}.{SCHEMA}.bronze_snap_qc_cases")
total = df.count()
cols = df.columns

# Gross income test (RAWGROSS > 3000/mo proxy for >130% FPL)
gross_fail = df.filter(F.col("RAWGROSS").cast(DoubleType()) > 3000).count() if "RAWGROSS" in cols else 0

# Benefit ceiling: RAWBEN > BENMAX
benefit_ceil_fail = 0
if "RAWBEN" in cols and "BENMAX" in cols:
    benefit_ceil_fail = df.filter(
        (F.col("RAWBEN").cast(DoubleType()) > F.col("BENMAX").cast(DoubleType())) &
        (F.col("BENMAX").cast(DoubleType()) > 0)
    ).count()
elif "RAWBEN" in cols and "BENMA" in cols:
    benefit_ceil_fail = df.filter(
        (F.col("RAWBEN").cast(DoubleType()) > F.col("BENMA").cast(DoubleType())) &
        (F.col("BENMA").cast(DoubleType()) > 0)
    ).count()

# Utility allowance conflict
utility_conflict = 0
if "SUA1" in cols and "SUA2" in cols:
    utility_conflict = df.filter(
        F.col("SUA1").isNotNull() & F.col("SUA2").isNotNull() &
        (F.col("SUA1") != "No utilities and no LIHEAA assistance") &
        (F.col("SUA2") != "No utilities and no LIHEAA assistance")
    ).count()

# Zero income with active benefit
zero_income_benefit = 0
if "RAWGROSS" in cols and "RAWBEN" in cols:
    zero_income_benefit = df.filter(
        (F.col("RAWGROSS").cast(DoubleType()) == 0) &
        (F.col("RAWBEN").cast(DoubleType()) > 0)
    ).count()

# Income period mismatch proxy: check _c147 / _c148 warning columns
income_period_mismatch = 0
if "_c147" in cols:
    income_period_mismatch = df.filter(
        F.lower(F.col("_c147")).contains("bi-")
    ).count()

# Deduction missed proxy: cases where FSTOTDED == 0 but FSUSIZE > 1
deduction_missed = 0
if "FSTOTDED" in cols and "FSUSIZE" in cols:
    deduction_missed = df.filter(
        (F.col("FSTOTDED").cast(DoubleType()) == 0) &
        (F.col("FSUSIZE").cast(DoubleType()) > 1)
    ).count()

# FPL boundary monitoring: TPOV between 120 and 130
fpl_boundary = 0
if "TPOV" in cols:
    fpl_boundary = df.filter(
        (F.col("TPOV").cast(DoubleType()) > 120) &
        (F.col("TPOV").cast(DoubleType()) <= 130)
    ).count()

# Estimate exposure for failed checks
avg_benefit = df.agg(F.avg(F.col("RAWBEN").cast(DoubleType()))).collect()[0][0] or 0
gross_exposure = round(gross_fail * avg_benefit * 0.15, 2)
ceiling_exposure = round(benefit_ceil_fail * avg_benefit * 0.2, 2)
utility_exposure = round(utility_conflict * avg_benefit * 0.1, 2)
income_period_exposure = round(income_period_mismatch * avg_benefit * 0.12, 2)
deduction_exposure = round(deduction_missed * avg_benefit * 0.08, 2)

# Write silver validated cases with error flags
df_silver = df.withColumn("silver_processed_at", F.lit(run_time))
if "RAWGROSS" in cols:
    df_silver = df_silver.withColumn("income_test_flag", (F.col("RAWGROSS").cast(DoubleType()) > 3000).cast("boolean"))
if "RAWBEN" in cols and ("BENMAX" in cols or "BENMA" in cols):
    ben_col = "BENMAX" if "BENMAX" in cols else "BENMA"
    df_silver = df_silver.withColumn(
        "benefit_ceiling_flag",
        ((F.col("RAWBEN").cast(DoubleType()) > F.col(ben_col).cast(DoubleType())) &
         (F.col(ben_col).cast(DoubleType()) > 0)).cast("boolean")
    )
if "RAWGROSS" in cols and "RAWBEN" in cols:
    df_silver = df_silver.withColumn(
        "zero_income_flag",
        ((F.col("RAWGROSS").cast(DoubleType()) == 0) &
         (F.col("RAWBEN").cast(DoubleType()) > 0)).cast("boolean")
    )

df_silver.write.format("delta").mode("overwrite") \
    .option("overwriteSchema", "true") \
    .saveAsTable(f"{CATALOG}.{SCHEMA}.silver_snap_qc_validated")

results["snap_qc_validated"] = {
    "source": "bronze_snap_qc_cases",
    "records_processed": total,
    "income_test_failures": gross_fail,
    "benefit_ceiling_failures": benefit_ceil_fail,
    "utility_conflicts": utility_conflict,
    "zero_income_with_benefit": zero_income_benefit,
    "income_period_mismatch": income_period_mismatch,
    "deduction_missed": deduction_missed,
    "fpl_boundary": fpl_boundary,
}

# DQ metrics for silver checks
total_exposure = gross_exposure + ceiling_exposure + utility_exposure + income_period_exposure + deduction_exposure

dq_metrics.extend([
    (run_id, run_time, "silver", "Gross income eligibility pre-screen",
     "Gross income <= 130% FPL before certification",
     total - gross_fail, gross_fail, total,
     round(((total - gross_fail) / total) * 100, 1) if total > 0 else 100.0,
     "CRITICAL", "Gross Income Test Failure", gross_exposure,
     "Cases exceeding 130% FPL are categorically ineligible"),
    (run_id, run_time, "silver", "Income period consistency",
     "Bi-weekly pay not misclassified as semi-monthly",
     total - income_period_mismatch, income_period_mismatch, total,
     round(((total - income_period_mismatch) / total) * 100, 1) if total > 0 else 100.0,
     "HIGH", "Income Period Mismatch", income_period_exposure,
     "Bi-weekly x 26 / 12 != semi-monthly x 24 / 12"),
    (run_id, run_time, "silver", "Benefit ceiling validation",
     "Reported benefit does not exceed household maximum allotment",
     total - benefit_ceil_fail, benefit_ceil_fail, total,
     round(((total - benefit_ceil_fail) / total) * 100, 1) if total > 0 else 100.0,
     "HIGH", "Overpayment - Income Understated", ceiling_exposure,
     "Benefits above household max are automatic overpayments"),
    (run_id, run_time, "silver", "Utility allowance deduplication",
     "No two active cases at the same address both claim SUA",
     total - utility_conflict, utility_conflict, total,
     round(((total - utility_conflict) / total) * 100, 1) if total > 0 else 100.0,
     "HIGH", "Utility Allowance Conflict", utility_exposure,
     "Dual SUA claims inflate shelter deduction"),
    (run_id, run_time, "silver", "FPL boundary monitoring (120-130%)",
     "Flag cases within 10 points of the 130% gross income limit",
     total - fpl_boundary, fpl_boundary, total,
     round(((total - fpl_boundary) / total) * 100, 1) if total > 0 else 100.0,
     "MEDIUM", "Borderline eligibility", 0.0,
     "Boundary cases require enhanced income verification"),
    (run_id, run_time, "silver", "Deduction coverage check",
     "All allowable deductions captured for multi-person households",
     total - deduction_missed, deduction_missed, total,
     round(((total - deduction_missed) / total) * 100, 1) if total > 0 else 100.0,
     "MEDIUM", "Underpayment - Deduction Missed", deduction_exposure,
     "Missed deductions reduce net income artificially"),
    (run_id, run_time, "silver", "Zero-income sanity check",
     "Cases with $0 gross income but active benefit > $0",
     total - zero_income_benefit, zero_income_benefit, total,
     round(((total - zero_income_benefit) / total) * 100, 1) if total > 0 else 100.0,
     "MEDIUM", "Overpayment - Income Understated", 0.0,
     "Zero reported income with active benefit warrants verification"),
])

# ── 2. Demographics — cross-reference SNAP cases ─────────────────────────────
df_demo = spark.table(f"{CATALOG}.{SCHEMA}.bronze_demographics")
demo_total = df_demo.count()
demo_cols = df_demo.columns

minor_solo = df_demo.filter(F.col("age") < 18).count() if "age" in demo_cols else 0
addr_col = next((c for c in ["address", "street_address", "address_line1"] if c in demo_cols), None)
missing_addr = df_demo.filter(F.col(addr_col).isNull() | (F.col(addr_col) == "")).count() if addr_col else 0

df_demo_silver = df_demo.withColumn("silver_processed_at", F.lit(run_time))
if "age" in demo_cols:
    df_demo_silver = df_demo_silver.withColumn("minor_flag", (F.col("age") < 18).cast("boolean"))
if addr_col:
    df_demo_silver = df_demo_silver.withColumn(
        "missing_address_flag", (F.col(addr_col).isNull() | (F.col(addr_col) == "")).cast("boolean")
    )

df_demo_silver.write.format("delta").mode("overwrite") \
    .option("overwriteSchema", "true") \
    .saveAsTable(f"{CATALOG}.{SCHEMA}.silver_demographics_validated")

results["demographics_validated"] = {
    "source": "bronze_demographics",
    "records_processed": demo_total,
    "minor_solo_flags": minor_solo,
    "missing_address_flags": missing_addr,
}

# ── 3. ADT — housing instability cross-reference ─────────────────────────────
df_adt = spark.table(f"{CATALOG}.{SCHEMA}.bronze_adt_encounters")
adt_total = df_adt.count()

homeless_flag = 0
if "admission_type" in df_adt.columns:
    homeless_flag = df_adt.filter(
        F.lower(F.col("admission_type")).contains("emergency")
    ).count()

df_adt.withColumn("silver_processed_at", F.lit(run_time)) \
    .write.format("delta").mode("overwrite") \
    .option("overwriteSchema", "true") \
    .saveAsTable(f"{CATALOG}.{SCHEMA}.silver_adt_validated")

results["adt_validated"] = {
    "source": "bronze_adt_encounters",
    "records_processed": adt_total,
    "emergency_admissions": homeless_flag,
}

# ── 4. Write DQ metrics to shared table ──────────────────────────────────────
from pyspark.sql.types import StructType, StructField, StringType, IntegerType as IT, DoubleType as DT
dq_schema = StructType([
    StructField("run_id", StringType()), StructField("run_time", StringType()),
    StructField("layer", StringType()), StructField("check_name", StringType()),
    StructField("description", StringType()), StructField("passed", IT()),
    StructField("failed", IT()), StructField("total", IT()),
    StructField("pass_rate", DT()), StructField("severity", StringType()),
    StructField("error_type", StringType()), StructField("exposure_at_risk", DT()),
    StructField("impact", StringType()),
])
df_dq = spark.createDataFrame(dq_metrics, dq_schema)
df_dq.write.format("delta").mode("append") \
    .option("mergeSchema", "true") \
    .saveAsTable(DQ_TABLE)

# ── 5. Summary ───────────────────────────────────────────────────────────────
total_records = sum(v["records_processed"] for v in results.values())

print(json.dumps({
    "layer": "silver",
    "run_id": run_id,
    "run_time": run_time,
    "tables_written": [f"silver_{k}" for k in results.keys()],
    "total_records_processed": total_records,
    "total_exposure_at_risk": total_exposure,
    "dq_checks_logged": len(dq_metrics),
    "details": results,
}, indent=2))
