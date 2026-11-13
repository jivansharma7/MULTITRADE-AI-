import React from 'react';

interface EquityPoint {
  timestamp: number;
  value: number;
  label?: string;
}

interface EquityCurveChartProps {
  points: EquityPoint[];
  height?: number;
  baselineValue?: number;
  strokeColor?: string;
  formatValue?: (v: number) => string;
}

export const EquityCurveChart: React.FC<EquityCurveChartProps> = ({
  points,
  height = 200,
  baselineValue,
  strokeColor = '#3B82F6',
  formatValue = (v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
}) => {
  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-slate-800/80 bg-[#0A0F1C] p-4 text-xs text-slate-500"
        style={{ height }}
      >
        Execute at least two data points or simulated trades to render performance curve.
      </div>
    );
  }

  const width = 720;
  const padX = 14;
  const padY = 18;
  const vals = points.map((p) => p.value);
  const minVal = Math.min(...vals, baselineValue ?? vals[0]);
  const maxVal = Math.max(...vals, baselineValue ?? vals[0]);
  const range = Math.max(maxVal - minVal, 1);

  const coords = points.map((p, idx) => {
    const x = padX + (idx / (points.length - 1)) * (width - padX * 2);
    const y = padY + (height - padY * 2) - ((p.value - minVal) / range) * (height - padY * 2);
    return { x, y };
  });

  const linePath = coords.map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(height - padY).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(height - padY).toFixed(1)} Z`;

  const last = points[points.length - 1].value;
  const first = baselineValue ?? points[0].value;
  const isGain = last >= first;
  const activeStroke = isGain ? strokeColor : '#EF4444';

  return (
    <div className="rounded-lg border border-slate-800/80 bg-[#0A0F1C] p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-slate-400">Start: {formatValue(first)}</span>
        <span className={`font-mono font-semibold tabular-nums ${isGain ? 'text-emerald-400' : 'text-rose-400'}`}>
          Latest: {formatValue(last)}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
        <defs>
          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={activeStroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={activeStroke} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {baselineValue !== undefined && (
          <line
            x1={padX}
            x2={width - padX}
            y1={
              padY +
              (height - padY * 2) -
              ((baselineValue - minVal) / range) * (height - padY * 2)
            }
            y2={
              padY +
              (height - padY * 2) -
              ((baselineValue - minVal) / range) * (height - padY * 2)
            }
            stroke="#334155"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
        )}
        <path d={areaPath} fill="url(#eqGrad)" />
        <path d={linePath} fill="none" stroke={activeStroke} strokeWidth={2} />
      </svg>
    </div>
  );
};
