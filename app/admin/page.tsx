'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface SalespersonGoal {
  name: string;
  currentGoal: number;
  currentDb: number;
  budgetInfo: {
    workdaysInMonth: number;
    workdaysElapsed: number;
    workdaysRemaining: number;
    dailyTarget: number;
    expectedBudget: number;
    actualDb: number;
    difference: number;
    isUnderBudget: boolean;
    requiredDailyToHitGoal: number;
  };
}

export default function AdminPage() {
  const [goals, setGoals] = useState<SalespersonGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingGoals, setEditingGoals] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    try {
      const response = await fetch('/api/goals');
      const data = await response.json();
      setGoals(data.goals || []);
      
      // Initialize editing goals with current values
      const initialEditing: Record<string, number> = {};
      data.goals?.forEach((g: SalespersonGoal) => {
        initialEditing[g.name] = g.currentGoal;
      });
      setEditingGoals(initialEditing);
    } catch (error) {
      console.error('Failed to fetch goals:', error);
      setMessage({ type: 'error', text: 'Kunne ikke hente mål' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoalChange = (name: string, value: string) => {
    const numValue = parseInt(value.replace(/\D/g, '')) || 0;
    setEditingGoals(prev => ({ ...prev, [name]: numValue }));
  };

  const saveGoal = async (name: string) => {
    const newGoal = editingGoals[name];
    if (!newGoal || newGoal < 0) {
      setMessage({ type: 'error', text: 'Ugyldigt mål' });
      return;
    }

    setSaving(name);
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, goal: newGoal }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: `Mål for ${name} opdateret til ${newGoal.toLocaleString('da-DK')} kr` });
        // Refresh data
        await fetchGoals();
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Kunne ikke gemme mål for ${name}` });
    } finally {
      setSaving(null);
    }
  };

  const formatNumber = (num: number) => num.toLocaleString('da-DK');

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Indlæser...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-white">⚙️ Admin - Salgsmål</h1>
          <Link 
            href="/tv" 
            className="px-4 py-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 rounded-lg transition-colors"
          >
            ← Tilbage til TV
          </Link>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* Workday Info */}
        {goals.length > 0 && (
          <div className="mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
            <h2 className="text-lg font-semibold text-slate-300 mb-2">📅 Arbejdsdage denne måned</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-white">{goals[0]?.budgetInfo.workdaysInMonth || 0}</div>
                <div className="text-xs text-slate-400">Total arbejdsdage</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-teal-400">{goals[0]?.budgetInfo.workdaysElapsed || 0}</div>
                <div className="text-xs text-slate-400">Dage brugt</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-400">{goals[0]?.budgetInfo.workdaysRemaining || 0}</div>
                <div className="text-xs text-slate-400">Dage tilbage</div>
              </div>
            </div>
          </div>
        )}

        {/* Goals Table */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Sælger</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">Månedsmål</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">Forventet nu</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">Faktisk DB</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">Status</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300">Handling</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {goals.map((person) => {
                const isEdited = editingGoals[person.name] !== person.currentGoal;
                const budgetDiff = person.budgetInfo.difference;
                
                return (
                  <tr key={person.name} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{person.name}</span>
                        {person.budgetInfo.isUnderBudget && (
                          <span className="text-lg" title="Under budget">👊👴🏻</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <input
                        type="text"
                        value={formatNumber(editingGoals[person.name] || 0)}
                        onChange={(e) => handleGoalChange(person.name, e.target.value)}
                        className="w-32 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-right text-white focus:outline-none focus:border-teal-500"
                      />
                      <span className="text-slate-400 ml-1">kr</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="text-slate-300">{formatNumber(person.budgetInfo.expectedBudget)} kr</div>
                      <div className="text-xs text-slate-500">
                        {formatNumber(person.budgetInfo.dailyTarget)} kr/dag
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="text-white font-medium">{formatNumber(person.currentDb)} kr</div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className={`font-medium ${budgetDiff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {budgetDiff >= 0 ? '+' : ''}{formatNumber(budgetDiff)} kr
                      </div>
                      {person.budgetInfo.isUnderBudget && (
                        <div className="text-xs text-amber-400">
                          Skal lave {formatNumber(person.budgetInfo.requiredDailyToHitGoal)} kr/dag
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => saveGoal(person.name)}
                        disabled={!isEdited || saving === person.name}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          isEdited
                            ? 'bg-teal-500 hover:bg-teal-600 text-white'
                            : 'bg-slate-600 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {saving === person.name ? 'Gemmer...' : 'Gem'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-6 p-4 bg-slate-800/30 rounded-xl">
          <h3 className="text-sm font-semibold text-slate-400 mb-2">Forklaring</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-slate-500">
            <div><span className="text-emerald-400">+</span> = Foran budget (godt!)</div>
            <div><span className="text-red-400">-</span> = Bagud på budget (bossen slår!)</div>
            <div><strong>Forventet nu</strong> = Månedsmål ÷ arbejdsdage × dage brugt</div>
            <div><strong>Skal lave/dag</strong> = Resterende mål ÷ dage tilbage</div>
          </div>
        </div>
      </div>
    </div>
  );
}
