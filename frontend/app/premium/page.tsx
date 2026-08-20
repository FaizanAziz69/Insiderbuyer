"use client";
// Subscribe page — client design "sales-insider-access-v3-reordered" (2026-08-14),
// REBUILT in the site's own design system (tokens, Barlow/Libre Franklin, .card
// shadows) rather than ported 1:1 — client asked for branding-consistent, not
// copy-paste. Placeholders from the mock are wired to real data:
//   · leaderboard  → /insiders/track-record + /market-stats/analyst-firms (live)
//   · bubble gains → computed from /market-stats/history?range=5y, as-of pinned
//   · checkout     → Stripe /billing/checkout (annual pre-selected)
//   · exit popup   → OptInModal (ESP-wired email capture, source-tagged)
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { API_BASE, fetcher } from "@/lib/api";
import { getAuthToken, useAuth } from "@/lib/auth";
import { usePremium } from "@/components/premium/PremiumContext";
import { LoginModal } from "@/components/LoginModal";
import { OptInModal } from "@/components/OptInModal";

/* ── Styling — the site's tokens, pinned to the light palette (client spec:
      this page is white in BOTH site themes). Headings use the site heading
      stack, labels use the condensed display stack, numbers use .tabular. */
const CSS = String.raw`
.sub3{
  /* pin light palette regardless of site theme (client: single white page) */
  --bg-1:#ffffff; --bg-3:#eef1f3; --border:#dbdfe2; --border-strong:#c2c9cf;
  --text:#1d1e1f; --text-soft:#4b515a; --text-mute:#6c7783; --text-faint:#a5b0b7;
  --accent:#005882; --accent-hover:#003f5d; --on-accent:#ffffff;
  --brand-surface:#005882; --good:#11824d; --good-strong:#0f5f44;
  --good-soft:rgba(17,130,77,.12); --bad:#d2333d; --gold-ink:#8a6d1d;
  --bt-strategy:#2f6f9f; --bt-benchmark:#c1762a;
  background:var(--bg-1); color:var(--text-soft);
  font-family:var(--font-sans),system-ui,sans-serif; line-height:1.6;
}
.sub3 *{box-sizing:border-box}
.sub3 .wrap{max-width:800px;margin:0 auto;padding:0 20px}
.sub3 h1,.sub3 h2{font-family:var(--font-heading),sans-serif;font-weight:800;color:var(--text);letter-spacing:-.015em;line-height:1.12;margin:0 0 14px}
.sub3 h2{font-size:clamp(24px,4.5vw,33px)}
.sub3 p{margin:0 0 14px}
.sub3 section{padding:48px 0;border-bottom:1px solid var(--border)}
.sub3 .kicker{font-family:var(--font-display),sans-serif;font-weight:600;font-size:12.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--bad);margin-bottom:10px}
.sub3 .hl{background:var(--gold-soft,rgba(255,199,0,.25));background:rgba(255,199,0,.28);padding:0 3px}
.sub3 .mono{font-family:var(--font-display),sans-serif;font-weight:600;letter-spacing:.1em;text-transform:uppercase}

.sub3 .strip{position:sticky;top:0;z-index:30;background:var(--brand-surface);color:#e7f0f5;font-family:var(--font-display),sans-serif;font-weight:600;font-size:13px;letter-spacing:.08em;text-align:center;padding:9px 12px}
.sub3 .strip b{color:var(--gold,#ffc700);color:#ffc700}
.sub3 .strip .t{background:rgba(255,255,255,.14);padding:2px 8px;border-radius:4px;font-variant-numeric:tabular-nums}

.sub3 .btn{display:inline-flex;align-items:center;justify-content:center;gap:.5em;background:var(--good);color:#fff;text-decoration:none;font-family:var(--font-heading),sans-serif;font-weight:800;font-size:18px;padding:16px 32px;border:0;border-radius:10px;cursor:pointer;transition:background .15s ease,transform .15s ease,box-shadow .15s ease}
.sub3 .btn:hover{background:var(--good-strong);transform:translateY(-1px);box-shadow:0 10px 26px rgba(17,130,77,.3)}
.sub3 .btn:disabled{opacity:.6;cursor:default}
.sub3 .btn-wide{display:flex;width:100%;max-width:520px;margin:0 auto}
.sub3 .under{font-size:12.5px;color:var(--text-mute);margin-top:12px;text-align:center;line-height:1.7}

/* hero */
.sub3 .hero{text-align:center;padding:40px 0 48px;border-bottom:1px solid var(--border)}
.sub3 .eyebrow{display:inline-block;font-family:var(--font-display),sans-serif;font-weight:600;font-size:12.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--good);border:1px solid var(--good);border-radius:6px;padding:5px 12px;margin-bottom:18px}
.sub3 .hero h1{font-size:clamp(30px,5.8vw,48px);font-weight:900;max-width:700px;margin:0 auto 0}
.sub3 .hero .sub{font-size:clamp(16px,2.7vw,20px);color:var(--text-soft);max-width:620px;margin:16px auto 0}
.sub3 .hero .sub b{color:var(--text)}
.sub3 .coffee{display:inline-flex;align-items:baseline;gap:10px;margin-top:22px;background:var(--bg-1);border:1.5px solid var(--border);border-radius:12px;padding:12px 20px;box-shadow:var(--shadow-md,0 2px 4px rgba(0,0,0,.08));flex-wrap:wrap;justify-content:center}
.sub3 .coffee .c1{font-size:14.5px;color:var(--text-mute)}
.sub3 .coffee .c2{font-size:clamp(22px,4vw,30px);font-weight:800;color:var(--good);font-family:var(--font-heading),sans-serif}
.sub3 .social{display:flex;gap:26px;justify-content:center;flex-wrap:wrap;margin-top:24px}
.sub3 .snum{text-align:center}
.sub3 .snum b{display:block;font-size:20px;color:var(--good);font-family:var(--font-heading),sans-serif}
.sub3 .snum span{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-mute)}
.sub3 .hero .btn{margin-top:26px}

/* IQ */
.sub3 .iq-flex{display:flex;gap:28px;align-items:center;flex-wrap:wrap}
.sub3 .iq-txt{flex:1;min-width:280px}
.sub3 .iq-card{flex:0 1 260px;margin:0 auto;background:var(--bg-1);border:1px solid var(--border);border-radius:14px;padding:22px;position:relative;box-shadow:var(--shadow-lg,0 8px 20px rgba(0,0,0,.1))}
.sub3 .iq-card .tag{position:absolute;top:-11px;left:14px;background:var(--brand-surface);color:#e7f0f5;font-family:var(--font-display),sans-serif;font-weight:600;font-size:11px;letter-spacing:.16em;padding:4px 10px;border-radius:5px}
.sub3 .iq-num{font-weight:800;font-size:64px;color:var(--good);text-align:center;line-height:1;font-family:var(--font-heading),sans-serif}
.sub3 .iq-den{font-size:13px;color:var(--text-mute);text-align:center;letter-spacing:.06em}
.sub3 .iq-bar{height:10px;border-radius:5px;background:linear-gradient(90deg,var(--bad) 0%,#d8a31a 50%,var(--good) 100%);margin:14px 0 6px;position:relative}
.sub3 .iq-bar i{position:absolute;top:-4px;left:92%;width:3px;height:18px;background:var(--text);border-radius:2px}
.sub3 .iq-lbl{display:flex;justify-content:space-between;font-size:10px;color:var(--text-mute);letter-spacing:.08em}
.sub3 .iq-verdict{margin-top:12px;text-align:center;font-family:var(--font-display),sans-serif;font-weight:600;font-size:12px;letter-spacing:.12em;color:var(--good)}
.sub3 .factors{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:24px}
.sub3 .factor{background:var(--bg-1);border:1px solid var(--border);border-radius:10px;padding:12px}
.sub3 .factor .ft{font-weight:700;font-size:13.5px;color:var(--text)}
.sub3 .factor .fd{font-size:12.5px;color:var(--text-mute);margin-top:3px;line-height:1.45}

/* everything you get */
.sub3 .sq-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-top:8px}
.sub3 .sq{background:var(--bg-1);border:1px solid var(--border);border-radius:12px;padding:20px 16px;position:relative;min-height:168px;display:flex;flex-direction:column;box-shadow:var(--shadow-sm,0 1px 2px rgba(0,0,0,.05))}
.sub3 .sq .ic{font-size:26px;line-height:1}
.sub3 .sq .st{font-weight:700;font-size:15.5px;margin-top:10px;line-height:1.3;color:var(--text)}
.sub3 .sq .sd{font-size:13.5px;color:var(--text-mute);margin-top:5px;line-height:1.5;flex:1}
.sub3 .sq .sv{font-family:var(--font-display),sans-serif;font-weight:600;font-size:11.5px;color:var(--gold-ink);margin-top:10px;letter-spacing:.08em}
.sub3 .sq.hot{border:2px solid var(--bad);box-shadow:0 4px 14px rgba(210,51,61,.12)}
.sub3 .sq.hot .ribbon{position:absolute;top:-10px;right:10px;background:var(--bad);color:#fff;font-family:var(--font-display),sans-serif;font-weight:600;font-size:10px;letter-spacing:.14em;padding:3px 8px;border-radius:4px}
.sub3 .pricebox{max-width:560px;margin:28px auto 0;background:var(--bg-1);border:2px solid var(--text);border-radius:14px;padding:24px;box-shadow:var(--shadow-lg,0 8px 20px rgba(0,0,0,.1));text-align:center}
.sub3 .plans{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0 16px;text-align:left}
@media (max-width:520px){.sub3 .plans{grid-template-columns:1fr}}
.sub3 .plan{position:relative;border:1.5px solid var(--border);border-radius:12px;padding:14px 14px 12px;cursor:pointer;background:var(--bg-1);transition:border-color .15s ease,box-shadow .15s ease}
.sub3 .plan.sel{border-color:var(--good);box-shadow:0 0 0 2px var(--good-soft),var(--shadow-sm,0 1px 2px rgba(0,0,0,.05))}
.sub3 .plan .top{display:flex;align-items:center;gap:9px}
.sub3 .plan .radio{width:18px;height:18px;border-radius:50%;border:2px solid var(--border-strong);flex:0 0 auto;position:relative}
.sub3 .plan.sel .radio{border-color:var(--good)}
.sub3 .plan.sel .radio::after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--good)}
.sub3 .plan .nm{font-family:var(--font-heading),sans-serif;font-weight:800;color:var(--text);font-size:15px}
.sub3 .plan .bv{margin-left:auto;background:var(--good-soft);color:var(--good);font-family:var(--font-display),sans-serif;font-weight:600;font-size:10px;letter-spacing:.1em;padding:3px 8px;border-radius:999px;white-space:nowrap}
.sub3 .plan .amt{margin-top:8px;font-family:var(--font-heading),sans-serif;font-weight:900;font-size:26px;color:var(--text);line-height:1}
.sub3 .plan .amt small{font-size:13px;color:var(--text-mute);font-weight:400;font-family:var(--font-sans),sans-serif}
.sub3 .plan .note{margin-top:5px;font-size:11.5px;color:var(--text-mute);line-height:1.4}
.sub3 .plan .note s{margin-right:4px}
.sub3 .pricebox .tot{font-size:14px;color:var(--text-mute);letter-spacing:.06em}
.sub3 .pricebox .tot s{margin-left:6px}
.sub3 .pricebox .pv{font-size:42px;font-weight:900;color:var(--good);margin:6px 0;font-family:var(--font-heading),sans-serif}
.sub3 .pricebox .pv small{font-size:15px;color:var(--text-mute);font-weight:400;font-family:var(--font-sans),sans-serif}
.sub3 .save{display:inline-block;background:var(--bad);color:#fff;font-family:var(--font-display),sans-serif;font-weight:600;font-size:11.5px;letter-spacing:.12em;padding:4px 10px;border-radius:5px;margin-bottom:14px}
.sub3 .err{margin:10px auto 0;max-width:520px;background:var(--bad-soft,rgba(210,51,61,.1));border:1px solid var(--bad);color:var(--bad);border-radius:8px;padding:10px 14px;font-size:13.5px;text-align:center}

/* bubbles */
.sub3 .bubbles{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:8px;max-width:720px;margin:10px auto 0}
.sub3 .bub{display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:50%;background:var(--bg-1);border:1.5px solid var(--border);box-shadow:var(--shadow-lg,0 8px 20px rgba(0,0,0,.1));text-align:center}
.sub3 .bub .logo{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;margin-bottom:5px;font-family:var(--font-heading),sans-serif}
.sub3 .bub .tk{font-weight:700;font-size:14px;letter-spacing:.04em;color:var(--text)}
.sub3 .bub .gain{font-weight:700;font-size:15px;color:var(--good);font-variant-numeric:tabular-nums}
.sub3 .bub .per{font-size:9.5px;color:var(--text-mute);letter-spacing:.08em}
.sub3 .b1{width:176px;height:176px}.sub3 .b2{width:152px;height:152px}.sub3 .b3{width:134px;height:134px}.sub3 .b4{width:118px;height:118px}
.sub3 .b1 .gain{font-size:21px}.sub3 .b2 .gain{font-size:17px}
.sub3 .b1{transform:translateY(-6px)}.sub3 .b3{transform:translateY(10px)}.sub3 .b4{transform:translateY(-12px)}
.sub3 .bub-note{text-align:center;font-size:10.5px;letter-spacing:.08em;color:var(--text-mute);margin-top:20px;text-transform:uppercase}
@media (max-width:560px){.sub3 .b1{width:142px;height:142px}.sub3 .b2{width:124px;height:124px}.sub3 .b3{width:110px;height:110px}.sub3 .b4{width:98px;height:98px}.sub3 .b1 .gain{font-size:17px}}

/* dark bands */
.sub3 .band{background:var(--brand-surface);color:#dbe7ee;text-align:center;border-bottom:0}
.sub3 .band h2{color:#fff}
.sub3 .band .big{font-family:var(--font-heading),sans-serif;font-style:italic;font-weight:700;font-size:clamp(19px,3.6vw,25px);color:#ffc700;margin-bottom:12px}
.sub3 .band p{color:#b7cddc;max-width:640px;margin:0 auto 14px}
.sub3 .steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;max-width:680px;margin:26px auto 0;text-align:left}
.sub3 .step{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:16px}
.sub3 .step .sn{font-family:var(--font-display),sans-serif;font-weight:600;font-size:11.5px;color:#ffc700;letter-spacing:.14em}
.sub3 .step .st{font-weight:700;color:#fff;margin-top:6px;font-size:15.5px}
.sub3 .step .sd{font-size:13.5px;color:#b7cddc;margin-top:4px;line-height:1.5}

/* backtest */
.sub3 .chart-card{background:var(--bg-1);border:1px solid var(--border);border-radius:14px;padding:22px 18px;margin-top:8px;box-shadow:var(--shadow-sm,0 1px 2px rgba(0,0,0,.05))}
.sub3 .chart-title{font-family:var(--font-display),sans-serif;font-weight:600;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-mute);margin-bottom:12px;text-align:center}
.sub3 .legend{display:flex;gap:18px;justify-content:center;font-size:12px;margin-top:10px;flex-wrap:wrap;color:var(--text-soft)}
.sub3 .legend .sw{display:inline-block;width:16px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}
.sub3 .chart-note{font-size:11.5px;color:var(--text-mute);margin-top:12px;line-height:1.6}

/* leaderboard */
.sub3 .board{border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-top:6px}
.sub3 .board-head{display:flex;justify-content:space-between;align-items:center;background:var(--brand-surface);color:#dbe7ee;padding:10px 14px;font-family:var(--font-display),sans-serif;font-weight:600;font-size:12px;letter-spacing:.12em;text-transform:uppercase}
.sub3 .board-head .live{color:#7ce3ae}
.sub3 .row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-top:1px solid var(--border);background:var(--bg-1)}
.sub3 .ava{width:44px;height:44px;border-radius:50%;flex:0 0 auto;background:linear-gradient(135deg,#3f6f8f,var(--brand-surface));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;overflow:hidden;font-family:var(--font-heading),sans-serif}
.sub3 .ava span{filter:blur(5px);opacity:.9}
.sub3 .ava.an{background:linear-gradient(135deg,#8a6d1d,#5c4610)}
.sub3 .rname{flex:1;min-width:0}
.sub3 .rname .nm{font-weight:700;font-size:15px;color:var(--text);filter:blur(4.5px);user-select:none}
.sub3 .rname .rl{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-mute);margin-top:2px}
.sub3 .rstat{text-align:right;flex:0 0 auto;font-variant-numeric:tabular-nums}
.sub3 .rstat .sr{font-weight:700;font-size:16px;color:var(--good)}
.sub3 .rstat .ar{font-size:11.5px;color:var(--text-mute)}
.sub3 .lock{flex:0 0 auto;font-size:15px}
.sub3 .board-cta{padding:16px 14px;border-top:1px solid var(--border);text-align:center;background:var(--bg-3)}
.sub3 .board-cta .bc{font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-mute);margin-bottom:10px}

/* guarantee */
.sub3 .guar{display:flex;gap:22px;align-items:center;flex-wrap:wrap}
.sub3 .badge{flex:0 0 auto;width:112px;height:112px;border:3px double var(--good);border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--good);background:var(--bg-1)}
.sub3 .badge b{font-size:30px;line-height:1;font-family:var(--font-heading),sans-serif}
.sub3 .badge span{font-size:9px;letter-spacing:.18em;margin-top:4px}
.sub3 .guar .gtxt{flex:1;min-width:260px}

/* legal + sticky */
.sub3 .legal{font-size:11px;color:var(--text-mute);line-height:1.7;padding:26px 0 96px}
.sub3 .legal a{color:var(--text-mute)}
.sub3 .sticky-bar{position:fixed;bottom:0;left:0;right:0;z-index:60;background:var(--bg-1);border-top:2px solid var(--text);padding:10px 14px;display:flex;gap:12px;align-items:center;justify-content:center;box-shadow:0 -8px 24px rgba(0,0,0,.12)}
.sub3 .sticky-bar .st{font-size:12.5px;line-height:1.35;color:var(--text-soft)}
.sub3 .sticky-bar .st b{color:var(--good)}
.sub3 .sticky-bar .btn{font-size:14px;padding:11px 18px;white-space:nowrap}
/* ── Mobile compaction (client 2026-08-20: match TipRanks-plans density —
     every size on the page was desktop-scale on phones) ── */
@media (max-width:640px){
  .sub3 .wrap{padding:0 16px}
  .sub3 section{padding:28px 0}
  .sub3 h2{font-size:21px}
  .sub3 .kicker{font-size:10.5px;margin-bottom:8px}
  .sub3 .strip{font-size:11px;padding:7px 10px;letter-spacing:.05em}
  .sub3 .hero{padding:22px 0 30px}
  .sub3 .eyebrow{font-size:10px;padding:4px 10px;margin-bottom:14px;letter-spacing:.14em}
  .sub3 .hero h1{font-size:25px;line-height:1.2;padding:0 4px}
  .sub3 .hero .sub{font-size:14px;margin-top:12px}
  .sub3 .coffee{margin-top:16px;padding:10px 14px;gap:8px}
  .sub3 .coffee .c1{font-size:12px}
  .sub3 .coffee .c2{font-size:20px}
  /* the three proof stats sit as one even row instead of a 2+1 wrap */
  .sub3 .social{gap:8px;margin-top:18px;flex-wrap:nowrap}
  .sub3 .snum{flex:1 1 0;min-width:0}
  .sub3 .snum b{font-size:16px}
  .sub3 .snum span{font-size:9px;letter-spacing:.05em}
  .sub3 .hero .btn{margin-top:20px}
  .sub3 .btn{font-size:15px;padding:13px 20px}
  .sub3 .under{font-size:11px;margin-top:10px}
  .sub3 .iq-num{font-size:52px}
  .sub3 .factors{gap:8px;margin-top:16px}
  .sub3 .sq{min-height:0;padding:14px 12px}
  .sub3 .sq .ic{font-size:22px}
  .sub3 .sq .st{font-size:14px;margin-top:8px}
  .sub3 .sq .sd{font-size:12.5px}
  .sub3 .pricebox{padding:18px 14px;margin-top:20px}
  .sub3 .pricebox .pv{font-size:34px}
  .sub3 .plan .amt{font-size:22px}
  .sub3 .band .big{font-size:17px}
  .sub3 .steps{gap:10px;margin-top:18px}
  .sub3 .step{padding:13px}
  .sub3 .step .st{font-size:14px}
  .sub3 .step .sd{font-size:12.5px}
  .sub3 .chart-card{padding:16px 10px}
  .sub3 .row{padding:10px 12px;gap:10px}
  .sub3 .ava{width:36px;height:36px;font-size:13px}
  .sub3 .rname .nm{font-size:13.5px}
  .sub3 .rstat .sr{font-size:14px}
  .sub3 .badge{width:96px;height:96px}
  .sub3 .badge b{font-size:25px}
  .sub3 .guar{gap:16px}
  .sub3 .sticky-bar{padding:8px 10px;gap:10px}
  .sub3 .sticky-bar .st{font-size:11px}
  .sub3 .sticky-bar .btn{font-size:13px;padding:10px 14px}
  .sub3 .legal{padding-bottom:110px}
}
@media (prefers-reduced-motion:reduce){.sub3 *{transition:none!important}}
/* ── Dark mode (client 2026-08-18: "subscribe page on dark mode with dark
      color", light mode is already signed off). The page carries its own
      scoped palette, so dark is a token swap inside .sub3 and the light
      design is untouched. --bg-1 becomes the CARD surface and the page takes
      the deeper site background, because in light mode both were one white. */
:root[data-theme="dark"] .sub3{
  --bg-1:#0c1428; --bg-3:#182338; --border:#1f2c45; --border-strong:#2f3e5c;
  --text:#f0f4fa; --text-soft:#c9d3e3; --text-mute:#8794ab; --text-faint:#5d6b85;
  --accent:#20d0ff; --accent-hover:#6ddfff; --on-accent:#042033;
  /* one token carries the offer strip, the two dark bands, the leaderboard
     head and the score tag — lifted off the page background so each of those
     still reads as a band instead of blending into the page */
  --brand-surface:#182338;
  --good:#1bb471; --good-strong:#11824d; --good-soft:rgba(27,180,113,.16);
  --bad:#e84b56; --gold-ink:#e3bd5c;
  --bt-strategy:#4590c6; --bt-benchmark:#b87a22;
  background:#050a18;
}
/* a 2px near-black border is a light-mode device; on dark it reads as glare,
   so the purchase green carries the same emphasis instead */
:root[data-theme="dark"] .sub3 .pricebox{border-color:var(--good)}
:root[data-theme="dark"] .sub3 .sticky-bar{border-top-color:var(--border-strong);box-shadow:0 -8px 24px rgba(0,0,0,.5)}
/* the marker-pen wash needs less alpha and warm ink over a deep surface */
:root[data-theme="dark"] .sub3 .hl{background:rgba(255,199,0,.14);color:#ffe9b0}
:root[data-theme="dark"] .sub3 .sq.hot{box-shadow:0 4px 14px rgba(232,75,86,.22)}
/* two of the bubble marks are brand-black (PLTR) or near-black navy (SMCI) —
   on a dark card the chip disappears, so give every one a hairline ring */
:root[data-theme="dark"] .sub3 .bub .logo{box-shadow:0 0 0 1px rgba(255,255,255,.22)}

`;

/* ── Data hooks ──────────────────────────────────────────────────────────── */

/** Real multi-year winners for the bubbles: closes from our own history feed,
 *  gain computed first→last bar, as-of pinned to the last bar's date. Only
 *  positive movers render (self-maintaining — a loser drops out on its own). */
const BUBBLE_SYMBOLS = ["NVDA", "SMCI", "PLTR", "AMD", "TSLA", "CVNA"];
const BUBBLE_COLORS: Record<string, string> = {
  NVDA: "#76B900", SMCI: "#0B1B33", PLTR: "#000000",
  AMD: "#ED1C24", TSLA: "#E31937", CVNA: "#4A67C7",
};
interface BubbleRow { sym: string; gainPct: number; asOf: string }
async function fetchBubbles(): Promise<{ rows: BubbleRow[]; asOf: string | null }> {
  const settled = await Promise.all(
    BUBBLE_SYMBOLS.map(async (sym) => {
      try {
        const res = await fetch(`${API_BASE}/market-stats/history?symbol=${sym}&range=5y`);
        const data = await res.json();
        const bars: Array<{ close: number; date: string }> = data?.history?.bars || [];
        if (bars.length < 50) return null;
        const first = bars[0].close;
        const last = bars[bars.length - 1].close;
        if (!(first > 0) || !(last > 0)) return null;
        return { sym, gainPct: (last / first - 1) * 100, asOf: bars[bars.length - 1].date };
      } catch { return null; }
    }),
  );
  const rows = (settled.filter(Boolean) as BubbleRow[])
    .filter((r) => r.gainPct > 25) // only meaningful winners
    .sort((a, b) => b.gainPct - a.gainPct)
    .slice(0, 5);
  return { rows, asOf: rows[0]?.asOf ?? null };
}

/* ── Small pieces ────────────────────────────────────────────────────────── */

function useCountdown(minutes = 15): string {
  const [left, setLeft] = useState(minutes * 60);
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);
  const m = Math.floor(left / 60), s = left % 60;
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

function CheckoutOutcome() {
  const { refreshPremium } = usePremium();
  const [state, setState] = useState<"none" | "syncing" | "success" | "cancelled" | "error">("none");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (!outcome) return;
    if (outcome === "cancelled") { setState("cancelled"); return; }
    if (outcome !== "success") return;
    const sessionId = params.get("session_id");
    setState("syncing");
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/billing/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken() ?? ""}` },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error("sync failed");
        await refreshPremium();
        setState(data?.premium ? "success" : "syncing");
        if (!data?.premium) setTimeout(async () => { await refreshPremium(); setState("success"); }, 4000);
      } catch { setState("error"); }
    })();
  }, [refreshPremium]);
  if (state === "none") return null;
  // Scoped .sub3 tokens, not fixed hex — this banner renders inside the page
  // wrapper, so it follows the light/dark palette swap with everything else.
  const palette: Record<string, { bg: string; bd: string; fg: string }> = {
    success: { bg: "var(--good-soft)", bd: "var(--good)", fg: "var(--good)" },
    syncing: { bg: "var(--accent-soft)", bd: "var(--accent)", fg: "var(--accent)" },
    cancelled: { bg: "var(--bg-3)", bd: "var(--border-strong)", fg: "var(--text-mute)" },
    error: { bg: "var(--bad-soft)", bd: "var(--bad)", fg: "var(--bad)" },
  };
  const msg: Record<string, string> = {
    success: "🎉 You're in — your subscription is active and every paywall is unlocked.",
    syncing: "Finalizing your subscription…",
    cancelled: "Checkout cancelled — no charge was made.",
    error: "We couldn't confirm the payment automatically. If you were charged, refresh in a minute or contact support.",
  };
  const p = palette[state];
  return (
    <div style={{ maxWidth: 720, margin: "18px auto 0", padding: "13px 20px", borderRadius: 12, textAlign: "center", fontWeight: 700, fontSize: 14.5, background: p.bg, border: `1px solid ${p.bd}`, color: p.fg }}>
      {msg[state]}
    </div>
  );
}

const CORE_TILES = [
  { ic: "📊", st: "The Official Insider Buying Database", sd: "The most detailed insider data on the market — every filing, every filer, fully searchable.", sv: "CORE ACCESS" },
  { ic: "🎯", st: "Insider Scores on Every Stock", sd: "0–99 quality score, re-ranked daily — down to the single highest-conviction name.", sv: "CORE ACCESS" },
  { ic: "⚡", st: "Real-Time Insider Alerts", sd: "High-conviction buys in your inbox minutes after EDGAR — never weeks later.", sv: "CORE ACCESS" },
  { ic: "📈", st: "Live Rankings #1–200", sd: "The full board of insider-backed names, ranked live by score — updated after every filing.", sv: "CORE ACCESS" },
  { ic: "🏛️", st: "Politician Trades", sd: "Congressional trades with committee seats, filing speed, donors & contracts.", sv: "CORE ACCESS" },
  { ic: "🏆", st: "Ranked Insiders & Analysts", sd: "Every insider and analyst scored by the measured performance of their past calls.", sv: "CORE ACCESS" },
];
const REPORT_TILES = [
  { ic: "📗", st: "Top Stocks Insiders Are Buying", sd: "2026 special report — our highest-conviction insider-backed ideas.", sv: "$49 VALUE" },
  { ic: "📘", st: "Top Stocks Analysts Love", sd: "2026 special report — where Wall Street's most accurate analysts agree.", sv: "$49 VALUE" },
  { ic: "📙", st: "Top Dividend Stocks", sd: "2026 special report — income names with insider conviction behind them.", sv: "$49 VALUE" },
  { ic: "🔥", st: "One Tiny Stock You Should Know About", sd: "Our current #1 insider cluster buy — full thesis, filings, and ticker inside.", sv: "$49 VALUE" },
];

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function PremiumPage() {
  const { user } = useAuth();
  const { premium } = usePremium();
  const timer = useCountdown(15);
  const [plan, setPlan] = useState<"annual" | "monthly">("annual");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const popupFired = useRef(false);

  // Live leaderboard rows (design placeholders → real database figures).
  const { data: insiderData } = useSWR<{ rows: any[] }>(
    `${API_BASE}/insiders/track-record?limit=10`, fetcher, { revalidateOnFocus: false },
  );
  const { data: firmData } = useSWR<{ rows: any[] }>(
    `${API_BASE}/market-stats/analyst-firms?limit=8`, fetcher, { revalidateOnFocus: false },
  );
  const topInsiders = (insiderData?.rows || [])
    .filter((r) => Number(r.trades) >= 5)
    .slice(0, 3);
  const topFirms = (firmData?.rows || [])
    .filter((r) => Number(r.scoredRatings) >= 50)
    .sort((a, b) => Number(b.successRate) - Number(a.successRate))
    .slice(0, 2);

  // Real multi-year winners for the bubbles.
  const { data: bubbleData } = useSWR("premium-bubbles-5y", fetchBubbles, {
    revalidateOnFocus: false, dedupingInterval: 24 * 3600 * 1000,
  });
  const bubbles = bubbleData?.rows || [];
  const bubbleSizes = ["b1", "b2", "b3", "b3", "b4"];

  // Exit-intent + timed popup (email capture for the reports bundle).
  useEffect(() => {
    if (premium) return;
    const fire = () => {
      if (popupFired.current) return;
      popupFired.current = true;
      setPopupOpen(true);
    };
    const t = setTimeout(fire, 18000);
    const onMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget && e.clientY <= 0) fire();
    };
    document.addEventListener("mouseout", onMouseOut);
    return () => { clearTimeout(t); document.removeEventListener("mouseout", onMouseOut); };
  }, [premium]);

  // Returning from Stripe via the browser Back button restores this page from
  // the back/forward cache with `busy` still true, leaving every checkout
  // button stuck on "Opening checkout…" — reset it whenever the page is shown.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // planOverride: some CTAs advertise a specific plan (e.g. the closing
  // "$199/Year" button) regardless of the selector state. Passed as a plain
  // string only — `onClick={checkout}` hands us a click event, which the
  // validity check below ignores.
  const checkout = async (planOverride?: unknown) => {
    if (busy) return;
    if (!user) { setLoginOpen(true); return; }
    const chosen = planOverride === "annual" || planOverride === "monthly" ? planOverride : plan;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${API_BASE}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken() ?? ""}` },
        body: JSON.stringify({ plan: chosen }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(
          (Array.isArray(data?.message) ? data.message[0] : data?.message) ||
            "Checkout is unavailable right now — please try again.",
        );
      }
      window.location.href = data.url as string;
    } catch (e) {
      setBusy(false);
      setErr(e instanceof Error ? e.message : "Something went wrong — try again.");
    }
  };
  const scrollToCheckout = () => document.getElementById("checkout")?.scrollIntoView({ behavior: "smooth" });

  const initials = (name: string) =>
    name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const fmtGain = (v: number) => `+${Math.round(v).toLocaleString("en-US")}%`;

  return (
    <div className="sub3" style={{ width: "100vw", position: "relative", left: "50%", marginLeft: "-50vw", marginTop: "-2rem" }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <CheckoutOutcome />
      {premium && (
        <div style={{ maxWidth: 720, margin: "18px auto 0", padding: "14px 20px", borderRadius: 12, textAlign: "center", fontWeight: 700, fontSize: 14.5, background: "var(--good-soft)", border: "1px solid var(--good)", color: "var(--good)" }}>
          You&rsquo;re subscribed — every paywall is unlocked.
        </div>
      )}

      {/* countdown strip */}
      <div className="strip">
        ⚡ FOUNDING OFFER — <b>over 55% off</b> annual + all special reports free · expires in{" "}
        <span className="t">{timer}</span>
      </div>

      {/* 1 · hero */}
      <div className="wrap hero">
        <span className="eyebrow">Annual Membership · Over 55% Off</span>
        <h1>Get Institutional-Quality Stock Analysis for Less Than a Cup of Coffee a Day</h1>
        <p className="sub">
          The same class of research institutions pay thousands for —{" "}
          <b>built on the most honest signal in the market: what insiders do with their own money.</b>
        </p>
        <div className="coffee">
          <span className="c1">$199/year ÷ 365 days =</span>
          <span className="c2 tabular">$0.55/day ☕</span>
        </div>
        <div className="social">
          <div className="snum"><b className="tabular">4,000+</b><span>filings scanned daily</span></div>
          <div className="snum"><b className="tabular">0–99</b><span>Insider Score on every stock</span></div>
          <div className="snum"><b className="tabular">60 yrs</b><span>of published research</span></div>
        </div>
        <button className="btn" onClick={checkout} disabled={busy}>
          {busy ? "Opening checkout…" : "Get Insider Access — $199/Year →"}
        </button>
        {err && <div className="err">{err}</div>}
        <p className="under">Everything included · All special reports free · 30-day money-back guarantee</p>
      </div>

      {/* 2 · Insider Score */}
      <section><div className="wrap">
        <div className="kicker">Our proprietary Insider Score</div>
        <h2>Check What Insiders Are <em style={{ fontStyle: "italic", color: "var(--bad)" }}>Really</em> Doing</h2>
        <div className="iq-flex">
          <div className="iq-txt">
            <p>
              Thousands of insider filings hit the SEC every week — and most are noise. Automatic
              plans, tax sales, option exercises. The Insider Score cuts through all of it: every
              stock scored <b>0 to 99</b> based on the <span className="hl">quality</span> of its
              insider buying, re-ranked daily, minutes after each filing hits EDGAR.
            </p>
            <p style={{ marginBottom: 0 }}>
              One number tells you whether the people who know the company best are betting their
              own money on it — <b>right now.</b>
            </p>
          </div>
          <div className="iq-card">
            <div className="tag">LIVE SCORE · SAMPLE</div>
            <div className="iq-num tabular">92</div>
            <div className="iq-den">/ 99 · INSIDER SCORE</div>
            <div className="iq-bar"><i /></div>
            <div className="iq-lbl"><span>WEAK</span><span>NEUTRAL</span><span>STRONG</span></div>
            <div className="iq-verdict">▲ HIGH-CONVICTION CLUSTER BUY</div>
          </div>
        </div>
        <div className="factors">
          <div className="factor"><div className="ft">Who&rsquo;s buying</div><div className="fd">A CEO sees the whole business. Proximity to operations = heavier weight.</div></div>
          <div className="factor"><div className="ft">How much</div><div className="fd">Absolute dollars committed — a $100k buy is real conviction at any market cap.</div></div>
          <div className="factor"><div className="ft">Clustering</div><div className="fd">One buyer can be wrong. Five rarely agree by accident.</div></div>
          <div className="factor"><div className="ft">Track record</div><div className="fd">Proven buyers outweigh first-timers — measured, not assumed.</div></div>
          <div className="factor"><div className="ft">Skin in the game</div><div className="fd">High and rising insider ownership scores higher.</div></div>
          <div className="factor"><div className="ft">Red flags</div><div className="fd">Heavy dilution and litigation subtract automatically.</div></div>
        </div>
      </div></section>

      {/* 3 · everything you get + pricebox */}
      <section id="checkout"><div className="wrap">
        <div className="kicker" style={{ textAlign: "center" }}>One membership · Everything included</div>
        <h2 style={{ textAlign: "center" }}>Everything You Get</h2>
        <div className="sq-grid">
          {CORE_TILES.map((t) => (
            <div className="sq" key={t.st}>
              <div className="ic">{t.ic}</div><div className="st">{t.st}</div>
              <div className="sd">{t.sd}</div><div className="sv">{t.sv}</div>
            </div>
          ))}
          {REPORT_TILES.map((t) => (
            <div className="sq hot" key={t.st}>
              <div className="ribbon">INCLUDED FREE</div>
              <div className="ic">{t.ic}</div><div className="st">{t.st}</div>
              <div className="sd">{t.sd}</div><div className="sv">{t.sv}</div>
            </div>
          ))}
        </div>
        <div className="pricebox">
          <div className="tot mono">TOTAL VALUE <s className="tabular">$675.88</s></div>
          <div className="plans" role="radiogroup" aria-label="Choose a plan">
            <div
              className={`plan${plan === "annual" ? " sel" : ""}`}
              role="radio" aria-checked={plan === "annual"} tabIndex={0}
              onClick={() => setPlan("annual")}
              onKeyDown={(e) => e.key === "Enter" && setPlan("annual")}
            >
              <div className="top"><span className="radio" /><span className="nm">Annual</span><span className="bv">BEST VALUE · 55% OFF</span></div>
              <div className="amt tabular">$199 <small>/ year</small></div>
              <div className="note">Just $16.58/mo · all 4 special reports included free</div>
            </div>
            <div
              className={`plan${plan === "monthly" ? " sel" : ""}`}
              role="radio" aria-checked={plan === "monthly"} tabIndex={0}
              onClick={() => setPlan("monthly")}
              onKeyDown={(e) => e.key === "Enter" && setPlan("monthly")}
            >
              <div className="top"><span className="radio" /><span className="nm">Monthly</span></div>
              <div className="amt tabular">$39.99 <small>/ month</small></div>
              <div className="note">Full access, billed monthly · cancel anytime</div>
            </div>
          </div>
          {plan === "annual" && (
            <><span className="save">SAVE OVER 55% VS MONTHLY · BILLED ANNUALLY</span><br /></>
          )}
          <button className="btn btn-wide" onClick={checkout} disabled={busy}>
            {busy
              ? "Opening checkout…"
              : plan === "annual"
                ? "Get Insider Access — $199/Year →"
                : "Get Insider Access — $39.99/Month →"}
          </button>
          {err && <div className="err">{err}</div>}
          <p className="under">
            {plan === "annual"
              ? "One payment · Everything included · 30-day money-back guarantee — reports are yours to keep"
              : "Everything included · Cancel anytime · 30-day money-back guarantee"}
          </p>
        </div>
      </div></section>

      {/* 4 · bubbles — REAL multi-year winners from our own price history */}
      {bubbles.length >= 3 && (
        <section><div className="wrap">
          <div className="kicker" style={{ textAlign: "center" }}>The rich get richer</div>
          <h2 style={{ textAlign: "center" }}>They Were Buying. Were You?</h2>
          <div className="bubbles">
            {bubbles.map((b, i) => (
              <div className={`bub ${bubbleSizes[i] || "b4"}`} key={b.sym}>
                <div className="logo" style={{ background: BUBBLE_COLORS[b.sym] || "var(--brand-surface)" }}>
                  {b.sym.slice(0, 2)}
                </div>
                <div className="tk">{b.sym}</div>
                <div className="gain">{fmtGain(b.gainPct)}</div>
                <div className="per">5-YR</div>
              </div>
            ))}
          </div>
          <div className="bub-note">
            Price change over the trailing 5 years{bubbleData?.asOf ? `, as of ${bubbleData.asOf}` : ""} ·
            historical examples of major movers · not alert performance · past results don&rsquo;t guarantee future returns
          </div>
          <p style={{ textAlign: "center", maxWidth: 560, margin: "22px auto 0" }}>
            Behind moves like these, there&rsquo;s a pattern most investors never see:{" "}
            <span className="hl">insiders positioning early — on the public record.</span>{" "}
            <b>Find out what wealthy insiders are doing right now.</b>
          </p>
        </div></section>
      )}

      {/* 5 · knowledge band */}
      <section className="band"><div className="wrap">
        <div className="big">&ldquo;You&rsquo;ll never get closer to insider knowledge than this!&rdquo;</div>
        <h2>100% Legal. 100% Public. Almost Nobody&rsquo;s Watching.</h2>
        <p>
          Insiders must report every purchase to the SEC within days. It&rsquo;s the most honest
          signal in the market — executives betting their own money on their own company. Insider
          Access reads every filing the moment it hits EDGAR and tells you which ones actually matter.
        </p>
        <div className="steps">
          <div className="step"><div className="sn">STEP 01</div><div className="st">We scan every filing</div><div className="sd">4,000+ insider transactions processed daily, 24/7, minutes after they hit the SEC.</div></div>
          <div className="step"><div className="sn">STEP 02</div><div className="st">We score the signal</div><div className="sd">Six factors, one Insider Score — quality separated from noise, automatically.</div></div>
          <div className="step"><div className="sn">STEP 03</div><div className="st">You get the alert</div><div className="sd">High-conviction buys hit your inbox while they&rsquo;re fresh — not weeks later on the news.</div></div>
        </div>
        <p style={{ marginTop: 26 }}>
          <button className="btn" onClick={() => checkout("annual")} disabled={busy}>
            {busy ? "Opening checkout…" : "Get Insider Access — $199/Year →"}
          </button>
        </p>
      </div></section>

      {/* 6 · Harvard study + backtest */}
      <section><div className="wrap">
        <div className="kicker">The landmark study</div>
        <h2>Harvard Research Found Insiders Beat the Market by ~11% a Year</h2>
        <p>
          In a landmark study, Harvard economist Richard Zeckhauser and co-authors Jeng and Metrick
          analyzed decades of insider transactions. The finding: portfolios mimicking insider{" "}
          <b>purchases</b> earned roughly <span className="hl">11% per year above the market</span>.
          Six decades of follow-up research keeps replicating the same result.
        </p>
        <div className="chart-card">
          <div className="chart-title">Growth of $10,000 over 20 years — illustrative backtest of the study&rsquo;s finding</div>
          <svg viewBox="0 0 640 300" width="100%" role="img" aria-label="Line chart comparing hypothetical growth of ten thousand dollars: insider purchase strategy versus market return">
            <line x1="50" y1="20" x2="50" y2="260" stroke="var(--border)" strokeWidth="1" />
            <line x1="50" y1="260" x2="620" y2="260" stroke="var(--border)" strokeWidth="1" />
            <text x="46" y="30" textAnchor="end" fontSize="11" fill="var(--text-mute)">$360K</text>
            <text x="46" y="145" textAnchor="end" fontSize="11" fill="var(--text-mute)">$180K</text>
            <text x="46" y="262" textAnchor="end" fontSize="11" fill="var(--text-mute)">$10K</text>
            <text x="55" y="278" fontSize="11" fill="var(--text-mute)">Yr 0</text>
            <text x="320" y="278" fontSize="11" fill="var(--text-mute)">Yr 10</text>
            <text x="595" y="278" fontSize="11" fill="var(--text-mute)">Yr 20</text>
            <path d="M50,260 C240,252 430,236 620,231" fill="none" stroke="var(--bt-benchmark)" strokeWidth="2.5" />
            <path d="M50,260 C260,250 460,180 620,42" fill="none" stroke="var(--bt-strategy)" strokeWidth="3" />
            <circle cx="620" cy="42" r="4" fill="var(--bt-strategy)" />
            <text x="612" y="34" textAnchor="end" fontSize="12" fontWeight="600" fill="var(--bt-strategy)">$324,000</text>
            <circle cx="620" cy="231" r="4" fill="var(--bt-benchmark)" />
            <text x="612" y="224" textAnchor="end" fontSize="12" fill="var(--text-mute)">$46,600</text>
          </svg>
          <div className="legend">
            <span><i className="sw" style={{ background: "var(--bt-strategy)" }} />Insider-purchase strategy (market + ~11%/yr, per study)</span>
            <span><i className="sw" style={{ background: "var(--bt-benchmark)" }} />Market return (~8%/yr)</span>
          </div>
          <p className="chart-note">
            <b>Illustration only.</b> Hypothetical compounding of the academic study&rsquo;s reported
            excess return applied to assumed market returns; not the performance of Insider Access
            alerts or any actual portfolio. Backtested and hypothetical results have inherent
            limitations, are prepared with hindsight, exclude fees and trading costs, and do not
            reflect actual trading. Past performance does not guarantee future results.
          </p>
        </div>
      </div></section>

      {/* 7 · leaderboard — LIVE database rows, names blurred */}
      <section><div className="wrap">
        <div className="kicker">Members-only rankings</div>
        <h2>Not All Insiders Are Worth Following. We Rank Every One.</h2>
        <div className="board">
          <div className="board-head"><span>TOP-RANKED INSIDERS · BY TRACK RECORD</span><span className="live">● LIVE</span></div>
          {topInsiders.length === 0 && (
            <div className="row"><div className="rname"><div className="rl">Loading live rankings…</div></div></div>
          )}
          {topInsiders.map((r) => (
            <div className="row" key={r.name}>
              <div className="ava"><span>{initials(r.name)}</span></div>
              <div className="rname">
                <div className="nm">{r.name}</div>
                <div className="rl">{r.role || "Insider"} · {r.ticker} · {r.trades} profitable filings</div>
              </div>
              <div className="rstat">
                <div className="sr">{Math.round(Number(r.accuracy))}% success</div>
                <div className="ar">${(Number(r.totalValue) / 1e6).toFixed(1)}M deployed</div>
              </div>
              <div className="lock">🔒</div>
            </div>
          ))}
          <div className="board-head" style={{ borderTop: "1px solid var(--border)" }}><span>TOP-RANKED ANALYST FIRMS · BY MEASURED CALLS</span><span className="live">● LIVE</span></div>
          {topFirms.map((f) => (
            <div className="row" key={f.firm}>
              <div className="ava an"><span>{initials(f.firm)}</span></div>
              <div className="rname">
                <div className="nm">{f.firm}</div>
                <div className="rl">{f.mainSector || "Multi-sector"} · {f.scoredRatings} rated calls</div>
              </div>
              <div className="rstat">
                <div className="sr">{Math.round(Number(f.successRate))}% success</div>
                <div className="ar">+{Number(f.avgReturn).toFixed(1)}% avg return</div>
              </div>
              <div className="lock">🔒</div>
            </div>
          ))}
          <div className="board-cta">
            <div className="bc">Names, filings &amp; full histories unlocked for members</div>
            <button className="btn" onClick={() => checkout("annual")} disabled={busy}>
              {busy ? "Opening checkout…" : "Unlock the Full Database →"}
            </button>
          </div>
        </div>
      </div></section>

      {/* 8 · guarantee */}
      <section><div className="wrap guar">
        <div className="badge"><b>30</b><span>DAY GUARANTEE</span></div>
        <div className="gtxt">
          <h2>Try Everything for a Full Month. Risk Nothing.</h2>
          <p>
            Explore every score, every ranked insider, every alert for 30 days. Not for you? One
            email gets a full refund — no questions asked. <b>And the reports are yours to keep.</b>
          </p>
        </div>
      </div></section>

      {/* 9 · close */}
      <section className="band"><div className="wrap">
        <h2>If You&rsquo;re Not on the Inside,<br />You&rsquo;re on the Outside.</h2>
        <p style={{ fontStyle: "italic" }}>The rich get richer because they watch what insiders do — not what pundits say.</p>
        <button className="btn" onClick={() => checkout("annual")} disabled={busy}>
          {busy ? "Opening checkout…" : "Get Insider Access — $199/Year →"}
        </button>
        <p className="under" style={{ color: "#9db9c9" }}>Over 55% off · All special reports free · 30-day money-back guarantee</p>
      </div></section>

      {/* legal */}
      <div className="wrap legal">
        <p>
          Not investment advice. The Insider Score summarizes publicly available SEC Form 4 filings
          and is provided for informational purposes only. &ldquo;Insider knowledge&rdquo; refers to
          knowledge <i>of insiders&rsquo; publicly disclosed transactions</i>, not material non-public
          information. Ticker examples shown are historical large movers presented for illustration
          and are not representative of alerts issued by this service. Success rates and returns
          shown reflect measured historical performance of past filings and calls in our database
          and do not guarantee future results. Hypothetical and backtested illustrations have
          inherent limitations, exclude fees and costs, and do not reflect actual trading. All
          investing involves risk, including possible loss of principal. Always conduct your own
          research and consult a licensed financial professional.{" "}
          <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/disclaimer">Disclaimer</a>
        </p>
      </div>

      {/* sticky checkout bar */}
      {!premium && (
        <div className="sticky-bar" role="complementary" aria-label="Quick checkout">
          <div className="st">Insider Access · full year<br /><b className="tabular">$199</b> · over 55% off + all reports</div>
          <button className="btn" onClick={() => checkout("annual")} disabled={busy}>
            {busy ? "Opening checkout…" : "Get Access →"}
          </button>
        </div>
      )}

      {/* exit-intent / timed popup — email capture for the report bundle */}
      <OptInModal
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        source="premium-exit-reports"
        hidePhone
        headerLabel="Before you go — free bundle"
        promo={{
          eyebrow: "Before you go — free bundle",
          title: "Get ALL Our Special Reports — Including “One Tiny Stock You Should Know About”",
          body: "Top Stocks Insiders Are Buying · Top Stocks Analysts Love · Top Dividend Stocks · plus our current #1 insider cluster buy. Enter your email and we'll send you where to unlock the full bundle.",
          cta: "Send Me the Reports →",
          note: "No spam · Unsubscribe anytime · Your email is never sold",
        }}
        onSubscribed={() => {
          setPopupOpen(false);
          scrollToCheckout();
        }}
      />

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
