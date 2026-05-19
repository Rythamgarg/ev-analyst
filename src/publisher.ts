// ─────────────────────────────────────────────────────────────────────────────
//  Publisher — file output, logging, summary footer
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import { generateHTMLReport } from './report.js';
import {
  printDivider, logSuccess, logWarn, isoNow, dateStr, fmtPrice,
} from './utils.js';
import type { CLIOptions, AnalystReport, MarketData, VerifierResult, PublishLog } from './types.js';

export async function publishReport(
  report: AnalystReport,
  data: MarketData,
  verifier: VerifierResult,
  opts: CLIOptions
): Promise<void> {
  let outputPath: string | null = null;

  // ── HTML output ────────────────────────────────────────────────────────────
  if (opts.output) {
    try {
      const html = generateHTMLReport(report, data, verifier);
      const absPath = path.resolve(opts.output);
      fs.writeFileSync(absPath, html, 'utf8');
      logSuccess(`HTML report written → ${absPath}`);
      outputPath = absPath;
    } catch (err) {
      logWarn(`Could not write HTML file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── JSON log ───────────────────────────────────────────────────────────────
  const logFileName = `ev_analyst_log_${report.ticker}_${dateStr()}.json`;
  const logFilePath = path.resolve(logFileName);

  const logEntry: PublishLog = {
    reportId: report.reportId,
    ticker: report.ticker,
    companyName: report.companyName,
    generatedAt: report.generatedAt,
    publishedAt: isoNow(),
    recommendation: report.recommendation,
    priceTarget: report.priceTarget,
    verifierScore: verifier.score,
    verifierVerdict: verifier.verdict,
    outputPath,
    rawMarketData: data,
    reportText: report.fullReportText,
    verifierResult: verifier,
  };

  try {
    fs.writeFileSync(logFilePath, JSON.stringify(logEntry, null, 2), 'utf8');
    logSuccess(`JSON log written → ${logFilePath}`);
  } catch (err) {
    logWarn(`Could not write log file: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Summary footer ─────────────────────────────────────────────────────────
  const currency = report.priceTarget.currency;
  const w = 52;
  console.log();
  printDivider('═', w);
  logSuccess(`Report published for ${report.companyName} (${report.ticker})`);
  logSuccess(`Verifier score: ${verifier.score}/100 [${verifier.verdict}]`);
  logSuccess(`Recommendation: ${report.recommendation} (${report.convictionLevel} conviction)`);
  logSuccess(
    `12M Price Target: ${fmtPrice(report.priceTarget.base, currency)}` +
    `  (bull ${fmtPrice(report.priceTarget.bull, currency)} / bear ${fmtPrice(report.priceTarget.bear, currency)})`
  );
  logSuccess(`Output: ${outputPath ?? 'terminal'}`);
  logSuccess(`Log: ${logFilePath}`);
  printDivider('═', w);
  console.log();
}
