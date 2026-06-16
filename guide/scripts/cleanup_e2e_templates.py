#!/usr/bin/env python3
"""Remove E2E test templates (type='e2e') from the guide SQLite database.

Dry-run by default. Pass --apply to delete rows and optional DSL files under data/templates/.

Usage:
  python guide/scripts/cleanup_e2e_templates.py
  python guide/scripts/cleanup_e2e_templates.py --apply
  python guide/scripts/cleanup_e2e_templates.py --apply --delete-files
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
GUIDE_ROOT = SCRIPT_DIR.parent
DEFAULT_DB = GUIDE_ROOT / "data" / "guide.db"
TEMPLATES_DIR = GUIDE_ROOT / "data" / "templates"


def main() -> int:
    parser = argparse.ArgumentParser(description="Clean up E2E templates from guide.db")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="Path to guide SQLite DB")
    parser.add_argument("--apply", action="store_true", help="Actually delete rows (default: dry-run)")
    parser.add_argument("--delete-files", action="store_true", help="Also remove template DSL JSON files")
    args = parser.parse_args()

    if not args.db.exists():
        print(f"Database not found: {args.db}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, name, type, created_at FROM templates WHERE type = 'e2e' ORDER BY created_at"
    ).fetchall()

    print(f"Found {len(rows)} e2e template(s) in {args.db}")
    for row in rows[:20]:
        print(f"  - {row['id'][:8]}… {row['name']!r} ({row['created_at']})")
    if len(rows) > 20:
        print(f"  … and {len(rows) - 20} more")

    if not args.apply:
        print("\nDry-run only. Re-run with --apply to delete.")
        return 0

    ids = [row["id"] for row in rows]
    if not ids:
        print("Nothing to delete.")
        return 0

    placeholders = ",".join("?" for _ in ids)
    conn.execute(f"DELETE FROM templates WHERE id IN ({placeholders})", ids)
    conn.commit()
    print(f"\nDeleted {len(ids)} template row(s).")

    if args.delete_files:
        removed = 0
        for tid in ids:
            for path in TEMPLATES_DIR.glob(f"{tid}*.json"):
                path.unlink(missing_ok=True)
                removed += 1
        print(f"Removed {removed} DSL file(s) under {TEMPLATES_DIR}")

    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())