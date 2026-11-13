import React, { useState } from 'react';
import { X, Mail, Lock, User as UserIcon, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register' | 'reset';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  onClose,
  initialMode = 'login',
}) => {
  const { signInWithGoogle, signInWithEmail, registerWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setBusy(false);
          return;
        }
        await signInWithEmail(email.trim(), password);
        onClose();
      } else if (mode === 'register') {
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setBusy(false);
          return;
        }
        await registerWithEmail(email.trim(), password, displayName.trim());
        onClose();
      } else {
        await resetPassword(email.trim());
        setNotice('Password recovery email sent if an account exists for that address.');
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setError(
          'Email/Password sign-in is not yet enabled in the Firebase Console for this project. Use Google Sign-In below or enable Email/Password in Firebase Authentication settings.'
        );
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setError('Invalid email or password.');
      } else if (code === 'auth/email-already-in-use') {
        setError('An account with this email already exists.');
      } else {
        setError(err?.message || 'Authentication failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Google authentication failed or was cancelled.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0D1322] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="auth-modal-title" className="text-xl font-semibold text-white">
              {mode === 'login'
                ? 'Sign in to MULTITRADE AI'
                : mode === 'register'
                ? 'Create free research account'
                : 'Reset account password'}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Optional cloud sync for watchlists, saved wallets, alert rules, and AI research logs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          <span>Continue with Google</span>
          <ArrowRight className="h-4 w-4" />
        </button>

        <div className="my-4 flex items-center gap-3 text-xs text-slate-500">
          <div className="h-px flex-1 bg-slate-800" />
          <span>or with email</span>
          <div className="h-px flex-1 bg-slate-800" />
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label htmlFor="auth-name" className="mb-1 block text-xs font-medium text-slate-300">
                Display Name
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  id="auth-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex Mercer"
                  className="w-full rounded-lg border border-slate-700 bg-[#070B14] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="mb-1 block text-xs font-medium text-slate-300">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@firm.io"
                className="w-full rounded-lg border border-slate-700 bg-[#070B14] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div>
              <label htmlFor="auth-password" className="mb-1 block text-xs font-medium text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  id="auth-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full rounded-lg border border-slate-700 bg-[#070B14] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {busy
              ? 'Processing...'
              : mode === 'login'
              ? 'Sign In'
              : mode === 'register'
              ? 'Create Account'
              : 'Send Recovery Email'}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          {mode !== 'login' && (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className="hover:text-white"
            >
              Back to Sign In
            </button>
          )}
          {mode === 'login' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className="hover:text-white"
              >
                Need an account? Register
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('reset');
                  setError(null);
                }}
                className="hover:text-white"
              >
                Forgot password?
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
