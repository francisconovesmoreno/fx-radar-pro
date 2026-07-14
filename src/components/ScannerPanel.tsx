import React from 'react';
import { PairState, EngineLogEntry } from '../types/institutional';

function Stars({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} className={`w-3 h-3 ${i <= count ? 'text-amber-400' : 'text-slate-700'}`} viewBox="0 0 20 20" fill="currentColor">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function TrafficLight({ stars }: { stars: number }) {
  // 🟢 4-5★ = señal  |  🟡 2-3★ = vigilar  |  🔴 0-1★ = evitar
  if (stars >= 4) return <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" title="🟢 Señal activa" />;
  if (stars >= 2) return <div className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]" title="🟡 Vigilar" />;
  return <div className="w-3 h-3 rounded-full bg-slate-700" title="🔴 Evitar" />;
}

export function ScannerPanel({
  pairs,
  engineLogs,
  dataStatus,
}: {
  pairs: PairState[];
  engineLogs: EngineLogEntry[];
  dataStatus: string;
}) {
  // Sort by stars desc
  const sorted = [...pairs].sort((a, b) => b.stars - a.stars);

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500 px-1">
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-400" /><span>4-5★ Señal</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span>2-3★ Vigilar</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-slate-700" /><span>0-1★ Evitar</span></div>
      </div>

      {/* Pairs Grid */}
      <div className="space-y-2">
        {sorted.map(pair => {
          const isLoaded = pair.price > 0;
          const isBuy = pair.direction === 'BUY';
          const isSell = pair.direction === 'SELL';
          const dirColor = isBuy ? 'text-emerald-400' : isSell ? 'text-rose-400' : 'text-slate-500';

          return (
            <div
              key={pair.symbol}
              className="rounded-xl px-4 py-3 flex items-center gap-4"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              {/* Traffic light */}
              <TrafficLight stars={pair.stars} />

              {/* Symbol */}
              <div className="w-20 flex-shrink-0">
                <p className="text-sm font-bold text-slate-200">{pair.display || pair.symbol}</p>
                <p className="text-[10px] text-slate-600">{pair.session?.split(' ')[0] || ''}</p>
              </div>

              {/* Price */}
              <div className="w-24 flex-shrink-0">
                <p className="text-sm font-mono font-bold text-slate-200">
                  {isLoaded ? pair.price.toFixed(pair.digits) : '—'}
                </p>
              </div>

              {/* Direction */}
              <div className={`w-16 text-xs font-bold flex-shrink-0 ${dirColor}`}>
                {isBuy ? '▲ BUY' : isSell ? '▼ SELL' : '— —'}
              </div>

              {/* Stars */}
              <div className="flex-shrink-0">
                <Stars count={pair.stars} />
              </div>

              {/* Regime badge */}
              <div className="flex-shrink-0">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  pair.regime === 'trend' ? 'text-emerald-400 bg-emerald-500/10' :
                  pair.regime === 'volatile' ? 'text-amber-400 bg-amber-500/10' :
                  'text-slate-500 bg-slate-500/10'
                }`}>
                  {pair.regime === 'trend' ? 'TREND' : pair.regime === 'volatile' ? 'VOLÁTIL' : 'RANGO'}
                </span>
              </div>

              {/* Status / reason */}
              <div className="flex-1 text-right">
                <p className={`text-xs truncate ${pair.stars >= 4 ? 'text-emerald-400' : 'text-slate-600'}`}>
                  {pair.stars >= 4
                    ? `✅ ${pair.stars}★ – Ready`
                    : pair.rejectedReason
                    ? pair.rejectedReason.replace(/[🔴🟡⭐]/g, '').trim().slice(0, 40)
                    : isLoaded ? `${pair.stars}★ insuficiente` : 'Cargando…'}
                </p>
              </div>

              {/* ADX mini */}
              <div className="text-right flex-shrink-0 hidden sm:block">
                <p className="text-[10px] text-slate-600">ADX</p>
                <p className={`text-xs font-mono ${pair.adx4h >= 25 ? 'text-emerald-400' : 'text-slate-500'}`}>{pair.adx4h?.toFixed(1) || '—'}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Engine log (last 8 events) */}
      <div className="mt-6">
        <p className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mb-2 px-1">
          Log del Motor · {engineLogs.length} eventos
        </p>
        <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.04)' }}>
          {engineLogs.slice(0, 10).map(log => (
            <div
              key={log.id}
              className="flex items-start gap-3 px-3 py-2 border-b border-white/3 text-xs last:border-0"
            >
              <span className="text-slate-600 font-mono flex-shrink-0">
                {new Date(log.timestamp).toLocaleTimeString('es-ES', { hour12: false })}
              </span>
              <span className={`flex-shrink-0 font-semibold w-14 ${
                log.type === 'SIGNAL' ? 'text-emerald-400' :
                log.type === 'REJECTED' ? 'text-slate-500' :
                log.type === 'WARNING' ? 'text-amber-400' :
                'text-slate-600'
              }`}>{log.symbol}</span>
              <span className="text-slate-400 flex-1 truncate">{log.message}</span>
            </div>
          ))}
          {engineLogs.length === 0 && (
            <p className="px-3 py-4 text-slate-600 text-xs">Esperando datos del motor…</p>
          )}
        </div>
      </div>
    </div>
  );
}
