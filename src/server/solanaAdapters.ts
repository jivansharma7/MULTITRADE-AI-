import type {
  DataProviderStatus,
  OhlcvCandle,
  OnChainSignatureInfo,
  OnChainTokenAudit,
  ParsedOnChainTx,
  QuoteCurrency,
  SocialIntelligenceSummary,
  SocialMentionItem,
  SocialSourceStatus,
  SupportedTimeframe,
  TokenMarketData,
  TopHolderInfo,
  WalletIntelligenceProfile,
  WalletTokenHolding,
  WhaleTransactionItem,
} from '../shared/types.ts';
import { DEFAULT_FX_RATES } from '../shared/currency.ts';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Well-known Solana DEX / AMM / Launchpad program & vault authorities
const KNOWN_AMM_AUTHORITIES = new Set<string>([
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', // Raydium Authority V4
  'GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL', // Raydium CPMM Vault Authority
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
  '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg', // Pump.fun Raydium Migration
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // Pump.fun Program
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA', // PumpSwap AMM
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca Whirlpool
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', // Meteora DLMM
]);

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.data as T;
}

function setCached<T>(key: string, data: T, ttlMs: number): T {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

const providerStatuses = new Map<string, DataProviderStatus>();

function updateProviderStatus(status: DataProviderStatus) {
  providerStatuses.set(status.id, status);
}

export function getRpcUrl(): { url: string; label: string } {
  if (process.env.HELIUS_API_KEY) {
    return {
      url: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
      label: 'Helius Mainnet RPC',
    };
  }
  if (process.env.SOLANA_RPC_URL) {
    return { url: process.env.SOLANA_RPC_URL, label: 'Custom Solana RPC' };
  }
  return { url: 'https://api.mainnet-beta.solana.com', label: 'Solana Public Mainnet-Beta RPC' };
}

async function fetchJsonWithTimeout<T>(url: string, init?: RequestInit, timeoutMs = 6500): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

interface DexScreenerPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: {
    address?: string;
    name?: string;
    symbol?: string;
  };
  priceNative?: string;
  priceUsd?: string;
  txns?: {
    m5?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    h6?: { buys?: number; sells?: number };
    h24?: { buys?: number; sells?: number };
  };
  volume?: {
    m5?: number;
    h1?: number;
    h6?: number;
    h24?: number;
  };
  priceChange?: {
    m5?: number;
    h1?: number;
    h6?: number;
    h24?: number;
  };
  liquidity?: {
    usd?: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
  };
}

function mapDexPairToToken(pair: DexScreenerPair, sourceLabel = 'DexScreener'): TokenMarketData | null {
  const mint = pair.baseToken?.address;
  const pairAddress = pair.pairAddress;
  if (!mint || !pairAddress) return null;

  const dexId = (pair.dexId || 'solana-dex').toLowerCase();
  const isPumpFun = dexId.includes('pump') || mint.endsWith('pump');
  let migrationStatus: TokenMarketData['migrationStatus'] = 'DEX_POOL';
  if (dexId === 'pumpfun') migrationStatus = 'BONDING';
  else if (dexId === 'pumpswap') migrationStatus = 'MIGRATED_PUMPSWAP';
  else if (isPumpFun && dexId.includes('raydium')) migrationStatus = 'MIGRATED_RAYDIUM';

  return {
    mint,
    pairAddress,
    symbol: pair.baseToken?.symbol || 'UNKNOWN',
    name: pair.baseToken?.name || pair.baseToken?.symbol || 'Unknown Token',
    imageUrl: pair.info?.imageUrl,
    dexId: pair.dexId || 'solana',
    source: sourceLabel,
    url: pair.url || `https://dexscreener.com/solana/${pairAddress}`,
    priceUsd: Number(pair.priceUsd || 0),
    priceNative: Number(pair.priceNative || 0),
    marketCapUsd: Number(pair.marketCap || pair.fdv || 0),
    fdvUsd: Number(pair.fdv || pair.marketCap || 0),
    liquidityUsd: Number(pair.liquidity?.usd || 0),
    volume5mUsd: Number(pair.volume?.m5 || 0),
    volume1hUsd: Number(pair.volume?.h1 || 0),
    volume6hUsd: Number(pair.volume?.h6 || 0),
    volume24hUsd: Number(pair.volume?.h24 || 0),
    priceChange5m: Number(pair.priceChange?.m5 || 0),
    priceChange1h: Number(pair.priceChange?.h1 || 0),
    priceChange6h: Number(pair.priceChange?.h6 || 0),
    priceChange24h: Number(pair.priceChange?.h24 || 0),
    buys5m: Number(pair.txns?.m5?.buys || 0),
    sells5m: Number(pair.txns?.m5?.sells || 0),
    buys1h: Number(pair.txns?.h1?.buys || 0),
    sells1h: Number(pair.txns?.h1?.sells || 0),
    buys24h: Number(pair.txns?.h24?.buys || 0),
    sells24h: Number(pair.txns?.h24?.sells || 0),
    pairCreatedAt: pair.pairCreatedAt || null,
    bondingCurveProgressPct:
      migrationStatus === 'MIGRATED_PUMPSWAP' || migrationStatus === 'MIGRATED_RAYDIUM' ? 100 : null,
    migrationStatus,
    isPumpFun,
    holdersCount: null,
    creatorAddress: null,
    lastUpdatedUtc: new Date().toISOString(),
    freshness: 'REALTIME',
  };
}

export async function fetchSolUsdPrice(): Promise<number | null> {
  const cached = getCached<number>('sol_usd_price');
  if (cached !== null) return cached;

  try {
    const pairs = await fetchJsonWithTimeout<DexScreenerPair[]>(
      `https://api.dexscreener.com/tokens/v1/solana/${WSOL_MINT}`,
      undefined,
      4000
    );
    const solUsdc = Array.isArray(pairs)
      ? pairs
          .filter((p) => p.chainId === 'solana' && Number(p.priceUsd || 0) > 0)
          .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))[0]
      : undefined;
    const price = solUsdc ? Number(solUsdc.priceUsd) : null;
    if (price && Number.isFinite(price) && price > 0) {
      return setCached('sol_usd_price', price, 30_000);
    }
  } catch {
    // ignore transient failure
  }
  return null;
}

interface PumpFunCoin {
  mint?: string;
  name?: string;
  symbol?: string;
  image_uri?: string;
  creator?: string;
  created_timestamp?: number;
  raydium_pool?: string | null;
  pump_swap_pool?: string | null;
  complete?: boolean;
  virtual_sol_reserves?: number;
  virtual_token_reserves?: number;
  total_supply?: number;
  usd_market_cap?: number;
  reply_count?: number;
  holder_count?: number;
}

async function fetchPumpFunCoinMeta(mint: string): Promise<{
  creatorAddress: string | null;
  bondingCurveProgressPct: number | null;
  holdersCount: number | null;
  createdTimestamp: number | null;
} | null> {
  const cacheKey = `pump_coin_${mint}`;
  const cached = getCached<{
    creatorAddress: string | null;
    bondingCurveProgressPct: number | null;
    holdersCount: number | null;
    createdTimestamp: number | null;
  }>(cacheKey);
  if (cached) return cached;

  try {
    const c = await fetchJsonWithTimeout<PumpFunCoin>(
      `https://frontend-api-v3.pump.fun/coins/${encodeURIComponent(mint)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MULTITRADE-AI/1.0)',
        },
      },
      3000
    );
    if (!c || !c.mint) return null;
    const solReserves = Number(c.virtual_sol_reserves || 0) / 1e9;
    const bondingPct = c.complete
      ? 100
      : solReserves > 0
      ? Math.min(99, Math.max(1, Math.round(((solReserves - 30) / 85) * 100)))
      : null;

    return setCached(
      cacheKey,
      {
        creatorAddress: c.creator || null,
        bondingCurveProgressPct: bondingPct !== null && Number.isFinite(bondingPct) ? bondingPct : null,
        holdersCount: typeof c.holder_count === 'number' ? c.holder_count : null,
        createdTimestamp: c.created_timestamp || null,
      },
      60_000
    );
  } catch {
    return null;
  }
}

async function fetchPumpFunDirect(): Promise<TokenMarketData[]> {
  const nowUtc = new Date().toISOString();
  try {
    const [activeCoins, newestCoins] = await Promise.allSettled([
      fetchJsonWithTimeout<PumpFunCoin[]>(
        'https://frontend-api-v3.pump.fun/coins?offset=0&limit=25&sort=last_trade_timestamp&order=DESC&includeNsfw=false',
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MULTITRADE-AI/1.0)',
          },
        },
        4000
      ),
      fetchJsonWithTimeout<PumpFunCoin[]>(
        'https://frontend-api-v3.pump.fun/coins?offset=0&limit=15&sort=created_timestamp&order=DESC&includeNsfw=false',
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MULTITRADE-AI/1.0)',
          },
        },
        4000
      ),
    ]);

    const combined: PumpFunCoin[] = [];
    if (activeCoins.status === 'fulfilled' && Array.isArray(activeCoins.value)) {
      combined.push(...activeCoins.value);
    }
    if (newestCoins.status === 'fulfilled' && Array.isArray(newestCoins.value)) {
      combined.push(...newestCoins.value);
    }

    if (combined.length === 0) throw new Error('Pump.fun endpoints returned no records');

    const solUsd = (await fetchSolUsdPrice()) ?? 180;
    const deduped = new Map<string, PumpFunCoin>();
    for (const c of combined) {
      if (c.mint && !deduped.has(c.mint)) deduped.set(c.mint, c);
    }

    updateProviderStatus({
      id: 'pumpfun',
      name: 'Pump.fun Direct Feed',
      category: 'MARKET',
      connected: true,
      statusLabel: 'OPERATIONAL',
      detail: `Indexed ${deduped.size} active & newly created Pump.fun coins.`,
      lastCheckedUtc: nowUtc,
    });

    return Array.from(deduped.values()).map((c) => {
      const solReserves = Number(c.virtual_sol_reserves || 0) / 1e9;
      const bondingPct = c.complete
        ? 100
        : Math.min(99, Math.max(1, Math.round(((solReserves - 30) / 85) * 100)));
      const mcap = Number(c.usd_market_cap || 0);
      const supply = Number(c.total_supply || 1_000_000_000_000_000) / 1e6;
      const priceUsd = supply > 0 && mcap > 0 ? mcap / supply : 0;

      return {
        mint: c.mint!,
        pairAddress: c.pump_swap_pool || c.raydium_pool || c.mint!,
        symbol: c.symbol || 'PUMP',
        name: c.name || c.symbol || 'Pump.fun Token',
        imageUrl: c.image_uri,
        dexId: c.complete ? (c.pump_swap_pool ? 'pumpswap' : 'raydium') : 'pumpfun',
        source: 'Pump.fun API',
        url: `https://pump.fun/coin/${c.mint}`,
        priceUsd,
        priceNative: solUsd > 0 && priceUsd > 0 ? priceUsd / solUsd : 0,
        marketCapUsd: mcap,
        fdvUsd: mcap,
        liquidityUsd: solReserves > 0 ? solReserves * solUsd : 0,
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
        pairCreatedAt: c.created_timestamp || null,
        bondingCurveProgressPct: Number.isFinite(bondingPct) ? bondingPct : null,
        migrationStatus: c.complete
          ? c.pump_swap_pool
            ? 'MIGRATED_PUMPSWAP'
            : 'MIGRATED_RAYDIUM'
          : 'BONDING',
        isPumpFun: true,
        holdersCount: typeof c.holder_count === 'number' ? c.holder_count : null,
        creatorAddress: c.creator || null,
        lastUpdatedUtc: nowUtc,
        freshness: 'REALTIME',
      };
    });
  } catch (err: any) {
    updateProviderStatus({
      id: 'pumpfun',
      name: 'Pump.fun Direct Feed',
      category: 'MARKET',
      connected: false,
      statusLabel: 'DEGRADED',
      detail: `Direct Pump.fun edge endpoint unavailable (${err?.message || 'timeout/WAF'}); using DexScreener Pump.fun & PumpSwap index.`,
      lastCheckedUtc: nowUtc,
    });
    return [];
  }
}

export async function fetchLiveSolanaTokens(): Promise<TokenMarketData[]> {
  const cached = getCached<TokenMarketData[]>('live_solana_tokens');
  if (cached) return cached;

  const nowUtc = new Date().toISOString();
  const tokenMap = new Map<string, TokenMarketData>();

  const [pumpDirect, boostsRes, profilesRes, searchPumpRes, searchRaydiumRes] = await Promise.allSettled([
    fetchPumpFunDirect(),
    fetchJsonWithTimeout<Array<{ chainId?: string; tokenAddress?: string }>>(
      'https://api.dexscreener.com/token-boosts/latest/v1'
    ),
    fetchJsonWithTimeout<Array<{ chainId?: string; tokenAddress?: string }>>(
      'https://api.dexscreener.com/token-profiles/latest/v1'
    ),
    fetchJsonWithTimeout<{ pairs?: DexScreenerPair[] }>(
      'https://api.dexscreener.com/latest/dex/search?q=pump'
    ),
    fetchJsonWithTimeout<{ pairs?: DexScreenerPair[] }>(
      'https://api.dexscreener.com/latest/dex/search?q=pumpswap'
    ),
  ]);

  const mintSet = new Set<string>();
  if (boostsRes.status === 'fulfilled' && Array.isArray(boostsRes.value)) {
    for (const item of boostsRes.value) {
      if (item.chainId === 'solana' && item.tokenAddress) mintSet.add(item.tokenAddress);
    }
  }
  if (profilesRes.status === 'fulfilled' && Array.isArray(profilesRes.value)) {
    for (const item of profilesRes.value) {
      if (item.chainId === 'solana' && item.tokenAddress) mintSet.add(item.tokenAddress);
    }
  }
  if (pumpDirect.status === 'fulfilled') {
    for (const t of pumpDirect.value) {
      mintSet.add(t.mint);
      tokenMap.set(t.mint, t);
    }
  }

  // Enrich discovered Solana mints via DexScreener /tokens/v1/solana/<mints> (up to 30 per batch)
  const mints = Array.from(mintSet).slice(0, 30);
  if (mints.length > 0) {
    try {
      const pairs = await fetchJsonWithTimeout<DexScreenerPair[]>(
        `https://api.dexscreener.com/tokens/v1/solana/${mints.join(',')}`
      );
      if (Array.isArray(pairs)) {
        for (const pair of pairs) {
          if (pair.chainId !== 'solana') continue;
          const mapped = mapDexPairToToken(pair, 'DexScreener');
          if (!mapped) continue;
          const existing = tokenMap.get(mapped.mint);
          if (!existing || mapped.liquidityUsd > existing.liquidityUsd || mapped.volume24hUsd > existing.volume24hUsd) {
            tokenMap.set(mapped.mint, {
              ...mapped,
              imageUrl: mapped.imageUrl || existing?.imageUrl,
              creatorAddress: existing?.creatorAddress ?? mapped.creatorAddress,
              holdersCount: existing?.holdersCount ?? mapped.holdersCount,
              bondingCurveProgressPct: existing?.bondingCurveProgressPct ?? mapped.bondingCurveProgressPct,
              source: existing?.source === 'Pump.fun API' ? 'Pump.fun + DexScreener' : 'DexScreener',
            });
          }
        }
      }
      updateProviderStatus({
        id: 'dexscreener',
        name: 'DexScreener Solana Feed',
        category: 'MARKET',
        connected: true,
        statusLabel: 'OPERATIONAL',
        detail: `Live Solana DEX & PumpSwap pair quotes (${tokenMap.size} tokens indexed).`,
        lastCheckedUtc: nowUtc,
      });
    } catch (err: any) {
      updateProviderStatus({
        id: 'dexscreener',
        name: 'DexScreener Solana Feed',
        category: 'MARKET',
        connected: false,
        statusLabel: 'DEGRADED',
        detail: err?.message || 'Failed to query DexScreener token batch.',
        lastCheckedUtc: nowUtc,
      });
    }
  }

  for (const resItem of [searchPumpRes, searchRaydiumRes]) {
    if (resItem.status === 'fulfilled' && Array.isArray(resItem.value.pairs)) {
      for (const pair of resItem.value.pairs) {
        if (pair.chainId !== 'solana') continue;
        const mapped = mapDexPairToToken(pair, 'DexScreener');
        if (!mapped) continue;
        const existing = tokenMap.get(mapped.mint);
        if (!existing || mapped.volume24hUsd > existing.volume24hUsd) {
          tokenMap.set(mapped.mint, {
            ...mapped,
            imageUrl: mapped.imageUrl || existing?.imageUrl,
            creatorAddress: existing?.creatorAddress ?? mapped.creatorAddress,
            holdersCount: existing?.holdersCount ?? mapped.holdersCount,
            bondingCurveProgressPct: existing?.bondingCurveProgressPct ?? mapped.bondingCurveProgressPct,
          });
        }
      }
      if (!providerStatuses.get('dexscreener')?.connected) {
        updateProviderStatus({
          id: 'dexscreener',
          name: 'DexScreener Solana Feed',
          category: 'MARKET',
          connected: true,
          statusLabel: 'OPERATIONAL',
          detail: `Live Solana pairs loaded via search (${tokenMap.size} tokens).`,
          lastCheckedUtc: nowUtc,
        });
      }
    }
  }

  const list = Array.from(tokenMap.values()).filter((t) => t.priceUsd > 0 || t.marketCapUsd > 0);
  list.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
  return setCached('live_solana_tokens', list, 20_000);
}

export async function fetchTokenByMint(mint: string): Promise<TokenMarketData | null> {
  const cached = getCached<TokenMarketData>(`token_${mint}`);
  if (cached) return cached;

  const list = await fetchLiveSolanaTokens();
  const fromList = list.find((t) => t.mint === mint);

  const [dexRes, pumpMeta] = await Promise.all([
    fetchJsonWithTimeout<{ pairs?: DexScreenerPair[] }>(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`
    ).catch(() => null),
    fromList?.isPumpFun || mint.endsWith('pump')
      ? fetchPumpFunCoinMeta(mint)
      : Promise.resolve(null),
  ]);

  if (dexRes?.pairs) {
    const solPairs = dexRes.pairs.filter((p) => p.chainId === 'solana');
    solPairs.sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0));
    if (solPairs[0]) {
      const mapped = mapDexPairToToken(solPairs[0], pumpMeta ? 'Pump.fun + DexScreener' : 'DexScreener');
      if (mapped) {
        const merged: TokenMarketData = {
          ...mapped,
          imageUrl: mapped.imageUrl || fromList?.imageUrl,
          creatorAddress: pumpMeta?.creatorAddress ?? fromList?.creatorAddress ?? mapped.creatorAddress,
          holdersCount: pumpMeta?.holdersCount ?? fromList?.holdersCount ?? mapped.holdersCount,
          pairCreatedAt: mapped.pairCreatedAt ?? pumpMeta?.createdTimestamp ?? fromList?.pairCreatedAt ?? null,
          bondingCurveProgressPct:
            pumpMeta?.bondingCurveProgressPct ??
            fromList?.bondingCurveProgressPct ??
            mapped.bondingCurveProgressPct,
        };
        return setCached(`token_${mint}`, merged, 15_000);
      }
    }
  }

  if (fromList) {
    return {
      ...fromList,
      creatorAddress: pumpMeta?.creatorAddress ?? fromList.creatorAddress,
      holdersCount: pumpMeta?.holdersCount ?? fromList.holdersCount,
      bondingCurveProgressPct:
        pumpMeta?.bondingCurveProgressPct ?? fromList.bondingCurveProgressPct,
    };
  }
  return null;
}

export async function searchSolanaTokens(query: string): Promise<TokenMarketData[]> {
  const q = query.trim();
  if (!q) return fetchLiveSolanaTokens();
  const cacheKey = `search_${q.toLowerCase()}`;
  const cached = getCached<TokenMarketData[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchJsonWithTimeout<{ pairs?: DexScreenerPair[] }>(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`
    );
    const map = new Map<string, TokenMarketData>();
    for (const pair of res.pairs || []) {
      if (pair.chainId !== 'solana') continue;
      const mapped = mapDexPairToToken(pair, 'DexScreener Search');
      if (!mapped) continue;
      const prev = map.get(mapped.mint);
      if (!prev || mapped.liquidityUsd > prev.liquidityUsd) {
        map.set(mapped.mint, mapped);
      }
    }
    const items = Array.from(map.values()).sort((a, b) => b.volume24hUsd - a.volume24hUsd);
    return setCached(cacheKey, items, 15_000);
  } catch {
    return [];
  }
}

export async function fetchOhlcvForPool(
  poolAddress: string,
  timeframe: SupportedTimeframe,
  mintAddress?: string
): Promise<{
  candles: OhlcvCandle[];
  source: string;
  freshness: 'REALTIME' | 'DELAYED' | 'HISTORICAL';
  supported: boolean;
  error?: string;
}> {
  const cacheKey = `ohlcv_${poolAddress}_${timeframe}`;
  const cached = getCached<{
    candles: OhlcvCandle[];
    source: string;
    freshness: 'REALTIME' | 'DELAYED' | 'HISTORICAL';
    supported: boolean;
  }>(cacheKey);
  if (cached) return cached;

  let gtTimeframe = 'minute';
  let aggregate = 5;
  switch (timeframe) {
    case '1m':
      gtTimeframe = 'minute';
      aggregate = 1;
      break;
    case '5m':
      gtTimeframe = 'minute';
      aggregate = 5;
      break;
    case '15m':
      gtTimeframe = 'minute';
      aggregate = 15;
      break;
    case '1h':
      gtTimeframe = 'hour';
      aggregate = 1;
      break;
    case '4h':
      gtTimeframe = 'hour';
      aggregate = 4;
      break;
    case '24h':
      gtTimeframe = 'day';
      aggregate = 1;
      break;
  }

  const nowUtc = new Date().toISOString();
  try {
    const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(
      poolAddress
    )}/ohlcv/${gtTimeframe}?aggregate=${aggregate}&limit=100&currency=usd`;
    const json = await fetchJsonWithTimeout<{
      data?: { attributes?: { ohlcv_list?: number[][] } };
    }>(url, { headers: { Accept: 'application/json;version=20230302' } }, 6500);

    const rawList = json.data?.attributes?.ohlcv_list || [];
    const candles: OhlcvCandle[] = rawList
      .map((row) => ({
        timestamp: Number(row[0]) * 1000,
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      }))
      .filter((c) => Number.isFinite(c.close) && c.close > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    updateProviderStatus({
      id: 'geckoterminal',
      name: 'GeckoTerminal OHLCV',
      category: 'MARKET',
      connected: true,
      statusLabel: 'OPERATIONAL',
      detail: `Historical & intraday Solana pool OHLCV active (${candles.length} bars).`,
      lastCheckedUtc: nowUtc,
    });

    const result = {
      candles,
      source: 'GeckoTerminal Solana OHLCV v2',
      freshness: (timeframe === '1m' || timeframe === '5m' ? 'REALTIME' : 'HISTORICAL') as
        | 'REALTIME'
        | 'HISTORICAL',
      supported: candles.length > 0,
    };
    return setCached(cacheKey, result, 30_000);
  } catch (err: any) {
    // Optional Birdeye fallback if BIRDEYE_API_KEY is configured
    if (process.env.BIRDEYE_API_KEY && mintAddress) {
      try {
        const beType =
          timeframe === '1m'
            ? '1m'
            : timeframe === '5m'
            ? '5m'
            : timeframe === '15m'
            ? '15m'
            : timeframe === '1h'
            ? '1H'
            : timeframe === '4h'
            ? '4H'
            : '1D';
        const timeTo = Math.floor(Date.now() / 1000);
        const timeFrom = timeTo - 3600 * (timeframe === '24h' ? 24 * 60 : 24);
        const beRes = await fetchJsonWithTimeout<{
          data?: { items?: Array<{ unixTime: number; o: number; h: number; l: number; c: number; v: number }> };
        }>(
          `https://public-api.birdeye.so/defi/ohlcv?address=${encodeURIComponent(
            mintAddress
          )}&type=${beType}&time_from=${timeFrom}&time_to=${timeTo}`,
          {
            headers: {
              'X-API-KEY': process.env.BIRDEYE_API_KEY,
              'x-chain': 'solana',
            },
          },
          5000
        );
        const items = beRes.data?.items || [];
        if (items.length > 0) {
          const candles: OhlcvCandle[] = items
            .map((b) => ({
              timestamp: b.unixTime * 1000,
              open: b.o,
              high: b.h,
              low: b.l,
              close: b.c,
              volume: b.v,
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
          return setCached(
            cacheKey,
            {
              candles,
              source: 'Birdeye Solana OHLCV',
              freshness: 'REALTIME',
              supported: true,
            },
            30_000
          );
        }
      } catch {
        // continue to unavailable
      }
    }

    updateProviderStatus({
      id: 'geckoterminal',
      name: 'GeckoTerminal OHLCV',
      category: 'MARKET',
      connected: false,
      statusLabel: 'DEGRADED',
      detail: err?.message || 'OHLCV fetch failed for pool.',
      lastCheckedUtc: nowUtc,
    });
    return {
      candles: [],
      source: 'GeckoTerminal Solana OHLCV v2',
      freshness: 'HISTORICAL',
      supported: false,
      error: err?.message || 'OHLCV candles unavailable for this pool.',
    };
  }
}

async function solanaRpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const { url } = getRpcUrl();
  const res = await fetchJsonWithTimeout<{ result?: T; error?: { message?: string } }>(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    },
    6500
  );
  if (res.error) {
    throw new Error(res.error.message || `Solana RPC error on ${method}`);
  }
  return res.result as T;
}

export async function fetchOnChainTokenAudit(
  mint: string,
  creatorAddress?: string | null,
  pairAddress?: string | null
): Promise<OnChainTokenAudit> {
  const cached = getCached<OnChainTokenAudit>(`audit_${mint}`);
  if (cached) return cached;

  const { label } = getRpcUrl();
  const nowUtc = new Date().toISOString();

  try {
    const [acctInfo, largestRes, sigsRes] = await Promise.allSettled([
      solanaRpcCall<{
        value?: {
          data?: {
            parsed?: {
              info?: {
                mintAuthority?: string | null;
                freezeAuthority?: string | null;
                supply?: string;
                decimals?: number;
              };
            };
          };
        };
      }>('getAccountInfo', [mint, { encoding: 'jsonParsed' }]),
      solanaRpcCall<{
        value?: Array<{ address: string; uiAmount: number | null }>;
      }>('getTokenLargestAccounts', [mint]),
      solanaRpcCall<
        Array<{ signature: string; slot: number; blockTime: number | null; err: unknown; memo: string | null }>
      >('getSignaturesForAddress', [mint, { limit: 15 }]),
    ]);

    const parsedInfo =
      acctInfo.status === 'fulfilled' ? acctInfo.value?.value?.data?.parsed?.info : undefined;
    const decimals = parsedInfo?.decimals ?? null;
    const totalSupplyUi =
      parsedInfo?.supply && decimals !== null ? Number(parsedInfo.supply) / Math.pow(10, decimals) : null;
    const mintAuthority = parsedInfo ? parsedInfo.mintAuthority ?? null : null;
    const freezeAuthority = parsedInfo ? parsedInfo.freezeAuthority ?? null : null;

    const rawHolders = (largestRes.status === 'fulfilled' ? largestRes.value?.value || [] : []).slice(0, 20);

    // Resolve actual owner wallet addresses for top 20 token accounts in 1 batched RPC call
    const ownerMap = new Map<string, string | null>();
    if (rawHolders.length > 0) {
      try {
        const multiRes = await solanaRpcCall<{
          value?: Array<{
            data?: { parsed?: { info?: { owner?: string } } };
          } | null>;
        }>('getMultipleAccounts', [
          rawHolders.map((h) => h.address),
          { encoding: 'jsonParsed' },
        ]);
        const vals = multiRes?.value || [];
        rawHolders.forEach((h, idx) => {
          const owner = vals[idx]?.data?.parsed?.info?.owner ?? null;
          ownerMap.set(h.address, owner);
        });
      } catch {
        // graceful fallback if RPC doesn't return owners
      }
    }

    const topHolders: TopHolderInfo[] = rawHolders.map((h) => {
      const amt = Number(h.uiAmount || 0);
      const pct = totalSupplyUi && totalSupplyUi > 0 ? (amt / totalSupplyUi) * 100 : 0;
      const ownerAddress = ownerMap.get(h.address) ?? null;
      const isPoolAccount = Boolean(
        (ownerAddress && (KNOWN_AMM_AUTHORITIES.has(ownerAddress) || ownerAddress === pairAddress)) ||
          h.address === pairAddress
      );
      return {
        address: h.address,
        tokenAccount: h.address,
        ownerAddress,
        isPoolAccount,
        amountUi: amt,
        pctOfSupply: Number(pct.toFixed(2)),
      };
    });

    const top10ConcentrationPct =
      topHolders.length > 0 && totalSupplyUi && totalSupplyUi > 0
        ? Number(topHolders.slice(0, 10).reduce((sum, h) => sum + h.pctOfSupply, 0).toFixed(2))
        : null;

    const top20ConcentrationPct =
      topHolders.length > 0 && totalSupplyUi && totalSupplyUi > 0
        ? Number(topHolders.slice(0, 20).reduce((sum, h) => sum + h.pctOfSupply, 0).toFixed(2))
        : null;

    let creatorHoldingsPct: number | null = null;
    if (creatorAddress && topHolders.length > 0) {
      const creatorPct = topHolders
        .filter((h) => h.ownerAddress === creatorAddress)
        .reduce((s, h) => s + h.pctOfSupply, 0);
      creatorHoldingsPct = Number(creatorPct.toFixed(2));
    }

    const recentSignatures: OnChainSignatureInfo[] =
      sigsRes.status === 'fulfilled' && Array.isArray(sigsRes.value)
        ? sigsRes.value.map((s) => ({
            signature: s.signature,
            slot: s.slot,
            blockTime: s.blockTime ?? null,
            err: Boolean(s.err),
            memo: s.memo ?? null,
          }))
        : [];

    const rpcConnected = acctInfo.status === 'fulfilled' && Boolean(parsedInfo);

    updateProviderStatus({
      id: 'solana_rpc',
      name: label,
      category: 'BLOCKCHAIN',
      connected: rpcConnected,
      statusLabel: rpcConnected ? 'OPERATIONAL' : 'DEGRADED',
      detail: rpcConnected
        ? 'On-chain SPL mint, authority & Top-20 holder RPC verified.'
        : 'RPC rate-limited or mint account unparsed.',
      lastCheckedUtc: nowUtc,
    });

    const audit: OnChainTokenAudit = {
      mint,
      rpcConnected,
      rpcSource: label,
      mintAuthority,
      freezeAuthority,
      mintAuthorityRevoked: parsedInfo ? mintAuthority === null : null,
      freezeAuthorityRevoked: parsedInfo ? freezeAuthority === null : null,
      totalSupplyUi,
      decimals,
      topHolders,
      top10ConcentrationPct,
      top20ConcentrationPct,
      creatorHoldingsPct,
      recentSignatures,
      lastCheckedUtc: nowUtc,
    };

    return setCached(`audit_${mint}`, audit, 30_000);
  } catch (err: any) {
    updateProviderStatus({
      id: 'solana_rpc',
      name: label,
      category: 'BLOCKCHAIN',
      connected: false,
      statusLabel: 'DEGRADED',
      detail: err?.message || 'Solana RPC request failed.',
      lastCheckedUtc: nowUtc,
    });
    return {
      mint,
      rpcConnected: false,
      rpcSource: label,
      mintAuthority: null,
      freezeAuthority: null,
      mintAuthorityRevoked: null,
      freezeAuthorityRevoked: null,
      totalSupplyUi: null,
      decimals: null,
      topHolders: [],
      top10ConcentrationPct: null,
      top20ConcentrationPct: null,
      creatorHoldingsPct: null,
      recentSignatures: [],
      lastCheckedUtc: nowUtc,
      error: err?.message || 'Solana RPC unavailable.',
    };
  }
}

interface RawParsedTransaction {
  slot?: number;
  blockTime?: number | null;
  transaction?: {
    message?: {
      accountKeys?: Array<{ pubkey?: string; signer?: boolean } | string>;
    };
  };
  meta?: {
    err?: unknown;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: Array<{
      accountIndex?: number;
      mint?: string;
      owner?: string;
      uiTokenAmount?: { uiAmount?: number | null };
    }>;
    postTokenBalances?: Array<{
      accountIndex?: number;
      mint?: string;
      owner?: string;
      uiTokenAmount?: { uiAmount?: number | null };
    }>;
  };
}

function parseRpcTxForMint(params: {
  signature: string;
  tx: RawParsedTransaction | null;
  mint: string;
  symbol?: string;
  priceUsd: number;
  solPriceUsd: number | null;
  sourceLabel: string;
}): ParsedOnChainTx | null {
  const { signature, tx, mint, symbol, priceUsd, solPriceUsd, sourceLabel } = params;
  if (!tx || !tx.meta) return null;

  const keys = (tx.transaction?.message?.accountKeys || []).map((k) =>
    typeof k === 'string' ? { pubkey: k, signer: false } : { pubkey: k.pubkey || '', signer: Boolean(k.signer) }
  );
  const feePayer = keys.find((k) => k.signer)?.pubkey || keys[0]?.pubkey || null;

  // Compute fee-payer SOL delta (excluding standard fee noise below 0.005 SOL)
  let solDelta = 0;
  if (
    Array.isArray(tx.meta.preBalances) &&
    Array.isArray(tx.meta.postBalances) &&
    tx.meta.preBalances.length > 0 &&
    tx.meta.postBalances.length > 0
  ) {
    solDelta = (tx.meta.postBalances[0] - tx.meta.preBalances[0]) / 1e9;
  }

  // Compute token balance delta for non-AMM owners or feePayer on `mint`
  const preMap = new Map<string, number>();
  const postMap = new Map<string, number>();
  for (const b of tx.meta.preTokenBalances || []) {
    if (b.mint === mint && b.owner) {
      preMap.set(b.owner, (preMap.get(b.owner) || 0) + Number(b.uiTokenAmount?.uiAmount || 0));
    }
  }
  for (const b of tx.meta.postTokenBalances || []) {
    if (b.mint === mint && b.owner) {
      postMap.set(b.owner, (postMap.get(b.owner) || 0) + Number(b.uiTokenAmount?.uiAmount || 0));
    }
  }

  let bestOwner: string | null = feePayer;
  let tokenDelta = 0;
  const allOwners = new Set([...preMap.keys(), ...postMap.keys()]);
  for (const owner of allOwners) {
    if (KNOWN_AMM_AUTHORITIES.has(owner)) continue;
    const diff = (postMap.get(owner) || 0) - (preMap.get(owner) || 0);
    if (Math.abs(diff) > Math.abs(tokenDelta)) {
      tokenDelta = diff;
      bestOwner = owner;
    }
  }

  const absToken = Math.abs(tokenDelta);
  const absSol = Math.abs(solDelta);
  let type: ParsedOnChainTx['type'] = 'TRANSFER';
  if (tokenDelta > 0 && (solDelta < -0.005 || absSol > 0.005)) {
    type = 'BUY';
  } else if (tokenDelta < 0 && (solDelta > 0.005 || absSol > 0.005)) {
    type = 'SELL';
  } else if (tokenDelta > 0) {
    type = 'BUY';
  } else if (tokenDelta < 0) {
    type = 'SELL';
  }

  const usdFromTokens = absToken > 0 && priceUsd > 0 ? absToken * priceUsd : null;
  const usdFromSol = absSol > 0.005 && solPriceUsd ? absSol * solPriceUsd : null;
  const usdValue = usdFromTokens ?? usdFromSol ?? null;

  return {
    signature,
    type,
    walletAddress: bestOwner,
    mint,
    symbol,
    solAmount: absSol > 0.0005 ? Number(absSol.toFixed(4)) : null,
    tokenAmount: absToken > 0 ? Number(absToken.toFixed(2)) : null,
    usdValue: usdValue !== null ? Number(usdValue.toFixed(2)) : null,
    blockTime: tx.blockTime ?? null,
    slot: Number(tx.slot || 0),
    err: Boolean(tx.meta.err),
    source: sourceLabel,
    solscanUrl: `https://solscan.io/tx/${signature}`,
  };
}

export async function fetchTokenTransactions(params: {
  mint: string;
  pairAddress?: string;
  symbol?: string;
  priceUsd: number;
  solPriceUsd: number | null;
  limit?: number;
}): Promise<ParsedOnChainTx[]> {
  const { mint, pairAddress, symbol, priceUsd, solPriceUsd, limit = 8 } = params;
  const cacheKey = `txs_${mint}_${limit}`;
  const cached = getCached<ParsedOnChainTx[]>(cacheKey);
  if (cached) return cached;

  // 1. Prefer Helius Enhanced Transactions API when HELIUS_API_KEY is configured
  if (process.env.HELIUS_API_KEY) {
    try {
      const heliusTxs = await fetchJsonWithTimeout<
        Array<{
          signature: string;
          slot: number;
          timestamp: number;
          type: string;
          feePayer: string;
          tokenTransfers?: Array<{
            mint: string;
            tokenAmount: number;
            fromUserAccount?: string;
            toUserAccount?: string;
          }>;
          nativeTransfers?: Array<{
            amount: number;
            fromUserAccount?: string;
            toUserAccount?: string;
          }>;
          transactionError?: unknown;
        }>
      >(
        `https://api.helius.xyz/v0/addresses/${encodeURIComponent(
          pairAddress || mint
        )}/transactions?api-key=${process.env.HELIUS_API_KEY}&limit=${Math.min(20, limit * 2)}`,
        undefined,
        5500
      );

      if (Array.isArray(heliusTxs)) {
        const parsed: ParsedOnChainTx[] = heliusTxs.slice(0, limit).map((tx) => {
          const tok = tx.tokenTransfers?.find((t) => t.mint === mint);
          const tokAmt = tok ? Math.abs(Number(tok.tokenAmount || 0)) : null;
          const isBuy = tok && tok.toUserAccount === tx.feePayer;
          const isSell = tok && tok.fromUserAccount === tx.feePayer;
          const solMoved =
            (tx.nativeTransfers || [])
              .filter(
                (n) => n.fromUserAccount === tx.feePayer || n.toUserAccount === tx.feePayer
              )
              .reduce((sum, n) => sum + Number(n.amount || 0), 0) / 1e9;
          const absSol = Math.abs(solMoved);
          const usdValue =
            tokAmt && priceUsd > 0
              ? tokAmt * priceUsd
              : absSol > 0.005 && solPriceUsd
              ? absSol * solPriceUsd
              : null;

          return {
            signature: tx.signature,
            type: isBuy ? 'BUY' : isSell ? 'SELL' : 'TRANSFER',
            walletAddress: tx.feePayer || null,
            mint,
            symbol,
            solAmount: absSol > 0.001 ? Number(absSol.toFixed(4)) : null,
            tokenAmount: tokAmt !== null ? Number(tokAmt.toFixed(2)) : null,
            usdValue: usdValue !== null ? Number(usdValue.toFixed(2)) : null,
            blockTime: tx.timestamp || null,
            slot: tx.slot || 0,
            err: Boolean(tx.transactionError),
            source: 'Helius Enhanced API',
            solscanUrl: `https://solscan.io/tx/${tx.signature}`,
          };
        });
        return setCached(cacheKey, parsed, 25_000);
      }
    } catch {
      // fall back cleanly to standard Solana RPC
    }
  }

  // 2. GeckoTerminal Pool Trades API (fast, unauthenticated live Solana DEX swaps)
  if (pairAddress) {
    try {
      const gtTrades = await fetchJsonWithTimeout<{
        data?: Array<{
          attributes?: {
            block_number?: number;
            block_timestamp?: string;
            tx_hash?: string;
            tx_from_address?: string;
            kind?: string;
            from_token_address?: string;
            to_token_address?: string;
            from_token_amount?: string;
            to_token_amount?: string;
            volume_in_usd?: string;
          };
        }>;
      }>(
        `https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(
          pairAddress
        )}/trades`,
        undefined,
        5500
      );

      const rawTrades = gtTrades.data || [];
      if (rawTrades.length > 0) {
        const parsedGt: ParsedOnChainTx[] = rawTrades
          .slice(0, limit)
          .filter((item) => Boolean(item.attributes?.tx_hash))
          .map((item) => {
            const a = item.attributes!;
            const sig = a.tx_hash!;
            const kind = (a.kind || '').toLowerCase();
            const type: ParsedOnChainTx['type'] =
              kind === 'buy' ? 'BUY' : kind === 'sell' ? 'SELL' : 'TRANSFER';
            const usdVal = Number(a.volume_in_usd || 0);
            const isFromToken = a.from_token_address === mint;
            const tokAmtRaw = Number(isFromToken ? a.from_token_amount : a.to_token_amount);
            const solEstimate =
              solPriceUsd && solPriceUsd > 0 && usdVal > 0 ? usdVal / solPriceUsd : null;
            const blockTime = a.block_timestamp
              ? Math.floor(new Date(a.block_timestamp).getTime() / 1000)
              : null;

            return {
              signature: sig,
              type,
              walletAddress: a.tx_from_address || null,
              mint,
              symbol,
              solAmount:
                solEstimate !== null && Number.isFinite(solEstimate)
                  ? Number(solEstimate.toFixed(4))
                  : null,
              tokenAmount:
                Number.isFinite(tokAmtRaw) && tokAmtRaw > 0
                  ? Number(tokAmtRaw.toFixed(2))
                  : null,
              usdValue:
                Number.isFinite(usdVal) && usdVal > 0 ? Number(usdVal.toFixed(2)) : null,
              blockTime: blockTime && Number.isFinite(blockTime) ? blockTime : null,
              slot: Number(a.block_number || 0),
              err: false,
              source: 'GeckoTerminal Pool Trades',
              solscanUrl: `https://solscan.io/tx/${sig}`,
            };
          });
        if (parsedGt.length > 0) {
          return setCached(cacheKey, parsedGt, 25_000);
        }
      }
    } catch {
      // fall back cleanly to public Solana RPC
    }
  }

  // 3. Public Solana RPC fallback (capped & cached to respect rate limits)
  try {
    const targetAddr = pairAddress && pairAddress !== mint ? pairAddress : mint;
    const sigs = await solanaRpcCall<
      Array<{ signature: string; slot: number; blockTime: number | null; err: unknown }>
    >('getSignaturesForAddress', [targetAddr, { limit: Math.min(8, limit) }]);

    const validSigs = (sigs || []).filter((s) => !s.err).slice(0, Math.min(6, limit));
    const txResults = await Promise.allSettled(
      validSigs.map((s) =>
        solanaRpcCall<RawParsedTransaction | null>('getTransaction', [
          s.signature,
          { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
        ])
      )
    );

    const parsed: ParsedOnChainTx[] = [];
    txResults.forEach((res, idx) => {
      const s = validSigs[idx];
      if (res.status === 'fulfilled' && res.value) {
        const p = parseRpcTxForMint({
          signature: s.signature,
          tx: res.value,
          mint,
          symbol,
          priceUsd,
          solPriceUsd,
          sourceLabel: getRpcUrl().label,
        });
        if (p) parsed.push(p);
      }
    });

    return setCached(cacheKey, parsed, 25_000);
  } catch {
    return [];
  }
}

export async function fetchWhaleActivityFeed(minUsd = 250): Promise<{
  items: WhaleTransactionItem[];
  solPriceUsd: number | null;
  source: string;
  lastUpdatedUtc: string;
}> {
  const cacheKey = `whale_feed_${minUsd}`;
  const cached = getCached<{
    items: WhaleTransactionItem[];
    solPriceUsd: number | null;
    source: string;
    lastUpdatedUtc: string;
  }>(cacheKey);
  if (cached) return cached;

  const [tokens, solPriceUsd] = await Promise.all([
    fetchLiveSolanaTokens(),
    fetchSolUsdPrice(),
  ]);

  const activeTop = [...tokens]
    .filter((t) => t.liquidityUsd >= 15_000 && t.volume1hUsd > 0)
    .sort((a, b) => b.volume1hUsd - a.volume1hUsd)
    .slice(0, 4);

  const txBatches = await Promise.allSettled(
    activeTop.map(async (token) => {
      const txs = await fetchTokenTransactions({
        mint: token.mint,
        pairAddress: token.pairAddress,
        symbol: token.symbol,
        priceUsd: token.priceUsd,
        solPriceUsd,
        limit: 5,
      });
      return txs.map<WhaleTransactionItem>((tx) => ({
        ...tx,
        tokenName: token.name,
        tokenImageUrl: token.imageUrl,
        marketCapUsd: token.marketCapUsd,
        priceUsd: token.priceUsd,
      }));
    })
  );

  const all: WhaleTransactionItem[] = [];
  for (const b of txBatches) {
    if (b.status === 'fulfilled') {
      all.push(...b.value);
    }
  }

  // Prefer transactions >= minUsd, but if RPC returned smaller active swaps include them transparently
  const largeOnly = all.filter((x) => (x.usdValue ?? 0) >= minUsd);
  const selected = (largeOnly.length >= 3 ? largeOnly : all)
    .filter((x) => x.walletAddress !== null)
    .sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0))
    .slice(0, 25);

  const result = {
    items: selected,
    solPriceUsd,
    source: process.env.HELIUS_API_KEY ? 'Helius Enhanced + DexScreener' : `${getRpcUrl().label} + DexScreener`,
    lastUpdatedUtc: new Date().toISOString(),
  };
  return setCached(cacheKey, result, 25_000);
}

export async function fetchWalletIntelligence(address: string): Promise<WalletIntelligenceProfile> {
  const cached = getCached<WalletIntelligenceProfile>(`wallet_${address}`);
  if (cached) return cached;

  const nowUtc = new Date().toISOString();
  try {
    const [balRes, tokRes, sigsRes, solPriceUsd] = await Promise.all([
      solanaRpcCall<{ value: number }>('getBalance', [address]),
      solanaRpcCall<{
        value?: Array<{
          account?: {
            data?: {
              parsed?: {
                info?: {
                  mint?: string;
                  tokenAmount?: { uiAmount?: number; decimals?: number };
                };
              };
            };
          };
        }>;
      }>('getTokenAccountsByOwner', [
        address,
        { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
        { encoding: 'jsonParsed' },
      ]),
      solanaRpcCall<
        Array<{ signature: string; slot: number; blockTime: number | null; err: unknown; memo: string | null }>
      >('getSignaturesForAddress', [address, { limit: 20 }]),
      fetchSolUsdPrice(),
    ]);

    const solBalance = Number(((balRes?.value ?? 0) / 1e9).toFixed(4));
    const solValueUsd = solPriceUsd !== null ? Number((solBalance * solPriceUsd).toFixed(2)) : null;

    const rawHoldings = (tokRes?.value || [])
      .map((item) => {
        const info = item.account?.data?.parsed?.info;
        return {
          mint: info?.mint || '',
          amountUi: Number(info?.tokenAmount?.uiAmount || 0),
          decimals: Number(info?.tokenAmount?.decimals || 0),
        };
      })
      .filter((h) => h.mint && h.amountUi > 0)
      .slice(0, 30);

    // Batch-enrich all held SPL mints with live DexScreener quotes & symbols
    const metaMap = new Map<string, TokenMarketData>();
    if (rawHoldings.length > 0) {
      try {
        const pairs = await fetchJsonWithTimeout<DexScreenerPair[]>(
          `https://api.dexscreener.com/tokens/v1/solana/${rawHoldings.map((h) => h.mint).join(',')}`,
          undefined,
          5000
        );
        if (Array.isArray(pairs)) {
          for (const pair of pairs) {
            if (pair.chainId !== 'solana') continue;
            const mapped = mapDexPairToToken(pair, 'DexScreener');
            if (!mapped) continue;
            const prev = metaMap.get(mapped.mint);
            if (!prev || mapped.liquidityUsd > prev.liquidityUsd) {
              metaMap.set(mapped.mint, mapped);
            }
          }
        }
      } catch {
        // leave unpriced holdings gracefully with null prices
      }
    }

    const holdings: WalletTokenHolding[] = rawHoldings.map((h) => {
      const m = metaMap.get(h.mint);
      const priceUsd = m && m.priceUsd > 0 ? m.priceUsd : null;
      const valueUsd = priceUsd !== null ? Number((h.amountUi * priceUsd).toFixed(2)) : null;
      return {
        ...h,
        symbol: m?.symbol || `${h.mint.slice(0, 4)}..${h.mint.slice(-3)}`,
        name: m?.name || 'Unindexed SPL Token',
        imageUrl: m?.imageUrl,
        priceUsd,
        priceChange24h: m ? m.priceChange24h : null,
        valueUsd,
      };
    });
    holdings.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));

    const pricedTokensUsd = holdings.reduce((sum, h) => sum + (h.valueUsd || 0), 0);
    const hasTokenPrices = holdings.some((h) => h.valueUsd !== null);
    const totalTokensUsd = hasTokenPrices ? Number(pricedTokensUsd.toFixed(2)) : null;
    const totalPortfolioUsd =
      solValueUsd !== null || totalTokensUsd !== null
        ? Number(((solValueUsd ?? 0) + (totalTokensUsd ?? 0)).toFixed(2))
        : null;

    const recentSignatures: OnChainSignatureInfo[] = (sigsRes || []).map((s) => ({
      signature: s.signature,
      slot: s.slot,
      blockTime: s.blockTime ?? null,
      err: Boolean(s.err),
      memo: s.memo ?? null,
    }));

    // Parse up to 6 recent transactions to identify recent Buy / Sell / Transfer flows
    const recentTransactions: ParsedOnChainTx[] = [];
    const inspectSigs = recentSignatures.filter((s) => !s.err).slice(0, 6);
    if (inspectSigs.length > 0) {
      const txSettled = await Promise.allSettled(
        inspectSigs.map((s) =>
          solanaRpcCall<RawParsedTransaction | null>('getTransaction', [
            s.signature,
            { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
          ])
        )
      );
      txSettled.forEach((res, idx) => {
        if (res.status !== 'fulfilled' || !res.value) return;
        const tx = res.value;
        const sig = inspectSigs[idx];
        const preTokens = tx.meta?.preTokenBalances || [];
        const postTokens = tx.meta?.postTokenBalances || [];
        const mintSet = new Set<string>();
        for (const t of [...preTokens, ...postTokens]) {
          if (t.owner === address && t.mint && t.mint !== WSOL_MINT) {
            mintSet.add(t.mint);
          }
        }
        const primaryMint = Array.from(mintSet)[0] || WSOL_MINT;
        const tokenMeta = metaMap.get(primaryMint);
        const parsed = parseRpcTxForMint({
          signature: sig.signature,
          tx,
          mint: primaryMint,
          symbol: tokenMeta?.symbol || (primaryMint === WSOL_MINT ? 'SOL' : `${primaryMint.slice(0, 4)}..`),
          priceUsd: tokenMeta?.priceUsd || (primaryMint === WSOL_MINT && solPriceUsd ? solPriceUsd : 0),
          solPriceUsd,
          sourceLabel: getRpcUrl().label,
        });
        if (parsed) {
          recentTransactions.push({ ...parsed, walletAddress: address });
        }
      });
    }

    const evidence: string[] = [
      `On-chain SOL balance: ${solBalance} SOL${solValueUsd !== null ? ` (~$${solValueUsd.toLocaleString()})` : ''}`,
      `Active SPL token accounts with >0 balance: ${holdings.length} (${holdings.filter((h) => h.valueUsd !== null).length} live-priced)`,
      `Recent signatures retrieved: ${recentSignatures.length} (${recentTransactions.length} decoded transactions)`,
    ];

    let classification: WalletIntelligenceProfile['classification'] = 'LOW_ACTIVITY';
    if (recentSignatures.length >= 18 && solBalance >= 5) {
      classification = 'HIGH_VOLUME_PARTICIPANT';
      evidence.push('High recent transaction cadence (>=18 recent txs) with >=5 SOL balance.');
    } else if (recentSignatures.length >= 5) {
      classification = 'UNVERIFIED_ACTIVE';
      evidence.push('Active recent on-chain signer.');
    }

    const profile: WalletIntelligenceProfile = {
      address,
      solBalance,
      solPriceUsd,
      solValueUsd,
      totalTokensUsd,
      totalPortfolioUsd,
      holdings,
      recentSignatures,
      recentTransactions,
      estimatedRealizedPnlUsd: null,
      estimatedUnrealizedPnlUsd: null,
      costBasisStatus: 'INCOMPLETE_HISTORY',
      pnlLimitationNote:
        'Historical cost-basis P&L requires full archival wallet swap indexing across all lifetime signatures; standard RPC inspects the latest 20 signatures only, so lifetime P&L is marked unavailable rather than guessed.',
      classification,
      classificationEvidence: evidence,
      rpcConnected: true,
      lastUpdatedUtc: nowUtc,
    };

    return setCached(`wallet_${address}`, profile, 25_000);
  } catch (err: any) {
    return {
      address,
      solBalance: null,
      solPriceUsd: null,
      solValueUsd: null,
      totalTokensUsd: null,
      totalPortfolioUsd: null,
      holdings: [],
      recentSignatures: [],
      recentTransactions: [],
      estimatedRealizedPnlUsd: null,
      estimatedUnrealizedPnlUsd: null,
      costBasisStatus: 'INCOMPLETE_HISTORY',
      pnlLimitationNote: 'Wallet RPC lookup failed; cost-basis and P&L unavailable.',
      classification: 'UNKNOWN',
      classificationEvidence: [err?.message || 'Solana RPC inspection failed for address.'],
      rpcConnected: false,
      lastUpdatedUtc: nowUtc,
      error: err?.message || 'Wallet RPC lookup failed.',
    };
  }
}

export async function fetchSocialIntelligence(
  query: string,
  mint?: string
): Promise<SocialIntelligenceSummary> {
  const clean = query.replace(/[^a-zA-Z0-9\s$_-]/g, '').trim();
  const cacheKey = `social_${clean.toLowerCase()}_${mint || 'nomint'}`;
  const cached = getCached<SocialIntelligenceSummary>(cacheKey);
  if (cached) return cached;

  const nowUtc = new Date().toISOString();
  const sources: SocialSourceStatus[] = [
    {
      platform: 'X',
      connected: Boolean(process.env.TWITTER_BEARER_TOKEN),
      mode: process.env.TWITTER_BEARER_TOKEN ? 'LIVE_PUBLIC' : 'API_KEY_REQUIRED',
      message: process.env.TWITTER_BEARER_TOKEN
        ? 'X API Bearer configured'
        : 'Awaiting TWITTER_BEARER_TOKEN in server secrets.',
    },
    {
      platform: 'Telegram',
      connected: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      mode: process.env.TELEGRAM_BOT_TOKEN ? 'LIVE_PUBLIC' : 'API_KEY_REQUIRED',
      message: process.env.TELEGRAM_BOT_TOKEN
        ? 'Telegram Bot token configured'
        : 'Awaiting TELEGRAM_BOT_TOKEN for public channel ingestion.',
    },
    {
      platform: 'Discord',
      connected: Boolean(process.env.DISCORD_BOT_TOKEN),
      mode: process.env.DISCORD_BOT_TOKEN ? 'LIVE_PUBLIC' : 'API_KEY_REQUIRED',
      message: process.env.DISCORD_BOT_TOKEN
        ? 'Discord Bot token configured'
        : 'Awaiting DISCORD_BOT_TOKEN for public community monitoring.',
    },
  ];

  const mentions: SocialMentionItem[] = [];
  let redditStatus: SocialSourceStatus = {
    platform: 'Reddit',
    connected: false,
    mode: 'RATE_LIMITED',
    message: 'Reddit query not yet executed.',
  };

  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(clean + ' solana')}&sort=new&limit=8`;
    const reddit = await fetchJsonWithTimeout<{
      data?: {
        children?: Array<{
          data?: {
            id?: string;
            author?: string;
            title?: string;
            permalink?: string;
            created_utc?: number;
            score?: number;
          };
        }>;
      };
    }>(url, { headers: { 'User-Agent': 'MULTITRADE-AI/1.0 (Analytics Terminal)' } }, 4500);

    const posts = reddit.data?.children || [];
    for (const p of posts) {
      const d = p.data;
      if (!d?.title) continue;
      const lower = d.title.toLowerCase();
      let sentiment: SocialMentionItem['sentiment'] = 'NEUTRAL';
      if (/\b(bull|moon|gem|pump|launch|alpha|breakout)\b/.test(lower)) sentiment = 'POSITIVE';
      if (/\b(rug|scam|honeypot|dump|fraud|warning|drain)\b/.test(lower)) sentiment = 'NEGATIVE';

      mentions.push({
        id: d.id || String(Math.random()),
        platform: 'Reddit',
        author: d.author ? `u/${d.author}` : 'reddit-user',
        title: d.title,
        url: d.permalink ? `https://www.reddit.com${d.permalink}` : 'https://www.reddit.com',
        createdUtc: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : nowUtc,
        score: Number(d.score || 0),
        sentiment,
      });
    }
    redditStatus = {
      platform: 'Reddit',
      connected: true,
      mode: 'LIVE_PUBLIC',
      message: `Fetched ${mentions.length} public Reddit posts.`,
    };
  } catch (err: any) {
    redditStatus = {
      platform: 'Reddit',
      connected: false,
      mode: 'RATE_LIMITED',
      message: err?.message || 'Reddit public endpoint rate-limited.',
    };
  }

  // Enrich with verified official X / Telegram / Discord channels from GeckoTerminal Token Info
  if (mint) {
    try {
      const infoRes = await fetchJsonWithTimeout<{
        data?: {
          attributes?: {
            twitter_handle?: string | null;
            telegram_handle?: string | null;
            discord_url?: string | null;
            websites?: string[];
            description?: string | null;
            gt_score?: number | null;
          };
        };
      }>(
        `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${encodeURIComponent(mint)}/info`,
        undefined,
        4500
      );
      const attr = infoRes.data?.attributes;
      if (attr) {
        if (attr.twitter_handle) {
          const handle = attr.twitter_handle.replace(/^@/, '');
          const xUrl = handle.startsWith('http') ? handle : `https://x.com/${handle}`;
          const xStatus = sources.find((s) => s.platform === 'X');
          if (xStatus) {
            xStatus.connected = true;
            xStatus.mode = 'LIVE_PUBLIC';
            xStatus.message = `Official X: @${handle.split('/')[0]}`;
          }
          mentions.push({
            id: `gt_x_${mint}`,
            platform: 'X',
            author: `@${handle.split('/')[0]}`,
            title: attr.description
              ? `${attr.description}`
              : `Official X / Twitter account linked for ${clean}`,
            url: xUrl,
            createdUtc: nowUtc,
            score: Math.round(attr.gt_score || 50),
            sentiment: 'POSITIVE',
          });
        }
        if (attr.telegram_handle) {
          const tg = attr.telegram_handle.replace(/^@/, '');
          const tgUrl = tg.startsWith('http') ? tg : `https://t.me/${tg}`;
          const tgStatus = sources.find((s) => s.platform === 'Telegram');
          if (tgStatus) {
            tgStatus.connected = true;
            tgStatus.mode = 'LIVE_PUBLIC';
            tgStatus.message = `Official Telegram: t.me/${tg}`;
          }
          mentions.push({
            id: `gt_tg_${mint}`,
            platform: 'Telegram',
            author: `t.me/${tg}`,
            title: `Official ${clean} community Telegram channel`,
            url: tgUrl,
            createdUtc: nowUtc,
            score: 40,
            sentiment: 'NEUTRAL',
          });
        }
        if (attr.discord_url) {
          const dcStatus = sources.find((s) => s.platform === 'Discord');
          if (dcStatus) {
            dcStatus.connected = true;
            dcStatus.mode = 'LIVE_PUBLIC';
            dcStatus.message = 'Official Discord community linked';
          }
          mentions.push({
            id: `gt_dc_${mint}`,
            platform: 'Discord',
            author: `${clean} Discord`,
            title: `Official ${clean} Discord community server`,
            url: attr.discord_url,
            createdUtc: nowUtc,
            score: 40,
            sentiment: 'NEUTRAL',
          });
        }
      }
    } catch {
      // ignore missing GeckoTerminal social metadata
    }
  }

  const allSources = [redditStatus, ...sources];
  updateProviderStatus({
    id: 'social_reddit',
    name: 'Reddit Public Social Feed',
    category: 'SOCIAL',
    connected: redditStatus.connected,
    statusLabel: redditStatus.connected ? 'OPERATIONAL' : 'DEGRADED',
    detail: redditStatus.message,
    lastCheckedUtc: nowUtc,
  });

  let pos = 0;
  let neg = 0;
  for (const m of mentions) {
    if (m.sentiment === 'POSITIVE') pos++;
    if (m.sentiment === 'NEGATIVE') neg++;
  }
  const sentimentScore =
    mentions.length > 0 ? Math.round(((pos - neg) / mentions.length) * 100) : 0;
  const sentimentLabel =
    mentions.length === 0
      ? 'INSUFFICIENT_DATA'
      : sentimentScore > 15
      ? 'BULLISH'
      : sentimentScore < -15
      ? 'BEARISH'
      : 'NEUTRAL';

  const summary: SocialIntelligenceSummary = {
    query: clean,
    sentimentScore,
    sentimentLabel,
    mentionsCount: mentions.length,
    trendingKeywords: Array.from(
      new Set(
        mentions
          .flatMap((m) => m.title.split(/\s+/))
          .map((w) => w.replace(/[^a-zA-Z0-9$]/g, ''))
          .filter((w) => w.length >= 4)
      )
    ).slice(0, 8),
    manipulationWarning:
      mentions.length === 0
        ? 'Insufficient public social corpus; X/Telegram/Discord API credentials are not configured.'
        : null,
    sources: allSources,
    mentions,
    lastUpdatedUtc: nowUtc,
  };

  return setCached(cacheKey, summary, 60_000);
}

export async function fetchJupiterSwapQuote(params: {
  inputMint: string;
  outputMint: string;
  amountLamports: string;
  slippageBps: number;
}): Promise<{
  available: boolean;
  outAmount?: string;
  priceImpactPct?: number;
  routeLabels?: string[];
  error?: string;
}> {
  const nowUtc = new Date().toISOString();
  const qs = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amountLamports,
    slippageBps: String(params.slippageBps),
  });

  const endpoints = [
    `https://lite-api.jup.ag/swap/v1/quote?${qs.toString()}`,
    `https://api.jup.ag/swap/v1/quote?${qs.toString()}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const data = await fetchJsonWithTimeout<{
        outAmount?: string;
        priceImpactPct?: string;
        routePlan?: Array<{ swapInfo?: { label?: string } }>;
      }>(endpoint, undefined, 4500);

      if (data.outAmount) {
        updateProviderStatus({
          id: 'jupiter',
          name: 'Jupiter Swap Quote API',
          category: 'EXECUTION',
          connected: true,
          statusLabel: 'OPERATIONAL',
          detail: 'Live Solana swap route & price-impact verification operational (analytics only).',
          lastCheckedUtc: nowUtc,
        });
        return {
          available: true,
          outAmount: data.outAmount,
          priceImpactPct: Number(data.priceImpactPct || 0),
          routeLabels: (data.routePlan || [])
            .map((r) => r.swapInfo?.label)
            .filter((x): x is string => Boolean(x)),
        };
      }
    } catch {
      // try next endpoint
    }
  }

  updateProviderStatus({
    id: 'jupiter',
    name: 'Jupiter Swap Quote API',
    category: 'EXECUTION',
    connected: false,
    statusLabel: 'DEGRADED',
    detail: 'Jupiter Quote API unreachable or pair unrouted.',
    lastCheckedUtc: nowUtc,
  });

  return {
    available: false,
    error: 'No live Jupiter route returned for this token pair or endpoint unreachable.',
  };
}

export async function fetchFxRates(): Promise<{
  rates: Record<QuoteCurrency, number>;
  source: string;
  lastUpdatedUtc: string;
}> {
  const cached = getCached<{ rates: Record<QuoteCurrency, number>; source: string; lastUpdatedUtc: string }>(
    'fx_rates'
  );
  if (cached) return cached;

  const nowUtc = new Date().toISOString();
  try {
    const json = await fetchJsonWithTimeout<{ rates?: Record<string, number> }>(
      'https://open.er-api.com/v6/latest/USD',
      undefined,
      4000
    );
    const rates: Record<QuoteCurrency, number> = {
      USD: 1,
      INR: Number(json.rates?.INR || DEFAULT_FX_RATES.INR),
      EUR: Number(json.rates?.EUR || DEFAULT_FX_RATES.EUR),
      GBP: Number(json.rates?.GBP || DEFAULT_FX_RATES.GBP),
    };
    return setCached('fx_rates', { rates, source: 'ExchangeRate-API (Live)', lastUpdatedUtc: nowUtc }, 3_600_000);
  } catch {
    return { rates: DEFAULT_FX_RATES, source: 'Reference Fallback Rates', lastUpdatedUtc: nowUtc };
  }
}

export function getDataProvidersHealth(): DataProviderStatus[] {
  const nowUtc = new Date().toISOString();
  const base: DataProviderStatus[] = [
    providerStatuses.get('dexscreener') || {
      id: 'dexscreener',
      name: 'DexScreener Solana Feed',
      category: 'MARKET',
      connected: true,
      statusLabel: 'OPERATIONAL',
      detail: 'Live Solana & PumpSwap pair quotes.',
      lastCheckedUtc: nowUtc,
    },
    providerStatuses.get('geckoterminal') || {
      id: 'geckoterminal',
      name: 'GeckoTerminal OHLCV',
      category: 'MARKET',
      connected: true,
      statusLabel: 'OPERATIONAL',
      detail: 'Solana pool OHLCV candlestick history.',
      lastCheckedUtc: nowUtc,
    },
    providerStatuses.get('pumpfun') || {
      id: 'pumpfun',
      name: 'Pump.fun Direct Feed',
      category: 'MARKET',
      connected: false,
      statusLabel: 'DEGRADED',
      detail: 'Probed alongside DexScreener Pump.fun & PumpSwap index.',
      lastCheckedUtc: nowUtc,
    },
    providerStatuses.get('solana_rpc') || {
      id: 'solana_rpc',
      name: getRpcUrl().label,
      category: 'BLOCKCHAIN',
      connected: true,
      statusLabel: 'OPERATIONAL',
      detail: 'Solana JSON-RPC mint, authority, Top-20 holder & transaction verification.',
      lastCheckedUtc: nowUtc,
    },
    {
      id: 'helius_api',
      name: 'Helius Enhanced Solana API',
      category: 'BLOCKCHAIN',
      connected: Boolean(process.env.HELIUS_API_KEY),
      statusLabel: process.env.HELIUS_API_KEY ? 'OPERATIONAL' : 'AWAITING_CREDENTIALS',
      detail: process.env.HELIUS_API_KEY
        ? 'Helius enhanced transaction indexing active.'
        : 'Optional HELIUS_API_KEY increases RPC throughput and rich swap parsing.',
      lastCheckedUtc: nowUtc,
    },
    {
      id: 'birdeye_api',
      name: 'Birdeye Market Data API',
      category: 'MARKET',
      connected: Boolean(process.env.BIRDEYE_API_KEY),
      statusLabel: process.env.BIRDEYE_API_KEY ? 'OPERATIONAL' : 'AWAITING_CREDENTIALS',
      detail: process.env.BIRDEYE_API_KEY
        ? 'Birdeye OHLCV & token market fallback active.'
        : 'Optional BIRDEYE_API_KEY provides extra OHLCV coverage.',
      lastCheckedUtc: nowUtc,
    },
    {
      id: 'gemini_ai',
      name: 'MULTITRADE AI Engine (gemini-4-hydrogen)',
      category: 'AI',
      connected: Boolean(process.env.GEMINI_API_KEY),
      statusLabel: process.env.GEMINI_API_KEY ? 'OPERATIONAL' : 'AWAITING_CREDENTIALS',
      detail: process.env.GEMINI_API_KEY
        ? 'Server-side Gemini 4 Hydrogen intelligence engine active.'
        : 'GEMINI_API_KEY missing; deterministic multi-agent consensus active.',
      lastCheckedUtc: nowUtc,
    },
    providerStatuses.get('jupiter') || {
      id: 'jupiter',
      name: 'Jupiter Route Verification API',
      category: 'EXECUTION',
      connected: true,
      statusLabel: 'OPERATIONAL',
      detail: 'Read-only liquidity route & exit slippage verification (live trade execution disabled).',
      lastCheckedUtc: nowUtc,
    },
  ];
  return base;
}
