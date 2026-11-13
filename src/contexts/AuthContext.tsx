import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  orderBy,
  query,
  setDoc,
  limit,
} from 'firebase/firestore';
import { auth, db, googleAuthProvider } from '../lib/firebase';
import { DEFAULT_FX_RATES } from '../shared/currency';
import type {
  AiIntelligenceReport,
  AlertRule,
  BacktestResult,
  InAppNotification,
  ManagedAccount,
  PaperOrder,
  PaperPosition,
  PortfolioActionProposal,
  PortfolioAdvisorPlan,
  QuoteCurrency,
  TokenMarketData,
  UserProfile,
  WatchedWallet,
} from '../shared/types';
import { evaluateMarketAlerts } from '../shared/marketAnalytics';

export type FirestoreOperationType = 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';

function handleFirestoreError(error: unknown, operationType: FirestoreOperationType, path: string | null): never {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface WatchlistEntry {
  mint: string;
  symbol: string;
  name: string;
  addedPriceUsd: number;
  notes?: string;
  addedAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  detail: string;
  timestamp: string;
}

interface AuthContextValue {
  user: User | null;
  authLoading: boolean;
  profile: UserProfile;
  fxRates: Record<QuoteCurrency, number>;
  watchlist: WatchlistEntry[];
  walletWatchlist: WatchedWallet[];
  positions: PaperPosition[];
  orders: PaperOrder[];
  alerts: AlertRule[];
  notifications: InAppNotification[];
  recentReports: AiIntelligenceReport[];
  backtests: BacktestResult[];
  auditLogs: AuditLogEntry[];
  managedAccounts: ManagedAccount[];
  activeAccountId: string;
  tradeProposals: PortfolioActionProposal[];
  latestAdvisorPlan: PortfolioAdvisorPlan | null;
  setActiveAccountId: (id: string) => void;
  addManagedAccount: (
    input: Omit<ManagedAccount, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<ManagedAccount>;
  updateManagedAccount: (
    id: string,
    patch: Partial<Omit<ManagedAccount, 'id' | 'createdAt' | 'updatedAt'>>
  ) => Promise<void>;
  deleteManagedAccount: (id: string) => Promise<void>;
  setAdvisorPlanResult: (plan: PortfolioAdvisorPlan) => Promise<void>;
  executeProposalInPaper: (
    proposalId: string,
    liveTokens: TokenMarketData[],
    proposalOverride?: PortfolioActionProposal
  ) => Promise<{ ok: boolean; error?: string }>;
  dismissProposal: (proposalId: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  updatePreferences: (patch: Partial<Pick<UserProfile, 'quoteCurrency' | 'timezone' | 'countryCode' | 'plan' | 'liveTradingEnabled'>>) => Promise<void>;
  toggleWatchlist: (token: TokenMarketData) => Promise<void>;
  isWatched: (mint: string) => boolean;
  saveWatchedWallet: (wallet: { address: string; label: string; notes?: string }) => Promise<void>;
  removeWatchedWallet: (address: string) => Promise<void>;
  isWalletWatched: (address: string) => boolean;
  executePaperOrder: (params: {
    token: TokenMarketData;
    side: 'BUY' | 'SELL';
    usdOrQtyAmount: number;
    slippageBps: number;
  }) => Promise<{ ok: boolean; error?: string; order?: PaperOrder }>;
  resetPaperAccount: () => Promise<void>;
  addAlertRule: (rule: Omit<AlertRule, 'id' | 'createdAt'>) => Promise<void>;
  toggleAlertRule: (id: string) => Promise<void>;
  deleteAlertRule: (id: string) => Promise<void>;
  evaluateAlertsForMarket: (tokens: TokenMarketData[]) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  recordAiReport: (report: AiIntelligenceReport) => void;
  recordBacktest: (result: BacktestResult) => Promise<void>;
  logAudit: (action: string, detail: string) => Promise<void>;
}

const DEFAULT_PROFILE: UserProfile = {
  uid: 'guest-session',
  email: '',
  displayName: 'Guest Researcher',
  plan: 'FREE',
  quoteCurrency: 'USD',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  countryCode: 'US',
  paperBalanceUsd: 10000,
  realizedPnlUsd: 0,
  liveTradingEnabled: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const DEFAULT_MANAGED_ACCOUNT: ManagedAccount = {
  id: 'acc_main_paper',
  name: 'Primary Paper Desk',
  kind: 'PAPER_DESK',
  walletProvider: 'Paper',
  riskProfile: 'BALANCED',
  mandateMode: 'ADVISORY_ONLY',
  allocatedUsd: 10000,
  maxPositionPct: 20,
  stopLossPct: 15,
  takeProfitPct: 35,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const AuthContext = createContext<AuthContextValue | null>(null);

const LS_KEYS = {
  watchlist: 'multitrade_watchlist_v1',
  wallets: 'multitrade_wallets_v1',
  alerts: 'multitrade_alerts_v1',
  notifications: 'multitrade_notifications_v1',
};

function readLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const DEFAULT_ALERTS: AlertRule[] = [
  {
    id: 'default-risk-alert',
    type: 'CRITICAL_RISK',
    condition: 'Alert when live tokens show thin liquidity (<$10K) or severe 1h drawdown',
    enabled: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'default-price-alert',
    type: 'PRICE_MOVE',
    condition: 'Notify when 1h price move exceeds +/- 25%',
    threshold: 25,
    enabled: true,
    createdAt: new Date().toISOString(),
  },
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [fxRates, setFxRates] = useState<Record<QuoteCurrency, number>>(DEFAULT_FX_RATES);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>(() =>
    readLocalJson<WatchlistEntry[]>(LS_KEYS.watchlist, [])
  );
  const [walletWatchlist, setWalletWatchlist] = useState<WatchedWallet[]>(() =>
    readLocalJson<WatchedWallet[]>(LS_KEYS.wallets, [])
  );
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [alerts, setAlerts] = useState<AlertRule[]>(() =>
    readLocalJson<AlertRule[]>(LS_KEYS.alerts, DEFAULT_ALERTS)
  );
  const [notifications, setNotifications] = useState<InAppNotification[]>(() =>
    readLocalJson<InAppNotification[]>(LS_KEYS.notifications, [])
  );
  const [recentReports, setRecentReports] = useState<AiIntelligenceReport[]>([]);
  const [backtests, setBacktests] = useState<BacktestResult[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [managedAccounts, setManagedAccounts] = useState<ManagedAccount[]>([DEFAULT_MANAGED_ACCOUNT]);
  const [activeAccountId, setActiveAccountId] = useState<string>(DEFAULT_MANAGED_ACCOUNT.id);
  const [tradeProposals, setTradeProposals] = useState<PortfolioActionProposal[]>([]);
  const [latestAdvisorPlan, setLatestAdvisorPlan] = useState<PortfolioAdvisorPlan | null>(null);

  const profileRef = useRef<UserProfile>(profile);
  const positionsRef = useRef<PaperPosition[]>(positions);
  const tradeProposalsRef = useRef<PortfolioActionProposal[]>(tradeProposals);
  const alertsRef = useRef<AlertRule[]>(alerts);
  const notificationsRef = useRef<InAppNotification[]>(notifications);

  useEffect(() => {
    alertsRef.current = alerts;
    try {
      window.localStorage.setItem(LS_KEYS.alerts, JSON.stringify(alerts));
    } catch {}
  }, [alerts]);

  useEffect(() => {
    notificationsRef.current = notifications;
    try {
      window.localStorage.setItem(LS_KEYS.notifications, JSON.stringify(notifications.slice(0, 40)));
    } catch {}
  }, [notifications]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_KEYS.watchlist, JSON.stringify(watchlist));
    } catch {}
  }, [watchlist]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_KEYS.wallets, JSON.stringify(walletWatchlist));
    } catch {}
  }, [walletWatchlist]);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);
  useEffect(() => {
    tradeProposalsRef.current = tradeProposals;
  }, [tradeProposals]);

  // Validate Firestore connectivity on boot & fetch live FX rates
  useEffect(() => {
    getDocFromServer(doc(db, 'test', 'connection')).catch((error) => {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error('Please check your Firebase configuration.');
      }
    });
    fetch('/api/fx-rates')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.rates) setFxRates(data.rates);
      })
      .catch(() => {});
  }, []);

  const logAudit = useCallback(
    async (action: string, detail: string) => {
      const entry: AuditLogEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        action,
        detail,
        timestamp: new Date().toISOString(),
      };
      setAuditLogs((prev) => [entry, ...prev].slice(0, 50));
      if (user) {
        try {
          await setDoc(doc(db, 'users', user.uid, 'audit_logs', entry.id), {
            userId: user.uid,
            action: entry.action.slice(0, 100),
            detail: entry.detail.slice(0, 500),
            timestamp: entry.timestamp,
          });
        } catch (err) {
          console.error('Failed to persist audit log:', err);
        }
      }
    },
    [user]
  );

  // Sync Firebase Auth & load Firestore user collections
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (!fbUser) {
        setProfile(DEFAULT_PROFILE);
        setAuthLoading(false);
        return;
      }

      try {
        const userRef = doc(db, 'users', fbUser.uid);
        const snap = await getDoc(userRef);
        const now = new Date().toISOString();

        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setProfile(data);
        } else {
          const initial: UserProfile = {
            uid: fbUser.uid,
            email: fbUser.email || '',
            displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Trader',
            plan: 'FREE',
            quoteCurrency: 'USD',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            countryCode: 'US',
            paperBalanceUsd: 10000,
            realizedPnlUsd: 0,
            liveTradingEnabled: false,
            createdAt: now,
            updatedAt: now,
          };
          await setDoc(userRef, initial);
          setProfile(initial);
        }

        const [wlSnap, wwlSnap, posSnap, ordSnap, alSnap, logSnap, accSnap, propSnap] = await Promise.all([
          getDocs(collection(db, 'users', fbUser.uid, 'watchlists')),
          getDocs(collection(db, 'users', fbUser.uid, 'wallet_watchlists')),
          getDocs(collection(db, 'users', fbUser.uid, 'paper_positions')),
          getDocs(
            query(
              collection(db, 'users', fbUser.uid, 'paper_orders'),
              orderBy('executedAt', 'desc'),
              limit(40)
            )
          ),
          getDocs(collection(db, 'users', fbUser.uid, 'alerts')),
          getDocs(
            query(
              collection(db, 'users', fbUser.uid, 'audit_logs'),
              orderBy('timestamp', 'desc'),
              limit(30)
            )
          ),
          getDocs(collection(db, 'users', fbUser.uid, 'managed_accounts')),
          getDocs(
            query(
              collection(db, 'users', fbUser.uid, 'trade_proposals'),
              orderBy('createdAt', 'desc'),
              limit(30)
            )
          ),
        ]);

        if (!wlSnap.empty) {
          setWatchlist(wlSnap.docs.map((d) => d.data() as WatchlistEntry));
        }
        if (!wwlSnap.empty) {
          setWalletWatchlist(wwlSnap.docs.map((d) => d.data() as WatchedWallet));
        }
        setPositions(posSnap.docs.map((d) => d.data() as PaperPosition));
        setOrders(ordSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaperOrder, 'id'>) })));
        if (!alSnap.empty) {
          setAlerts(alSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AlertRule, 'id'>) })));
        }
        setAuditLogs(logSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLogEntry, 'id'>) })));

        if (!accSnap.empty) {
          const loadedAccounts = accSnap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ManagedAccount, 'id'>),
          }));
          setManagedAccounts(loadedAccounts);
          setActiveAccountId(loadedAccounts[0].id);
        } else {
          // Persist initial default Paper Desk account for newly signed-in user
          const defaultAcc: ManagedAccount = {
            ...DEFAULT_MANAGED_ACCOUNT,
            createdAt: now,
            updatedAt: now,
          };
          await setDoc(doc(db, 'users', fbUser.uid, 'managed_accounts', defaultAcc.id), {
            userId: fbUser.uid,
            name: defaultAcc.name,
            kind: defaultAcc.kind,
            walletProvider: defaultAcc.walletProvider,
            riskProfile: defaultAcc.riskProfile,
            mandateMode: defaultAcc.mandateMode,
            allocatedUsd: defaultAcc.allocatedUsd,
            maxPositionPct: defaultAcc.maxPositionPct,
            stopLossPct: defaultAcc.stopLossPct,
            takeProfitPct: defaultAcc.takeProfitPct,
            createdAt: defaultAcc.createdAt,
            updatedAt: defaultAcc.updatedAt,
          });
          setManagedAccounts([defaultAcc]);
          setActiveAccountId(defaultAcc.id);
        }

        if (!propSnap.empty) {
          setTradeProposals(
            propSnap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<PortfolioActionProposal, 'id'>),
            }))
          );
        }
      } catch (err) {
        console.error('Error loading user workspace from Firestore:', err);
      } finally {
        setAuthLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleAuthProvider);
  };

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const registerWithEmail = async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const updatePreferences = async (
    patch: Partial<Pick<UserProfile, 'quoteCurrency' | 'timezone' | 'countryCode' | 'plan' | 'liveTradingEnabled'>>
  ) => {
    const next: UserProfile = {
      ...profile,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    setProfile(next);
    if (user) {
      await setDoc(doc(db, 'users', user.uid), next);
    }
    await logAudit('PREFERENCES_UPDATED', `Updated preferences: ${Object.keys(patch).join(', ')}`);
  };

  const isWatched = useCallback(
    (mint: string) => watchlist.some((w) => w.mint === mint),
    [watchlist]
  );

  const toggleWatchlist = async (token: TokenMarketData) => {
    const exists = watchlist.some((w) => w.mint === token.mint);
    if (exists) {
      setWatchlist((prev) => prev.filter((w) => w.mint !== token.mint));
      if (user) {
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'watchlists', token.mint));
        } catch (err) {
          handleFirestoreError(err, 'delete', `users/${user.uid}/watchlists/${token.mint}`);
        }
      }
      await logAudit('WATCHLIST_REMOVE', `Removed ${token.symbol} (${token.mint.slice(0, 8)}..)`);
    } else {
      const entry: WatchlistEntry = {
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        addedPriceUsd: token.priceUsd,
        addedAt: new Date().toISOString(),
      };
      setWatchlist((prev) => [entry, ...prev]);
      if (user) {
        try {
          await setDoc(doc(db, 'users', user.uid, 'watchlists', token.mint), {
            userId: user.uid,
            ...entry,
          });
        } catch (err) {
          handleFirestoreError(err, 'create', `users/${user.uid}/watchlists/${token.mint}`);
        }
      }
      await logAudit('WATCHLIST_ADD', `Added ${token.symbol} at $${token.priceUsd.toFixed(6)}`);
    }
  };

  const isWalletWatched = useCallback(
    (address: string) => walletWatchlist.some((w) => w.address === address),
    [walletWatchlist]
  );

  const saveWatchedWallet: AuthContextValue['saveWatchedWallet'] = async ({ address, label, notes }) => {
    const cleanAddr = address.trim();
    const cleanLabel = label.trim().slice(0, 60) || `${cleanAddr.slice(0, 4)}..${cleanAddr.slice(-4)}`;
    if (!cleanAddr) return;
    const entry: WatchedWallet = {
      address: cleanAddr,
      label: cleanLabel,
      ...(notes?.trim() ? { notes: notes.trim().slice(0, 500) } : {}),
      addedAt: new Date().toISOString(),
    };
    setWalletWatchlist((prev) => [entry, ...prev.filter((w) => w.address !== cleanAddr)]);
    if (user) {
      const docPath = `users/${user.uid}/wallet_watchlists/${cleanAddr}`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'wallet_watchlists', cleanAddr), {
          userId: user.uid,
          ...entry,
        });
      } catch (err) {
        handleFirestoreError(err, 'write', docPath);
      }
    }
    await logAudit('WALLET_WATCH_ADD', `Saved public wallet ${cleanLabel} (${cleanAddr.slice(0, 6)}..)`);
  };

  const removeWatchedWallet: AuthContextValue['removeWatchedWallet'] = async (address) => {
    setWalletWatchlist((prev) => prev.filter((w) => w.address !== address));
    if (user) {
      const docPath = `users/${user.uid}/wallet_watchlists/${address}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'wallet_watchlists', address));
      } catch (err) {
        handleFirestoreError(err, 'delete', docPath);
      }
    }
    await logAudit('WALLET_WATCH_REMOVE', `Removed watched wallet ${address.slice(0, 8)}..`);
  };

  const evaluateAlertsForMarket = useCallback((liveTokens: TokenMarketData[]) => {
    if (!liveTokens.length) return;
    const seen = new Set(notificationsRef.current.map((n) => n.dedupeKey));
    const fresh = evaluateMarketAlerts({
      rules: alertsRef.current,
      tokens: liveTokens,
      existingDedupeKeys: seen,
    });
    if (fresh.length > 0) {
      setNotifications((prev) => [...fresh, ...prev].slice(0, 40));
    }
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const executePaperOrder: AuthContextValue['executePaperOrder'] = async ({
    token,
    side,
    usdOrQtyAmount,
    slippageBps,
  }) => {
    if (!Number.isFinite(usdOrQtyAmount) || usdOrQtyAmount <= 0) {
      return { ok: false, error: 'Order amount must be greater than zero.' };
    }
    if (token.priceUsd <= 0) {
      return { ok: false, error: 'Live token USD quote is unavailable for paper execution.' };
    }

    const now = new Date().toISOString();
    const feeRate = 0.0025; // 25 bps DEX + platform simulation fee
    const slippageRate = Math.max(0, slippageBps) / 10000;
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const currentProfile = profileRef.current;
    const currentPositions = positionsRef.current;

    if (side === 'BUY') {
      const spendUsd = usdOrQtyAmount;
      if (spendUsd > currentProfile.paperBalanceUsd) {
        return {
          ok: false,
          error: `Insufficient paper balance ($${currentProfile.paperBalanceUsd.toFixed(2)} available).`,
        };
      }
      const feeUsd = Number((spendUsd * feeRate).toFixed(4));
      const netNotional = spendUsd - feeUsd;
      const executedPriceUsd = token.priceUsd * (1 + slippageRate);
      const quantity = netNotional / executedPriceUsd;

      const existingPos = currentPositions.find((p) => p.mint === token.mint);
      const updatedPos: PaperPosition = existingPos
        ? {
            ...existingPos,
            quantity: existingPos.quantity + quantity,
            totalCostUsd: existingPos.totalCostUsd + spendUsd,
            avgEntryPriceUsd: (existingPos.totalCostUsd + spendUsd) / (existingPos.quantity + quantity),
            updatedAt: now,
          }
        : {
            mint: token.mint,
            symbol: token.symbol,
            name: token.name,
            quantity,
            avgEntryPriceUsd: executedPriceUsd,
            totalCostUsd: spendUsd,
            openedAt: now,
            updatedAt: now,
          };

      const order: PaperOrder = {
        id: orderId,
        mint: token.mint,
        symbol: token.symbol,
        side: 'BUY',
        quantity,
        quotedPriceUsd: token.priceUsd,
        executedPriceUsd,
        slippageBps,
        feeUsd,
        notionalUsd: spendUsd,
        executedAt: now,
      };

      const nextProfile: UserProfile = {
        ...currentProfile,
        paperBalanceUsd: Number((currentProfile.paperBalanceUsd - spendUsd).toFixed(4)),
        updatedAt: now,
      };

      const nextPositions = [updatedPos, ...currentPositions.filter((p) => p.mint !== token.mint)];
      profileRef.current = nextProfile;
      positionsRef.current = nextPositions;

      setProfile(nextProfile);
      setPositions(nextPositions);
      setOrders((prev) => [order, ...prev]);

      if (user) {
        await Promise.all([
          setDoc(doc(db, 'users', user.uid), nextProfile),
          setDoc(doc(db, 'users', user.uid, 'paper_positions', token.mint), {
            userId: user.uid,
            ...updatedPos,
          }),
          setDoc(doc(db, 'users', user.uid, 'paper_orders', orderId), {
            userId: user.uid,
            mint: order.mint,
            symbol: order.symbol,
            side: order.side,
            quantity: order.quantity,
            quotedPriceUsd: order.quotedPriceUsd,
            executedPriceUsd: order.executedPriceUsd,
            slippageBps: order.slippageBps,
            feeUsd: order.feeUsd,
            notionalUsd: order.notionalUsd,
            executedAt: order.executedAt,
          }),
        ]);
      }

      await logAudit('PAPER_BUY', `Bought ${quantity.toFixed(2)} ${token.symbol} ($${spendUsd.toFixed(2)})`);
      return { ok: true, order };
    } else {
      // SELL by quantity
      const existingPos = currentPositions.find((p) => p.mint === token.mint);
      if (!existingPos || existingPos.quantity <= 0) {
        return { ok: false, error: `No open paper position found for ${token.symbol}.` };
      }

      const sellQty = Math.min(existingPos.quantity, usdOrQtyAmount);
      const executedPriceUsd = token.priceUsd * (1 - slippageRate);
      const grossProceeds = sellQty * executedPriceUsd;
      const feeUsd = Number((grossProceeds * feeRate).toFixed(4));
      const netProceeds = Math.max(0, grossProceeds - feeUsd);

      const costFraction = sellQty / existingPos.quantity;
      const costBasisSold = existingPos.totalCostUsd * costFraction;
      const realizedPnlUsd = Number((netProceeds - costBasisSold).toFixed(4));

      const remainingQty = existingPos.quantity - sellQty;
      const remainingCost = Math.max(0, existingPos.totalCostUsd - costBasisSold);

      const order: PaperOrder = {
        id: orderId,
        mint: token.mint,
        symbol: token.symbol,
        side: 'SELL',
        quantity: sellQty,
        quotedPriceUsd: token.priceUsd,
        executedPriceUsd,
        slippageBps,
        feeUsd,
        notionalUsd: netProceeds,
        realizedPnlUsd,
        executedAt: now,
      };

      const nextProfile: UserProfile = {
        ...currentProfile,
        paperBalanceUsd: Number((currentProfile.paperBalanceUsd + netProceeds).toFixed(4)),
        realizedPnlUsd: Number((currentProfile.realizedPnlUsd + realizedPnlUsd).toFixed(4)),
        updatedAt: now,
      };

      profileRef.current = nextProfile;
      setProfile(nextProfile);
      setOrders((prev) => [order, ...prev]);

      if (remainingQty <= 1e-8) {
        const nextPositions = currentPositions.filter((p) => p.mint !== token.mint);
        positionsRef.current = nextPositions;
        setPositions(nextPositions);
        if (user) {
          await deleteDoc(doc(db, 'users', user.uid, 'paper_positions', token.mint));
        }
      } else {
        const updatedPos: PaperPosition = {
          ...existingPos,
          quantity: remainingQty,
          totalCostUsd: remainingCost,
          updatedAt: now,
        };
        const nextPositions = [updatedPos, ...currentPositions.filter((p) => p.mint !== token.mint)];
        positionsRef.current = nextPositions;
        setPositions(nextPositions);
        if (user) {
          await setDoc(doc(db, 'users', user.uid, 'paper_positions', token.mint), {
            userId: user.uid,
            ...updatedPos,
          });
        }
      }

      if (user) {
        await Promise.all([
          setDoc(doc(db, 'users', user.uid), nextProfile),
          setDoc(doc(db, 'users', user.uid, 'paper_orders', orderId), {
            userId: user.uid,
            mint: order.mint,
            symbol: order.symbol,
            side: order.side,
            quantity: order.quantity,
            quotedPriceUsd: order.quotedPriceUsd,
            executedPriceUsd: order.executedPriceUsd,
            slippageBps: order.slippageBps,
            feeUsd: order.feeUsd,
            notionalUsd: order.notionalUsd,
            realizedPnlUsd: order.realizedPnlUsd,
            executedAt: order.executedAt,
          }),
        ]);
      }

      await logAudit(
        'PAPER_SELL',
        `Sold ${sellQty.toFixed(2)} ${token.symbol} (Realized P&L: ${realizedPnlUsd >= 0 ? '+' : ''}$${realizedPnlUsd.toFixed(2)})`
      );
      return { ok: true, order };
    }
  };

  const resetPaperAccount = async () => {
    const now = new Date().toISOString();
    const nextProfile: UserProfile = {
      ...profile,
      paperBalanceUsd: 10000,
      realizedPnlUsd: 0,
      updatedAt: now,
    };
    setProfile(nextProfile);
    setPositions([]);
    if (user) {
      await setDoc(doc(db, 'users', user.uid), nextProfile);
      const posSnap = await getDocs(collection(db, 'users', user.uid, 'paper_positions'));
      await Promise.all(posSnap.docs.map((d) => deleteDoc(d.ref)));
    }
    await logAudit('PAPER_RESET', 'Reset virtual paper trading balance to $10,000 USD.');
  };

  const addAlertRule = async (rule: Omit<AlertRule, 'id' | 'createdAt'>) => {
    const id = `al_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const full: AlertRule = { ...rule, id, createdAt: new Date().toISOString() };
    setAlerts((prev) => [full, ...prev]);
    if (user) {
      await setDoc(doc(db, 'users', user.uid, 'alerts', id), {
        userId: user.uid,
        type: full.type,
        condition: full.condition,
        enabled: full.enabled,
        createdAt: full.createdAt,
        ...(full.mint ? { mint: full.mint } : {}),
        ...(full.symbol ? { symbol: full.symbol } : {}),
        ...(full.threshold !== undefined ? { threshold: full.threshold } : {}),
      });
    }
  };

  const toggleAlertRule = async (id: string) => {
    let updated: AlertRule | undefined;
    setAlerts((prev) =>
      prev.map((a) => {
        if (a.id === id) {
          updated = { ...a, enabled: !a.enabled };
          return updated;
        }
        return a;
      })
    );
    if (user && updated) {
      await setDoc(doc(db, 'users', user.uid, 'alerts', id), {
        userId: user.uid,
        type: updated.type,
        condition: updated.condition,
        enabled: updated.enabled,
        createdAt: updated.createdAt,
        ...(updated.mint ? { mint: updated.mint } : {}),
        ...(updated.symbol ? { symbol: updated.symbol } : {}),
        ...(updated.threshold !== undefined ? { threshold: updated.threshold } : {}),
      });
    }
  };

  const deleteAlertRule = async (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    if (user) {
      await deleteDoc(doc(db, 'users', user.uid, 'alerts', id));
    }
  };

  const recordAiReport = useCallback((report: AiIntelligenceReport) => {
    setRecentReports((prev) => [report, ...prev.filter((r) => r.mint !== report.mint)].slice(0, 12));
  }, []);

  const recordBacktest = async (result: BacktestResult) => {
    setBacktests((prev) => [result, ...prev].slice(0, 15));
    if (user) {
      const id = `bt_${Date.now()}`;
      await setDoc(doc(db, 'users', user.uid, 'backtests', id), {
        userId: user.uid,
        mint: result.config.mint,
        symbol: result.config.symbol,
        strategyId: result.config.strategyId,
        timeframe: result.config.timeframe,
        returnPct: result.historicalReturnPct,
        winRatePct: result.winRatePct,
        maxDrawdownPct: result.maxDrawdownPct,
        profitFactor: result.profitFactor,
        totalTrades: result.totalTrades,
        createdAt: new Date().toISOString(),
      });
    }
  };

  const addManagedAccount: AuthContextValue['addManagedAccount'] = async (input) => {
    const now = new Date().toISOString();
    const id = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const account: ManagedAccount = {
      id,
      name: input.name.trim().slice(0, 60) || 'Custom Account',
      kind: input.kind,
      ...(input.walletAddress ? { walletAddress: input.walletAddress.trim().slice(0, 64) } : {}),
      walletProvider: input.walletProvider || (input.kind === 'PAPER_DESK' ? 'Paper' : 'ReadOnly'),
      riskProfile: input.riskProfile,
      mandateMode: input.kind === 'SOLANA_WALLET' ? 'ADVISORY_ONLY' : input.mandateMode,
      allocatedUsd: Math.max(0, Number(input.allocatedUsd) || 0),
      maxPositionPct: Math.min(100, Math.max(1, Number(input.maxPositionPct) || 20)),
      stopLossPct: Math.min(95, Math.max(1, Number(input.stopLossPct) || 15)),
      takeProfitPct: Math.min(1000, Math.max(1, Number(input.takeProfitPct) || 35)),
      createdAt: now,
      updatedAt: now,
    };

    setManagedAccounts((prev) => [...prev, account]);
    setActiveAccountId(account.id);

    if (user) {
      const docPath = `users/${user.uid}/managed_accounts/${account.id}`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'managed_accounts', account.id), {
          userId: user.uid,
          name: account.name,
          kind: account.kind,
          ...(account.walletAddress ? { walletAddress: account.walletAddress } : {}),
          walletProvider: account.walletProvider,
          riskProfile: account.riskProfile,
          mandateMode: account.mandateMode,
          allocatedUsd: account.allocatedUsd,
          maxPositionPct: account.maxPositionPct,
          stopLossPct: account.stopLossPct,
          takeProfitPct: account.takeProfitPct,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        });
      } catch (err) {
        handleFirestoreError(err, 'create', docPath);
      }
    }

    await logAudit('ACCOUNT_ADDED', `Added ${account.kind} account "${account.name}" (${account.riskProfile})`);
    return account;
  };

  const updateManagedAccount: AuthContextValue['updateManagedAccount'] = async (id, patch) => {
    const now = new Date().toISOString();
    let updated: ManagedAccount | null = null;
    setManagedAccounts((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const nextKind = patch.kind ?? a.kind;
        updated = {
          ...a,
          ...patch,
          name: (patch.name ?? a.name).trim().slice(0, 60),
          mandateMode:
            nextKind === 'SOLANA_WALLET' ? 'ADVISORY_ONLY' : (patch.mandateMode ?? a.mandateMode),
          updatedAt: now,
        };
        return updated;
      })
    );

    if (user && updated) {
      const acc = updated as ManagedAccount;
      const docPath = `users/${user.uid}/managed_accounts/${id}`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'managed_accounts', id), {
          userId: user.uid,
          name: acc.name,
          kind: acc.kind,
          ...(acc.walletAddress ? { walletAddress: acc.walletAddress } : {}),
          walletProvider: acc.walletProvider || 'Paper',
          riskProfile: acc.riskProfile,
          mandateMode: acc.mandateMode,
          allocatedUsd: acc.allocatedUsd,
          maxPositionPct: acc.maxPositionPct,
          stopLossPct: acc.stopLossPct,
          takeProfitPct: acc.takeProfitPct,
          createdAt: acc.createdAt,
          updatedAt: acc.updatedAt,
        });
      } catch (err) {
        handleFirestoreError(err, 'update', docPath);
      }
    }
    await logAudit('ACCOUNT_UPDATED', `Updated agent mandate/risk parameters for account ${id}`);
  };

  const deleteManagedAccount: AuthContextValue['deleteManagedAccount'] = async (id) => {
    if (managedAccounts.length <= 1) return;
    const remaining = managedAccounts.filter((a) => a.id !== id);
    setManagedAccounts(remaining);
    if (activeAccountId === id && remaining[0]) {
      setActiveAccountId(remaining[0].id);
    }
    if (user) {
      const docPath = `users/${user.uid}/managed_accounts/${id}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'managed_accounts', id));
      } catch (err) {
        handleFirestoreError(err, 'delete', docPath);
      }
    }
    await logAudit('ACCOUNT_REMOVED', `Removed managed account ${id}`);
  };

  const persistProposal = async (uid: string, proposal: PortfolioActionProposal, op: FirestoreOperationType) => {
    const docPath = `users/${uid}/trade_proposals/${proposal.id}`;
    try {
      await setDoc(doc(db, 'users', uid, 'trade_proposals', proposal.id), {
        userId: uid,
        accountId: proposal.accountId,
        action: proposal.action,
        mint: proposal.mint,
        symbol: proposal.symbol.slice(0, 32),
        name: proposal.name.slice(0, 100),
        currentPriceUsd: proposal.currentPriceUsd,
        suggestedUsd: proposal.suggestedUsd,
        suggestedQuantity: proposal.suggestedQuantity,
        confidenceScore: proposal.confidenceScore,
        riskLevel: proposal.riskLevel,
        reason: proposal.reason.slice(0, 500),
        status: proposal.status,
        sourceAgent: proposal.sourceAgent.slice(0, 100),
        createdAt: proposal.createdAt,
      });
    } catch (err) {
      handleFirestoreError(err, op, docPath);
    }
  };

  const setAdvisorPlanResult: AuthContextValue['setAdvisorPlanResult'] = async (plan) => {
    setLatestAdvisorPlan(plan);
    const cleaned = plan.portfolioActions.map((p) => ({
      ...p,
      id: p.id.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 120),
    }));
    const nextProposals = [
      ...cleaned,
      ...tradeProposalsRef.current.filter((old) => old.accountId !== plan.accountId || old.status !== 'PENDING'),
    ].slice(0, 30);
    tradeProposalsRef.current = nextProposals;
    setTradeProposals(nextProposals);

    if (user) {
      await Promise.all(cleaned.map((p) => persistProposal(user.uid, p, 'create')));
    }
    await logAudit(
      'AI_PORTFOLIO_CYCLE',
      `Evaluated ${plan.accountName}: ${cleaned.length} agent trade/portfolio proposals`
    );
  };

  const executeProposalInPaper: AuthContextValue['executeProposalInPaper'] = async (
    proposalId,
    liveTokens,
    proposalOverride
  ) => {
    const prop =
      proposalOverride || tradeProposalsRef.current.find((p) => p.id === proposalId);
    if (!prop) return { ok: false, error: 'Trade proposal not found.' };
    if (prop.action === 'HOLD') {
      return { ok: false, error: 'HOLD recommendation requires no order execution.' };
    }

    const tokenMatch = liveTokens.find((t) => t.mint === prop.mint);
    const syntheticToken: TokenMarketData = tokenMatch || {
      mint: prop.mint,
      pairAddress: prop.mint,
      symbol: prop.symbol,
      name: prop.name,
      dexId: 'solana',
      source: 'Agent Proposal Quote',
      url: '',
      priceUsd: prop.currentPriceUsd,
      priceNative: 0,
      marketCapUsd: 0,
      fdvUsd: 0,
      liquidityUsd: 0,
      volume5mUsd: 0,
      volume1hUsd: 0,
      volume6hUsd: 0,
      volume24hUsd: 0,
      priceChange5m: 0,
      priceChange1h: 0,
      priceChange6h: 0,
      priceChange24h: 0,
      buys5m: 0,
      sells5m: 0,
      buys1h: 0,
      sells1h: 0,
      buys24h: 0,
      sells24h: 0,
      pairCreatedAt: null,
      bondingCurveProgressPct: null,
      migrationStatus: 'UNKNOWN',
      isPumpFun: false,
      holdersCount: null,
      creatorAddress: null,
      lastUpdatedUtc: new Date().toISOString(),
      freshness: 'DELAYED',
    };

    const side: 'BUY' | 'SELL' = prop.action === 'BUY' ? 'BUY' : 'SELL';
    const amount = side === 'BUY' ? prop.suggestedUsd : prop.suggestedQuantity;

    const res = await executePaperOrder({
      token: syntheticToken,
      side,
      usdOrQtyAmount: amount,
      slippageBps: 100,
    });

    if (!res.ok) return { ok: false, error: res.error };

    const updatedProp: PortfolioActionProposal = { ...prop, status: 'EXECUTED_PAPER' };
    setTradeProposals((prev) => prev.map((p) => (p.id === proposalId ? updatedProp : p)));
    setLatestAdvisorPlan((prev) =>
      prev
        ? {
            ...prev,
            portfolioActions: prev.portfolioActions.map((p) =>
              p.id === proposalId ? updatedProp : p
            ),
          }
        : prev
    );

    if (user) {
      await persistProposal(user.uid, updatedProp, 'update');
    }
    return { ok: true };
  };

  const dismissProposal: AuthContextValue['dismissProposal'] = async (proposalId) => {
    const prop = tradeProposals.find((p) => p.id === proposalId);
    if (!prop) return;
    const updatedProp: PortfolioActionProposal = { ...prop, status: 'DISMISSED' };
    setTradeProposals((prev) => prev.map((p) => (p.id === proposalId ? updatedProp : p)));
    setLatestAdvisorPlan((prev) =>
      prev
        ? {
            ...prev,
            portfolioActions: prev.portfolioActions.map((p) =>
              p.id === proposalId ? updatedProp : p
            ),
          }
        : prev
    );
    if (user) {
      await persistProposal(user.uid, updatedProp, 'update');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authLoading,
        profile,
        fxRates,
        watchlist,
        walletWatchlist,
        positions,
        orders,
        alerts,
        notifications,
        recentReports,
        backtests,
        auditLogs,
        managedAccounts,
        activeAccountId,
        tradeProposals,
        latestAdvisorPlan,
        setActiveAccountId,
        addManagedAccount,
        updateManagedAccount,
        deleteManagedAccount,
        setAdvisorPlanResult,
        executeProposalInPaper,
        dismissProposal,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        resetPassword,
        logout,
        updatePreferences,
        toggleWatchlist,
        isWatched,
        saveWatchedWallet,
        removeWatchedWallet,
        isWalletWatched,
        executePaperOrder,
        resetPaperAccount,
        addAlertRule,
        toggleAlertRule,
        deleteAlertRule,
        evaluateAlertsForMarket,
        markNotificationRead,
        markAllNotificationsRead,
        recordAiReport,
        recordBacktest,
        logAudit,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
