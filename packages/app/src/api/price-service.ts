import type { PriceRecord } from "@portfolio-tracker/domain";

export type FetchResult = {
  prices: PriceRecord[];
  meta: { name: string; exchange: string; currency: string };
};

/**
 * Fetches historical prices and metadata from Yahoo Finance.
 */
export async function fetchPrices(
  symbol: string,
  fromDate: string,
  toDate: string
): Promise<FetchResult> {
  const from = Math.floor(new Date(fromDate).getTime() / 1000);
  const to = Math.floor(new Date(toDate + "T23:59:59Z").getTime() / 1000);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${to}&interval=1d&includePrePost=false`;

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance API error for ${symbol}: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as any;
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`No data returned for ${symbol}`);

  const meta = {
    name: result.meta?.longName || result.meta?.shortName || "",
    exchange: result.meta?.exchangeName || result.meta?.fullExchangeName || "",
    currency: result.meta?.currency || "",
  };

  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  if (!quote || timestamps.length === 0) return { prices: [], meta };

  const prices: PriceRecord[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];

    if (open == null || close == null) continue;

    const date = new Date(timestamps[i] * 1000).toISOString().split("T")[0];
    prices.push({
      date,
      open: Math.round(open * 100) / 100,
      high: Math.round((high ?? open) * 100) / 100,
      low: Math.round((low ?? open) * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: volume ?? 0,
    });
  }

  return { prices, meta };
}
