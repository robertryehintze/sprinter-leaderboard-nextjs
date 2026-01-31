'use client';

import { useState, useEffect, useRef } from 'react';
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
const DB_GOAL = 100000;
const MEETINGS_GOAL = 6;

// Animated Number Counter Hook
const useAnimatedNumber = (targetValue: number, duration: number = 1500) => {
  const [displayValue, setDisplayValue] = useState(0);
  const previousValue = useRef(0);
  
  useEffect(() => {
    const startValue = previousValue.current;
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentValue = startValue + (targetValue - startValue) * easeOutQuart;
      
      setDisplayValue(Math.round(currentValue));
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        previousValue.current = targetValue;
      }
    };
    
    requestAnimationFrame(animate);
  }, [targetValue, duration]);
  
  return displayValue;
};

// Get current month name in Danish
const getCurrentMonthName = () => {
  const monthNames = ['Januar', 'Februar', 'Marts', 'April', 'Maj', 'Juni', 
                      'Juli', 'August', 'September', 'Oktober', 'November', 'December'];
  const now = new Date();
  return `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
};

// Animated Card Component
const AnimatedCard = ({ 
  children, 
  index, 
  className 
}: { 
  children: React.ReactNode; 
  index: number; 
  className: string;
}) => {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), index * 100);
    return () => clearTimeout(timer);
  }, [index]);
  
  return (
    <div 
      className={`${className} transform transition-all duration-500 ease-out ${
        isVisible 
          ? 'opacity-100 translate-y-0' 
          : 'opacity-0 translate-y-4'
      }`}
    >
      {children}
    </div>
  );
};

// Animated Progress Bar Component
const AnimatedProgressBar = ({ 
  progress, 
  isLeader, 
  color 
}: { 
  progress: number; 
  isLeader: boolean;
  color: 'teal' | 'indigo';
}) => {
  const [width, setWidth] = useState(0);
  
  useEffect(() => {
    const timer = setTimeout(() => setWidth(Math.min(progress, 100)), 300);
    return () => clearTimeout(timer);
  }, [progress]);
  
  const gradientClass = color === 'teal'
    ? isLeader 
      ? 'bg-gradient-to-r from-teal-400/80 to-teal-300/90 shadow-[0_0_12px_rgba(94,234,212,0.4)]' 
      : 'bg-gradient-to-r from-teal-500/60 to-teal-400/70 shadow-[0_0_8px_rgba(20,184,166,0.3)]'
    : isLeader
      ? 'bg-gradient-to-r from-indigo-400/80 to-violet-300/90 shadow-[0_0_12px_rgba(167,139,250,0.4)]' 
      : 'bg-gradient-to-r from-indigo-500/60 to-indigo-400/70 shadow-[0_0_8px_rgba(99,102,241,0.3)]';
  
  return (
    <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
      <div 
        className={`h-full rounded-full transition-all duration-1000 ease-out ${gradientClass} ${
          isLeader ? 'animate-pulse-subtle' : ''
        }`}
        style={{ width: `${width}%` }} 
      />
    </div>
  );
};

// Animated Number Display Component
const AnimatedNumber = ({ value, suffix = '' }: { value: number; suffix?: string }) => {
  const animatedValue = useAnimatedNumber(value);
  return <>{animatedValue.toLocaleString('da-DK', { maximumFractionDigits: 0 })}{suffix}</>;
};

export default function TVDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [hallOfFame, setHallOfFame] = useState<HallOfFameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [dataKey, setDataKey] = useState(0); // Force re-render for animations
  
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
      setDataKey(prev => prev + 1); // Trigger animation reset
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

  // Enhanced Glassmorphism 2.0 styles
  const getCardStyle = (index: number) => {
    const baseGlass = 'backdrop-blur-2xl bg-white/[0.04] hover:bg-white/[0.06] transition-all duration-300';
    if (index === 0) {
      return `${baseGlass} border border-amber-300/50 shadow-[0_0_30px_rgba(251,191,36,0.2),0_0_60px_rgba(251,191,36,0.1),inset_0_1px_0_rgba(255,255,255,0.15),inset_0_-1px_0_rgba(0,0,0,0.1)] hover:shadow-[0_0_40px_rgba(251,191,36,0.3),0_0_80px_rgba(251,191,36,0.15)]`;
    } else if (index === 1) {
      return `${baseGlass} border border-slate-300/40 shadow-[0_0_25px_rgba(203,213,225,0.15),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.08)] hover:shadow-[0_0_35px_rgba(203,213,225,0.2)]`;
    } else if (index === 2) {
      return `${baseGlass} border border-amber-600/40 shadow-[0_0_22px_rgba(217,119,6,0.15),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.08)] hover:shadow-[0_0_30px_rgba(217,119,6,0.2)]`;
    } else {
      return `${baseGlass} border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.05)] hover:border-white/[0.18]`;
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white/80 text-2xl animate-pulse">Indlæser...</div>
      </div>
    );
  }
  
  if (!data) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-red-400/80 text-2xl">Fejl ved indlæsning</div>;
  }

  const meetingsLeaderboard = [...data.leaderboard].sort((a, b) => b.meetings - a.meetings);
  const currentMonth = getCurrentMonthName();
  
  return (
    <div className="min-h-screen text-white p-4 md:p-8 overflow-hidden relative">
      {/* Animated Gradient Background */}
      <div className="fixed inset-0 bg-gradient-animate" />
      
      {/* Particle Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Floating particles */}
        <div className="particle particle-1" />
        <div className="particle particle-2" />
        <div className="particle particle-3" />
        <div className="particle particle-4" />
        <div className="particle particle-5" />
        <div className="particle particle-6" />
        <div className="particle particle-7" />
        <div className="particle particle-8" />
        
        {/* Animated glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/8 rounded-full blur-3xl animate-float-slow animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/8 rounded-full blur-3xl animate-float-slow-reverse animate-pulse-glow-delayed" />
        <div className="absolute top-3/4 left-1/2 w-64 h-64 bg-amber-500/6 rounded-full blur-3xl animate-float-medium" />
        <div className="absolute top-1/2 right-1/3 w-48 h-48 bg-violet-500/5 rounded-full blur-3xl animate-float-slow" />
      </div>
      
      <div className="relative z-10">
        {/* Header with fade-in */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4 animate-fade-in">
          <h1 className="text-3xl md:text-5xl font-bold text-white/95 tracking-tight">🏆 Sprinter Leaderboard</h1>
          <div className="text-left md:text-right flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-0">
            <Link href="/input" className="px-4 md:px-6 py-2 md:py-3 bg-white/10 backdrop-blur-xl border border-white/20 text-white rounded-xl font-semibold hover:bg-white/15 hover:scale-105 transition-all duration-300 inline-block md:mb-2 shadow-[0_0_20px_rgba(255,255,255,0.05)] text-sm md:text-base">
              ➕ Tilføj Salg
            </Link>
            <div className="text-xs md:text-sm text-white/40">Opdateret: {lastUpdated.toLocaleTimeString('da-DK')}</div>
          </div>
        </div>
        
        {/* Leaderboards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 mb-6 md:mb-8">
          {/* DB Leaderboard */}
          <div className="backdrop-blur-xl bg-teal-500/[0.06] rounded-2xl md:rounded-3xl p-4 md:p-6 border border-teal-400/20 shadow-[0_0_40px_rgba(20,184,166,0.08)] animate-slide-up">
            <h2 className="text-lg md:text-2xl font-semibold mb-3 md:mb-5 text-teal-200/90 tracking-wide">💰 DB Leaderboard - {currentMonth}</h2>
            <div className="space-y-3" key={`db-${dataKey}`}>
              {data.leaderboard.map((person, index) => {
                const isOverGoal = person.db >= DB_GOAL;
                const missingAmount = DB_GOAL - person.db;
                
                return (
                  <AnimatedCard 
                    key={person.name} 
                    index={index}
                    className={`p-3 md:p-4 rounded-xl md:rounded-2xl ${getCardStyle(index)}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 md:gap-4 flex-1">
                        <div className={`text-xl md:text-3xl font-bold w-8 md:w-12 text-center ${index === 0 ? 'animate-bounce-subtle' : ''}`}>
                          {getMedal(index)}
                        </div>
                        <div>
                          <div className="text-base md:text-xl font-semibold text-white/95">{person.name}</div>
                          <div className="text-[10px] md:text-xs text-white/40 font-medium">
                            <AnimatedNumber value={Math.round(person.goalProgress * 10) / 10} />% af mål
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg md:text-2xl font-bold ${isOverGoal ? 'text-emerald-400 animate-glow' : 'text-white/95'}`}>
                          <AnimatedNumber value={person.db} suffix=" kr" />
                        </div>
                        {!isOverGoal && (
                          <div className="text-[10px] md:text-xs text-white/30 font-medium">
                            mangler <AnimatedNumber value={missingAmount} suffix=" kr" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-3">
                      <AnimatedProgressBar 
                        progress={person.goalProgress} 
                        isLeader={index === 0}
                        color="teal"
                      />
                    </div>
                  </AnimatedCard>
                );
              })}
            </div>
          </div>

          {/* Meetings Leaderboard */}
          <div className="backdrop-blur-xl bg-indigo-500/[0.06] rounded-2xl md:rounded-3xl p-4 md:p-6 border border-indigo-400/20 shadow-[0_0_40px_rgba(99,102,241,0.08)] animate-slide-up-delayed">
            <h2 className="text-lg md:text-2xl font-semibold mb-3 md:mb-5 text-indigo-200/90 tracking-wide">📅 Møde Leaderboard - {currentMonth}</h2>
            <div className="space-y-3" key={`meetings-${dataKey}`}>
              {meetingsLeaderboard.map((person, index) => {
                const isOverGoal = person.meetings >= MEETINGS_GOAL;
                const meetingProgress = (person.meetings / MEETINGS_GOAL) * 100;
                
                return (
                  <AnimatedCard 
                    key={person.name} 
                    index={index}
                    className={`p-3 md:p-4 rounded-xl md:rounded-2xl ${getCardStyle(index)}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 md:gap-4 flex-1">
                        <div className={`text-xl md:text-3xl font-bold w-8 md:w-12 text-center ${index === 0 ? 'animate-bounce-subtle' : ''}`}>
                          {getMedal(index)}
                        </div>
                        <div>
                          <div className="text-base md:text-xl font-semibold text-white/95">{person.name}</div>
                          <div className="text-[10px] md:text-xs text-white/40 font-medium">
                            <span className={isOverGoal ? 'text-emerald-400' : 'text-white/40'}>{person.meetings}</span>
                            <span className="text-white/40">/{MEETINGS_GOAL} møder</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg md:text-2xl font-bold ${isOverGoal ? 'text-emerald-400 animate-glow' : 'text-white/95'}`}>
                          {person.meetings} {person.meetings === 1 ? 'møde' : 'møder'}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <AnimatedProgressBar 
                        progress={meetingProgress} 
                        isLeader={index === 0}
                        color="indigo"
                      />
                    </div>
                  </AnimatedCard>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Hall of Fame Section */}
        {hallOfFame.length > 0 && (
          <div className="mb-6 md:mb-8 animate-fade-in-delayed">
            <div className="backdrop-blur-xl bg-amber-500/[0.04] rounded-2xl md:rounded-3xl p-4 md:p-6 border border-amber-400/20 shadow-[0_0_40px_rgba(251,191,36,0.06)]">
              <h2 className="text-lg md:text-2xl font-semibold mb-3 md:mb-5 text-amber-200/90 tracking-wide">🏅 Hall of Fame</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {hallOfFame.slice(0, 6).map((entry, index) => (
                  <AnimatedCard
                    key={entry.monthKey}
                    index={index}
                    className="backdrop-blur-xl bg-white/[0.03] rounded-2xl p-4 border border-amber-300/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                  >
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
                          {entry.meetingsWinner.meetings} møder
                        </span>
                      </div>
                    </div>
                  </AnimatedCard>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2 md:gap-6 animate-slide-up-more-delayed">
          <div className="backdrop-blur-xl bg-white/[0.03] rounded-xl md:rounded-2xl p-3 md:p-6 text-center border border-teal-400/15 shadow-[0_0_30px_rgba(20,184,166,0.08),inset_0_1px_0_rgba(255,255,255,0.05)] hover:scale-105 transition-transform duration-300">
            <div className="text-white/40 text-[10px] md:text-sm mb-1 md:mb-2 font-medium tracking-wide">Total DB</div>
            <div className="text-lg md:text-4xl font-bold bg-gradient-to-r from-teal-300 to-teal-200 bg-clip-text text-transparent">
              <AnimatedNumber value={data.totalDb} suffix=" kr" />
            </div>
          </div>
          <div className="backdrop-blur-xl bg-white/[0.03] rounded-xl md:rounded-2xl p-3 md:p-6 text-center border border-indigo-400/15 shadow-[0_0_30px_rgba(99,102,241,0.08),inset_0_1px_0_rgba(255,255,255,0.05)] hover:scale-105 transition-transform duration-300">
            <div className="text-white/40 text-[10px] md:text-sm mb-1 md:mb-2 font-medium tracking-wide">Total Møder</div>
            <div className="text-lg md:text-4xl font-bold bg-gradient-to-r from-indigo-300 to-violet-200 bg-clip-text text-transparent">
              <AnimatedNumber value={data.totalMeetings} />
            </div>
          </div>
          <div className="backdrop-blur-xl bg-white/[0.03] rounded-xl md:rounded-2xl p-3 md:p-6 text-center border border-amber-400/15 shadow-[0_0_30px_rgba(251,191,36,0.08),inset_0_1px_0_rgba(255,255,255,0.05)] hover:scale-105 transition-transform duration-300">
            <div className="text-white/40 text-[10px] md:text-sm mb-1 md:mb-2 font-medium tracking-wide">Retention</div>
            <div className="text-lg md:text-4xl font-bold bg-gradient-to-r from-amber-300 to-amber-200 bg-clip-text text-transparent">
              <AnimatedNumber value={data.totalRetention} suffix=" kr" />
            </div>
          </div>
        </div>
        
        <div className="fixed bottom-2 right-2 md:bottom-4 md:right-4 backdrop-blur-xl bg-white/[0.03] px-2 md:px-4 py-1 md:py-2 rounded-lg md:rounded-xl text-[10px] md:text-sm text-white/30 border border-white/[0.08]">
          🔄 Auto-opdatering
        </div>
      </div>
      
      {/* CSS Animations */}
      <style jsx global>{`
        /* Animated Gradient Background */
        .bg-gradient-animate {
          background: linear-gradient(-45deg, 
            #0f172a, #1e1b4b, #0f172a, #134e4a, 
            #0f172a, #1e1b4b, #0f172a);
          background-size: 400% 400%;
          animation: gradient-shift 15s ease infinite;
        }
        
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        
        /* Particle Effects */
        .particle {
          position: absolute;
          width: 4px;
          height: 4px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          animation: particle-float 20s infinite linear;
        }
        
        .particle-1 { left: 10%; top: 20%; animation-delay: 0s; animation-duration: 25s; }
        .particle-2 { left: 20%; top: 80%; animation-delay: -5s; animation-duration: 20s; }
        .particle-3 { left: 35%; top: 50%; animation-delay: -10s; animation-duration: 28s; }
        .particle-4 { left: 50%; top: 30%; animation-delay: -7s; animation-duration: 22s; }
        .particle-5 { left: 65%; top: 70%; animation-delay: -3s; animation-duration: 26s; }
        .particle-6 { left: 80%; top: 40%; animation-delay: -12s; animation-duration: 24s; }
        .particle-7 { left: 90%; top: 60%; animation-delay: -8s; animation-duration: 21s; }
        .particle-8 { left: 45%; top: 10%; animation-delay: -15s; animation-duration: 27s; }
        
        @keyframes particle-float {
          0% {
            transform: translateY(100vh) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 0.6;
          }
          90% {
            opacity: 0.6;
          }
          100% {
            transform: translateY(-100vh) rotate(720deg);
            opacity: 0;
          }
        }
        
        /* Enhanced floating animations */
        @keyframes float-slow {
          0%, 100% { transform: translateY(0) translateX(0) scale(1); }
          25% { transform: translateY(-15px) translateX(10px) scale(1.02); }
          50% { transform: translateY(-25px) translateX(5px) scale(1); }
          75% { transform: translateY(-10px) translateX(-5px) scale(0.98); }
        }
        @keyframes float-slow-reverse {
          0%, 100% { transform: translateY(0) translateX(0) scale(1); }
          25% { transform: translateY(15px) translateX(-10px) scale(0.98); }
          50% { transform: translateY(25px) translateX(-5px) scale(1); }
          75% { transform: translateY(10px) translateX(5px) scale(1.02); }
        }
        @keyframes float-medium {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-20px) scale(1.05); }
        }
        
        /* Pulse glow for orbs */
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.1); }
        }
        .animate-pulse-glow { animation: pulse-glow 4s ease-in-out infinite; }
        .animate-pulse-glow-delayed { animation: pulse-glow 4s ease-in-out infinite 2s; }
        
        /* Card and element animations */
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
          50% { text-shadow: 0 0 25px rgba(52, 211, 153, 0.9), 0 0 40px rgba(52, 211, 153, 0.5), 0 0 60px rgba(52, 211, 153, 0.3); }
        }
        @keyframes pulse-subtle {
          0%, 100% { opacity: 1; box-shadow: 0 0 10px currentColor; }
          50% { opacity: 0.85; box-shadow: 0 0 20px currentColor; }
        }
        
        /* Shimmer effect for glass cards */
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        
        .animate-float-slow { animation: float-slow 8s ease-in-out infinite; }
        .animate-float-slow-reverse { animation: float-slow-reverse 10s ease-in-out infinite; }
        .animate-float-medium { animation: float-medium 6s ease-in-out infinite; }
        .animate-fade-in { animation: fade-in 0.6s ease-out; }
        .animate-fade-in-delayed { animation: fade-in 0.6s ease-out 0.3s both; }
        .animate-slide-up { animation: slide-up 0.6s ease-out; }
        .animate-slide-up-delayed { animation: slide-up 0.6s ease-out 0.15s both; }
        .animate-slide-up-more-delayed { animation: slide-up 0.6s ease-out 0.3s both; }
        .animate-bounce-subtle { animation: bounce-subtle 2s ease-in-out infinite; }
        .animate-glow { animation: glow 2s ease-in-out infinite; }
        .animate-pulse-subtle { animation: pulse-subtle 3s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
