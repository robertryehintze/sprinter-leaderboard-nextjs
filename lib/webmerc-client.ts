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


// Check if a customer has previous orders (for retention detection)
// Returns the date of the most recent previous order, or null if no previous orders
export interface RetentionCheckResult {
  isRetention: boolean;
  previousOrderDate: string | null;
  previousOrderCount: number;
  daysSinceLastOrder: number | null;
}

export async function checkCustomerRetention(customerName: string): Promise<RetentionCheckResult> {
  const browserlessToken = process.env.BROWSERLESS_API_KEY;
  const site = process.env.WEBMERC_COMPANY || 'Sprinter';
  const username = process.env.WEBMERC_USERNAME;
  const password = process.env.WEBMERC_PASSWORD;
  
  if (!browserlessToken || !username || !password) {
    throw new Error('Missing Webmerc/Browserless credentials');
  }

  // Escape special characters in customer name for use in script
  const escapedCustomerName = customerName.replace(/'/g, "\\'").replace(/"/g, '\\"');

  const script = `export default async function ({ page }) {
  const WEBMERC_BASE_URL = 'https://admin.webmercs.com';
  const customerName = '${escapedCustomerName}';
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
    
    // Go to customer list (Kundehåndtering -> Kundeliste)
    await page.goto(WEBMERC_BASE_URL + '/admin/listcustomer.asp', { waitUntil: 'networkidle0' });
    
    // Search for customer by company name (Firma field)
    await page.type('input[name="Firma"]', customerName);
    
    // Click search button (SØK)
    await page.click('input[type="image"][src*="LookUp"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    
    // Find the customer in the results and click on it
    const customerLink = await page.evaluate((searchName) => {
      // Look for links in the table that match the customer name
      const links = document.querySelectorAll('table a');
      for (const link of links) {
        const text = link.textContent?.trim() || '';
        // Check if this looks like a customer name link (not navigation)
        if (text.toLowerCase().includes(searchName.toLowerCase()) || 
            searchName.toLowerCase().includes(text.toLowerCase())) {
          return link.href;
        }
      }
      // If exact match not found, try to find any customer link in results
      const rows = document.querySelectorAll('table tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          const firmaCell = cells[2]; // Firma column
          const link = firmaCell?.querySelector('a');
          if (link && link.href.includes('editcustomer')) {
            return link.href;
          }
        }
      }
      return null;
    }, customerName);
    
    if (!customerLink) {
      return { 
        data: { 
          isRetention: false, 
          previousOrderDate: null, 
          previousOrderCount: 0,
          daysSinceLastOrder: null,
          message: 'Customer not found' 
        }, 
        type: 'application/json' 
      };
    }
    
    // Go to customer detail page
    await page.goto(customerLink, { waitUntil: 'networkidle0' });
    
    // Look for "Alle ordrer" link and click it
    const ordersLink = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        const text = link.textContent?.trim().toLowerCase() || '';
        if (text.includes('alle ordrer') || text.includes('ordrer')) {
          return link.href;
        }
      }
      return null;
    });
    
    if (!ordersLink) {
      // No orders link found - customer might have no orders
      return { 
        data: { 
          isRetention: false, 
          previousOrderDate: null, 
          previousOrderCount: 0,
          daysSinceLastOrder: null,
          message: 'No orders link found' 
        }, 
        type: 'application/json' 
      };
    }
    
    // Go to orders page
    await page.goto(ordersLink, { waitUntil: 'networkidle0' });
    
    // Extract order dates from the orders list
    const orderData = await page.evaluate(() => {
      const orders = [];
      const rows = document.querySelectorAll('table tr');
      
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        // Look for rows with order data (typically has date in one of the columns)
        for (const cell of cells) {
          const text = cell.textContent?.trim() || '';
          // Match Danish date format: DD-MM-YYYY or DD/MM/YYYY
          const dateMatch = text.match(/(\d{2}[-\/]\d{2}[-\/]\d{4})/);
          if (dateMatch) {
            orders.push(dateMatch[1]);
            break;
          }
        }
      }
      
      return orders;
    });
    
    // Calculate retention based on order history
    const orderCount = orderData.length;
    
    if (orderCount <= 1) {
      // Only one or no orders - not retention (this is their first/only order)
      return { 
        data: { 
          isRetention: false, 
          previousOrderDate: orderData[0] || null, 
          previousOrderCount: orderCount,
          daysSinceLastOrder: null
        }, 
        type: 'application/json' 
      };
    }
    
    // Multiple orders exist - this is retention!
    // The most recent order is the current one, so we look at the second most recent
    const previousOrderDate = orderData[1] || orderData[0];
    
    // Calculate days since last order
    let daysSinceLastOrder = null;
    if (previousOrderDate) {
      // Parse Danish date format (DD-MM-YYYY or DD/MM/YYYY)
      const parts = previousOrderDate.split(/[-\\/]/);
      if (parts.length === 3) {
        const orderDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        const today = new Date();
        daysSinceLastOrder = Math.floor((today.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
      }
    }
    
    // Retention = previous order within 24 months (730 days)
    const isRetention = daysSinceLastOrder !== null && daysSinceLastOrder <= 730;
    
    return { 
      data: { 
        isRetention, 
        previousOrderDate, 
        previousOrderCount: orderCount - 1, // Exclude current order
        daysSinceLastOrder
      }, 
      type: 'application/json' 
    };
    
  } catch (error) {
    return { 
      data: { 
        isRetention: false, 
        previousOrderDate: null, 
        previousOrderCount: 0,
        daysSinceLastOrder: null,
        message: error.message 
      }, 
      type: 'application/json' 
    };
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
  
  return {
    isRetention: result.data?.isRetention || false,
    previousOrderDate: result.data?.previousOrderDate || null,
    previousOrderCount: result.data?.previousOrderCount || 0,
    daysSinceLastOrder: result.data?.daysSinceLastOrder || null,
  };
}
