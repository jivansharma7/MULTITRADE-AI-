import React, { useEffect, useState } from 'react';
import { Bell, Check, CheckCheck, Globe, Shield, Trash2 } from 'lucide-react';
import { formatUtcOrLocalTimestamp, JURISDICTIONS } from '../shared/currency';
import {
  QuoteCurrencyValues,
  type AlertRule,
  type DataProviderStatus,
  type QuoteCurrency,
} from '../shared/types';
import { useAuth } from '../contexts/AuthContext';

interface AlertsAndSettingsViewProps {
  initialSection?: 'alerts' | 'settings';
  providers: DataProviderStatus[];
  onSelectToken?: (mint: string) => void;
}

export const AlertsAndSettingsView: React.FC<AlertsAndSettingsViewProps> = ({
  initialSection = 'alerts',
  providers,
  onSelectToken,
}) => {
  const {
    user,
    profile,
    fxRates,
    alerts,
    notifications,
    auditLogs,
    updatePreferences,
    addAlertRule,
    toggleAlertRule,
    deleteAlertRule,
    markNotificationRead,
    markAllNotificationsRead,
  } = useAuth();

  const [section, setSection] = useState<'alerts' | 'settings'>(initialSection);
  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const [alertType, setAlertType] = useState<AlertRule['type']>('PRICE_MOVE');
  const [alertCondition, setAlertCondition] = useState('');
  const [alertThreshold, setAlertThreshold] = useState('25');

  const handleAddAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertCondition.trim()) return;
    await addAlertRule({
      type: alertType,
      condition: alertCondition.trim(),
      threshold: Number(alertThreshold) || undefined,
      enabled: true,
    });
    setAlertCondition('');
  };

  const activeJurisdiction =
    JURISDICTIONS.find((j) => j.code === profile.countryCode) || JURISDICTIONS[0];

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">
            Alerts Center &amp; Global Settings
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Free in-app market alerts, live notification feed, multi-currency localization, and real-time data provider health.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#0D1322] p-1 text-xs">
          <button
            type="button"
            onClick={() => setSection('alerts')}
            className={`rounded px-3 py-1.5 font-medium ${
              section === 'alerts' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Alerts &amp; Notifications
          </button>
          <button
            type="button"
            onClick={() => setSection('settings')}
            className={`rounded px-3 py-1.5 font-medium ${
              section === 'settings' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Localization &amp; Providers
          </button>
        </div>
      </div>

      {section === 'alerts' && (
        <div className="space-y-6">
          {/* Triggered In-App Notifications */}
          <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-blue-400" />
                <h2 className="text-sm font-semibold text-white">
                  Triggered Market Notifications ({unreadCount} unread)
                </h2>
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllNotificationsRead}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:border-blue-500/60"
                >
                  <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
                  Mark All Read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-[#070B14] p-4 text-xs text-slate-400">
                No alerts triggered yet. Enabled rules below automatically evaluate live Pump.fun &amp; Solana market snapshots.
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-xs ${
                      n.read
                        ? 'border-slate-800 bg-[#070B14] text-slate-400'
                        : 'border-blue-500/35 bg-blue-500/5 text-slate-200'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-[10px] font-semibold uppercase ${
                            n.severity === 'CRITICAL'
                              ? 'text-rose-400'
                              : n.severity === 'WARNING'
                              ? 'text-amber-400'
                              : 'text-blue-400'
                          }`}
                        >
                          {n.severity}
                        </span>
                        <span className="font-semibold text-white">{n.title}</span>
                      </div>
                      <div className="mt-1 text-slate-300">{n.message}</div>
                      <div className="mt-1 font-mono text-[10px] text-slate-500">
                        {formatUtcOrLocalTimestamp(n.createdAt, profile.timezone)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {n.mint && onSelectToken && (
                        <button
                          type="button"
                          onClick={() => onSelectToken(n.mint!)}
                          className="rounded border border-slate-700 bg-[#0D1322] px-2.5 py-1 text-[11px] text-blue-300 hover:border-blue-500/60"
                        >
                          Inspect Token
                        </button>
                      )}
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => markNotificationRead(n.id)}
                          aria-label={`Mark notification ${n.title} read`}
                          className="rounded border border-slate-700 bg-[#0D1322] p-1.5 text-emerald-400 hover:border-emerald-500/60"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleAddAlert}
              className="space-y-4 rounded-xl border border-slate-800 bg-[#0D1322] p-5 lg:col-span-5"
            >
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Bell className="h-4 w-4 text-blue-400" />
                Create Notification Rule
              </h2>

              <div>
                <label htmlFor="al-type" className="block text-xs text-slate-300">
                  Alert Type
                </label>
                <select
                  id="al-type"
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value as AlertRule['type'])}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-white"
                >
                  <option value="NEW_TOKEN">New Token Discovery</option>
                  <option value="PRICE_MOVE">Price Movement (%)</option>
                  <option value="LIQUIDITY_CHANGE">Liquidity Threshold ($)</option>
                  <option value="WHALE_BUY">Whale Buying</option>
                  <option value="WHALE_SELL">Whale Selling</option>
                  <option value="CRITICAL_RISK">Critical Risk Detection</option>
                  <option value="HIGH_AI_SCORE">High AI Score</option>
                  <option value="DEV_ACTIVITY">Developer Wallet Activity</option>
                </select>
              </div>

              <div>
                <label htmlFor="al-cond" className="block text-xs text-slate-300">
                  Rule Description
                </label>
                <input
                  id="al-cond"
                  type="text"
                  required
                  value={alertCondition}
                  onChange={(e) => setAlertCondition(e.target.value)}
                  placeholder="e.g., Notify when 1h price move exceeds threshold"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-white placeholder-slate-500"
                />
              </div>

              <div>
                <label htmlFor="al-thresh" className="block text-xs text-slate-300">
                  Numeric Threshold (Optional)
                </label>
                <input
                  id="al-thresh"
                  type="number"
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500"
              >
                Save Alert Rule
              </button>
            </form>

            <div className="space-y-6 lg:col-span-7">
              <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
                <h2 className="mb-3 text-sm font-semibold text-white">
                  Active Notification Rules ({alerts.length})
                </h2>
                <div className="space-y-2.5">
                  {alerts.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#070B14] p-3 text-xs"
                    >
                      <div>
                        <div className="font-mono text-[11px] font-semibold text-blue-400">
                          {a.type} {a.threshold !== undefined ? `(>= ${a.threshold})` : ''}
                        </div>
                        <div className="mt-0.5 text-slate-200">{a.condition}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleAlertRule(a.id)}
                          className={`rounded border px-2.5 py-1 text-[11px] font-medium ${
                            a.enabled
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                              : 'border-slate-700 bg-slate-900 text-slate-400'
                          }`}
                        >
                          {a.enabled ? 'Enabled' : 'Paused'}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAlertRule(a.id)}
                          aria-label={`Delete alert ${a.condition}`}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
                <h2 className="mb-3 text-sm font-semibold text-white">
                  Session Activity Log
                </h2>
                {auditLogs.length === 0 ? (
                  <p className="text-xs text-slate-400">No session actions logged yet.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2 text-xs">
                    {auditLogs.map((l) => (
                      <div
                        key={l.id}
                        className="flex items-start justify-between gap-3 border-b border-slate-800/70 pb-2"
                      >
                        <div>
                          <span className="font-mono text-[11px] text-blue-400">{l.action}</span>
                          <div className="text-slate-300">{l.detail}</div>
                        </div>
                        <span className="font-mono text-[10px] text-slate-500 whitespace-nowrap">
                          {formatUtcOrLocalTimestamp(l.timestamp, profile.timezone)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {section === 'settings' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 space-y-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Globe className="h-4 w-4 text-blue-400" />
                Internationalization &amp; Display Controls
              </h2>

              <div>
                <label htmlFor="set-currency" className="block text-xs text-slate-300">
                  Display Quote Currency
                </label>
                <select
                  id="set-currency"
                  value={profile.quoteCurrency}
                  onChange={(e) =>
                    updatePreferences({ quoteCurrency: e.target.value as QuoteCurrency })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-white"
                >
                  {QuoteCurrencyValues.map((c) => (
                    <option key={c} value={c}>
                      {c} (1 USD = {fxRates[c]?.toFixed(2)} {c})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="set-tz" className="block text-xs text-slate-300">
                  Timestamp Display Timezone (Backend stores UTC)
                </label>
                <select
                  id="set-tz"
                  value={profile.timezone}
                  onChange={(e) => updatePreferences({ timezone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-white"
                >
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="Europe/Berlin">Europe/Berlin (CET/CEST)</option>
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                </select>
              </div>

              <div>
                <label htmlFor="set-country" className="block text-xs text-slate-300">
                  Jurisdiction / Compliance Region
                </label>
                <select
                  id="set-country"
                  value={profile.countryCode}
                  onChange={(e) => updatePreferences({ countryCode: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-white"
                >
                  {JURISDICTIONS.map((j) => (
                    <option key={j.code} value={j.code}>
                      {j.name} ({j.status})
                    </option>
                  ))}
                </select>
                <div className="mt-2 rounded border border-slate-800 bg-[#070B14] p-2.5 text-[11px] text-slate-400">
                  Policy: {activeJurisdiction.note}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 space-y-3">
              <h2 className="text-sm font-semibold text-white">
                External Data &amp; API Integration Status
              </h2>
              <p className="text-xs text-slate-400">
                Real-time connection status for Solana RPC, Pump.fun, DexScreener, GeckoTerminal, Helius, Birdeye, and Gemini AI.
              </p>
              <div className="space-y-2">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-slate-800 bg-[#070B14] p-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white">{p.name}</span>
                      <span
                        className={`font-mono text-[10px] font-semibold ${
                          p.statusLabel === 'OPERATIONAL'
                            ? 'text-emerald-400'
                            : p.statusLabel === 'DEGRADED'
                            ? 'text-amber-400'
                            : 'text-slate-400'
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

          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5 text-xs">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <div>
                <div className="font-semibold text-white">
                  100% Free Open Analytics Platform
                </div>
                <p className="mt-1 text-slate-300">
                  All market discovery, token analytics, whale tracking, read-only wallet portfolio tracking, watchlists, and in-app alerts on MULTITRADE AI are permanently free for all global users. {user ? `Cloud sync active for ${user.email || user.uid}.` : 'Sign in optionally only if you want cross-device cloud sync for saved watchlists and alert rules.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
