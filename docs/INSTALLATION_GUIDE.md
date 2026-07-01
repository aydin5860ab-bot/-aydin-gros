# Installation Guide — Local Store Node Provisioning

This guide outlines steps to set up and run the local node of **Aydın GROS OS** on standard store lane registers.

---

## 1. Prerequisites
- **OS:** Windows 10/11 Pro (64-bit).
- **Runtime:** Node.js v18.0.0 or higher.
- **Port Allocations:**
  - Local POS UI Server: `3001`
  - Scale Socket Bridge: `9991`
  - Receipt Printer Socket Bridge: `9992`

---

## 2. Step-by-Step Installation

### Step A: Download & Extract POS Bundle
1. Copy the release folder to `C:\AydınGrosOS` on the checkout computer.
2. Verify that `db_products.json` and `.env.local` are present in the directory.

### Step B: Configure Store Local Node
1. Edit `C:\AydınGrosOS\.env.local` to define the checkout environment:
   ```env
   NODE_ENV=production
   FORCE_JSON_DB=true
   DEFAULT_TENANT_ID=11111111-1111-1111-1111-111111111111
   JWT_SECRET=aydingros-offline-secret-key-12345
   ```

### Step C: Execute Automated Provisioning
1. Open PowerShell as Administrator.
2. Navigate to `C:\AydınGrosOS` and execute the bootstrapper:
   ```bash
   node scripts/bootstrap_store_node.js
   ```
3. Confirm that the terminal outputs `🎉 SUCCESS - READY FOR ENTERPRISE RETAIL DEPLOYMENT`.

---

## 3. Launching watchdogs & Auto-start on boot

To ensure the local server boots automatically upon register start:
1. Open the Windows Run dialog (`Win + R`), type `shell:startup`, and press Enter.
2. Create a shortcut to a batch file `C:\AydınGrosOS\start_pos.bat` containing:
   ```bat
   @echo off
   cd /d "C:\AydınGrosOS"
   node scripts/bootstrap_store_node.js
   npx next start -p 3001
   ```
3. Restart the machine to verify the local lane dashboard boots on startup.
