import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePortfolioForAccount, rankBestTradeOptions } from './portfolioAdvisor.ts';
import type { ManagedAccount, OnChainTokenAudit, PaperPosition, TokenMarketData } from './types.ts';

function makeToken(overrides: Partial<TokenMarketData> = {}): TokenMarketData {
  return {
    mint: 'So11111111111111111111111111111111111111112',
    pairAddress: 'Pair1111111111111111111111111111111111111111',
    symbol: 'ALPHA',
    name: 'Alpha Meme',
    dexId: 'pumpswap',
    source: 'DexScreener',
    url: 'https://dexscreener.com/solana/pair',
    priceUsd: 0.01,
    priceNative: 0.0001,
    marketCapUsd: 2_500_000,
    fdvUsd: 2_500_000,
    liquidityUsd: 250_000,
    volume5mUsd: 15_000,
    volume1hUsd: 80_000,
    volume6hUsd: 300_000,
    volume24hUsd: 900_000,
    priceChange5m: 1.5,
    priceChange1h: 8.2,
    priceChange6h: 15,
    priceChange24h: 22,
    buys5m: 40,
    sells5m: 20,
    buys1h: 240,
    sells1h: 120,
    buys24h: 2000,
    sells24h: 1100,
    pairCreatedAt: Date.now() - 10 * 24 * 3600 * 1000,
    bondingCurveProgressPct: 100,
    migrationStatus: 'MIGRATED_PUMPSWAP',
    isPumpFun: true,
    holdersCount: 1800,
    creatorAddress: null,
    lastUpdatedUtc: new Date().toISOString(),
    freshness: 'REALTIME',
    ...overrides,
  };
}

function makeCleanAudit(mint: string): OnChainTokenAudit {
  return {
    mint,
    rpcConnected: true,
    rpcSource: 'Solana RPC',
    mintAuthority: null,
    freezeAuthority: null,
    mintAuthorityRevoked: true,
    freezeAuthorityRevoked: true,
    totalSupplyUi: 1_000_000_000,
    decimals: 6,
    topHolders: [],
    top10ConcentrationPct: 14,
    recentSignatures: [],
    lastCheckedUtc: new Date().toISOString(),
  };
}

const baseAccount: ManagedAccount = {
  id: 'acc_test',
  name: 'Balanced Desk',
  kind: 'PAPER_DESK',
  walletProvider: 'Paper',
  riskProfile: 'BALANCED',
  mandateMode: 'ADVISORY_ONLY',
  allocatedUsd: 10000,
  maxPositionPct: 20,
  stopLossPct: 15,
  takeProfitPct: 35,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

test('rankBestTradeOptions excludes critical mint-authority rug tokens even with high volume', () => {
  const safeMint = 'SafeMint111111111111111111111111111111111111';
  const rugMint = 'RugMint1111111111111111111111111111111111111';

  const safeToken = makeToken({ mint: safeMint, symbol: 'SAFE' });
  const rugToken = makeToken({ mint: rugMint, symbol: 'RUG', volume24hUsd: 9_000_000 });

  const rugAudit: OnChainTokenAudit = {
    ...makeCleanAudit(rugMint),
    mintAuthority: 'Attacker111111111111111111111111111111111111',
    mintAuthorityRevoked: false,
  };

  const options = rankBestTradeOptions({
    candidates: [
      { token: rugToken, audit: rugAudit },
      { token: safeToken, audit: makeCleanAudit(safeMint) },
    ],
    account: baseAccount,
    availableCashUsd: 10000,
    totalEquityUsd: 10000,
  });

  assert.equal(options.length, 1);
  assert.equal(options[0].symbol, 'SAFE');
  assert.equal(options[0].suggestedUsd, 2000); // 20% maxPositionPct of $10,000
  assert.ok(options[0].stopLossPriceUsd < options[0].entryPriceUsd);
  assert.ok(options[0].takeProfitPriceUsd > options[0].entryPriceUsd);
});

test('analyzePortfolioForAccount triggers stop-loss SELL, take-profit TRIM, and concentration TRIM', () => {
  const slMint = 'SLMint11111111111111111111111111111111111111';
  const tpMint = 'TPMint11111111111111111111111111111111111111';
  const bigMint = 'BigMint1111111111111111111111111111111111111';

  const positions: PaperPosition[] = [
    {
      mint: slMint,
      symbol: 'SLTOK',
      name: 'Stop Loss Token',
      quantity: 1000,
      avgEntryPriceUsd: 1.0,
      totalCostUsd: 1000,
      openedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      mint: tpMint,
      symbol: 'TPTOK',
      name: 'Take Profit Token',
      quantity: 1000,
      avgEntryPriceUsd: 1.0,
      totalCostUsd: 1000,
      openedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      mint: bigMint,
      symbol: 'BIGTOK',
      name: 'Overweight Token',
      quantity: 4000,
      avgEntryPriceUsd: 1.0,
      totalCostUsd: 4000,
      openedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const liveTokens: TokenMarketData[] = [
    makeToken({ mint: slMint, symbol: 'SLTOK', priceUsd: 0.75 }), // -25% (breaches 15% SL)
    makeToken({ mint: tpMint, symbol: 'TPTOK', priceUsd: 1.5 }), // +50% (hits 35% TP)
    makeToken({ mint: bigMint, symbol: 'BIGTOK', priceUsd: 1.05 }), // $4,200 weight (>25% vs 20% cap)
  ];

  const proposals = analyzePortfolioForAccount({
    account: baseAccount,
    positions,
    liveTokens,
    availableCashUsd: 3000,
    bestTradePick: null,
  });

  const slProp = proposals.find((p) => p.mint === slMint);
  const tpProp = proposals.find((p) => p.mint === tpMint);
  const bigProp = proposals.find((p) => p.mint === bigMint);

  assert.equal(slProp?.action, 'SELL');
  assert.equal(tpProp?.action, 'TRIM');
  assert.equal(bigProp?.action, 'TRIM');
});
