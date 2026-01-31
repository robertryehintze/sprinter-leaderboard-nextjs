import { google } from 'googleapis';

const SHEET_ID = '1jj-Q5pGdY94xLVOsGqgDELGpX8tuEzQm3mf9yJysnKw';

function formatPrivateKey(key: string): string {
  // Handle various formats of private key
  let formattedKey = key;
  
  // If the key is JSON-escaped (has literal \n), convert to actual newlines
  if (formattedKey.includes('\\n')) {
    formattedKey = formattedKey.replace(/\\n/g, '\n');
  }
  
  // If key doesn't have proper PEM format, try to fix it
  if (!formattedKey.includes('-----BEGIN')) {
    // Key might be base64 only, wrap it
    formattedKey = `-----BEGIN PRIVATE KEY-----\n${formattedKey}\n-----END PRIVATE KEY-----\n`;
  }
  
  // Ensure proper line breaks in the key body
  // Remove any existing formatting first
  const lines = formattedKey.split('\n');
  const header = lines[0];
  const footer = lines[lines.length - 1] || lines[lines.length - 2];
  
  // Get the key body (everything between header and footer)
  let body = lines.slice(1, -1).join('').replace(/\s/g, '');
  if (body.endsWith('-----ENDPRIVATEKEY-----')) {
    body = body.replace('-----ENDPRIVATEKEY-----', '');
  }
  
  // If body is too long (no line breaks), split into 64-char lines
  if (body.length > 100 && !body.includes('\n')) {
    const chunks = body.match(/.{1,64}/g) || [];
    formattedKey = `-----BEGIN PRIVATE KEY-----\n${chunks.join('\n')}\n-----END PRIVATE KEY-----\n`;
  }
  
  return formattedKey;
}

async function getAuthenticatedSheetsClient() {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  
  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Missing Google Service Account credentials');
  }
  
  const formattedKey = formatPrivateKey(privateKey);
  
  const auth = new google.auth.JWT({
    email: serviceAccountEmail,
    key: formattedKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  
  return google.sheets({ version: 'v4', auth });
}

export async function appendSaleToSheet(rowData: any[]) {
  const sheets = await getAuthenticatedSheetsClient();
  
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'SALG (INPUT) v2',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [rowData] },
  });
  
  return response.data;
}

export async function fetchDashboardData(timePeriod: 'daily' | 'monthly' | 'yearly' = 'monthly') {
  const sheets = await getAuthenticatedSheetsClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'SALG (INPUT) v2!A2:N1000',
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  
  const rows = response.data.values || [];
  const salespeople = ['Niels Larsen', 'Robert', 'Søgaard', 'Frank', 'Jeppe', 'Kristofer'];
  
  const salesData: Record<string, { db: number; meetings: number; retention: number }> = {};
  salespeople.forEach(name => {
    salesData[name] = { db: 0, meetings: 0, retention: 0 };
  });
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  let filterDate = timePeriod === 'daily' ? startOfDay : timePeriod === 'yearly' ? startOfYear : startOfMonth;
  
  rows.forEach((row) => {
    const dateValue = row[0];
    const seller = row[1];
    const dbValue = row[10];
    const meeting = row[12];
    const retention = row[13];
    
    let rowDate: Date;
    if (typeof dateValue === 'number') {
      rowDate = new Date((dateValue - 25569) * 86400 * 1000);
    } else if (typeof dateValue === 'string') {
      const parts = dateValue.split('-');
      if (parts.length === 3) {
        rowDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      } else return;
    } else return;
    
    if (rowDate < filterDate) return;
    
    const matchedSeller = salespeople.find(name => 
      seller && name.toLowerCase().includes(seller.toString().toLowerCase().trim())
    );
    if (!matchedSeller) return;
    
    let db = 0;
    if (typeof dbValue === 'number') {
      db = dbValue;
    } else if (typeof dbValue === 'string') {
      const cleanValue = dbValue.replace(/kr\s*/i, '').replace(/\./g, '').replace(',', '.');
      db = parseFloat(cleanValue) || 0;
    }
    
    salesData[matchedSeller].db += db;
    if (meeting === 'JA') salesData[matchedSeller].meetings += 1;
    if (retention === 'JA') salesData[matchedSeller].retention += db;
  });
  
  const leaderboard = salespeople.map(name => ({
    name,
    db: salesData[name].db,
    meetings: salesData[name].meetings,
    retention: salesData[name].retention,
    goalProgress: (salesData[name].db / 100000) * 100,
  })).sort((a, b) => b.db - a.db);
  
  return {
    leaderboard,
    totalDb: leaderboard.reduce((sum, s) => sum + s.db, 0),
    totalMeetings: leaderboard.reduce((sum, s) => sum + s.meetings, 0),
    totalRetention: leaderboard.reduce((sum, s) => sum + s.retention, 0),
  };
}
