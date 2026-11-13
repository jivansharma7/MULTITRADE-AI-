import type { QuoteCurrency } from './types.ts';

export const DEFAULT_FX_RATES: Record<QuoteCurrency, number> = {
  USD: 1,
  INR: 84.4,
  EUR: 0.93,
  GBP: 0.79,
};

const CURRENCY_LOCALES: Record<QuoteCurrency, string> = {
  USD: 'en-US',
  INR: 'en-IN',
  EUR: 'de-DE',
  GBP: 'en-GB',
};

export function formatQuoteCurrency(
  amountUsd: number,
  currency: QuoteCurrency,
  fxRates: Record<QuoteCurrency, number> = DEFAULT_FX_RATES,
  compact = false
): string {
  const rate = fxRates[currency] ?? 1;
  const converted = amountUsd * rate;
  const abs = Math.abs(converted);
  const locale = CURRENCY_LOCALES[currency] ?? 'en-US';

  if (compact) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: abs >= 1000 ? 2 : 2,
    }).format(converted);
  }

  let maximumFractionDigits = 2;
  if (abs > 0 && abs < 0.0001) {
    maximumFractionDigits = 8;
  } else if (abs > 0 && abs < 0.01) {
    maximumFractionDigits = 6;
  } else if (abs > 0 && abs < 1) {
    maximumFractionDigits = 4;
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: abs >= 1 ? 2 : Math.min(4, maximumFractionDigits),
    maximumFractionDigits,
  }).format(converted);
}

export function formatUtcOrLocalTimestamp(isoOrMs: string | number | null, timezone: string): string {
  if (!isoOrMs) return 'Unknown';
  const date = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
  }
}

export interface JurisdictionInfo {
  code: string;
  name: string;
  status: 'AVAILABLE' | 'RESEARCH_ONLY' | 'RESTRICTED';
  note: string;
}

export const JURISDICTIONS: JurisdictionInfo[] = [
  { code: 'US', name: 'United States', status: 'RESEARCH_ONLY', note: 'Analytics & Paper Trading available; live token execution disabled by compliance policy.' },
  { code: 'IN', name: 'India', status: 'AVAILABLE', note: 'Full analytics, multi-agent research, and paper trading supported.' },
  { code: 'GB', name: 'United Kingdom', status: 'AVAILABLE', note: 'Research & paper simulation available; digital asset risk disclosures apply.' },
  { code: 'DE', name: 'Germany / EU (MiCA)', status: 'AVAILABLE', note: 'Analytics & non-custodial wallet tools supported under MiCA transparency rules.' },
  { code: 'SG', name: 'Singapore', status: 'AVAILABLE', note: 'Institutional research, whale intelligence, and paper simulation available.' },
  { code: 'JP', name: 'Japan', status: 'RESEARCH_ONLY', note: 'Market research & paper trading available.' },
  { code: 'RESTRICTED', name: 'Sanctioned Jurisdictions', status: 'RESTRICTED', note: 'Service unavailable in OFAC/UN-sanctioned territories.' },
];
