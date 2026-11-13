import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import type { ConnectedWalletInfo, WalletIntelligenceProfile } from '../shared/types';

interface SolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toString(): string };
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  signMessage?: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array }>;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
    phantom?: { solana?: SolanaProvider };
    solflare?: SolanaProvider;
  }
}

interface WalletContextValue {
  connectedWallet: ConnectedWalletInfo | null;
  walletProfile: WalletIntelligenceProfile | null;
  walletLoading: boolean;
  detectedProviders: { phantom: boolean; solflare: boolean };
  connectProviderWallet: (providerType: 'Phantom' | 'Solflare') => Promise<{ ok: boolean; error?: string }>;
  connectReadOnlyAddress: (address: string) => Promise<{ ok: boolean; error?: string }>;
  disconnectWallet: () => Promise<void>;
  setNetwork: (network: 'mainnet-beta' | 'devnet') => void;
  refreshWalletHoldings: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logAudit } = useAuth();
  const [connectedWallet, setConnectedWallet] = useState<ConnectedWalletInfo | null>(null);
  const [walletProfile, setWalletProfile] = useState<WalletIntelligenceProfile | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [detectedProviders, setDetectedProviders] = useState({ phantom: false, solflare: false });

  useEffect(() => {
    const check = () => {
      const phantom = Boolean(window.phantom?.solana?.isPhantom || window.solana?.isPhantom);
      const solflare = Boolean(window.solflare?.isSolflare);
      setDetectedProviders({ phantom, solflare });
    };
    check();
    const timer = setTimeout(check, 800);
    return () => clearTimeout(timer);
  }, []);

  const loadHoldings = async (address: string) => {
    setWalletLoading(true);
    try {
      const res = await fetch(`/api/wallets/${encodeURIComponent(address)}`);
      if (res.ok) {
        const data = (await res.json()) as WalletIntelligenceProfile;
        setWalletProfile(data);
      }
    } catch {
      // ignore transient error
    } finally {
      setWalletLoading(false);
    }
  };

  const persistWalletMetadata = async (info: ConnectedWalletInfo) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid, 'connected_wallets', info.publicAddress), {
        userId: user.uid,
        ...info,
      });
    } catch (err) {
      console.error('Failed to store public wallet metadata:', err);
    }
  };

  const connectProviderWallet = async (providerType: 'Phantom' | 'Solflare') => {
    try {
      const provider =
        providerType === 'Phantom'
          ? window.phantom?.solana || (window.solana?.isPhantom ? window.solana : undefined)
          : window.solflare;

      if (!provider) {
        return {
          ok: false,
          error: `${providerType} browser extension not detected in this browser. You can inspect any public Solana address in Read-Only mode below.`,
        };
      }

      const resp = await provider.connect();
      const publicAddress = resp.publicKey?.toString() || provider.publicKey?.toString();
      if (!publicAddress) {
        return { ok: false, error: 'Wallet did not return a public address.' };
      }

      const info: ConnectedWalletInfo = {
        publicAddress,
        provider: providerType,
        network: 'mainnet-beta',
        connectedAt: new Date().toISOString(),
      };
      setConnectedWallet(info);
      await persistWalletMetadata(info);
      await logAudit('WALLET_CONNECTED', `Connected ${providerType} public address ${publicAddress.slice(0, 8)}..`);
      await loadHoldings(publicAddress);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || `Failed to connect ${providerType} wallet.` };
    }
  };

  const connectReadOnlyAddress = async (address: string) => {
    const trimmed = address.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
      return { ok: false, error: 'Enter a valid Solana base58 public address (32–44 characters).' };
    }
    const info: ConnectedWalletInfo = {
      publicAddress: trimmed,
      provider: 'ReadOnly',
      network: 'mainnet-beta',
      connectedAt: new Date().toISOString(),
    };
    setConnectedWallet(info);
    await persistWalletMetadata(info);
    await logAudit('WALLET_READONLY', `Linked read-only public address ${trimmed.slice(0, 8)}..`);
    await loadHoldings(trimmed);
    return { ok: true };
  };

  const disconnectWallet = async () => {
    const prevAddr = connectedWallet?.publicAddress;
    try {
      if (connectedWallet?.provider === 'Phantom') {
        await (window.phantom?.solana || window.solana)?.disconnect();
      } else if (connectedWallet?.provider === 'Solflare') {
        await window.solflare?.disconnect();
      }
    } catch {
      // ignore provider disconnect error
    }
    setConnectedWallet(null);
    setWalletProfile(null);
    if (user && prevAddr) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'connected_wallets', prevAddr));
      } catch {
        // ignore
      }
    }
    if (prevAddr) {
      await logAudit('WALLET_DISCONNECTED', `Disconnected public address ${prevAddr.slice(0, 8)}..`);
    }
  };

  const setNetwork = (network: 'mainnet-beta' | 'devnet') => {
    if (!connectedWallet) return;
    setConnectedWallet({ ...connectedWallet, network });
  };

  const refreshWalletHoldings = async () => {
    if (connectedWallet?.publicAddress) {
      await loadHoldings(connectedWallet.publicAddress);
    }
  };

  return (
    <WalletContext.Provider
      value={{
        connectedWallet,
        walletProfile,
        walletLoading,
        detectedProviders,
        connectProviderWallet,
        connectReadOnlyAddress,
        disconnectWallet,
        setNetwork,
        refreshWalletHoldings,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}
