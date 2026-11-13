import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comparePortfolioCandidates,
  evaluateCoinProfitabilitySignal,
  rankTokensForBubbleMap,
} from './marketVisualizerLogic.ts';
import type { OnChainTokenAudit, PaperPosition, TokenMarketData } from './types.ts';

function makeToken(overrides: Partial<TokenMarketData>): TokenMarketData {
  return {
    mint: 'MintDefault11111111111111111111111111111111',
    pairAddress: 'Pair11111111111111111111111111111111111111',
    symbol: 'TKN',
    name: 'Token',
    dexId: 'raydium',
    source: 'DexScreener',
    url: 'https://dexscreener.com/solana/pair',
    priceUsd: 0.01,
    priceNative: 0.00006,
    marketCapUsd: 2_500_000,
    fdvUsd: 2_500_000,
    liquidityUsd: 160_000,
    volume5mUsd: 20_000,
    volume1hUsd: 140_000,
    volume6hUsd: 420_000,
    volume24hUsd: 1_200_000,
    priceChange5m: 2.5,
    priceChange1h: 11.4,
    priceChange6h: 22.0,
    priceChange24h: 34.0,
    buys5m: 45,
    sells5m: 20,
    buys1h: 280,
    sells1h: 120,
    buys24h: 3200,
    sells24h: 2100,
    pairCreatedAt: Date.now() - 10 * 3600_000,
    bondingCurveProgressPct: 100,
    migrationStatus: 'MIGRATED_RAYDIUM',
    isPumpFun: true,
    holdersCount: 1800,
    creatorAddress: null,
    lastUpdatedUtc: new Date().toISOString(),
    freshness: 'REALTIME',
    ...overrides,
  };
}

const cleanAudit: OnChainTokenAudit = {
  mint: 'MintA',
  rpcConnected: true,
  rpcSource: 'Solana RPC',
  mintAuthority: null,
  freezeAuthority: null,
  mintAuthorityRevoked: true,
  freezeAuthorityRevoked: true,
  totalSupplyUi: 1_000_000_000,
  decimals: 6,
  topHolders: [{ address: 'H1', tokenAccount: 'A1', amountUi: 50_000_000, pctOfSupply: 5 }],
  top10ConcentrationPct: 16,
  recentSignatures: Array.from({ length: 15 }, (_, i) => ({
    signature: `sig_${i}`,
    slot: 100 + i,
    blockTime: Math.floor(Date.now() / 1000) - i * 30,
    err: false,
    memo: null,
  })),
  lastCheckedUtc: new Date().toISOString(),
};

test('rankTokensForBubbleMap sorts by selected timeframe volume and computes buy pressure', () => {
  const high1h = makeToken({ mint: 'Mint1h', symbol: 'VOL1H', volume1hUsd: 800_000, volume24hUsd: 900_000 });
  const high24h = makeToken({
    mint: 'Mint24h',
    symbol: 'VOL24H',
    volume1hUsd: 120_000,
    volume24hUsd: 4_500_000,
    priceChange24h: -8.5,
  });

  const ranked1h = rankTokensForBubbleMap({ tokens: [high24h, high1h], timeframe: '1h' });
  assert.equal(ranked1h[0].token.symbol, 'VOL1H');
  assert.equal(ranked1h[0].volumeUsd, 800_000);
  assert.equal(ranked1h[0].buyPressurePct, 70);

  const ranked24h = rankTokensForBubbleMap({ tokens: [high24h, high1h], timeframe: '24h' });
  assert.equal(ranked24h[0].token.symbol, 'VOL24H');
  assert.equal(ranked24h[0].priceChangePct, -8.5);

  const gainersOnly = rankTokensForBubbleMap({
    tokens: [high24h, high1h],
    timeframe: '24h',
    cohort: 'GAINERS',
  });
  assert.equal(gainersOnly.length, 1);
  assert.equal(gainersOnly[0].token.symbol, 'VOL1H');
});

test('evaluateCoinProfitabilitySignal blocks buy on critical active mint authority', () => {
  const rugToken = makeToken({ mint: 'RugMint', symbol: 'RUG', liquidityUsd: 150_000 });
  const badAudit: OnChainTokenAudit = {
    ...cleanAudit,
    mint: 'RugMint',
    mintAuthority: 'BadAuth1111',
    mintAuthorityRevoked: false,
  };

  const assessment = evaluateCoinProfitabilitySignal({
    token: rugToken,
    audit: badAudit,
    positions: [],
    timeframe: '24h',
  });

  assert.equal(assessment.overriddenByCriticalRisk, true);
  assert.equal(assessment.signal, 'AVOID_HIGH_RISK');
  assert.ok(assessment.portfolioFitScore <= 24);
});

test('evaluateCoinProfitabilitySignal triggers TRIM_PROFIT and SELL_RISK_EXIT for held positions', () => {
  const token = makeToken({ mint: 'HeldMint', symbol: 'HELD', priceUsd: 0.02 });

  const winningPos: PaperPosition = {
    mint: 'HeldMint',
    symbol: 'HELD',
    name: 'Held Token',
    quantity: 10000,
    avgEntryPriceUsd: 0.01, // +100% unrealized gain
    totalCostUsd: 100,
    openedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const trimAssessment = evaluateCoinProfitabilitySignal({
    token,
    audit: { ...cleanAudit, mint: 'HeldMint' },
    positions: [winningPos],
    account: { riskProfile: 'BALANCED', stopLossPct: 15, takeProfitPct: 35, maxPositionPct: 20 },
  });
  assert.equal(trimAssessment.signal, 'TRIM_PROFIT');
  assert.equal(trimAssessment.inUserPortfolio, true);
  assert.equal(trimAssessment.heldUnrealizedPnlPct, 100);

  const losingPos: PaperPosition = {
    ...winningPos,
    avgEntryPriceUsd: 0.04, // -50% unrealized loss
  };
  const exitAssessment = evaluateCoinProfitabilitySignal({
    token,
    audit: { ...cleanAudit, mint: 'HeldMint' },
    positions: [losingPos],
    account: { riskProfile: 'BALANCED', stopLossPct: 15, takeProfitPct: 35, maxPositionPct: 20 },
  });
  assert.equal(exitAssessment.signal, 'SELL_RISK_EXIT');
});

test('comparePortfolioCandidates ranks stronger liquid coin ahead of weak thin coin', () => {
  const strong = makeToken({
    mint: 'StrongMint',
    symbol: 'STRONG',
    liquidityUsd: 450_000,
    volume24hUsd: 2_800_000,
    buys24h: 4200,
    sells24h: 1900,
    buys1h: 320,
    sells1h: 140,
  });
  const weak = makeToken({
    mint: 'WeakMint',
    symbol: 'THIN',
    liquidityUsd: 4_000,
    volume24hUsd: 150_000,
    priceChange1h: -30,
    buys1h: 20,
    sells1h: 85,
  });

  const bubbles = rankTokensForBubbleMap({ tokens: [weak, strong], timeframe: '24h' });
  const compared = comparePortfolioCandidates({
    bubbles,
    positions: [],
    timeframe: '24h',
    auditsByMint: {
      StrongMint: { ...cleanAudit, mint: 'StrongMint' },
    },
  });

  assert.equal(compared[0].symbol, 'STRONG');
  assert.ok(compared[0].portfolioFitScore > compared[1].portfolioFitScore);
  assert.ok(
    compared[0].signal === 'BUY_OPPORTUNITY' || compared[0].signal === 'ACCUMULATE'
  );
});
