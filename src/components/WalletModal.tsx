import React, { useState } from 'react';
import { ShieldCheck, Wallet, X, RefreshCw, Unplug } from 'lucide-react';
import { useWallet } from '../contexts/WalletContext';

interface WalletModalProps {
  open: boolean;
  onClose: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({ open, onClose }) => {
  const {
    connectedWallet,
    walletProfile,
    walletLoading,
    detectedProviders,
    connectProviderWallet,
    connectReadOnlyAddress,
    disconnectWallet,
    setNetwork,
    refreshWalletHoldings,
  } = useWallet();

  const [readOnlyInput, setReadOnlyInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleProvider = async (provider: 'Phantom' | 'Solflare') => {
    setError(null);
    setBusy(true);
    const res = await connectProviderWallet(provider);
    setBusy(false);
    if (!res.ok) setError(res.error || 'Connection failed');
  };

  const handleReadOnly = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await connectReadOnlyAddress(readOnlyInput);
    setBusy(false);
    if (!res.ok) setError(res.error || 'Invalid address');
    else setReadOnlyInput('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-[#0D1322] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="wallet-modal-title" className="text-lg font-semibold text-white">
              Solana Wallet Connection
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Non-custodial adapter. Public keys only — never enter seed phrases or private keys.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close wallet dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-blue-500/25 bg-blue-500/10 p-3 text-xs text-blue-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
          <div>
            Security Policy: MULTITRADE AI operates in strictly read-only analytics mode, never requests private keys or seed phrases, and never executes automated or live transactions.
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        {connectedWallet ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-slate-800 bg-[#070B14] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-slate-400">
                    Connected via {connectedWallet.provider}
                  </div>
                  <div className="mt-1 font-mono text-xs text-white break-all">
                    {connectedWallet.publicAddress}
                  </div>
                </div>
                <select
                  aria-label="Solana network selector"
                  value={connectedWallet.network}
                  onChange={(e) => setNetwork(e.target.value as 'mainnet-beta' | 'devnet')}
                  className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200"
                >
                  <option value="mainnet-beta">Mainnet-Beta</option>
                  <option value="devnet">Devnet</option>
                </select>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
                <span className="text-slate-400">On-Chain SOL Balance</span>
                <span className="font-mono font-semibold text-white tabular-nums">
                  {walletLoading
                    ? 'Querying RPC...'
                    : walletProfile?.solBalance !== null && walletProfile?.solBalance !== undefined
                    ? `${walletProfile.solBalance} SOL`
                    : 'Unavailable'}
                </span>
              </div>
              {walletProfile && (
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-400">SPL Token Accounts</span>
                  <span className="font-mono text-slate-200 tabular-nums">
                    {walletProfile.holdings.length} active mints
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={refreshWalletHoldings}
                disabled={walletLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${walletLoading ? 'animate-spin' : ''}`} />
                Refresh On-Chain State
              </button>
              <button
                type="button"
                onClick={disconnectWallet}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
              >
                <Unplug className="h-3.5 w-3.5" />
                Disconnect Wallet
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleProvider('Phantom')}
                className="flex items-center justify-between rounded-lg border border-slate-700 bg-[#070B14] px-4 py-3 text-left transition-colors hover:border-blue-500/60 hover:bg-slate-900"
              >
                <div>
                  <div className="text-sm font-medium text-white">Phantom</div>
                  <div className="text-[11px] text-slate-400">
                    {detectedProviders.phantom ? 'Extension detected' : 'Browser extension'}
                  </div>
                </div>
                <Wallet className="h-4 w-4 text-blue-400" />
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => handleProvider('Solflare')}
                className="flex items-center justify-between rounded-lg border border-slate-700 bg-[#070B14] px-4 py-3 text-left transition-colors hover:border-blue-500/60 hover:bg-slate-900"
              >
                <div>
                  <div className="text-sm font-medium text-white">Solflare</div>
                  <div className="text-[11px] text-slate-400">
                    {detectedProviders.solflare ? 'Extension detected' : 'Browser extension'}
                  </div>
                </div>
                <Wallet className="h-4 w-4 text-indigo-400" />
              </button>
            </div>

            <form onSubmit={handleReadOnly} className="border-t border-slate-800 pt-4">
              <label htmlFor="readonly-wallet" className="block text-xs font-medium text-slate-300">
                Or Link Public Address (Read-Only Portfolio & RPC Monitor)
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="readonly-wallet"
                  type="text"
                  value={readOnlyInput}
                  onChange={(e) => setReadOnlyInput(e.target.value)}
                  placeholder="Enter Solana public address (base58)"
                  className="flex-1 rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 whitespace-nowrap"
                >
                  Connect Read-Only
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
