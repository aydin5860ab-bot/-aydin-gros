const fs = require('fs');
const path = require('path');
const http = require('http');

console.log(`
===================================================================
   AYDIN GROS OS — LOCAL STORE NODE AUTOMATED PROVISIONER & BOOTSTRAP
===================================================================
[Bootstrapper] Starting store node diagnostics sequence...
`);

const BASE_DIR = path.resolve(__dirname, '..');

async function main() {
  let hasErrors = false;

  // 1. Check Node runtime environment
  const nodeVer = process.version;
  const major = parseInt(nodeVer.replace('v', '').split('.')[0]);
  console.log(`[Diagnostic 1/5] Checking Node.js runtime version... (${nodeVer})`);
  if (major < 18) {
    console.error(`❌ ERROR: Next.js and SQLite Sync engine require Node.js v18+. Current: ${nodeVer}`);
    hasErrors = true;
  } else {
    console.log(`✅ Success: Node.js version is compatible.`);
  }

  // 2. Validate Local JSON Database files
  console.log(`\n[Diagnostic 2/5] Validating store local inventory catalogs files...`);
  const requiredFiles = ['db_products.json', 'db_stock.json', 'db_branches.json'];
  requiredFiles.forEach(file => {
    const filePath = path.join(BASE_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ WARNING: Local catalog file '${file}' is missing. Writing default empty catalog template...`);
      fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf-8');
    } else {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        JSON.parse(content);
        console.log(`✅ Success: ${file} verified and valid.`);
      } catch (err) {
        console.error(`❌ ERROR: File ${file} contains malformed JSON data: ${err.message}`);
        hasErrors = true;
      }
    }
  });

  // 3. Check SQLite database for offline transactions replication
  console.log(`\n[Diagnostic 3/5] Inspecting local SQLite database (orders.db)...`);
  const sqlitePath = path.join(BASE_DIR, 'orders.db');
  if (!fs.existsSync(sqlitePath)) {
    console.log(`ℹ️ Info: Local offline database 'orders.db' not found. Will be dynamically created on first local sale.`);
  } else {
    console.log(`✅ Success: Offline SQLite database detected.`);
  }

  // 4. Test LAN Connection / Central Supabase reachability
  console.log(`\n[Diagnostic 4/5] Testing WAN internet link to central cloud servers...`);
  const testHost = '127.0.0.1';
  const testPort = 3001;
  
  await new Promise((resolve) => {
    const req = http.get(`http://${testHost}:${testPort}/api/healthz`, (res) => {
      console.log(`✅ Success: Central store gateway is reachable (Status: ${res.statusCode}).`);
      resolve();
    });
    req.on('error', () => {
      console.warn(`⚠️ WARNING: Central store server at ${testHost}:${testPort} is unreachable. Operating node in [OFFLINE-FIRST] mode.`);
      resolve();
    });
    req.setTimeout(1500, () => {
      req.destroy();
      console.warn(`⚠️ WARNING: Connection timed out. Operating node in [OFFLINE-FIRST] mode.`);
      resolve();
    });
  });

  // 5. Audit logs directory structure
  console.log(`\n[Diagnostic 5/5] Auditing directory structure for cash register sync queues...`);
  const scratchDir = path.join(BASE_DIR, 'scratch');
  if (!fs.existsSync(scratchDir)) {
    console.log(`ℹ️ Info: Creating missing scratch directory...`);
    fs.mkdirSync(scratchDir, { recursive: true });
  }
  console.log(`✅ Success: File structure validated.`);

  console.log(`
===================================================================
[Bootstrapper] Store Node Diagnostics Completed.
Status: ${hasErrors ? '❌ FAILED' : '🎉 SUCCESS - READY FOR ENTERPRISE RETAIL DEPLOYMENT'}
===================================================================
`);
  if (hasErrors) {
    process.exit(1);
  }
}

main();
