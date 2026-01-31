'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface MeetingMatch {
  rowIndex: number;
  date: string;
  customer: string;
  matchScore: number;
  converted: boolean;
}

export default function InputPage() {
  const [loading, setLoading] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [customerName, setCustomerName] = useState('');
  
  // Meeting matching state
  const [meetingMatches, setMeetingMatches] = useState<MeetingMatch[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingMatch | null>(null);
  const [showMeetingPrompt, setShowMeetingPrompt] = useState(false);
  const [checkingMeetings, setCheckingMeetings] = useState(false);
  
  const [saelger, setSaelger] = useState('');
  const [dato, setDato] = useState(new Date().toISOString().split('T')[0]);
  const [ordreId, setOrdreId] = useState('');
  const [db, setDb] = useState('');
  const [soerenMoede, setSoerenMoede] = useState<'JA' | 'NEJ'>('NEJ');
  const [retentionSalg, setRetentionSalg] = useState<'JA' | 'NEJ'>('NEJ');
  
  const salespeople = ['Niels', 'Robert', 'Søgaard', 'Frank', 'Jeppe', 'Kristofer'];
  
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(false), 3000);
      return () => clearTimeout(t);
    }
  }, [success]);
  
  // Lookup order in Webmerc
  useEffect(() => {
    if (!ordreId.trim()) { setLookupMsg(null); setCustomerName(''); return; }
    const t = setTimeout(async () => {
      setLookingUp(true);
      try {
        const res = await fetch(`/api/webmerc/lookup?orderId=${encodeURIComponent(ordreId.trim())}`);
        const data = await res.json();
        if (data.found && data.order) {
          setDb(data.order.db.toString());
          setCustomerName(data.order.customer || '');
          setLookupMsg(`✅ Fundet: ${data.order.customer} - DB: ${data.order.db} kr`);
        } else {
          setLookupMsg(data.message || '⚠️ Ikke fundet');
          setCustomerName('');
        }
      } catch { setLookupMsg('⚠️ Fejl ved opslag'); setCustomerName(''); }
      finally { setLookingUp(false); }
    }, 1000);
    return () => clearTimeout(t);
  }, [ordreId]);
  
  // Check for meeting matches when we have customer name and salesperson
  useEffect(() => {
    if (!customerName || !saelger || soerenMoede === 'JA') {
      setMeetingMatches([]);
      setShowMeetingPrompt(false);
      return;
    }
    
    const checkMeetings = async () => {
      setCheckingMeetings(true);
      try {
        const res = await fetch(`/api/meetings/match?salesperson=${encodeURIComponent(saelger)}&customer=${encodeURIComponent(customerName)}`);
        const data = await res.json();
        if (data.success && data.matches && data.matches.length > 0) {
          setMeetingMatches(data.matches);
          setShowMeetingPrompt(true);
        } else {
          setMeetingMatches([]);
          setShowMeetingPrompt(false);
        }
      } catch (err) {
        console.error('Meeting check error:', err);
        setMeetingMatches([]);
      } finally {
        setCheckingMeetings(false);
      }
    };
    
    const t = setTimeout(checkMeetings, 500);
    return () => clearTimeout(t);
  }, [customerName, saelger, soerenMoede]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saelger) { alert('Vælg sælger'); return; }
    
    const isMeeting = soerenMoede === 'JA' && !ordreId.trim();
    if (!isMeeting && !ordreId.trim()) { alert('Indtast Ordre ID eller vælg Søren Møde = JA'); return; }
    if (!db.trim()) { alert('Indtast DB beløb'); return; }
    
    const dbNum = parseFloat(db);
    if (isNaN(dbNum) || dbNum < 0) { alert('DB skal være et gyldigt tal'); return; }
    
    setLoading(true);
    try {
      // Submit the sale
      const res = await fetch('/api/sheets/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dato, saelger,
          ordreId: isMeeting ? 'MØDE' : ordreId.trim(),
          kunde: customerName,
          db: isMeeting ? 0 : dbNum,
          soerenMoede, retentionSalg
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        // If a meeting was selected, link it to this sale
        if (selectedMeeting && ordreId.trim()) {
          try {
            await fetch('/api/meetings/link', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                meetingRowIndex: selectedMeeting.rowIndex,
                orderId: ordreId.trim(),
              }),
            });
          } catch (err) {
            console.error('Failed to link meeting:', err);
          }
        }
        
        setSuccess(true);
        setOrdreId(''); setDb(''); setSoerenMoede('NEJ'); setRetentionSalg('NEJ'); 
        setLookupMsg(null); setCustomerName(''); setMeetingMatches([]); 
        setSelectedMeeting(null); setShowMeetingPrompt(false);
      } else { 
        alert('Fejl: ' + (data.message || 'Ukendt')); 
      }
    } catch { alert('Fejl ved indsendelse'); }
    finally { setLoading(false); }
  };
  
  const formatMatchScore = (score: number) => {
    if (score >= 0.8) return '🎯 Meget sandsynligt';
    if (score >= 0.5) return '✓ Sandsynligt';
    return '? Muligt';
  };
  
  return (
    <div className="min-h-screen bg-white">
      <div className="bg-primary text-white p-4 shadow-md">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">Salg Input</h1>
          <Link href="/tv" className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30">📺 TV Dashboard</Link>
        </div>
      </div>
      
      {success && <div className="bg-green-500 text-white p-4 text-center font-semibold">✅ Salg registreret!</div>}
      
      <div className="max-w-2xl mx-auto p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sælger *</label>
            <select value={saelger} onChange={(e) => setSaelger(e.target.value)} required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary">
              <option value="">Vælg sælger...</option>
              {salespeople.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Dato *</label>
            <input type="date" value={dato} onChange={(e) => setDato(e.target.value)} required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Ordre ID {soerenMoede === 'JA' ? '(valgfrit)' : '*'}</label>
            <input type="text" value={ordreId} onChange={(e) => setOrdreId(e.target.value)} placeholder="Ordre nummer..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" required={soerenMoede === 'NEJ'} />
            {lookingUp && <p className="mt-2 text-sm text-gray-500">🔍 Søger i Webmerc...</p>}
            {lookupMsg && <p className="mt-2 text-sm">{lookupMsg}</p>}
          </div>
          
          {/* Meeting Match Prompt */}
          {showMeetingPrompt && meetingMatches.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">📅</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900 mb-2">
                    Kom dette salg fra et tidligere møde?
                  </h3>
                  <p className="text-sm text-blue-700 mb-3">
                    Vi fandt {meetingMatches.length} møde{meetingMatches.length > 1 ? 'r' : ''} der matcher denne kunde:
                  </p>
                  <div className="space-y-2">
                    {meetingMatches.slice(0, 3).map((match) => (
                      <button
                        key={match.rowIndex}
                        type="button"
                        onClick={() => setSelectedMeeting(selectedMeeting?.rowIndex === match.rowIndex ? null : match)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          selectedMeeting?.rowIndex === match.rowIndex
                            ? 'bg-blue-500 text-white border-blue-600'
                            : 'bg-white border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className={`font-medium ${selectedMeeting?.rowIndex === match.rowIndex ? 'text-white' : 'text-gray-900'}`}>
                              {match.customer}
                            </div>
                            <div className={`text-sm ${selectedMeeting?.rowIndex === match.rowIndex ? 'text-blue-100' : 'text-gray-500'}`}>
                              Møde d. {match.date}
                            </div>
                          </div>
                          <div className={`text-xs px-2 py-1 rounded ${
                            selectedMeeting?.rowIndex === match.rowIndex 
                              ? 'bg-blue-400 text-white' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {formatMatchScore(match.matchScore)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {selectedMeeting && (
                    <p className="mt-3 text-sm text-green-600 font-medium">
                      ✓ Møde valgt - vil blive koblet til dette salg
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => { setShowMeetingPrompt(false); setSelectedMeeting(null); }}
                    className="mt-3 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Nej, dette salg kom ikke fra et møde
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {checkingMeetings && (
            <p className="text-sm text-gray-500">🔍 Tjekker for matchende møder...</p>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">DB (Fortjeneste) *</label>
            <input type="number" value={db} onChange={(e) => setDb(e.target.value)} placeholder="0" step="0.01" min="0" required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" />
            <p className="mt-1 text-xs text-gray-500">Auto-udfyldes fra Webmerc</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Søren Møde *</label>
            <div className="flex gap-4">
              {(['JA', 'NEJ'] as const).map(v => (
                <button key={v} type="button" onClick={() => setSoerenMoede(v)}
                  className={`flex-1 px-4 py-3 rounded-lg font-medium ${soerenMoede === v ? (v === 'JA' ? 'bg-green-500 text-white' : 'bg-gray-500 text-white') : 'bg-gray-100 hover:bg-gray-200'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Retention Salg *</label>
            <div className="flex gap-4">
              {(['JA', 'NEJ'] as const).map(v => (
                <button key={v} type="button" onClick={() => setRetentionSalg(v)}
                  className={`flex-1 px-4 py-3 rounded-lg font-medium ${retentionSalg === v ? (v === 'JA' ? 'bg-green-500 text-white' : 'bg-gray-500 text-white') : 'bg-gray-100 hover:bg-gray-200'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={() => { 
              setOrdreId(''); setDb(''); setSoerenMoede('NEJ'); setRetentionSalg('NEJ'); 
              setLookupMsg(null); setCustomerName(''); setMeetingMatches([]);
              setSelectedMeeting(null); setShowMeetingPrompt(false);
            }}
              className="flex-1 px-6 py-4 bg-gray-100 rounded-lg font-semibold hover:bg-gray-200">Ryd</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-6 py-4 bg-primary text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50">
              {loading ? 'Sender...' : 'Send Salg'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
