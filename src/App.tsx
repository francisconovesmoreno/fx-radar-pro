import React, { useState, useEffect } from 'react';
import { useQuantEngine } from './hooks/useQuantEngine';
import { SignalsPanel } from './components/SignalsPanel';
import { ScannerPanel } from './components/ScannerPanel';

type TabId = 'signals' | 'scanner';

function LiveClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  const h = t.getUTCHours();
  let session = '🌏 Asia';
  if (h >= 8 && h < 12) session = '🇬🇧 London';
  else if (h >= 12 && h < 16) session = '🌐 NY Overlap';
  else if (h >= 16 && h < 21) session = '🇺🇸 New York';
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400">{session}</span>
      <span className="font-mono text-sm text-slate-300 tabular-nums">{t.toLocaleTimeString('es-ES', { hour12: false, timeZone: 'UTC' })} UTC</span>
    </div>
  );
}

export default function App() {
  const { pairs, activeSignals, riskMetrics, dataStatus, marketInfo, engineLogs, closeSignal, reset } = useQuantEngine();
  const [tab, setTab] = useState<TabId>('signals');

  const openSignals = activeSignals.filter(s => s.status === 'OPEN');
  const wins = activeSignals.filter(s => s.status === 'CLOSED_WIN').length;
  const losses = activeSignals.filter(s => s.status === 'CLOSED_LOSS').length;
  const total = wins + losses;
  const wr = total > 0 ? Math.round((wins / total) * 100) : 0;

  const equityChange = riskMetrics.equity - riskMetrics.dailyStartEquity;
  const equityPositive = equityChange >= 0;

  return (
    <div className="min-h-screen" style={{ background: 'radial-gradient(ellipse at 10% 0%, #0d1f1a 0%, #060d0b 60%, #030807 100%)' }}>
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 border-b border-white/5" style={{ background: 'rgba(6,15,12,0.95)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)' }}>
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 14 15 20 9" />
                <circle cx="20" cy="9" r="1.5" fill="currentColor" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight" style={{ background: 'linear-gradient(90deg, #10b981, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FX RADAR PRO</h1>
              <p className="text-[10px] text-slate-500 -mt-0.5">Motor Institucional v3.0 · El Sniper</p>
            </div>
          </div>

          {/* Status bar */}
          <div className="flex items-center gap-4">
            <LiveClock />
            {/* Equity */}
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-slate-500">Balance</p>
              <p className={`text-sm font-bold font-mono ${equityPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${riskMetrics.equity.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                <span className="text-xs ml-1">({equityPositive ? '+' : ''}{equityChange.toFixed(0)})</span>
              </p>
            </div>
            {/* Status dot */}
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${dataStatus === 'live' ? 'bg-emerald-400 animate-pulse' : dataStatus === 'loading' ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'}`}></span>
              <span className="text-xs text-slate-500 hidden sm:inline">
                {dataStatus === 'live' ? 'LIVE' : dataStatus === 'loading' ? 'Cargando...' : dataStatus === 'market_closed' ? 'Cerrado' : 'Error'}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-4 flex gap-1 pb-0">
          {([
            { id: 'signals' as TabId, label: 'Señales', badge: openSignals.length > 0 ? openSignals.length : undefined },
            { id: 'scanner' as TabId, label: 'Scanner', badge: undefined },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-4 py-2.5 text-sm font-semibold transition-all ${
                tab === t.id
                  ? 'text-emerald-400 border-b-2 border-emerald-400'
                  : 'text-slate-500 hover:text-slate-300 border-b-2 border-transparent'
              }`}
            >
              {t.label}
              {t.badge !== undefined && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400">{t.badge}</span>
              )}
            </button>
          ))}
          
          {/* Mini stats */}
          <div className="ml-auto flex items-center gap-3 pb-1 text-xs text-slate-500">
            <span>WR: <b className={wr >= 50 ? 'text-emerald-400' : 'text-slate-400'}>{total > 0 ? `${wr}%` : '--'}</b></span>
            <span className="text-slate-700">|</span>
            <span className="text-emerald-400">{wins}W</span>
            <span className="text-rose-400">{losses}L</span>
            <button onClick={reset} className="ml-2 px-2 py-0.5 rounded text-[10px] border border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-colors">Reset</button>
          </div>
        </div>
      </header>

      {/* ─── Market Closed Banner ─── */}
      {!marketInfo.open && (
        <div className="max-w-5xl mx-auto px-4 mt-3">
          <div className="rounded-xl px-4 py-3 text-sm text-amber-300 border border-amber-500/20" style={{ background: 'rgba(251,191,36,0.07)' }}>
            🌙 {marketInfo.reason} — Próxima apertura: <b>{marketInfo.nextOpen}</b>
          </div>
        </div>
      )}

      {/* ─── Content ─── */}
      <main className="max-w-5xl mx-auto px-4 py-4">
        {tab === 'signals' && (
          <SignalsPanel signals={activeSignals} pairs={pairs} onClose={closeSignal} />
        )}
        {tab === 'scanner' && (
          <ScannerPanel pairs={pairs} engineLogs={engineLogs} dataStatus={dataStatus} />
        )}
      </main>
    </div>
  );
}
