# Third-Party SDK Audit — PESAKI

**Audit date:** 28 September 2026  
**Scope:** Frontend (`src/`), Backend (`pesaki-server/src/`), Supabase Edge Functions, environment variables, and all package manifests.

---

## Summary

| # | Service | Category | Frontend | Backend | Edge Functions | Data Accessed | DPA Status | Privacy Policy URL |
|---|---|---|---|---|---|---|---|---|
| 1 | Supabase | Database / Auth / Realtime | Yes | Yes | Yes | All user data (profiles, wallets, transactions, auth emails/phones, KYC, game data, messages) | _[To be verified]_ | https://supabase.com/privacy |
| 2 | Safaricom Daraja (M-Pesa) | Payments | Via API | Yes | Yes | Phone numbers, amounts, M-Pesa receipt references, payment status | _[N/A — payment partner]_ | https://www.safaricom.co.ke/privacy-policy |
| 3 | Palpluss | B2C Withdrawals | No | Yes | No | Phone numbers, withdrawal amounts, transaction references | _[N/A — payment partner]_ | https://palpluss.com/privacy |
| 4 | Upstash Redis | Cache / Realtime | No | Yes | No | Game state, market data keys (no direct PII) | _[To be verified]_ | https://upstash.com/privacy |
| 5 | Socket.IO | Realtime (self-hosted) | Yes (client) | Yes (server) | No | User IDs, game positions, session IDs | _[Self-hosted — N/A]_ | N/A (self-hosted) |
| 6 | Google Fonts | Typography | Yes (CDN link) | No | No | None | _[N/A — static assets]_ | https://policies.google.com/privacy |
| 7 | Cloudflare R2 | Image Hosting | Yes (OG image URL) | No | No | None | _[N/A — static asset storage]_ | https://www.cloudflare.com/privacypolicy/ |
| 8 | Lovable | Build Tool / Error Reporting | Yes (build config, error reporting) | No | No | Error reports (route paths, error stacks; may contain incidental PII in stack traces) | _[Platform-provided]_ | https://lovable.app/privacy |
| 9 | Frankfurter API | Market Data (FX) | No | Yes | No | None (public forex data) | _[N/A — public API]_ | N/A (public, no-key API) |
| 10 | afx.kwayisi.org | Market Data (NSE) | No | Yes | No | None (public stock prices) | _[N/A — public data]_ | N/A (public, no-key scraping) |
| 11 | RapidAPI (NSE) | Market Data | No | Yes | No | None (NSE stock ticker) | _[To be verified]_ | https://rapidapi.com/auth/marketplace/privacy |
| 12 | WhatsApp | Support Link | Yes (static link) | No | No | None (static link only) | _[N/A — static link]_ | https://www.whatsapp.com/privacy |

---

## Frontend Dependencies (in `package.json`)

### Core SDK / Runtime Packages

| Package | Version | Purpose | User Data Accessed | DPA Status | Privacy Policy URL |
|---|---|---|---|---|---|
| `@supabase/supabase-js` | ^2.110.0 | Auth, PostgreSQL client, Realtime | All user data (email, phone, profile, transactions, KYC) | _[To be verified]_ | https://supabase.com/privacy |
| `@tanstack/react-query` | ^5.83.0 | Server state management | Cache of API responses (may include user data) | _[Open source — N/A]_ | https://tanstack.com/ |
| `@tanstack/react-router` | ^1.168.25 | File-based routing | Route params, URL query strings | _[Open source — N/A]_ | https://tanstack.com/ |
| `@tanstack/react-start` | ^1.167.50 | SSR framework | Same as above | _[Open source — N/A]_ | https://tanstack.com/ |
| `@tanstack/router-plugin` | ^1.167.28 | Router TS codegen | Build-time only | _[Open source — N/A]_ | https://tanstack.com/ |

### UI / Component Libraries

| Package | Version | Purpose | User Data Accessed | DPA Status | Privacy Policy URL |
|---|---|---|---|---|---|
| `@radix-ui/react-*` (21 packages) | Various | Accessible UI primitives | None (local component state) | _[Open source — N/A]_ | https://radix-ui.com/pages/privacy-policy |
| `react` | ^19.2.0 | UI framework | React component state | _[Open source — N/A]_ | https://opensource.fb.com/legal/privacy-policy/ |
| `react-dom` | ^19.2.0 | React renderer | Same as React | _[Open source — N/A]_ | https://opensource.fb.com/legal/privacy-policy/ |
| `framer-motion` | ^11.0.0 | Animation library | Animation state only | _[Open source — N/A]_ | https://www.framer.com/legal/privacy |
| `lucide-react` | ^0.575.0 | Icon library | None | _[Open source — N/A]_ | https://lucide.dev/ |
| `recharts` | ^2.15.4 | Charting library | Chart data (from app) | _[Open source — N/A]_ | https://recharts.org/en-US/ |
| `lightweight-charts` | 3.8.0 | Financial charting | Chart data (from app) | _[Open source — N/A]_ | https://tradingview.github.io/lightweight-charts/ |
| `socket.io-client` | ^4.8.1 | WebSocket client | Socket session IDs, auth tokens, game positions | _[Open source — N/A]_ | https://socket.io/privacy |
| `sonner` | ^2.0.7 | Toast notifications | Toast content (from app) | _[Open source — N/A]_ | https://sonner-em.vercel.app/ |
| `cmdk` | ^1.1.1 | Command palette | Keyboard input to command palette | _[Open source — N/A]_ | https://github.com/evergreen-ui/cmdk |
| `embla-carousel-react` | ^8.6.0 | Carousel component | None | _[Open source — N/A]_ | https://www.embla-carousel.com/ |
| `react-resizable-panels` | ^4.6.5 | Resizable layouts | Panel sizes (local state) | _[Open source — N/A]_ | https://github.com/bvaughn/react-resizable-panels |
| `react-day-picker` | ^9.14.0 | Date picker | Date selections | _[Open source — N/A]_ | https://react-day-picker.js.org/ |
| `input-otp` | ^1.4.2 | OTP input | OTP digits (transient, local) | _[Open source — N/A]_ | https://input-otp.hackredeye.io/ |
| `vaul` | ^1.1.2 | Drawer component | None | _[Open source — N/A]_ | https://vaul.vercel.app/ |

### Styling / Utilities

| Package | Version | Purpose | User Data Accessed | DPA Status | Privacy Policy URL |
|---|---|---|---|---|---|
| `tailwindcss` | ^4.2.1 | CSS framework | None (build-time) | _[Open source — N/A]_ | https://tailwindcss.com/ |
| `@tailwindcss/vite` | ^4.2.1 | Tailwind Vite plugin | None (build-time) | _[Open source — N/A]_ | https://tailwindcss.com/ |
| `tailwind-merge` | ^3.5.0 | Class deduplication | None | _[Open source — N/A]_ | https://github.com/dcastil/tailwind-merge |
| `clsx` | ^2.1.1 | Classnames utility | None | _[Open source — N/A]_ | https://github.com/lukeed/clsx |
| `class-variance-authority` | ^0.7.1 | Component variants | None | _[Open source — N/A]_ | https://cva-style.com/ |
| `tw-animate-css` | ^1.3.4 | Animation utilities | None | _[Open source — N/A]_ | https://github.com/tailwindlabs/animate-css |
| `date-fns` | ^4.1.0 | Date utilities | None | _[Open source — N/A]_ | https://date-fns.org/ |
| `zod` | ^3.24.2 | Schema validation | Validated form data (not stored/transmitted by Zod itself) | _[Open source — N/A]_ | https://zod.dev/ |
| `react-hook-form` | ^7.71.2 | Form state management | Form field values (local to component) | _[Open source — N/A]_ | https://react-hook-form.com/ |
| `@hookform/resolvers` | ^5.2.2 | Form validation resolvers | Form data (passed through) | _[Open source — N/A]_ | https://react-hook-form.com/ |

### Tooling (Dev Dependencies)

| Package | Version | Purpose | DPA Status | Privacy Policy URL |
|---|---|---|---|---|
| `vite` | ^8.2.2 | Build tool / bundler | _[Open source — N/A]_ | https://vitejs.dev/ |
| `@vitejs/plugin-react` | ^5.2.0 | React Vite plugin | _[Open source — N/A]_ | https://vitejs.dev/ |
| `typescript` | ^5.8.3 | Type checking | _[Open source — N/A]_ | https://www.typescriptlang.org/ |
| `@types/*` | Various | Type definitions | _[Open source — N/A]_ | N/A |
| `eslint` + plugins | ^9.32.0 | Linting | _[Open source — N/A]_ | https://eslint.org/ |
| `prettier` | ^3.7.3 | Code formatting | _[Open source — N/A]_ | https://prettier.io/ |
| `nitro` | 3.0.260603-beta | SSR build target | _[MIT — N/A]_ | https://nitro.unjs.io/ |
| `globals` | ^15.15.0 | Global type definitions | _[Open source — N/A]_ | N/A |
| `@lovable.dev/vite-tanstack-config` | 2.7.6 | Lovable build config | _[Platform-provided]_ | https://lovable.app/privacy |

---

## Backend Dependencies (in `pesaki-server/package.json`)

| Package | Version | Purpose | User Data Accessed | DPA Status | Privacy Policy URL |
|---|---|---|---|---|---|
| `fastify` | ^5.8.4 | Web framework | Request data (tokens, params) | _[Open source — N/A]_ | https://www.fastify.io/ |
| `@fastify/cors` | ^11.2.0 | CORS middleware | None | _[Open source — N/A]_ | https://www.fastify.io/ |
| `@fastify/rate-limit` | ^10.3.0 | Rate limiting | IP addresses (transient) | _[Open source — N/A]_ | https://www.fastify.io/ |
| `@supabase/supabase-js` | ^2.100.1 | Database / Auth (service role) | All user data (full admin access) | _[To be verified]_ | https://supabase.com/privacy |
| `@upstash/redis` | ^1.37.0 | Redis REST client | Game state, market data keys | _[To be verified]_ | https://upstash.com/privacy |
| `axios` | ^1.13.6 | HTTP client | API responses (market data) | _[Open source — N/A]_ | https://axios-http.com/ |
| `dotenv` | ^17.3.1 | Environment config | No user data (build-time only) | _[Open source — N/A]_ | https://github.com/motdotafe/dotenv |
| `pino` | ^10.3.1 | Structured logging | User IDs, phone numbers, error messages | _[Open source — N/A]_ | https://getpino.io/ |
| `pino-pretty` | ^13.1.3 | Log formatter | Same as pino | _[Open source — N/A]_ | https://getpino.io/ |
| `socket.io` | ^4.8.3 | WebSocket server | User IDs, game state, session IDs | _[Open source — N/A]_ | https://socket.io/privacy |
| `node-cron` | ^4.2.1 | Task scheduling | None | _[Open source — N/A]_ | https://github.com/node-cron/node-cron |
| `zod` | ^4.3.6 | Schema validation | Request body data | _[Open source — N/A]_ | https://zod.dev/ |
| `tsx` | ^4.21.0 | TypeScript runtime (dev) | None | _[Open source — N/A]_ | https://github.com/ehmicky/tsx |
| `typescript` | ^6.0.2 | TypeScript compiler | None | _[Open source — N/A]_ | https://www.typescriptlang.org/ |

### Orphaned / Unused Dependencies (Backend)

| Package | Status |
|---|---|
| `ioredis` | Listed in `package.json` but NOT imported in any source file. `@upstash/redis` is used instead. |

---

## External APIs and Services

### Payment Services

| Service | Integration Method | Endpoints | Data Accessed | DPA Status | Privacy Policy URL |
|---|---|---|---|---|---|
| **Safaricom Daraja** | Native `fetch` (backend + edge function) | `/oauth/v1/generate`, `/mpesa/stkpush/v1/processrequest` | Phone number (PartyA), amount, M-Pesa receipt, CheckoutRequestID | _[N/A — payment partner]_ | https://www.safaricom.co.ke/privacy-policy |
| **Palpluss B2C** | Native `fetch` (backend) + webhook callback | `/v1/bulk-payout`, `/api/webhooks/palpluss` | Phone, amount, transaction reference, callback status | _[N/A — payment partner]_ | https://palpluss.com/privacy |

### Market Data APIs

| Service | Integration Method | Data Accessed | DPA Status | Privacy Policy URL |
|---|---|---|---|---|
| **Frankfurter** | `axios` GET requests | Public forex rates (EUR base) | _[N/A — public API, no auth]_ | N/A |
| **afx.kwayisi.org** | HTML scraping via `axios` | NSE stock prices (public) | _[N/A — public data]_ | N/A |
| **RapidAPI NSE** | Native `fetch` with API key header | NSE stock ticker data | _[To be verified]_ | https://rapidapi.com/auth/marketplace/privacy |

### Cache / Realtime Infrastructure

| Service | Integration Method | Data Accessed | DPA Status | Privacy Policy URL |
|---|---|---|---|---|
| **Upstash Redis** | `@upstash/redis` REST client | Cache keys (`market:*`, `spin:prizes`), game state | _[To be verified]_ | https://upstash.com/privacy |
| **Socket.IO** | `socket.io` server on Render | User IDs, game positions, session IDs | _[Self-hosted — N/A]_ | N/A |

### Communication

| Service | Integration Method | Data Accessed | DPA Status | Privacy Policy URL |
|---|---|---|---|---|
| **WhatsApp** | Static link (`https://wa.me/...`) | None (static link) | _[N/A]_ | https://www.whatsapp.com/privacy |
| **Email Templates** | Custom module (`email-templates.ts`) | Template variables only; no transport configured | _[N/A — templates only]_ | N/A |

### Hosting / CDN

| Service | Purpose | Data Accessed | DPA Status | Privacy Policy URL |
|---|---|---|---|---|
| **Vercel** | Frontend SSR hosting (Nitro preset) | Build logs, request data | _[To be verified]_ | https://vercel.com/legal/privacy |
| **Render** | Backend API hosting | All backend data | _[To be verified]_ | https://render.com/privacy |
| **Cloudflare R2** | OG image hosting | None (static image) | _[To be verified]_ | https://www.cloudflare.com/privacypolicy/ |
| **Google Fonts** | Typography (Space Grotesk, DM Sans) | None (static CSS/fonts) | _[Google standard]_ | https://policies.google.com/privacy |

### Edge Functions (Deno Runtime)

| Function | Packages Loaded | External Services | Secrets Used |
|---|---|---|---|
| `mpesa-stk` | `@supabase/supabase-js@2.38.4` (via esm.sh), `deno_std` | Safaricom Daraja, Supabase | `DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET`, `DARAJA_PASSKEY`, `DARAJA_SHORTCODE`, `DARAJA_CALLBACK_URL`, `DARAJA_ENV`, `SUPABASE_URL`, `SERVICE_ROLE_KEY` |
| `transfer` | `@supabase/supabase-js@2.38.4` (via esm.sh), `deno_std` | Supabase | `SUPABASE_URL`, `SERVICE_ROLE_KEY` |

---

## Supabase Edge Function Secrets Summary

| Secret | Used In | Purpose |
|---|---|---|
| `SUPABASE_URL` | Both edge functions | Supabase API endpoint |
| `SERVICE_ROLE_KEY` | Both edge functions | Admin bypass (bypasses RLS) |
| `DARAJA_CONSUMER_KEY` | `mpesa-stk` | Safaricom OAuth client ID |
| `DARAJA_CONSUMER_SECRET` | `mpesa-stk` | Safaricom OAuth client secret |
| `DARAJA_PASSKEY` | `mpesa-stk` | M-Pesa STK push password |
| `DARAJA_SHORTCODE` | `mpesa-stk` | Business paybill/shortcode |
| `DARAJA_CALLBACK_URL` | `mpesa-stk` | STK push callback endpoint |
| `DARAJA_ENV` | `mpesa-stk` | `sandbox` or `production` |

---

## Environment Variables Summary

### Frontend (`import.meta.env`, `VITE_` prefixed)

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project API URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous public key |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (new format, fallback) |
| `VITE_PESAKI_API_URL` | Backend Fastify API base URL |
| `VITE_WEBSOCKET_URL` | WebSocket/Socket.IO server URL |

### Backend (`process.env`)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin access, bypasses RLS) |
| `UPSTASH_REDIS_URL` | Upstash Redis REST API URL |
| `UPSTASH_REDIS_TOKEN` | Upstash Redis auth token |
| `PORT` | Server listen port (default 4000) |
| `CORS_ORIGIN` | CORS allowlist origin |
| `MPESA_CONSUMER_KEY` | Safaricom Daraja OAuth key |
| `MPESA_CONSUMER_SECRET` | Safaricom Daraja OAuth secret |
| `MPESA_SHORTCODE` | M-Pesa business shortcode |
| `MPESA_TILL_NUMBER` | M-Pesa till number |
| `MPESA_PASSKEY` | M-Pesa STK push passkey |
| `MPESA_ENV` | `sandbox` or `production` |
| `MPESA_CALLBACK_URL` | M-Pesa callback URL for STK results |
| `PALPLUSS_API_KEY` | Palpluss B2C payout API key |
| `PALPLUSS_API_URL` | Palpluss B2C API base URL |
| `RAPIDAPI_KEY` | RapidAPI NSE stock data key **(not in `.env.example`)** |
| `RAPIDAPI_HOST` | RapidAPI NSE host **(not in `.env.example`)** |
| `APP_URL` | Application URL for email links (default: `https://pesaki.co.ke`) |
| `DATABASE_URL` | PostgreSQL connection string (migrations only) |

---

## Key Observations & Risk Assessment

### 1. Supabase is the central data platform
Supabase handles authentication (email/phone), PostgreSQL database, real-time subscriptions, Edge Functions, and RPC stored procedures. Service-role keys are used in both the backend and edge functions to bypass Row Level Security (RLS).

### 2. Dual M-Pesa integration paths
M-Pesa (Safaricom Daraja) is integrated both via the backend Fastify server (`routes/mpesa.ts`) and via a Supabase Edge Function (`mpesa-stk`). Both paths use native `fetch` with OAuth credentials.

### 3. Palpluss B2C for withdrawals
Palpluss is the sole withdrawal provider, integrated in both directions: backend initiates payouts and receives webhook callbacks (`/api/webhooks/palpluss`).

### 4. Upstash Redis (REST, not standard Redis)
Upstash is used via `@upstash/redis` (REST-based client). The `ioredis` package is in `package.json` but **not imported** — orphaned dependency.

### 5. No email transport currently configured
The `email-templates.ts` module exists but is not wired to any email provider (SendGrid, SMTP, etc.). This should be addressed when transactional email is needed.

### 6. No analytics or monitoring SDKs
No Google Analytics, Sentry, LogRocket, or similar services are integrated. Error reporting is handled by a custom Lovable integration.

### 7. Orphaned dependencies
- **Frontend:** `@hookform/resolvers` and `date-fns` are listed in `package.json` but not imported in any source file.
- **Backend:** `ioredis` is listed but not imported; `@upstash/redis` is used instead.

### 8. Undocumented environment variables
`RAPIDAPI_KEY` and `RAPIDAPI_HOST` are referenced in `src/api/routes/nse.ts` but are **not documented** in `.env.example`. This could cause runtime failures if not set.

### 9. Google Fonts CDN dependency
The app loads `Space Grotesk` and `DM Sans` fonts from `fonts.googleapis.com` and `fonts.gstatic.com`. A `preconnect` hint is used but no `crossorigin` attribute is set.

### 10. Cloudflare R2 for OG images
Open Graph and Twitter Card images are served from a Cloudflare R2 URL (`pub-bb2e103a...r2.dev`).

---

## Services NOT Found (Confirmed Absent)

| Service | Status |
|---|---|
| Stripe | Not used |
| PayPal | Not used |
| Flutterwave | Not used |
| Twilio | Not used |
| SendGrid | Not used (email templates file is a placeholder) |
| Sentry | Not used |
| LogRocket | Not used |
| Google Analytics / GA4 | Not used |
| Google Tag Manager | Not used |
| Mixpanel | Not used |
| Amplitude | Not used |
| Hotjar / FullStory | Not used |
| Intercom / Crisp / Zendesk | Not used |
| AWS (S3, Lambda, etc.) | Not used (Cloudflare R2 used instead) |
