// ─────────────────────────────────────────────────────────────────────────────
//  Unit tests for the report generator
//  Verifies that expected section headers are present in HTML/terminal output
// ─────────────────────────────────────────────────────────────────────────────

import { jest } from '@jest/globals';

// Mock chalk so output is plain text (no ANSI escape codes in tests)
jest.mock('chalk', () => {
  const identity = (s: string) => s;
  const chainable: any = new Proxy(identity, {
    get: (_: any, prop: string) => {
      if (prop === 'bold' || prop === 'dim' || prop === 'cyan' || prop === 'white' ||
          prop === 'green' || prop === 'red' || prop === 'yellow' || prop === 'bgGreen' ||
          prop === 'bgRed' || prop === 'black') {
        return chainable;
      }
      return identity;
    },
    apply: (_: any, __: any, args: any[]) => args[0],
  });
  return { __esModule: true, default: chainable };
});

// Mock ora
jest.mock('ora', () => {
  return jest.fn().mockReturnValue({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
  });
});

import { generateHTMLReport } from '../src/report';
import type { AnalystReport, MarketData, VerifierResult } from '../src/types';

// Minimal mock data objects
const mockReport: AnalystReport = {
  reportId: 'test-report-id-001',
  generatedAt: '2026-05-23T10:00:00.000Z',
  ticker: 'TSLA',
  companyName: 'Tesla, Inc.',
  executiveSummary: 'Test executive summary for Tesla.',
  investmentThesis: 'Test investment thesis paragraph.',
  riskFactors: '1. Test risk factor one.\n2. Test risk factor two.',
  dimensionalScores: [
    { dimension: '1. VALUATION SCORECARD', rating: 'EXPENSIVE', detail: 'Trades at premium vs peers.' },
    { dimension: '2. GROWTH QUALITY ASSESSMENT', rating: 'DECELERATING', detail: 'Revenue growth slowing.' },
    { dimension: '3. BALANCE SHEET HEALTH', rating: 'FORTRESS', detail: 'Strong cash position.' },
    { dimension: '4. COMPETITIVE MOAT', rating: 'NARROW', detail: 'Supercharger network moat.' },
    { dimension: '5. MANAGEMENT EXECUTION', rating: 'ADEQUATE', detail: 'Mixed guidance track record.' },
    { dimension: '6. MACRO & POLICY SENSITIVITY', rating: 'NEUTRAL', detail: 'IRA credits offset China risk.' },
    { dimension: '7. SENTIMENT vs FUNDAMENTALS', rating: 'ALIGNED', detail: 'Analyst sentiment matches fundamentals.' },
    { dimension: '8. RISK RATING', rating: 'HIGH', detail: 'Multiple execution risks.' },
  ],
  valuationAnalysis: 'DCF suggests fair value of $185-210. ESTIMATED.',
  priceTarget: { bull: 280, base: 210, bear: 120, currency: 'USD', methodology: 'Blended DCF + comps' },
  recommendation: 'HOLD',
  convictionLevel: 'MEDIUM',
  convictionRationale: 'Mixed signals; wait for delivery reacceleration.',
  fullReportText: '{}',
};

const mockData: MarketData = {
  ticker: 'TSLA',
  companyName: 'Tesla, Inc.',
  fetchedAt: '2026-05-23T10:00:00.000Z',
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
    quarterlyDeliveries: null, deliveryGrowthYoY: null, quarterlyProduction: null,
    productionDeliveryGap: null, averageSellingPrice: null, chargingNetworkSize: null,
    orderBacklog: null, batteryCapacitykWh: null,
  },
  macro: {
    competitors: [
      { ticker: 'RIVN', companyName: 'Rivian Automotive', marketCap: 14200000000, peRatio: null, revenueGrowth: 0.71, grossMargin: -0.241, evToRevenue: 2.1 },
    ],
    lithiumPrice: '~$13,000/tonne (estimated)',
    cobaltPrice: '~$25,000/tonne (estimated)',
    nickelPrice: '~$17,000/tonne (estimated)',
    estimatedCommodityPrices: true,
    evPolicyNotes: 'IRA credits active.',
    globalEvMarketShare: '~18% global penetration',
  },
  sentiment: {
    recentNews: [
      { title: 'Tesla delivers strong Q4 results', publishedAt: '2026-01-02T00:00:00Z', source: 'Reuters', url: '' },
    ],
    analystBuyCount: 18, analystHoldCount: 12, analystSellCount: 8,
    consensusPriceTarget: 202.45, currentPriceVsTarget: 0.184,
    shortInterestRatio: 3.2,
    insiderTransactionsSummary: 'No recent insider activity.',
  },
  longDescription: 'Tesla designs and manufactures electric vehicles.',
  sector: 'Consumer Cyclical', industry: 'Auto Manufacturers', country: 'United States',
  dataGaps: [],
};

const mockVerifier: VerifierResult = {
  verdict: 'APPROVED',
  score: 82,
  flags: [],
  critical_issues: [],
  suggested_edits: [],
  verifier_note: 'Report is well-grounded and internally consistent.',
};

describe('generateHTMLReport — section headers', () => {
  let html: string;

  beforeAll(() => {
    html = generateHTMLReport(mockReport, mockData, mockVerifier);
  });

  it('produces a non-empty HTML string', () => {
    expect(html.length).toBeGreaterThan(100);
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('contains the ticker and company name in the title', () => {
    expect(html).toContain('TSLA');
    expect(html).toContain('Tesla, Inc.');
  });

  it('contains Executive Summary section header', () => {
    expect(html).toMatch(/Executive Summary/i);
  });

  it('contains Investment Thesis section header', () => {
    expect(html).toMatch(/Investment Thesis/i);
  });

  it('contains Risk Factors section header', () => {
    expect(html).toMatch(/Risk Factors/i);
  });

  it('contains Dimensional Scorecard section header', () => {
    expect(html).toMatch(/Dimensional Scorecard/i);
  });

  it('contains Valuation Analysis section header', () => {
    expect(html).toMatch(/Valuation Analysis/i);
  });

  it('contains Price Target section header', () => {
    expect(html).toMatch(/Price Target/i);
  });

  it('contains Final Verdict section header', () => {
    expect(html).toMatch(/Final Verdict/i);
  });

  it('contains the recommendation', () => {
    expect(html).toContain('HOLD');
  });

  it('contains all 8 dimensional scores', () => {
    expect(html).toContain('VALUATION SCORECARD');
    expect(html).toContain('GROWTH QUALITY');
    expect(html).toContain('BALANCE SHEET HEALTH');
    expect(html).toContain('COMPETITIVE MOAT');
    expect(html).toContain('MANAGEMENT EXECUTION');
    expect(html).toContain('MACRO');
    expect(html).toContain('SENTIMENT');
    expect(html).toContain('RISK RATING');
  });

  it('shows approved verifier banner', () => {
    expect(html).toContain('Approved');
    expect(html).toContain('82');
  });

  it('shows model attribution line', () => {
    expect(html).toContain('claude-sonnet-4-6');
  });

  it('contains disclaimer footer', () => {
    expect(html).toContain('DISCLAIMER');
  });

  it('includes peer comparison table', () => {
    expect(html).toContain('Peer Comparison');
    expect(html).toContain('RIVN');
  });
});

describe('generateHTMLReport — REVISE verdict', () => {
  it('shows caveats banner when verdict is REVISE', () => {
    const reviseVerifier: VerifierResult = {
      ...mockVerifier,
      verdict: 'REVISE',
      score: 65,
      verifier_note: 'Some concerns noted.',
    };
    const html = generateHTMLReport(mockReport, mockData, reviseVerifier);
    expect(html).toContain('CAVEATS');
    expect(html).toContain('65');
  });
});
