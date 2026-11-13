import React, { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  ExternalLink,
  Info,
  Search,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react';
import { formatQuoteCurrency, formatUtcOrLocalTimestamp } from '../shared/currency';
import { computeWalletPortfolioSummary } from '../shared/marketAnalytics';
import type { TokenMarketData, WalletIntelligenceProfile } from '../shared/types';
import { useAuth } from '../contexts/AuthContext';
import { PortfolioAllocationChart } from './charts/AnalyticsCharts';

interface WalletIntelViewProps {
  initialAddress?: string;
  tokens: TokenMarketData[];
  onSelectToken?: (mint: string) => void;
}

export const WalletIntelView: React.FC<WalletIntelViewProps> = ({
  initialAddress = '',
  tokens,
  onSelectToken,
}) => {
  const {
    profile,
    fxRates,
    walletWatchlist,
    saveWatchedWallet,
    removeWatchedWallet,
    isWalletWatched,
  } = useAuth();

  const [address, setAddress] = useState(
    initialAddress || 'vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg'
  );
  const [walletLabel, setWalletLabel] = useState('');
  const [walletData, setWalletData] = useState<WalletIntelligenceProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inspectAddress = async (addr: string) => {
    const clean = addr.trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/wallets/${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Wallet lookup failed');
      setWalletData(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to inspect Solana wallet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialAddress) {
      setAddress(initialAddress);
      inspectAddress(initialAddress);
    } else {
      inspectAddress(address);
    }
  }, [initialAddress]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    inspectAddress(address);
  };

  const handleSaveWallet = async () => {
    if (!walletData) return;
    await saveWatchedWallet({
      address: walletData.address,
      label:
        walletLabel.trim() ||
        `Wallet ${walletData.address.slice(0, 4)}..${walletData.address.slice(-4)}`,
    });
    setWalletLabel('');
  };

  const portfolioSummary = useMemo(
    () => (walletData ? computeWalletPortfolioSummary(walletData) : null),
    [walletData]
  );

  const creatorQuickLinks = tokens.filter((t) => Boolean(t.creatorAddress)).slice(0, 4);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-white">
          Solana Wallet Tracker &amp; Portfolio Dashboard
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Enter any public Solana wallet address to inspect live SOL balance, priced SPL token holdings, USD allocation, recent swaps/transfers, and honest P&amp;L provenance — 100% read-only, no wallet connection or private keys needed.
        </p>
      </div>

      {/* Public Wallet Lookup Bar */}
      <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4 space-y-3">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              aria-label="Enter Solana Wallet Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter Solana Wallet Address (e.g. vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg)..."
              className="w-full rounded-lg border border-slate-700 bg-[#070B14] py-2 pl-9 pr-3 font-mono text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? 'Loading On-Chain Portfolio...' : 'View Portfolio'}
          </button>
        </form>

        {/* Save / Quick Switch Saved Wallets */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/70 pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400">Saved Public Wallets:</span>
            {walletWatchlist.length === 0 ? (
              <span className="text-slate-500">None saved yet</span>
            ) : (
              walletWatchlist.map((w) => (
                <div
                  key={w.address}
                  className="inline-flex items-center gap-1 rounded border border-slate-800 bg-[#070B14] px-2 py-1"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setAddress(w.address);
                      inspectAddress(w.address);
                    }}
                    className="font-mono text-[11px] text-blue-300 hover:text-white"
                  >
                    {w.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeWatchedWallet(w.address)}
                    aria-label={`Remove ${w.label}`}
                    className="text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          {walletData && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={walletLabel}
                onChange={(e) => setWalletLabel(e.target.value)}
                placeholder="Label (e.g. Main Wallet)"
                className="w-40 rounded border border-slate-700 bg-[#070B14] px-2.5 py-1 text-xs text-white placeholder-slate-500"
              />
              <button
                type="button"
                onClick={handleSaveWallet}
                className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#070B14] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-blue-500/60"
              >
                <Bookmark className="h-3 w-3 text-amber-400" />
                {isWalletWatched(walletData.address) ? 'Update Label' : 'Save Wallet'}
              </button>
            </div>
          )}
        </div>
      </div>

      {creatorQuickLinks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span>Active Token Creators:</span>
          {creatorQuickLinks.map((t) => (
            <button
              key={t.mint}
              type="button"
              onClick={() => {
                setAddress(t.creatorAddress!);
                inspectAddress(t.creatorAddress!);
              }}
              className="rounded border border-slate-800 bg-[#0D1322] px-2.5 py-1 font-mono text-[11px] text-blue-300 hover:border-blue-500/60"
            >
              {t.symbol} Creator
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-300">
          {error}
        </div>
      )}

      {walletData && portfolioSummary && (
        <div className="space-y-6">
          {/* Portfolio Overview KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
              <div className="text-xs text-slate-400">Total Portfolio Value</div>
              <div className="mt-1 font-mono text-xl font-bold text-white tabular-nums">
                {portfolioSummary.totalPortfolioUsd !== null
                  ? formatQuoteCurrency(
                      portfolioSummary.totalPortfolioUsd,
                      profile.quoteCurrency,
                      fxRates
                    )
                  : 'Data unavailable'}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                SOL + {portfolioSummary.pricedHoldingsCount} priced tokens
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
              <div className="text-xs text-slate-400">SOL Balance</div>
              <div className="mt-1 font-mono text-xl font-semibold text-white tabular-nums">
                {walletData.solBalance !== null ? `${walletData.solBalance} SOL` : 'Data unavailable'}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                {walletData.solValueUsd !== null
                  ? formatQuoteCurrency(walletData.solValueUsd, profile.quoteCurrency, fxRates)
                  : 'USD quote unavailable'}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
              <div className="text-xs text-slate-400">SPL Token Holdings</div>
              <div className="mt-1 font-mono text-xl font-semibold text-white tabular-nums">
                {walletData.holdings.length}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                {formatQuoteCurrency(
                  portfolioSummary.tokensValueUsd,
                  profile.quoteCurrency,
                  fxRates
                )}{' '}
                priced
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
              <div className="text-xs text-slate-400">Best 24h Holding</div>
              <div className="mt-1 font-mono text-sm font-semibold text-emerald-400">
                {portfolioSummary.topPerformer
                  ? `${portfolioSummary.topPerformer.symbol} (${
                      (portfolioSummary.topPerformer.priceChange24h || 0) >= 0 ? '+' : ''
                    }${portfolioSummary.topPerformer.priceChange24h?.toFixed(1)}%)`
                  : 'Data unavailable'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Worst:{' '}
                {portfolioSummary.worstPerformer
                  ? `${portfolioSummary.worstPerformer.symbol} (${portfolioSummary.worstPerformer.priceChange24h?.toFixed(
                      1
                    )}%)`
                  : '—'}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
              <div className="text-xs text-slate-400">Historical P&amp;L Status</div>
              <div className="mt-1 font-mono text-sm font-semibold text-amber-300">
                {walletData.estimatedRealizedPnlUsd !== null
                  ? formatQuoteCurrency(
                      walletData.estimatedRealizedPnlUsd,
                      profile.quoteCurrency,
                      fxRates
                    )
                  : 'Incomplete cost basis'}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                Synced {formatUtcOrLocalTimestamp(walletData.lastUpdatedUtc, profile.timezone)}
              </div>
            </div>
          </div>

          {/* Honest P&L & Classification Provenance Banner */}
          <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4 text-xs">
            <div className="flex items-start gap-2.5 text-slate-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
              <div className="space-y-1">
                <div className="font-semibold text-white">
                  Cost-Basis &amp; On-Chain Provenance Notice ({walletData.classification})
                </div>
                <p className="text-slate-400">{walletData.pnlLimitationNote}</p>
                <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-slate-400">
                  {walletData.classificationEvidence.map((ev, i) => (
                    <span key={i}>· {ev}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Allocation Pie Chart + Priced Token Holdings */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 lg:col-span-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-blue-400" />
                Portfolio Allocation (USD)
              </h2>
              <PortfolioAllocationChart slices={portfolioSummary.allocationSlices} />
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 lg:col-span-7">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <Wallet className="h-4 w-4 text-indigo-400" />
                Token Balances &amp; Market Valuation ({walletData.holdings.length})
              </h2>
              {walletData.holdings.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No non-zero SPL token accounts found for this address.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 border-b border-slate-800 bg-[#0D1322] text-slate-400">
                      <tr>
                        <th className="pb-2 font-medium">Token</th>
                        <th className="pb-2 text-right font-medium">Balance</th>
                        <th className="pb-2 text-right font-medium">Price</th>
                        <th className="pb-2 text-right font-medium">24h %</th>
                        <th className="pb-2 text-right font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {walletData.holdings.map((h) => (
                        <tr key={h.mint} className="hover:bg-slate-800/30">
                          <td className="py-2 pr-2">
                            <button
                              type="button"
                              onClick={() => onSelectToken?.(h.mint)}
                              className="text-left hover:text-blue-300"
                            >
                              <div className="font-semibold text-white">{h.symbol || 'SPL'}</div>
                              <div className="font-mono text-[10px] text-slate-500">
                                {h.mint.slice(0, 6)}..{h.mint.slice(-4)}
                              </div>
                            </button>
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums text-slate-200">
                            {h.amountUi.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums text-slate-300">
                            {h.priceUsd != null
                              ? formatQuoteCurrency(h.priceUsd, profile.quoteCurrency, fxRates)
                              : 'Data unavailable'}
                          </td>
                          <td
                            className={`py-2 text-right font-mono tabular-nums ${
                              h.priceChange24h == null
                                ? 'text-slate-500'
                                : h.priceChange24h >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {h.priceChange24h != null
                              ? `${h.priceChange24h >= 0 ? '+' : ''}${h.priceChange24h.toFixed(1)}%`
                              : '—'}
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums font-medium text-white">
                            {h.valueUsd != null
                              ? formatQuoteCurrency(h.valueUsd, profile.quoteCurrency, fxRates)
                              : 'Data unavailable'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Recent Decoded Transactions & Raw Signatures */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
              <h2 className="mb-3 text-sm font-semibold text-white">
                Recent Buys, Sells &amp; Transfers ({walletData.recentTransactions.length})
              </h2>
              {walletData.recentTransactions.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No decoded SPL swap/transfer deltas in latest sampled transactions.
                </p>
              ) : (
                <div className="space-y-2">
                  {walletData.recentTransactions.map((tx) => (
                    <div
                      key={tx.signature}
                      className="flex items-center justify-between rounded border border-slate-800 bg-[#070B14] px-3 py-2 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono font-semibold ${
                              tx.type === 'BUY'
                                ? 'text-emerald-400'
                                : tx.type === 'SELL'
                                ? 'text-rose-400'
                                : 'text-slate-300'
                            }`}
                          >
                            {tx.type}
                          </span>
                          <span className="font-semibold text-white">{tx.symbol}</span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          {tx.blockTime
                            ? formatUtcOrLocalTimestamp(tx.blockTime * 1000, profile.timezone)
                            : `Slot ${tx.slot}`}
                        </div>
                      </div>
                      <div className="text-right font-mono text-[11px]">
                        <div className="text-slate-200">
                          {tx.usdValue !== null
                            ? formatQuoteCurrency(tx.usdValue, profile.quoteCurrency, fxRates)
                            : tx.solAmount !== null
                            ? `${tx.solAmount} SOL`
                            : 'Transfer'}
                        </div>
                        <a
                          href={tx.solscanUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:underline"
                        >
                          Solscan <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
              <h2 className="mb-3 text-sm font-semibold text-white">
                Recent On-Chain Signatures ({walletData.recentSignatures.length})
              </h2>
              {walletData.recentSignatures.length === 0 ? (
                <p className="text-xs text-slate-400">No recent signatures returned by RPC.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-2">
                  {walletData.recentSignatures.map((s) => (
                    <div
                      key={s.signature}
                      className="flex items-center justify-between rounded border border-slate-800 bg-[#070B14] px-3 py-2 text-xs"
                    >
                      <div>
                        <a
                          href={`https://solscan.io/tx/${s.signature}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-[11px] text-blue-400 hover:underline"
                        >
                          {s.signature.slice(0, 14)}...{s.signature.slice(-6)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <div className="text-[10px] text-slate-500">
                          Slot {s.slot.toLocaleString()} ·{' '}
                          {s.blockTime
                            ? formatUtcOrLocalTimestamp(s.blockTime * 1000, profile.timezone)
                            : 'Timestamp pending'}
                        </div>
                      </div>
                      <span
                        className={`font-mono text-[10px] font-semibold ${
                          s.err ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {s.err ? 'FAILED' : 'CONFIRMED'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
