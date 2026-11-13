import React, { useEffect, useState } from 'react';
import { RefreshCw, Search, SlidersHorizontal, Star } from 'lucide-react';
import { formatQuoteCurrency, formatUtcOrLocalTimestamp } from '../shared/currency';
import {
  getPriceChangeForTimeframe,
  type ChangeTimeframe,
  type MarketSectionFilter,
} from '../shared/marketAnalytics';
import type { DataProviderStatus, TokenMarketData } from '../shared/types';
import { useAuth } from '../contexts/AuthContext';

interface ScannerViewProps {
  onSelectToken: (mint: string) => void;
  externalSearch?: string;
  section?: MarketSectionFilter;
}

const SECTION_META: Record<string, { title: string; subtitle: string; defaultSort: string }> = {
  all: {
    title: 'Solana & Pump.fun Market Scanner',
    subtitle: 'Full multi-filter market explorer across live Pump.fun & Solana DEX pools.',
    defaultSort: 'volume24h',
  },
  new_tokens: {
    title: 'Pump.fun New Tokens',
    subtitle: 'Newly launched Pump.fun & Solana tokens sorted by creation time with creator & bonding metrics.',
    defaultSort: 'newest',
  },
  trending: {
    title: 'Trending Tokens',
    subtitle: 'Tokens with the strongest recent trading velocity, 1h volume, and active buy/sell flow.',
    defaultSort: 'trending',
  },
  graduated: {
    title: 'Graduated Tokens',
    subtitle: 'Pump.fun tokens that completed their bonding curve and migrated to PumpSwap or Raydium.',
    defaultSort: 'volume24h',
  },
  gainers: {
    title: 'Top Gainers',
    subtitle: 'Strongest positive price performers filtered across 5m, 1h, 6h, and 24h timeframes.',
    defaultSort: 'gainers',
  },
  losers: {
    title: 'Top Losers',
    subtitle: 'Sharpest negative movers across 5m, 1h, 6h, and 24h timeframes to monitor drawdowns.',
    defaultSort: 'losers',
  },
  highest_volume: {
    title: 'Highest Volume Tokens',
    subtitle: 'Most actively traded Solana & Pump.fun pairs ranked by 24h DEX volume.',
    defaultSort: 'volume24h',
  },
};

const FILTER_TABS: Array<{ id: MarketSectionFilter; label: string }> = [
  { id: 'all', label: 'All Live' },
  { id: 'new_tokens', label: 'New Tokens' },
  { id: 'trending', label: 'Trending' },
  { id: 'graduated', label: 'Graduated' },
  { id: 'gainers', label: 'Top Gainers' },
  { id: 'losers', label: 'Top Losers' },
  { id: 'highest_volume', label: 'Highest Volume' },
  { id: 'pumpfun', label: 'Pump.fun' },
  { id: 'high_risk', label: 'High Risk' },
];

export const ScannerView: React.FC<ScannerViewProps> = ({
  onSelectToken,
  externalSearch = '',
  section = 'all',
}) => {
  const { profile, fxRates, isWatched, toggleWatchlist } = useAuth();
  const [search, setSearch] = useState(externalSearch);
  const [filter, setFilter] = useState<MarketSectionFilter>(section);
  const [timeframe, setTimeframe] = useState<ChangeTimeframe>('1h');
  const [sort, setSort] = useState(SECTION_META[section]?.defaultSort || 'volume24h');
  const [page, setPage] = useState(1);

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [minMcap, setMinMcap] = useState('');
  const [maxMcap, setMaxMcap] = useState('');
  const [minLiquidity, setMinLiquidity] = useState('');
  const [minVolume, setMinVolume] = useState('');
  const [maxAgeHours, setMaxAgeHours] = useState('');
  const [graduationStatus, setGraduationStatus] = useState<'ALL' | 'BONDING' | 'GRADUATED' | 'DEX_POOL'>('ALL');
  const [riskLevel, setRiskLevel] = useState<'ALL' | 'LOW_MODERATE' | 'HIGH_RISK'>('ALL');

  const [items, setItems] = useState<TokenMarketData[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [lastUpdatedUtc, setLastUpdatedUtc] = useState<string>('');
  const [providers, setProviders] = useState<DataProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFilter(section);
    setSort(SECTION_META[section]?.defaultSort || 'volume24h');
    setPage(1);
  }, [section]);

  const loadScanner = async (overrideSearch?: string) => {
    const queryText = overrideSearch !== undefined ? overrideSearch : search;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        q: queryText,
        filter,
        timeframe,
        sort,
        page: String(page),
        pageSize: '20',
      });
      if (minMcap.trim()) qs.set('minMcap', minMcap.trim());
      if (maxMcap.trim()) qs.set('maxMcap', maxMcap.trim());
      if (minLiquidity.trim()) qs.set('minLiquidity', minLiquidity.trim());
      if (minVolume.trim()) qs.set('minVolume', minVolume.trim());
      if (maxAgeHours.trim()) qs.set('maxAgeHours', maxAgeHours.trim());
      if (graduationStatus !== 'ALL') qs.set('graduationStatus', graduationStatus);
      if (riskLevel !== 'ALL') qs.set('riskLevel', riskLevel);

      const res = await fetch(`/api/tokens/scanner?${qs.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setLastUpdatedUtc(data.lastUpdatedUtc || '');
      setProviders(data.providers || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load Pump.fun & Solana market data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScanner();
  }, [filter, sort, timeframe, page, graduationStatus, riskLevel]);

  useEffect(() => {
    if (externalSearch) {
      setSearch(externalSearch);
      setPage(1);
      loadScanner(externalSearch);
    }
  }, [externalSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadScanner();
  };

  const meta = SECTION_META[filter] || SECTION_META.all;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">{meta.title}</h1>
          <p className="mt-1 text-xs text-slate-400">
            {meta.subtitle} · Updated{' '}
            {lastUpdatedUtc ? formatUtcOrLocalTimestamp(lastUpdatedUtc, profile.timezone) : 'pending'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0D1322] px-3 py-2 text-xs font-medium text-slate-200 hover:border-blue-500/60"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </button>
          <button
            type="button"
            onClick={() => loadScanner()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1322] px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-blue-500/60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={handleSearchSubmit} className="flex flex-1 gap-2 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                aria-label="Search token name, ticker, or mint address"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search symbol, name, or Solana mint address..."
                className="w-full rounded-lg border border-slate-700 bg-[#070B14] py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 whitespace-nowrap"
            >
              Search
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#070B14] p-1">
              {(['5m', '1h', '6h', '24h'] as ChangeTimeframe[]).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => {
                    setTimeframe(tf);
                    setPage(1);
                  }}
                  className={`rounded px-2 py-1 font-mono text-[11px] ${
                    timeframe === tf ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="scanner-sort" className="text-slate-400 whitespace-nowrap">
                Sort:
              </label>
              <select
                id="scanner-sort"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="volume24h">24h Volume</option>
                <option value="trending">Trending Velocity</option>
                <option value="liquidity">Liquidity (USD)</option>
                <option value="marketCap">Market Cap</option>
                <option value="newest">Most Recent Launch</option>
                <option value="gainers">Top Gainers ({timeframe})</option>
                <option value="losers">Top Losers ({timeframe})</option>
                <option value="buys1h">1h Buy Count</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setFilter(opt.id);
                setSort(SECTION_META[opt.id]?.defaultSort || 'volume24h');
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                filter === opt.id
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-800 bg-[#070B14] text-slate-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {showFilters && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              loadScanner();
            }}
            className="grid grid-cols-2 gap-3 border-t border-slate-800 pt-4 text-xs sm:grid-cols-4 lg:grid-cols-7"
          >
            <div>
              <label className="block text-[11px] text-slate-400">Min MCap ($)</label>
              <input
                type="number"
                value={minMcap}
                onChange={(e) => setMinMcap(e.target.value)}
                placeholder="e.g. 50000"
                className="mt-1 w-full rounded border border-slate-700 bg-[#070B14] px-2.5 py-1.5 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400">Max MCap ($)</label>
              <input
                type="number"
                value={maxMcap}
                onChange={(e) => setMaxMcap(e.target.value)}
                placeholder="e.g. 5000000"
                className="mt-1 w-full rounded border border-slate-700 bg-[#070B14] px-2.5 py-1.5 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400">Min Liquidity ($)</label>
              <input
                type="number"
                value={minLiquidity}
                onChange={(e) => setMinLiquidity(e.target.value)}
                placeholder="e.g. 15000"
                className="mt-1 w-full rounded border border-slate-700 bg-[#070B14] px-2.5 py-1.5 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400">Min 24h Vol ($)</label>
              <input
                type="number"
                value={minVolume}
                onChange={(e) => setMinVolume(e.target.value)}
                placeholder="e.g. 25000"
                className="mt-1 w-full rounded border border-slate-700 bg-[#070B14] px-2.5 py-1.5 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400">Max Age (Hours)</label>
              <input
                type="number"
                value={maxAgeHours}
                onChange={(e) => setMaxAgeHours(e.target.value)}
                placeholder="e.g. 48"
                className="mt-1 w-full rounded border border-slate-700 bg-[#070B14] px-2.5 py-1.5 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400">Graduation Status</label>
              <select
                value={graduationStatus}
                onChange={(e) => setGraduationStatus(e.target.value as any)}
                className="mt-1 w-full rounded border border-slate-700 bg-[#070B14] px-2 py-1.5 text-xs text-white"
              >
                <option value="ALL">All Stages</option>
                <option value="BONDING">Bonding Curve</option>
                <option value="GRADUATED">Graduated</option>
                <option value="DEX_POOL">DEX Pool</option>
              </select>
            </div>
            <div className="flex flex-col justify-between">
              <div>
                <label className="block text-[11px] text-slate-400">Risk Profile</label>
                <select
                  value={riskLevel}
                  onChange={(e) => setRiskLevel(e.target.value as any)}
                  className="mt-1 w-full rounded border border-slate-700 bg-[#070B14] px-2 py-1.5 text-xs text-white"
                >
                  <option value="ALL">All Risk Levels</option>
                  <option value="LOW_MODERATE">Exclude High Risk</option>
                  <option value="HIGH_RISK">High Risk Only</option>
                </select>
              </div>
              <button
                type="submit"
                className="mt-2 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
              >
                Apply Filters
              </button>
            </div>
          </form>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Scanner Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0D1322]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Token / Mint</th>
              <th className="px-4 py-3 font-medium">Venue &amp; Status</th>
              <th className="px-4 py-3 text-right font-medium">Price (USD / SOL)</th>
              <th className="px-4 py-3 text-right font-medium">{timeframe} %</th>
              <th className="px-4 py-3 text-right font-medium">Market Cap</th>
              <th className="px-4 py-3 text-right font-medium">24h Vol</th>
              <th className="px-4 py-3 text-right font-medium">Liquidity</th>
              <th className="px-4 py-3 text-right font-medium">1h B / S</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {loading ? (
              Array.from({ length: 8 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td colSpan={9} className="px-4 py-4">
                    <div className="h-4 w-full rounded bg-slate-800/70" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-xs text-slate-400">
                  No live tokens matched this filter. Switch to All Live or loosen filter thresholds.
                </td>
              </tr>
            ) : (
              items.map((t) => {
                const watched = isWatched(t.mint);
                const tfChange = getPriceChangeForTimeframe(t, timeframe);
                return (
                  <tr key={t.mint} className="hover:bg-slate-800/35 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSelectToken(t.mint)}
                        className="flex items-center gap-2.5 text-left hover:text-blue-300"
                      >
                        {t.imageUrl ? (
                          <img
                            src={t.imageUrl}
                            alt={t.symbol}
                            referrerPolicy="no-referrer"
                            className="h-7 w-7 shrink-0 rounded-full object-cover bg-slate-800"
                          />
                        ) : (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600/20 font-mono text-[10px] font-bold text-blue-300">
                            {t.symbol.slice(0, 2)}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-white">{t.symbol}</div>
                          <div className="max-w-[145px] truncate text-[11px] text-slate-400">
                            {t.name}
                          </div>
                          <div className="font-mono text-[10px] text-slate-500">
                            {t.mint.slice(0, 6)}...{t.mint.slice(-4)}
                          </div>
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-300">
                      <div>{t.dexId}</div>
                      <div className="text-[10px] text-slate-500">
                        {t.migrationStatus}
                        {t.bondingCurveProgressPct !== null ? ` · ${t.bondingCurveProgressPct}%` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      <div className="text-white">
                        {t.priceUsd > 0
                          ? formatQuoteCurrency(t.priceUsd, profile.quoteCurrency, fxRates)
                          : 'Data unavailable'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {t.priceNative > 0 ? `${t.priceNative.toFixed(6)} SOL` : 'SOL unavailable'}
                      </div>
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono tabular-nums font-semibold ${
                        tfChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {tfChange >= 0 ? '+' : ''}
                      {tfChange.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                      {t.marketCapUsd > 0
                        ? formatQuoteCurrency(t.marketCapUsd, profile.quoteCurrency, fxRates, true)
                        : 'Data unavailable'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                      {t.volume24hUsd > 0
                        ? formatQuoteCurrency(t.volume24hUsd, profile.quoteCurrency, fxRates, true)
                        : 'Data unavailable'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                      {t.liquidityUsd > 0
                        ? formatQuoteCurrency(t.liquidityUsd, profile.quoteCurrency, fxRates, true)
                        : 'Data unavailable'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      <span className="text-emerald-400">{t.buys1h}</span>
                      <span className="text-slate-600"> / </span>
                      <span className="text-rose-400">{t.sells1h}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleWatchlist(t)}
                          aria-label={
                            watched
                              ? `Remove ${t.symbol} from watchlist`
                              : `Add ${t.symbol} to watchlist`
                          }
                          className={`rounded border p-1.5 ${
                            watched
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                              : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
                          }`}
                        >
                          <Star className="h-3.5 w-3.5" fill={watched ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectToken(t.mint)}
                          className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-blue-300 hover:border-blue-500/60 hover:text-white whitespace-nowrap"
                        >
                          Analytics
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Provider Attribution */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
        <div>
          Showing page {page} of {totalPages} ({total} live tokens indexed)
          {providers.length > 0 &&
            ` · Sources: ${providers
              .filter((p) => p.connected)
              .map((p) => p.name)
              .join(', ')}`}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-slate-700 bg-[#0D1322] px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-slate-700 bg-[#0D1322] px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
