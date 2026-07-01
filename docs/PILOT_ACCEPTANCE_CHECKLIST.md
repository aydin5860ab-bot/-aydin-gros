# Pilot Acceptance Checklist — V1.0 Release Sign-off

This checklist must be executed on Lane 1 and Lane 2 by the QA Lead and Store Manager before the official pilot run launch.

---

## 1. Hardware Integration Checks
- `[ ]` Barcode scanner successfully scans standard EAN-13 retail labels.
- `[ ]` Weighing scale automatically transmits item weight to POS cart.
- `[ ]` Receipt printer prints clean CP857 Turkish characters (ğ, ş, ı, ç, ö, ü) without garbled letters.
- `[ ]` Cash drawer opens automatically upon Nakit payment completions.

---

## 2. Core Checkout Scenarios
- `[ ]` Cash payment returns accurate change value.
- `[ ]` Credit Card payment completes via Yeni Nesil ÖKC.
- `[ ]` Split payment splits cart value between Nakit and Kart accurately.
- `[ ]` Loyalty card lookup retrieves active consumer profile and updates balance.
- `[ ]` Dynamic pricing engine resolves regional price books overrides.

---

## 3. Resilience & Failure Recovery
- `[ ]` Unplugging WAN ethernet cable: POS continues checking out items in [OFFLINE-FIRST] mode.
- `[ ]` Reconnecting WAN ethernet cable: SQLite change records sync to Supabase within 60 seconds.
- `[ ]` Power termination emulation: Rebooting computer resumes the cash session state without database loss.
- `[ ]` Z-Report shift closure runs successfully, archiving sales counts and lock session.

---

## 4. Security Verification
- `[ ]` Rapid PIN codes brute forcing triggers HTTP 429 rate limit block.
- `[ ]` Forged JWT session tokens are rejected with HTTP 403.
