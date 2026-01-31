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
    
    // Search for order in the table - look for link with exact order ID text
    const orderData = await page.evaluate((targetOrderId) => {
      // Find all links that could be order IDs
      const allLinks = document.querySelectorAll('a');
      for (const link of allLinks) {
        const text = link.textContent?.trim() || '';
        if (text === targetOrderId) {
          // Found the order link, now get the row
          const row = link.closest('tr');
          if (!row) continue;
          
          const cells = row.querySelectorAll('td');
          if (cells.length < 8) continue;
          
          // Based on debug output: cells[2] = customer, cells[7] = fortjeneste (DB)
          const customer = cells[2]?.textContent?.trim() || 'Unknown';
          const dbText = cells[7]?.textContent?.trim() || '0';
          // Parse Danish number format: "1 665,00" -> 1665.00
          const db = parseFloat(dbText.replace(/\\s/g, '').replace(/\\./g, '').replace(',', '.')) || 0;
          
          return { found: true, customer, db, orderLink: link.href };
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
  // Based on debug output, the table structure is:
  // Column 0: # (order ID link)
  // Column 1: Distributør# (another link with order ID)
  // Column 2: Kunde (customer)
  // Column 3: Ordre dato
  // Column 4: Betaling
  // Column 5: Status
  // Column 6: Ordresum
  // Column 7: Fortjeneste (DB)
  // Column 8: Fortjeneste%
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
    
    // Extract all orders - find rows with order ID links
    const orders = await page.evaluate(() => {
      const orderList = [];
      
      // Find all links that look like order IDs (5-digit numbers)
      const allLinks = document.querySelectorAll('a');
      const seenOrderIds = new Set();
      
      for (const link of allLinks) {
        const text = link.textContent?.trim() || '';
        // Check if it's a 5-digit order ID
        if (/^[0-9]{5}$/.test(text) && !seenOrderIds.has(text)) {
          seenOrderIds.add(text);
          
          // Get the row
          const row = link.closest('tr');
          if (!row) continue;
          
          const cells = row.querySelectorAll('td');
          if (cells.length < 8) continue;
          
          // Extract data based on column positions
          const orderId = text;
          const customer = cells[2]?.textContent?.trim() || '';
          const dateText = cells[3]?.textContent?.trim() || '';
          const dbText = cells[7]?.textContent?.trim() || '0';
          
          // Parse Danish number format: "1 665,00" -> 1665.00
          const db = parseFloat(dbText.replace(/\\s/g, '').replace(/\\./g, '').replace(',', '.')) || 0;
          
          // Extract just the date part (before time)
          const datePart = dateText.split(' ')[0] || dateText;
          
          orderList.push({
            orderId,
            customer,
            db,
            date: datePart
          });
        }
      }
      
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
