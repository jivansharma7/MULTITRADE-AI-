import { isGraduatedToken } from './marketAnalytics.ts';
import { runDeterministicWorkersAndScore } from './scoringAndRisk.ts';
import type {
  AccountRiskProfile,
  ManagedAccount,
  OnChainTokenAudit,
  PaperPosition,
  RiskLevel,
  TokenMarketData,
} from './types.ts';

export type VisualizerTimeframe = '5m' | '1h' | '6h' | '24h';
export type VisualizerCohort = 'ALL' | 'GAINERS' | 'LOSERS' | 'GRADUATED';

export type ProfitabilitySignal =
  | 'BUY_OPPORTUNITY'
  | 'ACCUMULATE'
  | 'HOLD_MONITOR'
  | 'TRIM_PROFIT'
  | 'SELL_RISK_EXIT'
  | 'AVOID_HIGH_RISK';

export interface VisualizerBubbleDatum {
  token: TokenMarketData;
  volumeUsd: number;
  priceChangePct: number;
  buyCount: number;
  sellCount: number;
  buyPressurePct: number | null;
  volumeToLiquidityRatio: number | null;
  isGraduated: boolean;
  /** Normalized 0..1 elevation factor used for 3D depth shading & isometric offset */
  elevationFactor: number;
}

export interface CoinProfitabilityAssessment {
  mint: string;
  symbol: string;
  name: string;
  signal: ProfitabilitySignal;
  signalLabel: string;
  portfolioFitScore: number; // 0-100
  deterministicScore: number; // 0-100
  riskLevel: RiskLevel;
  overriddenByCriticalRisk: boolean;
  inUserPortfolio: boolean;
  heldPositionValueUsd: number;
  heldUnrealizedPnlPct: number | null;
  entryPriceUsd: number;
  stopLossPriceUsd: number;
  takeProfitPriceUsd: number;
  estimatedUpsidePct: number;
  stopLossPct: number;
  riskRewardRatio: number;
  buyPressurePct: number | null;
  reasons: string[];
  riskWarnings: string[];
}

export function getVolumeForTimeframe(
  token: TokenMarketData,
  timeframe: VisualizerTimeframe
): number {
  switch (timeframe) {
    case '5m':
      return Math.max(0, token.volume5mUsd || 0);
    case '1h':
      return Math.max(0, token.volume1hUsd || 0);
    case '6h':
      return Math.max(0, token.volume6hUsd || 0);
    case '24h':
    default:
      return Math.max(0, token.volume24hUsd || 0);
  }
}

export function getChangeForTimeframe(
  token: TokenMarketData,
  timeframe: VisualizerTimeframe
): number {
  switch (timeframe) {
    case '5m':
      return token.priceChange5m ?? 0;
    case '1h':
      return token.priceChange1h ?? 0;
    case '6h':
      return token.priceChange6h ?? 0;
    case '24h':
    default:
      return token.priceChange24h ?? 0;
  }
}

export function getOrderCountsForTimeframe(
  token: TokenMarketData,
  timeframe: VisualizerTimeframe
): { buys: number; sells: number } {
  switch (timeframe) {
    case '5m':
      return { buys: token.buys5m ?? 0, sells: token.sells5m ?? 0 };
    case '1h':
    case '6h':
      return { buys: token.buys1h ?? 0, sells: token.sells1h ?? 0 };
    case '24h':
    default:
      return { buys: token.buys24h ?? 0, sells: token.sells24h ?? 0 };
  }
}

export function rankTokensForBubbleMap(params: {
  tokens: TokenMarketData[];
  timeframe: VisualizerTimeframe;
  cohort?: VisualizerCohort;
  searchQuery?: string;
  limit?: number;
}): VisualizerBubbleDatum[] {
  const { tokens, timeframe, cohort = 'ALL', searchQuery = '', limit = 36 } = params;
  const q = searchQuery.trim().toLowerCase();

  let filtered = tokens.filter((t) => t.priceUsd > 0 && getVolumeForTimeframe(t, timeframe) > 0);

  if (cohort === 'GAINERS') {
    filtered = filtered.filter((t) => getChangeForTimeframe(t, timeframe) > 0);
  } else if (cohort === 'LOSERS') {
    filtered = filtered.filter((t) => getChangeForTimeframe(t, timeframe) < 0);
  } else if (cohort === 'GRADUATED') {
    filtered = filtered.filter((t) => isGraduatedToken(t));
  }

  if (q) {
    filtered = filtered.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.mint.toLowerCase().includes(q)
    );
  }

  filtered.sort((a, b) => getVolumeForTimeframe(b, timeframe) - getVolumeForTimeframe(a, timeframe));
  const sliced = filtered.slice(0, Math.max(1, limit));

  const maxVol = sliced.length > 0 ? Math.max(1, getVolumeForTimeframe(sliced[0], timeframe)) : 1;

  return sliced.map((token) => {
    const volumeUsd = getVolumeForTimeframe(token, timeframe);
    const priceChangePct = getChangeForTimeframe(token, timeframe);
    const { buys, sells } = getOrderCountsForTimeframe(token, timeframe);
    const totalOrders = buys + sells;
    const buyPressurePct = totalOrders > 0 ? Math.round((buys / totalOrders) * 100) : null;
    const volumeToLiquidityRatio =
      token.liquidityUsd > 0 ? Number((volumeUsd / token.liquidityUsd).toFixed(2)) : null;

    // 3D elevation combines normalized log volume & absolute positive momentum
    const volRatio = Math.log10(1 + volumeUsd) / Math.max(1, Math.log10(1 + maxVol));
    const momentumLift = Math.max(0, Math.min(0.25, priceChangePct / 150));
    const elevationFactor = Math.max(0.08, Math.min(1, volRatio * 0.8 + momentumLift));

    return {
      token,
      volumeUsd,
      priceChangePct,
      buyCount: buys,
      sellCount: sells,
      buyPressurePct,
      volumeToLiquidityRatio,
      isGraduated: isGraduatedToken(token),
      elevationFactor,
    };
  });
}

function getProfileMinimums(riskProfile: AccountRiskProfile) {
  switch (riskProfile) {
    case 'CONSERVATIVE':
      return { minLiquidity: 50_000, defaultSlPct: 12, defaultTpPct: 28 };
    case 'AGGRESSIVE':
      return { minLiquidity: 8_000, defaultSlPct: 20, defaultTpPct: 50 };
    case 'BALANCED':
    default:
      return { minLiquidity: 20_000, defaultSlPct: 15, defaultTpPct: 35 };
  }
}

function signalDisplayLabel(signal: ProfitabilitySignal): string {
  switch (signal) {
    case 'BUY_OPPORTUNITY':
      return 'BUY OPPORTUNITY';
    case 'ACCUMULATE':
      return 'ACCUMULATE';
    case 'HOLD_MONITOR':
      return 'HOLD & MONITOR';
    case 'TRIM_PROFIT':
      return 'TRIM / TAKE PROFIT';
    case 'SELL_RISK_EXIT':
      return 'SELL / RISK EXIT';
    case 'AVOID_HIGH_RISK':
      return 'AVOID HIGH RISK';
  }
}

export function evaluateCoinProfitabilitySignal(params: {
  token: TokenMarketData;
  audit?: OnChainTokenAudit | null;
  positions: PaperPosition[];
  account?: Pick<ManagedAccount, 'riskProfile' | 'stopLossPct' | 'takeProfitPct' | 'maxPositionPct'>;
  timeframe?: VisualizerTimeframe;
}): CoinProfitabilityAssessment {
  const { token, audit = null, positions, account, timeframe = '24h' } = params;
  const riskProfile: AccountRiskProfile = account?.riskProfile ?? 'BALANCED';
  const mins = getProfileMinimums(riskProfile);

  const stopLossPct = Math.max(5, account?.stopLossPct ?? mins.defaultSlPct);
  const takeProfitPct = Math.max(10, account?.takeProfitPct ?? mins.defaultTpPct);

  const det = runDeterministicWorkersAndScore({
    token,
    audit,
    candles: [],
    social: null,
    jupiterRouteVerified: null,
  });

  const heldPos = positions.find((p) => p.mint === token.mint) || null;
  const inUserPortfolio = Boolean(heldPos && heldPos.quantity > 0);
  const heldPositionValueUsd = heldPos ? heldPos.quantity * token.priceUsd : 0;
  const heldUnrealizedPnlPct =
    heldPos && heldPos.avgEntryPriceUsd > 0
      ? Number((((token.priceUsd - heldPos.avgEntryPriceUsd) / heldPos.avgEntryPriceUsd) * 100).toFixed(2))
      : null;

  const { buys, sells } = getOrderCountsForTimeframe(token, timeframe);
  const totalTx = buys + sells;
  const buyPressurePct = totalTx > 0 ? Math.round((buys / totalTx) * 100) : null;
  const changePct = getChangeForTimeframe(token, timeframe);
  const volUsd = getVolumeForTimeframe(token, timeframe);

  const reasons: string[] = [];
  const riskWarnings: string[] = [...det.riskAssessment.criticalFlags];

  if (token.liquidityUsd < mins.minLiquidity) {
    riskWarnings.push(
      `Pool liquidity ($${Math.round(token.liquidityUsd).toLocaleString()}) is below ${riskProfile.toLowerCase()} target ($${mins.minLiquidity.toLocaleString()}).`
    );
  }
  if (!audit || !audit.rpcConnected) {
    riskWarnings.push('Live Mint/Freeze authority RPC audit pending — verify before committing capital.');
  }
  if (token.priceChange1h > 90) {
    riskWarnings.push(`Extended 1h spike (+${token.priceChange1h.toFixed(1)}%) increases pullback risk.`);
  }
  if (buyPressurePct !== null && buyPressurePct < 42) {
    riskWarnings.push(`Bearish order flow (${buyPressurePct}% buys vs ${100 - buyPressurePct}% sells).`);
  }

  let signal: ProfitabilitySignal = 'HOLD_MONITOR';

  // Critical risk overrides first
  if (det.overriddenByCriticalRisk || det.riskAssessment.overallLevel === 'CRITICAL') {
    signal = inUserPortfolio ? 'SELL_RISK_EXIT' : 'AVOID_HIGH_RISK';
    reasons.push('Critical on-chain or liquidity risk flag triggered safety override.');
  } else if (inUserPortfolio && heldUnrealizedPnlPct !== null) {
    // Existing position management logic
    if (heldUnrealizedPnlPct <= -stopLossPct) {
      signal = 'SELL_RISK_EXIT';
      reasons.push(
        `Unrealized P&L (${heldUnrealizedPnlPct.toFixed(1)}%) breached stop-loss (-${stopLossPct}%).`
      );
    } else if (heldUnrealizedPnlPct >= takeProfitPct) {
      signal = 'TRIM_PROFIT';
      reasons.push(
        `Position reached +${heldUnrealizedPnlPct.toFixed(1)}%, exceeding +${takeProfitPct}% target; lock in gains.`
      );
    } else if (
      buyPressurePct !== null &&
      buyPressurePct < 40 &&
      token.priceChange1h < -10
    ) {
      signal = 'TRIM_PROFIT';
      reasons.push('Momentum is fading with rising sell pressure; consider trimming exposure.');
    } else if (
      det.finalScore >= 62 &&
      (buyPressurePct === null || buyPressurePct >= 54) &&
      token.liquidityUsd >= mins.minLiquidity
    ) {
      signal = 'ACCUMULATE';
      reasons.push(
        `Strong composite score (${det.finalScore}/100) and supportive order flow while position remains within risk limits.`
      );
    } else {
      signal = 'HOLD_MONITOR';
      reasons.push('Position is within stop-loss and take-profit guardrails; continue monitoring volume.');
    }
  } else {
    // New entry evaluation logic
    const strongLiquidity = token.liquidityUsd >= mins.minLiquidity;
    const healthyOrderFlow = buyPressurePct === null ? token.buys1h >= token.sells1h : buyPressurePct >= 54;
    const controlledMomentum = changePct > -12 && token.priceChange1h < 85;
    const conservativeBlocked =
      riskProfile === 'CONSERVATIVE' && det.riskAssessment.overallLevel === 'HIGH';

    if (conservativeBlocked || !strongLiquidity || det.finalScore < 42) {
      signal = det.riskAssessment.overallLevel === 'HIGH' ? 'AVOID_HIGH_RISK' : 'HOLD_MONITOR';
      reasons.push(
        strongLiquidity
          ? `Composite score (${det.finalScore}/100) does not meet ${riskProfile} entry conviction.`
          : `Liquidity depth ($${Math.round(token.liquidityUsd).toLocaleString()}) is too thin for clean entry/exit.`
      );
    } else if (det.finalScore >= 62 && healthyOrderFlow && controlledMomentum) {
      signal = 'BUY_OPPORTUNITY';
      reasons.push(
        `Top-volume liquidity ($${Math.round(token.liquidityUsd).toLocaleString()}) with ${
          buyPressurePct ?? 50
        }% buy dominance and healthy momentum.`
      );
    } else if (det.finalScore >= 52 && healthyOrderFlow) {
      signal = 'ACCUMULATE';
      reasons.push(
        `Constructive buy flow and $${Math.round(volUsd).toLocaleString()} ${timeframe} volume; stagger entries.`
      );
    } else {
      signal = 'HOLD_MONITOR';
      reasons.push('Mixed momentum/order flow — wait for clearer buy-side confirmation or pullback.');
    }
  }

  // Portfolio fit score combines deterministic score, liquidity health, order flow, and diversification
  let portfolioFitScore = det.finalScore;
  if (token.liquidityUsd >= 100_000) portfolioFitScore += 8;
  else if (token.liquidityUsd >= 35_000) portfolioFitScore += 4;
  else if (token.liquidityUsd < 10_000) portfolioFitScore -= 18;

  if (volUsd >= 250_000) portfolioFitScore += 6;
  else if (volUsd >= 50_000) portfolioFitScore += 3;

  if (buyPressurePct !== null) {
    if (buyPressurePct >= 58) portfolioFitScore += 6;
    else if (buyPressurePct <= 40) portfolioFitScore -= 8;
  }

  if (changePct > 120) portfolioFitScore -= 7; // overextended chase penalty
  if (det.overriddenByCriticalRisk) portfolioFitScore = Math.min(portfolioFitScore, 24);
  portfolioFitScore = Math.max(0, Math.min(100, Math.round(portfolioFitScore)));

  const entryPriceUsd = token.priceUsd;
  const stopLossPriceUsd = Number((entryPriceUsd * (1 - stopLossPct / 100)).toFixed(10));
  const takeProfitPriceUsd = Number((entryPriceUsd * (1 + takeProfitPct / 100)).toFixed(10));
  const riskRewardRatio = Number((takeProfitPct / Math.max(1, stopLossPct)).toFixed(2));

  if (reasons.length === 0) {
    reasons.push(`Evaluated with ${riskProfile} profile against ${timeframe} Solana DEX flow.`);
  }

  return {
    mint: token.mint,
    symbol: token.symbol,
    name: token.name,
    signal,
    signalLabel: signalDisplayLabel(signal),
    portfolioFitScore,
    deterministicScore: det.finalScore,
    riskLevel: det.riskAssessment.overallLevel,
    overriddenByCriticalRisk: det.overriddenByCriticalRisk,
    inUserPortfolio,
    heldPositionValueUsd: Number(heldPositionValueUsd.toFixed(2)),
    heldUnrealizedPnlPct,
    entryPriceUsd,
    stopLossPriceUsd,
    takeProfitPriceUsd,
    estimatedUpsidePct: takeProfitPct,
    stopLossPct,
    riskRewardRatio,
    buyPressurePct,
    reasons,
    riskWarnings,
  };
}

export function comparePortfolioCandidates(params: {
  bubbles: VisualizerBubbleDatum[];
  positions: PaperPosition[];
  account?: Pick<ManagedAccount, 'riskProfile' | 'stopLossPct' | 'takeProfitPct' | 'maxPositionPct'>;
  timeframe: VisualizerTimeframe;
  auditsByMint?: Record<string, OnChainTokenAudit | null | undefined>;
}): CoinProfitabilityAssessment[] {
  const { bubbles, positions, account, timeframe, auditsByMint = {} } = params;
  const assessments = bubbles.map((b) =>
    evaluateCoinProfitabilitySignal({
      token: b.token,
      audit: auditsByMint[b.token.mint] ?? null,
      positions,
      account,
      timeframe,
    })
  );

  assessments.sort((a, b) => b.portfolioFitScore - a.portfolioFitScore);
  return assessments;
}
