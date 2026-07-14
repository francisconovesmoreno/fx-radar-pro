import React, { useRef, useEffect } from 'react';
import { EngineLogEntry } from '../types/institutional';

const TYPE_STYLES: Record<EngineLogEntry['type'], { icon: string; color: string; bg: string }> = {
  SIGNAL:    { icon: '✅', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  REJECTED:  { icon: '🚫', color: 'text-rose-400',    bg: 'bg-rose-500/10' },
  GATE_PASS: { icon: '🔓', color: 'text-cyan-400',    bg: 'bg-cyan-500/10' },
  INFO:      { icon: '📋', color: 'text-slate-400',    bg: 'bg-slate-500/10' },
  WARNING:   { icon: '⚠️', color: 'text-amber-400',   bg: 'bg-amber-500/10' },
};

interface Props {
  logs: EngineLogEntry[];
  expanded?: boolean;
}

export const EngineLog: React.FC<Props> = ({ logs, expanded }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs.length]);

  const maxItems = expanded ? 50 : 12;

  return (
    <div className="glass glass-hover p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-200">
          <span className="mr-2">⚡</span>Engine Log
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-medium">{logs.length} eventos</span>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
            <span className="text-[10px] text-emerald-400 font-bold tracking-wider">LIVE</span>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`space-y-1 overflow-y-auto custom-scroll ${expanded ? 'max-h-[600px]' : 'max-h-[320px]'}`}
      >
        {logs.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <p className="text-2xl mb-2">📡</p>
            <p className="text-sm">Esperando actividad del motor...</p>
          </div>
        ) : (
          logs.slice(0, maxItems).map((log) => {
            const style = TYPE_STYLES[log.type];
            const time = new Date(log.timestamp);
            return (
              <div
                key={log.id}
                className={`flex items-start gap-2.5 px-3 py-2 rounded-lg ${style.bg} border border-white/[0.03] animate-fade-slide`}
              >
                <span className="text-sm mt-0.5 flex-shrink-0">{style.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 font-mono tabular-nums">
                      {time.toLocaleTimeString('es-ES', { hour12: false })}
                    </span>
                    {log.symbol !== 'SYSTEM' && (
                      <span className="text-[10px] font-extrabold text-slate-300 bg-white/5 px-1.5 rounded">
                        {log.symbol}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs font-medium mt-0.5 ${style.color}`}>
                    {log.message}
                  </p>
                  {log.details && (
                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono truncate">
                      {log.details}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
