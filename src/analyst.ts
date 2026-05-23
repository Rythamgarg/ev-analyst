// ─────────────────────────────────────────────────────────────────────────────
//  Analyst Agent — Claude Agent 1 (multi-dimensional EV analysis)
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import {
  createSpinner, logVerbose, logWarn, isoNow, withRetry,
  fmtCurrency, fmtPct, fmtRatio, fmtNumber, fmtPrice,
} from './utils.js';
import type {
  CLIOptions, EVValidationResult, MarketData,
  AnalystReport, DimensionalScore, PriceTarget,
} from './types.js';

const ANALYST_SYSTEM_PROMPT = `You are a senior equity analyst at a top-tier EV-focused investment fund
with 15 years of experience covering the global electric vehicle sector.
Your analysis is rigorous, data-driven, and contrarian where evidence demands it.
You synthesize quantitative signals with qualitative insight.
You are not a bull or a bear by default — you follow the data.

You produce structured JSON reports. Every claim must be grounded in the provided data.
Never invent financial figures. If a metric is unavailable, say "Data not available".`;

function buildDataContext(data: MarketData): string {
  const q = data.quote;
  const f = data.financials;
  const ev = data.evMetrics;
  const s = data.sentiment;
  const m = data.macro;

  const newsBlock = s.recentNews.slice(0, 8).map(n =>
    `  • [${n.publishedAt.slice(0, 10)}] ${n.title} (${n.source})`
  ).join('\n');

  const peersBlock = m.competitors.map(c =>
    `  • ${c.ticker} (${c.companyName}): MCap=${fmtCurrency(c.marketCap)}, P/E=${fmtRatio(c.peRatio)}, EV/Rev=${fmtRatio(c.evToRevenue)}`
  ).join('\n');

  return `
═══════════════════════════════════════════════════════════
 LIVE MARKET DATA FOR ${data.ticker} — ${data.companyName}
 Fetched: ${data.fetchedAt}
═══════════════════════════════════════════════════════════

COMPANY OVERVIEW
  Sector: ${data.sector} | Industry: ${data.industry} | Country: ${data.country}
  EV Category: ${data.evMetrics.quarterlyDeliveries ? 'EV Manufacturer' : 'EV Value Chain'}
  Description: ${data.longDescription || 'N/A'}

STOCK PRICE & MARKET
  Current Price:      ${fmtPrice(q.currentPrice, q.currency)}
  Previous Close:     ${fmtPrice(q.previousClose, q.currency)}
  52-Week High:       ${fmtPrice(q.fiftyTwoWeekHigh, q.currency)}
  52-Week Low:        ${fmtPrice(q.fiftyTwoWeekLow, q.currency)}
  Market Cap:         ${fmtCurrency(q.marketCap)}
  Volume (today):     ${fmtNumber(q.volume)}
  Avg Volume (10d):   ${fmtNumber(q.averageVolume)}
  Beta:               ${q.beta?.toFixed(2) ?? 'N/A'}
  Short % Float:      ${q.shortPercentOfFloat ? (q.shortPercentOfFloat * 100).toFixed(1) + '%' : 'N/A'}
  Institutional Own:  ${q.heldPercentInstitutions ? (q.heldPercentInstitutions * 100).toFixed(1) + '%' : 'N/A'}
  Exchange:           ${q.exchange}

VALUATION MULTIPLES
  P/E (Trailing):     ${fmtRatio(q.trailingPE)}
  P/E (Forward):      ${fmtRatio(q.forwardPE)}
  P/S:                ${fmtRatio(q.priceToSalesTrailing12Months)}
  EV/Revenue:         ${fmtRatio(q.enterpriseToRevenue)}
  EV/EBITDA:          ${fmtRatio(q.enterpriseToEbitda)}

FINANCIAL STATEMENTS (TTM)
  Total Revenue:      ${fmtCurrency(f.totalRevenue)}
  Revenue Growth YoY: ${fmtPct(f.revenueGrowthYoY)}
  Gross Margin:       ${fmtPct(f.grossMargins)}
  Operating Margin:   ${fmtPct(f.operatingMargins)}
  Net Margin:         ${fmtPct(f.netMargins)}
  EBITDA:             ${fmtCurrency(f.ebitda)}
  Free Cash Flow:     ${fmtCurrency(f.freeCashflow)}
  Operating CF:       ${fmtCurrency(f.operatingCashflow)}
  Total Cash:         ${fmtCurrency(f.totalCash)}
  Total Debt:         ${fmtCurrency(f.totalDebt)}
  Debt/Equity:        ${f.debtToEquity?.toFixed(1) ?? 'N/A'}
  R&D Spend:          ${fmtCurrency(f.researchAndDevelopment)} (${fmtPct(f.rdAsPercentRevenue)} of rev)
  CapEx:              ${fmtCurrency(f.capitalExpenditures)} (${fmtPct(f.capexAsPercentRevenue)} of rev)
  Enterprise Value:   ${fmtCurrency(f.enterpriseValue)}

EV-SPECIFIC OPERATING METRICS
  Q Deliveries:       ${fmtNumber(ev.quarterlyDeliveries)} units
  Delivery Growth YoY:${fmtPct(ev.deliveryGrowthYoY)}
  Q Production:       ${fmtNumber(ev.quarterlyProduction)} units
  Prod/Delivery Gap:  ${fmtNumber(ev.productionDeliveryGap)} units
  Avg Selling Price:  ${ev.averageSellingPrice ? fmtPrice(ev.averageSellingPrice) : 'Data not available'}
  Charging Network:   ${ev.chargingNetworkSize ? fmtNumber(ev.chargingNetworkSize) + ' stations' : 'N/A'}
  Order Backlog:      ${ev.orderBacklog ? fmtNumber(ev.orderBacklog) : 'Data not available'}

ANALYST SENTIMENT
  Buy / Hold / Sell:  ${s.analystBuyCount ?? 'N/A'} / ${s.analystHoldCount ?? 'N/A'} / ${s.analystSellCount ?? 'N/A'}
  Consensus Target:   ${fmtPrice(s.consensusPriceTarget)}
  Upside to Target:   ${s.currentPriceVsTarget ? (s.currentPriceVsTarget * 100).toFixed(1) + '%' : 'N/A'}
  Insider Activity:   ${s.insiderTransactionsSummary}

RECENT NEWS HEADLINES
${newsBlock || '  No recent news available'}

PEER COMPARISON
${peersBlock || '  No peer data available'}

MACRO CONTEXT
  Lithium Price:      ${m.lithiumPrice}${m.estimatedCommodityPrices ? ' (estimated — stale fallback)' : ''}
  Cobalt Price:       ${m.cobaltPrice}${m.estimatedCommodityPrices ? ' (estimated — stale fallback)' : ''}
  Nickel Price:       ${m.nickelPrice}${m.estimatedCommodityPrices ? ' (estimated — stale fallback)' : ''}
  EV Policy:          ${m.evPolicyNotes}
  Market Share:       ${m.globalEvMarketShare}

DATA GAPS NOTED: ${data.dataGaps.length > 0 ? data.dataGaps.join('; ') : 'None'}
`;
}

const ANALYST_USER_PROMPT = (ticker: string, context: string) => `
Produce a comprehensive, rigorous equity research report for ${ticker} using the data below.

${context}

Your report must be structured as a JSON object with EXACTLY this schema:

{
  "executiveSummary": "4-6 punchy sentences summarizing your thesis and key finding",
  "investmentThesis": "3-paragraph bull case with specific data references",
  "riskFactors": "enumerated bear case risks, each grounded in the data",

  "dimensionalScores": [
    {
      "dimension": "1. VALUATION SCORECARD",
      "rating": "EXPENSIVE|FAIR|CHEAP",
      "detail": "detailed analysis comparing multiples to peers and history"
    },
    {
      "dimension": "2. GROWTH QUALITY ASSESSMENT",
      "rating": "ACCELERATING|STABLE|DECELERATING",
      "detail": "revenue/delivery growth trend analysis"
    },
    {
      "dimension": "3. BALANCE SHEET HEALTH",
      "rating": "FORTRESS|STABLE|WATCH|DISTRESSED",
      "detail": "cash runway, debt maturity, capex cycle analysis"
    },
    {
      "dimension": "4. COMPETITIVE MOAT",
      "rating": "WIDE|NARROW|NONE",
      "detail": "technology, brand, supply chain, network effects"
    },
    {
      "dimension": "5. MANAGEMENT EXECUTION",
      "rating": "STRONG|ADEQUATE|WEAK",
      "detail": "guidance track record, capital allocation, insider activity"
    },
    {
      "dimension": "6. MACRO & POLICY SENSITIVITY",
      "rating": "FAVORABLE|NEUTRAL|UNFAVORABLE",
      "detail": "IRA exposure, China risk, commodity sensitivity, rate sensitivity"
    },
    {
      "dimension": "7. SENTIMENT vs FUNDAMENTALS",
      "rating": "CONTRARIAN BUY|ALIGNED|MOMENTUM TRAP",
      "detail": "short interest, analyst sentiment vs fundamental trajectory"
    },
    {
      "dimension": "8. RISK RATING",
      "rating": "LOW|MEDIUM|HIGH|SPECULATIVE",
      "detail": "top 5 bull assumptions, top 5 bear risks, what breaks each"
    }
  ],

  "valuationAnalysis": "DCF-light intrinsic value estimate + relative value analysis with all assumptions stated explicitly",

  "priceTarget": {
    "bull": <number>,
    "base": <number>,
    "bear": <number>,
    "currency": "${ticker.includes('.') ? 'USD' : 'USD'}",
    "methodology": "one-sentence methodology description"
  },

  "recommendation": "STRONG BUY|BUY|HOLD|SELL|STRONG SELL",
  "convictionLevel": "HIGH|MEDIUM|LOW",
  "convictionRationale": "one paragraph tying together thesis, key risk, and time horizon"
}

CRITICAL RULES:
1. Return ONLY the JSON object. No markdown, no preamble, no explanation outside the JSON.
2. Use EXACTLY the rating options specified — no variations.
3. Price targets must be numbers (not strings), in the same currency as the stock.
4. Never invent financial figures — use "Data not available" for missing data.
5. Be contrarian and data-driven. Do not default to bullish framing.
6. All estimates must be clearly labeled as ESTIMATED in the text.
`;

function parseAnalystResponse(
  text: string,
  ticker: string,
  companyName: string,
  currentPrice: number | null
): AnalystReport {
  // Strip markdown code fences
  let clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

  // Extract JSON object
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (jsonMatch) clean = jsonMatch[0];

  let parsed: any;
  try {
    parsed = JSON.parse(clean);
  } catch {
    // Fallback structure if JSON parsing fails
    parsed = {
      executiveSummary: 'Analysis could not be fully parsed. Please review raw output.',
      investmentThesis: text.slice(0, 500),
      riskFactors: 'See raw output.',
      dimensionalScores: [],
      valuationAnalysis: 'See raw output.',
      priceTarget: { bull: currentPrice ?? 0, base: currentPrice ?? 0, bear: currentPrice ?? 0, currency: 'USD', methodology: 'N/A' },
      recommendation: 'HOLD' as const,
      convictionLevel: 'LOW' as const,
      convictionRationale: 'Parse error — review raw output.',
    };
  }

  const validRecommendations = ['STRONG BUY', 'BUY', 'HOLD', 'SELL', 'STRONG SELL'];
  const validConvictions = ['HIGH', 'MEDIUM', 'LOW'];

  return {
    reportId: uuidv4(),
    generatedAt: isoNow(),
    ticker,
    companyName,
    executiveSummary: parsed.executiveSummary ?? 'N/A',
    investmentThesis: parsed.investmentThesis ?? 'N/A',
    riskFactors: parsed.riskFactors ?? 'N/A',
    dimensionalScores: (parsed.dimensionalScores ?? []) as DimensionalScore[],
    valuationAnalysis: parsed.valuationAnalysis ?? 'N/A',
    priceTarget: (parsed.priceTarget ?? {
      bull: currentPrice ?? 0, base: currentPrice ?? 0, bear: currentPrice ?? 0,
      currency: 'USD', methodology: 'N/A',
    }) as PriceTarget,
    recommendation: (validRecommendations.includes(parsed.recommendation)
      ? parsed.recommendation : 'HOLD') as AnalystReport['recommendation'],
    convictionLevel: (validConvictions.includes(parsed.convictionLevel)
      ? parsed.convictionLevel : 'LOW') as AnalystReport['convictionLevel'],
    convictionRationale: parsed.convictionRationale ?? 'N/A',
    fullReportText: text,
  };
}

function buildDryRunReport(data: MarketData): AnalystReport {
  const price = data.quote.currentPrice ?? 171.05;
  return {
    reportId: '00000000-dry-run-test-0000000000000',
    generatedAt: isoNow(),
    ticker: data.ticker,
    companyName: data.companyName,
    executiveSummary: `[DRY RUN] ${data.companyName} (${data.ticker}) is a leading EV manufacturer with significant market share. The company faces near-term headwinds from slowing delivery growth and margin compression, but retains a strong balance sheet and technology moat. Revenue growth has decelerated to near-zero YoY, raising questions about the premium valuation. We rate the stock a HOLD with medium conviction, pending evidence of delivery reacceleration and margin stabilization.`,
    investmentThesis: `[DRY RUN MOCK THESIS] The bull case for ${data.ticker} rests on three pillars. First, the company's technology platform — spanning software-defined vehicles, autonomy stack, and energy storage — represents a multi-decade secular growth opportunity that traditional auto OEMs cannot replicate on equivalent timelines. Second, vertical integration from battery cell manufacturing to retail delivery gives the company structural cost advantages that will widen as production scales. Third, the energy storage and services businesses are growing faster than the auto segment and could represent 25-30% of revenue within five years, providing diversification away from the highly cyclical auto market.`,
    riskFactors: `[DRY RUN MOCK RISKS]\n1. Delivery growth deceleration: YoY delivery growth turned negative, suggesting market saturation in key segments at current price points. If this persists, premium valuation multiples become unjustifiable.\n2. Margin compression: Repeated price cuts have compressed gross margins from ~29% peak to ~17-18%. Further cuts to defend volume would destroy shareholder value.\n3. Intensifying competition: Chinese OEMs (BYD, NIO, XPEV) are gaining share in key markets with competitive products at lower price points.\n4. Key person risk: Heavy CEO-brand linkage creates single-point-of-failure risk for brand and strategy continuity.\n5. Regulatory/policy risk: IRA credit changes or tariff reversals could reduce demand stimuli that support current pricing.`,
    dimensionalScores: [
      { dimension: '1. VALUATION SCORECARD', rating: 'EXPENSIVE', detail: '[DRY RUN] At 5.4x EV/Revenue and 41x trailing P/E, the stock trades at a 4-5x premium to auto sector peers on sales multiples, justified only if the tech/energy narrative materializes at scale. Peers NIO (1.1x) and RIVN (2.1x) trade at steep discounts.' },
      { dimension: '2. GROWTH QUALITY ASSESSMENT', rating: 'DECELERATING', detail: '[DRY RUN] Revenue growth decelerated to near 0% YoY (0.9%). Delivery growth turned negative at -8.7%. Gross margins compressed from 29% to 17.8%. Growth-at-any-cost transition to profitable-growth narrative is incomplete.' },
      { dimension: '3. BALANCE SHEET HEALTH', rating: 'FORTRESS', detail: '[DRY RUN] $26.9B cash vs $7.6B debt. Debt/equity 17.1x but almost entirely asset-backed. Free cash flow $1.4B TTM (compressed by capex cycle). Runway is effectively indefinite.' },
      { dimension: '4. COMPETITIVE MOAT', rating: 'NARROW', detail: '[DRY RUN] Supercharger network (50k+ stations) creates real switching cost moat. Software/FSD differentiation is real but unproven at revenue scale. Battery manufacturing lead narrowing as CATL/BYD scale LFP. Brand moat eroding in China specifically.' },
      { dimension: '5. MANAGEMENT EXECUTION', rating: 'ADEQUATE', detail: '[DRY RUN] Multiple production guidance misses in 2023-2024. Cybertruck launched but below volume targets. FSD v12 shipping but monetization timeline unclear. Recent 10%+ workforce reduction improves cost structure but signals demand concern.' },
      { dimension: '6. MACRO & POLICY SENSITIVITY', rating: 'NEUTRAL', detail: '[DRY RUN] IRA credits reduce effective buyer cost but dependency creates policy risk. China ~22% of revenue — exposed to retaliatory tariffs and local preference policies. Lithium prices have declined 70%+ from 2022 peak, a favorable input cost tailwind.' },
      { dimension: '7. SENTIMENT vs FUNDAMENTALS', rating: 'ALIGNED', detail: '[DRY RUN] Analyst consensus (18B/12H/8S) aligns with mixed fundamentals. Short interest 3.1% — elevated but not extreme. Consensus target $202 vs current $171 implies ~18% upside, consistent with HOLD/BUY boundary.' },
      { dimension: '8. RISK RATING', rating: 'HIGH', detail: '[DRY RUN] Bull assumptions: FSD monetization, energy storage becoming 30% of rev, Cybertruck scaling, India market entry, robotaxi launch. Bear risks: China market share loss, margin structural decline, key person departure, policy reversal, new EV credit-default cycle.' },
    ],
    valuationAnalysis: `[DRY RUN] DCF-light: Assuming 12% revenue CAGR over 5 years (from current $97.7B base), 20% terminal operating margin, 10% WACC, and 20x exit EBITDA multiple → intrinsic value estimate $185-210/share (base case). Relative value: applying 6x EV/Revenue (peer median) to consensus forward revenue of $105B → $195/share. Current price of $171 appears ~10-15% undervalued vs base intrinsic value but margin of safety is thin given execution risk. ESTIMATED values — all assumptions subject to revision.`,
    priceTarget: { bull: 280, base: 210, bear: 120, currency: 'USD', methodology: 'Blended DCF (50%) + EV/Revenue comps (30%) + EV/EBITDA comps (20%)' },
    recommendation: 'HOLD',
    convictionLevel: 'MEDIUM',
    convictionRationale: '[DRY RUN] We rate the stock HOLD with medium conviction. The fundamental picture is mixed: fortress balance sheet and real technology moats argue against a sell, but deteriorating delivery growth, margin compression, and premium valuation argue against a buy. The 12-18 month thesis depends on delivery reacceleration in H2 2024 and FSD monetization progress. A clear positive inflection in either metric would move us to BUY.',
    fullReportText: '[DRY RUN — no live API call made]',
  };
}

export async function runAnalystAgent(
  data: MarketData,
  validation: EVValidationResult,
  opts: CLIOptions
): Promise<AnalystReport> {
  const spinner = createSpinner('Analyst Agent generating report...');
  spinner.start();

  if (opts.dryRun) {
    await new Promise(r => setTimeout(r, 600));
    const report = buildDryRunReport(data);
    spinner.succeed(`Analysis complete (dry-run) — ${report.recommendation} (conviction: ${report.convictionLevel})`);
    return report;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const context = buildDataContext(data);
  const userPrompt = ANALYST_USER_PROMPT(data.ticker, context);

  logVerbose('Calling Analyst Agent (Claude claude-sonnet-4-6)...', opts.verbose);

  let fullText = '';

  try {
    if (opts.verbose) {
      spinner.stop();
      console.log('\n[Analyst Agent — streaming response]\n');

      const stream = client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: ANALYST_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          process.stdout.write(chunk.delta.text);
          fullText += chunk.delta.text;
        }
      }
      console.log('\n');
    } else {
      const message = await withRetry(
        () => client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: ANALYST_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        3, 2000, 'Analyst agent'
      );

      fullText = message.content[0].type === 'text' ? message.content[0].text : '';
    }

    const report = parseAnalystResponse(fullText, data.ticker, data.companyName, data.quote.currentPrice);
    spinner.succeed(`Analysis complete — ${report.recommendation} (conviction: ${report.convictionLevel})`);
    return report;

  } catch (err) {
    spinner.fail('Analyst Agent failed');
    throw err;
  }
}
