import { NextRequest, NextResponse } from 'next/server';
import { lookupOrder } from '@/lib/webmerc-client';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const orderId = request.nextUrl.searchParams.get('orderId');
    
    if (!orderId) {
      return NextResponse.json({ found: false, message: 'Ordre ID påkrævet' }, { status: 400 });
    }
    
    const orderData = await lookupOrder(orderId);
    
    if (!orderData) {
      return NextResponse.json({ found: false, message: `Ordre ${orderId} ikke fundet` });
    }
    
    return NextResponse.json({ found: true, order: orderData });
  } catch (error) {
    console.error('Lookup error:', error);
    return NextResponse.json({ found: false, message: 'Fejl ved opslag' }, { status: 500 });
  }
}
