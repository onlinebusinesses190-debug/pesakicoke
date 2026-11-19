# PESAKI Platform Ã¢â‚¬â€ AI Agent Context & Developer Guide

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
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ CONTEXT.md                    # THIS FILE: Comprehensive project guide for AI agents
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ AGENTS.md                     # Agent rules & Lovable connection instructions
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ package.json                  # Frontend / TanStack Start root dependencies
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ vite.config.ts                # Lovable TanStack Start Vite configuration
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ scripts/
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ run-migrations.mjs        # Database schema runner
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ supabase/
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ config.toml               # Supabase CLI configuration & allowed origins
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ migrations/               # SQL migrations (wallets, transactions, games)
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ functions/
Ã¢â€â€š       Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ mpesa-stk/            # Safaricom Daraja STK Push edge function
Ã¢â€â€š       Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ transfer/             # P2P wallet transfer function
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ pesaki-server/                # Standalone Node.js Fastify + Socket.io game server
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ src/                      # Game engines (Aviator, Spin, Predictions), Redis, DB RPCs
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ README.md                 # Backend server documentation
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ src/
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ components/
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ AppShell.tsx          # Mobile-first shell, header, bottom navigation bar
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ ui-bits.tsx           # Standardized design tokens (Card, Stat, Badge, SectionTitle)
    Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ ui/                   # Radix UI + shadcn primitive components
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ context/                  # Client-side React context providers
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ hooks/                    # Reusable React hooks
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ integrations/
    Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ supabase/             # Supabase client singleton, types, auth helpers
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ lib/
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ balance.ts            # Balance state management & updates
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ error-page.ts         # Catastrophic SSR error page renderer
    Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ lovable-error-reporting.ts # Error tracking boundary for Lovable
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ routes/                   # File-based TanStack Start routes (DO NOT use Next.js pages)
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ __root.tsx            # Root app shell, HTML document, Providers, Scripts
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ index.tsx             # Main dashboard (/)
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ auth.tsx              # Login / Signup / OTP verification
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ wallet.tsx            # Wallet dashboard, M-Pesa deposit, withdrawal, transfers
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ trading.tsx           # Trading hub layout & subroutes
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ trading.aviator.tsx   # Aviator crash game with live multipliers
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ trading.spin.tsx      # Lucky spin wheel
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ trading.up-down.tsx   # Forex / NSE market direction predictions
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ trading.fx.tsx        # Currency exchange rates & trading
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ trading.invest.tsx    # Investment plans & yield tracking
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ kazi.tsx              # KAZI Link micro-jobs & freelance directory
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ business.tsx          # Business funding proposals & investment
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ banking.tsx           # Banking hub, Chama savings groups, micro-loans
    Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ profile.tsx           # User profile & security settings
    Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ admin.*.tsx           # Administration portal & oversight
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ router.tsx                # TanStack Router instance creation with QueryClient
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ server.ts                 # Nitro / SSR server entry with error boundary
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ start.ts                  # TanStack Start instance with Supabase auth middleware
    Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ styles.css                # Global stylesheet & Tailwind directives
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
