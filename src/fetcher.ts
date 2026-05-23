// ─────────────────────────────────────────────────────────────────────────────
//  Data Fetcher — direct Yahoo Finance v8/v10 API via axios
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { createSpinner, logWarn, logVerbose, isoNow, withRetry, fmtCurrency, fmtPct, fmtRatio, fmtPrice, fmtNumber } from './utils.js';
import type {
  CLIOptions, EVValidationResult, MarketData,
  StockQuote, FinancialStatements, EVOperatingMetrics,
  MacroContext, SentimentData, CompetitorData, NewsItem,
} from './types.js';

// Yahoo Finance unofficial API base URLs
const YF_QUOTE = 'https://query1.finance.yahoo.com/v7/finance/quote';
const YF_SUMMARY = 'https://query2.finance.yahoo.com/v10/finance/quoteSummary';
const YF_SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; ev-analyst/1.0)',
  'Accept': 'application/json',
};

const EV_PEER_MAP: Record<string, string[]> = {
  TSLA: ['RIVN', 'LCID', 'NIO'],
  RIVN: ['TSLA', 'LCID', 'F'],
  LCID: ['TSLA', 'RIVN', 'NIO'],
  NIO: ['LI', 'XPEV', 'TSLA'],
  XPEV: ['NIO', 'LI', 'TSLA'],
  LI: ['NIO', 'XPEV', 'TSLA'],
  CHPT: ['BLNK', 'EVGO', 'TSLA'],
  BLNK: ['CHPT', 'EVGO', 'WBX'],
  ALB: ['SQM', 'LTHM', 'PLL'],
  SQM: ['ALB', 'LTHM', 'PLL'],
  FREYR: ['ALB', 'SQM', 'STEM'],
};

function getPeers(ticker: string): string[] {
  return EV_PEER_MAP[ticker] ?? ['TSLA', 'RIVN', 'NIO'];
}

// ── Raw Yahoo Finance fetchers ────────────────────────────────────────────────

async function yfQuote(ticker: string): Promise<any> {
  const resp = await axios.get(YF_QUOTE, {
    params: { symbols: ticker, fields: 'regularMarketPrice,regularMarketPreviousClose,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,fiftyTwoWeekHigh,fiftyTwoWeekLow,marketCap,regularMarketVolume,averageDailyVolume10Day,beta,trailingPE,forwardPE,priceToSalesTrailing12Months,enterpriseToRevenue,enterpriseToEbitda,shortPercentOfFloat,heldPercentInstitutions,currency,fullExchangeName,shortName' },
    headers: HEADERS,
    timeout: 10000,
  });
  const result = resp.data?.quoteResponse?.result?.[0];
  if (!result) throw new Error(`No quote data for ${ticker}`);
  return result;
}

async function yfSummary(ticker: string, modules: string[]): Promise<any> {
  const resp = await axios.get(`${YF_SUMMARY}/${ticker}`, {
    params: { modules: modules.join(','), corsDomain: 'finance.yahoo.com' },
    headers: HEADERS,
    timeout: 15000,
  });
  return resp.data?.quoteSummary?.result?.[0] ?? {};
}

async function yfSearch(ticker: string): Promise<any[]> {
  const resp = await axios.get(YF_SEARCH, {
    params: { q: ticker, newsCount: 10, quotesCount: 0, listsCount: 0, enableFuzzyQuery: false },
    headers: HEADERS,
    timeout: 10000,
  });
  return resp.data?.news ?? [];
}

// ── Fetch stock quote ─────────────────────────────────────────────────────────

async function fetchQuote(ticker: string): Promise<StockQuote> {
  const defaultQuote: StockQuote = {
    currentPrice: null, previousClose: null, open: null,
    dayHigh: null, dayLow: null, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null,
    marketCap: null, volume: null, averageVolume: null, beta: null,
    trailingPE: null, forwardPE: null, priceToSalesTrailing12Months: null,
    enterpriseToRevenue: null, enterpriseToEbitda: null,
    shortPercentOfFloat: null, heldPercentInstitutions: null,
    currency: 'USD', exchange: 'N/A',
  };

  try {
    const q = await withRetry(() => yfQuote(ticker), 3, 1000, `quote/${ticker}`);
    return {
      currentPrice: q.regularMarketPrice ?? null,
      previousClose: q.regularMarketPreviousClose ?? null,
      open: q.regularMarketOpen ?? null,
      dayHigh: q.regularMarketDayHigh ?? null,
      dayLow: q.regularMarketDayLow ?? null,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
      marketCap: q.marketCap ?? null,
      volume: q.regularMarketVolume ?? null,
      averageVolume: q.averageDailyVolume10Day ?? null,
      beta: q.beta ?? null,
      trailingPE: q.trailingPE ?? null,
      forwardPE: q.forwardPE ?? null,
      priceToSalesTrailing12Months: q.priceToSalesTrailing12Months ?? null,
      enterpriseToRevenue: q.enterpriseToRevenue ?? null,
      enterpriseToEbitda: q.enterpriseToEbitda ?? null,
      shortPercentOfFloat: q.shortPercentOfFloat ?? null,
      heldPercentInstitutions: q.heldPercentInstitutions ?? null,
      currency: q.currency ?? 'USD',
      exchange: q.fullExchangeName ?? q.exchange ?? 'N/A',
    };
  } catch (err) {
    logWarn(`Could not fetch quote for ${ticker}: ${err instanceof Error ? err.message : String(err)}`);
    return defaultQuote;
  }
}

// ── Fetch financials ──────────────────────────────────────────────────────────

async function fetchFinancials(ticker: string): Promise<{
  fin: FinancialStatements; desc: string; sector: string; industry: string; country: string;
}> {
  const defaultFin: FinancialStatements = {
    totalRevenue: null, revenueGrowthYoY: null, revenueGrowthQoQ: null,
    grossMargins: null, operatingMargins: null, netMargins: null,
    freeCashflow: null, operatingCashflow: null,
    totalCash: null, totalDebt: null, debtToEquity: null,
    researchAndDevelopment: null, rdAsPercentRevenue: null,
    capitalExpenditures: null, capexAsPercentRevenue: null,
    enterpriseValue: null, ebitda: null,
  };

  try {
    const summary = await withRetry(
      () => yfSummary(ticker, ['financialData', 'defaultKeyStatistics', 'summaryProfile']),
      3, 1500, `financials/${ticker}`
    );

    const fd = summary.financialData ?? {};
    const ks = summary.defaultKeyStatistics ?? {};
    const profile = summary.summaryProfile ?? {};

    const revenue = fd.totalRevenue?.raw ?? null;
    const rd = fd.researchDevelopment?.raw ?? null;
    const capex = fd.capitalExpenditures?.raw ?? null;

    return {
      fin: {
        totalRevenue: revenue,
        revenueGrowthYoY: fd.revenueGrowth?.raw ?? null,
        revenueGrowthQoQ: null,
        grossMargins: fd.grossMargins?.raw ?? null,
        operatingMargins: fd.operatingMargins?.raw ?? null,
        netMargins: fd.profitMargins?.raw ?? null,
        freeCashflow: fd.freeCashflow?.raw ?? null,
        operatingCashflow: fd.operatingCashflow?.raw ?? null,
        totalCash: fd.totalCash?.raw ?? null,
        totalDebt: fd.totalDebt?.raw ?? null,
        debtToEquity: fd.debtToEquity?.raw ?? null,
        researchAndDevelopment: rd,
        rdAsPercentRevenue: (rd && revenue) ? rd / revenue : null,
        capitalExpenditures: capex,
        capexAsPercentRevenue: (capex && revenue) ? Math.abs(capex) / revenue : null,
        enterpriseValue: ks.enterpriseValue?.raw ?? null,
        ebitda: fd.ebitda?.raw ?? null,
      },
      desc: (profile.longBusinessSummary ?? '').slice(0, 1200),
      sector: profile.sector ?? 'N/A',
      industry: profile.industry ?? 'N/A',
      country: profile.country ?? 'N/A',
    };
  } catch (err) {
    logWarn(`Could not fetch financials for ${ticker}: ${err instanceof Error ? err.message : String(err)}`);
    return { fin: defaultFin, desc: '', sector: 'N/A', industry: 'N/A', country: 'N/A' };
  }
}

// ── Fetch sentiment & news ────────────────────────────────────────────────────

async function fetchSentiment(ticker: string): Promise<SentimentData> {
  const defaultSentiment: SentimentData = {
    recentNews: [], analystBuyCount: null, analystHoldCount: null, analystSellCount: null,
    consensusPriceTarget: null, currentPriceVsTarget: null,
    shortInterestRatio: null, insiderTransactionsSummary: 'Data not available',
  };

  try {
    const [summaryResult, newsResult] = await Promise.allSettled([
      withRetry(
        () => yfSummary(ticker, ['recommendationTrend', 'financialData']),
        3, 1500, `sentiment/${ticker}`
      ),
      withRetry(() => yfSearch(ticker), 2, 1000, `news/${ticker}`),
    ]);

    const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : {};
    const newsRaw = newsResult.status === 'fulfilled' ? newsResult.value : [];

    const rt = summary.recommendationTrend?.trend?.[0] ?? {};
    const fd = summary.financialData ?? {};

    const news: NewsItem[] = newsRaw.slice(0, 10).map((item: any) => ({
      title: item.title ?? '',
      publishedAt: item.providerPublishTime
        ? new Date(item.providerPublishTime * 1000).toISOString() : '',
      source: item.publisher ?? '',
      url: item.link ?? '',
    }));

    const buyCount = (rt.strongBuy ?? 0) + (rt.buy ?? 0);
    const sellCount = (rt.sell ?? 0) + (rt.strongSell ?? 0);
    const currentPrice = fd.currentPrice?.raw ?? null;
    const targetPrice = fd.targetMeanPrice?.raw ?? null;

    return {
      recentNews: news,
      analystBuyCount: buyCount || null,
      analystHoldCount: rt.hold ?? null,
      analystSellCount: sellCount || null,
      consensusPriceTarget: targetPrice,
      currentPriceVsTarget: (targetPrice && currentPrice)
        ? (targetPrice - currentPrice) / currentPrice : null,
      shortInterestRatio: null,
      insiderTransactionsSummary: 'See SEC EDGAR Form 4 filings for insider transaction detail.',
    };
  } catch (err) {
    logWarn(`Could not fetch sentiment: ${err instanceof Error ? err.message : String(err)}`);
    return defaultSentiment;
  }
}

// ── Fetch competitors ─────────────────────────────────────────────────────────

async function fetchCompetitors(ticker: string): Promise<CompetitorData[]> {
  const peers = getPeers(ticker);
  const results: CompetitorData[] = [];

  for (const peer of peers) {
    try {
      const [q, summary] = await Promise.allSettled([
        withRetry(() => yfQuote(peer), 2, 1000, `peer/${peer}`),
        withRetry(() => yfSummary(peer, ['financialData']), 2, 1000, `peer-fin/${peer}`),
      ]);

      const quote = q.status === 'fulfilled' ? q.value : null;
      const fin = summary.status === 'fulfilled' ? (summary.value?.financialData ?? {}) : {};

      results.push({
        ticker: peer,
        companyName: quote?.shortName ?? peer,
        marketCap: quote?.marketCap ?? null,
        peRatio: quote?.trailingPE ?? null,
        revenueGrowth: fin.revenueGrowth?.raw ?? null,
        grossMargin: fin.grossMargins?.raw ?? null,
        evToRevenue: quote?.enterpriseToRevenue ?? quote?.priceToSalesTrailing12Months ?? null,
      });
    } catch {
      logWarn(`Could not fetch data for peer ${peer}`);
      results.push({ ticker: peer, companyName: peer, marketCap: null, peRatio: null, revenueGrowth: null, grossMargin: null, evToRevenue: null });
    }
  }

  return results;
}

// ── EV-specific metrics (from Yahoo Finance key stats / earnings — best effort) ──

async function buildEVMetrics(ticker: string): Promise<EVOperatingMetrics & { dataNote?: string }> {
  // EV operating metrics (deliveries, production) are not available via
  // standard Yahoo Finance API endpoints. Attempt to fetch any proxy data
  // from key stats; if unavailable, return null with a note rather than
  // fabricating numbers.
  const base: EVOperatingMetrics & { dataNote?: string } = {
    quarterlyDeliveries: null,
    deliveryGrowthYoY: null,
    quarterlyProduction: null,
    productionDeliveryGap: null,
    averageSellingPrice: null,
    chargingNetworkSize: null,
    orderBacklog: null,
    batteryCapacitykWh: null,
    dataNote: 'EV operating metrics unavailable via public API — check company IR page',
  };

  try {
    // Yahoo Finance does not expose delivery/production figures via its public
    // API endpoints. We fetch defaultKeyStatistics as a best-effort attempt
    // for any proxy metrics, but we do NOT fabricate delivery numbers.
    await withRetry(
      () => yfSummary(ticker, ['defaultKeyStatistics']),
      2, 1000, `evMetrics/${ticker}`
    );
    // No delivery data is available from Yahoo Finance's public API.
    // Return base with null metrics and the dataNote.
  } catch {
    // Silently fall through — return base with all nulls.
  }

  return base;
}

// ── Live commodity price fetch ────────────────────────────────────────────────

async function fetchCommodityPrices(): Promise<{
  lithiumPrice: string;
  cobaltPrice: string;
  nickelPrice: string;
  estimatedCommodityPrices: boolean;
}> {
  // Fallback values — used when live fetch fails
  const fallback = {
    lithiumPrice: '~$13,000/tonne (estimated)',
    cobaltPrice: '~$25,000/tonne (estimated)',
    nickelPrice: '~$17,000/tonne (estimated)',
    estimatedCommodityPrices: true,
  };

  try {
    // Attempt to fetch nickel futures (NI=F) and lithium proxy (LTHM stock price)
    // Cobalt does not have a liquid US-listed futures contract; use fallback.
    const [niRes, lthmRes] = await Promise.allSettled([
      withRetry(() => yfQuote('NI=F'), 2, 1000, 'nickel-futures'),
      withRetry(() => yfQuote('LTHM'), 2, 1000, 'lithium-proxy'),
    ]);

    const nickelPrice = niRes.status === 'fulfilled' && niRes.value?.regularMarketPrice
      ? `$${Number(niRes.value.regularMarketPrice).toLocaleString()}/tonne (live NI=F)`
      : fallback.nickelPrice;

    // LTHM is Livent Corp (lithium producer) — use as directional proxy, note it's a stock
    const lithiumPrice = lthmRes.status === 'fulfilled' && lthmRes.value?.regularMarketPrice
      ? `LTHM stock $${Number(lthmRes.value.regularMarketPrice).toFixed(2)}/share (proxy; spot ~$13,000/tonne estimated)`
      : fallback.lithiumPrice;

    // Cobalt: no reliable public futures ticker — always use fallback
    const cobaltPrice = fallback.cobaltPrice;

    const estimatedCommodityPrices =
      niRes.status !== 'fulfilled' || lthmRes.status !== 'fulfilled';

    return { lithiumPrice, cobaltPrice, nickelPrice, estimatedCommodityPrices };
  } catch {
    return fallback;
  }
}

// ── Load fixture (dry-run) ────────────────────────────────────────────────────

function loadFixtureData(ticker: string, companyName: string): MarketData {
  const fixturePath = path.join(process.cwd(), 'fixtures', `${ticker}.json`);
  if (fs.existsSync(fixturePath)) {
    const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as MarketData;
    data.companyName = companyName;
    return data;
  }

  return {
    ticker, companyName, fetchedAt: isoNow(),
    quote: {
      currentPrice: 171.05, previousClose: 174.60, open: 172.80,
      dayHigh: 175.20, dayLow: 169.30, fiftyTwoWeekHigh: 299.29, fiftyTwoWeekLow: 138.80,
      marketCap: 543900000000, volume: 98432000, averageVolume: 104000000,
      beta: 2.34, trailingPE: 41.1, forwardPE: 57.4,
      priceToSalesTrailing12Months: 5.6, enterpriseToRevenue: 5.4, enterpriseToEbitda: 32.1,
      shortPercentOfFloat: 0.031, heldPercentInstitutions: 0.44,
      currency: 'USD', exchange: 'NASDAQ',
    },
    financials: {
      totalRevenue: 97690000000, revenueGrowthYoY: 0.009, revenueGrowthQoQ: -0.013,
      grossMargins: 0.178, operatingMargins: 0.055, netMargins: 0.074,
      freeCashflow: 1370000000, operatingCashflow: 13300000000,
      totalCash: 26900000000, totalDebt: 7560000000, debtToEquity: 17.1,
      researchAndDevelopment: 3970000000, rdAsPercentRevenue: 0.041,
      capitalExpenditures: -8900000000, capexAsPercentRevenue: 0.091,
      enterpriseValue: 528000000000, ebitda: 16500000000,
    },
    evMetrics: {
      quarterlyDeliveries: 386810, deliveryGrowthYoY: -0.087,
      quarterlyProduction: 433371, productionDeliveryGap: 46561,
      averageSellingPrice: 42190, chargingNetworkSize: 50000,
      orderBacklog: null, batteryCapacitykWh: null,
    },
    macro: {
      competitors: [
        { ticker: 'RIVN', companyName: 'Rivian Automotive', marketCap: 14200000000, peRatio: null, revenueGrowth: 0.71, grossMargin: -0.241, evToRevenue: 2.1 },
        { ticker: 'LCID', companyName: 'Lucid Group', marketCap: 7100000000, peRatio: null, revenueGrowth: 0.21, grossMargin: -1.32, evToRevenue: 3.4 },
        { ticker: 'NIO', companyName: 'NIO Inc.', marketCap: 9800000000, peRatio: null, revenueGrowth: 0.36, grossMargin: 0.098, evToRevenue: 1.1 },
      ],
      lithiumPrice: '~$13,000/tonne', cobaltPrice: '~$25,000/tonne', nickelPrice: '~$17,000/tonne',
      evPolicyNotes: 'IRA credits active; EU 2035 mandate; China NEV subsidies extended.',
      globalEvMarketShare: '~18% global penetration (2024 est.)',
    },
    sentiment: {
      recentNews: [
        { title: 'Tesla Q1 2024 deliveries miss estimates', publishedAt: '2024-04-02T00:00:00Z', source: 'Reuters', url: '' },
        { title: 'Tesla cuts prices globally amid competition', publishedAt: '2024-03-22T00:00:00Z', source: 'Bloomberg', url: '' },
        { title: 'Tesla lays off over 10% of global workforce', publishedAt: '2024-04-15T00:00:00Z', source: 'CNBC', url: '' },
      ],
      analystBuyCount: 18, analystHoldCount: 12, analystSellCount: 8,
      consensusPriceTarget: 202.45, currentPriceVsTarget: 0.184,
      shortInterestRatio: 3.2,
      insiderTransactionsSummary: 'Elon Musk sold ~$3.6B in 2023; no recent insider buys.',
    },
    longDescription: 'Tesla, Inc. designs, develops, manufactures, leases, and sells electric vehicles, energy generation and storage systems, and related services.',
    sector: 'Consumer Cyclical', industry: 'Auto Manufacturers', country: 'United States',
    dataGaps: ['dry-run mode — fixture data'],
  };
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function fetchAllData(
  ticker: string,
  validation: EVValidationResult,
  opts: CLIOptions
): Promise<MarketData> {
  if (opts.dryRun) {
    const spinner = createSpinner('Loading cached fixture data...');
    spinner.start();
    await new Promise(r => setTimeout(r, 400));
    const data = loadFixtureData(ticker, validation.company_name);
    spinner.succeed('Fixture data loaded (dry-run)');
    return data;
  }

  const spinner = createSpinner('Fetching real-time market data (parallel)...');
  spinner.start();

  const dataGaps: string[] = [];

  const [quoteRes, finRes, sentRes, peerRes, evMetricsRes, commodityRes] = await Promise.allSettled([
    fetchQuote(ticker),
    fetchFinancials(ticker),
    fetchSentiment(ticker),
    fetchCompetitors(ticker),
    buildEVMetrics(ticker),
    fetchCommodityPrices(),
  ]);

  const emptyQuote: StockQuote = {
    currentPrice: null, previousClose: null, open: null, dayHigh: null, dayLow: null,
    fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, marketCap: null, volume: null,
    averageVolume: null, beta: null, trailingPE: null, forwardPE: null,
    priceToSalesTrailing12Months: null, enterpriseToRevenue: null, enterpriseToEbitda: null,
    shortPercentOfFloat: null, heldPercentInstitutions: null, currency: 'USD', exchange: 'N/A',
  };

  const quote = quoteRes.status === 'fulfilled' ? quoteRes.value : (() => { dataGaps.push('Stock quote unavailable'); return emptyQuote; })();
  const finData = finRes.status === 'fulfilled' ? finRes.value : (() => { dataGaps.push('Financial statements unavailable'); return { fin: {} as FinancialStatements, desc: '', sector: 'N/A', industry: 'N/A', country: 'N/A' }; })();
  const sentiment = sentRes.status === 'fulfilled' ? sentRes.value : (() => { dataGaps.push('Sentiment data unavailable'); return { recentNews: [], analystBuyCount: null, analystHoldCount: null, analystSellCount: null, consensusPriceTarget: null, currentPriceVsTarget: null, shortInterestRatio: null, insiderTransactionsSummary: 'N/A' } as SentimentData; })();
  const competitors = peerRes.status === 'fulfilled' ? peerRes.value : [];
  if (peerRes.status === 'rejected') dataGaps.push('Peer data unavailable');

  const evMetrics = evMetricsRes.status === 'fulfilled' ? evMetricsRes.value : {
    quarterlyDeliveries: null, deliveryGrowthYoY: null, quarterlyProduction: null,
    productionDeliveryGap: null, averageSellingPrice: null, chargingNetworkSize: null,
    orderBacklog: null, batteryCapacitykWh: null,
    dataNote: 'EV operating metrics unavailable via public API — check company IR page',
  };

  const commodity = commodityRes.status === 'fulfilled' ? commodityRes.value : {
    lithiumPrice: '~$13,000/tonne (estimated)',
    cobaltPrice: '~$25,000/tonne (estimated)',
    nickelPrice: '~$17,000/tonne (estimated)',
    estimatedCommodityPrices: true,
  };

  const sourceCount = [quoteRes, finRes, sentRes, peerRes].filter(r => r.status === 'fulfilled').length;
  spinner.succeed(`Market data fetched — ${sourceCount}/4 sources successful`);
  dataGaps.forEach(g => logWarn(`Data gap: ${g}`));

  return {
    ticker,
    companyName: validation.company_name,
    fetchedAt: isoNow(),
    quote,
    financials: finData.fin,
    evMetrics,
    macro: {
      competitors,
      lithiumPrice: commodity.lithiumPrice,
      cobaltPrice: commodity.cobaltPrice,
      nickelPrice: commodity.nickelPrice,
      estimatedCommodityPrices: commodity.estimatedCommodityPrices,
      evPolicyNotes: 'US IRA EV tax credits ($7,500 new / $4,000 used) remain active. EU fleet mandate targets 100% ZEV by 2035. China NEV subsidies extended through 2025.',
      globalEvMarketShare: 'ESTIMATED ~18% global penetration rate (2024)',
    },
    sentiment,
    longDescription: finData.desc,
    sector: finData.sector,
    industry: finData.industry,
    country: finData.country,
    dataGaps,
  };
}
