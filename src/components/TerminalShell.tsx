import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  BrainCircuit,
  Compass,
  Flame,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  User as UserIcon,
  Wallet,
  Waves,
  X,
} from 'lucide-react';
import { QuoteCurrencyValues, type DataProviderStatus, type QuoteCurrency, type TokenMarketData } from '../shared/types';
import { useAuth } from '../contexts/AuthContext';
import { useWallet } from '../contexts/WalletContext';
import { DashboardView } from './DashboardView';
import { ScannerView } from './ScannerView';
import { TokenAnalysisView } from './TokenAnalysisView';
import { WhaleTrackerView } from './WhaleTrackerView';
import { AiIntelligenceView } from './AiIntelligenceView';
import { WalletIntelView } from './WalletIntelView';
import { WatchlistView } from './WatchlistView';
import { AlertsAndSettingsView } from './AlertsAndSettingsView';
import { AboutAndLegalView } from './AboutAndLegalView';
import { CoinMap3DView } from './CoinMap3DView';
import { MarketVisualizer } from './MarketVisualizer';

interface TerminalShellProps {
  initialView?: string;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onOpenWalletModal: () => void;
}

export const TerminalShell: React.FC<TerminalShellProps> = ({
  initialView = 'dashboard',
  onOpenAuth,
  onOpenWalletModal,
}) => {
  const {
    user,
    profile,
    notifications,
    updatePreferences,
    evaluateAlertsForMarket,
    logout,
  } = useAuth();
  const { connectedWallet } = useWallet();

  const [activeTab, setActiveTab] = useState<string>(
    initialView.startsWith('token:') ? 'token' : initialView
  );
  const [selectedMint, setSelectedMint] = useState<string>(
    initialView.startsWith('token:') ? initialView.replace('token:', '') : ''
  );
  const [inspectedWallet, setInspectedWallet] = useState<string>('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [scannerSearchTrigger, setScannerSearchTrigger] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [tokens, setTokens] = useState<TokenMarketData[]>([]);
  const [solPriceUsd, setSolPriceUsd] = useState<number | null>(null);
  const [lastUpdatedUtc, setLastUpdatedUtc] = useState<string>('');
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [providers, setProviders] = useState<DataProviderStatus[]>([]);

  const applyMarketSnapshot = (
    items: TokenMarketData[],
    providerList: DataProviderStatus[],
    solUsd: number | null,
    updatedUtc: string
  ) => {
    setTokens(items);
    if (providerList.length > 0) setProviders(providerList);
    if (solUsd !== null && solUsd !== undefined) setSolPriceUsd(solUsd);
    if (updatedUtc) setLastUpdatedUtc(updatedUtc);
    evaluateAlertsForMarket(items);
  };

  const loadMarketSnapshot = async () => {
    setLoadingTokens(true);
    try {
      const res = await fetch('/api/tokens/scanner?pageSize=60&sort=volume24h');
      if (res.ok) {
        const data = await res.json();
        applyMarketSnapshot(
          data.items || [],
          data.providers || [],
          data.solPriceUsd ?? null,
          data.lastUpdatedUtc || new Date().toISOString()
        );
      }
    } catch {
      // keep existing state on transient error
    } finally {
      setLoadingTokens(false);
    }
  };

  useEffect(() => {
    loadMarketSnapshot();

    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/stream/market');
    es.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload?.items && Array.isArray(payload.items)) {
          applyMarketSnapshot(
            payload.items,
            payload.providers || [],
            payload.solPriceUsd ?? null,
            payload.lastUpdatedUtc || new Date().toISOString()
          );
          setLoadingTokens(false);
        }
      } catch {
        // ignore malformed stream frame
      }
    };
    return () => {
      es.close();
    };
  }, []);

  const handleSelectToken = (mint: string) => {
    setSelectedMint(mint);
    setActiveTab('token');
    setMobileNavOpen(false);
  };

  const handleInspectWallet = (address: string) => {
    setInspectedWallet(address);
    setActiveTab('wallets');
    setMobileNavOpen(false);
  };

  const handleNavigate = (tab: string) => {
    if (tab.startsWith('token:')) {
      handleSelectToken(tab.replace('token:', ''));
      return;
    }
    setActiveTab(tab);
    setMobileNavOpen(false);
  };

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = globalSearch.trim();
    if (!q) return;

    // Exact token mint match goes straight to Token Analytics
    const exactToken = tokens.find((t) => t.mint.toLowerCase() === q.toLowerCase());
    if (exactToken) {
      handleSelectToken(exactToken.mint);
      return;
    }

    // Check if query looks like a valid Solana public address
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q)) {
      setScannerSearchTrigger(q);
      setActiveTab('scanner');
      return;
    }

    setScannerSearchTrigger(q);
    setActiveTab('scanner');
  };

  const primaryNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'visualizer', label: 'Market Visualizer', icon: Layers },
    { id: 'map3d', label: '3D Coin Map', icon: Compass },
    { id: 'new_tokens', label: 'New Tokens', icon: Sparkles },
    { id: 'trending', label: 'Trending', icon: Flame },
    { id: 'graduated', label: 'Graduated', icon: GraduationCap },
    { id: 'gainers', label: 'Top Gainers', icon: TrendingUp },
    { id: 'losers', label: 'Top Losers', icon: TrendingDown },
    { id: 'scanner', label: 'Market Scanner', icon: Activity },
    { id: 'whales', label: 'Whale Tracker', icon: Waves },
    { id: 'ai', label: 'AI Intelligence', icon: BrainCircuit },
    { id: 'wallets', label: 'Wallet & Portfolio', icon: Wallet },
    { id: 'watchlist', label: 'Watchlist', icon: Star },
    { id: 'alerts', label: 'Alerts Center', icon: Bell },
  ];

  const footerNav: Array<{ id: 'about' | 'privacy' | 'terms' | 'risk' | 'settings'; label: string }> = [
    { id: 'about', label: 'About MULTITRADE AI' },
    { id: 'settings', label: 'Settings & Providers' },
    { id: 'privacy', label: 'Privacy Policy' },
    { id: 'terms', label: 'Terms of Service' },
    { id: 'risk', label: 'Risk Disclosure' },
  ];

  const scannerSection =
    activeTab === 'new_tokens' ||
    activeTab === 'trending' ||
    activeTab === 'graduated' ||
    activeTab === 'gainers' ||
    activeTab === 'losers' ||
    activeTab === 'highest_volume'
      ? activeTab
      : 'all';

  const unreadAlertsCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex min-h-screen bg-[#070B14] text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-800/80 bg-[#0A0F1C] lg:flex">
        <div className="flex h-16 flex-col justify-center border-b border-slate-800/80 px-5">
          <button
            type="button"
            onClick={() => handleNavigate('dashboard')}
            className="text-left font-display text-base font-bold tracking-tight text-white whitespace-nowrap"
          >
            MULTITRADE AI
          </button>
          <span className="text-[10px] text-slate-400">Intelligence Before Every Trade</span>
        </div>

        <nav aria-label="Workspace Navigation" className="flex-1 space-y-1 overflow-y-auto p-3">
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active =
              activeTab === item.id || (activeTab === 'token' && item.id === 'scanner');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'border border-blue-500/30 bg-blue-600/15 text-blue-300'
                    : 'border border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.id === 'alerts' && unreadAlertsCount > 0 && (
                  <span className="rounded bg-blue-600 px-1.5 py-0.5 font-mono text-[10px] text-white">
                    {unreadAlertsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-800/80 p-3 space-y-1 text-[11px]">
          {footerNav.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => handleNavigate(f.id)}
              className={`block w-full rounded px-2.5 py-1.5 text-left transition-colors ${
                activeTab === f.id
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-10 flex w-64 flex-col overflow-y-auto border-r border-slate-800 bg-[#0A0F1C] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-display text-base font-bold text-white">MULTITRADE AI</div>
                <div className="text-[10px] text-slate-400">Intelligence Before Every Trade</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="rounded p-1 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1">
              {primaryNav.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </span>
                    {item.id === 'alerts' && unreadAlertsCount > 0 && (
                      <span className="rounded bg-blue-600 px-1.5 py-0.5 font-mono text-[10px] text-white">
                        {unreadAlertsCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 border-t border-slate-800 pt-3 space-y-1">
              {footerNav.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleNavigate(f.id)}
                  className="block w-full rounded px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  {f.label}
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Workspace Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-800/80 bg-[#070B14]/90 px-4 backdrop-blur-md lg:px-6">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg border border-slate-800 p-2 text-slate-300 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>

            <form onSubmit={handleGlobalSearch} className="relative w-full max-w-md">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                aria-label="Global token search"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search token or mint..."
                className="w-full rounded-lg border border-slate-800 bg-[#0D1322] py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </form>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {solPriceUsd && (
              <div className="hidden rounded-lg border border-slate-800 bg-[#0D1322] px-2.5 py-1.5 font-mono text-[11px] text-slate-300 md:block tabular-nums">
                SOL ${solPriceUsd.toFixed(2)}
              </div>
            )}

            <select
              aria-label="Quote currency"
              value={profile.quoteCurrency}
              onChange={(e) =>
                updatePreferences({ quoteCurrency: e.target.value as QuoteCurrency })
              }
              className="hidden rounded-lg border border-slate-800 bg-[#0D1322] px-2.5 py-1.5 font-mono text-xs text-slate-200 sm:block"
            >
              {QuoteCurrencyValues.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => handleNavigate('alerts')}
              aria-label="View alerts and notifications"
              className="relative rounded-lg border border-slate-800 bg-[#0D1322] p-2 text-slate-300 hover:border-slate-600 hover:text-white"
            >
              <Bell className="h-4 w-4" />
              {unreadAlertsCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 font-mono text-[9px] font-bold text-white">
                  {unreadAlertsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onOpenWalletModal}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1322] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500/60 whitespace-nowrap"
            >
              <Wallet className="h-3.5 w-3.5 text-blue-400" />
              <span className="hidden sm:inline">
                {connectedWallet
                  ? `${connectedWallet.publicAddress.slice(0, 4)}..${connectedWallet.publicAddress.slice(-4)}`
                  : 'Link Public Wallet'}
              </span>
              <span className="sm:hidden">Wallet</span>
            </button>

            {user ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleNavigate('settings')}
                  className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-[#0D1322] px-3 py-1.5 text-xs text-slate-200 hover:border-slate-600 sm:inline-flex whitespace-nowrap"
                >
                  <UserIcon className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{profile.displayName || user.email?.split('@')[0]}</span>
                </button>
                <button
                  type="button"
                  onClick={logout}
                  aria-label="Sign out"
                  className="rounded-lg border border-slate-800 bg-[#0D1322] p-2 text-slate-400 hover:text-rose-400"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="rounded-lg border border-slate-700 bg-[#0D1322] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500/60 whitespace-nowrap"
              >
                Sign In
              </button>
            )}
          </div>
        </header>

        {/* Active View Content */}
        <main
          className={
            activeTab === 'map3d'
              ? 'w-full flex-1 p-2 lg:p-3'
              : 'mx-auto w-full max-w-[1440px] flex-1 p-4 lg:p-6'
          }
        >
          {activeTab === 'dashboard' && (
            <DashboardView
              tokens={tokens}
              solPriceUsd={solPriceUsd}
              loadingTokens={loadingTokens}
              lastUpdatedUtc={lastUpdatedUtc}
              providers={providers}
              onSelectToken={handleSelectToken}
              onInspectWallet={handleInspectWallet}
              onNavigate={handleNavigate}
            />
          )}

          {activeTab === 'map3d' && (
            <CoinMap3DView
              tokens={tokens}
              solPriceUsd={solPriceUsd}
              loadingTokens={loadingTokens}
              onSelectToken={handleSelectToken}
            />
          )}

          {activeTab === 'visualizer' && (
            <MarketVisualizer
              tokens={tokens}
              loadingTokens={loadingTokens}
              onSelectToken={handleSelectToken}
              onInspectWallet={handleInspectWallet}
            />
          )}

          {(activeTab === 'scanner' ||
            activeTab === 'new_tokens' ||
            activeTab === 'trending' ||
            activeTab === 'graduated' ||
            activeTab === 'gainers' ||
            activeTab === 'losers' ||
            activeTab === 'highest_volume') && (
            <ScannerView
              onSelectToken={handleSelectToken}
              externalSearch={scannerSearchTrigger}
              section={scannerSection}
            />
          )}

          {activeTab === 'token' && selectedMint && (
            <TokenAnalysisView
              mint={selectedMint}
              onBack={() => setActiveTab('dashboard')}
              onInspectWallet={handleInspectWallet}
            />
          )}

          {activeTab === 'whales' && (
            <WhaleTrackerView
              onSelectToken={handleSelectToken}
              onInspectWallet={handleInspectWallet}
            />
          )}

          {activeTab === 'ai' && (
            <AiIntelligenceView tokens={tokens} onSelectToken={handleSelectToken} />
          )}

          {activeTab === 'wallets' && (
            <WalletIntelView
              initialAddress={inspectedWallet}
              tokens={tokens}
              onSelectToken={handleSelectToken}
            />
          )}

          {activeTab === 'watchlist' && (
            <WatchlistView
              tokens={tokens}
              onSelectToken={handleSelectToken}
              onInspectWallet={handleInspectWallet}
              onNavigate={handleNavigate}
            />
          )}

          {(activeTab === 'alerts' || activeTab === 'settings') && (
            <AlertsAndSettingsView
              initialSection={activeTab === 'settings' ? 'settings' : 'alerts'}
              providers={providers}
              onSelectToken={handleSelectToken}
            />
          )}

          {(activeTab === 'about' ||
            activeTab === 'privacy' ||
            activeTab === 'terms' ||
            activeTab === 'risk') && (
            <AboutAndLegalView
              page={activeTab}
              providers={providers}
              onNavigate={handleNavigate}
            />
          )}
        </main>

        {/* Global Footer */}
        <footer className="border-t border-slate-800/80 bg-[#0A0F1C] px-4 py-4 text-[11px] text-slate-400 lg:px-6">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-semibold text-slate-200">MULTITRADE AI</span> · Intelligence Before Every Trade · Read-Only Free Solana &amp; Pump.fun Analytics
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {footerNav.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleNavigate(f.id)}
                  className="hover:text-white"
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
