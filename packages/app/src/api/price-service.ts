import type { PriceRecord, FundamentalsView } from "@portfolio-tracker/domain";

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
    previousClose: result.meta?.chartPreviousClose ?? result.meta?.previousClose ?? null as number | null,
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

// Yahoo Finance crumb/cookie cache (needed for v10 API)
let _yfCrumb: string | null = null;
let _yfCookie: string | null = null;

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string }> {
  if (_yfCrumb && _yfCookie) return { crumb: _yfCrumb, cookie: _yfCookie };

  // Step 1: get cookies from consent endpoint
  const initRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": "Mozilla/5.0" },
    redirect: "manual",
  });
  const setCookie = initRes.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");

  // Step 2: get crumb using those cookies
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": "Mozilla/5.0", Cookie: cookie },
  });
  const crumb = await crumbRes.text();
  if (!crumb || crumb.includes("error")) throw new Error("Failed to get Yahoo crumb");

  _yfCrumb = crumb;
  _yfCookie = cookie;
  return { crumb, cookie };
}

/**
 * Fetches fundamental data (P/E, EPS, yield, etc.) from Yahoo Finance v10 quoteSummary.
 */
export async function fetchFundamentals(
  symbol: string
): Promise<Omit<FundamentalsView, "symbol" | "fetchedAt">> {
  const { crumb, cookie } = await getYahooCrumb();
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics,assetProfile&crumb=${encodeURIComponent(crumb)}`;

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Cookie: cookie },
  });

  if (response.status === 401) {
    // Crumb expired, clear and retry once
    _yfCrumb = null;
    _yfCookie = null;
    const fresh = await getYahooCrumb();
    const retryUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics,assetProfile&crumb=${encodeURIComponent(fresh.crumb)}`;
    const retryRes = await fetch(retryUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Cookie: fresh.cookie },
    });
    if (!retryRes.ok) throw new Error(`Yahoo Finance API error for ${symbol}: ${retryRes.status}`);
    const json = (await retryRes.json()) as any;
    return extractFundamentals(json, symbol);
  }

  if (!response.ok) throw new Error(`Yahoo Finance API error for ${symbol}: ${response.status}`);
  const json = (await response.json()) as any;
  return extractFundamentals(json, symbol);
}

function extractFundamentals(json: any, symbol: string): Omit<FundamentalsView, "symbol" | "fetchedAt"> {
  const result = json.quoteSummary?.result?.[0];
  if (!result) throw new Error(`No quote data for ${symbol}`);

  const sd = result.summaryDetail ?? {};
  const ks = result.defaultKeyStatistics ?? {};
  const ap = result.assetProfile ?? {};
  const raw = (obj: any) => obj?.raw ?? null;

  return {
    trailingPE: raw(sd.trailingPE),
    forwardPE: raw(sd.forwardPE) ?? raw(ks.forwardPE),
    epsTrailing: raw(ks.trailingEps),
    epsForward: raw(ks.forwardEps),
    dividendYield: raw(sd.dividendYield) ?? raw(sd.yield) ?? raw(sd.trailingAnnualDividendYield),
    marketCap: raw(sd.marketCap),
    bookValue: raw(ks.bookValue),
    priceToBook: raw(ks.priceToBook),
    fiftyTwoWeekHigh: raw(sd.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: raw(sd.fiftyTwoWeekLow),
    sector: ap.sector ?? null,
    industry: ap.industry ?? null,
  };
}
