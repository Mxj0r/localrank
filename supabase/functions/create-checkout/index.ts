// create-checkout: Creates a Stripe Checkout session for report or subscription
// POST /functions/v1/create-checkout
// Body: { plan: 'report_payg' | 'pro_monthly' | 'pro_yearly', scanData?: {...}, email?: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Plan Config ───
const PLANS = {
  report_payg: {
    mode: "payment" as const,
    unitAmount: 300,  // £3
    currency: "gbp",
    productName: "LocalRank PDF Report",
    description: "One-time PDF report with full breakdown, competitor comparison, and action checklist.",
    priceId: "", // Set via STRIPE_PRICE_ID_REPORT env var, or inline if no Price ID
  },
  pro_monthly: {
    mode: "subscription" as const,
    unitAmount: 900,  // £9
    currency: "gbp",
    productName: "LocalRank Pro Monthly",
    description: "Unlimited scans, PDF reports, scan history, and email support.",
    priceId: Deno.env.get("STRIPE_PRICE_ID_PRO_MONTHLY") || "",
  },
  pro_yearly: {
    mode: "subscription" as const,
    unitAmount: 7900, // £79
    currency: "gbp",
    productName: "LocalRank Pro Yearly",
    description: "Everything in Pro Monthly, billed annually. Save ~30%.",
    priceId: Deno.env.get("STRIPE_PRICE_ID_PRO_YEARLY") || "",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const webhookUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    let userId: string | null = null;
    let userEmail: string | null = null;

    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) { userId = user.id; userEmail = user.email; }
    }

    const { plan, scanData, customerEmail } = await req.json();
    const email = customerEmail || userEmail;
    const planConfig = PLANS[plan as keyof typeof PLANS];

    if (!planConfig) throw new Error(`Unknown plan: ${plan}`);

    // Build Stripe Checkout params
    const baseUrl = "https://localrank-phi.vercel.app";
    const params: Record<string, unknown> = {
      mode: planConfig.mode,
      success_url: `${baseUrl}?success=true&plan=${plan}`,
      cancel_url: `${baseUrl}?cancelled=true`,
      metadata: { plan, userId: userId || "" },
      locale: "auto",
    };

    if (email) params.customer_email = email;

    if (plan === "report_payg") {
      // One-time payment: use price_data inline
      params.payment_intent_data = {
        metadata: { plan, userId: userId || "", scanData: JSON.stringify(scanData || {}) }
      };
      params.line_items = [{
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: 300,
          product_data: {
            name: "LocalRank PDF Report",
            description: planConfig.description,
            images: ["https://localrank-phi.vercel.app/rank-badge.png"],
          }
        }
      }];
    } else {
      // Subscription: use price ID from env
      if (!planConfig.priceId) throw new Error(`Price ID not configured for plan: ${plan}`);
      params.line_items = [{ quantity: 1, price: planConfig.priceId }];

      // Add trial period for first subscription
      params.subscription_data = {
        trial_period_days: 7,
        metadata: { plan, userId: userId || "" }
      };
    }

    const session = await stripe.checkout.sessions.create(params);

    // Store checkout session
    await supabase.from("checkout_sessions").insert({
      user_id: userId,
      stripe_session_id: session.id,
      plan,
      amount_cents: planConfig.unitAmount,
      currency: planConfig.currency,
      status: "pending",
      metadata: { scanData: JSON.stringify(scanData || {}) }
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("create-checkout error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
