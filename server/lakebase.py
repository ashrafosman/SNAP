"""Lakebase (Postgres) connection — native PostgreSQL credentials."""
import os
import psycopg2
import psycopg2.extras

LAKEBASE_HOST     = os.environ.get("LAKEBASE_HOST",     "ep-royal-credit-e1lstvxo.database.eastus2.azuredatabricks.net")
LAKEBASE_DATABASE = os.environ.get("LAKEBASE_DATABASE", "snapqc")
LAKEBASE_USER     = os.environ.get("LAKEBASE_USER",     "snapqc_app")
LAKEBASE_PASSWORD = os.environ["LAKEBASE_PASSWORD"]


def get_connection():
    """Return a psycopg2 connection using native PostgreSQL credentials."""
    return psycopg2.connect(
        host=LAKEBASE_HOST,
        port=5432,
        database=LAKEBASE_DATABASE,
        user=LAKEBASE_USER,
        password=LAKEBASE_PASSWORD,
        sslmode="require",
        cursor_factory=psycopg2.extras.RealDictCursor,
        connect_timeout=10,
    )
