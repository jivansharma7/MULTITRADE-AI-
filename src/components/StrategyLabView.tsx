import React, { useState } from 'react';
import { FlaskConical, Play } from 'lucide-react';
import { BACKTEST_STRATEGIES } from '../shared/backtestEngine';
import { formatQuoteCurrency, formatUtcOrLocalTimestamp } from '../shared/currency';
import {
  SupportedTimeframeValues,
  type BacktestResult,
  type BacktestStrategyId,
  type SupportedTimeframe,
  type TokenMarketData,
} from '../shared/types';
import { useAuth } from '../contexts/AuthContext';
import { EquityCurveChart } from './charts/EquityCurveChart';

interface StrategyLabViewProps {
  tokens: TokenMarketData[];
}

export const StrategyLabView: React.FC<StrategyLabViewProps> = ({ tokens }) => {
  const { profile, fxRates, backtests, recordBacktest } = useAuth();
  const [selectedMint, setSelectedMint] = useState(tokens[0]?.mint || '');
  const [strategyId, setStrategyId] = useState<BacktestStrategyId>('momentum');
  const [timeframe, setTimeframe] = useState<SupportedTimeframe>('15m');
  const [feeBps, setFeeBps] = useState('25');
  const [slippageBps, setSlippageBps] = useState('50');
  const [stopLossPct, setStopLossPct] = useState('12');
  const [takeProfitPct, setTakeProfitPct] = useState('30');
  const [initialCapital, setInitialCapital] = useState('10000');

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeResult, setActiveResult] = useState<BacktestResult | null>(backtests[0] || null);

  const effectiveMint = selectedMint || tokens[0]?.mint || '';

  const handleRunBacktest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveMint) {
      setError('Wait for live tokens to load or enter a token mint.');
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint: effectiveMint,
          strategyId,
          timeframe,
          feeBps: Number(feeBps),
          slippageBps: Number(slippageBps),
          initialCapitalUsd: Number(initialCapital),
          stopLossPct: Number(stopLossPct),
          takeProfitPct: Number(takeProfitPct),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Backtest failed');
      setActiveResult(data.result);
      await recordBacktest(data.result);
    } catch (err: any) {
      setError(err?.message || 'Failed to execute strategy backtest.');
    } finally {
      setRunning(false);
    }
  };

  const activeStrategyMeta = BACKTEST_STRATEGIES.find((s) => s.id === strategyId)!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-white">
          Strategy Lab &amp; Deterministic Backtesting
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Evaluate 7 quantitative strategies on real historical Solana OHLCV bars with strict zero look-ahead bias, DEX fees, and slippage modeling.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Configuration Panel */}
        <form
          onSubmit={handleRunBacktest}
          className="space-y-4 rounded-xl border border-slate-800 bg-[#0D1322] p-5 lg:col-span-4"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <FlaskConical className="h-4 w-4 text-blue-400" />
            Backtest Parameters
          </div>

          <div>
            <label htmlFor="bt-token" className="block text-xs text-slate-300">
              Target Token
            </label>
            <select
              id="bt-token"
              value={effectiveMint}
              onChange={(e) => setSelectedMint(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              {tokens.map((t) => (
                <option key={t.mint} value={t.mint}>
                  {t.symbol} — {t.name.slice(0, 24)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bt-strategy" className="block text-xs text-slate-300">
              Strategy Model (7 Available)
            </label>
            <select
              id="bt-strategy"
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value as BacktestStrategyId)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              {BACKTEST_STRATEGIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="mt-2 rounded border border-slate-800 bg-[#070B14] p-2.5 text-[11px] text-slate-400">
              <div>{activeStrategyMeta.description}</div>
              <div className="mt-1 text-slate-300">Entry: {activeStrategyMeta.entryRule}</div>
              <div className="text-slate-300">Exit: {activeStrategyMeta.exitRule}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bt-tf" className="block text-xs text-slate-300">
                Timeframe
              </label>
              <select
                id="bt-tf"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as SupportedTimeframe)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
              >
                {SupportedTimeframeValues.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="bt-cap" className="block text-xs text-slate-300">
                Capital (USD)
              </label>
              <input
                id="bt-cap"
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bt-fee" className="block text-xs text-slate-300">
                Fee (bps)
              </label>
              <input
                id="bt-fee"
                type="number"
                value={feeBps}
                onChange={(e) => setFeeBps(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label htmlFor="bt-slip" className="block text-xs text-slate-300">
                Slippage (bps)
              </label>
              <input
                id="bt-slip"
                type="number"
                value={slippageBps}
                onChange={(e) => setSlippageBps(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bt-sl" className="block text-xs text-slate-300">
                Stop Loss (%)
              </label>
              <input
                id="bt-sl"
                type="number"
                value={stopLossPct}
                onChange={(e) => setStopLossPct(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label htmlFor="bt-tp" className="block text-xs text-slate-300">
                Take Profit (%)
              </label>
              <input
                id="bt-tp"
                type="number"
                value={takeProfitPct}
                onChange={(e) => setTakeProfitPct(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={running}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {running ? 'Running Historical Simulation...' : 'Run Backtest'}
          </button>
        </form>

        {/* Results Panel */}
        <div className="space-y-6 lg:col-span-8">
          {activeResult ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
                  <div className="text-xs text-slate-400">Net Return</div>
                  <div
                    className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
                      activeResult.historicalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {activeResult.historicalReturnPct >= 0 ? '+' : ''}
                    {activeResult.historicalReturnPct}%
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
                  <div className="text-xs text-slate-400">Win Rate</div>
                  <div className="mt-1 font-mono text-xl font-semibold text-white tabular-nums">
                    {activeResult.winRatePct}%
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
                  <div className="text-xs text-slate-400">Max Drawdown</div>
                  <div className="mt-1 font-mono text-xl font-semibold text-rose-400 tabular-nums">
                    -{activeResult.maxDrawdownPct}%
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
                  <div className="text-xs text-slate-400">Profit Factor</div>
                  <div className="mt-1 font-mono text-xl font-semibold text-white tabular-nums">
                    {activeResult.profitFactor}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="font-semibold text-white">
                    Equity Curve · {activeResult.config.symbol} ({activeResult.config.strategyId},{' '}
                    {activeResult.config.timeframe})
                  </div>
                  <div className="text-slate-400">
                    {activeResult.totalTrades} trades · Avg hold {activeResult.avgHoldingMinutes}m · Fees:{' '}
                    {formatQuoteCurrency(activeResult.totalFeesUsd, profile.quoteCurrency, fxRates)}
                  </div>
                </div>
                <EquityCurveChart
                  points={activeResult.equityCurve.map((p) => ({
                    timestamp: p.timestamp,
                    value: p.equityUsd,
                  }))}
                  baselineValue={activeResult.config.initialCapitalUsd}
                  formatValue={(v) => formatQuoteCurrency(v, profile.quoteCurrency, fxRates)}
                />
              </div>

              {/* Strategy Comparison Table across runs */}
              {backtests.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
                  <h2 className="mb-3 text-sm font-semibold text-white">
                    Strategy Comparison History
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="pb-2 font-medium">Token</th>
                          <th className="pb-2 font-medium">Strategy</th>
                          <th className="pb-2 font-medium">TF</th>
                          <th className="pb-2 text-right font-medium">Return</th>
                          <th className="pb-2 text-right font-medium">Win Rate</th>
                          <th className="pb-2 text-right font-medium">Max DD</th>
                          <th className="pb-2 text-right font-medium">Trades</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 font-mono">
                        {backtests.map((bt, idx) => (
                          <tr key={idx}>
                            <td className="py-2 text-white">{bt.config.symbol}</td>
                            <td className="py-2 text-slate-300">{bt.config.strategyId}</td>
                            <td className="py-2 text-slate-400">{bt.config.timeframe}</td>
                            <td
                              className={`py-2 text-right tabular-nums ${
                                bt.historicalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {bt.historicalReturnPct >= 0 ? '+' : ''}
                              {bt.historicalReturnPct}%
                            </td>
                            <td className="py-2 text-right tabular-nums text-slate-200">
                              {bt.winRatePct}%
                            </td>
                            <td className="py-2 text-right tabular-nums text-rose-400">
                              -{bt.maxDrawdownPct}%
                            </td>
                            <td className="py-2 text-right tabular-nums text-slate-300">
                              {bt.totalTrades}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Executed Trade Log */}
              <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
                <h2 className="mb-3 text-sm font-semibold text-white">
                  Simulated Trade Log ({activeResult.trades.length} trades)
                </h2>
                {activeResult.trades.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Strategy conditions did not trigger any entries across the {activeResult.candlesAnalyzed} historical bars.
                  </p>
                ) : (
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="pb-2 font-medium">Entry Time</th>
                          <th className="pb-2 font-medium">Exit Reason</th>
                          <th className="pb-2 text-right font-medium">Entry Px</th>
                          <th className="pb-2 text-right font-medium">Exit Px</th>
                          <th className="pb-2 text-right font-medium">Net Return</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 font-mono">
                        {activeResult.trades.map((tr, i) => (
                          <tr key={i}>
                            <td className="py-2 text-slate-300">
                              {formatUtcOrLocalTimestamp(tr.entryTime, profile.timezone)}
                            </td>
                            <td className="py-2 text-slate-400">{tr.exitReason}</td>
                            <td className="py-2 text-right tabular-nums text-slate-200">
                              ${tr.entryPrice.toFixed(6)}
                            </td>
                            <td className="py-2 text-right tabular-nums text-slate-200">
                              ${tr.exitPrice.toFixed(6)}
                            </td>
                            <td
                              className={`py-2 text-right tabular-nums ${
                                tr.netReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {tr.netReturnPct >= 0 ? '+' : ''}
                              {tr.netReturnPct.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-slate-800 bg-[#0D1322] p-8 text-center">
              <FlaskConical className="h-8 w-8 text-blue-400" />
              <h2 className="mt-3 text-base font-semibold text-white">
                Select a Token &amp; Strategy to Run Backtest
              </h2>
              <p className="mt-1 max-w-md text-xs text-slate-400">
                MEMEINTEL AI fetches historical OHLCV candles from GeckoTerminal and simulates entries/exits strictly without look-ahead bias.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
