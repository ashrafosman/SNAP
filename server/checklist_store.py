"""Persistent checklist store — SQLite for local dev."""
import sqlite3
import logging
from pathlib import Path
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent / "data" / "checklist.db"


def _get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS checklist_items (
            case_id    INTEGER NOT NULL,
            item_key   TEXT NOT NULL,
            done       INTEGER NOT NULL DEFAULT 0,
            note       TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL,
            PRIMARY KEY (case_id, item_key)
        )
    """)
    return conn


def get_checklist(case_id: int) -> dict[str, dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT item_key, done, note FROM checklist_items WHERE case_id = ?",
        (case_id,),
    ).fetchall()
    conn.close()
    return {row[0]: {"done": bool(row[1]), "note": row[2]} for row in rows}


def save_checklist_item(case_id: int, item_key: str, done: bool, note: str) -> None:
    conn = _get_conn()
    conn.execute(
        """INSERT OR REPLACE INTO checklist_items (case_id, item_key, done, note, updated_at)
           VALUES (?, ?, ?, ?, ?)""",
        (case_id, item_key, int(done), note, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    conn.close()
