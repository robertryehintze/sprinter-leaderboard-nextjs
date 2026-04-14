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
    await page.goto(WEBMERC_BASE_URL + '/admin/', { waitUntil: 'networkidle0', timeout: 30000 });
    await page.type('input[name="Site"]', site);
    await page.type('input[name="Login"]', username);
    await page.type('input[name="Password"]', password);
    await page.click('input[type="image"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
    
    // Verify login succeeded - check if we're still on login page
    const currentUrl = page.url();
    const pageTitle = await page.title();
    const hasLoginForm = await page.evaluate(() => {
      return !!document.querySelector('input[name="Password"]');
    });
    
    if (hasLoginForm || pageTitle.toLowerCase().includes('login')) {
      return { data: { found: false, message: 'Login failed - still on login page. URL: ' + currentUrl + ', Title: ' + pageTitle }, type: 'application/json' };
    }
    
    // Go to order list
    await page.goto(WEBMERC_BASE_URL + '/admin/listorder.asp', { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Enable ALL order status checkboxes
    const checkboxesChanged = await page.evaluate(() => {
      const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
      let changed = false;
      for (const checkbox of allCheckboxes) {
        const parent = checkbox.parentElement;
        const nearbyText = parent?.textContent?.toLowerCase() || '';
        const nextSibling = checkbox.nextSibling?.textContent?.toLowerCase() || '';
        const labelText = nearbyText + ' ' + nextSibling;
        const isStatusCheckbox = 
          labelText.includes('under behandling') ||
          labelText.includes('faktura') ||
          labelText.includes('betalt') ||
          labelText.includes('bestilt') ||
          labelText.includes('sendt');
        if (isStatusCheckbox && !checkbox.checked) {
          checkbox.click();
          changed = true;
        }
      }
      return changed;
    });
    
    if (checkboxesChanged) {
      const submitted = await page.evaluate(() => {
        const buttons = document.querySelectorAll('input[type="image"], input[type="submit"], button');
        for (const btn of buttons) {
          const src = btn.getAttribute('src') || '';
          const value = btn.getAttribute('value') || '';
          if (src.includes('LookUp') || src.includes('search') || value.toLowerCase().includes('søg') || value.toLowerCase().includes('search')) {
            btn.click();
            return true;
          }
        }
        const form = document.querySelector('form');
        if (form) { form.submit(); return true; }
        return false;
      });
      if (submitted) {
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
      }
    }
    
    // Search for order in the table
    const orderData = await page.evaluate((targetOrderId) => {
      const allLinks = document.querySelectorAll('a');
      for (const link of allLinks) {
        const text = link.textContent?.trim() || '';
        if (text === targetOrderId) {
          const row = link.closest('tr');
          if (!row) continue;
          const cells = row.querySelectorAll('td');
          if (cells.length < 8) continue;
          const customer = cells[2]?.textContent?.trim() || 'Unknown';
          const dbText = cells[7]?.textContent?.trim() || '0';
          const db = parseFloat(dbText.replace(/\\s/g, '').replace(/\\./g, '').replace(',', '.')) || 0;
          return { found: true, customer, db, orderLink: link.href };
        }
      }
      return { found: false };
    }, orderId);
    
    if (!orderData.found) {
      return { data: { found: false, message: 'Order not found in list' }, type: 'application/json' };
    }
    
    // Get salesrep from detail page
    await page.goto(orderData.orderLink, { waitUntil: 'networkidle0', timeout: 30000 });
    
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
    return { data: { found: false, message: 'lookupOrder error: ' + error.message }, type: 'application/json' };
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
  // Table structure:
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
  const debugLogs = [];
  
  try {
    // Login
    debugLogs.push('Navigating to login page...');
    await page.goto(WEBMERC_BASE_URL + '/admin/', { waitUntil: 'networkidle0', timeout: 30000 });
    
    debugLogs.push('Typing credentials: site=' + site + ', username=' + username);
    await page.type('input[name="Site"]', site);
    await page.type('input[name="Login"]', username);
    await page.type('input[name="Password"]', password);
    
    debugLogs.push('Clicking login button...');
    await page.click('input[type="image"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
    
    // CRITICAL: Verify login succeeded
    const currentUrl = page.url();
    const pageTitle = await page.title();
    const hasLoginForm = await page.evaluate(() => {
      return !!document.querySelector('input[name="Password"]');
    });
    const bodyText = await page.evaluate(() => {
      return document.body.innerText.substring(0, 500);
    });
    
    debugLogs.push('After login - URL: ' + currentUrl + ', Title: ' + pageTitle + ', hasLoginForm: ' + hasLoginForm);
    
    if (hasLoginForm || pageTitle.toLowerCase().includes('login')) {
      return { 
        data: { 
          success: false, 
          message: 'LOGIN FAILED - still on login page. URL: ' + currentUrl + ', Title: ' + pageTitle + ', Body: ' + bodyText.substring(0, 200),
          orders: [],
          debug: debugLogs
        }, 
        type: 'application/json' 
      };
    }
    
    // Go to order list
    debugLogs.push('Navigating to order list...');
    await page.goto(WEBMERC_BASE_URL + '/admin/listorder.asp', { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Verify we're on the order list page (not redirected to login)
    const orderPageTitle = await page.title();
    const orderPageHasLogin = await page.evaluate(() => {
      return !!document.querySelector('input[name="Password"]');
    });
    
    debugLogs.push('Order list page - Title: ' + orderPageTitle + ', hasLoginForm: ' + orderPageHasLogin);
    
    if (orderPageHasLogin) {
      return { 
        data: { 
          success: false, 
          message: 'Session lost - redirected to login on order list page',
          orders: [],
          debug: debugLogs
        }, 
        type: 'application/json' 
      };
    }
    
    // Enable ALL order status checkboxes
    const checkboxInfo = await page.evaluate(() => {
      const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
      const info = [];
      let changed = false;
      
      for (const checkbox of allCheckboxes) {
        const parent = checkbox.parentElement;
        const nearbyText = parent?.textContent?.toLowerCase() || '';
        const nextSibling = checkbox.nextSibling?.textContent?.toLowerCase() || '';
        const labelText = nearbyText + ' ' + nextSibling;
        const isStatusCheckbox = 
          labelText.includes('under behandling') ||
          labelText.includes('faktura') ||
          labelText.includes('betalt') ||
          labelText.includes('bestilt') ||
          labelText.includes('sendt');
        
        info.push({ label: labelText.trim().substring(0, 50), checked: checkbox.checked, isStatus: isStatusCheckbox });
        
        if (isStatusCheckbox && !checkbox.checked) {
          checkbox.click();
          changed = true;
        }
      }
      
      return { changed, checkboxes: info };
    });
    
    debugLogs.push('Checkboxes: ' + JSON.stringify(checkboxInfo));
    
    // If checkboxes were changed, submit the form to refresh the list
    if (checkboxInfo.changed) {
      debugLogs.push('Submitting form after checkbox change...');
      const submitted = await page.evaluate(() => {
        const buttons = document.querySelectorAll('input[type="image"], input[type="submit"], button');
        for (const btn of buttons) {
          const src = btn.getAttribute('src') || '';
          const value = btn.getAttribute('value') || '';
          if (src.includes('LookUp') || src.includes('search') || value.toLowerCase().includes('søg') || value.toLowerCase().includes('search')) {
            btn.click();
            return 'clicked: ' + (src || value);
          }
        }
        const form = document.querySelector('form');
        if (form) {
          form.submit();
          return 'form.submit()';
        }
        return 'nothing found to submit';
      });
      
      debugLogs.push('Submit result: ' + submitted);
      
      if (submitted !== 'nothing found to submit') {
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch((e) => {
          debugLogs.push('Navigation wait failed: ' + e.message);
        });
      }
    }
    
    // Extract all orders from all pages
    let allOrders = [];
    let pageNum = 1;
    
    while (true) {
      debugLogs.push('Extracting orders from page ' + pageNum + '...');
      
      const pageOrders = await page.evaluate(() => {
        const orderList = [];
        const allLinks = document.querySelectorAll('a');
        const seenOrderIds = new Set();
        
        for (const link of allLinks) {
          const text = link.textContent?.trim() || '';
          if (/^[0-9]{4,6}$/.test(text) && !seenOrderIds.has(text)) {
            seenOrderIds.add(text);
            const row = link.closest('tr');
            if (!row) continue;
            const cells = row.querySelectorAll('td');
            if (cells.length < 8) continue;
            
            const orderId = text;
            const customer = cells[2]?.textContent?.trim() || '';
            const dateText = cells[3]?.textContent?.trim() || '';
            const dbText = cells[7]?.textContent?.trim() || '0';
            const db = parseFloat(dbText.replace(/\\s/g, '').replace(/\\./g, '').replace(',', '.')) || 0;
            const datePart = dateText.split(' ')[0] || dateText;
            
            orderList.push({ orderId, customer, db, date: datePart });
          }
        }
        
        return orderList;
      });
      
      debugLogs.push('Found ' + pageOrders.length + ' orders on page ' + pageNum);
      allOrders = allOrders.concat(pageOrders);
      
      // Check for next page link
      const hasNextPage = await page.evaluate(() => {
        const links = document.querySelectorAll('a');
        for (const link of links) {
          const text = link.textContent?.trim().toLowerCase() || '';
          const href = link.href || '';
          if ((text.includes('næste') || text.includes('next') || text === '>>' || text === '>') && href.includes('listorder')) {
            link.click();
            return true;
          }
        }
        return false;
      });
      
      if (!hasNextPage || pageNum >= 20) {
        debugLogs.push('No more pages (hasNextPage=' + hasNextPage + ', pageNum=' + pageNum + ')');
        break;
      }
      
      pageNum++;
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    }
    
    debugLogs.push('Total orders found: ' + allOrders.length);
    
    return { data: { success: true, orders: allOrders, count: allOrders.length, debug: debugLogs }, type: 'application/json' };
  } catch (error) {
    debugLogs.push('FATAL ERROR: ' + error.message);
    return { data: { success: false, message: error.message, orders: [], debug: debugLogs }, type: 'application/json' };
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
  
  // Log the debug info and error message for troubleshooting
  console.error('Failed to fetch orders:', result.data?.message);
  if (result.data?.debug) {
    console.error('Debug logs:', result.data.debug);
  }
  
  // Throw error instead of silently returning empty - so the sync route can report it
  throw new Error(`Webmerc fetch failed: ${result.data?.message || 'Unknown error'}. Debug: ${JSON.stringify(result.data?.debug || [])}`);
}


// Check if a customer has previous orders (for retention detection)
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

  const escapedCustomerName = customerName.replace(/'/g, "\\'").replace(/"/g, '\\"');

  const script = `export default async function ({ page }) {
  const WEBMERC_BASE_URL = 'https://admin.webmercs.com';
  const customerName = '${escapedCustomerName}';
  const site = '${site}';
  const username = '${username}';
  const password = '${password}';
  
  try {
    // Login
    await page.goto(WEBMERC_BASE_URL + '/admin/', { waitUntil: 'networkidle0', timeout: 30000 });
    await page.type('input[name="Site"]', site);
    await page.type('input[name="Login"]', username);
    await page.type('input[name="Password"]', password);
    await page.click('input[type="image"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
    
    // Verify login
    const hasLoginForm = await page.evaluate(() => !!document.querySelector('input[name="Password"]'));
    if (hasLoginForm) {
      return { data: { isRetention: false, previousOrderDate: null, previousOrderCount: 0, daysSinceLastOrder: null, message: 'Login failed' }, type: 'application/json' };
    }
    
    await page.goto(WEBMERC_BASE_URL + '/admin/listcustomer.asp', { waitUntil: 'networkidle0', timeout: 30000 });
    await page.type('input[name="Firma"]', customerName);
    await page.click('input[type="image"][src*="LookUp"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
    
    const customerLink = await page.evaluate((searchName) => {
      const links = document.querySelectorAll('table a');
      for (const link of links) {
        const text = link.textContent?.trim() || '';
        if (text.toLowerCase().includes(searchName.toLowerCase()) || 
            searchName.toLowerCase().includes(text.toLowerCase())) {
          return link.href;
        }
      }
      const rows = document.querySelectorAll('table tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          const firmaCell = cells[2];
          const link = firmaCell?.querySelector('a');
          if (link && link.href.includes('editcustomer')) {
            return link.href;
          }
        }
      }
      return null;
    }, customerName);
    
    if (!customerLink) {
      return { data: { isRetention: false, previousOrderDate: null, previousOrderCount: 0, daysSinceLastOrder: null, message: 'Customer not found' }, type: 'application/json' };
    }
    
    await page.goto(customerLink, { waitUntil: 'networkidle0', timeout: 30000 });
    
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
      return { data: { isRetention: false, previousOrderDate: null, previousOrderCount: 0, daysSinceLastOrder: null, message: 'No orders link found' }, type: 'application/json' };
    }
    
    await page.goto(ordersLink, { waitUntil: 'networkidle0', timeout: 30000 });
    
    const orderData = await page.evaluate(() => {
      const orders = [];
      const rows = document.querySelectorAll('table tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        for (const cell of cells) {
          const text = cell.textContent?.trim() || '';
          const dateMatch = text.match(/(\\d{2}[-\\/]\\d{2}[-\\/]\\d{4})/);
          if (dateMatch) {
            orders.push(dateMatch[1]);
            break;
          }
        }
      }
      return orders;
    });
    
    const orderCount = orderData.length;
    
    if (orderCount <= 1) {
      return { data: { isRetention: false, previousOrderDate: orderData[0] || null, previousOrderCount: orderCount, daysSinceLastOrder: null }, type: 'application/json' };
    }
    
    const previousOrderDate = orderData[1] || orderData[0];
    let daysSinceLastOrder = null;
    if (previousOrderDate) {
      const parts = previousOrderDate.split(/[-\\/]/);
      if (parts.length === 3) {
        const orderDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        const today = new Date();
        daysSinceLastOrder = Math.floor((today.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
      }
    }
    
    const isRetention = daysSinceLastOrder !== null && daysSinceLastOrder <= 730;
    
    return { data: { isRetention, previousOrderDate, previousOrderCount: orderCount - 1, daysSinceLastOrder }, type: 'application/json' };
    
  } catch (error) {
    return { data: { isRetention: false, previousOrderDate: null, previousOrderCount: 0, daysSinceLastOrder: null, message: error.message }, type: 'application/json' };
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
