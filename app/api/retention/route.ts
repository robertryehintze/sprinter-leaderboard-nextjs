import { NextRequest, NextResponse } from 'next/server';
import { checkCustomerRetention } from '@/lib/webmerc-client';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const customerName = searchParams.get('customer');
  
  if (!customerName) {
    return NextResponse.json(
      { error: 'Missing customer parameter' },
      { status: 400 }
    );
  }
  
  try {
    const result = await checkCustomerRetention(customerName);
    
    return NextResponse.json({
      customer: customerName,
      isRetention: result.isRetention,
      previousOrderDate: result.previousOrderDate,
      previousOrderCount: result.previousOrderCount,
      daysSinceLastOrder: result.daysSinceLastOrder,
      // Human-readable message
      message: result.isRetention 
        ? `Retention! Kunden har ${result.previousOrderCount} tidligere ordre(r). Seneste ordre: ${result.previousOrderDate} (${result.daysSinceLastOrder} dage siden)`
        : result.previousOrderCount > 0
          ? `Ikke retention - seneste ordre er over 24 måneder gammel (${result.daysSinceLastOrder} dage siden)`
          : 'Ny kunde - ingen tidligere ordrer fundet'
    });
  } catch (error) {
    console.error('Retention check error:', error);
    return NextResponse.json(
      { error: 'Failed to check retention', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST endpoint for checking retention when registering a sale
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerName } = body;
    
    if (!customerName) {
      return NextResponse.json(
        { error: 'Missing customerName in request body' },
        { status: 400 }
      );
    }
    
    const result = await checkCustomerRetention(customerName);
    
    return NextResponse.json({
      customer: customerName,
      isRetention: result.isRetention,
      previousOrderDate: result.previousOrderDate,
      previousOrderCount: result.previousOrderCount,
      daysSinceLastOrder: result.daysSinceLastOrder,
    });
  } catch (error) {
    console.error('Retention check error:', error);
    return NextResponse.json(
      { error: 'Failed to check retention', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
