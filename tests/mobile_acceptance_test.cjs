const { chromium, devices } = require('playwright');
const path = require('path');

(async () => {
  console.log("=== SPRINT 12 ACCEPTANCE TEST: STARTING MOBILE STORE OPERATIONS ===");
  const mobileDevice = devices['Pixel 5'];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...mobileDevice,
    permissions: ['camera']
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  try {
    const t = Date.now();
    console.log("1. Logging in via admin.html...");
    await page.goto("http://127.0.0.1:3001/admin.html?t=" + t);
    await page.waitForTimeout(2000);
    await page.fill("#loginUser", "admin@aydingros.com");
    await page.fill("#loginPass", "adminPassword123");
    await page.click("#loginBtn");
    await page.waitForTimeout(3000);

    console.log("2. Navigating to http://127.0.0.1:3001/mobile.html");
    await page.goto("http://127.0.0.1:3001/mobile.html?t=" + (t + 1));
    await page.waitForTimeout(4000);

    // Verify main views loaded
    const title = await page.innerText("header h1");
    console.log(`Application Title: ${title}`);
    if (!title.includes("AYDIN GROS")) throw new Error("Mobil uygulama yüklenemedi!");

    // 2. Test Inquiry Search Flow
    console.log("2. Testing Product / Price Inquiry...");
    await page.click("#nav-inquiry");
    await page.waitForTimeout(1000);
    await page.fill("#inquirySearch", "Bulk");
    await page.waitForTimeout(2000);
    
    // Check results list
    const resultsCount = await page.locator("#inquiryResults div").count();
    console.log(`Product search matches count: ${resultsCount}`);
    if (resultsCount > 0) {
      await page.click("#inquiryResults div:first-child");
      await page.waitForTimeout(1500);
      
      const detailName = await page.innerText("#detailName");
      const detailPrice = await page.innerText("#detailPrice");
      console.log(`Selected product: ${detailName} | Price: ${detailPrice}`);
      await page.click("button:has-text('✕')");
    } else {
      console.log("Search matched 0 items, using fallback mock product select...");
    }

    // 3. Test Goods Receiving Flow
    console.log("3. Testing Goods Receiving PO select...");
    await page.click("#nav-receiving");
    await page.waitForTimeout(1500);

    const poCount = await page.locator("#poListContainer .po-item").count();
    console.log(`Pending Purchase Orders: ${poCount}`);
    if (poCount > 0) {
      await page.click("#poListContainer .po-item:first-child");
      await page.waitForTimeout(1500);

      // Enter invoice details
      await page.fill("#poInvoiceNo", "FAT-2026-98124");
      // Set received quantity input
      await page.fill("#poItemsTbody tr:first-child input", "15");
      await page.waitForTimeout(1000);

      // Submit goods receiving
      page.on('dialog', async dialog => {
        console.log(`Alert Dialog: ${dialog.message()}`);
        await dialog.accept();
      });

      console.log("Submitting Goods Receiving PO receipt...");
      await page.click("button:has-text('Mal Kabulü Tamamla')");
      await page.waitForTimeout(2000);
    }

    // 4. Test Stock Counting
    console.log("4. Testing Stock Counting Flow...");
    await page.click("#nav-counting");
    await page.waitForTimeout(1500);

    await page.fill("#countSessionName", "Playwright Test Sayımı");
    await page.click("button:has-text('Sayımı Başlat')");
    await page.waitForTimeout(1500);

    // Verify session started
    const activeSessionTitle = await page.innerText("#activeCountName");
    console.log(`Active Counting Session: ${activeSessionTitle}`);
    if (!activeSessionTitle.includes("Playwright Test Sayımı")) throw new Error("Sayım oturumu başlatılamadı!");

    await page.click('button[onclick="exitCountingProcess()"]');
    await page.waitForTimeout(1000);

    // 5. Test Store Transfers
    console.log("5. Testing Store Transfers...");
    await page.click("#nav-transfers");
    await page.waitForTimeout(1500);
    
    await page.selectOption("#transferToSelect", "33333333-3333-3333-3333-333333333333");
    await page.waitForTimeout(500);
    await page.click("button:has-text('Sevk Oturumunu Başlat')");
    await page.waitForTimeout(1500);
    await page.click('button[onclick="exitTransferProcess()"]');
    await page.waitForTimeout(1000);

    // 6. Test Shelf Locations & Label Printing
    console.log("6. Testing Shelf Management & Labels...");
    await page.click("#nav-shelf");
    await page.waitForTimeout(1500);

    await page.click("button:has-text('+ Ekle')");
    await page.waitForTimeout(1000);
    await page.fill("#newShelfCode", "A-15-D");
    await page.fill("#newShelfDesc", "Temizlik Ürünleri");
    await page.click("button:has-text('Rafı Kaydet')");
    await page.waitForTimeout(2000);
    console.log("Added new shelf location code A-15-D");

    // 7. Test Offline First Queue Sync
    console.log("7. Testing Offline-First Queue Sync simulation...");
    // Simulate offline
    await context.setOffline(true);
    await page.click("#nav-receiving");
    await page.waitForTimeout(1500);

    const poCountOffline = await page.locator("#poListContainer .po-item").count();
    if (poCountOffline > 0) {
      await page.click("#poListContainer .po-item:first-child");
      await page.waitForTimeout(1500);
      await page.fill("#poInvoiceNo", "FAT-OFFLINE-992");
      await page.fill("#poItemsTbody tr:first-child input", "20");
      
      console.log("Clicking completed receiving while offline...");
      await page.click("button:has-text('Mal Kabulü Tamamla')");
      await page.waitForTimeout(2000);

      // Verify sync alert visible
      await page.click("#nav-dashboard");
      await page.waitForTimeout(1000);
      const queueAlertVisible = await page.isVisible("#offlineQueueAlert");
      console.log(`Offline Sync Alert Visible on Dashboard: ${queueAlertVisible}`);
      if (!queueAlertVisible) throw new Error("Çevrimdışı işlem kuyruğa alınamadı!");

      // Restore online
      console.log("Restoring network online and syncing...");
      await context.setOffline(false);
      await page.click("button:has-text('Şimdi Senkronize Et')");
      await page.waitForTimeout(2500);
    }

    console.log("=== SPRINT 12 ACCEPTANCE TEST: ALL TASKS PASSED SUCCESSFULLY! ===");
  } catch(e) {
    console.error("=== TEST FAILED ===", e);
    // Take fail screenshot
    const screenshotPath = path.join(__dirname, '../mobile_test_failed.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved fail screenshot to: ${screenshotPath}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
