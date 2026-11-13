export const QuoteCurrencyValues = ['USD', 'INR', 'EUR', 'GBP'] as const;
export type QuoteCurrency = (typeof QuoteCurrencyValues)[number];

export const SubscriptionPlanValues = ['FREE', 'PRO', 'PREMIUM', 'INSTITUTIONAL'] as const;
export type SubscriptionPlan = (typeof SubscriptionPlanValues)[number];

export const RiskLevelValues = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'UNKNOWN'] as const;
export type RiskLevel = (typeof RiskLevelValues)[number];

export const AiOutcomeValues = [
  'REJECT',
  'HIGH RISK',
  'WATCHLIST',
  'FURTHER ANALYSIS',
  'TRADE CANDIDATE',
] as const;
export type AiReportOutcome = (typeof AiOutcomeValues)[number];

export const AgentStatusValues = ['OPERATIONAL', 'REGISTERED', 'OFFLINE'] as const;
export type AgentStatus = (typeof AgentStatusValues)[number];

export const SupportedTimeframeValues = ['1m', '5m', '15m', '1h', '4h', '24h'] as const;
export type SupportedTimeframe = (typeof SupportedTimeframeValues)[number];

export interface TokenMarketData {
  mint: string;
  pairAddress: string;
  symbol: string;
  name: string;
  imageUrl?: string;
  dexId: string;
  source: string;
  url: string;
  priceUsd: number;
  priceNative: number;
  marketCapUsd: number;
  fdvUsd: number;
  liquidityUsd: number;
  volume5mUsd: number;
  volume1hUsd: number;
  volume6hUsd: number;
  volume24hUsd: number;
  priceChange5m: number;
  priceChange1h: number;
  priceChange6h: number;
  priceChange24h: number;
  buys5m: number;
  sells5m: number;
  buys1h: number;
  sells1h: number;
  buys24h: number;
  sells24h: number;
  pairCreatedAt: number | null;
  bondingCurveProgressPct: number | null;
  migrationStatus: 'BONDING' | 'MIGRATED_RAYDIUM' | 'MIGRATED_PUMPSWAP' | 'DEX_POOL' | 'UNKNOWN';
  isPumpFun: boolean;
  holdersCount: number | null;
  creatorAddress: string | null;
  lastUpdatedUtc: string;
  freshness: 'REALTIME' | 'DELAYED' | 'HISTORICAL';
}

export interface OhlcvCandle {
  timestamp: number; // unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TopHolderInfo {
  address: string;
  tokenAccount: string;
  ownerAddress?: string | null;
  isPoolAccount?: boolean;
  amountUi: number;
  pctOfSupply: number;
}

export interface OnChainSignatureInfo {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: boolean;
  memo: string | null;
}

export interface ParsedOnChainTx {
  signature: string;
  type: 'BUY' | 'SELL' | 'TRANSFER';
  walletAddress: string | null;
  mint: string;
  symbol?: string;
  solAmount: number | null;
  tokenAmount: number | null;
  usdValue: number | null;
  blockTime: number | null;
  slot: number;
  err: boolean;
  source: string;
  solscanUrl: string;
}

export interface WhaleTransactionItem extends ParsedOnChainTx {
  tokenName?: string;
  tokenImageUrl?: string;
  marketCapUsd?: number;
  priceUsd?: number;
}

export interface OnChainTokenAudit {
  mint: string;
  rpcConnected: boolean;
  rpcSource: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  mintAuthorityRevoked: boolean | null;
  freezeAuthorityRevoked: boolean | null;
  totalSupplyUi: number | null;
  decimals: number | null;
  topHolders: TopHolderInfo[];
  top10ConcentrationPct: number | null;
  top20ConcentrationPct?: number | null;
  creatorHoldingsPct?: number | null;
  recentSignatures: OnChainSignatureInfo[];
  lastCheckedUtc: string;
  error?: string;
}

export interface RiskCheckItem {
  id: string;
  label: string;
  level: RiskLevel;
  summary: string;
  evidence: string;
}

export interface RugRiskAssessment {
  overallLevel: RiskLevel;
  criticalFlags: string[];
  checks: RiskCheckItem[];
  evaluatedAtUtc: string;
}

export interface AgentRoleDefinition {
  id: string;
  name: string;
  department: string;
  departmentCode: number;
  specialty: string;
  status: AgentStatus;
  executionMode: 'DETERMINISTIC' | 'LLM_ORCHESTRATOR' | 'PLANNED';
}

export interface AgentExecutionResult {
  agentId: string;
  agentName: string;
  department: string;
  status: AgentStatus;
  lastExecutionUtc: string;
  analysisResult: string;
  confidenceScore: number; // 0-100
  evidence: string[];
  riskLevel: RiskLevel;
  executionDurationMs: number;
  scoreContribution?: number;
}

export interface AiScoreBreakdown {
  onChainActivity: number; // /15
  liquidityQuality: number; // /15
  walletIntelligence: number; // /15
  marketMomentum: number; // /15
  socialIntelligence: number; // /10
  tokenDistribution: number; // /10
  technicalAnalysis: number; // /10
  executionQuality: number; // /10
}

export interface AiIntelligenceReport {
  mint: string;
  symbol: string;
  name: string;
  outcome: AiReportOutcome;
  overallScore: number; // 0-100
  confidenceLevel: number; // 0-100
  scoreBreakdown: AiScoreBreakdown;
  overriddenByCriticalRisk: boolean;
  bullishEvidence: string[];
  bearishEvidence: string[];
  riskWarnings: string[];
  supportingReferences: string[];
  missingInformation: string[];
  invalidationConditions: string[];
  explanation: string;
  orchestratorModel: string;
  llmSynthesized: boolean;
  generatedAtUtc: string;
  agentResults: AgentExecutionResult[];
}

export interface SocialMentionItem {
  id: string;
  platform: 'Reddit' | 'X' | 'Telegram' | 'Discord';
  author: string;
  title: string;
  url: string;
  createdUtc: string;
  score: number;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
}

export interface SocialSourceStatus {
  platform: 'Reddit' | 'X' | 'Telegram' | 'Discord';
  connected: boolean;
  mode: 'LIVE_PUBLIC' | 'API_KEY_REQUIRED' | 'RATE_LIMITED' | 'ERROR';
  message: string;
}

export interface SocialIntelligenceSummary {
  query: string;
  sentimentScore: number; // -100 to 100
  sentimentLabel: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'INSUFFICIENT_DATA';
  mentionsCount: number;
  trendingKeywords: string[];
  manipulationWarning: string | null;
  sources: SocialSourceStatus[];
  mentions: SocialMentionItem[];
  lastUpdatedUtc: string;
}

export interface WalletTokenHolding {
  mint: string;
  amountUi: number;
  decimals: number;
  symbol?: string;
  name?: string;
  imageUrl?: string;
  priceUsd?: number | null;
  priceChange24h?: number | null;
  valueUsd?: number | null;
}

export interface WalletIntelligenceProfile {
  address: string;
  solBalance: number | null;
  solPriceUsd: number | null;
  solValueUsd: number | null;
  totalTokensUsd: number | null;
  totalPortfolioUsd: number | null;
  holdings: WalletTokenHolding[];
  recentSignatures: OnChainSignatureInfo[];
  recentTransactions: ParsedOnChainTx[];
  estimatedRealizedPnlUsd: number | null;
  estimatedUnrealizedPnlUsd: number | null;
  costBasisStatus: 'ESTIMATED_RECENT_WINDOW' | 'INCOMPLETE_HISTORY';
  pnlLimitationNote: string;
  classification: 'UNVERIFIED_ACTIVE' | 'HIGH_VOLUME_PARTICIPANT' | 'CONCENTRATED_HOLDER' | 'LOW_ACTIVITY' | 'UNKNOWN';
  classificationEvidence: string[];
  rpcConnected: boolean;
  lastUpdatedUtc: string;
  error?: string;
}

export interface WatchedWallet {
  address: string;
  label: string;
  notes?: string;
  addedAt: string;
}

export interface InAppNotification {
  id: string;
  dedupeKey: string;
  ruleId: string;
  type: AlertRule['type'];
  title: string;
  message: string;
  mint?: string;
  symbol?: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  createdAt: string;
  read: boolean;
}

export const BacktestStrategyValues = [
  'momentum',
  'volume_breakout',
  'liquidity_based',
  'whale_activity',
  'early_launch',
  'pullback',
  'narrative_momentum',
] as const;
export type BacktestStrategyId = (typeof BacktestStrategyValues)[number];

export interface BacktestConfig {
  mint: string;
  symbol: string;
  strategyId: BacktestStrategyId;
  timeframe: SupportedTimeframe;
  feeBps: number;
  slippageBps: number;
  initialCapitalUsd: number;
  stopLossPct: number;
  takeProfitPct: number;
}

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  netReturnPct: number;
  pnlUsd: number;
  feesUsd: number;
  exitReason: 'SIGNAL' | 'TAKE_PROFIT' | 'STOP_LOSS' | 'END_OF_SERIES';
}

export interface BacktestEquityPoint {
  timestamp: number;
  equityUsd: number;
  drawdownPct: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  candlesAnalyzed: number;
  periodStartUtc: string;
  periodEndUtc: string;
  historicalReturnPct: number;
  winRatePct: number;
  maxDrawdownPct: number;
  profitFactor: number;
  totalTrades: number;
  avgHoldingMinutes: number;
  totalFeesUsd: number;
  finalEquityUsd: number;
  equityCurve: BacktestEquityPoint[];
  trades: BacktestTrade[];
  dataSource: string;
}

export interface PaperPosition {
  mint: string;
  symbol: string;
  name: string;
  quantity: number;
  avgEntryPriceUsd: number;
  totalCostUsd: number;
  openedAt: string;
  updatedAt: string;
}

export interface PaperOrder {
  id: string;
  mint: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  quotedPriceUsd: number;
  executedPriceUsd: number;
  slippageBps: number;
  feeUsd: number;
  notionalUsd: number;
  realizedPnlUsd?: number;
  executedAt: string;
}

export interface AlertRule {
  id: string;
  type:
    | 'NEW_TOKEN'
    | 'HIGH_AI_SCORE'
    | 'WHALE_BUY'
    | 'WHALE_SELL'
    | 'LIQUIDITY_CHANGE'
    | 'DEV_ACTIVITY'
    | 'CRITICAL_RISK'
    | 'PRICE_MOVE'
    | 'STRATEGY_SIGNAL'
    | 'DRAWDOWN';
  mint?: string;
  symbol?: string;
  condition: string;
  threshold?: number;
  enabled: boolean;
  createdAt: string;
}

export interface ConnectedWalletInfo {
  publicAddress: string;
  provider: 'Phantom' | 'Solflare' | 'ReadOnly' | 'Other';
  network: 'mainnet-beta' | 'devnet';
  connectedAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  plan: SubscriptionPlan;
  quoteCurrency: QuoteCurrency;
  timezone: string;
  countryCode: string;
  paperBalanceUsd: number;
  realizedPnlUsd: number;
  liveTradingEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DataProviderStatus {
  id: string;
  name: string;
  category: 'MARKET' | 'BLOCKCHAIN' | 'AI' | 'SOCIAL' | 'EXECUTION' | 'BILLING';
  connected: boolean;
  statusLabel: 'OPERATIONAL' | 'DEGRADED' | 'AWAITING_CREDENTIALS';
  detail: string;
  lastCheckedUtc: string;
}

export const AccountRiskProfileValues = ['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'] as const;
export type AccountRiskProfile = (typeof AccountRiskProfileValues)[number];

export const AgentMandateModeValues = ['ADVISORY_ONLY', 'PAPER_AUTOPILOT'] as const;
export type AgentMandateMode = (typeof AgentMandateModeValues)[number];

export const ManagedAccountKindValues = ['PAPER_DESK', 'SOLANA_WALLET'] as const;
export type ManagedAccountKind = (typeof ManagedAccountKindValues)[number];

export interface ManagedAccount {
  id: string;
  name: string;
  kind: ManagedAccountKind;
  walletAddress?: string;
  walletProvider?: 'Phantom' | 'Solflare' | 'ReadOnly' | 'Paper';
  riskProfile: AccountRiskProfile;
  mandateMode: AgentMandateMode;
  allocatedUsd: number;
  maxPositionPct: number;
  stopLossPct: number;
  takeProfitPct: number;
  createdAt: string;
  updatedAt: string;
}

export const TradeProposalActionValues = ['BUY', 'SELL', 'TRIM', 'HOLD'] as const;
export type TradeProposalAction = (typeof TradeProposalActionValues)[number];

export const TradeProposalStatusValues = ['PENDING', 'EXECUTED_PAPER', 'DISMISSED'] as const;
export type TradeProposalStatus = (typeof TradeProposalStatusValues)[number];

export interface BestTradeOption {
  mint: string;
  symbol: string;
  name: string;
  dexId: string;
  priceUsd: number;
  liquidityUsd: number;
  marketCapUsd: number;
  volume24hUsd: number;
  priceChange1h: number;
  buys1h: number;
  sells1h: number;
  score: number;
  riskLevel: RiskLevel;
  mintAuthorityRevoked: boolean | null;
  freezeAuthorityRevoked: boolean | null;
  suggestedUsd: number;
  entryPriceUsd: number;
  stopLossPriceUsd: number;
  takeProfitPriceUsd: number;
  riskRewardRatio: number;
  rationale: string;
  riskCaveats: string[];
}

export interface PortfolioActionProposal {
  id: string;
  accountId: string;
  action: TradeProposalAction;
  mint: string;
  symbol: string;
  name: string;
  currentPriceUsd: number;
  suggestedUsd: number;
  suggestedQuantity: number;
  confidenceScore: number;
  riskLevel: RiskLevel;
  reason: string;
  status: TradeProposalStatus;
  sourceAgent: string;
  createdAt: string;
}

export interface PortfolioAdvisorPlan {
  accountId: string;
  accountName: string;
  generatedAtUtc: string;
  orchestratorModel: string;
  llmSynthesized: boolean;
  bestTradePick: BestTradeOption | null;
  alternativeOptions: BestTradeOption[];
  portfolioActions: PortfolioActionProposal[];
  executiveSummary: string;
  riskWarnings: string[];
}

