"use client";
/**
 * press.insiderbuying.com — Brief v3 (2026-09-08): BrandPush-style self-serve
 * press-publishing page. Section order and behaviour follow the brief's
 * element map (§2) one-for-one:
 *   1 sticky nav · 2 hero · 3 logo wall · 4 network stats strip · 5 four-step
 *   process · 6 Editorial Focus · 7 pricing · 8 trust badge · 9 testimonials
 *   (hidden until three real quotes) · 10 FAQ · 11 enterprise band · 12 footer.
 * Copy in §4 and §5 is verbatim. Every package figure the brief marks
 * [verify] renders as a placeholder until lib/press-config marks it verified.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  FileText,
  Lock,
  Newspaper,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { getCheckoutAttribution, track } from "@/lib/analytics";
import { getFunnelEntry } from "@/lib/funnel";
import { SiteBanners, PromoCard } from "@/components/banners/SiteBanners";
import {
  AUDIENCE_LINE,
  CALENDLY_URL,
  HERO_PLACEMENTS,
  OUTLETS,
  OWNED_CHANNELS,
  PRESS_FAQ,
  PRESS_PACKAGES,
  SAMPLE_REPORT_URL,
  TESTIMONIALS,
  type PressPackageConfig,
} from "@/lib/press-config";

const NAV = [
  ["how-it-works", "How It Works"],
  ["pricing", "Pricing"],
  ["samples", "Samples"],
  ["faq", "FAQ"],
] as const;

/** §4.1 — the four benefit bullets, verbatim, with icons. */
const BENEFITS = [
  { icon: ShieldCheck, title: "Build Trust", text: "Turn more visitors into buyers" },
  { icon: TrendingUp, title: "Rank Higher", text: "Strengthen Google and AI visibility" },
  { icon: Newspaper, title: "Get Featured", text: "Appear on major news sites" },
  { icon: Zap, title: "Fast Delivery", text: "Order today, get published by Sunday" },
];

/** §4.3 — verbatim. */
const STEPS = [
  { icon: FileText, title: "Write or Submit", text: "Submit your investor press kit or let our team create it." },
  { icon: Search, title: "Review and Approve", text: "Review the content and request any changes." },
  { icon: Newspaper, title: "Get Published", text: "We publish your story on leading news sites." },
  { icon: TrendingUp, title: "Track Your Results", text: "Receive a report with live links and SEO data." },
];

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const de = document.documentElement;
  de.scrollTo({ top: de.scrollTop + el.getBoundingClientRect().top - 72, behavior: "instant" });
  history.replaceState(null, "", `#${id}`);
}

export default function PressPage() {
  const [sampleOpen, setSampleOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    track("press_view", { entry: getFunnelEntry(), ...getCheckoutAttribution() });
  }, []);

  const openSample = useCallback((from: string) => {
    track("press_sample_open", { from });
    setSampleOpen(true);
  }, []);

  const checkout = async (pkg: PressPackageConfig) => {
    if (busy) return;
    setBusy(pkg.key);
    setErr(null);
    const attribution = { entry: getFunnelEntry(), ...getCheckoutAttribution() };
    track("press_checkout_start", { package: pkg.key, price: pkg.priceUsd, ...attribution });
    try {
      const res = await fetch(`${API_BASE}/press/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: pkg.key, attribution }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.url) throw new Error(j?.message || "Checkout is unavailable right now.");
      window.location.href = j.url as string;
    } catch (e) {
      setBusy(null);
      setErr(e instanceof Error ? e.message : "Checkout is unavailable right now.");
    }
  };

  return (
    <div className="b2b3">
      <SiteBanners />
      <Nav />
      <Hero onSample={() => openSample("hero")} />
      <LogoWall />
      <StatsStrip />
      <Process />
      <EditorialFocus />
      <Pricing onCheckout={checkout} onSample={() => openSample("pricing")} busy={busy} err={err} />
      <PromoCard className="b2b3-wrap" />
      <BadgeFeature />
      <Testimonials />
      <Faq />
      <Enterprise />
      <Footer />
      {sampleOpen && <SampleModal onClose={() => setSampleOpen(false)} />}
      <style>{CSS}</style>
    </div>
  );
}

/* 1 ─ Sticky nav */
function Nav() {
  return (
    <header className="b2b3-nav">
      <div className="b2b3-wrap b2b3-nav-in">
        <Link href="/press" className="b2b3-logo" aria-label="InsiderBuying.com press publishing">
          INSIDER<span>BUYING</span>
          <small>Press</small>
        </Link>
        <nav className="b2b3-nav-links" aria-label="Page sections">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); scrollToId(id); }}>
              {label}
            </a>
          ))}
        </nav>
        <a href="#pricing" onClick={(e) => { e.preventDefault(); scrollToId("pricing"); track("press_cta", { where: "nav" }); }} className="b2b3-btn b2b3-btn-green b2b3-btn-sm">
          Get Started
        </a>
      </div>
    </header>
  );
}

/* 2 ─ Hero */
function Hero({ onSample }: { onSample: () => void }) {
  return (
    <section className="b2b3-hero">
      <div className="b2b3-wrap b2b3-hero-in">
        <div>
          <h1 className="b2b3-h1">
            Build Instant Authority,
            <br />
            Get discovered on Google &amp; AI
          </h1>
          <p className="b2b3-hero-kicker">Reach your target audience</p>
          <p className="b2b3-hero-sub">
            Announce your company news to global investors, financial advisors, analysts, and more.
          </p>
          <p className="b2b3-hero-body">
            Get your story published on major news sites to build trust, improve visibility, and attract more investors
          </p>
          <ul className="b2b3-benefits">
            {BENEFITS.map((b) => (
              <li key={b.title}>
                <b.icon size={18} aria-hidden />
                <span><strong>{b.title}:</strong> {b.text}</span>
              </li>
            ))}
          </ul>
          <div className="b2b3-ctas">
            <a href="#pricing" onClick={(e) => { e.preventDefault(); scrollToId("pricing"); track("press_cta", { where: "hero" }); }} className="b2b3-btn b2b3-btn-green">
              Get Started <ArrowRight size={16} />
            </a>
            <button type="button" onClick={onSample} className="b2b3-btn b2b3-btn-ghost">
              View Sample Report
            </button>
          </div>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}

/** Collage of live placements (§2 row 2). Real screenshots only — today our
 *  own properties (press-config HERO_PLACEMENTS); client campaign shots slot
 *  in there once signed off (§8). */
function HeroVisual() {
  const frames = HERO_PLACEMENTS.slice(0, 3);
  if (!frames.length) return null;
  return (
    <div className="b2b3-collage" aria-label="Live placements on InsiderBuying.com">
      {frames.map((f, i) => (
        <figure key={f.src} className={`b2b3-shot b2b3-shot-${i}`}>
          <div className="b2b3-shot-bar"><i /><i /><i /><span>{f.caption}</span></div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.src} alt={f.alt} loading={i === 0 ? "eager" : "lazy"} decoding="async" width={1000} height={700} />
        </figure>
      ))}
    </div>
  );
}

/* 3 ─ Logo wall */
function LogoWall() {
  const partners = OUTLETS.filter((o) => o.confirmed && !o.prominent);
  // §4.2: only outlets we can genuinely place on. Our own properties always
  // qualify; contracted partners join them as they are confirmed.
  const items: { name: string; note?: string; hot?: boolean }[] = [
    ...OWNED_CHANNELS.map((c, i) => ({ name: c.name, note: c.note, hot: i === 0 })),
    ...partners.map((o) => ({ name: o.name })),
  ];
  return (
    <section className="b2b3-logos" aria-label="Where your story runs">
      <div className="b2b3-wrap">
        <p className="b2b3-eyebrow">GET SEEN ON</p>
        <div className="b2b3-marquee">
          <div className="b2b3-marquee-track">
            {[...items, ...items].map((o, i) => (
              <span
                key={`${o.name}-${i}`}
                className={`b2b3-outlet${o.hot ? " b2b3-outlet-hot" : ""}${i >= items.length ? " b2b3-dup" : ""}`}
                aria-hidden={i >= items.length || undefined}
              >
                {o.name}
                {o.note && <small>{o.note}</small>}
              </span>
            ))}
          </div>
        </div>
        <p className="b2b3-fine b2b3-center">
          Our own properties, where every package is guaranteed to run. Partner news outlets are listed here as
          each distribution contract is signed.
        </p>
      </div>
    </section>
  );
}

/* 4 ─ Network stats strip — figures we can evidence from our own database
   (Brief v3 §6: never a claim we can't back). Partner DA / visits chips join
   them per outlet once verified in press-config. */
function StatsStrip() {
  const { data } = useSWR<PressStats>(`${API_BASE}/press/stats`, fetcher, { revalidateOnFocus: false });
  const n = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString("en-US"));
  const partners = OUTLETS.filter((o) => o.confirmed && o.verified);
  return (
    <section className="b2b3-strip" aria-label="Audience and coverage figures">
      <div className="b2b3-wrap b2b3-strip-in">
        <div className="b2b3-chip"><span className="b2b3-chip-name">InsiderBuying.com</span><span className="b2b3-chip-stat"><b>{n(data?.filingsOnFile)}</b> insider filings on file</span></div>
        <div className="b2b3-chip"><span className="b2b3-chip-stat"><b>{n(data?.companiesTracked)}</b> public companies tracked</span></div>
        <div className="b2b3-chip"><span className="b2b3-chip-stat"><b>{n(data?.filingsToday)}</b> filings scanned today</span></div>
        {partners.map((o) => (
          <div key={o.name} className="b2b3-chip">
            <span className="b2b3-chip-name">{o.name}</span>
            <span className="b2b3-chip-stat"><b>DA {o.domainAuthority}</b></span>
            <span className="b2b3-chip-stat">{o.monthlyVisits} monthly visits</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* 5 ─ Four-step process */
function Process() {
  return (
    <section className="b2b3-section" id="how-it-works">
      <div className="b2b3-wrap">
        <h2 className="b2b3-h2 b2b3-center">The Fast-Track to Authority and Getting Noticed</h2>
        <p className="b2b3-lead b2b3-center">
          Leverage the high Domain Authority of news giants to secure powerful Media Mentions and scale your coverage.
        </p>
        <ol className="b2b3-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="b2b3-step">
              <div className="b2b3-step-icon"><s.icon size={22} aria-hidden /></div>
              <span className="b2b3-step-n">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* 6 ─ Editorial Focus (§5, approved copy v1) */
interface PressStats { filingsToday: number; filingsLast24h: number; filingsOnFile: number; companiesTracked: number; alertsSent: number }

function EditorialFocus() {
  const { data } = useSWR<PressStats>(`${API_BASE}/press/stats`, fetcher, { revalidateOnFocus: false });
  const n = data?.filingsToday ?? null;
  return (
    <section className="b2b3-focus">
      <div className="b2b3-wrap b2b3-focus-in">
        <div>
          <p className="b2b3-eyebrow b2b3-eyebrow-gold">Our Editorial Focus</p>
          <h2 className="b2b3-focus-h2">Our Editorial Focus: driven by insider conviction.</h2>
        </div>
        <div className="b2b3-focus-copy">
          <p>
            InsiderBuying.com covers one thing better than anyone: what the people who run public companies
            do with their own money. We scan thousands of filings a day, score every open-market buy, and
            publish the signal — not the noise.
          </p>
          <p>
            That focus built our audience: {AUDIENCE_LINE} investors, advisors, and analysts who don&rsquo;t
            follow hype. They follow conviction. They open our alerts because a CEO just wrote a personal
            cheque, and they want to know why.
          </p>
          <p>
            When your story runs with us, it lands in that room. No filler feeds. No bots. Just readers who
            move when the evidence moves them — because it pays to have good information.
          </p>
          {n != null && n > 0 && (
            <div className="b2b3-livechip" aria-live="polite">
              <span className="b2b3-livedot" aria-hidden />
              <b>{n.toLocaleString()}</b> filings scanned today
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* 7 ─ Pricing */
function Pricing({ onCheckout, onSample, busy, err }: { onCheckout: (p: PressPackageConfig) => void; onSample: () => void; busy: string | null; err: string | null }) {
  return (
    <section className="b2b3-section" id="pricing">
      <div className="b2b3-wrap">
        <h2 className="b2b3-h2 b2b3-center">Pricing</h2>
        <p className="b2b3-lead b2b3-center">Two packages. One payment. Published by Sunday.</p>
        <div className="b2b3-plans">
          {PRESS_PACKAGES.map((p) => (
            <article key={p.key} className={`b2b3-plan${p.highlighted ? " b2b3-plan-hot" : ""}`}>
              {p.highlighted && <div className="b2b3-plan-flag">Most exposure</div>}
              <h3>{p.name}</h3>
              <div className="b2b3-price">
                <span className="b2b3-price-n">${p.priceUsd.toLocaleString()}</span>
                <span className="b2b3-price-unit">USD · Pay Once</span>
              </div>
              <p className="b2b3-plan-pos">{p.positioning}</p>
              <button type="button" onClick={() => onCheckout(p)} disabled={busy !== null} className={`b2b3-btn b2b3-btn-block ${p.highlighted ? "b2b3-btn-gold" : "b2b3-btn-green"}`}>
                {busy === p.key ? "Opening checkout…" : "Get Started"}
              </button>
              <p className="b2b3-guarantee">
                <ShieldCheck size={14} aria-hidden /> <Link href="/press/guarantee">Money Back Guarantee</Link>
              </p>
              <ul className="b2b3-features">
                {/* Partner-network figures print only once verified (§6). */}
                {p.stats.filter((s) => s.verified).map((s) => (
                  <li key={s.label}><Check size={16} aria-hidden /><span><b>{s.value}</b> {s.label}</span></li>
                ))}
                {p.deliverables.map((f) => (
                  <li key={f}><Check size={16} aria-hidden /><span>{f}</span></li>
                ))}
                {p.features.map((f) => (
                  <li key={f}><Check size={16} aria-hidden /><span>{f}</span></li>
                ))}
              </ul>
              <button type="button" onClick={onSample} className="b2b3-btn b2b3-btn-ghost b2b3-btn-block b2b3-btn-sm">
                View Sample Report
              </button>
            </article>
          ))}
        </div>
        {err && <p className="b2b3-err b2b3-center" role="alert">{err}</p>}
        <p className="b2b3-fine b2b3-center">
          Checkout by Stripe. Every package is a one-time payment. Published pieces are labeled as sponsored or
          paid distribution per outlet rules and our disclosure policy; paid placement never affects Insider
          Scores or editorial rankings on InsiderBuying.com.
        </p>
      </div>
    </section>
  );
}

/* 8 ─ Trust badge feature */
function BadgeFeature() {
  const outlets = OUTLETS.filter((o) => o.confirmed).map((o) => o.name);
  return (
    <section className="b2b3-section b2b3-section-alt" id="samples">
      <div className="b2b3-wrap b2b3-badge-in">
        <div>
          <p className="b2b3-eyebrow">Trust badge</p>
          <h2 className="b2b3-h2">Show investors where you&rsquo;ve been seen.</h2>
          <p className="b2b3-lead">
            Every package includes an &ldquo;As seen on&rdquo; badge for your investor-relations page, listing
            the outlets that carried your story with a link to each live placement. Embed code arrives with
            your results report.
          </p>
        </div>
        <div className="b2b3-badge" role="img" aria-label="As seen on badge preview">
          <div className="b2b3-badge-top"><BadgeCheck size={18} aria-hidden /> AS SEEN ON</div>
          <div className="b2b3-badge-outlets">
            {(outlets.length ? outlets : ["InsiderBuying.com"]).map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
          <div className="b2b3-badge-foot">Verified placements · InsiderBuying.com Press</div>
        </div>
      </div>
    </section>
  );
}

/* 9 ─ Testimonials — real, permissioned quotes only; hidden below three (§7) */
function Testimonials() {
  if (TESTIMONIALS.length < 3) return null;
  return (
    <section className="b2b3-section">
      <div className="b2b3-wrap">
        <h2 className="b2b3-h2 b2b3-center">What clients say</h2>
        <div className="b2b3-quotes">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="b2b3-quote">
              <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
              <figcaption><b>{t.name}</b> · {t.title}, {t.company}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 10 ─ FAQ */
function Faq() {
  return (
    <section className="b2b3-section" id="faq">
      <div className="b2b3-wrap b2b3-faq-wrap">
        <h2 className="b2b3-h2 b2b3-center">Questions</h2>
        <div className="b2b3-faq">
          {PRESS_FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}<span aria-hidden>+</span></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 11 ─ Enterprise band */
function Enterprise() {
  return (
    <section className="b2b3-enterprise">
      <div className="b2b3-wrap b2b3-enterprise-in">
        <div>
          <p className="b2b3-eyebrow b2b3-eyebrow-gold">Enterprise</p>
          <h2 className="b2b3-focus-h2">Running a full investor-acquisition campaign?</h2>
          <p>Press distribution, funnel and traffic, and sponsored editorial — built and measured by our team. Campaigns from $4,889.</p>
        </div>
        <div className="b2b3-enterprise-ctas">
          <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="b2b3-btn b2b3-btn-gold" onClick={() => track("press_cta", { where: "enterprise-calendly" })}>
            Book a Discovery Call
          </a>
          <Link href="/campaigns" className="b2b3-btn b2b3-btn-ghost-light">See campaign tiers →</Link>
        </div>
      </div>
    </section>
  );
}

/* 12 ─ Footer */
function Footer() {
  return (
    <footer className="b2b3-footer">
      <div className="b2b3-wrap b2b3-footer-in">
        <p>
          © {new Date().getFullYear()} InsiderBuying Inc. Published pieces are labeled as sponsored or paid
          distribution per outlet rules and our disclosure policy. Paid placement never affects Insider Scores
          or editorial rankings on InsiderBuying.com. InsiderBuying.com is a publisher, not an investment
          adviser.
        </p>
        <nav aria-label="Compliance">
          <Link href="/press/guarantee">Money Back Guarantee</Link>
          <Link href="/disclaimer">Disclosure &amp; Disclaimer</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/campaigns">Campaigns</Link>
          <Link href="https://insiderbuying.com">InsiderBuying.com</Link>
        </nav>
      </div>
    </footer>
  );
}

/* Sample report modal (§7) */
function SampleModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="b2b3-modal" role="dialog" aria-modal="true" aria-label="Sample report" onClick={onClose}>
      <div className="b2b3-modal-in" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="b2b3-modal-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <p className="b2b3-eyebrow">Sample report</p>
        {SAMPLE_REPORT_URL ? (
          <iframe src={SAMPLE_REPORT_URL} title="Sample results report" className="b2b3-modal-frame" loading="lazy" />
        ) : (
          <div className="b2b3-modal-empty">
            <FileText size={28} aria-hidden />
            <h3>Sample report coming shortly</h3>
            <p>A real results report from a past campaign — live links and SEO data, client-approved — is being prepared for this page. Every order receives the same report format when the campaign completes.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─ Design system (§3): Archivo display / Nunito Sans body / IBM Plex Mono data;
   navy #0A1E3C, green #0E9F6E, gold #C9A227 on a light page; 14–16px radii. */
const CSS = `
.b2b3 { --navy:#0A1E3C; --green:#0E9F6E; --gold:#C9A227; --ink:#0A1E3C; --body:#2B3A4F; --muted:#5C6B7F; --line:#E3E8F0; --bg:#F7F9FC; --card:#FFFFFF;
  background: var(--bg); color: var(--ink); font-family: var(--b2b-body), system-ui, sans-serif; min-height: 100vh; -webkit-font-smoothing: antialiased; }
.b2b3 *, .b2b3 *::before, .b2b3 *::after { box-sizing: border-box; }
.b2b3-wrap { max-width: 1160px; margin: 0 auto; padding: 0 20px; }
.b2b3 h1, .b2b3 h2, .b2b3 h3 { font-family: var(--b2b-display), sans-serif; margin: 0; color: var(--ink); }
.b2b3-h1 { font-size: clamp(34px, 4.6vw, 58px); font-weight: 800; line-height: 1.04; letter-spacing: -1px; }
.b2b3-h2 { font-size: clamp(26px, 3.2vw, 40px); font-weight: 800; letter-spacing: -0.6px; line-height: 1.1; }
.b2b3-lead { font-size: 17px; line-height: 1.6; color: var(--body); margin: 12px 0 0; max-width: 760px; }
.b2b3-center { text-align: center; margin-left: auto; margin-right: auto; }
.b2b3-eyebrow { font-family: var(--b2b-mono), monospace; font-size: 12px; letter-spacing: 1.6px; text-transform: uppercase; color: var(--muted); font-weight: 600; margin: 0 0 8px; }
.b2b3-eyebrow-gold { color: var(--gold); }
.b2b3-fine { font-size: 12.5px; color: var(--muted); line-height: 1.55; margin: 16px 0 0; }
.b2b3-err { color: #B42318; font-weight: 700; margin-top: 12px; }
.b2b3-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 800; font-size: 15px; padding: 13px 22px; border-radius: 12px; border: 1px solid transparent; text-decoration: none; cursor: pointer; transition: transform .15s, filter .15s; font-family: inherit; }
.b2b3-btn:hover { filter: brightness(1.06); transform: translateY(-1px); }
.b2b3-btn:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
.b2b3-btn:disabled { opacity: .6; cursor: default; transform: none; }
.b2b3-btn-green { background: var(--green); color: #fff; }
.b2b3-btn-gold { background: var(--gold); color: var(--navy); }
.b2b3-btn-ghost { background: transparent; color: var(--navy); border-color: rgba(10,30,60,.25); }
.b2b3-btn-ghost-light { background: transparent; color: #fff; border-color: rgba(255,255,255,.35); }
.b2b3-btn-sm { padding: 9px 16px; font-size: 14px; }
.b2b3-btn-block { width: 100%; }
/* nav */
.b2b3-nav { position: sticky; top: 0; z-index: 50; background: rgba(247,249,252,.92); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
.b2b3-nav-in { height: 68px; display: flex; align-items: center; gap: 24px; }
.b2b3-logo { font-family: var(--b2b-display), sans-serif; font-weight: 900; font-size: 19px; letter-spacing: -.5px; color: var(--navy); text-decoration: none; display: inline-flex; align-items: baseline; gap: 6px; }
.b2b3-logo span { color: var(--gold); } .b2b3-logo small { font-family: var(--b2b-mono), monospace; font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--muted); }
.b2b3-nav-links { display: flex; gap: 22px; margin-left: auto; }
.b2b3-nav-links a { color: var(--body); text-decoration: none; font-weight: 700; font-size: 14.5px; } .b2b3-nav-links a:hover { color: var(--green); }
/* hero */
.b2b3-hero { padding: 64px 0 56px; background: radial-gradient(900px 400px at 85% 0%, rgba(14,159,110,.10), transparent 60%), var(--bg); }
.b2b3-hero-in { display: grid; grid-template-columns: 1.05fr .95fr; gap: 44px; align-items: center; }
.b2b3-hero-kicker { font-family: var(--b2b-mono), monospace; font-size: 13px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--green); font-weight: 600; margin: 22px 0 6px; }
.b2b3-hero-sub { font-size: 20px; line-height: 1.45; color: var(--ink); font-weight: 700; margin: 0 0 10px; }
.b2b3-hero-body { font-size: 16.5px; line-height: 1.6; color: var(--body); margin: 0 0 20px; max-width: 560px; }
.b2b3-benefits { list-style: none; margin: 0 0 26px; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
.b2b3-benefits li { display: flex; gap: 10px; align-items: flex-start; font-size: 14.5px; line-height: 1.45; color: var(--body); }
.b2b3-benefits svg { color: var(--green); flex-shrink: 0; margin-top: 2px; }
.b2b3-benefits strong { color: var(--ink); }
.b2b3-ctas { display: flex; gap: 12px; flex-wrap: wrap; }
.b2b3-collage { position: relative; height: 420px; }
.b2b3-shot { position: absolute; margin: 0; background: #fff; border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 24px 60px rgba(10,30,60,.14); overflow: hidden; width: 66%; }
.b2b3-shot-0 { left: 0; top: 0; z-index: 3; } .b2b3-shot-1 { right: 0; top: 70px; z-index: 2; } .b2b3-shot-2 { left: 14%; bottom: 0; z-index: 1; }
.b2b3-shot-bar { height: 28px; background: #EEF2F7; display: flex; gap: 6px; align-items: center; padding: 0 12px; }
.b2b3-shot-bar i { width: 9px; height: 9px; border-radius: 50%; background: #CBD5E1; }
.b2b3-shot-bar span { margin-left: auto; font-family: var(--b2b-mono), monospace; font-size: 10.5px; letter-spacing: .6px; text-transform: uppercase; color: var(--muted); }
.b2b3-outlet small { display: block; font-size: 10.5px; font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--muted); margin-top: 2px; }
.b2b3-shot img { display: block; width: 100%; height: auto; }
.b2b3-shot-ph { height: 150px; display: grid; place-content: center; justify-items: center; gap: 4px; color: var(--muted); font-size: 13px; font-weight: 700; }
.b2b3-shot-ph small { font-weight: 400; font-size: 11.5px; }
/* logos + strip */
.b2b3-logos { padding: 26px 0 10px; border-top: 1px solid var(--line); }
.b2b3-logos .b2b3-eyebrow { text-align: center; }
.b2b3-marquee { overflow: hidden; }
.b2b3-marquee-track { display: flex; justify-content: center; gap: 44px; flex-wrap: wrap; filter: grayscale(1); }
.b2b3-dup { display: none; }
.b2b3-outlet { font-family: var(--b2b-display), sans-serif; font-weight: 800; font-size: 20px; color: #7D8A9C; white-space: nowrap; }
.b2b3-outlet-hot { color: var(--navy); font-size: 24px; filter: none; }
.b2b3-strip { padding: 14px 0 6px; }
.b2b3-strip-in { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.b2b3-chip { display: inline-flex; align-items: center; gap: 10px; background: var(--card); border: 1px solid var(--line); border-radius: 999px; padding: 8px 14px; font-size: 13px; }
.b2b3-chip-name { font-weight: 800; color: var(--ink); }
.b2b3-chip-stat { font-family: var(--b2b-mono), monospace; color: var(--body); } .b2b3-chip-stat b { color: var(--green); }
.b2b3-chip-pending { font-size: 12px; color: var(--muted); }
/* sections */
.b2b3-section { padding: 72px 0; }
.b2b3-section-alt { background: #fff; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.b2b3-steps { list-style: none; margin: 40px 0 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
.b2b3-step { position: relative; background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 26px 22px; }
.b2b3-step-icon { width: 44px; height: 44px; border-radius: 12px; background: rgba(14,159,110,.1); color: var(--green); display: grid; place-items: center; }
.b2b3-step-n { position: absolute; top: 18px; right: 18px; font-family: var(--b2b-mono), monospace; font-size: 13px; color: var(--muted); font-weight: 600; }
.b2b3-step h3 { font-size: 18px; font-weight: 800; margin: 16px 0 6px; }
.b2b3-step p { font-size: 14.5px; line-height: 1.55; color: var(--body); margin: 0; }
/* editorial focus */
.b2b3-focus { background: var(--navy); color: #fff; padding: 76px 0; }
.b2b3-focus-in { display: grid; grid-template-columns: .9fr 1.1fr; gap: 44px; align-items: start; }
.b2b3 .b2b3-focus-h2 { font-family: var(--b2b-display), sans-serif; font-size: clamp(26px, 3vw, 38px); font-weight: 800; letter-spacing: -.5px; line-height: 1.12; color: #fff; }
.b2b3-focus-copy p { font-size: 17px; line-height: 1.7; color: #D5DEEA; margin: 0 0 16px; }
.b2b3-focus-copy p:last-of-type { color: #fff; font-weight: 700; }
.b2b3-livechip { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18); border-radius: 999px; padding: 8px 14px; font-family: var(--b2b-mono), monospace; font-size: 13px; color: #fff; margin-top: 6px; }
.b2b3-livechip b { color: var(--gold); }
.b2b3-livedot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 4px rgba(14,159,110,.25); }
.b2b3-enterprise { background: var(--navy); color: #fff; padding: 56px 0; }
.b2b3-enterprise-in { display: grid; grid-template-columns: 1.3fr .7fr; gap: 32px; align-items: center; }
.b2b3-enterprise p { color: #D5DEEA; font-size: 16px; line-height: 1.6; margin: 10px 0 0; }
.b2b3-enterprise-ctas { display: flex; flex-direction: column; gap: 10px; align-items: stretch; }
/* pricing */
.b2b3-plans { display: grid; grid-template-columns: repeat(2, minmax(0, 440px)); justify-content: center; gap: 24px; margin-top: 40px; }
.b2b3-plan { position: relative; background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 30px 28px; display: flex; flex-direction: column; gap: 14px; }
.b2b3-plan h3 { font-size: 22px; font-weight: 800; }
.b2b3-plan-hot { background: var(--navy); color: #fff; border-color: var(--navy); box-shadow: 0 30px 70px rgba(10,30,60,.25); }
.b2b3-plan-hot h3, .b2b3-plan-hot .b2b3-price-n { color: #fff; } .b2b3-plan-hot .b2b3-plan-pos { color: var(--gold); }
.b2b3-plan-hot .b2b3-features li, .b2b3-plan-hot .b2b3-price-unit, .b2b3-plan-hot .b2b3-guarantee, .b2b3-plan-hot .b2b3-guarantee a { color: #D5DEEA; }
.b2b3-plan-hot .b2b3-features svg { color: var(--gold); }
.b2b3-plan-hot .b2b3-btn-ghost { color: #fff; border-color: rgba(255,255,255,.35); }
.b2b3-plan-flag { position: absolute; top: -12px; left: 28px; background: var(--gold); color: var(--navy); font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 5px 10px; border-radius: 999px; }
.b2b3-price { display: flex; align-items: baseline; gap: 10px; }
.b2b3-price-n { font-family: var(--b2b-display), sans-serif; font-size: 44px; font-weight: 900; letter-spacing: -1px; color: var(--ink); }
.b2b3-price-unit { font-family: var(--b2b-mono), monospace; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); }
.b2b3-plan-pos { font-weight: 800; color: var(--green); margin: 0; font-size: 15px; }
.b2b3-guarantee { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); margin: -4px 0 0; }
.b2b3-guarantee a { color: inherit; text-decoration: underline; font-weight: 700; }
.b2b3-features { list-style: none; margin: 4px 0 6px; padding: 0; display: grid; gap: 10px; }
.b2b3-features li { display: flex; gap: 10px; align-items: flex-start; font-size: 14.5px; line-height: 1.45; color: var(--body); }
.b2b3-features svg { color: var(--green); flex-shrink: 0; margin-top: 2px; }
.b2b3-features b { font-family: var(--b2b-mono), monospace; }
.b2b3-pending em { font-style: normal; color: var(--muted); font-size: 12.5px; }
/* badge */
.b2b3-badge-in { display: grid; grid-template-columns: 1.1fr .9fr; gap: 40px; align-items: center; }
.b2b3-badge { background: var(--navy); color: #fff; border-radius: 16px; padding: 22px 24px; box-shadow: 0 24px 60px rgba(10,30,60,.18); max-width: 420px; margin-left: auto; }
.b2b3-badge-top { display: flex; align-items: center; gap: 8px; font-family: var(--b2b-mono), monospace; letter-spacing: 2px; font-size: 13px; color: var(--gold); font-weight: 600; }
.b2b3-badge-outlets { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 14px 0; }
.b2b3-badge-outlets span { font-family: var(--b2b-display), sans-serif; font-weight: 800; font-size: 17px; }
.b2b3-badge-foot { font-size: 11.5px; color: #9FB0C6; }
/* quotes */
.b2b3-quotes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 32px; }
.b2b3-quote { margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 22px; }
.b2b3-quote blockquote { margin: 0 0 12px; font-size: 15.5px; line-height: 1.6; color: var(--body); }
.b2b3-quote figcaption { font-size: 13px; color: var(--muted); }
/* faq */
.b2b3-faq-wrap { max-width: 820px; }
.b2b3-faq { margin-top: 28px; background: var(--card); border: 1px solid var(--line); border-radius: 16px; }
.b2b3-faq details { border-bottom: 1px solid var(--line); padding: 16px 20px; }
.b2b3-faq details:last-child { border-bottom: 0; }
.b2b3-faq summary { cursor: pointer; font-weight: 800; font-size: 16px; list-style: none; display: flex; justify-content: space-between; gap: 12px; }
.b2b3-faq summary::-webkit-details-marker { display: none; }
.b2b3-faq summary span { color: var(--muted); transition: transform .2s; } .b2b3-faq details[open] summary span { transform: rotate(45deg); }
.b2b3-faq p { margin: 10px 0 0; font-size: 15px; line-height: 1.65; color: var(--body); }
/* footer */
.b2b3-footer { padding: 34px 0 48px; border-top: 1px solid var(--line); }
.b2b3-footer-in { display: grid; gap: 14px; }
.b2b3-footer p { font-size: 12.5px; line-height: 1.6; color: var(--muted); margin: 0; }
.b2b3-footer nav { display: flex; flex-wrap: wrap; gap: 8px 18px; }
.b2b3-footer nav a { font-size: 13px; font-weight: 700; color: var(--navy); text-decoration: none; }
/* modal */
.b2b3-modal { position: fixed; inset: 0; z-index: 100; background: rgba(10,30,60,.6); display: grid; place-items: center; padding: 20px; }
.b2b3-modal-in { position: relative; width: min(960px, 100%); max-height: 90vh; background: #fff; border-radius: 16px; padding: 22px 24px; overflow: auto; }
.b2b3-modal-x { position: absolute; top: 12px; right: 12px; border: 0; background: #EEF2F7; border-radius: 50%; width: 36px; height: 36px; display: grid; place-items: center; cursor: pointer; }
.b2b3-modal-frame { width: 100%; height: 75vh; border: 1px solid var(--line); border-radius: 12px; }
.b2b3-modal-empty { text-align: center; padding: 48px 20px; color: var(--body); }
.b2b3-modal-empty svg { color: var(--green); } .b2b3-modal-empty h3 { font-size: 20px; margin: 10px 0 8px; } .b2b3-modal-empty p { max-width: 520px; margin: 0 auto; line-height: 1.6; }
/* responsive (375px) */
@media (max-width: 960px) {
  .b2b3-hero-in, .b2b3-focus-in, .b2b3-badge-in, .b2b3-enterprise-in { grid-template-columns: 1fr; }
  .b2b3-steps { grid-template-columns: 1fr 1fr; } .b2b3-plans { grid-template-columns: 1fr; } .b2b3-quotes { grid-template-columns: 1fr; }
  .b2b3-collage { height: 320px; } .b2b3-badge { margin-left: 0; }
}
@media (max-width: 640px) {
  .b2b3-nav-links { display: none; }
  .b2b3-benefits { grid-template-columns: 1fr; }
  .b2b3-steps { grid-template-columns: 1fr; }
  .b2b3-section { padding: 52px 0; }
  .b2b3-collage { height: 260px; }
  .b2b3-marquee-track { flex-wrap: nowrap; justify-content: flex-start; width: max-content; animation: b2b3-marquee 22s linear infinite; }
  .b2b3-dup { display: inline; }
  @keyframes b2b3-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
}
@media (prefers-reduced-motion: reduce) { .b2b3-marquee-track { animation: none !important; } }
`;
