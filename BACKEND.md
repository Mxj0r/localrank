# LocalRank — Backend Architecture

## Overview

Full-stack SaaS with Supabase as BaaS (auth, database, edge functions) and Stripe for payments. The tool remains a single HTML file — backend only handles what requires a server: Google Maps API proxy, PDF generation, Stripe checkout, and webhook fulfillment.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Static HTML (unchanged) + Stripe.js |
| Auth | Supabase Auth (magic link + Google OAuth) |
| Database | Supabase Postgres |
| API / Edge | Supabase Edge Functions (Deno) |
| Payments | Stripe Checkout + Webhooks |
| Email | Resend API (for PDF delivery) |
| PDF | @react-pdf/renderer in Edge Function |
| Hosting | Vercel (frontend) + Supabase (backend) |

---

## Database Schema

```sql
-- Users (Supabase Auth handles this)
-- profiles extends auth.users

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  plan text not null default 'free', -- 'free' | 'pro'
  scans_used_this_month int not null default 0,
  scans_limit int not null default 3,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Individual scans stored for logged-in users
create table scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  place_url text not null,
  place_name text,
  score int,
  grade text,
  scan_data jsonb,       -- full scoring breakdown
  pdf_generated boolean default false,
  pdf_url text,
  created_at timestamptz default now()
);

-- Stripe checkout sessions (for webhook reconciliation)
create table checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  stripe_session_id text unique not null,
  stripe_subscription_id text,
  plan text not null,       -- 'pro_monthly' | 'pro_yearly' | 'report_payg'
  status text not null,     -- 'pending' | 'completed' | 'failed' | 'cancelled'
  created_at timestamptz default now()
);
```

---

## Plans

| Plan | Price | Features |
|---|---|---|
| **Free** | £0 | 3 scans/month, gauge + breakdown visible on screen, no PDF |
| **Pro Monthly** | £9/month | Unlimited scans, PDF reports, scan history, email support |
| **Pro Yearly** | £79/year | Same as monthly, billed annually (~30% saving) |
| **Pay-as-you-go** | £3/report | Single PDF report, no subscription |

---

## How It Works — User Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     FREE USER FLOW                          │
│                                                             │
│  Paste URL → Analyze (demo/mock data, no key needed)       │
│       ↓                                                    │
│  See gauge + breakdown (score visible, no PDF)             │
│       ↓                                                    │
│  CTA: "Get PDF report — £3" or "Upgrade Pro"              │
│       ↓                                                    │
│  User enters email → Stripe Checkout (£3 one-time)         │
│       ↓                                                    │
│  Stripe Webhook → Edge Function generates PDF               │
│       ↓                                                    │
│  PDF sent to email via Resend                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     PRO USER FLOW                           │
│                                                             │
│  Sign up (magic link or Google)                             │
│       ↓                                                    │
│  Subscribe (£9/mo or £79/yr) via Stripe Checkout          │
│       ↓                                                    │
│  Stripe Webhook → activate Pro plan in profiles table      │
│       ↓                                                    │
│  Unlimited scans + PDF downloads + scan history             │
└─────────────────────────────────────────────────────────────┘
```

---

## API — Supabase Edge Functions

### 1. `create-checkout` — Start Stripe Checkout
**POST** `/functions/v1/create-checkout`

Request:
```json
{ "plan": "report_payg", "email": "user@example.com", "scanData": {...} }
```
Response:
```json
{ "url": "https://checkout.stripe.com/c/pay/..." }
```
Creates a Stripe Checkout session, stores `checkout_sessions` record, returns the Stripe-hosted checkout URL.

---

### 2. `create-portal` — Stripe Customer Portal
**POST** `/functions/v1/create-portal`

For existing Pro users to manage/cancel subscription. Takes `user_id` from auth header, looks up `stripe_customer_id`, creates a Stripe billing portal session.

---

### 3. `generate-report` — PDF Generation
**POST** `/functions/v1/generate-report`

Triggered by Stripe webhook (checkout completed) OR called directly by Pro users.
- Accepts: `scanData` (full scoring breakdown), `email`, `placeName`
- Renders PDF using `@react-pdf/renderer` (Deno-compatible)
- Stores PDF in Supabase Storage
- Sends via Resend
- Updates `scans.pdf_generated = true`

---

### 4. `proxy-scan` — Google Maps API Proxy
**POST** `/functions/v1/proxy-scan`

Frontend calls this instead of calling Google Maps directly (hides API key).
Request:
```json
{ "placeUrl": "https://maps.google.com/maps/place/..." }
```
Edge Function:
1. Parses place ID from URL
2. Calls Google Maps Places API (key in env var, not exposed)
3. Runs scoring engine (same logic as frontend)
4. Returns scored data
5. If user is logged in, saves to `scans` table

---

## Stripe Webhook Handler

**POST** `/functions/v1/stripe-webhook`

Handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

```
checkout.session.completed + report_payg:
  → generate-report → send email → create scans record

checkout.session.completed + pro_monthly/pro_yearly:
  → update profiles.plan = 'pro'
  → update profiles.stripe_subscription_id

customer.subscription.deleted:
  → update profiles.plan = 'free'
  → update profiles.stripe_subscription_id = null
```

---

## Environment Variables (Edge Functions)

```
GOOGLE_MAPS_API_KEY=...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
SUPABASE_SERVICE_ROLE_KEY=...  (for admin DB access in webhooks)
```

---

## Security Rules

| Resource | Rule |
|---|---|
| `profiles` | Users can only read/write their own row |
| `scans` | Users can only read/write their own scans |
| `checkout_sessions` | No client-side access (edge functions only) |
| Google Maps API key | Never exposed to frontend, only in Edge Functions |
| Stripe keys | Secret key only in Edge Functions env |

---

## What Changes on the Frontend (index.html)

1. Add "Sign In" button (Supabase Auth UI)
2. Show/hide PDF button based on: user signed in + (has active plan OR £3 checkout)
3. On analyze: call `POST /functions/v1/proxy-scan` (with user JWT) instead of directly to Google Maps
4. "Get PDF" → calls `create-checkout` → redirect to Stripe Checkout
5. On return from Stripe (`?success=true` param): show "Report on its way!" confirmation
6. Scan count shown in header for logged-in free users

---

## File Structure

```
localrank/
├── index.html          ← Updated frontend
├── supabase/
│   └── migrations/
│       └── 001_initial.sql   ← Schema + RLS policies
├── supabase/functions/
│   ├── create-checkout/
│   │   └── index.ts
│   ├── create-portal/
│   │   └── index.ts
│   ├── generate-report/
│   │   └── index.ts
│   ├── proxy-scan/
│   │   └── index.ts
│   └── stripe-webhook/
│       └── index.ts
└── .env.example
```
