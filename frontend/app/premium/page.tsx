"use client";
/* eslint-disable @next/next/no-page-custom-font */
// Subscribe page — client-supplied "Insider Access" design (ALL-IN-ONE v3),
// ported 1:1 with interactivity rebuilt in React and checkout wired to our
// Stripe billing. The design's own nav/footer are omitted (site chrome stays).
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { getAuthToken, useAuth } from "@/lib/auth";
import { usePremium } from "@/components/premium/PremiumContext";
import { LoginModal } from "@/components/LoginModal";

const CSS = String.raw`
/* ── Client spec: LIGHT MODE IS WHITE ─────────────────────────────────────
   The navy hero / alerts / pricing bands read as a 'blue page' in light mode.
   Light mode now paints them white/near-white with ink text; dark mode
   re-asserts the original navy treatment below. Gold accents stay. */
.ia .hero{background:var(--bg);color:var(--ink)}
.ia .hero .stars{display:none}
.ia .hero h1{color:var(--ink)}
.ia .hero .sub{color:var(--body)}
.ia .hero .sub b{color:var(--ink)}
.ia .sparkles li{color:var(--body)}
.ia .sparkles b{color:var(--ink)}
.ia .hero .price-line{color:var(--faint)}
.ia .hero .price-line b{color:var(--gold-dark)}
.ia .btn.ghost{color:var(--ink);border-color:var(--line)}
.ia .btn.ghost:hover{border-color:var(--ink)}
.ia .alerts-band{background:var(--bg-alt);color:var(--ink)}
.ia .alerts-band h2{color:var(--ink)}
.ia .alerts-band .lede{color:var(--body)}
.ia .alerts-band .lede b{color:var(--gold-dark)}
.ia .vfeat{color:var(--body)}
.ia .vfeat b{color:var(--ink)}
.ia .vfeat .vword{color:var(--gold-dark)}
.ia .pricing{background:var(--bg)}
.ia .pricing .sec-head h2{color:var(--ink)}
.ia .pricing .sec-head p{color:var(--body)}
.ia .pricing .sec-head .kicker{color:var(--faint)!important}
.ia .plan{border:1px solid var(--line)}
.ia .guarantee{background:var(--bg-alt);border:1px solid var(--line)}
.ia .guarantee h3{color:var(--ink)}
.ia .guarantee p{color:var(--body)}
.ia .guarantee p b{color:var(--ink)!important}
.ia .closer .big-line{color:var(--ink)}
.ia .closer .echo{color:var(--faint)}
.ia .pay-zone .g-line{color:var(--body)}
.ia .pay-zone p{color:var(--body)!important}
.ia .pricing > .wrap > p{color:var(--faint)!important}

/* Dark mode: restore the navy chrome for the same bands */
[data-theme="dark"] .ia .hero{background:linear-gradient(180deg,#0A1730 0%,#0B1B3A 55%,#16294F 100%);color:#fff}
[data-theme="dark"] .ia .hero .stars{display:block}
[data-theme="dark"] .ia .hero h1{color:#fff}
[data-theme="dark"] .ia .hero .sub{color:#C4CEE2}
[data-theme="dark"] .ia .hero .sub b{color:#fff}
[data-theme="dark"] .ia .sparkles li{color:#EAEEF6}
[data-theme="dark"] .ia .sparkles b{color:#fff}
[data-theme="dark"] .ia .hero .price-line{color:#9FB0CE}
[data-theme="dark"] .ia .hero .price-line b{color:#F5B942}
[data-theme="dark"] .ia .btn.ghost{color:#fff;border-color:#3A5384}
[data-theme="dark"] .ia .alerts-band{background:linear-gradient(135deg,#0A1730,#0B1B3A 60%,#122650);color:#fff}
[data-theme="dark"] .ia .alerts-band h2{color:#fff}
[data-theme="dark"] .ia .alerts-band .lede{color:#C4CEE2}
[data-theme="dark"] .ia .alerts-band .lede b{color:#F5B942}
[data-theme="dark"] .ia .vfeat{color:#C4CEE2}
[data-theme="dark"] .ia .vfeat b{color:#fff}
[data-theme="dark"] .ia .vfeat .vword{color:#F5B942}
[data-theme="dark"] .ia .pricing{background:#0B1B3A}
[data-theme="dark"] .ia .pricing .sec-head h2{color:#fff}
[data-theme="dark"] .ia .pricing .sec-head p{color:#B9C5DC}
[data-theme="dark"] .ia .pricing .sec-head .kicker{color:#8DA0C4!important}
[data-theme="dark"] .ia .plan{border:none}
[data-theme="dark"] .ia .guarantee{background:#122650;border:1px solid #24406F}
[data-theme="dark"] .ia .guarantee h3{color:#fff}
[data-theme="dark"] .ia .guarantee p{color:#B9C5DC}
[data-theme="dark"] .ia .guarantee p b{color:#fff!important}
[data-theme="dark"] .ia .closer .big-line{color:#fff}
[data-theme="dark"] .ia .closer .echo{color:#8DA0C4}
[data-theme="dark"] .ia .pay-zone .g-line{color:#B9C5DC}
[data-theme="dark"] .ia .pay-zone p{color:#9FB0CE!important}
[data-theme="dark"] .ia .pricing > .wrap > p{color:#8DA0C4!important}

/* Theme awareness (client): light mode = pure white page; dark mode maps the
   design onto the site's dark header/footer palette. Navy hero/pricing/ribbon
   sections already read as dark chrome in both themes. */
.ia{background:var(--bg)}
[data-theme="dark"] .ia{
  --bg:#050a18;--bg-alt:#0c1428;--ink:#f0f4fa;--body:#c9d3e3;--faint:#8794ab;--line:#1f2c45;
}
[data-theme="dark"] .ia .tool,
[data-theme="dark"] .ia .why-card,
[data-theme="dark"] .ia .iq-def,
[data-theme="dark"] .ia .pstep,
[data-theme="dark"] .ia .iq-item,
[data-theme="dark"] .ia .strat,
[data-theme="dark"] .ia .wchip,
[data-theme="dark"] .ia .faq details{background:#0c1428;box-shadow:none}
[data-theme="dark"] .ia .strat .hchip{background:#182338;color:#c9d3e3;border-color:#1f2c45}
[data-theme="dark"] .ia .strat .code{background:#182338;border-color:#3a3320}
[data-theme="dark"] .ia .sticky-cta{background:#0c1428;border-color:#1f2c45}
[data-theme="dark"] .ia .sticky-cta .p{color:#f0f4fa}
[data-theme="dark"] .ia .bundle{background:#0c1428;border-color:#1f2c45}
[data-theme="dark"] .ia .trust-strip{background:#0c1428;border-color:#1f2c45}
[data-theme="dark"] .ia .radar-alert{background:#0c1428;color:#c9d3e3}
[data-theme="dark"] .ia .radar-alert b{color:#f0f4fa}

/* Bundle strip enrichment — larger covers, spread layout, gold CTA */
.ia .bundle{padding:30px 0}
.ia .bundle .row{justify-content:center;gap:44px;align-items:center}
.ia .mcov{width:92px;height:124px;border-radius:10px;padding:12px 8px 9px}
.ia .mcov .b{font-size:.56rem}
.ia .mcov .m{font-size:.7rem}
.ia .mcov .f{font-size:.44rem}
.ia .mc4 .star{font-size:.6rem;padding:3px 10px;top:-10px;right:-10px}
.ia .bundle .label b{font-size:1.25rem;margin-bottom:4px}
.ia .bundle .label span{font-size:.9rem}
.ia .bundle-ticks{list-style:none;margin:10px 0 0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:5px 22px}
.ia .bundle-ticks li{font-size:.82rem;color:var(--ink);font-weight:600}
.ia .btn.bundle-cta{padding:.85rem 1.6rem;font-size:.95rem;white-space:nowrap;flex:0 0 auto}
@media (max-width:920px){.ia .bundle .row{flex-direction:column;gap:20px}.ia .bundle .label{text-align:center}.ia .bundle-ticks{text-align:left}}
.ia{
    --navy:#0B1B3A;--navy-2:#122650;--ink:#101828;--body:#475467;--faint:#98A2B3;
    --line:#EAECF0;--bg:#FFFFFF;--bg-alt:#F7F9FC;--gold:#F5B942;--gold-dark:#B07E1C;
    --blue:#1D4ED8;--gain:#12B76A;--urgent:#D92D20;--max:1140px;--radius:14px;
  }.ia, .ia *{margin:0;padding:0;box-sizing:border-box}.ia{font-family:'Inter',system-ui,sans-serif;color:var(--body);background:var(--bg);font-size:1rem;line-height:1.65;-webkit-font-smoothing:antialiased}.ia ::selection{background:var(--gold);color:var(--navy)}.ia .wrap{max-width:var(--max);margin:0 auto;padding:0 24px}.ia h1, .ia h2, .ia h3{font-family:'Archivo',sans-serif;color:var(--ink);letter-spacing:-.015em;line-height:1.12}.ia h1{font-weight:900;font-size:clamp(2.1rem,4.8vw,3.4rem)}.ia h2{font-weight:800;font-size:clamp(1.6rem,3vw,2.3rem)}.ia h3{font-weight:700;font-size:1.08rem}.ia .kicker{display:block;font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.22em;text-transform:uppercase;color:var(--faint);font-weight:600;margin-bottom:.6rem}.ia .gold-t{color:var(--gold)}.ia .btn{display:inline-flex;align-items:center;justify-content:center;gap:.5em;font-family:'Archivo',sans-serif;font-weight:800;font-size:1rem;background:var(--gold);color:var(--navy);padding:1rem 2rem;border-radius:10px;text-decoration:none;border:none;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}.ia .btn:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(245,185,66,.4)}.ia .btn:focus-visible{outline:3px solid var(--navy);outline-offset:3px}.ia .btn.navy{background:var(--navy);color:#fff}.ia .btn.navy:hover{box-shadow:0 10px 26px rgba(11,27,58,.35)}.ia .btn.ghost{background:transparent;color:#fff;border:1.5px solid #3A5384}.ia .btn.ghost:hover{box-shadow:none;border-color:#fff}.ia .cta-micro{display:block;margin-top:.7rem;font-family:'IBM Plex Mono',monospace;font-size:.68rem;color:var(--faint);letter-spacing:.05em}.ia .sec-cta{text-align:center;margin-top:2.6rem}.ia .txt-cta{color:var(--gold-dark);font-weight:700;text-decoration:none;border-bottom:2px solid var(--gold);padding-bottom:1px}.ia .txt-cta:hover{color:var(--ink)}.ia section{padding:80px 0}.ia .sec-head{text-align:center;max-width:740px;margin:0 auto 3rem}.ia .sec-head h2{margin-bottom:.8rem}.ia .alt{background:var(--bg-alt)}.ia /* ribbon + bundle strip */
  .ribbon{background:var(--navy);color:#fff;text-align:center;padding:11px 18px;font-weight:700;font-size:.92rem}.ia .ribbon b, .ia .ribbon .zap{color:var(--gold)}.ia .ribbon .timer{font-family:'IBM Plex Mono',monospace;font-weight:600;color:var(--gold);font-variant-numeric:tabular-nums}.ia .bundle{background:var(--bg-alt);border-bottom:1px solid var(--line);padding:22px 0}.ia .bundle .row{display:flex;align-items:center;justify-content:center;gap:22px;flex-wrap:wrap}.ia .bundle .label{text-align:center}.ia .bundle .label b{display:block;font-family:'Archivo',sans-serif;font-weight:900;color:var(--ink);font-size:1.1rem}.ia .bundle .label span{font-size:.84rem}.ia .bundle .label .free{color:var(--gain);font-weight:800}.ia .mini-covers{display:flex;gap:10px}.ia .mcov{width:60px;height:80px;border-radius:7px;position:relative;display:flex;flex-direction:column;justify-content:space-between;padding:8px 5px 6px;color:#fff;text-align:center;box-shadow:0 10px 22px rgba(16,24,40,.18),inset 0 0 0 1px rgba(255,255,255,.18)}.ia .mcov::before{content:"";position:absolute;top:0;bottom:0;left:0;width:4px;background:rgba(255,255,255,.2);border-radius:7px 0 0 7px}.ia .mcov .b{font-family:'Archivo',sans-serif;font-weight:900;font-size:.38rem;line-height:1.15}.ia .mcov .m{font-family:'Archivo',sans-serif;font-weight:800;font-size:.47rem;line-height:1.2}.ia .mcov .f{font-family:'IBM Plex Mono',monospace;font-size:.3rem;letter-spacing:.18em;opacity:.85}.ia .mc1{background:linear-gradient(150deg,#6D5BF0,#7C3AED)}.ia .mc2{background:linear-gradient(150deg,#16295E,#1D4ED8)}.ia .mc3{background:linear-gradient(150deg,#2E9E6B,#5FBF8F)}.ia .mc4{background:linear-gradient(150deg,#B0622A,#C97E35)}.ia .mc4 .star{position:absolute;top:-8px;right:-8px;background:var(--gold);color:var(--navy);font-size:.48rem;font-weight:800;border-radius:999px;padding:2px 7px;box-shadow:0 4px 8px rgba(16,24,40,.2)}.ia /* nav */
  .nav{position:sticky;top:0;z-index:60;background:rgba(255,255,255,.93);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}.ia .nav .wrap{display:flex;align-items:center;gap:24px;height:64px}.ia .brand{font-family:'Archivo',sans-serif;font-weight:900;font-size:1.12rem;color:var(--ink);text-decoration:none}.ia .brand span{color:var(--gold-dark)}.ia .nav a.link{font-size:.88rem;font-weight:600;color:var(--body);text-decoration:none}.ia .nav a.link:hover{color:var(--ink)}.ia .nav .spacer{flex:1}.ia .nav .btn{padding:.58rem 1.25rem;font-size:.86rem}@media (max-width:760px){.ia .nav a.link{display:none}}.ia /* hero — screenshot-style: left-aligned, .ia bold, .ia sparkle bullets */
  .hero{position:relative;background:linear-gradient(180deg,#0A1730 0%,var(--navy) 55%,#16294F 100%);color:#fff;padding:96px 0 0;overflow:hidden;text-align:left}.ia .hero .stars{position:absolute;inset:0;background-image:radial-gradient(1.2px 1.2px at 12% 18%,rgba(255,255,255,.5),transparent),radial-gradient(1px 1px at 34% 9%,rgba(255,255,255,.4),transparent),radial-gradient(1.4px 1.4px at 58% 22%,rgba(255,255,255,.45),transparent),radial-gradient(1px 1px at 76% 12%,rgba(255,255,255,.4),transparent),radial-gradient(1.2px 1.2px at 90% 26%,rgba(255,255,255,.35),transparent);pointer-events:none}.ia .hero .wrap{position:relative;z-index:2;max-width:1000px}.ia .hero h1{color:#fff;margin-bottom:1.4rem;max-width:840px}.ia .hero .eyebrow{display:inline-block;font-family:'IBM Plex Mono',monospace;font-size:.72rem;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);font-weight:600;margin-bottom:1.2rem}.ia .hero .sub{max-width:660px;margin:0 0 2rem;color:#C4CEE2;font-size:clamp(1.1rem,2.2vw,1.4rem)}.ia .hero .sub b{color:#fff;font-weight:800}.ia .boost{display:inline-block;font-family:'Archivo',sans-serif;font-weight:900;font-size:clamp(1rem,2vw,1.3rem);letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin-bottom:1rem;border-bottom:3px solid var(--gold);padding-bottom:6px}.ia .you-will{display:block;font-family:'Archivo',sans-serif;font-weight:900;font-size:1.02rem;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin-bottom:.6rem}.ia .sparkles{list-style:none;margin:0 0 2.2rem;padding:0;max-width:640px}.ia .sparkles li{display:flex;align-items:flex-start;gap:15px;font-size:clamp(1rem,1.9vw,1.18rem);color:#EAEEF6;font-weight:500;padding:8px 0}.ia .sparkles .sp{flex:0 0 auto;color:var(--gold);font-size:1.25em;line-height:1.2;transform:translateY(-1px)}.ia .sparkles b{color:#fff;font-weight:800}.ia .hero .cta-row{display:flex;gap:14px;justify-content:flex-start;flex-wrap:wrap;margin-bottom:1rem}.ia .hero .price-line{font-family:'IBM Plex Mono',monospace;font-size:.8rem;color:#9FB0CE;letter-spacing:.05em}.ia .hero .price-line b{color:var(--gold)}.ia .skyline{position:relative;z-index:1;display:block;width:100%;margin-top:52px}.ia .skyline svg{display:block;width:100%;height:auto}.ia /* toolkit */
  .toolkit-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.ia .tool{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:26px 24px;box-shadow:0 1px 3px rgba(16,24,40,.05);transition:box-shadow .18s ease,transform .18s ease}.ia .tool:hover{transform:translateY(-3px);box-shadow:0 12px 28px rgba(16,24,40,.1)}.ia .tool .ico{width:42px;height:42px;border-radius:10px;background:var(--navy);color:var(--gold);display:flex;align-items:center;justify-content:center;font-family:'Archivo',sans-serif;font-weight:900;margin-bottom:14px}.ia .tool h3{margin-bottom:.45rem}.ia .tool p{font-size:.89rem;line-height:1.6}@media (max-width:920px){.ia .toolkit-grid{grid-template-columns:1fr}}.ia /* why */
  .why-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.ia .why-card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:28px 26px;display:flex;flex-direction:column;box-shadow:0 1px 3px rgba(16,24,40,.05)}.ia .why-card .k{font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-dark);margin-bottom:12px;font-weight:600}.ia .why-card .big{font-family:'Archivo',sans-serif;font-weight:900;font-size:2.4rem;line-height:1;color:var(--gain);margin-bottom:10px}.ia .why-card h3{margin-bottom:.5rem}.ia .why-card p{font-size:.89rem;line-height:1.62;flex:1}.ia .why-card .src{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-family:'IBM Plex Mono',monospace;font-size:.6rem;color:var(--faint);letter-spacing:.06em}.ia .quote-card{background:var(--navy);border-color:var(--navy)}.ia .quote-card .k{color:var(--gold)}.ia .quote-card blockquote{font-family:'Archivo',sans-serif;font-weight:700;font-size:1.24rem;line-height:1.4;color:#fff;flex:1}.ia .quote-card p{color:#B9C5DC}.ia .quote-card .src{color:#7183A6;border-color:#243A66}.ia .winner-strip{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:2.4rem}.ia .wchip{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);border-radius:999px;padding:7px 14px;font-family:'IBM Plex Mono',monospace;font-size:.74rem;font-weight:600;color:var(--ink)}.ia .wchip .up{color:var(--gain)}.ia .strip-note{text-align:center;font-family:'IBM Plex Mono',monospace;font-size:.62rem;color:var(--faint);margin-top:1rem;letter-spacing:.03em}@media (max-width:920px){.ia .why-grid{grid-template-columns:1fr}}.ia /* IQ score merged section */
  .iq-def{max-width:740px;margin:0 auto 2.6rem;text-align:center;background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:26px 30px;box-shadow:0 1px 3px rgba(16,24,40,.05)}.ia .iq-def .score-pill{display:inline-flex;align-items:center;gap:10px;font-family:'Archivo',sans-serif;font-weight:900;margin-bottom:10px}.ia .iq-def .score-pill .n{background:var(--gain);color:#fff;border-radius:10px;padding:6px 14px;font-size:1.4rem}.ia .iq-def .score-pill .t{font-size:1.15rem;color:var(--ink)}.ia .iq-def p{font-size:.95rem}.ia .pipeline{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:2.6rem;counter-reset:step}.ia .pstep{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 18px 16px;box-shadow:0 1px 3px rgba(16,24,40,.05);font-size:.82rem;line-height:1.55}.ia .pstep::before{counter-increment:step;content:"0" counter(step);font-family:'Archivo',sans-serif;font-weight:900;font-size:1.4rem;color:transparent;-webkit-text-stroke:1.3px var(--gold-dark);display:block;margin-bottom:8px}.ia .pstep b{display:block;color:var(--ink);font-family:'Archivo',sans-serif;font-size:.92rem;margin-bottom:3px}.ia .iq-bar{display:flex;height:50px;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(16,24,40,.12);margin-bottom:22px}.ia .iq-seg{display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-size:.58rem;font-weight:600;letter-spacing:.08em;color:#fff;white-space:nowrap;overflow:hidden}.ia .sg1{background:#0B1B3A}.ia .sg2{background:#16294F}.ia .sg3{background:#1D4ED8}.ia .sg4{background:#B07E1C}.ia .sg5{background:#F5B942;color:var(--navy)}.ia .sg6{background:#98A2B3}.ia .iq-legend{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.ia .iq-item{display:flex;gap:11px;align-items:flex-start;background:#fff;border:1px solid var(--line);border-radius:12px;padding:15px 16px;box-shadow:0 1px 3px rgba(16,24,40,.05)}.ia .iq-item .sw{flex:0 0 auto;width:13px;height:13px;border-radius:4px;margin-top:4px}.ia .iq-item b{display:block;color:var(--ink);font-size:.86rem;font-family:'Archivo',sans-serif}.ia .iq-item p{font-size:.78rem;line-height:1.5}.ia .iq-note{text-align:center;font-family:'IBM Plex Mono',monospace;font-size:.64rem;color:var(--faint);margin-top:1.4rem;letter-spacing:.03em}.ia .one-score{max-width:660px;margin:2.4rem auto 0;text-align:center;font-family:'Archivo',sans-serif;font-weight:800;font-size:clamp(1.15rem,2.4vw,1.5rem);color:var(--ink);line-height:1.35}.ia .one-score .gold-t{color:var(--gold-dark)}@media (max-width:920px){.ia .pipeline{grid-template-columns:1fr 1fr}.ia .iq-legend{grid-template-columns:1fr}}@media (max-width:560px){.ia .pipeline{grid-template-columns:1fr}}.ia /* strategies */
  .strat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.ia .strat{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:22px;box-shadow:0 1px 3px rgba(16,24,40,.05);display:flex;flex-direction:column;gap:12px;transition:box-shadow .18s ease,transform .18s ease}.ia .strat:hover{transform:translateY(-3px);box-shadow:0 12px 28px rgba(16,24,40,.1)}.ia .strat .code{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:.66rem;letter-spacing:.14em;color:var(--gold-dark);background:#FFF7E6;border:1px solid #F5DFA8;padding:4px 10px;border-radius:6px;align-self:flex-start}.ia .strat h3{font-size:1.02rem;line-height:1.25}.ia .strat .desc{font-size:.84rem;line-height:1.58;flex:1}.ia .strat .specs{display:grid;grid-template-columns:1fr 1fr;gap:7px;border-top:1px solid var(--line);padding-top:11px}.ia .strat .specs div{font-size:.7rem}.ia .strat .specs b{display:block;font-family:'IBM Plex Mono',monospace;font-size:.54rem;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600}.ia .strat .specs span{color:var(--ink);font-weight:600}.ia .strat .holdings{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.ia .strat .hchip{font-family:'IBM Plex Mono',monospace;font-size:.6rem;font-weight:600;color:var(--ink);background:var(--bg-alt);border:1px solid var(--line);padding:3px 8px;border-radius:6px;filter:blur(3.5px);user-select:none}.ia .strat .hlock{font-family:'IBM Plex Mono',monospace;font-size:.58rem;color:#7C3AED;letter-spacing:.06em}@media (max-width:920px){.ia .strat-grid{grid-template-columns:1fr}}.ia /* alerts band */
  .alerts-band{background:linear-gradient(135deg,#0A1730,var(--navy) 60%,#122650);color:#fff}.ia .alerts-band .grid2{display:grid;grid-template-columns:1.05fr .95fr;gap:52px;align-items:center}.ia .alerts-band h2{color:#fff}.ia .alerts-band .lede{color:#C4CEE2;font-size:1.05rem;margin:1.1rem 0 1.6rem}.ia .alerts-band .lede b{color:var(--gold)}.ia .radar-stage{position:relative;display:flex;justify-content:center}.ia .radar{position:relative;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,#122650 0%,#0C1B3A 70%);border:1px solid #24406F;box-shadow:0 0 0 12px rgba(36,64,111,.25),0 24px 60px rgba(0,0,0,.4);overflow:hidden}.ia .radar::before{content:"";position:absolute;inset:0;border-radius:50%;background:repeating-radial-gradient(circle at center,transparent 0 37px,rgba(78,120,190,.25) 37px 38px)}.ia .radar::after{content:"";position:absolute;left:50%;top:50%;width:1px;height:100%;background:rgba(78,120,190,.25);transform:translate(-50%,-50%)}.ia .radar .h-line{position:absolute;top:50%;left:0;right:0;height:1px;background:rgba(78,120,190,.25)}.ia .sweep{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,rgba(245,185,66,.4),transparent 70deg);animation:spin 4s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.ia .blip{position:absolute;width:9px;height:9px;border-radius:50%;background:var(--gold);box-shadow:0 0 12px rgba(245,185,66,.9)}.ia .blip.b1{top:30%;left:62%}.ia .blip.b2{top:58%;left:34%}.ia .blip.b3{top:70%;left:66%;width:6px;height:6px;opacity:.7}.ia .radar-alert{position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);width:264px;background:#fff;border-radius:10px;padding:12px 14px;box-shadow:0 18px 40px rgba(0,0,0,.45);font-family:'IBM Plex Mono',monospace;font-size:.65rem;color:var(--body);line-height:1.55;text-align:left}.ia .radar-alert b{color:var(--ink)}.ia .radar-alert .t{color:var(--gain);font-weight:600}.ia .vrow{display:flex;flex-direction:column;gap:12px}.ia .vfeat{display:flex;gap:12px;align-items:flex-start;font-size:.92rem;color:#C4CEE2}.ia .vfeat .vword{flex:0 0 92px;font-family:'Archivo',sans-serif;font-weight:900;color:var(--gold);letter-spacing:.03em;font-size:.95rem;margin-top:1px}.ia .vfeat b{color:#fff}@media (max-width:920px){.ia .alerts-band .grid2{grid-template-columns:1fr;gap:70px}}.ia /* members also get */
  .mag-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center}.ia .mag-grid .q{font-family:'Archivo',sans-serif;font-weight:800;font-size:clamp(1.2rem,2.4vw,1.6rem);color:var(--ink);line-height:1.3;margin-bottom:1rem}.ia .mag-grid .q::before{content:"Q · ";font-family:'IBM Plex Mono',monospace;font-size:.78rem;letter-spacing:.14em;color:var(--gold-dark);font-weight:600}.ia .iv-card{background:var(--navy);border-radius:var(--radius);padding:24px;color:#C4CEE2;font-size:.9rem;line-height:1.7;box-shadow:0 20px 44px rgba(11,27,58,.3)}.ia .iv-card .who{display:flex;align-items:center;gap:12px;margin-bottom:14px}.ia .iv-ava{width:42px;height:42px;border-radius:50%;background-color:#39558E;border:1px solid #4A66A6;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='37' r='17' fill='%23DDE4F0' opacity='.92'/%3E%3Cpath d='M50 58c-19 0-31 11-33 28l-1 14h68l-1-14c-2-17-14-28-33-28z' fill='%23DDE4F0' opacity='.92'/%3E%3C/svg%3E");background-size:cover}.ia .iv-card .who b{display:block;color:#fff;font-size:.84rem;font-family:'Archivo',sans-serif}.ia .iv-card .who span{font-size:.66rem;color:#8DA0C4;font-family:'IBM Plex Mono',monospace}.ia .iv-card .ans b{color:#fff}.ia .extras{margin-top:1.8rem;display:flex;flex-direction:column;gap:10px}.ia .extra{display:flex;gap:12px;align-items:flex-start;font-size:.92rem}.ia .extra .tick{color:var(--gain);font-weight:800;flex:0 0 auto}.ia .extra b{color:var(--ink)}@media (max-width:920px){.ia .mag-grid{grid-template-columns:1fr;gap:34px}}.ia /* trust strip */
  .trust-strip{background:var(--bg-alt);border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:34px 0}.ia .trust-strip .row{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;text-align:center}.ia .trust-strip b{display:block;font-family:'Archivo',sans-serif;font-weight:800;color:var(--ink);font-size:.92rem;margin-bottom:3px}.ia .trust-strip span{font-size:.78rem;color:var(--body);line-height:1.5;display:block}@media (max-width:920px){.ia .trust-strip .row{grid-template-columns:1fr 1fr}}.ia /* pricing */
  .pricing{background:var(--navy);color:#fff}.ia .pricing .sec-head h2{color:#fff}.ia .pricing .sec-head p{color:#B9C5DC}.ia .plans{display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:780px;margin:0 auto 36px}.ia .plan{background:#fff;border-radius:var(--radius);padding:32px 28px;text-align:center;color:var(--body)}.ia .plan .name{font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:var(--faint);font-weight:600;display:block;margin-bottom:10px}.ia .plan .price{font-family:'Archivo',sans-serif;font-weight:900;font-size:2.8rem;color:var(--ink);line-height:1}.ia .plan .price small{font-size:1rem;color:var(--faint)}.ia .plan .save{display:inline-block;margin-top:10px;background:#ECFDF3;color:var(--gain);font-size:.75rem;font-weight:700;padding:4px 12px;border-radius:999px}.ia .plan .per{display:block;margin-top:8px;font-family:'IBM Plex Mono',monospace;font-size:.72rem;color:var(--faint)}.ia .plan .btn{width:100%;margin-top:18px}.ia /* selectable plan cards */
  .plan.pick{cursor:pointer;transition:outline-color .15s ease,box-shadow .15s ease;text-align:left}.ia .plan.pick .top{display:flex;align-items:center;gap:12px;margin-bottom:10px}.ia .plan.pick .radio{width:22px;height:22px;border-radius:50%;border:2px solid var(--line);flex:0 0 auto;position:relative}.ia .plan.pick.sel{outline:3px solid var(--gold)}.ia .plan.pick.sel .radio{border-color:var(--gold-dark)}.ia .plan.pick.sel .radio::after{content:"";position:absolute;inset:4px;border-radius:50%;background:var(--gold)}.ia .plan.pick .nm{font-family:'Archivo',sans-serif;font-weight:900;color:var(--ink);font-size:1.05rem}.ia .plan.pick .badge{margin-left:auto;background:#ECFDF3;color:var(--gain);font-size:.7rem;font-weight:800;padding:4px 11px;border-radius:999px;white-space:nowrap}.ia .plan.pick .strike{color:var(--faint);text-decoration:line-through;font-size:.92rem;font-weight:600}.ia .pay-zone{text-align:center;max-width:780px;margin:0 auto 34px}.ia .pay-zone .btn{width:100%;max-width:440px;font-size:1.15rem;padding:1.1rem 2rem}.ia .pay-zone .g-line{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:14px;font-size:.88rem;font-weight:600;color:#B9C5DC}.ia .pay-zone .g-line .shield{color:var(--gain)}.ia .plan.best{outline:3px solid var(--gold);position:relative}.ia .plan.best::before{content:"BEST VALUE";position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:var(--gold);color:var(--navy);font-family:'IBM Plex Mono',monospace;font-size:.6rem;font-weight:600;letter-spacing:.16em;padding:5px 14px;border-radius:999px}.ia .plan .bundle-line{margin-top:12px;font-size:.76rem;color:var(--gold-dark);font-weight:600}.ia .guarantee{display:flex;gap:22px;align-items:center;max-width:780px;margin:0 auto;background:var(--navy-2);border:1px solid #24406F;border-radius:var(--radius);padding:24px 26px}.ia .g-badge{flex:0 0 auto;width:80px;height:80px;border-radius:50%;background:var(--gold);color:var(--navy);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Archivo',sans-serif;font-weight:900;line-height:1;box-shadow:0 0 0 6px rgba(245,185,66,.2)}.ia .g-badge b{font-size:1.4rem}.ia .g-badge span{font-size:.48rem;letter-spacing:.12em;margin-top:3px}.ia .guarantee h3{color:#fff;margin-bottom:.3rem}.ia .guarantee p{color:#B9C5DC;font-size:.88rem}.ia .closer{max-width:640px;margin:3rem auto 0;text-align:center}.ia .closer .big-line{font-family:'Archivo',sans-serif;font-weight:900;font-size:clamp(1.4rem,3vw,2rem);color:#fff;line-height:1.2;margin-bottom:.6rem}.ia .closer .echo{color:#8DA0C4;font-style:italic;font-size:.98rem}@media (max-width:760px){.ia .plans{grid-template-columns:1fr}.ia .guarantee{flex-direction:column;text-align:center}}.ia /* comparison */
  .cmp-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 1px 3px rgba(16,24,40,.05)}.ia table.cmp{width:100%;border-collapse:collapse;background:#fff;min-width:620px}.ia .cmp th, .ia .cmp td{padding:13px 18px;text-align:left;border-bottom:1px solid var(--line);font-size:.9rem}.ia .cmp thead th{background:var(--navy);color:#fff;font-family:'Archivo',sans-serif;font-weight:700}.ia .cmp thead th small{display:block;font-family:'IBM Plex Mono',monospace;font-weight:400;font-size:.64rem;color:#9FB0CE;margin-top:2px}.ia .cmp td:nth-child(2), .ia .cmp td:nth-child(3), .ia .cmp th:nth-child(2), .ia .cmp th:nth-child(3){text-align:center;white-space:nowrap}.ia .cmp .cat td{background:var(--bg-alt);font-family:'IBM Plex Mono',monospace;font-size:.64rem;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);font-weight:600;padding:9px 18px}.ia .yes{color:var(--gain);font-weight:800;font-size:1.02rem}.ia .no{color:#D0D5DD;font-weight:700}.ia .cmp .feat{color:var(--ink);font-weight:600}.ia .cmp .feat small{display:block;font-weight:400;color:var(--faint);font-size:.76rem;margin-top:1px}.ia /* FAQ */
  .faq{max-width:820px;margin:0 auto}.ia .faq details{background:#fff;border:1px solid var(--line);border-radius:12px;margin-bottom:12px;box-shadow:0 1px 3px rgba(16,24,40,.05)}.ia .faq summary{cursor:pointer;list-style:none;padding:18px 22px;font-family:'Archivo',sans-serif;font-weight:700;color:var(--ink);font-size:.98rem;display:flex;justify-content:space-between;align-items:center;gap:14px}.ia .faq summary::-webkit-details-marker{display:none}.ia .faq summary::after{content:"+";font-weight:800;color:var(--gold-dark);font-size:1.3rem;transition:transform .2s ease}.ia .faq details[open] summary::after{transform:rotate(45deg)}.ia .faq .a{padding:0 22px 20px;font-size:.92rem;line-height:1.7}.ia footer{background:var(--navy);color:#7183A6;padding:44px 0 100px}.ia footer .brand{color:#fff;display:inline-block;margin-bottom:12px}.ia footer p{font-size:.78rem;line-height:1.7;max-width:860px}.ia footer p+p{margin-top:.8em}.ia /* sticky mobile CTA */
  .sticky-cta{position:fixed;bottom:0;left:0;right:0;z-index:70;background:#fff;border-top:1px solid var(--line);box-shadow:0 -8px 30px rgba(16,24,40,.12);padding:10px 16px;display:none;align-items:center;justify-content:space-between;gap:12px}.ia .sticky-cta .p{font-family:'Archivo',sans-serif;font-weight:800;color:var(--ink);font-size:.9rem;line-height:1.2}.ia .sticky-cta .p small{display:block;font-family:'IBM Plex Mono',monospace;font-weight:400;font-size:.62rem;color:var(--faint)}.ia .sticky-cta .btn{padding:.7rem 1.3rem;font-size:.88rem;white-space:nowrap}@media (max-width:760px){.ia .sticky-cta{display:flex}}.ia /* ===== reports popup ===== */
  .lto-overlay{position:fixed;inset:0;z-index:1000;background:rgba(10,15,28,.55);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .3s ease}.ia .lto-overlay.open{opacity:1;pointer-events:auto}.ia .lto{background:#fff;border-radius:18px;max-width:720px;width:100%;max-height:calc(100vh - 40px);overflow-y:auto;position:relative;box-shadow:0 40px 120px rgba(10,15,28,.4);transform:translateY(24px) scale(.97);transition:transform .35s cubic-bezier(.2,.9,.3,1.1)}.ia .lto-overlay.open .lto{transform:translateY(0) scale(1)}.ia .lto-close{position:absolute;top:14px;right:14px;z-index:5;width:36px;height:36px;border-radius:50%;border:1px solid var(--line);background:#fff;color:var(--faint);font-size:1.05rem;cursor:pointer;display:flex;align-items:center;justify-content:center}.ia .lto-close:hover{color:var(--ink);border-color:var(--ink)}.ia .lto-strip{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;background:var(--navy);color:#fff;padding:12px 48px;border-radius:18px 18px 0 0;font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.16em;text-transform:uppercase}.ia .lto-timer{color:var(--gold);font-weight:600;font-variant-numeric:tabular-nums}.ia .lto-body{padding:32px 36px 36px;text-align:center}.ia .lto-eyebrow{font-family:'IBM Plex Mono',monospace;font-size:.68rem;letter-spacing:.22em;text-transform:uppercase;color:var(--blue);font-weight:600;display:block;margin-bottom:10px}.ia .lto h2{font-size:clamp(1.4rem,3.2vw,1.9rem);margin:0 auto 12px;max-width:520px}.ia .lto .lead{max-width:520px;margin:0 auto 26px;font-size:.94rem}.ia .lto-covers{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:520px;margin:0 auto 16px}.ia .lcov{aspect-ratio:3/4;border-radius:9px;position:relative;display:flex;flex-direction:column;justify-content:space-between;padding:14px 10px 10px;color:#fff;text-align:center;box-shadow:0 12px 28px rgba(10,15,28,.22),inset 0 0 0 1px rgba(255,255,255,.14)}.ia .lcov::before{content:"";position:absolute;top:0;bottom:0;left:0;width:6px;background:rgba(255,255,255,.18);border-radius:9px 0 0 9px}.ia .lcov .bb{font-family:'Archivo',sans-serif;font-weight:900;font-size:.72rem;line-height:1.15}.ia .lcov .mm b{display:block;font-family:'Archivo',sans-serif;font-weight:800;font-size:.9rem;margin-bottom:4px}.ia .lcov .mm span{font-family:'IBM Plex Mono',monospace;font-size:.44rem;letter-spacing:.28em;opacity:.85}.ia .lcov .ff{font-family:'IBM Plex Mono',monospace;font-size:.44rem;letter-spacing:.24em;opacity:.8}.ia .lcp{background:linear-gradient(150deg,#6D5BF0,#7C3AED)}.ia .lcb{background:linear-gradient(150deg,#16295E,#1D4ED8)}.ia .lcg{background:linear-gradient(150deg,#2E9E6B,#5FBF8F)}.ia .lto-bonus{max-width:520px;margin:0 auto 24px;position:relative;display:flex;align-items:center;gap:14px;text-align:left;background:linear-gradient(150deg,#B0622A,#C97E35);border-radius:12px;padding:15px 16px;color:#fff;box-shadow:0 12px 28px rgba(176,98,42,.35)}.ia .lto-bonus .tag{position:absolute;top:-11px;left:14px;background:var(--gold);color:var(--navy);font-family:'IBM Plex Mono',monospace;font-size:.54rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;padding:4px 11px;border-radius:999px}.ia .lto-bonus .mini{flex:0 0 auto;width:46px;height:60px;border-radius:6px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-family:'Archivo',sans-serif;font-weight:900;font-size:.54rem;line-height:1.15;text-align:center}.ia .lto-bonus b{display:block;font-family:'Archivo',sans-serif;font-size:.94rem}.ia .lto-bonus span{font-size:.76rem;opacity:.92}.ia .lto .value-line{font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:var(--faint);margin-bottom:16px}.ia .lto .value-line b{color:var(--ink)}.ia .lto-dismiss{display:inline-block;margin-top:14px;font-size:.78rem;color:var(--faint);background:none;border:none;cursor:pointer;text-decoration:underline;text-underline-offset:3px}.ia .lto-dismiss:hover{color:var(--ink)}@media (max-width:560px){.ia .lto-body{padding:26px 18px 30px}.ia .lto-strip{font-size:.58rem;padding:10px 44px}}@media (prefers-reduced-motion:reduce){.ia *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}`;

function useCountdown(): string {
  const [left, setLeft] = useState(15 * 60 * 1000);
  useEffect(() => {
    const KEY = "lto_deadline";
    let deadline = Number(sessionStorage.getItem(KEY) || 0);
    if (!deadline) {
      deadline = Date.now() + 15 * 60 * 1000;
      sessionStorage.setItem(KEY, String(deadline));
    }
    const t = setInterval(() => {
      let remain = deadline - Date.now();
      if (remain <= 0) {
        deadline = Date.now() + 15 * 60 * 1000;
        sessionStorage.setItem(KEY, String(deadline));
        remain = deadline - Date.now();
      }
      setLeft(Math.max(0, remain));
    }, 500);
    return () => clearInterval(t);
  }, []);
  const m = Math.floor(left / 60000);
  const sec = Math.floor((left % 60000) / 1000);
  return `${m < 10 ? "0" : ""}${m}:${sec < 10 ? "0" : ""}${sec}`;
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
  const palette: Record<string, { bg: string; bd: string; fg: string }> = {
    success: { bg: "#ECFDF3", bd: "#12B76A", fg: "#087443" },
    syncing: { bg: "#EFF4FF", bd: "#1D4ED8", fg: "#1D4ED8" },
    cancelled: { bg: "#F7F9FC", bd: "#D0D5DD", fg: "#475467" },
    error: { bg: "#FEF3F2", bd: "#D92D20", fg: "#D92D20" },
  };
  const p = palette[state];
  return (
    <div style={{ maxWidth: 760, margin: "18px auto 0", padding: "14px 20px", borderRadius: 12, textAlign: "center", fontWeight: 700, fontSize: 14.5, background: p.bg, border: `1px solid ${p.bd}`, color: p.fg }} role="status">
      {state === "syncing" && "Finalizing your subscription…"}
      {state === "success" && "You're in! Insider Access is active — every paywall is now unlocked."}
      {state === "cancelled" && "Checkout was cancelled — no charge was made."}
      {state === "error" && "We couldn't confirm the payment automatically. If you were charged, refresh in a minute or contact support."}
    </div>
  );
}

export default function PremiumPage() {
  const timer = useCountdown();
  const [lto, setLto] = useState(false);
  const [plan, setPlan] = useState<"annual" | "monthly">("annual");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const { user } = useAuth();
  const { premium } = usePremium();
  const [sub, setSub] = useState<{ plan?: string | null; renewsAt?: string | null } | null>(null);
  const firedRef = useRef(false);

  // Subscriber state — the page must reflect an ACTIVE subscription.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/billing/status`, {
          headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
        });
        const d = await res.json().catch(() => ({}));
        if (alive && res.ok) {
          setSub({ plan: d?.plan, renewsAt: d?.renewsAt });
          if (d?.plan === "monthly") setPlan("monthly");
        }
      } catch { /* banner simply hidden */ }
    })();
    return () => { alive = false; };
  }, [user]);

  // Reports popup: 8s after load OR 40% scroll depth — once per session.
  useEffect(() => {
    if (premium || sessionStorage.getItem("lto_dismissed")) return;
    const tryOpen = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      setLto(true);
    };
    const t = setTimeout(tryOpen, 8000);
    const onScroll = () => {
      const depth = (window.scrollY + window.innerHeight) / document.body.scrollHeight;
      if (depth > 0.4) { tryOpen(); window.removeEventListener("scroll", onScroll); }
    };
    window.addEventListener("scroll", onScroll);
    return () => { clearTimeout(t); window.removeEventListener("scroll", onScroll); };
  }, [premium]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeLto(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeLto = () => {
    setLto(false);
    try { sessionStorage.setItem("lto_dismissed", "1"); } catch { /* ignore */ }
  };
  const claim = () => {
    closeLto();
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
  };

  const checkout = async () => {
    if (busy) return;
    if (!user) { setLoginOpen(true); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${API_BASE}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken() ?? ""}` },
        body: JSON.stringify({ plan }),
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

  return (
    <>
    <div className="ia" style={{ width: "100vw", position: "relative", left: "50%", marginLeft: "-50vw", marginTop: "-2rem", minWidth: 0 }}>
      <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <CheckoutOutcome />
      {premium && (
        <div style={{ maxWidth: 760, margin: "18px auto 0", padding: "14px 20px", borderRadius: 12, textAlign: "center", fontWeight: 700, fontSize: 14.5, background: "#ECFDF3", border: "1px solid #12B76A", color: "#087443" }}>
          You&rsquo;re subscribed{sub?.plan ? ` — ${sub.plan === "annual" ? "Yearly" : "Monthly"} plan` : ""}
          {sub?.renewsAt ? ` · renews ${new Date(sub.renewsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}. Every paywall is unlocked.
        </div>
      )}
      
      <div className="ribbon">
        <span className="zap">⚡</span> <b>LIMITED TIME:</b> 4 free insider reports + our top stock ideas included with every plan · expires in <span className="timer">{timer}</span>
      </div>
      
      
      <div className="bundle">
        <div className="wrap">
          <div className="row">
            <div className="mini-covers" aria-hidden="true">
              <div className="mcov mc1"><div className="b">INSIDER<br/>BUYING</div><div className="m">Top Stocks<br/>Insiders Buy</div><div className="f">2026</div></div>
              <div className="mcov mc2"><div className="b">INSIDER<br/>BUYING</div><div className="m">Top Stocks<br/>Analysts Love</div><div className="f">2026</div></div>
              <div className="mcov mc3"><div className="b">INSIDER<br/>BUYING</div><div className="m">Top Dividend<br/>Stocks</div><div className="f">2026</div></div>
              <div className="mcov mc4"><span className="star">BONUS</span><div className="b">INSIDER<br/>BUYING</div><div className="m">Critical Metals<br/>Stock Idea</div><div className="f">SPECIAL</div></div>
            </div>
            <div className="label" style={{textAlign:"left",maxWidth:520}}>
              <b>Your Free Bundle — 4 Insider Reports, Included Today</b>
              <span>Our top stock ideas that insiders are bullish on — <span className="free">$0 with any plan</span></span>
              <ul className="bundle-ticks">
                <li>✓ Top Stocks Insiders Are Buying</li>
                <li>✓ Top Stocks Analysts Love</li>
                <li>✓ Top Dividend Stocks</li>
                <li>✓ Bonus: Critical Metals Stock Idea</li>
              </ul>
            </div>
            <button className="btn bundle-cta" onClick={() => setLto(true)}>See what&rsquo;s inside →</button>
          </div>
        </div>
      </div>
      
      
      <header className="hero" id="top">
        <div className="stars" aria-hidden="true"></div>
        <div className="wrap">
          <span className="boost">Give Your Portfolio the Insider Boost</span>
          <h1>Make Smarter, Data&#8209;Driven <span className="gold-t">Investment Decisions</span></h1>
          <p className="sub">We level the playing field by making institutional research tools and insider data available for everyone — with <b>Insider Access!</b></p>
          <span className="you-will">With Insider Access, you will</span>
          <ul className="sparkles">
            <li><span className="sp">✦</span><span><b>Know exactly what insiders are doing</b> — one IQ Score, 0–99, on every stock</span></li>
            <li><span className="sp">✦</span><span><b>Get alerted in real time</b> — the moment a stock trips our radar</span></li>
            <li><span className="sp">✦</span><span><b>Track six rules-based IQ strategies</b> — S&amp;P 500, Russell 2000, AI, Gold &amp; more</span></li>
            <li><span className="sp">✦</span><span><b>Follow proven analysts &amp; politicians</b> — ranked by measured success rates</span></li>
            <li><span className="sp">✦</span><span><b>Uncover hidden opportunities</b> — before the headlines catch up</span></li>
          </ul>
          <div className="cta-row">
            <a className="btn" href="#pricing">Upgrade Now</a>
            <a className="btn ghost" href="#iq-score">See how the IQ Score works</a>
          </div>
          <span className="price-line">Just <b>$199.00</b> per year · 30-day money-back guarantee · 4 free reports at signup</span>
        </div>
        <div className="skyline" aria-hidden="true">
          <svg viewBox="0 0 1440 240" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax slice">
            <g fill="#16294F">
              <rect x="0" y="150" width="70" height="90"/><rect x="80" y="120" width="55" height="120"/>
              <rect x="150" y="160" width="80" height="80"/><rect x="245" y="105" width="48" height="135"/>
              <rect x="310" y="140" width="66" height="100"/><rect x="390" y="90" width="42" height="150"/>
              <rect x="448" y="150" width="88" height="90"/><rect x="552" y="118" width="52" height="122"/>
              <polygon points="640,240 640,96 664,72 688,96 688,240"/>
              <rect x="706" y="132" width="70" height="108"/><rect x="792" y="100" width="46" height="140"/>
              <rect x="854" y="152" width="84" height="88"/><rect x="954" y="112" width="56" height="128"/>
              <rect x="1026" y="142" width="64" height="98"/><rect x="1106" y="94" width="44" height="146"/>
              <rect x="1166" y="150" width="86" height="90"/><rect x="1268" y="122" width="52" height="118"/>
              <rect x="1336" y="146" width="104" height="94"/>
            </g>
            <g fill="#0A1730">
              <rect x="30" y="176" width="90" height="64"/><rect x="140" y="138" width="58" height="102"/>
              <polygon points="230,240 230,120 252,120 252,96 268,96 268,120 290,120 290,240"/>
              <rect x="308" y="168" width="96" height="72"/><rect x="422" y="128" width="50" height="112"/>
              <polygon points="500,240 500,100 516,100 516,64 524,64 524,44 528,20 532,44 532,64 540,64 540,100 556,100 556,240"/>
              <rect x="574" y="158" width="78" height="82"/><rect x="668" y="116" width="54" height="124"/>
              <rect x="738" y="150" width="92" height="90"/>
              <polygon points="848,240 848,88 862,88 862,72 890,72 890,88 904,88 904,240"/>
              <rect x="922" y="160" width="72" height="80"/><rect x="1010" y="124" width="48" height="116"/>
              <polygon points="1074,240 1074,108 1092,84 1110,108 1110,240"/>
              <rect x="1128" y="156" width="88" height="84"/><rect x="1232" y="118" width="56" height="122"/>
              <rect x="1304" y="164" width="136" height="76"/>
            </g>
            <g fill="#F5B942" opacity=".8">
              <rect x="242" y="140" width="4" height="5"/><rect x="256" y="158" width="4" height="5"/><rect x="270" y="132" width="4" height="5"/>
              <rect x="508" y="120" width="4" height="5"/><rect x="522" y="146" width="4" height="5"/><rect x="536" y="128" width="4" height="5"/><rect x="516" y="170" width="4" height="5"/>
              <rect x="678" y="136" width="4" height="5"/><rect x="692" y="158" width="4" height="5"/>
              <rect x="858" y="108" width="4" height="5"/><rect x="874" y="126" width="4" height="5"/><rect x="890" y="112" width="4" height="5"/><rect x="866" y="150" width="4" height="5"/>
              <rect x="1022" y="140" width="4" height="5"/><rect x="1036" y="162" width="4" height="5"/>
              <rect x="1244" y="136" width="4" height="5"/><rect x="1258" y="154" width="4" height="5"/>
              <rect x="152" y="152" width="4" height="5"/><rect x="168" y="170" width="4" height="5"/>
              <rect x="434" y="146" width="4" height="5"/><rect x="1090" y="120" width="3" height="4"/>
            </g>
          </svg>
        </div>
      </header>
      
      
      <section className="alt" id="why">
        <div className="wrap">
          <div className="sec-head">
            <span className="kicker">Why follow insiders</span>
            <h2>There Is a Reason Why Insiders Get Wealthier.<br/><span style={{color:"var(--gold-dark)"}}>They Consistently Beat the Market.</span></h2>
            <p>Six decades of research. One conclusion.</p>
          </div>
          <div className="why-grid">
            <div className="why-card">
              <span className="k">The Harvard research</span>
              <span className="big">~11%/yr</span>
              <h3>Measured edge on insider purchases</h3>
              <p>A landmark study co-authored by Harvard economist Richard Zeckhauser (with Jeng &amp; Metrick) built portfolios mimicking insider purchases — and found they earned abnormal returns of roughly 11% per year over the market.</p>
              <span className="src">JENG, METRICK &amp; ZECKHAUSER · REVIEW OF ECONOMICS &amp; STATISTICS</span>
            </div>
            <div className="why-card">
              <span className="k">Decades of confirmation</span>
              <span className="big">60+ yrs</span>
              <h3>Insider buying predicts outperformance</h3>
              <p>From the earliest SEC filing studies in the 1960s through modern cluster research, the finding keeps replicating: stocks insiders buy tend to outperform in the months that follow — strongest for purchases over sales, and clusters over lone trades.</p>
              <span className="src">LAKONISHOK &amp; LEE (NBER) AND SUBSEQUENT LITERATURE</span>
            </div>
            <div className="why-card quote-card">
              <span className="k">Peter Lynch · legendary Fidelity manager</span>
              <blockquote>Insiders sell for many reasons. They buy for only one: <span className="gold-t">they think the price will rise.</span></blockquote>
              <p style={{marginTop:"12px",fontSize:".88rem"}}>Executives dump stock to pay taxes or diversify. When they reach into their own pocket to buy on the open market, only one motive fits.</p>
              <span className="src">PARAPHRASING PETER LYNCH · "ONE UP ON WALL STREET"</span>
            </div>
          </div>
          <div className="winner-strip" aria-label="12-month returns on well-known stocks">
            <span className="wchip">MU <span className="up">▲ +697%</span></span>
            <span className="wchip">AMD <span className="up">▲ +287%</span></span>
            <span className="wchip">TSM <span className="up">▲ +78%</span></span>
            <span className="wchip">AVGO <span className="up">▲ +30%</span></span>
            <span className="wchip">NVDA <span className="up">▲ +21%</span></span>
          </div>
          <p className="strip-note">12-mo returns as of Aug 2026 — the kinds of repricings informed buying has historically preceded. Not a record of our alerts. Past performance ≠ future results.</p>
          <p style={{textAlign:"center",marginTop:"1.8rem"}}><a className="txt-cta" href="#pricing">Follow them →</a></p>
        </div>
      </section>
      
      
      <section id="iq-score">
        <div className="wrap">
          <div className="sec-head">
            <span className="kicker">IQ = Insider Quality · Rated 0–99</span>
            <h2>One Score. Zero Guesswork.</h2>
            <p>Size matters — but it's not the only thing. Six factors, weighed automatically.</p>
          </div>
          <div className="iq-bar" role="img" aria-label="Illustrative composition of the IQ Score">
            <span className="iq-seg sg1" style={{flex:"24"}}>SENIORITY</span>
            <span className="iq-seg sg2" style={{flex:"22"}}>SIZE</span>
            <span className="iq-seg sg3" style={{flex:"20"}}>CLUSTERING</span>
            <span className="iq-seg sg4" style={{flex:"16"}}>TRACK RECORD</span>
            <span className="iq-seg sg5" style={{flex:"12"}}>OWNERSHIP</span>
            <span className="iq-seg sg6" style={{flex:"6"}}>−</span>
          </div>
          <div className="iq-legend">
            <div className="iq-item"><span className="sw" style={{background:"#0B1B3A"}}></span><div><b>Who's buying</b><p>A CEO sees the whole business; a director sees board packets. The closer to operations, the heavier the weight.</p></div></div>
            <div className="iq-item"><span className="sw" style={{background:"#16294F"}}></span><div><b>How much</b><p>Size relative to the company and the insider's own pay. Token buys score near zero; conviction stakes move the score.</p></div></div>
            <div className="iq-item"><span className="sw" style={{background:"#1D4ED8"}}></span><div><b>How fast &amp; how often</b><p>Clusters are the highest-signal pattern in the literature — one buyer can be wrong; five rarely agree by accident.</p></div></div>
            <div className="iq-item"><span className="sw" style={{background:"#B07E1C"}}></span><div><b>Buyer track record</b><p>The % of this insider's past buys trading above purchase price 12 months later. Proven buyers outweigh first-timers.</p></div></div>
            <div className="iq-item"><span className="sw" style={{background:"#F5B942"}}></span><div><b>Skin in the game</b><p>Total insider ownership and its direction. High and rising means management keeps its shares, not just collects them.</p></div></div>
            <div className="iq-item"><span className="sw" style={{background:"#98A2B3"}}></span><div><b>Deductions</b><p>Heavy dilution and active litigation subtract automatically — buying at a company printing shares is a weaker signal.</p></div></div>
          </div>
          <p className="iq-note">Every filing ingested 24/7 · noise filtered · scored in minutes. Segment sizes illustrative — full methodology published free.</p>
          <p className="one-score">The result: <span className="gold-t">one score that tells you exactly what insiders are doing</span> — and how much it means.</p>
          <div className="sec-cta">
            <a className="btn navy" href="#pricing">See every stock's IQ Score</a>
            <span className="cta-micro">Full ranking, incl. the #1 stock</span>
          </div>
        </div>
      </section>
      
      
      
      <section className="alt" id="unlock">
        <div className="wrap">
          <div className="sec-head">
            <span className="kicker">Included with Insider Access</span>
            <h2>Everything You Unlock.</h2>
            <p>Six tools. One score. One membership.</p>
          </div>
          <div className="toolkit-grid">
            <div className="tool"><span className="ico">99</span><h3>IQ Score Rankings</h3><p>Every stock scored 0–99 and re-ranked daily from live SEC filings — down to the #1 highest-conviction name in the market.</p></div>
            <div className="tool"><span className="ico">⚡</span><h3>Fast, Reliable Alerts</h3><p>We track high-conviction insider trades 24/7 and alert you the moment a stock trips our radar — minutes after EDGAR, never weeks.</p></div>
            <div className="tool"><span className="ico">▦</span><h3>Six IQ Strategies</h3><p>Rules-based portfolios overlaying the IQ Score on benchmarks you know: <b>SPX·IQ, RUT·IQ, TSX·IQ, AI·IQ, GLD·IQ, NRG·IQ</b> — holdings unlocked for members.</p></div>
            <div className="tool"><span className="ico">%</span><h3>Insider &amp; Analyst Success Rates</h3><p>Every insider and analyst ranked by how their past calls actually performed. Follow the ones who've been right before.</p></div>
            <div className="tool"><span className="ico">§</span><h3>Politician Trades &amp; Donors</h3><p>Congressional trades with committee seats, filing speed, and the donors, lobbying, and contracts behind them.</p></div>
            <div className="tool"><span className="ico">🎙</span><h3>Interviews, Playbooks &amp; Reports</h3><p>Exclusive insider interviews ("When did you last buy shares — and why then?"), five sector playbooks, and a 4-report bundle free at signup. <button className="txt-cta" style={{background:"none",border:"none",cursor:"pointer",font:"inherit",fontWeight:"700"}} onClick={() => setLto(true)}>See the bundle →</button></p></div>
          </div>
          <div className="sec-cta">
            <a className="btn" href="#pricing">Unlock everything</a>
            <span className="cta-micro">$199/yr · 4 free reports · 30-day money-back guarantee</span>
          </div>
        </div>
      </section>
      
      
      <section className="pricing" id="pricing">
        <div className="wrap">
          <div className="sec-head">
            <span className="kicker" style={{color:"#8DA0C4"}}>Don't wait</span>
            <h2>Lock In the Best Price Now.</h2>
            <p>Everything above. One price. Nothing held back — including today's free bundle.</p>
          </div>
          <div className="plans" role="radiogroup" aria-label="Choose your plan">
      <div className={"plan pick" + (plan === "annual" ? " sel" : "")} role="radio" aria-checked={plan === "annual"} tabIndex={0} onClick={() => setPlan("annual")} onKeyDown={(e) => e.key === "Enter" && setPlan("annual")}>
        <div className="top"><span className="radio"></span><span className="nm">Yearly</span><span className="badge">SAVE 59%</span></div>
        <span className="strike">$479.88</span>
        <div className="price">$199<small>/year</small></div>
        <span className="per">Just $16.58/mo · billed annually</span>
        <div className="bundle-line">⚡ 4-report bundle included free</div>
      </div>
      <div className={"plan pick" + (plan === "monthly" ? " sel" : "")} role="radio" aria-checked={plan === "monthly"} tabIndex={0} onClick={() => setPlan("monthly")} onKeyDown={(e) => e.key === "Enter" && setPlan("monthly")}>
        <div className="top"><span className="radio"></span><span className="nm">Monthly</span></div>
        <span className="strike">&nbsp;</span>
        <div className="price">$39.99<small>/month</small></div>
        <span className="per">Billed monthly · cancel anytime</span>
        <div className="bundle-line">⚡ 4-report bundle included free</div>
      </div>
    </div>
    <div className="pay-zone">
      <button className="btn" onClick={checkout} disabled={busy} style={{opacity: busy ? 0.7 : 1}}>
        {busy ? "Opening secure checkout…" : premium ? "Manage your subscription" : "Continue — Get Insider Access"}
      </button>
      {err && <p style={{color:"#FDA29B",fontSize:".85rem",marginTop:"10px",fontWeight:600}}>{err}</p>}
      {!user && <p style={{color:"#9FB0CE",fontSize:".8rem",marginTop:"10px"}}>You&rsquo;ll sign in first so the subscription ties to your account.</p>}
      <div className="g-line"><span className="shield">✔</span> 30-day money-back guarantee — no questions asked</div>
      <p style={{marginTop:"16px",fontSize:".82rem",color:"#9FB0CE"}}>Institutional or team access? <a href="mailto:support@insiderbuying.com?subject=Institutional%20access" style={{color:"#F5B942",fontWeight:700}}>Contact us for pricing →</a></p>
    </div>
          <div className="guarantee">
            <div className="g-badge"><b>30</b><span>DAY</span><span>GUARANTEE</span></div>
            <div>
              <h3>We Are Confident Insider Access Will Out-Beat Your Expectations.</h3>
              <p>That's why every plan comes with a no-questions-asked <b style={{color:"#fff"}}>30-day money-back guarantee</b>. If you're unsatisfied in any way during your first 30 days, we'll refund you in full. Try it out — you have nothing to lose.</p>
            </div>
          </div>
          <p style={{textAlign:"center",marginTop:"2rem",fontFamily:"'IBM Plex Mono',monospace",fontSize:".68rem",color:"#8DA0C4",letterSpacing:".06em"}}>PRIMARY SOURCES ONLY · PUBLISHED METHODOLOGY · MISSES INCLUDED · INDEPENDENT — SUBSCRIPTIONS ARE OUR ONLY REVENUE</p>
          <div className="closer">
            <p className="big-line">If you're not on the inside, <span className="gold-t">you're on the outside.</span></p>
            <p className="echo">In 5 years, you'll probably wish you started following insider buying today.</p>
          </div>
        </div>
      </section>
      
      
      <div className="sticky-cta" id="stickyCta">
        <div className="p">$199/yr — Insider Access<small>4 free reports · 30-day guarantee</small></div>
        <a className="btn" href="#pricing">Get Access</a>
      </div>
      
      
      <div className={"lto-overlay" + (lto ? " open" : "")} id="ltoOverlay" role="dialog" aria-modal="true" aria-labelledby="ltoTitle">
        <div className="lto">
          <button className="lto-close" onClick={closeLto} aria-label="Close offer">✕</button>
          <div className="lto-strip"><span>⚡ Limited-time offer</span><span className="lto-timer">{timer}</span><span>Expires at zero</span></div>
          <div className="lto-body">
            <span className="lto-eyebrow">Subscribe today &amp; get these special reports bundled — free</span>
            <h2 id="ltoTitle">4 Insider Stock Reports. Yours Instantly. $0 Extra.</h2>
            <p className="lead">As a subscriber, you'll immediately receive our top stock ideas that insiders are bullish on — so you spend less time navigating the market and more time doing what you love.</p>
            <div className="lto-covers">
              <div className="lcov lcp"><div className="bb">INSIDER<br/>BUYING</div><div className="mm"><b>Top Stocks</b><span>INSIDERS ARE BUYING</span></div><div className="ff">2026 REPORT</div></div>
              <div className="lcov lcb"><div className="bb">INSIDER<br/>BUYING</div><div className="mm"><b>Top Stocks</b><span>ANALYSTS LOVE</span></div><div className="ff">2026 REPORT</div></div>
              <div className="lcov lcg"><div className="bb">INSIDER<br/>BUYING</div><div className="mm"><b>Top Dividend</b><span>PAYING STOCKS</span></div><div className="ff">2026 REPORT</div></div>
            </div>
            <div className="lto-bonus">
              <span className="tag">⚡ Bonus special report</span>
              <div className="mini">INSIDER<br/>BUYING</div>
              <div><b>Critical Metals Stock Idea</b><span>One under-the-radar critical metals company insiders are quietly accumulating — full thesis inside.</span></div>
            </div>
            <p className="value-line">All four included <b>FREE with your subscription today</b></p>
            <button className="btn" onClick={claim}>Claim my 4 free reports →</button>
            <span className="cta-micro">Delivered the moment you subscribe · 30-day money-back guarantee</span><br/>
            <button className="lto-dismiss" onClick={closeLto}>No thanks — I&rsquo;ll pass on the free reports</button>
          </div>
        </div>
      </div>
      
      
    </div>
    {/* Outside the .ia scope so the landing design's CSS reset can't restyle it. */}
    <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
