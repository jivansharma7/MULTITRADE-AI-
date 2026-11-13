import React, { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type IChartApi,
  type Time,
} from 'lightweight-charts';
import type { OhlcvCandle } from '../../shared/types';

interface CandlestickChartProps {
  candles: OhlcvCandle[];
  height?: number;
  symbol: string;
  timeframe: string;
  source: string;
  freshness: string;
}

function formatPx(p: number): string {
  if (!Number.isFinite(p)) return '—';
  if (p >= 1) return `$${p.toFixed(4)}`;
  if (p >= 0.001) return `$${p.toFixed(6)}`;
  return `$${p.toExponential(3)}`;
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  candles,
  height = 380,
  symbol,
  timeframe,
  source,
  freshness,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [hovered, setHovered] = useState<OhlcvCandle | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length === 0) return;

    const chart = createChart(el, {
      width: el.clientWidth || 720,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#0A0F1C' },
        textColor: '#94A3B8',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.55)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.55)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#3B82F6', labelBackgroundColor: '#1E293B' },
        horzLine: { color: '#3B82F6', labelBackgroundColor: '#1E293B' },
      },
      rightPriceScale: {
        borderColor: '#1E293B',
        scaleMargins: { top: 0.08, bottom: 0.25 },
      },
      timeScale: {
        borderColor: '#1E293B',
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
      priceFormat: {
        type: 'price',
        precision: candles[candles.length - 1].close < 0.01 ? 7 : 4,
        minMove: candles[candles.length - 1].close < 0.01 ? 0.0000001 : 0.0001,
      },
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    // Deduplicate ascending unix seconds required by lightweight-charts
    const seenSec = new Set<number>();
    const dedupedCandles: OhlcvCandle[] = [];
    for (const c of candles) {
      const sec = Math.floor(c.timestamp / 1000);
      if (!seenSec.has(sec)) {
        seenSec.add(sec);
        dedupedCandles.push(c);
      }
    }

    const barMap = new Map<number, OhlcvCandle>();
    const candleData = dedupedCandles.map((c) => {
      const sec = Math.floor(c.timestamp / 1000);
      barMap.set(sec, c);
      return {
        time: sec as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      };
    });

    const volData = dedupedCandles.map((c) => ({
      time: Math.floor(c.timestamp / 1000) as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(16, 185, 129, 0.32)' : 'rgba(239, 68, 68, 0.32)',
    }));

    candleSeries.setData(candleData);
    volumeSeries.setData(volData);
    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setHovered(null);
        return;
      }
      const t = typeof param.time === 'number' ? param.time : null;
      if (t !== null && barMap.has(t)) {
        setHovered(barMap.get(t) || null);
      }
    });

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, height]);

  if (!candles.length) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-lg border border-slate-800/80 bg-[#0A0F1C] p-6 text-center"
        style={{ height }}
      >
        <p className="text-sm font-medium text-slate-300">
          Historical OHLCV candles unavailable for {symbol} ({timeframe})
        </p>
        <p className="mt-1 text-xs text-slate-500">
          This pair may be newly created on a bonding curve or not yet indexed by GeckoTerminal.
        </p>
      </div>
    );
  }

  const active = hovered || candles[candles.length - 1];
  const isUp = active.close >= active.open;

  return (
    <div className="rounded-lg border border-slate-800/80 bg-[#0A0F1C] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
          <span className="font-semibold text-slate-200">
            {symbol}/USD · {timeframe}
          </span>
          <span className="text-slate-400">O {formatPx(active.open)}</span>
          <span className="text-slate-400">H {formatPx(active.high)}</span>
          <span className="text-slate-400">L {formatPx(active.low)}</span>
          <span className={isUp ? 'text-emerald-400' : 'text-rose-400'}>
            C {formatPx(active.close)}
          </span>
          <span className="text-slate-400">
            Vol ${Math.round(active.volume).toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>TradingView Lightweight Charts · {source}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-blue-400">{freshness}</span>
        </div>
      </div>

      <div
        ref={containerRef}
        data-testid="ohlcv-candlestick-chart"
        className="w-full overflow-hidden rounded"
        style={{ height }}
      />
    </div>
  );
};
