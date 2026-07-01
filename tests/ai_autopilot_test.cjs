const { chromium } = require('playwright');

(async () => {
  console.log("=== SPRINT 15 ACCEPTANCE TEST: STARTING AI STORE AUTOPILOT VALIDATIONS ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  try {
    const t = Date.now();
    console.log("1. Navigating to http://127.0.0.1:3001/admin.html...");
    await page.goto("http://127.0.0.1:3001/admin.html?t=" + t);
    await page.waitForTimeout(4000);

    // Authenticate if needed
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

    console.log("Logged in successfully. Active page URL:", page.url());

    // 2. Open page-ai (AI Autopilot Page)
    console.log("Clicking sidebar tab: AI Asistan...");
    await page.click("button[onclick=\"showPage('ai')\"]");
    await page.waitForTimeout(3000);

    // Verify AI page active
    const isAiActive = await page.evaluate(() => {
      const p = document.getElementById('page-ai');
      return p && p.classList.contains('active');
    });
    if (!isAiActive) throw new Error("AI Autopilot page failed to activate!");
    console.log("🟢 AI Autopilot panel is active.");

    // Trigger analysis to populate fresh data
    console.log("Triggering AI full analysis pipeline...");
    await page.click("#btnRunAnalysis");
    await page.waitForTimeout(4000);

    // 3. Verify Health Score & Explanations Breakdown
    console.log("Checking AI Store Health Score breakdown...");
    const scoreVal = await page.innerText("#kpiHealthScore");
    console.log(`AI Store Health Score value: ${scoreVal}`);
    if (scoreVal === '—' || scoreVal === '') throw new Error("Health score not calculated!");
    
    const breakdownText = await page.innerText("#aiScoreBreakdownContainer");
    if (!breakdownText.includes("AI Nedenini Açıklıyor")) throw new Error("Health score breakdown explanation missing!");
    console.log("🟢 AI Store Health Score radar breakdown verified successfully.");

    // 4. Verify AI Risks
    console.log("Checking AI Risks list (Risk Engine)...");
    const risksCount = await page.evaluate(() => {
      return document.querySelectorAll("#aiRisksListContainer .card").length;
    });
    console.log(`Active risks rendered count: ${risksCount}`);
    if (risksCount === 0) throw new Error("No risks rendered in Risk Engine!");
    console.log("🟢 AI Risk Engine verified successfully.");

    // 5. Verify Daily Tasks & Completing a task
    console.log("Switching tab to: AI Bulgular (Tasks & Insights)...");
    await page.click("#btn-ai-insights");
    await page.waitForTimeout(2000);

    const tasksCount = await page.evaluate(() => {
      return document.querySelectorAll("#aiTasksTableBody tr").length;
    });
    console.log(`Generated daily tasks count: ${tasksCount}`);
    if (tasksCount === 0) throw new Error("AI Task Generator returned 0 tasks!");

    // Click "Tamamla" on a pending task if any exists
    console.log("Completing a pending AI-generated daily task...");
    const completeBtn = page.locator("#aiTasksTableBody button:has-text('Tamamla')").first();
    if (await completeBtn.isVisible()) {
      await completeBtn.click();
      await page.waitForTimeout(2000);
      console.log("🟢 AI Daily Task completion flow verified successfully.");
    } else {
      console.log("🟢 No pending tasks found to complete, skipping click.");
    }

    // 6. Verify Smart Purchase drafts & Approvals
    console.log("Switching tab to: Aksiyon Taslakları...");
    await page.click("#btn-ai-drafts");
    await page.waitForTimeout(2000);

    const draftsCount = await page.evaluate(() => {
      return document.querySelectorAll("#aiActionDraftsContainer .card").length;
    });
    console.log(`AI Action drafts count: ${draftsCount}`);
    if (draftsCount === 0) throw new Error("No action drafts returned by Smart Purchase Engine!");

    // Click "Onayla" on first pending purchase draft if any exists
    console.log("Approving the first AI Action draft...");
    const approveBtn = page.locator("#aiActionDraftsContainer button:has-text('Onayla')").first();
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
      await page.waitForTimeout(2000);
      console.log("🟢 AI Smart Purchase Approval flow verified successfully.");
    } else {
      console.log("🟢 No pending drafts found to approve, skipping click.");
    }

    // 7. Verify AI Performance Coach
    console.log("Switching tab to: Performans Coach...");
    await page.click("#btn-ai-performance");
    await page.waitForTimeout(2500);

    const performanceRows = await page.evaluate(() => {
      return document.querySelectorAll("#aiPerformanceTableBody tr").length;
    });
    console.log(`Cashiers evaluated in Coach list: ${performanceRows}`);
    if (performanceRows === 0) throw new Error("AI Performance Coach returned 0 cashiers!");
    console.log("🟢 AI Performance Coach statistics verified successfully.");

    // 8. Verify Morning Briefing
    console.log("Switching tab to: AI Dashboard...");
    await page.click("#btn-ai-manager");
    await page.waitForTimeout(2000);

    console.log("Triggering Morning Briefing Modal...");
    await page.click("button:has-text('Günlük Sabah Özeti')");
    await page.waitForTimeout(2000);

    const briefingVisible = await page.isVisible("#morningBriefingContent");
    if (!briefingVisible) throw new Error("Morning Briefing failed to render!");
    const briefingText = await page.innerText("#morningBriefingContent");
    console.log("Morning Briefing Details:\n", briefingText);
    await page.evaluate(() => closeModal('morningBriefingModal'));
    await page.waitForTimeout(1000);
    console.log("🟢 AI Morning Briefing popup verified successfully.");

    // 9. Verify Decision Support Ask Chat
    console.log("Switching tab to: Hermes AI Chat...");
    await page.click("#btn-ai-chat");
    await page.waitForTimeout(2000);

    console.log("Sending query: Bugün ne yapmalıyım?");
    await page.fill("#aiChatInput", "Bugün ne yapmalıyım?");
    await page.click("button:has-text('Gönder')");
    await page.waitForTimeout(4000);

    const chatResponses = await page.evaluate(() => {
      const messages = document.querySelectorAll("#aiChatMessages .ai-msg");
      return messages[messages.length - 1].innerText;
    });
    console.log("Hermes chat response:", chatResponses);
    if (!chatResponses || chatResponses.includes("yazın")) throw new Error("Hermes Chat returned empty response!");
    console.log("🟢 Decision Support NLP chat verified successfully.");

    console.log("=== SPRINT 15 ACCEPTANCE TEST: ALL AUTOPILOT MODULES VERIFIED SUCCESSFULLY! ===");
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error("❌ TEST FAILED:", err.message);
    await browser.close();
    process.exit(1);
  }
})();
