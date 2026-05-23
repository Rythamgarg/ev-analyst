// ─────────────────────────────────────────────────────────────────────────────
//  Unit tests for the Verifier Agent
//  Tests verdict parsing — mocks all Anthropic calls.
// ─────────────────────────────────────────────────────────────────────────────

import { jest } from '@jest/globals';

// Mock Anthropic before any imports
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn(),
  };
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

import Anthropic from '@anthropic-ai/sdk';
import { runVerifierAgent } from '../src/verifier';
import type { AnalystReport, MarketData, CLIOptions } from '../src/types';

const baseOpts: CLIOptions = {
  ticker: 'TSLA',
  verbose: false,
  noVerify: false,
  dryRun: false,
};

const dryOpts: CLIOptions = { ...baseOpts, dryRun: true };

const mockReport: AnalystReport = {
  reportId: 'verifier-test-001',
  generatedAt: '2026-05-23T10:00:00.000Z',
  ticker: 'TSLA',
  companyName: 'Tesla, Inc.',
  executiveSummary: 'TSLA is a complex investment at current valuations.',
  investmentThesis: 'Bull case based on technology moat and energy segment.',
  riskFactors: 'Delivery growth deceleration; margin compression; competition.',
  dimensionalScores: [
    { dimension: '1. VALUATION SCORECARD', rating: 'EXPENSIVE', detail: 'Premium multiples.' },
    { dimension: '2. GROWTH QUALITY ASSESSMENT', rating: 'DECELERATING', detail: 'Slowing growth.' },
    { dimension: '3. BALANCE SHEET HEALTH', rating: 'FORTRESS', detail: 'Strong cash.' },
    { dimension: '4. COMPETITIVE MOAT', rating: 'NARROW', detail: 'Supercharger moat.' },
    { dimension: '5. MANAGEMENT EXECUTION', rating: 'ADEQUATE', detail: 'Mixed track record.' },
    { dimension: '6. MACRO & POLICY SENSITIVITY', rating: 'NEUTRAL', detail: 'Balanced exposure.' },
    { dimension: '7. SENTIMENT vs FUNDAMENTALS', rating: 'ALIGNED', detail: 'Aligned.' },
    { dimension: '8. RISK RATING', rating: 'HIGH', detail: 'Execution risks.' },
  ],
  valuationAnalysis: 'Base case $185-210. ESTIMATED.',
  priceTarget: { bull: 280, base: 210, bear: 120, currency: 'USD', methodology: 'DCF + comps' },
  recommendation: 'HOLD',
  convictionLevel: 'MEDIUM',
  convictionRationale: 'Wait for delivery reacceleration signal.',
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
    competitors: [],
    lithiumPrice: '~$13,000/tonne (estimated)',
    cobaltPrice: '~$25,000/tonne (estimated)',
    nickelPrice: '~$17,000/tonne (estimated)',
    estimatedCommodityPrices: true,
    evPolicyNotes: 'IRA credits active.',
    globalEvMarketShare: '~18%',
  },
  sentiment: {
    recentNews: [],
    analystBuyCount: 18, analystHoldCount: 12, analystSellCount: 8,
    consensusPriceTarget: 202.45, currentPriceVsTarget: 0.184,
    shortInterestRatio: 3.2,
    insiderTransactionsSummary: 'No recent activity.',
  },
  longDescription: 'Tesla designs and manufactures EVs.',
  sector: 'Consumer Cyclical', industry: 'Auto Manufacturers', country: 'United States',
  dataGaps: [],
};

describe('runVerifierAgent — dry-run mode', () => {
  it('returns REVISE verdict in dry-run', async () => {
    const result = await runVerifierAgent(mockReport, mockData, dryOpts);
    expect(result.verdict).toBe('REVISE');
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(result.flags)).toBe(true);
    expect(Array.isArray(result.critical_issues)).toBe(true);
    expect(Array.isArray(result.suggested_edits)).toBe(true);
    expect(typeof result.verifier_note).toBe('string');
  });
});

describe('runVerifierAgent — live mode (mocked Claude)', () => {
  function setupMockClaude(responseText: string) {
    const mockCreate = jest.fn() as jest.MockedFunction<any>;
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: responseText }] });
    (Anthropic as any).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));
  }

  it('returns APPROVED when Claude responds with APPROVED verdict', async () => {
    const approvedResponse = JSON.stringify({
      verdict: 'APPROVED',
      score: 85,
      flags: ['Minor: commodity prices are estimated'],
      critical_issues: [],
      suggested_edits: ['Consider adding more detail on China risk.'],
      verifier_note: 'Report is well-grounded and internally consistent.',
    });

    setupMockClaude(approvedResponse);
    const result = await runVerifierAgent(mockReport, mockData, baseOpts);

    expect(result.verdict).toBe('APPROVED');
    expect(result.score).toBe(85);
    expect(result.flags.length).toBeGreaterThan(0);
  });

  it('returns REVISE when Claude responds with REVISE verdict', async () => {
    const reviseResponse = JSON.stringify({
      verdict: 'REVISE',
      score: 65,
      flags: ['Missing China OEM competition analysis', 'Overconfident on moat assessment'],
      critical_issues: ['HOLD recommendation seems inconsistent with HIGH risk rating without explicit justification'],
      suggested_edits: ['Add detail on BYD competitive threat', 'Clarify risk/recommendation alignment'],
      verifier_note: 'Report has notable gaps in competitive analysis and risk justification.',
    });

    setupMockClaude(reviseResponse);
    const result = await runVerifierAgent(mockReport, mockData, baseOpts);

    expect(result.verdict).toBe('REVISE');
    expect(result.score).toBe(65);
    expect(result.flags.length).toBeGreaterThan(0);
    expect(result.critical_issues.length).toBeGreaterThan(0);
  });

  it('returns REJECTED when Claude responds with REJECTED verdict', async () => {
    const rejectedResponse = JSON.stringify({
      verdict: 'REJECTED',
      score: 30,
      flags: ['Fabricated delivery numbers', 'Unsupported BUY recommendation'],
      critical_issues: ['Price targets are not grounded in any stated methodology'],
      suggested_edits: [],
      verifier_note: 'Report contains fundamental analytical flaws.',
    });

    setupMockClaude(rejectedResponse);
    const result = await runVerifierAgent(mockReport, mockData, baseOpts);

    expect(result.verdict).toBe('REJECTED');
    expect(result.score).toBe(30);
  });

  it('clamps score to valid 0-100 range', async () => {
    const outOfRangeResponse = JSON.stringify({
      verdict: 'APPROVED',
      score: 150,  // out of range
      flags: [],
      critical_issues: [],
      suggested_edits: [],
      verifier_note: 'Test.',
    });

    setupMockClaude(outOfRangeResponse);
    const result = await runVerifierAgent(mockReport, mockData, baseOpts);

    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('defaults to REVISE when verdict is unrecognized', async () => {
    const badVerdictResponse = JSON.stringify({
      verdict: 'MAYBE',  // invalid
      score: 55,
      flags: [],
      critical_issues: [],
      suggested_edits: [],
      verifier_note: 'Test.',
    });

    setupMockClaude(badVerdictResponse);
    const result = await runVerifierAgent(mockReport, mockData, baseOpts);

    expect(result.verdict).toBe('REVISE');
  });

  it('falls back gracefully when Claude returns unparseable response', async () => {
    setupMockClaude('This is completely garbled non-JSON content @#$%');
    const result = await runVerifierAgent(mockReport, mockData, baseOpts);

    // Should return a fallback result, not throw
    expect(['APPROVED', 'REVISE', 'REJECTED']).toContain(result.verdict);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
