import type { TokenMarketData } from './types.ts';
import { isGraduatedToken } from './marketAnalytics.ts';

function isRecentLaunch(token: TokenMarketData, maxHours = 72): boolean {
  if (!token.pairCreatedAt) return false;
  return Date.now() - token.pairCreatedAt <= maxHours * 3600_000;
}

export type CoinMapMetric = 'mcap' | 'volume24h' | 'liquidity';
export type CoinMapCategory = 'ALL' | 'GAINERS' | 'GRADUATED' | 'NEW';
export type CoinMapCameraPreset = 'OVERVIEW' | 'CROWN' | 'GAINERS' | 'RESET';

export interface CoinMonumentNode {
  mint: string;
  symbol: string;
  name: string;
  rank: number;
  tier: 'CROWN' | 'MID' | 'OUTER';
  position: [number, number, number];
  monumentHeight: number;
  pedestalRadius: number;
  spireRadius: number;
  orbitSpeed: number;
  metricValue: number;
  momentum1h: number;
  momentum24h: number;
  accentHex: string;
  rimHex: string;
  sectorLabel: 'CROWN_LEADER' | 'GRADUATED_POOL' | 'BONDING_CURVE' | 'NEW_LAUNCH';
  token: TokenMarketData;
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~2.39996 rad

export function getTokenMetricValue(token: TokenMarketData, metric: CoinMapMetric): number {
  if (metric === 'volume24h') return Math.max(0, token.volume24hUsd || 0);
  if (metric === 'liquidity') return Math.max(0, token.liquidityUsd || 0);
  return Math.max(0, token.marketCapUsd || token.fdvUsd || 0);
}

export function filterCoinsForMap(
  tokens: TokenMarketData[],
  category: CoinMapCategory,
  metric: CoinMapMetric,
  maxCoins = 32
): TokenMarketData[] {
  const deduped = new Map<string, TokenMarketData>();
  for (const t of tokens) {
    if (!t.mint || t.priceUsd <= 0) continue;
    const existing = deduped.get(t.mint);
    if (!existing || t.volume24hUsd > existing.volume24hUsd) {
      deduped.set(t.mint, t);
    }
  }

  let list = Array.from(deduped.values());

  if (category === 'GAINERS') {
    const positive = list.filter((t) => (t.priceChange1h || 0) > 0 || (t.priceChange24h || 0) > 0);
    if (positive.length > 0) list = positive;
    list.sort((a, b) => (b.priceChange1h || 0) - (a.priceChange1h || 0));
  } else if (category === 'GRADUATED') {
    const grad = list.filter((t) => isGraduatedToken(t));
    if (grad.length > 0) list = grad;
    list.sort((a, b) => getTokenMetricValue(b, metric) - getTokenMetricValue(a, metric));
  } else if (category === 'NEW') {
    const recent = list.filter((t) => isRecentLaunch(t, 72));
    if (recent.length > 0) list = recent;
    list.sort((a, b) => (b.pairCreatedAt ?? 0) - (a.pairCreatedAt ?? 0));
  } else {
    list.sort((a, b) => {
      const diff = getTokenMetricValue(b, metric) - getTokenMetricValue(a, metric);
      if (diff !== 0) return diff;
      return (b.volume24hUsd || 0) - (a.volume24hUsd || 0);
    });
  }

  return list.slice(0, Math.max(1, maxCoins));
}

function getMomentumColors(change1h: number, isGraduated: boolean): { accentHex: string; rimHex: string } {
  if (change1h >= 5) {
    return { accentHex: '#10b981', rimHex: '#34d399' };
  }
  if (change1h >= 0) {
    return isGraduated
      ? { accentHex: '#38bdf8', rimHex: '#60a5fa' }
      : { accentHex: '#22d3ee', rimHex: '#38bdf8' };
  }
  if (change1h > -5) {
    return { accentHex: '#f59e0b', rimHex: '#fbbf24' };
  }
  return { accentHex: '#f43f5e', rimHex: '#fb7185' };
}

export function buildCoinMapLayout(
  tokens: TokenMarketData[],
  options: {
    metric?: CoinMapMetric;
    category?: CoinMapCategory;
    maxCoins?: number;
  } = {}
): CoinMonumentNode[] {
  const metric = options.metric ?? 'mcap';
  const category = options.category ?? 'ALL';
  const maxCoins = options.maxCoins ?? 32;

  const selected = filterCoinsForMap(tokens, category, metric, maxCoins);
  if (selected.length === 0) return [];

  const metricValues = selected.map((t) => getTokenMetricValue(t, metric));
  const positiveVals = metricValues.filter((v) => v > 0);
  const minVal = positiveVals.length ? Math.min(...positiveVals) : 1;
  const maxVal = positiveVals.length ? Math.max(...positiveVals) : 10;
  const logMin = Math.log10(Math.max(1, minVal));
  const logMax = Math.log10(Math.max(10, maxVal));
  const logSpan = Math.max(0.25, logMax - logMin);

  return selected.map((token, idx) => {
    const rank = idx + 1;
    const val = metricValues[idx];
    const normLog =
      val > 0 ? Math.min(1, Math.max(0, (Math.log10(Math.max(1, val)) - logMin) / logSpan)) : 0.1;

    const tier: CoinMonumentNode['tier'] =
      rank <= 3 ? 'CROWN' : rank <= 12 ? 'MID' : 'OUTER';

    // Concentric radial layout with golden-angle spiral distribution so pedestals never collide
    let radius = 4.8;
    let angle = idx * GOLDEN_ANGLE;

    if (tier === 'CROWN') {
      radius = 4.6 + idx * 0.65;
      angle = (idx / Math.min(3, selected.length)) * Math.PI * 2 + 0.35;
    } else if (tier === 'MID') {
      const midIdx = idx - 3;
      radius = 8.8 + (midIdx / 9) * 5.2;
      angle = idx * GOLDEN_ANGLE + 0.5;
    } else {
      const outerIdx = idx - 12;
      radius = 15.8 + (outerIdx / Math.max(1, selected.length - 12)) * 7.6;
      angle = idx * GOLDEN_ANGLE;
    }

    const x = Number((Math.cos(angle) * radius).toFixed(3));
    const z = Number((Math.sin(angle) * radius).toFixed(3));

    const monumentHeight = Number((1.65 + normLog * 5.35).toFixed(3));
    const pedestalRadius = Number((0.88 + normLog * 0.62).toFixed(3));
    const spireRadius = Number((0.34 + normLog * 0.34).toFixed(3));

    const txVelocity = (token.buys1h || 0) + (token.sells1h || 0);
    const orbitSpeed = Number((0.45 + Math.min(2.2, Math.log10(Math.max(10, txVelocity)) * 0.45)).toFixed(3));

    const graduated = isGraduatedToken(token);
    const { accentHex, rimHex } = getMomentumColors(token.priceChange1h || 0, graduated);

    const sectorLabel: CoinMonumentNode['sectorLabel'] =
      rank <= 3
        ? 'CROWN_LEADER'
        : graduated
        ? 'GRADUATED_POOL'
        : isRecentLaunch(token, 48)
        ? 'NEW_LAUNCH'
        : 'BONDING_CURVE';

    return {
      mint: token.mint,
      symbol: token.symbol || token.mint.slice(0, 6),
      name: token.name || token.symbol,
      rank,
      tier,
      position: [x, 0, z],
      monumentHeight,
      pedestalRadius,
      spireRadius,
      orbitSpeed,
      metricValue: val,
      momentum1h: token.priceChange1h || 0,
      momentum24h: token.priceChange24h || 0,
      accentHex,
      rimHex,
      sectorLabel,
      token,
    };
  });
}

export function computeCameraPresetPose(
  preset: CoinMapCameraPreset,
  nodes: CoinMonumentNode[],
  focusedMint?: string | null
): CameraPose {
  if (focusedMint) {
    const focused = nodes.find((n) => n.mint === focusedMint);
    if (focused) {
      const [fx, , fz] = focused.position;
      const dist = Math.hypot(fx, fz) || 1;
      const dirX = fx / dist;
      const dirZ = fz / dist;
      const camOffset = 8.4 + focused.pedestalRadius * 1.6 + focused.monumentHeight * 0.45;
      const camHeight = Math.max(4.6, focused.monumentHeight * 0.9 + 2.8);
      return {
        position: [
          Number((fx + dirX * camOffset + dirZ * 3.0).toFixed(3)),
          Number(camHeight.toFixed(3)),
          Number((fz + dirZ * camOffset - dirX * 3.0).toFixed(3)),
        ],
        target: [fx, Number((focused.monumentHeight * 0.52).toFixed(3)), fz],
      };
    }
  }

  if (preset === 'CROWN') {
    return {
      position: [0, 9.5, 13.5],
      target: [0, 2.1, 0],
    };
  }

  if (preset === 'GAINERS') {
    const topGainer = [...nodes].sort((a, b) => b.momentum1h - a.momentum1h)[0];
    if (topGainer) {
      const [gx, , gz] = topGainer.position;
      return {
        position: [gx * 1.65 + 4, 8.2, gz * 1.65 + 6],
        target: [gx * 0.45, 2.0, gz * 0.45],
      };
    }
  }

  return {
    position: [0, 18.5, 29.5],
    target: [0, 1.4, 0],
  };
}
