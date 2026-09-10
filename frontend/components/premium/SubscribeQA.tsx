"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Subscribe-page Q&A assistant.
 *
 * George (call, 2026-09-10, video 2 at 00:53–01:37): "We should do a chat, we
 * should do an AI chat assistant on this page, and they should answer things
 * like preset questions like — what is the subscription? What does it include?
 * Why do I need this? Stuff like that."
 *
 * Deliberately NOT an LLM (Faizan, 2026-09-10: "ap ai kyun use kr rahy, fixed
 * question honga or unke fixed ans"). The questions are a fixed list and every
 * answer is written copy, which means: no API cost, no credit dependency, no
 * latency, and — on the one page whose whole job is to state the offer
 * correctly — no chance of a generated answer inventing a price or a promise.
 * The site's LLM widget (components/chat/ChatWidget) stays for research pages.
 *
 * Every answer traces to something already on this page (the plan feature
 * lists, the benefits grid, the FAQ, the compliance line), so the panel and the
 * page can never contradict each other. Prices are passed in from the live
 * Stripe amounts rather than typed here, for the same reason the plan cards
 * never hardcode a figure.
 */

export interface SubscribeQAProps {
  /** Live Stripe price for the monthly plan, e.g. "$39.99". */
  monthlyPrice?: string | null;
  /** Live Stripe price for the annual plan, e.g. "$199". */
  annualPrice?: string | null;
}

interface QA {
  q: string;
  /** Rendered as paragraphs; a leading "- " marks a bullet. */
  a: (p: SubscribeQAProps) => string[];
}

const QAS: QA[] = [
  {
    q: "What is the subscription?",
    a: () => [
      "It's called All-In Access — one membership that unlocks everything on Insider Buying.",
      "That means the full Insider Scores and Insider ROI, the ranked lists counted down to #1, top-analyst track records and upside ratings, congressional trades, government contracts, and real-time insider alerts.",
      "Monthly and annual are the same subscription. Only the billing differs.",
    ],
  },
  {
    q: "What does it include?",
    a: () => [
      "Six things, all included on either plan:",
      "- Insider Scores — a 0–100 score on every company with qualifying open-market buys, with the pillars behind it.",
      "- Top Insider Buys — every purchase graded A+ to F as the Form 4 lands: size, stake growth, buyer record, timing.",
      "- Top Analysts & Insiders — people ranked by measured results: analyst success rates and insider track-record accuracy.",
      "- Insider alerts — summarized email alerts on the CEO, CFO and $1M+ buys that matter.",
      "- Congress & contracts — House and Senate trades and government contract awards, side by side with the insiders.",
      "- Bubbles & heat maps — the whole tape in one picture: insider bubbles, congress bubbles and sector flow.",
    ],
  },
  {
    q: "Why do I need this?",
    a: () => [
      "Because the raw filings are public but unusable. Thousands of Form 4s land every month, and reading them one by one tells you nothing about which buys are unusual.",
      "This does that work for you: every qualifying open-market buy is scored 0–100, each purchase is graded A+ to F as the filing lands, the buyers themselves are ranked by their measured track record, and the CEO, CFO and $1M+ buys come to you by email.",
      "It is a research tool, not a tip service — nothing here is a recommendation to buy or sell any security.",
    ],
  },
  {
    q: "How much does it cost?",
    a: (p) => {
      const annual = p.annualPrice ? `${p.annualPrice} per year` : "the annual price";
      const monthly = p.monthlyPrice ? `${p.monthlyPrice} per month` : "the monthly price";
      return [
        `Two paid options: ${annual}, or ${monthly}. Annual is the better value — you pay once and keep the same access.`,
        "There is also a free account at $0 forever if you want to look around first.",
        "Payment is handled by Stripe, and there's a 30-day money-back guarantee on your first payment.",
      ];
    },
  },
  {
    q: "What is an Insider Score?",
    a: () => [
      "A single 0–100 number that says how strong the insider buying at a company looks right now.",
      "It's built from four factors: how much was purchased, whether several insiders bought together, how senior the buyers are, and how much each one grew their own stake.",
      "Members see the score on every covered company along with the pillars behind it, so you can see why it is high or low rather than just taking the number.",
    ],
  },
  {
    q: "What do the insider alerts send me?",
    a: () => [
      "Summarized email alerts on the buys that actually matter — CEO and CFO purchases, and open-market buys over $1M.",
      "Filings are ingested continuously through the trading day and qualifying buys hit the feed as they are processed.",
      "One thing worth knowing: insiders themselves get two business days to file a Form 4 after they trade. That filing deadline, not our pipeline, sets how quickly any buy can become public.",
    ],
  },
  {
    q: "What do I get for free?",
    a: () => [
      "A free account gets market data, movers and heatmaps, the stock pages and charts, a preview of the rankings, and the insider alerts newsletter.",
      "What's held back for members: the Insider Scores and Insider ROI figures, and the ranked lists past the first few rows.",
    ],
  },
  {
    q: "Can I cancel anytime?",
    a: () => [
      "Yes. Subscriptions are handled by Stripe and can be cancelled in one click from your account.",
      "You keep access until the end of the period you've already paid for, and there's a 30-day money-back guarantee on a first payment.",
    ],
  },
  {
    q: "Where does the data come from?",
    a: () => [
      "Insider activity is parsed first-hand from SEC Form 4 filings.",
      "Market data, analyst ratings and fundamentals come from licensed market-data providers, and congressional trades come from the official House and Senate disclosures.",
    ],
  },
];

interface Turn {
  id: number;
  q: string;
  a: string[];
  /** True while the three-dot indicator stands in for the answer. */
  typing: boolean;
}

/** How long the dots run before the answer lands. Scaled to the length of the
 *  answer so a one-liner doesn't sit behind the same pause as a six-bullet
 *  list, and clamped so nobody ever waits on it. */
function typingDelay(a: string[]): number {
  return Math.min(1000, 380 + a.join(" ").length * 1.7);
}

export function SubscribeQA(props: SubscribeQAProps) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const turnRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const asked = new Set(turns.map((t) => t.q));
  const remaining = QAS.filter((qa) => !asked.has(qa.q));

  // Bring the NEW QUESTION to the top of the panel, so its answer is read from
  // the first line down. Scrolling to the bottom (the usual chat reflex) put
  // long answers on screen already scrolled past their own opening.
  // Keyed on turns.length alone: when the dots are replaced by the answer the
  // content grows *below* this point, and the view must not jump again.
  useEffect(() => {
    if (turns.length === 0) return;
    const box = scrollRef.current;
    const el = turnRefs.current.get(turns[turns.length - 1].id);
    if (!box || !el) return;
    // Measured rather than derived from the container's padding, so the offset
    // stays correct if that padding ever changes.
    const delta = el.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTo({ top: Math.max(0, box.scrollTop + delta - 10), behavior: "smooth" });
  }, [turns.length]);

  // Escape closes; the launcher is the only other way in or out.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // A pending answer must not land after the component is gone.
  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  function ask(qa: QA) {
    const answer = qa.a(props);
    setTurns((prev) => {
      const id = prev.length ? prev[prev.length - 1].id + 1 : 0;
      const t = setTimeout(() => {
        setTurns((cur) =>
          cur.map((x) => (x.id === id ? { ...x, typing: false } : x)),
        );
      }, typingDelay(answer));
      timers.current.push(t);
      return [...prev, { id, q: qa.q, a: answer, typing: true }];
    });
  }

  function reset() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    turnRefs.current.clear();
    setTurns([]);
  }

  return (
    <div className="sqa">
      {!open && (
        <button
          type="button"
          className="sqa-launcher"
          onClick={() => setOpen(true)}
          aria-label="Open questions about the membership"
        >
          {/* Speech bubble with three dots — the same three dots the answer
              types with. Drawn as one closed outline plus the dots so it stays
              legible at 18px and follows the button's text colour on hover. */}
          <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
            <path
              d="M5 4.5 H19 A2.5 2.5 0 0 1 21.5 7 V13.5 A2.5 2.5 0 0 1 19 16 H12.4 L8.6 19.4 V16 H5 A2.5 2.5 0 0 1 2.5 13.5 V7 A2.5 2.5 0 0 1 5 4.5 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <circle cx="8.4" cy="10.3" r="1.05" fill="currentColor" />
            <circle cx="12" cy="10.3" r="1.05" fill="currentColor" />
            <circle cx="15.6" cy="10.3" r="1.05" fill="currentColor" />
          </svg>
          <span>Questions?</span>
        </button>
      )}

      {open && (
        <div className="sqa-panel" role="dialog" aria-label="Membership questions">
          <div className="sqa-head">
            <div className="sqa-title">Membership questions</div>
            <div className="sqa-head-actions">
              {turns.length > 0 && (
                <button type="button" className="sqa-reset" onClick={reset}>
                  Start over
                </button>
              )}
              <button
                type="button"
                className="sqa-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="sqa-scroll" ref={scrollRef}>
            {turns.map((t) => (
              <div
                key={t.id}
                ref={(el) => {
                  turnRefs.current.set(t.id, el);
                }}
              >
                <div className="sqa-bubble sqa-user">{t.q}</div>
                {t.typing ? (
                  <div
                    className="sqa-bubble sqa-bot sqa-typing"
                    role="status"
                    aria-label="Typing"
                  >
                    <span className="sqa-tdot" />
                    <span className="sqa-tdot" />
                    <span className="sqa-tdot" />
                  </div>
                ) : (
                  <div className="sqa-bubble sqa-bot sqa-answer">
                    {t.a.map((line, i) =>
                      line.startsWith("- ") ? (
                        <div
                          key={i}
                          className="sqa-li"
                          style={{ animationDelay: `${i * 45}ms` }}
                        >
                          <span className="sqa-dot" aria-hidden="true" />
                          <span>{line.slice(2)}</span>
                        </div>
                      ) : (
                        <p key={i} style={{ animationDelay: `${i * 45}ms` }}>
                          {line}
                        </p>
                      ),
                    )}
                  </div>
                )}
              </div>
            ))}

            {remaining.length > 0 ? (
              <div className="sqa-chips">
                {turns.length > 0 && (
                  <div className="sqa-chips-label">Ask something else</div>
                )}
                {remaining.map((qa, i) => (
                  <button
                    key={qa.q}
                    type="button"
                    className="sqa-chip"
                    style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                    onClick={() => ask(qa)}
                  >
                    {qa.q}
                  </button>
                ))}
              </div>
            ) : (
              <div className="sqa-done">
                That's everything I have. Still stuck?{" "}
                <a href="/contact">Contact us</a> and a person will answer.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* Colours come from the .biv scope's own tokens (--ink/--dim/--bg/--bg2/--line/
   --brand), which the page already redefines for light mode — so this panel
   follows the theme with no media query and no fallback guessing of its own.
   An earlier pass used --soft/--mute/--border, which are not defined anywhere:
   the fallbacks resolved to dark-theme greys and rendered near-invisible on the
   white light-mode panel. Layered at z-index 45 so the login (z-50) and
   thank-you (z-70) modals still come out on top. */
export const SUBSCRIBE_QA_CSS = `
.sqa-launcher {
  position: fixed; right: 20px; bottom: 20px; z-index: 45;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 11px 17px; border-radius: 999px; cursor: pointer;
  font-weight: 700; font-size: 14px; line-height: 1;
  color: var(--brand-ink); background: var(--brand);
  border: 1px solid var(--line);
  box-shadow: 0 10px 30px rgba(8,20,38,0.28);
  transition: transform .18s ease, box-shadow .18s ease, background .18s ease, color .18s ease;
}
.sqa-launcher:hover {
  transform: translateY(-2px); box-shadow: 0 14px 36px rgba(8,20,38,0.36);
  background: var(--hover-fill); color: var(--hover-ink);
}

.sqa-panel {
  position: fixed; right: 20px; bottom: 20px; z-index: 45;
  width: min(390px, calc(100vw - 32px));
  max-height: min(560px, calc(100vh - 40px));
  display: flex; flex-direction: column; overflow: hidden;
  border-radius: 16px; background: var(--bg2);
  border: 1px solid var(--line);
  box-shadow: 0 24px 60px rgba(4,12,26,0.32);
  transform-origin: 100% 100%;
  animation: sqa-pop .3s cubic-bezier(.22,1,.36,1) both;
}
.sqa-head {
  position: relative;
  display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
  padding: 14px 14px 12px; border-bottom: 1px solid var(--line); flex-shrink: 0;
}
/* Thin brand sweep along the header's edge — the one "futuristic" flourish,
   and the only moving thing once an answer has settled. */
.sqa-head::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 1px;
  background: linear-gradient(90deg, transparent, var(--brand), transparent);
  background-size: 50% 100%; background-repeat: no-repeat;
  animation: sqa-sweep 4.5s ease-in-out infinite;
  opacity: .75;
}
.sqa-title { font-weight: 800; font-size: 15px; color: var(--ink); }
.sqa-head-actions { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }
.sqa-reset, .sqa-close {
  background: none; border: none; cursor: pointer; color: var(--dim);
  font-weight: 600; font-size: 11.5px; line-height: 1; padding: 5px 7px; border-radius: 7px;
}
.sqa-reset:hover, .sqa-close:hover { color: var(--ink); background: var(--bg); }

.sqa-scroll {
  position: relative; overflow-y: auto; padding: 14px;
  display: flex; flex-direction: column; gap: 10px;
  scrollbar-width: thin;
}

.sqa-bubble { font-size: 13.5px; line-height: 1.55; border-radius: 12px; padding: 10px 13px; }
.sqa-bubble p { margin: 0 0 7px; }
.sqa-bubble p:last-child { margin-bottom: 0; }
.sqa-bot {
  color: var(--ink); background: var(--bg);
  border: 1px solid var(--line); border-bottom-left-radius: 4px;
}
.sqa-user {
  color: var(--brand-ink); background: var(--brand); font-weight: 600;
  border-bottom-right-radius: 4px; margin: 6px 0 8px auto; max-width: 85%;
  animation: sqa-rise .26s cubic-bezier(.22,1,.36,1) both;
}
.sqa-answer, .sqa-typing { animation: sqa-rise .28s cubic-bezier(.22,1,.36,1) both; }
/* Each line fades in just behind the one above it, so a long answer reads as
   it arrives instead of appearing as a wall. */
.sqa-answer p, .sqa-answer .sqa-li { animation: sqa-line .32s ease-out both; }

.sqa-li { display: flex; gap: 8px; margin: 0 0 6px; }
.sqa-li:last-child { margin-bottom: 0; }
.sqa-dot {
  width: 5px; height: 5px; border-radius: 50%; margin-top: 7px; flex-shrink: 0;
  background: var(--green-hi);
}

/* Three-dot typing indicator. */
.sqa-typing { display: inline-flex; align-items: center; gap: 5px; width: fit-content; padding: 13px; }
.sqa-tdot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--brand);
  animation: sqa-bounce 1.25s ease-in-out infinite;
}
.sqa-tdot:nth-child(2) { animation-delay: .16s; }
.sqa-tdot:nth-child(3) { animation-delay: .32s; }

.sqa-chips { display: flex; flex-direction: column; gap: 6px; padding-top: 4px; }
.sqa-chips-label {
  font-weight: 800; font-size: 10px; line-height: 1; letter-spacing: .09em;
  text-transform: uppercase; color: var(--dim); margin-bottom: 2px;
}
.sqa-chip {
  text-align: left; cursor: pointer; font-size: 13px; padding: 9px 12px; border-radius: 10px;
  color: var(--ink); background: var(--bg); border: 1px solid var(--line);
  transition: color .15s ease, border-color .15s ease, transform .15s ease;
  animation: sqa-line .3s ease-out both;
}
.sqa-chip:hover { color: var(--brand); border-color: var(--brand); transform: translateX(2px); }

.sqa-done { font-size: 12.5px; color: var(--dim); padding: 4px 2px; }
.sqa-done a { color: var(--brand); font-weight: 700; }

@keyframes sqa-pop {
  from { opacity: 0; transform: translateY(14px) scale(.96); }
  to   { opacity: 1; transform: none; }
}
@keyframes sqa-rise {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}
@keyframes sqa-line {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: none; }
}
@keyframes sqa-bounce {
  0%, 70%, 100% { transform: translateY(0); opacity: .4; }
  35%           { transform: translateY(-5px); opacity: 1; }
}
@keyframes sqa-sweep {
  0%   { background-position: -60% 0; }
  100% { background-position: 160% 0; }
}

@media (max-width: 480px) {
  .sqa-panel { right: 12px; left: 12px; bottom: 12px; width: auto; max-height: calc(100vh - 24px); }
  .sqa-launcher { right: 14px; bottom: 14px; }
}

/* Anyone who has asked the system to stop moving things gets the panel with no
   motion at all — the dots simply hold still while the answer is pending. */
@media (prefers-reduced-motion: reduce) {
  .sqa-panel, .sqa-user, .sqa-answer, .sqa-typing,
  .sqa-answer p, .sqa-answer .sqa-li, .sqa-chip { animation: none; }
  .sqa-head::after { animation: none; background-position: 50% 0; }
  .sqa-tdot { animation: none; opacity: .55; }
  .sqa-launcher:hover, .sqa-chip:hover { transform: none; }
}
`;
