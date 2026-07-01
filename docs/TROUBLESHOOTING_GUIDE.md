# Troubleshooting Guide — Operational Recovery

Follow these steps to resolve hardware errors, network outages, and sync issues.

---

## 1. Offline Sync Conflicts & Recovery
* **Symptom:** POS screen indicates **"Senkronizasyon Hatası"** or local sales are not appearing in the central corporate backoffice.
* **Resolution:**
  1. Check the local network link. Ping the store backroom server from the register.
  2. Run the sync diagnostic endpoint `/api/enterprise/sync` to check current queue size.
  3. If synchronization remains stuck, run the bootstrapper `node scripts/bootstrap_store_node.js` to refresh the SQLite socket replication bridges.

---

## 2. Printer or Scale Failure
* **Symptom:** Weighing a product fails with a timeout error, or receipt print triggers hang the checkout screen.
* **Resolution:**
  1. Check that the peripheral device is powered on.
  2. Verify that cables (USB/Serial) are plugged in securely.
  3. Open the **Diagnostics Portal** in the manager dashboard at `/api/enterprise/hardware/diagnostics`.
  4. Review the latency and connection status of `scale-lane-1` and `printer-lane-1`.
  5. Restart the local bridge service by executing `C:\AydınGrosOS\start_pos.bat` again.

---

## 3. Database Corruption Recovery
* **Symptom:** Local SQLite database gets locked or corrupted due to sudden power outages.
* **Resolution:**
  1. Close all active POS screens.
  2. In the terminal, execute database recovery:
     ```bash
     node scripts/bootstrap_store_node.js
     ```
  3. The provisioner will verify database schemas and restore missing directories. 
  4. Local SQLite transactions buffered before corruption will upload automatically upon connection reset.
