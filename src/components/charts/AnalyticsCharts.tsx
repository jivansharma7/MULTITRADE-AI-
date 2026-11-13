import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TokenMarketData, TopHolderInfo } from '../../shared/types';

const PALETTE = ['#3B82F6', '#6366F1', '#10B981', '#06B6D4', '#F59E0B', '#EC4899', '#64748B'];

export const HolderDistributionChart: React.FC<{
  holders: TopHolderInfo[];
}> = ({ holders }) => {
  if (!holders.length) {
    return (
      <div className="flex h-44 items-center justify-center rounded-lg border border-slate-800/80 bg-[#070B14] text-xs text-slate-500">
        Top holder distribution data unavailable.
      </div>
    );
  }

  const data = holders.slice(0, 12).map((h, i) => ({
    rank: `#${i + 1}`,
    pct: h.pctOfSupply,
    type: h.isPoolAccount ? 'AMM Pool' : 'Wallet',
    addr: h.ownerAddress || h.address,
  }));

  return (
    <div className="h-48 w-full" data-testid="holder-distribution-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
          <XAxis
            dataKey="rank"
            tick={{ fill: '#64748B', fontSize: 10 }}
            axisLine={{ stroke: '#1E293B' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#64748B', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            unit="%"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0A0F1C',
              borderColor: '#1E293B',
              borderRadius: '8px',
              fontSize: '11px',
              color: '#F1F5F9',
            }}
            formatter={(val: any, _name: any, props: any) => [
              `${Number(val).toFixed(2)}% (${props?.payload?.type})`,
              'Supply Share',
            ]}
          />
          <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell
                key={entry.rank}
                fill={entry.type === 'AMM Pool' ? '#6366F1' : idx === 0 ? '#F59E0B' : '#3B82F6'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const PortfolioAllocationChart: React.FC<{
  slices: Array<{ label: string; valueUsd: number; pct: number }>;
}> = ({ slices }) => {
  if (!slices.length) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-slate-800/80 bg-[#070B14] text-xs text-slate-500">
        No live-priced balances available for allocation chart.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-2" data-testid="portfolio-allocation-chart">
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="valueUsd"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={72}
              paddingAngle={2}
            >
              {slices.map((s, idx) => (
                <Cell key={s.label} fill={PALETTE[idx % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#0A0F1C',
                borderColor: '#1E293B',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#F1F5F9',
              }}
              formatter={(val: any) => [`$${Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, 'Value']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1.5 text-xs">
        {slices.map((s, idx) => (
          <div key={s.label} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
              />
              <span className="truncate font-medium text-slate-200">{s.label}</span>
            </div>
            <span className="font-mono text-slate-400 tabular-nums">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const MarketActivityChart: React.FC<{
  tokens: TokenMarketData[];
}> = ({ tokens }) => {
  const top = [...tokens]
    .filter((t) => t.volume1hUsd > 0 || t.volume24hUsd > 0)
    .sort((a, b) => b.volume1hUsd - a.volume1hUsd)
    .slice(0, 8)
    .map((t) => ({
      symbol: t.symbol.slice(0, 8),
      vol1hK: Math.round(t.volume1hUsd / 1000),
      liqK: Math.round(t.liquidityUsd / 1000),
    }));

  if (!top.length) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-slate-800/80 bg-[#070B14] text-xs text-slate-500">
        Awaiting live Solana market activity...
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="market-activity-chart">
      <div className="flex items-center gap-4 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-blue-500" />
          1h Volume
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-indigo-500" />
          Pool Liquidity
        </span>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={top} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
            <XAxis
              dataKey="symbol"
              tick={{ fill: '#94A3B8', fontSize: 10 }}
              axisLine={{ stroke: '#1E293B' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#64748B', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              unit="K"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0A0F1C',
                borderColor: '#1E293B',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#F1F5F9',
              }}
              formatter={(val: any, name: any) => [
                `$${Number(val).toLocaleString()}K`,
                name === 'vol1hK' ? '1h Volume' : 'Pool Liquidity',
              ]}
            />
            <Bar dataKey="vol1hK" name="vol1hK" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="liqK" name="liqK" fill="#6366F1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
