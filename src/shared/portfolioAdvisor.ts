import { runDeterministicWorkersAndScore } from './scoringAndRisk.ts';
import type {
  BestTradeOption,
  ManagedAccount,
  OnChainTokenAudit,
  PaperPosition,
  PortfolioActionProposal,
  RiskLevel,
  TokenMarketData,
} from './types.ts';

export interface CandidateWithAudit {
  token: TokenMarketData;
  audit: OnChainTokenAudit | null;
}

function getProfileThresholds(riskProfile: ManagedAccount['riskProfile']) {
  switch (riskProfile) {
    case 'CONSERVATIVE':
      return {
        minLiquidityUsd: 50_000,
        minVolume24hUsd: 50_000,
        minScore: 60,
        liquidityBonusWeight: 1.25,
        momentumWeight: 0.75,
      };
    case 'AGGRESSIVE':
      return {
        minLiquidityUsd: 5_000,
        minVolume24hUsd: 5_000,
        minScore: 45,
        liquidityBonusWeight: 0.85,
        momentumWeight: 1.3,
      };
    default:
      return {
        minLiquidityUsd: 15_000,
        minVolume24hUsd: 20_000,
        minScore: 55,
        liquidityBonusWeight: 1.0,
        momentumWeight: 1.0,
      };
  }
}

export function rankBestTradeOptions(params: {
  candidates: CandidateWithAudit[];
  account: ManagedAccount;
  availableCashUsd: number;
  totalEquityUsd: number;
}): BestTradeOption[] {
  const { candidates, account, availableCashUsd, totalEquityUsd } = params;
  const thresholds = getProfileThresholds(account.riskProfile);
  const maxAllowedNotional = Math.max(0, totalEquityUsd * (account.maxPositionPct / 100));
  const rawSuggestedUsd = Math.min(availableCashUsd, maxAllowedNotional);
  const suggestedUsd = Number(Math.max(0, rawSuggestedUsd).toFixed(2));

  const scored: Array<{ rankScore: number; option: BestTradeOption }> = [];

  for (const { token, audit } of candidates) {
    if (token.priceUsd <= 0) continue;
    if (token.liquidityUsd < thresholds.minLiquidityUsd) continue;
    if (token.volume24hUsd < thresholds.minVolume24hUsd) continue;

    const det = runDeterministicWorkersAndScore({
      token,
      audit,
      candles: [],
      social: null,
      jupiterRouteVerified: null,
    });

    // Never recommend tokens with critical rug flags or REJECT outcome
    if (det.overriddenByCriticalRisk || det.outcome === 'REJECT') continue;
    if (account.riskProfile === 'CONSERVATIVE' && det.riskAssessment.overallLevel === 'HIGH') {
      continue;
    }

    const total1h = token.buys1h + token.sells1h;
    const buyShare = total1h > 0 ? token.buys1h / total1h : 0.5;
    const momentumAdj =
      (token.priceChange1h > 0 && token.priceChange1h < 120 ? 4 : 0) * thresholds.momentumWeight +
      (buyShare >= 0.55 ? 4 : 0);
    const liquidityAdj =
      (token.liquidityUsd >= 100_000 ? 5 : token.liquidityUsd >= 35_000 ? 2 : 0) *
      thresholds.liquidityBonusWeight;

    const rankScore = det.finalScore + momentumAdj + liquidityAdj;

    const entryPriceUsd = token.priceUsd;
    const stopLossPriceUsd = Number((entryPriceUsd * (1 - account.stopLossPct / 100)).toFixed(10));
    const takeProfitPriceUsd = Number((entryPriceUsd * (1 + account.takeProfitPct / 100)).toFixed(10));
    const riskRewardRatio = Number((account.takeProfitPct / Math.max(1, account.stopLossPct)).toFixed(2));

    const caveats: string[] = [];
    if (!audit || !audit.rpcConnected) {
      caveats.push('On-chain Mint/Freeze RPC audit incomplete; verify authority before live capital.');
    }
    if (token.liquidityUsd < 25_000) {
      caveats.push(`Thin pool liquidity ($${Math.round(token.liquidityUsd).toLocaleString()}) increases slippage.`);
    }
    if (token.priceChange24h < -25) {
      caveats.push(`24h drawdown of ${token.priceChange24h.toFixed(1)}% indicates elevated volatility.`);
    }
    if (caveats.length === 0) {
      caveats.push('Memecoin volatility remains extreme; profit is never guaranteed.');
    }

    const rationale = `${token.symbol} scores ${det.finalScore}/100 under ${account.riskProfile} profile on ${token.dexId} with $${Math.round(
      token.liquidityUsd
    ).toLocaleString()} pool liquidity and ${Math.round(buyShare * 100)}% 1h buy share (${token.buys1h}B/${
      token.sells1h
    }S).`;

    scored.push({
      rankScore,
      option: {
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        dexId: token.dexId,
        priceUsd: token.priceUsd,
        liquidityUsd: token.liquidityUsd,
        marketCapUsd: token.marketCapUsd,
        volume24hUsd: token.volume24hUsd,
        priceChange1h: token.priceChange1h,
        buys1h: token.buys1h,
        sells1h: token.sells1h,
        score: det.finalScore,
        riskLevel: det.riskAssessment.overallLevel,
        mintAuthorityRevoked: audit?.mintAuthorityRevoked ?? null,
        freezeAuthorityRevoked: audit?.freezeAuthorityRevoked ?? null,
        suggestedUsd,
        entryPriceUsd,
        stopLossPriceUsd,
        takeProfitPriceUsd,
        riskRewardRatio,
        rationale,
        riskCaveats: caveats,
      },
    });
  }

  scored.sort((a, b) => b.rankScore - a.rankScore);
  return scored.slice(0, 4).map((s) => s.option);
}

export function analyzePortfolioForAccount(params: {
  account: ManagedAccount;
  positions: PaperPosition[];
  liveTokens: TokenMarketData[];
  availableCashUsd: number;
  bestTradePick: BestTradeOption | null;
}): PortfolioActionProposal[] {
  const { account, positions, liveTokens, availableCashUsd, bestTradePick } = params;
  const tokenMap = new Map(liveTokens.map((t) => [t.mint, t]));
  const nowUtc = new Date().toISOString();

  const openValueUsd = positions.reduce((sum, pos) => {
    const px = tokenMap.get(pos.mint)?.priceUsd ?? pos.avgEntryPriceUsd;
    return sum + pos.quantity * px;
  }, 0);
  const totalEquityUsd = Math.max(1, availableCashUsd + openValueUsd);
  const proposals: PortfolioActionProposal[] = [];

  for (const pos of positions) {
    const live = tokenMap.get(pos.mint);
    const markPx = live?.priceUsd ?? pos.avgEntryPriceUsd;
    if (markPx <= 0 || pos.avgEntryPriceUsd <= 0) continue;

    const pnlPct = ((markPx - pos.avgEntryPriceUsd) / pos.avgEntryPriceUsd) * 100;
    const positionValueUsd = pos.quantity * markPx;
    const weightPct = (positionValueUsd / totalEquityUsd) * 100;

    // 1. Stop-Loss breach check
    if (pnlPct <= -account.stopLossPct) {
      proposals.push({
        id: `prop_sl_${pos.mint.slice(0, 8)}_${Date.now()}`,
        accountId: account.id,
        action: 'SELL',
        mint: pos.mint,
        symbol: pos.symbol,
        name: pos.name,
        currentPriceUsd: markPx,
        suggestedUsd: Number(positionValueUsd.toFixed(2)),
        suggestedQuantity: pos.quantity,
        confidenceScore: 92,
        riskLevel: 'HIGH',
        reason: `Stop-loss threshold (-${account.stopLossPct}%) breached at ${pnlPct.toFixed(
          1
        )}%; exit full position to preserve account capital.`,
        status: 'PENDING',
        sourceAgent: 'AGT-10-07 · Stop-Loss Breach Alerter',
        createdAt: nowUtc,
      });
      continue;
    }

    // 2. Take-Profit harvest check
    if (pnlPct >= account.takeProfitPct) {
      const trimQty = pos.quantity * 0.5;
      proposals.push({
        id: `prop_tp_${pos.mint.slice(0, 8)}_${Date.now()}`,
        accountId: account.id,
        action: 'TRIM',
        mint: pos.mint,
        symbol: pos.symbol,
        name: pos.name,
        currentPriceUsd: markPx,
        suggestedUsd: Number((trimQty * markPx).toFixed(2)),
        suggestedQuantity: trimQty,
        confidenceScore: 86,
        riskLevel: 'LOW',
        reason: `Take-profit target (+${account.takeProfitPct}%) reached at +${pnlPct.toFixed(
          1
        )}%; harvest 50% of position into cash.`,
        status: 'PENDING',
        sourceAgent: 'AGT-10-07 · Stop-Loss Breach Alerter',
        createdAt: nowUtc,
      });
      continue;
    }

    // 3. Concentration overweight check (> maxPositionPct + 5% buffer)
    if (weightPct > account.maxPositionPct + 5) {
      const targetUsd = totalEquityUsd * (account.maxPositionPct / 100);
      const excessUsd = Math.max(0, positionValueUsd - targetUsd);
      const trimQty = Math.min(pos.quantity, excessUsd / markPx);
      if (trimQty > 0 && excessUsd >= 25) {
        proposals.push({
          id: `prop_conc_${pos.mint.slice(0, 8)}_${Date.now()}`,
          accountId: account.id,
          action: 'TRIM',
          mint: pos.mint,
          symbol: pos.symbol,
          name: pos.name,
          currentPriceUsd: markPx,
          suggestedUsd: Number(excessUsd.toFixed(2)),
          suggestedQuantity: trimQty,
          confidenceScore: 82,
          riskLevel: 'MODERATE',
          reason: `${pos.symbol} represents ${weightPct.toFixed(
            1
          )}% of account NAV, exceeding ${account.maxPositionPct}% concentration cap.`,
          status: 'PENDING',
          sourceAgent: 'AGT-10-03 · Token Concentration Balancer',
          createdAt: nowUtc,
        });
        continue;
      }
    }

    // 4. Healthy HOLD status
    proposals.push({
      id: `prop_hold_${pos.mint.slice(0, 8)}_${Date.now()}`,
      accountId: account.id,
      action: 'HOLD',
      mint: pos.mint,
      symbol: pos.symbol,
      name: pos.name,
      currentPriceUsd: markPx,
      suggestedUsd: Number(positionValueUsd.toFixed(2)),
      suggestedQuantity: pos.quantity,
      confidenceScore: 72,
      riskLevel: (live && live.liquidityUsd < 15_000 ? 'HIGH' : 'MODERATE') as RiskLevel,
      reason: `Position within risk bounds (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(
        1
      )}% unrealized, ${weightPct.toFixed(1)}% weight vs ${account.maxPositionPct}% cap).`,
      status: 'PENDING',
      sourceAgent: 'AGT-10-01 · Paper & Wallet Portfolio Aggregator',
      createdAt: nowUtc,
    });
  }

  // 5. Propose best new allocation if cash available and not already holding pick at cap
  if (bestTradePick && availableCashUsd >= 50) {
    const existing = positions.find((p) => p.mint === bestTradePick.mint);
    const existingVal = existing ? existing.quantity * bestTradePick.priceUsd : 0;
    const capUsd = totalEquityUsd * (account.maxPositionPct / 100);
    const roomUsd = Math.min(availableCashUsd, Math.max(0, capUsd - existingVal));

    if (roomUsd >= 50) {
      const qty = roomUsd / bestTradePick.priceUsd;
      proposals.unshift({
        id: `prop_buy_${bestTradePick.mint.slice(0, 8)}_${Date.now()}`,
        accountId: account.id,
        action: 'BUY',
        mint: bestTradePick.mint,
        symbol: bestTradePick.symbol,
        name: bestTradePick.name,
        currentPriceUsd: bestTradePick.priceUsd,
        suggestedUsd: Number(roomUsd.toFixed(2)),
        suggestedQuantity: qty,
        confidenceScore: bestTradePick.score,
        riskLevel: bestTradePick.riskLevel,
        reason: `Top ranked opportunity (${bestTradePick.score}/100) matching ${account.riskProfile} risk profile; suggested SL -$${(
          roomUsd *
          (account.stopLossPct / 100)
        ).toFixed(2)} / TP +$${(roomUsd * (account.takeProfitPct / 100)).toFixed(2)}.`,
        status: 'PENDING',
        sourceAgent: 'AGT-12-01 · Chief AI Orchestrator',
        createdAt: nowUtc,
      });
    }
  }

  return proposals;
}
