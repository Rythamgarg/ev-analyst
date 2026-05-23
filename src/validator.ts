// ─────────────────────────────────────────────────────────────────────────────
//  EV Company Validator — Claude Agent 0
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { createSpinner, logSuccess, logVerbose, safeParseJSON, withRetry } from './utils.js';
import type { CLIOptions, EVValidationResult } from './types.js';

const VALIDATOR_SYSTEM_PROMPT = `You are a financial domain classifier specializing in electric vehicles.
Given a stock ticker, determine with certainty whether the company's
PRIMARY business is in the EV value chain:
  - EV manufacturers (cars, trucks, buses, two-wheelers)
  - EV charging infrastructure
  - EV battery manufacturers (not general battery companies)
  - EV software / fleet management platforms
  - EV-focused mining companies (lithium, cobalt, nickel)

Return ONLY valid JSON with no markdown, no explanation:
{
  "is_ev_company": boolean,
  "company_name": string,
  "ev_category": string | null,
  "confidence": number,
  "reason": string
}`;

const MOCK_VALIDATIONS: Record<string, EVValidationResult> = {
  TSLA: {
    is_ev_company: true,
    company_name: 'Tesla, Inc.',
    ev_category: 'EV Manufacturer',
    confidence: 0.99,
    reason: 'Tesla is the worlds leading pure-play EV manufacturer with integrated battery and charging infrastructure.',
  },
  RIVN: {
    is_ev_company: true,
    company_name: 'Rivian Automotive, Inc.',
    ev_category: 'EV Manufacturer',
    confidence: 0.99,
    reason: 'Rivian is an EV manufacturer focused on electric trucks, SUVs, and delivery vans.',
  },
  NIO: {
    is_ev_company: true,
    company_name: 'NIO Inc.',
    ev_category: 'EV Manufacturer',
    confidence: 0.99,
    reason: 'NIO is a Chinese premium EV manufacturer with battery-swap technology.',
  },
  LCID: {
    is_ev_company: true,
    company_name: 'Lucid Group, Inc.',
    ev_category: 'EV Manufacturer',
    confidence: 0.99,
    reason: 'Lucid Group manufactures luxury EVs with industry-leading range.',
  },
};

export async function validateEVCompany(
  ticker: string,
  opts: CLIOptions
): Promise<EVValidationResult> {
  const spinner = createSpinner(`Validating ${ticker} as EV company...`);
  spinner.start();

  // Dry-run: use mock data
  if (opts.dryRun) {
    await new Promise(r => setTimeout(r, 500));
    const mock = MOCK_VALIDATIONS[ticker] ?? {
      is_ev_company: true,
      company_name: `${ticker} Corp (dry-run)`,
      ev_category: 'EV Manufacturer',
      confidence: 0.95,
      reason: 'Dry-run mode: assumed EV company for testing.',
    };
    spinner.succeed(`${mock.company_name} — ${mock.ev_category} (confidence: ${mock.confidence.toFixed(2)})`);
    return mock;
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const result = await withRetry(
      async () => {
        logVerbose(`Calling Claude validator for ${ticker}`, opts.verbose);

        const message = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 256,
          system: VALIDATOR_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Classify the following stock ticker: ${ticker}\n\nReturn only the JSON object, no markdown.`,
            },
          ],
        });

        const text = message.content[0].type === 'text' ? message.content[0].text : '';
        logVerbose(`Validator raw response: ${text}`, opts.verbose);

        const parsed = safeParseJSON<EVValidationResult>(text, {
          is_ev_company: false,
          company_name: ticker,
          ev_category: null,
          confidence: 0,
          reason: 'Failed to parse validator response.',
        });

        return parsed;
      },
      3,
      1000,
      'EV validator'
    );

    if (result.is_ev_company && result.confidence >= 0.75) {
      spinner.succeed(
        `${result.company_name} — ${result.ev_category} (confidence: ${result.confidence.toFixed(2)})`
      );
    } else {
      spinner.fail(`${ticker} validation failed`);
    }

    return result;
  } catch (err) {
    spinner.fail(`Validation error: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}
