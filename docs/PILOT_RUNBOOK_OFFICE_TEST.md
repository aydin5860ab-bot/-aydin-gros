# Aydın GROS OS V1.0.0 — Office Pilot Testing Runbook

This runbook guides QA leads, technicians, and store operators through setting up, launching, and validating the stable **Aydın GROS OS v1.0.0** local store node in a simulated supermarket register environment.

---

## 📋 1. Prerequisites & Environment

Before starting the setup, ensure the test computer meets the following specifications:
* **Operating System:** Windows 10/11 Pro (64-bit).
* **Runtime Env:** Node.js v18.0.0 or higher. Verify with `node -v` (v20+ recommended).
* **Port Availability:** Port `3000` must be free (no active web servers or Python instances).
* **Hardware Emulators:** Socket bridges for scale (port `9991`) and Epson receipt printer (port `9992`) should be running if checking physical hardware integration.

---

## 🚀 2. Clean Installation & Provisioning

Follow these steps to deploy a clean production build of the store node:

### Step A: Extract the Release Package
1. Unzip or extract `aydingros_v1.0.0_backup.tar.gz` to your preferred directory (e.g. `C:\AydinGrosOS`).
2. Verify the presence of these crucial files in the directory root:
   * [install_and_run.bat](file:///c:/AYDIN%20GROS/install_and_run.bat) (Provisioning script)
   * [.env.production](file:///c:/AYDIN%20GROS/.env.production) (Production environment template)
   * `db_products.json`, `db_stock.json`, `db_branches.json` (Local database mock templates)

### Step B: Dependency Installation
Open PowerShell in the directory and install required runtime modules:
```bash
npm install
```

### Step C: Execute Automated Installer Wizard
1. Double-click [install_and_run.bat](file:///c:/AYDIN%20GROS/install_and_run.bat) or run it from the console:
   ```cmd
   install_and_run.bat
   ```
2. **What the Installer Wizard completes automatically:**
   * Checks the Node.js version compatibility.
   * Restores env configuration to `.env.local` from the production template.
   * Triggers `bootstrap_store_node.js` diagnostics to verify JSON mock tables.
   * Compiles the production build static routes and server assets using Next.js.
   * Generates the auto-restart loop launcher watchdog: [start_pos.bat](file:///c:/AYDIN%20GROS/start_pos.bat).

---

## 🖥️ 3. Launching the Store Lane

1. Double-click the generated watchdog script [start_pos.bat](file:///c:/AYDIN%20GROS/start_pos.bat) in the directory root.
2. Confirm the console prints the watchdog status:
   `[Watchdog] Starting store node POS lane server on port 3000...`
3. Wait for the Next.js ready message:
   `✓ Ready in 490ms`
4. The cash register is now listening at: `http://localhost:3000`.

---

## 🧪 4. Core Pilot Verification Scenarios

### Scenario 1: Cashier Authentication & Setup
1. Open Google Chrome and navigate to `http://localhost:3000`.
2. Login with the store credentials:
   * **Email:** `admin@aydingros.com`
   * **Password:** `adminpassword123` or `aydin586045`
3. Verify that the register starts in local database mode (`FORCE_JSON_DB=true`).

### Scenario 2: Checkout Cart Lifecycle (Cash/Card/Karma)
1. Search for a product using a barcode (e.g. `8699999000100`) or search by name.
2. Add multiple items to the basket cart.
3. Click **Ödeme Al** (Checkout).
4. Perform a **Karma Ödeme** (Split Payment):
   * Select 50% Cash (Nakit) and 50% Card (Kart).
5. Click **Satışı Tamamla** (Complete Sale) and verify:
   * Change is calculated accurately.
   * Stock quantities in the database local catalogs (`db_product_stock.json` / `db_stock.json`) decrement instantly.

### Scenario 3: Offline-First Fail-safe Simulation
1. Unplug the WAN network cable or disable the internet adapter.
2. Add items to the basket and check out.
3. Verify that the transaction completes successfully in **[OFFLINE-FIRST]** mode, caching checkout details locally in the browser store.
4. Plug the internet connection back in.
5. Confirm that the offline checkouts are pushed back and sync to the cloud verifications database within 60 seconds.

### Scenario 4: Backup Operations
1. Log in to the management dashboard.
2. Navigate to **Ayarlar -> Yedekleme** (Settings -> Backup).
3. Click **Yedek Oluştur** (Create Backup).
4. Confirm that the backup download initiates successfully (`backup_YYYY-MM-DD.json`) and is logged under the backup histories grid.

### Scenario 5: Shift Closure & Z-Report
1. At the end of the cashier test shift, open the shift panel.
2. Review the cashier expected drawer balance vs actual cash drawer balance.
3. Click **Gün Sonu / Kasa Kapat** (Z-Report Shift Close).
4. Confirm the generated Z-report displays exact sales, VAT rates, return counts, and net income balances, archiving the cashier session state safely.

---

## 🛠️ 5. Troubleshooting Diagnostics

* **Port 3000 Blocked:**
  If the console crashes with `EADDRINUSE: address already in use :::3000`, run this command in PowerShell to locate and kill the blocking process:
  ```powershell
  Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force
  ```
* **Offline SQLite Database Errors:**
  If database locking alerts appear, check that the write privileges of the folder allow next.js processes to create and write to the local `orders.db` SQLite engine.
