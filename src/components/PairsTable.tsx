import React, { useState } from 'react';
import { PairState } from '../types/institutional';

const DIR_CFG = {
  BUY:     { color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: '▲' },
  SELL:    { color: 'text-rose-400',    bg: 'bg-rose-400/10',    icon: '▼' },
  NEUTRAL: { color: 'text-amber-400',   bg: 'bg-amber-400/10',   icon: '◆' },
} as const;

const REGIME_CFG = {
  trend:    { color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'TREND' },
  volatile: { color: 'text-amber-400',   bg: 'bg-amber-400/10',   label: 'VOLATILE' },
  range:    { color: 'text-slate-400',   bg: 'bg-slate-400/10',   label: 'RANGE' },
} as const;

function scoreColor(s: number) {
  if (s >= 75) return 'bg-emerald-500';
  if (s >= 55) return 'bg-cyan-500';
  if (s >= 35) return 'bg-amber-500';
  return 'bg-rose-500';
}

function scoreGlow(s: number) {
  if (s >= 75) return 'shadow-emerald-500/30';
  if (s >= 55) return 'shadow-cyan-500/20';
  return '';
}

interface Props { pairs: PairState[] }

export const PairsTable: React.FC<Props> = ({ pairs }) => {
  const [expandedPair, setExpandedPair] = useState<string | null>(null);

  const sortedPairs = [...pairs].sort((a, b) => b.score - a.score);

  return (
    <div className="glass glass-hover p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-200">
          <span className="mr-2">📡</span>Pairs Scanner
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-medium">{pairs.length} pares</span>
          <span className="text-[10px] text-emerald-400/70 font-medium">
            {pairs.filter(p => p.direction !== 'NEUTRAL').length} con dirección
          </span>
        </div>
      </div>

      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="border-b border-white/5">
              {['PAR','PRECIO','DIR','SCORE','CONFLUENCIAS','ADX','RSI','RÉGIMEN','E[R]','ESTADO'].map(h => (
                <th key={h} className="py-3 px-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider text-left first:text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedPairs.map((p, i) => {
              const dir = DIR_CFG[p.direction];
              const reg = REGIME_CFG[p.regime];
              const sc  = scoreColor(p.score);
              const glow = scoreGlow(p.score);
              const decimals = p.digits <= 3 ? 3 : 5;
              const isExpanded = expandedPair === p.symbol;

              return (
                <React.Fragment key={p.symbol}>
                  <tr
                    className={`pair-row border-b border-white/[0.03] animate-fade-slide cursor-pointer ${isExpanded ? 'bg-white/[0.02]' : ''}`}
                    style={{ animationDelay: `${i * 50}ms` }}
                    onClick={() => setExpandedPair(isExpanded ? null : p.symbol)}
                  >
                    {/* Par */}
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-200">{p.display}</span>
                        {p.score >= 60 && (
                          <span className="text-[9px] px-1 rounded bg-emerald-500/15 text-emerald-400 font-bold">HOT</span>
                        )}
                      </div>
                    </td>
                    {/* Precio */}
                    <td className="py-3 px-2">
                      <span className={`font-mono font-semibold tabular-nums ${p.price > 0 ? 'text-slate-200' : 'text-slate-600'}`}>
                        {p.price > 0 ? p.price.toFixed(decimals) : '—'}
                      </span>
                    </td>
                    {/* Dirección */}
                    <td className="py-3 px-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${dir.color} ${dir.bg}`}>
                        {dir.icon} {p.direction}
                      </span>
                    </td>
                    {/* Score */}
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-14 h-2 bg-slate-800 rounded-full overflow-hidden ${glow ? `shadow-md ${glow}` : ''}`}>
                          <div className={`h-full rounded-full score-bar-fill ${sc}`} style={{ width: `${p.score}%` }} />
                        </div>
                        <span className={`text-xs font-mono font-bold w-7 text-right ${p.score >= 60 ? 'text-emerald-400' : p.score >= 40 ? 'text-amber-400' : 'text-slate-400'}`}>
                          {Math.round(p.score)}
                        </span>
                      </div>
                    </td>
                    {/* Confluencias */}
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1">
                        <div className="flex gap-[2px]">
                          {Array.from({ length: 11 }).map((_, idx) => (
                            <div
                              key={idx}
                              className={`w-[5px] h-3 rounded-sm transition-all duration-300 ${
                                idx < p.confluences.length
                                  ? p.confluences.length >= 8
                                    ? 'bg-emerald-400'
                                    : p.confluences.length >= 5
                                    ? 'bg-cyan-400'
                                    : 'bg-amber-400'
                                  : 'bg-slate-700/50'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] font-mono font-bold text-slate-400 ml-1">{p.confluences.length}/11</span>
                      </div>
                    </td>
                    {/* ADX */}
                    <td className="py-3 px-2">
                      <span className={`font-mono text-xs font-semibold ${p.adx4h >= 28 ? 'text-emerald-400' : p.adx4h >= 20 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {p.adx4h.toFixed(1)}
                      </span>
                    </td>
                    {/* RSI */}
                    <td className="py-3 px-2">
                      <span className={`font-mono text-xs ${p.rsi1h > 70 || p.rsi1h < 30 ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                        {p.rsi1h.toFixed(1)}
                      </span>
                    </td>
                    {/* Régimen */}
                    <td className="py-3 px-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${reg.color} ${reg.bg}`}>
                        {reg.label}
                      </span>
                    </td>
                    {/* E[R] */}
                    <td className="py-3 px-2">
                      <span className={`font-mono text-xs font-semibold ${p.expectedR > 1 ? 'text-emerald-400' : p.expectedR > 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                        {p.expectedR.toFixed(1)}R
                      </span>
                    </td>
                    {/* Estado */}
                    <td className="py-3 px-2">
                      {p.newsBlocked ? (
                        <span className="text-[11px] text-rose-400 font-semibold">⚠ NEWS</span>
                      ) : p.rejectedReason ? (
                        <span className="text-[10px] text-amber-400/80 font-medium truncate max-w-[120px] block" title={p.rejectedReason}>
                          ⏸ {p.rejectedReason.split('—')[0]}
                        </span>
                      ) : (
                        <span className="text-[11px] text-emerald-400 font-medium">✓ READY</span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded Details Row */}
                  {isExpanded && (
                    <tr className="animate-fade-slide">
                      <td colSpan={10} className="px-4 py-3 bg-white/[0.01]">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {/* Confluences List */}
                          <div className="col-span-2">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">Confluencias Activas</span>
                            <div className="flex flex-wrap gap-1.5">
                              {p.confluences.length > 0 ? p.confluences.map((c: string) => (
                                <span key={c} className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/10">
                                  ✓ {c}
                                </span>
                              )) : (
                                <span className="text-[10px] text-slate-500">Sin confluencias activas</span>
                              )}
                            </div>
                          </div>

                          {/* Gate Details */}
                          <div className="col-span-2">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">Gate Check</span>
                            <div className="flex flex-wrap gap-1.5">
                              {p.gateDetails.map(g => (
                                <span key={g.name} className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${
                                  g.passed
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10'
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/10'
                                }`}>
                                  {g.passed ? '✓' : '✗'} {g.name}: {g.value}
                                </span>
                              ))}
                            </div>
                            {p.rejectedReason && (
                              <p className="text-[10px] text-rose-400/80 mt-2 font-medium">
                                🚫 {p.rejectedReason}
                              </p>
                            )}
                          </div>

                          {/* Extra Metrics */}
                          <div>
                            <span className="text-[10px] text-slate-500 block">RSI 4H</span>
                            <span className="text-xs font-mono font-semibold text-slate-300">{p.rsi4h.toFixed(1)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">ATR Pips</span>
                            <span className="text-xs font-mono font-semibold text-slate-300">{p.atrPips}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">RVol</span>
                            <span className={`text-xs font-mono font-semibold ${p.relativeVolume >= 1.2 ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {p.relativeVolume.toFixed(2)}x
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">Sesión</span>
                            <span className="text-xs font-medium text-slate-300">{p.session}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
