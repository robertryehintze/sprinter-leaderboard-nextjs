import { NextResponse } from 'next/server';
import { 
  fetchSalesGoals, 
  updateSalesGoal, 
  fetchDashboardData,
  getWorkdayBudgetInfo 
} from '@/lib/google-sheets';

// GET - Fetch all goals with budget info
export async function GET() {
  try {
    // Fetch current goals
    const goals = await fetchSalesGoals();
    
    // Fetch current DB values
    const dashboardData = await fetchDashboardData('monthly');
    
    // Combine goals with current DB and budget info
    const goalsWithInfo = dashboardData.leaderboard.map(person => {
      const monthlyGoal = goals[person.name] || 100000;
      const budgetInfo = getWorkdayBudgetInfo(person.db, monthlyGoal);
      
      return {
        name: person.name,
        currentGoal: monthlyGoal,
        currentDb: person.db,
        budgetInfo,
      };
    });
    
    return NextResponse.json({ 
      goals: goalsWithInfo,
      rawGoals: goals,
    });
  } catch (error) {
    console.error('Failed to fetch goals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch goals' },
      { status: 500 }
    );
  }
}

// POST - Update a salesperson's goal
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, goal } = body;
    
    if (!name || typeof goal !== 'number' || goal < 0) {
      return NextResponse.json(
        { error: 'Invalid name or goal' },
        { status: 400 }
      );
    }
    
    await updateSalesGoal(name, goal);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update goal:', error);
    return NextResponse.json(
      { error: 'Failed to update goal' },
      { status: 500 }
    );
  }
}
