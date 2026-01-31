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

export default function TVDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  const fetchData = async () => {
    try {
      const response = await fetch('/api/dashboard?timePeriod=monthly');
      const result = await response.json();
      setData(result);
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

  // Card styles with glassmorphism and fluorescent glow
  const getCardStyle = (index: number, type: 'db' | 'meetings') => {
    const baseGlass = 'backdrop-blur-md bg-white/5';
    if (index === 0) {
      return `${baseGlass} border-2 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.4)]`;
    } else if (index === 1) {
      return `${baseGlass} border-2 border-gray-300 shadow-[0_0_12px_rgba(209,213,219,0.3)]`;
    } else if (index === 2) {
      return `${baseGlass} border-2 border-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.3)]`;
    } else {
      return `${baseGlass} border border-gray-600/50`;
    }
  };
  
  if (loading) {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white text-2xl">Indlæser...</div>;
  }
  
  if (!data) {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-red-500 text-2xl">Fejl ved indlæsning</div>;
  }

  // Sort by meetings for meetings leaderboard
  const meetingsLeaderboard = [...data.leaderboard].sort((a, b) => b.meetings - a.meetings);
  const maxMeetings = Math.max(...meetingsLeaderboard.map(p => p.meetings), 1);
  
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-5xl font-bold">🏆 Sprinter Leaderboard</h1>
        <div className="text-right">
          <Link href="/input" className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:opacity-90 inline-block mb-2">
            ➕ Tilføj Salg
          </Link>
          <div className="text-sm text-gray-400">Opdateret: {lastUpdated.toLocaleTimeString('da-DK')}</div>
        </div>
      </div>
      
      {/* Two-column layout for leaderboards */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        {/* DB Leaderboard */}
        <div className="bg-gray-800/40 backdrop-blur-sm rounded-2xl p-6 border border-emerald-500/20">
          <h2 className="text-2xl font-bold mb-4 text-emerald-300">💰 DB Leaderboard - Januar 2026</h2>
          <div className="space-y-3">
            {data.leaderboard.map((person, index) => (
              <div key={person.name} className={`p-4 rounded-xl transition-all duration-300 ${getCardStyle(index, 'db')}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="text-3xl font-bold w-12 text-center">{getMedal(index)}</div>
                    <div>
                      <div className="text-xl font-bold">{person.name}</div>
                      <div className="text-xs text-gray-400">{person.goalProgress.toFixed(1)}% af mål</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{person.db.toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr</div>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="h-3 bg-gray-700/50 rounded-full overflow-hidden">
                    <div className={`h-full ${person.goalProgress >= 100 ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]' : person.goalProgress >= 75 ? 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]' : 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]'}`}
                      style={{ width: `${Math.min(person.goalProgress, 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Meetings Leaderboard */}
        <div className="bg-gray-800/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-500/20">
          <h2 className="text-2xl font-bold mb-4 text-blue-300">📅 Møde Leaderboard - Januar 2026</h2>
          <div className="space-y-3">
            {meetingsLeaderboard.map((person, index) => (
              <div key={person.name} className={`p-4 rounded-xl transition-all duration-300 ${getCardStyle(index, 'meetings')}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="text-3xl font-bold w-12 text-center">{getMedal(index)}</div>
                    <div>
                      <div className="text-xl font-bold">{person.name}</div>
                      <div className="text-xs text-gray-400">{person.db.toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr DB</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{person.meetings} {person.meetings === 1 ? 'møde' : 'møder'}</div>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="h-3 bg-gray-700/50 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.6)]"
                      style={{ width: `${(person.meetings / maxMeetings) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Summary stats with glass effect */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 text-center border border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
          <div className="text-gray-400 text-sm mb-2">Total DB</div>
          <div className="text-4xl font-bold text-green-400">{data.totalDb.toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr</div>
        </div>
        <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 text-center border border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.2)]">
          <div className="text-gray-400 text-sm mb-2">Total Møder</div>
          <div className="text-4xl font-bold text-purple-400">{data.totalMeetings}</div>
        </div>
        <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 text-center border border-yellow-500/30 shadow-[0_0_20px_rgba(234,179,8,0.2)]">
          <div className="text-gray-400 text-sm mb-2">Total Retention</div>
          <div className="text-4xl font-bold text-yellow-400">{data.totalRetention.toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr</div>
        </div>
      </div>
      
      <div className="fixed bottom-4 right-4 bg-white/5 backdrop-blur-md px-4 py-2 rounded-lg text-sm text-gray-400 border border-gray-600/30">
        🔄 Auto-opdatering hver 30 sek
      </div>
    </div>
  );
}
