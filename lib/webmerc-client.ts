// Webmerc client using Browserless REST API (Puppeteer-based)

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

  // Use Browserless /function API with Puppeteer syntax
  const script = `export default async function ({ page }) {
  const WEBMERC_BASE_URL = 'https://admin.webmercs.com';
  const orderId = '${orderId}';
  const site = '${site}';
  const username = '${username}';
  const password = '${password}';
  
  try {
    // Login
    await page.goto(WEBMERC_BASE_URL + '/admin/', { waitUntil: 'networkidle0' });
    await page.type('input[name="Site"]', site);
    await page.type('input[name="Login"]', username);
    await page.type('input[name="Password"]', password);
    await page.click('input[type="image"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    
    // Go to order list
    await page.goto(WEBMERC_BASE_URL + '/admin/listorder.asp', { waitUntil: 'networkidle0' });
    
    // Search for order in the table
    const orderData = await page.evaluate((targetOrderId) => {
      const rows = document.querySelectorAll('table tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 8) continue;
        
        const orderLink = cells[1]?.querySelector('a');
        if (!orderLink) continue;
        
        const rowOrderId = orderLink.textContent?.trim() || '';
        if (rowOrderId === targetOrderId) {
          const customer = cells[2]?.textContent?.trim() || 'Unknown';
          const dbText = cells[7]?.textContent?.trim() || '0';
          const db = parseFloat(dbText.replace(/\\s/g, '').replace(',', '.')) || 0;
          return { found: true, customer, db, orderLink: orderLink.href };
        }
      }
      return { found: false };
    }, orderId);
    
    if (!orderData.found) {
      return { data: { found: false, message: 'Order not found' }, type: 'application/json' };
    }
    
    // Get salesrep from detail page
    await page.goto(orderData.orderLink, { waitUntil: 'networkidle0' });
    
    const salesrep = await page.evaluate(() => {
      const allText = document.body.innerText;
      const placedByMatch = allText.match(/Placed by:\\s*([^\\n]+)/);
      return placedByMatch ? placedByMatch[1].trim() : 'Unknown';
    });
    
    return {
      data: {
        found: true,
        order: { orderId: '${orderId}', customer: orderData.customer, db: orderData.db, salesrep }
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

  // Use Browserless /function API with Puppeteer syntax
  const script = `export default async function ({ page }) {
  const WEBMERC_BASE_URL = 'https://admin.webmercs.com';
  const site = '${site}';
  const username = '${username}';
  const password = '${password}';
  
  try {
    // Login
    await page.goto(WEBMERC_BASE_URL + '/admin/', { waitUntil: 'networkidle0' });
    await page.type('input[name="Site"]', site);
    await page.type('input[name="Login"]', username);
    await page.type('input[name="Password"]', password);
    await page.click('input[type="image"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    
    // Go to order list
    await page.goto(WEBMERC_BASE_URL + '/admin/listorder.asp', { waitUntil: 'networkidle0' });
    
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
    
    return { data: { success: true, orders, count: orders.length }, type: 'application/json' };
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
