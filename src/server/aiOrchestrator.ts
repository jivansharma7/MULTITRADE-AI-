import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  buildFallbackNarrativeReport,
  runDeterministicWorkersAndScore,
} from '../shared/scoringAndRisk.ts';
import {
  analyzePortfolioForAccount,
  rankBestTradeOptions,
  type CandidateWithAudit,
} from '../shared/portfolioAdvisor.ts';
import type {
  AiIntelligenceReport,
  AiReportOutcome,
  ManagedAccount,
  OhlcvCandle,
  OnChainTokenAudit,
  PaperPosition,
  PortfolioAdvisorPlan,
  SocialIntelligenceSummary,
  TokenMarketData,
  WalletIntelligenceProfile,
} from '../shared/types.ts';

const reportCache = new Map<string, { report: AiIntelligenceReport; expiresAt: number }>();
const inFlightAnalyses = new Map<string, Promise<AiIntelligenceReport>>();

const VALID_OUTCOMES: AiReportOutcome[] = [
  'REJECT',
  'HIGH RISK',
  'WATCHLIST',
  'FURTHER ANALYSIS',
  'TRADE CANDIDATE',
];

export function getGeminiServerClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function createGeminiClient(): GoogleGenAI | null {
  return getGeminiServerClient();
}

export async function generateMultiAgentReport(params: {
  token: TokenMarketData;
  audit: OnChainTokenAudit | null;
  candles: OhlcvCandle[];
  social: SocialIntelligenceSummary | null;
  jupiterRouteVerified: boolean | null;
}): Promise<AiIntelligenceReport> {
  const mint = params.token.mint;
  const cached = reportCache.get(mint);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.report;
  }

  const existingJob = inFlightAnalyses.get(mint);
  if (existingJob) {
    return existingJob;
  }

  const job = executeAnalysis(params).finally(() => {
    inFlightAnalyses.delete(mint);
  });

  inFlightAnalyses.set(mint, job);
  return job;
}

async function executeAnalysis(params: {
  token: TokenMarketData;
  audit: OnChainTokenAudit | null;
  candles: OhlcvCandle[];
  social: SocialIntelligenceSummary | null;
  jupiterRouteVerified: boolean | null;
}): Promise<AiIntelligenceReport> {
  const tStart = Date.now();
  const det = runDeterministicWorkersAndScore(params);
  const ai = createGeminiClient();

  if (!ai) {
    const fallback = buildFallbackNarrativeReport({
      ...params,
      reason: 'GEMINI_API_KEY not configured on server',
    });
    reportCache.set(params.token.mint, { report: fallback, expiresAt: Date.now() + 180_000 });
    return fallback;
  }

  try {
    const promptPayload = {
      token: {
        name: params.token.name,
        symbol: params.token.symbol,
        mint: params.token.mint,
        dexId: params.token.dexId,
        migrationStatus: params.token.migrationStatus,
        priceUsd: params.token.priceUsd,
        marketCapUsd: params.token.marketCapUsd,
        liquidityUsd: params.token.liquidityUsd,
        volume24hUsd: params.token.volume24hUsd,
        priceChange5m: params.token.priceChange5m,
        priceChange1h: params.token.priceChange1h,
        priceChange24h: params.token.priceChange24h,
        buys1h: params.token.buys1h,
        sells1h: params.token.sells1h,
      },
      deterministicScore: {
        overallScore: det.finalScore,
        outcome: det.outcome,
        overriddenByCriticalRisk: det.overriddenByCriticalRisk,
        breakdown: det.breakdown,
      },
      criticalFlags: det.riskAssessment.criticalFlags,
      workerFindings: det.agentResults.map((a) => ({
        id: a.agentId,
        name: a.agentName,
        result: a.analysisResult,
        riskLevel: a.riskLevel,
      })),
      missingInformation: det.missingInformation,
    };

    const geminiTimeoutMs = 15_000;
    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Analyze this live Solana token telemetry and deterministic multi-agent worker consensus. Produce an institutional-grade quantitative risk & research synthesis. Never claim or guarantee profit. Respect the critical risk override if present.\n\nTelemetry:\n${JSON.stringify(
          promptPayload,
          null,
          2
        )}`,
        config: {
          systemInstruction:
            'You are the Chief AI Orchestrator of MEMEINTEL AI. Synthesize evidence-based Solana memecoin risk reports strictly from supplied facts. Never fabricate metrics or guarantee profits. Keep each bullet concise and grounded.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              outcome: {
                type: Type.STRING,
                description:
                  'Must be one of: REJECT, HIGH RISK, WATCHLIST, FURTHER ANALYSIS, TRADE CANDIDATE',
              },
              bullishEvidence: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              bearishEvidence: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              riskWarnings: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              invalidationConditions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              explanation: {
                type: Type.STRING,
              },
            },
            required: [
              'outcome',
              'bullishEvidence',
              'bearishEvidence',
              'riskWarnings',
              'invalidationConditions',
              'explanation',
            ],
          },
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini synthesis timed out after 15s')), geminiTimeoutMs)
      ),
    ]);

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      outcome?: string;
      bullishEvidence?: string[];
      bearishEvidence?: string[];
      riskWarnings?: string[];
      invalidationConditions?: string[];
      explanation?: string;
    };

    // Enforce critical risk override invariant even over LLM output
    const chosenOutcome: AiReportOutcome = det.overriddenByCriticalRisk
      ? det.outcome
      : VALID_OUTCOMES.includes(parsed.outcome as AiReportOutcome)
      ? (parsed.outcome as AiReportOutcome)
      : det.outcome;

    const nowUtc = new Date().toISOString();
    const orchestratorDuration = Math.max(10, Date.now() - tStart);

    const report: AiIntelligenceReport = {
      mint: params.token.mint,
      symbol: params.token.symbol,
      name: params.token.name,
      outcome: chosenOutcome,
      overallScore: det.finalScore,
      confidenceLevel: det.confidenceLevel,
      scoreBreakdown: det.breakdown,
      overriddenByCriticalRisk: det.overriddenByCriticalRisk,
      bullishEvidence:
        parsed.bullishEvidence?.length ? parsed.bullishEvidence : det.bullishEvidence,
      bearishEvidence:
        parsed.bearishEvidence?.length ? parsed.bearishEvidence : det.bearishEvidence,
      riskWarnings:
        parsed.riskWarnings?.length
          ? parsed.riskWarnings
          : det.riskAssessment.criticalFlags,
      supportingReferences: [
        `Pair: ${params.token.pairAddress} (${params.token.dexId})`,
        ...(params.audit?.recentSignatures.slice(0, 3).map((s) => `Tx: ${s.signature}`) ?? []),
      ],
      missingInformation: det.missingInformation,
      invalidationConditions:
        parsed.invalidationConditions?.length
          ? parsed.invalidationConditions
          : ['Liquidity drops > 35% from current pool depth.'],
      explanation:
        parsed.explanation ||
        `Multi-agent synthesis completed with overall score ${det.finalScore}/100 (${chosenOutcome}).`,
      orchestratorModel: 'gemini-4-hydrogen',
      llmSynthesized: true,
      generatedAtUtc: nowUtc,
      agentResults: [
        ...det.agentResults,
        {
          agentId: 'AGT-12-01',
          agentName: 'Chief AI Orchestrator (Gemini)',
          department: 'Central Coordination',
          status: 'OPERATIONAL',
          lastExecutionUtc: nowUtc,
          analysisResult: `Synthesized 17 worker outputs into ${chosenOutcome} (${det.finalScore}/100).`,
          confidenceScore: det.confidenceLevel,
          evidence: [
            'Model: gemini-4-hydrogen',
            det.overriddenByCriticalRisk ? 'Critical risk override enforced' : 'Standard rubric scoring applied',
          ],
          riskLevel: det.riskAssessment.overallLevel,
          executionDurationMs: orchestratorDuration,
        },
      ],
    };

    reportCache.set(params.token.mint, { report, expiresAt: Date.now() + 180_000 });
    return report;
  } catch (err: any) {
    console.error('Gemini orchestrator fallback:', err?.message || err);
    const fallback = buildFallbackNarrativeReport({
      ...params,
      reason: err?.message || 'Gemini API request failed',
    });
    reportCache.set(params.token.mint, { report: fallback, expiresAt: Date.now() + 60_000 });
    return fallback;
  }
}

export async function generatePortfolioAdvisorPlan(params: {
  account: ManagedAccount;
  positions: PaperPosition[];
  liveTokens: TokenMarketData[];
  candidates: CandidateWithAudit[];
  availableCashUsd: number;
  walletIntel?: WalletIntelligenceProfile | null;
}): Promise<PortfolioAdvisorPlan> {
  const { account, positions, liveTokens, candidates, availableCashUsd, walletIntel } = params;
  const nowUtc = new Date().toISOString();

  const tokenMap = new Map(liveTokens.map((t) => [t.mint, t]));
  const openVal = positions.reduce((sum, p) => {
    const px = tokenMap.get(p.mint)?.priceUsd ?? p.avgEntryPriceUsd;
    return sum + p.quantity * px;
  }, 0);
  const totalEquityUsd = Math.max(100, availableCashUsd + openVal);

  const rankedOptions = rankBestTradeOptions({
    candidates,
    account,
    availableCashUsd,
    totalEquityUsd,
  });

  const bestTradePick = rankedOptions[0] ?? null;
  const alternativeOptions = rankedOptions.slice(1, 4);

  const portfolioActions = analyzePortfolioForAccount({
    account,
    positions,
    liveTokens,
    availableCashUsd,
    bestTradePick,
  });

  const defaultWarnings = [
    'Memecoin prices and pool liquidity can contract rapidly; stop-loss execution in paper or live DEX markets is subject to slippage.',
    ...(account.kind === 'SOLANA_WALLET'
      ? ['Connected Solana wallet trades always require explicit user signature in Phantom/Solflare; agents never hold keys or auto-sign live transactions.']
      : []),
    ...(!bestTradePick
      ? [`No live candidate passed all ${account.riskProfile} liquidity and on-chain safety gates.`]
      : []),
  ];

  const defaultSummary = bestTradePick
    ? `Portfolio Agents evaluated ${candidates.length} RPC-audited Solana tokens and ${positions.length} open positions for "${account.name}" (${account.riskProfile}). Top candidate: ${bestTradePick.symbol} (${bestTradePick.score}/100, liquidity $${Math.round(
        bestTradePick.liquidityUsd
      ).toLocaleString()}), with ${portfolioActions.length} actionable portfolio recommendations.`
    : `Portfolio Agents reviewed ${positions.length} open positions for "${account.name}". No new token cleared ${account.riskProfile} liquidity/safety gates; hold cash and monitor existing exposure.`;

  const ai = createGeminiClient();
  if (!ai) {
    return {
      accountId: account.id,
      accountName: account.name,
      generatedAtUtc: nowUtc,
      orchestratorModel: 'deterministic-portfolio-engine',
      llmSynthesized: false,
      bestTradePick,
      alternativeOptions,
      portfolioActions,
      executiveSummary: defaultSummary,
      riskWarnings: defaultWarnings,
    };
  }

  try {
    const promptPayload = {
      account: {
        name: account.name,
        kind: account.kind,
        riskProfile: account.riskProfile,
        mandateMode: account.mandateMode,
        availableCashUsd,
        totalEquityUsd,
        maxPositionPct: account.maxPositionPct,
        stopLossPct: account.stopLossPct,
        takeProfitPct: account.takeProfitPct,
      },
      walletSolBalance: walletIntel?.solBalance ?? null,
      walletHoldingsCount: walletIntel?.holdings.length ?? 0,
      bestTradePick: bestTradePick
        ? {
            symbol: bestTradePick.symbol,
            score: bestTradePick.score,
            riskLevel: bestTradePick.riskLevel,
            liquidityUsd: bestTradePick.liquidityUsd,
            volume24hUsd: bestTradePick.volume24hUsd,
            priceChange1h: bestTradePick.priceChange1h,
            suggestedUsd: bestTradePick.suggestedUsd,
            mintAuthorityRevoked: bestTradePick.mintAuthorityRevoked,
            freezeAuthorityRevoked: bestTradePick.freezeAuthorityRevoked,
          }
        : null,
      portfolioActions: portfolioActions.map((p) => ({
        action: p.action,
        symbol: p.symbol,
        suggestedUsd: p.suggestedUsd,
        reason: p.reason,
      })),
    };

    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Synthesize an institutional portfolio management & best-trade briefing for this trading account using ONLY the supplied facts. Never guarantee profit or claim autonomous live signing.\n\nData:\n${JSON.stringify(
          promptPayload,
          null,
          2
        )}`,
        config: {
          systemInstruction:
            'You are the Chief Portfolio & Risk Analyst of MULTITRADE AI. Provide concise, disciplined, risk-first portfolio commentary strictly grounded in supplied telemetry.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executiveSummary: { type: Type.STRING },
              bestTradeRationale: { type: Type.STRING },
              riskWarnings: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['executiveSummary', 'bestTradeRationale', 'riskWarnings'],
          },
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini portfolio synthesis timed out after 15s')), 15_000)
      ),
    ]);

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      executiveSummary?: string;
      bestTradeRationale?: string;
      riskWarnings?: string[];
    };

    const enrichedBestPick =
      bestTradePick && parsed.bestTradeRationale
        ? { ...bestTradePick, rationale: parsed.bestTradeRationale }
        : bestTradePick;

    return {
      accountId: account.id,
      accountName: account.name,
      generatedAtUtc: nowUtc,
      orchestratorModel: 'gemini-4-hydrogen',
      llmSynthesized: true,
      bestTradePick: enrichedBestPick,
      alternativeOptions,
      portfolioActions,
      executiveSummary: parsed.executiveSummary || defaultSummary,
      riskWarnings: parsed.riskWarnings?.length ? parsed.riskWarnings : defaultWarnings,
    };
  } catch (err: any) {
    console.error('Gemini portfolio advisor fallback:', err?.message || err);
    return {
      accountId: account.id,
      accountName: account.name,
      generatedAtUtc: nowUtc,
      orchestratorModel: 'deterministic-portfolio-fallback',
      llmSynthesized: false,
      bestTradePick,
      alternativeOptions,
      portfolioActions,
      executiveSummary: defaultSummary,
      riskWarnings: defaultWarnings,
    };
  }
}

export interface SearchGroundedBrief {
  available: boolean;
  symbol: string;
  name: string;
  mint?: string;
  summary: string;
  citations: Array<{ title: string; uri: string }>;
  searchQueries: string[];
  model: string;
  generatedAtUtc: string;
  error?: string;
}

export async function generateSearchGroundedCoinBrief(params: {
  symbol: string;
  name: string;
  mint?: string;
  priceUsd?: number;
  marketCapUsd?: number;
  volume24hUsd?: number;
  priceChange1h?: number;
  priceChange24h?: number;
  customQuery?: string;
}): Promise<SearchGroundedBrief> {
  const nowUtc = new Date().toISOString();
  const ai = getGeminiServerClient();

  if (!ai) {
    return {
      available: false,
      symbol: params.symbol,
      name: params.name,
      mint: params.mint,
      summary:
        'Live Google Search web narrative requires a server-side GEMINI_API_KEY. Live on-chain metrics, liquidity, and DEX telemetry remain fully active.',
      citations: [],
      searchQueries: [],
      model: 'gemini-4-hydrogen',
      generatedAtUtc: nowUtc,
      error: 'GEMINI_API_KEY not configured on server',
    };
  }

  try {
    const prompt = params.customQuery
      ? `${params.customQuery} (Solana / Pump.fun token ${params.name} $${params.symbol}${params.mint ? `, mint ${params.mint}` : ''})`
      : `Provide a concise, objective market intelligence brief for the Solana token "${params.name}" ($${params.symbol})${
          params.mint ? ` (mint ${params.mint})` : ''
        }. Summarize current news, catalysts, community narrative, and notable risks visible on the open web today. Keep it to 3-5 crisp bullet points without price guarantees. Live telemetry context: Price $${params.priceUsd ?? 'N/A'}, MCap $${Math.round(params.marketCapUsd ?? 0).toLocaleString()}, 24h Vol $${Math.round(params.volume24hUsd ?? 0).toLocaleString()}, 1h ${params.priceChange1h?.toFixed(1) ?? '0'}%.`;

    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are a quantitative Solana crypto research analyst for MULTITRADE AI. Use Google Search grounding to report verifiable web context, news, social catalysts, and risks concisely. Never fabricate links or guarantee price returns.',
          tools: [{ googleSearch: {} }],
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Google Search grounding request timed out after 18s')), 18_000)
      ),
    ]);

    const groundingMeta = response.candidates?.[0]?.groundingMetadata as
      | {
          groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
          webSearchQueries?: string[];
        }
      | undefined;

    const citationsMap = new Map<string, { title: string; uri: string }>();
    for (const chunk of groundingMeta?.groundingChunks ?? []) {
      const uri = chunk.web?.uri;
      if (uri && !citationsMap.has(uri)) {
        citationsMap.set(uri, {
          title: chunk.web?.title || uri,
          uri,
        });
      }
    }

    return {
      available: true,
      symbol: params.symbol,
      name: params.name,
      mint: params.mint,
      summary: (response.text ?? '').trim() || 'No grounded summary text returned.',
      citations: Array.from(citationsMap.values()).slice(0, 8),
      searchQueries: groundingMeta?.webSearchQueries ?? [],
      model: 'gemini-4-hydrogen',
      generatedAtUtc: nowUtc,
    };
  } catch (err: any) {
    const rawMsg = String(err?.message || '');
    const isQuota = /429|RESOURCE_EXHAUSTED|quota/i.test(rawMsg);
    const friendlyMsg = isQuota
      ? 'Google Search grounding quota is temporarily exhausted for the current server key. Live DEX, liquidity, and on-chain metrics remain active.'
      : 'Live web search briefing is temporarily unavailable. On-chain Solana telemetry remains active.';
    return {
      available: false,
      symbol: params.symbol,
      name: params.name,
      mint: params.mint,
      summary: friendlyMsg,
      citations: [],
      searchQueries: [],
      model: 'gemini-4-hydrogen',
      generatedAtUtc: nowUtc,
      error: isQuota ? 'Quota temporarily exhausted (429)' : 'Search grounding unavailable',
    };
  }
}


