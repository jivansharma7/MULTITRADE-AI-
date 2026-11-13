import React from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, HelpCircle, Info } from 'lucide-react';
import type { AiReportOutcome, RiskLevel } from '../../shared/types';

export const RiskLevelTag: React.FC<{ level: RiskLevel }> = ({ level }) => {
  switch (level) {
    case 'LOW':
      return (
        <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-400">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          LOW
        </span>
      );
    case 'MODERATE':
      return (
        <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-amber-400">
          <Info className="h-3 w-3 shrink-0" />
          MODERATE
        </span>
      );
    case 'HIGH':
      return (
        <span className="inline-flex items-center gap-1 rounded border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-orange-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          HIGH
        </span>
      );
    case 'CRITICAL':
      return (
        <span className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-400">
          <AlertOctagon className="h-3 w-3 shrink-0" />
          CRITICAL
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800/70 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-300">
          <HelpCircle className="h-3 w-3 shrink-0" />
          UNKNOWN
        </span>
      );
  }
};

export const AiOutcomeTag: React.FC<{ outcome: AiReportOutcome }> = ({ outcome }) => {
  const styles: Record<AiReportOutcome, string> = {
    'TRADE CANDIDATE': 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    'FURTHER ANALYSIS': 'border-blue-500/40 bg-blue-500/15 text-blue-300',
    WATCHLIST: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
    'HIGH RISK': 'border-orange-500/40 bg-orange-500/15 text-orange-300',
    REJECT: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
  };
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold whitespace-nowrap ${styles[outcome]}`}
    >
      {outcome}
    </span>
  );
};
