import type {
  AlertRule,
  InAppNotification,
  TokenMarketData,
  WalletIntelligenceProfile,
  WalletTokenHolding,
} from './types.ts';

export type MarketSectionFilter =
  | 'all'
  | 'new_tokens'
  | 'newly_launched'
  | 'trending'
  | 'graduated'
  | 'gainers'
  | 'losers'
  | 'highest_volume'
  | 'high_volume'
  | 'high_liquidity'
  | 'high_buying_pressure'
  | 'low_mcap'
  | 'pumpfun'
  | 'high_risk';

export type ChangeTimeframe = '5m' | '1h' | '6h' | '24h';

export interface MarketFilterCriteria {
  section?: MarketSectionFilter;
  timeframe?: ChangeTimeframe;
  minMcap?: number | null;
  maxMcap?: number | null;
  minLiquidity?: number | null;
  minVolume?: number | null;
  minAgeHours?: number | null;
  maxAgeHours?: number | null;
  graduationStatus?: 'ALL' | 'BONDING' | 'GRADUATED' | 'DEX_POOL';
  riskLevel?: 'ALL' | 'LOW_MODERATE' | 'HIGH_RISK';
  sortBy?: string;
}

export function getPriceChangeForTimeframe(
  token: TokenMarketData,
  timeframe: ChangeTimeframe = '1h'
): number {
  switch (timeframe) {
    case '5m':
      return token.priceChange5m;
    case '6h':
      return token.priceChange6h;
    case '24h':
      return token.priceChange24h;
    case '1h':
    default:
      return token.priceChange1h;
  }
}

export function isGraduatedToken(token: TokenMarketData): boolean {
  return (
    token.migrationStatus === 'MIGRATED_PUMPSWAP' ||
    token.migrationStatus === 'MIGRATED_RAYDIUM' ||
    (token.isPumpFun && token.bondingCurveProgressPct === 100)
  );
}

export function isHighRiskTokenHeuristic(token: TokenMarketData): boolean {
  return (
    token.liquidityUsd < 10_000 ||
    token.priceChange1h <= -35 ||
    (token.sells1h === 0 && token.buys1h >= 10)
  );
}

export function filterAndSortTokens(
  input: TokenMarketData[],
  criteria: MarketFilterCriteria,
  nowMs = Date.now()
): TokenMarketData[] {
  let list = [...input];
  const section = criteria.section || 'all';
  const tf = criteria.timeframe || '1h';

  switch (section) {
    case 'new_tokens':
    case 'newly_launched':
      list = list.filter((t) => {
        if (!t.pairCreatedAt) return false;
        return nowMs - t.pairCreatedAt <= 72 * 3600 * 1000;
      });
      break;
    case 'trending':
      list = list.filter((t) => t.volume1hUsd > 2500 || t.buys1h + t.sells1h >= 20);
      break;
    case 'graduated':
      list = list.filter((t) => isGraduatedToken(t));
      break;
    case 'gainers':
      list = list.filter((t) => getPriceChangeForTimeframe(t, tf) > 0);
      break;
    case 'losers':
      list = list.filter((t) => getPriceChangeForTimeframe(t, tf) < 0);
      break;
    case 'highest_volume':
    case 'high_volume':
      list = list.filter((t) => t.volume24hUsd >= 25_000);
      break;
    case 'high_liquidity':
      list = list.filter((t) => t.liquidityUsd >= 35_000);
      break;
    case 'high_buying_pressure':
      list = list.filter((t) => t.buys1h > t.sells1h * 1.2 && t.buys1h >= 8);
      break;
    case 'low_mcap':
      list = list.filter((t) => t.marketCapUsd > 0 && t.marketCapUsd <= 500_000);
      break;
    case 'pumpfun':
      list = list.filter((t) => t.isPumpFun);
      break;
    case 'high_risk':
      list = list.filter((t) => isHighRiskTokenHeuristic(t));
      break;
  }

  if (criteria.minMcap != null && criteria.minMcap > 0) {
    list = list.filter((t) => t.marketCapUsd >= criteria.minMcap!);
  }
  if (criteria.maxMcap != null && criteria.maxMcap > 0) {
    list = list.filter((t) => t.marketCapUsd > 0 && t.marketCapUsd <= criteria.maxMcap!);
  }
  if (criteria.minLiquidity != null && criteria.minLiquidity > 0) {
    list = list.filter((t) => t.liquidityUsd >= criteria.minLiquidity!);
  }
  if (criteria.minVolume != null && criteria.minVolume > 0) {
    list = list.filter((t) => t.volume24hUsd >= criteria.minVolume!);
  }
  if (criteria.minAgeHours != null && criteria.minAgeHours > 0) {
    const cutoff = nowMs - criteria.minAgeHours * 3600 * 1000;
    list = list.filter((t) => t.pairCreatedAt != null && t.pairCreatedAt <= cutoff);
  }
  if (criteria.maxAgeHours != null && criteria.maxAgeHours > 0) {
    const cutoff = nowMs - criteria.maxAgeHours * 3600 * 1000;
    list = list.filter((t) => t.pairCreatedAt != null && t.pairCreatedAt >= cutoff);
  }
  if (criteria.graduationStatus && criteria.graduationStatus !== 'ALL') {
    if (criteria.graduationStatus === 'BONDING') {
      list = list.filter((t) => t.migrationStatus === 'BONDING');
    } else if (criteria.graduationStatus === 'GRADUATED') {
      list = list.filter((t) => isGraduatedToken(t));
    } else if (criteria.graduationStatus === 'DEX_POOL') {
      list = list.filter((t) => t.migrationStatus === 'DEX_POOL');
    }
  }
  if (criteria.riskLevel && criteria.riskLevel !== 'ALL') {
    if (criteria.riskLevel === 'HIGH_RISK') {
      list = list.filter((t) => isHighRiskTokenHeuristic(t));
    } else {
      list = list.filter((t) => !isHighRiskTokenHeuristic(t));
    }
  }

  const effectiveSort =
    criteria.sortBy ||
    (section === 'new_tokens' || section === 'newly_launched'
      ? 'newest'
      : section === 'gainers'
      ? 'gainers'
      : section === 'losers'
      ? 'losers'
      : section === 'trending'
      ? 'trending'
      : 'volume24h');

  list.sort((a, b) => {
    switch (effectiveSort) {
      case 'newest':
        return (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0);
      case 'liquidity':
        return b.liquidityUsd - a.liquidityUsd;
      case 'marketCap':
        return b.marketCapUsd - a.marketCapUsd;
      case 'change1h':
      case 'gainers':
        return getPriceChangeForTimeframe(b, tf) - getPriceChangeForTimeframe(a, tf);
      case 'losers':
        return getPriceChangeForTimeframe(a, tf) - getPriceChangeForTimeframe(b, tf);
      case 'buys1h':
        return b.buys1h - a.buys1h;
      case 'trending': {
        const scoreA = a.volume1hUsd * 0.6 + (a.buys1h + a.sells1h) * 250;
        const scoreB = b.volume1hUsd * 0.6 + (b.buys1h + b.sells1h) * 250;
        return scoreB - scoreA;
      }
      case 'volume24h':
      default:
        return b.volume24hUsd - a.volume24hUsd;
    }
  });

  return list;
}

export interface DashboardAggregateStats {
  totalTrackedTokens: number;
  newTokens24h: number;
  graduatedCount: number;
  totalMarketCapUsd: number;
  totalVolume24hUsd: number;
  totalLiquidityUsd: number;
}

export function computeDashboardStats(
  tokens: TokenMarketData[],
  nowMs = Date.now()
): DashboardAggregateStats {
  const dayMs = 24 * 3600 * 1000;
  let newTokens24h = 0;
  let graduatedCount = 0;
  let totalMarketCapUsd = 0;
  let totalVolume24hUsd = 0;
  let totalLiquidityUsd = 0;

  for (const t of tokens) {
    if (t.pairCreatedAt && nowMs - t.pairCreatedAt <= dayMs) {
      newTokens24h += 1;
    }
    if (isGraduatedToken(t)) {
      graduatedCount += 1;
    }
    totalMarketCapUsd += Number.isFinite(t.marketCapUsd) ? t.marketCapUsd : 0;
    totalVolume24hUsd += Number.isFinite(t.volume24hUsd) ? t.volume24hUsd : 0;
    totalLiquidityUsd += Number.isFinite(t.liquidityUsd) ? t.liquidityUsd : 0;
  }

  return {
    totalTrackedTokens: tokens.length,
    newTokens24h,
    graduatedCount,
    totalMarketCapUsd,
    totalVolume24hUsd,
    totalLiquidityUsd,
  };
}

export interface WalletPortfolioSummary {
  totalPortfolioUsd: number | null;
  solValueUsd: number | null;
  tokensValueUsd: number;
  pricedHoldingsCount: number;
  unpricedHoldingsCount: number;
  topPerformer: WalletTokenHolding | null;
  worstPerformer: WalletTokenHolding | null;
  allocationSlices: Array<{ label: string; valueUsd: number; pct: number }>;
}

export function computeWalletPortfolioSummary(
  wallet: WalletIntelligenceProfile
): WalletPortfolioSummary {
  const priced = wallet.holdings.filter((h) => h.valueUsd != null && h.valueUsd > 0);
  const unpriced = wallet.holdings.length - priced.length;
  const tokensValueUsd = priced.reduce((sum, h) => sum + (h.valueUsd || 0), 0);
  const solVal = wallet.solValueUsd ?? 0;
  const hasAnyValue = wallet.solValueUsd !== null || priced.length > 0;
  const totalPortfolioUsd = hasAnyValue ? solVal + tokensValueUsd : null;

  const withChange = wallet.holdings.filter((h) => h.priceChange24h != null);
  withChange.sort((a, b) => (b.priceChange24h || 0) - (a.priceChange24h || 0));

  const slicesRaw: Array<{ label: string; valueUsd: number }> = [];
  if (wallet.solValueUsd && wallet.solValueUsd > 0) {
    slicesRaw.push({ label: 'SOL', valueUsd: wallet.solValueUsd });
  }
  const sortedPriced = [...priced].sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));
  for (const h of sortedPriced.slice(0, 5)) {
    slicesRaw.push({
      label: h.symbol || `${h.mint.slice(0, 4)}..`,
      valueUsd: h.valueUsd || 0,
    });
  }
  const otherVal = sortedPriced.slice(5).reduce((s, h) => s + (h.valueUsd || 0), 0);
  if (otherVal > 0) {
    slicesRaw.push({ label: 'Other SPL', valueUsd: otherVal });
  }

  const denom = slicesRaw.reduce((s, x) => s + x.valueUsd, 0) || 1;
  const allocationSlices = slicesRaw.map((x) => ({
    ...x,
    pct: Number(((x.valueUsd / denom) * 100).toFixed(1)),
  }));

  return {
    totalPortfolioUsd,
    solValueUsd: wallet.solValueUsd,
    tokensValueUsd,
    pricedHoldingsCount: priced.length,
    unpricedHoldingsCount: unpriced,
    topPerformer: withChange[0] || null,
    worstPerformer: withChange.length > 1 ? withChange[withChange.length - 1] : null,
    allocationSlices,
  };
}

export function evaluateMarketAlerts(params: {
  rules: AlertRule[];
  tokens: TokenMarketData[];
  existingDedupeKeys: Set<string>;
  nowIso?: string;
}): InAppNotification[] {
  const { rules, tokens, existingDedupeKeys, nowIso = new Date().toISOString() } = params;
  const bucket = nowIso.slice(0, 13); // hourly deduplication bucket
  const out: InAppNotification[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const candidates = rule.mint
      ? tokens.filter((t) => t.mint === rule.mint)
      : tokens.slice(0, 15);

    for (const token of candidates) {
      if (rule.type === 'PRICE_MOVE') {
        const threshold = rule.threshold ?? 25;
        if (Math.abs(token.priceChange1h) >= threshold) {
          const dedupeKey = `${rule.id}:${token.mint}:PRICE:${bucket}`;
          if (!existingDedupeKeys.has(dedupeKey)) {
            out.push({
              id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              dedupeKey,
              ruleId: rule.id,
              type: rule.type,
              title: `${token.symbol} moved ${token.priceChange1h >= 0 ? '+' : ''}${token.priceChange1h.toFixed(1)}% (1h)`,
              message: `Triggered rule "${rule.condition}" at $${token.priceUsd.toFixed(6)}.`,
              mint: token.mint,
              symbol: token.symbol,
              severity: Math.abs(token.priceChange1h) >= 50 ? 'CRITICAL' : 'WARNING',
              createdAt: nowIso,
              read: false,
            });
          }
        }
      } else if (rule.type === 'CRITICAL_RISK') {
        if (isHighRiskTokenHeuristic(token)) {
          const dedupeKey = `${rule.id}:${token.mint}:RISK:${bucket}`;
          if (!existingDedupeKeys.has(dedupeKey)) {
            out.push({
              id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              dedupeKey,
              ruleId: rule.id,
              type: rule.type,
              title: `Risk Alert on ${token.symbol}`,
              message:
                token.liquidityUsd < 10_000
                  ? `Thin pool liquidity ($${Math.round(token.liquidityUsd).toLocaleString()}).`
                  : `Sharp 1h drawdown (${token.priceChange1h.toFixed(1)}%) or zero-sell skew.`,
              mint: token.mint,
              symbol: token.symbol,
              severity: 'CRITICAL',
              createdAt: nowIso,
              read: false,
            });
          }
        }
      } else if (rule.type === 'LIQUIDITY_CHANGE') {
        const threshold = rule.threshold ?? 15_000;
        if (token.liquidityUsd > 0 && token.liquidityUsd < threshold) {
          const dedupeKey = `${rule.id}:${token.mint}:LIQ:${bucket}`;
          if (!existingDedupeKeys.has(dedupeKey)) {
            out.push({
              id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              dedupeKey,
              ruleId: rule.id,
              type: rule.type,
              title: `Low Liquidity Warning: ${token.symbol}`,
              message: `Pool liquidity is $${Math.round(token.liquidityUsd).toLocaleString()} (below $${threshold.toLocaleString()}).`,
              mint: token.mint,
              symbol: token.symbol,
              severity: 'WARNING',
              createdAt: nowIso,
              read: false,
            });
          }
        }
      } else if (rule.type === 'NEW_TOKEN') {
        if (token.pairCreatedAt && Date.now() - token.pairCreatedAt < 6 * 3600 * 1000) {
          const dedupeKey = `${rule.id}:${token.mint}:NEW:${bucket}`;
          if (!existingDedupeKeys.has(dedupeKey)) {
            out.push({
              id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              dedupeKey,
              ruleId: rule.id,
              type: rule.type,
              title: `New Token Indexed: ${token.symbol}`,
              message: `${token.name} on ${token.dexId} with $${Math.round(token.liquidityUsd).toLocaleString()} liquidity.`,
              mint: token.mint,
              symbol: token.symbol,
              severity: 'INFO',
              createdAt: nowIso,
              read: false,
            });
          }
        }
      }
    }
  }

  return out.slice(0, 12);
}
