// ─────────────────────────────────────────────────────────────────────────────
//  Shared TypeScript interfaces for the EV Analyst multi-agent system
// ─────────────────────────────────────────────────────────────────────────────

export interface CLIOptions {
  ticker: string;
  output?: string;
  verbose: boolean;
  noVerify: boolean;
  dryRun: boolean;
}

// ── Validator ─────────────────────────────────────────────────────────────────

export interface EVValidationResult {
  is_ev_company: boolean;
  company_name: string;
  ev_category: string | null;
  confidence: number;
  reason: string;
}

// ── Market Data ───────────────────────────────────────────────────────────────

export interface StockQuote {
  currentPrice: number | null;
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketCap: number | null;
  volume: number | null;
  averageVolume: number | null;
  beta: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToSalesTrailing12Months: number | null;
  enterpriseToRevenue: number | null;
  enterpriseToEbitda: number | null;
  shortPercentOfFloat: number | null;
  heldPercentInstitutions: number | null;
  currency: string;
  exchange: string;
}

export interface FinancialStatements {
  totalRevenue: number | null;
  revenueGrowthYoY: number | null;
  revenueGrowthQoQ: number | null;
  grossMargins: number | null;
  operatingMargins: number | null;
  netMargins: number | null;
  freeCashflow: number | null;
  operatingCashflow: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  debtToEquity: number | null;
  researchAndDevelopment: number | null;
  rdAsPercentRevenue: number | null;
  capitalExpenditures: number | null;
  capexAsPercentRevenue: number | null;
  enterpriseValue: number | null;
  ebitda: number | null;
}

export interface EVOperatingMetrics {
  quarterlyDeliveries: number | null;
  deliveryGrowthYoY: number | null;
  quarterlyProduction: number | null;
  productionDeliveryGap: number | null;
  averageSellingPrice: number | null;
  chargingNetworkSize: number | null;
  orderBacklog: number | null;
  batteryCapacitykWh: number | null;
}

export interface CompetitorData {
  ticker: string;
  companyName: string;
  marketCap: number | null;
  peRatio: number | null;
  revenueGrowth: number | null;
  grossMargin: number | null;
  evToRevenue: number | null;
}

export interface MacroContext {
  competitors: CompetitorData[];
  lithiumPrice: string;
  cobaltPrice: string;
  nickelPrice: string;
  estimatedCommodityPrices?: boolean;
  evPolicyNotes: string;
  globalEvMarketShare: string;
}

export interface NewsItem {
  title: string;
  publishedAt: string;
  source: string;
  url: string;
}

export interface SentimentData {
  recentNews: NewsItem[];
  analystBuyCount: number | null;
  analystHoldCount: number | null;
  analystSellCount: number | null;
  consensusPriceTarget: number | null;
  currentPriceVsTarget: number | null;
  shortInterestRatio: number | null;
  insiderTransactionsSummary: string;
}

export interface MarketData {
  ticker: string;
  companyName: string;
  fetchedAt: string;
  quote: StockQuote;
  financials: FinancialStatements;
  evMetrics: EVOperatingMetrics;
  macro: MacroContext;
  sentiment: SentimentData;
  longDescription: string;
  sector: string;
  industry: string;
  country: string;
  dataGaps: string[];
}

// ── Analysis ──────────────────────────────────────────────────────────────────

export interface DimensionalScore {
  dimension: string;
  rating: string;
  detail: string;
}

export interface PriceTarget {
  bull: number;
  base: number;
  bear: number;
  currency: string;
  methodology: string;
}

export interface AnalystReport {
  reportId: string;
  generatedAt: string;
  ticker: string;
  companyName: string;
  executiveSummary: string;
  investmentThesis: string;
  riskFactors: string;
  dimensionalScores: DimensionalScore[];
  valuationAnalysis: string;
  priceTarget: PriceTarget;
  recommendation: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL';
  convictionLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  convictionRationale: string;
  fullReportText: string;
}

// ── Verifier ──────────────────────────────────────────────────────────────────

export interface VerifierResult {
  verdict: 'APPROVED' | 'REVISE' | 'REJECTED';
  score: number;
  flags: string[];
  critical_issues: string[];
  suggested_edits: string[];
  verifier_note: string;
}

// ── Publisher ─────────────────────────────────────────────────────────────────

export interface PublishLog {
  reportId: string;
  ticker: string;
  companyName: string;
  generatedAt: string;
  publishedAt: string;
  recommendation: string;
  priceTarget: PriceTarget;
  verifierScore: number;
  verifierVerdict: string;
  outputPath: string | null;
  rawMarketData: MarketData;
  reportText: string;
  verifierResult: VerifierResult;
}
