import { Candle } from '../types/institutional';

export interface SwingPoint {
  index: number;
  price: number;
  type: 'HIGH' | 'LOW';
}

export interface KeyLevels {
  swingHighs: number[];
  swingLows: number[];
  nearestResistance: number;
  nearestSupport: number;
  pivotPoint: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export class Indicators {
  // 1. Exponential Moving Average (EMA)
  public static calculateEMA(prices: number[], period: number): number[] {
    if (prices.length < period) return new Array(prices.length).fill(0);
    const ema: number[] = new Array(prices.length).fill(0);
    
    // First value is simple moving average (SMA)
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += prices[i];
    }
    const sma = sum / period;
    ema[period - 1] = sma;

    const multiplier = 2 / (period + 1);
    for (let i = period; i < prices.length; i++) {
      ema[i] = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
    }
    return ema;
  }

  // 2. Relative Strength Index (RSI)
  public static calculateRSI(prices: number[], period = 14): number[] {
    if (prices.length <= period) return new Array(prices.length).fill(50);
    const rsi: number[] = new Array(prices.length).fill(50);

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      const difference = prices[i] - prices[i - 1];
      gains.push(difference > 0 ? difference : 0);
      losses.push(difference < 0 ? -difference : 0);
    }

    // First average gain and loss (SMA)
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 0; i < period; i++) {
      avgGain += gains[i];
      avgLoss += losses[i];
    }
    avgGain /= period;
    avgLoss /= period;

    // Wilder's smoothing
    if (avgLoss === 0) {
      rsi[period] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[period] = 100 - 100 / (1 + rs);
    }

    for (let i = period + 1; i < prices.length; i++) {
      const currentGain = gains[i - 1];
      const currentLoss = losses[i - 1];

      avgGain = (avgGain * (period - 1) + currentGain) / period;
      avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

      if (avgLoss === 0) {
        rsi[i] = 100;
      } else {
        const rs = avgGain / avgLoss;
        rsi[i] = 100 - 100 / (1 + rs);
      }
    }

    return rsi;
  }

  // 3. Average True Range (ATR)
  public static calculateATR(candles: Candle[], period = 14): number[] {
    if (candles.length < 2) return new Array(candles.length).fill(0);
    const tr: number[] = new Array(candles.length).fill(0);
    tr[0] = candles[0].high - candles[0].low;

    for (let i = 1; i < candles.length; i++) {
      const c = candles[i];
      const prevC = candles[i - 1];
      tr[i] = Math.max(
        c.high - c.low,
        Math.abs(c.high - prevC.close),
        Math.abs(c.low - prevC.close)
      );
    }

    const atr: number[] = new Array(candles.length).fill(0);
    let trSum = 0;
    for (let i = 0; i < period; i++) {
      trSum += tr[i];
    }
    atr[period - 1] = trSum / period;

    for (let i = period; i < candles.length; i++) {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }

    return atr;
  }

  // 4. Average Directional Index (ADX)
  public static calculateADX(candles: Candle[], period = 14): { adx: number[]; plusDI: number[]; minusDI: number[] } {
    const len = candles.length;
    const adx = new Array(len).fill(0);
    const plusDI = new Array(len).fill(0);
    const minusDI = new Array(len).fill(0);

    if (len < period * 2) {
      return { adx, plusDI, minusDI };
    }

    const tr = new Array(len).fill(0);
    const plusDM = new Array(len).fill(0);
    const minusDM = new Array(len).fill(0);

    tr[0] = candles[0].high - candles[0].low;
    for (let i = 1; i < len; i++) {
      const c = candles[i];
      const prevC = candles[i - 1];

      tr[i] = Math.max(
        c.high - c.low,
        Math.abs(c.high - prevC.close),
        Math.abs(c.low - prevC.close)
      );

      const upMove = c.high - prevC.high;
      const downMove = prevC.low - c.low;

      if (upMove > downMove && upMove > 0) {
        plusDM[i] = upMove;
      } else {
        plusDM[i] = 0;
      }

      if (downMove > upMove && downMove > 0) {
        minusDM[i] = downMove;
      } else {
        minusDM[i] = 0;
      }
    }

    // Wilder's smoothing
    let smoothedTR = 0;
    let smoothedPlusDM = 0;
    let smoothedMinusDM = 0;

    for (let i = 0; i < period; i++) {
      smoothedTR += tr[i];
      smoothedPlusDM += plusDM[i];
      smoothedMinusDM += minusDM[i];
    }

    plusDI[period - 1] = smoothedTR > 0 ? 100 * (smoothedPlusDM / smoothedTR) : 0;
    minusDI[period - 1] = smoothedTR > 0 ? 100 * (smoothedMinusDM / smoothedTR) : 0;

    const dx = new Array(len).fill(0);
    let diSum = plusDI[period - 1] + minusDI[period - 1];
    dx[period - 1] = diSum > 0 ? 100 * Math.abs(plusDI[period - 1] - minusDI[period - 1]) / diSum : 0;

    for (let i = period; i < len; i++) {
      smoothedTR = smoothedTR - (smoothedTR / period) + tr[i];
      smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
      smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];

      plusDI[i] = smoothedTR > 0 ? 100 * (smoothedPlusDM / smoothedTR) : 0;
      minusDI[i] = smoothedTR > 0 ? 100 * (smoothedMinusDM / smoothedTR) : 0;

      diSum = plusDI[i] + minusDI[i];
      dx[i] = diSum > 0 ? 100 * Math.abs(plusDI[i] - minusDI[i]) / diSum : 0;
    }

    let dxSum = 0;
    for (let i = period - 1; i < period * 2 - 1; i++) {
      dxSum += dx[i];
    }
    adx[period * 2 - 2] = dxSum / period;

    for (let i = period * 2 - 1; i < len; i++) {
      adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
    }

    return { adx, plusDI, minusDI };
  }

  // ══════════════════════════════════════════════
  //  5. SWING POINT DETECTION (Structure-Based)
  // ══════════════════════════════════════════════
  /**
   * Detecta swing highs y swing lows usando N velas de confirmación.
   * Un swing high es una vela cuyo high es mayor que los N vecinos a cada lado.
   * Un swing low es lo inverso.
   */
  public static findSwingPoints(candles: Candle[], lookback = 3): SwingPoint[] {
    const points: SwingPoint[] = [];
    if (candles.length < lookback * 2 + 1) return points;

    for (let i = lookback; i < candles.length - lookback; i++) {
      let isSwingHigh = true;
      let isSwingLow = true;

      for (let j = 1; j <= lookback; j++) {
        if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
          isSwingHigh = false;
        }
        if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
          isSwingLow = false;
        }
      }

      if (isSwingHigh) {
        points.push({ index: i, price: candles[i].high, type: 'HIGH' });
      }
      if (isSwingLow) {
        points.push({ index: i, price: candles[i].low, type: 'LOW' });
      }
    }
    return points;
  }

  // ══════════════════════════════════════════════
  //  6. PIVOT POINTS (Classic Floor Pivots)
  // ══════════════════════════════════════════════
  /**
   * Calcula pivot points clásicos a partir de la última sesión completa.
   * Usa las últimas N velas como "sesión".
   */
  public static calculatePivotPoints(candles: Candle[], sessionBars = 6): {
    pp: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number;
  } {
    if (candles.length < sessionBars) {
      const last = candles[candles.length - 1];
      return { pp: last?.close || 0, r1: 0, r2: 0, r3: 0, s1: 0, s2: 0, s3: 0 };
    }

    const session = candles.slice(-sessionBars - 1, -1); // sesión anterior
    let high = -Infinity, low = Infinity, close = 0;
    for (const c of session) {
      high = Math.max(high, c.high);
      low = Math.min(low, c.low);
      close = c.close;
    }

    const pp = (high + low + close) / 3;
    const r1 = 2 * pp - low;
    const s1 = 2 * pp - high;
    const r2 = pp + (high - low);
    const s2 = pp - (high - low);
    const r3 = high + 2 * (pp - low);
    const s3 = low - 2 * (high - pp);

    return { pp, r1, r2, r3, s1, s2, s3 };
  }

  // ══════════════════════════════════════════════
  //  7. KEY LEVELS (Estructura completa para SL/TP)
  // ══════════════════════════════════════════════
  /**
   * Combina swing points y pivot points para generar niveles clave
   * de soporte y resistencia cerca del precio actual.
   */
  public static calculateKeyLevels(candles: Candle[], currentPrice: number): KeyLevels {
    // Swing points recientes (últimas 50 velas)
    const recentCandles = candles.slice(-50);
    const swings = this.findSwingPoints(recentCandles, 3);
    
    const swingHighs = swings
      .filter(s => s.type === 'HIGH')
      .map(s => s.price)
      .sort((a, b) => a - b);
    
    const swingLows = swings
      .filter(s => s.type === 'LOW')
      .map(s => s.price)
      .sort((a, b) => b - a); // Desc para encontrar el más cercano abajo

    // Pivot points
    const pivots = this.calculatePivotPoints(candles);

    // Resistencia más cercana (precio por encima del actual)
    const allResistances = [
      ...swingHighs.filter(p => p > currentPrice),
      ...[pivots.r1, pivots.r2, pivots.r3].filter(p => p > currentPrice),
    ].sort((a, b) => a - b);

    // Soporte más cercano (precio por debajo del actual)
    const allSupports = [
      ...swingLows.filter(p => p < currentPrice),
      ...[pivots.s1, pivots.s2, pivots.s3].filter(p => p < currentPrice),
    ].sort((a, b) => b - a);

    return {
      swingHighs,
      swingLows,
      nearestResistance: allResistances[0] || currentPrice * 1.005,
      nearestSupport: allSupports[0] || currentPrice * 0.995,
      pivotPoint: pivots.pp,
      r1: pivots.r1,
      r2: pivots.r2,
      r3: pivots.r3,
      s1: pivots.s1,
      s2: pivots.s2,
      s3: pivots.s3,
    };
  }

  // ══════════════════════════════════════════════
  //  8. FIBONACCI EXTENSIONS (para Take Profits)
  // ══════════════════════════════════════════════
  /**
   * Calcula extensiones de Fibonacci desde un swing reciente.
   * swingStart: inicio del movimiento (swing low para BUY, swing high para SELL)
   * swingEnd: fin del movimiento (precio actual)
   */
  public static calculateFibExtensions(swingStart: number, swingEnd: number): {
    fib1: number; fib1618: number; fib2: number; fib2618: number; fib3: number;
  } {
    const range = Math.abs(swingEnd - swingStart);
    const direction = swingEnd > swingStart ? 1 : -1;

    return {
      fib1: swingEnd + direction * range * 1.0,
      fib1618: swingEnd + direction * range * 1.618,
      fib2: swingEnd + direction * range * 2.0,
      fib2618: swingEnd + direction * range * 2.618,
      fib3: swingEnd + direction * range * 3.0,
    };
  }

  // ══════════════════════════════════════════════
  //  9. HIGH PROBABILITY INSTITUTIONAL INDICATORS
  // ══════════════════════════════════════════════

  public static calculateSMA(prices: number[], period: number): number[] {
    const sma = new Array(prices.length).fill(0);
    if (prices.length < period) return sma;
    let sum = 0;
    for (let i = 0; i < period; i++) sum += prices[i];
    sma[period - 1] = sum / period;
    for (let i = period; i < prices.length; i++) {
      sum = sum - prices[i - period] + prices[i];
      sma[i] = sum / period;
    }
    return sma;
  }

  public static calculateBollingerBands(prices: number[], period = 20, stdDevMult = 2): {
    upper: number[]; basis: number[]; lower: number[];
  } {
    const basis = this.calculateSMA(prices, period);
    const upper = new Array(prices.length).fill(0);
    const lower = new Array(prices.length).fill(0);

    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = basis[i];
      const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      upper[i] = mean + stdDevMult * stdDev;
      lower[i] = mean - stdDevMult * stdDev;
    }
    return { upper, basis, lower };
  }

  public static calculateKeltnerChannels(candles: Candle[], period = 20, multiplier = 1.5): {
    upper: number[]; basis: number[]; lower: number[];
  } {
    const closes = candles.map(c => c.close);
    const basis = this.calculateEMA(closes, period);
    const atr = this.calculateATR(candles, period);
    
    const upper = new Array(candles.length).fill(0);
    const lower = new Array(candles.length).fill(0);

    for (let i = period - 1; i < candles.length; i++) {
      upper[i] = basis[i] + multiplier * atr[i];
      lower[i] = basis[i] - multiplier * atr[i];
    }
    return { upper, basis, lower };
  }

  /**
   * TTM Squeeze: True si las Bollinger Bands están completamente dentro de los Keltner Channels.
   * Indica que la volatilidad es extremadamente baja y está acumulando energía.
   */
  public static calculateTTMSqueeze(candles: Candle[], period = 20, bbMult = 2, kcMult = 1.5): boolean[] {
    const closes = candles.map(c => c.close);
    const bb = this.calculateBollingerBands(closes, period, bbMult);
    const kc = this.calculateKeltnerChannels(candles, period, kcMult);
    
    const squeezeOn = new Array(candles.length).fill(false);
    for (let i = period - 1; i < candles.length; i++) {
      // Squeeze is "ON" when BB is narrower than KC
      squeezeOn[i] = bb.upper[i] < kc.upper[i] && bb.lower[i] > kc.lower[i];
    }
    return squeezeOn;
  }

  /**
   * Money Flow Index (MFI)
   * Combina precio y volumen. >80 sobrecomprado, <20 sobrevendido.
   */
  public static calculateMFI(candles: Candle[], period = 14): number[] {
    const mfi = new Array(candles.length).fill(50);
    if (candles.length <= period) return mfi;

    const typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
    const rawMoneyFlow = typicalPrices.map((tp, i) => tp * candles[i].volume);

    for (let i = period; i < candles.length; i++) {
      let positiveFlow = 0;
      let negativeFlow = 0;

      for (let j = i - period + 1; j <= i; j++) {
        if (typicalPrices[j] > typicalPrices[j - 1]) {
          positiveFlow += rawMoneyFlow[j];
        } else if (typicalPrices[j] < typicalPrices[j - 1]) {
          negativeFlow += rawMoneyFlow[j];
        }
      }

      if (negativeFlow === 0) {
        mfi[i] = 100;
      } else {
        const moneyFlowRatio = positiveFlow / negativeFlow;
        mfi[i] = 100 - (100 / (1 + moneyFlowRatio));
      }
    }
    return mfi;
  }

  // ══════════════════════════════════════════════
  //  10. ESTIMACIÓN DE TIEMPO DE TRADE (NUEVO)
  // ══════════════════════════════════════════════

  /**
   * Calcula el ATR promedio por hora a partir de velas de 1H.
   * Esto nos dice cuántos pips se mueve el par típicamente cada hora.
   */
  public static calculateAtrPerHour(candles1H: Candle[], digits: number): number {
    if (candles1H.length < 10) return 10; // fallback default
    const pipSize = digits <= 3 ? 0.01 : 0.0001;
    const atrValues = this.calculateATR(candles1H, 14);
    
    // Media de los últimos 20 valores de ATR 1H (una semana aprox)
    const recent = atrValues.slice(-20).filter(v => v > 0);
    if (recent.length === 0) return 10;
    const avgAtr = recent.reduce((a, b) => a + b, 0) / recent.length;
    return avgAtr / pipSize; // convertir a pips
  }

  /**
   * Estima las horas que tardaría el precio en alcanzar un target.
   * Basado en ATR/hora ajustado por sesión y momentum (RSI).
   *
   * @param distancePips - Distancia al target en pips
   * @param atrPerHour   - ATR promedio por hora en pips
   * @param session      - Sesión actual (London, New York, etc.)
   * @param rsi          - RSI actual para ajuste de momentum
   * @param direction    - 'BUY' | 'SELL' para ajuste de momentum
   */
  public static estimateTradeTime(
    distancePips: number,
    atrPerHour: number,
    session: string,
    rsi: number,
    direction: 'BUY' | 'SELL' | 'NEUTRAL'
  ): { minHours: number; maxHours: number; label: string } {
    if (atrPerHour <= 0 || distancePips <= 0) {
      return { minHours: 1, maxHours: 24, label: '1-24 horas' };
    }

    // Multiplicador de sesión (velocidad relativa)
    let sessionMultiplier = 1.0;
    if (session.includes('NY Overlap') || session.includes('London')) {
      sessionMultiplier = 1.4; // Máxima velocidad
    } else if (session.includes('New York')) {
      sessionMultiplier = 1.2;
    } else if (session.includes('Tokyo') || session.includes('Sydney')) {
      sessionMultiplier = 0.7; // Más lento
    }

    // Multiplicador de momentum (RSI extremo = más rápido)
    let momentumMultiplier = 1.0;
    if (direction === 'BUY' && rsi > 60) momentumMultiplier = 1.25;
    else if (direction === 'BUY' && rsi < 45) momentumMultiplier = 0.8;
    else if (direction === 'SELL' && rsi < 40) momentumMultiplier = 1.25;
    else if (direction === 'SELL' && rsi > 55) momentumMultiplier = 0.8;

    // Velocidad efectiva en pips/hora
    const effectiveSpeed = atrPerHour * sessionMultiplier * momentumMultiplier;

    // Solo el precio raramente se mueve en línea recta hacia el objetivo.
    // En mercados FX, se estima que el precio "trabaja" el target con 40-60% de eficiencia.
    const efficiency = 0.4;
    const baseHours = distancePips / (effectiveSpeed * efficiency);

    const minHours = Math.max(0.5, Math.round(baseHours * 0.7 * 2) / 2);
    const maxHours = Math.max(minHours + 1, Math.round(baseHours * 1.8 * 2) / 2);

    // Convertir a label legible
    const formatTime = (h: number) => {
      if (h < 1) return `${Math.round(h * 60)}min`;
      if (h < 24) return `${h % 1 === 0 ? h : h.toFixed(1)}h`;
      const days = Math.round(h / 24 * 10) / 10;
      return `${days}d`;
    };

    return {
      minHours,
      maxHours,
      label: `${formatTime(minHours)} – ${formatTime(maxHours)}`
    };
  }
}
