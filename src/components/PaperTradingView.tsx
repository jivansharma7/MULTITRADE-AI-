import React, { useState } from 'react';
import { Lock, RefreshCw, ShieldAlert, Wallet } from 'lucide-react';
import { formatQuoteCurrency, formatUtcOrLocalTimestamp } from '../shared/currency';
import type { TokenMarketData } from '../shared/types';
import { useAuth } from '../contexts/AuthContext';
import { useWallet } from '../contexts/WalletContext';

interface PaperTradingViewProps {
  tokens: TokenMarketData[];
  onSelectToken: (mint: string) => void;
  onOpenWalletModal: () => void;
}

export const PaperTradingView: React.FC<PaperTradingViewProps> = ({
  tokens,
  onSelectToken,
  onOpenWalletModal,
}) => {
  const {
    profile,
    fxRates,
    positions,
    orders,
    executePaperOrder,
    resetPaperAccount,
    updatePreferences,
    logAudit,
  } = useAuth();
  const { connectedWallet, walletProfile } = useWallet();

  const [tab, setTab] = useState<'paper' | 'wallet' | 'live_guard'>('paper');
  const [selectedMint, setSelectedMint] = useState(tokens[0]?.mint || '');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState('500');
  const [slippageBps, setSlippageBps] = useState('100');
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Live trading guard state
  const [livePreview, setLivePreview] = useState<{
    available: boolean;
    outAmount?: string;
    priceImpactPct?: number;
    routeLabels?: string[];
    estimatedPriorityFeeSol?: number;
    estimatedNetworkFeeSol?: number;
    error?: string;
  } | null>(null);
  const [preparingLive, setPreparingLive] = useState(false);

  const tokenMap = new Map(tokens.map((t) => [t.mint, t]));
  const activeToken = tokenMap.get(selectedMint) || tokens[0] || null;

  const openMarketValueUsd = positions.reduce((sum, pos) => {
    const livePx = tokenMap.get(pos.mint)?.priceUsd ?? pos.avgEntryPriceUsd;
    return sum + pos.quantity * livePx;
  }, 0);
  const totalCostUsd = positions.reduce((sum, pos) => sum + pos.totalCostUsd, 0);
  const unrealizedPnlUsd = openMarketValueUsd - totalCostUsd;
  const totalNavUsd = profile.paperBalanceUsd + openMarketValueUsd;

  const handlePaperTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeToken) return;
    setStatusMsg(null);
    const res = await executePaperOrder({
      token: activeToken,
      side,
      usdOrQtyAmount: Number(amount),
      slippageBps: Number(slippageBps),
    });
    if (res.ok && res.order) {
      setStatusMsg({
        ok: true,
        text: `Simulated ${res.order.side} filled: ${res.order.quantity.toFixed(2)} ${activeToken.symbol} @ ${formatQuoteCurrency(res.order.executedPriceUsd, profile.quoteCurrency, fxRates)}`,
      });
    } else {
      setStatusMsg({ ok: false, text: res.error || 'Simulated order failed.' });
    }
  };

  const handlePrepareLiveQuote = async () => {
    if (!activeToken) return;
    setPreparingLive(true);
    setLivePreview(null);
    try {
      const res = await fetch('/api/trade/prepare-swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: activeToken.mint,
          amountLamports: '100000000', // 0.1 SOL quote preview
          slippageBps: Number(slippageBps) || 100,
        }),
      });
      const data = await res.json();
      setLivePreview(data);
      await logAudit('LIVE_QUOTE_PREVIEWED', `Prepared 0.1 SOL -> ${activeToken.symbol} Jupiter quote preview`);
    } catch (err: any) {
      setLivePreview({ available: false, error: err?.message || 'Quote request failed.' });
    } finally {
      setPreparingLive(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">
            Paper Trading &amp; Portfolio Terminal
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Default Mode: Paper Simulation (never submits real on-chain transactions). Maintain separate simulated and connected-wallet portfolios.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#0D1322] p-1 text-xs">
          <button
            type="button"
            onClick={() => setTab('paper')}
            className={`rounded px-3 py-1.5 font-medium ${
              tab === 'paper' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Paper Portfolio
          </button>
          <button
            type="button"
            onClick={() => setTab('wallet')}
            className={`rounded px-3 py-1.5 font-medium ${
              tab === 'wallet' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Connected Wallet
          </button>
          <button
            type="button"
            onClick={() => setTab('live_guard')}
            className={`rounded px-3 py-1.5 font-medium ${
              tab === 'live_guard' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Live Execution Guard
          </button>
        </div>
      </div>

      {tab === 'paper' && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
              <div className="text-xs text-slate-400">Total Portfolio NAV</div>
              <div className="mt-1 font-mono text-xl font-semibold text-white tabular-nums">
                {formatQuoteCurrency(totalNavUsd, profile.quoteCurrency, fxRates)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
              <div className="text-xs text-slate-400">Available Virtual Cash</div>
              <div className="mt-1 font-mono text-xl font-semibold text-white tabular-nums">
                {formatQuoteCurrency(profile.paperBalanceUsd, profile.quoteCurrency, fxRates)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
              <div className="text-xs text-slate-400">Invested Open Value</div>
              <div className="mt-1 font-mono text-xl font-semibold text-white tabular-nums">
                {formatQuoteCurrency(openMarketValueUsd, profile.quoteCurrency, fxRates)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
              <div className="text-xs text-slate-400">Unrealized P&amp;L</div>
              <div
                className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
                  unrealizedPnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {unrealizedPnlUsd >= 0 ? '+' : ''}
                {formatQuoteCurrency(unrealizedPnlUsd, profile.quoteCurrency, fxRates)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
              <div className="text-xs text-slate-400">Realized P&amp;L</div>
              <div
                className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
                  profile.realizedPnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {profile.realizedPnlUsd >= 0 ? '+' : ''}
                {formatQuoteCurrency(profile.realizedPnlUsd, profile.quoteCurrency, fxRates)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Simulated Order Ticket */}
            <form
              onSubmit={handlePaperTrade}
              className="space-y-4 rounded-xl border border-slate-800 bg-[#0D1322] p-5 lg:col-span-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Simulated Order Desk</h2>
                <button
                  type="button"
                  onClick={resetPaperAccount}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                >
                  <RefreshCw className="h-3 w-3" /> Reset $10K
                </button>
              </div>

              <div>
                <label htmlFor="pt-token" className="block text-xs text-slate-300">
                  Market Pair
                </label>
                <select
                  id="pt-token"
                  value={activeToken?.mint || ''}
                  onChange={(e) => setSelectedMint(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-white"
                >
                  {tokens.map((t) => (
                    <option key={t.mint} value={t.mint}>
                      {t.symbol} ({formatQuoteCurrency(t.priceUsd, profile.quoteCurrency, fxRates)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-[#070B14] p-1">
                <button
                  type="button"
                  onClick={() => setSide('BUY')}
                  className={`rounded py-1.5 text-xs font-semibold ${
                    side === 'BUY' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                  }`}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SELL')}
                  className={`rounded py-1.5 text-xs font-semibold ${
                    side === 'SELL' ? 'bg-rose-600 text-white' : 'text-slate-400'
                  }`}
                >
                  SELL
                </button>
              </div>

              <div>
                <label htmlFor="pt-amount" className="block text-xs text-slate-300">
                  {side === 'BUY'
                    ? 'Order Amount (USD)'
                    : `Sell Token Quantity (${activeToken?.symbol || 'Token'})`}
                </label>
                <input
                  id="pt-amount"
                  type="number"
                  step="any"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
                />
              </div>

              <div>
                <label htmlFor="pt-slip" className="block text-xs text-slate-300">
                  Slippage Tolerance (bps)
                </label>
                <input
                  id="pt-slip"
                  type="number"
                  value={slippageBps}
                  onChange={(e) => setSlippageBps(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
                />
              </div>

              <button
                type="submit"
                disabled={!activeToken}
                className={`w-full rounded-lg px-4 py-2.5 text-xs font-semibold text-white ${
                  side === 'BUY'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                Place Simulated {side}
              </button>

              {statusMsg && (
                <div
                  className={`rounded-lg border p-2.5 text-xs ${
                    statusMsg.ok
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                  }`}
                >
                  {statusMsg.text}
                </div>
              )}
            </form>

            {/* Open Positions & Trade History */}
            <div className="space-y-6 lg:col-span-8">
              <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
                <h2 className="mb-3 text-sm font-semibold text-white">
                  Open Paper Positions ({positions.length})
                </h2>
                {positions.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No open paper positions. Execute a simulated buy order to open your first position.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="pb-2 font-medium">Token</th>
                          <th className="pb-2 text-right font-medium">Qty</th>
                          <th className="pb-2 text-right font-medium">Entry Avg</th>
                          <th className="pb-2 text-right font-medium">Mark Price</th>
                          <th className="pb-2 text-right font-medium">Unrealized P&amp;L</th>
                          <th className="pb-2 text-right font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 font-mono">
                        {positions.map((pos) => {
                          const liveTok = tokenMap.get(pos.mint);
                          const markPx = liveTok?.priceUsd ?? pos.avgEntryPriceUsd;
                          const value = pos.quantity * markPx;
                          const uPnl = value - pos.totalCostUsd;
                          return (
                            <tr key={pos.mint}>
                              <td className="py-2.5">
                                <button
                                  type="button"
                                  onClick={() => onSelectToken(pos.mint)}
                                  className="font-sans font-semibold text-white hover:text-blue-400"
                                >
                                  {pos.symbol}
                                </button>
                              </td>
                              <td className="py-2.5 text-right tabular-nums text-slate-200">
                                {pos.quantity.toFixed(2)}
                              </td>
                              <td className="py-2.5 text-right tabular-nums text-slate-300">
                                {formatQuoteCurrency(pos.avgEntryPriceUsd, profile.quoteCurrency, fxRates)}
                              </td>
                              <td className="py-2.5 text-right tabular-nums text-slate-200">
                                {formatQuoteCurrency(markPx, profile.quoteCurrency, fxRates)}
                              </td>
                              <td
                                className={`py-2.5 text-right tabular-nums ${
                                  uPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {uPnl >= 0 ? '+' : ''}
                                {formatQuoteCurrency(uPnl, profile.quoteCurrency, fxRates)}
                              </td>
                              <td className="py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    executePaperOrder({
                                      token: liveTok || {
                                        mint: pos.mint,
                                        pairAddress: pos.mint,
                                        symbol: pos.symbol,
                                        name: pos.name,
                                        dexId: 'solana',
                                        source: 'Position Mark',
                                        url: '',
                                        priceUsd: markPx,
                                        priceNative: 0,
                                        marketCapUsd: 0,
                                        fdvUsd: 0,
                                        liquidityUsd: 0,
                                        volume5mUsd: 0,
                                        volume1hUsd: 0,
                                        volume6hUsd: 0,
                                        volume24hUsd: 0,
                                        priceChange5m: 0,
                                        priceChange1h: 0,
                                        priceChange6h: 0,
                                        priceChange24h: 0,
                                        buys5m: 0,
                                        sells5m: 0,
                                        buys1h: 0,
                                        sells1h: 0,
                                        buys24h: 0,
                                        sells24h: 0,
                                        pairCreatedAt: null,
                                        bondingCurveProgressPct: null,
                                        migrationStatus: 'UNKNOWN',
                                        isPumpFun: false,
                                        holdersCount: null,
                                        creatorAddress: null,
                                        lastUpdatedUtc: new Date().toISOString(),
                                        freshness: 'DELAYED',
                                      },
                                      side: 'SELL',
                                      usdOrQtyAmount: pos.quantity,
                                      slippageBps: 100,
                                    })
                                  }
                                  className="rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 font-sans text-[11px] font-medium text-rose-300 hover:bg-rose-500/20"
                                >
                                  Close 100%
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
                <h2 className="mb-3 text-sm font-semibold text-white">
                  Simulated Trade History ({orders.length})
                </h2>
                {orders.length === 0 ? (
                  <p className="text-xs text-slate-400">No simulated paper orders executed yet.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="pb-2 font-medium">Time</th>
                          <th className="pb-2 font-medium">Side</th>
                          <th className="pb-2 font-medium">Token</th>
                          <th className="pb-2 text-right font-medium">Exec Price</th>
                          <th className="pb-2 text-right font-medium">Notional</th>
                          <th className="pb-2 text-right font-medium">Fee</th>
                          <th className="pb-2 text-right font-medium">Realized P&amp;L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 font-mono">
                        {orders.map((o) => (
                          <tr key={o.id}>
                            <td className="py-2 text-slate-400">
                              {formatUtcOrLocalTimestamp(o.executedAt, profile.timezone)}
                            </td>
                            <td
                              className={`py-2 font-semibold ${
                                o.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {o.side}
                            </td>
                            <td className="py-2 text-white">{o.symbol}</td>
                            <td className="py-2 text-right tabular-nums text-slate-200">
                              {formatQuoteCurrency(o.executedPriceUsd, profile.quoteCurrency, fxRates)}
                            </td>
                            <td className="py-2 text-right tabular-nums text-slate-200">
                              {formatQuoteCurrency(o.notionalUsd, profile.quoteCurrency, fxRates)}
                            </td>
                            <td className="py-2 text-right tabular-nums text-slate-400">
                              {formatQuoteCurrency(o.feeUsd, profile.quoteCurrency, fxRates)}
                            </td>
                            <td
                              className={`py-2 text-right tabular-nums ${
                                (o.realizedPnlUsd ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {o.realizedPnlUsd !== undefined
                                ? `${o.realizedPnlUsd >= 0 ? '+' : ''}${formatQuoteCurrency(
                                    o.realizedPnlUsd,
                                    profile.quoteCurrency,
                                    fxRates
                                  )}`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'wallet' && (
        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-6">
          {!connectedWallet ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Wallet className="h-8 w-8 text-blue-400" />
              <h2 className="mt-3 text-base font-semibold text-white">No Solana Wallet Connected</h2>
              <p className="mt-1 max-w-md text-xs text-slate-400">
                Connect Phantom, Solflare, or link a public Solana address in Read-Only mode to inspect real on-chain holdings separately from your paper portfolio.
              </p>
              <button
                type="button"
                onClick={onOpenWalletModal}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
              >
                Connect Solana Wallet
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
                <div>
                  <div className="text-xs text-slate-400">
                    {connectedWallet.provider} · {connectedWallet.network}
                  </div>
                  <div className="mt-1 font-mono text-sm text-white">
                    {connectedWallet.publicAddress}
                  </div>
                </div>
                <div className="font-mono text-lg font-semibold text-white">
                  {walletProfile?.solBalance !== null && walletProfile?.solBalance !== undefined
                    ? `${walletProfile.solBalance} SOL`
                    : 'RPC Loading...'}
                </div>
              </div>
              <div className="text-xs font-semibold text-slate-300">
                SPL Token Holdings ({walletProfile?.holdings.length || 0})
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {walletProfile?.holdings.map((h) => (
                  <div
                    key={h.mint}
                    className="rounded-lg border border-slate-800 bg-[#070B14] p-3 font-mono text-xs"
                  >
                    <div className="truncate text-slate-400">{h.mint}</div>
                    <div className="mt-1 text-sm font-semibold text-white tabular-nums">
                      {h.amountUi.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'live_guard' && (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0D1322] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                <Lock className="h-4 w-4 text-amber-400" />
                Guarded Live Transaction Preparation (Disabled by Default)
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Autonomous buying or selling is permanently blocked. Every live swap requires route preview, fee verification, and explicit wallet signature approval.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={profile.liveTradingEnabled}
                onChange={(e) => updatePreferences({ liveTradingEnabled: e.target.checked })}
                className="h-4 w-4 accent-blue-600"
              />
              <span>Unlock Manual Route Preview</span>
            </label>
          </div>

          {!profile.liveTradingEnabled ? (
            <div className="rounded-lg border border-slate-800 bg-[#070B14] p-4 text-xs text-slate-400">
              Live execution module is currently LOCKED (safe default). Paper Trading remains active.
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-slate-800 bg-[#070B14] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-300">
                  Target Token: <span className="font-semibold text-white">{activeToken?.symbol}</span> (
                  <span className="font-mono">{activeToken?.mint}</span>)
                </div>
                <button
                  type="button"
                  onClick={handlePrepareLiveQuote}
                  disabled={preparingLive || !activeToken}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {preparingLive ? 'Fetching Jupiter Quote...' : 'Prepare Jupiter Swap Preview (0.1 SOL)'}
                </button>
              </div>

              {livePreview && (
                <div className="rounded border border-slate-800 bg-[#0D1322] p-4 text-xs space-y-2">
                  {livePreview.available ? (
                    <>
                      <div className="font-semibold text-emerald-400">
                        Jupiter Route Ready · Requires Human Wallet Signature
                      </div>
                      <div className="grid grid-cols-2 gap-2 font-mono sm:grid-cols-4">
                        <div>
                          <span className="text-slate-400">Out Units:</span>{' '}
                          <span className="text-white">{livePreview.outAmount}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Price Impact:</span>{' '}
                          <span className="text-white">
                            {((livePreview.priceImpactPct ?? 0) * 100).toFixed(3)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Priority Fee:</span>{' '}
                          <span className="text-white">{livePreview.estimatedPriorityFeeSol} SOL</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Route:</span>{' '}
                          <span className="text-white">
                            {livePreview.routeLabels?.join(' -> ') || 'Direct'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-2 text-amber-300">
                        <ShieldAlert className="h-4 w-4 shrink-0" />
                        <span>
                          Transaction broadcast requires an active Phantom/Solflare wallet signature in your browser extension and Mainnet SOL balance.
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-rose-300">{livePreview.error}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
