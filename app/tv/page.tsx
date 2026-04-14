'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

interface BudgetInfo {
  workdaysInMonth: number;
  workdaysElapsed: number;
  workdaysRemaining: number;
  dailyTarget: number;
  expectedBudget: number;
  actualDb: number;
  difference: number;
  isUnderBudget: boolean;
  requiredDailyToHitGoal: number;
}

interface SalespersonData {
  name: string;
  db: number;
  meetings: number;
  retention: number;
  goalProgress: number;
  salesCount?: number;
  monthlyGoal?: number;
  budgetInfo?: BudgetInfo;
}

interface YearlySeller {
  name: string;
  months: number[];
  ytd: number;
  yearlyGoal: number;
  yearlyProgress: number;
  monthlyGoal: number;
}

interface FormerSellers {
  names: string[];
  months: number[];
  ytd: number;
}

interface HallOfFameEntry {
  monthKey: string;
  monthLabel: string;
  year: string;
  first: { name: string; db: number };
  second: { name: string; db: number };
}

interface DashboardData {
  leaderboard: SalespersonData[];
  totalDb: number;
  totalMeetings: number;
  totalRetention: number;
  formerSellersDb?: number;
  recentSales?: { name: string; amount: number; time: string }[];
  goals?: Record<string, number>;
  yearlyBreakdown?: {
    sellers: YearlySeller[];
    year: number;
    fiscalPeriod?: string;
    fiscalMonthCount?: number;
    teamBudget?: number;
    formerSellers?: FormerSellers;
  };
}

const DB_GOAL = 200000;
const TEAM_HALF_YEAR_BUDGET = 6000000;

// Fiscal half-year month labels (Jan–Jun)
const FISCAL_MONTH_LABELS = ['Jan','Feb','Mar','Apr','Maj','Jun'];

// Confetti Component
const Confetti = ({ active }: { active: boolean }) => {
  if (!active) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {[...Array(50)].map((_, i) => (
        <div
          key={i}
          className="confetti-piece"
          style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 0.5}s`,
            backgroundColor: ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa'][Math.floor(Math.random() * 5)],
          }}
        />
      ))}
    </div>
  );
};

// Fire Icon Component
const FireIcon = ({ animate }: { animate: boolean }) => (
  <span className={`inline-block ${animate ? 'animate-fire' : ''}`}>🔥</span>
);

// Rank Change Indicator
const RankIndicator = ({ change }: { change: number }) => {
  if (change === 0) return null;
  if (change > 0) return <span className="text-emerald-400 text-xs ml-1 animate-bounce-in">↑{change}</span>;
  return <span className="text-red-400 text-xs ml-1 animate-bounce-in">↓{Math.abs(change)}</span>;
};

// Animated Number Component
const AnimatedNumber = ({ value, suffix = '' }: { value: number; suffix?: string }) => {
  const [displayed, setDisplayed] = useState(value);
  const ref = useRef(value);
  
  useEffect(() => {
    const start = ref.current;
    const end = value;
    const duration = 800;
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    
    requestAnimationFrame(animate);
    ref.current = value;
  }, [value]);
  
  return <>{displayed.toLocaleString('da-DK')}{suffix}</>;
};

// Animated Progress Bar
const AnimatedProgressBar = ({ progress, isLeader, color = 'teal' }: { progress: number; isLeader: boolean; color?: string }) => {
  const clampedProgress = Math.min(progress, 100);
  const colorMap: Record<string, string> = {
    teal: 'from-teal-400 to-emerald-400',
    amber: 'from-amber-400 to-yellow-300',
    indigo: 'from-indigo-400 to-violet-400',
  };
  
  return (
    <div className="w-full bg-white/[0.06] rounded-full h-3 overflow-hidden">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${colorMap[color] || colorMap.teal} transition-all duration-1000 ease-out ${isLeader ? 'animate-pulse-subtle' : ''}`}
        style={{ width: `${clampedProgress}%` }}
      />
    </div>
  );
};

// Animated Card
const AnimatedCard = ({ children, index, className }: { children: React.ReactNode; index: number; className?: string }) => (
  <div className={className} style={{ animationDelay: `${index * 0.08}s` }}>
    {children}
  </div>
);

// Mini bar chart for monthly breakdown (fiscal half-year: 6 months Jan–Jun)
const MiniBarChart = ({ months, monthlyGoal }: { months: number[]; monthlyGoal: number }) => {
  const now = new Date();
  const currentMonthIdx = now.getMonth(); // 0-based, Jan=0
  // months array is already sliced to fiscal period (6 items: Jan–Jun)
  const maxVal = Math.max(...months, monthlyGoal);
  const labels = ['J','F','M','A','M','J'];
  
  return (
    <div className="flex items-end gap-[2px] h-[40px]">
      {months.map((val, i) => {
        // i maps directly to fiscal month index (0=Jan, 5=Jun)
        const isFuture = i > currentMonthIdx;
        const height = maxVal > 0 ? (val / maxVal) * 100 : 0;
        const isCurrentMonth = i === currentMonthIdx;
        const overGoal = val >= monthlyGoal;
        return (
          <div key={i} className="flex flex-col items-center" style={{ flex: 1 }}>
            <div
              className={`w-full rounded-t-sm transition-all ${
                isFuture ? 'bg-white/5' :
                overGoal ? 'bg-emerald-400' : isCurrentMonth ? 'bg-teal-400' : val > 0 ? 'bg-teal-600' : 'bg-white/10'
              }`}
              style={{ height: isFuture ? '4%' : `${Math.max(height, 4)}%`, minHeight: '2px' }}
              title={`${labels[i]}: ${val.toLocaleString('da-DK')} kr`}
            />
          </div>
        );
      })}
    </div>
  );
};

// Activity Feed
const ActivityFeed = ({ activities, data }: { activities: { name: string; amount: number; time: string }[]; data: DashboardData | null }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showMotivational, setShowMotivational] = useState(false);
  const [motivationalMessage, setMotivationalMessage] = useState<string | null>(null);
  
  const TEAM_GOAL = 1000000; // Monthly team goal: Niels 200K + Robert 200K + Søgaard 200K + Søren 300K + Kristofer 100K = 1M
  
  const generateMessage = useCallback(() => {
    if (!data) return null;
    const teamProgress = (data.totalDb / TEAM_GOAL) * 100;
    const messages = teamProgress >= 80
      ? ["🚀 VI ER UNSTOPPABLE!", "💰 VINDERE gør det SÅDAN!", "🔥 LEGENDARISK indsats!"]
      : teamProgress >= 50
      ? ["📈 MOMENTUM er på vores side!", "💪 Keep pushing, CHAMPIONS!", "⚡ Vi er i ZONEN!"]
      : teamProgress >= 25
      ? ["⏰ Tick tock! Tid til at ACCELERERE!", "💼 Telefonerne skal GLØDE!", "🎪 Showtime, folkens!"]
      : ["🚨 KODE RØD! RING RING RING!", "🔥 Sæt ild til telefonerne!", "😤 Er I her for at VINDE?!"];
    return messages[Math.floor(Math.random() * messages.length)];
  }, [data]);
  
  useEffect(() => {
    if (activities.length === 0) return;
    const interval = setInterval(() => {
      if (showMotivational) {
        setShowMotivational(false);
        setCurrentIndex(prev => (prev + 1) % activities.length);
      } else {
        setMotivationalMessage(generateMessage());
        setShowMotivational(true);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [activities, showMotivational, generateMessage]);
  
  if (activities.length === 0) return null;
  const current = activities[currentIndex];
  
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <div className="bg-gradient-to-r from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-xl border-t border-white/10 px-6 py-3">
        <div className="flex items-center justify-center gap-3 text-lg">
          {showMotivational && motivationalMessage ? (
            <span className="text-amber-300 font-semibold animate-slide-in-up">{motivationalMessage}</span>
          ) : current ? (
            <span className="text-white/80 animate-slide-in-up">
              💵 <span className="font-semibold text-teal-300">{current.name}</span> closede{' '}
              <span className="font-bold text-white">{current.amount.toLocaleString('da-DK')} kr</span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// Month name helper
const getCurrentMonthName = () => {
  const months = ['Januar','Februar','Marts','April','Maj','Juni','Juli','August','September','Oktober','November','December'];
  return months[new Date().getMonth()];
};

export default function TVDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [hallOfFame, setHallOfFame] = useState<HallOfFameEntry[]>([]);
  const [recentSales, setRecentSales] = useState<{ name: string; amount: number; time: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [showConfetti, setShowConfetti] = useState(false);
  const [previousRanks, setPreviousRanks] = useState<Record<string, number>>({});
  const [rankChanges, setRankChanges] = useState<Record<string, number>>({});
  const [dataKey, setDataKey] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncResult, setSyncResult] = useState<{ newOrders: number; message: string } | null>(null);
  
  const triggerSync = async () => {
    if (syncStatus === 'syncing') return;
    setSyncStatus('syncing');
    setSyncResult(null);
    try {
      const response = await fetch('/api/sync?manual=true');
      const result = await response.json();
      if (result.success) {
        const syncedOrders = result.stats?.syncedOrders || 0;
        setSyncStatus('success');
        setSyncResult({ newOrders: syncedOrders, message: syncedOrders > 0 ? `${syncedOrders} nye ordrer!` : 'Ingen nye ordrer.' });
        if (syncedOrders > 0) setTimeout(() => fetchData(), 2000);
      } else {
        setSyncStatus('error');
        setSyncResult({ newOrders: 0, message: 'Sync fejlede.' });
      }
      setTimeout(() => { setSyncStatus('idle'); setSyncResult(null); }, 5000);
    } catch {
      setSyncStatus('error');
      setSyncResult({ newOrders: 0, message: 'Kunne ikke starte sync.' });
      setTimeout(() => { setSyncStatus('idle'); setSyncResult(null); }, 5000);
    }
  };
  
  const fetchData = useCallback(async () => {
    try {
      const [dashboardRes, hofRes, recentSalesRes] = await Promise.all([
        fetch('/api/dashboard?timePeriod=monthly'),
        fetch('/api/hall-of-fame'),
        fetch('/api/recent-sales?limit=15')
      ]);
      
      const dashboardData = await dashboardRes.json();
      const hofData = await hofRes.json();
      const recentSalesData = await recentSalesRes.json();
      
      if (Array.isArray(recentSalesData) && recentSalesData.length > 0) setRecentSales(recentSalesData);
      
      // Calculate rank changes
      if (data?.leaderboard) {
        const newRanks: Record<string, number> = {};
        const changes: Record<string, number> = {};
        dashboardData.leaderboard.forEach((person: SalespersonData, index: number) => {
          newRanks[person.name] = index;
          if (previousRanks[person.name] !== undefined) changes[person.name] = previousRanks[person.name] - index;
        });
        setPreviousRanks(newRanks);
        setRankChanges(changes);
        
        // Check for goal achievements
        const anyoneReachedGoal = dashboardData.leaderboard.some((person: SalespersonData) => {
          const prev = data.leaderboard.find(p => p.name === person.name);
          return person.db >= DB_GOAL && prev && prev.db < DB_GOAL;
        });
        if (anyoneReachedGoal) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 5000); }
      } else {
        const initialRanks: Record<string, number> = {};
        dashboardData.leaderboard.forEach((person: SalespersonData, index: number) => { initialRanks[person.name] = index; });
        setPreviousRanks(initialRanks);
      }
      
      setData(dashboardData);
      setHallOfFame(Array.isArray(hofData) ? hofData : []);
      setLastUpdated(new Date());
      setDataKey(prev => prev + 1);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [data, previousRanks]);
  
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);
  
  const getMedal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
  
  const isOnFire = (name: string) => {
    const person = data?.leaderboard.find(p => p.name === name);
    return person && person.goalProgress >= 80;
  };

  const getCardStyle = (index: number) => {
    const base = 'backdrop-blur-2xl bg-white/[0.04] transition-all duration-300';
    if (index === 0) return `${base} border border-amber-300/50 shadow-[0_0_30px_rgba(251,191,36,0.2)]`;
    if (index === 1) return `${base} border border-slate-300/40 shadow-[0_0_25px_rgba(203,213,225,0.15)]`;
    if (index === 2) return `${base} border border-amber-600/40 shadow-[0_0_22px_rgba(217,119,6,0.15)]`;
    return `${base} border border-white/[0.12]`;
  };
  
  if (loading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white/80 text-2xl animate-pulse">Indlæser...</div>
      </div>
    );
  }
  
  if (!data) {
    return <div className="h-screen bg-slate-950 flex items-center justify-center text-red-400/80 text-2xl">Fejl ved indlæsning</div>;
  }

  const currentMonth = getCurrentMonthName();
  const yearlyData = data.yearlyBreakdown;
  const monthLabels = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
  
  return (
    <div className="h-screen text-white p-4 pb-14 relative overflow-hidden flex flex-col">
      <Confetti active={showConfetti} />
      
      {/* Animated Gradient Background */}
      <div className="fixed inset-0 bg-gradient-animate" />
      
      {/* Particle Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="particle particle-1" />
        <div className="particle particle-2" />
        <div className="particle particle-3" />
        <div className="particle particle-4" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/8 rounded-full blur-3xl animate-float-slow animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/8 rounded-full blur-3xl animate-float-slow-reverse animate-pulse-glow-delayed" />
      </div>
      
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        {/* Header - compact */}
        <div className="flex justify-between items-center mb-3 animate-fade-in">
          <h1 className="text-4xl font-bold text-white/95 tracking-tight">🏆 Sprinter Leaderboard</h1>
          <div className="flex items-center gap-3">
            <Link href="/input" className="px-4 py-2 bg-white/10 backdrop-blur-xl border border-white/20 text-white rounded-xl font-semibold hover:bg-white/15 transition-all text-sm">
              ➕ Tilføj Salg
            </Link>
            <button 
              onClick={triggerSync}
              disabled={syncStatus === 'syncing'}
              className={`px-4 py-2 backdrop-blur-xl border rounded-xl font-semibold transition-all text-sm ${
                syncStatus === 'syncing' ? 'bg-amber-500/20 border-amber-400/30 text-amber-300 animate-pulse'
                : syncStatus === 'success' ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
                : syncStatus === 'error' ? 'bg-red-500/20 border-red-400/30 text-red-300'
                : 'bg-teal-500/10 border-teal-400/20 text-teal-300 hover:bg-teal-500/20'
              }`}
            >
              {syncStatus === 'syncing' ? '🔄 Syncer...' : syncStatus === 'success' ? '✅ Synced!' : syncStatus === 'error' ? '❌ Fejl' : '🔄 Sync'}
            </button>
            <Link href="/admin" className="px-4 py-2 bg-slate-500/10 backdrop-blur-xl border border-slate-400/20 text-slate-300 rounded-xl font-semibold hover:bg-slate-500/20 transition-all text-sm">
              ⚙️
            </Link>
            <div className="text-sm text-white/40">{lastUpdated.toLocaleTimeString('da-DK')}</div>
          </div>
        </div>
        
        {/* Summary Stats Row */}
        <div className="grid grid-cols-3 gap-3 mb-3 animate-fade-in">
          <div className="backdrop-blur-xl bg-white/[0.03] rounded-xl p-3 text-center border border-teal-400/15">
            <div className="text-white/40 text-sm mb-1 font-medium tracking-wide">Total DB {currentMonth}</div>
            <div className="text-4xl font-bold bg-gradient-to-r from-teal-300 to-teal-200 bg-clip-text text-transparent">
              <AnimatedNumber value={data.totalDb} suffix=" kr" />
            </div>
          </div>
          <div className="backdrop-blur-xl bg-white/[0.03] rounded-xl p-3 text-center border border-indigo-400/15">
            <div className="text-white/40 text-sm mb-1 font-medium tracking-wide">Team {yearlyData?.fiscalPeriod || 'H1'} {yearlyData?.year || 2026} / {(TEAM_HALF_YEAR_BUDGET / 1000000).toFixed(0)}M</div>
            <div className="text-4xl font-bold bg-gradient-to-r from-indigo-300 to-violet-200 bg-clip-text text-transparent">
              <AnimatedNumber value={(yearlyData?.sellers.reduce((s, v) => s + v.ytd, 0) || 0) + (yearlyData?.formerSellers?.ytd || 0)} suffix=" kr" />
            </div>
          </div>
          <div className="backdrop-blur-xl bg-white/[0.03] rounded-xl p-3 text-center border border-amber-400/15">
            <div className="text-white/40 text-sm mb-1 font-medium tracking-wide">Retention</div>
            <div className="text-4xl font-bold bg-gradient-to-r from-amber-300 to-amber-200 bg-clip-text text-transparent">
              <AnimatedNumber value={data.totalRetention} suffix=" kr" />
            </div>
          </div>
        </div>
        
        {/* Main Grid: 2 columns */}
        <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
          
          {/* LEFT COLUMN: DB Leaderboard - Current Month */}
          <div className="backdrop-blur-xl bg-teal-500/[0.06] rounded-2xl p-4 border border-teal-400/20 shadow-[0_0_40px_rgba(20,184,166,0.08)] animate-slide-up flex flex-col min-h-0">
            <h2 className="text-2xl font-semibold mb-2 text-teal-200/90 tracking-wide">💰 DB Leaderboard — {currentMonth}</h2>
            <div className="space-y-2 overflow-hidden flex-1" key={`db-${dataKey}`}>
              {data.leaderboard.map((person, index) => {
                const monthlyGoal = person.monthlyGoal || DB_GOAL;
                const isOverGoal = person.db >= monthlyGoal;
                const missingAmount = monthlyGoal - person.db;
                const onFire = isOnFire(person.name);
                const progressPct = Math.min((person.db / monthlyGoal) * 100, 100);
                
                return (
                  <AnimatedCard key={person.name} index={index} className={`p-3 rounded-xl relative ${getCardStyle(index)}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`text-3xl font-bold w-12 text-center ${index === 0 ? 'animate-bounce-subtle' : ''}`}>
                          {getMedal(index)}
                        </div>
                        <div>
                          <div className="text-xl font-semibold text-white/95 flex items-center gap-1">
                            {person.name}
                            {onFire && <FireIcon animate={true} />}
                            <RankIndicator change={rankChanges[person.name] || 0} />
                          </div>
                          <div className="text-sm text-white/40 font-medium">
                            {isOverGoal ? (
                              <span className="text-emerald-400">{Math.round(person.goalProgress)}% af mål</span>
                            ) : (
                              <span>Mangler {missingAmount.toLocaleString('da-DK')} kr</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${isOverGoal ? 'text-emerald-400 animate-glow' : 'text-white/95'}`}>
                          <AnimatedNumber value={person.db} suffix=" kr" />
                        </div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <AnimatedProgressBar progress={progressPct} isLeader={index === 0} color="teal" />
                    </div>
                  </AnimatedCard>
                );
              })}
            </div>
          </div>
          
          {/* RIGHT COLUMN: Yearly Budget + Hall of Fame */}
          <div className="flex flex-col gap-3 min-h-0">
            
            {/* Fiscal Half-Year Budget Section */}
            <div className="backdrop-blur-xl bg-indigo-500/[0.06] rounded-2xl p-4 border border-indigo-400/20 shadow-[0_0_40px_rgba(99,102,241,0.08)] animate-slide-up-delayed flex-1 min-h-0 flex flex-col">
              <h2 className="text-2xl font-semibold mb-2 text-indigo-200/90 tracking-wide">📊 Budget {yearlyData?.fiscalPeriod || 'H1'} {yearlyData?.year || 2026}</h2>
              <div className="space-y-2 overflow-hidden flex-1">
                {(yearlyData?.sellers || []).map((seller, index) => {
                  const progressPct = Math.min(seller.yearlyProgress, 100);
                  const remaining = seller.yearlyGoal - seller.ytd;
                  const currentMonthIdx = new Date().getMonth();
                  // Expected YTD = monthly goal * months elapsed in fiscal period (Jan=1, Feb=2, etc.)
                  const fiscalMonthsElapsed = Math.min(currentMonthIdx + 1, 6);
                  const expectedYtd = seller.monthlyGoal * fiscalMonthsElapsed;
                  const isAhead = seller.ytd >= expectedYtd;
                  
                  return (
                    <AnimatedCard key={seller.name} index={index} className="backdrop-blur-xl bg-white/[0.03] rounded-xl p-3 border border-white/[0.08]">
                      <div className="flex items-center gap-3">
                        {/* Name + YTD */}
                        <div className="w-[140px] shrink-0">
                          <div className="text-lg font-semibold text-white/90">{seller.name}</div>
                          <div className={`text-base font-bold ${isAhead ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {seller.ytd.toLocaleString('da-DK')} kr
                          </div>
                        </div>
                        
                        {/* Mini bar chart */}
                        <div className="flex-1">
                          <MiniBarChart months={seller.months} monthlyGoal={seller.monthlyGoal} />
                        </div>
                        
                        {/* Progress circle */}
                        <div className="w-[60px] h-[60px] shrink-0 relative">
                          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                            <circle
                              cx="18" cy="18" r="15.5" fill="none"
                              stroke={isAhead ? '#34d399' : '#fbbf24'}
                              strokeWidth="3"
                              strokeDasharray={`${progressPct * 0.975} 100`}
                              strokeLinecap="round"
                              className="transition-all duration-1000"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className={`text-sm font-bold ${isAhead ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {Math.round(seller.yearlyProgress)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </AnimatedCard>
                  );
                })}
                
                {/* Former sellers aggregated row */}
                {yearlyData?.formerSellers && yearlyData.formerSellers.ytd > 0 && (
                  <div className="backdrop-blur-xl bg-white/[0.02] rounded-xl p-2 border border-white/[0.05]">
                    <div className="flex items-center gap-3">
                      <div className="w-[140px] shrink-0">
                        <div className="text-sm font-medium text-white/50">Tidl. sælgere</div>
                        <div className="text-xs text-white/40">
                          {yearlyData.formerSellers.ytd.toLocaleString('da-DK')} kr
                        </div>
                      </div>
                      <div className="flex-1">
                        <MiniBarChart months={yearlyData.formerSellers.months} monthlyGoal={200000} />
                      </div>
                      <div className="w-[60px] shrink-0 text-center">
                        <span className="text-sm text-white/30">—</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Hall of Fame Section */}
            {hallOfFame.length > 0 && (
              <div className="backdrop-blur-xl bg-amber-500/[0.04] rounded-2xl p-4 border border-amber-400/20 shadow-[0_0_40px_rgba(251,191,36,0.06)] animate-fade-in-delayed shrink-0">
                <h2 className="text-2xl font-semibold mb-2 text-amber-200/90 tracking-wide">🏅 Hall of Fame {hallOfFame[0]?.year || ''}</h2>
                <div className="grid grid-cols-3 gap-2">
                  {hallOfFame.map((entry, index) => (
                    <div key={entry.monthKey} className="backdrop-blur-xl bg-white/[0.03] rounded-xl p-2 border border-amber-300/15">
                      <div className="text-sm text-amber-300/70 font-semibold mb-1">{entry.monthLabel}</div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-base text-white/80 flex items-center gap-1">
                            <span className="text-amber-400">🥇</span> {entry.first.name}
                          </span>
                          <span className="text-sm text-teal-300/90 font-semibold">
                            {(entry.first.db / 1000).toFixed(0)}k
                          </span>
                        </div>
                        {entry.second.name !== '-' && (
                          <div className="flex items-center justify-between">
                            <span className="text-base text-white/60 flex items-center gap-1">
                              <span className="text-slate-300">🥈</span> {entry.second.name}
                            </span>
                            <span className="text-sm text-white/50 font-semibold">
                              {(entry.second.db / 1000).toFixed(0)}k
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Activity Feed */}
      <ActivityFeed activities={recentSales} data={data} />
      
      {/* CSS Animations */}
      <style jsx global>{`
        .bg-gradient-animate {
          background: linear-gradient(-45deg, #0f172a, #1e1b4b, #0f172a, #134e4a, #0f172a, #1e1b4b, #0f172a);
          background-size: 400% 400%;
          animation: gradient-shift 15s ease infinite;
        }
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .confetti-piece {
          position: absolute; width: 10px; height: 10px; top: -10px;
          animation: confetti-fall 3s ease-out forwards;
        }
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes fire-flicker {
          0%, 100% { transform: scale(1) rotate(-5deg); }
          25% { transform: scale(1.1) rotate(5deg); }
          50% { transform: scale(1) rotate(-3deg); }
          75% { transform: scale(1.15) rotate(3deg); }
        }
        .animate-fire { animation: fire-flicker 0.5s ease-in-out infinite; }
        @keyframes bounce-in {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-bounce-in { animation: bounce-in 0.4s ease-out; }
        @keyframes slide-in-up {
          0% { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-in-up { animation: slide-in-up 0.5s ease-out; }
        .particle {
          position: absolute; width: 4px; height: 4px;
          background: rgba(255, 255, 255, 0.3); border-radius: 50%;
          animation: particle-float 20s infinite linear;
        }
        .particle-1 { left: 10%; top: 20%; animation-delay: 0s; animation-duration: 25s; }
        .particle-2 { left: 30%; top: 80%; animation-delay: -5s; animation-duration: 20s; }
        .particle-3 { left: 60%; top: 50%; animation-delay: -10s; animation-duration: 28s; }
        .particle-4 { left: 85%; top: 30%; animation-delay: -7s; animation-duration: 22s; }
        @keyframes particle-float {
          0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { transform: translateY(-100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0) translateX(0) scale(1); }
          50% { transform: translateY(-25px) translateX(5px) scale(1); }
        }
        @keyframes float-slow-reverse {
          0%, 100% { transform: translateY(0) translateX(0) scale(1); }
          50% { transform: translateY(25px) translateX(-5px) scale(1); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.1); }
        }
        .animate-pulse-glow { animation: pulse-glow 4s ease-in-out infinite; }
        .animate-pulse-glow-delayed { animation: pulse-glow 4s ease-in-out infinite 2s; }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce-subtle {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        @keyframes glow {
          0%, 100% { text-shadow: 0 0 10px rgba(52, 211, 153, 0.5); }
          50% { text-shadow: 0 0 25px rgba(52, 211, 153, 0.9), 0 0 40px rgba(52, 211, 153, 0.5); }
        }
        @keyframes pulse-subtle {
          0%, 100% { opacity: 1; box-shadow: 0 0 10px currentColor; }
          50% { opacity: 0.85; box-shadow: 0 0 20px currentColor; }
        }
        .animate-float-slow { animation: float-slow 8s ease-in-out infinite; }
        .animate-float-slow-reverse { animation: float-slow-reverse 10s ease-in-out infinite; }
        .animate-fade-in { animation: fade-in 0.6s ease-out; }
        .animate-fade-in-delayed { animation: fade-in 0.6s ease-out 0.3s both; }
        .animate-slide-up { animation: slide-up 0.6s ease-out; }
        .animate-slide-up-delayed { animation: slide-up 0.6s ease-out 0.15s both; }
        .animate-bounce-subtle { animation: bounce-subtle 2s ease-in-out infinite; }
        .animate-glow { animation: glow 2s ease-in-out infinite; }
        .animate-pulse-subtle { animation: pulse-subtle 3s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
