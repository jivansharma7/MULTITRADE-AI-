import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Cpu,
  Shield,
  Terminal,
  TrendingUp,
} from 'lucide-react';
import { formatQuoteCurrency } from '../shared/currency';
import { SUBSCRIPTION_PLANS } from '../shared/plans';
import { getRegistryStats } from '../shared/agentRegistry';
import type { TokenMarketData } from '../shared/types';
import { useAuth } from '../contexts/AuthContext';

interface LandingPageProps {
  onEnterTerminal: (initialTab?: string) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

const FAQ_ITEMS = [
  {
    q: 'Does MEMEINTEL AI fabricate token prices or simulated market feeds?',
    a: 'No. Market prices, pool liquidity, buy/sell counts, and OHLCV candlesticks are sourced from live Solana DEX feeds (DexScreener, GeckoTerminal, Pump.fun) and Solana JSON-RPC. Any metric that cannot be verified on-chain is explicitly marked UNKNOWN.',
  },
  {
    q: 'How does the 130-agent architecture avoid slow or costly LLM bottlenecks?',
    a: 'Quantitative checks (mint authority, freeze authority, concentration, buy/sell imbalance, technical RSI/EMA, exit liquidity stress) run in parallel inside deterministic TypeScript workers. Only final narrative synthesis calls the Gemini Chief AI Orchestrator, with job deduplication and caching.',
  },
  {
    q: 'Are private keys or seed phrases ever collected when connecting Phantom or Solflare?',
    a: 'Never. MEMEINTEL AI connects strictly through standard Solana public-key providers or read-only addresses. Live trading is disabled by default and requires explicit human signature approval inside your wallet.',
  },
  {
    q: 'Does an AI TRADE CANDIDATE score guarantee profit?',
    a: 'Never. Memecoin markets carry extreme volatility and liquidity contraction risk. AI reports provide structured evidence, risk warnings, and invalidation levels for research only.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onEnterTerminal,
  onOpenAuth,
}) => {
  const { profile, fxRates, user } = useAuth();
  const [liveTokens, setLiveTokens] = useState<TokenMarketData[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const registryStats = getRegistryStats();

  useEffect(() => {
    let active = true;
    fetch('/api/tokens/scanner?pageSize=6&sort=volume24h')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.items) {
          setLiveTokens(data.items);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingTokens(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#070B14]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            MEMEINTEL AI
          </a>

          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-400 md:flex">
            <a href="#markets" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Markets
            </a>
            <a href="#intelligence" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Intelligence
            </a>
            <a href="#security" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Security
            </a>
            <a href="#pricing" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Pricing
            </a>
            <a href="#faq" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onEnterTerminal('dashboard')}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap shrink-0"
            >
              <span>Open Terminal</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-slate-800/70">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-stretch gap-10 px-6 py-16 lg:grid-cols-12 lg:py-24">
            <div className="flex flex-col justify-center lg:col-span-6">
              <p className="text-xs font-medium tracking-wide text-blue-400">
                Intelligence Before Every Trade · Pump.fun & Solana Ecosystem
              </p>
              <h1
                className="mt-4 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl"
                style={{ textWrap: 'balance' }}
              >
                Trade Smarter. Analyze Deeper. Detect Risk Earlier.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300">
                MEMEINTEL AI unifies live Pump.fun & Solana DEX discovery, on-chain SPL authority verification, whale wallet inspection, deterministic backtesting, and a 130-role multi-agent architecture inside one institutional terminal.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onEnterTerminal('scanner')}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap"
                >
                  <Terminal className="h-4 w-4" />
                  Launch Live Scanner
                </button>
                {user ? (
                  <button
                    type="button"
                    onClick={() => onEnterTerminal('dashboard')}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1322] px-5 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:text-white whitespace-nowrap"
                  >
                    Go to Workspace
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenAuth('register')}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1322] px-5 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:text-white whitespace-nowrap"
                  >
                    Get Started Free
                  </button>
                )}
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-800/80 pt-6 text-xs text-slate-400">
                <span className="font-mono tabular-nums text-slate-200 whitespace-nowrap">
                  {registryStats.total} Registered Agent Roles ({registryStats.operational} Live Workers)
                </span>
                <span className="whitespace-nowrap">12-Check Rug &amp; Authority Matrix</span>
                <span className="whitespace-nowrap">Paper Mode Default ($10,000 Virtual)</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-full min-h-[300px] overflow-hidden rounded-xl border border-slate-800 bg-[#0D1322]">
                <img
                  src="/src/assets/images/hero_terminal_backdrop_1794549544523.jpg"
                  alt="MEMEINTEL AI quantitative liquidity and intelligence topology"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#070B14] via-[#070B14]/25 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/90 bg-[#070B14]/90 px-4 py-3 text-xs backdrop-blur-sm">
                  <div>
                    <div className="font-medium text-white">Live Solana RPC & DEX Feeds</div>
                    <div className="text-slate-400">
                      DexScreener · GeckoTerminal OHLCV · Mainnet SPL Audit
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEnterTerminal('dashboard')}
                    className="rounded-md bg-blue-600/20 px-3 py-1.5 font-medium text-blue-300 hover:bg-blue-600/30 whitespace-nowrap"
                  >
                    Inspect Live Feed
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live Market Preview Section */}
        <section id="markets" className="border-b border-slate-800/70 bg-[#0A0F1C]">
          <div className="mx-auto max-w-7xl px-6 py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                  Live Solana & Pump.fun Market Preview
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Real-time pair telemetry fetched directly from Solana DEX feeds. Click any token to open its full analysis terminal.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onEnterTerminal('scanner')}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300"
              >
                Open Full Token Scanner
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-8 overflow-x-auto rounded-xl border border-slate-800 bg-[#0D1322]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 text-xs text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Token</th>
                    <th className="px-4 py-3 font-medium">Venue</th>
                    <th className="px-4 py-3 text-right font-medium">Price</th>
                    <th className="px-4 py-3 text-right font-medium">1h Change</th>
                    <th className="px-4 py-3 text-right font-medium">24h Volume</th>
                    <th className="px-4 py-3 text-right font-medium">Liquidity</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {loadingTokens ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="h-4 w-full rounded bg-slate-800/70" />
                        </td>
                      </tr>
                    ))
                  ) : liveTokens.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-400">
                        Live market feed temporarily unavailable. Open Terminal to inspect connection diagnostics.
                      </td>
                    </tr>
                  ) : (
                    liveTokens.map((t) => (
                      <tr key={t.mint} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{t.symbol}</div>
                          <div className="text-xs text-slate-400 truncate max-w-[180px]">{t.name}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">
                          {t.dexId} · {t.migrationStatus}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-100 tabular-nums">
                          {formatQuoteCurrency(t.priceUsd, profile.quoteCurrency, fxRates)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono text-xs tabular-nums ${
                            t.priceChange1h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {t.priceChange1h >= 0 ? '+' : ''}
                          {t.priceChange1h.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-200 tabular-nums">
                          {formatQuoteCurrency(t.volume24hUsd, profile.quoteCurrency, fxRates, true)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-200 tabular-nums">
                          {formatQuoteCurrency(t.liquidityUsd, profile.quoteCurrency, fxRates, true)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => onEnterTerminal(`token:${t.mint}`)}
                            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500/60 hover:text-white whitespace-nowrap"
                          >
                            Analyze
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 130-Agent Intelligence & How It Works */}
        <section id="intelligence" className="border-b border-slate-800/70">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0D1322]">
                <img
                  src="/src/assets/images/agent_orchestrator_diagram_1794549546779.jpg"
                  alt="130-role multi-agent orchestration architecture"
                  referrerPolicy="no-referrer"
                  className="h-auto w-full object-cover"
                />
              </div>
            </div>

            <div className="lg:col-span-7">
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                130-Role Multi-Agent Intelligence Pipeline
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                Organized across 12 specialized quantitative, blockchain, risk, and execution departments. Deterministic workers compute hard metrics asynchronously before the Gemini Chief Orchestrator synthesizes evidence-backed research reports.
              </p>

              <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-[#0D1322] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Cpu className="h-4 w-4 text-blue-400" />
                    01. Deterministic Workers First
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    17 live analytical workers inspect SPL mint/freeze authorities, top-10 holder concentration, buy/sell imbalance, RSI/EMA, and exit liquidity in milliseconds.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-[#0D1322] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <TrendingUp className="h-4 w-4 text-indigo-400" />
                    02. 100-Point Scoring Rubric
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    Configurable 8-category scorecard (On-Chain 15, Liquidity 15, Wallets 15, Momentum 15, Social 10, Distribution 10, Technical 10, Execution 10).
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-[#0D1322] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Shield className="h-4 w-4 text-rose-400" />
                    03. Critical Risk Override
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    Active Mint/Freeze authority, zero liquidity, or honeypot sell locks automatically override high momentum scores down to REJECT or HIGH RISK.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-[#0D1322] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Terminal className="h-4 w-4 text-emerald-400" />
                    04. Paper & Backtest Validation
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    Validate thesis ideas across 7 zero-lookahead Strategy Lab models and execute simulated orders in Paper Mode before risking real capital.
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => onEnterTerminal('agents')}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1322] px-4 py-2 text-xs font-semibold text-white hover:border-blue-500/60"
                >
                  Inspect All 130 Agent Roles
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Security Architecture Section */}
        <section id="security" className="border-b border-slate-800/70 bg-[#0A0F1C]">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                Non-Custodial Security & Human-Approved Execution
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                Built from the ground up to isolate analytical AI agents from wallet signing capabilities.
              </p>

              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                <li className="border-b border-slate-800/70 pb-3">
                  <span className="font-semibold text-white">Zero Seed Phrases or Private Keys:</span> Never collected, stored, or transmitted to AI models or databases.
                </li>
                <li className="border-b border-slate-800/70 pb-3">
                  <span className="font-semibold text-white">Paper Trading Default:</span> Every new workspace starts with $10,000 virtual capital; live execution is disabled by default.
                </li>
                <li className="border-b border-slate-800/70 pb-3">
                  <span className="font-semibold text-white">Honest UNKNOWN Reporting:</span> Unverifiable checks report UNKNOWN instead of falsely claiming a token is safe.
                </li>
                <li className="pb-1">
                  <span className="font-semibold text-white">Explicit Pre-Trade Previews:</span> Live transaction preparation shows mint, estimated price impact, slippage, and network priority fees prior to user signature.
                </li>
              </ul>
            </div>

            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0D1322]">
                <img
                  src="/src/assets/images/security_vault_visual_1794549546239.jpg"
                  alt="MEMEINTEL AI cryptographic security module"
                  referrerPolicy="no-referrer"
                  className="h-auto w-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Subscription Plans */}
        <section id="pricing" className="border-b border-slate-800/70">
          <div className="mx-auto max-w-7xl px-6 py-20">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                Transparent Institutional Plans
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Configurable subscription tiers with explicit usage limits. Paper trading and live market scanning start free.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
              {SUBSCRIPTION_PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={`flex flex-col justify-between rounded-xl border p-6 ${
                    plan.id === 'PRO'
                      ? 'border-blue-500/60 bg-[#0D1322]'
                      : 'border-slate-800 bg-[#0D1322]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                      <span className="text-xs text-slate-400">{plan.audience}</span>
                    </div>
                    <div className="mt-4 flex items-baseline gap-1 font-mono tabular-nums">
                      <span className="text-3xl font-bold text-white">
                        {formatQuoteCurrency(plan.monthlyUsd, profile.quoteCurrency, fxRates)}
                      </span>
                      <span className="text-xs text-slate-400">/ month</span>
                    </div>

                    <ul className="mt-6 space-y-2.5 text-xs text-slate-300">
                      {plan.features.map((feat) => (
                        <li key={feat} className="leading-relaxed">
                          · {feat}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => onEnterTerminal('settings')}
                    className={`mt-6 w-full rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors ${
                      plan.id === 'PRO'
                        ? 'bg-blue-600 text-white hover:bg-blue-500'
                        : 'border border-slate-700 bg-[#070B14] text-slate-200 hover:border-slate-500'
                    }`}
                  >
                    {plan.monthlyUsd === 0 ? 'Start Free in Terminal' : `Configure ${plan.name}`}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-b border-slate-800/70 bg-[#0A0F1C]">
          <div className="mx-auto max-w-4xl px-6 py-20">
            <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
              Frequently Asked Questions
            </h2>
            <div className="mt-8 divide-y divide-slate-800 border-y border-slate-800">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={item.q} className="py-4">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-4 text-left text-sm font-medium text-white hover:text-blue-300"
                    >
                      <span>{item.q}</span>
                      {isOpen ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      )}
                    </button>
                    {isOpen && (
                      <p className="mt-3 text-xs leading-relaxed text-slate-400">{item.a}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="bg-[#070B14] px-6 py-10 text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <div className="font-display text-sm font-semibold text-slate-200">MEMEINTEL AI</div>
            <p className="mt-1">
              Intelligence Before Every Trade. Research & simulation platform — not financial advice.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <button type="button" onClick={() => onEnterTerminal('legal')} className="hover:text-slate-300">
              Terms of Service
            </button>
            <button type="button" onClick={() => onEnterTerminal('legal')} className="hover:text-slate-300">
              Privacy Policy
            </button>
            <button type="button" onClick={() => onEnterTerminal('legal')} className="hover:text-slate-300">
              Risk Disclosures
            </button>
            <button type="button" onClick={() => onOpenAuth('login')} className="hover:text-slate-300">
              Account Sign In
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
