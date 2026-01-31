import { chromium } from 'playwright-core';

const WEBMERC_BASE_URL = 'https://admin.webmercs.com';
const BROWSERLESS_ENDPOINT = process.env.BROWSERLESS_ENDPOINT || 'wss://production-sfo.browserless.io';

export interface WebmercOrderData {
  orderId: string;
  customer: string;
  db: number;
  salesrep: string;
}

export async function lookupOrder(orderId: string): Promise<WebmercOrderData | null> {
  const browserlessToken = process.env.BROWSERLESS_API_KEY;
  const site = process.env.WEBMERC_COMPANY || 'Sprinter';
  const username = process.env.WEBMERC_USERNAME;
  const password = process.env.WEBMERC_PASSWORD;
  
  if (!browserlessToken || !username || !password) {
    throw new Error('Missing Webmerc/Browserless credentials');
  }
  
  const browser = await chromium.connectOverCDP(
    `${BROWSERLESS_ENDPOINT}?token=${browserlessToken}`
  );

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${WEBMERC_BASE_URL}/admin/`);
    await page.fill('input[name="Site"]', site);
    await page.fill('input[name="Login"]', username);
    await page.fill('input[name="Password"]', password);
    await page.click('input[type="image"]');
    await page.waitForLoadState('networkidle');

    await page.goto(`${WEBMERC_BASE_URL}/admin/listorder.asp`);
    await page.waitForLoadState('networkidle');

    let orderRow = page.locator(`xpath=//table//tr[td/a[text()="${orderId}"]]`);
    let isVisible = await orderRow.isVisible().catch(() => false);
    
    if (!isVisible) {
      const paginationLinks = page.locator('a').filter({ hasText: /^\d+-\d+$/ });
      const linkCount = await paginationLinks.count();
      
      for (let i = 0; i < linkCount && !isVisible; i++) {
        const link = paginationLinks.nth(i);
        await link.click();
        await page.waitForLoadState('networkidle');
        orderRow = page.locator(`xpath=//table//tr[td/a[text()="${orderId}"]]`);
        isVisible = await orderRow.isVisible().catch(() => false);
      }
    }
    
    if (!isVisible) return null;

    const cells = await orderRow.locator('td').allTextContents();
    const customer = cells[2]?.trim() || 'Unknown';
    const dbText = cells[7]?.trim() || '0';
    const db = parseFloat(dbText.replace(/\s/g, '').replace(',', '.')) || 0;

    const orderLink = orderRow.locator('a').first();
    await orderLink.click();
    await page.waitForLoadState('networkidle');

    const salesrep = await page.evaluate(() => {
      const allText = document.body.innerText;
      const placedByMatch = allText.match(/Placed by:\s*([^\n]+)/);
      return placedByMatch ? placedByMatch[1].trim() : 'Unknown';
    });

    return { orderId, customer, db, salesrep };
  } finally {
    await browser.close();
  }
}
