/**
 * The four SMS mockups from the brief (Section 3C), in a phone-style visual —
 * "to demonstrate the product before purchase". The message text is verbatim,
 * including the sender label "InsiderBuying" above each one.
 */
const MESSAGES = [
  "InsiderBuying.com: ALERT — 3 insiders at $AAPL bought a combined $4.2M in the last 8 days. IQS Score: 89/99. This is a cluster buy — the rarest and strongest insider signal. Full details: insiderbuying.com/AAPL",
  "InsiderBuying.com: ALERT — The CEO of $TSLA just made his FIRST-EVER open-market stock purchase. $1.8M. IQS Score: 94/99. New positions by CEOs are one of the highest-conviction signals we track. insiderbuying.com/TSLA",
  "InsiderBuying.com: WATCH — Insiders at $CVX bought $3.1M of stock 18 days before earnings. Same pattern preceded their last 3 strong quarters. IQS: 82/99. Earnings in 18 days. insiderbuying.com/CVX",
  "InsiderBuying.com: UPDATE — No insider buying at $NFLX in 90 days. IQS Score dropped to 41/99 (was 73). When insiders go quiet after heavy buying, it can signal the thesis is resolved. Details: insiderbuying.com/NFLX",
];

export function PhoneFrame() {
  return (
    <div className="pf-wrap">
      <div className="pf-phone">
        <div className="pf-notch" aria-hidden />
        <div className="pf-screen">
          {MESSAGES.map((m) => (
            <div className="pf-msg" key={m}>
              <div className="pf-sender">InsiderBuying</div>
              <div className="pf-bubble">{m}</div>
            </div>
          ))}
        </div>
      </div>
      <p className="pf-caption">Example alerts. Delivered by SMS to subscribers.</p>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.pf-wrap { display: flex; flex-direction: column; align-items: center; }
.pf-phone {
  width: 100%; max-width: 320px; border-radius: 34px; padding: 12px 10px 16px;
  background: #0D1F35; border: 8px solid #111a28;
  box-shadow: 0 26px 60px rgba(6,12,24,0.32);
}
.pf-notch { width: 88px; height: 5px; border-radius: 999px; background: rgba(255,255,255,0.28); margin: 2px auto 12px; }
.pf-screen { display: flex; flex-direction: column; gap: 14px; max-height: 470px; overflow-y: auto; padding: 0 4px 2px; }
.pf-msg { display: flex; flex-direction: column; gap: 4px; }
.pf-sender { font-size: 10px; letter-spacing: 0.7px; text-transform: uppercase; color: #8fa0b6; padding-left: 6px; }
.pf-bubble {
  background: #1d2f47; color: #e7edf5; font-size: 12px; line-height: 1.5;
  padding: 10px 12px; border-radius: 14px 14px 14px 4px; word-break: break-word;
}
.pf-caption { font-size: 11.5px; color: var(--text-mute); margin-top: 12px; text-align: center; }
`;
