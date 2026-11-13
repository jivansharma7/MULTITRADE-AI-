import React, { useMemo, useState } from 'react';
import { ArrowRight, Bookmark, Plus, Star, Trash2, Wallet } from 'lucide-react';
import { formatQuoteCurrency, formatUtcOrLocalTimestamp } from '../shared/currency';
import type { TokenMarketData } from '../shared/types';
import { useAuth, type WatchlistEntry } from '../contexts/AuthContext';

interface WatchlistViewProps {
  tokens: TokenMarketData[];
  onSelectToken: (mint: string) => void;
  onInspectWallet: (address: string) => void;
  onNavigate: (tab: string) => void;
}

function isValidSolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

function entryToFallbackToken(entry: WatchlistEntry): TokenMarketData {
  return {
    mint: entry.mint,
    pairAddress: '',
    symbol: entry.symbol,
    name: entry.name,
    dexId: 'solana',
    source: 'Watchlist',
    url: '',
    priceUsd: entry.addedPriceUsd || 0,
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
    lastUpdatedUtc: entry.addedAt,
    freshness: 'HISTORICAL',
  };
}

export const WatchlistView: React.FC<WatchlistViewProps> = ({
  tokens,
  onSelectToken,
  onInspectWallet,
  onNavigate,
}) => {
  const {
    profile,
    fxRates,
    watchlist,
    walletWatchlist,
    toggleWatchlist,
    saveWatchedWallet,
    removeWatchedWallet,
  } = useAuth();

  const [newWalletAddr, setNewWalletAddr] = useState('');
  const [newWalletLabel, setNewWalletLabel] = useState('');
  const [walletError, setWalletError] = useState<string | null>(null);

  const enrichedTokens = useMemo(() => {
    const map = new Map(tokens.map((t) => [t.mint, t]));
    return watchlist.map((item) => ({
      item,
      live: map.get(item.mint) || null,
    }));
  }, [watchlist, tokens]);

  const handleSaveWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setWalletError(null);
    const clean = newWalletAddr.trim();
    if (!isValidSolanaAddress(clean)) {
      setWalletError('Enter a valid base58 Solana public wallet address.');
      return;
    }
    await saveWatchedWallet({
      address: clean,
      label: newWalletLabel.trim() || 'Watched Wallet',
    });
    setNewWalletAddr('');
    setNewWalletLabel('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white flex items-center gap-2.5">
            <Star className="h-6 w-6 text-amber-400" />
            Watchlist — Saved Tokens &amp; Public Wallets
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Free local watchlist with automatic cloud sync when signed in. Track favorite Pump.fun tokens and public Solana wallets.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('scanner')}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1322] px-3 py-2 text-xs font-medium text-slate-200 hover:border-blue-500/60"
        >
          <span>Browse Market Scanner</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Saved Tokens Section */}
      <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Watched Tokens ({watchlist.length})
          </h2>
        </div>

        {enrichedTokens.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-[#070B14] p-6 text-center text-xs text-slate-400">
            No saved tokens yet. Click the star icon on any token in Dashboard, Trending, New Tokens, or Token Analytics to track it here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-2.5 pr-4 font-medium">Token</th>
                  <th className="py-2.5 px-3 text-right font-medium">Live Price</th>
                  <th className="py-2.5 px-3 text-right font-medium">24h %</th>
                  <th className="py-2.5 px-3 text-right font-medium">Liquidity</th>
                  <th className="py-2.5 px-3 text-right font-medium">Market Cap</th>
                  <th className="py-2.5 px-3 text-right font-medium">24h Volume</th>
                  <th className="py-2.5 pl-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {enrichedTokens.map(({ item, live }) => (
                  <tr key={item.mint} className="hover:bg-slate-800/30">
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        onClick={() => onSelectToken(item.mint)}
                        className="flex items-center gap-2.5 text-left group"
                      >
                        {live?.imageUrl ? (
                          <img
                            src={live.imageUrl}
                            alt={item.symbol}
                            referrerPolicy="no-referrer"
                            className="h-7 w-7 rounded-full border border-slate-700 object-cover"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-900 font-mono text-[10px] text-slate-300">
                            {item.symbol.slice(0, 2)}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-white group-hover:text-blue-400">
                            {item.symbol}
                          </div>
                          <div className="text-[11px] text-slate-400">{item.name}</div>
                        </div>
                      </button>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-white tabular-nums">
                      {live
                        ? formatQuoteCurrency(live.priceUsd, profile.quoteCurrency, fxRates)
                        : 'Open token to fetch'}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono tabular-nums ${
                        live
                          ? live.priceChange24h >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {live
                        ? `${live.priceChange24h >= 0 ? '+' : ''}${live.priceChange24h.toFixed(2)}%`
                        : '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300 tabular-nums">
                      {live
                        ? formatQuoteCurrency(live.liquidityUsd, profile.quoteCurrency, fxRates)
                        : '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300 tabular-nums">
                      {live && live.marketCapUsd > 0
                        ? formatQuoteCurrency(live.marketCapUsd, profile.quoteCurrency, fxRates)
                        : '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300 tabular-nums">
                      {live
                        ? formatQuoteCurrency(live.volume24hUsd, profile.quoteCurrency, fxRates)
                        : '—'}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectToken(item.mint)}
                          className="rounded border border-slate-700 bg-[#070B14] px-2.5 py-1 text-[11px] text-slate-200 hover:border-blue-500/60"
                        >
                          Analytics
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleWatchlist(live || entryToFallbackToken(item))}
                          aria-label={`Remove ${item.symbol} from watchlist`}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Saved Public Solana Wallets */}
      <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Bookmark className="h-4 w-4 text-blue-400" />
            Saved Public Solana Wallets ({walletWatchlist.length})
          </h2>
        </div>

        <form onSubmit={handleSaveWallet} className="grid grid-cols-1 gap-2.5 md:grid-cols-12">
          <input
            type="text"
            value={newWalletAddr}
            onChange={(e) => setNewWalletAddr(e.target.value)}
            placeholder="Public Solana wallet address (base58)"
            className="rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none md:col-span-6"
          />
          <input
            type="text"
            value={newWalletLabel}
            onChange={(e) => setNewWalletLabel(e.target.value)}
            placeholder="Optional label (e.g., Main Treasury, Smart Whale)"
            className="rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none md:col-span-4"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 md:col-span-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Save Wallet
          </button>
        </form>

        {walletError && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-300">
            {walletError}
          </div>
        )}

        {walletWatchlist.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-[#070B14] p-5 text-center text-xs text-slate-400">
            No public Solana wallets saved yet. Add a wallet above or from the Wallet &amp; Portfolio page.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {walletWatchlist.map((w) => (
              <div
                key={w.address}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#070B14] p-3.5 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-white">{w.label}</div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
                    {w.address}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-slate-500">
                    Saved {formatUtcOrLocalTimestamp(w.addedAt, profile.timezone)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onInspectWallet(w.address)}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-[#0D1322] px-2.5 py-1.5 text-[11px] font-medium text-blue-300 hover:border-blue-500/60"
                  >
                    <Wallet className="h-3 w-3" />
                    Portfolio
                  </button>
                  <button
                    type="button"
                    onClick={() => removeWatchedWallet(w.address)}
                    aria-label={`Remove wallet ${w.label}`}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
