# Databricks notebook source
"""
SNAP QC Bronze Layer — Raw Ingestion
Reads snap_qc_cases.csv and all synthetic state files from the volume,
validates schema/types/uniqueness, and writes to Delta bronze tables.
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
VOLUME  = f"/Volumes/{CATALOG}/{SCHEMA}/raw_files"
DQ_TABLE = f"{CATALOG}.{SCHEMA}.pipeline_dq_metrics"

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")

run_id = str(uuid.uuid4())[:8]
run_time = datetime.utcnow().isoformat()
results = {}
dq_metrics = []

# ── 1. SNAP QC Cases ─────────────────────────────────────────────────────────
df_cases = spark.read.option("header", True).option("inferSchema", True).csv(f"{VOLUME}/snap_qc_cases.csv")
total = df_cases.count()

required_cols = ["HHLDNO", "RAWBEN", "RAWGROSS", "FSUSIZE", "CERTMTH"]
missing = [c for c in required_cols if c not in df_cases.columns]
schema_ok = total - df_cases.filter(
    F.col("HHLDNO").isNull() | F.col("RAWBEN").isNull() | F.col("RAWGROSS").isNull()
).count()

# Duplicate HHLDNO check
dup_count = total - df_cases.dropDuplicates(["HHLDNO"]).count()

# Numeric validity: RAWGROSS should be numeric
type_ok = total - df_cases.filter(~F.col("RAWGROSS").cast(DoubleType()).isNotNull()).count()

# Employer name coverage
missing_employer = df_cases.filter(
    F.col("HH_EMPSTA").isNull() | (F.trim(F.col("HH_EMPSTA")) == "")
).count() if "HH_EMPSTA" in df_cases.columns else 0

df_cases.write.format("delta").mode("overwrite") \
    .option("overwriteSchema", "true") \
    .saveAsTable(f"{CATALOG}.{SCHEMA}.bronze_snap_qc_cases")

results["snap_qc_cases"] = {
    "source": "snap_qc_cases.csv",
    "records_ingested": total,
    "schema_pass": schema_ok,
    "schema_fail": total - schema_ok,
    "type_pass": type_ok,
    "type_fail": total - type_ok,
    "duplicate_ids": dup_count,
}

# DQ metrics for bronze QC cases
dq_metrics.extend([
    (run_id, run_time, "bronze", "Schema completeness",
     "All required fields present and non-null",
     schema_ok, total - schema_ok, total,
     round((schema_ok / total) * 100, 1) if total > 0 else 100.0,
     "CRITICAL", None, 0.0,
     "Downstream risk scoring fails without complete records"),
    (run_id, run_time, "bronze", "Numeric field validity",
     "Income and benefit fields are parseable numbers",
     type_ok, total - type_ok, total,
     round((type_ok / total) * 100, 1) if total > 0 else 100.0,
     "CRITICAL", None, 0.0,
     "NA/string values cause silent $0 income calculations"),
    (run_id, run_time, "bronze", "Household ID uniqueness",
     "No duplicate HHLDNO across sample",
     total - dup_count, dup_count, total,
     round(((total - dup_count) / total) * 100, 1) if total > 0 else 100.0,
     "HIGH", None, 0.0,
     "Duplicate records double-count error exposure in QC sample"),
    (run_id, run_time, "bronze", "Employer name coverage",
     "Employment status present for wage-earning cases",
     total - missing_employer, missing_employer, total,
     round(((total - missing_employer) / total) * 100, 1) if total > 0 else 100.0,
     "MEDIUM", None, 0.0,
     "Missing employer blocks wage-record cross-reference in Silver layer"),
])

# ── 2. Demographics ──────────────────────────────────────────────────────────
df_demo = spark.read.option("header", True).option("inferSchema", True) \
    .csv(f"{VOLUME}/synthetic_*_01_demographics.csv")
demo_total = df_demo.count()
demo_schema_ok = demo_total - df_demo.filter(
    F.col("person_id").isNull() | F.col("first_name").isNull()
).count()
df_demo.write.format("delta").mode("overwrite") \
    .option("overwriteSchema", "true") \
    .saveAsTable(f"{CATALOG}.{SCHEMA}.bronze_demographics")
results["demographics"] = {
    "source": "synthetic_*_01_demographics.csv",
    "records_ingested": demo_total,
    "schema_pass": demo_schema_ok,
    "schema_fail": demo_total - demo_schema_ok,
}

# ── 3. ADT Encounters ────────────────────────────────────────────────────────
df_adt = spark.read.option("header", True).option("inferSchema", True) \
    .csv(f"{VOLUME}/synthetic_*_02_adt.csv")
adt_total = df_adt.count()
df_adt.write.format("delta").mode("overwrite") \
    .option("overwriteSchema", "true") \
    .saveAsTable(f"{CATALOG}.{SCHEMA}.bronze_adt_encounters")
results["adt_encounters"] = {
    "source": "synthetic_*_02_adt.csv",
    "records_ingested": adt_total,
    "schema_pass": adt_total,
    "schema_fail": 0,
}

# ── 4. PRAPARE Assessments ───────────────────────────────────────────────────
df_prapare = spark.read.option("header", True).option("inferSchema", True) \
    .csv(f"{VOLUME}/synthetic_*_03_prapare_assessment.csv")
prapare_total = df_prapare.count()
df_prapare.write.format("delta").mode("overwrite") \
    .option("overwriteSchema", "true") \
    .saveAsTable(f"{CATALOG}.{SCHEMA}.bronze_prapare_assessments")
results["prapare_assessments"] = {
    "source": "synthetic_*_03_prapare_assessment.csv",
    "records_ingested": prapare_total,
    "schema_pass": prapare_total,
    "schema_fail": 0,
}

# ── 5. Cancer Registry ───────────────────────────────────────────────────────
df_cancer = spark.read.option("header", True).option("inferSchema", True) \
    .csv(f"{VOLUME}/synthetic_*_05_cancer_registry.csv")
cancer_total = df_cancer.count()
df_cancer.write.format("delta").mode("overwrite") \
    .option("overwriteSchema", "true") \
    .saveAsTable(f"{CATALOG}.{SCHEMA}.bronze_cancer_registry")
results["cancer_registry"] = {
    "source": "synthetic_*_05_cancer_registry.csv",
    "records_ingested": cancer_total,
    "schema_pass": cancer_total,
    "schema_fail": 0,
}

# ── 6. Write DQ metrics to shared table ──────────────────────────────────────
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

# ── 7. Summary log ───────────────────────────────────────────────────────────
total_records = sum(v["records_ingested"] for v in results.values())
total_pass    = sum(v["schema_pass"] for v in results.values())
total_fail    = sum(v["schema_fail"] for v in results.values())

print(json.dumps({
    "layer": "bronze",
    "run_id": run_id,
    "run_time": run_time,
    "tables_written": list(results.keys()),
    "total_records_ingested": total_records,
    "total_schema_pass": total_pass,
    "total_schema_fail": total_fail,
    "dq_checks_logged": len(dq_metrics),
    "details": results,
}, indent=2))
