// stripe-webhook: Handles Stripe webhook events
// POST /functions/v1/stripe-webhook
// Stripe-Webhook-Secret header required

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY")!;

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const sig = req.headers.get("stripe-signature")!;
    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
    }

    console.log("Stripe webhook event:", event.type);

    switch (event.type) {

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const plan = session.metadata?.plan || "";
        const userId = session.metadata?.userId || null;
        const scanData = session.metadata?.scanData ? JSON.parse(session.metadata.scanData) : {};

        // Update checkout session status
        await supabase
          .from("checkout_sessions")
          .update({ status: "completed" })
          .eq("stripe_session_id", session.id);

        if (plan === "report_payg") {
          // Generate and send PDF
          if (scanData?.score) {
            await sendReportEmail(scanData, session.customer_email as string, supabase, resendKey);
          }
        } else if (plan === "pro_monthly" || plan === "pro_yearly") {
          // Activate Pro plan
          if (userId) {
            await supabase
              .from("profiles")
              .update({
                plan: "pro",
                stripe_customer_id: session.customer as string,
                stripe_subscription_id: session.subscription as string || null,
                stripe_subscription_status: "active",
                scans_limit: 999999,
                updated_at: new Date().toISOString()
              })
              .eq("id", userId);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (profile) {
          const isActive = sub.status === "active" || sub.status === "trialing";
          await supabase
            .from("profiles")
            .update({
              plan: isActive ? "pro" : "free",
              stripe_subscription_status: sub.status,
              scans_limit: isActive ? 999999 : 3,
              updated_at: new Date().toISOString()
            })
            .eq("id", profile.id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (profile) {
          await supabase
            .from("profiles")
            .update({
              plan: "free",
              stripe_subscription_id: null,
              stripe_subscription_status: null,
              scans_limit: 3,
              updated_at: new Date().toISOString()
            })
            .eq("id", profile.id);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (profile) {
          await supabase
            .from("profiles")
            .update({ stripe_subscription_status: "past_due", updated_at: new Date().toISOString() })
            .eq("id", profile.id);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("stripe-webhook error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

// ─── Send Report Email ───
async function sendReportEmail(scanData: Record<string, unknown>, email: string, supabase: ReturnType<typeof createClient>, resendKey: string) {
  const placeName = scanData.place?.name || "the business";
  const score = scanData.score ?? 0;
  const grade = scanData.grade || "—";
  const verdict = scanData.verdict as { text: string; sub: string } || { text: "—", sub: "" };
  const insights = (scanData.insights as Array<{ name: string; score: number; max: number; insight: string }>) || [];
  const quickWins = (scanData.quickWins as Array<{ text: string }>) || [];

  // Build plain text report
  const reportText = `
LocalRank Digital Presence Report
===================================

Business: ${placeName}
Score: ${score}/100 (Grade: ${grade})
Verdict: ${verdict.text}
${verdict.sub}

CATEGORY BREAKDOWN
------------------
${insights.map((i) => `${i.name}: ${i.score}/${i.max} — ${i.insight}`).join("\n")}

QUICK WINS
----------
${quickWins.map((w, idx) => `${idx + 1}. ${w.text}`).join("\n")}

---
Generated by LocalRank — minterwebagency.com
  `.trim();

  // Send via Resend
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "LocalRank <reports@localrank-phi.vercel.app>",
      to: email,
      subject: `Your LocalRank Report for ${placeName}`,
      text: reportText,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
  }
}
