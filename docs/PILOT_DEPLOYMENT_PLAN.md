# Pilot Deployment Plan — Aydın GROS OS V1.0

This document defines the framework for launching the pilot deployment of **Aydın GROS OS** in a real-world supermarket environment.

---

## 1. Scope & Constraints
- **Pilot Location:** Aydın Gros Erenler Şubesi (Lane 1 and Lane 2).
- **Duration:** 14-day parallel run trial.
- **Goal:** Validate offline-first transaction reliability, weighted scale scanning, GİB taxpayer lookup latency, and Yeni Nesil ÖKC slip printing.
- **Fail-safe Mode:** The existing legacy POS system will remain physically next to Lane 1 and 2 to serve as an instant backup fallback if needed.

---

## 2. Deployment Timeline & Milestones

| Day | Milestone | Objective |
| :--- | :--- | :--- |
| **Day 1** | Local Infrastructure Setup | Install store node backroom server, SQLite databases, and loopback TCP wrappers. |
| **Day 2** | Hardware Integration | Connect Epson receipt printers, Mettler Toledo scales, and Beko ÖKC terminals. |
| **Day 3** | Dry-run E2E validation | Cashiers run mock basket checkouts using test barcodes before store opens. |
| **Day 4-10** | Live Parallel Testing | Run Lane 1 and 2 checkouts with select loyalty customers, mirroring records in legacy POS. |
| **Day 11-14** | Primary Pilot Run | Transition Lane 1 and 2 entirely to Aydın GROS OS checkouts. |

---

## 3. Monitoring & Rollback Triggers

### Observability Metrics
- **Sync Latency:** Alerts corporate IT if local SQLite changes take > 5 minutes to replicate to the central cloud during internet active windows.
- **Weighing Accuracy:** Manager authorization alerts trigger if scanned scale weight deviates from target plate weight by > 20g.
- **ÖKC Print Timeout:** Slips must output within 4 seconds of payment authorization.

### Rollback Parameters
The lane supervisor will immediately shut down the pilot POS and reactivate the legacy POS terminal if:
1. Local SQLite database corruption occurs causing sales screen freezes.
2. The Yeni Nesil ÖKC prints incorrect VAT rates (e.g. mapping 20% products to 1%).
3. The register fails to complete three consecutive loyalty customer checkouts due to scanner or device driver freezes.
