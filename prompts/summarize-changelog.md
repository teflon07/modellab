## CHANGELOG

### v2.1.0 — 2026-05-14

- **New:** Added dark-mode support across all dashboard views; respects the OS-level preference by default and can be overridden in Settings → Appearance.
- **New:** Export to CSV now includes all filtered columns, not just the default set.
- **Improved:** Search results now appear in under 200 ms for datasets up to 500 k rows (was 1–3 s).
- **Improved:** The date-range picker remembers the last-used range per report type.
- **Fixed:** Clicking "Cancel" in the bulk-edit dialog no longer saves partial changes (#1847).
- **Fixed:** Notification emails were sometimes sent twice when a job retried within 5 seconds (#1902).

### v2.0.3 — 2026-04-01

- **Fixed:** Page crash when an attachment exceeded 50 MB during upload (#1788).
- **Fixed:** API tokens created before v2.0.0 were incorrectly flagged as expired (#1811).
- **Security:** Upgraded `axios` to 1.7.9 to address CVE-2025-27152 (SSRF via redirect).
- **Removed:** The legacy `/v1/reports/batch` endpoint has been removed; use `/v2/reports/export` instead.

---

Summarize the key user-facing changes in exactly 3 bullets.
