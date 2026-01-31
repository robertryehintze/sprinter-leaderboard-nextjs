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
        <div className="bg-gray-800 rounded-2xl p-6">
          <h2 className="text-2xl font-bold mb-4">💰 DB Leaderboard - Januar 2026</h2>
          <div className="space-y-3">
            {data.leaderboard.map((person, index) => (
              <div key={person.name} className={`p-4 rounded-xl ${
                index === 0 ? 'bg-yellow-900/30 border-2 border-yellow-500' :
                index === 1 ? 'bg-gray-600/30 border-2 border-gray-400' :
                index === 2 ? 'bg-orange-900/30 border-2 border-orange-600' :
                'bg-gray-700/50 border border-gray-600'
              }`}>
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
                  <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full ${person.goalProgress >= 100 ? 'bg-green-500' : person.goalProgress >= 75 ? 'bg-yellow-500' : 'bg-primary'}`}
                      style={{ width: `${Math.min(person.goalProgress, 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Meetings Leaderboard */}
        <div className="bg-gray-800 rounded-2xl p-6">
          <h2 className="text-2xl font-bold mb-4">📅 Møde Leaderboard - Januar 2026</h2>
          <div className="space-y-3">
            {meetingsLeaderboard.map((person, index) => (
              <div key={person.name} className={`p-4 rounded-xl ${
                index === 0 ? 'bg-purple-900/30 border-2 border-purple-500' :
                index === 1 ? 'bg-gray-600/30 border-2 border-gray-400' :
                index === 2 ? 'bg-indigo-900/30 border-2 border-indigo-600' :
                'bg-gray-700/50 border border-gray-600'
              }`}>
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
                  <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500"
                      style={{ width: `${(person.meetings / maxMeetings) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-gray-800 rounded-xl p-6 text-center">
          <div className="text-gray-400 text-sm mb-2">Total DB</div>
          <div className="text-4xl font-bold text-green-500">{data.totalDb.toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr</div>
        </div>
        <div className="bg-gray-800 rounded-xl p-6 text-center">
          <div className="text-gray-400 text-sm mb-2">Total Møder</div>
          <div className="text-4xl font-bold text-purple-500">{data.totalMeetings}</div>
        </div>
        <div className="bg-gray-800 rounded-xl p-6 text-center">
          <div className="text-gray-400 text-sm mb-2">Total Retention</div>
          <div className="text-4xl font-bold text-yellow-500">{data.totalRetention.toLocaleString('da-DK', { maximumFractionDigits: 0 })} kr</div>
        </div>
      </div>
      
      <div className="fixed bottom-4 right-4 bg-gray-800 px-4 py-2 rounded-lg text-sm text-gray-400">
        🔄 Auto-opdatering hver 30 sek
      </div>
    </div>
  );
}
