import React, { useState } from 'react';
import { Signal, PairState } from '../types/institutional';

/* ─── Helpers ─── */
function formatPrice(price: number, digits: number): string {
  return price.toFixed(digits);
}

function formatETA(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function Stars({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} className={`w-3.5 h-3.5 ${i <= count ? 'text-amber-400' : 'text-slate-700'}`} viewBox="0 0 20 20" fill="currentColor">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

/* ─── Empty State ─── */
function EmptyState({ pairs }: { pairs: PairState[] }) {
  const scanning = pairs.filter(p => p.price > 0);
  const bestPair = [...pairs].sort((a, b) => b.stars - a.stars)[0];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
        <svg className="w-8 h-8 text-emerald-500/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
      </div>
      <h3 className="text-lg font-bold text-slate-300 mb-2">Buscando setups de alta probabilidad…</h3>
      <p className="text-sm text-slate-500 max-w-sm">
        El motor escanea {scanning.length} pares en tiempo real. Solo se genera señal con <b className="text-amber-400">mínimo 4★</b>. Esto garantiza calidad sobre cantidad.
      </p>
      {bestPair && bestPair.stars > 0 && (
        <div className="mt-6 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-slate-400">Par más cercano:</p>
          <p className="text-slate-200 font-semibold mt-1">
            {bestPair.display || bestPair.symbol} — <Stars count={bestPair.stars} />
          </p>
          <p className="text-slate-500 text-xs mt-1">{bestPair.rejectedReason || 'Evaluando…'}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Signal Card ─── */
function SignalCard({ signal, pair, onClose }: { signal: Signal; pair?: PairState; onClose: (id: string, status: 'CLOSED_WIN' | 'CLOSED_LOSS') => void }) {
  const [expanded, setExpanded] = useState(false);
  const isBuy = signal.direction === 'BUY';
  const isOpen = signal.status === 'OPEN';
  const isWin = signal.status === 'CLOSED_WIN';
  const digits = pair?.digits ?? (signal.symbol.includes('JPY') ? 3 : 5);

  // Live progress toward TP1
  const currentPrice = pair?.price ?? signal.entry;
  const totalMove = isBuy ? signal.tp1 - signal.stop : signal.stop - signal.tp1;
  const currentMove = isBuy ? currentPrice - signal.stop : signal.stop - currentPrice;
  const progress = totalMove > 0 ? Math.max(0, Math.min(100, (currentMove / totalMove) * 100)) : 0;
  const passedEntry = isBuy ? currentPrice > signal.entry : currentPrice < signal.entry;

  // P&L
  const pipSize = digits <= 3 ? 0.01 : 0.0001;
  const currentPips = isBuy
    ? (currentPrice - signal.entry) / pipSize
    : (signal.entry - currentPrice) / pipSize;
  const pipValue = 10;
  const livePnl = currentPips * signal.suggestedLots * pipValue;

  const statusColor = !isOpen
    ? (isWin ? 'border-emerald-500/30' : 'border-rose-500/30')
    : (isBuy ? 'border-emerald-500/20' : 'border-rose-500/20');
  const dirColor = isBuy ? 'text-emerald-400' : 'text-rose-400';
  const dirBg = isBuy ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
  const dirBorder = isBuy ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)';

  // ETA label
  const openedAt = new Date(signal.openedAt);
  const hoursOpen = (Date.now() - signal.openedAt) / 3600000;
  const etaLabel = signal.estimatedHoursToTP1 > 0
    ? `ETA TP1: ${formatETA(signal.estimatedHoursToTP1)}`
    : '';

  return (
    <div className={`rounded-2xl border transition-all duration-200 ${statusColor}`} style={{ background: 'rgba(255,255,255,0.025)' }}>
      {/* ─── Card Header ─── */}
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between gap-3">
          {/* Left: Symbol + direction */}
          <div className="flex items-center gap-3">
            <div className="rounded-xl px-3 py-1.5 text-center" style={{ background: dirBg, border: `1px solid ${dirBorder}` }}>
              <p className={`text-xs font-black tracking-widest ${dirColor}`}>{isBuy ? '▲ COMPRAR' : '▼ VENDER'}</p>
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-tight">{signal.display || signal.symbol}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Stars count={signal.stars} />
                <span className="text-[10px] text-slate-500">{signal.grade}</span>
                {!isOpen && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isWin ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {isWin ? '✓ TP alcanzado' : '✗ SL alcanzado'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Live P&L */}
          <div className="text-right">
            {isOpen ? (
              <>
                <p className={`text-xl font-black font-mono ${livePnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {livePnl >= 0 ? '+' : ''}{livePnl.toFixed(1)}$
                </p>
                <p className="text-[11px] text-slate-500">{currentPips >= 0 ? '+' : ''}{currentPips.toFixed(1)} pips</p>
              </>
            ) : (
              <p className="text-slate-500 text-sm font-medium">{isWin ? '+TP' : '-SL'}</p>
            )}
          </div>
        </div>

        {/* ─── Progress bar (SL → TP1) ─── */}
        {isOpen && (
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
              <span>SL {formatPrice(signal.stop, digits)}</span>
              <span className={passedEntry ? 'text-emerald-400' : 'text-slate-400'}>● Precio: {formatPrice(currentPrice, digits)}</span>
              <span>TP1 {formatPrice(signal.tp1, digits)}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className={`h-full rounded-full transition-all duration-500 ${passedEntry ? (isBuy ? 'bg-emerald-500' : 'bg-rose-500') : 'bg-slate-600'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* ─── Key info row ─── */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          <div className="text-center">
            <p className="text-[10px] text-slate-500">Entrada</p>
            <p className="text-xs font-mono font-bold text-slate-200">{formatPrice(signal.entry, digits)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-rose-400">Stop Loss</p>
            <p className="text-xs font-mono font-bold text-rose-400">{formatPrice(signal.stop, digits)}</p>
            <p className="text-[10px] text-slate-600">-${signal.riskDollars.toFixed(0)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-emerald-400">TP1</p>
            <p className="text-xs font-mono font-bold text-emerald-400">{formatPrice(signal.tp1, digits)}</p>
            <p className="text-[10px] text-slate-500">+${signal.rewardTP1Dollars.toFixed(0)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-cyan-400">⏱ ETA</p>
            <p className="text-xs font-bold text-cyan-400">{etaLabel || '--'}</p>
            <p className="text-[10px] text-slate-600">{signal.sessionAtOpen?.split(' ')[0] || ''}</p>
          </div>
        </div>
      </div>

      {/* ─── Expanded Detail ─── */}
      {expanded && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3 space-y-3">
          {/* Full price ladder */}
          <div className="space-y-1.5">
            {signal.levels.map((lvl, i) => {
              const isEntry = lvl.label.includes('ENTRY');
              const isStop = lvl.label.includes('STOP');
              const isTP1 = lvl.label.includes('TP1');
              const color = isStop ? 'text-rose-400' : isEntry ? 'text-slate-300' : 'text-emerald-400';
              const bg = isStop ? 'rgba(239,68,68,0.05)' : isEntry ? 'rgba(255,255,255,0.03)' : 'rgba(16,185,129,0.05)';
              return (
                <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: bg }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold w-16" style={{ color: isStop ? '#f87171' : isEntry ? '#94a3b8' : '#34d399' }}>{lvl.label}</span>
                    <span className="text-xs text-slate-400 font-mono">{lvl.source}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm font-mono font-bold ${color}`}>{formatPrice(lvl.price, digits)}</span>
                    {!isEntry && (
                      <>
                        <span className="text-[11px] text-slate-500">{lvl.pips >= 0 ? '+' : ''}{lvl.pips.toFixed(1)}p</span>
                        <span className={`text-[11px] font-semibold ${lvl.dollars >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {lvl.dollars >= 0 ? '+' : ''}{lvl.dollars.toFixed(0)}$
                        </span>
                        <span className="text-[11px] text-slate-600">{lvl.rMultiple}R</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Star details */}
          {signal.starDetails && signal.starDetails.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Filtros de Calidad</p>
              {signal.starDetails.map(d => (
                <div key={d.id} className="flex items-center gap-2 text-xs">
                  <span className={d.passed ? 'text-amber-400' : 'text-slate-700'}>
                    {d.passed ? '⭐' : '☆'}
                  </span>
                  <span className={d.passed ? 'text-slate-300' : 'text-slate-600'}>{d.name}</span>
                  <span className="text-slate-500 ml-auto text-[10px]">{d.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Sizing info */}
          <div className="grid grid-cols-3 gap-2 text-center pt-1">
            <div className="rounded-lg py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-[10px] text-slate-500">Lotaje sugerido</p>
              <p className="text-sm font-bold text-slate-200">{signal.suggestedLots} lotes</p>
            </div>
            <div className="rounded-lg py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-[10px] text-slate-500">R:R Ratio</p>
              <p className="text-sm font-bold text-emerald-400">{signal.riskRewardRatio.toFixed(2)}:1</p>
            </div>
            <div className="rounded-lg py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-[10px] text-slate-500">ETA TP3</p>
              <p className="text-sm font-bold text-cyan-400">{signal.estimatedHoursToTP3 > 0 ? formatETA(signal.estimatedHoursToTP3) : '--'}</p>
            </div>
          </div>

          {/* Close buttons */}
          {isOpen && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onClose(signal.id, 'CLOSED_WIN')}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-emerald-400 transition-all hover:opacity-80"
                style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}
              >
                ✓ Cerrar en Ganancia
              </button>
              <button
                onClick={() => onClose(signal.id, 'CLOSED_LOSS')}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-rose-400 transition-all hover:opacity-80"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                ✕ Cerrar en Pérdida
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main Panel ─── */
export function SignalsPanel({
  signals,
  pairs,
  onClose,
}: {
  signals: Signal[];
  pairs: PairState[];
  onClose: (id: string, status: 'CLOSED_WIN' | 'CLOSED_LOSS') => void;
}) {
  const [showClosed, setShowClosed] = useState(false);
  const open = signals.filter(s => s.status === 'OPEN');
  const closed = signals.filter(s => s.status !== 'OPEN' && s.status !== 'PENDING').reverse();

  const getPair = (sym: string) => pairs.find(p => p.symbol === sym);

  return (
    <div className="space-y-4">
      {/* Open signals */}
      {open.length === 0 ? (
        <EmptyState pairs={pairs} />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold px-1">
            {open.length} señal{open.length !== 1 ? 'es' : ''} activa{open.length !== 1 ? 's' : ''}
          </p>
          {open.map(sig => (
            <SignalCard key={sig.id} signal={sig} pair={getPair(sig.symbol)} onClose={onClose} />
          ))}
        </div>
      )}

      {/* Closed signals toggle */}
      {closed.length > 0 && (
        <div>
          <button
            onClick={() => setShowClosed(!showClosed)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1.5 px-1"
          >
            <svg className={`w-3 h-3 transition-transform ${showClosed ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" />
            </svg>
            Historial ({closed.length} señales)
          </button>
          {showClosed && (
            <div className="mt-2 space-y-2 opacity-60">
              {closed.slice(0, 10).map(sig => (
                <SignalCard key={sig.id} signal={sig} pair={getPair(sig.symbol)} onClose={onClose} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
