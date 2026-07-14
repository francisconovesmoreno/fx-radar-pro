import React, { useState } from 'react';
import { telegramBot } from '../services/telegram.service';

export const TelegramPanel: React.FC = () => {
  const [config, setConfig] = useState(telegramBot.getConfig());
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<'IDLE' | 'OK' | 'ERROR'>('IDLE');

  const handleTest = async () => {
    setTesting(true);
    setStatus('IDLE');
    const ok = await telegramBot.testConnection(config.botToken, config.chatId);
    setStatus(ok ? 'OK' : 'ERROR');
    setTesting(false);
  };

  const save = (newCfg: any) => {
    setConfig(newCfg);
    telegramBot.saveConfig(newCfg);
  };

  return (
    <div className="glass glass-hover p-6">
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-lg font-bold text-slate-200">
          <span className="mr-2">📡</span>Control de Telegram
        </h2>
        <div className="flex gap-2 items-center">
          <span className={`w-2 h-2 rounded-full ${config.enabled ? 'bg-emerald-400 live-dot' : 'bg-rose-500'}`} />
          <span className={`text-xs font-bold ${config.enabled ? 'text-emerald-400' : 'text-rose-400'}`}>
            {config.enabled ? 'ACTIVO' : 'INACTIVO'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Bot Token */}
        <div>
          <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1.5">Bot Token</label>
          <input
            type="password"
            value={config.botToken}
            onChange={e => save({...config, botToken: e.target.value})}
            className="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-slate-200 font-mono focus:border-emerald-500/30 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 transition-all"
            placeholder="Ingresa tu bot token"
          />
        </div>
        
        {/* Chat ID */}
        <div>
          <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1.5">Chat ID</label>
          <input
            type="text"
            value={config.chatId}
            onChange={e => save({...config, chatId: e.target.value})}
            className="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-slate-200 font-mono focus:border-emerald-500/30 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 transition-all"
            placeholder="Tu Chat ID"
          />
        </div>

        {/* Toggles */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          {[
            { key: 'enabled', label: 'Habilitado' },
            { key: 'sendNewSignals', label: 'Señales Nuevas' },
            { key: 'sendUpdates', label: 'Actualizaciones' },
            { key: 'sendDaily', label: 'Resumen Diario' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => save({ ...config, [key]: !(config as any)[key] })}
              className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                (config as any)[key]
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-white/5 text-slate-500 border border-white/5 hover:border-white/10'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${(config as any)[key] ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              {label}
            </button>
          ))}
        </div>

        {/* Score Threshold */}
        <div>
          <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1.5">
            Score Mínimo para Alertas: <span className="text-emerald-400">{config.minScoreThreshold}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={config.minScoreThreshold}
            onChange={e => save({ ...config, minScoreThreshold: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
        </div>

        {/* Test Button */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-sm font-bold hover:shadow-lg hover:shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Probando...
              </span>
            ) : (
              '📲 Probar Conexión'
            )}
          </button>
          {status === 'OK' && (
            <span className="text-emerald-400 text-sm font-bold animate-fade-slide">✅ Conectado</span>
          )}
          {status === 'ERROR' && (
            <span className="text-rose-400 text-sm font-bold animate-fade-slide">❌ Error</span>
          )}
        </div>
      </div>
    </div>
  );
};
