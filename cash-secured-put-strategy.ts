/**
 * Cash-Secured Put Strategy
 * Sell an OTM put, hold cash equal to the strike × 100 as collateral.
 *
 * Pricing: Cox-Ross-Rubinstein (CRR) binomial tree — American-style exercise.
 *
 * Max Profit : premium collected × contracts × 100
 * Max Loss   : (strike − breakeven) × contracts × 100  (stock → $0)
 * Breakeven  : strike − (premium per share)
 */

// ─── CRR Binomial Tree ────────────────────────────────────────────────────────

export function crrPrice(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  optionType: 'put' | 'call' = 'put',
  steps: number = 100,
): number {
  if (T <= 0 || sigma <= 0) {
    return Math.max(optionType === 'call' ? S - K : K - S, 0);
  }

  const dt   = T / steps;
  const u    = Math.exp(sigma * Math.sqrt(dt));
  const d    = 1 / u;
  const disc = Math.exp(-r * dt);
  const p    = (Math.exp(r * dt) - d) / (u - d);

  const values: number[] = [];
  for (let j = 0; j <= steps; j++) {
    const spot = S * Math.pow(u, j) * Math.pow(d, steps - j);
    values.push(optionType === 'call' ? Math.max(spot - K, 0) : Math.max(K - spot, 0));
  }

  for (let i = steps - 1; i >= 0; i--) {
    for (let j = 0; j <= i; j++) {
      const cont      = disc * (p * values[j + 1] + (1 - p) * values[j]);
      const spot      = S * Math.pow(u, j) * Math.pow(d, i - j);
      const intrinsic = optionType === 'call' ? Math.max(spot - K, 0) : Math.max(K - spot, 0);
      values[j] = Math.max(intrinsic, cont);
    }
  }

  return Math.round(values[0] * 1_000_000) / 1_000_000;
}

export function assignmentProbabilityCRR(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  steps: number = 100,
): number {
  if (T <= 0) return S < K ? 1 : 0;

  const dt    = T / steps;
  const u     = Math.exp(sigma * Math.sqrt(dt));
  const d     = 1 / u;
  const p     = (Math.exp(r * dt) - d) / (u - d);
  const q     = 1 - p;
  const logP  = Math.log(p);
  const logQ  = Math.log(q);

  const logBinom: number[] = [steps * logQ];
  for (let j = 1; j <= steps; j++) {
    logBinom[j] = logBinom[j - 1] + Math.log(steps - j + 1) - Math.log(j) + logP - logQ;
  }

  let probBelow = 0;
  for (let j = 0; j <= steps; j++) {
    const spotT = S * Math.pow(u, j) * Math.pow(d, steps - j);
    if (spotT < K) probBelow += Math.exp(logBinom[j]);
  }

  return Math.min(Math.max(probBelow, 0), 1);
}

// ─── Config & theoretical analysis ───────────────────────────────────────────

export interface CashSecuredPutConfig {
  strikeOffset:       number;   // put strike as % below spot (e.g. -0.05 = 5% OTM)
  daysToExpiry:       number;
  riskFreeRate:       number;
  impliedVolatility?: number;
  contracts:          number;
  crrSteps:           number;
}

export const defaultConfig: CashSecuredPutConfig = {
  strikeOffset:  -0.05,
  daysToExpiry:  30,
  riskFreeRate:  0.05,
  contracts:     1,
  crrSteps:      100,
};

export interface CspResult {
  premiumCollected:     number;
  strikePrice:          number;
  breakeven:            number;
  maxProfit:            number;
  annualizedReturn:     number;
  assignmentProbability: number;
  capitalRequired:      number;
}

export class CashSecuredPutStrategy {
  private strikeOffset:       number;
  private daysToExpiry:       number;
  private riskFreeRate:       number;
  private impliedVolatility?: number;
  private contracts:          number;
  private crrSteps:           number;

  constructor(config: CashSecuredPutConfig = defaultConfig) {
    this.strikeOffset       = config.strikeOffset;
    this.daysToExpiry       = config.daysToExpiry;
    this.riskFreeRate       = config.riskFreeRate;
    this.impliedVolatility  = config.impliedVolatility;
    this.contracts          = config.contracts;
    this.crrSteps           = config.crrSteps;
  }

  evaluate(spotPrice: number, historicalVol: number = 0.25): CspResult {
    const sigma   = this.impliedVolatility ?? historicalVol;
    const T       = this.daysToExpiry / 365;
    const strike  = Math.round(spotPrice * (1 + this.strikeOffset) * 100) / 100;

    const premium     = crrPrice(spotPrice, strike, T, this.riskFreeRate, sigma, 'put', this.crrSteps);
    const totalPremium = premium * this.contracts * 100;
    const capital     = strike * this.contracts * 100;
    const breakeven   = strike - premium;
    const annReturn   = (totalPremium / capital) * (365 / this.daysToExpiry) * 100;
    const assignProb  = assignmentProbabilityCRR(spotPrice, strike, T, this.riskFreeRate, sigma, this.crrSteps);

    return {
      premiumCollected:      totalPremium,
      strikePrice:           strike,
      breakeven,
      maxProfit:             totalPremium,
      annualizedReturn:      annReturn,
      assignmentProbability: assignProb * 100,
      capitalRequired:       capital,
    };
  }
}

// ─── Options chain helpers ────────────────────────────────────────────────────

export interface ChainOption {
  strike:       number;
  expiry:       string;
  bid:          number;
  ask:          number;
  mid:          number;
  iv:           number;
  delta:        number;
  volume:       number;
  openInterest: number;
}

export function filterByLiquidity(
  chain:            ChainOption[],
  minVolume       = 10,
  minOpenInterest = 100,
): ChainOption[] {
  return chain.filter(o => o.volume >= minVolume && o.openInterest >= minOpenInterest);
}

export function bidAskSpreadPct(option: ChainOption): number {
  if (option.mid === 0) return 0;
  return ((option.ask - option.bid) / option.mid) * 100;
}

function selectStrike(targetPrice: number, availableStrikes: number[]): number {
  if (availableStrikes.length === 0) throw new Error('availableStrikes cannot be empty');
  return availableStrikes.reduce((nearest, s) =>
    Math.abs(s - targetPrice) < Math.abs(nearest - targetPrice) ? s : nearest,
  );
}

// ─── Chain-aware CSP analysis ─────────────────────────────────────────────────

export interface ChainCspAnalysis {
  strike:               number;
  ask:                  number;    // put ask (reference for limit order)
  shortLeg:             ChainOption;
  premium:              number;    // shortLeg.bid × contracts × 100 (what you collect)
  breakeven:            number;    // strike − premium/contracts/100
  maxProfit:            number;    // = premium
  maxLoss:              number;    // = breakeven × contracts × 100 (if stock → $0)
  capitalRequired:      number;    // = strike × contracts × 100
  annualizedReturn:     number;    // (premium / capitalRequired) × (365 / dte) × 100
  assignmentProbability: number;   // percentage
  bidAskSlippage:       number;    // (mid − bid) × contracts × 100
  selectedExpiry:       string;
  contracts:            number;
  daysToExpiry:         number;
}

/**
 * Analyze a cash-secured put using real options chain data.
 *
 * Realistic fill: you SELL the put at the BID price (worst case).
 * assignmentProbability: estimated via CRR terminal distribution.
 */
export function analyzeCashSecuredPutFromChain(
  spotPrice: number,
  chain: ChainOption[],
  config: Omit<CashSecuredPutConfig, 'impliedVolatility'> & { impliedVolatility?: number },
): ChainCspAnalysis {
  if (chain.length === 0) throw new Error('chain cannot be empty');

  const strikes = [...new Set(chain.map(o => o.strike))].sort((a, b) => a - b);
  const strike  = selectStrike(spotPrice * (1 + config.strikeOffset), strikes);
  const leg     = chain.find(o => o.strike === strike);
  if (!leg) throw new Error(`No chain row found for strike ${strike}`);

  const { contracts, daysToExpiry, riskFreeRate, crrSteps } = config;
  const sigma    = config.impliedVolatility ?? leg.iv;
  const T        = daysToExpiry / 365;

  const premium        = leg.bid * contracts * 100;
  const breakeven      = strike - leg.bid;
  const capitalRequired = strike * contracts * 100;
  const annReturn      = capitalRequired > 0
    ? (premium / capitalRequired) * (365 / daysToExpiry) * 100
    : 0;
  const assignProb     = assignmentProbabilityCRR(spotPrice, strike, T, riskFreeRate, sigma, crrSteps);
  const bidAskSlippage = (leg.mid - leg.bid) * contracts * 100;

  return {
    strike,
    ask: leg.ask,
    shortLeg: leg,
    premium,
    breakeven,
    maxProfit:             premium,
    maxLoss:               breakeven * contracts * 100,
    capitalRequired,
    annualizedReturn:      annReturn,
    assignmentProbability: assignProb * 100,
    bidAskSlippage,
    selectedExpiry: leg.expiry,
    contracts,
    daysToExpiry,
  };
}

// ─── Executability assessment ─────────────────────────────────────────────────

export interface CspExecutabilityAssessment {
  score:              number;   // 0–100, higher = better
  executeNow:         boolean;  // score >= 70
  spreadPct:          number;   // bid-ask as % of mid
  premiumToWidthPct:  number;   // premium / capitalRequired × 100 (yield per cycle)
  warnings:           string[];
}

export function assessExecutability(analysis: ChainCspAnalysis): CspExecutabilityAssessment {
  const { shortLeg, premium, capitalRequired } = analysis;

  const warnings: string[] = [];
  let score = 100;

  const spreadPct         = bidAskSpreadPct(shortLeg);
  const premiumToWidthPct = capitalRequired > 0 ? (premium / capitalRequired) * 100 : 0;

  if (shortLeg.volume < 50) { warnings.push('Low volume — harder to fill'); score -= 10; }
  if (shortLeg.volume < 10) { warnings.push('Very low volume');             score -= 20; }

  if (shortLeg.openInterest < 100) { warnings.push('Thin open interest'); score -= 10; }

  if (spreadPct > 10) { warnings.push(`Wide bid-ask: ${spreadPct.toFixed(1)}%`); score -= 15; }
  if (spreadPct > 20) { warnings.push('Bid-ask slippage is high');               score -= 25; }

  if (analysis.assignmentProbability > 50) {
    warnings.push(`Assignment probability is high: ${analysis.assignmentProbability.toFixed(1)}%`);
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  return { score, executeNow: score >= 70, spreadPct, premiumToWidthPct, warnings };
}

// ─── Cost comparison ──────────────────────────────────────────────────────────

export interface CspCostComparison {
  theoreticalPremium: number;   // mid × contracts × 100
  realisticPremium:   number;   // bid × contracts × 100
  slippageDollars:    number;   // theoretical − realistic (you gave away this much)
  slippagePct:        number;   // (slippage / theoretical) × 100
}

export function compareCosts(analysis: ChainCspAnalysis): CspCostComparison {
  const { shortLeg, contracts } = analysis;

  const theoreticalPremium = shortLeg.mid * contracts * 100;
  const realisticPremium   = shortLeg.bid * contracts * 100;
  const slippageDollars    = theoreticalPremium - realisticPremium;

  return {
    theoreticalPremium,
    realisticPremium,
    slippageDollars,
    slippagePct: theoreticalPremium > 0 ? (slippageDollars / theoreticalPremium) * 100 : 0,
  };
}
