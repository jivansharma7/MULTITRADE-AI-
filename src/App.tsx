import React, { Component, useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { WalletProvider } from './contexts/WalletContext';
import { TerminalShell } from './components/TerminalShell';
import { AuthModal } from './components/AuthModal';
import { WalletModal } from './components/WalletModal';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: Error): ErrorBoundaryState {
    return { hasError: true, message: err?.message || 'Unexpected application error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#070B14] p-6 text-center text-slate-200">
          <h1 className="font-display text-xl font-semibold text-white">
            MULTITRADE AI Terminal Recovery
          </h1>
          <p className="mt-2 max-w-md text-xs text-slate-400">{this.state.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
          >
            Reload Terminal
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function MultitradeApp() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const handleOpenAuth = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  return (
    <>
      <TerminalShell
        initialView="dashboard"
        onOpenAuth={handleOpenAuth}
        onOpenWalletModal={() => setWalletModalOpen(true)}
      />

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authMode}
      />

      <WalletModal
        open={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
    </>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <WalletProvider>
          <MultitradeApp />
        </WalletProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
