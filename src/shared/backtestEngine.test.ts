import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKTEST_STRATEGIES, runDeterministicBacktest } from './backtestEngine.ts';
import type { OhlcvCandle } from './types.ts';

function buildSyntheticUptrendSeries(count: number): OhlcvCandle[] {
  const start = Date.UTC(2026, 0, 1, 0, 0, 0);
  const candles: OhlcvCandle[] = [];
  let price = 1.0;
  for (let i = 0; i < count; i++) {
    // Oscillating uptrend so momentum/pullback/breakout strategies trigger deterministically
    const wave = Math.sin(i * 0.45) * 0.04;
    const trend = 0.012;
    const open = price;
    const close = Math.max(0.1, open * (1 + trend + wave));
    const high = Math.max(open, close) * 1.02;
    const low = Math.min(open, close) * 0.985;
    const volume = i % 7 === 0 ? 180000 : 45000 + i * 500;
    candles.push({
      timestamp: start + i * 5 * 60_000,
      open,
      high,
      low,
      close,
      volume,
    });
    price = close;
  }
  return candles;
}

test('all 7 backtest strategies execute deterministically and account for fees/slippage', () => {
  const candles = buildSyntheticUptrendSeries(90);
  assert.equal(BACKTEST_STRATEGIES.length, 7);

  for (const strategy of BACKTEST_STRATEGIES) {
    const res = runDeterministicBacktest(
      candles,
      {
        mint: 'TestMint1111111111111111111111111111111111',
        symbol: 'TEST',
        strategyId: strategy.id,
        timeframe: '5m',
        feeBps: 25,
        slippageBps: 50,
        initialCapitalUsd: 10000,
        stopLossPct: 12,
        takeProfitPct: 30,
      },
      'Deterministic Test Series'
    );

    assert.equal(res.candlesAnalyzed, 90);
    assert.equal(res.equityCurve.length, 90);
    assert.ok(res.maxDrawdownPct >= 0 && res.maxDrawdownPct <= 100);
    assert.ok(res.winRatePct >= 0 && res.winRatePct <= 100);
    if (res.totalTrades > 0) {
      assert.ok(res.totalFeesUsd > 0, `${strategy.id} should record non-zero fees when trading`);
    }
  }
});

test('higher fees and slippage strictly reduce or equal final equity', () => {
  const candles = buildSyntheticUptrendSeries(80);
  const lowCost = runDeterministicBacktest(
    candles,
    {
      mint: 'TestMint1111111111111111111111111111111111',
      symbol: 'TEST',
      strategyId: 'momentum',
      timeframe: '5m',
      feeBps: 5,
      slippageBps: 5,
      initialCapitalUsd: 10000,
      stopLossPct: 15,
      takeProfitPct: 35,
    },
    'Test'
  );
  const highCost = runDeterministicBacktest(
    candles,
    {
      mint: 'TestMint1111111111111111111111111111111111',
      symbol: 'TEST',
      strategyId: 'momentum',
      timeframe: '5m',
      feeBps: 100,
      slippageBps: 200,
      initialCapitalUsd: 10000,
      stopLossPct: 15,
      takeProfitPct: 35,
    },
    'Test'
  );
  assert.ok(highCost.finalEquityUsd <= lowCost.finalEquityUsd);
});
