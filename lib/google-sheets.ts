import { google } from 'googleapis';

const SHEET_ID = '1jj-Q5pGdY94xLVOsGqgDELGpX8tuEzQm3mf9yJysnKw';

function formatPrivateKey(key: string): string {
  // Trim whitespace from start and end
  let formattedKey = key.trim();
  
  // Replace literal \n with actual newlines
  formattedKey = formattedKey.replace(/\\n/g, '\n');
  
  // Remove any spaces between parts (Vercel sometimes adds spaces)
  formattedKey = formattedKey.replace(/ -----/g, '\n-----');
  formattedKey = formattedKey.replace(/----- /g, '-----\n');
  
  // Ensure it starts with the header
  if (!formattedKey.startsWith('-----BEGIN')) {
    const beginIndex = formattedKey.indexOf('-----BEGIN');
    if (beginIndex > 0) {
      formattedKey = formattedKey.substring(beginIndex);
    }
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
    email: serviceAccountEmail.trim(),
    key: formattedKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  
  return google.sheets({ version: 'v4', auth });
}

export async function appendSaleToSheet(rowData: any[]) {
  const sheets = await getAuthenticatedSheetsClient();
  
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'SALG (INPUT) v2!A:A',
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

// Hall of Fame - Get winners from previous months
export async function fetchHallOfFame() {
  const sheets = await getAuthenticatedSheetsClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'SALG (INPUT) v2!A2:N1000',
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  
  const rows = response.data.values || [];
  const salespeople = ['Niels Larsen', 'Robert', 'Søgaard', 'Frank', 'Jeppe', 'Kristofer'];
  
  // Group data by month
  const monthlyData: Record<string, Record<string, { db: number; meetings: number }>> = {};
  
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  rows.forEach((row) => {
    const dateValue = row[0];
    const seller = row[1];
    const dbValue = row[10];
    const meeting = row[12];
    
    let rowDate: Date;
    if (typeof dateValue === 'number') {
      rowDate = new Date((dateValue - 25569) * 86400 * 1000);
    } else if (typeof dateValue === 'string') {
      const parts = dateValue.split('-');
      if (parts.length === 3) {
        rowDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      } else return;
    } else return;
    
    const monthKey = `${rowDate.getFullYear()}-${String(rowDate.getMonth() + 1).padStart(2, '0')}`;
    
    // Skip current month - that's shown in main leaderboard
    if (monthKey === currentMonth) return;
    
    const matchedSeller = salespeople.find(name => 
      seller && name.toLowerCase().includes(seller.toString().toLowerCase().trim())
    );
    if (!matchedSeller) return;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {};
      salespeople.forEach(name => {
        monthlyData[monthKey][name] = { db: 0, meetings: 0 };
      });
    }
    
    let db = 0;
    if (typeof dbValue === 'number') {
      db = dbValue;
    } else if (typeof dbValue === 'string') {
      const cleanValue = dbValue.replace(/kr\s*/i, '').replace(/\./g, '').replace(',', '.');
      db = parseFloat(cleanValue) || 0;
    }
    
    monthlyData[monthKey][matchedSeller].db += db;
    if (meeting === 'JA') monthlyData[monthKey][matchedSeller].meetings += 1;
  });
  
  // Calculate winners for each month
  const monthNames: Record<string, string> = {
    '01': 'Januar', '02': 'Februar', '03': 'Marts', '04': 'April',
    '05': 'Maj', '06': 'Juni', '07': 'Juli', '08': 'August',
    '09': 'September', '10': 'Oktober', '11': 'November', '12': 'December'
  };
  
  const hallOfFame = Object.entries(monthlyData)
    .map(([monthKey, sellers]) => {
      const [year, month] = monthKey.split('-');
      const monthName = monthNames[month] || month;
      
      // Find DB winner
      let dbWinner = { name: '', db: 0 };
      let meetingsWinner = { name: '', meetings: 0 };
      
      Object.entries(sellers).forEach(([name, data]) => {
        if (data.db > dbWinner.db) {
          dbWinner = { name, db: data.db };
        }
        if (data.meetings > meetingsWinner.meetings) {
          meetingsWinner = { name, meetings: data.meetings };
        }
      });
      
      return {
        monthKey,
        monthLabel: `${monthName} ${year}`,
        dbWinner,
        meetingsWinner,
      };
    })
    .filter(m => m.dbWinner.db > 0 || m.meetingsWinner.meetings > 0)
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey)); // Most recent first
  
  return hallOfFame;
}


// Get all existing order IDs from the sheet (for duplicate checking)
export async function getExistingOrderIds(): Promise<Set<string>> {
  const sheets = await getAuthenticatedSheetsClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'SALG (INPUT) v2!C2:C1000', // Column C contains order IDs
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  
  const rows = response.data.values || [];
  const orderIds = new Set<string>();
  
  rows.forEach((row) => {
    const orderId = row[0];
    if (orderId) {
      orderIds.add(String(orderId).trim());
    }
  });
  
  return orderIds;
}

// Add a synced order to the sheet (auto-sync version)
export async function appendSyncedOrder(orderData: {
  orderId: string;
  customer: string;
  db: number;
  salesrep: string;
  date: string;
}) {
  const sheets = await getAuthenticatedSheetsClient();
  
  // Format date as DD-MM-YYYY
  const today = new Date();
  const formattedDate = orderData.date || `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
  
  // Format DB as Danish currency
  const formattedDb = `kr ${orderData.db.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  
  // Build row data matching the sheet structure:
  // A: Date, B: Seller, C: Order ID, D: Customer, E-J: empty, K: DB, L: empty, M: Meeting, N: Retention
  const rowData = [
    formattedDate,           // A: Date
    orderData.salesrep,      // B: Seller
    orderData.orderId,       // C: Order ID
    orderData.customer,      // D: Customer
    '',                      // E: empty
    '',                      // F: empty
    '',                      // G: empty
    '',                      // H: empty
    '',                      // I: empty
    '',                      // J: empty
    formattedDb,             // K: DB
    '',                      // L: empty
    'NEJ',                   // M: Meeting (default NEJ for auto-synced)
    'NEJ',                   // N: Retention (default NEJ for auto-synced)
  ];
  
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'SALG (INPUT) v2!A:A',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [rowData] },
  });
  
  return response.data;
}
