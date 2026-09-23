# Pesaki Server Backend

The dedicated Node.js + Fastify backend for the **Pesaki** Kenyan real-money gaming platform.

## Architecture & Features

- **Fastify (REST API)**: High-performance API handling wallets, spins, and predictions.
- **Socket.io (Real-time)**: Handles the high-frequency multiplier ticks for the Aviator game.
- **Provably Fair (Aviator)**: Uses SHA-256 hash chains to ensure round outcomes are verifiable and tamper-proof.
- **Wallet Service (Atomic)**: Leverages Supabase RPC (database functions) to ensure balance mutations are atomic and ledger-based.
- **Cron Jobs**: Automated market data fetching (Forex/NSE) and prediction settlements using `node-cron`.
- **Caching**: Upstash Redis is used for high-speed access to market prices and active game states.

## Getting Started

### 1. Prerequisites
- Node.js 20+
- Supabase Project (with `wallets`, `wallet_ledger`, `spin_prizes`, `spin_results`, `predictions` tables)
- Upstash Redis account

### 2. Environment Setup
Create a `.env` file in the root based on `.env.example`:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
UPSTASH_REDIS_URL=...
UPSTASH_REDIS_TOKEN=...
PORT=4000
CORS_ORIGIN=http://localhost:3000
```

### 3. Database Functions (Supabase)
Ensure the following RPCs are created in your Supabase SQL Editor:
- `debit_wallet(p_user_id, p_amount, p_mode, p_description)`
- `credit_wallet(p_user_id, p_amount, p_mode, p_description)`

These functions must:
1. Check the user's current balance.
2. Update the balance.
3. Insert a record into the `wallet_ledger` table.
4. Return the new balance.

### 4. Running the Server

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Start production server
npm run start
```

## Game Engines

### Aviator
The Aviator engine manages round lifecycles: `WAITING` (5s) -> `FLYING` -> `CRASHED`.
Multiplier ticks are emitted every 100ms via the `/aviator` socket namespace.

### Spin Wheel
A weighted-RNG prize picker where prize configurations are fetched from the database. Results are credited instantly to the user's wallet.

### Market Predictions
Uses real-time Forex data (Frankfurter API) and NSE stock data. Users predict the direction (UP/DOWN) over a time window. Settlements occur every 60 seconds.

## Monitoring
The `/health` endpoint is available for uptime monitoring and to keep the server alive on free-tier hosting providers (like Render).

---
© 2026 Pesaki Platform Team. All rights reserved.
