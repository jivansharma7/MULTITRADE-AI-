import React, { useEffect, useState } from 'react';
import { ArrowRight, BrainCircuit, Cpu, Layers, Search, ShieldAlert } from 'lucide-react';
import { formatQuoteCurrency, formatUtcOrLocalTimestamp } from '../shared/currency';
import type {
  AiIntelligenceReport,
  OnChainTokenAudit,
  RugRiskAssessment,
  SocialIntelligenceSummary,
  TokenMarketData,
} from '../shared/types';
import { useAuth } from '../contexts/AuthContext';
import { AgentCenterView } from './AgentCenterView';
import { AiOutcomeTag, RiskLevelTag } from './ui/RiskBadge';

interface AiIntelligenceViewProps {
  tokens: TokenMarketData[];
  onSelectToken: (mint: string) => void;
}

export const AiIntelligenceView: React.FC<AiIntelligenceViewProps> = ({
  tokens,
  onSelectToken,
}) => {
  const { profile, fxRates, recentReports, recordAiReport } = useAuth();
  const [subTab, setSubTab] = useState<'intelligence' | 'agents'>('intelligence');
  const [selectedMint, setSelectedMint] = useState<string>('');
  const [customMint, setCustomMint] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [telemetry, setTelemetry] = useState<{
    token: TokenMarketData;
    audit: OnChainTokenAudit;
    social: SocialIntelligenceSummary;
    risk: RugRiskAssessment;
  } | null>(null);
  const [report, setReport] = useState<AiIntelligenceReport | null>(null);

  useEffect(() => {
    if (!selectedMint && tokens.length > 0) {
      setSelectedMint(tokens[0].mint);
    }
  }, [tokens, selectedMint]);

  const runAnalysis = async (mintToAnalyze: string) => {
    const cleanMint = mintToAnalyze.trim();
    if (!cleanMint) return;
    setLoading(true);
    setError(null);
    try {
      const [tokenRes, aiRes] = await Promise.all([
        fetch(`/api/tokens/${encodeURIComponent(cleanMint)}`),
        fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mint: cleanMint }),
        }),
      ]);

      const tokenPayload = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error(tokenPayload.error || 'Failed to retrieve live token telemetry.');
      }

      const aiPayload = await aiRes.json();
      if (!aiRes.ok) {
        throw new Error(aiPayload.error || 'MULTITRADE AI analysis failed.');
      }

      setTelemetry({
        token: tokenPayload.token,
        audit: tokenPayload.audit,
        social: tokenPayload.social,
        risk: tokenPayload.riskAssessment,
      });
      setReport(aiPayload);
      recordAiReport(aiPayload);
    } catch (err: any) {
      setError(err?.message || 'Unable to execute AI intelligence analysis.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white flex items-center gap-2.5">
            <BrainCircuit className="h-6 w-6 text-blue-400" />
            MULTITRADE AI Intelligence
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Informational multi-agent token research separating verified on-chain telemetry from AI-generated analytical interpretation.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#0D1322] p-1 text-xs">
          <button
            type="button"
            onClick={() => setSubTab('intelligence')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-medium ${
              subTab === 'intelligence'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BrainCircuit className="h-3.5 w-3.5" />
            Token Intelligence
          </button>
          <button
            type="button"
            onClick={() => setSubTab('agents')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-medium ${
              subTab === 'agents'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            130-Agent Registry
          </button>
        </div>
      </div>

      {subTab === 'agents' ? (
        <AgentCenterView />
      ) : (
        <div className="space-y-6">
          {/* Token Selector & Runner */}
          <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <label htmlFor="ai-live-select" className="block text-xs font-medium text-slate-300">
                  Select Live Token
                </label>
                <select
                  id="ai-live-select"
                  value={selectedMint}
                  onChange={(e) => {
                    setSelectedMint(e.target.value);
                    setCustomMint('');
                  }}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-white"
                >
                  {tokens.map((t) => (
                    <option key={t.mint} value={t.mint}>
                      {t.symbol} — {t.name} ({formatQuoteCurrency(t.liquidityUsd, profile.quoteCurrency, fxRates)} Liq)
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-5">
                <label htmlFor="ai-custom-mint" className="block text-xs font-medium text-slate-300">
                  Or Enter Any Pump.fun / Solana Mint Address
                </label>
                <div className="relative mt-1.5">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                  <input
                    id="ai-custom-mint"
                    type="text"
                    value={customMint}
                    onChange={(e) => setCustomMint(e.target.value)}
                    placeholder="Paste base58 token mint address..."
                    className="w-full rounded-lg border border-slate-700 bg-[#070B14] py-2 pl-9 pr-3 font-mono text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-end lg:col-span-2">
                <button
                  type="button"
                  disabled={loading || !(customMint.trim() || selectedMint)}
                  onClick={() => runAnalysis(customMint.trim() || selectedMint)}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {loading ? 'Analyzing...' : 'Run AI Analysis'}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
                {error}
              </div>
            )}
          </div>

          {report && telemetry ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left: Factual Telemetry Block */}
              <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0D1322] p-5 lg:col-span-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-400">
                      Factual On-Chain Telemetry
                    </div>
                    <h2 className="mt-1 text-lg font-semibold text-white">
                      {telemetry.token.symbol} · {telemetry.token.name}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectToken(telemetry.token.mint)}
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                  >
                    <span>Chart</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5">
                    <div className="text-[10px] text-slate-400">Price</div>
                    <div className="mt-0.5 font-mono font-semibold text-white tabular-nums">
                      {formatQuoteCurrency(telemetry.token.priceUsd, profile.quoteCurrency, fxRates)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5">
                    <div className="text-[10px] text-slate-400">Liquidity</div>
                    <div className="mt-0.5 font-mono font-semibold text-white tabular-nums">
                      {formatQuoteCurrency(telemetry.token.liquidityUsd, profile.quoteCurrency, fxRates)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5">
                    <div className="text-[10px] text-slate-400">Market Cap</div>
                    <div className="mt-0.5 font-mono font-semibold text-white tabular-nums">
                      {telemetry.token.marketCapUsd > 0
                        ? formatQuoteCurrency(telemetry.token.marketCapUsd, profile.quoteCurrency, fxRates)
                        : 'Data unavailable'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5">
                    <div className="text-[10px] text-slate-400">24h Volume</div>
                    <div className="mt-0.5 font-mono font-semibold text-white tabular-nums">
                      {formatQuoteCurrency(telemetry.token.volume24hUsd, profile.quoteCurrency, fxRates)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5">
                    <div className="text-[10px] text-slate-400">Mint Authority</div>
                    <div
                      className={`mt-0.5 font-mono font-semibold ${
                        telemetry.audit.mintAuthorityRevoked ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {telemetry.audit.mintAuthorityRevoked === null
                        ? 'Data unavailable'
                        : telemetry.audit.mintAuthorityRevoked
                        ? 'Revoked'
                        : 'Active'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5">
                    <div className="text-[10px] text-slate-400">Top 10 Holders</div>
                    <div className="mt-0.5 font-mono font-semibold text-white tabular-nums">
                      {telemetry.audit.top10ConcentrationPct !== null
                        ? `${telemetry.audit.top10ConcentrationPct}%`
                        : 'Data unavailable'}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3 text-[11px] text-slate-400">
                  Source: {telemetry.token.source} + Solana RPC · Timestamp:{' '}
                  {formatUtcOrLocalTimestamp(telemetry.token.lastUpdatedUtc, profile.timezone)}
                </div>
              </div>

              {/* Right: AI Interpretation Block */}
              <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0D1322] p-5 lg:col-span-8">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-blue-400">
                      MULTITRADE AI Analytical Interpretation
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <span className="font-mono text-2xl font-bold text-white tabular-nums">
                        {report.overallScore}/100
                      </span>
                      <AiOutcomeTag outcome={report.outcome} />
                      <RiskLevelTag level={telemetry.risk.overallLevel} />
                    </div>
                  </div>

                  <div className="text-right font-mono text-[11px] text-slate-400">
                    <div>Model: {report.orchestratorModel}</div>
                    <div>{report.agentResults.length} active workers · {report.confidenceLevel}% conf</div>
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-slate-200">{report.explanation}</p>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3.5">
                    <div className="text-xs font-semibold text-emerald-300">Supporting Signals</div>
                    <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
                      {report.bullishEvidence.map((d, i) => (
                        <li key={i}>· {d}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-rose-500/25 bg-rose-500/5 p-3.5">
                    <div className="text-xs font-semibold text-rose-300">Risk &amp; Fragility Warnings</div>
                    <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
                      {report.bearishEvidence.map((d, i) => (
                        <li key={i}>· {d}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Specialist Agent Department Output
                  </h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {report.agentResults.slice(0, 8).map((ar) => (
                      <div
                        key={ar.agentId}
                        className="rounded-lg border border-slate-800 bg-[#070B14] p-3 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{ar.agentName}</span>
                          <span className="font-mono text-[10px] text-blue-400">
                            {ar.confidenceScore}% conf
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-300">{ar.analysisResult}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-[11px] text-amber-200/90">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span>
                    MULTITRADE AI outputs are automated informational research summaries derived from public on-chain and DEX telemetry. They do not constitute financial advice or trade execution instructions.
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-8 text-center">
              <Cpu className="mx-auto h-8 w-8 text-blue-400" />
              <h2 className="mt-3 text-sm font-semibold text-white">
                Select a live token or paste a mint address above
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                MULTITRADE AI runs deterministic on-chain workers alongside Gemini synthesis to surface liquidity, authority, holder concentration, and momentum risk.
              </p>
            </div>
          )}

          {/* Recent Cached Reports */}
          {recentReports.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
              <h2 className="mb-3 text-sm font-semibold text-white">
                Recent Session AI Research Reports
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {recentReports.slice(0, 6).map((r) => (
                  <button
                    key={`${r.mint}-${r.generatedAtUtc}`}
                    type="button"
                    onClick={() => runAnalysis(r.mint)}
                    className="rounded-lg border border-slate-800 bg-[#070B14] p-3 text-left hover:border-blue-500/60"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{r.symbol}</span>
                      <span className="font-mono text-xs text-blue-400">{r.overallScore}/100</span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-[11px] text-slate-400">
                      {r.explanation}
                    </div>
                    <div className="mt-2 font-mono text-[10px] text-slate-500">
                      {formatUtcOrLocalTimestamp(r.generatedAtUtc, profile.timezone)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
