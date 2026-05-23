// ─────────────────────────────────────────────────────────────────────────────
//  Unit tests for the data fetcher — uses fixture data, no real HTTP calls
// ─────────────────────────────────────────────────────────────────────────────

import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { MarketData } from '../src/types';

// Mock axios so no real HTTP requests are made
jest.mock('axios');

// Mock ora (spinner)
jest.mock('ora', () => {
  return jest.fn().mockReturnValue({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
  });
});

describe('TSLA fixture data shape', () => {
  let fixture: MarketData;

  beforeAll(() => {
    const fixturePath = path.resolve(process.cwd(), 'fixtures', 'TSLA.json');
    fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as MarketData;
  });

  it('has required top-level fields', () => {
    expect(fixture.ticker).toBe('TSLA');
    expect(fixture.companyName).toBeTruthy();
    expect(fixture.fetchedAt).toBeTruthy();
    expect(fixture.quote).toBeDefined();
    expect(fixture.financials).toBeDefined();
    expect(fixture.evMetrics).toBeDefined();
    expect(fixture.macro).toBeDefined();
    expect(fixture.sentiment).toBeDefined();
    expect(Array.isArray(fixture.dataGaps)).toBe(true);
  });

  it('quote has required numeric fields', () => {
    const q = fixture.quote;
    expect(typeof q.currentPrice).toBe('number');
    expect(typeof q.marketCap).toBe('number');
    expect(q.currency).toBe('USD');
    expect(q.exchange).toBeTruthy();
  });

  it('financials has required fields (nullable)', () => {
    const f = fixture.financials;
    // These must be present as keys even if null
    expect('totalRevenue' in f).toBe(true);
    expect('grossMargins' in f).toBe(true);
    expect('freeCashflow' in f).toBe(true);
    expect('totalDebt' in f).toBe(true);
  });

  it('financials revenue is a positive number', () => {
    expect(fixture.financials.totalRevenue).not.toBeNull();
    expect(fixture.financials.totalRevenue!).toBeGreaterThan(0);
  });

  it('evMetrics has required fields', () => {
    const ev = fixture.evMetrics;
    expect('quarterlyDeliveries' in ev).toBe(true);
    expect('deliveryGrowthYoY' in ev).toBe(true);
    expect('quarterlyProduction' in ev).toBe(true);
  });

  it('macro has competitors array', () => {
    const m = fixture.macro;
    expect(Array.isArray(m.competitors)).toBe(true);
    expect(m.competitors.length).toBeGreaterThan(0);
  });

  it('macro competitors have required shape', () => {
    for (const c of fixture.macro.competitors) {
      expect(c.ticker).toBeTruthy();
      expect(c.companyName).toBeTruthy();
      expect('marketCap' in c).toBe(true);
      expect('peRatio' in c).toBe(true);
      expect('revenueGrowth' in c).toBe(true);
      expect('grossMargin' in c).toBe(true);
      expect('evToRevenue' in c).toBe(true);
    }
  });

  it('sentiment has recentNews array', () => {
    expect(Array.isArray(fixture.sentiment.recentNews)).toBe(true);
  });

  it('sentiment news items have required shape', () => {
    for (const item of fixture.sentiment.recentNews) {
      expect(item.title).toBeTruthy();
      expect(item.publishedAt).toBeTruthy();
      expect(item.source).toBeTruthy();
      expect('url' in item).toBe(true);
    }
  });

  it('macro has lithiumPrice, cobaltPrice, nickelPrice as strings', () => {
    expect(typeof fixture.macro.lithiumPrice).toBe('string');
    expect(typeof fixture.macro.cobaltPrice).toBe('string');
    expect(typeof fixture.macro.nickelPrice).toBe('string');
  });
});

describe('fetchAllData — dry-run mode', () => {
  it('returns MarketData shaped object for TSLA in dry-run', async () => {
    // Import after mocks are set up
    const { fetchAllData } = await import('../src/fetcher');

    const opts = { ticker: 'TSLA', verbose: false, noVerify: false, dryRun: true };
    const validation = {
      is_ev_company: true,
      company_name: 'Tesla, Inc.',
      ev_category: 'EV Manufacturer',
      confidence: 0.99,
      reason: 'Test',
    };

    const data = await fetchAllData('TSLA', validation, opts);
    expect(data.ticker).toBe('TSLA');
    expect(data.companyName).toBe('Tesla, Inc.');
    expect(data.quote).toBeDefined();
    expect(data.financials).toBeDefined();
    expect(data.evMetrics).toBeDefined();
    expect(data.macro).toBeDefined();
    expect(data.sentiment).toBeDefined();
    expect(Array.isArray(data.dataGaps)).toBe(true);
  });
});
