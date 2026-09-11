"""Preview or apply one additive credit bonus to accounts created by a cutoff.

Run from the backend directory with the intended DATABASE_URL configured. A
preview is read-only. Add --apply only for the authorized amount and cohort.
Always reuse the same batch key when retrying this administrative operation.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.exc import SQLAlchemyError

from app.database import sync_engine
from app.services.credit_grants import apply_credit_grant, preview_credit_grant


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-key", required=True, help="Stable unique identifier; reuse on retries")
    parser.add_argument("--amount", required=True, type=int, help="Positive bonus added to each existing balance")
    parser.add_argument("--cutoff", required=True, help="Inclusive account creation cutoff with timezone (ISO 8601)")
    parser.add_argument("--apply", action="store_true", help="Apply the grant; otherwise only preview")
    args = parser.parse_args()
    try:
        operation = apply_credit_grant if args.apply else preview_credit_grant
        result = operation(sync_engine, batch_key=args.batch_key, amount=args.amount,
                           cutoff=datetime.fromisoformat(args.cutoff.replace("Z", "+00:00")))
    except ValueError as exc:
        parser.error(str(exc))
    except SQLAlchemyError:
        print(json.dumps({"status": "error", "error":
            "Database operation failed. Check migrations and connectivity, then retry with the same batch key."}))
        return 1
    finally:
        sync_engine.dispose()
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
