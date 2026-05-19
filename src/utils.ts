import chalk from 'chalk';
import ora, { Ora } from 'ora';

// ── Retry with exponential backoff ────────────────────────────────────────────

export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 1000,
  label = 'operation'
): Promise<T> {
  let lastError: Error | unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        const delay = baseDelayMs * Math.pow(2, i);
        logWarn(`${label} failed (attempt ${i + 1}/${attempts}), retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

// ── Sleep ─────────────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Spinner factory ───────────────────────────────────────────────────────────

export function createSpinner(text: string): Ora {
  return ora({ text, color: 'cyan' });
}

// ── Logging ───────────────────────────────────────────────────────────────────

export function logSuccess(msg: string): void {
  console.log(chalk.green('✓') + ' ' + msg);
}

export function logError(msg: string): void {
  console.error(chalk.red('✗') + ' ' + msg);
}

export function logWarn(msg: string): void {
  console.warn(chalk.yellow('⚠') + ' ' + msg);
}

export function logInfo(msg: string): void {
  console.log(chalk.cyan('ℹ') + ' ' + msg);
}

export function logVerbose(msg: string, verbose: boolean): void {
  if (verbose) {
    console.log(chalk.dim('[verbose] ') + msg);
  }
}

// ── Number formatting ─────────────────────────────────────────────────────────

export function fmtCurrency(n: number | null, currency = 'USD'): string {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  const sym = currency === 'USD' ? '$' : currency + ' ';
  if (Math.abs(n) >= 1e12) return `${sym}${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `${sym}${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${sym}${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${sym}${(n / 1e3).toFixed(1)}K`;
  return `${sym}${n.toFixed(2)}`;
}

export function fmtPct(n: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  return `${(n * 100).toFixed(2)}%`;
}

export function fmtRatio(n: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  return `${n.toFixed(2)}x`;
}

export function fmtNumber(n: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  return n.toLocaleString();
}

export function fmtPrice(n: number | null, currency = 'USD'): string {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  const sym = currency === 'USD' ? '$' : currency + ' ';
  return `${sym}${n.toFixed(2)}`;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

export function isoNow(): string {
  return new Date().toISOString();
}

export function dateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Safe JSON parse ───────────────────────────────────────────────────────────

export function safeParseJSON<T>(text: string, fallback: T): T {
  try {
    // Strip markdown code fences if present
    const clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    return JSON.parse(clean) as T;
  } catch {
    // Try to extract JSON object from the text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

// ── Sanitize ticker ───────────────────────────────────────────────────────────

export function sanitizeTicker(ticker: string): string {
  return ticker.toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 10);
}

// ── Box drawing ───────────────────────────────────────────────────────────────

export function printDivider(char = '═', width = 60): void {
  console.log(chalk.cyan(char.repeat(width)));
}

export function printHeader(title: string, width = 60): void {
  printDivider('═', width);
  const padding = Math.max(0, Math.floor((width - title.length) / 2));
  console.log(chalk.bold.cyan(' '.repeat(padding) + title));
  printDivider('═', width);
}
