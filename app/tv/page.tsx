'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface SalespersonData {
  name: string;
  db: number;
  meetings: number;
  retention: number;
  goalProgress: number;
}

interface DashboardData {
  leaderboard: SalespersonData[];
  totalDb: number;
  totalMeetings: number;
  totalRetention: number;
}

interface HallOfFameEntry {
  monthKey: string;
  monthLabel: string;
  dbWinner: { name: string; db: number };
  meetingsWinner: { name: string; meetings: number };
}

// Goals
const DB_GOAL = 100000; // 100.000 kr monthly DB goal
const MEETINGS_GOAL = 6; // 6 meetings monthly goal

// Get current month name in Danish
const getCurrentMonthName = () => {
  const monthNames = ['Januar', 'Februar', 'Marts', 'April', 'Maj', 'Juni', 
                      'Juli', 'August', 'September', 'Oktober', 'November', 'December'];
  const now = new Date();
  return `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
};

export default function TVDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [hallOfFame, setHallOfFame] = useState<HallOfFameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  const fetchData = async () => {
    try {
      const [dashboardRes, hofRes] = await Promise.all([
        fetch('/api/dashboard?timePeriod=monthly'),
        fetch('/api/hall-of-fame')
      ]);
      
      const dashboardData = await dashboardRes.json();
      const hofData = await hofRes.json();
      
      setData(dashboardData);
      setHallOfFame(Array.isArray(hofData) ? hofData : []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);
  
  const getMedal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;

  // Premium glass card styles with subtle, desaturated colors
  const getCardStyle = (index: number) => {
    const baseGlass = 'backdrop-blur-xl bg-white/[0.03]';
    if (index === 0) {
      return `${baseGlass} border border-amber-300/40 shadow-[0_0_25px_rgba(251,191,36,0.15),inset_0_1px_0_rgba(255,255,255,0.1)]`;
    } else if (index === 1) {
      return `${baseGlass} border border-slate-300/30 shadow-[0_0_20px_rgba(203,213,225,0.1),inset_0_1px_0_rgba(255,255,255,0.08)]`;
    } else if (index === 2) {
      return `${baseGlass} border border-amber-600/30 shadow-[0_0_18px_rgba(217,119,6,0.12),inset_0_1px_0_rgba(255,255,255,0.06)]`;
    } else {
      return `${baseGlass} border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`;
    }
  };
  
  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white/80 text-2xl">Indlæser...</div>;
  }
  
  if (!data) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-red-400/80 text-2xl">Fejl ved indlæsning</div>;
  }

  // Sort by meetings for meetings leaderboard
  const meetingsLeaderboard = [...data.leaderboard].sort((a, b) => b.meetings - a.meetings);
  const currentMonth = getCurrentMonthName();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 md:p-8">
      {/* Subtle background glow effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
        <div className="absolute top-3/4 left-1/2 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl" />
      </div>
      
      <div className="relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
          <h1 className="text-3xl md:text-5xl font-bold text-white/95 tracking-tight">🏆 Sprinter Leaderboard</h1>
          <div className="text-left md:text-right flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-0">
            <Link href="/input" className="px-4 md:px-6 py-2 md:py-3 bg-white/10 backdrop-blur-xl border border-white/20 text-white rounded-xl font-semibold hover:bg-white/15 transition-all duration-300 inline-block md:mb-2 shadow-[0_0_20px_rgba(255,255,255,0.05)] text-sm md:text-base">
              ➕ Tilføj Salg
            </Link>
            <div className="text-xs md:text-sm text-white/40">Opdateret: {lastUpdated.toLocaleTimeString('da-DK')}</div>
          </div>
        </div>
        
        {/* Responsive layout: 1 column on mobile, 2 columns on tablet+ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 mb-6 md:mb-8">
          {/* DB Leaderboard */}
          <div className="backdrop-blur-xl bg-teal-500/[0.06] rounded-2xl md:rounded-3xl p-4 md:p-6 border border-teal-400/20 shadow-[0_0_40px_rgba(20,184,166,0.08)]">
            <h2 className="text-lg md:text-2xl font-semibold mb-3 md:mb-5 text-teal-200/90 tracking-wide">💰 DB Leaderboard - {currentMonth}</h2>
            <div className="space-y-3">
              {data.leaderboard.map((person, index) => {
                const isOverGoal = person.db >= DB_GOAL;
                const missingAmount = DB_GOAL - person.db;
                
                return (
                  <div key={person.name} className={`p-3 md:p-4 rounded-xl md:rounded-2xl transition-all duration-500 ${getCardStyle(index)}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 md:gap-4 flex-1">
                        <div className="text-xl md:text-3xl font-bold w-8 md:w-12 text-center opacity-90">{getMedal(index)}</div>
                        <div>
                          <div className="text-base md:text-xl font-semibold text-white/95">{person.name}</div>
                          <div className="text-[10px] md:text-xs text-white/40 font-medium">{person.goalProgress.toFixed(1)}% af mål</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg md:text-2xl font-bold ${isOverGoal ? 'text-emerald-400' : 'text-white/95'}`}>
                          {person.db.toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr
                        </div>
                        {!isOverGoal && (
                          <div className="text-[10px] md:text-xs text-white/30 font-medium">
                            mangler {missingAmount.toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${
                          index === 0 
                            ? 'bg-gradient-to-r from-teal-400/80 to-teal-300/90 shadow-[0_0_12px_rgba(94,234,212,0.4)]' 
                            : 'bg-gradient-to-r from-teal-500/60 to-teal-400/70 shadow-[0_0_8px_rgba(20,184,166,0.3)]'
                        }`}
                          style={{ width: `${Math.min(person.goalProgress, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Meetings Leaderboard */}
          <div className="backdrop-blur-xl bg-indigo-500/[0.06] rounded-2xl md:rounded-3xl p-4 md:p-6 border border-indigo-400/20 shadow-[0_0_40px_rgba(99,102,241,0.08)]">
            <h2 className="text-lg md:text-2xl font-semibold mb-3 md:mb-5 text-indigo-200/90 tracking-wide">📅 Møde Leaderboard - {currentMonth}</h2>
            <div className="space-y-3">
              {meetingsLeaderboard.map((person, index) => {
                const isOverGoal = person.meetings >= MEETINGS_GOAL;
                
                return (
                  <div key={person.name} className={`p-3 md:p-4 rounded-xl md:rounded-2xl transition-all duration-500 ${getCardStyle(index)}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 md:gap-4 flex-1">
                        <div className="text-xl md:text-3xl font-bold w-8 md:w-12 text-center opacity-90">{getMedal(index)}</div>
                        <div>
                          <div className="text-base md:text-xl font-semibold text-white/95">{person.name}</div>
                          <div className="text-[10px] md:text-xs text-white/40 font-medium">
                            <span className={isOverGoal ? 'text-emerald-400' : 'text-white/40'}>{person.meetings}</span>
                            <span className="text-white/40">/{MEETINGS_GOAL} møder</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg md:text-2xl font-bold ${isOverGoal ? 'text-emerald-400' : 'text-white/95'}`}>
                          {person.meetings} {person.meetings === 1 ? 'møde' : 'møder'}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${
                          index === 0 
                            ? 'bg-gradient-to-r from-indigo-400/80 to-violet-300/90 shadow-[0_0_12px_rgba(167,139,250,0.4)]' 
                            : 'bg-gradient-to-r from-indigo-500/60 to-indigo-400/70 shadow-[0_0_8px_rgba(99,102,241,0.3)]'
                        }`}
                          style={{ width: `${Math.min((person.meetings / MEETINGS_GOAL) * 100, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Hall of Fame Section */}
        {hallOfFame.length > 0 && (
          <div className="mb-6 md:mb-8">
            <div className="backdrop-blur-xl bg-amber-500/[0.04] rounded-2xl md:rounded-3xl p-4 md:p-6 border border-amber-400/20 shadow-[0_0_40px_rgba(251,191,36,0.06)]">
              <h2 className="text-lg md:text-2xl font-semibold mb-3 md:mb-5 text-amber-200/90 tracking-wide">🏅 Hall of Fame</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {hallOfFame.slice(0, 6).map((entry) => (
                  <div key={entry.monthKey} className="backdrop-blur-xl bg-white/[0.03] rounded-2xl p-4 border border-amber-300/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <div className="text-sm text-amber-300/80 font-semibold mb-3">{entry.monthLabel}</div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">💰</span>
                          <span className="text-white/80 text-sm">{entry.dbWinner.name}</span>
                        </div>
                        <span className="text-teal-300/90 text-sm font-semibold">
                          {entry.dbWinner.db.toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📅</span>
                          <span className="text-white/80 text-sm">{entry.meetingsWinner.name}</span>
                        </div>
                        <span className="text-indigo-300/90 text-sm font-semibold">
                          {entry.meetingsWinner.meetings} {entry.meetingsWinner.meetings === 1 ? 'møde' : 'møder'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {hallOfFame.length === 0 && (
                <div className="text-center text-white/40 py-8">
                  Ingen tidligere vindere endnu - første måned!
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Summary stats with premium glass effect */}
        <div className="grid grid-cols-3 gap-2 md:gap-6">
          <div className="backdrop-blur-xl bg-white/[0.03] rounded-xl md:rounded-2xl p-3 md:p-6 text-center border border-teal-400/15 shadow-[0_0_30px_rgba(20,184,166,0.08),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="text-white/40 text-[10px] md:text-sm mb-1 md:mb-2 font-medium tracking-wide">Total DB</div>
            <div className="text-lg md:text-4xl font-bold bg-gradient-to-r from-teal-300 to-teal-200 bg-clip-text text-transparent">{data.totalDb.toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr</div>
          </div>
          <div className="backdrop-blur-xl bg-white/[0.03] rounded-xl md:rounded-2xl p-3 md:p-6 text-center border border-indigo-400/15 shadow-[0_0_30px_rgba(99,102,241,0.08),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="text-white/40 text-[10px] md:text-sm mb-1 md:mb-2 font-medium tracking-wide">Total Møder</div>
            <div className="text-lg md:text-4xl font-bold bg-gradient-to-r from-indigo-300 to-violet-200 bg-clip-text text-transparent">{data.totalMeetings}</div>
          </div>
          <div className="backdrop-blur-xl bg-white/[0.03] rounded-xl md:rounded-2xl p-3 md:p-6 text-center border border-amber-400/15 shadow-[0_0_30px_rgba(251,191,36,0.08),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="text-white/40 text-[10px] md:text-sm mb-1 md:mb-2 font-medium tracking-wide">Retention</div>
            <div className="text-lg md:text-4xl font-bold bg-gradient-to-r from-amber-300 to-amber-200 bg-clip-text text-transparent">{data.totalRetention.toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr</div>
          </div>
        </div>
        
        <div className="fixed bottom-2 right-2 md:bottom-4 md:right-4 backdrop-blur-xl bg-white/[0.03] px-2 md:px-4 py-1 md:py-2 rounded-lg md:rounded-xl text-[10px] md:text-sm text-white/30 border border-white/[0.08]">
          🔄 Auto-opdatering
        </div>
      </div>
    </div>
  );
}
