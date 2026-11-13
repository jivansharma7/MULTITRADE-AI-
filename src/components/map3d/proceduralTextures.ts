import * as THREE from 'three';
import type { CoinMonumentNode } from '../../shared/coinMap3dLayout';

function formatCompactUsd(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '$0';
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function formatCompactPrice(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '$0.00';
  if (val >= 1) return `$${val.toFixed(2)}`;
  if (val >= 0.01) return `$${val.toFixed(4)}`;
  return `$${val.toExponential(2)}`;
}

export function createArenaFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;

  // Deep anodized obsidian base radial gradient
  const baseGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, size * 0.5);
  baseGrad.addColorStop(0, '#101b33');
  baseGrad.addColorStop(0.42, '#0a1122');
  baseGrad.addColorStop(0.85, '#070b15');
  baseGrad.addColorStop(1, '#060913');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  // Crisp subtle cartesian coordinate grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.075)';
  ctx.lineWidth = 1;
  const step = size / 32;
  for (let i = 0; i <= 32; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Concentric tier rings matching Crown / Mid / Outer orbital zones
  const rings = [
    { r: size * 0.08, color: 'rgba(56, 189, 248, 0.35)', width: 2 },
    { r: size * 0.16, color: 'rgba(16, 185, 129, 0.25)', width: 1.5 },
    { r: size * 0.29, color: 'rgba(56, 189, 248, 0.22)', width: 1.5 },
    { r: size * 0.43, color: 'rgba(99, 102, 241, 0.22)', width: 2 },
  ];

  for (const ring of rings) {
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = ring.width;
    ctx.beginPath();
    ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Radial compass spokes (every 30 deg)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  for (let deg = 0; deg < 360; deg += 30) {
    const rad = (deg * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * 45, cy + Math.sin(rad) * 45);
    ctx.lineTo(cx + Math.cos(rad) * (size * 0.46), cy + Math.sin(rad) * (size * 0.46));
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

export function createFloorRoughnessTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size * 0.5);
  grad.addColorStop(0, '#5a5a5a'); // shinier near core
  grad.addColorStop(0.5, '#8c8c8c');
  grad.addColorStop(1, '#d8d8d8'); // matte near horizon
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(2, 4, 10, 0.78)');
  grad.addColorStop(0.52, 'rgba(2, 4, 10, 0.34)');
  grad.addColorStop(1, 'rgba(2, 4, 10, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createTokenPlaqueTexture(
  node: CoinMonumentNode,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const width = 512;
  const height = 224;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Dark anodized glass/slate plate
  ctx.fillStyle = '#090f1e';
  ctx.fillRect(0, 0, width, height);

  // Subtle accent header stripe
  ctx.fillStyle = node.accentHex;
  ctx.fillRect(0, 0, width, 12);

  // Border frame
  ctx.strokeStyle = node.rimHex;
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, width - 8, height - 8);

  // Rank badge
  ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
  ctx.fillRect(22, 28, 86, 46);
  ctx.fillStyle = '#93c5fd';
  ctx.font = '700 28px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(`#${node.rank}`, 34, 52);

  // Ticker symbol
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 50px Inter, system-ui, -apple-system, sans-serif';
  const sym = node.symbol.slice(0, 9);
  ctx.fillText(sym, 122, 54);

  // 1h Momentum badge
  const isUp = node.momentum1h >= 0;
  const pctStr = `${isUp ? '+' : ''}${node.momentum1h.toFixed(1)}%`;
  ctx.fillStyle = isUp ? '#34d399' : '#fb7185';
  ctx.font = '700 34px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(pctStr, width - 24, 52);

  // Divider line
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(22, 102);
  ctx.lineTo(width - 22, 102);
  ctx.stroke();

  // Bottom telemetry row: Price & Metric
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 22px Inter, system-ui, sans-serif';
  ctx.fillText('PRICE', 22, 134);
  ctx.fillText('METRIC', 260, 134);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '700 30px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(formatCompactPrice(node.token.priceUsd), 22, 178);
  ctx.fillStyle = node.rimHex;
  ctx.fillText(formatCompactUsd(node.metricValue), 260, 178);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}
