import React from 'react';
import { RiskMetrics } from '../types/institutional';

interface Props {
  metrics: RiskMetrics;
  expanded?: boolean;
}

/* Pre-resolved Tailwind classes to avoid dynamic purge issues */
const DD_STYLES = {
  emerald: { text: 'text-emerald-400', bar: 'bg-emerald-500', glow: 'shadow-emerald-500/20' },
  amber:   { text: 'text-amber-400',   bar: 'bg-amber-500',   glow: 'shadow-amber-500/20' },
  rose:    { text: 'text-rose-400',     bar: 'bg-rose-500',    glow: 'shadow-rose-500/20' },
} as const;

function ddTier(pct: number): keyof typeof DD_STYLES {
  if (pct >= 4) return 'rose';
  if (pct >= 2) return 'amber';
  return 'emerald';
}

export const RiskPanel: React.FC<Props> = ({ metrics, expanded }) => {
  const dd    = ddTier(metrics.dailyDD);
  const maxDD = ddTier(metrics.maxDD);
  const equityPct = Math.min(100, (metrics.equity / metrics.dailyStartEquity) * 100);
  const pnl = metrics.equity - metrics.dailyStartEquity;
  const pnlPct = metrics.dailyStartEquity > 0 ? ((pnl / metrics.dailyStartEquity) * 100) : 0;

  return (
    <div className={`glass glass-hover p-5 ${expanded ? 'max-w-2xl mx-auto' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-200">
          <span className="mr-2">🛡️</span>Risk Management
        </h2>
        {metrics.circuitBreakerActive && (
          <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-400 text-xs font-bold animate-pulse">
            ⚠️ CIRCUIT BREAKER
          </span>
        )}
      </div>

      <div className="space-y-5">
        {/* Equity + P&L */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-500">Equity</span>
            <div className="flex items-center gap-3">
              <span className={`font-mono font-bold text-xs px-1.5 py-0.5 rounded ${pnl >= 0 ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10'}`}>
                {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
              </span>
              <span className="font-mono font-semibold text-slate-200">${metrics.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full score-bar-fill" style={{ width: `${equityPct}%` }} />
          </div>
        </div>

        {/* Daily DD */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-500">Drawdown Diario</span>
            <span className={`font-mono font-semibold ${DD_STYLES[dd].text}`}>
              {metrics.dailyDD.toFixed(2)}% / 5.00%
            </span>
          </div>
          <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${DD_STYLES[dd].bar}`} style={{ width: `${Math.min(100, (metrics.dailyDD / 5) * 100)}%` }} />
          </div>
          {/* DD danger zones */}
          <div className="flex mt-1 text-[9px] text-slate-600">
            <span className="flex-1">0%</span>
            <span className="flex-1 text-center text-amber-500/40">2%</span>
            <span className="flex-1 text-center text-rose-500/40">4%</span>
            <span className="text-right text-rose-500/50">5% CB</span>
          </div>
        </div>

        {/* Max DD */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-500">Max Drawdown</span>
            <span className={`font-mono font-semibold ${DD_STYLES[maxDD].text}`}>{metrics.maxDD.toFixed(2)}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${DD_STYLES[maxDD].bar}`} style={{ width: `${Math.min(100, (metrics.maxDD / 10) * 100)}%` }} />
          </div>
        </div>

        {/* Status Grid */}
        <div className="pt-4 border-t border-white/5 grid grid-cols-2 gap-4">
          <div className="p-3 rounded-lg glass-inner">
            <span className="text-[10px] text-slate-500 block mb-1">Circuit Breaker</span>
            <span className={`flex items-center gap-1.5 text-xs font-bold ${metrics.circuitBreakerActive ? 'text-rose-400' : 'text-emerald-400'}`}>
              <span className={`w-2 h-2 rounded-full ${metrics.circuitBreakerActive ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'}`} />
              {metrics.circuitBreakerActive ? 'ACTIVO' : 'INACTIVO'}
            </span>
          </div>
          <div className="p-3 rounded-lg glass-inner">
            <span className="text-[10px] text-slate-500 block mb-1">Equity Inicio</span>
            <span className="text-xs font-mono font-semibold text-slate-300">${metrics.dailyStartEquity.toLocaleString()}</span>
          </div>
          <div className="p-3 rounded-lg glass-inner">
            <span className="text-[10px] text-slate-500 block mb-1">Riesgo Máximo/Trade</span>
            <span className="text-xs font-mono font-semibold text-slate-300">1.0%</span>
          </div>
          <div className="p-3 rounded-lg glass-inner">
            <span className="text-[10px] text-slate-500 block mb-1">Kelly Fraction</span>
            <span className="text-xs font-mono font-semibold text-slate-300">0.25</span>
          </div>
        </div>
      </div>
    </div>
  );
};
