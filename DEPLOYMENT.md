# MEMEINTEL AI — Deployment & API Configuration Guide

## Architecture Overview
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, custom TradingView-style SVG Candlestick & Equity Curve charts.
- **Backend**: Node.js + Express (`server.ts`) serving both `/api/*` endpoints and Vite (dev) / `dist/` (production) on port `3000`.
- **Database & Auth**: Firebase Authentication (Google Sign-In, Email/Password, Password Recovery) & Cloud Firestore (`firestore.rules` + `firebase-blueprint.json`).
- **AI Engine**: Server-side `@google/genai` (`gemini-4-hydrogen`) Chief AI Orchestrator synthesizing 17 deterministic analytical workers across 12 departments (130 registered specialist roles).

## Environment Variables
Configure the following in your secrets / environment (`.env.example`):

1. **Required for AI Narrative Synthesis**:
   - `GEMINI_API_KEY`: Server-side Gemini API key (automatically injected in AI Studio Secrets). Without it, deterministic multi-agent consensus runs without LLM narrative synthesis.
2. **Optional Solana RPC & Indexing Upgrades** (defaults to public `https://api.mainnet-beta.solana.com`):
   - `HELIUS_API_KEY`: Enables higher-rate Helius Mainnet RPC.
   - `SOLANA_RPC_URL`: Custom Solana JSON-RPC endpoint URL.
   - `BIRDEYE_API_KEY`: Optional extended market analytics key.
3. **Optional Social Intelligence Providers** (Reddit public JSON works without keys):
   - `TWITTER_BEARER_TOKEN`: X/Twitter API v2 bearer token.
   - `TELEGRAM_BOT_TOKEN`: Telegram Bot token for public channel feeds.
   - `DISCORD_BOT_TOKEN`: Discord Bot token for public community monitoring.
4. **Optional Billing Provider**:
   - `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`: Required to enable live Stripe Checkout for PRO/PREMIUM/INSTITUTIONAL tiers.

## Build & Production Run
```bash
npm install
npm run lint
npm run build
NODE_ENV=production npm start
```

## Testing
```bash
npx --yes tsx --test src/shared/scoringAndRisk.test.ts src/shared/backtestEngine.test.ts
```
