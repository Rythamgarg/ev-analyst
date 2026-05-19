// ─────────────────────────────────────────────────────────────────────────────
//  Report Formatter — terminal (chalk) + HTML output
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';
import {
  printDivider, printHeader, fmtCurrency, fmtPct, fmtRatio, fmtPrice, fmtNumber,
} from './utils.js';
import type { CLIOptions, AnalystReport, MarketData, VerifierResult } from './types.js';

// ── Terminal renderer ─────────────────────────────────────────────────────────

function ratingColor(rating: string): string {
  const bullish = ['STRONG BUY', 'BUY', 'CHEAP', 'ACCELERATING', 'FORTRESS', 'WIDE', 'STRONG', 'FAVORABLE', 'CONTRARIAN BUY', 'LOW'];
  const bearish = ['STRONG SELL', 'SELL', 'EXPENSIVE', 'DECELERATING', 'DISTRESSED', 'NONE', 'WEAK', 'UNFAVORABLE', 'MOMENTUM TRAP', 'HIGH', 'SPECULATIVE'];
  const neutral = ['HOLD', 'FAIR', 'STABLE', 'NARROW', 'ADEQUATE', 'NEUTRAL', 'ALIGNED', 'MEDIUM', 'REVISE'];

  if (bullish.some(b => rating.toUpperCase().includes(b))) return chalk.green(rating);
  if (bearish.some(b => rating.toUpperCase().includes(b))) return chalk.red(rating);
  if (neutral.some(n => rating.toUpperCase().includes(n))) return chalk.yellow(rating);
  return chalk.white(rating);
}

function recommendationStyle(rec: string): string {
  if (rec === 'STRONG BUY') return chalk.bold.bgGreen.black(` ${rec} `);
  if (rec === 'BUY') return chalk.bold.green(rec);
  if (rec === 'HOLD') return chalk.bold.yellow(rec);
  if (rec === 'SELL') return chalk.bold.red(rec);
  if (rec === 'STRONG SELL') return chalk.bold.bgRed.white(` ${rec} `);
  return chalk.white(rec);
}

export function formatTerminalReport(
  report: AnalystReport,
  data: MarketData,
  verifier: VerifierResult,
  opts: CLIOptions
): void {
  const w = 68;
  console.log();
  printDivider('═', w);
  console.log(chalk.bold.cyan('  EV EQUITY RESEARCH REPORT'));
  console.log(chalk.cyan(`  ${report.companyName} (${report.ticker})  ·  ${report.generatedAt.slice(0, 19).replace('T', ' ')} UTC`));
  console.log(chalk.dim(`  Report ID: ${report.reportId}`));
  console.log(chalk.dim('  Powered by Claude claude-sonnet-4-20250514 Multi-Agent System'));
  printDivider('═', w);

  // ── Verifier banner ────────────────────────────────────────────────────────
  if (verifier.verdict === 'REVISE') {
    console.log();
    console.log(chalk.yellow.bold('  ⚠  REVIEWED WITH CAVEATS  (Verifier score: ' + verifier.score + '/100)'));
    console.log(chalk.yellow('  ' + verifier.verifier_note));
  } else if (verifier.verdict === 'APPROVED') {
    console.log();
    console.log(chalk.green('  ✓ Verified by Adversarial Agent (score: ' + verifier.score + '/100)'));
  }

  // ── Executive Summary ──────────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold.white('  EXECUTIVE SUMMARY'));
  printDivider('─', w);
  console.log('  ' + report.executiveSummary.replace(/\n/g, '\n  '));

  // ── Key Metrics Dashboard ──────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold.white('  KEY METRICS DASHBOARD'));
  printDivider('─', w);

  const q = data.quote;
  const f = data.financials;
  const s = data.sentiment;

  const metrics = [
    ['Price', fmtPrice(q.currentPrice, q.currency), '52W High', fmtPrice(q.fiftyTwoWeekHigh, q.currency)],
    ['Market Cap', fmtCurrency(q.marketCap), '52W Low', fmtPrice(q.fiftyTwoWeekLow, q.currency)],
    ['Revenue TTM', fmtCurrency(f.totalRevenue), 'Rev Growth YoY', fmtPct(f.revenueGrowthYoY)],
    ['Gross Margin', fmtPct(f.grossMargins), 'Operating Margin', fmtPct(f.operatingMargins)],
    ['Free Cash Flow', fmtCurrency(f.freeCashflow), 'Total Cash', fmtCurrency(f.totalCash)],
    ['P/E (Trail)', fmtRatio(q.trailingPE), 'P/S', fmtRatio(q.priceToSalesTrailing12Months)],
    ['EV/Revenue', fmtRatio(q.enterpriseToRevenue), 'EV/EBITDA', fmtRatio(q.enterpriseToEbitda)],
    ['Beta', q.beta?.toFixed(2) ?? 'N/A', 'Short %', q.shortPercentOfFloat ? (q.shortPercentOfFloat * 100).toFixed(1) + '%' : 'N/A'],
    ['Q Deliveries', fmtNumber(data.evMetrics.quarterlyDeliveries), 'Del. Growth YoY', fmtPct(data.evMetrics.deliveryGrowthYoY)],
    ['Analyst Target', fmtPrice(s.consensusPriceTarget), 'Buy/Hold/Sell', `${s.analystBuyCount ?? '?'}/${s.analystHoldCount ?? '?'}/${s.analystSellCount ?? '?'}`],
  ];

  for (const [k1, v1, k2, v2] of metrics) {
    const left = `  ${(k1 as string).padEnd(16)} ${chalk.white((v1 as string).padEnd(18))}`;
    const right = `${(k2 as string).padEnd(16)} ${chalk.white(v2 as string)}`;
    console.log(left + right);
  }

  // ── Investment Thesis ──────────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold.white('  INVESTMENT THESIS (BULL CASE)'));
  printDivider('─', w);
  console.log('  ' + report.investmentThesis.replace(/\n/g, '\n  '));

  // ── Risk Factors ───────────────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold.white('  RISK FACTORS (BEAR CASE)'));
  printDivider('─', w);
  console.log(chalk.red('  ') + report.riskFactors.replace(/\n/g, '\n  '));

  // ── Dimensional Scorecard ──────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold.white('  DIMENSIONAL SCORECARD'));
  printDivider('─', w);
  for (const score of report.dimensionalScores) {
    console.log();
    console.log(`  ${chalk.bold(score.dimension)}  →  ${ratingColor(score.rating)}`);
    const detail = score.detail.replace(/\n/g, '\n    ');
    console.log(`    ${chalk.dim(detail)}`);
  }

  // ── Valuation Analysis ─────────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold.white('  VALUATION ANALYSIS'));
  printDivider('─', w);
  console.log('  ' + report.valuationAnalysis.replace(/\n/g, '\n  '));

  // ── Price Target Breakdown ─────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold.white('  12-MONTH PRICE TARGET BREAKDOWN'));
  printDivider('─', w);
  const currency = report.priceTarget.currency;
  console.log(`  ${chalk.green('Bull: ' + fmtPrice(report.priceTarget.bull, currency).padEnd(14))}` +
    `  ${chalk.yellow('Base: ' + fmtPrice(report.priceTarget.base, currency).padEnd(14))}` +
    `  ${chalk.red('Bear: ' + fmtPrice(report.priceTarget.bear, currency))}`);
  if (q.currentPrice) {
    const pctBull = ((report.priceTarget.bull - q.currentPrice) / q.currentPrice * 100).toFixed(1);
    const pctBase = ((report.priceTarget.base - q.currentPrice) / q.currentPrice * 100).toFixed(1);
    const pctBear = ((report.priceTarget.bear - q.currentPrice) / q.currentPrice * 100).toFixed(1);
    console.log(
      `  ${chalk.dim((`(${pctBull}% vs now)`).padEnd(18))}` +
      `  ${chalk.dim((`(${pctBase}% vs now)`).padEnd(18))}` +
      `  ${chalk.dim(`(${pctBear}% vs now)`)}`
    );
    console.log(`  ${chalk.dim('Current price: ' + fmtPrice(q.currentPrice, currency))}`);
  }
  console.log(`  ${chalk.dim('Method: ' + report.priceTarget.methodology)}`);

  // ── Final Verdict ──────────────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold.white('  FINAL VERDICT'));
  printDivider('─', w);
  console.log();
  console.log(`  Recommendation:  ${recommendationStyle(report.recommendation)}`);
  console.log(`  Conviction:      ${ratingColor(report.convictionLevel)}`);
  console.log();
  console.log('  ' + report.convictionRationale.replace(/\n/g, '\n  '));

  // ── Verifier flags ─────────────────────────────────────────────────────────
  if (verifier.flags.length > 0) {
    console.log();
    console.log(chalk.bold.yellow('  VERIFIER FLAGS'));
    printDivider('─', w);
    verifier.flags.forEach(f => console.log(chalk.yellow(`  ⚠ ${f}`)));
  }
  if (verifier.suggested_edits.length > 0) {
    console.log();
    console.log(chalk.bold.dim('  VERIFIER SUGGESTIONS'));
    verifier.suggested_edits.forEach(s => console.log(chalk.dim(`  → ${s}`)));
  }

  // ── Disclaimer ─────────────────────────────────────────────────────────────
  console.log();
  printDivider('─', w);
  console.log(chalk.dim(
    '  DISCLAIMER: This report is AI-generated for informational purposes only.\n' +
    '  It does not constitute licensed financial advice. Always consult a qualified\n' +
    '  financial advisor before making investment decisions.\n' +
    '  Data sources: Yahoo Finance · Alpha Vantage · SEC EDGAR · Claude claude-sonnet-4-20250514'
  ));
  printDivider('═', w);
}

// ── HTML renderer ─────────────────────────────────────────────────────────────

export function generateHTMLReport(
  report: AnalystReport,
  data: MarketData,
  verifier: VerifierResult
): string {
  const q = data.quote;
  const f = data.financials;
  const s = data.sentiment;

  const ratingClass = (r: string): string => {
    const bull = ['STRONG BUY', 'BUY', 'CHEAP', 'ACCELERATING', 'FORTRESS', 'WIDE', 'STRONG', 'FAVORABLE', 'CONTRARIAN BUY', 'LOW'];
    const bear = ['STRONG SELL', 'SELL', 'EXPENSIVE', 'DECELERATING', 'DISTRESSED', 'NONE', 'WEAK', 'UNFAVORABLE', 'MOMENTUM TRAP', 'HIGH', 'SPECULATIVE'];
    if (bull.some(b => r.toUpperCase().includes(b))) return 'bull';
    if (bear.some(b => r.toUpperCase().includes(b))) return 'bear';
    return 'neutral';
  };

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const scoreRows = report.dimensionalScores.map(d => `
    <div class="score-row">
      <div class="score-dim">${esc(d.dimension)}</div>
      <div class="score-rating ${ratingClass(d.rating)}">${esc(d.rating)}</div>
      <div class="score-detail">${esc(d.detail)}</div>
    </div>
  `).join('');

  const newsRows = s.recentNews.slice(0, 8).map(n => `
    <tr>
      <td>${esc(n.publishedAt.slice(0, 10))}</td>
      <td>${n.url ? `<a href="${esc(n.url)}" target="_blank">${esc(n.title)}</a>` : esc(n.title)}</td>
      <td>${esc(n.source)}</td>
    </tr>
  `).join('');

  const peerRows = data.macro.competitors.map(c => `
    <tr>
      <td><strong>${esc(c.ticker)}</strong></td>
      <td>${esc(c.companyName)}</td>
      <td>${fmtCurrency(c.marketCap)}</td>
      <td>${fmtRatio(c.peRatio)}</td>
      <td>${fmtRatio(c.evToRevenue)}</td>
    </tr>
  `).join('');

  const verifierSection = verifier.verdict === 'REVISE' ? `
    <div class="banner caveat">
      ⚠ REVIEWED WITH CAVEATS — Verifier Score: ${verifier.score}/100
      <br/><small>${esc(verifier.verifier_note)}</small>
    </div>` :
    verifier.verdict === 'APPROVED' ? `
    <div class="banner approved">
      ✓ Approved by Adversarial Verifier Agent — Score: ${verifier.score}/100
    </div>` : '';

  const flagsSection = verifier.flags.length > 0 ? `
    <div class="section">
      <h2>⚠ Verifier Flags</h2>
      <ul class="flags">${verifier.flags.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      ${verifier.suggested_edits.length > 0 ? `
        <h3>Suggestions</h3>
        <ul>${verifier.suggested_edits.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
      ` : ''}
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EV Research Report — ${esc(report.ticker)} ${esc(report.companyName)}</title>
  <style>
    :root {
      --bg: #0d1117; --surface: #161b22; --border: #30363d;
      --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff;
      --bull: #3fb950; --bear: #f85149; --neutral: #d29922;
      --surface2: #21262d;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #ffffff; --surface: #f6f8fa; --border: #d0d7de;
        --text: #24292f; --muted: #57606a; --accent: #0969da;
        --bull: #1a7f37; --bear: #cf222e; --neutral: #9a6700;
        --surface2: #eaeef2;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; font-size: 15px; line-height: 1.6; }
    .container { max-width: 960px; margin: 0 auto; padding: 24px 20px; }
    header { border-bottom: 1px solid var(--border); padding-bottom: 20px; margin-bottom: 24px; }
    header h1 { font-size: 24px; color: var(--accent); }
    header .meta { color: var(--muted); font-size: 13px; margin-top: 6px; }
    .section { margin-bottom: 32px; }
    h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-bottom: 16px; }
    h3 { font-size: 14px; color: var(--muted); margin: 12px 0 8px; }
    p, li { color: var(--text); margin-bottom: 8px; }
    ul { padding-left: 20px; }
    .banner { padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; font-size: 14px; }
    .banner.approved { background: rgba(63,185,80,0.1); border: 1px solid var(--bull); color: var(--bull); }
    .banner.caveat { background: rgba(210,153,34,0.1); border: 1px solid var(--neutral); color: var(--neutral); }
    .metrics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .metric-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; }
    .metric-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .metric-value { font-size: 20px; font-weight: 600; color: var(--text); margin-top: 4px; }
    .score-row { display: grid; grid-template-columns: 2fr 1fr 3fr; gap: 12px; align-items: start; padding: 12px; border-bottom: 1px solid var(--border); }
    .score-row:last-child { border-bottom: none; }
    .score-dim { font-weight: 600; font-size: 13px; }
    .score-rating { font-weight: 700; font-size: 13px; padding: 3px 10px; border-radius: 20px; text-align: center; white-space: nowrap; }
    .score-rating.bull { background: rgba(63,185,80,0.15); color: var(--bull); }
    .score-rating.bear { background: rgba(248,81,73,0.15); color: var(--bear); }
    .score-rating.neutral { background: rgba(210,153,34,0.15); color: var(--neutral); }
    .score-detail { font-size: 13px; color: var(--muted); }
    .verdict-box { background: var(--surface); border: 2px solid var(--border); border-radius: 12px; padding: 24px; text-align: center; }
    .verdict-rec { font-size: 32px; font-weight: 800; margin-bottom: 8px; }
    .verdict-rec.bull { color: var(--bull); }
    .verdict-rec.bear { color: var(--bear); }
    .verdict-rec.neutral { color: var(--neutral); }
    .price-targets { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    .pt-card { padding: 16px; border-radius: 8px; text-align: center; }
    .pt-card.bull-card { background: rgba(63,185,80,0.1); border: 1px solid var(--bull); }
    .pt-card.base-card { background: rgba(210,153,34,0.1); border: 1px solid var(--neutral); }
    .pt-card.bear-card { background: rgba(248,81,73,0.1); border: 1px solid var(--bear); }
    .pt-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .pt-price { font-size: 28px; font-weight: 700; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: var(--surface2); color: var(--muted); text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
    tr:hover td { background: var(--surface); }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .flags li { color: var(--neutral); }
    footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
    @media print {
      body { background: white; color: black; font-size: 12px; }
      .container { max-width: 100%; }
      .banner, .score-rating { border: 1px solid #ccc !important; }
    }
    .toggle-theme { position: fixed; top: 16px; right: 16px; background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 12px; }
  </style>
</head>
<body>
  <button class="toggle-theme" onclick="document.documentElement.style.setProperty('color-scheme', document.documentElement.style.getPropertyValue('color-scheme') === 'light' ? 'dark' : 'light')">Toggle Theme</button>
  <div class="container">
    <header>
      <h1>⚡ EV Equity Research Report — ${esc(report.companyName)} (${esc(report.ticker)})</h1>
      <div class="meta">
        Generated: ${esc(report.generatedAt.replace('T', ' ').slice(0, 19))} UTC
        &nbsp;·&nbsp; Report ID: ${esc(report.reportId)}
        &nbsp;·&nbsp; Powered by Claude claude-sonnet-4-20250514 Multi-Agent System
      </div>
    </header>

    ${verifierSection}

    <div class="section">
      <h2>Executive Summary</h2>
      <p>${esc(report.executiveSummary).replace(/\n/g, '<br/>')}</p>
    </div>

    <div class="section">
      <h2>Key Metrics Dashboard</h2>
      <div class="metrics-grid">
        <div class="metric-card"><div class="metric-label">Current Price</div><div class="metric-value">${fmtPrice(q.currentPrice, q.currency)}</div></div>
        <div class="metric-card"><div class="metric-label">Market Cap</div><div class="metric-value">${fmtCurrency(q.marketCap)}</div></div>
        <div class="metric-card"><div class="metric-label">Revenue TTM</div><div class="metric-value">${fmtCurrency(f.totalRevenue)}</div></div>
        <div class="metric-card"><div class="metric-label">Rev Growth YoY</div><div class="metric-value">${fmtPct(f.revenueGrowthYoY)}</div></div>
        <div class="metric-card"><div class="metric-label">Gross Margin</div><div class="metric-value">${fmtPct(f.grossMargins)}</div></div>
        <div class="metric-card"><div class="metric-label">Free Cash Flow</div><div class="metric-value">${fmtCurrency(f.freeCashflow)}</div></div>
        <div class="metric-card"><div class="metric-label">P/E (Trailing)</div><div class="metric-value">${fmtRatio(q.trailingPE)}</div></div>
        <div class="metric-card"><div class="metric-label">EV/Revenue</div><div class="metric-value">${fmtRatio(q.enterpriseToRevenue)}</div></div>
        <div class="metric-card"><div class="metric-label">Q Deliveries</div><div class="metric-value">${fmtNumber(data.evMetrics.quarterlyDeliveries)}</div></div>
        <div class="metric-card"><div class="metric-label">Analyst Target</div><div class="metric-value">${fmtPrice(s.consensusPriceTarget)}</div></div>
        <div class="metric-card"><div class="metric-label">52W High</div><div class="metric-value">${fmtPrice(q.fiftyTwoWeekHigh, q.currency)}</div></div>
        <div class="metric-card"><div class="metric-label">52W Low</div><div class="metric-value">${fmtPrice(q.fiftyTwoWeekLow, q.currency)}</div></div>
      </div>
    </div>

    <div class="section">
      <h2>Investment Thesis (Bull Case)</h2>
      <p>${esc(report.investmentThesis).replace(/\n/g, '<br/><br/>')}</p>
    </div>

    <div class="section">
      <h2>Risk Factors (Bear Case)</h2>
      <p>${esc(report.riskFactors).replace(/\n/g, '<br/>')}</p>
    </div>

    <div class="section">
      <h2>Dimensional Scorecard</h2>
      <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
        ${scoreRows}
      </div>
    </div>

    <div class="section">
      <h2>Valuation Analysis</h2>
      <p>${esc(report.valuationAnalysis).replace(/\n/g, '<br/>')}</p>
    </div>

    <div class="section">
      <h2>12-Month Price Target Breakdown</h2>
      <div class="price-targets">
        <div class="pt-card bull-card">
          <div class="pt-label">Bull Case</div>
          <div class="pt-price" style="color: var(--bull)">${fmtPrice(report.priceTarget.bull, report.priceTarget.currency)}</div>
          ${q.currentPrice ? `<div style="font-size:12px;color:var(--muted)">${((report.priceTarget.bull - q.currentPrice) / q.currentPrice * 100).toFixed(1)}% vs current</div>` : ''}
        </div>
        <div class="pt-card base-card">
          <div class="pt-label">Base Case</div>
          <div class="pt-price" style="color: var(--neutral)">${fmtPrice(report.priceTarget.base, report.priceTarget.currency)}</div>
          ${q.currentPrice ? `<div style="font-size:12px;color:var(--muted)">${((report.priceTarget.base - q.currentPrice) / q.currentPrice * 100).toFixed(1)}% vs current</div>` : ''}
        </div>
        <div class="pt-card bear-card">
          <div class="pt-label">Bear Case</div>
          <div class="pt-price" style="color: var(--bear)">${fmtPrice(report.priceTarget.bear, report.priceTarget.currency)}</div>
          ${q.currentPrice ? `<div style="font-size:12px;color:var(--muted)">${((report.priceTarget.bear - q.currentPrice) / q.currentPrice * 100).toFixed(1)}% vs current</div>` : ''}
        </div>
      </div>
      <p style="margin-top:12px;font-size:13px;color:var(--muted)">Methodology: ${esc(report.priceTarget.methodology)}</p>
    </div>

    <div class="section">
      <h2>Final Verdict</h2>
      <div class="verdict-box">
        <div class="verdict-rec ${ratingClass(report.recommendation)}">${esc(report.recommendation)}</div>
        <div style="color:var(--muted);margin-bottom:12px;">Conviction: <strong>${esc(report.convictionLevel)}</strong></div>
        <p>${esc(report.convictionRationale).replace(/\n/g, '<br/>')}</p>
      </div>
    </div>

    ${data.macro.competitors.length > 0 ? `
    <div class="section">
      <h2>Peer Comparison</h2>
      <table>
        <thead><tr><th>Ticker</th><th>Company</th><th>Mkt Cap</th><th>P/E</th><th>EV/Rev</th></tr></thead>
        <tbody>${peerRows}</tbody>
      </table>
    </div>` : ''}

    ${s.recentNews.length > 0 ? `
    <div class="section">
      <h2>Recent News</h2>
      <table>
        <thead><tr><th>Date</th><th>Headline</th><th>Source</th></tr></thead>
        <tbody>${newsRows}</tbody>
      </table>
    </div>` : ''}

    ${flagsSection}

    <div class="section">
      <h2>Data Sources &amp; Caveats</h2>
      <ul>
        <li>Market data: Yahoo Finance (yfinance/yahoo-finance2) — fetched at ${esc(data.fetchedAt)}</li>
        <li>Analysis: Claude claude-sonnet-4-20250514 (Analyst Agent + Verifier Agent)</li>
        <li>EV metrics: Publicly disclosed earnings data (may be approximate)</li>
        <li>Macro context: Estimated values — verify with current sources</li>
        ${data.dataGaps.length > 0 ? data.dataGaps.map(g => `<li><strong>Data gap:</strong> ${esc(g)}</li>`).join('') : ''}
      </ul>
    </div>

    <footer>
      <strong>DISCLAIMER:</strong> This report is AI-generated for informational purposes only.
      It does not constitute licensed financial advice. Metrics and valuations are directional only.
      Always consult a qualified financial advisor before making investment decisions.
      All estimates clearly labeled as ESTIMATED where applicable.
      <br/><br/>
      Report ID: ${esc(report.reportId)} · Generated: ${esc(report.generatedAt)} · ${esc(report.ticker)}
    </footer>
  </div>
</body>
</html>`;
}
