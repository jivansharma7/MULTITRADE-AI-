import type { AgentRoleDefinition } from './types.ts';

export interface DepartmentSpec {
  code: number;
  name: string;
  targetCount: number;
  roles: Array<{
    name: string;
    specialty: string;
    operational: boolean;
    executionMode: 'DETERMINISTIC' | 'LLM_ORCHESTRATOR' | 'PLANNED';
  }>;
}

export const AGENT_DEPARTMENTS: DepartmentSpec[] = [
  {
    code: 1,
    name: 'Token Discovery',
    targetCount: 12,
    roles: [
      { name: 'Pump.fun Mint Streamer', specialty: 'Detects newly indexed Pump.fun & PumpSwap pairs', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Velocity Launch Filter', specialty: 'Measures early transaction cadence & market cap velocity', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Bonding Curve Stage Tracker', specialty: 'Tracks Pump.fun bonding vs Raydium/PumpSwap migration', operational: false, executionMode: 'PLANNED' },
      { name: 'Metadata Authenticity Scanner', specialty: 'Verifies token symbol uniqueness & metadata URI integrity', operational: false, executionMode: 'PLANNED' },
      { name: 'Duplicate Ticker Detector', specialty: 'Flags copycat symbols targeting trending launches', operational: false, executionMode: 'PLANNED' },
      { name: 'Pair Creation Age Auditor', specialty: 'Validates pair age against on-chain mint timestamps', operational: false, executionMode: 'PLANNED' },
      { name: 'DEX Venue Classifier', specialty: 'Classifies Pump.fun, PumpSwap, Raydium, and Orca venues', operational: false, executionMode: 'PLANNED' },
      { name: 'Boost & Profile Anomaly Watcher', specialty: 'Monitors paid DexScreener boosts vs organic volume', operational: false, executionMode: 'PLANNED' },
      { name: 'Micro-Cap Discovery Ranker', specialty: 'Ranks sub-$250K FDV tokens with real liquidity', operational: false, executionMode: 'PLANNED' },
      { name: 'Graduation Readiness Estimator', specialty: 'Estimates likelihood of bonding curve graduation', operational: false, executionMode: 'PLANNED' },
      { name: 'Cross-Pool Arbitrage Spotter', specialty: 'Finds multi-pool price divergence on Solana DEXs', operational: false, executionMode: 'PLANNED' },
      { name: 'Launch Cohort Benchmarker', specialty: 'Compares launch velocity against 24h cohort medians', operational: false, executionMode: 'PLANNED' },
    ],
  },
  {
    code: 2,
    name: 'Blockchain Intelligence',
    targetCount: 15,
    roles: [
      { name: 'Mint Authority Verifier', specialty: 'Inspects SPL Mint Account for active mintAuthority', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Freeze Authority Verifier', specialty: 'Inspects SPL Mint Account for active freezeAuthority', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Supply & Decimals Validator', specialty: 'Verifies on-chain token supply and decimal precision', operational: false, executionMode: 'PLANNED' },
      { name: 'Slot Confirmation Monitor', specialty: 'Checks recent signature finality & error rates', operational: false, executionMode: 'PLANNED' },
      { name: 'Token-2022 Extension Inspector', specialty: 'Checks transfer fee, permanent delegate, and non-transferable hooks', operational: false, executionMode: 'PLANNED' },
      { name: 'Program Upgrade Authority Auditor', specialty: 'Monitors custom AMM/token program mutability', operational: false, executionMode: 'PLANNED' },
      { name: 'LP Burn & Lock Verifier', specialty: 'Inspects LP mint custody and burn addresses', operational: false, executionMode: 'PLANNED' },
      { name: 'Creator Deployer Trace Agent', specialty: 'Traces deployer SOL funding source on-chain', operational: false, executionMode: 'PLANNED' },
      { name: 'Compute Unit Spike Profiler', specialty: 'Detects bot-heavy priority fee bursts in signatures', operational: false, executionMode: 'PLANNED' },
      { name: 'Failed Tx Ratio Inspector', specialty: 'Computes reverted tx share from recent mint signatures', operational: false, executionMode: 'PLANNED' },
      { name: 'Jito Bundle Activity Tracker', specialty: 'Estimates MEV bundle clustering around launch slot', operational: false, executionMode: 'PLANNED' },
      { name: 'Instruction Pattern Classifier', specialty: 'Separates swaps from mint/burn/transfer instructions', operational: false, executionMode: 'PLANNED' },
      { name: 'Cross-Program Invocation Auditor', specialty: 'Audits router CPI calls for hidden fee sinks', operational: false, executionMode: 'PLANNED' },
      { name: 'Blockhash Freshness Checker', specialty: 'Validates RPC tip-slot lag for data integrity', operational: false, executionMode: 'PLANNED' },
      { name: 'Anchor IDL Schema Decoder', specialty: 'Decodes Pump.fun bonding curve account state', operational: false, executionMode: 'PLANNED' },
    ],
  },
  {
    code: 3,
    name: 'Liquidity Intelligence',
    targetCount: 10,
    roles: [
      { name: 'Liquidity Depth & Ratio Worker', specialty: 'Evaluates USD liquidity relative to FDV and 24h volume', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Exit Liquidity Stress Tester', specialty: 'Estimates slippage impact on simulated $1K/$5K/$10K exits', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'LP Withdrawal Velocity Monitor', specialty: 'Watches sudden pool reserve drops across snapshots', operational: false, executionMode: 'PLANNED' },
      { name: 'Quote Reserve Imbalance Tracker', specialty: 'Measures SOL-to-token pool ratio skew', operational: false, executionMode: 'PLANNED' },
      { name: 'Concentrated Liquidity Range Mapper', specialty: 'Maps tick liquidity density on CLMM pools', operational: false, executionMode: 'PLANNED' },
      { name: 'Pool Fragmentation Analyzer', specialty: 'Quantifies liquidity split across multiple pools', operational: false, executionMode: 'PLANNED' },
      { name: 'Minimum Viable Depth Gate', specialty: 'Flags pools below $10K institutional liquidity threshold', operational: false, executionMode: 'PLANNED' },
      { name: 'Spread & Depth Stability Scorer', specialty: 'Scores liquidity consistency over rolling 1h/6h windows', operational: false, executionMode: 'PLANNED' },
      { name: 'Single-LP Dominance Checker', specialty: 'Detects pools controlled by one liquidity provider', operational: false, executionMode: 'PLANNED' },
      { name: 'Migration Liquidity Retention Tracker', specialty: 'Compares pre- and post-migration liquidity retention', operational: false, executionMode: 'PLANNED' },
    ],
  },
  {
    code: 4,
    name: 'Wallet Intelligence',
    targetCount: 12,
    roles: [
      { name: 'Top Holder Concentration Analyzer', specialty: 'Measures Top-10 holder percentage from Solana RPC', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Whale & Smart Flow Evaluator', specialty: 'Analyzes large holder dominance and tx cadence', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Creator Wallet Behavior Monitor', specialty: 'Tracks creator holdings and recent signature bursts', operational: false, executionMode: 'PLANNED' },
      { name: 'Fresh Wallet Cluster Detector', specialty: 'Flags newly funded wallets buying in synchronized blocks', operational: false, executionMode: 'PLANNED' },
      { name: 'Sniper Entry Cohort Tracker', specialty: 'Identifies slot-0 and slot-1 early buyers', operational: false, executionMode: 'PLANNED' },
      { name: 'Diamond-Hand Retention Scorer', specialty: 'Measures holding duration among top 25 accounts', operational: false, executionMode: 'PLANNED' },
      { name: 'Realized Profit Cohort Estimator', specialty: 'Estimates cost basis and distribution pressure', operational: false, executionMode: 'PLANNED' },
      { name: 'Related Wallet Graph Builder', specialty: 'Links wallets sharing common SOL funding transfers', operational: false, executionMode: 'PLANNED' },
      { name: 'CEX Deposit Bridge Watcher', specialty: 'Monitors outflows toward centralized exchange hot wallets', operational: false, executionMode: 'PLANNED' },
      { name: 'Insider Evidence Validator', specialty: 'Requires multi-tx provenance before labeling any wallet', operational: false, executionMode: 'PLANNED' },
      { name: 'Dormant Whale Reawakening Detector', specialty: 'Alerts when inactive high-SOL wallets enter a micro-cap', operational: false, executionMode: 'PLANNED' },
      { name: 'Distribution Velocity Tracker', specialty: 'Tracks net balance reduction across top 20 accounts', operational: false, executionMode: 'PLANNED' },
    ],
  },
  {
    code: 5,
    name: 'Social Intelligence',
    targetCount: 10,
    roles: [
      { name: 'Public Social Sentiment Worker', specialty: 'Scores live Reddit/configured social mentions & keywords', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Social Manipulation Heuristic', specialty: 'Flags thin social presence vs hype-driven volume spikes', operational: false, executionMode: 'PLANNED' },
      { name: 'Narrative Theme Classifier', specialty: 'Clusters emerging meme narratives (AI, animal, political, culture)', operational: false, executionMode: 'PLANNED' },
      { name: 'X/Twitter Velocity Adapter', specialty: 'Ingests X API v2 mention spikes when bearer token configured', operational: false, executionMode: 'PLANNED' },
      { name: 'Telegram Public Channel Monitor', specialty: 'Tracks public Telegram group call frequency when configured', operational: false, executionMode: 'PLANNED' },
      { name: 'Discord Community Growth Tracker', specialty: 'Monitors public Discord member & message activity', operational: false, executionMode: 'PLANNED' },
      { name: 'Influencer Shill Pattern Detector', specialty: 'Detects coordinated KOL posting windows', operational: false, executionMode: 'PLANNED' },
      { name: 'Bot Engagement Filter', specialty: 'Filters repetitive copy-paste social spam', operational: false, executionMode: 'PLANNED' },
      { name: 'Reddit Community Traction Scorer', specialty: 'Measures organic comment-to-upvote engagement', operational: false, executionMode: 'PLANNED' },
      { name: 'Domain & Social Link Verifier', specialty: 'Verifies official website & social links from metadata', operational: false, executionMode: 'PLANNED' },
    ],
  },
  {
    code: 6,
    name: 'Market Analysis',
    targetCount: 12,
    roles: [
      { name: 'Buy/Sell Pressure Imbalance Worker', specialty: 'Computes 5m, 1h, and 24h buy-to-sell tx ratio', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Price Momentum & ROC Worker', specialty: 'Scores multi-horizon price change and trend persistence', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Technical OHLCV Indicator Worker', specialty: 'Computes RSI(14), EMA(9/21), and ATR volatility on candles', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Volume-to-MCap Turnover Analyzer', specialty: 'Evaluates organic turnover vs illiquid spikes', operational: false, executionMode: 'PLANNED' },
      { name: 'Order Flow Delta Estimator', specialty: 'Estimates net buyer aggression across recent bars', operational: false, executionMode: 'PLANNED' },
      { name: 'Support & Resistance Clusterer', specialty: 'Identifies high-volume price shelves in OHLCV history', operational: false, executionMode: 'PLANNED' },
      { name: 'Volatility Regime Classifier', specialty: 'Classifies expansion, compression, and exhaustion phases', operational: false, executionMode: 'PLANNED' },
      { name: 'SOL Beta Correlation Worker', specialty: 'Measures token sensitivity to SOL/USD intraday moves', operational: false, executionMode: 'PLANNED' },
      { name: 'VWAP Deviation Monitor', specialty: 'Calculates distance from session volume-weighted average price', operational: false, executionMode: 'PLANNED' },
      { name: 'Breakout Confirmation Scorer', specialty: 'Requires volume expansion on multi-bar highs', operational: false, executionMode: 'PLANNED' },
      { name: 'Mean Reversion Overextension Guard', specialty: 'Flags parabolic moves > 3x ATR from short EMA', operational: false, executionMode: 'PLANNED' },
      { name: 'Micro-Structure Wick Analyzer', specialty: 'Detects upper-wick distribution candles', operational: false, executionMode: 'PLANNED' },
    ],
  },
  {
    code: 7,
    name: 'Risk Management',
    targetCount: 15,
    roles: [
      { name: 'Critical Rug Flag Override Gate', specialty: 'Overrides score on active mint/freeze authority or severe skew', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Artificial Volume Heuristic Worker', specialty: 'Flags abnormal volume/tx size anomalies indicating wash trading', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Sellability & Honeypot Simulator', specialty: 'Verifies two-way sell txs and Jupiter route availability', operational: false, executionMode: 'PLANNED' },
      { name: 'Coordinated Buying Burst Detector', specialty: 'Detects abnormal 5m buy spikes without holder growth', operational: false, executionMode: 'PLANNED' },
      { name: 'Drawdown Tail-Risk Estimator', specialty: 'Estimates 95th-percentile downside gap risk', operational: false, executionMode: 'PLANNED' },
      { name: 'Concentration Gini Coefficient', specialty: 'Computes inequality across top 20 token accounts', operational: false, executionMode: 'PLANNED' },
      { name: 'Unlock & Supply Shock Guard', specialty: 'Monitors sudden circulating supply changes', operational: false, executionMode: 'PLANNED' },
      { name: 'Liquidity-to-FDV Fragility Index', specialty: 'Quantifies thin-book crash risk', operational: false, executionMode: 'PLANNED' },
      { name: 'Creator Dump Probability Scorer', specialty: 'Scores residual creator supply risk', operational: false, executionMode: 'PLANNED' },
      { name: 'Sandwich & MEV Exposure Guard', specialty: 'Estimates vulnerability to Jito/sandwich extraction', operational: false, executionMode: 'PLANNED' },
      { name: 'Stop-Loss Invalidation Generator', specialty: 'Computes structural invalidation price levels', operational: false, executionMode: 'PLANNED' },
      { name: 'Stale Data Circuit Breaker', specialty: 'Marks risk UNKNOWN when RPC or market feeds are stale', operational: false, executionMode: 'PLANNED' },
      { name: 'Max Position Cap Recommender', specialty: 'Caps position size by available exit liquidity', operational: false, executionMode: 'PLANNED' },
      { name: 'Blacklisted Deployer Cross-Checker', specialty: 'Cross-references known rug-pull deployer patterns', operational: false, executionMode: 'PLANNED' },
      { name: 'Jurisdictional Compliance Filter', specialty: 'Enforces regional compliance & risk disclosure gates', operational: false, executionMode: 'PLANNED' },
    ],
  },
  {
    code: 8,
    name: 'Strategy Research',
    targetCount: 10,
    roles: [
      { name: 'Deterministic Backtest Runner', specialty: 'Runs zero-lookahead simulations across 7 quantitative strategies', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Slippage & Fee Sensitivity Analyst', specialty: 'Adjusts backtest returns for realistic DEX fees and slippage', operational: false, executionMode: 'PLANNED' },
      { name: 'Momentum Factor Researcher', specialty: 'Evaluates EMA/ROC continuation alpha on Solana pairs', operational: false, executionMode: 'PLANNED' },
      { name: 'Volume Breakout Calibrator', specialty: 'Tunes volume surge thresholds across market-cap tiers', operational: false, executionMode: 'PLANNED' },
      { name: 'Pullback Entry Optimizer', specialty: 'Identifies high reward-to-risk retracement zones', operational: false, executionMode: 'PLANNED' },
      { name: 'Walk-Forward Stability Tester', specialty: 'Checks out-of-sample consistency across candle windows', operational: false, executionMode: 'PLANNED' },
      { name: 'Holding Period Decay Analyzer', specialty: 'Measures alpha decay from 5m to 24h holding windows', operational: false, executionMode: 'PLANNED' },
      { name: 'Win-Rate vs Payoff Ratio Scorer', specialty: 'Balances hit rate against profit factor asymmetry', operational: false, executionMode: 'PLANNED' },
      { name: 'Regime-Conditional Selector', specialty: 'Matches strategy templates to current volatility regime', operational: false, executionMode: 'PLANNED' },
      { name: 'Look-Ahead Bias Auditor', specialty: 'Verifies strict causal indexing in backtest pipelines', operational: false, executionMode: 'PLANNED' },
    ],
  },
  {
    code: 9,
    name: 'Execution Intelligence',
    targetCount: 8,
    roles: [
      { name: 'Jupiter Route & Impact Estimator', specialty: 'Checks swap route availability, slippage, and price impact', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Paper Execution Simulator', specialty: 'Executes simulated buys/sells with fee & slippage modeling', operational: false, executionMode: 'PLANNED' },
      { name: 'Priority Fee Estimator', specialty: 'Recommends Solana compute budget microlamports', operational: false, executionMode: 'PLANNED' },
      { name: 'Pre-Sign Transaction Decoder', specialty: 'Parses serialized tx instructions prior to user wallet approval', operational: false, executionMode: 'PLANNED' },
      { name: 'Duplicate Submission Guard', specialty: 'Prevents accidental double-click live order broadcasts', operational: false, executionMode: 'PLANNED' },
      { name: 'On-Chain Confirmation Verifier', specialty: 'Polls finalized signature status after wallet signature', operational: false, executionMode: 'PLANNED' },
      { name: 'Partial Fill & Route Splitter', specialty: 'Evaluates multi-hop vs direct pool execution efficiency', operational: false, executionMode: 'PLANNED' },
      { name: 'Live Execution Safety Lock', specialty: 'Enforces disabled-by-default & human-approval policy', operational: false, executionMode: 'PLANNED' },
    ],
  },
  {
    code: 10,
    name: 'Portfolio Management',
    targetCount: 8,
    roles: [
      { name: 'Paper & Wallet Portfolio Aggregator', specialty: 'Tracks unrealized/realized P&L, cash utilization & open positions', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Drawdown & Risk Exposure Tracker', specialty: 'Monitors peak-to-trough portfolio equity drawdown', operational: false, executionMode: 'PLANNED' },
      { name: 'Token Concentration Balancer', specialty: 'Flags single-token exposure above account maxPositionPct and proposes trims', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Multi-Currency Valuation Engine', specialty: 'Converts portfolio NAV across USD, INR, EUR, and GBP', operational: false, executionMode: 'PLANNED' },
      { name: 'Cost-Basis FIFO Calculator', specialty: 'Tracks weighted average entry & realized trade P&L', operational: false, executionMode: 'PLANNED' },
      { name: 'Correlation Risk Monitor', specialty: 'Detects over-exposure to correlated meme cohorts', operational: false, executionMode: 'PLANNED' },
      { name: 'Stop-Loss Breach Alerter', specialty: 'Monitors stop-loss and take-profit thresholds across active accounts', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Performance Attribution Analyst', specialty: 'Separates win/loss contribution by strategy and token', operational: false, executionMode: 'PLANNED' },
    ],
  },
  {
    code: 11,
    name: 'Audit and Monitoring',
    targetCount: 6,
    roles: [
      { name: 'Data Freshness & Evidence Auditor', specialty: 'Audits API source timestamps and missing fields', operational: true, executionMode: 'DETERMINISTIC' },
      { name: 'Worker Latency & Cost Tracker', specialty: 'Monitors execution durations and LLM call deduplication', operational: false, executionMode: 'PLANNED' },
      { name: 'Rate Limit & Backoff Guardian', specialty: 'Prevents upstream RPC and DEX API throttling', operational: false, executionMode: 'PLANNED' },
      { name: 'Security Policy Enforcer', specialty: 'Verifies zero private key handling in all payloads', operational: false, executionMode: 'PLANNED' },
      { name: 'Immutable Audit Trail Logger', specialty: 'Records analysis runs, trades, and wallet links', operational: false, executionMode: 'PLANNED' },
      { name: 'Schema Validation Gatekeeper', specialty: 'Validates structured agent JSON outputs against schema', operational: false, executionMode: 'PLANNED' },
    ],
  },
  {
    code: 12,
    name: 'Central Coordination',
    targetCount: 12,
    roles: [
      { name: 'Chief AI Orchestrator (Gemini)', specialty: 'Synthesizes 8-category consensus & final research report via Gemini', operational: true, executionMode: 'LLM_ORCHESTRATOR' },
      { name: 'Consensus & Evidence Validator', specialty: 'Enforces 100-pt rubric, invalidation rules & non-guarantee policy', operational: false, executionMode: 'PLANNED' },
      { name: 'Job Deduplication Coordinator', specialty: 'Coalesces concurrent analysis requests for identical mints', operational: false, executionMode: 'PLANNED' },
      { name: 'Department Priority Scheduler', specialty: 'Schedules deterministic workers before LLM synthesis', operational: false, executionMode: 'PLANNED' },
      { name: 'Cache TTL Manager', specialty: 'Reuses validated reports within freshness windows', operational: false, executionMode: 'PLANNED' },
      { name: 'Conflict Resolution Arbiter', specialty: 'Reconciles bullish momentum vs bearish on-chain warnings', operational: false, executionMode: 'PLANNED' },
      { name: 'Missing Data Escalator', specialty: 'Lists unverified metrics explicitly in Missing Information', operational: false, executionMode: 'PLANNED' },
      { name: 'Human-Approval Workflow Router', specialty: 'Routes TRADE CANDIDATE outputs only to human review', operational: false, executionMode: 'PLANNED' },
      { name: 'Timeout & Retry Supervisor', specialty: 'Enforces per-worker deadlines without blocking consensus', operational: false, executionMode: 'PLANNED' },
      { name: 'Confidence Calibration Engine', specialty: 'Reduces confidence when RPC or social inputs are unavailable', operational: false, executionMode: 'PLANNED' },
      { name: 'Department Scaling Controller', specialty: 'Manages concurrency quotas per analytical department', operational: false, executionMode: 'PLANNED' },
      { name: 'Explainability Narrative Builder', specialty: 'Formats institutional decision rationale with evidence links', operational: false, executionMode: 'PLANNED' },
    ],
  },
];

export const AGENT_REGISTRY: AgentRoleDefinition[] = AGENT_DEPARTMENTS.flatMap((dept) =>
  dept.roles.map((role, idx) => ({
    id: `AGT-${String(dept.code).padStart(2, '0')}-${String(idx + 1).padStart(2, '0')}`,
    name: role.name,
    department: dept.name,
    departmentCode: dept.code,
    specialty: role.specialty,
    status: role.operational ? 'OPERATIONAL' : 'REGISTERED',
    executionMode: role.executionMode,
  }))
);

export function getRegistryStats() {
  const total = AGENT_REGISTRY.length;
  const operational = AGENT_REGISTRY.filter((a) => a.status === 'OPERATIONAL').length;
  const registered = AGENT_REGISTRY.filter((a) => a.status === 'REGISTERED').length;
  return {
    total,
    operational,
    registered,
    departmentsCount: AGENT_DEPARTMENTS.length,
  };
}
