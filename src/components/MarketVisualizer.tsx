import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ExternalLink,
  Globe,
  Layers,
  MessageSquare,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  TrendingUp,
  Wallet,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { formatQuoteCurrency, formatUtcOrLocalTimestamp } from '../shared/currency';
import {
  comparePortfolioCandidates,
  evaluateCoinProfitabilitySignal,
  rankTokensForBubbleMap,
  type CoinProfitabilityAssessment,
  type ProfitabilitySignal,
  type VisualizerBubbleDatum,
  type VisualizerCohort,
  type VisualizerTimeframe,
} from '../shared/marketVisualizerLogic';
import type {
  OnChainTokenAudit,
  ParsedOnChainTx,
  RugRiskAssessment,
  SocialIntelligenceSummary,
  TokenMarketData,
  WhaleTransactionItem,
} from '../shared/types';
import { useAuth } from '../contexts/AuthContext';
import { RiskLevelTag } from './ui/RiskBadge';

interface MarketVisualizerProps {
  tokens: TokenMarketData[];
  loadingTokens: boolean;
  onSelectToken: (mint: string) => void;
  onInspectWallet: (address: string) => void;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  datum: VisualizerBubbleDatum;
  r: number;
  baseColor: string;
  lightColor: string;
  darkColor: string;
  elevationPx: number;
}

interface TokenDetailBundle {
  mint: string;
  audit: OnChainTokenAudit | null;
  social: SocialIntelligenceSummary | null;
  transactions: ParsedOnChainTx[];
  riskAssessment: RugRiskAssessment | null;
}

interface WebBriefState {
  loading: boolean;
  summary?: string;
  citations?: Array<{ title: string; uri: string }>;
  error?: string;
}

type InspectorSubTab = 'action' | 'trades' | 'social';

function formatCompactUsd(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '$0';
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function getSignalStyles(signal: ProfitabilitySignal): string {
  switch (signal) {
    case 'BUY_OPPORTUNITY':
      return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
    case 'ACCUMULATE':
      return 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300';
    case 'TRIM_PROFIT':
      return 'border-amber-500/40 bg-amber-500/15 text-amber-300';
    case 'SELL_RISK_EXIT':
    case 'AVOID_HIGH_RISK':
      return 'border-rose-500/40 bg-rose-500/15 text-rose-300';
    case 'HOLD_MONITOR':
    default:
      return 'border-slate-600/60 bg-slate-800/70 text-slate-200';
  }
}

export const MarketVisualizer: React.FC<MarketVisualizerProps> = ({
  tokens,
  loadingTokens,
  onSelectToken,
  onInspectWallet,
}) => {
  const {
    profile,
    fxRates,
    positions,
    managedAccounts,
    activeAccountId,
    isWatched,
    toggleWatchlist,
    executePaperOrder,
  } = useAuth();

  const activeAccount =
    managedAccounts.find((a) => a.id === activeAccountId) || managedAccounts[0];

  const [timeframe, setTimeframe] = useState<VisualizerTimeframe>('24h');
  const [cohort, setCohort] = useState<VisualizerCohort>('ALL');
  const [perspectiveMode, setPerspectiveMode] = useState<'3d' | 'pack'>('3d');
  const [bubbleLimit, setBubbleLimit] = useState<number>(32);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  const [hoveredInfo, setHoveredInfo] = useState<{
    datum: VisualizerBubbleDatum;
    x: number;
    y: number;
  } | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorSubTab>('action');

  // On-chain trades, social & audit data per token
  const [detailCache, setDetailCache] = useState<Record<string, TokenDetailBundle>>({});
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Global top whale feed merged into coin's top trades
  const [whaleFeed, setWhaleFeed] = useState<WhaleTransactionItem[]>([]);
  const [webBriefs, setWebBriefs] = useState<Record<string, WebBriefState>>({});

  // Quick Paper Trade simulator state
  const [paperAmountUsd, setPaperAmountUsd] = useState<number>(200);
  const [paperStatus, setPaperStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [executingPaper, setExecutingPaper] = useState<boolean>(false);

  // D3 SVG Refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const fitTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const [svgSize, setSvgSize] = useState<{ width: number; height: number }>({
    width: 820,
    height: 540,
  });

  // Load global whale swaps once for enriching per-coin Top Trades
  useEffect(() => {
    let active = true;
    fetch('/api/whales/feed?minUsd=250')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && Array.isArray(data?.items)) {
          setWhaleFeed(data.items);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Measure responsive SVG viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 120 && rect.height > 120) {
        setSvgSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Rank bubbles using decoupled pure logic
  const bubbles = useMemo(
    () =>
      rankTokensForBubbleMap({
        tokens,
        timeframe,
        cohort,
        searchQuery,
        limit: bubbleLimit,
      }),
    [tokens, timeframe, cohort, searchQuery, bubbleLimit]
  );

  // Maintain active selection defaulting cleanly to #1 top-volume coin
  useEffect(() => {
    if (bubbles.length === 0) return;
    if (!selectedMint || !bubbles.some((b) => b.token.mint === selectedMint)) {
      setSelectedMint(bubbles[0].token.mint);
    }
  }, [bubbles, selectedMint]);

  const activeBubble = useMemo(
    () => bubbles.find((b) => b.token.mint === selectedMint) || bubbles[0] || null,
    [bubbles, selectedMint]
  );

  const activeMint = activeBubble?.token.mint ?? null;

  // Fetch deep token bundle (/api/tokens/:mint) whenever activeMint changes
  useEffect(() => {
    if (!activeMint) return;
    if (detailCache[activeMint]) {
      setDetailError(null);
      return;
    }

    let active = true;
    setLoadingDetail(true);
    setDetailError(null);
    fetch(`/api/tokens/${encodeURIComponent(activeMint)}?timeframe=5m`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setDetailCache((prev) => ({
          ...prev,
          [activeMint]: {
            mint: activeMint,
            audit: data.audit || null,
            social: data.social || null,
            transactions: Array.isArray(data.transactions) ? data.transactions : [],
            riskAssessment: data.riskAssessment || null,
          },
        }));
      })
      .catch((err: any) => {
        if (active) setDetailError(err?.message || 'Unable to load token trades & social feed.');
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });

    return () => {
      active = false;
    };
  }, [activeMint, detailCache]);

  // Clear stale paper execution banner when switching coins
  useEffect(() => {
    setPaperStatus(null);
  }, [activeMint]);

  // Audits map for portfolio-fit comparison table
  const auditsByMint = useMemo(() => {
    const map: Record<string, OnChainTokenAudit | null> = {};
    for (const [k, v] of Object.entries(detailCache)) {
      map[k] = v.audit;
    }
    return map;
  }, [detailCache]);

  const portfolioComparisons = useMemo(
    () =>
      comparePortfolioCandidates({
        bubbles,
        positions,
        account: activeAccount,
        timeframe,
        auditsByMint,
      }),
    [bubbles, positions, activeAccount, timeframe, auditsByMint]
  );

  const selectedDetail = activeMint ? detailCache[activeMint] ?? null : null;

  const selectedAssessment: CoinProfitabilityAssessment | null = useMemo(() => {
    if (!activeBubble) return null;
    return evaluateCoinProfitabilitySignal({
      token: activeBubble.token,
      audit: selectedDetail?.audit ?? null,
      positions,
      account: activeAccount,
      timeframe,
    });
  }, [activeBubble, selectedDetail, positions, activeAccount, timeframe]);

  // Merge and sort top trades for selected coin (by USD notional desc, then recency)
  const topTradesForSelected = useMemo(() => {
    if (!activeMint) return [];
    const bundleTxs = selectedDetail?.transactions || [];
    const matchedWhales: ParsedOnChainTx[] = whaleFeed.filter((w) => w.mint === activeMint);

    const deduped = new Map<string, ParsedOnChainTx>();
    for (const tx of [...matchedWhales, ...bundleTxs]) {
      if (!tx.signature) continue;
      if (!deduped.has(tx.signature)) deduped.set(tx.signature, tx);
    }

    return Array.from(deduped.values())
      .sort((a, b) => {
        const usdDiff = (b.usdValue ?? 0) - (a.usdValue ?? 0);
        if (Math.abs(usdDiff) > 0.01) return usdDiff;
        return (b.blockTime ?? 0) - (a.blockTime ?? 0);
      })
      .slice(0, 18);
  }, [activeMint, selectedDetail, whaleFeed]);

  // D3.js 3D Bubble Map Rendering & Simulation
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const width = svgSize.width;
    const height = svgSize.height;
    const cx = width / 2;
    const cy = height / 2;

    if (bubbles.length === 0) return;

    // 1. D3 Scales: Volume -> Radius (sqrt scale) & Price Change -> Color
    const vols = bubbles.map((b) => b.volumeUsd);
    const minVol = d3.min(vols) ?? 1;
    const maxVol = Math.max(minVol + 1, d3.max(vols) ?? 1000);
    const maxRadius = Math.max(38, Math.min(72, Math.min(width, height) * 0.135));
    const minRadius = Math.max(15, Math.min(22, maxRadius * 0.34));

    const radiusScale = d3
      .scaleSqrt()
      .domain([minVol, maxVol])
      .range([minRadius, maxRadius])
      .clamp(true);

    const colorScale = d3
      .scaleLinear<string>()
      .domain([-30, -8, 0, 8, 30])
      .range(['#e11d48', '#be123c', '#334155', '#047857', '#10b981'])
      .clamp(true);

    // 2. SVG <defs>: 3D radial gradients for every bubble + background floor glow
    const defs = svg.append('defs');

    const bgGlow = defs
      .append('radialGradient')
      .attr('id', 'mv-stage-glow')
      .attr('cx', '50%')
      .attr('cy', '54%')
      .attr('r', '55%');
    bgGlow.append('stop').attr('offset', '0%').attr('stop-color', '#1d4ed8').attr('stop-opacity', 0.14);
    bgGlow.append('stop').attr('offset', '65%').attr('stop-color', '#0f172a').attr('stop-opacity', 0.05);
    bgGlow.append('stop').attr('offset', '100%').attr('stop-color', '#060a13').attr('stop-opacity', 0);

    const simNodes: SimNode[] = bubbles.map((datum, idx) => {
      const r = radiusScale(datum.volumeUsd);
      const baseHex = colorScale(datum.priceChangePct);
      const hsl = d3.hsl(baseHex);
      const lightHex = hsl.brighter(1.35).formatHex();
      const darkHex = hsl.darker(1.65).formatHex();
      const elevationPx = perspectiveMode === '3d' ? 8 + datum.elevationFactor * 24 : 3;

      const safeId = `sphere-${idx}-${datum.token.mint.slice(0, 6)}`;
      const grad = defs
        .append('radialGradient')
        .attr('id', safeId)
        .attr('cx', '35%')
        .attr('cy', '30%')
        .attr('r', '70%')
        .attr('fx', '30%')
        .attr('fy', '25%');
      grad.append('stop').attr('offset', '0%').attr('stop-color', '#ffffff').attr('stop-opacity', 0.88);
      grad.append('stop').attr('offset', '24%').attr('stop-color', lightHex).attr('stop-opacity', 0.96);
      grad.append('stop').attr('offset', '64%').attr('stop-color', baseHex).attr('stop-opacity', 0.98);
      grad.append('stop').attr('offset', '100%').attr('stop-color', darkHex).attr('stop-opacity', 1);

      // Deterministic golden-angle initial placement so re-renders feel smooth
      const angle = idx * 2.39996;
      const dist = Math.sqrt(idx + 1) * (maxRadius * 0.65);

      return {
        id: safeId,
        datum,
        r,
        baseColor: baseHex,
        lightColor: lightHex,
        darkColor: darkHex,
        elevationPx,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist * (perspectiveMode === '3d' ? 0.72 : 1),
      };
    });

    // 3. Stage & Zoomable Container
    svg
      .append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'url(#mv-stage-glow)');

    const zoomLayer = svg.append('g').attr('class', 'mv-zoom-layer');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.55, 3.2])
      .on('zoom', (event) => {
        zoomLayer.attr('transform', event.transform.toString());
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    // 4. 3D Perspective Floor Grid / Concentric Depth Rings
    const gridGroup = zoomLayer.append('g').attr('class', 'mv-perspective-grid').attr('pointer-events', 'none');
    if (perspectiveMode === '3d') {
      const floorY = cy + height * 0.06;
      [0.24, 0.42, 0.62, 0.82].forEach((scale) => {
        gridGroup
          .append('ellipse')
          .attr('cx', cx)
          .attr('cy', floorY)
          .attr('rx', width * 0.48 * scale)
          .attr('ry', height * 0.34 * scale)
          .attr('fill', 'none')
          .attr('stroke', '#1e293b')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '4 6');
      });
      // Cross perspective axis lines
      gridGroup
        .append('line')
        .attr('x1', cx - width * 0.42)
        .attr('y1', floorY)
        .attr('x2', cx + width * 0.42)
        .attr('y2', floorY)
        .attr('stroke', '#1e293b')
        .attr('stroke-width', 1);
      gridGroup
        .append('line')
        .attr('x1', cx)
        .attr('y1', floorY - height * 0.3)
        .attr('x2', cx)
        .attr('y2', floorY + height * 0.3)
        .attr('stroke', '#1e293b')
        .attr('stroke-width', 1);
    } else {
      [0.28, 0.56, 0.84].forEach((scale) => {
        gridGroup
          .append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', Math.min(width, height) * 0.44 * scale)
          .attr('fill', 'none')
          .attr('stroke', '#1e293b')
          .attr('stroke-width', 1);
      });
    }

    // 5. Run synchronous pre-settled D3 Force Simulation so 3D spheres never flicker or overlap
    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force('x', d3.forceX<SimNode>(cx).strength(perspectiveMode === '3d' ? 0.08 : 0.1))
      .force('y', d3.forceY<SimNode>(cy).strength(perspectiveMode === '3d' ? 0.13 : 0.1))
      .force(
        'collide',
        d3.forceCollide<SimNode>((d) => d.r + (perspectiveMode === '3d' ? 8 : 5)).iterations(4)
      )
      .stop();

    for (let i = 0; i < 160; i++) {
      simulation.tick();
    }

    // Sort nodes back-to-front by Y + elevation so lower/closer 3D spheres overlap naturally
    simNodes.sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

    // 6. Ground Cast Shadows Layer (behind spheres)
    const shadowsGroup = zoomLayer.append('g').attr('class', 'mv-shadows').attr('pointer-events', 'none');
    shadowsGroup
      .selectAll('ellipse')
      .data(simNodes)
      .join('ellipse')
      .attr('cx', (d) => (d.x ?? cx) + d.elevationPx * 0.18)
      .attr('cy', (d) => (d.y ?? cy) + d.r * 0.78 + d.elevationPx * 0.85)
      .attr('rx', (d) => d.r * 0.88)
      .attr('ry', (d) => Math.max(4, d.r * (perspectiveMode === '3d' ? 0.34 : 0.22)))
      .attr('fill', '#020617')
      .attr('fill-opacity', perspectiveMode === '3d' ? 0.58 : 0.35);

    // 7. 3D Bubble Spheres Layer
    const bubblesGroup = zoomLayer.append('g').attr('class', 'mv-bubbles');

    const nodeGroups = bubblesGroup
      .selectAll<SVGGElement, SimNode>('g.mv-bubble-node')
      .data(simNodes, (d) => d.datum.token.mint)
      .join('g')
      .attr('class', 'mv-bubble-node')
      .attr('transform', (d) => `translate(${d.x ?? cx}, ${(d.y ?? cy) - d.elevationPx * 0.35})`)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        setSelectedMint(d.datum.token.mint);
      })
      .on('pointerenter', function (event, d) {
        d3.select(this).raise();
        const rect = svgEl.getBoundingClientRect();
        setHoveredInfo({
          datum: d.datum,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      })
      .on('pointermove', (event, d) => {
        const rect = svgEl.getBoundingClientRect();
        setHoveredInfo({
          datum: d.datum,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      })
      .on('pointerleave', () => {
        setHoveredInfo(null);
      });

    // Outer Selection / Portfolio Halo Ring
    nodeGroups
      .append('circle')
      .attr('class', 'mv-selection-ring')
      .attr('r', (d) => d.r + 5)
      .attr('fill', 'none')
      .attr('stroke', (d) =>
        d.datum.token.mint === activeMint
          ? '#38bdf8'
          : positions.some((p) => p.mint === d.datum.token.mint)
            ? '#f59e0b'
            : 'transparent'
      )
      .attr('stroke-width', (d) => (d.datum.token.mint === activeMint ? 2.5 : 1.5))
      .attr('stroke-dasharray', (d) =>
        d.datum.token.mint === activeMint ? 'none' : '3 3'
      );

    // Main 3D Sphere Body
    nodeGroups
      .append('circle')
      .attr('class', 'mv-sphere-body')
      .attr('r', (d) => d.r)
      .attr('fill', (d) => `url(#${d.id})`)
      .attr('stroke', (d) =>
        d.datum.token.mint === activeMint ? '#e0f2fe' : 'rgba(255,255,255,0.22)'
      )
      .attr('stroke-width', (d) => (d.datum.token.mint === activeMint ? 1.8 : 0.9));

    // Specular Crescent Gloss Highlight (gives strong 3D glass/marble depth)
    nodeGroups
      .filter((d) => d.r >= 18)
      .append('ellipse')
      .attr('cx', (d) => -d.r * 0.28)
      .attr('cy', (d) => -d.r * 0.34)
      .attr('rx', (d) => d.r * 0.36)
      .attr('ry', (d) => d.r * 0.2)
      .attr('transform', 'rotate(-24)')
      .attr('fill', '#ffffff')
      .attr('fill-opacity', 0.22)
      .attr('pointer-events', 'none');

    // Text Labels inside bubbles
    nodeGroups
      .filter((d) => d.r >= 22)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => (d.r >= 34 ? '-0.3em' : '0.1em'))
      .attr('fill', '#ffffff')
      .attr('font-family', 'JetBrains Mono, ui-monospace, monospace')
      .attr('font-weight', '700')
      .attr('font-size', (d) => `${Math.max(10, Math.min(15, d.r * 0.32))}px`)
      .attr('pointer-events', 'none')
      .style('text-shadow', '0 1px 4px rgba(2,6,23,0.9)')
      .text((d) => d.datum.token.symbol.slice(0, d.r >= 40 ? 9 : 6));

    nodeGroups
      .filter((d) => d.r >= 28)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.95em')
      .attr('fill', (d) => (d.datum.priceChangePct >= 0 ? '#d1fae5' : '#ffe4e6'))
      .attr('font-family', 'JetBrains Mono, ui-monospace, monospace')
      .attr('font-weight', '600')
      .attr('font-size', (d) => `${Math.max(9, Math.min(12, d.r * 0.24))}px`)
      .attr('pointer-events', 'none')
      .style('text-shadow', '0 1px 3px rgba(2,6,23,0.95)')
      .text(
        (d) =>
          `${d.datum.priceChangePct >= 0 ? '+' : ''}${d.datum.priceChangePct.toFixed(1)}%`
      );

    nodeGroups
      .filter((d) => d.r >= 46)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '2.15em')
      .attr('fill', '#e2e8f0')
      .attr('font-family', 'JetBrains Mono, ui-monospace, monospace')
      .attr('font-size', '10px')
      .attr('pointer-events', 'none')
      .style('text-shadow', '0 1px 3px rgba(2,6,23,0.95)')
      .text((d) => formatCompactUsd(d.datum.volumeUsd));

    // 8. Fit entire 3D sphere cluster cleanly inside padded viewport so zero bubbles clip
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const d of simNodes) {
      const nx = d.x ?? cx;
      const nyTop = (d.y ?? cy) - d.elevationPx * 0.35 - d.r - 8;
      const nyBot = (d.y ?? cy) + d.r * 0.85 + d.elevationPx * 0.9;
      if (nx - d.r - 8 < minX) minX = nx - d.r - 8;
      if (nx + d.r + 8 > maxX) maxX = nx + d.r + 8;
      if (nyTop < minY) minY = nyTop;
      if (nyBot > maxY) maxY = nyBot;
    }
    const pad = 18;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const fitScale = Math.min(1, (width - pad * 2) / spanX, (height - pad * 2) / spanY);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const initialTransform = d3.zoomIdentity
      .translate(cx - midX * fitScale, cy - midY * fitScale)
      .scale(fitScale);
    fitTransformRef.current = initialTransform;
    svg.call(zoom.transform, initialTransform);
  }, [bubbles, svgSize, perspectiveMode, activeMint, positions]);

  const handleZoomControl = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(220)
      .call(zoomBehaviorRef.current.scaleBy, factor);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(260)
      .call(zoomBehaviorRef.current.transform, fitTransformRef.current);
  };

  const handlePaperTrade = async (side: 'BUY' | 'SELL', customAmount?: number) => {
    if (!activeBubble) return;
    setExecutingPaper(true);
    setPaperStatus(null);
    try {
      const heldPos = positions.find((p) => p.mint === activeBubble.token.mint);
      const amount =
        side === 'BUY'
          ? customAmount ?? paperAmountUsd
          : customAmount ?? (heldPos ? heldPos.quantity * 0.5 : 0);

      const res = await executePaperOrder({
        token: activeBubble.token,
        side,
        usdOrQtyAmount: amount,
        slippageBps: 100,
      });
      if (res.ok) {
        setPaperStatus({
          ok: true,
          msg:
            side === 'BUY'
              ? `Simulated Paper Buy $${amount.toFixed(0)} of ${activeBubble.token.symbol} executed.`
              : `Simulated Paper Sell of ${activeBubble.token.symbol} executed.`,
        });
      } else {
        setPaperStatus({ ok: false, msg: res.error || 'Paper order could not execute.' });
      }
    } finally {
      setExecutingPaper(false);
    }
  };

  const handleRunWebCatalystSearch = async () => {
    if (!activeBubble) return;
    const tok = activeBubble.token;
    setWebBriefs((prev) => ({ ...prev, [tok.mint]: { loading: true } }));
    try {
      const res = await fetch('/api/ai/search-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint: tok.mint,
          symbol: tok.symbol,
          name: tok.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search grounding failed');
      setWebBriefs((prev) => ({
        ...prev,
        [tok.mint]: {
          loading: false,
          summary: data.summary,
          citations: data.citations || [],
        },
      }));
    } catch (err: any) {
      setWebBriefs((prev) => ({
        ...prev,
        [tok.mint]: {
          loading: false,
          error: err?.message || 'Unable to run web social search.',
        },
      }));
    }
  };

  const heldPosition = activeBubble
    ? positions.find((p) => p.mint === activeBubble.token.mint) || null
    : null;
  const activeBrief = activeMint ? webBriefs[activeMint] : undefined;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
            D3.JS 3D VOLUME TOPOLOGY · PORTFOLIO &amp; SOCIAL INTELLIGENCE
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-white">
            Market Visualizer — Top Volume 3D Bubble Map
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Bubble area scales by live Solana DEX volume · Color encodes % price movement · Click any sphere for Top Trades, Social Buzz &amp; Portfolio Buy/Sell fit
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="rounded-lg border border-slate-800 bg-[#0D1322] px-3 py-1.5 font-mono text-slate-300 tabular-nums">
            Paper Desk: ${profile.paperBalanceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} ·{' '}
            {activeAccount?.riskProfile || 'BALANCED'}
          </div>
        </div>
      </div>

      {/* Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0D1322] p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Selector */}
          <div className="flex items-center rounded-lg border border-slate-800 bg-[#070B14] p-0.5">
            {(['5m', '1h', '6h', '24h'] as VisualizerTimeframe[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors whitespace-nowrap ${
                  timeframe === tf
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Cohort Filter */}
          <div className="flex items-center rounded-lg border border-slate-800 bg-[#070B14] p-0.5">
            {(
              [
                { id: 'ALL', label: 'All Top Vol' },
                { id: 'GAINERS', label: 'Gainers' },
                { id: 'LOSERS', label: 'Losers' },
                { id: 'GRADUATED', label: 'Graduated' },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCohort(c.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  cohort === c.id
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Perspective Toggle */}
          <button
            type="button"
            onClick={() => setPerspectiveMode((m) => (m === '3d' ? 'pack' : '3d'))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#070B14] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500/60 whitespace-nowrap"
          >
            <Layers className="h-3.5 w-3.5 text-cyan-400" />
            {perspectiveMode === '3d' ? '3D Isometric Spheres' : '2D Cluster Pack'}
          </button>

          {/* Bubble Count */}
          <select
            aria-label="Top coins limit"
            value={bubbleLimit}
            onChange={(e) => setBubbleLimit(Number(e.target.value))}
            className="rounded-lg border border-slate-800 bg-[#070B14] px-2.5 py-1.5 font-mono text-xs text-slate-200"
          >
            <option value={20}>Top 20</option>
            <option value={32}>Top 32</option>
            <option value={48}>Top 48</option>
          </select>
        </div>

        {/* Search + Zoom */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              aria-label="Filter bubbles by token symbol or mint"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter symbol..."
              className="w-36 rounded-lg border border-slate-800 bg-[#070B14] py-1.5 pl-8 pr-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none sm:w-44"
            />
          </div>

          <button
            type="button"
            onClick={() => handleZoomControl(1.25)}
            aria-label="Zoom in bubble map"
            className="rounded-lg border border-slate-800 bg-[#070B14] p-1.5 text-slate-300 hover:text-white"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleZoomControl(0.8)}
            aria-label="Zoom out bubble map"
            className="rounded-lg border border-slate-800 bg-[#070B14] p-1.5 text-slate-300 hover:text-white"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            aria-label="Reset bubble map zoom"
            className="rounded-lg border border-slate-800 bg-[#070B14] p-1.5 text-slate-300 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main Split Workspace: D3 3D Bubble Map (left 7 cols) + Coin Deep Inspector (right 5 cols) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: D3 3D Bubble Canvas */}
        <div className="xl:col-span-7 flex flex-col rounded-xl border border-slate-800 bg-[#070B14] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-[#0A0F1C] px-4 py-2.5 text-[11px] text-slate-400">
            <div className="flex items-center gap-3">
              <span className="font-mono text-slate-200 tabular-nums">
                {bubbles.length} tokens · {timeframe.toUpperCase()} Volume
              </span>
              <span>Drag to pan · Scroll to zoom · Click sphere to inspect</span>
            </div>
            {/* Color Legend */}
            <div className="flex items-center gap-2 font-mono text-[10px]">
              <span className="text-rose-400">-30%</span>
              <span className="h-2 w-24 rounded-full bg-gradient-to-r from-rose-600 via-slate-600 to-emerald-500" />
              <span className="text-emerald-400">+30%</span>
            </div>
          </div>

          <div
            ref={containerRef}
            className="relative h-[420px] sm:h-[520px] w-full select-none bg-[#060A13]"
          >
            {loadingTokens && bubbles.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6">
                <div className="space-y-3 text-center">
                  <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-slate-800/80" />
                  <div className="text-xs text-slate-400">Syncing live Solana volume topology...</div>
                </div>
              </div>
            ) : bubbles.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <p className="text-sm font-medium text-slate-200">
                  No tokens match the current filter criteria.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Reset the cohort filter or search term to view today&apos;s top volume spheres.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCohort('ALL');
                    setSearchQuery('');
                  }}
                  className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <svg
                ref={svgRef}
                width={svgSize.width}
                height={svgSize.height}
                role="img"
                aria-label="D3 3D volume bubble map of top Solana tokens"
                className="block h-full w-full"
              />
            )}

            {/* Interactive Hover Tooltip */}
            {hoveredInfo && (
              <div
                style={{
                  left: Math.min(svgSize.width - 210, Math.max(12, hoveredInfo.x + 14)),
                  top: Math.max(12, hoveredInfo.y - 18),
                }}
                className="pointer-events-none absolute z-20 w-48 rounded-lg border border-slate-700 bg-[#0A0F1C]/95 p-2.5 shadow-xl backdrop-blur-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-white">
                    {hoveredInfo.datum.token.symbol}
                  </span>
                  <span
                    className={`font-mono text-xs font-semibold tabular-nums ${
                      hoveredInfo.datum.priceChangePct >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {hoveredInfo.datum.priceChangePct >= 0 ? '+' : ''}
                    {hoveredInfo.datum.priceChangePct.toFixed(2)}%
                  </span>
                </div>
                <div className="mt-1 space-y-0.5 font-mono text-[11px] text-slate-300 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{timeframe} Vol</span>
                    <span>{formatCompactUsd(hoveredInfo.datum.volumeUsd)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Liquidity</span>
                    <span>{formatCompactUsd(hoveredInfo.datum.token.liquidityUsd)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">MCap</span>
                    <span>{formatCompactUsd(hoveredInfo.datum.token.marketCapUsd)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Selected Coin Deep Inspector (Buy/Sell Signal + Top Trades + Social Media) */}
        <div className="xl:col-span-5 flex flex-col rounded-xl border border-slate-800 bg-[#0D1322] overflow-hidden">
          {!activeBubble || !selectedAssessment ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-xs text-slate-400">
              Select any token bubble to inspect Top Trades, Social Sentiment, and Portfolio Buy/Sell guidance.
            </div>
          ) : (
            <>
              {/* Coin Header */}
              <div className="border-b border-slate-800/80 bg-[#0A0F1C] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {activeBubble.token.imageUrl ? (
                      <img
                        src={activeBubble.token.imageUrl}
                        alt={activeBubble.token.symbol}
                        referrerPolicy="no-referrer"
                        className="h-10 w-10 rounded-full object-cover bg-slate-800 shrink-0"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600/20 font-mono text-xs font-bold text-blue-300">
                        {activeBubble.token.symbol.slice(0, 2)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-display text-lg font-bold text-white">
                          {activeBubble.token.symbol}
                        </h2>
                        <RiskLevelTag level={selectedAssessment.riskLevel} />
                      </div>
                      <div className="truncate text-xs text-slate-400">
                        {activeBubble.token.name} · {activeBubble.token.dexId}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleWatchlist(activeBubble.token)}
                      aria-label={isWatched(activeBubble.token.mint) ? 'Remove from watchlist' : 'Add to watchlist'}
                      className={`rounded-lg border p-2 text-xs transition-colors ${
                        isWatched(activeBubble.token.mint)
                          ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                          : 'border-slate-700 bg-[#070B14] text-slate-400 hover:text-white'
                      }`}
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectToken(activeBubble.token.mint)}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-600/15 px-2.5 py-1.5 text-xs font-medium text-blue-200 hover:bg-blue-600/25 whitespace-nowrap"
                    >
                      Full Analytics
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Key Live Metrics Row */}
                <div className="mt-3 grid grid-cols-4 gap-2 border-t border-slate-800/70 pt-3 font-mono tabular-nums">
                  <div>
                    <div className="text-[10px] text-slate-500">PRICE</div>
                    <div className="text-xs font-semibold text-white">
                      {formatQuoteCurrency(activeBubble.token.priceUsd, profile.quoteCurrency, fxRates)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">{timeframe.toUpperCase()} CHG</div>
                    <div
                      className={`text-xs font-semibold ${
                        activeBubble.priceChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {activeBubble.priceChangePct >= 0 ? '+' : ''}
                      {activeBubble.priceChangePct.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">{timeframe.toUpperCase()} VOL</div>
                    <div className="text-xs font-semibold text-white">
                      {formatCompactUsd(activeBubble.volumeUsd)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">LIQUIDITY</div>
                    <div className="text-xs font-semibold text-white">
                      {formatCompactUsd(activeBubble.token.liquidityUsd)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sub-Navigation Tabs inside Inspector */}
              <div className="grid grid-cols-3 border-b border-slate-800 bg-[#0A0F1C] text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setInspectorTab('action')}
                  className={`flex items-center justify-center gap-1.5 border-b-2 py-2.5 whitespace-nowrap transition-colors ${
                    inspectorTab === 'action'
                      ? 'border-cyan-400 text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Buy / Sell Signal
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab('trades')}
                  className={`flex items-center justify-center gap-1.5 border-b-2 py-2.5 whitespace-nowrap transition-colors ${
                    inspectorTab === 'trades'
                      ? 'border-cyan-400 text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Activity className="h-3.5 w-3.5" />
                  Top Trades ({topTradesForSelected.length})
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab('social')}
                  className={`flex items-center justify-center gap-1.5 border-b-2 py-2.5 whitespace-nowrap transition-colors ${
                    inspectorTab === 'social'
                      ? 'border-cyan-400 text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Social ({selectedDetail?.social?.mentionsCount ?? '—'})
                </button>
              </div>

              {/* Tab Content Body */}
              <div className="flex-1 space-y-4 overflow-y-auto p-4 max-h-[430px]">
                {detailError && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
                    {detailError}
                  </div>
                )}

                {/* TAB 1: BUY / SELL PROFITABILITY & PORTFOLIO FIT */}
                {inspectorTab === 'action' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] text-slate-400">
                          Portfolio Decision Signal ({activeAccount?.riskProfile || 'BALANCED'})
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded border px-2.5 py-1 font-mono text-xs font-bold ${getSignalStyles(
                              selectedAssessment.signal
                            )}`}
                          >
                            {selectedAssessment.signalLabel}
                          </span>
                          <span className="font-mono text-xs text-slate-300 tabular-nums">
                            Fit {selectedAssessment.portfolioFitScore}/100
                          </span>
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums">
                        <div className="text-[10px] text-slate-400">RISK / REWARD</div>
                        <div className="text-sm font-bold text-white">
                          1 : {selectedAssessment.riskRewardRatio.toFixed(1)}
                        </div>
                      </div>
                    </div>

                    {/* Held Position Status if any */}
                    {heldPosition && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs">
                        <div className="flex items-center justify-between font-mono tabular-nums">
                          <span className="font-semibold text-amber-200">
                            In Your Paper Portfolio ({heldPosition.symbol})
                          </span>
                          <span
                            className={
                              (selectedAssessment.heldUnrealizedPnlPct ?? 0) >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }
                          >
                            {(selectedAssessment.heldUnrealizedPnlPct ?? 0) >= 0 ? '+' : ''}
                            {selectedAssessment.heldUnrealizedPnlPct?.toFixed(2)}%
                          </span>
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-slate-300 tabular-nums">
                          Value: ${selectedAssessment.heldPositionValueUsd.toFixed(2)} · Avg Entry:{' '}
                          {formatQuoteCurrency(
                            heldPosition.avgEntryPriceUsd,
                            profile.quoteCurrency,
                            fxRates
                          )}
                        </div>
                      </div>
                    )}

                    {/* Entry / SL / TP Matrix */}
                    <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-800 bg-[#070B14] p-3 font-mono tabular-nums">
                      <div>
                        <div className="text-[10px] text-slate-500">REF ENTRY</div>
                        <div className="mt-0.5 text-xs font-semibold text-white">
                          {formatQuoteCurrency(
                            selectedAssessment.entryPriceUsd,
                            profile.quoteCurrency,
                            fxRates
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-rose-400">
                          STOP (-{selectedAssessment.stopLossPct}%)
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-rose-300">
                          {formatQuoteCurrency(
                            selectedAssessment.stopLossPriceUsd,
                            profile.quoteCurrency,
                            fxRates
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-emerald-400">
                          TARGET (+{selectedAssessment.estimatedUpsidePct}%)
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-emerald-300">
                          {formatQuoteCurrency(
                            selectedAssessment.takeProfitPriceUsd,
                            profile.quoteCurrency,
                            fxRates
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Order Flow Pressure Bar */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
                        <span>
                          Order Flow ({timeframe.toUpperCase()}): {activeBubble.buyCount} Buys /{' '}
                          {activeBubble.sellCount} Sells
                        </span>
                        <span className="text-slate-200">
                          {selectedAssessment.buyPressurePct !== null
                            ? `${selectedAssessment.buyPressurePct}% Buy`
                            : 'Data unavailable'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-rose-500/40">
                        <div
                          className="bg-emerald-500 transition-all"
                          style={{
                            width: `${selectedAssessment.buyPressurePct ?? 50}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Signal Reasons & Risk Caveats */}
                    <div className="space-y-2 text-xs">
                      {selectedAssessment.reasons.map((r, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-slate-800 bg-[#070B14] px-3 py-2 text-slate-200"
                        >
                          {r}
                        </div>
                      ))}
                      {selectedAssessment.riskWarnings.slice(0, 3).map((w, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200"
                        >
                          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>

                    {/* Simulated Paper Execution Box */}
                    <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3 space-y-2.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-200">
                          Paper Trade Execution Test
                        </span>
                        <span className="text-slate-500">Educational simulation only</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1 rounded border border-slate-800 bg-[#0A0F1C] px-2 py-1 font-mono text-xs text-white">
                          <span className="text-slate-500">$</span>
                          <input
                            type="number"
                            min={10}
                            step={50}
                            aria-label="Paper trade USD amount"
                            value={paperAmountUsd}
                            onChange={(e) => setPaperAmountUsd(Math.max(1, Number(e.target.value)))}
                            className="w-16 bg-transparent text-xs focus:outline-none tabular-nums"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={executingPaper || selectedAssessment.overriddenByCriticalRisk}
                          onClick={() => handlePaperTrade('BUY')}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap"
                        >
                          Simulate Buy
                        </button>
                        {heldPosition && (
                          <>
                            <button
                              type="button"
                              disabled={executingPaper}
                              onClick={() => handlePaperTrade('SELL', heldPosition.quantity * 0.5)}
                              className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 whitespace-nowrap"
                            >
                              Sell 50%
                            </button>
                            <button
                              type="button"
                              disabled={executingPaper}
                              onClick={() => handlePaperTrade('SELL', heldPosition.quantity)}
                              className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 whitespace-nowrap"
                            >
                              Exit 100%
                            </button>
                          </>
                        )}
                      </div>

                      {paperStatus && (
                        <div
                          className={`text-[11px] font-medium ${
                            paperStatus.ok ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {paperStatus.msg}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: ALL TOP TRADES FOR THIS COIN */}
                {inspectorTab === 'trades' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Largest &amp; most recent on-chain swaps for {activeBubble.token.symbol}</span>
                      {loadingDetail && <span className="font-mono text-[11px] text-cyan-400">Loading swaps...</span>}
                    </div>

                    {loadingDetail && topTradesForSelected.length === 0 ? (
                      <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-800/60" />
                        ))}
                      </div>
                    ) : topTradesForSelected.length === 0 ? (
                      <div className="rounded-lg border border-slate-800 bg-[#070B14] p-5 text-center text-xs text-slate-400">
                        No parsed RPC swap transactions returned for this mint window yet. Open Full Analytics to inspect raw mint signatures.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-[#070B14]">
                        {topTradesForSelected.map((tx) => (
                          <div
                            key={tx.signature}
                            className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                                  tx.type === 'BUY'
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : tx.type === 'SELL'
                                      ? 'bg-rose-500/15 text-rose-400'
                                      : 'bg-slate-700/60 text-slate-300'
                                }`}
                              >
                                {tx.type === 'BUY' ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : tx.type === 'SELL' ? (
                                  <ArrowDownRight className="h-3 w-3" />
                                ) : null}
                                {tx.type}
                              </span>
                              <div className="min-w-0">
                                {tx.walletAddress ? (
                                  <button
                                    type="button"
                                    onClick={() => onInspectWallet(tx.walletAddress!)}
                                    className="font-mono text-[11px] text-blue-400 hover:underline truncate"
                                  >
                                    {tx.walletAddress.slice(0, 5)}..{tx.walletAddress.slice(-5)}
                                  </button>
                                ) : (
                                  <span className="font-mono text-[11px] text-slate-500">
                                    Signer unavailable
                                  </span>
                                )}
                                <div className="text-[10px] text-slate-500 tabular-nums">
                                  {tx.blockTime
                                    ? formatUtcOrLocalTimestamp(
                                        new Date(tx.blockTime * 1000).toISOString(),
                                        profile.timezone
                                      )
                                    : 'Recent block'}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0 text-right font-mono tabular-nums">
                              <div>
                                <div className="text-xs font-semibold text-white">
                                  {tx.usdValue !== null
                                    ? formatQuoteCurrency(tx.usdValue, profile.quoteCurrency, fxRates)
                                    : tx.solAmount !== null
                                      ? `${tx.solAmount.toFixed(2)} SOL`
                                      : 'Swap'}
                                </div>
                                {tx.solAmount !== null && tx.usdValue !== null && (
                                  <div className="text-[10px] text-slate-400">
                                    {tx.solAmount.toFixed(2)} SOL
                                  </div>
                                )}
                              </div>
                              <a
                                href={tx.solscanUrl}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="View transaction on Solscan"
                                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: SOCIAL MEDIA & WEB CATALYST */}
                {inspectorTab === 'social' && (
                  <div className="space-y-3">
                    {loadingDetail && !selectedDetail?.social ? (
                      <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-800/60" />
                        ))}
                      </div>
                    ) : (
                      <>
                        {/* Sentiment Summary */}
                        <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-[10px] font-mono uppercase text-slate-500">
                                SOCIAL SENTIMENT SCORE
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 font-mono">
                                <span className="text-base font-bold text-white tabular-nums">
                                  {selectedDetail?.social
                                    ? `${selectedDetail.social.sentimentScore > 0 ? '+' : ''}${
                                        selectedDetail.social.sentimentScore
                                      }`
                                    : 'N/A'}
                                </span>
                                <span
                                  className={`text-xs font-semibold ${
                                    selectedDetail?.social?.sentimentLabel === 'BULLISH'
                                      ? 'text-emerald-400'
                                      : selectedDetail?.social?.sentimentLabel === 'BEARISH'
                                        ? 'text-rose-400'
                                        : 'text-slate-300'
                                  }`}
                                >
                                  {selectedDetail?.social?.sentimentLabel || 'INSUFFICIENT_DATA'}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={activeBrief?.loading}
                              onClick={handleRunWebCatalystSearch}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600/15 px-2.5 py-1.5 text-[11px] font-medium text-indigo-200 hover:bg-indigo-600/25 disabled:opacity-50 whitespace-nowrap"
                            >
                              <Globe className="h-3.5 w-3.5" />
                              {activeBrief?.loading ? 'Searching Web...' : 'Web Catalyst Search'}
                            </button>
                          </div>

                          {selectedDetail?.social?.manipulationWarning && (
                            <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
                              {selectedDetail.social.manipulationWarning}
                            </div>
                          )}

                          {selectedDetail?.social?.trendingKeywords &&
                            selectedDetail.social.trendingKeywords.length > 0 && (
                              <div className="mt-2 text-[11px] text-slate-400">
                                Keywords:{' '}
                                <span className="font-mono text-slate-200">
                                  {selectedDetail.social.trendingKeywords.slice(0, 6).join(' · ')}
                                </span>
                              </div>
                            )}
                        </div>

                        {/* Platform Source Connection Grid */}
                        {selectedDetail?.social?.sources && (
                          <div className="grid grid-cols-2 gap-2">
                            {selectedDetail.social.sources.map((src) => (
                              <div
                                key={src.platform}
                                className="rounded-lg border border-slate-800 bg-[#070B14] p-2 text-[11px]"
                              >
                                <div className="flex items-center justify-between font-medium text-slate-200">
                                  <span>{src.platform}</span>
                                  <span
                                    className={`font-mono text-[10px] ${
                                      src.connected ? 'text-emerald-400' : 'text-slate-500'
                                    }`}
                                  >
                                    {src.mode}
                                  </span>
                                </div>
                                <div className="mt-0.5 truncate text-[10px] text-slate-500">
                                  {src.message}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Grounded Web Brief Output */}
                        {activeBrief?.summary && (
                          <div className="rounded-lg border border-indigo-500/30 bg-indigo-950/20 p-3 text-xs text-slate-200 space-y-2">
                            <div className="flex items-center gap-1.5 font-semibold text-indigo-300">
                              <Sparkles className="h-3.5 w-3.5" />
                              Live Web Narrative Brief
                            </div>
                            <p className="leading-relaxed text-[11px] text-slate-300">
                              {activeBrief.summary}
                            </p>
                            {activeBrief.citations && activeBrief.citations.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {activeBrief.citations.slice(0, 4).map((c, idx) => (
                                  <a
                                    key={idx}
                                    href={c.uri}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:underline"
                                  >
                                    {c.title || 'Source'}
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {activeBrief?.error && (
                          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11px] text-rose-300">
                            {activeBrief.error}
                          </div>
                        )}

                        {/* Live Mentions Feed */}
                        {selectedDetail?.social?.mentions &&
                        selectedDetail.social.mentions.length > 0 ? (
                          <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-[#070B14]">
                            {selectedDetail.social.mentions.slice(0, 8).map((m) => (
                              <a
                                key={m.id}
                                href={m.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block p-2.5 hover:bg-slate-800/40 transition-colors"
                              >
                                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                                  <span>
                                    {m.platform} · {m.author}
                                  </span>
                                  <span
                                    className={
                                      m.sentiment === 'POSITIVE'
                                        ? 'text-emerald-400'
                                        : m.sentiment === 'NEGATIVE'
                                          ? 'text-rose-400'
                                          : 'text-slate-400'
                                    }
                                  >
                                    {m.sentiment} · {m.score} pts
                                  </span>
                                </div>
                                <div className="mt-1 text-xs font-medium text-slate-200 line-clamp-2">
                                  {m.title}
                                </div>
                              </a>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-slate-800 bg-[#070B14] p-4 text-center text-xs text-slate-400">
                            No public social posts matched {activeBubble.token.symbol} in this query window. Use Web Catalyst Search above for live web coverage.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom Portfolio Comparison Matrix: Which Coin Fits Your Portfolio Better */}
      <div className="rounded-xl border border-slate-800 bg-[#0D1322] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#0A0F1C] px-4 py-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            <div>
              <h2 className="font-display text-sm font-bold text-white">
                Best Portfolio Fit &amp; Buy/Sell Comparison ({activeAccount?.name || 'Paper Desk'})
              </h2>
              <p className="text-[11px] text-slate-400">
                Ranked by risk-adjusted portfolio fit using {activeAccount?.riskProfile || 'BALANCED'} rules (Stop -{activeAccount?.stopLossPct ?? 15}% / Target +{activeAccount?.takeProfitPct ?? 35}%). Click any row to highlight sphere.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400 tabular-nums">
            <Wallet className="h-3.5 w-3.5 text-amber-400" />
            <span>{positions.length} open paper positions</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-[#070B14] font-mono text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Rank</th>
                <th className="px-4 py-2.5">Coin</th>
                <th className="px-4 py-2.5 text-right">Portfolio Fit</th>
                <th className="px-4 py-2.5 text-right">{timeframe.toUpperCase()} Vol</th>
                <th className="px-4 py-2.5 text-right">{timeframe.toUpperCase()} Move</th>
                <th className="px-4 py-2.5 text-right">Liquidity</th>
                <th className="px-4 py-2.5 text-right">Buy Flow</th>
                <th className="px-4 py-2.5">Portfolio Status</th>
                <th className="px-4 py-2.5">Signal &amp; Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
              {portfolioComparisons.slice(0, 15).map((item, idx) => {
                const bubble = bubbles.find((b) => b.token.mint === item.mint);
                if (!bubble) return null;
                const isSelected = item.mint === activeMint;

                return (
                  <tr
                    key={item.mint}
                    onClick={() => setSelectedMint(item.mint)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-600/15 hover:bg-blue-600/20'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="px-4 py-2.5 text-slate-400">#{idx + 1}</td>
                    <td className="px-4 py-2.5 font-sans">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white">{item.symbol}</span>
                        <span className="truncate max-w-[120px] text-[11px] text-slate-400">
                          {item.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`font-bold ${
                          item.portfolioFitScore >= 70
                            ? 'text-emerald-400'
                            : item.portfolioFitScore >= 50
                              ? 'text-cyan-300'
                              : 'text-rose-400'
                        }`}
                      >
                        {item.portfolioFitScore}/100
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-200">
                      {formatCompactUsd(bubble.volumeUsd)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-semibold ${
                        bubble.priceChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {bubble.priceChangePct >= 0 ? '+' : ''}
                      {bubble.priceChangePct.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-300">
                      {formatCompactUsd(bubble.token.liquidityUsd)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-300">
                      {item.buyPressurePct !== null ? `${item.buyPressurePct}%` : '—'}
                    </td>
                    <td className="px-4 py-2.5 font-sans">
                      {item.inUserPortfolio ? (
                        <span className="text-[11px] font-medium text-amber-300">
                          Held (${item.heldPositionValueUsd.toFixed(0)} ·{' '}
                          {item.heldUnrealizedPnlPct !== null &&
                            `${item.heldUnrealizedPnlPct >= 0 ? '+' : ''}${item.heldUnrealizedPnlPct.toFixed(1)}%`}
                          )
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">Candidate</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${getSignalStyles(
                            item.signal
                          )}`}
                        >
                          {item.signalLabel}
                        </span>
                        <RiskLevelTag level={item.riskLevel} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {portfolioComparisons.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center font-sans text-xs text-slate-400">
                    Waiting for live volume pairs to populate portfolio comparison matrix.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
