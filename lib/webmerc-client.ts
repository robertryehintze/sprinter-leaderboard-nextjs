// Webmerc client using Browserless REST API (no playwright dependency)

const BROWSERLESS_API = 'https://production-sfo.browserless.io';

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

  // Use Browserless /function API to run browser automation
  const script = `
    module.exports = async ({ page }) => {
      const WEBMERC_BASE_URL = 'https://admin.webmercs.com';
      const orderId = '${orderId}';
      const site = '${site}';
      const username = '${username}';
      const password = '${password}';
      
      try {
        // Login
        await page.goto(WEBMERC_BASE_URL + '/admin/');
        await page.fill('input[name="Site"]', site);
        await page.fill('input[name="Login"]', username);
        await page.fill('input[name="Password"]', password);
        await page.click('input[type="image"]');
        await page.waitForLoadState('networkidle');
        
        // Go to order list
        await page.goto(WEBMERC_BASE_URL + '/admin/listorder.asp');
        await page.waitForLoadState('networkidle');
        
        // Search for order
        let orderRow = page.locator('xpath=//table//tr[td/a[text()="' + orderId + '"]]');
        let isVisible = await orderRow.isVisible().catch(() => false);
        
        // Check pagination if not found
        if (!isVisible) {
          const paginationLinks = page.locator('a').filter({ hasText: /^\\d+-\\d+$/ });
          const linkCount = await paginationLinks.count();
          
          for (let i = 0; i < linkCount && !isVisible; i++) {
            const link = paginationLinks.nth(i);
            await link.click();
            await page.waitForLoadState('networkidle');
            orderRow = page.locator('xpath=//table//tr[td/a[text()="' + orderId + '"]]');
            isVisible = await orderRow.isVisible().catch(() => false);
          }
        }
        
        if (!isVisible) {
          return { found: false, message: 'Order not found' };
        }
        
        // Extract data from row
        const cells = await orderRow.locator('td').allTextContents();
        const customer = cells[2]?.trim() || 'Unknown';
        const dbText = cells[7]?.trim() || '0';
        const db = parseFloat(dbText.replace(/\\s/g, '').replace(',', '.')) || 0;
        
        // Get salesrep from detail page
        const orderLink = orderRow.locator('a').first();
        await orderLink.click();
        await page.waitForLoadState('networkidle');
        
        const salesrep = await page.evaluate(() => {
          const allText = document.body.innerText;
          const placedByMatch = allText.match(/Placed by:\\s*([^\\n]+)/);
          return placedByMatch ? placedByMatch[1].trim() : 'Unknown';
        });
        
        return {
          found: true,
          order: { orderId: '${orderId}', customer, db, salesrep }
        };
      } catch (error) {
        return { found: false, message: error.message };
      }
    };
  `;

  const response = await fetch(`${BROWSERLESS_API}/function?token=${browserlessToken}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code: script,
      context: {},
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Browserless API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  if (result.found && result.order) {
    return result.order;
  }
  
  return null;
}
