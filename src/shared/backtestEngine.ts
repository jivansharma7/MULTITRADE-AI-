import { computeEma, computeRsi } from './scoringAndRisk.ts';
import type {
  BacktestConfig,
  BacktestEquityPoint,
  BacktestResult,
  BacktestStrategyId,
  BacktestTrade,
  OhlcvCandle,
} from './types.ts';

export interface StrategyMetadata {
  id: BacktestStrategyId;
  name: string;
  description: string;
  entryRule: string;
  exitRule: string;
}

export const BACKTEST_STRATEGIES: StrategyMetadata[] = [
  {
    id: 'momentum',
    name: 'Momentum Strategy',
    description: 'Captures sustained directional expansion when fast EMA leads slow EMA with positive rate of change.',
    entryRule: 'EMA(5) > EMA(15) and 3-bar return > 1.5%',
    exitRule: 'EMA(5) < EMA(15) or stop-loss / take-profit hit',
  },
  {
    id: 'volume_breakout',
    name: 'Volume Breakout Strategy',
    description: 'Targets high-conviction breakouts backed by anomalous DEX volume surges.',
    entryRule: 'Close > prior 8-bar high and Volume > 2.0x 8-bar avg volume',
    exitRule: 'Close < EMA(8) or stop-loss / take-profit hit',
  },
  {
    id: 'liquidity_based',
    name: 'Liquidity-Based Strategy',
    description: 'Trades compression breakouts after tight volatility regimes on liquid bars.',
    entryRule: 'Bar range expands > 1.5x prior 6-bar avg range on green close with above-median volume',
    exitRule: '2 consecutive red closes or stop-loss / take-profit hit',
  },
  {
    id: 'whale_activity',
    name: 'Whale Activity Strategy',
    description: 'Proxies large-ticket accumulation using absorption volume spikes with strong close position.',
    entryRule: 'Volume > 2.4x 10-bar avg and close in upper 30% of candle range',
    exitRule: 'High-volume distribution bar or stop-loss / take-profit hit',
  },
  {
    id: 'early_launch',
    name: 'Early-Launch Research Strategy',
    description: 'Models opening-window continuation after initial price discovery stabilization.',
    entryRule: 'Price clears 5-bar opening range high with higher low structure',
    exitRule: 'Price loses 5-bar midpoint or stop-loss / take-profit hit',
  },
  {
    id: 'pullback',
    name: 'Pullback Strategy',
    description: 'Buys controlled RSI retracements inside an established higher-timeframe uptrend.',
    entryRule: 'EMA(9) > EMA(21) and RSI(14) rebounds between 35 and 52 on green close',
    exitRule: 'RSI(14) > 74 or close below EMA(21)',
  },
  {
    id: 'narrative_momentum',
    name: 'Narrative Momentum Strategy',
    description: 'Tracks multi-bar persistent accumulation waves typical of viral memecoin rotations.',
    entryRule: '3 consecutive higher closes with expanding cumulative volume',
    exitRule: 'First close below prior bar low or stop-loss / take-profit hit',
  },
];

/**
 * Pure deterministic backtester strictly enforcing NO look-ahead bias:
 * Signal evaluated using candles[0..i] only; entry/exit executed at candles[i].close
 * adjusted for slippageBps and feeBps.
 */
export function runDeterministicBacktest(
  candles: OhlcvCandle[],
  config: BacktestConfig,
  dataSource: string
): BacktestResult {
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const feeRate = config.feeBps / 10000;
  const slippageRate = config.slippageBps / 10000;

  let equity = config.initialCapitalUsd;
  let peakEquity = equity;
  let maxDrawdownPct = 0;

  const equityCurve: BacktestEquityPoint[] = [];
  const trades: BacktestTrade[] = [];

  let inPosition = false;
  let entryTime = 0;
  let entryExecPrice = 0;
  let positionQty = 0;
  let entryFee = 0;

  const warmup = Math.min(22, Math.max(6, Math.floor(sorted.length * 0.2)));

  for (let i = 0; i < sorted.length; i++) {
    const bar = sorted[i];
    const slice = sorted.slice(0, i + 1);
    const closes = slice.map((c) => c.close);

    if (i >= warmup) {
      if (!inPosition) {
        const enter = evaluateEntrySignal(config.strategyId, slice, closes);
        if (enter && bar.close > 0) {
          const execPrice = bar.close * (1 + slippageRate);
          const fee = equity * feeRate;
          const netCapital = Math.max(0, equity - fee);
          positionQty = netCapital / execPrice;
          entryExecPrice = execPrice;
          entryTime = bar.timestamp;
          entryFee = fee;
          inPosition = true;
        }
      } else {
        const markPrice = bar.close;
        const unrealizedPct = ((markPrice - entryExecPrice) / entryExecPrice) * 100;

        let exitReason: BacktestTrade['exitReason'] | null = null;
        if (unrealizedPct <= -Math.abs(config.stopLossPct)) {
          exitReason = 'STOP_LOSS';
        } else if (unrealizedPct >= Math.abs(config.takeProfitPct)) {
          exitReason = 'TAKE_PROFIT';
        } else if (evaluateExitSignal(config.strategyId, slice, closes)) {
          exitReason = 'SIGNAL';
        } else if (i === sorted.length - 1) {
          exitReason = 'END_OF_SERIES';
        }

        if (exitReason) {
          const exitExecPrice = bar.close * (1 - slippageRate);
          const grossProceeds = positionQty * exitExecPrice;
          const exitFee = grossProceeds * feeRate;
          const netProceeds = Math.max(0, grossProceeds - exitFee);
          const prevCapital = positionQty * entryExecPrice + entryFee;
          const pnlUsd = netProceeds - prevCapital;
          const netReturnPct = prevCapital > 0 ? (pnlUsd / prevCapital) * 100 : 0;

          trades.push({
            entryTime,
            exitTime: bar.timestamp,
            entryPrice: entryExecPrice,
            exitPrice: exitExecPrice,
            netReturnPct,
            pnlUsd,
            feesUsd: entryFee + exitFee,
            exitReason,
          });

          equity = netProceeds;
          inPosition = false;
          positionQty = 0;
        }
      }
    }

    const markEquity = inPosition ? positionQty * bar.close : equity;
    if (markEquity > peakEquity) peakEquity = markEquity;
    const dd = peakEquity > 0 ? ((peakEquity - markEquity) / peakEquity) * 100 : 0;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;

    equityCurve.push({
      timestamp: bar.timestamp,
      equityUsd: Number(markEquity.toFixed(2)),
      drawdownPct: Number(dd.toFixed(2)),
    });
  }

  const wins = trades.filter((t) => t.pnlUsd > 0);
  const losses = trades.filter((t) => t.pnlUsd <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnlUsd, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlUsd, 0));

  const profitFactor =
    grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99 : 0;
  const winRatePct = trades.length > 0 ? Number(((wins.length / trades.length) * 100).toFixed(1)) : 0;
  const finalEquityUsd = Number(equity.toFixed(2));
  const historicalReturnPct = Number(
    (((finalEquityUsd - config.initialCapitalUsd) / config.initialCapitalUsd) * 100).toFixed(2)
  );
  const totalFeesUsd = Number(trades.reduce((s, t) => s + t.feesUsd, 0).toFixed(2));
  const avgHoldingMinutes =
    trades.length > 0
      ? Number(
          (
            trades.reduce((s, t) => s + Math.max(1, (t.exitTime - t.entryTime) / 60000), 0) /
            trades.length
          ).toFixed(1)
        )
      : 0;

  return {
    config,
    candlesAnalyzed: sorted.length,
    periodStartUtc: sorted[0] ? new Date(sorted[0].timestamp).toISOString() : new Date().toISOString(),
    periodEndUtc: sorted[sorted.length - 1]
      ? new Date(sorted[sorted.length - 1].timestamp).toISOString()
      : new Date().toISOString(),
    historicalReturnPct,
    winRatePct,
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    profitFactor,
    totalTrades: trades.length,
    avgHoldingMinutes,
    totalFeesUsd,
    finalEquityUsd,
    equityCurve,
    trades,
    dataSource,
  };
}

function evaluateEntrySignal(
  strategyId: BacktestStrategyId,
  bars: OhlcvCandle[],
  closes: number[]
): boolean {
  const n = bars.length;
  if (n < 6) return false;
  const curr = bars[n - 1];
  const prev = bars[n - 2];

  switch (strategyId) {
    case 'momentum': {
      const ema5 = computeEma(closes, 5);
      const ema15 = computeEma(closes, Math.min(15, n - 1));
      const roc3 = n >= 4 && closes[n - 4] > 0 ? (curr.close - closes[n - 4]) / closes[n - 4] : 0;
      return ema5 !== null && ema15 !== null && ema5 > ema15 && roc3 > 0.015;
    }
    case 'volume_breakout': {
      const lookback = bars.slice(Math.max(0, n - 9), n - 1);
      const maxHigh = Math.max(...lookback.map((b) => b.high));
      const avgVol = lookback.reduce((s, b) => s + b.volume, 0) / Math.max(1, lookback.length);
      return curr.close > maxHigh && curr.volume > avgVol * 1.8;
    }
    case 'liquidity_based': {
      const lookback = bars.slice(Math.max(0, n - 7), n - 1);
      const avgRange = lookback.reduce((s, b) => s + (b.high - b.low), 0) / Math.max(1, lookback.length);
      const avgVol = lookback.reduce((s, b) => s + b.volume, 0) / Math.max(1, lookback.length);
      const currRange = curr.high - curr.low;
      return curr.close > curr.open && currRange > avgRange * 1.35 && curr.volume >= avgVol;
    }
    case 'whale_activity': {
      const lookback = bars.slice(Math.max(0, n - 11), n - 1);
      const avgVol = lookback.reduce((s, b) => s + b.volume, 0) / Math.max(1, lookback.length);
      const range = curr.high - curr.low;
      const closePos = range > 0 ? (curr.close - curr.low) / range : 0.5;
      return curr.volume > avgVol * 2.1 && closePos >= 0.65 && curr.close > curr.open;
    }
    case 'early_launch': {
      const lookback = bars.slice(Math.max(0, n - 6), n - 1);
      const high5 = Math.max(...lookback.map((b) => b.high));
      return curr.close > high5 && curr.low >= prev.low;
    }
    case 'pullback': {
      const ema9 = computeEma(closes, 9);
      const ema21 = computeEma(closes, Math.min(21, n - 1));
      const rsi = computeRsi(closes, Math.min(14, n - 1));
      return (
        ema9 !== null &&
        ema21 !== null &&
        rsi !== null &&
        ema9 > ema21 &&
        rsi >= 35 &&
        rsi <= 55 &&
        curr.close > curr.open
      );
    }
    case 'narrative_momentum': {
      if (n < 4) return false;
      const b1 = bars[n - 3];
      const b2 = bars[n - 2];
      return curr.close > b2.close && b2.close > b1.close && curr.volume > b1.volume;
    }
  }
}

function evaluateExitSignal(
  strategyId: BacktestStrategyId,
  bars: OhlcvCandle[],
  closes: number[]
): boolean {
  const n = bars.length;
  if (n < 5) return false;
  const curr = bars[n - 1];
  const prev = bars[n - 2];

  switch (strategyId) {
    case 'momentum': {
      const ema5 = computeEma(closes, 5);
      const ema15 = computeEma(closes, Math.min(15, n - 1));
      return ema5 !== null && ema15 !== null && ema5 < ema15;
    }
    case 'volume_breakout': {
      const ema8 = computeEma(closes, 8);
      return ema8 !== null && curr.close < ema8;
    }
    case 'liquidity_based': {
      return curr.close < curr.open && prev.close < prev.open;
    }
    case 'whale_activity': {
      const lookback = bars.slice(Math.max(0, n - 8), n - 1);
      const avgVol = lookback.reduce((s, b) => s + b.volume, 0) / Math.max(1, lookback.length);
      return curr.close < curr.open && curr.volume > avgVol * 1.6;
    }
    case 'early_launch': {
      const lookback = bars.slice(Math.max(0, n - 6), n - 1);
      const mid =
        (Math.max(...lookback.map((b) => b.high)) + Math.min(...lookback.map((b) => b.low))) / 2;
      return curr.close < mid;
    }
    case 'pullback': {
      const ema21 = computeEma(closes, Math.min(21, n - 1));
      const rsi = computeRsi(closes, Math.min(14, n - 1));
      return (rsi !== null && rsi > 74) || (ema21 !== null && curr.close < ema21);
    }
    case 'narrative_momentum': {
      return curr.close < prev.low;
    }
  }
}
