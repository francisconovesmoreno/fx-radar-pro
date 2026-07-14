import { PairState, Candle } from '../types/institutional';

export interface MarketPrice {
  symbol: string;
  price: number;
}

/**
 * Mapeo: símbolo interno → símbolo Yahoo Finance
 */
const YAHOO_SYMBOLS: Record<string, string> = {
  EURUSD: 'EURUSD=X',
  GBPUSD: 'GBPUSD=X',
  USDJPY: 'USDJPY=X',
  AUDUSD: 'AUDUSD=X',
  USDCHF: 'USDCHF=X',
  USDCAD: 'USDCAD=X',
  EURGBP: 'EURGBP=X',
  NZDUSD: 'NZDUSD=X',
  DXY: 'DX-Y.NYB',
};

export class MarketDataService {
  /**
   * Obtiene precios reales de Yahoo Finance para los 8 pares.
   * Las peticiones pasan por el proxy de Vite (/api/yahoo → query1.finance.yahoo.com)
   * para evitar problemas de CORS.
   */
  static async fetchPrices(): Promise<MarketPrice[]> {
    const results = await Promise.allSettled(
      Object.entries(YAHOO_SYMBOLS).map(([pair, ySymbol]) =>
        this.fetchOne(pair, ySymbol),
      ),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<MarketPrice> => r.status === 'fulfilled')
      .map(r => r.value);
  }

  private static async fetchOne(pair: string, ySymbol: string): Promise<MarketPrice> {
    const url = `/api/yahoo/v8/finance/chart/${ySymbol}?range=1d&interval=1m&includePrePost=false&t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${pair}: HTTP ${res.status}`);

    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;

    if (!price || price <= 0) throw new Error(`${pair}: no price in response`);

    console.log(`[Yahoo] ${pair} = ${price}`);
    return { symbol: pair, price: Number(price) };
  }

  /**
   * Obtiene velas históricas de Yahoo Finance para un par o índice.
   */
  static async fetchHistory(symbol: string, range: string, interval: string): Promise<Candle[]> {
    const ySymbol = YAHOO_SYMBOLS[symbol] || symbol;
    const url = `/api/yahoo/v8/finance/chart/${ySymbol}?range=${range}&interval=${interval}&includePrePost=false&t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${symbol} History: HTTP ${res.status}`);

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const timestamps = result?.timestamp || [];
    const quote = result?.indicators?.quote?.[0] || {};
    const open = quote.open || [];
    const high = quote.high || [];
    const low = quote.low || [];
    const close = quote.close || [];
    const volume = quote.volume || [];

    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (close[i] !== null && close[i] !== undefined && open[i] !== null && high[i] !== null && low[i] !== null) {
        candles.push({
          timestamp: timestamps[i] * 1000,
          open: Number(open[i]),
          high: Number(high[i]),
          low: Number(low[i]),
          close: Number(close[i]),
          volume: Number(volume[i] || 0),
        });
      }
    }
    return candles;
  }
}

