import { NextResponse } from 'next/server';

export async function GET() {
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
  
  return NextResponse.json({
    hasPrivateKey: !!privateKey,
    keyLength: privateKey.length,
    startsWithBegin: privateKey.startsWith('-----BEGIN'),
    hasEscapedNewlines: privateKey.includes('\\n'),
    hasRealNewlines: privateKey.includes('\n'),
    first50: privateKey.substring(0, 50),
    last50: privateKey.substring(privateKey.length - 50),
  });
}
