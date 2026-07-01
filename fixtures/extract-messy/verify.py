"""Rule-targeted checker for the messy extraction. Validates the hard edges
(dedup, malformed-email exclusion, missing-city -> null, state stripping, name
cleanup, sort order) rather than comparing to a stored answer."""
import json
import pathlib
import sys

p = pathlib.Path("result.json")
if not p.exists():
    print("FAIL: result.json was not written")
    sys.exit(1)

try:
    rows = json.loads(p.read_text())
except Exception as e:  # noqa: BLE001
    print(f"FAIL: result.json is not valid JSON: {e}")
    sys.exit(1)

if not isinstance(rows, list):
    print("FAIL: result.json must be a JSON array")
    sys.exit(1)

errs = []
by_email = {r.get("email"): r for r in rows if isinstance(r, dict)}


def want(email, name, city):
    r = by_email.get(email)
    if r is None:
        errs.append(f"missing record for {email}")
        return
    if set(r) != {"name", "city", "email"}:
        errs.append(f"{email}: keys must be name, city, email (got {sorted(r)})")
    if str(r.get("name", "")).strip() != name:
        errs.append(f"{email}: name {r.get('name')!r} != {name!r}")
    if r.get("city") != city:
        errs.append(f"{email}: city {r.get('city')!r} != {city!r}")


want("maria.lopez@example.com", "Maria Lopez", "Tampa")
want("jchen@example.com", "James Chen", "Austin")   # deduped
want("priya@example.com", "Priya Nair", "Miami")
want("tomas.garcia@example.com", "Tomas Garcia", None)  # missing city -> null
want("sam.oneil@example.co.uk", "Sam O'Neil", "Seattle")

if len(rows) != 5:
    errs.append(f"expected 5 records (dedup + drop malformed), got {len(rows)}")

if "not-an-email" in json.dumps(rows):
    errs.append("the row with a malformed email was not excluded")

names = [str(r.get("name", "")) for r in rows if isinstance(r, dict)]
if names != sorted(names):
    errs.append(f"records are not sorted by name: {names}")

if errs:
    print("FAIL: " + "; ".join(errs))
    sys.exit(1)

print("ok")
