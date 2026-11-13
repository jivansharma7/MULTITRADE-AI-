import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Compass,
  ExternalLink,
  Flame,
  GraduationCap,
  Layers,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  Wallet,
  Waves,
} from 'lucide-react';
import { formatQuoteCurrency, formatUtcOrLocalTimestamp } from '../shared/currency';
import { computeDashboardStats, filterAndSortTokens, isGraduatedToken } from '../shared/marketAnalytics';
import type { DataProviderStatus, TokenMarketData, WhaleTransactionItem } from '../shared/types';
import { useAuth } from '../contexts/AuthContext';
import { MarketActivityChart } from './charts/AnalyticsCharts';

interface DashboardViewProps {
  tokens: TokenMarketData[];
  solPriceUsd: number | null;
  loadingTokens: boolean;
  lastUpdatedUtc: string;
  providers: DataProviderStatus[];
  onSelectToken: (mint: string) => void;
  onInspectWallet: (address: string) => void;
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  tokens,
  solPriceUsd,
  loadingTokens,
  lastUpdatedUtc,
  providers,
  onSelectToken,
  onInspectWallet,
  onNavigate,
}) => {
  const { profile, fxRates, watchlist, walletWatchlist } = useAuth();
  const [whales, setWhales] = useState<WhaleTransactionItem[]>([]);
  const [loadingWhales, setLoadingWhales] = useState(true);
  const [quickWalletInput, setQuickWalletInput] = useState('');

  useEffect(() => {
    let active = true;
    setLoadingWhales(true);
    fetch('/api/whales/feed?minUsd=250')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.items) setWhales(data.items);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingWhales(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => computeDashboardStats(tokens), [tokens]);
  const trending = useMemo(
    () => filterAndSortTokens(tokens, { section: 'trending', sortBy: 'trending' }).slice(0, 6),
    [tokens]
  );
  const topGainers = useMemo(
    () => filterAndSortTokens(tokens, { section: 'gainers', timeframe: '1h', sortBy: 'gainers' }).slice(0, 5),
    [tokens]
  );
  const topLosers = useMemo(
    () => filterAndSortTokens(tokens, { section: 'losers', timeframe: '1h', sortBy: 'losers' }).slice(0, 5),
    [tokens]
  );
  const newTokens = useMemo(
    () => filterAndSortTokens(tokens, { section: 'new_tokens', sortBy: 'newest' }).slice(0, 6),
    [tokens]
  );
  const graduationFeed = useMemo(
    () =>
      tokens
        .filter((t) => t.isPumpFun || isGraduatedToken(t))
        .sort((a, b) => (b.bondingCurveProgressPct ?? 0) - (a.bondingCurveProgressPct ?? 0))
        .slice(0, 5),
    [tokens]
  );

  const handleQuickWalletSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickWalletInput.trim().length >= 32) {
      onInspectWallet(quickWalletInput.trim());
    }
  };

  const activeSources = providers.filter((p) => p.connected).map((p) => p.name);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-blue-400">
            MULTITRADE AI · Intelligence Before Every Trade
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-white">
            Live Pump.fun &amp; Solana Market Dashboard
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Free, real-time memecoin analytics, whale activity, and read-only public wallet portfolio tracking
            {lastUpdatedUtc && ` · Last sync ${formatUtcOrLocalTimestamp(lastUpdatedUtc, profile.timezone)}`}
            {solPriceUsd ? ` · SOL $${solPriceUsd.toFixed(2)}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('visualizer')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-600/15 px-3 py-2 text-xs font-medium text-blue-200 hover:bg-blue-600/25"
          >
            <Layers className="h-3.5 w-3.5" />
            Market Visualizer
          </button>
          <button
            type="button"
            onClick={() => onNavigate('map3d')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-600/15 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-600/25"
          >
            <Compass className="h-3.5 w-3.5" />
            3D Coin Map
          </button>
          <button
            type="button"
            onClick={() => onNavigate('ai')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600/15 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-600/25"
          >
            <Sparkles className="h-3.5 w-3.5" />
            MULTITRADE AI Intelligence
          </button>
          <button
            type="button"
            onClick={() => onNavigate('wallets')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500"
          >
            <Wallet className="h-3.5 w-3.5" />
            Track Any Wallet
          </button>
        </div>
      </div>

      {/* 1. Top Market Overview KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
          <div className="text-xs text-slate-400">Total Tracked Tokens</div>
          <div className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">
            {loadingTokens ? '—' : stats.totalTrackedTokens}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Live Solana &amp; Pump.fun pairs</div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
          <div className="text-xs text-slate-400">New Tokens Today (&lt;24h)</div>
          <div className="mt-2 font-mono text-2xl font-bold text-blue-400 tabular-nums">
            {loadingTokens ? '—' : stats.newTokens24h}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {stats.graduatedCount} graduated pools tracked
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
          <div className="text-xs text-slate-400">Indexed Market Cap</div>
          <div className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">
            {loadingTokens
              ? '—'
              : formatQuoteCurrency(stats.totalMarketCapUsd, profile.quoteCurrency, fxRates, true)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Aggregate live pair valuation</div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
          <div className="text-xs text-slate-400">Total 24h Volume</div>
          <div className="mt-2 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
            {loadingTokens
              ? '—'
              : formatQuoteCurrency(stats.totalVolume24hUsd, profile.quoteCurrency, fxRates, true)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Liquidity:{' '}
            {loadingTokens
              ? '—'
              : formatQuoteCurrency(stats.totalLiquidityUsd, profile.quoteCurrency, fxRates, true)}
          </div>
        </div>
      </div>

      {/* 2. Trending Tokens + Top Gainers & Losers */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 xl:col-span-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Flame className="h-4 w-4 text-blue-400" />
              Trending Tokens
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('trending')}
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
            >
              View All <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[490px] w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="pb-2 pr-3 font-medium">Token</th>
                  <th className="pb-2 px-2 text-right font-medium whitespace-nowrap">Price</th>
                  <th className="pb-2 px-2 text-right font-medium whitespace-nowrap">1h %</th>
                  <th className="pb-2 px-2 text-right font-medium whitespace-nowrap">1h Vol</th>
                  <th className="pb-2 pl-2 text-right font-medium whitespace-nowrap">Liquidity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {loadingTokens ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={5} className="py-3">
                        <div className="h-4 w-full rounded bg-slate-800/70" />
                      </td>
                    </tr>
                  ))
                ) : (
                  trending.map((t) => (
                    <tr
                      key={t.mint}
                      onClick={() => onSelectToken(t.mint)}
                      className="cursor-pointer hover:bg-slate-800/40"
                    >
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-2">
                          {t.imageUrl ? (
                            <img
                              src={t.imageUrl}
                              alt={t.symbol}
                              referrerPolicy="no-referrer"
                              className="h-6 w-6 rounded-full object-cover bg-slate-800"
                            />
                          ) : (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600/20 font-mono text-[10px] font-bold text-blue-300">
                              {t.symbol.slice(0, 2)}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-white">{t.symbol}</div>
                            <div className="max-w-[110px] truncate text-[10px] text-slate-400">
                              {t.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-100 whitespace-nowrap">
                        {t.priceUsd > 0
                          ? formatQuoteCurrency(t.priceUsd, profile.quoteCurrency, fxRates)
                          : 'Data unavailable'}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap ${
                          t.priceChange1h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {t.priceChange1h >= 0 ? '+' : ''}
                        {t.priceChange1h.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        {formatQuoteCurrency(t.volume1hUsd, profile.quoteCurrency, fxRates, true)}
                      </td>
                      <td className="py-2.5 pl-2 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {formatQuoteCurrency(t.liquidityUsd, profile.quoteCurrency, fxRates, true)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Gainers & Top Losers */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-6">
          <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-white">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                Top Gainers (1h)
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('gainers')}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                More
              </button>
            </div>
            <div className="divide-y divide-slate-800/70">
              {topGainers.length === 0 ? (
                <p className="py-4 text-xs text-slate-500">No positive 1h gainers in current batch.</p>
              ) : (
                topGainers.map((t) => (
                  <button
                    key={t.mint}
                    type="button"
                    onClick={() => onSelectToken(t.mint)}
                    className="flex w-full items-center justify-between py-2.5 text-left hover:bg-slate-800/30 rounded px-1"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">{t.symbol}</div>
                      <div className="text-[11px] text-slate-400">
                        MCap {formatQuoteCurrency(t.marketCapUsd, profile.quoteCurrency, fxRates, true)}
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs tabular-nums">
                      <div className="inline-flex items-center gap-0.5 text-emerald-400 font-semibold">
                        <ArrowUpRight className="h-3 w-3" />+{t.priceChange1h.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {formatQuoteCurrency(t.priceUsd, profile.quoteCurrency, fxRates)}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-white">
                <ArrowDownRight className="h-4 w-4 text-rose-400" />
                Top Losers (1h)
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('losers')}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                More
              </button>
            </div>
            <div className="divide-y divide-slate-800/70">
              {topLosers.length === 0 ? (
                <p className="py-4 text-xs text-slate-500">No negative 1h movers in current batch.</p>
              ) : (
                topLosers.map((t) => (
                  <button
                    key={t.mint}
                    type="button"
                    onClick={() => onSelectToken(t.mint)}
                    className="flex w-full items-center justify-between py-2.5 text-left hover:bg-slate-800/30 rounded px-1"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">{t.symbol}</div>
                      <div className="text-[11px] text-slate-400">
                        Liq {formatQuoteCurrency(t.liquidityUsd, profile.quoteCurrency, fxRates, true)}
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs tabular-nums">
                      <div className="inline-flex items-center gap-0.5 text-rose-400 font-semibold">
                        <ArrowDownRight className="h-3 w-3" />
                        {t.priceChange1h.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {formatQuoteCurrency(t.priceUsd, profile.quoteCurrency, fxRates)}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Live Token Creation Feed + Market Activity Chart + Pump.fun Graduation Tracker */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 xl:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Activity className="h-4 w-4 text-blue-400" />
              Live Token Creation Feed
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('new_tokens')}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              All New
            </button>
          </div>
          <div className="divide-y divide-slate-800/70">
            {newTokens.length === 0 ? (
              <p className="py-4 text-xs text-slate-500">
                No recently created tokens (&lt;72h) in current snapshot.
              </p>
            ) : (
              newTokens.map((t) => (
                <button
                  key={t.mint}
                  type="button"
                  onClick={() => onSelectToken(t.mint)}
                  className="flex w-full items-center justify-between py-2.5 text-left hover:bg-slate-800/30 rounded px-1"
                >
                  <div>
                    <div className="text-xs font-semibold text-white">{t.symbol}</div>
                    <div className="text-[11px] text-slate-400">
                      {t.pairCreatedAt
                        ? formatUtcOrLocalTimestamp(t.pairCreatedAt, profile.timezone)
                        : 'Timestamp unavailable'}
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs tabular-nums">
                    <div className="text-slate-200">
                      {formatQuoteCurrency(t.marketCapUsd, profile.quoteCurrency, fxRates, true)}
                    </div>
                    <div className="text-[10px] text-blue-400">{t.dexId}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 xl:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Market Activity (1h Vol vs Liq)</h2>
            <span className="font-mono text-[11px] text-slate-400">USD ($K)</span>
          </div>
          <MarketActivityChart tokens={tokens} />
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 xl:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <GraduationCap className="h-4 w-4 text-indigo-400" />
              Pump.fun Graduation Tracker
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('graduated')}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Graduated
            </button>
          </div>
          <div className="space-y-3">
            {graduationFeed.length === 0 ? (
              <p className="text-xs text-slate-500">No Pump.fun pairs in current feed.</p>
            ) : (
              graduationFeed.map((t) => {
                const pct = t.bondingCurveProgressPct ?? (isGraduatedToken(t) ? 100 : null);
                return (
                  <button
                    key={t.mint}
                    type="button"
                    onClick={() => onSelectToken(t.mint)}
                    className="block w-full text-left hover:bg-slate-800/30 rounded p-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white">{t.symbol}</span>
                      <span className="font-mono text-[11px] text-slate-300">
                        {isGraduatedToken(t)
                          ? `Graduated (${t.dexId})`
                          : pct !== null
                          ? `${pct}% Bonding`
                          : t.migrationStatus}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full ${
                          isGraduatedToken(t) ? 'bg-emerald-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${pct ?? 20}%` }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 4. Recent Whale Transactions + Watchlist & Personal Portfolio Summary */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 xl:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Waves className="h-4 w-4 text-blue-400" />
              Recent Whale &amp; Large On-Chain Transactions
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('whales')}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Whale Tracker
            </button>
          </div>
          {loadingWhales ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-slate-800/70" />
              ))}
            </div>
          ) : whales.length === 0 ? (
            <p className="text-xs text-slate-500">
              No parsed on-chain swaps returned in the current RPC window. Check Whale Tracker to refresh.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[460px] w-full text-left text-xs">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="pb-2 pr-2 font-medium">Token</th>
                    <th className="pb-2 pr-2 font-medium">Type</th>
                    <th className="pb-2 pr-2 font-medium">Wallet</th>
                    <th className="pb-2 pr-2 text-right font-medium whitespace-nowrap">USD Value</th>
                    <th className="pb-2 text-right font-medium">Tx</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {whales.slice(0, 6).map((w) => (
                    <tr key={w.signature} className="hover:bg-slate-800/30">
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          onClick={() => onSelectToken(w.mint)}
                          className="font-semibold text-white hover:text-blue-300"
                        >
                          {w.symbol || w.mint.slice(0, 6)}
                        </button>
                      </td>
                      <td className="py-2 pr-2 font-mono text-[11px]">
                        <span
                          className={
                            w.type === 'BUY'
                              ? 'text-emerald-400'
                              : w.type === 'SELL'
                              ? 'text-rose-400'
                              : 'text-slate-300'
                          }
                        >
                          {w.type}
                        </span>
                      </td>
                      <td className="py-2 pr-2 font-mono text-[11px]">
                        {w.walletAddress ? (
                          <button
                            type="button"
                            onClick={() => onInspectWallet(w.walletAddress!)}
                            className="text-blue-400 hover:underline"
                          >
                            {w.walletAddress.slice(0, 6)}..{w.walletAddress.slice(-4)}
                          </button>
                        ) : (
                          'Unknown'
                        )}
                      </td>
                      <td className="py-2 pr-2 text-right font-mono tabular-nums text-slate-200">
                        {w.usdValue !== null
                          ? formatQuoteCurrency(w.usdValue, profile.quoteCurrency, fxRates)
                          : w.solAmount !== null
                          ? `${w.solAmount} SOL`
                          : 'Data unavailable'}
                      </td>
                      <td className="py-2 text-right">
                        <a
                          href={w.solscanUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                        >
                          Solscan <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Watchlist Summary + Personal Portfolio Lookup */}
        <div className="space-y-6 xl:col-span-5">
          <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Wallet className="h-4 w-4 text-blue-400" />
                Personal Public Wallet Portfolio
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('wallets')}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Open Portfolio
              </button>
            </div>
            <form onSubmit={handleQuickWalletSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  value={quickWalletInput}
                  onChange={(e) => setQuickWalletInput(e.target.value)}
                  placeholder="Paste public Solana wallet address..."
                  className="w-full rounded-lg border border-slate-700 bg-[#070B14] py-2 pl-8 pr-3 font-mono text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500 whitespace-nowrap"
              >
                View P&amp;L
              </button>
            </form>
            <div className="mt-3 text-xs text-slate-400">
              {walletWatchlist.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {walletWatchlist.slice(0, 4).map((w) => (
                    <button
                      key={w.address}
                      type="button"
                      onClick={() => onInspectWallet(w.address)}
                      className="rounded border border-slate-800 bg-[#070B14] px-2.5 py-1 font-mono text-[11px] text-blue-300 hover:border-blue-500/60"
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              ) : (
                <span>
                  Read-only public address inspection: view SOL, SPL token balances, USD allocation, and recent activity with zero wallet connection required.
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Star className="h-4 w-4 text-amber-400" />
                Watchlist Summary ({watchlist.length} Tokens · {walletWatchlist.length} Wallets)
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('watchlist')}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Manage
              </button>
            </div>
            {watchlist.length === 0 ? (
              <p className="text-xs text-slate-500">
                Star any token from the market feed to track it in your personal watchlist.
              </p>
            ) : (
              <div className="divide-y divide-slate-800/70">
                {watchlist.slice(0, 4).map((w) => {
                  const live = tokens.find((t) => t.mint === w.mint);
                  return (
                    <button
                      key={w.mint}
                      type="button"
                      onClick={() => onSelectToken(w.mint)}
                      className="flex w-full items-center justify-between py-2 text-left text-xs hover:bg-slate-800/30 rounded px-1"
                    >
                      <span className="font-semibold text-white">{w.symbol}</span>
                      <span className="font-mono text-slate-300 tabular-nums">
                        {live
                          ? formatQuoteCurrency(live.priceUsd, profile.quoteCurrency, fxRates)
                          : formatQuoteCurrency(w.addedPriceUsd, profile.quoteCurrency, fxRates)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Source Attribution Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/70 pt-3 text-[11px] text-slate-500">
        <div>
          Verified Live Feeds: {activeSources.length ? activeSources.join(' · ') : 'Connecting...'}
        </div>
        <div>
          Analytics &amp; portfolio tracking only — MULTITRADE AI never executes automatic trades or holds private keys.
        </div>
      </div>
    </div>
  );
};
