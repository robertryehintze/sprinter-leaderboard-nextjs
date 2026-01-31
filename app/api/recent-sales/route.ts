import { NextRequest, NextResponse } from 'next/server';
import { fetchRecentSales } from '@/lib/google-sheets';

export async function GET(request: NextRequest) {
  try {
    // Check if credentials exist
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
      return NextResponse.json({ error: 'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL' }, { status: 500 });
    }
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
      return NextResponse.json({ error: 'Missing GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY' }, { status: 500 });
    }
    
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    
    const recentSales = await fetchRecentSales(limit);
    return NextResponse.json(recentSales);
  } catch (error: any) {
    console.error('Recent sales error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch recent sales',
      details: error?.message || 'Unknown error',
    }, { status: 500 });
  }
}
