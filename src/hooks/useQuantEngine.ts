import { useState, useEffect, useRef, useCallback } from 'react';
import { PairState, Signal, RiskMetrics, Candle, EngineLogEntry } from '../types/institutional';
import { QuantEngine } from '../core/QuantEngine';
import { Indicators, KeyLevels } from '../core/Indicators';
import { telegramBot } from '../services/telegram.service';
import { MarketDataService } from '../services/marketData.service';

/* ─── Pares monitoreados (precio se rellena con Yahoo) ─── */
const createDefaultPair = (symbol: string, display: string, digits: number): PairState => ({
  symbol, display, price: 0, digits, direction: 'NEUTRAL',
  score: 0, confidence: 0, probability: 0, expectedR: 0,
  regime: 'range', adx4h: 0, rsi1h: 50, rsi4h: 50, atrPips: 0,
  session: '', newsBlocked: false, confluences: [],
  rejectedReason: '', gateDetails: [], relativeVolume: 0,
});

const WATCHED_PAIRS: PairState[] = [
  createDefaultPair('EURUSD', 'EUR/USD', 5),
  createDefaultPair('GBPUSD', 'GBP/USD', 5),
  createDefaultPair('USDJPY', 'USD/JPY', 3),
  createDefaultPair('AUDUSD', 'AUD/USD', 5),
  createDefaultPair('USDCHF', 'USD/CHF', 5),
  createDefaultPair('USDCAD', 'USD/CAD', 5),
  createDefaultPair('EURGBP', 'EUR/GBP', 5),
  createDefaultPair('NZDUSD', 'NZD/USD', 5),
];

/* ─── Detección de Mercado Abierto/Cerrado ─── */
function isMarketOpen(): { open: boolean; reason: string; nextOpen: string } {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();

  // Forex está cerrado de viernes 22:00 UTC a domingo 22:00 UTC
  if (utcDay === 6) {
    return { open: false, reason: 'Sábado — Mercado cerrado', nextOpen: 'Domingo 22:00 UTC' };
  }
  if (utcDay === 0 && utcHour < 22) {
    return { open: false, reason: 'Domingo — Mercado cerrado', nextOpen: 'Domingo 22:00 UTC' };
  }
  if (utcDay === 5 && utcHour >= 22) {
    return { open: false, reason: 'Viernes cierre — Mercado cerrado', nextOpen: 'Domingo 22:00 UTC' };
  }

  return { open: true, reason: 'Mercado abierto', nextOpen: '' };
}

/* ─── Calendario de Noticias ─── */
function getNewsBlocked(symbol: string): { blocked: boolean; newsNext: string } {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes(); // FIX: era getUTCHours() → bug
  const utcTimeInMinutes = utcHours * 60 + utcMinutes;

  const newsEvents = [
    { name: 'NFP / CPI USD', time: 13 * 60 + 30, currencies: ['USD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF', 'USDCAD', 'NZDUSD'] },
    { name: 'FOMC Meeting USD', time: 19 * 60, currencies: ['USD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF', 'USDCAD', 'NZDUSD'] },
    { name: 'ECB Rate Decision EUR', time: 12 * 60 + 15, currencies: ['EUR', 'EURUSD', 'EURGBP'] },
    { name: 'BoE Rate Decision GBP', time: 11 * 60, currencies: ['GBP', 'GBPUSD', 'EURGBP'] },
    { name: 'BoJ Policy Rate JPY', time: 3 * 60, currencies: ['JPY', 'USDJPY'] }
  ];

  for (const event of newsEvents) {
    if (event.currencies.some(c => symbol.includes(c) || c === 'USD')) {
      const diff = utcTimeInMinutes - event.time;
      if (Math.abs(diff) <= 30) {
        return {
          blocked: true,
          newsNext: `${event.name} activo ahora (bloqueo +/- 30m)`
        };
      }
      if (diff < 0 && diff >= -180) {
        return {
          blocked: false,
          newsNext: `${event.name} en ${Math.abs(diff)} mins`
        };
      }
    }
  }

  return { blocked: false, newsNext: 'Calendario limpio' };
}

/* ─── Engine Log Helper ─── */
const MAX_LOG_ENTRIES = 100;

function createLogEntry(
  symbol: string,
  type: EngineLogEntry['type'],
  message: string,
  details?: string
): EngineLogEntry {
  return {
    id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    symbol,
    type,
    message,
    details,
  };
}

/* ─── Hook ─── */
export function useQuantEngine() {
  const [pairs, setPairs] = useState<PairState[]>(WATCHED_PAIRS);
  
  // Persistencia en LocalStorage para balance y señales
  const [activeSignals, setActiveSignals] = useState<Signal[]>(() => {
    const saved = localStorage.getItem('fxradar_active_signals');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics>(() => {
    const saved = localStorage.getItem('fxradar_risk_metrics');
    return saved ? JSON.parse(saved) : {
      equity: 10000,
      dailyStartEquity: 10000,
      dailyDD: 0,
      circuitBreakerActive: false,
      maxDD: 0,
      activeCorrelationMatrix: {},
    };
  });

  const [dataStatus, setDataStatus] = useState<'loading' | 'live' | 'error' | 'market_closed'>('loading');
  const [marketInfo, setMarketInfo] = useState(isMarketOpen());
  const [engineLogs, setEngineLogs] = useState<EngineLogEntry[]>([]);

  const processedSignals = useRef<Set<string>>(new Set());
  
  // Referencias para almacenar velas históricas
  const candles1DRef = useRef<Record<string, Candle[]>>({});
  const candles4HRef = useRef<Record<string, Candle[]>>({});
  const candles1HRef = useRef<Record<string, Candle[]>>({});
  const dxyBiasRef = useRef<'BUY' | 'SELL' | 'NEUTRAL'>('NEUTRAL');

  const addLog = useCallback((entry: EngineLogEntry) => {
    setEngineLogs(prev => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));
  }, []);

  /* ══════════════════════════════════════════════
   *  PERSISTENCIA
   * ══════════════════════════════════════════════ */
  useEffect(() => {
    localStorage.setItem('fxradar_active_signals', JSON.stringify(activeSignals));
  }, [activeSignals]);

  useEffect(() => {
    localStorage.setItem('fxradar_risk_metrics', JSON.stringify(riskMetrics));
  }, [riskMetrics]);

  // Actualizar estado del mercado cada minuto
  useEffect(() => {
    const id = setInterval(() => setMarketInfo(isMarketOpen()), 60_000);
    return () => clearInterval(id);
  }, []);

  /* ══════════════════════════════════════════════
   *  CARGA DE VELAS HISTÓRICAS (Cada 5 minutos)
   * ══════════════════════════════════════════════ */
  const fetchHistoricalCandles = useCallback(async () => {
    try {
      addLog(createLogEntry('SYSTEM', 'INFO', 'Cargando velas históricas de Yahoo Finance...'));
      
      // 1. Obtener sesgo del DXY
      try {
        const dxyCandles = await MarketDataService.fetchHistory('DXY', '60d', '4h');
        if (dxyCandles.length >= 50) {
          const closes = dxyCandles.map(c => c.close);
          const ema50 = Indicators.calculateEMA(closes, 50);
          const latestClose = closes[closes.length - 1];
          const latestEma50 = ema50[ema50.length - 1];
          dxyBiasRef.current = latestClose > latestEma50 ? 'BUY' : latestClose < latestEma50 ? 'SELL' : 'NEUTRAL';
          addLog(createLogEntry('DXY', 'INFO', `DXY Bias: ${dxyBiasRef.current}`, `Price: ${latestClose.toFixed(2)} vs EMA50: ${latestEma50.toFixed(2)}`));
        }
      } catch (err) {
        addLog(createLogEntry('DXY', 'WARNING', 'Error cargando DXY', String(err)));
      }

      // 2. Obtener velas 1D, 4H y 1H para cada par
      for (const pair of WATCHED_PAIRS) {
        try {
          const candles1d = await MarketDataService.fetchHistory(pair.symbol, '200d', '1d');
          const candles4h = await MarketDataService.fetchHistory(pair.symbol, '60d', '4h');
          const candles1h = await MarketDataService.fetchHistory(pair.symbol, '7d', '1h');
          
          candles1DRef.current[pair.symbol] = candles1d;
          candles4HRef.current[pair.symbol] = candles4h;
          candles1HRef.current[pair.symbol] = candles1h;
          
          addLog(createLogEntry(pair.symbol, 'INFO', `Historia cargada: 1D=${candles1d.length}, 4H=${candles4h.length}, 1H=${candles1h.length}`));
        } catch (err) {
          addLog(createLogEntry(pair.symbol, 'WARNING', `Error cargando historia`, String(err)));
        }
      }

      addLog(createLogEntry('SYSTEM', 'INFO', 'Carga histórica completada'));
    } catch (err) {
      addLog(createLogEntry('SYSTEM', 'WARNING', 'Error general cargando historia', String(err)));
    }
  }, [addLog]);

  // Carga inicial de velas históricas
  useEffect(() => {
    fetchHistoricalCandles();
    const interval = setInterval(fetchHistoricalCandles, 5 * 60 * 1000); // Cada 5 minutos
    return () => clearInterval(interval);
  }, [fetchHistoricalCandles]);

  /* ══════════════════════════════════════════════
   *  CÁLCULO DE INDICADORES — SISTEMA 5 ESTRELLAS
   * ══════════════════════════════════════════════ */
  const calculatePairIndicators = useCallback((
    pair: PairState,
    candles1D: Candle[],
    candles4H: Candle[],
    candles1H: Candle[],
    dxyBias: 'BUY' | 'SELL' | 'NEUTRAL',
    prevPrice: number
  ): PairState => {
    // Mínimo necesario para cálculos (flexible — datos 1D pueden tardar en llegar)
    if (!candles4H || candles4H.length < 30 || !candles1H || candles1H.length < 15) {
      return {
        ...pair,
        rejectedReason: `Datos insuficientes (4H: ${candles4H?.length || 0}, 1H: ${candles1H?.length || 0})`,
        gateDetails: [],
        relativeVolume: 0,
        stars: 0,
        starDetails: [],
        atrPerHour: 0,
      };
    }

    const closes4H = candles4H.map(c => c.close);
    const closes1H = candles1H.map(c => c.close);

    // ─── EMA 4H ───
    const ema50_4H = Indicators.calculateEMA(closes4H, Math.min(50, closes4H.length - 1));
    const ema200_4H = Indicators.calculateEMA(closes4H, Math.min(200, closes4H.length - 1));
    const latestEma50 = ema50_4H[ema50_4H.length - 1];
    const latestEma200 = ema200_4H[ema200_4H.length - 1];

    // ─── ATR 4H ───
    const atr4h = Indicators.calculateATR(candles4H, 14);
    const latestAtr = atr4h[atr4h.length - 1];
    const atrPips = Math.round(latestAtr / (pair.digits <= 3 ? 0.01 : 0.0001));

    // ─── ATR 1H (para estimación de tiempo) ───
    const atrPerHour = Indicators.calculateAtrPerHour(candles1H, pair.digits);

    // ─── RSI 1H + 4H ───
    const rsi1h = Indicators.calculateRSI(closes1H, 14);
    const rsi4h = Indicators.calculateRSI(closes4H, 14);
    const latestRsi1h = rsi1h[rsi1h.length - 1];
    const latestRsi4h = rsi4h[rsi4h.length - 1];

    // ─── ADX 4H ───
    const adxData = Indicators.calculateADX(candles4H, 14);
    const latestAdx = adxData.adx[adxData.adx.length - 1] || 15.0;
    const latestPlusDI = adxData.plusDI[adxData.plusDI.length - 1] || 0;
    const latestMinusDI = adxData.minusDI[adxData.minusDI.length - 1] || 0;

    // ─── EMA200 1D ───
    const closes1D = (candles1D || []).map(c => c.close);
    const ema200_1D_arr = closes1D.length >= 50
      ? Indicators.calculateEMA(closes1D, Math.min(200, closes1D.length - 1))
      : [0];
    const latestEma200_1D = ema200_1D_arr[ema200_1D_arr.length - 1];

    // ─── MACD 4H ───
    const ema12_4h = Indicators.calculateEMA(closes4H, 12);
    const ema26_4h = Indicators.calculateEMA(closes4H, 26);
    const macdLine4h = ema12_4h[ema12_4h.length - 1] - ema26_4h[ema26_4h.length - 1];
    const macdHist: number[] = closes4H.map((_, i) => ema12_4h[i] - ema26_4h[i]);
    const macdSignal4h = Indicators.calculateEMA(macdHist, 9);
    const macdSig = macdSignal4h[macdSignal4h.length - 1];
    const macdBullish = macdLine4h > macdSig;
    const macdBearish = macdLine4h < macdSig;

    // ─── Squeeze ───
    const squeezeArr = Indicators.calculateTTMSqueeze(candles4H, 20, 2, 1.5);
    const latestSqueeze = squeezeArr[squeezeArr.length - 1];

    // ─── MFI ───
    const mfiArr = Indicators.calculateMFI(candles4H, 14);
    const latestMfi = mfiArr[mfiArr.length - 1];

    // ─── Relative Volume ───
    const latestVol = candles4H[candles4H.length - 1].volume;
    const prevVols = candles4H.slice(-21, -1).map(c => c.volume);
    const avgVol = prevVols.reduce((a, b) => a + b, 0) / (prevVols.length || 1);
    let relativeVolume = avgVol > 0 ? latestVol / avgVol : 0;
    if (relativeVolume === 0 || isNaN(relativeVolume) || !isFinite(relativeVolume)) {
      const h = new Date().getUTCHours();
      if (h >= 12 && h < 16) relativeVolume = 1.55;
      else if (h >= 8 && h < 12) relativeVolume = 1.35;
      else if (h >= 16 && h < 21) relativeVolume = 1.15;
      else if ((h >= 0 && h < 3) || h >= 22) relativeVolume = 1.05;
      else relativeVolume = 0.85;
      const priceMovePct = prevPrice > 0 ? (Math.abs(pair.price - prevPrice) / prevPrice) * 10000 : 0;
      relativeVolume += Math.min(0.6, priceMovePct * 0.2);
    }

    const latestPrice = pair.price || closes4H[closes4H.length - 1];

    // ─── DIRECCIÓN (MTF Estricto) ───
    const emasBullish4H = latestEma50 > latestEma200 && latestEma200 > 0;
    const emasBearish4H = latestEma50 < latestEma200 && latestEma200 > 0;
    const priceBullish = latestPrice > latestEma50;
    const priceBearish = latestPrice < latestEma50;
    const diBullish = latestPlusDI > latestMinusDI;
    const diBearish = latestMinusDI > latestPlusDI;
    const trend1D = latestEma200_1D > 0
      ? (latestPrice > latestEma200_1D ? 'BUY' : 'SELL')
      : 'NEUTRAL';

    const bullishVotes = [emasBullish4H, priceBullish, diBullish].filter(Boolean).length;
    const bearishVotes = [emasBearish4H, priceBearish, diBearish].filter(Boolean).length;

    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    if (bullishVotes >= 2 && trend1D !== 'SELL') direction = 'BUY';
    else if (bearishVotes >= 2 && trend1D !== 'BUY') direction = 'SELL';

    // ─── KEY LEVELS ───
    const keyLevels = Indicators.calculateKeyLevels(candles4H, latestPrice);
    const inKeyZone = (() => {
      const pip = pair.digits <= 3 ? 0.01 : 0.0001;
      const zonePips = atrPips * 0.3 * pip;
      return (
        Math.abs(latestPrice - keyLevels.nearestSupport) < zonePips ||
        Math.abs(latestPrice - keyLevels.nearestResistance) < zonePips
      );
    })();

    // ─── NOTICIAS ───
    const newsInfo = getNewsBlocked(pair.symbol);

    // ─── SESIÓN ───
    const h = new Date().getUTCHours();
    let session = 'Sydney / Tokyo 🇯🇵';
    if (h >= 8 && h < 12) session = 'London 🇬🇧';
    else if (h >= 12 && h < 16) session = 'NY Overlap 🇺🇸🇬🇧';
    else if (h >= 16 && h < 21) session = 'New York 🇺🇸';

    // ─── SISTEMA 5 ESTRELLAS ───
    const starResult = QuantEngine.evaluateFiveStars(
      {
        ...pair,
        price: latestPrice,
        direction,
        closes1D,
        ema200_1D: latestEma200_1D,
        emasBullish4H,
        emasBearish4H,
        adx: latestAdx,
        rsi4h: latestRsi4h,
        macdBullish,
        macdBearish,
        squeeze: latestSqueeze,
        inKeyZone,
        mfi: latestMfi,
        dxyBias,
        relativeVolume,
      } as any,
      direction
    );

    // ─── SCORE Y MÉTRICAS ───
    const score = Math.round((starResult.stars / 5) * 100);
    const probability = Math.round(40 + starResult.stars * 8); // 40-80%
    const payoffRatio = 2.0;
    const expectedR = Number(((probability / 100 * payoffRatio) - (1 - probability / 100)).toFixed(2));
    const confidence = Math.round(50 + starResult.stars * 8);

    // ─── RÉGIMEN ───
    let regime: 'trend' | 'volatile' | 'range' = 'range';
    if (latestAdx > 22) regime = 'trend';
    else if (latestRsi1h > 68 || latestRsi1h < 32) regime = 'volatile';

    // ─── GATE ───
    const gateResult = QuantEngine.evaluateSignalGate(
      {
        ...pair,
        score,
        adx4h: latestAdx,
        expectedR,
        direction,
        newsBlocked: newsInfo.blocked,
        confluences: starResult.details.filter(d => d.passed).map(d => d.name),
        stars: starResult.stars,
        starDetails: starResult.details,
      } as PairState,
      relativeVolume,
      { equity: 10000, dailyStartEquity: 10000, dailyDD: 0, circuitBreakerActive: false, maxDD: 0, activeCorrelationMatrix: {} },
      []
    );

    return {
      ...pair,
      price: latestPrice,
      direction,
      score,
      confidence,
      probability,
      expectedR,
      regime,
      adx4h: latestAdx,
      rsi1h: latestRsi1h,
      rsi4h: latestRsi4h,
      atrPips,
      atrPerHour,
      session,
      newsBlocked: newsInfo.blocked,
      confluences: starResult.details.filter(d => d.passed).map(d => d.name),
      stars: starResult.stars,
      starDetails: starResult.details,
      rejectedReason: gateResult.valid ? '' : gateResult.reason,
      gateDetails: starResult.details.map(d => ({ name: d.name, passed: d.passed, value: d.value })),
      relativeVolume,
      nearestSupport: keyLevels.nearestSupport,
      nearestResistance: keyLevels.nearestResistance,
    };
  }, []);

  /* ══════════════════════════════════════════════
   *  PRECIOS REALES + MOTOR DE SIMULACIÓN DE TRADES
   * ══════════════════════════════════════════════ */
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        // Verificar si el mercado está abierto
        const mktInfo = isMarketOpen();
        setMarketInfo(mktInfo);

        const prices = await MarketDataService.fetchPrices();
        if (cancelled || prices.length === 0) {
          if (!cancelled) setDataStatus(mktInfo.open ? 'error' : 'market_closed');
          return;
        }

        // Obtener el precio DXY en el tick
        const dxyPriceObj = prices.find(p => p.symbol === 'DXY');
        if (dxyPriceObj) {
          const dxyCandles = candles4HRef.current['DXY'] || [];
          if (dxyCandles.length > 0) {
            const last = { ...dxyCandles[dxyCandles.length - 1] };
            last.close = dxyPriceObj.price;
            dxyCandles[dxyCandles.length - 1] = last;
            
            const closes = dxyCandles.map(c => c.close);
            const ema50 = Indicators.calculateEMA(closes, 50);
            const latestEma50 = ema50[ema50.length - 1];
            dxyBiasRef.current = dxyPriceObj.price > latestEma50 ? 'BUY' : dxyPriceObj.price < latestEma50 ? 'SELL' : 'NEUTRAL';
          }
        }

        setPairs(prevPairs => {
          const updatedPairs = prevPairs.map(pair => {
            const fresh = prices.find(p => p.symbol === pair.symbol);
            if (!fresh) return pair;

            // Actualizar vela actual en las referencias históricas
            const candles4H = candles4HRef.current[pair.symbol] || [];
            if (candles4H.length > 0) {
              const last = { ...candles4H[candles4H.length - 1] };
              last.close = fresh.price;
              last.high = Math.max(last.high, fresh.price);
              last.low = Math.min(last.low, fresh.price);
              candles4H[candles4H.length - 1] = last;
            }

            const candles1H = candles1HRef.current[pair.symbol] || [];
            if (candles1H.length > 0) {
              const last = { ...candles1H[candles1H.length - 1] };
              last.close = fresh.price;
              last.high = Math.max(last.high, fresh.price);
              last.low = Math.min(last.low, fresh.price);
              candles1H[candles1H.length - 1] = last;
            }
            const candles1D = candles1DRef.current[pair.symbol] || [];
            if (candles1D.length > 0) {
              const last = { ...candles1D[candles1D.length - 1] };
              last.close = fresh.price;
              last.high = Math.max(last.high, fresh.price);
              last.low = Math.min(last.low, fresh.price);
              candles1D[candles1D.length - 1] = last;
            }

            return calculatePairIndicators(
              { ...pair, price: fresh.price },
              candles1D,
              candles4H,
              candles1H,
              dxyBiasRef.current,
              pair.price
            );
          });

          // Procesar señales abiertas
          setActiveSignals(prevSignals => {
            let riskUpdated = false;
            let equityChange = 0;

            const updatedSignals = prevSignals.map(sig => {
              if (sig.status !== 'OPEN') return sig;

              const pair = updatedPairs.find(p => p.symbol === sig.symbol);
              if (!pair || pair.price <= 0) return sig;

              const pipSize = pair.digits <= 3 ? 0.01 : 0.0001;

              // Actualizar trailing stop dinámico por ATR
              const newStop = QuantEngine.updateTrailingStop(pair.price, sig.stop, pair.atrPips, sig.direction, pipSize);
              let trailingStopVal = sig.trailingStop;
              let currentStop = sig.stop;
              if (newStop !== sig.stop) {
                currentStop = newStop;
                trailingStopVal = newStop;
              }

              // Verificar SL
              const hitSL = sig.direction === 'BUY' ? pair.price <= currentStop : pair.price >= currentStop;
              if (hitSL) {
                const pnlFactor = sig.direction === 'BUY' ? (currentStop - sig.entry) / (sig.entry - sig.stop) : (sig.entry - currentStop) / (sig.stop - sig.entry);
                const loss = sig.positionSizeUsd * pnlFactor;
                equityChange += loss;
                riskUpdated = true;
                addLog(createLogEntry(sig.symbol, 'WARNING', `SL alcanzado — ${sig.direction}`, `P&L: $${loss.toFixed(2)}`));
                return { ...sig, status: 'CLOSED_LOSS' as const, stop: currentStop, trailingStop: trailingStopVal };
              }

              // Verificar TP3 (Full Close)
              const hitTP3 = sig.direction === 'BUY' ? pair.price >= sig.tp3 : pair.price <= sig.tp3;
              if (hitTP3) {
                const profit = sig.positionSizeUsd * sig.expectedR * 2.0; // aprox payoff at TP3
                equityChange += profit;
                riskUpdated = true;
                addLog(createLogEntry(sig.symbol, 'SIGNAL', `🚀 TP3 alcanzado — ${sig.direction}`, `P&L: +$${profit.toFixed(2)}`));
                return { ...sig, status: 'CLOSED_WIN' as const, stop: currentStop, trailingStop: trailingStopVal };
              }

              // Verificar TP1 (Mover a Break Even)
              const hitTP1 = sig.direction === 'BUY' ? pair.price >= sig.tp1 : pair.price <= sig.tp1;
              if (hitTP1 && currentStop !== sig.breakEvenPrice && sig.breakEvenPrice !== undefined) {
                currentStop = sig.breakEvenPrice;
                trailingStopVal = currentStop;
                addLog(createLogEntry(sig.symbol, 'INFO', `🎯 TP1 alcanzado — SL a Break Even (${currentStop})`, `Riesgo eliminado`));
              }

              return { ...sig, stop: currentStop, trailingStop: trailingStopVal };
            });

            if (riskUpdated) {
              setRiskMetrics(prevRisk => {
                const newEquity = prevRisk.equity + equityChange;
                const newDailyDD = Math.max(0, ((prevRisk.dailyStartEquity - newEquity) / prevRisk.dailyStartEquity) * 100);
                return {
                  ...prevRisk,
                  equity: newEquity,
                  dailyDD: newDailyDD,
                  maxDD: Math.max(prevRisk.maxDD, newDailyDD),
                  circuitBreakerActive: newDailyDD >= 5.0,
                };
              });
            }

            // Evaluar nuevas entradas para pares que no tienen operaciones abiertas
            updatedPairs.forEach(pair => {
              if (pair.price <= 0 || pair.direction === 'NEUTRAL') return;

              const hasActive = updatedSignals.some(s => s.symbol === pair.symbol && s.status === 'OPEN');
              if (hasActive) return;

              // FIX: Usar el volumen relativo ya calculado del par
              const gate = QuantEngine.evaluateSignalGate(pair, pair.relativeVolume, riskMetrics, prevSignals.filter(s => s.status === 'OPEN'));
              
              if (gate.valid && gate.grade !== 'C') {
                // Solo trades automáticos para A+, A, B — no para C (solo watchlist)
                const positionSize = QuantEngine.calculateOptimalPositionSize(
                  riskMetrics.equity,
                  pair.probability / 100,
                  Math.max(0.5, pair.expectedR),
                  pair.atrPips,
                  pair.atrPips
                );

                if (positionSize > 0) {
                  const candles4H = candles4HRef.current[pair.symbol] || [];
                  const keyLevels = Indicators.calculateKeyLevels(candles4H, pair.price);

                  const preciseLevels = QuantEngine.calculatePreciseLevels(
                    pair.price, pair.direction, pair.atrPips, pair.digits,
                    keyLevels, candles4H, riskMetrics.equity, positionSize
                  );

                  const newSig: Signal = {
                    id: `SIG-${Date.now()}-${pair.symbol}`,
                    symbol: pair.symbol,
                    direction: pair.direction,
                    grade: gate.grade,
                    entry: pair.price,
                    stop: preciseLevels.stop,
                    tp1: preciseLevels.tp1,
                    tp2: preciseLevels.tp2,
                    tp3: preciseLevels.tp3,
                    trailingStop: 0,
                    expectedR: pair.expectedR,
                    openedAt: Date.now(),
                    status: 'OPEN',
                    positionSizeUsd: positionSize,
                    levels: preciseLevels.levels,
                    suggestedLots: preciseLevels.suggestedLots,
                    riskDollars: preciseLevels.riskDollars,
                    rewardTP1Dollars: preciseLevels.rewardTP1,
                    rewardTP2Dollars: preciseLevels.rewardTP2,
                    rewardTP3Dollars: preciseLevels.rewardTP3,
                    riskRewardRatio: preciseLevels.riskRewardRatio,
                    breakEvenPrice: preciseLevels.breakEvenPrice,
                    slSource: preciseLevels.slSource,
                    tp1Source: preciseLevels.tp1Source,
                  };

                  updatedSignals.push(newSig);
                  addLog(createLogEntry(pair.symbol, 'SIGNAL',
                    `✅ ${pair.direction} ${gate.grade} | SL: ${preciseLevels.slSource}`,
                    `Entry: ${newSig.entry} | SL: ${newSig.stop} | TP1: ${newSig.tp1} | TP2: ${newSig.tp2} | R:R ${preciseLevels.riskRewardRatio.toFixed(1)} | $${positionSize}`
                  ));
                }
              }
            });

            return updatedSignals;
          });

          return updatedPairs;
        });

        setDataStatus('live');
      } catch (err) {
        console.error('[useQuantEngine] Price fetch or evaluation failed:', err);
        if (!cancelled) setDataStatus('error');
      }
    }

    tick();
    const interval = setInterval(tick, 2000); // Cada 2 segundos en vivo

    return () => { cancelled = true; clearInterval(interval); };
  }, [riskMetrics, calculatePairIndicators, addLog]);

  /* ══════════════════════════════════════════════
   *  Acciones del Quant Engine
   * ══════════════════════════════════════════════ */

  const updatePair = useCallback((updated: PairState) => {
    setPairs(prev => prev.map(p => (p.symbol === updated.symbol ? updated : p)));
  }, []);

  const updateAllPairs = useCallback((updatedPairs: PairState[]) => {
    setPairs(updatedPairs);
  }, []);

  const evaluateAndSignal = useCallback(
    (pair: PairState, relativeVolume: number) => {
      const result = QuantEngine.evaluateSignalGate(pair, relativeVolume, riskMetrics, activeSignals);

      if (!result.valid) {
        addLog(createLogEntry(pair.symbol, 'REJECTED', `Rechazada: ${result.reason}`));
        return null;
      }

      const positionSize = QuantEngine.calculateOptimalPositionSize(
        riskMetrics.equity, pair.probability / 100, Math.max(0.5, pair.expectedR),
        pair.atrPips, pair.atrPips,
      );
      if (positionSize <= 0) {
        addLog(createLogEntry(pair.symbol, 'REJECTED', 'Position size = 0'));
        return null;
      }

      const candles4H = candles4HRef.current[pair.symbol] || [];
      const candles1H = candles1HRef.current[pair.symbol] || [];
      const keyLevels = Indicators.calculateKeyLevels(candles4H, pair.price);
      const preciseLevels = QuantEngine.calculatePreciseLevels(
        pair.price, pair.direction, pair.atrPips, pair.digits,
        keyLevels, candles4H, riskMetrics.equity, positionSize
      );

      // ─── Estimación de tiempo ───
      const pipSize = pair.digits <= 3 ? 0.01 : 0.0001;
      const tp1Pips = Math.abs(preciseLevels.tp1 - pair.price) / pipSize;
      const tp3Pips = Math.abs(preciseLevels.tp3 - pair.price) / pipSize;
      const atrPerHour = pair.atrPerHour > 0
        ? pair.atrPerHour
        : Indicators.calculateAtrPerHour(candles1H, pair.digits);
      const timeToTP1 = Indicators.estimateTradeTime(tp1Pips, atrPerHour, pair.session, pair.rsi4h, pair.direction);
      const timeToTP3 = Indicators.estimateTradeTime(tp3Pips, atrPerHour, pair.session, pair.rsi4h, pair.direction);

      const signal: Signal = {
        id: `SIG-${Date.now()}-${pair.symbol}`,
        symbol: pair.symbol,
        display: pair.display,
        direction: pair.direction,
        grade: result.grade,
        stars: pair.stars || 0,
        starDetails: pair.starDetails || [],
        entry: pair.price,
        stop: preciseLevels.stop,
        tp1: preciseLevels.tp1,
        tp2: preciseLevels.tp2,
        tp3: preciseLevels.tp3,
        trailingStop: 0,
        expectedR: pair.expectedR,
        openedAt: Date.now(),
        status: 'OPEN',
        positionSizeUsd: positionSize,
        levels: preciseLevels.levels,
        suggestedLots: preciseLevels.suggestedLots,
        riskDollars: preciseLevels.riskDollars,
        rewardTP1Dollars: preciseLevels.rewardTP1,
        rewardTP2Dollars: preciseLevels.rewardTP2,
        rewardTP3Dollars: preciseLevels.rewardTP3,
        riskRewardRatio: preciseLevels.riskRewardRatio,
        breakEvenPrice: preciseLevels.breakEvenPrice,
        slSource: preciseLevels.slSource,
        tp1Source: preciseLevels.tp1Source,
        estimatedHoursToTP1: timeToTP1.minHours,
        estimatedHoursToTP3: timeToTP3.maxHours,
        sessionAtOpen: pair.session,
      };

      setActiveSignals(prev => [...prev, signal]);
      addLog(createLogEntry(pair.symbol, 'SIGNAL', `✅ ${pair.symbol} ${signal.direction} ${result.grade} (${pair.stars}★) ETA TP1: ${timeToTP1.label}`));
      return signal;
    },
    [riskMetrics, activeSignals, addLog],
  );

  const closeSignal = useCallback((signalId: string, status: 'CLOSED_WIN' | 'CLOSED_LOSS') => {
    setActiveSignals(prev => prev.map(s => {
      if (s.id !== signalId) return s;
      
      // Ajuste de balance si se cierra manualmente en el UI
      if (s.status === 'OPEN') {
        const pair = pairs.find(p => p.symbol === s.symbol);
        const exitPrice = pair ? pair.price : s.entry;
        const denominator = s.direction === 'BUY' ? (s.entry - s.stop) : (s.stop - s.entry);
        const realizedR = denominator !== 0
          ? (s.direction === 'BUY' ? (exitPrice - s.entry) : (s.entry - exitPrice)) / denominator
          : 0;
        const pnl = s.positionSizeUsd * realizedR;

        setRiskMetrics(prevRisk => {
          const newEquity = prevRisk.equity + pnl;
          const newDailyDD = Math.max(0, ((prevRisk.dailyStartEquity - newEquity) / prevRisk.dailyStartEquity) * 100);
          return {
            ...prevRisk,
            equity: newEquity,
            dailyDD: newDailyDD,
            maxDD: Math.max(prevRisk.maxDD, newDailyDD),
            circuitBreakerActive: newDailyDD >= 5.0,
          };
        });

        addLog(createLogEntry(s.symbol, status === 'CLOSED_WIN' ? 'SIGNAL' : 'WARNING', `Cerrada manualmente: ${status}`, `P&L estimado: $${pnl.toFixed(2)}`));
      }
      return { ...s, status };
    }));
  }, [pairs, addLog]);

  const updateRisk = useCallback((updated: Partial<RiskMetrics>) => {
    setRiskMetrics(prev => {
      const next = { ...prev, ...updated };
      if (next.dailyStartEquity > 0) {
        next.dailyDD = Math.max(0, ((next.dailyStartEquity - next.equity) / next.dailyStartEquity) * 100);
        next.maxDD   = Math.max(next.maxDD, next.dailyDD);
      }
      if (next.dailyDD >= 5.0) next.circuitBreakerActive = true;
      return next;
    });
  }, []);

  const resetEngine = useCallback(() => {
    setActiveSignals([]);
    setRiskMetrics({
      equity: 10000,
      dailyStartEquity: 10000,
      dailyDD: 0,
      circuitBreakerActive: false,
      maxDD: 0,
      activeCorrelationMatrix: {},
    });
    processedSignals.current.clear();
    setEngineLogs([]);
    localStorage.removeItem('fxradar_active_signals');
    localStorage.removeItem('fxradar_risk_metrics');
    addLog(createLogEntry('SYSTEM', 'INFO', '🔄 Engine reset completo'));
  }, [addLog]);

  /* ══════════════════════════════════════════════
   *  TELEGRAM ALERTS
   * ══════════════════════════════════════════════ */
  useEffect(() => {
    activeSignals.forEach(signal => {
      if (signal.status === 'OPEN' && !processedSignals.current.has(signal.id)) {
        processedSignals.current.add(signal.id);
        const pair = pairs.find(p => p.symbol === signal.symbol);
        if (pair) telegramBot.alertNewSignal(signal, pair);
      }
      if (signal.status === 'CLOSED_WIN' && processedSignals.current.has(signal.id)) {
        telegramBot.alertUpdate(signal, signal.positionSizeUsd * signal.expectedR, 'TP');
        processedSignals.current.delete(signal.id);
      }
      if (signal.status === 'CLOSED_LOSS' && processedSignals.current.has(signal.id)) {
        telegramBot.alertUpdate(signal, -signal.positionSizeUsd, 'SL');
        processedSignals.current.delete(signal.id);
      }
    });

    if (riskMetrics.circuitBreakerActive && !processedSignals.current.has('CB_ACTIVE')) {
      telegramBot.alertCircuitBreaker(riskMetrics.dailyDD);
      processedSignals.current.add('CB_ACTIVE');
    }
  }, [activeSignals, pairs, riskMetrics]);

  return {
    pairs, activeSignals, riskMetrics, dataStatus, marketInfo, engineLogs,
    updatePair, updateAllPairs, evaluateAndSignal, closeSignal, updateRisk, reset: resetEngine
  };
}
