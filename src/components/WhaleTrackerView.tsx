import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Search, Wallet, Waves } from 'lucide-react';
import { formatQuoteCurrency, formatUtcOrLocalTimestamp } from '../shared/currency';
import type { WhaleTransactionItem } from '../shared/types';
import { useAuth } from '../contexts/AuthContext';

interface WhaleTrackerViewProps {
  onSelectToken: (mint: string) => void;
  onInspectWallet: (address: string) => void;
}

export const WhaleTrackerView: React.FC<WhaleTrackerViewProps> = ({
  onSelectToken,
  onInspectWallet,
}) => {
  const { profile, fxRates } = useAuth();
  const [items, setItems] = useState<WhaleTransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minUsd, setMinUsd] = useState<number>(250);
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [search, setSearch] = useState('');
  const [fetchedAt, setFetchedAt] = useState<string>('');

  const loadFeed = async (threshold: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/whales/feed?minUsd=${threshold}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setFetchedAt(data.lastUpdatedUtc || new Date().toISOString());
    } catch (err: any) {
      setError(err?.message || 'Unable to load live whale activity feed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed(minUsd);
  }, [minUsd]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (sideFilter !== 'ALL' && item.type !== sideFilter) return false;
      if (!q) return true;
      return (
        (item.symbol || '').toLowerCase().includes(q) ||
        (item.tokenName || '').toLowerCase().includes(q) ||
        item.mint.toLowerCase().includes(q) ||
        (item.walletAddress || '').toLowerCase().includes(q) ||
        item.signature.toLowerCase().includes(q)
      );
    });
  }, [items, sideFilter, search]);

  const stats = useMemo(() => {
    const buys = filtered.filter((w) => w.type === 'BUY');
    const sells = filtered.filter((w) => w.type === 'SELL');
    const buyVol = buys.reduce((s, w) => s + (w.usdValue || 0), 0);
    const sellVol = sells.reduce((s, w) => s + (w.usdValue || 0), 0);
    const largest = filtered.reduce((max, w) => ((w.usdValue || 0) > max ? (w.usdValue || 0) : max), 0);
    const uniqueWallets = new Set(
      filtered.map((w) => w.walletAddress).filter((addr): addr is string => Boolean(addr))
    ).size;
    return {
      buyCount: buys.length,
      sellCount: sells.length,
      buyVol,
      sellVol,
      largest,
      uniqueWallets,
    };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white flex items-center gap-2.5">
            <Waves className="h-6 w-6 text-blue-400" />
            Whale Activity &amp; Large Order Tracker
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Live large swaps parsed directly from Solana RPC and Helius transaction history across active Pump.fun &amp; Solana markets.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {fetchedAt && (
            <span className="font-mono text-[11px] text-slate-500">
              Updated {formatUtcOrLocalTimestamp(fetchedAt, profile.timezone)}
            </span>
          )}
          <button
            type="button"
            onClick={() => loadFeed(minUsd)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1322] px-3 py-2 text-xs font-medium text-slate-200 hover:border-blue-500/60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Feed
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Matched Whale Swaps</div>
          <div className="mt-1.5 font-mono text-xl font-semibold text-white tabular-nums">
            {filtered.length}
          </div>
          <div className="mt-1 font-mono text-[11px] text-slate-400">
            <span className="text-emerald-400">{stats.buyCount} buys</span> ·{' '}
            <span className="text-rose-400">{stats.sellCount} sells</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Whale Flow Balance</div>
          <div className="mt-1.5 font-mono text-xl font-semibold text-white tabular-nums">
            {formatQuoteCurrency(stats.buyVol - stats.sellVol, profile.quoteCurrency, fxRates)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Net buy vs sell USD flow
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Largest Single Swap</div>
          <div className="mt-1.5 font-mono text-xl font-semibold text-blue-400 tabular-nums">
            {stats.largest > 0
              ? formatQuoteCurrency(stats.largest, profile.quoteCurrency, fxRates)
              : 'Data unavailable'}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Observed in current window</div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Active Whale Wallets</div>
          <div className="mt-1.5 font-mono text-xl font-semibold text-white tabular-nums">
            {stats.uniqueWallets}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Click any wallet to inspect holdings</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0D1322] p-3.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by token symbol, mint, wallet address, or signature..."
            className="w-full rounded-lg border border-slate-700 bg-[#070B14] py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#070B14] p-1 text-xs">
            {(['ALL', 'BUY', 'SELL'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setSideFilter(side)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium ${
                  sideFilter === side ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {side}
              </button>
            ))}
          </div>

          <select
            aria-label="Minimum whale swap size"
            value={minUsd}
            onChange={(e) => setMinUsd(Number(e.target.value))}
            className="rounded-lg border border-slate-700 bg-[#070B14] px-3 py-1.5 font-mono text-xs text-slate-200"
          >
            <option value={250}>Min $250</option>
            <option value={1000}>Min $1,000</option>
            <option value={5000}>Min $5,000</option>
            <option value={10000}>Min $10,000</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Whale Feed Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0D1322]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 bg-[#0A0F1C] text-[11px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Token</th>
              <th className="px-4 py-3 font-medium">Side</th>
              <th className="px-4 py-3 text-right font-medium">Swap Value</th>
              <th className="px-4 py-3 text-right font-medium">SOL / Token Size</th>
              <th className="px-4 py-3 font-medium">Wallet Address</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 text-right font-medium">Time</th>
              <th className="px-4 py-3 text-right font-medium">TX</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  Scanning on-chain Solana whale transactions...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  No whale swaps matched the current filters. Try lowering the minimum USD threshold or clicking Refresh Feed.
                </td>
              </tr>
            ) : (
              filtered.map((w) => (
                <tr key={w.signature} className="transition-colors hover:bg-slate-800/35">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onSelectToken(w.mint)}
                      className="text-left group"
                    >
                      <div className="font-semibold text-white group-hover:text-blue-400">
                        {w.symbol || 'SPL'}
                      </div>
                      <div className="font-mono text-[10px] text-slate-500">
                        {w.mint.slice(0, 6)}..{w.mint.slice(-4)}
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${
                        w.type === 'BUY'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : w.type === 'SELL'
                          ? 'bg-rose-500/15 text-rose-400'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {w.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-white tabular-nums">
                    {w.usdValue !== null
                      ? formatQuoteCurrency(w.usdValue, profile.quoteCurrency, fxRates)
                      : 'Data unavailable'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-300 tabular-nums">
                    {w.tokenAmount !== null && w.tokenAmount > 0
                      ? `${w.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${w.symbol || ''}`
                      : w.solAmount !== null
                      ? `${w.solAmount.toFixed(3)} SOL`
                      : 'Data unavailable'}
                  </td>
                  <td className="px-4 py-3">
                    {w.walletAddress ? (
                      <button
                        type="button"
                        onClick={() => onInspectWallet(w.walletAddress!)}
                        className="inline-flex items-center gap-1.5 font-mono text-[11px] text-blue-400 hover:text-blue-300"
                      >
                        <Wallet className="h-3 w-3" />
                        <span>
                          {w.walletAddress.slice(0, 6)}..{w.walletAddress.slice(-6)}
                        </span>
                      </button>
                    ) : (
                      <span className="text-slate-500">Data unavailable</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{w.source}</td>
                  <td className="px-4 py-3 text-right font-mono text-[11px] text-slate-400 whitespace-nowrap">
                    {w.blockTime
                      ? formatUtcOrLocalTimestamp(new Date(w.blockTime * 1000).toISOString(), profile.timezone)
                      : 'Pending'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={w.solscanUrl || `https://solscan.io/tx/${w.signature}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Inspect transaction ${w.signature} on Solscan`}
                      className="inline-flex items-center gap-1 text-slate-400 hover:text-white"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
