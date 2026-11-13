import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { Modality, type LiveServerMessage } from '@google/genai';
import { AGENT_DEPARTMENTS, AGENT_REGISTRY, getRegistryStats } from './src/shared/agentRegistry.ts';
import { BACKTEST_STRATEGIES, runDeterministicBacktest } from './src/shared/backtestEngine.ts';
import {
  filterAndSortTokens,
  type ChangeTimeframe,
  type MarketSectionFilter,
} from './src/shared/marketAnalytics.ts';
import { evaluateRugRisk } from './src/shared/scoringAndRisk.ts';
import {
  BacktestStrategyValues,
  SupportedTimeframeValues,
  type BacktestStrategyId,
  type SupportedTimeframe,
  type TokenMarketData,
} from './src/shared/types.ts';
import {
  fetchFxRates,
  fetchJupiterSwapQuote,
  fetchLiveSolanaTokens,
  fetchOhlcvForPool,
  fetchOnChainTokenAudit,
  fetchSocialIntelligence,
  fetchSolUsdPrice,
  fetchTokenByMint,
  fetchTokenTransactions,
  fetchWalletIntelligence,
  fetchWhaleActivityFeed,
  getDataProvidersHealth,
  searchSolanaTokens,
} from './src/server/solanaAdapters.ts';
import {
  generateMultiAgentReport,
  generatePortfolioAdvisorPlan,
  generateSearchGroundedCoinBrief,
  getGeminiServerClient,
} from './src/server/aiOrchestrator.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));

// Simple per-IP sliding window rate limiter for API routes (exclude SSE stream ticks)
const rateBucket = new Map<string, { count: number; resetAt: number }>();
app.use('/api', (req, res, next) => {
  if (req.path === '/stream/market') return next();
  const ip = req.ip || 'local';
  const now = Date.now();
  const entry = rateBucket.get(ip);
  if (!entry || now > entry.resetAt) {
    rateBucket.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 160) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please wait briefly before retrying.' });
  }
  return next();
});

app.get('/api/health', async (_req, res) => {
  const providers = getDataProvidersHealth();
  res.json({
    status: 'ok',
    platform: 'MULTITRADE AI',
    timestampUtc: new Date().toISOString(),
    providers,
    registry: getRegistryStats(),
  });
});

app.get('/api/fx-rates', async (_req, res) => {
  const fx = await fetchFxRates();
  res.json(fx);
});

app.get('/api/agents/registry', (_req, res) => {
  res.json({
    stats: getRegistryStats(),
    departments: AGENT_DEPARTMENTS.map((d) => ({
      code: d.code,
      name: d.name,
      targetCount: d.targetCount,
      operationalCount: d.roles.filter((r) => r.operational).length,
      registeredCount: d.roles.filter((r) => !r.operational).length,
    })),
    agents: AGENT_REGISTRY,
  });
});

function parseOptionalNumber(val: unknown): number | null {
  if (typeof val !== 'string' || !val.trim()) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

app.get('/api/tokens/scanner', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const filter = (typeof req.query.filter === 'string' ? req.query.filter : 'all') as MarketSectionFilter;
    const timeframe = (
      typeof req.query.timeframe === 'string' &&
      ['5m', '1h', '6h', '24h'].includes(req.query.timeframe)
        ? req.query.timeframe
        : '1h'
    ) as ChangeTimeframe;
    const sortBy = typeof req.query.sort === 'string' ? req.query.sort : '';
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize || 20)));

    const rawTokens: TokenMarketData[] = q
      ? await searchSolanaTokens(q)
      : await fetchLiveSolanaTokens();

    const tokens = filterAndSortTokens(rawTokens, {
      section: filter,
      timeframe,
      minMcap: parseOptionalNumber(req.query.minMcap),
      maxMcap: parseOptionalNumber(req.query.maxMcap),
      minLiquidity: parseOptionalNumber(req.query.minLiquidity),
      minVolume: parseOptionalNumber(req.query.minVolume),
      minAgeHours: parseOptionalNumber(req.query.minAgeHours),
      maxAgeHours: parseOptionalNumber(req.query.maxAgeHours),
      graduationStatus:
        typeof req.query.graduationStatus === 'string'
          ? (req.query.graduationStatus as 'ALL' | 'BONDING' | 'GRADUATED' | 'DEX_POOL')
          : 'ALL',
      riskLevel:
        typeof req.query.riskLevel === 'string'
          ? (req.query.riskLevel as 'ALL' | 'LOW_MODERATE' | 'HIGH_RISK')
          : 'ALL',
      sortBy: sortBy || undefined,
    });

    const total = tokens.length;
    const startIdx = (page - 1) * pageSize;
    const items = tokens.slice(startIdx, startIdx + pageSize);
    const solPriceUsd = await fetchSolUsdPrice();

    res.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      solPriceUsd,
      lastUpdatedUtc: new Date().toISOString(),
      providers: getDataProvidersHealth(),
    });
  } catch (err: any) {
    console.error('Scanner route error:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch live token scanner.' });
  }
});

// Server-Sent Events real-time market updates stream
app.get('/api/stream/market', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let closed = false;
  req.on('close', () => {
    closed = true;
    clearInterval(intervalId);
  });

  const pushSnapshot = async () => {
    if (closed) return;
    try {
      const [tokens, solPriceUsd] = await Promise.all([
        fetchLiveSolanaTokens(),
        fetchSolUsdPrice(),
      ]);
      const payload = JSON.stringify({
        items: tokens.slice(0, 35),
        solPriceUsd,
        providers: getDataProvidersHealth(),
        lastUpdatedUtc: new Date().toISOString(),
      });
      res.write(`event: market\ndata: ${payload}\n\n`);
    } catch {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestampUtc: new Date().toISOString() })}\n\n`);
    }
  };

  await pushSnapshot();
  const intervalId = setInterval(pushSnapshot, 22_000);
});

app.get('/api/whales/feed', async (req, res) => {
  try {
    const minUsd = Math.max(0, Number(req.query.minUsd ?? 250));
    const feed = await fetchWhaleActivityFeed(minUsd);
    res.json(feed);
  } catch (err: any) {
    console.error('Whale feed route error:', err);
    res.status(500).json({ error: err?.message || 'Failed to load whale activity feed.' });
  }
});

app.get('/api/tokens/:mint', async (req, res) => {
  try {
    const mint = req.params.mint;
    const timeframeParam = (req.query.timeframe as string) || '5m';
    const timeframe: SupportedTimeframe = SupportedTimeframeValues.includes(
      timeframeParam as SupportedTimeframe
    )
      ? (timeframeParam as SupportedTimeframe)
      : '5m';

    const token = await fetchTokenByMint(mint);
    if (!token) {
      return res.status(404).json({ error: `Token ${mint} not found in live Solana feeds.` });
    }

    const solPriceUsd = await fetchSolUsdPrice();
    const [audit, ohlcv, social, transactions] = await Promise.all([
      fetchOnChainTokenAudit(mint, token.creatorAddress, token.pairAddress),
      fetchOhlcvForPool(token.pairAddress, timeframe, mint),
      fetchSocialIntelligence(token.symbol, mint),
      fetchTokenTransactions({
        mint,
        pairAddress: token.pairAddress,
        symbol: token.symbol,
        priceUsd: token.priceUsd,
        solPriceUsd,
        limit: 10,
      }),
    ]);

    const riskAssessment = evaluateRugRisk(token, audit, ohlcv.candles, null);

    res.json({
      token,
      audit,
      ohlcv,
      social,
      transactions,
      solPriceUsd,
      riskAssessment,
      supportedTimeframes: SupportedTimeframeValues,
      lastUpdatedUtc: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Token detail error:', err);
    res.status(500).json({ error: err?.message || 'Failed to inspect token.' });
  }
});

app.get('/api/tokens/:mint/ohlcv', async (req, res) => {
  try {
    const mint = req.params.mint;
    const timeframeParam = (req.query.timeframe as string) || '5m';
    const timeframe: SupportedTimeframe = SupportedTimeframeValues.includes(
      timeframeParam as SupportedTimeframe
    )
      ? (timeframeParam as SupportedTimeframe)
      : '5m';

    const token = await fetchTokenByMint(mint);
    if (!token) {
      return res.status(404).json({ error: 'Token pair not found.' });
    }

    const ohlcv = await fetchOhlcvForPool(token.pairAddress, timeframe, mint);
    res.json(ohlcv);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to fetch OHLCV.' });
  }
});

app.get('/api/wallets/:address', async (req, res) => {
  try {
    const address = req.params.address.trim();
    if (address.length < 32 || address.length > 64) {
      return res.status(400).json({ error: 'Invalid Solana public wallet address format.' });
    }
    const profile = await fetchWalletIntelligence(address);
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to inspect Solana wallet.' });
  }
});

app.post('/api/ai/analyze', async (req, res) => {
  try {
    const mint = typeof req.body?.mint === 'string' ? req.body.mint.trim() : '';
    if (!mint) {
      return res.status(400).json({ error: 'Token mint address is required.' });
    }

    const token = await fetchTokenByMint(mint);
    if (!token) {
      return res.status(404).json({ error: `Token ${mint} could not be resolved on Solana.` });
    }

    const [audit, ohlcv, social, jupQuote] = await Promise.all([
      fetchOnChainTokenAudit(mint, token.creatorAddress, token.pairAddress),
      fetchOhlcvForPool(token.pairAddress, '5m', mint),
      fetchSocialIntelligence(token.symbol),
      fetchJupiterSwapQuote({
        inputMint: mint,
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        amountLamports: '1000000',
        slippageBps: 100,
      }),
    ]);

    const report = await generateMultiAgentReport({
      token,
      audit,
      candles: ohlcv.candles,
      social,
      jupiterRouteVerified: jupQuote.available,
    });

    res.json(report);
  } catch (err: any) {
    console.error('AI analysis error:', err);
    res.status(500).json({ error: err?.message || 'Failed to execute AI intelligence analysis.' });
  }
});

app.post('/api/ai/portfolio-plan', async (req, res) => {
  try {
    const account = req.body?.account;
    const positions = Array.isArray(req.body?.positions) ? req.body.positions : [];
    const availableCashUsd = Math.max(0, Number(req.body?.availableCashUsd ?? 10000));

    if (!account || typeof account.id !== 'string' || typeof account.name !== 'string') {
      return res.status(400).json({ error: 'Valid account configuration is required.' });
    }

    const liveTokens = await fetchLiveSolanaTokens();
    const candidateTokens = [...liveTokens]
      .filter((t) => t.priceUsd > 0 && t.liquidityUsd >= 3_000)
      .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
      .slice(0, 6);

    const [auditResults, walletIntel] = await Promise.all([
      Promise.allSettled(
        candidateTokens.map((t) => fetchOnChainTokenAudit(t.mint, t.creatorAddress, t.pairAddress))
      ),
      account.walletAddress &&
      typeof account.walletAddress === 'string' &&
      account.walletAddress.length >= 32
        ? fetchWalletIntelligence(account.walletAddress).catch(() => null)
        : Promise.resolve(null),
    ]);

    const candidates = candidateTokens.map((token, idx) => {
      const resAudit = auditResults[idx];
      return {
        token,
        audit: resAudit && resAudit.status === 'fulfilled' ? resAudit.value : null,
      };
    });

    const plan = await generatePortfolioAdvisorPlan({
      account,
      positions,
      liveTokens,
      candidates,
      availableCashUsd,
      walletIntel,
    });

    res.json({
      plan,
      walletIntel,
      tokensEvaluated: candidateTokens.length,
    });
  } catch (err: any) {
    console.error('Portfolio advisor error:', err);
    res.status(500).json({ error: err?.message || 'Failed to generate AI portfolio plan.' });
  }
});

app.post('/api/backtest/run', async (req, res) => {
  try {
    const mint = typeof req.body?.mint === 'string' ? req.body.mint.trim() : '';
    const strategyId = req.body?.strategyId as BacktestStrategyId;
    const timeframe = (req.body?.timeframe || '15m') as SupportedTimeframe;
    const feeBps = Math.max(0, Math.min(500, Number(req.body?.feeBps ?? 25)));
    const slippageBps = Math.max(0, Math.min(1000, Number(req.body?.slippageBps ?? 50)));
    const initialCapitalUsd = Math.max(100, Math.min(10_000_000, Number(req.body?.initialCapitalUsd ?? 10000)));
    const stopLossPct = Math.max(1, Math.min(90, Number(req.body?.stopLossPct ?? 12)));
    const takeProfitPct = Math.max(1, Math.min(500, Number(req.body?.takeProfitPct ?? 30)));

    if (!mint || !BacktestStrategyValues.includes(strategyId)) {
      return res.status(400).json({ error: 'Valid mint and strategyId are required.' });
    }
    if (!SupportedTimeframeValues.includes(timeframe)) {
      return res.status(400).json({ error: 'Unsupported timeframe requested.' });
    }

    const token = await fetchTokenByMint(mint);
    if (!token) {
      return res.status(404).json({ error: 'Token not found for backtesting.' });
    }

    const ohlcv = await fetchOhlcvForPool(token.pairAddress, timeframe, mint);
    if (ohlcv.candles.length < 15) {
      return res.status(422).json({
        error: `Insufficient historical OHLCV bars (${ohlcv.candles.length}) returned for ${token.symbol} on ${timeframe} timeframe.`,
      });
    }

    const result = runDeterministicBacktest(
      ohlcv.candles,
      {
        mint: token.mint,
        symbol: token.symbol,
        strategyId,
        timeframe,
        feeBps,
        slippageBps,
        initialCapitalUsd,
        stopLossPct,
        takeProfitPct,
      },
      ohlcv.source
    );

    res.json({
      result,
      strategies: BACKTEST_STRATEGIES,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Backtest execution failed.' });
  }
});

app.post('/api/ai/search-brief', async (req, res) => {
  try {
    const symbol = typeof req.body?.symbol === 'string' ? req.body.symbol.trim() : '';
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : symbol;
    const mint = typeof req.body?.mint === 'string' ? req.body.mint.trim() : undefined;
    const customQuery = typeof req.body?.customQuery === 'string' ? req.body.customQuery.trim() : undefined;

    if (!symbol && !customQuery) {
      return res.status(400).json({ error: 'Token symbol or search query is required.' });
    }

    const brief = await generateSearchGroundedCoinBrief({
      symbol: symbol || 'SOLANA',
      name: name || symbol || 'Solana Market',
      mint,
      priceUsd: typeof req.body?.priceUsd === 'number' ? req.body.priceUsd : undefined,
      marketCapUsd: typeof req.body?.marketCapUsd === 'number' ? req.body.marketCapUsd : undefined,
      volume24hUsd: typeof req.body?.volume24hUsd === 'number' ? req.body.volume24hUsd : undefined,
      priceChange1h: typeof req.body?.priceChange1h === 'number' ? req.body.priceChange1h : undefined,
      priceChange24h: typeof req.body?.priceChange24h === 'number' ? req.body.priceChange24h : undefined,
      customQuery,
    });

    res.json(brief);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Search briefing failed.' });
  }
});

async function setupVoiceWebSocketServer(httpServer: http.Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/voice' });

  wss.on('connection', async (clientWs: WebSocket) => {
    const ai = getGeminiServerClient();
    if (!ai) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          message: 'GEMINI_API_KEY is not configured on the server for Live Voice.',
        })
      );
      clientWs.close();
      return;
    }

    let closed = false;
    let liveSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;

    const sendSafe = (payload: Record<string, unknown>) => {
      if (!closed && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    try {
      const liveTokens = await fetchLiveSolanaTokens().catch(() => []);
      const topSnapshot = [...liveTokens]
        .sort((a, b) => (b.marketCapUsd || 0) - (a.marketCapUsd || 0))
        .slice(0, 12)
        .map(
          (t, i) =>
            `#${i + 1} ${t.symbol} (${t.name}): $${t.priceUsd.toPrecision(4)}, MCap $${Math.round(
              t.marketCapUsd
            ).toLocaleString()}, 24h Vol $${Math.round(t.volume24hUsd).toLocaleString()}, 1h ${t.priceChange1h.toFixed(
              1
            )}%, Liq $${Math.round(t.liquidityUsd).toLocaleString()}, DEX ${t.dexId}`
        )
        .join('\n');

      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: `You are MULTITRADE AI Live Market Voice Analyst guiding the user through the interactive 3D Top Coins Visual Map on Solana and Pump.fun. Speak crisply, concisely, and objectively in plain trader language. Never guarantee profit or encourage reckless leverage. Always note risk when relevant.\n\nToday's Live Top Coins Telemetry:\n${
            topSnapshot || 'Live tokens loading.'
          }`,
        },
        callbacks: {
          onopen: () => {
            sendSafe({ type: 'ready', model: 'gemini-3.8-live' });
          },
          onmessage: (message: LiveServerMessage) => {
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              sendSafe({ type: 'inputTranscript', text: content.inputTranscription.text });
            }
            if (content?.outputTranscription?.text) {
              sendSafe({ type: 'outputTranscript', text: content.outputTranscription.text });
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                sendSafe({
                  type: 'audio',
                  data: part.inlineData.data,
                  mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                });
              }
            }
            if (content?.interrupted) {
              sendSafe({ type: 'interrupted' });
            }
            if (content?.turnComplete) {
              sendSafe({ type: 'turnComplete' });
            }
          },
          onerror: (err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Live voice stream error';
            sendSafe({ type: 'error', message: msg });
          },
          onclose: () => {
            sendSafe({ type: 'closed' });
          },
        },
      });
    } catch (err: any) {
      sendSafe({
        type: 'error',
        message: err?.message || 'Unable to initialize Gemini Live Voice session.',
      });
      clientWs.close();
      return;
    }

    clientWs.on('message', (raw) => {
      if (closed || !liveSession) return;
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          audio?: string;
          text?: string;
        };
        if (msg.type === 'audio' && typeof msg.audio === 'string' && msg.audio.length > 0) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
          liveSession.sendRealtimeInput({ text: msg.text.trim() });
        }
      } catch {
        // ignore malformed client frame
      }
    });

    clientWs.on('close', () => {
      closed = true;
      try {
        liveSession?.close();
      } catch {
        // ignore cleanup error
      }
    });
  });
}

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  await setupVoiceWebSocketServer(httpServer);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`MULTITRADE AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

