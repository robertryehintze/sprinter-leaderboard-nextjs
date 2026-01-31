import { NextRequest, NextResponse } from 'next/server';

const BROWSERLESS_API = 'https://production-sfo.browserless.io';

// Debug endpoint to test Webmerc scraping with detailed output
export async function GET(request: NextRequest) {
  const browserlessToken = process.env.BROWSERLESS_API_KEY;
  const site = process.env.WEBMERC_COMPANY || 'Sprinter';
  const username = process.env.WEBMERC_USERNAME;
  const password = process.env.WEBMERC_PASSWORD;
  
  if (!browserlessToken || !username || !password) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 });
  }

  // Debug script with screenshot and detailed logging
  const script = `export default async function ({ page }) {
  const WEBMERC_BASE_URL = 'https://admin.webmercs.com';
  const site = '${site}';
  const username = '${username}';
  const password = '${password}';
  const debug = [];
  
  try {
    debug.push('Step 1: Navigating to login page...');
    await page.goto(WEBMERC_BASE_URL + '/admin/', { waitUntil: 'networkidle0', timeout: 30000 });
    debug.push('Step 1: Done. URL: ' + page.url());
    
    // Check if login form exists
    const siteInput = await page.$('input[name="Site"]');
    const loginInput = await page.$('input[name="Login"]');
    const passwordInput = await page.$('input[name="Password"]');
    debug.push('Step 2: Form elements found - Site: ' + !!siteInput + ', Login: ' + !!loginInput + ', Password: ' + !!passwordInput);
    
    if (!siteInput || !loginInput || !passwordInput) {
      const pageContent = await page.content();
      return { 
        data: { 
          success: false, 
          error: 'Login form not found',
          debug,
          pagePreview: pageContent.substring(0, 2000)
        }, 
        type: 'application/json' 
      };
    }
    
    debug.push('Step 3: Filling login form...');
    await page.type('input[name="Site"]', site);
    await page.type('input[name="Login"]', username);
    await page.type('input[name="Password"]', password);
    debug.push('Step 3: Done');
    
    debug.push('Step 4: Clicking submit...');
    await page.click('input[type="image"]');
    debug.push('Step 4: Clicked, waiting for navigation...');
    
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
    debug.push('Step 4: Navigation complete. URL: ' + page.url());
    
    debug.push('Step 5: Navigating to order list...');
    await page.goto(WEBMERC_BASE_URL + '/admin/listorder.asp', { waitUntil: 'networkidle0', timeout: 30000 });
    debug.push('Step 5: Done. URL: ' + page.url());
    
    // Check page content
    const pageTitle = await page.title();
    debug.push('Step 6: Page title: ' + pageTitle);
    
    // Count tables and rows
    const tableCount = await page.evaluate(() => document.querySelectorAll('table').length);
    const rowCount = await page.evaluate(() => document.querySelectorAll('table tr').length);
    debug.push('Step 6: Tables found: ' + tableCount + ', Rows found: ' + rowCount);
    
    // Extract orders
    const orders = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tr');
      const orderList = [];
      
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
        
        orderList.push({ orderId, customer, db, date: dateText });
      });
      
      return orderList;
    });
    
    debug.push('Step 7: Orders extracted: ' + orders.length);
    
    // Take screenshot for debugging
    const screenshot = await page.screenshot({ encoding: 'base64' });
    
    return { 
      data: { 
        success: true, 
        orders,
        orderCount: orders.length,
        debug,
        screenshot: 'data:image/png;base64,' + screenshot.substring(0, 100) + '...(truncated)'
      }, 
      type: 'application/json' 
    };
  } catch (error) {
    debug.push('ERROR: ' + error.message);
    return { 
      data: { 
        success: false, 
        error: error.message,
        debug
      }, 
      type: 'application/json' 
    };
  }
}`;

  try {
    const response = await fetch(`${BROWSERLESS_API}/function?token=${browserlessToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/javascript',
      },
      body: script,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ 
        error: `Browserless API error: ${response.status}`,
        details: errorText 
      }, { status: 500 });
    }

    const result = await response.json();
    return NextResponse.json(result);
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
