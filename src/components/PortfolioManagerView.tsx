import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Cpu,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { formatQuoteCurrency, formatUtcOrLocalTimestamp } from '../shared/currency';
import {
  AccountRiskProfileValues,
  AgentMandateModeValues,
  ManagedAccountKindValues,
  type AccountRiskProfile,
  type AgentMandateMode,
  type BestTradeOption,
  type ManagedAccountKind,
  type TokenMarketData,
  type WalletIntelligenceProfile,
} from '../shared/types';
import { useAuth } from '../contexts/AuthContext';
import { useWallet } from '../contexts/WalletContext';
import { RiskLevelTag } from './ui/RiskBadge';

interface PortfolioManagerViewProps {
  tokens: TokenMarketData[];
  onSelectToken: (mint: string) => void;
  onInspectWallet: (address: string) => void;
}

export const PortfolioManagerView: React.FC<PortfolioManagerViewProps> = ({
  tokens,
  onSelectToken,
  onInspectWallet,
}) => {
  const {
    profile,
    fxRates,
    positions,
    managedAccounts,
    activeAccountId,
    setActiveAccountId,
    addManagedAccount,
    updateManagedAccount,
    deleteManagedAccount,
    tradeProposals,
    latestAdvisorPlan,
    setAdvisorPlanResult,
    executeProposalInPaper,
    dismissProposal,
    executePaperOrder,
    logAudit,
  } = useAuth();
  const { connectedWallet } = useWallet();

  const activeAccount =
    managedAccounts.find((a) => a.id === activeAccountId) || managedAccounts[0];

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<ManagedAccountKind>('PAPER_DESK');
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [newRiskProfile, setNewRiskProfile] = useState<AccountRiskProfile>('BALANCED');
  const [newMandateMode, setNewMandateMode] = useState<AgentMandateMode>('ADVISORY_ONLY');
  const [newAllocatedUsd, setNewAllocatedUsd] = useState('10000');
  const [newMaxPosPct, setNewMaxPosPct] = useState('20');
  const [newStopLossPct, setNewStopLossPct] = useState('15');
  const [newTakeProfitPct, setNewTakeProfitPct] = useState('35');
  const [formError, setFormError] = useState<string | null>(null);

  const [runningCycle, setRunningCycle] = useState(false);
  const [cycleError, setCycleError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [tokensEvaluatedCount, setTokensEvaluatedCount] = useState<number | null>(null);
  const [linkedWalletIntel, setLinkedWalletIntel] = useState<WalletIntelligenceProfile | null>(
    null
  );

  const tokenMap = useMemo(() => new Map(tokens.map((t) => [t.mint, t])), [tokens]);

  const openMarketValueUsd = useMemo(
    () =>
      positions.reduce((sum, p) => {
        const px = tokenMap.get(p.mint)?.priceUsd ?? p.avgEntryPriceUsd;
        return sum + p.quantity * px;
      }, 0),
    [positions, tokenMap]
  );

  const totalPaperNavUsd = profile.paperBalanceUsd + openMarketValueUsd;

  const accountProposals = useMemo(
    () => tradeProposals.filter((p) => p.accountId === activeAccount?.id),
    [tradeProposals, activeAccount?.id]
  );

  const activePlan =
    latestAdvisorPlan && latestAdvisorPlan.accountId === activeAccount?.id
      ? latestAdvisorPlan
      : null;

  const handleResetForm = () => {
    setNewName('');
    setNewKind('PAPER_DESK');
    setNewWalletAddress('');
    setNewRiskProfile('BALANCED');
    setNewMandateMode('ADVISORY_ONLY');
    setNewAllocatedUsd('10000');
    setNewMaxPosPct('20');
    setNewStopLossPct('15');
    setNewTakeProfitPct('35');
    setFormError(null);
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setFormError('Please enter an account or desk name.');
      return;
    }

    const trimmedWallet = newWalletAddress.trim();
    if (newKind === 'SOLANA_WALLET') {
      if (trimmedWallet.length < 32 || trimmedWallet.length > 64) {
        setFormError('Enter a valid public Solana base58 wallet address (32–64 characters).');
        return;
      }
      if (/\s/.test(trimmedWallet)) {
        setFormError(
          'Invalid address format. Never enter multi-word seed phrases — public wallet address only.'
        );
        return;
      }
    }

    const created = await addManagedAccount({
      name: trimmedName,
      kind: newKind,
      ...(newKind === 'SOLANA_WALLET'
        ? {
            walletAddress: trimmedWallet,
            walletProvider:
              connectedWallet?.publicAddress === trimmedWallet &&
              connectedWallet.provider !== 'Other'
                ? connectedWallet.provider
                : 'ReadOnly',
          }
        : { walletProvider: 'Paper' }),
      riskProfile: newRiskProfile,
      mandateMode: newKind === 'SOLANA_WALLET' ? 'ADVISORY_ONLY' : newMandateMode,
      allocatedUsd: Math.max(0, Number(newAllocatedUsd) || 10000),
      maxPositionPct: Math.min(100, Math.max(1, Number(newMaxPosPct) || 20)),
      stopLossPct: Math.min(95, Math.max(1, Number(newStopLossPct) || 15)),
      takeProfitPct: Math.min(1000, Math.max(1, Number(newTakeProfitPct) || 35)),
    });

    setStatusNotice(
      `Added ${created.kind === 'PAPER_DESK' ? 'Paper Desk' : 'Non-Custodial Wallet'} "${created.name}".`
    );
    handleResetForm();
    setShowAddForm(false);
  };

  const handleRunAdvisorCycle = async () => {
    if (!activeAccount) return;
    setRunningCycle(true);
    setCycleError(null);
    setStatusNotice(null);

    try {
      const res = await fetch('/api/ai/portfolio-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: activeAccount,
          positions,
          availableCashUsd:
            activeAccount.kind === 'PAPER_DESK'
              ? profile.paperBalanceUsd
              : activeAccount.allocatedUsd,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Portfolio advisor failed (${res.status})`);
      }

      const plan = data.plan;
      setTokensEvaluatedCount(data.tokensEvaluated ?? null);
      setLinkedWalletIntel(data.walletIntel ?? null);
      await setAdvisorPlanResult(plan);

      // Paper Auto-Pilot: execute actionable proposals ONLY on Paper Desks when explicitly opted in
      if (
        activeAccount.kind === 'PAPER_DESK' &&
        activeAccount.mandateMode === 'PAPER_AUTOPILOT' &&
        Array.isArray(plan.portfolioActions)
      ) {
        const actionable = [
          ...plan.portfolioActions.filter((p: any) => p.action === 'SELL' || p.action === 'TRIM'),
          ...plan.portfolioActions.filter((p: any) => p.action === 'BUY'),
        ];
        const executedSummaries: string[] = [];

        for (const prop of actionable) {
          const execRes = await executeProposalInPaper(prop.id, tokens, prop);
          if (execRes.ok) {
            executedSummaries.push(
              `${prop.action} ${prop.symbol} ($${Number(prop.suggestedUsd).toFixed(2)})`
            );
          }
        }

        if (executedSummaries.length > 0) {
          await logAudit(
            'PAPER_AUTOPILOT_EXEC',
            `Auto-pilot on "${activeAccount.name}" executed: ${executedSummaries.join(', ')}`
          );
          setStatusNotice(
            `Paper Auto-Pilot executed ${executedSummaries.length} order(s): ${executedSummaries.join(' · ')}`
          );
        } else {
          setStatusNotice(
            `AI cycle complete on "${activeAccount.name}". All existing holdings within risk thresholds.`
          );
        }
      } else {
        setStatusNotice(
          `AI portfolio & best-trade cycle completed for "${activeAccount.name}" (${data.tokensEvaluated ?? 0} live tokens audited).`
        );
      }
    } catch (err: any) {
      setCycleError(err?.message || 'Unable to run AI portfolio & best-trade cycle.');
    } finally {
      setRunningCycle(false);
    }
  };

  const handleExecuteBestOptionInPaper = async (option: BestTradeOption) => {
    setCycleError(null);
    const live = tokenMap.get(option.mint);
    const tokenForOrder: TokenMarketData = live || {
      mint: option.mint,
      pairAddress: option.mint,
      symbol: option.symbol,
      name: option.name,
      dexId: option.dexId,
      source: 'AI Best Trade Pick',
      url: '',
      priceUsd: option.priceUsd,
      priceNative: 0,
      marketCapUsd: option.marketCapUsd,
      fdvUsd: option.marketCapUsd,
      liquidityUsd: option.liquidityUsd,
      volume5mUsd: 0,
      volume1hUsd: 0,
      volume6hUsd: 0,
      volume24hUsd: option.volume24hUsd,
      priceChange5m: 0,
      priceChange1h: option.priceChange1h,
      priceChange6h: 0,
      priceChange24h: 0,
      buys5m: 0,
      sells5m: 0,
      buys1h: option.buys1h,
      sells1h: option.sells1h,
      buys24h: 0,
      sells24h: 0,
      pairCreatedAt: null,
      bondingCurveProgressPct: null,
      migrationStatus: 'UNKNOWN',
      isPumpFun: false,
      holdersCount: null,
      creatorAddress: null,
      lastUpdatedUtc: new Date().toISOString(),
      freshness: 'REALTIME',
    };

    const spendUsd = Math.max(
      10,
      Math.min(profile.paperBalanceUsd, option.suggestedUsd > 0 ? option.suggestedUsd : 250)
    );
    const res = await executePaperOrder({
      token: tokenForOrder,
      side: 'BUY',
      usdOrQtyAmount: spendUsd,
      slippageBps: 100,
    });
    if (!res.ok) {
      setCycleError(res.error || 'Paper trade execution failed.');
      return;
    }
    // Sync any matching pending BUY proposal in the queue for the active account
    const matchingPending = accountProposals.find(
      (p) => p.mint === option.mint && p.action === 'BUY' && p.status === 'PENDING'
    );
    if (matchingPending) {
      await dismissProposal(matchingPending.id);
    }

    setStatusNotice(
      `Executed simulated Paper BUY for ${option.symbol} ($${spendUsd.toFixed(2)}) with SL ${formatQuoteCurrency(
        option.stopLossPriceUsd,
        profile.quoteCurrency,
        fxRates
      )} / TP ${formatQuoteCurrency(option.takeProfitPriceUsd, profile.quoteCurrency, fxRates)}.`
    );
  };

  const handleExecuteProposalClick = async (proposalId: string) => {
    setCycleError(null);
    const res = await executeProposalInPaper(proposalId, tokens);
    if (!res.ok) {
      setCycleError(res.error || 'Failed to execute proposal in Paper Account.');
      return;
    }
    setStatusNotice('Executed agent proposal inside your simulated Paper Desk.');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#0D1322] p-5">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-400" />
            <h1 className="font-display text-lg font-semibold text-white">
              Accounts &amp; AI Portfolio Desk
            </h1>
          </div>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">
            Add paper desks or non-custodial Solana public wallets, configure risk mandates, and let the 130-agent council rank the best live trade option and manage stop-loss, take-profit, and position concentration.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setShowAddForm((prev) => !prev);
              setFormError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#070B14] px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-blue-500/60 hover:text-white"
          >
            {showAddForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5 text-blue-400" />}
            {showAddForm ? 'Close Account Form' : 'Add Account'}
          </button>

          <button
            type="button"
            onClick={handleRunAdvisorCycle}
            disabled={runningCycle || !activeAccount}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {runningCycle ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {runningCycle ? 'Auditing Live Pools & Positions...' : 'Run AI Portfolio & Best Trade Cycle'}
          </button>
        </div>
      </div>

      {/* Add Account Inline Drawer */}
      {showAddForm && (
        <form
          onSubmit={handleAddAccount}
          className="rounded-xl border border-blue-500/30 bg-[#0D1322] p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">Add Trading Account or Wallet</h2>
              <p className="text-xs text-slate-400">
                Non-custodial architecture: public Solana addresses only. Never enter private keys or seed phrases.
              </p>
            </div>
            {connectedWallet && newKind === 'SOLANA_WALLET' && (
              <button
                type="button"
                onClick={() => setNewWalletAddress(connectedWallet.publicAddress)}
                className="rounded border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-300 hover:bg-blue-500/20"
              >
                Use Connected Wallet ({connectedWallet.publicAddress.slice(0, 4)}..
                {connectedWallet.publicAddress.slice(-4)})
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Account Label
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Alpha Aggressive Desk"
                className="w-full rounded-lg border border-slate-800 bg-[#070B14] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Account Type
              </label>
              <select
                value={newKind}
                onChange={(e) => {
                  const k = e.target.value as ManagedAccountKind;
                  setNewKind(k);
                  if (k === 'SOLANA_WALLET') setNewMandateMode('ADVISORY_ONLY');
                }}
                className="w-full rounded-lg border border-slate-800 bg-[#070B14] px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                {ManagedAccountKindValues.map((k) => (
                  <option key={k} value={k}>
                    {k === 'PAPER_DESK' ? 'Paper Trading Desk' : 'Solana Wallet (Non-Custodial)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Risk Profile
              </label>
              <select
                value={newRiskProfile}
                onChange={(e) => setNewRiskProfile(e.target.value as AccountRiskProfile)}
                className="w-full rounded-lg border border-slate-800 bg-[#070B14] px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                {AccountRiskProfileValues.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Agent Mandate
              </label>
              <select
                value={newKind === 'SOLANA_WALLET' ? 'ADVISORY_ONLY' : newMandateMode}
                disabled={newKind === 'SOLANA_WALLET'}
                onChange={(e) => setNewMandateMode(e.target.value as AgentMandateMode)}
                className="w-full rounded-lg border border-slate-800 bg-[#070B14] px-3 py-2 text-xs text-white disabled:opacity-60 focus:border-blue-500 focus:outline-none"
              >
                {AgentMandateModeValues.map((m) => (
                  <option key={m} value={m}>
                    {m === 'ADVISORY_ONLY' ? 'Advisory Only (Human Approval)' : 'Paper Auto-Pilot (Simulated)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {newKind === 'SOLANA_WALLET' && (
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Public Solana Wallet Address (Base58)
              </label>
              <input
                type="text"
                value={newWalletAddress}
                onChange={(e) => setNewWalletAddress(e.target.value)}
                placeholder="Public address only (32–64 base58 characters) — zero private keys"
                className="w-full rounded-lg border border-slate-800 bg-[#070B14] px-3 py-2 font-mono text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Allocated Capital (USD)
              </label>
              <input
                type="number"
                min="100"
                step="100"
                value={newAllocatedUsd}
                onChange={(e) => setNewAllocatedUsd(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Max Position Cap (%)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={newMaxPosPct}
                onChange={(e) => setNewMaxPosPct(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Stop-Loss Trigger (%)
              </label>
              <input
                type="number"
                min="1"
                max="95"
                value={newStopLossPct}
                onChange={(e) => setNewStopLossPct(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Take-Profit Target (%)
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                value={newTakeProfitPct}
                onChange={(e) => setNewTakeProfitPct(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
              />
            </div>
          </div>

          {formError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
            >
              Save Managed Account
            </button>
          </div>
        </form>
      )}

      {/* Status & Error Banners */}
      {statusNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusNotice}</span>
        </div>
      )}
      {cycleError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{cycleError}</span>
        </div>
      )}

      {/* Managed Accounts Selector Grid */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Connected Accounts &amp; Agent Mandates ({managedAccounts.length})
          </h2>
          <span className="font-mono text-xs text-slate-400">
            Paper NAV: {formatQuoteCurrency(totalPaperNavUsd, profile.quoteCurrency, fxRates)} · Cash:{' '}
            {formatQuoteCurrency(profile.paperBalanceUsd, profile.quoteCurrency, fxRates)}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {managedAccounts.map((acc) => {
            const isActive = acc.id === activeAccount?.id;
            const isPaper = acc.kind === 'PAPER_DESK';
            return (
              <div
                key={acc.id}
                onClick={() => setActiveAccountId(acc.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setActiveAccountId(acc.id);
                }}
                className={`cursor-pointer rounded-xl border p-4 transition-colors text-left ${
                  isActive
                    ? 'border-blue-500/70 bg-blue-950/20'
                    : 'border-slate-800 bg-[#0D1322] hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {isPaper ? (
                        <Bot className="h-4 w-4 shrink-0 text-blue-400" />
                      ) : (
                        <Wallet className="h-4 w-4 shrink-0 text-indigo-400" />
                      )}
                      <span className="truncate font-semibold text-sm text-white">{acc.name}</span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-400">
                      {isPaper
                        ? 'PAPER DESK (SIMULATED)'
                        : `WALLET · ${acc.walletAddress?.slice(0, 5)}..${acc.walletAddress?.slice(-5)}`}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                        acc.riskProfile === 'AGGRESSIVE'
                          ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
                          : acc.riskProfile === 'CONSERVATIVE'
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                      }`}
                    >
                      {acc.riskProfile}
                    </span>
                    {managedAccounts.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove ${acc.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteManagedAccount(acc.id);
                        }}
                        className="rounded border border-slate-800 p-1 text-slate-500 hover:border-rose-500/50 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-800/70 pt-3 font-mono text-[11px]">
                  <div>
                    <div className="text-slate-500">Max Pos</div>
                    <div className="text-slate-200">{acc.maxPositionPct}%</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Stop Loss</div>
                    <div className="text-rose-400">-{acc.stopLossPct}%</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Take Profit</div>
                    <div className="text-emerald-400">+{acc.takeProfitPct}%</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800/70 pt-3">
                  <span className="font-mono text-[11px] text-slate-400">
                    {acc.mandateMode === 'PAPER_AUTOPILOT'
                      ? 'Mandate: Paper Auto-Pilot'
                      : 'Mandate: Advisory Only'}
                  </span>
                  {isPaper ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateManagedAccount(acc.id, {
                          mandateMode:
                            acc.mandateMode === 'PAPER_AUTOPILOT'
                              ? 'ADVISORY_ONLY'
                              : 'PAPER_AUTOPILOT',
                        });
                      }}
                      className="rounded border border-slate-700 bg-[#070B14] px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:border-blue-500/60"
                    >
                      {acc.mandateMode === 'PAPER_AUTOPILOT'
                        ? 'Switch to Advisory'
                        : 'Enable Paper Auto-Pilot'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (acc.walletAddress) onInspectWallet(acc.walletAddress);
                      }}
                      className="rounded border border-slate-700 bg-[#070B14] px-2.5 py-1 text-[11px] font-medium text-blue-300 hover:border-blue-500/60"
                    >
                      Inspect On-Chain
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Linked Wallet On-Chain Snapshot (if active account is a Solana Wallet and cycle ran) */}
      {activeAccount?.kind === 'SOLANA_WALLET' && linkedWalletIntel && (
        <div className="rounded-xl border border-indigo-500/30 bg-[#0D1322] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-indigo-400" />
                <h2 className="text-sm font-semibold text-white">
                  Linked Solana Wallet Snapshot ({activeAccount.name})
                </h2>
              </div>
              <p className="mt-0.5 font-mono text-xs text-slate-400">
                {linkedWalletIntel.address} · Classification: {linkedWalletIntel.classification}
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right font-mono">
                <div className="text-[11px] text-slate-400">Live SOL Balance</div>
                <div className="text-sm font-semibold text-white">
                  {linkedWalletIntel.solBalance !== null
                    ? `${linkedWalletIntel.solBalance.toFixed(4)} SOL`
                    : 'RPC Unavailable'}
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-[11px] text-slate-400">SPL Token Holdings</div>
                <div className="text-sm font-semibold text-white">
                  {linkedWalletIntel.holdings.length} tokens
                </div>
              </div>
              <button
                type="button"
                onClick={() => onInspectWallet(linkedWalletIntel.address)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#070B14] px-3 py-1.5 text-xs text-blue-300 hover:border-blue-500/60"
              >
                Full Wallet Intel
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Split: Best Trade Option Spotlight + Portfolio Action Proposals */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: Best Trade Option Engine */}
        <div className="space-y-4 xl:col-span-6">
          <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-400" />
                <h2 className="text-sm font-semibold text-white">
                  #1 Best Trade Option ({activeAccount?.riskProfile})
                </h2>
              </div>
              {tokensEvaluatedCount !== null && (
                <span className="font-mono text-[11px] text-slate-400">
                  {tokensEvaluatedCount} live pools RPC-audited
                </span>
              )}
            </div>

            {!activePlan ? (
              <div className="mt-4 rounded-lg border border-slate-800 bg-[#070B14] p-5 text-xs text-slate-400">
                Click <span className="font-semibold text-white">&ldquo;Run AI Portfolio &amp; Best Trade Cycle&rdquo;</span> above to score live Pump.fun &amp; Solana pools against{' '}
                <span className="font-semibold text-blue-300">{activeAccount?.name}</span>&apos;s risk mandate, audit Mint/Freeze authority via Solana RPC, and review open positions.
              </div>
            ) : !activePlan.bestTradePick ? (
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
                No live token passed the strict {activeAccount?.riskProfile} liquidity and rug-safety filter on this cycle. Capital preservation recommended.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-blue-500/30 bg-[#070B14] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-lg font-bold text-white">
                          {activePlan.bestTradePick.symbol}
                        </span>
                        <span className="text-xs text-slate-400">
                          {activePlan.bestTradePick.name}
                        </span>
                        <RiskLevelTag level={activePlan.bestTradePick.riskLevel} />
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-slate-400">
                        {activePlan.bestTradePick.dexId} · Mint:{' '}
                        {activePlan.bestTradePick.mint.slice(0, 6)}..
                        {activePlan.bestTradePick.mint.slice(-6)}
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <div className="text-[11px] text-slate-400">AI Score</div>
                      <div className="font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                        {activePlan.bestTradePick.score}/100
                      </div>
                    </div>
                  </div>

                  {/* Entry / SL / TP / Size Strip */}
                  <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-800/80 py-3 sm:grid-cols-4 font-mono text-xs tabular-nums">
                    <div>
                      <div className="text-[10px] text-slate-500">Entry Quote</div>
                      <div className="font-semibold text-white">
                        {formatQuoteCurrency(
                          activePlan.bestTradePick.entryPriceUsd,
                          profile.quoteCurrency,
                          fxRates
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">
                        Stop Loss (-{activeAccount.stopLossPct}%)
                      </div>
                      <div className="font-semibold text-rose-400">
                        {formatQuoteCurrency(
                          activePlan.bestTradePick.stopLossPriceUsd,
                          profile.quoteCurrency,
                          fxRates
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">
                        Take Profit (+{activeAccount.takeProfitPct}%)
                      </div>
                      <div className="font-semibold text-emerald-400">
                        {formatQuoteCurrency(
                          activePlan.bestTradePick.takeProfitPriceUsd,
                          profile.quoteCurrency,
                          fxRates
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">Suggested Size / R:R</div>
                      <div className="font-semibold text-blue-300">
                        ${activePlan.bestTradePick.suggestedUsd.toFixed(0)} ·{' '}
                        {activePlan.bestTradePick.riskRewardRatio}x
                      </div>
                    </div>
                  </div>

                  {/* On-Chain Authority & Market Depth */}
                  <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-4 font-mono">
                    <div>
                      <div className="text-[10px] text-slate-500">Liquidity</div>
                      <div className="font-semibold text-slate-200">
                        {formatQuoteCurrency(
                          activePlan.bestTradePick.liquidityUsd,
                          profile.quoteCurrency,
                          fxRates,
                          true
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">24h Volume</div>
                      <div className="font-semibold text-slate-200">
                        {formatQuoteCurrency(
                          activePlan.bestTradePick.volume24hUsd,
                          profile.quoteCurrency,
                          fxRates,
                          true
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">Mint Auth</div>
                      <div
                        className={`font-semibold ${
                          activePlan.bestTradePick.mintAuthorityRevoked === true
                            ? 'text-emerald-400'
                            : activePlan.bestTradePick.mintAuthorityRevoked === false
                            ? 'text-rose-400'
                            : 'text-amber-300'
                        }`}
                      >
                        {activePlan.bestTradePick.mintAuthorityRevoked === true
                          ? 'REVOKED'
                          : activePlan.bestTradePick.mintAuthorityRevoked === false
                          ? 'ACTIVE'
                          : 'UNKNOWN'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">Freeze Auth</div>
                      <div
                        className={`font-semibold ${
                          activePlan.bestTradePick.freezeAuthorityRevoked === true
                            ? 'text-emerald-400'
                            : activePlan.bestTradePick.freezeAuthorityRevoked === false
                            ? 'text-rose-400'
                            : 'text-amber-300'
                        }`}
                      >
                        {activePlan.bestTradePick.freezeAuthorityRevoked === true
                          ? 'REVOKED'
                          : activePlan.bestTradePick.freezeAuthorityRevoked === false
                          ? 'ACTIVE'
                          : 'UNKNOWN'}
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-slate-300">
                    {activePlan.bestTradePick.rationale}
                  </p>

                  {activePlan.bestTradePick.riskCaveats.length > 0 && (
                    <div className="mt-3 space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5 text-[11px] text-amber-200/90">
                      {activePlan.bestTradePick.riskCaveats.map((c, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                          <span>{c}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleExecuteBestOptionInPaper(activePlan.bestTradePick!)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Execute Best Trade in Paper
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectToken(activePlan.bestTradePick!.mint)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0D1322] px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-blue-500/60 hover:text-white"
                    >
                      Open Full Analysis
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Alternative Ranked Options */}
                {activePlan.alternativeOptions.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Alternative Ranked Candidates
                    </h3>
                    <div className="space-y-2">
                      {activePlan.alternativeOptions.map((alt) => (
                        <div
                          key={alt.mint}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#070B14] p-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-white">{alt.symbol}</span>
                              <RiskLevelTag level={alt.riskLevel} />
                              <span className="font-mono text-xs text-blue-300">
                                {alt.score}/100
                              </span>
                            </div>
                            <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                              Liq{' '}
                              {formatQuoteCurrency(
                                alt.liquidityUsd,
                                profile.quoteCurrency,
                                fxRates,
                                true
                              )}{' '}
                              · 1h {alt.priceChange1h >= 0 ? '+' : ''}
                              {alt.priceChange1h.toFixed(1)}% · R:R {alt.riskRewardRatio}x
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleExecuteBestOptionInPaper(alt)}
                              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20"
                            >
                              Paper Buy
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectToken(alt.mint)}
                              className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:text-white"
                            >
                              Inspect
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: AI Portfolio Management & Rebalance Queue */}
        <div className="space-y-4 xl:col-span-6">
          <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-indigo-400" />
                <h2 className="text-sm font-semibold text-white">
                  AI Portfolio Management &amp; Trade Queue
                </h2>
              </div>
              {activePlan && (
                <span className="font-mono text-[11px] text-slate-400">
                  {activePlan.orchestratorModel} ·{' '}
                  {formatUtcOrLocalTimestamp(activePlan.generatedAtUtc, profile.timezone)}
                </span>
              )}
            </div>

            {activePlan && (
              <div className="mt-3 rounded-lg border border-slate-800 bg-[#070B14] p-3.5 text-xs leading-relaxed text-slate-300">
                {activePlan.executiveSummary}
              </div>
            )}

            {accountProposals.length === 0 ? (
              <div className="mt-4 rounded-lg border border-slate-800 bg-[#070B14] p-5 text-xs text-slate-400">
                No agent proposals generated yet for <span className="text-white font-medium">{activeAccount?.name}</span>. Run the AI cycle to audit open holdings for stop-loss breaches, take-profit targets, concentration caps, and cash deployment.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {accountProposals.map((prop) => {
                  const actionStyle =
                    prop.action === 'BUY'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : prop.action === 'SELL'
                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                      : prop.action === 'TRIM'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'border-slate-700 bg-slate-800/60 text-slate-300';

                  return (
                    <div
                      key={prop.id}
                      className="rounded-xl border border-slate-800 bg-[#070B14] p-4 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded border px-2 py-0.5 font-mono text-[11px] font-semibold ${actionStyle}`}
                          >
                            {prop.action}
                          </span>
                          <span className="font-semibold text-sm text-white">{prop.symbol}</span>
                          <RiskLevelTag level={prop.riskLevel} />
                          <span className="font-mono text-xs text-slate-400">
                            Est. {formatQuoteCurrency(prop.suggestedUsd, profile.quoteCurrency, fxRates)}
                          </span>
                        </div>

                        <span
                          className={`rounded border px-2 py-0.5 font-mono text-[10px] ${
                            prop.status === 'EXECUTED_PAPER'
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                              : prop.status === 'DISMISSED'
                              ? 'border-slate-700 bg-slate-800/40 text-slate-500'
                              : 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                          }`}
                        >
                          {prop.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300">{prop.reason}</p>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <span className="font-mono text-[11px] text-slate-500">
                          {prop.sourceAgent} · Confidence {prop.confidenceScore}%
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectToken(prop.mint)}
                            className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:text-white"
                          >
                            Inspect
                          </button>
                          {prop.status === 'PENDING' && prop.action !== 'HOLD' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleExecuteProposalClick(prop.id)}
                                className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-500"
                              >
                                Execute in Paper
                              </button>
                              <button
                                type="button"
                                onClick={() => dismissProposal(prop.id)}
                                className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-400 hover:text-white"
                              >
                                Dismiss
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Open Positions Quick Risk Table */}
            <div className="mt-5 border-t border-slate-800 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Activity className="h-3.5 w-3.5 text-blue-400" />
                  Monitored Paper Holdings ({positions.length})
                </h3>
                <span className="font-mono text-[11px] text-slate-400">
                  SL -{activeAccount?.stopLossPct}% / TP +{activeAccount?.takeProfitPct}%
                </span>
              </div>
              {positions.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No open positions in Paper Desk yet. Execute the #1 Best Trade Pick or any BUY proposal above to begin tracked portfolio management.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {positions.map((pos) => {
                    const livePx = tokenMap.get(pos.mint)?.priceUsd ?? pos.avgEntryPriceUsd;
                    const valueUsd = pos.quantity * livePx;
                    const pnlPct =
                      pos.avgEntryPriceUsd > 0
                        ? ((livePx - pos.avgEntryPriceUsd) / pos.avgEntryPriceUsd) * 100
                        : 0;
                    const weightPct =
                      totalPaperNavUsd > 0 ? (valueUsd / totalPaperNavUsd) * 100 : 0;
                    return (
                      <div
                        key={pos.mint}
                        className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-[#070B14] px-3 py-2 font-mono text-xs"
                      >
                        <div>
                          <span className="font-semibold text-white">{pos.symbol}</span>
                          <span className="ml-2 text-[11px] text-slate-400">
                            {weightPct.toFixed(1)}% weight
                          </span>
                        </div>
                        <div className="flex items-center gap-3 tabular-nums">
                          <span className="text-slate-200">
                            {formatQuoteCurrency(valueUsd, profile.quoteCurrency, fxRates)}
                          </span>
                          <span className={pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {pnlPct >= 0 ? '+' : ''}
                            {pnlPct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
