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


// Fetch all orders from Webmerc order list (for auto-sync)
export interface WebmercOrderListItem {
  orderId: string;
  customer: string;
  db: number;
  date: string;
}

export async function fetchRecentOrders(): Promise<WebmercOrderListItem[]> {
  const browserlessToken = process.env.BROWSERLESS_API_KEY;
  const site = process.env.WEBMERC_COMPANY || 'Sprinter';
  const username = process.env.WEBMERC_USERNAME;
  const password = process.env.WEBMERC_PASSWORD;
  
  if (!browserlessToken || !username || !password) {
    throw new Error('Missing Webmerc/Browserless credentials');
  }

  // Use Browserless /scrape API with gotoOptions and actions
  const scrapeConfig = {
    url: 'https://admin.webmercs.com/admin/',
    gotoOptions: {
      waitUntil: 'networkidle2'
    },
    elements: [
      { selector: 'body', timeout: 60000 }
    ],
    // Login and navigate via JavaScript injection
    evaluate: `
      (async () => {
        const site = '${site}';
        const username = '${username}';
        const password = '${password}';
        
        // Check if we're on login page
        const siteInput = document.querySelector('input[name="Site"]');
        if (siteInput) {
          // Fill login form
          siteInput.value = site;
          document.querySelector('input[name="Login"]').value = username;
          document.querySelector('input[name="Password"]').value = password;
          document.querySelector('input[type="image"]').click();
          
          // Wait for navigation
          await new Promise(r => setTimeout(r, 3000));
        }
        
        // Navigate to order list
        window.location.href = 'https://admin.webmercs.com/admin/listorder.asp';
        await new Promise(r => setTimeout(r, 3000));
        
        // Extract orders
        const rows = document.querySelectorAll('table tr');
        const orders = [];
        
        rows.forEach((row, index) => {
          if (index === 0) return;
          const cells = row.querySelectorAll('td');
          if (cells.length < 8) return;
          
          const orderLink = cells[1]?.querySelector('a');
          if (!orderLink) return;
          
          const orderId = orderLink.textContent?.trim() || '';
          if (!orderId || isNaN(parseInt(orderId))) return;
          
          const customer = cells[2]?.textContent?.trim() || '';
          const dbText = cells[7]?.textContent?.trim() || '0';
          const db = parseFloat(dbText.replace(/\\s/g, '').replace(',', '.')) || 0;
          const dateText = cells[0]?.textContent?.trim() || '';
          
          orders.push({ orderId, customer, db, date: dateText });
        });
        
        return JSON.stringify({ success: true, orders });
      })()
    `
  };

  // Actually, let's use the same /function API but with proper async/await wrapper
  const script = `
export default async function ({ page }) {
  const WEBMERC_BASE_URL = 'https://admin.webmercs.com';
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
    
    // Extract all orders from the first page (most recent)
    const orders = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tr');
      const orderList = [];
      
      rows.forEach((row, index) => {
        if (index === 0) return; // Skip header
        
        const cells = row.querySelectorAll('td');
        if (cells.length < 8) return;
        
        const orderLink = cells[1]?.querySelector('a');
        if (!orderLink) return;
        
        const orderId = orderLink.textContent?.trim() || '';
        if (!orderId || isNaN(parseInt(orderId))) return;
        
        const customer = cells[2]?.textContent?.trim() || '';
        const dbText = cells[7]?.textContent?.trim() || '0';
        const db = parseFloat(dbText.replace(/\\s/g, '').replace(',', '.')) || 0;
        
        // Get date from first cell
        const dateText = cells[0]?.textContent?.trim() || '';
        
        orderList.push({
          orderId,
          customer,
          db,
          date: dateText
        });
      });
      
      return orderList;
    });
    
    return { success: true, orders };
  } catch (error) {
    return { success: false, message: error.message, orders: [] };
  }
}
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
  
  if (result.success && result.orders) {
    return result.orders;
  }
  
  console.error('Failed to fetch orders:', result.message);
  return [];
}
