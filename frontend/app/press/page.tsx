"use client";
/**
 * press.insiderbuying.com — the B2B site (Round-2 brief, Section 4).
 *
 * A standalone page, deliberately not the consumer app: its own minimal
 * header, its own corporate navy/gold treatment, and one conversion goal —
 * book a discovery call. Rendered at /press so the subdomain can point here
 * (see docs/press-subdomain.md); the brief allows either a static page or a
 * Next.js route with its own layout.
 *
 * Structure follows 4A exactly: Header · Hero · The Opportunity · Services ·
 * How It Works · Editorial Platform · Packages · Book a Call. Copy in 4B and
 * 4C is verbatim.
 */
import { useState } from "react";
import { API_BASE } from "@/lib/api";

/**
 * Scroll to a section.
 *
 * This document fights every normal approach, thanks to the global
 * overflow:clip on html/body plus the 1.1 body zoom: the native hash jump,
 * window.scrollTo(), scrollIntoView() — and even scrollTo with
 * behavior:"smooth" — are all no-ops here (all measured on the live page).
 * The one call that moves it is documentElement.scrollTo with
 * behavior:"instant", so the easing is done by hand on top of that.
 */
function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const de = document.documentElement;
  const from = de.scrollTop;
  const distance = el.getBoundingClientRect().top;
  if (Math.abs(distance) < 2) return;
  const DURATION = 420;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / DURATION);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    de.scrollTo({ top: from + distance * eased, behavior: "instant" });
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function jumpTo(id: string) {
  return (e: React.MouseEvent) => {
    if (!document.getElementById(id)) return;
    e.preventDefault();
    scrollToId(id);
    history.replaceState(null, "", `#${id}`);
  };
}

/** 4C — three services, verbatim, with the brief's "From" prices. */
const SERVICES = [
  {
    kicker: "Press Release Distribution",
    title: "Signal Amplification",
    body: [
      "We transform your insider buying activity into professionally",
      "crafted press releases — distributed to the wire, emailed to our",
      "full subscriber list, and amplified across social media.",
      "This is not hype. This is signal amplification.",
    ],
    price: "From $4,889",
  },
  {
    kicker: "IR Campaigns",
    title: "Full-Stack Investor Acquisition",
    body: [
      "We build the funnel, write the copy, drive the traffic,",
      "and deliver qualified retail investors to your company's story.",
      "We measure everything. You see every dollar working.",
    ],
    price: "From $30,000",
  },
  {
    kicker: "Editorial Features",
    title: "CEO Interview & Sponsored Editorial",
    body: [
      "A published interview or editorial piece on InsiderBuying.com,",
      "distributed to our audience of investors who specifically follow",
      "what insiders are doing. Your story, in the right room.",
    ],
    price: "From $2,500",
  },
];

/** 4B — the trust bar, and 4A's "2-3 stat callouts on the audience". */
const STATS = [
  { big: "50,000+", label: "Subscribers" },
  { big: "8,000+", label: "Companies Covered" },
  { big: "4,000+", label: "Filings Scanned Daily" },
];

/** 4A — "3-step visual: Campaign built → Distributed to audience →
 *  Performance data delivered". */
const STEPS = [
  { n: "01", title: "Campaign built", body: "We shape the story around your filings and your milestones." },
  { n: "02", title: "Distributed to audience", body: "Wire, subscriber email and social — to investors who follow insider activity." },
  { n: "03", title: "Performance data delivered", body: "Opens, clicks, readership and reach, reported back to your team." },
];

/** 4D — "the three press release packages from the existing package deck —
 *  $4,889 / $14,889 / $48,889", named as 4A names them. The deck's inclusions
 *  are not in the brief, so nothing is invented here. */
const PACKAGES = [
  { name: "Essentials", price: "$4,889" },
  { name: "Conviction Campaign", price: "$14,889", featured: true },
  { name: "Go Viral", price: "$48,889" },
];

const CALENDLY = process.env.NEXT_PUBLIC_CALENDLY_URL || "";

export default function PressPage() {
  return (
    <div className="b2b">
      <Header />
      <Hero />
      <Opportunity />
      <Services />
      <HowItWorks />
      <Editorial />
      <Packages />
      <BookACall />
      <Footer />
      <style>{CSS}</style>
    </div>
  );
}

function Header() {
  return (
    <header className="b2b-header">
      <div className="b2b-wrap b2b-header-in">
        <div className="b2b-brand">
          <span className="b2b-logo">
            INSIDER<span>BUYING</span>
          </span>
          <span className="b2b-tagline">For Public Companies &amp; Investor Relations</span>
        </div>
        <a href="#book" onClick={jumpTo("book")} className="b2b-btn b2b-btn-gold b2b-btn-sm">
          Book a Call
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="b2b-hero">
      <div className="b2b-wrap">
        <p className="b2b-eyebrow">For Investor Relations Teams &amp; Public Companies</p>
        <h1 className="b2b-h1">
          Reach 50,000+ Investors Who
          <br />
          Actually Follow Insider Buying.
        </h1>
        <p className="b2b-sub">
          InsiderBuying.com is the platform serious retail investors,
          <br className="b2b-br" /> fund managers, and investment advisors use to track insider
          <br className="b2b-br" /> conviction. When your insiders buy stock, we help make sure
          <br className="b2b-br" /> the right investors notice.
        </p>
        <div className="b2b-ctas">
          <a href="#book" onClick={jumpTo("book")} className="b2b-btn b2b-btn-gold">
            Book a Discovery Call
          </a>
          <a href="#packages" onClick={jumpTo("packages")} className="b2b-btn b2b-btn-ghost">
            See Our Packages →
          </a>
        </div>
        <div className="b2b-trust">
          {STATS.map((s, i) => (
            <div key={s.label} className="b2b-trust-item">
              <b>{s.big}</b> <span>{s.label}</span>
              {i < STATS.length - 1 && <i aria-hidden>|</i>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Opportunity() {
  return (
    <section className="b2b-section">
      <div className="b2b-wrap">
        <p className="b2b-kicker">The Opportunity</p>
        <div className="b2b-stats">
          {STATS.map((s) => (
            <div key={s.label} className="b2b-stat">
              <b>{s.big}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Services() {
  return (
    <section className="b2b-section b2b-section-alt">
      <div className="b2b-wrap">
        <p className="b2b-kicker">Services</p>
        <div className="b2b-grid3">
          {SERVICES.map((s) => (
            <article key={s.title} className="b2b-card">
              <p className="b2b-card-kicker">{s.kicker}</p>
              <h3 className="b2b-card-title">{s.title}</h3>
              <p className="b2b-card-body">{s.body.join(" ")}</p>
              <p className="b2b-card-price">{s.price}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="b2b-section">
      <div className="b2b-wrap">
        <p className="b2b-kicker">How It Works</p>
        <div className="b2b-steps">
          {STEPS.map((s) => (
            <div key={s.n} className="b2b-step">
              <span className="b2b-step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Editorial() {
  return (
    <section className="b2b-section b2b-section-navy">
      <div className="b2b-wrap">
        <p className="b2b-kicker b2b-kicker-light">Editorial Platform</p>
        <p className="b2b-editorial">
          Your story published on InsiderBuying.com — read by investors who specifically follow
          insider activity
        </p>
      </div>
    </section>
  );
}

function Packages() {
  return (
    <section className="b2b-section" id="packages">
      <div className="b2b-wrap">
        <p className="b2b-kicker">Packages</p>
        <div className="b2b-grid3">
          {PACKAGES.map((p) => (
            <div key={p.name} className={`b2b-pkg${p.featured ? " b2b-pkg-hot" : ""}`}>
              <h3>{p.name}</h3>
              <div className="b2b-pkg-price">{p.price}</div>
              <a href="#book" onClick={jumpTo("book")} className="b2b-btn b2b-btn-ghost b2b-btn-block">
                Book a Discovery Call
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BookACall() {
  return (
    <section className="b2b-section b2b-section-alt" id="book">
      <div className="b2b-wrap">
        <p className="b2b-kicker">Book a Call</p>
        <h2 className="b2b-h2">Book a Discovery Call</h2>
        {CALENDLY ? (
          <div className="b2b-calendly">
            {/* Inline embed, not popup (brief 4D). */}
            <iframe
              src={CALENDLY}
              title="Book a discovery call"
              width="100%"
              height="700"
              frameBorder="0"
            />
          </div>
        ) : null}
        <LeadForm />
      </div>
    </section>
  );
}

function LeadForm() {
  const [form, setForm] = useState({
    name: "",
    company: "",
    ticker: "",
    email: "",
    phone: "",
    message: "",
  });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const field = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm({ ...form, [k]: e.target.value });
      setError(null);
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    if (!form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Please add your name and a valid work email.");
      return;
    }
    setState("sending");
    try {
      const res = await fetch(`${API_BASE}/b2b-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("failed");
      setState("sent");
    } catch {
      setError("That didn't send. Email us directly and we'll pick it up.");
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <div className="b2b-form b2b-form-done">
        <p>
          <b>Thank you — your request is in.</b>
        </p>
        <p>We&apos;ll be in touch within one business day to arrange the call.</p>
      </div>
    );
  }

  return (
    <form className="b2b-form" onSubmit={submit}>
      <div className="b2b-form-grid">
        <label>
          Name
          <input type="text" autoComplete="name" {...field("name")} required />
        </label>
        <label>
          Company
          <input type="text" autoComplete="organization" {...field("company")} />
        </label>
        <label>
          Ticker <span>(if listed)</span>
          <input type="text" {...field("ticker")} />
        </label>
        <label>
          Email
          <input type="email" autoComplete="email" {...field("email")} required />
        </label>
        <label>
          Phone
          <input type="tel" autoComplete="tel" {...field("phone")} />
        </label>
      </div>
      <label className="b2b-form-msg">
        Message
        <textarea rows={4} {...field("message")} />
      </label>
      {error && (
        <p className="b2b-form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="b2b-btn b2b-btn-gold" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Book a Discovery Call"}
      </button>
    </form>
  );
}

function Footer() {
  return (
    <footer className="b2b-footer">
      <div className="b2b-wrap b2b-footer-in">
        <span>
          InsiderBuying.com — for public companies &amp; investor relations
        </span>
        <a href="https://insiderbuying.com" className="b2b-footer-link">
          insiderbuying.com →
        </a>
      </div>
    </footer>
  );
}

/* Corporate and minimal on purpose (brief 4D: "Think McKinsey meets financial
   media — not the data dashboard aesthetic of the main site"), in the same
   navy/gold brand. Fixed palette: this page does not follow the app theme. */
const CSS = `
.b2b { --navy:#0D1F35; --navy-2:#12283f; --gold:#C8A24A; --ink:#0f1b2b; --muted:#5c6b7f;
  background:#ffffff; color:var(--ink); min-height:100vh;
  font-family: var(--font-sans), system-ui, sans-serif; }
.b2b-wrap { width:100%; max-width:1120px; margin:0 auto; padding:0 24px; }

.b2b-header { background:var(--navy); color:#fff; }
.b2b-header-in { display:flex; align-items:center; justify-content:space-between; gap:20px; height:76px; }
.b2b-brand { display:flex; align-items:center; gap:18px; min-width:0; }
.b2b-logo { font-family:var(--font-heading), var(--font-sans), sans-serif; font-weight:900;
  letter-spacing:0.5px; font-size:19px; line-height:1; }
.b2b-logo span { color:var(--gold); }
.b2b-tagline { font-size:12.5px; color:#b9c6d6; border-left:1px solid rgba(255,255,255,0.22);
  padding-left:18px; white-space:nowrap; }

.b2b-btn { display:inline-flex; align-items:center; justify-content:center; height:52px; padding:0 26px;
  border-radius:4px; font-size:15px; font-weight:700; text-decoration:none; border:1px solid transparent;
  cursor:pointer; transition:filter .15s ease, background .15s ease, color .15s ease; }
.b2b-btn-sm { height:40px; padding:0 18px; font-size:13.5px; }
.b2b-btn-gold { background:var(--gold); color:#10203A; }
.b2b-btn-gold:hover { filter:brightness(1.06); }
.b2b-btn-ghost { background:transparent; color:var(--navy); border-color:rgba(13,31,53,0.28); }
.b2b-btn-ghost:hover { background:rgba(13,31,53,0.05); }
.b2b-btn-block { width:100%; }
.b2b-btn:disabled { opacity:.7; cursor:default; }

.b2b-hero { background:var(--navy); color:#fff; padding:74px 0 66px; }
.b2b-eyebrow { font-size:12px; letter-spacing:1.6px; text-transform:uppercase; color:var(--gold);
  font-weight:700; margin:0 0 18px; }
.b2b-h1 { font-family:var(--font-heading), var(--font-sans), sans-serif; font-size:clamp(32px,4.6vw,54px);
  line-height:1.1; font-weight:800; letter-spacing:-0.8px; margin:0 0 22px; color:#ffffff; }
.b2b-sub { font-size:16.5px; line-height:1.72; color:#c9d6e4; max-width:640px; margin:0 0 32px; }
.b2b-ctas { display:flex; flex-wrap:wrap; gap:14px; }
.b2b-hero .b2b-btn-ghost { color:#fff; border-color:rgba(255,255,255,0.34); }
.b2b-hero .b2b-btn-ghost:hover { background:rgba(255,255,255,0.1); }
.b2b-trust { display:flex; flex-wrap:wrap; align-items:center; gap:14px; margin-top:40px;
  padding-top:26px; border-top:1px solid rgba(255,255,255,0.16); font-size:14px; color:#c9d6e4; }
.b2b-trust-item { display:inline-flex; align-items:center; gap:8px; }
.b2b-trust-item b { color:#fff; font-size:16px; }
.b2b-trust-item i { color:rgba(255,255,255,0.3); font-style:normal; margin-left:6px; }

.b2b-section { padding:66px 0; }
.b2b-section-alt { background:#f6f7f9; }
.b2b-section-navy { background:var(--navy-2); color:#fff; }
.b2b-kicker { font-size:11.5px; letter-spacing:1.7px; text-transform:uppercase; font-weight:700;
  color:var(--muted); margin:0 0 26px; }
.b2b-kicker-light { color:var(--gold); }
.b2b-h2 { font-family:var(--font-heading), var(--font-sans), sans-serif; font-size:clamp(24px,3vw,34px);
  font-weight:800; letter-spacing:-0.5px; margin:0 0 26px; color:var(--ink); }

.b2b-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:24px; }
.b2b-stat { border-left:3px solid var(--gold); padding:6px 0 6px 20px; }
.b2b-stat b { display:block; color:var(--ink); font-family:var(--font-heading), var(--font-sans), sans-serif;
  font-size:clamp(28px,3.4vw,40px); line-height:1.05; }
.b2b-stat span { display:block; font-size:13.5px; color:var(--muted); margin-top:8px;
  letter-spacing:0.4px; text-transform:uppercase; }

.b2b-grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:22px; }
.b2b-card { background:#fff; border:1px solid rgba(13,31,53,0.12); border-radius:6px; padding:26px 24px;
  display:flex; flex-direction:column; }
.b2b-card-kicker { font-size:11px; letter-spacing:1.3px; text-transform:uppercase; color:var(--gold);
  font-weight:700; margin:0 0 12px; }
.b2b-card-title { font-family:var(--font-heading), var(--font-sans), sans-serif; font-size:20px;
  font-weight:800; letter-spacing:-0.3px; margin:0 0 14px; color:var(--ink); }
.b2b-card-body { font-size:14.5px; line-height:1.7; color:#3d4b5c; margin:0 0 22px; }
.b2b-card-price { margin:auto 0 0; font-weight:800; font-size:15.5px; color:var(--navy); }

.b2b-steps { display:grid; grid-template-columns:repeat(3,1fr); gap:22px; }
.b2b-step { border-top:2px solid var(--navy); padding-top:18px; }
.b2b-step-n { font-family:var(--font-heading), var(--font-sans), sans-serif; font-size:13px;
  font-weight:800; color:var(--gold); letter-spacing:1px; }
.b2b-step h3 { font-size:18px; font-weight:800; margin:10px 0 8px; letter-spacing:-0.2px; color:var(--ink); }
.b2b-step p { font-size:14px; line-height:1.65; color:#3d4b5c; margin:0; }

.b2b-editorial { color:#ffffff; font-family:var(--font-heading), var(--font-sans), sans-serif;
  font-size:clamp(20px,2.6vw,30px); line-height:1.35; font-weight:700; letter-spacing:-0.4px;
  max-width:860px; margin:0; }

.b2b-pkg { border:1px solid rgba(13,31,53,0.14); border-radius:6px; padding:28px 24px; background:#fff; }
.b2b-pkg-hot { border-color:var(--gold); box-shadow:0 16px 40px rgba(13,31,53,0.08); }
.b2b-pkg h3 { font-family:var(--font-heading), var(--font-sans), sans-serif; font-size:19px;
  font-weight:800; margin:0 0 10px; color:var(--ink); }
.b2b-pkg-price { color:var(--ink); font-family:var(--font-heading), var(--font-sans), sans-serif; font-size:34px;
  font-weight:800; letter-spacing:-1px; margin:0 0 22px; }

.b2b-calendly { border:1px solid rgba(13,31,53,0.14); border-radius:6px; overflow:hidden;
  background:#fff; margin-bottom:28px; }
.b2b-calendly iframe { display:block; border:0; }

.b2b-form { background:#fff; border:1px solid rgba(13,31,53,0.14); border-radius:6px; padding:26px 24px; }
.b2b-form-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }
.b2b-form label { display:flex; flex-direction:column; gap:7px; font-size:12.5px; font-weight:700;
  letter-spacing:0.4px; text-transform:uppercase; color:var(--muted); }
.b2b-form label span { text-transform:none; letter-spacing:0; font-weight:500; }
.b2b-form input, .b2b-form textarea { border:1px solid rgba(13,31,53,0.2); border-radius:4px;
  padding:12px 13px; font-size:15px; font-family:inherit; color:var(--ink); background:#fff;
  text-transform:none; letter-spacing:0; font-weight:400; }
.b2b-form input:focus, .b2b-form textarea:focus { outline:none; border-color:var(--gold);
  box-shadow:0 0 0 3px rgba(200,162,74,0.18); }
.b2b-form-msg { margin-top:16px; }
.b2b-form-error { color:#b91c1c; font-size:13px; margin:14px 0 0; }
.b2b-form button { margin-top:18px; }
.b2b-form-done p { margin:0 0 6px; font-size:15.5px; }

.b2b-footer { background:var(--navy); color:#b9c6d6; padding:26px 0; font-size:13px; }
.b2b-footer-in { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; }
.b2b-footer-link { color:var(--gold); text-decoration:none; font-weight:700; }

@media (max-width: 900px) {
  .b2b-stats, .b2b-grid3, .b2b-steps { grid-template-columns:1fr; }
  .b2b-form-grid { grid-template-columns:1fr; }
  .b2b-tagline { display:none; }
  .b2b-br { display:none; }
}
`;
