"use client";

/**
 * Standalone "Insider Quality Score" lead-gen landing page.
 *
 * A 1:1 port of the approved static mock (insiderbuying-landing.html): same
 * palette, same Archivo/Nunito Sans/IBM Plex Mono type, same sections, same
 * animations, and the SAME illustrative demo data everywhere (feed, panels,
 * chart, stats) — per the client's sign-off on the mock. Only two things are
 * live because the mock itself is interactive there:
 *   - the stock search (Yahoo-backed /market-stats/search; the mock used a
 *     16-ticker demo list)
 *   - the email/SMS opt-in (POST /report-requests; delivery stubbed until a
 *     provider key lands — leads stay 'pending')
 * Renders without the site chrome via BARE_ROUTES in AppShell.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

interface SearchHit {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string | null;
}

interface FeedRow {
  id: string;
  ticker: string | null;
  insiderName: string;
  role: string;
  rawTitle: string;
  type?: "BUY" | "SELL";
  totalValue: number;
}

/* The mock's illustrative Form 4 feed, verbatim. */
const DEMO_FEED: FeedRow[] = [
  { id: "f1", ticker: "NVTR", insiderName: "CEO", role: "CEO", rawTitle: "CEO", type: "BUY", totalValue: 2_410_000 },
  { id: "f2", ticker: "HLXM", insiderName: "CFO", role: "CFO", rawTitle: "CFO", type: "BUY", totalValue: 886_500 },
  { id: "f3", ticker: "QRDA", insiderName: "Director", role: "Director", rawTitle: "Director", type: "SELL", totalValue: 1_120_000 },
  { id: "f4", ticker: "ARBN", insiderName: "10% Owner", role: "Other", rawTitle: "10% Owner", type: "BUY", totalValue: 5_050_000 },
  { id: "f5", ticker: "VELO", insiderName: "COO", role: "COO", rawTitle: "COO", type: "SELL", totalValue: 640_200 },
];

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export default function InsiderReportLanding() {
  const rootRef = useRef<HTMLDivElement>(null);

  /* scroll reveal + chart draw (same behaviour as the mock's script) */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll(".reveal"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.forEach((el) => el.classList.add("in"));
      root.querySelector("#chartCard")?.classList.add("drawn");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("in");
          if ((e.target as HTMLElement).id === "chartCard") e.target.classList.add("drawn");
          io.unobserve(e.target);
        });
      },
      { threshold: 0.15 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* gauge count-up */
  const gaugeRef = useRef<HTMLDivElement>(null);
  const [gaugeVal, setGaugeVal] = useState(0);
  useEffect(() => {
    const el = gaugeRef.current;
    if (!el) return;
    const target = 87.1;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          if (reduced) {
            setGaugeVal(target);
            return;
          }
          const t0 = performance.now();
          const dur = 1200;
          const step = (t: number) => {
            const p = Math.min((t - t0) / dur, 1);
            setGaugeVal(target * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* live search */
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<SearchHit | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((value: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    const query = value.trim();
    if (!query) {
      setHits([]);
      setOpen(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/market-stats/search?q=${encodeURIComponent(query)}&limit=6`,
        );
        const data = await res.json();
        setHits(Array.isArray(data?.rows) ? data.rows : []);
        setOpen(true);
      } catch {
        setHits([]);
        setOpen(false);
      }
    }, 220);
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!searchRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  /* opt-in gate */
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "sending" | "done">("idle");
  const contactRef = useRef<HTMLInputElement>(null);

  const choose = (s: SearchHit) => {
    setPicked(s);
    setQ(s.symbol);
    setOpen(false);
    setPhase("idle");
    setError(null);
    setTimeout(() => contactRef.current?.focus(), 50);
  };

  const setMode = (m: "email" | "sms") => {
    setChannel(m);
    setContact("");
    setError(null);
    contactRef.current?.focus();
  };

  const submit = async () => {
    if (!picked || phase === "sending") return;
    const v = contact.trim();
    const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
    const okPhone = /^[\d\s()+.-]{7,20}$/.test(v);
    if (channel === "email" ? !okEmail : !okPhone) {
      setError(
        channel === "email"
          ? "Please enter a valid email address."
          : "Please enter a valid phone number.",
      );
      return;
    }
    setError(null);
    setPhase("sending");
    try {
      const res = await fetch(`${API_BASE}/report-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: picked.symbol,
          companyName: picked.name,
          contact: v,
          channel,
          source: "insider-report-landing",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Something went wrong — try again.");
      }
      setPhase("done");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "Something went wrong — try again.");
    }
  };

  const gaugeFull = 314;
  const gaugeOffset = gaugeFull - (gaugeFull * gaugeVal) / 100;
  const shownFeed = DEMO_FEED;

  return (
    <div className="irl" ref={rootRef}>
      {/* mock stylesheet, scoped under .irl */}
      <style>{`
        .irl{
          --paper:#F5F7FA; --paper-raised:#FFFFFF; --ink:#0E1F35; --ink-soft:#5B6B7E;
          --rule:#DEE4EC; --buy:#3E9B5F; --buy-soft:#E9F6EE; --sell:#C0503C;
          --sell-soft:#F8ECE8; --spx:#93A1B3; --hilite:#E8B54D; --accent:#3B7FB0;
          --max:1120px;
          background:var(--paper); color:var(--ink);
          font-family:var(--irl-nunito),system-ui,sans-serif;
          font-size:17px; line-height:1.6; -webkit-font-smoothing:antialiased;
        }
        .irl *{margin:0;padding:0;box-sizing:border-box}
        .irl .mono{font-family:var(--irl-mono),monospace}
        .irl .wrap{max-width:var(--max);margin:0 auto;padding:0 24px}
        .irl a{color:inherit}
        .irl button{font:inherit;cursor:pointer}

        .irl header{border-bottom:1px solid var(--rule);background:#fff;position:sticky;top:0;z-index:20}
        .irl .nav{display:flex;align-items:center;justify-content:space-between;height:64px}
        .irl .brand{font-family:var(--irl-archivo),sans-serif;font-weight:900;letter-spacing:.06em;text-transform:uppercase;font-size:19px;color:var(--ink);text-decoration:none;flex-shrink:0}
        .irl .nav-links{display:flex;gap:28px;font-size:15px;font-weight:500;color:var(--ink-soft)}
        .irl .nav-links a{text-decoration:none}
        .irl .nav-links a:hover{color:var(--ink)}
        .irl .btn{display:inline-block;background:var(--ink);color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 22px;border-radius:8px;border:1px solid var(--ink);transition:background .15s}
        .irl .btn:hover{background:#22304a}
        .irl .btn:focus-visible,.irl a:focus-visible,.irl input:focus-visible,.irl button:focus-visible{outline:3px solid var(--buy);outline-offset:2px}
        .irl .btn.big{padding:15px 30px;font-size:16px}

        .irl .hero{padding:64px 0 72px;border-bottom:1px solid var(--rule)}
        .irl .hero-stack{display:flex;flex-direction:column;align-items:center;gap:40px}
        .irl .hero-copy{text-align:center;max-width:760px}
        .irl .eyebrow{font-family:var(--irl-archivo),sans-serif;font-weight:800;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);margin-bottom:18px;display:flex;align-items:center;gap:10px}
        .irl .hero-copy .eyebrow{justify-content:center}
        .irl h1{font-family:var(--irl-archivo),sans-serif;font-weight:800;font-size:clamp(38px,4.6vw,58px);line-height:1.08;letter-spacing:-.015em;margin-bottom:22px}
        .irl h1 em,.irl h2 em{font-style:normal;color:var(--accent)}
        .irl .hl{background:var(--buy-soft);border:1px solid var(--buy);color:#2E7D4C;border-radius:999px;padding:2px 12px;font-weight:700;box-decoration-break:clone;-webkit-box-decoration-break:clone}
        .irl .hero p.lede{font-size:19px;color:var(--ink-soft);max-width:44ch;margin:0 auto}
        .irl .fineprint{font-size:13px;color:var(--ink-soft)}

        .irl .filing{background:var(--paper-raised);border:1px solid var(--rule);border-radius:12px;box-shadow:0 12px 32px rgba(16,26,43,.08);overflow:hidden}
        .irl .filing-head{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-bottom:1px solid var(--rule);font-family:var(--irl-mono),monospace;font-size:12px;color:var(--ink-soft);letter-spacing:.05em;text-transform:uppercase}
        .irl .live-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--buy);margin-right:7px;animation:irl-pulse 2s infinite}
        @keyframes irl-pulse{0%,100%{opacity:1}50%{opacity:.35}}
        .irl table{width:100%;border-collapse:collapse;font-size:14px}
        .irl td,.irl th{padding:11px 18px;text-align:left;white-space:nowrap}
        .irl th{font-family:var(--irl-mono),monospace;font-weight:500;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-soft);border-bottom:1px solid var(--rule)}
        .irl tbody tr+tr td{border-top:1px solid #ECF0F5}
        .irl .tick{font-family:var(--irl-mono),monospace;font-weight:600}
        .irl .code{font-family:var(--irl-mono),monospace;font-size:12px;font-weight:600;padding:3px 8px;border-radius:6px}
        .irl .code.p{background:var(--buy-soft);color:var(--buy)}
        .irl .code.s{background:var(--sell-soft);color:var(--sell)}
        .irl .amt{font-family:var(--irl-mono),monospace}
        .irl tr.hi td{background:#EDF7F0}
        .irl .filing-foot{padding:10px 18px;font-size:12px;color:var(--ink-soft);border-top:1px solid var(--rule);font-family:var(--irl-mono),monospace}

        .irl section{padding:88px 0}
        .irl .sec-head{max-width:680px;margin-bottom:56px}
        .irl h2{font-family:var(--irl-archivo),sans-serif;font-weight:800;font-size:clamp(30px,3.4vw,42px);line-height:1.12;letter-spacing:-.012em;margin-bottom:16px}
        .irl .sec-head p{color:var(--ink-soft);font-size:18px}

        .irl .chart-card{background:var(--paper-raised);border:1px solid var(--rule);border-radius:12px;padding:32px 32px 24px;box-shadow:0 12px 32px rgba(16,26,43,.06)}
        .irl .chart-top{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:12px;margin-bottom:20px}
        .irl .chart-title{font-weight:600;font-size:16px}
        .irl .legend{display:flex;gap:22px;flex-wrap:wrap;font-size:13px;color:var(--ink-soft)}
        .irl .key{display:flex;align-items:center;gap:8px}
        .irl .swatch{width:18px;height:3px;border-radius:6px}
        .irl .chart-note{font-size:12.5px;color:var(--ink-soft);margin-top:16px;font-family:var(--irl-mono),monospace}
        .irl svg text{font-family:var(--irl-mono),monospace}
        .irl .line-path{stroke-dasharray:1600;stroke-dashoffset:1600}
        .irl .drawn .line-path{animation:irl-draw 1.6s ease-out forwards}
        .irl .drawn .line-path.d2{animation-delay:.25s}
        .irl .drawn .line-path.d3{animation-delay:.5s}
        @keyframes irl-draw{to{stroke-dashoffset:0}}
        @media (prefers-reduced-motion:reduce){
          .irl .line-path{stroke-dashoffset:0;animation:none!important}
          .irl .live-dot{animation:none}
          .irl .reveal{opacity:1!important;transform:none!important;transition:none!important}
        }

        .irl .stat-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--rule);border:1px solid var(--rule);border-radius:12px;overflow:hidden;margin-top:28px}
        .irl .stat{background:var(--paper-raised);padding:24px 26px}
        .irl .stat .label{font-family:var(--irl-mono),monospace;font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);margin-bottom:8px}
        .irl .stat .value{font-family:var(--irl-archivo),sans-serif;font-size:36px;font-weight:800;line-height:1}
        .irl .stat .value.up{color:var(--buy)}
        .irl .stat .value.down{color:var(--sell)}
        .irl .stat .sub{font-size:13px;color:var(--ink-soft);margin-top:8px}

        .irl .split{display:grid;grid-template-columns:1fr 1fr;gap:28px}
        .irl .panel{border:1px solid var(--rule);border-radius:12px;background:var(--paper-raised);overflow:hidden}
        .irl .panel-head{padding:22px 26px;border-bottom:1px solid var(--rule);display:flex;justify-content:space-between;align-items:center;gap:12px}
        .irl .panel-head h3{font-family:var(--irl-archivo),sans-serif;font-weight:800;font-size:23px}
        .irl .delta{font-family:var(--irl-mono),monospace;font-weight:600;font-size:15px}
        .irl .delta.up{color:var(--buy)}
        .irl .delta.down{color:var(--sell)}

        .irl .rookie{border-top:1px solid var(--rule)}
        .irl .rookie-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:stretch}
        .irl .verdict{border-radius:12px;border:1px solid var(--rule);background:var(--paper-raised);padding:32px;position:relative}
        .irl .verdict.bad{border-top:4px solid var(--sell)}
        .irl .verdict.good{border-top:4px solid var(--buy)}
        .irl .verdict .tag{font-family:var(--irl-mono),monospace;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;display:inline-block;padding:4px 10px;border-radius:6px;margin-bottom:18px}
        .irl .verdict.bad .tag{background:var(--sell-soft);color:var(--sell)}
        .irl .verdict.good .tag{background:var(--buy-soft);color:var(--buy)}
        .irl .verdict h3{font-family:var(--irl-archivo),sans-serif;font-weight:800;font-size:26px;margin-bottom:14px;line-height:1.2}
        .irl .verdict ul{list-style:none;margin-top:18px}
        .irl .verdict li{padding:12px 0;border-top:1px solid #ECF0F5;font-size:15.5px;color:var(--ink-soft);display:flex;gap:12px}
        .irl .verdict li strong{color:var(--ink)}
        .irl .verdict li::before{font-family:var(--irl-mono),monospace;font-weight:600;flex-shrink:0}
        .irl .verdict.bad li::before{content:"✕";color:var(--sell)}
        .irl .verdict.good li::before{content:"✓";color:var(--buy)}
        .irl .rookie-kicker{margin-top:36px;max-width:760px;font-size:18px;color:var(--ink-soft)}
        .irl .rookie-kicker strong{color:var(--ink)}

        .irl .score-sec{background:var(--ink);color:#ECF0F5;border-top:1px solid var(--ink)}
        .irl .score-sec h2{color:#fff}
        .irl .score-sec .sec-head p{color:#A9B2C2}
        .irl .score-sec .eyebrow{color:var(--hilite)}
        .irl .score-flow{display:grid;grid-template-columns:1fr 72px 1fr;gap:0;align-items:center}
        .irl .inputs{display:grid;gap:14px}
        .irl .factor{border:1px solid #2A3650;background:#16213A;border-radius:12px;padding:18px 22px;display:flex;gap:16px;align-items:flex-start}
        .irl .factor .f-id{font-family:var(--irl-mono),monospace;font-weight:600;font-size:13px;color:var(--hilite);border:1px solid #3A4966;border-radius:6px;width:28px;height:28px;display:grid;place-items:center;flex-shrink:0;margin-top:2px}
        .irl .factor h4{font-size:15.5px;font-weight:600;color:#fff;margin-bottom:3px}
        .irl .factor p{font-size:13.5px;color:#A9B2C2;line-height:1.5}
        .irl .factor.plus{border-style:dashed;background:transparent}
        .irl .flow-arrow{display:grid;place-items:center;color:#3A4966}
        .irl .score-out{border:1px solid #2A3650;background:#16213A;border-radius:12px;padding:36px 32px;text-align:center}
        .irl .gauge-wrap{position:relative;width:230px;margin:0 auto 10px}
        .irl .gauge-num{position:absolute;inset:0;display:grid;place-items:center;padding-top:34px}
        .irl .gauge-num .n{font-family:var(--irl-archivo),sans-serif;font-size:64px;font-weight:800;color:#fff;line-height:1}
        .irl .gauge-num .d{font-family:var(--irl-mono),monospace;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#A9B2C2;margin-top:4px}
        .irl .gauge-arc{transition:stroke-dashoffset 1.2s ease}
        .irl .score-out .verdict-line{font-family:var(--irl-mono),monospace;font-size:13px;color:var(--hilite);margin-bottom:22px}
        .irl .score-chips{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}
        .irl .chip{font-family:var(--irl-mono),monospace;font-size:13px;font-weight:600;padding:6px 12px;border-radius:6px;border:1px solid #2A3650;color:#A9B2C2}
        .irl .chip b{font-weight:600}
        .irl .chip .g{color:#5ED49A}.irl .chip .y{color:var(--hilite)}.irl .chip .r{color:#E98A78}
        .irl .score-note{margin-top:28px;text-align:center;font-size:13px;color:#A9B2C2}

        .irl .lookup{border-top:1px solid var(--rule)}
        .irl .lookup-card{max-width:680px;margin:0 auto;background:var(--paper-raised);border:1px solid var(--rule);border-radius:12px;box-shadow:0 16px 40px rgba(16,26,43,.1);overflow:visible;scroll-margin-top:84px}
        .irl .lookup-head{padding:26px 28px 0;text-align:center}
        .irl .lookup-head h3{font-family:var(--irl-archivo),sans-serif;font-weight:800;font-size:25px;margin-bottom:6px}
        .irl .lookup-head p{color:var(--ink-soft);font-size:15px}
        .irl .lookup-body{padding:22px 28px 28px}
        .irl .hero .lookup-card{width:100%;max-width:720px;border-top:4px solid var(--hilite)}
        .irl .searchbox{position:relative}
        .irl .searchbox input{width:100%;padding:16px 18px 16px 48px;font:600 17px var(--irl-mono),monospace;border:2px solid var(--ink);border-radius:8px;background:var(--paper);color:var(--ink);text-transform:uppercase}
        .irl .searchbox input::placeholder{color:#9AA3B4;font-weight:500;text-transform:none;font-family:var(--irl-nunito),sans-serif}
        .irl .searchbox .mag{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:var(--ink-soft)}
        .irl .results{list-style:none;position:absolute;left:0;right:0;z-index:30;background:var(--paper-raised);border:1px solid var(--rule);border-top:none;border-radius:0 0 8px 8px;max-height:240px;overflow:auto;box-shadow:0 14px 30px rgba(16,26,43,.14)}
        .irl .results li{padding:12px 18px;display:flex;justify-content:space-between;gap:14px;cursor:pointer;border-top:1px solid #ECF0F5;font-size:15px}
        .irl .results li:hover{background:#EDF7F0}
        .irl .results li .nm{color:var(--ink-soft);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .irl .results li.none{cursor:default;color:var(--ink-soft);justify-content:center}
        .irl .results li.none:hover{background:none}

        .irl .picked{margin-top:22px}
        .irl .picked-stock{display:flex;justify-content:space-between;align-items:center;gap:16px;border:1px solid var(--rule);border-radius:12px;padding:18px 22px;background:var(--paper)}
        .irl .picked-stock .l .t{font-family:var(--irl-mono),monospace;font-weight:600;font-size:20px}
        .irl .picked-stock .l .n{font-size:13.5px;color:var(--ink-soft)}
        .irl .locked-score{text-align:right}
        .irl .locked-score .val{font-family:var(--irl-archivo),sans-serif;font-size:34px;font-weight:800;filter:blur(9px);user-select:none}
        .irl .locked-score .lock{font-family:var(--irl-mono),monospace;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-soft)}
        .irl .gate{margin-top:22px}
        .irl .gate-label{font-weight:600;font-size:15px;margin-bottom:10px}
        .irl .toggle{display:inline-flex;border:1px solid var(--rule);border-radius:8px;overflow:hidden;margin-bottom:14px}
        .irl .toggle button{padding:9px 18px;font-size:14px;font-weight:600;background:var(--paper-raised);border:none;color:var(--ink-soft)}
        .irl .toggle button.on{background:var(--ink);color:#fff}
        .irl .gate-row{display:flex;gap:10px}
        .irl .gate-row .btn{white-space:nowrap}
        .irl .gate-row input{flex:1;padding:14px 16px;font-size:16px;border:1px solid var(--ink);border-radius:8px;background:var(--paper-raised);color:var(--ink)}
        .irl .gate .err{color:var(--sell);font-size:13.5px;margin-top:8px;font-weight:500}
        .irl .gate .consent{font-size:12.5px;color:var(--ink-soft);margin-top:12px}

        .irl .done{text-align:center;padding:10px 0 4px}
        .irl .done .stamp{display:inline-block;font-family:var(--irl-mono),monospace;font-weight:600;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--buy);border:2px solid var(--buy);border-radius:8px;padding:8px 16px;margin-bottom:18px}
        .irl .done h4{font-family:var(--irl-archivo),sans-serif;font-weight:800;font-size:26px;margin-bottom:8px}
        .irl .done p{color:var(--ink-soft);font-size:15.5px;max-width:42ch;margin:0 auto}
        .irl .lookup-foot{padding:14px 32px;border-top:1px solid var(--rule);font-family:var(--irl-mono),monospace;font-size:12px;color:var(--ink-soft);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}

        .irl footer{border-top:1px solid var(--rule);padding:36px 0;font-size:13px;color:var(--ink-soft)}
        .irl .foot{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}

        .irl .reveal{opacity:0;transform:translateY(18px);transition:opacity .6s ease,transform .6s ease}
        .irl .reveal.in{opacity:1;transform:none}

        @media (max-width:920px){
          .irl .split,.irl .rookie-grid{grid-template-columns:1fr;gap:36px}
          .irl .hero-copy{text-align:left}
          .irl .hero-copy .eyebrow{justify-content:flex-start}
          .irl .gate-row{flex-direction:column}
          .irl .score-flow{grid-template-columns:1fr}
          .irl .flow-arrow{transform:rotate(90deg);padding:10px 0}
          .irl .stat-strip{grid-template-columns:1fr}
          .irl .nav-links{display:none}
          .irl section{padding:64px 0}
          .irl .hero{padding:56px 0}
        }
      `}</style>

      <header>
        <div className="wrap nav">
          <a className="brand" href="#top" aria-label="Insider Buying">
            {/* Site wordmark; the page is light-committed, so always the dark-text version. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-wordmark-dark-text.png"
              alt="Insider Buying"
              style={{ height: 44, width: "auto", display: "block" }}
              className="select-none"
            />
          </a>
          <nav className="nav-links">
            <a href="#buying">Buying index</a>
            <a href="#rookie">The rookie mistake</a>
            <a href="#score">Quality Score</a>
          </nav>
          <a className="btn" href="#lookup">Check a stock</a>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="hero" id="top">
        <div className="wrap hero-stack">
          <div className="hero-copy">
            <div className="eyebrow">Built on SEC Form 4 filings</div>
            <h1>
              Thousands of stocks. Pick the right ones, and you can be <em>wealthy</em>.
            </h1>
            <p className="lede">
              For over 30 years, corporate insiders buying their own stock have outperformed
              the market by <strong>7%+ per year</strong>.{" "}
              <span className="hl">
                <strong>It pays to know what stocks insiders are buying, right now.</strong>
              </span>
            </p>
          </div>

          {/* signature object: interactive score lookup, above the fold */}
          <div className="lookup-card reveal" id="lookup">
            <div className="lookup-head">
              <h3>
                Find out what insiders are <em>really</em> doing.
              </h3>
              <p>Search any stock to get its Insider Quality Score and full report.</p>
            </div>
            <div className="lookup-body">
              <div className="searchbox" ref={searchRef}>
                <svg className="mag" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                  <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M13 13l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    runSearch(e.target.value);
                  }}
                  type="text"
                  placeholder="Search any stock — ticker or company name"
                  autoComplete="off"
                  aria-label="Search for a stock"
                />
                {open && (
                  <ul className="results" role="listbox">
                    {hits.length === 0 ? (
                      <li className="none">No matches — try AAPL, NVDA, TSLA…</li>
                    ) : (
                      hits.map((s) => (
                        <li
                          key={`${s.symbol}-${s.exchange}`}
                          role="option"
                          aria-selected={false}
                          onClick={() => choose(s)}
                        >
                          <span className="tick">{s.symbol}</span>
                          <span className="nm">
                            {s.name}
                            {s.exchange ? ` · ${s.exchange}` : ""}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>

              {picked && (
                <div className="picked">
                  <div className="picked-stock">
                    <div className="l">
                      <div className="t">{picked.symbol}</div>
                      <div className="n">{picked.name}</div>
                    </div>
                    <div className="locked-score">
                      <div className="val" aria-hidden="true">87.1</div>
                      <div className="lock">🔒 Score locked</div>
                    </div>
                  </div>

                  {phase !== "done" ? (
                    <div className="gate">
                      <div className="gate-label" style={{ marginTop: 22 }}>
                        Where should we send the insider report?
                      </div>
                      <div className="toggle" role="tablist">
                        <button
                          type="button"
                          className={channel === "email" ? "on" : ""}
                          onClick={() => setMode("email")}
                        >
                          Email
                        </button>
                        <button
                          type="button"
                          className={channel === "sms" ? "on" : ""}
                          onClick={() => setMode("sms")}
                        >
                          SMS
                        </button>
                      </div>
                      <div className="gate-row">
                        <input
                          ref={contactRef}
                          type={channel === "email" ? "email" : "tel"}
                          value={contact}
                          onChange={(e) => setContact(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && submit()}
                          placeholder={channel === "email" ? "you@example.com" : "(555) 123-4567"}
                          aria-label="Email address or phone number"
                        />
                        <button
                          className="btn big"
                          type="button"
                          onClick={submit}
                          disabled={phase === "sending"}
                        >
                          {phase === "sending" ? "Sending…" : "Get the insider report"}
                        </button>
                      </div>
                      {error && <p className="err">{error}</p>}
                      <p className="consent">
                        By requesting the report you agree to receive it by email or SMS, plus
                        occasional insider alerts. Unsubscribe anytime. Msg &amp; data rates may
                        apply.
                      </p>
                    </div>
                  ) : (
                    <div className="done">
                      <span className="stamp">✓ Report requested</span>
                      <h4>Your insider report for {picked.symbol} is on its way.</h4>
                      <p>
                        Check your {channel === "email" ? "inbox" : "messages"} in the next few
                        minutes. It includes the Insider Quality Score, every recent insider
                        transaction, and what the smart money is signaling.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="lookup-foot">
              <span>5,000+ U.S. stocks covered</span>
              <span>Data: SEC EDGAR Form 4</span>
            </div>
          </div>
        </div>
      </section>

      {/* ================= BUYING INDEX ================= */}
      <section id="buying">
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="eyebrow">Insider Buying Index</div>
            <h2>When insiders buy with their own money, the market tends to follow.</h2>
            <p>
              Our Insider Buying Index tracks stocks with clustered open-market purchases by
              executives — measured against the S&amp;P 500.
            </p>
          </div>

          <div className="chart-card reveal" id="chartCard">
            <div className="chart-top">
              <div className="chart-title">Cumulative return, trailing 5 years</div>
              <div className="legend">
                <span className="key">
                  <span className="swatch" style={{ background: "var(--buy)" }} />
                  Insider Buying Index
                </span>
                <span className="key">
                  <span className="swatch" style={{ background: "var(--spx)" }} />
                  S&amp;P 500
                </span>
                <span className="key">
                  <span className="swatch" style={{ background: "var(--sell)" }} />
                  Insider Selling Index
                </span>
              </div>
            </div>
            <svg
              viewBox="0 0 900 380"
              role="img"
              aria-label="Line chart: Insider Buying Index rising well above the S&P 500, Insider Selling Index trailing below it"
              style={{ width: "100%", height: "auto" }}
            >
              <g stroke="#E7ECF2" strokeWidth="1">
                <line x1="60" y1="40" x2="880" y2="40" />
                <line x1="60" y1="110" x2="880" y2="110" />
                <line x1="60" y1="180" x2="880" y2="180" />
                <line x1="60" y1="250" x2="880" y2="250" />
                <line x1="60" y1="320" x2="880" y2="320" />
              </g>
              <g fill="#93A1B3" fontSize="12">
                <text x="50" y="44" textAnchor="end">+160%</text>
                <text x="50" y="114" textAnchor="end">+120%</text>
                <text x="50" y="184" textAnchor="end">+80%</text>
                <text x="50" y="254" textAnchor="end">+40%</text>
                <text x="50" y="324" textAnchor="end">0%</text>
                <text x="60" y="350">2021</text>
                <text x="255" y="350">2022</text>
                <text x="455" y="350">2023</text>
                <text x="655" y="350">2024</text>
                <text x="845" y="350">2025</text>
              </g>
              <path
                className="line-path d3"
                d="M60,320 C140,318 190,330 260,326 C340,322 400,336 470,328 C560,318 640,324 720,314 C790,306 840,304 880,298"
                fill="none"
                stroke="var(--sell)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                className="line-path d2"
                d="M60,320 C150,300 200,312 270,290 C350,264 410,286 480,258 C570,224 650,232 730,204 C800,182 840,176 880,166"
                fill="none"
                stroke="var(--spx)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                className="line-path"
                d="M60,320 C150,288 210,296 280,258 C360,216 420,232 490,186 C580,132 650,138 730,96 C800,62 840,56 880,44"
                fill="none"
                stroke="var(--buy)"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <g fontSize="12" fontWeight="600">
                <text x="886" y="48" fill="var(--buy)">+158%</text>
                <text x="886" y="170" fill="var(--spx)">+89%</text>
                <text x="886" y="302" fill="var(--sell)">+13%</text>
              </g>
            </svg>
            <p className="chart-note">
              Hypothetical illustration. Past performance does not guarantee future results.
            </p>
          </div>

          <div className="stat-strip reveal">
            <div className="stat">
              <div className="label">Buying index vs S&amp;P 500</div>
              <div className="value up">+69 pts</div>
              <div className="sub">Cumulative outperformance, 5-yr illustration</div>
            </div>
            <div className="stat">
              <div className="label">Selling index vs S&amp;P 500</div>
              <div className="value down">−76 pts</div>
              <div className="sub">Cumulative underperformance, 5-yr illustration</div>
            </div>
            <div className="stat">
              <div className="label">Filings tracked</div>
              <div className="value">40k+/yr</div>
              <div className="sub">Every Form 4, parsed within minutes</div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= TWO PANELS ================= */}
      <section id="selling" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="split">
            <div className="panel reveal">
              <div className="panel-head">
                <h3>Stocks with insider buying</h3>
                <span className="delta up">▲ beats S&amp;P 500</span>
              </div>
              <table>
                <thead>
                  <tr><th>Ticker</th><th>Insider buys (90d)</th><th>Return vs S&amp;P</th></tr>
                </thead>
                <tbody>
                  <tr><td className="tick">NVTR</td><td className="amt">$6.2M · 4 insiders</td><td className="amt" style={{ color: "var(--buy)" }}>+22.4%</td></tr>
                  <tr><td className="tick">ARBN</td><td className="amt">$5.1M · 2 insiders</td><td className="amt" style={{ color: "var(--buy)" }}>+17.9%</td></tr>
                  <tr><td className="tick">HLXM</td><td className="amt">$2.3M · 3 insiders</td><td className="amt" style={{ color: "var(--buy)" }}>+11.6%</td></tr>
                  <tr><td className="tick">SOLV</td><td className="amt">$1.8M · 5 insiders</td><td className="amt" style={{ color: "var(--buy)" }}>+9.2%</td></tr>
                </tbody>
              </table>
              <div className="filing-foot">Illustrative data · Clustered buying is the strongest signal</div>
            </div>
            <div className="panel reveal">
              <div className="panel-head">
                <h3>Stocks with insider selling</h3>
                <span className="delta down">▼ lags the market</span>
              </div>
              <table>
                <thead>
                  <tr><th>Ticker</th><th>Insider sales (90d)</th><th>Return vs S&amp;P</th></tr>
                </thead>
                <tbody>
                  <tr><td className="tick">QRDA</td><td className="amt">$9.4M · 6 insiders</td><td className="amt" style={{ color: "var(--sell)" }}>−14.1%</td></tr>
                  <tr><td className="tick">VELO</td><td className="amt">$4.7M · 3 insiders</td><td className="amt" style={{ color: "var(--sell)" }}>−8.8%</td></tr>
                  <tr><td className="tick">MRLN</td><td className="amt">$3.2M · 4 insiders</td><td className="amt" style={{ color: "var(--sell)" }}>−6.5%</td></tr>
                  <tr><td className="tick">TYCO</td><td className="amt">$2.9M · 2 insiders</td><td className="amt" style={{ color: "var(--sell)" }}>−3.7%</td></tr>
                </tbody>
              </table>
              <div className="filing-foot">Illustrative data · Heavy selling often precedes weakness</div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= ROOKIE MISTAKE ================= */}
      <section className="rookie" id="rookie">
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="eyebrow">Not all insider buying is equal</div>
            <h2>
              Copying every insider buy is a <em>rookie mistake</em>.
            </h2>
            <p>
              Most insider transactions are noise — routine, scheduled, or too small to mean
              anything. Buying a stock just because one insider bought shares won&apos;t net
              positive results. The signal is in <strong>which</strong> insiders buy,{" "}
              <strong>how much</strong>, and <strong>whether they&apos;re buying together</strong>.
            </p>
          </div>

          <div className="rookie-grid">
            <div className="verdict bad reveal">
              <span className="tag">Noise — the rookie trade</span>
              <h3>&quot;An insider bought. I&apos;m in.&quot;</h3>
              <ul>
                <li><span><strong>Option exercises</strong> dressed up as purchases — compensation, not conviction.</span></li>
                <li><span><strong>Scheduled 10b5-1 plan buys</strong> — automatic trades set months in advance.</span></li>
                <li><span><strong>Token purchases</strong> — a $15k buy from an executive earning $4M a year.</span></li>
                <li><span><strong>A lone director nibbling</strong> — one small buy, no one else following.</span></li>
              </ul>
            </div>
            <div className="verdict good reveal">
              <span className="tag">Signal — what actually predicts returns</span>
              <h3>&quot;The people who know best are loading up.&quot;</h3>
              <ul>
                <li><span><strong>Open-market buys, big for the company</strong> — $5M into a $300M small cap, not a $500B giant.</span></li>
                <li><span><strong>Clusters</strong> — CEO, CFO, and directors all buying within weeks of each other.</span></li>
                <li><span><strong>Senior conviction</strong> — the executives closest to the numbers, not junior insiders.</span></li>
                <li><span><strong>Real stake growth</strong> — a CFO doubling their position, not adding 1%.</span></li>
              </ul>
            </div>
          </div>

          <p className="rookie-kicker reveal">
            Separating the two by hand means reading thousands of filings.{" "}
            <strong>So we score every stock instead.</strong>
          </p>
        </div>
      </section>

      {/* ================= INSIDER QUALITY SCORE ================= */}
      <section className="score-sec" id="score">
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="eyebrow">New</div>
            <h2>The Insider Quality Score. Every stock, rated 0–100.</h2>
            <p>
              One number that measures the size, intensity, and significance of insider buying
              — so you never mistake noise for conviction again.
            </p>
          </div>

          <div className="score-flow reveal">
            <div className="inputs">
              <div className="factor">
                <span className="f-id">A</span>
                <div>
                  <h4>Purchase volume vs. market cap</h4>
                  <p>A $5M buy is huge for a $50M company and a rounding error for a $500B one. Size is measured relative to the company.</p>
                </div>
              </div>
              <div className="factor">
                <span className="f-id">B</span>
                <div>
                  <h4>Cluster buying</h4>
                  <p>One insider buying is good. The CEO, CFO, and multiple directors all buying within weeks is a much stronger signal.</p>
                </div>
              </div>
              <div className="factor">
                <span className="f-id">C</span>
                <div>
                  <h4>Insider role weighting</h4>
                  <p>A CEO or CFO purchase means more than a director&apos;s, which means more than a lower-level insider&apos;s.</p>
                </div>
              </div>
              <div className="factor">
                <span className="f-id">D</span>
                <div>
                  <h4>Holding change</h4>
                  <p>A CFO who doubles their stake is making a real commitment. An executive adding 1% to a huge position isn&apos;t.</p>
                </div>
              </div>
              <div className="factor plus">
                <span className="f-id">+</span>
                <div>
                  <h4>Analyst ratings &amp; news sentiment</h4>
                  <p>Wall Street consensus, implied upside to price targets, and AI-scored tone of the last two weeks of coverage.</p>
                </div>
              </div>
            </div>

            <div className="flow-arrow" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 40 40">
                <path
                  d="M4 20h26M22 10l10 10-10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="score-out" ref={gaugeRef}>
              <div className="gauge-wrap">
                <svg
                  viewBox="0 0 230 130"
                  style={{ width: "100%", height: "auto" }}
                  role="img"
                  aria-label="Gauge showing an Insider Quality Score of 87.1 out of 100"
                >
                  <path
                    d="M15 120 A100 100 0 0 1 215 120"
                    fill="none"
                    stroke="#2A3650"
                    strokeWidth="14"
                    strokeLinecap="round"
                  />
                  <path
                    className="gauge-arc"
                    d="M15 120 A100 100 0 0 1 215 120"
                    fill="none"
                    stroke="#5ED49A"
                    strokeWidth="14"
                    strokeLinecap="round"
                    strokeDasharray={gaugeFull}
                    strokeDashoffset={gaugeOffset}
                  />
                </svg>
                <div className="gauge-num">
                  <div>
                    <span className="n">{gaugeVal.toFixed(1)}</span>
                    <div className="d">Insider Quality Score</div>
                  </div>
                </div>
              </div>
              <div className="verdict-line">STRONG INSIDER CONVICTION</div>
              <div className="score-chips">
                <span className="chip"><b className="g">92.3</b> Elite</span>
                <span className="chip"><b className="g">87.5</b> Strong</span>
                <span className="chip"><b className="y">61.0</b> Mixed</span>
                <span className="chip"><b className="r">28.4</b> Weak</span>
              </div>
            </div>
          </div>

          <p className="score-note reveal">
            Higher score = stronger insider conviction — even if the share price is falling.
            Scores update continuously as new Form 4 filings arrive.
          </p>
        </div>
      </section>

      {/* ================= LIVE FEED + CLOSING CTA ================= */}
      <section className="lookup" id="feed">
        <div className="wrap">
          <div
            className="sec-head reveal"
            style={{ textAlign: "center", marginLeft: "auto", marginRight: "auto" }}
          >
            <div className="eyebrow" style={{ justifyContent: "center" }}>
              <span style={{ width: 28, height: 1, background: "var(--ink-soft)" }} />
              Straight from the source
            </div>
            <h2>Insiders are filing right now.</h2>
            <p>
              Every trade below was disclosed to the SEC within two business days of execution.
              The only question is whether you see it in time.
            </p>
          </div>

          <div className="filing reveal" style={{ maxWidth: 680, margin: "0 auto" }}>
            <div className="filing-head">
              <span>
                <span className="live-dot" />
                Latest insider transactions
              </span>
              <span>Form 4 feed</span>
            </div>
            <table>
              <thead>
                <tr><th>Ticker</th><th>Insider</th><th>Code</th><th>Value</th></tr>
              </thead>
              <tbody>
                {shownFeed.map((r, i) => {
                  const isBuy = r.type !== "SELL";
                  return (
                    <tr key={r.id} className={i === 0 && isBuy ? "hi" : undefined}>
                      <td className="tick">{r.ticker || "—"}</td>
                      <td>{r.rawTitle || r.role || r.insiderName}</td>
                      <td>
                        <span className={`code ${isBuy ? "p" : "s"}`}>
                          {isBuy ? "P — Purchase" : "S — Sale"}
                        </span>
                      </td>
                      <td className="amt">{fmtMoney(Number(r.totalValue) || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="filing-foot">
              Illustrative data · Filed within 2 business days of trade, per SEC rules
            </div>
          </div>

          <div className="reveal" style={{ textAlign: "center", marginTop: 40 }}>
            <a className="btn big" href="#lookup">
              Check your stock&apos;s Insider Score →
            </a>
            <p className="fineprint" style={{ marginTop: 14 }}>
              Free report by email or SMS · No card required
            </p>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap foot">
          <span>© 2026 Insider Buying. For informational purposes only — not investment advice.</span>
          <span className="mono">Data source: SEC EDGAR Form 4 filings</span>
        </div>
      </footer>
    </div>
  );
}
