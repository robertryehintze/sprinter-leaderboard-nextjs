import { NextResponse } from 'next/server';
import { fetchHallOfFame } from '@/lib/google-sheets';

export async function GET() {
  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
      return NextResponse.json({ error: 'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL' }, { status: 500 });
    }
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
      return NextResponse.json({ error: 'Missing GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY' }, { status: 500 });
    }
    
    const hallOfFame = await fetchHallOfFame();
    return NextResponse.json(hallOfFame);
  } catch (error: any) {
    console.error('Hall of Fame error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch Hall of Fame',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
