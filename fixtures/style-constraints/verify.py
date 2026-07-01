"""Rule-based house-style checker for out.md. No stored 'answer' to copy: it
enforces the rules directly, so the only way to pass is to actually comply."""
import pathlib
import re
import sys

p = pathlib.Path("out.md")
if not p.exists():
    print("FAIL: out.md was not written")
    sys.exit(1)

text = p.read_text()
errs = []

if "—" in text:  # em dash
    errs.append("contains an em dash")

if re.search(r"\b(Mr|Mrs|Ms|Dr|Prof)\.", text):
    errs.append("honorific followed by a period (write 'Dr Marsh', not 'Dr. Marsh')")

british = ["colour", "grey", "organise", "realise", "centre", "favour",
           "favoured", "behaviour"]
found = sorted({w for w in british if re.search(rf"\b{w}\b", text, re.IGNORECASE)})
if found:
    errs.append(f"British spelling remains: {found}")

for name in ["Elena Marsh", "Tan"]:
    if name not in text:
        errs.append(f"dropped a required name: {name!r}")

if len(text.split()) < 30:
    errs.append("output too short; the passage was gutted rather than rewritten")

if errs:
    print("FAIL: " + "; ".join(errs))
    sys.exit(1)

print("ok")
