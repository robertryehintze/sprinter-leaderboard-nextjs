import { NextRequest, NextResponse } from 'next/server';
import { linkSaleToMeeting } from '@/lib/google-sheets';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meetingRowIndex, orderId } = body;
    
    if (!meetingRowIndex || !orderId) {
      return NextResponse.json({ 
        error: 'Missing required parameters: meetingRowIndex and orderId' 
      }, { status: 400 });
    }
    
    await linkSaleToMeeting(meetingRowIndex, orderId);
    
    return NextResponse.json({
      success: true,
      message: `Sale ${orderId} linked to meeting at row ${meetingRowIndex}`,
    });
  } catch (error: any) {
    console.error('Meeting link error:', error);
    return NextResponse.json({ 
      error: 'Failed to link sale to meeting',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
