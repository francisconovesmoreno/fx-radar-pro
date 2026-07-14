export type RegimeType = 'trend' | 'volatile' | 'range';
export type SignalDirection = 'BUY' | 'SELL' | 'NEUTRAL';
export type SignalGrade = 'A+' | 'A' | 'B' | 'C' | 'REJECTED';
export type SignalStatus = 'OPEN' | 'CLOSED_WIN' | 'CLOSED_LOSS' | 'PENDING';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Nivel de precio individual con toda la info para el trader */
export interface TradeLevel {
  price: number;
  pips: number;       // Distancia en pips desde entry
  dollars: number;    // P&L en USD a este nivel
  rMultiple: number;  // Múltiplo de R (1R = riesgo base)
  label: string;      // "SL", "TP1", "TP2", "TP3", "BE"
  source: string;     // De dónde viene: "ATR", "Swing", "Fib", "Pivot"
}

/**
 * Detalle de cada estrella del sistema de 5★
 */
export interface StarDetail {
  id: number;           // 1-5
  name: string;         // e.g. "Tendencia Macro (1D)"
  passed: boolean;
  value: string;        // e.g. "EMA200: 1.0820 ✅"
  weight: number;       // peso relativo (1=normal, 2=crítico)
}

export interface PairState {
  symbol: string;
  display: string;
  price: number;
  digits: number;
  direction: SignalDirection;
  score: number;
  confidence: number;
  probability: number;
  expectedR: number;
  regime: RegimeType;
  adx4h: number;
  rsi1h: number;
  rsi4h: number;
  atrPips: number;
  atrPerHour: number;   // ATR promedio por hora (para estimación de tiempo)
  session: string;
  newsBlocked: boolean;
  confluences: string[];
  stars: number;           // 0-5 estrellas de calidad
  starDetails: StarDetail[];
  // Debug & gate info
  rejectedReason: string;
  gateDetails: { name: string; passed: boolean; value: string }[];
  relativeVolume: number;
  // Key levels de estructura
  nearestSupport: number;
  nearestResistance: number;
}

export interface Signal {
  id: string;
  symbol: string;
  display: string;
  direction: SignalDirection;
  grade: SignalGrade;
  stars: number;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp3: number;
  trailingStop: number;
  expectedR: number;
  openedAt: number;
  status: SignalStatus;
  positionSizeUsd: number;
  // Niveles detallados con pips y dólares
  levels: TradeLevel[];
  // Info de sizing
  suggestedLots: number;
  riskDollars: number;
  rewardTP1Dollars: number;
  rewardTP2Dollars: number;
  rewardTP3Dollars: number;
  riskRewardRatio: number;
  breakEvenPrice: number;
  // Fuentes de los niveles
  slSource: string;
  tp1Source: string;
  // Estimación temporal (NUEVO)
  estimatedHoursToTP1: number;  // Horas estimadas hasta TP1
  estimatedHoursToTP3: number;  // Horas estimadas hasta TP3
  sessionAtOpen: string;        // Sesión cuando se abrió
  // Star details
  starDetails: StarDetail[];
}

export interface RiskMetrics {
  equity: number;
  dailyStartEquity: number;
  dailyDD: number;
  circuitBreakerActive: boolean;
  maxDD: number;
  activeCorrelationMatrix: Record<string, Record<string, number>>;
}

export interface EngineLogEntry {
  id: string;
  timestamp: number;
  symbol: string;
  type: 'SIGNAL' | 'REJECTED' | 'GATE_PASS' | 'INFO' | 'WARNING';
  message: string;
  details?: string;
}
