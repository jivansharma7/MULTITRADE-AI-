import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Compass,
  ExternalLink,
  Globe,
  Mic,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import {
  buildCoinMapLayout,
  computeCameraPresetPose,
  type CameraPose,
  type CoinMapCameraPreset,
  type CoinMapCategory,
  type CoinMapMetric,
} from '../shared/coinMap3dLayout';
import { formatQuoteCurrency } from '../shared/currency';
import { isGraduatedToken } from '../shared/marketAnalytics';
import type { TokenMarketData } from '../shared/types';
import { useAuth } from '../contexts/AuthContext';
import { CoinMapCanvas } from './map3d/CoinMapCanvas';
import { VoiceAssistantPanel } from './map3d/VoiceAssistantPanel';

interface CoinMap3DViewProps {
  tokens: TokenMarketData[];
  solPriceUsd: number | null;
  loadingTokens: boolean;
  onSelectToken: (mint: string) => void;
}

interface GroundedBriefState {
  loading: boolean;
  available?: boolean;
  summary?: string;
  citations?: Array<{ title: string; uri: string }>;
  error?: string;
}

export const CoinMap3DView: React.FC<CoinMap3DViewProps> = ({
  tokens,
  solPriceUsd,
  loadingTokens,
  onSelectToken,
}) => {
  const { profile, fxRates } = useAuth();

  const [metric, setMetric] = useState<CoinMapMetric>('mcap');
  const [category, setCategory] = useState<CoinMapCategory>('ALL');
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [cameraPoseVersion, setCameraPoseVersion] = useState(1);
  const [activePreset, setActivePreset] = useState<CoinMapCameraPreset>('OVERVIEW');
  const [groundedBriefs, setGroundedBriefs] = useState<Record<string, GroundedBriefState>>({});

  const nodes = useMemo(
    () => buildCoinMapLayout(tokens, { metric, category, maxCoins: 30 }),
    [tokens, metric, category]
  );

  const selectedNode = useMemo(
    () => (selectedMint ? nodes.find((n) => n.mint === selectedMint) ?? null : null),
    [nodes, selectedMint]
  );

  const cameraPose: CameraPose = useMemo(
    () => computeCameraPresetPose(activePreset, nodes, selectedMint),
    [activePreset, nodes, selectedMint]
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      } else if (e.key === 'Escape') {
        setSelectedMint(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleSelectCoin = (mint: string) => {
    setSelectedMint(mint);
    setActivePreset('OVERVIEW');
    setCameraPoseVersion((v) => v + 1);
  };

  const handleCameraPreset = (preset: CoinMapCameraPreset) => {
    setSelectedMint(null);
    setActivePreset(preset);
    setCameraPoseVersion((v) => v + 1);
  };

  const handleFetchWebContext = async () => {
    if (!selectedNode) return;
    const mint = selectedNode.mint;
    setGroundedBriefs((prev) => ({
      ...prev,
      [mint]: { loading: true },
    }));

    try {
      const res = await fetch('/api/ai/search-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint: selectedNode.mint,
          symbol: selectedNode.symbol,
          name: selectedNode.name,
          priceUsd: selectedNode.token.priceUsd,
          marketCapUsd: selectedNode.token.marketCapUsd,
          volume24hUsd: selectedNode.token.volume24hUsd,
          priceChange1h: selectedNode.token.priceChange1h,
          priceChange24h: selectedNode.token.priceChange24h,
        }),
      });
      const data = await res.json();
      setGroundedBriefs((prev) => ({
        ...prev,
        [mint]: {
          loading: false,
          available: Boolean(data?.available),
          summary: data?.summary || 'No web summary available.',
          citations: Array.isArray(data?.citations) ? data.citations : [],
          error: data?.error,
        },
      }));
    } catch (err: any) {
      setGroundedBriefs((prev) => ({
        ...prev,
        [mint]: {
          loading: false,
          available: false,
          summary: err?.message || 'Failed to retrieve grounded web brief.',
          citations: [],
        },
      }));
    }
  };

  const currentBrief = selectedNode ? groundedBriefs[selectedNode.mint] : undefined;

  return (
    <div className="relative h-[calc(100vh-5.5rem)] min-h-[560px] w-full overflow-hidden rounded-xl border border-slate-800/90 bg-[#060913]">
      {/* Full-Viewport 3D WebGL Scene */}
      <CoinMapCanvas
        nodes={nodes}
        selectedMint={selectedMint}
        cameraPose={cameraPose}
        cameraPoseVersion={cameraPoseVersion}
        autoOrbit={autoOrbit}
        onSelectCoin={handleSelectCoin}
      />

      {/* Top-Left Minimal Spec Bar (solid dark rgba, zero backdrop-filter, zero pulsing dots) */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-1.5 sm:left-4 sm:top-4">
        <div className="pointer-events-auto inline-flex flex-wrap items-center gap-2 rounded-lg border border-slate-700/80 bg-[#0A0F1C]/90 px-3 py-1.5 shadow-lg sm:gap-2.5 sm:px-3.5 sm:py-2">
          <Compass className="h-4 w-4 text-blue-400 shrink-0" />
          <span className="font-display text-xs font-bold tracking-wide text-white">
            <span className="sm:hidden">3D TOP COINS</span>
            <span className="hidden sm:inline">TODAY&apos;S TOP COINS · 3D MARKET MAP</span>
          </span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-blue-300 tabular-nums">
            {loadingTokens ? 'Syncing...' : `${nodes.length} Live`}
          </span>
          {solPriceUsd && (
            <span className="hidden font-mono text-[10px] text-slate-300 sm:inline tabular-nums">
              SOL ${solPriceUsd.toFixed(2)}
            </span>
          )}
        </div>
        <div className="hidden rounded border border-slate-800/80 bg-[#0A0F1C]/85 px-2.5 py-1 font-mono text-[10px] text-slate-400 md:inline-block w-fit">
          Drag to orbit · Scroll to zoom · Click any coin spire to inspect
        </div>
      </div>

      {/* Selected Coin Inspector Drawer (only appears when user clicks a coin) */}
      {selectedNode && (
        <aside
          aria-label="Selected coin 3D inspector"
          className="absolute right-4 top-4 z-20 flex max-h-[calc(100%-8.5rem)] w-[calc(100%-2rem)] max-w-sm flex-col overflow-y-auto rounded-xl border border-slate-700 bg-[#0A0F1C]/95 p-4 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {selectedNode.token.imageUrl ? (
                <img
                  src={selectedNode.token.imageUrl}
                  alt={selectedNode.symbol}
                  referrerPolicy="no-referrer"
                  className="h-9 w-9 rounded-full bg-slate-800 object-cover shrink-0"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600/25 font-mono text-xs font-bold text-blue-300">
                  {selectedNode.symbol.slice(0, 2)}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-blue-600/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-300">
                    #{selectedNode.rank}
                  </span>
                  <h2 className="truncate font-display text-sm font-bold text-white">
                    {selectedNode.symbol}
                  </h2>
                </div>
                <div className="truncate text-[11px] text-slate-400">
                  {selectedNode.name} · {selectedNode.token.dexId}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMint(null)}
              aria-label="Close coin inspector"
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5">
              <div className="text-[10px] text-slate-400">Live Price</div>
              <div className="mt-0.5 font-mono font-bold text-white tabular-nums">
                {formatQuoteCurrency(selectedNode.token.priceUsd, profile.quoteCurrency, fxRates)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5">
              <div className="text-[10px] text-slate-400">1h / 24h Move</div>
              <div
                className={`mt-0.5 font-mono font-bold tabular-nums ${
                  selectedNode.momentum1h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {selectedNode.momentum1h >= 0 ? '+' : ''}
                {selectedNode.momentum1h.toFixed(1)}% /{' '}
                {selectedNode.momentum24h >= 0 ? '+' : ''}
                {selectedNode.momentum24h.toFixed(1)}%
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5">
              <div className="text-[10px] text-slate-400">Market Cap</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-100 tabular-nums">
                {formatQuoteCurrency(selectedNode.token.marketCapUsd, profile.quoteCurrency, fxRates, true)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5">
              <div className="text-[10px] text-slate-400">24h Volume</div>
              <div className="mt-0.5 font-mono font-semibold text-blue-300 tabular-nums">
                {formatQuoteCurrency(selectedNode.token.volume24hUsd, profile.quoteCurrency, fxRates, true)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5">
              <div className="text-[10px] text-slate-400">Pool Liquidity</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-200 tabular-nums">
                {formatQuoteCurrency(selectedNode.token.liquidityUsd, profile.quoteCurrency, fxRates, true)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5">
              <div className="text-[10px] text-slate-400">1h Buys / Sells</div>
              <div className="mt-0.5 font-mono text-slate-200 tabular-nums">
                <span className="text-emerald-400">{selectedNode.token.buys1h}</span> /{' '}
                <span className="text-rose-400">{selectedNode.token.sells1h}</span>
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between rounded-lg border border-slate-800 bg-[#070B14] px-3 py-2 text-[11px]">
            <span className="text-slate-400">Pool Status</span>
            <span className="font-mono font-medium text-slate-200">
              {isGraduatedToken(selectedNode.token)
                ? `Graduated (${selectedNode.token.dexId})`
                : selectedNode.token.bondingCurveProgressPct !== null
                ? `${selectedNode.token.bondingCurveProgressPct}% Bonding`
                : selectedNode.token.migrationStatus}
            </span>
          </div>

          {/* Google Search Grounding Live Web Briefing */}
          <div className="mt-3 rounded-lg border border-slate-800 bg-[#070B14] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                <Globe className="h-3.5 w-3.5 text-blue-400" />
                Live Web Narrative
              </span>
              <button
                type="button"
                onClick={handleFetchWebContext}
                disabled={currentBrief?.loading}
                className="inline-flex items-center gap-1 rounded bg-blue-600/20 px-2 py-1 text-[10px] font-semibold text-blue-300 hover:bg-blue-600/30 disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                {currentBrief?.loading ? 'Searching...' : 'Search Web Context'}
              </button>
            </div>

            {currentBrief && !currentBrief.loading && (
              <div className="mt-2 space-y-2 text-[11px] leading-relaxed text-slate-300">
                <div className="whitespace-pre-wrap">{currentBrief.summary}</div>
                {currentBrief.citations && currentBrief.citations.length > 0 && (
                  <div className="border-t border-slate-800 pt-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Grounded Sources
                    </div>
                    <div className="space-y-1">
                      {currentBrief.citations.map((c) => (
                        <a
                          key={c.uri}
                          href={c.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 truncate text-[10px] text-blue-400 hover:underline"
                        >
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{c.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onSelectToken(selectedNode.mint)}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
          >
            Open Full Token Analytics
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </aside>
      )}

      {/* Live Voice Panel (docked below top-left header so bottom dock stays 100% clear) */}
      {voiceOpen && (
        <div className="absolute left-3 top-16 z-20 w-[calc(100%-1.5rem)] max-w-sm sm:left-4 sm:top-24">
          <VoiceAssistantPanel
            selectedNode={selectedNode}
            onClose={() => setVoiceOpen(false)}
          />
        </div>
      )}

      {/* Single Collapsible Bottom Control Dock (no backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-2.5 sm:bottom-4 sm:px-3">
        {dockCollapsed ? (
          <button
            type="button"
            onClick={() => setDockCollapsed(false)}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0A0F1C]/95 px-4 py-2 text-xs font-semibold text-slate-200 shadow-xl hover:border-blue-500"
          >
            <ChevronUp className="h-3.5 w-3.5 text-blue-400" />
            Show 3D Controls (H)
          </button>
        ) : (
          <div className="pointer-events-auto w-full max-w-[940px] rounded-xl border border-slate-700/90 bg-[#0A0F1C]/95 p-2.5 shadow-2xl sm:p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Metric Sizing Toggle */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Height:
                </span>
                {(
                  [
                    { id: 'mcap', label: 'Market Cap' },
                    { id: 'volume24h', label: '24h Volume' },
                    { id: 'liquidity', label: 'Liquidity' },
                  ] as Array<{ id: CoinMapMetric; label: string }>
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMetric(m.id)}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      metric === m.id
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-800 bg-[#070B14] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Cohort Filter */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'ALL', label: 'All Top' },
                    { id: 'GAINERS', label: 'Gainers' },
                    { id: 'GRADUATED', label: 'Graduated' },
                    { id: 'NEW', label: 'New' },
                  ] as Array<{ id: CoinMapCategory; label: string }>
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCategory(c.id);
                      setSelectedMint(null);
                    }}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      category === c.id
                        ? 'border border-emerald-500/50 bg-emerald-600/20 text-emerald-300'
                        : 'border border-slate-800 bg-[#070B14] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Camera & Dock Actions */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCameraPreset('OVERVIEW')}
                  className="inline-flex items-center gap-1 rounded border border-slate-800 bg-[#070B14] px-2 py-1 text-[11px] text-slate-300 hover:border-slate-600 hover:text-white"
                >
                  <RotateCcw className="h-3 w-3" /> Overview
                </button>
                <button
                  type="button"
                  onClick={() => handleCameraPreset('CROWN')}
                  className="rounded border border-slate-800 bg-[#070B14] px-2 py-1 text-[11px] text-slate-300 hover:border-slate-600 hover:text-white"
                >
                  Crown Leaders
                </button>
                <button
                  type="button"
                  onClick={() => setAutoOrbit((o) => !o)}
                  className={`rounded px-2 py-1 text-[11px] font-medium ${
                    autoOrbit
                      ? 'border border-blue-500/50 bg-blue-600/20 text-blue-300'
                      : 'border border-slate-800 bg-[#070B14] text-slate-400 hover:text-white'
                  }`}
                >
                  {autoOrbit ? 'Orbit On' : 'Orbit Off'}
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceOpen((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold ${
                    voiceOpen
                      ? 'bg-indigo-600 text-white'
                      : 'border border-indigo-500/40 bg-indigo-600/15 text-indigo-200 hover:bg-indigo-600/25'
                  }`}
                >
                  <Mic className="h-3 w-3" /> Voice AI
                </button>
                <button
                  type="button"
                  onClick={() => setDockCollapsed(true)}
                  aria-label="Collapse 3D dock controls"
                  className="rounded border border-slate-800 bg-[#070B14] p-1 text-slate-400 hover:text-white"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Top 6 Quick-Jump Coin Strip */}
            {nodes.length > 0 && (
              <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto border-t border-slate-800/80 pt-2">
                <span className="shrink-0 text-[10px] font-mono uppercase text-slate-500">
                  Leaders:
                </span>
                {nodes.slice(0, 6).map((n) => (
                  <button
                    key={n.mint}
                    type="button"
                    onClick={() => handleSelectCoin(n.mint)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-[11px] font-mono transition-colors ${
                      selectedMint === n.mint
                        ? 'border border-blue-400 bg-blue-600/25 text-white'
                        : 'border border-slate-800 bg-[#070B14] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-slate-500">#{n.rank}</span>
                    <span className="font-semibold text-white">{n.symbol}</span>
                    <span className={n.momentum1h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {n.momentum1h >= 0 ? '+' : ''}
                      {n.momentum1h.toFixed(1)}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
