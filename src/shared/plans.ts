import type { SubscriptionPlan } from './types.ts';

export interface PlanDefinition {
  id: SubscriptionPlan;
  name: string;
  audience: string;
  monthlyUsd: number;
  limits: {
    aiReportsPerDay: number;
    watchlistMaxTokens: number;
    backtestMaxBars: number;
    customAlertsMax: number;
    apiAccess: boolean;
    teamWorkspaces: boolean;
  };
  features: string[];
}

export const SUBSCRIPTION_PLANS: PlanDefinition[] = [
  {
    id: 'FREE',
    name: 'Free',
    audience: 'For exploratory traders',
    monthlyUsd: 0,
    limits: {
      aiReportsPerDay: 5,
      watchlistMaxTokens: 10,
      backtestMaxBars: 100,
      customAlertsMax: 3,
      apiAccess: false,
      teamWorkspaces: false,
    },
    features: [
      'Live Pump.fun & Solana token scanner',
      '5 AI multi-agent reports per day',
      '10 watchlist token slots',
      'Paper trading terminal ($10,000 virtual capital)',
    ],
  },
  {
    id: 'PRO',
    name: 'Pro',
    audience: 'For active Solana traders',
    monthlyUsd: 49,
    limits: {
      aiReportsPerDay: 40,
      watchlistMaxTokens: 50,
      backtestMaxBars: 300,
      customAlertsMax: 20,
      apiAccess: false,
      teamWorkspaces: false,
    },
    features: [
      '40 AI multi-agent reports per day',
      'Full Whale & Smart Wallet RPC inspector',
      '50 watchlist slots across 5 lists',
      'Extended OHLCV chart timeframes & 20 custom alerts',
    ],
  },
  {
    id: 'PREMIUM',
    name: 'Premium',
    audience: 'For quantitative researchers',
    monthlyUsd: 149,
    limits: {
      aiReportsPerDay: 200,
      watchlistMaxTokens: 250,
      backtestMaxBars: 1000,
      customAlertsMax: 100,
      apiAccess: false,
      teamWorkspaces: false,
    },
    features: [
      '200 AI multi-agent reports per day',
      'All 7 Strategy Lab deterministic backtesting models',
      '12-check Rug Pull & Authority forensic matrix',
      '100 custom alerts & CSV trade export',
    ],
  },
  {
    id: 'INSTITUTIONAL',
    name: 'Institutional',
    audience: 'For desks & research funds',
    monthlyUsd: 499,
    limits: {
      aiReportsPerDay: 2000,
      watchlistMaxTokens: 2000,
      backtestMaxBars: 5000,
      customAlertsMax: 500,
      apiAccess: true,
      teamWorkspaces: true,
    },
    features: [
      '2,000 AI multi-agent reports per day',
      'Dedicated Helius/RPC endpoint priority routing',
      'REST API access & shared team workspaces',
      'Custom agent scoring weights & audit compliance export',
    ],
  },
];
