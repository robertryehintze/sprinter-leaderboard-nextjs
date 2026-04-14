import { NextRequest, NextResponse } from 'next/server';

const BROWSERLESS_API = 'https://production-sfo.browserless.io';

// This endpoint generates the EXACT same script as fetchRecentOrders
// and returns it as text so we can inspect what Browserless receives
export async function GET(request: NextRequest) {
  const browserlessToken = process.env.BROWSERLESS_API_KEY;
  const site = process.env.WEBMERC_COMPANY || 'Sprinter';
  const username = process.env.WEBMERC_USERNAME;
  const password = process.env.WEBMERC_PASSWORD;
  
  if (!browserlessToken || !username || !password) {
    return NextResponse.json({ error: 'Missing credentials', hasToken: !!browserlessToken, hasUser: !!username, hasPass: !!password }, { status: 500 });
  }

  // Build the EXACT same script as webmerc-client.ts fetchRecentOrders
  const loginPart = `
    debugLogs.push('Navigating to login page...');
    await page.goto(WEBMERC_BASE_URL + '/admin/', { waitUntil: 'networkidle0', timeout: 30000 });
    
    debugLogs.push('Typing credentials...');
    await page.type('input[name="Site"]', '${site}');
    await page.type('input[name="Login"]', '${username}');
    await page.type('input[name="Password"]', '${password}');
    
    debugLogs.push('Clicking login button...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(e => {
        debugLogs.push('Nav wait error (non-fatal): ' + e.message);
      }),
      page.click('input[type="image"]')
    ]);
    
    await new Promise(r => setTimeout(r, 2000));
    
    const currentUrl = page.url();
    const pageTitle = await page.title();
    const hasLoginForm = await page.evaluate(() => {
      return !!document.querySelector('input[name="Password"]');
    });
    
    debugLogs.push('After login - URL: ' + currentUrl + ', Title: ' + pageTitle + ', hasLoginForm: ' + hasLoginForm);
    
    if (hasLoginForm || pageTitle.toLowerCase().includes('login')) {
      const errorText = await page.evaluate(() => {
        return document.body.innerText.substring(0, 300);
      });
      return { 
        data: { success: false, found: false, message: 'LOGIN FAILED. Body: ' + errorText, debug: debugLogs }, 
        type: 'application/json' 
      };
    }
  `;

  const checkboxPart = `
    const checkboxResult = await page.evaluate(() => {
      const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
      let changed = 0;
      for (const cb of allCheckboxes) {
        if (!cb.checked) {
          cb.click();
          changed++;
        }
      }
      return changed;
    });
    
    debugLogs.push('Checked ' + checkboxResult + ' checkboxes');
    
    if (checkboxResult > 0) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}),
        page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) form.submit();
        })
      ]);
      await new Promise(r => setTimeout(r, 1000));
    }
  `;

  const script = `export default async function ({ page }) {
  const WEBMERC_BASE_URL = 'https://admin.webmercs.com';
  const debugLogs = [];
  
  try {
    ${loginPart}
    
    // Navigate to order list
    debugLogs.push('Navigating to order list...');
    await page.goto(WEBMERC_BASE_URL + '/admin/listorder.asp', { waitUntil: 'networkidle0', timeout: 30000 });
    
    ${checkboxPart}
    
    // Extract orders
    const orders = await page.evaluate(() => {
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
    
    debugLogs.push('Found ' + orders.length + ' orders');
    
    return { data: { success: true, orders, count: orders.length, debug: debugLogs }, type: 'application/json' };
  } catch (error) {
    debugLogs.push('FATAL ERROR: ' + error.message);
    return { data: { success: false, message: error.message, orders: [], debug: debugLogs }, type: 'application/json' };
  }
}`;

  const mode = request.nextUrl.searchParams.get('mode');
  
  if (mode === 'show') {
    // Just show the script, don't execute
    return new Response(script, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
  
  // Execute the script
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
        error: `Browserless error: ${response.status}`,
        details: errorText,
        scriptLength: script.length,
        scriptFirst500: script.substring(0, 500)
      }, { status: 500 });
    }

    const result = await response.json();
    return NextResponse.json(result);
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
