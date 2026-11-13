import React from 'react';
import { AlertTriangle, FileText, Lock, ShieldCheck } from 'lucide-react';
import type { DataProviderStatus } from '../shared/types';
import heroBackdrop from '../assets/images/hero_terminal_backdrop_1794549544523.jpg';
import agentDiagram from '../assets/images/agent_orchestrator_diagram_1794549546779.jpg';
import securityVault from '../assets/images/security_vault_visual_1794549546239.jpg';

interface AboutAndLegalViewProps {
  page: 'about' | 'privacy' | 'terms' | 'risk';
  providers: DataProviderStatus[];
  onNavigate: (tab: string) => void;
}

export const AboutAndLegalView: React.FC<AboutAndLegalViewProps> = ({
  page,
  providers,
  onNavigate,
}) => {
  const tabs: Array<{ id: 'about' | 'privacy' | 'terms' | 'risk'; label: string }> = [
    { id: 'about', label: 'About MULTITRADE AI' },
    { id: 'privacy', label: 'Privacy Policy' },
    { id: 'terms', label: 'Terms of Service' },
    { id: 'risk', label: 'Risk Disclosure' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">
            {tabs.find((t) => t.id === page)?.label}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            MULTITRADE AI — Intelligence Before Every Trade. Free Global Pump.fun &amp; Solana Analytics Platform.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-[#0D1322] p-1 text-xs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onNavigate(t.id)}
              className={`rounded px-3 py-1.5 font-medium ${
                page === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {page === 'about' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0D1322] p-6 lg:col-span-7">
              <h2 className="text-lg font-semibold text-white">
                Global Real-Time Solana &amp; Pump.fun Market Transparency
              </h2>
              <p className="text-xs leading-relaxed text-slate-300">
                MULTITRADE AI provides free, open access to live Pump.fun and Solana memecoin market discovery, holder concentration audits, on-chain transaction feeds, whale tracking, public wallet portfolio analytics, and AI-assisted risk research.
              </p>
              <p className="text-xs leading-relaxed text-slate-300">
                Every core market capability is accessible immediately without mandatory account sign-up, subscription paywalls, or wallet custody. When a data source does not expose a field (such as incomplete historical cost basis or off-chain social handles), MULTITRADE AI reports &ldquo;Data unavailable&rdquo; instead of inventing numbers.
              </p>
              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3 text-xs">
                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                  <div className="font-semibold text-white">Free Public Access</div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    All live tokens, charts, whale feeds, and public wallet tracking remain 100% open.
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                  <div className="font-semibold text-white">Read-Only Analytics</div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    No automatic trading, no custody, and no private key collection.
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                  <div className="font-semibold text-white">Multi-Source Data</div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    Solana RPC, Pump.fun, DexScreener, GeckoTerminal, Helius, and Birdeye.
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0D1322] lg:col-span-5">
              <img
                src={heroBackdrop}
                alt="MULTITRADE AI quantitative analytics architecture"
                className="h-56 w-full object-cover"
              />
              <div className="p-4 text-xs text-slate-400">
                Designed for high-speed Solana token discovery, bonding-curve graduation monitoring, and verifiable holder distribution auditing.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0D1322]">
              <img
                src={agentDiagram}
                alt="MULTITRADE AI 130-agent analysis workflow"
                className="h-44 w-full object-cover"
              />
              <div className="p-5 text-xs space-y-2">
                <h3 className="text-sm font-semibold text-white">Multi-Agent Research Pipeline</h3>
                <p className="leading-relaxed text-slate-400">
                  Deterministic TypeScript workers evaluate SPL mint/freeze authority flags, liquidity depth, top holder concentration, and buy/sell symmetry before Gemini synthesis produces structured summaries.
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0D1322]">
              <img
                src={securityVault}
                alt="MULTITRADE AI non-custodial read-only architecture"
                className="h-44 w-full object-cover"
              />
              <div className="p-5 text-xs space-y-2">
                <h3 className="text-sm font-semibold text-white">Zero-Custody Architecture</h3>
                <p className="leading-relaxed text-slate-400">
                  Portfolio lookups inspect public Solana addresses over read-only RPC endpoints. Private keys and recovery phrases are never accepted or transmitted.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
            <h3 className="mb-3 text-sm font-semibold text-white">Connected Ecosystem Data Providers</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {providers.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-slate-800 bg-[#070B14] p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{p.name}</span>
                    <span
                      className={`font-mono text-[10px] font-semibold ${
                        p.statusLabel === 'OPERATIONAL' ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {p.statusLabel}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">{p.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {page === 'privacy' && (
        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-6 space-y-4 text-xs leading-relaxed text-slate-300">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Lock className="h-4 w-4 text-blue-400" />
            Privacy &amp; Key Isolation Policy
          </div>
          <p>
            MULTITRADE AI is built for frictionless public analytics. Browsing live markets, inspecting tokens, viewing whale feeds, and looking up public Solana wallet portfolios require no account registration.
          </p>
          <p>
            Watchlists, saved public wallet addresses, alert rules, and display preferences (currency and timezone) are stored locally in your browser (`localStorage`). If you optionally sign in with Firebase Authentication, those preferences sync securely under your user ID so you can access them across devices.
          </p>
          <p>
            <strong>Strict Non-Custodial Guarantee:</strong> MULTITRADE AI never requests, accepts, transmits, or stores private keys, seed phrases, or signing secrets. All wallet portfolio features operate strictly on public base58 Solana addresses.
          </p>
        </div>
      )}

      {page === 'terms' && (
        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-6 space-y-4 text-xs leading-relaxed text-slate-300">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <FileText className="h-4 w-4 text-blue-400" />
            Terms of Service
          </div>
          <p>
            MULTITRADE AI is provided strictly as an informational blockchain analytics and portfolio visualization platform. Nothing on this website constitutes investment advice, brokerage, custody, or automated trade execution.
          </p>
          <p>
            Market prices, liquidity figures, OHLCV candles, token creation timestamps, and transaction logs are aggregated from third-party public blockchain endpoints (Solana RPC, Pump.fun, DexScreener, GeckoTerminal, Helius, and Birdeye). Availability and latency depend on upstream network conditions.
          </p>
          <p>
            This release does not enable automated trading or submit on-chain transactions. Users assume full responsibility for verifying any contract address or market figure directly on-chain before making external decisions.
          </p>
        </div>
      )}

      {page === 'risk' && (
        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-6 space-y-4 text-xs leading-relaxed text-slate-300">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-400">
            <AlertTriangle className="h-4 w-4" />
            Memecoin &amp; On-Chain Risk Disclosure
          </div>
          <p>
            Solana memecoins and newly created Pump.fun bonding-curve tokens carry extreme financial and technical risk, including rapid total loss of capital, severe price slippage, thin exit liquidity, developer supply concentration, unrevoked mint or freeze authorities, and coordinated wallet dumping.
          </p>
          <p>
            Automated risk indicators and MULTITRADE AI analytical reports highlight observable on-chain patterns such as authority flags and top holder concentration, but they cannot guarantee safety against novel exploits, off-chain collusion, or sudden liquidity withdrawals.
          </p>
          <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-[#070B14] p-3 text-slate-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              Always verify token mint addresses, liquidity lock status, and holder distribution independently, and never share private keys with any website.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
