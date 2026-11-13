import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_DEPARTMENTS, AGENT_REGISTRY, getRegistryStats } from './agentRegistry.ts';
import { evaluateRugRisk, runDeterministicWorkersAndScore } from './scoringAndRisk.ts';
import type { OnChainTokenAudit, TokenMarketData } from './types.ts';

const baseToken: TokenMarketData = {
  mint: 'So11111111111111111111111111111111111111112',
  pairAddress: 'Pair11111111111111111111111111111111111111',
  symbol: 'TESTMEME',
  name: 'Test Meme Token',
  dexId: 'pumpswap',
  source: 'DexScreener',
  url: 'https://dexscreener.com/solana/pair',
  priceUsd: 0.0025,
  priceNative: 0.000014,
  marketCapUsd: 2500000,
  fdvUsd: 2500000,
  liquidityUsd: 180000,
  volume5mUsd: 18000,
  volume1hUsd: 95000,
  volume6hUsd: 320000,
  volume24hUsd: 780000,
  priceChange5m: 3.4,
  priceChange1h: 18.2,
  priceChange6h: 42.0,
  priceChange24h: 65.5,
  buys5m: 35,
  sells5m: 20,
  buys1h: 190,
  sells1h: 110,
  buys24h: 2400,
  sells24h: 1800,
  pairCreatedAt: Date.now() - 86400_000,
  bondingCurveProgressPct: 100,
  migrationStatus: 'MIGRATED_PUMPSWAP',
  isPumpFun: true,
  holdersCount: 1500,
  creatorAddress: null,
  lastUpdatedUtc: new Date().toISOString(),
  freshness: 'REALTIME',
};

const safeAudit: OnChainTokenAudit = {
  mint: baseToken.mint,
  rpcConnected: true,
  rpcSource: 'Solana Mainnet RPC',
  mintAuthority: null,
  freezeAuthority: null,
  mintAuthorityRevoked: true,
  freezeAuthorityRevoked: true,
  totalSupplyUi: 1_000_000_000,
  decimals: 6,
  topHolders: [
    { address: 'Holder1', tokenAccount: 'Acc1', amountUi: 50_000_000, pctOfSupply: 5 },
    { address: 'Holder2', tokenAccount: 'Acc2', amountUi: 40_000_000, pctOfSupply: 4 },
  ],
  top10ConcentrationPct: 18.5,
  recentSignatures: Array.from({ length: 12 }, (_, idx) => ({
    signature: `sig_${idx}`,
    slot: 300000000 + idx,
    blockTime: Math.floor(Date.now() / 1000) - idx * 10,
    err: false,
    memo: null,
  })),
  lastCheckedUtc: new Date().toISOString(),
};

test('agent registry contains exactly 130 agents across 12 departments', () => {
  const stats = getRegistryStats();
  assert.equal(AGENT_DEPARTMENTS.length, 12);
  assert.equal(stats.total, 130);
  assert.equal(AGENT_REGISTRY.length, 130);
  assert.ok(stats.operational >= 15);
  assert.equal(stats.operational + stats.registered, 130);
});

test('critical mint authority risk flag overrides positive score to REJECT/HIGH RISK', () => {
  const riskyAudit: OnChainTokenAudit = {
    ...safeAudit,
    mintAuthority: 'AttackerMintAuth111111111111111111111111111',
    mintAuthorityRevoked: false,
  };
  const result = runDeterministicWorkersAndScore({
    token: baseToken,
    audit: riskyAudit,
    candles: [],
    social: null,
    jupiterRouteVerified: true,
  });
  assert.equal(result.overriddenByCriticalRisk, true);
  assert.ok(result.finalScore <= 29);
  assert.ok(result.outcome === 'HIGH RISK' || result.outcome === 'REJECT');
});

test('8-category breakdown respects exact maximum point caps', () => {
  const result = runDeterministicWorkersAndScore({
    token: baseToken,
    audit: safeAudit,
    candles: [],
    social: null,
    jupiterRouteVerified: true,
  });
  const b = result.breakdown;
  assert.ok(b.onChainActivity <= 15);
  assert.ok(b.liquidityQuality <= 15);
  assert.ok(b.walletIntelligence <= 15);
  assert.ok(b.marketMomentum <= 15);
  assert.ok(b.socialIntelligence <= 10);
  assert.ok(b.tokenDistribution <= 10);
  assert.ok(b.technicalAnalysis <= 10);
  assert.ok(b.executionQuality <= 10);
});

test('rug risk engine reports UNKNOWN instead of LOW when RPC audit is missing', () => {
  const risk = evaluateRugRisk(baseToken, null, [], null);
  const mintCheck = risk.checks.find((c) => c.id === 'mint_authority');
  const freezeCheck = risk.checks.find((c) => c.id === 'freeze_authority');
  assert.equal(mintCheck?.level, 'UNKNOWN');
  assert.equal(freezeCheck?.level, 'UNKNOWN');
});
