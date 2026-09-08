import Link from "next/link";
import { PRESS_PACKAGES } from "@/lib/press-config";

export const metadata = {
  title: "Money Back Guarantee — Press Publishing | InsiderBuying.com",
  description: "What the InsiderBuying.com press-publishing money-back guarantee covers, what qualifies, and the refund window.",
};

/**
 * Brief v3 §7: "the words link to a written guarantee-terms page (what
 * qualifies, refund window). The page must exist before launch." The wording
 * is the operational draft for George to approve (§8 owner: George); the
 * structure — qualifying conditions, exclusions, window, how to claim — is
 * what the page must carry regardless of final wording.
 */
export default function GuaranteePage() {
  return (
    <main className="b2b3-doc">
      <div className="b2b3-doc-in">
        <p className="b2b3-kicker">Press Publishing · Terms</p>
        <h1>Money Back Guarantee</h1>
        <p className="b2b3-doc-lead">
          Every press-publishing package is a one-time payment backed by this guarantee. It is written so
          there is no ambiguity about what qualifies.
        </p>
        <h2>What the guarantee covers</h2>
        <p>
          If InsiderBuying.com does not publish your approved release within the delivery window stated on
          the package you purchased ({PRESS_PACKAGES.map((p) => p.name).join(" or ")}), you receive a full
          refund of the package price. The delivery window starts when you approve the final copy.
        </p>
        <h2>What qualifies</h2>
        <ul>
          <li>The intake form was completed and, if you chose to supply it, the press kit was provided.</li>
          <li>The release was approved by you in the review step.</li>
          <li>Publication on the network and on InsiderBuying.com did not occur within the delivery window.</li>
        </ul>
        <h2>What does not qualify</h2>
        <ul>
          <li>Delays caused by pending approval, unanswered review requests or missing materials on your side.</li>
          <li>Content that cannot be published because it does not meet outlet editorial standards or securities-law disclosure requirements, after we have told you what needs to change.</li>
          <li>Dissatisfaction with traffic, rankings, share price or investor response. We publish the story; we do not guarantee outcomes.</li>
          <li>Changes requested after publication.</li>
        </ul>
        <h2>Refund window</h2>
        <p>
          Claims must be made within 30 days of your purchase date. Approved refunds are returned to the
          original payment method through Stripe, normally within 5–10 business days.
        </p>
        <h2>How to claim</h2>
        <p>
          Reply to your order confirmation email, or write to info@insiderbuying.com with your order
          reference. We confirm receipt within one business day.
        </p>
        <h2>Disclosure</h2>
        <p>
          Published pieces are labeled as sponsored or paid distribution according to each outlet&rsquo;s
          rules and our disclosure policy. Paid placement never affects Insider Scores or editorial
          rankings on InsiderBuying.com.
        </p>
        <p className="b2b3-doc-foot">
          <Link href="/press">← Back to press publishing</Link> · <Link href="/terms">Terms</Link> ·{" "}
          <Link href="/privacy">Privacy</Link> · <Link href="/disclaimer">Disclaimer</Link>
        </p>
      </div>
      <style>{DOC_CSS}</style>
    </main>
  );
}

const DOC_CSS = `
.b2b3-doc { min-height: 100vh; background: #F7F9FC; color: #0A1E3C; font-family: var(--b2b-body), system-ui, sans-serif; padding: 56px 20px 80px; }
.b2b3-doc-in { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #E3E8F0; border-radius: 16px; padding: 40px 36px; }
.b2b3-kicker { font-family: var(--b2b-mono), monospace; font-size: 12px; letter-spacing: 1.6px; text-transform: uppercase; color: #C9A227; font-weight: 600; margin: 0 0 10px; }
.b2b3-doc h1 { font-family: var(--b2b-display), sans-serif; font-weight: 800; font-size: 34px; margin: 0 0 12px; letter-spacing: -0.5px; }
.b2b3-doc h2 { font-family: var(--b2b-display), sans-serif; font-weight: 700; font-size: 19px; margin: 26px 0 8px; }
.b2b3-doc p, .b2b3-doc li { font-size: 15.5px; line-height: 1.65; color: #2B3A4F; }
.b2b3-doc-lead { font-size: 17px !important; color: #0A1E3C !important; }
.b2b3-doc ul { padding-left: 20px; margin: 0; }
.b2b3-doc-foot { margin-top: 32px; font-size: 13.5px !important; }
.b2b3-doc a { color: #0E9F6E; font-weight: 700; text-decoration: none; }
`;
