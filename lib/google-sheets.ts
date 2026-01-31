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

// Salesperson aliases - maps various name formats to display name
const SALESPERSON_ALIASES: Record<string, string[]> = {
  'Niels': ['niels', 'niels larsen', 'larsen'],
  'Robert': ['robert', 'robert hintze', 'hintze'],
  'Søgaard': ['søgaard', 'michael søgaard', 'michael'],
  'Frank': ['frank', 'vilholdt', 'vilholdt johansen', 'frank vilholdt', 'frank vilholdt johansen', 'vilholt', 'vilholt-johannsen', 'fvj'],
  'Jeppe': ['jeppe', 'jeppe ellebæk', 'ellebæk'],
  'Kristofer': ['kristofer', 'kristofer kripalani', 'kripalani'],
};

// Get display names for salespeople
const SALESPEOPLE = Object.keys(SALESPERSON_ALIASES);

// Match seller name from sheet to display name
function matchSalesperson(sellerName: string | undefined | null): string | null {
  if (!sellerName) return null;
  const normalized = sellerName.toString().toLowerCase().trim();
  
  for (const [displayName, aliases] of Object.entries(SALESPERSON_ALIASES)) {
    for (const alias of aliases) {
      // Check if the normalized name contains the alias or vice versa
      if (normalized.includes(alias) || alias.includes(normalized)) {
        return displayName;
      }
    }
  }
  return null;
}

export async function fetchDashboardData(timePeriod: 'daily' | 'monthly' | 'yearly' = 'monthly') {
  const sheets = await getAuthenticatedSheetsClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'SALG (INPUT) v2!A2:N1000',
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  
  const rows = response.data.values || [];
  
  const salesData: Record<string, { db: number; meetings: number; retention: number }> = {};
  SALESPEOPLE.forEach(name => {
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
    
    const matchedSeller = matchSalesperson(seller);
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
  
  const leaderboard = SALESPEOPLE.map(name => ({
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
      // Skip invalid dates (0 or very low values result in dates before 1900)
      if (dateValue < 36526) return; // 36526 = Jan 1, 2000 in Excel serial
      rowDate = new Date((dateValue - 25569) * 86400 * 1000);
    } else if (typeof dateValue === 'string') {
      const parts = dateValue.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[2]);
        // Skip invalid years
        if (year < 2000 || year > 2100) return;
        rowDate = new Date(year, parseInt(parts[1]) - 1, parseInt(parts[0]));
      } else return;
    } else return;
    
    // Skip dates before year 2000 (invalid data)
    if (rowDate.getFullYear() < 2000) return;
    
    const monthKey = `${rowDate.getFullYear()}-${String(rowDate.getMonth() + 1).padStart(2, '0')}`;
    
    // Skip current month - that's shown in main leaderboard
    if (monthKey === currentMonth) return;
    
    const matchedSeller = matchSalesperson(seller);
    if (!matchedSeller) return;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {};
      SALESPEOPLE.forEach(name => {
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
  // Webmerc returns date as "DD.MM.YYYY" - convert to "DD-MM-YYYY"
  const today = new Date();
  let formattedDate: string;
  
  if (orderData.date) {
    // Convert DD.MM.YYYY to DD-MM-YYYY
    formattedDate = orderData.date.replace(/\./g, '-');
  } else {
    formattedDate = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
  }
  
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


// Fuzzy string matching - calculates similarity between two strings
function fuzzyMatch(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  // Exact match
  if (s1 === s2) return 1.0;
  
  // One contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Check word overlap
  const words1 = s1.split(/\s+/).filter(w => w.length > 2);
  const words2 = s2.split(/\s+/).filter(w => w.length > 2);
  
  let matchingWords = 0;
  for (const w1 of words1) {
    for (const w2 of words2) {
      if (w1 === w2 || w1.includes(w2) || w2.includes(w1)) {
        matchingWords++;
        break;
      }
    }
  }
  
  const totalWords = Math.max(words1.length, words2.length);
  if (totalWords === 0) return 0;
  
  return matchingWords / totalWords;
}

// Get all meetings for a specific salesperson (for matching with sales)
export async function getMeetingsForSalesperson(salesperson: string): Promise<Array<{
  rowIndex: number;
  date: string;
  customer: string;
  converted: boolean;
  linkedOrderId?: string;
}>> {
  const sheets = await getAuthenticatedSheetsClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'SALG (INPUT) v2!A2:O1000',
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  
  const rows = response.data.values || [];
  const meetings: Array<{
    rowIndex: number;
    date: string;
    customer: string;
    converted: boolean;
    linkedOrderId?: string;
  }> = [];
  
  rows.forEach((row, index) => {
    const seller = row[1];
    const customer = row[3]; // Column D: Customer
    const meeting = row[12]; // Column M: Meeting
    const linkedOrderId = row[14]; // Column O: Linked Order ID (new column for tracking)
    
    // Only include rows marked as meetings
    if (meeting !== 'JA') return;
    
    // Match salesperson
    const matchedSeller = matchSalesperson(seller);
    if (!matchedSeller) return;
    
    // Check if this salesperson matches
    const normalizedInput = salesperson.toLowerCase().trim();
    const matchesInput = matchedSeller.toLowerCase() === normalizedInput ||
      SALESPERSON_ALIASES[matchedSeller]?.some(alias => 
        alias.includes(normalizedInput) || normalizedInput.includes(alias)
      );
    
    if (!matchesInput) return;
    
    // Parse date
    const dateValue = row[0];
    let dateStr = '';
    if (typeof dateValue === 'number') {
      const d = new Date((dateValue - 25569) * 86400 * 1000);
      dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    } else if (typeof dateValue === 'string') {
      dateStr = dateValue;
    }
    
    meetings.push({
      rowIndex: index + 2, // +2 because we start from row 2 and index is 0-based
      date: dateStr,
      customer: customer?.toString() || '',
      converted: !!linkedOrderId,
      linkedOrderId: linkedOrderId?.toString(),
    });
  });
  
  // Sort by date descending (most recent first)
  return meetings.sort((a, b) => {
    const parseDate = (d: string) => {
      const parts = d.split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
      return new Date(0);
    };
    return parseDate(b.date).getTime() - parseDate(a.date).getTime();
  });
}

// Find potential meeting matches for a sale based on customer name
export async function findMeetingMatchesForSale(
  salesperson: string,
  customerName: string,
  lookbackDays: number = 90
): Promise<Array<{
  rowIndex: number;
  date: string;
  customer: string;
  matchScore: number;
  converted: boolean;
}>> {
  const meetings = await getMeetingsForSalesperson(salesperson);
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
  
  const matches: Array<{
    rowIndex: number;
    date: string;
    customer: string;
    matchScore: number;
    converted: boolean;
  }> = [];
  
  for (const meeting of meetings) {
    // Skip already converted meetings
    if (meeting.converted) continue;
    
    // Skip if no customer name
    if (!meeting.customer) continue;
    
    // Check date is within lookback period
    const parts = meeting.date.split('-');
    if (parts.length === 3) {
      const meetingDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (meetingDate < cutoffDate) continue;
    }
    
    // Calculate match score
    const matchScore = fuzzyMatch(customerName, meeting.customer);
    
    // Only include if there's some match (threshold: 0.3)
    if (matchScore >= 0.3) {
      matches.push({
        rowIndex: meeting.rowIndex,
        date: meeting.date,
        customer: meeting.customer,
        matchScore,
        converted: meeting.converted,
      });
    }
  }
  
  // Sort by match score descending
  return matches.sort((a, b) => b.matchScore - a.matchScore);
}

// Link a sale to a meeting (mark meeting as converted)
export async function linkSaleToMeeting(meetingRowIndex: number, orderId: string): Promise<void> {
  const sheets = await getAuthenticatedSheetsClient();
  
  // Update column O (index 15, but 1-indexed = column O) with the order ID
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `SALG (INPUT) v2!O${meetingRowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[orderId]] },
  });
}

// Get meeting conversion stats for dashboard
export async function getMeetingConversionStats(): Promise<{
  totalMeetings: number;
  convertedMeetings: number;
  conversionRate: number;
  byPerson: Record<string, { meetings: number; converted: number; rate: number }>;
}> {
  const sheets = await getAuthenticatedSheetsClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'SALG (INPUT) v2!A2:O1000',
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  
  const rows = response.data.values || [];
  
  const stats: Record<string, { meetings: number; converted: number }> = {};
  SALESPEOPLE.forEach(name => {
    stats[name] = { meetings: 0, converted: 0 };
  });
  
  let totalMeetings = 0;
  let convertedMeetings = 0;
  
  rows.forEach((row) => {
    const seller = row[1];
    const meeting = row[12]; // Column M: Meeting
    const linkedOrderId = row[14]; // Column O: Linked Order ID
    
    if (meeting !== 'JA') return;
    
    const matchedSeller = matchSalesperson(seller);
    if (!matchedSeller) return;
    
    totalMeetings++;
    stats[matchedSeller].meetings++;
    
    if (linkedOrderId) {
      convertedMeetings++;
      stats[matchedSeller].converted++;
    }
  });
  
  const byPerson: Record<string, { meetings: number; converted: number; rate: number }> = {};
  for (const [name, data] of Object.entries(stats)) {
    byPerson[name] = {
      meetings: data.meetings,
      converted: data.converted,
      rate: data.meetings > 0 ? (data.converted / data.meetings) * 100 : 0,
    };
  }
  
  return {
    totalMeetings,
    convertedMeetings,
    conversionRate: totalMeetings > 0 ? (convertedMeetings / totalMeetings) * 100 : 0,
    byPerson,
  };
}


// Fetch recent sales for Activity Feed
export async function fetchRecentSales(limit: number = 10) {
  const sheets = await getAuthenticatedSheetsClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'SALG (INPUT) v2!A2:N1000',
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  
  const rows = response.data.values || [];
  
  // Get current month's start date for filtering
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Collect all sales with their dates
  const sales: { name: string; amount: number; date: Date; time: string }[] = [];
  
  rows.forEach((row, index) => {
    const dateValue = row[0];
    const seller = row[1];
    const dbValue = row[10];
    const meeting = row[12];
    
    // Skip meeting-only entries (they have no DB value or DB is 0)
    if (meeting === 'JA') {
      let db = 0;
      if (typeof dbValue === 'number') {
        db = dbValue;
      } else if (typeof dbValue === 'string') {
        const cleanValue = dbValue.replace(/kr\s*/i, '').replace(/\./g, '').replace(',', '.');
        db = parseFloat(cleanValue) || 0;
      }
      if (db === 0) return; // Skip pure meeting entries
    }
    
    let rowDate: Date;
    if (typeof dateValue === 'number') {
      rowDate = new Date((dateValue - 25569) * 86400 * 1000);
    } else if (typeof dateValue === 'string') {
      const parts = dateValue.split('-');
      if (parts.length === 3) {
        rowDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      } else return;
    } else return;
    
    // Only include current month's sales
    if (rowDate < startOfMonth) return;
    
    const matchedSeller = matchSalesperson(seller);
    if (!matchedSeller) return;
    
    let db = 0;
    if (typeof dbValue === 'number') {
      db = dbValue;
    } else if (typeof dbValue === 'string') {
      const cleanValue = dbValue.replace(/kr\s*/i, '').replace(/\./g, '').replace(',', '.');
      db = parseFloat(cleanValue) || 0;
    }
    
    if (db > 0) {
      // Generate a pseudo-random time based on row index for variety
      // In a real system, you'd have actual timestamps
      const hours = 8 + (index % 10); // 8:00 - 17:00
      const minutes = (index * 7) % 60;
      const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      
      sales.push({
        name: matchedSeller,
        amount: db,
        date: rowDate,
        time,
      });
    }
  });
  
  // Sort by date descending (most recent first) and take the limit
  sales.sort((a, b) => b.date.getTime() - a.date.getTime());
  
  return sales.slice(0, limit).map(sale => ({
    name: sale.name,
    amount: sale.amount,
    time: sale.time,
  }));
}


// ============================================
// WORKDAY BUDGET CALCULATION & GOALS MANAGEMENT
// ============================================

// Default goals for each salesperson (can be overridden via admin)
const DEFAULT_GOALS: Record<string, number> = {
  'Niels': 100000,
  'Robert': 100000,
  'Søgaard': 100000,
  'Frank': 100000,
  'Jeppe': 100000,
  'Kristofer': 100000,
};

// Calculate workdays (Monday-Friday) in a given month
export function getWorkdaysInMonth(year: number, month: number): number {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let workdays = 0;
  
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    // Monday = 1, Friday = 5 (exclude Saturday = 6 and Sunday = 0)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      workdays++;
    }
  }
  
  return workdays;
}

// Calculate workdays elapsed so far in the current month
export function getWorkdaysElapsed(year: number, month: number, currentDay: number): number {
  const firstDay = new Date(year, month, 1);
  const today = new Date(year, month, currentDay);
  let workdays = 0;
  
  for (let d = new Date(firstDay); d <= today; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      workdays++;
    }
  }
  
  return workdays;
}

// Calculate expected budget based on workdays elapsed
export function calculateExpectedBudget(monthlyGoal: number, workdaysInMonth: number, workdaysElapsed: number): number {
  if (workdaysInMonth === 0) return 0;
  const dailyTarget = monthlyGoal / workdaysInMonth;
  return dailyTarget * workdaysElapsed;
}

// Check if a salesperson is behind on their workday budget
export function isUnderWorkdayBudget(currentDb: number, monthlyGoal: number): boolean {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  
  const workdaysInMonth = getWorkdaysInMonth(year, month);
  const workdaysElapsed = getWorkdaysElapsed(year, month, day);
  const expectedBudget = calculateExpectedBudget(monthlyGoal, workdaysInMonth, workdaysElapsed);
  
  return currentDb < expectedBudget;
}

// Get workday budget info for display
export function getWorkdayBudgetInfo(currentDb: number, monthlyGoal: number): {
  workdaysInMonth: number;
  workdaysElapsed: number;
  workdaysRemaining: number;
  dailyTarget: number;
  expectedBudget: number;
  actualDb: number;
  difference: number;
  isUnderBudget: boolean;
  requiredDailyToHitGoal: number;
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  
  const workdaysInMonth = getWorkdaysInMonth(year, month);
  const workdaysElapsed = getWorkdaysElapsed(year, month, day);
  const workdaysRemaining = workdaysInMonth - workdaysElapsed;
  const dailyTarget = monthlyGoal / workdaysInMonth;
  const expectedBudget = calculateExpectedBudget(monthlyGoal, workdaysInMonth, workdaysElapsed);
  const difference = currentDb - expectedBudget;
  const isUnderBudget = difference < 0;
  
  // Calculate required daily amount to still hit the monthly goal
  const remainingToGoal = monthlyGoal - currentDb;
  const requiredDailyToHitGoal = workdaysRemaining > 0 ? remainingToGoal / workdaysRemaining : remainingToGoal;
  
  return {
    workdaysInMonth,
    workdaysElapsed,
    workdaysRemaining,
    dailyTarget: Math.round(dailyTarget),
    expectedBudget: Math.round(expectedBudget),
    actualDb: Math.round(currentDb),
    difference: Math.round(difference),
    isUnderBudget,
    requiredDailyToHitGoal: Math.round(requiredDailyToHitGoal),
  };
}

// Fetch individual goals from Google Sheets (GOALS sheet)
export async function fetchSalesGoals(): Promise<Record<string, number>> {
  try {
    const sheets = await getAuthenticatedSheetsClient();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'GOALS!A2:B10',
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    
    const rows = response.data.values || [];
    const goals: Record<string, number> = { ...DEFAULT_GOALS };
    
    rows.forEach((row) => {
      const name = row[0];
      const goal = row[1];
      
      if (name && typeof goal === 'number') {
        // Match to display name
        const matchedName = matchSalesperson(name);
        if (matchedName) {
          goals[matchedName] = goal;
        }
      }
    });
    
    return goals;
  } catch (error) {
    // If GOALS sheet doesn't exist, return defaults
    console.log('GOALS sheet not found, using defaults');
    return { ...DEFAULT_GOALS };
  }
}

// Update a salesperson's goal in Google Sheets
export async function updateSalesGoal(name: string, goal: number): Promise<void> {
  const sheets = await getAuthenticatedSheetsClient();
  
  // First, try to read existing goals
  let existingRows: any[][] = [];
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'GOALS!A2:B10',
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    existingRows = response.data.values || [];
  } catch (error) {
    // Sheet might not exist yet
  }
  
  // Find if this person already has a row
  let rowIndex = -1;
  for (let i = 0; i < existingRows.length; i++) {
    const matchedName = matchSalesperson(existingRows[i][0]);
    if (matchedName === name) {
      rowIndex = i + 2; // +2 because we start at A2
      break;
    }
  }
  
  if (rowIndex > 0) {
    // Update existing row
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `GOALS!A${rowIndex}:B${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[name, goal]] },
    });
  } else {
    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'GOALS!A:B',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[name, goal]] },
    });
  }
}

// Meetings budget calculation
const MEETINGS_GOAL_PER_MONTH = 6;

export function getMeetingsBudgetInfo(currentMeetings: number): {
  meetingsGoal: number;
  expectedMeetings: number;
  actualMeetings: number;
  difference: number;
  isUnderBudget: boolean;
  requiredMeetingsRemaining: number;
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  
  const workdaysInMonth = getWorkdaysInMonth(year, month);
  const workdaysElapsed = getWorkdaysElapsed(year, month, day);
  const workdaysRemaining = workdaysInMonth - workdaysElapsed;
  
  // Calculate expected meetings based on workdays elapsed
  const meetingsPerWorkday = MEETINGS_GOAL_PER_MONTH / workdaysInMonth;
  const expectedMeetings = meetingsPerWorkday * workdaysElapsed;
  const difference = currentMeetings - expectedMeetings;
  const isUnderBudget = difference < 0;
  
  // Calculate remaining meetings needed
  const remainingMeetings = MEETINGS_GOAL_PER_MONTH - currentMeetings;
  
  return {
    meetingsGoal: MEETINGS_GOAL_PER_MONTH,
    expectedMeetings: Math.round(expectedMeetings * 10) / 10,
    actualMeetings: currentMeetings,
    difference: Math.round(difference * 10) / 10,
    isUnderBudget,
    requiredMeetingsRemaining: Math.max(0, remainingMeetings),
  };
}

// Get all goals with budget info for each salesperson
export async function fetchDashboardDataWithBudget(timePeriod: 'daily' | 'monthly' | 'yearly' = 'monthly') {
  // Fetch regular dashboard data
  const dashboardData = await fetchDashboardData(timePeriod);
  
  // Fetch individual goals
  const goals = await fetchSalesGoals();
  
  // Add budget info to each person (both DB and meetings)
  const leaderboardWithBudget = dashboardData.leaderboard.map(person => {
    const monthlyGoal = goals[person.name] || DEFAULT_GOALS[person.name] || 100000;
    const budgetInfo = getWorkdayBudgetInfo(person.db, monthlyGoal);
    const meetingsBudgetInfo = getMeetingsBudgetInfo(person.meetings);
    
    return {
      ...person,
      monthlyGoal,
      goalProgress: (person.db / monthlyGoal) * 100,
      budgetInfo,
      meetingsBudgetInfo,
    };
  });
  
  return {
    ...dashboardData,
    leaderboard: leaderboardWithBudget,
    goals,
  };
}
