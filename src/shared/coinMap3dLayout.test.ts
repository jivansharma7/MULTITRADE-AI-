import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCoinMapLayout,
  computeCameraPresetPose,
  filterCoinsForMap,
  type CoinMonumentNode,
} from './coinMap3dLayout.ts';
import type { TokenMarketData } from './types.ts';

function makeToken(idx: number, overrides: Partial<TokenMarketData> = {}): TokenMarketData {
  return {
    mint: `So111111111111111111111111111111111111111${String(idx).padStart(2, '0')}`,
    pairAddress: `Pair${idx}`,
    symbol: `TOK${idx}`,
    name: `Token ${idx}`,
    dexId: idx % 2 === 0 ? 'pumpswap' : 'raydium',
    source: 'dexscreener',
    url: 'https://dexscreener.com',
    priceUsd: 0.01 * (idx + 1),
    priceNative: 0.0001 * (idx + 1),
    marketCapUsd: 1_000_000 / (idx + 1),
    fdvUsd: 1_000_000 / (idx + 1),
    liquidityUsd: 120_000 / (idx + 1),
    volume5mUsd: 8_000,
    volume1hUsd: 40_000,
    volume6hUsd: 150_000,
    volume24hUsd: 500_000 / (idx + 1),
    priceChange5m: 1.5,
    priceChange1h: idx % 3 === 0 ? 14.5 : idx % 3 === 1 ? -7.2 : 2.1,
    priceChange6h: 5.0,
    priceChange24h: 12.0,
    buys5m: 20,
    sells5m: 10,
    buys1h: 140,
    sells1h: 60,
    buys24h: 1200,
    sells24h: 700,
    pairCreatedAt: Date.now() - idx * 3600_000,
    bondingCurveProgressPct: idx % 2 === 0 ? 100 : 65,
    migrationStatus: idx % 2 === 0 ? 'MIGRATED_PUMPSWAP' : 'BONDING',
    isPumpFun: true,
    holdersCount: 500,
    creatorAddress: null,
    lastUpdatedUtc: new Date().toISOString(),
    freshness: 'REALTIME',
    ...overrides,
  };
}

test('buildCoinMapLayout assigns Crown/Mid/Outer tiers and prevents pedestal overlaps', () => {
  const tokens = Array.from({ length: 24 }, (_, i) => makeToken(i));
  const nodes = buildCoinMapLayout(tokens, { metric: 'mcap', category: 'ALL', maxCoins: 24 });

  assert.equal(nodes.length, 24);
  assert.equal(nodes[0].tier, 'CROWN');
  assert.equal(nodes[2].tier, 'CROWN');
  assert.equal(nodes[3].tier, 'MID');
  assert.equal(nodes[12].tier, 'OUTER');

  // Highest market cap must be tallest monument
  assert.ok(nodes[0].monumentHeight >= nodes[nodes.length - 1].monumentHeight);

  // Every monument sits grounded at y=0 and maintains non-zero radial separation
  for (let i = 0; i < nodes.length; i++) {
    assert.equal(nodes[i].position[1], 0);
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].position[0] - nodes[j].position[0];
      const dz = nodes[i].position[2] - nodes[j].position[2];
      const dist = Math.hypot(dx, dz);
      assert.ok(dist > 1.8, `Expected separation > 1.8 between rank ${nodes[i].rank} and ${nodes[j].rank}, got ${dist}`);
    }
  }
});

test('filterCoinsForMap filters GAINERS and deduplicates by mint', () => {
  const dup = makeToken(1, { volume24hUsd: 9_000_000, priceChange1h: 28 });
  const tokens = [
    makeToken(1, { volume24hUsd: 100_000, priceChange1h: 2 }),
    dup,
    makeToken(2, { priceChange1h: -12, priceChange24h: -20 }),
    makeToken(3, { priceChange1h: 19, priceChange24h: 35 }),
  ];

  const gainers = filterCoinsForMap(tokens, 'GAINERS', 'mcap', 10);
  assert.equal(gainers.length, 2);
  assert.equal(gainers[0].mint, dup.mint);
  assert.equal(gainers[0].volume24hUsd, 9_000_000);
});

test('computeCameraPresetPose frames focused coin and overview cleanly', () => {
  const tokens = Array.from({ length: 8 }, (_, i) => makeToken(i));
  const nodes: CoinMonumentNode[] = buildCoinMapLayout(tokens);
  const overview = computeCameraPresetPose('OVERVIEW', nodes);
  assert.deepEqual(overview.target, [0, 1.4, 0]);

  const focused = computeCameraPresetPose('OVERVIEW', nodes, nodes[1].mint);
  assert.equal(focused.target[0], nodes[1].position[0]);
  assert.equal(focused.target[2], nodes[1].position[2]);
  assert.ok(focused.position[1] >= 3.6);
});
