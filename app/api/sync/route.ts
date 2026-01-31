import { NextRequest, NextResponse } from 'next/server';
import { fetchRecentOrders, lookupOrder } from '@/lib/webmerc-client';
import { getExistingOrderIds, appendSyncedOrder } from '@/lib/google-sheets';

// Vercel Cron job endpoint - runs every 30 minutes
// Configure in vercel.json: { "crons": [{ "path": "/api/sync", "schedule": "*/30 * * * *" }] }

export const maxDuration = 300; // 5 minutes max for Pro plan

export async function GET(request: NextRequest) {
  // Verify cron secret for security (optional but recommended)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  // Allow requests from Vercel Cron (they include authorization header) or manual triggers
  const isVercelCron = authHeader === `Bearer ${cronSecret}`;
  const isManualTrigger = request.nextUrl.searchParams.get('manual') === 'true';
  
  // For now, allow all requests (can add security later)
  // if (cronSecret && !isVercelCron && !isManualTrigger) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }

  const startTime = Date.now();
  const logs: string[] = [];
  
  try {
    logs.push(`[${new Date().toISOString()}] Starting Webmerc auto-sync...`);
    
    // Step 1: Get existing order IDs from Google Sheets
    logs.push('Fetching existing order IDs from Google Sheets...');
    const existingOrderIds = await getExistingOrderIds();
    logs.push(`Found ${existingOrderIds.size} existing orders in sheet`);
    
    // Step 2: Fetch recent orders from Webmerc
    logs.push('Fetching recent orders from Webmerc...');
    const recentOrders = await fetchRecentOrders();
    logs.push(`Found ${recentOrders.length} orders in Webmerc order list`);
    
    // Step 3: Find new orders (not in sheet)
    const newOrders = recentOrders.filter(order => !existingOrderIds.has(order.orderId));
    logs.push(`Found ${newOrders.length} new orders to sync`);
    
    if (newOrders.length === 0) {
      logs.push('No new orders to sync. Done!');
      return NextResponse.json({
        success: true,
        message: 'No new orders to sync',
        stats: {
          existingOrders: existingOrderIds.size,
          webmercOrders: recentOrders.length,
          newOrders: 0,
          syncedOrders: 0,
          duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`
        },
        logs
      });
    }
    
    // Step 4: Lookup details for each new order and add to sheet
    let syncedCount = 0;
    const errors: string[] = [];
    
    for (const order of newOrders) {
      try {
        logs.push(`Looking up order #${order.orderId}...`);
        
        // Get full order details (including salesrep from detail page)
        const orderDetails = await lookupOrder(order.orderId);
        
        if (orderDetails) {
          logs.push(`  Found: ${orderDetails.customer} | ${orderDetails.salesrep} | ${orderDetails.db} kr`);
          
          // Add to Google Sheets
          await appendSyncedOrder({
            orderId: orderDetails.orderId,
            customer: orderDetails.customer,
            db: orderDetails.db,
            salesrep: orderDetails.salesrep,
            date: order.date || '',
          });
          
          syncedCount++;
          logs.push(`  ✅ Added to sheet`);
        } else {
          logs.push(`  ⚠️ Could not find order details`);
          errors.push(`Order #${order.orderId}: Details not found`);
        }
      } catch (err: any) {
        logs.push(`  ❌ Error: ${err.message}`);
        errors.push(`Order #${order.orderId}: ${err.message}`);
      }
      
      // Small delay between lookups to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logs.push(`Sync complete! Synced ${syncedCount}/${newOrders.length} orders in ${duration}s`);
    
    return NextResponse.json({
      success: true,
      message: `Synced ${syncedCount} new orders`,
      stats: {
        existingOrders: existingOrderIds.size,
        webmercOrders: recentOrders.length,
        newOrders: newOrders.length,
        syncedOrders: syncedCount,
        errors: errors.length,
        duration: `${duration}s`
      },
      errors: errors.length > 0 ? errors : undefined,
      logs
    });
    
  } catch (error: any) {
    logs.push(`❌ Sync failed: ${error.message}`);
    console.error('Auto-sync error:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      logs
    }, { status: 500 });
  }
}
