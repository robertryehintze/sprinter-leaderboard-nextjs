import { NextRequest, NextResponse } from 'next/server';
import { fetchDashboardDataWithBudget, fetchYearlyBreakdown } from '@/lib/google-sheets';

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
    const timePeriod = (searchParams.get('timePeriod') || 'monthly') as 'daily' | 'monthly' | 'yearly';
    
    // Fetch dashboard data and yearly breakdown in parallel
    const [data, yearlyBreakdown] = await Promise.all([
      fetchDashboardDataWithBudget(timePeriod),
      fetchYearlyBreakdown(),
    ]);
    return NextResponse.json({ ...data, yearlyBreakdown });
  } catch (error: any) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch data',
      details: error?.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    }, { status: 500 });
  }
}
