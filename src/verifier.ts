// ─────────────────────────────────────────────────────────────────────────────
//  Verifier Agent — Claude Agent 2 (adversarial review)
//  Completely independent API call — new conversation context
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { createSpinner, logVerbose, logWarn, safeParseJSON, withRetry } from './utils.js';
import type { CLIOptions, AnalystReport, MarketData, VerifierResult } from './types.js';

const VERIFIER_SYSTEM_PROMPT = `You are a senior risk officer and compliance analyst at a top investment bank.
Your job is to adversarially review AI-generated equity research reports.
You are skeptical, rigorous, and focused on protecting investors from overconfident or flawed analysis.
You do NOT rubber-stamp reports. You catch logical errors, overconfidence, missing risks, and factual inconsistencies.
You return structured JSON only — no markdown, no commentary outside the JSON.`;

function buildVerifierPrompt(report: AnalystReport, data: MarketData): string {
  const priceInfo = data.quote.currentPrice
    ? `Current market price: $${data.quote.currentPrice.toFixed(2)}`
    : 'Current market price: N/A';

  const scorecard = report.dimensionalScores.map(d =>
    `  ${d.dimension}: ${d.rating}\n  ${d.detail}`
  ).join('\n\n');

  return `Review the following AI-generated equity research report for ${report.ticker} (${report.companyName}).

${priceInfo}
Report generated: ${report.generatedAt}
Report ID: ${report.reportId}

═══════════════════════════════════════════════════════════
 REPORT TO REVIEW
═══════════════════════════════════════════════════════════

EXECUTIVE SUMMARY:
${report.executiveSummary}

INVESTMENT THESIS:
${report.investmentThesis}

RISK FACTORS:
${report.riskFactors}

DIMENSIONAL SCORECARD:
${scorecard}

VALUATION ANALYSIS:
${report.valuationAnalysis}

PRICE TARGETS:
  Bull: $${report.priceTarget.bull}
  Base: $${report.priceTarget.base}
  Bear: $${report.priceTarget.bear}
  Methodology: ${report.priceTarget.methodology}

RECOMMENDATION: ${report.recommendation}
CONVICTION: ${report.convictionLevel}
RATIONALE: ${report.convictionRationale}

═══════════════════════════════════════════════════════════

Adversarially check for ALL of the following:

1. INTERNAL CONSISTENCY: Does the recommendation logically follow from the dimensional scores and data cited?
   - A "BUY" recommendation with "DISTRESSED" balance sheet and "HIGH" risk rating needs strong justification
   - Price targets must be consistent with valuation analysis and current price

2. DATA ACCURACY FLAGS: Are any stated metrics implausibly extreme, contradictory, or suspicious?
   - Check if revenue figures match market cap implied valuations
   - Flag if growth rates seem inconsistent with sector norms without justification

3. OVERCONFIDENCE: Are certainty claims justified by the data quality?
   - "Data not available" sections that are glossed over
   - Strong conviction claims despite significant data gaps

4. MISSING RISKS: What obvious sector risks were not mentioned?
   - Competition from Chinese OEMs (BYD, NIO, XPEV)
   - Supply chain disruptions, semiconductor shortages
   - Interest rate environment impact on consumer EV adoption
   - Regulatory/policy reversal risk
   - Currency risk for international operations
   - Key person/founder dependency

5. REGULATORY COMPLIANCE TONE: Does any language constitute unlicensed investment advice?
   - "You should buy" type language rather than "analysis suggests"
   - Missing disclaimer or buried disclaimer

6. LOGICAL FALLACIES:
   - Correlation-causation errors
   - Recency bias (overweighting recent quarter vs long-term trend)
   - Anchoring to historical highs/lows
   - Confirmation bias in thesis construction

Return ONLY this JSON object (no markdown, no other text):
{
  "verdict": "APPROVED" | "REVISE" | "REJECTED",
  "score": <integer 0-100>,
  "flags": [<list of all issues found, minor and major>],
  "critical_issues": [<must-fix issues that affect investment soundness>],
  "suggested_edits": [<optional improvements that would strengthen the report>],
  "verifier_note": "<one paragraph summarizing your overall assessment>"
}

Scoring guide:
  90-100: Excellent — rigorous, data-grounded, appropriately caveated
  75-89:  Good — minor issues, publishable with small notes
  50-74:  Needs revision — significant gaps or logical issues
  25-49:  Poor — multiple critical issues, misleading to investors
  0-24:   Rejected — fundamentally flawed or potentially harmful

IMPORTANT: Be genuinely critical. A score of 85+ should be rare, not automatic.`;
}

export async function runVerifierAgent(
  report: AnalystReport,
  data: MarketData,
  opts: CLIOptions
): Promise<VerifierResult> {
  const spinner = createSpinner('Verifier Agent reviewing report (adversarial check)...');
  spinner.start();

  if (opts.dryRun) {
    await new Promise(r => setTimeout(r, 500));
    const result: VerifierResult = {
      verdict: 'REVISE',
      score: 72,
      flags: [
        '[DRY RUN] Report uses mock/fixture data — live data not verified',
        '[DRY RUN] Price targets are illustrative only and not based on current market prices',
        '[DRY RUN] Delivery figures may be stale — verify against latest earnings release',
      ],
      critical_issues: [],
      suggested_edits: [
        'Verify delivery figures against most recent quarterly earnings release',
        'Confirm current price before publishing price targets',
      ],
      verifier_note: '[DRY RUN] This is a simulated verifier response. In live mode, a separate Claude instance independently reviews the analyst report for internal consistency, overconfidence, missing risks, and logical errors. Score of 72 triggers REVISE verdict with caveats banner. Run without --dry-run and with a valid ANTHROPIC_API_KEY for real adversarial verification.',
    };
    spinner.succeed(`Verifier verdict (dry-run): REVISE — published with caveats (score: ${result.score}/100)`);
    return result;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const userPrompt = buildVerifierPrompt(report, data);

  logVerbose('Calling Verifier Agent (separate Claude instance)...', opts.verbose);

  try {
    let fullText = '';

    if (opts.verbose) {
      spinner.stop();
      console.log('\n[Verifier Agent — streaming response]\n');

      const stream = client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: VERIFIER_SYSTEM_PROMPT,
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
          max_tokens: 2048,
          system: VERIFIER_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        3, 2000, 'Verifier agent'
      );

      fullText = message.content[0].type === 'text' ? message.content[0].text : '';
    }

    logVerbose(`Verifier raw response: ${fullText.slice(0, 200)}...`, opts.verbose);

    const defaultResult: VerifierResult = {
      verdict: 'REVISE',
      score: 50,
      flags: ['Could not parse verifier response'],
      critical_issues: [],
      suggested_edits: [],
      verifier_note: 'Verification response parsing failed.',
    };

    const result = safeParseJSON<VerifierResult>(fullText, defaultResult);

    // Validate verdict
    if (!['APPROVED', 'REVISE', 'REJECTED'].includes(result.verdict)) {
      result.verdict = 'REVISE';
    }
    result.score = Math.max(0, Math.min(100, result.score));

    const verdictLabel =
      result.verdict === 'APPROVED' ? `APPROVED (score: ${result.score}/100)` :
      result.verdict === 'REVISE' ? `REVISE — published with caveats (score: ${result.score}/100)` :
      `REJECTED (score: ${result.score}/100)`;

    spinner.succeed(`Verifier verdict: ${verdictLabel}`);
    return result;

  } catch (err) {
    spinner.fail(`Verifier Agent error: ${err instanceof Error ? err.message : String(err)}`);
    logWarn('Proceeding with REVISE verdict due to verifier error');
    return {
      verdict: 'REVISE',
      score: 60,
      flags: [`Verifier agent encountered an error: ${err instanceof Error ? err.message : String(err)}`],
      critical_issues: [],
      suggested_edits: [],
      verifier_note: 'Verification could not complete due to an API error. Report published with caution.',
    };
  }
}
