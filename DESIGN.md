---
name: LocalRank
description: Local Business Digital Presence Score Tool — Paste a Google Maps URL, get an instant diagnostic score across 5 categories. Built for local trades and hospitality businesses.
brand:
  primary: "#CAFF04"
  secondary: "#1A1A1D"
  accent: "#CAFF04"
  background: "#09090B"
  surface: "#111114"
  surfaceElevated: "#1C1C20"
  text: "#FAFAFA"
  textMuted: "#71717A"
  textInverse: "#09090B"
  border: "#27272A"
  borderStrong: "#3F3F46"
  success: "#22C55E"
  warning: "#F59E0B"
  error: "#EF4444"
typography:
  heading: "Syne, weight 700"
  body: "Manrope, weight 400"
  mono: "JetBrains Mono, weight 400"
spacing:
  unit: 8
  scale: "8 16 24 32 48 64 96 128"
components:
  card: "{ bg: surface, border: border, radius: 12, shadow: none }"
  button: "{ bg: primary, color: inverse, padding: '12px 24px', radius: 8, fontWeight: 700 }"
  input: "{ bg: surface, border: border, focusBorder: primary, radius: 8 }"
---

# LocalRank — Design Specification

## 1. Concept & Vision

LocalRank is a **diagnostic scanner**, not a dashboard. It feels like a medical checkup report — authoritative, clear, and actionable. The user pastes a Google Maps URL and gets an instant health score for any local business. The tone is confident and clinical: this isn't "insights" — it's a scan. One number. Five category breakdowns. Zero fluff.

The emotional target: *"I didn't know I had a problem until I saw the score."*

## 2. Design Language

### Aesthetic Direction
**Dark Diagnostic Brutalism** — inspired by medical imaging interfaces and terminal-based health monitors. High contrast, sharp data visualization, monospace accents for data readouts. The electric lime accent is the "vitality signal" — it only appears on live data and the score gauge.

### Color Palette
```
--color-bg:             #09090B   /* Near-black page background */
--color-surface:        #111114   /* Card backgrounds */
--color-surface-elevated:#1C1C20  /* Hover states, tooltips */
--color-border:          #27272A  /* Subtle borders */
--color-border-strong:   #3F3F46  /* Dividers */

--color-primary:         #CAFF04  /* Electric lime — vitality accent */
--color-primary-dim:     #A3CC03  /* Hover state for primary */
--color-primary-glow:    rgba(202,255,4,0.15) /* Glow effect */

--color-text:            #FAFAFA  /* Primary text */
--color-text-muted:      #71717A  /* Secondary text */
--color-text-inverse:    #09090B  /* Text on primary bg */

--color-success:         #22C55E  /* Score 80+ */
--color-warning:        #F59E0B  /* Score 50-79 */
--color-error:          #EF4444  /* Score 0-49 */

--color-gauge-track:     #27272A  /* Gauge background arc */
```

### Typography
- **Headings**: Syne (Google Fonts) — geometric, bold, distinctive. Never use Inter/Roboto/Arial/Poppins.
- **Body**: Manrope (Google Fonts) — clean, readable, modern without being generic.
- **Data/Numbers**: JetBrains Mono — monospace for scores, percentages, counts.
- **Scale**: 48px hero score / 32px section heads / 18px body / 14px labels / 12px captions
- **Line-height**: 1.5 body, 1.1 headings

### Spatial System
- 8pt base unit
- Section padding: 64px vertical, 24px horizontal (mobile: 48px/16px)
- Card padding: 24px
- Component gap: 16px standard, 24px between sections
- Border-radius: 12px cards, 8px inputs/buttons, 50% circular elements

### Motion Philosophy
- **Entrance**: Score gauge draws on (SVG stroke-dashoffset animation, 800ms ease-out) when results appear
- **Stagger**: Category bars fill left-to-right, 100ms stagger between each
- **Micro-interactions**: Input focus glow (lime outline, 150ms), button scale 0.97 on press
- **Ambient**: Score number counts up from 0 to final score (1200ms, ease-out)
- **No**: parallax, scroll jank, or anything that blocks reading

### Visual Assets
- **Icons**: Lucide icons (outline, 20px stroke-width 1.5) — consistent with the minimal aesthetic
- **Gauge**: Custom SVG circle — the score visualization centerpiece
- **Decorative**: Subtle dot-grid background pattern on hero section (CSS radial-gradient)
- **No images**: This is a data tool — no stock photos

## 3. Layout & Structure

### Page Architecture (single page)
```
┌─────────────────────────────────────────┐
│ HEADER — Logo + tagline (minimal)       │
├─────────────────────────────────────────┤
│ HERO — Headline + URL input + Analyze  │
│ (dot-grid background, lime accent)       │
├─────────────────────────────────────────┤
│ SCORE PANEL — Gauge + score + verdict   │
│ (appears after analyze, animate in)      │
├─────────────────────────────────────────┤
│ BREAKDOWN — 5 category cards            │
│ (grid: 2col desktop, 1col mobile)     │
├─────────────────────────────────────────┤
│ CTA — "Want the full report?"           │
│ (email capture, lime button)            │
├─────────────────────────────────────────┤
│ FOOTER — Minimal: built by Minter       │
└─────────────────────────────────────────┘
```

### Responsive Strategy
- Desktop: max-width 720px centered, generous whitespace
- Mobile: single column, full-width input, stacked cards
- Breakpoints: 640px (mobile), 1024px (desktop)
- Font scale reduces 15% on mobile

### What Makes It Interesting
The **gauge is the hero** — it dominates the score panel visually. The verdict text below changes based on score range: "Critical Attention Needed" (0-49), "Room to Improve" (50-79), "Strong Digital Presence" (80-100).

## 4. Features & Interactions

### Core Feature: URL Analysis
1. User pastes a Google Maps Place URL (various formats supported: maps.google.com, goo.gl, maps.app.link, plus codes)
2. Click "Analyze" or press Enter
3. Loading state: gauge spins with pulsing lime ring
4. Results animate in: gauge draws, number counts up, bars fill
5. Score displayed 0–100 with letter grade (F to A+)

### URL Parsing
Extract place ID from:
- `maps.google.com/maps/place/?=PLACE_ID`
- `maps.app.link/...` (universal link)
- Plus codes (`7FG2VWV4+8G`)
- Full `https://www.google.com/maps/place/...` URLs

### Scoring Engine (0–100)
| Category | Max | Signal |
|---|---|---|
| Website Detected | 20 | Has real website vs no website/social only |
| Review Presence | 20 | Has reviews vs no reviews |
| Average Rating | 20 | ≥4.5=20, ≥4.0=15, ≥3.0=10, <3.0=5, none=0 |
| Business Info | 20 | Hours + phone + address = full, partial=10, missing=0 |
| Photo Presence | 20 | 10+ photos=20, 5-9=15, 1-4=10, none=0 |

### Breakdown Cards
Each card shows:
- Category name + icon
- Points earned / max (e.g., "15 / 20")
- Progress bar (lime fill on dark track)
- One-line insight (e.g., "No website found — you're missing 30% of discovery opportunities")

### States
- **Empty**: Placeholder text, input ready
- **Loading**: Spinner + "Scanning..." label on gauge
- **Error**: Red border on input + error message below (invalid URL, network error)
- **Demo mode**: When no API key, show a sample result with "Demo Mode" badge
- **Success**: Full results as described above

### Edge Cases
- URL doesn't match Google Maps → "Please enter a valid Google Maps URL"
- Place has no data → "We couldn't find data for this place. It may not be indexed."
- Network timeout → "Scan timed out. Try again."
- Rate limited → "Too many requests. Try again in a moment."

## 5. Component Inventory

### Header
- Logo: "LocalRank" in Syne 700, lime dot on the 'i'
- Tagline: "Digital health score for local businesses" in Manrope, muted
- States: single state (no nav needed)

### URL Input
- Full-width text input, 56px height
- Placeholder: "Paste a Google Maps URL..."
- Left icon: Link icon (Lucide)
- Right: Analyze button (lime bg, black text, Syne 700)
- States: default, focus (lime glow border), error (red border + message), disabled (during loading)
- Height: 56px input, 48px button

### Score Gauge (SVG)
- 200px diameter circle
- Track: dark grey arc (270° sweep, not full circle)
- Fill: lime arc, animates from 0 to score
- Center: large score number (JetBrains Mono, 56px) + " / 100" smaller
- Color of fill changes: green (80+), amber (50-79), red (0-49)
- Below gauge: verdict text ("Critical Attention Needed" / etc.)
- Grade letter badge below verdict: F D C B A A+

### Category Card
- Dark surface background, subtle border
- Top row: Icon (lime) + Category name + score (right-aligned, mono)
- Progress bar: 8px height, dark track, lime fill, rounded
- Bottom: one-line insight text (muted, 14px)
- States: scored (full color), unscored (greyed out)

### CTA Section
- Headline: "Get the full breakdown"
- Subtext: "Including competitor comparison + improvement checklist"
- Email input (minimal, inline with button)
- Button: "Send My Report" — lime, full-width on mobile

### Footer
- "Built by Minter Web Agency" — single line, muted, links to minter web agency site

## 6. Technical Approach

### Stack
- Single HTML file with embedded CSS and JS (zero build step, maximum portability)
- Google Fonts: Syne, Manrope, JetBrains Mono (preconnect + preload)
- Lucide icons via CDN (SVG sprite or individual imports)
- No framework, no Tailwind — custom CSS with CSS custom properties

### API Integration (Progressive Enhancement)
1. **Google Maps Places API** (primary data source) — requires user to add their own API key
   - Place Details endpoint → business info, reviews, photos count, rating
   - Places Search if only name/address provided
2. **OpenGraphr** (apiKey) — fetch social meta from website URL
3. **ipinfo.io** (free tier, 50k/month) — geolocation for context
4. **Demo Mode** — when no API key provided, show realistic mock data so the tool is always functional

### API Key Management
- User can input their Google Maps API key in a settings panel (gear icon, top-right)
- Key stored in localStorage (with clear warning it stored locally)
- Settings panel: API key input, "Test Key" button, save button

### Data Flow
```
User pastes URL
  → Parse Place ID from URL (client-side regex)
  → If key provided: fetch Place Details from Google Maps API
    → Extract: rating, reviews[], photos[], opening_hours, website, formatted_address
    → Run scoring engine
  → If no key: show demo mode with realistic mock data
  → Animate results in
```

### GitHub + Vercel Deploy
```bash
# Repo: minter-agency/localrank
# Branch: main → auto-deploys to https://localrank.vercel.app
# Framework: None (static HTML)
```

### Performance Targets
- FCP < 1.2s (no JS blocking render)
- Gauge animation: 60fps CSS only (no JS animation loops)
- Lighthouse: 95+ Performance, 100 Accessibility

## 7. Named Design Rules

1. **The Lime Signal Rule**: Lime (#CAFF04) appears only on live data — the gauge fill, active progress bars, and the logo dot. Never on decorative elements.
2. **The Score is Sacred**: The gauge dominates the score panel. Nothing competes with it. No other circular elements on the page.
3. **The Mono Data Rule**: All numbers — scores, percentages, counts — render in JetBrains Mono. Never in Syne or Manrope.
4. **The Flat Default Rule**: Cards have no shadows. Depth comes from border contrast and the lime accent, not elevation.
5. **The One-URL Rule**: The input is the only action on the hero. No extra buttons, no tabs, no mode switches. Paste → Analyze → Done.
