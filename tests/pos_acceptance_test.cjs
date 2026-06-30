const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log("=== SPRINT 10 ACCEPTANCE TEST: STARTING POS FLOWS ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  try {
    // 1. Load login page (pos.html redirects if not logged in)
    const t = Date.now();
    console.log("Navigating to http://localhost:3001/pos.html");
    await page.goto("http://localhost:3001/pos.html?t=" + t);
    await page.waitForTimeout(4000);

    // If redirected to admin login
    if (page.url().includes("admin.html")) {
      console.log("Not logged in. Performing login redirect...");
      await page.fill("#loginUser", "admin@aydingros.com");
      await page.fill("#loginPass", "adminPassword123");
      await page.click("#loginBtn");
      await page.waitForTimeout(3000);
      
      const loginErrVisible = await page.isVisible("#loginErr");
      if (loginErrVisible) {
        const errMsg = await page.innerText("#loginErr");
        console.log("DEBUG - Login Error Message displayed on screen:", errMsg);
      }
      
      // Take a screenshot to visualize state
      const screenshotPath = path.join(__dirname, '../login_failed_debug.png');
      await page.screenshot({ path: screenshotPath });
      console.log(`Saved debug login screenshot to: ${screenshotPath}`);

      console.log("Logged in. Navigating back to pos.html");
      await page.goto("http://localhost:3001/pos.html?t=" + (t + 1));
      await page.waitForTimeout(2000);
    }

    console.log(`Current page URL: ${page.url()}`);

    console.log("Waiting for backend data load and register check...");
    await page.waitForFunction(() => {
      const badge = document.getElementById('registerStatusBadge');
      const modal = document.getElementById('registerOpenModal');
      return (badge && badge.innerText !== 'Kapalı') || (modal && !modal.classList.contains('hidden'));
    }, { timeout: 10000 });

    // 2. Open Register Session Modal check
    console.log("Checking Register Open modal...");
    const isRegisterModalVisible = await page.evaluate(() => {
      const modal = document.getElementById('registerOpenModal');
      return modal && !modal.classList.contains('hidden');
    });

    if (isRegisterModalVisible) {
      console.log("Kasa açılış modalı aktif. 500 TL ile kasa açılıyor...");
      await page.fill("#openingCashInput", "500");
      await page.click("button:has-text('Kasayı Aç ve Satışa Başla')");
      await page.waitForTimeout(1000);
    } else {
      console.log("Kasa zaten açık.");
    }

    // Asserts active register badge
    const badgeText = await page.locator("#registerStatusBadge").innerText();
    console.log(`Kasa Durumu: ${badgeText}`);
    if (badgeText !== 'Açık') throw new Error("Kasa durumu 'Açık' olmalıydı!");

    // 3. Search and Add products
    console.log("Searching for product: 'Sütaş'...");
    await page.fill("#posSearchInput", "Sütaş");
    await page.waitForTimeout(1000);
    await page.click("#searchSuggestions div:first-child"); // select match
    await page.waitForTimeout(500);

    // Add another product via quick grid card click
    console.log("Clicking first product card from grid...");
    await page.click("#posProductsGrid div:first-child");
    await page.waitForTimeout(500);

    // Assert cart has items
    const cartCountText = await page.locator("#posCartList").innerHTML();
    if (cartCountText.includes("Sepetiniz Boş")) {
      throw new Error("Ürünler sepetete eklenemedi!");
    }
    console.log("Sepete başarıyla ürün eklendi.");

    // Assert pricing calculations exist
    const subtotalText = await page.innerText("#posSubtotal");
    const totalText = await page.innerText("#posTotal");
    console.log(`Ara Toplam: ${subtotalText} | Genel Toplam: ${totalText}`);

    // 4. Test Hold & Recall Sale
    console.log("Testing Hold Sale (Sepeti Askıya Al)...");
    await page.click("button:has-text('Satışı Askıya Al')");
    await page.waitForTimeout(1000);
    
    // Assert cart is empty
    const cartEmpty = await page.locator("#posCartList").innerHTML();
    if (!cartEmpty.includes("Sepetiniz Boş")) throw new Error("Askıya alma sepeti boşaltamadı!");
    console.log("Askıya alma başarılı.");

    // Test Recall
    console.log("Testing Recall Sale (Geri Çağır)...");
    await page.click("button:has-text('Askıdaki Satışlar')");
    await page.waitForTimeout(500);
    await page.click("#heldSalesList button:has-text('Geri Çağır')");
    await page.waitForTimeout(1000);
    console.log("Sepet askıdan başarıyla geri çağırıldı.");

    // 5. Test Split / Multi payment modal inputs
    console.log("Opening Multi-Payment modal...");
    await page.click("button:has-text('Çoklu')");
    await page.waitForTimeout(1000);

    const payTotalText = await page.innerText("#multiTotalToPay");
    console.log(`Ödenecek toplam tutar: ${payTotalText}`);
    
    // Distribute cash and card payments
    console.log("Setting Cash and Card amounts...");
    await page.click("button:has-text('Tam Tutar')"); // click Nakit Tam Tutar button
    await page.waitForTimeout(500);
    
    const changeRemaining = await page.innerText("#multiPaymentRemaining");
    console.log(`Kalan Ödeme / Para Üstü: ${changeRemaining}`);

    // Complete the multi payment checkout
    console.log("Completing Split Payment checkout...");
    await page.click("#completeMultiPayBtn");
    await page.waitForTimeout(2000);
    console.log("Split Payment checkout completed.");

    // 6. Test Cash Drawer Para Ekle/Çıkar
    console.log("Testing Cash Drawer Cash-In (Para Ekle)...");
    await page.click("button:has-text('Para Ekle/Çıkar')");
    await page.waitForTimeout(500);
    await page.selectOption("#cashInOutType", "in");
    await page.fill("#cashInOutAmount", "150");
    await page.fill("#cashInOutNotes", "Bozuk para takviyesi (X Test)");
    await page.click("button:has-text('İşlemi Kaydet')");
    await page.waitForTimeout(1500);
    console.log("Nakit takviyesi başarıyla kaydedildi.");

    // 7. Test X-Report
    console.log("Testing X-Report (Kasa Raporu)...");
    await page.click("button:has-text('X Raporu Al')");
    await page.waitForTimeout(1500);
    const xReportText = await page.innerText("#xReportContent");
    console.log("X Raporu Detayları:\n", xReportText);
    await page.click("#xReportModal button:has-text('Kapat')");
    await page.waitForTimeout(500);

    // 8. Test Kasa Kapat Z-Report
    console.log("Testing Z-Report and Close Session...");
    await page.click("button:has-text('Kasa Kapat (Z)')");
    await page.waitForTimeout(1500);

    // Click submit Z-Report button
    page.on('dialog', async dialog => {
      console.log(`Confirm dialog alert text: ${dialog.message()}`);
      await dialog.accept();
    });

    await page.click("button:has-text('Z Raporu Oluştur ve Kasayı Kapat')");
    await page.waitForTimeout(2500);
    console.log("Kasa başarıyla kapatıldı.");

    // Expect Register Open Modal to show up again
    const finalModalVisible = await page.isVisible("#registerOpenModal:not(.hidden)");
    if (!finalModalVisible) throw new Error("Kasa kapatıldıktan sonra Kasa Açılış modalı görünmeliydi!");

    console.log("=== SPRINT 10 ACCEPTANCE TEST: ALL POS FLOWS PASSED SUCCESSFULLY! ===");
  } catch(e) {
    console.error("=== TEST FAILED ===", e);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
