import { PairState, Signal, SignalDirection, SignalGrade, RiskMetrics, TradeLevel, Candle, StarDetail } from '../types/institutional';
import { Indicators, KeyLevels } from './Indicators';

export class QuantEngine {
  private static MAX_RISK_PER_TRADE = 0.01;
  private static KELLY_FRACTION = 0.25;

  // ══════════════════════════════════════════════
  //  SISTEMA DE 5 ESTRELLAS — Evaluación Jerárquica
  //  Solo con 4★+ se genera señal ejecutable
  // ══════════════════════════════════════════════
  public static evaluateFiveStars(
    pair: PairState & {
      closes1D: number[]; ema200_1D: number;
      emasBullish4H: boolean; emasBearish4H: boolean;
      adx: number; rsi4h: number; macdBullish: boolean; macdBearish: boolean;
      squeeze: boolean; inKeyZone: boolean; mfi: number;
      dxyBias: 'BUY' | 'SELL' | 'NEUTRAL'; relativeVolume: number;
    },
    direction: SignalDirection
  ): { stars: number; details: StarDetail[]; passed: boolean } {
    const details: StarDetail[] = [];
    const isBuy = direction === 'BUY';
    const isSell = direction === 'SELL';

    // ═══ ⭐ 1 — TENDENCIA MACRO (1D) — CRÍTICA, peso 2 ═══
    const star1 = isBuy
      ? pair.price > pair.ema200_1D && pair.ema200_1D > 0
      : isSell
      ? pair.price < pair.ema200_1D && pair.ema200_1D > 0
      : false;
    details.push({
      id: 1,
      name: 'Tendencia Macro (1D)',
      passed: star1,
      value: pair.ema200_1D > 0
        ? `Precio ${isBuy ? '>' : '<'} EMA200: ${pair.ema200_1D.toFixed(pair.digits > 3 ? 4 : 2)}`
        : 'Sin datos 1D suficientes',
      weight: 2,
    });

    // ═══ ⭐ 2 — TENDENCIA INTERMEDIA (4H) ═══
    const star2 = isBuy
      ? pair.emasBullish4H && pair.adx > 22
      : isSell
      ? pair.emasBearish4H && pair.adx > 22
      : false;
    details.push({
      id: 2,
      name: 'Tendencia 4H + Fuerza (ADX)',
      passed: star2,
      value: `EMA50>EMA200: ${pair.emasBullish4H || pair.emasBearish4H ? '✅' : '❌'} | ADX: ${pair.adx.toFixed(1)}`,
      weight: 1,
    });

    // ═══ ⭐ 3 — MOMENTUM TÉCNICO ═══
    const rsiOk = isBuy
      ? pair.rsi4h > 50 && pair.rsi4h < 70 // En zona alcista pero no sobrecomprado
      : isSell
      ? pair.rsi4h < 50 && pair.rsi4h > 30 // En zona bajista pero no sobrevendido
      : false;
    const star3 = rsiOk && (isBuy ? pair.macdBullish : pair.macdBearish);
    details.push({
      id: 3,
      name: 'Momentum (RSI + MACD)',
      passed: star3,
      value: `RSI 4H: ${pair.rsi4h.toFixed(1)} | MACD ${isBuy ? pair.macdBullish ? '✅' : '❌' : pair.macdBearish ? '✅' : '❌'}`,
      weight: 1,
    });

    // ═══ ⭐ 4 — ESTRUCTURA + VOLATILIDAD ═══
    // Squeeze = energía acumulada; o zona clave de estructura
    const star4 = pair.squeeze || pair.inKeyZone;
    details.push({
      id: 4,
      name: 'Estructura / Acumulación (Squeeze)',
      passed: star4,
      value: `Squeeze: ${pair.squeeze ? '🔥 Activo' : 'Inactivo'} | Zona Clave: ${pair.inKeyZone ? '✅' : '❌'}`,
      weight: 1,
    });

    // ═══ ⭐ 5 — CONFLUENCIA MACRO + VOLUMEN ═══
    const mfiOk = isBuy ? pair.mfi < 75 && pair.mfi > 30 : pair.mfi > 25 && pair.mfi < 70;
    const dxyOk = this.checkDxyCorrelation(pair.symbol, direction, pair.dxyBias);
    const volOk = pair.relativeVolume >= 1.0;
    const star5 = mfiOk && (dxyOk || volOk);
    details.push({
      id: 5,
      name: 'Macro (MFI + DXY + Volumen)',
      passed: star5,
      value: `MFI: ${pair.mfi.toFixed(0)} | DXY ${dxyOk ? '✅' : '❌'} | RVol: ${pair.relativeVolume.toFixed(2)}x`,
      weight: 1,
    });

    // Contar estrellas (★1 vale doble por ser la más crítica)
    const rawStars = details.reduce((sum, d) => sum + (d.passed ? d.weight : 0), 0);
    // Máximo posible: 2+1+1+1+1 = 6 → normalizar a 5
    const stars = Math.round((rawStars / 6) * 5);

    return {
      stars,
      details,
      passed: stars >= 4, // Mínimo 4★ para señal ejecutable
    };
  }

  private static checkDxyCorrelation(
    symbol: string,
    direction: SignalDirection,
    dxyBias: 'BUY' | 'SELL' | 'NEUTRAL'
  ): boolean {
    const isUSDQuote = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD'].includes(symbol);
    const isUSDBase = ['USDJPY', 'USDCHF', 'USDCAD'].includes(symbol);
    if (isUSDQuote) return direction === 'BUY' ? dxyBias === 'SELL' : dxyBias === 'BUY';
    if (isUSDBase)  return direction === 'BUY' ? dxyBias === 'BUY' : dxyBias === 'SELL';
    return true; // Pares cruzados (EURGBP) siempre pasan
  }

  // ══════════════════════════════════════════════
  //  GATE DE SEÑALES — Basado en 5 Estrellas
  // ══════════════════════════════════════════════
  public static evaluateSignalGate(
    pair: PairState,
    relativeVolume: number,
    risk: RiskMetrics,
    _activeSignals: Signal[]
  ): { valid: boolean; grade: SignalGrade; reason: string } {
    // ─ Gates duros (bloqueo absoluto) ─
    if (risk.circuitBreakerActive || risk.dailyDD >= 5.0)
      return { valid: false, grade: 'REJECTED', reason: '🔴 Circuit Breaker activo (DD > 5%)' };
    if (pair.newsBlocked)
      return { valid: false, grade: 'REJECTED', reason: '📰 Noticia macro activa (bloqueo ±30min)' };
    if (pair.direction === 'NEUTRAL')
      return { valid: false, grade: 'REJECTED', reason: '⚪ Sin dirección de tendencia' };

    // ─ Sistema de estrellas para calidad ─
    const stars = pair.stars;

    if (stars >= 5)
      return { valid: true, grade: 'A+', reason: `⭐⭐⭐⭐⭐ Setup Institucional Perfecto` };
    if (stars >= 4)
      return { valid: true, grade: 'A', reason: `⭐⭐⭐⭐ Alta Probabilidad (${stars}★)` };

    // Debajo de 4★ → REJECT con motivo específico
    if (stars === 3)
      return { valid: false, grade: 'REJECTED', reason: `🟡 Solo 3★ — Falta confirmación clave` };
    if (stars <= 2)
      return { valid: false, grade: 'REJECTED', reason: `🔴 ${stars}★ insuficiente — Setup de baja calidad` };

    return { valid: false, grade: 'REJECTED', reason: '⚪ No supera el filtro de 5 estrellas' };
  }

  // ══════════════════════════════════════════════
  //  CÁLCULO DE NIVELES PRECISOS (SL/TP)
  // ══════════════════════════════════════════════
  public static calculatePreciseLevels(
    entry: number,
    direction: SignalDirection,
    atrPips: number,
    digits: number,
    keyLevels: KeyLevels,
    candles4H: Candle[],
    _equity: number,
    positionSizeUsd: number,
  ): {
    stop: number; tp1: number; tp2: number; tp3: number;
    levels: TradeLevel[];
    slSource: string; tp1Source: string;
    riskDollars: number; rewardTP1: number; rewardTP2: number; rewardTP3: number;
    suggestedLots: number; riskRewardRatio: number; breakEvenPrice: number;
  } {
    const pipSize = digits <= 3 ? 0.01 : 0.0001;
    const pipValue = 10; // USD per pip per standard lot
    const isBuy = direction === 'BUY';
    const atrDistance = atrPips * 1.5 * pipSize;

    // ═══ STOP LOSS — Estructura + ATR ═══
    let stop: number;
    let slSource: string;
    const maxDistance = atrPips * 2.5 * pipSize;

    if (isBuy) {
      const structureStop = keyLevels.nearestSupport - 3 * pipSize;
      const atrStop = entry - atrDistance;
      if (structureStop > 0 && entry - structureStop <= maxDistance && structureStop < entry) {
        stop = structureStop; slSource = 'Swing Low';
      } else {
        stop = atrStop; slSource = 'ATR ×1.5';
      }
      if (entry - stop < atrPips * 0.5 * pipSize) { stop = atrStop; slSource = 'ATR ×1.5'; }
    } else {
      const structureStop = keyLevels.nearestResistance + 3 * pipSize;
      const atrStop = entry + atrDistance;
      if (structureStop > 0 && structureStop - entry <= maxDistance && structureStop > entry) {
        stop = structureStop; slSource = 'Swing High';
      } else {
        stop = atrStop; slSource = 'ATR ×1.5';
      }
      if (stop - entry < atrPips * 0.5 * pipSize) { stop = atrStop; slSource = 'ATR ×1.5'; }
    }
    stop = Number(stop.toFixed(digits));

    const slPips = Math.abs(entry - stop) / pipSize;
    const riskPerPip = positionSizeUsd / slPips;
    const slDistance = Math.abs(entry - stop);

    // ═══ TAKE PROFITS — Fibonacci + Structure + R:R ═══
    let tp1: number, tp2: number, tp3: number;
    let tp1Source: string;

    if (isBuy) {
      const tp1_rr = entry + slDistance * 1.5;
      const tp1_struct = keyLevels.nearestResistance > entry
        ? keyLevels.nearestResistance - 2 * pipSize : tp1_rr;
      if (tp1_struct > entry && (tp1_struct - entry) >= slDistance) {
        tp1 = Math.min(tp1_rr, tp1_struct);
        tp1Source = tp1 === tp1_struct ? 'Resistencia' : 'R:R 1.5';
      } else {
        tp1 = tp1_rr; tp1Source = 'R:R 1.5';
      }
      tp2 = keyLevels.r2 > tp1 ? Math.min(entry + slDistance * 2.5, keyLevels.r2 - 2 * pipSize) : entry + slDistance * 2.5;
      tp3 = entry + slDistance * 4.0;
    } else {
      const tp1_rr = entry - slDistance * 1.5;
      const tp1_struct = keyLevels.nearestSupport < entry
        ? keyLevels.nearestSupport + 2 * pipSize : tp1_rr;
      if (tp1_struct < entry && (entry - tp1_struct) >= slDistance) {
        tp1 = Math.max(tp1_rr, tp1_struct);
        tp1Source = tp1 === tp1_struct ? 'Soporte' : 'R:R 1.5';
      } else {
        tp1 = tp1_rr; tp1Source = 'R:R 1.5';
      }
      tp2 = keyLevels.s2 < tp1 ? Math.max(entry - slDistance * 2.5, keyLevels.s2 + 2 * pipSize) : entry - slDistance * 2.5;
      tp3 = entry - slDistance * 4.0;
    }

    tp1 = Number(tp1.toFixed(digits));
    tp2 = Number(tp2.toFixed(digits));
    tp3 = Number(tp3.toFixed(digits));

    // ═══ RISK & REWARD CALCULATIONS ═══
    const tp1Pips = Math.abs(tp1 - entry) / pipSize;
    const tp2Pips = Math.abs(tp2 - entry) / pipSize;
    const tp3Pips = Math.abs(tp3 - entry) / pipSize;
    const riskRewardRatio = tp1Pips / slPips;
    const riskDollars = riskPerPip * slPips;
    const rewardTP1 = riskPerPip * tp1Pips;
    const rewardTP2 = riskPerPip * tp2Pips;
    const rewardTP3 = riskPerPip * tp3Pips;
    const suggestedLots = slPips > 0 && pipValue > 0
      ? Number((riskDollars / (pipValue * slPips)).toFixed(2)) : 0.01;
    const breakEvenPrice = entry;

    // ═══ NIVELES ORDENADOS ═══
    const levels: TradeLevel[] = isBuy
      ? [
          { price: stop, pips: -slPips, dollars: -riskDollars, rMultiple: -1, label: '🛑 STOP', source: slSource },
          { price: entry, pips: 0, dollars: 0, rMultiple: 0, label: '▶️ ENTRY', source: 'Market' },
          { price: tp1, pips: tp1Pips, dollars: rewardTP1, rMultiple: Number((tp1Pips/slPips).toFixed(1)), label: '🎯 TP1', source: tp1Source },
          { price: tp2, pips: tp2Pips, dollars: rewardTP2, rMultiple: Number((tp2Pips/slPips).toFixed(1)), label: '🎯 TP2', source: 'Fib/R:R' },
          { price: tp3, pips: tp3Pips, dollars: rewardTP3, rMultiple: Number((tp3Pips/slPips).toFixed(1)), label: '🚀 TP3', source: 'Extensión' },
        ]
      : [
          { price: tp3, pips: tp3Pips, dollars: rewardTP3, rMultiple: Number((tp3Pips/slPips).toFixed(1)), label: '🚀 TP3', source: 'Extensión' },
          { price: tp2, pips: tp2Pips, dollars: rewardTP2, rMultiple: Number((tp2Pips/slPips).toFixed(1)), label: '🎯 TP2', source: 'Fib/R:R' },
          { price: tp1, pips: tp1Pips, dollars: rewardTP1, rMultiple: Number((tp1Pips/slPips).toFixed(1)), label: '🎯 TP1', source: tp1Source },
          { price: entry, pips: 0, dollars: 0, rMultiple: 0, label: '▶️ ENTRY', source: 'Market' },
          { price: stop, pips: -slPips, dollars: -riskDollars, rMultiple: -1, label: '🛑 STOP', source: slSource },
        ];

    return { stop, tp1, tp2, tp3, levels, slSource, tp1Source, riskDollars, rewardTP1, rewardTP2, rewardTP3, suggestedLots, riskRewardRatio, breakEvenPrice };
  }

  // ══════════════════════════════════════════════
  //  SIZING INSTITUCIONAL (Kelly + Optimal f)
  // ══════════════════════════════════════════════
  public static calculateOptimalPositionSize(equity: number, winRate: number, payoffRatio: number, currentAtr: number, meanAtr: number): number {
    if (winRate <= 0 || payoffRatio <= 0) return 0;
    const optimalF = ((winRate * payoffRatio) - (1 - winRate)) / payoffRatio;
    let targetRiskPct = Math.max(0, optimalF * this.KELLY_FRACTION);
    if (currentAtr > meanAtr * 1.5) targetRiskPct *= 0.6;
    targetRiskPct = Math.min(targetRiskPct, this.MAX_RISK_PER_TRADE);
    if (targetRiskPct <= 0 && winRate > 0.40) targetRiskPct = 0.002;
    return Math.round(equity * targetRiskPct);
  }

  // ══════════════════════════════════════════════
  //  TRAILING STOP DINÁMICO ATR
  // ══════════════════════════════════════════════
  public static updateTrailingStop(currentPrice: number, currentStop: number, atrPips: number, direction: SignalDirection, pipSize: number): number {
    const atrDistance = (atrPips * 1.5) * pipSize;
    if (direction === 'BUY') {
      const potentialStop = currentPrice - atrDistance;
      return potentialStop > currentStop ? Number(potentialStop.toFixed(5)) : currentStop;
    } else if (direction === 'SELL') {
      const potentialStop = currentPrice + atrDistance;
      return potentialStop < currentStop || currentStop === 0 ? Number(potentialStop.toFixed(5)) : currentStop;
    }
    return currentStop;
  }
}
