import { NextRequest, NextResponse } from 'next/server';
import { appendSaleToSheet } from '@/lib/google-sheets';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dato, saelger, ordreId, db, soerenMoede, retentionSalg } = body;
    
    if (!dato || !saelger || !ordreId) {
      return NextResponse.json({ success: false, message: 'Manglende felter' }, { status: 400 });
    }
    
    const rowData = [
      dato, saelger, ordreId, '', '', '', '', '', '', '',
      `kr ${db.toLocaleString('da-DK', { minimumFractionDigits: 2 })}`,
      '', soerenMoede, retentionSalg
    ];
    
    await appendSaleToSheet(rowData);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Submit error:', error);
    return NextResponse.json({ success: false, message: 'Fejl ved indsendelse' }, { status: 500 });
  }
}
