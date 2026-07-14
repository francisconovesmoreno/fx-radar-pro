import { Signal, PairState, RiskMetrics } from '../types/institutional';

interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  sendNewSignals: boolean;
  sendUpdates: boolean;
  sendDaily: boolean;
  minScoreThreshold: number;
}

const e = (text: string | number): string => String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');

export class TelegramService {
  private static instance: TelegramService;
  private config: TelegramConfig;
  private messageQueue: { text: string; resolve: any; reject: any }[] = [];
  private isProcessing = false;

  private constructor() {
    // AQUÍ ESTÁN TUS CREDENCIALES EXACTAS
    const saved = localStorage.getItem('fxradar_telegram_cfg');
    this.config = saved ? JSON.parse(saved) : {
      botToken: import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '8067364045:AAEyff2MRSNdRbXCpWrRyP8ZnrLW70Y4j1U',
      chatId: import.meta.env.VITE_TELEGRAM_CHAT_ID || '976047788',
      enabled: true,
      sendNewSignals: true,
      sendUpdates: true,
      sendDaily: true,
      minScoreThreshold: 70
    };
    setInterval(() => this.processQueue(), 3000); // Rate Limit estricto (20 msg/min)
  }

  public static getInstance(): TelegramService {
    if (!TelegramService.instance) TelegramService.instance = new TelegramService();
    return TelegramService.instance;
  }

  public getConfig() { return this.config; }
  public saveConfig(cfg: TelegramConfig) {
    this.config = cfg;
    localStorage.setItem('fxradar_telegram_cfg', JSON.stringify(cfg));
  }

  private async processQueue() {
    if (this.isProcessing || this.messageQueue.length === 0 || !this.config.enabled) return;
    this.isProcessing = true;
    
    const msg = this.messageQueue.shift()!;
    try {
      const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.config.chatId, text: msg.text, parse_mode: 'MarkdownV2', disable_web_page_preview: true })
      });
      const data = await res.json();
      if (!data.ok) throw data;
      msg.resolve(data);
    } catch (err) {
      console.error('Telegram API Error:', err);
      msg.reject(err);
    }
    this.isProcessing = false;
  }

  public async testConnection(token: string, chatId: string): Promise<boolean> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: '✅ *Conexión Exitosa*\nFX Radar Pro 100% operativo en este chat\\.', parse_mode: 'MarkdownV2' })
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public alertNewSignal(signal: Signal, pair: PairState) {
    if (!this.config.sendNewSignals || pair.score < this.config.minScoreThreshold) return;
    const msg = `🔴 *NUEVA SEÑAL FOREX*
📊 Par: *${e(signal.symbol)}*
📈 Dirección: *${signal.direction}* 👉🏦
⭐ Score: *${e(pair.score)}/100*
🎯 Entrada: *${e(signal.entry)}*
🛡️ Stop Loss: ${e(signal.stop)}
🎯 TP1: ${e(signal.tp1)} \\(${e(signal.expectedR.toFixed(1))}R\\)
💰 Tamaño sugerido: \\$${e(signal.positionSizeUsd)}`;
    
    new Promise((resolve, reject) => this.messageQueue.push({ text: msg, resolve, reject }));
  }

  public alertUpdate(signal: Signal, profitUsd: number, type: 'TP' | 'SL') {
    if (!this.config.sendUpdates) return;
    const isWin = type === 'TP';
    const msg = `${isWin ? '🎉 *TP ALCANZADO*' : '🔴 *STOP LOSS*'} — ${e(signal.symbol)} ${signal.direction}
${isWin ? '✅' : '❌'} P&L: ${isWin ? '\\+' : '\\-'}\\$${e(Math.abs(profitUsd).toFixed(2))}`;
    new Promise((resolve, reject) => this.messageQueue.push({ text: msg, resolve, reject }));
  }

  public alertCircuitBreaker(drawdown: number) {
    const msg = `⚠️ *CIRCUIT BREAKER ACTIVADO* ⚠️\nDrawdown diario superado \\(${e(drawdown.toFixed(2))}%\\)\nCapital protegido prioritario\\.`;
    new Promise((resolve, reject) => this.messageQueue.push({ text: msg, resolve, reject }));
  }
}

export const telegramBot = TelegramService.getInstance();
