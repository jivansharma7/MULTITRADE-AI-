import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDashboardStats,
  computeWalletPortfolioSummary,
  evaluateMarketAlerts,
  filterAndSortTokens,
} from './marketAnalytics.ts';
import type { AlertRule, TokenMarketData, WalletIntelligenceProfile } from './types.ts';

const NOW = 1_760_000_000_000;

function makeToken(overrides: Partial<TokenMarketData>): TokenMarketData {
  return {
    mint: 'So11111111111111111111111111111111111111112',
    pairAddress: 'Pair11111111111111111111111111111111111111',
    symbol: 'TEST',
    name: 'Test Token',
    dexId: 'raydium',
    source: 'DexScreener',
    url: 'https://dexscreener.com',
    priceUsd: 0.01,
    priceNative: 0.00005,
    marketCapUsd: 250_000,
    fdvUsd: 250_000,
    liquidityUsd: 40_000,
    volume5mUsd: 1000,
    volume1hUsd: 12_000,
    volume6hUsd: 40_000,
    volume24hUsd: 100_000,
    priceChange5m: 2,
    priceChange1h: 15,
    priceChange6h: 20,
    priceChange24h: 35,
    buys5m: 12,
    sells5m: 6,
    buys1h: 80,
    sells1h: 40,
    buys24h: 500,
    sells24h: 300,
    pairCreatedAt: NOW - 10 * 3600 * 1000,
    bondingCurveProgressPct: null,
    migrationStatus: 'DEX_POOL',
    isPumpFun: false,
    holdersCount: null,
    creatorAddress: null,
    lastUpdatedUtc: new Date(NOW).toISOString(),
    freshness: 'REALTIME',
    ...overrides,
  };
}

describe('marketAnalytics pure functions', () => {
  const sampleTokens: TokenMarketData[] = [
    makeToken({
      mint: 'MintGainer11111111111111111111111111111111',
      symbol: 'GAIN',
      priceChange5m: 18,
      priceChange1h: 85,
      priceChange24h: 140,
      volume24hUsd: 500_000,
      liquidityUsd: 90_000,
      marketCapUsd: 800_000,
      migrationStatus: 'MIGRATED_PUMPSWAP',
      isPumpFun: true,
      bondingCurveProgressPct: 100,
      pairCreatedAt: NOW - 6 * 3600 * 1000,
    }),
    makeToken({
      mint: 'MintLoser111111111111111111111111111111111',
      symbol: 'DROP',
      priceChange5m: -12,
      priceChange1h: -45,
      priceChange24h: -60,
      volume24hUsd: 90_000,
      liquidityUsd: 7_500,
      marketCapUsd: 120_000,
      migrationStatus: 'BONDING',
      isPumpFun: true,
      bondingCurveProgressPct: 45,
      pairCreatedAt: NOW - 2 * 3600 * 1000,
    }),
    makeToken({
      mint: 'MintOld11111111111111111111111111111111111',
      symbol: 'OLDER',
      priceChange5m: 1,
      priceChange1h: 4,
      priceChange24h: 8,
      volume24hUsd: 250_000,
      liquidityUsd: 120_000,
      marketCapUsd: 3_000_000,
      pairCreatedAt: NOW - 120 * 3600 * 1000,
    }),
  ];

  it('filters graduated, gainers, losers, and new_tokens accurately', () => {
    const graduated = filterAndSortTokens(sampleTokens, { section: 'graduated' }, NOW);
    assert.equal(graduated.length, 1);
    assert.equal(graduated[0].symbol, 'GAIN');

    const losers = filterAndSortTokens(sampleTokens, { section: 'losers', timeframe: '24h' }, NOW);
    assert.equal(losers.length, 1);
    assert.equal(losers[0].symbol, 'DROP');

    const newTokens = filterAndSortTokens(sampleTokens, { section: 'new_tokens' }, NOW);
    assert.equal(newTokens.length, 2);
    assert.equal(newTokens[0].symbol, 'DROP'); // newest first

    const filteredMcap = filterAndSortTokens(
      sampleTokens,
      { minMcap: 500_000, maxMcap: 1_000_000, minLiquidity: 50_000 },
      NOW
    );
    assert.equal(filteredMcap.length, 1);
    assert.equal(filteredMcap[0].symbol, 'GAIN');
  });

  it('computes honest dashboard aggregate statistics', () => {
    const stats = computeDashboardStats(sampleTokens, NOW);
    assert.equal(stats.totalTrackedTokens, 3);
    assert.equal(stats.newTokens24h, 2);
    assert.equal(stats.graduatedCount, 1);
    assert.equal(stats.totalMarketCapUsd, 3_920_000);
    assert.equal(stats.totalVolume24hUsd, 840_000);
  });

  it('aggregates wallet portfolio valuation and allocation slices', () => {
    const wallet: WalletIntelligenceProfile = {
      address: 'Wallet111111111111111111111111111111111111',
      solBalance: 10,
      solPriceUsd: 180,
      solValueUsd: 1800,
      totalTokensUsd: 1200,
      totalPortfolioUsd: 3000,
      holdings: [
        { mint: 'A', amountUi: 100, decimals: 6, symbol: 'BONK', priceUsd: 0.01, priceChange24h: 25, valueUsd: 900 },
        { mint: 'B', amountUi: 50, decimals: 6, symbol: 'WIF', priceUsd: 6, priceChange24h: -12, valueUsd: 300 },
        { mint: 'C', amountUi: 10, decimals: 6, symbol: 'UNPRICED', priceUsd: null, priceChange24h: null, valueUsd: null },
      ],
      recentSignatures: [],
      recentTransactions: [],
      estimatedRealizedPnlUsd: null,
      estimatedUnrealizedPnlUsd: null,
      costBasisStatus: 'INCOMPLETE_HISTORY',
      pnlLimitationNote: 'Recent window only',
      classification: 'UNVERIFIED_ACTIVE',
      classificationEvidence: [],
      rpcConnected: true,
      lastUpdatedUtc: new Date(NOW).toISOString(),
    };

    const summary = computeWalletPortfolioSummary(wallet);
    assert.equal(summary.totalPortfolioUsd, 3000);
    assert.equal(summary.pricedHoldingsCount, 2);
    assert.equal(summary.unpricedHoldingsCount, 1);
    assert.equal(summary.topPerformer?.symbol, 'BONK');
    assert.equal(summary.worstPerformer?.symbol, 'WIF');
    assert.equal(summary.allocationSlices[0].label, 'SOL');
    assert.equal(summary.allocationSlices[0].pct, 60);
  });

  it('evaluates and deduplicates alert notifications cleanly', () => {
    const rules: AlertRule[] = [
      {
        id: 'r1',
        type: 'PRICE_MOVE',
        condition: '1h move >= 25%',
        threshold: 25,
        enabled: true,
        createdAt: new Date(NOW).toISOString(),
      },
      {
        id: 'r2',
        type: 'CRITICAL_RISK',
        condition: 'High risk detected',
        enabled: true,
        createdAt: new Date(NOW).toISOString(),
      },
    ];
    const seen = new Set<string>();
    const first = evaluateMarketAlerts({
      rules,
      tokens: sampleTokens,
      existingDedupeKeys: seen,
      nowIso: '2026-01-01T12:00:00.000Z',
    });
    assert.ok(first.length >= 2);
    first.forEach((n) => seen.add(n.dedupeKey));
    const second = evaluateMarketAlerts({
      rules,
      tokens: sampleTokens,
      existingDedupeKeys: seen,
      nowIso: '2026-01-01T12:05:00.000Z',
    });
    assert.equal(second.length, 0);
  });
});
