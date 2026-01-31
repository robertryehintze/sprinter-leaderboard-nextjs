import { NextRequest, NextResponse } from 'next/server';
import { fetchDashboardData } from '@/lib/google-sheets';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const timePeriod = (searchParams.get('timePeriod') || 'monthly') as 'daily' | 'monthly' | 'yearly';
    
    const data = await fetchDashboardData(timePeriod);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
