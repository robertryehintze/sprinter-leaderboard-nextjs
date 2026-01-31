import { NextResponse } from 'next/server';
import { getMeetingConversionStats } from '@/lib/google-sheets';

export async function GET() {
  try {
    const stats = await getMeetingConversionStats();
    
    return NextResponse.json({
      success: true,
      ...stats,
    });
  } catch (error: any) {
    console.error('Meeting stats error:', error);
    return NextResponse.json({ 
      error: 'Failed to get meeting stats',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
