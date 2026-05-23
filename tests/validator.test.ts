// ─────────────────────────────────────────────────────────────────────────────
//  Unit tests for the EV Validator agent
//  Mocks all Anthropic API calls — no real HTTP traffic.
// ─────────────────────────────────────────────────────────────────────────────

import { jest } from '@jest/globals';

// Mock Anthropic before importing the module under test
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn(),
      },
    })),
  };
});

// Mock ora (spinner) so tests don't produce terminal noise
jest.mock('ora', () => {
  return jest.fn().mockReturnValue({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
  });
});

import Anthropic from '@anthropic-ai/sdk';
import { validateEVCompany } from '../src/validator';
import type { CLIOptions } from '../src/types';

const liveOpts: CLIOptions = {
  ticker: 'TSLA',
  verbose: false,
  noVerify: false,
  dryRun: false,
};

const dryOpts: CLIOptions = {
  ...liveOpts,
  dryRun: true,
};

describe('validateEVCompany — dry-run mode', () => {
  it('returns is_ev_company=true for TSLA in dry-run', async () => {
    const result = await validateEVCompany('TSLA', dryOpts);
    expect(result.is_ev_company).toBe(true);
    expect(result.company_name).toBe('Tesla, Inc.');
    expect(result.ev_category).toBe('EV Manufacturer');
    expect(result.confidence).toBeGreaterThanOrEqual(0.99);
  });

  it('returns a default mock for unknown ticker in dry-run', async () => {
    const result = await validateEVCompany('AAPL', { ...dryOpts, ticker: 'AAPL' });
    // dry-run defaults assume EV for unknown tickers
    expect(result.is_ev_company).toBe(true);
    expect(result.company_name).toMatch(/AAPL/);
  });
});

describe('validateEVCompany — live mode (mocked Claude)', () => {
  let mockCreate: jest.Mock;

  beforeEach(() => {
    const instance = (Anthropic as jest.MockedClass<typeof Anthropic>).mock.results[0]?.value as any;
    if (instance) {
      mockCreate = instance.messages.create as jest.Mock;
    }
  });

  it('returns valid EV result for TSLA when Claude responds positively', async () => {
    const mockResponse = {
      content: [{
        type: 'text',
        text: JSON.stringify({
          is_ev_company: true,
          company_name: 'Tesla, Inc.',
          ev_category: 'EV Manufacturer',
          confidence: 0.99,
          reason: 'Tesla is the leading pure-play EV manufacturer.',
        }),
      }],
    };

    // Re-instantiate with fresh mock
    const mockCreate1 = jest.fn() as jest.MockedFunction<any>;
    mockCreate1.mockResolvedValue(mockResponse);
    (Anthropic as any).mockImplementation(() => ({
      messages: { create: mockCreate1 },
    }));

    const result = await validateEVCompany('TSLA', liveOpts);
    expect(result.is_ev_company).toBe(true);
    expect(result.company_name).toBe('Tesla, Inc.');
    expect(result.ev_category).toBe('EV Manufacturer');
  });

  it('returns is_ev_company=false for AAPL when Claude responds negatively', async () => {
    const mockResponse = {
      content: [{
        type: 'text',
        text: JSON.stringify({
          is_ev_company: false,
          company_name: 'Apple Inc.',
          ev_category: null,
          confidence: 0.99,
          reason: 'Apple is a consumer technology company; its primary business is not in the EV value chain.',
        }),
      }],
    };

    const mockCreate2 = jest.fn() as jest.MockedFunction<any>;
    mockCreate2.mockResolvedValue(mockResponse);
    (Anthropic as any).mockImplementation(() => ({
      messages: { create: mockCreate2 },
    }));

    const result = await validateEVCompany('AAPL', { ...liveOpts, ticker: 'AAPL' });
    expect(result.is_ev_company).toBe(false);
    expect(result.ev_category).toBeNull();
  });

  it('falls back gracefully when Claude returns unparseable JSON', async () => {
    const mockResponse = {
      content: [{ type: 'text', text: 'This is not JSON at all!' }],
    };

    const mockCreate3 = jest.fn() as jest.MockedFunction<any>;
    mockCreate3.mockResolvedValue(mockResponse);
    (Anthropic as any).mockImplementation(() => ({
      messages: { create: mockCreate3 },
    }));

    const result = await validateEVCompany('TSLA', liveOpts);
    // Fallback: is_ev_company false, confidence 0
    expect(result.is_ev_company).toBe(false);
    expect(result.confidence).toBe(0);
  });
});
