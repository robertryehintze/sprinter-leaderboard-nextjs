import { NextRequest, NextResponse } from 'next/server';
import { findMeetingMatchesForSale } from '@/lib/google-sheets';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const salesperson = searchParams.get('salesperson');
    const customer = searchParams.get('customer');
    
    if (!salesperson || !customer) {
      return NextResponse.json({ 
        error: 'Missing required parameters: salesperson and customer' 
      }, { status: 400 });
    }
    
    const matches = await findMeetingMatchesForSale(salesperson, customer);
    
    return NextResponse.json({
      success: true,
      matches,
      hasMatches: matches.length > 0,
      bestMatch: matches.length > 0 ? matches[0] : null,
    });
  } catch (error: any) {
    console.error('Meeting match error:', error);
    return NextResponse.json({ 
      error: 'Failed to find meeting matches',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
