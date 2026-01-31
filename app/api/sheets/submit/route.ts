import { NextRequest, NextResponse } from 'next/server';
import { appendSaleToSheet } from '@/lib/google-sheets';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dato, saelger, ordreId, kunde, db, soerenMoede, retentionSalg } = body;
    
    if (!dato || !saelger || !ordreId) {
      return NextResponse.json({ success: false, message: 'Manglende felter' }, { status: 400 });
    }
    
    // For meetings (Søren Møde), require customer name
    if (soerenMoede === 'JA' && ordreId === 'MØDE' && !kunde) {
      return NextResponse.json({ success: false, message: 'Kundenavn påkrævet for møder' }, { status: 400 });
    }
    
    // Format date as DD-MM-YYYY if it comes as YYYY-MM-DD
    let formattedDate = dato;
    if (dato.includes('-') && dato.split('-')[0].length === 4) {
      const [year, month, day] = dato.split('-');
      formattedDate = `${day}-${month}-${year}`;
    }
    
    // Build row data:
    // A: Date, B: Seller, C: Order ID, D: Customer, E-J: empty, K: DB, L: empty, M: Meeting, N: Retention
    const rowData = [
      formattedDate,           // A: Date
      saelger,                 // B: Seller
      ordreId,                 // C: Order ID
      kunde || '',             // D: Customer name ← NOW SAVED!
      '',                      // E: empty
      '',                      // F: empty
      '',                      // G: empty
      '',                      // H: empty
      '',                      // I: empty
      '',                      // J: empty
      `kr ${Number(db || 0).toLocaleString('da-DK', { minimumFractionDigits: 2 })}`, // K: DB
      '',                      // L: empty
      soerenMoede,             // M: Meeting
      retentionSalg            // N: Retention
    ];
    
    await appendSaleToSheet(rowData);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Submit error:', error);
    return NextResponse.json({ success: false, message: 'Fejl ved indsendelse' }, { status: 500 });
  }
}
