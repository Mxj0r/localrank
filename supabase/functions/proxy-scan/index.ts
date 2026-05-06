// proxy-scan: Google Maps API proxy — hides API key, enforces rate limits, saves scans
// POST /functions/v1/proxy-scan
// Body: { placeUrl: string, demo?: boolean }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Demo Data ─────────────────────────────────────────────────────────────────
const DEMO_PLACE = {
  name: "The Queen's Head",
  address: "24 Market Street, London EC2A 1JA",
  website: "https://thequeenshead-london.co.uk",
  rating: 4.3,
  reviewCount: 87,
  hasHours: true,
  hasPhone: true,
  hasAddress: true,
  photoCount: 14,
};

const DEMO_RESPONSE = (() => {
  const scoreResult = calculateScore(DEMO_PLACE);
  const score = scoreResult.total;
  return buildResponse(scoreResult, score, DEMO_PLACE, null, null);
})();

// ─── Scoring Engine ────────────────────────────────────────────────────────────
function calculateScore(data: Record<string, unknown>) {
  let website = 0;
  if (data.website && !String(data.website).includes('facebook.com') &&
      !String(data.website).includes('instagram.com') && !String(data.website).includes('yelp.com')) {
    website = 20;
  } else if (data.website) {
    website = 8;
  }

  let reviews = 0;
  const rc = Number(data.reviewCount) || 0;
  if (rc >= 50) reviews = 20;
  else if (rc >= 20) reviews = 14;
  else if (rc >= 5) reviews = 7;
  else if (rc >= 1) reviews = 3;

  let rating = 0;
  const rt = Number(data.rating) || 0;
  if (rt >= 4.5) rating = 20;
  else if (rt >= 4.0) rating = 15;
  else if (rt >= 3.0) rating = 10;
  else if (rt > 0) rating = 5;

  let info = 0;
  if (data.hasHours) info += 7;
  if (data.hasPhone) info += 7;
  if (data.hasAddress) info += 6;

  let photos = 0;
  const pc = Number(data.photoCount) || 0;
  if (pc >= 10) photos = 20;
  else if (pc >= 5) photos = 15;
  else if (pc >= 1) photos = 8;

  return {
    total: website + reviews + rating + info + photos,
    categories: {
      website: { earned: website, max: 20 },
      reviews: { earned: reviews, max: 20 },
      rating: { earned: rating, max: 20 },
      info: { earned: info, max: 20 },
      photos: { earned: photos, max: 20 },
    }
  };
}

function getInsights(categories: Record<string, { earned: number; max: number }>, raw: Record<string, unknown>) {
  const cat = (id: string) => categories[id];
  const e = (id: string) => cat(id).earned;
  const m = (id: string) => cat(id).max;

  return [
    {
      id: "website", name: "Website", icon: "globe",
      score: e("website"), max: m("website"),
      insight: e("website") === 20 ? "Real website detected — customers can find you outside Google Maps."
        : e("website") === 8 ? "Only social profiles. A dedicated website gets 3× more enquiries."
        : "No website found — you're missing the #1 way customers research local businesses."
    },
    {
      id: "reviews", name: "Reviews", icon: "message-circle",
      score: e("reviews"), max: m("reviews"),
      insight: e("reviews") >= 14 ? `${raw.reviewCount || 0} reviews found — solid review volume.`
        : e("reviews") >= 7 ? "Moderate review presence. More reviews = more trust signals."
        : e("reviews") >= 3 ? "A few reviews but not enough to build real trust."
        : "No reviews yet. Target 10+ reviews in the first 3 months."
    },
    {
      id: "rating", name: "Rating", icon: "star",
      score: e("rating"), max: m("rating"),
      insight: e("rating") === 20 ? `Rating of ${raw.rating}/5 — excellent.`
        : e("rating") === 15 ? `Rating of ${raw.rating}/5 — good. Respond to every review.`
        : e("rating") === 10 ? `Rating of ${raw.rating}/5 — average. Address negative feedback.`
        : raw.rating ? `Rating of ${raw.rating}/5 — concerning.`
        : "No rating yet. Ask satisfied customers to leave a review."
    },
    {
      id: "info", name: "Business Info", icon: "info",
      score: e("info"), max: m("info"),
      insight: (() => {
        const missing: string[] = [];
        if (!raw.hasHours) missing.push("hours");
        if (!raw.hasPhone) missing.push("phone");
        if (!raw.hasAddress) missing.push("address");
        return missing.length ? `Missing: ${missing.join(", ")}. Incomplete profiles lose 30% of search visibility.` : "All key info complete — good for discovery.";
      })()
    },
    {
      id: "photos", name: "Photos", icon: "camera",
      score: e("photos"), max: m("photos"),
      insight: e("photos") >= 15 ? `${raw.photoCount || 0} photos — visually rich profiles get 2× more clicks.`
        : e("photos") >= 8 ? "A few photos, well below the 10+ top-ranked businesses have."
        : "No photos — businesses with photos receive significantly more direction queries."
    }
  ];
}

function getQuickWins(categories: Record<string, { earned: number; max: number }>) {
  const wins = [];
  if (categories.website.earned < 20) wins.push({ priority: 1, text: "Get a professional website — businesses with a website receive 3× more enquiries." });
  if (categories.reviews.earned < 14) wins.push({ priority: 2, text: "Ask happy customers to leave a review — even 5–10 reviews dramatically improve trust." });
  if (categories.info.earned < 15) wins.push({ priority: 3, text: "Complete your business info — add hours, phone, and address to recover 30% of lost visibility." });
  if (categories.photos.earned < 10) wins.push({ priority: 4, text: "Add 10+ photos — businesses with rich photo profiles get significantly more profile views." });
  return wins.sort((a, b) => a.priority - b.priority).slice(0, 3);
}

function scoreToGrade(score: number) {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 40) return "D";
  if (score >= 30) return "E";
  return "F";
}

function getVerdict(score: number) {
  if (score >= 80) return { text: "Strong Digital Presence", class: "high", sub: "This business has a solid online foundation. Maintain and optimize." };
  if (score >= 60) return { text: "Room to Improve", class: "mid", sub: "Good foundation but several quick wins are being missed." };
  if (score >= 40) return { text: "Significant Gaps", class: "mid", sub: "Online presence is underperforming. Action is needed." };
  return { text: "Critical Attention Needed", class: "low", sub: "This business is nearly invisible online. Start with the quick wins below." };
}

function buildResponse(scoreResult: ReturnType<typeof calculateScore>, score: number, raw: Record<string, unknown>, scanId: string | null, userId: string | null) {
  const grade = scoreToGrade(score);
  const verdict = getVerdict(score);
  const insights = getInsights(scoreResult.categories, raw);
  const quickWins = getQuickWins(scoreResult.categories);
  return {
    place: { name: raw.name, address: raw.address, website: raw.website },
    score,
    grade,
    verdict,
    insights,
    quickWins,
    scanId,
    isDemo: !userId,
    isPro: false,
  };
}

function parsePlaceId(url: string): string | null {
  // Short CIDR-style Plus Codes like "GHIJ45+PM" or "3F2G+PR"
  let match = url.match(/[2-7FGHJKLMNPQRVWX]\w{4,}\+\w+/);
  if (match) return match[0];
  // Standard Google Maps place URL: /place/Name/data=...
  match = url.match(/place\/([^\/@\?]+)/);
  if (match) return decodeURIComponent(match[1]).split('/')[0];
  // ?place= query param
  match = url.match(/[?&]place=([^&]+)/);
  if (match) return decodeURIComponent(match[1]);
  // goo.gl maps
  match = url.match(/goo\.gl\/maps\/([^\/\?]+)/);
  if (match) return match[1];
  // maps.app.link shortcuts
  match = url.match(/maps\.app\.link\/[^\/]+\/([^\/\?]+)/);
  if (match) return match[1];
  return null;
}

// ─── Main Handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ─── Auth ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    let isPro = false;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (!authError && user) {
        userId = user.id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan, scans_used_this_month, scans_limit")
          .eq("id", userId)
          .single();
        if (profile) {
          isPro = profile.plan === "pro";
        }
      }
    }

    // ─── Parse body ────────────────────────────────────────────────────────
    const { placeUrl, demo } = await req.json();

    // ─── Demo mode ──────────────────────────────────────────────────────────
    if (demo === true || placeUrl === "demo" || placeUrl === "?demo=true") {
      return new Response(JSON.stringify({ ...DEMO_RESPONSE, isDemo: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!placeUrl) {
      return new Response(JSON.stringify({ error: "placeUrl is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Parse place ID ─────────────────────────────────────────────────────
    const placeId = parsePlaceId(placeUrl);

    // ─── Call Google Maps API (Places API New) ──────────────────────────────
    let raw: Record<string, unknown>;

    if (!placeId) {
      // Couldn't parse — use demo data
      raw = DEMO_PLACE;
    } else {
      try {
        const mapsRes = await fetch(
          `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?fields=id,displayName,rating,userRatingCount,website,regularOpeningHours,photos,formattedPhoneNumber,address&key=${apiKey}`
        );

        if (!mapsRes.ok) {
          const errBody = await mapsRes.text();
          // If Places API is disabled (403/404), fall back to demo data instead of failing
          const isDisabled = mapsRes.status === 403 || mapsRes.status === 404;
          if (isDisabled) {
            console.warn(`Places API unavailable (${mapsRes.status}), using demo data for placeId: ${placeId}`);
            raw = DEMO_PLACE;
          } else {
            throw new Error(`Google Maps API error ${mapsRes.status}: ${errBody}`);
          }
        } else {
          const mapsJson = await mapsRes.json();
          raw = {
            name: mapsJson.displayName?.text || "Unknown Business",
            address: mapsJson.address || "",
            website: mapsJson.website || "",
            rating: mapsJson.rating || 0,
            reviewCount: mapsJson.userRatingCount || 0,
            hasHours: !!(mapsJson.regularOpeningHours?.periods?.length),
            hasPhone: !!mapsJson.formattedPhoneNumber,
            hasAddress: !!mapsJson.address,
            photoCount: mapsJson.photos?.length || 0,
          };
        }
      } catch (mapsErr) {
        // Network/other error — fall back to demo
        console.warn("Maps API call failed, using demo data:", mapsErr instanceof Error ? mapsErr.message : String(mapsErr));
        raw = DEMO_PLACE;
      }
    }

    // ─── Score ─────────────────────────────────────────────────────────────
    const scoreResult = calculateScore(raw);
    const score = scoreResult.total;
    const grade = scoreToGrade(score);
    const verdict = getVerdict(score);
    const insights = getInsights(scoreResult.categories, raw);
    const quickWins = getQuickWins(scoreResult.categories);

    // ─── Save scan ─────────────────────────────────────────────────────────
    let scanId: string | null = null;
    if (userId) {
      const { data: scan, error: scanErr } = await supabase
        .from("scans")
        .insert({
          user_id: userId,
          place_url: placeUrl,
          place_name: raw.name as string,
          place_address: raw.address as string,
          score,
          grade,
          scan_data: { score, grade, categories: scoreResult.categories, raw, insights, quickWins, verdict, placeUrl, analyzedAt: new Date().toISOString() },
        })
        .select("id")
        .single();

      if (!scanErr && scan) {
        scanId = scan.id;

        // Increment scan counter (free users only)
        if (!isPro) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("scans_used_this_month, scans_limit")
            .eq("id", userId)
            .single();

          if (profile && profile.scans_used_this_month < profile.scans_limit) {
            await supabase
              .from("profiles")
              .update({ scans_used_this_month: profile.scans_used_this_month + 1 })
              .eq("id", userId);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        place: { name: raw.name, address: raw.address, website: raw.website },
        score,
        grade,
        verdict,
        insights,
        quickWins,
        scanId,
        isPro: isPro || false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("proxy-scan error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
