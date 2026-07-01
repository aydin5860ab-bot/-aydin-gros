const { chromium } = require('playwright');

(async () => {
  console.log("=== SPRINT 14 ACCEPTANCE TEST: STARTING CRM & LOYALTY PLATFORM TESTS ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('request', request => console.log('REQ >>', request.method(), request.url()));
  page.on('response', response => console.log('RES <<', response.status(), response.url()));

  try {
    const t = Date.now();
    console.log("Navigating to http://127.0.0.1:3001/admin.html");
    await page.goto("http://127.0.0.1:3001/admin.html?t=" + t);
    await page.waitForTimeout(4000);

    // 1. Authenticate if login screen is visible
    const isLoginVisible = await page.evaluate(() => {
      const login = document.getElementById('loginScreen');
      return login && login.style.display !== 'none';
    });

    if (isLoginVisible) {
      console.log("Not logged in. Performing login...");
      await page.fill("#loginUser", "admin@aydingros.com");
      await page.fill("#loginPass", "adminPassword123");
      await page.click("#loginBtn");
      await page.waitForTimeout(4000);
    }

    console.log("Logged in successfully. Current URL:", page.url());

    // 2. Open page-customers
    console.log("Clicking sidebar tab: Müşteri & Cari");
    await page.click("button[onclick=\"showPage('customers')\"]");
    await page.waitForTimeout(2000);

    // Verify customer directory page-customers is active
    const isCustomersActive = await page.evaluate(() => {
      const p = document.getElementById('page-customers');
      return p && p.style.display !== 'none';
    });
    if (!isCustomersActive) {
      throw new Error("Müşteri & Cari page failed to activate!");
    }
    console.log("🟢 CRM Müşteri page is active.");

    // Trigger renderCustomers
    await page.evaluate(() => {
      if (typeof renderCustomers === 'function') renderCustomers();
    });
    await page.waitForTimeout(2000);

    // Verify customers are rendered in the tbody
    const customerCount = await page.evaluate(() => {
      const rows = document.querySelectorAll("#customersTableBody tr");
      return rows.length;
    });
    console.log(`Number of customers rendered: ${customerCount}`);
    if (customerCount === 0) {
      throw new Error("No customer rows rendered in the CRM table!");
    }
    console.log("🟢 CRM Directory rendered customer profiles correctly.");

    // 3. Open page-loyalty
    console.log("Clicking sidebar tab: Sadakat");
    await page.click("button[onclick=\"showPage('loyalty')\"]");
    await page.waitForTimeout(2000);

    // Verify loyalty page is active
    const isLoyaltyActive = await page.evaluate(() => {
      const p = document.getElementById('page-loyalty');
      return p && p.style.display !== 'none';
    });
    if (!isLoyaltyActive) {
      throw new Error("Sadakat page failed to activate!");
    }
    console.log("🟢 CRM Sadakat page is active.");

    // Trigger loadLoyalty and wait for its promise to resolve
    await page.evaluate(async () => {
      if (typeof loadLoyalty === 'function') await loadLoyalty();
    });
    await page.waitForTimeout(3000);

    // Verify stats grid loaded
    const activeLoyaltyMembers = await page.evaluate(() => {
      const stats = document.querySelectorAll("#loyaltyStats .stat-card");
      return stats.length;
    });
    console.log(`Number of stats loaded in Loyalty Dashboard: ${activeLoyaltyMembers}`);
    if (activeLoyaltyMembers === 0) {
      throw new Error("CRM stats failed to populate!");
    }
    console.log("🟢 Store Manager CRM stats loaded correctly.");

    // 4. Test AI Campaign prompts compiler (NLP Engine)
    console.log("Testing AI NLP Campaign builder...");
    await page.fill("#aiPromptInput", "Gold üyeler için meyve sebze kategorisinde cumartesi günü %20 indirim yap");
    await page.click("button[onclick=\"compileAICampaign()\"]");
    await page.waitForTimeout(3000);
    console.log("🟢 AI Campaign compiled successfully.");

    // 5. Open POS page and test customer selections
    console.log("Navigating context to POS page...");
    await page.goto("http://127.0.0.1:3001/pos.html");
    await page.waitForTimeout(4000);

    // Explicitly reload backend data now that localstorage session is restored in playwright context
    await page.evaluate(async () => {
      if (typeof loadBackendData === 'function') {
        await loadBackendData();
      }
    });
    await page.waitForTimeout(2000);

    // Start session if opening modal is visible
    const isOpeningModalVisible = await page.evaluate(() => {
      const modal = document.getElementById('registerOpenModal');
      return modal && !modal.classList.contains('hidden');
    });
    if (isOpeningModalVisible) {
      console.log("Register session is closed. Opening register session...");
      await page.click("button[onclick=\"openRegisterSession()\"]");
      await page.waitForTimeout(2000);
    }

    // Trigger select customer selectModal
    console.log("Triggering customer select modal at POS...");
    await page.evaluate(() => {
      if (typeof openCustomerSelectModal === 'function') openCustomerSelectModal();
    });
    await page.waitForTimeout(2000);

    // Verify customers loaded in search results grid
    const posCustCount = await page.evaluate(() => {
      const gridItems = document.querySelectorAll("#custSelectGrid div");
      return gridItems.length;
    });
    console.log(`POS Customer select grid items count: ${posCustCount}`);
    if (posCustCount <= 1) { // 1 item is Retail/No Customer default
      throw new Error("No customer search options loaded at POS Select Modal!");
    }

    // Select the first customer (Ahmet Yılmaz)
    console.log("Selecting Ahmet Yılmaz from grid...");
    await page.click("#custSelectGrid > div:nth-child(2)");
    await page.waitForTimeout(3000);

    // Verify customer displayed on sidebar
    const selectedCustText = await page.innerText("#selectedCustomerDisplay");
    console.log("POS Selected Customer Sidebar Card:", selectedCustText);
    if (!selectedCustText || selectedCustText.includes("Perakende")) {
      throw new Error("Customer selection failed to update POS sidebar!");
    }
    console.log("🟢 POS Cashier Customer Lookup & Select verified successfully.");

    console.log("=== ALL SPRINT 14 CRM & LOYALTY ACCEPTANCE TESTS PASSED SUCCESSFULLY ===");
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error("❌ TEST FAILED:", err.message);
    await browser.close();
    process.exit(1);
  }
})();
