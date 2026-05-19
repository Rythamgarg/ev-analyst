#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  EV Analyst CLI — Entry point
// ─────────────────────────────────────────────────────────────────────────────

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Auto-create .env from .env.example if it doesn't exist, and add to .gitignore
const envPath = path.join(process.cwd(), '.env');
const gitignorePath = path.join(process.cwd(), '.gitignore');

if (!fs.existsSync(envPath)) {
  const examplePath = path.join(process.cwd(), '.env.example');
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
  }
}

if (fs.existsSync(gitignorePath)) {
  const gi = fs.readFileSync(gitignorePath, 'utf8');
  if (!gi.includes('.env')) {
    fs.appendFileSync(gitignorePath, '\n.env\n');
  }
}

dotenv.config();

import { Command } from 'commander';
import { sanitizeTicker, logError, logInfo, printDivider } from './utils.js';
import { validateEVCompany } from './validator.js';
import { fetchAllData } from './fetcher.js';
import { runAnalystAgent } from './analyst.js';
import { runVerifierAgent } from './verifier.js';
import { formatTerminalReport } from './report.js';
import { publishReport } from './publisher.js';
import type { CLIOptions } from './types.js';

const program = new Command();

program
  .name('ev-analyst')
  .description('Production-grade multi-agent EV stock analyst powered by Claude')
  .version('1.0.0')
  .requiredOption('-t, --ticker <symbol>', 'Stock ticker symbol (e.g. TSLA, RIVN, NIO)')
  .option('-o, --output <file>', 'Output HTML report file path (e.g. report.html)')
  .option('--verbose', 'Stream agent reasoning live', false)
  .option('--no-verify', 'Skip verifier agent (development mode)')
  .option('--dry-run', 'Use cached mock data from fixtures/ (no API calls needed)', false)
  .addHelpText('after', `
Examples:
  $ npx ev-analyst --ticker TSLA
  $ npx ev-analyst --ticker RIVN --output rivn_report.html --verbose
  $ npx ev-analyst --ticker NIO --dry-run
  $ npx ev-analyst --ticker LCID --no-verify --verbose

Tip: Try TSLA, RIVN, NIO, LCID, BYD, CHPT, BLNK, ALB, SQM
`);

program.parse();

const opts = program.opts<{
  ticker: string;
  output?: string;
  verbose: boolean;
  verify: boolean;
  dryRun: boolean;
}>();

const cliOptions: CLIOptions = {
  ticker: sanitizeTicker(opts.ticker),
  output: opts.output,
  verbose: opts.verbose,
  noVerify: !opts.verify,
  dryRun: opts.dryRun,
};

// Validate ticker format
if (!/^[A-Z0-9.]{1,10}$/.test(cliOptions.ticker)) {
  logError(`Invalid ticker format: "${opts.ticker}". Must be 1-10 alphanumeric characters.`);
  process.exit(1);
}

// Check API keys
if (!process.env.ANTHROPIC_API_KEY && !cliOptions.dryRun) {
  logError('ANTHROPIC_API_KEY is not set. Add it to your .env file or set it as an environment variable.');
  logInfo('Copy .env.example to .env and fill in your API key.');
  logInfo('Run with --dry-run to test without API keys.');
  process.exit(1);
}

async function main(): Promise<void> {
  printDivider('═', 64);
  console.log('\x1b[1m\x1b[36m' +
    '   ⚡  EV DOMAIN ANALYST  —  Multi-Agent System  ⚡' +
    '\x1b[0m');
  printDivider('═', 64);
  console.log();

  if (cliOptions.dryRun) {
    logInfo('DRY RUN mode — using cached fixture data (no live API calls)');
    console.log();
  }

  try {
    // ── Step 1: Validate EV company ──────────────────────────────────────────
    const validation = await validateEVCompany(cliOptions.ticker, cliOptions);
    if (!validation.is_ev_company || validation.confidence < 0.75) {
      logError(`${cliOptions.ticker} is not an EV-domain company`);
      console.log(`  Reason: ${validation.reason}`);
      console.log();
      console.log('  Tip: Try TSLA, RIVN, NIO, LCID, BYD, CHPT, BLNK, ALB, SQM, FREYR');
      process.exit(1);
    }

    // ── Step 2: Fetch real-time data ─────────────────────────────────────────
    const marketData = await fetchAllData(cliOptions.ticker, validation, cliOptions);

    // ── Step 3: Analyst agent ────────────────────────────────────────────────
    const analystReport = await runAnalystAgent(marketData, validation, cliOptions);

    // ── Step 4: Verifier agent ───────────────────────────────────────────────
    let verifierResult: import('./types.js').VerifierResult = {
      verdict: 'APPROVED',
      score: 100,
      flags: [],
      critical_issues: [],
      suggested_edits: [],
      verifier_note: 'Verification skipped (--no-verify mode).',
    };

    if (!cliOptions.noVerify) {
      verifierResult = await runVerifierAgent(analystReport, marketData, cliOptions);

      if (verifierResult.verdict === 'REJECTED') {
        logError('Report REJECTED by Verifier Agent');
        console.log();
        console.log('  Critical issues:');
        verifierResult.critical_issues.forEach(issue => {
          console.log(`    • ${issue}`);
        });
        console.log();
        console.log('  Verifier note: ' + verifierResult.verifier_note);
        process.exit(2);
      }
    }

    // ── Step 5: Format & publish ─────────────────────────────────────────────
    formatTerminalReport(analystReport, marketData, verifierResult, cliOptions);
    await publishReport(analystReport, marketData, verifierResult, cliOptions);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(`Fatal error: ${message}`);
    if (cliOptions.verbose && err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
