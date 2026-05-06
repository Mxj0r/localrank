// generate-report: Generate and email a LocalRank PDF report
// POST /functions/v1/generate-report
// Body: { scanData: {...}, email: string, scanId?: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "reports@resend.com";
    const fromName = Deno.env.get("RESEND_FROM_NAME") || "LocalRank";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) throw new Error("Authorization required");

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new Error("Unauthorized");

    // Check user is Pro
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    if (profile?.plan !== "pro") throw new Error("Pro subscription required");

    const { scanData, email, scanId } = await req.json();

    // Generate plain-text report
    const placeName = scanData?.place?.name || "the business";
    const score = scanData?.score ?? 0;
    const grade = scanData?.grade || "—";
    const verdict = scanData?.verdict || { text: "—", sub: "" };
    const insights = scanData?.insights || [];
    const quickWins = scanData?.quickWins || [];

    const reportText = `LocalRank Digital Presence Report
================================================

Business Analysed: ${placeName}
${scanData?.place?.address ? `Address: ${scanData.place.address}` : ""}
Report Generated: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}

──────────────────────────────────────────
DIGITAL PRESENCE SCORE
──────────────────────────────────────────

  ${score}/100  — Grade: ${grade}

  "${verdict.text}"
  ${verdict.sub}

──────────────────────────────────────────
CATEGORY BREAKDOWN
──────────────────────────────────────────

${insights.map((i: { name: string; score: number; max: number; insight: string }) =>
`  ${i.name.padEnd(16)} ${String(i.score).padStart(2)}/${i.max} pts
  ${i.insight}`
).join("\n\n")}

──────────────────────────────────────────
TOP 3 PRIORITY ACTIONS
────────────────────────────────────────--

${quickWins.slice(0, 3).map((w: { text: string }, idx: number) =>
`  ${idx + 1}. ${w.text}`
).join("\n\n")}

──────────────────────────────────────────
ABOUT THIS REPORT
────────────────────────────────────────--

LocalRank analyses 5 key signals that determine how easily
new customers can find and trust this business online:
  • Website — presence and quality of a dedicated website
  • Reviews — volume of customer reviews on Google
  • Rating — average star rating out of 5
  • Business Info — completeness of hours, phone, address
  • Photos — number and quality of Google Maps photos

──────────────────────────────────────────
Upgrade to Pro at localrank-phi.vercel.app
Built by Minter Web Agency — minterwebagency.com
`.trim();

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: email || user.email,
        subject: `Your LocalRank Report — ${placeName} (Score: ${score}/100)`,
        text: reportText,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      throw new Error(`Failed to send email: ${err}`);
    }

    // Mark scan as PDF-generated
    if (scanId) {
      await supabase
        .from("scans")
        .update({ pdf_generated: true })
        .eq("id", scanId)
        .eq("user_id", user.id);
    }

    return new Response(
      JSON.stringify({ success: true, sentTo: email || user.email }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
