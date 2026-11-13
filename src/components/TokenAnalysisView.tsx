import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Cpu,
  ExternalLink,
  ShieldAlert,
  Star,
  Wallet,
} from 'lucide-react';
import { formatQuoteCurrency, formatUtcOrLocalTimestamp } from '../shared/currency';
import {
  SupportedTimeframeValues,
  type AiIntelligenceReport,
  type OhlcvCandle,
  type OnChainTokenAudit,
  type ParsedOnChainTx,
  type RugRiskAssessment,
  type SocialIntelligenceSummary,
  type SupportedTimeframe,
  type TokenMarketData,
} from '../shared/types';
import { useAuth } from '../contexts/AuthContext';
import { CandlestickChart } from './charts/CandlestickChart';
import { HolderDistributionChart } from './charts/AnalyticsCharts';
import { AiOutcomeTag, RiskLevelTag } from './ui/RiskBadge';

interface TokenAnalysisViewProps {
  mint: string;
  onBack: () => void;
  onInspectWallet: (address: string) => void;
}

export const TokenAnalysisView: React.FC<TokenAnalysisViewProps> = ({
  mint,
  onBack,
  onInspectWallet,
}) => {
  const { profile, fxRates, isWatched, toggleWatchlist, recordAiReport, logAudit } = useAuth();

  const [timeframe, setTimeframe] = useState<SupportedTimeframe>('5m');
  const [token, setToken] = useState<TokenMarketData | null>(null);
  const [audit, setAudit] = useState<OnChainTokenAudit | null>(null);
  const [candles, setCandles] = useState<OhlcvCandle[]>([]);
  const [ohlcvMeta, setOhlcvMeta] = useState({ source: 'GeckoTerminal', freshness: 'REALTIME' });
  const [social, setSocial] = useState<SocialIntelligenceSummary | null>(null);
  const [transactions, setTransactions] = useState<ParsedOnChainTx[]>([]);
  const [risk, setRisk] = useState<RugRiskAssessment | null>(null);
  const [aiReport, setAiReport] = useState<AiIntelligenceReport | null>(null);

  const [copiedMint, setCopiedMint] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setAiError(null);
    setAiReport(null);

    fetch(`/api/tokens/${encodeURIComponent(mint)}?timeframe=${timeframe}`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setToken(data.token);
        setAudit(data.audit);
        setCandles(data.ohlcv?.candles || []);
        setOhlcvMeta({
          source: data.ohlcv?.source || 'GeckoTerminal',
          freshness: data.ohlcv?.freshness || 'HISTORICAL',
        });
        setSocial(data.social);
        setTransactions(data.transactions || []);
        setRisk(data.riskAssessment);
      })
      .catch((err: any) => {
        if (active) setError(err?.message || 'Failed to load token analytics.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [mint]);

  const handleTimeframeChange = async (tf: SupportedTimeframe) => {
    setTimeframe(tf);
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(mint)}/ohlcv?timeframe=${tf}`);
      if (res.ok) {
        const data = await res.json();
        setCandles(data.candles || []);
        setOhlcvMeta({ source: data.source, freshness: data.freshness });
      }
    } catch {
      // ignore transient error
    }
  };

  const handleRunAiAnalysis = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'AI analysis failed');
      }
      const rep = (await res.json()) as AiIntelligenceReport;
      setAiReport(rep);
      recordAiReport(rep);
      await logAudit(
        'AI_ANALYSIS_RUN',
        `Analyzed ${rep.symbol}: ${rep.outcome} (${rep.overallScore}/100)`
      );
    } catch (err: any) {
      setAiError(err?.message || 'Failed to run MULTITRADE AI analysis.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopyMint = async () => {
    try {
      await navigator.clipboard.writeText(mint);
      setCopiedMint(true);
      setTimeout(() => setCopiedMint(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Market
        </button>
        <div className="h-72 animate-pulse rounded-xl border border-slate-800 bg-[#0D1322]" />
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Market
        </button>
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-300">
          {error || 'Token not found.'}
        </div>
      </div>
    );
  }

  const watched = isWatched(token.mint);
  const total1h = token.buys1h + token.sells1h;
  const buyPct1h = total1h > 0 ? Math.round((token.buys1h / total1h) * 100) : null;

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Market Feed
          </button>
          <div className="flex flex-wrap items-center gap-3">
            {token.imageUrl ? (
              <img
                src={token.imageUrl}
                alt={token.symbol}
                referrerPolicy="no-referrer"
                className="h-9 w-9 rounded-full object-cover bg-slate-800"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600/20 font-mono text-xs font-bold text-blue-300">
                {token.symbol.slice(0, 2)}
              </div>
            )}
            <h1 className="font-display text-2xl font-bold text-white">
              {token.name} ({token.symbol})
            </h1>
            {risk && <RiskLevelTag level={risk.overallLevel} />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-400">
            <button
              type="button"
              onClick={handleCopyMint}
              className="inline-flex items-center gap-1.5 rounded border border-slate-800 bg-[#0D1322] px-2 py-0.5 text-slate-300 hover:border-blue-500/50"
            >
              <span>Mint: {token.mint}</span>
              {copiedMint ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
            <span aria-hidden="true">·</span>
            <span>
              {token.dexId} ({token.migrationStatus})
            </span>
            {token.creatorAddress && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => onInspectWallet(token.creatorAddress!)}
                  className="text-blue-400 hover:underline"
                >
                  Creator: {token.creatorAddress.slice(0, 6)}..{token.creatorAddress.slice(-4)}
                </button>
              </>
            )}
            <span aria-hidden="true">·</span>
            <a
              href={token.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-400 hover:underline"
            >
              Explorer / Pair <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggleWatchlist(token)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${
              watched
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-slate-700 bg-[#0D1322] text-slate-200 hover:border-slate-500'
            }`}
          >
            <Star className="h-3.5 w-3.5" fill={watched ? 'currentColor' : 'none'} />
            {watched ? 'Watched' : 'Add to Watchlist'}
          </button>

          <button
            type="button"
            onClick={handleRunAiAnalysis}
            disabled={aiLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap"
          >
            <Cpu className="h-3.5 w-3.5" />
            {aiLoading ? 'Running MULTITRADE AI...' : 'Run MULTITRADE AI Analysis'}
          </button>
        </div>
      </div>

      {/* Market Telemetry Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <div className="rounded-lg border border-slate-800 bg-[#0D1322] p-3">
          <div className="text-[11px] text-slate-400">Price (USD)</div>
          <div className="mt-1 font-mono text-sm font-semibold text-white tabular-nums">
            {token.priceUsd > 0
              ? formatQuoteCurrency(token.priceUsd, profile.quoteCurrency, fxRates)
              : 'Data unavailable'}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-400">
            {token.priceNative > 0 ? `${token.priceNative.toFixed(7)} SOL` : 'SOL unavailable'}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#0D1322] p-3">
          <div className="text-[11px] text-slate-400">Market Cap / FDV</div>
          <div className="mt-1 font-mono text-sm font-semibold text-white tabular-nums">
            {token.marketCapUsd > 0
              ? formatQuoteCurrency(token.marketCapUsd, profile.quoteCurrency, fxRates, true)
              : 'Data unavailable'}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-500">
            FDV {formatQuoteCurrency(token.fdvUsd, profile.quoteCurrency, fxRates, true)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#0D1322] p-3">
          <div className="text-[11px] text-slate-400">Liquidity</div>
          <div className="mt-1 font-mono text-sm font-semibold text-white tabular-nums">
            {token.liquidityUsd > 0
              ? formatQuoteCurrency(token.liquidityUsd, profile.quoteCurrency, fxRates, true)
              : 'Data unavailable'}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">Pool: {token.pairAddress.slice(0, 6)}..</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#0D1322] p-3">
          <div className="text-[11px] text-slate-400">5m / 1h / 24h Vol</div>
          <div className="mt-1 font-mono text-sm font-semibold text-white tabular-nums">
            {formatQuoteCurrency(token.volume24hUsd, profile.quoteCurrency, fxRates, true)}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-400">
            5m {formatQuoteCurrency(token.volume5mUsd, profile.quoteCurrency, fxRates, true)} · 1h{' '}
            {formatQuoteCurrency(token.volume1hUsd, profile.quoteCurrency, fxRates, true)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#0D1322] p-3">
          <div className="text-[11px] text-slate-400">1h Buy / Sell</div>
          <div className="mt-1 font-mono text-sm font-semibold text-white tabular-nums">
            {buyPct1h !== null ? `${buyPct1h}% B` : 'Data unavailable'}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-400">
            {token.buys1h} Buys / {token.sells1h} Sells
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#0D1322] p-3">
          <div className="text-[11px] text-slate-400">Holders &amp; Top 20</div>
          <div className="mt-1 font-mono text-sm font-semibold text-white tabular-nums">
            {token.holdersCount !== null ? token.holdersCount.toLocaleString() : 'Data unavailable'}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-400">
            Top 20:{' '}
            {audit?.top20ConcentrationPct !== null && audit?.top20ConcentrationPct !== undefined
              ? `${audit.top20ConcentrationPct}%`
              : 'Data unavailable'}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#0D1322] p-3">
          <div className="text-[11px] text-slate-400">Bonding / Stage</div>
          <div className="mt-1 font-mono text-sm font-semibold text-blue-400 tabular-nums">
            {token.bondingCurveProgressPct !== null
              ? `${token.bondingCurveProgressPct}%`
              : token.migrationStatus}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400">{token.migrationStatus}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#0D1322] p-3">
          <div className="text-[11px] text-slate-400">Created Time</div>
          <div className="mt-1 font-mono text-[11px] font-medium text-slate-200">
            {token.pairCreatedAt
              ? formatUtcOrLocalTimestamp(token.pairCreatedAt, profile.timezone)
              : 'Data unavailable'}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">Freshness: {token.freshness}</div>
        </div>
      </div>

      {/* TradingView Lightweight Charts Candlestick View */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#0D1322] p-1">
            {SupportedTimeframeValues.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => handleTimeframeChange(tf)}
                className={`rounded px-2.5 py-1 font-mono text-xs font-medium ${
                  timeframe === tf ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-slate-400">
            Source: {token.source} · Synced {formatUtcOrLocalTimestamp(token.lastUpdatedUtc, profile.timezone)}
          </div>
        </div>

        <CandlestickChart
          candles={candles}
          symbol={token.symbol}
          timeframe={timeframe}
          source={ohlcvMeta.source}
          freshness={ohlcvMeta.freshness}
          height={400}
        />
      </div>

      {/* Inline AI Error Banner */}
      {aiError && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-300">
          MULTITRADE AI error: {aiError}
        </div>
      )}

      {/* MULTITRADE AI Intelligence Report */}
      {aiReport && (
        <div className="rounded-xl border border-blue-500/40 bg-[#0D1322] p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-xl font-semibold text-white">
                  MULTITRADE AI Token Intelligence Report
                </h2>
                <AiOutcomeTag outcome={aiReport.outcome} />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Engine: {aiReport.orchestratorModel} · Confidence: {aiReport.confidenceLevel}% · Generated{' '}
                {formatUtcOrLocalTimestamp(aiReport.generatedAtUtc, profile.timezone)}
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono text-3xl font-bold text-white tabular-nums">
                {aiReport.overallScore} / 100
              </div>
              <div className="text-[11px] text-slate-400">Composite Intelligence Score</div>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-slate-200">{aiReport.explanation}</p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-800 bg-[#070B14] p-4">
              <h3 className="text-xs font-semibold text-emerald-400">Supporting Signals</h3>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
                {aiReport.bullishEvidence.map((item, i) => (
                  <li key={i}>· {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#070B14] p-4">
              <h3 className="text-xs font-semibold text-rose-400">Risk &amp; Warning Signals</h3>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
                {aiReport.bearishEvidence.map((item, i) => (
                  <li key={i}>· {item}</li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            AI insights are analytical interpretations of public market and on-chain telemetry — never financial advice or trade execution instructions.
          </p>
        </div>
      )}

      {/* On-Chain Transactions + Top 20 Holders + Risk Indicators */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Top 20 Holders & Distribution Chart */}
        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 space-y-4 lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Wallet className="h-4 w-4 text-blue-400" />
              Top 20 Token Holders ({audit?.rpcSource || 'Solana RPC'})
            </h2>
            <div className="flex items-center gap-3 font-mono text-xs text-slate-300 tabular-nums">
              <span>
                Top 10:{' '}
                {audit?.top10ConcentrationPct != null ? `${audit.top10ConcentrationPct}%` : 'Data unavailable'}
              </span>
              <span>
                Top 20:{' '}
                {audit?.top20ConcentrationPct != null ? `${audit.top20ConcentrationPct}%` : 'Data unavailable'}
              </span>
            </div>
          </div>

          <HolderDistributionChart holders={audit?.topHolders || []} />

          {!audit?.rpcConnected || audit.topHolders.length === 0 ? (
            <p className="text-xs text-slate-400">
              {audit?.error || 'Top holder list unavailable from RPC.'}
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 border-b border-slate-800 bg-[#0D1322] text-slate-400">
                  <tr>
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">Owner / Account</th>
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 text-right font-medium">% Supply</th>
                    <th className="pb-2 text-right font-medium">Wallet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {audit.topHolders.map((h, idx) => {
                    const targetAddr = h.ownerAddress || h.address;
                    return (
                      <tr key={h.address}>
                        <td className="py-2 font-mono text-[11px] text-slate-500">{idx + 1}</td>
                        <td className="py-2 font-mono text-[11px] text-slate-300">
                          {targetAddr.slice(0, 6)}...{targetAddr.slice(-4)}
                        </td>
                        <td className="py-2 text-[11px]">
                          <span
                            className={
                              h.isPoolAccount ? 'text-indigo-400 font-medium' : 'text-slate-400'
                            }
                          >
                            {h.isPoolAccount ? 'AMM Pool' : 'Holder'}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-200">
                          {h.pctOfSupply.toFixed(2)}%
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => onInspectWallet(targetAddr)}
                            className="text-[11px] text-blue-400 hover:underline"
                          >
                            Inspect
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

        {/* Real On-Chain Transactions Table */}
        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 space-y-4 lg:col-span-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Recent On-Chain Transactions ({transactions.length})
            </h2>
            <span className="text-[11px] text-slate-400">Solana RPC / Explorer</span>
          </div>

          {transactions.length === 0 ? (
            <p className="text-xs text-slate-400">
              No recent parsed swap/transfer records returned for this pool in the current RPC window.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 border-b border-slate-800 bg-[#0D1322] text-slate-400">
                  <tr>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Wallet</th>
                    <th className="pb-2 text-right font-medium">SOL / Tokens</th>
                    <th className="pb-2 text-right font-medium">USD Est.</th>
                    <th className="pb-2 text-right font-medium">Solscan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {transactions.map((tx) => (
                    <tr key={tx.signature}>
                      <td className="py-2 font-mono text-[11px] font-semibold">
                        <span
                          className={
                            tx.type === 'BUY'
                              ? 'text-emerald-400'
                              : tx.type === 'SELL'
                              ? 'text-rose-400'
                              : 'text-slate-300'
                          }
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-2 font-mono text-[11px]">
                        {tx.walletAddress ? (
                          <button
                            type="button"
                            onClick={() => onInspectWallet(tx.walletAddress!)}
                            className="text-blue-400 hover:underline"
                          >
                            {tx.walletAddress.slice(0, 6)}..{tx.walletAddress.slice(-4)}
                          </button>
                        ) : (
                          'Unknown'
                        )}
                      </td>
                      <td className="py-2 text-right font-mono text-[11px] tabular-nums text-slate-300">
                        {tx.solAmount !== null
                          ? `${tx.solAmount} SOL`
                          : tx.tokenAmount !== null
                          ? `${tx.tokenAmount.toLocaleString()} ${token.symbol}`
                          : '—'}
                      </td>
                      <td className="py-2 text-right font-mono text-[11px] tabular-nums text-slate-200">
                        {tx.usdValue !== null
                          ? formatQuoteCurrency(tx.usdValue, profile.quoteCurrency, fxRates)
                          : 'Data unavailable'}
                      </td>
                      <td className="py-2 text-right">
                        <a
                          href={tx.solscanUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                        >
                          Tx <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 12-Point Risk Indicators Matrix & Social Summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldAlert className="h-4 w-4 text-rose-400" />
              On-Chain &amp; Rug Risk Indicators
            </h2>
            {risk && <RiskLevelTag level={risk.overallLevel} />}
          </div>
          <div className="divide-y divide-slate-800/70">
            {risk?.checks.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3 py-2.5 text-xs">
                <div>
                  <div className="font-medium text-white">{c.label}</div>
                  <div className="mt-0.5 text-slate-400">{c.summary}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-500">{c.evidence}</div>
                </div>
                <RiskLevelTag level={c.level} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Social Sentiment &amp; Sources</h2>
            <span className="font-mono text-xs text-slate-300">
              {social?.sentimentLabel || 'INSUFFICIENT_DATA'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {social?.sources.map((s) => (
              <div
                key={s.platform}
                className="rounded border border-slate-800 bg-[#070B14] px-2.5 py-2 text-[11px]"
              >
                <div className="flex items-center justify-between font-medium text-white">
                  <span>{s.platform}</span>
                  <span className={s.connected ? 'text-emerald-400' : 'text-amber-400'}>
                    {s.mode}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-slate-400">{s.message}</div>
              </div>
            ))}
          </div>
          {social && social.mentions.length > 0 ? (
            <div className="space-y-2">
              {social.mentions.slice(0, 4).map((m) => (
                <a
                  key={m.id}
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded border border-slate-800 bg-[#070B14] p-2.5 text-xs hover:border-slate-600"
                >
                  <div className="font-medium text-slate-200 line-clamp-1">{m.title}</div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {m.platform} · {m.author} · {m.sentiment}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              No public social mentions returned for {token.symbol}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
