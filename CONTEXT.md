# PESAKI Platform — AI Agent Context & Developer Guide

> **Notice for AI Agents**: Read this file first before inspecting or modifying the codebase. This document contains the full architecture, routing patterns, backend services, database schemas, and critical constraints for the **PESAKI** project.

---

## 1. Project Overview

**PESAKI** (`pesaki.co.ke`) is an all-in-one Kenyan financial, trading, gaming, and micro-economy platform tailored for the local market (KES currency, M-Pesa integration, Chama/cooperative banking, KAZI freelance gigs, and business funding).

### Primary Tech Stack
- **Frontend / Fullstack Framework**: [TanStack Start](https://tanstack.com/router/latest/docs/framework/react/start/overview) (`@tanstack/react-start` v1.167+, `@tanstack/react-router`, `@tanstack/react-query`) with **React 19**
- **Build Tool & Bundler**: Vite 8 with `@lovable.dev/vite-tanstack-config` and Nitro server
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`), custom theme `#0a3b2e` (forest green / gold accents), fonts: *Space Grotesk* and *DM Sans*
- **Primary Hosting / Deployment**: Vercel (connected to GitHub `main` branch) + Lovable sync
- **Database & Auth**: Supabase (PostgreSQL, Row Level Security, RPC stored procedures, Edge Functions)
- **Real-Time Backend Service**: `pesaki-server/` (Node.js + Fastify, Socket.io for Aviator multiplier stream, Upstash Redis caching)

---

## 2. Repository Layout

```
pesakicoke/
├── CONTEXT.md                    # THIS FILE: Comprehensive project guide for AI agents
├── AGENTS.md                     # Agent rules & Lovable connection instructions
├── package.json                  # Frontend / TanStack Start root dependencies
├── vite.config.ts                # Lovable TanStack Start Vite configuration
├── scripts/
│   └── run-migrations.mjs        # Database schema runner
├── supabase/
│   ├── config.toml               # Supabase CLI configuration & allowed origins
│   ├── migrations/               # SQL migrations (wallets, transactions, games)
│   └── functions/
│       ├── mpesa-stk/            # Safaricom Daraja STK Push edge function
│       └── transfer/             # P2P wallet transfer function
├── pesaki-server/                # Standalone Node.js Fastify + Socket.io game server
│   ├── src/                      # Game engines (Aviator, Spin, Predictions), Redis, DB RPCs
│   └── README.md                 # Backend server documentation
└── src/
    ├── components/
    │   ├── AppShell.tsx          # Mobile-first shell, header, bottom navigation bar
    │   ├── ui-bits.tsx           # Standardized design tokens (Card, Stat, Badge, SectionTitle)
    │   └── ui/                   # Radix UI + shadcn primitive components
    ├── context/                  # Client-side React context providers
    ├── hooks/                    # Reusable React hooks
    ├── integrations/
    │   └── supabase/             # Supabase client singleton, types, auth helpers
    ├── lib/
    │   ├── balance.ts            # Balance state management & updates
    │   ├── error-page.ts         # Catastrophic SSR error page renderer
    │   └── lovable-error-reporting.ts # Error tracking boundary for Lovable
    ├── routes/                   # File-based TanStack Start routes (DO NOT use Next.js pages)
    │   ├── __root.tsx            # Root app shell, HTML document, Providers, Scripts
    │   ├── index.tsx             # Main dashboard (/)
    │   ├── auth.tsx              # Login / Signup / OTP verification
    │   ├── wallet.tsx            # Wallet dashboard, M-Pesa deposit, withdrawal, transfers
    │   ├── trading.tsx           # Trading hub layout & subroutes
    │   ├── trading.aviator.tsx   # Aviator crash game with live multipliers
    │   ├── trading.spin.tsx      # Lucky spin wheel
    │   ├── trading.up-down.tsx   # Forex / NSE market direction predictions
    │   ├── trading.fx.tsx        # Currency exchange rates & trading
    │   ├── trading.invest.tsx    # Investment plans & yield tracking
    │   ├── kazi.tsx              # KAZI Link micro-jobs & freelance directory
    │   ├── business.tsx          # Business funding proposals & investment
    │   ├── banking.tsx           # Banking hub, Chama savings groups, micro-loans
    │   ├── profile.tsx           # User profile & security settings
    │   └── admin.*.tsx           # Administration portal & oversight
    ├── router.tsx                # TanStack Router instance creation with QueryClient
    ├── server.ts                 # Nitro / SSR server entry with error boundary
    ├── start.ts                  # TanStack Start instance with Supabase auth middleware
    └── styles.css                # Global stylesheet & Tailwind directives
```

---

## 3. Critical Architecture & Development Rules

### 1. TanStack Start Root Route (`src/routes/__root.tsx`)
> [!IMPORTANT]
> TanStack Start uses file-based routing but **requires** specific root initialization.
> - The root route **must** use `createRootRouteWithContext<{ queryClient: QueryClient }>()`
> - The shell component **must** render `<html lang="en">`, `<head><HeadContent /></head>`, and `<body>{children}<Scripts /></body>`.
> - The component **must** wrap children in `<QueryClientProvider client={queryClient}>` and include `<Outlet />`.
> - **NEVER** replace `__root.tsx` with a standard `createFileRoute` without the shell/scripts, as this breaks SSR and causes Vercel deployments to fail.

### 2. Git & Lovable Integration Constraints
- **Do not rewrite published Git history** (`git push --force`, `git rebase`, `git commit --amend` on pushed commits). This corrupts Lovable's sync history.
- Always ensure `main` builds cleanly locally before committing. If Vercel encounters a build error on `main`, it will freeze on the last successful deployment, serving an outdated version to users.

### 3. File-Based Routing Rules
- Route files are located in `src/routes/`.
- `index.tsx` maps to `/`.
- Subroutes follow dot-notation or folders: `trading.aviator.tsx` maps to `/trading/aviator`.
- `routeTree.gen.ts` is auto-generated by the TanStack Router plugin during build/dev. **Do not manually edit `routeTree.gen.ts`**.

---

## 4. Key Functional Domains

### A. Wallet & Payment Processing
- **Currency**: Kenyan Shilling (`KES`), formatted via `Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' })`.
- **M-Pesa STK Push**: Initiated via Supabase Edge Function `mpesa-stk`.
- **Ledger & Atomic Balance Mutations**: Never directly mutate user balances with raw SQL updates on the client. Always invoke Supabase RPC functions (`debit_wallet`, `credit_wallet`) to maintain transactional integrity and an immutable `wallet_ledger`.

### B. Trading & Real-Money Games
- **Aviator**: Real-time crash game. Multiplier curves are streamed over WebSockets (`/aviator` namespace on `pesaki-server`). Outcomes use SHA-256 provably fair hash chains.
- **Spin Wheel**: Weighted RNG game with prize pools managed in the database.
- **Up/Down Market Predictions**: Short-interval (60s) price predictions on Forex pairs and Nairobi Securities Exchange (NSE) stocks.

### C. Community & Freelance Economy
- **KAZI Link**: Peer-to-peer micro-task and gig marketplace.
- **Business Hub**: Micro-enterprise listings seeking growth capital from community investors.
- **Banking & Chamas**: Digital rotating savings groups and micro-credit tools.

---

## 5. Environment Variables Reference

| Variable Name | Purpose | Example / Scope |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase Project API URL | Client (`src/`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous public API key | Client (`src/`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase elevated admin key | Backend (`pesaki-server/`, Edge functions) |
| `VITE_API_URL` | Fastify backend API URL | Client (`src/utils/api.ts`) |
| `UPSTASH_REDIS_URL` | Redis instance URL | Backend (`pesaki-server`) |
| `UPSTASH_REDIS_TOKEN` | Redis authorization token | Backend (`pesaki-server`) |

---

## 6. Testing & Build Instructions

```bash
# Frontend development server
npm run dev

# Frontend production build (validates TanStack Start + Nitro SSR)
npm run build

# Database migrations
npm run db:migrate

# Backend game server (Fastify)
cd pesaki-server
npm install
npm run dev
```
