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

  // Use Browserless /function API with application/javascript content type
  const script = `export default async function ({ page }) {
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
    
    // Search for order using XPath
    let orderRow = page.locator('xpath=//table//tr[td/a[text()="' + orderId + '"]]');
    let isVisible = await orderRow.isVisible().catch(() => false);
    
    // Check pagination if not found
    if (!isVisible) {
      const paginationLinks = page.locator('a').filter({ hasText: /^[0-9]+-[0-9]+$/ });
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
      return { data: { found: false, message: 'Order not found' }, type: 'application/json' };
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
      data: {
        found: true,
        order: { orderId: '${orderId}', customer, db, salesrep }
      },
      type: 'application/json'
    };
  } catch (error) {
    return { data: { found: false, message: error.message }, type: 'application/json' };
  }
}`;

  const response = await fetch(`${BROWSERLESS_API}/function?token=${browserlessToken}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/javascript',
    },
    body: script,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Browserless API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  if (result.data?.found && result.data?.order) {
    return result.data.order;
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

  // Use Browserless /function API with application/javascript content type
  const script = `export default async function ({ page }) {
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
    
    return { data: { success: true, orders }, type: 'application/json' };
  } catch (error) {
    return { data: { success: false, message: error.message, orders: [] }, type: 'application/json' };
  }
}`;

  const response = await fetch(`${BROWSERLESS_API}/function?token=${browserlessToken}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/javascript',
    },
    body: script,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Browserless API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  if (result.data?.success && result.data?.orders) {
    return result.data.orders;
  }
  
  console.error('Failed to fetch orders:', result.data?.message);
  return [];
}
